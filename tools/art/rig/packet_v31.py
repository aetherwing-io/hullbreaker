"""RIG v3.1 judging packet (T-124 phase 1b, decisions entry 28): PHONE FIRST,
in the operator's own format -- board 01's marine next to the sprite at the
same on-screen height -- plus the numbers behind it.

    /opt/hb-art/bin/python -I tools/art/rig/packet_v31.py --scene <scene dir> --build <preview build dir> \
        [--out reports/tasks/T-124]

<scene>/<view>/ is tools/art/spike/scene_capture.mjs output (RIG-free frames and
today's in-game shots); <build>/render-A|B and <build>/cells-A|B are
build_rig_v31_preview.py output; v3 (the "before") is read from the committed
atlases (assets/generated/sprites/rig-v3*).

Placement as packet.py: every cell is pasted with its sim point on the live
projection of the staged sim point, 1 cell px = 1 device px, never resampled.
Phone = the FAR shot at 844x518 css, DPR 2 (23.37 device px/tile; the central
844x390 css is the phone frame), d23 cells. Desktop = 1280x720 at DPR 1, d16.

Metrics (entry 28 retired entry 27's 40-luma fill rule; readability is
measured on the real hull at true size):
  the spike's   h, colours, meanL, contrastBehind, edgeVisible (share of
                silhouette-edge pixels >= 20 luma from the background pixel
                they touch), outlineDark, gunPx, gunContrast
  edgeDE        share of silhouette-edge pixels >= 15 CIELAB dE76 from the
                background pixel they touch -- the edge a player sees by hue
                as well as value (orange rim on a teal hull at equal luma)
  rimEdge       v3.1 only: share of silhouette-edge pixels drawn in a rim tone (rim, hot, kick)
  fillContrast  the fill's mean |luma - hull| (entry 27's number, kept for
                comparison only; no longer a gate)
  value shares  luma histogram in board_palette.LUMA_BINS, against board 01's
  extent        drawn body height / width in tiles from the cell's pixels,
                against the sim hitbox (CONFIG.player width 0.7, height 1.7)
Hull sweep: the idle cell slid along the deck across the frame, every 4 px:
edgeVisible / edgeDE / fillContrast at every stop -- the darkest hull RIG
can stand in front of on that deck.
Board 01's own marine is measured the same way against its own wall.
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
sys.path.insert(0, os.path.join(ART, 'spike'))
sys.path.insert(0, HERE)
import importlib.util  # noqa: E402
import board_palette as BP  # noqa: E402
import compose as SC  # noqa: E402
import measure as SM  # noqa: E402
import post as PO  # noqa: E402


def _load(name, path):
    # tools/art/spike has a packet.py of its own (and measure.py re-inserts the
    # spike dir first on sys.path): load rig/packet.py by path, unambiguously
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


PK = _load('rig_packet', os.path.join(HERE, 'packet.py'))     # v3's V3 / paste / fill_stats

VIEW_DENSITY = {'desktop': 'd16', 'phone': 'd23'}
GUN31 = [PO.FAMS31.index(n) for n in ('gun_d', 'gun_m', 'gun_l', 'gun_acc', 'gun_rust')]
HITBOX = {'width': 0.7, 'height': 1.7}          # src/config.js CONFIG.player
# row: (label, today's in-game shot or None, RIG-free shot, v3.1 pose, v3 frame for the "before")
ROWS = [
    ('idle, aim right', 'cur-frame-idle', 'bg-frame', 'stand-right', 'R:stand-right'),
    ('firing (flash: the game\'s own)', 'cur-firep', 'bg-firep', 'stand-fire-right', 'R:stand-fire-right'),
    ('aim up-right', 'cur-upright', 'bg-frame', 'stand-up-right', 'R:stand-up-right'),
    ('aim up', None, 'bg-frame', 'stand-up', 'R:stand-up'),
    ('jump (rise)', 'cur-jump', 'bg-jump', 'air-rise-right', 'R:air-rise-right'),
    ('run (pass)', 'cur-run', 'bg-frame', 'run-pass-a-right', 'R:run-pass-a-right'),
]
PANEL_W, PANEL_H, PANEL_LEFT, PANEL_TOP = 4.2, 3.0, 1.7, 2.45     # tiles
BG = (12, 14, 18, 255)
INK = (230, 230, 220, 255)
GOLD = (255, 214, 140, 255)
DIM = (170, 175, 180, 255)


class Cells31:
    """v3.1 preview cells (post.py --look v31): pixels + the part map."""

    def __init__(self, build, hold, dn):
        self.dir = os.path.join(build, 'cells-' + hold, dn, 'R')
        self.meta = json.load(open(os.path.join(build, 'render-' + hold, 'meta-R.json')))
        self.dn, self.hold = dn, hold
        self.ppt = PO.DENSITIES[dn]
        cw, ch, ox, oy = PO.cell_geometry(self.meta, self.ppt)
        self.cell, self.o = (cw, ch), (ox, oy)

    def image(self, frame):
        return Image.open(os.path.join(self.dir, frame.split(':')[-1] + '.png')).convert('RGBA')

    def origin(self, frame):
        return self.o

    def parts(self, frame):
        return np.load(os.path.join(self.dir, frame.split(':')[-1] + '-parts.npz'))

    def masks(self, frame):
        z = self.parts(frame)
        return z['fam'] >= 0, z['outline'], np.isin(z['fam'], GUN31)

    def extent(self, frame):
        """Drawn body (gun excluded) and whole-sprite extent in tiles from the sim point."""
        z = self.parts(frame)
        f = z['fam']
        body = (f >= 0) & ~np.isin(f, GUN31)
        ox, oy = self.o
        u = self.ppt
        ys, xs = np.nonzero(body)
        ya, xa = np.nonzero(f >= 0)
        r = lambda v: round(float(v), 3)
        return {'top': r((oy - ys.min()) / u), 'bottom': r((oy - ys.max() - 1) / u),
                'left': r((xs.min() - ox) / u), 'right': r((xs.max() + 1 - ox) / u),
                'height': r((ys.max() + 1 - ys.min()) / u), 'width': r((xs.max() + 1 - xs.min()) / u),
                'centreX': r(((xs.min() + xs.max() + 1) / 2 - ox) / u),
                'withGun': {'top': r((oy - ya.min()) / u), 'left': r((xa.min() - ox) / u),
                            'right': r((xa.max() + 1 - ox) / u)}}


# --------------------------------------------------------------- metrics
def srgb_to_lab(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def edge_de(comp, mask, thresh=15.0):
    """Share of silhouette-edge PIXELS whose dE76 to some touching outside pixel >= thresh."""
    lab = srgb_to_lab(np.asarray(comp.convert('RGB')))
    iy, ix, oy, ox = SM.edge_pairs(mask.astype(bool))
    de = np.sqrt(((lab[iy, ix] - lab[oy, ox]) ** 2).sum(-1))
    px = {}
    for a, b, v in zip(iy, ix, de >= thresh):
        px[(a, b)] = px.get((a, b), False) | bool(v)
    return round(float(np.mean(list(px.values()))), 3) if px else None, \
        round(float(np.median(de)), 1) if len(de) else None


def value_shares(comp, mask):
    L = SM.luma(comp)[mask.astype(bool)]
    return BP.luma_shares(L)


def rim_edge(parts, mask_cell):
    f, t = parts['fam'], parts['tone']
    op = f >= 0
    edge = np.zeros_like(op)
    for dy, dx in SM.N4:
        edge |= op & ~PO.shifted(op, dy, dx, False)
    return round(float(np.isin(t[edge], (5, 6, 7)).mean()), 3) if edge.any() else None


def measure_panel(crop, bgc, sprite, outline, gun, aim):
    st = SM.stats(crop, bgc, sprite, gun, aim) or {}
    st.update(PK.fill_stats(crop, bgc, sprite, outline))
    st['edgeDE'], st['edgeDEmedian'] = edge_de(crop, sprite)
    st['valueShares'] = value_shares(crop, sprite)
    return st


def board_marine_stats():
    """Board 01's marine against its own wall: the same edge metrics."""
    img, m, _ = BP.b01_mask()
    x0, y0, x1, y1 = BP.B01_BOX
    pad = 3
    crop = Image.fromarray(img[y0 - pad:y1 + pad, x0 - pad:x1 + pad].astype(np.uint8)).convert('RGBA')
    mask = np.zeros((y1 - y0 + 2 * pad, x1 - x0 + 2 * pad), bool)
    mask[pad:-pad, pad:-pad] = m
    L = SM.luma(crop)
    iy, ix, oy, ox = SM.edge_pairs(mask)
    d = np.abs(L[iy, ix] - L[oy, ox])
    px = {}
    for a, b, v in zip(iy, ix, d >= 20):
        px[(a, b)] = px.get((a, b), False) | bool(v)
    de, de_med = edge_de(crop, mask)
    return {'px': int(mask.sum()), 'meanL': round(float(L[mask].mean()), 1), 'edgeVisible': round(float(np.mean(list(px.values()))), 3),
            'edgeDE': de, 'edgeDEmedian': de_med, 'valueShares': value_shares(crop, mask),
            'heightPx': int(np.ptp(np.nonzero(m.any(1))[0]) + 1)}


# --------------------------------------------------------------- scene
def scene(scene_root, view):
    sc = SC.Scene.__new__(SC.Scene)
    sc.dir = os.path.join(scene_root, view)
    sc.meta = json.load(open(os.path.join(sc.dir, 'scene.json')))
    sc.dpr = sc.meta['dpr']
    sc.imgs = {}
    return sc


def feet_at(sc, cur, bg):
    """Where the sim point projects in shot `bg` (today's matching shot gives the feet)."""
    f = sc.feet(cur if cur in sc.meta['shots'] else 'cur-frame-idle')
    return sc.to_png(bg, f['x'], f['y']), f


def panel(sc, cand, frame, bg, at, box, aim=0.0, mirror=False):
    comp, (sprite, outline, gun) = PK.paste(sc.shot(bg), cand, frame, at, mirror)
    crop = comp.crop(box)
    sl = (slice(box[1], box[3]), slice(box[0], box[2]))
    st = measure_panel(crop, sc.shot(bg).crop(box), sprite[sl], outline[sl], gun[sl], aim)
    return crop, st


def label_img(im, text, fs=11, colour=INK, pad=3):
    ft = SC.font(fs)
    out = Image.new('RGBA', (im.width, im.height + fs + 2 * pad), BG)
    ImageDraw.Draw(out).text((pad, 1), text, fill=colour, font=ft)
    out.alpha_composite(im, (0, fs + 2 * pad))
    return out


def grid(rows, gap=6, title=None, fs=13):
    """rows: [[RGBA, ...], ...] -> one sheet (cells top-left aligned)."""
    cw = [max(r[i].width for r in rows if i < len(r)) for i in range(max(len(r) for r in rows))]
    rh = [max(im.height for im in r) for r in rows]
    head = fs + 10 if title else 0
    W = sum(cw) + gap * (len(cw) + 1)
    H = head + sum(rh) + gap * (len(rows) + 1)
    out = Image.new('RGBA', (W, H), BG)
    if title:
        ImageDraw.Draw(out).text((gap, 4), title, fill=GOLD, font=SC.font(fs))
    y = head + gap
    for r, h in zip(rows, rh):
        x = gap
        for i, im in enumerate(r):
            out.alpha_composite(im, (x, y))
            x += cw[i] + gap
        y += h + gap
    return out


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST) if k > 1 else im


# --------------------------------------------------------------- the sheets
def board_crop_at_height(target_px):
    """Board 01's marine box, box-downscaled so the marine is target_px tall
    (the operator's 'board 01, phone' reference, image 1)."""
    img = Image.open(os.path.join(ROOT, 'docs', 'concept-art', BP.B01)).convert('RGB')
    _, m, _ = BP.b01_mask()
    rows = np.nonzero(m.any(1))[0]
    marine_h = rows.max() - rows.min() + 1
    x0, y0, x1, y1 = PK.BOARD_REFS[0][1]
    crop = img.crop((x0 - 4, y0 - 4, x1 + 4, y1 + 4))
    k = target_px / marine_h
    return crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.BOX).convert('RGBA'), \
        int(marine_h)


def sheet1(sc, cands, v3, out_dir, view='phone'):
    """THE sheet: board 01 | v3.1 (jump, run) | v3 before, same on-screen height, per hold."""
    u = sc.ppt()
    pw, ph = int(round(PANEL_W * u)), int(round(PANEL_H * u))
    rows_1x, rows_4x, info = [], [], {}
    for hold, cand in cands.items():
        row = []
        ext = cand.extent('air-rise-right')
        target = ext['height'] * u
        board, bh = board_crop_at_height(target)
        info[hold] = {'v31JumpHeightPx': round(target, 1), 'boardMarinePx': bh, 'boardScale': round(target / bh, 4)}
        row.append(('board 01 @%dpx' % round(target), board))
        for pose, cur, bg in (('air-rise-right', 'cur-jump', 'bg-jump'), ('run-pass-a-right', 'cur-run', 'bg-frame')):
            (fx, fy), _ = feet_at(sc, cur if pose.startswith('air') else 'cur-frame-idle', bg)
            box = (int(round(fx - PANEL_LEFT * u)), int(round(fy - PANEL_TOP * u)))
            box = box + (box[0] + pw, box[1] + ph)
            im, _ = panel(sc, cand, 'R:' + pose, bg, (fx, fy), box)
            row.append(('v3.1 %s %s' % (hold, pose.split('-')[0] if pose.startswith('run') else 'jump'), im))
        for pose, bg in (('R:air-rise-right', 'bg-jump'), ('R:run-pass-a-right', 'bg-frame')):
            cur = 'cur-jump' if 'air' in pose else 'cur-frame-idle'
            (fx, fy), _ = feet_at(sc, cur, bg)
            box = (int(round(fx - PANEL_LEFT * u)), int(round(fy - PANEL_TOP * u)))
            box = box + (box[0] + pw, box[1] + ph)
            im, _ = panel(sc, v3, pose, bg, (fx, fy), box)
            row.append(('v3 (before) %s' % ('jump' if 'air' in pose else 'run'), im))
        rows_1x.append([label_img(im, '%s' % t, 9) for t, im in row])
        rows_4x.append([label_img(up(im, 4), t, 16) for t, im in row])
    holds = ' | '.join('%s: %s' % (h, c.meta['hold']['what']) for h, c in cands.items())
    top = grid(rows_1x, fs=11)
    big = grid(rows_4x, title='the same, nearest x4 -- board 01 crop box-downscaled to v3.1\'s jump height, then x4', fs=18)
    out = Image.new('RGBA', (max(top.width, big.width), top.height + big.height + 54), BG)
    d = ImageDraw.Draw(out)
    d.text((6, 4), 'PHONE, TRUE SIZE (DPR 2, %.1f device px/tile): board 01 | v3.1 jump, run | v3 (before) jump, run'
           % u, fill=GOLD, font=SC.font(12))
    out.alpha_composite(top, (0, 20))
    d.text((6, top.height + 26), holds[:220], fill=DIM, font=SC.font(12))
    out.alpha_composite(big, (0, top.height + 50))
    p = os.path.join(out_dir, 'v31-1-board-vs-sprite-%s.png' % view)
    out.convert('RGB').save(p, optimize=True)
    return p, info


def sheet_window(sc, cands, out_dir, view='phone'):
    """True-size phone window on the real hull: today | v3.1 A | v3.1 B (idle,
    the full FAR frame), then the frozen firing frame (the capture's 82x54 css
    crop around RIG, with the game's own muzzle flash alive) at 1x and x4."""
    w, h = (844, 390) if view == 'phone' else (480, 270)
    (fx, fy), _ = feet_at(sc, 'cur-frame-idle', 'bg-frame')
    box = (max(0, int(round(fx - w * 0.45))), max(0, int(round(fy - h * 0.62))))
    box = box + (box[0] + w, box[1] + h)
    rows = [[label_img(sc.shot('cur-frame-idle').crop(box), 'today (in-game screenshot), idle', 13)]]
    for hold, cand in cands.items():
        comp, _ = PK.paste(sc.shot('bg-frame'), cand, 'R:stand-right', (fx, fy), False)
        rows.append([label_img(comp.crop(box), 'v3.1 hold %s, idle (stand-right)' % hold, 13)])
    if 'cur-firep' in sc.meta['shots']:
        (gx, gy), _ = feet_at(sc, 'cur-firep', 'bg-firep')
        fire = [('today', sc.shot('cur-firep'))]
        for hold, cand in cands.items():
            fire.append(('hold %s' % hold, PK.paste(sc.shot('bg-firep'), cand, 'R:stand-fire-right', (gx, gy), False)[0]))
        strip = [label_img(im, t, 11) for t, im in fire] + [label_img(up(im, 4), t + ' x4', 14) for t, im in fire]
        rows.append([grid([strip[:3], strip[3:]], title='firing, frozen frame: the muzzle flash is the GAME\'s own effect '
                          '(src/render/juice.js onShotSpawned), drawn at today\'s bore 1.05 -- hold B\'s mock gun '
                          'sits 0.23 tiles above it', fs=13)])
    out = grid(rows, title='%s, TRUE SIZE in device px (1 sprite px = 1 device px): a %dx%d window of the FAR frame'
               % (view.upper(), w, h), fs=14)
    p = os.path.join(out_dir, 'v31-2-window-%s.png' % view)
    out.convert('RGB').save(p, optimize=True)
    return p


def sheet_holds(sc, cands, today_ok, out_dir, view='phone'):
    """Hold A | hold B (| today) for the six poses, true size and x4; + the measurements."""
    u = sc.ppt()
    pw, ph = int(round(PANEL_W * u)), int(round(PANEL_H * u))
    stats = {}
    rows = []
    for label, cur, bg, pose, v3f in ROWS:
        if bg not in sc.meta['shots']:
            continue
        (fx, fy), _ = feet_at(sc, cur or 'cur-frame-idle', bg)
        box = (int(round(fx - PANEL_LEFT * u)), int(round(fy - PANEL_TOP * u)))
        box = box + (box[0] + pw, box[1] + ph)
        aim = 45.0 if 'up-right' in pose else (90.0 if pose.endswith('-up') else 0.0)
        row, res = [], {}
        if cur and cur in sc.meta['shots']:
            cx, cy = sc.to_png(cur, sc.feet(cur)['x'], sc.feet(cur)['y'])
            cbox = (int(round(cx - PANEL_LEFT * u)), int(round(cy - PANEL_TOP * u)))
            today = sc.shot(cur).crop(cbox + (cbox[0] + pw, cbox[1] + ph))
            bgt = sc.shot('bg-frame' if bg == 'bg-frame' else bg)
            bx, by = sc.to_png(bg, sc.feet(cur)['x'], sc.feet(cur)['y'])
            bb = (int(round(bx - PANEL_LEFT * u)), int(round(by - PANEL_TOP * u)))
            bgc = bgt.crop(bb + (bb[0] + pw, bb[1] + ph))
            tm = SM.today_mask(today, bgc, (int(round((PANEL_LEFT - 1.3) * u)), int(round((PANEL_TOP - 2.45) * u)),
                                            int(round((PANEL_LEFT + 1.4) * u)), int(round((PANEL_TOP + 0.15) * u))))
            st = SM.stats(today, bgc, tm, None, aim) or {}
            _, ring = PK.today_fill(tm)
            st.update(PK.fill_stats(today, bgc, tm, ring))
            st['edgeDE'], st['edgeDEmedian'] = edge_de(today, tm)
            st['valueShares'] = value_shares(today, tm)
            res['today'] = st
            row.append(today)
        else:
            row.append(Image.new('RGBA', (pw, ph), BG))
        for hold, cand in cands.items():
            im, st = panel(sc, cand, 'R:' + pose, bg, (fx, fy), box, aim)
            st['rimEdge'] = rim_edge(cand.parts(pose), None)
            st['extent'] = cand.extent(pose)
            res[hold] = st
            row.append(im)
        stats[label] = res
        rows.append((label, row))
    out_paths = []
    for k in (1, 4):
        fs = 10 if k == 1 else 16
        heads = ('today', 'A: bore 1.05', 'B: mock 1.28') if k == 1 else \
            ('today (in-game)', 'v3.1 hold A (today\'s bore)', 'v3.1 hold B (MOCK: raised bore)')
        head = [label_img(Image.new('RGBA', (pw * k, 1), BG), t, fs, GOLD) for t in heads]
        body = [[label_img(up(im, k), (label.split(' (')[0] if k == 1 else label) if i == 0 else '', fs)
                 for i, im in enumerate(r)] for label, r in rows]
        out = grid([head] + body, title='%s %s: %.1f device px/tile' % (view.upper(), 'TRUE SIZE' if k == 1 else 'nearest x4', u),
                   fs=12 if k == 1 else 20)
        p = os.path.join(out_dir, 'v31-4-holds-%s-%dx.png' % (view, k))
        out.convert('RGB').save(p, optimize=True)
        out_paths.append(p)
    return out_paths, stats


def run_gif(sc, cands, out_dir, view='phone', k=4):
    u = sc.ppt()
    (fx, fy), _ = feet_at(sc, 'cur-frame-idle', 'bg-frame')
    w, h = int(round(3.6 * u)), int(round(2.8 * u))
    box = (int(round(fx - 1.6 * u)), int(round(fy - 2.4 * u)))
    box = box + (box[0] + w, box[1] + h)
    frames = []
    for beat in ('contact-a', 'pass-a', 'flight-a', 'contact-b', 'pass-b', 'flight-b'):
        tiles = []
        for hold, cand in cands.items():
            im = PK.paste(sc.shot('bg-frame'), cand, 'R:run-%s-right' % beat, (fx, fy), False)[0].crop(box)
            tiles.append(label_img(up(im, k), 'hold %s' % hold, 16))
        frames.append(grid([tiles], fs=12).convert('RGB'))
    p = os.path.join(out_dir, 'v31-3-run-cycle-%s-%dx.gif' % (view, k))
    frames[0].save(p, save_all=True, append_images=frames[1:], duration=50, loop=0, optimize=True)
    return p


def sheet_hitbox(sc, cands, v3, out_dir, view='phone', k=4):
    """The drawn figure against the SIM hitbox (CONFIG.player 0.7 x 1.7 tiles,
    centred on the sim point) and the bore lines: today's 1.05 (A) and
    hold B's mock 1.28. Idle and run, on the real hull, nearest x4."""
    u = sc.ppt()
    (fx, fy), _ = feet_at(sc, 'cur-frame-idle', 'bg-frame')
    w, h = int(round(2.8 * u)), int(round(2.3 * u))
    box = (int(round(fx - 1.2 * u)), int(round(fy - 2.05 * u)))
    box = box + (box[0] + w, box[1] + h)
    cur = sc.shot('cur-frame-idle').crop(box)
    tiles = [('today', cur)]
    tiles.append(('v3 (before)', PK.paste(sc.shot('bg-frame'), v3, 'R:stand-right', (fx, fy), False)[0].crop(box)))
    for hold, cand in cands.items():
        for pose in ('stand-right', 'run-pass-a-right'):
            tiles.append(('v3.1 %s %s' % (hold, pose.split('-')[0]),
                          PK.paste(sc.shot('bg-frame'), cand, 'R:' + pose, (fx, fy), False)[0].crop(box)))
    out_tiles = []
    for name, im in tiles:
        im = up(im, k)
        d = ImageDraw.Draw(im)
        ox, oy = (fx - box[0]) * k, (fy - box[1]) * k
        hw, hh = HITBOX['width'] / 2 * u * k, HITBOX['height'] * u * k
        d.rectangle([ox - hw, oy - hh, ox + hw, oy], outline=(0, 255, 255, 255), width=2)
        for yb, col in ((1.05, (255, 0, 255, 255)), (1.28, (255, 255, 0, 255))):
            Y = oy - yb * u * k
            d.line([(ox - hw - 6, Y), (ox + hw + 6, Y)], fill=col, width=2)
        out_tiles.append(label_img(im, name, 16))
    out = grid([out_tiles[:3], out_tiles[3:]], title='%s x%d: cyan = sim hitbox 0.7x1.7; magenta = bore 1.05 (A); '
               'yellow = mock bore 1.28 (B)' % (view.upper(), k), fs=14)
    p = os.path.join(out_dir, 'v31-5-hitbox-%s-%dx.png' % (view, k))
    out.convert('RGB').save(p, optimize=True)
    return p


def flat_sweep(cand, frame='R:stand-right', hue=(0.62, 0.86, 0.92)):
    """The cell on FLAT backgrounds of rising luma (the game hull's teal-grey
    hue): edgeVisible / edgeDE at each -- where the dark figure stops reading."""
    out = {}
    spr = cand.image(frame)
    m = np.asarray(spr)[..., 3] > 0
    pad = 3
    for b in (10, 20, 30, 40, 50, 60, 80, 100, 130, 160):
        k = b / (np.array(hue) @ SM.LUMA)
        col = tuple(int(round(min(255, c * k))) for c in hue)
        bg = Image.new('RGBA', (spr.width + 2 * pad, spr.height + 2 * pad), col + (255,))
        bg.alpha_composite(spr, (pad, pad))
        mm = np.zeros((bg.height, bg.width), bool)
        mm[pad:-pad, pad:-pad] = m
        st = SM.stats(bg, Image.new('RGBA', bg.size, col + (255,)), mm, None, 0.0)
        out[b] = {'edgeVisible': st['edgeVisible'], 'edgeDE': edge_de(bg, mm)[0]}
    return out


def sweep(sc, cand):
    (fx, fy), _ = feet_at(sc, 'cur-frame-idle', 'bg-frame')
    bg = sc.shot('bg-frame')
    xs = list(range(40, bg.width - 40, 4))
    ev, de, fc = [], [], []
    for x in xs:
        comp, (sprite, outline, gun) = PK.paste(bg, cand, 'R:stand-right', (x, fy), False)
        ys_, xs_ = np.nonzero(sprite)
        box = (max(0, xs_.min() - 2), max(0, ys_.min() - 2), min(bg.width, xs_.max() + 3), min(bg.height, ys_.max() + 3))
        sl = (slice(box[1], box[3]), slice(box[0], box[2]))
        crop, bgc = comp.crop(box), bg.crop(box)
        st = SM.stats(crop, bgc, sprite[sl], None, 0.0)
        ev.append(st['edgeVisible'])
        de.append(edge_de(crop, sprite[sl])[0])
        fc.append(PK.fill_stats(crop, bgc, sprite[sl], outline[sl])['fillContrast'])

    def s(v):
        v = np.array(v, dtype=float)
        return {'min': round(float(v.min()), 3), 'p10': round(float(np.percentile(v, 10)), 3),
                'median': round(float(np.median(v)), 3), 'max': round(float(v.max()), 3)}
    return {'stops': len(xs), 'deckY': round(fy, 1), 'edgeVisible': s(ev), 'edgeDE': s(de), 'fillContrast': s(fc),
            'worstEdgeVisibleAtX': int(xs[int(np.argmin(ev))])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scene', required=True)
    ap.add_argument('--build', required=True)
    ap.add_argument('--assets', default=os.path.join(ROOT, 'assets', 'generated', 'sprites'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-124'))
    ap.add_argument('--views', default='phone,desktop')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    allm = {'board01Marine': board_marine_stats(), 'hitbox': HITBOX}
    for view in args.views.split(','):
        if not os.path.exists(os.path.join(args.scene, view, 'scene.json')):
            continue
        dn = VIEW_DENSITY[view]
        sc = scene(args.scene, view)
        cands = {h: Cells31(args.build, h, dn) for h in ('A', 'B')}
        v3 = PK.V3(args.assets, os.path.join(ART, 'build', 'rig-v3', 'cells'), dn)
        m = {'pxPerTile': sc.ppt(), 'dpr': sc.dpr, 'density': dn}
        if view == 'phone':
            p, m['sheet1'] = sheet1(sc, cands, v3, args.out, view)
            print(p)
            print(sheet_window(sc, cands, args.out, view))
            print(run_gif(sc, cands, args.out, view))
        paths, m['rows'] = sheet_holds(sc, cands, True, args.out, view)
        print(*paths)
        # v3 (before) on the same panels, for the table
        u = sc.ppt()
        pw, ph = int(round(PANEL_W * u)), int(round(PANEL_H * u))
        for label, cur, bg, pose, v3f in ROWS:
            if label not in m['rows'] or v3f not in v3.index:
                continue
            (fx, fy), _ = feet_at(sc, cur or 'cur-frame-idle', bg)
            box = (int(round(fx - PANEL_LEFT * u)), int(round(fy - PANEL_TOP * u)))
            box = box + (box[0] + pw, box[1] + ph)
            aim = 45.0 if 'up-right' in pose else (90.0 if pose.endswith('-up') else 0.0)
            _, st = panel(sc, v3, v3f, bg, (fx, fy), box, aim)
            m['rows'][label]['v3'] = st
        m['sweep'] = {h: sweep(sc, c) for h, c in cands.items()}
        m['sweep']['v3'] = sweep(sc, v3)
        m['flatSweep'] = {h: flat_sweep(c) for h, c in cands.items()}
        m['flatSweep']['v3'] = flat_sweep(v3)
        if view == 'phone':
            print(sheet_hitbox(sc, cands, v3, args.out, view))
        allm[view] = m
    p = os.path.join(args.out, 'measure-v31.json')
    with open(p, 'w') as fh:
        json.dump(allm, fh, indent=1, sort_keys=True)
    keys = ['h', 'colours', 'meanL', 'contrastBehind', 'fillContrast', 'edgeVisible', 'edgeDE', 'rimEdge',
            'outlineDark', 'gunPx', 'gunContrast']
    print('board01 marine', json.dumps(allm['board01Marine']))
    for view in args.views.split(','):
        if view not in allm:
            continue
        m = allm[view]
        print('==', view, 'px/tile %.2f' % m['pxPerTile'])
        print('%-30s %-6s ' % ('row', 'cand') + ' '.join('%9s' % k[:9] for k in keys))
        for row, res in m['rows'].items():
            for k in ('today', 'v3', 'A', 'B'):
                r = res.get(k) or {}
                print('%-30s %-6s ' % (row[:30], k) + ' '.join('%9s' % r.get(x, '-') for x in keys))
        for k, s in m['sweep'].items():
            print('sweep', k, json.dumps(s))
        for k, s in m['flatSweep'].items():
            print('flat', k, ' '.join('L%s:%.2f/%.2f' % (b, v['edgeVisible'], v['edgeDE']) for b, v in s.items()))
    print(p)


if __name__ == '__main__':
    main()
