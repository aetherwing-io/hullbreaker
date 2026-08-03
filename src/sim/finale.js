/* ======================= CROWN FINALE ============================ */
/* The normal run's last scroll clamp is a short authored arena, not an
   automatic win.  This module owns only deterministic encounter state and
   hostile placement; render/finale.js listens through the bridge for the
   Crown wake, progress, and signal surge. */

import { CONFIG } from '../config.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { END_SCROLL, groundTopAt, spawnLaneY } from './level.js';
import {
  clearHostiles, hostiles, kills, removeHostile, spawnHostile,
} from './hostiles.js';

export const FINALE_TIMING = Object.freeze({
  armingMs: 1050,
  minDefendMs: 11000,
  mercyAtMs: 16800,
  mercyKills: 3,
  hardMaxMs: 20500,
  transmitMs: 1150,
  quota: 8,
});

// Three deliberate packets, all inside the flat Crown apron.  `atMs` is
// measured from finale start so packet timing is independent of frame rate.
// Rows carry the same options as campaign/gate spawns; no finale-only hostile
// behavior is hidden in the enemy runtime.
export const FINALE_PACKETS = Object.freeze([
  Object.freeze({
    atMs: FINALE_TIMING.armingMs,
    entries: Object.freeze([
      Object.freeze({ kind: 'hound', x: END_SCROLL + 13, delayMs: 0, dir: -1,
        patrol: Object.freeze({ x0: END_SCROLL + 9, x1: END_SCROLL + 17 }) }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 18, lane: 4.8, delayMs: 140 }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 22, lane: 7.0, delayMs: 340 }),
    ]),
  }),
  Object.freeze({
    atMs: 4450,
    entries: Object.freeze([
      Object.freeze({ kind: 'polyp', x: END_SCROLL + 25, delayMs: 0, dir: -1,
        autoCycle: true }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 11, lane: 6.4, delayMs: 80 }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 17, lane: 3.6, delayMs: 260 }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 23, lane: 5.5, delayMs: 440 }),
    ]),
  }),
  Object.freeze({
    atMs: 7800,
    entries: Object.freeze([
      Object.freeze({ kind: 'mortar', x: END_SCROLL + 27, delayMs: 0, dir: -1,
        zoneX: END_SCROLL + 16 }),
      Object.freeze({ kind: 'hound', x: END_SCROLL + 19, delayMs: 140, dir: -1,
        patrol: Object.freeze({ x0: END_SCROLL + 14, x1: END_SCROLL + 23 }) }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 10, lane: 4.4, delayMs: 100 }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 15, lane: 7.2, delayMs: 300 }),
      Object.freeze({ kind: 'wasp', x: END_SCROLL + 24, lane: 5.8, delayMs: 500 }),
    ]),
  }),
]);

let phase = 'dormant';
let startedAt = 0;
let phaseAt = 0;
let baselineKills = 0;
let creditedKills = 0;
let wave = 0;

function elapsed() {
  return phase === 'dormant' ? 0 : Math.max(0, gameMs - startedAt);
}

function earnedKills() {
  return phase === 'defend'
    ? Math.max(creditedKills, kills - baselineKills)
    : creditedKills;
}

function phaseProgress() {
  const t = elapsed();
  if (phase === 'dormant') return 0;
  if (phase === 'arming') return Math.min(1, t / FINALE_TIMING.armingMs);
  if (phase === 'defend') {
    const timeProgress = Math.min(1, (gameMs - phaseAt) / FINALE_TIMING.minDefendMs);
    const killProgress = Math.min(1, earnedKills() / FINALE_TIMING.quota);
    return Math.min(timeProgress, killProgress);
  }
  if (phase === 'transmit')
    return Math.min(1, (gameMs - phaseAt) / FINALE_TIMING.transmitMs);
  return 1;
}

// Fresh and structured-cloneable on every read.  The six keys are the stable
// contract shared by render/finale.js, telemetry, and headless proof scripts.
export function finaleSnapshot() {
  return {
    phase,
    elapsedMs: elapsed(),
    kills: earnedKills(),
    quota: FINALE_TIMING.quota,
    progress: phaseProgress(),
    wave,
  };
}

function spawnEntry(entry) {
  const deck = groundTopAt(entry.x);
  const row = {
    finaleWave: wave,
    gating: false,
    dir: entry.dir,
    autoCycle: entry.autoCycle,
    patrol: entry.patrol,
  };
  if (entry.kind === 'hound') {
    spawnHostile(entry.x, deck + CONFIG.hound.rideY, entry.delayMs, 'hound', row);
  } else if (entry.kind === 'polyp') {
    spawnHostile(entry.x, deck + CONFIG.polyp.rootY, entry.delayMs, 'polyp', row);
  } else if (entry.kind === 'mortar') {
    row.zone = { x: entry.zoneX, y: groundTopAt(entry.zoneX) };
    spawnHostile(entry.x, deck + CONFIG.mortar.bodyY, entry.delayMs, 'mortar', row);
  } else {
    spawnHostile(entry.x, spawnLaneY(entry.x, entry.lane), entry.delayMs, 'wasp', row);
  }
}

function spawnDuePackets(t) {
  while (wave < FINALE_PACKETS.length && t >= FINALE_PACKETS[wave].atMs) {
    wave++;
    for (const entry of FINALE_PACKETS[wave - 1].entries) spawnEntry(entry);
  }
}

function beginTransmit() {
  creditedKills = earnedKills();
  phase = 'transmit';
  phaseAt = gameMs;
  // Survivors rupture through the ordinary role-aware death presentation.
  // removeHostile deliberately does not award kills: the snapshot remains a
  // record of what the player earned before the Crown answered.
  for (let i = hostiles.length - 1; i >= 0; i--) removeHostile(i, true);
  view.finale.transmit(finaleSnapshot());
}

export function startFinale() {
  if (phase !== 'dormant') return false;
  phase = 'arming';
  startedAt = phaseAt = gameMs;
  wave = 0;
  creditedKills = 0;
  // The arena owns its roster.  A late ambient straggler cannot silently
  // inflate the quota or distract aim assist from the authored first packet.
  clearHostiles();
  baselineKills = kills;
  view.finale.started(finaleSnapshot());
  return true;
}

export function updateFinale() {
  if (phase === 'dormant' || phase === 'complete') return;

  const t = elapsed();
  if (phase === 'arming' && t >= FINALE_TIMING.armingMs) {
    phase = 'defend';
    phaseAt = startedAt + FINALE_TIMING.armingMs;
  }

  if (phase === 'defend') {
    spawnDuePackets(t);
    creditedKills = earnedKills();
    const k = creditedKills;
    const heldLongEnough = gameMs - phaseAt >= FINALE_TIMING.minDefendMs;
    const earnedClear = heldLongEnough && k >= FINALE_TIMING.quota;
    const mercyClear = t >= FINALE_TIMING.mercyAtMs && k >= FINALE_TIMING.mercyKills;
    const hardClear = t >= FINALE_TIMING.hardMaxMs;
    if (earnedClear || mercyClear || hardClear) beginTransmit();
  } else if (phase === 'transmit' && gameMs - phaseAt >= FINALE_TIMING.transmitMs) {
    phase = 'complete';
    phaseAt = gameMs;
  }

  // Exactly one active sync per sim update, after all packet and phase edges.
  view.finale.sync(finaleSnapshot());
}

export function finaleActive() { return phase !== 'dormant'; }
export function finaleComplete() { return phase === 'complete'; }

export function resetFinale() {
  phase = 'dormant';
  startedAt = 0;
  phaseAt = 0;
  baselineKills = 0;
  creditedKills = 0;
  wave = 0;
  view.finale.reset();
}
