"""T-109 A2 spike, candidate A — "today rendered crisp".

    /opt/hb-art/bin/python tools/art/spike/crisp.py --ppt 16.2419 --out tools/art/build/spike/a-desktop

Today's painted RIG — the shipped aim / body atlases, the R gun cutout and the
R family-accent plates — assembled exactly the way src/render/player.js
assembles them: the body plane's `anchorX` on the sim x and its bottom alpha
row on the sim y; the gun plane rooted at the hand socket (0,
CONFIG.player.muzzleY) and rotated to the aim, its bore row on the axis, its
right edge at CONFIG.player.barrelTiles, its height x1.34
(GUN_FAMILY_HEIGHT_GAIN.R), the accent quads (PAL.muzzle top plate, PAL.gun
muzzle cap) in the same gun space; recoil RIG_RECOIL_TILES back along the bore
on the fire frame. What differs is only HOW it is drawn: composed offline at 8x
the target density, area-downsampled ONCE to device pixels in premultiplied
alpha, alpha cut at 50%, colours as painted (no light, no tone map, no
mipmap, no canvas resample), shown 1 texel = 1 device pixel. It is a
diagnostic of how much of today's "muddy" is the render path; the painting
itself is a placeholder (decisions.md entry 26), not the quality target.

Frames: idle, fire, upright, jump, run-contact, run-pass, run-flight (facing
+x; the game mirrors for facing -1). Output per frame: <frame>.png plus
meta.json with the cell size and the sim point (`origin`, pixel-edge coords).
"""

import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SPR = os.path.join(ROOT, 'assets', 'generated', 'sprites')
WPN = os.path.join(ROOT, 'assets', 'generated', 'weapons')

# src/pure/rig.js (b114869)
VISUAL_H = 2.0
AIM_WPP = VISUAL_H / 429                  # RIG_AIM_WORLD_PER_PIXEL
BODY_WPP = VISUAL_H / 232                 # RIG_BODY_WORLD_PER_PIXEL (idle gunless trimH)
AIM_ATLAS = 'rig-slender-aim-atlas-v2.png'
BODY_ATLAS = 'rig-slender-body-atlas-v2.png'
FRAMES = {
    'aim-right': dict(atlas=AIM_ATLAS, atlasX=0, atlasY=0, trimX=132, trimY=297, trimW=248, trimH=429,
                      anchorX=124, wpp=AIM_WPP),
    'aim-up-right': dict(atlas=AIM_ATLAS, atlasX=512, atlasY=0, trimX=111, trimY=280, trimW=290, trimH=463,
                         anchorX=145, wpp=AIM_WPP),
    'contact': dict(atlas=BODY_ATLAS, atlasX=512, atlasY=0, trimX=141, trimY=148, trimW=230, trimH=216,
                    anchorX=132, wpp=BODY_WPP),
    'pass': dict(atlas=BODY_ATLAS, atlasX=1024, atlasY=0, trimX=188, trimY=150, trimW=135, trimH=212,
                 anchorX=76, wpp=BODY_WPP),
    'flight': dict(atlas=BODY_ATLAS, atlasX=1536, atlasY=0, trimX=156, trimY=160, trimW=199, trimH=191,
                   anchorX=112, wpp=BODY_WPP),
    'air-rise': dict(atlas=BODY_ATLAS, atlasX=0, atlasY=512, trimX=168, trimY=147, trimW=176, trimH=217,
                     anchorX=105, wpp=BODY_WPP),
}
GUN_R = dict(atlasX=0, atlasY=0, trimX=16, trimY=16, trimW=388, trimH=183, worldW=1.16, muzzleY=82)
GUN_HEIGHT_GAIN = 1.34                    # src/render/player.js GUN_FAMILY_HEIGHT_GAIN.R
MUZZLE_Y, BARREL = 1.05, 0.82             # CONFIG.player.muzzleY, barrelTiles
RECOIL = 0.095                            # RIG_RECOIL_TILES
PAL_MUZZLE = (0xff, 0xf2, 0xd8)           # src/render/palette.js CONCEPT.muzzle
PAL_GUN = (0xff, 0xc9, 0x66)              # CONFIG.palette.gun
MX = BARREL
ACCENT_R = [                              # src/render/player.js GUN_FAMILY_ACCENTS.R
    (PAL_MUZZLE, [(0.29, 0.11), (0.52, 0.12), (0.47, 0.20), (0.33, 0.19)]),
    (PAL_GUN, [(MX - 0.10, -0.17), (MX, -0.17), (MX, 0.17), (MX - 0.10, 0.17)]),
]
POSES = {
    'idle': dict(body='aim-right', aim=0.0),
    'fire': dict(body='aim-right', aim=0.0, recoil=RECOIL),
    'upright': dict(body='aim-up-right', aim=45.0),
    'jump': dict(body='air-rise', aim=0.0),
    'run-contact': dict(body='contact', aim=0.0),
    'run-pass': dict(body='pass', aim=0.0),
    'run-flight': dict(body='flight', aim=0.0),
}
SS = 8
LEFT, RIGHT, BELOW, ABOVE = 1.30, 1.50, 0.25, 2.70   # cell, tiles around the sim point


def crop(atlas, spec):
    x0 = spec['atlasX'] + spec['trimX']
    y0 = spec['atlasY'] + spec['trimY']
    return atlas.crop((x0, y0, x0 + spec['trimW'], y0 + spec['trimH']))


def assemble(pose, ppt):
    """RGBA cell at `ppt` device px per tile; returns (image, origin) with the
    sim point at pixel-EDGE coordinates origin = (ox, oy)."""
    hi = ppt * SS
    ox, oy = round(LEFT * ppt), round(ABOVE * ppt)
    W = int(math.ceil((LEFT + RIGHT) * ppt))
    H = int(math.ceil((BELOW + ABOVE) * ppt))
    canvas = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))

    def px(x, y):                                        # tiles -> hi-res canvas px
        return (ox + x * ppt) * SS, (oy - y * ppt) * SS

    spec = FRAMES[POSES[pose]['body']]
    body = crop(Image.open(os.path.join(SPR, spec['atlas'])).convert('RGBA'), spec)
    bw, bh = spec['trimW'] * spec['wpp'] * hi, spec['trimH'] * spec['wpp'] * hi
    b = body.convert('RGBa').resize((int(round(bw)), int(round(bh))), Image.LANCZOS).convert('RGBA')
    bx, by = px(-spec['anchorX'] * spec['wpp'], spec['trimH'] * spec['wpp'])
    canvas.alpha_composite(b, (int(round(bx)), int(round(by))))

    # the gun: drawn in gun space (x along the bore, y up), then rotated about
    # the socket into the aim, exactly as gunGroup / gunAssembly do
    aim = math.radians(POSES[pose]['aim'])
    recoil = POSES[pose].get('recoil', 0.0)
    gun_img = crop(Image.open(os.path.join(WPN, 'rig-weapons-atlas-v1.png')).convert('RGBA'), GUN_R)
    gw = GUN_R['worldW']
    gh = gw * GUN_R['trimH'] / GUN_R['trimW']
    # gun-space layer: x from -0.6 .. 1.0 tiles, y from -0.6 .. 0.6 (before the height gain)
    gx0, gx1, gy0, gy1 = -0.6, 1.0, -0.6, 0.6
    gl = Image.new('RGBA', (int(round((gx1 - gx0) * hi)), int(round((gy1 - gy0) * hi * GUN_HEIGHT_GAIN))), (0, 0, 0, 0))

    def gpx(x, y):                                       # gun space -> layer px
        return (x - recoil - gx0) * hi, (gy1 * GUN_HEIGHT_GAIN - y * GUN_HEIGHT_GAIN) * hi
    gimg = gun_img.convert('RGBa').resize((int(round(gw * hi)), int(round(gh * GUN_HEIGHT_GAIN * hi))),
                                          Image.LANCZOS).convert('RGBA')
    top_y = gh * (GUN_R['muzzleY'] / GUN_R['trimH'])     # bore row at gun-space y=0
    tlx, tly = gpx(MX - gw, top_y)
    gl.alpha_composite(gimg, (int(round(tlx)), int(round(tly))))
    acc = Image.new('RGBA', gl.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(acc)
    for color, pts in ACCENT_R:
        dr.polygon([gpx(x, y) for x, y in pts], fill=color + (255,))
    gl.alpha_composite(acc)
    # rotate the layer about the socket (gun space origin) by the aim
    sx, sy = gpx(0.0 + recoil, 0.0)                      # socket in layer px (recoil is not a socket move)
    rot = gl.rotate(math.degrees(aim), resample=Image.BICUBIC, center=(sx, sy), expand=False)
    cx, cy = px(0.0, MUZZLE_Y)
    canvas.alpha_composite(rot, (int(round(cx - sx)), int(round(cy - sy))))
    gun_only = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    gun_only.alpha_composite(rot, (int(round(cx - sx)), int(round(cy - sy))))
    small = canvas.convert('RGBa').resize((W, H), Image.BOX).convert('RGBA')
    a = small.split()[3].point(lambda v: 255 if v >= 128 else 0)
    small.putalpha(a)
    # the gun's own pixels (drawn over the body), for the measurements
    gsmall = gun_only.split()[3].resize((W, H), Image.BOX)
    gun_mask = (np.array(gsmall) >= 128) & (np.array(a) > 0)
    return small, (ox, oy), gun_mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--ppt', type=float, required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    meta = {'ppt': args.ppt, 'frames': {}}
    for pose in POSES:
        im, origin, gun_mask = assemble(pose, args.ppt)
        im.save(os.path.join(args.out, '%s.png' % pose))
        np.savez_compressed(os.path.join(args.out, '%s-parts.npz' % pose), gun=gun_mask)
        a = np.array(im)
        ys, xs = np.nonzero(a[..., 3])
        meta['frames'][pose] = {'origin': list(origin), 'cell': list(im.size),
                                'h': int(ys.max() - ys.min() + 1), 'w': int(xs.max() - xs.min() + 1),
                                'colours': len({tuple(c) for c in a[a[..., 3] > 0][:, :3].tolist()})}
        th = math.radians(POSES[pose]['aim'])
        meta['frames'][pose]['muzzle'] = [origin[0] + BARREL * math.cos(th) * args.ppt,
                                          origin[1] - (MUZZLE_Y + BARREL * math.sin(th)) * args.ppt]
        print(pose, meta['frames'][pose])
    with open(os.path.join(args.out, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
