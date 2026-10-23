"""RIG v3 palette: the concept boards' warm khaki/rust (decisions entry 27),
MEASURED by tools/art/rig/board_palette.py, plus the game's own accent tokens.

Every board swatch below carries the board pixel nearest its cluster centre
(the coordinate a reader can check on the board) and is re-measured by
build_rig_v3.py on every build: a swatch that no longer equals its board
cluster fails the build. Token colours are parsed from src/render/palette.js
and src/config.js by tools/art/lib/palette.py (no hex re-typed here).

Ramps are 6 entries per material family: tone 0 lit, 1 mid, 2 shadow, 3 deep,
4 rim (the game's cool rim light), 5 glint (specular / muzzle).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import palette as tokens  # noqa: E402  (tools/art/lib/palette.py: the game's tokens)

# name: (hex, board, x, y, what) -- board_palette.py cluster centres
BOARD = {
    # board 13: RIG's khaki armour, six panels pooled (k = 6), lightest first
    'khaki0': ('#ecdfb9', '13', 819, 677, 'b13 cluster 1/6: lit armour (L222)'),
    'khaki1': ('#cdb98f', '13', 1287, 235, 'b13 cluster 2/6: khaki (L186)'),
    'khaki2': ('#ae9973', '13', 810, 704, 'b13 cluster 3/6: khaki mid (L155)'),
    'khaki3': ('#877e62', '13', 1283, 228, 'b13 cluster 4/6: khaki shadow (L125)'),
    'olive4': ('#535649', '13', 1410, 689, 'b13 cluster 5/6: olive-grey deep (L84)'),
    'ink':    ('#101718', '13', 338, 239, 'b13 cluster 6/6: near-black joints / outline (L21)'),
    # board 01: RIG's dark gunmetal (k = 8; the darks only are used)
    'olive5': ('#4b4f43', '01', 570, 408, 'b01 cluster 3/8: olive grey (L77)'),
    'dark6':  ('#171e19', '01', 573, 395, 'b01 cluster 4/8: gunmetal black (L27)'),
    # rust: the saturated warm pixels inside every RIG mask (k = 4), lightest first
    'rust0':  ('#e1a761', '01', 561, 401, 'rust rule 1/4 (L176)'),
    'rust1':  ('#be8851', '13', 1399, 677, 'rust rule 2/4 (L146)'),
    'rust2':  ('#965b30', '01', 578, 430, 'rust rule 3/4 (L104)'),
    'rust3':  ('#653e27', '13', 1379, 701, 'rust rule 4/4 (L71)'),
}


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def B(name):
    return hexrgb(BOARD[name][0])


def T(name):
    return tokens.tok(name)


def shade(rgb, k):
    return tuple(int(round(c * k)) for c in rgb)


VISOR_HOT = T('gun')            # CONFIG.palette.gun #ffc966: the game's warm accent (v2's visor)
GLINT = T('muzzle')             # palette.js CONCEPT.muzzle #fff2d8: warm white
RIM = tokens.rgb(tokens.TOKENS['vapor'])     # palette.js CONCEPT.vapor #c2ded8: the cool rim (neutral role)
INK = B('ink')

# family -> 6-entry ramp (tone 0..5)
RAMPS = {
    'k_bright': [B('khaki0'), B('khaki1'), B('khaki2'), B('khaki3'), RIM, GLINT],
    'k_mid':    [B('khaki1'), B('khaki2'), B('khaki3'), B('olive4'), RIM, B('khaki0')],
    'k_far':    [B('khaki2'), B('khaki3'), B('olive4'), B('olive5'), B('khaki2'), B('khaki1')],
    'suit':     [B('rust1'), B('rust2'), B('rust3'), B('dark6'), B('rust0'), B('rust0')],
    'suit_far': [B('rust2'), B('rust3'), B('dark6'), INK, B('rust2'), B('rust1')],
    'visor':    [VISOR_HOT, B('rust0'), B('rust2'), B('rust3'), VISOR_HOT, GLINT],
    'glow':     [VISOR_HOT, B('rust0'), B('rust2'), B('rust3'), VISOR_HOT, GLINT],
    'gun_l':    [B('khaki2'), B('khaki3'), B('olive4'), B('olive5'), RIM, B('khaki0')],
    'gun_m':    [B('khaki3'), B('olive4'), B('olive5'), B('dark6'), RIM, B('khaki1')],
    'gun_d':    [B('olive4'), B('olive5'), B('dark6'), INK, B('khaki3'), B('khaki2')],
    'gun_rust': [B('rust0'), B('rust1'), B('rust2'), B('rust3'), B('rust0'), GLINT],
    'pack':     [B('khaki3'), B('olive4'), B('olive5'), B('dark6'), B('khaki3'), B('khaki2')],
}


def accent_ramp(letter):
    """A gun's identity part: the game's own shot colour for that letter
    (CONFIG.palette.shots), lit and mid; shadow/deep are the token scaled."""
    c = T('shots.' + letter)
    return [c, c, shade(c, 0.72), shade(c, 0.52), c, GLINT]


def all_colours():
    """Every colour a v3 cell can contain (ramps, accents, ink)."""
    out = {INK}
    for r in RAMPS.values():
        out.update(r)
    for L in 'RSLHF':
        out.update(accent_ramp(L))
    return sorted(out)
