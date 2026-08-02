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
        cannot run before that.
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

   Layer note: this is a render module and knows nothing about the sim. No
   sim or pure module may import it, and nothing here is readable from one —
   gameplay must not be able to tell whether an asset arrived. */

import * as THREE from 'three';
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
let closedAfterMs = 0;                   // what the gate actually cost the boot

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
  if (startedAt === 0) startedAt = nowMs();
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

/* Await every registered asset, or the budget, whichever comes first. The
   owner calls this at MODULE SCOPE (`await awaitPreloads()`), which is what
   holds the boot. Safe to call more than once and from more than one
   module: the second caller gets the same closed gate. */
export async function awaitPreloads() {
  if (closed) return;
  const pending = [...entries.values()].map((e) => e.promise);
  if (pending.length) {
    let timer = null;
    await Promise.race([
      Promise.all(pending),
      new Promise((r) => { timer = setTimeout(r, PRELOAD_BUDGET_MS); }),
    ]);
    if (timer !== null) clearTimeout(timer);
  }
  closed = true;
  closedAfterMs = startedAt ? Math.round(nowMs() - startedAt) : 0;
  for (const e of entries.values()) {
    if (e.state !== 'pending') continue;
    e.state = 'timeout';
    e.ms = Math.round(nowMs() - startedAt);
    e.error = 'still loading after the ' + PRELOAD_BUDGET_MS + 'ms boot budget';
    console.warn('HULLBREAKER art: ' + e.url + ' — ' + e.error +
      '; the game is starting without it.');
    e.settle(e);
  }
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
    assets: [...entries.values()].map((e) => ({
      url: e.url, state: e.state, ms: e.ms, error: e.error,
    })),
  };
}

if (typeof window !== 'undefined') window.__HB_PRELOAD = preloadSnapshot;
