"""The maintenance wasp, low-poly, built from primitives in code.

Look sources: board 01 / 07 wasps (segmented acid-green abdomen over a dark
chassis, blade wings, glowing sting), the shipped neutral wasp
(assets/generated/sprites/wasp-pixel-v1: dark body mass, acid armour, one
bright eye) and the acid-green ecology tokens in src/render/palette.js.

Authored facing +X (head to the right); origin = the thorax "reactor", the
point the sim row (e.x, e.y) stands for. Units are tiles. Nose to sting is
~1.45 tiles, matching the shipped presentation (one-tile primitive envelope
x SPRITE_BODY_SCALE.wasp 1.55, src/render/hostiles.js).
"""

from kin import v3

# bones: (name, parent, head, tail, z-hint)
BONES = [
    ('root',   None,     (0.00, 0, 0.00), (0.10, 0, 0.00), (0, 0, 1)),
    ('thorax', 'root',   (-0.10, 0, 0.00), (0.16, 0, 0.02), (0, 0, 1)),
    ('head',   'thorax', (0.16, 0, 0.02), (0.46, 0, 0.00), (0, 0, 1)),
    ('abd1',   'thorax', (-0.12, 0, 0.00), (-0.40, 0, -0.06), (0, 0, 1)),
    ('abd2',   'abd1',   (-0.40, 0, -0.06), (-0.68, 0, -0.16), (0, 0, 1)),
    ('sting',  'abd2',   (-0.68, 0, -0.16), (-0.90, 0, -0.27), (0, 0, 1)),
]
WING_ROOTS = {}
for side, sy in (('R', -1), ('L', 1)):
    WING_ROOTS['wingF.' + side] = (0.04, sy * 0.09, 0.12)
    WING_ROOTS['wingB.' + side] = (-0.07, sy * 0.09, 0.11)
    BONES += [
        ('wingF.' + side, 'thorax', WING_ROOTS['wingF.' + side], (0.04, sy * 0.70, 0.12), (0, 0, 1)),
        ('wingB.' + side, 'thorax', WING_ROOTS['wingB.' + side], (-0.07, sy * 0.56, 0.11), (0, 0, 1)),
    ]

STING_TIP = v3(-0.90, 0, -0.27)
EYE = v3(0.40, -0.075, 0.03)


def _wing(root, length, chord, sy, sweep):
    """Flat blade in rest pose: spans out along +-Y, swept back at the tip."""
    rx, ry, rz = root
    return ('poly', ([(rx + 0.05, ry, rz), (rx - chord, ry, rz),
                      (rx - chord - sweep, ry + sy * length * 0.92, rz),
                      (rx - sweep * 0.55, ry + sy * length, rz)], 'wing'), {})


def _rings(p0, p1, n, r_core, r_ring, ring_frac=0.62):
    """A segment: dark core with n acid shell rings (wasp stripes)."""
    import numpy as np
    a, b = np.array(p0, dtype=float), np.array(p1, dtype=float)
    out = [('cyl', (tuple(a), tuple(b), r_core, 'chassis'), {'sides': 8})]
    for i in range(n):
        t0 = (i + (1 - ring_frac) / 2) / n
        t1 = (i + (1 + ring_frac) / 2) / n
        out.append(('cyl', (tuple(a + (b - a) * t0), tuple(a + (b - a) * t1), r_ring, 'shell'), {'sides': 8}))
    return out


def parts():
    P = {}
    P['thorax'] = [
        ('blob', ((0.02, 0, 0.0), (0.16, 0.12, 0.14), 'chassis'), {'seg': 8, 'rings': 5}),
        ('box', ((0.03, 0, 0.075), (0.27, 0.21, 0.13), 'shell'), {'chamfer': 0.35}),
        ('box', ((0.03, -0.095, -0.005), (0.21, 0.04, 0.15), 'shell'), {'chamfer': 0.3}),
        # legs: dark struts under the thorax, near side
        ('cyl', ((0.10, -0.07, -0.09), (0.18, -0.10, -0.29), 0.026, 'chassis'), {'sides': 4}),
        ('cyl', ((0.18, -0.10, -0.29), (0.27, -0.07, -0.35), 0.022, 'chassis'), {'sides': 4}),
        ('cyl', ((-0.05, -0.07, -0.10), (-0.10, -0.10, -0.31), 0.026, 'chassis'), {'sides': 4}),
        ('cyl', ((-0.10, -0.10, -0.31), (-0.03, -0.08, -0.40), 0.022, 'chassis'), {'sides': 4}),
    ]
    P['head'] = [
        ('blob', ((0.30, 0, 0.0), (0.165, 0.14, 0.14), 'shell'), {'seg': 8, 'rings': 5}),
        ('box', ((0.39, -0.08, 0.035), (0.10, 0.06, 0.08), 'eye'), {'chamfer': 0.3}),
        ('box', ((0.39, 0.08, 0.035), (0.10, 0.06, 0.08), 'eye'), {'chamfer': 0.3}),
        ('prism', ([(0.40, -0.04), (0.54, -0.11), (0.41, -0.14)], -0.075, -0.025, 'chassis'), {}),
        ('prism', ([(0.40, -0.04), (0.54, -0.11), (0.41, -0.14)], 0.025, 0.075, 'chassis'), {}),
    ]
    P['abd1'] = _rings((-0.14, 0, -0.01), (-0.40, 0, -0.06), 2, 0.115, 0.15)
    P['abd2'] = _rings((-0.40, 0, -0.06), (-0.68, 0, -0.16), 2, 0.10, 0.13)
    P['sting'] = [
        ('cyl', ((-0.66, 0, -0.155), (-0.90, 0, -0.27), 0.065, 'sting'), {'sides': 6, 'r1': 0.012}),
    ]
    for side, sy in (('R', -1), ('L', 1)):
        P['wingF.' + side] = [_wing(WING_ROOTS['wingF.' + side], 0.62, 0.12, sy, 0.10)]
        P['wingB.' + side] = [_wing(WING_ROOTS['wingB.' + side], 0.48, 0.10, sy, 0.08)]
    return P


# Frames: what the game shows for the neutral wasp today (sprite-table.js: one
# idle card, a four-phase flight loop, a dive card; hits flash the material)
# plus a dive-lock tell and a hit recoil. Spec: pitch (+ = nose down), bob,
# curl of the three abdomen joints (+ = under), head pitch, wing (flap, sweep)
# per pair, optional yaw override, dive = wear the committed-dive palette.
FRAMES = [
    ('idle',      dict(pitch=0.0, bob=0.0, curl=(4, 4, 0), wings={'F': (32, 10), 'B': (14, 14)})),
    ('cruise-0',  dict(pitch=-2.0, bob=0.03, curl=(4, 4, 0), wings={'F': (84, 6), 'B': (66, 10)})),
    ('cruise-1',  dict(pitch=0.0, bob=0.01, curl=(5, 5, 0), wings={'F': (30, 10), 'B': (48, 12)})),
    ('cruise-2',  dict(pitch=2.0, bob=-0.03, curl=(6, 6, 2), wings={'F': (-38, 14), 'B': (-20, 16)})),
    ('cruise-3',  dict(pitch=0.0, bob=-0.01, curl=(5, 5, 0), wings={'F': (18, 12), 'B': (-34, 16)})),
    ('dive-lock', dict(pitch=-18.0, bob=0.02, curl=(26, 24, 20), head=10.0,
                       wings={'F': (74, 26), 'B': (56, 30)}, dive=True)),
    ('dive-0',    dict(pitch=30.0, bob=0.0, curl=(-4, -4, 0), head=-6.0,
                       wings={'F': (14, 40), 'B': (2, 44)}, dive=True)),
    ('dive-1',    dict(pitch=30.0, bob=0.0, curl=(-4, -4, 0), head=-6.0,
                       wings={'F': (-12, 44), 'B': (-22, 46)}, dive=True)),
    ('hit',       dict(pitch=-24.0, bob=0.05, curl=(-14, -16, -10), head=-14.0, yaw=36.0,
                       wings={'F': (98, -6), 'B': (-36, 30)})),
]
