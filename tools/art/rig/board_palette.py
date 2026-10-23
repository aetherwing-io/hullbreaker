"""RIG v3 palette, MEASURED from the concept boards (decisions entry 27: "B/D,
in board colours" -- the boards' warm khaki/rust; T-124 box 2).

    /opt/hb-art/bin/python -I tools/art/rig/board_palette.py [--out reports/tasks/T-124]

Writes <out>/board-swatches.json (every swatch with its board coordinates) and
<out>/board-swatches.png (each RIG crop at 6x with the swatch pixels marked,
plus the chips). Nothing here is chosen by eye except the RIG boxes below
(read off 8x grid zooms) and which measured cluster feeds which ramp step
(RAMP_SOURCES, printed beside the numbers).

Method, per board:
  1. RIG box: a tight box around one RIG figure (body + the near half of the
     gun; the muzzle flash is outside every box).
  2. Background model: deterministic k-means (k=4) of the pixels in a 5 px
     ring just outside the box -- the hull, sky or wall RIG stands on.
  3. RIG mask: box pixels farther than BG_DIST (sRGB) from every background
     centre. Near-black RIG pixels on a near-black wall drop out here; that
     is fine, they are the ink/void role, not the fill being measured.
  4. Clusters: deterministic k-means of the masked pixels of all of a board's
     boxes pooled (board 13: six panels), k = K per board. Each cluster is
     reported with its centre, share, Rec.601 luma, HSV hue/sat, and the
     board pixel nearest its centre (board, x, y) -- the swatch coordinate.

Deterministic: fixed boxes, k-means initialised from luma quantiles, fixed
iteration count, ties broken by index. Same boards, same JSON.
"""

import argparse
import colorsys
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BOARDS = os.path.join(ROOT, 'docs', 'concept-art')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

B01 = '01-exterior-gameplay.png'
B13 = '13-human-scale-monster-climb-grammar.png'
# (board, (x0, y0, x1, y1) exclusive, label) -- RIG's figure, read off 8x grid zooms
BOXES = [
    (B01, (553, 366, 600, 433), 'b01 jump-fire'),   # left edge clears the jump-jet flame
    (B13, (316, 222, 346, 263), 'b13 p1 run-fire'),
    (B13, (748, 136, 778, 180), 'b13 p2 brace-fire'),
    (B13, (1260, 222, 1302, 262), 'b13 p3 run-fire'),
    (B13, (808, 668, 845, 712), 'b13 p5 run-fire'),
    (B13, (1376, 674, 1412, 712), 'b13 p6 run-fire'),
]
RING = 5
BG_K = 4
BG_DIST = 42.0
K = {B01: 8, B13: 6}
ITERS = 40
LUMA = np.array([0.299, 0.587, 0.114])
RUST_HUE = (12.0, 42.0)          # HSV degrees: orange-brown
RUST_SAT = 0.50
RUST_MIN_L = 30.0
RUST_K = 4


def load(name):
    return np.asarray(Image.open(os.path.join(BOARDS, name)).convert('RGB')).astype(np.float64)


def kmeans(x, k, iters=ITERS):
    """Deterministic k-means: centres start at the luma quantiles of x."""
    lum = x @ LUMA
    order = np.argsort(lum, kind='stable')
    init = [x[order[min(len(x) - 1, int((i + 0.5) * len(x) / k))]] for i in range(k)]
    c = np.array(init, dtype=np.float64)
    for _ in range(iters):
        d = ((x[:, None, :] - c[None, :, :]) ** 2).sum(-1)
        lab = np.argmin(d, axis=1)
        for j in range(k):
            m = lab == j
            if m.any():
                c[j] = x[m].mean(0)
    d = ((x[:, None, :] - c[None, :, :]) ** 2).sum(-1)
    return c, np.argmin(d, axis=1)


def rig_mask(img, box):
    x0, y0, x1, y1 = box
    H, W, _ = img.shape
    ring = np.zeros((H, W), bool)
    ring[max(0, y0 - RING):min(H, y1 + RING), max(0, x0 - RING):min(W, x1 + RING)] = True
    ring[y0:y1, x0:x1] = False
    bg, _ = kmeans(img[ring], BG_K)
    crop = img[y0:y1, x0:x1]
    d = np.sqrt(((crop[:, :, None, :] - bg[None, None, :, :]) ** 2).sum(-1)).min(-1)
    return d > BG_DIST, bg


def hsv(rgb):
    h, s, v = colorsys.rgb_to_hsv(*(np.asarray(rgb, dtype=np.float64) / 255.0))
    return round(h * 360.0, 1), round(s, 3)


def measure():
    boards = {name: load(name) for name in {b for b, _, _ in BOXES}}
    per_board = {}
    boxes_out = []
    for name, box, label in BOXES:
        img = boards[name]
        m, bg = rig_mask(img, box)
        ys, xs = np.nonzero(m)
        pts = np.stack([xs + box[0], ys + box[1]], 1)
        per_board.setdefault(name, []).append((pts, img[ys + box[1], xs + box[0]]))
        boxes_out.append({'board': name, 'box': list(box), 'label': label, 'rigPx': int(m.sum()),
                          'backgroundCentres': [[int(round(v)) for v in c] for c in bg]})
    def clusters(pts, col, brd, k):
        c, lab = kmeans(col, k)
        rows = []
        for j in np.argsort(c @ LUMA, kind='stable')[::-1]:
            m = lab == j
            centre = c[j]
            near = int(np.argmin(((col - centre) ** 2).sum(-1) + (~m) * 1e9))
            rgb = [int(round(v)) for v in centre]
            h, s = hsv(rgb)
            rows.append({'rgb': rgb, 'hex': '#%02x%02x%02x' % tuple(rgb), 'luma': round(float(centre @ LUMA), 1),
                         'hue': h, 'sat': s, 'share': round(float(m.mean()), 3), 'n': int(m.sum()),
                         'at': {'board': brd[near], 'x': int(pts[near][0]), 'y': int(pts[near][1]),
                                'rgb': [int(v) for v in col[near]]}})
        return rows

    swatches = {}
    allp, allc, allb = [], [], []
    for name, parts in per_board.items():
        pts = np.concatenate([p for p, _ in parts])
        col = np.concatenate([c for _, c in parts])
        swatches[name] = clusters(pts, col, [name] * len(pts), K[name])
        allp.append(pts)
        allc.append(col)
        allb += [name] * len(pts)
    # RUST: k-means over whole figures is ruled by board 01's darks, so the
    # rust plates never get a cluster of their own. Stated selection rule
    # instead: the saturated warm pixels inside every RIG mask, both boards.
    pts, col, brd = np.concatenate(allp), np.concatenate(allc), np.array(allb)
    hs = np.array([colorsys.rgb_to_hsv(*(c / 255.0)) for c in col])
    lum = col @ LUMA
    sel = (hs[:, 0] * 360 >= RUST_HUE[0]) & (hs[:, 0] * 360 <= RUST_HUE[1]) & (hs[:, 1] >= RUST_SAT) & (lum >= RUST_MIN_L)
    swatches['rust (rule)'] = clusters(pts[sel], col[sel], list(brd[sel]), RUST_K)
    return {'method': __doc__.split('Method, per board:')[1].split('Deterministic:')[0].strip(),
            'rustRule': {'hueDeg': list(RUST_HUE), 'minSat': RUST_SAT, 'minLuma': RUST_MIN_L, 'k': RUST_K,
                         'pixels': int(sel.sum())},
            'boxes': boxes_out, 'swatches': swatches}


def sheet(res, out_png):
    ft = ImageFont.truetype(FONT, 11)
    tiles = []
    for b in res['boxes']:
        img = Image.open(os.path.join(BOARDS, b['board'])).convert('RGB')
        x0, y0, x1, y1 = b['box']
        pad = 4
        crop = img.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad)).resize(((x1 - x0 + 2 * pad) * 6, (y1 - y0 + 2 * pad) * 6),
                                                                         Image.NEAREST)
        d = ImageDraw.Draw(crop)
        d.rectangle([pad * 6, pad * 6, (x1 - x0 + pad) * 6 - 1, (y1 - y0 + pad) * 6 - 1], outline=(0, 255, 255))
        for row in [r for rows in res['swatches'].values() for r in rows]:
            at = row['at']
            if at['board'] == b['board'] and x0 <= at['x'] < x1 and y0 <= at['y'] < y1:
                cx, cy = (at['x'] - x0 + pad) * 6 + 3, (at['y'] - y0 + pad) * 6 + 3
                d.rectangle([cx - 4, cy - 4, cx + 4, cy + 4], outline=(255, 0, 255))
        tiles.append((crop, b['label']))
    chips_h = 0
    W = sum(t.width for t, _ in tiles) + 6 * (len(tiles) + 1)
    H = max(t.height for t, _ in tiles) + 18
    rows = []
    for name, sw in res['swatches'].items():
        rows.append((name, sw))
        chips_h += 54
    out = Image.new('RGB', (max(W, 900), H + chips_h + 10), (14, 16, 20))
    d = ImageDraw.Draw(out)
    x = 6
    for t, lab in tiles:
        d.text((x, 2), lab, fill=(230, 230, 220), font=ft)
        out.paste(t, (x, 16))
        x += t.width + 6
    y = H + 6
    for name, sw in rows:
        d.text((6, y), name.split('-')[0] + ' clusters (lightest first): hex / luma / share / board x,y',
               fill=(230, 230, 220), font=ft)
        x = 6
        for r in sw:
            d.rectangle([x, y + 14, x + 34, y + 34], fill=tuple(r['rgb']))
            d.text((x, y + 36), '%s L%d %d%%' % (r['hex'], r['luma'], round(100 * r['share'])), fill=(200, 200, 190),
                   font=ImageFont.truetype(FONT, 9))
            d.text((x + 38, y + 18), '%d,%d' % (r['at']['x'], r['at']['y']), fill=(150, 160, 165),
                   font=ImageFont.truetype(FONT, 9))
            x += 140
        y += 54
    out.save(out_png, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-124'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    res = measure()
    with open(os.path.join(args.out, 'board-swatches.json'), 'w') as fh:
        json.dump(res, fh, indent=1)
    sheet(res, os.path.join(args.out, 'board-swatches.png'))
    for name, sw in res['swatches'].items():
        print(name)
        for r in sw:
            print('  %s L%5.1f h%5.1f s%.2f share %.3f  at %s,%d,%d' % (r['hex'], r['luma'], r['hue'], r['sat'], r['share'],
                                                                     name[:2], r['at']['x'], r['at']['y']))
    for b in res['boxes']:
        print(b['label'], 'rig px', b['rigPx'], 'bg', b['backgroundCentres'])


if __name__ == '__main__':
    main()
