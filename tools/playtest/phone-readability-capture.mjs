#!/usr/bin/env node
/* phone-readability-capture.mjs — hostile tells, bullets and capsules at the
 * phone frame, in a real fight (SPRINT T-107: "Hostile tells, bullets and
 * capsules readable at phone framing — capture sheet at DPR 2").
 *
 *   node tools/playtest/phone-readability-capture.mjs --base-url http://127.0.0.1:8776 \
 *     --viewport 844x390 --dpr 2 --touch [--query view=far] --marks 9000,15000,21000 \
 *     --out <dir> [--tag phone]
 *
 * Boots the shipped run deterministically (?testapi=1&fixeddt=16.667, the
 * frame-input bootstrap: right + fire held, a jump every 0.9 s — the same
 * contract the race lab's browser-check replays), and at each game-time mark
 * pauses (KeyP) and photographs the frame. Beside every photo a JSON sidecar
 * records, projected through the live camera: every hostile (kind, state,
 * whether it is telegraphing), every live projectile and every capsule, with a
 * screen box in CSS px — so tools/simlab/framing/readability_sheet.py can crop
 * each one at true size and magnified. The same marks with ?view=far on the
 * same phone give the before frame for the same moment (the run is the same
 * simulation; only the lens differs, so the sim may diverge slightly through
 * the right clamp: each sidecar says what it shows).
 *
 * Honest limits: SwiftShader, DPR as requested; a paused frame, not motion;
 * readability is the operator's call (entry 15/17: tells read smaller at FAR
 * was an accepted cost) — this only puts the evidence in front of him.
 * Dev-only; zero effect on the game.                                      */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const baseUrl = opt('base-url', 'http://127.0.0.1:8776');
const [vw, vh] = opt('viewport', '844x390').split('x').map(Number);
const dpr = +opt('dpr', '2');
const touch = argv.includes('--touch');
const query = opt('query', '');
const marks = opt('marks', '9000,15000,21000').split(',').map(Number);
const out = resolve(opt('out', 'readability'));
const tag = opt('tag', touch ? 'touch' : 'mouse');
const bootMs = Number(process.env.HB_PROBE_BOOT_MS) || 180000;
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

const lastMark = Math.max(...marks);
const events = [{ t: 0, type: 'keydown', code: 'ArrowRight' }, { t: 120, type: 'keydown', code: 'KeyJ' }];
for (let t = 600; t < lastMark + 2000; t += 900) {
  events.push({ t, type: 'keydown', code: 'Space' });
  events.push({ t: t + 180, type: 'keyup', code: 'Space' });
}

await mkdir(out, { recursive: true });
const { browser } = await launchBrowser({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr,
  hasTouch: touch, isMobile: touch });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript((payload) => {
  Object.defineProperty(globalThis, '__HULLBREAKER_INPUT_BOOTSTRAP__', { value: payload, configurable: true, writable: false });
}, { version: 1, events, stopAtMs: lastMark + 2000 });
const t0 = Date.now();
await page.goto(`${baseUrl}/index.html?testapi=1&fixeddt=16.667&audio=0${query ? '&' + query : ''}`,
  { waitUntil: 'domcontentloaded', timeout: bootMs });
await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, { timeout: bootMs, polling: 500 });
page.setDefaultTimeout(bootMs);
log('booted', `${vw}x${vh}@${dpr}`, touch ? 'touch' : 'mouse', query, `${Math.round((Date.now() - t0) / 1000)} s`);
const shots = [];
for (const mark of marks) {
  // run until the mark on the game's own clock, then pause in-page
  await page.waitForFunction((m) => globalThis.__HULLBREAKER_TEST__.snapshot().gameMs >= m, mark,
    { timeout: 3600000, polling: 250 });
  await page.evaluate(() => {
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
  });
  await page.waitForFunction(() => HB.state() === 'PAUSED', null, { timeout: 120000 });
  await page.addStyleTag({ content: '#overlay { display: none !important; }' });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const facts = await page.evaluate(async () => {
    const [S, TW, H, WP, CA, THREE, T, CAM] = await Promise.all(['/src/render/scene.js', '/src/render/tower.js',
      '/src/sim/hostiles.js', '/src/sim/weapons.js', '/src/sim/capsules.js', 'three', '/src/sim/time.js',
      '/src/render/camera.js'].map((p) => import(p)));
    const v = new THREE.Vector3();
    const box = (s, y, w, h, depth = 1.15) => {
      const pts = [[s - w / 2, y], [s + w / 2, y], [s - w / 2, y + h], [s + w / 2, y + h]].map(([x, yy]) => {
        const q = TW.towerPose(x, { x: 0, y: 0, z: 0, yaw: 0, alt: 0 });
        v.set(q.x + Math.sin(q.yaw) * depth, yy + q.alt, q.z + Math.cos(q.yaw) * depth).project(S.camera);
        return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
      });
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => +n.toFixed(1));
    };
    const onScreen = (b) => b[2] > 0 && b[0] < innerWidth && b[3] > 0 && b[1] < innerHeight;
    // a generous box around each body (hit radius + 0.6 tiles of tell/fx)
    const hostiles = H.hostiles.map((e) => { const r = (e.hitR || 0.5) + 0.6;
      return { kind: e.kind, state: e.state, hp: e.hp, telegraph: /tell|fuse/i.test(String(e.state)),
        box: box(e.x, e.y - r, 2 * r, 2 * r) }; }).filter((h) => onScreen(h.box));
    const pool = WP.bulletPool || [];
    const bullets = pool.filter((b) => b.alive).map((b) => ({ type: b.type, hostile: !!b.hostile,
      box: box(b.x, b.y - 0.15, 0.3, 0.3) })).filter((b) => onScreen(b.box));
    const capsules = (CA.capsules || []).map((c) => ({ kind: c.kind, letter: c.letter, box: box(c.x, c.y - 0.4, 0.8, 0.8) }))
      .filter((c) => onScreen(c.box));
    return { gameMs: T.gameMs, scrollX: T.scrollX, player: { x: HB.player.x, y: HB.player.y, hp: HB.player.hp },
      framing: typeof CAM.cameraFramingSnapshot === 'function' ? CAM.cameraFramingSnapshot() : null,
      hostiles, bullets, capsules };
  });
  const file = resolve(out, `${tag}-${vw}x${vh}-dpr${dpr}-t${mark}.png`);
  await page.screenshot({ path: file, timeout: bootMs });
  shots.push({ mark, file, ...facts });
  log(`mark ${mark}: gameMs ${Math.round(facts.gameMs)} hostiles ${facts.hostiles.length} bullets ${facts.bullets.length} capsules ${facts.capsules.length}`);
  await page.evaluate(() => {
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
  });
  await page.waitForFunction(() => HB.state() === 'PLAYING', null, { timeout: 120000 });
}
await writeFile(resolve(out, `${tag}-${vw}x${vh}-dpr${dpr}.json`), JSON.stringify({ tool: 'tools/playtest/phone-readability-capture.mjs',
  baseUrl, viewport: { vw, vh, dpr, touch }, query, marks, errors, shots }, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
