#!/usr/bin/env node
// QA (T-101 gate): the worktree's DEFAULT URL at 1280x720 with NO touch must
// not show the two-thumb deck, must not change page-level touch/selection CSS,
// and keyboard play must start and move RIG. Real CDP keyboard events only.
//
//   node desktop-check.mjs <baseUrl> <outDir>
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
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const { browser } = await launchBrowser({ channel: 'chrome' });
let exit = 0;
try {
  // Desktop: no hasTouch, not mobile. Same Chromium, default (mouse) pointer.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  const url = `${BASE}/index.html`;              // the default URL: no query at all
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function',
    null, { timeout: 300000, polling: 500 });
  console.log(`  booted ${Date.now() - t0} ms`);

  const probe = await page.evaluate(() => {
    const d = document.getElementById('thumbDeck');
    const legacy = document.getElementById('touchDeck');
    const cs = (n) => (n ? getComputedStyle(n) : null);
    return {
      url: location.href,
      hardware: { maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches },
      deck: d ? { hidden: d.hidden, display: cs(d).display, rect: d.getBoundingClientRect().toJSON() } : null,
      legacy: legacy ? { hidden: legacy.hidden, display: cs(legacy).display } : null,
      modal: (() => { const m = document.getElementById('thumbModal'); return m ? { hidden: m.hidden, display: cs(m).display } : null; })(),
      bodyClasses: [...document.body.classList],
      htmlClasses: [...document.documentElement.classList],
      htmlTouchAction: getComputedStyle(document.documentElement).touchAction,
      bodyUserSelect: getComputedStyle(document.body).userSelect,
      touchSnapshot: __HB_TOUCH(),
      state: HB.state(),
    };
  });
  console.log('  probe ' + JSON.stringify(probe));
  check('desktop (no touch hardware): the two-thumb deck is hidden', probe.deck && probe.deck.hidden === true && probe.deck.display === 'none',
    JSON.stringify(probe.deck));
  check('desktop: the legacy deck is hidden too', probe.legacy && probe.legacy.hidden === true && probe.legacy.display === 'none',
    JSON.stringify(probe.legacy));
  check('desktop: the touch modal cue is hidden', !probe.modal || (probe.modal.hidden === true && probe.modal.display === 'none'),
    JSON.stringify(probe.modal));
  check('desktop: no touch classes on <html>/<body>',
    !probe.bodyClasses.some((c) => c.startsWith('touch')) && !probe.htmlClasses.some((c) => c.startsWith('touch')),
    `body ${probe.bodyClasses.join(' ')} | html ${probe.htmlClasses.join(' ')}`);
  check('desktop: the page-level touch-action / user-select rules are not applied',
    probe.htmlTouchAction !== 'pan-x pan-y' && probe.bodyUserSelect !== 'none',
    `html touch-action ${probe.htmlTouchAction}, body user-select ${probe.bodyUserSelect}`);
  check('desktop: deck snapshot says enabled:false, scheme off', probe.touchSnapshot.enabled === false && probe.touchSnapshot.scheme === 'off',
    JSON.stringify({ enabled: probe.touchSnapshot.enabled, scheme: probe.touchSnapshot.scheme, held: probe.touchSnapshot.held }));
  check('desktop: no touch hardware reported (the premise of this check)', probe.hardware.maxTouchPoints === 0 && probe.hardware.coarse === false,
    JSON.stringify(probe.hardware));

  await page.screenshot({ path: join(OUT, 'desktop-1280x720-title.png'), timeout: 240000 });
  console.log('  state at load: ' + probe.state);

  // Keyboard play: a real key leaves the title (and falls through to gameplay)
  // exactly as before. Hold ArrowRight; RIG must move right.
  const x0 = await page.evaluate(() => HB.player.x);
  await page.keyboard.down('ArrowRight');
  const started = await page.waitForFunction(() => HB.state() === 'PLAYING', null, { timeout: 240000, polling: 250 })
    .then(() => true, () => false);
  check('desktop: a keypress leaves the title and the run is PLAYING', started, 'state ' + await page.evaluate(() => HB.state()));
  const moved = await page.waitForFunction((x) => HB.player.x > x + 3, x0, { timeout: 240000, polling: 250 })
    .then(() => true, () => false);
  const afterRun = await page.evaluate(() => ({ x: HB.player.x, vx: HB.player.vx, right: !!HB.keys.right, state: HB.state() }));
  check('desktop: holding ArrowRight runs RIG right (keyboard path intact)', moved && afterRun.right, JSON.stringify({ x0, ...afterRun }));

  // jump (Space) and fire (KeyX) through the real keyboard
  const shots0 = await page.evaluate(() => HB.shotsFired());
  await page.keyboard.down('KeyX');
  const fired = await page.waitForFunction((n) => HB.shotsFired() > n, shots0, { timeout: 240000, polling: 250 })
    .then(() => true, () => false);
  await page.keyboard.up('KeyX');
  check('desktop: KeyX fires', fired, `shotsFired ${shots0} -> ${await page.evaluate(() => HB.shotsFired())}`);
  await page.keyboard.down('Space');
  const jumped = await page.waitForFunction(() => !HB.player.grounded && HB.player.vy !== 0, null, { timeout: 240000, polling: 100 })
    .then(() => true, () => false);
  await page.keyboard.up('Space');
  check('desktop: Space jumps (RIG leaves the ground)', jumped);
  await page.screenshot({ path: join(OUT, 'desktop-1280x720-playing.png'), timeout: 240000 });
  await page.keyboard.up('ArrowRight');

  const finalDeck = await page.evaluate(() => ({ hidden: document.getElementById('thumbDeck').hidden, held: __HB_TOUCH().held, edges: __HB_TOUCH().edges }));
  check('desktop: the deck stayed inert through keyboard play', finalDeck.hidden === true && finalDeck.held.length === 0 && finalDeck.edges === 0,
    JSON.stringify(finalDeck));
  check('desktop: no page errors / console errors', errors.length === 0, errors.join(' | '));
  await context.close();
} catch (error) {
  console.log('HARNESS ERROR: ' + (error && error.stack || error));
  exit = 2;
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
writeFileSync(join(OUT, 'desktop-check.json'), JSON.stringify({ base: BASE, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`desktop-check: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(exit || (failed.length ? 1 : 0));
