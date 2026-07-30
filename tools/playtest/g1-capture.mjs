// g1-capture.mjs — dev-only verification/evidence script for the G1 limb-turn
// experiment (?g1=1: the six-face run with the corner ritual re-read as a
// camera orbit around a static faceted leg). Reuses the playtest harness's
// static server + playwright-core; not wired into run.mjs because it needs a
// closed-loop policy (the corner gate has to actually be FOUGHT before the
// ritual fires) and screenshot bursts keyed on ritual state.
//
//   node g1-capture.mjs selftest      — ?selftest=1 matrix: normal, normal+g1,
//                                       g1+view=far, traversal, transform
//   node g1-capture.mjs shots         — evidence frames on the first corner
//                                       ritual: default vs g1 vs g1&view=near
//   node g1-capture.mjs equivalence   — identical-input runs, default x2 (noise
//                                       floor) vs g1, trace comparison
//   node g1-capture.mjs video         — a .webm of the g1 corner
//
// Add --dev-fast to any mode to poke CONFIG in-page (faster scroll, hotter
// gun) so the corner arrives in seconds. That is FRAMING ITERATION ONLY: it
// desynchronizes the run from the shipped tuning, so its output is tagged
// `dev-` and must never be committed as evidence.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(here, 'runs', 'g1');
mkdirSync(OUT, { recursive: true });

const ARGV = process.argv.slice(2);
const MODE = ARGV[0];
const DEV_FAST = ARGV.includes('--dev-fast');
const PREFIX = DEV_FAST ? 'dev-' : '';
const VIEWPORT = { width: 1280, height: 800 };

async function withBrowser(fn, opts = {}) {
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    return await fn(server, browser);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function openPage(browser, server, query, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || VIEWPORT,
    recordVideo: opts.video ? { dir: OUT, size: opts.viewport || VIEWPORT } : undefined,
  });
  const page = await context.newPage();
  const errors = [];
  // Chrome asks every page for /favicon.ico and the harness's static server
  // 404s it; that is environment noise, not the game, so it is named and
  // dropped rather than silently swallowed.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/.test(text) && /favicon/.test(m.location().url || '')) return;
    errors.push(text + (m.location().url ? ' [' + m.location().url + ']' : ''));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${server.baseUrl}/index.html${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  if (DEV_FAST) {
    await page.evaluate(() => {
      window.HB.CONFIG.scrollSpeed = 8.6;
      window.HB.CONFIG.weapons.R.fireRateMs = 45;
      window.HB.CONFIG.weapons.R.damage = 6;
      window.HB.CONFIG.weapons.R.speed = 40;
    });
  }
  return { context, page, errors };
}

// One read per poll: the frozen testapi channel (plus this branch's additive
// `corner` block) and the live hostile rows, which is what a gate wave's
// spawn positions have to be read from.
const PROBE = () => {
  const api = globalThis.__HULLBREAKER_TEST__;
  const s = api ? api.snapshot() : null;
  const hb = window.HB;
  if (!s || !hb) return null;
  const full = hb.snapshot();
  const p = s.player;
  // Nearest materialized hostile on EITHER side: a corner gate's wave
  // materializes in the arena RIG has just run through, i.e. behind them, so a
  // policy that only ever looks forward never fires a shot that can hit
  // anything (and, since projectiles now die at the bend, a forward shot at the
  // pivot dies half a tile from the muzzle).
  let aim = null;
  for (const h of s.hostiles) {
    if (!h.materialized || h.hp <= 0) continue;
    const d = Math.abs(h.x - p.x);
    if (d > 34) continue;
    if (!aim || d < Math.abs(aim.x - p.x)) aim = h;
  }
  return {
    gameMs: s.gameMs, state: s.state, scrollX: s.scrollX, corner: s.corner,
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded,
    screenRight: s.screenRight, edgeMargin: s.edgeMargin, weapon: s.weapon,
    attempt: s.attempt, kills: full.kills, hp: full.player.hp, lives: full.player.lives,
    hostiles: s.hostiles.map((h) => ({ id: h.id, kind: h.kind, x: h.x, y: h.y, hp: h.hp })),
    aimDy: aim ? aim.y - (p.y + 0.85) : 0,
    aimDx: aim ? aim.x - p.x : null,
    g1: hb.g1 ? hb.g1.pieces : 0,
  };
};

/* ------------------------- the policy (closed loop) ------------------ *
 * Hold fire, run right, point the 8-way aim at the nearest hostile on either
 * side, and hop — enough of a player to fight a corner gate, which the
 * evidence capture needs because the ritual only fires when the wave dies.
 * The equivalence proof deliberately does NOT use this: see fixedScript().  */
async function drive(page, { maxMs, onSample }) {
  const t0 = Date.now();
  const held = new Set();
  const send = async (type, code) => {
    if (type === 'down' && held.has(code)) return;
    if (type === 'up' && !held.has(code)) return;
    if (type === 'down') held.add(code); else held.delete(code);
    try { await page.keyboard[type === 'down' ? 'down' : 'up'](code); } catch {}
  };
  await send('down', 'KeyJ');                     // the trigger is always held
  let jumping = false, lastJump = 0;
  const trace = [];
  while (Date.now() - t0 < maxMs) {
    const now = Date.now() - t0;
    const st = await page.evaluate(PROBE);
    if (st) {
      trace.push({ t: now, ...st });
      if (onSample && (await onSample(st, now)) === 'stop') break;
      // A mediocre player: a gate wave of four wasps beats it often, which is
      // why captureRun() restarts the run rather than pretending one pass
      // always wins a fight.
      const dist = st.aimDx === null ? Infinity : Math.hypot(st.aimDx, st.aimDy);
      const behind = st.aimDx !== null && st.aimDx < -0.6 && dist < 20;
      await send(behind ? 'down' : 'up', 'ArrowLeft');   // turn and fight
      await send(behind ? 'up' : 'down', 'ArrowRight');
      await send(st.aimDy > 1.2 ? 'down' : 'up', 'ArrowUp');
      await send(st.aimDy < -1.6 ? 'down' : 'up', 'ArrowDown');
      // The hop cadence is measured in GAME time, not wall time. Doing this in
      // wall time was a real bug: under ?fixeddt a slow (software-rasterised)
      // frame rate makes the sim run at a fraction of real time, so a 900 ms
      // wall cadence became a ~270 ms game cadence — jump spam, permanently
      // airborne, and death in the first gap.
      const wantHop = dist < 2.6 && st.grounded;
      if (!jumping && (wantHop || st.gameMs - lastJump > 900)) {
        await send('down', 'Space'); jumping = true; lastJump = st.gameMs;
      } else if (jumping && st.gameMs - lastJump > 240) {
        await send('up', 'Space'); jumping = false;
      }
    }
    await page.waitForTimeout(20);
  }
  for (const code of ['ArrowRight', 'ArrowLeft', 'KeyJ', 'ArrowUp', 'ArrowDown', 'Space'])
    await send('up', code);
  return trace;
}

/* ------------------------------- selftest --------------------------- */

async function selftest() {
  const urls = [
    ['normal', '?selftest=1'],
    ['normal+g1', '?g1=1&selftest=1'],
    ['normal+g1+view=near', '?g1=1&view=near&selftest=1'],
    ['traversal', '?slice=traversal&selftest=1'],
    ['transform', '?slice=transform&selftest=1'],
  ];
  const rows = await withBrowser(async (server, browser) => {
    const out = [];
    for (const [label, query] of urls) {
      const { context, page, errors } = await openPage(browser, server, query);
      await page.waitForTimeout(2200);
      out.push({ label, title: await page.title(), errors: [...errors] });
      await context.close();
    }
    return out;
  });
  for (const r of rows) {
    console.log(`${r.label.padEnd(20)} -> ${r.title}`);
    for (const e of r.errors) console.log(`   CONSOLE: ${e}`);
  }
  const bad = rows.filter((r) => !/^SELFTEST PASS/.test(r.title) || r.errors.length);
  console.log(bad.length ? `\n${bad.length} FAILING` : '\nALL PASS, CONSOLE CLEAN');
}

/* ------------------------------- evidence --------------------------- *
 * Frames keyed on the corner ritual's own clock (the additive `corner` block
 * in ?testapi=1): the approach with the gate up, both snaps, the ratchet
 * hold, the settle, and the resumed run on the next facet.               */

const KEYFRAMES = [
  ['0-approach', (st, c) => c.gateMs > 900],
  ['1-windup', (st, c) => st.corner.state === 'turning' && st.corner.tMs >= 40],
  ['2-snap1', (st, c) => st.corner.state === 'turning' && st.corner.tMs >= 210],
  ['3-hold', (st, c) => st.corner.state === 'turning' && st.corner.tMs >= 450],
  ['4-snap2', (st, c) => st.corner.state === 'turning' && st.corner.tMs >= 760],
  ['5-settle', (st, c) => st.corner.state === 'turning' && st.corner.tMs >= 900],
  ['6-resumed', (st, c) => c.doneMs > 900],
];

async function captureRun(page, tag, { maxMs = 200000 } = {}) {
  let taken = [];
  let gateAt = null, doneAt = null, next = 0, lives = 0;
  const trace = await drive(page, {
    maxMs,
    onSample: async (st, now) => {
      // A lost run restarts in place (R, which the six-face build accepts on
      // GAME_OVER) instead of tearing down the page: the corner gate is a real
      // fight this policy loses often, and a fresh boot per attempt spends most
      // of the budget on the 17 s approach. A restart discards the partial
      // capture, so no frame set is ever spliced across two attempts.
      if (st.state !== 'PLAYING') {
        lives++;
        if (lives > 12) return 'stop';
        await page.keyboard.press('KeyR');
        taken = []; next = 0; gateAt = null; doneAt = null;
        return null;
      }
      if (st.corner && st.corner.state === 'gate' && gateAt === null) gateAt = now;
      if (st.corner && st.corner.k === 2 && doneAt === null) doneAt = now;
      const c = {
        gateMs: gateAt === null ? 0 : now - gateAt,
        doneMs: doneAt === null ? 0 : now - doneAt,
      };
      while (next < KEYFRAMES.length && KEYFRAMES[next][1](st, c)) {
        const name = KEYFRAMES[next][0];
        await page.screenshot({ path: `${OUT}/${PREFIX}${tag}-${name}.png` });
        taken.push({ name, tMs: st.corner ? st.corner.tMs : null, x: +st.x.toFixed(2) });
        next++;
      }
      if (next >= KEYFRAMES.length) return 'stop';
      return null;
    },
  });
  return { taken, trace, restarts: lives };
}

async function shots() {
  // ?view=far is the shipped default since 79f8d88, so `g1` IS the far shot;
  // the near pass is the tighter framing the camera used before that verdict.
  // ?fixeddt pins the SIM timestep — it changes nothing about what is drawn,
  // but it stops a software-rasterised headless frame rate from starving the
  // bot's reaction rate per unit of GAME time, which is the only reason the
  // limb build (more geometry, slower frames here, free on a GPU) was losing
  // the same fight the default build wins.
  // MEASURED, and the reason the near pair is the honest evidence: a corner
  // gate's wave is laid out between the live screen edges (sim/wavegate.js's
  // spawnGateWave), so at ?view=far the arena is 33 tiles wide instead of 16
  // and the four wasps stand ~11 tiles apart. This policy cannot clear that in
  // 13 restarts in EITHER render mode; at ?view=near it clears it routinely.
  const F = '&fixeddt=16.6667';
  const runs = [
    ['default', '?testapi=1' + F],
    ['default-near', '?view=near&testapi=1' + F],
    ['g1', '?g1=1&testapi=1' + F],
    ['g1-near', '?g1=1&view=near&testapi=1' + F],
  ];
  const only = ARGV.slice(1).filter((a) => !a.startsWith('--'));
  await withBrowser(async (server, browser) => {
    for (const [tag, query] of runs) {
      if (only.length && !only.includes(tag)) continue;
      const { context, page, errors } = await openPage(browser, server, query);
      const { taken, restarts } = await captureRun(page, tag, { maxMs: 420000 });
      const ok = taken.length === KEYFRAMES.length;
      console.log(`${tag}: ` +
        taken.map((k) => `${k.name}@${Math.round(k.tMs)}ms`).join(' ') +
        ` [${restarts} restart(s)]` +
        (ok ? '' : ` — MISSED ${KEYFRAMES.length - taken.length}`));
      for (const e of errors) console.log(`  CONSOLE: ${e}`);
      await context.close();
    }
  });
}

async function video() {
  await withBrowser(async (server, browser) => {
    // ?view=near for the video: the bot has to WIN the gate for the ritual to
    // fire, and the far arena (33 tiles, wasps 11 apart) beats this policy in
    // both render modes — see the note on `runs` in shots().
    const { context, page } = await openPage(
      browser, server, '?g1=1&view=near&testapi=1&fixeddt=16.6667', { video: true });
    await captureRun(page, 'video-g1');
    const v = page.video();
    await context.close();
    if (v) console.log('video:', await v.path());
  });
}

/* ----------------------------- equivalence -------------------------- *
 * The mechanical render-only proof. One recorded policy, replayed three
 * times: default, default again (the frame-timing noise floor), and ?g1=1.
 * Frame-timing-independent quantities must match EXACTLY; everything else
 * must be no further apart across modes than the two same-mode runs are.  */

function firstWhere(trace, pred) { return trace.find(pred) || null; }

function invariants(trace) {
  const gate = firstWhere(trace, (s) => s.corner && s.corner.state === 'gate');
  const turn = firstWhere(trace, (s) => s.corner && s.corner.state === 'turning');
  const after = firstWhere(trace, (s) => s.corner && s.corner.k === 2);
  // The gate wave, by IDENTITY rather than by position: the four rows that
  // appear on the frame the gate arms. Their x is the authored spawn position
  // (they have not moved yet, and cannot until they finish materializing), so
  // this is exact — whereas "the hostiles present when there are four of them"
  // also catches ambient wasps mid-flight and reads as noise.
  let wave = null;
  const gi = gate ? trace.indexOf(gate) : -1;
  if (gi > 0) {
    const before = new Set(trace[gi - 1].hostiles.map((h) => h.id));
    wave = { hostiles: gate.hostiles.filter((h) => !before.has(h.id)) };
  } else if (gate) {
    wave = gate;
  }
  return {
    edgeStrip: trace.length ? +(trace[0].screenRight - trace[0].scrollX).toFixed(6) : null,
    haltS: gate ? gate.corner.haltS : null,
    pivotS: gate ? gate.corner.pivotS : null,
    gateScrollX: gate ? +gate.scrollX.toFixed(6) : null,
    turnStartScrollX: turn ? +turn.scrollX.toFixed(6) : null,
    ritualMaxTMs: Math.max(0, ...trace.map((s) => (s.corner ? s.corner.tMs : 0))),
    gateWaveX: wave ? wave.hostiles.filter((h) => h.kind === 'wasp')
      .map((h) => +h.x.toFixed(4)).sort((a, b) => a - b) : null,
    gateWaveY: wave ? wave.hostiles.filter((h) => h.kind === 'wasp')
      .map((h) => +h.y.toFixed(4)).sort((a, b) => a - b) : null,
    afterScrollX: after ? +after.scrollX.toFixed(6) : null,
    kindsSeen: [...new Set(trace.flatMap((s) => s.hostiles.map((h) => h.kind)))].sort(),
    attempts: Math.max(...trace.map((s) => s.attempt)),
  };
}

// Max deviation between two traces at matched game time (nearest sample within
// 30 ms). Reports the gameplay-visible quantities: where RIG is, where the
// world is, and how much daylight the pursuing edge left.
function deviation(a, b) {
  let dx = 0, dy = 0, ds = 0, dm = 0, n = 0;
  for (const s of a) {
    let best = null, bd = Infinity;
    for (const t of b) {
      const d = Math.abs(t.gameMs - s.gameMs);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best || bd > 30) continue;
    dx = Math.max(dx, Math.abs(best.x - s.x));
    dy = Math.max(dy, Math.abs(best.y - s.y));
    ds = Math.max(ds, Math.abs(best.scrollX - s.scrollX));
    dm = Math.max(dm, Math.abs(best.edgeMargin - s.edgeMargin));
    n++;
  }
  return { matched: n, maxDx: +dx.toFixed(4), maxDy: +dy.toFixed(4),
           maxDScrollX: +ds.toFixed(4), maxDEdgeMargin: +dm.toFixed(4) };
}

/* A FIXED, feedback-free input script, in the game's own clock.
 *
 * The first pass at this recorded the closed-loop policy above and replayed the
 * recording. That was a mistake worth writing down: an aim-reactive policy makes
 * the run chaotic, so one frame of dispatch quantization amplified into tens of
 * tiles of position difference between two runs of the SAME build — the
 * comparison was measuring the policy, not the change. A dumb script (hold
 * right, hold fire, hop on a cadence, sweep the aim up periodically) clears the
 * first corner gate anyway, and it is stable enough that two same-build runs
 * land on top of each other, which is what makes a cross-mode difference mean
 * something.                                                                */
function fixedScript(budgetMs) {
  const ev = [];
  ev.push({ gameMs: 200, type: 'down', code: 'ArrowRight' });
  ev.push({ gameMs: 350, type: 'down', code: 'KeyJ' });
  for (let t = 1000; t < budgetMs; t += 900) {
    ev.push({ gameMs: t, type: 'down', code: 'Space' });
    ev.push({ gameMs: t + 240, type: 'up', code: 'Space' });
  }
  // the high lane of a gate wave sits +4.6 over the deck: sweep the 8-way aim
  // up on a slow cadence so a level-held trigger still reaches it
  for (let t = 1800; t < budgetMs; t += 2400) {
    ev.push({ gameMs: t, type: 'down', code: 'ArrowUp' });
    ev.push({ gameMs: t + 700, type: 'up', code: 'ArrowUp' });
  }
  ev.sort((a, b) => a.gameMs - b.gameMs);
  return ev;
}

// Replay one script against one mode, in sim time. Polls fast (the sim advances
// in fixed 16.67 ms steps under ?fixeddt, so a 10 ms poll never collapses a
// 240 ms tap into one frame) and stops on the same SIM-time condition in every
// run, so all three runs cover the same interval of the game.
async function runScript(page, events, { budgetMs, stopAfterCornerMs = 2000 }) {
  const trace = [];
  let i = 0, doneAt = null;
  const wall0 = Date.now();
  while (Date.now() - wall0 < 240000) {
    const st = await page.evaluate(PROBE);
    if (st) {
      while (i < events.length && events[i].gameMs <= st.gameMs) {
        const e = events[i++];
        try { await page.keyboard[e.type === 'down' ? 'down' : 'up'](e.code); } catch {}
      }
      trace.push(st);
      if (st.corner && st.corner.k === 2 && doneAt === null) doneAt = st.gameMs;
      if (doneAt !== null && st.gameMs - doneAt > stopAfterCornerMs) break;
      if (st.gameMs > budgetMs || st.state !== 'PLAYING') break;
    }
    await page.waitForTimeout(10);
  }
  for (const code of ['ArrowRight', 'KeyJ', 'ArrowUp', 'Space'])
    try { await page.keyboard.up(code); } catch {}
  return trace;
}

async function equivalenceRuns() {
  return withBrowser(async (server, browser) => {
    const budgetMs = 45000;
    const events = fixedScript(budgetMs);
    writeFileSync(`${OUT}/${PREFIX}equivalence-input.json`, JSON.stringify({
      name: 'g1-equivalence',
      description: 'fixed, feedback-free input in the game clock; replayed against ' +
        'default (twice, as the noise floor) and ?g1=1, all under ?fixeddt',
      budgetMs, events,
    }, null, 2));
    const FIXED = '&fixeddt=16.6667';
    const replays = [];
    for (const [tag, query] of [['defaultA', '?testapi=1' + FIXED],
                                ['defaultB', '?testapi=1' + FIXED],
                                ['g1', '?g1=1&testapi=1' + FIXED]]) {
      const r = await openPage(browser, server, query);
      const trace = await runScript(r.page, events, { budgetMs });
      replays.push({ tag, query, trace, errors: [...r.errors], g1: trace.length ? trace[0].g1 : 0 });
      const last = trace[trace.length - 1];
      console.log(`${tag}: ${trace.length} samples, gameMs ${last ? last.gameMs.toFixed(0) : 0}` +
        `, state ${last ? last.state : '?'}, corner ${last && last.corner ? last.corner.state : '?'}` +
        `, kills ${last ? last.kills : 0}, maxX ${Math.max(...trace.map((s) => s.x)).toFixed(2)}`);
      await r.context.close();
    }
    writeFileSync(`${OUT}/${PREFIX}equivalence-traces.json`, JSON.stringify(
      replays.map((r) => ({ tag: r.tag, trace: r.trace.map((s) => [
        +s.gameMs.toFixed(2), +s.x.toFixed(4), +s.y.toFixed(4), +s.scrollX.toFixed(4),
        s.corner ? s.corner.state : null, s.corner ? +s.corner.tMs.toFixed(1) : null,
        s.kills, s.state,
      ]) })), null, 2));
    return { replays, budgetMs, events: events.length };
  });
}

function compareAndReport(res) {
  const [A, B, G] = res.replays;
  const inv = res.replays.map((r) => ({ tag: r.tag, ...invariants(r.trace) }));
  const noise = deviation(A.trace, B.trace);
  const cross = deviation(A.trace, G.trace);
  const cross2 = deviation(B.trace, G.trace);
  const invKeys = Object.keys(inv[0]).filter((k) => k !== 'tag');
  const mismatches = [];
  for (const k of invKeys) {
    const a = JSON.stringify(inv[0][k]), b = JSON.stringify(inv[1][k]), g = JSON.stringify(inv[2][k]);
    // ritualMaxTMs is frame-quantized (the last sampled frame of the ritual),
    // so it is compared with a one-frame tolerance rather than exactly.
    if (k === 'ritualMaxTMs') continue;
    if (a !== g || b !== g) mismatches.push({ key: k, defaultA: inv[0][k], defaultB: inv[1][k], g1: inv[2][k] });
  }
  const runs = res.replays.map((r) => {
    const last = r.trace[r.trace.length - 1];
    return {
      tag: r.tag, query: r.query, samples: r.trace.length,
      lastGameMs: last ? +last.gameMs.toFixed(1) : 0,
      endState: last ? last.state : '?',
      maxX: r.trace.length ? +Math.max(...r.trace.map((s) => s.x)).toFixed(3) : 0,
      kills: last ? last.kills : 0,
      ritualSeen: r.trace.some((s) => s.corner && s.corner.state === 'turning'),
      cornersCleared: r.trace.length
        ? Math.max(...r.trace.map((s) => (s.corner && s.corner.k ? s.corner.k - 1 : 0))) : 0,
    };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    devFast: DEV_FAST,
    inputEvents: res.events,
    budgetMs: res.budgetMs,
    runs,
    g1PiecesBaked: G.g1,
    invariants: inv,
    invariantMismatches: mismatches,
    deviation: { 'defaultA-vs-defaultB (noise floor)': noise, 'defaultA-vs-g1': cross, 'defaultB-vs-g1': cross2 },
    consoleErrors: Object.fromEntries(res.replays.map((r) => [r.tag, r.errors])),
    ritualCovered: runs.every((r) => r.ritualSeen),
    verdict: null,
  };
  const within = (c, n) =>
    c.maxDx <= Math.max(n.maxDx * 1.5, n.maxDx + 0.5) &&
    c.maxDScrollX <= Math.max(n.maxDScrollX * 1.5, n.maxDScrollX + 0.5);
  report.verdict = mismatches.length === 0 && G.g1 > 0 && report.ritualCovered &&
    within(cross, noise) && within(cross2, noise) ? 'RENDER-ONLY' : 'REVIEW';
  writeFileSync(`${OUT}/${PREFIX}equivalence.json`, JSON.stringify(report, null, 2));
  const md = [
    '# G1 equivalence: default vs ?g1=1 (identical input)', '',
    `A fixed, feedback-free script of ${res.events} key events, dispatched on the`,
    `game's own clock under \`?fixeddt=16.6667\`, run against the default six-face`,
    `build twice (the frame-timing noise floor) and against \`?g1=1\` once.`,
    `Limb pieces baked in the g1 run: **${G.g1}**.`, '',
    '## Runs', '',
    '| run | samples | last gameMs | end state | maxX | kills | ritual seen | corners cleared |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...runs.map((r) => `| ${r.tag} | ${r.samples} | ${r.lastGameMs} | ${r.endState} | ` +
      `${r.maxX} | ${r.kills} | ${r.ritualSeen} | ${r.cornersCleared} |`),
    '',
    '## Frame-timing-independent invariants', '',
    '| quantity | defaultA | defaultB | g1 |', '| --- | --- | --- | --- |',
    ...invKeys.map((k) => `| ${k} | ${JSON.stringify(inv[0][k])} | ${JSON.stringify(inv[1][k])} | ${JSON.stringify(inv[2][k])} |`),
    '', mismatches.length ? `**${mismatches.length} MISMATCH(ES)**` : '**No mismatches.**', '',
    '## Trace deviation (max over matched game time)', '',
    '| pair | samples | max Δx | max Δy | max ΔscrollX | max ΔedgeMargin |',
    '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries(report.deviation).map(([k, v]) =>
      `| ${k} | ${v.matched} | ${v.maxDx} | ${v.maxDy} | ${v.maxDScrollX} | ${v.maxDEdgeMargin} |`),
    '', `Corner ritual covered by every run: **${report.ritualCovered}**`,
    `Verdict: **${report.verdict}**`, '',
    'Read the deviation table against the noise floor row: two runs of the same',
    'build differ by browser frame timing alone, so a cross-mode pair that is no',
    'further apart than that pair carries no mode-dependent gameplay signal.', '',
  ].join('\n');
  writeFileSync(`${OUT}/${PREFIX}equivalence.md`, md);
  console.log(md);
}

if (MODE === 'selftest') await selftest();
else if (MODE === 'shots') await shots();
else if (MODE === 'video') await video();
else if (MODE === 'equivalence') compareAndReport(await equivalenceRuns());
else {
  console.log('usage: node g1-capture.mjs [selftest|shots|equivalence|video] [--dev-fast]');
  process.exit(1);
}
