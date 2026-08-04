#!/usr/bin/env node
/* Fast deterministic Level-1 pressure matrix.
 *
 * Six complete faces are replayed for low, average, and dominant observed
 * play. This is director telemetry, not a renderer test: the one browser
 * replay lives beside it in tools/playtest/adaptive-pressure-runtime.mjs. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CONFIG } from '../src/config.js';
import { enemyGenomeBudget } from '../src/pure/genome.js';
import {
  IMMUNE_PHASES, PRESSURE_BANDS, newPressureState, pressureTelemetry,
  responseSocketViolations, stepPressureDirector,
} from '../src/pure/pressure.js';

const STEP_MS = 50;
const ENTER_MS = CONFIG.wasp.enterMs;
const FACE_MS = 12800;
const TRANSITION_MS = 850;
const AUTHORED_TIMES = Object.freeze([0, 3200, 6500, 9600]);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const round = (value, places = 4) => +Number(value || 0).toFixed(places);

const PROFILES = Object.freeze([
  Object.freeze({
    id: 'low', clearMs: 2600, killSpacingMs: 260,
    progressTps: 2.8, healthRatio: 1,
  }),
  Object.freeze({
    id: 'average', clearMs: 1300, killSpacingMs: 150,
    progressTps: 3.8, healthRatio: 1,
  }),
  Object.freeze({
    id: 'dominant', clearMs: 170, killSpacingMs: 70,
    progressTps: 5.35, healthRatio: 1,
  }),
]);

function createBody(now, profile, adaptive, slot = 0, responseBand = 0) {
  const enterUntil = now + ENTER_MS +
    (adaptive ? slot * CONFIG.spawner.pressure.pairDelayMs : 0);
  // EVOLVE/SURGE bodies spend a little more time making spatial decisions.
  // This is not HP: it models the reviewed vault/sweep/strafe grammar before
  // the same synthetic clear lands.
  const decisionMs = adaptive ? [0, 60, 140, 220][responseBand] || 0 : 0;
  return {
    adaptive,
    responseBand,
    enterUntil,
    deathAt: enterUntil + decisionMs + profile.clearMs + slot * profile.killSpacingMs,
  };
}

function profileVitals(profile, face, local, recoveryProbe) {
  if (!recoveryProbe) return { healthRatio: profile.healthRatio, falls: 0, setbacks: 0 };
  // One honest damage event, then one later HULL fallback. Health recovery is
  // allowed so the fall counter—not a permanently low hull—proves the second
  // accessibility edge.
  const damaged = face === 4 && local >= 4000 && local < 6500;
  const fell = face > 5 || (face === 5 && local >= 4200);
  return {
    healthRatio: damaged ? 0.64 : profile.healthRatio,
    falls: fell ? 1 : 0,
    setbacks: fell ? 1 : 0,
  };
}

function simulate(profile, { director = true, recoveryProbe = false } = {}) {
  const D = CONFIG.spawner.pressure;
  const state = newPressureState(0);
  const bodies = [];
  const spawnLog = [];
  const faceRows = [];
  const recoveryRows = [];
  let kills = 0;
  let progress = 0;
  let now = 0;
  let authoredStarted = false;

  for (const face of [1, 2, 3, 4, 5, 6]) {
    const faceStart = now;
    const faceEnd = faceStart + FACE_MS;
    const transitionAt = faceEnd - TRANSITION_MS;
    let authoredIndex = 0;
    let baselineActiveMs = 0;
    let baselineEmptyMs = 0;
    let baselineEmptySince = -1;
    let baselineEmptyMaxMs = 0;
    let faceBandMin = 99;
    let faceBandMax = 0;
    let facePeakCommitted = 0;
    let facePeakAdaptive = 0;
    let faceSpawnBodies = 0;

    for (; now <= faceEnd; now += STEP_MS) {
      const local = now - faceStart;
      while (authoredIndex < AUTHORED_TIMES.length &&
          local >= AUTHORED_TIMES[authoredIndex]) {
        bodies.push(createBody(now, profile, false));
        authoredIndex++;
        authoredStarted = true;
      }

      for (let i = bodies.length - 1; i >= 0; i--) {
        if (now < bodies[i].deathAt) continue;
        bodies.splice(i, 1);
        kills++;
      }

      const active = bodies.filter((row) => now >= row.enterUntil).length;
      const entering = bodies.length - active;
      const adaptive = bodies.filter((row) => row.adaptive).length;
      const nextAt = authoredIndex < AUTHORED_TIMES.length
        ? AUTHORED_TIMES[authoredIndex] : Infinity;
      const nextAuthoredTiles = Number.isFinite(nextAt)
        ? Math.max(0, (nextAt - local) * profile.progressTps / 1000)
        : Infinity;
      const remainingTravelTiles = Math.max(0,
        (transitionAt - now) * profile.progressTps / 1000);
      const suspended = now >= transitionAt;
      const safe = !suspended && !(local >= 5100 && local < 5400);
      const vitals = profileVitals(profile, face, local, recoveryProbe);
      progress += profile.progressTps * STEP_MS / 1000;

      let emitted = 0;
      let before = bodies.length;
      if (director) {
        emitted = stepPressureDirector(state, {
          nowMs: now,
          face,
          aliveThreats: active,
          enteringThreats: entering,
          committedThreats: bodies.length,
          adaptiveThreats: adaptive,
          kills,
          progressTiles: progress,
          ...vitals,
          authoredStarted,
          suspended,
          safe,
          combatActive: true,
          nextAuthoredTiles,
          remainingTravelTiles,
          spawnRoomTiles: 8,
          environmentImpulse: local === 7450 && face >= 4 ? 1 : 0,
        }, D);
        const telemetry = pressureTelemetry(state);
        faceBandMin = Math.min(faceBandMin, telemetry.responseBand.index);
        faceBandMax = Math.max(faceBandMax, telemetry.responseBand.index);
        facePeakCommitted = Math.max(facePeakCommitted, bodies.length + emitted);
        facePeakAdaptive = Math.max(facePeakAdaptive, adaptive + emitted);
        if (telemetry.accessibility.recovering) {
          recoveryRows.push({
            now, face, reason: telemetry.accessibility.reason,
            band: telemetry.responseBand.index,
            targetLow: telemetry.targetLow,
            emitted,
          });
        }
      } else {
        const windowActive = authoredStarted && !suspended && safe &&
          nextAuthoredTiles > D.imminentAuthoredTiles &&
          remainingTravelTiles > D.minRemainingTravelTiles;
        if (windowActive) {
          baselineActiveMs += STEP_MS;
          if (bodies.length === 0) {
            baselineEmptyMs += STEP_MS;
            if (baselineEmptySince < 0) baselineEmptySince = now;
            baselineEmptyMaxMs = Math.max(baselineEmptyMaxMs, now - baselineEmptySince);
          } else baselineEmptySince = -1;
        } else baselineEmptySince = -1;
      }

      if (emitted) {
        const band = state.responseBand;
        for (let slot = 0; slot < emitted; slot++)
          bodies.push(createBody(now, profile, true, slot, band));
        faceSpawnBodies += emitted;
        spawnLog.push({
          now, face, count: emitted, before,
          band, bandId: PRESSURE_BANDS[band],
          evolutionTier: Math.max(0, band - D.evolutionBand + 1),
          target: [state.targetLow, state.targetHigh],
          adaptiveBefore: adaptive,
          token: round(state.tokenBalance, 3),
          mercy: state.mercy,
          safe, suspended,
        });
      }
    }

    if (director) {
      const telemetry = pressureTelemetry(state);
      faceRows.push({
        face,
        phase: telemetry.phase,
        emptyFieldRatio: telemetry.faceEmptyFieldRatio,
        maxEmptyMs: telemetry.faceEmptyStreakMaxMs,
        dominance: telemetry.dominance,
        bandRange: [faceBandMin === 99 ? 0 : faceBandMin, faceBandMax],
        finalBand: telemetry.responseBand.id,
        target: [telemetry.targetLow, telemetry.targetHigh],
        adaptiveBodies: faceSpawnBodies,
        peakCommitted: facePeakCommitted,
        peakAdaptive: facePeakAdaptive,
        mercy: telemetry.mercy,
      });
    } else {
      faceRows.push({
        face,
        phase: IMMUNE_PHASES[face - 1],
        emptyFieldRatio: baselineActiveMs
          ? round(baselineEmptyMs / baselineActiveMs) : 0,
        maxEmptyMs: baselineEmptyMaxMs,
      });
    }
    // The gate owns its own roster. Ambient carryover never crosses a fold.
    bodies.length = 0;
  }

  const telemetry = director ? pressureTelemetry(state) : null;
  return {
    profile: profile.id,
    mode: director ? 'adaptive' : 'authored-only',
    faceRows,
    spawnLog,
    adaptiveBodies: spawnLog.reduce((sum, row) => sum + row.count, 0),
    telemetry,
    recoveryRows,
    overallEmpty: director ? telemetry.emptyFieldRatio
      : round(faceRows.reduce((sum, row) => sum + row.emptyFieldRatio, 0) /
        faceRows.length),
    maxEmptyMs: Math.max(0, ...faceRows.map((row) => row.maxEmptyMs)),
  };
}

const runs = Object.fromEntries(PROFILES.map((profile) => [profile.id, simulate(profile)]));
const before = simulate(PROFILES[2], { director: false });
const replay = simulate(PROFILES[2]);
const recovery = simulate(PROFILES[2], { recoveryProbe: true });

check(JSON.stringify(runs.dominant) === JSON.stringify(replay),
  'identical dominant input trace did not replay byte-for-byte');
for (const run of Object.values(runs)) {
  check(run.faceRows.length === 6 && run.faceRows.every((row, i) =>
    row.phase === IMMUNE_PHASES[i]), `${run.profile} did not traverse all six phases`);
  check(run.maxEmptyMs <= CONFIG.spawner.pressure.hardEmptyBudgetMs,
    `${run.profile} max active empty stretch ${run.maxEmptyMs}ms exceeds ` +
      `${CONFIG.spawner.pressure.hardEmptyBudgetMs}ms`);
  check(run.spawnLog.every((row) => row.safe && !row.suspended),
    `${run.profile} emitted during an unsafe/transition window`);
  check(run.spawnLog.every((row) => row.before + row.count <= row.target[1]),
    `${run.profile} exceeded its committed targetHigh`);
  check(run.faceRows.every((row) => row.peakAdaptive <=
    CONFIG.spawner.pressure.maxAdaptiveOutstandingByFace[row.face - 1]),
  `${run.profile} exceeded its explicit adaptive live/pending cap`);
  check(run.spawnLog.every((row) => row.count === 1 ||
    row.band >= CONFIG.spawner.pressure.densityBand),
  `${run.profile} bought a pair before SURGE`);
  check(run.spawnLog.every((row) => row.target[0] === 0 ||
    row.band >= CONFIG.spawner.pressure.densityBand),
  `${run.profile} raised low-water before SURGE`);
}

check(runs.low.telemetry.responseBand.maxIndex <= 1,
  `low play escalated past COMPOSE to ${runs.low.telemetry.responseBand.maxId}`);
check(runs.average.telemetry.responseBand.maxIndex === 2,
  `average play should reach EVOLVE without SURGE, got ${runs.average.telemetry.responseBand.maxId}`);
check(runs.dominant.telemetry.responseBand.maxIndex === 3,
  `dominant play never reached SURGE (${runs.dominant.telemetry.responseBand.maxId})`);
check(runs.low.adaptiveBodies === 0 && runs.low.faceRows.every((row) => row.target[0] === 0),
  `low play lost its authored-score breathing room (${runs.low.adaptiveBodies} adaptive bodies)`);
check(runs.dominant.maxEmptyMs < before.maxEmptyMs,
  `dominant refill did not improve max dead air ${before.maxEmptyMs} -> ${runs.dominant.maxEmptyMs}`);
check(before.overallEmpty - runs.dominant.overallEmpty >= 0.10,
  `dominant empty-field improvement too small ${before.overallEmpty} -> ${runs.dominant.overallEmpty}`);

const firstAt = runs.dominant.telemetry.responseBand.firstAtMs;
check(firstAt.slice(1).every((value) => value >= 0) &&
  firstAt[1] < firstAt[2] && firstAt[2] < firstAt[3],
  `response grammar did not stage in order: ${firstAt.join(' -> ')}`);
check(runs.dominant.spawnLog.some((row) => row.band === 2 && row.count === 1) &&
  runs.dominant.faceRows.some((row) => row.peakAdaptive === 2) &&
  runs.dominant.spawnLog.some((row) => row.band === 3 && row.target[0] === 1),
  'dominant trace did not express single-body EVOLVE before SURGE density');

check(recovery.telemetry.accessibility.backoffs === 2,
  `expected one damage and one fall backoff, got ${recovery.telemetry.accessibility.backoffs}`);
check(recovery.recoveryRows.some((row) => row.reason === 'DAMAGE') &&
  recovery.recoveryRows.some((row) => row.reason === 'FALL'),
  'damage/fall accessibility reasons were not both observed');
check(recovery.recoveryRows.every((row) => row.band === 0 && row.targetLow === 0 &&
  row.emitted <= 1), 'accessibility recovery retained mutation/density pressure');
check(recovery.maxEmptyMs <= CONFIG.spawner.pressure.recoveryEmptyBudgetMs,
  `recovery max empty stretch ${recovery.maxEmptyMs}ms exceeds recovery budget`);

const weaponBlindBudget = enemyGenomeBudget({ face: 5, hpRatio: 1, gunTier: 99 });
check(weaponBlindBudget === enemyGenomeBudget({ face: 5, hpRatio: 1, gunTier: 0 }),
  'enemy genome still changed when only weapon tier changed');
check(enemyGenomeBudget({ face: 5, hpRatio: 1, pressureEvolutionTier: 2 }) >
  enemyGenomeBudget({ face: 5, hpRatio: 1, pressureEvolutionTier: 0 }),
  'observed EVOLVE/SURGE tier did not raise the bounded genome budget');

// Unsafe windows may fill the small renewable pool, never accrue a replay
// train. Re-entry owes the current inhale and then at most one bounded cohort.
const debt = newPressureState(0);
debt.armed = true;
debt.clearEmaMs = 450;
debt.dominance = 0.95;
let unsafeBodies = 0;
for (let now = 0; now <= 8000; now += 100) {
  unsafeBodies += stepPressureDirector(debt, {
    nowMs: now, face: 5, aliveThreats: 0, enteringThreats: 0,
    committedThreats: 0, adaptiveThreats: 0, kills: 20,
    progressTiles: 260 + now * 0.008, healthRatio: 1, falls: 0, setbacks: 0,
    authoredStarted: true, suspended: false, safe: false,
    nextAuthoredTiles: Infinity, remainingTravelTiles: 40, spawnRoomTiles: 8,
  }, CONFIG.spawner.pressure);
}
let firstSafeCohort = 0;
let firstSafeAtMs = -1;
for (let now = 8100; now <= 9300 && !firstSafeCohort; now += 50) {
  firstSafeCohort = stepPressureDirector(debt, {
    nowMs: now, face: 5, aliveThreats: 0, enteringThreats: 0,
    committedThreats: 0, adaptiveThreats: 0, kills: 20,
    progressTiles: 325, healthRatio: 1, falls: 0, setbacks: 0,
    authoredStarted: true, suspended: false, safe: true,
    nextAuthoredTiles: Infinity, remainingTravelTiles: 40, spawnRoomTiles: 8,
  }, CONFIG.spawner.pressure);
  if (firstSafeCohort) firstSafeAtMs = now - 8100;
}
check(unsafeBodies === 0, 'unsafe window emitted adaptive bodies');
check(firstSafeAtMs >= 450 && firstSafeAtMs <= CONFIG.spawner.pressure.hardEmptyBudgetMs,
  `safe re-entry response ${firstSafeAtMs}ms is outside the named budget`);
check(firstSafeCohort > 0 && firstSafeCohort <= 2,
  `safe re-entry replayed more than one bounded cohort (${firstSafeCohort})`);

check(responseSocketViolations({
  id: 'gill-f4-a', x: 240, y: 12, face: 4, role: 'high',
  built: true, visible: true, safeExit: true,
}).length === 0, 'valid optional response socket contract failed');
check(responseSocketViolations({ id: '', x: NaN, face: 9 }).length >= 4,
  'invalid optional response socket contract was not rejected');

const source = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');
const spawnerSource = source('../src/sim/spawner.js');
const genomeSource = source('../src/pure/genome.js');
const hostilesSource = source('../src/sim/hostiles.js');
const wavegateSource = source('../src/sim/wavegate.js');
check(/gating:\s*false/.test(spawnerSource) && /currentFacet:/.test(spawnerSource),
  'adaptive rows lost non-gating/current-facet ownership');
check(/faceIndexAt\(sites\.front\.x/.test(spawnerSource) &&
  /faceIndexAt\(sites\.rear\.x/.test(spawnerSource),
  'front/rear sites lost the no-previous/future-facet fence');
check(/pressureEcologyId/.test(spawnerSource) && /pressureEvolutionTier/.test(spawnerSource),
  'reviewed ecology/evolution rows are not wired to adaptive cohorts');
check(/falls:\s*sliceStats\.falls/.test(spawnerSource) &&
  /setbacks:\s*sliceStats\.setbacks/.test(spawnerSource),
  'live accessibility outcomes are not wired to the director');
check(!/gunTier/.test(genomeSource) && !/currentGun/.test(hostilesSource),
  'Meridian still inspects equipped weapon metadata');
check(/pullNextGatePresence\(c\)/.test(wavegateSource) &&
  /!gateRows\(c\)\.some\(e => e\.gating\)/.test(wavegateSource),
  'gate clear is not event-driven from the honestly surviving roster');

const report = {
  ok: failures.length === 0,
  budgets: {
    ordinaryEmptyMs: CONFIG.spawner.pressure.emptyResponseMsByBand[0],
    dominantEmptyMs: CONFIG.spawner.pressure.emptyResponseMsByBand[3],
    hardEmptyMs: CONFIG.spawner.pressure.hardEmptyBudgetMs,
    recoveryEmptyMs: CONFIG.spawner.pressure.recoveryEmptyBudgetMs,
  },
  before: {
    policy: 'authored score only',
    dominantOverallEmpty: before.overallEmpty,
    dominantMaxEmptyMs: before.maxEmptyMs,
    faces: before.faceRows,
  },
  after: Object.fromEntries(Object.entries(runs).map(([id, run]) => [id, {
    overallEmpty: run.overallEmpty,
    maxEmptyMs: run.maxEmptyMs,
    adaptiveBodies: run.adaptiveBodies,
    maxBand: run.telemetry.responseBand.maxId,
    bandFirstAtMs: run.telemetry.responseBand.firstAtMs,
    reserveCredits: run.telemetry.tokens.reserveCredits,
    faces: run.faceRows,
  }])),
  accessibility: {
    backoffs: recovery.telemetry.accessibility.backoffs,
    reasons: [...new Set(recovery.recoveryRows.map((row) => row.reason))],
    maxEmptyMs: recovery.maxEmptyMs,
    recoverySamples: recovery.recoveryRows.length,
  },
  safety: {
    unsafeBodies,
    firstSafeAtMs,
    firstSafeCohort,
    maxCohort: Math.max(0, ...runs.dominant.spawnLog.map((row) => row.count)),
    deterministic: JSON.stringify(runs.dominant) === JSON.stringify(replay),
  },
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
