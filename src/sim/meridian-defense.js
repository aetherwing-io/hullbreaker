/* Renderer-free Meridian environment-response controller.
 *
 * One deterministic lifecycle is allowed per current six-face state. Fire
 * onset queues exactly one bounded environment impulse; spawner.js remains
 * the sole authority that waits for a safe window and converts that signal
 * into visible, non-gating adaptive pressure. */

import { CONFIG } from '../config.js';
import { ACTIVE_FIXTURE } from '../mode.js';
import { faceIndexAt } from '../pure/path.js';
import {
  meridianDefenseLifecycleSnapshot, newMeridianDefenseLifecycleState,
  resetMeridianDefenseLifecycleState, stepMeridianDefenseLifecycle,
} from '../pure/meridian-defense-lifecycle.js';
import { view } from './bridge.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { finaleActive } from './finale.js';
import { player } from './player.js';
import {
  notifyPressureEnvironmentChange, pressureDirectorSnapshot,
} from './spawner.js';
import { gameMs } from './time.js';
import { activeCorner } from './wavegate.js';

let lifecycle = newMeridianDefenseLifecycleState();
let lastPresentation = null;

function frameContext() {
  const corner = activeCorner();
  const routeFace = ACTIVE_FIXTURE ? 0 : faceIndexAt(player.x, CONFIG);
  const phase = Math.max(0, Math.min(5, routeFace - 1));
  const faceStart = CONFIG.path.introTiles + CONFIG.path.faceTiles * phase;
  const pressure = pressureDirectorSnapshot();
  return {
    nowMs: gameMs,
    routeFace,
    cornerFace: corner?.k ?? 0,
    cornerState: corner?.state ?? 'complete',
    cornerPrimed: !!corner?.primed,
    playerX: player.x,
    faceStart,
    authoredArmed: pressure.face === routeFace && !!pressure.armed,
    finale: finaleActive(),
    fixture: !!ACTIVE_FIXTURE,
    viewLeft: sLeftEdge(),
    viewRight: sRightEdge(),
    cornerLimit: corner
      ? corner.s - CONFIG.spawner.cornerClearBefore -
        CONFIG.spawner.pressure.cornerPadTiles
      : -Infinity,
  };
}

export function updateMeridianDefense() {
  const ctx = frameContext();
  const presentation = stepMeridianDefenseLifecycle(lifecycle, ctx);
  if (presentation.impulse) {
    // This queues a scalar only. No hostile is created here; spawner.js waits
    // through lessons, turns, gates and unsafe sites before it may spend it.
    notifyPressureEnvironmentChange(presentation.impulseStrength);
  }
  lastPresentation = {
    ...presentation,
    playerX: ctx.playerX,
    viewLeft: ctx.viewLeft,
    viewRight: ctx.viewRight,
    cornerLimit: ctx.cornerLimit,
  };
  view.meridian.sync(lastPresentation);
}

export function resetMeridianDefense() {
  resetMeridianDefenseLifecycleState(lifecycle);
  lastPresentation = null;
  view.meridian.reset();
}

export function meridianDefenseSnapshot() {
  return {
    ...meridianDefenseLifecycleSnapshot(lifecycle),
    presentation: lastPresentation ? { ...lastPresentation } : null,
    environmentOnly: true,
    directSpawns: 0,
    gatingSpawns: 0,
  };
}
