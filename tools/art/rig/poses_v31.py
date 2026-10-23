"""RIG v3.1 preview poses (T-124 phase 1b; pure Python, no bpy): the rifle
SHOULDERED with a forward combat lean (board 01's marine, decisions entry 28),
gun R only, about six poses plus the run cycle -- the full inventory waits for
the operator's yes on the look.

THE SIM STILL FIXES THE GUN. The bore passes through the hand socket
(0, socketY) along the aim and the muzzle sits barrelTiles (0.82) down it.
A shouldered rifle pivots on the shoulder, so the butt sits on the bore line
BUTT_BACK tiles behind the socket and the body is solved so its near shoulder
pocket lands on the butt (tools/art/rig/render.py solve_shoulder). The gun is
therefore barrelTiles + BUTT_BACK = 0.92 tiles long; a longer rifle would
need a longer barrelTiles (a sim change) or a body drawn behind its hitbox.

Two holds, shown side by side for the operator (entry 28):
  A  today's bore: socketY = CONFIG.player.muzzleY (1.05 tiles). The body
     crouches and leans until its shoulder pocket is down at the bore.
  B  a RENDER-ONLY MOCK with the bore at the shoulder: socketY = B_SOCKET_Y,
     the pocket height of the B stance with the legs nearly straight.
     Raising the bore is a sim change (src/config.js muzzleY, the shot origin)
     and is NOT made here; B's anchors therefore do not match today's sim.

Pose spec keys (render.py solve_shoulder):
  lean, chest_lean, chest_twist, head_pitch, head_turn, knee_out  as in poses.py
  feet  'deck': ankle targets (dx from the solved pelvis, depth y, lift, heel)
        'air' : ankle targets relative to each hip joint (dx, dy, dz, heel)
  recoil  presentation kick, tiles (the gun and hands slide back; the anchor
          check moves its drawn-muzzle anchor with it)
"""

import math

SIM_MUZZLE_Y = 1.05          # CONFIG.player.muzzleY (re-read by the preview build)
SIM_BARREL = 0.82            # CONFIG.player.barrelTiles
RECOIL_TILES = 0.095         # src/pure/rig.js RIG_RECOIL_TILES
BUTT_BACK = 0.10             # the butt behind the socket along the bore (tiles)
B_SOCKET_Y = 1.28             # hold B (mock): the highest bore (0.04 steps down from 1.40) at which every preview pose solves feet-planted; the run contact stride binds
POCKET = (0.035, -0.055)     # shoulder pocket from the near shoulder joint: (forward, down) tiles, world

HOLDS = {
    'A': {'socketY': SIM_MUZZLE_Y, 'mock': False,
          'what': "today's bore (CONFIG.player.muzzleY 1.05): the body crouches and leans to bring the shoulder down"},
    'B': {'socketY': B_SOCKET_Y, 'mock': True,
          'what': 'RENDER-ONLY MOCK: the bore raised to the shoulder (%.2f tiles); a sim change, not made' % B_SOCKET_Y},
}

AIM_DEG = {'right': 0.0, 'up-right': 45.0, 'up': 90.0, 'down-right': -45.0, 'down': -90.0}

# per-aim attitude ADDED to the state's spec: the shoulders follow the gun
AIM_BODY = {
    'right':    dict(lean=0.0, chest_lean=0.0, head_pitch=0.0, head_turn=0.0),
    'up-right': dict(lean=-14.0, chest_lean=-12.0, head_pitch=30.0, head_turn=-4.0),
    'up':       dict(lean=-22.0, chest_lean=-16.0, head_pitch=46.0, head_turn=-8.0),
}

STAND = dict(lean=16.0, chest_lean=8.0, chest_twist=-22.0, head_pitch=-14.0, head_turn=10.0, knee_out=0.10,
             feet={'R': (-0.24, -0.10, 0.0, 0.0), 'L': (0.22, 0.12, 0.0, 0.0)})

# one stride, six beats; -a = the far (left) leg strikes. The gun cannot bob
# (the sim fixes it), so the legs absorb the stride and the lean breathes.
RUN = {
    'contact-a': dict(lean=22.0, feet={'L': (0.40, 0.10, 0.0, -6.0), 'R': (-0.46, -0.07, 0.10, 42.0)}),
    'pass-a':    dict(lean=19.0, feet={'L': (0.02, 0.10, 0.0, 0.0), 'R': (0.08, -0.07, 0.30, 25.0)}),
    'flight-a':  dict(lean=24.0, air=True, feet={'L': (-0.36, 0.0, -0.42, 55.0), 'R': (0.30, 0.0, -0.58, -4.0)}),
    'contact-b': dict(lean=22.0, feet={'R': (0.40, -0.07, 0.0, -6.0), 'L': (-0.46, 0.10, 0.10, 42.0)}),
    'pass-b':    dict(lean=19.0, feet={'R': (0.02, -0.07, 0.0, 0.0), 'L': (0.08, 0.10, 0.30, 25.0)}),
    'flight-b':  dict(lean=24.0, air=True, feet={'R': (-0.36, 0.0, -0.42, 55.0), 'L': (0.30, 0.0, -0.58, -4.0)}),
}
for _k in RUN:
    RUN[_k].update(chest_lean=8.0, chest_twist=-22.0, head_pitch=-16.0, head_turn=10.0, knee_out=0.06)

# the jump: board 01's pose -- knees tucked, the near shin forward, the far leg trailing
AIR_RISE = dict(lean=14.0, chest_lean=6.0, chest_twist=-22.0, head_pitch=-12.0, head_turn=10.0, knee_out=0.10, air=True,
                feet={'R': (0.28, 0.0, -0.34, -10.0), 'L': (-0.44, 0.0, -0.42, 50.0)})


def with_aim(base, aim, extra=None):
    s = dict(base)
    s['feet'] = dict(base['feet'])
    for k, v in AIM_BODY[aim].items():
        s[k] = s.get(k, 0.0) + v
    s['aim'] = AIM_DEG[aim]
    s['hold'] = 'shoulder'
    if extra:
        s.update(extra)
    return s


def preview_specs():
    """[(pose_id, state, aim, spec)] -- the phase-1b preview set, fixed order."""
    out = [('stand-right', 'stand', 'right', with_aim(STAND, 'right')),
           ('stand-fire-right', 'stand-fire', 'right', with_aim(STAND, 'right', {'recoil': RECOIL_TILES})),
           ('stand-up-right', 'stand', 'up-right', with_aim(STAND, 'up-right')),
           ('stand-up', 'stand', 'up', with_aim(STAND, 'up')),
           ('air-rise-right', 'air-rise', 'right', with_aim(AIR_RISE, 'right'))]
    for beat in ('contact-a', 'pass-a', 'flight-a', 'contact-b', 'pass-b', 'flight-b'):
        b = dict(RUN[beat])
        out.append(('run-%s-right' % beat, 'run', 'right', with_aim(b, 'right')))
    return out


def sim_muzzle(aim_deg, socket_y):
    a = math.radians(aim_deg)
    return (math.cos(a) * SIM_BARREL, socket_y + math.sin(a) * SIM_BARREL)
