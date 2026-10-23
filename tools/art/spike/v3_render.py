"""T-109 A2 spike, candidate B ("3D v3") — render: a CC0 character posed on the
simulation's shot line, rendered to DATA passes (no colours yet) at a
supersampled size for v3_post.py to toon-shade and reduce to sprite pixels.

    /opt/hb-art/bin/python tools/art/spike/v3_render.py --ppt 16.2419 --out tools/art/build/spike/b-desktop
    /opt/hb-art/bin/python tools/art/spike/v3_render.py --ppt 23.39 --out tools/art/build/spike/b-phone

Base mesh, helmet, hand: "Sci-fi soldier" by Irondust (OpenGameArt, CC0); gun:
Bullpup_2 from quaternius' Ultimate Gun Pack (OpenGameArt, CC0). The only
geometry made here is a two-box back pack. tools/art/spike/cc0.json records
the sources; fetch_cc0.py downloads and sha256-checks them into the git-
ignored tools/art/build/cc0/ (nothing third-party is committed).

What carries over from the T-109 v2 pipeline: the SIM fixes the gun — the bore
passes through (0, CONFIG.player.muzzleY) along the aim, muzzle
CONFIG.player.barrelTiles down it, exactly as src/sim/player.js spawns a shot —
and the body is solved around it with analytic two-bone IK (tools/art/lib/
kin.py); one fixed orthographic camera; anchors projected from the evaluated
scene. What is new: a professionally modelled base mesh instead of primitive
boxes, exaggerated proportions for a ~32-47 px read (bigger helmet, hands and
gun, thicker limbs, shorter legs), and per-pixel data passes — base-texture
zones, smooth normals, ambient occlusion, object id, body region, depth —
rendered with Cycles at --ss x the output size, one sample per pixel at the
pixel centre (exact, noise-free, reproducible).

Poses (all facing +x; the game mirrors for facing -1): idle (aim right),
upright (aim 45 deg), fire (idle + the game's recoil offset), jump (air rise,
legs tucked), run-contact / run-pass / run-flight (one stride).
"""

import argparse
import json
import math
import os
import sys
import time

import bpy  # noqa: E402  (must precede mathutils)
from mathutils import Matrix, Vector  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, '..'))
ROOT = os.path.abspath(os.path.join(ART, '..', '..'))
sys.path.insert(0, os.path.join(ART, 'lib'))

import numpy as np  # noqa: E402

import bl  # noqa: E402
from kin import two_bone_ik, unit  # noqa: E402

CC0 = os.path.join(ART, 'build', 'cc0')
BLEND = os.path.join(CC0, 'irondust-scifi-soldiers', 'files', 'Mesh.blend')
ALBEDO = os.path.join(CC0, 'irondust-scifi-soldiers', 'files', 'FederalSoldierSkin_Albedo.tga')
EMISSION = os.path.join(CC0, 'irondust-scifi-soldiers', 'files', 'FederalSoldierSkin_Emission.png')
GUN_FBX = os.path.join(CC0, 'quaternius-ultimate-gun-pack', 'files', 'Bullpup_2.fbx')

# The simulation's numbers (src/config.js CONFIG.player; tools/art/build.py
# re-reads them for v2 — they have not changed).
SIM_MUZZLE_Y = 1.05
SIM_BARREL = 0.82
RECOIL_TILES = 0.095      # src/pure/rig.js RIG_RECOIL_TILES (presentation only)
GUN_DEPTH = -0.10         # toward the camera (v2: -0.20; the far hand could not reach the foregrip)

YAW_DEG = 16.0            # body turned toward the camera (a 3/4 profile)
BODY_SCALE = 0.93         # a shorter body under a bigger helmet: shoulders nearer the hip-held gun
HEAD_SCALE = 1.50         # exaggeration for a ~32 px read (v3 WIP: 1.32)
HAND_SCALE = 1.35
LIMB_THICK = 1.28         # upper/fore arms: thicker
ARM_LEN = 1.10            # ...and a little longer: the sim's grip is at hip height
LEG_THICK = 1.34          # thighs, shins
LEG_LEN = 0.95            # shorter legs: a heavier, more heroic read
CHEST_SCALE = (1.16, 1.0, 1.12)
SHOULDER_SCALE = 1.30
GUN_LENGTH = 1.14         # stock to muzzle, tiles
GUN_THICK = 1.60          # chunkier gun: height/width about the bore line

# Cell layout in tiles around the sim point (feet on the deck).
CELL_LEFT, CELL_RIGHT, CELL_BELOW, CELL_ABOVE = 1.05, 1.35, 0.20, 2.45

OBJ_IDS = {'Body': 1, 'Head1': 2, 'HandSimple': 3, 'gun': 4, 'pack': 5}
REGIONS = {'torso': 1, 'head': 2, 'arm_R': 3, 'arm_L': 4, 'hand': 5, 'leg_R': 6, 'leg_L': 7, 'foot': 8}
GUN_SLOTS = {'MainDark': (1.0, 0.0, 0.0), 'Main': (0.0, 1.0, 0.0), 'MainLight': (0.0, 0.0, 1.0)}

# ---------------------------------------------------------------- poses
# World: X screen-right (travel), Y into the screen, Z up; the sim point at the
# origin. foot_*: (x, y, z lift above the deck, heel-up degrees). The right leg
# is the NEAR leg (the character faces +x, so its right side faces the camera).
# `pelvis_drop` is extra crouch beyond what the feet need; `air` poses keep the
# pelvis at its standing height (the gun, not the feet, is pinned to the sim).
POSES = {
    'idle': dict(aim=0.0, pelvis=(-0.04, 0.0), pelvis_drop=0.03, lean=6.0, chest_lean=4.0, chest_twist=-14.0,
                 foot_R=(-0.17, -0.10, 0.0, 0.0), foot_L=(0.19, 0.12, 0.0, 0.0), knee_out=0.10,
                 head_turn=18.0, head_pitch=-4.0),
    'fire': dict(aim=0.0, recoil=RECOIL_TILES, pelvis=(-0.05, 0.0), pelvis_drop=0.03, lean=4.0, chest_lean=3.0,
                 chest_twist=-14.0, foot_R=(-0.17, -0.10, 0.0, 0.0), foot_L=(0.19, 0.12, 0.0, 0.0), knee_out=0.10,
                 head_turn=18.0, head_pitch=-4.0),
    'upright': dict(aim=45.0, pelvis=(-0.07, 0.0), pelvis_drop=0.03, lean=-2.0, chest_lean=-6.0, chest_twist=-14.0,
                    foot_R=(-0.20, -0.10, 0.0, 0.0), foot_L=(0.17, 0.12, 0.0, 0.0), knee_out=0.10,
                    head_turn=14.0, head_pitch=22.0),
    'jump': dict(aim=0.0, air=True, pelvis=(-0.06, 0.0), pelvis_lift=0.10, lean=10.0, chest_lean=4.0,
                 chest_twist=-14.0, foot_R=(-0.34, -0.08, 0.42, 30.0), foot_L=(0.12, 0.10, 0.58, -10.0),
                 knee_out=0.06, head_turn=18.0, head_pitch=-2.0),
    # one stride: contact (far leg forward, heel down; near leg back, toe
    # pushing), pass (near leg planted under the hips, far knee driving
    # forward), flight (both feet off the deck, legs split)
    'run-contact': dict(aim=0.0, pelvis=(-0.02, 0.0), pelvis_drop=0.05, lean=14.0, chest_lean=6.0, chest_twist=-14.0,
                        foot_R=(-0.52, -0.07, 0.10, 42.0), foot_L=(0.46, 0.10, 0.0, -6.0), knee_out=0.06,
                        head_turn=18.0, head_pitch=-8.0),
    'run-pass': dict(aim=0.0, pelvis=(-0.02, 0.0), pelvis_drop=0.10, lean=12.0, chest_lean=6.0, chest_twist=-14.0,
                     foot_R=(0.02, -0.07, 0.0, 0.0), foot_L=(0.12, 0.10, 0.36, 25.0), knee_out=0.05,
                     head_turn=18.0, head_pitch=-8.0),
    'run-flight': dict(aim=0.0, air=True, pelvis=(-0.02, 0.0), pelvis_lift=0.06, lean=14.0, chest_lean=6.0,
                       chest_twist=-14.0, foot_R=(0.30, -0.07, 0.20, -4.0), foot_L=(-0.50, 0.10, 0.40, 55.0),
                       knee_out=0.05, head_turn=18.0, head_pitch=-8.0),
}


def region_of(bone):
    b = bone.split('.')[0]
    side = bone.rsplit('.', 1)[-1] if '.' in bone else ''
    if b == 'head':
        return 'head'
    if b in ('hips', 'spine', 'chest', 'neck'):
        return 'torso'
    if b in ('shoulder', 'upper_arm', 'forearm'):
        return 'arm_' + side
    if b in ('hand', 'palm', 'thumb') or b.startswith('f_'):
        return 'hand'
    if b in ('thigh', 'shin'):
        return 'leg_' + side
    if b in ('foot', 'toe', 'heel'):
        return 'foot'
    return 'torso'


def paint_regions(ob, fixed=None):
    """Body region per vertex (its strongest bone weight) as a colour
    attribute, rendered as its own pass so the post can give each region its
    own value zone instead of letting the texture decide."""
    me = ob.data
    attr = me.color_attributes.new('region', 'FLOAT_COLOR', 'POINT')
    names = {g.index: g.name for g in ob.vertex_groups}
    for v in me.vertices:
        if fixed:
            code = REGIONS[fixed]
        else:
            best = max(v.groups, key=lambda g: g.weight, default=None)
            code = REGIONS[region_of(names[best.group])] if best else REGIONS['torso']
        attr.data[v.index].color = (code / 16.0, 0.0, 0.0, 1.0)


def build_pack(arm):
    """Kit-bash: a salvage pack on the back (the boards' RIG wears one) — two
    bevelled boxes parented to the chest bone. The only geometry not from the
    CC0 sources."""
    import bmesh
    me = bpy.data.meshes.new('pack')
    bm = bmesh.new()
    for (cx, cy, cz), (sx, sy, sz) in (((0.0, 0.17, 1.38), (0.38, 0.22, 0.44)),
                                       ((0.0, 0.27, 1.30), (0.28, 0.10, 0.24))):
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']:
            v.co.x = cx + v.co.x * sx
            v.co.y = cy + v.co.y * sy
            v.co.z = cz + v.co.z * sz
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.03, segments=2, affect='EDGES')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(bpy.data.materials.new('pack'))
    ob = bpy.data.objects.new('pack', me)
    bpy.context.scene.collection.objects.link(ob)
    bl.parent_to_bone(ob, arm, 'chest')
    return ob


def rot_axis(axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 4, Vector(axis)))


def minimal_rotation(a, b):
    a, b = unit(a), unit(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        if c > 0:
            return np.eye(3)
        p = unit(np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]))
        return np.array(Matrix.Rotation(math.pi, 3, Vector(p)))
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


def bone_frame(head, y_dir, rest_world, scale=(1.0, 1.0, 1.0)):
    """A world bone frame at `head` whose Y axis is y_dir, twisted like the
    rest frame (minimal rotation from rest Y), with per-axis scale."""
    r_rest = rest_world[:3, :3]
    s_rest = np.linalg.norm(r_rest, axis=0)
    r_rest = r_rest / s_rest
    r_new = minimal_rotation(r_rest[:, 1], y_dir) @ r_rest
    m = np.eye(4)
    m[:3, :3] = r_new * (s_rest * np.asarray(scale))
    m[:3, 3] = head
    return m


def load_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    scene = bpy.context.scene
    with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ('metarig', 'Body', 'Head1', 'HandSimple')]
    for ob in list(bpy.data.objects):
        scene.collection.objects.link(ob)
    arm = bpy.data.objects['metarig']
    paint_regions(bpy.data.objects['Body'])
    paint_regions(bpy.data.objects['Head1'], 'head')
    paint_regions(bpy.data.objects['HandSimple'], 'hand')
    bpy.ops.import_scene.fbx(filepath=GUN_FBX)
    gun = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Bullpup')][0]
    gun.name = 'gun'
    gun.parent = None
    pack = build_pack(arm)
    return scene, arm, gun, pack


def gun_geometry(gun):
    """Bore muzzle point, pistol grip and foregrip in the gun's mesh frame
    (+X barrel, +Z up), from its vertices."""
    co = np.array([v.co[:] for v in gun.data.vertices])
    x0, x1 = co[:, 0].min(), co[:, 0].max()
    length = x1 - x0
    tip = co[co[:, 0] > x1 - 0.02 * length]
    bore = np.array([x1, tip[:, 1].mean(), tip[:, 2].mean()])
    zmin = co[:, 2].min()
    low = co[co[:, 2] < bore[2] - 0.35 * (bore[2] - zmin)]
    rear = low[(low[:, 0] > x0 + 0.12 * length) & (low[:, 0] < x0 + 0.55 * length)]
    front = low[low[:, 0] > x0 + 0.62 * length]
    gx = np.percentile(rear[:, 0], 80) if len(rear) else x0 + 0.3 * length
    grip_pts = rear[rear[:, 0] > gx - 0.18 * length] if len(rear) else rear
    grip = np.array([grip_pts[:, 0].mean(), 0.0, bore[2] - 0.30 * (bore[2] - zmin)])
    fg = np.array([front[:, 0].mean(), 0.0, bore[2] - 0.45 * (bore[2] - zmin)]) if len(front) else \
        np.array([x0 + 0.8 * length, 0.0, bore[2] - 0.3])
    return {'x0': x0, 'x1': x1, 'length': length, 'bore': bore, 'grip': grip, 'foregrip': fg, 'zmin': zmin}


def place_gun(gun, geo, aim_deg, recoil=0.0):
    """The sim's shot line: bore through (0, MUZZLE_Y) along the aim, muzzle
    BARREL down it. `recoil` slides the drawn gun back along the bore (the
    game's presentation kick); the sim muzzle anchor stays where it is."""
    k = GUN_LENGTH / geo['length']
    th = math.radians(aim_deg)
    d = np.array([math.cos(th), 0.0, math.sin(th)])
    socket = np.array([0.0, GUN_DEPTH, SIM_MUZZLE_Y])
    muzzle = socket + SIM_BARREL * d
    drawn_muzzle = muzzle - recoil * d
    rot = np.array(Matrix.Rotation(-th, 3, 'Y'))          # +x -> the aim (rot about +Y by -aim)
    lin = rot @ np.diag([k, k * GUN_THICK, k * GUN_THICK])
    loc = drawn_muzzle - lin @ geo['bore']
    m = np.eye(4)
    m[:3, :3] = lin
    m[:3, 3] = loc
    gun.matrix_world = Matrix(m.tolist())

    def to_world(p):
        return loc + lin @ np.asarray(p, dtype=float)
    return {'k': k, 'aim': aim_deg, 'dir': d, 'rot': rot, 'muzzle': muzzle, 'drawn_muzzle': drawn_muzzle,
            'socket': socket, 'grip': to_world(geo['grip']), 'foregrip': to_world(geo['foregrip']),
            'stock': to_world([geo['x0'], 0, geo['bore'][2]])}


def solve_pose(arm, pose, gunw):
    """World-space bone frames -> armature-space frames for bl.apply_pose."""
    yaw = math.radians(90.0 - YAW_DEG)
    s = BODY_SCALE
    rest = bl.rest_frames(arm)
    px, py = pose['pelvis']
    base = np.array(Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(s, 4))
    if pose.get('air'):
        drop = -pose.get('pelvis_lift', 0.0)
    else:
        # drop the body until the farther foot target is within 97% of the
        # (shortened) leg, then the pose's extra crouch
        need = 0.0
        for side in ('L', 'R'):
            hip0 = (base @ rest['thigh.' + side])[:3, 3] + np.array([px, py, 0.0])
            knee0 = (base @ rest['shin.' + side])[:3, 3]
            ank0 = (base @ rest['foot.' + side])[:3, 3]
            L = (np.linalg.norm(knee0 - (base @ rest['thigh.' + side])[:3, 3]) +
                 np.linalg.norm(ank0 - knee0)) * LEG_LEN * 0.97
            fx, fy, fz, _ = pose['foot_' + side]
            tgt = np.array([fx, fy, ank0[2] + fz])
            dxy = np.linalg.norm((tgt - hip0)[:2])
            dz_max = math.sqrt(max(L * L - dxy * dxy, 0.0))
            need = max(need, (hip0[2] - tgt[2]) - dz_max)
        drop = need + pose['pelvis_drop']
    obj = np.array(Matrix.Translation((px, py, -drop))) @ base
    arm.matrix_world = Matrix(obj.tolist())
    W = {n: obj @ m for n, m in rest.items()}
    fwd = np.array([math.cos(math.radians(-YAW_DEG)), math.sin(math.radians(-YAW_DEG)), 0.0])
    right = np.array([fwd[1], -fwd[0], 0.0])        # the character's right (toward the camera)
    out = {}

    def fk(name, parent_world, local_rot=None, scale=None):
        p = arm.data.bones[name].parent.name
        rel = np.linalg.inv(W[p]) @ W[name]
        m = parent_world @ rel
        if local_rot is not None:
            m = m @ local_rot
        if scale is not None:
            m = m @ np.diag(list(scale) + [1.0])
        out[name] = m
        return m

    hips = W['hips'].copy()
    lean = np.array(Matrix.Rotation(math.radians(-pose['lean']), 4, Vector(right.tolist())))
    hips[:3, :3] = lean[:3, :3] @ hips[:3, :3]
    out['hips'] = hips
    spine = fk('spine', hips)
    tw = np.array(Matrix.Rotation(math.radians(pose['chest_twist']), 4, 'Y'))
    cl = np.array(Matrix.Rotation(math.radians(pose['chest_lean']), 4, 'X'))
    chest = fk('chest', spine, tw @ cl, CHEST_SCALE)
    neck = fk('neck', chest)
    hp = np.array(Matrix.Rotation(math.radians(pose['head_pitch']), 4, 'X'))
    ht = np.array(Matrix.Rotation(math.radians(pose['head_turn']), 4, 'Y'))
    fk('head', neck, ht @ hp, (HEAD_SCALE,) * 3)
    for side in ('L', 'R'):
        fk('shoulder.' + side, chest, None, (SHOULDER_SCALE,) * 3)

    warnings = []
    # ---- legs
    for side, sgn in (('L', -1.0), ('R', 1.0)):
        thigh_head = (hips @ np.linalg.inv(W['hips']) @ W['thigh.' + side])[:3, 3]
        fx, fy, fz, heel = pose['foot_' + side]
        ankle_rest = W['foot.' + side][:3, 3]
        ankle_z0 = (base @ rest['foot.' + side])[2, 3]
        ankle = np.array([fx, fy, ankle_z0 + fz])
        la = np.linalg.norm(W['shin.' + side][:3, 3] - W['thigh.' + side][:3, 3]) * LEG_LEN
        lb = np.linalg.norm(ankle_rest - W['shin.' + side][:3, 3]) * LEG_LEN
        pole = fwd + right * (sgn * pose['knee_out'])
        knee, end, err = two_bone_ik(thigh_head, ankle, la, lb, pole)
        if err > 1e-6:
            warnings.append('leg %s short by %.3f tiles' % (side, err))
        thick = (LEG_THICK, LEG_LEN, LEG_THICK)
        out['thigh.' + side] = bone_frame(thigh_head, knee - thigh_head, W['thigh.' + side], thick)
        out['shin.' + side] = bone_frame(knee, end - knee, W['shin.' + side], thick)
        f = W['foot.' + side].copy()
        if heel:
            pr = np.array(Matrix.Rotation(math.radians(-heel), 4, Vector(right.tolist())))
            f[:3, :3] = pr[:3, :3] @ f[:3, :3]
        f[:3, 3] = end
        out['foot.' + side] = f
        rel = np.linalg.inv(W['foot.' + side]) @ W['toe.' + side]
        out['toe.' + side] = f @ rel

    # ---- arms: wrist targets on the gun (offsets in the gun's frame)
    rot = gunw['rot']
    slid = [0.0]
    for side, target, pole in (
            ('R', gunw['grip'] + rot @ np.array([-0.035, 0.0, 0.085]), np.array([-0.4, -0.3, -0.6])),
            ('L', gunw['foregrip'] + rot @ np.array([-0.02, 0.0, 0.10]), np.array([0.0, 0.6, -0.8]))):
        sh_m = out['shoulder.' + side]
        ua_head = (sh_m @ np.linalg.inv(W['shoulder.' + side]) @ W['upper_arm.' + side])[:3, 3]
        la = np.linalg.norm(W['forearm.' + side][:3, 3] - W['upper_arm.' + side][:3, 3]) * ARM_LEN
        lb = np.linalg.norm(W['hand.' + side][:3, 3] - W['forearm.' + side][:3, 3]) * ARM_LEN
        if side == 'L':     # the support hand slides back along the handguard until it reaches
            back = rot @ np.array([0.02, 0.0, 0.0])
            while np.linalg.norm(target - ua_head) > 0.97 * (la + lb) and \
                    float((target - gunw['grip']) @ gunw['dir']) > 0.22:
                target = target - back
            slid[0] = round(float((gunw['foregrip'] - target) @ gunw['dir']), 3)
        elbow, wrist, err = two_bone_ik(ua_head, target, la, lb, pole)
        if err > 1e-6:
            warnings.append('arm %s short by %.3f tiles' % (side, err))
        thick = (LIMB_THICK, ARM_LEN, LIMB_THICK)
        out['upper_arm.' + side] = bone_frame(ua_head, elbow - ua_head, W['upper_arm.' + side], thick)
        out['forearm.' + side] = bone_frame(elbow, wrist - elbow, W['forearm.' + side], thick)
        grip_dir = rot @ (unit(np.array([0.55, 0.0, -0.83])) if side == 'R' else unit(np.array([0.35, 0.0, -0.94])))
        out['hand.' + side] = bone_frame(wrist, grip_dir, W['hand.' + side], (HAND_SCALE,) * 3)
        for b in arm.data.bones:                    # parents precede children
            if not b.name.endswith('.' + side):
                continue
            bn = b.name.split('.')[0]
            if bn.startswith(('palm', 'f_', 'thumb')):
                p = b.parent.name
                rel = np.linalg.inv(W[p]) @ W[b.name]
                curl = 0.0 if bn.startswith('palm') else (35.0 if bn.startswith('thumb') else 62.0)
                out[b.name] = out[p] @ rel @ rot_axis((1, 0, 0), curl)
    inv = np.linalg.inv(obj)
    info = {'pelvis_drop': round(float(drop), 4), 'support_hand_slid': slid[0], 'warnings': warnings}
    return {n: inv @ m for n, m in out.items()}, obj, info


def reach_search(arm, pose, gunw):
    """A fixed, ordered search (as v2's pose solver): twist the chest further
    toward the gun (negative twist about the spine turns the far shoulder
    forward and the chest plate toward the camera), then lower an airborne pelvis / drop a standing one, until both
    hands reach the gun. A hand that still cannot reach is a build error —
    never a gun floating beside a hand."""
    tried = []
    for extra_twist in (0, -6, -12, -18, -24, -30):
        drops = (0.0, 0.04, 0.08, 0.12, 0.16, 0.20, 0.24, 0.28) if pose.get('air') else (0.0, 0.03, 0.06, 0.09, 0.12)
        for extra_drop in drops:
            p = dict(pose)
            p['chest_twist'] = pose['chest_twist'] + extra_twist
            if pose.get('air'):
                p['pelvis_lift'] = pose.get('pelvis_lift', 0.0) - extra_drop
            else:
                p['pelvis_drop'] = pose['pelvis_drop'] + extra_drop
            frames, obj, info = solve_pose(arm, p, gunw)
            tried.append((extra_twist, extra_drop, info['warnings']))
            if not any(w.startswith('arm') for w in info['warnings']):
                info['search'] = {'extraTwist': extra_twist, 'extraDrop': extra_drop, 'tries': len(tried)}
                return frames, obj, info
    raise SystemExit('pose %s: a hand cannot reach the gun: %s' % (pose, tried[-1]))


def make_emission(name, color_socket_builder):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    color_socket_builder(nt, em.inputs['Color'])
    return mat


def build_materials():
    alb_img = bpy.data.images.load(ALBEDO)
    emi_img = bpy.data.images.load(EMISSION)
    for img in (alb_img, emi_img):
        try:                    # raw texture bytes in, raw bytes out
            img.colorspace_settings.name = 'Non-Color'
        except TypeError:
            pass

    def tex(img):
        def b(nt, sock):
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = img
            t.interpolation = 'Closest'
            nt.links.new(t.outputs['Color'], sock)
        return b

    def const(rgb):
        def b(nt, sock):
            sock.default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        return b

    def normal(nt, sock):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        mul = nt.nodes.new('ShaderNodeVectorMath')
        mul.operation = 'MULTIPLY_ADD'
        mul.inputs[1].default_value = (0.5, 0.5, 0.5)
        mul.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], mul.inputs[0])
        nt.links.new(mul.outputs['Vector'], sock)

    def ao(nt, sock):
        a = nt.nodes.new('ShaderNodeAmbientOcclusion')
        a.samples = 16
        a.inputs['Distance'].default_value = 0.12
        nt.links.new(a.outputs['AO'], sock)

    def objid(nt, sock):
        oi = nt.nodes.new('ShaderNodeObjectInfo')
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = 'DIVIDE'
        m.inputs[1].default_value = 16.0
        nt.links.new(oi.outputs['Object Index'], m.inputs[0])
        nt.links.new(m.outputs['Value'], sock)

    def region(nt, sock):
        at = nt.nodes.new('ShaderNodeAttribute')
        at.attribute_name = 'region'
        nt.links.new(at.outputs['Color'], sock)

    def depth(nt, sock):
        cd = nt.nodes.new('ShaderNodeCameraData')
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 28.0
        mr.inputs['From Max'].default_value = 32.0
        nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], sock)

    return {
        'albedo_tex': make_emission('albedo_tex', tex(alb_img)),
        'emit_tex': make_emission('emit_tex', tex(emi_img)),
        'black': make_emission('black', const((0, 0, 0))),
        'gun_slots': {k: make_emission('gun_' + k, const(v)) for k, v in GUN_SLOTS.items()},
        'normal': make_emission('normal', normal),
        'ao': make_emission('ao', ao),
        'id': make_emission('id', objid),
        'depth': make_emission('depth', depth),
        'region': make_emission('region', region),
    }


def assign(ob, mats):
    for i, slot in enumerate(ob.material_slots):
        slot.link = 'OBJECT'
        slot.material = mats[i] if isinstance(mats, list) else mats


def setup_cycles(scene, w, h):
    r = scene.render
    r.engine = 'CYCLES'
    c = scene.cycles
    c.device = 'CPU'
    c.samples = 1
    c.use_adaptive_sampling = False
    c.use_denoising = False
    c.pixel_filter_type = 'BOX'
    c.filter_width = 0.01
    c.seed = 7
    c.max_bounces = 0
    r.resolution_x, r.resolution_y, r.resolution_percentage = int(w), int(h), 100
    r.film_transparent = True
    r.dither_intensity = 0.0
    r.use_compositing = False
    r.use_sequencer = False
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '16'
    r.image_settings.compression = 15
    try:
        scene.view_settings.view_transform = 'Raw'
    except TypeError:
        pass
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    scene.world = world


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--ppt', type=float, required=True, help='output px per tile')
    ap.add_argument('--ss', type=int, default=8)
    ap.add_argument('--frames', default=','.join(POSES))
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    scene, arm, gun, pack = load_scene()
    geo = gun_geometry(gun)
    body = [bpy.data.objects[n] for n in ('Body', 'Head1', 'HandSimple')]
    for ob in body:
        ob.pass_index = OBJ_IDS[ob.name]
    gun.pass_index = OBJ_IDS['gun']
    pack.pass_index = OBJ_IDS['pack']
    gun_slot_names = [s.material.name for s in gun.material_slots]
    mats = build_materials()

    ppt, ss = args.ppt, args.ss
    cw = int(math.ceil((CELL_LEFT + CELL_RIGHT) * ppt))
    ch = int(math.ceil((CELL_BELOW + CELL_ABOVE) * ppt))
    ox, oy = round(CELL_LEFT * ppt), round(CELL_ABOVE * ppt)
    cam = bl.make_camera(scene)
    bl.frame_camera(cam, cw, ch, (ox, oy), ppt)
    setup_cycles(scene, cw * ss, ch * ss)
    meta = {'ppt': ppt, 'ss': ss, 'cell': [cw, ch], 'origin': [ox, oy],
            'sim': {'muzzleY': SIM_MUZZLE_Y, 'barrelTiles': SIM_BARREL},
            'exaggeration': {'body': BODY_SCALE, 'head': HEAD_SCALE, 'hand': HAND_SCALE, 'limb': LIMB_THICK,
                             'armLen': ARM_LEN, 'leg': LEG_THICK,
                             'legLen': LEG_LEN, 'gunLength': GUN_LENGTH, 'gunThick': GUN_THICK},
            'gun_slots': gun_slot_names, 'frames': {}}
    allobs = body + [gun, pack]
    passes = {
        'albedo': lambda: ([assign(ob, mats['albedo_tex']) for ob in body],
                           assign(gun, [mats['gun_slots'].get(n.split('.')[0], mats['black'])
                                        for n in gun_slot_names]),
                           assign(pack, mats['black'])),
        'emit': lambda: ([assign(ob, mats['emit_tex']) for ob in body], assign(gun, mats['black']),
                         assign(pack, mats['black'])),
        'normal': lambda: [assign(ob, mats['normal']) for ob in allobs],
        'ao': lambda: [assign(ob, mats['ao']) for ob in allobs],
        'id': lambda: [assign(ob, mats['id']) for ob in allobs],
        'depth': lambda: [assign(ob, mats['depth']) for ob in allobs],
        'region': lambda: ([assign(ob, mats['region']) for ob in body], assign(gun, mats['black']),
                           assign(pack, mats['black'])),
    }
    for fname in args.frames.split(','):
        pose = POSES[fname]
        gunw = place_gun(gun, geo, pose['aim'], pose.get('recoil', 0.0))
        frames, obj, info = reach_search(arm, pose, gunw)
        bl.apply_pose(arm, frames)
        bpy.context.view_layer.update()
        timing = {}
        for pname, setup in passes.items():
            setup()
            t1 = time.time()
            scene.render.filepath = os.path.join(args.out, '%s-%s.png' % (fname, pname))
            bpy.ops.render.render(write_still=True)
            timing[pname] = round(time.time() - t1, 2)

        def to_px(p):
            return [round(c / ss, 4) for c in bl.project_px(scene, cam, list(p), cw * ss, ch * ss)]
        hand_r = np.array(arm.matrix_world @ arm.pose.bones['hand.R'].head)
        hand_l = np.array(arm.matrix_world @ arm.pose.bones['hand.L'].head)
        meta['frames'][fname] = {
            'aim': pose['aim'], 'muzzle': to_px(gunw['muzzle']), 'drawnMuzzle': to_px(gunw['drawn_muzzle']),
            'socket': to_px(gunw['socket']), 'grip': to_px(gunw['grip']), 'foregrip': to_px(gunw['foregrip']),
            'handR': to_px(hand_r), 'handL': to_px(hand_l), 'origin': to_px((0, 0, 0)),
            'pose': info, 'render_s': timing}
        print(fname, json.dumps(info), timing)
    meta['total_s'] = round(time.time() - t0, 1)
    with open(os.path.join(args.out, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
    print('done', meta['total_s'], 's')


if __name__ == '__main__':
    main()
