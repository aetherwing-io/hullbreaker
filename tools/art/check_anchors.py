"""Anchor check: the DRAWN muzzle (and wasp sting) vs the EXPORTED anchor.

    /opt/hb-art/bin/python tools/art/check_anchors.py --kind rig|wasp --json <atlas.json>
        --png <atlas.png> --ids <part-id atlas .npz> [--tol 1.0] [--report out.json]

What it measures, per frame, on the final 1x pixels:
  1. The shipped PNG is exactly palette(part map) — so the part map the rest
     of this check reads IS what ships, pixel for pixel.
  2. RIG: the gun's pixels (every gun material class) in that frame that lie
     ON the bore axis (pixel centre within 0.75 px of the line through the
     exported muzzle along the aim). The drawn muzzle pixel is the one of
     those furthest down the barrel; the drawn barrel ends at that pixel's far
     edge along the aim (centre + 0.5*(|dx|+|dy|)). Wasp: the same for the
     sting class along the sting's base->tip axis.
  3. The exported anchor (the Blender muzzle/sting empty projected through the
     sheet's camera) must sit within --tol px (default 1.0) of where the drawn
     barrel ends, measured along the bore, AND the drawn muzzle pixel must
     touch the bore axis (perpendicular offset <= 0.75 px by construction of
     the on-axis filter; a frame with no on-axis gun pixel fails).
  4. RIG only: the exported muzzle vs the simulation's own shot origin
     (socket + aim * barrelTiles, src/sim/player.js) — reported in px.

It binds: tools/art/build.py --falsify renders one gun with its mesh moved
0.1 tiles down the barrel while its empties stay put, and this check fails on
exactly that gun's frames.
"""

import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import palette as PAL  # noqa: E402
import pixel  # noqa: E402

OUTLINE_ID = 254
RIG_GUN_CLASSES = ('gunmetal', 'gunlight', 'id_R', 'id_S', 'id_L', 'id_H', 'id_F', 'muzzle')


def drawn_tip(mask, d, anchor, max_perp=0.75):
    """Far end of the drawn part along the axis (anchor, d), on-axis pixels only.
    Returns (along_error_px, perp_px_of_tip_pixel, n_on_axis) or None."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    cx = xs + 0.5 - anchor[0]
    cy = ys + 0.5 - anchor[1]
    t = cx * d[0] + cy * d[1]
    perp = np.abs(-cx * d[1] + cy * d[0])
    on = perp <= max_perp
    if not on.any():
        return None
    h = 0.5 * (abs(d[0]) + abs(d[1]))
    t_on = t[on]
    k = int(np.argmax(t_on))
    along = float(t_on[k]) + h
    return along, float(perp[on][k]), int(on.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', required=True, choices=['rig', 'wasp'])
    ap.add_argument('--json', required=True)
    ap.add_argument('--png', required=True)
    ap.add_argument('--ids', required=True)
    ap.add_argument('--tol', type=float, default=1.0)
    ap.add_argument('--report', default='')
    args = ap.parse_args()

    meta = json.load(open(args.json))
    part = np.load(args.ids)['part']
    shipped = np.array(Image.open(args.png).convert('RGBA'))
    classes = PAL.RIG_CLASSES if args.kind == 'rig' else PAL.WASP_CLASSES
    names = list(classes.keys())
    if names != meta['classes']:
        raise SystemExit('class list differs from the atlas JSON')
    nb = 4
    lut = pixel.build_lut(classes, nb, PAL.tok)
    lut[OUTLINE_ID] = PAL.tok(PAL.INK)
    lut_dive = dict(lut)
    if args.kind == 'wasp':
        si, di = names.index('shell'), names.index('shell_dive')
        for b in range(nb):
            lut_dive[si * nb + b] = lut[di * nb + b]

    # 1. shipped == palette(part), frame by frame (dive frames use their palette)
    mismatched = 0
    for key, fr in meta['frames'].items():
        x, y, w, h = fr['x'], fr['y'], fr['w'], fr['h']
        p = part[y:y + h, x:x + w]
        want = pixel.to_rgba(p, lut_dive if fr.get('dive') else lut)
        got = shipped[y:y + h, x:x + w]
        mismatched += int((want != got).any(axis=2).sum())
    outside = shipped.copy()
    for fr in meta['frames'].values():
        outside[fr['y']:fr['y'] + fr['h'], fr['x']:fr['x'] + fr['w']] = 0
    mismatched += int((outside[..., 3] > 0).sum())

    rows = []
    D = meta['pxPerTile']
    ox, oy = meta['origin']
    for key, fr in meta['frames'].items():
        x, y, w, h = fr['x'], fr['y'], fr['w'], fr['h']
        p = part[y:y + h, x:x + w]
        a = fr['anchors']
        if args.kind == 'rig':
            mask = pixel.class_mask(p, [names.index(c) for c in RIG_GUN_CLASSES], nb)
            ang = math.radians(fr['aimDeg'])
            d = (math.cos(ang), -math.sin(ang))
            target = a['muzzle']
            ref = a['hand']
        else:
            mask = pixel.class_mask(p, [names.index('sting')], nb)
            bx, by = a['stingBase']
            tx, ty = a['sting']
            n = math.hypot(tx - bx, ty - by)
            d = ((tx - bx) / n, (ty - by) / n)
            target = a['sting']
            ref = a['stingBase']
        res = drawn_tip(mask, d, target)
        row = {'frame': key, 'anchor': target}
        if res is None:
            row.update({'error_px': None, 'pass': False, 'why': 'no drawn pixels of the part on its axis'})
        else:
            along, perp, n_on = res
            err = abs(along)
            row.update({'drawn_end': [round(target[0] + along * d[0], 3), round(target[1] + along * d[1], 3)],
                        'error_px': round(err, 3), 'along_px': round(along, 3),
                        'tip_perp_px': round(perp, 3), 'on_axis_pixels': n_on, 'pass': err <= args.tol})
        if args.kind == 'rig':
            # the simulation's own shot origin, from the sheet's recorded sim
            # constants (src/sim/player.js: socket + aim * barrelTiles)
            sx, sz = fr['socket']
            bt = meta['sim']['barrelTiles']
            sim_x = ox + (sx + math.cos(ang) * bt) * D
            sim_y = oy - (sz + math.sin(ang) * bt) * D
            row['anchor_vs_sim_px'] = round(math.hypot(sim_x - target[0], sim_y - target[1]), 4)
        rows.append(row)

    errs = [r['error_px'] for r in rows if r['error_px'] is not None]
    fails = [r for r in rows if not r['pass']]
    summary = {
        'kind': args.kind, 'atlas': os.path.basename(args.png), 'pxPerTile': D,
        'frames': len(rows), 'tolerance_px': args.tol,
        'max_error_px': round(max(errs), 3) if errs else None,
        'mean_error_px': round(float(np.mean(errs)), 3) if errs else None,
        'failures': len(fails),
        'shipped_vs_part_mismatched_pixels': mismatched,
    }
    if args.kind == 'rig':
        summary['max_anchor_vs_sim_px'] = max(r['anchor_vs_sim_px'] for r in rows)
        per_gun = {}
        for r in rows:
            g = r['frame'].split(':')[0]
            if r['error_px'] is not None:
                per_gun[g] = max(per_gun.get(g, 0.0), r['error_px'])
        summary['max_error_px_per_gun'] = {g: round(v, 3) for g, v in sorted(per_gun.items())}
    worst = sorted([r for r in rows if r['error_px'] is not None], key=lambda r: -r['error_px'])[:5]
    summary['worst'] = [(r['frame'], r['error_px']) for r in worst]
    summary['failing_frames'] = [r['frame'] for r in fails][:40]
    if args.report:
        with open(args.report, 'w') as fh:
            json.dump({'summary': summary, 'frames': rows}, fh, indent=1, sort_keys=True)
            fh.write('\n')
    print(json.dumps(summary, sort_keys=True))
    ok = not fails and mismatched == 0
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
