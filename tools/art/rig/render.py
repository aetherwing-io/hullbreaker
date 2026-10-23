"""Render every RIG frame x every gun as supersampled ID maps + anchors.

    /opt/hb-art/bin/python tools/art/rig/render.py --out <dir> --density <px/tile> [--ss 8]
        [--only <frame-id-substring>] [--guns RSLHF] [--offset-gun S:0.1]

Writes <out>/rig-ids.npz (uint8 ID maps, one per frame) and <out>/rig-raw.json
(per-frame anchors in OUTPUT pixel coordinates, measured by projecting the
evaluated Blender empties through the fixed orthographic camera).

--offset-gun L:dx moves that gun's MESH dx tiles down its barrel while leaving
its grip/muzzle empties where they were. It exists only to prove that
tools/art/check_anchors.py binds (the drawn muzzle must stop matching).
"""

import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

import bl  # noqa: E402
import kin  # noqa: E402
import model as M  # noqa: E402
import pose as PZ  # noqa: E402
from palette import RIG_CLASSES  # noqa: E402

CLASS_NAMES = list(RIG_CLASSES.keys())
N_BANDS = 4
LIGHT = (0.40, -0.60, 0.69)       # key light: from the front, the viewer side, above


def band_for(cls, d):
    if cls == 'armor':
        return 0 if d >= 0.38 else (1 if d >= -0.20 else 2)
    if cls == 'armor_dk':
        return 0 if d >= 0.25 else 1
    if cls == 'suit':
        return 0 if d >= 0.30 else 1
    if cls == 'gunmetal':
        return 0 if d >= 0.40 else 1
    if cls == 'gunlight':
        return 0 if d >= 0.10 else 1
    return 0


# Cell geometry in OUTPUT pixels is expressed in tiles so every density frames
# the same world rectangle: x in [-CELL_LEFT, CELL_RIGHT], z in [-CELL_BELOW, CELL_ABOVE].
CELL_LEFT, CELL_RIGHT = 1.00, 1.25
CELL_BELOW, CELL_ABOVE = 0.20, 2.25


def cell_geometry(density):
    w = int(math.ceil((CELL_LEFT + CELL_RIGHT) * density))
    h = int(math.ceil((CELL_BELOW + CELL_ABOVE) * density))
    w += w % 2
    ox = int(round(CELL_LEFT * density))
    oy = int(round(CELL_ABOVE * density))
    return w, h, (ox, oy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--density', type=float, required=True)
    ap.add_argument('--ss', type=int, default=8)
    ap.add_argument('--only', default='')
    ap.add_argument('--guns', default='RSLHF')
    ap.add_argument('--offset-gun', default='')
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

    # ---- armature, checked against the solver's own rest frames
    arm = bl.build_armature(scene, 'RIG', M.BONES)
    rest_bl = bl.rest_frames(arm)
    for name, m in PZ.REST.items():
        err = float(np.abs(rest_bl[name] - m).max())
        if err > 1e-4:   # float32 bone storage
            raise SystemExit('rest frame mismatch for %s: %.2e' % (name, err))

    # ---- body parts, one object per bone, parented at rest
    body_objs = []
    for bone, parts in M.body_parts().items():
        mb = bl.MeshBuilder()
        M.build_parts(mb, parts)
        ob = mb.to_object('rig.' + bone, bank, scene)
        bl.parent_to_bone(ob, arm, bone)
        body_objs.append(ob)

    # ---- guns: modelled in gun-local space, parented to the right hand bone
    import bpy
    from mathutils import Matrix
    hand_in_gun = PZ.hand_in_gun_right()
    gun_rest_world = PZ.REST['hand.R'] @ np.linalg.inv(hand_in_gun)
    offset = {}
    if args.offset_gun:
        letter, dx = args.offset_gun.split(':')
        offset[letter] = float(dx)
    guns, empties = {}, {}
    gp_all = M.gun_parts()
    for letter in 'RSLHF':
        gp = gp_all[letter]
        reach = M.gun_extent_x(gp['parts'])
        if abs(reach - M.MUZZLE_X) > 1e-9:
            raise SystemExit('gun %s geometry ends at x=%.4f, not the muzzle %.4f' % (letter, reach, M.MUZZLE_X))
        mb = bl.MeshBuilder()
        mesh_shift = kin.translate(offset.get(letter, 0.0), 0, 0)
        M.build_parts(mb, gp['parts'], m=mesh_shift)
        ob = mb.to_object('gun.' + letter, bank, scene)
        ob.matrix_world = Matrix(gun_rest_world.tolist())
        bl.parent_to_bone(ob, arm, 'hand.R')
        guns[letter] = ob
        for ename, local in (('grip', M.GRIP), ('muzzle', kin.v3(M.MUZZLE_X, 0, 0)),
                             ('foregrip', gp['foregrip'])):
            e = bpy.data.objects.new('%s.%s' % (ename, letter), None)
            scene.collection.objects.link(e)
            e.parent = ob
            e.matrix_parent_inverse = Matrix.Identity(4)
            e.location = tuple(float(c) for c in local)
            empties[(ename, letter)] = e

    # body anchors as empties on their bones (rest positions)
    body_anchor_rest = {
        'head': ('head', (0.03, 0.0, 1.79)),
        'visor': ('head', (0.165, -0.05, 1.79)),
        'foot.R': ('foot.R', (0.04, -0.11, 0.0)),
        'foot.L': ('foot.L', (0.04, 0.11, 0.0)),
        'hand.L': ('hand.L', (0.0, M.SHOULDER_Y, 0.795)),
        'pack': ('chest', (-0.31, 0.0, 1.30)),
    }
    for key, (bone, pos) in body_anchor_rest.items():
        e = bpy.data.objects.new('anchor.' + key, None)
        scene.collection.objects.link(e)
        e.matrix_world = Matrix.Translation(pos)
        bl.parent_to_bone(e, arm, bone)
        empties[('body', key)] = e

    view = bpy.context.view_layer
    specs = PZ.frame_specs()
    if args.only:
        specs = [s for s in specs if args.only in s[0]]
    gun_list = [g for g in 'RSLHF' if g in args.guns]

    ids_out = {}
    raw = {
        'density': args.density, 'supersample': ss, 'cell': [cell_w, cell_h], 'origin': list(origin),
        'classes': CLASS_NAMES, 'bands': N_BANDS, 'light': list(LIGHT),
        'sim': {'muzzleY': PZ.SIM_MUZZLE_Y, 'barrelTiles': PZ.SIM_BARREL, 'crouchMuzzleY': PZ.CROUCH_MUZZLE_Y},
        'offset_gun': args.offset_gun or None, 'frames': {},
    }
    render_ms = []
    tmp_png = os.path.join(args.out, '_render.png')
    worst_solver = 0.0
    for frame_id, state, aim_name, spec in specs:
        for letter in gun_list:
            try:
                sol = PZ.solve_adaptive(spec, letter)
            except PZ.PoseError as exc:
                raise SystemExit('%s/%s: %s' % (frame_id, letter, exc))
            spec = sol['spec']
            bl.apply_pose(arm, sol['frames'])
            for g, ob in guns.items():
                ob.hide_render = (g != letter)
            view.update()
            # the evaluated hand bone and gun must be exactly what the solver said
            hand_w = np.array(arm.matrix_world) @ np.array(arm.pose.bones['hand.R'].matrix)
            e1 = float(np.abs(hand_w - sol['frames']['hand.R']).max())
            gun_w = np.array(guns[letter].matrix_world)
            e2 = float(np.abs(gun_w[:3, 3] - sol['gun'][:3, 3]).max())
            worst_solver = max(worst_solver, e1, e2)
            if e1 > 1e-4 or e2 > 1e-4:
                raise SystemExit('%s/%s: evaluated rig drifted from the solver (%.2e, %.2e)'
                                 % (frame_id, letter, e1, e2))
            bl.assign_bands(body_objs + [guns[letter]], LIGHT, band_for)
            t0 = time.time()
            rgba = bl.render_rgba(scene, tmp_png)
            render_ms.append((time.time() - t0) * 1000.0)
            ids = bl.decode_ids(rgba, len(CLASS_NAMES), N_BANDS)
            key = '%s:%s' % (letter, frame_id)
            ids_out[key] = np.where(ids < 0, 255, ids).astype(np.uint8)

            def px(world):
                x, y = bl.project_px(scene, cam, world, cell_w, cell_h)
                return [round(x, 4), round(y, 4)]

            a = {}
            for ename in ('grip', 'muzzle', 'foregrip'):
                a[ename] = px(empties[(ename, letter)].matrix_world.translation)
            for key2 in body_anchor_rest:
                a[key2] = px(empties[('body', key2)].matrix_world.translation)
            a['hand.R'] = a['grip']
            a['origin'] = px((0.0, 0.0, 0.0))
            sock = spec.get('socket', (0.0, PZ.SIM_MUZZLE_Y))
            ang = math.radians(spec.get('aim', 0.0))
            sim_muzzle = (sock[0] + math.cos(ang) * PZ.SIM_BARREL, -0.30, sock[1] + math.sin(ang) * PZ.SIM_BARREL)
            a['simMuzzle'] = px(sim_muzzle)
            raw['frames'][key] = {
                'gun': letter, 'frame': frame_id, 'state': state, 'aim': aim_name,
                'aimDeg': spec.get('aim', 0.0), 'socket': list(sock), 'anchors': a,
                'lhand': sol['diag']['lhand'], 'adjust': sol['diag']['adjust'],
            }
    os.remove(tmp_png)
    raw['timing'] = {
        'frames': len(render_ms),
        'render_ms_mean': round(float(np.mean(render_ms)), 2) if render_ms else None,
        'render_ms_max': round(float(np.max(render_ms)), 2) if render_ms else None,
        'total_s': round(time.time() - t_start, 2),
        'solver_vs_blender_max_err_tiles': worst_solver,
    }
    np.savez_compressed(os.path.join(args.out, 'rig-ids.npz'), **ids_out)
    with open(os.path.join(args.out, 'rig-raw.json'), 'w') as fh:
        json.dump(raw, fh, indent=1, sort_keys=True)
    print(json.dumps(raw['timing']))


if __name__ == '__main__':
    main()
