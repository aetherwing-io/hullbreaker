"""RIG, low-poly, built from primitives in code (no downloaded models).

Who: a human-scale salvage marine (docs/STORY.md: "capable, physically
fearless, equipped to work on the hull - not a chosen one or super-soldier").
Look sources: boards 01/13 (side-on marine, big helmet + visor, chunky plates,
pack), board 06 (the warm off-white RIG silhouette), and the shipped tokens
(src/render/palette.js: player / playerMid / playerDark, the gun-gold visor as
the ONE accent, entry 17's "3-4 value steps, one accent").

Rest pose: standing, facing +X, right side toward the camera (-Y). Units are
tiles; the helmet top sits at ~1.98 so RIG matches the shipped visual height
(src/pure/rig.js RIG_BODY_VISUAL_H = 2.0). At ~15 px/tile that is a 30 px
figure, so every part is sized to survive 1x: big helmet (~5 px), pauldrons,
pack bulge, dark joints between light plates.

Material classes (tools/art/lib/palette.py RIG_CLASSES):
  armor     light plates           armor_dk  pack / belt / jaw (mid)
  suit      dark undersuit, gloves, boots
  visor     the one accent (gun gold)
  gunmetal / gunlight / id_<L> / muzzle   weapons
"""

import numpy as np

from kin import v3

# --------------------------------------------------------------------------
# Skeleton (rest frames; head, tail, z-hint). Limb bones run joint -> joint.
# Arm Z points at the elbow's bend side (back), leg Z at the knee (forward).
# --------------------------------------------------------------------------

SHOULDER_Y = 0.235
HIP_Y = 0.11

BONES = [
    ('root',  None,    (0, 0, 0.00), (0, 0, 0.20), (1, 0, 0)),
    ('hips',  'root',  (0, 0, 0.92), (0, 0, 1.08), (1, 0, 0)),
    ('chest', 'hips',  (0, 0, 1.08), (0, 0, 1.52), (1, 0, 0)),
    ('neck',  'chest', (0, 0, 1.52), (0, 0, 1.62), (1, 0, 0)),
    ('head',  'neck',  (0, 0, 1.62), (0, 0, 1.99), (1, 0, 0)),
]
for side, sy in (('R', -1), ('L', 1)):
    y_s = sy * SHOULDER_Y
    y_h = sy * HIP_Y
    BONES += [
        ('upperarm.' + side, 'chest', (0, y_s, 1.47), (0, y_s, 1.13), (-1, 0, 0)),
        ('forearm.' + side, 'upperarm.' + side, (0, y_s, 1.13), (0, y_s, 0.83), (-1, 0, 0)),
        ('hand.' + side, 'forearm.' + side, (0, y_s, 0.83), (0, y_s, 0.75), (1, 0, 0)),
        ('thigh.' + side, 'hips', (0, y_h, 0.92), (0, y_h, 0.50), (1, 0, 0)),
        ('shin.' + side, 'thigh.' + side, (0, y_h, 0.50), (0, y_h, 0.10), (1, 0, 0)),
        ('foot.' + side, 'shin.' + side, (0, y_h, 0.10), (0.15, y_h, 0.04), (0, 0, 1)),
    ]

UPPER_ARM = 0.34
FOREARM = 0.30
THIGH = 0.42
SHIN = 0.40


def body_parts():
    """{bone_name: [(kind, args, kwargs), ...]} in rest-pose world coords."""
    P = {}
    P['head'] = [
        ('blob', ((0.005, 0, 1.795), (0.165, 0.152, 0.178), 'armor'), {'seg': 8, 'rings': 6}),
        ('box', ((0.0, 0, 1.945), (0.22, 0.17, 0.05), 'armor'), {'chamfer': 0.3}),
        ('box', ((0.112, 0, 1.80), (0.105, 0.27, 0.085), 'visor'), {'chamfer': 0.35}),
        ('box', ((0.105, 0, 1.685), (0.12, 0.17, 0.085), 'armor_dk'), {'chamfer': 0.3}),
        ('cyl', ((-0.01, -0.150, 1.775), (-0.01, -0.178, 1.775), 0.062, 'suit'), {'sides': 8}),
        ('cyl', ((-0.01, 0.150, 1.775), (-0.01, 0.178, 1.775), 0.062, 'suit'), {'sides': 8}),
    ]
    P['neck'] = [
        ('cyl', ((0, 0, 1.51), (0, 0, 1.65), 0.075, 'suit'), {'sides': 8}),
    ]
    P['chest'] = [
        ('box', ((0.0, 0, 1.30), (0.26, 0.33, 0.42), 'suit'), {'chamfer': 0.2}),
        ('box', ((0.065, 0, 1.385), (0.20, 0.41, 0.25), 'armor'), {'chamfer': 0.3, 'taper': (0.9, 0.86)}),
        ('box', ((-0.005, 0, 1.52), (0.22, 0.30, 0.06), 'armor_dk'), {'chamfer': 0.3}),
        ('box', ((-0.215, 0, 1.33), (0.19, 0.33, 0.40), 'armor_dk'), {'chamfer': 0.25}),
        ('box', ((-0.235, 0, 1.56), (0.13, 0.27, 0.07), 'suit'), {'chamfer': 0.3}),
        ('cyl', ((-0.315, -0.10, 1.19), (-0.315, 0.10, 1.19), 0.045, 'suit'), {'sides': 6}),
    ]
    P['hips'] = [
        ('box', ((0.0, 0, 0.985), (0.24, 0.30, 0.17), 'suit'), {'chamfer': 0.2}),
        ('box', ((0.008, 0, 1.065), (0.27, 0.335, 0.06), 'armor_dk'), {'chamfer': 0.3}),
        ('box', ((0.142, 0, 1.045), (0.035, 0.10, 0.065), 'armor'), {}),
    ]
    for side, sy in (('R', -1), ('L', 1)):
        ys = sy * SHOULDER_Y
        yh = sy * HIP_Y
        P['upperarm.' + side] = [
            ('box', ((-0.005, ys + sy * 0.03, 1.49), (0.235, 0.15, 0.15), 'armor'), {'chamfer': 0.35}),
            ('box', ((0, ys, 1.30), (0.105, 0.10, 0.28), 'suit'), {'chamfer': 0.25}),
        ]
        P['forearm.' + side] = [
            ('blob', ((0, ys, 1.13), (0.062, 0.062, 0.062), 'suit'), {'seg': 6, 'rings': 4}),
            ('box', ((0, ys, 0.965), (0.125, 0.125, 0.25), 'armor'), {'chamfer': 0.3}),
        ]
        P['hand.' + side] = [
            ('box', ((0, ys, 0.795), (0.095, 0.085, 0.10), 'suit'), {'chamfer': 0.25}),
        ]
        P['thigh.' + side] = [
            ('box', ((0, yh, 0.71), (0.16, 0.15, 0.40), 'suit'), {'chamfer': 0.25, 'taper': (0.9, 0.9)}),
            ('box', ((0.072, yh, 0.50), (0.095, 0.14, 0.115), 'armor'), {'chamfer': 0.35}),
        ]
        P['shin.' + side] = [
            ('box', ((0.008, yh, 0.31), (0.145, 0.135, 0.34), 'armor'), {'chamfer': 0.25, 'taper': (1.1, 1.05)}),
        ]
        P['foot.' + side] = [
            ('box', ((0.035, yh, 0.06), (0.27, 0.15, 0.12), 'suit'), {'chamfer': 0.2}),
            ('box', ((0.14, yh, 0.052), (0.075, 0.16, 0.105), 'armor_dk'), {'chamfer': 0.3}),
        ]
    return P


# --------------------------------------------------------------------------
# Guns. Gun-local frame: origin on the bore axis at the sim's hand socket,
# +X down the barrel, +Z the top of the gun, -Y the side facing the viewer.
# Every chassis ends exactly at MUZZLE_X so the drawn bore can land on the
# simulation's shot origin (CONFIG.player.barrelTiles = 0.82).
# --------------------------------------------------------------------------

MUZZLE_X = 0.82          # src/config.js CONFIG.player.barrelTiles (asserted by the build)

# Shared hold points (gun-local). The right palm wraps the pistol grip, which
# sits a little AHEAD of the socket so the gun's mass reads in front of RIG's
# hip at 1x instead of disappearing against it; the left hand supports the
# foregrip from underneath. Guns are deliberately chunky (receivers ~0.16
# tiles = 3 px at FAR): at 18 px/tile a realistic 0.07-tile barrel is a 1 px
# hair that the eye cannot attach to a hand.
GRIP = v3(0.085, -0.035, -0.13)
WRIST_FROM_GRIP = v3(-0.075, 0.0, -0.035)


def _common_grip(cls='gunmetal'):
    return [
        ('prism', ([(0.125, -0.06), (0.055, -0.06), (0.025, -0.215), (0.095, -0.215)], -0.034, 0.034, cls), {}),
        ('box', ((0.16, 0, -0.095), (0.07, 0.022, 0.05), cls), {}),
    ]


def _stock(x0, cls='gunmetal', top=0.05, bot=-0.075):
    return ('prism', ([(x0, top), (x0 - 0.20, top - 0.015), (x0 - 0.22, bot - 0.02), (x0 - 0.10, bot - 0.025),
                       (x0, bot)], -0.04, 0.04, cls), {})


def gun_parts():
    """{letter: {'parts': [...], 'foregrip': v3}} in gun-local coords."""
    G = {}
    # R  RIVET: heavy rifle, drum feeder, hard muzzle brake.
    G['R'] = {'foregrip': v3(0.42, 0.035, -0.085), 'parts': _common_grip() + [
        ('box', ((0.12, 0, 0.005), (0.40, 0.10, 0.16), 'gunmetal'), {'chamfer': 0.2}),
        _stock(-0.08),
        ('box', ((0.43, 0, 0.0), (0.22, 0.11, 0.125), 'gunlight'), {'chamfer': 0.25}),
        ('cyl', ((0.53, 0, 0.0), (0.77, 0, 0.0), 0.046, 'gunmetal'), {'sides': 6}),
        ('cyl', ((0.215, -0.085, -0.10), (0.215, 0.085, -0.10), 0.088, 'id_R'), {'sides': 8}),
        ('box', ((0.10, 0, 0.105), (0.18, 0.05, 0.05), 'gunmetal'), {}),
        ('box', ((0.79, 0, 0.0), (0.06, 0.115, 0.115), 'muzzle'), {}),
    ]}
    # S  SPREAD: twin blunt bores, broad receiver, orange side plate.
    G['S'] = {'foregrip': v3(0.44, 0.035, -0.12), 'parts': _common_grip() + [
        ('box', ((0.12, 0, 0.0), (0.40, 0.13, 0.20), 'gunmetal'), {'chamfer': 0.2}),
        ('box', ((0.14, -0.071, 0.0), (0.30, 0.012, 0.15), 'id_S'), {}),
        _stock(-0.08, top=0.07, bot=-0.09),
        ('cyl', ((0.32, 0, 0.052), (0.775, 0, 0.052), 0.048, 'gunmetal'), {'sides': 6}),
        ('cyl', ((0.32, 0, -0.052), (0.775, 0, -0.052), 0.048, 'gunmetal'), {'sides': 6}),
        ('box', ((0.56, 0, 0.0), (0.06, 0.13, 0.22), 'gunlight'), {}),
        ('box', ((0.795, 0, 0.0), (0.05, 0.13, 0.22), 'id_S'), {}),
    ]}
    # L  LASER (sunspear): compact breech, long cyan crystal rail, fork tip.
    G['L'] = {'foregrip': v3(0.40, 0.035, -0.085), 'parts': _common_grip() + [
        ('box', ((0.08, 0, 0.0), (0.34, 0.10, 0.15), 'gunmetal'), {'chamfer': 0.2}),
        _stock(-0.09),
        ('cyl', ((0.24, 0, 0.0), (0.68, 0, 0.0), 0.046, 'id_L'), {'sides': 6}),
        ('box', ((0.32, 0, 0.0), (0.05, 0.115, 0.125), 'gunlight'), {}),
        ('box', ((0.54, 0, 0.0), (0.045, 0.115, 0.12), 'gunlight'), {}),
        ('box', ((0.73, 0, 0.062), (0.18, 0.05, 0.04), 'gunmetal'), {}),
        ('box', ((0.73, 0, -0.062), (0.18, 0.05, 0.04), 'gunmetal'), {}),
        ('box', ((0.7975, 0, 0.0), (0.045, 0.05, 0.05), 'id_L'), {}),
    ]}
    # H  HOMING (hunger engine): fat launcher tube, magenta seeker core, fins.
    G['H'] = {'foregrip': v3(0.42, 0.035, -0.125), 'parts': _common_grip() + [
        ('cyl', ((-0.14, 0, 0.0), (0.74, 0, 0.0), 0.10, 'gunmetal'), {'sides': 8}),
        ('box', ((0.36, -0.088, 0.0), (0.28, 0.02, 0.11), 'id_H'), {}),
        ('prism', ([(0.10, 0.09), (0.26, 0.09), (0.15, 0.20)], -0.016, 0.016, 'gunlight'), {}),
        ('prism', ([(0.10, -0.09), (0.15, -0.20), (0.26, -0.09)], -0.016, 0.016, 'gunlight'), {}),
        ('cyl', ((0.74, 0, 0.0), (0.82, 0, 0.0), 0.112, 'id_H'), {'sides': 8}),
    ]}
    # F  FLAME (cindermouth): orange fuel tank, pipe, flared nozzle, pilot.
    G['F'] = {'foregrip': v3(0.42, 0.035, -0.085), 'parts': _common_grip() + [
        ('box', ((0.10, 0, 0.0), (0.36, 0.11, 0.15), 'gunmetal'), {'chamfer': 0.2}),
        ('cyl', ((-0.06, 0, 0.125), (0.38, 0, 0.125), 0.08, 'id_F'), {'sides': 8}),
        _stock(-0.08),
        ('cyl', ((0.28, 0, 0.0), (0.67, 0, 0.0), 0.05, 'gunmetal'), {'sides': 6}),
        ('cyl', ((0.66, 0, 0.0), (0.80, 0, 0.0), 0.065, 'gunlight'), {'sides': 8, 'r1': 0.105}),
        ('box', ((0.81, 0, 0.0), (0.02, 0.19, 0.19), 'id_F'), {}),
        ('box', ((0.74, -0.03, -0.11), (0.06, 0.03, 0.035), 'muzzle'), {}),
    ]}
    return G


def build_parts(builder, parts, m=None):
    for kind, args, kw in parts:
        if kind == 'box':
            c, s, cls = args
            builder.box(c, s, cls, m=m, **kw)
        elif kind == 'blob':
            c, r, cls = args
            builder.blob(c, r, cls, m=m, **kw)
        elif kind == 'cyl':
            p0, p1, r, cls = args
            builder.cylinder(p0, p1, r, cls, m=m, **kw)
        elif kind == 'prism':
            prof, y0, y1, cls = args
            builder.prism(prof, y0, y1, cls, m=m)
        elif kind == 'poly':
            verts, cls = args
            builder._poly(verts, [list(range(len(verts)))], cls, m)
        else:
            raise ValueError(kind)


def gun_extent_x(parts):
    """Max local x any part reaches (the drawn bore end), for the build assert."""
    mx = -1e9
    for kind, args, kw in parts:
        if kind == 'box':
            c, s, _ = args
            mx = max(mx, c[0] + s[0] / 2)
        elif kind == 'cyl':
            p0, p1, r, _ = args
            mx = max(mx, p0[0], p1[0])
        elif kind == 'prism':
            prof = args[0]
            mx = max(mx, max(x for x, _ in prof))
        elif kind == 'blob':
            c, r, _ = args
            mx = max(mx, c[0] + r[0])
    return mx


__all__ = ['BONES', 'body_parts', 'gun_parts', 'build_parts', 'GRIP', 'WRIST_FROM_GRIP',
           'MUZZLE_X', 'UPPER_ARM', 'FOREARM', 'THIGH', 'SHIN', 'SHOULDER_Y', 'HIP_Y',
           'gun_extent_x', 'np']
