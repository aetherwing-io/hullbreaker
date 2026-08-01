#!/usr/bin/env node
/* t2lab.mjs — headless frame-alignment laboratory for the t2-transform-seam-rush
 * divergence investigation (SPRINT T-002).
 *
 * Drives the REAL, unmodified simulation (src/sim/* + src/pure/*, selected via
 * __HB_QUERY__='slice=transform') in a Node child process with a fixed
 * timestep and SYNCHRONOUS, FRAME-SCOPED input application: a scripted key
 * event is applied to src/sim/input.js at an exact frame boundary, before that
 * frame's update. This is precisely the injection semantics that
 * tools/playtest/README.md hook request #5 asks the game to expose — built
 * here on the harness side instead, which is possible headlessly because the
 * sim layer is renderer-free by contract (src/sim/bridge.js).
 *
 * Modes:
 *   run      one replica run, JSON summary on stdout
 *   repeat   N identical runs; proves (or refutes) bit-determinism under
 *            frame-scoped input
 *   sweep    shift each scripted tap (and the hold-right edge) by ±N frames,
 *            one at a time; reports every variant whose outcome forks off the
 *            baseline — the one-frame-sensitivity experiment
 *   phases   model the real driver's deterministic mode instead (dispatch
 *            quantized to a sampler cadence in gameMs) and sweep the sampler
 *            phase; reproduces the browser-side fork mechanism
 *   diverge  full per-frame trace of baseline vs one shifted variant; prints
 *            the first differing frame and the rows around it
 *
 * Dev-only. Zero effect on the shipped game; see tools/simlab/README.md for
 * honesty/limitations (what this replica does and does not reproduce).
 *
 * Run from anywhere:  node tools/simlab/t2lab.mjs sweep
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', '..', 'src');
const defaultScript = join(here, '..', 'playtest', 'scripts', 'adversarial',
  't2-transform-seam-rush.json');

/* ------------------------------ CLI --------------------------------- */

const argv = process.argv.slice(2);
const mode = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'run';
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes('--' + name);

const DT_MS = parseFloat(opt('dt', '16.667'));
const END_GAME_MS = parseFloat(opt('end', '21000'));
// 1280x800, far view (the shipped default), measured from the live page via
// window.HB.edges() — the same calibration the browser batch ran under.
const [EDGE_L, EDGE_R] = opt('edges', '-27.438263128944797,45.73492361770374')
  .split(',').map(Number);
const SCRIPT_PATH = opt('script', defaultScript);
const DISPATCH = opt('dispatch', 'sync');            // sync | quantized
const SAMPLE_GAME_MS = parseFloat(opt('sample-gamems', '151'));
const PHASE = parseFloat(opt('phase', '0'));
const REASSERT_FRAMES = parseInt(opt('reassert-frames', '4'), 10);

/* ------------------- compile the input schedule ---------------------- *
 * Same semantics as tools/playtest/lib/compile.mjs for the two move kinds
 * t2 uses: hold -> down@fromMs + up@toMs, tap -> down@atMs + up@atMs+holdMs
 * (holdMs default 60). Keys stay semantic ('right'/'jump') because the
 * replica writes src/sim/input.js keys directly — the KEYMAP translation in
 * src/main.js is browser-side and 1:1 for these.                        */

function compileSchedule(scriptJson) {
  const events = [];   // { t, key, type: 'down'|'up', tap: tapIndex|-1 }
  let tapIdx = 0;
  for (const m of scriptJson.moves || []) {
    if ('hold' in m) {
      events.push({ t: m.fromMs, key: m.hold, type: 'down', tap: -1 });
      events.push({ t: m.toMs, key: m.hold, type: 'up', tap: -1 });
    } else if ('tap' in m) {
      const holdMs = typeof m.holdMs === 'number' ? m.holdMs : 60;
      events.push({ t: m.atMs, key: m.tap, type: 'down', tap: tapIdx });
      events.push({ t: m.atMs + holdMs, key: m.tap, type: 'up', tap: tapIdx });
      tapIdx++;
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { events, taps: tapIdx };
}

const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'));
const { events: baseEvents, taps: tapCount } = compileSchedule(script);

// shift one tap (both its edges), or the hold ('hold:down' / 'hold:up'), by
// N frames of sim time. Returns a fresh event list.
function shifted(events, target, frames) {
  const d = frames * DT_MS;
  return events.map((e) => {
    const hit = target.tap >= 0 ? e.tap === target.tap
      : (e.tap === -1 && e.type === target.holdEdge);
    return hit ? { ...e, t: e.t + d } : { ...e };
  }).sort((a, b) => a.t - b.t);
}

/* --------------------------- child harness --------------------------- */

const childSource = (cfg) => `
  globalThis.__HB_QUERY__ = 'slice=transform';
  // Virtual timer shim for the sim's single wall-clock escape hatch:
  // scheduleSliceRetry's 650ms setTimeout (src/sim/player.js). gameMs is
  // frozen for the whole freeze in the browser too, so firing it as soon as
  // the frame loop sees SLICE_RETRY is sim-time-faithful.
  const vTimers = new Map(); let vTimerId = 0;
  globalThis.setTimeout = (fn) => { vTimers.set(++vTimerId, fn); return vTimerId; };
  globalThis.clearTimeout = (id) => { vTimers.delete(id); };
  const fireTimers = () => {
    const fns = [...vTimers.values()]; vTimers.clear();
    for (const fn of fns) fn();
  };

  const S = ${JSON.stringify('file://' + srcDir)};
  const [C, B, T, E, IN, ST, LV, PC, PL, WP, HO, CA, MO, HK, FL, SCR, SP, WG, XF, SC] =
    await Promise.all([
      '/config.js', '/sim/bridge.js', '/sim/time.js', '/sim/edges.js',
      '/sim/input.js', '/sim/state.js', '/sim/level.js', '/sim/pace.js',
      '/sim/player.js', '/sim/weapons.js', '/sim/hostiles.js', '/sim/capsules.js',
      '/sim/mods.js', '/sim/hook.js', '/sim/flow.js', '/sim/score.js',
      '/sim/spawner.js', '/sim/wavegate.js', '/sim/transform.js', '/sim/scroll.js',
    ].map((p) => import(S + p)));
  const M = await import(S + '/mode.js');
  const CONFIG = C.CONFIG;
  const FX = M.ACTIVE_FIXTURE;
  const cfg = ${JSON.stringify(cfg)};
  const dt = cfg.dtMs / 1000;

  E.setEdges(cfg.edges[0], cfg.edges[1]);

  // resetGame, transcribed from src/main.js for the transform slice (render/
  // UI lines dropped; ACTIVE_SLICE is null here so its branches are skipped).
  const player = PL.player, P = PL.P;
  function resetGame() {
    PL.cancelSliceRetry();
    IN.releaseAllKeys();
    HO.clearHostiles();
    WP.clearBullets();
    for (let i = CA.capsules.length - 1; i >= 0; i--) CA.removeCapsule(i);
    WP.setWeapon('R');
    WP.resetWeaponKills();
    MO.clearMods();
    CA.resetCarrierDrops();
    T.setScrollX(FX.run.startScroll);
    PC.resetPace();
    SCR.resetScore();
    SP.resetSpawner();
    HO.resetHostileRng();
    HO.resetKills(); WP.resetShotsFired();
    player.x = FX.run.playerSpawn.x;
    player.y = FX.run.playerSpawn.y;
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
    PL.clearPlayerTraversal(0);
    player.traversalControlUntil = 0;
    IN.clearJumpBuffer();
    IN.clearHookBuffer();
    HK.resetHook();
    FL.resetFlow();
    WG.resetCornerEvents();
    XF.resetTransform();
    LV.unbuildFutureFaces();
    T.sliceStats.attempts++;
    T.sliceStats.airJumps = 0;
    T.sliceStats.setbacks = 0;
    T.sliceStats.lastSetbackAt = -1e9;
    T.sliceStats.minEdgeMargin = Infinity;
    T.sliceStats.startedAt = T.gameMs;
    SCR.scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');
    SC.updateScroll(0);
    ST.setState('PLAYING');
  }
  B.installHost({ resetGame });

  // update(dt), transcribed from src/main.js (render calls dropped).
  function update(dt) {
    T.advanceGameMs(dt * 1000);
    const wScale = T.gameMs < MO.mods.chronoUntil ? CONFIG.mods.chronoScale : 1;
    SC.updateScroll(dt * wScale);
    SP.updateSpawner();
    PL.updatePlayer(dt);
    if (ST.state !== 'PLAYING') return;
    HO.updateHostiles(dt * wScale);
    CA.updateCapsules(dt * wScale);
    MO.updateMods();
    WP.updateBullets(dt);
    SCR.updateScore(dt, {
      grounded: player.grounded, vx: player.vx,
      traversalState: player.traversalState,
      x: player.x, y: player.y,
      margin: player.x - player.hw - E.sLeftEdge(),
    });
    if (player.x >= FX.finish.x0) { SCR.scoreRunEnd('clear'); ST.setState('VICTORY'); }
  }

  // ---- input application (the frame-scoped hook, harness-side) ----
  const events = cfg.events;
  let nextEv = 0;
  const scriptHeld = { right: false, jump: false };
  function applyEvent(e, wipedByReset) {
    if (e.type === 'down') {
      scriptHeld[e.key] = true;
      if (wipedByReset) return;                       // effect lost to releaseAllKeys
      // src/main.js keydown: a fresh (non-repeat) jump press arms the buffer
      if (e.key === 'jump') IN.bufferJumpUntil(T.gameMs + P.jumpBufferMs);
      IN.keys[e.key] = true;
    } else {
      scriptHeld[e.key] = false;
      if (wipedByReset) return;
      IN.keys[e.key] = false;
    }
  }
  let nextSampleAt = cfg.dispatch === 'quantized' ? cfg.phase : 0;
  function applyDue() {
    if (cfg.dispatch === 'quantized') {
      if (T.gameMs < nextSampleAt) return;
      while (nextSampleAt <= T.gameMs) nextSampleAt += cfg.sampleGameMs;
    }
    while (nextEv < events.length && events[nextEv].t <= T.gameMs) applyEvent(events[nextEv++], false);
  }
  // Events already due when a retry freeze begins would be dispatched during
  // the (real-time) freeze and then wiped by resetGame's releaseAllKeys —
  // consume them for script-held bookkeeping only. Only reachable in
  // quantized mode; sync mode has already applied everything due.
  function consumeDueDuringFreeze() {
    while (nextEv < events.length && events[nextEv].t <= T.gameMs) applyEvent(events[nextEv++], true);
  }

  // ---- frame loop ----
  const out = {
    deaths: [], maxX: -Infinity, endState: null, victoryAt: -1,
    attempts: 0, falls: 0, framesRun: 0,
  };
  const rows = cfg.frameTrace ? [] : null;
  resetGame();
  let lastFailures = T.sliceStats.failures;
  let reassertAt = -1;
  let frames = 0;
  const frameCap = 100000;
  while (frames < frameCap && T.gameMs < cfg.endGameMs) {
    if (ST.state === 'SLICE_RETRY') {
      consumeDueDuringFreeze();
      fireTimers();                                    // -> host.resetGame()
      if (ST.state !== 'PLAYING') break;
      // the real driver re-presses script-held keys when it detects the
      // attempts counter tick, <= one sample interval later
      reassertAt = frames + cfg.reassertFrames;
      continue;
    }
    if (ST.state !== 'PLAYING') break;
    if (frames === reassertAt) {
      // Playwright re-press of an already-down code arrives as repeat:true,
      // so it re-sets the key without re-arming the jump buffer
      for (const k in scriptHeld) if (scriptHeld[k]) IN.keys[k] = true;
      reassertAt = -1;
    }
    applyDue();
    update(dt);
    frames++;
    if (player.x > out.maxX) out.maxX = player.x;
    if (T.sliceStats.failures > lastFailures) {
      out.deaths.push({
        gameMs: +T.gameMs.toFixed(3),
        x: +player.x.toFixed(3), y: +player.y.toFixed(3),
        kind: T.sliceStats.falls > out.falls ? 'fall' : 'damage',
      });
      out.falls = T.sliceStats.falls;
      lastFailures = T.sliceStats.failures;
    }
    if (ST.state === 'VICTORY' && out.victoryAt < 0) out.victoryAt = +T.gameMs.toFixed(3);
    if (rows) rows.push([
      frames, T.gameMs.toFixed(3), T.scrollX.toFixed(6),
      player.x.toFixed(6), player.y.toFixed(6),
      player.vx.toFixed(6), player.vy.toFixed(6),
      player.grounded ? 1 : 0, player.hp,
      IN.keys.right ? 1 : 0, IN.keys.jump ? 1 : 0,
      IN.jumpBufferedUntil.toFixed(3),
      T.sliceStats.attempts,
      HO.hostiles.map((h) => h.kind[0] + ':' + h.state + ':' + h.x.toFixed(4) + ':' + h.y.toFixed(4)).join('|'),
      (XF.activeTransformEvent() || { state: 'complete' }).state,
    ].join(','));
  }
  out.endState = ST.state;
  out.attempts = T.sliceStats.attempts;
  out.finalX = +player.x.toFixed(3);
  out.finalGameMs = +T.gameMs.toFixed(3);
  out.framesRun = frames;
  out.decisions = XF.transformDecisionTrace();
  if (rows) out.rows = rows;
  PL.cancelSliceRetry();
  console.log(JSON.stringify(out));
`;

function runChild(cfg, label) {
  try {
    return JSON.parse(execFileSync(process.execPath,
      ['--input-type=module', '-e', childSource(cfg)],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  } catch (e) {
    console.error('t2lab: child failed (' + label + '): ' + e.message);
    return null;
  }
}

function baseCfg(overrides = {}) {
  return {
    dtMs: DT_MS, endGameMs: END_GAME_MS, edges: [EDGE_L, EDGE_R],
    dispatch: DISPATCH, sampleGameMs: SAMPLE_GAME_MS, phase: PHASE,
    reassertFrames: REASSERT_FRAMES, frameTrace: false,
    events: baseEvents,
    ...overrides,
  };
}

const sig = (r) => JSON.stringify({
  firstDeath: r.deaths[0] ? r.deaths[0].gameMs : null,
  deaths: r.deaths.length,
  maxX: +r.maxX.toFixed(2),
  end: r.endState, victoryAt: r.victoryAt,
  ritual0: r.decisions[0] ? r.decisions[0].startAt : null,
  ritual1: r.decisions[1] ? r.decisions[1].startAt : null,
});

const summarize = (r) => ({
  firstDeathGameMs: r.deaths[0] ? r.deaths[0].gameMs : null,
  deaths: r.deaths, maxX: +r.maxX.toFixed(2), finalX: r.finalX,
  endState: r.endState, victoryAt: r.victoryAt, attempts: r.attempts,
  decisions: r.decisions.map((d) => ({
    id: d.id, startAt: d.startAt, haltAt: d.haltAt, triggerAt: d.triggerAt,
    startTriggerMargin: +(+d.startTriggerMargin).toFixed(4), binding: d.binding,
  })),
});

/* ------------------------------ modes -------------------------------- */

if (mode === 'run') {
  const r = runChild(baseCfg(), 'run');
  if (!r) process.exit(1);
  console.log(JSON.stringify(summarize(r), null, 2));
} else if (mode === 'repeat') {
  const n = parseInt(opt('n', '3'), 10);
  const sigs = [];
  for (let i = 0; i < n; i++) {
    const r = runChild(baseCfg({ frameTrace: true }), 'repeat-' + i);
    if (!r) process.exit(1);
    sigs.push({ sig: sig(r), digest: r.rows.join('\n').length, rows: r.rows.length });
    console.log('run ' + (i + 1) + ': ' + sigs[i].sig +
      ' trace(' + sigs[i].rows + ' rows, ' + sigs[i].digest + ' chars)');
  }
  const allSame = sigs.every((s) => s.sig === sigs[0].sig && s.digest === sigs[0].digest &&
    s.rows === sigs[0].rows);
  console.log(allSame
    ? 'DETERMINISTIC: ' + n + '/' + n + ' identical full-trace digests'
    : 'NON-DETERMINISTIC: digests differ');
  process.exit(allSame ? 0 : 2);
} else if (mode === 'sweep') {
  const shiftList = opt('shift', '-1,1').split(',').map(Number);
  const base = runChild(baseCfg(), 'baseline');
  if (!base) process.exit(1);
  const baseSig = sig(base);
  console.log('baseline: ' + baseSig);
  const flips = [];
  const targets = [{ tap: -1, holdEdge: 'down', name: 'hold-right-down' }];
  for (let k = 0; k < tapCount; k++) targets.push({ tap: k, name: 'tap' + k });
  for (const tgt of targets) {
    for (const s of shiftList) {
      const ev = shifted(baseEvents, tgt, s);
      const r = runChild(baseCfg({ events: ev }), tgt.name + ':' + s);
      if (!r) continue;
      const rs = sig(r);
      const flip = rs !== baseSig;
      if (flip) flips.push({ target: tgt.name, shiftFrames: s, sig: rs });
      console.log((flip ? 'FLIP ' : 'same ') + tgt.name + ' ' +
        (s > 0 ? '+' : '') + s + 'f' + (flip ? ' -> ' + rs : ''));
    }
  }
  console.log('---');
  console.log('taps swept: ' + tapCount + ' (+hold), shifts: ' + shiftList.join('/') +
    ', forks: ' + flips.length);
  if (flips.length) {
    const outcomes = new Set(flips.map((f) => f.sig));
    console.log('distinct forked outcomes: ' + outcomes.size);
  }
} else if (mode === 'phases') {
  const step = parseFloat(opt('step', '7'));
  const buckets = new Map();
  for (let phi = 0; phi < SAMPLE_GAME_MS; phi += step) {
    const r = runChild(baseCfg({ dispatch: 'quantized', phase: phi }), 'phase-' + phi);
    if (!r) continue;
    const rs = sig(r);
    if (!buckets.has(rs)) buckets.set(rs, []);
    buckets.get(rs).push(+phi.toFixed(1));
    console.log('phase ' + phi.toFixed(1) + ': ' + rs);
  }
  console.log('---');
  console.log('distinct outcomes across sampler phases: ' + buckets.size);
  for (const [s, phis] of buckets) console.log('  [' + phis.join(',') + '] -> ' + s);
} else if (mode === 'diverge') {
  const spec = opt('shift-tap', '0:1');          // tapIndex:frames
  const [k, f] = spec.split(':').map(Number);
  const base = runChild(baseCfg({ frameTrace: true }), 'baseline');
  const varr = runChild(baseCfg({
    frameTrace: true, events: shifted(baseEvents, { tap: k }, f),
  }), 'variant');
  if (!base || !varr) process.exit(1);
  let first = -1;
  const n = Math.min(base.rows.length, varr.rows.length);
  for (let i = 0; i < n; i++) if (base.rows[i] !== varr.rows[i]) { first = i; break; }
  console.log('baseline: ' + sig(base));
  console.log('variant (tap' + k + ' shifted ' + f + 'f): ' + sig(varr));
  if (first < 0) { console.log('traces identical for ' + n + ' frames'); process.exit(0); }
  console.log('first divergent frame: ' + first);
  for (let i = Math.max(0, first - 2); i < Math.min(n, first + 4); i++) {
    console.log(' base[' + i + ']: ' + base.rows[i]);
    console.log(' var [' + i + ']: ' + varr.rows[i]);
  }
} else {
  console.error('unknown mode: ' + mode + ' (run|repeat|sweep|phases|diverge)');
  process.exit(1);
}
