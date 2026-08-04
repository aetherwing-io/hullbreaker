import { ACTIVE_FIXTURE } from '../mode.js';
import { clearDepartingTracers } from '../render/bullets.js';
import { resetCameraYaw } from '../render/camera.js';
import { clearCorpses } from '../render/hostiles.js';
import { clearCapsules, resetCarrierDrops } from '../sim/capsules.js';
import { resetFinale } from '../sim/finale.js';
import { resetFlow } from '../sim/flow.js';
import { clearHostiles, resetHostileRng, resetKills } from '../sim/hostiles.js';
import { resetHook } from '../sim/hook.js';
import { clearHookBuffer, releaseAllKeys } from '../sim/input.js';
import { unbuildFutureFaces } from '../sim/level.js';
import { clearMods } from '../sim/mods.js';
import { resetPace } from '../sim/pace.js';
import { cancelSliceRetry, resetPlayerForRun } from '../sim/player.js';
import { resetScore } from '../sim/score.js';
import { resetSpawner } from '../sim/spawner.js';
import { resetMeridianDefense } from '../sim/meridian-defense.js';
import {
  gameMs, resetHitStop, setScrollX, sliceStats,
} from '../sim/time.js';
import { resetTransform } from '../sim/transform.js';
import { resetCornerEvents } from '../sim/wavegate.js';
import {
  clearBullets, resetShotsFired, resetWeaponKills, setWeapon,
} from '../sim/weapons.js';
import { makeResetRegistry } from './reset-registry.js';

function resetScroll() {
  setScrollX(ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.startScroll : 0);
}

function resetPlayer() {
  resetPlayerForRun(
    ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.playerSpawn.x : 6,
    ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.playerSpawn.y : 3,
  );
}

function resetSliceStats() {
  sliceStats.setbacks = 0;
  sliceStats.lastSetbackAt = -1e9;
  sliceStats.minEdgeMargin = Infinity;
  if (ACTIVE_FIXTURE) {
    sliceStats.attempts++;
    sliceStats.airJumps = 0;
    sliceStats.startedAt = gameMs;
  }
}

export const RUN_RESET_REGISTRY = makeResetRegistry([
  { id: 'slice-retry', reset: cancelSliceRetry },
  { id: 'input-keys', reset: releaseAllKeys },
  { id: 'hostiles', reset: clearHostiles },
  { id: 'corpses', reset: clearCorpses },
  { id: 'projectiles', reset: clearBullets },
  { id: 'projectile-tracers', reset: clearDepartingTracers },
  { id: 'capsules', reset: clearCapsules },
  { id: 'starter-weapon', reset: () => setWeapon('R') },
  { id: 'weapon-kills', reset: resetWeaponKills },
  { id: 'modifiers', reset: clearMods },
  { id: 'carrier-drops', reset: resetCarrierDrops },
  { id: 'scroll', reset: resetScroll },
  { id: 'pace', reset: resetPace },
  { id: 'score', reset: resetScore },
  { id: 'spawner', reset: resetSpawner },
  { id: 'meridian-defense', reset: resetMeridianDefense },
  { id: 'finale', reset: resetFinale },
  { id: 'hostile-rng', reset: resetHostileRng },
  { id: 'kill-count', reset: resetKills },
  { id: 'shot-count', reset: resetShotsFired },
  { id: 'player', reset: resetPlayer },
  { id: 'hook-input', reset: clearHookBuffer },
  { id: 'hook', reset: resetHook },
  { id: 'flow', reset: resetFlow },
  { id: 'corner-events', reset: resetCornerEvents },
  { id: 'transform', reset: resetTransform },
  { id: 'hit-stop', reset: resetHitStop },
  { id: 'camera-yaw', reset: resetCameraYaw },
  { id: 'future-faces', reset: unbuildFutureFaces },
  { id: 'slice-stats', reset: resetSliceStats },
]);

export function resetRunState() { return RUN_RESET_REGISTRY.reset(); }
export function runResetSnapshot() { return RUN_RESET_REGISTRY.snapshot(); }
