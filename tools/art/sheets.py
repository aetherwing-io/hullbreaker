"""Contact sheets: current (AI-painted) art vs v2 (3D -> sprite), at true size.

    /opt/hb-art/bin/python tools/art/sheets.py [--out reports/tasks/T-109]

Inputs: the in-game captures written by tools/art/capture/current-art.mjs
(tools/art/build/current/), and the v2 sheets in assets/generated/sprites/art-v2/.

Every comparison cell is three panels:
  CURRENT  the shipped renderer's own pixels (in-game crop, lit + tone-mapped)
  V2       the v2 atlas cell, composited UNLIT onto the identical background
           (the same clip with RIG out of it; see current-art.mjs), its sim
           point on RIG's measured screen position. Palette-exact: what an
           unlit, nearest-sampled sprite would show. Air and climb rows have
           no RIG-free crop, so v2 sits on a flat patch of that crop's median
           colour there.
  V2 LIT~  the same pixels times a per-channel gain measured from how the
           shipped lit material darkens the CURRENT sprite (in-game RIG pixels
           vs the current atlas frame's own texels). An approximation of
           "v2 through today's material"; phase B decides the material.

1x sheets are the judgement scale; 4x sheets are nearest-neighbour blow-ups
for inspecting pixels. Nothing here is a gameplay value.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(HERE, 'lib'))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

CUR = os.path.join(HERE, 'build', 'current')
V2 = os.path.join(ROOT, 'assets', 'generated', 'sprites', 'art-v2')
FONT = ImageFont.load_default()
INK = (8, 12, 16)
TXT = (242, 212, 155)

RIG_PAIRS = [
    ('stand-right-R', 'R:stand-right', 'idle aim right / R'),
    ('stand-up-right-R', 'R:stand-up-right', 'aim up-right / R'),
    ('stand-up-R', 'R:stand-up', 'aim up / R'),
    ('stand-down-right-R', 'R:stand-down-right', 'aim down-right / R'),
    ('stand-right-S', 'S:stand-right', 'S spread'),
    ('stand-right-L', 'L:stand-right', 'L laser'),
    ('stand-right-H', 'H:stand-right', 'H homing'),
    ('stand-right-F', 'F:stand-right', 'F flame'),
    ('run-contact-right-R', 'R:run-contact-a-right', 'run contact'),
    ('run-pass-right-R', 'R:run-pass-a-right', 'run pass'),
    ('run-flight-right-R', 'R:run-flight-a-right', 'run flight'),
    ('air-rise-right-R', 'R:air-rise-right', 'jump rise'),
    ('air-fall-right-R', 'R:air-fall-right', 'jump fall'),
    ('climb-0-up-R', 'R:climb-0-up', 'climb 0 (aim up)'),
    ('climb-1-up-R', 'R:climb-1-up', 'climb 1 (aim up)'),
    ('climb-2-up-R', 'R:climb-2-up', 'climb 2 (aim up)'),
    ('climb-3-up-R', 'R:climb-3-up', 'climb 3 (aim up)'),
]


_AIMS = {(1, 0): 'right', (1, 1): 'up-right', (0, 1): 'up', (1, -1): 'down-right', (0, -1): 'down'}


def v2_key(key, row):
    """The v2 frame for a capture row: the pair's state at the aim the capture
    actually had (recorded sim aim), so a crop is never paired with a frame
    aiming elsewhere. Returns (key, aim name)."""
    ax, ay = row['player']['aim']
    sx = 0 if abs(ax) < 0.2 else 1                     # authored facing +1
    sy = 0 if abs(ay) < 0.2 else (1 if ay > 0 else -1)
    aim = _AIMS[(sx, sy)]
    for suffix in ('down-right', 'up-right', 'right', 'up', 'down'):
        if key.endswith('-' + suffix):
            return key[:-len(suffix)] + aim, aim
    return key, aim


def load_sheet(name):
    meta = json.load(open(os.path.join(V2, name + '.json')))
    atlas = Image.open(os.path.join(V2, meta['atlas']['file'])).convert('RGBA')
    return meta, atlas


def cell(meta, atlas, key):
    fr = meta['frames'][key]
    return atlas.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))


def place(bg, sprite, origin, at):
    im = bg.copy()
    im.alpha_composite(sprite, (int(round(at[0] - origin[0])), int(round(at[1] - origin[1]))))
    return im


def background_of(view, row):
    """The RIG-free crop for a capture row (older captures lost the key when a
    later crop reused the label; the file name is deterministic)."""
    if row.get('background'):
        return row['background']
    p = os.path.join(CUR, '%s-bg-stand-right-R.png' % view)
    return p if os.path.exists(p) else None


def register(bg, img, exclude, max_dx=10, max_dy=4):
    """Integer shift (dx, dy) with img[y, x] ~= bg[y + dy, x + dx], ignoring a
    column band (the actor). The capture's camera keeps scrolling a few px
    between a staged pose and its screenshot; this measures it from pixels."""
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    b = np.asarray(bg.convert('RGB'), dtype=np.float64)
    H, W = a.shape[:2]
    best = None
    for dy in range(-max_dy, max_dy + 1):
        for dx in range(-max_dx, max_dx + 1):
            ys = slice(max(0, -dy), min(H, H - dy))
            xs = slice(max(0, -dx), min(W, W - dx))
            A = a[ys, xs]
            B = b[max(0, dy):max(0, dy) + A.shape[0], max(0, dx):max(0, dx) + A.shape[1]]
            m = np.ones(A.shape[:2], bool)
            x0 = max(0, -dx)
            m[:, max(0, exclude[0] - x0):max(0, exclude[1] - x0)] = False
            if m.sum() < 50:
                continue
            e = float(np.abs(A - B).sum(axis=2)[m].mean())
            if best is None or e < best[0]:
                best = (e, dx, dy)
    return best


def actor_mask(bg, img):
    """The actor's pixels in an in-game crop: register the RIG-free background
    to it, threshold the difference, keep the largest 8-connected blob."""
    import cv2
    W = img.size[0]
    err, dx, dy = register(bg, img, (int(W * 0.30), int(W * 0.75)))
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    b = np.asarray(bg.convert('RGB'), dtype=np.float64)
    H = a.shape[0]
    sh = np.zeros_like(a)
    ys = slice(max(0, -dy), min(H, H - dy))
    xs = slice(max(0, -dx), min(W, W - dx))
    sh[ys, xs] = b[max(0, dy):max(0, dy) + (ys.stop - ys.start), max(0, dx):max(0, dx) + (xs.stop - xs.start)]
    mask = (np.abs(a - sh).sum(axis=2) > 36).astype(np.uint8)
    mask[:, :int(W * 0.20)] = 0
    mask[:, int(W * 0.85):] = 0
    # The camera drift is not a whole pixel, so the deck's lip leaves a 1 px
    # tall difference seam; a 2x1 vertical opening removes 1 px tall lines
    # and keeps every part of RIG (all >= 2 px tall at this size).
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 1), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 1:
        raise ValueError('no actor found in the crop')
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    bx, by, bw, bh = stats[big, :4]
    keep = np.zeros_like(mask, dtype=bool)
    for k in range(1, n):
        x, y, w, h, area = stats[k]
        near = (x < bx + bw + 4 and x + w > bx - 4 and y < by + bh + 4 and y + h > by - 4)
        if k == big or (area >= 4 and near):
            keep |= lab == k
    return keep, sh, (dx, dy, round(err, 2))


def feet_in_background(view, v):
    """Where the CURRENT RIG's boots stand, in the background crop's pixels:
    v2's sim point is placed there so both stand on the same spot."""
    row = v['captures']['stand-right-R']
    bg = Image.open(background_of(view, row))
    img = Image.open(row['path'])
    m, _, (dx, dy, err) = actor_mask(bg, img)
    yy, xx = np.nonzero(m)
    bottom = int(yy.max())
    boots = xx[yy >= bottom - 2]
    return ((float(boots.min()) + float(boots.max()) + 1) / 2 + dx, bottom + 1 + dy), (dx, dy, err)


def lit_gain(cap, view):
    """Per-channel gain current-in-game / current-texels for the aim-right frame."""
    row = cap['views'][view]['captures'].get('stand-right-R')
    if not row or not background_of(view, row):
        return None
    row = dict(row, background=background_of(view, row))
    a = np.asarray(Image.open(row['path']).convert('RGB'), dtype=np.float64)
    m, _, _ = actor_mask(Image.open(row['background']), Image.open(row['path']))
    if m.sum() < 20:
        return None
    ingame = a[m].mean(axis=0)
    src = Image.open(os.path.join(ROOT, 'assets/generated/sprites/rig-slender-aim-atlas-v2.png')).convert('RGBA')
    tex = np.asarray(src.crop((132, 297, 132 + 248, 297 + 429)), dtype=np.float64)
    w = tex[..., 3] / 255.0
    texel = (tex[..., :3] * w[..., None]).sum(axis=(0, 1)) / w.sum()
    return np.clip(ingame / texel, 0.05, 1.5), ingame.tolist(), texel.tolist()


def apply_gain(img, gain):
    a = np.asarray(img, dtype=np.float64).copy()
    a[..., :3] = np.clip(a[..., :3] * gain, 0, 255)
    return Image.fromarray(a.round().astype(np.uint8), 'RGBA')


def grid(cells, cols, scale, title, legend):
    """cells: list of (label, [panels]) where panels are RGBA images (1x)."""
    pw = max(p.size[0] for _, ps in cells for p in ps) * scale
    ph = max(p.size[1] for _, ps in cells for p in ps) * scale
    n_pan = max(len(ps) for _, ps in cells)
    gap = 4
    cw = n_pan * pw + (n_pan - 1) * gap + 12
    cw = max(cw, int(max(FONT.getlength(label) for label, _ in cells)) + 10)   # labels never overlap
    chh = ph + 26
    rows = (len(cells) + cols - 1) // cols
    head = 34 + 12 * len(legend)
    sheet = Image.new('RGB', (cols * cw + 12, head + rows * chh + 8), INK)
    d = ImageDraw.Draw(sheet)
    d.text((8, 6), title, fill=TXT, font=FONT)
    for i, line in enumerate(legend):
        d.text((8, 20 + 12 * i), line, fill=(170, 190, 190), font=FONT)
    for i, (label, panels) in enumerate(cells):
        x0 = 12 + (i % cols) * cw
        y0 = head + (i // cols) * chh
        for j, p in enumerate(panels):
            im = p.convert('RGB')
            if scale != 1:
                im = im.resize((im.size[0] * scale, im.size[1] * scale), Image.NEAREST)
            sheet.paste(im, (x0 + j * (pw + gap), y0))
        d.text((x0, y0 + ph + 4), label, fill=TXT, font=FONT)
    return sheet


def rig_sheet(cap, view, sheet_name, scale, out, gain_info):
    v = cap['views'].get(view)
    if not v:
        return None
    meta, atlas = load_sheet(sheet_name)
    bg_row = v['captures']['stand-right-R']
    bg = Image.open(background_of(view, bg_row)).convert('RGBA')
    dpr = v['dpr']
    feet, reg = feet_in_background(view, v)
    gain = gain_info[0] if gain_info else None
    cells = []
    for cap_label, key, label in RIG_PAIRS:
        row = v['captures'].get(cap_label)
        if not row:
            continue
        cur = Image.open(row['path']).convert('RGBA')
        k2, aim = v2_key(key, row)
        if k2 != key:
            label = '%s [aim %s]' % (label, aim)
        spr = cell(meta, atlas, k2)
        under = bg
        if cap_label.startswith(('air-', 'climb-')):
            # Off the deck: a flat patch of this crop's own median colour, so
            # v2 is not shown standing on a deck the current RIG is above.
            med = tuple(int(c) for c in np.median(np.asarray(cur.convert('RGB')).reshape(-1, 3), axis=0))
            under = Image.new('RGBA', bg.size, med + (255,))
            label = label + ' (v2 on flat bg)'
        v2 = place(under, spr, meta['origin'], feet)
        panels = [cur, v2]
        if gain is not None:
            panels.append(place(under, apply_gain(spr, gain), meta['origin'], feet))
        cells.append((label, panels))
    sz = v['viewport']
    title = ('RIG  current | v2 | v2 lit~   %s %dx%d @DPR%d  RIG %.1f px  (%s, %g px/tile)  scale %dx'
             % (view.upper(), sz['width'], sz['height'], dpr, v['scale']['rigVisualPx'] * dpr,
                sheet_name, meta['pxPerTile'], scale))
    legend = ['current: in-game crop (shipped renderer). v2: atlas cell unlit on the same background crop, its sim point '
              'on the current RIG\'s boots (camera drift between crops measured: dx %d dy %d px).' % (reg[0], reg[1]),
              'v2 lit~: v2 x per-channel gain %s measured from the current sprite in-game (approx).'
              % (np.round(gain, 3).tolist() if gain is not None else 'n/a')]
    g = grid(cells, 4 if scale == 1 else 3, scale, title, legend)
    g.save(out, optimize=True)
    return out


def wasp_sheet(cap, view, sheet_name, scale, out):
    # a dedicated wasp-only capture (current-art.mjs --wasp-only) wins
    wp = os.path.join(CUR, 'current-art-wasp.json')
    if os.path.exists(wp):
        wcap = json.load(open(wp))
        if wcap['views'].get(view, {}).get('wasp', {}).get('frames'):
            cap = wcap
    v = cap['views'].get(view)
    meta, atlas = load_sheet(sheet_name)
    cells = []
    sky = None
    if v and v.get('wasp', {}).get('frames') and all(os.path.exists(f['path']) for f in v['wasp']['frames']):
        cur_frames = [Image.open(f['path']).convert('RGBA') for f in v['wasp']['frames']]
        a = np.asarray(cur_frames[0].convert('RGB'))
        sky = tuple(int(c) for c in np.median(a.reshape(-1, 3), axis=0))
    else:
        cur_frames = []
    if sky is None:
        sky = (20, 50, 56)
    # The captured crops are all cruise: pair them with v2's cruise cycle.
    order = ['cruise-0', 'cruise-1', 'cruise-2', 'cruise-3', 'idle', 'dive-lock', 'dive-0', 'dive-1', 'hit']
    # v2 is authored facing +1; the game mirrors a -1 row. Show v2 at the
    # captured wasp's own facing: its sim `dir` (recorded per crop). Captures
    # made before `dir` was recorded fall back to the spawn default: the
    # capture spawns with no row, and spawnHostile gives such a wasp dir -1
    # (src/sim/hostiles.js), which a cruising wasp keeps. Screen motion cannot
    # decide it: the camera scrolls faster (4.3 t/s) than a wasp cruises.
    face = 1
    if cur_frames:
        dirs = [f.get('dir') for f in v['wasp']['frames']]
        face = (-1 if dirs[0] < 0 else 1) if all(d is not None for d in dirs) else -1
    W, H = meta['cell']
    pad = Image.new('RGBA', (W + 8, H + 8), sky + (255,))
    for i, k in enumerate(order):
        panels = []
        if i < len(cur_frames):
            panels.append(cur_frames[i])
        spr = cell(meta, atlas, k)
        if face < 0:
            spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
        im = pad.copy()
        im.alpha_composite(spr, (4, 4))
        panels.append(im)
        cells.append(('%s%s' % ('current cruise | ' if i < len(cur_frames) else '', 'v2 ' + k), panels))
    title = 'WASP  %s  current (in-game crop) | v2 (%s, %g px/tile, unlit)  scale %dx' % (
        view.upper(), sheet_name, meta['pxPerTile'], scale)
    art = (v or {}).get('artWarnings') or []
    note = ('current wasp art DID NOT load in this capture (boot budget) - the crop shows the primitive'
            if any('wasp' in w for w in art) else 'current wasp crops: the live neutral wasp, cruising')
    note += ('; v2 mirrored to the captured facing (-1: flying toward RIG), as the game mirrors a -1 row'
             if face < 0 else '')
    g = grid(cells, 5, scale, title, [note + '; v2 shows every authored state.'])
    g.save(out, optimize=True)
    return out


def inventory_sheet(sheet_name, gun, scale, out):
    meta, atlas = load_sheet(sheet_name)
    keys = [k for k in meta['frames'] if k.startswith(gun + ':')]
    order = {k: i for i, k in enumerate(sorted(keys, key=lambda k: (meta['frames'][k]['y'], meta['frames'][k]['x'])))}
    keys.sort(key=lambda k: order[k])
    sky = (20, 50, 56, 255)
    cells = []
    for k in keys:
        im = Image.new('RGBA', tuple(meta['cell']), sky)
        im.alpha_composite(cell(meta, atlas, k))
        cells.append((k.split(':', 1)[1], [im]))
    title = 'v2 RIG, gun %s: every frame in %s (%g px/tile, unlit) at %dx' % (gun, sheet_name, meta['pxPerTile'], scale)
    grid(cells, 8, scale, title, ['left-facing = horizontal mirror about the sim point; 60 poses x 5 guns = 300 frames']).save(out, optimize=True)
    return out


def guns_sheet(sheet_name, scale, out):
    meta, atlas = load_sheet(sheet_name)
    sky = (20, 50, 56, 255)
    cells = []
    for pose in ('stand-right', 'run-pass-a-up-right', 'air-rise-down-right', 'climb-1-up'):
        for g in 'RSLHF':
            im = Image.new('RGBA', tuple(meta['cell']), sky)
            im.alpha_composite(cell(meta, atlas, '%s:%s' % (g, pose)))
            cells.append(('%s: %s' % (g, pose), [im]))
    grid(cells, 5, scale, 'v2 RIG: the five chassis in four poses (%s) at %dx' % (sheet_name, scale),
         ['R rivet  S spread  L laser  H homing  F flame; every gun is a child of the right-hand bone']).save(out, optimize=True)
    return out


def falsify_sheet(scale, out):
    """The honest S gun vs the S mesh moved 0.1 tiles, exported muzzle marked."""
    fal = os.path.join(HERE, 'build', 'falsify')
    if not os.path.exists(os.path.join(fal, 'rig-v2-far.json')):
        return None
    meta, atlas = load_sheet('rig-v2-far')
    fmeta = json.load(open(os.path.join(fal, 'rig-v2-far.json')))
    fatlas = Image.open(os.path.join(fal, 'rig-v2-far.png')).convert('RGBA')
    cells = []
    for k in ('S:stand-right', 'S:stand-up-right', 'S:stand-down-right'):
        row = []
        for m, a in ((meta, atlas), (fmeta, fatlas)):
            im = Image.new('RGBA', tuple(m['cell']), (60, 90, 96, 255))
            im.alpha_composite(cell(m, a, k))
            big = im.resize((im.size[0] * scale, im.size[1] * scale), Image.NEAREST)
            d = ImageDraw.Draw(big)
            mx, my = m['frames'][k]['anchors']['muzzle']
            cx, cy = mx * scale, my * scale
            d.line((cx - 6, cy, cx + 6, cy), fill=(255, 79, 216, 255), width=1)
            d.line((cx, cy - 6, cx, cy + 6), fill=(255, 79, 216, 255), width=1)
            row.append(big)
        cells.append((k + ': honest | mesh +0.1 tile', row))
    grid(cells, 3, 1, 'Anchor check falsification: magenta cross = exported muzzle anchor (%dx)' % scale,
         ['left: shipped S gun, drawn bore ends on the cross (<= 0.87 px).',
          'right: same render with only the S MESH moved 0.1 tiles; the empties stay -> check fails (2.1-2.3 px).']).save(out, optimize=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-109'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    cap_path = os.path.join(CUR, 'current-art.json')
    cap = json.load(open(cap_path)) if os.path.exists(cap_path) else {'views': {}}
    made = []
    gains = {}
    for view, sheet in (('desktop', 'rig-v2-far'), ('phone', 'rig-v2-phone2x')):
        if view not in cap['views'] or 'stand-right-R' not in cap['views'][view].get('captures', {}):
            continue
        gi = lit_gain(cap, view)
        gains[view] = gi
        # phone crops are already device pixels at DPR 2: 1x and 2x of those
        # are the CSS 2x / 4x views.
        for scale in ((1, 4) if view == 'desktop' else (1, 2)):
            p = rig_sheet(cap, view, sheet, scale, os.path.join(args.out, 'contact-rig-%s-%dx.png' % (view, scale)), gi)
            if p:
                made.append(p)
    for view, sheet in (('desktop', 'wasp-v2-far'), ('phone', 'wasp-v2-phone2x')):
        for scale in ((1, 4) if view == 'desktop' else (1, 2)):
            made.append(wasp_sheet(cap, view, sheet, scale,
                                   os.path.join(args.out, 'contact-wasp-%s-%dx.png' % (view, scale))))
    made.append(inventory_sheet('rig-v2-far', 'R', 2, os.path.join(args.out, 'v2-rig-inventory-R-far-2x.png')))
    made.append(guns_sheet('rig-v2-far', 4, os.path.join(args.out, 'v2-rig-guns-far-4x.png')))
    made.append(falsify_sheet(6, os.path.join(args.out, 'anchor-falsify-S-6x.png')))
    print(json.dumps({'sheets': made, 'lit_gain': {k: (None if v is None else {
        'gain': np.round(v[0], 4).tolist(), 'ingame_mean_rgb': np.round(v[1], 1).tolist(),
        'texel_mean_rgb': np.round(v[2], 1).tolist()}) for k, v in gains.items()}}, indent=1))


if __name__ == '__main__':
    main()
