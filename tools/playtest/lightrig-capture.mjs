// lightrig-capture.mjs — dev-only evidence rig for the T-047 light pass
// (docs/decisions.md entry 18: "a real light rig, including shadow maps",
// tone mapping, and the conditions attached to saying yes).
//
// It answers three questions with numbers instead of taste:
//
//   1. FRAMES — what the shipped FAR view looks like during real combat,
//      captured at the SAME sim moments for every rig variant, so a
//      before/after pair differs only in lighting.
//   2. VALUE  — Rec.709 luma over the captured frame, whole-frame and in
//      three horizontal bands, so decisions.md entry 14 ("too dark" — do not
//      re-darken the frame) is a measurement rather than an opinion, and so
//      the audit's "sky renders brighter than the deck" finding can be
//      re-checked after the rig changes.
//   3. COST   — frame time under the 256-projectile stress path with vsync
//      DISABLED, plus renderer.info draw calls / triangles for the shadow
//      pass. tools/playtest/juice-stress.mjs is the canonical 60fps gate and
//      stays untouched; this is the sensitivity probe beside it (see honesty
//      notes).
//
//   node lightrig-capture.mjs --tag before
//   node lightrig-capture.mjs --tag after --variants ship=,flat=%26light=flat
//   node lightrig-capture.mjs --tag after --perf
//
// Output: artifacts/lightrig/<tag>/ at the repo root the script runs from
// (the harness's static server serves that root, so a worktree serves
// itself). Reuses tools/playtest's playwright-core and tools/assets/lib/png.mjs.
//
// HONESTY NOTES, in the order they matter:
//   * FRAME EXACTNESS. Each frame is captured with the game PAUSED (KeyP)
//     at a sim-time mark under ?fixeddt=16, so the shutter is not racing the
//     simulation: the recorded `gameMsAtShot` is the state the pixels show.
//     Every capture records it, plus the live hostile count, so "during real
//     combat" is a checkable claim and not a caption.
//   * VSYNC. juice-stress.mjs reads a vsync-locked page: on a 120Hz panel a
//     perfect frame reads 8.33ms no matter how much work it does, so it can
//     prove "no frame was late" but cannot show a 2ms regression. This
//     script's --perf mode launches Chrome with --disable-gpu-vsync
//     --disable-frame-rate-limit, so avgMs becomes the real cost of a frame
//     and a regression is visible. Those numbers are NOT the 60fps gate —
//     they are uncapped and therefore stricter; the gate is juice-stress.
//   * ONE MACHINE. Headless Chrome at 1280x800 on a development Mac. This is
//     evidence about the code's per-frame work, not a claim about any
//     particular target device.
//   * LUMA IS NOT LIGHTNESS. `L` here is Rec.709 luma on sRGB bytes
//     (0.2126R + 0.7152G + 0.0722B), not CIE L*. It is used only to compare
//     two frames measured the same way.
//   * BANDS ARE GEOMETRY, NOT SEMANTICS. The "sky"/"mid"/"deck" bands are
//     fixed row ranges of the frame, chosen to skip the HUD strip. On a
//     frame where the route climbs, some deck lands in the mid band. Read
//     them as a coarse vertical value profile, not as per-object readings.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { decodePng } from '../assets/lib/png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const VIEWPORT = { width: 1280, height: 800 };
const FIXED_DT = 16;                     // ms of sim time per frame (?fixeddt=)
// Three moments on the shipped default six-face run at the FAR default view.
// Chosen for what is on screen, not for the clock: this rig's crude policy
// (hold right, hold fire, tap jump) keeps 2-5 hostiles live from ~1s and runs
// out of lives at ~10.5s, so every mark lands inside a live combat run.
const MARKS = [3000, 6000, 9000];
const PERF_WARM_MS = 1500;
const PERF_RUN_MS = 5000;

function parseArgs(argv) {
  const out = { tag: 'run', perf: false, variants: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') out.tag = argv[++i];
    // serve a DIFFERENT tree than the one this script lives in — how a
    // before/after pair is taken against another commit without editing code
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--perf') out.perf = true;
    else if (a === '--shadowcost') out.shadowcost = true;
    else if (a === '--variants') out.variants = argv[++i];
    else if (a === '--marks') out.marks = argv[++i].split(',').map(Number);
    else throw new Error('unknown argument: ' + a);
  }
  return out;
}

// "ship=,flat=%26light=flat" → [{label:'ship', extra:''}, …]. The extra is
// URL-decoded so a shell can pass &-joined query fragments without quoting.
function parseVariants(spec) {
  if (!spec) return [{ label: 'ship', extra: '' }];
  return spec.split(',').map((pair) => {
    const eq = pair.indexOf('=');
    const label = eq < 0 ? pair : pair.slice(0, eq);
    const extra = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    return { label, extra };
  });
}

/* ------------------------------ luma ------------------------------- */

function lumaStats(file) {
  const { width, height, rgba } = decodePng(file);
  const all = [];
  const bands = {
    // rows 0-10% are the HUD strip; skip them entirely
    sky: { y0: Math.round(height * 0.12), y1: Math.round(height * 0.35), vals: [] },
    mid: { y0: Math.round(height * 0.35), y1: Math.round(height * 0.70), vals: [] },
    deck: { y0: Math.round(height * 0.70), y1: Math.round(height * 0.95), vals: [] },
  };
  const hist = new Array(256).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const L = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
      hist[Math.min(255, Math.round(L))]++;
      all.push(L);
      for (const b of Object.values(bands)) if (y >= b.y0 && y < b.y1) b.vals.push(L);
    }
  }
  const summary = (vals) => {
    const s = Float64Array.from(vals).sort();
    const at = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
    let sum = 0;
    for (const v of s) sum += v;
    return {
      mean: +(sum / s.length).toFixed(1),
      p05: at(0.05), p50: at(0.5), p95: at(0.95), p99: at(0.99),
      above200: +(s.reduce((n, v) => n + (v > 200 ? 1 : 0), 0) / s.length).toFixed(4),
      below40: +(s.reduce((n, v) => n + (v < 40 ? 1 : 0), 0) / s.length).toFixed(4),
    };
  };
  const skyMean = summary(bands.sky.vals).mean;
  return {
    width, height,
    frame: summary(all),
    sky: summary(bands.sky.vals),
    mid: summary(bands.mid.vals),
    deck: summary(bands.deck.vals),
    /* The audit's real finding was not "the deck is dark", it was "nothing in
       the frame reads as LIT": scene.background and fog are drawn raw, so the
       haze is a fixed value every surface is judged against, and in the
       shipped grey-box almost no surface cleared it. This is that number —
       the share of the frame brighter than the backdrop band — measured the
       same way on both sides of a comparison. */
    aboveSky: +(all.reduce((n, v) => n + (v > skyMean ? 1 : 0), 0) / all.length).toFixed(4),
    // the audit's headline finding, as one number per frame: positive means
    // the backdrop renders BRIGHTER than the deck, i.e. the scene reads unlit
    skyMinusDeck: +(summary(bands.sky.vals).mean - summary(bands.deck.vals).mean).toFixed(1),
  };
}

/* ---------------------------- captures ----------------------------- */

/* Runs IN THE PAGE. Every input is keyed to the game's OWN clock, never to
   wall time, and ?fixeddt= makes that clock advance by a constant per frame —
   so two builds given the same marks play the same run, tick for tick, and a
   before/after pair differs ONLY in pixels. Wall-clock tapping (what this rig
   did first) diverged the two runs by 1.8 tiles of RIG travel by the 6s mark,
   which is enough to make two frames look different for reasons that have
   nothing to do with lighting.

   The policy is deliberately crude — hold right, hold fire, jump on a fixed
   sim-time cadence — because its job is to put a live combat frame on screen,
   not to play well. It also owns the shutter: the game is PAUSED from in here
   at the first frame whose gameMs crosses a mark, so the capture is exact
   rather than however many frames the round trip cost. */
function simTimeDriver(marks) {
  const key = (code, down) =>
    dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const JUMP_EVERY_MS = 700;                 // sim time, not wall time
  const JUMP_HOLD_MS = 130;                  // held = the higher jump arc
  let held = false, jumpDown = false, slotDown = -1, next = 0;
  globalThis.__HB_STOP__ = () => { globalThis.__HB_DRIVE__ = false; };
  globalThis.__HB_RESUME__ = () => { key('KeyP', true); key('KeyP', false); };
  globalThis.__HB_DRIVE__ = true;
  const step = () => {
    if (!globalThis.__HB_DRIVE__) return;
    requestAnimationFrame(step);
    if (globalThis.HB.state() !== 'PLAYING') return;
    const ms = globalThis.HB.gameMs();
    if (!held) { key('ArrowRight', true); key('KeyJ', true); held = true; }
    const slot = Math.floor(ms / JUMP_EVERY_MS);
    if (slot !== slotDown && !jumpDown) { key('Space', true); jumpDown = true; slotDown = slot; }
    else if (jumpDown && ms - slot * JUMP_EVERY_MS > JUMP_HOLD_MS) { key('Space', false); jumpDown = false; }
    if (next < marks.length && ms >= marks[next]) { next++; key('KeyP', true); key('KeyP', false); }
  };
  requestAnimationFrame(step);
}

async function captureVariant(base, variant, outDir, marks) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location && m.location();
    if (loc && /\/favicon\.ico$/.test(loc.url || '')) return;    // the page ships no favicon
    errors.push(m.text());
  });

  const url = base + '/index.html?testapi=1&shell=0&fixeddt=' + FIXED_DT + variant.extra;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 8000 });

  const frames = [];
  await page.evaluate(simTimeDriver, marks);
  for (const mark of marks) {
    await page.waitForFunction((m) => {
      const st = globalThis.HB.state();
      if (st !== 'PLAYING' && st !== 'PAUSED') throw new Error('run ended: ' + st);
      return st === 'PAUSED' && globalThis.HB.gameMs() >= m;
    }, mark, { timeout: 60000 });
    // #overlay is the PAUSED panel: the freeze is a shutter trick, so its
    // banner must not land in the frame the operator judges (or in the luma).
    // The HUD stays — it is part of every shipped frame.
    await page.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
    const file = join(outDir, variant.label + '-' + mark + 'ms.png');
    await page.screenshot({ path: file });
    await page.evaluate(() => { document.getElementById('overlay').style.display = ''; });
    const snap = await page.evaluate(() => {
      const s = globalThis.HB.snapshot();
      return {
        gameMs: globalThis.HB.gameMs(),
        scrollX: globalThis.HB.scrollX(),
        player: { x: s.player.x, y: s.player.y },
        hostilesLive: (s.hostiles || []).length,
        kills: globalThis.HB.kills(),
        view: globalThis.HB.view(),
      };
    });
    await page.evaluate(() => globalThis.__HB_RESUME__());
    await page.waitForFunction(() => globalThis.HB.state() === 'PLAYING', null, { timeout: 4000 });
    frames.push({ mark, file: file.replace(repoRoot + '/', ''), ...snap, luma: lumaStats(file) });
    console.log('  ' + variant.label + ' @' + mark + 'ms  hostiles=' + snap.hostilesLive +
      '  L(frame)=' + frames[frames.length - 1].luma.frame.mean +
      '  aboveSky=' + (frames[frames.length - 1].luma.aboveSky * 100).toFixed(1) + '%' +
      '  p95=' + frames[frames.length - 1].luma.frame.p95);
  }
  await page.evaluate(() => globalThis.__HB_STOP__());

  // renderer draw-call accounting for the same page, unpaused and settled
  await page.waitForTimeout(300);
  const info = await page.evaluate(async () => {
    const S = await import('/src/render/scene.js');
    const r = S.renderer.info.render;
    let casters = 0, receivers = 0, meshes = 0;
    S.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      meshes++;
      if (o.castShadow) casters++;
      if (o.receiveShadow) receivers++;
    });
    return {
      calls: r.calls, triangles: r.triangles, frame: r.frame,
      shadowMapEnabled: !!S.renderer.shadowMap.enabled,
      toneMapping: S.renderer.toneMapping,
      toneMappingExposure: S.renderer.toneMappingExposure,
      outputColorSpace: S.renderer.outputColorSpace,
      lights: (() => {
        const out = [];
        S.scene.traverse((o) => {
          if (o.isLight) out.push({ type: o.type, intensity: o.intensity, castShadow: !!o.castShadow });
        });
        return out;
      })(),
      meshes, casters, receivers,
    };
  });
  await browser.close();
  return { url: url.replace(base, ''), frames, info, errors };
}

/* ------------------------------ perf ------------------------------- */

// the same injected load juice-stress.mjs uses, so the two readings describe
// the same scene: 60 projectiles/frame through the game's own fireWeapon
function stressLoop() {
  return (async () => {
    const [W, FX, C, PL] = await Promise.all([
      import('/src/sim/weapons.js'),
      import('/src/render/fx.js'),
      import('/src/config.js'),
      import('/src/sim/player.js'),
    ]);
    globalThis.__STRESS_ON__ = true;
    const J = C.CONFIG.juice;
    const step = () => {
      if (!globalThis.__STRESS_ON__) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      FX.fxBurst(J.death, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      FX.fxFlash(J.death.flashMs, J.death.flashSize, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();
}

/* Per-frame draw accounting, sampled in the page. One instantaneous read of
   renderer.info is worthless here: hostiles, bullets and effect pools come and
   go, so the count swings by more than a shadow pass costs. This averages
   every frame of the measured window instead, and it is the one number in
   this file that does not depend on how busy the machine is. */
function drawSampler() {
  globalThis.__HB_DRAW__ = { frames: 0, calls: 0, tris: 0, maxCalls: 0 };
  return import('/src/render/scene.js').then(({ renderer }) => {
    const d = globalThis.__HB_DRAW__;
    const step = () => {
      requestAnimationFrame(step);
      const r = renderer.info.render;
      d.frames++; d.calls += r.calls; d.tris += r.triangles;
      if (r.calls > d.maxCalls) d.maxCalls = r.calls;
    };
    requestAnimationFrame(step);
  });
}

async function measurePerf(base, variant, stress) {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(base + '/index.html?testapi=1' + variant.extra, { waitUntil: 'load' });
  await page.waitForFunction(
    () => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 8000 });
  await page.evaluate(async () => {
    globalThis.__HB_WEAPONS__ = await import('/src/sim/weapons.js');
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(PERF_WARM_MS);
  if (stress) await page.evaluate(stressLoop);
  await page.evaluate(drawSampler);
  await page.waitForTimeout(PERF_RUN_MS);
  const out = await page.evaluate(async () => {
    const S = await import('/src/render/scene.js');
    const W = globalThis.__HB_WEAPONS__;
    let live = 0;
    if (W) for (const b of W.bulletPool) if (b.alive) live++;
    const d = globalThis.__HB_DRAW__;
    // absent on any build older than T-047 — this rig is used against those too
    let rig = null;
    try { rig = (await import('/src/render/lights.js')).lightRigSnapshot(); } catch (e) { rig = null; }
    return {
      perf: globalThis.HB.perf(),
      liveProjectiles: live,
      draw: {
        frames: d.frames,
        meanCalls: +(d.calls / Math.max(1, d.frames)).toFixed(1),
        maxCalls: d.maxCalls,
        meanTriangles: Math.round(d.tris / Math.max(1, d.frames)),
      },
      rig,
    };
  });
  await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
  await page.keyboard.up('ArrowRight');
  await browser.close();
  return out;
}

/* --------------------------- shadow cost --------------------------- */

/* What the shadow DEPTH PASS costs, measured inside one page.
   Two launches of the same build differ by more than a shadow map costs when
   five other lanes are driving Chrome on the same machine — the pair below
   lands within one process, one GPU context and one thermal state, and
   alternates so drift cancels: N frames with renderer.shadowMap.autoUpdate
   ON, N with it OFF, repeated, under the same injected 256-projectile load.
   With autoUpdate off the map is not re-rendered but IS still sampled, so
   the delta is the depth pass alone and not the cost of receiving.
   It also settles the accounting question the draw-call table raises: if
   renderer.info counted the shadow pass, `calls` would move with the toggle. */
function shadowCostProbe({ windows, frames }) {
  return new Promise((resolve) => {
    import('/src/render/scene.js').then(({ renderer }) => {
      if (!renderer.shadowMap.enabled) { resolve({ skipped: 'shadowMap disabled in this rig' }); return; }
      const out = [];
      let w = 0, n = 0, last = performance.now(), sum = 0, calls = 0;
      renderer.shadowMap.autoUpdate = true;
      const step = () => {
        const t = performance.now();
        const dt = t - last; last = t;
        if (n > 0) { sum += dt; calls += renderer.info.render.calls; }   // skip the toggle frame
        n++;
        if (n > frames) {
          out.push({
            depthPass: renderer.shadowMap.autoUpdate,
            meanMs: +(sum / (n - 1)).toFixed(3),
            meanCalls: +(calls / (n - 1)).toFixed(1),
          });
          renderer.shadowMap.autoUpdate = !renderer.shadowMap.autoUpdate;
          n = 0; sum = 0; calls = 0; w++;
        }
        if (w >= windows) {
          renderer.shadowMap.autoUpdate = true;
          resolve({ windows: out });
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
}

async function measureShadowCost(base, variant) {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(base + '/index.html?testapi=1' + variant.extra, { waitUntil: 'load' });
  await page.waitForFunction(
    () => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 8000 });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(PERF_WARM_MS);
  await page.evaluate(stressLoop);
  await page.waitForTimeout(1200);
  const raw = await page.evaluate(shadowCostProbe, { windows: 16, frames: 90 });
  const live = await page.evaluate(async () => {
    const W = await import('/src/sim/weapons.js');
    let n = 0;
    for (const b of W.bulletPool) if (b.alive) n++;
    return n;
  });
  await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
  await browser.close();
  if (raw.skipped) return raw;
  const med = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return +s[Math.floor(s.length / 2)].toFixed(3);
  };
  const on = raw.windows.filter((x) => x.depthPass).slice(1);      // drop the warm window
  const off = raw.windows.filter((x) => !x.depthPass);
  return {
    liveProjectiles: live,
    depthPassOn: { medianMs: med(on.map((x) => x.meanMs)), medianCalls: med(on.map((x) => x.meanCalls)), windows: on.length },
    depthPassOff: { medianMs: med(off.map((x) => x.meanMs)), medianCalls: med(off.map((x) => x.meanCalls)), windows: off.length },
    depthPassMs: +(med(on.map((x) => x.meanMs)) - med(off.map((x) => x.meanMs))).toFixed(3),
    // Hostiles and effect pools come and go during the windows, so a couple of
    // calls of drift means nothing; the shadow pass draws ~10 pools, so if
    // renderer.info counted it this delta would be about that big.
    callsDelta: +(med(on.map((x) => x.meanCalls)) - med(off.map((x) => x.meanCalls))).toFixed(1),
    windows: raw.windows,
  };
}

/* ------------------------------ main ------------------------------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const variants = parseVariants(args.variants);
  const outDir = resolve(repoRoot, 'artifacts', 'lightrig', args.tag);
  mkdirSync(outDir, { recursive: true });
  const served = args.root ? resolve(args.root) : repoRoot;
  const server = await startStaticServer(served, { port: 0 });
  const base = server.baseUrl.replace(/\/$/, '');
  try {
    const result = {
      measuredAt: new Date().toISOString(),
      tool: 'tools/playtest/lightrig-capture.mjs',
      tag: args.tag,
      servedRoot: served,
      viewport: '1280x800, headless Chrome (channel: chrome)',
      lumaNote: 'L = Rec.709 luma on sRGB bytes; bands are fixed row ranges (HUD strip skipped)',
    };
    if (args.shadowcost) {
      result.mode = 'shadowcost';
      result.note = 'depth-pass cost, measured inside ONE page by alternating ' +
        'renderer.shadowMap.autoUpdate under the 256-projectile load; vsync disabled';
      result.readings = {};
      for (const v of variants) {
        console.log('shadow cost: ' + v.label + ' …');
        const r = await measureShadowCost(base, v);
        result.readings[v.label] = r;
        console.log('  ' + v.label + ' depthPass ON ' + JSON.stringify(r.depthPassOn) +
          ' OFF ' + JSON.stringify(r.depthPassOff) + '  delta=' + r.depthPassMs + 'ms' +
          '  callsDelta=' + r.callsDelta);
      }
      writeFileSync(join(outDir, 'shadow-cost.json'), JSON.stringify(result, null, 2) + '\n');
      console.log('\nwrote ' + join(outDir, 'shadow-cost.json'));
    } else if (args.perf) {
      result.mode = 'perf';
      result.note = 'vsync DISABLED (--disable-gpu-vsync --disable-frame-rate-limit): avgMs is ' +
        'the real cost of a frame, NOT the 60fps gate — juice-stress.mjs is the gate';
      result.readings = {};
      for (const v of variants) {
        console.log('perf: ' + (v.label || 'ship') + ' …');
        result.readings[v.label] = {
          control: await measurePerf(base, v, false),
          stress: await measurePerf(base, v, true),
        };
        const s = result.readings[v.label].stress;
        console.log('  ' + v.label + ' stress avgMs=' + s.perf.avgMs + ' worstMs=' + s.perf.worstMs +
          ' meanCalls=' + s.draw.meanCalls + ' meanTris=' + s.draw.meanTriangles +
          ' live=' + s.liveProjectiles);
      }
      writeFileSync(join(outDir, 'perf.json'), JSON.stringify(result, null, 2) + '\n');
      console.log('\nwrote ' + join(outDir, 'perf.json'));
    } else {
      result.mode = 'frames';
      result.marks = args.marks || MARKS;
      result.variants = {};
      for (const v of variants) {
        console.log('frames: ' + v.label + ' …');
        result.variants[v.label] = await captureVariant(base, v, outDir, result.marks);
      }
      writeFileSync(join(outDir, 'frames.json'), JSON.stringify(result, null, 2) + '\n');
      console.log('\nwrote ' + join(outDir, 'frames.json'));
    }
  } finally {
    await server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
