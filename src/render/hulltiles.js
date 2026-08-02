/* ===================== HULL TILE ARITHMETIC (T-052, Node-safe) ============ */
/* The part of materials.js's texture pass that can lie about SIZE, split out
   so a headless gate can check it — the same reason src/render/palette.js,
   legibility.js, seams.js and lightrig.js are three.js-free. materials.js and
   limb.js both import `three` and reach a live WebGLRenderer at module scope
   (the procedural environment, the boot-gate texture loads, the wear-overlay
   compositing), so pathcheck cannot resolve either of them directly — this
   file is what tools/pathcheck/t-052-hull-texture.mjs asserts against
   instead, exactly the precedent T-039 set for src/render/contact.js.

   THE CLAIM THIS FILE OWNS: a repeat value is `piece size / the tile's own
   authored world-tile size` (each PNG's own manifest note — "authored for a
   ~2x2 tile repeat", "~4x1 tiles", "~1.5x1.5 tiles"), computed from
   CONFIG.limb's OWN numbers rather than a second, hand-typed copy of them —
   so a retune of chunkCols, hull.drop, wall.below/above or scute.len/h moves
   the tiling density with it instead of silently drifting out of step. */

// Each tile's own authored world-tile span (world units per ONE copy), read
// off its assets/manifest.json note. `weldSeam` is asymmetric on purpose —
// the strip is 128x32px, a 4:1 strip, authored to tile along its length and
// show its whole cross-section once across the height.
export const TILE_WORLD_SIZE = {
  hullPanel: [2, 2],
  ventLouver: [1.5, 1.5],
  weldSeam: [4, 1],
};

// The dominant kind's own (w, h) in each limb.js material bucket — `hull`
// against the `hull` kind itself, `wall` against `wall`, `scute` against
// `scute`, `shadow` against the wall cap's own seam height (hullRib/wallSeam
// share the same order of magnitude; see build.md for the co-tenant note).
export function hullPieceDims(cfg) {
  const L = cfg.limb;
  return {
    hull: [L.chunkCols, L.hull.drop],
    wall: [L.chunkCols, L.wall.below + L.wall.above],
    scute: [L.scute.len, L.scute.h],
    shadow: [L.chunkCols, L.wall.capH],
  };
}

// -> { hull: [x, y], wall: [x, y], scute: [x, y], shadow: [x, y] }. `shadow`'s
// vertical axis is pinned to exactly 1 (one full copy of the strip's own
// height across the piece) rather than capH/weldSeam[1] (~0.5): a repeat
// under 1 would crop the strip's own bottom shadow band instead of scaling it
// to fit, and a thin trim piece has no vertical room to tile twice anyway.
export function hullTexRepeat(cfg) {
  const d = hullPieceDims(cfg);
  const T = TILE_WORLD_SIZE;
  return {
    hull: [d.hull[0] / T.hullPanel[0], d.hull[1] / T.hullPanel[1]],
    wall: [d.wall[0] / T.hullPanel[0], d.wall[1] / T.hullPanel[1]],
    scute: [d.scute[0] / T.ventLouver[0], d.scute[1] / T.ventLouver[1]],
    shadow: [d.shadow[0] / T.weldSeam[0], 1],
  };
}

// ?tex=flat is the only thing that turns the pass off (decisions.md entry
// 16: ON by default, a flag is the A/B). Absence, '', and any other junk all
// resolve to "on" — the same "only an exact opt-out" idiom src/pure/post.js
// uses for ?bloom=/?aa=, so a mistyped query never silently disables art.
export function resolveHullTexOn(value) {
  return value !== 'flat';
}
