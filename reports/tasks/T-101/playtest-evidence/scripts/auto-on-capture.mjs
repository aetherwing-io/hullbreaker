// QA (T-101 gate): capture the AUTO-on deck state (?autofire=1) at 844x390 DPR2 (frozen sim, idle) and report
// the computed font sizes of the deck's text so legibility claims are measured, not guessed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const TREE = process.env.HB_TREE || '/home/user/hullbreaker';
const { launchBrowser } = await import('file://' + join(TREE, 'tools/assets/lib/browser.mjs'));
const BASE = (process.argv[2] || 'http://127.0.0.1:8779').replace(/\/$/, '');
const OUT = process.argv[3]; mkdirSync(OUT, { recursive: true });
const { browser } = await launchBrowser({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__ = { version: 1, events: [], stopAtMs: 0 }; });
  await page.goto(`${BASE}/index.html?testapi=1&fixeddt=16.667&audio=0&autofire=1`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function' && HB.state() === 'PLAYING', null, { timeout: 300000, polling: 500 });
  const info = await page.evaluate(() => {
    const fs = (sel) => { const n = document.querySelector(sel); if (!n) return null; const s = getComputedStyle(n); return { size: s.fontSize, weight: s.fontWeight, display: s.display, color: s.color }; };
    return {
      autoFire: __HB_TOUCH().autoFire,
      fonts: { jumpLabel: fs('#thumbJump b'), fireLabel: fs('#thumbFire b'), fireAutoTag: fs('#thumbFire i'), chipSwap: fs('#thumbSwap'), chipAuto: fs('#thumbAuto'),
        chipPause: fs('#thumbPause'), ghost: fs('#thumbGhost'), cue: fs('#thumbCue'), modal: fs('#thumbModal') },
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: join(OUT, 'landscape-dpr2-autofire-on.png'), timeout: 300000 });
  writeFileSync(join(OUT, 'auto-on-fonts.json'), JSON.stringify({ info, errors }, null, 2));
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await context.close();
} finally { await browser.close(); }
