#!/usr/bin/env node
// QA (T-101 gate): what a phone player actually sees first, at the PLAIN
// default URL (no query): title screen -> one real CDP tap -> first gameplay
// frames with the deck. Captures at 844x390 (landscape, the tuning target) or
// 390x844 (portrait), DPR 1.
//
//   node phone-first-ten.mjs <baseUrl> <outDir> <landscape|portrait>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Path handling (T-101 QA copy): the tree under test is HB_TREE (default: this repo checkout, i.e. five
// directories above this file). To test an unmerged worktree: HB_TREE=<worktree> node <script> ...
import * as _path from 'node:path';
import { fileURLToPath as _fileURLToPath, pathToFileURL as _pathToFileURL } from 'node:url';
const TREE = process.env.HB_TREE || _path.resolve(_path.dirname(_fileURLToPath(import.meta.url)), '../../../../..');
const tree = (p) => _pathToFileURL(_path.join(TREE, p)).href;
const { launchBrowser } = await import(tree('tools/assets/lib/browser.mjs'));

const BASE = (process.argv[2] || 'http://127.0.0.1:8779').replace(/\/$/, '');
const OUT = process.argv[3];
const VIEW = process.argv[4] || 'landscape';
const viewport = VIEW === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ view: VIEW, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${VIEW}] ${name}${detail ? ' — ' + detail : ''}`);
};

const { browser } = await launchBrowser({ channel: 'chrome' });
let exit = 0;
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  const t0 = Date.now();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 300000 });   // the operator's URL: no query
  await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function', null, { timeout: 300000, polling: 500 });
  console.log(`  booted ${VIEW} in ${Date.now() - t0} ms`);
  await page.waitForFunction(() => HB.state() === 'MENU' || HB.state() === 'PLAYING', null, { timeout: 300000, polling: 500 });
  const title = await page.evaluate(() => ({
    state: HB.state(),
    deck: { opacity: getComputedStyle(document.getElementById('thumbDeck')).opacity, pe: getComputedStyle(document.getElementById('thumbDeck')).pointerEvents, hidden: document.getElementById('thumbDeck').hidden },
    audio: HB.audio ? HB.audio() : null,
    titleText: (document.getElementById('title') || document.querySelector('[id*=title i]') || document.body).innerText.slice(0, 400),
    bodyClasses: [...document.body.classList],
  }));
  console.log('  title ' + JSON.stringify(title));
  check('the plain default URL parks on the title (MENU) on a phone', title.state === 'MENU', title.state);
  check('the deck is inert behind the title', title.deck.opacity === '0' && title.deck.pe === 'none', JSON.stringify(title.deck));
  await page.screenshot({ path: join(OUT, `${VIEW}-title.png`), timeout: 300000 });

  const cdp = await context.newCDPSession(page);
  const x = viewport.width * 0.5, y = viewport.height * 0.5;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 7, radiusY: 7, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y, id: 1, radiusX: 7, radiusY: 7, force: 1 }] });
  const started = await page.waitForFunction(() => HB.state() === 'PLAYING', null, { timeout: 300000, polling: 250 }).then(() => true, () => false);
  check('one tap anywhere on the title starts the run', started, await page.evaluate(() => HB.state()));
  const after = await page.evaluate(() => ({ held: __HB_TOUCH().held, jumps: __HB_TOUCH().jumps, audio: HB.audio ? HB.audio() : null,
    deckOpacity: getComputedStyle(document.getElementById('thumbDeck')).opacity, x: HB.player.x }));
  console.log('  after tap ' + JSON.stringify(after));
  check('the starting tap is not also a gameplay input', after.held.length === 0 && after.jumps === 0, JSON.stringify({ held: after.held, jumps: after.jumps }));
  check('the deck is visible and interactive once PLAYING', after.deckOpacity === '1', after.deckOpacity);
  // let a few frames render so the capture is the real first gameplay view
  await page.evaluate(() => new Promise((r) => { let n = 6; const s = () => (--n <= 0 ? r() : requestAnimationFrame(s)); requestAnimationFrame(s); }));
  await page.screenshot({ path: join(OUT, `${VIEW}-first-frame.png`), timeout: 300000 });
  check('no page errors / console errors', errors.length === 0, errors.join(' | '));
  await context.close();
} catch (error) {
  console.log('HARNESS ERROR: ' + (error && error.stack || error));
  exit = 2;
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
writeFileSync(join(OUT, `phone-first-ten-${VIEW}.json`), JSON.stringify({ base: BASE, view: VIEW, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`phone-first-ten ${VIEW}: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(exit || (failed.length ? 1 : 0));
