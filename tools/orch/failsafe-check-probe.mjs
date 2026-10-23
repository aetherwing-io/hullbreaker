#!/usr/bin/env node
// failsafe-check-probe.mjs — the falsifier for tools/orch/lib/failsafe-check.mjs,
// the rule that lets the PLAY gate REPORT (not fail) a freeze-watchdog panel
// caused by one slow SwiftShader frame on a GPU-less host. A rule that turns a
// FAIL into a REPORT must itself be shown to still fail on the defect it could
// hide: a frame loop that really stopped.
//
//   node tools/orch/failsafe-check-probe.mjs                     serve this tree
//   node tools/orch/failsafe-check-probe.mjs --base-url http://127.0.0.1:8781
//
// One page of the DEFAULT URL at 844x390 (touch, DPR 0.5), booted to its title,
// then three cases in that page, each judged by the gate's own failsafeCheck
// with gpuLess = true:
//   A  the 'frozen' panel raised over a LIVE loop (through the failsafe's own
//      show()) — REPORT when the page measured a >= 4 s frame (always, on this
//      host), else FAIL (the rule needs that measurement)
//   B  the same panel after the loop is STOPPED (requestAnimationFrame
//      swallowed, so frame() never runs again)                  -> must FAIL
//   C  a 'crash' panel (any panel but 'frozen')                    -> must FAIL
// Exit 0 iff A is REPORT-or-explained and B and C FAIL. Zero effect on the game.

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, startStaticServer } from '../assets/lib/browser.mjs';
import { failsafeCheck } from './lib/failsafe-check.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const BOOT_MS = Number(process.env.HB_PROBE_BOOT_MS) || 90000;
let server = null;
const base = opt('--base-url') || (server = await startStaticServer(ROOT, { port: 0 })).baseUrl;
const { browser } = await launchBrowser({ channel: 'chrome' });
const results = [];
const say = (id, want, got) => {
  const ok = Array.isArray(want) ? want.includes(got.status) : got.status === want;
  results.push(ok);
  console.log(`failsafe-check-probe ${ok ? 'OK  ' : 'BAD '} ${id}: ${got.status}${got.note ? ' — ' + got.note : ''} ` +
    `(showing ${got.fs.showing}, beats ${got.fs.beats}, faults ${got.fs.faults}, worst frame ${Math.round(got.perf?.worstMs || 0)} ms)`);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 0.5, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(BOOT_MS);
  await page.goto(base + '/index.html', { waitUntil: 'commit', timeout: BOOT_MS });
  await page.waitForFunction(() => window.HB && window.HB.state() === 'MENU' && window.HB.failsafe().beats > 5, null, { timeout: BOOT_MS * 2 });
  // A: the panel over a live loop
  await page.evaluate(() => window.__HB_FAILSAFE.show('frozen', 'failsafe-check-probe: forced over a live loop'));
  const a = await failsafeCheck(page, { gpuLess: true });
  const longFrame = (a.perf?.worstMs || 0) >= ((a.fs.policy && a.fs.policy.freezeStallMs) || 4000);
  say('A forced freeze panel, live loop', longFrame ? 'REPORT' : 'FAIL', a);
  // B: the same panel, the loop stopped
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(3000);           // the frame in flight (if any) finishes
  const b = await failsafeCheck(page, { gpuLess: true, aliveWaitMs: 30000 });
  say('B forced freeze panel, loop stopped', 'FAIL', b);
  await ctx.close();
  // C: any other panel fails, live loop or not
  const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 0.5, isMobile: true, hasTouch: true });
  const page2 = await ctx2.newPage();
  page2.setDefaultTimeout(BOOT_MS);
  await page2.goto(base + '/index.html', { waitUntil: 'commit', timeout: BOOT_MS });
  await page2.waitForFunction(() => window.HB && window.HB.state() === 'MENU', null, { timeout: BOOT_MS * 2 });
  await page2.evaluate(() => window.__HB_FAILSAFE.show('crash', 'failsafe-check-probe: forced'));
  say('C forced crash panel', 'FAIL', await failsafeCheck(page2, { gpuLess: true }));
  await ctx2.close();
} catch (err) {
  console.log('failsafe-check-probe BAD  the probe itself failed: ' + String(err && err.message || err).slice(0, 300));
  results.push(false);
} finally {
  try { await browser.close(); } catch { /* gone */ }
  if (server) { try { await server.close(); } catch { /* gone */ } }
}
const bad = results.filter((x) => !x).length;
console.log(`failsafe-check-probe: ${results.length - bad} as expected, ${bad} not`);
process.exit(bad ? 1 : 0);
