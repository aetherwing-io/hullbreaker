"""RIG v3 judging packet: today vs v3 at TRUE SIZE on the real game frame, the
numbers behind it, and the run-cycle GIF (T-124 box 5).

    node tools/art/spike/scene_capture.mjs --view desktop|phone --out <scene>/<view> --poses bg,upright,jump,firepause,left,run
    /opt/hb-art/bin/python -I tools/art/rig/packet.py --scene <scene> --cells <v3 cells (build/rig-v3/cells)> \
        [--spike <v3_post.py out root>] [--spike-a <crisp.py out root>] --out reports/tasks/T-124

Placement: every cell carries the sim point in pixel-edge coordinates and is
pasted where the game projects the staged sim point at RIG's render depth
(scene.json), 1 cell px = 1 device px, never resampled; facing -1 mirrors
the cell about the sim point. Desktop = 1280x720 FAR at DPR 1 with the d16
cells; phone = the FAR shot at the phone density (844x518 at DPR 2, the
central 844x390 css is the phone frame) with the d23 cells.

Metrics (the spike's definitions, tools/art/spike/measure.py, plus three):
  contrastBehind  mean |luma(sprite) - luma(RIG-free frame at that px)| over the
                  whole silhouette (outline included) -- the spike's number
  fillContrast    the same over the FILL only (the 1 px outline ring excluded;
                  today: its silhouette eroded 1 px) -- entry 27's rule: the
                  fill must separate from the hull by >= 40 luma
  fill40          share of fill pixels whose separation is >= 40 luma
  edgeVisible     share of silhouette-edge pixels >= 20 luma from the touching
                  background pixel (the spike's)
  fillEdgeVisible share of the outermost FILL pixels >= 20 luma from the
                  background 2 px out along the same axis -- the edge a player
                  sees when a dark outline merges into a dark hull
  gunContrast     mean luma step across the gun's boundary (the spike's)
Plus the hull sweep: v3's idle cell slid along the deck across the whole
frame (every 4 px), fillContrast / fill40 at every stop: how the separation
holds on every background RIG can stand in front of on that deck.
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, '..'))
ROOT = os.path.abspath(os.path.join(ART, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ART, 'spike'))
import compose as SC  # noqa: E402  (the spike's Scene / place / font)
import measure as SM  # noqa: E402  (the spike's stats / today_mask / luma)
import post as PO  # noqa: E402

VIEW_DENSITY = {'desktop': 'd16', 'phone': 'd23'}
# row: (label, today's shot, RIG-free shot, v3 frame, spike frame, mirror)
ROWS = [
    ('idle, aim right', 'cur-frame-idle', 'bg-frame', 'R:stand-right', 'idle', False),
    ('run', 'cur-run', 'bg-frame', 'R:run-pass-a-right', 'run-pass', False),
    ('jump (rise)', 'cur-jump', 'bg-jump', 'R:air-rise-right', 'jump', False),
    ('aim up-right', 'cur-upright', 'bg-frame', 'R:stand-up-right', 'upright', False),
    ('firing', 'cur-firep', 'bg-firep', 'R:stand-fire-right', 'fire', False),
    ('facing left', 'cur-left', 'bg-frame', 'R:stand-right', 'idle', True),
]
COLS = ['today (in-game)', 'spike D (white)', 'v3 (khaki/rust)']
PANEL_W, PANEL_H, PANEL_LEFT, PANEL_TOP = 5.0, 3.4, 2.2, 2.75     # tiles


class V3:
    """v3 as it ships: pixels cut from the atlas, origin from rig-v3.json; the
    part masks from post.py's maps (check.py proves they equal the pixels)."""

    def __init__(self, assets, cells, dn):
        doc = json.load(open(os.path.join(assets, 'rig-v3.json')))
        self.d = [x for x in doc['densities'] if x['id'] == dn][0]
        self.atlas = Image.open(os.path.join(assets, self.d['image'])).convert('RGBA')
        self.index = {k: i for i, k in enumerate(doc['frames'])}
        self.cells, self.dn, self.assets = cells, dn, assets

    def image(self, frame):
        i = self.index[frame]
        cw, ch = self.d['cell']
        x0, y0 = (i % self.d['columns']) * cw, (i // self.d['columns']) * ch
        return self.atlas.crop((x0, y0, x0 + cw, y0 + ch))

    def origin(self, frame):
        return tuple(self.d['origin'])

    def masks(self, frame):
        g, pid = frame.split(':', 1)
        z = np.load(os.path.join(self.cells, self.dn, g, pid + '-parts.npz'))
        return (z['fam'] >= 0) | z['outline'], z['outline'], np.isin(z['fam'], PO.GUN_FAMS)


class Spike:
    """The T-109 spike's candidate D (tools/art/spike/v3_post.py output), or
    candidate A's gun plane (tools/art/spike/crisp.py) as today's gun proxy."""

    def __init__(self, root, kind='D'):
        self.root, self.kind = root, kind
        self.meta = json.load(open(os.path.join(root, 'meta.json')))

    def image(self, frame):
        d = os.path.join(self.root, self.kind) if self.kind in ('B', 'D') else self.root
        return Image.open(os.path.join(d, frame + '.png')).convert('RGBA')

    def origin(self, frame):
        if self.kind in ('B', 'D'):
            return tuple(self.meta['origin'])
        return tuple(self.meta['frames'][frame]['origin'])

    def masks(self, frame):
        d = os.path.join(self.root, self.kind) if self.kind in ('B', 'D') else self.root
        z = np.load(os.path.join(d, frame + '-parts.npz'))
        if self.kind == 'A':
            g = z['gun']
            return g, np.zeros_like(g), g
        return (z['fam'] >= 0) | z['outline'], z['outline'], np.isin(z['fam'], (6, 7))   # spike GUN_D, GUN_M


def paste(base, cand, frame, at, mirror):
    spr = cand.image(frame)
    ox, oy = cand.origin(frame)
    masks = cand.masks(frame)
    if mirror:
        spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
        ox = spr.width - ox
        masks = tuple(m[:, ::-1] for m in masks)
    img = base.copy()
    pos = (int(round(at[0] - ox)), int(round(at[1] - oy)))
    img.alpha_composite(spr, pos)
    full = []
    for m in masks:
        f = np.zeros((base.height, base.width), bool)
        h, w = m.shape
        x0, y0 = max(0, pos[0]), max(0, pos[1])
        x1, y1 = min(base.width, pos[0] + w), min(base.height, pos[1] + h)
        f[y0:y1, x0:x1] = m[y0 - pos[1]:y1 - pos[1], x0 - pos[0]:x1 - pos[0]]
        full.append(f)
    return img, full


def fill_stats(comp, bg, sprite, outline):
    """Fill-only separation and the outermost-fill edge visibility."""
    L, Lb = SM.luma(comp), SM.luma(bg)
    fill = sprite & ~outline
    if fill.sum() == 0:
        return {}
    d = np.abs(L[fill] - Lb[fill])
    H, W = fill.shape
    vis = []
    for dy, dx in SM.N4:
        ys, xs = np.nonzero(fill)
        ny, nx = ys + dy, xs + dx
        ok = (ny >= 0) & (ny < H) & (nx >= 0) & (nx < W)
        ys, xs, ny, nx = ys[ok], xs[ok], ny[ok], nx[ok]
        edge = ~fill[ny, nx]                          # the outermost fill pixels, this direction
        ys, xs = ys[edge], xs[edge]
        fy, fx = ys + 2 * dy, xs + 2 * dx              # past a 1 px outline
        ok = (fy >= 0) & (fy < H) & (fx >= 0) & (fx < W)
        ys, xs, fy, fx = ys[ok], xs[ok], fy[ok], fx[ok]
        out = ~sprite[fy, fx]
        vis.append(np.abs(L[ys[out], xs[out]] - Lb[fy[out], fx[out]]) >= 20)
    v = np.concatenate(vis) if vis else np.array([])
    return {'fillPx': int(fill.sum()), 'fillContrast': round(float(d.mean()), 1),
            'fill40': round(float((d >= 40).mean()), 3),
            'fillEdgeVisible': round(float(v.mean()), 3) if len(v) else None}


def today_fill(mask):
    import cv2
    er = cv2.erode(mask.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    return mask, mask & ~er


def panels(view, scene_root, v3, spike, spike_a, spike_b=None):
    sc = SC.Scene.__new__(SC.Scene)
    sc.dir = os.path.join(scene_root, view)
    sc.meta = json.load(open(os.path.join(sc.dir, 'scene.json')))
    sc.dpr = sc.meta['dpr']
    sc.imgs = {}
    u = sc.ppt()
    pw, ph = int(round(PANEL_W * u)), int(round(PANEL_H * u))
    grid, stats_rows = [], {}
    for label, cur, bg, frame, sframe, mirror in ROWS:
        if cur not in sc.meta['shots'] or bg not in sc.meta['shots']:
            continue
        f = sc.feet(cur)
        fx, fy = sc.to_png(bg, f['x'], f['y'])
        left = (PANEL_LEFT if not mirror else PANEL_W - PANEL_LEFT) * u
        box = (int(round(fx - left)), int(round(fy - PANEL_TOP * u)))
        box = (box[0], box[1], box[0] + pw, box[1] + ph)
        cx, cy = sc.to_png(cur, f['x'], f['y'])
        cbox = (int(round(cx - left)), int(round(cy - PANEL_TOP * u)))
        cbox = (cbox[0], cbox[1], cbox[0] + pw, cbox[1] + ph)
        bgimg = sc.shot(bg)
        today = sc.shot(cur).crop(cbox)
        row = [today]
        res = {}
        aim = 45.0 if 'up-right' in frame else (180.0 if mirror else 0.0)
        for name, cand, fr, shown in (('spikeB', spike_b, sframe, False), ('spikeD', spike, sframe, True),
                                      ('v3', v3, frame, True)):
            if cand is None:
                if shown:
                    row.append(Image.new('RGBA', (pw, ph), (12, 14, 18, 255)))
                continue
            comp, (sprite, outline, gun) = paste(bgimg, cand, fr, (fx, fy), mirror)
            crop = comp.crop(box)
            if shown:
                row.append(crop)
            sl = (slice(box[1], box[3]), slice(box[0], box[2]))
            bgc = bgimg.crop(box)
            st = SM.stats(crop, bgc, sprite[sl], gun[sl], aim)
            st.update(fill_stats(crop, bgc, sprite[sl], outline[sl]))
            res[name] = st
        # today: the in-game screenshot vs the RIG-free frame inside RIG's box (the spike's mask)
        if bg == 'bg-frame':
            bx, by = sc.to_png('bg-frame', f['x'], f['y'])
            bb = (int(round(bx - left)), int(round(by - PANEL_TOP * u)))
            bgt = sc.shot('bg-frame').crop((bb[0], bb[1], bb[0] + pw, bb[1] + ph))
        else:
            bgt = bgimg.crop(box)
        lx = (int(round(left - 1.3 * u)), int(round(left + 1.4 * u))) if not mirror else \
            (int(round(left - 1.4 * u)), int(round(left + 1.3 * u)))
        tm = SM.today_mask(today, bgt, (lx[0], int(round((PANEL_TOP - 2.45) * u)), lx[1],
                                        int(round((PANEL_TOP + 0.15) * u))))
        tgun = None
        if spike_a is not None and label != 'run':      # the run crop moved during its shot (the spike's exclusion)
            # A's gun plane at the same placement (approximate), in the today shot's own coordinates
            _, (_, _, ag) = paste(sc.shot(cur), spike_a, sframe, (cx, cy), mirror)
            tgun = ag[cbox[1]:cbox[3], cbox[0]:cbox[2]] & tm
        st = SM.stats(today, bgt, tm, tgun, aim)
        _, ring = today_fill(tm)
        st.update(fill_stats(today, bgt, tm, ring))
        res['today'] = st
        stats_rows[label] = res
        grid.append((label, row))
    return sc, grid, stats_rows, (pw, ph), u


def sheet(grid, size, scale, title):
    pw, ph = size
    gap = 3 * scale if scale > 1 else 4
    fs = 11 if scale == 1 else 8 + 4 * scale
    ft = SC.font(fs)
    line = fs + 3
    head = 2 * line + 4
    W = len(COLS) * (pw * scale + gap) + gap
    H = head + len(grid) * (ph * scale + line + gap) + gap
    out = Image.new('RGBA', (W, H), (12, 14, 18, 255))
    d = ImageDraw.Draw(out)
    d.text((gap, 2), title, fill=(230, 230, 220, 255), font=ft)
    for i, c in enumerate(COLS):
        d.text((gap + i * (pw * scale + gap), 2 + line), c if scale > 1 else c.split(' (')[0], fill=(255, 214, 140, 255),
               font=ft)
    y = head
    for label, row in grid:
        d.text((gap, y), label, fill=(200, 200, 190, 255), font=ft)
        for i, im in enumerate(row):
            if scale > 1:
                im = im.resize((pw * scale, ph * scale), Image.NEAREST)
            out.alpha_composite(im, (gap + i * (pw * scale + gap), y + line))
        y += ph * scale + line + gap
    return out


def context(view, sc, v3, out_dir):
    """True-size window of the real frame: today | v3, idle."""
    f = sc.feet('cur-frame-idle')
    fx, fy = sc.to_png('bg-frame', f['x'], f['y'])
    w, h = (480, 270) if view == 'desktop' else (844, 390)
    box = (max(0, int(round(fx - w * 0.45))), max(0, int(round(fy - h * 0.6))))
    box = (box[0], box[1], box[0] + w, box[1] + h)
    tiles = [sc.shot('cur-frame-idle').crop(box)]
    comp, _ = paste(sc.shot('bg-frame'), v3, 'R:stand-right', (fx, fy), False)
    tiles.append(comp.crop(box))
    gap, head = 6, 36
    out = Image.new('RGBA', (2 * w + 3 * gap, h + head + 2 * gap), (12, 14, 18, 255))
    d = ImageDraw.Draw(out)
    what = ('%s, TRUE SIZE: a 480x270 window of the 1280x720 FAR frame at DPR 1' % view.upper() if view == 'desktop' else
            '%s, TRUE SIZE in device px: an 844x390 device-px window (422x195 css) of the 844x390 css phone frame at DPR 2'
            % view.upper())
    d.text((gap, gap), what, fill=(255, 214, 140, 255), font=SC.font(13))
    names = ['today (in-game screenshot)', 'v3, gun R, composited 1 texel = 1 device px']
    for i, (t, n) in enumerate(zip(tiles, names)):
        x = gap + i * (w + gap)
        d.text((x, gap + 17), n, fill=(220, 220, 210, 255), font=SC.font(13))
        out.alpha_composite(t, (x, gap + head))
    p = os.path.join(out_dir, 'v3-%s-context.png' % view)
    out.convert('RGB').save(p, optimize=True)
    return p


def guns_sheet(view, sc, v3, out_dir):
    """The five guns, idle and aim up-right, true size and nearest 4x on the real frame."""
    f = sc.feet('cur-frame-idle')
    fx, fy = sc.to_png('bg-frame', f['x'], f['y'])
    u = sc.ppt()
    w, h = int(round(3.4 * u)), int(round(3.0 * u))
    box = (int(round(fx - 1.4 * u)), int(round(fy - 2.6 * u)))
    box = (box[0], box[1], box[0] + w, box[1] + h)
    rows = []
    for pose in ('stand-right', 'stand-up-right', 'run-pass-a-right'):
        rows.append([paste(sc.shot('bg-frame'), v3, '%s:%s' % (g, pose), (fx, fy), False)[0].crop(box)
                     for g in 'RSLHF' if '%s:%s' % (g, pose) in v3.index])
    out_paths = []
    for scale in (1, 4):
        gap, head = 4 * (scale if scale > 1 else 1), 16 if scale == 1 else 30
        W = 5 * (w * scale + gap) + gap
        H = head + len(rows) * (h * scale + gap) + gap
        out = Image.new('RGBA', (W, H), (12, 14, 18, 255))
        d = ImageDraw.Draw(out)
        d.text((gap, 2), 'v3 guns R S L H F, %s %s' % (view, 'TRUE SIZE' if scale == 1 else 'nearest x4'),
               fill=(230, 230, 220, 255), font=SC.font(11 if scale == 1 else 20))
        for r, row in enumerate(rows):
            for c, im in enumerate(row):
                im = im.resize((w * scale, h * scale), Image.NEAREST) if scale > 1 else im
                out.alpha_composite(im, (gap + c * (w * scale + gap), head + r * (h * scale + gap)))
        p = os.path.join(out_dir, 'v3-guns-%s-%dx.png' % (view, scale))
        out.convert('RGB').save(p, optimize=True)
        out_paths.append(p)
    return out_paths


def run_gif(view, sc, v3, out_dir, scale=4):
    f = sc.feet('cur-frame-idle')
    fx, fy = sc.to_png('bg-frame', f['x'], f['y'])
    u = sc.ppt()
    w, h = int(round(3.6 * u)), int(round(3.0 * u))
    box = (int(round(fx - 1.5 * u)), int(round(fy - 2.6 * u)))
    box = (box[0], box[1], box[0] + w, box[1] + h)
    frames = []
    for beat in ('contact-a', 'pass-a', 'flight-a', 'contact-b', 'pass-b', 'flight-b'):
        im = paste(sc.shot('bg-frame'), v3, 'R:run-%s-right' % beat, (fx, fy), False)[0].crop(box)
        frames.append(im.convert('RGB').resize((w * scale, h * scale), Image.NEAREST))
    p = os.path.join(out_dir, 'v3-run-cycle-%s-%dx.gif' % (view, scale))
    # 300 ms per stride (src/pure/rig.js RIG_RUN_CYCLE_MS at full speed), 6 beats
    frames[0].save(p, save_all=True, append_images=frames[1:], duration=50, loop=0, optimize=True)
    return p


def inventory(v3, gun, out_dir, scale=3, bg=(38, 46, 50)):
    """Every pose of one gun at one density, in atlas order, on a flat dark card."""
    keys = [k for k in v3.index if k.startswith(gun + ':')]
    cw, ch = v3.d['cell']
    cols = 12
    rows = -(-len(keys) // cols)
    lab = 12
    out = Image.new('RGBA', (cols * (cw * scale + 4) + 4, rows * (ch * scale + lab + 4) + 22), bg + (255,))
    d = ImageDraw.Draw(out)
    d.text((4, 3), 'v3 %s: all %d poses of gun %s, %s (%.2f px/tile), nearest x%d, atlas order' % (
        v3.dn, len(keys), gun, v3.dn, v3.d['pxPerTile'], scale, ), fill=(230, 230, 220, 255), font=SC.font(12))
    ft = SC.font(9)
    for i, k in enumerate(keys):
        x, y = 4 + (i % cols) * (cw * scale + 4), 22 + (i // cols) * (ch * scale + lab + 4)
        d.text((x, y), k.split(':', 1)[1], fill=(180, 185, 175, 255), font=ft)
        out.alpha_composite(v3.image(k).resize((cw * scale, ch * scale), Image.NEAREST), (x, y + lab))
    p = os.path.join(out_dir, 'v3-inventory-%s-%s-%dx.png' % (gun, v3.dn, scale))
    out.convert('RGB').save(p, optimize=True)
    return p


def falsify_sheet(v3, fals, gun, poses, out_dir, scale=8):
    """The anchor check's negative control: the honest cell and the same cell
    with the gun MESH moved down its bore, the exported muzzle anchor (magenta)
    on both."""
    doc = json.load(open(os.path.join(v3.assets, 'rig-v3.json')))
    ox, oy = v3.d['origin']
    ppt = v3.d['pxPerTile']
    cw, ch = v3.d['cell']
    tiles = []
    for pose in poses:
        k = '%s:%s' % (gun, pose)
        i = doc['frames'].index(k)
        mx, my = doc['anchors']['drawnMuzzle'][i]
        ax, ay = ox + mx * ppt, oy - my * ppt
        for name, cand in (('honest', v3), ('mesh moved', fals)):
            im = cand.image(k).resize((cw * scale, ch * scale), Image.NEAREST)
            bgim = Image.new('RGBA', im.size, (38, 46, 50, 255))
            bgim.alpha_composite(im)
            dd = ImageDraw.Draw(bgim)
            X, Y = ax * scale, ay * scale
            dd.line([(X - 10, Y), (X + 10, Y)], fill=(255, 0, 255, 255), width=2)
            dd.line([(X, Y - 10), (X, Y + 10)], fill=(255, 0, 255, 255), width=2)
            dd.text((4, 4), '%s %s' % (k, name), fill=(230, 230, 220, 255), font=SC.font(14))
            tiles.append(bgim)
    W = 2 * (cw * scale + 6) + 6
    H = len(poses) * (ch * scale + 6) + 6
    out = Image.new('RGBA', (W, H), (12, 14, 18, 255))
    for j, t in enumerate(tiles):
        out.alpha_composite(t, (6 + (j % 2) * (cw * scale + 6), 6 + (j // 2) * (ch * scale + 6)))
    p = os.path.join(out_dir, 'anchor-falsify-%s-%s-%dx.png' % (gun, v3.dn, scale))
    out.convert('RGB').save(p, optimize=True)
    return p


BOARD_REFS = [   # (board, RIG box measured on 8x grid zooms, RIG's height in board px, label)
    ('01-exterior-gameplay.png', (548, 366, 640, 436), 64.0, 'board 01'),
    ('13-human-scale-monster-climb-grammar.png', (1255, 218, 1330, 266), 42.0, 'board 13 (panel 3)'),
]


def packet_one(out_dir, rig_px):
    """Image 1 of the operator packet: the desktop and phone true-size
    contexts (today | v3), and the boards' RIG box-downscaled to the same
    on-screen height for reference."""
    ctx = [Image.open(os.path.join(out_dir, 'v3-%s-context.png' % v)).convert('RGB')
           for v in ('desktop', 'phone') if os.path.exists(os.path.join(out_dir, 'v3-%s-context.png' % v))]
    strip_h = 30 + int(max(rig_px.values()) * 1.6)
    W = max(c.width for c in ctx)
    H = sum(c.height for c in ctx) + strip_h + 8
    out = Image.new('RGB', (W, H), (12, 14, 18))
    y = 0
    for c in ctx:
        out.paste(c, (0, y))
        y += c.height
    d = ImageDraw.Draw(out)
    d.text((6, y + 4), "Reference: the boards' RIG box-downscaled to the same on-screen height (%s)" % ', '.join(
        '%s %.0f px' % (k, v) for k, v in rig_px.items()), fill=(220, 220, 210), font=SC.font(12))
    x = 6
    for view, px in rig_px.items():
        for fname, box, h, label in BOARD_REFS:
            im = Image.open(os.path.join(ROOT, 'docs', 'concept-art', fname)).convert('RGB').crop(box)
            k = px / h
            small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
            out.paste(small, (x, y + 22))
            d.text((x, y + 24 + small.height), '%s, %s' % (label, view), fill=(170, 175, 180), font=SC.font(10))
            x += max(small.width, 150) + 14
    p = os.path.join(out_dir, 'packet-1-true-size.png')
    out.save(p, optimize=True)
    return p


def sweep(view, sc, v3):
    """v3 idle slid along the deck row across the frame: fill separation at every stop."""
    f = sc.feet('cur-frame-idle')
    fx, fy = sc.to_png('bg-frame', f['x'], f['y'])
    bg = sc.shot('bg-frame')
    W = bg.width
    clip = sc.meta.get('frameClip') or {}
    xs = list(range(40, W - 40, 4))
    vals, v40 = [], []
    for x in xs:
        comp, (sprite, outline, gun) = paste(bg, v3, 'R:stand-right', (x, fy), False)
        st = fill_stats(comp, bg, sprite, outline)
        vals.append(st['fillContrast'])
        v40.append(st['fill40'])
    vals, v40 = np.array(vals), np.array(v40)
    return {'stops': len(xs), 'xRange': [xs[0], xs[-1]], 'deckY': round(fy, 1),
            'fillContrast': {'min': float(vals.min()), 'p10': float(np.percentile(vals, 10)),
                             'median': float(np.median(vals)), 'max': float(vals.max())},
            'fill40': {'min': float(v40.min()), 'p10': float(np.percentile(v40, 10)), 'median': float(np.median(v40))},
            'stopsBelow40': int((vals < 40).sum())}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scene', required=True)
    ap.add_argument('--assets', default=os.path.join(ROOT, 'assets', 'generated', 'sprites'))
    ap.add_argument('--cells', required=True)
    ap.add_argument('--spike', default='', help='dir with post-desktop/ post-phone/ (tools/art/spike/v3_post.py)')
    ap.add_argument('--spike-a', default='', help='dir with a-desktop/ a-phone/ (tools/art/spike/crisp.py)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-124'))
    ap.add_argument('--views', default='desktop,phone')
    ap.add_argument('--falsify-assets', default='', help='<build>/falsify/assets (build_rig_v3.py --falsify S)')
    ap.add_argument('--falsify-cells', default='')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    allm = {}
    for view in args.views.split(','):
        if not os.path.exists(os.path.join(args.scene, view, 'scene.json')):
            print('skip', view, '(no capture)')
            continue
        v3 = V3(args.assets, args.cells, VIEW_DENSITY[view])
        spike = Spike(os.path.join(args.spike, 'post-' + view)) if args.spike else None
        spike_b = Spike(os.path.join(args.spike, 'post-' + view), 'B') if args.spike else None
        spike_a = Spike(os.path.join(args.spike_a, 'a-' + view), 'A') if args.spike_a else None
        sc, grid, stats_rows, size, u = panels(view, args.scene, v3, spike, spike_a, spike_b)
        title = '%s, %.2f device px/tile (RIG %.0f px)' % (view.upper(), u, 2 * u)
        for scale in (1, 4):
            p = os.path.join(args.out, 'v3-%s-%dx.png' % (view, scale))
            sheet(grid, size, scale, title + ('' if scale == 1 else '  [nearest x4]')).convert('RGB').save(p, optimize=True)
            print(p, os.path.getsize(p))
        print(context(view, sc, v3, args.out))
        for p in guns_sheet(view, sc, v3, args.out):
            print(p)
        print(run_gif(view, sc, v3, args.out))
        allm[view] = {'pxPerTile': u, 'dpr': sc.dpr, 'rows': stats_rows, 'sweep': sweep(view, sc, v3)}
    if allm:
        print(packet_one(args.out, {v: 2 * m['pxPerTile'] for v, m in allm.items()}))
    v16 = V3(args.assets, args.cells, 'd16')
    for g in sorted({k.split(':')[0] for k in v16.index}):
        if g == 'R':
            print(inventory(v16, g, args.out))
    print(inventory(V3(args.assets, args.cells, 'd23'), 'R', args.out, scale=2))
    if args.falsify_assets:
        fals = V3(args.falsify_assets, args.falsify_cells, 'd16')
        print(falsify_sheet(v16, fals, 'S', ['stand-right', 'stand-up-right', 'air-fall-down'], args.out))
    p = os.path.join(args.out, 'measure-v3.json')
    with open(p, 'w') as fh:
        json.dump(allm, fh, indent=1, sort_keys=True)
    keys = ['h', 'colours', 'meanL', 'contrastBehind', 'fillContrast', 'fill40', 'edgeVisible', 'fillEdgeVisible',
            'outlineDark', 'gunPx', 'gunContrast']
    for view, m in allm.items():
        print('==', view, 'px/tile %.2f' % m['pxPerTile'])
        print('%-16s %-7s ' % ('row', 'cand') + ' '.join('%9s' % k[:9] for k in keys))
        for row, res in m['rows'].items():
            for k in ('today', 'spikeB', 'spikeD', 'v3'):
                r = res.get(k) or {}
                print('%-16s %-7s ' % (row[:16], k) + ' '.join('%9s' % r.get(x, '-') for x in keys))
        print('sweep', json.dumps(m['sweep']))
    print(p)


if __name__ == '__main__':
    main()
