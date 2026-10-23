"""T-109 A2 spike — put every candidate on the REAL game background, at true
size, in the two framings, and lay out the comparison sheets.

    /opt/hb-art/bin/python tools/art/spike/compose.py --view desktop|phone [--out reports/tasks/T-109/spike]

Inputs (all git-ignored, rebuilt by the spike scripts):
  tools/art/build/spike/scene/<view>/   scene_capture.mjs: RIG-free frames, the
                                        current art in-game, live projections
  tools/art/build/spike/a-<view>/       crisp.py (candidate A)
  tools/art/build/spike/post-<view>/B|D v3_render.py + v3_post.py (candidates B, D)

Every candidate cell carries its sim point in pixel-EDGE coordinates; it is
pasted so that point lands on the live projection of the staged sim point at
RIG's render depth (scene.json), 1 cell pixel = 1 device pixel, no resampling.
Facing -1 mirrors the cell about the sim point, as the game mirrors.

The "today (in-game)" column is the shipped renderer's own screenshot (lit,
tone-mapped, mipmapped, canvas-resampled); A/B/D are composited over the
identical frame with RIG hidden (his contact shadow and the game's muzzle
flash stay, they are separate objects). Panels are 5 x 3.4 tiles.
"""

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(ROOT, 'tools', 'art', 'build', 'spike')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

# row: (label, scene shot holding today's in-game crop, RIG-free shot, candidate frame, mirror)
ROWS = [
    ('idle, aim right', 'cur-frame-idle', 'bg-frame', 'idle', False),
    ('run (pass)', 'cur-run', 'bg-frame', 'run-pass', False),
    ('jump (rise)', 'cur-jump', 'bg-jump', 'jump', False),
    ('aim up-right', 'cur-upright', 'bg-frame', 'upright', False),
    ('firing', 'cur-firep', 'bg-firep', 'fire', False),           # one frozen frame, flash alive
    ('facing left', 'cur-left', 'bg-frame', 'idle', True),
]
COLS = ['today (in-game)', 'A: today, crisp', 'B: CC0 3D toon', 'D: B + tidy pass']
PANEL_W_TILES, PANEL_H_TILES = 5.0, 3.4
PANEL_LEFT, PANEL_TOP = 2.2, 2.75          # tiles left of / above the sim point


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


class Scene:
    def __init__(self, view):
        self.dir = os.path.join(BUILD, 'scene', view)
        self.meta = json.load(open(os.path.join(self.dir, 'scene.json')))
        self.dpr = self.meta['dpr']
        self.imgs = {}

    def shot(self, name):
        if name not in self.imgs:
            self.imgs[name] = Image.open(os.path.join(self.dir, name + '.png')).convert('RGBA')
        return self.imgs[name]

    def to_png(self, name, x, y):
        """CSS point -> device px inside shot `name`."""
        c = self.meta['shots'][name]['clip']
        return (x - c['x']) * self.dpr, (y - c['y']) * self.dpr

    def feet(self, name):
        return self.meta['shots'][name]['before']['points']['feet']

    def ppt(self, name='bg-frame'):
        return self.meta['shots'][name]['before']['pxPerTile'] * self.dpr


def resolve_pair(sc, cur, bg):
    """The paused firing pair (cur-firep / bg-firep: one frozen frame with
    the flash alive, shot with and without RIG) when captured; otherwise the
    first live pair (the flash may differ between its two shots)."""
    if cur == 'cur-firep' and cur not in sc.meta['shots']:
        return 'cur-fire-0', 'bg-fire-0'
    return cur, bg


def load_candidates(view):
    out = {}
    am = json.load(open(os.path.join(BUILD, 'a-' + view, 'meta.json')))
    out['A'] = {f: (os.path.join(BUILD, 'a-' + view, f + '.png'), tuple(m['origin'])) for f, m in am['frames'].items()}
    pm = json.load(open(os.path.join(BUILD, 'post-' + view, 'meta.json')))
    for k in ('B', 'D'):
        out[k] = {f: (os.path.join(BUILD, 'post-' + view, k, f + '.png'), tuple(pm['origin'])) for f in pm['frames']}
    return out


def place(base, sprite_path, origin, at, mirror=False):
    """Paste a cell so its sim point (pixel-edge coords) lands on `at`."""
    spr = Image.open(sprite_path).convert('RGBA')
    ox, oy = origin
    if mirror:
        spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
        ox = spr.width - ox
    img = base.copy()
    pos = (int(round(at[0] - ox)), int(round(at[1] - oy)))
    img.alpha_composite(spr, pos)
    mask = Image.new('L', base.size, 0)
    mask.paste(spr.split()[3], pos)
    return img, mask, pos


def panels(view):
    sc = Scene(view)
    cands = load_candidates(view)
    u = sc.ppt()
    pw, ph = int(round(PANEL_W_TILES * u)), int(round(PANEL_H_TILES * u))
    grid = []
    record = []
    for label, cur, bg, frame, mirror in ROWS:
        cur, bg = resolve_pair(sc, cur, bg)
        if cur not in sc.meta['shots'] or bg not in sc.meta['shots']:
            grid.append(None)
            continue
        f = sc.feet(cur)
        fx, fy = sc.to_png(bg, f['x'], f['y'])
        left = (PANEL_LEFT if not mirror else PANEL_W_TILES - PANEL_LEFT) * u
        box_bg = (int(round(fx - left)), int(round(fy - PANEL_TOP * u)))
        box_bg = (box_bg[0], box_bg[1], box_bg[0] + pw, box_bg[1] + ph)
        cx, cy = sc.to_png(cur, f['x'], f['y'])
        box_cur = (int(round(cx - left)), int(round(cy - PANEL_TOP * u)))
        box_cur = (box_cur[0], box_cur[1], box_cur[0] + pw, box_cur[1] + ph)
        row = [sc.shot(cur).crop(box_cur)]
        bgimg = sc.shot(bg)
        masks = {}
        for k in ('A', 'B', 'D'):
            path, origin = cands[k][frame]
            comp, mask, _ = place(bgimg, path, origin, (fx, fy), mirror)
            row.append(comp.crop(box_bg))
            masks[k] = mask.crop(box_bg)
        grid.append(row)
        record.append({'row': label, 'cur': cur, 'bg': bg, 'frame': frame, 'mirror': mirror,
                       'feet_device_px': [fx, fy], 'box_bg': box_bg, 'box_cur': box_cur,
                       'background': bgimg.crop(box_bg), 'masks': masks, 'today': row[0]})
    return grid, record, (pw, ph), u


def sheet(grid, size, scale, title, sub):
    """Column headers once at the top, one row label above each row."""
    pw, ph = size
    gap = 3 * scale if scale > 1 else 3
    fs = 11 if scale == 1 else 8 + 4 * scale
    ft = font(fs)
    line = fs + 3
    head_h = 3 * line + 4
    row_lab = line
    W = len(COLS) * (pw * scale + gap) + gap
    rows = [(lab, r) for (lab, *_), r in zip(ROWS, grid) if r is not None]
    H = head_h + len(rows) * (ph * scale + row_lab + gap) + gap
    out = Image.new('RGBA', (W, H), (12, 14, 18, 255))
    d = ImageDraw.Draw(out)
    if scale == 1:      # true-size sheet: columns too narrow for the long names
        title = title.split(' - ')[-1].split(' (RIG')[0] + ', TRUE SIZE'
        sub = 'today | A today crisp | B CC0 3D toon | D B+tidy'
    d.text((gap, 2), title, fill=(230, 230, 220, 255), font=ft)
    d.text((gap, 2 + line), sub, fill=(160, 170, 175, 255), font=ft)
    for i, name in enumerate(COLS):
        short = name.split(':')[0].split(' (')[0] if scale == 1 else name
        d.text((gap + i * (pw * scale + gap), 2 + 2 * line), short, fill=(255, 214, 140, 255), font=ft)
    y = head_h
    for label, r in rows:
        d.text((gap, y), label, fill=(200, 200, 190, 255), font=ft)
        for i, im in enumerate(r):
            x = gap + i * (pw * scale + gap)
            if scale > 1:
                im = im.resize((pw * scale, ph * scale), Image.NEAREST)
            out.alpha_composite(im, (x, y + row_lab))
        y += ph * scale + row_lab + gap
    return out


def context(view, out_dir):
    """True-size context: a central window of the real frame around RIG, with
    today's in-game RIG and A / B / D, idle pose."""
    sc = Scene(view)
    cands = load_candidates(view)
    f = sc.feet('cur-frame-idle')
    fx, fy = sc.to_png('bg-frame', f['x'], f['y'])
    w, h = (480, 270) if view == 'desktop' else (844, 390)
    box = (int(round(fx - w * 0.45)), int(round(fy - h * 0.6)))
    box = (max(0, box[0]), max(0, box[1]))
    box = (box[0], box[1], box[0] + w, box[1] + h)
    tiles = [sc.shot('cur-frame-idle').crop(box)]
    for k in ('A', 'B', 'D'):
        path, origin = cands[k]['idle']
        comp, _, _ = place(sc.shot('bg-frame'), path, origin, (fx, fy))
        tiles.append(comp.crop(box))
    gap = 6
    head = 18
    out = Image.new('RGBA', (2 * w + 3 * gap, 2 * (h + head) + 3 * gap), (12, 14, 18, 255))
    d = ImageDraw.Draw(out)
    ft = font(13)
    for i, (t, name) in enumerate(zip(tiles, COLS)):
        x = gap + (i % 2) * (w + gap)
        y = gap + (i // 2) * (h + head + gap)
        d.text((x, y), name + ('  (true size: %s)' % ('480x270 of the 1280x720 FAR frame, DPR 1' if view == 'desktop'
                                                       else '422x195 css of the 844x390 phone frame, DPR 2 device px')),
               fill=(220, 220, 210, 255), font=ft)
        out.alpha_composite(t, (x, y + head))
    p = os.path.join(out_dir, 'rig-%s-context.png' % view)
    out.convert('RGB').save(p, optimize=True)
    return p


def wasp(view, out_dir):
    """The method on an enemy: today's in-game wasp (the shipped renderer's
    crop) beside the CC0 wasp candidate composited on the identical frame
    with hostiles cleared, at the wasp's live projected sim point. True size
    and nearest x4."""
    sc = Scene(view)
    if 'cur-wasp' not in sc.meta['shots'] or not sc.meta.get('wasp', {}).get('live'):
        return None
    live = sc.meta['wasp']['live']
    u = sc.ppt()
    clip = sc.meta['shots']['cur-wasp']['clip']
    cur = sc.shot('cur-wasp')
    # the same clip out of the hostile-free frame (scroll frozen, same scene)
    bx, by = sc.to_png('bg-frame', clip['x'], clip['y'])
    bgc = sc.shot('bg-frame').crop((int(round(bx)), int(round(by)), int(round(bx)) + cur.width,
                                    int(round(by)) + cur.height))
    wm = json.load(open(os.path.join(BUILD, 'wasp-' + view, 'meta.json')))
    # place the candidate on today's DRAWN wasp (its pixels differenced
    # against the hostile-free frame), not on the sim row: the renderer
    # presents the wasp below its row, and a side-by-side should share a spot
    import numpy as np
    dmask = np.abs(np.asarray(cur.convert('RGB'), int) - np.asarray(bgc.convert('RGB'), int)).max(-1) > 12
    ys, xs = np.nonzero(dmask)
    drawn = (float(xs.mean()), float(ys.mean())) if len(xs) else None
    tiles = [cur]
    names = ['today (in-game, %s)' % live.get('state', '?')]
    for fname in ('cruise-up', 'cruise-down'):
        spr = Image.open(os.path.join(BUILD, 'wasp-' + view, fname + '.png')).convert('RGBA')
        ox, oy = wm['frames'][fname]['origin']
        if live.get('dir', -1) > 0:
            spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
            ox = spr.width - ox
        wx, wy = drawn if drawn else sc.to_png('cur-wasp', live['screen']['x'], live['screen']['y'])
        img = bgc.copy()
        img.alpha_composite(spr, (int(round(wx - ox)), int(round(wy - oy))))
        tiles.append(img)
        names.append('CC0 3D toon wasp, ' + fname)
    gap, head = 6, 16
    ft = font(11)
    rows = []
    for scale in (1, 4):
        w = sum(t.width * scale for t in tiles) + gap * (len(tiles) + 1)
        h = max(t.height for t in tiles) * scale + head + gap
        im = Image.new('RGBA', (w, h), (12, 14, 18, 255))
        d = ImageDraw.Draw(im)
        x = gap
        for t, n in zip(tiles, names):
            tt = t.resize((t.width * scale, t.height * scale), Image.NEAREST) if scale > 1 else t
            im.alpha_composite(tt, (x, head))
            if scale > 1:
                d.text((x, 1), n, fill=(220, 220, 210, 255), font=ft)
            x += tt.width + gap
        if scale == 1:
            d.text((gap, 1), 'true size', fill=(220, 220, 210, 255), font=ft)
        rows.append(im)
    W = max(r.width for r in rows)
    out = Image.new('RGBA', (W, sum(r.height for r in rows) + 20), (12, 14, 18, 255))
    d = ImageDraw.Draw(out)
    d.text((gap, 2), 'WASP - %s, %.1f device px/tile: today vs the CC0 hornet through the same pipeline' % (view, u),
           fill=(230, 230, 220, 255), font=ft)
    y = 20
    for r in rows:
        out.alpha_composite(r, (0, y))
        y += r.height
    p = os.path.join(out_dir, 'wasp-%s.png' % view)
    out.convert('RGB').save(p, optimize=True)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--view', required=True)
    ap.add_argument('--out', default=os.path.join(ROOT, 'reports', 'tasks', 'T-109', 'spike'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    grid, record, size, u = panels(args.view)
    if args.view == 'desktop':
        title = 'RIG candidates on the real scene - DESKTOP 1280x720 FAR, DPR 1 (RIG ~%.0f px)' % (2 * u)
    else:
        title = 'RIG candidates on the real scene - PHONE landscape (RIG 6%% of 390 css px), DPR 2 device px (RIG ~%.0f px)' % (2 * u)
    sub = 'today = shipped renderer screenshot; A/B/D composited 1 texel = 1 device px on the same frame with RIG hidden'
    paths = []
    for scale in (1, 4):
        s = sheet(grid, size, scale, title + ('' if scale == 1 else '  [nearest x%d]' % scale), sub)
        p = os.path.join(args.out, 'rig-%s-%dx.png' % (args.view, scale))
        s.convert('RGB').save(p, optimize=True)
        paths.append(p)
    paths.append(context(args.view, args.out))
    w = wasp(args.view, args.out)
    if w:
        paths.append(w)
    for p in paths:
        print(p, os.path.getsize(p))


if __name__ == '__main__':
    main()
