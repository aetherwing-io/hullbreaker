// Ad-hoc QA perf probe, vsync OFF (entry 18's binding condition), independent
// of tools/playtest/sprite-stress.mjs (which is vsync-locked by design and
// says so in its own honesty notes). Launches Chrome with
// --disable-gpu-vsync --disable-frame-rate-limit, saturates the 256-slot
// bullet pool via the game's own fireWeapon() at 12 calls/frame while a
// full five-kind hostile roster is kept alive, and samples raw per-frame ms
// directly via requestAnimationFrame timestamps (not the game's own
// aggregated HB.perf(), for an independent measurement) over a 6s window.
// Reports the full distribution, not a mean (decisions entry 19).
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8790';
const VIEWPORT = { width: 1280, height: 800 };
const WARM_MS = 1200;
const RUN_MS = 6000;

async function run(query, label) {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  await page.goto(`${BASE}/index.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 15000 });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(WARM_MS);

  await page.evaluate(async () => {
    const [W, FX, C, PL, HS] = await Promise.all([
      import('/src/sim/weapons.js'),
      import('/src/render/fx.js'),
      import('/src/config.js'),
      import('/src/sim/player.js'),
      import('/src/sim/hostiles.js'),
    ]);
    globalThis.__STRESS_ON__ = true;
    const J = C.CONFIG.juice;
    const KINDS = ['hound', 'wasp', 'carrier', 'polyp', 'mortar'];
    let n = 0;
    const TARGET_HOSTILES = 10;
    const step = () => {
      if (!globalThis.__STRESS_ON__) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      FX.fxBurst(J.death, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      FX.fxFlash(J.death.flashMs, J.death.flashSize, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      while (HS.hostiles.length < TARGET_HOSTILES) {
        const kind = KINDS[n % KINDS.length];
        const lane = 3 + (n % 4) * 1.6;
        const x = p.x + 4 + (n % 7) * 1.7;
        n++;
        HS.spawnHostile(x, p.y + (kind === 'wasp' || kind === 'carrier' ? lane : 1.05),
          0, kind, { dir: 1, zone: kind === 'mortar' ? { x: x - 10, y: p.y } : undefined });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // raw per-frame ms, independent of the game's own perfSnapshot()
  await page.evaluate(() => {
    globalThis.__QA_FRAMES__ = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      globalThis.__QA_FRAMES__.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.waitForTimeout(RUN_MS);

  const out = await page.evaluate(() => {
    const W = globalThis.__HB_WEAPONS__;
    const frames = globalThis.__QA_FRAMES__.slice(1); // drop first (includes the setup gap)
    return { frames, hbPerf: globalThis.HB.perf(), state: globalThis.HB.state() };
  });
  await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
  await page.keyboard.up('ArrowRight');
  const liveProjectiles = await page.evaluate(async () => {
    const W = await import('/src/sim/weapons.js');
    let live = 0;
    for (const b of W.bulletPool) if (b.alive) live++;
    return live;
  });
  const liveHostiles = await page.evaluate(async () => (await import('/src/sim/hostiles.js')).hostiles.length);

  await browser.close();

  const f = out.frames.slice().sort((a, b) => a - b);
  const pct = (p) => f[Math.min(f.length - 1, Math.floor(p * f.length))];
  const over20 = f.filter((x) => x > 20).length;
  const over16_7 = f.filter((x) => x > 16.7).length;
  console.log(`\n=== ${label} (${query}) ===`);
  console.log(`errors: ${JSON.stringify(errors)}`);
  console.log(`state: ${out.state}  liveProjectiles: ${liveProjectiles}  liveHostiles: ${liveHostiles}`);
  console.log(`frames sampled: ${f.length}`);
  console.log(`p50: ${pct(0.5).toFixed(2)}ms  p90: ${pct(0.9).toFixed(2)}ms  p99: ${pct(0.99).toFixed(2)}ms  worst: ${f[f.length - 1].toFixed(2)}ms`);
  console.log(`frames >16.7ms (missed 60fps): ${over16_7} / ${f.length} (${(100 * over16_7 / f.length).toFixed(1)}%)`);
  console.log(`frames >20ms: ${over20} / ${f.length} (${(100 * over20 / f.length).toFixed(1)}%)`);
  console.log(`game's own HB.perf(): ${JSON.stringify(out.hbPerf)}`);
  return { label, errors, liveProjectiles, liveHostiles, frames: f };
}

await run('?slice=traversal&testapi=1&enemies=0&sprites=0', 'primitives (?sprites=0)');
await run('?slice=traversal&testapi=1&enemies=0', 'sprites (shipped default)');
