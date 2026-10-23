#!/usr/bin/env python3
"""void_columns.py — flat clear-colour voids at the screen edge, measured on
real captures (SPRINT T-107; T-102 R2, I-102).

    python3 -I tools/simlab/framing/void_columns.py --ref <clear-reference image> <capture> [...] [--json out.json]

A pixel is CLEAR when every channel is within --tol (default 10) of the
reference colour; a column (row) is a VOID when at least --share (default
0.9) of its pixels are clear. Reported per capture: the share of void
columns, the void run touching the left and right edges, and the share of
void rows (portrait / ultrawide vertical voids).

The reference colour is the dominant colour of a frame the SAME page drew with
every scene object hidden (tools/playtest/phone-framing-probe.mjs --clear-shot), so
tone mapping, the colour pipeline and JPEG are the same as the captures it
judges; --ref-rgb R,G,B overrides it. Honest limits: a dark painting region
that happens to sit within the tolerance of the clear colour would count;
the tolerance is reported with every number. Dev-only (Pillow + NumPy, the
tools/art requirements); zero effect on the game.
"""
import argparse
import json
import sys

import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int16)


def measure(img, ref, tol, share):
    clear = (np.abs(img - ref[None, None, :]) <= tol).all(axis=2)
    cols = clear.mean(axis=0) >= share
    rows = clear.mean(axis=1) >= share
    w = cols.size
    left = 0
    while left < w and cols[left]:
        left += 1
    right = 0
    while right < w and cols[w - 1 - right]:
        right += 1
    return {
        'voidColumnShare': round(float(cols.mean()), 4),
        'leftRun': left, 'rightRun': right,
        'leftRunShare': round(left / w, 4), 'rightRunShare': round(right / w, 4),
        'voidRowShare': round(float(rows.mean()), 4),
        'clearPixelShare': round(float(clear.mean()), 4),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('images', nargs='+')
    ap.add_argument('--ref')
    ap.add_argument('--ref-rgb')
    ap.add_argument('--tol', type=int, default=10)
    ap.add_argument('--share', type=float, default=0.9)
    ap.add_argument('--json')
    a = ap.parse_args()
    if a.ref_rgb:
        ref = np.array([int(v) for v in a.ref_rgb.split(',')], dtype=np.int16)
    elif a.ref:
        # the reference frame's DOMINANT colour: the HTML HUD and touch deck
        # stay on screen over the cleared canvas, so a mean would be skewed
        r = load(a.ref).reshape(-1, 3)
        vals, counts = np.unique(r, axis=0, return_counts=True)
        ref = vals[counts.argmax()].astype(np.int16)
        print(f'reference {a.ref}: dominant rgb {tuple(int(v) for v in ref)} '
              f'({counts.max() / len(r) * 100:.1f}% of the frame)')
    else:
        sys.exit('--ref or --ref-rgb is required')
    out = []
    for path in a.images:
        m = measure(load(path), ref, a.tol, a.share)
        m['image'] = path
        out.append(m)
        print(f"{path.split('/')[-1]:48s} void columns {m['voidColumnShare'] * 100:5.1f}%  "
              f"left {m['leftRunShare'] * 100:5.1f}%  right {m['rightRunShare'] * 100:5.1f}%  "
              f"void rows {m['voidRowShare'] * 100:5.1f}%")
    if a.json:
        with open(a.json, 'w') as f:
            json.dump({'tool': 'tools/simlab/framing/void_columns.py', 'refRgb': [int(v) for v in ref],
                       'tol': a.tol, 'share': a.share, 'rows': out}, f, indent=1)


if __name__ == '__main__':
    main()
