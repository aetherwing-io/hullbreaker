/* ======================== MODIFIERS (RARE) ======================== */
/* RAGE 2× fire rate · GHOST SQUAD delayed clone fire · ORBITAL LANCE
   telegraphed screen clear · CHRONO world slow. Stackable, timed.     */

import { CONFIG } from '../config.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { player } from './player.js';
import { fireWeapon } from './weapons.js';
import { hostiles, hitHostile } from './hostiles.js';

// clonesVisible/cloneTrail are the render layer's read model for GHOST SQUAD:
// the sim resolves which trail sample each clone stands on, the renderer only
// places a mesh there.
export const mods = {
  rageUntil: 0, ghostUntil: 0, chronoUntil: 0, lance: null, lanceFlashUntil: 0,
  clonesVisible: false, cloneTrail: CONFIG.mods.ghostDelayMs.map(() => null),
};
export const shotLog = [];                // ghost squad: shots awaiting replay
export const posLog = [];                 // ghost squad: player position trail
// both buffers must outlive the longest clone delay or the trail lookup
// snaps to a stale sample — derived, so retuning ghostDelayMs cannot drift
const GHOST_TRAIL_MS = Math.max(...CONFIG.mods.ghostDelayMs) + 300;

export function applyMod(code) {
  const M = CONFIG.mods;
  if (code === 'RG') mods.rageUntil = gameMs + M.rageMs;
  else if (code === 'GS') mods.ghostUntil = gameMs + M.ghostMs;
  else if (code === 'CH') mods.chronoUntil = gameMs + M.chronoMs;
  else if (code === 'OL') mods.lance = { s: player.x, at: gameMs + M.lanceTelegraphMs };
}

export function logShot(letter, x, y, ax, ay) {
  shotLog.push({ t: gameMs, letter, x, y, ax, ay, fired: CONFIG.mods.ghostDelayMs.map(() => false) });
  if (shotLog.length > 80) shotLog.shift();   // >> ghostMs / min fireRateMs would ever produce
}

// full modifier teardown — the ONLY reset path, shared by loseLife/resetGame
export function clearMods() {
  mods.rageUntil = 0; mods.ghostUntil = 0; mods.chronoUntil = 0;
  mods.lance = null; mods.lanceFlashUntil = 0;
  mods.clonesVisible = false;
  shotLog.length = 0; posLog.length = 0;
  view.mods.cleared();                    // render: clones and beam off, tint cleared
}

export function updateMods() {
  const M = CONFIG.mods;

  // ghost squad: clones trail the player and replay logged shots late.
  // Inactive: buffers stay empty — no trail bookkeeping for a rare mod.
  if (gameMs >= mods.ghostUntil) {
    if (posLog.length) {
      mods.clonesVisible = false;
      shotLog.length = 0; posLog.length = 0;
    }
  } else {
    posLog.push({ t: gameMs, x: player.x, y: player.y });
    while (posLog.length && posLog[0].t < gameMs - GHOST_TRAIL_MS) posLog.shift();
    for (let d = 0; d < M.ghostDelayMs.length; d++) {
      const delay = M.ghostDelayMs[d];
      for (const s of shotLog) {
        if (!s.fired[d] && gameMs >= s.t + delay) {
          s.fired[d] = true;
          fireWeapon(s.letter, s.x, s.y, s.ax, s.ay, true);
        }
      }
      let p = posLog[0];
      for (const q of posLog) { if (q.t <= gameMs - delay) p = q; else break; }
      mods.cloneTrail[d] = p;                  // render: clone d stands on this sample
    }
    mods.clonesVisible = true;
    while (shotLog.length && shotLog[0].t + GHOST_TRAIL_MS < gameMs && shotLog[0].fired.every(Boolean))
      shotLog.shift();
  }

  // orbital lance: telegraph beam, then the strike clears every hostile
  if (mods.lance) {
    const L = mods.lance;
    view.mods.lanceTelegraph(L);               // render: pulsing beam over column L.s
    if (gameMs >= L.at) {
      for (let i = hostiles.length - 1; i >= 0; i--) hitHostile(hostiles[i], i, 999, 'OL');
      mods.lanceFlashUntil = gameMs + M.lanceFlashMs;
      mods.lance = null;
    }
  }

  // clones, telegraph beam, and the screen tint (lance flash > rage red >
  // chrono blue) are all derived from the timers above
  view.mods.sync();
}
