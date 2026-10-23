"""Blender (bpy module) helpers shared by the RIG and wasp builds.

Rendering contract — chosen for byte-reproducible pixel art on a GPU-less host:
  * Workbench, FLAT lighting, no AA, no dither, transparent film. Every pixel
    of a render is exactly one material's colour or empty: there is no light
    simulation and no sampling noise, so the same scene gives the same bytes.
  * Materials carry ID colours, not palette colours. One material per
    (class, light band); the band of each face is chosen in Python from its
    evaluated world normal (a fixed key-light dot product), i.e. a
    deterministic cel shade computed per face. pixel.py turns IDs into the
    house palette after a weighted-mode downscale.
  * Orthographic camera looking +Y; world X right, Z up; 1 unit = 1 tile.
"""

import math
import os

import bpy  # noqa: F401  (must precede bmesh/mathutils: bpy registers them)
import bmesh
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
from PIL import Image

# --------------------------------------------------------------------------
# ID colour scheme: R encodes the material class, G the light band.
# --------------------------------------------------------------------------

def id_color(class_index, band):
    return (8 * (class_index + 1), 40 * band + 20, 0)


def decode_ids(rgba, n_classes, n_bands=4):
    """RGBA uint8 render -> int array: -1 empty, else class*n_bands + band."""
    a = rgba[..., 3] > 0
    cls = np.rint(rgba[..., 0].astype(np.float64) / 8.0).astype(np.int64) - 1
    band = np.rint((rgba[..., 1].astype(np.float64) - 20) / 40.0).astype(np.int64)
    ok = a & (cls >= 0) & (cls < n_classes) & (band >= 0) & (band < n_bands)
    bad = a & ~ok
    if bad.any():
        raise RuntimeError('render contains %d pixels with unknown ID colours' % int(bad.sum()))
    out = np.full(a.shape, -1, dtype=np.int64)
    out[ok] = cls[ok] * n_bands + band[ok]
    return out


# --------------------------------------------------------------------------
# Scene
# --------------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_render(scene, width, height):
    r = scene.render
    r.engine = 'BLENDER_WORKBENCH'
    r.resolution_x = int(width)
    r.resolution_y = int(height)
    r.resolution_percentage = 100
    r.film_transparent = True
    r.dither_intensity = 0.0
    r.use_compositing = False
    r.use_sequencer = False
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    r.image_settings.compression = 0
    scene.display.render_aa = 'OFF'
    sh = scene.display.shading
    sh.light = 'FLAT'
    sh.color_type = 'MATERIAL'
    sh.show_shadows = False
    sh.show_cavity = False
    sh.show_object_outline = False
    sh.show_specular_highlight = False
    sh.show_xray = False
    sh.show_backface_culling = False
    try:
        scene.view_settings.view_transform = 'Raw'
    except TypeError:
        pass  # module builds without OCIO only offer NONE (identity) — also exact
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def make_camera(scene, name='cam'):
    cam = bpy.data.cameras.new(name)
    cam.type = 'ORTHO'
    cam.sensor_fit = 'HORIZONTAL'
    cam.clip_start = 0.1
    cam.clip_end = 100.0
    ob = bpy.data.objects.new(name, cam)
    scene.collection.objects.link(ob)
    scene.camera = ob
    ob.rotation_euler = (math.pi / 2, 0.0, 0.0)   # look along +Y, up +Z
    return ob


def frame_camera(cam_ob, cell_w, cell_h, origin_px, px_per_tile):
    """Fit the ortho frustum to a cell of cell_w x cell_h output pixels whose
    world origin (feet / reactor) sits at pixel EDGE coordinates origin_px."""
    ox, oy = origin_px
    cam_ob.data.ortho_scale = cell_w / px_per_tile
    cx = (cell_w / 2.0 - ox) / px_per_tile
    cz = (oy - cell_h / 2.0) / px_per_tile
    cam_ob.location = (cx, -30.0, cz)


def project_px(scene, cam_ob, world_co, out_w, out_h):
    """World point -> continuous pixel coords (x right, y down, 0 = frame edge)."""
    v = world_to_camera_view(scene, cam_ob, Vector(world_co))
    return (float(v.x) * out_w, (1.0 - float(v.y)) * out_h)


def render_rgba(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    with Image.open(path) as im:
        return np.array(im.convert('RGBA'))


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------

class MaterialBank:
    """One Blender material per (class, band), created lazily, ID-coloured."""

    def __init__(self, class_names, n_bands=4):
        self.class_names = list(class_names)
        self.index = {n: i for i, n in enumerate(self.class_names)}
        self.n_bands = n_bands
        self.mats = {}

    def get(self, cls, band):
        key = (cls, band)
        if key not in self.mats:
            r, g, b = id_color(self.index[cls], band)
            m = bpy.data.materials.new('%s.%d' % (cls, band))
            m.diffuse_color = (r / 255.0, g / 255.0, b / 255.0, 1.0)
            self.mats[key] = m
        return self.mats[key]


# --------------------------------------------------------------------------
# Mesh building (bmesh, deterministic vertex order)
# --------------------------------------------------------------------------

META = {}      # object name -> {'face_class': [...], 'slot_base': {...}}


class MeshBuilder:
    """Accumulates low-poly solids in one bmesh; every face remembers its class."""

    def __init__(self):
        self.bm = bmesh.new()
        self.face_class = []

    def _tag(self, faces, cls):
        for f in faces:
            self.face_class.append((f, cls))

    def _poly(self, verts_xyz, faces_idx, cls, m=None):
        vs = []
        for p in verts_xyz:
            q = np.asarray(p, dtype=float)
            if m is not None:
                q = (m @ np.append(q, 1.0))[:3]
            vs.append(self.bm.verts.new((float(q[0]), float(q[1]), float(q[2]))))
        fs = []
        for idx in faces_idx:
            fs.append(self.bm.faces.new([vs[i] for i in idx]))
        self._tag(fs, cls)
        return fs

    def box(self, center, size, cls, m=None, taper=None, chamfer=0.0):
        """Axis box (in the local frame given by 4x4 m). `taper` = (sx, sy) scale
        of the +Z face relative to the -Z face. `chamfer` bevels the 4 vertical
        edges by that fraction (an octagonal prism, chunkier than a cube)."""
        cx, cy, cz = center
        hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
        tx, ty = taper if taper else (1.0, 1.0)
        if chamfer > 0:
            c = chamfer
            ring = [(hx, hy * (1 - c)), (hx * (1 - c), hy), (-hx * (1 - c), hy), (-hx, hy * (1 - c)),
                    (-hx, -hy * (1 - c)), (-hx * (1 - c), -hy), (hx * (1 - c), -hy), (hx, -hy * (1 - c))]
        else:
            ring = [(hx, hy), (-hx, hy), (-hx, -hy), (hx, -hy)]
        n = len(ring)
        verts = [(cx + x, cy + y, cz - hz) for x, y in ring]
        verts += [(cx + x * tx, cy + y * ty, cz + hz) for x, y in ring]
        faces = [list(range(n))[::-1], list(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append([i, j, n + j, n + i])
        return self._poly(verts, faces, cls, m)

    def prism(self, profile_xz, y0, y1, cls, m=None):
        """Extrude a convex XZ polygon (CCW seen from -Y) between depths y0..y1."""
        n = len(profile_xz)
        verts = [(x, y0, z) for x, z in profile_xz] + [(x, y1, z) for x, z in profile_xz]
        faces = [list(range(n)), list(range(n, 2 * n))[::-1]]
        for i in range(n):
            j = (i + 1) % n
            faces.append([j, i, n + i, n + j])
        return self._poly(verts, faces, cls, m)

    def cylinder(self, p0, p1, radius, cls, sides=8, m=None, r1=None):
        """Capped low-poly cylinder (or frustum when r1 is given) from p0 to p1."""
        p0 = np.asarray(p0, dtype=float)
        p1 = np.asarray(p1, dtype=float)
        axis = p1 - p0
        length = float(np.linalg.norm(axis))
        a = axis / length
        helper = np.array([0.0, 0.0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        u = np.cross(a, helper)
        u /= np.linalg.norm(u)
        w = np.cross(a, u)
        r_end = radius if r1 is None else r1
        verts = []
        for k in range(sides):
            t = 2 * math.pi * (k + 0.5) / sides
            verts.append(p0 + radius * (math.cos(t) * u + math.sin(t) * w))
        for k in range(sides):
            t = 2 * math.pi * (k + 0.5) / sides
            verts.append(p1 + r_end * (math.cos(t) * u + math.sin(t) * w))
        faces = [list(range(sides))[::-1], list(range(sides, 2 * sides))]
        for i in range(sides):
            j = (i + 1) % sides
            faces.append([i, j, sides + j, sides + i])
        return self._poly(verts, faces, cls, m)

    def blob(self, center, radii, cls, m=None, seg=8, rings=5):
        """Low-poly ellipsoid (UV sphere) — helmets, joints, wasp bodies."""
        cx, cy, cz = center
        rx, ry, rz = radii
        verts = [(cx, cy, cz - rz)]
        for i in range(1, rings):
            phi = -math.pi / 2 + math.pi * i / rings
            for k in range(seg):
                t = 2 * math.pi * (k + 0.5) / seg
                verts.append((cx + rx * math.cos(phi) * math.cos(t),
                              cy + ry * math.cos(phi) * math.sin(t),
                              cz + rz * math.sin(phi)))
        verts.append((cx, cy, cz + rz))
        top = len(verts) - 1
        faces = []
        for k in range(seg):
            faces.append([0, 1 + (k + 1) % seg, 1 + k])
        for i in range(rings - 2):
            a0 = 1 + i * seg
            b0 = 1 + (i + 1) * seg
            for k in range(seg):
                k2 = (k + 1) % seg
                faces.append([a0 + k, a0 + k2, b0 + k2, b0 + k])
        last = 1 + (rings - 2) * seg
        for k in range(seg):
            faces.append([last + k, last + (k + 1) % seg, top])
        return self._poly(verts, faces, cls, m)

    def to_object(self, name, bank, scene):
        """Finish into a mesh object. Each face gets a slot per (class, band)."""
        me = bpy.data.meshes.new(name)
        classes = []
        for _, cls in self.face_class:
            if cls not in classes:
                classes.append(cls)
        slot = {}
        for cls in classes:
            for band in range(bank.n_bands):
                slot[(cls, band)] = len(me.materials)
                me.materials.append(bank.get(cls, band))
        self.bm.faces.index_update()
        face_cls = {f.index: cls for f, cls in self.face_class}
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        META[ob.name] = {
            'face_class': [face_cls[i] for i in range(len(me.polygons))],
            'slot_base': {cls: slot[(cls, 0)] for cls in classes},
        }
        return ob


# --------------------------------------------------------------------------
# Per-face cel banding
# --------------------------------------------------------------------------

def assign_bands(objects, light_dir, band_for):
    """Set each face's material slot from its evaluated world normal.

    band_for(cls, n_dot_l) -> band index. A deterministic per-face cel shade:
    the same pose always gives the same bands, so renders are reproducible.
    The mesh data is per object, so this never fights another object.
    """
    L = np.asarray(light_dir, dtype=float)
    L = L / np.linalg.norm(L)
    for ob in objects:
        if ob.hide_render:
            continue
        meta = META[ob.name]
        mw = np.array(ob.matrix_world)
        nm = np.linalg.inv(mw[:3, :3]).T
        classes = meta['face_class']
        base = meta['slot_base']
        me = ob.data
        for poly in me.polygons:
            cls = classes[poly.index]
            n = nm @ np.array(poly.normal)
            n /= np.linalg.norm(n)
            poly.material_index = base[cls] + band_for(cls, float(n @ L))
        me.update()


# --------------------------------------------------------------------------
# Armature
# --------------------------------------------------------------------------

def build_armature(scene, name, bones):
    """bones: list of (name, parent, head, tail, z_hint) in world/rest space.
    Returns the armature object; rest frames are read back from Blender."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for bname, parent, head, tail, zhint in bones:
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.align_roll(Vector(zhint))
        b.use_deform = False
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return ob


def rest_frames(arm_ob):
    return {b.name: np.array(b.matrix_local) for b in arm_ob.data.bones}


def parent_to_bone(child, arm_ob, bone_name):
    """Keep the child where it is at rest and make it follow bone_name."""
    bone = arm_ob.data.bones[bone_name]
    rest_tail = Matrix(np.array(bone.matrix_local)) @ Matrix.Translation((0.0, bone.length, 0.0))
    world = child.matrix_world.copy()
    child.parent = arm_ob
    child.parent_type = 'BONE'
    child.parent_bone = bone_name
    child.matrix_parent_inverse = (arm_ob.matrix_world @ rest_tail).inverted()
    child.matrix_basis = world


def apply_pose(arm_ob, pose_frames):
    """pose_frames: {bone: 4x4 armature-space frame}. Bones missing from the
    dict keep their rest pose relative to their parent."""
    rest = rest_frames(arm_ob)
    resolved = {}
    for b in arm_ob.data.bones:          # parents precede children
        name = b.name
        if name in pose_frames:
            resolved[name] = np.asarray(pose_frames[name], dtype=float)
        elif b.parent is not None:
            p = b.parent.name
            resolved[name] = resolved[p] @ np.linalg.inv(rest[p]) @ rest[name]
        else:
            resolved[name] = rest[name]
    for b in arm_ob.data.bones:
        name = b.name
        if b.parent is None:
            basis = np.linalg.inv(rest[name]) @ resolved[name]
        else:
            p = b.parent.name
            local_rest = np.linalg.inv(rest[p]) @ rest[name]
            basis = np.linalg.inv(local_rest) @ np.linalg.inv(resolved[p]) @ resolved[name]
        pb = arm_ob.pose.bones[name]
        pb.matrix_basis = Matrix(basis.tolist())
    return resolved
