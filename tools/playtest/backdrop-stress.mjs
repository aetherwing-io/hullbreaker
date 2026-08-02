// backdrop-stress.mjs — the frame-cost half of T-051, measured the same way
// tools/playtest/sprite-stress.mjs measures the runtime hostile sprites,
// against the same bar (decisions.md entry 18: "60fps with 200+ live
// projectiles is still the bar"). Twelve extra textured quads is a small
// claim; this is what proves it rather than asserting it.
//
//   node backdrop-stress.mjs [outDir]      (default: runs/backdrop-stress)
//
// Two readings, REPEATED 3x each (a distribution, not a mean, per the T-051
// dispatch brief), on the same machine, back to back:
//   flat      ?backdrop=flat — the pre-T-051 renderer (existing box tiers only)
//   backdrop  the shipped default (+ 12 textured quads, 5 unique textures)
//
// Both carry the identical load: the right key held on the default six-face
// run, the game's own fireWeapon('S', clone=true) called 12x per frame (60
// projectiles/frame, saturating the 256-slot pool in src/sim/weapons.js) —
// the same load sprite-stress.mjs and juice-stress.mjs use, so a reading here
// is comparable to theirs.
//
// Reported per run: window.HB.perf() (fps, avgMs, worstMs, over20ms — the
// in-game sampler over the last 180 real frames) and THREE's renderer.info
// (drawCalls, triangles) sampled once after the load has settled.
//
// HONESTY NOTES, inherited from sprite-stress.mjs:
//   1. rAF is vsync-locked; worstMs and over20ms are the load-bearing fields.
//   2. Development machine, headless Chrome, one browser per reading — this
//      is evidence about this code's per-frame work, not a device claim.
//   3. The injected projectile load is heavier than play can produce.
//   4. Compare readings only within the SAME run of this tool.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(process.argv[2] || join(here, 'runs', 'backdrop-stress'));
const REPEATS = 3;

const VIEWPORT = { width: 1280, height: 800 };
const WARM_MS = 1200;
const RUN_MS = 5000;

function stressLoop() {
  return (async () => {
    const [W, PL] = await Promise.all([
      import('/src/sim/weapons.js'),
      import('/src/sim/player.js'),
    ]);
    globalThis.__STRESS_ON__ = true;
    globalThis.__HB_WEAPONS__ = W;
    const step = () => {
      if (!globalThis.__STRESS_ON__) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();
}

const READ = () => {
  const W = globalThis.__HB_WEAPONS__;
  let live = 0;
  if (W) for (const b of W.bulletPool) if (b.alive) live++;
  const info = globalThis.__HB_RENDERER__ ? globalThis.__HB_RENDERER__.info : null;
  return {
    perf: globalThis.HB.perf(),
    liveProjectiles: live,
    drawCalls: info ? info.render.calls : null,
    triangles: info ? info.render.triangles : null,
    backdrop: typeof window.__HB_BACKDROP === 'function' ? window.__HB_BACKDROP() : null,
    state: globalThis.HB.state(),
  };
};

async function measureOnce(base, query) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  await page.goto(base + '/index.html' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING',
    null, { timeout: 15000 });
  await page.evaluate(async () => {
    globalThis.__HB_RENDERER__ = (await import('/src/render/scene.js')).renderer;
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(WARM_MS);
  await page.evaluate(stressLoop);
  await page.waitForTimeout(RUN_MS);
  const out = await page.evaluate(READ);
  await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
  await page.keyboard.up('ArrowRight');
  out.errors = errors;
  await browser.close();
  return out;
}

mkdirSync(OUT, { recursive: true });
const server = await startStaticServer(repoRoot, { port: 0 });
const base = server.baseUrl.replace(/\/$/, '');

const VARIANTS = [
  { id: 'flat', query: '?testapi=1&backdrop=flat' },
  { id: 'backdrop', query: '?testapi=1' },
];

const result = {
  measuredAt: new Date().toISOString(),
  tool: 'tools/playtest/backdrop-stress.mjs',
  viewport: '1280x800, headless Chrome (channel: chrome), one browser per reading',
  load: '60 projectiles/frame via the game\'s own fireWeapon(clone=true), right held ' +
        'on the default six-face run',
  repeats: REPEATS,
  runs: {},
};

for (const v of VARIANTS) {
  const readings = [];
  for (let i = 0; i < REPEATS; i++) {
    process.stdout.write(`[backdrop-stress] ${v.id} run ${i + 1}/${REPEATS}...\n`);
    readings.push(await measureOnce(base, v.query));
  }
  result.runs[v.id] = readings;
}

const worstMsList = (id) => result.runs[id].map((r) => r.perf.worstMs);
const over20List = (id) => result.runs[id].map((r) => r.perf.over20ms);
result.summary = {
  flat: { worstMs: worstMsList('flat'), over20ms: over20List('flat') },
  backdrop: { worstMs: worstMsList('backdrop'), over20ms: over20List('backdrop') },
};

writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');

const line = (id) => {
  const rs = result.runs[id];
  const worst = rs.map((r) => r.perf.worstMs);
  const over = rs.map((r) => r.perf.over20ms);
  const calls = rs.map((r) => r.drawCalls);
  return `  ${id.padEnd(9)} worstMs [${worst.map((n) => n.toFixed(2)).join(', ')}]  ` +
    `over20ms [${over.join(', ')}]  drawCalls [${calls.join(', ')}]  ` +
    `built=${rs[0].backdrop ? rs[0].backdrop.built : 'n/a'}`;
};
console.log('[backdrop-stress]');
console.log(line('flat'));
console.log(line('backdrop'));
for (const v of VARIANTS) {
  for (const r of result.runs[v.id]) {
    if (r.errors.length) console.log(`  ${v.id} page errors:`, JSON.stringify(r.errors));
  }
}
console.log('[backdrop-stress] wrote ' + join(OUT, 'result.json'));
await server.close();
