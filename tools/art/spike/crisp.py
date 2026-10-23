"""T-109 A2 spike, candidate A — "today rendered crisp".

Today's painted RIG (the shipped aim / body atlases plus the R gun cutout),
assembled exactly the way src/render/player.js assembles it — body plane with
`anchorX` on the sim x and its bottom row on the deck, gun plane with its bore
row on CONFIG.player.muzzleY, muzzle at barrelTiles, height x1.34
(GUN_FAMILY_HEIGHT_GAIN.R) — but drawn the other way: composed offline at 8x
the target density, area-downsampled ONCE to device pixels in premultiplied
alpha, alpha cut at 50%, colours as painted (no light, no tone map, no
mipmap), to be shown 1 texel = 1 device pixel at an integer position. It is a
diagnostic of how much of "muddy" is the render path; the painting itself is
a placeholder, not the quality target.
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SPR = os.path.join(ROOT, 'assets', 'generated', 'sprites')
WPN = os.path.join(ROOT, 'assets', 'generated', 'weapons')

# src/pure/rig.js (b114869)
VISUAL_H = 2.0
AIM_RIGHT = dict(atlas='rig-slender-aim-atlas-v2.png', atlasX=0, atlasY=0,
                 trimX=132, trimY=297, trimW=248, trimH=429, anchorX=124, wpp=VISUAL_H / 429)
RUN_CONTACT = dict(atlas='rig-slender-body-atlas-v2.png', atlasX=512, atlasY=0,
                   trimX=141, trimY=148, trimW=230, trimH=216, anchorX=132, wpp=VISUAL_H / 232)
GUN_R = dict(atlasX=0, atlasY=0, trimX=16, trimY=16, trimW=388, trimH=183, worldW=1.16, muzzleY=82)
GUN_HEIGHT_GAIN = 1.34
MUZZLE_Y, BARREL = 1.05, 0.82
SS = 8


def crop(atlas, spec):
    x0 = spec['atlasX'] + spec['trimX']
    y0 = spec['atlasY'] + spec['trimY']
    return atlas.crop((x0, y0, x0 + spec['trimW'], y0 + spec['trimH']))


def assemble(frame, ppt):
    """RGBA sprite at `ppt` device px per tile; returns (image, origin_px)."""
    hi = ppt * SS
    body_spec = AIM_RIGHT if frame == 'idle' else RUN_CONTACT
    body = crop(Image.open(os.path.join(SPR, body_spec['atlas'])).convert('RGBA'), body_spec)
    gun = crop(Image.open(os.path.join(WPN, 'rig-weapons-atlas-v1.png')).convert('RGBA'), GUN_R)
    # canvas in tiles: x -1.2 .. 1.4, y -0.1 .. 2.4 (y up)
    left, right, below, above = 1.2, 1.4, 0.1, 2.4
    W, H = int(round((left + right) * hi)), int(round((below + above) * hi))
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    def px(x, y):
        return (x + left) * hi, (above - y) * hi

    bw = body_spec['trimW'] * body_spec['wpp'] * hi
    bh = body_spec['trimH'] * body_spec['wpp'] * hi
    # resample in premultiplied alpha, composite straight "over"
    b = body.convert('RGBa').resize((int(round(bw)), int(round(bh))), Image.LANCZOS).convert('RGBA')
    bx, by = px(-body_spec['anchorX'] * body_spec['wpp'], body_spec['trimH'] * body_spec['wpp'])
    canvas.alpha_composite(b, (int(round(bx)), int(round(by))))
    gw = GUN_R['worldW'] * hi
    gh = GUN_R['worldW'] * GUN_R['trimH'] / GUN_R['trimW'] * GUN_HEIGHT_GAIN * hi
    g = gun.convert('RGBa').resize((int(round(gw)), int(round(gh))), Image.LANCZOS).convert('RGBA')
    # bore row at MUZZLE_Y; the image's right edge at BARREL
    bore_frac = GUN_R['muzzleY'] / GUN_R['trimH']
    gx, gy = px(BARREL - GUN_R['worldW'], MUZZLE_Y)
    canvas.alpha_composite(g, (int(round(gx)), int(round(gy - bore_frac * gh))))
    small = canvas.convert('RGBa').resize((W // SS, H // SS), Image.BOX).convert('RGBA')
    a = small.split()[3].point(lambda v: 255 if v >= 128 else 0)
    small.putalpha(a)
    origin = (left * ppt, above * ppt)            # the sim point, device px
    return small, origin


if __name__ == '__main__':
    import sys
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for ppt in (18.065, 24.353):
        for f in ('idle', 'run'):
            im, o = assemble(f, ppt)
            im.save(os.path.join(out, 'crisp-%s-%g.png' % (f, ppt)))
            print(f, ppt, im.size, o)
