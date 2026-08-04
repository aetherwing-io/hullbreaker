#!/usr/bin/env node
// Resource ceiling proof for the live renderer and the capture workflow.
// One isolated headless browser, four fresh contexts, one ephemeral server.
// `legacy` is the exact pre-fix DPR expression; `bounded` is production.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from '../playtest/lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] || '/private/tmp/hullbreaker-resource-stress');
const SAMPLE_MS = 3400;
const TARGET_PROJECTILES = 200;

const PROFILES = [
  {
    id: 'desktop-retina',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  },
  {
    id: 'portrait-compact',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  },
];

const VARIANTS = [
  { id: 'legacy', query: '&renderbudget=legacy' },
  { id: 'bounded', query: '' },
];

function metricMap(result) {
  return Object.fromEntries((result.metrics || []).map((m) => [m.name, m.value]));
}

function delta(after, before, name) {
  return (after[name] || 0) - (before[name] || 0);
}

async function measure(owner, baseUrl, profile, variant) {
  const { page, context, close } = await owner.newPage({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  try {
    const query = '?testapi=1&audio=0&momentum=0&score=0' + variant.query;
    await page.goto(`${baseUrl}/index.html${query}`, {
      waitUntil: 'load', timeout: 20000,
    });
    await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null, {
      timeout: 15000,
    });
    await page.evaluate(async () => {
      const [W, P, H] = await Promise.all([
        import('/src/sim/weapons.js'),
        import('/src/sim/player.js'),
        import('/src/sim/hostiles.js'),
      ]);
      H.clearHostiles();
      P.player.iframesUntil = Number.MAX_SAFE_INTEGER;
      globalThis.__HB_RESOURCE_STRESS__ = { W, P, active: true };
      const step = () => {
        const stress = globalThis.__HB_RESOURCE_STRESS__;
        if (!stress?.active) return;
        const p = stress.P.player;
        // The shipped spread path creates five bullets per call. Twelve calls
        // saturate the fixed 256-slot pool without inventing a render object.
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          stress.W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await page.waitForFunction((minimum) => {
      const pool = globalThis.__HB_RESOURCE_STRESS__?.W.bulletPool || [];
      let live = 0;
      for (const bullet of pool) if (bullet.alive) live++;
      return live >= minimum;
    }, TARGET_PROJECTILES, { timeout: 8000 });

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = metricMap(await cdp.send('Performance.getMetrics'));
    const started = performance.now();
    await page.waitForTimeout(SAMPLE_MS);
    const elapsedMs = performance.now() - started;
    const after = metricMap(await cdp.send('Performance.getMetrics'));

    const reading = await page.evaluate(async () => {
      const stress = globalThis.__HB_RESOURCE_STRESS__;
      let liveProjectiles = 0;
      for (const bullet of stress.W.bulletPool) if (bullet.alive) liveProjectiles++;
      const { rendererResourceSnapshot } = await import('/src/render/scene.js');
      const heap = performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
      } : null;
      return {
        state: window.HB.state(),
        perf: window.HB.perf(),
        post: window.HB.post(),
        viewInit: window.HB.viewInit(),
        resetRegistry: window.HB.resetRegistry(),
        adaptiveFidelity: window.HB.adaptiveFidelity(),
        resources: rendererResourceSnapshot(),
        liveProjectiles,
        heap,
      };
    });
    await page.evaluate(() => { globalThis.__HB_RESOURCE_STRESS__.active = false; });

    const taskSeconds = delta(after, before, 'TaskDuration');
    const scriptSeconds = delta(after, before, 'ScriptDuration');
    const layoutSeconds = delta(after, before, 'LayoutDuration');
    return {
      ...reading,
      errors,
      cpuProxy: {
        sampleMs: +elapsedMs.toFixed(1),
        taskMs: +(taskSeconds * 1000).toFixed(2),
        taskPercent: +(taskSeconds * 100000 / elapsedMs).toFixed(2),
        scriptMs: +(scriptSeconds * 1000).toFixed(2),
        layoutMs: +(layoutSeconds * 1000).toFixed(2),
      },
    };
  } finally {
    try {
      await page.evaluate(() => {
        if (globalThis.__HB_RESOURCE_STRESS__) globalThis.__HB_RESOURCE_STRESS__.active = false;
      });
    } catch { /* page may have failed or already closed */ }
    await close();
  }
}

await mkdir(OUT, { recursive: true });
const result = {
  measuredAt: new Date().toISOString(),
  tool: 'tools/perf/resource-stress.mjs',
  workflow: 'one separate headless Chrome + fresh contexts + ephemeral in-process server',
  load: 'fixed 256-slot projectile pool saturated through fireWeapon(S, clone=true)',
  sampleMs: SAMPLE_MS,
  profiles: {},
};

await withIsolatedBrowser(ROOT, async (owner) => {
  for (const profile of PROFILES) {
    result.profiles[profile.id] = {
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      variants: {},
    };
    for (const variant of VARIANTS) {
      process.stdout.write(`[resource-stress] ${profile.id}/${variant.id}\n`);
      result.profiles[profile.id].variants[variant.id] =
        await measure(owner, owner.baseUrl, profile, variant);
    }
  }
});

const desktop = result.profiles['desktop-retina'].variants;
const portrait = result.profiles['portrait-compact'].variants;
result.summary = {
  desktop: {
    legacyPixels: desktop.legacy.resources.drawingPixels,
    boundedPixels: desktop.bounded.resources.drawingPixels,
    pixelsSavedPercent: +((1 - desktop.bounded.resources.drawingPixels /
      desktop.legacy.resources.drawingPixels) * 100).toFixed(1),
    legacyFrameMs: desktop.legacy.perf.avgMs,
    boundedFrameMs: desktop.bounded.perf.avgMs,
    legacyTaskPercent: desktop.legacy.cpuProxy.taskPercent,
    boundedTaskPercent: desktop.bounded.cpuProxy.taskPercent,
  },
  portrait: {
    legacyPixels: portrait.legacy.resources.drawingPixels,
    boundedPixels: portrait.bounded.resources.drawingPixels,
    legacyFrameMs: portrait.legacy.perf.avgMs,
    boundedFrameMs: portrait.bounded.perf.avgMs,
    legacyTaskPercent: portrait.legacy.cpuProxy.taskPercent,
    boundedTaskPercent: portrait.bounded.cpuProxy.taskPercent,
  },
};

const failures = [];
for (const [profileId, profile] of Object.entries(result.profiles)) {
  for (const [variantId, reading] of Object.entries(profile.variants)) {
    if (reading.errors.length) failures.push(`${profileId}/${variantId}: ${reading.errors.join('; ')}`);
    if (reading.liveProjectiles < TARGET_PROJECTILES) {
      failures.push(`${profileId}/${variantId}: only ${reading.liveProjectiles} live projectiles`);
    }
    if (!['active', 'adaptive-bypass'].includes(reading.post.status))
      failures.push(`${profileId}/${variantId}: post path unavailable (${reading.post.status})`);
    const missingViews = reading.viewInit.base
      .filter((entry) => !entry.optional && !entry.installed)
      .map((entry) => entry.id);
    if (!reading.viewInit.initialized || missingViews.length)
      failures.push(`${profileId}/${variantId}: view init missing ${missingViews.join(',')}`);
    if (reading.resetRegistry.runs < 1 || reading.resetRegistry.last.length !== 30)
      failures.push(`${profileId}/${variantId}: reset registry did not complete all owners`);
    if (reading.post.boot.programWarmCount !== 1 || reading.post.boot.programsAfterWarm < 1)
      failures.push(`${profileId}/${variantId}: representative program warmup did not complete`);
    if (!Number.isFinite(reading.resources.memory.textures) ||
        !Number.isFinite(reading.resources.memory.geometries)) {
      failures.push(`${profileId}/${variantId}: renderer memory counters unavailable`);
    }
  }
}
if (desktop.legacy.resources.policy !== 'legacy' ||
    desktop.bounded.resources.policy !== 'bounded') failures.push('desktop A/B policy did not resolve');
if (!(desktop.bounded.resources.drawingPixels <= 6_610_000 &&
      desktop.bounded.resources.drawingPixels < desktop.legacy.resources.drawingPixels)) {
  failures.push('desktop drawing-buffer budget did not bind');
}
if (portrait.bounded.resources.drawingPixels !== portrait.legacy.resources.drawingPixels) {
  failures.push('ordinary portrait quality changed');
}

result.failures = failures;
await writeFile(`${OUT}/result.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out: OUT, summary: result.summary, failures }, null, 2));
if (failures.length) throw new Error(failures.join('\n'));
