// default-run.mjs — a renderer-free host for the DEFAULT six-face run, built for
// T-120's behaviour tests (input forgiveness, retry replay, cross-process
// determinism, "the sim cannot tell whether the art loaded").
//
// It drives the real, unmodified simulation (src/sim/*, src/pure/*, src/mode.js)
// AND the real run-reset registry (src/boot/run-reset.js) in Node. The registry
// imports four render modules; ./render-stub-hooks.mjs replaces every src/render
// and src/ui module with an inert stub so the registry's SIM rows run exactly as
// shipped (see that file for why that is sound).
//
// Two pieces of src/main.js are TRANSCRIBED because main.js is the composition
// root and imports three.js: update() (MAIN_UPDATE_SIM_CALLS lists the sim calls
// in order; render/UI calls are dropped, which the bridge contract allows) and
// the default-run tail of resetGame() after resetRunState(). The T-120 domains
// that use this host assert, statically, that main.js still makes those calls in
// this order — a drifted replica would make every result here a lie.
//
// Import ONLY in a fresh child process: src/mode.js reads __HB_QUERY__ once, and
// the sim owns module singletons. Dev-only; zero effect on the shipped game.

import { register } from 'node:module';

const SRC = new URL('../../../src/', import.meta.url);

// the sim calls of src/main.js update(), in order (render/UI calls dropped)
export const MAIN_UPDATE_SIM_CALLS = Object.freeze([
  'advanceGameMs', 'stepHitStop', 'updateScroll', 'updateSpawner', 'updateMeridianDefense',
  'updatePlayer', 'updateHostiles', 'updateCapsules', 'updateMods', 'updateBullets',
  'updateScore', 'startFinale', 'updateFinale', 'finaleComplete',
]);
// the sim calls of src/main.js resetGame() for the default run, in order
export const MAIN_RESET_SIM_CALLS = Object.freeze([
  'resetRunState', 'spawnCapsule', 'scoreRunStart', 'updateScroll', 'setState',
]);
// EVERY call src/main.js update() / resetGame() make to a function it imports
// from src/sim/ or src/boot/, in source order — the fixture branches the host
// does not take included — so a NEW sim call in either function fails the drift
// guard instead of passing for not being on the transcribed list (T-120 fix
// round 1, review finding 6). When this fails: transcribe the call above, then
// update this list.
export const MAIN_UPDATE_ALL_SIM_CALLS = Object.freeze([
  'advanceGameMs', 'stepHitStop', 'updateScroll', 'updateSpawner', 'updateMeridianDefense',
  'updatePlayer', 'updateHostiles', 'updateCapsules', 'updateMods', 'updateBullets',
  'updateScore', 'sLeftEdge',
  'scoreRunEnd', 'setState',                 // ?slice=traversal finish (fixture: not transcribed)
  'scoreRunEnd', 'setState',                 // ?slice=transform finish (fixture: not transcribed)
  'finaleActive', 'startFinale', 'updateFinale', 'finaleComplete', 'scoreRunEnd', 'setState',
]);
export const MAIN_RESET_ALL_SIM_CALLS = Object.freeze([
  'resetRunState',
  'spawnCapsule', 'spawnHostile', 'scoreRunStart',   // fixture branches (not transcribed)
  'spawnCapsule', 'scoreRunStart', 'updateScroll', 'setState',
]);
// the names src/main.js imports from src/sim/ and src/boot/
export function mainSimImports(mainSrc) {
  const names = new Set();
  for (const m of mainSrc.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/(?:sim|boot)\/[\w-]+\.js'/g))
    for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  return names;
}

// The shipped 16:9 edge calibration (render/camera.js calibrateEdges at
// 1280x720, FAR), the same constant g1-1-render-only-proved-sim uses. Any fixed
// value is sound for the properties tested here: both sides of every comparison
// use the same edges.
export const DEFAULT_EDGES = Object.freeze([-18.9, 26.4]);

export async function bootDefaultRun({ query = '', edges = DEFAULT_EDGES, poison = null } = {}) {
  register(new URL('./render-stub-hooks.mjs', import.meta.url).href);
  globalThis.__HB_QUERY__ = query;
  if (poison) poison();                   // e.g. render-global poisoning, before any sim import
  const imp = (p) => import(new URL(p, SRC).href);
  const [
    C, MODE, T, E, IN, ST, LV, PL, WP, HO, CA, MO, SCR, SP, MD, FN, WG, SC, RR, B,
  ] = await Promise.all([
    'config.js', 'mode.js', 'sim/time.js', 'sim/edges.js', 'sim/input.js', 'sim/state.js',
    'sim/level.js', 'sim/player.js', 'sim/weapons.js', 'sim/hostiles.js', 'sim/capsules.js',
    'sim/mods.js', 'sim/score.js', 'sim/spawner.js', 'sim/meridian-defense.js',
    'sim/finale.js', 'sim/wavegate.js', 'sim/scroll.js', 'boot/run-reset.js', 'sim/bridge.js',
  ].map(imp));
  const CONFIG = C.CONFIG;
  if (MODE.ACTIVE_FIXTURE) throw new Error('default-run host drives the default six-face run only');
  E.setEdges(edges[0], edges[1]);
  const player = PL.player;

  // src/main.js resetGame(), default-run branch, render/UI calls dropped
  function resetGame() {
    RR.resetRunState();                                    // the REAL registry
    markRunStart();
    for (const p of LV.pockets)
      CA.spawnCapsule(p.reward.kind, p.reward.letter, p.reward.x, p.reward.y, p.reward.mode);
    SCR.scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');
    SC.updateScroll(0);
    ST.setState('PLAYING');
  }
  B.installHost({ resetGame });                            // main.js: the sim asks for restarts here

  // src/main.js update(dt), render/UI calls dropped
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
    if (FN.finaleComplete()) { SCR.scoreRunEnd('clear'); ST.setState('VICTORY'); }
  }

  // src/main.js applyGameplayKeyEdge(), by intent name instead of key code
  function keyEdge(name, down, repeat = false) {
    if (!down) { IN.keys[name] = false; return; }
    if (name === 'jump' && !repeat) IN.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);
    if (name === 'swap' && !repeat) IN.bufferSwapUntil(T.gameMs + 140);
    IN.keys[name] = true;
  }

  // One comparable row per frame: everything a player could see change. The
  // game clock is shown RELATIVE to the run's start: src/sim/time.js's gameMs is
  // monotonic across retries by design (every deadline is gameMs + a duration),
  // so an absolute clock would differ between two identical runs.
  let runStartMs = 0;
  function markRunStart() { runStartMs = T.gameMs; }
  function row() {
    const p = player;
    const c = WG.activeCorner();
    const s = SCR.scoreSnapshot();
    return [
      (T.gameMs - runStartMs).toFixed(3), T.scrollX.toFixed(6), ST.state,
      p.x.toFixed(6), p.y.toFixed(6), p.vx.toFixed(6), p.vy.toFixed(6), p.grounded ? 1 : 0,
      p.hp, p.lives, p.airJumpsLeft, p.facing, WP.currentWeapon,
      c ? c.k : 0, c ? c.state : 'done',
      HO.kills, WP.shotsFired, HO.hostiles.length,
      HO.hostiles.map((e) => e.kind + ':' + e.x.toFixed(3) + ':' + e.y.toFixed(3) + ':' + (e.hp ?? '')).join('|'),
      WP.bulletPool.filter((b) => b.alive).map((b) => b.x.toFixed(3) + ':' + b.y.toFixed(3)).join('|'),
      CA.capsules.map((c) => c.kind + ':' + c.x.toFixed(3) + ':' + c.y.toFixed(3)).join('|'),
      s ? JSON.stringify([s.charge, s.threat, s.score ?? null]) : '',
    ].join(',');
  }

  return {
    CONFIG, M: { C, MODE, T, E, IN, ST, LV, PL, WP, HO, CA, MO, SCR, SP, MD, FN, WG, SC, RR, B },
    player, resetGame, update, keyEdge, row,
  };
}

// The deterministic policy every T-120 driven run uses: hold right and fire,
// aim up on alternate seconds (so shots reach the wasp lanes and kills happen),
// hop when the deck ahead is a gap or a step. It reads only sim state and its
// own frame count, so any change to that state changes its choices too —
// stricter, not weaker.
export function holdRightPolicy(host) {
  const { M, player: p } = host;
  let jumpUntil = 0, frame = 0;
  host.keyEdge('right', true);
  host.keyEdge('fire', true);
  return () => {
    if (frame % 60 === 0) host.keyEdge('up', (frame / 60) % 2 === 1);
    frame++;
    if (p.grounded &&
        (M.LV.groundTopAt(p.x + 1.7) < -100 || M.LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
      host.keyEdge('jump', true);
      jumpUntil = M.T.gameMs + 260;
    }
    if (M.IN.keys.jump && M.T.gameMs > jumpUntil) host.keyEdge('jump', false);
  };
}

// Run `frames` fixed steps under a fresh policy; returns the row trace.
export function playFrames(host, frames, dt = 1 / 60) {
  const step = holdRightPolicy(host);
  const rows = [];
  for (let f = 0; f < frames; f++) {
    step();
    host.update(dt);
    rows.push(host.row());
    if (host.M.ST.state !== 'PLAYING') break;
  }
  return rows;
}
