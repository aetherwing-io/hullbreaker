"""RIG v3.1 PREVIEW -- one command (T-124 phase 1b, decisions entry 28).

    nice -n 15 /opt/hb-art/bin/python -I tools/art/build_rig_v31_preview.py [--scene <scene dir>] [--keep]
    options: --build <dir> (default tools/art/build/rig-v31, git-ignored), --out <dir> (packet,
             default reports/tasks/T-124), --skip-fetch

The look only: gun R, the preview poses in tools/art/rig/poses_v31.py, both
holds (A = today's bore, B = a render-only mock with the bore raised to the
shoulder). Nothing is packed into atlases and nothing ships: the full
inventory waits for the operator's yes on the look (entry 28).
  1. SOURCES  CC0 archives sha256-checked (tools/art/spike/fetch_cc0.py).
  2. SIM      muzzleY / barrelTiles / RIG_RECOIL_TILES re-read from src/;
              the build refuses to run if they moved.
  3. PALETTE  board_palette.measure_b01() re-measures board 01's marine; every
              swatch in rig/palette_v31.py must equal its cluster (hex and
              coordinates), and every v3.1 colour must sit in a palette role
              band (tools/assets/lib/palette.mjs, via node).
  4. RENDER   rig/render.py --look v31 --hold A|B (Cycles CPU, same grid and
              passes as v3).
  5. POST     rig/post.py --look v31 -> d16 / d23 / d35 cells per hold.
  6. CHECK    every cell: the drawn muzzle within 1 px of its exported anchor
              (rig/check.py drawn_end on the part map); hold A's anchors equal
              today's shot origin; hold B's equal its mock bore (flagged mock).
  7. PACKET   with --scene: rig/packet_v31.py (sheets, GIF, measure-v31.json).
"""

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RIG = os.path.join(HERE, 'rig')
sys.path.insert(0, RIG)
PY = sys.executable

import board_palette  # noqa: E402
import check as CK  # noqa: E402
import palette_v31  # noqa: E402
import post as PO  # noqa: E402
import poses_v31 as P31  # noqa: E402

GUN31 = [PO.FAMS31.index(n) for n in ('gun_d', 'gun_m', 'gun_l', 'gun_acc', 'gun_rust')]


def run(cmd, log):
    with open(log, 'w') as fh:
        return subprocess.Popen(cmd, stdout=fh, stderr=subprocess.STDOUT, cwd=ROOT)


def wait_all(procs, what):
    bad = [log for p, log in procs if p.wait() != 0]
    if bad:
        raise SystemExit('%s failed:\n%s' % (what, '\n'.join(log + ':\n' + ''.join(open(log).readlines()[-12:])
                                                           for log in bad)))


def step_sim():
    s = CK.sim_numbers()
    want = {'muzzleY': P31.SIM_MUZZLE_Y, 'barrelTiles': P31.SIM_BARREL, 'recoilTiles': P31.RECOIL_TILES}
    moved = {k: (s[k], want[k]) for k in want if abs(s[k] - want[k]) > 1e-9}
    if moved:
        raise SystemExit('SIM moved (src value, art value): %s -- re-pose tools/art/rig/poses_v31.py' % moved)
    return s


def step_palette():
    res = board_palette.measure_b01()
    found = {}
    for fam, rows in res['families'].items():
        for r in rows:
            found[(fam, r['hex'])] = (r['at']['x'], r['at']['y'])
    bad = ['%s %s %s @%d,%d -> %s' % (n, fam, hx, x, y, found.get((fam, hx)))
           for n, (hx, fam, x, y, _w) in palette_v31.BOARD01.items() if found.get((fam, hx)) != (x, y)]
    if bad:
        raise SystemExit('PALETTE: board 01 swatches no longer match the board:\n  ' + '\n  '.join(bad))
    cols = ['#%02x%02x%02x' % c for c in palette_v31.all_colours()]
    js = ("import { classify } from '%s';\nconst out = [];\nfor (const h of %s) { const r = classify(h); "
          "out.push([h, r.ok, r.roleId]); }\nconsole.log(JSON.stringify(out));\n"
          % (os.path.join(ROOT, 'tools', 'assets', 'lib', 'palette.mjs'), json.dumps(cols)))
    out = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        raise SystemExit('PALETTE: node classify failed: ' + out.stderr[-400:])
    rows = json.loads(out.stdout)
    off = [r for r in rows if not r[1]]
    if off:
        raise SystemExit('PALETTE: colours outside every role band: %s' % off)
    roles = {}
    for h, _ok, role in rows:
        roles.setdefault(role, []).append(h)
    return {'boardSwatches': len(palette_v31.BOARD01), 'colours': len(cols), 'roles': roles,
            'board01': {k: res[k] for k in ('pixels', 'meanLuma', 'medianLuma', 'lumaShares')}}


def step_check(build):
    sim = CK.sim_numbers()
    rows, fails = [], []
    for hold in ('A', 'B'):
        meta = json.load(open(os.path.join(build, 'render-' + hold, 'meta-R.json')))
        sock = P31.HOLDS[hold]['socketY']
        for key, fm in sorted(meta['frames'].items()):
            th = math.radians(fm['aimDeg'])
            want = (math.cos(th) * sim['barrelTiles'], sock + math.sin(th) * sim['barrelTiles'])
            kick = fm.get('recoil', 0.0)
            want_d = (want[0] - kick * math.cos(th), want[1] - kick * math.sin(th))
            m, dm = fm['tiles']['muzzle'], fm['tiles']['drawnMuzzle']
            anchor_err = max(abs(m[0] - want[0]), abs(m[1] - want[1]), abs(dm[0] - want_d[0]), abs(dm[1] - want_d[1]))
            for dn in PO.DENSITY_ORDER:
                ppt = PO.DENSITIES[dn]
                _cw, _ch, ox, oy = PO.cell_geometry(meta, ppt)
                import numpy as np
                parts = np.load(os.path.join(build, 'cells-' + hold, dn, 'R', fm['pose'] + '-parts.npz'))
                end = CK.drawn_end(parts['fam'], (ox + dm[0] * ppt, oy - dm[1] * ppt), fm['aimDeg'], GUN31)
                err = abs(end) if end is not None else None
                row = {'hold': hold, 'density': dn, 'frame': key, 'drawnVsAnchorPx': err, 'anchorErrTiles': anchor_err,
                       'pocketErrTiles': fm['solve'].get('pocketErr'), 'mock': P31.HOLDS[hold]['mock'],
                       'ok': err is not None and err <= CK.TOL_PX and anchor_err <= CK.SIM_TOL}
                rows.append(row)
                if not row['ok']:
                    fails.append(row)
    summary = {}
    for hold in ('A', 'B'):
        for dn in PO.DENSITY_ORDER:
            r = [x for x in rows if x['hold'] == hold and x['density'] == dn]
            errs = [x['drawnVsAnchorPx'] for x in r if x['drawnVsAnchorPx'] is not None]
            summary['%s-%s' % (hold, dn)] = {'frames': len(r), 'fails': sum(1 for x in r if not x['ok']),
                                             'maxDrawnVsAnchorPx': round(max(errs), 3) if errs else None,
                                             'maxAnchorErrTiles': max(x['anchorErrTiles'] for x in r)}
    return {'summary': summary, 'fails': fails, 'sim': sim}, rows


def sha_tree(d):
    h = hashlib.sha256()
    for root, _dirs, files in sorted(os.walk(d)):
        for f in sorted(files):
            if f.endswith('.png'):
                p = os.path.join(root, f)
                h.update(os.path.relpath(p, d).encode())
                h.update(open(p, 'rb').read())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--build', default=os.path.join(HERE, 'build', 'rig-v31'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-124'))
    ap.add_argument('--scene', default='')
    ap.add_argument('--keep', action='store_true')
    ap.add_argument('--skip-fetch', action='store_true')
    args = ap.parse_args()
    t0 = time.time()
    timing = {}
    build = os.path.abspath(args.build)
    if not args.keep and os.path.isdir(build):
        shutil.rmtree(build)
    os.makedirs(build, exist_ok=True)
    t = time.time()
    if not args.skip_fetch:
        r = subprocess.run([PY, '-I', os.path.join(HERE, 'spike', 'fetch_cc0.py')], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit('SOURCES: ' + r.stdout[-600:] + r.stderr[-600:])
    timing['sources'] = round(time.time() - t, 1)
    sim = step_sim()
    pal = step_palette()
    print('sources ok; sim', sim, '; palette', pal['colours'], 'colours in', sorted(pal['roles']), flush=True)

    t = time.time()
    procs = []
    for hold in ('A', 'B'):
        rd = os.path.join(build, 'render-' + hold)
        meta = os.path.join(rd, 'meta-R.json')
        if args.keep and os.path.exists(meta) and not json.load(open(meta)).get('errors'):
            continue
        log = os.path.join(build, 'render-%s.log' % hold)
        procs.append((run([PY, '-I', os.path.join(RIG, 'render.py'), '--out', rd, '--guns', 'R', '--look', 'v31',
                           '--hold', hold], log), log))
    wait_all(procs, 'RENDER')
    timing['render'] = round(time.time() - t, 1)
    t = time.time()
    procs = []
    for hold in ('A', 'B'):
        log = os.path.join(build, 'post-%s.log' % hold)
        procs.append((run([PY, '-I', os.path.join(RIG, 'post.py'), '--look', 'v31', '--src',
                           os.path.join(build, 'render-' + hold), '--out', os.path.join(build, 'cells-' + hold)], log), log))
    wait_all(procs, 'POST')
    timing['post'] = round(time.time() - t, 1)
    t = time.time()
    out, rows = step_check(build)
    with open(os.path.join(build, 'anchor-check.json'), 'w') as fh:
        json.dump({'out': out, 'rows': rows}, fh, indent=1)
    timing['check'] = round(time.time() - t, 1)
    for k, s in out['summary'].items():
        print('check', k, json.dumps(s), flush=True)
    if out['fails']:
        raise SystemExit('ANCHOR CHECK FAILED: %d cells (see %s)' % (len(out['fails']), os.path.join(build, 'anchor-check.json')))
    if args.scene:
        t = time.time()
        r = subprocess.run([PY, '-I', os.path.join(RIG, 'packet_v31.py'), '--scene', args.scene, '--build', build,
                            '--out', args.out], capture_output=True, text=True, cwd=ROOT)
        open(os.path.join(build, 'packet.log'), 'w').write(r.stdout + r.stderr)
        if r.returncode != 0:
            raise SystemExit('PACKET failed:\n' + r.stderr[-1500:])
        timing['packet'] = round(time.time() - t, 1)
    timing['total'] = round(time.time() - t0, 1)
    hashes = {h: sha_tree(os.path.join(build, 'cells-' + h)) for h in ('A', 'B')}
    summary = {'timing_s': timing, 'palette': pal, 'check': out['summary'], 'cellsSha256': hashes,
               'holds': P31.HOLDS}
    with open(os.path.join(build, 'build-summary.json'), 'w') as fh:
        json.dump(summary, fh, indent=1)
    print('cells sha256', json.dumps(hashes))
    print('done', json.dumps(timing), flush=True)


if __name__ == '__main__':
    main()
