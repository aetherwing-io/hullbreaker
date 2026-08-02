// Cross-owner break test: does breaking ONE owner's asset silently starve
// the OTHER owner's asset through the shared preload.js gate?
// Owners: src/render/player.js (rig-marine.png, ONE asset) and
// src/render/sprites.js (5 hostile sprites, imported via hostiles.js,
// which main.js imports BEFORE player.js).
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8793';

async function run(label, routeSetup) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  const consoleLines = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => consoleLines.push(m.text()));
  if (routeSetup) await routeSetup(page);
  await page.goto(`${BASE}/index.html?slice=traversal&hound=3&testapi=1`, { waitUntil: 'load' });
  await page.waitForTimeout(6000); // clear past the 2500ms budget + any artificial delay
  const preload = await page.evaluate(() => (typeof window.__HB_PRELOAD === 'function') ? window.__HB_PRELOAD() : null);
  const sprites = await page.evaluate(() => (typeof window.__HB_SPRITES === 'function') ? window.__HB_SPRITES() : null);
  const hb = await page.evaluate(() => window.HB ? window.HB.snapshot() : null);
  const failsafe = await page.evaluate(() => (window.HB && typeof window.HB.failsafe === 'function') ? window.HB.failsafe() : null);
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t049-runs/cross-owner-${label}.png` });
  await browser.close();

  console.log(`\n=== ${label} ===`);
  console.log('preload assets:', JSON.stringify((preload && preload.assets) || null, null, 1));
  console.log('preload cost/budget:', preload ? `${preload.costMs}ms of ${preload.budgetMs}ms` : null);
  console.log('sprites snapshot:', JSON.stringify(sprites));
  console.log('HB.state:', hb ? hb.state : null, ' hostiles kinds:', hb ? JSON.stringify(hb.hostiles.map(h=>h.kind)) : null);
  console.log('failsafe:', failsafe ? `showing=${failsafe.showing} halted=${failsafe.halted} faults=${failsafe.faults} uncaught=${failsafe.uncaught} beats=${failsafe.beats}` : null);
  console.log('pageErrors:', JSON.stringify(pageErrors));
  console.log('console lines mentioning "sprite" or "RIG":', JSON.stringify(consoleLines.filter(l => /sprite|RIG/i.test(l))));
  return { preload, sprites, hb, failsafe, pageErrors, consoleLines };
}

// A: baseline, nothing broken
await run('A-baseline', null);

// B: ALL 5 hostile sprites aborted at the network — does rig-marine.png
// still arrive?
await run('B-hostiles-aborted', async (page) => {
  await page.route('**/assets/generated/sprites/{hound-brace,carrier-hauler,wasp-drone,polyp-iris,mortar-tripod}-*.png', (route) => route.abort('failed'));
});

// C: RIG's sprite aborted at the network — do all 5 hostile sprites still
// arrive?
await run('C-rig-aborted', async (page) => {
  await page.route('**/assets/generated/sprites/rig-marine.png', (route) => route.abort('failed'));
});

// D: mixed in the SAME run — one hostile kind 404s (aborted), RIG's sprite
// is slow (4000ms, past the 2500ms budget)
await run('D-mixed-hound-404-rig-slow', async (page) => {
  await page.route('**/assets/generated/sprites/hound-brace-*.png', (route) => route.abort('failed'));
  await page.route('**/assets/generated/sprites/rig-marine.png', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
});
