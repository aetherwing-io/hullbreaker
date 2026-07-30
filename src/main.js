/* ================================================================== *
 *  HULLBREAKER — grey-box pass
 *  Scope: player controller, forced scroll, one enemy (wasp), shooting,
 *  polygonal tower (polyline rendering, wave gates, corner ritual).
 *  Later passes: retune, layout richness, weapons, enemy roster, boss,
 *  flight segment, juice, menus, audio. The modules under src/ receive
 *  them — one lane per file.
 * ================================================================== */
/* This module is the composition root: it wires input, the frame loop, the
   run lifecycle (resetGame), the browser self-test, and the read-only
   window.HB debug handle. Everything else lives in
   src/pure (deterministic math and data), src/sim (the renderer-free
   simulation), src/render (three.js), and src/ui (DOM). */

import { CONFIG } from './config.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, FLOW_ENABLED, HOOK_ENABLED,
  HOOK_INPUT, IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, QUERY,
  SCORE_ENABLED, SLICE_ENEMIES_ENABLED, SLICE_ENEMY_PLAN, SLICE_FALLBACK_ENABLED,
  SLICE_PACE, VIEW_ID,
} from './mode.js';
import { traversalCameraDepth } from './pure/traversal.js';
import { installHost } from './sim/bridge.js';
import {
  advanceGameMs, gameMs, scrollX, setScrollX, sliceStats,
} from './sim/time.js';
import { sLeftEdge, sRightEdge } from './sim/edges.js';
import {
  bufferHookUntil, bufferJumpUntil, clearHookBuffer, clearJumpBuffer, keys,
  releaseAllKeys,
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
import { pacePeak, paceSpeed, resetPace } from './sim/pace.js';
import { hookSnapshot, resetHook } from './sim/hook.js';
import { flowSnapshot, resetFlow } from './sim/flow.js';
import {
  resetScore, scoreEvents, scoreRunEnd, scoreRunStart, scoreSnapshot, updateScore,
} from './sim/score.js';
import { resetSpawner, updateSpawner } from './sim/spawner.js';
import { resetCornerEvents } from './sim/wavegate.js';
import {
  activeTransformEvent, committedBand, resetTransform, transformAltitudeAt,
} from './sim/transform.js';
import { updateScroll } from './sim/scroll.js';
import { camera, renderer, scene } from './render/scene.js';
import {
  activeCameraDepth, calibrateEdges, handleResize, resetCameraYaw, syncCamera,
} from './render/camera.js';
import { clearCorpses, updateCorpses } from './render/hostiles.js';
// imported for their side effects: each builds its meshes and installs its
// half of the view bridge as it loads, before anything below runs
import './render/level.js';
import './render/transform.js';
import './render/player.js';
import './render/capsules.js';
import './render/bullets.js';
import './render/mods.js';
import './render/hook.js';
import { resetHudMessage, updateHUD } from './ui/hud.js';
import './ui/overlay.js';

// the sim asks for a restart through this hook (fixture fast retry)
installHost({ resetGame: () => resetGame() });

addEventListener('resize', handleResize);

/* ============================= INPUT ============================== */

/* The snap hook takes a DEDICATED key, not jump and not fire (DESIGN's open
   question). Jump already carries five meanings (jump, air jump, drop-through,
   ledge launch, wall launch) and overloading it would make the game choose
   between hooking and jumping for the player; fire is held continuously for
   auto-fire, so a hook on fire would trigger constantly. L sits next to
   J (fire) and K (jump) so the right hand keeps one cluster; E is the
   left-hand alternate for WASD players. Both are the same intent — the A/B
   the operator is asked to judge is ?hookinput=auto, which needs no key at
   all (see src/mode.js). */
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyK: 'jump', KeyJ: 'fire', KeyX: 'fire',
  ShiftLeft: 'strafe', ShiftRight: 'strafe',
  KeyL: 'hook', KeyE: 'hook',
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
  // the hook is a buffered press like the jump: pressing a beat early still
  // grabs the anchor you are flying toward, which is what removes the aiming
  // pause. Inert unless ?hook=1 armed sim/hook.js.
  if (k === 'hook' && !e.repeat && ACTIVE_SLICE && ACTIVE_SLICE.hook)
    bufferHookUntil(gameMs + ACTIVE_SLICE.hook.bufferMs);
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
  setScrollX(ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.startScroll : 0);
  resetPace();
  resetScore();
  resetSpawner();
  resetHostileRng();
  resetKills(); resetShotsFired();
  player.x = ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.playerSpawn.x : 6;
  player.y = ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.playerSpawn.y : 3;
  player.vx = 0; player.vy = 0;
  player.hp = P.maxHealth; player.lives = P.lives;
  player.facing = 1; player.aim.set(1, 0);
  player.iframesUntil = 0; player.hitstunUntil = 0;
  player.coyoteUntil = 0; player.dropUntil = 0; player.nextFireAt = 0;
  player.grounded = false; player.onOneWay = null; player.jumpCutDone = true;
  player.airJumpsLeft = P.airJumps;
  player.traversalChain = 0; player.traversalChainUntil = 0;
  player.fallbackStreak = 0; player.fallbackEarnedTiles = 0;
  player.edgePinnedMs = 0;
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  clearHookBuffer();
  resetHook();                           // no-ops unless ?hook=1 / ?flow=1
  resetFlow();
  resetCornerEvents();
  resetTransform();
  resetCameraYaw();
  unbuildFutureFaces();
  if (ACTIVE_FIXTURE) {
    sliceStats.attempts++;
    sliceStats.airJumps = 0;
    sliceStats.setbacks = 0;
    sliceStats.lastSetbackAt = -1e9;
    sliceStats.minEdgeMargin = Infinity;
    sliceStats.startedAt = gameMs;
  }
  if (ACTIVE_SLICE) {
    // route stakes: `rewards` is the pocket capsule plus whatever the active
    // pacing variant parks on its harder lines
    for (const r of ACTIVE_SLICE.rewards)
      spawnCapsule(r.kind, r.letter, r.x, r.y, r.mode);
    if (SLICE_ENEMIES_ENABLED) {
      // one authored list per attempt: the active pace's own, or that list
      // composed with the opt-in houndframe trial stage (src/mode.js resolves
      // which, src/pure/traversal.js owns the composition rule)
      for (const e of SLICE_ENEMY_PLAN)
        spawnHostile(e.x, e.y, e.delayMs, e.kind, e);
    }
    scoreRunStart(CONFIG.gen.seed, ACTIVE_SLICE.id, ACTIVE_SLICE.pace.id);
  } else {
    scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');
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
  // CHARGE steps on real dt: CHRONO must not inflate the meter (proposal A.3)
  updateScore(dt, {
    grounded: player.grounded, vx: player.vx,
    traversalState: player.traversalState,
    x: player.x, y: player.y,
    margin: player.x - player.hw - sLeftEdge(),
  });
  if (IS_TRAVERSAL_SLICE) {
    if (player.x >= ACTIVE_SLICE.rejoin.x0) { scoreRunEnd('clear'); setState('VICTORY'); }
  } else if (IS_TRANSFORM_SLICE) {
    if (player.x >= ACTIVE_FIXTURE.finish.x0) { scoreRunEnd('clear'); setState('VICTORY'); }
  } else if (scrollX >= END_SCROLL) {
    scoreRunEnd('clear');
    setState('VICTORY');
  }
}

// Read-only browser telemetry for automated movement checks. One sampler feeds
// both debug channels — `__HULLBREAKER_TEST__` (the playtest harness's canonical
// channel, field names frozen) and window.HB.snapshot() below — so the two can
// never drift apart. It is a pure read of sim state and cannot mutate anything.
// The transformation slice adds one read-only block so a bot run can prove the
// sequence completed (which surface the world is on, which ritual is running,
// and the rendered altitude) without scraping pixels.
function transformTelemetry() {
  const ev = activeTransformEvent();
  return {
    band: committedBand,
    altitude: transformAltitudeAt(player.x),
    event: ev ? ev.id : null,
    eventState: ev ? ev.state : 'complete',
  };
}

function telemetry() {
  return {
    gameMs, state, scrollX,
    transform: IS_TRANSFORM_SLICE ? transformTelemetry() : undefined,
    // unchanged semantics: the fixture's declared scroll floor. The live
    // pursuit speed a pacing variant is commanding is `pursuitSpeed` below.
    minimumScrollSpeed: ACTIVE_FIXTURE
      ? ACTIVE_FIXTURE.run.minimumScrollSpeed : CONFIG.scrollSpeed,
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
    // additive since the harness froze the fields above: the pacing variant in
    // play, the live pursuit speed, and the score/setback prototype's state
    pace: ACTIVE_SLICE ? ACTIVE_SLICE.pace.id : null,
    pursuitSpeed: activeScrollSpeed(),
    pursuitPeak: pacePeak(),
    setbacks: sliceStats.setbacks,
    score: scoreSnapshot(),
    // movement-verb prototypes, additive and inert when their flags are off:
    // the tether's phase/anchor and the momentum chain's live multiplier, so a
    // bot run can prove a hook route was actually hooked. `player.*` above is
    // untouched — traversalState keeps its frozen free|ledge|wall domain.
    hook: HOOK_ENABLED ? hookSnapshot() : undefined,
    flow: FLOW_ENABLED ? flowSnapshot() : undefined,
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
  pace: () => (ACTIVE_SLICE ? { ...ACTIVE_SLICE.pace, pursuit: ACTIVE_SLICE.pursuit } : null),
  // view-scale experiment (?view=near|mid|far, CONFIG.viewScales): resolved
  // id/label/depthMult plus the camera depth it actually produced this frame.
  view: () => ({ ...CONFIG.viewScales[VIEW_ID], cameraDepth: activeCameraDepth() }),
  pursuitSpeed: () => paceSpeed(),
  // proposal A.5's read surface, verbatim: ring-buffered events, one snapshot,
  // and the reset the harness may assert. Inert unless ?score=1.
  score: {
    enabled: SCORE_ENABLED,
    events: scoreEvents,
    snapshot: scoreSnapshot,
    reset: resetScore,
  },
  // movement-verb prototypes: read surfaces only (the verbs live in the sim)
  hook: { enabled: HOOK_ENABLED, input: HOOK_INPUT, snapshot: hookSnapshot },
  flow: { enabled: FLOW_ENABLED, snapshot: flowSnapshot },
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
        state: e.state, dir: e.dir,      // houndframe: prowl/tell/charge/skid/tumble
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
    // view scales: any ?view= must resolve to a declared entry (default is
    // `far` per the July 30 operator verdict); when `near` IS selected it must
    // reproduce the pre-view-scale camera depth exactly — checked against
    // ACTIVE_FIXTURE (mode-agnostic: traversal or transform), the same
    // thing activeCameraDepth() itself reads, so this holds at any aspect.
    check('view resolved', !!CONFIG.viewScales[VIEW_ID] &&
      Number.isFinite(activeCameraDepth()) && activeCameraDepth() > 0 &&
      CONFIG.viewScales.near.depthMult === 1 &&
      (VIEW_ID !== 'near' || activeCameraDepth() === (ACTIVE_FIXTURE
        ? traversalCameraDepth(CONFIG.camera.z, innerWidth / innerHeight, ACTIVE_FIXTURE.run)
        : CONFIG.camera.z)));
    resetGame();
    const expectedScroll = ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.startScroll : 0;
    const expectedHostiles = SLICE_ENEMIES_ENABLED ? SLICE_ENEMY_PLAN.length : 0;
    // A pace that bounds crush slack in seconds arms its clock on the first
    // frame, so the opening scroll is the authored start pushed forward to the
    // margin cap — hence >= rather than ===, with the cap itself checked below.
    check('restart', scrollX >= expectedScroll && state === 'PLAYING' &&
      hostiles.length === expectedHostiles);
    if (ACTIVE_FIXTURE) check('slice fixture selected', levelData.fixture === ACTIVE_FIXTURE);
    if (ACTIVE_SLICE) {
      check('pace resolved', ACTIVE_SLICE.pace.id === SLICE_PACE ||
        (SLICE_PACE !== 'base' && ACTIVE_SLICE.pace.id === 'base'));
      check('authored rewards spawned',
        capsules.length === ACTIVE_SLICE.rewards.length &&
        capsules.every((c) => c.mode === 'fixed'));
      check('hull fallback armed', SLICE_FALLBACK_ENABLED === (QUERY.get('fallback') !== '0'));
      // The cap bounds daylight from above; a frustum narrower than the cap
      // binds first, so the clock is <= crushSlackSeconds on every aspect
      // ratio and never more. (Measured: 9.45/9.45/9.45 tiles for hunt across
      // 900x1000, 1280x800 and 1600x600, against 15.7-33.4 uncapped.)
      const cap = ACTIVE_SLICE.pursuit.marginCapTiles;
      check('crush clock bounded at spawn', cap > 0
        ? player.x - player.hw - sLeftEdge() <= cap + 0.05
        : scrollX === expectedScroll);
    }
    if (IS_TRANSFORM_SLICE) {
      check('body static at spawn', committedBand === 0 &&
        transformAltitudeAt(ACTIVE_FIXTURE.run.playerSpawn.x) === 0);
      check('first turn idle', activeTransformEvent().state === 'idle');
    }
    // Movement-verb prototypes: both directions checked, so this also proves an
    // ordinary URL leaves them completely inert (the flags-off contract).
    {
      const hk = hookSnapshot(), fl = flowSnapshot();
      check('hook flag matches its module',
        hk.enabled === HOOK_ENABLED && (!HOOK_ENABLED || !!ACTIVE_SLICE.hook));
      check('hook idle after restart', hk.phase === 'idle' && hk.grabs === 0);
      check('hook anchors authored',
        !HOOK_ENABLED || ACTIVE_SLICE.hookAnchors.length >= 4);
      check('flow flag matches its module',
        fl.enabled === FLOW_ENABLED && (!FLOW_ENABLED || !!ACTIVE_SLICE.flow));
      check('flow chain empty after restart', fl.links === 0 && fl.mult === 1);
      check('flow auto-launch overlay only with the flag',
        FLOW_ENABLED
          ? P.ledgeAutoLaunch === true
          : P.ledgeAutoLaunch === (SLICE_PACE === 'surge' ? true : undefined));
      // ?autobounce=1 only ever re-arms the jump buffer; a fresh run must start
      // with an empty buffer either way, so this checks the flag plumbing and
      // that arming it changed nothing at rest.
      check('autobounce flag plumbed',
        AUTOBOUNCE_ENABLED === (IS_TRAVERSAL_SLICE && QUERY.get('autobounce') === '1'));
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
