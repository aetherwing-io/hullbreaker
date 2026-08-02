/* ========================== LEGIBILITY ============================ */
/* The FAR-view readability compensation (T-003) — decisions.md entry 7's
   own accepted follow-up. The operator made FAR the default view ("far
   feels right"), accepted its known cost ("capsule glyphs, wasp tells read
   smaller at distance"), and named the fix: scale the TELLS and GLYPHS up,
   never RIG and never the camera. Nothing in this module touches either.

   The measurement that opened the task (T-015, tools/assets/view.mjs):
   a 0.55-tile capsule letter renders 9.6px tall at the shipped FAR view,
   where the chamfer and rivets vanish and the letter survives as a smudge
   (tools/assets/reports/demo/capsule-letter-h/viewer-far.png). The same
   viewer's 2x column — 19px — is the first one that reads.

   THE RULE THIS MODULE ENCODES. The pull-back is a known scalar: ?view=
   multiplies the camera's depth by CONFIG.viewScales[id].depthMult and
   nothing else moves, so every world-size feature shrinks by exactly that
   factor. A tell is not world mass — it is a message about world mass — so
   a message may be scaled BACK UP by the same factor and land on screen at
   the size the near view already proved readable. That is the whole idea:

     gain(share) = 1 + (depthMult - 1) * share

   with `share` naming how much of the pull-back a feature is allowed to
   undo. Two shares are full (1.0) because the feature carries no world
   meaning at all, and one is partial:

     glyph — a letter on a pickup face. Pure information; restore it whole.
     cue   — a warning lamp. A light, not a body; restore it whole.
     pose  — a tell POSE (rear-up, dilate). This one deforms an actual
             body, so it only takes 60% of the compensation: enough to
             carry the silhouette change at FAR, not enough to turn a
             houndframe into a cartoon or to push a drawn body far past
             the hit circle it must keep containing.

   Consequences worth stating out loud, because both are asserted:
     - at ?view=near every gain is exactly 1, so the near view keeps the
       art it always had (entry 7's byte-identical-near instinct);
     - ?legibility=0 sets every gain to 1 at every view and disables the
       cue props outright, which is the operator's A/B against the shipped
       pre-pass look.

   HITBOXES ARE NOT SCALED, EVER. Everything here is a render magnitude.
   No sim field is written, no damage volume is resized: the polyp beam,
   the mortar mark and its blast slab are drawn from the reach and the
   footprint the sim marched, so they keep drawing exactly that. pathcheck
   asserts this statically (a scale line that touches a damage prop may not
   mention a gain) and numerically (the capsule's drawn box stays inside
   its unchanged pickup radius; every boosted tell pose still contains its
   unchanged hit circle).                                                */

import { CONFIG } from '../config.js';
import { QUERY, VIEW_ID } from '../mode.js';

/* The measured near-view RIG screen fraction, from CONFIG.viewScales' own
   note ("near 7.0%, mid 5.0%, far 3.7%"). Only the near number is stored:
   the other two are that number divided by the view's depthMult, which is
   what a straight camera pull-back does, and pathcheck checks the derived
   values against the two measurements rather than trusting the arithmetic. */
export const NEAR_RIG_PCT = 7.0;
export const RIG_TILES = CONFIG.player.height;

// ?legibility=0 (or =off) restores the pre-pass look at every view.
export function resolveLegibility(value) {
  return !(value === '0' || value === 'off');
}

export function viewDepthMult(viewId, scales = CONFIG.viewScales) {
  return (scales[viewId] || scales.near).depthMult;
}

// RIG's screen-height percentage at a view — the scale invariant board 13
// pins at 3–5% and the FAR default lands at 3.7%.
export function rigScreenPct(viewId, scales = CONFIG.viewScales) {
  return NEAR_RIG_PCT / viewDepthMult(viewId, scales);
}

// On-screen height in pixels of something `tiles` tall, at a view, on a
// viewport `viewportH` px high. The same arithmetic tools/assets/view.mjs
// judges assets by, so a number asserted here is a number that tool shows.
export function screenPx(tiles, viewId, viewportH = 800, scales = CONFIG.viewScales) {
  return (rigScreenPct(viewId, scales) / 100) * viewportH * tiles / RIG_TILES;
}

// How much of the pull-back each feature class may undo (see the header).
// `pip` (T-038, S5's seam pips/route-lip lights) joins glyph/cue at full
// share: a pip is a message about a ledge, not a body, exactly like a cue
// lamp, so it restores whole.
export const SHARE = { glyph: 1, cue: 1, pose: 0.6, pip: 1 };

export function legibilityGain(share, viewId, on = true, scales = CONFIG.viewScales) {
  return on ? 1 + (viewDepthMult(viewId, scales) - 1) * share : 1;
}

/* Glyph authoring constants (src/render/capsules.js draws against these).
   INK_FILL is the fraction of the box face the letter's drawn ink actually
   occupies — enforced by measuring the glyph and fitting it, not by
   trusting a font size — so the pixel floor below is a real prediction
   about the rendered letter rather than about its em box. */
export const GLYPH_TEX_PX = 128;          // power-of-two canvas per letter
export const GLYPH_INK_FILL = 0.72;       // letter ink height / box face
export const GLYPH_EDGE = 0.055;          // ink border: silhouette against a lit deck
export const GLYPH_SQUEEZE_MIN = 0.5;     // condense a 2-char mod label this far before
                                          //   giving up height (mods keep cap height)
export const LEGIBLE_PX_FLOOR = 12;       // the readability contract, in screen px at
                                          //   1280x800: below this a bold uppercase
                                          //   glyph stops surviving minification —
                                          //   T-015 measured the shipped 6.9px letter
                                          //   as a smudge and its 19px box as legible

/* Cue props: the warning lamps this pass adds to the hound's wind-up and
   the polyp's iris. Sizes are near-view tiles; CUE_GAIN restores them at a
   pulled-back view. LAMP_R is deliberately small at near — the point is
   that it stops shrinking away, not that it becomes a HUD marker. */
export const LAMP_R = 0.22;               // lamp radius, near-view tiles
export const LAMP_COIL_SWELL = 1.35;      // the commit beat: solid and bigger
export const LAMP_OFF_ALPHA = 0.38;       // the dark half of a blink, deliberately NOT
                                          //   invisible: at FAR a lamp that vanishes
                                          //   costs the object every other beat, so the
                                          //   blink modulates brightness and size while
                                          //   the light itself stays present
export const LAMP_OFF_SWELL = 0.72;       // …and the size it drops to on that beat
export const POLYP_ONSET_MS = 150;        // I-003: the first beat of the iris tell is
                                          //   a held flash, not a blink phase, so the
                                          //   opening of the reaction window carries
                                          //   signal instead of a small dark notch
export const POLYP_SWELL_EASE = 0.55;     // …and the dilation is front-loaded by this
                                          //   exponent (u ** ease), so most of the
                                          //   silhouette change happens early
export const WASP_DIVE_STRETCH = 0.4;     // committed-dive elongation along the dive
                                          //   vector (the hound's chargeStretch grammar)
export const WASP_DIVE_NARROW = 0.12;     // …and the cross-section it trades for the
                                          //   nose. Applied ON TOP of the stretch, so a
                                          //   diving drone keeps its footprint: a cue
                                          //   that shrinks the body at FAR would be a
                                          //   readability pass making things worse
                                          //   (measured — the first capture of this pass
                                          //   drew the dart at 0.74 cross-section and it
                                          //   read smaller than the cruising diamond)

/* The one place the dive cue's elongation is decided, because it is the one
   place a readability boost could tell a lie about reach: the drone's drawn
   nose may never extend past the contact circle the sim damages with. The
   shipped tune (visualRadius 0.5 vs contactRadius 0.55) leaves 10% of headroom
   and this clamps to exactly that, so the cue is carried by the commitment
   GLOW and the dart silhouette, never by claimed reach. Asserted in pathcheck. */
export function waspDiveStretch(gain = POSE_GAIN, W = CONFIG.wasp) {
  return Math.min(WASP_DIVE_STRETCH * gain, W.contactRadius / W.visualRadius - 1);
}
export const CAPSULE_SWEEP_RAD = 0.5;     // the pickup twirl becomes a bounded rock, so
export const CAPSULE_SWEEP_FREQ = 2.2;    //   the lettered face never turns edge-on
                                          //   (2.2 = the shipped spin rate, kept)

export const LEGIBILITY_ON = resolveLegibility(QUERY.get('legibility'));
export const GLYPH_GAIN = legibilityGain(SHARE.glyph, VIEW_ID, LEGIBILITY_ON);
export const CUE_GAIN = legibilityGain(SHARE.cue, VIEW_ID, LEGIBILITY_ON);
export const POSE_GAIN = legibilityGain(SHARE.pose, VIEW_ID, LEGIBILITY_ON);
export const PIP_GAIN = legibilityGain(SHARE.pip, VIEW_ID, LEGIBILITY_ON);
