#!/usr/bin/env node
// touch-proof.mjs — T-101's multi-touch proof for the two-thumb deck.
//
//   cd tools/playtest
//   node touch-proof.mjs                               # both phone orientations
//   node touch-proof.mjs --base-url http://127.0.0.1:8751   # a pinned server
//   node touch-proof.mjs --mutate release-all-on-up    # falsification run
//
// Real touch input only: every press is a CDP `Input.dispatchTouchEvent`, so
// the page sees the browser's own touch -> pointer pipeline, including several
// simultaneous pointers. Measured in this Chromium (141): `touchStart` with the
// full active list presses only the new id, `touchEnd` releases exactly the
// points it LISTS (an empty list releases all), `touchCancel` with an empty list
// cancels every active point. The helper below is written to that contract.
//
// What it proves, per orientation (844x390 landscape, 390x844 portrait):
//   live sim  (?testapi=1&fixeddt=16.667, the default six-face run):
//     - stick right + JUMP: vy>0 AND vx>0 within N ticks of the press;
//     - a held JUMP reaches a higher apex than a tapped one (both reported);
//     - a second JUMP press airborne consumes the air jump;
//     - stick up-right + FIRE spawns bullets travelling up-right;
//     - stick down + JUMP on a catwalk drops through it.
//   frozen sim (same URL plus an empty frame-input schedule stopped at tick 0,
//              so the run is PLAYING but never steps — the input layer alone):
//     - three pointers (stick + FIRE + JUMP) pressed and released in all 36
//       orders, the held-code set asserted after every step, against both the
//       deck's ledger and the sim's own `keys` object;
//     - pointercancel, window blur, visibilitychange and an orientation flip
//       mid-press each release every held code;
//     - the deck and every control compute touch-action:none and
//       user-select:none; a double-tap and a pinch leave visualViewport.scale
//       at 1 (and the pinch DOES zoom once touch-action is overridden — the
//       probe is proved to be able to see a zoom);
//     - PAUSE chip -> PAUSED; tap -> PLAYING. GAME_OVER (state forced through
//       src/sim/state.js — test setup, not a player path) -> tap restarts only
//       once the screen is armed.
//   plus: ?touch=legacy's snapshot shape and gesture behaviour; title tap
//   starts the run without leaking a gameplay input; deck screenshots at DPR
//   1 and 2.
//   pause (T-126; frozen sim, at 844x390 AND 667x375 — the two landscape
//         sizes its box names): nothing on the pause screen throws a run away
//         by accident —
//     - every pause control is >= 44 x 44 css px;
//     - a tap that is not on a control resumes, wherever it lands: mid-screen
//       over the panel's empty area, the screen centre, the title, either
//       side, the cue, the old bottom-left corner;
//     - ONE tap on RESTART RUN / START SCREEN / an option that reloads only
//       arms it (and, left alone, it disarms: no reset, no reload); a second
//       tap inside the window confirms it; any other tap disarms it; a
//       double-tap faster than the window's floor never confirms; keyboard
//       R / Q still act at once; the result screens' START SCREEN arms too;
//     - a confirmed reload replaces the history entry (history.length stays).
//
// Honesty notes:
//   - the live section pins RIG's i-frames (test setup): enemy contact would
//     otherwise knock the closed-loop route off its line (measured: hp 3 -> 1
//     and a missed catwalk on the first unshielded run). Input is untouched.
//   - "tick" = one fixed 16.667 ms sim update. A CDP event lands between
//     frames, so "within N ticks" counts updates after the gameMs the page
//     reported when the dispatch resolved.
//   - window blur / visibilitychange are driven for real when the browser
//     will (a second page brought to front); otherwise synthetically, and the
//     report says which happened.
//   - Chromium does not double-tap-zoom a width=device-width page at all, so
//     the double-tap check cannot fail in this browser; the pinch check is the
//     falsifiable gesture guard (see the override run in the report).
//   - CDP touch input carries user activation already at pointerdown, so this
//     harness cannot tell a pointerdown audio unlock from a pointerup one.

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';
import { launchBrowser } from '../assets/lib/browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const BASE_URL = arg('--base-url');
// Evidence lands outside the repo unless --out says otherwise: the PNGs are
// large, and the committed T-101 evidence is a curated subset.
const OUT = resolve(arg('--out', join(tmpdir(), 'hullbreaker-touch-proof')));
const MUTATE = arg('--mutate');
const ONLY = new Set((arg('--only', 'frozen,live,legacy,title,shots,pause') || '').split(',').filter(Boolean));
const ALL_VIEWS = [
  { name: 'landscape', viewport: { width: 844, height: 390 } },
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  // T-126: iPhone SE / 8 held sideways, the smallest landscape the shell is held to
  { name: 'landscape667', viewport: { width: 667, height: 375 } },
];
const VIEWS_ARG = arg('--views');
const VIEWS = ALL_VIEWS.filter((v) => (VIEWS_ARG || 'landscape,portrait').split(',').includes(v.name));
// the pause section runs at both landscape sizes unless --views narrows it
const PAUSE_VIEWS = ALL_VIEWS.filter((v) => v.viewport.width > v.viewport.height &&
  (VIEWS_ARG || 'landscape,landscape667').split(',').includes(v.name));
const TICK_MS = 16.667;
const JUMP_TICKS_N = 3;
// Wall-clock ceiling for one in-page wait. Generous on purpose: under
// SwiftShader on a shared host a single frame has taken over a second, and a
// wait that expires mid-flight would report the HARNESS, not the controls
// (seen: a 20 s wait snapshotting RIG mid-air as a 'landing').
const WAIT_MS = 180000;

mkdirSync(OUT, { recursive: true });

/* ------------------------------ mutations ------------------------------ */
// Falsification: serve src/ui/touch-controls.js with one named defect and
// expect the proof to go red. Each is a single textual edit; the run fails
// loudly if the anchor text is missing (a stale mutation proves nothing).
const MUTATIONS = {
  // pointer bookkeeping: lifting ANY finger releases EVERY finger's codes
  'release-all-on-up': [
    '    clearSlot(i);\n    sync();\n  }',
    '    for (let k = 0; k < MAX_POINTERS; k++) clearSlot(k);\n    endStick();\n    sync();\n  }',
  ],
  // the deck stops listening for pointercancel — and for lostpointercapture,
  // the second release path Chromium fires right after a cancel (measured:
  // removing pointercancel alone left the check green, correctly)
  'ignore-cancel': [
    "    deck.addEventListener('pointercancel', onUp);\n    deck.addEventListener('lostpointercapture', onUp);\n",
    '\n',
  ],
  // a blur no longer releases anything
  'ignore-blur': [
    "    addEventListener('blur', () => releaseAll());\n",
    '\n',
  ],
  // JUMP becomes a pulse (the rejected scheme's fixed 96 ms press): a
  // release follows every press at once, so holding JUMP can no longer
  // carry a jump to full height
  'jump-pulse': [
    "        applyEdge(TOUCH_BIT_CODES[i], next & bit ? 'keydown' : 'keyup', false);\n",
    "        applyEdge(TOUCH_BIT_CODES[i], next & bit ? 'keydown' : 'keyup', false);\n" +
    "        if (bit === TOUCH_BIT.JUMP && (next & bit)) applyEdge('Space', 'keyup', false);\n",
  ],
  // the stick loses its vertical: no aim up, no down for drop-through
  'stick-no-vertical': [
    '      const bits = stickSectorBits(sector);\n',
    '      const bits = stickSectorBits(sector) & ~(TOUCH_BIT.UP | TOUCH_BIT.DOWN);\n',
  ],
  // only Down is lost: aim up still works, the drop-through must not
  'stick-no-down': [
    '      const bits = stickSectorBits(sector);\n',
    '      const bits = stickSectorBits(sector) & ~TOUCH_BIT.DOWN;\n',
  ],
  // T-105 follow-ups (T-101 review findings 1-3), one defect each:
  // leaving PLAYING (pause, death) no longer releases held fingers
  'ignore-leave-playing': [
    '    if (!playing && wasPlaying) releaseAll();\n',
    '\n',
  ],
  // a lifecycle release leaves a chip under a resting finger lit
  'chip-stays-lit': [
    '    clearChipLooks();\n    if (send) sync();',
    '    if (send) sync();',
  ],
  // a slot whose pointerup AND cancel were lost stays live until a lifecycle event
  'no-stale-release': [
    "    if (event.isPrimary && event.pointerType === 'touch') releaseStaleSlots();\n",
    '\n',
  ],
  // T-126 (section pause), one defect each, in the file named below:
  // the arming is gone: a run-ending control acts on its FIRST tap
  'no-arming': [
    '    if (button.dataset.armLabel) {\n',
    '    if (false) {\n',
  ],
  // a tap elsewhere no longer disarms an armed control
  'no-disarm': [
    "    if (armedEl && !(event.target && armedEl.contains(event.target))) disarm();\n",
    '\n',
  ],
  // a reloading option pushes a history entry (what a plain <a href> does)
  'reload-push': [
    '    location.replace(flagUrl(el.dataset.shellFlag, el.dataset.shellValue || null));\n',
    '    location.assign(flagUrl(el.dataset.shellFlag, el.dataset.shellValue || null));\n',
  ],
  // the option cells shrink under the 44 px floor
  'small-targets': [
    'min-width: 44px; min-height: 44px; padding: 0 8px;',
    'min-width: 30px; min-height: 30px; padding: 0 8px;',
  ],
  // the deck treats the whole options panel as a control: a tap on its empty
  // area no longer resumes (the old bottom-left trial cannot see this)
  'panel-swallows-taps': [
    "target.closest('a,button,summary,details,input,select,label')",
    "target.closest('a,button,summary,details,input,select,label,#ovPanel .panel')",
  ],
};
// the file each mutation is served into (default: the deck)
const MUTATION_FILE = {
  'no-arming': 'src/ui/shell.js',
  'no-disarm': 'src/ui/shell.js',
  'reload-push': 'src/ui/shell.js',
  'small-targets': 'index.html',
};
const mutationFile = (name) => MUTATION_FILE[name] || 'src/ui/touch-controls.js';

async function mutateRoute(route) {
  const response = await route.fetch();
  let body = await response.text();
  const [from, to] = MUTATIONS[MUTATE];
  if (!body.includes(from)) throw new Error(`mutation ${MUTATE}: anchor text not found in ${mutationFile(MUTATE)}`);
  body = body.replace(from, to);
  await route.fulfill({ response, body, headers: { ...response.headers(), 'cache-control': 'no-store' } });
}
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error(`unknown --mutate ${MUTATE}; known: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}

/* ------------------------------ reporting ------------------------------ */
const results = [];
const measures = {};
let current = '';
function check(name, pass, detail = '') {
  results.push({ view: current, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${current}] ${name}${detail ? ' — ' + detail : ''}`);
  return !!pass;
}
function measure(key, value) {
  (measures[current] ||= {})[key] = value;
  console.log(`  measure [${current}] ${key} = ${JSON.stringify(value)}`);
}

/* ------------------------------ touch rig ------------------------------ */
class Touch {
  constructor(cdp) { this.cdp = cdp; this.active = new Map(); }
  points() {
    return [...this.active.entries()].map(([id, p]) => ({
      x: p.x, y: p.y, id, radiusX: 7, radiusY: 7, force: 1,
    }));
  }
  async send(type, touchPoints) {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  async down(id, x, y) { this.active.set(id, { x, y }); await this.send('touchStart', this.points()); }
  async move(id, x, y) { this.active.set(id, { x, y }); await this.send('touchMove', this.points()); }
  async up(id) {
    const p = this.active.get(id);
    if (!p) return;
    this.active.delete(id);
    await this.send('touchEnd', [{ x: p.x, y: p.y, id, radiusX: 7, radiusY: 7, force: 1 }]);
  }
  async upAll() { this.active.clear(); await this.send('touchEnd', []); }
  async cancelAll() { this.active.clear(); await this.send('touchCancel', []); }
}

const KEYS = ['left', 'right', 'up', 'down', 'jump', 'fire', 'swap'];
const CODE_OF = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', jump: 'Space', fire: 'KeyX', swap: 'KeyC' };
const ORDER = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyC'];
const sortCodes = (codes) => [...codes].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

async function heldNow(page) {
  return page.evaluate(() => ({
    deck: __HB_TOUCH().held,
    keys: Object.fromEntries(['left', 'right', 'up', 'down', 'jump', 'fire', 'swap'].map((k) => [k, !!HB.keys[k]])),
  }));
}
function keysAsCodes(keys) { return sortCodes(KEYS.filter((k) => keys[k]).map((k) => CODE_OF[k])); }
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Wait for a page-side predicate; returns false instead of throwing on timeout.
async function until(page, fn, argument = null, timeout = WAIT_MS) {
  try {
    await page.waitForFunction(fn, argument, { timeout, polling: 'raf' });
    return true;
  } catch (_) { return false; }
}
// Let `n` animation frames pass (the deck's pointermove is rAF-aligned).
async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((done) => {
    let left = count;
    const step = () => (--left <= 0 ? done() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
}

// Screenshots: generous ceiling (one SwiftShader frame on a loaded host has
// exceeded Playwright's 30 s default), and a failed capture is a recorded
// FAIL, never a crash that throws away every other result.
async function shot(page, options) {
  try {
    await page.screenshot({ timeout: WAIT_MS, ...options });
    return true;
  } catch (error) {
    check(`capture ${options.path.split('/').pop()}`, false, String(error.message || error).split('\n')[0]);
    return false;
  }
}

// The frozen section tests the input layer alone, and every animation frame of
// the shipped scene is a full software-rendered draw here (SwiftShader, shared
// cores). Shadowing document.hidden/visibilityState WITHOUT dispatching an
// event makes the game loop skip its draw (src/main.js frame()) and keeps the
// inline freeze watchdog from mistaking that for a stall, while rAF, pointer
// dispatch and the deck itself run exactly as before. The visibility test
// lifts the shadow before it measures anything.
async function quiet(page, on) {
  await page.evaluate((hide) => {
    if (hide) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    } else {
      delete document.hidden;
      delete document.visibilityState;
    }
  }, on);
}

/* -------------------------------- boot --------------------------------- */
async function boot(newPage, view, { frozen = false, query = '', dpr = 1, audio = false, waitPlaying = true } = {}) {
  const owned = await newPage({
    viewport: view.viewport, deviceScaleFactor: dpr, isMobile: true, hasTouch: true,
  });
  const { page, context } = owned;
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (frozen) {
    await page.addInitScript(() => {
      globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__ = { version: 1, events: [], stopAtMs: 0 };
    });
  }
  if (MUTATE) await page.route(`**/${mutationFile(MUTATE)}*`, mutateRoute);
  const url = `${owned.baseUrl}/index.html?testapi=1&fixeddt=${TICK_MS}${audio ? '' : '&audio=0'}${query}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function',
    null, { timeout: 300000, polling: 250 });
  if (waitPlaying) {
    await page.waitForFunction(() => HB.state() === 'PLAYING', null, { timeout: 300000, polling: 250 });
  }
  const cdp = await context.newCDPSession(page);
  console.log(`  boot ${view.name} ${frozen ? 'frozen' : 'live'}${query} dpr${dpr}: ${Date.now() - t0} ms`);
  return { ...owned, cdp, errors, touch: new Touch(cdp) };
}

/* ------------------------------ sections ------------------------------- */

async function layoutAndStyle(page) {
  const r = await page.evaluate(() => {
    const L = __HB_TOUCH().layout;
    const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
    const cs = (sel) => {
      const node = typeof sel === 'string' ? document.querySelector(sel) : sel;
      const s = getComputedStyle(node);
      return { touchAction: s.touchAction, userSelect: s.userSelect || s.webkitUserSelect,
        webkitUserSelect: s.webkitUserSelect, callout: s.webkitTouchCallout || null };
    };
    return {
      L, jump: rect('thumbJump'), fire: rect('thumbFire'), swap: rect('thumbSwap'),
      pause: rect('thumbPause'), auto: rect('thumbAuto'),
      deckHidden: document.getElementById('thumbDeck').hidden,
      legacyHidden: document.getElementById('touchDeck').hidden,
      styles: Object.fromEntries(['#thumbDeck', '#thumbJump', '#thumbFire', '#thumbSwap', '#thumbPause',
        '#thumbAuto', '#thumbStick', '#thumbNub', 'canvas'].map((s) => [s, cs(s)])),
      htmlTouch: getComputedStyle(document.documentElement).touchAction,
      bodySelect: getComputedStyle(document.body).userSelect,
    };
  });
  check('the two-thumb deck is the touch default (legacy deck stays hidden)', !r.deckHidden && r.legacyHidden);
  const near = (a, b) => Math.abs(a - b) <= 1.01;
  check('JUMP is drawn where the pure layout hit-tests it',
    near(r.jump.left + r.jump.width / 2, r.L.jump.cx) && near(r.jump.top + r.jump.height / 2, r.L.jump.cy) &&
    near(r.jump.width / 2, r.L.jump.r), `rect ${JSON.stringify(r.jump)} vs ${JSON.stringify(r.L.jump)}`);
  check('FIRE is drawn where the pure layout hit-tests it',
    near(r.fire.left + r.fire.width / 2, r.L.fire.cx) && near(r.fire.top + r.fire.height / 2, r.L.fire.cy) &&
    near(r.fire.width / 2, r.L.fire.r));
  for (const [sel, s] of Object.entries(r.styles)) {
    check(`${sel} computes touch-action:none`, s.touchAction === 'none', s.touchAction);
    if (sel !== 'canvas') check(`${sel} computes user-select:none`, s.userSelect === 'none', s.userSelect);
  }
  check('the page refuses pinch/double-tap zoom (html touch-action pan-x pan-y)',
    r.htmlTouch === 'pan-x pan-y', r.htmlTouch);
  check('body text selection is off in touch mode', r.bodySelect === 'none', r.bodySelect);
  measure('layout', r.L);
  return r.L;
}

async function pointerBookkeeping(page, T, L) {
  // S = stick held right, F = FIRE, J = JUMP. Pressed and released in every
  // order; after EVERY step the deck's ledger and the sim's keys must equal
  // exactly the union of the fingers still down.
  const P = {
    S: { id: 11, x: L.ghost.cx, y: L.ghost.cy, codes: ['ArrowRight'] },
    F: { id: 12, x: L.fire.cx, y: L.fire.cy, codes: ['KeyX'] },
    J: { id: 13, x: L.jump.cx, y: L.jump.cy, codes: ['Space'] },
  };
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) =>
    perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const orders = perms(['S', 'F', 'J']);
  let steps = 0, bad = 0;
  const firstBad = [];
  for (const press of orders) {
    for (const release of orders) {
      const down = new Set();
      const expectNow = async (label) => {
        await frames(page, down.has('S') ? 2 : 1);
        const h = await heldNow(page);
        const want = sortCodes([...down].flatMap((k) => P[k].codes));
        const okDeck = same(sortCodes(h.deck), want);
        const okSim = same(keysAsCodes(h.keys), want);
        steps++;
        if (!okDeck || !okSim) {
          bad++;
          if (firstBad.length < 4) firstBad.push(`${press.join('')}/${release.join('')} ${label}: deck=${h.deck} sim=${keysAsCodes(h.keys)} want=${want}`);
        }
      };
      for (const k of press) {
        const p = P[k];
        await T.down(p.id, p.x, p.y);
        if (k === 'S') await T.move(p.id, p.x + 44, p.y);
        down.add(k);
        await expectNow(`after +${k}`);
      }
      for (const k of release) {
        await T.up(P[k].id);
        down.delete(k);
        await expectNow(`after -${k}`);
      }
    }
  }
  check(`3 pointers x 36 press/release orders: held set exact after all ${steps} steps`,
    bad === 0, bad ? `${bad} bad steps; ${firstBad.join(' | ')}` : 'deck ledger and sim keys agree');
  measure('bookkeepingSteps', { steps, bad });

  // extra: a second finger on JUMP is a new press (air jump) and lifting one
  // of the two keeps jump held — the K-while-Space-held keyboard semantics.
  const before = await page.evaluate(() => __HB_TOUCH().jumps);
  await T.down(21, L.jump.cx, L.jump.cy);
  await T.down(22, L.jump.cx + 6, L.jump.cy - 6);
  const mid = await page.evaluate(() => ({ jumps: __HB_TOUCH().jumps, jump: HB.keys.jump }));
  await T.up(21);
  const after = await heldNow(page);
  await T.up(22);
  const end = await heldNow(page);
  check('a second finger on JUMP is a second press; lifting one keeps JUMP held',
    mid.jumps - before === 2 && mid.jump && after.keys.jump && !end.keys.jump,
    `presses ${mid.jumps - before}, held after first lift ${after.keys.jump}, after both ${end.keys.jump}`);
}

async function realFocusLoss(context, page) {
  await page.evaluate(() => {
    window.__t101 = { blur: 0, vis: 0 };
    addEventListener('blur', () => { window.__t101.blur++; });
    document.addEventListener('visibilitychange', () => { window.__t101.vis++; });
  });
  const other = await context.newPage();
  await other.bringToFront();
  await other.waitForTimeout(250);
  const seen = await page.evaluate(() => ({ ...window.__t101 }));
  return { other, seen };
}

async function lifecycleReleases(owned, L) {
  const { page, touch: T, context } = owned;
  const press = async () => {
    await T.down(31, L.ghost.cx, L.ghost.cy);
    await T.move(31, L.ghost.cx + 44, L.ghost.cy);
    await T.down(32, L.fire.cx, L.fire.cy);
    await T.down(33, L.jump.cx, L.jump.cy);
    await frames(page, 2);
    const h = await heldNow(page);
    return same(sortCodes(h.deck), ['ArrowRight', 'Space', 'KeyX']);
  };
  const released = async () => {
    await frames(page, 2);
    const h = await heldNow(page);
    return { ok: h.deck.length === 0 && keysAsCodes(h.keys).length === 0, h };
  };

  // pointercancel
  let armed = await press();
  await T.cancelAll();
  let r = await released();
  check('pointercancel mid-press releases every held code', armed && r.ok, JSON.stringify(r.h));

  // window blur, isolated: nothing but a blur event reaches the page
  armed = await press();
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  r = await released();
  check('window blur mid-press releases every held code (isolated blur event)', armed && r.ok,
    JSON.stringify(r.h));
  await T.upAll();

  // …and a real focus loss: another page brought to front. Which events the
  // browser actually delivered is recorded, so the result is not over-read.
  await quiet(page, false);
  armed = await press();
  const loss = await realFocusLoss(context, page);
  const hl = await heldNow(page);
  if (loss.seen.blur + loss.seen.vis > 0) {
    check(`a real focus loss mid-press releases every held code (blur ${loss.seen.blur}x, ` +
      `visibilitychange ${loss.seen.vis}x delivered)`,
      armed && hl.deck.length === 0 && keysAsCodes(hl.keys).length === 0, JSON.stringify(hl));
  } else {
    console.log(`  NOTE [${current}] this browser delivered no blur/visibilitychange for a real ` +
      'focus loss; only the isolated and synthetic trials stand for it');
  }
  measure('realFocusLoss', loss.seen);
  await page.bringToFront();
  await loss.other.close();
  await T.upAll();
  await quiet(page, true);

  // visibilitychange: real when bringing another page forward hides this one
  await quiet(page, false);
  armed = await press();
  const other = await context.newPage();
  await other.bringToFront();
  await other.waitForTimeout(150);
  let hiddenReal = await page.evaluate(() => document.visibilityState === 'hidden');
  if (!hiddenReal) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  // a hidden page skips frames, so read the ledger without waiting on rAF
  const hv = await heldNow(page);
  check(`visibilitychange (hidden) mid-press releases every held code (${hiddenReal ? 'real' : 'synthetic hidden'})`,
    armed && hv.deck.length === 0 && keysAsCodes(hv.keys).length === 0, JSON.stringify(hv));
  measure('visibilityDriven', hiddenReal ? 'real' : 'synthetic');
  if (!hiddenReal) {
    await page.evaluate(() => {
      delete document.hidden; delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  await page.bringToFront();
  await other.close();
  await T.upAll();
  await quiet(page, true);

  // orientation flip
  armed = await press();
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(300);
  const ho = await heldNow(page);
  check('an orientation change mid-press releases every held code',
    armed && ho.deck.length === 0 && keysAsCodes(ho.keys).length === 0, JSON.stringify(ho));
  await T.upAll();
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
  // lifting fingers the deck already let go of must not resurrect anything
  const clean = await heldNow(page);
  check('lifting already-released fingers sends nothing back', clean.deck.length === 0 &&
    keysAsCodes(clean.keys).length === 0);
}

// T-105: the three T-101 review follow-ups, each with its own mutation above.
async function followUps(owned, L) {
  const { page, touch: T } = owned;
  const press = async () => {
    await T.down(71, L.ghost.cx, L.ghost.cy);
    await T.move(71, L.ghost.cx + 44, L.ghost.cy);
    await T.down(72, L.fire.cx, L.fire.cy);
    await T.down(73, L.jump.cx, L.jump.cy);
    await frames(page, 2);
    const h = await heldNow(page);
    return same(sortCodes(h.deck), ['ArrowRight', 'Space', 'KeyX']) &&
      same(keysAsCodes(h.keys), ['ArrowRight', 'Space', 'KeyX']);
  };
  const empty = (h) => h.deck.length === 0 && keysAsCodes(h.keys).length === 0;
  const setState = (s) => page.evaluate(async (next) => (await import('/src/sim/state.js')).setState(next), s);

  // (finding 1) three fingers down, then the game leaves PLAYING: a pause from
  // the keyboard (an iPad keyboard, or any path that is not the deck's own
  // chip), and a death (GAME_OVER, forced through the sim's state module —
  // test setup, as in modalTaps). Every held code must be released, and the
  // fingers must stay inert until lifted.
  for (const [label, enter, leave] of [
    ['PAUSED (P key)', () => page.keyboard.press('KeyP'), () => page.keyboard.press('KeyP')],
    ['GAME_OVER', () => setState('GAME_OVER'), () => page.keyboard.press('KeyR')],
  ]) {
    const armed = await press();
    await enter();
    await until(page, (want) => HB.state() === want, label.split(' ')[0]);
    await frames(page, 3);
    const held = await heldNow(page);
    await leave();
    await until(page, () => HB.state() === 'PLAYING');
    await frames(page, 2);
    const back = await heldNow(page);
    await T.upAll();
    await frames(page, 2);
    const lifted = await heldNow(page);
    check(`3 fingers down, then ${label}: every held code is released, and stays released after ` +
      'PLAYING resumes and the fingers lift', armed && empty(held) && empty(back) && empty(lifted),
      `held ${JSON.stringify(held)} back ${JSON.stringify(back)} lifted ${JSON.stringify(lifted)}`);
  }

  // (finding 2) a finger resting on a chip when a lifecycle release fires
  // (an isolated blur): the chip's lit look goes out with the release, and
  // lifting the finger afterwards sends nothing.
  const lit = () => page.evaluate(() => [...document.querySelectorAll('#thumbDeck [data-chip]')]
    .filter((e) => e.classList.contains('down')).map((e) => e.id));
  const sc = { x: L.swap.x + L.swap.w / 2, y: L.swap.y + L.swap.h / 2 };
  await T.down(74, sc.x, sc.y);
  await frames(page, 2);
  const before = await lit();
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await frames(page, 2);
  const afterBlur = await lit();
  await T.up(74);
  await frames(page, 2);
  const afterLift = await lit();
  const quiet2 = await heldNow(page);
  check('a lifecycle release with a finger resting on a chip puts the chip\'s lit look out',
    before.includes('thumbSwap') && afterBlur.length === 0 && afterLift.length === 0 && empty(quiet2),
    `lit before ${JSON.stringify(before)}, after blur ${JSON.stringify(afterBlur)}, after lift ${JSON.stringify(afterLift)}`);

  // (finding 3) a finger on JUMP whose pointerup AND cancel are both lost (an
  // iOS system gesture can swallow them; CDP cannot drop them, so a capture-
  // phase listener on window eats them before the deck hears). The next touch
  // is a fresh primary pointer: it must release the stale JUMP and work.
  await page.evaluate(() => {
    window.__t105swallow = false;
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      addEventListener(type, (e) => { if (window.__t105swallow) e.stopImmediatePropagation(); }, true);
    }
  });
  await T.down(75, L.jump.cx, L.jump.cy);
  await frames(page, 2);
  const jumpHeld = await heldNow(page);
  await page.evaluate(() => { window.__t105swallow = true; });
  await T.up(75);
  await frames(page, 2);
  await page.evaluate(() => { window.__t105swallow = false; });
  const stuck = await heldNow(page);
  await T.down(76, L.ghost.cx, L.ghost.cy);
  await frames(page, 2);
  const afterNew = await heldNow(page);
  await T.move(76, L.ghost.cx + 44, L.ghost.cy);
  await frames(page, 2);
  const steering = await heldNow(page);
  await T.up(76);
  await frames(page, 2);
  const done = await heldNow(page);
  check('a JUMP whose pointerup and cancel were both lost is released by the next touch, which then works',
    same(jumpHeld.deck, ['Space']) && same(stuck.deck, ['Space']) && empty(afterNew) &&
      same(sortCodes(steering.deck), ['ArrowRight']) && same(keysAsCodes(steering.keys), ['ArrowRight']) && empty(done),
    `held ${JSON.stringify(jumpHeld.deck)}, after the lost lift ${JSON.stringify(stuck.deck)}, ` +
    `after a new touch ${JSON.stringify(afterNew)}, steering ${JSON.stringify(steering.deck)}, done ${JSON.stringify(done)}`);
}

async function modalTaps(owned, L) {
  const { page, touch: T } = owned;
  const tap = async (id, x, y) => { await T.down(id, x, y); await T.up(id); };
  const pc = { x: L.pause.x + L.pause.w / 2, y: L.pause.y + L.pause.h / 2 };
  await tap(41, pc.x, pc.y);
  await page.waitForTimeout(400);
  const s1 = await page.evaluate(() => ({ state: HB.state(), cue: __HB_TOUCH().modal.cue,
    shown: getComputedStyle(document.getElementById('thumbModal')).display }));
  check('PAUSE chip tap pauses (and its own lift does not resume)', s1.state === 'PAUSED', JSON.stringify(s1));
  check('the paused screen tells a touch player how to resume', s1.cue === 'TAP TO RESUME' && s1.shown !== 'none');
  // empty overlay background, clear of the options panel's links
  const bg = { x: L.width * 0.07, y: L.height * 0.9 };
  await tap(42, bg.x, bg.y);
  await until(page, () => HB.state() === 'PLAYING');
  check('a tap on the pause screen resumes', (await page.evaluate(() => HB.state())) === 'PLAYING');

  // GAME_OVER: forced through the sim's state module (test setup). A tap
  // before the screen arms must not restart; one after must.
  // Both instants are stamped in-page: under load the CDP round trip alone
  // can outlast the 650 ms arming window, and a late "early" tap proves
  // nothing either way.
  await page.evaluate(async () => {
    window.__t101modal = { downs: [] };
    document.addEventListener('pointerdown', () => window.__t101modal.downs.push(performance.now()), true);
    (await import('/src/sim/state.js')).setState('GAME_OVER');
    window.__t101modal.shownAt = performance.now();
  });
  await tap(43, bg.x, bg.y);
  await page.waitForTimeout(80);
  const early = await page.evaluate(() => ({ state: HB.state(),
    afterMs: window.__t101modal.downs[0] - window.__t101modal.shownAt }));
  if (early.afterMs < 650) {
    check(`an early tap on GAME_OVER (${Math.round(early.afterMs)} ms after it showed) does not skip the screen`,
      early.state === 'GAME_OVER', early.state);
  } else {
    console.log(`  NOTE [${current}] the "early" GAME_OVER tap landed ${Math.round(early.afterMs)} ms late ` +
      '(host load); the arming check is not judged this run');
    if (early.state !== 'GAME_OVER') {
      await page.evaluate(async () => { (await import('/src/sim/state.js')).setState('GAME_OVER'); });
    }
  }
  await page.waitForTimeout(900);
  await tap(44, bg.x, bg.y);
  await until(page, () => HB.state() === 'PLAYING');
  const s2 = await page.evaluate(() => ({ state: HB.state() }));
  check('a tap on an armed GAME_OVER screen restarts the run', s2.state === 'PLAYING', JSON.stringify(s2));
  measure('gameOverEarlyTapMs', Math.round(early.afterMs));
}

/* ------------------------- pause safety (T-126) ------------------------ *
 * Nothing on the pause screen throws a run away by accident. The run is
 * "ended" if the reset registry ran (HB.resetRegistry().runs: restart and
 * start screen both reset), the state left for MENU, or the page reloaded
 * (a marker on window is gone). Every timing is judged on the page's own
 * clock (click event times), never on the harness's.                      */
const CONTROLS = 'a,button,summary,details,input,select,label';   // = the deck's interactive()

async function pauseSafety(newPage, view) {
  const owned = await boot(newPage, view, { frozen: true });
  const { page, touch: T } = owned;
  const W = view.viewport.width, H = view.viewport.height;
  try {
    await quiet(page, true);
    const L = await page.evaluate(() => __HB_TOUCH().layout);
    const policy = await page.evaluate(async () => ({ ...(await import('/src/pure/shell-copy.js')).CONFIRM_TAP }));
    measure('confirmPolicy', policy);
    const install = () => page.evaluate(() => {
      window.__t126 = { clicks: [], mark: true };
      document.getElementById('ovPanel').addEventListener('click', (e) => {
        const b = e.target && e.target.closest ? e.target.closest('button') : null;
        if (b) window.__t126.clicks.push({ t: e.timeStamp, text: b.textContent });
      }, true);
    });
    await install();
    // a tap whose lift is not held back by the harness: both CDP events are
    // queued before either is acknowledged (the deck's modal tap counts only
    // when pointerdown -> pointerup is <= 700 ms on the page's clock)
    let tapId = 300;
    const tap = async (x, y) => {
      const id = tapId++;
      const p = [{ x, y, id, radiusX: 7, radiusY: 7, force: 1 }];
      const down = T.send('touchStart', p);
      await T.send('touchEnd', p);
      await down;
    };
    const runs = () => page.evaluate(() => HB.resetRegistry().runs);
    const state = () => page.evaluate(() => HB.state());
    const look = () => page.evaluate((sel) => ({
      state: HB.state(),
      runs: HB.resetRegistry().runs,
      armed: [...document.querySelectorAll('#ovPanel .armed')].map((b) => b.textContent),
      mark: !!(window.__t126 && window.__t126.mark),
      url: location.search,
      history: history.length,
      controls: [...document.querySelectorAll('#ovPanel ' + sel.split(',').join(',#ovPanel '))]
        .filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()),
    }), CONTROLS);
    const centreOf = (sel) => page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: e.textContent.trim() };
    }, sel);
    const lastClick = () => page.evaluate(() => window.__t126.clicks[window.__t126.clicks.length - 1] || null);
    // wait until `ms` has passed on the page's clock since `t` (a click's event time)
    const pageWait = (t, ms) => until(page, ([from, span]) => performance.now() >= from + span, [t, ms], 60000);
    const pause = async () => {
      await tap(L.pause.x + L.pause.w / 2, L.pause.y + L.pause.h / 2);
      const okp = await until(page, () => HB.state() === 'PAUSED', null, 30000);
      await frames(page, 2);
      return okp;
    };
    const toPlaying = async () => {
      // from MENU a tap anywhere starts the run (the title's own rule)
      if ((await state()) === 'MENU') await tap(W * 0.5, H * 0.5);
      return until(page, () => HB.state() === 'PLAYING', null, 30000);
    };
    // let an armed control run out its window without touching anything
    const waitOut = async (since) => {
      await pageWait(since, policy.windowMs + 400);
      await until(page, () => !document.querySelector('#ovPanel .armed'), null, 30000);
    };

    // 1. targets: every control on the pause panel, at this size
    let okPause = await pause();
    const targets = await page.evaluate((sel) => [...document.querySelectorAll('#ovPanel ' + sel.split(',').join(',#ovPanel '))]
      .filter((e) => e.getClientRects().length).map((e) => {
        const r = e.getBoundingClientRect();
        return { text: e.textContent.trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1), tag: e.tagName.toLowerCase(),
          href: e.tagName === 'A' && e.hasAttribute('href') };
      }), CONTROLS);
    const small = targets.filter((c) => c.w < 44 || c.h < 44);
    const reloads = await page.evaluate(() => document.querySelectorAll('#ovPanel [data-shell-action="reload"]').length);
    check(`pause ${W}x${H}: every pause control is >= 44 x 44 css px (${targets.length} controls, ` +
      `smallest ${Math.min(...targets.map((c) => c.w))} x ${Math.min(...targets.map((c) => c.h))})`,
      okPause && targets.length >= 4 && reloads >= 1 && small.length === 0,
      small.length ? 'under 44: ' + small.map((c) => `${c.text} ${c.w}x${c.h}`).join(', ') : `${reloads} reloading options`);
    measure('pauseTargets', targets);

    // 2. a tap not on a control resumes — wherever it lands. Points are kept
    //    a thumb's width (12 px) from every control: Chromium, like iOS,
    //    adjusts a touch onto a nearby target, and that is not this question.
    const points = await page.evaluate(([sel, W, H]) => {
      const ctl = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length)
        .map((e) => e.getBoundingClientRect());
      const clear = (x, y) => ctl.every((r) => x < r.left - 12 || x > r.right + 12 || y < r.top - 12 || y > r.bottom + 12);
      const onControl = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest(sel)); };
      const panel = document.querySelector('#ovPanel .panel').getBoundingClientRect();
      const title = document.getElementById('ovTitle').getBoundingClientRect();
      const cue = document.getElementById('thumbModal').getBoundingClientRect();
      let best = null;                       // the panel's empty area nearest the screen centre
      for (let y = panel.top + 3; y < panel.bottom - 3; y += 3) {
        for (let x = panel.left + 3; x < panel.right - 3; x += 3) {
          if (onControl(x, y) || !clear(x, y)) continue;
          const d = Math.hypot(x - W / 2, y - H / 2);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      const named = [
        ['mid-screen over the panel\'s empty area', best && best.x, best && best.y],
        ['the screen centre', W / 2, H / 2],
        ['the PAUSED title', title.left + title.width / 2, title.top + title.height / 2],
        ['left of the panel', Math.max(30, panel.left / 2), H / 2],
        ['right of the panel', panel.right + (W - panel.right) / 2, H / 2],
        ['the TAP TO RESUME cue', cue.left + cue.width / 2, cue.top + cue.height / 2],
        ['the bottom-left corner (the old trial point)', W * 0.06, H * 0.93],
      ];
      return named.map(([name, x, y]) => ({ name, x, y,
        control: x == null ? null : onControl(x, y), clear: x == null ? null : clear(x, y),
        inPanel: x != null && x >= panel.left && x <= panel.right && y >= panel.top && y <= panel.bottom }));
    }, [CONTROLS, W, H]);
    measure('resumePoints', points);
    const mid = points[0];
    check(`pause ${W}x${H}: the panel has an empty area mid-screen (inside the central 60% x 60%)`,
      mid.x != null && mid.inPanel && mid.x >= W * 0.2 && mid.x <= W * 0.8 && mid.y >= H * 0.2 && mid.y <= H * 0.8,
      mid.x != null ? `(${mid.x.toFixed(0)}, ${mid.y.toFixed(0)})` : 'no empty point in the panel');
    for (const p of points) {
      if (p.x == null) continue;
      if (p.control || !p.clear) {
        console.log(`  NOTE [${current}] ${p.name} (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) is on or beside a control; ` +
          'not a resume trial (the arming trials cover a tap there)');
        continue;
      }
      if ((await state()) !== 'PAUSED') okPause = await pause();
      const r0 = await runs();
      await tap(p.x, p.y);
      const resumed = await until(page, () => HB.state() === 'PLAYING', null, 20000);
      const after = await look();
      check(`pause ${W}x${H}: a tap on ${p.name} (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) resumes the run`,
        okPause && resumed && after.runs === r0 && after.mark,
        `state ${after.state}, resets ${r0} -> ${after.runs}`);
    }

    // 3. ONE tap on a run-ending control only arms it; left alone it disarms
    //    and the run is untouched
    const single = async (label, sel, expectState) => {
      if ((await state()) !== expectState) return check(`${label}: screen reached`, false, await state());
      const before = await look();
      const c = await centreOf(sel);
      if (!c) return check(`${label}: control present`, false, sel);
      await tap(c.x, c.y);
      const armedOk = await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
      const armed = await look();
      const click = await lastClick();
      await waitOut(click ? click.t : 0);
      const after = await look();
      return check(`${label}: ONE tap only arms it ("${armed.armed[0] || '?'}"); left alone it disarms and the run ` +
        `is untouched (still ${expectState}, no reset, no reload)`,
        armedOk && armed.armed.length === 1 && /TAP AGAIN/.test(armed.armed[0]) && armed.state === expectState &&
        after.state === expectState && after.runs === before.runs && after.mark && after.url === before.url &&
        after.armed.length === 0 && after.controls.includes(c.text),
        `armed ${JSON.stringify(armed.armed)} state ${armed.state} -> ${after.state}, resets ${before.runs} -> ${after.runs}, ` +
        `reloaded ${!after.mark}, label back ${after.controls.includes(c.text)}`);
    };
    if ((await state()) !== 'PAUSED') await pause();
    await single(`pause ${W}x${H}: RESTART RUN`, '#ovPanel [data-shell-action="restart"]', 'PAUSED');
    await single(`pause ${W}x${H}: START SCREEN`, '#ovPanel [data-shell-action="title"]', 'PAUSED');
    await single(`pause ${W}x${H}: a reloading option`, '#ovPanel [data-shell-action="reload"]', 'PAUSED');

    // 4. any other tap disarms
    const restartSel = '#ovPanel [data-shell-action="restart"]';
    {
      // (a) another control that does nothing (the option already chosen):
      //     no state change to hide behind — only the disarm can explain it
      const r0 = await runs();
      const rr = await centreOf(restartSel);
      const inert = await centreOf('#ovPanel [aria-pressed="true"]');
      await tap(rr.x, rr.y);
      await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
      const first = await lastClick();
      await tap(inert.x, inert.y);
      await frames(page, 1);
      const mid1 = await look();
      await pageWait(first.t, policy.minMs + 150);
      const rr2 = await centreOf(restartSel);
      await tap(rr2.x, rr2.y);
      await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
      const second = await lastClick();
      const after = await look();
      const gap = second && first ? second.t - first.t : null;
      const label = `pause ${W}x${H}: a tap on another control (the chosen "${inert.text}") disarms RESTART RUN; ` +
        `the next tap on it arms it again instead of restarting (${gap == null ? '?' : Math.round(gap)} ms after the first)`;
      const detail = `after the other tap: armed ${JSON.stringify(mid1.armed)}; after RESTART again: state ` +
        `${after.state}, resets ${r0} -> ${after.runs}, armed ${JSON.stringify(after.armed)}`;
      if (gap != null && gap >= policy.minMs && gap <= policy.windowMs) {
        check(label, mid1.armed.length === 0 && mid1.state === 'PAUSED' && after.state === 'PAUSED' &&
          after.runs === r0 && after.armed.length === 1, detail);
      } else {
        // outside the window the second tap would re-arm anyway: this run cannot tell
        console.log(`  NOTE [${current}] not judged: the second tap landed ${gap == null ? '?' : Math.round(gap)} ms ` +
          `after the first, outside [${policy.minMs}, ${policy.windowMs}] (host load) — ${detail}`);
        measure('disarmUndecided', { gap, detail });
      }
      await waitOut(second ? second.t : 0);
    }
    {
      // (b) the other run-ending control takes the arming over
      const r0 = await runs();
      const rr = await centreOf(restartSel);
      const ss = await centreOf('#ovPanel [data-shell-action="title"]');
      await tap(rr.x, rr.y);
      await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
      await tap(ss.x, ss.y);
      await frames(page, 1);
      const mid2 = await look();
      const click = await lastClick();
      await waitOut(click ? click.t : 0);
      const after = await look();
      check(`pause ${W}x${H}: tapping START SCREEN while RESTART RUN is armed moves the arming over; left alone, ` +
        'nothing ends', mid2.armed.length === 1 && /QUIT|START/.test(mid2.armed[0]) &&
        mid2.controls.includes('RESTART RUN') && after.state === 'PAUSED' && after.runs === r0 && after.armed.length === 0,
        `armed ${JSON.stringify(mid2.armed)}, state ${after.state}, resets ${r0} -> ${after.runs}`);
    }
    {
      // (c) a tap off the controls disarms AND resumes; the next pause starts unarmed
      const r0 = await runs();
      const rr = await centreOf(restartSel);
      await tap(rr.x, rr.y);
      await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
      if (mid.x != null) await tap(mid.x, mid.y);
      const resumed = await until(page, () => HB.state() === 'PLAYING', null, 20000);
      await pause();
      const after = await look();
      check(`pause ${W}x${H}: with RESTART RUN armed, a tap on the panel's empty area resumes without restarting; ` +
        'the next pause starts unarmed', resumed && after.runs === r0 && after.armed.length === 0 &&
        after.controls.includes('RESTART RUN'), `resumed ${resumed}, resets ${r0} -> ${after.runs}, armed ${JSON.stringify(after.armed)}`);
    }

    // 5. a double-tap faster than the window's floor is ONE gesture: never a confirm
    {
      const r0 = await runs();
      const n0 = await page.evaluate(() => window.__t126.clicks.length);
      const rr = await centreOf(restartSel);
      const p = (id) => [{ x: rr.x, y: rr.y, id, radiusX: 7, radiusY: 7, force: 1 }];
      const sends = [T.send('touchStart', p(401)), T.send('touchEnd', p(401)),
        T.send('touchStart', p(402)), T.send('touchEnd', p(402))];
      await Promise.all(sends);
      await until(page, (n) => window.__t126.clicks.length >= n + 2, n0, 20000);
      const clicks = await page.evaluate((n) => window.__t126.clicks.slice(n), n0);
      await frames(page, 2);
      const after = await look();
      const gap = clicks.length >= 2 ? clicks[1].t - clicks[0].t : null;
      if (gap != null && gap < policy.minMs) {
        check(`pause ${W}x${H}: a double-tap on RESTART RUN (${Math.round(gap)} ms apart) arms it once and never ` +
          'restarts', after.state === 'PAUSED' && after.runs === r0 && after.armed.length === 1,
          `state ${after.state}, resets ${r0} -> ${after.runs}, armed ${JSON.stringify(after.armed)}`);
      } else {
        console.log(`  NOTE [${current}] the double-tap's clicks landed ${gap == null ? '?' : Math.round(gap)} ms apart ` +
          `(>= ${policy.minMs} on this host): not judged this run`);
        measure('doubleTapUndecided', { gap, state: after.state, resets: [r0, after.runs] });
      }
      if (clicks.length) await waitOut(clicks[clicks.length - 1].t);
      if ((await state()) !== 'PAUSED') { await toPlaying(); await pause(); }
    }

    // 6. a second tap inside the window confirms — by the one path each control had
    // tap, wait past the floor on the page's clock, tap again; returns the two
    // clicks' gap. A gap the host pushed outside the window re-arms instead of
    // confirming (nothing ends), so that attempt is retried, not judged.
    const confirmTwice = async (sel) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const c = await centreOf(sel);
        await tap(c.x, c.y);
        await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
        const first = await lastClick();
        await pageWait(first.t, policy.minMs + 200);
        await tap(c.x, c.y);
        await until(page, (t) => { const k = window.__t126.clicks; return k.length > 0 && k[k.length - 1].t > t; },
          first.t, 20000);
        const second = await lastClick();
        const gap = second.t - first.t;
        if (gap >= policy.minMs && gap <= policy.windowMs) return gap;
        console.log(`  NOTE [${current}] confirm attempt ${attempt}: the taps landed ${Math.round(gap)} ms apart, ` +
          'outside the window (host load); retried');
        await waitOut(second.t);
      }
      return null;
    };
    {
      const r0 = await runs();
      const gap = await confirmTwice(restartSel);
      const restarted = await until(page, () => HB.state() === 'PLAYING', null, 20000);
      const after = await look();
      check(`pause ${W}x${H}: a second tap on RESTART RUN inside the window (${gap == null ? '?' : Math.round(gap)} ms) ` +
        'restarts the run', gap != null && restarted && after.runs === r0 + 1,
        `state ${after.state}, resets ${r0} -> ${after.runs}`);
      await pause();
    }
    {
      const r0 = await runs();
      const gap = await confirmTwice('#ovPanel [data-shell-action="title"]');
      const titled = await until(page, () => HB.state() === 'MENU', null, 20000);
      const after = await look();
      check(`pause ${W}x${H}: a second tap on START SCREEN inside the window (${gap == null ? '?' : Math.round(gap)} ms) ` +
        'goes to the start screen', gap != null && titled && after.runs === r0 + 1,
        `state ${after.state}, resets ${r0} -> ${after.runs}`);
      await toPlaying();
      await pause();
    }

    // 7. the keyboard is unchanged: R and Q act at once, on a touch device too
    {
      const r0 = await runs();
      await page.keyboard.press('KeyR');
      const restarted = await until(page, () => HB.state() === 'PLAYING', null, 20000);
      const r1 = await runs();
      await pause();
      await page.keyboard.press('KeyQ');
      const titled = await until(page, () => HB.state() === 'MENU', null, 20000);
      const r2 = await runs();
      check(`pause ${W}x${H}: keyboard R restarts and Q goes to the start screen at ONE press (no arming)`,
        restarted && r1 === r0 + 1 && titled && r2 === r1 + 1, `resets ${r0} -> ${r1} -> ${r2}`);
      await toPlaying();
    }

    // 8. the result screens carry START SCREEN too: one tap arms, two leave
    for (const [screen, settleMs] of [['GAME_OVER', 1000], ['VICTORY', 2800]]) {
      // TEST SETUP: the state is forced through the sim's state module, as in modalTaps
      await page.evaluate(async (s) => { (await import('/src/sim/state.js')).setState(s); }, screen);
      await page.waitForTimeout(settleMs);
      await single(`${screen} ${W}x${H}: START SCREEN`, '#ovPanel [data-shell-action="title"]', screen);
      const r0 = await runs();
      const gap = await confirmTwice('#ovPanel [data-shell-action="title"]');
      const titled = await until(page, () => HB.state() === 'MENU', null, 20000);
      const after = await look();
      check(`${screen} ${W}x${H}: a second tap on START SCREEN inside the window ` +
        `(${gap == null ? '?' : Math.round(gap)} ms) goes to the start screen`,
        gap != null && titled && after.runs === r0 + 1, `state ${after.state}, resets ${r0} -> ${after.runs}`);
      await toPlaying();
    }

    // 9. a confirmed reload replaces the history entry: nothing for Safari's
    //    edge back-swipe to return to mid-run
    {
      await pause();
      const before = await look();
      const sel = '#ovPanel [data-shell-action="reload"][data-shell-flag="view"]';
      const flag = await page.evaluate((s) => {
        const e = document.querySelector(s);
        return e.dataset.shellFlag + '=' + e.dataset.shellValue;
      }, sel);
      let navigated = false;
      for (let attempt = 1; attempt <= 2 && !navigated; attempt++) {
        const cell = await centreOf(sel);
        await tap(cell.x, cell.y);
        await until(page, () => !!document.querySelector('#ovPanel .armed'), null, 20000);
        const first = await lastClick();
        await pageWait(first.t, policy.minMs + 200);
        const nav = page.waitForURL((u) => u.search.includes(flag), { timeout: 60000, waitUntil: 'commit' })
          .then(() => true, () => false);
        await tap(cell.x, cell.y);
        navigated = await nav;
        if (!navigated) {
          const second = await lastClick();
          console.log(`  NOTE [${current}] reload attempt ${attempt}: no navigation; taps ` +
            `${second && first ? Math.round(second.t - first.t) : '?'} ms apart`);
          await waitOut(second ? second.t : first.t);
        }
      }
      await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function' &&
        HB.state() === 'PLAYING', null, { timeout: 300000, polling: 250 }).catch(() => {});
      const after = await page.evaluate(() => ({ url: location.search, history: history.length,
        mark: !!(window.__t126 && window.__t126.mark), state: HB.state() }));
      check(`pause ${W}x${H}: two taps on an option reload the run with it (${flag}) and leave NO new history ` +
        `entry (history.length ${before.history} -> ${after.history})`,
        navigated && !after.mark && after.url.includes(flag) && after.history === before.history,
        `navigated ${navigated}, url ${after.url}, state ${after.state}`);
      await quiet(page, true);
    }
    check(`pause ${W}x${H}: the page raised no errors`, owned.errors.length === 0, owned.errors.join(' | '));
  } finally { await owned.close(); }
}

async function gestures(owned, L) {
  const { page, touch: T, cdp } = owned;
  const scale = () => page.evaluate(() => visualViewport.scale);
  const doubleTap = async (x, y) => {
    for (let i = 0; i < 2; i++) { await T.down(51, x, y); await T.up(51); await page.waitForTimeout(60); }
    await page.waitForTimeout(500);
  };
  const pinch = async () => {
    const cx = L.width / 2, cy = L.height / 2;
    await T.down(61, cx - 30, cy); await T.down(62, cx + 30, cy);
    for (let i = 1; i <= 8; i++) {
      await T.move(61, cx - 30 - i * 18, cy); await T.move(62, cx + 30 + i * 18, cy);
    }
    await T.upAll();
    await page.waitForTimeout(500);
  };
  await doubleTap(L.jump.cx, L.jump.cy);
  const afterDouble = await scale();
  check('a double-tap on JUMP leaves visualViewport.scale at 1 (cannot fail in Chromium: see notes)',
    Math.abs(afterDouble - 1) < 1e-3, `scale ${afterDouble}`);
  await pinch();
  const afterPinch = await scale();
  check('a pinch on the play surface leaves visualViewport.scale at 1', Math.abs(afterPinch - 1) < 1e-3,
    `scale ${afterPinch}`);
  // Falsify the probe: with every touch-action overridden to auto, the same
  // pinch must register as a zoom, or the two checks above prove nothing.
  await page.addStyleTag({ content: '*, html, body { touch-action: auto !important; }' });
  await pinch();
  const overridden = await scale();
  await doubleTap(L.jump.cx, L.jump.cy);
  const overriddenDouble = await scale();
  check('the pinch probe can see a zoom (touch-action overridden -> scale changes)',
    overridden > 1.05, `scale ${overridden}`);
  measure('gestureProbe', { afterDouble, afterPinch, overriddenPinch: overridden, overriddenDouble });
  try { await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }); } catch (_) { /* best effort */ }
}

async function installRecorder(page) {
  await page.evaluate(() => {
    // `downs`: the sim clock at the instant the deck receives each pointerdown
    // (capture phase, same dispatch that emits the key edge), so "ticks after
    // the press" counts from the press, not from a read before CDP latency.
    window.__T101 = { samples: [], downs: [], holds: 0 };
    document.getElementById('thumbDeck').addEventListener('pointerdown', () => {
      window.__T101.downs.push(HB.gameMs());
    }, true);
    // HOLD: freeze the simulation on the exact frame a closed-loop condition
    // came true, so the harness's touch lands before the world moves on. It
    // shadows document.hidden (no event dispatched): src/main.js frame()
    // skips update and draw, while rAF, pointer dispatch and the deck itself
    // run exactly as ever. The inline freeze watchdog reads the same
    // visibilityState and resets rather than tripping.
    window.__T101.hold = () => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      window.__T101.holds++;
      return true;
    };
    window.__T101.release = () => { delete document.hidden; delete document.visibilityState; };
    const rec = () => {
      requestAnimationFrame(rec);
      const p = HB.player, k = HB.keys;
      const list = window.__T101.samples;
      if (list.length && list[list.length - 1].t === HB.gameMs()) return;   // held frame
      list.push({
        t: HB.gameMs(), x: p.x, y: p.y, vx: p.vx, vy: p.vy, g: p.grounded, aj: p.airJumpsLeft,
        ow: !!p.onOneWay, du: p.dropUntil, hp: p.hp, lives: p.lives, state: HB.state(),
        k: (k.left ? 1 : 0) | (k.right ? 2 : 0) | (k.up ? 4 : 0) | (k.down ? 8 : 0) | (k.jump ? 16 : 0) | (k.fire ? 32 : 0),
      });
    };
    requestAnimationFrame(rec);
  });
}
const samplesSince = (page, t) => page.evaluate((from) => window.__T101.samples.filter((s) => s.t > from), t);
const gms = (page) => page.evaluate(() => HB.gameMs());
const lastDown = (page) => page.evaluate(() => window.__T101.downs[window.__T101.downs.length - 1]);

async function physics(owned, L, view) {
  const { page, touch: T } = owned;
  // TEST SETUP, not a player path: wave-1 contact (measured: hp 3 -> 1 in the
  // first unshielded run) knocks a closed-loop route off its line, which says
  // nothing about the controls. Pinning RIG's i-frames makes damagePlayer()
  // return early — no damage, knockback or hitstun — and touches nothing in
  // the input path. Restored before the in-use capture (i-frames flicker RIG).
  await page.evaluate(() => { HB.player.iframesUntil = 1e12; });
  await installRecorder(page);
  const S = { x: L.ghost.cx, y: L.ghost.cy };
  const J = { x: L.jump.cx, y: L.jump.cy };
  const F = { x: L.fire.cx, y: L.fire.cy };
  const runSpeed = await page.evaluate(() => HB.CONFIG.player.runSpeed);

  // The sim keeps running while this harness thinks, and RIG runs 9.4 tiles/s.
  // So every closed-loop decision HOLDS the sim on the exact frame its
  // condition came true (window.__T101.hold, installed with the recorder),
  // the touch lands, and the world resumes: positions and timings no longer
  // depend on host load. Measured before this: a stop meant for x 32.6 landed
  // anywhere in 33.0-34.7 at load 20-55, once inside the catwalk ladder's grab
  // range, where stick-down takes the ladder instead of dropping through.
  // Every number is computed afterwards from the per-tick recording.
  const mark = {};
  const resume = () => page.evaluate(() => window.__T101.release());

  // 1. stick right + JUMP (held): the jump keeps the run
  await T.down(1, S.x, S.y);
  await T.move(1, S.x + 44, S.y);
  mark.ok1 = await until(page, () =>
    HB.player.grounded && HB.player.vx > 9 && HB.player.x >= 8 && window.__T101.hold());
  await T.down(2, J.x, J.y);
  mark.p1 = await lastDown(page);
  await resume();
  mark.ok1 = mark.ok1 && await until(page, (t) => HB.gameMs() > t + 60 && HB.player.vy < 0, mark.p1);
  mark.ok1 = mark.ok1 && await until(page, () => HB.player.grounded);
  await T.up(2);

  // 2. stick up-right + FIRE (RIG keeps running: NE still holds Right).
  //    Waits key on the DECK's own sector; the sim's keys are what get judged
  //    (a wait on keys.up would stall a defective deck and desync the route).
  await T.move(1, S.x + 40, S.y - 40);
  await until(page, () => __HB_TOUCH().stick.sector === 'NE');
  const shots0 = await page.evaluate(() => HB.shotsFired());
  await T.down(3, F.x, F.y);
  await until(page, (n) => HB.shotsFired() > n && window.__T101.hold(), shots0);
  const fire = await page.evaluate(async () => {
    const pool = (await import('/src/sim/weapons.js')).bulletPool;
    return {
      bullets: pool.filter((b) => b.alive).map((b) => ({ vx: b.vx, vy: b.vy, deg: Math.atan2(b.vy, b.vx) * 180 / Math.PI })),
      keys: { up: HB.keys.up, right: HB.keys.right, fire: HB.keys.fire },
      // what aim assist (normal-run default, <= CONFIG.assist.maxDeg) could
      // have pulled toward: materialized hostiles, as offsets from the muzzle
      hostiles: HB.hostiles.filter((e) => HB.gameMs() >= e.enterUntil).map((e) => ({
        kind: e.kind, dx: +(e.x - HB.player.x).toFixed(2), dy: +(e.y - HB.player.y - HB.player.muzzleY).toFixed(2),
      })),
      assistMaxDeg: HB.CONFIG.assist.maxDeg,
    };
  });
  await T.up(3);
  await T.move(1, S.x + 44, S.y);
  await until(page, () => __HB_TOUCH().stick.sector === 'E');
  await resume();

  // 3. a TAPPED jump: press, three ticks, lift (a quick human tap is 3-6)
  await until(page, () => HB.player.grounded && window.__T101.hold());
  await T.down(2, J.x, J.y);
  mark.p3 = await lastDown(page);
  await resume();
  await until(page, (t) => HB.gameMs() >= t + 3 * 16.667 - 0.01 && window.__T101.hold(), mark.p3);
  await T.up(2);
  await resume();
  await until(page, (t) => HB.gameMs() > t + 60 && HB.player.grounded, mark.p3);

  // 4. a second JUMP press airborne is the air jump — and it carries RIG
  //    onto the first catwalk (x 26-35, y 6.35): from ground at x 18.5 the
  //    double jump comes down around x 28.
  mark.ok4 = await until(page, () => HB.player.grounded && HB.player.x >= 18.5 && window.__T101.hold());
  mark.x4 = await page.evaluate(() => HB.player.x);
  await T.down(2, J.x, J.y);
  await resume();
  await until(page, () => !HB.player.grounded && HB.player.vy <= 0.8 && window.__T101.hold());
  await T.up(2);
  await T.down(2, J.x, J.y);
  mark.p4 = await lastDown(page);
  await resume();
  await until(page, (t) => HB.gameMs() > t + 1 && HB.player.grounded, mark.p4);
  await T.up(2);
  const landing = await page.evaluate(() => ({
    x: +HB.player.x.toFixed(3), y: +HB.player.y.toFixed(3), hp: HB.player.hp,
    oneWay: HB.player.onOneWay ? { x0: HB.player.onOneWay.x0, x1: HB.player.onOneWay.x1, y: HB.player.onOneWay.y } : null,
  }));
  const onCatwalk = !!landing.oneWay && Math.abs(landing.y - 6.35) < 0.02;

  // 5. on to the solid stretch under the catwalk, stop, then down + JUMP.
  //    Held at x >= 32.6, the stop lands at ~33.0: over solid ground (x
  //    32-34, y 2) and clear of the rib ladder whose foot stands on this
  //    catwalk at x 34.5 (grab half-width 0.48 -> [34.02, 34.98]).
  let stand = null;
  if (onCatwalk) {
    await until(page, () => (HB.player.x >= 32.6 || !HB.player.onOneWay) && window.__T101.hold());
    await T.up(1);
    await resume();
    await until(page, () => Math.abs(HB.player.vx) < 0.05);
    stand = await page.evaluate(() => ({ x: HB.player.x, y: HB.player.y, ow: !!HB.player.onOneWay }));
    await T.down(1, S.x, S.y);
    await T.move(1, S.x, S.y + 44);
    await until(page, () => __HB_TOUCH().stick.sector === 'S' && window.__T101.hold());
    stand.keysAtDrop = await page.evaluate(() => ({ down: HB.keys.down, left: HB.keys.left, right: HB.keys.right }));
    await T.down(2, J.x, J.y);
    mark.p5 = await lastDown(page);
    await resume();
    await until(page, (t) => HB.gameMs() > t + 80, mark.p5);
    await T.up(2);
    await until(page, () => HB.player.grounded);
    await T.up(1);
  } else {
    await shot(page, { path: join(OUT, `${view.name}-catwalk-miss.png`) });
    await T.up(1);
  }
  measure('holds', await page.evaluate(() => window.__T101.holds));

  /* ---------------- analysis, from the per-tick recording ---------------- */
  let s;
  const all = await samplesSince(page, 0);
  const since = (t) => all.filter((q) => q.t > t);
  const atT = (t) => all.find((q) => q.t >= t - 1e-6);       // state the press met

  let q = since(mark.p1);
  const rise = q.find((r) => r.vy > 0);
  const riseTick = rise ? Math.round((rise.t - mark.p1) / TICK_MS) : null;
  const land1 = q.findIndex((r, i) => i > 0 && r.g);
  const flight1 = q.slice(0, land1 > 0 ? land1 : q.length);
  const y1 = atT(mark.p1) ? atT(mark.p1).y : NaN;
  const apexHeld = Math.max(...flight1.map((r) => r.y)) - y1;
  const heldTicks = flight1.filter((r) => r.k & 16).length;
  check(`stick right + JUMP: vy>0 and vx>0 within ${JUMP_TICKS_N} ticks`,
    mark.ok1 && rise && riseTick <= JUMP_TICKS_N && rise.vx > 0,
    rise ? `tick ${riseTick}: vy ${rise.vy.toFixed(2)}, vx ${rise.vx.toFixed(2)} (run ${runSpeed})` : 'no rise');
  measure('runJump', rise ? { tick: riseTick, vy: +rise.vy.toFixed(3), vx: +rise.vx.toFixed(3), x: +rise.x.toFixed(2) } : null);

  const upRight = fire.bullets.length > 0 && fire.bullets.every((b) => b.vx > 0 && b.vy > 0 && b.deg > 30 && b.deg < 60);
  check('stick up-right + FIRE spawns bullets travelling up-right',
    upRight && fire.keys.up && fire.keys.right && fire.keys.fire,
    `${fire.bullets.length} live: ${fire.bullets.map((b) => b.deg.toFixed(1) + '°').join(', ')}`);
  measure('fireUpRight', { bullets: fire.bullets.length, degrees: fire.bullets.map((b) => +b.deg.toFixed(2)),
    assistMaxDeg: fire.assistMaxDeg, hostilesAtFire: fire.hostiles });

  q = since(mark.p3);
  const land3 = q.findIndex((r, i) => i > 0 && r.g);
  const flight3 = q.slice(0, land3 > 0 ? land3 : q.length);
  const y3 = atT(mark.p3) ? atT(mark.p3).y : NaN;
  const apexTap = Math.max(...flight3.map((r) => r.y)) - y3;
  const tapTicks = flight3.filter((r) => r.k & 16).length;
  check('a held JUMP reaches a higher apex than a tapped one', apexHeld > apexTap + 0.5,
    `held ${apexHeld.toFixed(3)} tiles (${heldTicks} ticks held), tapped ${apexTap.toFixed(3)} tiles ` +
    `(${tapTicks} ticks held)`);
  measure('apex', { held: +apexHeld.toFixed(3), tapped: +apexTap.toFixed(3), heldTicks, tapTicks,
    heldStartY: y1, tapStartY: y3 });

  q = since(mark.p4);
  const before4 = atT(mark.p4);
  const aj0 = before4 ? before4.aj : null;
  const used = q.find((r) => r.aj < aj0);
  const usedTick = used ? Math.round((used.t - mark.p4) / TICK_MS) : null;
  check('a second JUMP press airborne consumes the air jump',
    mark.ok4 && before4 && !before4.g && aj0 === 1 && used && used.vy > 10 && usedTick <= JUMP_TICKS_N,
    used ? `airJumpsLeft ${aj0}->${used.aj}, vy ${used.vy.toFixed(2)} at tick ${usedTick} (airborne at x ${before4.x.toFixed(2)})`
      : `airJumpsLeft stayed ${aj0}`);
  measure('airJump', used ? { from: aj0, to: used.aj, vy: +used.vy.toFixed(3), tick: usedTick } : null);
  measure('airJumpFlight', { jumpFromX: +mark.x4.toFixed(3), landing,
    path: q.filter((_, i) => i % 3 === 0).map((r) => [+r.x.toFixed(2), +r.y.toFixed(2), r.g ? 1 : 0]) });

  let dropped = false, detail = 'never reached the catwalk: landed at ' + JSON.stringify(landing);
  if (onCatwalk && stand) {
    q = since(mark.p5);
    const through = q.find((r) => r.y < 6.3 && !r.g);
    const landed = q.filter((r) => r.g).pop();
    const throughTick = through ? Math.round((through.t - mark.p5) / TICK_MS) : null;
    dropped = stand.ow && stand.keysAtDrop.down && through && throughTick <= JUMP_TICKS_N + 1 &&
      landed && landed.y < 6.0 && q.some((r) => r.du > mark.p5);
    detail = `stood x ${stand.x.toFixed(2)} y ${stand.y.toFixed(2)} on the catwalk: ${stand.ow}; ` +
      (through ? `below the deck at tick ${throughTick}; ` : 'never went below; ') +
      `landed y ${landed ? landed.y.toFixed(2) : '?'}`;
    measure('drop', { standX: +stand.x.toFixed(3), throughTick, landedY: landed ? +landed.y.toFixed(3) : null });
  }
  check('stick down + JUMP on a catwalk drops through it', dropped, detail);

  // damage would have meant the run was disturbed under the proof
  s = await samplesSince(page, 0);
  measure('edges', await page.evaluate(() => ({ ...HB.edges(), x: HB.player.x, gameMs: HB.gameMs() })));
  measure('hpMin', Math.min(...s.map((q) => q.hp)));
  check('no damage, death or state change disturbed the movement proof (i-frames pinned)',
    s.every((q) => q.hp === 3 && q.state === 'PLAYING'), `hp min ${Math.min(...s.map((q) => q.hp))}`);

  // in-use screenshot: stick up-right, FIRE and JUMP held over the live run
  await page.evaluate(() => { HB.player.iframesUntil = 0; });
  await T.down(1, S.x, S.y);
  await T.move(1, S.x + 40, S.y - 40);
  await T.down(3, F.x, F.y);
  await T.down(2, J.x, J.y);
  await frames(page, 3);
  await shot(page, {path: join(OUT, `${view.name}-dpr1-live-inuse.png`) });
  await T.upAll();
}

async function legacy(newPage, view) {
  const owned = await boot(newPage, view, { frozen: true, query: '&touch=legacy' });
  const { page, touch: T } = owned;
  try {
    const snap = await page.evaluate(() => __HB_TOUCH());
    check('?touch=legacy publishes the old snapshot shape',
      same(Object.keys(snap), ['enabled', 'active', 'clutch', 'vector', 'fire', 'held', 'jumps']) &&
      same(Object.keys(snap.vector), ['x', 'y', 'magnitude']) && snap.enabled === true,
      JSON.stringify(snap));
    const vis = await page.evaluate(() => ({
      legacy: document.getElementById('touchDeck').hidden, twin: document.getElementById('thumbDeck').hidden,
      cue: document.getElementById('touchCue').textContent,
    }));
    check('?touch=legacy shows the old deck and not the new one', !vis.legacy && vis.twin, JSON.stringify(vis));
    await shot(page, { path: join(OUT, `${view.name}-dpr1-legacy.png`) });
    // The old grammar's tap is a 170 ms window timed on the main thread, and a
    // software-rendered frame on a loaded host is longer than that (measured:
    // 0 of 3 taps registered at load ~55). Skip the draw, as the frozen
    // section does, so the window measures the gesture and not the renderer.
    await quiet(page, true);
    // the old gesture grammar: drag = arrows, past the outer rail = fire, tap = jump pulse
    const W = view.viewport.width, H = view.viewport.height;
    const x0 = W * 0.3, y0 = H * 0.82;
    await T.down(71, x0, y0);
    await T.move(71, x0 + 40, y0);
    await frames(page, 2);
    const drag = await page.evaluate(() => __HB_TOUCH());
    await T.move(71, x0 + 120, y0);
    await frames(page, 2);
    const rail = await page.evaluate(() => __HB_TOUCH());
    await T.up(71);
    await page.waitForTimeout(500);
    // legacy's tap is a 170 ms window measured on the main thread; a slow
    // software-rendered frame can land inside it, so allow three attempts
    let tapped = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await T.down(72, x0, y0);
      await T.up(72);
      await page.waitForTimeout(450);
      tapped = await page.evaluate(() => __HB_TOUCH());
      if (tapped.jumps >= 1) break;
    }
    check('legacy: a drag holds the arrow, the outer rail adds fire, a tap pulses jump',
      drag.held.includes('ArrowRight') && !drag.fire && rail.fire && rail.held.includes('KeyX') && tapped.jumps >= 1,
      `drag ${drag.held} / rail ${rail.held} / jumps ${tapped.jumps}`);
    check('legacy page raised no errors', owned.errors.length === 0, owned.errors.join(' | '));
  } finally { await owned.close(); }
}

async function titleTap(newPage, view) {
  const owned = await boot(newPage, view, { query: '&shell=title', audio: true, waitPlaying: false });
  const { page, touch: T } = owned;
  try {
    await page.waitForFunction(() => HB.state() === 'MENU', null, { timeout: 120000, polling: 250 });
    const before = await page.evaluate(() => ({ audio: HB.audio(), deckOpacity: getComputedStyle(document.getElementById('thumbDeck')).opacity }));
    // tap where JUMP will be: the starting tap must not also jump
    const L = await page.evaluate(() => __HB_TOUCH().layout);
    await T.down(81, L.jump.cx, L.jump.cy);
    await T.up(81);
    await until(page, () => HB.state() === 'PLAYING');
    await frames(page, 3);
    const after = await page.evaluate(() => ({ state: HB.state(), jumps: __HB_TOUCH().jumps,
      held: __HB_TOUCH().held, jumpKey: HB.keys.jump, audio: HB.audio() }));
    check('a tap anywhere on the title starts the run', after.state === 'PLAYING', after.state);
    check('the starting tap is not also a gameplay input (no jump, nothing held)',
      after.jumps === 0 && after.held.length === 0 && !after.jumpKey, JSON.stringify({ jumps: after.jumps, held: after.held }));
    check('the deck is inert behind the title', before.deckOpacity === '0', before.deckOpacity);
    measure('titleAudio', { before: before.audio.contextState, after: after.audio.contextState, unlocked: after.audio.unlocked });
    check('title page raised no errors', owned.errors.length === 0, owned.errors.join(' | '));
  } finally { await owned.close(); }
}

// Deck captures: idle, then in use (stick up-right, FIRE and JUMP held).
async function capture(page, T, view, dpr) {
  const L = await page.evaluate(() => __HB_TOUCH().layout);
  await frames(page, 3);
  await shot(page, {path: join(OUT, `${view.name}-dpr${dpr}-idle.png`) });
  await T.down(91, L.ghost.cx, L.ghost.cy);
  await T.move(91, L.ghost.cx + 38, L.ghost.cy - 38);
  await T.down(92, L.fire.cx, L.fire.cy);
  await T.down(93, L.jump.cx, L.jump.cy);
  await frames(page, 3);
  await shot(page, {path: join(OUT, `${view.name}-dpr${dpr}-inuse.png`) });
  await T.upAll();
  await frames(page, 2);
}

async function shots(newPage, view, dpr) {
  const owned = await boot(newPage, view, { frozen: true, dpr });
  try {
    await capture(owned.page, owned.touch, view, dpr);
    check(`dpr${dpr} capture page raised no errors`, owned.errors.length === 0, owned.errors.join(' | '));
  } finally { await owned.close(); }
}

/* -------------------------------- main --------------------------------- */
async function withBrowser(run) {
  if (!BASE_URL) {
    return withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => run(async (opts) => {
      const owned = await newPage(opts);
      return { ...owned, baseUrl };
    }));
  }
  const { browser } = await launchBrowser({ channel: 'chrome' });
  try {
    return await run(async (opts) => {
      const context = await browser.newContext(opts);
      const page = await context.newPage();
      return { page, context, baseUrl: BASE_URL.replace(/\/$/, ''), close: () => context.close() };
    });
  } finally { await browser.close(); }
}

const started = Date.now();
await withBrowser(async (newPage) => {
  for (const view of VIEWS) {
    if (ONLY.has('frozen')) {
      current = `${view.name}/frozen`;
      const owned = await boot(newPage, view, { frozen: true });
      try {
        const L = await layoutAndStyle(owned.page);
        if (ONLY.has('shots')) await capture(owned.page, owned.touch, view, 1);
        await quiet(owned.page, true);
        await pointerBookkeeping(owned.page, owned.touch, L);
        await lifecycleReleases(owned, L);
        await followUps(owned, L);
        await modalTaps(owned, L);
        await gestures(owned, L);
        check('frozen page raised no errors', owned.errors.length === 0, owned.errors.join(' | '));
      } finally { await owned.close(); }
    }
    if (ONLY.has('live')) {
      current = `${view.name}/live`;
      const owned = await boot(newPage, view, {});
      try {
        const L = await owned.page.evaluate(() => __HB_TOUCH().layout);
        await physics(owned, L, view);
        check('live page raised no errors', owned.errors.length === 0, owned.errors.join(' | '));
      } finally { await owned.close(); }
    }
    if (ONLY.has('shots')) {
      current = `${view.name}/shots`;
      if (!ONLY.has('frozen')) await shots(newPage, view, 1);
      await shots(newPage, view, 2);
    }
  }
  const first = VIEWS[0];
  if (first && ONLY.has('legacy')) { current = `${first.name}/legacy`; await legacy(newPage, first); }
  if (first && ONLY.has('title')) { current = `${first.name}/title`; await titleTap(newPage, first); }
  if (ONLY.has('pause')) {
    for (const view of PAUSE_VIEWS) {
      current = `${view.name}/pause`;
      try { await pauseSafety(newPage, view); } catch (error) {
        check('pause section completed', false, String(error && error.stack || error).split('\n').slice(0, 3).join(' '));
      }
    }
  }
});

const failed = results.filter((r) => !r.pass);
const report = {
  tool: 'tools/playtest/touch-proof.mjs', mutate: MUTATE, baseUrl: BASE_URL || '(ephemeral)',
  ms: Date.now() - started, passed: results.length - failed.length, failed: failed.length,
  results, measures,
};
writeFileSync(join(OUT, MUTATE ? `report-mutate-${MUTATE}.json` : 'report.json'), JSON.stringify(report, null, 2));
console.log(`touch-proof${MUTATE ? ` (mutation ${MUTATE})` : ''}: ${report.passed} passed, ${report.failed} failed in ${Math.round(report.ms / 1000)} s`);
process.exit(failed.length ? 1 : 0);
