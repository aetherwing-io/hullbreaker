"""Small rigid-body kinematics kit (numpy only, no bpy) for posing the sprite rigs.

Conventions (shared by every script in tools/art/):
  world X = screen right (the authored facing), world Z = up, world Y = depth
  (the orthographic camera sits at -Y looking +Y, so -Y is "toward the viewer").
  1 world unit = 1 game tile.

A frame is a 4x4 matrix whose columns are the X, Y, Z axes and origin.
Blender bones point along their local +Y; every limb frame here follows that.
"""

import math
import numpy as np


def v3(x, y, z):
    return np.array([float(x), float(y), float(z)])


def unit(v):
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        raise ValueError('zero-length vector')
    return v / n


def frame(x_axis, y_axis, z_axis, origin):
    m = np.eye(4)
    m[:3, 0] = x_axis
    m[:3, 1] = y_axis
    m[:3, 2] = z_axis
    m[:3, 3] = origin
    return m


def translate(x, y=None, z=None):
    if y is None:
        x, y, z = x
    m = np.eye(4)
    m[:3, 3] = (x, y, z)
    return m


def rot_axis(axis, deg):
    """4x4 rotation about a unit axis through the origin (right-handed)."""
    a = unit(np.asarray(axis, dtype=float))
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    x, y, z = a
    r = np.array([
        [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
        [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
        [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)],
    ])
    m = np.eye(4)
    m[:3, :3] = r
    return m


def rot_x(deg):
    return rot_axis((1, 0, 0), deg)


def rot_y(deg):
    return rot_axis((0, 1, 0), deg)


def rot_z(deg):
    return rot_axis((0, 0, 1), deg)


def about(point, m):
    """Apply 4x4 m about a pivot point."""
    p = np.asarray(point, dtype=float)
    return translate(p) @ m @ translate(-p)


def xform(m, p):
    return (m @ np.append(np.asarray(p, dtype=float), 1.0))[:3]


def xdir(m, d):
    return m[:3, :3] @ np.asarray(d, dtype=float)


def orthonormal_from_y(y_axis, z_hint, origin):
    """Bone-style frame: +Y along y_axis, +Z as close to z_hint as possible."""
    y = unit(y_axis)
    z = np.asarray(z_hint, dtype=float) - y * float(np.dot(z_hint, y))
    if np.linalg.norm(z) < 1e-9:
        raise ValueError('z_hint parallel to bone axis')
    z = unit(z)
    x = np.cross(y, z)
    return frame(x, y, z, origin)


def two_bone_ik(root, target, len_a, len_b, pole):
    """Analytic 2-bone IK.

    Returns (mid, end, reach_error): the joint position, the end position
    actually reached, and how far that end is from the target (0 when the
    target is reachable). `pole` is a world direction the middle joint bends
    toward.
    """
    root = np.asarray(root, dtype=float)
    target = np.asarray(target, dtype=float)
    d_vec = target - root
    d = float(np.linalg.norm(d_vec))
    lo, hi = abs(len_a - len_b) + 1e-6, len_a + len_b - 1e-6
    reach_error = 0.0
    if d > hi:
        reach_error = d - hi
        d_use = hi
    elif d < lo:
        reach_error = lo - d
        d_use = lo
    else:
        d_use = d
    u = unit(d_vec)
    p = np.asarray(pole, dtype=float) - u * float(np.dot(pole, u))
    v = unit(p)
    cos_a = (len_a * len_a + d_use * d_use - len_b * len_b) / (2 * len_a * d_use)
    cos_a = max(-1.0, min(1.0, cos_a))
    sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
    mid = root + len_a * (cos_a * u + sin_a * v)
    end = root + d_use * u
    return mid, end, reach_error
