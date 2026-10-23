#!/usr/bin/env python3
"""turn_sheet.py — one contact sheet of posed turn frames: a row per corner,
a column per milestone (SPRINT T-107 evidence; frames from
tools/playtest/turn-pose-capture.mjs).

    python3 -I tools/simlab/framing/turn_sheet.py --dir <captures> --tag branch- --viewport 844x390
        --labels approach,t350,t700,done,after1500 [--corners 1,2,3,4,5,6] [--scale 0.5] --out sheet.jpg

Missing frames are left blank and named. Scaled sheets are for reading the
sequence; judge look at true size from the individual frames. Dev-only (Pillow).
"""
import argparse

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--tag', default='')
    ap.add_argument('--viewport', required=True)
    ap.add_argument('--labels', default='approach,t350,t700,done,after1500')
    ap.add_argument('--corners', default='1,2,3,4,5,6')
    ap.add_argument('--scale', type=float, default=0.5)
    ap.add_argument('--title', default='')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    w, h = [int(v) for v in a.viewport.split('x')]
    cw, ch = int(w * a.scale), int(h * a.scale)
    labels = a.labels.split(',')
    corners = [int(c) for c in a.corners.split(',')]
    head, pad = 26, 6
    sheet = Image.new('RGB', (pad + len(labels) * (cw + pad), head + len(corners) * (ch + 18 + pad)), (12, 12, 14))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 6), a.title or f'{a.tag}{a.viewport}', fill=(255, 220, 140))
    for r, k in enumerate(corners):
        for c, label in enumerate(labels):
            x = pad + c * (cw + pad)
            y = head + r * (ch + 18 + pad)
            name = f'{a.tag}{w}x{h}-c{k}-{label}.jpg'
            d.text((x, y), f'c{k} {label}', fill=(220, 220, 220))
            try:
                im = Image.open(f'{a.dir}/{name}').convert('RGB').resize((cw, ch), Image.LANCZOS)
                sheet.paste(im, (x, y + 16))
            except FileNotFoundError:
                d.text((x + 8, y + 30), 'missing: ' + name, fill=(255, 90, 90))
    sheet.save(a.out, quality=82)
    print(a.out, sheet.size)


if __name__ == '__main__':
    main()
