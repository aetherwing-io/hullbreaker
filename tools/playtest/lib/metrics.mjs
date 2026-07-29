// metrics.mjs — turns a raw sample trace + the input timeline into the report
// the mission actually cares about. Every field either comes straight from a
// number the game itself computed (sliceStats.minEdgeMargin, hp pips, kill
// count) or is a documented derivation over the trace (idle time, route
// inference). Nothing here fabricates a value it can't support — fields the
// current fidelity mode can't measure are `null` with a `*Unavailable`
// reason string next to them, not a guessed number.

import { TRAVERSAL_FIXTURE_SNAPSHOT } from './fixture.mjs';

const IDLE_SPEED_THRESHOLD = 1.2;      // tiles/sec; below this counts as "not really moving"
const ROUTE_MATCH_RADIUS = 2.2;        // tiles; euclidean (x,y) distance to count a connector "visited"

function dominantFidelity(trace) {
  if (trace.length === 0) return 'unknown';
  const full = trace.filter((s) => s.fidelity === 'full').length;
  return full >= trace.length / 2 ? 'full' : 'dom';
}

function computeIdleTime(trace) {
  const full = trace.filter((s) => s.fidelity === 'full' && typeof s.vx === 'number' && typeof s.vy === 'number');
  if (full.length < 2) {
    return { idleTimeMs: null, idleTimeFraction: null, playingTimeMs: null, unavailableReason: 'window.HB not present or no velocity samples — idle time needs (vx, vy) over time, which the HUD never renders' };
  }
  let idleMs = 0, playingMs = 0;
  for (let i = 1; i < full.length; i++) {
    const dt = full[i].nowMs - full[i - 1].nowMs;
    if (dt <= 0 || dt > 2000) continue; // skip gaps (pause, dropped samples)
    if (full[i - 1].state && full[i - 1].state !== 'PLAYING') continue;
    playingMs += dt;
    const speed = Math.hypot(full[i - 1].vx, full[i - 1].vy);
    if (speed < IDLE_SPEED_THRESHOLD) idleMs += dt;
  }
  return {
    idleTimeMs: Math.round(idleMs),
    idleTimeFraction: playingMs > 0 ? +(idleMs / playingMs).toFixed(3) : null,
    playingTimeMs: Math.round(playingMs),
    unavailableReason: null,
  };
}

function computeVerticalRange(trace) {
  const ys = trace.filter((s) => s.fidelity === 'full' && typeof s.y === 'number').map((s) => s.y);
  if (ys.length === 0) {
    return { minY: null, maxY: null, span: null, unavailableReason: 'window.HB not present — y position is never shown in the HUD' };
  }
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), span: +(maxY - minY).toFixed(2), unavailableReason: null };
}

function computeClosestCrushApproach(trace) {
  let best = Infinity;
  for (const s of trace) {
    const m = s.fidelity === 'full' ? s.sliceStats && s.sliceStats.minEdgeMargin : s.edgeMargin;
    if (typeof m === 'number' && Number.isFinite(m) && m < best) best = m;
  }
  return Number.isFinite(best) ? +best.toFixed(2) : null;
}

function computeJumpCounts(trace) {
  const full = trace.filter((s) => s.fidelity === 'full' && s.sliceStats && typeof s.sliceStats.airJumps === 'number');
  if (full.length === 0) {
    return { finalAttemptAirJumps: null, peakSingleAttemptAirJumps: null, unavailableReason: 'window.HB not present — sliceStats.airJumps is never rendered to the HUD mid-run' };
  }
  const peak = Math.max(...full.map((s) => s.sliceStats.airJumps));
  const final = full[full.length - 1].sliceStats.airJumps;
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
    const attempts = s.fidelity === 'full' ? (s.sliceStats && s.sliceStats.attempts) : s.attempts;
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

function inferRoute(trace) {
  const full = trace.filter((s) => s.fidelity === 'full' && typeof s.x === 'number' && typeof s.y === 'number');
  if (full.length === 0) {
    return { matchedRouteId: null, confidence: null, matchedConnectors: [], unavailableReason: 'window.HB not present — route inference needs an (x, y) position trace, which the HUD never renders' };
  }
  const byId = new Map(TRAVERSAL_FIXTURE_SNAPSHOT.connectors.map((c) => [c.id, c]));
  let best = null;
  for (const route of TRAVERSAL_FIXTURE_SNAPSHOT.routes) {
    let cursor = 0;
    const matched = [];
    for (const s of full) {
      if (cursor >= route.connectorIds.length) break;
      const c = byId.get(route.connectorIds[cursor]);
      if (!c) { cursor++; continue; }
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d <= ROUTE_MATCH_RADIUS) { matched.push(route.connectorIds[cursor]); cursor++; }
    }
    const confidence = matched.length / route.connectorIds.length;
    if (!best || confidence > best.confidence) {
      best = { matchedRouteId: route.id, confidence: +confidence.toFixed(2), matchedConnectors: matched };
    }
  }
  return { ...best, unavailableReason: null,
    method: 'greedy nearest-connector-in-order match against a hardcoded fixture snapshot, radius ' + ROUTE_MATCH_RADIUS + ' tiles — approximate, not a topological solve' };
}

function computeDarePocket(trace) {
  const bounds = TRAVERSAL_FIXTURE_SNAPSHOT.darePocket.bounds;
  const rewardLetter = TRAVERSAL_FIXTURE_SNAPSHOT.darePocket.reward.letter;
  let entered = false, enteredMethod = null;
  for (const s of trace) {
    if (s.fidelity === 'full' && typeof s.x === 'number' && s.x >= bounds.x0 && s.x < bounds.x1) {
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
  const victorySeen = trace.some((s) => s.ovTitle === 'TRAVERSAL CLEAR');
  const lastFull = [...trace].reverse().find((s) => s.fidelity === 'full' && s.sliceStats);
  const lastAttempts = lastFull ? lastFull.sliceStats.attempts
    : (() => { const a = [...trace].reverse().find((s) => typeof s.attempts === 'number'); return a ? a.attempts : null; })();
  const lastFalls = lastFull ? lastFull.sliceStats.falls : null;
  const { idleTimeFraction } = computeIdleTime(trace);
  if (victorySeen) return { result: 'completed', attempts: lastAttempts, falls: lastFalls };
  if (idleTimeFraction !== null && idleTimeFraction > 0.6 && (lastAttempts === null || lastAttempts <= 1)) {
    return { result: 'stalled', attempts: lastAttempts, falls: lastFalls };
  }
  if (lastAttempts !== null && lastAttempts > 1) return { result: 'died', attempts: lastAttempts, falls: lastFalls };
  return { result: 'not-completed', attempts: lastAttempts, falls: lastFalls };
}

export function computeMetrics(trace, { events, wallTimeMs, achievedSampleIntervalsMs }) {
  const fidelity = dominantFidelity(trace);
  const hbDetected = trace.some((s) => s.fidelity === 'full');
  const idle = computeIdleTime(trace);
  const vertical = computeVerticalRange(trace);
  const closestCrushApproach = computeClosestCrushApproach(trace);
  const jumpCounts = computeJumpCounts(trace);
  const deathAndDamage = computeDeathAndDamageEvents(trace);
  const route = inferRoute(trace);
  const darePocket = computeDarePocket(trace);
  const outcome = computeOutcome(trace);

  const keydowns = events.filter((e) => e.type === 'keydown').length;
  const keyups = events.filter((e) => e.type === 'keyup').length;
  const inputDensityEventsPerSec = wallTimeMs > 0 ? +(events.length / (wallTimeMs / 1000)).toFixed(2) : 0;

  const avgSampleIntervalMs = achievedSampleIntervalsMs.length
    ? +(achievedSampleIntervalsMs.reduce((a, b) => a + b, 0) / achievedSampleIntervalsMs.length).toFixed(1)
    : null;
  const maxSampleIntervalMs = achievedSampleIntervalsMs.length ? Math.max(...achievedSampleIntervalsMs) : null;

  return {
    fidelity, hbDetected,
    outcome,
    idleTime: idle,
    verticalRange: vertical,
    closestCrushApproachTiles: closestCrushApproach,
    jumpCounts,
    deaths: deathAndDamage.deaths,
    hitsWithoutDeath: deathAndDamage.hitsWithoutDeath,
    route,
    darePocket,
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
