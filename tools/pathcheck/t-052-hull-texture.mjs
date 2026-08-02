// Domain: T-052 — hull surface textures (four generated tiles bound to the
// limb's material buckets: hull-panel-tile, weld-seam-strip, vent-louver-
// plate, wear-scuff-overlay; decisions.md entries 16/18).
//
// src/render/materials.js and src/render/limb.js both import `three` and
// reach a live WebGLRenderer at module scope (the procedural environment,
// the boot-gate texture loads, the wear-overlay canvas compositing), so this
// harness cannot import either directly — the SAME limit T-049 hit for
// src/render/preload.js/sprites.js and T-039 hit for src/render/contact.js.
// What is actually checkable, and what each of the four sections below
// checks, is:
//
//   1. THE ARITHMETIC. src/render/hulltiles.js is the Node-safe half this
//      lane split out for exactly this reason: a repeat value is derived
//      from CONFIG.limb's own numbers, not a second hand-typed copy of them,
//      so a retune of chunkCols/hull.drop/wall.below+above/scute.len,h moves
//      the tiling density with it. Re-derived here independently of the
//      module's own formula, straight from CONFIG.
//   2. THE ASSETS BACK UP THE CLAIM. Each tile's authored "world tile size"
//      (TILE_WORLD_SIZE) is a claim about the FILE — re-measured here from
//      the PNG's own pixel dimensions via tools/assets/lib/png.mjs, the same
//      way T-049 re-measures sprite ink boxes out of the file rather than
//      trusting a table.
//   3. THE ESCAPE HATCH. ?tex=flat is the only thing that turns the pass
//      off; everything else — absence, junk, a differently-cased typo —
//      resolves to "on" (decisions.md entry 16: approved work ships by
//      default, a flag is the A/B).
//   4. CROSS-FILE CONSISTENCY, BY TEXT (comments stripped first — T-049's
//      own review finding was a source-text guard that a COMMENT satisfied
//      after the real call was deleted, so every regex below runs on
//      stripped source and is paired with a live break-it check in
//      build.md, not trusted on its own): every material-family name
//      src/render/limb.js's SURFACE_FOR table names is a real family in
//      src/pure/post.js's SURFACE table (the same idiom T-048 uses for
//      hostiles.js's `surface:` keys), and every texture bucket
//      materials.js's HULL_TEX table can produce is a bucket key
//      src/render/limb.js's MATERIAL_FOR can actually emit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { SURFACE } from '../../src/pure/post.js';
import { hullPieceDims, hullTexRepeat, resolveHullTexOn, TILE_WORLD_SIZE } from '../../src/render/hulltiles.js';
import { decodePng } from '../../tools/assets/lib/png.mjs';
import { ok, near, srcDir, stripComments } from './_context.mjs';

export const title = 'T-052 hull surface textures (four tiles, entries 16/18)';

const TEX_DIR = join(srcDir, '..', 'assets', 'generated', 'textures');
const FILE_FOR = {
  hullPanel: 'hull-panel-tile.png',
  ventLouver: 'vent-louver-plate.png',
  weldSeam: 'weld-seam-strip.png',
};

export async function run() {

/* ==== 1. hulltiles.js stays Node-safe ==================================== */
{
  const src = stripComments(readFileSync(join(srcDir, 'render', 'hulltiles.js'), 'utf8'));
  ok(!/\b(THREE|document|window)\b/.test(src),
     'T-052: src/render/hulltiles.js stays Node-safe (no THREE, no DOM) — it is the ' +
     'half of the texture pass a headless gate can actually import');
}

/* ==== 2. the repeat arithmetic, re-derived from CONFIG =================== */
{
  const L = CONFIG.limb;
  const dims = hullPieceDims(CONFIG);
  ok(dims.hull[0] === L.chunkCols && dims.hull[1] === L.hull.drop,
     'T-052: the hull bucket is sized off the hull kind\'s own (chunkCols, hull.drop)');
  ok(dims.wall[0] === L.chunkCols && dims.wall[1] === L.wall.below + L.wall.above,
     'T-052: the wall bucket is sized off the wall kind\'s own (chunkCols, below+above)');
  ok(dims.scute[0] === L.scute.len && dims.scute[1] === L.scute.h,
     'T-052: the scute bucket is sized off the scute kind\'s own (len, h)');
  ok(dims.shadow[0] === L.chunkCols && dims.shadow[1] === L.wall.capH,
     'T-052: the shadow bucket is sized off a chunk-wide seam\'s own (chunkCols, capH)');

  const rep = hullTexRepeat(CONFIG);
  const [hw, hh] = TILE_WORLD_SIZE.hullPanel, [vw, vh] = TILE_WORLD_SIZE.ventLouver,
        [ww2, wh2] = TILE_WORLD_SIZE.weldSeam;
  near(rep.hull[0], L.chunkCols / hw, 1e-9, 'T-052: hull repeat.x = chunkCols / hull tile width');
  near(rep.hull[1], L.hull.drop / hh, 1e-9, 'T-052: hull repeat.y = hull.drop / hull tile height');
  near(rep.wall[0], L.chunkCols / hw, 1e-9, 'T-052: wall repeat.x = chunkCols / hull tile width');
  near(rep.wall[1], (L.wall.below + L.wall.above) / hh, 1e-9,
     'T-052: wall repeat.y = (below+above) / hull tile height');
  near(rep.scute[0], L.scute.len / vw, 1e-9, 'T-052: scute repeat.x = scute.len / vent tile width');
  near(rep.scute[1], L.scute.h / vh, 1e-9, 'T-052: scute repeat.y = scute.h / vent tile height');
  near(rep.shadow[0], L.chunkCols / ww2, 1e-9, 'T-052: shadow repeat.x = chunkCols / seam tile width');
  ok(rep.shadow[1] === 1,
     'T-052: shadow repeat.y is pinned to one full copy of the strip\'s own height ' +
     '(a value under 1 would crop its shadow band instead of fitting it)');

  // A retune has to move the tiling density with it, not silently drift out
  // of step — proved by actually retuning it, not by reading the formula.
  const bumped = { ...CONFIG, limb: { ...CONFIG.limb, chunkCols: CONFIG.limb.chunkCols * 2 } };
  const repBumped = hullTexRepeat(bumped);
  ok(Math.abs(repBumped.hull[0] - rep.hull[0] * 2) < 1e-9 &&
     Math.abs(repBumped.wall[0] - rep.wall[0] * 2) < 1e-9 &&
     Math.abs(repBumped.shadow[0] - rep.shadow[0] * 2) < 1e-9,
     'T-052: doubling chunkCols doubles every chunk-sized bucket\'s repeat.x — the ' +
     'arithmetic reads CONFIG live rather than a copy of today\'s numbers');
}

/* ==== 3. the world-tile-size claims are backed by the actual files ======= */
{
  // Every TILE_WORLD_SIZE row is a claim about a FILE's own physical aspect
  // ratio (its authored world-tile span). Cross-checked against the PNG's
  // real pixel dimensions rather than trusted as typed — the same discipline
  // T-049 applies to sprite ink boxes.
  for (const [role, file] of Object.entries(FILE_FOR)) {
    const { width, height } = decodePng(join(TEX_DIR, file));
    const [tw, th] = TILE_WORLD_SIZE[role];
    near(width / height, tw / th, 0.02,
       'T-052: ' + file + '\'s own pixel aspect (' + width + 'x' + height + ') matches ' +
       'TILE_WORLD_SIZE.' + role + '\'s claimed world-tile aspect (' + tw + 'x' + th + ')');
  }
}

/* ==== 4. ?tex=flat is the only opt-out (decisions.md entry 16) =========== */
{
  for (const bad of [null, undefined, '', 'junk', '0', 'off', 'FLAT', 'Flat', 1, {}, ['flat']])
    ok(resolveHullTexOn(bad) === true,
       'T-052: ?tex=' + JSON.stringify(bad) + ' resolves to the textured default');
  ok(resolveHullTexOn('flat') === false,
     'T-052: ?tex=flat, and only that exact value, turns the pass off');
}

/* ==== 5. cross-file consistency (text, comments stripped, paired with a === *
 *         live break-it check in build.md — see that file's §pathcheck)     */
{
  const limbSrc = stripComments(readFileSync(join(srcDir, 'render', 'limb.js'), 'utf8'));
  const materialsSrc = stripComments(readFileSync(join(srcDir, 'render', 'materials.js'), 'utf8'));

  // every family SURFACE_FOR names is a real family in the shared table
  const forBlock = limbSrc.match(/SURFACE_FOR\s*=\s*\{([\s\S]*?)\};/);
  ok(!!forBlock, 'T-052: limb.js declares a SURFACE_FOR table');
  const families = forBlock ? [...forBlock[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [];
  ok(families.length >= 4, 'T-052: SURFACE_FOR names at least four families (' + families.length + ')');
  ok(families.every((f) => SURFACE[f] !== undefined),
     'T-052: …and every family SURFACE_FOR names exists in pure/post.js\'s SURFACE table (' +
     families.filter((f) => !SURFACE[f]).join(', ') + ')');

  // every material bucket key MATERIAL_FOR can emit is a real key
  const materialForBlock = limbSrc.match(/const MATERIAL_FOR = \{([\s\S]*?)\n\};/);
  ok(!!materialForBlock, 'T-052: limb.js declares a MATERIAL_FOR table');
  const bucketKeys = new Set(
    materialForBlock ? [...materialForBlock[1].matchAll(/:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]) : []
  );
  ok(bucketKeys.size >= 8, 'T-052: MATERIAL_FOR emits at least eight distinct bucket keys (' +
     bucketKeys.size + ')');
  // every bucket MATERIAL_FOR can emit has an explicit SURFACE_FOR entry —
  // the fallback (`SURFACE_FOR[key] || 'plate'`) means a missing one is not a
  // crash, but it IS a bucket silently losing its own family assignment.
  const surfaceForKeys = forBlock
    ? [...forBlock[1].matchAll(/([a-zA-Z]+):\s*'[a-z]+'/g)].map((m) => m[1])
    : [];
  ok(surfaceForKeys.length > 0 && [...bucketKeys].every((k) => surfaceForKeys.includes(k)),
     'T-052: every bucket MATERIAL_FOR can emit has an explicit SURFACE_FOR entry (' +
     [...bucketKeys].filter((k) => !surfaceForKeys.includes(k)).join(', ') + ')');

  // every bucket materials.js's HULL_TEX can populate is one MATERIAL_FOR
  // can actually emit — applyHullTexture would otherwise be wired to a
  // bucket name limb.js never produces, a silent no-op nobody would notice.
  const hullTexBlock = materialsSrc.match(/function finishHullTex\(\)\s*\{([\s\S]*?)\n\}/);
  ok(!!hullTexBlock, 'T-052: materials.js declares finishHullTex()');
  const hullTexKeys = hullTexBlock
    ? [...hullTexBlock[1].matchAll(/HULL_TEX\.([a-zA-Z]+)\s*=/g)].map((m) => m[1])
    : [];
  ok(hullTexKeys.length >= 4, 'T-052: finishHullTex populates at least four buckets (' +
     hullTexKeys.length + ')');
  ok(hullTexKeys.every((k) => bucketKeys.has(k)),
     'T-052: every bucket materials.js textures is one limb.js MATERIAL_FOR can emit (' +
     hullTexKeys.filter((k) => !bucketKeys.has(k)).join(', ') + ')');

  // applyHullTexture is actually called from bakeLimb — the wiring T-049's
  // review found missing is exactly "the call was deleted, the comment
  // wasn't", so this checks the CALL, not the header.
  ok(/applyHullTexture\(material,\s*key\)/.test(limbSrc),
     'T-052: bakeLimb() calls applyHullTexture(material, key) for every bucket it builds');
  ok(/applySurface\(material,\s*SURFACE_FOR\[key\]/.test(limbSrc),
     'T-052: bakeLimb() calls applySurface(material, SURFACE_FOR[key]) for every bucket it builds');
}

}
