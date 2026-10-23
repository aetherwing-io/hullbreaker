"""Blender (bpy module) helpers shared by the CC0 -> sprite builds (RIG v3,
tools/art/rig/render.py; the T-109 spike scripts in tools/art/spike/).

Conventions: orthographic camera looking +Y; world X right, Z up; 1 unit = 1
game tile. A frame is a 4x4 numpy matrix (columns = X, Y, Z axes, origin).

The T-109 phase-A helpers for building characters from primitives (ID-colour
Workbench materials, the low-poly mesh builder, per-face cel banding, the
armature builder) were removed with that builder: decisions entry 26 dropped
primitive-built characters, and nothing kept imports them.
"""

import math

import bpy  # noqa: F401  (must precede mathutils: bpy registers it)
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector


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
