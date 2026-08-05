/* =========================== RIG (pure) ============================ *
 * RIG's silhouette as data (T-040, look-direction packet §3 item S8).
 *
 * REWORKED THREE TIMES. First an operator rejection of the six-box/three-
 * zone pass: "this is RIG? i was hoping for a much higher quality asset in
 * line with the concept art." The verdict was the QUALITY BAR, not the
 * technique — more boxes cannot fix it, because at RIG's frozen on-screen
 * size (~15x30 px, 3.75% of screen height, decisions.md entry 7) geometric
 * detail cannot read at all. Second, a single-polygon silhouette (the
 * shell's own `.sl-rig::before` clip-path technique, adapted) authored
 * blind, without ever rendering it — it painted as a thin, illegible ribbon
 * (see reports/tasks/T-040/build.md's "iteration log"), replaced by a small
 * set of plain shapes (helmet ellipse, torso polygon, two leg polygons) that
 * read reliably instead. Third, decisions.md entries 16/17: runtime asset
 * loading is now AUTHORIZED (the "boot with assets/ missing" rule is
 * retired) and FAR is CONFIRMED PERMANENT (no camera change coming to
 * rescue character fidelity) — so RIG is now a REAL PNG SPRITE
 * (assets/generated/sprites/rig-marine.png, built through tools/assets/ +
 * codex, manifest entry `rig-marine`), with the plain-shapes version from
 * the second rework kept as the FALLBACK if the image ever fails to load
 * (entry 16's one attached condition: a failed asset must degrade visibly
 * and safely, and the sim must never branch on it — see src/render/
 * player.js's `loadRigSprite`).
 *
 * What this file exports, in two groups:
 *   - RIG_SPRITE_* — the real sprite's world-unit plane size (measured from
 *     the PNG's own alpha bounding box, not guessed) and its UV crop
 *     rectangle (the source PNG is 77% transparent padding around the
 *     drawn figure; the crop excludes the padding so the plane's geometry
 *     maps 1:1 onto drawn pixels instead of stretching or wasting a wide
 *     transparent margin).
 *   - HELMET/TORSO/LEG_FRONT/LEG_BACK/VISOR/CANVAS_W/CANVAS_H/SPRITE_W/H —
 *     unchanged from the second rework: src/render/player.js triangulates the
 *     plain-shape data once into a vertex-coloured fallback. CANVAS_W/H remain
 *     source-coordinate provenance only; runtime creates no CanvasTexture.
 *
 * The shipped body atlas is gunless and mounts one of five painted chassis
 * at the simulation's real muzzle. A failed atlas selects the synchronous
 * fixed-geometry silhouette, never the older horizontal-rifle cutout.       */

import { CONFIG } from '../config.js';

// The frozen collision box this render geometry must stay inside, laterally
// and vertically. Read, never written: nothing here alters CONFIG.player.
export const BODY_HALF_WIDTH = CONFIG.player.width / 2;   // 0.35
export const BODY_HEIGHT = CONFIG.player.height;          // 1.7

/* THE REAL SPRITE (T-040, third rework). Runtime-loaded PNG, not bundled —
   src/render/player.js fetches it through THREE.TextureLoader; this file
   only carries the numbers the loader needs and the numbers pathcheck can
   check without a DOM.

   RIG_SPRITE_CONTENT_ASPECT is MEASURED, not chosen: the alpha channel's
   own bounding box in the 256x256 source (assets/generated/sprites/
   rig-marine.png) is x [68,185) y [13,241), width:height 0.513. That is
   WIDER than the frozen collision box's own 0.7/1.7 = 0.412 ratio, because
   a running stance's legs spread past the hitbox — a render-only choice.
   RIG_SPRITE_MAX_OVERRUN names how far that is allowed to go before the
   guard below refuses it (same documented-not-narrowed precedent as this
   file's own GUN_OUTER_X and CONFIG.hound's 2.4x visual/hitbox split — the
   collision box itself never changes). Re-derive the bounding box with:
     python3 -c "from PIL import Image; im=Image.open('assets/generated/
     sprites/rig-marine.png').convert('RGBA'); ..." (see reports/tasks/
     T-040/build.md for the exact one-liner used). */
export const RIG_SPRITE_PATH = '../../assets/generated/sprites/rig-marine-v2.png';
// Measured from the production cutout's alpha box: 419 x 327 pixels. The
// width includes RIG's rifle and backpack; the collision body remains the
// narrow CONFIG.player box, just as the separately swept gun always did.
export const RIG_SPRITE_CONTENT_ASPECT = 419 / 327;
export const RIG_SPRITE_H = BODY_HEIGHT;
export const RIG_SPRITE_W = RIG_SPRITE_CONTENT_ASPECT * RIG_SPRITE_H;
export const RIG_SPRITE_MAX_OVERRUN = 3.7;   // full rifle/backpack/action silhouette may reach up to
                                              //   this multiple of BODY_HALF_WIDTH
// UV crop rectangle (0..1, standard GL texture space: v=0 is the BOTTOM of
// the image) selecting just the drawn figure out of the source image's
// mostly-transparent padding — see the header note above for how these were
// measured. Production atlas frames encode crops once in immutable geometry
// UVs; no resident texture transform changes during play.
export const RIG_SPRITE_UV = { u0: 24 / 467, v0: 24 / 375, u1: 443 / 467, v1: 351 / 375 };

export const RIG_ACTION_SPRITE_PATH = '../../assets/generated/sprites/rig-marine-action-v2.png';
export const RIG_ACTION_SPRITE_H = BODY_HEIGHT;
export const RIG_ACTION_SPRITE_W = (488 / 334) * RIG_ACTION_SPRITE_H;
export const RIG_ACTION_SPRITE_UV = {
  u0: 24 / 536, v0: 24 / 382, u1: 512 / 536, v1: 358 / 382,
};

// Gunless production locomotion frames. Their transparent guards were
// measured rather than guessed, and `handX` is the shared forward-hand
// anchor inside that trimmed content. player.js translates each plane so
// the hand stays at one local x while the very different running silhouettes
// change around it; feet remain on y=0, preserving the deck contact.
export const RIG_RUN_HAND_X = 0.20;
// Render-only silhouette height. The collision body remains BODY_HEIGHT=1.7;
// a modest armour/helmet overrun keeps RIG readable at the shipped camera and
// matches the planted scale shared by the four aim paintings.
export const RIG_BODY_VISUAL_H = 2.0;
export const RIG_BODY_ATLAS_PATH = '../../assets/generated/sprites/rig-slender-body-atlas-v2.png';
export const RIG_BODY_ATLAS_W = 2048;
export const RIG_BODY_ATLAS_H = 1024;
export const RIG_IDLE_GUNLESS = Object.freeze({
  sourcePath: RIG_BODY_ATLAS_PATH,
  atlasX: 0, atlasY: 0,
  canvasW: 512, canvasH: 512, trimX: 194, trimY: 140, trimW: 123, trimH: 232,
  anchorX: 66,
});
export const RIG_BODY_WORLD_PER_PIXEL = RIG_BODY_VISUAL_H / RIG_IDLE_GUNLESS.trimH;
export const RIG_RUN_FRAMES = Object.freeze({
  contact: Object.freeze({
    sourcePath: RIG_BODY_ATLAS_PATH,
    atlasX: 512, atlasY: 0,
    canvasW: 512, canvasH: 512, trimX: 141, trimY: 148, trimW: 230, trimH: 216,
    anchorX: 132,
  }),
  pass: Object.freeze({
    sourcePath: RIG_BODY_ATLAS_PATH,
    atlasX: 1024, atlasY: 0,
    canvasW: 512, canvasH: 512, trimX: 188, trimY: 150, trimW: 135, trimH: 212,
    anchorX: 76,
  }),
  flight: Object.freeze({
    sourcePath: RIG_BODY_ATLAS_PATH,
    atlasX: 1536, atlasY: 0,
    canvasW: 512, canvasH: 512, trimX: 156, trimY: 160, trimW: 199, trimH: 191,
    anchorX: 112,
  }),
});

export const RIG_AIR_FRAMES = Object.freeze({
  rise: Object.freeze({
    sourcePath: RIG_BODY_ATLAS_PATH,
    atlasX: 0, atlasY: 512,
    canvasW: 512, canvasH: 512, trimX: 168, trimY: 147, trimW: 176, trimH: 217,
    anchorX: 105,
  }),
  fall: Object.freeze({
    sourcePath: RIG_BODY_ATLAS_PATH,
    atlasX: 512, atlasY: 512,
    canvasW: 512, canvasH: 512, trimX: 147, trimY: 154, trimW: 218, trimH: 204,
    anchorX: 119,
  }),
});

// Stationary aim poses keep the unarmed body anatomically connected to the
// independently rotating gun. Right-facing art covers the four authored arm
// elevations; player.js mirrors it for left aim without another texture or
// network request. Exact down uses the down-right brace nearest to vertical.
export const RIG_AIM_ATLAS_PATH = '../../assets/generated/sprites/rig-slender-aim-atlas-v2.png';
export const RIG_AIM_ATLAS_W = 2048;
export const RIG_AIM_ATLAS_H = 1024;
export const RIG_AIM_FRAMES = Object.freeze({
  right: Object.freeze({
    sourcePath: RIG_AIM_ATLAS_PATH,
    atlasX: 0, atlasY: 0,
    canvasW: 512, canvasH: 1024, trimX: 132, trimY: 297, trimW: 248, trimH: 429,
    anchorX: 124,
  }),
  'up-right': Object.freeze({
    sourcePath: RIG_AIM_ATLAS_PATH,
    atlasX: 512, atlasY: 0,
    canvasW: 512, canvasH: 1024, trimX: 111, trimY: 280, trimW: 290, trimH: 463,
    anchorX: 145,
  }),
  up: Object.freeze({
    sourcePath: RIG_AIM_ATLAS_PATH,
    atlasX: 1024, atlasY: 0,
    canvasW: 512, canvasH: 1024, trimX: 162, trimY: 233, trimW: 188, trimH: 557,
    anchorX: 94,
  }),
  'down-right': Object.freeze({
    sourcePath: RIG_AIM_ATLAS_PATH,
    atlasX: 1536, atlasY: 0,
    canvasW: 512, canvasH: 1024, trimX: 93, trimY: 333, trimW: 326, trimH: 357,
    anchorX: 163,
  }),
});
export const RIG_AIM_WORLD_PER_PIXEL = RIG_BODY_VISUAL_H / RIG_AIM_FRAMES.right.trimH;

export const RIG_CLIMB_ATLAS_PATH = '../../assets/generated/sprites/rig-slender-climb-atlas-v2.png';
export const RIG_CLIMB_ATLAS_W = 2048;
export const RIG_CLIMB_ATLAS_H = 1024;
export const RIG_CLIMB_WORLD_PER_PIXEL = RIG_AIM_WORLD_PER_PIXEL;
export const RIG_CLIMB_CYCLE_TILES = 2.4;
export const RIG_CLIMB_FRAMES = Object.freeze([
  Object.freeze({ name: 'left-reach', atlasX: 0, atlasY: 0,
    trimX: 196, trimY: 209, trimW: 202, trimH: 532, anchorX: 84 }),
  Object.freeze({ name: 'left-drive', atlasX: 512, atlasY: 0,
    trimX: 148, trimY: 275, trimW: 205, trimH: 464, anchorX: 102 }),
  Object.freeze({ name: 'right-reach', atlasX: 1024, atlasY: 0,
    trimX: 115, trimY: 216, trimW: 209, trimH: 529, anchorX: 100 }),
  Object.freeze({ name: 'right-drive', atlasX: 1536, atlasY: 0,
    trimX: 61, trimY: 281, trimW: 198, trimH: 463, anchorX: 103 }),
]);

// Render-only presentation cadence. Three high-quality poses describe planted,
// passing and airborne strides with one bounded cycle; swapping them at shot
// rate produced jitter, while never swapping made RIG skate.
export const RIG_RUN_CYCLE_MS = 300;
export const RIG_RUN_ACTION_FROM = 0.24;
export const RIG_RUN_ACTION_TO = 0.72;
export const RIG_RECOIL_MS = 105;
export const RIG_RECOIL_TILES = 0.095;

// Painted held-weapon cutouts. All five sources share 16px of transparent
// safety padding; the renderer crops that padding in UV space and sizes each
// plane in world units here. `muzzleY` is measured from the trimmed image's
// top edge, so player.js can put the visible bore on the simulation aim axis
// instead of merely centering five differently-shaped canvases.
export const RIG_WEAPON_ATLAS_PATH = '../../assets/generated/weapons/rig-weapons-atlas-v1.png';
export const RIG_WEAPON_ATLAS_W = 2048;
export const RIG_WEAPON_ATLAS_H = 256;
export const RIG_WEAPON_ART = Object.freeze({
  R: Object.freeze({
    sourcePath: '../../assets/generated/weapons/rig-rivetgun-v1.png',
    atlasX: 0, atlasY: 0,
    canvasW: 420, canvasH: 215, trimX: 16, trimY: 16, trimW: 388, trimH: 183,
    worldW: 1.16, muzzleY: 82,
  }),
  S: Object.freeze({
    sourcePath: '../../assets/generated/weapons/rig-scatter-v1.png',
    atlasX: 452, atlasY: 0,
    canvasW: 355, canvasH: 213, trimX: 16, trimY: 16, trimW: 323, trimH: 181,
    worldW: 1.05, muzzleY: 103,
  }),
  L: Object.freeze({
    sourcePath: '../../assets/generated/weapons/rig-sunspear-v1.png',
    atlasX: 839, atlasY: 0,
    canvasW: 390, canvasH: 201, trimX: 16, trimY: 16, trimW: 358, trimH: 169,
    worldW: 1.18, muzzleY: 82,
  }),
  H: Object.freeze({
    sourcePath: '../../assets/generated/weapons/rig-hunger-v1.png',
    atlasX: 1261, atlasY: 0,
    canvasW: 331, canvasH: 218, trimX: 16, trimY: 16, trimW: 299, trimH: 186,
    worldW: 1.02, muzzleY: 95,
  }),
  F: Object.freeze({
    sourcePath: '../../assets/generated/weapons/rig-cindermouth-v1.png',
    atlasX: 1624, atlasY: 0,
    canvasW: 368, canvasH: 220, trimX: 16, trimY: 16, trimW: 336, trimH: 188,
    worldW: 1.08, muzzleY: 95,
  }),
});

// Every painted cutout and procedural fallback ends at this exact local x.
// player.js offsets the group so this point coincides with sim/player.js's
// elliptical spawn offset for all eight directions; changing the silhouette
// never changes gameplay.
export const RIG_GUN_MUZZLE_X = 0.82;

// Same shape of check as spriteViolations() below, scoped to the real
// sprite's plane size: proves the documented overrun stays inside its own
// named ceiling rather than growing silently if the source PNG changes.
export function spriteImageViolations(opts = {}) {
  const spriteW = opts.spriteW ?? RIG_SPRITE_W;
  const spriteH = opts.spriteH ?? RIG_SPRITE_H;
  const maxOverrun = opts.maxOverrun ?? RIG_SPRITE_MAX_OVERRUN;
  const uv = opts.uv ?? RIG_SPRITE_UV;
  const out = [];
  if (!(spriteW > 0) || !(spriteH > 0)) out.push('image sprite plane has a non-positive dimension');
  if (spriteW / 2 > BODY_HALF_WIDTH * maxOverrun + 1e-9)
    out.push('image sprite half-width ' + (spriteW / 2).toFixed(3) + ' exceeds the documented ' +
      maxOverrun + 'x collision-half-width ceiling (' + (BODY_HALF_WIDTH * maxOverrun).toFixed(3) + ')');
  if (spriteH > BODY_HEIGHT + 1e-9)
    out.push('image sprite height ' + spriteH.toFixed(3) + ' exceeds the ' + BODY_HEIGHT + ' collision height');
  if (!(uv && uv.u0 >= 0 && uv.u1 <= 1 && uv.u0 < uv.u1 && uv.v0 >= 0 && uv.v1 <= 1 && uv.v0 < uv.v1))
    out.push('UV crop rectangle is not well-formed inside [0,1]');
  return out;
}

/* THE FALLBACK PLANE's own world-unit size — a separate, independent plane
   from RIG_SPRITE_W/H above, shown only while the real sprite is loading or
   if it fails (see src/render/player.js's `loadRigSprite`). Slimmed under
   the collision width (same "slimmed ~12% for the pulled-back camera"
   reasoning the original box list carried) and exactly the collision
   height, feet at y=0 — so the envelope check below is a single inequality
   that bounds every pixel the canvas can ever draw, not a per-part table. */
export const SPRITE_W = 0.60;
export const SPRITE_H = BODY_HEIGHT;

/* Texture resolution: supersampled a few times over the true on-screen size
   (~12 x 30 px at the shipped FAR default) so gradients/curves stay smooth
   once the GPU's own minification (mipmapped, see src/render/player.js)
   shrinks it back down — authoring AT the final size would fight the
   operator's "pixel-level intent" note by forcing hard aliasing where a
   soft falloff reads better; supersampling and letting minification do the
   downsample is the same trick src/render/legibility.js's glyph fitting
   already uses (measure-then-fit at a larger size, GLYPH_TEX_PX). Kept a
   plain multiple of SPRITE_W/SPRITE_H's own ratio so the drawn art never
   stretches. */
export const CANVAS_W = 34;
export const CANVAS_H = 96;

/* Facing convention for every shape below: +x (higher fraction) is FRONT —
   the side the gun mounts on — so src/render/player.js mirrors the whole
   plane (scale.x flip) when `player.facing` is negative, the same sign
   CONFIG.player.aim already uses. Authored leaning into a run: the torso
   cants forward, one leg reaches down-forward, the other trails, and the
   torso's own back edge bulges out for the pack — asymmetric on purpose,
   the thing a symmetric box never had a chance to be. All fractions of the
   canvas, [0,1], y downward from the top of the plane (SPRITE_H, i.e. the
   top of RIG's head) to its bottom (the deck, y=0 in world space). */

// Helmet: one ellipse, narrower than the shoulders so the neck reads as a
// real step down to the torso (the six-box version's head and torso were
// both the same width — a large part of why it read as a stack of blocks).
export const HELMET = { x: 0.54, y: 0.10, rx: 0.145, ry: 0.09 };

// Torso: shoulders wide, waist narrower, with the pack riding the BACK
// (lower-x) edge as its own outward bulge rather than a separate box.
export const TORSO = [
  [0.72, 0.18], [0.64, 0.58], [0.34, 0.58], [0.20, 0.38], [0.32, 0.18],
];

// Two independent leg polygons — a real transparent gap between them, not
// a single path with a notch. Front reaches down-forward; back trails.
export const LEG_FRONT = [[0.60, 0.58], [0.46, 0.58], [0.50, 0.95], [0.70, 0.90]];
export const LEG_BACK = [[0.52, 0.58], [0.38, 0.58], [0.16, 0.92], [0.40, 0.98]];

// Soft value-lift band across the torso's shoulder area only (fractions of
// canvas height), blended OVER the base dark fill rather than a hard zone
// edge — see the header note on why a graduated falloff reads better than
// flat banding at this size. Helmet tone + this lift + the base dark fill +
// the visor accent is the packet's "3-4 value steps, one accent."
export const LIFT_TOP = 0.18;
export const LIFT_BOTTOM = 0.42;

// Visor accent: a small ellipse on the helmet's front-lower face, the
// packet's ONE accent — reuses PAL.gun (already the warm muzzle-adjacent
// gold token everything else uses for RIG's weapon), not a new hue.
export const VISOR = { x: 0.58, y: 0.12, rx: 0.075, ry: 0.02 };

// The gun mesh's own box, local to gunGroup (see src/render/player.js's
// gunGroup, offset (0, muzzleY, 0.25) from the rig root and rotated in z
// every frame for 8-way aim). Untouched by this rework.
export const GUN_BOX = { w: 0.75, h: 0.14, d: 0.14, x: 0.45, y: 0, z: 0 };

// The gun's local x-span BEFORE rotation (gunGroup.rotation.z = 0, i.e. aim
// dead horizontal) — the case that reaches the largest |x|, since the box's
// own y/z half-extents are small next to its x offset. Documented, not a
// narrower target: carried forward verbatim from the box-list version of
// this file (same adversarial-review correction: the assembled rig's
// silhouette envelope does not bound the gun's own swept reach).
export function gunLocalXSpan(box = GUN_BOX) {
  return [box.x - box.w / 2, box.x + box.w / 2];
}
const [GUN_INNER_X, GUN_OUTER_X] = gunLocalXSpan();
export { GUN_INNER_X, GUN_OUTER_X };

// Shoelace formula: signed area of an authored polygon. Used only to prove
// a shape's points are wound so a canvas nonzero fill actually covers it (a
// self-intersecting or near-zero-area shape would be a silent no-op paint —
// this catches that class of authoring mistake headlessly).
function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function polygonBounds(points) {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function checkPolygon(out, label, points, minArea) {
  if (!Array.isArray(points) || points.length < 3) {
    out.push(label + ' needs at least 3 points, got ' + (points ? points.length : 0));
    return;
  }
  for (const [x, y] of points)
    if (!(x >= 0 && x <= 1) || !(y >= 0 && y <= 1))
      out.push(label + ' point (' + x + ',' + y + ') is outside the [0,1] canvas');
  const area = Math.abs(polygonArea(points));
  if (area < minArea)
    out.push(label + ' polygon area ' + area.toFixed(4) +
      ' is too small to be a real fill (self-intersecting or degenerate?)');
}

function checkEllipse(out, label, e) {
  if (!e || !(e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1 && e.rx > 0 && e.ry > 0))
    out.push(label + ' is not a well-formed ellipse inside the canvas');
}

/* Headless conformance check. Every field is overridable (defaulting to the
   real shipped data) so pathcheck can construct synthetic bad cases and
   prove the guard actually rejects them — the same shape as shell.js's
   compositionViolations and this file's own former rigEnvelopeViolations.

   HONESTY LIMIT, stated plainly because it is easy to miss: this file
   cannot see the RASTERIZED texture — there is no `document`/canvas in
   src/pure/ or in pathcheck's plain-Node process, so nothing here proves
   the drawn pixels look like a marine. What it CAN prove, and does: the
   plane's own world-unit footprint stays inside the frozen collision box
   (which bounds every pixel by construction, since nothing can be drawn
   outside the plane it is textured onto), every authored shape is
   well-formed and the whole assembly spans head-to-toe, and the canvas
   resolution is a sane, non-stretching multiple of the plane's own aspect
   ratio. The qualitative judgment — does it read as RIG — is the
   operator's, at true on-screen size, same as ever. */
export function spriteViolations(opts = {}) {
  const spriteW = opts.spriteW ?? SPRITE_W;
  const spriteH = opts.spriteH ?? SPRITE_H;
  const helmet = opts.helmet ?? HELMET;
  const torso = opts.torso ?? TORSO;
  const legFront = opts.legFront ?? LEG_FRONT;
  const legBack = opts.legBack ?? LEG_BACK;
  const canvasW = opts.canvasW ?? CANVAS_W;
  const canvasH = opts.canvasH ?? CANVAS_H;
  const liftTop = opts.liftTop ?? LIFT_TOP;
  const liftBottom = opts.liftBottom ?? LIFT_BOTTOM;
  const visor = opts.visor ?? VISOR;

  const out = [];
  if (!(spriteW > 0) || !(spriteH > 0)) out.push('sprite plane has a non-positive dimension');
  if (spriteW / 2 > BODY_HALF_WIDTH + 1e-9)
    out.push('sprite half-width ' + (spriteW / 2).toFixed(3) + ' exceeds the ' +
      BODY_HALF_WIDTH.toFixed(3) + ' collision half-width');
  if (spriteH > BODY_HEIGHT + 1e-9)
    out.push('sprite height ' + spriteH.toFixed(3) + ' exceeds the ' + BODY_HEIGHT + ' collision height');

  checkEllipse(out, 'helmet', helmet);
  checkPolygon(out, 'torso', torso, 0.03);
  checkPolygon(out, 'front leg', legFront, 0.015);
  checkPolygon(out, 'back leg', legBack, 0.015);

  // the whole assembly must span head-to-toe: helmet reaches near the top,
  // a leg reaches near the bottom
  if (helmet && helmet.y - helmet.ry > 0.05)
    out.push('helmet never reaches the top of the canvas (top ' + (helmet.y - helmet.ry).toFixed(3) + ')');
  if (Array.isArray(legFront) && Array.isArray(legBack)) {
    const maxLegY = Math.max(polygonBounds(legFront).maxY, polygonBounds(legBack).maxY);
    if (maxLegY < 0.9)
      out.push('legs never reach the bottom of the canvas (max y ' + maxLegY.toFixed(3) + ')');
  }
  if (Array.isArray(torso)) {
    const tb = polygonBounds(torso);
    if (tb.maxX - tb.minX < 0.3)
      out.push('torso is too narrow to read as shoulders (width ' + (tb.maxX - tb.minX).toFixed(3) + ')');
  }

  if (!(canvasW > 0 && canvasH > 0)) out.push('canvas has a non-positive dimension');
  else {
    const canvasAspect = canvasW / canvasH, planeAspect = spriteW / spriteH;
    if (Math.abs(canvasAspect - planeAspect) > 0.05)
      out.push('canvas aspect ' + canvasAspect.toFixed(3) + ' drifted from the plane\'s own ' +
        planeAspect.toFixed(3) + ' — the drawn art would stretch');
    if (canvasH < 60) out.push('canvas resolution is not a meaningful supersample of the true on-screen size');
  }
  if (!(liftTop > 0 && liftTop < liftBottom && liftBottom < 1))
    out.push('lift band is not ordered top < bottom inside (0,1)');
  checkEllipse(out, 'visor accent', visor);
  return out;
}
