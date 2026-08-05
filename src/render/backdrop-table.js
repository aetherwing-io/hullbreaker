/* ===================== BACKDROP LAYER TABLE (Node-safe) =================
 * The half of T-051 a headless gate can check directly — same split as
 * src/render/sprite-table.js for the runtime hostile sprites (T-049) and
 * src/render/palette.js for the color tokens: no three.js, no DOM, so
 * tools/pathcheck/t-051-backdrop.mjs imports this file and RE-DERIVES every
 * number src/render/backdrop.js builds meshes from, rather than re-typing
 * them by hand where a drift could hide.
 *
 * The tuning data itself (which plate, which tier, which facet) lives in
 * CONFIG.BACKDROP_TUNE (src/config.js) — see that block's header comment for
 * the two fences this module's arithmetic answers (play-band clearance,
 * FAR-view frame coverage) and why the depths are what they are. */

import { DEG } from '../pure/path.js';

// facet i (1..CONFIG.path.faces) spans
// [introTiles+faceTiles*(i-1), introTiles+faceTiles*i) — this is its
// midpoint, 32.5 tiles clear of either of its own bends.
export function faceMidS(face, cfg) {
  const p = cfg.path;
  return p.introTiles + p.faceTiles * (face - 1) + p.faceTiles / 2;
}

// The view-space distance from the camera to a piece at this depth, at a
// given viewScales multiplier — the same quantity CONFIG.limb.backdrop's own
// comment calls "view-space depth" (three.js fogs on -mvPosition.z, and the
// camera's own depth offset rides the identical (sin(yaw), cos(yaw)) axis a
// piece's `depth` is authored against — see src/render/camera.js).
export function viewDist(depth, mult, cfg) {
  return cfg.camera.z * mult + Math.abs(depth);
}

// The near-view play-band floor a tier's `yBottom` must clear. `near` (mult
// 1) is the binding case: the ratio shrinks as mult grows, so clearing it
// there clears every other view scale too (asserted, not just claimed, in
// tools/pathcheck/t-051-backdrop.mjs).
export function minYBottom(depth, mult, cfg) {
  const ratio = (cfg.limb.playBand.y1 - cfg.camera.y) / (cfg.camera.z * mult);
  return cfg.camera.y + ratio * viewDist(depth, mult, cfg);
}

// The fog fraction (0 = clear, >=1 = fully hazed) a piece at this depth
// carries under a given {near, far} band already shifted by the live
// ?view= pull-back — the same shift src/render/camera.js applies
// (fogShift = cameraDepth - camera.z) before setting scene.fog.
export function fogFraction(depth, mult, fogNear, fogFar, cfg) {
  const shift = cfg.camera.z * mult - cfg.camera.z;
  const dist = viewDist(depth, mult, cfg);
  return (dist - (fogNear + shift)) / (fogFar - fogNear);
}

// The world (w, h, centerY) a tier+plate pair bakes to, sized against the
// FAR default view only (near/mid are comparison views, not a safety fence).
export function plateSize(tier, plate, cfg) {
  const farMult = cfg.viewScales.far.depthMult;
  const dist = viewDist(tier.depth, farMult, cfg);
  const halfH = dist * Math.tan((cfg.camera.fov / 2) * DEG);
  const h = tier.frameFraction * 2 * halfH;
  const w = h * (plate.canvas[0] / plate.canvas[1]);
  const cy = tier.yBottom + h / 2 + (plate.yLift || 0);
  return { w, h, cy, dist };
}

/* ?backdrop=flat — the escape hatch (decisions.md entry 16's A/B condition)
   plus the transform-slice exclusion: the six-face SEGS polyline this module
   places quads on is not what the transformation slice's camera rides
   (src/render/camera.js branches its whole pose function on
   IS_TRANSFORM_SLICE), so building against it there would bake geometry the
   camera never approaches the way it does on the six-face run. A pure
   function of two already-resolved values, not a QUERY/mode.js read, so a
   headless gate can prove every combination without a live URL. */
export function resolveBackdropOn(rawFlag, isTransformSlice) {
  return !isTransformSlice && rawFlag !== 'flat';
}
