#!/usr/bin/env python3
"""Cut HULLBREAKER's home-screen icons from the shipped title key art (T-105).

    /opt/hb-art/bin/python -I tools/assets/make-app-icons.py          # write
    /opt/hb-art/bin/python -I tools/assets/make-app-icons.py --check  # verify

Source: assets/generated/ui/title-meridian-ascent-v1.png (the reviewed master
of the title screen's key art). No new art is made here: every icon is a
square crop of that image, resized with Lanczos. Two crops:

  icon      the Crown and the upper coils of the Meridian, square. Used for
            apple-touch-icon (180, opaque: iOS paints transparency black)
            and the manifest's ordinary 192 / 512 icons.
  maskable  the same crop shrunk into the inner 80% of the square, on a flat
            field of the art's own sky colour (the mean of the crop's top
            band), so the Crown stays inside the circle Android keeps when it
            masks an icon (purpose "maskable"; the W3C safe zone is a circle
            of radius 40% of the icon).

--check re-renders in memory and fails if any committed file differs, so the
icons stay reproducible from the source rather than becoming hand-edited
assets. Output is plain RGB PNG with no metadata: byte-stable for a given
Pillow version (reported by --check).
"""

import io
import sys
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'assets' / 'generated' / 'ui' / 'title-meridian-ascent-v1.png'
OUT = ROOT / 'assets' / 'generated' / 'ui' / 'app'

# (left, top, right, bottom) in source pixels; square.
CROP = (1010, 0, 1650, 640)
SAFE_FRACTION = 0.8          # maskable: content inside the inner 80%
FILES = [
    ('apple-touch-icon-180.png', 'icon', 180),
    ('icon-192.png', 'icon', 192),
    ('icon-512.png', 'icon', 512),
    ('icon-maskable-512.png', 'maskable', 512),
]


def render(kind, size):
    assert CROP[2] - CROP[0] == CROP[3] - CROP[1], 'the crop is not square'
    with Image.open(SRC) as im:
        art = im.convert('RGB').crop(CROP)
    if kind == 'icon':
        tile = art.resize((size, size), Image.LANCZOS)
    else:
        band = art.crop((0, 0, art.width, max(1, art.height // 12)))
        field = tuple(round(v) for v in ImageStat.Stat(band).mean[:3])
        inner = round(size * SAFE_FRACTION)
        tile = Image.new('RGB', (size, size), field)
        off = (size - inner) // 2
        tile.paste(art.resize((inner, inner), Image.LANCZOS), (off, off))
    buf = io.BytesIO()
    tile.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


def main(argv):
    check = '--check' in argv
    import PIL
    bad = []
    if not check:
        OUT.mkdir(parents=True, exist_ok=True)
    for name, crop, size in FILES:
        data = render(crop, size)
        path = OUT / name
        if check:
            if not path.exists() or path.read_bytes() != data:
                bad.append(name)
        else:
            path.write_bytes(data)
            print(f'wrote {path.relative_to(ROOT)} ({size}x{size}, {len(data)} bytes)')
    if check:
        if bad:
            print(f'make-app-icons --check: {len(bad)} icon(s) differ from a fresh cut '
                  f'(Pillow {PIL.__version__}): {", ".join(bad)}')
            return 1
        print(f'make-app-icons --check: all {len(FILES)} icons reproduce byte-for-byte (Pillow {PIL.__version__})')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
