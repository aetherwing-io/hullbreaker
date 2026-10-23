#!/usr/bin/env node
// phone-shell.mjs — T-105's real-browser check of everything a phone player
// sees that is not the touch deck itself: the title, the play HUD, pause /
// options, the loot banner, a death, game over, the finale and the summit,
// the failsafe panel, safe areas, preloads, the boot watchdog, a rotation
// mid-run, the first-touch audio unlock and home-screen play.
//
//   cd tools/playtest
//   node phone-shell.mjs --base-url http://127.0.0.1:8784 --out <dir>
//   node phone-shell.mjs --base-url http://127.0.0.1:8785 --out <dir> --label base
//   node phone-shell.mjs --compare <baseOut> <branchOut>      # desktop A/B diff
//   node phone-shell.mjs ... --only screens,safe --views l844,p390
//   node phone-shell.mjs ... --mutate <name>                  # falsification
//
// Sections (--only, default all):
//   screens   per view, the nine screens in one page: capture (PNG) + DOM
//             audit: (a) every visible text box fits its clipping container
//             and the viewport minus the safe area; (b) the visible text and
//             pseudo-element text scanned for keyboard-only copy (key names,
//             "press" / "click") — zero hits under touch, and the scan must
//             still FIND the keyboard copy on desktop; (c) at landscape
//             phone sizes, the HUD's panels: area share and intersection
//             with the central 60% x 60% play region.
//   safe      the landscape views again with notch insets forced through
//             CDP Emulation.setSafeAreaInsetsOverride (left/right 47 px,
//             bottom 21 px): every control and HUD box inside the insets.
//   gateline  the objective slot at 667x375 and 1100x700 holds lines of up
//             to 28 characters (worst case 28 x 'W', plus real lines).
//   preload   the default URL: console "preload ... not used" warnings and
//             the number of network requests per preloaded URL.
//   watchdog  frame delivery withheld for 6 s (main-thread timers still
//             running — the only stall the freeze watchdog can observe)
//             before the first rendered frames, and again after warm-up in
//             PLAYING; plus the same two as a 6 s main-thread busy-wait.
//   rotate    portrait <-> landscape mid-run with three fingers down: canvas
//             and camera resized, HUD re-laid out (fit + safe), no stuck
//             input, no failsafe panel, no page errors.
//   audio     the AudioContext resume() runs INSIDE a touch-END dispatch
//             (iOS Safari honours only pointerup/touchend for a touch), and a
//             context iOS reports as 'interrupted' resumes on the next tap.
//   manifest  index.html's home-screen metadata and the parsed web app
//             manifest (CDP Page.getAppManifest), icons decoded at size.
//
// Test setup, labelled where it is used: the screens run on the shipped
// default run with an empty frame-input schedule stopped at tick 0 (the run is
// PLAYING but never steps), and states the player reaches only after minutes
// of play are entered through the game's own modules (setState('GAME_OVER'),
// loseLife(), startFinale(), the loot bridge, the failsafe API). Input that a
// player performs (start, pause, resume, restart) is performed: a CDP touch on
// phone views, a key on desktop.
//
// Honesty notes:
//   - Chromium only (SwiftShader here). The iOS UA string changes nothing in
//     the game (nothing reads it); it is there so a capture states what it
//     emulates. Notch insets are CDP's env() emulation, not WebKit's.
//   - The watchdog stall is injected by holding requestAnimationFrame
//     callbacks; it models a GPU-side stall (frames withheld while the main
//     thread is free). A busy-wait blocks the watchdog's own timer, which the
//     bootstrap's `slept` rule reads as a suspended page in BOTH directions;
//     that variant is reported, not used to judge the change.
//   - CDP touch input carries user activation at pointerdown, so the audio
//     trial cannot prove iOS's gesture rule; it proves WHERE resume() runs.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { launchBrowser } from '../assets/lib/browser.mjs';
import { keyboardCopyHits } from '../../src/pure/shell-copy.js';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

/* ------------------------------ compare mode ----------------------------- */
if (argv[0] === '--compare') {
  process.exit(compareRuns(resolve(argv[1]), resolve(argv[2])));
}

const BASE_URL = (arg('--base-url') || '').replace(/\/$/, '');
if (!BASE_URL) {
  console.error('phone-shell: --base-url <http://127.0.0.1:PORT> is required (serve the tree with tools/serve.mjs)');
  process.exit(2);
}
const OUT = resolve(arg('--out', join(tmpdir(), 'hullbreaker-phone-shell')));
const LABEL = arg('--label', 'branch');
const DPR = Number(arg('--dpr', '2'));
const MUTATE = arg('--mutate');
const ONLY = new Set((arg('--only', 'screens,safe,gateline,preload,watchdog,rotate,audio,manifest')).split(',').filter(Boolean));
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ALL_VIEWS = {
  l844: { id: 'l844', name: 'landscape-844x390', w: 844, h: 390, phone: true },
  l932: { id: 'l932', name: 'landscape-932x430', w: 932, h: 430, phone: true },
  l667: { id: 'l667', name: 'landscape-667x375', w: 667, h: 375, phone: true },
  p390: { id: 'p390', name: 'portrait-390x844', w: 390, h: 844, phone: true },
  d1280: { id: 'd1280', name: 'desktop-1280x720', w: 1280, h: 720, phone: false },
  d1100: { id: 'd1100', name: 'desktop-1100x700', w: 1100, h: 700, phone: false },
};
const VIEW_IDS = (arg('--views', 'l844,l932,l667,p390,d1280')).split(',').filter(Boolean);
const NOTCH = { top: 0, left: 47, right: 47, bottom: 21 };
const TICK_MS = 16.667;
const WAIT_MS = 300000;

mkdirSync(OUT, { recursive: true });

/* ------------------------------- mutations ------------------------------- */
// Falsification: serve ONE file with ONE textual defect. A missing anchor
// throws (a stale mutation proves nothing).
const MUTATIONS = {
  // audio unlock only on press, never on the touch's END (iOS's gesture)
  'audio-no-end-unlock': ['src/ui/audio.js', [
    "  addEventListener('pointerup', unlock);\n  addEventListener('touchend', unlock);\n",
    '\n',
  ]],
  // the canvas is never resized after boot
  'no-canvas-resize': ['src/main.js', [
    "addEventListener('resize', handleResize);\n",
    '\n',
  ]],
  // a rotation no longer releases held touches
  'no-rotation-release': ['src/ui/touch-controls.js', [
    "    addEventListener('orientationchange', () => releaseAll());\n",
    '\n',
  ], [
    "      releaseAll();                 // the glass under every finger just moved\n",
    '\n',
  ], [
    "      screen.orientation.addEventListener('change', () => releaseAll());\n",
    "      void 0;\n",
  ]],
  // the freeze watchdog judges the boot's first frames like any other
  'watchdog-no-warmup': ['index.html', [
    'var WARM = { beats: 3, stallMs: 10000 };',
    'var WARM = { beats: 0, stallMs: 10000 };',
  ]],
};
if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error(`unknown --mutate ${MUTATE}; known: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}
async function applyMutation(page) {
  if (!MUTATE) return;
  const [file, ...edits] = MUTATIONS[MUTATE];
  await page.route(`**/${file}*`, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    for (const [from, to] of edits) {
      if (!body.includes(from)) throw new Error(`mutation ${MUTATE}: anchor not found in ${file}`);
      body = body.replace(from, to);
    }
    await route.fulfill({ response, body, headers: { ...response.headers(), 'cache-control': 'no-store' } });
  });
}

/* ------------------------------- reporting ------------------------------- */
const results = [];
const measures = {};
let current = '';
function check(name, pass, detail = '') {
  results.push({ at: current, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${current}] ${name}${detail ? ' — ' + detail : ''}`);
  return !!pass;
}
function measure(key, value) {
  (measures[current] ||= {})[key] = value;
  const s = JSON.stringify(value);
  console.log(`  measure [${current}] ${key} = ${s.length > 400 ? s.slice(0, 400) + '…' : s}`);
}

/* ------------------------------- touch rig ------------------------------- */
class Touch {
  constructor(cdp) { this.cdp = cdp; this.active = new Map(); }
  points() {
    return [...this.active.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 7, radiusY: 7, force: 1 }));
  }
  async send(type, touchPoints) { await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints }); }
  async down(id, x, y) { this.active.set(id, { x, y }); await this.send('touchStart', this.points()); }
  async move(id, x, y) { this.active.set(id, { x, y }); await this.send('touchMove', this.points()); }
  async up(id) {
    const p = this.active.get(id);
    if (!p) return;
    this.active.delete(id);
    await this.send('touchEnd', [{ x: p.x, y: p.y, id, radiusX: 7, radiusY: 7, force: 1 }]);
  }
  async upAll() { this.active.clear(); await this.send('touchEnd', []); }
  async tap(id, x, y) { await this.down(id, x, y); await this.up(id); }
}

/* ------------------------------- page helpers ---------------------------- */
async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((done) => {
    let left = count;
    const step = () => (--left <= 0 ? done() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
}
async function until(page, fn, argument = null, timeout = WAIT_MS) {
  try { await page.waitForFunction(fn, argument, { timeout, polling: 100 }); return true; } catch (_) { return false; }
}
async function shot(page, path) {
  try { await page.screenshot({ path, timeout: WAIT_MS }); return true; } catch (error) {
    check(`capture ${path.split('/').pop()}`, false, String(error.message || error).split('\n')[0]);
    return false;
  }
}
// Skip the game's draw while the harness thinks (shadow document.hidden with
// no event: src/main.js frame() returns early, the inline watchdog resets its
// baselines instead of tripping). Lifted for every capture and audit.
async function quiet(page, on) {
  await page.evaluate((hide) => {
    if (hide) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    } else { delete document.hidden; delete document.visibilityState; }
  }, on);
}

function contextOptions(view, dpr = DPR) {
  return view.phone
    ? { viewport: { width: view.w, height: view.h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent: IOS_UA }
    : { viewport: { width: view.w, height: view.h }, deviceScaleFactor: 1 };
}

async function open(browser, view, { query = '', frozen = true, insets = null, dpr = DPR, init = null } = {}) {
  const context = await browser.newContext(contextOptions(view, dpr));
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  if (frozen) {
    await page.addInitScript(() => {
      globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__ = { version: 1, events: [], stopAtMs: 0 };
    });
  }
  if (init) await page.addInitScript(init);
  await applyMutation(page);
  const cdp = await context.newCDPSession(page);
  let insetMode = 'none';
  if (insets) {
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      insetMode = 'cdp';
    } catch (_) { insetMode = 'css-hook'; }
  }
  const url = `${BASE_URL}/index.html${query}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  if (insetMode === 'css-hook') {
    await page.evaluate((s) => {
      for (const [edge, px] of Object.entries(s)) document.documentElement.style.setProperty(`--hud-safe-${edge}`, `${px}px`);
    }, insets);
  }
  await page.waitForFunction(() => globalThis.HB && globalThis.__HB_FAILSAFE && globalThis.__HB_FAILSAFE.isBooted(),
    null, { timeout: WAIT_MS, polling: 250 });
  console.log(`  boot ${view.name}${query} dpr${view.phone ? dpr : 1}${insets ? ' insets:' + insetMode : ''}: ${Date.now() - t0} ms`);
  return { context, page, cdp, errors, warnings, touch: new Touch(cdp), insetMode,
    close: () => context.close() };
}

/* -------------------------------- DOM audit ------------------------------ */
// Runs in the page. Returns every visible text box with its fit verdict, the
// visible text (for the copy scan), named boxes, and the safe-area insets.
function auditInPage() {
  const W = innerWidth, H = innerHeight;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:var(--hud-safe-top,0px) var(--hud-safe-right,0px) var(--hud-safe-bottom,0px) var(--hud-safe-left,0px)';
  document.body.appendChild(probe);
  const pcs = getComputedStyle(probe);
  const safe = { top: parseFloat(pcs.paddingTop) || 0, right: parseFloat(pcs.paddingRight) || 0,
    bottom: parseFloat(pcs.paddingBottom) || 0, left: parseFloat(pcs.paddingLeft) || 0 };
  probe.remove();
  const failOn = !!document.querySelector('#fail.on');
  const shellOn = !!document.querySelector('#shell.on');
  const scopes = failOn ? [document.getElementById('fail')]
    : shellOn ? [document.getElementById('shell'), document.getElementById('lootReveal'), document.getElementById('gildedToast')].filter(Boolean)
      : [document.body];
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none') return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  const visibleEl = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible') return false;
    if (effOpacity(el) <= 0.05) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) {
      // an inline element can be 0-tall in odd cases; fall back to the text
      if (!el.textContent.trim()) return false;
    }
    if (r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) return false;
    // screen-reader-only text is clipped to 1 px on purpose
    if (cs.clip && cs.clip !== 'auto' && /rect\(0px?,?\s*0px?/.test(cs.clip)) return false;
    return true;
  };
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      parts.unshift(n.id ? '#' + n.id : n.tagName.toLowerCase() + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : ''));
      if (n.id) break;
    }
    return parts.join(' > ');
  };
  const clipBox = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && n !== document.body && n !== document.documentElement) {
        const r = n.getBoundingClientRect();
        const left = r.left + n.clientLeft, top = r.top + n.clientTop;
        return { el: pathOf(n), left, top, right: left + n.clientWidth, bottom: top + n.clientHeight,
          scroller: /auto|scroll/.test(cs.overflowX + cs.overflowY) };
      }
    }
    return null;
  };
  const texts = [];
  const seen = new Set();
  let copy = '';
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const t = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = node.parentElement;
      if (!el || !visibleEl(el)) continue;
      if (el.closest('script,style,noscript,template')) continue;
      // collapsed <details>: only the summary is visible
      const det = el.closest('details');
      if (det && !det.open && !el.closest('summary')) continue;
      copy += ' ' + t;
      if (seen.has(el)) continue;
      seen.add(el);
      const range = document.createRange();
      // the element's own direct text, union of its line boxes
      let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
      for (const child of el.childNodes) {
        if (child.nodeType !== 3 || !child.nodeValue.trim()) continue;
        range.selectNodeContents(child);
        for (const q of range.getClientRects()) {
          if (q.width < 0.5 && q.height < 0.5) continue;
          L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom);
        }
      }
      if (!Number.isFinite(L)) continue;
      const cs = getComputedStyle(el);
      const box = clipBox(el);
      const tol = 1.01;
      const issues = [];
      if (box) {
        if (L < box.left - tol || R > box.right + tol || T < box.top - tol - 2 || B > box.bottom + tol + 2) {
          issues.push(`${box.scroller ? 'needs scrolling in' : 'clipped by'} ${box.el} (text ${L.toFixed(1)}..${R.toFixed(1)} x ${T.toFixed(1)}..${B.toFixed(1)}, box ${box.left.toFixed(1)}..${box.right.toFixed(1)} x ${box.top.toFixed(1)}..${box.bottom.toFixed(1)})`);
        }
      }
      if (L < safe.left - tol || R > W - safe.right + tol || T < safe.top - tol || B > H - safe.bottom + tol) {
        issues.push(`leaves the viewport minus safe area (text ${L.toFixed(1)}..${R.toFixed(1)} x ${T.toFixed(1)}..${B.toFixed(1)} vs ${safe.left}..${W - safe.right} x ${safe.top}..${H - safe.bottom})`);
      }
      if ((cs.overflowX !== 'visible') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        issues.push(`truncated inside itself (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}, text-overflow ${cs.textOverflow})`);
      }
      texts.push({ el: pathOf(el), text: t.slice(0, 80), rect: [L, T, R, B].map((v) => +v.toFixed(1)),
        font: cs.fontSize, issues, node: el });
    }
  }
  // Two visible text boxes painted over each other are unreadable even when
  // each one fits its own container (the deck's modal cue over the death
  // copy). Shrunk 1 px on every side so touching lines do not count.
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
      const [al, at, ar, ab] = a.rect, [bl, bt, br, bb] = b.rect;
      if (al + 1 < br - 1 && bl + 1 < ar - 1 && at + 1 < bb - 1 && bt + 1 < ab - 1) {
        a.issues.push(`overlaps "${b.text.slice(0, 24)}" (${b.el})`);
      }
    }
  }
  for (const t of texts) delete t.node;
  // pseudo-element text: copy scan + an overflow check on its host
  const pseudo = [];
  for (const scope of scopes) {
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visibleEl(el)) continue;
      for (const which of ['::before', '::after']) {
        const ps = getComputedStyle(el, which);
        const c = ps.content;
        if (!c || c === 'none' || c === 'normal' || !/^["']/.test(c)) continue;
        const text = c.slice(1, -1).replace(/\\201C|\\201D/g, '"').replace(/\\[0-9a-f]{1,6}\s?/gi, ' ').trim();
        if (!text) continue;
        if (ps.display === 'none' || ps.visibility !== 'visible' || Number(ps.opacity) <= 0.05) continue;
        copy += ' ' + text;
        const issues = [];
        const pos = ps.position;
        if (pos !== 'absolute' && pos !== 'fixed' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 &&
            getComputedStyle(el).overflowX !== 'visible') {
          issues.push(`host truncates its ${which} text (scrollWidth ${el.scrollWidth} > ${el.clientWidth})`);
        }
        // in-flow pseudo text lives inside its host's box: a host that
        // leaves the viewport takes that text with it (the h1 eyebrow)
        if (pos !== 'absolute' && pos !== 'fixed') {
          const r = el.getBoundingClientRect();
          if (r.top < safe.top - 1.01 || r.bottom > H - safe.bottom + 1.01 ||
              r.left < safe.left - 1.01 || r.right > W - safe.right + 1.01) {
            issues.push(`host of ${which} text leaves the viewport minus safe area (${r.left.toFixed(1)}..${r.right.toFixed(1)} x ${r.top.toFixed(1)}..${r.bottom.toFixed(1)})`);
          }
        }
        pseudo.push({ el: pathOf(el) + which, text, issues });
      }
    }
  }
  const rectOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el || !visibleEl(el)) return null;
    const r = el.getBoundingClientRect();
    return { left: +r.left.toFixed(1), top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  const named = {};
  for (const sel of ['#hudRigPanel', '#hudObjectivePanel', '#hudBL', '#finale', '#lootReveal', '#gildedToast',
    '#thumbJump', '#thumbFire', '#thumbSwap', '#thumbPause', '#thumbAuto', '#thumbGhost', '#thumbCue', '#thumbModal',
    '#shellText', '#shellFoot', '#shellText h1', '#ovTitle', '#ovBody', '#ovPanel', '#ovPanel .panel', '#fail .failbox', '#failBtn',
    '#touchDeck', '#hudObjective', '#ovPanel .shell-actions']) {
    named[sel] = rectOf(sel);
  }
  // every interactive control currently visible (buttons/links in the overlay or panel)
  const controls = [...document.querySelectorAll('#overlay button, #overlay a, #fail button')]
    .filter(visibleEl).map((el) => ({ el: pathOf(el), text: el.textContent.trim().slice(0, 30), ...rectOf2(el) }));
  function rectOf2(el) { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
  return {
    W, H, safe, scope: failOn ? 'fail' : shellOn ? 'shell' : 'page',
    state: globalThis.HB ? HB.state() : null,
    texts, pseudo, copy: copy.replace(/\s+/g, ' ').trim(), named, controls,
    touchTwin: document.documentElement.classList.contains('touch-twin'),
  };
}

function judgeAudit(view, screen, a) {
  const bad = a.texts.filter((t) => t.issues.length).concat(a.pseudo.filter((p) => p.issues.length));
  check(`${screen}: every visible text box fits its container and the viewport minus safe areas (${a.texts.length} boxes)`,
    bad.length === 0, bad.slice(0, 4).map((b) => `${b.el} "${b.text.slice(0, 40)}": ${b.issues.join('; ')}`).join(' | '));
  const hits = keyboardCopyHits(a.copy);
  if (view.phone) {
    check(`${screen}: no keyboard-only copy on a touch device`, hits.length === 0,
      hits.length ? hits.slice(0, 8).map((h) => JSON.stringify(h.match)).join(', ') : '');
  }
  return { hits, bad };
}

const CENTRAL = (W, H) => ({ left: W * 0.2, right: W * 0.8, top: H * 0.2, bottom: H * 0.8 });
const intersects = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
function hudBudget(a, include) {
  const c = CENTRAL(a.W, a.H);
  const rows = [];
  let area = 0;
  for (const sel of include) {
    const r = a.named[sel];
    if (!r) continue;
    const L = Math.max(0, r.left), T = Math.max(0, r.top), R = Math.min(a.W, r.right), B = Math.min(a.H, r.bottom);
    const ar = Math.max(0, R - L) * Math.max(0, B - T);
    area += ar;
    rows.push({ sel, rect: r, areaPct: +(100 * ar / (a.W * a.H)).toFixed(2), central: intersects(r, c) });
  }
  return { areaPct: +(100 * area / (a.W * a.H)).toFixed(2), central: rows.some((r) => r.central), rows,
    centralRegion: c };
}

function insideSafe(r, a, tol = 0.6) {
  return r.left >= a.safe.left - tol && r.right <= a.W - a.safe.right + tol &&
    r.top >= a.safe.top - tol && r.bottom <= a.H - a.safe.bottom + tol;
}

/* --------------------------------- screens ------------------------------- */
const SCREENS_QUERY = `?testapi=1&fixeddt=${TICK_MS}&shell=title&audio=0`;

async function audit(owned, view, screen, { insets = false } = {}) {
  const { page } = owned;
  await quiet(page, false);
  await frames(page, 2);
  const a = await page.evaluate(auditInPage);
  const tag = `${LABEL}-${view.id}${insets ? '-notch' : ''}-${screen}`;
  await shot(page, join(OUT, `${tag}.png`));
  writeFileSync(join(OUT, `${tag}.json`), JSON.stringify(a, null, 1));
  await quiet(page, true);
  return a;
}

async function deckLayout(page) {
  return page.evaluate(() => (typeof __HB_TOUCH === 'function' && __HB_TOUCH().layout) || null);
}

// One player-shaped walk through every screen. Returns the audits by screen.
async function walkScreens(browser, view, { insets = null } = {}) {
  const owned = await open(browser, view, { query: SCREENS_QUERY, insets });
  const { page, touch: T } = owned;
  const out = {};
  const run = async (screen, fn) => {
    try {
      if (fn) await fn();
      out[screen] = await audit(owned, view, screen, { insets: !!insets });
    } catch (error) {
      check(`${screen}: screen reached`, false, String(error.message || error).split('\n')[0]);
    }
  };
  try {
    await until(page, () => HB.state() === 'MENU' && document.querySelector('#shell.on'));
    await run('title');
    // start: a tap on the title (phone) / any key (desktop) — the player's path
    await run('play', async () => {
      if (view.phone) await T.tap(1, view.w * 0.5, view.h * 0.5);
      else await page.keyboard.press('Enter');
      await until(page, () => HB.state() === 'PLAYING');
      await frames(page, 3);
    });
    // a rolled weapon picked up: the loot card, held at its readable phase.
    // TEST SETUP: setGun + the loot bridge, the two calls the capsule pickup makes.
    await run('loot', async () => {
      await page.evaluate(async () => {
        const [w, g, b, cfg] = await Promise.all([import('/src/sim/weapons.js'), import('/src/pure/gunroll.js'),
          import('/src/sim/bridge.js'), import('/src/config.js')]);
        const gun = g.rollGun('S', 1, 7);
        const def = w.setGun(gun);
        b.view.loot.acquired(gun, def || g.compileGunDef(gun, cfg.CONFIG.weapons.S), { recatch: false });
        const card = document.getElementById('lootReveal');
        for (const an of card.getAnimations()) { an.pause(); an.currentTime = 0.32 * an.effect.getTiming().duration; }
      });
    });
    await page.evaluate(() => { for (const an of document.getElementById('lootReveal').getAnimations()) an.finish(); });
    // a death with lives left (TEST SETUP: the sim's own loseLife)
    await run('death', async () => {
      await page.evaluate(async () => { (await import('/src/sim/player.js')).loseLife('test'); });
      await frames(page, 2);
    });
    // pause: the PAUSE chip (phone) / P (desktop)
    await run('pause', async () => {
      if (view.phone) {
        const L = await deckLayout(page);
        if (L) await T.tap(2, L.pause.x + L.pause.w / 2, L.pause.y + L.pause.h / 2);
        else await page.evaluate(async () => { (await import('/src/sim/state.js')).setState('PAUSED'); });
      } else await page.keyboard.press('KeyP');
      await until(page, () => HB.state() === 'PAUSED');
      await frames(page, 2);
    });
    // resume the way the screen says
    if (view.phone) {
      await T.tap(3, view.w * 0.06, view.h * 0.93);
    } else await page.keyboard.press('KeyP');
    await until(page, () => HB.state() === 'PLAYING', null, 20000);
    measure(`${insets ? 'notch-' : ''}resumedFromPause`, await page.evaluate(() => HB.state()));
    // game over (TEST SETUP: setState, as the T-101 proof does)
    await run('gameover', async () => {
      await page.evaluate(async () => { (await import('/src/sim/state.js')).setState('GAME_OVER'); });
      await page.waitForTimeout(1100);
    });
    // restart the way the screen says: an armed tap / R
    if (view.phone) await T.tap(4, view.w * 0.06, view.h * 0.93);
    else await page.keyboard.press('KeyR');
    await until(page, () => HB.state() === 'PLAYING', null, 20000);
    measure(`${insets ? 'notch-' : ''}restartedFromGameOver`, await page.evaluate(() => HB.state()));
    // the Crown finale objective (TEST SETUP: the sim's startFinale + one step)
    await run('finale', async () => {
      await page.evaluate(async () => {
        const f = await import('/src/sim/finale.js');
        f.startFinale();
        f.updateFinale();
      });
      await frames(page, 2);
    });
    // the summit (TEST SETUP: setState('VICTORY')), after its reply beat settles
    await run('victory', async () => {
      await page.evaluate(async () => { (await import('/src/sim/state.js')).setState('VICTORY'); });
      await page.waitForTimeout(3400);
    });
    // the failsafe panel, forced through its own API
    await run('failsafe', async () => {
      await page.evaluate(() => __HB_FAILSAFE.show('frozen', 'phone-shell: panel forced for the capture'));
    });
    await page.evaluate(() => __HB_FAILSAFE.hide());
    check('the walk raised no page errors', owned.errors.length === 0, owned.errors.slice(0, 3).join(' | '));
  } finally { await owned.close(); }
  return out;
}

async function sectionScreens(browser) {
  for (const id of VIEW_IDS) {
    const view = ALL_VIEWS[id];
    if (!view) continue;
    current = `${view.name}/screens`;
    const audits = await walkScreens(browser, view);
    const summary = {};
    for (const [screen, a] of Object.entries(audits)) {
      const { hits } = judgeAudit(view, screen, a);
      summary[screen] = { textBoxes: a.texts.length, keyboardHits: hits.map((h) => h.match) };
    }
    if (!view.phone) {
      // the keyboard copy must still be there for a keyboard player
      for (const screen of ['title', 'pause', 'gameover']) {
        if (!audits[screen]) continue;
        const hits = keyboardCopyHits(audits[screen].copy);
        check(`${screen}: desktop still shows the keyboard instructions`, hits.length > 0,
          hits.slice(0, 6).map((h) => JSON.stringify(h.match)).join(', '));
      }
    }
    if (view.phone && view.w > view.h && audits.play) {
      const b = hudBudget(audits.play, ['#hudRigPanel', '#hudObjectivePanel', '#hudBL']);
      measure('hudBudget.play', b);
      if (view.id === 'l844') {
        check(`play HUD panels cover <= 10% of ${view.w}x${view.h} (${b.areaPct}%)`, b.areaPct <= 10,
          b.rows.map((r) => `${r.sel} ${r.areaPct}%`).join(', '));
        check('no play HUD panel intersects the central 60% x 60% play region', !b.central,
          b.rows.filter((r) => r.central).map((r) => `${r.sel} ${JSON.stringify(r.rect)}`).join(', '));
      }
      for (const [screen, sels] of [['finale', ['#hudRigPanel', '#hudObjectivePanel', '#finale']],
        ['loot', ['#hudRigPanel', '#hudObjectivePanel', '#lootReveal']], ['death', ['#hudRigPanel', '#hudObjectivePanel']]]) {
        if (!audits[screen]) continue;
        const bb = hudBudget(audits[screen], sels);
        measure(`hudBudget.${screen}`, bb);
      }
    }
    measure('screens', summary);
  }
}

async function sectionSafe(browser) {
  for (const id of VIEW_IDS) {
    const view = ALL_VIEWS[id];
    if (!view || !view.phone || view.w < view.h) continue;
    current = `${view.name}/notch`;
    const audits = await walkScreens(browser, view, { insets: NOTCH });
    for (const [screen, a] of Object.entries(audits)) {
      judgeAudit(view, `${screen} (notch)`, a);
      const boxes = Object.entries(a.named).filter(([, r]) => r)
        .filter(([sel]) => !['#touchDeck'].includes(sel));
      const outside = boxes.filter(([, r]) => !insideSafe(r, a));
      const ctl = a.controls.filter((r) => !insideSafe(r, a));
      check(`${screen} (notch): every control and HUD box sits inside the insets (${boxes.length} boxes, ${a.controls.length} controls)`,
        a.safe.left === NOTCH.left && a.safe.right === NOTCH.right && a.safe.bottom === NOTCH.bottom &&
        outside.length === 0 && ctl.length === 0,
        `safe ${JSON.stringify(a.safe)}; ` + outside.slice(0, 4).map(([s, r]) => `${s} ${JSON.stringify(r)}`).join(' | ') +
        (ctl.length ? ' controls: ' + ctl.slice(0, 3).map((c) => c.el).join(', ') : ''));
    }
  }
}

/* --------------------------------- gate line ----------------------------- */
const GATE_LINES = [
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWW',               // 28, widest glyph
  'WAVE 6/6 · SCUTTLE · INBOUND',               // 28, a real shape
  '1 HOSTILE · +2 INBOUND',                     // 22, T-102's example
  'BROKEN · RUN TO THE TURN →',                 // 26
];
async function sectionGateline(browser) {
  for (const id of ['l667', 'd1100', 'l844', 'p390']) {
    const view = ALL_VIEWS[id];
    current = `${view.name}/gateline`;
    const owned = await open(browser, view, { query: `?testapi=1&fixeddt=${TICK_MS}&audio=0` });
    const { page } = owned;
    try {
      await until(page, () => HB.state() === 'PLAYING');
      await frames(page, 3);
      const rows = await page.evaluate((lines) => {
        const panel = document.getElementById('hudObjectivePanel');
        const line = document.getElementById('hudObjective');
        const out = [];
        for (const text of lines) {
          // TEST SETUP: write the slot the HUD writes (a frozen sim never rewrites it)
          line.textContent = text;
          panel.classList.remove('empty');
          const r = document.createRange();
          r.selectNodeContents(line);
          const tr = r.getBoundingClientRect();
          const pr = panel.getBoundingClientRect();
          const lr = line.getBoundingClientRect();
          out.push({ text, chars: [...text].length, textW: +tr.width.toFixed(1), slotW: line.clientWidth,
            scrollW: line.scrollWidth, panel: [pr.left, pr.top, pr.right, pr.bottom].map((v) => +v.toFixed(1)),
            fits: line.scrollWidth <= line.clientWidth + 1 && tr.right <= lr.right + 1 && tr.left >= lr.left - 1 &&
              pr.right <= innerWidth && pr.left >= 0 });
        }
        return out;
      }, GATE_LINES);
      for (const r of rows) {
        check(`objective slot holds "${r.text}" (${r.chars} chars)`, r.fits,
          `text ${r.textW} px in a ${r.slotW} px slot (scroll ${r.scrollW}); panel ${JSON.stringify(r.panel)}`);
      }
      measure('gateLine', rows);
      await shot(page, join(OUT, `${LABEL}-${view.id}-gateline.png`));
    } finally { await owned.close(); }
  }
}

/* --------------------------------- preloads ------------------------------ */
async function sectionPreload(browser) {
  for (const id of ['l844', 'd1280']) {
    const view = ALL_VIEWS[id];
    current = `${view.name}/preload`;
    const context = await browser.newContext(contextOptions(view));
    const page = await context.newPage();
    const requests = [];
    const warnings = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()); });
    await applyMutation(page);
    try {
      await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'load', timeout: WAIT_MS });
      await page.waitForFunction(() => globalThis.__HB_FAILSAFE && __HB_FAILSAFE.isBooted(), null,
        { timeout: WAIT_MS, polling: 250 });
      // Chromium reports an unused preload a few seconds after `load`
      await page.waitForTimeout(6000);
      const preloads = await page.evaluate(() => [...document.querySelectorAll('link[rel=preload]')].map((l) => ({
        href: l.href, as: l.as, crossorigin: l.getAttribute('crossorigin') })));
      const counts = preloads.map((p) => ({ ...p, requests: requests.filter((u) => u === p.href).length }));
      const unused = warnings.filter((w) => /preload/i.test(w));
      measure('preloads', counts);
      measure('preloadWarnings', unused);
      const dupes = Object.entries(requests.reduce((m, u) => ((m[u] = (m[u] || 0) + 1), m), {}))
        .filter(([, n]) => n > 1).map(([u, n]) => `${u.replace(BASE_URL, '')} x${n}`);
      measure('anyDuplicateRequests', dupes);
      check('zero "preload ... not used" console warnings', unused.length === 0, unused.slice(0, 3).join(' | '));
      check('each preloaded URL is requested exactly once', counts.every((c) => c.requests === 1),
        counts.map((c) => `${c.href.replace(BASE_URL, '')}: ${c.requests}`).join(', '));
    } finally { await context.close(); }
  }
}

/* --------------------------------- watchdog ------------------------------ */
// A stall injector installed before any page script. `__t105stall.frameHold`
// withholds every requestAnimationFrame callback until a deadline while the
// page's timers keep running; `busy(ms)` blocks the main thread outright.
function stallInit() {
  const realRAF = window.requestAnimationFrame.bind(window);
  const S = { holdUntil: 0, armedAt: 0, mode: null, panels: [], beats: [], plan: null };
  window.__t105stall = S;
  window.requestAnimationFrame = function (cb) {
    return realRAF(function run(ts) {
      if (Date.now() < S.holdUntil) { realRAF(run); return; }
      cb(ts);
    });
  };
  S.busy = (ms) => { const end = Date.now() + ms; while (Date.now() < end) { /* stall */ } };
  // plan: { trigger: 'booted' | 'beats>=N', kind: 'hold' | 'busy', ms }
  const tick = () => {
    const api = window.__HB_FAILSAFE;
    if (api) {
      const show = api.showing();
      if (show && !S.panels.includes(show)) S.panels.push(show);
      S.beats.push([Date.now(), api.beats()]);
      if (S.plan && !S.armedAt) {
        const p = S.plan;
        const ready = p.trigger === 'booted' ? api.isBooted() : api.isBooted() && api.beats() >= p.beats;
        if (ready) {
          S.armedAt = Date.now();
          S.beatsAtArm = api.beats();
          if (p.kind === 'hold') S.holdUntil = Date.now() + p.ms;
          else setTimeout(() => S.busy(p.ms), 0);
        }
      }
    }
    setTimeout(tick, 20);
  };
  tick();
  try {
    const plan = sessionStorage.getItem('t105plan');
    if (plan) S.plan = JSON.parse(plan);
  } catch (_) { /* no storage */ }
}

async function stallTrial(browser, view, plan, query) {
  const context = await browser.newContext(contextOptions(view, 1));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((p) => { try { sessionStorage.setItem('t105plan', JSON.stringify(p)); } catch (_) {} }, plan);
  await page.addInitScript(stallInit);
  await applyMutation(page);
  try {
    await page.goto(`${BASE_URL}/index.html${query}`, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
    await page.waitForFunction(() => window.__t105stall && window.__t105stall.armedAt > 0, null,
      { timeout: WAIT_MS, polling: 200 });
    // the stall itself, then long enough for any watchdog verdict to land
    await page.waitForTimeout(plan.ms + 7000);
    const r = await page.evaluate(() => {
      const S = window.__t105stall;
      const api = window.__HB_FAILSAFE;
      return { panels: S.panels, showing: api.showing(), beatsAtArm: S.beatsAtArm, beatsNow: api.beats(),
        armedAt: S.armedAt };
    });
    return { ...r, errors };
  } finally { await context.close(); }
}

async function sectionWatchdog(browser) {
  const view = ALL_VIEWS.l844;
  current = `${view.name}/watchdog`;
  const title = '';                                 // the default URL (title screen)
  const playing = `?testapi=1&audio=0`;             // auto-starts into PLAYING
  const trials = [
    ['frame stall 6 s from boot (before the first rendered frame)', { trigger: 'booted', kind: 'hold', ms: 6000 }, title, false],
    ['frame stall 6 s after the first frame began (a slow first draw)', { trigger: 'beats', beats: 1, kind: 'hold', ms: 6000 }, title, false],
    ['frame stall 6 s after warm-up, during PLAYING', { trigger: 'beats', beats: 40, kind: 'hold', ms: 6000 }, playing, true],
    ['main-thread busy-wait 6 s from boot (reported, not judged)', { trigger: 'booted', kind: 'busy', ms: 6000 }, title, null],
    ['main-thread busy-wait 6 s after warm-up, during PLAYING (reported, not judged)', { trigger: 'beats', beats: 40, kind: 'busy', ms: 6000 }, playing, null],
  ];
  const rows = [];
  for (const [name, plan, query, wantPanel] of trials) {
    const r = await stallTrial(browser, view, plan, query);
    const frozen = r.panels.includes('frozen');
    rows.push({ name, plan, panels: r.panels, beatsAtArm: r.beatsAtArm, beatsAfter: r.beatsNow, errors: r.errors.length });
    if (wantPanel === null) {
      console.log(`  NOTE [${current}] ${name}: panels ${JSON.stringify(r.panels)} (beats ${r.beatsAtArm} -> ${r.beatsNow})`);
      continue;
    }
    check(`${name}: ${wantPanel ? 'the "game got stuck" panel DOES show' : 'no "game got stuck" panel'}`,
      wantPanel ? frozen : !frozen && r.beatsNow > r.beatsAtArm,
      `panels ${JSON.stringify(r.panels)}, beats ${r.beatsAtArm} -> ${r.beatsNow}`);
  }
  measure('stalls', rows);
}

/* --------------------------------- rotation ------------------------------ */
async function sectionRotate(browser) {
  const view = ALL_VIEWS.l844;
  current = `${view.name}/rotate`;
  const owned = await open(browser, view, { query: `?testapi=1&fixeddt=${TICK_MS}&audio=0`, frozen: false, dpr: 1 });
  const { page, touch: T } = owned;
  const read = () => page.evaluate(async () => {
    const { camera, renderer } = await import('/src/render/scene.js');
    const c = renderer.domElement;
    const cr = c.getBoundingClientRect();
    const rig = document.getElementById('hudRigPanel').getBoundingClientRect();
    const obj = document.getElementById('hudObjectivePanel').getBoundingClientRect();
    const k = HB.keys;
    return {
      W: innerWidth, H: innerHeight, canvasCss: [cr.width, cr.height], canvasPx: [c.width, c.height],
      pixelRatio: renderer.getPixelRatio(), cameraAspect: camera.aspect,
      rig: [rig.left, rig.top, rig.right, rig.bottom], obj: [obj.left, obj.top, obj.right, obj.bottom],
      keys: ['left', 'right', 'up', 'down', 'jump', 'fire', 'swap'].filter((n) => k[n]),
      deck: __HB_TOUCH().held, deckW: __HB_TOUCH().layout.width,
      failsafe: __HB_FAILSAFE.showing(), state: HB.state(),
    };
  });
  const judge = (label, r) => {
    const aspectOk = Math.abs(r.cameraAspect - r.W / r.H) < 1e-6;
    const cssOk = Math.abs(r.canvasCss[0] - r.W) < 1 && Math.abs(r.canvasCss[1] - r.H) < 1;
    const pxOk = Math.abs(r.canvasPx[0] / r.canvasPx[1] - r.W / r.H) < 0.02 &&
      Math.abs(r.canvasPx[0] - Math.round(r.W * r.pixelRatio)) <= 1;
    check(`${label}: canvas and camera follow the new viewport ${r.W}x${r.H}`, aspectOk && cssOk && pxOk,
      `css ${r.canvasCss.map((v) => v.toFixed(0))}, px ${r.canvasPx}, ratio ${r.pixelRatio}, aspect ${r.cameraAspect.toFixed(4)}`);
    const hudIn = r.rig[0] >= 0 && r.rig[2] <= r.W && r.obj[0] >= 0 && r.obj[2] <= r.W && r.rig[3] <= r.H;
    check(`${label}: the HUD is re-laid out inside the new viewport, deck re-laid out (layout width ${r.deckW})`,
      hudIn && r.deckW === r.W, `rig ${r.rig.map((v) => v.toFixed(0))} obj ${r.obj.map((v) => v.toFixed(0))}`);
    check(`${label}: no stuck input (deck holds nothing, sim keys all up) and no failsafe panel`,
      r.keys.length === 0 && r.deck.length === 0 && !r.failsafe && r.state === 'PLAYING',
      `keys ${r.keys} deck ${r.deck} failsafe ${r.failsafe} state ${r.state}`);
  };
  try {
    await until(page, () => HB.state() === 'PLAYING');
    await page.evaluate(() => { HB.player.iframesUntil = 1e12; });   // TEST SETUP: no damage mid-trial
    const L = await deckLayout(page);
    await T.down(11, L.ghost.cx, L.ghost.cy);
    await T.move(11, L.ghost.cx + 44, L.ghost.cy);
    await T.down(12, L.fire.cx, L.fire.cy);
    await T.down(13, L.jump.cx, L.jump.cy);
    await frames(page, 2);
    const held = await read();
    check('three fingers down hold run + fire + jump before the rotation',
      held.keys.includes('right') && held.keys.includes('fire') && held.keys.includes('jump'), `${held.keys}`);
    await page.setViewportSize({ width: view.h, height: view.w });
    await page.waitForTimeout(800);
    await frames(page, 3);
    const p = await read();
    judge('rotated to portrait mid-run', p);
    const ap = await page.evaluate(auditInPage);
    judgeAudit({ ...view, phone: true }, 'portrait after rotation', ap);
    await shot(page, join(OUT, `${LABEL}-rotate-portrait.png`));
    await T.upAll();
    await frames(page, 2);
    await page.setViewportSize({ width: view.w, height: view.h });
    await page.waitForTimeout(800);
    await frames(page, 3);
    const l = await read();
    judge('rotated back to landscape', l);
    const al = await page.evaluate(auditInPage);
    judgeAudit({ ...view, phone: true }, 'landscape after rotating back', al);
    await shot(page, join(OUT, `${LABEL}-rotate-landscape.png`));
    // a fresh press still works after both rotations
    const L2 = await deckLayout(page);
    await T.down(21, L2.ghost.cx, L2.ghost.cy);
    await T.move(21, L2.ghost.cx + 44, L2.ghost.cy);
    await frames(page, 2);
    const fresh = await read();
    await T.upAll();
    check('a fresh stick press after the rotations runs RIG right', fresh.keys.includes('right'), `${fresh.keys}`);
    measure('rotation', { held, portrait: p, landscape: l });
    check('rotation raised no page errors', owned.errors.length === 0, owned.errors.slice(0, 3).join(' | '));
  } finally { await owned.close(); }
}

/* ---------------------------------- audio -------------------------------- */
function audioInit() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const calls = [];
  window.__t105audio = { calls, fake: null };
  if (!AC) return;
  const real = AC.prototype.resume;
  AC.prototype.resume = function () {
    const ev = window.event;
    calls.push({ evt: ev ? ev.type : null, pointerType: ev && ev.pointerType || null,
      state: this.state, at: Date.now() });
    return real.call(this);
  };
  // `interrupted` is WebKit's own state (a call, Siri, the app backgrounded).
  // Chromium never reports it, so the trial can force the getter.
  const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state');
  Object.defineProperty(BaseAudioContext.prototype, 'state', {
    configurable: true,
    get() { return window.__t105audio.fake || desc.get.call(this); },
  });
}
async function sectionAudio(browser) {
  const view = ALL_VIEWS.l844;
  current = `${view.name}/audio`;
  const owned = await open(browser, view, { query: '', frozen: false, dpr: 1, init: audioInit });
  const { page, touch: T } = owned;
  try {
    await until(page, () => HB.state() === 'MENU');
    await T.tap(1, view.w * 0.5, view.h * 0.5);
    await until(page, () => HB.state() === 'PLAYING');
    await page.waitForTimeout(500);
    const a = await page.evaluate(() => ({ audio: HB.audio(), calls: window.__t105audio.calls }));
    const inEnd = a.calls.filter((c) => c.evt === 'touchend' || (c.evt === 'pointerup' && c.pointerType === 'touch'));
    measure('firstTap', a);
    check('the first tap builds the audio context and it runs', a.audio.unlocked && a.audio.contextState === 'running',
      `${a.audio.contextState}`);
    check('resume() runs inside the touch END dispatch (pointerup/touchend — the gesture iOS honours)',
      inEnd.length > 0, a.calls.map((c) => `${c.evt}:${c.state}`).join(', '));
    // iOS: a phone call / Siri / app switch leaves the context 'interrupted';
    // the next tap must resume it.
    await page.evaluate(() => { window.__t105audio.calls.length = 0; window.__t105audio.fake = 'interrupted'; });
    await T.tap(2, view.w * 0.5, view.h * 0.4);
    await page.waitForTimeout(300);
    const b = await page.evaluate(() => { const c = window.__t105audio.calls.slice(); window.__t105audio.fake = null; return c; });
    check('a context iOS reports as "interrupted" is resumed by the next tap, inside the gesture',
      b.some((c) => c.evt === 'touchend' || c.evt === 'pointerup'), b.map((c) => `${c.evt}:${c.state}`).join(', ') || 'no resume() call');
    check('audio trial raised no page errors', owned.errors.length === 0, owned.errors.slice(0, 3).join(' | '));
  } finally { await owned.close(); }
}

/* --------------------------------- manifest ------------------------------ */
async function sectionManifest(browser) {
  const view = ALL_VIEWS.l844;
  current = `${view.name}/manifest`;
  const owned = await open(browser, view, { query: `?testapi=1&audio=0`, frozen: true, dpr: 1 });
  const { page, cdp } = owned;
  try {
    const head = await page.evaluate(() => {
      const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? null;
      return {
        manifestHref: document.querySelector('link[rel="manifest"]')?.href || null,
        appleCapable: meta('apple-mobile-web-app-capable'),
        mobileCapable: meta('mobile-web-app-capable'),
        statusBar: meta('apple-mobile-web-app-status-bar-style'),
        appTitle: meta('apple-mobile-web-app-title'),
        themeColor: meta('theme-color'),
        touchIcons: [...document.querySelectorAll('link[rel="apple-touch-icon"]')].map((l) => ({ href: l.href, sizes: l.getAttribute('sizes') })),
      };
    });
    measure('head', head);
    check('index.html links a web app manifest', !!head.manifestHref, String(head.manifestHref));
    check('apple-mobile-web-app-capable=yes and a status-bar style are declared',
      head.appleCapable === 'yes' && !!head.statusBar, `${head.appleCapable} / ${head.statusBar}`);
    let parsed = null;
    try { parsed = await cdp.send('Page.getAppManifest'); } catch (e) { parsed = { errors: [{ message: String(e.message || e) }] }; }
    const data = parsed && parsed.data ? JSON.parse(parsed.data) : null;
    measure('manifestErrors', parsed && parsed.errors);
    check('the browser parses the manifest with no errors', !!data && (!parsed.errors || parsed.errors.length === 0),
      JSON.stringify(parsed && parsed.errors));
    if (data) {
      const startUrl = new URL(data.start_url || '', parsed.url).href;
      check('manifest: landscape, fullscreen/standalone, start_url is the game page',
        /landscape/.test(data.orientation || '') && /fullscreen|standalone/.test(data.display || '') &&
        /\/index\.html(\?|$)/.test(startUrl), `${data.orientation} / ${data.display} / ${startUrl}`);
      const icons = await page.evaluate(async ({ list, base }) => {
        const out = [];
        for (const icon of list) {
          const url = new URL(icon.src, base).href;
          const img = new Image();
          img.src = url;
          try { await img.decode(); out.push({ ...icon, url, w: img.naturalWidth, h: img.naturalHeight }); }
          catch (_) { out.push({ ...icon, url, w: 0, h: 0 }); }
        }
        return out;
      }, { list: data.icons || [], base: parsed.url });
      measure('icons', icons);
      const sized = icons.every((i) => (i.sizes || '').split(/\s+/).includes(`${i.w}x${i.h}`) && i.w > 0);
      check('every manifest icon decodes at its declared size, with 192 and 512 and a maskable one',
        sized && icons.some((i) => i.w === 192) && icons.some((i) => i.w === 512) &&
        icons.some((i) => /maskable/.test(i.purpose || '')), icons.map((i) => `${i.sizes}:${i.w}x${i.h}`).join(', '));
    }
    const touch = await page.evaluate(async (list) => {
      const out = [];
      for (const t of list) {
        const img = new Image(); img.src = t.href;
        try { await img.decode(); out.push({ ...t, w: img.naturalWidth, h: img.naturalHeight }); }
        catch (_) { out.push({ ...t, w: 0, h: 0 }); }
      }
      return out;
    }, head.touchIcons);
    check('apple-touch-icon decodes at 180x180', touch.some((t) => t.w === 180 && t.h === 180), JSON.stringify(touch));
  } finally { await owned.close(); }
}

/* -------------------------------- compare mode --------------------------- */
function compareRuns(baseDir, branchDir) {
  const screens = ['title', 'play', 'pause'];
  let differences = 0;
  const lines = [];
  for (const screen of screens) {
    const fa = join(baseDir, `base-d1280-${screen}.json`);
    const fb = join(branchDir, `branch-d1280-${screen}.json`);
    if (!existsSync(fa) || !existsSync(fb)) { lines.push(`${screen}: missing ${existsSync(fa) ? fb : fa}`); differences++; continue; }
    const a = JSON.parse(readFileSync(fa, 'utf8'));
    const b = JSON.parse(readFileSync(fb, 'utf8'));
    for (const sel of new Set([...Object.keys(a.named), ...Object.keys(b.named)])) {
      const ra = a.named[sel], rb = b.named[sel];
      const s = (r) => (r ? `${r.left},${r.top} ${r.w}x${r.h}` : 'absent');
      if (s(ra) !== s(rb)) { lines.push(`${screen}: ${sel} ${s(ra)} -> ${s(rb)}`); differences++; }
    }
    const ta = a.texts.map((t) => `${t.el}|${t.text}|${t.font}|${t.rect.join(',')}`);
    const tb = b.texts.map((t) => `${t.el}|${t.text}|${t.font}|${t.rect.join(',')}`);
    for (const t of ta) if (!tb.includes(t)) { lines.push(`${screen}: - ${t}`); differences++; }
    for (const t of tb) if (!ta.includes(t)) { lines.push(`${screen}: + ${t}`); differences++; }
    if (a.copy !== b.copy) { lines.push(`${screen}: visible copy differs:\n    base:   ${a.copy}\n    branch: ${b.copy}`); differences++; }
  }
  console.log(lines.join('\n') || 'no differences');
  console.log(`compare: ${differences} difference(s) across desktop 1280x720 title/play/pause`);
  return 0;
}

/* ----------------------------------- main -------------------------------- */
const started = Date.now();
const { browser } = await launchBrowser({ channel: 'chrome' });
try {
  if (ONLY.has('screens')) await sectionScreens(browser);
  if (ONLY.has('safe')) await sectionSafe(browser);
  if (ONLY.has('gateline')) await sectionGateline(browser);
  if (ONLY.has('preload')) await sectionPreload(browser);
  if (ONLY.has('watchdog')) await sectionWatchdog(browser);
  if (ONLY.has('rotate')) await sectionRotate(browser);
  if (ONLY.has('audio')) await sectionAudio(browser);
  if (ONLY.has('manifest')) await sectionManifest(browser);
} catch (error) {
  check('harness completed', false, String(error && error.stack || error).split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
const report = {
  tool: 'tools/playtest/phone-shell.mjs', label: LABEL, baseUrl: BASE_URL, mutate: MUTATE || null, dpr: DPR,
  sections: [...ONLY], views: VIEW_IDS, ms: Date.now() - started,
  passed: results.length - failed.length, failed: failed.length, results, measures,
};
writeFileSync(join(OUT, `report-${LABEL}${MUTATE ? '-mutate-' + MUTATE : ''}.json`), JSON.stringify(report, null, 2));
console.log(`phone-shell [${LABEL}]${MUTATE ? ` (mutation ${MUTATE})` : ''}: ${report.passed} passed, ${report.failed} failed in ${Math.round(report.ms / 1000)} s`);
process.exit(failed.length ? 1 : 0);
