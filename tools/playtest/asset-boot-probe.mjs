// asset-boot-probe.mjs — does a runtime asset cost the game BOOT TIME or
// FRAME TIME? Written for T-049 after T-040's playtest gate failed on the
// loading path, and kept because any lane that loads an asset needs to be
// able to answer that question in one command.
//
//   node asset-boot-probe.mjs                       this worktree only
//   T049_BASE=/path/to/base node asset-boot-probe.mjs   …and a control tree
//
// Per condition (merge-base if given, then ?sprites=0, then the shipped
// default), five page loads, each reporting:
//
//   pageFirstPlaying   ms from navigation to the first PLAYING frame, taken
//                      INSIDE the page — the honest "how long before the
//                      player is playing" number
//   preload            what src/render/preload.js's boot gate cost, and how
//                      many assets came back resident
//   perf               window.HB.perf() after 6s of held input: fps, avg,
//                      WORST frame, and frames over 20ms — a mid-run decode
//                      or GPU upload shows up here and nowhere else
//   gameMs             sim time accumulated in that fixed 6s wall window;
//                      with the window fixed from out here, this is directly
//                      comparable between conditions
//
// WHY NOT run.mjs's gameMsMax: on mid-route.json that number is quantized by
// the harness's own ~13Hz sampler (deterministic dispatch lands an event on
// whichever sample crosses its gameMs) and by whether the bot reached victory
// at all, so it is bimodal in EVERY condition — including one with no runtime
// asset. See reports/tasks/T-049/build.md §6. This probe fixes the window and
// measures the causes instead.
//
// HONESTY NOTES:
//   * Five loads per condition on one development machine in headless
//     Chrome. Other agents running browsers on the same machine move these
//     numbers; run conditions back to back and distrust a single reading.
//   * rAF is vsync-locked, so fps is a ceiling. worstMs and over20ms are the
//     load-bearing fields.
//   * A cold HTTP cache is not simulated: every page here is a fresh context
//     against a local server, which is the FAST case for a fetch.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.T049_BASE || null;   // optional second root
const RUN_MS = 6000;

const READ = () => ({
  preload: typeof window.__HB_PRELOAD === 'function' ? window.__HB_PRELOAD() : null,
  sprites: typeof window.__HB_SPRITES === 'function' ? window.__HB_SPRITES() : null,
  perf: window.HB.perf(),
  // boot timeline, from the page's own navigation clock
  nav: (() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? {
      domContentLoaded: Math.round(n.domContentLoadedEventEnd),
      loadEvent: Math.round(n.loadEventEnd),
    } : null;
  })(),
  firstPlayingAt: window.__T049_FIRST_PLAYING || null,
  gameMs: window.HB.gameMs(),
});

const WATCH = () => {
  const t = () => Math.round(performance.now());
  const tick = () => {
    if (window.HB && window.HB.state() === 'PLAYING') {
      if (!window.__T049_FIRST_PLAYING) window.__T049_FIRST_PLAYING = t();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const server = await startStaticServer(repoRoot, { port: 0 });
const baseServer = BASE ? await startStaticServer(BASE, { port: 0 }) : null;

const CONDITIONS = [
  ...(baseServer ? [['merge-base', baseServer.baseUrl, '']] : []),
  ['sprites-off', server.baseUrl, '&sprites=0'],
  ['sprites-on', server.baseUrl, ''],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [id, origin, qs] of CONDITIONS) {
  for (let i = 1; i <= 5; i++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(WATCH);
    const t0 = Date.now();
    await page.goto(`${origin}/index.html?slice=traversal&testapi=1${qs}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.HB && window.HB.state() === 'PLAYING', { timeout: 20000 });
    const playingAt = Date.now() - t0;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(RUN_MS);
    const out = await page.evaluate(READ);
    await page.keyboard.up('ArrowRight');
    const pre = out.preload;
    console.log(
      `${id.padEnd(12)} #${i}  nodeSawPlaying=${String(playingAt).padStart(5)}ms  ` +
      `pageFirstPlaying=${String(out.firstPlayingAt).padStart(5)}ms  ` +
      `dcl=${String(out.nav && out.nav.domContentLoaded).padStart(4)}  ` +
      `preload=${pre ? pre.costMs + 'ms/' + pre.assets.filter((a) => a.state === 'ready').length + ' ready' : '-'}  ` +
      `perf fps=${out.perf.fps} avg=${out.perf.avgMs.toFixed(2)} worst=${out.perf.worstMs.toFixed(2)} over20=${out.perf.over20ms}  ` +
      `gameMs=${Math.round(out.gameMs)}`);
    if (pre && i === 1) {
      for (const a of pre.assets) {
        console.log(`             ${a.state.padEnd(8)} ${a.ms}ms  ${a.url.split('/').pop()}`);
      }
    }
    await page.close();
  }
}
await browser.close();
await server.close();
if (baseServer) await baseServer.close();
