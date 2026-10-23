"""T-109 A2 spike — the numbers behind the look comparison, measured on the
same true-size panels compose.py lays out (real background, device pixels).

    /opt/hb-art/bin/python tools/art/spike/measure.py --view desktop|phone [--out reports/tasks/T-109/spike]

Per view x pose x candidate (today in-game, A, B, D):
  h, w             silhouette box, device px
  colours          distinct RGB values inside the silhouette
  meanL            mean luma (Rec.601, 0-255) of the silhouette
  valueSteps       16-level luma bins holding >= 5% of the silhouette (phase A's metric)
  contrastBehind   mean |luma(sprite px) - luma(the RIG-free background at that px)|
  edgeVisible      share of silhouette-edge pixels whose luma differs by >= 20 from
                   the background pixel touching them (4-neighbour pairs): how much of
                   the outline a player can actually see against this hull
  outlineDark      share of silhouette-edge pixels darker than BOTH the background they
                   touch and the sprite's interior median by >= 15 luma (a dark outline)
  gunPx, gunLen    visible gun pixels, and the gun's extent along the bore (px)
  gunContrast      mean |luma| step across the gun's boundary (to body or background)

The silhouette of "today" is the in-game screenshot differenced against the
identical RIG-free frame (max channel step > 12), limited to RIG's box; it
includes the renderer's soft fringe. Its gun pixels are A's gun mask at the
same placement (same plane, same socket, same aim) — approximate, because the
in-game gun is blurred over it. B/D gun pixels come from the post's part map.
"""

import argparse
import json
import os

import cv2
import numpy as np
from PIL import Image

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
import compose as C  # noqa: E402

LUMA = np.array([0.299, 0.587, 0.114])
N4 = ((0, 1), (0, -1), (1, 0), (-1, 0))


def luma(img):
    return np.asarray(img.convert('RGB'), dtype=np.float64) @ LUMA


def edge_pairs(mask):
    """(inside, outside) index pairs across the mask boundary, 4-neighbour."""
    H, W = mask.shape
    pairs = []
    for dy, dx in N4:
        ys, xs = np.nonzero(mask)
        ny, nx = ys + dy, xs + dx
        ok = (ny >= 0) & (ny < H) & (nx >= 0) & (nx < W)
        ys, xs, ny, nx = ys[ok], xs[ok], ny[ok], nx[ok]
        out = ~mask[ny, nx]
        pairs.append((ys[out], xs[out], ny[out], nx[out]))
    return [np.concatenate(p) for p in zip(*pairs)] if pairs else [np.array([], int)] * 4


def stats(comp, bg, mask, gun=None, aim=0.0):
    L = luma(comp)
    Lb = luma(bg)
    m = mask.astype(bool)
    if m.sum() == 0:
        return None
    ys, xs = np.nonzero(m)
    rgb = np.asarray(comp.convert('RGB'))[m]
    vals = L[m]
    hist = np.bincount(np.clip(vals // 16, 0, 15).astype(int), minlength=16) / len(vals)
    iy, ix, oy, ox = edge_pairs(m)
    d_edge = np.abs(L[iy, ix] - L[oy, ox])
    interior_med = float(np.median(vals))
    dark = (L[iy, ix] <= L[oy, ox] - 15) & (L[iy, ix] <= interior_med - 15)
    # per edge PIXEL (not per pair): visible if any of its outside pairs is
    edge_px = {}
    for a, b, v, dk in zip(iy, ix, d_edge >= 20, dark):
        e = edge_px.setdefault((a, b), [False, False])
        e[0] |= bool(v)
        e[1] |= bool(dk)
    out = {
        'h': int(ys.max() - ys.min() + 1), 'w': int(xs.max() - xs.min() + 1), 'px': int(m.sum()),
        'colours': int(len({tuple(c) for c in rgb.tolist()})),
        'meanL': round(float(vals.mean()), 1),
        'valueSteps': int((hist >= 0.05).sum()),
        'contrastBehind': round(float(np.abs(vals - Lb[m]).mean()), 1),
        'edgeVisible': round(float(np.mean([e[0] for e in edge_px.values()])), 3),
        'outlineDark': round(float(np.mean([e[1] for e in edge_px.values()])), 3),
    }
    if gun is not None and gun.any():
        g = gun & m
        gy, gx = np.nonzero(g)
        a = np.radians(aim)
        proj = gx * np.cos(a) - gy * np.sin(a)
        giy, gix, goy, gox = edge_pairs(g)
        out.update({'gunPx': int(g.sum()), 'gunLen': int(round(proj.max() - proj.min() + 1)),
                    'gunContrast': round(float(np.abs(L[giy, gix] - L[goy, gox]).mean()), 1)})
    return out


def today_mask(cur, bg, box_tiles):
    d = np.abs(np.asarray(cur.convert('RGB'), dtype=int) - np.asarray(bg.convert('RGB'), dtype=int)).max(-1)
    m = d > 12
    x0, y0, x1, y1 = box_tiles
    lim = np.zeros_like(m)
    lim[max(0, y0):y1, max(0, x0):x1] = True
    return m & lim


def measure(view):
    sc = C.Scene(view)
    cands = C.load_candidates(view)
    u = sc.ppt()
    pw, ph = int(round(C.PANEL_W_TILES * u)), int(round(C.PANEL_H_TILES * u))
    rows = {}
    work = []
    for label, cur, bg, frame, mirror in C.ROWS:
        cur, bg = C.resolve_pair(sc, cur, bg)
        if cur not in sc.meta['shots'] or bg not in sc.meta['shots']:
            continue
        f = sc.feet(cur)
        fx, fy = sc.to_png(bg, f['x'], f['y'])
        left = (C.PANEL_LEFT if not mirror else C.PANEL_W_TILES - C.PANEL_LEFT) * u
        bx, by = int(round(fx - left)), int(round(fy - C.PANEL_TOP * u))
        box = (bx, by, bx + pw, by + ph)
        bgimg = sc.shot(bg)
        bgcrop = bgimg.crop(box)
        aim = 45.0 if frame == 'upright' else (180.0 if mirror else 0.0)
        res = {}
        # A / B / D
        gun_masks = {}
        for k in ('A', 'B', 'D'):
            path, origin = cands[k][frame]
            comp, mask, pos = C.place(bgimg, path, origin, (fx, fy), mirror)
            if k == 'A':
                parts = np.load(path.replace('.png', '-parts.npz'))['gun']
            else:
                pz = np.load(path.replace('.png', '-parts.npz'))
                parts = np.isin(pz['fam'], (6, 7))                      # GUN_D, GUN_M
            if mirror:
                parts = parts[:, ::-1]
            gm = np.zeros((bgimg.height, bgimg.width), bool)
            h, w = parts.shape
            gm[pos[1]:pos[1] + h, pos[0]:pos[0] + w] = parts[:max(0, bgimg.height - pos[1]), :max(0, bgimg.width - pos[0])]
            gun_masks[k] = gm
            res[k] = stats(comp.crop(box), bgcrop, np.asarray(mask.crop(box)) > 0,
                           gm[box[1]:box[3], box[0]:box[2]], aim)
        # today: the in-game screenshot vs the RIG-free frame, inside RIG's box
        cx, cy = sc.to_png(cur, f['x'], f['y'])
        cb = (int(round(cx - left)), int(round(cy - C.PANEL_TOP * u)))
        curcrop = sc.shot(cur).crop((cb[0], cb[1], cb[0] + pw, cb[1] + ph))
        # the RIG-free frame for today's crop: same shot pair (bg-*), or the
        # full bg-frame for shots taken over the frozen idle scene
        if bg == 'bg-frame':
            fx2, fy2 = sc.to_png('bg-frame', f['x'], f['y'])
            bb = (int(round(fx2 - left)), int(round(fy2 - C.PANEL_TOP * u)))
            bgt = sc.shot('bg-frame').crop((bb[0], bb[1], bb[0] + pw, bb[1] + ph))
        else:
            bgt = bgcrop
        lx = int(round(left - 1.3 * u)), int(round(left + 1.4 * u))
        if mirror:
            lx = int(round(left - 1.4 * u)), int(round(left + 1.3 * u))
        tm = today_mask(curcrop, bgt, (lx[0], int(round((C.PANEL_TOP - 2.45) * u)), lx[1],
                                       int(round((C.PANEL_TOP + 0.15) * u))))
        # its gun: A's gun mask at the same placement
        res['today'] = stats(curcrop, bgt, tm, gun_masks['A'][box[1]:box[3], box[0]:box[2]] & tm, aim)
        rows[label] = res
        work.append((label, frame, mirror, (fx, fy), box, bgimg, bgcrop, aim, gun_masks['A'], tm, curcrop))
    # A_lit (measurement only): A's pixels times the per-channel gain the
    # shipped lit material + tone map applies to RIG, measured on the idle
    # row (today's silhouette mean / A's, both eroded 1 px so edge pixels
    # blended with the background do not count). It splits "darker" from
    # "softer" in today's look: today vs A_lit is the resampling alone.
    gain = None
    for label, frame, mirror, at, box, bgimg, bgcrop, aim, gmA, tm, curcrop in work:
        if gain is None and frame == 'idle' and not mirror:
            path, origin = cands['A'][frame]
            _, maskA, _ = C.place(bgimg, path, origin, at, mirror)
            mA = cv2.erode((np.asarray(maskA.crop(box)) > 0).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            mT = cv2.erode(tm.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            compA, _, _ = C.place(bgimg, path, origin, at, mirror)
            a = np.asarray(compA.crop(box).convert('RGB'), dtype=np.float64)[mA].mean(0)
            t = np.asarray(curcrop.convert('RGB'), dtype=np.float64)[mT].mean(0)
            gain = t / np.maximum(a, 1e-6)
    for label, frame, mirror, at, box, bgimg, bgcrop, aim, gmA, tm, curcrop in work:
        path, origin = cands['A'][frame]
        spr = Image.open(path).convert('RGBA')
        arr = np.asarray(spr, dtype=np.float64).copy()
        arr[..., :3] = np.clip(arr[..., :3] * gain, 0, 255)
        lit = os.path.join(C.BUILD, 'a-lit-tmp.png')
        Image.fromarray(arr.astype(np.uint8), 'RGBA').save(lit)
        comp, mask, _ = C.place(bgimg, lit, origin, at, mirror)
        rows[label]['A_lit'] = stats(comp.crop(box), bgcrop, np.asarray(mask.crop(box)) > 0,
                                     gmA[box[1]:box[3], box[0]:box[2]], aim)
    return {'view': view, 'pxPerTile': u, 'dpr': sc.dpr, 'litGainOnA': [round(float(g), 3) for g in gain], 'rows': rows}


def measure_wasp(view):
    """Today's in-game wasp crop vs the CC0 candidate on the same clip of the
    hostile-free frame: size, colours, luma, contrast vs the hull behind."""
    sc = C.Scene(view)
    if 'cur-wasp' not in sc.meta['shots'] or not sc.meta.get('wasp', {}).get('live'):
        return None
    live = sc.meta['wasp']['live']
    clip = sc.meta['shots']['cur-wasp']['clip']
    cur = sc.shot('cur-wasp')
    bx, by = sc.to_png('bg-frame', clip['x'], clip['y'])
    box = (int(round(bx)), int(round(by)), int(round(bx)) + cur.width, int(round(by)) + cur.height)
    bgc = sc.shot('bg-frame').crop(box)
    out = {'state': live.get('state'), 'dir': live.get('dir')}
    m = today_mask(cur, bgc, (0, 0, cur.width, cur.height))
    out['today'] = stats(cur, bgc, m)
    ys_, xs_ = np.nonzero(m)
    drawn = (float(xs_.mean()), float(ys_.mean())) if len(xs_) else None
    wm = json.load(open(os.path.join(C.BUILD, 'wasp-' + view, 'meta.json')))
    for fname in ('cruise-up', 'cruise-down'):
        spr = Image.open(os.path.join(C.BUILD, 'wasp-' + view, fname + '.png')).convert('RGBA')
        ox, oy = wm['frames'][fname]['origin']
        if live.get('dir', -1) > 0:
            spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
            ox = spr.width - ox
        wx, wy = drawn if drawn else sc.to_png('cur-wasp', live['screen']['x'], live['screen']['y'])
        img = bgc.copy()
        pos = (int(round(wx - ox)), int(round(wy - oy)))
        img.alpha_composite(spr, pos)
        mask = Image.new('L', bgc.size, 0)
        mask.paste(spr.split()[3], pos)
        out[fname] = stats(img, bgc, np.asarray(mask) > 0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--view', required=True)
    ap.add_argument('--out', default=os.path.join(C.ROOT, 'reports', 'tasks', 'T-109', 'spike'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    m = measure(args.view)
    m['wasp'] = measure_wasp(args.view)
    p = os.path.join(args.out, 'measure-%s.json' % args.view)
    with open(p, 'w') as fh:
        json.dump(m, fh, indent=1, sort_keys=True)
    keys = ['h', 'w', 'colours', 'meanL', 'valueSteps', 'contrastBehind', 'edgeVisible', 'outlineDark',
            'gunPx', 'gunLen', 'gunContrast']
    print('%-16s %-6s ' % ('row', 'cand') + ' '.join('%9s' % k[:9] for k in keys))
    for row, res in m['rows'].items():
        for k in ('today', 'A_lit', 'A', 'B', 'D'):
            r = res.get(k) or {}
            print('%-16s %-6s ' % (row[:16], k) + ' '.join('%9s' % r.get(x, '-') for x in keys))
    print('lit gain on A (today / A, idle):', m['litGainOnA'])
    if m['wasp']:
        for k, r in m['wasp'].items():
            if isinstance(r, dict):
                print('wasp %-12s ' % k + ' '.join('%s=%s' % (x, r.get(x)) for x in ('h', 'w', 'colours', 'meanL', 'contrastBehind', 'edgeVisible')))
    print(p)


if __name__ == '__main__':
    main()
