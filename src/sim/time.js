/* ========================== LOOP / TIME =========================== */
/* The gameplay clock, the forced-scroll cursor, and the slice telemetry
   the rest of the game reads. `gameMs` and `scrollX` are live module
   bindings — importers always see the current value, and only this module
   writes them (advanceGameMs from the main loop, setScrollX from
   sim/scroll.js), so every mutable clock has exactly one owner. */

export let gameMs = 0;          // gameplay clock — only advances while PLAYING
export let scrollX = 0;
export const sliceStats = {
  attempts: 0, failures: 0, falls: 0, airJumps: 0,
  setbacks: 0, lastSetbackAt: -1e9,      // HULL FALLBACK tier 1 (proposal B.1)
  minEdgeMargin: Infinity, startedAt: 0,
};

export function advanceGameMs(ms) { gameMs += ms; }
export function setScrollX(next) { scrollX = next; }

export function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

export function blink(periodMs = 90) { return Math.floor(gameMs / periodMs) % 2 === 0; }
