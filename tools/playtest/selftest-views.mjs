#!/usr/bin/env node
/* selftest-views.mjs — the in-page `?selftest=1` at chosen viewports
 * (T-107, I-114: "the in-page selftest fails at 390x844 portrait").
 *
 *   node tools/playtest/selftest-views.mjs --root <tree> \
 *     --views 390x844,390x844t,844x390t,1280x720 [--query extra=1] [--out result.json]
 *
 * A trailing `t` boots that viewport with touch emulation (hasTouch +
 * isMobile — what selects the phone frame on a phone). One headless Chrome,
 * one fresh context per view; waits until the page title reports
 * `SELFTEST PASS` or `SELFTEST FAIL: <check>` and records the title, every
 * console line that starts with SELFTEST, and page errors. Exit 1 when any
 * view fails. Dev-only; zero effect on the game.                          */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';
import { startStaticServer } from './lib/server.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const rootDir = opt('root', null);
const server = rootDir ? await startStaticServer(resolve(rootDir), { port: 0 }) : null;
const baseUrl = server ? server.baseUrl : opt('base-url', 'http://127.0.0.1:8776');
const views = opt('views', '390x844,844x390t,1280x720').split(',');
const extra = opt('query', '');
const bootMs = Number(process.env.HB_PROBE_BOOT_MS) || 180000;
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

const { browser } = await launchBrowser({ channel: 'chrome' });
const results = [];
for (const view of views) {
  const touch = view.endsWith('t');
  const [w, h] = view.replace(/t$/, '').split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = [], lines = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (/^SELFTEST/.test(t)) lines.push(t); });
  const t0 = Date.now();
  let title = '';
  try {
    await page.goto(`${baseUrl}/index.html?selftest=1&audio=0${extra ? '&' + extra : ''}`, { waitUntil: 'domcontentloaded', timeout: bootMs });
    await page.waitForFunction(() => /^SELFTEST (PASS|FAIL)/.test(document.title), null, { timeout: bootMs, polling: 500 });
    title = await page.title();
  } catch (e) {
    title = `NO VERDICT: ${String(e.message || e).split('\n')[0]}`;
  }
  results.push({ view, width: w, height: h, touch, title, selftestLines: lines, errors, ms: Date.now() - t0 });
  log(view, touch ? 'touch' : 'mouse', title, `${Math.round((Date.now() - t0) / 1000)} s`);
  await context.close().catch(() => {});
}
await browser.close();
if (server) await server.close();
const out = opt('out', null);
if (out) await writeFile(resolve(out), JSON.stringify({ tool: 'tools/playtest/selftest-views.mjs', baseUrl, query: extra, results }, null, 1));
process.exit(results.every((r) => /^SELFTEST PASS/.test(r.title)) ? 0 : 1);
