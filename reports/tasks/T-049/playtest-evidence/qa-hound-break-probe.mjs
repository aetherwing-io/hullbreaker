// Ad-hoc QA probe: hound sprite files physically missing (404), confirm
// primitive fallback draws, no wedge, sim unaffected, console names the file.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8792';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleLines = [];
const pageErrors = [];
page.on('console', (m) => consoleLines.push(m.text()));
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/index.html?slice=traversal&hound=3&testapi=1`, { waitUntil: 'load' });
await page.waitForTimeout(3500); // past the 2500ms preload budget

const sprites = await page.evaluate(() => (typeof window.__HB_SPRITES === 'function') ? window.__HB_SPRITES() : null);
const preload = await page.evaluate(() => (typeof window.__HB_PRELOAD === 'function') ? window.__HB_PRELOAD() : null);
const hb = await page.evaluate(() => window.HB ? window.HB.snapshot() : null);
const failsafe = await page.evaluate(() => (window.HB && typeof window.HB.failsafe === 'function') ? window.HB.failsafe() : null);

await page.screenshot({ path: '/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t049-runs/hound-break-shot.png' });

console.log('sprites snapshot:', JSON.stringify(sprites));
console.log('preload snapshot:', JSON.stringify(preload));
console.log('HB.state:', hb ? hb.state : null, 'hostiles:', hb ? JSON.stringify(hb.hostiles && hb.hostiles.map(h=>h.kind)) : null);
console.log('failsafe:', JSON.stringify(failsafe));
console.log('pageErrors:', JSON.stringify(pageErrors));
console.log('console lines mentioning hound sprite:', JSON.stringify(consoleLines.filter(l => l.toLowerCase().includes('hound'))));

await browser.close();
