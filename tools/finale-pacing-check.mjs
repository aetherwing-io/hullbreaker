#!/usr/bin/env node
/* Focused contract for the Level 1 Crown score. Renderer-free and fast: pure
 * pressure decisions plus two identical accelerated real-runtime replays. */

import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import {
  finaleEarnedClear, finalePacketDue, finalePowerBand, finalePressurePlan,
  finaleStage,
} from '../src/pure/finale.js';
import {
  FINALE_PACKETS, FINALE_PRESSURE, FINALE_TIMING, finaleComplete,
  finaleSnapshot, resetFinale, startFinale, updateFinale,
} from '../src/sim/finale.js';
import {
  clearHostiles, forceBreakHostile, hostiles, resetHostileRng,
} from '../src/sim/hostiles.js';
import { END_SCROLL } from '../src/sim/level.js';
import { advanceGameMs, setScrollX } from '../src/sim/time.js';

let passes = 0;
function pass(condition, message) {
  assert.ok(condition, message);
  passes++;
  console.log(`PASS ${message}`);
}
function same(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  passes++;
  console.log(`PASS ${message}`);
}

/* ----------------------------- pure score ------------------------- */

same(finalePowerBand({
  clearEmaMs: 2800, kills: 1, earnedDamage: 0, defendElapsedMs: 6000,
}), 0, 'a measured slow clear keeps the authored Crown pressure band');
same(finalePowerBand({
  clearEmaMs: 520, kills: 5, earnedDamage: 36, defendElapsedMs: 3200,
}), 3, 'observed fast clears and seal damage select the highest bounded band');

pass(!finalePacketDue({
  wave: 1, elapsedMs: 1800, earnedDamage: 36, packets: FINALE_PACKETS,
  windowDamage: CONFIG.warden.windowDamage, readyElapsedMs: 2100,
}), 'seal damage cannot collapse the named inter-packet cadence');
pass(finalePacketDue({
  wave: 1, elapsedMs: 2100, earnedDamage: 0, packets: FINALE_PACKETS,
  windowDamage: CONFIG.warden.windowDamage, readyElapsedMs: 2100,
  powerBand: 2, clearEmaMs: 700, supportThreats: 0, queuedSupport: 0,
}), 'a fast empty clear advances the next authored packet at its cadence edge');

const noFlood = finalePressurePlan({
  nowMs: 5000, liveSupport: 4, queuedSupport: 5, powerBand: 3,
  lastSpawnAtMs: 0, emptySinceMs: -1, adaptiveSpawned: 0,
  adaptiveCap: FINALE_PRESSURE.adaptiveCap,
}, FINALE_PRESSURE);
same(noFlood.spawn, '', 'the four-support cap refuses an unavoidable fifth body');
const drainOne = finalePressurePlan({
  nowMs: 5000, liveSupport: 2, queuedSupport: 5, powerBand: 3,
  lastSpawnAtMs: 0, emptySinceMs: -1, adaptiveSpawned: 0,
  adaptiveCap: FINALE_PRESSURE.adaptiveCap,
}, FINALE_PRESSURE);
same(drainOne.spawn, 'queued', 'a dominant clear drains exactly one queued answer');
const promptRefill = finalePressurePlan({
  nowMs: 5000, liveSupport: 0, queuedSupport: 0, powerBand: 3,
  lastSpawnAtMs: 4500, emptySinceMs: 4800, adaptiveSpawned: 1,
  adaptiveCap: FINALE_PRESSURE.adaptiveCap,
}, FINALE_PRESSURE);
same(promptRefill.spawn, 'adaptive', 'an empty high-power field earns a prompt reviewed-form refill');
const cappedRefill = finalePressurePlan({
  nowMs: 5000, liveSupport: 0, queuedSupport: 0, powerBand: 3,
  lastSpawnAtMs: 0, emptySinceMs: 0,
  adaptiveSpawned: FINALE_PRESSURE.adaptiveCap,
  adaptiveCap: FINALE_PRESSURE.adaptiveCap,
}, FINALE_PRESSURE);
same(cappedRefill.spawn, '', 'the adaptive refill deck cannot accumulate unbounded debt');

pass(!finaleEarnedClear({
  defendElapsedMs: 9000, minEarnedMs: 6500, wave: 3, packetCount: 3,
  wardenBroken: true, supportThreats: 0, queuedSupport: 1,
}), 'an invisible queued packet cannot be skipped by completion');
pass(finaleEarnedClear({
  defendElapsedMs: 9000, minEarnedMs: 6500, wave: 3, packetCount: 3,
  wardenBroken: true, supportThreats: 0, queuedSupport: 0,
}), 'the honest empty score can release immediately');
same([
  finaleStage({ phase: 'arming' }),
  finaleStage({ phase: 'defend', wave: 1 }),
  finaleStage({ phase: 'defend', wave: 2 }),
  finaleStage({ phase: 'defend', wave: 3 }),
  finaleStage({ phase: 'defend', wave: 3, wardenBroken: true }),
  finaleStage({ phase: 'transmit' }),
  finaleStage({ phase: 'answer' }),
  finaleStage({ phase: 'complete' }),
], ['interlock', 'intercept', 'contain', 'scuttle', 'release', 'uplink', 'answer', 'complete'],
'every Warden and carrier stage has one deterministic readable identity');

/* --------------------------- real runtime ------------------------- */

setScrollX(END_SCROLL);

function advance(ms) {
  advanceGameMs(ms);
  updateFinale();
  return finaleSnapshot();
}

function breakSupport() {
  for (const enemy of [...hostiles]) {
    if (enemy.kind !== 'warden') forceBreakHostile(enemy, 'R');
  }
}

function normalized(snapshot) {
  return {
    phase: snapshot.phase,
    stage: snapshot.stage,
    wave: snapshot.wave,
    live: snapshot.pressure.live,
    queued: snapshot.pressure.queued,
    band: snapshot.pressure.powerBand,
    adaptive: snapshot.pressure.adaptiveSpawned,
    total: snapshot.pressure.totalSpawned,
    maxLive: snapshot.pressure.maxLive,
    warden: snapshot.warden.defeated ? 'broken' : snapshot.warden.stage,
  };
}

function runDominantReplay() {
  resetFinale();
  clearHostiles();
  resetHostileRng();
  pass(startFinale(), 'a fresh accelerated Crown runtime starts');
  let snapshot = advance(FINALE_TIMING.armingMs + 1);
  const opening = hostiles.filter((enemy) => enemy.kind !== 'warden');
  same(opening.map((enemy) => [enemy.kind, enemy.ecologyVisualId]), [
    ['hound', 'hound-railfang'],
    ['wasp', 'wasp-diveclaw'],
    ['wasp', 'wasp-diveclaw'],
  ], 'the first readable trio preserves its reviewed neutral forms');

  const timeline = [normalized(snapshot)];
  let wardenBroken = false;
  let maxZeroRunMs = 0;
  let zeroRunMs = 0;
  for (let frame = 0; frame < 120 && snapshot.phase === 'defend'; frame++) {
    breakSupport();
    if (!wardenBroken && snapshot.elapsedMs >= 2450) {
      const warden = hostiles.find((enemy) => enemy.kind === 'warden');
      if (warden) forceBreakHostile(warden, 'R');
      wardenBroken = true;
    }
    snapshot = advance(240);
    if (snapshot.phase === 'defend' && snapshot.pressure.live <= 0) {
      zeroRunMs += 240;
      maxZeroRunMs = Math.max(maxZeroRunMs, zeroRunMs);
    } else zeroRunMs = 0;
    pass(snapshot.pressure.live <= FINALE_PRESSURE.maxSupport,
      `runtime sample ${frame + 1} stays inside the four-support cap`);
    timeline.push(normalized(snapshot));
  }

  pass(snapshot.phase === 'transmit', 'dominant replay reaches transmission without a finale stall');
  pass(snapshot.pressure.powerBand === 3 && snapshot.pressure.adaptiveSpawned > 0,
    'the real score observes dominance and spends bounded reviewed-form refills');
  pass(snapshot.pressure.maxLive <= FINALE_PRESSURE.maxSupport,
    'runtime telemetry never records more than four live support bodies');
  pass(maxZeroRunMs <= 720,
    'accelerated high-DPS replay has no support dead-air run longer than 720ms');

  snapshot = advance(FINALE_TIMING.transmitMs - 1);
  pass(snapshot.phase === 'transmit', 'transmission owns its full named duration');
  snapshot = advance(2);
  pass(snapshot.phase === 'answer' && snapshot.controlRetained &&
      snapshot.answerRemainingMs === FINALE_TIMING.answerMs,
    'Earth answer begins in PLAYING semantics with the full release beat');
  snapshot = advance(FINALE_TIMING.answerMs - 1);
  pass(snapshot.phase === 'answer' && !finaleComplete(),
    'results remain locked through the playable 2.5 second answer');
  snapshot = advance(2);
  pass(snapshot.phase === 'complete' && finaleComplete(),
    'only the completed Earth-answer beat releases the results screen');
  timeline.push(normalized(snapshot));
  return timeline;
}

const firstReplay = runDominantReplay();
const secondReplay = runDominantReplay();
same(secondReplay, firstReplay,
  'two accelerated real-runtime replays produce the same bounded finale timeline');

console.log(`\n${passes} Crown finale pacing checks passed`);
