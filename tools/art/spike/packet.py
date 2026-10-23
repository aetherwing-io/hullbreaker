"""T-109 A2 spike — the operator packet images (a few, the clearest).

    /opt/hb-art/bin/python tools/art/spike/packet.py [--out reports/tasks/T-109/spike]

Run compose.py for both views first. Writes:
  packet-1-true-size.png   desktop context, today / A / B / D at true size, plus
                           the concept boards' RIG box-downscaled to the same
                           on-screen height (desktop and phone) for reference
  (the other packet images are compose.py's own sheets, named in spike.md)
"""

import argparse
import os

from PIL import Image, ImageDraw

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I drops the script dir
import compose as C  # noqa: E402

BOARDS = [
    # (file, RIG box in source px measured by eye on 4x crops, label)
    ('01-exterior-gameplay.png', (548, 366, 640, 436), 'board 01 RIG (jump, firing)'),
    ('13-human-scale-monster-climb-grammar.png', (298, 218, 372, 262), 'board 13 RIG (run, firing)'),
]
RIG_PX = {'desktop': 32.5, 'phone': 46.8}       # RIG's 2.0-tile height on screen, device px
BOARD_RIG_H = {'01-exterior-gameplay.png': 64.0, '13-human-scale-monster-climb-grammar.png': 38.0}


def board_strip(view):
    tiles = []
    for fname, box, label in BOARDS:
        im = Image.open(os.path.join(C.ROOT, 'docs', 'concept-art', fname)).convert('RGB').crop(box)
        k = RIG_PX[view] / BOARD_RIG_H[fname]
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
        tiles.append((small, label))
    return tiles


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(C.ROOT, 'reports', 'tasks', 'T-109', 'spike'))
    args = ap.parse_args()
    ctx = Image.open(os.path.join(args.out, 'rig-desktop-context.png')).convert('RGB')
    ft = C.font(13)
    strip_h = 120
    out = Image.new('RGB', (ctx.width, ctx.height + strip_h), (12, 14, 18))
    out.paste(ctx, (0, 0))
    d = ImageDraw.Draw(out)
    y0 = ctx.height + 4
    d.text((6, y0), 'Reference: the concept boards\' RIG box-downscaled to the same on-screen height '
           '(desktop %.0f px | phone %.0f device px)' % (RIG_PX['desktop'], RIG_PX['phone']),
           fill=(220, 220, 210), font=ft)
    x = 6
    for view in ('desktop', 'phone'):
        for small, label in board_strip(view):
            out.paste(small, (x, y0 + 22))
            d.text((x, y0 + 26 + small.height), '%s, %s' % (label.split(' (')[0], view), fill=(170, 175, 180), font=C.font(11))
            x += max(small.width, 150) + 12
    p = os.path.join(args.out, 'packet-1-true-size.png')
    out.save(p, optimize=True)
    print(p, os.path.getsize(p))


if __name__ == '__main__':
    main()
