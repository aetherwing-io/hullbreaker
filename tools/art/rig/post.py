"""RIG v3 post: render.py's supersampled data passes -> toon pixel cells at
every shipped density (the spike's candidate D, recoloured to the boards).

    /opt/hb-art/bin/python -I tools/art/rig/post.py --src <render dir> --out <cells dir> [--keys R:stand-right,...]

Ported from tools/art/spike/v3_post.py, candidate D (B + the scripted tidy
rules) -- what the operator picked as "B/D" (decisions entry 27). Per output
pixel of a density:
  1. BIN: every hi-res sample whose centre falls in the pixel (render.py's
     grid is 8 x 35.1 = 12 x 23.4 = 17.29 x 16.24 samples per pixel).
  2. FAMILY: weighted majority of the samples' material family (object id,
     body region and texture zone -> khaki plate / rust undersuit / visor /
     glow / gun part / pack); empty when fewer than half the samples are
     opaque, unless thin parts (gun, glow) hold >= 30% of them.
  3. TONE: that family's mean normal, smoothed within its object at 1 output
     px (normalized convolution), against the game's key light
     (src/config.js LIGHT_RIG.key, view azimuth 40 / elevation 50) times a
     little ambient occlusion, cut into 4 steps; a glint on light families;
     a cool rim (LIGHT_RIG.rim, azimuth 214 / elevation 12) on silhouette
     pixels that face it.
  4. LINES: a 1 px line where a pixel lies > 0.08 tiles behind an opaque
     4-neighbour (an arm in front of the torso stays its own shape).
  5. TIDY (D): single-pixel spurs removed / notches filled, one-pixel tone
     islands merged, the visor drawn as a lit slit, the gun's top edge two
     tones lighter and a glint pixel at its drawn muzzle.
  6. COLOUR: palette_v3.RAMPS (board swatches + game tokens), a 1 px ink
     outline outside (board 13's near-black).
Integer/float arithmetic with fixed tie-breaks: same passes, same bytes.

Outputs per frame and density: <out>/<density>/<gun>/<pose>.png (RGBA cell)
and <pose>-parts.npz (family, tone, line, outline maps: what check.py and the
measurements read).
"""

import argparse
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import palette_v3 as PAL  # noqa: E402

DENSITIES = {'d16': 16.2419, 'd23': 23.4, 'd35': 35.1}
DENSITY_ORDER = ('d16', 'd23', 'd35')

FAMS = ['k_bright', 'k_mid', 'k_far', 'suit', 'suit_far', 'visor', 'glow',
        'gun_d', 'gun_m', 'gun_l', 'gun_acc', 'gun_rust', 'pack']
F = {n: i for i, n in enumerate(FAMS)}
NF = len(FAMS)
# majority-vote weight per family. Gun parts at 2.0 (the spike used 1.6): at
# d16 the SMG's 0.43 px barrel stub lost its last pixel to the knee beside
# it (H:climb-3-down drawn 1.26 px short of the muzzle anchor); the muzzle
# pixel is where shots spawn, so thin gun parts win a contested pixel.
WEIGHT = np.array([1.0, 1.0, 1.0, 1.0, 1.0, 2.5, 3.0, 2.0, 2.0, 2.0, 2.6, 2.0, 1.0])
GUN_FAMS = [F[n] for n in ('gun_d', 'gun_m', 'gun_l', 'gun_acc', 'gun_rust')]
THIN_FAMS = [F['glow']] + GUN_FAMS
SPEC_FAMS = [F['k_bright'], F['k_mid'], F['gun_l'], F['gun_m']]
DARK_FAMS = [F[n] for n in ('suit', 'suit_far', 'k_far', 'gun_d', 'visor', 'pack')]

# render.py codes
R_TORSO, R_HEAD, R_ARM_R, R_ARM_L, R_HAND, R_LEG_R, R_LEG_L, R_FOOT = range(1, 9)
R_SH_R, R_SH_L, R_SHIN_R, R_SHIN_L, R_FORE_R, R_FORE_L = range(9, 15)
NEAR = (R_ARM_R, R_SH_R, R_FORE_R, R_LEG_R, R_SHIN_R)
FAR = (R_ARM_L, R_SH_L, R_FORE_L, R_LEG_L, R_SHIN_L)
GUN_ZONES = {8: 'gun_d', 9: 'gun_m', 10: 'gun_l', 11: 'gun_acc', 13: 'gun_rust'}


def light_dir(az, el):
    a, e = math.radians(az), math.radians(el)
    t, o, u = math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)
    return np.array([t, -o, u])


KEY = light_dir(40, 50)
RIM = light_dir(214, 12)
VIEW = np.array([0.0, -1.0, 0.0])
HALF = (KEY - VIEW) / np.linalg.norm(KEY - VIEW)
N4 = ((0, 1), (0, -1), (1, 0), (-1, 0))


def read16(path):
    a = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if a is None:
        raise SystemExit('missing ' + path)
    return cv2.cvtColor(a, cv2.COLOR_BGRA2RGBA).astype(np.float32) / np.float32(65535.0)


def families(idp):
    """id pass -> family per sample (-1 empty) and object id per sample."""
    alpha = idp[..., 3] > 0.5
    obj = np.rint(idp[..., 0] * 16).astype(int)
    reg = np.rint(idp[..., 1] * 16).astype(int)
    zone = np.rint(idp[..., 2] * 16).astype(int)
    fam = np.full(obj.shape, -1, dtype=np.int16)
    body = (obj >= 1) & (obj <= 3)
    plate = body & (zone == 1)
    suit = body & (zone == 0)
    fam[plate] = F['k_mid']
    fam[plate & np.isin(reg, (R_HEAD,) + (R_ARM_R, R_SH_R, R_FORE_R))] = F['k_bright']
    fam[plate & np.isin(reg, FAR)] = F['k_far']
    fam[suit] = F['suit']
    fam[suit & np.isin(reg, FAR)] = F['suit_far']
    fam[suit & (reg == R_HEAD)] = F['visor']
    fam[suit & (reg == R_HAND)] = F['k_mid']        # the gloves read with the armour
    fam[body & (obj == 3)] = F['k_mid']             # the gun hand (separate mesh)
    fam[body & (zone == 2)] = F['glow']
    fam[obj == 5] = F['pack']
    for z, n in GUN_ZONES.items():
        fam[(obj == 4) & (zone == z)] = F[n]
    fam[~alpha] = -1
    return fam, np.where(alpha, obj, 0)


SMOOTH_PX = 1.0     # normal smoothing, output pixels (the spike's smooth=1.0 x ss at its supersampled size)


def smooth_normals(n, objmap, sigma):
    """Gaussian-blur a normal field inside each object (normalized
    convolution): shading follows the big forms, not every bevel. Applied to
    the per-pixel family-mean normals at the OUTPUT resolution."""
    out = np.zeros_like(n)
    for k in np.unique(objmap):
        if k <= 0:
            continue
        m = (objmap == k).astype(np.float64)
        w = cv2.GaussianBlur(m, (0, 0), sigma)
        inside = objmap == k
        for c in range(3):
            out[..., c] += np.where(inside, cv2.GaussianBlur(n[..., c] * m, (0, 0), sigma) / np.maximum(w, 1e-6), 0)
    out /= np.maximum(np.linalg.norm(out, axis=-1, keepdims=True), 1e-6)
    return out


def cell_geometry(meta, ppt):
    """Output cell for a density: size and the sim point (pixel-edge coords)."""
    hp = meta['hiPpt']
    W, H = meta['hiCell']
    ox_h, oy_h = meta['hiOrigin']
    k = ppt / hp
    ox, oy = int(round(ox_h * k)), int(round(oy_h * k))
    cw = ox + int(round((W - ox_h) * k))
    ch = oy + int(round((H - oy_h) * k))
    return cw, ch, ox, oy


def bin_index(meta, ppt, cw, ch, ox, oy):
    """Flat output-pixel index of every hi-res sample (-1 outside the cell)."""
    hp = meta['hiPpt']
    W, H = meta['hiCell']
    ox_h, oy_h = meta['hiOrigin']
    xs = np.floor((np.arange(W) + 0.5 - ox_h) * ppt / hp + ox).astype(int)
    ys = np.floor((np.arange(H) + 0.5 - oy_h) * ppt / hp + oy).astype(int)
    okx, oky = (xs >= 0) & (xs < cw), (ys >= 0) & (ys < ch)
    idx = ys[:, None] * cw + xs[None, :]
    idx[~(oky[:, None] & okx[None, :])] = -1
    return idx


def tone_of(nn, ao):
    lit = 0.22 + 0.78 * np.maximum(nn @ KEY, 0.0)
    val = lit * (0.78 + 0.22 * ao)
    return np.where(val > 0.70, 0, np.where(val > 0.50, 1, np.where(val > 0.30, 2, 3))).astype(np.int16)


def reduce(fam, objmap, normal, ao, depth, idx, cw, ch):
    """Per output pixel: weighted-majority family; that family's mean normal,
    AO; the nearest depth; the majority object. Vectorized with bincount."""
    N = cw * ch
    valid = idx >= 0
    fi = idx[valid]
    fv = fam[valid].astype(int)
    total = np.bincount(fi, minlength=N).astype(np.float64)
    op = fv >= 0
    opaque = np.bincount(fi[op], minlength=N).astype(np.float64)
    counts = np.bincount(fi[op] * NF + fv[op], minlength=N * NF).reshape(N, NF).astype(np.float64)
    thin = counts[:, THIN_FAMS].sum(1) / np.maximum(total, 1)
    keep = (opaque > 0) & ~((opaque / np.maximum(total, 1) < 0.5) & (thin < 0.3))
    score = counts * WEIGHT[None, :]
    win = np.argmax(score, axis=1)                        # ties -> lowest family index
    win = np.where(keep, win, -1)
    sel = op.copy()
    sel[op] = fv[op] == win[fi[op]]
    si = fi[sel]
    nsel = np.bincount(si, minlength=N).astype(np.float64)
    nn = np.zeros((N, 3))
    nv = normal[valid][sel]
    for c in range(3):
        nn[:, c] = np.bincount(si, weights=nv[:, c], minlength=N)
    nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
    aom = np.bincount(si, weights=ao[valid][sel], minlength=N) / np.maximum(nsel, 1)
    dep = np.full(N, np.inf)
    np.minimum.at(dep, fi[op], depth[valid][op])
    objc = np.bincount(si * 8 + objmap[valid][sel], minlength=N * 8).reshape(N, 8)
    obj = np.where(keep, np.argmax(objc, axis=1), 0)
    sh = (ch, cw)
    nn = smooth_normals(nn.reshape(ch, cw, 3), obj.reshape(sh), SMOOTH_PX).reshape(N, 3)
    tone = tone_of(nn, aom)
    spec = np.isin(win, SPEC_FAMS) & ((np.maximum(nn @ HALF, 0.0) ** 28) > 0.45)
    tone = np.where(spec, 5, tone)
    return (win.reshape(sh).astype(np.int16), tone.reshape(sh), np.where(keep, dep, 1.0).reshape(sh),
            nn.reshape(ch, cw, 3), obj.reshape(sh).astype(np.int16))


def shifted(a, dy, dx, fill):
    H, W = a.shape[:2]
    out = np.full_like(a, fill)
    ys, xs = slice(max(0, -dy), H - max(0, dy)), slice(max(0, -dx), W - max(0, dx))
    yd, xd = slice(max(0, dy), H - max(0, -dy)), slice(max(0, dx), W - max(0, -dx))
    out[ys, xs] = a[yd, xd]
    return out


def rim_edges(f, t, n):
    op = f >= 0
    edge = np.zeros_like(op)
    for dy, dx in N4:
        edge |= op & ~shifted(op, dy, dx, False)
    rim = edge & ~np.isin(f, (F['glow'], F['visor'])) & ((n @ RIM) > 0.30)
    return np.where(rim, 4, t).astype(np.int16)


def depth_lines(f, d, step=0.08):
    op = f >= 0
    line = np.zeros_like(op)
    for dy, dx in N4:
        line |= op & shifted(op, dy, dx, False) & (d - shifted(d, dy, dx, np.inf) > step)
    return line


def tidy_silhouette(f, t, d, o, n):
    H, W = f.shape
    f2, t2, d2, o2, n2 = f.copy(), t.copy(), d.copy(), o.copy(), n.copy()
    for _ in range(2):
        op = f2 >= 0
        for y in range(H):
            for x in range(W):
                nbs = [(y + dy, x + dx) for dy, dx in N4 if 0 <= y + dy < H and 0 <= x + dx < W]
                on = [p for p in nbs if op[p]]
                if op[y, x] and len(on) <= 1 and f2[y, x] not in GUN_FAMS and f2[y, x] not in (F['visor'], F['glow']):
                    f2[y, x] = -1
                elif not op[y, x] and len(on) >= 3:
                    fs = [int(f2[p]) for p in on]
                    best = max(sorted(set(fs)), key=fs.count)
                    src = [p for p in on if f2[p] == best][0]
                    f2[y, x], t2[y, x], d2[y, x], o2[y, x], n2[y, x] = best, t2[src], d2[src], o2[src], n2[src]
    return f2, t2, d2, o2, n2


def tidy_tones(f, t):
    H, W = f.shape
    t2 = t.copy()
    for y in range(H):
        for x in range(W):
            if f[y, x] < 0 or t[y, x] >= 4:
                continue
            nb = [t[y + dy, x + dx] for dy, dx in N4
                  if 0 <= y + dy < H and 0 <= x + dx < W and f[y + dy, x + dx] == f[y, x] and t[y + dy, x + dx] < 4]
            if len(nb) >= 3 and t[y, x] not in nb:
                vals, cnt = np.unique(nb, return_counts=True)
                if cnt.max() >= 3:
                    t2[y, x] = vals[np.argmax(cnt)]
    return t2


def tidy_visor(f, t):
    t2 = t.copy()
    vis = f == F['visor']
    for x in range(f.shape[1]):
        ys = np.nonzero(vis[:, x])[0]
        for k, y in enumerate(ys):
            t2[y, x] = 0 if k == 0 else 3
    return t2


def tidy_gun(f, t, muzzle_px):
    t2 = t.copy()
    g = np.isin(f, GUN_FAMS)
    above = np.isin(shifted(f, -1, 0, -1), GUN_FAMS)
    top = g & ~above & (t2 < 4)
    t2[top] = np.maximum(0, t2[top] - 2)
    if muzzle_px is not None and g.any():
        ys, xs = np.nonzero(g)
        dd = (xs - (muzzle_px[0] - 0.5)) ** 2 + (ys - (muzzle_px[1] - 0.5)) ** 2
        j = int(np.argmin(dd))
        if dd[j] <= 6.0:
            t2[ys[j], xs[j]] = 5
    return t2


def compose(f, t, line, gun_letter):
    H, W = f.shape
    ramps = [PAL.RAMPS[n] if n != 'gun_acc' else PAL.accent_ramp(gun_letter) for n in FAMS]
    lut = np.zeros((NF, 6, 3), dtype=np.uint8)
    for i, r in enumerate(ramps):
        lut[i] = np.array(r, dtype=np.uint8)
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    op = f >= 0
    fs, ts = np.clip(f, 0, NF - 1), np.clip(t, 0, 5)
    col = lut[fs, ts]
    dark_line = line & ((t == 3) | np.isin(f, DARK_FAMS))
    col = np.where(dark_line[..., None], np.array(PAL.INK, dtype=np.uint8), col)
    col = np.where((line & ~dark_line)[..., None], lut[fs, 3], col)
    rgba[op, :3] = col[op]
    rgba[op, 3] = 255
    outline = np.zeros_like(op)
    for dy, dx in N4:
        outline |= ~op & shifted(op, dy, dx, False)
    rgba[outline, :3] = PAL.INK
    rgba[outline, 3] = 255
    return rgba, outline


class CellTooSmall(Exception):
    pass


def muzzle_px(fm, ppt, ox, oy, key='drawnMuzzle'):
    x, y = fm['tiles'][key]
    return (ox + x * ppt, oy - y * ppt)


def process(src, meta, key, out_root, densities=DENSITY_ORDER):
    fm = meta['frames'][key]
    L, pid = fm['gun'], fm['pose']
    base = os.path.join(src, L, pid)
    idp = read16(base + '-id.png')
    nrm = read16(base + '-nrm.png')
    aod = read16(base + '-aod.png')
    fam, objmap = families(idp)
    n = nrm[..., :3] * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    ao = aod[..., 0]
    depth = aod[..., 1] * 4.0
    res = {}
    for dn in densities:
        ppt = DENSITIES[dn]
        cw, ch, ox, oy = cell_geometry(meta, ppt)
        idx = bin_index(meta, ppt, cw, ch, ox, oy)
        f, t, d, nn, o = reduce(fam, objmap, n, ao, depth, idx, cw, ch)
        f2, t2, d2, o2, n2 = tidy_silhouette(f, t, d, o, nn)
        t2 = tidy_tones(f2, t2)
        t2 = tidy_visor(f2, t2)
        t2 = tidy_gun(f2, t2, muzzle_px(fm, ppt, ox, oy))
        t2 = rim_edges(f2, t2, n2)
        line = depth_lines(f2, d2)
        rgba, outline = compose(f2, t2, line, L)
        edges = [n for n, e in (('top', outline[0]), ('bottom', outline[-1]), ('left', outline[:, 0]),
                                 ('right', outline[:, -1])) if e.any()]
        if edges:
            raise CellTooSmall('%s %s: the figure touches the cell %s edge' % (key, dn, '/'.join(edges)))
        d_out = os.path.join(out_root, dn, L)
        os.makedirs(d_out, exist_ok=True)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(d_out, pid + '.png'))
        np.savez_compressed(os.path.join(d_out, pid + '-parts.npz'), fam=f2, tone=t2, line=line, outline=outline,
                            obj=o2)
        res[dn] = {'cell': [cw, ch], 'origin': [ox, oy]}
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--meta', default='')
    ap.add_argument('--keys', default='')
    args = ap.parse_args()
    metas = [args.meta] if args.meta else sorted(os.path.join(args.src, f) for f in os.listdir(args.src)
                                                 if f.startswith('meta-') and f.endswith('.json'))
    errors = []
    for mp in metas:
        meta = json.load(open(mp))
        keys = args.keys.split(',') if args.keys else list(meta['frames'])
        for key in keys:
            if key in meta['frames']:
                try:
                    r = process(args.src, meta, key, args.out)
                except CellTooSmall as e:
                    errors.append(str(e))
                    print('ERROR', e, flush=True)
                    continue
                print(key, r, flush=True)
    if errors:
        raise SystemExit('BUILD ERROR: %d cell(s) clipped:\n  ' % len(errors) + '\n  '.join(errors))


if __name__ == '__main__':
    main()
