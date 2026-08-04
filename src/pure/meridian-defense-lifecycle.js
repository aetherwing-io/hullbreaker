/* Deterministic six-face Meridian defense activation.
 *
 * This module owns no renderer, sockets, enemies, or browser state. It turns
 * the current route/corner facts into one bounded lifecycle per face:
 * dormant -> tell -> fire -> recovery -> spent -> dormant. The simulation
 * wrapper is the only caller allowed to translate `impulse: true` into the
 * pressure director's already-fenced environment signal. */

import { MERIDIAN_DEFENSE_STATES } from './meridian-response.js';

export const MERIDIAN_DEFENSE_STAGES = Object.freeze([
  'tell', 'fire', 'recovery', 'spent',
]);

// Observe is intentionally the slowest read. By Scuttle, the same grammar is
// quicker and hotter, but never shorter than a readable 380 ms tell.
export const MERIDIAN_DEFENSE_TIMINGS = Object.freeze([
  Object.freeze({ tell: 620, fire: 180, recovery: 360, spent: 500 }),
  Object.freeze({ tell: 560, fire: 180, recovery: 380, spent: 540 }),
  Object.freeze({ tell: 500, fire: 220, recovery: 440, spent: 600 }),
  Object.freeze({ tell: 460, fire: 220, recovery: 480, spent: 640 }),
  Object.freeze({ tell: 420, fire: 240, recovery: 540, spent: 720 }),
  Object.freeze({ tell: 380, fire: 260, recovery: 720, spent: 900 }),
]);

// State activation begins only after RIG has entered the face far enough that
// an attached hull response cannot be mistaken for an around-the-corner leak.
export const MERIDIAN_DEFENSE_TRIGGER_TILES = Object.freeze([7, 7, 8, 8, 9, 9]);
export const MERIDIAN_DEFENSE_IMPULSE = Object.freeze([0.35, 0.45, 0.60, 0.75, 0.90, 1]);

const clampPhase = (phase) => Math.max(0, Math.min(5, Math.trunc(phase) || 0));

export function meridianDefenseLifecycleAt(elapsedMs, phase) {
  const timing = MERIDIAN_DEFENSE_TIMINGS[clampPhase(phase)];
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  let cursor = 0;
  for (const stage of MERIDIAN_DEFENSE_STAGES) {
    const durationMs = timing[stage];
    if (elapsed < cursor + durationMs) {
      return Object.freeze({
        stage,
        stageElapsedMs: elapsed - cursor,
        stageDurationMs: durationMs,
        progress: Math.max(0, Math.min(1, (elapsed - cursor) / durationMs)),
        complete: false,
      });
    }
    cursor += durationMs;
  }
  return Object.freeze({
    stage: 'dormant', stageElapsedMs: 0, stageDurationMs: 0,
    progress: 0, complete: true,
  });
}

export function newMeridianDefenseLifecycleState() {
  return {
    activatedMask: 0,
    impulseMask: 0,
    active: null,
    activations: 0,
    impulses: 0,
    cancellations: 0,
  };
}

export function resetMeridianDefenseLifecycleState(state) {
  state.activatedMask = 0;
  state.impulseMask = 0;
  state.active = null;
  state.activations = 0;
  state.impulses = 0;
  state.cancellations = 0;
  return state;
}

function dormant(state, routeFace, reason) {
  const phase = Math.max(0, Math.min(5, Math.max(1, routeFace | 0) - 1));
  return {
    stage: 'dormant', state: MERIDIAN_DEFENSE_STATES[phase],
    phase, face: routeFace > 0 ? routeFace : 0,
    progress: 0, elapsedMs: 0, impulse: false,
    reason,
    activations: state.activations,
    impulses: state.impulses,
  };
}

/**
 * Mutates only `state`; returns a serializable presentation snapshot.
 * `ctx` is renderer-free route state:
 *   nowMs, routeFace, cornerFace/state/primed, playerX, faceStart,
 *   authoredArmed, finale, fixture.
 */
export function stepMeridianDefenseLifecycle(state, ctx) {
  const nowMs = Math.max(0, Number(ctx.nowMs) || 0);
  const routeFace = Math.max(0, Math.min(6, Math.trunc(ctx.routeFace) || 0));
  const cornerFace = Math.max(0, Math.min(6, Math.trunc(ctx.cornerFace) || 0));
  const suppressed = !!ctx.fixture || !!ctx.finale || routeFace <= 0 ||
    cornerFace !== routeFace || ctx.cornerState !== 'idle' || !!ctx.cornerPrimed;

  if (suppressed) {
    if (state.active) {
      const bit = 1 << state.active.phase;
      // A gate/turn that interrupts the tell has not yet provoked anything;
      // return that activation token so the same face may retry if it becomes
      // safe again. Once fire queued its one impulse, the face stays spent.
      if (!(state.impulseMask & bit)) state.activatedMask &= ~bit;
      state.active = null;
      state.cancellations++;
    }
    const reason = ctx.fixture ? 'fixture' : ctx.finale ? 'finale' :
      routeFace <= 0 ? 'intro-observe' : 'corner-suppressed';
    return dormant(state, routeFace, reason);
  }

  const phase = routeFace - 1;
  const bit = 1 << phase;
  if (state.active && state.active.face !== routeFace) {
    const activeBit = 1 << state.active.phase;
    if (!(state.impulseMask & activeBit)) state.activatedMask &= ~activeBit;
    state.active = null;
    state.cancellations++;
  }

  if (!state.active && !(state.activatedMask & bit)) {
    const trigger = MERIDIAN_DEFENSE_TRIGGER_TILES[phase];
    const entered = Number(ctx.playerX) >= Number(ctx.faceStart) + trigger;
    if (!!ctx.authoredArmed && entered) {
      state.activatedMask |= bit;
      state.activations++;
      state.active = {
        face: routeFace,
        phase,
        state: MERIDIAN_DEFENSE_STATES[phase],
        startedAtMs: nowMs,
      };
    }
  }

  if (!state.active) return dormant(state, routeFace,
    state.activatedMask & bit ? 'spent' : 'awaiting-activation');

  const elapsedMs = Math.max(0, nowMs - state.active.startedAtMs);
  const lifecycle = meridianDefenseLifecycleAt(elapsedMs, phase);
  if (lifecycle.complete) {
    state.active = null;
    return dormant(state, routeFace, 'spent');
  }

  let impulse = false;
  if (lifecycle.stage === 'fire' && !(state.impulseMask & bit)) {
    state.impulseMask |= bit;
    state.impulses++;
    impulse = true;
  }
  return {
    ...lifecycle,
    face: routeFace,
    phase,
    state: MERIDIAN_DEFENSE_STATES[phase],
    elapsedMs,
    startedAtMs: state.active.startedAtMs,
    impulse,
    impulseStrength: impulse ? MERIDIAN_DEFENSE_IMPULSE[phase] : 0,
    reason: 'active',
    activations: state.activations,
    impulses: state.impulses,
  };
}

export function meridianDefenseLifecycleSnapshot(state) {
  return {
    activatedMask: state.activatedMask,
    impulseMask: state.impulseMask,
    active: state.active ? { ...state.active } : null,
    activations: state.activations,
    impulses: state.impulses,
    cancellations: state.cancellations,
  };
}
