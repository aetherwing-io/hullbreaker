#!/usr/bin/env node
// play-gate.mjs — the PLAY gate (T-120; docs/proposals/2026-10-test-audit.md §7.2):
// a real browser, the DEFAULT URL a player opens, at desktop and both phone
// orientations. It replaces "smoke" as the merge gate's browser step and owns
// the browser half of the checks the headless CORE tier cannot make.
//
//   node tools/orch/play-gate.mjs                       serve this tree in-process
//   node tools/orch/play-gate.mjs --base-url http://127.0.0.1:8780   a pinned server
//   ... --out <dir>          evidence (play-gate.json + failure screenshots)
//   ... --only boot,failsafe,selftest,degrade,smoke,perf     a subset of steps
//   ... --views desktop,landscape,portrait                   a subset of viewports
//   ... --skip-smoke         (merge-task.sh --skip-smoke passes this through)
//
// Steps (each result is PASS, FAIL, KNOWN, REPORT or SKIP):
//   boot      per viewport: index.html with NO query boots to its title, the
//             run starts the way the device starts it (a TAP on a phone, a key
//             on desktop), the loop runs; zero page errors; zero console errors
//             or warnings beyond named host noise; no URL fetched twice; no
//             visible text overflowing its box or the viewport; on a coarse
//             pointer, no text telling the player to press a key; HUD coverage
//             (reported); did the shipped look arrive (reported; gated on a GPU
//             host); frame times (reported).
//   failsafe  per viewport, "the failsafe reaches the player" (T-032, proposal
//             §7.4 #10): four forced failures — src/main.js throws while it
//             evaluates, rejects a promise nobody handles, 404s, never arrives — must
//             each put the failure panel (#fail) on screen, readable, with its
//             button inside the viewport, before the watchdog budget is out,
//             and with no simulation frame advanced. Falsifiers M36, M37, M46 (M12 fails the boot step).
//   selftest  per viewport: index.html?selftest=1 reports SELFTEST PASS.
//   degrade   one boot with every request under assets/generated/ aborted:
//             reaches PLAYING, no failure panel, the art diagnostics report
//             fallbacks, and the sim state at the end of a frame-exact input
//             schedule EQUALS the same schedule's state with the art loaded
//             (entry 16; proposal §7.4 #6, browser half). Falsifier M12 (boot)
//             and any sim branch on a real render signal.
//   smoke     the deterministic smoke: scripts/mid-route.json,
//             scripts/transform-slice.json and scripts/default-url-smoke.json
//             (the default URL), best of three each, judged by
//             tools/orch/smoke-verdict.mjs — the merge gate's old smoke step.
//   perf      the frame budget. On a GPU host (HB_GATE_SKIP_BROWSER_PROBE unset)
//             it runs `node tools/pathcheck.mjs --tier play` (the real-browser
//             render-submission probe) and gates on it; on a GPU-less host it is
//             REPORT-ONLY (integrator call on the audit's operator question 1:
//             SwiftShader measures the other lanes, not the game).
//
// KNOWN results are defects this gate SEES on the current tree that a named lane
// owns (KNOWN_DEFECTS below). They are printed on every run and do not fail it;
// anything not on that list fails. When a known defect stops reproducing, the
// gate says so — the entry should then be deleted (by the lane that fixed it, or
// T-120).
//
// Exit code: non-zero iff any step FAILed. Last line:
//   play-gate: N passed, M failed, K known (tracked), R reported, S skipped
//
// Host knobs (~/.hullbreaker-host.env): HB_PROBE_BOOT_MS (boot budget),
// HB_HARNESS_SLOWDOWN (smoke), HB_SMOKE_VIEWPORT (smoke canvas),
// HB_GATE_SKIP_BROWSER_PROBE=1 (GPU-less: perf report-only, phone DPR 2).
// HB_PLAY_JOBS = parallel browser contexts (default 2).
// Zero effect on the shipped game: it only reads the tree and serves it.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, startStaticServer } from '../assets/lib/browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ROOT = resolve(opt('--root', join(HERE, '..', '..')));
const OUT = opt('--out') ? resolve(opt('--out')) : null;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const GPU_LESS = process.env.HB_GATE_SKIP_BROWSER_PROBE === '1';
const BOOT_MS = Number(process.env.HB_PROBE_BOOT_MS) || 90000;
const SLOW = Math.max(1, Number(process.env.HB_HARNESS_SLOWDOWN) || 1);
const JOBS = Math.max(1, Number(process.env.HB_PLAY_JOBS) || 2);
const step = (name) => !ONLY || ONLY.has(name);
if (argv.includes('--skip-smoke') && ONLY) ONLY.delete('smoke');

// Device pixel ratio. On a GPU host: the devices' own (1 desktop, 3 phones). On a
// GPU-less host SwiftShader fills pixels on the CPU (measured on the 4-core
// cloud host at load ~27: 0.1 fps at 1280x800 DPR 1, 139 s to the title, 325 s
// to 400 ms of play), and DPR 3 trips the 4 s freeze watchdog (SPRINT
// environment notes) — so there the drawing buffer is shrunk to HB_PLAY_DPR
// (default 0.5) for EVERY viewport and the run says so. CSS layout — what the
// text, copy and HUD checks measure — is in CSS pixels and does not move with it.
const DPR_OVERRIDE = Number(process.env.HB_PLAY_DPR) || (GPU_LESS ? 0.5 : 0);
const dpr = (native) => DPR_OVERRIDE || native;
const VIEWS = {
  desktop: { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr(1), isMobile: false, hasTouch: false },
  landscape: { name: 'phone 844x390', viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr(3), isMobile: true, hasTouch: true },
  portrait: { name: 'phone 390x844', viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr(3), isMobile: true, hasTouch: true },
};
const VIEW_IDS = (opt('--views', 'desktop,landscape,portrait')).split(',').filter((v) => VIEWS[v]);

/* ---------------- what this gate knows it will see (tracked) ---------------- */
// Each entry: a defect present on main when T-120 built this gate, the lane that
// owns its fix, and the exact predicate that recognizes it. Nothing broader.
const KNOWN_DEFECTS = [
  { id: 'K1-title-overflow', owner: 'T-105', what: 'the title "HULLBREAKER" overflows its box (clips to "HULLBREAK" on a 390-px phone)',
    overflow: (o) => o.text === 'HULLBREAKER' },
  { id: 'K2-keyboard-copy-on-touch', owner: 'T-105', what: 'on a coarse pointer the title says "PRESS ANY KEY" and lists keyboard controls',
    copy: (where, phrase) => where === 'shell' && /^(press any key|wasd|arrows?|space|enter|shift|keys?|keyboard|press [a-z0-9])$/.test(phrase) },
  { id: 'K3-failsafe-hint-keyboard-on-touch', owner: 'T-105', what: 'on a coarse pointer the failure panel says "Press R, or click the button"',
    copy: (where, phrase) => where === 'fail' && /^(press r|keys?|press [a-z0-9])$/.test(phrase) },
  { id: 'K4-preload-double-fetch', owner: 'T-105', what: 'the four <link rel=preload> images are fetched twice (crossorigin mismatch) and Chrome warns about it',
    dupe: (url) => /\/assets\/generated\/(backdrops|environment)\/[\w.-]+\.webp$/.test(url),
    console: (t) => /A preload for '.*' is found, but is not used because the request credentials mode does not match/.test(t) ||
      /was preloaded using link preload but not used within a few seconds from the window's load event/.test(t) },
  { id: 'K5-selftest-portrait-pullback', owner: 'T-107', what: '?selftest=1 at 390x844 fails "view resolved and portrait pullback applied": ' +
      'its expected camera depth predates render/camera.js PORTRAIT_SAFE compact framing (the selftest never ran at a phone viewport before this gate)',
    selftest: (view, title) => view === 'portrait' && /^SELFTEST FAIL: view resolved and portrait pullback applied$/.test(title) },
];
// host noise: SwiftShader's driver chatter says nothing about the game
const HOST_NOISE = [/GL Driver Message \(OpenGL, Performance/, /GPU stall due to ReadPixels/];
// the game's own "art missed the boot budget" warning: on a loaded GPU-less host
// it measures the host; the art-readiness REPORT carries the number
const ART_BUDGET = /still loading after \d+ms of the \d+ms boot budget/;

const results = [];
function record(stepName, view, status, what, detail = null) {
  results.push({ step: stepName, view: view || null, status, what, detail });
  const tag = { PASS: 'PASS  ', FAIL: 'FAIL  ', KNOWN: 'KNOWN ', REPORT: 'REPORT', SKIP: 'SKIP  ' }[status];
  console.log(`play-gate ${tag} ${stepName}${view ? ' [' + view + ']' : ''}: ${what}` +
    (detail && status !== 'PASS' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''));
}
const knownSeen = new Set();
const known = (id) => { knownSeen.add(id); return KNOWN_DEFECTS.find((k) => k.id === id); };

/* ------------------------------- page probes -------------------------------- */
// run in the page: visible text that overflows its box or the viewport, and
// keyboard-only copy, under #shell / #overlay / #fail
const PAGE_TEXT = () => {
  const vw = innerWidth, vh = innerHeight;
  const visible = (el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0;
  };
  const chainVisible = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (!visible(e)) return false; return true; };
  const overflow = [];
  const copy = [];
  for (const [where, root] of [['shell', '#shell'], ['overlay', '#overlay'], ['fail', '#fail']]) {
    const box = document.querySelector(root);
    if (!box) continue;
    for (const el of box.querySelectorAll('*')) {
      if (el.childElementCount !== 0 || el.textContent.trim().length < 2 || !chainVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 || r.left < -1 || r.right > vw + 1 || r.bottom > vh + 1 || r.top < -1)
        overflow.push({ where, text: el.textContent.trim().slice(0, 60), scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth, left: Math.round(r.left), right: Math.round(r.right), vw });
    }
    if (chainVisible(box)) {
      const text = box.innerText || '';
      for (const m of text.matchAll(/press any key|press [a-z0-9]\b|\bkey(board)?s?\b|\barrows?\b|\bwasd\b|\benter\b|\bshift\b|\bspace\b/gi))
        copy.push({ where, phrase: m[0].toLowerCase() });
    }
  }
  return { vw, vh, coarse: matchMedia('(pointer: coarse)').matches, overflow, copy };
};
const PAGE_HUD = () => {
  const vw = innerWidth, vh = innerHeight;
  const panels = [...document.querySelectorAll('.hud')].filter((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0;
  }).map((el) => { const r = el.getBoundingClientRect();
    return { id: el.id, x0: Math.max(0, r.left), y0: Math.max(0, r.top), x1: Math.min(vw, r.right), y1: Math.min(vh, r.bottom) }; });
  const cell = 4; let covered = 0, central = 0;
  const cx0 = vw * 0.2, cx1 = vw * 0.8, cy0 = vh * 0.2, cy1 = vh * 0.8;
  for (let y = 0; y < vh; y += cell) for (let x = 0; x < vw; x += cell) {
    if (panels.some((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1)) {
      covered++;
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) central++;
    }
  }
  const total = Math.ceil(vw / cell) * Math.ceil(vh / cell);
  return { share: +(covered / total).toFixed(4), centralCells: central, panels: panels.map((p) => p.id) };
};
const PAGE_ART = () => {
  const p = typeof window.__HB_PRELOAD === 'function' ? window.__HB_PRELOAD() : null;
  const s = typeof window.__HB_SPRITES === 'function' ? window.__HB_SPRITES() : null;
  const h = typeof window.__HB_HULL_TEX === 'function' ? window.__HB_HULL_TEX() : null;
  const states = {};
  for (const a of (p?.assets || [])) states[a.state] = (states[a.state] || 0) + 1;
  const spriteStates = {};
  for (const k of Object.values(s?.kinds || {})) spriteStates[k.state] = (spriteStates[k.state] || 0) + 1;
  const hullFiles = Object.values(h?.files || {});
  return { preloadBudgetMs: p?.budgetMs ?? null, preloadCostMs: p?.costMs ?? null, preload: states,
    preloadNotReady: (p?.assets || []).filter((a) => a.state !== 'ready').map((a) => String(a.url).split('/').pop() + ':' + a.state).slice(0, 12),
    sprites: spriteStates, hullReady: hullFiles.filter(Boolean).length, hullFiles: hullFiles.length };
};

/* ------------------------------- the browser -------------------------------- */
let server = null;
const base = opt('--base-url') || (server = await startStaticServer(ROOT, { port: 0 })).baseUrl;
const { browser } = await launchBrowser({ channel: 'chrome' });
const contexts = new Set();
async function newPage(view) {
  const ctx = await browser.newContext({ ...VIEWS[view] && {
    viewport: VIEWS[view].viewport, deviceScaleFactor: VIEWS[view].deviceScaleFactor,
    isMobile: VIEWS[view].isMobile, hasTouch: VIEWS[view].hasTouch } });
  contexts.add(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(BOOT_MS);
  const log = { requests: new Map(), console: [], pageErrors: [] };
  page.on('request', (r) => log.requests.set(r.url(), (log.requests.get(r.url()) || 0) + 1));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.console.push({ type: m.type(), text: m.text() }); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e && e.stack || e).slice(0, 500)));
  return { page, log, close: async () => { contexts.delete(ctx); try { await ctx.close(); } catch { /* gone */ } } };
}
async function shoot(page, name) {
  if (!OUT) return null;
  const file = join(OUT, name.replace(/[^\w.-]+/g, '_') + '.png');
  try { await page.screenshot({ path: file, timeout: 60000 }); return file; } catch { return null; }
}
const cleanup = async () => {
  for (const c of contexts) { try { await c.close(); } catch { /* gone */ } }
  try { await browser.close(); } catch { /* gone */ }
  if (server) { try { await server.close(); } catch { /* gone */ } }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { cleanup().finally(() => process.exit(130)); });

// a tiny job pool: browser contexts share one Chrome; JOBS at a time
async function pool(jobs) {
  const queue = [...jobs];
  const workers = Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try { await job(); } catch (err) { record(job.stepName || 'job', job.view, 'FAIL', 'the step itself crashed', String(err && err.stack || err).slice(0, 400)); }
    }
  });
  await Promise.all(workers);
}
const job = (stepName, view, fn) => Object.assign(fn, { stepName, view });

/* -------------------------------- step: boot -------------------------------- */
function judgeConsole(stepName, view, log, { allowArtBudget = true } = {}) {
  const unknown = [], knownHits = new Set(), artBudget = [], noise = [];
  for (const m of log.console) {
    if (HOST_NOISE.some((r) => r.test(m.text))) { noise.push(m.text); continue; }
    if (ART_BUDGET.test(m.text) && allowArtBudget) { artBudget.push(m.text); continue; }
    const k = KNOWN_DEFECTS.find((d) => d.console && d.console(m.text));
    if (k) { knownHits.add(k.id); continue; }
    unknown.push(`${m.type}: ${m.text.slice(0, 200)}`);
  }
  if (log.pageErrors.length) record(stepName, view, 'FAIL', 'zero page errors', log.pageErrors.slice(0, 3));
  else record(stepName, view, 'PASS', 'zero page errors');
  if (unknown.length) record(stepName, view, 'FAIL', 'zero console errors or warnings (beyond named host noise and tracked defects)', unknown.slice(0, 5));
  else record(stepName, view, 'PASS', `zero unexplained console errors or warnings (${noise.length} host-noise lines ignored)`);
  for (const id of knownHits) record(stepName, view, 'KNOWN', known(id).what + ` (${id}, owner ${known(id).owner})`);
  return { artBudget };
}

// what the page looked like when a wait ran out (short, best effort)
const PAGE_STATE = () => ({
  readyState: document.readyState, hb: !!window.HB, state: window.HB ? window.HB.state() : null,
  gameMs: window.HB ? window.HB.gameMs() : null, booting: document.body?.classList.contains('booting') ?? null,
  failsafe: window.__HB_FAILSAFE ? { showing: window.__HB_FAILSAFE.showing(), booted: window.__HB_FAILSAFE.isBooted(),
    beats: window.__HB_FAILSAFE.beats(), errors: window.__HB_FAILSAFE.errors() } : null,
});
async function waitPhase(page, phase, fn, arg, timeout) {
  try { return await page.waitForFunction(fn, arg, { timeout }); }
  catch (err) {
    let st = null;
    try { st = await Promise.race([page.evaluate(PAGE_STATE), new Promise((r) => setTimeout(() => r('page unresponsive'), 15000))]); } catch { st = 'page gone'; }
    throw new Error(`${phase}: not reached in ${Math.round(timeout / 1000)} s (page: ${JSON.stringify(st)})`);
  }
}
async function bootStep(view) {
  const { page, log, close } = await newPage(view);
  const t0 = Date.now();
  const V = VIEWS[view];
  try {
    await page.goto(base + '/index.html', { waitUntil: 'commit', timeout: BOOT_MS });
    // a boot that failed is final: stop waiting as soon as the panel says so
    await waitPhase(page, 'the title (state MENU)', () => (window.HB && window.HB.state() === 'MENU') ||
      (window.__HB_FAILSAFE && window.__HB_FAILSAFE.showing() === 'boot'), null, BOOT_MS);
    const failedBoot = await page.evaluate(() => !window.HB && window.__HB_FAILSAFE && window.__HB_FAILSAFE.showing());
    if (failedBoot) throw new Error(`the boot failed: the failure panel shows "${failedBoot}" (page: ${JSON.stringify(await page.evaluate(PAGE_STATE))})`);
    const titleMs = Date.now() - t0;
    await page.waitForTimeout(800);
    const text = await page.evaluate(PAGE_TEXT);
    // start the run the way this device starts it
    if (V.hasTouch) await page.touchscreen.tap(Math.round(V.viewport.width / 2), Math.round(V.viewport.height / 2));
    else await page.keyboard.press('Enter');
    await waitPhase(page, `PLAYING after ${V.hasTouch ? 'a tap' : 'a key'} at the title`, () => window.HB.state() === 'PLAYING', null, BOOT_MS);
    const g0 = await page.evaluate(() => window.HB.gameMs());
    await waitPhase(page, 'the run clock advancing', (g) => window.HB.gameMs() > g, g0, BOOT_MS);
    const playMs = Date.now() - t0;
    record('boot', view, 'PASS', `the default URL boots to its title (${(titleMs / 1000).toFixed(1)} s), starts on ` +
      `${V.hasTouch ? 'a tap' : 'a key'} and plays (${(playMs / 1000).toFixed(1)} s)`);
    const fs = await page.evaluate(() => window.HB.failsafe());
    if (fs.showing || fs.halted || fs.faults) record('boot', view, 'FAIL', 'no failure panel and no faults during a healthy boot', fs);
    else record('boot', view, 'PASS', 'no failure panel and no faults during a healthy boot');
    const hud = await page.evaluate(PAGE_HUD);
    const art = await page.evaluate(PAGE_ART);
    const perf = await page.evaluate(() => window.HB.perf());
    // layout: overflow
    const unknownOverflow = text.overflow.filter((o) => !KNOWN_DEFECTS.some((k) => k.overflow && k.overflow(o)));
    const knownOverflow = text.overflow.filter((o) => KNOWN_DEFECTS.some((k) => k.overflow && k.overflow(o)));
    if (unknownOverflow.length) record('boot', view, 'FAIL', 'no visible text overflows its box or the viewport', unknownOverflow.slice(0, 4));
    else record('boot', view, 'PASS', 'no visible text overflows its box or the viewport (beyond tracked defects)');
    if (knownOverflow.length) record('boot', view, 'KNOWN', known('K1-title-overflow').what + ` (K1, owner T-105; ${knownOverflow[0].scrollWidth} px in ${knownOverflow[0].clientWidth})`);
    // device copy on a coarse pointer
    if (text.coarse) {
      const unknownCopy = text.copy.filter((c) => !KNOWN_DEFECTS.some((k) => k.copy && k.copy(c.where, c.phrase)));
      const knownCopy = text.copy.filter((c) => KNOWN_DEFECTS.some((k) => k.copy && k.copy(c.where, c.phrase)));
      if (unknownCopy.length) record('boot', view, 'FAIL', 'on a coarse pointer no visible text tells the player to press a key', unknownCopy);
      else record('boot', view, 'PASS', 'on a coarse pointer no visible text tells the player to press a key (beyond tracked defects)');
      if (knownCopy.length) record('boot', view, 'KNOWN', known('K2-keyboard-copy-on-touch').what + ` (K2, owner T-105: ${[...new Set(knownCopy.map((c) => c.phrase))].join(', ')})`);
    }
    // network: one fetch per URL
    const dupes = [...log.requests].filter(([, n]) => n > 1).map(([u, n]) => ({ url: u.replace(base, ''), n }));
    const unknownDupes = dupes.filter((d) => !KNOWN_DEFECTS.some((k) => k.dupe && k.dupe(d.url)));
    if (unknownDupes.length) record('boot', view, 'FAIL', 'no URL is fetched twice', unknownDupes.slice(0, 6));
    else record('boot', view, 'PASS', `no URL is fetched twice beyond tracked defects (${log.requests.size} URLs)`);
    if (dupes.length - unknownDupes.length) record('boot', view, 'KNOWN', known('K4-preload-double-fetch').what + ` (K4, owner T-105: ${dupes.length - unknownDupes.length} URLs)`);
    const { artBudget } = judgeConsole('boot', view, log);
    record('boot', view, 'REPORT', `HUD covers ${(hud.share * 100).toFixed(1)} % of the viewport, ${hud.centralCells} cells of the central 60 % x 60 % ` +
      `(T-105 proposes <= 10 % at 844x390; not a gate until that number is decided)`);
    const notReady = art.preloadNotReady.length;
    const artLine = `art at boot: preload ${JSON.stringify(art.preload)} (budget ${art.preloadBudgetMs} ms, gate cost ${art.preloadCostMs} ms), ` +
      `sprites ${JSON.stringify(art.sprites)}, hull ${art.hullReady}/${art.hullFiles}; ${artBudget.length} "missed the boot budget" warnings`;
    if (GPU_LESS || !notReady) record('boot', view, 'REPORT', artLine + (GPU_LESS ? ' (reported only on a GPU-less host)' : ''));
    else record('boot', view, 'FAIL', 'the shipped look arrives at boot on a GPU host', art.preloadNotReady);
    record('boot', view, 'REPORT', `frame times while booting: ${JSON.stringify(perf)}${GPU_LESS ? ' (SwiftShader: a measurement of the host)' : ''}`);
  } catch (err) {
    record('boot', view, 'FAIL', 'the default URL boots to its title and plays', String(err && err.message || err).slice(0, 500) +
      ` | after ${((Date.now() - t0) / 1000).toFixed(0)} s | page errors: ${log.pageErrors.slice(0, 2).join(' | ') || 'none'}`);
    const shot = await shoot(page, `boot-${view}`);
    if (shot) console.log('play-gate: screenshot ' + shot);
  } finally { await close(); }
}

/* ------------------------------ step: failsafe ------------------------------ */
// T-032: the panel is static markup filled by an inline script in index.html's
// head, so it must work when src/main.js never runs. Three ways it can fail to:
const FAILURES = [
  { id: 'throws', what: 'src/main.js throws while it evaluates', panel: 'boot',
    route: (route) => route.fulfill({ status: 200, contentType: 'text/javascript',
      body: "throw new Error('PLAY gate: forced boot failure (src/main.js threw during evaluation)');\n" }) },
  { id: 'rejects', what: 'work started at boot fails as a rejected promise nobody handles', panel: 'boot',
    route: (route) => route.fulfill({ status: 200, contentType: 'text/javascript',
      body: "Promise.reject(new Error('PLAY gate: forced boot failure (an unhandled rejection at boot)'));\n" }) },
  { id: '404', what: 'src/main.js is missing (404)', panel: 'boot',
    route: (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }) },
  { id: 'never-arrives', what: 'src/main.js never arrives (a boot that never finishes)', panel: 'slow',
    route: () => { /* never answered: the request hangs until the page closes */ } },
];
async function failsafeStep(view, f) {
  const { page, log, close } = await newPage(view);
  const t0 = Date.now();
  try {
    await page.route(/\/src\/main\.js(\?.*)?$/, f.route);
    // 'commit', not 'domcontentloaded': module scripts are deferred, so a
    // src/main.js that never arrives also holds DOMContentLoaded back forever
    await page.goto(base + '/index.html', { waitUntil: 'commit', timeout: BOOT_MS });
    await page.waitForFunction(() => !!window.__HB_FAILSAFE && !!document.getElementById('fail'), null, { timeout: BOOT_MS });
    const watch = await page.evaluate(() => window.__HB_FAILSAFE.watch);
    // the panel is a timer in an inline script, not render work: a loaded host
    // delays it by seconds, not minutes (measured 10.1-10.4 s for a 10 s
    // watchdog at load ~45), so the budget is the watchdog plus a fixed margin
    const budget = (watch?.bootMs || 10000) + 20000;
    let shown = null;
    try {
      await page.waitForFunction(() => document.getElementById('fail')?.classList.contains('on'), null, { timeout: budget });
      shown = await page.evaluate(() => {
        const box = document.getElementById('fail');
        const btn = document.getElementById('failBtn').getBoundingClientRect();
        const cs = getComputedStyle(box);
        return {
          title: document.getElementById('failTitle').textContent, button: document.getElementById('failBtn').textContent,
          hint: document.getElementById('failHint').textContent, kind: window.__HB_FAILSAFE.showing(),
          visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5,
          buttonInViewport: btn.width > 0 && btn.left >= 0 && btn.top >= 0 && btn.right <= innerWidth && btn.bottom <= innerHeight,
          simFrames: window.HB ? window.HB.gameMs() : 0,
          coarse: matchMedia('(pointer: coarse)').matches,
        };
      });
    } catch { shown = null; }
    const ms = Date.now() - t0;
    if (!shown) {
      record('failsafe', view, 'FAIL', `the failure panel reaches the player when ${f.what}`, `no #fail.on within ${budget} ms`);
      const shot = await shoot(page, `failsafe-${f.id}-${view}`);
      if (shot) console.log('play-gate: screenshot ' + shot);
      return;
    }
    const ok = shown.visible && shown.buttonInViewport && shown.kind === f.panel && shown.title.trim().length > 0 && shown.simFrames === 0;
    record('failsafe', view, ok ? 'PASS' : 'FAIL',
      `the failure panel reaches the player when ${f.what} — "${shown.title}" in ${(ms / 1000).toFixed(1)} s, button on screen, no sim frame run`,
      ok ? null : shown);
    // device-appropriate copy: on a coarse pointer the hint must not ask for a key
    if (shown.coarse) {
      const phrases = [...shown.hint.toLowerCase().matchAll(/press [a-z0-9]\b|\bkey(board)?s?\b|\benter\b|\bspace\b/g)].map((m) => m[0]);
      const k3 = KNOWN_DEFECTS.find((k) => k.id === 'K3-failsafe-hint-keyboard-on-touch');
      const unknownCopy = phrases.filter((ph) => !k3.copy('fail', ph));
      if (unknownCopy.length) record('failsafe', view, 'FAIL', 'on a coarse pointer the failure panel does not ask for a key', shown.hint);
      else if (phrases.length) record('failsafe', view, 'KNOWN', known(k3.id).what + ` (K3, owner T-105: "${shown.hint}")`);
      else record('failsafe', view, 'PASS', 'on a coarse pointer the failure panel does not ask for a key');
    }
    const extra = log.pageErrors.filter((e) => !e.includes('PLAY gate: forced boot failure'));
    if (extra.length) record('failsafe', view, 'FAIL', 'no page error beyond the forced one', extra.slice(0, 2));
  } finally { await close(); }
}

/* ------------------------------ step: selftest ------------------------------ */
async function selftestStep(view) {
  const { page, log, close } = await newPage(view);
  try {
    await page.goto(base + '/index.html?selftest=1', { waitUntil: 'load', timeout: BOOT_MS });
    await page.waitForFunction(() => /^SELFTEST (PASS|FAIL)/.test(document.title), null, { timeout: BOOT_MS });
    const title = await page.title();
    const k = KNOWN_DEFECTS.find((d) => d.selftest && d.selftest(view, title));
    if (/^SELFTEST PASS/.test(title)) record('selftest', view, 'PASS', `?selftest=1: ${title}`);
    else if (k) record('selftest', view, 'KNOWN', known(k.id).what + ` (${k.id}, owner ${k.owner})`);
    else record('selftest', view, 'FAIL', '?selftest=1 reports SELFTEST PASS', title);
    if (log.pageErrors.length) record('selftest', view, 'FAIL', 'zero page errors under ?selftest=1', log.pageErrors.slice(0, 2));
  } catch (err) {
    record('selftest', view, 'FAIL', '?selftest=1 reports SELFTEST PASS', String(err && err.message || err).slice(0, 300));
  } finally { await close(); }
}

/* ------------------------------ step: degrade ------------------------------- */
// The same frame-exact input schedule twice — once with the art, once with every
// request under assets/generated/ aborted at the network (a 404, a truncated
// deploy, a dead CDN) — and the sim state at the schedule's terminal tick must
// be identical. The schedule is installed before navigation and drained inside
// update() (src/pure/frame-input.js), so delivery cannot differ between runs.
const DEGRADE_TICKS = 300;                          // 5 s of game time at 60 Hz
const DEGRADE_EVENTS = [
  { t: 0, type: 'keydown', code: 'ArrowRight' }, { t: 0, type: 'keydown', code: 'KeyX' },
  ...[600, 1500, 2400, 3300, 4200].flatMap((t) => [{ t, type: 'keydown', code: 'Space' }, { t: t + 300, type: 'keyup', code: 'Space' }]),
  { t: 2000, type: 'keydown', code: 'ArrowUp' }, { t: 3000, type: 'keyup', code: 'ArrowUp' },
];
async function degradeRun(blockArt) {
  const view = 'desktop';
  const { page, log, close } = await newPage(view);
  const small = (process.env.HB_SMOKE_VIEWPORT || '').match(/^(\d+)x(\d+)$/);
  if (small) await page.setViewportSize({ width: +small[1], height: +small[2] });
  let aborted = 0;
  try {
    if (blockArt) await page.route(/\/assets\/generated\//, (route) => { aborted++; return route.abort(); });
    await page.addInitScript((boot) => {
      Object.defineProperty(globalThis, '__HULLBREAKER_INPUT_BOOTSTRAP__', { value: boot, configurable: true, writable: true });
    }, { version: 1, events: DEGRADE_EVENTS, stopAtMs: DEGRADE_TICKS * 16.667 });
    await page.goto(base + '/index.html?testapi=1&fixeddt=16.667', { waitUntil: 'load', timeout: BOOT_MS });
    await page.waitForFunction(() => window.__HULLBREAKER_TEST__ && window.__HULLBREAKER_TEST__.inputTimeline().status === 'complete',
      null, { timeout: BOOT_MS * 4 });
    const out = await page.evaluate(() => {
      const r6 = (n) => (typeof n === 'number' ? Math.round(n * 1e6) / 1e6 : n);
      const s = window.HB.snapshot();
      const ti = window.__HULLBREAKER_TEST__.inputTimeline();
      return {
        state: window.HB.state(), tick: ti.tick, stopTick: ti.stopTick, dispatched: ti.nextEvent, events: ti.eventCount,
        failsafe: window.HB.failsafe(),
        sim: JSON.stringify({
          g: r6(window.HB.gameMs()), scroll: r6(s.scrollX),
          p: [r6(s.player.x), r6(s.player.y), r6(s.player.vx), r6(s.player.vy), s.player.hp, s.player.lives, s.player.grounded, s.player.airJumpsLeft],
          k: s.kills, f: s.shotsFired, w: s.currentWeapon,
          h: (s.hostiles || []).map((e) => [e.kind, r6(e.x), r6(e.y), e.hp, e.state]),
          c: (s.capsules || []).map((c) => [c.kind, c.letter, r6(c.x), r6(c.y)]),
        }),
        art: (() => {
          const p = typeof window.__HB_PRELOAD === 'function' ? window.__HB_PRELOAD() : null;
          const states = {}; for (const a of (p?.assets || [])) states[a.state] = (states[a.state] || 0) + 1;
          const sp = typeof window.__HB_SPRITES === 'function' ? window.__HB_SPRITES() : null;
          const sprites = {}; for (const k of Object.values(sp?.kinds || {})) sprites[k.state] = (sprites[k.state] || 0) + 1;
          const hull = typeof window.__HB_HULL_TEX === 'function' ? Object.values(window.__HB_HULL_TEX().files || {}) : [];
          return { preload: states, sprites, hullReady: hull.filter(Boolean).length };
        })(),
      };
    });
    return { ...out, aborted, pageErrors: log.pageErrors, console: log.console };
  } catch (err) {
    return { error: String(err && err.message || err).slice(0, 300), aborted, pageErrors: log.pageErrors };
  } finally { await close(); }
}
async function degradeStep() {
  const [art, bare] = await Promise.all([degradeRun(false), degradeRun(true)]);
  if (art.error || bare.error) {
    record('degrade', 'desktop', 'FAIL', 'both runs (art / art blocked) reached the end of the input schedule',
      { art: art.error || 'ok', blocked: bare.error || 'ok', blockedPageErrors: bare.pageErrors?.slice(0, 2) });
    return;
  }
  const reached = (r) => r.tick === r.stopTick && r.dispatched === r.events;
  record('degrade', 'desktop', reached(art) && reached(bare) ? 'PASS' : 'FAIL',
    `both runs played the whole frame-exact schedule (${art.tick}/${art.stopTick} and ${bare.tick}/${bare.stopTick} ticks)`);
  const readyCount = (a) => (a.preload.ready || 0) + (a.sprites.ready || 0) + a.hullReady;
  record('degrade', 'desktop', bare.aborted > 0 && readyCount(bare.art) === 0 ? 'PASS' : 'FAIL',
    `with ${bare.aborted} art requests aborted the game still played and reports no art ready ` +
    `(${JSON.stringify(bare.art)} blocked vs ${JSON.stringify(art.art)} with the art)`);
  const fsOk = !bare.failsafe.showing && !bare.failsafe.halted && bare.failsafe.faults === 0;
  record('degrade', 'desktop', fsOk ? 'PASS' : 'FAIL', 'missing art never raises the failure panel or a fault', fsOk ? null : bare.failsafe);
  record('degrade', 'desktop', bare.pageErrors.length ? 'FAIL' : 'PASS', 'missing art throws no page error', bare.pageErrors.slice(0, 2));
  const same = art.sim === bare.sim;
  // Honesty: if the art run's art never arrived either (a CPU-starved
  // SwiftShader host misses the 2.5 s boot budget), the two runs are the same
  // run and the comparison proves nothing about art-loaded play. A divergence
  // still fails; an identical pair is then only REPORTED. The headless twin in
  // tools/pathcheck/t-120-determinism-and-art-blind-sim.mjs is the binding half.
  if (!same) record('degrade', 'desktop', 'FAIL',
    'missing art does not change play: the sim state at the terminal tick is identical with and without the art',
    { art: art.sim.slice(0, 300), blocked: bare.sim.slice(0, 300) });
  else if (readyCount(art.art) === 0) record('degrade', 'desktop', 'REPORT',
    'missing art does not change play — INCONCLUSIVE here: the art run\'s art also missed the boot budget ' +
    `(${JSON.stringify(art.art)}), so both runs played without it; identical sim state, but nothing was compared`);
  else record('degrade', 'desktop', 'PASS',
    `missing art does not change play: the sim state at the terminal tick is identical with ${readyCount(art.art)} art surfaces ready and with none`);
}

/* ------------------------------- step: smoke -------------------------------- */
function runNode(args, cwd) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = ''; child.stdout.on('data', (c) => { out += c; }); child.stderr.on('data', (c) => { out += c; });
    child.on('close', (code) => resolveRun({ code, out }));
  });
}
async function smokeStep(script, budgetMs) {
  const runDir = join(OUT || join(ROOT, 'tools', 'playtest', 'runs'), 'smoke-' + script.replace(/\.json$/, ''));
  const flakes = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const args = ['run.mjs', 'scripts/' + script, '--deterministic', '--max-runtime-ms', String(budgetMs),
      '--base-url', base, '--out', runDir];
    if (process.env.HB_SMOKE_VIEWPORT) args.push('--viewport', process.env.HB_SMOKE_VIEWPORT);
    const r = await runNode(args, join(ROOT, 'tools', 'playtest'));
    const v = r.code === 0 ? await runNode([join(HERE, 'smoke-verdict.mjs'), join(runDir, 'report.json')], ROOT) : { code: 1, out: r.out.split('\n').slice(-4).join(' | ') };
    if (v.code === 0) {
      record('smoke', null, 'PASS', `${script}: ${v.out.trim()}` + (attempt > 1 ? ` — on attempt ${attempt} of 3 (${flakes.join('; ')})` : ''));
      return;
    }
    flakes.push(`attempt ${attempt}: ${v.out.trim().slice(0, 200)}`);
  }
  record('smoke', null, 'FAIL', `${script} completes in three attempts (three failures is a regression, not flake)`, flakes);
}

/* -------------------------------- step: perf -------------------------------- */
async function perfStep() {
  if (GPU_LESS) {
    record('perf', null, 'REPORT', 'frame budget is report-only on this GPU-less host (HB_GATE_SKIP_BROWSER_PROBE=1); ' +
      'the boot steps above carry the frame times SwiftShader measured');
    return;
  }
  const r = await runNode([join(ROOT, 'tools', 'pathcheck.mjs'), '--tier', 'play'], ROOT);
  const last = r.out.trim().split('\n').pop();
  record('perf', null, r.code === 0 ? 'PASS' : 'FAIL', `the real-browser render-submission probe (pathcheck --tier play): ${last}`,
    r.code === 0 ? null : r.out.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 4));
}

/* --------------------------------- the run ---------------------------------- */
const t0 = Date.now();
console.log(`play-gate: ${base} — views ${VIEW_IDS.join(', ')}; ${GPU_LESS ? 'GPU-less host (perf report-only)' : 'GPU host'}; ` +
  `DPR ${DPR_OVERRIDE ? DPR_OVERRIDE + ' for every viewport (HB_PLAY_DPR / GPU-less default)' : 'native (1 desktop, 3 phones)'}; ` +
  `boot budget ${BOOT_MS} ms; ${JOBS} parallel contexts; load ${loadavg().map((x) => x.toFixed(1)).join(' ')} on ${cpus().length} cores`);
if (OUT) mkdirSync(OUT, { recursive: true });
try {
  const jobs = [];
  if (step('boot')) for (const v of VIEW_IDS) jobs.push(job('boot', v, () => bootStep(v)));
  if (step('failsafe')) for (const v of VIEW_IDS) for (const f of FAILURES) jobs.push(job('failsafe', v, () => failsafeStep(v, f)));
  if (step('selftest')) for (const v of VIEW_IDS) jobs.push(job('selftest', v, () => selftestStep(v)));
  if (step('degrade')) jobs.push(job('degrade', 'desktop', () => degradeStep()));
  await pool(jobs);
  if (step('smoke') && !argv.includes('--skip-smoke')) {
    // the harness scripts run one at a time: each owns its own Chrome
    await smokeStep('mid-route.json', 15000);
    await smokeStep('transform-slice.json', 20000);
    await smokeStep('default-url-smoke.json', 15000);
  } else if (step('smoke')) record('smoke', null, 'SKIP', 'smoke skipped (--skip-smoke)');
  if (step('perf')) await perfStep();
} finally {
  await cleanup();
}
for (const k of KNOWN_DEFECTS) {
  const relevant = (k.overflow && step('boot')) || (k.copy && (step('boot') || step('failsafe'))) ||
    ((k.dupe || k.console) && step('boot')) || (k.selftest && step('selftest'));
  if (relevant && !knownSeen.has(k.id) && VIEW_IDS.length === 3 && !ONLY)
    console.log(`play-gate note: tracked defect ${k.id} (${k.owner}) was not observed on this run — if its fix landed, delete it from KNOWN_DEFECTS`);
}
const count = (s) => results.filter((r) => r.status === s).length;
if (OUT) writeFileSync(join(OUT, 'play-gate.json'), JSON.stringify({
  tool: 'tools/orch/play-gate.mjs', base, when: new Date().toISOString(), ms: Date.now() - t0, gpuLess: GPU_LESS,
  host: { cpus: cpus().length, loadavg: loadavg() }, views: VIEW_IDS, results,
}, null, 1) + '\n');
console.log(`play-gate: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('KNOWN')} known (tracked), ` +
  `${count('REPORT')} reported, ${count('SKIP')} skipped in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(count('FAIL') ? 1 : 0);
