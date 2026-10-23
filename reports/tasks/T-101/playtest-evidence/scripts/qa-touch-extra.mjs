#!/usr/bin/env node
// QA (T-101 gate) supplementary touch probe — real CDP multi-touch on a FROZEN
// page (PLAYING, sim never steps: the input layer alone), for lane claims that
// the lane's own browser proof does NOT drive:
//   A  one-thumb roll FIRE -> JUMP keeps FIRE held and adds JUMP; lift frees both
//   B  the lens between the two hit circles presses both on landing
//   C  sliding ONTO a button needs its visual face (slideSlop 1.0), not its slop
//   D  the outer 20 px (iOS back-swipe gutter) spawns no stick; just inside does
//   E  a second left-zone finger re-anchors; the first finger's lift is inert
//   F  rim follow: after a long drag right, a short pull back reaches LEFT
//   G  a finger sliding from FIRE across SWAP never presses SWAP; a finger
//      down on SWAP holds KeyC until it lifts; PAUSE lifted off the chip is inert
//   H  the AUTO chip toggles auto-fire and persists it (localStorage)
//
//   node qa-touch-extra.mjs <baseUrl> <outDir> [landscape|portrait]
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
const MUTATE = process.argv[5] === 'mutate';   // serve src/config.js with three tuning defects (QA falsification run)
const viewport = VIEW === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ view: VIEW, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${VIEW}] ${name}${detail ? ' — ' + detail : ''}`);
};

class Touch {
  constructor(cdp) { this.cdp = cdp; this.active = new Map(); }
  pts() { return [...this.active].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 7, radiusY: 7, force: 1 })); }
  send(type, touchPoints) { return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints }); }
  async down(id, x, y) { this.active.set(id, { x, y }); await this.send('touchStart', this.pts()); }
  async move(id, x, y) { this.active.set(id, { x, y }); await this.send('touchMove', this.pts()); }
  async up(id) {
    const p = this.active.get(id); if (!p) return;
    this.active.delete(id);
    await this.send('touchEnd', [{ x: p.x, y: p.y, id, radiusX: 7, radiusY: 7, force: 1 }]);
  }
  async upAll() { this.active.clear(); await this.send('touchEnd', []); }
}
const ORDER = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyC'];
const sorted = (a) => [...a].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const frames = (page, n = 2) => page.evaluate((count) => new Promise((done) => {
  let left = count; const step = () => (--left <= 0 ? done() : requestAnimationFrame(step)); requestAnimationFrame(step);
}), n);
const held = async (page) => page.evaluate(() => ({
  deck: __HB_TOUCH().held,
  keys: ['left', 'right', 'up', 'down', 'jump', 'fire', 'swap'].filter((k) => HB.keys[k]),
}));
const toCodes = (keys) => sorted(keys.map((k) => ({ left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', jump: 'Space', fire: 'KeyX', swap: 'KeyC' })[k]));
// the deck's ledger AND the sim's own keys must both equal `want`
async function expectHeld(page, label, want) {
  await frames(page, 2);
  const h = await held(page);
  const w = sorted(want);
  const ok = same(sorted(h.deck), w) && same(toCodes(h.keys), w);
  check(label, ok, `want [${w}] deck [${sorted(h.deck)}] sim [${toCodes(h.keys)}]`);
  return h;
}
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const { browser } = await launchBrowser({ channel: 'chrome' });
let exit = 0;
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.addInitScript(() => { globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__ = { version: 1, events: [], stopAtMs: 0 }; });
  if (MUTATE) {
    // Falsification: each edit must turn its own checks red. A missing anchor throws (a stale mutation proves nothing).
    const EDITS = [
      ['slideSlop: 1.0,', 'slideSlop: 1.25,'],   // C: sliding onto a button would use the landing slop
      ['edgeGutter: 20,', 'edgeGutter: 0,'],     // D: the iOS back-swipe gutter disappears
      ['follow: 1,', 'follow: 6,'],              // F: the anchor would barely follow the thumb
    ];
    await page.route('**/src/config.js', async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      for (const [from, to] of EDITS) {
        if (!body.includes(from)) throw new Error('mutation anchor not found: ' + from);
        body = body.replace(from, to);
      }
      await route.fulfill({ response, body, headers: { ...response.headers(), 'cache-control': 'no-store' } });
    });
  }
  const t0 = Date.now();
  await page.goto(`${BASE}/index.html?testapi=1&fixeddt=16.667&audio=0`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function', null, { timeout: 300000, polling: 250 });
  await page.waitForFunction(() => HB.state() === 'PLAYING', null, { timeout: 300000, polling: 250 });
  console.log(`  booted ${VIEW} in ${Date.now() - t0} ms`);
  const cdp = await context.newCDPSession(page);
  const T = new Touch(cdp);
  const L = await page.evaluate(() => __HB_TOUCH().layout);
  console.log('  layout ' + JSON.stringify({ J: L.jump, F: L.fire, swap: L.swap, pause: L.pause, auto: L.auto, split: L.split, rim: L.rim, gutter: L.stickMinX, cluster: L.cluster }));

  // skip the software-rendered draw (rAF, pointer dispatch and the deck run unchanged)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  });

  const J = L.jump, F = L.fire;
  const dist = Math.hypot(J.cx - F.cx, J.cy - F.cy);
  const u = { x: (J.cx - F.cx) / dist, y: (J.cy - F.cy) / dist };   // unit F -> J
  const pointAt = (c, d, dir) => ({ x: c.cx + dir.x * d, y: c.cy + dir.y * d });
  console.log(`  FIRE-JUMP centre distance ${dist.toFixed(1)} px; visual gap ${(dist - J.r - F.r).toFixed(1)} px; ` +
    `hit circles overlap by ${(J.r * L.slop + F.r * L.slop - dist).toFixed(1)} px`);

  /* A: one-thumb roll FIRE -> JUMP */
  await T.down(1, F.cx, F.cy);
  await expectHeld(page, 'A: finger lands on FIRE -> only FIRE held', ['KeyX']);
  for (let i = 1; i <= 6; i++) { const p = lerp({ x: F.cx, y: F.cy }, { x: J.cx, y: J.cy }, i / 6); await T.move(1, p.x, p.y); }
  await expectHeld(page, 'A: the SAME finger rolled onto JUMP -> FIRE stays held AND JUMP is pressed', ['KeyX', 'Space']);
  const jumpsMid = await page.evaluate(() => __HB_TOUCH().jumps);
  await T.up(1);
  await expectHeld(page, 'A: lifting that one finger releases both', []);
  check('A: the roll counted exactly one JUMP press', jumpsMid === 1, `jumps ${jumpsMid}`);

  /* B: the lens */
  // visual faces do not touch; the hit circles overlap in a lens of this thickness
  const lensLo = dist - J.r * L.slop, lensHi = F.r * L.slop;           // distance-from-FIRE interval inside both
  if (lensHi > lensLo) {
    const mid = (lensLo + lensHi) / 2;
    const p = pointAt(F, mid, u);
    await T.down(2, p.x, p.y);
    await expectHeld(page, `B: a landing in the lens (${(lensHi - lensLo).toFixed(1)} px thick) presses JUMP+FIRE`, ['KeyX', 'Space']);
    await T.up(2);
    await expectHeld(page, 'B: lens finger lifted -> released', []);
    // and just outside the lens on each side
    const pF = pointAt(F, lensLo - 3, u);
    await T.down(3, pF.x, pF.y);
    await expectHeld(page, 'B: 3 px short of the lens (FIRE side) -> FIRE only', ['KeyX']);
    await T.up(3);
    const pJ = pointAt(F, lensHi + 3, u);
    await T.down(4, pJ.x, pJ.y);
    await expectHeld(page, 'B: 3 px past the lens (JUMP side) -> JUMP only', ['Space']);
    await T.up(4);
  } else {
    check('B: the hit circles overlap in a lens', false, `no overlap: dist ${dist.toFixed(1)}, reach ${(J.r * L.slop + F.r * L.slop).toFixed(1)}`);
  }

  /* C: slide slop */
  await T.down(5, F.cx, F.cy);
  const outsideFace = pointAt(J, -J.r * 1.1, u);                        // 1.1 JUMP radii from JUMP's centre, towards FIRE
  await T.move(5, outsideFace.x, outsideFace.y);
  await expectHeld(page, 'C: sliding to 1.1x JUMP radius (inside the 1.25 landing slop) does NOT press JUMP', ['KeyX']);
  const onFace = pointAt(J, -J.r * 0.92, u);
  await T.move(5, onFace.x, onFace.y);
  await expectHeld(page, 'C: sliding onto the JUMP face (0.92 radius) presses JUMP', ['KeyX', 'Space']);
  await T.up(5);
  await expectHeld(page, 'C: lifted -> released', []);

  /* D: iOS edge gutter */
  const gy = viewport.height * 0.62;
  await T.down(6, 8, gy);
  await T.move(6, 8 + 70, gy);
  const gs = await page.evaluate(() => ({ stick: __HB_TOUCH().stick.active, kinds: __HB_TOUCH().pointers.map((p) => p.kind), held: __HB_TOUCH().held }));
  check('D: a touch 8 px from the left glass edge spawns no stick and holds nothing', !gs.stick && gs.held.length === 0 && gs.kinds.join() === 'dead',
    JSON.stringify(gs));
  await T.up(6);
  await T.down(7, L.stickMinX + 6, gy);
  await T.move(7, L.stickMinX + 6 + 44, gy);
  await expectHeld(page, `D: a touch just inside the gutter (x ${L.stickMinX + 6}) is a live stick`, ['ArrowRight']);
  await T.up(7);
  await expectHeld(page, 'D: lifted -> released', []);

  /* E: second finger in the left zone re-anchors */
  const ax = Math.max(L.stickMinX + 60, L.split * 0.3), ay = viewport.height * 0.7;
  await T.down(8, ax, ay);
  await T.move(8, ax + 44, ay);
  await expectHeld(page, 'E: finger A drags right -> ArrowRight', ['ArrowRight']);
  const bx = Math.min(L.split - 60, ax + 90), by = viewport.height * 0.55;
  await T.down(9, bx, by);
  await expectHeld(page, 'E: a second left-zone finger B takes the stick (A is dropped, nothing held at neutral)', []);
  await T.move(9, bx, by - 44);
  await expectHeld(page, 'E: B drags up -> ArrowUp', ['ArrowUp']);
  await T.move(8, ax + 90, ay + 20);                                  // the dropped finger wiggles
  await T.up(8);                                                      // ...and lifts
  await expectHeld(page, "E: the dropped finger's wiggle and lift leave B's ArrowUp alone", ['ArrowUp']);
  await T.up(9);
  await expectHeld(page, 'E: B lifted -> released', []);

  /* F: rim follow, then a short pull back reverses */
  const fx = Math.max(L.stickMinX + 50, 100), fy = viewport.height * 0.7;
  await T.down(10, fx, fy);
  await T.move(10, fx + 44, fy);
  await expectHeld(page, 'F: drag right -> ArrowRight', ['ArrowRight']);
  const far = fx + Math.min(300, L.split - fx + 120);
  await T.move(10, far, fy);
  await expectHeld(page, `F: a long drag (${Math.round(far - fx)} px) still ArrowRight`, ['ArrowRight']);
  await T.move(10, far - L.rim - 22, fy);                              // pull back by one rim + 22 px
  const back = await expectHeld(page, 'F: pulling back one rim + 22 px reverses to ArrowLeft (anchor trailed the thumb)', ['ArrowLeft']);
  await T.up(10);
  await expectHeld(page, 'F: lifted -> released', []);

  /* G: chips vs a right-thumb finger */
  await T.down(11, F.cx, F.cy);
  const sw = { x: L.swap.x + L.swap.w / 2, y: L.swap.y + L.swap.h / 2 };
  for (let i = 1; i <= 8; i++) { const p = lerp({ x: F.cx, y: F.cy }, sw, i / 8); await T.move(11, p.x, p.y); }
  await expectHeld(page, 'G: a FIRE finger dragged across the SWAP chip never presses SWAP (still just FIRE)', ['KeyX']);
  await T.up(11);
  await T.down(12, sw.x, sw.y);
  await expectHeld(page, 'G: a finger DOWN on SWAP holds KeyC (swap)', ['KeyC']);
  await T.up(12);
  await expectHeld(page, 'G: SWAP lifted -> KeyC released', []);
  // PAUSE lifted away from the chip must not pause
  const pc = { x: L.pause.x + L.pause.w / 2, y: L.pause.y + L.pause.h / 2 };
  await T.down(13, pc.x, pc.y);
  await T.move(13, pc.x - 90, pc.y + 80);
  await T.up(13);
  await frames(page, 3);
  const st = await page.evaluate(() => HB.state());
  check('G: PAUSE pressed then lifted 120 px away does NOT pause the run', st === 'PLAYING', st);

  /* H: AUTO chip toggles + persists */
  const ac = { x: L.auto.x + L.auto.w / 2, y: L.auto.y + L.auto.h / 2 };
  const af0 = await page.evaluate(() => ({ on: __HB_TOUCH().autoFire.enabled, stored: localStorage.getItem('hullbreaker.touch.autofire') }));
  await T.down(14, ac.x, ac.y); await T.up(14); await frames(page, 2);
  const af1 = await page.evaluate(() => ({ on: __HB_TOUCH().autoFire.enabled, stored: localStorage.getItem('hullbreaker.touch.autofire'), pressed: document.getElementById('thumbAuto').getAttribute('aria-pressed'), cls: document.getElementById('thumbFire').className }));
  await T.down(15, ac.x, ac.y); await T.up(15); await frames(page, 2);
  const af2 = await page.evaluate(() => ({ on: __HB_TOUCH().autoFire.enabled, stored: localStorage.getItem('hullbreaker.touch.autofire') }));
  check('H: AUTO defaults OFF on a fresh profile', af0.on === false && af0.stored === null, JSON.stringify(af0));
  check('H: tapping AUTO turns it on and remembers it', af1.on === true && af1.stored === '1' && af1.pressed === 'true', JSON.stringify(af1));
  check('H: tapping AUTO again turns it off and remembers that', af2.on === false && af2.stored === '0', JSON.stringify(af2));
  const finalHeld = await held(page);
  check('end: nothing left held after the whole sequence', finalHeld.deck.length === 0 && finalHeld.keys.length === 0, JSON.stringify(finalHeld));
  check('page raised no errors', errors.length === 0, errors.join(' | '));
  await context.close();
} catch (error) {
  console.log('HARNESS ERROR: ' + (error && error.stack || error));
  exit = 2;
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
writeFileSync(join(OUT, `qa-touch-extra-${VIEW}${MUTATE ? '-MUTATED' : ''}.json`), JSON.stringify({ base: BASE, view: VIEW, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`qa-touch-extra ${VIEW}${MUTATE ? ' (MUTATED config)' : ''}: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(exit || (failed.length ? 1 : 0));
