// Cleaner mid-fight capture: real rifle fire (held key, not injected FX),
// full five-kind roster planted at a realistic spread and distance.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8790';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE}/index.html?slice=traversal&testapi=1&enemies=0`, { waitUntil: 'load' });
await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 15000 });

await page.evaluate(async () => {
  const H = await import('/src/sim/hostiles.js');
  const P = await import('/src/sim/player.js');
  H.clearHostiles();
  const p = P.player;
  const rows = [
    { kind: 'hound', dx: 10, dy: 0.45 },
    { kind: 'wasp', dx: 13, dy: 3.2 },
    { kind: 'carrier', dx: 16, dy: 5.0 },
    { kind: 'polyp', dx: 18, dy: 1.05, dir: -1 },
    { kind: 'mortar', dx: 21, dy: 1.05, dir: -1, zoneAt: -8 },
  ];
  for (const r of rows) {
    const x = p.x + r.dx, y = p.y + r.dy;
    H.spawnHostile(x, y, 0, r.kind, { dir: r.dir || -1, zone: r.kind === 'mortar' ? { x: x - 10, y } : undefined });
  }
});
await page.waitForTimeout(1200); // materialize (900ms) + settle

await page.keyboard.down('KeyJ'); // fire, real weapon cadence
await page.waitForTimeout(900);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t049-runs/mid-fight-clean.png' });
await page.keyboard.up('KeyJ');
const hb = await page.evaluate(() => globalThis.HB.snapshot());
console.log('hostiles at capture:', JSON.stringify(hb.hostiles.map(h => ({ kind: h.kind, state: h.state, x: Math.round(h.x*10)/10, y: Math.round(h.y*10)/10 }))));
await browser.close();
