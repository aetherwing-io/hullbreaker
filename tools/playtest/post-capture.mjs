// post-capture.mjs — dev-only A/B evidence rig for the screen pass (T-048,
// docs/decisions.md entry 18). It answers two questions the operator and the
// gate ask about bloom, and nothing else:
//
//   1. what does the SAME frame look like with the pass on and off, and
//   2. what does the pass cost per displayed frame, under real load.
//
//   node post-capture.mjs [outDir] [--scenes a,b] [--scale 1|2] [--probe]
//   node post-capture.mjs --stress                 (the cost table only)
//
// FRAME-EXACT BY CONSTRUCTION. Both sides of a pair run the same fixture with
// ?fixeddt (a constant sim step per frame) and the same page-side input
// schedule, which is keyed to the game's own clock rather than to wall time.
// At the capture point the run is PAUSED — src/main.js stops advancing the
// simulation but keeps drawing — so the shutter cannot slip a frame. Every
// capture records the gameMs it paused at, and the rig FAILS the pair if the
// two sides did not stop at the same instant. A pair that reports equal
// pausedAtMs differs by the draw path and by nothing else.
//
// HONESTY NOTES:
//   1. Headless Chrome at deviceScaleFactor 1 renders a 1280x800 drawing
//      buffer. The operator's laptop is retina: src/render/scene.js clamps the
//      pixel ratio at 2, so the real buffer is 2560x1600 and every full-screen
//      pass costs ~4x what it costs here. Run --scale 2 for that reading; both
//      are reported and neither is a claim about any other machine.
//   2. rAF is vsync-locked, so `fps` can never exceed the panel's refresh rate
//      and a pass that fits inside the frame budget is invisible in it. That
//      is why the stress mode also reports gpuMs sampled from a page-side
//      timer around the draw call, and why worstMs/over20ms remain the
//      load-bearing fields for the 60fps condition.
//   3. gpuMs is CPU time around composer.render()/renderer.render(), not GPU
//      time — WebGL commands are asynchronous. It is a floor on the cost, not
//      the cost. Treat a rise in it as real and its absolute value as
//      approximate.
//   4. The scenes hold right, hold fire and hop on landing. That is a crude
//      policy: it produces live combat, not skilled play, and RIG dies in some
//      of them. The frames are for judging LIGHT, not difficulty.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { decodePng } from '../assets/lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const positional = args.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && ['--scenes', '--scale', '--out'].includes(args[i - 1])));

const OUT = resolve(positional[0] || join(repoRoot, 'artifacts', 'post-v1'));
const SCALE = Number(opt('--scale', '1'));
const VIEWPORT = { width: 1280, height: 800 };

// ?shell=0 keeps the pause panel off the frame (the capture pauses the run to
// freeze it); ?fixeddt pins the sim step; ?testapi=1 publishes telemetry.
const BASE_QS = 'testapi=1&shell=0&fixeddt=16.667';
// the game instant the driver's first press lands on, in sim ms. Both sides
// must have installed before it (the composer side loads addons first, so it
// installs later in wall clock but must still be inside this window).
const DRIVER_START_MS = 4000;

const SCENES = [
  // the shipped URL, at the frozen FAR default, in live combat
  { id: 'far-combat', qs: '', pauseAtMs: 9000 },
  { id: 'far-combat-late', qs: '', pauseAtMs: 17000 },
  // the traversal fixture under its pursuit pace — denser fire, tighter route
  { id: 'traversal-hunt', qs: '&slice=traversal&pace=hunt', pauseAtMs: 8000 },
  // the two telegraph lamps and the polyp's live beam, the tells bloom is
  // supposed to turn into light
  { id: 'polyp-tell', qs: '&slice=traversal&polyp=1', pauseAtMs: 7000 },
  { id: 'hound-tell', qs: '&slice=traversal&hound=2', pauseAtMs: 7000 },
];

const MODES = [
  { id: 'before', qs: '&bloom=0' },      // the direct draw: the pre-pass game
  { id: 'after', qs: '' },               // the shipped default: composer + bloom
];

// The cost table's third column: the composer without MSAA on its targets.
// A composer loses the canvas's antialiasing and buying it back is a per-pass
// resolve of a half-float target, which is the single most expensive thing
// this pass can be asked to do — so it is measured, not assumed.
const STRESS_MODES = [
  ...MODES,
  { id: 'after-aa2', qs: '&aa=2' },
  { id: 'after-noaa', qs: '&aa=0' },
];

/* ------------------------------ page side ------------------------------- */

// Input is dispatched IN THE PAGE and keyed to the game's own clock — every
// press and every release is a function of gameMs and nothing else — so both
// sides of a pair receive the identical schedule no matter how differently the
// two browsers were scheduled by the OS, or how long the composer's CDN fetch
// took on the side that has one. src/main.js's own self-test dispatches
// KeyboardEvents the same way, so this is the shipped input path.
//
// The first press waits for START_MS of GAME time rather than firing on
// install: the two pages reach this code at different wall clocks, and an
// input at a different sim instant is a different run. The rig records when
// it installed and refuses the pair if either side was late.
function installDriver([startMs, pauseAtMs]) {
  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
  globalThis.__DRIVER_INSTALLED_MS__ = globalThis.HB.gameMs();
  let started = false;
  let hopAt = -1e9;
  let hopping = false;
  const step = () => {
    const hb = globalThis.HB;
    if (!hb) return;
    const t = hb.gameMs();
    // The shutter fires from INSIDE the page, on the first frame at or past
    // the named instant, so both sides freeze on the same simulated frame
    // rather than on whenever a poll from Node happened to notice.
    if (started && t >= pauseAtMs && hb.state() === 'PLAYING') {
      down('KeyP');
      return;                              // stop driving: the picture is frozen
    }
    if (!started && t >= startMs) {
      started = true;
      down('ArrowRight');
      down('KeyJ');
    }
    if (started) {
      // hop on landing, at most every 300 ms of GAME time, released 120 ms of
      // game time later: it keeps the run moving over the lattice's lips
      // without pretending to be skilled play
      if (hopping && t - hopAt >= 120) { up('Space'); hopping = false; }
      if (!hopping && hb.player.grounded && t - hopAt > 300) {
        hopAt = t; hopping = true; down('Space');
      }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// what the page reports back with every capture
function readFrame() {
  const hb = globalThis.HB;
  const r = globalThis.__HB_RENDERER__;
  const info = r ? r.info : null;
  return {
    gameMs: hb.gameMs(),
    state: hb.state(),
    scrollX: hb.scrollX(),
    player: { x: hb.player.x, y: hb.player.y, hp: hb.player.hp, lives: hb.player.lives },
    hostiles: hb.hostiles.map((e) => ({ kind: e.kind, state: e.state, x: e.x, y: e.y })),
    kills: hb.kills(),
    post: hb.post ? hb.post() : null,
    perf: hb.perf(),
    juice: hb.juice(),
    draw: info ? {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
    } : null,
  };
}

/* ------------------------------ frame stats ------------------------------ *
 * The two questions a bloom pass has to answer with numbers rather than with
 * taste, both in the same currency the look proposal measured the frame in
 * (docs/proposals/2026-08-look-direction.md: 0.0% of playfield pixels above
 * luminance 200 in all fifteen audit captures):
 *
 *   aboveL200  does the frame now contain anything that reads as LIGHT?
 *   skyMean    …at the price of hazing the air? The sky band is the top 22%
 *              of the frame, which the FAR camera keeps free of play geometry
 *              on these scenes — the place a wide bloom halo shows up first,
 *              and the exact failure entry 14 ("too dark", answered by
 *              lifting blacks) says not to trade for.
 *
 * Rec.601 luma on the 8-bit screenshot: this is judging DISPLAYED pixels, the
 * same thing the operator's eye gets, not linear scene values.               */
function frameStats(file) {
  const { width, height, rgba } = decodePng(file);
  const skyRows = Math.round(height * 0.22);
  let sum = 0, skySum = 0, skyN = 0, above200 = 0, above240 = 0, max = 0;
  const n = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      sum += l;
      if (l > max) max = l;
      if (l > 200) above200++;
      if (l > 240) above240++;
      if (y < skyRows) { skySum += l; skyN++; }
    }
  }
  return {
    mean: +(sum / n).toFixed(2),
    skyMean: +(skySum / skyN).toFixed(2),
    aboveL200Pct: +((above200 / n) * 100).toFixed(4),
    aboveL240Pct: +((above240 / n) * 100).toFixed(4),
    max: Math.round(max),
  };
}

/* The pair is frame-exact, so the two images can be SUBTRACTED — which is the
   only honest way to answer "how far does the bleed reach". `changedPct` is
   the share of pixels the pass moved by more than 8 levels (a step a player
   can see); `spread` is how far from the brightest source those pixels are
   found, as a fraction of the frame's diagonal. A pass that turns emissives
   into light shows a large delta over a small area near the sources; a pass
   that hazes the frame shows a small delta everywhere. */
function pairDiff(beforePng, afterPng) {
  const a = decodePng(beforePng);
  const b = decodePng(afterPng);
  if (a.width !== b.width || a.height !== b.height) return null;
  const n = a.width * a.height;
  let sum = 0, max = 0, changed = 0, farthest = 0;
  let cx = 0, cy = 0, w = 0;
  const lum = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const d = lum(b.rgba, i) - lum(a.rgba, i);
      const ad = Math.abs(d);
      sum += ad;
      if (ad > max) max = ad;
      if (ad > 8) { changed++; cx += x * ad; cy += y * ad; w += ad; }
    }
  }
  if (w > 0) {
    cx /= w; cy /= w;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4;
        if (Math.abs(lum(b.rgba, i) - lum(a.rgba, i)) > 8) {
          const r = Math.hypot(x - cx, y - cy);
          if (r > farthest) farthest = r;
        }
      }
    }
  }
  const diag = Math.hypot(a.width, a.height);
  return {
    meanAbs: +(sum / n).toFixed(3),
    max: Math.round(max),
    changedPct: +((changed / n) * 100).toFixed(3),
    reach: +(farthest / diag).toFixed(3),
  };
}

/* -------------------------------- driver -------------------------------- */

async function openPage(browser, base, url) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location && m.location();
    if (loc && /\/favicon\.ico$/.test(loc.url || '') && /404/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  await page.goto(base + url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 10000 });
  // The composer arrives over the network: settle before anything is measured.
  // The `HB.post` guard is what lets this rig also run against a tree from
  // BEFORE the pass existed, which is how "?bloom=0 restores the old look" gets
  // checked against the actual old look instead of against a claim about it.
  await page.waitForFunction(
    () => !globalThis.HB.post || globalThis.HB.post().status !== 'loading',
    null, { timeout: 10000 });
  await page.evaluate(() => {
    globalThis.__HB_RENDERER__ = null;
  });
  await page.evaluate(async () => {
    const S = await import('/src/render/scene.js');
    globalThis.__HB_RENDERER__ = S.renderer;
  });
  return { page, context, errors };
}

async function capture(browser, base, scene, mode) {
  const url = '/index.html?' + BASE_QS + scene.qs + mode.qs;
  const { page, context, errors } = await openPage(browser, base, url);
  await page.evaluate(installDriver, [DRIVER_START_MS, scene.pauseAtMs]);
  const installedAtMs = await page.evaluate(() => globalThis.__DRIVER_INSTALLED_MS__);
  // …then let the run play to the named instant, where the page freezes itself
  await page.waitForFunction(
    () => globalThis.HB.state() !== 'PLAYING', null, { timeout: 60000 });
  // The pause is how the shutter is frozen, but its DOM panel dims the whole
  // page (index.html: #overlay is rgba(8,12,16,.62) over everything), which
  // would darken exactly the thing being judged. Hidden for the shot; the
  // canvas underneath is untouched, and the HUD stays because it is part of
  // what the player looks at.
  await page.evaluate(() => {
    const ov = document.getElementById('overlay');
    if (ov) ov.style.display = 'none';
  });
  await page.waitForTimeout(120);          // a couple of frames of the frozen picture
  const frame = await page.evaluate(readFrame);
  const shot = join(OUT, scene.id + '--' + mode.id + '.png');
  await page.screenshot({ path: shot });
  await context.close();
  return { ...frame, url, shot, installedAtMs, stats: frameStats(shot), errors };
}

/* ------------------------------ stress mode ------------------------------ */

// the same injected load tools/playtest/juice-stress.mjs uses (its own header
// documents the method), plus a page-side timer around the frame's draw so the
// composer's cost is visible even when vsync hides it in fps
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

function readStress() {
  const hb = globalThis.HB;
  const W = globalThis.__HB_WEAPONS__;
  const r = globalThis.__HB_RENDERER__;
  let live = 0;
  if (W) for (const b of W.bulletPool) if (b.alive) live++;
  const s = globalThis.__DRAW_SAMPLES__ || [];
  const sorted = [...s].sort((a, b) => a - b);
  return {
    perf: hb.perf(),
    post: hb.post ? hb.post() : null,
    liveProjectiles: live,
    state: hb.state(),
    draw: r ? { calls: r.info.render.calls, triangles: r.info.render.triangles } : null,
    drawMs: sorted.length ? {
      n: sorted.length,
      median: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
      p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(3),
      worst: +sorted[sorted.length - 1].toFixed(3),
    } : null,
  };
}

/* Per-DISPLAYED-FRAME draw time. A composer makes a dozen renderer.render()
   calls per frame (RenderPass, the bright pass, five blur pairs, the
   composite, the output blit) and they are sequential, not nested — timing
   each one separately would compare one blur pass against the whole scene.
   So every call adds into an accumulator, and a rAF callback registered AFTER
   the game's own loop closes the frame and publishes one sample. CPU time
   around the submit path: WebGL is asynchronous, so this is a FLOOR on the
   cost, not the cost. */
function installDrawTimer() {
  return (async () => {
    const S = await import('/src/render/scene.js');
    const samples = [];
    globalThis.__DRAW_SAMPLES__ = samples;
    const r = S.renderer;
    const origRender = r.render.bind(r);
    let acc = 0;
    r.render = function (sc, cam) {
      const t0 = performance.now();
      origRender(sc, cam);
      acc += performance.now() - t0;
    };
    const flush = () => {
      if (acc > 0) {
        samples.push(acc);
        if (samples.length > 600) samples.shift();
        acc = 0;
      }
      requestAnimationFrame(flush);
    };
    requestAnimationFrame(flush);
  })();
}

// One reading = one fresh browser, the way tools/playtest/juice-stress.mjs
// does it: a reused browser accumulates state and the numbers drift.
/* --unlocked: launch with the frame-rate limiter off. Without it every reading
   is vsync-clamped and a pass that costs 3 ms inside a 8.33 ms budget is
   invisible — the honest sentence "no frame was late" and the honest sentence
   "there is headroom left" are not the same sentence, and only this flag can
   say the second one. The numbers it produces are NOT frame rates a player
   would see; they are a cost ratio. */
const UNLOCKED_ARGS = [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--disable-features=CalculateNativeWinOcclusion',
];

async function stress(base, mode) {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: flag('--unlocked') ? UNLOCKED_ARGS : [],
  });
  const url = '/index.html?testapi=1&shell=0' + mode.qs;
  try {
    const { page, errors } = await openPage(browser, base, url);
    await page.evaluate(async () => {
      globalThis.__HB_WEAPONS__ = await import('/src/sim/weapons.js');
    });
    await page.evaluate(installDrawTimer);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.evaluate(stressLoop);
    await page.waitForTimeout(5000);
    const out = await page.evaluate(readStress);
    await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
    return { ...out, url, errors };
  } finally {
    await browser.close();
  }
}

/* --------------------------------- probe --------------------------------- *
 * The two things only a real page can answer, and the second one is the whole
 * reason the composer loads the way it does:
 *
 *   selftest   ?selftest=1 must still print PASS with the pass wired in.
 *   offline    with every three/addons request ABORTED — the CDN down, a
 *              school firewall, a flaky hotspot — the game must still boot,
 *              still render frames, and say so through post().status. A blank
 *              page is a P1 defect in this project; a game without bloom is
 *              not a defect at all.
 */
async function probe(base) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = {};
  try {
    {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
      await page.goto(base + '/index.html?selftest=1', { waitUntil: 'load' });
      await page.waitForFunction(() => /SELFTEST/.test(document.title), null, { timeout: 20000 });
      out.selftest = {
        title: await page.title(),
        post: await page.evaluate(() => (globalThis.HB.post ? globalThis.HB.post() : null)),
        errors,
      };
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
      await context.route('**/examples/jsm/**', (route) => route.abort());
      await page.goto(base + '/index.html?testapi=1&shell=0', { waitUntil: 'load' });
      await page.waitForFunction(
        () => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 15000 });
      await page.waitForFunction(
        () => globalThis.HB.post().status !== 'loading', null, { timeout: 15000 });
      await page.waitForTimeout(1500);
      out.offline = {
        post: await page.evaluate(() => (globalThis.HB.post ? globalThis.HB.post() : null)),
        perf: await page.evaluate(() => globalThis.HB.perf()),
        failsafe: await page.evaluate(() => globalThis.HB.failsafe()),
        state: await page.evaluate(() => globalThis.HB.state()),
        shot: join(OUT, 'offline-fallback.png'),
        errors,
      };
      await page.screenshot({ path: out.offline.shot });
      out.offline.stats = frameStats(out.offline.shot);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}

/* --------------------------------- main --------------------------------- */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startStaticServer(repoRoot, { port: 0 });
  const base = server.baseUrl.replace(/\/$/, '');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const result = {
    measuredAt: new Date().toISOString(),
    tool: 'tools/playtest/post-capture.mjs',
    viewport: VIEWPORT.width + 'x' + VIEWPORT.height + ' @ deviceScaleFactor ' + SCALE,
    scenes: {},
    stress: {},
  };
  try {
    if (flag('--probe') || flag('--all')) {
      result.probe = await probe(base);
      console.log('probe selftest:', result.probe.selftest.title);
      console.log('probe offline :', 'status=' + result.probe.offline.post.status,
        'state=' + result.probe.offline.state,
        'frames=' + result.probe.offline.perf.frames,
        'worstMs=' + result.probe.offline.perf.worstMs,
        'faults=' + result.probe.offline.failsafe.faults,
        'panel=' + result.probe.offline.failsafe.showing,
        'meanL=' + result.probe.offline.stats.mean);
    }
    if (flag('--stress') || flag('--all')) {
      // Alternated repeats, not one reading per side: this machine runs other
      // lanes' browsers at the same time, and a single pair can be a picture
      // of who else was busy. Alternating puts both sides through the same
      // contention, and the spread across repeats is reported so a reader can
      // see how noisy the session was.
      const repeats = Number(opt('--repeats', '3'));
      for (const mode of STRESS_MODES) result.stress[mode.id] = [];
      for (let i = 0; i < repeats; i++) {
        for (const mode of STRESS_MODES) {
          const r = await stress(base, mode);
          result.stress[mode.id].push(r);
          console.log('stress', mode.id, 'run', i + 1,
            'fps=' + r.perf.fps, 'avg=' + r.perf.avgMs, 'worst=' + r.perf.worstMs,
            'over20=' + r.perf.over20ms, 'live=' + r.liveProjectiles,
            'calls=' + (r.draw ? r.draw.calls : '?'),
            'drawMs=' + (r.drawMs ? r.drawMs.median + '/' + r.drawMs.p95 : '?'));
        }
      }
    }
    if (!flag('--stress') && !flag('--probe')) {
      const want = opt('--scenes', '');
      const list = want ? SCENES.filter((s) => want.split(',').includes(s.id)) : SCENES;
      for (const scene of list) {
        const pair = {};
        for (const mode of MODES) pair[mode.id] = await capture(browser, base, scene, mode);
        // The pair is only evidence if both sides took the identical input at
        // the identical sim instants and froze on the same frame. Anything
        // else and the two pictures differ for a reason other than the pass.
        pair.driverInTime = pair.before.installedAtMs < DRIVER_START_MS &&
          pair.after.installedAtMs < DRIVER_START_MS;
        pair.frameExact = pair.driverInTime &&
          pair.before.gameMs === pair.after.gameMs &&
          pair.before.player.x === pair.after.player.x &&
          pair.before.player.y === pair.after.player.y &&
          pair.before.kills === pair.after.kills;
        pair.diff = pair.frameExact ? pairDiff(pair.before.shot, pair.after.shot) : null;
        result.scenes[scene.id] = pair;
        console.log(scene.id,
          'frameExact=' + pair.frameExact,
          'installed=' + pair.before.installedAtMs.toFixed(0) + '/' +
            pair.after.installedAtMs.toFixed(0),
          'gameMs=' + pair.before.gameMs + '/' + pair.after.gameMs,
          'post=' + (pair.after.post ? pair.after.post.status : 'n/a'),
          'calls=' + pair.before.draw.calls + '→' + pair.after.draw.calls,
          'L200%=' + pair.before.stats.aboveL200Pct + '→' + pair.after.stats.aboveL200Pct,
          'sky=' + pair.before.stats.skyMean + '→' + pair.after.stats.skyMean,
          'mean=' + pair.before.stats.mean + '→' + pair.after.stats.mean,
          'diff=' + (pair.diff ? pair.diff.meanAbs + '/' + pair.diff.max +
            ' changed=' + pair.diff.changedPct + '% reach=' + pair.diff.reach : 'n/a'),
          'hostiles=' + pair.after.hostiles.length);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(join(OUT, 'post-capture.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('\nwrote ' + join(OUT, 'post-capture.json'));
  if (Object.keys(result.stress).length) console.log(JSON.stringify(result.stress, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
