"""One command: headless Blender -> pixel sprite sheets with exported anchors.

    /opt/hb-art/bin/python tools/art/build.py             build + check everything
    /opt/hb-art/bin/python tools/art/build.py --falsify   prove the anchor check binds
    /opt/hb-art/bin/python tools/art/build.py --only rig  (or wasp) partial rebuild

Stages, per sheet density (DENSITIES):
  render  tools/art/rig/render.py, tools/art/wasp/render.py   (Blender, Workbench)
  post    tools/art/post.py        ID maps -> palette atlas PNG + anchor JSON
  check   tools/art/check_anchors.py   drawn muzzle / sting vs exported anchor

Shipped outputs land in assets/generated/sprites/art-v2/; intermediates (ID
maps, part atlases, reports) in tools/art/build/ (git-ignored). The build ends
by printing the sha256 of every shipped file so two runs can be compared
byte for byte.

Before rendering it re-reads the simulation's own numbers from src/config.js
(player.muzzleY, player.barrelTiles, crouch.muzzleY): the art is posed around
them, and a sim retune must fail the build rather than silently drift the guns
off the shot origin.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(HERE, 'lib'))
sys.path.insert(0, os.path.join(HERE, 'rig'))

import pose as PZ  # noqa: E402

PY = sys.executable
OUT_DIR = os.path.join(ROOT, 'assets', 'generated', 'sprites', 'art-v2')
BUILD = os.path.join(HERE, 'build')

# Sheet densities, in px per tile:
#  far      desktop FAR at 1280x800: tools/art/capture/current-art.mjs measured
#           18.065 px/tile at RIG's render depth (live camera projection; RIG's
#           2.0-tile visual height = 36.1 CSS px, 4.5% of the height). 18 is
#           used: 1 texel ~= 1 CSS px (0.4% under).
#  phone2x  phone framing (decisions.md entry 20 addendum: RIG ~6% of a 390 px
#           landscape height = 23.4 CSS px) at DPR 2 = 46.8 px for 2.0 tiles.
DENSITIES = {'far': 18.0, 'phone2x': 23.4}


def sim_constants():
    src = open(os.path.join(ROOT, 'src', 'config.js'), encoding='utf-8').read()
    player = src[src.index('\n  player: {'):]
    crouch = src[src.index('\n  crouch: {'):]
    m1 = float(re.search(r'muzzleY:\s*([0-9.]+)', player).group(1))
    m2 = float(re.search(r'barrelTiles:\s*([0-9.]+)', player).group(1))
    m3 = float(re.search(r'muzzleY:\s*([0-9.]+)', crouch).group(1))
    return {'muzzleY': m1, 'barrelTiles': m2, 'crouchMuzzleY': m3}


def run(cmd, label, timings):
    t0 = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    dt = time.time() - t0
    timings.append((label, round(dt, 2)))
    lines = [ln for ln in (p.stdout + p.stderr).splitlines()
             if ln.strip() and 'EGL' not in ln and 'Saved:' not in ln]
    return p.returncode, lines


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


def build_kind(kind, density_name, density, timings, results, offset=None, out_dir=None, tag=''):
    rdir = os.path.join(BUILD, 'render', '%s-%s%s' % (kind, density_name, tag))
    script = os.path.join(HERE, kind, 'render.py')
    cmd = [PY, script, '--out', rdir, '--density', str(density)]
    if offset:
        cmd += offset
    rc, lines = run(cmd, 'render %s %s%s' % (kind, density_name, tag), timings)
    if rc:
        raise SystemExit('render failed:\n' + '\n'.join(lines[-20:]))
    render_timing = json.loads(lines[-1])
    name = '%s-v2-%s' % (kind, density_name)
    dest = out_dir or OUT_DIR
    os.makedirs(dest, exist_ok=True)
    png = os.path.join(dest, name + '.png')
    js = os.path.join(dest, name + '.json')
    ids = os.path.join(BUILD, 'parts', name + tag + '.npz')
    os.makedirs(os.path.dirname(ids), exist_ok=True)
    rc, lines = run([PY, os.path.join(HERE, 'post.py'), '--kind', kind, '--src', rdir,
                     '--png', png, '--json', js, '--ids', ids, '--name', name],
                    'post %s %s%s' % (kind, density_name, tag), timings)
    if rc:
        raise SystemExit('post failed:\n' + '\n'.join(lines[-20:]))
    report = os.path.join(BUILD, 'reports', 'anchor-check-%s%s.json' % (name, tag))
    os.makedirs(os.path.dirname(report), exist_ok=True)
    rc, lines = run([PY, os.path.join(HERE, 'check_anchors.py'), '--kind', kind, '--json', js,
                     '--png', png, '--ids', ids, '--report', report],
                    'check %s %s%s' % (kind, density_name, tag), timings)
    summary = json.loads(lines[-1])
    results[name + tag] = {'render': render_timing, 'check': summary, 'check_exit': rc,
                           'png': png, 'json': js}
    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--falsify', action='store_true',
                    help='render gun S with its mesh 0.1 tiles down the barrel (empties untouched) '
                         'into tools/art/build/falsify and require the anchor check to FAIL on S only')
    ap.add_argument('--only', default='', choices=['', 'rig', 'wasp'])
    args = ap.parse_args()
    t_all = time.time()
    timings, results = [], {}

    sim = sim_constants()
    want = {'muzzleY': PZ.SIM_MUZZLE_Y, 'barrelTiles': PZ.SIM_BARREL, 'crouchMuzzleY': PZ.CROUCH_MUZZLE_Y}
    if sim != want:
        raise SystemExit('src/config.js sim constants %s differ from the pose solver %s: '
                         're-pose the art around the new shot origin' % (sim, want))

    if args.falsify:
        fdir = os.path.join(BUILD, 'falsify')
        rc = build_kind('rig', 'far', DENSITIES['far'], timings, results,
                        offset=['--offset-gun', 'S:0.1'], out_dir=fdir, tag='-falsify-S')
        rc2 = build_kind('wasp', 'far', DENSITIES['far'], timings, results,
                         offset=['--offset-sting', '0.1'], out_dir=fdir, tag='-falsify-sting')
        rig_sum = results['rig-v2-far-falsify-S']['check']
        wasp_sum = results['wasp-v2-far-falsify-sting']['check']
        failing = rig_sum['failing_frames']
        only_s = all(f.startswith('S:') for f in failing) and rig_sum['failures'] > 0
        out = {'rig_offset_S_0.1_tiles': {'exit': rc, 'failures': rig_sum['failures'],
                                          'max_error_px_per_gun': rig_sum['max_error_px_per_gun'],
                                          'all_failures_are_gun_S': only_s},
               'wasp_offset_sting_0.1_tiles': {'exit': rc2, 'failures': wasp_sum['failures'],
                                               'max_error_px': wasp_sum['max_error_px']},
               'timings_s': timings}
        print(json.dumps(out, indent=1))
        ok = rc != 0 and only_s and rc2 != 0
        print('FALSIFICATION %s: the anchor check %s on the offset meshes' %
              ('CONFIRMED' if ok else 'NOT CONFIRMED', 'fails' if ok else 'did not fail as required'))
        sys.exit(0 if ok else 1)

    kinds = [args.only] if args.only else ['rig', 'wasp']
    failed = 0
    for kind in kinds:
        for dname, dens in DENSITIES.items():
            failed += 1 if build_kind(kind, dname, dens, timings, results) else 0

    hashes = {}
    for f in sorted(os.listdir(OUT_DIR)):
        hashes[f] = sha256(os.path.join(OUT_DIR, f))
    total = round(time.time() - t_all, 1)
    frames = sum(r['render']['frames'] for r in results.values())
    summary = {
        'total_build_s': total,
        'frames_rendered': frames,
        'per_sheet': {k: {'frames': v['render']['frames'],
                          'render_ms_mean': v['render']['render_ms_mean'],
                          'render_ms_max': v['render']['render_ms_max'],
                          'render_stage_s': v['render']['total_s'],
                          'anchor_max_error_px': v['check']['max_error_px'],
                          'anchor_failures': v['check']['failures'],
                          'shipped_vs_part_mismatch': v['check']['shipped_vs_part_mismatched_pixels'],
                          **({'anchor_vs_sim_max_px': v['check']['max_anchor_vs_sim_px']}
                             if 'max_anchor_vs_sim_px' in v['check'] else {})}
                      for k, v in results.items()},
        'stage_timings_s': timings,
        'sha256': hashes,
    }
    os.makedirs(BUILD, exist_ok=True)
    with open(os.path.join(BUILD, 'build-summary.json'), 'w') as fh:
        json.dump(summary, fh, indent=1, sort_keys=True)
        fh.write('\n')
    print(json.dumps(summary, indent=1, sort_keys=True))
    if failed:
        print('ANCHOR CHECK FAILED on %d sheet(s)' % failed)
        sys.exit(1)
    print('OK: %d frames, every drawn muzzle/sting within 1 px of its exported anchor' % frames)


if __name__ == '__main__':
    main()
