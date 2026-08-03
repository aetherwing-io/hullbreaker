/* =================== ELASTIC COMBAT PRESSURE ===================== */
/* Deterministic pacing math for the ambient director.  The authored spawn
   table remains the campaign score; this helper only decides whether an
   empty stretch is long enough to deserve a bounded reinforcement.

   All safety/topology facts are passed in by sim/spawner.js.  Keeping the
   state transition here means a headless probe can replay the exact same
   clear-speed response without importing the renderer, level, or mutable
   entity arrays. */

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function newPressureState(nowMs = 0) {
  return {
    face: 0,
    faceBodies: 0,
    totalBodies: 0,
    idleSinceMs: nowMs,
    engagedAtMs: -1,
    engagedKills: 0,
    lastSpawnAtMs: nowMs - 1e9,
    lastKillAtMs: nowMs - 1e9,
    clearEmaMs: 0,
    prevAlive: 0,
    prevKills: 0,
    armed: false,
  };
}

// Fast players wait less, but never less than the explicit fairness floor.
// `clearEmaMs === 0` means no complete encounter has been observed yet, so
// the authored per-face idle time is used unchanged.
export function pressureLullMs(state, face, tune) {
  const base = tune.idleMsByFace[Math.max(0, Math.min(
    tune.idleMsByFace.length - 1, face - 1,
  ))];
  if (!(state.clearEmaMs > 0)) return base;
  const fast = 1 - clamp01(
    (state.clearEmaMs - tune.fastClearMs) /
    Math.max(1, tune.slowClearMs - tune.fastClearMs),
  );
  const ordinary = Math.max(tune.minIdleMs, base - fast * tune.fastIdleBonusMs);
  // Once a later-face player has proved they can erase a formation inside
  // the response threshold, the next visible materialization IS the inhale.
  // Do not make them wait through a second, invisible pause first. Early
  // faces retain the authored lesson rhythm and a slow clear never enters
  // this band.
  const responding = face >= tune.responseFromFace &&
    state.clearEmaMs <= tune.responseClearMs;
  return responding ? Math.min(ordinary, tune.responseIdleMs) : ordinary;
}

function responseActive(state, face, tune) {
  return face >= tune.responseFromFace && state.clearEmaMs > 0 &&
    state.clearEmaMs <= tune.responseClearMs;
}

function beginFace(state, face, nowMs) {
  state.face = face;
  state.faceBodies = 0;
  state.idleSinceMs = nowMs;
  state.engagedAtMs = -1;
  state.engagedKills = state.prevKills;
  state.prevAlive = 0;
  // The run is armed globally after its first authored body.  Do not clear
  // that proof at a corner: the next face may open on a genuinely long gap.
}

function observeCombat(state, ctx, tune) {
  const now = ctx.nowMs;
  const alive = Math.max(0, ctx.aliveThreats | 0);
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
    // Score output per body, not wall time from the first arrival to the last
    // one. Authored formations deliberately overlap across several seconds;
    // treating that score duration as player clear time made an obliterating
    // gun look "slow" and prevented the response from ever waking up.
    const bodiesCleared = Math.max(1, kills - state.engagedKills);
    const sample = state.engagedAtMs >= 0
      ? Math.max(tune.fastClearMs * 0.5, (now - state.engagedAtMs) / bodiesCleared)
      : tune.fastClearMs;
    state.clearEmaMs = state.clearEmaMs > 0
      ? state.clearEmaMs * (1 - tune.clearEmaWeight) + sample * tune.clearEmaWeight
      : sample;
    state.idleSinceMs = now;
    state.engagedAtMs = -1;
  } else if (state.idleSinceMs < 0) {
    state.idleSinceMs = now;
  }

  // A high-powered volley can materialize and erase a body between two
  // director samples.  The kill edge still proves a fast clear; record a
  // conservative fast sample instead of treating it as no encounter at all.
  if (gained && alive === 0 && state.prevAlive === 0) {
    const sample = Math.max(tune.fastClearMs * 0.5, tune.fastClearMs / gained);
    state.clearEmaMs = state.clearEmaMs > 0
      ? state.clearEmaMs * (1 - tune.clearEmaWeight) + sample * tune.clearEmaWeight
      : sample;
    state.idleSinceMs = now;
  }

  state.prevAlive = alive;
  state.prevKills = kills;
}

/* Mutates only the explicit state and returns the number of reinforcement
   bodies to emit (0, 1, or 2).  `safe` is the sim's compound spatial fence:
   on-screen room ahead of RIG, current-face/corner clearance, and lesson
   protection.  A false value can suppress this forever without accumulating
   debt; the director never bursts several deferred waves at once. */
export function stepPressureDirector(state, ctx, tune) {
  const face = Math.max(0, ctx.face | 0);
  if (face !== state.face) beginFace(state, face, ctx.nowMs);
  if (ctx.authoredStarted) state.armed = true;
  observeCombat(state, ctx, tune);

  const cap = tune.maxBodiesByFace[Math.max(0, Math.min(
    tune.maxBodiesByFace.length - 1, face - 1,
  ))] || 0;
  const budget = Math.max(0, cap - state.faceBodies);
  const idleMs = state.idleSinceMs >= 0 ? ctx.nowMs - state.idleSinceMs : 0;
  const responding = responseActive(state, face, tune);
  const cooldownMs = responding ? tune.responseCooldownMs : tune.cooldownMs;
  const imminentTiles = responding
    ? tune.responseImminentAuthoredTiles : tune.imminentAuthoredTiles;
  const remainingTiles = responding
    ? tune.responseMinRemainingTravelTiles : tune.minRemainingTravelTiles;
  const cooldownReady = ctx.nowMs - state.lastSpawnAtMs >= cooldownMs;

  if (!state.armed || ctx.suspended || !ctx.safe || ctx.aliveThreats > 0 || budget <= 0 ||
      !cooldownReady || idleMs < pressureLullMs(state, face, tune) ||
      state.clearEmaMs > tune.mercyClearMs ||
      ctx.nextAuthoredTiles <= imminentTiles ||
      ctx.remainingTravelTiles <= remainingTiles) return 0;

  const fast = state.clearEmaMs > 0 && state.clearEmaMs <= tune.pairClearMs;
  const pair = fast && face >= tune.pairFromFace && budget >= 2 &&
    ctx.spawnRoomTiles >= tune.pairMinPlayerLeadTiles;
  const bodies = pair ? 2 : 1;

  state.faceBodies += bodies;
  state.totalBodies += bodies;
  state.lastSpawnAtMs = ctx.nowMs;
  state.idleSinceMs = -1; // the bodies materialize immediately after this decision
  return bodies;
}
