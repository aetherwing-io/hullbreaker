// scale-capture.mjs — dev-only evidence rig for the SCALE PASS (T-045:
// graded backdrop anatomy tiers + human-scale reference objects, decisions.md
// entry 17). It captures the SAME moment of the same run twice — once on the
// shipped default and once at ?scale=0, which restores the two
// CONFIG.limb.silhouette slabs the build carried before — and then measures
// both frames, so the before/after is one URL apart in one build instead of
// two commits apart in two.
//
//   node scale-capture.mjs shots      — the paired frames, into
//                                       artifacts/scale-v1/ at the repo root
//   node scale-capture.mjs measure    — histogram stats on whatever is in
//                                       artifacts/scale-v1/ (no browser)
//
// Options: --viewport WxH (default 1440x900), --out <dir>.
//
// WHY THE PAIRS ARE COMPARABLE. Both runs replay the identical input schedule
// against the identical seeded sim, and the frame is taken at a scrollX
// threshold rather than a wall clock, so the camera pose is the same in both.
// The shipped scroll is a constant (CONFIG.scrollSpeed; ?momentum= is off by
// default), which is what makes that true.
//
// HONESTY NOTE, SAME CLASS AS palette-capture.mjs's: hostile positions can
// differ by a frame or two of timing jitter between the two runs of a pair,
// and a run that dies restarts, so a pair is matched on CAMERA and WORLD, not
// on where a wasp happens to be. Judge composition and depth, not sprites.
//
// HONESTY NOTE ON THE NUMBERS: `measure` reports what is IN THE PNG — the
// single most common exact pixel color and its coverage, the distinct-color
// count, and luminance percentiles inside a horizontal band. Those are the
// same statistics docs/proposals/2026-08-look-direction.md's audit table
// used, recomputed here; they are NOT the same measurement pipeline, so read
// this rig's before/after delta rather than comparing one of its numbers to a
// number in that table.

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { sampleState } from './lib/sampler.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { histogram, decodePng } from '../assets/lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const ARGV = process.argv.slice(2);
const MODE = ARGV[0] || 'shots';
const argOf = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : fallback;
};
const OUT = resolve(repoRoot, argOf('--out', join('artifacts', 'scale-v1')));
const [vw, vh] = argOf('--viewport', '1440x900').split('x').map(Number);
const VIEWPORT = { width: vw, height: vh };

// The moments, as scrollX thresholds. The rig is driven by the JUDGED
// six-face policy (scripts/six-face-spaced-run.json, through the harness's own
// lib/policy.mjs), not by movement this file invents — that policy reaches
// wave gate 2 / scroll 140 on every measured run, so scroll 100 is inside its
// demonstrated range and nothing here depends on a bot winning a fight it
// usually loses. A run that dies restarts and the rig keeps going; the frame
// is taken the first time the threshold is crossed.
const DRIVE_SCRIPT = resolve(here, 'scripts', 'six-face-spaced-run.json');
const MOMENTS = [
  { tag: '01-climb-open', scroll: 18, note: 'facet 0, the run just started' },
  { tag: '02-climb-mid', scroll: 62, note: 'mid facet 0, the whole depth stack in frame' },
  { tag: '03-corner-approach', scroll: 86, note: 'the first joint filling frame right' },
];
// NOT CAPTURED, AND WHY: past the first joint (scroll ~100) would show the
// orbit, but corner 1 is a wave gate — it has to be FOUGHT open, and this
// policy died there on every attempt this rig made (GAME_OVER at scroll 88).
// A frame past the joint therefore needs either a better policy or a poked
// CONFIG, and a poked CONFIG is not evidence (see g1-capture.mjs's --dev-fast
// note). Left out rather than faked.
const VARIANTS = [
  { tag: 'after', query: '?testapi=1' },
  { tag: 'before', query: '?testapi=1&scale=0' },
];

/* ---------------------------- the capture --------------------------- */

async function shots() {
  mkdirSync(OUT, { recursive: true });
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = [];
  try {
    for (const v of VARIANTS) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      // Real GL draw calls per animation frame: three.js's renderer.info is
      // not on any global, so the honest way to count is to wrap the context
      // before the game's modules run. `last` is a whole frame's count.
      await page.addInitScript(() => {
        const counts = { last: 0, frame: 0 };
        for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
          for (const n of ['drawElements', 'drawArrays',
                           'drawElementsInstanced', 'drawArraysInstanced']) {
            const orig = P[n];
            if (!orig) continue;
            P[n] = function (...a) { counts.frame++; return orig.apply(this, a); };
          }
        }
        const raf = window.requestAnimationFrame.bind(window);
        const tick = () => { counts.last = counts.frame; counts.frame = 0; raf(tick); };
        raf(tick);
        window.__hbDraw = counts;
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await page.goto(`${server.baseUrl}/index.html${v.query}`, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const pieces = await page.evaluate(() => (window.HB && window.HB.g1 ? window.HB.g1.pieces : 0));
      const rules = compilePolicy(JSON.parse(readFileSync(DRIVE_SCRIPT, 'utf8')).policy);
      const held = new Set();
      const policyHeld = new Set();
      await page.keyboard.down('KeyJ');           // the trigger is always held
      for (const m of MOMENTS) {
        const deadline = Date.now() + 150000;
        let last = null;
        for (;;) {
          const sample = await page.evaluate(sampleState);
          last = sample;
          if (!sample) break;
          if ((sample.scrollX || 0) >= m.scroll) break;
          if (Date.now() > deadline)
            throw new Error(`${m.tag}/${v.tag}: stuck at scroll ` +
              `${(sample.scrollX || 0).toFixed(1)} state ${sample.state} after 150 s`);
          await policyTick(page, rules, sample, held, policyHeld);
          await page.waitForTimeout(60);
        }
        // let the shot land on a settled frame rather than mid-key
        await page.waitForTimeout(80);
        if (last) process.stdout.write(
          `  [${v.tag}] ${m.tag}: scroll ${(last.scrollX || 0).toFixed(1)} state ${last.state}\n`);
        const file = join(OUT, `${m.tag}-${v.tag}.png`);
        await page.screenshot({ path: file });
        const calls = await page.evaluate(() => (window.__hbDraw ? window.__hbDraw.last : null));
        report.push({ moment: m.tag, variant: v.tag, file, pieces, calls });
        process.stdout.write(
          `captured ${m.tag} / ${v.tag} — ${pieces} limb pieces, ${calls} GL draw calls/frame\n`);
      }
      for (const code of policyHeld) { try { await page.keyboard.up(code); } catch {} }
      await page.keyboard.up('KeyJ');
      if (errors.length) process.stdout.write('  page errors: ' + errors.join(' | ') + '\n');
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return report;
}

// Key plumbing, verbatim in shape from palette-capture.mjs: the policy names
// holds and taps, this turns them into real keyboard events.
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

/* --------------------------- the measurement ------------------------ *
 * Deliberately simple and stated in full: coverage of the single most common
 * exact color, how many distinct colors the frame carries, and the luminance
 * spread inside a horizontal band (the band is where the fog band lands in
 * frame, which is the region the audit found flat).                       */

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function bandStats(file, y0Frac, y1Frac) {
  const { width, height, rgba } = decodePng(file);
  const y0 = Math.floor(height * y0Frac), y1 = Math.floor(height * y1Frac);
  const values = [];
  const counts = new Map();
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      values.push(lum(rgba[i], rgba[i + 1], rgba[i + 2]));
      const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  values.sort((a, b) => a - b);
  const pct = (p) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    pixels: values.length,
    p05: pct(0.05), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95),
    spread: pct(0.95) - pct(0.05),
    unique: counts.size,
    topColor: '#' + top[0].toString(16).padStart(6, '0'),
    topCoverage: top[1] / values.length,
  };
}

function measure() {
  if (!existsSync(OUT)) throw new Error('no captures in ' + OUT + ' — run `shots` first');
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
  const rows = [];
  for (const f of files) {
    const file = join(OUT, f);
    const h = histogram(file);
    // the upper 45% of the frame is where the haze band lands at the shipped
    // FAR view (derived in CONFIG.limb.backdrop: the play-band fence puts the
    // nearest tier's floor at ndc 0.433, i.e. 28% down from the top)
    const sky = bandStats(file, 0, 0.45);
    rows.push({ file: f, whole: h, sky });
  }
  const w = (s, n) => String(s).padEnd(n);
  console.log(w('frame', 28) + w('largest exact', 20) + w('distinct', 10) +
              w('sky p05/p50/p95', 22) + 'sky spread');
  for (const r of rows) {
    const top = r.whole.colors[0];
    console.log(
      w(r.file, 28) +
      w('#' + ((top.r << 16) | (top.g << 8) | top.b).toString(16).padStart(6, '0') +
        ' ' + (top.coverage * 100).toFixed(1) + '%', 20) +
      w(r.whole.unique, 10) +
      w(r.sky.p05.toFixed(1) + ' / ' + r.sky.p50.toFixed(1) + ' / ' + r.sky.p95.toFixed(1), 22) +
      r.sky.spread.toFixed(1));
  }
  return rows;
}

if (MODE === 'shots') {
  await shots();
  measure();
} else if (MODE === 'measure') {
  measure();
} else {
  console.error('usage: node scale-capture.mjs [shots|measure] [--viewport WxH] [--out dir]');
  process.exit(2);
}
