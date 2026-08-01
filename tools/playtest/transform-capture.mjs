// transform-capture.mjs — dev-only evidence script for the CP3 v3 transform
// rework (?slice=transform: flip and breach as RIG ascending around a static,
// prebuilt body; only the access plate / vent cover moves, chunkiness lives in
// the camera's detents). Reuses the playtest harness's static server +
// playwright-core; not wired into run.mjs because it needs screenshot bursts
// keyed on the transform ritual's own clock (the additive `transform` block
// in ?testapi=1), which run.mjs's fixed sampling cadence cannot guarantee.
//
//   node transform-capture.mjs shots     — the keyframe sequence
//
// Honesty note: frames are keyed on telemetry state under ?fixeddt, so the
// captured tMs values are recorded next to each frame in index.json — trust
// those numbers, not the filenames, for exact beat placement. The input is
// the same open-loop cadence as scripts/transform-slice.json (hold right,
// hold fire, jump every 620 game-ms), keyed to GAME time.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(here, 'runs', 'transform-v3');
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const QUERY = '?slice=transform&enemies=0&testapi=1&fixeddt=16.6667';

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

// Keyframes on the ritual's own clock. Each predicate sees (st, ctx) where
// ctx carries first-seen game times for the arm states and band commits.
const KEYFRAMES = [
  ['00-approach-face-a',        (st, c) => st.gameMs > 1400],
  ['01-flip-armed-plate-ajar',  (st, c) => c.flipArmedMs !== null && st.gameMs - c.flipArmedMs > 700],
  ['02-flip-windup',            (st, c) => c.turning('bulkhead-flip', st, 17)],
  ['03-flip-snap1-plate-clack', (st, c) => c.turning('bulkhead-flip', st, 250)],
  ['04-flip-hold-relocked',     (st, c) => c.turning('bulkhead-flip', st, 400)],
  ['05-flip-snap2-committed',   (st, c) => c.turning('bulkhead-flip', st, 700)],
  ['06-interior-run',           (st, c) => st.transform && st.transform.band === 1 &&
                                           st.transform.eventState !== 'turning' &&
                                           c.bandSeen(1, st) && st.gameMs - c.band1Ms > 900],
  ['07-interior-climb-high',    (st, c) => st.transform && st.transform.band === 1 &&
                                           st.transform.altitude >= 10],
  ['08-breach-armed-shut',      (st, c) => c.breachArmedMs !== null && st.gameMs - c.breachArmedMs > 500],
  ['09-breach-windup-strain',   (st, c) => c.turning('breach-return', st, 17)],
  ['10-breach-snap1-vapor',     (st, c) => c.turning('breach-return', st, 250)],
  ['11-breach-hold-clearing',   (st, c) => c.turning('breach-return', st, 480)],
  ['12-breach-snap2-altitude',  (st, c) => c.turning('breach-return', st, 700)],
  ['13-face-c-high-run',        (st, c) => st.transform && st.transform.band === 2 &&
                                           st.transform.eventState === 'complete' &&
                                           c.bandSeen(2, st) && st.gameMs - c.band2Ms > 1100],
  ['14-breach-clear',           (st, c) => st.state !== 'PLAYING'],
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
    await page.waitForTimeout(600);

    const ctx = {
      flipArmedMs: null, breachArmedMs: null, band1Ms: null, band2Ms: null,
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
    let jumpDownAt = null, lastJump = -700;
    const t0 = Date.now();
    while (Date.now() - t0 < 120000 && next < KEYFRAMES.length) {
      const st = await page.evaluate(PROBE);
      if (st) {
        const tr = st.transform;
        if (tr && tr.event === 'bulkhead-flip' && tr.eventState === 'armed' && ctx.flipArmedMs === null)
          ctx.flipArmedMs = st.gameMs;
        if (tr && tr.event === 'breach-return' && tr.eventState === 'armed' && ctx.breachArmedMs === null)
          ctx.breachArmedMs = st.gameMs;
        // same cadence as scripts/transform-slice.json, keyed to game time
        if (jumpDownAt === null && st.gameMs - lastJump >= 620) {
          await key('down', 'Space'); jumpDownAt = st.gameMs; lastJump = st.gameMs;
        } else if (jumpDownAt !== null && st.gameMs - jumpDownAt >= 310) {
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
