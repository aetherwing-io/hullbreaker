"""Render the wasp's frames as supersampled ID maps + anchors.

    /opt/hb-art/bin/python tools/art/wasp/render.py --out <dir> --density <px/tile> [--ss 8]
        [--offset-sting dx]

Frames mirror what the game shows for the neutral wasp today (sprite-table.js:
one idle card, a four-phase flight loop, a dive card; hits are flashed by the
material) plus the states the task names: a dive-lock tell and a hit recoil.
--offset-sting moves the sting MESH (not its anchor) to prove the anchor
check binds on this sheet too.
"""

import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, os.path.join(HERE, '..', 'rig'))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import bl  # noqa: E402
import kin  # noqa: E402
from kin import about, orthonormal_from_y, rot_axis, rot_x, rot_y, rot_z, translate, v3  # noqa: E402
from palette import WASP_CLASSES  # noqa: E402

import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location('wasp_model', os.path.join(HERE, 'model.py'))
W = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(W)
_spec2 = importlib.util.spec_from_file_location('rig_model', os.path.join(HERE, '..', 'rig', 'model.py'))
RM = importlib.util.module_from_spec(_spec2)
_spec2.loader.exec_module(RM)

CLASS_NAMES = list(WASP_CLASSES.keys())
N_BANDS = 4
LIGHT = (0.40, -0.60, 0.69)

CELL_LEFT, CELL_RIGHT = 1.10, 0.80
CELL_BELOW, CELL_ABOVE = 0.90, 0.95


def band_for(cls, d):
    if cls in ('shell', 'shell_dive'):
        return 0 if d >= 0.35 else (1 if d >= -0.25 else 2)
    if cls == 'wing':
        return 0 if abs(d) >= 0.30 else 1
    if cls == 'sting':
        return 0 if d >= 0.0 else 1
    return 0


def cell_geometry(density):
    w = int(math.ceil((CELL_LEFT + CELL_RIGHT) * density))
    h = int(math.ceil((CELL_BELOW + CELL_ABOVE) * density))
    w += w % 2
    return w, h, (int(round(CELL_LEFT * density)), int(round(CELL_ABOVE * density)))


REST = {name: orthonormal_from_y(v3(*t) - v3(*h), v3(*z), v3(*h)) for name, _p, h, t, z in W.BONES}

FRAMES = W.FRAMES


def solve(spec):
    B = rot_z(-spec.get('yaw', 24.0))
    root = translate(0, 0, spec.get('bob', 0.0)) @ B @ rot_y(spec.get('pitch', 0.0))
    posed = {'root': root @ REST['root'], 'thorax': root @ REST['thorax']}
    th = posed['thorax'] @ np.linalg.inv(REST['thorax'])
    left = v3(0, 1, 0)
    posed['head'] = th @ about(REST['head'][:3, 3], rot_axis(left, spec.get('head', 0.0))) @ REST['head']
    c1, c2, c3 = spec.get('curl', (0, 0, 0))
    a1 = th @ about(REST['abd1'][:3, 3], rot_axis(left, -c1))
    posed['abd1'] = a1 @ REST['abd1']
    a2 = a1 @ about(REST['abd2'][:3, 3], rot_axis(left, -c2))
    posed['abd2'] = a2 @ REST['abd2']
    a3 = a2 @ about(REST['sting'][:3, 3], rot_axis(left, -c3))
    posed['sting'] = a3 @ REST['sting']
    for side, sy in (('R', -1), ('L', 1)):
        for wing in ('F', 'B'):
            name = 'wing%s.%s' % (wing, side)
            flap, sweep = spec['wings'][wing]
            # raise: the span swings from +-Y to +Z; sweep: the tip goes back
            m = rot_z(-sy * sweep) @ rot_x(sy * flap)
            posed[name] = th @ about(REST[name][:3, 3], m) @ REST[name]
    return posed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--density', type=float, required=True)
    ap.add_argument('--ss', type=int, default=8)
    ap.add_argument('--offset-sting', type=float, default=0.0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    t_start = time.time()

    scene = bl.reset()
    cell_w, cell_h, origin = cell_geometry(args.density)
    ss = args.ss
    bl.setup_render(scene, cell_w * ss, cell_h * ss)
    cam = bl.make_camera(scene)
    bl.frame_camera(cam, cell_w, cell_h, origin, args.density)
    bank = bl.MaterialBank(CLASS_NAMES, N_BANDS)
    arm = bl.build_armature(scene, 'WASP', W.BONES)
    rest_bl = bl.rest_frames(arm)
    for name, m in REST.items():
        if float(np.abs(rest_bl[name] - m).max()) > 1e-4:   # float32 bone storage
            raise SystemExit('wasp rest frame mismatch: ' + name)

    import bpy
    from mathutils import Matrix
    objs = []
    for bone, prts in W.parts().items():
        if not prts:
            continue
        mb = bl.MeshBuilder()
        m = None
        if bone == 'sting' and args.offset_sting:
            d = kin.unit(W.STING_TIP - v3(-0.68, 0, -0.16))
            m = translate(d * args.offset_sting)
        RM.build_parts(mb, prts, m=m)
        ob = mb.to_object('wasp.' + bone, bank, scene)
        bl.parent_to_bone(ob, arm, bone)
        objs.append(ob)
    anchors_rest = {
        'sting': ('sting', tuple(W.STING_TIP)),
        'eye': ('head', tuple(W.EYE)),
        'head': ('head', (0.30, 0.0, 0.0)),
        'wingRoot': ('thorax', (0.0, 0.0, 0.12)),
    }
    empties = {}
    for key, (bone, pos) in anchors_rest.items():
        e = bpy.data.objects.new('anchor.' + key, None)
        scene.collection.objects.link(e)
        e.matrix_world = Matrix.Translation(pos)
        bl.parent_to_bone(e, arm, bone)
        empties[key] = e

    view = bpy.context.view_layer
    raw = {'density': args.density, 'supersample': ss, 'cell': [cell_w, cell_h], 'origin': list(origin),
           'classes': CLASS_NAMES, 'bands': N_BANDS, 'light': list(LIGHT),
           'offset_sting': args.offset_sting or None, 'frames': {}}
    ids_out = {}
    render_ms = []
    tmp_png = os.path.join(args.out, '_render.png')
    worst = 0.0
    for fid, spec in FRAMES:
        posed = solve(spec)
        bl.apply_pose(arm, posed)
        view.update()
        for name in ('thorax', 'sting'):
            e = float(np.abs(np.array(arm.pose.bones[name].matrix) - posed[name]).max())
            worst = max(worst, e)
            if e > 1e-4:
                raise SystemExit('%s: evaluated wasp drifted from the solver (%s %.2e)' % (fid, name, e))
        bl.assign_bands(objs, LIGHT, band_for)
        t0 = time.time()
        rgba = bl.render_rgba(scene, tmp_png)
        render_ms.append((time.time() - t0) * 1000.0)
        ids = bl.decode_ids(rgba, len(CLASS_NAMES), N_BANDS)
        ids_out[fid] = np.where(ids < 0, 255, ids).astype(np.uint8)

        def px(world):
            x, y = bl.project_px(scene, cam, world, cell_w, cell_h)
            return [round(x, 4), round(y, 4)]

        a = {k: px(e.matrix_world.translation) for k, e in empties.items()}
        a['origin'] = px((0.0, 0.0, 0.0))
        # direction the sting points (base -> tip), for the drawn-tip check
        base_w = kin.xform(posed['sting'] @ np.linalg.inv(REST['sting']), v3(-0.68, 0, -0.16))
        a['stingBase'] = px(tuple(base_w))
        raw['frames'][fid] = {'frame': fid, 'state': fid.split('-')[0], 'dive': bool(spec.get('dive')),
                              'anchors': a}
    os.remove(tmp_png)
    raw['timing'] = {'frames': len(render_ms),
                     'render_ms_mean': round(float(np.mean(render_ms)), 2),
                     'render_ms_max': round(float(np.max(render_ms)), 2),
                     'total_s': round(time.time() - t_start, 2),
                     'solver_vs_blender_max_err_tiles': worst}
    np.savez_compressed(os.path.join(args.out, 'wasp-ids.npz'), **ids_out)
    with open(os.path.join(args.out, 'wasp-raw.json'), 'w') as fh:
        json.dump(raw, fh, indent=1, sort_keys=True)
    print(json.dumps(raw['timing']))


if __name__ == '__main__':
    main()
