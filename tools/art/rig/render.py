"""RIG v3 render (headless Blender): the CC0 soldier from the T-109 A2 spike
(B/D, the operator's pick, decisions entry 27) posed for every frame in
tools/art/rig/poses.py with each of the five CC0 guns in tools/art/rig/guns.py,
rendered to DATA passes on one supersampled grid that tools/art/rig/post.py
reduces to every shipped density.

    /opt/hb-art/bin/python -I tools/art/rig/render.py --out <dir> [--guns R,S] [--poses stand-right,...]
                                                       [--falsify S]

Ported from tools/art/spike/v3_render.py (same base mesh, exaggeration, gun
placement, analytic IK and reach search); what changed:
  * the frame inventory and pose library live in poses.py (every state the
    game draws x every aim the sim can produce there);
  * five guns, each scaled so its grip sits on the sim's hand socket
    (guns.py), with an identity part;
  * three packed passes instead of seven -- `id` (object, body region,
    material zone), `nrm` (smooth normal), `aod` (ambient occlusion, depth) --
    rendered ONCE per frame at HI_PPT px/tile (8 x 35.1 = 12 x 23.4) and
    binned to each density by post.py, instead of one render per density;
  * anchors are exported in TILES from the evaluated scene (the loader and
    the check turn them into pixels per density).

The SIM fixes the gun: the bore passes through the hand socket (0, muzzleY)
along the aim and the muzzle sits barrelTiles down it (src/sim/player.js
spawns the shot there); the body is solved around the gun. A gun hand that
cannot reach its grip is a build error. The support (far) hand takes the
fore-end; it may let go only where poses.py says it may (a ladder rung, or
an aim pointing down away from the far shoulder), and the JSON records it.

--falsify <gun>: that gun's MESH is moved FALSIFY_TILES (0.15) back along the bore
while every exported anchor stays where the sim puts it (the negative
control); tools/art/rig/check.py must then fail on exactly that gun.

Determinism: Cycles CPU, 1 sample per pixel at the pixel centre (box filter
0.01), fixed seed, no bounces, AO 16 samples; fixed frame order. Two clean
builds on this host give identical passes (tools/art/build_rig_v3.py proves
it on the final PNGs).
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
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import bl  # noqa: E402
import guns as G  # noqa: E402
import poses as P  # noqa: E402
from kin import two_bone_ik, unit  # noqa: E402

CC0 = os.environ.get('HB_ART_CC0') or os.path.join(ART, 'build', 'cc0')
SOLDIER = os.path.join(CC0, 'irondust-scifi-soldiers', 'files')
GUN_DIR = os.path.join(CC0, G.GUN_PACK, 'files')

# ---- exaggeration for a 32-70 px read (the spike's B/D values, unchanged)
YAW_DEG = 16.0            # body turned toward the camera (a 3/4 profile)
BODY_SCALE = 0.93
HEAD_SCALE = 1.50
HAND_SCALE = 1.35
LIMB_THICK = 1.28
ARM_LEN = 1.10
LEG_THICK = 1.34
LEG_LEN = 0.95
CHEST_SCALE = (1.16, 1.0, 1.12)
SHOULDER_SCALE = 1.30
GUN_DEPTH = -0.10         # the gun plane, toward the camera from the body's mid plane
RECOIL_TILES = 0.095      # src/pure/rig.js RIG_RECOIL_TILES (presentation only)
FALSIFY_TILES = 0.15     # 2.4 px at d16: beyond the 1 px tolerance plus a diagonal barrel's 0.71 px quantization

# ---- the supersampled grid every density is binned from (post.py)
HI_PPT = 280.8            # = 8 x 35.1 = 12 x 23.4 px/tile
# The cell around the sim point, in hi-res samples. Multiples of 24 (= lcm of
# 8 and 12), so the d35 and d23 pixel grids fall exactly on sample edges.
HI_OX, HI_OY = 336, 744   # sim point: 1.197 tiles from the left edge, 2.650 from the top
HI_W, HI_H = 744, 840     # 1.197 + 1.453 tiles wide, 2.650 + 0.342 tiles tall (crouch magazines dip below the deck)
CELL_TILES = dict(left=HI_OX / HI_PPT, right=(HI_W - HI_OX) / HI_PPT,
                  above=HI_OY / HI_PPT, below=(HI_H - HI_OY) / HI_PPT)

OBJ_IDS = {'Body': 1, 'Head1': 2, 'HandSimple': 3, 'gun': 4, 'pack': 5}
REGIONS = {'torso': 1, 'head': 2, 'arm_R': 3, 'arm_L': 4, 'hand': 5, 'leg_R': 6, 'leg_L': 7, 'foot': 8,
           'shoulder_R': 9, 'shoulder_L': 10, 'shin_R': 11, 'shin_L': 12, 'forearm_R': 13, 'forearm_L': 14}
ZONE_SUIT, ZONE_PLATE, ZONE_GLOW, ZONE_PACK = 0, 1, 2, 12


def region_of(bone):
    b = bone.split('.')[0]
    side = bone.rsplit('.', 1)[-1] if '.' in bone else ''
    if b == 'head':
        return 'head'
    if b in ('hips', 'spine', 'chest', 'neck'):
        return 'torso'
    if b == 'shoulder':
        return 'shoulder_' + side
    if b == 'upper_arm':
        return 'arm_' + side
    if b == 'forearm':
        return 'forearm_' + side
    if b in ('hand', 'palm', 'thumb') or b.startswith('f_'):
        return 'hand'
    if b == 'thigh':
        return 'leg_' + side
    if b == 'shin':
        return 'shin_' + side
    if b in ('foot', 'toe', 'heel'):
        return 'foot'
    return 'torso'


def paint_regions(ob, fixed=None):
    """Body region per vertex (its strongest bone weight) as a colour
    attribute: post.py gives each region its own value zone."""
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


def zone_image():
    """The base mesh's own texture zones, classified once per texel (the
    spike's rule, unchanged): blue plates / orange emblems -> armour plate,
    lit emission -> glow, the rest -> undersuit. Its colours are discarded."""
    alb = np.asarray(Image.open(os.path.join(SOLDIER, 'FederalSoldierSkin_Albedo.tga')).convert('RGB'),
                     dtype=np.float64) / 255.0
    emi = np.asarray(Image.open(os.path.join(SOLDIER, 'FederalSoldierSkin_Emission.png')).convert('RGB'),
                     dtype=np.float64) / 255.0
    r, g, b = alb[..., 0], alb[..., 1], alb[..., 2]
    mx, mn = alb.max(-1), alb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = ((b - r)[gg] / d[gg]) + 2
    h[bb] = ((r - g)[bb] / d[bb]) + 4
    h *= 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    v = mx
    plate = ((h > 140) & (h < 235) & (v > 0.22) & ((s > 0.35) | (v > 0.40))) | ((h < 50) & (s > 0.55) & (v > 0.55))
    zone = np.full(mx.shape, ZONE_SUIT, dtype=np.float64)
    zone[plate] = ZONE_PLATE
    zone[emi.max(-1) > 0.25] = ZONE_GLOW
    H, W = zone.shape
    img = bpy.data.images.new('zones', W, H, alpha=True, float_buffer=True)
    try:
        img.colorspace_settings.name = 'Non-Color'
    except TypeError:
        pass
    px = np.zeros((H, W, 4), dtype=np.float32)
    px[..., 0] = (zone / 16.0)[::-1]          # Blender images are stored bottom row first
    px[..., 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def build_pack(arm):
    """The spike's salvage pack (the boards' RIG wears one): two bevelled
    boxes on the chest bone -- the only geometry not from the CC0 sources."""
    import bmesh
    me = bpy.data.meshes.new('pack')
    bm = bmesh.new()
    for (cx, cy, cz), (sx, sy, sz) in (((0.0, 0.17, 1.38), (0.38, 0.22, 0.44)),
                                       ((0.0, 0.27, 1.30), (0.28, 0.10, 0.24))):
        rr = bmesh.ops.create_cube(bm, size=1.0)
        for v in rr['verts']:
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


def load_gun(letter):
    """Import one CC0 gun; give each face a class material slot (dark / mid /
    light / accent / rust) from its FBX slot name and the accent boxes."""
    spec = G.GUNS[letter]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(GUN_DIR, spec['fbx']))
    new = [o for o in bpy.data.objects if o not in before]
    gun = [o for o in new if o.type == 'MESH'][0]
    for o in new:
        if o is not gun:
            bpy.data.objects.remove(o, do_unlink=True)
    gun.parent = None
    gun.matrix_world = Matrix.Identity(4)
    gun.name = 'gun_' + letter
    me = gun.data
    slot_names = [s.material.name.split('.')[0] if s.material else '' for s in gun.material_slots]
    classes = ['dark', 'mid', 'light', 'accent', 'rust']
    box_cls = 'rust' if spec['accent'] == 'rust' else 'accent'
    co = np.array([v.co[:] for v in me.vertices])
    face_cls = []
    for poly in me.polygons:
        cls = spec['slots'].get(slot_names[poly.material_index], 'mid')
        c = co[list(poly.vertices)].mean(0)
        for (x0, x1, z0, z1) in spec['accent_boxes']:
            if x0 <= c[0] <= x1 and z0 <= c[2] <= z1:
                cls = box_cls
        face_cls.append(classes.index(cls))
    me.materials.clear()
    for c in classes:
        me.materials.append(bpy.data.materials.new('%s_%s' % (gun.name, c)))
    for poly, ci in zip(me.polygons, face_cls):
        poly.material_index = ci
    for p in me.polygons:
        p.use_smooth = False
    tip = co[co[:, 0] > co[:, 0].max() - 0.02 * (co[:, 0].max() - co[:, 0].min())]
    bore_z = float(tip[:, 2].mean())
    if spec.get('boost'):          # thicken sub-pixel barrels about the bore line
        for v in me.vertices:
            k = G.boost_factor(v.co.x, spec['boost'])
            if k != 1.0:
                v.co.y *= k
                v.co.z = bore_z + (v.co.z - bore_z) * k
        me.update()
        co = np.array([v.co[:] for v in me.vertices])
        tip = co[co[:, 0] > co[:, 0].max() - 0.02 * (co[:, 0].max() - co[:, 0].min())]
    geo = {'x0': float(co[:, 0].min()), 'x1': float(co[:, 0].max()),
           'bore': np.array([co[:, 0].max(), tip[:, 1].mean(), tip[:, 2].mean()]),
           'grip': np.array([spec['grip'][0], 0.0, spec['grip'][1]]),
           'support': np.array([spec['support'][0], 0.0, spec['support'][1]]),
           'classes': classes, 'faceClassCounts': {c: int(sum(1 for f in face_cls if f == i))
                                                   for i, c in enumerate(classes)}}
    geo['k'] = G.gun_scale(geo['bore'][0], geo['grip'][0], P.SIM_BARREL, spec['grip_at'])
    return gun, geo


def load_scene(letters):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    scene = bpy.context.scene
    with bpy.data.libraries.load(os.path.join(SOLDIER, 'Mesh.blend'), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ('metarig', 'Body', 'Head1', 'HandSimple')]
    for ob in list(bpy.data.objects):
        scene.collection.objects.link(ob)
    arm = bpy.data.objects['metarig']
    paint_regions(bpy.data.objects['Body'])
    paint_regions(bpy.data.objects['Head1'], 'head')
    paint_regions(bpy.data.objects['HandSimple'], 'hand')
    gun_objs = {}
    for L in letters:
        gun_objs[L] = load_gun(L)
    pack = build_pack(arm)
    return scene, arm, gun_objs, pack


# ------------------------------------------------------------------ posing
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
    r_rest = rest_world[:3, :3]
    s_rest = np.linalg.norm(r_rest, axis=0)
    r_rest = r_rest / s_rest
    r_new = minimal_rotation(r_rest[:, 1], y_dir) @ r_rest
    m = np.eye(4)
    m[:3, :3] = r_new * (s_rest * np.asarray(scale))
    m[:3, 3] = head
    return m


def place_gun(gun, geo, spec, aim_deg, socket_y, recoil=0.0, falsify=0.0):
    """The sim's shot line: bore through (0, socket_y) along the aim, muzzle
    SIM_BARREL down it. `recoil` slides the drawn gun back along the bore (the
    game's presentation kick); `falsify` slides the MESH alone (the anchor
    check's negative control). The sim muzzle never moves."""
    k = geo['k']
    th = math.radians(aim_deg)
    d = np.array([math.cos(th), 0.0, math.sin(th)])
    socket = np.array([0.0, GUN_DEPTH, socket_y])
    muzzle = socket + P.SIM_BARREL * d
    drawn_muzzle = muzzle - recoil * d
    rot = np.array(Matrix.Rotation(-th, 3, 'Y'))
    lin = rot @ np.diag([k, k * spec['thick'], k * spec['thick']])
    loc = drawn_muzzle - lin @ geo['bore']
    m = np.eye(4)
    m[:3, :3] = lin
    m[:3, 3] = loc - falsify * d
    gun.matrix_world = Matrix(m.tolist())

    def to_world(p):
        return loc + lin @ np.asarray(p, dtype=float)
    return {'k': k, 'aim': aim_deg, 'dir': d, 'rot': rot, 'muzzle': muzzle, 'drawn_muzzle': drawn_muzzle,
            'socket': socket, 'grip': to_world(geo['grip']), 'support': to_world(geo['support']),
            'stock': to_world([geo['x0'], 0, geo['bore'][2]])}


def solve_pose(arm, spec, gunw, support_mode):
    """World-space bone frames -> armature-space frames for bl.apply_pose.
    support_mode: 'gun' (far hand on the fore-end), 'rung' (spec['free_L']),
    'rest' (far hand off the gun, relaxed at the hip)."""
    yaw = math.radians(90.0 - YAW_DEG)
    s = BODY_SCALE
    rest = bl.rest_frames(arm)
    px, py = spec.get('pelvis', (0.0, 0.0))
    base = np.array(Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(s, 4))
    if spec.get('air'):
        drop = -spec.get('lift', 0.0)
    else:
        need = 0.0
        for side in ('L', 'R'):
            hip0 = (base @ rest['thigh.' + side])[:3, 3] + np.array([px, py, 0.0])
            knee0 = (base @ rest['shin.' + side])[:3, 3]
            ank0 = (base @ rest['foot.' + side])[:3, 3]
            Ll = (np.linalg.norm(knee0 - (base @ rest['thigh.' + side])[:3, 3]) +
                  np.linalg.norm(ank0 - knee0)) * LEG_LEN * 0.97
            fx, fy, fz, _ = spec['foot_' + side]
            tgt = np.array([fx, fy, ank0[2] + fz])
            dxy = np.linalg.norm((tgt - hip0)[:2])
            dz_max = math.sqrt(max(Ll * Ll - dxy * dxy, 0.0))
            need = max(need, (hip0[2] - tgt[2]) - dz_max)
        drop = need + spec.get('drop', 0.0)
    obj = np.array(Matrix.Translation((px, py, -drop))) @ base
    arm.matrix_world = Matrix(obj.tolist())
    W = {n: obj @ m for n, m in rest.items()}
    fwd = np.array([math.cos(math.radians(-YAW_DEG)), math.sin(math.radians(-YAW_DEG)), 0.0])
    right = np.array([fwd[1], -fwd[0], 0.0])
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
    lean = np.array(Matrix.Rotation(math.radians(-spec.get('lean', 0.0)), 4, Vector(right.tolist())))
    hips[:3, :3] = lean[:3, :3] @ hips[:3, :3]
    out['hips'] = hips
    spine = fk('spine', hips)
    tw = np.array(Matrix.Rotation(math.radians(spec.get('chest_twist', 0.0)), 4, 'Y'))
    cl = np.array(Matrix.Rotation(math.radians(spec.get('chest_lean', 0.0)), 4, 'X'))
    chest = fk('chest', spine, tw @ cl, CHEST_SCALE)
    neck = fk('neck', chest)
    hp = np.array(Matrix.Rotation(math.radians(spec.get('head_pitch', 0.0)), 4, 'X'))
    ht = np.array(Matrix.Rotation(math.radians(spec.get('head_turn', 0.0)), 4, 'Y'))
    fk('head', neck, ht @ hp, (HEAD_SCALE,) * 3)
    for side in ('L', 'R'):
        fk('shoulder.' + side, chest, None, (SHOULDER_SCALE,) * 3)

    warnings = []
    for side, sgn in (('L', -1.0), ('R', 1.0)):
        thigh_head = (hips @ np.linalg.inv(W['hips']) @ W['thigh.' + side])[:3, 3]
        fx, fy, fz, heel = spec['foot_' + side]
        ankle_rest = W['foot.' + side][:3, 3]
        ankle_z0 = (base @ rest['foot.' + side])[2, 3]
        ankle = np.array([fx, fy, ankle_z0 + fz])
        la = np.linalg.norm(W['shin.' + side][:3, 3] - W['thigh.' + side][:3, 3]) * LEG_LEN
        lb = np.linalg.norm(ankle_rest - W['shin.' + side][:3, 3]) * LEG_LEN
        pole = fwd + right * (sgn * spec.get('knee_out', 0.0))
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

    rot = gunw['rot']
    slid = [0.0]
    targets = [('R', gunw['grip'] + rot @ np.array([-0.035, 0.0, 0.085]), np.array([-0.4, -0.3, -0.6]))]
    if support_mode == 'gun':
        targets.append(('L', gunw['support'] + rot @ np.array([-0.02, 0.0, 0.10]), np.array([0.0, 0.6, -0.8])))
    elif support_mode == 'rung':
        # the rung is wherever the climbing hand is: it moves with the body
        fx, fy, fz = spec['free_L']
        targets.append(('L', np.array([fx + px, fy, fz - drop]), np.array([-0.5, 0.4, -0.6])))
    else:   # rest: the far hand relaxed by the hip, elbow back
        sh = out['shoulder.L']
        ua = (sh @ np.linalg.inv(W['shoulder.L']) @ W['upper_arm.L'])[:3, 3]
        targets.append(('L', ua + np.array([0.10, 0.06, -0.50]), np.array([-0.6, 0.3, -0.2])))
    hands = {}
    for side, target, pole in targets:
        sh_m = out['shoulder.' + side]
        ua_head = (sh_m @ np.linalg.inv(W['shoulder.' + side]) @ W['upper_arm.' + side])[:3, 3]
        la = np.linalg.norm(W['forearm.' + side][:3, 3] - W['upper_arm.' + side][:3, 3]) * ARM_LEN
        lb = np.linalg.norm(W['hand.' + side][:3, 3] - W['forearm.' + side][:3, 3]) * ARM_LEN
        if side == 'L' and support_mode == 'gun':
            # the support hand slides back along the fore-end until it reaches
            back = rot @ np.array([0.02, 0.0, 0.0])
            while np.linalg.norm(target - ua_head) > 0.97 * (la + lb) and \
                    float((target - gunw['grip']) @ gunw['dir']) > 0.22:
                target = target - back
            slid[0] = round(float((gunw['support'] - target) @ gunw['dir']), 3)
        elbow, wrist, err = two_bone_ik(ua_head, target, la, lb, pole)
        if err > 1e-6:
            warnings.append('arm %s short by %.3f tiles' % (side, err))
        thick = (LIMB_THICK, ARM_LEN, LIMB_THICK)
        out['upper_arm.' + side] = bone_frame(ua_head, elbow - ua_head, W['upper_arm.' + side], thick)
        out['forearm.' + side] = bone_frame(elbow, wrist - elbow, W['forearm.' + side], thick)
        if side == 'R' or support_mode == 'gun':
            grip_dir = rot @ (unit(np.array([0.55, 0.0, -0.83])) if side == 'R' else unit(np.array([0.35, 0.0, -0.94])))
            curl_on = True
        elif support_mode == 'rung':
            grip_dir = unit(np.array([0.25, 0.0, 1.0]))
            curl_on = True
        else:
            grip_dir = unit(wrist - elbow)
            curl_on = False
        out['hand.' + side] = bone_frame(wrist, grip_dir, W['hand.' + side], (HAND_SCALE,) * 3)
        hands[side] = wrist
        for b in arm.data.bones:
            if not b.name.endswith('.' + side):
                continue
            bn = b.name.split('.')[0]
            if bn.startswith(('palm', 'f_', 'thumb')):
                p = b.parent.name
                rel = np.linalg.inv(W[p]) @ W[b.name]
                curl = 0.0 if (bn.startswith('palm') or not curl_on) else (35.0 if bn.startswith('thumb') else 62.0)
                out[b.name] = out[p] @ rel @ rot_axis((1, 0, 0), curl)
    inv = np.linalg.inv(obj)
    info = {'drop': round(float(drop), 4), 'supportSlid': slid[0], 'support': support_mode, 'warnings': warnings}
    return {n: inv @ m for n, m in out.items()}, obj, info


SUPPORT_MAY_REST = ('down', 'down-right')


def reach_search(arm, spec, gunw, state, aim):
    """A fixed, ordered search: twist the chest further toward the gun, then
    drop a standing pelvis / lower an airborne one, until both hands reach.
    The gun hand must always reach (else a build error). The support hand
    takes the fore-end everywhere it can; it may rest only on a down aim, and
    on the ladder it climbs (`free_L`)."""
    modes = ['rung'] if 'free_L' in spec else (['gun', 'rest'] if aim in SUPPORT_MAY_REST else ['gun'])
    tried = []
    for mode in modes:
        for extra_dx in (0.0, 0.04, 0.08, 0.12, 0.16, 0.20):
            for extra_twist in (0, -6, -12, -18, -24, -30):
                drops = (0.0, 0.04, 0.08, 0.12, 0.16, 0.20, 0.24, 0.28) if spec.get('air') else \
                    (0.0, 0.03, 0.06, 0.09, 0.12)
                for extra_drop in drops:
                    p = dict(spec)
                    px, py = spec.get('pelvis', (0.0, 0.0))
                    p['pelvis'] = (px + extra_dx, py)
                    p['chest_twist'] = spec.get('chest_twist', 0.0) + extra_twist
                    if spec.get('air'):
                        p['lift'] = spec.get('lift', 0.0) - extra_drop
                    else:
                        p['drop'] = spec.get('drop', 0.0) + extra_drop
                    frames, obj, info = solve_pose(arm, p, gunw, mode)
                    tried.append((mode, extra_dx, extra_twist, extra_drop, info['warnings']))
                    if not any(w.startswith('arm') for w in info['warnings']):
                        info['search'] = {'extraDx': extra_dx, 'extraTwist': extra_twist, 'extraDrop': extra_drop,
                                          'tries': len(tried)}
                        return frames, obj, info
    raise Unreachable('%s/%s: a hand cannot reach its target: %s' % (state, aim, tried[-1]))


class Unreachable(Exception):
    pass


# ------------------------------------------------------------- materials
def make_emission(name, builder):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    builder(nt, em.inputs['Color'])
    return mat


def build_materials(zones):
    def combine(nt, sock, r, g, b):
        c = nt.nodes.new('ShaderNodeCombineXYZ')
        for i, src in enumerate((r, g, b)):
            if isinstance(src, float):
                c.inputs[i].default_value = src
            else:
                nt.links.new(src, c.inputs[i])
        nt.links.new(c.outputs['Vector'], sock)

    def objid(nt):
        oi = nt.nodes.new('ShaderNodeObjectInfo')
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = 'DIVIDE'
        m.inputs[1].default_value = 16.0
        nt.links.new(oi.outputs['Object Index'], m.inputs[0])
        return m.outputs['Value']

    def region(nt):
        at = nt.nodes.new('ShaderNodeAttribute')
        at.attribute_name = 'region'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(at.outputs['Color'], sep.inputs['Color'])
        return sep.outputs[0]

    def zone_tex(nt):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = zones
        t.interpolation = 'Closest'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        return sep.outputs[0]

    def id_body(nt, sock):
        combine(nt, sock, objid(nt), region(nt), zone_tex(nt))

    def id_const(zone):
        def b(nt, sock):
            combine(nt, sock, objid(nt), 0.0, zone / 16.0)
        return b

    def normal(nt, sock):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        mul = nt.nodes.new('ShaderNodeVectorMath')
        mul.operation = 'MULTIPLY_ADD'
        mul.inputs[1].default_value = (0.5, 0.5, 0.5)
        mul.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(g.outputs['Normal'], mul.inputs[0])
        nt.links.new(mul.outputs['Vector'], sock)

    def aod(nt, sock):
        a = nt.nodes.new('ShaderNodeAmbientOcclusion')
        a.samples = 16
        a.inputs['Distance'].default_value = 0.12
        cd = nt.nodes.new('ShaderNodeCameraData')
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 28.0
        mr.inputs['From Max'].default_value = 32.0
        nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value'])
        combine(nt, sock, a.outputs['AO'], mr.outputs['Result'], 0.0)

    mats = {'id_body': make_emission('id_body', id_body), 'nrm': make_emission('nrm', normal),
            'aod': make_emission('aod', aod), 'id_pack': make_emission('id_pack', id_const(ZONE_PACK))}
    for cls, zone in G.GUN_ZONE.items():
        mats['id_gun_' + cls] = make_emission('id_gun_' + cls, id_const(zone))
    return mats


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
    r.use_persistent_data = os.environ.get('HB_ART_PERSIST', '1') == '1'   # keep the BVH between the 3 passes
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


def tiles(p):
    """World point -> (x, y) tiles from the sim point, y up (the camera looks +Y)."""
    return [round(float(p[0]), 5), round(float(p[2]), 5)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--guns', default=','.join(P.GUNS))
    ap.add_argument('--poses', default='')
    ap.add_argument('--falsify', default='')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    letters = args.guns.split(',')
    scene, arm, gun_objs, pack = load_scene(letters)
    body = [bpy.data.objects[n] for n in ('Body', 'Head1', 'HandSimple')]
    for ob in body:
        ob.pass_index = OBJ_IDS[ob.name]
    pack.pass_index = OBJ_IDS['pack']
    for g, _ in gun_objs.values():
        g.pass_index = OBJ_IDS['gun']
    zones = zone_image()
    mats = build_materials(zones)
    cam = bl.make_camera(scene)
    bl.frame_camera(cam, HI_W, HI_H, (HI_OX, HI_OY), HI_PPT)
    setup_cycles(scene, HI_W, HI_H)
    specs = P.frame_specs()
    if args.poses:
        want = set(args.poses.split(','))
        specs = [s for s in specs if s[0] in want]
    meta = {'hiPpt': HI_PPT, 'hiCell': [HI_W, HI_H], 'hiOrigin': [HI_OX, HI_OY], 'cellTiles': CELL_TILES,
            'sim': {'muzzleY': P.SIM_MUZZLE_Y, 'barrelTiles': P.SIM_BARREL, 'crouchMuzzleY': P.CROUCH_MUZZLE_Y},
            'exaggeration': {'body': BODY_SCALE, 'head': HEAD_SCALE, 'hand': HAND_SCALE, 'limb': LIMB_THICK,
                             'armLen': ARM_LEN, 'leg': LEG_THICK, 'legLen': LEG_LEN, 'yawDeg': YAW_DEG},
            'falsify': args.falsify or None, 'guns': {}, 'frames': {}}
    errors = []
    tag = '-'.join(letters) + ('-falsify-' + args.falsify if args.falsify else '')
    meta_path = os.path.join(args.out, 'meta-%s.json' % tag)

    def save():
        meta['errors'] = errors
        meta['total_s'] = round(time.time() - t0, 1)
        with open(meta_path, 'w') as fh:
            json.dump(meta, fh, indent=1, sort_keys=True)
    for L in letters:
        gun, geo = gun_objs[L]
        spec_g = G.GUNS[L]
        meta['guns'][L] = {'fbx': spec_g['fbx'], 'k': round(geo['k'], 5), 'thick': spec_g['thick'],
                           'lengthTiles': round((geo['x1'] - geo['x0']) * geo['k'], 4),
                           'faceClasses': geo['faceClassCounts'], 'looks': spec_g['looks']}
        for g2, _ in gun_objs.values():
            g2.hide_render = g2 is not gun
        for pid, state, aim, spec in specs:
            key = '%s:%s' % (L, pid)
            socket_y = spec.get('socket_y', P.SIM_MUZZLE_Y)
            gunw = place_gun(gun, geo, spec_g, spec['aim'], socket_y, spec.get('recoil', 0.0),
                             FALSIFY_TILES if args.falsify == L else 0.0)
            try:
                frames, obj, info = reach_search(arm, spec, gunw, state, aim)
            except Unreachable as e:
                errors.append('%s: %s' % (key, e))
                print('UNREACHABLE', key, e, flush=True)
                continue
            bl.apply_pose(arm, frames)
            bpy.context.view_layer.update()
            timing = {}
            for pname in ('id', 'nrm', 'aod'):
                if pname == 'id':
                    for ob in body:
                        assign(ob, mats['id_body'])
                    assign(pack, mats['id_pack'])
                    assign(gun, [mats['id_gun_' + c] for c in geo['classes']])
                else:
                    for ob in body + [pack, gun]:
                        assign(ob, mats[pname])
                t1 = time.time()
                scene.render.filepath = os.path.join(args.out, L, '%s-%s.png' % (pid, pname))
                bpy.ops.render.render(write_still=True)
                timing[pname] = round(time.time() - t1, 2)
            pb = arm.pose.bones
            mw = arm.matrix_world

            def bone_pt(name, at='head'):
                return np.array(mw @ (pb[name].head if at == 'head' else pb[name].tail))
            meta['frames'][key] = {
                'gun': L, 'pose': pid, 'state': state, 'aim': aim, 'aimDeg': spec['aim'], 'socketY': socket_y,
                'recoil': spec.get('recoil', 0.0),
                'tiles': {'muzzle': tiles(gunw['muzzle']), 'drawnMuzzle': tiles(gunw['drawn_muzzle']),
                          'socket': tiles(gunw['socket']), 'grip': tiles(gunw['grip']),
                          'support': tiles(gunw['support']) if info['support'] == 'gun' else None,
                          'hand': tiles(bone_pt('hand.R')), 'handL': tiles(bone_pt('hand.L')),
                          'head': tiles((bone_pt('head') + bone_pt('head', 'tail')) / 2),
                          'footR': tiles(bone_pt('foot.R')), 'footL': tiles(bone_pt('foot.L'))},
                'lhand': info['support'], 'solve': info, 'render_s': timing}
            print(key, info['support'], info.get('search'), timing, flush=True)
        save()
    save()
    print('done', meta['total_s'], 's', flush=True)
    if errors:
        raise SystemExit('BUILD ERROR: %d frame(s) have a hand that cannot reach its target:\n  ' % len(errors) +
                         '\n  '.join(errors))


if __name__ == '__main__':
    main()
