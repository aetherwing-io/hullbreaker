"""RIG pose solver: a pose spec -> armature-space frame for every bone.

The gun is placed FIRST, from the simulation's own numbers, and the body is
solved around it: the bore axis passes through the hand socket
(0, CONFIG.player.muzzleY) and the muzzle sits CONFIG.player.barrelTiles down
that axis, exactly as src/sim/player.js spawns a shot:

    muzzle = (aim.x * barrelTiles, muzzleY + aim.y * barrelTiles)

The right hand bone is then the gun frame times a fixed grip offset (the gun
is parented to that bone in Blender), and two-bone IK reaches the arm to the
wrist. A hand that cannot reach is a build error, never a silent gap.
"""

import math

import numpy as np

from kin import (about, frame, orthonormal_from_y, rot_axis, rot_y, rot_z,
                 translate, two_bone_ik, unit, v3, xdir, xform)
import model as M

SIM_MUZZLE_Y = 1.05      # src/config.js CONFIG.player.muzzleY (build asserts it)
SIM_BARREL = 0.82        # src/config.js CONFIG.player.barrelTiles
CROUCH_MUZZLE_Y = 0.45   # src/config.js CONFIG.crouch.muzzleY


def rest_frames_py():
    out = {}
    for name, parent, head, tail, zhint in M.BONES:
        out[name] = orthonormal_from_y(v3(*tail) - v3(*head), v3(*zhint), v3(*head))
    return out


REST = rest_frames_py()
PARENT = {name: parent for name, parent, *_ in M.BONES}


GUN_DEPTH = -0.20         # the gun rides just in front of RIG's near hip


def gun_frame(aim_deg, socket=(0.0, SIM_MUZZLE_Y), depth=GUN_DEPTH):
    a = math.radians(aim_deg)
    x = v3(math.cos(a), 0, math.sin(a))
    y = v3(0, 1, 0)
    z = v3(-math.sin(a), 0, math.cos(a))
    return frame(x, y, z, v3(socket[0], depth, socket[1]))


def hand_in_gun_right():
    wrist = M.GRIP + M.WRIST_FROM_GRIP
    return orthonormal_from_y(M.GRIP - wrist, v3(0, -1, 0), wrist)


def hand_in_gun_left(foregrip):
    wrist = foregrip + v3(-0.065, 0.0, -0.03)
    return orthonormal_from_y(foregrip - wrist, v3(0, 1, 0), wrist)


def _delta(posed, name):
    """Rigid world transform a bone applied relative to its rest frame."""
    return posed[name] @ np.linalg.inv(REST[name])


def _rotate_child(posed, parent, child, rot_world_axis_deg):
    """Child frame = parent's motion applied to the child's rest frame, then
    extra rotations about the child's own joint (axes in the parent's posed
    body frame)."""
    base = _delta(posed, parent) @ REST[child]
    joint = base[:3, 3]
    m = np.eye(4)
    for axis, deg in rot_world_axis_deg:
        if deg:
            m = rot_axis(axis, deg) @ m
    return about(joint, m) @ base


class PoseError(RuntimeError):
    pass


def solve(spec, gun_letter='R'):
    """spec keys (all optional except where noted):
      yaw, pelvis=(x, z), lean, chest_bend, chest_twist, head_pitch, head_turn
      feet={'R': (fwd, side, z, toe_pitch), 'L': ...}   ankle targets, body coords
      knee_out: knee pole outward bias
      aim (deg), socket=(x, z), gun_depth
      lhand: 'fore' | ('free', world_pos(3), elbow_pole(3))
      elbow_R, elbow_L: body-coord pole directions
    Returns dict(frames, gun, hand_R, hand_L, diag)."""
    yaw = spec.get('yaw', 28.0)
    B = rot_z(-yaw)
    fwd_w = xdir(B, (1, 0, 0))
    left_w = xdir(B, (0, 1, 0))
    up_w = v3(0, 0, 1)

    posed = {'root': REST['root']}

    # hips: placed at pelvis (x, z) world, yawed, leaned about the body's left axis
    px, pz = spec.get('pelvis', (0.0, 0.84))
    hip_joint_rest = REST['hips'][:3, 3]
    m = translate(px, 0.0, pz) @ B @ rot_y(spec.get('lean', 0.0)) @ rot_axis((1, 0, 0), spec.get('roll', 0.0)) \
        @ translate(-hip_joint_rest)
    posed['hips'] = m @ REST['hips']

    posed['chest'] = _rotate_child(posed, 'hips', 'chest', [
        (left_w, spec.get('chest_bend', 0.0)),
        (up_w, spec.get('chest_twist', 0.0)),
    ])
    posed['neck'] = _rotate_child(posed, 'chest', 'neck', [(left_w, 0.5 * spec.get('head_pitch', 0.0))])
    posed['head'] = _rotate_child(posed, 'neck', 'head', [
        (left_w, 0.5 * spec.get('head_pitch', 0.0)),
        (up_w, spec.get('head_turn', 0.0)),
    ])

    diag = {'reach': {}}

    # legs: ankle targets in body coords, knees bend forward (+ a little out)
    feet = spec.get('feet', {'R': (-0.12, -0.13, 0.10, 0.0), 'L': (0.14, 0.13, 0.10, 0.0)})
    for side, sgn in (('R', -1.0), ('L', 1.0)):
        fwd, side_off, z, toe = feet[side]
        hip = xform(_delta(posed, 'hips'), REST['thigh.' + side][:3, 3])
        ankle = xform(B, (fwd, side_off, z))
        pole = unit(fwd_w + sgn * spec.get('knee_out', 0.15) * left_w)
        knee, end, err = two_bone_ik(hip, ankle, M.THIGH, M.SHIN, pole)
        diag['reach']['leg.' + side] = err
        right_axis = -left_w
        x_hint = right_axis
        y1 = unit(knee - hip)
        x1 = unit(x_hint - y1 * float(np.dot(x_hint, y1)))
        posed['thigh.' + side] = frame(x1, y1, np.cross(x1, y1), hip)
        y2 = unit(end - knee)
        x2 = unit(x_hint - y2 * float(np.dot(x_hint, y2)))
        posed['shin.' + side] = frame(x2, y2, np.cross(x2, y2), knee)
        ankle_rest = REST['foot.' + side][:3, 3]
        posed['foot.' + side] = translate(end) @ B @ rot_y(toe) @ translate(-ankle_rest) @ REST['foot.' + side]

    # gun first: the simulation decides where it is
    aim = spec.get('aim', 0.0)
    socket = spec.get('socket', (0.0, SIM_MUZZLE_Y))
    G = gun_frame(aim, socket, spec.get('gun_depth', GUN_DEPTH))
    gp = M.gun_parts()[gun_letter]

    # right arm -> the grip
    hand_R = G @ hand_in_gun_right()
    sh_R = xform(_delta(posed, 'chest'), REST['upperarm.R'][:3, 3])
    wrist_R = hand_R[:3, 3]
    pole_R = unit(xdir(B, spec.get('elbow_R', (-0.8, -0.55, -0.25))))
    elbow, end, err = two_bone_ik(sh_R, wrist_R, M.UPPER_ARM, M.FOREARM, pole_R)
    diag['reach']['arm.R'] = err
    posed['upperarm.R'] = orthonormal_from_y(elbow - sh_R, pole_R, sh_R)
    posed['forearm.R'] = orthonormal_from_y(end - elbow, pole_R, elbow)
    posed['hand.R'] = hand_R

    # left arm -> the foregrip (sliding back toward the receiver until the
    # hand can reach), or a free target (ladder rung, flung back, balance)
    lh = spec.get('lhand', 'fore')
    sh_L = xform(_delta(posed, 'chest'), REST['upperarm.L'][:3, 3])
    hand_L = None
    diag['lhand'] = 'free'
    if lh == 'fore':
        pole_L = unit(xdir(B, spec.get('elbow_L', (0.0, 0.65, -0.75))))
        fg0 = gp['foregrip']
        k = 0
        while True:
            fx = fg0[0] - 0.02 * k
            if fx < M.GRIP[0] + 0.13:
                break
            cand = G @ hand_in_gun_left(v3(fx, fg0[1], fg0[2]))
            if two_bone_ik(sh_L, cand[:3, 3], M.UPPER_ARM, M.FOREARM, pole_L)[2] <= 1e-4:
                hand_L = cand
                diag['lhand'] = 'gun@%.2f' % fx
                break
            k += 1
        if hand_L is None:
            lh = ('free', xform(B, spec.get('lhand_free', (-0.10, 0.30, 1.02))), (-0.4, 0.6, -0.5))
    if hand_L is None:
        _, pos, pole_body = lh
        pole_L = unit(xdir(B, pole_body))
        pos = np.asarray(pos, dtype=float)
        hand_L = orthonormal_from_y(unit(pos - sh_L), pole_L, pos)
    elbow, end, err = two_bone_ik(sh_L, hand_L[:3, 3], M.UPPER_ARM, M.FOREARM, pole_L)
    diag['reach']['arm.L'] = err
    posed['upperarm.L'] = orthonormal_from_y(elbow - sh_L, pole_L, sh_L)
    posed['forearm.L'] = orthonormal_from_y(end - elbow, pole_L, elbow)
    posed['hand.L'] = hand_L

    worst = max(diag['reach'].values())
    diag['worst_reach'] = worst
    return {'frames': posed, 'gun': G, 'diag': diag}


def _adjustments():
    """Fixed, ordered search space: small, deterministic nudges of the body
    toward a reachable pose. Cheapest change first."""
    cands = []
    for dz in (0.0, -0.02, -0.04, -0.06, -0.08, -0.10, -0.12):
        for dx in (0.0, 0.03, -0.03, 0.06, -0.06, 0.09, -0.09):
            for dl in (0.0, 4.0, -4.0, 8.0, -8.0, 12.0):
                cost = abs(dz) * 10 + abs(dx) * 8 + abs(dl) / 8
                cands.append((round(cost, 6), dz, dx, dl))
    cands.sort()
    return cands


ADJUST = _adjustments()


def solve_adaptive(spec, gun_letter='R'):
    """solve(), nudging pelvis height / offset and lean (in that cost order)
    until every limb reaches. Raises PoseError when nothing in the fixed search
    space works, so an unreachable hand can never ship as a gap."""
    px, pz = spec.get('pelvis', (0.0, 0.84))
    lean = spec.get('lean', 0.0)
    for cost, dz, dx, dl in ADJUST:
        s = dict(spec, pelvis=(px + dx, pz + dz), lean=lean + dl)
        out = solve(s, gun_letter)
        if out['diag']['worst_reach'] <= 1e-4:
            out['diag']['adjust'] = {'dz': dz, 'dx': dx, 'dlean': dl}
            out['spec'] = s
            return out
    raise PoseError('no reachable pose near spec %r' % (spec,))


# --------------------------------------------------------------------------
# The pose library. Aim angles follow src/sim/player.js computeAim (8-way);
# left-facing frames are the mirror image (the game flips the plane).
# --------------------------------------------------------------------------

AIM = {'right': 0.0, 'up-right': 45.0, 'up': 90.0, 'down-right': -45.0, 'down': -90.0}


def _aim_body(aim_name):
    """Torso attitude that keeps the shoulders over a gun on the sim socket."""
    return {
        'right':      dict(lean=8.0, chest_bend=4.0, head_pitch=0.0, pelvis_dx=0.0),
        'up-right':   dict(lean=1.0, chest_bend=-6.0, head_pitch=-14.0, pelvis_dx=-0.02,
                           elbow_R=(-0.6, -0.6, -0.55), elbow_L=(0.1, 0.6, -0.8)),
        'up':         dict(lean=-4.0, chest_bend=-8.0, head_pitch=-20.0, pelvis_dx=-0.19,
                           elbow_R=(-0.35, -0.75, -0.55), elbow_L=(0.2, 0.75, -0.6)),
        'down-right': dict(lean=14.0, chest_bend=12.0, head_pitch=16.0, pelvis_dx=0.0,
                           elbow_R=(-0.7, -0.6, 0.2), elbow_L=(-0.2, 0.7, -0.4)),
        'down':       dict(lean=10.0, chest_bend=10.0, head_pitch=24.0, pelvis_dx=-0.02,
                           elbow_R=(-0.5, -0.8, 0.3), elbow_L=(-0.3, 0.8, 0.2)),
    }[aim_name]


def _with_aim(base, aim_name):
    s = dict(base)
    a = _aim_body(aim_name)
    s['aim'] = AIM[aim_name]
    s['lean'] = s.get('lean', 0.0) + a['lean']
    s['chest_bend'] = s.get('chest_bend', 0.0) + a['chest_bend']
    s['head_pitch'] = s.get('head_pitch', 0.0) + a['head_pitch']
    px, pz = s.get('pelvis', (0.0, 0.84))
    s['pelvis'] = (px + a['pelvis_dx'], pz)
    for k in ('elbow_R', 'elbow_L'):
        if k in a and k not in base:
            s[k] = a[k]
    return s


STAND = dict(pelvis=(-0.01, 0.875),
             feet={'R': (-0.21, -0.15, 0.10, 0.0), 'L': (0.21, 0.13, 0.10, 0.0)})

RUN = {
    # contact: front foot strikes ahead, rear foot drives off the toe
    'contact-a': dict(pelvis=(0.0, 0.85), lean=12.0,
                      feet={'R': (0.40, -0.12, 0.13, -12.0), 'L': (-0.36, 0.12, 0.22, 38.0)}),
    # pass: stance leg under the hips, swing knee driving through high
    'pass-a':    dict(pelvis=(0.0, 0.92), lean=10.0,
                      feet={'R': (0.02, -0.12, 0.10, 0.0), 'L': (-0.06, 0.12, 0.40, 30.0)}),
    # flight: both feet off the deck, legs scissored
    'flight-a':  dict(pelvis=(0.0, 0.95), lean=12.0,
                      feet={'R': (-0.30, -0.12, 0.26, 40.0), 'L': (0.34, 0.12, 0.28, -6.0)}),
}
for k in list(RUN):
    s = dict(RUN[k])
    f = s['feet']
    s['feet'] = {'R': (f['L'][0], -0.12, f['L'][2], f['L'][3]),
                 'L': (f['R'][0], 0.12, f['R'][2], f['R'][3])}
    RUN[k[:-2] + '-b'] = s

AIR = {
    'rise': dict(pelvis=(0.0, 0.99), lean=4.0,
                 feet={'R': (0.16, -0.12, 0.42, -10.0), 'L': (-0.22, 0.12, 0.26, 30.0)}),
    'fall': dict(pelvis=(0.0, 0.99), lean=0.0,
                 feet={'R': (0.20, -0.13, 0.12, 15.0), 'L': (-0.16, 0.13, 0.16, 25.0)}),
}

# Ladder: the right hand keeps the gun on the socket; the left hand climbs.
# The reach goes FORWARD of the chest (x ~0.2) so the far arm shows past the
# body's silhouette instead of hiding behind the helmet.
CLIMB = [
    dict(pelvis=(-0.04, 0.92), lean=4.0,
         feet={'R': (0.10, -0.12, 0.44, 0.0), 'L': (0.06, 0.12, 0.12, 0.0)},
         lhand=('free', (0.24, 0.12, 1.92), (0.3, 0.7, -0.5))),
    dict(pelvis=(-0.04, 0.98), lean=4.0,
         feet={'R': (0.09, -0.12, 0.30, 0.0), 'L': (0.07, 0.12, 0.22, 0.0)},
         lhand=('free', (0.25, 0.12, 1.74), (0.2, 0.7, -0.6))),
    dict(pelvis=(-0.04, 0.92), lean=4.0,
         feet={'R': (0.06, -0.12, 0.12, 0.0), 'L': (0.10, 0.12, 0.44, 0.0)},
         lhand=('free', (0.25, 0.12, 1.58), (0.1, 0.7, -0.7))),
    dict(pelvis=(-0.04, 0.98), lean=4.0,
         feet={'R': (0.07, -0.12, 0.22, 0.0), 'L': (0.09, 0.12, 0.30, 0.0)},
         lhand=('free', (0.25, 0.12, 1.80), (0.2, 0.7, -0.6))),
]

HIT = dict(pelvis=(-0.08, 0.90), lean=-14.0, chest_bend=-8.0, head_pitch=-22.0,
           feet={'R': (-0.24, -0.14, 0.10, 0.0), 'L': (0.10, 0.12, 0.20, -20.0)},
           lhand=('free', (-0.30, 0.30, 1.30), (-0.2, 0.6, -0.7)),
           elbow_R=(-0.7, -0.6, -0.4))

CROUCH = dict(pelvis=(-0.04, 0.46), lean=30.0, chest_bend=10.0, head_pitch=4.0,
              feet={'R': (-0.26, -0.14, 0.10, 30.0), 'L': (0.22, 0.12, 0.10, 0.0)},
              knee_out=0.35, socket=(0.0, CROUCH_MUZZLE_Y),
              elbow_R=(-0.8, -0.6, 0.0), elbow_L=(-0.2, 0.7, -0.5))


def frame_specs():
    """Ordered [(frame_id, state, aim_name, spec)] — the full v2 inventory."""
    out = []
    for aim in ('right', 'up-right', 'up', 'down-right'):
        out.append(('stand-%s' % aim, 'stand', aim, _with_aim(STAND, aim)))
    for phase in ('contact-a', 'pass-a', 'flight-a', 'contact-b', 'pass-b', 'flight-b'):
        for aim in ('right', 'up-right', 'up', 'down-right'):
            out.append(('run-%s-%s' % (phase, aim), 'run', aim, _with_aim(RUN[phase], aim)))
    for phase in ('rise', 'fall'):
        for aim in ('right', 'up-right', 'up', 'down-right', 'down'):
            out.append(('air-%s-%s' % (phase, aim), 'air', aim, _with_aim(AIR[phase], aim)))
    for i, base in enumerate(CLIMB):
        for aim in ('right', 'up-right', 'up', 'down-right', 'down'):
            out.append(('climb-%d-%s' % (i, aim), 'climb', aim, _with_aim(base, aim)))
    out.append(('hit-right', 'hit', 'right', dict(HIT, aim=0.0)))
    out.append(('crouch-right', 'crouch', 'right', dict(CROUCH, aim=0.0)))
    return out
