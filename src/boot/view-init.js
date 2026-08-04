/* Explicit presentation composition root.
 *
 * Importing a view module may allocate its fixed scene resources, but it may
 * not mutate sim/bridge.  This manifest installs every base owner in one
 * declared order, then layers observers.  The order is executable data and
 * independently inspectable; async art settlement can no longer overwrite a
 * wrapper simply because its module resumed later. */

import { initBulletView } from '../render/bullets.js';
import { initCameraView } from '../render/camera.js';
import { initCapsuleView } from '../render/capsules.js';
import { initFinaleView } from '../render/finale.js';
import { initHookView } from '../render/hook.js';
import { initHostileView } from '../render/hostiles.js';
import { initLevelView } from '../render/level.js';
import { initMeridianView } from '../render/meridian-defense-vfx.js';
import { initModsView } from '../render/mods.js';
import { initPlayerView } from '../render/player.js';
import { initTransformView } from '../render/transform.js';
import { installActionVfxObservers } from '../render/action-vfx-runtime.js';
import { initJuiceViewObservers } from '../render/juice.js';
import { initLootView } from '../ui/loot.js';
import { initOverlayView } from '../ui/overlay.js';

export const VIEW_INIT_MANIFEST = Object.freeze([
  Object.freeze({ id: 'camera', init: initCameraView }),
  Object.freeze({ id: 'level', init: initLevelView }),
  Object.freeze({ id: 'hostiles', init: initHostileView }),
  Object.freeze({ id: 'meridian', init: initMeridianView }),
  Object.freeze({ id: 'finale', init: initFinaleView }),
  Object.freeze({ id: 'transform', init: initTransformView, optional: true }),
  Object.freeze({ id: 'player', init: initPlayerView }),
  Object.freeze({ id: 'capsules', init: initCapsuleView }),
  Object.freeze({ id: 'bullets', init: initBulletView }),
  Object.freeze({ id: 'mods', init: initModsView }),
  Object.freeze({ id: 'hook', init: initHookView }),
  Object.freeze({ id: 'loot', init: initLootView }),
  Object.freeze({ id: 'overlay', init: initOverlayView }),
]);

export const VIEW_OBSERVER_MANIFEST = Object.freeze([
  Object.freeze({ id: 'juice', init: initJuiceViewObservers, optional: true }),
  Object.freeze({ id: 'action-vfx', init: installActionVfxObservers, optional: true }),
]);

let initialized = false;
let report = null;

export function initializeViewRegistry() {
  if (initialized) return report;
  const base = VIEW_INIT_MANIFEST.map((entry) => Object.freeze({
    id: entry.id,
    installed: entry.init() === true,
    optional: entry.optional === true,
  }));
  const observers = VIEW_OBSERVER_MANIFEST.map((entry) => Object.freeze({
    id: entry.id,
    installed: entry.init() === true,
    optional: entry.optional === true,
  }));
  initialized = true;
  report = Object.freeze({
    initialized: true,
    base: Object.freeze(base),
    observers: Object.freeze(observers),
  });
  return report;
}

export function viewInitSnapshot() {
  return report || Object.freeze({ initialized: false, base: [], observers: [] });
}
