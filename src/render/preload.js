/* ========================== BOOT PRELOAD GATE ===================== */
/* Runtime assets are authorized (decisions.md entry 16) and this is the
   module that makes them safe to have: every asset the game loads becomes
   RESIDENT BEFORE THE SIMULATION'S FIRST FRAME, or it is abandoned.
   Drawn textures are uploaded; compositor-only sources are decoded on the
   CPU and their derived CanvasTextures are uploaded. Nothing fetches,
   decodes or uploads mid-run.

   WHY THIS EXISTS, MEASURED. T-040's playtest gate failed on the loading
   path, not on the art: three deterministic runs of the same script with a
   runtime sprite produced final sim clocks of 6352 / 6864 / 8308 ms and a
   crush-edge approach 2.4 tiles worse on one of them, while the same commit
   with the load skipped ran 6356 / 6359. A 16-round interleaved re-gate put
   that at 7/16 rounds deviating against a 0/16 control.

   WHAT THE MECHANISM IS NOT. The obvious explanation — the decode and the
   GPU upload landing inside a frame the loop is also stepping physics
   through — is DISPROVED on this lane, and the disproof is worth keeping in
   front of the next reader so it is not re-derived a third time. Loading
   five textures and never drawing them still deviated 12/12; 25ms of
   artificial boot latency with no assets at all stayed at the control's
   baseline; and forcing the upload to completion at boot (the warm-up
   below) changed nothing. Whatever the perturbation is, it travels with the
   fetch/decode itself and survives everything this module can do about it.
   That is why the residual is filed as a harness determinism-mode defect
   rather than as something this gate can close. Evidence:
   reports/tasks/T-049/build.md §8, i039-evidence/ (132 runs).

   WHAT THIS MODULE STILL BUYS, on its own merits: nothing fetches, decodes
   or uploads DURING a run, so no lane can put a stall in front of a player
   mid-game, and a second lane's asset cannot be starved by the first.

   Determinism is what every playtest gate in this repo rests on, and a
   player must not get a materially different run because a texture landed a
   frame later. So the contract is:

     1. Everything registered here is awaited AT MODULE SCOPE by its owner,
        which holds the ES module graph — and therefore src/main.js, which
        imports it — until the assets are resident. The sim's first frame
        cannot run before that. ANY NUMBER OF MODULES may register and
        await: they share one settlement and one clock, so a second lane's
        asset is waited for rather than discarded (see settle()).
     2. Residency means UPLOADED, not merely fetched, for every texture that
        will be drawn: renderer.initTexture() pushes its texels during boot,
        because a texture that has only arrived still uploads on first draw.
        A source marked cpuOnly is never drawn; it is decoded for a boot-time
        canvas compositor and excluded from this upload pass. The compositor's
        derived CanvasTextures are warmed explicitly before frame one.
     3. There is ONE wall-clock budget for the whole boot. When it expires,
        everything still in flight is abandoned and its owner falls back —
        a slow network delays the game, it never wedges it. The budget is
        well inside the T-032 bootstrap's 10s "still loading" watchdog.
     4. A LATE ARRIVAL IS DROPPED, permanently. Applying a texture that
        turned up after the gate closed would put an upload mid-run: the
        exact defect, just rarer and harder to reproduce. It is disposed
        instead, and the owner keeps whatever fallback it already chose.
     5. EVERY DIAGNOSTIC STATES WHAT HAPPENED. A timeout reports the time
        actually waited, and an asset registered after the gate closed is
        refused by name rather than reported as a timeout that never was.

   Layer note: this is a render module and knows nothing about the sim. No
   sim or pure module may import it, and nothing here is readable from one —
   gameplay must not be able to tell whether an asset arrived. */

import * as THREE from 'three';
import { QUERY } from '../mode.js';
import { renderer } from './scene.js';

/* One budget for every asset the boot registers. Desktop keeps the measured
   2500ms contract used by the deterministic harness. A touch device OR a
   narrow portrait viewport gets a wider 6500ms cold-start window: real
   iPhone/Safari evidence showed the three large Meridian depth sources losing
   the 2500ms race on GitHub Pages, leaving the technically playable but
   visually unacceptable primitive fallback for the whole run. The viewport
   clause covers in-app iOS browsers that report neither maxTouchPoints nor a
   coarse pointer. Both limits remain inside the bootstrap's 10s loading
   watchdog, and the gate still closes before simulation frame one. */
export const PRELOAD_BUDGET_MS = 2500;
export const MOBILE_PRELOAD_BUDGET_MS = 6500;
const TOUCH_PRELOAD = typeof navigator !== 'undefined' &&
  (navigator.maxTouchPoints > 0 ||
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));
const PORTRAIT_PRELOAD = typeof innerWidth === 'number' && typeof innerHeight === 'number' &&
  innerWidth <= 600 && innerHeight > innerWidth;
const MOBILE_PRELOAD = TOUCH_PRELOAD || PORTRAIT_PRELOAD;
const activePreloadBudgetMs = MOBILE_PRELOAD
  ? MOBILE_PRELOAD_BUDGET_MS : PRELOAD_BUDGET_MS;

/* How many macrotask turns the registry must stay QUIET before the gate
   counts registration as finished. Two is enough for sibling modules to
   evaluate and register (module-graph evaluation continues while the first
   caller's await is suspended) and costs a fraction of a millisecond; it
   exists because a caller that awaits before anyone registers used to close
   the gate on every asset-owning lane behind it. */
const GRACE_TURNS = 2;

const entries = new Map();               // url -> entry (see preloadTexture)
let closed = false;
let startedAt = 0;
let deadlineAt = 0;                      // startedAt + the budget: ONE clock for
                                         //   every caller, set at first register
let closedAfterMs = 0;                   // what the gate actually cost the boot
let gate = null;                         // the ONE in-flight settlement promise
let warmMs = 0;                          // what the GPU warm-up cost, measured
let warmedWhileClosed = false;           // …and whether it ran while the gate was
                                         //   still shut. Recorded rather than
                                         //   inferred: a check that the warm-up
                                         //   happens BEFORE the gate opens cannot
                                         //   be made from timings alone (the first
                                         //   attempt passed with the two lines
                                         //   swapped), so the module states it.

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now() : Date.now();
}

/* Everything a texture needs before it is drawn, done during boot:
     - sRGB, because the art is authored in sRGB and the renderer's output
       space is too; leaving it unset renders the whole set washed out;
     - mipmaps + linear minification, because at the shipped FAR view these
       are drawn SMALLER than their texel grid, and nearest sampling on a
       moving 30px sprite crawls;
     - initTexture(), which is the whole point: the upload happens here. */
function prepare(tex, opts) {
  tex.colorSpace = THREE.SRGBColorSpace;
  // A source plate used only by a boot-time canvas compositor needs decoded
  // pixels, not its own WebGL allocation. The derived CanvasTextures are
  // warmed separately after composition; uploading this often-NPOT source as
  // well wastes memory and makes the manifest's `gpu:false` record dishonest.
  if (opts.cpuOnly) {
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = opts.magFilter || THREE.LinearFilter;
    return;
  }
  tex.anisotropy = opts.anisotropy || 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = opts.magFilter || THREE.LinearFilter;
  tex.needsUpdate = true;
  if (typeof renderer.initTexture === 'function') renderer.initTexture(tex);
}

/* Register one texture with the boot gate. The returned promise resolves —
   never rejects — with the entry: `{ state: 'ready', tex }` or
   `{ state: 'failed'|'timeout', error }`. A caller that gets anything but
   'ready' is expected to have a complete fallback already drawing.       */
export function preloadTexture(url, opts = {}) {
  const existing = entries.get(url);
  if (existing) return existing.promise;
  // Registering after the gate has closed is REFUSED, loudly and honestly.
  // The alternative — quietly accepting it — would either load during the
  // run (the defect this module exists to remove) or leave the caller
  // waiting on a promise nothing will ever settle. It is a caller bug:
  // register at module scope, then await.
  if (closed) {
    const e = {
      url, state: 'refused', tex: null, ms: 0,
      error: 'registered after the boot gate closed; nothing was loaded',
    };
    e.promise = Promise.resolve(e);
    entries.set(url, e);
    const line = 'HULLBREAKER art: ' + url + ' was registered after the boot gate ' +
      'closed and will NOT be loaded — register it at module scope, before the ' +
      'first await of awaitPreloads().';
    console.warn(line);
    return e.promise;
  }
  if (startedAt === 0) {
    startedAt = nowMs();
    deadlineAt = startedAt + activePreloadBudgetMs;
  }
  const e = {
    url, state: 'pending', tex: null, error: null, ms: 0,
    cpuOnly: opts.cpuOnly === true,
  };
  e.promise = new Promise((resolve) => { e.settle = resolve; });
  entries.set(url, e);

  const done = (state, extra) => {
    if (e.state !== 'pending') return;    // already settled or closed out
    e.state = state;
    e.ms = Math.round(nowMs() - startedAt);
    Object.assign(e, extra);
    e.settle(e);
  };

  const fail = (why) => done('failed', { error: String(why) });

  try {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        // condition 4: after the gate closes, a texture that finally turns
        // up is thrown away rather than uploaded into a running frame
        if (closed || e.state !== 'pending') { tex.dispose(); return; }
        try {
          prepare(tex, opts);
          done('ready', { tex });
        } catch (err) {
          tex.dispose();
          fail('the texture arrived but could not be prepared: ' +
            ((err && err.message) || err));
        }
      },
      undefined,
      (err) => fail((err && err.type) || 'load error'),
    );
  } catch (err) {                         // a loader that throws synchronously
    fail((err && err.message) || 'loader threw');
  }
  return e.promise;
}

/* ------------------------- THE GPU WARM-UP (I-039) ---------------------- *
 * MEASURED: THIS DOES NOT FIX I-039. Do not read its presence as a solved
 * determinism bug. On this lane, 16 interleaved rounds: 11/16 rounds
 * deviating with the warm-up OFF, 14/16 with it ON, against a 1/16 control —
 * no improvement. Two further controls say why it cannot be the fix: loading
 * five textures and NEVER DRAWING them still deviated 12/12, and 25ms of
 * artificial boot latency with no assets at all stayed at the control's
 * baseline. The trigger is the fetch/decode itself, not a draw-time stall
 * and not boot latency. Full data: reports/tasks/T-049/build.md §8 and
 * reports/tasks/T-049/i039-evidence/ (132 runs).
 *
 * WHAT THAT MEASUREMENT DOES **NOT** COVER, so nobody inherits a wrong
 * conclusion from it: every asset in those 132 runs was a 32-64px sprite of
 * 0.6-2.9 kB — a trivial mipmap chain. Whether this helps a LARGE texture
 * (RIG's 256x256, a backdrop plate, a hull tile) is untested at any useful
 * n: T-040 got 1/7 with it against 4/7 without — opposite in direction to
 * the numbers above and noise at that size — before its worktree was pruned
 * mid-run. So "does the warm-up earn its 8-14ms on a big asset?" is OPEN,
 * not answered no. It is ~40 minutes to settle: ?warm=0 for the A/B, and
 * measure against a scratch copy of the tree (git archive | tar -x) rather
 * than the live worktree, which is what interfered with the last attempt.
 *
 * It is KEPT anyway, and only for this reason: the hazard it addresses is
 * real and argued independently of I-039 — a texture whose bytes have
 * arrived and whose upload has been REQUESTED can still have its real work
 * (mipmap generation, the texture object upload) deferred by the driver
 * until something forces it, and the first thing that would force it is
 * frame 1, which is a simulated frame. It costs a measured 8-14ms once, at
 * boot. If a future measurement shows it buying nothing anywhere, delete it;
 * ?warm=0 exists so that stays cheap to check.
 *
 * The original hypothesis, for the record — T-040's 16-round re-gate found
 * its control invariant (16/16 runs dispatching 18 of 26 events) while its
 * shipped sprite build deviated in 7 of 16, worst case gameMsMax 8299ms and
 * a crush approach 2.3 tiles worse, from byte-identical input. Deferred
 * upload was the best guess at the time. The controls above disproved it.
 *
 * So the gate ends by drawing every resident texture once into a 4x4
 * offscreen target and then READING ONE PIXEL BACK. The readback is the
 * whole trick: readRenderTargetPixels blocks until the GPU has actually
 * executed the queued work, so there is nothing left for frame 1 to absorb.
 * It is bounded (one tiny draw per texture, one 1px read), offscreen (the
 * visible canvas is never touched — the previous render target is restored),
 * and it can never fail the boot: every error here is swallowed, because a
 * warm-up that did not happen is slower, not broken.
 *
 * ?warm=0 skips it. That is an A/B for a measurement, not a feature flag:
 * it is what makes the before/after in reports/tasks/T-049/build.md §9 a
 * controlled comparison rather than two different builds.                  */
// ?warm=0 disables the warm-up above. NB: the warm-up does NOT fix I-039
// (measured — see the block above and build.md §8); this flag is the A/B
// that keeps that falsifiable, not a switch for a known-good feature.
export const WARM_ON = QUERY.get('warm') !== '0';
const WARM_PX = 4;                       // enough to sample a mip, small enough
                                         //   that the draw itself costs nothing

function forceTextureBatch(textures) {
  const started = nowMs();
  let rt = null, geo = null;
  const mats = [];
  try {
    rt = new THREE.WebGLRenderTarget(WARM_PX, WARM_PX);
    const warmScene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    cam.position.z = 1;
    geo = new THREE.PlaneGeometry(2, 2);
    for (const tex of textures) {
      // Canvas/composite textures are created only after their decoded source
      // images settle, so they cannot join the URL registry above. They still
      // need the same explicit upload before main.js can enter PLAYING.
      if (typeof renderer.initTexture === 'function') renderer.initTexture(tex);
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      mats.push(m);
      warmScene.add(new THREE.Mesh(geo, m));
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(warmScene, cam);
    const px = new Uint8Array(4);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);   // blocks on the GPU
    renderer.setRenderTarget(prev);
  } catch (err) {
    console.warn('HULLBREAKER art: the GPU warm-up was skipped — ' +
      ((err && err.message) || err) + '; the art is loaded either way.');
  } finally {
    for (const m of mats) m.dispose();   // the MATERIALS are scratch; the
    if (geo) geo.dispose();              //   textures they sample are not
    if (rt) rt.dispose();
  }
  return Math.round(nowMs() - started);
}

function warmResident(ready) {
  // Decoded compositor inputs are never mapped. Uploading them here would
  // undo prepare(..., { cpuOnly:true }) and allocate a duplicate NPOT GPU
  // texture immediately before the derived canvas is warmed.
  const drawable = ready.filter((e) => !e.cpuOnly);
  if (!WARM_ON || !drawable.length) return 0;
  warmedWhileClosed = !closed;           // observable ordering; see the field
  return forceTextureBatch(drawable.map((e) => e.tex));
}

/* Derived CanvasTextures cannot be registered until their decoded source
   images exist, which is after the shared URL gate has settled. Their owner
   still evaluates before main.js starts its first frame, so it can use this
   small companion to force upload/readback in that remaining boot window.
   This does not reopen the gate, fetch an asset, or change visibility. */
export function warmDerivedTextures(textures) {
  const unique = [...new Set(textures)].filter((tex) => tex && tex.isTexture);
  if (!WARM_ON || !unique.length)
    return { requested: unique.length, warmed: 0, ms: 0 };
  return {
    requested: unique.length,
    warmed: unique.length,
    ms: forceTextureBatch(unique),
  };
}

/* THE ONE SETTLEMENT ROUTINE. Every caller of awaitPreloads() awaits this
   same promise, and it closes the gate exactly once.

   It re-reads `entries` after every wait instead of racing a snapshot taken
   at entry, because a SIBLING MODULE registering while this is suspended is
   the normal case, not an edge one: with top-level await, one module's
   `await awaitPreloads()` yields and the rest of the module graph goes on
   evaluating — which is precisely when a second lane's registration lands.
   The first version of this function raced its own snapshot and then
   force-marked everything else 'timeout', so a second module's texture was
   discarded within milliseconds and told it had missed a 2500ms budget it
   was never given. That was found by review, reproduced 7 times in 10, and
   is what this loop and the single `deadlineAt` exist to prevent. */
async function settle() {
  let quiet = 0;
  for (;;) {
    const pending = [...entries.values()].filter((e) => e.state === 'pending');
    if (!pending.length) {
      /* NOTHING LEFT IN FLIGHT — but that is not the same as "nobody else is
         coming". Registration happens during module-graph evaluation, which
         goes on running while this await is suspended, and evaluation ORDER
         is decided by the import graph rather than by who owns an asset. A
         lane that awaits the gate before the asset owner's module body has
         run would otherwise close it on everyone: measured, before this
         loop existed, as both asset lanes REFUSED and zero art loaded, 3
         trials of 3 (tools/playtest/fixtures/preload-concurrency/
         lane-awaits-first.js, and the check that now covers it).

         So the registry has to be QUIET for a couple of macrotask turns
         before it counts as complete. Two turns is sub-millisecond and it
         is bounded by the same deadline as everything else. */
      if (quiet >= GRACE_TURNS) break;
      if (deadlineAt && nowMs() >= deadlineAt) break;
      quiet++;
      await new Promise((r) => setTimeout(r, 0));
      continue;
    }
    quiet = 0;                                // somebody arrived: start over
    const left = deadlineAt - nowMs();
    if (left <= 0) break;                     // the ONE budget, not a fresh one
    let timer = null;
    await Promise.race([
      Promise.all(pending.map((e) => e.promise)),
      new Promise((r) => { timer = setTimeout(r, left); }),
    ]);
    if (timer !== null) clearTimeout(timer);
  }
  // force the GPU to finish what it was given BEFORE the gate opens, then
  // close. Order matters: warming after `closed = true` would be warming
  // after the first frame is already allowed to run.
  warmMs = warmResident([...entries.values()].filter((e) => e.state === 'ready'));
  closed = true;
  closedAfterMs = startedAt ? Math.round(nowMs() - startedAt) : 0;
  for (const e of entries.values()) {
    if (e.state !== 'pending') continue;
    // the message states what actually elapsed. Reporting the budget here
    // regardless of how long was spent was the other half of the review
    // finding: a 4ms discard that claimed 2500ms of patience.
    const waited = Math.round(nowMs() - startedAt);
    e.state = 'timeout';
    e.ms = waited;
    e.error = 'still loading after ' + waited + 'ms of the ' +
      activePreloadBudgetMs + 'ms boot budget';
    console.warn('HULLBREAKER art: ' + e.url + ' — ' + e.error +
      '; the game is starting without it.');
    e.settle(e);
  }
}

/* Await every registered asset, or the shared budget, whichever comes
   first. The owner calls this at MODULE SCOPE (`await awaitPreloads()`),
   which is what holds the boot.

   Every caller — however many modules, in whatever order — awaits the SAME
   settlement, on the SAME clock started at the first registration. An asset
   registered while the gate is open is waited for by all of them; one
   registered after it has closed is refused by preloadTexture() above
   rather than silently starved. */
export function awaitPreloads() {
  if (closed) return Promise.resolve();
  if (!gate) gate = settle();
  return gate;
}

/* Read surface for the console and the headless gates: what was registered,
   what state it ended in, and how long the boot spent on it. */
export function preloadSnapshot() {
  return {
    closed,
    budgetMs: activePreloadBudgetMs,
    desktopBudgetMs: PRELOAD_BUDGET_MS,
    mobileBudgetMs: MOBILE_PRELOAD_BUDGET_MS,
    touchBudget: TOUCH_PRELOAD,
    portraitBudget: PORTRAIT_PRELOAD,
    mobileBudgetActive: MOBILE_PRELOAD,
    // what the gate COST THE BOOT: frozen when it closed, not "time since
    // the page loaded" — the first version of this field reported the
    // latter and read like a 6-second stall in a 14ms preload.
    costMs: closedAfterMs,
    warmOn: WARM_ON,
    warmMs,
    warmedWhileClosed,
    assets: [...entries.values()].map((e) => ({
      url: e.url, state: e.state, ms: e.ms, error: e.error,
      residency: e.cpuOnly ? 'cpu' : 'gpu',
    })),
  };
}

if (typeof window !== 'undefined') window.__HB_PRELOAD = preloadSnapshot;
