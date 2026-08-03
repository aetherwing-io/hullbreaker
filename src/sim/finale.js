/* ======================= CROWN FINALE ============================ */
/* The normal run's last scroll clamp is a short authored arena, not an
   automatic win.  This module owns only deterministic encounter state and
   hostile placement; render/finale.js listens through the bridge for the
   Crown wake, progress, and signal surge. */

import { CONFIG } from '../config.js';
import { finaleEarnedClear, finalePacketDue } from '../pure/finale.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { END_SCROLL, groundTopAt, spawnLaneY } from './level.js';
import {
  clearHostiles, forceBreakHostile, hostiles, kills, removeHostile,
  spawnHostile, wardenStage,
} from './hostiles.js';

export const FINALE_TIMING = Object.freeze({
  armingMs: 1050,
  minDefendMs: 11000,
  earnedMinMs: 6500,
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
      Object.freeze({ kind: 'hound', x: END_SCROLL + 17, delayMs: 0, dir: -1,
        patrol: Object.freeze({ x0: END_SCROLL + 13, x1: END_SCROLL + 21 }) }),
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
let wardenId = 0;
let wardenBroken = false;
let wardenEarnedDamage = 0;
let mercyBreak = false;

function elapsed() {
  return phase === 'dormant' ? 0 : Math.max(0, gameMs - startedAt);
}

function earnedKills() {
  return phase === 'defend'
    ? Math.max(creditedKills, kills - baselineKills)
    : creditedKills;
}

function liveWarden() {
  return wardenId ? hostiles.find((e) => e.id === wardenId) || null : null;
}

function wardenSnapshot() {
  const e = liveWarden();
  if (e) {
    wardenEarnedDamage = Math.max(wardenEarnedDamage, e.earnedDamage || 0);
    return {
      present: true,
      defeated: false,
      hp: Math.max(0, e.hp),
      maxHp: e.maxHp,
      health: Math.max(0, e.hp / e.maxHp),
      damage: wardenEarnedDamage,
      stage: wardenStage(e),
      seal: Math.min(4, 1 + Math.floor((e.maxHp - e.hp) / CONFIG.warden.windowDamage)),
      shielded: e.state !== 'exposed',
      attack: e.state,
      mercy: false,
    };
  }
  return {
    present: false,
    defeated: wardenBroken,
    hp: 0,
    maxHp: CONFIG.warden.hp,
    health: 0,
    damage: wardenBroken && !mercyBreak ? CONFIG.warden.hp : wardenEarnedDamage,
    stage: 3,
    seal: 4,
    shielded: false,
    attack: wardenBroken ? 'broken' : 'dormant',
    mercy: mercyBreak,
  };
}

function phaseProgress() {
  const t = elapsed();
  if (phase === 'dormant') return 0;
  if (phase === 'arming') return Math.min(1, t / FINALE_TIMING.armingMs);
  if (phase === 'defend') {
    const timeProgress = Math.min(1, (gameMs - phaseAt) / FINALE_TIMING.earnedMinMs);
    const bossProgress = 1 - wardenSnapshot().health;
    const packetProgress = wave / FINALE_PACKETS.length;
    return Math.min(timeProgress, bossProgress * 0.75 + packetProgress * 0.25);
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
    warden: wardenSnapshot(),
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
  while (finalePacketDue({
    wave,
    elapsedMs: t,
    earnedDamage: wardenEarnedDamage,
    packets: FINALE_PACKETS,
    windowDamage: CONFIG.warden.windowDamage,
  })) {
    wave++;
    for (const entry of FINALE_PACKETS[wave - 1].entries) spawnEntry(entry);
  }
}

function supportThreatCount() {
  let count = 0;
  for (const e of hostiles) {
    if (e.id === wardenId || e.gateBreakExit) continue;
    count++;
  }
  return count;
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
  wardenBroken = false;
  wardenEarnedDamage = 0;
  mercyBreak = false;
  // The arena owns its roster.  A late ambient straggler cannot silently
  // inflate the quota or distract aim assist from the authored first packet.
  clearHostiles();
  baselineKills = kills;
  // The Warden is the Crown's forward interlock, deliberately close enough
  // to remain a centerpiece in a portrait viewport. Its broad art is fused
  // to the apron; only the central iris carries collision.
  // Camera look-ahead centers the held arena near END_SCROLL+7.4. Mount the
  // interlock ahead of RIG on that shoulder, not behind the player at the
  // scroll cursor; the 1.45x presentation body then fills the right half of
  // the Crown composition while its iris remains only a few shots away.
  const bossX = END_SCROLL + 11.4;
  const bossY = groundTopAt(bossX) + CONFIG.warden.bodyY;
  spawnHostile(bossX, bossY, 0, 'warden', {
    finaleWave: 0,
    gating: false,
    dir: -1,
    arena: { x0: END_SCROLL + 2.0, x1: END_SCROLL + 10.0 },
  });
  wardenId = hostiles[hostiles.length - 1]?.id || 0;
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
    const warden = liveWarden();
    if (warden) wardenEarnedDamage = Math.max(wardenEarnedDamage, warden.earnedDamage || 0);
    else if (wardenId) {
      wardenBroken = true;
      // Natural removal can happen inside the bullet loop before this module
      // gets another read of the row. A non-mercy break necessarily spent the
      // final seal, so retain the earned full-health total in telemetry.
      if (!mercyBreak) wardenEarnedDamage = CONFIG.warden.hp;
    }
    // Refresh earned damage before scoring packet edges. A seal broken by the
    // previous frame's volley can therefore wake its answer immediately; the
    // support bodies still owe their full visible materialization tell.
    spawnDuePackets(t);
    creditedKills = earnedKills();
    const k = creditedKills;
    const heldLongEnough = gameMs - phaseAt >= FINALE_TIMING.minDefendMs;
    const earnedClear = finaleEarnedClear({
      defendElapsedMs: gameMs - phaseAt,
      minEarnedMs: FINALE_TIMING.earnedMinMs,
      wave,
      packetCount: FINALE_PACKETS.length,
      wardenBroken,
      supportThreats: supportThreatCount(),
    });

    // A child who has engaged with either the centerpiece or its support
    // wave gets a late Crown-overload assist. The absolute timeout is the
    // final anti-lock: both paths physically break the target first.
    const mercyReady = t >= FINALE_TIMING.mercyAtMs &&
      (wardenEarnedDamage >= 12 || k >= FINALE_TIMING.mercyKills);
    const hardReady = t >= FINALE_TIMING.hardMaxMs;
    if (!wardenBroken && warden && (mercyReady || hardReady)) {
      mercyBreak = true;
      forceBreakHostile(warden, 'CROWN');
      wardenBroken = true;
      creditedKills = earnedKills();
    }
    if (earnedClear || (heldLongEnough && wardenBroken && (mercyReady || hardReady)))
      beginTransmit();
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
  wardenId = 0;
  wardenBroken = false;
  wardenEarnedDamage = 0;
  mercyBreak = false;
  view.finale.reset();
}
