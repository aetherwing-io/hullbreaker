// metrics.mjs — turns a raw sample trace + the input timeline into the report
// the mission actually cares about. Every field either comes straight from a
// number the game itself computed (edgeMargin, hp, kill count) or is a
// documented derivation over the trace (idle time, route inference,
// protoScore). Nothing here fabricates a value it can't support — fields the
// current fidelity mode can't measure are `null` with an `unavailableReason`
// string next to them, not a guessed number.
//
// T-025 made three fields obey that rule which previously did not, each of
// them asserting something the run had not done:
//   - `deaths` counted `sliceStats.attempts` increments, a counter src/main.js
//     only moves inside a fixture — so every default six-face report read
//     `deaths: 0` for runs that spent two lives (SPRINT I-006). It is now
//     computed from whichever counter is real for the SERVED run, names that
//     counter, and is `null` — never 0 — when neither exists.
//   - route coverage, route inference and the dare-pocket columns were computed
//     against this checkout's own lattice fixture regardless of what the
//     browser was running, crediting a `?ribrun=1` run with four lattice routes
//     it had replaced (SPRINT I-013). They now read the served build's own
//     fixture (lib/fixture.mjs) or are omitted with the reason.
//   - `?enemies=0` is slice-only, so a default-run trace with the flag still
//     carried live hostiles with nothing saying so (SPRINT I-026);
//     `hostilePresence.enemiesFlag` now states whether it took effect, from the
//     run's own roster.
//
// Idle-time definition and the routeIds/protoScore shapes are aligned with
// docs/proposals/2026-07-score-and-setback.md Appendix A.5 ("Instrumentation
// appendix") per the integrator's coordination request — see README.md's
// "Alignment with the score proposal (A.5)" section for the exact mapping
// and the one place this harness's original definition differed from A.5's.

import { describeServedFixture } from './fixture.mjs';
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

// Stock-life accounting. Two sources, preferred in this order:
//
//   'telemetry' — `player.lives` on the frozen ?testapi channel and on
//     HB.snapshot() (src/main.js, published by T-025 for SPRINT I-006 — this
//     was playtest README hook request #9). Exact, present in every slice.
//   'hud' — the HUD's own `RIG ▰▰▰  ×N` readout in `hudTL`, parsed here. The
//     fallback for a dom-fidelity run and for every trace recorded before the
//     telemetry field existed. The traversal slice prints no `×N` at all
//     (src/ui/hud.js gates it on IS_TRAVERSAL_SLICE), so this source is
//     unavailable there.
//
// When both are present they are cross-checked against each other and the
// disagreement (if any) is reported rather than silently preferred away.
//
// Honest limitations, both sources:
//   - poll-rate sampled like everything else, so two deaths inside one sample
//     interval read as one drop of 2 (the delta is summed, so `spent` still
//     totals correctly);
//   - `resetGame()` restores lives to `CONFIG.player.lives`, so only DECREASES
//     are counted — a post-GAME_OVER restart cannot subtract from the total;
//   - inside a FIXTURE nothing ever spends a life (src/sim/player.js loseLife
//     schedules a retry instead), so `spent: 0` there is true and is not a
//     death count — `metrics.deaths` picks the right counter per run kind.
const LIVES_RE = /×\s*(\d+)/;

function livesLedger(readings) {
  let spent = 0;
  const losses = [];
  for (let i = 1; i < readings.length; i++) {
    const drop = readings[i - 1].lives - readings[i].lives;
    if (drop > 0) {
      spent += drop;
      losses.push({
        gameMs: readings[i].gameMs, from: readings[i - 1].lives, to: readings[i].lives,
        // where the run was on the sample before the life was spent, and where
        // it resumed on the sample after — the respawn knock-back, in tiles
        xBefore: typeof readings[i - 1].x === 'number' ? +readings[i - 1].x.toFixed(3) : null,
        x: typeof readings[i].x === 'number' ? +readings[i].x.toFixed(3) : null,
      });
    }
  }
  return { start: readings[0].lives, end: readings[readings.length - 1].lives, spent, losses };
}

function computeLives(trace) {
  const tele = [], hud = [];
  for (const s of trace) {
    const where = { gameMs: s.gameMs ?? null, x: s.x ?? null };
    if (typeof s.lives === 'number') tele.push({ lives: s.lives, ...where });
    const m = typeof s.hudTL === 'string' ? s.hudTL.match(LIVES_RE) : null;
    if (m) hud.push({ lives: Number(m[1]), ...where });
  }
  const teleLedger = tele.length ? livesLedger(tele) : null;
  const hudLedger = hud.length ? livesLedger(hud) : null;
  const crossCheck = teleLedger && hudLedger
    ? {
      telemetrySpent: teleLedger.spent, hudSpent: hudLedger.spent,
      agrees: teleLedger.spent === hudLedger.spent,
    }
    : null;
  const chosen = teleLedger || hudLedger;
  if (!chosen) {
    return {
      start: null, end: null, spent: null, losses: [], source: null, crossCheck: null,
      unavailableReason: 'this trace carries neither player.lives (the ?testapi/HB telemetry ' +
        'field, added T-025) nor a HUD ×N readout (the traversal slice does not print one, ' +
        'src/ui/hud.js) — no life count can be recovered from it',
    };
  }
  return {
    ...chosen,
    source: teleLedger ? 'telemetry' : 'hud',
    crossCheck,
    note: teleLedger
      ? 'stock lives spent, from player.lives on the telemetry channel. Inside a fixture this ' +
        'is 0 by design — fixtures retry instead of spending a life; metrics.deaths names the ' +
        'counter that applies to THIS run.'
      : 'stock lives spent, parsed from the HUD ×N readout (no telemetry lives field in this ' +
        'trace — pre-T-025 recording, or dom fidelity)',
    unavailableReason: null,
  };
}

// Attempt-counter movement. `sliceStats.attempts` increments once per
// resetGame, and src/main.js only does that inside `if (ACTIVE_FIXTURE)` — so
// increments are fixture retries, and on a default six-face run this counter
// never moves at all. That asymmetry is SPRINT I-006: every default-run report
// read `deaths: 0` for runs that spent two lives.
function computeAttemptEvents(trace) {
  let increments = 0, last = null, seen = false;
  const at = [];
  for (const s of trace) {
    if (typeof s.attempts !== 'number') continue;
    seen = true;
    if (last !== null && s.attempts > last) {
      increments += s.attempts - last;
      at.push({ gameMs: s.gameMs ?? null, attempts: s.attempts, x: typeof s.x === 'number' ? +s.x.toFixed(3) : null });
    }
    last = s.attempts;
  }
  return { increments, last, seen, retries: at };
}

// hp drops that did NOT coincide with a death — hits survived. Every mode: hp
// rides the telemetry channel (T-025) and the HUD's ▰ pips before that.
function computeHitsWithoutDeath(trace) {
  let hits = 0, lastHp = null, lastAttempts = null, lastLives = null;
  for (const s of trace) {
    let diedThisSample = false;
    if (typeof s.attempts === 'number') {
      if (lastAttempts !== null && s.attempts > lastAttempts) diedThisSample = true;
      lastAttempts = s.attempts;
    }
    if (typeof s.lives === 'number') {
      if (lastLives !== null && s.lives < lastLives) diedThisSample = true;
      lastLives = s.lives;
    }
    // resetGame()/respawn() also restore hp to max, which would otherwise look
    // like healing; diedThisSample covers that transition so it's excluded.
    if (typeof s.hp === 'number' && typeof lastHp === 'number' && s.hp < lastHp && !diedThisSample) {
      hits += 1;
    }
    if (typeof s.hp === 'number') lastHp = s.hp;
  }
  return hits;
}

/* The death count, with the counter named. THE POINT OF THIS FUNCTION IS THAT
   IT CAN RETURN null: a report that says `0` when the truth is "this run had no
   death counter" is the defect SPRINT I-006 filed, not a conservative default.

   Which counter is right depends on what the SERVED build was running, which
   the harness asks the page rather than infers from the URL (lib/fixture.mjs):

     fixture run (traversal / transform / ?g2=1) — deaths are RETRIES, counted
       as sliceStats.attempts increments. Lives never move there.
     default six-face run — deaths are STOCK LIVES SPENT (player.lives
       decreases). The attempt counter never moves there.
     run kind unknown (no window.HB probe — dom fidelity or a boot failure) —
       only a counter that actually MOVED can be trusted; if neither did, this
       returns null, because "no deaths" and "no counter" are indistinguishable
       from that evidence. */
function computeDeaths(fx, lives, attempts, setbacksFinal) {
  const detail = {
    runKind: fx.known ? fx.kind : 'unknown',
    attemptIncrements: attempts.seen ? attempts.increments : null,
    // when each retry fired, the fixture-run counterpart of lives.losses[]
    attemptRetries: attempts.retries,
    livesSpent: lives.spent,
    setbacksFinal,
  };
  const fixtureScope =
    'fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside ' +
    '`if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.' +
    'setbacks — and a manual R restart increments the same counter.';
  const runScope =
    'stock lives spent on the default six-face run (player.lives decreases; fixtures do not ' +
    'spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — ' +
    'see metrics.score.setbacks — so a fallback-armed run\'s failure story is both numbers.';
  if (fx.known && fx.hasActiveFixture === true) {
    if (!attempts.seen) {
      return {
        deaths: null, deathsSource: null, deathsDetail: detail,
        deathsScope: 'no death counter is readable on this trace',
        deathsUnavailableReason: 'the served build is running a FIXTURE, where deaths are ' +
          'retries counted by sliceStats.attempts — but no sample in this trace carries an ' +
          'attempt number (dom fidelity with no ATTEMPT readout)',
      };
    }
    return {
      deaths: attempts.increments, deathsSource: 'sliceStats.attempts',
      deathsScope: fixtureScope, deathsDetail: detail, deathsUnavailableReason: null,
    };
  }
  if (fx.known && fx.hasActiveFixture === false) {
    if (lives.spent === null) {
      return {
        deaths: null, deathsSource: null, deathsDetail: detail,
        deathsScope: 'no death counter is readable on this trace',
        deathsUnavailableReason: 'the served build is the DEFAULT six-face run, where ' +
          'sliceStats.attempts never increments (src/main.js) and deaths are stock lives — but ' +
          'this trace carries neither player.lives nor a HUD ×N readout. ' + lives.unavailableReason,
      };
    }
    return {
      deaths: lives.spent, deathsSource: 'lives',
      deathsScope: runScope, deathsDetail: detail, deathsUnavailableReason: null,
    };
  }
  // Run kind unknown: trust only a counter that visibly moved.
  if (attempts.seen && attempts.increments > 0) {
    return {
      deaths: attempts.increments, deathsSource: 'sliceStats.attempts',
      deathsScope: fixtureScope + ' (run kind was not probed, but this counter only moves in a fixture)',
      deathsDetail: detail, deathsUnavailableReason: null,
    };
  }
  if (lives.spent !== null && lives.spent > 0) {
    return {
      deaths: lives.spent, deathsSource: 'lives',
      deathsScope: runScope + ' (run kind was not probed, but lives visibly dropped)',
      deathsDetail: detail, deathsUnavailableReason: null,
    };
  }
  return {
    deaths: null, deathsSource: null, deathsDetail: detail,
    deathsScope: 'no death counter is readable on this trace',
    deathsUnavailableReason: 'the served build could not be asked which run it was ' +
      '(' + (fx.reason || 'no fixture probe') + ') and neither counter moved, so "no deaths" ' +
      'and "no counter" cannot be told apart from this trace — deliberately null instead of 0',
  };
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

// Route coverage, computed against the SERVED fixture (lib/fixture.mjs) — not
// against this checkout's src/pure/traversal.js, which is what credited a
// ?ribrun=1 run with four lattice routes it had replaced (SPRINT I-013). With
// no routes in the served build (default six-face run, transform slice), every
// field is null with the reason attached: a route metric that cannot name the
// connectors it matched against is not evidence.
function inferRoute(trace, fx) {
  if (!fx.hasRoutes) {
    return {
      matchedRouteId: null, confidence: null, matchedConnectors: null, routeIds: null,
      fixtureId: fx.id, fixtureSource: fx.known ? 'window.HB.fixture (served build)' : null,
      unavailableReason: fx.routeReason,
    };
  }
  const hf = highFidelitySamples(trace).filter((s) => typeof s.x === 'number' && typeof s.y === 'number');
  if (hf.length === 0) {
    return {
      matchedRouteId: null, confidence: null, matchedConnectors: null, routeIds: null,
      fixtureId: fx.id, fixtureSource: 'window.HB.fixture (served build)',
      unavailableReason: HIGH_FIDELITY_UNAVAILABLE,
    };
  }
  const byId = new Map(fx.connectors.map((c) => [c.id, c]));
  const perRoute = [];
  for (const route of fx.routes) {
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
    fixtureId: fx.id, fixtureSource: 'window.HB.fixture (served build)',
    unavailableReason: null,
    method: `greedy nearest-connector-in-order match against the SERVED build's own fixture (window.HB.fixture, id "${fx.id}"), radius ${ROUTE_MATCH_RADIUS} tiles ` +
      `— approximate, not a topological solve. routeIds (A.5 "route coverage") lists every route with >= ${ROUTE_USED_MIN_CONNECTORS} ` +
      'connectors matched in order; matchedRouteId/confidence is this harness\'s supplementary single-best-guess summary.',
  };
}

// Dare pocket, likewise against the SERVED fixture's own bounds and reward
// letter. A build with no pocket — the default six-face run, the transform
// slice, or ?ribrun=1, which collapses the pocket span to zero width — reports
// `entered: null` and why, never `false`-as-if-measured or, as before,
// `true` because the trace passed through where the lattice's pocket used to be.
function computeDarePocket(trace, fx) {
  if (!fx.hasDarePocket) {
    return { entered: null, enteredMethod: null, rewardTaken: null, unavailableReason: fx.pocketReason };
  }
  const bounds = fx.darePocket.bounds;
  const rewardLetter = fx.darePocket.rewardLetter;
  let entered = false, enteredMethod = null;
  for (const s of trace) {
    if (HIGH_FIDELITY.has(s.fidelity) && typeof s.x === 'number' && s.x >= bounds.x0 && s.x < bounds.x1) {
      entered = true; enteredMethod = 'position-in-bounds'; break;
    }
    if (s.fidelity === 'dom' && s.hudTC && /H WAGER|H ACQUIRED/.test(s.hudTC)) {
      entered = true; enteredMethod = 'hud-text'; break;
    }
  }
  const rewardTaken = rewardLetter ? trace.some((s) => s.weapon === rewardLetter) : null;
  return { entered, enteredMethod, rewardTaken, rewardLetter, unavailableReason: null };
}

/* The run's own verdict. `died` no longer keys off the fixture-only attempt
   counter (SPRINT I-006's residual): the terminal GAME_OVER state and the
   death count from whichever counter applies to this run both produce it, so a
   default six-face run that spent two lives stops reading `not-completed` on
   the first line of its summary. `attempts` is reported as null — not 0 —
   wherever sliceStats.attempts is structurally frozen. */
function computeOutcome(trace, fx, deathInfo) {
  const victorySeen = trace.some(isVictorySample);
  const gameOverSeen = trace.some((s) => s.state === 'GAME_OVER');
  const lastAttemptsSample = [...trace].reverse().find((s) => typeof s.attempts === 'number');
  const lastAttempts = lastAttemptsSample ? lastAttemptsSample.attempts : null;
  const lastFallsSample = [...trace].reverse().find((s) => typeof s.falls === 'number');
  const lastFalls = lastFallsSample ? lastFallsSample.falls : null;
  const attemptsMeaningful = !(fx.known && fx.hasActiveFixture === false);
  const base = {
    attempts: attemptsMeaningful ? lastAttempts : null,
    attemptsUnavailableReason: attemptsMeaningful ? null
      : 'sliceStats.attempts is fixture-only — src/main.js increments it inside ' +
        '`if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is ' +
        'structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.',
    falls: lastFalls,
    deaths: deathInfo.deaths,
    deathsSource: deathInfo.deathsSource,
    gameOverSeen,
  };
  const { idleTimeFraction } = computeIdleTime(trace);
  if (victorySeen) return { result: 'completed', ...base };
  if (gameOverSeen || (deathInfo.deaths !== null && deathInfo.deaths > 0)) {
    return { result: 'died', ...base };
  }
  if (idleTimeFraction !== null && idleTimeFraction > 0.6) return { result: 'stalled', ...base };
  return { result: 'not-completed', ...base };
}

/* What the run was actually fighting, and whether `?enemies=0` meant anything
   here (SPRINT I-026). The flag sets SLICE_ENEMIES_ENABLED (src/mode.js), which
   is read in exactly one place — src/sim/spawner.js, where a FIXTURE spawns its
   authored list. The default six-face run's ambient spawner never consults it,
   so on a non-fixture URL the flag is a silent no-op and a run authored as
   "terrain only, combat isolated" is a live-combat run. This block says so from
   the run's own evidence rather than asking a reader to know it. */
function queryOf(url) {
  try {
    return new URL(url).searchParams;
  } catch (err) {
    const q = String(url || '').split('?')[1];
    return new URLSearchParams(q || '');
  }
}

function computeHostilePresence(trace, url, fx) {
  let maxConcurrent = 0, samplesWithHostiles = 0, sampled = 0;
  const kinds = new Set();
  for (const s of trace) {
    if (!Array.isArray(s.hostiles)) continue;
    sampled++;
    if (s.hostiles.length > 0) samplesWithHostiles++;
    if (s.hostiles.length > maxConcurrent) maxConcurrent = s.hostiles.length;
    for (const h of s.hostiles) if (h && h.kind) kinds.add(h.kind);
  }
  const out = {
    samplesWithHostileRoster: sampled,
    samplesWithHostiles,
    maxConcurrent,
    kindsObserved: [...kinds].sort(),
    enemiesFlag: null,
  };
  if (queryOf(url).get('enemies') !== '0') return out;
  const sliceOnly =
    '?enemies=0 sets SLICE_ENEMIES_ENABLED (src/mode.js), which is read in exactly one place: ' +
    'src/sim/spawner.js, where a FIXTURE spawns its authored list. It is SLICE-ONLY — the ' +
    'default six-face run\'s ambient spawner never consults it (SPRINT I-026).';
  if (sampled === 0) {
    out.enemiesFlag = {
      requested: true, honoured: null, note: sliceOnly +
        ' This trace carries no hostile roster at all (dom fidelity), so whether the flag ' +
        'took effect cannot be read from it.',
    };
    return out;
  }
  const honoured = maxConcurrent === 0;
  out.enemiesFlag = {
    requested: true,
    honoured,
    note: honoured
      ? sliceOnly + ' On this run it held: zero hostile rows across ' + sampled + ' sampled ticks.'
      : sliceOnly + ' On this run it did NOT hold: up to ' + maxConcurrent + ' live hostile rows ' +
        '(' + ([...kinds].sort().join(', ') || 'unknown kinds') + ') were present on ' +
        samplesWithHostiles + ' of ' + sampled + ' sampled ticks' +
        (fx.known ? ', and the served build is the ' + fx.kind : '') +
        '. Any per-gap, pacing or damage number taken from this run inherits hostile ' +
        'contact it was authored to exclude.',
  };
  return out;
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
  if (routeResult.unavailableReason && !airborneKillsResult.unavailableReason &&
      !airborneMsResult.unavailableReason && !idleTimeResult.unavailableReason) {
    // The three time/kill terms are real here; only the A.5 `links` term has no
    // basis, because this harness approximates it from route-connector
    // transitions and the served build authored no routes. Reporting the sum
    // with links silently 0 would state a measurement the run never made.
    return {
      protoScore: null,
      unavailableReason: 'the A.5 `links` term cannot be approximated on this build: ' +
        routeResult.unavailableReason + '. Run with ?score=1 for the game\'s own ' +
        'event-derived link count (metrics.score), which needs no route matcher.',
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

export function computeMetrics(trace, {
  events, wallTimeMs, achievedSampleIntervalsMs, url = '', servedFixture = null,
}) {
  const fidelity = dominantFidelity(trace);
  const highFidelityDetected = trace.some((s) => HIGH_FIDELITY.has(s.fidelity));
  const testapiDetected = trace.some((s) => s.fidelity === 'testapi');
  // What the BROWSER was running, asked of the page once at boot — the subject
  // of every fixture-derived column below (SPRINT I-013).
  const fx = describeServedFixture(servedFixture);
  const idle = computeIdleTime(trace);
  const airborne = computeAirborneMs(trace);
  const vertical = computeVerticalRange(trace);
  const closestCrushApproach = computeClosestCrushApproach(trace);
  const jumpCounts = computeJumpCounts(trace);
  const lives = computeLives(trace);
  const attempts = computeAttemptEvents(trace);
  const lastSetbacksSample = [...trace].reverse().find((s) => typeof s.setbacks === 'number');
  const deathInfo = computeDeaths(fx, lives, attempts,
    lastSetbacksSample ? lastSetbacksSample.setbacks : null);
  const hitsWithoutDeath = computeHitsWithoutDeath(trace);
  const airborneKills = computeAirborneKills(trace);
  const route = inferRoute(trace, fx);
  const darePocket = computeDarePocket(trace, fx);
  const outcome = computeOutcome(trace, fx, deathInfo);
  const hostilePresence = computeHostilePresence(trace, url, fx);
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
    // Which fixture the SERVED build was running, and therefore what the
    // fixture-derived columns below were computed against (or why they are
    // absent). `known: false` means the page could not be asked.
    servedFixture: {
      known: fx.known, kind: fx.kind, id: fx.id, paceId: fx.paceId,
      hasActiveFixture: fx.hasActiveFixture,
      routeCount: fx.routes.length, connectorCount: fx.connectors.length,
      hasDarePocket: fx.hasDarePocket,
      query: fx.query || null,
      source: fx.known ? 'window.HB.fixture + HB.snapshot() on the served page' : null,
      unavailableReason: fx.reason,
    },
    outcome,
    idleTime: idle,
    airborneTime: airborne,
    verticalRange: vertical,
    closestCrushApproachTiles: closestCrushApproach,
    jumpCounts,
    // The death count, from whichever counter is real on THIS run, with the
    // counter named in `deathsSource` and its limits in `deathsScope`. null
    // means "no death counter exists on this trace" — never 0 (SPRINT I-006).
    deaths: deathInfo.deaths,
    deathsSource: deathInfo.deathsSource,
    deathsScope: deathInfo.deathsScope,
    deathsDetail: deathInfo.deathsDetail,
    deathsUnavailableReason: deathInfo.deathsUnavailableReason,
    lives,
    hitsWithoutDeath,
    airborneKills,
    route,
    darePocket,
    hostilePresence,
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
