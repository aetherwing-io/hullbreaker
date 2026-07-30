#!/usr/bin/env node
/* simrun.mjs — headless, fixed-step, closed-loop movement harness.
 *
 * The sim layer is renderer-free by contract (tools/pathcheck.mjs guards it),
 * so the whole traversal slice can be imported and stepped in Node. This tool
 * does exactly that: it reproduces src/main.js's frame order without a
 * browser, drives the game with a *closed-loop* bot policy (one that reads sim
 * state each frame instead of replaying fixed key timings), and prints
 * metrics plus a trace fingerprint.
 *
 * Why this exists alongside tools/playtest (which drives real Chrome):
 *   - it is deterministic (fixed dt, seeded rng) so a fingerprint can prove
 *     "this flag changed nothing" byte-for-byte;
 *   - a closed-loop policy can actually use a *contextual* verb like the snap
 *     hook, which an open-loop key script cannot aim;
 *   - it costs no browser, so it never contends with another agent's batch.
 * It is NOT a substitute for playing: it proves mechanics, not fun.
 *
 * Usage:
 *   node tools/movement/simrun.mjs --query 'slice=traversal&pace=surge&hook=1' \
 *        --policy hook-line [--seconds 14] [--dt 0.0166667] [--json] [--trace]
 *   node tools/movement/simrun.mjs --list-policies
 *
 * One process = one URL configuration: src/mode.js resolves its flags at
 * import time, exactly like the browser does.
 */

import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SRC = join(here, '..', '..', 'src');
let SRC = DEFAULT_SRC;
const mod = (rel) => 'file://' + join(SRC, rel);

/* ---------------------------- CLI ------------------------------------ */
function parseArgs(argv) {
  const out = {
    query: 'slice=traversal', policy: 'dash', seconds: 16, dt: 1 / 60,
    json: false, trace: false, aspect: 1280 / 800, listPolicies: false,
    // --src drives a DIFFERENT src/ tree with this same runner and these same
    // policies, which is how flags-off equivalence is proved against a pristine
    // checkout: identical bot, identical fixture, two code trees, one
    // fingerprint. Comparing against numbers captured before a policy change
    // would silently measure the policy instead of the game.
    src: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query') out.query = argv[++i];
    else if (a === '--policy') out.policy = argv[++i];
    else if (a === '--seconds') out.seconds = Number(argv[++i]);
    else if (a === '--dt') out.dt = Number(argv[++i]);
    else if (a === '--aspect') out.aspect = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '--trace') out.trace = true;
    else if (a === '--list-policies') out.listPolicies = true;
    else if (a === '--src') out.src = argv[++i];
    else throw new Error('unknown flag ' + a);
  }
  return out;
}

/* ---------------- frustum edges, without a renderer ------------------ *
 * Replicates src/render/camera.js's probe-camera calibration analytically
 * (THREE.lookAt basis + perspective ray to the z=0 plane) so a headless run
 * sees the same left damage plane and right clamp a 1280x800 browser does.
 * Cross-checked against a committed harness report: EDGE_L ~= -10.40 at
 * aspect 1.6, versus -10.38 measured in Chrome.                          */
export function calibratedEdges(CONFIG, aspect, cameraDepth) {
  const C = CONFIG.camera;
  const px = C.x, py = C.y, pz = cameraDepth;
  let zx = px - C.lookX, zy = py - C.lookY, zz = pz;
  const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  // x = normalize(cross(up=(0,1,0), z))
  let xx = zz, xy = 0, xz = -zx;
  const xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
  const tanX = aspect * Math.tan((C.fov / 2) * Math.PI / 180);
  const edge = (ndc) => {
    const dx = ndc * tanX * xx - zx;
    const dz = ndc * tanX * xz - zz;
    return px + dx * (-pz / dz);
  };
  return { left: edge(-1), right: edge(1) };
}

/* --------------------------- bot policies ---------------------------- *
 * Each policy is a pure-ish function (ctx) => intent, where intent names the
 * keys to hold this frame. They are deliberately simple, legible strategies —
 * the point is comparing routes and verbs, not showcasing bot skill.
 *
 *   ctx = { player, fixture, gameMs, margin, hook, flow, prev }
 *   intent = { right, left, up, down, jump, fire, hook }
 */
/* Contact handling shared by every forward policy. A ledge catch or a wall
 * contact is a launch waiting for a jump press; holding RIGHT into a wall while
 * pressing jump pumps in place forever (the wall launch fires left, the drive
 * immediately cancels it), which is a real trap for a mash-forward player and
 * was pathologically stalling these runs before this existed. Releasing the
 * direction for the kick frame is what a human does without thinking. */
function contactIntent(p) {
  if (p.traversalState === 'wall') return { jump: true, fire: true };
  if (p.traversalState === 'ledge') return { right: true, jump: true, fire: true };
  return null;
}

const POLICIES = {
  // Mash forward: hold right, jump whenever grounded or about to be blocked.
  // The "hold right and ignore the lattice" baseline.
  dash(ctx) {
    const p = ctx.player;
    return contactIntent(p) ||
      { right: true, jump: p.grounded || p.vy < -6, fire: true };
  },

  // The known degenerate line (adversarial F1/F10): pump the chimney wall to
  // the roof band and run east along it.
  roof(ctx) {
    const p = ctx.player;
    const inShaft = p.x > 39.5 && p.x < 45 && p.y < 10.5;
    return contactIntent(p) || {
      right: !inShaft || p.y > 9,
      jump: p.grounded || inShaft || p.vy < -6,
      fire: true,
    };
  },

  // Hold right and take every anchor the game offers. With the flag off the key
  // is inert, which makes this policy its own control group.
  'hook-line'(ctx) {
    const p = ctx.player;
    const canHook = !!(ctx.hook && ctx.hook.acquirable);
    if (canHook) return { right: true, hook: true, fire: true };
    return contactIntent(p) ||
      { right: true, jump: p.grounded || p.vy < -8, fire: true };
  },

  // Chain-hungry: convert EVERY contact into a launch and take every anchor,
  // spending the air jump only to reach the next contact. This is the policy
  // the momentum spine is designed for, and the one that shows whether a chain
  // can survive a whole pass.
  chain(ctx) {
    const p = ctx.player;
    const canHook = !!(ctx.hook && ctx.hook.acquirable);
    if (canHook) return { right: true, hook: true, fire: true };
    const contact = contactIntent(p);
    if (contact) return contact;
    return {
      right: true,
      jump: p.grounded || (p.vy < -7 && p.airJumpsLeft > 0),
      fire: true,
    };
  },

  // Hold right and HOLD jump, forever. The jump buffer only arms on a fresh
  // keydown, so this policy jumps exactly once and then walks into whatever the
  // level puts in front of it (adversarial F11's root). It is the A/B partner
  // for ?autobounce=1, which re-arms the buffer on every landing.
  holdjump() { return { right: true, jump: true, fire: true }; },

  // Stand still: the pressure/fairness control.
  idle() { return {}; },
};

export const POLICY_IDS = Object.keys(POLICIES);

/* ------------------------------ the run ------------------------------ */
export async function runSim(opts) {
  if (opts.src) SRC = isAbsolute(opts.src) ? opts.src : resolve(process.cwd(), opts.src);
  globalThis.__HB_QUERY__ = opts.query;
  const { CONFIG } = await import(mod('config.js'));
  const M = await import(mod('mode.js'));
  const T = await import(mod('sim/time.js'));
  const E = await import(mod('sim/edges.js'));
  const I = await import(mod('sim/input.js'));
  const L = await import(mod('sim/level.js'));
  const PL = await import(mod('sim/player.js'));
  const ST = await import(mod('sim/state.js'));
  const SC = await import(mod('sim/scroll.js'));
  const H = await import(mod('sim/hostiles.js'));
  const CAPS = await import(mod('sim/capsules.js'));
  const MODS = await import(mod('sim/mods.js'));
  const W = await import(mod('sim/weapons.js'));
  const SP = await import(mod('sim/spawner.js'));
  const WG = await import(mod('sim/wavegate.js'));
  const SCORE = await import(mod('sim/score.js'));
  const PACE = await import(mod('sim/pace.js'));
  const PS = await import(mod('pure/score.js'));
  const TR = await import(mod('sim/transform.js'));
  // absent in a pristine --src tree from before these verbs existed, which is
  // exactly the tree the equivalence comparison drives
  let HOOK = null, FLOW = null;
  try { HOOK = await import(mod('sim/hook.js')); } catch { /* pre-hook tree */ }
  try { FLOW = await import(mod('sim/flow.js')); } catch { /* pre-flow tree */ }

  const slice = M.ACTIVE_SLICE;
  if (!slice) throw new Error('simrun expects a slice query (slice=traversal)');
  const depth = CONFIG.camera.z * Math.max(1, slice.run.portraitMinAspect / opts.aspect);
  const edges = calibratedEdges(CONFIG, opts.aspect, depth);
  E.setEdges(edges.left, edges.right);

  const policy = POLICIES[opts.policy];
  if (!policy) throw new Error('unknown policy ' + opts.policy);

  function reset() {
    H.clearHostiles();
    W.clearBullets();
    for (let i = CAPS.capsules.length - 1; i >= 0; i--) CAPS.removeCapsule(i);
    W.setWeapon('R');
    W.resetWeaponKills();
    MODS.clearMods();
    CAPS.resetCarrierDrops();
    T.setScrollX(slice.run.startScroll);
    PACE.resetPace();
    SCORE.resetScore();
    SP.resetSpawner();
    H.resetHostileRng();
    H.resetKills(); W.resetShotsFired();
    const p = PL.player;
    p.x = slice.run.playerSpawn.x; p.y = slice.run.playerSpawn.y;
    p.vx = 0; p.vy = 0;
    p.hp = PL.P.maxHealth; p.lives = PL.P.lives;
    p.facing = 1; p.aim.set(1, 0);
    p.iframesUntil = 0; p.hitstunUntil = 0;
    p.coyoteUntil = 0; p.dropUntil = 0; p.nextFireAt = 0;
    p.grounded = false; p.onOneWay = null; p.jumpCutDone = true;
    p.airJumpsLeft = PL.P.airJumps;
    p.traversalChain = 0; p.traversalChainUntil = 0;
    p.fallbackStreak = 0; p.fallbackRecoverX = -Infinity;
    p.edgePinnedMs = 0;
    PL.clearPlayerTraversal(0);
    p.traversalControlUntil = 0;
    I.clearJumpBuffer();
    if (I.clearHookBuffer) I.clearHookBuffer();
    if (HOOK) HOOK.resetHook();
    if (FLOW) FLOW.resetFlow();
    WG.resetCornerEvents();
    TR.resetTransform();
    L.unbuildFutureFaces();
    T.sliceStats.attempts++;
    T.sliceStats.airJumps = 0;
    T.sliceStats.setbacks = 0;
    T.sliceStats.lastSetbackAt = -1e9;
    T.sliceStats.minEdgeMargin = Infinity;
    T.sliceStats.startedAt = T.gameMs;
    for (const r of slice.rewards) CAPS.spawnCapsule(r.kind, r.letter, r.x, r.y, r.mode);
    if (M.SLICE_ENEMIES_ENABLED)
      // the same authored list src/main.js resetGame spawns: the pace's own
      // hostiles, or that list composed with an opt-in hound trial stage
      for (const e of (M.SLICE_ENEMY_PLAN || slice.enemies))
        H.spawnHostile(e.x, e.y, e.delayMs, e.kind, e);
    SCORE.scoreRunStart(CONFIG.gen.seed, slice.id, slice.pace.id);
    ST.setState('PLAYING');
    SC.updateScroll(0);
  }

  reset();

  const p = PL.player;
  const dt = opts.dt;
  const frames = Math.round(opts.seconds / dt);
  const m = {
    query: opts.query, policy: opts.policy, dt, seconds: opts.seconds,
    pace: slice.pace.id,
    outcome: 'not-completed', clearMs: null, frames: 0,
    minMargin: Infinity, maxY: -Infinity, minY: Infinity,
    airFrames: 0, groundFrames: 0, stallFrames: 0,
    contacts: { ledge: 0, wall: 0 },
    hooks: 0, hookBlocked: 0, hookReleases: 0,
    flowPeakLinks: 0, flowPeakMult: 1, flowAmpFrames: 0,
    peakVx: 0, peakSpeedMult: 1,
    setbacks: 0, falls: 0, hits: 0,
    x0: p.x, xEnd: p.x, kills: 0,
    visited: [], routeIds: [],
    trace: [],
  };
  let prevState = 'free', prevHp = p.hp, prevHooks = 0;
  const intentOf = (ctx) => policy(ctx) || {};

  for (let f = 0; f < frames; f++) {
    const hookInfo = HOOK ? HOOK.hookSnapshot() : null;
    const flowInfo = FLOW ? FLOW.flowSnapshot() : null;
    const margin = p.x - p.hw - E.sLeftEdge();
    const intent = intentOf({
      player: p, fixture: slice, gameMs: T.gameMs, margin,
      hook: hookInfo, flow: flowInfo,
    });
    // key edges: jump and hook are buffered presses in the real game
    const wantJump = !!intent.jump, wantHook = !!intent.hook;
    if (wantJump && !I.keys.jump) I.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);
    if (wantHook && !I.keys.hook && I.bufferHookUntil)
      I.bufferHookUntil(T.gameMs + (slice.hook ? slice.hook.bufferMs : 140));
    I.keys.right = !!intent.right; I.keys.left = !!intent.left;
    I.keys.up = !!intent.up; I.keys.down = !!intent.down;
    I.keys.jump = wantJump; I.keys.fire = !!intent.fire;
    I.keys.strafe = !!intent.strafe;
    if ('hook' in I.keys) I.keys.hook = wantHook;

    T.advanceGameMs(dt * 1000);
    SC.updateScroll(dt);
    SP.updateSpawner();
    PL.updatePlayer(dt);
    if (ST.state === 'PLAYING') {
      H.updateHostiles(dt);
      CAPS.updateCapsules(dt);
      MODS.updateMods();
      W.updateBullets(dt);
      SCORE.updateScore(dt, {
        grounded: p.grounded, vx: p.vx, traversalState: p.traversalState,
        x: p.x, y: p.y, margin: p.x - p.hw - E.sLeftEdge(),
      });
    }

    m.frames++;
    m.minMargin = Math.min(m.minMargin, margin);
    m.maxY = Math.max(m.maxY, p.y);
    m.minY = Math.min(m.minY, p.y);
    m.peakVx = Math.max(m.peakVx, p.vx);
    if (p.grounded) m.groundFrames++; else m.airFrames++;
    if (p.grounded && p.traversalState === 'free' && Math.abs(p.vx) < CONFIG.score.stallSpeed)
      m.stallFrames++;
    if (p.traversalState !== prevState && p.traversalState !== 'free')
      m.contacts[p.traversalState] = (m.contacts[p.traversalState] || 0) + 1;
    prevState = p.traversalState;
    if (p.hp < prevHp) m.hits++;
    prevHp = p.hp;
    const hs = HOOK ? HOOK.hookSnapshot() : null;
    if (hs) {
      m.hooks = hs.grabs;
      m.hookBlocked = hs.blocked;
      m.hookReleases = hs.releases;
    }
    const fs = FLOW ? FLOW.flowSnapshot() : null;
    if (fs) {
      m.flowPeakLinks = Math.max(m.flowPeakLinks, fs.links);
      m.flowPeakMult = Math.max(m.flowPeakMult, fs.mult);
      if (fs.mult > 1.0001) m.flowAmpFrames++;
      m.peakSpeedMult = Math.max(m.peakSpeedMult, fs.speedMult);
    }
    const cid = PS.scoreConnectorAt(slice.connectors, p.x, p.y, CONFIG.score.routeRadiusTiles);
    if (cid && m.visited[m.visited.length - 1] !== cid) m.visited.push(cid);
    if (opts.trace && f % 6 === 0) {
      m.trace.push([Math.round(T.gameMs), round(p.x), round(p.y), round(p.vx), round(p.vy),
        p.grounded ? 1 : 0, p.traversalState, hs ? hs.phase : '-', fs ? round(fs.mult) : 1]);
    }

    if (ST.state === 'VICTORY' || p.x >= slice.rejoin.x0) {
      m.outcome = 'cleared';
      m.clearMs = Math.round(T.gameMs - T.sliceStats.startedAt);
      break;
    }
    if (ST.state === 'SLICE_RETRY') { m.outcome = 'lost'; break; }
  }

  m.xEnd = round(p.x);
  m.kills = H.kills;
  m.setbacks = T.sliceStats.setbacks;
  m.falls = T.sliceStats.falls;
  m.routeIds = PS.scoreRoutesCompleted(slice.routes, m.visited);
  m.routeConnectors = m.visited.length;
  m.minMargin = round(m.minMargin);
  m.maxY = round(m.maxY); m.minY = round(m.minY);
  m.peakVx = round(m.peakVx);
  m.airFraction = round(m.airFrames / Math.max(1, m.frames));
  m.stallFraction = round(m.stallFrames / Math.max(1, m.frames));
  m.score = SCORE.scoreSnapshot();
  m.links = m.score.counts ? m.score.counts.link : 0;
  m.fingerprint = fingerprint([
    m.outcome, m.clearMs, m.frames, m.minMargin, m.maxY, m.minY, m.xEnd,
    m.airFrames, m.groundFrames, m.stallFrames, m.kills, m.setbacks, m.falls,
    m.hits, m.visited.join('>'), round(p.vx), round(p.vy), m.peakVx,
  ]);
  return m;
}

function round(v) { return Math.round(v * 1e4) / 1e4; }

function fingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/* ------------------------------- main -------------------------------- */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.listPolicies) {
    console.log(POLICY_IDS.join('\n'));
  } else {
    const m = await runSim(opts);
    if (opts.json) {
      console.log(JSON.stringify(m));
    } else {
      const L = (k, v) => console.log('  ' + k.padEnd(18) + v);
      console.log(opts.policy + '  [' + opts.query + ']');
      L('outcome', m.outcome + (m.clearMs === null ? '' : ' in ' + m.clearMs + 'ms'));
      L('x end', m.xEnd + '  (start ' + m.x0 + ')');
      L('minMargin', m.minMargin);
      L('maxY / minY', m.maxY + ' / ' + m.minY);
      L('air fraction', m.airFraction);
      L('stall fraction', m.stallFraction);
      L('contacts', 'ledge ' + m.contacts.ledge + '  wall ' + m.contacts.wall +
        '  hook ' + m.hooks + (m.hookBlocked ? ' (blocked ' + m.hookBlocked + ')' : ''));
      L('flow', 'peak links ' + m.flowPeakLinks + '  peak mult ' + m.flowPeakMult +
        '  amp frames ' + m.flowAmpFrames);
      L('peak vx', m.peakVx);
      L('routes', (m.routeIds.join(',') || '—') + '  (' + m.routeConnectors + ' connectors)');
      L('setbacks/falls/hits', m.setbacks + '/' + m.falls + '/' + m.hits);
      L('kills', m.kills);
      L('fingerprint', m.fingerprint);
      if (opts.trace) for (const row of m.trace) console.log('    ' + row.join(' '));
    }
  }
}
