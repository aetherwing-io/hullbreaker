"""RIG v3 anchor check, on the SHIPPED pixels (T-124 box 4).

    /opt/hb-art/bin/python -I tools/art/rig/check.py --assets <dir with rig-v3.json + atlases> --cells <cells dir>
                                                     [--expect-fail S] [--report <json>]

Per density and frame:
  1. part map == shipped pixels: post.py's part map for the cell (family,
     tone, line, outline), re-coloured, must equal the atlas cell byte for
     byte -- so the gun pixels this check reads are the pixels that ship.
  2. drawn muzzle vs exported anchor: the gun's pixels on the bore axis
     (centre within BORE_PX of the line through the exported drawnMuzzle
     along the aim); the drawn barrel ends at the far edge of the furthest
     of them along the aim; |end - anchor| <= TOL_PX. A frame with no gun
     pixel on its bore fails.
  3. exported muzzle vs the simulation: CONFIG.player.muzzleY / barrelTiles
     and CONFIG.crouch.muzzleY are re-read from src/config.js here (not from
     the JSON), the shot origin recomputed from the frame's aim, and the
     exported `muzzle` must equal it within 1e-4 tiles; `drawnMuzzle` must be
     that origin minus the kick (RIG_RECOIL_TILES, src/pure/rig.js) on
     stand-fire frames and equal to it elsewhere.

--expect-fail <gun>: the negative control (build_rig_v3.py --falsify moves
that gun's MESH 0.15 tiles down its bore and keeps every anchor). Exit 0 and
print FALSIFICATION CONFIRMED only if every frame of that gun fails check 2
in every density and every other frame passes.

The 1 px tolerance: a pixel-art barrel end is quantized -- a diagonal barrel's
last pixel reaches up to 0.5 * (|cos| + |sin|) = 0.71 px past its centre line.
"""

import argparse
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
import poses as P  # noqa: E402
import post as PO  # noqa: E402

TOL_PX = 1.0
BORE_PX = 0.75
SIM_TOL = 1e-4


def sim_numbers():
    cfg = open(os.path.join(ROOT, 'src', 'config.js'), encoding='utf-8').read()
    rig = open(os.path.join(ROOT, 'src', 'pure', 'rig.js'), encoding='utf-8').read()
    player = cfg[cfg.index('\n  player: {'):]
    crouch = cfg[cfg.index('\n  crouch: {'):]
    num = r'\s*:\s*([0-9.]+)'
    return {
        'muzzleY': float(re.search(r'\bmuzzleY' + num, player).group(1)),
        'barrelTiles': float(re.search(r'\bbarrelTiles' + num, player).group(1)),
        'crouchMuzzleY': float(re.search(r'\bmuzzleY' + num, crouch).group(1)),
        'recoilTiles': float(re.search(r'RIG_RECOIL_TILES\s*=\s*([0-9.]+)', rig).group(1)),
    }


def frame_aim(key):
    pid = key.split(':', 1)[1]
    for a in sorted(P.AIM_DEG, key=len, reverse=True):
        if pid.endswith('-' + a):
            return a, pid
    raise SystemExit('check: no aim in %s' % key)


def drawn_end(fam, anchor_px, aim_deg, gun_fams=None):
    """Distance (px, along the aim) from the exported anchor to the far edge
    of the furthest gun pixel on the bore axis; None when there is none.
    `gun_fams`: the look's gun family indices (default: v3's)."""
    th = math.radians(aim_deg)
    a = np.array([math.cos(th), -math.sin(th)])          # pixel space: y down
    ys, xs = np.nonzero(np.isin(fam, PO.GUN_FAMS if gun_fams is None else gun_fams))
    if len(xs) == 0:
        return None
    c = np.stack([xs + 0.5, ys + 0.5], 1) - np.asarray(anchor_px)
    along = c @ a
    perp = np.abs(c[:, 0] * a[1] - c[:, 1] * a[0])
    bore = perp <= BORE_PX
    if not bore.any():
        return None
    return float((along[bore] + 0.5 * (abs(a[0]) + abs(a[1]))).max())


def check(assets, cells, expect_fail=None):
    doc = json.load(open(os.path.join(assets, 'rig-v3.json')))
    sim = sim_numbers()
    rows, fails = [], []
    for d in doc['densities']:
        atlas = np.asarray(Image.open(os.path.join(assets, d['image'])).convert('RGBA'))
        cw, ch = d['cell']
        ox, oy = d['origin']
        ppt = d['pxPerTile']
        for i, key in enumerate(doc['frames']):
            g, pid = key.split(':', 1)
            x0, y0 = (i % d['columns']) * cw, (i // d['columns']) * ch
            cell = atlas[y0:y0 + ch, x0:x0 + cw]
            parts = np.load(os.path.join(cells, d['id'], g, pid + '-parts.npz'))
            re_rgba, _ = PO.compose(parts['fam'], parts['tone'], parts['line'], g)
            same = bool((re_rgba == cell).all())
            aim, _ = frame_aim(key)
            th = math.radians(P.AIM_DEG[aim])
            sock = sim['crouchMuzzleY'] if pid.startswith('crouch') else sim['muzzleY']
            sim_m = (math.cos(th) * sim['barrelTiles'], sock + math.sin(th) * sim['barrelTiles'])
            kick = sim['recoilTiles'] if pid.startswith('stand-fire') else 0.0
            sim_d = (sim_m[0] - kick * math.cos(th), sim_m[1] - kick * math.sin(th))
            m = doc['anchors']['muzzle'][i]
            dm = doc['anchors']['drawnMuzzle'][i]
            sim_err = max(abs(m[0] - sim_m[0]), abs(m[1] - sim_m[1]), abs(dm[0] - sim_d[0]), abs(dm[1] - sim_d[1]))
            anchor_px = (ox + dm[0] * ppt, oy - dm[1] * ppt)
            end = drawn_end(parts['fam'], anchor_px, P.AIM_DEG[aim])
            err = abs(end) if end is not None else None
            ok_muzzle = err is not None and err <= TOL_PX
            row = {'density': d['id'], 'frame': key, 'partsEqualShipped': same, 'drawnVsAnchorPx': err,
                   'drawnEndAlongPx': end, 'anchorVsSimTiles': sim_err, 'ok': same and ok_muzzle and sim_err <= SIM_TOL}
            rows.append(row)
            if not row['ok']:
                fails.append(row)
    summary = {}
    for d in doc['densities']:
        r = [x for x in rows if x['density'] == d['id']]
        errs = [x['drawnVsAnchorPx'] for x in r if x['drawnVsAnchorPx'] is not None]
        summary[d['id']] = {'frames': len(r), 'fails': sum(1 for x in r if not x['ok']),
                            'maxDrawnVsAnchorPx': round(max(errs), 3) if errs else None,
                            'meanDrawnVsAnchorPx': round(float(np.mean(errs)), 3) if errs else None,
                            'noBorePixels': sum(1 for x in r if x['drawnVsAnchorPx'] is None),
                            'partsNotShipped': sum(1 for x in r if not x['partsEqualShipped']),
                            'maxAnchorVsSimTiles': max(x['anchorVsSimTiles'] for x in r)}
    out = {'sim': sim, 'tolPx': TOL_PX, 'borePx': BORE_PX, 'summary': summary, 'fails': fails}
    if expect_fail:
        bad = [x for x in rows if x['frame'].startswith(expect_fail + ':') and x['ok']]
        other = [x for x in rows if not x['frame'].startswith(expect_fail + ':') and not x['ok']]
        n_target = sum(1 for x in rows if x['frame'].startswith(expect_fail + ':'))
        out['falsify'] = {'gun': expect_fail, 'targetFrames': n_target, 'targetPassed': len(bad),
                          'otherFailed': len(other),
                          'confirmed': n_target > 0 and not bad and not other}
    return out, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--assets', required=True)
    ap.add_argument('--cells', required=True)
    ap.add_argument('--expect-fail', default='')
    ap.add_argument('--report', default='')
    args = ap.parse_args()
    out, rows = check(args.assets, args.cells, args.expect_fail or None)
    if args.report:
        with open(args.report, 'w') as fh:
            json.dump({'out': out, 'rows': rows}, fh, indent=1)
    for dn, s in out['summary'].items():
        print(dn, json.dumps(s))
    if args.expect_fail:
        f = out['falsify']
        print('falsify', json.dumps(f))
        if f['confirmed']:
            print('FALSIFICATION CONFIRMED: every %s frame fails (drawn muzzle off its anchor), every other frame passes'
                  % f['gun'])
            return 0
        print('FALSIFICATION NOT CONFIRMED')
        return 1
    if out['fails']:
        for r in out['fails'][:20]:
            print('FAIL', json.dumps(r))
        print('ANCHOR CHECK FAILED: %d of %d frame-densities' % (len(out['fails']), len(rows)))
        return 1
    print('ANCHOR CHECK PASSED: %d frame-densities' % len(rows))
    return 0


if __name__ == '__main__':
    sys.exit(main())
