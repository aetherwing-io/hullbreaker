/* ================================================================== *
 *  HULLBREAKER — production run
 *  Six escalating defense phases, traversal combat, earned overdrive,
 *  creature-body ascent, the Meridian Crown, and the signal-home payoff.
 * ================================================================== */
/* This module is the composition root: it wires input, the frame loop, the
   run lifecycle (resetGame), the browser self-test, and the read-only
   window.HB debug handle. Everything else lives in
   src/pure (deterministic math and data), src/sim (the renderer-free
   simulation), src/render (three.js), and src/ui (DOM). */

import { CONFIG } from './config.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, FLOW_ENABLED, HOOK_ENABLED,
  HOOK_INPUT, IS_G1, IS_G2, IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE,
  MOMENTUM_ENABLED, QUERY, SCORE_ENABLED, SHELL_AUTOSTART, SHELL_ENABLED,
  SLICE_ENEMIES_ENABLED, SLICE_ENEMY_PLAN, SLICE_FALLBACK_ENABLED, SLICE_PACE,
  START_DIRECTION_ID, VIEW_ID,
} from './mode.js';
import { HALT_S } from './pure/path.js';
import {
  FRAME_INPUT_VERSION, GAMEPLAY_KEYMAP, createFrameInputTimeline,
} from './pure/frame-input.js';
import {
  RIG_SCREEN_FRACTION, SHELL_ELEMENT_VARS, START_DIRECTION_IDS, shellKeyIntent,
} from './pure/shell.js';
import { cornerEventTotalMs } from './pure/waves.js';
import {
  buildTransformPath, transformAltAt, transformEventTotalMs,
} from './pure/transform.js';
import { traversalCameraDepth } from './pure/traversal.js';
import { momentumTier } from './pure/momentum.js';
import { installHost } from './sim/bridge.js';
import {
  advanceGameMs, gameMs, hitStopRemainingMs, scrollX, sliceStats, stepHitStop,
} from './sim/time.js';
import { sLeftEdge, sRightEdge } from './sim/edges.js';
import {
  bufferHookUntil, bufferJumpUntil, bufferSwapUntil, keys, releaseAllKeys,
} from './sim/input.js';
import {
  activeScrollEnd, activeScrollSpeed, END_SCROLL, levelData, pockets,
} from './sim/level.js';
import { setState, state } from './sim/state.js';
import { P, player, updatePlayer } from './sim/player.js';
import {
  currentGun, currentGunDef, currentGunLabel, currentWeapon, shotsFired, updateBullets,
} from './sim/weapons.js';
import {
  hostiles, kills, spawnHostile, updateHostiles,
} from './sim/hostiles.js';
import { capsules, spawnCapsule, updateCapsules } from './sim/capsules.js';
import { mods, updateMods } from './sim/mods.js';
import { momentumDrive, momentumPeakDrive, pacePeak, paceSpeed } from './sim/pace.js';
import { hookSnapshot } from './sim/hook.js';
import { flowSnapshot } from './sim/flow.js';
import {
  resetScore, scoreEvents, scoreRunEnd, scoreRunStart, scoreSnapshot, updateScore,
} from './sim/score.js';
import { updateSpawner } from './sim/spawner.js';
import { meridianDefenseSnapshot, updateMeridianDefense } from './sim/meridian-defense.js';
import {
  finaleActive, finaleComplete, finaleSnapshot, startFinale, updateFinale,
} from './sim/finale.js';
import { activeCorner } from './sim/wavegate.js';
import {
  activeTransformEvent, committedBand, transformAltitudeAt, transformDecisionTrace,
  transformFrontierX, transformSealX,
} from './sim/transform.js';
import { updateScroll } from './sim/scroll.js';
import { camera, renderer, scene } from './render/scene.js';
// Register the complete Level 1 ecology atlas before any existing art owner
// can settle the shared preload gate. Authored rows are still opt-in: this is
// residency only, and ordinary enemies never enter its renderer branch.
import './render/enemy-ecology-art.js';
// The large world-detail atlas must join the boot gate before level.js enters
// materials.js. Its consumer receives one frozen ready/fallback decision and
// cannot introduce a late texture pop during the climb.
import './render/world-detail-art.js';
import './render/crown-art.js';
// Dependency-light preload owner: register the projectile atlas before post,
// hostiles and backdrop can settle the one shared texture gate. bullets.js
// later consumes its frozen ready/fallback contract without loading anything.
import './render/projectile-art.js';
// One approved 1024px action-paint atlas joins the same boot settlement.
// Its consumer is imported only after juice has wrapped the bridge, below.
import './render/action-vfx-art.js';
// Rooted enemy hardware uses two immutable production atlases. Register both
// before post/hostiles can settle the shared gate; the consumer never fetches
// or swaps artwork after frame one.
import './render/actor-motion-art.js';
// One environment-only atlas supplies the six current Meridian response
// states. It settles before the isolated socket renderer can consume it.
import './render/defense-vfx-art.js';
// the one draw of the frame, and the only place the composer is reachable
// from: renderFrame() is renderer.render() until the bloom pass is up, and
// falls back to it again the moment the pass misbehaves (src/render/post.js)
import { POST, postSnapshot, renderFrame, warmScenePrograms } from './render/post.js';
import {
  activeCameraDepth, calibrateEdges, handleResize, syncCamera,
} from './render/camera.js';
import { mountHostileWarmResources, updateCorpses } from './render/hostiles.js';
// backdrop.js (T-051) is reached here, AFTER
// the scene.js import above, rather than from scene.js itself — it awaits the
// shared preload gate (src/render/preload.js), which itself needs `renderer`
// from scene.js, and scene.js's own top-level code cannot finish running
// until everything it imports has (dependencies always evaluate before the
// importing module's own body, regardless of source position). Importing
// backdrop.js from scene.js would therefore be a real cycle — proved three
// ways to either deadlock the boot or leave `scene`/`renderer` permanently
// stuck in their temporal dead zone — where importing it here is the same
// ordinary forward dependency src/render/sprites.js already relies on below.
import './render/backdrop.js';
// Kept separate from the direct boot import above: existing deployment gates
// prove that exact side-effect edge cannot migrate into scene.js, while this
// binding supplies the post-camera facet traversal refresh.
import { updateBackdropFacetVisibility } from './render/backdrop.js';
import { updateWorldDressingCull } from './render/level.js';
import { updateSeamFoldCull } from './render/seams.js';
import { limbPieces, updateLimbFoldCull } from './render/limb.js';
import { updateCrownFacetCull } from './render/crown.js';
// durability (T-032): the module half of the failure handling. Its panel and
// watchdogs are inline in index.html — they have to survive THIS file never
// executing — and this import only adds what needs a running game.
import {
  failsafeBeat, failsafeBooted, failsafeHalted, failsafeSelfCheck,
  failsafeSnapshot, installFailsafe, reportContextLost, reportFault,
} from './ui/failsafe.js';
import { FAILSAFE } from './pure/failsafe.js';
import { resetHudMessage, updateHUD } from './ui/hud.js';
import { shellApplyIntent, shellRunStarted, shellSnapshot } from './ui/shell.js';
import { installTouchControls } from './ui/touch-controls.js';
// audio also loads after every render/ui module for the bridge-wrapping reason
// its own header states — the named import changes nothing about that order.
// audioSnapshot() rides window.HB below: exported-but-unimported is unreachable
// with no build step, which is what made the documented console surface fiction
// (SPRINT I-005).
import { audioSnapshot } from './ui/audio.js';
// Juice loads after the full render/UI bridge. The action-paint observer is
// deliberately the only wrapper outside it: action VFX delegates to this
// finished juice chain first and can never replace or short-circuit it.
import { juiceSnapshot, updateJuice } from './render/juice.js';
import { actionVfxSnapshot, updateActionVfx } from './render/action-vfx-runtime.js';
import { initializeViewRegistry, viewInitSnapshot } from './boot/view-init.js';
import { resetRunState, runResetSnapshot } from './boot/run-reset.js';
import {
  adaptiveFidelitySnapshot, sampleAdaptiveFidelity,
} from './render/adaptive-fidelity.js';

// One explicit base-owner manifest, then one observer manifest. Imports may
// allocate fixed render resources; only this call mutates sim/bridge.
initializeViewRegistry();

// the sim asks for a restart through this hook (fixture fast retry)
installHost({ resetGame: () => resetGame() });

// …and so does the failsafe: a restart is the ONE repair the game can make
// on its own when a frame keeps throwing (src/pure/failsafe.js decides when
// it is worth spending, and when to stop and show the panel instead).
installFailsafe({ restart: () => resetGame() });

addEventListener('resize', handleResize);

/* The drawing surface can vanish under a player with nothing thrown and the
   loop still beating — a GPU reset, a laptop waking up — and the result is
   the exact defect this pass exists to remove: a still canvas on a live
   page. Rebuilding every buffer mid-run is not something to attempt while a
   9-year-old watches a frozen screen, so this fails legibly instead: the
   panel, one key, a fresh run. */
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  reportContextLost();
});

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
const KEYMAP = GAMEPLAY_KEYMAP;

// One gameplay edge path for a human KeyboardEvent and the verification-only
// frame timeline. Keeping jump/hook buffering here is load-bearing: a test
// edge must not become a weaker direct write to `keys`, and reasserting a held
// key after reset must use repeat=true so it does not manufacture a new press.
function applyGameplayKeyEdge(code, type, repeat = false) {
  const k = KEYMAP[code];
  if (!k) return false;
  if (type === 'keyup') {
    keys[k] = false;
    return true;
  }
  if (type !== 'keydown') return false;
  if (k === 'jump' && !repeat) bufferJumpUntil(gameMs + CONFIG.player.jumpBufferMs);
  if (k === 'swap' && !repeat) bufferSwapUntil(gameMs + 140);
  if (k === 'hook' && !repeat && ACTIVE_SLICE && ACTIVE_SLICE.hook)
    bufferHookUntil(gameMs + ACTIVE_SLICE.hook.bufferMs);
  keys[k] = true;
  return true;
}

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
  if (!KEYMAP[e.code]) return;
  e.preventDefault();
  applyGameplayKeyEdge(e.code, 'keydown', e.repeat);
});
addEventListener('keyup', (e) => {
  applyGameplayKeyEdge(e.code, 'keyup', e.repeat);
});

addEventListener('blur', releaseAllKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllKeys(); });

// a click / tap is "any key" too, and it is the only input a pointer-only
// visitor has. Nothing else in the game reads the pointer.
addEventListener('pointerdown', () => { if (SHELL_ENABLED && state === 'MENU') startRun(); });

// Coarse-pointer devices get one input surface, not a simplified simulation.
// The controller emits this same key-edge path, preserving jump buffers,
// weapon swaps, ladder intent, deterministic telemetry and every keyboard
// tuning decision. ?touch=1 exposes it on desktop for visual/playtest review.
const touchControls = installTouchControls({
  applyEdge: applyGameplayKeyEdge,
  canControl: () => state === 'PLAYING',
  startRun: () => { if (SHELL_ENABLED && state === 'MENU') startRun(); },
  togglePause,
});

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
  resetRunState();
  // The registry released the shared input booleans. Forget the touch-side
  // ownership ledger now so its next gesture can assert fresh edges.
  touchControls.reset({ release: false });
  // resetRunState intentionally releases every ordinary key. A frame-scoped
  // script owns a longer-lived schedule, so restore only inputs that are still
  // held at this tick. repeat=true preserves real keyboard semantics: a held
  // jump/fire resumes, but reset never invents another jump/hook press edge.
  if (frameInputTimeline) frameInputTimeline.reassertHeld(gameMs);
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
  updateBackdropFacetVisibility();
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
  updateBackdropFacetVisibility();       // exact-zero remote air/plates leave render traversal
  updateWorldDressingCull();             // strict camera-facet ownership for props/lights
  updateSeamFoldCull();                  // static pips exist only on the built camera facet
  updateCrownFacetCull();                // the resident summit waits for its built outro facet
  updateLimbFoldCull();                   // sector self-occlusion; uploads only on facet changes
  updateSpawner();
  updateMeridianDefense();
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
  // Damage/death hooks above arm exact endpoints; step after bullets so a
  // contact paints on the collision frame rather than one frame later.
  updateActionVfx();
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
  } else {
    if (scrollX >= END_SCROLL && !finaleActive()) startFinale();
    updateFinale();
    if (finaleComplete()) {
      scoreRunEnd('clear');
      setState('VICTORY');
    }
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
    finale: ACTIVE_FIXTURE ? undefined : finaleSnapshot(),
    meridianDefense: ACTIVE_FIXTURE ? undefined : meridianDefenseSnapshot(),
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
      // additive (T-025, SPRINT I-006 / playtest README hook request #9): the
      // FAILURE LADDER, on the frozen channel. `attempt` below only moves
      // inside a fixture (resetGame), so a default six-face trace carrying
      // attempt alone has no way to say a life was spent — the harness was
      // reduced to counting `▰`/`×N` glyphs out of the HUD, and every gate
      // that read the attempt counter instead reported `deaths: 0` for a run
      // that died twice. hp/lives are the numbers the HUD renders, published
      // where a machine reads them. Read-only, same as everything else here.
      hp: player.hp,
      lives: player.lives,
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
    // additive (T-029, SPRINT I-030): the EARNED escalation itself, not a
    // number a reader has to invert `pursuitSpeed` to recover. That inversion
    // (momentumDriveFromSpeed) is only valid while escalation is the sole
    // source feeding the pace; T-023's boosts push their own speed through the
    // same momentumClampSpeed chokepoint by design, and on that day a trace
    // that carries speed alone cannot tell "the player earned this" from "a
    // boost is running". Publishing drive/peakDrive/tier keeps the T-022
    // packet's falsifying gates ("drive never exceeds 0.30 for a struggling
    // player") readable from a trace afterwards. Undefined on every URL
    // without ?momentum=1, exactly like `hook`/`flow` above.
    momentum: MOMENTUM_ENABLED ? {
      drive: momentumDrive(),
      peakDrive: momentumPeakDrive(),
      tier: momentumTier(momentumDrive(), CONFIG.momentum),
    } : undefined,
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
      staggered: gameMs < e.staggerUntil,
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
    actionVfx: actionVfxSnapshot(),
    viewInit: viewInitSnapshot(),
    resetRegistry: runResetSnapshot(),
    adaptiveFidelity: adaptiveFidelitySnapshot(),
    perf: perfSnapshot(),
    // additive (T-048, decisions.md entry 18): which draw path this frame
    // took. `status` is the honest one — 'active' only while the composer is
    // really drawing, 'failed' if it broke and the direct path took over —
    // so a capture or a perf reading can never be attributed to a pass that
    // was not running when it was taken.
    post: postSnapshot(),
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
    const frameMs = t - perfLast;
    perfRing[perfIdx] = frameMs;
    perfIdx = (perfIdx + 1) % PERF_N;
    if (perfCount < PERF_N) perfCount++;
    sampleAdaptiveFidelity(frameMs);
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

/* The harness installs this payload with addInitScript BEFORE navigation, so
   an event at t=0 cannot lose a race with module evaluation or the first rAF.
   Ordinary/testapi-only pages have no payload and stay on the exact DOM path
   above. There is intentionally no post-boot queueEvent mutation surface: a
   complete schedule is evidence; CDP timing smuggled in after boot is not. */
const frameInputBootstrap = QUERY.has('testapi')
  ? globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__
  : null;
let frameInputTimeline = null;
let frameInputError = null;
if (frameInputBootstrap) {
  try {
    if (frameInputBootstrap.version !== FRAME_INPUT_VERSION)
      throw new Error(`frame input version ${frameInputBootstrap.version} does not match ${FRAME_INPUT_VERSION}`);
    if (!FIXED_DT_MS) throw new Error('frame input requires ?fixeddt=<ms>');
    frameInputTimeline = createFrameInputTimeline({
      events: frameInputBootstrap.events,
      fixedDtMs: FIXED_DT_MS,
      stopAtMs: frameInputBootstrap.stopAtMs,
      applyEdge: applyGameplayKeyEdge,
    });
  } catch (err) {
    frameInputError = String(err && err.message || err);
  }
  // The copied/validated timeline is the only mutable owner from here on.
  try { delete globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__; } catch (_) { /* non-fatal */ }
}

function frameInputSnapshot() {
  if (frameInputTimeline) return frameInputTimeline.snapshot();
  return {
    version: FRAME_INPUT_VERSION,
    status: frameInputError ? 'error' : 'disabled',
    error: frameInputError,
    fixedDtMs: FIXED_DT_MS || null,
    eventCount: 0,
    events: [],
    reassertions: [],
  };
}

// absent from every ordinary URL: only ?testapi=1 publishes the channel.
// Both methods return structured-cloneable snapshots; neither exposes a
// mutable queue, keys object, or simulation row.
if (QUERY.has('testapi')) {
  Object.defineProperty(globalThis, '__HULLBREAKER_TEST__', {
    value: Object.freeze({ snapshot: telemetry, inputTimeline: frameInputSnapshot }),
    configurable: false,
    writable: false,
  });
}

let last = performance.now();
/* The loop is written so that no single throw can leave a live page in
   front of a dead picture (T-032):
     - the halt check comes first, so once the failure panel is up the
       simulation stops rather than grinding out frames nobody can see;
     - the next frame is requested BEFORE any work, so a throw anywhere
       below cannot end the loop by accident;
     - the step and the draw are caught separately: a simulation fault
       still paints the frame it broke on, which is what keeps the picture
       honest while src/pure/failsafe.js decides whether this is a blip, a
       restart, or the end of the run.
   A hidden page explicitly skips sim and GPU work because extension/CDP
   sessions are not always throttled like ordinary background tabs. The dt
   clamp remains the return-path guard: the first visible frame advances the
   simulation by at most 50 ms of missed wall time. */
function frame(t) {
  if (failsafeHalted()) return;
  requestAnimationFrame(frame);
  // Chrome normally throttles a hidden tab, but extension/CDP-controlled QA
  // pages can remain eligible for full-rate WebGL. Keep the loop recoverable
  // while doing no simulation, HUD, or GPU work until the page is visible.
  if (document.hidden) { last = t; return; }
  samplePerf(t);
  failsafeBeat();
  const dt = FIXED_DT_MS ? FIXED_DT_MS / 1000 : Math.min(50, t - last) / 1000;
  last = t;
  if (state === 'PLAYING') {
    // Exact schedules drain immediately before the update they own and freeze
    // at their declared terminal tick. This removes not only CDP latency but
    // the old sampler race where a 75ms poll noticed the end several updates
    // late. The render/HUD loop keeps drawing the frozen evidence frame.
    const shouldUpdate = !frameInputTimeline || frameInputTimeline.beforeUpdate(gameMs);
    if (shouldUpdate) {
      try {
        update(dt);
      } catch (err) {
        if (reportFault('update', err) === 'stop') return;
      } finally {
        if (frameInputTimeline) frameInputTimeline.afterUpdate();
      }
    }
  }
  try {
    renderFrame();
    updateHUD();
  } catch (err) {
    reportFault('render', err);
  }
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
  currentGun: () => {
    const def = currentGunDef();
    return {
      id: currentGun.id,
      letter: currentGun.letter,
      tier: currentGun.tier,
      traits: [...currentGun.traits],
      label: currentGunLabel(),
      stats: {
        fireRateMs: def.fireRateMs, damage: def.damage, speed: def.speed,
        count: def.count, pierceBudget: def.pierceBudget,
        seekRange: def.seekRange, seekFuelMs: def.seekFuelMs,
        seekRetargets: def.seekRetargets,
        terrainPhaseTiles: def.terrainPhaseTiles,
        heavyImpulse: def.heavyImpulse, heavyStunMs: def.heavyStunMs,
        volatileRadius: def.volatileRadius,
      },
    };
  },
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
  finale: { snapshot: finaleSnapshot },
  // the game shell (title / pause-options / run stats), read surface only
  shell: shellSnapshot,
  // baseline feedback pass (?juice=0 disables): effect counters + the sim's
  // live hit-stop remainder, and the frame-time sampler beside it
  juice: juiceSnapshot,
  // One-atlas, fixed-row painted impact/death punctuation. Read-only.
  actionVfx: actionVfxSnapshot,
  perf: perfSnapshot,
  viewInit: viewInitSnapshot,
  resetRegistry: runResetSnapshot,
  adaptiveFidelity: adaptiveFidelitySnapshot,
  // the screen pass (?bloom=0 disables): flag, live status, the bloom
  // parameters actually in effect, and any fault that dropped it
  post: postSnapshot,
  // WebAudio layer (?audio=0 disables it): whether a context exists yet, its
  // lifecycle state, how many ambience layers are engaged and how many voices
  // are live. Read-only, and the reason it is HERE rather than only inside
  // src/ui/audio.js: with no build step an exported-but-unimported symbol is
  // reachable from nothing, so the T-012 gate had to monkey-patch AudioParam
  // to infer a layer count this function already returns (SPRINT I-005).
  audio: audioSnapshot,
  // durability (T-032): whether the inline bootstrap is installed, whether
  // the boot completed, the live frame heartbeat, how many faults the policy
  // has seen and what it did about them. Read-only, and the channel a
  // headless abuse run reads to prove the game survived what it was put
  // through (tools/durability/abuse.mjs).
  failsafe: failsafeSnapshot,
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
      currentWeapon, currentGun: window.HB.currentGun(), kills, shotsFired,
      // `hostiles` now comes from telemetry() itself (the frozen channel
      // publishes it too), so the two channels cannot drift on the field set.
      capsules: capsules.map((c) => ({
        kind: c.kind, letter: c.letter, x: c.x, y: c.y, mode: c.mode,
        gun: c.gun ? {
          id: c.gun.id, tier: c.gun.tier, traits: [...c.gun.traits],
          label: c.gun.label,
        } : null,
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
    // `far` for the shipped impossible-scale frame); when `near` IS selected it must
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
    /* The screen pass (T-048, decisions.md entry 18). pathcheck can see the
       resolver and the wiring; it cannot see which draw path a live page took,
       and that is the whole risk here — a composer that quietly replaced the
       one render call, or one that failed its CDN fetch and left a still
       canvas. So this checks the three things only a running page knows:
       the flag and the module agree, the pass never claims to be drawing when
       it is not, and — the load-bearing one — frames are on screen on
       whichever path is live. `loading` is a legitimate status at 1.5s: the
       addons come over the network, and the direct path is drawing until they
       land, which is exactly the fallback this asserts. */
    {
      const p = postSnapshot();
      const raw = QUERY.get('bloom');
      check('post flag plumbed', POST.on === (raw !== '0' && raw !== 'off'));
      check('post status matches the flag (' + p.status + ')',
        p.on ? ['loading', 'active', 'failed'].includes(p.status) : p.status === 'off');
      check('bloom parameters are live only while the pass draws',
        p.status === 'active'
          ? p.strength > 0 && p.threshold > 0 && p.gain > 1
          : p.strength === 0 && p.gain === 1);
      // the fallback contract, stated as the player experiences it
      check('frames render on whichever path is live', renderer.info.render.frame > 0);
    }
    /* Durability (T-032). The failure panel is the only signal a player gets
       that something broke, so the browser has to prove four things pathcheck
       cannot: the bootstrap is installed in THIS page, the panel is down
       during a healthy run, the frame loop is actually beating (the freeze
       watchdog reads that counter), and the panel — painted for real, then
       put away — lands on screen with a way back into the game and words a
       9-year-old can read. */
    {
      const fs = failsafeSnapshot();
      check('failsafe bootstrap installed and boot completed', fs.installed && fs.booted);
      check('failure panel is down during a healthy run',
        !fs.showing && !fs.halted && fs.faults === 0);
      check('frame loop heartbeat is live', fs.beats > 0);
      check('dt clamp matches the durability policy',
        FAILSAFE.frameDtMaxMs === 50 && fs.policy.frameDtMaxMs === 50);
      const panel = failsafeSelfCheck();
      check('failure panel renders, offers a way back, and reads plainly' +
        (panel.issues.length ? ' (' + panel.issues.slice(0, 3).join('; ') + ')' : ''),
        panel.visible && panel.reachableReload && panel.issues.length === 0);
      check('failure panel puts itself away again', !failsafeSnapshot().showing);
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
{
  const hostileWarmMount = mountHostileWarmResources();
  try { warmScenePrograms(); }
  finally { hostileWarmMount.dispose(); }
}
/* The shell boots to its title screen with the run built but frozen (MENU).
   An automated session — ?testapi=1 (every bot playtest) or ?selftest=1 —
   skips it, so every committed script keeps the exact boot it had before
   the shell existed, and so does ?shell=0. ?shell=title forces the title
   even under those flags, which is how the harness screenshots it. */
if (SHELL_ENABLED && !SHELL_AUTOSTART) setState('MENU');
requestAnimationFrame(frame);
/* LAST statement in the file, deliberately: until this runs, the inline
   bootstrap in index.html treats any uncaught failure as "the game could not
   start" and shows the boot panel. Reaching here means every module in the
   graph parsed, every side-effecting import ran, and the first frame is
   scheduled — the exact thing that was NOT true on 2026-08-02. */
failsafeBooted();
