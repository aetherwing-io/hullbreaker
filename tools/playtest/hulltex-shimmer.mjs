// hulltex-shimmer.mjs — T-057's evidence rig for I-049 (operator: "a lot of
// flicker on the bottom portions"). A sibling of hulltex-capture.mjs (T-054's
// fine-detail rig): same shipped sim, same frozen band rectangle, same
// textured/`?tex=flat` A/B — but this rig judges MOTION, not a still frame.
// hulltex-capture.mjs's own honesty note says as much: "a still frame cannot
// show shimmer." I-049 was found and measured exactly that way, and no
// runnable script was committed with it, so this file is the reproducible
// version of the same idea: no number here is inherited from that SPRINT
// entry, everything below is measured fresh by this file's own code.
//
//   node hulltex-shimmer.mjs measure [--moments a,b] [--out dir]
//   node hulltex-shimmer.mjs shots   [--moments a,b] [--out dir]   (measure + save frame 0 as PNG-ish JSON dump, for eyeballing)
//
// WHY A NEW FILE INSTEAD OF A MODE ON hulltex-capture.mjs: that file is
// T-054's own lane; T-057's fences are hulltiles.js, materials.js, and "your
// own new rig under tools/playtest/" — a sibling, not an edit to another
// lane's file. The frozen band rectangle below is copied from
// hulltex-capture.mjs's own `BANDS.hull` (not imported — that file exports
// nothing across lanes on purpose) so a reviewer can diff the two literals
// and confirm they measure the same rectangle.
//
// METHOD, and WHY it needed a from-scratch determinism fix before it was
// trustworthy: this rig drives `hold right` (no jump — the operator's own
// complaint is about the hull scrolling by while walking, and a jump's
// vertical bob is a confound this rig does not want), then captures 8
// consecutive RENDERED frames (not screenshots at arbitrary wall-clock
// intervals — see below) of the frozen band once the run has reached the
// SAME scroll position hulltex-capture.mjs's `near-open`/`far-depth` moments
// use, so the two rigs' numbers sit over literally the same geometry.
//
// WHAT THIS RIG'S DETERMINISM ACTUALLY IS, stated precisely after a fix
// cycle corrected an overclaim: numbers at the `near-open` moment are
// BIT-IDENTICAL across repeats WITHIN ONE BROWSER PROCESS (proven below with
// `--repeats`), and are NOT guaranteed identical across separate cold process
// launches — a reviewer measured 7804/7823/7823 as three genuinely different
// readings of the SAME shipped code across separate `node ... --repeats 1`
// invocations, one per fresh browser. See build.md's fix-cycle section for
// the full finding and for why the FIRST version of this file's claim ("no
// single-run number is trusted anywhere") was not yet true when it was
// written. THREE things had to be engineered in, in the order they were
// found:
//
//   1. `?fixeddt=16.67` (src/main.js's existing verification hook — see its
//      own comment) pins the SIM step to a 60fps-equivalent constant,
//      independent of headless Chrome's actual (often 100+fps, uncapped)
//      rAF cadence. Without it, "8 frames" spans a different amount of real
//      scroll every run depending on how fast the CPU happened to render —
//      sometimes sub-pixel, sometimes several pixels — which is not
//      "constant speed" at all.
//   2. EVERY frame of the run — the wait for the target scroll position AND
//      the 8-frame capture — happens inside ONE `page.evaluate` call, via an
//      in-page `requestAnimationFrame` loop that reads
//      `__HULLBREAKER_TEST__.snapshot().scrollX` and grabs the band with a
//      cheap 2D `drawImage` blit (no PNG encoding — raw pixels cross back to
//      Node once, at the end). A first version polled `scrollX` from Node in
//      a `while` loop with `page.waitForTimeout()` between checks: each poll
//      is its own round trip through the browser's task queue, competing
//      with the game's own rAF callback for the same thread, so exactly
//      which rendered frame the loop happened to stop on drifted from run to
//      run even at identical dt and identical code — different runs landed
//      on different SUB-TEXEL phases of the same panel-line pattern, and the
//      per-pixel numbers below are sensitive to that phase (a metric taken
//      over a fixed rectangle of a periodic pattern is not phase-invariant).
//      Proof this actually mattered: the polling version produced 7842 and
//      9551-9659 "changing" pixels across supposedly-identical repeated runs
//      of the SAME code (see build.md).
//   3. TWO REMAINING REAL-CLOCK RACES, found by a reviewer re-running this
//      file unmodified and getting the SAME code to produce both 7804 and
//      7823, plus an intermittent "no canvas on page" error — #2 above only
//      removed the jitter INSIDE the capture loop, not around its own start:
//        a. `waitUntilReady()` replaces a fixed `page.waitForTimeout(400)`
//           with `page.waitForFunction(state === 'PLAYING')`. A fixed
//           duration is a guess at how long boot takes; on a cold browser
//           launch (no JIT warm-up, first-ever asset fetch on this process)
//           400ms was sometimes not enough for `awaitPreloads()`'s own
//           real-wall-clock-timed settlement (src/render/preload.js,
//           PRELOAD_BUDGET_MS) to finish, which is exactly the missing
//           canvas / undefined test-API race.
//        b. `finalCapture`'s `keydownCode` param dispatches a SYNTHETIC
//           `KeyboardEvent` (`window.dispatchEvent`, not
//           `page.keyboard.down`) on the loop's own first tick, instead of a
//           separate real CDP key-press issued before entering the loop. A
//           real CDP-injected key event and the game's already-running rAF
//           loop are two independently-scheduled browser tasks with no
//           ordering guarantee between them — the exact "frame-boundary
//           input-delivery timing" fork T-054's own playtest.md already
//           documented for full played-out runs (a real key can land one
//           tick early or late relative to whichever rAF callback happens to
//           run first), which shifts RIG's whole subsequent trajectory by
//           one fixed-dt tick and lands the 8-frame capture on a different
//           sub-texel phase — the same class of bug as #2, just at the
//           boundary #2 didn't cover. A script-dispatched event's listeners
//           run SYNCHRONOUSLY inside the dispatching tick, which is what
//           removes the race rather than narrowing it.
//      MEASURED RESULT, stated precisely rather than assumed — an A/B of
//      this exact rig against its own pre-fix (committed) version, 8 cold
//      process launches each side (see build.md's "Fix cycle" section for
//      the full table): `near-open` stayed bit-identical across `--repeats`
//      WITHIN one process both before and after (never in question). ACROSS
//      separate cold launches, BOTH before and after land on the exact SAME
//      two discrete `textured` values (7804 and 7823, a 0.24% spread) — only
//      the frequency of landing on one vs the other moved (7:1 pre-fix,
//      4:4 post-fix in this sample), which 8 runs cannot distinguish from
//      chance. `flat`'s spread shrank to zero in this one 8-run sample
//      (2454/2432 pre-fix -> all-2454 post-fix) but that is one sample, not
//      a proof either. **I ship both fixes on the MECHANISM, not a measured
//      reduction**: a fixed real-time wait standing in for "boot finished"
//      and a real CDP-injected key racing an independently-scheduled browser
//      task are textbook sources of exactly this bug, and neither fix can
//      make anything WORSE — but I did not prove, at this sample size, that
//      they close the remaining 0.24%. A third attempt (also gating the
//      ready-wait on materials.js's own
//      `window.__HB_HULL_TEX().buckets.length`, in case hull-texture
//      compositing lagged `state === 'PLAYING'`) made no measured difference
//      either and was dropped rather than kept as unproven complexity — see
//      the function below. 0.24% is far inside the noise floor relative to
//      the 20-30%+ swings that separate the eight tested variants in
//      build.md, so it does not threaten any conclusion drawn from this rig
//      — but it is real and still open, and anyone tightening this further
//      should start from an honest baseline: this cycle's fixes are
//      reasoned, not proven, against this specific residual.
//
// TWO METRICS, on purpose, not one:
//
//   `reversal`  — the brief's own specified test (SPRINT.md I-049): for each
//                 pixel in the band, walk its luminance across the 8
//                 captured frames; it is COUNTED if some frame-to-frame delta
//                 has |delta| > `THRESH`, and marked REVERSING if two
//                 ADJACENT such deltas have opposite sign (brightening then
//                 darkening, or vice versa, both above threshold). Reported
//                 as (changing pixel count, % of those that reverse).
//
//   `residual`  — a second instrument this rig adds, because `reversal`
//                 alone cannot tell "aliasing" apart from "more real detail
//                 scrolling by". A texture with MORE genuine high-frequency
//                 content (panel lines, rivets) has more local luminance
//                 extrema per world-unit of travel than a smoother one, so
//                 even PERFECTLY filtered, non-aliased motion of a richer
//                 texture produces more sign reversals than a flatter one —
//                 that is real detail being visible, not a defect. `residual`
//                 asks a different question: how much of frame t+1 is NOT
//                 explained by translating frame t sideways by the frame's
//                 own KNOWN, constant scroll amount? Real detail translating
//                 rigidly is (by definition) well predicted by that shift —
//                 low residual. Content that changes in a way rigid
//                 translation cannot explain (a mip level flipping under a
//                 misaligned repeat, texel-grid rounding drift) is NOT
//                 predicted by any shift — high residual, regardless of how
//                 much real detail is present. The best-fit shift is found by
//                 a small bilinear search around the shift the frame's own
//                 scrollX delta and hulltiles.js's own screenPxPerWorld()
//                 predict (never assumed exact — camera projection is only
//                 linear in the frame-centre approximation hulltiles.js's own
//                 header already documents).
//
// HONESTY: this is a dev-only evidence rig, not a device claim. One headless
// Chrome, one machine; `residual`'s absolute numbers are this rig's own
// units (band luminance RMSE, 0-255 scale) and are meaningful only compared
// against another run of THIS SAME rig, on the same band, same moment,
// same frame count — never across a change to any of those.

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { sampleState } from './lib/sampler.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { CONFIG } from '../../src/config.js';
import { screenPxPerWorld } from '../../src/render/hulltiles.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const ARGV = process.argv.slice(2);
const MODE = ARGV[0] || 'measure';
const argOf = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : fallback;
};
const OUT = resolve(repoRoot, argOf('--out', join('reports', 'tasks', 'T-057', 'evidence')));
const ONLY = argOf('--moments', '');
const REPEATS = Number(argOf('--repeats', '1')) || 1;
const [vw, vh] = argOf('--viewport', '1280x800').split('x').map(Number);
const VIEWPORT = { width: vw, height: vh };
const FIXEDDT_MS = argOf('--fixeddt', '16.67');

// Copied from hulltex-capture.mjs's own `BANDS.hull` (see that file's header
// for how it was chosen — the cleanest rectangle for coverage vs geometry
// edges). Kept as a literal, not an import, per this file's own header note.
const RECT = { x: 160, y: 635, w: 300, h: 90 };
// Same two scroll thresholds hulltex-capture.mjs's MOMENTS uses, so a moment
// tag means the same geometry in both rigs. `near-open` is reached with a
// plain held-right (no jump — see header), which happens to clear facet 0's
// early terrain and is what makes it fully bit-deterministic across repeats
// (proven below with --repeats). `far-depth` is NOT reachable that way (a
// bare hold-right runs RIG into an obstacle and ends the attempt well short
// of scroll 62 — checked, see build.md) so it needs a REACTIVE ramp, and
// therefore inherits that ramp's own known bot-timing-jitter caveat (T-054's
// playtest.md already documents this: "two identically-scripted deterministic
// runs can still fork via frame-boundary input-delivery timing"). Reported as
// a RANGE across `--repeats`, never a single number, for that reason.
const MOMENTS = [
  { tag: 'near-open', scroll: 18, ramp: 'hold-right' },
  { tag: 'far-depth', scroll: 62, ramp: 'policy' },
].filter((m) => !ONLY || ONLY.split(',').includes(m.tag));
// The SAME reflex policy hulltex-capture.mjs's shots() drives with — reused
// (not copied) because it is shared harness infra (tools/playtest/lib/), the
// exact precedent this rig's header cites for what may and may not be
// imported. 'KeyJ' (fire) held throughout matches that lane's own driving.
const RAMP_SCRIPT = resolve(here, 'scripts', 'six-face-spaced-run.json');
const VARIANTS = [
  { tag: 'textured', query: '' },
  { tag: 'flat', query: '&tex=flat' },
];
const THRESH = 6;
const N_FRAMES = 8;

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* Duplicated from hulltex-capture.mjs's own local `policyTick` (not exported
   by lib/policy.mjs — that lane duplicates the same few lines rather than
   factoring it out, so this follows the established precedent instead of
   inventing a new shared-lib entry point on someone else's file). Applies one
   sample's worth of `evaluatePolicyTick` output as real held/tapped keys. */
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

/* The self-contained rAF loop: NO Node round trip once this starts (see the
   header's determinism note for why that is load-bearing). Assumes the
   caller has already gotten the run to (or past) `targetScroll` (or, for
   `keydownCode`, that the caller wants THIS call to also start holding a key)
   — this waits for the tick that confirms `targetScroll`, then grabs N
   consecutive frames of the frozen band via a cheap `drawImage` blit (no PNG
   anywhere in this rig).

   `keydownCode`, when given, is dispatched as a SYNTHETIC DOM KeyboardEvent
   (`window.dispatchEvent`, not `page.keyboard.down`) on this call's very
   FIRST tick — see build.md's fix-cycle note for why: a real CDP-injected key
   event and the game's own already-running `requestAnimationFrame` loop are
   two independently-scheduled browser tasks, and Chromium does not guarantee
   which one a given real-clock keydown lands before or after — exactly the
   "frame-boundary input-delivery timing" fork T-054's playtest.md already
   documented for full played-out runs, just showing up here as which tick
   first sees the key held. A script-dispatched event's listeners
   (src/main.js's own keydown handler; no `isTrusted` check, confirmed by
   reading it) run SYNCHRONOUSLY inside this same tick, so "right starts being
   held" happens at an exact, repeatable tick boundary instead of racing one.
   `finalCapture` also dispatches the matching keyup once capture is done, so
   the page is left in a clean released-key state before the context closes. */
async function finalCapture(page, targetScroll, keydownCode) {
  return page.evaluate(({ rect, n, targetScroll, keydownCode }) => new Promise((resolve, reject) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) { reject(new Error('no canvas on page')); return; }
    const off = document.createElement('canvas');
    off.width = rect.w; off.height = rect.h;
    const g = off.getContext('2d', { willReadFrequently: true });
    const out = [];
    let capturing = false, capCount = 0, ticks = 0, keyDispatched = false;
    const MAX_TICKS = 20000; // ~5.5 real minutes of rAF at 60fps-equivalent; a stuck run must not hang the rig forever
    function tick() {
      if (!keyDispatched && keydownCode) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: keydownCode }));
        keyDispatched = true;
      }
      if (++ticks > MAX_TICKS) { reject(new Error('stuck before scroll ' + targetScroll)); return; }
      const s = globalThis.__HULLBREAKER_TEST__.snapshot();
      if (!capturing) {
        if ((s.scrollX || 0) >= targetScroll || s.state === 'GAME_OVER') capturing = true;
        else { requestAnimationFrame(tick); return; }
      }
      if (capturing) {
        g.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const d = g.getImageData(0, 0, rect.w, rect.h).data;
        out.push({ scrollX: s.scrollX, state: s.state, data: Array.from(d) });
        capCount++;
        if (capCount >= n || s.state === 'GAME_OVER') {
          if (keydownCode) window.dispatchEvent(new KeyboardEvent('keyup', { code: keydownCode }));
          resolve(out);
          return;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }), { rect: RECT, n: N_FRAMES, targetScroll, keydownCode });
}

/* `policy` ramp: the SAME reflex policy hulltex-capture.mjs's shots() drives
   with, run from Node (real round trips, real bot-timing jitter — the
   caveat this moment's numbers carry, documented where MOMENTS is defined
   above). Once the sample shows the target reached, control hands off to
   `finalCapture`'s self-contained loop for the part that actually matters:
   the 8 frames the metrics are computed over. */
async function rampPolicy(page, targetScroll) {
  const rules = compilePolicy(JSON.parse(readFileSync(RAMP_SCRIPT, 'utf8')).policy);
  const held = new Set();
  const policyHeld = new Set();
  await page.keyboard.down('KeyJ');
  const deadline = Date.now() + 150000;
  let last = null;
  for (;;) {
    const sample = await page.evaluate(sampleState);
    last = sample;
    if (!sample) break;
    if ((sample.scrollX || 0) >= targetScroll) break;
    if (sample.state === 'GAME_OVER') break;
    if (Date.now() > deadline)
      throw new Error(`stuck at scroll ${(sample.scrollX || 0).toFixed(1)} state ${sample.state} after 150s`);
    await policyTick(page, rules, sample, held, policyHeld);
    await page.waitForTimeout(60);
  }
  return { last, policyHeld, held };
}
async function unrampPolicy(page, { policyHeld }) {
  for (const code of policyHeld) { try { await page.keyboard.up(code); } catch {} }
  await page.keyboard.up('KeyJ');
}

/* Waits for a REAL settled signal instead of a fixed real-clock timer — the
   fix-cycle finding this rig shipped without: a fixed wait is a guess at how
   long boot takes, and on a cold browser launch (no JIT warm-up yet, first
   ever asset fetch/decode against this process) it can guess short, which is
   what produced the intermittent "no canvas on page" BOOT ERROR and — more
   important — let the deterministic capture below start before
   awaitPreloads()'s real-wall-clock-timed settlement (src/render/preload.js,
   PRELOAD_BUDGET_MS) had actually finished, on SOME cold runs and not others.
   `state === 'PLAYING'` is the one signal that is only true once every
   module-scope `await` blocking main.js's own evaluation (including
   materials.js's `await awaitPreloads()`, which finishHullTex() and its
   GPU-uploading warmTexture() calls run synchronously right after) has
   already resolved — so waiting for it, rather than a duration, removes the
   race instead of hoping 400ms was always enough. */
async function waitUntilReady(page) {
  await page.waitForFunction(() => {
    const api = globalThis.__HULLBREAKER_TEST__;
    if (!api || typeof api.snapshot !== 'function') return false;
    const s = api.snapshot();
    return !!s && s.state === 'PLAYING' && !!document.querySelector('canvas');
  }, null, { timeout: 20000 });
  // TRIED AND DROPPED: also gating on window.__HB_HULL_TEX().buckets.length
  // (materials.js's own composited-tile snapshot, not just "the game loop
  // started") in case hull-texture compositing lagged `state === 'PLAYING'`.
  // Measured no difference (5 cold launches: 7804/7823/7823/7804/7804,
  // statistically the same spread as without it) — removed rather than kept
  // as unproven complexity. See build.md's fix-cycle section for what
  // remains unexplained.
}

async function captureMoment(browser, server, query, moment) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${server.baseUrl}/index.html?testapi=1&fixeddt=${FIXEDDT_MS}${query}`,
    { waitUntil: 'load' });
  let frames = null, bootError = null, died = false;
  try {
    await waitUntilReady(page);
    if (moment.ramp === 'policy') {
      const { last, ...rampState } = await rampPolicy(page, moment.scroll);
      if (!last || last.state === 'GAME_OVER' || (last.scrollX || 0) < moment.scroll) {
        died = true;
        await unrampPolicy(page, rampState);
      } else {
        frames = await finalCapture(page, moment.scroll);
        await unrampPolicy(page, rampState);
      }
    } else {
      // No page.keyboard.down here — see finalCapture's own header for why
      // the keydown is dispatched INSIDE the self-contained loop instead.
      frames = await finalCapture(page, moment.scroll, 'KeyD');
    }
  } catch (err) {
    bootError = err.message;
  }
  await context.close();
  return { frames, errors, bootError, died };
}

function toLumGrids(frames, rect) {
  return frames.map((f) => {
    const g = new Float64Array(rect.w * rect.h);
    for (let i = 0; i < g.length; i++) {
      const o = i * 4;
      g[i] = lum(f.data[o], f.data[o + 1], f.data[o + 2]);
    }
    return g;
  });
}

/* ---- metric 1: sign-reversal (SPRINT.md I-049's own specified test) ------ */
function reversalStats(grids) {
  const npx = grids[0].length;
  let changing = 0, reversing = 0;
  for (let p = 0; p < npx; p++) {
    const d = [];
    for (let t = 1; t < grids.length; t++) d.push(grids[t][p] - grids[t - 1][p]);
    if (!d.some((x) => Math.abs(x) > THRESH)) continue;
    changing++;
    for (let i = 0; i < d.length - 1; i++) {
      if (Math.abs(d[i]) > THRESH && Math.abs(d[i + 1]) > THRESH &&
          Math.sign(d[i]) !== Math.sign(d[i + 1])) { reversing++; break; }
    }
  }
  return { changing, reversing, pct: changing ? 100 * reversing / changing : 0 };
}

/* ---- metric 2: best-fit-shift residual (this rig's own addition) -------- */
function sampleBilinear(grid, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return null;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = grid[y0 * w + x0], b = grid[y0 * w + x1];
  const c = grid[y1 * w + x0], d = grid[y1 * w + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

// Content moves LEFT on screen as scrollX increases (the camera pans right
// over a world-anchored surface) — searched, not assumed, in a +-1px window
// around the shift the frame's own scroll delta and screenPxPerWorld()
// predict (hulltiles.js's own frame-centre approximation, documented there).
function residualStats(grids, scrolls, rect, viewportPxForPredict) {
  const pxPerWorld = screenPxPerWorld(CONFIG, viewportPxForPredict);
  const rmses = [], shifts = [];
  for (let t = 1; t < grids.length; t++) {
    const predictedShift = Math.max(0, (scrolls[t] - scrolls[t - 1]) * pxPerWorld);
    const lo = Math.max(0, predictedShift - 1), hi = predictedShift + 1;
    let best = null;
    for (let s = lo; s <= hi; s += 0.05) {
      let sq = 0, n = 0;
      for (let y = 0; y < rect.h; y++) {
        for (let x = 0; x < rect.w; x++) {
          const pred = sampleBilinear(grids[t - 1], rect.w, rect.h, x + s, y);
          if (pred === null) continue;
          const e = grids[t][y * rect.w + x] - pred;
          sq += e * e; n++;
        }
      }
      const rmse = n ? Math.sqrt(sq / n) : Infinity;
      if (!best || rmse < best.rmse) best = { shift: s, rmse };
    }
    rmses.push(best.rmse);
    shifts.push(best.shift);
  }
  return { meanRmse: rmses.reduce((a, b) => a + b, 0) / rmses.length, rmses, shifts };
}

async function measure() {
  mkdirSync(OUT, { recursive: true });
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = [];
  try {
    for (const m of MOMENTS) {
      for (const v of VARIANTS) {
        for (let r = 0; r < REPEATS; r++) {
          const { frames, errors, bootError, died } = await captureMoment(browser, server, v.query, m);
          if (bootError) {
            console.log(`  [${v.tag}] ${m.tag} run ${r}: BOOT ERROR ${bootError}`);
            report.push({ moment: m.tag, variant: v.tag, run: r, bootError });
            continue;
          }
          if (died) {
            console.log(`  [${v.tag}] ${m.tag} run ${r}: SKIPPED — died/stalled before scroll ${m.scroll}`);
            report.push({ moment: m.tag, variant: v.tag, run: r, skipped: true });
            continue;
          }
          const grids = toLumGrids(frames, RECT);
          const scrolls = frames.map((f) => f.scrollX);
          const rev = reversalStats(grids);
          const res = residualStats(grids, scrolls, RECT, VIEWPORT.height);
          const row = {
            moment: m.tag, variant: v.tag, run: r,
            firstScrollX: scrolls[0], lastState: frames[frames.length - 1].state,
            changing: rev.changing, reversing: rev.reversing, reversingPct: rev.pct,
            residualRmse: res.meanRmse, bestShifts: res.shifts,
            errors,
          };
          report.push(row);
          console.log(`  [${v.tag}] ${m.tag} run ${r}: scrollX0=${scrolls[0].toFixed(4)} ` +
            `changing=${rev.changing} reversing%=${rev.pct.toFixed(1)} residualRMSE=${res.meanRmse.toFixed(4)} ` +
            `errors=${errors.length ? errors.join('|') : 'none'}`);
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(join(OUT, 'shimmer-report.json'), JSON.stringify(report, null, 2));
  console.log('wrote ' + join(OUT, 'shimmer-report.json'));
  return report;
}

if (MODE === 'measure' || MODE === 'shots') {
  await measure();
} else {
  console.error('usage: node hulltex-shimmer.mjs [measure] [--moments a,b] [--repeats n] ' +
                '[--viewport WxH] [--fixeddt ms] [--out dir]');
  process.exit(2);
}
