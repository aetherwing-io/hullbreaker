"""Deterministic pixel I/O for the sprite builds: a hand-rolled indexed-PNG
writer (the bytes depend only on the pixels: no encoder version, timestamp or
metadata chunk) and a fixed-grid atlas packer.

The T-109 phase-A ID-map post (weighted-mode downscale, despeckle, class LUTs)
went with the primitive builder (decisions entry 26); RIG v3's reduction is
tools/art/rig/post.py.
"""

import struct
import zlib

import numpy as np


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
    px = rgba.reshape(-1, 4).astype(np.uint32)
    packed = (px[:, 0] << 24) | (px[:, 1] << 16) | (px[:, 2] << 8) | px[:, 3]
    opaque = px[:, 3] > 0
    # np.unique sorts the packed RGBA words: the same order as sorting (r, g, b, a) tuples
    uniq, inv = np.unique(packed[opaque], return_inverse=True)
    if len(uniq) > 255:
        raise RuntimeError('more than 255 colours; not palette-locked')
    colors = [(int(u >> 24), int((u >> 16) & 255), int((u >> 8) & 255), int(u & 255)) for u in uniq]
    entries = [(0, 0, 0, 0)] + colors
    idx = np.zeros(h * w, dtype=np.uint8)
    idx[opaque] = (inv + 1).astype(np.uint8)
    idx = idx.reshape(h, w)
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
