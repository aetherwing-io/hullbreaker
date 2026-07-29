/* ================================================================== *
 *  HULLBREAKER — grey-box pass
 *  Scope: player controller, forced scroll, one enemy (wasp), shooting,
 *  polygonal tower (polyline rendering, wave gates, corner ritual).
 *  Later passes: retune, layout richness, weapons, enemy roster, boss,
 *  flight segment, juice, menus, audio. Sections receive them below.
 * ================================================================== */
/* This module is the composition root: it wires input, the frame loop, the
   run lifecycle (resetGame), the browser self-test, and the read-only
   window.HB debug handle. Everything else lives in
   src/pure (deterministic math and data), src/sim (the renderer-free
   simulation), src/render (three.js), and src/ui (DOM). */

import { CONFIG } from './config.js';
import { ACTIVE_SLICE, IS_TRAVERSAL_SLICE, QUERY, SLICE_ENEMIES_ENABLED } from './mode.js';
import { installHost } from './sim/bridge.js';
import {
  advanceGameMs, gameMs, scrollX, setScrollX, sliceStats,
} from './sim/time.js';
import { sLeftEdge, sRightEdge } from './sim/edges.js';
import {
  bufferJumpUntil, clearJumpBuffer, keys, releaseAllKeys,
} from './sim/input.js';
import {
  activeScrollEnd, activeScrollSpeed, END_SCROLL, levelData, unbuildFutureFaces,
} from './sim/level.js';
import { setState, state } from './sim/state.js';
import {
  cancelSliceRetry, clearPlayerTraversal, P, player, updatePlayer,
} from './sim/player.js';
import {
  clearBullets, currentWeapon, resetShotsFired, resetWeaponKills, setWeapon,
  shotsFired, updateBullets,
} from './sim/weapons.js';
import {
  clearHostiles, hostiles, kills, resetHostileRng, resetKills, spawnHostile,
  updateHostiles,
} from './sim/hostiles.js';
import {
  capsules, removeCapsule, resetCarrierDrops, spawnCapsule, updateCapsules,
} from './sim/capsules.js';
import { clearMods, mods, updateMods } from './sim/mods.js';
import { resetSpawner, updateSpawner } from './sim/spawner.js';
import { resetCornerEvents } from './sim/wavegate.js';
import { updateScroll } from './sim/scroll.js';
import { camera, renderer, scene } from './render/scene.js';
import {
  calibrateEdges, handleResize, resetCameraYaw, syncCamera,
} from './render/camera.js';
import { clearCorpses, updateCorpses } from './render/hostiles.js';
import './render/level.js';
import './render/player.js';
import './render/capsules.js';
import './render/bullets.js';
import './render/mods.js';
import { resetHudMessage, updateHUD } from './ui/hud.js';
import './ui/overlay.js';

// the sim asks for a restart through this hook (fixture fast retry)
installHost({ resetGame: () => resetGame() });

addEventListener('resize', handleResize);

/* ============================= INPUT ============================== */

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyK: 'jump', KeyJ: 'fire', KeyX: 'fire',
  ShiftLeft: 'strafe', ShiftRight: 'strafe',
};

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();          // held key must not strobe the pause state
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyR' &&
      (IS_TRAVERSAL_SLICE || state === 'GAME_OVER' || state === 'VICTORY')) {
    e.preventDefault();
    if (!e.repeat) resetGame();
    return;
  }
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (k === 'jump' && !e.repeat) bufferJumpUntil(gameMs + CONFIG.player.jumpBufferMs);
  keys[k] = true;
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) keys[k] = false;
});

addEventListener('blur', releaseAllKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllKeys(); });

/* ============================= STATES ============================= */

function togglePause() {
  if (state === 'PLAYING') setState('PAUSED');
  else if (state === 'PAUSED') setState('PLAYING');
}

function resetGame() {
  cancelSliceRetry();
  releaseAllKeys();
  clearHostiles();
  clearCorpses();
  clearBullets();
  for (let i = capsules.length - 1; i >= 0; i--) removeCapsule(i);
  setWeapon('R');
  resetWeaponKills();
  clearMods();
  resetCarrierDrops();
  setScrollX(ACTIVE_SLICE ? ACTIVE_SLICE.run.startScroll : 0);
  resetSpawner();
  resetHostileRng();
  resetKills(); resetShotsFired();
  player.x = ACTIVE_SLICE ? ACTIVE_SLICE.run.playerSpawn.x : 6;
  player.y = ACTIVE_SLICE ? ACTIVE_SLICE.run.playerSpawn.y : 3;
  player.vx = 0; player.vy = 0;
  player.hp = P.maxHealth; player.lives = P.lives;
  player.facing = 1; player.aim.set(1, 0);
  player.iframesUntil = 0; player.hitstunUntil = 0;
  player.coyoteUntil = 0; player.dropUntil = 0; player.nextFireAt = 0;
  player.grounded = false; player.onOneWay = null; player.jumpCutDone = true;
  player.airJumpsLeft = P.airJumps;
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  resetCornerEvents();
  resetCameraYaw();
  unbuildFutureFaces();
  if (ACTIVE_SLICE) {
    sliceStats.attempts++;
    sliceStats.airJumps = 0;
    sliceStats.minEdgeMargin = Infinity;
    sliceStats.startedAt = gameMs;
    const reward = ACTIVE_SLICE.darePocket.reward;
    spawnCapsule(reward.kind, reward.letter, reward.x, reward.y, reward.mode);
    if (SLICE_ENEMIES_ENABLED) {
      for (const e of ACTIVE_SLICE.enemies)
        spawnHostile(e.x, e.y, e.delayMs, e.kind);
    }
  }
  resetHudMessage();                     // keep the HUD write cache coherent
  updateScroll(0);                       // was updateCamera(0): scroll, then pose
  syncCamera();
  setState('PLAYING');
}

/* =========================== MAIN LOOP ============================ */

function update(dt) {
  advanceGameMs(dt * 1000);
  // CHRONO: the world runs slow, the player (and their bullets) run full
  // speed. Timers stay on real gameMs — a 4s window keeps the drift small.
  const wScale = gameMs < mods.chronoUntil ? CONFIG.mods.chronoScale : 1;
  updateScroll(dt * wScale);             // sim half of the old updateCamera
  syncCamera();                          // render half, same point in the frame
  updateSpawner();
  updatePlayer(dt);
  if (state !== 'PLAYING') return;      // died on the last frame
  updateHostiles(dt * wScale);
  updateCorpses();
  updateCapsules(dt * wScale);
  updateMods();
  updateBullets(dt);
  if (IS_TRAVERSAL_SLICE) {
    if (player.x >= ACTIVE_SLICE.rejoin.x0) setState('VICTORY');
  } else if (scrollX >= END_SCROLL) {
    setState('VICTORY');
  }
}

// Read-only browser telemetry for automated movement checks. One sampler feeds
// both debug channels — `__HULLBREAKER_TEST__` (the playtest harness's canonical
// channel, field names frozen) and window.HB.snapshot() below — so the two can
// never drift apart. It is a pure read of sim state and cannot mutate anything.
function telemetry() {
  return {
    gameMs, state, scrollX,
    minimumScrollSpeed: activeScrollSpeed(),
    player: {
      x: player.x, y: player.y, vx: player.vx, vy: player.vy,
      grounded: player.grounded,
      traversalState: player.traversalState,
      traversalControlUntil: player.traversalControlUntil,
    },
    screenRight: sRightEdge() - CONFIG.edges.margin,
    edgeMargin: player.x - player.hw - sLeftEdge(),
    weapon: currentWeapon,
    attempt: sliceStats.attempts,
    falls: sliceStats.falls,
    airJumps: sliceStats.airJumps,
  };
}

// absent from every ordinary URL: only ?testapi=1 publishes the channel
if (QUERY.has('testapi')) {
  Object.defineProperty(globalThis, '__HULLBREAKER_TEST__', {
    value: { snapshot: telemetry },
    configurable: false,
    writable: false,
  });
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, t - last) / 1000;
  last = t;
  if (state === 'PLAYING') update(dt);
  renderer.render(scene, camera);
  updateHUD();
}

/* Read-only debug handle, always present: a superset of the telemetry channel
   above plus the live sim objects, for the browser console and any harness that
   wants more than the frozen fields. snapshot() is one structured-cloneable
   read; the live references are the real sim rows and must be treated as
   read-only — writing to them desynchronizes the run. */
window.HB = Object.freeze({
  CONFIG,
  fixture: ACTIVE_SLICE,
  player,                          // live sim row (x, y, vx, vy, grounded, hp, …)
  playerTune: P,
  hostiles,                        // live array of hostile rows
  capsules,                        // live array of capsule rows
  mods,
  sliceStats,
  keys,
  levelData,
  state: () => state,
  scrollX: () => scrollX,
  gameMs: () => gameMs,
  currentWeapon: () => currentWeapon,
  kills: () => kills,
  shotsFired: () => shotsFired,
  edges: () => ({ left: sLeftEdge(), right: sRightEdge() }),
  snapshot: () => {
    const t = telemetry();
    return {
      ...t,
      scrollEnd: activeScrollEnd(),
      player: {
        ...t.player,
        hp: player.hp, lives: player.lives, facing: player.facing,
        airJumpsLeft: player.airJumpsLeft,
      },
      currentWeapon, kills, shotsFired,
      hostiles: hostiles.map((e) => ({
        id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp,
        materialized: gameMs >= e.enterUntil,
      })),
      capsules: capsules.map((c) => ({
        kind: c.kind, letter: c.letter, x: c.x, y: c.y, mode: c.mode,
      })),
      edgeLeft: sLeftEdge(),
      edgeRight: t.screenRight,
      sliceStats: { ...sliceStats },
    };
  },
});

calibrateEdges();

/* =========================== SELF-TEST ============================ */
/* Open index.html?selftest=1: after 1.5s of normal play the page runs a
   boot smoke — render loop alive, pause/resume, resize, restart — and
   reports SELFTEST PASS/FAIL to the console AND the page title, so both
   a human and an automated tab can read the verdict. No effect without
   the query param. */

if (QUERY.has('selftest')) {
  setTimeout(() => {
    const results = [];
    const check = (name, cond) => results.push([name, !!cond]);
    check('canvas attached', renderer.domElement.isConnected);
    // frames-rendered, not wall-clock: an occluded tab throttles rAF but
    // still paints the first frames; a broken boot paints none
    check('render loop alive', renderer.info.render.frame > 0);
    togglePause(); check('pause', state === 'PAUSED');
    togglePause(); check('resume', state === 'PLAYING');
    dispatchEvent(new Event('resize'));
    check('resize handled', Math.abs(camera.aspect - innerWidth / innerHeight) < 1e-6);
    resetGame();
    const expectedScroll = ACTIVE_SLICE ? ACTIVE_SLICE.run.startScroll : 0;
    const expectedHostiles = ACTIVE_SLICE && SLICE_ENEMIES_ENABLED ? ACTIVE_SLICE.enemies.length : 0;
    check('restart', scrollX === expectedScroll && state === 'PLAYING' &&
      hostiles.length === expectedHostiles);
    if (ACTIVE_SLICE) {
      check('slice fixture selected', levelData.fixture === ACTIVE_SLICE);
      check('fixed dare reward', capsules.length === 1 && capsules[0].mode === 'fixed');
    }
    const fails = results.filter((r) => !r[1]).map((r) => r[0]);
    const msg = fails.length
      ? 'SELFTEST FAIL: ' + fails.join(', ')
      : 'SELFTEST PASS (' + results.length + ' checks)';
    console.log(msg);
    document.title = msg;
  }, 1500);
}

resetGame();
requestAnimationFrame(frame);
