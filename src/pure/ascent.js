/* ======================== NORMAL-RUN ASCENT ======================== */
/* The shipped six-face simulation is deliberately still a flat (s, y)
   ribbon. Rendering gives that ribbon a third coordinate: each lap around
   the Meridian limb rises a little, turning the old horizontal hex circuit
   into one continuous helix. This module is pure profile math so every
   normal-run render bake and the camera read exactly the same altitude.

   The first few seconds ease onto the grade instead of popping the opening
   deck into a ramp. After that the rise is constant, which makes adjacent
   face-to-face gains easy to read and keeps the final height deterministic.
   Fixtures do not import this profile; their authored altitude remains owned
   by pure/transform.js.                                                   */

export const NORMAL_ASCENT = Object.freeze({
  totalRise: 35,                 // world units over the full six-face body
  easeInTiles: 32,               // smooth acceleration onto the helix grade
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Integral of smoothstep. Its derivative is smoothstep itself, so altitude
// and grade both join the linear portion continuously at easeInTiles.
function smoothstepIntegral(u) { return u * u * u - 0.5 * u * u * u * u; }
function smoothstep(u) { return u * u * (3 - 2 * u); }

function profile(endS) {
  const end = Math.max(1, endS);
  const ease = Math.min(NORMAL_ASCENT.easeInTiles, end);
  const run = Math.max(0.5, end - ease * 0.5);
  return { end, ease, grade: NORMAL_ASCENT.totalRise / run };
}

export function normalAscentAltAt(s, endS) {
  const P = profile(endS);
  const x = clamp(s, 0, P.end);
  if (x < P.ease) {
    const u = x / P.ease;
    return P.grade * P.ease * smoothstepIntegral(u);
  }
  return P.grade * (x - P.ease * 0.5);
}

export function normalAscentGradeAt(s, endS) {
  const P = profile(endS);
  if (s <= 0 || s >= P.end) return 0;
  if (s < P.ease) return P.grade * smoothstep(s / P.ease);
  return P.grade;
}

export function normalAscentPitchAt(s, endS) {
  return Math.atan(normalAscentGradeAt(s, endS));
}
