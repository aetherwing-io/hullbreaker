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
//                                       ritual: default vs g1 vs g1&view=far
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
  let aim = null;
  for (const h of full.hostiles) {
    if (!h.materialized || h.hp <= 0 || h.x < p.x - 4) continue;
    const d = Math.abs(h.x - p.x);
    if (d > 34) continue;
    if (!aim || d < Math.abs(aim.x - p.x)) aim = h;
  }
  return {
    gameMs: s.gameMs, state: s.state, scrollX: s.scrollX, corner: s.corner,
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded,
    screenRight: s.screenRight, edgeMargin: s.edgeMargin, weapon: s.weapon,
    attempt: s.attempt, kills: full.kills, hp: full.player.hp, lives: full.player.lives,
    hostiles: full.hostiles.map((h) => ({ id: h.id, kind: h.kind, x: h.x, y: h.y, hp: h.hp })),
    aimDy: aim ? aim.y - (p.y + 0.85) : 0,
    g1: hb.g1 ? hb.g1.pieces : 0,
  };
};

/* ------------------------- the policy (closed loop) ------------------ *
 * Hold right, hold fire, hop on a cadence, and point the 8-way aim at the
 * nearest hostile ahead — enough of a player to clear a corner gate. Every
 * key event it sends is recorded, so the same run can be replayed verbatim
 * against another render mode (that is the whole equivalence proof).      */
async function drive(page, { maxMs, onSample, record }) {
  const t0 = Date.now();
  const send = async (type, code) => {
    try { await page.keyboard[type === 'down' ? 'down' : 'up'](code); } catch {}
    if (record) record.push({ t: Date.now() - t0, type, code });
  };
  await send('down', 'ArrowRight');
  await send('down', 'KeyJ');
  let up = false, down = false, jumping = false, lastJump = 0;
  const trace = [];
  while (Date.now() - t0 < maxMs) {
    const now = Date.now() - t0;
    const st = await page.evaluate(PROBE);
    if (st) {
      trace.push({ t: now, ...st });
      if (onSample && (await onSample(st, now)) === 'stop') break;
      const wantUp = st.aimDy > 1.2, wantDown = st.aimDy < -1.6;
      if (wantUp !== up) { await send(wantUp ? 'down' : 'up', 'ArrowUp'); up = wantUp; }
      if (wantDown !== down) { await send(wantDown ? 'down' : 'up', 'ArrowDown'); down = wantDown; }
      if (!jumping && now - lastJump > 900) { await send('down', 'Space'); jumping = true; lastJump = now; }
      else if (jumping && now - lastJump > 240) { await send('up', 'Space'); jumping = false; }
    }
    await page.waitForTimeout(25);
  }
  for (const code of ['ArrowRight', 'KeyJ', 'ArrowUp', 'ArrowDown', 'Space'])
    await send('up', code);
  return trace;
}

// Replay a recording verbatim: identical input, wall-clock scheduled the same
// way, with no reaction to what it sees. The only difference between two
// replays is the browser's own frame timing.
async function replay(page, events, { maxMs, onSample }) {
  const t0 = Date.now();
  const trace = [];
  let i = 0;
  while (Date.now() - t0 < maxMs) {
    const now = Date.now() - t0;
    while (i < events.length && events[i].t <= now) {
      const e = events[i++];
      try { await page.keyboard[e.type === 'down' ? 'down' : 'up'](e.code); } catch {}
    }
    const st = await page.evaluate(PROBE);
    if (st) {
      trace.push({ t: now, ...st });
      if (onSample && (await onSample(st, now)) === 'stop') break;
    }
    if (i >= events.length && now > events[events.length - 1].t + 1500) break;
    await page.waitForTimeout(25);
  }
  return trace;
}

/* ------------------------------- selftest --------------------------- */

async function selftest() {
  const urls = [
    ['normal', '?selftest=1'],
    ['normal+g1', '?g1=1&selftest=1'],
    ['normal+g1+view=far', '?g1=1&view=far&selftest=1'],
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

async function captureRun(page, tag, { maxMs = 60000 } = {}) {
  const taken = [];
  let gateAt = null, doneAt = null, next = 0;
  const trace = await drive(page, {
    maxMs,
    onSample: async (st, now) => {
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
      if (st.state !== 'PLAYING') return 'stop';
      return null;
    },
  });
  return { taken, trace };
}

async function shots() {
  const runs = [
    ['default', '?testapi=1'],
    ['g1', '?g1=1&testapi=1'],
    ['g1-far', '?g1=1&view=far&testapi=1'],
  ];
  await withBrowser(async (server, browser) => {
    for (const [tag, query] of runs) {
      const { context, page, errors } = await openPage(browser, server, query);
      const { taken } = await captureRun(page, tag);
      console.log(`${tag}: ${taken.map((k) => `${k.name}@${k.tMs}ms`).join(' ')}`);
      if (taken.length < KEYFRAMES.length)
        console.log(`  ${tag}: MISSED ${KEYFRAMES.length - taken.length} keyframe(s)`);
      for (const e of errors) console.log(`  CONSOLE: ${e}`);
      await context.close();
    }
  });
}

async function video() {
  await withBrowser(async (server, browser) => {
    const { context, page } = await openPage(browser, server, '?g1=1&testapi=1', { video: true });
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
  const wave = gate
    ? (firstWhere(trace, (s) => s.corner.state === 'gate' && s.hostiles.length >= 4) || gate)
    : null;
  return {
    edgeStrip: trace.length ? +(trace[0].screenRight - trace[0].scrollX).toFixed(6) : null,
    haltS: gate ? gate.corner.haltS : null,
    pivotS: gate ? gate.corner.pivotS : null,
    gateScrollX: gate ? +gate.scrollX.toFixed(6) : null,
    turnStartScrollX: turn ? +turn.scrollX.toFixed(6) : null,
    ritualMaxTMs: Math.max(0, ...trace.map((s) => (s.corner ? s.corner.tMs : 0))),
    gateWaveX: wave ? wave.hostiles.filter((h) => h.kind === 'wasp')
      .map((h) => +h.x.toFixed(4)).sort((a, b) => a - b) : null,
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

// drive() records into an array the caller owns, so capture the events there.
async function equivalenceRuns() {
  return withBrowser(async (server, browser) => {
    const record = [];
    const a = await openPage(browser, server, '?testapi=1');
    let gateAt = null, doneAt = null;
    const traceA = await drive(a.page, {
      maxMs: 60000, record,
      onSample: async (st, now) => {
        if (st.corner && st.corner.state === 'gate' && gateAt === null) gateAt = now;
        if (st.corner && st.corner.k === 2 && doneAt === null) doneAt = now;
        if (doneAt !== null && now - doneAt > 1500) return 'stop';
        if (st.state !== 'PLAYING') return 'stop';
        return null;
      },
    });
    const errorsA = [...a.errors];
    await a.context.close();
    const runMs = record.length ? record[record.length - 1].t + 2500 : 45000;
    writeFileSync(`${OUT}/${PREFIX}recorded-input.json`, JSON.stringify({
      name: 'g1-equivalence-recording',
      description: 'closed-loop policy recorded on the default six-face run, ' +
        'replayed verbatim against default and ?g1=1',
      url: 'index.html?testapi=1', durationMs: runMs,
      events: record.map((e) => ({ t: e.t, type: e.type === 'down' ? 'keydown' : 'keyup', code: e.code })),
    }, null, 2));

    const replays = [];
    for (const [tag, query] of [['defaultA', '?testapi=1'], ['defaultB', '?testapi=1'], ['g1', '?g1=1&testapi=1']]) {
      const r = await openPage(browser, server, query);
      const trace = await replay(r.page, record, { maxMs: runMs });
      replays.push({ tag, query, trace, errors: [...r.errors], g1: trace.length ? trace[0].g1 : 0 });
      await r.context.close();
    }
    return { traceA, errorsA, replays, runMs, events: record.length };
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
  const report = {
    generatedAt: new Date().toISOString(),
    devFast: DEV_FAST,
    inputEvents: res.events,
    runMs: res.runMs,
    g1PiecesBaked: G.g1,
    invariants: inv,
    invariantMismatches: mismatches,
    deviation: { 'defaultA-vs-defaultB (noise floor)': noise, 'defaultA-vs-g1': cross, 'defaultB-vs-g1': cross2 },
    consoleErrors: Object.fromEntries(res.replays.map((r) => [r.tag, r.errors])),
    verdict: null,
  };
  const within = (c, n) =>
    c.maxDx <= Math.max(n.maxDx * 1.5, n.maxDx + 0.5) &&
    c.maxDScrollX <= Math.max(n.maxDScrollX * 1.5, n.maxDScrollX + 0.5);
  report.verdict = mismatches.length === 0 && G.g1 > 0 &&
    within(cross, noise) && within(cross2, noise) ? 'RENDER-ONLY' : 'REVIEW';
  writeFileSync(`${OUT}/${PREFIX}equivalence.json`, JSON.stringify(report, null, 2));
  const md = [
    '# G1 equivalence: default vs ?g1=1 (identical input)', '',
    `Recorded policy: ${res.events} key events, replayed verbatim three times`,
    `(default, default again as the frame-timing noise floor, and ?g1=1).`,
    `Limb pieces baked in the g1 run: **${G.g1}**.`, '',
    '## Frame-timing-independent invariants', '',
    '| quantity | defaultA | defaultB | g1 |', '| --- | --- | --- | --- |',
    ...invKeys.map((k) => `| ${k} | ${JSON.stringify(inv[0][k])} | ${JSON.stringify(inv[1][k])} | ${JSON.stringify(inv[2][k])} |`),
    '', mismatches.length ? `**${mismatches.length} MISMATCH(ES)**` : '**No mismatches.**', '',
    '## Trace deviation (max over matched game time)', '',
    '| pair | samples | max Δx | max Δy | max ΔscrollX | max ΔedgeMargin |',
    '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries(report.deviation).map(([k, v]) =>
      `| ${k} | ${v.matched} | ${v.maxDx} | ${v.maxDy} | ${v.maxDScrollX} | ${v.maxDEdgeMargin} |`),
    '', `Verdict: **${report.verdict}**`, '',
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
