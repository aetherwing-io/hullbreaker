#!/usr/bin/env node
/* browser-check.mjs — is the Node replica the game? Prove it against Chrome.
 *
 *   node tools/simlab/race/browser-check.mjs [--width 640 --height 400]
 *        [--stop-ms 24000] [--out artifacts/t104-race/browser-check-640x400.json]
 *
 * Why 640x400 by default: in landscape the edge calibration depends only on
 * the aspect ratio (edges.mjs; no portrait inset or pullback above 0.9), so
 * 640x400 drives exactly the same simulation as 1280x800 at a quarter of the
 * painted pixels — SwiftShader on a shared 4-core host could not paint a
 * 1280x800 run inside 30 minutes. The tool records the page's own live edges
 * and fails if they differ from the replica's.
 *
 * 1. Boots the real index.html (?testapi=1&fixeddt=16.667) in an isolated
 *    headless Chrome at the requested viewport, with a frame-input bootstrap
 *    (src/pure/frame-input.js — the same contract run.mjs --deterministic
 *    uses): hold right + fire, a jump every 900 ms, three up-aim windows.
 * 2. Waits until the page's own timeline reports `complete` (the sim is then
 *    frozen at exactly ceil(stopAtMs / 16.667) updates) and reads the final
 *    state from __HULLBREAKER_TEST__.snapshot() + window.HB.
 * 3. Replays the identical schedule through run-child.mjs's replay mode (the
 *    Node transcription of main.js) and diffs every field.
 *
 * A match means the race lab's numbers are the shipped sim's numbers for this
 * input path. A mismatch prints the first differing fields and exits 1.
 * Slow under SwiftShader (no GPU): rAF advances one fixed step per painted
 * frame, so the 1440 steps of the default schedule take tens of minutes on a
 * loaded shared host (the result JSON records browser.wallMs). Zero effect
 * on the game.                                                              */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from '../../playtest/lib/isolated-browser.mjs';
import { viewportEdges } from './edges.mjs';
import { runOne } from './run-child.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const W = Number(opt('width', '640'));
const H = Number(opt('height', '400'));
const VIEWPORT_ID = `${W}x${H}`;
const STOP_MS = Number(opt('stop-ms', '24000'));
const OUT = resolve(ROOT, opt('out', `artifacts/t104-race/browser-check-${VIEWPORT_ID}.json`));
const FIXED_DT = 16.667;

function schedule(stopMs) {
  const ev = [];
  const hold = (code, a, b) => { ev.push({ t: a, type: 'keydown', code }); ev.push({ t: b, type: 'keyup', code }); };
  hold('ArrowRight', 0, stopMs - 500);
  hold('KeyJ', 300, stopMs - 500);
  for (let t = 500; t < stopMs - 1000; t += 900) hold('Space', t, t + 300);
  for (const [a, b] of [[8000, 9000], [15000, 16500], [22000, 23200]]) if (b < stopMs) hold('ArrowUp', a, b);
  return ev;
}

async function browserRun(events, stopAtMs, vp) {
  return withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
    const { page, close } = await newPage({ viewport: vp, deviceScaleFactor: 1 });
    await page.addInitScript((payload) => {
      Object.defineProperty(globalThis, '__HULLBREAKER_INPUT_BOOTSTRAP__', {
        value: payload, configurable: true, writable: false,
      });
    }, { version: 1, events, stopAtMs });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    const t0 = Date.now();
    // a cold boot under SwiftShader on a loaded host can take minutes
    await page.goto(`${baseUrl}/index.html?testapi=1&fixeddt=${FIXED_DT}`,
      { waitUntil: 'domcontentloaded', timeout: 10 * 60 * 1000 });
    // progress, then completion: poll the page's own frame-input timeline
    const deadline = Date.now() + 120 * 60 * 1000;
    let lastPrint = 0;
    for (;;) {
      const tl = await page.evaluate(() => {
        const api = globalThis.__HULLBREAKER_TEST__;
        return api ? api.inputTimeline() : null;
      }).catch(() => null);
      if (tl && tl.status === 'complete') break;
      if (Date.now() - lastPrint > 20000) {
        lastPrint = Date.now();
        process.stderr.write(`browser-check: tick ${tl ? tl.tick : '-'} / ${tl ? tl.stopTick : '-'} after ${Math.round((Date.now() - t0) / 1000)} s\n`);
      }
      if (Date.now() > deadline) throw new Error('browser-check: timeline did not complete in 120 min');
      await page.waitForTimeout(2000);
    }
    const read = await page.evaluate(() => {
      const s = globalThis.__HULLBREAKER_TEST__.snapshot();
      const tl = globalThis.__HULLBREAKER_TEST__.inputTimeline();
      const r = (v) => Math.round(v * 1e6) / 1e6;
      return {
        ticks: tl.tick, timelineStatus: tl.status,
        state: s.state,
        final: {
          gameMs: r(s.gameMs), scrollX: r(s.scrollX),
          player: { x: r(s.player.x), y: r(s.player.y), vx: r(s.player.vx), vy: r(s.player.vy),
            grounded: s.player.grounded, hp: s.player.hp, lives: s.player.lives },
          kills: window.HB.kills(), weapon: s.weapon,
          corner: s.corner && s.corner.k ? { k: s.corner.k, state: s.corner.state } : null,
          edgeLeft: r(window.HB.edges().left),
          liveEdges: { left: r(window.HB.edges().left - s.scrollX), right: r(window.HB.edges().right - s.scrollX) },
          hostiles: s.hostiles.map((e) => ({ id: e.id, kind: e.kind, state: e.state,
            x: r(e.x), y: r(e.y), hp: e.hp })),
        },
      };
    });
    await close();
    return { ...read, wallMs: Date.now() - t0, pageErrors: errors };
  });
}

function diff(a, b, path = '') {
  const out = [];
  if (typeof a !== typeof b) return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
  if (a && typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b || {})]);
    for (const k of keys) out.push(...diff(a[k], b ? b[k] : undefined, path + '.' + k));
    return out;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-6 ? [] : [`${path}: ${a} vs ${b}`];
  }
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

const vp = { width: W, height: H };
const events = schedule(STOP_MS);
process.stderr.write(`browser-check: ${VIEWPORT_ID} ${vp.width}x${vp.height}, ${events.length} edges, stop ${STOP_MS} ms\n`);
const browser = await browserRun(events, STOP_MS, vp);
process.stderr.write(`browser-check: browser done in ${Math.round(browser.wallMs / 1000)} s (ticks ${browser.ticks})\n`);
const replica = await runOne({ viewport: vp,
  replay: { events, stopAtMs: STOP_MS, fixedDtMs: FIXED_DT } });
const analytic = viewportEdges(W, H);
const liveEdges = browser.final.liveEdges;
delete browser.final.liveEdges;
const edgeErr = { left: Math.abs(liveEdges.left - analytic.left), right: Math.abs(liveEdges.right - analytic.right) };
const diffs = diff(browser.final, replica.final);
if (edgeErr.left > 1e-4 || edgeErr.right > 1e-4) diffs.push(`live edges ${JSON.stringify(liveEdges)} vs analytic ${analytic.left}, ${analytic.right}`);
const result = {
  tool: 'tools/simlab/race/browser-check.mjs', viewport: VIEWPORT_ID, ...vp,
  stopAtMs: STOP_MS, fixedDtMs: FIXED_DT, edges: events.length,
  liveEdges, analyticEdges: { left: analytic.left, right: analytic.right }, edgeErr,
  browser: { ticks: browser.ticks, state: browser.state, pageErrors: browser.pageErrors,
    wallMs: browser.wallMs, final: browser.final },
  replica: { ticks: replica.ticks, state: replica.state, final: replica.final },
  match: diffs.length === 0 && browser.ticks === replica.ticks,
  diffs,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(result.match
  ? `browser-check: MATCH — ${browser.ticks} ticks, final state identical (x ${replica.final.player.x}, scroll ${replica.final.scrollX}, kills ${replica.final.kills}, hostiles ${replica.final.hostiles.length})`
  : `browser-check: MISMATCH (${diffs.length} fields; ticks ${browser.ticks} vs ${replica.ticks})\n  ` + diffs.slice(0, 20).join('\n  '));
process.exit(result.match ? 0 : 1);
