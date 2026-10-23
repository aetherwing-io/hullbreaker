"""Rigid-body kinematics for posing the sprite rigs (numpy only, no bpy).

Conventions (shared by every script in tools/art/):
  world X = screen right (the authored facing), world Z = up, world Y = depth
  (the orthographic camera sits at -Y looking +Y, so -Y is "toward the viewer").
  1 world unit = 1 game tile.

Blender bones point along their local +Y; every limb frame follows that.
(The frame/rotation helpers the T-109 phase-A primitive poser used went with
it, decisions entry 26.)
"""

import math

import numpy as np


def unit(v):
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        raise ValueError('zero-length vector')
    return v / n


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
