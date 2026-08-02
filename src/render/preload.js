/* ========================== BOOT PRELOAD GATE ===================== */
/* Runtime assets are authorized (decisions.md entry 16) and this is the
   module that makes them safe to have: every asset the game loads becomes
   RESIDENT BEFORE THE SIMULATION'S FIRST FRAME, or it is abandoned.
   Nothing fetches, decodes or uploads mid-run.

   WHY THIS EXISTS, MEASURED. T-040's playtest gate failed on the loading
   path, not on the art: three deterministic runs of the same script with a
   runtime sprite produced final sim clocks of 6352 / 6864 / 8308 ms and a
   crush-edge approach 2.4 tiles worse on one of them, while the same commit
   with the load skipped ran 6356 / 6359. This lane reproduced the same class
   of defect on the enemy sprites — one run in four finished 1036 ms of sim
   time short of the others (reports/tasks/T-049/build.md). The cause is not
   the network wait, which the game survives happily; it is that the DECODE
   and the GPU UPLOAD land inside a frame while the loop is also stepping
   physics, and a stalled frame is a longer dt for the whole world.

   Determinism is what every playtest gate in this repo rests on, and a
   player must not get a materially different run because a texture landed a
   frame later. So the contract is:

     1. Everything registered here is awaited AT MODULE SCOPE by its owner,
        which holds the ES module graph — and therefore src/main.js, which
        imports it — until the assets are resident. The sim's first frame
        cannot run before that. ANY NUMBER OF MODULES may register and
        await: they share one settlement and one clock, so a second lane's
        asset is waited for rather than discarded (see settle()).
     2. Residency means UPLOADED, not fetched: renderer.initTexture() pushes
        the texels to the GPU during boot, because a texture that has only
        arrived still uploads on its first draw, which moves the hitch
        rather than removing it.
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

/* One budget for every asset the boot registers. 2500ms is a judgement, not
   a measurement: long enough for the whole generated set over a cold local
   server, short enough that a player on a bad connection gets the game
   (with primitives) rather than a white page, and far inside the failure
   bootstrap's 10s boot watchdog so a slow load never paints a panel. */
export const PRELOAD_BUDGET_MS = 2500;

const entries = new Map();               // url -> entry (see preloadTexture)
let closed = false;
let startedAt = 0;
let deadlineAt = 0;                      // startedAt + the budget: ONE clock for
                                         //   every caller, set at first register
let closedAfterMs = 0;                   // what the gate actually cost the boot
let gate = null;                         // the ONE in-flight settlement promise
let warmMs = 0;                          // what the GPU warm-up cost, measured

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
    deadlineAt = startedAt + PRELOAD_BUDGET_MS;
  }
  const e = { url, state: 'pending', tex: null, error: null, ms: 0 };
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
 * Awaiting the load is NOT enough, and this is the measured reason. T-040's
 * 16-round interleaved re-gate (one run of each condition per round, so
 * session load hits all three equally) found the control invariant — 16/16
 * runs dispatched exactly 18 of 26 events — while the shipped sprite build
 * deviated in 7 of 16, worst case 23 dispatched, gameMsMax 8299ms and a
 * crush approach 2.3 tiles worse than every control run, from byte-identical
 * input. A texture whose bytes have arrived and whose upload has been
 * REQUESTED can still have its real work (mipmap generation, the actual
 * texture object upload) deferred by the driver until something forces it —
 * and the first thing that forces it is frame 1, which is a simulated frame.
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
export const WARM_ON = QUERY.get('warm') !== '0';
const WARM_PX = 4;                       // enough to sample a mip, small enough
                                         //   that the draw itself costs nothing

function warmResident(ready) {
  if (!WARM_ON || !ready.length) return 0;
  const started = nowMs();
  let rt = null, geo = null;
  const mats = [];
  try {
    rt = new THREE.WebGLRenderTarget(WARM_PX, WARM_PX);
    const warmScene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    cam.position.z = 1;
    geo = new THREE.PlaneGeometry(2, 2);
    for (const e of ready) {
      const m = new THREE.MeshBasicMaterial({ map: e.tex, transparent: true });
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
  for (;;) {
    const pending = [...entries.values()].filter((e) => e.state === 'pending');
    if (!pending.length) break;               // everything registered so far is in
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
      PRELOAD_BUDGET_MS + 'ms boot budget';
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
    budgetMs: PRELOAD_BUDGET_MS,
    // what the gate COST THE BOOT: frozen when it closed, not "time since
    // the page loaded" — the first version of this field reported the
    // latter and read like a 6-second stall in a 14ms preload.
    costMs: closedAfterMs,
    warmOn: WARM_ON,
    warmMs,
    assets: [...entries.values()].map((e) => ({
      url: e.url, state: e.state, ms: e.ms, error: e.error,
    })),
  };
}

if (typeof window !== 'undefined') window.__HB_PRELOAD = preloadSnapshot;
