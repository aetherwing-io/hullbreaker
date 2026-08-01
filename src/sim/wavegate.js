/* ====================== WAVES: GATE RUNTIME ======================= */
/* Scroll halts at each corner until the wave is cleared; the killing
   shot triggers the corner ritual — wind-up, two yaw snaps with a
   ratchet hold, brick-slam zipper building the next face — then the
   scroll eases back in. Byte-identical at all six corners. */

import { CONFIG } from '../config.js';
import { CORNER_S } from '../pure/path.js';
import { waveSize, waveLane, zipperOffset } from '../pure/waves.js';
import { ACTIVE_FIXTURE } from '../mode.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import {
  slamSets, farSets, columnHasGround, columnBuilt, settleColumn, spawnLaneY,
} from './level.js';
import { hostiles, ENEMY, spawnHostile } from './hostiles.js';

export const cornerEvents = CORNER_S.map((s, i) => ({ s, k: i + 1, state: 'idle', tStart: 0 }));

export function activeCorner() {         // first corner not yet completed
  if (ACTIVE_FIXTURE) return null;        // fixtures author their own transitions
  for (const c of cornerEvents) if (c.state !== 'done') return c;
  return null;
}

export function gateActive() {
  const c = activeCorner();
  return !!c && c.state === 'gate';
}

export function cornerBusy() {           // gate fight or turning: scroll is held
  const c = activeCorner();
  return !!c && (c.state === 'gate' || c.state === 'turning');
}

export function armGate(c) {
  c.state = 'gate';
  spawnGateWave(c.k);
}

function spawnGateWave(k) {              // deterministic: no rng in wave layout
  const W = CONFIG.waves;
  const n = waveSize(k, CONFIG);
  // Materialize IN the arena: the view is frozen during a gate, so the wave
  // condenses out of the tower depth in front of the player — staggered
  // right-to-left, one presence at a time. Placement is bounded by the real
  // (aspect-corrected) view edges and never crosses onto the unbuilt face,
  // so this is safe at any window shape.
  const pivot = CORNER_S[k - 1];
  const right = Math.min(sRightEdge() - 2, pivot - 2);
  const left = Math.min(sLeftEdge() + 6, right - 4);
  const span = Math.max(right - left, 4);
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const sx = right - f * span;
    const lane = waveLane(k, i, CONFIG);       // authored altitude mix per wave
    spawnHostile(sx, spawnLaneY(sx, lane), i * W.staggerMs);
  }
}

// Event-driven clear: called from every wasp removal path, so the ritual
// starts on the exact frame the last hostile dies — the snap IS the stinger.
export function onHostileRemoved() {
  const c = activeCorner();
  // `e.gating` is the kind's value unless the spawn row opted out (T-009's
  // ambient houndframe stations do — see src/sim/hostiles.js).
  if (c && c.state === 'gate' && !hostiles.some(e => e.gating)) {
    c.state = 'turning';
    c.tStart = gameMs;
  }
}

export function finishCorner(c) {
  updateZipper(c, 1e9);                  // lock every slam column to base
  revealFaceRest(c);                     // rest of the face commits, fog-covered
  c.state = 'done';
  view.corner.finished(c);               // render: the camera keeps the new heading
}

function revealFaceRest(c) {             // beyond the zipper strip: one distant commit
  for (const s of farSets[c.k - 1]) {
    if (!columnHasGround(s) || columnBuilt(s)) continue;
    settleColumn(s);
  }
  view.level.faceRevealed(c);            // render: base matrices + this face's catwalks
}

export function updateZipper(c, tMs) {   // near-to-far brick slam of the next face
  const cols = slamSets[c.k - 1];
  for (let j = 0; j < cols.length; j++) {
    const s = cols[j];
    if (!columnHasGround(s) || columnBuilt(s)) continue;   // gap column, or already locked
    const z = zipperOffset(tMs, j, CONFIG);
    if (z.phase === 'hidden') continue;
    view.level.zipperColumn(s, z.dy, z.phase === 'locked');
    if (z.phase === 'locked') settleColumn(s);
  }
}

// run reset (resetGame in src/main.js): every corner is armed again
export function resetCornerEvents() {
  for (const c of cornerEvents) { c.state = 'idle'; c.tStart = 0; }
}
