"""T-109 A2 spike — the method on an enemy: the wasp from a CC0 model, through
the same data-pass render and toon reduction as RIG's candidate B/D.

    /opt/hb-art/bin/python tools/art/spike/wasp_v3.py --ppt 16.2419 --out tools/art/build/spike/wasp-desktop

Model: "3D Hornet/Wasp" by MikeMoon (OpenGameArt, CC0; Hornet6(Animating).blend
from wasp_0.zip — see cc0.json). Rigged; this script only poses its wing,
abdomen and head bones and turns it to face -x (toward RIG, as the captured
in-game wasp flies with dir -1). Body length (head to sting) is fitted to
1.0 tile: the production wasp's ink is sized to its 1.0-tile primitive box
(src/render/sprite-table.js, referenceInkWidth 102 at 1/102 tile per px).

Passes (Cycles, 1 spp at pixel centres, --ss supersampling): normal, ambient
occlusion, depth, object id, and a PART pass from bone weights (head, thorax,
abdomen, wing, leg, antenna) whose green channel carries the position along
the abdomen, for the banding. Reduction and toon rules are v3_post.py's:
weighted-majority part per output pixel, 4 tones from the game's key light,
1 px depth lines between overlapping parts, a near-black 1 px outline, and
the scripted tidy (spurs/notches, tone islands). Palette: the ENEMY acid
family of src/render/palette.js (wasp #9ce23e, waspDive #bdf03e, carrier
#63b12e, houndCharge #3f9e14) over a dark olive carapace; pale acid wings.
"""

import argparse
import json
import math
import os
import sys
import time

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ART, 'lib'))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import bl  # noqa: E402

BLEND = os.path.join(ART, 'build', 'cc0', 'mikemoon-hornet-wasp', 'files', 'Hornet6(Animating).blend')
BODY_TILES = 1.25          # the in-game wasp reads ~1.1-1.4 tiles wide in cruise (T-109 phase A)
PARTS = {'head': 1, 'thorax': 2, 'abdomen': 3, 'wing': 4, 'leg': 5, 'antenna': 6, 'sting': 7}
CELL = (1.10, 1.10, 0.90, 0.90)            # tiles left/right/below/above the body centre

# wing poses (degrees): (lift about the body axis, sweep forward)
POSES = {
    'cruise-up': dict(lift=48.0, sweep=14.0, abdomen=-30.0, head=0.0),
    'cruise-down': dict(lift=-14.0, sweep=26.0, abdomen=-26.0, head=0.0),
}


def part_of(bone):
    b = bone
    if b.startswith('Head') or b.startswith(('LJaw', 'RJaw')):
        return 'head'
    if b.startswith(('LAnt', 'RAnt')):
        return 'antenna'
    if b.startswith(('LWing', 'RWing')):
        return 'wing'
    if b.startswith('Abdomen'):
        return 'abdomen'
    if b.startswith('Stinger'):
        return 'sting'
    if 'Arm' in b:
        return 'leg'
    return 'thorax'


def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    sc = bpy.context.scene
    with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ('Hornet', 'Armature')]
    for ob in bpy.data.objects:
        sc.collection.objects.link(ob)
    arm = bpy.data.objects['Armature']
    h = bpy.data.objects['Hornet']
    if arm.animation_data:
        arm.animation_data.action = None              # rest pose, then ours
    for m in h.modifiers:
        if m.type == 'SUBSURF':
            m.levels = 1
            m.render_levels = 1
    # part + abdomen coordinate per vertex, from the strongest bone weight
    me = h.data
    attr = me.color_attributes.new('part', 'FLOAT_COLOR', 'POINT')
    names = {g.index: g.name for g in h.vertex_groups}
    co = np.array([v.co[:] for v in me.vertices])
    for v in me.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        p = part_of(names[best.group]) if best else 'thorax'
        attr.data[v.index].color = (PARTS[p] / 16.0, 0.0, 0.0, 1.0)
    # abdomen banding coordinate: the mesh's own long axis (local Z after the
    # +90 deg X rotation the file carries is world -Y; local coords are fine)
    abd = [v.index for v in me.vertices if attr.data[v.index].color[0] * 16 > 2.5 and attr.data[v.index].color[0] * 16 < 3.5]
    if abd:
        ax = co[abd]
        k = int(np.argmax(ax.max(0) - ax.min(0)))
        lo, hi = ax[:, k].min(), ax[:, k].max()
        for i in abd:
            c = attr.data[i].color
            attr.data[i].color = (c[0], (co[i, k] - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    return sc, arm, h


def pose(arm, h, p):
    """Pose wings / abdomen in the file's own frame (body axis: head -Y,
    sting +Y; up +Z; the left wing on +X), then turn the whole wasp to face
    -x, scale the body to BODY_TILES and centre the thorax on the origin."""
    bpy.context.view_layer.update()
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    mw = arm.matrix_world.copy()
    inv = mw.inverted()

    def set_world(bone_name, rot_world):
        b = arm.data.bones[bone_name]
        head = mw @ b.head_local
        rest_w = mw @ b.matrix_local
        want = Matrix.Translation(head) @ rot_world @ Matrix.Translation(-head) @ rest_w
        arm.pose.bones[bone_name].matrix = inv @ want
        bpy.context.view_layer.update()

    # wings: raise the tip (about the lateral X axis) and spread it outward
    # (about Z); the far wing rises a little more so the pair reads as a V
    for side, sgn, extra in (('L', 1.0, 0.0), ('R', -1.0, 26.0)):
        lift = Matrix.Rotation(math.radians(p['lift'] + (extra if p['lift'] > 0 else 0.0)), 4, 'X')
        spread = Matrix.Rotation(math.radians(sgn * p['sweep']), 4, 'Z')
        set_world(side + 'Wing_2', spread @ lift)
    set_world('Abdomen_2', Matrix.Rotation(math.radians(p['abdomen']), 4, 'X'))
    # exaggeration for a ~16-24 px read (as RIG's): a fatter abdomen and a
    # bigger head; narrower wing blades so both read beside the body
    for name, sc_ in (('Abdomen_2', (1.40, 1.0, 1.40)), ('Head', (1.65, 1.65, 1.65)),
                      ('LWing_2', (1.0, 1.0, 1.0)), ('RWing_2', (1.0, 1.0, 1.0))):
        pb = arm.pose.bones[name]
        pb.scale = sc_
    bpy.context.view_layer.update()
    head = mw @ arm.data.bones['Head'].tail_local
    sting = mw @ arm.data.bones['Stinger'].tail_local
    length = (head - sting).length
    s = BODY_TILES / length
    thorax = mw @ arm.data.bones['Thorax'].head_local
    rot = Matrix.Rotation(math.radians(-90.0), 4, 'Z')
    arm.matrix_world = Matrix.Scale(s, 4) @ rot @ Matrix.Translation(-thorax) @ mw
    bpy.context.view_layer.update()
    return s


def make_emission(name, builder):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    builder(nt, em.inputs['Color'])
    return mat


def materials():
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
        a.inputs['Distance'].default_value = 0.06
        nt.links.new(a.outputs['AO'], sock)

    def part(nt, sock):
        at = nt.nodes.new('ShaderNodeAttribute')
        at.attribute_name = 'part'
        nt.links.new(at.outputs['Color'], sock)

    def depth(nt, sock):
        cd = nt.nodes.new('ShaderNodeCameraData')
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 28.0
        mr.inputs['From Max'].default_value = 32.0
        nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], sock)
    return {'normal': make_emission('n', normal), 'ao': make_emission('ao', ao),
            'part': make_emission('part', part), 'depth': make_emission('d', depth)}


# ---------------------------------------------------------------- the post
import v3_post as P  # noqa: E402

DARK, ACID, WING, EYE = 0, 1, 2, 3
RAMPS = {
    DARK: ['#4f6b25', '#36501b', '#243714', '#16220d', '#7fb0a0', '#9cc06a'],
    ACID: ['#d4ff5c', '#9ce23e', '#63b12e', '#3f7a14', '#bdf03e', '#efffb0'],
    WING: ['#f0ffd8', '#cdeeb0', '#a3c88c', '#76946a', '#c8f0e8', '#ffffff'],
    EYE: ['#efffb0', '#d4ff5c', '#9ce23e', '#63b12e', '#efffb0', '#ffffff'],
}
INK = P.hexrgb('#15101a')


def family(part, band):
    if part == PARTS['wing']:
        return WING
    if part in (PARTS['head'],):
        return ACID
    if part == PARTS['abdomen']:
        return ACID if (int(band * 5.0) % 2 == 1) else DARK
    if part == PARTS['sting']:
        return ACID
    return DARK


def reduce(src, frame, ss):
    rd = lambda n: P.read16(os.path.join(src, '%s-%s.png' % (frame, n)))  # noqa: E731
    nrm, ao, prt, dep = rd('normal'), rd('ao'), rd('part'), rd('depth')
    alpha = prt[..., 3] > 0.5
    part = np.rint(prt[..., 0] * 16).astype(int)
    band = prt[..., 1]
    n = nrm[..., :3] * 2 - 1
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    n = P.smooth_normals(n, np.where(alpha, np.clip(part, 0, 15), 0), 0.8 * ss)
    depth = dep[..., 0] * 4.0
    fam = np.full(part.shape, -1, int)
    for y, x in zip(*np.nonzero(alpha)):
        fam[y, x] = family(part[y, x], band[y, x])
    H, W = fam.shape[0] // ss, fam.shape[1] // ss
    out_f = np.full((H, W), -1, int)
    out_t = np.zeros((H, W), int)
    out_d = np.ones((H, W))
    out_n = np.zeros((H, W, 3))
    weight = np.array([1.0, 1.6, 1.3, 3.0])
    for y in range(H):
        for x in range(W):
            sl = (slice(y * ss, (y + 1) * ss), slice(x * ss, (x + 1) * ss))
            a = alpha[sl].ravel()
            f = fam[sl].ravel()
            if a.mean() < 0.42:
                continue
            counts = np.bincount(f[a], minlength=4).astype(float)
            win = int(np.argmax(counts * weight))
            m = (f == win) & a
            nn = n[sl].reshape(-1, 3)[m].mean(0)
            nn /= max(np.linalg.norm(nn), 1e-6)
            out_n[y, x] = nn
            out_f[y, x] = win
            out_t[y, x] = P.tone_of(nn, ao[sl][..., 0].ravel()[m].mean())
            out_d[y, x] = depth[sl].ravel()[a].min()
    return out_f, out_t, out_d, out_n


def compose(out_f, out_t, out_d):
    H, W = out_f.shape
    line = P.depth_lines(out_f, out_d, 0.05)
    rgba = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        for x in range(W):
            f = out_f[y, x]
            if f < 0:
                continue
            t = out_t[y, x]
            c = INK if (line[y, x] and f != WING) else P.hexrgb(RAMPS[f][t])
            rgba[y, x] = (*c, 255)
    for y in range(H):
        for x in range(W):
            if out_f[y, x] >= 0:
                continue
            if any(0 <= y + dy < H and 0 <= x + dx < W and out_f[y + dy, x + dx] >= 0 for dy, dx in P.N4):
                rgba[y, x] = (*INK, 255)
    return rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--ppt', type=float, required=True)
    ap.add_argument('--ss', type=int, default=8)
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    meta = {'ppt': args.ppt, 'ss': args.ss, 'frames': {}}
    for fname, p in POSES.items():
        sc, arm, h = load()
        s = pose(arm, h, p)
        h.pass_index = 1
        mats = materials()
        cw = int(math.ceil((CELL[0] + CELL[1]) * args.ppt))
        ch = int(math.ceil((CELL[2] + CELL[3]) * args.ppt))
        ox, oy = round(CELL[0] * args.ppt), round(CELL[3] * args.ppt)
        cam = bl.make_camera(sc)
        bl.frame_camera(cam, cw, ch, (ox, oy), args.ppt)
        import v3_render as R
        R.setup_cycles(sc, cw * args.ss, ch * args.ss)
        for pname in ('normal', 'ao', 'part', 'depth'):
            for slot in h.material_slots:
                slot.link = 'OBJECT'
                slot.material = mats[pname]
            sc.render.filepath = os.path.join(args.out, '%s-%s.png' % (fname, pname))
            bpy.ops.render.render(write_still=True)
        f, t, d, n = reduce(args.out, fname, args.ss)
        f2, t2, d2, _, n2 = P.tidy_silhouette(f, t, d, np.zeros_like(f), n)
        t2 = P.tidy_tones(f2, t2)
        rgba = compose(f2, t2, d2)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(args.out, '%s.png' % fname))
        ys, xs = np.nonzero(rgba[..., 3])
        meta['frames'][fname] = {'origin': [ox, oy], 'cell': [cw, ch], 'scale': s,
                                 'h': int(ys.max() - ys.min() + 1), 'w': int(xs.max() - xs.min() + 1)}
        print(fname, meta['frames'][fname])
    meta['total_s'] = round(time.time() - t0, 1)
    with open(os.path.join(args.out, 'meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
