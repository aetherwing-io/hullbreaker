"""RIG v3 frame inventory and pose library (pure Python + numpy, no bpy).

Every frame the game draws today (src/pure/rig.js + src/render/player.js,
T-103 merged), crossed with every aim the simulation can produce in that
state (src/sim/player.js computeAim: 8-way digital; grounded + down alone
gives down-FACING, airborne / on a ladder it gives straight down), crossed
with the five chassis R S L H F:

  game state (player.js sync)        drawn today                 v3 frames per gun
  ---------------------------------  --------------------------  -------------------------------
  aim-idle (stationary)              aim-right / aim-down-right  stand x {right, up-right, up,
                                     + a rotated gun plane       down-right, down}           =  5
  firing kick (105 ms after a shot)  the gun plane slid 0.095    stand-fire x the same 5 aims:
                                     tiles back, any state       gun slid back, hands follow  =  5
  run (distance-driven cycle)        contact, pass, flight       run-{contact,pass,flight}-{a,b}
                                     (4-beat c-p-f-p)            x 5 grounded aims           = 30
  land-brace (120 ms after landing)  contact                     -> run-contact-a (same aim)
  air-rise / air-fall                air-rise / air-fall         air-{rise,fall} x 5 aims    = 10
  climb (ladder, 4 phases)           climb-0..3                  climb-{0..3} x 5 aims       = 20
  wall contact                       climb-0 / climb-2           -> climb-0 / climb-2
  crouch (?crouch=1, aim levelled)   squashed body               crouch x {right}            =  1
  hit / i-frames                     visibility blink, no frame  (blink stays a draw effect)
  facing -1                          the plane mirrored          the cell mirrored about the
                                                                 sim point (no extra frames)
                                                                                    71 x 5 = 355

Grounded straight DOWN is reachable: aim down in the air, hold strafe, release
down, land -- computeAim keeps the held aim (keys.strafe && v === 0), and the
game then draws a gun pointing at the deck. Without down frames the loader
would have to show down-right while shots leave straight down.
The kick is rendered for the standing frames only; in motion the loader
shows the unkicked frame (phase 2 may add a whole-cell 1 px kick).

The run set has both leading legs (-a / -b) so the cycle can alternate; the
game's 4-beat contact-pass-flight-pass maps onto -a frames alone.

THE GUN IS PLACED FIRST, from the simulation's own numbers (src/config.js
CONFIG.player.muzzleY / barrelTiles, CONFIG.crouch.muzzleY): the bore passes
through the hand socket (0, muzzleY) along the aim and the muzzle sits
barrelTiles down it -- exactly where src/sim/player.js spawns a shot. The body
is then solved around the gun (tools/art/rig/render.py): two-bone IK for the
arms and legs, and a fixed, ordered reach search; a hand that cannot reach its
gun is a build error, never a gap.

Coordinates (shared with every script under tools/art/): X screen-right (the
authored facing, +1), Y into the screen (the orthographic camera sits at -Y),
Z up; 1 unit = 1 game tile; the sim point (feet centre on the deck) at the
origin. The character faces +X, so its RIGHT side faces the camera: the right
arm (gun hand) and right leg are the NEAR limbs.
"""

import math

# The simulation's numbers. tools/art/build_rig_v3.py re-reads them from
# src/config.js and refuses to build if they moved: the art is posed around them.
SIM_MUZZLE_Y = 1.05          # CONFIG.player.muzzleY: the hand socket / level firing line
SIM_BARREL = 0.82            # CONFIG.player.barrelTiles: socket -> muzzle along the aim
CROUCH_MUZZLE_Y = 0.45       # CONFIG.crouch.muzzleY
RECOIL_TILES = 0.095         # src/pure/rig.js RIG_RECOIL_TILES (the presentation kick)

AIM_DEG = {'right': 0.0, 'up-right': 45.0, 'up': 90.0, 'down-right': -45.0, 'down': -90.0}
GROUND_AIMS = ('right', 'up-right', 'up', 'down-right', 'down')
ALL_AIMS = ('right', 'up-right', 'up', 'down-right', 'down')
GUNS = ('R', 'S', 'L', 'H', 'F')

# 8-way sector (src/render/player.js eightWayAimSector order) -> authored aim
# and whether the cell is mirrored. Facing decides vertical aims: the game
# mirrors the whole cell for facing -1 (the gun's underside then faces the
# way RIG faces, as player.js's mirrorY rule does for vertical aims).
SECTOR_TO_AIM = {
    'right': ('right', False), 'up-right': ('up-right', False), 'up': ('up', None),
    'up-left': ('up-right', True), 'left': ('right', True), 'down-left': ('down-right', True),
    'down': ('down', None), 'down-right': ('down-right', False),
}

# ------------------------------------------------------------------ bodies
# A pose spec, all optional except where used:
#   pelvis=(x, y)      pelvis offset (tiles) from the sim point, before the drop
#   drop               extra crouch beyond what the feet need (grounded poses)
#   lift               pelvis raise (airborne poses; their feet hang free)
#   air                True: the feet are not planted, the pelvis is not
#                      lowered to reach them
#   lean               whole-body forward lean (deg, + = toward +x)
#   chest_lean         chest pitch (deg, + = forward)
#   chest_twist        chest yaw about the spine (deg; - turns the far shoulder forward)
#   foot_R / foot_L    (x, y, lift, heel_deg): ankle target on the deck plane,
#                      lift above the rest ankle height, toe-down rotation
#   knee_out           knee pole bias away from the body's mid plane
#   head_turn / head_pitch   (deg; + pitch = look up)
#   free_L             the left (far) hand off the gun: (x, y, z) world target
#                      (a ladder rung); the right hand holds the gun alone
#   socket_y           the hand socket height (crouch); default SIM_MUZZLE_Y
STAND = dict(pelvis=(-0.04, 0.0), drop=0.03, lean=6.0, chest_lean=4.0, chest_twist=-14.0,
             foot_R=(-0.17, -0.10, 0.0, 0.0), foot_L=(0.19, 0.12, 0.0, 0.0), knee_out=0.10,
             head_turn=18.0, head_pitch=-4.0)

# One full stride, six beats: -a = the FAR (left) leg strikes first, -b = the
# NEAR (right) leg. contact: front heel down, rear toe pushing; pass: the
# planted leg under the hips, the other knee driving through; flight: both
# feet off the deck, legs split.
RUN = {
    'contact-a': dict(pelvis=(-0.02, 0.0), drop=0.05, lean=14.0, chest_lean=6.0,
                      foot_L=(0.44, 0.10, 0.0, -6.0), foot_R=(-0.50, -0.07, 0.10, 42.0)),
    'pass-a': dict(pelvis=(-0.02, 0.0), drop=0.10, lean=12.0, chest_lean=6.0,
                   foot_L=(0.00, 0.10, 0.0, 0.0), foot_R=(0.10, -0.07, 0.36, 25.0)),
    'flight-a': dict(pelvis=(-0.02, 0.0), air=True, lift=0.06, lean=14.0, chest_lean=6.0,
                     foot_L=(-0.48, 0.10, 0.40, 55.0), foot_R=(0.30, -0.07, 0.20, -4.0)),
    'contact-b': dict(pelvis=(-0.02, 0.0), drop=0.05, lean=14.0, chest_lean=6.0,
                      foot_R=(0.44, -0.07, 0.0, -6.0), foot_L=(-0.50, 0.10, 0.10, 42.0)),
    'pass-b': dict(pelvis=(-0.02, 0.0), drop=0.10, lean=12.0, chest_lean=6.0,
                   foot_R=(0.00, -0.07, 0.0, 0.0), foot_L=(0.10, 0.10, 0.36, 25.0)),
    'flight-b': dict(pelvis=(-0.02, 0.0), air=True, lift=0.06, lean=14.0, chest_lean=6.0,
                     foot_R=(-0.48, -0.07, 0.40, 55.0), foot_L=(0.30, 0.10, 0.20, -4.0)),
}
for _k in RUN:
    RUN[_k].update(chest_twist=-14.0, knee_out=0.06, head_turn=18.0, head_pitch=-8.0)

AIR = {
    # rise: the near knee tucked high, the far leg trailing
    'rise': dict(pelvis=(-0.06, 0.0), air=True, lift=0.10, lean=10.0, chest_lean=4.0, chest_twist=-14.0,
                 foot_R=(0.10, -0.08, 0.58, -10.0), foot_L=(-0.30, 0.10, 0.36, 35.0), knee_out=0.06,
                 head_turn=18.0, head_pitch=-2.0),
    # fall: legs reaching down for the deck, slightly split
    'fall': dict(pelvis=(-0.04, 0.0), air=True, lift=0.06, lean=4.0, chest_lean=2.0, chest_twist=-14.0,
                 foot_R=(0.16, -0.08, 0.16, 10.0), foot_L=(-0.20, 0.10, 0.24, 25.0), knee_out=0.08,
                 head_turn=18.0, head_pitch=-6.0),
}

# Ladder: the near (right) hand keeps the gun on the socket, the far (left)
# hand climbs -- reaching FORWARD of the chest so it shows past the helmet --
# and the knees alternate on the rungs. Phases follow player.js's
# distance-driven climbFrameIndex 0..3.
CLIMB = [
    dict(free_L=(0.22, 0.14, 1.98), foot_R=(0.10, -0.08, 0.46, 0.0), foot_L=(0.06, 0.10, 0.10, 0.0)),
    dict(free_L=(0.24, 0.14, 1.78), foot_R=(0.09, -0.08, 0.32, 0.0), foot_L=(0.07, 0.10, 0.22, 0.0)),
    dict(free_L=(0.24, 0.14, 1.60), foot_R=(0.06, -0.08, 0.10, 0.0), foot_L=(0.10, 0.10, 0.46, 0.0)),
    dict(free_L=(0.24, 0.14, 1.84), foot_R=(0.07, -0.08, 0.22, 0.0), foot_L=(0.09, 0.10, 0.32, 0.0)),
]
for _c in CLIMB:
    _c.update(pelvis=(-0.06, 0.0), air=True, lift=0.06, lean=4.0, chest_lean=2.0, chest_twist=-10.0,
              knee_out=0.10, head_turn=12.0, head_pitch=6.0)

CROUCH = dict(pelvis=(-0.06, 0.0), drop=0.30, lean=24.0, chest_lean=12.0, chest_twist=-14.0,
              foot_R=(-0.30, -0.10, 0.06, 30.0), foot_L=(0.24, 0.12, 0.0, 0.0), knee_out=0.30,
              head_turn=18.0, head_pitch=4.0, socket_y=CROUCH_MUZZLE_Y)

# Per-aim body attitude, ADDED to the state's spec: the shoulders follow the
# gun (the gun itself is fixed by the sim). dx moves the pelvis so a vertical
# gun stands in front of the chest instead of through the face.
AIM_BODY = {
    'right':      dict(dx=0.00, lean=0.0, chest_lean=0.0, head_pitch=0.0, head_turn=0.0),
    'up-right':   dict(dx=-0.03, lean=-8.0, chest_lean=-10.0, head_pitch=24.0, head_turn=-4.0),
    'up':         dict(dx=-0.14, lean=-12.0, chest_lean=-14.0, head_pitch=34.0, head_turn=-6.0),
    'down-right': dict(dx=0.02, lean=8.0, chest_lean=10.0, head_pitch=-22.0, head_turn=0.0),
    'down':       dict(dx=0.04, lean=6.0, chest_lean=12.0, head_pitch=-30.0, head_turn=0.0),
}


def with_aim(base, aim):
    s = dict(base)
    a = AIM_BODY[aim]
    px, py = s.get('pelvis', (0.0, 0.0))
    s['pelvis'] = (px + a['dx'], py)
    for k in ('lean', 'chest_lean', 'head_pitch', 'head_turn'):
        s[k] = s.get(k, 0.0) + a[k]
    s['aim'] = AIM_DEG[aim]
    return s


def frame_specs():
    """Ordered [(pose_id, state, aim_name, spec)] -- the per-gun inventory.
    The order is the atlas order; it never depends on dict or file order."""
    out = []
    for aim in GROUND_AIMS:
        out.append(('stand-%s' % aim, 'stand', aim, with_aim(STAND, aim)))
    for aim in GROUND_AIMS:
        s = with_aim(STAND, aim)
        s['recoil'] = RECOIL_TILES
        s['lean'] = s.get('lean', 0.0) - 3.0
        out.append(('stand-fire-%s' % aim, 'stand-fire', aim, s))
    for phase in ('contact-a', 'pass-a', 'flight-a', 'contact-b', 'pass-b', 'flight-b'):
        for aim in GROUND_AIMS:
            out.append(('run-%s-%s' % (phase, aim), 'run', aim, with_aim(RUN[phase], aim)))
    for phase in ('rise', 'fall'):
        for aim in ALL_AIMS:
            out.append(('air-%s-%s' % (phase, aim), 'air-' + phase, aim, with_aim(AIR[phase], aim)))
    for i, base in enumerate(CLIMB):
        for aim in ALL_AIMS:
            out.append(('climb-%d-%s' % (i, aim), 'climb', aim, with_aim(base, aim)))
    out.append(('crouch-right', 'crouch', 'right', with_aim(CROUCH, 'right')))
    return out


def frame_keys(guns=GUNS):
    return ['%s:%s' % (g, pid) for g in guns for pid, *_ in frame_specs()]


# How the game's states select frames (for the loader; mirrors the table in
# this module's docstring). A frame key is '<gun>:<pose>-<aim>'. `cycle` lists
# the run beats in stride order with the share of the stride each holds.
# Mirroring: the cell is authored facing +x; the loader mirrors it about the
# sim point when the GUN points left (aim.x < -0.1), and for a vertical aim
# when the sim's facing is -1 -- player.js's own mirrorY rule for the gun.
# Strafe can make RIG travel against the gun (keys.strafe holds the aim):
# play the run cycle backwards then (a backpedal) rather than mirroring away
# from the gun. On a wall the cell also mirrors with the gun.
CLIPS = {
    'stand': {'poses': ['stand'], 'aims': list(GROUND_AIMS)},
    'stand-fire': {'poses': ['stand-fire'], 'aims': list(GROUND_AIMS),
                   'note': 'the 105 ms kick after a shot (src/pure/rig.js RIG_RECOIL_MS) while standing'},
    'run': {'poses': ['run-contact-a', 'run-pass-a', 'run-flight-a', 'run-contact-b', 'run-pass-b', 'run-flight-b'],
            'aims': list(GROUND_AIMS),
            'cycle': [['run-contact-a', 1 / 6], ['run-pass-a', 1 / 6], ['run-flight-a', 1 / 6],
                      ['run-contact-b', 1 / 6], ['run-pass-b', 1 / 6], ['run-flight-b', 1 / 6]],
            'todayFourBeat': ['run-contact-a', 'run-pass-a', 'run-flight-a', 'run-pass-a']},
    'land-brace': {'poses': ['run-contact-a'], 'aims': list(GROUND_AIMS)},
    'air-rise': {'poses': ['air-rise'], 'aims': list(ALL_AIMS)},
    'air-fall': {'poses': ['air-fall'], 'aims': list(ALL_AIMS)},
    'climb': {'poses': ['climb-0', 'climb-1', 'climb-2', 'climb-3'], 'aims': list(ALL_AIMS)},
    'wall': {'poses': ['climb-0', 'climb-2'], 'aims': list(ALL_AIMS),
             'note': 'player.js: climb-2 when traversalSide < 0, else climb-0'},
    'crouch': {'poses': ['crouch'], 'aims': ['right'], 'socketY': CROUCH_MUZZLE_Y},
}


def sim_muzzle(aim_deg, socket_y=SIM_MUZZLE_Y):
    """The simulation's shot origin in tiles from the sim point (src/sim/player.js)."""
    a = math.radians(aim_deg)
    return (math.cos(a) * SIM_BARREL, socket_y + math.sin(a) * SIM_BARREL)
