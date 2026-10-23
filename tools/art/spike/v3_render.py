"""T-109 A2 spike — RIG "3D v3": a CC0 character posed on the sim's shot line
and rendered to DATA passes (no colours yet) at a supersampled size.

    /opt/hb-art/bin/python tools/art/spike/v3_render.py --ppt 18 --out tools/art/build/spike/v3-18

Base mesh, helmet, hand: "Sci-fi soldier" by Irondust (OpenGameArt, CC0); gun:
Bullpup_2 from quaternius' Ultimate Gun Pack (OpenGameArt, CC0). See cc0.json
(fetch_cc0.py downloads and verifies them; nothing third-party is committed).

What this keeps from the v2 pipeline: the sim fixes the gun (bore through
(0, CONFIG.player.muzzleY), muzzle CONFIG.player.barrelTiles down it) and the
body is solved around it with analytic two-bone IK (tools/art/lib/kin.py);
the camera is the same fixed orthographic one; anchors are projected from the
evaluated scene. What changes: a professionally modelled base mesh instead of
primitive boxes, exaggerated proportions for a ~36 px read (bigger head,
hands, gun, thicker limbs), and per-pixel data passes — albedo class, smooth
normals, ambient occlusion, object id, depth — rendered with Cycles at --ss x
the output size, one sample per pixel at the pixel centre (exact, no noise
filter), for v3_post.py to toon-shade and downsample.
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

# The simulation's numbers (src/config.js; tools/art/build.py re-reads them).
SIM_MUZZLE_Y = 1.05
SIM_BARREL = 0.82
GUN_DEPTH = -0.20          # toward the camera, as v2

YAW_DEG = float(os.environ.get('V3_YAW', 16.0))   # body turned toward the camera (v2: 28)
BODY_SCALE = 0.99          # base mesh 2.02 tall; shorter legs + bigger helmet -> ~2.0 tiles
HEAD_SCALE = 1.32          # exaggeration for a ~36 px read
HAND_SCALE = 1.30
LIMB_THICK = 1.25          # upper/fore arms: thicker, not longer
LEG_THICK = 1.32           # thighs, shins
LEG_LEN = 0.97             # shorter legs: a heavier, more heroic read
CHEST_SCALE = (1.14, 1.0, 1.12)   # wider and deeper chest (bone-local x, y, z)
SHOULDER_SCALE = 1.25
GUN_LENGTH = 1.12          # stock to muzzle, tiles (v2 was ~1.0)
GUN_THICK = 1.30           # chunkier gun: height/width x1.3 about the bore line

# Cell layout in tiles around the sim point (same as v2's RIG cell).
CELL_LEFT, CELL_RIGHT, CELL_BELOW, CELL_ABOVE = 1.00, 1.30, 0.20, 2.30

OBJ_IDS = {'Body': 1, 'Head1': 2, 'HandSimple': 3, 'gun': 4, 'pack': 5}
# Body regions from each vertex's strongest bone weight, written as a colour
# attribute and rendered as its own pass, so the post can give each region its
# own value zone (src/render/palette.js T-040: bright head/visor/gun arm, dark
# torso+pack, mid legs) instead of letting the texture decide.
REGIONS = {'torso': 1, 'head': 2, 'arm_R': 3, 'arm_L': 4, 'hand': 5, 'leg_R': 6, 'leg_L': 7, 'foot': 8}


def region_of(bone):
    b = bone.split('.')[0]
    side = bone.rsplit('.', 1)[-1] if '.' in bone else ''
    if b in ('head',):
        return 'head'
    if b in ('hips', 'spine', 'chest', 'neck'):
        return 'torso'
    if b in ('shoulder', 'upper_arm', 'forearm'):
        return 'arm_' + side
    if b in ('hand', 'palm', 'thumb') or b.startswith('f_'):
        return 'hand'
    if b in ('thigh', 'shin'):
        return 'leg_' + side
    if b in ('foot', 'toe', 'heel', 'heel'):
        return 'foot'
    return 'torso'


def paint_regions(ob, fixed=None):
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
    for (cx, cy, cz), (sx, sy, sz) in (((0.0, 0.16, 1.38), (0.36, 0.20, 0.42)),
                                       ((0.0, 0.25, 1.30), (0.26, 0.10, 0.22))):
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
    # parent to the chest bone at rest (armature object at identity here)
    bl.parent_to_bone(ob, arm, 'chest')
    return ob
GUN_SLOTS = {'MainDark': (1.0, 0.0, 0.0), 'Main': (0.0, 1.0, 0.0), 'MainLight': (0.0, 0.0, 1.0)}

# ---------------------------------------------------------------- poses
# World: X screen-right (travel), Y into the screen, Z up; the sim point at
# the origin. Feet / pelvis targets in tiles, picked by eye for a hip hold.
POSES = {
    'idle': {
        'pelvis': (-0.04, 0.0, 0.0),        # offset from the rest hip height (z) — lowered below
        'pelvis_drop': 0.02,
        'lean': 6.0,                        # degrees forward, hips
        'chest_lean': 4.0,
        'chest_twist': 10.0,                # toward the gun
        'foot_R': (-0.15, -0.10, 0.0, 0.0),     # x, y, z lift, heel-up degrees
        'foot_L': (0.17, 0.12, 0.0, 0.0),
        'knee_out': 0.10,
        'head_turn': 18.0,
        'head_pitch': -4.0,
    },
    'run': {      # contact: far (left) leg forward and planted, near (right) leg back pushing
        'pelvis': (-0.02, 0.0, 0.0),
        'pelvis_drop': 0.04,
        'lean': 14.0,
        'chest_lean': 6.0,
        'chest_twist': 10.0,
        'foot_R': (-0.50, -0.07, 0.10, 42.0),
        'foot_L': (0.46, 0.10, 0.0, -6.0),
        'knee_out': 0.06,
        'head_turn': 18.0,
        'head_pitch': -8.0,
    },
}


def rot_axis(axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 4, Vector(axis)))


def to_np(m):
    return np.array(m, dtype=float)


def minimal_rotation(a, b):
    a, b = unit(a), unit(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        if c > 0:
            return np.eye(3)
        # 180 degrees about any axis perpendicular to a
        p = unit(np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0]))
        return np.array(Matrix.Rotation(math.pi, 3, Vector(p)))
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


def frame(head, y_dir, rest_world, scale=(1.0, 1.0, 1.0)):
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
    guns = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Bullpup')]
    gun = guns[0]
    gun.name = 'gun'
    pack = build_pack(arm)
    return scene, arm, gun, pack


def gun_geometry(gun):
    """Bore muzzle point, pistol grip and foregrip in the gun's local frame
    (+X barrel, +Z up), from its vertices."""
    co = np.array([v.co[:] for v in gun.data.vertices])
    x0, x1 = co[:, 0].min(), co[:, 0].max()
    length = x1 - x0
    tip = co[co[:, 0] > x1 - 0.02 * length]
    bore = np.array([x1, tip[:, 1].mean(), tip[:, 2].mean()])
    zmin = co[:, 2].min()
    # Below-receiver protrusions: the pistol grip (rear half) and the vertical
    # foregrip (front third). Bullpup: the magazine sits BEHIND the grip.
    low = co[co[:, 2] < bore[2] - 0.35 * (bore[2] - zmin)]
    rear = low[(low[:, 0] > x0 + 0.12 * length) & (low[:, 0] < x0 + 0.55 * length)]
    front = low[low[:, 0] > x0 + 0.62 * length]
    # the grip is the forward-most cluster of the rear group
    gx = np.percentile(rear[:, 0], 80) if len(rear) else x0 + 0.3 * length
    grip_pts = rear[rear[:, 0] > gx - 0.18 * length] if len(rear) else rear
    grip = np.array([grip_pts[:, 0].mean(), 0.0, bore[2] - 0.30 * (bore[2] - zmin)])
    fg = np.array([front[:, 0].mean(), 0.0, bore[2] - 0.45 * (bore[2] - zmin)]) if len(front) else \
        np.array([x0 + 0.8 * length, 0.0, bore[2] - 0.3])
    return {'x0': x0, 'x1': x1, 'length': length, 'bore': bore, 'grip': grip, 'foregrip': fg, 'zmin': zmin}


def place_gun(gun, geo):
    k = GUN_LENGTH / geo['length']
    muzzle_world = np.array([SIM_BARREL, GUN_DEPTH, SIM_MUZZLE_Y])
    sc = np.array([k, k * GUN_THICK, k * GUN_THICK])
    loc = muzzle_world - sc * geo['bore']
    gun.location = Vector(loc.tolist())
    gun.rotation_euler = (0.0, 0.0, 0.0)
    gun.scale = tuple(sc.tolist())
    to_world = lambda p: loc + sc * np.asarray(p)  # noqa: E731
    return {'k': k, 'muzzle': muzzle_world, 'grip': to_world(geo['grip']),
            'foregrip': to_world(geo['foregrip']), 'stock': to_world([geo['x0'], 0, geo['bore'][2]])}


def solve_pose(arm, pose, gunw):
    """World-space bone frames -> armature-space frames for bl.apply_pose."""
    yaw = math.radians(90.0 - YAW_DEG)
    s = BODY_SCALE
    rest = bl.rest_frames(arm)                       # armature space (rest)
    # Armature object: yaw so the model's -Y faces screen-right-toward-camera.
    px, py, _ = pose['pelvis']
    base = np.array(Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Scale(s, 4))
    # automatic pelvis height: drop the body until the farther foot target is
    # within 97% of the (shortened) leg, then the pose's extra crouch
    need = 0.0
    for side in ('L', 'R'):
        hip0 = (base @ rest['thigh.' + side])[:3, 3] + np.array([px, py, 0.0])
        knee0 = (base @ rest['shin.' + side])[:3, 3]
        ank0 = (base @ rest['foot.' + side])[:3, 3]
        L = (np.linalg.norm(knee0 - (base @ rest['thigh.' + side])[:3, 3]) + np.linalg.norm(ank0 - knee0)) * LEG_LEN * 0.97
        fx, fy, fz, _ = pose['foot_' + side]
        tgt = np.array([fx, fy, ank0[2] + fz])
        dxy = np.linalg.norm((tgt - hip0)[:2])
        dz_max = math.sqrt(max(L * L - dxy * dxy, 0.0))
        need = max(need, (hip0[2] - tgt[2]) - dz_max)
    drop = need + pose['pelvis_drop']
    obj = np.array(Matrix.Translation((px, py, -drop))) @ base
    arm.matrix_world = Matrix(obj.tolist())
    W = {n: obj @ m for n, m in rest.items()}      # rest frames in world space
    fwd = np.array([math.cos(math.radians(-YAW_DEG)), math.sin(math.radians(-YAW_DEG)), 0.0])
    right = np.array([fwd[1], -fwd[0], 0.0])        # the character's right (toward camera)
    out = {}

    def fk(name, parent_world, local_rot=None, scale=None):
        """Child frame from its parent's posed world frame, an optional local
        rotation (bone-local axes) and per-axis scale."""
        p = arm.data.bones[name].parent.name
        rel = np.linalg.inv(W[p]) @ W[name]
        m = parent_world @ rel
        if local_rot is not None:
            m = m @ local_rot
        if scale is not None:
            m = m @ np.diag(list(scale) + [1.0])
        out[name] = m
        return m

    # hips: lean forward about the character's right axis (world)
    hips = W['hips'].copy()
    lean = np.array(Matrix.Rotation(math.radians(-pose['lean']), 4, Vector(right.tolist())))
    hips[:3, :3] = lean[:3, :3] @ hips[:3, :3]
    out['hips'] = hips
    spine = fk('spine', hips)
    tw = np.array(Matrix.Rotation(math.radians(pose['chest_twist']), 4, 'Y'))    # bone-local twist
    cl = np.array(Matrix.Rotation(math.radians(pose['chest_lean']), 4, 'X'))
    chest = fk('chest', spine, tw @ cl, CHEST_SCALE)
    neck = fk('neck', chest)
    hp = np.array(Matrix.Rotation(math.radians(pose['head_pitch']), 4, 'X'))
    ht = np.array(Matrix.Rotation(math.radians(pose['head_turn']), 4, 'Y'))
    fk('head', neck, ht @ hp, (HEAD_SCALE,) * 3)
    for side in ('L', 'R'):
        fk('shoulder.' + side, chest, None, (SHOULDER_SCALE,) * 3)

    # ---- legs: hip joint from the posed hips, foot target from the pose
    for side, sgn in (('L', -1.0), ('R', 1.0)):
        thigh_head = (hips @ np.linalg.inv(W['hips']) @ W['thigh.' + side])[:3, 3]
        fx, fy, fz, heel = pose['foot_' + side]
        ankle_rest = W['foot.' + side][:3, 3]
        ankle_z0 = (base @ rest['foot.' + side])[2, 3]          # rest ankle height above the deck
        ankle = np.array([fx, fy, ankle_z0 + fz])
        la = np.linalg.norm(W['shin.' + side][:3, 3] - W['thigh.' + side][:3, 3]) * LEG_LEN
        lb = np.linalg.norm(ankle_rest - W['shin.' + side][:3, 3]) * LEG_LEN
        pole = fwd + right * (sgn * pose['knee_out'])        # knees point a little outward
        knee, end, err = two_bone_ik(thigh_head, ankle, la, lb, pole)
        if err > 1e-6:
            print('warning: leg %s short by %.3f tiles' % (side, err))
        thick = (LEG_THICK, LEG_LEN, LEG_THICK)
        out['thigh.' + side] = frame(thigh_head, knee - thigh_head, W['thigh.' + side], thick)
        out['shin.' + side] = frame(knee, end - knee, W['shin.' + side], thick)
        # foot: keep its rest attitude (flat), pitched heel-up for a push-off
        f = W['foot.' + side].copy()
        if heel:
            pr = np.array(Matrix.Rotation(math.radians(-heel), 4, Vector(right.tolist())))
            f[:3, :3] = pr[:3, :3] @ f[:3, :3]
        f[:3, 3] = end
        out['foot.' + side] = f
        rel = np.linalg.inv(W['foot.' + side]) @ W['toe.' + side]
        out['toe.' + side] = f @ rel

    # ---- arms: wrist targets from the gun
    slid = [0.0]
    for side, target, pole in (
            ('R', gunw['grip'] + np.array([-0.035, 0.0, 0.085]), np.array([-0.4, -0.3, -0.6])),
            ('L', gunw['foregrip'] + np.array([-0.02, 0.0, 0.10]), np.array([0.0, 0.6, -0.8]))):
        sh_m = out['shoulder.' + side]
        ua_head = (sh_m @ np.linalg.inv(W['shoulder.' + side]) @ W['upper_arm.' + side])[:3, 3]
        la = np.linalg.norm(W['forearm.' + side][:3, 3] - W['upper_arm.' + side][:3, 3])
        lb = np.linalg.norm(W['hand.' + side][:3, 3] - W['forearm.' + side][:3, 3])
        if side == 'L':     # support hand slides back along the handguard until it reaches
            while np.linalg.norm(target - ua_head) > 0.97 * (la + lb) and target[0] > gunw['grip'][0] + 0.22:
                target = target - np.array([0.02, 0.0, 0.0])
            slid[0] = round(float(gunw['foregrip'][0] - target[0]), 3)
        elbow, wrist, err = two_bone_ik(ua_head, target, la, lb, pole)
        if err > 1e-6:
            print('warning: arm %s short by %.3f tiles' % (side, err))
        thick = (LIMB_THICK, 1.0, LIMB_THICK)
        out['upper_arm.' + side] = frame(ua_head, elbow - ua_head, W['upper_arm.' + side], thick)
        out['forearm.' + side] = frame(elbow, wrist - elbow, W['forearm.' + side], thick)
        # hand: point it along the gun (+X) and down the grip
        grip_dir = unit(np.array([0.55, 0.0, -0.83])) if side == 'R' else unit(np.array([0.35, 0.0, -0.94]))
        out['hand.' + side] = frame(wrist, grip_dir, W['hand.' + side], (HAND_SCALE,) * 3)
        # fingers: curl around the grip (bone-local X)
        for b in arm.data.bones:                    # parents precede children
            if not b.name.endswith('.' + side):
                continue
            base = b.name.split('.')[0]
            if base.startswith(('palm', 'f_', 'thumb')):
                p = b.parent.name
                rel = np.linalg.inv(W[p]) @ W[b.name]
                curl = 0.0 if base.startswith('palm') else (35.0 if base.startswith('thumb') else 62.0)
                out[b.name] = out[p] @ rel @ rot_axis((1, 0, 0), curl)
    # armature space
    inv = np.linalg.inv(obj)
    print('pose: pelvis drop %.3f, support hand slid %.3f tiles back from the foregrip' % (drop, slid[0]))
    return {n: inv @ m for n, m in out.items()}, obj


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
        try:                    # raw texture bytes in, raw bytes out (no OCIO here)
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
    ap.add_argument('--frames', default='idle,run')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    scene, arm, gun, pack = load_scene()
    geo = gun_geometry(gun)
    gunw = place_gun(gun, geo)
    body = [bpy.data.objects[n] for n in ('Body', 'Head1', 'HandSimple')]
    for ob in body:
        ob.pass_index = OBJ_IDS[ob.name]
    gun.pass_index = OBJ_IDS['gun']
    pack.pass_index = OBJ_IDS['pack']
    mats = build_materials()

    ppt, ss = args.ppt, args.ss
    cw = int(math.ceil((CELL_LEFT + CELL_RIGHT) * ppt))
    ch = int(math.ceil((CELL_BELOW + CELL_ABOVE) * ppt))
    ox, oy = round(CELL_LEFT * ppt), round(CELL_ABOVE * ppt)
    cam = bl.make_camera(scene)
    bl.frame_camera(cam, cw, ch, (ox, oy), ppt)
    setup_cycles(scene, cw * ss, ch * ss)
    meta = {'ppt': ppt, 'ss': ss, 'cell': [cw, ch], 'origin': [ox, oy], 'gun': {
        k: (v.tolist() if hasattr(v, 'tolist') else v) for k, v in gunw.items()}, 'frames': {}}

    allobs = body + [gun, pack]
    passes = {
        'albedo': lambda: ([assign(ob, mats['albedo_tex']) for ob in body],
                           assign(gun, [mats['gun_slots'].get(s.material.name.split('.')[0], mats['black'])
                                        if s.material else mats['black'] for s in gun.material_slots])),
        'emit': lambda: ([assign(ob, mats['emit_tex']) for ob in body], assign(gun, mats['black']),
                         assign(pack, mats['black'])),
        'normal': lambda: [assign(ob, mats['normal']) for ob in allobs],
        'ao': lambda: [assign(ob, mats['ao']) for ob in allobs],
        'id': lambda: [assign(ob, mats['id']) for ob in allobs],
        'depth': lambda: [assign(ob, mats['depth']) for ob in allobs],
        'region': lambda: ([assign(ob, mats['region']) for ob in body], assign(gun, mats['black']),
                           assign(pack, mats['black'])),
    }
    # the gun's own slot names must be read before any pass overrides them
    gun_slot_names = [s.material.name for s in gun.material_slots]
    print('gun slots', gun_slot_names, 'gun geo', {k: (np.round(v, 3).tolist() if hasattr(v, 'tolist') else round(v, 3))
                                                   for k, v in geo.items()})
    passes['albedo'] = lambda: ([assign(ob, mats['albedo_tex']) for ob in body],
                                assign(gun, [mats['gun_slots'].get(n.split('.')[0], mats['black'])
                                             for n in gun_slot_names]),
                                assign(pack, mats['black']))

    for fname in args.frames.split(','):
        frames, obj = solve_pose(arm, POSES[fname], gunw)
        bl.apply_pose(arm, frames)
        bpy.context.view_layer.update()
        timing = {}
        for pname, setup in passes.items():
            setup()
            t1 = time.time()
            scene.render.filepath = os.path.join(args.out, '%s-%s.png' % (fname, pname))
            bpy.ops.render.render(write_still=True)
            timing[pname] = round(time.time() - t1, 2)
        # anchors: the muzzle and grips projected through the camera (cell px)
        to_px = lambda p: [round(c / ss, 4) for c in bl.project_px(scene, cam, list(p), cw * ss, ch * ss)]  # noqa: E731
        meta['frames'][fname] = {
            'muzzle': to_px(gunw['muzzle']), 'grip': to_px(gunw['grip']),
            'foregrip': to_px(gunw['foregrip']), 'origin': to_px((0, 0, 0)),
            'render_s': timing}
    meta['total_s'] = round(time.time() - t0, 1)
    with open(os.path.join(args.out, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
    print(json.dumps(meta)[:2000])


if __name__ == '__main__':
    main()
