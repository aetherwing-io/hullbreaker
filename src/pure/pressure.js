/* =================== ELASTIC COMBAT PRESSURE ===================== */
/* Deterministic adaptive pacing for Meridian's ambient immune response.

   The campaign spawn table remains the authored score. This director keeps a
   bounded LIVE/COMMITTED threat envelope around a player who has demonstrated
   that the score is no longer occupying them. It never changes hostile HP,
   never grants immunity, never owns a route surface, and never emits a body
   unless sim/spawner.js has already proved an on-screen, topology-safe site.

   The key difference from the first pressure pass is precommitment. Waiting
   for `aliveThreats === 0` produced a sawtooth—erase formation, stare at empty
   hull, watch the next formation condense. Here entering bodies count as
   committed pressure and a replacement can be scheduled while the live count
   reaches the phase's low watermark. Route progress and fast clears renew a
   small token pool; both the pool and outstanding adaptive cohort are capped,
   so an unsafe/lesson/gate window can never accumulate spawn debt. */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);
const faceValue = (rows, face, fallback = 0) => {
  if (!Array.isArray(rows) || !rows.length) return fallback;
  return rows[clamp((face | 0) - 1, 0, rows.length - 1)] ?? fallback;
};

export const IMMUNE_PHASES = Object.freeze([
  'OBSERVE', 'INTERCEPT', 'CONTAIN', 'QUARANTINE', 'STERILIZE', 'SCUTTLE',
]);

export const PRESSURE_BANDS = Object.freeze([
  'CALIBRATE', 'COMPOSE', 'EVOLVE', 'SURGE',
]);

// Optional foreground integration contract. The current runtime deliberately
// continues to use spawner.js's proven front/rear points; a later foreground
// lane may provide these renderer-free rows without importing a mesh or scene.
// `safeExit` means this socket is not the player's only viable route opening.
export const RESPONSE_SOCKET_FIELDS = Object.freeze([
  'id', 'x', 'y', 'face', 'role', 'built', 'visible', 'safeExit',
]);

export function responseSocketViolations(row) {
  const out = [];
  if (!row || typeof row !== 'object') return ['socket must be an object'];
  if (!String(row.id || '')) out.push('socket needs a stable id');
  if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) out.push('socket needs finite x/y');
  if (!Number.isInteger(row.face) || row.face < 1 || row.face > 6)
    out.push('socket face must be 1..6');
  if (!['front', 'rear', 'high', 'deck', 'countermeasure'].includes(row.role))
    out.push('socket role is not a supported response role');
  for (const flag of ['built', 'visible', 'safeExit'])
    if (typeof row[flag] !== 'boolean') out.push(`socket ${flag} must be boolean`);
  return out;
}

export function newPressureState(nowMs = 0) {
  return {
    face: 0,
    phase: IMMUNE_PHASES[0],
    faceBodies: 0,
    totalBodies: 0,
    tokenBalance: 0,
    tokensEarned: 0,
    tokensSpent: 0,
    routeCarryTiles: 0,
    lastProgressTiles: 0,
    idleSinceMs: nowMs,
    emptySinceMs: -1,
    responseDueAtMs: -1,
    environmentProvokedUntilMs: -1,
    environmentSignals: 0,
    engagedAtMs: -1,
    engagedKills: 0,
    lastSpawnAtMs: nowMs - 1e9,
    lastKillAtMs: nowMs - 1e9,
    lastSampleAtMs: nowMs,
    clearEmaMs: 0,
    kills10s: 0,
    progressEmaTps: 0,
    noHitMs: 0,
    healthRatio: 1,
    lastHealthRatio: 1,
    dominance: 0,
    responseBand: 0,
    responseBandMax: 0,
    responseBandReadyAtMs: nowMs,
    responseBandFirstAtMs: [nowMs, -1, -1, -1],
    responseBandTransitions: 0,
    evolutionExpressed: false,
    evolutionCohorts: 0,
    targetLow: 0,
    targetHigh: 1,
    committedThreats: 0,
    enteringThreats: 0,
    adaptiveThreats: 0,
    activeMs: 0,
    emptyMs: 0,
    faceActiveMs: 0,
    faceEmptyMs: 0,
    emptyStreakMaxMs: 0,
    faceEmptyStreakMaxMs: 0,
    responseSamples: 0,
    responseLatencyEmaMs: 0,
    responseLatencyMaxMs: 0,
    lastResponseLatencyMs: 0,
    prevAlive: 0,
    prevCommitted: 0,
    prevKills: 0,
    prevFalls: 0,
    prevSetbacks: 0,
    recoveryUntilMs: -1,
    recoveryReason: '',
    accessibilityBackoffs: 0,
    reserveCredits: 0,
    armed: false,
    mercy: false,
  };
}

// Retained as a public, falsifiable pacing calculation: slow/early players get
// the authored inhale; observed band promotion collapses it toward the same
// named empty-field budget used by the live director.
export function pressureLullMs(state, face, tune) {
  const base = faceValue(tune.idleMsByFace, face, tune.minIdleMs);
  if (!(state.clearEmaMs > 0)) return base;
  const fast = 1 - clamp01(
    (state.clearEmaMs - tune.fastClearMs) /
    Math.max(1, tune.slowClearMs - tune.fastClearMs),
  );
  const ordinary = Math.max(tune.minIdleMs, base - fast * tune.fastIdleBonusMs);
  const bandDelay = faceValue(tune.emptyResponseMsByBand,
    (state.responseBand | 0) + 1, tune.emptyResponseMs);
  return Math.min(ordinary, bandDelay);
}

function beginFace(state, face, ctx, tune) {
  state.face = face;
  state.phase = IMMUNE_PHASES[clamp(face - 1, 0, IMMUNE_PHASES.length - 1)];
  state.faceBodies = 0;
  state.faceActiveMs = 0;
  state.faceEmptyMs = 0;
  state.faceEmptyStreakMaxMs = 0;
  state.routeCarryTiles = 0;
  state.lastProgressTiles = Number(ctx.progressTiles) || 0;
  state.tokenBalance = faceValue(tune.initialTokensByFace, face, 0);
  state.idleSinceMs = ctx.nowMs;
  state.emptySinceMs = -1;
  state.responseDueAtMs = -1;
  state.engagedAtMs = -1;
  state.engagedKills = state.prevKills;
  state.prevAlive = 0;
  state.prevCommitted = 0;
  state.prevFalls = Math.max(0, ctx.falls | 0);
  state.prevSetbacks = Math.max(0, ctx.setbacks | 0);
  // Dominance and clear pace persist across a corner: Meridian remembers the
  // play it just observed. Tokens and spawn counts do not.
}

function observeCombat(state, ctx, tune) {
  const now = ctx.nowMs;
  const alive = Math.max(0, ctx.aliveThreats | 0);
  const committed = Math.max(alive, ctx.committedThreats | 0);
  const kills = Math.max(0, ctx.kills | 0);
  const gained = Math.max(0, kills - state.prevKills);
  if (gained) state.lastKillAtMs = now;

  if (alive > 0) {
    if (state.prevAlive <= 0) {
      state.engagedAtMs = now;
      state.engagedKills = kills;
    }
    state.idleSinceMs = -1;
  } else if (state.prevAlive > 0) {
    const bodiesCleared = Math.max(1, kills - state.engagedKills);
    const sample = state.engagedAtMs >= 0
      ? Math.max(tune.fastClearMs * 0.5, (now - state.engagedAtMs) / bodiesCleared)
      : tune.fastClearMs;
    state.clearEmaMs = state.clearEmaMs > 0
      ? state.clearEmaMs * (1 - tune.clearEmaWeight) + sample * tune.clearEmaWeight
      : sample;
    state.idleSinceMs = now;
    state.engagedAtMs = -1;
  } else if (committed <= 0 && state.idleSinceMs < 0) {
    state.idleSinceMs = now;
  }

  // A body can materialize and die between samples. Its kill edge is still a
  // conservative fast-clear observation, not an unobserved empty interval.
  if (gained && alive === 0 && state.prevAlive === 0) {
    const sample = Math.max(tune.fastClearMs * 0.5, tune.fastClearMs / gained);
    state.clearEmaMs = state.clearEmaMs > 0
      ? state.clearEmaMs * (1 - tune.clearEmaWeight) + sample * tune.clearEmaWeight
      : sample;
    state.idleSinceMs = now;
  }

  state.prevAlive = alive;
  state.prevCommitted = committed;
  state.prevKills = kills;
  return gained;
}

function observeDominance(state, ctx, tune, dtMs, gained) {
  const decay10s = Math.exp(-dtMs / Math.max(1, tune.killWindowMs));
  state.kills10s = state.kills10s * decay10s + gained;

  const progress = Number(ctx.progressTiles) || 0;
  const progressed = Math.max(0, progress - state.lastProgressTiles);
  state.lastProgressTiles = progress;
  const instantTps = dtMs > 0 ? progressed * 1000 / dtMs : 0;
  const progressBlend = 1 - Math.exp(-dtMs / Math.max(1, tune.progressEmaMs));
  state.progressEmaTps += (instantTps - state.progressEmaTps) * progressBlend;

  const health = clamp01(Number.isFinite(ctx.healthRatio) ? ctx.healthRatio : 1);
  const damaged = health < state.lastHealthRatio - tune.healthDropEpsilon;
  const falls = Math.max(0, ctx.falls | 0);
  const setbacks = Math.max(0, ctx.setbacks | 0);
  const fallGain = Math.max(0, falls - state.prevFalls);
  const setbackGain = Math.max(0, setbacks - state.prevSetbacks);
  state.prevFalls = falls;
  state.prevSetbacks = setbacks;
  if (damaged || fallGain || setbackGain) {
    const routeFailure = fallGain > 0 || setbackGain > 0;
    const holdMs = routeFailure ? tune.setbackBackoffMs : tune.damageBackoffMs;
    state.recoveryUntilMs = Math.max(state.recoveryUntilMs, ctx.nowMs + holdMs);
    state.recoveryReason = routeFailure ? (fallGain ? 'FALL' : 'SETBACK') : 'DAMAGE';
    state.accessibilityBackoffs += Math.max(1, fallGain, setbackGain);
    // Damage removes the no-hit claim and at least the mutation step. A route
    // failure is stronger: the response returns to CALIBRATE immediately.
    const thresholds = tune.responseBandFrom || [0, 0.28, 0.52, 0.76];
    const ceiling = routeFailure
      ? Math.max(0, (thresholds[tune.compositionBand] || 0.28) - 0.01)
      : Math.max(0, (thresholds[tune.evolutionBand] || 0.52) - 0.01);
    state.dominance = Math.min(state.dominance, ceiling);
    state.noHitMs = 0;
  } else state.noHitMs += dtMs;
  state.healthRatio = health;
  state.lastHealthRatio = health;

  const clearScore = state.clearEmaMs > 0
    ? 1 - clamp01((state.clearEmaMs - tune.fastClearMs) /
        Math.max(1, tune.slowClearMs - tune.fastClearMs))
    : 0;
  const killScore = clamp01(state.kills10s / Math.max(1, tune.dominantKills10s));
  const progressScore = clamp01(state.progressEmaTps / Math.max(0.01, tune.dominantProgressTps));
  const noHitScore = clamp01(state.noHitMs / Math.max(1, tune.dominantNoHitMs));
  let raw = clearScore * tune.dominanceWeights.clear +
    killScore * tune.dominanceWeights.kills +
    progressScore * tune.dominanceWeights.progress +
    noHitScore * tune.dominanceWeights.noHit;
  // Low hull and genuinely slow clears are authoritative mercy signals. They
  // may lower the response; a theoretical weapon never overrides lived play.
  const healthGate = clamp01((health - tune.mercyHealthRatio) /
    Math.max(0.01, tune.fullPressureHealthRatio - tune.mercyHealthRatio));
  raw *= 0.2 + 0.8 * healthGate;
  if (state.clearEmaMs > tune.mercyClearMs) raw *= 0.25;
  const blend = 1 - Math.exp(-dtMs / Math.max(1, tune.dominanceEmaMs));
  state.dominance += (clamp01(raw) - state.dominance) * blend;
  const recovering = ctx.nowMs < state.recoveryUntilMs;
  if (!recovering && state.recoveryReason) state.recoveryReason = '';
  state.mercy = health <= tune.mercyHealthRatio ||
    state.clearEmaMs > tune.mercyClearMs || recovering;
  return progressed;
}

function desiredResponseBand(state, tune) {
  if (state.mercy) return 0;
  const thresholds = tune.responseBandFrom || [0, 0.28, 0.52, 0.76];
  let band = 0;
  for (let i = 1; i < thresholds.length; i++) {
    if (state.dominance >= thresholds[i]) band = i;
  }
  return clamp(band, 0, PRESSURE_BANDS.length - 1);
}

function setResponseBand(state, next, now, tune) {
  const band = clamp(next | 0, 0, PRESSURE_BANDS.length - 1);
  if (band === state.responseBand) return;
  const descending = band < state.responseBand;
  state.responseBand = band;
  if (descending && band < tune.evolutionBand) state.evolutionExpressed = false;
  state.responseBandMax = Math.max(state.responseBandMax, band);
  if (state.responseBandFirstAtMs[band] < 0) state.responseBandFirstAtMs[band] = now;
  state.responseBandTransitions++;
  state.responseBandReadyAtMs = now + tune.responseBandPromotionMs;
}

function updateResponseBand(state, now, tune) {
  const wanted = desiredResponseBand(state, tune);
  if (wanted < state.responseBand) {
    // Backoff is immediate. Ordinary hysteresis prevents a noisy threshold
    // sample from toggling one band every frame.
    if (state.mercy) setResponseBand(state, 0, now, tune);
    else {
      const threshold = tune.responseBandFrom[state.responseBand] || 0;
      if (state.dominance < threshold - tune.responseBandHysteresis)
        setResponseBand(state, wanted, now, tune);
    }
  } else if (wanted > state.responseBand && now >= state.responseBandReadyAtMs) {
    // At most one promotion per hold. COMPOSE and EVOLVE must be observable
    // states before SURGE may purchase another live body.
    if (state.responseBand === tune.evolutionBand && !state.evolutionExpressed) return;
    setResponseBand(state, state.responseBand + 1, now, tune);
  }
}

function emptyResponseDelayMs(state, face, now, tune) {
  if (now < state.recoveryUntilMs) return tune.recoveryEmptyBudgetMs;
  if (state.mercy) return Math.max(tune.mercyIdleMs,
    faceValue(tune.idleMsByFace, face, tune.mercyIdleMs));
  return faceValue(tune.emptyResponseMsByBand, state.responseBand + 1,
    tune.emptyResponseMs);
}

function earnTokens(state, ctx, tune, progressed, gained) {
  const cap = faceValue(tune.tokenCapByFace, state.face, 0);
  const routeTiles = Math.max(0.1, faceValue(tune.routeTilesPerTokenByFace,
    state.face, Infinity));
  state.routeCarryTiles += progressed;
  let routeEarned = Math.floor(state.routeCarryTiles / routeTiles);
  if (routeEarned > 0) state.routeCarryTiles -= routeEarned * routeTiles;

  const demonstratedGain = state.dominance >= tune.tokenDominanceFrom
    ? gained * (tune.killTokenBase + state.dominance * tune.killTokenDominanceGain)
    : gained * tune.killTokenBase;
  const environmentGain = clamp01(Number(ctx.environmentImpulse) || 0) *
    tune.environmentTokenGain;
  const before = state.tokenBalance;
  state.tokenBalance = Math.min(cap,
    state.tokenBalance + routeEarned + demonstratedGain + environmentGain);
  const accepted = state.tokenBalance - before;
  state.tokensEarned += Math.max(0, accepted);

  // Overflow is discarded, including route carry. Unsafe windows can preserve
  // a full small pool, never bank a hidden train of future cohorts.
  if (state.tokenBalance >= cap - 1e-9)
    state.routeCarryTiles = Math.min(state.routeCarryTiles, routeTiles * 0.999);
}

function targetEnvelope(state, tune) {
  let low = faceValue(tune.targetLowByFace, state.face, 0);
  if (state.responseBand >= tune.densityBand && !state.mercy)
    low += faceValue(tune.densityTargetBonusByFace, state.face, 0);
  if (state.mercy) low = 0;
  const max = faceValue(tune.targetMaxByFace, state.face, low + 1);
  const high = Math.min(max, low + Math.max(1, tune.targetBand));
  state.targetLow = Math.max(0, Math.min(low, high));
  state.targetHigh = Math.max(1, high);
}

function responseWindow(state, ctx, tune) {
  const responsive = state.face >= tune.responseFromFace &&
    state.responseBand >= tune.evolutionBand && !state.mercy;
  const imminent = responsive ? tune.responseImminentAuthoredTiles : tune.imminentAuthoredTiles;
  const remaining = responsive
    ? tune.responseMinRemainingTravelTiles : tune.minRemainingTravelTiles;
  return state.armed && ctx.combatActive !== false && !ctx.suspended && !!ctx.safe &&
    ctx.nextAuthoredTiles > imminent && ctx.remainingTravelTiles > remaining;
}

function recordResponseLatency(state, latencyMs, tune) {
  const latency = Math.max(0, latencyMs);
  state.lastResponseLatencyMs = latency;
  state.responseLatencyMaxMs = Math.max(state.responseLatencyMaxMs, latency);
  state.responseLatencyEmaMs = state.responseSamples
    ? state.responseLatencyEmaMs * (1 - tune.responseLatencyEmaWeight) +
      latency * tune.responseLatencyEmaWeight
    : latency;
  state.responseSamples++;
}

function observeEmptyField(state, ctx, tune, dtMs, active) {
  const committed = Math.max(0, ctx.committedThreats | 0);
  if (!active) {
    state.emptySinceMs = -1;
    state.responseDueAtMs = -1;
    return;
  }
  state.activeMs += dtMs;
  state.faceActiveMs += dtMs;
  if (committed <= 0) {
    state.emptyMs += dtMs;
    state.faceEmptyMs += dtMs;
    if (state.emptySinceMs < 0) state.emptySinceMs = ctx.nowMs;
    const stretch = Math.max(0, ctx.nowMs - state.emptySinceMs);
    state.emptyStreakMaxMs = Math.max(state.emptyStreakMaxMs, stretch);
    state.faceEmptyStreakMaxMs = Math.max(state.faceEmptyStreakMaxMs, stretch);
  } else if (state.emptySinceMs >= 0) {
    recordResponseLatency(state, ctx.nowMs - state.emptySinceMs, tune);
    state.emptySinceMs = -1;
  }
}

/**
 * Mutates only `state`; returns 0, 1, or 2 bodies for the already-validated
 * sites supplied by sim/spawner.js. No false `safe` window accrues debt.
 */
export function stepPressureDirector(state, ctx, tune) {
  const face = Math.max(0, ctx.face | 0);
  const now = Number(ctx.nowMs) || 0;
  let dtMs = clamp(now - state.lastSampleAtMs, 0, tune.maxSampleMs);
  state.lastSampleAtMs = now;
  if (face !== state.face) {
    beginFace(state, face, ctx, tune);
    dtMs = 0;
  }
  if (ctx.authoredStarted) state.armed = true;

  const gained = observeCombat(state, ctx, tune);
  const progressed = observeDominance(state, ctx, tune, dtMs, gained);
  updateResponseBand(state, now, tune);
  earnTokens(state, ctx, tune, progressed, gained);
  if (Number(ctx.environmentImpulse) > 0) {
    state.environmentProvokedUntilMs = now + tune.environmentResponseHoldMs;
    state.environmentSignals++;
  }
  targetEnvelope(state, tune);

  const committed = Math.max(0, ctx.committedThreats | 0);
  state.committedThreats = committed;
  state.enteringThreats = Math.max(0, ctx.enteringThreats | 0);
  state.adaptiveThreats = Math.max(0, ctx.adaptiveThreats | 0);
  const active = responseWindow(state, ctx, tune);
  observeEmptyField(state, ctx, tune, dtMs, active);
  if (!active) return 0;

  // A band promotion earned while the field is empty shortens the already-
  // scheduled inhale from the original empty edge. It never lengthens or
  // restarts that clock, so CALIBRATE and COMPOSE were still real states.
  if (state.responseDueAtMs >= 0 && state.emptySinceMs >= 0 && !state.mercy)
    state.responseDueAtMs = Math.min(state.responseDueAtMs,
      state.emptySinceMs + emptyResponseDelayMs(state, face, now, tune));

  const environmentProvoked = now <= state.environmentProvokedUntilMs;
  const envelopeNeed = committed <= state.targetLow
    ? Math.max(1, state.targetHigh - committed) : 0;
  const provokedNeed = environmentProvoked && committed < state.targetHigh
    ? Math.max(1, state.targetHigh - committed) : 0;
  const need = Math.max(envelopeNeed, provokedNeed);
  if (need <= 0) {
    state.responseDueAtMs = -1;
    return 0;
  }

  if (state.responseDueAtMs < 0) {
    let delay = committed <= 0
      ? emptyResponseDelayMs(state, face, now, tune)
      : tune.precommitMs;
    if (environmentProvoked)
      delay = Math.min(delay, tune.environmentResponseMs);
    state.responseDueAtMs = now + delay;
  }
  if (now < state.responseDueAtMs) return 0;

  const cooldown = committed <= 0 ? tune.emptyResponseCooldownMs : tune.precommitCooldownMs;
  if (now - state.lastSpawnAtMs < cooldown) return 0;
  if (state.clearEmaMs > tune.mercyClearMs && !state.mercy) return 0;

  const faceCap = faceValue(tune.maxBodiesByFace, face, 0);
  const faceRoom = Math.max(0, faceCap - state.faceBodies);
  const adaptiveCap = faceValue(tune.maxAdaptiveOutstandingByFace, face, 0);
  const adaptiveRoom = Math.max(0, adaptiveCap - state.adaptiveThreats);
  let tokenBodies = Math.max(0, Math.floor(state.tokenBalance + 1e-9));
  // Route and kill credits remain the ordinary renewable economy. If both
  // have just been spent, one reserve credit enforces the named empty-field
  // ceiling without creating hidden debt or widening either entity cap.
  const emptyForMs = state.emptySinceMs >= 0 ? now - state.emptySinceMs : 0;
  const hardBudget = now < state.recoveryUntilMs || state.mercy
    ? tune.recoveryEmptyBudgetMs : tune.hardEmptyBudgetMs;
  if (committed <= 0 && tokenBodies <= 0 && emptyForMs >= hardBudget &&
      faceRoom > 0 && adaptiveRoom > 0) {
    state.tokenBalance = Math.min(
      faceValue(tune.tokenCapByFace, face, 1), state.tokenBalance + 1);
    tokenBodies = Math.max(0, Math.floor(state.tokenBalance + 1e-9));
    state.tokensEarned++;
    state.reserveCredits++;
  }
  const pairReady = !state.mercy && face >= tune.pairFromFace &&
    state.responseBand >= tune.pairBandFrom &&
    ctx.spawnRoomTiles >= tune.pairMinPlayerLeadTiles;
  const cohortCap = pairReady ? 2 : 1;
  const bodies = Math.min(need, cohortCap, faceRoom, adaptiveRoom, tokenBodies);
  if (bodies <= 0) return 0;

  if (state.emptySinceMs >= 0) {
    recordResponseLatency(state, now - state.emptySinceMs, tune);
    state.emptySinceMs = -1;
  }
  state.faceBodies += bodies;
  state.totalBodies += bodies;
  state.tokensSpent += bodies;
  state.tokenBalance = Math.max(0, state.tokenBalance - bodies);
  state.lastSpawnAtMs = now;
  if (state.responseBand === tune.evolutionBand) {
    state.evolutionExpressed = true;
    state.evolutionCohorts++;
    // The behavior gets one complete readable promotion beat before density
    // can precommit beside it.
    state.responseBandReadyAtMs = Math.max(state.responseBandReadyAtMs,
      now + tune.responseBandPromotionMs);
  }
  state.idleSinceMs = -1;
  state.responseDueAtMs = -1;
  state.environmentProvokedUntilMs = -1;
  return bodies;
}

export function pressureTelemetry(state) {
  return {
    phase: state.phase,
    dominance: +state.dominance.toFixed(3),
    clearEmaMs: +state.clearEmaMs.toFixed(1),
    kills10s: +state.kills10s.toFixed(2),
    progressTps: +state.progressEmaTps.toFixed(2),
    healthRatio: +state.healthRatio.toFixed(3),
    mercy: state.mercy,
    responseBand: {
      index: state.responseBand,
      id: PRESSURE_BANDS[state.responseBand],
      maxIndex: state.responseBandMax,
      maxId: PRESSURE_BANDS[state.responseBandMax],
      firstAtMs: [...state.responseBandFirstAtMs],
      transitions: state.responseBandTransitions,
      evolutionExpressed: state.evolutionExpressed,
      evolutionCohorts: state.evolutionCohorts,
    },
    targetLow: state.targetLow,
    targetHigh: state.targetHigh,
    committedThreats: state.committedThreats,
    enteringThreats: state.enteringThreats,
    adaptiveThreats: state.adaptiveThreats,
    tokenBalance: +state.tokenBalance.toFixed(2),
    emptyFieldRatio: state.activeMs > 0 ? +(state.emptyMs / state.activeMs).toFixed(4) : 0,
    faceEmptyFieldRatio: state.faceActiveMs > 0
      ? +(state.faceEmptyMs / state.faceActiveMs).toFixed(4) : 0,
    responseLatencyMs: {
      last: +state.lastResponseLatencyMs.toFixed(1),
      ema: +state.responseLatencyEmaMs.toFixed(1),
      max: +state.responseLatencyMaxMs.toFixed(1),
      samples: state.responseSamples,
    },
    emptyStreakMaxMs: state.emptyStreakMaxMs,
    faceEmptyStreakMaxMs: state.faceEmptyStreakMaxMs,
    bodies: { face: state.faceBodies, total: state.totalBodies },
    tokens: {
      earned: +state.tokensEarned.toFixed(2),
      spent: state.tokensSpent,
      reserveCredits: state.reserveCredits,
    },
    accessibility: {
      recovering: state.lastSampleAtMs < state.recoveryUntilMs,
      reason: state.recoveryReason,
      remainingMs: Math.max(0, state.recoveryUntilMs - state.lastSampleAtMs),
      backoffs: state.accessibilityBackoffs,
      falls: state.prevFalls,
      setbacks: state.prevSetbacks,
    },
    environment: {
      signals: state.environmentSignals,
      pending: state.environmentProvokedUntilMs >= state.lastSampleAtMs,
    },
  };
}
