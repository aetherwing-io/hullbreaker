// sprite-stress.mjs — the frame-cost half of T-049, measured the same way
// tools/playtest/juice-stress.mjs measures the feedback pass, because the
// bar is the same one (decisions.md entry 18: "60fps with 200+ live
// projectiles is still the bar, and it is now the binding constraint").
//
//   node sprite-stress.mjs [outDir]      (default: runs/sprite-stress)
//
// Two readings in ONE session, on the same machine, minutes apart:
//   primitives  ?sprites=0 — the pre-T-049 renderer
//   sprites     the shipped default
//
// Both carry the identical load: the right key held on the default run, the
// game's own fireWeapon('S', clone=true) called 12x per frame (60
// projectiles/frame, so the 256-slot pool in src/sim/weapons.js saturates),
// a death burst and flash every frame, and a hostile roster topped back up
// to TARGET_HOSTILES whenever the barrage kills one — so the hostile
// renderer is actually under load rather than idling behind the sparks.
//
// Reported per reading: window.HB.perf() (fps, avgMs, worstMs, over20ms —
// the in-game sampler over the last 180 real frames), live projectiles,
// live hostiles, and THREE's own renderer.info for the last frame
// (drawCalls, triangles, programs).
//
// HONESTY NOTES, inherited from juice-stress.mjs and extended:
//   1. rAF is vsync-locked, so `fps` cannot exceed the panel's refresh
//      rate. worstMs and over20ms are the load-bearing fields.
//   2. This is a development machine in headless Chrome at 1280x800. It is
//      evidence about this code's per-frame work, not a claim about any
//      particular target device.
//   3. The injected load is heavier than play can produce. It is a ceiling
//      probe, not a gameplay trace.
//   4. The two readings are separate browsers taken back to back. Thermal
//      state and other processes move these numbers between sessions; only
//      compare readings from the SAME run of this tool.
//   5. Draw calls are read at one instant, not averaged. They move with
//      how many bodies happen to be alive, which is why the hostile count
//      is reported beside them.
//   6. WHAT THE DRAW-CALL NUMBER COVERS: this branch has no shadow pass, so
//      renderer.info.render.calls here is the whole frame. T-047's lane adds
//      shadow maps and its report notes that renderer.info does not account
//      for the shadow pass — so do NOT carry a figure from this tool forward
//      as a shadow-inclusive number once that lane lands. Re-measure.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(process.argv[2] || join(here, 'runs', 'sprite-stress'));

const VIEWPORT = { width: 1280, height: 800 };
const WARM_MS = 1200;
const RUN_MS = 5000;
const TARGET_HOSTILES = 10;             // two of each of the five kinds

function stressLoop(targetHostiles) {
  return (async () => {
    const [W, FX, C, PL, HS] = await Promise.all([
      import('/src/sim/weapons.js'),
      import('/src/render/fx.js'),
      import('/src/config.js'),
      import('/src/sim/player.js'),
      import('/src/sim/hostiles.js'),
    ]);
    globalThis.__STRESS_ON__ = true;
    globalThis.__HB_WEAPONS__ = W;
    globalThis.__HB_HOSTILES__ = HS;
    const J = C.CONFIG.juice;
    const KINDS = ['hound', 'wasp', 'carrier', 'polyp', 'mortar'];
    let n = 0;
    const step = () => {
      if (!globalThis.__STRESS_ON__) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      FX.fxBurst(J.death, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      FX.fxFlash(J.death.flashMs, J.death.flashSize, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      // keep the roster full: the barrage kills these as fast as they arrive,
      // and an empty board would measure the sprite path by not running it
      while (HS.hostiles.length < targetHostiles) {
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
  })();
}

// The controlled half: exactly one of each kind, no barrage, no corpses, so
// the DRAW CALL difference between the two bodies is the thing being read
// rather than whatever happened to be alive.
const LINEUP = [
  { kind: 'carrier', dx: 3.0, dy: 4.2 },
  { kind: 'polyp', dx: 6.0, dy: 1.05, dir: 1 },
  { kind: 'mortar', dx: 9.0, dy: 1.05, dir: 1 },
  { kind: 'wasp', dx: 12.0, dy: 2.8 },
  { kind: 'hound', dx: 15.0, dy: 0.45 },
];

// the board has to be EMPTY for the baseline sample, or the wave's own
// hostiles are counted into it and the per-body delta means nothing
const CLEAR = async () => {
  const H = await import('/src/sim/hostiles.js');
  H.clearHostiles();
  return H.hostiles.length;
};

const SPAWN_LINEUP = async (lineup) => {
  const H = await import('/src/sim/hostiles.js');
  const P = await import('/src/sim/player.js');
  H.clearHostiles();
  const px = P.player.x, py = P.player.y;
  for (const row of lineup) {
    const x = px + row.dx, y = py + row.dy;
    H.spawnHostile(x, y, 0, row.kind, {
      dir: row.dir || 1, zone: row.kind === 'mortar' ? { x: x - 10, y } : undefined,
    });
  }
  return H.hostiles.length;
};

// draw calls over 60 consecutive frames, min/median/max
const SAMPLE_CALLS = () => new Promise((res) => {
  const r = globalThis.__HB_RENDERER__;
  const calls = [];
  const tick = () => {
    calls.push(r.info.render.calls);
    if (calls.length >= 60) {
      const s = calls.slice().sort((a, b) => a - b);
      res({ min: s[0], median: s[30], max: s[59] });
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const READ = () => {
  const W = globalThis.__HB_WEAPONS__;
  const HS = globalThis.__HB_HOSTILES__;
  let live = 0;
  if (W) for (const b of W.bulletPool) if (b.alive) live++;
  const info = globalThis.__HB_RENDERER__ ? globalThis.__HB_RENDERER__.info : null;
  return {
    perf: globalThis.HB.perf(),
    liveProjectiles: live,
    liveHostiles: HS ? HS.hostiles.length : 0,
    drawCalls: info ? info.render.calls : null,
    triangles: info ? info.render.triangles : null,
    programs: info ? info.programs.length : null,
    sprites: typeof window.__HB_SPRITES === 'function' ? window.__HB_SPRITES() : null,
    state: globalThis.HB.state(),
  };
};

async function measure(base, { id, query }) {
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
  await page.evaluate(stressLoop, TARGET_HOSTILES);
  await page.waitForTimeout(RUN_MS);
  const out = await page.evaluate(READ);
  await page.screenshot({ path: join(OUT, `stress-${id}.png`) });
  await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
  await page.keyboard.up('ArrowRight');
  out.errors = errors;
  await browser.close();
  return out;
}

/* The quiet reading is its own page on the TRAVERSAL slice with ?enemies=0:
   that fixture spawns nothing by itself, so an empty board really is empty
   and the difference between the two samples is the five bodies and
   nothing else. (On the six-face run the wave spawner refills the board
   while the sample is being taken, which is what made the first version of
   this measurement disagree with itself.) */
async function measureQuiet(base, { id, query }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(base + '/index.html' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING',
    null, { timeout: 15000 });
  await page.evaluate(async () => {
    globalThis.__HB_RENDERER__ = (await import('/src/render/scene.js')).renderer;
  });
  await page.waitForTimeout(WARM_MS);
  await page.evaluate(CLEAR);
  await page.waitForTimeout(900);            // let any corpse dissolve out
  const emptyBoard = await page.evaluate(SAMPLE_CALLS);
  const lineupCount = await page.evaluate(SPAWN_LINEUP, LINEUP);
  await page.waitForTimeout(1500);           // materialization is 900ms
  const withLineup = await page.evaluate(SAMPLE_CALLS);
  const live = await page.evaluate(() => window.HB.hostiles.length);
  await page.screenshot({ path: join(OUT, `quiet-${id}.png`) });
  await browser.close();
  return {
    emptyBoard, withLineup, lineupCount, liveAtSample: live,
    perHostileCalls: +((withLineup.median - emptyBoard.median) / live).toFixed(2),
  };
}

mkdirSync(OUT, { recursive: true });
const server = await startStaticServer(repoRoot, { port: 0 });
const base = server.baseUrl.replace(/\/$/, '');
const quietRuns = {
  primitives: await measureQuiet(base, {
    id: 'primitives', query: '?slice=traversal&testapi=1&enemies=0&sprites=0' }),
  sprites: await measureQuiet(base, {
    id: 'sprites', query: '?slice=traversal&testapi=1&enemies=0' }),
};
const result = {
  measuredAt: new Date().toISOString(),
  tool: 'tools/playtest/sprite-stress.mjs',
  viewport: '1280x800, headless Chrome (channel: chrome), one browser per reading',
  load: `60 projectiles/frame via the game's own fireWeapon(clone=true), one death ` +
        `burst + flash per frame, roster topped up to ${TARGET_HOSTILES} hostiles, ` +
        `right held on the default six-face run`,
  quiet: quietRuns,
  primitives: await measure(base, { id: 'primitives', query: '?testapi=1&sprites=0' }),
  sprites: await measure(base, { id: 'sprites', query: '?testapi=1' }),
};
result.primitives.quiet = quietRuns.primitives;
result.sprites.quiet = quietRuns.sprites;
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');

const line = (id, r) => `  ${id.padEnd(11)} fps ${String(r.perf.fps).padStart(5)}  ` +
  `avg ${r.perf.avgMs.toFixed(2)}ms  worst ${r.perf.worstMs.toFixed(2)}ms  ` +
  `over20ms ${String(r.perf.over20ms).padStart(3)}  drawCalls ${String(r.drawCalls).padStart(4)}  ` +
  `tris ${String(r.triangles).padStart(6)}  projectiles ${r.liveProjectiles}  hostiles ${r.liveHostiles}`;
const quiet = (id, r) => `  ${id.padEnd(11)} quiet board: ${r.quiet.emptyBoard.median} calls empty, ` +
  `${r.quiet.withLineup.median} with ${r.quiet.liveAtSample} hostiles ` +
  `(${r.quiet.perHostileCalls} draw calls per body)`;
console.log('[sprite-stress]');
console.log(quiet('primitives', result.primitives));
console.log(quiet('sprites', result.sprites));
console.log(line('primitives', result.primitives));
console.log(line('sprites', result.sprites));
if (result.primitives.errors.length || result.sprites.errors.length) {
  console.log('  page errors:', JSON.stringify({
    primitives: result.primitives.errors, sprites: result.sprites.errors,
  }));
}
console.log('[sprite-stress] wrote ' + join(OUT, 'result.json'));
await server.close();
