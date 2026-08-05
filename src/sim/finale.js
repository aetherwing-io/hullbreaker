/* ======================= CROWN FINALE ============================ */
/* The normal run's last scroll clamp is a short authored arena, not an
   automatic win.  This module owns only deterministic encounter state and
   hostile placement; render/finale.js listens through the bridge for the
   Crown wake, progress, and signal surge. */

import { CONFIG } from '../config.js';
import { neutralEnemyEcologyVisualId } from '../pure/enemy-ecology.js';
import {
  finaleEarnedClear, finalePacketDue, finalePowerBand, finalePressurePlan,
  finaleStage,
} from '../pure/finale.js';
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
  answerMs: 2500,
  quota: 8,
});

export const FINALE_PRESSURE = Object.freeze({
  maxSupport: 4,
  targetSupport: Object.freeze([2, 3, 3, 4]),
  spawnGapMs: Object.freeze([560, 460, 380, 320]),
  refillDelayMs: Object.freeze([620, 440, 300, 180]),
  packetCadenceMs: Object.freeze([1050, 880, 700, 560]),
  adaptiveCap: 6,
  clearEmaWeight: 0.42,
  clearSampleFloorMs: 220,
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

// A bounded deterministic refill deck. These select reviewed Level 1 forms
// as presentation only: no hidden ecology tactic, genome, HP, or projectile
// enters the finale through this table. The authored packets remain the score;
// these six bodies merely prevent a dominant build from creating dead air.
export const FINALE_REFILLS = Object.freeze([
  Object.freeze({ kind: 'wasp', ecologyVisualId: 'wasp-crosswind',
    x: END_SCROLL + 12, lane: 6.8, dir: 1 }),
  Object.freeze({ kind: 'hound', ecologyVisualId: 'hound-vaultjaw',
    x: END_SCROLL + 21, dir: -1,
    patrol: Object.freeze({ x0: END_SCROLL + 13, x1: END_SCROLL + 23 }) }),
  Object.freeze({ kind: 'polyp', ecologyVisualId: 'polyp-sweepfan',
    x: END_SCROLL + 25, dir: -1, autoCycle: true }),
  Object.freeze({ kind: 'wasp', ecologyVisualId: 'wasp-pincer',
    x: END_SCROLL + 23, lane: 4.4, dir: -1 }),
  Object.freeze({ kind: 'mortar', ecologyVisualId: 'mortar-bracketpod',
    x: END_SCROLL + 27, dir: -1, zoneX: END_SCROLL + 17 }),
  Object.freeze({ kind: 'hound', ecologyVisualId: 'hound-rebound',
    x: END_SCROLL + 15, dir: 1,
    patrol: Object.freeze({ x0: END_SCROLL + 12, x1: END_SCROLL + 22 }) }),
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
let pendingSupport = [];
let nextPacketReadyElapsedMs = 0;
let lastSupportSpawnAtMs = -1e9;
let emptySinceMs = -1;
let supportEngagedAtMs = -1;
let lastSupportClearAtMs = -1;
let previousSupportCount = 0;
let clearEmaMs = 0;
let powerBand = 0;
let adaptiveSpawned = 0;
let totalSupportSpawned = 0;
let maxLiveSupport = 0;

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

function answerRemainingMs() {
  return phase === 'answer'
    ? Math.max(0, FINALE_TIMING.answerMs - (gameMs - phaseAt))
    : 0;
}

function refillRemainingMs() {
  if (phase !== 'defend' || emptySinceMs < 0 ||
      adaptiveSpawned >= FINALE_PRESSURE.adaptiveCap) return 0;
  const delay = FINALE_PRESSURE.refillDelayMs[powerBand] || 0;
  return Math.max(0, delay - (gameMs - emptySinceMs));
}

// Fresh and structured-cloneable on every read. Additive stage/pressure rows
// make the summit's bounded response observable without exposing mutable
// queue entries or renderer-owned state.
export function finaleSnapshot() {
  const warden = wardenSnapshot();
  return {
    phase,
    elapsedMs: elapsed(),
    kills: earnedKills(),
    quota: FINALE_TIMING.quota,
    progress: phaseProgress(),
    wave,
    stage: finaleStage({ phase, wave, wardenBroken }),
    answerRemainingMs: answerRemainingMs(),
    controlRetained: phase === 'answer',
    pressure: {
      live: supportThreatCount(),
      queued: pendingSupport.length,
      cap: FINALE_PRESSURE.maxSupport,
      target: FINALE_PRESSURE.targetSupport[powerBand],
      powerBand,
      clearEmaMs,
      adaptiveSpawned,
      adaptiveCap: FINALE_PRESSURE.adaptiveCap,
      totalSpawned: totalSupportSpawned,
      maxLive: maxLiveSupport,
      nextRefillMs: refillRemainingMs(),
    },
    warden,
  };
}

function spawnEntry(entry, entryWave = wave, source = 'packet', delayMs = 0) {
  const deck = groundTopAt(entry.x);
  const ecologyVisualId = entry.ecologyVisualId ||
    neutralEnemyEcologyVisualId(entry.kind);
  const row = {
    finaleWave: entryWave,
    finaleSource: source,
    gating: false,
    dir: entry.dir,
    autoCycle: entry.autoCycle,
    patrol: entry.patrol,
  };
  if (entry.kind === 'hound') {
    spawnHostile(entry.x, deck + CONFIG.hound.rideY, delayMs, 'hound', row,
      ecologyVisualId);
  } else if (entry.kind === 'polyp') {
    spawnHostile(entry.x, deck + CONFIG.polyp.rootY, delayMs, 'polyp', row,
      ecologyVisualId);
  } else if (entry.kind === 'mortar') {
    row.zone = { x: entry.zoneX, y: groundTopAt(entry.zoneX) };
    spawnHostile(entry.x, deck + CONFIG.mortar.bodyY, delayMs, 'mortar', row,
      ecologyVisualId);
  } else {
    spawnHostile(entry.x, spawnLaneY(entry.x, entry.lane), delayMs, 'wasp', row,
      ecologyVisualId);
  }
  totalSupportSpawned++;
  lastSupportSpawnAtMs = gameMs;
}

function supportThreatCount() {
  let count = 0;
  for (const e of hostiles) {
    if (e.id === wardenId || e.gateBreakExit) continue;
    count++;
  }
  return count;
}

function rememberSupportCount(live) {
  previousSupportCount = live;
  maxLiveSupport = Math.max(maxLiveSupport, live);
  if (live > 0) {
    if (supportEngagedAtMs < 0) supportEngagedAtMs = gameMs;
    if (lastSupportClearAtMs < 0) lastSupportClearAtMs = gameMs;
    emptySinceMs = -1;
  } else {
    if (emptySinceMs < 0) emptySinceMs = gameMs;
    supportEngagedAtMs = -1;
    lastSupportClearAtMs = -1;
  }
}

function observeSupportClear(live) {
  const cleared = Math.max(0, previousSupportCount - live);
  if (cleared > 0) {
    const since = lastSupportClearAtMs >= 0
      ? gameMs - lastSupportClearAtMs
      : supportEngagedAtMs >= 0 ? gameMs - supportEngagedAtMs : 0;
    const sample = Math.max(
      FINALE_PRESSURE.clearSampleFloorMs,
      since / cleared,
    );
    clearEmaMs = clearEmaMs > 0
      ? clearEmaMs * (1 - FINALE_PRESSURE.clearEmaWeight) +
        sample * FINALE_PRESSURE.clearEmaWeight
      : sample;
    lastSupportClearAtMs = gameMs;
  }
  rememberSupportCount(live);
}

function refreshPowerBand() {
  const observed = finalePowerBand({
    clearEmaMs,
    kills: earnedKills(),
    earnedDamage: wardenEarnedDamage,
    defendElapsedMs: Math.max(0, gameMs - phaseAt),
  });
  // Meridian remembers what it has already observed; a longer fight cannot
  // make a previously demonstrated weapon suddenly look weaker.
  powerBand = Math.max(powerBand, observed);
}

function activateDuePacket(t, liveSupport) {
  if (pendingSupport.length > 0 || !finalePacketDue({
    wave,
    elapsedMs: t,
    earnedDamage: wardenEarnedDamage,
    packets: FINALE_PACKETS,
    windowDamage: CONFIG.warden.windowDamage,
    readyElapsedMs: nextPacketReadyElapsedMs,
    powerBand,
    supportThreats: liveSupport,
    queuedSupport: pendingSupport.length,
    clearEmaMs,
  })) return false;

  const packet = FINALE_PACKETS[wave];
  const packetWave = wave + 1;
  wave = packetWave;
  nextPacketReadyElapsedMs = t +
    FINALE_PRESSURE.packetCadenceMs[powerBand];

  if (packetWave === 1) {
    // The authored opening cell is one readable trio and remains identical to
    // the reviewed ecology fixture. Later answers enter through the cap below.
    for (const entry of packet.entries)
      spawnEntry(entry, packetWave, 'packet', Math.max(0, entry.delayMs || 0));
  } else {
    for (const entry of packet.entries)
      pendingSupport.push({ entry, wave: packetWave, source: 'packet' });
  }
  return true;
}

function allowAdaptiveRefill(defendElapsedMs) {
  // Once the player has honestly met every completion condition, the quiet is
  // earned and transmission wins this update. Before then, a fast build gets
  // at most the six reviewed refills above—never spawn debt.
  return !(wardenBroken && wave >= FINALE_PACKETS.length &&
    pendingSupport.length <= 0 && defendElapsedMs >= FINALE_TIMING.earnedMinMs);
}

function applyPressureSpawn(defendElapsedMs) {
  const live = supportThreatCount();
  const plan = finalePressurePlan({
    nowMs: gameMs,
    liveSupport: live,
    queuedSupport: pendingSupport.length,
    powerBand,
    lastSpawnAtMs: lastSupportSpawnAtMs,
    emptySinceMs,
    adaptiveSpawned,
    adaptiveCap: FINALE_PRESSURE.adaptiveCap,
    allowAdaptive: allowAdaptiveRefill(defendElapsedMs),
  }, FINALE_PRESSURE);
  if (plan.spawn === 'queued') {
    const queued = pendingSupport.shift();
    spawnEntry(queued.entry, queued.wave, queued.source, 0);
  } else if (plan.spawn === 'adaptive') {
    const entry = FINALE_REFILLS[adaptiveSpawned % FINALE_REFILLS.length];
    adaptiveSpawned++;
    spawnEntry(entry, wave, 'adaptive', 0);
  }
  rememberSupportCount(supportThreatCount());
  return plan;
}

function beginTransmit() {
  creditedKills = earnedKills();
  phase = 'transmit';
  phaseAt = gameMs;
  pendingSupport.length = 0;
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
  pendingSupport.length = 0;
  nextPacketReadyElapsedMs = FINALE_TIMING.armingMs;
  lastSupportSpawnAtMs = gameMs - 1e9;
  emptySinceMs = -1;
  supportEngagedAtMs = -1;
  lastSupportClearAtMs = -1;
  previousSupportCount = 0;
  clearEmaMs = 0;
  powerBand = 0;
  adaptiveSpawned = 0;
  totalSupportSpawned = 0;
  maxLiveSupport = 0;
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

    let liveSupport = supportThreatCount();
    observeSupportClear(liveSupport);
    creditedKills = earnedKills();
    refreshPowerBand();

    // At most one authored packet becomes active per update. Packet one is
    // its reviewed opening trio; every later body drains through the shared
    // four-threat pressure cap instead of materializing as an unavoidable
    // whole-wave flood.
    activateDuePacket(t, liveSupport);
    const defendElapsedMs = gameMs - phaseAt;
    applyPressureSpawn(defendElapsedMs);
    liveSupport = supportThreatCount();
    const k = creditedKills;
    const heldLongEnough = defendElapsedMs >= FINALE_TIMING.minDefendMs;
    let earnedClear = finaleEarnedClear({
      defendElapsedMs,
      minEarnedMs: FINALE_TIMING.earnedMinMs,
      wave,
      packetCount: FINALE_PACKETS.length,
      wardenBroken,
      supportThreats: liveSupport,
      queuedSupport: pendingSupport.length,
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
      liveSupport = supportThreatCount();
      earnedClear = finaleEarnedClear({
        defendElapsedMs,
        minEarnedMs: FINALE_TIMING.earnedMinMs,
        wave,
        packetCount: FINALE_PACKETS.length,
        wardenBroken,
        supportThreats: liveSupport,
        queuedSupport: pendingSupport.length,
      });
    }
    if (earnedClear || (heldLongEnough && wardenBroken && (mercyReady || hardReady)))
      beginTransmit();
  } else if (phase === 'transmit' && gameMs - phaseAt >= FINALE_TIMING.transmitMs) {
    // Keep the world playable after contact. The carrier is visibly two-way,
    // RIG retains control, and only this honest 2.5s release beat may reveal
    // the score card—never a fake loading hold.
    phase = 'answer';
    phaseAt = gameMs;
  } else if (phase === 'answer' && gameMs - phaseAt >= FINALE_TIMING.answerMs) {
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
  pendingSupport.length = 0;
  nextPacketReadyElapsedMs = 0;
  lastSupportSpawnAtMs = -1e9;
  emptySinceMs = -1;
  supportEngagedAtMs = -1;
  lastSupportClearAtMs = -1;
  previousSupportCount = 0;
  clearEmaMs = 0;
  powerBand = 0;
  adaptiveSpawned = 0;
  totalSupportSpawned = 0;
  maxLiveSupport = 0;
  view.finale.reset();
}
