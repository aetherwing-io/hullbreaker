"""T-109 A2 spike — toon-shade v3's data passes and downsample to sprite pixels.

    /opt/hb-art/bin/python tools/art/spike/v3_post.py --src tools/art/build/spike/v3-18 --out <dir>

Per supersampled pixel: a material FAMILY (armour plate, second plate, under-
suit, boot, visor glow, gun dark/mid/light) from the object id and the base
mesh's own albedo zones (its colours are discarded); a TONE from the smooth
normal against the game's key light (src/config.js LIGHT_RIG.key, view-
relative: azimuth 40, elevation 50) times ambient occlusion, cut into four
steps; a cool RIM flag from the game's rim light (azimuth 214, elevation 12)
at grazing angles. Downsample: per output pixel the weighted-majority family
of its ss x ss block and the median tone of that family's samples (no colour
averaging, so every pixel is one palette entry). Then a 1 px dark outline
outside, and a 1 px internal line where a nearer part overlaps a farther one
(depth step), so an arm in front of the torso stays a separate shape.

Palette: per-family 4-tone ramps, hue-shifted (warm lights, cooler/redder
shadows) around the RIG tokens of src/render/palette.js (warm off-white
`player` armour, dark warm undersuit, `gun` gold visor, the R shot colour on
the gun) — 30-40 colours, not v2's 11.
"""

import argparse
import json
import math
import os

import cv2
import numpy as np
from PIL import Image

KEY = None
RIM = None


def light_dir(az, el):
    """View-relative (travel, out, up) -> this camera's world (x, y, z):
    travel = +x, out (toward the camera) = -y, up = +z."""
    a, e = math.radians(az), math.radians(el)
    t, o, u = math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)
    return np.array([t, -o, u])


KEY = light_dir(40, 50)
RIM = light_dir(214, 12)
VIEW = np.array([0.0, -1.0, 0.0])

BRIGHT, MID, DARKA, SUIT, VISOR, GLOW, GUN_D, GUN_M, GUN_L, INKF = range(10)
NAMES = ['bright', 'mid', 'dark_armour', 'suit', 'visor', 'glow', 'gun_dark', 'gun_mid', 'gun_light', 'ink']
WEIGHT = np.array([1.0, 1.0, 1.0, 1.0, 2.5, 3.0, 1.6, 1.6, 2.0, 1.0])


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# tone 0 = lit .. 3 = deep shadow, 4 = cool rim, 5 = specular glint. Value
# zones after T-040 (src/render/palette.js): bright helmet + gun arm, dark
# torso + pack, mid legs. Ramps are hue-shifted: warm, yellowish light; cool,
# violet-leaning shade (the game's warm key + cool rim/fill, src/config.js
# LIGHT_RIG).
RAMPS = {
    BRIGHT: ['#efe6d2', '#c9bba1', '#8e7f75', '#5b4f55', '#bfe6ea', '#fffaf0'],
    MID: ['#c7bba3', '#9a8d79', '#6a5f5c', '#433a40', '#9ccdd2', '#f0e8d6'],
    DARKA: ['#8a7f70', '#665d53', '#47404a', '#2b2530', '#7fb0b6', '#b9ad97'],
    SUIT: ['#6b6260', '#4b4446', '#322d33', '#201c22', '#5d8f96', '#8f8580'],
    VISOR: ['#ffc966', '#8a5a2e', '#3a2420', '#1c1215', '#ffc966', '#fff0a8'],
    GLOW: ['#ffc966', '#e0953e', '#a4602c', '#6b3a1c', '#ffc966', '#fff1c0'],
    GUN_D: ['#5c6370', '#41464f', '#2c3038', '#1b1d24', '#7fb0b6', '#8e96a1'],
    GUN_M: ['#8e96a1', '#686f7a', '#4a5059', '#31353d', '#9fc9ce', '#c8d0d8'],
    GUN_L: ['#fff0c2', '#e6d3a3', '#b9a77e', '#8a7a5c', '#fff0c2', '#fffaf0'],
    INKF: ['#15101a'] * 6,
}
SPEC_FAMILIES = (BRIGHT, MID, GUN_M, VISOR)
INK = hexrgb('#15101a')
OUTLINE = {GLOW: hexrgb('#4a2a12')}
# body regions (v3_render.REGIONS)
R_TORSO, R_HEAD, R_ARM_R, R_ARM_L, R_HAND, R_LEG_R, R_LEG_L, R_FOOT = range(1, 9)
PLATE_FAMILY = {R_TORSO: MID, R_HEAD: BRIGHT, R_ARM_R: BRIGHT, R_ARM_L: MID, R_HAND: MID,
                R_LEG_R: MID, R_LEG_L: MID, R_FOOT: SUIT}
SUIT_FAMILY = {R_HEAD: VISOR, R_HAND: MID}


def read16(path):
    a = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if a is None:
        raise SystemExit('missing ' + path)
    a = cv2.cvtColor(a, cv2.COLOR_BGRA2RGBA).astype(np.float64) / 65535.0
    return a


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


def families(passes, ppt, ss, origin_row):
    alb, emi, oid, reg = passes['albedo'], passes['emit'], passes['id'], passes['region']
    ids = np.rint(oid[..., 0] * 16).astype(int)
    region = np.rint(reg[..., 0] * 16).astype(int)
    alpha = passes['albedo'][..., 3] > 0.5
    h, s, v = rgb_to_hsv(alb[..., :3])
    body = (ids >= 1) & (ids <= 3)
    # the base mesh's own texture zones: plates (blue / light / emblems) vs undersuit
    plate = ((h > 140) & (h < 235) & (v > 0.22) & ((s > 0.35) | (v > 0.40))) | ((h < 50) & (s > 0.55) & (v > 0.55))
    fam = np.full(ids.shape, SUIT, dtype=np.int16)
    for r, f in PLATE_FAMILY.items():
        fam[body & plate & (region == r)] = f
    for r, f in SUIT_FAMILY.items():
        fam[body & ~plate & (region == r)] = f
    fam[ids == 3] = MID                                     # the gun hand (separate mesh)
    glow = (emi[..., :3].max(-1) > 0.25) & body
    fam[glow] = GLOW
    fam[ids == 5] = DARKA                                   # pack
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


def tone_of(n, ao, thresholds=(0.70, 0.48, 0.28)):
    lit = 0.22 + 0.78 * np.clip(n @ KEY, 0, 1)             # lambert + a little ambient
    val = lit * (0.55 + 0.45 * ao)
    t0, t1, t2 = thresholds
    return np.where(val > t0, 0, np.where(val > t1, 1, np.where(val > t2, 2, 3)))


HALF = (KEY - VIEW) / np.linalg.norm(KEY - VIEW)


def downsample(fam, normal, ao, depth, alpha, ids, ss):
    """Per output pixel: weighted-majority family; that family's mean
    (pre-smoothed) normal and AO; tone, specular glint from those."""
    H, W = fam.shape[0] // ss, fam.shape[1] // ss
    out_f = np.full((H, W), -1, dtype=np.int16)
    out_t = np.zeros((H, W), dtype=np.int16)
    out_d = np.ones((H, W))
    out_n = np.zeros((H, W, 3))
    for y in range(H):
        for x in range(W):
            sl = (slice(y * ss, (y + 1) * ss), slice(x * ss, (x + 1) * ss))
            f = fam[sl].ravel()
            a = alpha[sl].ravel()
            fv = f[a]
            if len(fv) == 0:
                continue
            counts = np.bincount(fv, minlength=len(NAMES)).astype(float)
            thin = counts[[GLOW, GUN_D, GUN_M, GUN_L]].sum() / (ss * ss)
            if a.mean() < 0.5 and thin < 0.3:
                continue
            win = int(np.argmax(counts * WEIGHT))
            m = (f == win) & a
            nn = normal[sl].reshape(-1, 3)[m].mean(0)
            nn /= max(np.linalg.norm(nn), 1e-6)
            out_n[y, x] = nn
            t = int(tone_of(nn[None], np.array([ao[sl].ravel()[m].mean()]))[0])
            if win in SPEC_FAMILIES and float(nn @ HALF) ** 28 > 0.45:
                t = 5
            out_f[y, x] = win
            out_t[y, x] = t
            out_d[y, x] = depth[sl].ravel()[a].min()
    return out_f, out_t, out_d, out_n


def cleanup(out_f, out_t):
    """1x tidy (candidate D's scripted pass, also used by B): a pixel whose
    tone matches none of its same-family 4-neighbours, while 3+ of them agree,
    takes theirs; glints and rims are left alone."""
    H, W = out_f.shape
    t2 = out_t.copy()
    for y in range(H):
        for x in range(W):
            f = out_f[y, x]
            if f < 0 or out_t[y, x] >= 4:
                continue
            nb = [out_t[y + dy, x + dx] for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))
                  if 0 <= y + dy < H and 0 <= x + dx < W and out_f[y + dy, x + dx] == f
                  and out_t[y + dy, x + dx] < 4]
            if len(nb) >= 3 and out_t[y, x] not in nb:
                vals, cnt = np.unique(nb, return_counts=True)
                if cnt.max() >= 3:
                    t2[y, x] = vals[np.argmax(cnt)]
    return t2


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
            edge = any(not (0 <= y + dy < H and 0 <= x + dx < W) or not opaque[y + dy, x + dx]
                       for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)))
            if edge and float(out_n[y, x] @ RIM) > 0.30:
                t2[y, x] = 4
    return t2


def compose(out_f, out_t, out_d, depth_step):
    H, W = out_f.shape
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    opaque = out_f >= 0
    tone = out_t.copy()
    # internal depth lines: a pixel farther than a 4-neighbour by > depth_step
    line = np.zeros_like(opaque)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nb_d = np.roll(np.roll(out_d, dy, 0), dx, 1)
        nb_o = np.roll(np.roll(opaque, dy, 0), dx, 1)
        line |= opaque & nb_o & (out_d - nb_d > depth_step)
    for y in range(H):
        for x in range(W):
            if not opaque[y, x]:
                continue
            f = out_f[y, x]
            t = tone[y, x]
            if line[y, x]:
                c = INK if t == 3 or f in (SUIT, DARKA, GUN_D, VISOR) else hexrgb(RAMPS[f][3])
            else:
                c = hexrgb(RAMPS[f][t])
            rgba[y, x] = (*c, 255)
    # exterior outline (4-neighbourhood), selective for the visor glow
    for y in range(H):
        for x in range(W):
            if opaque[y, x]:
                continue
            nbs = [(y + dy, x + dx) for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))
                   if 0 <= y + dy < H and 0 <= x + dx < W and opaque[y + dy, x + dx]]
            if nbs:
                fs = [out_f[p] for p in nbs]
                c = OUTLINE.get(max(set(fs), key=fs.count), INK)
                rgba[y, x] = (*c, 255)
    return rgba


def process(src, frame, out_dir, depth_step_tiles=0.12, smooth=0.75, tidy=True):
    meta = json.load(open(os.path.join(src, 'meta.json')))
    ppt, ss = meta['ppt'], meta['ss']
    passes = {p: read16(os.path.join(src, '%s-%s.png' % (frame, p)))
              for p in ('albedo', 'emit', 'normal', 'ao', 'id', 'depth', 'region')}
    fam, alpha, ids = families(passes, ppt, ss, meta['origin'][1])
    n = passes['normal'][..., :3] * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    if smooth > 0:
        n = smooth_normals(n, np.where(alpha, ids, 0), smooth * ss)
    depth = passes['depth'][..., 0] * 4.0                  # map range 28..32 -> tiles
    out_f, out_t, out_d, out_n = downsample(fam, n, passes['ao'][..., 0], depth, alpha, ids, ss)
    if tidy:
        out_t = cleanup(out_f, out_t)
    out_t = rim_edges(out_f, out_t, out_n)
    rgba = compose(out_f, out_t, out_d, depth_step_tiles)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, '%s.png' % frame)
    Image.fromarray(rgba, 'RGBA').save(path)
    np.savez_compressed(os.path.join(out_dir, '%s-fam.npz' % frame), fam=out_f, tone=out_t, depth=out_d)
    return path, rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--frames', default='idle,run')
    args = ap.parse_args()
    for f in args.frames.split(','):
        p, rgba = process(args.src, f, args.out)
        cols = len({tuple(c) for c in rgba[rgba[..., 3] > 0][:, :3].tolist()})
        ys, xs = np.nonzero(rgba[..., 3])
        print(p, 'colours', cols, 'h', ys.max() - ys.min() + 1, 'w', xs.max() - xs.min() + 1)


if __name__ == '__main__':
    main()
