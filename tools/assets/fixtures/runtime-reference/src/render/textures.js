/* FIXTURE — not part of the game. tools/assets/check.mjs must ACCEPT this file,
   exit 0, and list its runtime references.

   This is the counter-example tools/assets/README.md has carried since T-017:
   every `'assets/…'` string below sits *after* an import statement, so a regex
   that crosses newlines from an `import` keyword to the next quoted string
   rejects all of it — legal runtime loading, which is the sanctioned way to use
   an asset (load late, fall back to the procedural look if the file is gone).

   The import itself is multi-line on purpose: the fix for I-014 must read the
   statement's grammar, not "the next quote after the keyword". */

import {
  CONFIG,
} from '../config.js';

// import stale from '../../assets/generated/glyphs/dead.png';   <- commented out

const GLYPH_URL = `${CONFIG.assetsBase}/glyphs/capsule-letter-h.png`;
const PLATE_URL = 'assets/generated/textures/vent-plate.png';

export async function loadPlate(loader) {
  const mod = await import('../../assets/generated/glyphs/capsule-letter-h.png');
  const tex = await loader.loadAsync(PLATE_URL).catch(() => null);
  return { mod, tex, glyph: GLYPH_URL };
}
