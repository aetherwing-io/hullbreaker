// default-run-child.mjs — one fresh process per scenario for T-120's driven
// behaviour tests. Usage (from a pathcheck domain, via ./spawn.mjs):
//
//   node default-run-child.mjs '<json spec>'      prints one JSON line
//
// Scenarios (spec.mode):
//   trace     fresh boot, `frames` steps of the hold-right policy: per-frame state
//             hashes (+ which part of the state each frame hash covers)
//   retry     fresh boot, `dirtyFrames` of play, a REAL retry (the shipped run-reset
//             registry), then `frames` more; spec.cleanClock: true instead advances
//             the clock by the same `dirtyFrames` steps WITHOUT playing (the fresh
//             twin a retry must equal)
//   coyote    run off a deck lip with the air jump withheld and press jump k frames
//             late, for every k up to spec.maxK: was the press forgiven?
//   buffer    fall onto a flat deck with the air jump withheld and press jump k
//             frames before landing: did it fire on landing?
//
// spec.query sets __HB_QUERY__ (default ''), spec.poisonRenderGlobals makes every
// unknown `__HB_*` global read as a truthy, "ready" render diagnostic before any
// sim module loads (see poison() below).

import { bootDefaultRun, holdRightPolicy } from './default-run.mjs';

const spec = JSON.parse(process.argv[2] || '{}');
const dt = spec.dt || 1 / 60;

// FNV-1a over a string
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
// every primitive field of a sim row, keys sorted, functions and caches skipped.
// Two normalizations, both documented in the domains that compare traces:
//  - absolute clock fields (…Until / …At / …Since) are shown relative to the
//    run's start, because src/sim/time.js's gameMs is monotonic across retries;
//  - hostile identity handles (`id`, and `wardedBy`, which holds one) are shown
//    relative to the run's first id: src/sim/hostiles.js's nextWaspId is a
//    process-lifetime counter that no reset rewinds, and ids are only ever
//    compared for equality, never used as a quantity.
let runStart = 0, idBase = null;
function flat(o, depth = 0, key = '') {
  if (o === null || typeof o !== 'object') {
    if (typeof o === 'function') return undefined;
    if (typeof o === 'number' && Number.isFinite(o) && /(?:Until|At|Since)$/.test(key))
      // relative, rounded past the subtraction's FP noise; anything at or
      // before the run's start (the 0 "unset" sentinel included) reads 0
      return o <= runStart ? 0 : Math.round((o - runStart) * 1e6) / 1e6;
    // (0 is "no hostile": wardedBy's empty handle)
    if (typeof o === 'number' && o > 0 && idBase !== null && (key === 'id' || key === 'wardedBy') && depth <= 1) return o - idBase;
    return o;
  }
  if (depth > 3) return '[deep]';
  if (Array.isArray(o)) return o.map((x) => flat(x, depth + 1, key));
  const out = {};
  for (const k of Object.keys(o).sort()) {
    const v = o[k];
    if (typeof v === 'function' || k.startsWith('__')) continue;
    out[k] = flat(v, depth + 1, k);
  }
  return out;
}

/* The render layer publishes its art diagnostics as window.__HB_* functions
   (__HB_PRELOAD, __HB_SPRITES, __HB_HULL_TEX, __HB_BACKDROP: src/render/*.js).
   A sim that branched on whether art loaded would have to read one of those, or
   some other global — the only channel layer purity leaves open (the sim cannot
   import src/render or name window/document). So the poisoned twin makes EVERY
   `__HB_*` global that is not set (except __HB_QUERY__, the documented sim
   input) answer as a truthy "everything is ready" diagnostic, through a proxy
   on globalThis's prototype chain: property reads and bare identifiers both
   resolve through it. If the sim reads none of them, both twins are identical. */
function poison() {
  const READY = new Proxy(function ready() { return READY; }, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 1 : k === 'state' ? 'ready'
      : k === 'ready' || k === 'loaded' || k === 'ok' ? true : READY),
  });
  const base = Object.getPrototypeOf(globalThis);
  const trap = new Proxy(base, {
    has: (t, k) => (typeof k === 'string' && k.startsWith('__HB_') && k !== '__HB_QUERY__') || Reflect.has(t, k),
    get: (t, k, r) => (typeof k === 'string' && k.startsWith('__HB_') && k !== '__HB_QUERY__' && !Reflect.has(t, k)
      ? READY : Reflect.get(t, k, r)),
  });
  Object.setPrototypeOf(globalThis, trap);
}

const host = await bootDefaultRun({ query: spec.query || '', poison: spec.poisonRenderGlobals ? poison : null });
const { M, player } = host;
// the poison is live (a vacuous twin would compare a clean run with itself):
// a property read, an unknown name, and a bare identifier all see "ready"
const poisonLive = !!spec.poisonRenderGlobals && typeof globalThis.__HB_SPRITES === 'function' &&
  !!globalThis.__HB_ART_READY__ && globalThis.__HB_PRELOAD().state === 'ready' &&
  (() => { try { return !!new Function('return __HB_ANY_ART_FLAG__')(); } catch { return false; } })() &&
  typeof globalThis.__HB_QUERY__ === 'string';

function stateParts() {
  const c = M.WG.activeCorner();
  return {
    world: JSON.stringify([+(M.T.gameMs - runStart).toFixed(6), M.T.scrollX, M.ST.state, M.HO.kills,
      M.WP.shotsFired, M.WP.currentWeapon, c ? flat(c) : null, flat(M.SCR.scoreSnapshot())]),
    player: JSON.stringify(flat(player)),
    hostiles: JSON.stringify(M.HO.hostiles.map((e) => {
      if (idBase === null) idBase = e.id;
      return flat(e);
    })),
    bullets: JSON.stringify(M.WP.bulletPool.filter((b) => b.alive).map((b) => flat(b))),
    capsules: JSON.stringify(M.CA.capsules.map((x) => flat(x))),
  };
}
// play `frames` steps of the hold-right policy; per-frame hashes of each part of
// the sim state (so a failure can say WHAT diverged first, not just when)
let debug = null;
function playTrace(frames) {
  runStart = M.T.gameMs;
  idBase = null;
  const step = holdRightPolicy(host);
  const hashes = [], parts = [];
  let seen = 0, last = M.HO.hostiles.length, dives = 0, firstDive = -1;
  for (let f = 0; f < frames; f++) {
    step();
    host.update(dt);
    const n = M.HO.hostiles.length; if (n > last) seen += n - last; last = n;
    for (const e of M.HO.hostiles) if (e.state === 'dive' && !e.__dove) { e.__dove = 1; dives++; if (firstDive < 0) firstDive = f; }
    const p = stateParts();
    if (spec.debugFrame === f) debug = p;                  // diagnosis only: full state of one frame
    const ph = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, fnv(v)]));
    hashes.push(fnv(Object.values(ph).join('')));
    parts.push(ph);
    if (M.ST.state !== 'PLAYING') break;
  }
  return {
    ...(debug ? { debug } : {}),
    frames: hashes.length, hashes, parts,
    end: { state: M.ST.state, scrollX: M.T.scrollX, kills: M.HO.kills, hp: player.hp, lives: player.lives,
      x: player.x, hostilesSeen: seen, dives, firstDive, corner: M.WG.activeCorner()?.k ?? 0,
      resetOwners: M.RR.runResetSnapshot().owners.length },
  };
}

let out = {};
if (spec.mode === 'trace' || spec.mode === 'retry') {
  host.resetGame();                                         // main.js boot: resetGame() at load
  if (spec.mode === 'retry') {
    if (spec.cleanClock) {
      // the fresh twin: same clock, nothing played (gameMs is monotonic across
      // retries by design, and FP rounding depends on the absolute clock)
      for (let f = 0; f < spec.dirtyFrames; f++) M.T.advanceGameMs(dt * 1000);
    } else {
      const step = holdRightPolicy(host);
      let f = 0;
      for (; f < spec.dirtyFrames; f++) {
        // a little variety, so more owners carry state into the retry: swap
        // weapons once (the policy itself aims up on alternate seconds)
        if (f === 600) { host.keyEdge('swap', true); host.keyEdge('swap', false); }
        step();
        if (M.ST.state !== 'PLAYING') break;
        host.update(dt);
      }
      // a dead run is retried from GAME_OVER exactly like a live one (main.js:
      // R in GAME_OVER/VICTORY calls resetGame); finish the clock so both twins
      // retry at the same absolute gameMs
      for (; f < spec.dirtyFrames; f++) M.T.advanceGameMs(dt * 1000);
      out.dirty = { kills: M.HO.kills, shots: M.WP.shotsFired, hp: player.hp, lives: player.lives,
        x: +player.x.toFixed(3), scrollX: +M.T.scrollX.toFixed(3), weapon: M.WP.currentWeapon,
        state: M.ST.state, corner: M.WG.activeCorner()?.k ?? 0, hostiles: M.HO.hostiles.length };
    }
    host.keyEdge('up', false);
    host.resetGame();                                       // the retry: the REAL registry
  }
  out = { ...out, ...playTrace(spec.frames) };
} else if (spec.mode === 'coyote' || spec.mode === 'buffer') {
  out = forgiveness(spec.mode);
} else {
  throw new Error('unknown mode ' + spec.mode);
}
if (spec.poisonRenderGlobals) out.poisonLive = poisonLive;
process.stdout.write(JSON.stringify(out) + '\n');

/* ---------------- input forgiveness (proposal §7.4 #4) ---------------- *
 * The player sim alone (advanceGameMs + updatePlayer, exactly the two calls
 * main.js's update makes for RIG), on the shipped level and the shipped tune.
 * The AIR JUMP IS WITHHELD in both scenarios: it is the other way a late or
 * early press gets RIG up, and the FAIR-GAP probe's "one coyote window"
 * assertion was satisfied by it (T-108 mutant M01). */
function forgiveness(mode) {
  const P = M.PL.P;
  const g = M.LV.groundH;
  // a lip: a flat run-up of >= 6 columns ending at a gap of >= 2 columns
  let lip = -1;
  for (let i = 30; i < g.length - 10 && lip < 0; i++) {
    if (g[i] > -100 && g[i + 1] < -100 && g[i + 2] < -100) {
      let run = 0; while (run < 8 && g[i - run] === g[i]) run++;
      if (run >= 6) lip = i;
    }
  }
  // a flat landing strip of >= 8 columns for the buffer scenario
  let strip = -1;
  for (let i = 30; i < g.length - 10 && strip < 0; i++) {
    let ok = true; for (let j = 0; j < 8; j++) if (g[i + j] !== g[i]) ok = false;
    if (ok && g[i] > -100) strip = i;
  }
  const keys = M.IN.keys;
  const setup = (x, y, grounded) => {
    M.IN.releaseAllKeys(); M.IN.clearJumpBuffer();
    M.PL.clearPlayerTraversal(0);
    Object.assign(player, { x, y, vx: 0, vy: 0, grounded, onOneWay: null, airJumpsLeft: P.airJumps,
      coyoteUntil: 0, dropUntil: 0, jumpCutDone: true, hp: P.maxHealth, lives: 3,
      iframesUntil: 0, hitstunUntil: 0, traversalControlUntil: 0 });
    M.T.setScrollX(x - 15);                                 // RIG well inside both screen edges
    M.ST.setState('PLAYING');
  };
  const frame = () => { M.T.advanceGameMs(dt * 1000); M.PL.updatePlayer(dt); };
  const rows = [];
  if (mode === 'coyote') {
    if (lip < 0) return { error: 'no deck lip with a 6-column run-up on the shipped level' };
    for (let k = 1; k <= (spec.maxK || 20); k++) {
      setup(lip - 4.5, g[lip], true);
      host.keyEdge('right', true);
      // settle on the deck, then run until the frame RIG leaves it
      let lastGroundedMs = null, airborne = -1;
      for (let f = 0; f < 240; f++) {
        frame();
        if (player.grounded) lastGroundedMs = M.T.gameMs;
        else { airborne = f; break; }
      }
      if (airborne < 0) return { error: 'RIG never left the lip', lip };
      player.airJumpsLeft = 0;                              // the air jump is withheld
      // k-1 more airborne frames, then the press, then the frame that reads it
      for (let f = 1; f < k; f++) frame();
      host.keyEdge('jump', true);
      const pressMs = M.T.gameMs;
      const startedAirborne = !player.grounded;
      frame();
      const consumeMs = M.T.gameMs;
      // a GROUND jump from the air: vy is the jump velocity minus one frame of
      // rise gravity, and the withheld air jump was not spent
      const jumped = startedAirborne && player.vy > P.jumpVel * 0.8 && player.airJumpsLeft === 0;
      rows.push({ k, lateMs: +(consumeMs - lastGroundedMs).toFixed(4), pressLateMs: +(pressMs - lastGroundedMs).toFixed(4),
        jumped, vy: +player.vy.toFixed(4) });
      host.keyEdge('jump', false); host.keyEdge('right', false);
    }
    return { mode, lip, dt, coyoteMs: P.coyoteMs, rows };
  }
  // buffer
  if (strip < 0) return { error: 'no flat 8-column landing strip on the shipped level' };
  const dropX = strip + 4, dropY = g[strip] + 3;
  // dry run: which frame lands?
  setup(dropX, dropY, false);
  player.airJumpsLeft = 0;
  let land = -1;
  for (let f = 0; f < 240; f++) { frame(); if (player.grounded) { land = f; break; } }
  if (land < 0) return { error: 'RIG never landed on the strip', strip };
  for (let k = 0; k <= (spec.maxK || 20); k++) {
    setup(dropX, dropY, false);
    player.airJumpsLeft = 0;                                // the air jump is withheld
    let pressMs = null, fired = false, firedAt = -1, landMs = null, groundedFrames = 0;
    for (let f = 0; f < land + 30; f++) {
      // pressed k frames before the landing frame and HELD, the way a player
      // presses early (a released key would also cut the jump short on landing)
      if (f === land - k) { host.keyEdge('jump', true); pressMs = M.T.gameMs; }
      const wasGrounded = player.grounded;
      frame();
      if (player.grounded && landMs === null) landMs = M.T.gameMs;
      if (wasGrounded) groundedFrames++;
      if (wasGrounded && player.vy > P.jumpVel * 0.8) { fired = true; firedAt = f; break; }
      if (wasGrounded && groundedFrames > 3) break;          // stood on the deck: it did not fire
    }
    // earliness = press to the first frame that could consume it (the frame
    // after the landing frame: the jump branch reads the previous frame's grounded)
    host.keyEdge('jump', false);
    rows.push({ k, earlyMs: pressMs === null || landMs === null ? null : +(landMs + dt * 1000 - pressMs).toFixed(4), fired,
      groundedFramesBeforeJump: fired ? groundedFrames : null, firedAt, land });
  }
  return { mode, strip, dt, jumpBufferMs: P.jumpBufferMs, land, rows };
}
