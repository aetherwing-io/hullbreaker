// hulltex-capture.mjs — dev-only evidence rig for T-054 (is the hull surface
// texture actually visible on screen?). Same shape as backdrop-capture.mjs and
// scale-capture.mjs: it drives ONE judged policy against the shipped sim and
// captures the SAME moment twice — once on the default build, once at
// ?tex=flat, which turns the whole albedo pass off (hulltiles.js's
// resolveHullTexOn) — so the A/B is one URL apart in one build.
//
//   node hulltex-capture.mjs shots [--out dir]     paired frames + 3x crops
//   node hulltex-capture.mjs measure [--out dir]   pixel stats, no browser
//   node hulltex-capture.mjs crops [--out dir]     re-cut the 3x crops only
//   node hulltex-capture.mjs bands                 where the pass changes pixels
//   node hulltex-capture.mjs fallback              entry 16's degrade contract,
//                                                  proved by aborting every tile
//
// Options: --viewport WxH (default 1280x800, the same true on-screen size
// T-052's evidence used), --out <dir> (default reports/tasks/T-054/evidence).
//
// WHAT IT MEASURES, AND WHY THAT METRIC.
// A texture that has been normalized to the right average brightness can still
// be invisible: the eye reads a tiled surface by its LOCAL contrast at the
// tiling frequency, not by its mean. So three numbers per band:
//   mean      — average display luminance (the darkening control: the fix for
//               invisibility must not re-darken the hull, T-052's finding)
//   sd        — luminance standard deviation over the band (global contrast,
//               which large shading gradients dominate)
//   fine      — MEAN ABSOLUTE NEIGHBOUR DIFFERENCE along each row,
//               |L(x+1,y) - L(x,y)| averaged over the band. This is the
//               number the operator's complaint is about: it ignores smooth
//               shading entirely and counts only detail at the pixel scale a
//               panel line lives at.
//   struct    — sd of (L - a 21px moving average of L) along each row: the
//               amplitude of structure at the 2-20 screen-pixel scale, which
//               is where a panel line or a checker cell lives. `fine` alone
//               cannot tell 0.3-level pixel mush from a 15-level panel seam
//               (white noise scores well on it); `struct` can. MEASURED on
//               the shipped deck checker in the same frame: its cells are
//               ~19 screen px wide with a 15-level step (row dump at
//               y=480: 80/95/80/95), which is fine 0.79 and struct 7.4.
//               That checker is the in-frame anchor for "detail the operator
//               can see at the frozen FAR view".
//
// HOW THE BANDS WERE CHOSEN — measured, not eyeballed. `bands` mode renders a
// textured/flat pair and reports, per row, how many pixels differ between the
// two: those rows are exactly the ones the albedo pass reaches. The rectangles
// below were read off that profile once and then FROZEN, so before/after of a
// render change are always compared over identical pixels.
//
// HONESTY NOTE, inherited from scale-capture.mjs: the two runs of a pair are
// two separate page loads of the same deterministic sim, so hostile sprites
// can differ by a frame or two of bot-timing jitter. The bands below are
// deliberately placed on large static hull surfaces away from the play line
// for that reason; judge the surface, not the sprites. The 3x crops are
// NEAREST-NEIGHBOUR upscales of the true-size pixels (not a re-render at
// higher resolution) — they magnify exactly what the player is given.

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { sampleState } from './lib/sampler.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { decodePng } from '../assets/lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const ARGV = process.argv.slice(2);
const MODE = ARGV[0] || 'shots';
const argOf = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : fallback;
};
const OUT = resolve(repoRoot, argOf('--out', join('reports', 'tasks', 'T-054', 'evidence')));
const [vw, vh] = argOf('--viewport', '1280x800').split('x').map(Number);
const VIEWPORT = { width: vw, height: vh };
// --dpr 2 captures what a RETINA laptop's renderer actually produces:
// src/render/scene.js sets pixelRatio to min(devicePixelRatio, 2), so the
// operator's own screen samples the frame twice as finely as the dpr-1
// captures every other rig in this directory takes. Measurements stay on
// dpr 1 (comparable with T-052's evidence and with the integrator's own
// numbers); the dpr-2 pair is for looking at.
const DPR = Number(argOf('--dpr', '1')) || 1;

const DRIVE_SCRIPT = resolve(here, 'scripts', 'six-face-spaced-run.json');

// The same two scroll thresholds T-052's evidence used (facet 0 just open, and
// the full depth stack), so this rig's frames are comparable with that lane's.
const ONLY = argOf('--moments', '');            // e.g. --moments near-open
const EXTRA = argOf('--extra', '');             // extra query on the textured side only,
                                                //   e.g. --extra light=flat, for an A/B
                                                //   against something other than ?tex=flat
const MOMENTS = [
  { tag: 'near-open', scroll: 18, note: 'facet 0 open: near hull / wall / deck-edge trim' },
  { tag: 'far-depth', scroll: 62, note: 'the whole depth stack in frame' },
].filter((m) => !ONLY || ONLY.split(',').includes(m.tag));
const VARIANTS = [
  { tag: 'textured', query: '?testapi=1' + (EXTRA ? '&' + EXTRA : '') },
  { tag: 'flat', query: '?testapi=1&tex=flat' },
];

/* The frozen measurement rectangles, in true-size (1280x800) pixels. Read off
   the textured-vs-flat difference profile of the near-open pair (`bands` mode
   below prints it per row) — `hull` is the surface the albedo pass actually
   covers, `deck` is the level.js checker above it (the in-frame anchor for
   detail that reads), `sky` is the upper frame. Each is stated as x,y,w,h,
   with what it is and is NOT a control for on its own line below. */
const BANDS = {
  // 93% of these pixels change when the albedo pass is switched on, and it is
  // the cleanest such rectangle in the frame (fewest geometry edges of its
  // own — a ladder or a hatch inside the band would add fine detail that has
  // nothing to do with the texture). Chosen by scanning every 300x90 rect
  // below y=500 for coverage >90%, then taking the lowest flat-build `fine`.
  hull: { x: 160, y: 635, w: 300, h: 90 },
  // the deck checker, level.js's own bake: NOT one of the four buckets this
  // pass textures, and the in-frame anchor for detail that reads (~19px
  // cells, a 15-level step). Measured coverage in a textured/flat pair is
  // 3-20% rather than 0 — that is the deck-edge trim at the band's lower
  // border plus ordinary bot jitter between the pair's two page loads, not
  // the checker itself changing.
  deck: { x: 300, y: 462, w: 300, h: 36 },
  // upper frame: sky, fog and the backdrop tiers. A control for the SKY (1.8
  // to 2.6% of its pixels move at near-open) but NOT a clean control at
  // far-depth, where 26-40% of it moves — limb.js maps the backdrop limb
  // (bdLimb/bdDrum/bdRing) onto the same hull/wall/scute buckets, so the
  // distant anatomy wears these tiles too. Reported, not corrected: that is
  // the thing the operator was comparing against ("the one floating in the
  // background seems to have more detail").
  sky: { x: 200, y: 120, w: 300, h: 90 },
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const scaleRect = (r, k) => (k === 1 ? r
  : { x: Math.round(r.x * k), y: Math.round(r.y * k), w: Math.round(r.w * k), h: Math.round(r.h * k) });

/* mean / sd / fine / struct over a rectangle (see the header for what each
   one is for). Rows are independent; nothing crosses a row boundary. The
   moving average `struct` subtracts is a centred box of STRUCT_WIN px,
   shrunk at the row ends rather than padded, so no edge pixel is invented. */
const STRUCT_WIN = 21;

function rectStats(img, rect) {
  const { width, height, rgba } = img;
  const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
  const x1 = Math.min(width, rect.x + rect.w), y1 = Math.min(height, rect.y + rect.h);
  let sum = 0, sumSq = 0, n = 0, diffSum = 0, diffN = 0;
  let hpSum = 0, hpSq = 0, hpN = 0;
  const row = new Float64Array(Math.max(0, x1 - x0));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const L = lum(rgba[i], rgba[i + 1], rgba[i + 2]);
      row[x - x0] = L;
      sum += L; sumSq += L * L; n++;
      if (x > x0) { diffSum += Math.abs(L - row[x - x0 - 1]); diffN++; }
    }
    const half = (STRUCT_WIN - 1) / 2;
    for (let k = 0; k < row.length; k++) {
      const a = Math.max(0, k - half), b = Math.min(row.length - 1, k + half);
      let s = 0;
      for (let j = a; j <= b; j++) s += row[j];
      const hp = row[k] - s / (b - a + 1);
      hpSum += hp; hpSq += hp * hp; hpN++;
    }
  }
  const mean = n ? sum / n : 0;
  const hpMean = hpN ? hpSum / hpN : 0;
  return {
    pixels: n,
    mean,
    sd: n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0,
    fine: diffN ? diffSum / diffN : 0,
    struct: hpN ? Math.sqrt(Math.max(0, hpSq / hpN - hpMean * hpMean)) : 0,
  };
}

/* ------------------------------- capture -------------------------------- */

async function policyTick(page, rules, sample, held, policyHeld) {
  const { desiredHolds, tapsToFire } = evaluatePolicyTick(rules, sample, held);
  for (const code of desiredHolds) {
    if (!policyHeld.has(code)) {
      try { await page.keyboard.down(code); } catch {}
      policyHeld.add(code); held.add(code);
    }
  }
  for (const code of [...policyHeld]) {
    if (!desiredHolds.has(code)) {
      try { await page.keyboard.up(code); } catch {}
      policyHeld.delete(code); held.delete(code);
    }
  }
  for (const t of tapsToFire) {
    try { await page.keyboard.down(t.code); } catch {}
    held.add(t.code);
    setTimeout(() => {
      page.keyboard.up(t.code).then(() => held.delete(t.code)).catch(() => {});
    }, t.holdMs);
  }
}

async function shots() {
  mkdirSync(OUT, { recursive: true });
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = [];
  try {
    for (const v of VARIANTS) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await page.goto(`${server.baseUrl}/index.html${v.query}`, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const rules = compilePolicy(JSON.parse(readFileSync(DRIVE_SCRIPT, 'utf8')).policy);
      const held = new Set();
      const policyHeld = new Set();
      await page.keyboard.down('KeyJ');
      for (const m of MOMENTS) {
        const deadline = Date.now() + 150000;
        let last = null;
        for (;;) {
          const sample = await page.evaluate(sampleState);
          last = sample;
          if (!sample) break;
          if ((sample.scrollX || 0) >= m.scroll) break;
          if (sample.state === 'GAME_OVER') break;
          if (Date.now() > deadline)
            throw new Error(`${m.tag}/${v.tag}: stuck at scroll ` +
              `${(sample.scrollX || 0).toFixed(1)} state ${sample.state} after 150 s`);
          await policyTick(page, rules, sample, held, policyHeld);
          await page.waitForTimeout(60);
        }
        if (last && last.state === 'GAME_OVER') {
          process.stdout.write(`  [${v.tag}] ${m.tag}: SKIPPED — died before scroll ${m.scroll}\n`);
          report.push({ moment: m.tag, variant: v.tag, skipped: true });
          continue;
        }
        await page.waitForTimeout(80);
        const tex = await page.evaluate(() => (window.__HB_HULL_TEX ? window.__HB_HULL_TEX() : null));
        const file = join(OUT, `${m.tag}-${v.tag}.png`);
        await page.screenshot({ path: file });
        process.stdout.write(
          `  [${v.tag}] ${m.tag}: scroll ${(last.scrollX || 0).toFixed(1)} state ${last.state} ` +
          `buckets=${tex ? JSON.stringify(tex.buckets) : 'n/a'} on=${tex ? tex.on : 'n/a'}\n`);
        report.push({ moment: m.tag, variant: v.tag, file, scrollX: last.scrollX, tex });
      }
      for (const code of policyHeld) { try { await page.keyboard.up(code); } catch {} }
      await page.keyboard.up('KeyJ');
      if (errors.length) process.stdout.write('  page errors: ' + errors.join(' | ') + '\n');
      await context.close();
    }
    await makeCrops(browser);
  } finally {
    await browser.close();
    await server.close();
  }
  return report;
}

/* 3x NEAREST-NEIGHBOUR crops of the hull band, done in the browser (canvas
   with imageSmoothingEnabled off, then toDataURL) so this rig needs no PNG
   encoder of its own. The pixels are the true-size pixels; only their size on
   the page changes. */
async function makeCrops(browser) {
  const files = readdirSync(OUT).filter((f) => /^(near-open|far-depth)-(textured|flat)\.png$/.test(f));
  if (!files.length) return;
  const context = await browser.newContext({ viewport: { width: 1000, height: 400 } });
  const page = await context.newPage();
  for (const f of files) {
    const b64 = readFileSync(join(OUT, f)).toString('base64');
    const out = await page.evaluate(async ({ b64, rect, scale }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = rect.w * scale; cv.height = rect.h * scale;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/png');
    }, { b64, rect: scaleRect(BANDS.hull, DPR), scale: 3 });
    const name = f.replace(/\.png$/, '-hullband-3x.png');
    writeFileSync(join(OUT, name), Buffer.from(out.split(',')[1], 'base64'));
    process.stdout.write('  crop ' + name + '\n');
  }
  await context.close();
}

/* --------------------------- the degrade check --------------------------- *
 * decisions.md entry 16's condition, checked by causing the failure rather
 * than by reading the code that handles it: every tile PNG is aborted at the
 * network layer, and the page then has to (a) still boot and play, (b) report
 * zero textured buckets, and (c) leave every hull material's own `color` at
 * white — the gain a tile pays for may never be applied without that tile.
 * That last one is the new failure mode T-054 introduces, so it is the one
 * worth proving: a brightened material with no map is a hull two thirds
 * lighter than the palette says it should be.                             */
async function fallbackCheck() {
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.route('**/assets/generated/textures/**', (route) => route.abort());
    await page.goto(`${server.baseUrl}/index.html?testapi=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING',
      null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const out = await page.evaluate(async () => {
      const { scene } = await import('/src/render/scene.js');
      const colors = [];
      scene.traverse((o) => {
        if (o.isInstancedMesh && o.material && o.material.color)
          colors.push({
            r: +o.material.color.r.toFixed(3),
            hasMap: !!o.material.map,
            count: o.count,
          });
      });
      return {
        tex: window.__HB_HULL_TEX ? window.__HB_HULL_TEX() : null,
        state: globalThis.HB.state(),
        frames: (await import('/src/render/scene.js')).renderer.info.render.frame,
        brightWithoutMap: colors.filter((c) => !c.hasMap && c.r > 1.001).length,
        maxColorNoMap: colors.filter((c) => !c.hasMap).reduce((m, c) => Math.max(m, c.r), 0),
        meshes: colors.length,
      };
    });
    const pass = out.state === 'PLAYING' && out.frames > 0 &&
      out.tex && out.tex.buckets.length === 0 &&
      Object.values(out.tex.files).every((v) => v === false) &&
      out.brightWithoutMap === 0 && errors.length === 0;
    console.log('[fallback] every tile request aborted at the network layer');
    console.log('  state ' + out.state + ', frames ' + out.frames +
      ', textured buckets ' + JSON.stringify(out.tex && out.tex.buckets) +
      ', files ' + JSON.stringify(out.tex && out.tex.files));
    console.log('  instanced meshes ' + out.meshes + ', brightened-without-a-map ' +
      out.brightWithoutMap + ' (max color.r on a map-less material: ' +
      out.maxColorNoMap + ')');
    console.log('  page errors: ' + (errors.length ? errors.join(' | ') : 'none'));
    console.log('[fallback] ' + (pass ? 'PASS' : 'FAIL'));
    if (!pass) process.exitCode = 1;
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

/* ------------------------------- measure -------------------------------- */

function measure() {
  if (!existsSync(OUT)) throw new Error('no captures in ' + OUT + ' — run `shots` first');
  const files = readdirSync(OUT)
    .filter((f) => /^(near-open|far-depth)-(textured|flat)\.png$/.test(f)).sort();
  const w = (s, n) => String(s).padEnd(n);
  console.log(w('frame', 26) + w('band', 8) + w('mean', 9) + w('sd', 9) +
              w('fine', 9) + 'struct');
  const rows = [];
  for (const f of files) {
    const img = decodePng(join(OUT, f));
    // A --dpr 2 capture is the same frame at twice the sampling, so the frozen
    // rectangles are scaled by whatever the file's own width says it is rather
    // than re-typed. The numbers are then over the same part of the creature,
    // though NOT directly comparable across dpr — a finer sampling resolves
    // finer detail, which is the whole point of taking one.
    const scale = img.width / 1280;
    for (const [name, rect] of Object.entries(BANDS)) {
      const s = rectStats(img, scaleRect(rect, scale));
      rows.push({ file: f, band: name, ...s });
      console.log(w(f, 26) + w(name, 8) + w(s.mean.toFixed(2), 9) +
                  w(s.sd.toFixed(2), 9) + w(s.fine.toFixed(3), 9) +
                  s.struct.toFixed(3));
    }
  }
  return rows;
}

/* `bands` mode: where does the albedo pass actually change pixels? Prints the
   per-row count of pixels that differ between a textured/flat pair, which is
   how the frozen rectangles above were chosen. Diagnostic only. */
function bandProfile() {
  const a = decodePng(join(OUT, 'near-open-textured.png'));
  const b = decodePng(join(OUT, 'near-open-flat.png'));
  const rowsOut = [];
  for (let y = 0; y < a.height; y++) {
    let diff = 0, sumA = 0;
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const d = Math.abs(a.rgba[i] - b.rgba[i]) + Math.abs(a.rgba[i + 1] - b.rgba[i + 1]) +
                Math.abs(a.rgba[i + 2] - b.rgba[i + 2]);
      if (d > 6) diff++;
      sumA += lum(a.rgba[i], a.rgba[i + 1], a.rgba[i + 2]);
    }
    rowsOut.push({ y, diff, mean: sumA / a.width });
  }
  for (const r of rowsOut) {
    if (r.y % 5) continue;
    console.log(String(r.y).padStart(4) + '  diffpx ' + String(r.diff).padStart(5) +
                '  mean ' + r.mean.toFixed(1));
  }
}

if (MODE === 'shots') {
  await shots();
  measure();
} else if (MODE === 'measure') {
  measure();
} else if (MODE === 'bands') {
  bandProfile();
} else if (MODE === 'crops') {
  // re-cut the 3x crops from frames already on disk (no browser run): the
  // band rectangle is a measurement decision, and moving it must not mean
  // re-driving the sim and comparing against a different moment
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { await makeCrops(browser); } finally { await browser.close(); }
} else if (MODE === 'fallback') {
  await fallbackCheck();
} else {
  console.error('usage: node hulltex-capture.mjs [shots|measure|crops|bands|fallback] ' +
                '[--viewport WxH] [--dpr n] [--moments a,b] [--extra query] [--out dir]');
  process.exit(2);
}
