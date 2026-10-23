"""RIG v3's five chassis (R S L H F): which CC0 gun each one is, where the
hands go on it, and which of its parts carry the weapon's identity colour.
Pure data + arithmetic (no bpy); tools/art/rig/render.py builds them.

Every gun is quaternius' "Ultimate Gun Pack" (OpenGameArt copy, CC0 --
tools/art/spike/cc0.json), one FBX each. Coordinates below are the FBX's own
mesh units (x = barrel axis toward the muzzle, z = up), read off side renders
carrying a 0.1-unit grid (the one-off helper is described in
reports/tasks/T-124/build.md); `grip` is the centre of the near fist on the
pistol grip, `support` the centre of the far hand under the fore-end.

THE SIM PLACES EVERY GUN. render.py puts the bore through the hand socket
(0, CONFIG.player.muzzleY) along the aim with the muzzle CONFIG.player.
barrelTiles down it -- where src/sim/player.js spawns the shot -- and scales
each gun so its grip lands `grip_at` tiles along the bore from the socket.
`thick` exaggerates the cross-section about the bore (a 32 px read needs a
chunkier gun than a real one); the barrel length is never exaggerated: the
muzzle stays on the sim's shot origin.

Silhouette and identity at 18-27 px of gun: R the long chunky bullpup block
with a rust lower body, S the long twin tube (barrel over magazine tube)
with an orange pump, L the long thin rifle with a cyan scope, H the tall boxy
SMG with a long pink magazine, F the bulky bullpup with an orange vertical
foregrip. (A stocked M4 was tried for R first: its barrel and handguard came
out under a pixel at 16 px/tile and the gun all but vanished at true size.) The accent colours are the game's own weapon-identity
tokens (src/config.js CONFIG.palette.shots), as the shots and pickups use.
"""

GUN_PACK = 'quaternius-ultimate-gun-pack'
BOOST_RAMP = 0.10

# class per FBX material slot: 'dark' | 'mid' | 'light' | 'accent' | 'rust'
# accent_boxes: (x0, x1, z0, z1) in mesh units -- faces whose centroid lies in
# a box become the identity accent ('rust' for R), whatever their slot.
# boost: (x0, x1, factor) -- the cross-section of the mesh between x0 and x1
# is scaled by `factor` about the bore (ramped over BOOST_RAMP units at both
# ends): a real barrel is thinner than a pixel at these sizes.
GUNS = {
    'R': dict(fbx='Bullpup_3.fbx', grip=(0.00, 0.32), support=(1.30, 0.50), grip_at=0.0, thick=1.40,
              slots={'Black': 'dark', 'MainDark': 'dark', 'Main': 'mid', 'MainLight': 'rust'},
              accent_boxes=[], accent='rust',
              looks='long chunky bullpup block, rust lower body (the model\'s MainLight parts)'),
    'S': dict(fbx='Shotgun_ShortStock.fbx', grip=(0.42, 0.22), support=(3.00, 0.20), grip_at=0.0, thick=2.10,
              slots={'DarkMetal': 'dark', 'Black': 'dark', 'Metal': 'mid', 'Wood': 'rust', 'DarkWood': 'rust'},
              accent_boxes=[(2.55, 3.75, -0.10, 0.36)], accent='S',
              looks='long twin tube (barrel over magazine tube), short rust stock, orange pump'),
    'L': dict(fbx='SniperRifle_4.fbx', grip=(0.08, 0.05), support=(1.70, 0.02), grip_at=0.0, thick=2.20,
              boost=[(2.60, 5.00, 2.0)],
              slots={'DarkMetal': 'mid', 'Black': 'dark', 'Metal': 'light', 'Grey': 'mid', 'Glass': 'accent'},
              accent_boxes=[(-0.05, 2.05, 0.33, 0.80)], accent='L',
              looks='long thin rifle (barrel x2 thick past the fore-end), folding stock, cyan scope'),
    'H': dict(fbx='SubmachineGun_1.fbx', grip=(0.00, 0.32), support=(1.45, 0.52), grip_at=0.0, thick=1.25,
              slots={'DarkMetal': 'dark', 'Black': 'dark', 'Metal': 'mid', 'Grey': 'mid'},
              accent_boxes=[(0.62, 1.10, -0.85, 0.12)], accent='H',
              looks='tall boxy SMG, long pink magazine'),
    'F': dict(fbx='Bullpup_2.fbx', grip=(0.17, 0.36), support=(1.97, 0.40), grip_at=0.0, thick=1.40,
              slots={'MainDark': 'dark', 'Main': 'mid', 'MainLight': 'light'},
              accent_boxes=[(1.84, 2.12, -0.05, 0.74)], accent='F',
              looks='bulky bullpup block, orange vertical foregrip'),
}

# gun class -> zone code in the render's id pass (body zones are 0-2, pack 12)
GUN_ZONE = {'dark': 8, 'mid': 9, 'light': 10, 'accent': 11, 'rust': 13}


def boost_factor(x, boosts):
    """Cross-section scale at mesh x (1.0 outside every boost region)."""
    f = 1.0
    for x0, x1, k in boosts:
        if x0 - BOOST_RAMP < x < x1 + BOOST_RAMP:
            t = min(1.0, (x - (x0 - BOOST_RAMP)) / BOOST_RAMP, ((x1 + BOOST_RAMP) - x) / BOOST_RAMP)
            f *= 1.0 + (k - 1.0) * max(0.0, t)
    return f


def gun_scale(muzzle_x, grip_x, barrel, grip_at):
    """Mesh units -> tiles, so the grip sits `grip_at` tiles along the bore
    from the socket while the muzzle sits `barrel` tiles from it."""
    span = muzzle_x - grip_x
    if span <= 0:
        raise ValueError('grip is not behind the muzzle')
    return (barrel - grip_at) / span
