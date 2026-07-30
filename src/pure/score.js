/* ============================= SCORE ============================== */
/* CHARGE — the movement momentum meter from
   docs/proposals/2026-07-score-and-setback.md (A.4's minimal prototype),
   plus the THREAT arithmetic that reads off the same tables.

   Everything here is pure and deterministic: CHARGE is a function of the
   event stream and elapsed motion, with no rng and no frame-rate
   dependence, because it gates weapon behavior (A.5's layering rule 1).
   The sim half — where events are emitted from existing decision sites —
   lives in src/sim/score.js; the tuning lives in CONFIG.score.         */

import { CONFIG } from '../config.js';

export const SCORE = CONFIG.score;

// notch 0 = COLD, 1 = WARM, 2 = BREAKING. Thresholds are asserted monotonic.
export function scoreNotch(charge, tune = SCORE) {
  let n = 0;
  for (let i = 0; i < tune.notches.length; i++) if (charge >= tune.notches[i]) n = i + 1;
  return n;
}

export function scoreNotchMult(notch, tune = SCORE) {
  return tune.notchMult[Math.min(Math.max(notch, 0), tune.notchMult.length - 1)];
}

// WARM and above: the current weapon gets hotter. Nothing here touches
// movement — a score system that retuned physics would invalidate every
// traversal contract (A.5 layering rule 2).
export function scoreFireRateMult(notch, tune = SCORE) {
  return notch >= 1 ? tune.warmFireMult : 1;
}

export function scoreChargeGain(type, tune = SCORE) {
  return tune.gain[type] || 0;
}

export function scoreThreatGain(type, notch, tune = SCORE) {
  return (tune.threat[type] || 0) * scoreNotchMult(notch, tune);
}

export function scoreApplyGain(charge, type, tune = SCORE) {
  return Math.min(tune.max, charge + scoreChargeGain(type, tune));
}

// The whole design in one function: the floor cools you and the air does not.
export function scoreDrainPerSec(motion, tune = SCORE) {
  if (!motion.grounded || motion.traversal || motion.launchGrace) return 0;
  return Math.abs(motion.vx) < tune.stallSpeed ? tune.drain.stopped : tune.drain.moving;
}

// Drain can never cross the phase floor (A.3's anti-death-spiral rule; the
// slice's floor is 0, later phases declare their own).
export function scoreStep(charge, drainPerSec, dtSec, floor = 0) {
  return Math.max(floor, Math.min(SCORE.max, charge - drainPerSec * dtSec));
}

export function scoreClassification(threat, tune = SCORE) {
  let name = tune.classification[0][1];
  for (const row of tune.classification) if (threat >= row[0]) name = row[1];
  return name;
}

// HUD: notches welded to the weapon readout, one glyph per notch. Deliberately
// not the hp pip glyphs, so nothing that parses the HUD can confuse the two.
export function scoreNotchGlyphs(notch, tune = SCORE) {
  const n = tune.notches.length;
  const lit = Math.min(Math.max(notch, 0), n);
  return '▮'.repeat(lit) + '▯'.repeat(n - lit);
}

/* --------------------------- route coverage -------------------------- *
 * A.5 defines route coverage as "a route counts as used when >= 3 of its
 * connectors are visited in order". Doing it here (rather than only in the
 * harness's nearest-neighbour matcher) makes it real sim data.            */
export function scoreConnectorAt(connectors, x, y, radius) {
  let best = null, bestD = radius * radius;
  for (const c of connectors) {
    const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    if (d <= bestD) { bestD = d; best = c.id; }
  }
  return best;
}

export function scoreRoutesCompleted(routes, visited, minConnectors = SCORE.routeMinConnectors) {
  const out = [];
  for (const r of routes) {
    let i = 0;
    for (const id of visited) {
      if (i >= r.connectorIds.length) break;
      if (id === r.connectorIds[i]) i++;
    }
    if (i >= minConnectors) out.push(r.id);
  }
  return out;
}
