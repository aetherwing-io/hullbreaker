"""RIG v3.1 palette (T-124 phase 1b): board 01's marine, by family
(decisions entry 28: "board 01's marine is RIG's target").

Every swatch below is a cluster centre MEASURED by
tools/art/rig/board_palette.py --b01 (measure_b01), with the board-01 pixel
nearest that centre: the coordinate a reader can check on the board.
build_rig_v31_preview.py re-measures on every build and fails if a swatch
moved. Nothing is typed by eye except which measured swatch feeds which ramp
step (RAMPS below).

The value structure is the board's: a DARK base (suit, gunmetal, the dark
armour: luma 8-65), warm RUST plates in the mid tones (luma 79-140), and the
LIGHTEST swatches (luma 165-220) reserved for rim / edge highlights and the
visor glint -- never a fill tone (entry 28; v3's khaki fill was the miss).

Ramps have 8 entries per family: tones 0-4 lit -> deep (five fill steps;
v3 had four and read flat), 5 = rim (the warm back/top light), 6 = hot rim /
glint (the strongest rim facing, the visor slit, the muzzle pixel), 7 = kick
(the warm front/under edge light, a mid rust).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import palette as tokens  # noqa: E402  (tools/art/lib/palette.py: the game's tokens)

# name: (hex, family, x, y, what) -- board_palette.measure_b01() cluster centres on board 01
BOARD01 = {
    'rust0':   ('#dba25e', 'rust', 560, 382, 'rust 1/5 (L171): lightest rust -- rim only'),
    'rust1':   ('#bd8148', 'rust', 578, 402, 'rust 2/5 (L140): lit plate'),
    'rust2':   ('#a26635', 'rust', 582, 382, 'rust 3/5 (L114): plate'),
    'rust3':   ('#7e5230', 'rust', 586, 382, 'rust 4/5 (L92): plate shadow'),
    'rust4':   ('#8b3c17', 'rust', 587, 391, 'rust 5/5 (L79): red-rust deep'),
    'dark0':   ('#3a453e', 'dark', 568, 407, 'dark 1/5 (L65): cool gunmetal highlight'),
    'dark1':   ('#7d280e', 'dark', 562, 380, 'dark 2/5 (L63): deep red rust -- UNUSED, LCh hue 44.6 is off every role band'),
    'dark2':   ('#151b17', 'dark', 581, 415, 'dark 3/5 (L25): suit / gunmetal'),
    'dark3':   ('#11120e', 'dark', 574, 410, 'dark 4/5 (L17): suit shadow'),
    'dark4':   ('#060908', 'dark', 570, 397, 'dark 5/5 (L8): near-black'),
    'bright0': ('#e9ddb2', 'bright', 568, 380, 'bright 1/3 (L220): hot rim, visor glint'),
    'bright1': ('#d9a767', 'bright', 588, 410, 'bright 2/3 (L175): orange-gold rim'),
    'bright2': ('#bba27b', 'bright', 569, 378, 'bright 3/3 (L165): pale tan edge (the gun top line)'),
}
UNUSED = ('dark1',)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def B(name):
    if name in UNUSED:
        raise KeyError(name + ' is measured but off-band; not used')
    return hexrgb(BOARD01[name][0])


def T(name):
    return tokens.tok(name)


def shade(rgb, k):
    return tuple(int(round(c * k)) for c in rgb)


# family -> 8-entry ramp: tones 0-4 (lit -> deep), 5 rim, 6 hot rim / glint,
# 7 kick (the front/under edge light: the board's leg rims are mostly mid
# orange, L115-126, not the bright rim)
RAMPS = {
    # warm armour plates: helmet, pauldrons, chest, arms -- rust in every
    # tone (board 01's plates stay rust in shadow; v3.1's first pass sent
    # them to black and read 70% near-black against the board's 49%)
    'plate_w':   [B('rust1'), B('rust2'), B('rust3'), B('rust3'), B('rust4'), B('rust0'), B('bright0'), B('rust1')],
    'plate_w_f': [B('rust2'), B('rust3'), B('rust3'), B('rust4'), B('dark2'), B('rust1'), B('rust0'), B('rust2')],
    # dark armour: thighs, shins, hips, boots, gloves
    'plate_d':   [B('dark0'), B('dark2'), B('dark3'), B('dark4'), B('dark4'), B('bright1'), B('bright0'), B('rust2')],
    'plate_d_f': [B('dark2'), B('dark3'), B('dark4'), B('dark4'), B('dark4'), B('rust2'), B('rust0'), B('rust3')],
    # undersuit at the joints, gloves
    'suit':      [B('dark2'), B('dark3'), B('dark4'), B('dark4'), B('dark4'), B('rust1'), B('bright1'), B('rust2')],
    'suit_f':    [B('dark3'), B('dark4'), B('dark4'), B('dark4'), B('dark4'), B('rust3'), B('rust1'), B('rust3')],
    'visor':     [B('bright0'), B('bright2'), B('dark0'), B('dark4'), B('dark4'), B('bright0'), B('bright0'), B('dark0')],
    'glow':      [B('bright0'), B('rust0'), B('rust2'), B('rust3'), B('rust4'), B('bright0'), B('bright0'), B('rust0')],
    # the gun: gunmetal with the board's pale top line
    'gun_l':     [B('dark0'), B('dark2'), B('dark3'), B('dark4'), B('dark4'), B('bright2'), B('bright0'), B('dark0')],
    'gun_m':     [B('dark0'), B('dark2'), B('dark3'), B('dark4'), B('dark4'), B('bright2'), B('bright0'), B('dark0')],
    'gun_d':     [B('dark2'), B('dark3'), B('dark4'), B('dark4'), B('dark4'), B('bright2'), B('bright0'), B('dark2')],
    'gun_rust':  [B('rust1'), B('rust2'), B('rust3'), B('rust4'), B('dark3'), B('rust0'), B('bright0'), B('rust1')],
    # the salvage pack: board 01 shows a rust/tan block at the marine's back (the pack or the far pauldron)
    'pack':      [B('rust2'), B('rust3'), B('rust4'), B('dark2'), B('dark3'), B('rust0'), B('bright0'), B('rust2')],
}
RIM, HOT, KICK = 5, 6, 7


def accent_ramp(letter):
    """A gun's identity part: the game's own shot colour for that letter
    (CONFIG.palette.shots); R's identity is the board rust (gun_rust)."""
    c = T('shots.' + letter)
    return [c, c, shade(c, 0.72), shade(c, 0.52), shade(c, 0.40), c, B('bright0'), shade(c, 0.72)]


def all_colours(letters='R'):
    out = set()
    for r in RAMPS.values():
        out.update(r)
    for L in letters:
        out.update(accent_ramp(L))
    return sorted(out)


def board_colours():
    return {n: hexrgb(v[0]) for n, v in BOARD01.items() if n not in UNUSED}
