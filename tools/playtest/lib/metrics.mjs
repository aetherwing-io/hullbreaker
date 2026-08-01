// metrics.mjs — turns a raw sample trace + the input timeline into the report
// the mission actually cares about. Every field either comes straight from a
// number the game itself computed (edgeMargin, hp pips, kill count) or is a
// documented derivation over the trace (idle time, route inference,
// protoScore). Nothing here fabricates a value it can't support — fields the
// current fidelity mode can't measure are `null` with an `unavailableReason`
// string next to them, not a guessed number.
//
// Idle-time definition and the routeIds/protoScore shapes are aligned with
// docs/proposals/2026-07-score-and-setback.md Appendix A.5 ("Instrumentation
// appendix") per the integrator's coordination request — see README.md's
// "Alignment with the score proposal (A.5)" section for the exact mapping
// and the one place this harness's original definition differed from A.5's.

import { TRAVERSAL_FIXTURE } from './fixture.mjs';
import { isVictorySample } from './sampler.mjs';

// A.5: "Same definition both sides: grounded, abs(vx) < 2, no traversal
// state. One threshold, one owner." This harness is that owner; adopted
// verbatim in place of this file's original combined-speed threshold (see
// README for the discrepancy note for the integrator to reconcile).
const STALL_VX_THRESHOLD = 2;
const ROUTE_MATCH_RADIUS = 2.2;        // tiles; euclidean (x,y) distance to count a connector "visited"
const ROUTE_USED_MIN_CONNECTORS = 3;   // A.5: "a route counts as used when >= 3 of its connectors are visited in order"

const HIGH_FIDELITY = new Set(['testapi', 'full']);
const HIGH_FIDELITY_UNAVAILABLE =
  'neither ?testapi=1 (globalThis.__HULLBREAKER_TEST__) nor window.HB was present — this metric needs ' +
  'real (x, y, vx, vy, grounded, traversalState) over time, which the HUD never renders';

function dominantFidelity(trace) {
  if (trace.length === 0) return 'unknown';
  const counts = { testapi: 0, full: 0, dom: 0 };
  for (const s of trace) counts[s.fidelity] = (counts[s.fidelity] || 0) + 1;
  if (counts.testapi >= trace.length / 2) return 'testapi';
  if (counts.full >= trace.length / 2) return 'full';
  return 'dom';
}

function highFidelitySamples(trace) {
  return trace.filter((s) => HIGH_FIDELITY.has(s.fidelity) && typeof s.vx === 'number');
}

function computeIdleTime(trace) {
  const hf = highFidelitySamples(trace);
  if (hf.length < 2) {
    return { idleTimeMs: null, idleTimeFraction: null, playingTimeMs: null, unavailableReason: HIGH_FIDELITY_UNAVAILABLE };
  }
  let idleMs = 0, playingMs = 0;
  for (let i = 1; i < hf.length; i++) {
    const dt = hf[i].nowMs - hf[i - 1].nowMs;
    if (dt <= 0 || dt > 2000) continue; // skip gaps (pause, dropped samples)
    const prev = hf[i - 1];
    if (prev.state && prev.state !== 'PLAYING') continue;
    playingMs += dt;
    // A.5: grounded, abs(vx) < 2, no traversal state (ledge/wall grab is a
    // controlled hold, not "standing around" — excluded deliberately).
    const stalled = prev.grounded === true &&
      Math.abs(prev.vx) < STALL_VX_THRESHOLD &&
      (prev.traversalState === 'free' || prev.traversalState == null);
    if (stalled) idleMs += dt;
  }
  return {
    idleTimeMs: Math.round(idleMs),
    idleTimeFraction: playingMs > 0 ? +(idleMs / playingMs).toFixed(3) : null,
    playingTimeMs: Math.round(playingMs),
    unavailableReason: null,
  };
}

function computeAirborneMs(trace) {
  const hf = highFidelitySamples(trace);
  if (hf.length < 2) return { airMs: null, unavailableReason: HIGH_FIDELITY_UNAVAILABLE };
  let airMs = 0;
  for (let i = 1; i < hf.length; i++) {
    const dt = hf[i].nowMs - hf[i - 1].nowMs;
    if (dt <= 0 || dt > 2000) continue;
    const prev = hf[i - 1];
    if (prev.state && prev.state !== 'PLAYING') continue;
    if (prev.grounded === false) airMs += dt;
  }
  return { airMs: Math.round(airMs), unavailableReason: null };
}

function computeVerticalRange(trace) {
  const ys = highFidelitySamples(trace).filter((s) => typeof s.y === 'number').map((s) => s.y);
  if (ys.length === 0) {
    return { minY: null, maxY: null, span: null, unavailableReason: HIGH_FIDELITY_UNAVAILABLE };
  }
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), span: +(maxY - minY).toFixed(2), unavailableReason: null };
}

// A.5: "Closest crush approach | minEdgeMargin | Already computed per frame
// in updatePlayer; the score system should read it rather than recompute."
// Available in every fidelity mode: the HUD renders it (rounded to 1
// decimal) and testapi/HB expose the exact value.
function computeClosestCrushApproach(trace) {
  let best = Infinity;
  for (const s of trace) {
    if (typeof s.edgeMargin === 'number' && Number.isFinite(s.edgeMargin) && s.edgeMargin < best) best = s.edgeMargin;
  }
  return Number.isFinite(best) ? +best.toFixed(2) : null;
}

function computeJumpCounts(trace) {
  const withAirJumps = trace.filter((s) => typeof s.airJumps === 'number');
  if (withAirJumps.length === 0) {
    return {
      finalAttemptAirJumps: null, peakSingleAttemptAirJumps: null,
      unavailableReason: HIGH_FIDELITY_UNAVAILABLE,
    };
  }
  const peak = Math.max(...withAirJumps.map((s) => s.airJumps));
  const final = withAirJumps[withAirJumps.length - 1].airJumps;
  return {
    finalAttemptAirJumps: final, peakSingleAttemptAirJumps: peak,
    note: 'sliceStats.airJumps resets to 0 on every retry/resetGame — these reflect the current attempt only, not a session total',
    unavailableReason: null,
  };
}

function computeDeathAndDamageEvents(trace) {
  let deaths = 0, hitsWithoutDeath = 0;
  let lastAttempts = null, lastHp = null;
  for (const s of trace) {
    const attempts = s.attempts;
    const hp = s.hp;
    let diedThisSample = false;
    if (typeof attempts === 'number') {
      if (lastAttempts !== null && attempts > lastAttempts) {
        deaths += attempts - lastAttempts;
        diedThisSample = true;
      }
      lastAttempts = attempts;
    }
    // A hp drop that didn't coincide with an attempt increment is a hit
    // survived (maxHealth is 3 — see CONFIG.player.maxHealth in index.html).
    // resetGame() also restores hp to max, which would otherwise look like
    // healing; diedThisSample already covers that transition so it's excluded.
    if (typeof hp === 'number' && typeof lastHp === 'number' && hp < lastHp && !diedThisSample) {
      hitsWithoutDeath += 1;
    }
    if (typeof hp === 'number') lastHp = hp;
  }
  return { deaths, hitsWithoutDeath };
}

// Airborne kills (A.5's `airborne_kill` event, kind/weapon/vy payload) aren't
// directly observable — there is no event stream to read yet, only a kills
// counter. This approximates it: every observed increase in the kills
// counter where the preceding high-fidelity sample had grounded === false
// counts as one. Proxy, not the authoritative event count; null when no
// high-fidelity samples exist at all.
function computeAirborneKills(trace) {
  const hf = highFidelitySamples(trace);
  if (hf.length === 0) return { airborneKills: null, unavailableReason: HIGH_FIDELITY_UNAVAILABLE };
  let count = 0, lastKills = null;
  for (const s of trace) {
    if (typeof s.kills !== 'number') continue;
    if (lastKills !== null && s.kills > lastKills) {
      const priorHf = [...hf].reverse().find((h) => h.nowMs <= s.nowMs);
      if (priorHf && priorHf.grounded === false) count += s.kills - lastKills;
    }
    lastKills = s.kills;
  }
  return { airborneKills: count, unavailableReason: null };
}

function inferRoute(trace) {
  const hf = highFidelitySamples(trace).filter((s) => typeof s.x === 'number' && typeof s.y === 'number');
  if (hf.length === 0) {
    return {
      matchedRouteId: null, confidence: null, matchedConnectors: [], routeIds: [],
      unavailableReason: HIGH_FIDELITY_UNAVAILABLE,
    };
  }
  const byId = new Map(TRAVERSAL_FIXTURE.connectors.map((c) => [c.id, c]));
  const perRoute = [];
  for (const route of TRAVERSAL_FIXTURE.routes) {
    let cursor = 0;
    const matched = [];
    for (const s of hf) {
      if (cursor >= route.connectorIds.length) break;
      const c = byId.get(route.connectorIds[cursor]);
      if (!c) { cursor++; continue; }
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d <= ROUTE_MATCH_RADIUS) { matched.push(route.connectorIds[cursor]); cursor++; }
    }
    const confidence = matched.length / route.connectorIds.length;
    perRoute.push({ routeId: route.id, confidence: +confidence.toFixed(2), matchedConnectors: matched });
  }
  const best = perRoute.reduce((a, b) => (b.confidence > a.confidence ? b : a), perRoute[0]);
  // A.5: "a route counts as used when >= 3 of its connectors are visited in order."
  const routeIds = perRoute.filter((r) => r.matchedConnectors.length >= ROUTE_USED_MIN_CONNECTORS).map((r) => r.routeId);
  return {
    matchedRouteId: best.routeId, confidence: best.confidence, matchedConnectors: best.matchedConnectors,
    routeIds,
    unavailableReason: null,
    method: `greedy nearest-connector-in-order match against the game's own TRAVERSAL_FIXTURE (imported from src/pure/traversal.js), radius ${ROUTE_MATCH_RADIUS} tiles ` +
      `— approximate, not a topological solve. routeIds (A.5 "route coverage") lists every route with >= ${ROUTE_USED_MIN_CONNECTORS} ` +
      'connectors matched in order; matchedRouteId/confidence is this harness\'s supplementary single-best-guess summary.',
  };
}

function computeDarePocket(trace) {
  const bounds = TRAVERSAL_FIXTURE.darePocket.bounds;
  const rewardLetter = TRAVERSAL_FIXTURE.darePocket.reward.letter;
  let entered = false, enteredMethod = null;
  for (const s of trace) {
    if (HIGH_FIDELITY.has(s.fidelity) && typeof s.x === 'number' && s.x >= bounds.x0 && s.x < bounds.x1) {
      entered = true; enteredMethod = 'position-in-bounds'; break;
    }
    if (s.fidelity === 'dom' && s.hudTC && /H WAGER|H ACQUIRED/.test(s.hudTC)) {
      entered = true; enteredMethod = 'hud-text'; break;
    }
  }
  const rewardTaken = trace.some((s) => s.weapon === rewardLetter);
  return { entered, enteredMethod, rewardTaken };
}

function computeOutcome(trace) {
  const victorySeen = trace.some(isVictorySample);
  const lastAttemptsSample = [...trace].reverse().find((s) => typeof s.attempts === 'number');
  const lastAttempts = lastAttemptsSample ? lastAttemptsSample.attempts : null;
  const lastFallsSample = [...trace].reverse().find((s) => typeof s.falls === 'number');
  const lastFalls = lastFallsSample ? lastFallsSample.falls : null;
  const { idleTimeFraction } = computeIdleTime(trace);
  if (victorySeen) return { result: 'completed', attempts: lastAttempts, falls: lastFalls };
  if (idleTimeFraction !== null && idleTimeFraction > 0.6 && (lastAttempts === null || lastAttempts <= 1)) {
    return { result: 'stalled', attempts: lastAttempts, falls: lastFalls };
  }
  if (lastAttempts !== null && lastAttempts > 1) return { result: 'died', attempts: lastAttempts, falls: lastFalls };
  return { result: 'not-completed', attempts: lastAttempts, falls: lastFalls };
}

// The last sample carrying the game's own A.5 score snapshot (hook request
// #3, landed): present only when the run was started with ?score=1 — the
// snapshot rides both telemetry channels, `score.enabled` gates trust.
function lastScoreSample(trace) {
  for (let i = trace.length - 1; i >= 0; i--) {
    const s = trace[i].score;
    if (s && s.enabled === true && s.counts) return s;
  }
  return null;
}

// A.5: "protoScore = 100*airborneKills + 25*links + 12*(airMs/1000) -
// 8*(stallMs/1000). Publish this formula in the harness so pre- and
// post-implementation runs are comparable in shape, not just in trend."
//
// Two sources, clearly labeled:
//  - `source: 'HB.score'` — the run carried ?score=1, so every term comes
//    from the game's own event-derived snapshot (real counts, the sim's own
//    air/stall clocks). This is the authoritative number A.5 describes.
//  - `source: 'proxy'` — no score snapshot in the trace; `airborneKills` is
//    the kills+grounded approximation and `links` is (best-matched route's
//    connector count - 1) from this harness's route matcher, as before.
function computeProtoScore(trace, airborneKillsResult, routeResult, airborneMsResult, idleTimeResult) {
  const real = lastScoreSample(trace);
  if (real) {
    const protoScore = 100 * real.counts.airborne_kill + 25 * real.counts.link +
      12 * (real.airMs / 1000) - 8 * (real.stallMs / 1000);
    return {
      protoScore: +protoScore.toFixed(1),
      source: 'HB.score',
      unavailableReason: null,
      note: 'real: all four terms come from the game\'s own A.5 event stream (?score=1) — ' +
        'counts.airborne_kill=' + real.counts.airborne_kill + ', counts.link=' + real.counts.link,
    };
  }
  if (airborneKillsResult.unavailableReason || routeResult.unavailableReason ||
      airborneMsResult.unavailableReason || idleTimeResult.unavailableReason) {
    return { protoScore: null, unavailableReason: HIGH_FIDELITY_UNAVAILABLE };
  }
  const links = Math.max(0, (routeResult.matchedConnectors || []).length - 1);
  const protoScore = 100 * airborneKillsResult.airborneKills + 25 * links +
    12 * (airborneMsResult.airMs / 1000) - 8 * (idleTimeResult.idleTimeMs / 1000);
  return {
    protoScore: +protoScore.toFixed(1),
    linksApprox: links,
    source: 'proxy',
    unavailableReason: null,
    note: 'proxy: airborneKills/links are approximated from kills+grounded and the route matcher, not real HB.score.events — see README',
  };
}

export function computeMetrics(trace, { events, wallTimeMs, achievedSampleIntervalsMs }) {
  const fidelity = dominantFidelity(trace);
  const highFidelityDetected = trace.some((s) => HIGH_FIDELITY.has(s.fidelity));
  const testapiDetected = trace.some((s) => s.fidelity === 'testapi');
  const idle = computeIdleTime(trace);
  const airborne = computeAirborneMs(trace);
  const vertical = computeVerticalRange(trace);
  const closestCrushApproach = computeClosestCrushApproach(trace);
  const jumpCounts = computeJumpCounts(trace);
  const deathAndDamage = computeDeathAndDamageEvents(trace);
  const airborneKills = computeAirborneKills(trace);
  const route = inferRoute(trace);
  const darePocket = computeDarePocket(trace);
  const outcome = computeOutcome(trace);
  const protoScore = computeProtoScore(trace, airborneKills, route, airborne, idle);
  const scoreFinal = lastScoreSample(trace);

  const keydowns = events.filter((e) => e.type === 'keydown').length;
  const keyups = events.filter((e) => e.type === 'keyup').length;
  // A.5: "Input density | Harness-side | Not a score input. Deliberately:
  // rewarding input density would reward mashing." Reported for its own
  // sake (a pacing/harness diagnostic), never fed into protoScore above.
  const inputDensityEventsPerSec = wallTimeMs > 0 ? +(events.length / (wallTimeMs / 1000)).toFixed(2) : 0;

  const avgSampleIntervalMs = achievedSampleIntervalsMs.length
    ? +(achievedSampleIntervalsMs.reduce((a, b) => a + b, 0) / achievedSampleIntervalsMs.length).toFixed(1)
    : null;
  const maxSampleIntervalMs = achievedSampleIntervalsMs.length ? Math.max(...achievedSampleIntervalsMs) : null;

  return {
    fidelity, highFidelityDetected, testapiDetected,
    outcome,
    idleTime: idle,
    airborneTime: airborne,
    verticalRange: vertical,
    closestCrushApproachTiles: closestCrushApproach,
    jumpCounts,
    deaths: deathAndDamage.deaths,
    hitsWithoutDeath: deathAndDamage.hitsWithoutDeath,
    airborneKills,
    route,
    darePocket,
    protoScore,
    // The final A.5 score snapshot verbatim (null unless the run had
    // ?score=1): CHARGE/notch, THREAT/classification, per-event counts,
    // sim-owned air/stall/hot clocks, setbacks, and which tune ('slice'
    // = A.4's doubled table, 'run' = A.3's full-run table) priced it.
    score: scoreFinal,
    input: {
      totalEvents: events.length, keydownCount: keydowns, keyupCount: keyups,
      eventsPerSecond: inputDensityEventsPerSec,
    },
    sampling: {
      requestedCount: achievedSampleIntervalsMs.length + 1,
      avgIntervalMs: avgSampleIntervalMs,
      maxIntervalMs: maxSampleIntervalMs,
    },
    finalKills: (() => {
      const last = [...trace].reverse().find((s) => typeof s.kills === 'number');
      return last ? last.kills : null;
    })(),
  };
}
