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
   by pure/transform.js.

   TWO PROFILES (T-204). `helix` is the shipped one, byte-for-byte: 35 m over
   the whole run (grade 0.062, 3.5 deg; 5.4 m per side). `steep` (?rise=steep,
   unjudged, OFF by default per decisions.md entry 25's addendum) is a
   per-side GRADE table — the reviewer's amendment: targets in grade, not in
   metres, so they hold on today's 88-tile sides and on 176 later — rising
   0.16 -> 0.21 (9.1 -> 11.9 deg) one step per side with the pressure, eased
   across each chamfer so no deck kinks at a joint, flattening onto the Crown
   summit. 88-tile sides: 14.1 -> 18.5 m per side, ~99 m to the summit.
   src/mode.js selects the profile ONCE at import (selectAscentProfile), the
   same pattern as pure/transform.js's fixture selection, before any render
   bake reads it. Every function also takes an explicit profile id so tests
   can evaluate both without touching that selection. No src/sim module
   imports this file: the rise is presentation only.                      */

import { CONFIG } from '../config.js';

export const NORMAL_ASCENT = Object.freeze({
  totalRise: 35,                 // world units over the full six-face body
  easeInTiles: 32,               // smooth acceleration onto the helix grade
});

// The steep profile's table (T-204). One grade per face; the intro eases onto
// face 1's grade, each corner blends to the next grade over +-cornerBlendTiles
// around its fold (the middle of the chamfer, where the camera turns), and the
// outro eases to level over summitEaseTiles past the last chamfer.
export const STEEP_ASCENT = Object.freeze({
  faceGrades: Object.freeze([0.16, 0.17, 0.18, 0.19, 0.20, 0.21]),
  easeInTiles: 32,
  cornerBlendTiles: 4,
  summitEaseTiles: 16,
});

export const ASCENT_PROFILE_IDS = Object.freeze(['helix', 'steep']);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Integral of smoothstep. Its derivative is smoothstep itself, so altitude
// and grade both join the linear portion continuously at easeInTiles.
function smoothstepIntegral(u) { return u * u * u - 0.5 * u * u * u * u; }
function smoothstep(u) { return u * u * (3 - 2 * u); }

/* ------------------------------ helix ------------------------------ */

function profile(endS) {
  const end = Math.max(1, endS);
  const ease = Math.min(NORMAL_ASCENT.easeInTiles, end);
  const run = Math.max(0.5, end - ease * 0.5);
  return { end, ease, grade: NORMAL_ASCENT.totalRise / run };
}

function helixAltAt(s, endS) {
  const P = profile(endS);
  const x = clamp(s, 0, P.end);
  if (x < P.ease) {
    const u = x / P.ease;
    return P.grade * P.ease * smoothstepIntegral(u);
  }
  return P.grade * (x - P.ease * 0.5);
}

function helixGradeAt(s, endS) {
  const P = profile(endS);
  if (s <= 0 || s >= P.end) return 0;
  if (s < P.ease) return P.grade * smoothstep(s / P.ease);
  return P.grade;
}

/* ------------------------------ steep ------------------------------ */
/* A piecewise grade: constant on each face, with smoothstep transitions
   [a, b] between consecutive grades. Altitude is the exact integral, so
   grade and altitude agree at every s (asserted numerically in pathcheck).
   The transition table is built once per endS and cached.                */

let steepCache = null;
function steepTable(endS) {
  const end = Math.max(1, endS);
  if (steepCache && steepCache.end === end) return steepCache;
  const p = CONFIG.path, S = STEEP_ASCENT;
  const g = S.faceGrades;
  // transitions: grade from g0 to g1 across [a, b]
  const tr = [];
  tr.push({ a: 0, b: Math.min(S.easeInTiles, end), g0: 0, g1: g[0] });
  for (let k = 1; k < p.faces; k++) {
    const fold = p.introTiles + p.faceTiles * k + p.chamferTiles / 2;
    tr.push({ a: fold - S.cornerBlendTiles, b: fold + S.cornerBlendTiles,
      g0: g[k - 1], g1: g[Math.min(k, g.length - 1)] });
  }
  const summit = p.introTiles + p.faceTiles * p.faces + p.chamferTiles;
  tr.push({ a: summit, b: summit + S.summitEaseTiles,
    g0: g[Math.min(p.faces, g.length) - 1], g1: 0 });
  // altitude at each transition start, integrating in order
  let alt = 0, s = 0, grade = 0;
  for (const t of tr) {
    alt += grade * (t.a - s);
    t.altA = alt;
    alt += t.g0 * (t.b - t.a) + (t.g1 - t.g0) * (t.b - t.a) * smoothstepIntegral(1);
    s = t.b; grade = t.g1;
  }
  steepCache = { end, tr };
  return steepCache;
}

function steepAltAt(s, endS) {
  const T = steepTable(endS);
  const x = clamp(s, 0, T.end);
  let prevB = 0, prevAlt = 0, prevG = 0;
  for (const t of T.tr) {
    if (x < t.a) return prevAlt + prevG * (x - prevB);
    if (x < t.b) {
      const w = t.b - t.a;
      const u = (x - t.a) / w;
      return t.altA + t.g0 * (x - t.a) + (t.g1 - t.g0) * w * smoothstepIntegral(u);
    }
    prevB = t.b;
    prevAlt = t.altA + t.g0 * (t.b - t.a) + (t.g1 - t.g0) * (t.b - t.a) * smoothstepIntegral(1);
    prevG = t.g1;
  }
  return prevAlt + prevG * (x - prevB);
}

function steepGradeAt(s, endS) {
  const T = steepTable(endS);
  if (s <= 0 || s >= T.end) return 0;
  let prevG = 0;
  for (const t of T.tr) {
    if (s < t.a) return prevG;
    if (s < t.b) return t.g0 + (t.g1 - t.g0) * smoothstep((s - t.a) / (t.b - t.a));
    prevG = t.g1;
  }
  return prevG;
}

/* ---------------------------- selection ---------------------------- */

let ACTIVE_PROFILE = 'helix';

// Resolve a raw ?rise= value to a profile id: 'steep' (or '1') selects the
// per-side table; anything else — absent, '0', unknown — is the shipped helix.
export function resolveAscentProfile(raw) {
  return raw === 'steep' || raw === '1' ? 'steep' : 'helix';
}

// Called once by src/mode.js at import; returns the id it selected.
export function selectAscentProfile(raw) {
  ACTIVE_PROFILE = resolveAscentProfile(raw);
  return ACTIVE_PROFILE;
}

export function activeAscentProfile() { return ACTIVE_PROFILE; }

export function normalAscentAltAt(s, endS, profileId = ACTIVE_PROFILE) {
  return profileId === 'steep' ? steepAltAt(s, endS) : helixAltAt(s, endS);
}

export function normalAscentGradeAt(s, endS, profileId = ACTIVE_PROFILE) {
  return profileId === 'steep' ? steepGradeAt(s, endS) : helixGradeAt(s, endS);
}

export function normalAscentPitchAt(s, endS, profileId = ACTIVE_PROFILE) {
  return Math.atan(normalAscentGradeAt(s, endS, profileId));
}
