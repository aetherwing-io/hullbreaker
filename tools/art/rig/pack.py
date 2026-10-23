"""RIG v3 pack: post.py's cells -> one indexed-PNG atlas per density + ONE
JSON that names every frame once.

    /opt/hb-art/bin/python -I tools/art/rig/pack.py --render <render dir> --cells <cells dir> --out <dir>

JSON shape (assets/generated/sprites/rig-v3.json), built so a loader picks a
density per device without knowing frame names twice:
  frames      ['R:stand-right', ...]  -- the 355 keys, ONCE. Frame i is cell i
              of every density's atlas: x = (i % columns) * cell.w,
              y = floor(i / columns) * cell.h.
  anchors     {name: [[x, y] per frame]} in TILES from the sim point, x right,
              y up -- density-independent. In a density's cell pixels:
              px = origin.x + x * pxPerTile, py = origin.y - y * pxPerTile.
              muzzle = the sim's shot origin (src/sim/player.js), drawnMuzzle
              = where the drawn barrel ends (muzzle minus the kick on
              stand-fire frames), hand = the gun fist (wrist), handL = the
              far hand, support = where the far hand holds the gun (null when
              it is on a rung or resting), socket, grip, head, footR, footL.
  lhand       per frame: 'gun' | 'rung' | 'rest'
  densities   [{id, pxPerTile, image, size, cell, origin, columns, serves}]
  clips       state -> poses / aims / run cycle (tools/art/rig/poses.py CLIPS)
  sim         the numbers the art is posed around (asserted at build time)
"""

import argparse
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import guns as G  # noqa: E402
import pixel  # noqa: E402
import poses as P  # noqa: E402
import post as PO  # noqa: E402

ANCHORS = ('muzzle', 'drawnMuzzle', 'socket', 'grip', 'support', 'hand', 'handL', 'head', 'footR', 'footL')
# Screens that draw a density at an INTEGER texel -> device-px scale. FAR's
# px/tile scales with the viewport height (measured: 16.24 css px/tile at 720
# css px, 18.07 at 800, 11.69 at 518 -- 0.02256 x height), times the DPR.
SERVES = {
    'd16': ['x1: 1280x720 css desktop FAR at DPR 1 (16.24 px/tile, measured)',
            'x2: 720 css px tall at DPR 2, or 1440 css px tall at DPR 1 (32.5)',
            'x3: 2160 css px tall at DPR 1 (48.7)'],
    'd23': ['x1: phone landscape, RIG 6% of 390 css px (T-107 framing) at DPR 2 (23.4)',
            'x1: 1920x1080 desktop FAR at DPR 1 needs 24.4 -- d23 draws RIG 4% small there'],
    'd35': ['x1: phone landscape, RIG 6% of 390 css px (T-107 framing) at DPR 3 (35.1): the operator\'s iPhone'],
}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


def load_meta(render_dir):
    frames, sims, hi, guns = {}, None, None, {}
    for f in sorted(os.listdir(render_dir)):
        if f.startswith('meta-') and f.endswith('.json') and 'falsify' not in f:
            m = json.load(open(os.path.join(render_dir, f)))
            frames.update(m['frames'])
            guns.update(m['guns'])
            if sims is not None and (m['sim'] != sims or m['hiCell'] != hi['hiCell']):
                raise SystemExit('pack: render metas disagree (%s)' % f)
            sims = m['sim']
            hi = {k: m[k] for k in ('hiPpt', 'hiCell', 'hiOrigin', 'cellTiles', 'exaggeration')}
    hi['guns'] = guns
    return frames, sims, hi


def atlas_size(n, cw, ch):
    best = None
    for w in (256, 512, 1024, 2048, 4096):
        cols = w // cw
        if cols == 0:
            continue
        rows = -(-n // cols)
        h = pixel.next_pow2(rows * ch)
        if h > 4096:
            continue
        cand = (w * h, max(w, h), w, h, cols)
        if best is None or cand < best:
            best = cand
    return best[2], best[3], best[4]


def pack(render_dir, cells_dir, out_dir, name='rig-v3', guns=P.GUNS):
    frames, sim, hi = load_meta(render_dir)
    keys = P.frame_keys(guns)
    missing = [k for k in keys if k not in frames]
    if missing:
        raise SystemExit('pack: %d frames were not rendered, e.g. %s' % (len(missing), missing[:5]))
    os.makedirs(out_dir, exist_ok=True)
    meta_one = {'hiPpt': hi['hiPpt'], 'hiCell': hi['hiCell'], 'hiOrigin': hi['hiOrigin']}
    dens_out = []
    for dn in PO.DENSITY_ORDER:
        ppt = PO.DENSITIES[dn]
        cw, ch, ox, oy = PO.cell_geometry(meta_one, ppt)
        W, H, cols = atlas_size(len(keys), cw, ch)
        cells = []
        for k in keys:
            g, pid = k.split(':', 1)
            im = np.asarray(Image.open(os.path.join(cells_dir, dn, g, pid + '.png')).convert('RGBA'))
            if im.shape[:2] != (ch, cw):
                raise SystemExit('pack: %s %s is %s, expected %dx%d' % (k, dn, im.shape, cw, ch))
            cells.append((k, im))
        atlas, _ = pixel.pack_grid(cells, cw, ch, cols, W, H)
        img = '%s-%s.png' % (name, dn)
        n_col = pixel.write_indexed_png(os.path.join(out_dir, img), atlas)
        dens_out.append({'id': dn, 'pxPerTile': ppt, 'image': img, 'size': [W, H], 'cell': [cw, ch],
                         'origin': [ox, oy], 'columns': cols, 'colours': n_col, 'serves': SERVES[dn]})
    anchors = {a: [frames[k]['tiles'][a] for k in keys] for a in ANCHORS}
    doc = {
        'id': name, 'version': 1, 'task': 'T-124',
        'about': 'RIG v3: the CC0 soldier (Irondust) + five CC0 guns (quaternius), posed on the sim\'s shot line, '
                 'toon-reduced in the concept boards\' khaki/rust (decisions entry 27). Built by '
                 'tools/art/build_rig_v3.py; not wired into the game yet (T-124 phase 2).',
        'authoredFacing': 1,
        'mirror': 'cells face +x; mirror about origin.x when the gun points left (aim.x < -0.1) or, for a vertical '
                  'aim, when the sim facing is -1 (player.js mirrorY). Travelling against the gun (strafe): play the '
                  'run cycle backwards.',
        'sample': 'NEAREST, no mipmaps, unlit (palette-exact pixels); place origin on the projected sim point, '
                  'snapped to the device pixel grid',
        'sim': dict(sim, recoilTiles=P.RECOIL_TILES),
        'units': 'anchors in tiles from the sim point (x right, y up); px = origin + (x, -y) * pxPerTile',
        'guns': {L: {'chassis': L, 'source': G.GUNS[L]['fbx'], 'looks': G.GUNS[L]['looks']} for L in guns},
        'poses': [pid for pid, *_ in P.frame_specs()],
        'frames': keys,
        'lhand': [frames[k]['lhand'] for k in keys],
        'anchors': anchors,
        'clips': P.CLIPS,
        'densities': dens_out,
    }
    jp = os.path.join(out_dir, name + '.json')
    with open(jp, 'w') as fh:
        json.dump(doc, fh, separators=(',', ':'), sort_keys=False)
        fh.write('\n')
    out = {jp: sha(jp)}
    for d in dens_out:
        p = os.path.join(out_dir, d['image'])
        out[p] = sha(p)
    return doc, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', required=True)
    ap.add_argument('--cells', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--guns', default=','.join(P.GUNS), help='a subset is for iteration only; the build packs all five')
    args = ap.parse_args()
    doc, hashes = pack(args.render, args.cells, args.out, guns=tuple(args.guns.split(',')))
    for p, h in hashes.items():
        print(h, os.path.getsize(p), p)


if __name__ == '__main__':
    main()
