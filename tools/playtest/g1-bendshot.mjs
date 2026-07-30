// g1-bendshot.mjs — dev-only visual check for the projectile bend cull: drive
// RIG to the first corner's pivot clamp, hold fire pointing FORWARD (into the
// bend), and screenshot the frames where the bolts leave on the tangent. The
// sim side of the rule is asserted in tools/pathcheck.mjs; this exists because
// "the tracer flies off and fades" is a claim about pixels.
//
//   node g1-bendshot.mjs            — ?g1=1 (limb) and default, near view
//
// It pokes CONFIG for a faster approach (framing only, same as g1-capture's
// --dev-fast), so its output is a visual sanity check and not evidence of pace.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'runs', 'g1');
mkdirSync(OUT, { recursive: true });

const server = await startStaticServer(resolve(here, '..', '..'), { port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const [tag, query] of [['g1', '?g1=1&view=near&testapi=1'], ['default', '?view=near&testapi=1']]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${server.baseUrl}/index.html${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.HB.CONFIG.scrollSpeed = 9.0; });
  await page.keyboard.down('ArrowRight');
  const t0 = Date.now();
  let shot = 0, jumping = false, lastJump = 0;
  while (Date.now() - t0 < 90000 && shot < 3) {
    const st = await page.evaluate(() => {
      const s = globalThis.__HULLBREAKER_TEST__.snapshot();
      return {
        x: s.player.x, corner: s.corner, state: s.state, scrollX: s.scrollX,
        gameMs: s.gameMs, grounded: s.player.grounded,
      };
    });
    if (st.state !== 'PLAYING') break;
    // hop on a game-time cadence: the fixture's gaps kill a pure hold-right run
    if (!jumping && st.gameMs - lastJump > 800) {
      await page.keyboard.down('Space'); jumping = true; lastJump = st.gameMs;
    } else if (jumping && st.gameMs - lastJump > 240) {
      await page.keyboard.up('Space'); jumping = false;
    }
    // at the pivot clamp with the gate up: fire forward, into the joint
    if (st.corner && st.corner.state === 'gate' && st.x > st.corner.pivotS - 1.2) {
      await page.keyboard.down('KeyJ');
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${OUT}/bendshot-${tag}-${shot}.png` });
      shot++;
      continue;
    }
    await page.waitForTimeout(30);
  }
  console.log(`${tag}: ${shot} frame(s) at the pivot`);
  await context.close();
}

await browser.close();
await server.close();
