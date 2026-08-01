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
  HOOK_INPUT, IS_G1, IS_G2, IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, QUERY,
  SCORE_ENABLED, SHELL_AUTOSTART, SHELL_ENABLED, SLICE_ENEMIES_ENABLED,
  SLICE_ENEMY_PLAN, SLICE_FALLBACK_ENABLED, SLICE_PACE, START_DIRECTION_ID,
  VIEW_ID,
} from './mode.js';
import { HALT_S } from './pure/path.js';
import {
  RIG_SCREEN_FRACTION, SHELL_ELEMENT_VARS, START_DIRECTION_IDS, shellKeyIntent,
} from './pure/shell.js';
import { cornerEventTotalMs } from './pure/waves.js';
import {
  buildTransformPath, transformAltAt, transformEventTotalMs,
} from './pure/transform.js';
import { traversalCameraDepth } from './pure/traversal.js';
import { installHost } from './sim/bridge.js';
import {
  advanceGameMs, gameMs, hitStopRemainingMs, resetHitStop, scrollX, setScrollX,
  sliceStats, stepHitStop,
} from './sim/time.js';
import { sLeftEdge, sRightEdge } from './sim/edges.js';
import {
  bufferHookUntil, bufferJumpUntil, clearHookBuffer, clearJumpBuffer, keys,
  releaseAllKeys,
} from './sim/input.js';
import {
  activeScrollEnd, activeScrollSpeed, END_SCROLL, levelData, pockets,
  unbuildFutureFaces,
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
import { activeCorner, resetCornerEvents } from './sim/wavegate.js';
import {
  activeTransformEvent, committedBand, resetTransform, transformAltitudeAt,
  transformDecisionTrace, transformFrontierX, transformSealX,
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
import { limbPieces } from './render/limb.js';
import './render/transform.js';
import './render/player.js';
import './render/capsules.js';
import { clearDepartingTracers } from './render/bullets.js';
import './render/mods.js';
import './render/hook.js';
import { resetHudMessage, updateHUD } from './ui/hud.js';
import './ui/overlay.js';
import { shellApplyIntent, shellRunStarted, shellSnapshot } from './ui/shell.js';
import './ui/audio.js';
// juice loads LAST: like the audio layer it wraps the finished view bridge
// (each wrapper delegating to the implementation already installed), so it
// must see every render/ui module's hooks in place first.
import { juiceSnapshot, updateJuice } from './render/juice.js';

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
  /* The game shell gets first look, but only where the simulation is not
     running (MENU / PAUSED / GAME_OVER / VICTORY) and only for keys that
     are not in KEYMAP below. 'start' is the load-bearing case: leaving the
     title does NOT consume the event — the same press falls through to the
     gameplay handling underneath, so a bot script's (or a player's) first
     input is never swallowed. tools/pathcheck.mjs asserts that property
     against this KEYMAP for every state. */
  let startedFromTitle = false;
  if (SHELL_ENABLED && !e.metaKey && !e.ctrlKey && !e.altKey) {   // leave browser shortcuts alone
    const intent = shellKeyIntent(e.code, state);
    if (intent === 'start') { startRun(); startedFromTitle = true; }   // fall through
    else if (intent === 'restart') { e.preventDefault(); if (!e.repeat) resetGame(); return; }
    else if (intent === 'title') { e.preventDefault(); if (!e.repeat) toTitle(); return; }
    else if (intent) { e.preventDefault(); if (!e.repeat) shellApplyIntent(intent); return; }
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();          // held key must not strobe the pause state
    e.preventDefault();
    return;
  }
  /* …with one exception to the fall-through: the press that LEFT the title
     must not also restart the run it just started. R is the traversal
     slice's unconditional restart key, so without this guard a single R at
     the title would both start and reset the run and spend an attempt the
     title view is not supposed to cost (see startRun/toTitle below). */
  if (e.code === 'KeyR' && !startedFromTitle &&
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

// a click / tap is "any key" too, and it is the only input a pointer-only
// visitor has. Nothing else in the game reads the pointer.
addEventListener('pointerdown', () => { if (SHELL_ENABLED && state === 'MENU') startRun(); });

/* ============================= STATES ============================= */

function togglePause() {
  if (state === 'PLAYING') setState('PAUSED');
  else if (state === 'PAUSED') setState('PLAYING');
}

/* The shell's two lifecycle verbs. A run always begins from a full
   resetGame, so leaving the title screen and restarting after a death
   land in exactly the same state — the one every URL booted into before
   the shell existed. The title screen is holding a run that was just
   reset (both ways into MENU reset first, and a frozen sim cannot
   drift), so LEAVING it is a state change, not a second reset —
   otherwise merely looking at the title would tick the attempt counter
   the HUD and the bot harness both read. */
function startRun() {
  if (state === 'MENU') setState('PLAYING');
  else resetGame();
}

function toTitle() {
  resetGame();                 // rebuild the world, then freeze it behind the title
  setState('MENU');
}

function resetGame() {
  cancelSliceRetry();
  releaseAllKeys();
  clearHostiles();
  clearCorpses();
  clearBullets();
  clearDepartingTracers();               // render: no bend-cull tracer outlives a run
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
  resetHitStop();                        // no freeze (and no stale kill/hp
                                         //   baseline) survives a restart
  resetCameraYaw();                      // …and no camera trauma either
  unbuildFutureFaces();
  // setback/edge stats reset in EVERY mode now that ?fallback=1 can arm hull
  // fallback in the default run and the score snapshot reads both (T-016)
  sliceStats.setbacks = 0;
  sliceStats.lastSetbackAt = -1e9;
  sliceStats.minEdgeMargin = Infinity;
  if (ACTIVE_FIXTURE) {
    sliceStats.attempts++;
    sliceStats.airJumps = 0;
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
    // T-009: the six-face run's authored pickups — one weapon capsule per
    // face, bobbing over that pocket's shelf tip out across the chasm. Free
    // (decisions.md entry 9); same 'fixed' capsule contract the traversal
    // fixture's pocket uses.
    for (const p of pockets)
      spawnCapsule(p.reward.kind, p.reward.letter, p.reward.x, p.reward.y, p.reward.mode);
    scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');
  }
  resetHudMessage();                     // keep the HUD write cache coherent
  shellRunStarted();                     // ui: stamp this attempt's clock origin
  updateScroll(0);                       // was updateCamera(0): scroll, then pose
  syncCamera();
  setState('PLAYING');
}

/* =========================== MAIN LOOP ============================ */

function update(dt) {
  advanceGameMs(dt * 1000);
  /* HIT-STOP (T-011): the sim decides whether the world holds its breath
     this frame, from the kill tally and RIG's health as they stood at the
     end of the last frame (src/sim/time.js owns the clock and the policy;
     CONFIG.juice.hitStop owns the numbers; ?juice=0 pins the scale at 1).
     It multiplies EVERY entity dt, including projectiles and the pursuing
     scroll: a freeze that stopped the world but let bullets fly would
     desync the substep integration the projectiles collide in, and one
     that stopped the player but not the crush plane would be a shove.
     It COMPOSES with CHRONO rather than replacing it — the two scales
     multiply, so each entity keeps exactly the CHRONO treatment it had
     before this pass (scroll and world slowed, RIG and bullets not) and
     merely gains the freeze on top. Timers stay on real gameMs — the same
     convention CHRONO uses below — so a freeze removes exactly
     hitStopMs*(1-scale) of simulated time at any frame rate and no
     deadline drifts. */
  const hScale = stepHitStop(kills, player.hp);
  // CHRONO: the world runs slow, the player (and their bullets) run full
  // speed. Timers stay on real gameMs — a 4s window keeps the drift small.
  const wScale = (gameMs < mods.chronoUntil ? CONFIG.mods.chronoScale : 1) * hScale;
  updateScroll(dt * wScale);             // sim half of the old updateCamera
  syncCamera();                          // render half, same point in the frame
  updateSpawner();
  updatePlayer(dt * hScale);
  /* render: effect pools + crush warning. It sits BEFORE the death return on
     purpose — the frame RIG dies is the frame that spawns RIG's own death
     burst, and a pool row is only given a matrix when the pools step, so
     stepping after the return would mean the death effect never draws a
     single frame. Everything a later update spawns this frame draws on the
     next one. Past the death/victory screen the game clock itself stops
     (gameMs only advances while PLAYING), so live effects hold with the rest
     of the frozen world rather than finishing alone over a dead run. */
  updateJuice();
  if (state !== 'PLAYING') return;      // died on the last frame
  updateHostiles(dt * wScale);
  updateCorpses();
  updateCapsules(dt * wScale);
  updateMods();
  updateBullets(dt * hScale);
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
  const total = transformEventTotalMs(CONFIG);
  const t = ev && ev.state === 'turning' ? gameMs - ev.tStart : 0;
  return {
    band: committedBand,
    altitude: transformAltitudeAt(player.x),
    event: ev ? ev.id : null,
    eventState: ev ? ev.state : 'complete',
    // additive (ritual state, so a bot can attack or trace a turn instead of
    // guessing where it is): event-local ms and 0…1 progress through the same
    // 990 ms timeline src/pure/transform.js owns, plus the two clamps RIG is
    // actually bounded by. The clamps expose their raw sentinels: frontierX is
    // +Infinity when no turn is pending, sealX is -Infinity until one commits.
    tMs: t,
    progress: total > 0 ? Math.min(1, t / total) : 0,
    frontierX: transformFrontierX(),
    sealX: transformSealX(),
    // additive (T-002 divergence investigation): the per-event decision trace —
    // when each ritual's halt/trigger preconditions first held, the arm/start/
    // finish frames, the start-frame trigger margin, and which precondition
    // bound the start frame. Read-only; see transformDecisionTrace in
    // src/sim/transform.js for field semantics.
    decisions: transformDecisionTrace(),
  };
}

// Corner-ritual state on the six-face run, same additive contract as the
// transform block above: which corner is pending, what it is doing
// (idle → gate → turning → complete), where its scroll halt and pivot are, and
// how far through the 1100 ms two-snap ritual it is. Read-only sim state; the
// fixtures author their own transitions, so they report no corner at all.
function cornerTelemetry() {
  const c = activeCorner();
  const total = cornerEventTotalMs(CONFIG);
  const t = c && c.state === 'turning' ? gameMs - c.tStart : 0;
  return {
    k: c ? c.k : null,
    pivotS: c ? c.s : null,
    haltS: c ? HALT_S[c.k - 1] : null,
    state: c ? c.state : 'complete',
    tMs: t,
    progress: total > 0 ? Math.min(1, t / total) : 0,
  };
}

function telemetry() {
  return {
    gameMs, state, scrollX,
    transform: IS_TRANSFORM_SLICE ? transformTelemetry() : undefined,
    corner: ACTIVE_FIXTURE ? undefined : cornerTelemetry(),
    // unchanged semantics: the fixture's declared scroll floor. The live
    // pursuit speed a pacing variant is commanding is `pursuitSpeed` below.
    minimumScrollSpeed: ACTIVE_FIXTURE
      ? ACTIVE_FIXTURE.run.minimumScrollSpeed : CONFIG.scrollSpeed,
    player: {
      x: player.x, y: player.y, vx: player.vx, vy: player.vy,
      grounded: player.grounded,
      crouched: player.crouched, muzzleY: player.muzzleY,
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
    // Additive (adversarial-lane request): the live hostile rows, so a bot
    // policy can read what it is fighting from the frozen channel instead of
    // enriching from window.HB. Same fields and same meaning HB.snapshot()
    // publishes, including houndframe's prowl/tell/charge/skid/tumble `state`,
    // the polyp's closed/tell/fire/vent `state`, and the mock-3D
    // `materialized` flag (a hostile still condensing out of the tower depth
    // has no hitbox).
    hostiles: hostiles.map((e) => ({
      id: e.id, kind: e.kind, state: e.state, dir: e.dir,
      x: e.x, y: e.y, hp: e.hp, materialized: gameMs >= e.enterUntil,
    })),
    // movement-verb prototypes, additive and inert when their flags are off:
    // the tether's phase/anchor and the momentum chain's live multiplier, so a
    // bot run can prove a hook route was actually hooked. `player.*` above is
    // untouched — traversalState keeps its frozen free|ledge|wall domain.
    hook: HOOK_ENABLED ? hookSnapshot() : undefined,
    flow: FLOW_ENABLED ? flowSnapshot() : undefined,
    // additive (T-013): the front end's own state, so a bot run can prove it
    // was never parked on the title screen. `state` above reads 'MENU' while
    // the start screen holds a built-but-frozen run; an automated session
    // (?testapi=1 / ?selftest=1) auto-starts and never sees it.
    shell: SHELL_ENABLED ? shellSnapshot() : undefined,
    // additive (T-011): the feedback pass's live state and the frame-time
    // sampler that proves its budget. `juice` is presentation counters plus
    // the sim's own hit-stop remainder; `perf` is measured wall-clock frame
    // intervals, so "60fps with 200+ projectiles" is a reading, not a claim.
    juice: juiceSnapshot(),
    perf: perfSnapshot(),
  };
}

/* -------------------------- frame sampler ------------------------- *
 * A fixed ring of the last PERF_N real frame intervals. Wall clock on
 * purpose: ?fixeddt pins the SIM step, and what a juice budget has to be
 * judged against is what the browser actually painted. Allocation-free
 * and read-only; nothing in the run depends on it.                    */
const PERF_N = 180;
const perfRing = new Float64Array(PERF_N);
let perfCount = 0, perfIdx = 0, perfLast = 0;

function samplePerf(t) {
  if (perfLast > 0) {
    perfRing[perfIdx] = t - perfLast;
    perfIdx = (perfIdx + 1) % PERF_N;
    if (perfCount < PERF_N) perfCount++;
  }
  perfLast = t;
}

function perfSnapshot() {
  if (perfCount === 0) return { frames: 0, fps: 0, avgMs: 0, worstMs: 0, over20ms: 0 };
  let sum = 0, worst = 0, over = 0;
  for (let i = 0; i < perfCount; i++) {
    const v = perfRing[i];
    sum += v;
    if (v > worst) worst = v;
    if (v > 20) over++;                  // a dropped frame at 60Hz (16.7ms + slack)
  }
  const avg = sum / perfCount;
  return {
    frames: perfCount,
    fps: +(1000 / avg).toFixed(1),
    avgMs: +avg.toFixed(2),
    worstMs: +worst.toFixed(2),
    over20ms: over,
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

/* ?fixeddt=<ms> (verification hook, harness-engineer request): every frame
   advances the sim by a CONSTANT dt instead of measured wall-clock time, so a
   sim-time-locked input script produces one outcome instead of forking on the
   browser's rAF cadence. Clamped to the same [1, 50]ms envelope the live clock
   already has; absent/invalid = 0 = the shipped variable timestep, untouched.
   Verification-only: under load the game runs slower than realtime rather than
   ever skipping sim time. */
const FIXED_DT_MS = (() => {
  const raw = parseFloat(QUERY.get('fixeddt'));
  return Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.max(1, raw)) : 0;
})();

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  samplePerf(t);
  const dt = FIXED_DT_MS ? FIXED_DT_MS / 1000 : Math.min(50, t - last) / 1000;
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
  // static-anatomy reveal (default since T-009; ?zip=1 restores the legacy
  // brick-slam) — render-mode facts only, deliberately OUTSIDE
  // the frozen telemetry channel so a default-vs-g1 testapi trace comparison
  // has nothing mode-dependent in it to explain away.
  g1: IS_G1 ? { pieces: limbPieces, fog: { ...CONFIG.limb.fog } } : null,
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
  // the game shell (title / pause-options / run stats), read surface only
  shell: shellSnapshot,
  // baseline feedback pass (?juice=0 disables): effect counters + the sim's
  // live hit-stop remainder, and the frame-time sampler beside it
  juice: juiceSnapshot,
  perf: perfSnapshot,
  hitStopMs: () => hitStopRemainingMs(),
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
      // `hostiles` now comes from telemetry() itself (the frozen channel
      // publishes it too), so the two channels cannot drift on the field set.
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
    // ?selftest=1 auto-starts, so this only fires for ?selftest=1&shell=title
    // (the capture URL): leave the title before the pause/resume checks below.
    if (SHELL_ENABLED && state === 'MENU') startRun();
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
    if (IS_G1) {
      // the limb baked, the air is the limb's, and the corner machinery is
      // still the shipped one — the experiment is render-only by construction
      check('limb baked', limbPieces > 0);
      // the limb's own fog BAND (not its absolute distances: the ?view=
      // pull-back shifts both ends by the same delta)
      check('limb haze armed', Math.abs((scene.fog.far - scene.fog.near) -
        (CONFIG.limb.fog.far - CONFIG.limb.fog.near)) < 1e-6);
      check('corner ritual untouched', activeCorner().k === 1 &&
        activeCorner().state === 'idle' && cornerEventTotalMs(CONFIG) === 1100);
    }
    if (IS_TRANSFORM_SLICE) {
      // The live altitude must match a fresh pure rebuild of the SELECTED
      // fixture's path — proves the ?g2 fixture selection wired every live
      // binding — and on the v1 demo the spawn additionally still stands at
      // altitude 0, bit-for-bit the original check.
      const spawnX = ACTIVE_FIXTURE.run.playerSpawn.x;
      const freshPath = buildTransformPath(ACTIVE_FIXTURE, CONFIG);
      check('body static at spawn', committedBand === 0 &&
        transformAltitudeAt(spawnX) === transformAltAt(freshPath, spawnX) &&
        (IS_G2 || transformAltitudeAt(spawnX) === 0));
      check('first turn idle', activeTransformEvent().state === 'idle');
      check('transform fixture selected', IS_G2
        ? ACTIVE_FIXTURE.id === 'monster-g2-neck-flip' &&
          activeTransformEvent().id === 'neck-plate-flip'
        : ACTIVE_FIXTURE.id === 'transform-v1');
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
    /* Game shell (T-013). The first check is the harness contract: a
       ?selftest=1 session must already be PLAYING, never parked on a title
       screen. The rest walks the whole front-end loop — run → title → run —
       and leaves the game PLAYING exactly as the checks above found it. */
    if (SHELL_ENABLED) {
      // an automated session is never left sitting on the title screen: it
      // either auto-started (?testapi=1 / ?selftest=1) or explicitly asked
      // for the title with ?shell=title, in which case the block above
      // pressed on through it before any of these checks ran
      check('automated session is never parked on the title',
        state === 'PLAYING' && !shellSnapshot().atTitle &&
        (SHELL_AUTOSTART || QUERY.get('shell') === 'title'));
      check('start direction resolved',
        shellSnapshot().directions.includes(shellSnapshot().direction) &&
        shellSnapshot().direction === START_DIRECTION_ID);
      toTitle();
      const menuOverlay = document.getElementById('overlay');
      check('quit to title parks the run at the start screen',
        state === 'MENU' && shellSnapshot().atTitle &&
        document.getElementById('shell').classList.contains('on') &&
        menuOverlay.style.display === 'none');
      // the intent table must not consume any gameplay key at the title
      check('title consumes no gameplay key',
        ['ArrowRight', 'Space', 'KeyJ', 'KeyK', 'KeyX', 'ShiftLeft', 'KeyW']
          .every((c) => shellKeyIntent(c, 'MENU') === 'start'));
      /* RENDER-side composition checks, on every direction. pathcheck can
         only see the composition DATA — it reads `3.8% of frame height` off
         src/pure/shell.js and is satisfied — so the two ways the DOM can
         disagree with that data are checked here, where there is a layout:
           1. custom properties INHERIT. Every element must write its own
              copy, or an attached child re-applies its parent's rotation on
              top of the parent's transform (RIG at 74° on a 37° plate),
              multiplies its opacity, or borrows its tone;
           2. the figure that lands on screen is the one the data declares —
              no rotation of its own beyond the surface it stands on, and a
              rendered box still inside board 13's 3–5% of frame height. */
      {
        const startedOn = shellSnapshot().direction;
        const leaked = [], tilted = [], scaled = [];
        for (let i = 0; i < START_DIRECTION_IDS.length; i++) {
          shellApplyIntent('pick:' + i);
          const id = START_DIRECTION_IDS[i];
          for (const el of document.querySelectorAll('#shellArt .sl'))
            for (const v of SHELL_ELEMENT_VARS)
              if (el.style.getPropertyValue(v) === '') leaked.push(id + ' ' + el.className + v);
          const rig = document.querySelector('#shellArt .sl-rig');
          const t = rig && getComputedStyle(rig).transform;
          if (!rig || !(t === 'none' || /^matrix\(1,\s*0,\s*0,\s*1[,)]/.test(t)))
            tilted.push(id + ' ' + t);
          const pct = rig ? (rig.getBoundingClientRect().height / innerHeight) * 100 : 0;
          if (!(pct >= RIG_SCREEN_FRACTION.min && pct <= RIG_SCREEN_FRACTION.max))
            scaled.push(id + ' ' + pct.toFixed(2) + '%');
        }
        shellApplyIntent('pick:' + START_DIRECTION_IDS.indexOf(startedOn));
        check('no composed element inherits a custom property' +
          (leaked.length ? ' (' + leaked.slice(0, 3).join(', ') + ')' : ''), leaked.length === 0);
        check('RIG carries no rotation of its own — it stands on its surface' +
          (tilted.length ? ' (' + tilted.join(', ') + ')' : ''), tilted.length === 0);
        check('RIG RENDERS at board 13\'s human scale (3–5% of frame height)' +
          (scaled.length ? ' (' + scaled.join(', ') + ')' : ''), scaled.length === 0);
      }
      const attemptsAtTitle = sliceStats.attempts;
      // a real keypress, not startRun(): R is the traversal slice's restart
      // key, so this also proves the press that leaves the title does not
      // fall through into a second, attempt-spending reset
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      check('any key leaves the title into a live run',
        state === 'PLAYING' && !shellSnapshot().atTitle &&
        document.getElementById('shell').classList.contains('on') === false &&
        shellSnapshot().runMs < 50);
      // …and it starts the run the title was already holding, rather than
      // rebuilding it: the attempt counter must not tick for a title view
      check('leaving the title does not spend an attempt',
        sliceStats.attempts === attemptsAtTitle);
    } else {
      check('shell disabled boots straight into the run', state === 'PLAYING');
    }
    // Baseline feedback pass: the flag resolves both ways, and a restart
    // leaves the whole pass at rest — no freeze, no trauma, no live effect
    // riding into the first frame of a run.
    {
      const j = juiceSnapshot();
      check('juice flag plumbed', j.enabled === (QUERY.get('juice') !== '0'));
      check('juice idle after restart',
        j.hitStopMs === 0 && j.trauma === 0 && j.sparks === 0 && j.flashes === 0);
      check('juice pools sized from config',
        !j.enabled || (j.sparkMax === CONFIG.juice.pools.particles &&
          j.flashMax === CONFIG.juice.pools.flashes));
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
/* The shell boots to its title screen with the run built but frozen (MENU).
   An automated session — ?testapi=1 (every bot playtest) or ?selftest=1 —
   skips it, so every committed script keeps the exact boot it had before
   the shell existed, and so does ?shell=0. ?shell=title forces the title
   even under those flags, which is how the harness screenshots it. */
if (SHELL_ENABLED && !SHELL_AUTOSTART) setState('MENU');
requestAnimationFrame(frame);
