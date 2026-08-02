/* =========================== RIG (pure) ============================ *
 * RIG's body geometry as data (T-040, look-direction packet §3 item S8):
 * the box table src/render/player.js draws, plus a headless conformance
 * check, so pathcheck gates the ENVELOPE instead of trusting review — same
 * precedent as src/pure/shell.js's compositionViolations.
 *
 * The defect this answers: at the shipped FAR default RIG is 230 lit pixels
 * of head sphere + torso box + two leg boxes, with no helmet, pack, or
 * silhouette break, and he shares his value family with his own tracers.
 * The fix is a helmet/visor break and a pack mass, plus three value zones —
 * "about the most a 30 px figure can hold" before it blurs into one blob
 * (board 13's white figure, board 06's value-zone grammar):
 *
 *   bright   head + visor + gun arm   -> PAL.player   (unchanged: the read)
 *   dark     torso + pack             -> PAL.playerDark
 *   mid      legs                     -> PAL.playerMid
 *
 * CORRECTION CARRIED FROM ADVERSARIAL REVIEW — read before touching this
 * file. An earlier draft of this item claimed "the silhouette can never lie
 * about where RIG is." That is false of the ASSEMBLED rig: src/render/
 * player.js's gunGroup rotates a 0.75-long gun box (GUN_BOX below) through
 * the full 8-way aim sweep every frame, and at dead-horizontal aim the gun
 * reaches |x| = 0.825 — more than twice BODY_HALF_WIDTH (0.35, half of the
 * frozen 0.7 collision box). So the envelope property below is asserted
 * over BODY boxes ONLY (RIG_BOXES — never the gun), and the gun's known,
 * already-shipped, WIDER swept reach is named separately as GUN_INNER_X /
 * GUN_OUTER_X so pathcheck documents it rather than silently passing a
 * violated claim. Narrowing the gun sweep is out of scope for this item —
 * it is a rendering fact about the aim pose, not a silhouette defect.
 *
 * Two more limits, named so nobody re-derives them the hard way:
 *   - This table is the REST pose only. src/render/player.js still applies
 *     two shipped per-frame transforms on top of the assembled rig —
 *     `rig.scale.y = squash` (?crouch=1) and `rig.rotation.z = lean`
 *     (?flow=1) — both applied to the whole group, so they scale/rotate
 *     every box's envelope together rather than breaking it; neither is
 *     re-checked here.
 *   - RIG's collision box and movement are FROZEN (CONFIG.player.width/
 *     height). This module reads those constants to bound the render-only
 *     geometry against them; it never feeds anything back into the sim. */

import { CONFIG } from '../config.js';

// The frozen collision box this render geometry must stay inside, laterally
// and vertically. Read, never written: nothing here alters CONFIG.player.
export const BODY_HALF_WIDTH = CONFIG.player.width / 2;   // 0.35
export const BODY_HEIGHT = CONFIG.player.height;          // 1.7

export const ZONES = ['bright', 'dark', 'mid'];

/* Box table: { id, zone, w, h, d, x, y, z }. w/h/d are FULL extents (the
   same argument order THREE.BoxGeometry takes); x/y/z is the box CENTER,
   y measured from the deck RIG stands on (feet at y=0). z is render-only
   depth — the sim stays strictly 2D in (s,y) and never reads this axis;
   positive z is the gun-arm side (gunGroup sits at z=0.25), so the pack
   sits at negative z, "behind the torso" (S8). Torso/head/legs are the
   shipped geometry, byte-identical to the box list player.js carried
   before this table existed; visor and pack are the new silhouette break
   and mass. */
export const RIG_BOXES = [
  { id: 'head',  zone: 'bright', w: 0.28, h: 0.30, d: 0.28, x: 0,     y: 1.55, z: 0 },
  // helmet/visor break: a shallow plate riding the head's front face —
  // widens the head's read without widening the LATERAL envelope past it
  { id: 'visor', zone: 'bright', w: 0.30, h: 0.10, d: 0.30, x: 0,     y: 1.52, z: 0.22 },
  { id: 'torso', zone: 'dark',   w: 0.48, h: 0.85, d: 0.40, x: 0,     y: 0.95, z: 0 },
  // pack mass: rides the torso's upper back, one zone with the torso so it
  // reads as the same under-value rather than a fourth floating tone
  { id: 'pack',  zone: 'dark',   w: 0.22, h: 0.34, d: 0.16, x: 0,     y: 1.05, z: -0.28 },
  { id: 'legL',  zone: 'mid',    w: 0.16, h: 0.55, d: 0.19, x: -0.12, y: 0.28, z: 0 },
  { id: 'legR',  zone: 'mid',    w: 0.16, h: 0.55, d: 0.19, x: 0.12,  y: 0.28, z: 0 },
];

// The gun mesh's own box, local to gunGroup (see src/render/player.js's
// gunGroup, offset (0, muzzleY, 0.25) from the rig root and rotated in z
// every frame for 8-way aim). Kept here — not duplicated as a literal in
// player.js — so the "swept reach" figures below can never drift from what
// actually renders.
export const GUN_BOX = { w: 0.75, h: 0.14, d: 0.14, x: 0.45, y: 0, z: 0 };

// The gun's local x-span BEFORE rotation (gunGroup.rotation.z = 0, i.e. aim
// dead horizontal) — the case that reaches the largest |x|, since the box's
// own y/z half-extents are small next to its x offset. This is a documented,
// ALREADY-SHIPPED fact about the assembled rig, not a narrower target: see
// the header note on why it is asserted separately from rigEnvelopeViolations.
export function gunLocalXSpan(box = GUN_BOX) {
  return [box.x - box.w / 2, box.x + box.w / 2];
}
const [GUN_INNER_X, GUN_OUTER_X] = gunLocalXSpan();
export { GUN_INNER_X, GUN_OUTER_X };

/* Headless conformance check for the BODY box table (never the gun — see
   the header correction). Returns a list of human-readable violations
   (empty = clean), same shape as shell.js's compositionViolations, so
   pathcheck can assert it the same way: the real table is clean, and a
   synthetic bad box is caught. */
export function rigEnvelopeViolations(boxes = RIG_BOXES) {
  const out = [];
  for (const b of boxes) {
    if (!b.id) out.push('box with no id');
    const at = b.id || '(unnamed)';
    if (!ZONES.includes(b.zone)) out.push(at + ': zone "' + b.zone + '" is not declared');
    for (const k of ['w', 'h', 'd'])
      if (!(b[k] > 0)) out.push(at + ': ' + k + ' must be a positive number');
    for (const k of ['x', 'y', 'z'])
      if (!Number.isFinite(b[k])) out.push(at + ': ' + k + ' is not a number');
    if (!(b.w > 0) || !Number.isFinite(b.x)) continue;   // can't bound a malformed box further
    const lo = b.x - b.w / 2, hi = b.x + b.w / 2;
    const reach = Math.max(Math.abs(lo), Math.abs(hi));
    if (reach > BODY_HALF_WIDTH + 1e-9)
      out.push(at + ': x-extent [' + lo.toFixed(3) + ',' + hi.toFixed(3) +
        '] reaches ' + reach.toFixed(3) + ', past the ' + BODY_HALF_WIDTH.toFixed(3) +
        ' collision half-width');
    if (b.h > 0 && Number.isFinite(b.y)) {
      const yLo = b.y - b.h / 2, yHi = b.y + b.h / 2;
      if (yLo < -1e-9)
        out.push(at + ': y-extent dips below the deck (' + yLo.toFixed(3) + ')');
      if (yHi > BODY_HEIGHT + 1e-9)
        out.push(at + ': y-extent top ' + yHi.toFixed(3) + ' exceeds the ' +
          BODY_HEIGHT + ' collision height');
    }
  }
  for (const zone of ZONES)
    if (!boxes.some((b) => b.zone === zone)) out.push('no box carries zone "' + zone + '"');
  return out;
}
