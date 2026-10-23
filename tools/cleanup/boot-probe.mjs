#!/usr/bin/env node
/* boot-probe.mjs — the T-121 cleanup lane's behaviour-neutrality probe.
 *
 * Boots ONE served tree in headless Chrome and records what a player-facing
 * deletion could break, so a base tree and a branch tree can be compared:
 *
 *   plain  /index.html?<query> exactly as a player opens it: wait for the
 *          title, start the run the way a player does (Enter on desktop, a
 *          tap with --touch), wait for PLAYING, let it run --run-ms of real
 *          time. Records page errors, console errors/warnings, failed or
 *          4xx/5xx requests, and every same-origin request path.
 *   frame  /index.html?testapi=1&fixeddt=16.667&<query> with an EMPTY
 *          frame-input schedule that freezes the simulation at --stop-ms
 *          (src/pure/frame-input.js), then screenshots the frozen frame
 *          twice (--settle-ms apart) so render-side noise is measured, and
 *          records window.HB.snapshot() at the frozen tick, which art made
 *          the boot gate, and what sits in every bridge slot (owner, juice
 *          and audio wrappers — the audible half a screenshot cannot see).
 *
 *   node tools/cleanup/boot-probe.mjs --base-url http://127.0.0.1:8771 \
 *        --out /tmp/probe-branch [--viewport 1280x720] [--touch] \
 *        [--query 'slice=transform'] [--mode plain|frame|both] [--stop-ms 1000]
 *   node tools/cleanup/boot-probe.mjs --compare <dirA> <dirB>
 *
 * --compare diffs two probe directories: request sets, error counts, the
 * frozen-tick sim snapshot (byte-equal JSON or not), the bridge wiring, and
 * the screenshots (changed-pixel share and max channel delta, against each
 * side's own same-tick noise; judged only when both kept the same art).
 *
 * Zero effect on the shipped game: it only reads a served tree. Honesty notes
 * in tools/cleanup/README.md.                                              */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';
import { decodePng } from '../assets/lib/png.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes('--' + name);

if (flag('compare')) {
  const i = argv.indexOf('--compare');
  process.exit(compare(resolve(argv[i + 1]), resolve(argv[i + 2])));
}

const BASE = opt('base-url', null);
if (!BASE) { console.error('need --base-url <origin> (or --compare <dirA> <dirB>)'); process.exit(2); }
const OUT = resolve(opt('out', 'boot-probe-out'));
const [VW, VH] = opt('viewport', '1280x720').split('x').map(Number);
const TOUCH = flag('touch');
const QUERY = opt('query', '');
const MODE = opt('mode', 'both');
const STOP_MS = Number(opt('stop-ms', '1000'));
const RUN_MS = Number(opt('run-ms', '4000'));
const SETTLE_MS = Number(opt('settle-ms', '600'));
const BOOT_MS = Number(process.env.HB_PROBE_BOOT_MS || opt('boot-ms', '180000'));
// A frozen-tick capture needs stop-ms/16.667 rendered frames; under SwiftShader on a
// loaded host one frame can take seconds, so this wait is its own (long) budget.
const FRAME_MS = Number(opt('frame-ms', '900000'));
const SHOT = { timeout: 180000 };
mkdirSync(OUT, { recursive: true });

function attach(page, origin, rec) {
  page.on('pageerror', (e) => rec.pageErrors.push(String(e && e.stack || e)));
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') rec.consoleErrors.push(m.text());
    else if (t === 'warning') rec.consoleWarnings.push(m.text());
  });
  page.on('requestfailed', (r) => rec.failed.push(`${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('response', (r) => {
    const u = r.url();
    if (u.startsWith(origin)) {
      const path = u.slice(origin.length).split('?')[0];
      rec.requests.push(path);
      if (r.status() >= 400) rec.badStatus.push(`${r.status()} ${path}`);
    }
  });
}

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: TOUCH,
  });
  const page = await context.newPage();
  return { context, page };
}

async function plain(browser) {
  const rec = { mode: 'plain', url: null, pageErrors: [], consoleErrors: [], consoleWarnings: [],
    failed: [], badStatus: [], requests: [], reachedPlaying: false, states: [] };
  const { context, page } = await newPage(browser);
  const origin = BASE.replace(/\/$/, '');
  attach(page, origin, rec);
  rec.url = `${origin}/index.html${QUERY ? '?' + QUERY : ''}`;
  const t0 = Date.now();
  try {
    await page.goto(rec.url, { waitUntil: 'load', timeout: BOOT_MS });
    await page.waitForFunction(() => window.HB && typeof window.HB.state === 'function', null, { timeout: BOOT_MS });
    rec.states.push(await page.evaluate(() => window.HB.state()));
    if (rec.states[0] === 'MENU') {
      if (TOUCH) await page.touchscreen.tap(Math.round(VW / 2), Math.round(VH / 2));
      else await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.HB.state() === 'PLAYING', null, { timeout: BOOT_MS });
    rec.reachedPlaying = true;
    rec.bootWallMs = Date.now() - t0;
    await page.waitForTimeout(RUN_MS);
    rec.states.push(await page.evaluate(() => window.HB.state()));
    rec.failsafe = await page.evaluate(() => window.__HB_FAILSAFE ? {
      booted: window.__HB_FAILSAFE.isBooted(), showing: window.__HB_FAILSAFE.showing(),
      errors: window.__HB_FAILSAFE.errors() } : null);
    await page.screenshot({ path: join(OUT, 'plain.png'), ...SHOT });
  } catch (e) {
    rec.fatal = String(e && e.message || e);
  }
  await context.close();
  rec.requests = [...new Set(rec.requests)].sort();
  return rec;
}

// What sits in every src/sim/bridge.js slot after boot, outermost first:
// juice wrappers (they carry their tag and a link to what they wrap), the
// audio module's wrappers (recognised by their source shape), the bridge's
// own no-op, or an owner function (by name). Owners install in
// initializeViewRegistry() AFTER src/ui/audio.js has wrapped the slots at
// import time, so deleting or adding an owner install changes which audio
// observers survive — audible, invisible to a screenshot (T-121 batch 4).
function bridgeWiring(page) {
  return page.evaluate(async () => {
    const { view } = await import('/src/sim/bridge.js');
    const PREV = Symbol.for('hullbreaker.previousBridge');
    const OBS = Symbol.for('hullbreaker.juiceObserver');
    const kind = (f) => {
      if (f[OBS]) return `juice:${f[OBS]}`;
      const s = f.toString();
      if (/\bprev(?:ious)?\([a-j, ]+\);\s*if \(dead \|\| !ctx\)/.test(s)) return 'audio-wrapper';
      if (s === '() => {}') return 'bridge-noop';
      return `fn:${f.name || '(anonymous)'}`;
    };
    const chain = (fn) => {
      const out = [];
      for (let f = fn, i = 0; i < 12 && typeof f === 'function'; i++, f = f[PREV]) out.push(kind(f));
      return out;
    };
    const res = {};
    for (const [group, hooks] of Object.entries(view)) {
      if (typeof hooks === 'function') res[group] = chain(hooks);
      else for (const [name, f] of Object.entries(hooks)) res[`${group}.${name}`] = chain(f);
    }
    return res;
  });
}

async function frame(browser) {
  const rec = { mode: 'frame', url: null, pageErrors: [], consoleErrors: [], consoleWarnings: [],
    failed: [], badStatus: [], requests: [], stopMs: STOP_MS };
  const { context, page } = await newPage(browser);
  const origin = BASE.replace(/\/$/, '');
  attach(page, origin, rec);
  await page.addInitScript((stopAtMs) => {
    globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__ = { version: 1, events: [], stopAtMs };
  }, STOP_MS);
  rec.url = `${origin}/index.html?testapi=1&fixeddt=16.667${QUERY ? '&' + QUERY : ''}`;
  try {
    await page.goto(rec.url, { waitUntil: 'load', timeout: BOOT_MS });
    // Resolve on completion OR on a failsafe panel: under SwiftShader on a loaded
    // host a single frame can outlast the 4 s freeze watchdog, which halts the
    // loop for good — waiting longer would only hide that.
    await page.waitForFunction(() => {
      const t = globalThis.__HULLBREAKER_TEST__;
      const f = globalThis.__HB_FAILSAFE;
      return (t && t.inputTimeline().status === 'complete') || (f && f.showing());
    }, null, { timeout: FRAME_MS, polling: 500 });
    rec.failsafe = await page.evaluate(() => globalThis.__HB_FAILSAFE
      ? { showing: globalThis.__HB_FAILSAFE.showing(), errors: globalThis.__HB_FAILSAFE.errors() } : null);
    if (rec.failsafe && rec.failsafe.showing) throw new Error('failsafe panel up: ' + rec.failsafe.showing);
    // two rAFs so the frozen frame has been drawn at least once more
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    rec.timeline = await page.evaluate(() => {
      const t = globalThis.__HULLBREAKER_TEST__.inputTimeline();
      return { status: t.status, tick: t.tick, stopTick: t.stopTick, error: t.error || null };
    });
    rec.snapshot = await page.evaluate(() => window.HB.snapshot());
    // which art made the shared boot gate: on a loaded host an asset that
    // misses the budget is dropped for the session (the documented degrade
    // path), so two loads of the SAME tree can render different frames
    rec.art = await page.evaluate(() => (window.__HB_PRELOAD ? window.__HB_PRELOAD().assets : [])
      .map((a) => [a.url.replace(location.origin, ''), a.state]).sort());
    rec.bridge = await bridgeWiring(page);
    await page.screenshot({ path: join(OUT, 'frame-a.png'), ...SHOT });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(OUT, 'frame-b.png'), ...SHOT });
  } catch (e) {
    rec.fatal = String(e && e.message || e);
  }
  await context.close();
  rec.requests = [...new Set(rec.requests)].sort();
  return rec;
}

const { browser } = await launchBrowser({ channel: 'chrome', headed: false });
const result = { base: BASE, viewport: `${VW}x${VH}`, touch: TOUCH, query: QUERY, measuredAt: new Date().toISOString() };
try {
  if (MODE === 'plain' || MODE === 'both') result.plain = await plain(browser);
  if (MODE === 'frame' || MODE === 'both') result.frame = await frame(browser);
} finally {
  await browser.close();
}
if (result.frame && existsSync(join(OUT, 'frame-a.png')) && existsSync(join(OUT, 'frame-b.png')))
  result.frame.selfNoise = pixelDiff(join(OUT, 'frame-a.png'), join(OUT, 'frame-b.png'));
writeFileSync(join(OUT, 'probe.json'), JSON.stringify(result, null, 1));
for (const m of ['plain', 'frame']) {
  const r = result[m];
  if (!r) continue;
  console.log(`${m}: ${r.fatal ? 'FATAL ' + r.fatal : 'ok'}  pageErrors ${r.pageErrors.length}  consoleErrors ${r.consoleErrors.length}  ` +
    `failed ${r.failed.length}  badStatus ${r.badStatus.length}  requests ${r.requests.length}` +
    (m === 'plain' ? `  reachedPlaying ${r.reachedPlaying}` : `  tick ${r.timeline && r.timeline.tick}  selfNoise ${r.selfNoise ? r.selfNoise.changedPixelPercent + '%' : 'n/a'}`));
}
const bad = ['plain', 'frame'].some((m) => result[m] && (result[m].fatal || result[m].pageErrors.length || result[m].consoleErrors.length)) ||
  (result.plain && !result.plain.reachedPlaying);
process.exit(bad ? 1 : 0);

function pixelDiff(a, b) {
  const A = decodePng(a), B = decodePng(b);
  if (A.width !== B.width || A.height !== B.height) return { sameSize: false };
  let changed = 0, maxDelta = 0, total = 0;
  for (let i = 0; i < A.rgba.length; i += 4) {
    let c = false;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(A.rgba[i + k] - B.rgba[i + k]);
      if (d) c = true;
      if (d > maxDelta) maxDelta = d;
      total += d;
    }
    if (c) changed++;
  }
  const px = A.rgba.length / 4;
  return { sameSize: true, pixels: px, changedPixels: changed,
    changedPixelPercent: +(changed / px * 100).toFixed(4), maxDelta,
    meanChannelDelta: +(total / (px * 3)).toFixed(5), identical: changed === 0 };
}

function compare(dirA, dirB) {
  const A = JSON.parse(readFileSync(join(dirA, 'probe.json'), 'utf8'));
  const B = JSON.parse(readFileSync(join(dirB, 'probe.json'), 'utf8'));
  const out = { a: dirA, b: dirB };
  let verdict = true;
  for (const m of ['plain', 'frame']) {
    if (!A[m] || !B[m]) continue;
    const ra = new Set(A[m].requests), rb = new Set(B[m].requests);
    const onlyA = [...ra].filter((x) => !rb.has(x)), onlyB = [...rb].filter((x) => !ra.has(x));
    out[m] = {
      errorsA: A[m].pageErrors.length + A[m].consoleErrors.length,
      errorsB: B[m].pageErrors.length + B[m].consoleErrors.length,
      requestsOnlyInA: onlyA, requestsOnlyInB: onlyB,
      fatalA: A[m].fatal || null, fatalB: B[m].fatal || null,
    };
    if (out[m].errorsB > out[m].errorsA || out[m].fatalB) verdict = false;
  }
  if (A.frame && B.frame && A.frame.snapshot && B.frame.snapshot) {
    // Presentation telemetry (asset residency, draw counts, frame timing) is
    // load-dependent by design; everything else in HB.snapshot() is sim state.
    const PRESENTATION = ['perf', 'post', 'adaptiveFidelity', 'actionVfx', 'viewInit', 'juice'];
    const sim = (s) => JSON.stringify(Object.fromEntries(Object.entries(s)
      .filter(([k]) => !PRESENTATION.includes(k))));
    out.frame.simSnapshotIdentical = sim(A.frame.snapshot) === sim(B.frame.snapshot);
    out.frame.tickA = A.frame.timeline && A.frame.timeline.tick;
    out.frame.tickB = B.frame.timeline && B.frame.timeline.tick;
    // unknown (null) when either probe predates art recording — never a match
    out.frame.artStatesMatch = A.frame.art && B.frame.art
      ? JSON.stringify(A.frame.art) === JSON.stringify(B.frame.art) : null;
    if (!out.frame.artStatesMatch && A.frame.art && B.frame.art) {
      const mb = new Map(B.frame.art);
      out.frame.artDiffers = A.frame.art.filter(([u, st]) => mb.get(u) !== st)
        .map(([u, st]) => `${u}: ${st} -> ${mb.get(u)}`);
    }
    out.frame.pixels = pixelDiff(join(dirA, 'frame-a.png'), join(dirB, 'frame-a.png'));
    out.frame.noiseA = A.frame.selfNoise || null;
    out.frame.noiseB = B.frame.selfNoise || null;
    // bridge wiring: null (unknown) when either probe predates its recording
    if (A.frame.bridge && B.frame.bridge) {
      const slots = [...new Set([...Object.keys(A.frame.bridge), ...Object.keys(B.frame.bridge)])];
      const differs = slots.filter((k) =>
        JSON.stringify(A.frame.bridge[k]) !== JSON.stringify(B.frame.bridge[k]))
        .map((k) => `${k}: ${JSON.stringify(A.frame.bridge[k] || null)} -> ${JSON.stringify(B.frame.bridge[k] || null)}`);
      out.frame.bridgeWiringIdentical = differs.length === 0;
      if (differs.length) out.frame.bridgeDiffers = differs;
      if (differs.length) verdict = false;
    } else out.frame.bridgeWiringIdentical = null;
    // The other load-dependent boot outcomes that change pixels without any
    // code difference: the bloom pass has its own boot budget (src/render/
    // post.js) and falls back to direct rendering when it misses it, and the
    // adaptive-fidelity governor may lower the resolution scale.
    const boot = (f) => {
      const p = f.snapshot.post || {};
      return { post: p.status ?? null, adaptiveScale: p.resources ? p.resources.adaptiveScale : null,
        drawingBuffer: p.drawingBuffer ?? null,
        fidelityLevel: f.snapshot.adaptiveFidelity ? f.snapshot.adaptiveFidelity.level : null };
    };
    const bootA = boot(A.frame), bootB = boot(B.frame);
    const bootMatch = JSON.stringify(bootA) === JSON.stringify(bootB);
    if (!bootMatch) out.frame.bootStateDiffers = { a: bootA, b: bootB };
    out.frame.presentationMatch = out.frame.artStatesMatch === null ? null
      : out.frame.artStatesMatch && bootMatch;
    if (!out.frame.simSnapshotIdentical) verdict = false;
    if (out.frame.presentationMatch && !out.frame.pixels.identical) verdict = false;
    out.frame.pixelVerdict = out.frame.presentationMatch === null
      ? 'inconclusive: art states were not recorded on both sides'
      : out.frame.presentationMatch
        ? (out.frame.pixels.identical ? 'identical' : 'DIFFERENT with matching art and boot states')
        : 'inconclusive: the two boots kept different art or boot states (see artDiffers / ' +
          'bootStateDiffers); re-run for a matched pair';
  }
  out.verdict = verdict ? 'NEUTRAL (no new errors, same frozen-tick sim snapshot' +
    (out.frame && out.frame.bridgeWiringIdentical ? ', same bridge wiring' : '') +
    (out.frame && out.frame.presentationMatch ? ', identical frame)' : ')') : 'DIFFERENT';
  console.log(JSON.stringify(out, null, 1));
  return verdict ? 0 : 1;
}
