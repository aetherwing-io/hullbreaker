// juice-stress.mjs — dev-only budget measurement for the baseline feedback
// pass (T-011). Answers the one acceptance line that has to be MEASURED
// rather than asserted: does 60fps hold with 200+ projectiles plus effects?
//
//   node juice-stress.mjs [outDir]        (default: runs/juice-stress)
//
// Method: the page holds the right key on the default six-face run while a
// page-side rAF loop calls the game's OWN exported spawn paths every frame —
// fireWeapon('S', …, clone=true) twelve times (60 projectiles/frame, so the
// 256-slot pool in src/sim/weapons.js saturates and stays saturated) plus one
// fxBurst + fxFlash (so the 224-spark pool saturates too). The readings come
// from window.HB.perf(), the in-game wall-clock frame sampler in src/main.js:
// a ring of the last 180 real frame intervals -> fps, avgMs, worstMs, and
// over20ms (frames slower than a dropped frame at 60Hz). Three browsers, one
// reading each: control (no injected load), stress, and stress with ?juice=0.
//
// Honesty notes, in order of how much they matter:
//   1. rAF is vsync-locked, so `fps` can never exceed the display's refresh
//      rate — on a 120Hz panel a perfect run reads 120fps/8.33ms, not "as
//      fast as the machine can go". What the numbers prove is that no frame
//      was late, not how much headroom is left. `worstMs` and `over20ms` are
//      the load-bearing fields: a stall shows up there first.
//   2. This measures a DEVELOPMENT machine in headless Chrome at 1280x800.
//      It is evidence about the code's per-frame work, not a claim about any
//      particular target device.
//   3. The injected load is heavier than the game can currently produce on
//      its own (the player cannot fire 60 shots a frame). That is the point —
//      it is a ceiling probe, not a gameplay trace.
//   4. clone=true keeps shotsFired / the GHOST shot log untouched, so the
//      injected fire cannot pollute the run's own stats, but everything else
//      (collision, per-slot render upload, hostile hits) runs exactly as it
//      does in play.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(process.argv[2] || join(here, 'runs', 'juice-stress'));

const VIEWPORT = { width: 1280, height: 800 };
const WARM_MS = 1200;                    // let the run settle before measuring
const RUN_MS = 5000;                     // > 180 frames, so the ring is all load

// runs IN THE PAGE: the imports resolve to the same module instances the game
// booted (same URLs), so this is the game's own spawn path, not a mock
function stressLoop() {
  return (async () => {
    const [W, FX, C, PL] = await Promise.all([
      import('/src/sim/weapons.js'),
      import('/src/render/fx.js'),
      import('/src/config.js'),
      import('/src/sim/player.js'),
    ]);
    globalThis.__STRESS_ON__ = true;
    const J = C.CONFIG.juice;
    const step = () => {
      if (!globalThis.__STRESS_ON__) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      FX.fxBurst(J.death, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      FX.fxFlash(J.death.flashMs, J.death.flashSize, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();
}

function readOut() {
  const W = globalThis.__HB_WEAPONS__;
  let live = 0;
  if (W) for (const b of W.bulletPool) if (b.alive) live++;
  return {
    perf: globalThis.HB.perf(),
    juice: globalThis.HB.juice(),
    liveProjectiles: live,
    state: globalThis.HB.state(),
    attempts: globalThis.HB.sliceStats.attempts,
  };
}

async function measure(base, { query, stress, shotPath }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location && m.location();
    if (loc && /\/favicon\.ico$/.test(loc.url || '') && /404/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  await page.goto(base + '/index.html' + query, { waitUntil: 'load' });
  await page.waitForFunction(
    () => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 8000 });
  await page.evaluate(async () => {
    globalThis.__HB_WEAPONS__ = await import('/src/sim/weapons.js');
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(WARM_MS);
  if (stress) await page.evaluate(stressLoop);
  await page.waitForTimeout(RUN_MS);
  const out = await page.evaluate(readOut);
  if (shotPath) await page.screenshot({ path: shotPath });
  await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
  await page.keyboard.up('ArrowRight');
  out.errors = errors;
  await browser.close();
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startStaticServer(repoRoot, { port: 0 });
  const base = server.baseUrl.replace(/\/$/, '');
  try {
    const result = {
      measuredAt: new Date().toISOString(),
      tool: 'tools/playtest/juice-stress.mjs',
      viewport: '1280x800, headless Chrome (channel: chrome), one browser per reading',
      load: '60 projectiles/frame via the game\'s own fireWeapon(clone=true) + one ' +
            'death burst and flash per frame, right key held on the default six-face run',
      reading: 'window.HB.perf() — the in-game wall-clock sampler over the last 180 ' +
               'frames — after ' + RUN_MS + 'ms of sustained load',
      caveat: 'rAF is vsync-locked: fps cannot exceed the panel refresh rate, so ' +
              'worstMs and over20ms are the load-bearing fields, not fps',
      control: await measure(base, { query: '?testapi=1', stress: false }),
      stress: await measure(base, {
        query: '?testapi=1', stress: true, shotPath: join(OUT, '07-stress-perf.png'),
      }),
      stressJuiceOff: await measure(base, { query: '?testapi=1&juice=0', stress: true }),
    };
    writeFileSync(join(OUT, '07-stress-perf.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\nwrote ' + join(OUT, '07-stress-perf.json'));
  } finally {
    await server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
