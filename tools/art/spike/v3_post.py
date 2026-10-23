"""T-109 A2 spike, candidates B and D — toon-shade v3's data passes and reduce
them to sprite pixels.

    /opt/hb-art/bin/python tools/art/spike/v3_post.py --src tools/art/build/spike/b-desktop \
        --out tools/art/build/spike/post-desktop [--frames idle,upright,...]

Writes <out>/B/<frame>.png and <out>/D/<frame>.png (+ <frame>-parts.npz: the
per-pixel family / tone / part maps the measurements read).

B — the pipeline's automatic output. Per supersampled pixel: a material FAMILY
  (armour plate in value zones, undersuit, boot, visor, gun dark/mid, pack)
  from the object id, the body region (bone weights) and the base mesh's own
  texture zones (its colours are discarded); a TONE from the smoothed normal
  against the game's key light (src/config.js LIGHT_RIG.key, view-relative
  azimuth 40 / elevation 50) times a little ambient occlusion, cut into four
  steps; a cool RIM tone from the game's rim light (azimuth 214, elevation
  12) on silhouette pixels. Reduction: per output pixel the weighted majority
  family of its ss x ss block and that family's mean normal / AO (no colour
  averaging: every pixel is one palette entry). Then a 1 px internal line
  where a nearer part overlaps a farther one (depth step), and a 1 px
  near-black outline outside.

D — B plus a scripted 1x tidy pass standing in for an artist's cleanup (it is
  rules, not hands): (1) single-pixel spurs on the silhouette are removed and
  one-pixel notches filled; (2) tone islands of one pixel take their
  neighbours' tone; (3) the visor is forced to its two hottest tones (the one
  accent); (4) the gun gets a light top edge and a hot muzzle pixel so the
  weapon reads as one object. (A fifth rule, a selective "sel-out" outline,
  was tried and measured worse on this game's dark hull; it is kept behind
  SELOUT_IN_D = False.)

Palette: per-family 4-tone ramps, hue-shifted (warm lights, cooler shadows)
around the RIG tokens of src/render/palette.js (warm off-white `player`
armour, dark warm undersuit, `gun` gold visor).
"""

import argparse
import json
import math
import os

import cv2
import numpy as np
from PIL import Image


def light_dir(az, el):
    """View-relative (travel, out, up) -> this camera's world (x, y, z):
    travel = +x, out (toward the camera) = -y, up = +z."""
    a, e = math.radians(az), math.radians(el)
    t, o, u = math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)
    return np.array([t, -o, u])


KEY = light_dir(40, 50)
RIM = light_dir(214, 12)
VIEW = np.array([0.0, -1.0, 0.0])
HALF = (KEY - VIEW) / np.linalg.norm(KEY - VIEW)

BRIGHT, MID, DARKA, SUIT, VISOR, GLOW, GUN_D, GUN_M, PACK = range(9)
NAMES = ['bright', 'mid', 'dark_armour', 'suit', 'visor', 'glow', 'gun_dark', 'gun_mid', 'pack']
WEIGHT = np.array([1.0, 1.0, 1.0, 1.0, 2.5, 3.0, 1.6, 1.6, 1.0])
GUN_FAMS = (GUN_D, GUN_M)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# tone 0 = lit .. 3 = deep shadow, 4 = cool rim, 5 = specular glint.
RAMPS = {
    BRIGHT: ['#f2ead8', '#cdbfa5', '#958677', '#5e5257', '#c4e8ea', '#fffaf0'],
    MID: ['#c9bda5', '#9d907b', '#6c615d', '#443b42', '#9ccdd2', '#efe7d5'],
    DARKA: ['#8c8172', '#675e55', '#48414b', '#2c2631', '#7fb0b6', '#b9ad97'],
    SUIT: ['#6b6260', '#4b4446', '#322d33', '#201c22', '#5d8f96', '#8f8580'],
    VISOR: ['#ffd27a', '#e3a043', '#8f552a', '#4d2c1b', '#ffd27a', '#fff0b8'],
    GLOW: ['#ffc966', '#e0953e', '#a4602c', '#6b3a1c', '#ffc966', '#fff1c0'],
    GUN_D: ['#4a505b', '#343841', '#24272e', '#16171c', '#6f9ea4', '#8e96a1'],
    GUN_M: ['#7d8591', '#5a616c', '#3e434c', '#272a31', '#94bfc4', '#dfe6ec'],
    PACK: ['#7a6f62', '#5a5249', '#3f3940', '#272229', '#6f9ea4', '#a39886'],
}
SPEC_FAMILIES = (BRIGHT, MID, GUN_M)
INK = hexrgb('#15101a')
# sel-out: the outline beside each family — a darker, cooler step of it. TRIED
# for D and measured WORSE here: on the dark teal hull a lighter outline lost
# outer-edge contrast (desktop idle edgeVisible 0.46 with the ink, 0.30 with
# sel-out; reports/tasks/T-109/spike.md), so D keeps B's ink (False).
SELOUT_IN_D = False
SELOUT = {BRIGHT: '#3b3138', MID: '#33292f', DARKA: '#211b24', SUIT: '#15101a', VISOR: '#3a2014',
          GLOW: '#4a2a12', GUN_D: '#15151c', GUN_M: '#1d1f27', PACK: '#1d1820'}

# body regions (v3_render.REGIONS) -> plate value zone. Bright near arm and
# helmet, mid torso and near leg, dark far limbs: the far leg and arm read as
# separate shapes behind the near ones.
R_TORSO, R_HEAD, R_ARM_R, R_ARM_L, R_HAND, R_LEG_R, R_LEG_L, R_FOOT = range(1, 9)
PLATE_FAMILY = {R_TORSO: MID, R_HEAD: BRIGHT, R_ARM_R: BRIGHT, R_ARM_L: DARKA, R_HAND: MID,
                R_LEG_R: MID, R_LEG_L: DARKA, R_FOOT: SUIT}
SUIT_FAMILY = {R_HEAD: VISOR, R_HAND: MID}
N4 = ((0, 1), (0, -1), (1, 0), (-1, 0))


def read16(path):
    a = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if a is None:
        raise SystemExit('missing ' + path)
    return cv2.cvtColor(a, cv2.COLOR_BGRA2RGBA).astype(np.float64) / 65535.0


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = ((b - r)[gg] / d[gg]) + 2
    h[bb] = ((r - g)[bb] / d[bb]) + 4
    h = h * 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def families(passes):
    alb, emi, oid, reg = passes['albedo'], passes['emit'], passes['id'], passes['region']
    ids = np.rint(oid[..., 0] * 16).astype(int)
    region = np.rint(reg[..., 0] * 16).astype(int)
    alpha = passes['albedo'][..., 3] > 0.5
    h, s, v = rgb_to_hsv(alb[..., :3])
    body = (ids >= 1) & (ids <= 3)
    # the base mesh's own texture zones: blue plates / orange emblems vs undersuit
    plate = ((h > 140) & (h < 235) & (v > 0.22) & ((s > 0.35) | (v > 0.40))) | ((h < 50) & (s > 0.55) & (v > 0.55))
    fam = np.full(ids.shape, SUIT, dtype=np.int16)
    for r, f in PLATE_FAMILY.items():
        fam[body & plate & (region == r)] = f
    for r, f in SUIT_FAMILY.items():
        fam[body & ~plate & (region == r)] = f
    fam[ids == 3] = MID                                     # the gun hand (separate mesh)
    glow = (emi[..., :3].max(-1) > 0.25) & body
    fam[glow] = GLOW
    fam[ids == 5] = PACK
    gun = ids == 4
    g = alb[..., :3]
    fam[gun & (g[..., 0] > 0.5)] = GUN_D                   # grip, magazine, foregrip, muzzle
    fam[gun & ((g[..., 1] > 0.5) | (g[..., 2] > 0.5))] = GUN_M  # receiver / body
    fam[~alpha] = -1
    return fam, alpha, ids


def smooth_normals(n, ids, sigma):
    """Gaussian-blur the normal field inside each object (normalized
    convolution, so parts never bleed into each other or into the empty
    background): shading follows the big forms, not every small bevel."""
    out = np.zeros_like(n)
    for k in np.unique(ids):
        if k <= 0:
            continue
        m = (ids == k).astype(np.float64)
        w = cv2.GaussianBlur(m, (0, 0), sigma)
        for c in range(3):
            out[..., c] += np.where(ids == k, cv2.GaussianBlur(n[..., c] * m, (0, 0), sigma) / np.maximum(w, 1e-6), 0)
    out /= np.maximum(np.linalg.norm(out, axis=-1, keepdims=True), 1e-6)
    return out


def tone_of(nn, ao, thresholds=(0.70, 0.50, 0.30)):
    lit = 0.22 + 0.78 * max(float(nn @ KEY), 0.0)          # lambert + a little ambient
    val = lit * (0.78 + 0.22 * ao)
    t0, t1, t2 = thresholds
    return 0 if val > t0 else 1 if val > t1 else 2 if val > t2 else 3


def downsample(fam, normal, ao, depth, alpha, ids, ss):
    """Per output pixel: weighted-majority family; that family's mean
    (pre-smoothed) normal and AO; tone and specular glint from those."""
    H, W = fam.shape[0] // ss, fam.shape[1] // ss
    out_f = np.full((H, W), -1, dtype=np.int16)
    out_t = np.zeros((H, W), dtype=np.int16)
    out_d = np.ones((H, W))
    out_n = np.zeros((H, W, 3))
    out_id = np.zeros((H, W), dtype=np.int16)
    for y in range(H):
        for x in range(W):
            sl = (slice(y * ss, (y + 1) * ss), slice(x * ss, (x + 1) * ss))
            f = fam[sl].ravel()
            a = alpha[sl].ravel()
            fv = f[a]
            if len(fv) == 0:
                continue
            counts = np.bincount(fv, minlength=len(NAMES)).astype(float)
            thin = counts[[GLOW, GUN_D, GUN_M]].sum() / (ss * ss)
            if a.mean() < 0.5 and thin < 0.3:
                continue
            win = int(np.argmax(counts * WEIGHT))
            m = (f == win) & a
            nn = normal[sl].reshape(-1, 3)[m].mean(0)
            nn /= max(np.linalg.norm(nn), 1e-6)
            out_n[y, x] = nn
            t = tone_of(nn, ao[sl].ravel()[m].mean())
            if win in SPEC_FAMILIES and float(nn @ HALF) ** 28 > 0.45:
                t = 5
            out_f[y, x] = win
            out_t[y, x] = t
            out_d[y, x] = depth[sl].ravel()[a].min()
            out_id[y, x] = int(np.bincount(ids[sl].ravel()[m]).argmax())
    return out_f, out_t, out_d, out_n, out_id


def rim_edges(out_f, out_t, out_n):
    """The game's cool rim light (behind-left) as a 1 px edge highlight on
    the silhouette pixels whose normal faces it."""
    H, W = out_f.shape
    t2 = out_t.copy()
    opaque = out_f >= 0
    for y in range(H):
        for x in range(W):
            if not opaque[y, x] or out_f[y, x] in (GLOW, VISOR):
                continue
            edge = any(not (0 <= y + dy < H and 0 <= x + dx < W) or not opaque[y + dy, x + dx] for dy, dx in N4)
            if edge and float(out_n[y, x] @ RIM) > 0.30:
                t2[y, x] = 4
    return t2


def depth_lines(out_f, out_d, depth_step):
    """A pixel farther than an opaque 4-neighbour by more than depth_step:
    the 1 px line that keeps an arm in front of the torso a separate shape."""
    opaque = out_f >= 0
    H, W = out_f.shape
    line = np.zeros_like(opaque)
    for dy, dx in N4:
        nb_d = np.full_like(out_d, np.inf)
        nb_o = np.zeros_like(opaque)
        ys = slice(max(0, -dy), H - max(0, dy))
        xs = slice(max(0, -dx), W - max(0, dx))
        yd = slice(max(0, dy), H - max(0, -dy))
        xd = slice(max(0, dx), W - max(0, -dx))
        nb_d[ys, xs] = out_d[yd, xd]
        nb_o[ys, xs] = opaque[yd, xd]
        line |= opaque & nb_o & (out_d - nb_d > depth_step)
    return line


# ------------------------------------------------------------- D: tidy rules
def tidy_silhouette(out_f, out_t, out_d, out_id, out_n):
    """(1) remove single-pixel spurs (an opaque pixel with at most one opaque
    4-neighbour — gun, visor and glow excepted) and fill one-pixel notches (an
    empty pixel with 3+ opaque 4-neighbours) from the majority neighbour."""
    H, W = out_f.shape
    f2, t2, d2, i2, n2 = out_f.copy(), out_t.copy(), out_d.copy(), out_id.copy(), out_n.copy()
    for _ in range(2):
        op = f2 >= 0
        for y in range(H):
            for x in range(W):
                nbs = [(y + dy, x + dx) for dy, dx in N4 if 0 <= y + dy < H and 0 <= x + dx < W]
                on = [p for p in nbs if op[p]]
                if op[y, x] and len(on) <= 1 and f2[y, x] not in GUN_FAMS and f2[y, x] not in (VISOR, GLOW):
                    f2[y, x] = -1
                elif not op[y, x] and len(on) >= 3:
                    fs = [int(f2[p]) for p in on]
                    best = max(set(fs), key=fs.count)
                    src = [p for p in on if f2[p] == best][0]
                    f2[y, x], t2[y, x], d2[y, x], i2[y, x], n2[y, x] = best, t2[src], d2[src], i2[src], n2[src]
    return f2, t2, d2, i2, n2


def tidy_tones(out_f, out_t):
    """(2) a pixel whose tone matches none of its same-family 4-neighbours,
    while 3+ of them agree, takes theirs; glints and rims are left alone."""
    H, W = out_f.shape
    t2 = out_t.copy()
    for y in range(H):
        for x in range(W):
            f = out_f[y, x]
            if f < 0 or out_t[y, x] >= 4:
                continue
            nb = [out_t[y + dy, x + dx] for dy, dx in N4
                  if 0 <= y + dy < H and 0 <= x + dx < W and out_f[y + dy, x + dx] == f and out_t[y + dy, x + dx] < 4]
            if len(nb) >= 3 and out_t[y, x] not in nb:
                vals, cnt = np.unique(nb, return_counts=True)
                if cnt.max() >= 3:
                    t2[y, x] = vals[np.argmax(cnt)]
    return t2


def tidy_visor(out_f, out_t):
    """(3) the visor is the one accent, drawn as a slit: in every column the
    top visor pixel takes the hottest tone, the one under it the next, and
    the rest of the faceplate goes dark — a lit slit in a dark faceplate
    reads as a helmet at this size; a whole lit faceplate reads as a face."""
    H, W = out_f.shape
    t2 = out_t.copy()
    for x in range(W):
        ys = [y for y in range(H) if out_f[y, x] == VISOR]
        for k, y in enumerate(ys):
            t2[y, x] = 0 if k == 0 else 3
    return t2


def tidy_gun(out_f, out_t, muzzle_px):
    """(4) the gun reads as one object: its top edge two tones lighter, the
    pixel at its muzzle a glint."""
    H, W = out_f.shape
    t2 = out_t.copy()
    for y in range(H):
        for x in range(W):
            if out_f[y, x] not in GUN_FAMS:
                continue
            above = out_f[y - 1, x] if y > 0 else -1
            if above not in GUN_FAMS and t2[y, x] < 4:
                t2[y, x] = max(0, t2[y, x] - 2)
    if muzzle_px is not None:
        mx, my = muzzle_px[0] - 0.5, muzzle_px[1] - 0.5
        best = None
        for y in range(H):
            for x in range(W):
                if out_f[y, x] in GUN_FAMS:
                    d = (x - mx) ** 2 + (y - my) ** 2
                    if best is None or d < best[0]:
                        best = (d, y, x)
        if best and best[0] <= 6.0:
            t2[best[1], best[2]] = 5
    return t2


def compose(out_f, out_t, line, selout=False):
    H, W = out_f.shape
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    opaque = out_f >= 0
    for y in range(H):
        for x in range(W):
            if not opaque[y, x]:
                continue
            f, t = out_f[y, x], out_t[y, x]
            if line[y, x]:
                c = INK if t == 3 or f in (SUIT, DARKA, GUN_D, VISOR, PACK) else hexrgb(RAMPS[f][3])
            else:
                c = hexrgb(RAMPS[f][t])
            rgba[y, x] = (*c, 255)
    outline = np.zeros((H, W), dtype=bool)
    for y in range(H):
        for x in range(W):
            if opaque[y, x]:
                continue
            nbs = [(y + dy, x + dx) for dy, dx in N4 if 0 <= y + dy < H and 0 <= x + dx < W and opaque[y + dy, x + dx]]
            if not nbs:
                continue
            outline[y, x] = True
            fs = [int(out_f[p]) for p in nbs]
            fam = max(set(fs), key=fs.count)
            under = all(p[0] < y for p in nbs)              # outline UNDER the figure: ground contact
            if selout and not under:
                c = hexrgb(SELOUT[fam])
            else:
                c = hexrgb('#4a2a12') if fam == GLOW else INK
            rgba[y, x] = (*c, 255)
    return rgba, outline


def process(src, frame, out_root, depth_step_tiles=0.08, smooth=1.0):
    meta = json.load(open(os.path.join(src, 'meta.json')))
    ss = meta['ss']
    fm = meta['frames'][frame]
    passes = {p: read16(os.path.join(src, '%s-%s.png' % (frame, p)))
              for p in ('albedo', 'emit', 'normal', 'ao', 'id', 'depth', 'region')}
    fam, alpha, ids = families(passes)
    n = passes['normal'][..., :3] * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    if smooth > 0:
        n = smooth_normals(n, np.where(alpha, ids, 0), smooth * ss)
    depth = passes['depth'][..., 0] * 4.0                  # map range 28..32 -> tiles
    out_f, out_t, out_d, out_n, out_id = downsample(fam, n, passes['ao'][..., 0], depth, alpha, ids, ss)
    results = {}
    # ---- B: the automatic output
    tb = rim_edges(out_f, out_t, out_n)
    lb = depth_lines(out_f, out_d, depth_step_tiles)
    rgba_b, ol_b = compose(out_f, tb, lb, selout=False)
    results['B'] = (rgba_b, out_f, tb, out_id, ol_b)
    # ---- D: B + the scripted tidy pass
    f2, t2, d2, i2, n2 = tidy_silhouette(out_f, out_t, out_d, out_id, out_n)
    t2 = tidy_tones(f2, t2)
    t2 = tidy_visor(f2, t2)
    t2 = tidy_gun(f2, t2, fm.get('drawnMuzzle') or fm.get('muzzle'))
    t2 = rim_edges(f2, t2, n2)
    l2 = depth_lines(f2, d2, depth_step_tiles)
    rgba_d, ol_d = compose(f2, t2, l2, selout=SELOUT_IN_D)
    results['D'] = (rgba_d, f2, t2, i2, ol_d)
    paths = {}
    for k, (rgba, f, t, i, ol) in results.items():
        d = os.path.join(out_root, k)
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, '%s.png' % frame)
        Image.fromarray(rgba, 'RGBA').save(p)
        np.savez_compressed(os.path.join(d, '%s-parts.npz' % frame), fam=f, tone=t, obj=i, outline=ol)
        paths[k] = p
    return paths, results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--frames', default='')
    args = ap.parse_args()
    meta = json.load(open(os.path.join(args.src, 'meta.json')))
    frames = args.frames.split(',') if args.frames else list(meta['frames'])
    summary = {}
    for f in frames:
        paths, results = process(args.src, f, args.out)
        for k, (rgba, *_rest) in results.items():
            cols = len({tuple(c) for c in rgba[rgba[..., 3] > 0][:, :3].tolist()})
            ys, xs = np.nonzero(rgba[..., 3])
            summary['%s/%s' % (k, f)] = {'colours': cols, 'h': int(ys.max() - ys.min() + 1),
                                         'w': int(xs.max() - xs.min() + 1)}
            print(paths[k], summary['%s/%s' % (k, f)])
    out_meta = dict(meta)
    out_meta['post'] = summary
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'meta.json'), 'w') as fh:
        json.dump(out_meta, fh, indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
