"""Deterministic pixel post-processing: ID maps -> palette-locked sprites.

Every step is integer/numpy arithmetic with fixed tie-breaks, so the same ID
maps always give the same bytes (no resampling library, no float colour
blending, no dithering):

  1. downscale_ids  weighted MODE filter, ss x ss -> 1 px. A pixel takes the
                    material class with the largest (coverage x class weight);
                    background competes with weight 1. Small important parts
                    (visor, muzzle, gun) carry more weight so a 1-px feature
                    survives instead of averaging into its neighbours. Within
                    the winning class the most common light band wins.
  2. to_rgba        class/band -> the house palette (tools/art/lib/palette.py,
                    i.e. src/render/palette.js tokens). Opaque or empty only.
  3. outline        optional 1 px ink rim on transparent pixels that touch the
                    sprite (4-neighbourhood).
"""

import zlib
import struct

import numpy as np

EMPTY = 255


def downscale_ids(ids_hi, ss, class_weights, n_bands, bg_weight=1.0):
    """ids_hi: uint8 (H*ss, W*ss), EMPTY = background, else class*n_bands+band."""
    H = ids_hi.shape[0] // ss
    W = ids_hi.shape[1] // ss
    blocks = ids_hi[:H * ss, :W * ss].reshape(H, ss, W, ss).transpose(0, 2, 1, 3).reshape(H, W, ss * ss).astype(np.int64)
    n_classes = len(class_weights)
    cls = np.where(blocks == EMPTY, -1, blocks // n_bands)
    band = np.where(blocks == EMPTY, -1, blocks % n_bands)
    best_score = (blocks == EMPTY).sum(axis=2).astype(np.float64) * bg_weight
    best_cls = np.full((H, W), -1, dtype=np.int64)
    for c in range(n_classes):
        score = (cls == c).sum(axis=2).astype(np.float64) * class_weights[c]
        win = score > best_score + 1e-9                     # ties keep the earlier winner
        best_score = np.where(win, score, best_score)
        best_cls = np.where(win, c, best_cls)
    out = np.full((H, W), EMPTY, dtype=np.uint8)
    have = best_cls >= 0
    best_band = np.zeros((H, W), dtype=np.int64)
    best_band_n = np.full((H, W), -1, dtype=np.int64)
    for b in range(n_bands):
        nb = ((cls == best_cls[..., None]) & (band == b)).sum(axis=2)
        win = nb > best_band_n                               # ties keep the lighter band
        best_band_n = np.where(win, nb, best_band_n)
        best_band = np.where(win, b, best_band)
    out[have] = (best_cls[have] * n_bands + best_band[have]).astype(np.uint8)
    return out


def despeckle(ids, group_ids):
    """One deterministic pass that removes single-pixel band noise inside a
    material group (e.g. the body's armour/suit bands). A pixel of the group
    whose own ID appears in none of its 8 neighbours takes the most common
    neighbouring ID of the same group when that ID holds >= 5 of the 8
    neighbours. Pixels outside the group (gun, visor, accents, empty) are
    never changed and never adopted. Ties -> the lower ID."""
    g = np.zeros(256, dtype=bool)
    g[list(group_ids)] = True
    H, W = ids.shape
    pad = np.pad(ids, 1, constant_values=EMPTY)
    neigh = np.stack([pad[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx]
                      for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0)], axis=0)
    out = ids.copy()
    cand = g[ids] & ~(neigh == ids[None]).any(axis=0)
    best_id = np.full((H, W), EMPTY, dtype=np.int64)
    best_n = np.zeros((H, W), dtype=np.int64)
    for gid in sorted(group_ids):
        n = (neigh == gid).sum(axis=0)
        win = n > best_n
        best_n = np.where(win, n, best_n)
        best_id = np.where(win, gid, best_id)
    sel = cand & (best_n >= 5)
    out[sel] = best_id[sel].astype(ids.dtype)
    return out


def class_mask(ids, class_indices, n_bands):
    m = np.zeros(ids.shape, dtype=bool)
    valid = ids != EMPTY
    for c in class_indices:
        m |= valid & ((ids // n_bands) == c)
    return m


def to_rgba(ids, lut):
    """lut: dict id -> (r, g, b)."""
    out = np.zeros(ids.shape + (4,), dtype=np.uint8)
    for k, rgb in lut.items():
        sel = ids == k
        if sel.any():
            out[sel, 0] = rgb[0]
            out[sel, 1] = rgb[1]
            out[sel, 2] = rgb[2]
            out[sel, 3] = 255
    missing = (ids != EMPTY) & (out[..., 3] == 0)
    if missing.any():
        raise RuntimeError('ids without a palette entry: %s' % sorted(set(ids[missing].tolist())))
    return out


def outline_mask(ids):
    """Transparent pixels 4-adjacent to the sprite."""
    solid = ids != EMPTY
    near = np.zeros_like(solid)
    near[1:, :] |= solid[:-1, :]
    near[:-1, :] |= solid[1:, :]
    near[:, 1:] |= solid[:, :-1]
    near[:, :-1] |= solid[:, 1:]
    return near & ~solid


def build_lut(classes, n_bands, palette_rgb):
    """classes: ordered {name: ([token names per band], weight)}."""
    lut = {}
    for ci, (name, (tokens, _w)) in enumerate(classes.items()):
        for b in range(n_bands):
            t = tokens[min(b, len(tokens) - 1)]
            lut[ci * n_bands + b] = palette_rgb(t)
    return lut


# --------------------------------------------------------------------------
# PNG writing: hand-rolled so the bytes depend only on the pixels (no encoder
# version, timestamp or metadata chunks). Indexed colour (PLTE + tRNS) keeps
# the files small and makes the palette lock visible in the file itself.
# --------------------------------------------------------------------------

def _chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)


def write_indexed_png(path, rgba):
    h, w = rgba.shape[:2]
    flat = rgba.reshape(-1, 4)
    colors = sorted({tuple(int(v) for v in px) for px in flat if px[3] > 0})
    if len(colors) > 255:
        raise RuntimeError('more than 255 colours; not palette-locked')
    entries = [(0, 0, 0, 0)] + colors
    index = {c: i for i, c in enumerate(entries)}
    idx = np.zeros((h, w), dtype=np.uint8)
    opaque = rgba[..., 3] > 0
    if opaque.any():
        keys = [tuple(int(v) for v in px) for px in rgba[opaque]]
        idx[opaque] = np.array([index[k] for k in keys], dtype=np.uint8)
    raw = b''.join(b'\x00' + idx[y].tobytes() for y in range(h))
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0)
    plte = b''.join(struct.pack('BBB', r, g, b) for r, g, b, _ in entries)
    trns = bytes(a for _, _, _, a in entries)
    data = (b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', ihdr) + _chunk(b'PLTE', plte) +
            _chunk(b'tRNS', trns) + _chunk(b'IDAT', zlib.compress(raw, 9)) + _chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(data)
    return len(entries) - 1


def pack_grid(cells, cell_w, cell_h, cols, atlas_w, atlas_h):
    """cells: list of (key, rgba) -> atlas rgba + {key: (x, y)}."""
    atlas = np.zeros((atlas_h, atlas_w, 4), dtype=np.uint8)
    pos = {}
    for i, (key, img) in enumerate(cells):
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        if x + cell_w > atlas_w or y + cell_h > atlas_h:
            raise RuntimeError('atlas too small for %d cells' % len(cells))
        atlas[y:y + cell_h, x:x + cell_w] = img
        pos[key] = (x, y)
    return atlas, pos


def next_pow2(n):
    p = 1
    while p < n:
        p *= 2
    return p
