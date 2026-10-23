"""House palette for the 3D -> sprite pipeline, read from the game's own tokens.

Nothing here invents a colour. Every swatch is parsed out of
`src/render/palette.js` (the CONCEPT table, the render default) or
`src/config.js` (`CONFIG.palette`, which CONCEPT forwards for `gun` and the
per-letter `shots`), so a retune of a token re-colours the sprites on the next
build instead of drifting from them. The build fails loudly if a token it
needs disappears.

Used by tools/art/rig/palette_v3.py (RIG v3: board-measured swatches plus
these tokens -- the visor `gun`, `muzzle`, the cool rim `vapor`, the weapon
identity `shots.*`) and by the spike's wasp. The v2 per-class tables that lived
here went with the primitive builder (decisions entry 26).
"""

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


def _read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return fh.read()


def _block(src, start_pat):
    """Return the text of the object literal that starts at start_pat."""
    m = re.search(start_pat, src)
    if not m:
        raise SystemExit('palette: cannot find %r' % start_pat)
    i = src.index('{', m.start())
    depth = 0
    for j in range(i, len(src)):
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    raise SystemExit('palette: unbalanced block after %r' % start_pat)


def _hex_tokens(block):
    out = {}
    for key, val in re.findall(r"\b([A-Za-z][A-Za-z0-9]*)\s*:\s*(?:0x|'#)([0-9a-fA-F]{6})", block):
        out.setdefault(key, val.lower())
    return out


def _top_level_tokens(block):
    """Tokens of the outer object only (nested objects like limb:{...} skipped)."""
    inner = block[1:-1]
    flat, depth = [], 0
    for ch in inner:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
        elif depth == 0:
            flat.append(ch)
            continue
        if depth > 0 or ch == '}':
            flat.append(' ')
    return _hex_tokens(''.join(flat))


def load_tokens():
    pal_src = _read('src/render/palette.js')
    cfg_src = _read('src/config.js')
    concept = _top_level_tokens(_block(pal_src, r'export const CONCEPT = \{'))
    cfg_pal = _block(cfg_src, r'\n  palette: \{')
    cfg = _top_level_tokens(cfg_pal)
    shots = _hex_tokens(_block(cfg_pal, r'shots:\s*\{'))
    tokens = dict(concept)
    # CONCEPT forwards these to CONFIG.palette verbatim (palette.js lines
    # `gun: CONFIG.palette.gun`, `shots: CONFIG.palette.shots`, ...).
    for key in ('gun', 'houndTell', 'polypTell', 'capsule', 'modCapsule'):
        if key not in tokens and key in cfg:
            tokens[key] = cfg[key]
    tokens['shots'] = shots
    need = ['player', 'playerMid', 'playerDark', 'gun', 'capsuleInk', 'muzzle',
            'wasp', 'waspDive', 'carrier', 'houndCharge', 'polypBeam', 'hitFlash',
            'mortarPod', 'bg', 'ground']
    missing = [k for k in need if k not in tokens]
    if missing or sorted(shots) != ['F', 'H', 'L', 'R', 'S']:
        raise SystemExit('palette: missing tokens %s shots=%s' % (missing, sorted(shots)))
    return tokens


def rgb(hex6):
    return (int(hex6[0:2], 16), int(hex6[2:4], 16), int(hex6[4:6], 16))


TOKENS = load_tokens()


def tok(name):
    if name.startswith('shots.'):
        return rgb(TOKENS['shots'][name.split('.', 1)[1]])
    return rgb(TOKENS[name])
