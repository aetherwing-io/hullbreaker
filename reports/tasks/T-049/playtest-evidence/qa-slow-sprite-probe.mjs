// Ad-hoc QA probe: delay ONE sprite response past the preload budget
// (PRELOAD_BUDGET_MS=2500) via Playwright route interception (no file
// changes), confirm the boot gate times it out, primitive fallback draws,
// and nothing wedges. Delays the wasp/drone sprite specifically (distinct
// from the hound break test already run).
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8790';
const DELAY_MS = 4000; // > PRELOAD_BUDGET_MS (2500)
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
const consoleLines = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => consoleLines.push(m.text()));

await page.route('**/assets/generated/sprites/wasp-drone-*.png', async (route) => {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  await route.continue();
});

const t0 = Date.now();
await page.goto(`${BASE}/index.html?slice=traversal&hound=2&testapi=1`, { waitUntil: 'load' });
// hound=2 adds a wasp to the mix per src/mode.js
await page.waitForTimeout(6000); // past both the 2.5s budget and the 4s artificial delay
const bootMs = Date.now() - t0;

const sprites = await page.evaluate(() => (typeof window.__HB_SPRITES === 'function') ? window.__HB_SPRITES() : null);
const preload = await page.evaluate(() => (typeof window.__HB_PRELOAD === 'function') ? window.__HB_PRELOAD() : null);
const hb = await page.evaluate(() => window.HB ? window.HB.snapshot() : null);
const failsafe = await page.evaluate(() => (window.HB && typeof window.HB.failsafe === 'function') ? window.HB.failsafe() : null);

await page.screenshot({ path: '/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t049-runs/slow-wasp-shot.png' });

console.log('wall time to this point (ms):', bootMs);
console.log('sprites snapshot:', JSON.stringify(sprites));
console.log('preload snapshot:', JSON.stringify(preload));
console.log('HB.state:', hb ? hb.state : null, 'hostiles:', hb ? JSON.stringify(hb.hostiles && hb.hostiles.map(h=>h.kind)) : null);
console.log('failsafe:', JSON.stringify(failsafe));
console.log('pageErrors:', JSON.stringify(pageErrors));
console.log('console lines mentioning wasp:', JSON.stringify(consoleLines.filter(l => l.toLowerCase().includes('wasp'))));

await browser.close();
