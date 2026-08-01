/* ========================== LOOP / TIME =========================== */
/* The gameplay clock, the forced-scroll cursor, and the slice telemetry
   the rest of the game reads. `gameMs` and `scrollX` are live module
   bindings — importers always see the current value, and only this module
   writes them (advanceGameMs from the main loop, setScrollX from
   sim/scroll.js), so every mutable clock has exactly one owner. */

import { CONFIG } from '../config.js';
import { JUICE_ENABLED } from '../mode.js';
import {
  hitStopArm, hitStopEvent, hitStopMsFor, hitStopScaleAt,
} from '../pure/juice.js';
import { view } from './bridge.js';

/* CHRONO convention (sitewide): gameMs always advances at REAL time — the
   main loop calls advanceGameMs(dt*1000) before computing wScale — while
   entity updates receive the CHRONO-scaled dt for movement. So any state
   machine that stores gameMs deadlines (wasp dive/cooldown, hound tell/
   charge, capsule expiry) keeps real-time durations under CHRONO while its
   motion slows. New enemy kinds should reuse this pattern, not fight it. */
/* HIT-STOP (T-011, the one gameplay-affecting piece of the juice pass) lives
   here for the same reason CHRONO's scale is computed next to the loop: it is
   TIMING, and timing is simulation. The renderer may look at hitStopUntil, but
   it can never arm one — a browser run and a renderer-free host step the same
   world. Policy (durations, stacking cap, scale) is CONFIG.juice.hitStop; the
   math is src/pure/juice.js; this module owns the clock and the one edge
   detector that reads it. See stepHitStop below for the frame contract.

   Headless hosts: stepHitStop() is driven from the composition root's update
   loop (src/main.js), next to the CHRONO scale it composes with. A Node host
   that steps the sim modules directly must call it itself — the same shape of
   contract as setEdges() in bridge.js's header — or run with ?juice=0
   semantics, where the scale is a constant 1. */
export let gameMs = 0;          // gameplay clock — only advances while PLAYING
export let scrollX = 0;
export const sliceStats = {
  attempts: 0, failures: 0, falls: 0, airJumps: 0,
  setbacks: 0, lastSetbackAt: -1e9,      // HULL FALLBACK tier 1 (proposal B.1)
  minEdgeMargin: Infinity, startedAt: 0,
};

export function advanceGameMs(ms) { gameMs += ms; }
export function setScrollX(next) { scrollX = next; }

/* --------------------------- hit-stop ----------------------------- */

export let hitStopUntil = 0;             // gameMs deadline; 0 = the world runs
const hitStopPrev = { kills: 0, hp: 0, primed: false };

/* One call per frame, from the composition root, BEFORE any entity update —
   exactly where the CHRONO scale is already computed. It takes the two sim
   facts a beat is worth freezing for (the kill tally and RIG's health, both
   as they stood at the END of the previous frame), arms the clock if either
   moved, and returns the dt SCALE this frame runs at.

   Every input is sim state and gameMs, so the decision is deterministic and
   frame-rate independent: a hit-stop removes ms * (1 - scale) of simulated
   time whatever the cadence. The render layer is only NOTIFIED (view.juice
   .hitStop, presentation-only per the bridge contract) so its shake lands on
   the same frame as the freeze.

   `primed` is what keeps a run start / restart silent: the first sample after
   a reset only seeds the baseline. */
export function stepHitStop(kills, hp) {
  if (!JUICE_ENABLED) return 1;
  const J = CONFIG.juice.hitStop;
  if (!hitStopPrev.primed) {
    hitStopPrev.kills = kills;
    hitStopPrev.hp = hp;
    hitStopPrev.primed = true;
  } else {
    const ev = hitStopEvent(hitStopPrev.kills, kills, hitStopPrev.hp, hp);
    hitStopPrev.kills = kills;
    hitStopPrev.hp = hp;
    if (ev) {
      const ms = hitStopMsFor(ev, J);
      const next = hitStopArm(hitStopUntil, gameMs, ms, J);
      if (next > hitStopUntil) {
        hitStopUntil = next;
        view.juice.hitStop(ev, ms);      // render: the beat, not the timing
      }
    }
  }
  return hitStopScaleAt(gameMs, hitStopUntil, J);
}

// live read for the render layer (particles honour the freeze) and telemetry
export function hitStopRemainingMs() { return Math.max(0, hitStopUntil - gameMs); }

// run reset (resetGame in src/main.js): no freeze and no stale baseline
export function resetHitStop() {
  hitStopUntil = 0;
  hitStopPrev.primed = false;
}

export function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

export function blink(periodMs = 90) { return Math.floor(gameMs / periodMs) % 2 === 0; }
