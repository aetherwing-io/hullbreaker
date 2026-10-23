"""RIG v3 -- ONE command builds every shipped file (T-124).

    /opt/hb-art/bin/python -I tools/art/build_rig_v3.py                # sources -> render -> post -> pack -> check
    /opt/hb-art/bin/python -I tools/art/build_rig_v3.py --falsify S    # + the anchor check's negative control
    options: --jobs N (parallel Blender/post processes, default 2), --build <dir> (default
             tools/art/build/rig-v3, git-ignored), --out <dir> (default assets/generated/sprites),
             --keep (reuse finished renders in --build instead of starting clean)

Run every heavy step under `nice -n 15` on a shared host. Steps:
  1. SOURCES  tools/art/spike/fetch_cc0.py: CC0 archives sha256-checked against
              tools/art/spike/cc0.json (HB_ART_CC0 overrides where they live).
  2. SIM      CONFIG.player.muzzleY / barrelTiles, CONFIG.crouch.muzzleY and
              RIG_RECOIL_TILES re-read from src/; the build refuses to run if
              they moved: every gun is posed around them (rig/poses.py).
  3. PALETTE  rig/board_palette.py re-measures the concept boards; every board
              swatch in rig/palette_v3.py must equal its cluster (hex and
              coordinates), and every colour a cell can contain must sit in a
              palette role band (tools/assets/lib/palette.mjs, via node).
  4. RENDER   rig/render.py (headless Blender, Cycles CPU): 71 poses x 5 guns,
              three data passes each, one supersampled grid.
  5. POST     rig/post.py: each frame reduced to d16 / d23 / d35 cells.
  6. PACK     rig/pack.py: rig-v3-d16.png, rig-v3-d23.png, rig-v3-d35.png (indexed,
              no metadata) + rig-v3.json into --out.
  7. CHECK    rig/check.py on the shipped files: part map == pixels, drawn
              muzzle within 1 px of its anchor, anchors == the sim's shot origin.
  8. --falsify <gun>: that gun re-rendered with its mesh 0.15 tiles down the
              bore (anchors unmoved), posted, packed beside the honest cells of
              the other guns into <build>/falsify/, checked with --expect-fail:
              CONFIRMED only when exactly that gun's frames fail.
Prints the sha256 of every output; two clean builds on this host give the same
hashes (reports/tasks/T-124/build.md).
"""

import argparse
import hashlib
import json
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
import palette_v3  # noqa: E402
import poses as P  # noqa: E402

GROUPS = {1: ['R,S,L,H,F'], 2: ['R,S,L', 'H,F'], 3: ['R,S', 'L,H', 'F'], 5: ['R', 'S', 'L', 'H', 'F']}


def run(cmd, log):
    with open(log, 'w') as fh:
        return subprocess.Popen(cmd, stdout=fh, stderr=subprocess.STDOUT, cwd=ROOT)


def wait_all(procs, what):
    bad = []
    for p, log in procs:
        if p.wait() != 0:
            bad.append(log)
    if bad:
        tails = []
        for log in bad:
            with open(log) as fh:
                tails.append(log + ':\n' + ''.join(fh.readlines()[-12:]))
        raise SystemExit('%s failed:\n%s' % (what, '\n'.join(tails)))


def step_sim():
    s = CK.sim_numbers()
    want = {'muzzleY': P.SIM_MUZZLE_Y, 'barrelTiles': P.SIM_BARREL, 'crouchMuzzleY': P.CROUCH_MUZZLE_Y,
            'recoilTiles': P.RECOIL_TILES}
    moved = {k: (s[k], want[k]) for k in want if abs(s[k] - want[k]) > 1e-9}
    if moved:
        raise SystemExit('SIM moved (src value, art value): %s -- re-pose the art (tools/art/rig/poses.py)' % moved)
    return s


def step_palette():
    res = board_palette.measure()
    found = {}
    for group in res['swatches'].values():
        for row in group:
            found[row['hex']] = row['at']
    bad = []
    for name, (hx, board, x, y, _what) in palette_v3.BOARD.items():
        at = found.get(hx)
        if not at or at['board'][:2] != board or (at['x'], at['y']) != (x, y):
            bad.append('%s %s @%s %d,%d -> %s' % (name, hx, board, x, y, at))
    if bad:
        raise SystemExit('PALETTE: board swatches no longer match the boards:\n  ' + '\n  '.join(bad))
    cols = ['#%02x%02x%02x' % c for c in palette_v3.all_colours()]
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
    return {'boardSwatches': len(palette_v3.BOARD), 'colours': len(cols), 'roles': roles}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--build', default=os.path.join(HERE, 'build', 'rig-v3'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'generated', 'sprites'))
    ap.add_argument('--jobs', type=int, default=2)
    ap.add_argument('--keep', action='store_true')
    ap.add_argument('--falsify', default='')
    ap.add_argument('--skip-fetch', action='store_true')
    args = ap.parse_args()
    t0 = time.time()
    timing = {}
    build = os.path.abspath(args.build)
    render_dir, cells_dir = os.path.join(build, 'render'), os.path.join(build, 'cells')
    if not args.keep and os.path.isdir(build):
        shutil.rmtree(build)
    os.makedirs(build, exist_ok=True)
    groups = GROUPS.get(args.jobs) or GROUPS[2]

    t = time.time()
    if not args.skip_fetch:
        r = subprocess.run([PY, '-I', os.path.join(HERE, 'spike', 'fetch_cc0.py')], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit('SOURCES: ' + r.stdout[-600:] + r.stderr[-600:])
    timing['sources'] = round(time.time() - t, 1)
    sim = step_sim()
    t = time.time()
    pal = step_palette()
    timing['palette'] = round(time.time() - t, 1)
    print('sources ok; sim', sim, '; palette', pal['colours'], 'colours in', sorted(pal['roles']), flush=True)

    t = time.time()
    todo = []
    for g in groups:
        meta = os.path.join(render_dir, 'meta-%s.json' % g.replace(',', '-'))
        if args.keep and os.path.exists(meta) and not json.load(open(meta)).get('errors') and \
                len(json.load(open(meta))['frames']) == len(g.split(',')) * len(P.frame_specs()):
            continue
        todo.append(g)
    procs = [(run([PY, '-I', os.path.join(RIG, 'render.py'), '--out', render_dir, '--guns', g],
                  os.path.join(build, 'render-%s.log' % g.replace(',', '-'))),
              os.path.join(build, 'render-%s.log' % g.replace(',', '-'))) for g in todo]
    wait_all(procs, 'RENDER')
    timing['render'] = round(time.time() - t, 1)
    print('render', timing['render'], 's', flush=True)

    t = time.time()
    procs = []
    for g in groups:
        keys = ','.join(k for k in P.frame_keys(g.split(',')))
        log = os.path.join(build, 'post-%s.log' % g.replace(',', '-'))
        procs.append((run([PY, '-I', os.path.join(RIG, 'post.py'), '--src', render_dir, '--out', cells_dir,
                           '--keys', keys], log), log))
    wait_all(procs, 'POST')
    timing['post'] = round(time.time() - t, 1)
    print('post', timing['post'], 's', flush=True)

    t = time.time()
    import pack as PK
    doc, hashes = PK.pack(render_dir, cells_dir, args.out)
    timing['pack'] = round(time.time() - t, 1)
    t = time.time()
    out, rows = CK.check(args.out, cells_dir)
    with open(os.path.join(build, 'anchor-check.json'), 'w') as fh:
        json.dump({'out': out, 'rows': rows}, fh, indent=1)
    timing['check'] = round(time.time() - t, 1)
    for dn, s in out['summary'].items():
        print('check', dn, json.dumps(s), flush=True)
    if out['fails']:
        raise SystemExit('ANCHOR CHECK FAILED: %d frame-densities (see %s)' % (
            len(out['fails']), os.path.join(build, 'anchor-check.json')))

    if args.falsify:
        t = time.time()
        L = args.falsify
        fr, fc, fa = (os.path.join(build, 'falsify', x) for x in ('render', 'cells', 'assets'))
        for d in (fr, fc, fa):
            os.makedirs(d, exist_ok=True)
        log = os.path.join(build, 'falsify-render.log')
        wait_all([(run([PY, '-I', os.path.join(RIG, 'render.py'), '--out', fr, '--guns', L, '--falsify', L], log),
                   log)], 'FALSIFY RENDER')
        meta = json.load(open(os.path.join(fr, 'meta-%s-falsify-%s.json' % (L, L))))
        with open(os.path.join(fr, 'meta-%s.json' % L), 'w') as fh:      # pack/post read meta-*.json
            json.dump(meta, fh)
        log = os.path.join(build, 'falsify-post.log')
        wait_all([(run([PY, '-I', os.path.join(RIG, 'post.py'), '--src', fr, '--out', fc,
                        '--meta', os.path.join(fr, 'meta-%s.json' % L)], log), log)], 'FALSIFY POST')
        for dn in os.listdir(cells_dir):                  # the honest cells of every other gun
            for g in os.listdir(os.path.join(cells_dir, dn)):
                if g != L:
                    shutil.copytree(os.path.join(cells_dir, dn, g), os.path.join(fc, dn, g), dirs_exist_ok=True)
        PK.pack(render_dir, fc, fa)                       # anchors from the honest render: the sim's
        fout, frows = CK.check(fa, fc, expect_fail=L)
        with open(os.path.join(build, 'falsify-check.json'), 'w') as fh:
            json.dump({'out': fout, 'rows': frows}, fh, indent=1)
        timing['falsify'] = round(time.time() - t, 1)
        f = fout['falsify']
        print('falsify', json.dumps(f), flush=True)
        if not f['confirmed']:
            raise SystemExit('FALSIFICATION NOT CONFIRMED: the anchor check does not bind')
        worst = sorted(r['drawnVsAnchorPx'] or 0 for r in frows if r['frame'].startswith(L + ':'))
        print('FALSIFICATION CONFIRMED: all %d %s frame-densities fail (drawn muzzle %.2f-%.2f px off its anchor), '
              'every other frame passes' % (f['targetFrames'], L, worst[0], worst[-1]), flush=True)

    timing['total'] = round(time.time() - t0, 1)
    summary = {'timing_s': timing, 'frames': len(doc['frames']), 'densities': doc['densities'],
               'sha256': {os.path.relpath(p, ROOT): h for p, h in hashes.items()},
               'check': out['summary']}
    with open(os.path.join(build, 'build-summary.json'), 'w') as fh:
        json.dump(summary, fh, indent=1)
    for p, h in hashes.items():
        print(h, os.path.getsize(p), os.path.relpath(p, ROOT))
    print('done', json.dumps(timing), flush=True)


if __name__ == '__main__':
    main()
