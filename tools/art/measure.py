"""Measurements (not taste) for the current-vs-v2 comparison.

    /opt/hb-art/bin/python tools/art/measure.py [--out reports/tasks/T-109/measurements.json]

Per pose, at true size, on the identical in-game background:
  height_px / width_px   opaque bounding box of the sprite
  colors                 distinct RGB values inside the sprite's pixels
  luma_mean / luma_steps mean Rec.709 luminance and how many 16-level bins
                         hold >= 5% of the sprite (a crude count of value steps)
  contrast_vs_bg         mean |luma(sprite px) - luma(same px of background)|
  fine_detail            docs/LANE-BRIEF.md: mean |luma(x) - luma(x-1)| along
                         rows inside the sprite's box (higher = more visible
                         internal detail at true size)
CURRENT pixels: sheets.actor_mask (the RIG-free background crop registered
to the crop by integer shift, summed |RGB delta| > 36, a 2x1 opening, the
largest blob plus blobs touching it). Only the stand rows share that
background, so only they get CURRENT numbers. V2 pixels are the atlas cell's
opaque texels (unlit) composited at RIG's measured screen position, and the
same with the lit~ gain from sheets.py. The v2 frame is paired by the aim the
capture recorded (sheets.v2_key).
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import sheets as SH  # noqa: E402


def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def stats(img, mask, bg):
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    b = np.asarray(bg.convert('RGB'), dtype=np.float64)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    L = luma(a)
    Lb = luma(b)
    box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    Lbox = L[box]
    fine = float(np.abs(np.diff(Lbox, axis=1)).mean())
    hist = np.histogram(L[mask], bins=16, range=(0, 256))[0] / mask.sum()
    cols = len({tuple(c) for c in a[mask].astype(int).tolist()})
    return {
        'height_px': int(ys.max() - ys.min() + 1), 'width_px': int(xs.max() - xs.min() + 1),
        'pixels': int(mask.sum()), 'colors': cols,
        'luma_mean': round(float(L[mask].mean()), 1), 'luma_steps': int((hist >= 0.05).sum()),
        'contrast_vs_bg': round(float(np.abs(L[mask] - Lb[mask]).mean()), 1),
        'fine_detail': round(fine, 2),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-109', 'measurements.json'))
    args = ap.parse_args()
    cap = json.load(open(os.path.join(SH.CUR, 'current-art.json')))
    out = {}
    for view, sheet in (('desktop', 'rig-v2-far'), ('phone', 'rig-v2-phone2x')):
        v = cap['views'].get(view)
        if not v or 'stand-right-R' not in v.get('captures', {}):
            continue
        try:
            out[view] = measure_view(cap, v, view, sheet)
        except Exception as exc:          # a view whose capture is incomplete
            out[view] = {'error': '%s: %s' % (type(exc).__name__, exc)}
    with open(args.out, 'w') as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write('\n')
    print(json.dumps(out, indent=1, sort_keys=True)[:4000])


def measure_view(cap, v, view, sheet):
    if True:
        meta, atlas = SH.load_sheet(sheet)
        bgrow = v['captures']['stand-right-R']
        bg = Image.open(SH.background_of(view, bgrow)).convert('RGBA')
        dpr = v['dpr']
        feet, reg = SH.feet_in_background(view, v)
        gi = SH.lit_gain(cap, view)
        rows = {}
        for cap_label, key, label in SH.RIG_PAIRS:
            row = v['captures'].get(cap_label)
            if not row:
                continue
            r = {}
            if cap_label.startswith('stand-'):
                cur = Image.open(row['path']).convert('RGBA')
                m, shifted, _ = SH.actor_mask(bg, cur)
                r['current'] = stats(cur, m, Image.fromarray(shifted.astype(np.uint8)))
            key, _ = SH.v2_key(key, row)
            spr = SH.cell(meta, atlas, key)
            comp = SH.place(bg, spr, meta['origin'], feet)
            alpha = Image.new('L', bg.size, 0)
            alpha.paste(spr.split()[3], (int(round(feet[0] - meta['origin'][0])), int(round(feet[1] - meta['origin'][1]))))
            m2 = np.asarray(alpha) > 0
            r['v2'] = stats(comp, m2, bg)
            if gi:
                r['v2_lit'] = stats(SH.place(bg, SH.apply_gain(spr, gi[0]), meta['origin'], feet), m2, bg)
            r['v2_frame'] = key
            rows[label] = r
        return {'pxPerTile_measured': v['scale']['pxPerTile'], 'rigVisualPx': v['scale']['rigVisualPx'],
                'dpr': dpr, 'cameraDrift': reg, 'poses': rows}


if __name__ == '__main__':
    main()
