/* ================================================================== *
 *  FRAME-SCOPED INPUT — verification-only deterministic timeline
 * ================================================================== */
/* The browser harness used to wait until a sampled gameMs crossed an input
   timestamp and then send a CDP KeyboardEvent. That still left two clocks and
   two queues between the script and the simulation. This module is the small,
   renderer-free contract that removes both: a complete schedule is installed
   before modules boot, converted to fixed-step ticks once, and drained at the
   start of the exact simulation update that owns each edge.

   It does not replace real input. src/main.js uses GAMEPLAY_KEYMAP for both
   DOM events and this timeline, so the only difference is delivery. Shell
   controls (pause/restart/title) deliberately stay outside the frame lane:
   they are browser/UI behavior and must continue to be tested with real keys. */

export const FRAME_INPUT_VERSION = 1;

export const GAMEPLAY_KEYMAP = Object.freeze({
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyK: 'jump', KeyJ: 'fire', KeyX: 'fire',
  ShiftLeft: 'strafe', ShiftRight: 'strafe',
  KeyC: 'swap',
  KeyL: 'hook', KeyE: 'hook',
});

export const GAMEPLAY_CODES = Object.freeze(Object.keys(GAMEPLAY_KEYMAP));

const EPSILON = 1e-7;

export function gameMsToInputTick(atMs, fixedDtMs) {
  if (!Number.isFinite(atMs) || atMs < 0)
    throw new Error(`frame input timestamp must be a finite non-negative number, got ${atMs}`);
  if (!Number.isFinite(fixedDtMs) || fixedDtMs <= 0)
    throw new Error(`frame input requires a positive fixed timestep, got ${fixedDtMs}`);
  // t=0 belongs to update 0. Every other timestamp belongs to the first
  // update whose START clock is at or beyond it. The epsilon makes an exact
  // 16.667 boundary stay on tick 1 despite binary floating-point residue.
  return Math.max(0, Math.ceil(atMs / fixedDtMs - EPSILON));
}

function normalizeEvents(events, fixedDtMs) {
  if (!Array.isArray(events)) throw new Error('frame input events must be an array');
  return events.map((raw, sourceIndex) => {
    const t = Number(raw && raw.t);
    const type = raw && raw.type;
    const code = raw && raw.code;
    if (type !== 'keydown' && type !== 'keyup')
      throw new Error(`frame input event ${sourceIndex} has invalid type "${type}"`);
    if (!(code in GAMEPLAY_KEYMAP))
      throw new Error(`frame input event ${sourceIndex} uses non-gameplay code "${code}"`);
    return {
      t, type, code, sourceIndex,
      tick: gameMsToInputTick(t, fixedDtMs),
    };
  }).sort((a, b) => a.tick - b.tick || a.t - b.t ||
    (a.type === b.type ? a.sourceIndex - b.sourceIndex : a.type === 'keyup' ? -1 : 1));
}

export function createFrameInputTimeline({ events, fixedDtMs, stopAtMs, applyEdge }) {
  if (typeof applyEdge !== 'function') throw new Error('frame input needs an applyEdge callback');
  const schedule = normalizeEvents(events, fixedDtMs);
  const terminalMs = Number(stopAtMs);
  if (!Number.isFinite(terminalMs) || terminalMs < 0)
    throw new Error(`frame input stopAtMs must be finite and non-negative, got ${stopAtMs}`);
  const stopTick = gameMsToInputTick(terminalMs, fixedDtMs);
  const ledger = schedule.map((e) => ({
    t: e.t, type: e.type, code: e.code, scheduledTick: e.tick,
    actualDispatchTick: null, actualDispatchGameMs: null,
    gameMsJitterMs: null, dispatchedVia: null,
  }));
  const held = new Set();
  const reassertions = [];
  let next = 0;
  let tick = 0;
  let complete = false;

  function beforeUpdate(nowGameMs) {
    if (complete) return false;
    while (next < schedule.length && schedule[next].tick <= tick) {
      const ev = schedule[next];
      applyEdge(ev.code, ev.type, false);
      if (ev.type === 'keydown') held.add(ev.code); else held.delete(ev.code);
      Object.assign(ledger[next], {
        actualDispatchTick: tick,
        actualDispatchGameMs: nowGameMs,
        gameMsJitterMs: +(nowGameMs - ev.t).toFixed(4),
        dispatchedVia: 'frame',
      });
      next++;
    }
    if (tick >= stopTick) {
      complete = true;
      return false;
    }
    return true;
  }

  // Call exactly once for every update that was entered, including an update
  // that throws after advancing gameMs. This keeps the delivery cursor aligned
  // with the simulation clock the failure/restart path actually observed.
  function afterUpdate() { tick++; }

  function reassertHeld(nowGameMs) {
    if (held.size === 0) return;
    const codes = [...held];
    for (const code of codes) applyEdge(code, 'keydown', true);
    reassertions.push({ tick, gameMs: nowGameMs, codes });
  }

  function snapshot() {
    return {
      version: FRAME_INPUT_VERSION,
      status: complete ? 'complete' : 'running',
      fixedDtMs,
      tick,
      stopAtMs: terminalMs,
      stopTick,
      nextEvent: next,
      eventCount: schedule.length,
      heldCodes: [...held],
      events: ledger.map((e) => ({ ...e })),
      reassertions: reassertions.map((r) => ({ ...r, codes: [...r.codes] })),
    };
  }

  return Object.freeze({ beforeUpdate, afterUpdate, reassertHeld, snapshot });
}
