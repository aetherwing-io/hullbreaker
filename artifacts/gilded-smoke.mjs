// One-off smoke: boot the live dev server, run the browser self-test, then
// type the Konami code and confirm the gilded chassis latches on (and off).
import { chromium } from '/Users/scottmeyer/projects/hullbreaker/tools/playtest/node_modules/playwright-core/index.mjs';

const BASE = 'http://localhost:8741/index.html';
const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE + '?selftest=1', { waitUntil: 'load' });
await page.waitForFunction(() => /SELFTEST (PASS|FAIL)/.test(document.title), null, { timeout: 30000 });
console.log('selftest:', await page.title());

// Enter the code. The first arrow also starts the run (title fall-through),
// which is the documented behavior — the rest of the sequence lands in-game.
for (const code of SEQ) { await page.keyboard.press(code); await page.waitForTimeout(60); }
await page.waitForTimeout(600);

const snap = await page.evaluate(() => ({
  gilded: window.__HB_RIG_VISUAL?.().gilded,
  aura: window.__HB_RIG_VISUAL?.().gildedAuraVisible,
  bodyHeat: window.__HB_RIG_VISUAL?.().idleEmission,
  toast: document.getElementById('gildedToast')?.classList.contains('is-live') ?? 'no-el',
  toastText: document.getElementById('gildedToast')?.textContent,
}));
console.log('after code:', JSON.stringify(snap));

// Re-enter to toggle off.
for (const code of SEQ) { await page.keyboard.press(code); await page.waitForTimeout(60); }
await page.waitForTimeout(400);
const off = await page.evaluate(() => window.__HB_RIG_VISUAL?.().gilded);
console.log('after re-entry (expect false):', off);

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length || snap.gilded !== true || off !== false ? 1 : 0);
