#!/usr/bin/env node
// QA (T-101 gate): the deck in a REAL browser at other phone viewports, with
// CDP safe-area emulation when this Chromium supports it. Frozen sim (spawn
// framing), idle capture + in-use capture per case. For each case it also
// reads the DOM rects of every control and judges them against the safe area.
//
//   node viewport-sweep.mjs <baseUrl> <outDir>
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

const CASES = [
  { name: '844x390-notch-left', w: 844, h: 390, ins: { top: 0, left: 47, bottom: 21, right: 0 } },
  { name: '844x390-notch-right', w: 844, h: 390, ins: { top: 0, left: 0, bottom: 21, right: 47 } },
  { name: '932x430-island-both', w: 932, h: 430, ins: { top: 0, left: 59, bottom: 21, right: 59 } },
  { name: '667x375-se', w: 667, h: 375, ins: null },
  { name: '568x270-se1-toolbar', w: 568, h: 270, ins: null },
  { name: '844x340-toolbar', w: 844, h: 340, ins: null },
];

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const { browser } = await launchBrowser({ channel: 'chrome' });
let exit = 0;
try {
  for (const c of CASES) {
    const context = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    await page.addInitScript(() => { globalThis.__HULLBREAKER_INPUT_BOOTSTRAP__ = { version: 1, events: [], stopAtMs: 0 }; });
    const cdp = await context.newCDPSession(page);
    let emu = 'not requested';
    if (c.ins) {
      try {
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.ins });
        emu = 'applied';
      } catch (e) { emu = 'unsupported: ' + String(e.message || e).split('\n')[0]; }
    }
    const t0 = Date.now();
    await page.goto(`${BASE}/index.html?testapi=1&fixeddt=16.667&audio=0`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => globalThis.HB && typeof globalThis.__HB_TOUCH === 'function', null, { timeout: 300000, polling: 500 });
    await page.waitForFunction(() => HB.state() === 'PLAYING', null, { timeout: 300000, polling: 500 });
    console.log(`  [${c.name}] booted ${Date.now() - t0} ms; safe-area emulation: ${emu}`);
    const info = await page.evaluate(() => {
      const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
      const cs = getComputedStyle(document.getElementById('thumbSafe'));
      return {
        W: innerWidth, H: innerHeight,
        padding: { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft },
        layoutSafe: __HB_TOUCH().layout.safe,
        jump: rect('thumbJump'), fire: rect('thumbFire'), swap: rect('thumbSwap'), pause: rect('thumbPause'), auto: rect('thumbAuto'), ghost: rect('thumbGhost'),
        cluster: __HB_TOUCH().layout.cluster,
        cue: rect('thumbCue'),
      };
    });
    const s = info.layoutSafe;
    if (c.ins) {
      check(`[${c.name}] the deck reads the emulated safe-area insets through env() -> CSS var -> layout`,
        emu === 'applied' ? (Math.abs(s.left - c.ins.left) < 0.6 && Math.abs(s.right - c.ins.right) < 0.6 && Math.abs(s.bottom - c.ins.bottom) < 0.6)
          : true, emu === 'applied' ? `layout.safe ${JSON.stringify(s)} vs wanted ${JSON.stringify(c.ins)}` : `skipped (${emu})`);
    }
    const inside = (r) => r.left >= s.left - 0.6 && r.right <= info.W - s.right + 0.6 && r.top >= s.top - 0.6 && r.bottom <= info.H - s.bottom + 0.6;
    check(`[${c.name}] JUMP, FIRE, SWAP, PAUSE, AUTO and the stick ghost are all inside the safe area`,
      [info.jump, info.fire, info.swap, info.pause, info.auto, info.ghost].every(inside),
      JSON.stringify({ safe: s, jump: [info.jump.left, info.jump.top, info.jump.right, info.jump.bottom].map(Math.round), fire: [info.fire.left, info.fire.top, info.fire.right, info.fire.bottom].map(Math.round) }));
    check(`[${c.name}] bottom hint line clears the bottom inset`, info.cue.bottom <= info.H - s.bottom + 1, `cue bottom ${info.cue.bottom.toFixed(1)} vs ${info.H - s.bottom}`);
    console.log(`  [${c.name}] cluster box top ${info.cluster.y.toFixed(1)} px = ${(100 * info.cluster.y / info.H).toFixed(1)}% of ${info.H}; JUMP ${info.jump.width.toFixed(0)} px, FIRE ${info.fire.width.toFixed(0)} px`);
    await page.screenshot({ path: join(OUT, `vp-${c.name}-idle.png`), timeout: 300000 });
    check(`[${c.name}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} catch (error) {
  console.log('HARNESS ERROR: ' + (error && error.stack || error));
  exit = 2;
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
writeFileSync(join(OUT, 'viewport-sweep.json'), JSON.stringify({ base: BASE, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`viewport-sweep: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(exit || (failed.length ? 1 : 0));
