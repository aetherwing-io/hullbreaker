#!/usr/bin/env node
/* run-child.mjs — ONE six-face run of the REAL, unmodified simulation in Node.
 *
 * Usage (normally spawned by lab.mjs, one fresh process per run so no module
 * state can leak between runs):
 *   node tools/simlab/race/run-child.mjs '{"policy":"rush","seed":1,"viewport":"desktop-16x10"}'
 *
 * What it reproduces, and how:
 *   - BOOT: src/main.js calls calibrateEdges() then resetGame() before the first
 *     frame. Edges come from ./edges.mjs (the analytic camera replica); the
 *     reset is the sim half of src/boot/run-reset.js's registry, in registry
 *     order, plus resetGame's own six-face lines (pocket capsules,
 *     scoreRunStart, updateScroll(0), setState('PLAYING')).
 *   - FRAME: src/main.js update(dt) for the six-face run, render/UI calls
 *     dropped (legal by the bridge contract: uninstalled view hooks are
 *     no-ops). Fixed dt = 1/60 s, the same step `?fixeddt=16.667` uses.
 *   - INPUT: the policy writes src/sim/input.js `keys` directly before each
 *     update, and a fresh jump press arms the jump buffer exactly like
 *     applyGameplayKeyEdge() in main.js (bufferJumpUntil(gameMs + jumpBufferMs)).
 *   - DRIFT GUARDS: before running, the child re-reads src/main.js and
 *     src/boot/run-reset.js and refuses to run if the update order, the reset
 *     registry ids, or resetGame's six-face lines no longer match this copy.
 *
 * Output: one JSON object on stdout (summary + per-face rows + optional trace).
 * Zero effect on the shipped game: read-only imports of src/.               */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, assertCameraSourceMatches, viewportEdges } from './edges.mjs';
import { Policy } from './policies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const SRC = join(ROOT, 'src');
const mod = (rel) => import('file://' + join(SRC, rel));

/* ----------------------------- drift guards ----------------------------- */

// The sim calls in src/main.js update(), in order. Render/UI calls between
// them (syncCamera, cull refreshes, updateJuice, updateCorpses,
// updateActionVfx) are intentionally absent from the replica.
const UPDATE_ORDER = [
  'advanceGameMs(dt * 1000)',
  'stepHitStop(kills, player.hp)',
  'updateScroll(dt * wScale)',
  'updateSpawner()',
  'updateMeridianDefense()',
  'updatePlayer(dt * hScale)',
  "if (state !== 'PLAYING') return;",
  'updateHostiles(dt * wScale)',
  'updateCapsules(dt * wScale)',
  'updateMods()',
  'updateBullets(dt * hScale)',
  'updateScore(dt, {',
  'if (scrollX >= END_SCROLL && !finaleActive()) startFinale();',
  'updateFinale();',
  'if (finaleComplete()) {',
];

// src/boot/run-reset.js registry ids, in order. `null` = render-only entry the
// replica skips (it owns no simulation state).
const RESET_ORDER = [
  'slice-retry', 'input-keys', 'hostiles', null /* corpses */, 'projectiles',
  null /* projectile-tracers */, 'capsules', 'starter-weapon', 'weapon-kills',
  'modifiers', 'carrier-drops', 'scroll', 'pace', 'score', 'spawner',
  'meridian-defense', 'finale', 'hostile-rng', 'kill-count', 'shot-count',
  'player', 'hook-input', 'hook', 'flow', 'corner-events', 'transform',
  'hit-stop', null /* camera-yaw */, 'future-faces',
  null /* juice-presentation */, 'slice-stats',
];
const RESET_IDS_IN_SOURCE = [
  'slice-retry', 'input-keys', 'hostiles', 'corpses', 'projectiles',
  'projectile-tracers', 'capsules', 'starter-weapon', 'weapon-kills',
  'modifiers', 'carrier-drops', 'scroll', 'pace', 'score', 'spawner',
  'meridian-defense', 'finale', 'hostile-rng', 'kill-count', 'shot-count',
  'player', 'hook-input', 'hook', 'flow', 'corner-events', 'transform',
  'hit-stop', 'camera-yaw', 'future-faces', 'juice-presentation', 'slice-stats',
];

export function assertTranscriptionCurrent() {
  const main = readFileSync(join(SRC, 'main.js'), 'utf8');
  const start = main.indexOf('function update(dt) {');
  const end = main.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('run-child: update(dt) not found in src/main.js');
  const body = main.slice(start, end);
  let at = 0;
  for (const call of UPDATE_ORDER) {
    const i = body.indexOf(call, at);
    if (i < 0) throw new Error('run-child: src/main.js update() drifted — `' + call +
      '` missing or out of order; re-transcribe tools/simlab/race/run-child.mjs');
    at = i + call.length;
  }
  const rs = main.indexOf('function resetGame() {');
  const re = main.indexOf('\n}\n', rs);
  const reset = main.slice(rs, re);
  for (const line of [
    'resetRunState();',
    'for (const p of pockets)',
    'spawnCapsule(p.reward.kind, p.reward.letter, p.reward.x, p.reward.y, p.reward.mode);',
    "scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');",
    'updateScroll(0);',
    "setState('PLAYING');",
  ]) {
    if (!reset.includes(line)) throw new Error('run-child: resetGame drifted — `' + line + '` missing');
  }
  const boot = main.lastIndexOf('calibrateEdges();');
  const bootReset = main.lastIndexOf('\nresetGame();');
  if (boot < 0 || bootReset < boot) throw new Error('run-child: boot order calibrateEdges -> resetGame drifted');
  const reg = readFileSync(join(SRC, 'boot', 'run-reset.js'), 'utf8');
  const ids = [...reg.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  if (JSON.stringify(ids) !== JSON.stringify(RESET_IDS_IN_SOURCE))
    throw new Error('run-child: src/boot/run-reset.js registry drifted: ' + JSON.stringify(ids));
  return true;
}

/* ------------------------------ the run --------------------------------- */

export async function runOne(opts) {
  const o = {
    policy: 'rush', seed: 1, viewport: 'desktop-16x10', query: '',
    dtMs: 1000 / 60, maxGameMs: 480000, traceEveryMs: 0,
    // instrument: null | 'oracle'. 'oracle' is a MEASUREMENT INSTRUMENT, not
    // a player: after every update it breaks each materialized hostile inside
    // the screen through the game's own death path (forceBreakHostile — kill
    // tally, score event, gate bookkeeping all run). With rush movement it
    // measures the AUTHORED FLOOR of every face and gate: the time no player,
    // however good, can beat. It is the only thing in the lab that writes sim
    // state other than input, and only when explicitly requested.
    instrument: null,
    // oracle kill latency: a body is broken only after it has been
    // materialized AND inside the screen for this long. 0 = the authored
    // floor; larger values model a competent player's time-to-kill.
    oracleLatencyMs: 0,
    // replay: { events:[{t,type,code}], stopAtMs, fixedDtMs } — the exact
    // frame-input contract of src/pure/frame-input.js (tick = first update
    // whose start clock reached t; stop after ceil(stopAtMs/dt) updates).
    // Used by browser-check.mjs to prove the replica matches the real page.
    replay: null,
    ...opts,
  };
  assertCameraSourceMatches();
  assertTranscriptionCurrent();
  globalThis.__HB_QUERY__ = o.query;

  const { CONFIG } = await mod('config.js');
  const M = await mod('mode.js');
  if (M.ACTIVE_FIXTURE) throw new Error('race lab drives the six-face run only');
  const T = await mod('sim/time.js');
  const E = await mod('sim/edges.js');
  const IN = await mod('sim/input.js');
  const ST = await mod('sim/state.js');
  const LV = await mod('sim/level.js');
  const PC = await mod('sim/pace.js');
  const PL = await mod('sim/player.js');
  const WP = await mod('sim/weapons.js');
  const HO = await mod('sim/hostiles.js');
  const CA = await mod('sim/capsules.js');
  const MO = await mod('sim/mods.js');
  const HK = await mod('sim/hook.js');
  const FL = await mod('sim/flow.js');
  const SCR = await mod('sim/score.js');
  const SP = await mod('sim/spawner.js');
  const MD = await mod('sim/meridian-defense.js');
  const FN = await mod('sim/finale.js');
  const WG = await mod('sim/wavegate.js');
  const XF = await mod('sim/transform.js');
  const SC = await mod('sim/scroll.js');
  const PATH = await mod('pure/path.js');
  const ASC = await mod('pure/ascent.js');
  const VA = await mod('pure/vertical-assault.js');
  const WV = await mod('pure/waves.js');
  // The camera hands fold ownership to the arriving facet at this ritual
  // time (render/camera.js FOLD_HANDOFF_PROGRESS; pure twin in waves.js).
  const handoffMs = typeof WV.cornerHandoffMs === 'function' ? WV.cornerHandoffMs(CONFIG) : 690;

  const vp = typeof o.viewport === 'string' ? VIEWPORTS[o.viewport] : o.viewport;
  if (!vp) throw new Error('unknown viewport ' + o.viewport);
  const edges = viewportEdges(vp.width, vp.height, CONFIG, vp.rigFraction);
  // boot: calibrateEdges() precedes the first resetGame()
  E.setEdges(edges.left, edges.right);

  const player = PL.player;
  const RESET = {
    'slice-retry': () => PL.cancelSliceRetry(),
    'input-keys': () => { IN.releaseAllKeys(); IN.clearSwapBuffer(); },
    'hostiles': () => HO.clearHostiles(),
    'projectiles': () => WP.clearBullets(),
    'capsules': () => CA.clearCapsules(),
    'starter-weapon': () => WP.setWeapon('R'),
    'weapon-kills': () => WP.resetWeaponKills(),
    'modifiers': () => MO.clearMods(),
    'carrier-drops': () => CA.resetCarrierDrops(),
    'scroll': () => T.setScrollX(0),
    'pace': () => PC.resetPace(),
    'score': () => SCR.resetScore(),
    'spawner': () => SP.resetSpawner(),
    'meridian-defense': () => MD.resetMeridianDefense(),
    'finale': () => FN.resetFinale(),
    'hostile-rng': () => HO.resetHostileRng(),
    'kill-count': () => HO.resetKills(),
    'shot-count': () => WP.resetShotsFired(),
    'player': () => PL.resetPlayerForRun(6, 3),
    'hook-input': () => IN.clearHookBuffer(),
    'hook': () => HK.resetHook(),
    'flow': () => FL.resetFlow(),
    'corner-events': () => WG.resetCornerEvents(),
    'transform': () => XF.resetTransform(),
    'hit-stop': () => T.resetHitStop(),
    'future-faces': () => LV.unbuildFutureFaces(),
    'slice-stats': () => {
      T.sliceStats.setbacks = 0;
      T.sliceStats.lastSetbackAt = -1e9;
      T.sliceStats.minEdgeMargin = Infinity;
    },
  };
  function resetGame() {
    for (const id of RESET_ORDER) if (id) RESET[id]();
    for (const p of LV.pockets)
      CA.spawnCapsule(p.reward.kind, p.reward.letter, p.reward.x, p.reward.y, p.reward.mode);
    SCR.scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');
    SC.updateScroll(0);
    ST.setState('PLAYING');
  }

  function update(dt) {
    T.advanceGameMs(dt * 1000);
    const hScale = T.stepHitStop(HO.kills, player.hp);
    const wScale = (T.gameMs < MO.mods.chronoUntil ? CONFIG.mods.chronoScale : 1) * hScale;
    SC.updateScroll(dt * wScale);
    SP.updateSpawner();
    MD.updateMeridianDefense();
    PL.updatePlayer(dt * hScale);
    if (ST.state !== 'PLAYING') return;
    HO.updateHostiles(dt * wScale);
    CA.updateCapsules(dt * wScale);
    MO.updateMods();
    WP.updateBullets(dt * hScale);
    SCR.updateScore(dt, {
      grounded: player.grounded, vx: player.vx,
      traversalState: player.traversalState,
      x: player.x, y: player.y,
      margin: player.x - player.hw - E.sLeftEdge(),
    });
    if (T.scrollX >= LV.END_SCROLL && !FN.finaleActive()) FN.startFinale();
    FN.updateFinale();
    if (FN.finaleComplete()) {
      SCR.scoreRunEnd('clear');
      ST.setState('VICTORY');
    }
  }

  resetGame();

  if (o.replay) return replayRun(o.replay, { CONFIG, T, IN, ST, PL, HO, WP, WG, E, update });

  /* ------------------------------ metrics ------------------------------- */
  const faces = CONFIG.path.faces;
  const FT = CONFIG.path.faceTiles;
  const I0 = CONFIG.path.introTiles;
  const faceS0 = (k) => (k === 1 ? 0 : I0 + FT * (k - 1));
  // The lowest deck column of each face — the datum vertical-assault.js
  // measures its authored span from (faceGroundMin).
  const faceMinDeck = [];
  for (let k = 1; k <= faces; k++) {
    let mn = Infinity;
    for (let s = I0 + FT * (k - 1); s < I0 + FT * k; s++) {
      const g = LV.groundH[s];
      if (g > -100) mn = Math.min(mn, g);
    }
    faceMinDeck.push(mn);
  }
  const altAt = (x, y) => ASC.normalAscentAltAt(x, CONFIG.levelLength) + y;
  const newFace = (k) => ({
    face: k,
    ms: { moving: 0, gate: 0, approach: 0, turning: 0, outro: 0, finale: 0 },
    tStart: null, tEnd: null,
    altEntry: null, altExit: null, altMax: -Infinity,
    yMax: -Infinity, climbUp: 0, aboveDeckMs: [0, 0, 0, 0],  // >=3, >=6, >=9, >=12 over the face deck
    kills: 0, hits: 0, livesLost: 0, fallbacks: 0, falls: 0,
    framesForward: 0, framesBack: 0, framesHold: 0, framesIdle: 0,
    framesPinned: 0, framesScrollHeld: 0, frames: 0, framesTerrainStall: 0,
    drive: { sum: 0, max: 0 },
    gate: null,
  });
  const rows = [];
  for (let k = 1; k <= faces + 1; k++) rows.push(newFace(k));   // 7 = Crown approach + finale
  const dt = o.dtMs / 1000;
  // lookahead: RIG's front to the right screen edge (every PLAYING frame).
  // routeAhead: the same, clipped at the active corner's bend — beyond it the
  // next side is round the limb and shows no route. *Moving: only frames in
  // which the pursuing edge advanced (the race, not a held gate).
  const hist = { lookahead: new Map(), margin: new Map(), routeAhead: new Map(),
    lookaheadMoving: new Map(), routeAheadMoving: new Map() };
  const landed = new Set();
  const bump = (m, v) => { const b = Math.max(-5, Math.min(120, Math.floor(v))); m.set(b, (m.get(b) || 0) + 1); };

  const policy = new Policy(o.policy, o.seed, CONFIG);
  const level = {
    groundTopAt: LV.groundTopAt, platforms: LV.platforms, ladders: LV.ladders,
    solidAt: LV.solidAt,
  };
  const trace = [];
  const snapshots = [];
  const oracleSeen = new Map();
  let prevX = player.x, prevY = player.y, prevScroll = T.scrollX;
  let prevLives = player.lives, prevHp = player.hp, prevKills = HO.kills;
  let prevSetbacks = T.sliceStats.setbacks, prevFalls = T.sliceStats.falls;
  let jumpWasDown = false;
  let frames = 0;
  let outcome = 'timeout';
  const cornerLog = WG.cornerEvents.map((c) => ({
    k: c.k, firstAtPivotMs: null, primedMs: null, armedMs: null, gateEnteredMs: null, gateClearedMs: null,
    approachMs: null, turnStartMs: null, turnDoneMs: null, driveThrough: null,
    killsAtArm: null,
    // T-201: RIG at the corner's joint in any pre-turn state (closed joint or
    // past it), the climb held after it, and the carry-over of survivors.
    arrivedMs: null, armedBy: null, survivorsAtTurn: null, candidatesAtTurn: null,
    pursuers: null, carried: null,
    carriedSeen: 0, carriedSeenIds: [], beatLog: null, beatMaxGapMs: null, beatsReleased: null,
    clearedAtTurn: null,
  }));
  // Staging visibility (the played successor of gate-view.mjs): every
  // encounter body's position against the live view the frame it starts to
  // condense and the frame it becomes shootable.
  const stage = { condense: 0, outsideAtCondense: 0, nearPlaneAtCondense: 0,
    material: 0, outsideAtMaterial: 0, nearPlaneAtMaterial: 0,
    minPlaneAtCondense: Infinity, minPlaneAtMaterial: Infinity, worst: [] };
  const stageSeen = new Set();
  const NEAR_PLANE = 6;
  let framesLeadBound = 0, framesJointBeforeHalt = 0;
  // A digest of the simulated trajectory alone (no run labels), for the
  // floor-promise comparison of the same run under two queries.
  let simHash = 2166136261 >>> 0;
  const mixInt = (v) => {
    let x = v | 0;
    for (let b = 0; b < 4; b++) { simHash ^= x & 0xff; simHash = Math.imul(simHash, 16777619) >>> 0; x >>>= 8; }
  };
  const prevCornerState = WG.cornerEvents.map((c) => c.state);
  const prevPrimed = WG.cornerEvents.map((c) => c.primed);
  let finaleStartMs = null;
  let teleported = false;
  let maxX = player.x;

  const faceNow = () => {
    let done = 0;
    for (const c of WG.cornerEvents) if (c.state === 'done') done++;
    return Math.min(faces + 1, done + 1);
  };

  while (ST.state === 'PLAYING' && T.gameMs < o.maxGameMs) {
    const c = WG.activeCorner();
    const frontier = c ? WG.cornerPlayerRouteWindow(player.hw).frontierRight : Infinity;
    const rightClamp = Math.min(E.sRightEdge() - CONFIG.edges.margin, frontier);
    const ctx = {
      player, gameMs: T.gameMs, cfg: CONFIG, hostiles: HO.hostiles, level,
      edges: { left: E.sLeftEdge(), right: E.sRightEdge() },
      margin: player.x - player.hw - E.sLeftEdge(),
      corner: c ? { k: c.k, s: c.s, state: c.state } : null,
      dxFrame: player.x - prevX,
      pinnedRight: player.x + player.hw >= rightClamp - 0.02,
    };
    const intent = policy.decide(ctx);
    const jump = !!intent.jump;
    if (jump && !jumpWasDown) IN.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);
    jumpWasDown = jump;
    IN.keys.left = !!intent.left; IN.keys.right = !!intent.right;
    IN.keys.up = !!intent.up; IN.keys.down = !!intent.down;
    IN.keys.jump = jump; IN.keys.fire = !!intent.fire;
    IN.keys.strafe = !!intent.strafe;

    const faceBefore = faceNow();
    const stateBefore = FN.finaleActive() ? 'finale' : (c ? c.state : 'outro');
    update(dt);
    frames++;
    if (o.instrument === 'oracle' && ST.state === 'PLAYING') {
      const lo = E.sLeftEdge(), hi = E.sRightEdge();
      for (const e of [...HO.hostiles]) {
        const visible = T.gameMs >= e.enterUntil && !e.gateBreakExit && e.x >= lo && e.x <= hi;
        if (!visible) { oracleSeen.delete(e); continue; }
        if (!oracleSeen.has(e)) oracleSeen.set(e, T.gameMs);
        if (T.gameMs - oracleSeen.get(e) >= o.oracleLatencyMs) HO.forceBreakHostile(e, 'ORACLE');
      }
    }

    // ------- T-201 bookkeeping (reads only) -------
    mixInt(Math.round(T.gameMs * 10)); mixInt(Math.round(player.x * 1e5));
    mixInt(Math.round(player.y * 1e5)); mixInt(Math.round(T.scrollX * 1e5));
    mixInt(player.hp); mixInt(player.lives); mixInt(HO.kills); mixInt(HO.hostiles.length);
    if (ST.state === 'PLAYING') {
      const L = E.sLeftEdge(), Rr = E.sRightEdge();
      const front = player.x + player.hw;
      // The follow-lead this frame WOULD keep (CONFIG.follow, or the
      // proposal's numbers on a tree that predates it), so a follow=0 run and
      // the base tree flag the same frames a follow run would have bound on.
      const FC = CONFIG.follow || { leadFrac: 0.3, leadMinTiles: 6, leadMaxTiles: 24 };
      const leadNow = Math.min(FC.leadMaxTiles, Math.max(FC.leadMinTiles, FC.leadFrac * (E.EDGE_R - E.EDGE_L)));
      if (front >= Rr - leadNow - 0.3) framesLeadBound++;
      const acNow = WG.activeCorner();
      if (acNow) {
        const frontier = acNow.s + 1 - CONFIG.edges.margin;
        const L0 = cornerLog[acNow.k - 1];
        if (acNow.state === 'idle' && front >= frontier - 0.05 &&
            T.scrollX < PATH.HALT_S[acNow.k - 1] - 1e-6) framesJointBeforeHalt++;
        if (L0.arrivedMs === null && acNow.state !== 'turning' && front >= frontier - 0.05)
          L0.arrivedMs = T.gameMs;
      }
      for (const e of HO.hostiles) {
        if (e.gateBreakExit || !(String(e.encounterKey || '').startsWith('gate:') ||
            Number.isFinite(e.pursuitFrom))) continue;
        const key = e.id + ':' + Math.round(e.enterUntil);
        const condensing = T.gameMs >= e.enterUntil - CONFIG.wasp.enterMs;
        const material = T.gameMs >= e.enterUntil;
        if (condensing && !stageSeen.has('c' + key)) {
          stageSeen.add('c' + key);
          stage.condense++;
          const out = e.x < L + 0.5 || e.x > Rr - 0.5;
          // A follower is "present on the next side" the frame it starts to
          // condense there, on the arriving facet, inside the view.
          if (Number.isFinite(e.pursuitFrom)) {
            const Lc = cornerLog[e.pursuitFrom - 1];
            const onArriving = PATH.facetAtBends(e.x, PATH.BEND_S) === e.pursuitFrom;
            if (Lc && onArriving && !out && !Lc.carriedSeenIds.includes(e.id)) {
              Lc.carriedSeenIds.push(e.id);
              Lc.carriedSeen++;
            }
          }
          if (out) stage.outsideAtCondense++;
          const plane = e.x - L;
          stage.minPlaneAtCondense = Math.min(stage.minPlaneAtCondense, plane);
          if (plane < NEAR_PLANE) stage.nearPlaneAtCondense++;
          if ((out || plane < NEAR_PLANE) && stage.worst.length < 12)
            stage.worst.push({ at: 'condense', id: e.id, kind: e.kind, enc: e.encounterKey,
              x: +e.x.toFixed(2), L: +L.toFixed(2), R: +Rr.toFixed(2), carried: e.pursuitFrom ?? null,
              ms: Math.round(T.gameMs) });
        }
        if (material && !stageSeen.has('m' + key)) {
          stageSeen.add('m' + key);
          stage.material++;
          const out = e.x < L + 0.5 || e.x > Rr - 0.5;
          if (out) stage.outsideAtMaterial++;
          const plane = e.x - L;
          stage.minPlaneAtMaterial = Math.min(stage.minPlaneAtMaterial, plane);
          if (plane < NEAR_PLANE) stage.nearPlaneAtMaterial++;
        }
      }
    }

    // ------- bookkeeping (reads only) -------
    const k = faceBefore;
    const row = rows[k - 1];
    if (row.tStart === null) { row.tStart = T.gameMs - o.dtMs; row.altEntry = altAt(prevX, prevY); }
    const seg = stateBefore === 'idle' ? 'moving' : stateBefore;
    row.ms[seg] += o.dtMs;
    row.frames++;
    const dx = player.x - prevX;
    const dScroll = T.scrollX - prevScroll;
    teleported = false;
    if (player.lives < prevLives) { row.livesLost++; teleported = true; }
    if (T.sliceStats.setbacks > prevSetbacks) { row.fallbacks += T.sliceStats.setbacks - prevSetbacks; teleported = true; }
    if (T.sliceStats.falls > prevFalls) row.falls += T.sliceStats.falls - prevFalls;
    if (player.hp < prevHp && !teleported) row.hits++;
    if (HO.kills > prevKills) row.kills += HO.kills - prevKills;
    if (!teleported) {
      if (dx >= 1.0 * dt) row.framesForward++;
      else if (dx <= -1.0 * dt) row.framesBack++;
      else row.framesHold++;
      const dy = player.y - prevY;
      if (dy > 0) row.climbUp += dy;
    }
    if (player.grounded && Math.abs(player.vx) < 2 && player.traversalState === 'free') row.framesIdle++;
    const clampNow = Math.min(E.sRightEdge() - CONFIG.edges.margin,
      WG.activeCorner() ? WG.cornerPlayerRouteWindow(player.hw).frontierRight : Infinity);
    if (player.x + player.hw >= clampNow - 0.02) row.framesPinned++;
    if (dScroll < 1e-9) row.framesScrollHeld++;
    const alt = altAt(player.x, player.y);
    row.altMax = Math.max(row.altMax, alt);
    row.altExit = alt;
    if (k <= faces) {
      const above = player.y - faceMinDeck[k - 1];
      row.yMax = Math.max(row.yMax, above);
      [3, 6, 9, 12].forEach((h, i) => { if (above >= h) row.aboveDeckMs[i] += o.dtMs; });
    }
    const drive = M.MOMENTUM_ENABLED ? PC.momentumDrive() : 0;
    row.drive.sum += drive; row.drive.max = Math.max(row.drive.max, drive);
    if (ST.state === 'PLAYING') {
      const front = player.x + player.hw;
      const ac = WG.activeCorner();
      // Clipped at the bend the camera faces: once the ritual has handed the
      // fold to the arriving facet (T-201: the only moving ritual frames are
      // after it) the route ahead is the arriving facet, up to its own bend.
      const turnedOver = ac && ac.state === 'turning' && T.gameMs - ac.tStart >= handoffMs;
      const bendIdx = ac ? (turnedOver ? ac.k : ac.k - 1) : -1;
      const routeEnd = ac && bendIdx < PATH.BEND_S.length
        ? Math.min(E.sRightEdge(), PATH.BEND_S[bendIdx]) : E.sRightEdge();
      bump(hist.lookahead, E.sRightEdge() - front);
      bump(hist.routeAhead, routeEnd - front);
      bump(hist.margin, player.x - player.hw - E.sLeftEdge());
      if (dScroll > 1e-9) {
        bump(hist.lookaheadMoving, E.sRightEdge() - front);
        bump(hist.routeAheadMoving, routeEnd - front);
      }
      if (player.grounded && player.onOneWay && player.onOneWay.id) landed.add(player.onOneWay.id);
      // pressed forward against terrain while NOT at the right clamp
      if (IN.keys.right && !IN.keys.left && player.grounded && player.traversalState === 'free' &&
          Math.abs(dx) < 0.004 && front < clampNow - 0.05 && !teleported) row.framesTerrainStall++;
    }

    // corner lifecycle
    {
      const ac = WG.activeCorner();
      if (ac && ac.state === 'idle') {
        const fr = WG.cornerPlayerRouteWindow(player.hw).frontierRight;
        const L0 = cornerLog[ac.k - 1];
        if (L0.firstAtPivotMs === null && player.x + player.hw >= fr - 0.05) L0.firstAtPivotMs = T.gameMs;
      }
    }
    WG.cornerEvents.forEach((ce, i) => {
      const L = cornerLog[i];
      if (ce.primed && !prevPrimed[i]) L.primedMs = T.gameMs;
      if (ce.state !== prevCornerState[i]) {
        const from = prevCornerState[i], to = ce.state;
        if (from === 'idle') { L.armedMs = T.gameMs; L.killsAtArm = HO.kills; L.armedBy = ce.armedBy ?? null; }
        if (to === 'gate') L.gateEnteredMs = T.gameMs;
        if (from === 'gate' && to === 'approach') L.gateClearedMs = T.gameMs;
        if (to === 'approach') L.approachMs = T.gameMs;
        if (to === 'turning') {
          L.turnStartMs = T.gameMs;
          L.pursuers = ce.pursuers ?? null;
          L.clearedAtTurn = ce.clearedAtTurn ?? null;
          // the sim's own count, taken before the carry cap and retirement
          L.survivorsAtTurn = ce.survivorsAtTurn ?? null;
          L.candidatesAtTurn = ce.candidatesAtTurn ?? null;
        }
        if (to === 'done') {
          L.turnDoneMs = T.gameMs; L.driveThrough = L.gateEnteredMs === null;
          L.carried = ce.carried ?? null;
        }
      }
      prevCornerState[i] = ce.state;
      prevPrimed[i] = ce.primed;
    });
    if (FN.finaleActive() && finaleStartMs === null) finaleStartMs = T.gameMs;

    if (o.snapshotsAtMs && o.snapshotsAtMs.length && T.gameMs >= o.snapshotsAtMs[0]) {
      o.snapshotsAtMs = o.snapshotsAtMs.slice(1);
      snapshots.push({
        gameMs: Math.round(T.gameMs), seg, face: k,
        player: { x: +player.x.toFixed(2), y: +player.y.toFixed(2), vx: +player.vx.toFixed(2),
          grounded: player.grounded, hp: player.hp, lives: player.lives, ts: player.traversalState,
          aim: [player.aim.x, player.aim.y] },
        keys: { ...IN.keys },
        policy: { spot: policy.spot, target: policy.target ? policy.target.id : null,
          accurate: policy.spotAccurate },
        scrollX: +T.scrollX.toFixed(2), edges: [+E.sLeftEdge().toFixed(2), +E.sRightEdge().toFixed(2)],
        hostiles: HO.hostiles.map((e) => ({ id: e.id, kind: e.kind, state: e.state,
          x: +e.x.toFixed(2), y: +e.y.toFixed(2), hp: e.hp, gating: e.gating,
          enc: e.encounterKey, mat: T.gameMs >= e.enterUntil, exit: e.gateBreakExit })),
      });
    }
    if (o.traceEveryMs > 0 && frames % Math.max(1, Math.round(o.traceEveryMs / o.dtMs)) === 0) {
      trace.push([Math.round(T.gameMs), +player.x.toFixed(2), +player.y.toFixed(2),
        +T.scrollX.toFixed(2), seg, k, player.hp, player.lives, HO.kills,
        +alt.toFixed(2), +(E.sRightEdge() - player.x - player.hw).toFixed(2)]);
    }

    maxX = Math.max(maxX, player.x);
    prevX = player.x; prevY = player.y; prevScroll = T.scrollX;
    prevLives = player.lives; prevHp = player.hp; prevKills = HO.kills;
    prevSetbacks = T.sliceStats.setbacks; prevFalls = T.sliceStats.falls;
  }
  WG.cornerEvents.forEach((ce, i) => {
    const L = cornerLog[i];
    const log = Array.isArray(ce.beatLog) ? ce.beatLog.map((b) => ({ beat: b.beat, atMs: Math.round(b.atMs),
      reason: b.reason, spawned: b.spawned, of: b.of })) : [];
    L.beatLog = log;
    L.beatsReleased = log.length;
    let gap = 0;
    for (let j = 1; j < log.length; j++) gap = Math.max(gap, log[j].atMs - log[j - 1].atMs);
    L.beatMaxGapMs = log.length > 1 ? gap : null;
    delete L.carriedSeenIds;
  });
  if (ST.state === 'VICTORY') outcome = 'victory';
  else if (ST.state === 'GAME_OVER') outcome = 'game-over';
  for (const r of rows) if (r.tStart !== null) r.tEnd = r.tStart + Object.values(r.ms).reduce((a, b) => a + b, 0);
  rows.forEach((r, i) => { r.gate = i < faces ? cornerLog[i] : null; });

  const facesCleared = WG.cornerEvents.filter((c) => c.state === 'done').length;
  const histOut = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]);
  const summary = {
    policy: o.policy, seed: o.seed, viewport: o.viewport, query: o.query,
    instrument: o.instrument,
    oracleLatencyMs: o.instrument === 'oracle' ? o.oracleLatencyMs : null,
    edges: { left: +edges.left.toFixed(4), right: +edges.right.toFixed(4) },
    outcome, gameMs: Math.round(T.gameMs), frames, facesCleared,
    finaleReached: finaleStartMs !== null,
    finaleMs: finaleStartMs === null ? null : Math.round(T.gameMs - finaleStartMs),
    livesLeft: player.lives, kills: HO.kills, setbacks: T.sliceStats.setbacks,
    falls: T.sliceStats.falls, maxX: +maxX.toFixed(3),
    weaponEnd: WP.currentWeapon,
    profile: policy.prof,
    framesLeadBound, framesJointBeforeHalt,
    stage: { ...stage, minPlaneAtCondense: Number.isFinite(stage.minPlaneAtCondense)
      ? +stage.minPlaneAtCondense.toFixed(2) : null,
    minPlaneAtMaterial: Number.isFinite(stage.minPlaneAtMaterial)
      ? +stage.minPlaneAtMaterial.toFixed(2) : null },
  };
  const out = {
    summary,
    faces: rows.map((r) => ({
      ...r,
      altMax: Number.isFinite(r.altMax) ? +r.altMax.toFixed(3) : null,
      yMax: Number.isFinite(r.yMax) ? +r.yMax.toFixed(3) : null,
      altEntry: r.altEntry === null ? null : +r.altEntry.toFixed(3),
      altExit: r.altExit === null ? null : +r.altExit.toFixed(3),
      climbUp: +r.climbUp.toFixed(3),
      driveMean: r.frames ? +(r.drive.sum / r.frames).toFixed(4) : 0,
      driveMax: +r.drive.max.toFixed(4),
      drive: undefined,
    })),
    hist: { lookahead: histOut(hist.lookahead), margin: histOut(hist.margin),
      routeAhead: histOut(hist.routeAhead), lookaheadMoving: histOut(hist.lookaheadMoving),
      routeAheadMoving: histOut(hist.routeAheadMoving) },
    landed: [...landed].sort(),
    level: {
      faceMinDeck,
      corners: PATH.CORNER_S, halts: PATH.HALT_S, bends: PATH.BEND_S,
      endScroll: LV.END_SCROLL, levelLength: CONFIG.levelLength,
      assaultSpans: VA.VERTICAL_ASSAULT.spans,
    },
  };
  if (o.traceEveryMs > 0) out.trace = trace;
  if (snapshots.length) out.snapshots = snapshots;
  out.fingerprint = fnv(JSON.stringify([summary, out.faces.map((f) => [f.ms, f.kills, f.hits,
    f.livesLost, f.fallbacks, f.altMax, f.climbUp])]));
  // Trajectory-only digest: identical simulations give identical digests
  // whatever query or label the run carried (the floor-promise check).
  out.simDigest = (simHash >>> 0).toString(16).padStart(8, '0');
  return out;
}

async function replayRun(rp, { CONFIG, T, IN, ST, PL, HO, WP, WG, E, update }) {
  const { GAMEPLAY_KEYMAP, gameMsToInputTick } = await mod('pure/frame-input.js');
  const dtMs = rp.fixedDtMs;
  const sched = rp.events.map((e, i) => ({ ...e, i, tick: gameMsToInputTick(e.t, dtMs) }))
    .sort((a, b) => a.tick - b.tick || a.t - b.t ||
      (a.type === b.type ? a.i - b.i : a.type === 'keyup' ? -1 : 1));
  const stopTick = gameMsToInputTick(rp.stopAtMs, dtMs);
  const applyEdge = (code, type) => {
    const k = GAMEPLAY_KEYMAP[code];
    if (!k) return;
    if (type === 'keyup') { IN.keys[k] = false; return; }
    if (k === 'jump') IN.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);
    if (k === 'swap') IN.bufferSwapUntil(T.gameMs + 140);
    IN.keys[k] = true;
  };
  let tick = 0, next = 0;
  while (ST.state === 'PLAYING') {
    while (next < sched.length && sched[next].tick <= tick) applyEdge(sched[next].code, sched[next++].type);
    if (tick >= stopTick) break;
    update(dtMs / 1000);
    tick++;
  }
  const p = PL.player;
  const c = WG.activeCorner();
  return {
    replay: true, ticks: tick, state: ST.state,
    final: finalState({ T, p, HO, WP, c, E }),
  };
}

export function finalState({ T, p, HO, WP, c, E }) {
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return {
    gameMs: r(T.gameMs), scrollX: r(T.scrollX),
    player: { x: r(p.x), y: r(p.y), vx: r(p.vx), vy: r(p.vy), grounded: p.grounded,
      hp: p.hp, lives: p.lives },
    kills: HO.kills, weapon: WP.currentWeapon,
    corner: c ? { k: c.k, state: c.state } : null,
    edgeLeft: r(E.sLeftEdge()),
    hostiles: HO.hostiles.map((e) => ({ id: e.id, kind: e.kind, state: e.state,
      x: r(e.x), y: r(e.y), hp: e.hp })),
  };
}

function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  const t0 = Date.now();
  const out = await runOne(arg);
  out.summary.wallMs = Date.now() - t0;
  process.stdout.write(JSON.stringify(out));
}
