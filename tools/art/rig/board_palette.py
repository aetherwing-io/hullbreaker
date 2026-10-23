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


# ---------------------------------------------------------------- v3.1 (phase 1b)
# Decisions entry 28: board 01's marine IS the target, not a palette pooled
# over boards. One figure, measured by family instead of by whole-figure
# k-means (whose clusters blend the rims into the plates):
#   1. Background: deterministic k-means (k=3) of clean WALL patches beside
#      the marine (the ring model above swallowed the muzzle flash and the
#      jet flame, so their colours masked out the rims).
#   2. Marine mask: box pixels farther than B01_DIST from every wall centre.
#   3. Families by stated rule, each clustered on its own (k in B01_FAMS):
#        rust   HSV hue 12-42 deg, sat >= 0.5, luma >= 30 (the armour plates)
#        dark   luma < 70 (suit, gunmetal, the dark armour)
#        bright luma >= 150 (rims, helmet top, visor glint)
#      plus the value structure (luma shares) of the whole mask: what a v3.1
#      cell is compared with (packet_v31.py).
B01_BOX = (555, 367, 604, 435)          # x 604+ is the muzzle flash; the jet flame sits left of x 555
B01_WALL = [(600, 400, 625, 432), (585, 425, 625, 440), (541, 368, 552, 405), (560, 355, 600, 366)]
B01_DIST = 38.0
B01_FAMS = {'rust': 5, 'dark': 5, 'bright': 3}
LUMA_BINS = ((0, 30), (30, 50), (50, 80), (80, 120), (120, 160), (160, 200), (200, 256))


def b01_mask():
    img = load(B01)
    wall = np.concatenate([img[y0:y1, x0:x1].reshape(-1, 3) for x0, y0, x1, y1 in B01_WALL])
    bg, _ = kmeans(wall, 3)
    x0, y0, x1, y1 = B01_BOX
    crop = img[y0:y1, x0:x1]
    m = np.sqrt(((crop[:, :, None, :] - bg[None, None, :, :]) ** 2).sum(-1)).min(-1) > B01_DIST
    return img, m, bg


def luma_shares(lum):
    lum = np.asarray(lum, dtype=np.float64)
    return {'%d-%d' % (a, b): round(float(((lum >= a) & (lum < b)).mean()), 3) for a, b in LUMA_BINS}


def measure_b01():
    img, m, bg = b01_mask()
    x0, y0, x1, y1 = B01_BOX
    ys, xs = np.nonzero(m)
    col = img[ys + y0, xs + x0]
    pts = np.stack([xs + x0, ys + y0], 1)
    lum = col @ LUMA
    hs = np.array([colorsys.rgb_to_hsv(*(c / 255.0)) for c in col])
    rules = {'rust': (hs[:, 0] * 360 >= RUST_HUE[0]) & (hs[:, 0] * 360 <= RUST_HUE[1]) & (hs[:, 1] >= RUST_SAT) &
                     (lum >= RUST_MIN_L),
             'dark': lum < 70, 'bright': lum >= 150}
    fams = {}
    for name, k in B01_FAMS.items():
        sel = rules[name]
        c, lab = kmeans(col[sel], k)
        cs, ps = col[sel], pts[sel]
        rows = []
        for j in np.argsort(c @ LUMA, kind='stable')[::-1]:
            mm = lab == j
            near = int(np.argmin(((cs - c[j]) ** 2).sum(-1) + (~mm) * 1e9))
            rgb = [int(round(v)) for v in c[j]]
            h, s = hsv(rgb)
            rows.append({'rgb': rgb, 'hex': '#%02x%02x%02x' % tuple(rgb), 'luma': round(float(c[j] @ LUMA), 1),
                         'hue': h, 'sat': s, 'share': round(float(mm.mean()), 3), 'n': int(mm.sum()),
                         'at': {'board': B01, 'x': int(ps[near][0]), 'y': int(ps[near][1]),
                                'rgb': [int(v) for v in cs[near]]}})
        fams[name] = rows
    return {'box': list(B01_BOX), 'wall': [list(b) for b in B01_WALL], 'wallCentres': [[int(round(v)) for v in c] for c in bg],
            'dist': B01_DIST, 'pixels': int(m.sum()), 'meanLuma': round(float(lum.mean()), 1),
            'medianLuma': round(float(np.median(lum)), 1), 'lumaShares': luma_shares(lum), 'families': fams}


def sheet_b01(res, out_png):
    ft = ImageFont.truetype(FONT, 11)
    img, m, _ = b01_mask()
    x0, y0, x1, y1 = B01_BOX
    pad, z = 6, 8
    crop = Image.fromarray(img[y0 - pad:y1 + pad, x0 - pad:x1 + pad].astype(np.uint8)).resize(
        ((x1 - x0 + 2 * pad) * z, (y1 - y0 + 2 * pad) * z), Image.NEAREST)
    vis = img[y0:y1, x0:x1].copy()
    vis[~m] *= 0.18
    mask_im = Image.fromarray(vis.astype(np.uint8)).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
    d = ImageDraw.Draw(crop)
    for rows in res['families'].values():
        for r in rows:
            cx, cy = (r['at']['x'] - x0 + pad) * z + z // 2, (r['at']['y'] - y0 + pad) * z + z // 2
            d.rectangle([cx - 5, cy - 5, cx + 5, cy + 5], outline=(255, 0, 255))
    W = crop.width + mask_im.width + 30
    H = max(crop.height, mask_im.height) + 24 + 70 * len(res['families'])
    out = Image.new('RGB', (max(W, 760), H), (14, 16, 20))
    dd = ImageDraw.Draw(out)
    dd.text((8, 4), 'board 01 marine x%d (swatch pixels boxed) | the measured mask' % z, fill=(230, 230, 220), font=ft)
    out.paste(crop, (8, 20))
    out.paste(mask_im, (crop.width + 20, 20 + pad * z))
    y = max(crop.height, mask_im.height) + 26
    for name, rows in res['families'].items():
        dd.text((8, y), '%s (lightest first): hex / luma / share / board x,y' % name, fill=(230, 230, 220), font=ft)
        x = 8
        for r in rows:
            dd.rectangle([x, y + 14, x + 34, y + 36], fill=tuple(r['rgb']))
            dd.text((x, y + 38), '%s L%d %d%%' % (r['hex'], r['luma'], round(100 * r['share'])), fill=(200, 200, 190),
                    font=ImageFont.truetype(FONT, 9))
            dd.text((x + 38, y + 18), '%d,%d' % (r['at']['x'], r['at']['y']), fill=(150, 160, 165),
                    font=ImageFont.truetype(FONT, 9))
            x += 140
        y += 70
    out.save(out_png, optimize=True)


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
    ap.add_argument('--b01', action='store_true', help='v3.1: board 01 marine by family (phase 1b)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    if args.b01:
        res = measure_b01()
        with open(os.path.join(args.out, 'board01-swatches.json'), 'w') as fh:
            json.dump(res, fh, indent=1)
        sheet_b01(res, os.path.join(args.out, 'board01-swatches.png'))
        print('pixels', res['pixels'], 'mean L', res['meanLuma'], 'median', res['medianLuma'], res['lumaShares'])
        for name, rows in res['families'].items():
            print(name)
            for r in rows:
                print('  %s L%5.1f h%5.1f s%.2f share %.3f  at %d,%d' % (r['hex'], r['luma'], r['hue'], r['sat'], r['share'],
                                                                     r['at']['x'], r['at']['y']))
        return
    res = measure()
    with open(os.path.join(args.out, 'board-swatches.json'), 'w') as fh:
        json.dump(res, fh, indent=1)
    sheet(res, os.path.join(args.out, 'board-swatches.png'))
    for name, sw in res['swatches'].items():
        print(name)
        for r in sw:
            print('  %s L%5.1f h%5.1f s%.2f share %.3f  at board %s, %d,%d' % (
                r['hex'], r['luma'], r['hue'], r['sat'], r['share'], r['at']['board'][:2], r['at']['x'], r['at']['y']))
    for b in res['boxes']:
        print(b['label'], 'rig px', b['rigPx'], 'bg', b['backgroundCentres'])


if __name__ == '__main__':
    main()
