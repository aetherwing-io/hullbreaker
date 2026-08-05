/* ==================== CONTACT SHADOWS (pure, T-039/S6) ================= *
 * The math half of the fake ground-contact cue
 * (docs/proposals/2026-08-look-direction.md §3 S6): which surface an
 * (s, y) point should cast its shadow onto, and how the drawn quad fades
 * with height above that surface. THREE-free and time-free by
 * construction — no Math.random, no Date.now, no performance.now — so
 * pathcheck can drive both without a browser. src/render/contact.js is the
 * only place either becomes a mesh.
 *
 * Tunables live HERE rather than in CONFIG: this item's files, per the
 * packet and the dispatch, are contact.js / palette.js / player.js /
 * hostiles.js / capsules.js plus pathcheck.mjs — never config.js (which is
 * also a contended file this cycle). src/render/legibility.js sets the
 * precedent: it owns SHARE/NEAR_RIG_PCT directly rather than reaching into
 * CONFIG for them.                                                        */

export const CONTACT_SHADOW = {
  ceiling: 6,          // tiles above ground: the cue is fully gone at/after this
  maxOpacity: 0.55,    // heaviest multiply-darken, right at the surface
  minRadiusMult: 0.3,  // radius floor as height approaches the ceiling
};

// The surface a contact shadow lands on: the deck (or -999, meaning no
// ground under this column at all) versus the highest platform span that
// covers x and sits at or below y + eps. Mirrors src/sim/player.js's
// "stacked lanes: land on the highest crossed" rule (the same stacked-catwalk
// geometry), but as a POINT query — what is under this actor right now —
// rather than a swept one over a frame's motion: a shadow reads WHERE
// something is, not how it got there.
//
// `eps` absorbs float settle noise from an actor already resting exactly on
// the surface it is casting onto: without it, a grounded actor could sit a
// hair above its own platform and the query would "lose" the surface under
// its own feet.
export function contactShadowGroundY(x, y, groundTop, platforms, eps = 0.05) {
  let best = groundTop > -100 ? groundTop : -999;
  for (const pl of platforms) {
    if (x >= pl.x0 && x < pl.x1 && pl.y <= y + eps && pl.y > best) best = pl.y;
  }
  return best;
}

// Opacity/radius falloff, monotone in height above the resolved ground:
// both are at their full value at height 0 and fall in lockstep to EXACTLY
// zero at `cfg.ceiling` (never negative, never past it, never partial past
// the ceiling) — an actor above the ceiling reads as airborne with no
// grounding cue at all, rather than a shadow smeared thin over open air it
// no longer touches.
export function contactShadowFalloff(height, cfg) {
  const h = Math.max(0, height);
  if (h >= cfg.ceiling) return { opacity: 0, radiusMult: cfg.minRadiusMult };
  const u = 1 - h / cfg.ceiling;                  // 1 at the ground, 0 at the ceiling
  return {
    opacity: cfg.maxOpacity * u,
    radiusMult: cfg.minRadiusMult + (1 - cfg.minRadiusMult) * u,
  };
}

// One call, ground resolution plus falloff composed: what src/render/contact.js
// calls once per live actor per frame. `groundY <= -900` (no ground under this
// column and no platform crossing it either) hides the shadow outright rather
// than leaning on the falloff's ceiling coincidentally producing the same
// zero — the two are different reasons to draw nothing and a caller may want
// to tell them apart later.
export function contactShadowPlacement(x, y, groundTop, platforms, cfg = CONTACT_SHADOW, eps = 0.05) {
  const groundY = contactShadowGroundY(x, y, groundTop, platforms, eps);
  if (groundY <= -900) return { groundY, opacity: 0, radiusMult: cfg.minRadiusMult };
  const { opacity, radiusMult } = contactShadowFalloff(y - groundY, cfg);
  return { groundY, opacity, radiusMult };
}
