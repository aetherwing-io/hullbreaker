// g2-capture.mjs — dev-only evidence script for the G2 neck access-plate
// flip gate (?g2=1: the greybox proposal's §G2 fixture on the transform
// machinery — halt 140 / pivot 154, an 11-tile plate reusing the landed
// relock-on-detent choreography, five routes, hound low + wasp apex).
// Cloned from transform-capture.mjs: same static server + playwright-core,
// same reason it is not wired into run.mjs (screenshot bursts keyed on the
// ritual's own telemetry clock).
//
//   node g2-capture.mjs shots     — the keyframe sequence
//
// Honesty notes: frames are keyed on telemetry state under ?fixeddt, so the
// captured tMs values recorded in index.json are the beat truth, not the
// filenames. Enemies are LIVE (unlike the cp3-transform-v3 capture) because
// the proposal's G2 spec includes the houndframe pressuring the low route
// and the wasp contesting the chimney apex — so route frames can show them.
// The input is the same closed-loop position-window driver as
// scripts/g2-neck-flip.json, re-implemented inline (the harness's policy
// layer lives in run.mjs, which cannot key screenshots to ritual tMs).

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(here, 'runs', 'g2-neck-flip');
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const QUERY = '?g2=1&testapi=1&fixeddt=16.6667';

const PROBE = () => {
  const api = globalThis.__HULLBREAKER_TEST__;
  if (!api) return null;
  const s = api.snapshot();
  return {
    gameMs: s.gameMs, state: s.state, scrollX: s.scrollX,
    x: s.player.x, y: s.player.y, grounded: s.player.grounded,
    transform: s.transform || null,
  };
};

// Keyframes on the gate's own clock: the approach lattice, the armed plate
// at the halted apron, the four ritual beats (windup / snap-1 clack /
// relock-and-rake on the hold / snap-2 commit), then the interior exits.
const KEYFRAMES = [
  ['00-approach-ribline',      (st, c) => st.gameMs > 1200],
  ['01-routes-converge',       (st, c) => st.x > 127],
  // The armed hold is short here (arm-by-lookahead at seam-4, ritual as soon
  // as the scroll halts: ~640 ms), so key the ajar frame INSIDE the armed
  // state, after the 500 ms unlatch+ajar swing has finished.
  ['02-plate-armed-ajar',      (st, c) => st.transform &&
                                          st.transform.eventState === 'armed' &&
                                          c.armedMs !== null && st.gameMs - c.armedMs > 520],
  ['03-flip-windup',           (st, c) => c.turning('neck-plate-flip', st, 17)],
  ['04-flip-snap1-clack',      (st, c) => c.turning('neck-plate-flip', st, 250)],
  ['05-flip-hold-relock-ramp', (st, c) => c.turning('neck-plate-flip', st, 420)],
  ['06-flip-snap2-committed',  (st, c) => c.turning('neck-plate-flip', st, 700)],
  ['07-interior-exits',        (st, c) => st.transform && st.transform.band === 1 &&
                                          st.transform.eventState !== 'turning' &&
                                          c.bandSeen(1, st) && st.gameMs - c.band1Ms > 900],
  ['08-neck-run-deep',         (st, c) => st.transform && st.transform.band === 1 && st.x > 173],
  ['09-neck-clear',            (st, c) => st.state !== 'PLAYING'],
];

// The same closed-loop route the committed script proves: a full jump fired
// from a launch window ahead of each authored gap, plus a jam-breaker.
const JUMP_WINDOWS = [
  [97.2, 99.4], [107.2, 109.4], [117.2, 119.4], [123.0, 125.4], [175.2, 177.4],
];

async function main() {
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/favicon/.test(m.location().url || '')) return;
      errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`${server.baseUrl}/index.html${QUERY}`, { waitUntil: 'load' });
    // Short settle only: the probe loop tolerates a null API, and every
    // wall-ms spent here is game-time the closed-loop driver is blind for
    // (the first gap is ~0.9 s of run from the spawn).
    await page.waitForTimeout(250);

    const ctx = {
      armedMs: null, band1Ms: null,
      turning(id, st, tMs) {
        const tr = st.transform;
        return !!tr && tr.event === id && tr.eventState === 'turning' && tr.tMs >= tMs;
      },
      bandSeen(n, st) {
        const key = 'band' + n + 'Ms';
        if (this[key] === null) this[key] = st.gameMs;
        return true;
      },
    };

    const held = new Set();
    const key = async (dir, code) => {
      if (dir === 'down' ? held.has(code) : !held.has(code)) return;
      if (dir === 'down') held.add(code); else held.delete(code);
      try { await page.keyboard[dir](code); } catch {}
    };
    await key('down', 'ArrowRight');
    await key('down', 'KeyJ');

    const taken = [];
    let next = 0;
    let jumpDownAt = null;
    let lastWindow = -1, lastX = 0, stuckMs = 0, lastSeenMs = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 120000 && next < KEYFRAMES.length) {
      const st = await page.evaluate(PROBE);
      if (st) {
        const tr = st.transform;
        if (tr && tr.event === 'neck-plate-flip' && tr.eventState === 'armed' && ctx.armedMs === null)
          ctx.armedMs = st.gameMs;
        // Fixture retry detection (x snapped back to spawn): the game-side
        // reset ran releaseAllKeys(), and Playwright synthesizes no key
        // auto-repeat — reassert every held key or the run dies at the
        // respawn (run.mjs's reassertHeldKeys, inlined).
        if (st.x < lastX - 5) {
          for (const code of [...held]) {
            try { await page.keyboard.up(code); await page.keyboard.down(code); } catch {}
          }
          lastWindow = -1;
        }
        // closed-loop jumps: launch windows before each gap, edge-triggered
        const wi = JUMP_WINDOWS.findIndex(([a, b]) => st.grounded && st.x > a && st.x < b);
        const dt = st.gameMs - lastSeenMs;
        lastSeenMs = st.gameMs;
        if (Math.abs(st.x - lastX) < 0.05 && st.grounded) stuckMs += dt; else stuckMs = 0;
        lastX = st.x;
        if (jumpDownAt === null && (wi >= 0 && wi !== lastWindow || stuckMs > 700)) {
          await key('down', 'Space');
          jumpDownAt = st.gameMs;
          lastWindow = wi >= 0 ? wi : lastWindow;
          stuckMs = 0;
        } else if (jumpDownAt !== null && st.gameMs - jumpDownAt >= 300) {
          await key('up', 'Space'); jumpDownAt = null;
        }
        while (next < KEYFRAMES.length && KEYFRAMES[next][1](st, ctx)) {
          const name = KEYFRAMES[next][0];
          await page.screenshot({ path: `${OUT}/${name}.png` });
          taken.push({
            name,
            gameMs: Math.round(st.gameMs),
            ritual: tr ? { event: tr.event, state: tr.eventState, tMs: Math.round(tr.tMs) } : null,
            altitude: tr ? +tr.altitude.toFixed(2) : null,
            band: tr ? tr.band : null,
            playerX: +st.x.toFixed(2),
          });
          console.log('shot', name, JSON.stringify(taken[taken.length - 1]));
          next++;
        }
      }
      await page.waitForTimeout(15);
    }
    for (const code of ['ArrowRight', 'KeyJ', 'Space']) await key('up', code);
    writeFileSync(`${OUT}/index.json`, JSON.stringify({ query: QUERY, taken, errors }, null, 2));
    console.log(`\n${taken.length}/${KEYFRAMES.length} frames -> ${OUT}`);
    if (errors.length) { console.log('CONSOLE ERRORS:', errors); process.exitCode = 1; }
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
