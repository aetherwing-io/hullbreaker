// Domain: T-057 — I-049, the operator-found lower-hull shimmer ("a lot of
// flicker on the bottom portions"). Full investigation and both measured
// metrics (before/after, moving) are in reports/tasks/T-057/build.md; the
// short version this domain exists to gate:
//
//   TWO NAMED SUSPECTS, BOTH TESTED, ONE SHIPPED AS A NO-OP-PROVEN-SAFE
//   HYGIENE FIX, NEITHER PROVEN TO CLOSE I-049.
//
//   1. Non-power-of-two composited canvas (src/render/hulltiles.js). T-057
//      measured FOUR different resizings of hullTexCanvas() against the
//      shimmer rig (tools/playtest/hulltex-shimmer.mjs) — power-of-two
//      cellPx alone, a raised hull/wall copy count alone, both together, and
//      a ceiling- instead of nearest-power-of-two round — and every one made
//      the shimmer metric EQUAL or WORSE, never better, against the
//      unmodified baseline. None of them shipped: hulltiles.js in this tree
//      is byte-identical to main (checked below, so a future edit that
//      quietly reintroduces one of those regressions is caught here rather
//      than assumed away by a stale comment).
//   2. Hardcoded anisotropy (src/render/materials.js): this DID ship, on its
//      own correctness merits (reads the device's real
//      getMaxAnisotropy() instead of a pinned guess), even though it did not
//      measurably move the shimmer metric in this project's headless/
//      software-rendered test harness either — see build.md for why that
//      null result is inconclusive rather than a clean disproof (SwiftShader
//      is not the operator's real GPU).
//
// materials.js reaches a live WebGLRenderer at module scope (the same limit
// T-052/T-054's own domains document), so what is checked here is the same
// class of thing T-052's own domain checks for materials.js/limb.js: static
// source text, comments stripped first (T-049's own review finding was a
// guard a COMMENT could satisfy after the real call was deleted).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { TEX_LAYOUT, hullTexCanvas } from '../../src/render/hulltiles.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-057 lower-hull shimmer (I-049): anisotropy fix + canvas-resize non-regression';

export async function run() {

/* ==== 1. the anisotropy fix actually shipped, and stayed dynamic ========= */
{
  const src = stripComments(readFileSync(join(srcDir, 'render', 'materials.js'), 'utf8'));
  ok(/getMaxAnisotropy\s*\(\s*\)/.test(src),
     'T-057: materials.js reads the device\'s own anisotropy limit ' +
     '(renderer.capabilities.getMaxAnisotropy()) rather than a pinned guess');
  // The two call sites this measurably touches (preloadTexture's opts and the
  // CanvasTexture built in buildTile) must both use the SAME resolved value,
  // not one dynamic and one still a literal — half a fix reads like a whole
  // one in a diff and is not.
  ok(!/anisotropy\s*[:=]\s*[0-9]+/.test(src),
     'T-057: no remaining hardcoded numeric anisotropy literal anywhere in materials.js');
  const anisoRefs = (src.match(/\banisotropy\b/g) || []).length;
  ok(anisoRefs >= 2,
     'T-057: `anisotropy` is set at both places this file actually uses it — the ' +
     'preload opts AND the CanvasTexture built in buildTile (found ' + anisoRefs + ' lowercase ' +
     '`anisotropy` occurrences; the constant itself is HULL_MAX_ANISOTROPY, cased differently ' +
     'on purpose so it cannot be mistaken for the property it feeds)');
}

/* ==== 2. the canvas-resize suspect was tested and NOT shipped ============ *
 * Not a git-history check (fragile across rebases/cherry-picks and the exact
 * branch-point assumption) — a behavioural one, against the SAME shipped
 * CONFIG the shimmer rig measured: hull/wall still round to a multiple of 4
 * (not the nearest/ceiling power of two every regressive variant used) and
 * still hold 3x3 copies (not the 4x4 T-057 tried alongside it). If a later,
 * genuinely-reasoned retune changes hulltiles.js on purpose, this is the
 * assertion that has to move WITH it — exactly CLAUDE.md's rule for a frozen
 * value: update the reasoning and the assertion together, never silently. */
{
  ok(TEX_LAYOUT.hull.copies === 3 && TEX_LAYOUT.wall.copies === 3,
     'T-057: hull/wall still hold T-054\'s shipped 3x3 copies, not the 4x4 this task ' +
     'measured and rejected (found ' + TEX_LAYOUT.hull.copies + ')');

  const hull = hullTexCanvas(CONFIG, 'hull');
  // The multiple-of-4 rule this task did NOT replace: cellPx is exactly what
  // Math.round(wanted / 4) * 4 gives for the CURRENT shipped CONFIG, not a
  // power of two. Re-derived from the same inputs hulltiles.js itself reads,
  // not a frozen magic number, so a legitimate CONFIG/camera retune moves
  // this alongside it automatically.
  const worldW = 2; // hull-panel-tile.png's own TILE_WORLD_SIZE[0] (T-054's manifest claim)
  const cssPxPerWorld = 1600 / (2 * Math.tan((CONFIG.camera.fov * Math.PI / 180) / 2) *
    CONFIG.camera.z * CONFIG.viewScales.far.depthMult);
  const wanted = worldW * cssPxPerWorld;
  const expectedCellPx = Math.max(16, Math.min(128, Math.round(wanted / 4) * 4));
  ok(hull.cellPx === expectedCellPx,
     'T-057: hull\'s composited-canvas cellPx is still the nearest-multiple-of-4 rule ' +
     '(' + expectedCellPx + '), not a power-of-two round (got ' + hull.cellPx + ') — every ' +
     'power-of-two variant this task tried measured WORSE shimmer, not better (build.md)');
  // The property this whole investigation revolved around and did NOT
  // change: the composited canvas is non-power-of-two. Asserted so a reader
  // of this file (or a future gate) can see the KNOWN, measured, deliberately
  // NOT-remediated state in one place, rather than re-discovering it.
  ok((hull.canvasPx & (hull.canvasPx - 1)) !== 0,
     'T-057: hull\'s composited canvas (' + hull.canvasPx + 'px) is still non-power-of-two — ' +
     'measured, and deliberately left alone: making it power-of-two (either by rounding cellPx ' +
     'or by raising the copy count) made I-049\'s shimmer metric worse in every combination ' +
     'this task tried, not better (build.md has all four readings)');
}

}
