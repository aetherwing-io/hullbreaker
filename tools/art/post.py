"""Pixel post + packing: render ID maps -> palette-locked atlas PNG + anchor JSON.

    /opt/hb-art/bin/python tools/art/post.py --kind rig|wasp --src <render dir>
        --png <atlas.png> --json <atlas.json> --ids <part-id atlas .npz> [--name rig-v2-far]

Deterministic by construction: the weighted-mode downscale and palette lookup
are integer numpy (tools/art/lib/pixel.py), the PNG writer is hand-rolled
(no encoder metadata/timestamps), and frame order is fixed by the pose
library, not by dict or filesystem order.

The part-ID atlas (.npz, not shipped) carries the material class of every
shipped pixel so tools/art/check_anchors.py can find the drawn muzzle /
sting without guessing from colours. The check also re-verifies that the
shipped PNG is exactly palette(part-ID atlas).
"""

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
sys.path.insert(0, os.path.join(HERE, 'rig'))

import numpy as np  # noqa: E402

import palette as PAL  # noqa: E402
import pixel  # noqa: E402

OUTLINE_ID = 254           # part-ID for the 1 px ink rim (not a material)


def load_module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def canonical_order(kind, raw):
    if kind == 'rig':
        PZ = load_module('rig_pose', 'rig/pose.py')
        frames = [fid for fid, *_ in PZ.frame_specs()]
        keys = ['%s:%s' % (g, f) for g in 'RSLHF' for f in frames]
    else:
        WM = load_module('wasp_model', 'wasp/model.py')
        keys = [fid for fid, _ in WM.FRAMES]
    missing = [k for k in keys if k not in raw['frames']]
    if missing:
        raise SystemExit('render dir lacks frames: %s ...' % missing[:4])
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', required=True, choices=['rig', 'wasp'])
    ap.add_argument('--src', required=True)
    ap.add_argument('--png', required=True)
    ap.add_argument('--json', required=True)
    ap.add_argument('--ids', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--outline', type=int, default=1)
    ap.add_argument('--atlas-width', type=int, default=0)
    args = ap.parse_args()

    raw = json.load(open(os.path.join(args.src, '%s-raw.json' % args.kind)))
    hi = np.load(os.path.join(args.src, '%s-ids.npz' % args.kind))
    classes = PAL.RIG_CLASSES if args.kind == 'rig' else PAL.WASP_CLASSES
    names = list(classes.keys())
    nb = raw['bands']
    if names != raw['classes']:
        raise SystemExit('class list changed between render and post')
    weights = [w for _, w in classes.values()]
    lut = pixel.build_lut(classes, nb, PAL.tok)
    lut_dive = dict(lut)
    if args.kind == 'wasp':
        si, di = names.index('shell'), names.index('shell_dive')
        for b in range(nb):
            lut_dive[si * nb + b] = lut[di * nb + b]
    ink = PAL.tok(PAL.INK)
    ss = raw['supersample']
    cw, ch = raw['cell']
    keys = canonical_order(args.kind, raw)

    # despeckle only inside the body / shell material group
    group_names = ('armor', 'armor_dk', 'suit') if args.kind == 'rig' else ('shell', 'shell_dive', 'chassis')
    group_ids = [names.index(c) * nb + b for c in group_names for b in range(nb)]

    cells, part_cells = [], []
    for k in keys:
        lo = pixel.downscale_ids(hi[k], ss, weights, nb)
        lo = pixel.despeckle(lo, group_ids)
        if lo.shape != (ch, cw):
            raise SystemExit('cell size mismatch for %s: %s' % (k, lo.shape))
        border = np.concatenate([lo[0], lo[-1], lo[:, 0], lo[:, -1]])
        if (border != pixel.EMPTY).any():
            raise SystemExit('frame %s touches its cell border: the cell clips the pose '
                             '(widen CELL_* in the render script)' % k)
        part = lo.copy()
        if args.outline:
            part[pixel.outline_mask(lo)] = OUTLINE_ID
        use = lut_dive if raw['frames'][k].get('dive') else lut
        full = dict(use)
        full[OUTLINE_ID] = ink
        rgba = pixel.to_rgba(part, full)
        cells.append((k, rgba))
        part_cells.append((k, part))

    atlas_w = args.atlas_width or pixel.next_pow2(min(len(keys), 24) * cw)
    cols = atlas_w // cw
    rows = (len(keys) + cols - 1) // cols
    atlas_h = pixel.next_pow2(rows * ch)
    atlas, pos = pixel.pack_grid(cells, cw, ch, cols, atlas_w, atlas_h)
    part_atlas = np.full((atlas_h, atlas_w), pixel.EMPTY, dtype=np.uint8)
    for (k, part) in part_cells:
        x, y = pos[k]
        part_atlas[y:y + ch, x:x + cw] = part
    n_colors = pixel.write_indexed_png(args.png, atlas)
    np.savez_compressed(args.ids, part=part_atlas)

    D = raw['density']
    ox, oy = raw['origin']
    out = {
        'id': args.name,
        'version': 1,
        'generator': 'tools/art/build.py (headless Blender %s -> tools/art/post.py)' % args.kind,
        'atlas': {'file': os.path.basename(args.png), 'size': [atlas_w, atlas_h], 'colors': n_colors,
                  'filter': 'authored at 1 texel = 1 px at this density; sample NEAREST for crisp pixels'},
        'pxPerTile': D,
        'cell': [cw, ch],
        'origin': [ox, oy],
        'originMeaning': ('pixel-edge coords of the sim row point: RIG feet centre (player.x, player.y)'
                          if args.kind == 'rig' else 'pixel-edge coords of the wasp row point (e.x, e.y)'),
        'authoredFacing': 1,
        'mirror': 'facing -1: flip the cell horizontally about origin x (anchor x\' = 2*origin.x - x)',
        'anchorUnits': ('cell pixels, continuous, x right / y down, 0 = cell top-left edge; '
                        'tiles from the sim point: ((x - origin.x) / pxPerTile, (origin.y - y) / pxPerTile)'),
        'classes': names,
        'frames': {},
    }
    if args.kind == 'rig':
        out['sim'] = raw['sim']
        out['guns'] = list('RSLHF')
    # Shipped anchors (cell px, 3 dp). RIG: hand = right palm on the grip (the
    # gun's parent bone), handL, muzzle, head, footR / footL. Wasp: sting
    # (+ stingBase for its axis), eye, head, wingRoot.
    keep = {'rig': {'grip': 'hand', 'hand.L': 'handL', 'muzzle': 'muzzle', 'head': 'head',
                    'foot.R': 'footR', 'foot.L': 'footL'},
            'wasp': {'sting': 'sting', 'stingBase': 'stingBase', 'eye': 'eye', 'head': 'head',
                     'wingRoot': 'wingRoot'}}[args.kind]
    for k in keys:
        fr = raw['frames'][k]
        x, y = pos[k]
        a = {new_name: [round(fr['anchors'][old][0], 3), round(fr['anchors'][old][1], 3)]
             for old, new_name in keep.items()}
        row = {'x': x, 'y': y, 'w': cw, 'h': ch, 'anchors': a}
        for f in ('gun', 'frame', 'state', 'aim', 'aimDeg', 'socket', 'lhand', 'dive'):
            if f in fr:
                row[f] = fr[f]
        out['frames'][k] = row
    with open(args.json, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'), sort_keys=True)
        fh.write('\n')
    print(json.dumps({'png': args.png, 'size': [atlas_w, atlas_h], 'frames': len(keys), 'colors': n_colors}))


if __name__ == '__main__':
    main()
