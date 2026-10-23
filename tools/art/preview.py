"""Quick look at a render dir while iterating (not part of the build).

    /opt/hb-art/bin/python tools/art/preview.py <render-dir> <out.png> [--kind rig|wasp]
        [--match substring] [--outline 1] [--scale 4] [--hi 1]

Shows each frame at 1x and at --scale x (nearest) on the game's teal sky and on
a lit-deck rust, so readability is judged at true size first.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import palette as PAL  # noqa: E402
import pixel  # noqa: E402

BG_SKY = PAL.tok('bg')
BG_DECK = (110, 74, 46)       # measured-ish lit rust deck (ground x ~0.55); preview only


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--kind', default='rig')
    ap.add_argument('--match', default='')
    ap.add_argument('--outline', type=int, default=1)
    ap.add_argument('--scale', type=int, default=4)
    ap.add_argument('--hi', type=int, default=0)
    ap.add_argument('--cols', type=int, default=8)
    a = ap.parse_args()
    raw = json.load(open(os.path.join(a.src, '%s-raw.json' % a.kind)))
    ids = np.load(os.path.join(a.src, '%s-ids.npz' % a.kind))
    classes = PAL.RIG_CLASSES if a.kind == 'rig' else PAL.WASP_CLASSES
    nb = raw['bands']
    weights = [w for _, w in classes.values()]
    lut = pixel.build_lut(classes, nb, PAL.tok)
    ink = PAL.tok(PAL.INK)
    ss = raw['supersample']
    keys = [k for k in raw['frames'] if a.match in k]
    tiles = []
    for k in keys:
        hi = ids[k]
        lo = pixel.downscale_ids(hi, ss, weights, nb)
        rgba = pixel.to_rgba(lo, lut)
        if a.outline:
            m = pixel.outline_mask(lo)
            rgba[m] = (*ink, 255)
        tiles.append((k, rgba, hi))
    if not tiles:
        raise SystemExit('no frames match')
    ch, cw = tiles[0][1].shape[:2]
    s = a.scale
    pad = 6
    tw = cw * (1 + s) + pad * 3
    th = ch * s + pad * 2
    rows = (len(tiles) + a.cols - 1) // a.cols
    sheet = Image.new('RGB', (a.cols * tw, rows * th * 2), (8, 12, 16))
    for i, (k, rgba, hi) in enumerate(tiles):
        col, row = i % a.cols, i // a.cols
        for j, bg in enumerate((BG_SKY, BG_DECK)):
            base = Image.new('RGBA', (cw, ch), bg + (255,))
            im = Image.alpha_composite(base, Image.fromarray(rgba))
            x0 = col * tw + pad
            y0 = (row * 2 + j) * th + pad
            sheet.paste(im.convert('RGB'), (x0, y0 + (ch * s - ch)))
            sheet.paste(im.resize((cw * s, ch * s), Image.NEAREST).convert('RGB'), (x0 + cw + pad, y0))
    sheet.save(a.out)
    print(a.out, sheet.size, len(tiles))


if __name__ == '__main__':
    main()
