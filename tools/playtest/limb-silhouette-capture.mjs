#!/usr/bin/env node
/* Isolated visual proof for the production limb silhouette.  The harness owns
   its static server and browser, closes both in finally, and never navigates a
   user's tab. `?limbs=legacy` is the only difference in the face-1 A/B. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../assets/lib/png.mjs';
import { launchBrowser } from '../assets/lib/browser.mjs';
import { startStaticServer } from './lib/server.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-limb-silhouette');
await mkdir(out, { recursive: true });

const shots = [
  { id: 'face1', viewport: { width: 1440, height: 900 }, scroll: 44, corners: 0,
    variants: ['production', 'legacy'], isolate: true },
  { id: 'turn1-mid', viewport: { width: 1440, height: 900 }, scroll: 89, corners: 0,
    turnMs: 550, variants: ['production'], isolate: true },
  { id: 'crown', viewport: { width: 1440, height: 900 }, scroll: 382, corners: 5,
    variants: ['production'], isolate: true },
  { id: 'portrait', viewport: { width: 390, height: 844 }, scroll: 44, corners: 0,
    variants: ['production'], isolate: true },
];

function pixelDifference(aFile, bFile) {
  const a = decodePng(aFile);
  const b = decodePng(bFile);
  if (a.width !== b.width || a.height !== b.height) return null;
  let changed = 0;
  let sum = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const delta = Math.abs(a.rgba[i] - b.rgba[i]) +
      Math.abs(a.rgba[i + 1] - b.rgba[i + 1]) +
      Math.abs(a.rgba[i + 2] - b.rgba[i + 2]);
    if (delta >= 9) changed++;
    sum += delta / 3;
  }
  const pixels = a.width * a.height;
  return { changedShare: +(changed / pixels).toFixed(5), meanDelta: +(sum / pixels).toFixed(3) };
}

const server = await startStaticServer(repoRoot, { port: 0 });
const launched = await launchBrowser({ channel: 'chrome' });
const { browser } = launched;
const report = { output: out, browser: { channel: launched.channel, via: launched.via },
  captures: [], gates: [], errors: [] };
const gate = (ok, label, detail = null) => report.gates.push({ ok: Boolean(ok), label, detail });

try {
  for (const shot of shots) for (const variant of shot.variants) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const id = `${shot.id}-${variant}`;
    page.on('pageerror', (error) => report.errors.push(`${id}: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push(`${id}: console: ${message.text()}`);
    });
    const legacy = variant === 'legacy' ? '&limbs=legacy' : '';
    const url = `${server.baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far${legacy}`;
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, {
      timeout: 20000,
    });
    await page.evaluate(async ({ scroll, corners, turnMs, portrait }) => {
      const W = await import('/src/sim/wavegate.js');
      const T = await import('/src/sim/time.js');
      const C = await import('/src/render/camera.js');
      const B = await import('/src/sim/bridge.js');
      const H = await import('/src/sim/hostiles.js');
      const M = await import('/src/sim/mods.js');
      H.clearHostiles();
      M.clearMods();
      for (let i = 0; i < corners; i++) W.finishCorner(W.cornerEvents[i]);
      if (turnMs != null) {
        const corner = W.cornerEvents[corners];
        corner.state = 'turning';
        corner.tStart = T.gameMs - turnMs;
      }
      T.setScrollX(scroll);
      HB.player.x = scroll + (portrait ? 1.0 : 3.0);
      const col = Math.max(0, Math.min(HB.levelData.groundH.length - 1,
        Math.floor(HB.player.x)));
      HB.player.y = HB.levelData.groundH[col];
      HB.player.hp = 3;
      HB.player.lives = 3;
      HB.player.iframesUntil = 1e9;
      C.syncCamera();
      B.view.player.sync();
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    }, {
      scroll: shot.scroll,
      corners: shot.corners,
      turnMs: shot.turnMs ?? null,
      portrait: shot.viewport.width < 600,
    });
    await page.addStyleTag({ content: '#overlay { display: none !important; }' });
    await page.waitForTimeout(350);
    const runtime = await page.evaluate(async () => {
      const { renderer, scene } = await import('/src/render/scene.js');
      const { limbFoldCullSnapshot } = await import('/src/render/limb.js');
      const pools = [];
      scene.traverse((object) => {
        if (object.userData?.environmentRole !== 'limb-anatomy') return;
        pools.push({
          name: object.name,
          count: object.count,
          shape: object.userData.limbShape,
          silhouette: object.userData.limbSilhouette,
          dynamicUsage: object.instanceMatrix?.usage,
        });
      });
      return {
        pools,
        planPieces: globalThis.HB?.g1?.pieces ?? null,
        poolCount: pools.length,
        instances: pools.reduce((sum, row) => sum + row.count, 0),
        shapes: [...new Set(pools.map((row) => row.shape))].sort(),
        fold: limbFoldCullSnapshot(),
        render: { ...renderer.info.render },
      };
    });
    const fullFile = resolve(out, `${id}-full.png`);
    await page.screenshot({ path: fullFile });
    let isolateFile = null;
    if (shot.isolate) {
      await page.evaluate(async () => {
        const { scene } = await import('/src/render/scene.js');
        scene.traverse((object) => {
          if (!object.isMesh) return;
          object.userData.limbQaWasVisible = object.visible;
          object.visible = object.userData?.environmentRole === 'limb-anatomy';
        });
      });
      await page.waitForTimeout(80);
      isolateFile = resolve(out, `${id}-limb-only.png`);
      await page.screenshot({ path: isolateFile });
    }
    report.captures.push({ id, moment: shot.id, variant, fullFile, isolateFile, runtime });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const production = report.captures.filter((row) => row.variant === 'production');
const legacy = report.captures.find((row) => row.id === 'face1-legacy');
const face = report.captures.find((row) => row.id === 'face1-production');
report.face1Difference = pixelDifference(face.fullFile, legacy.fullFile);
report.face1IsolateDifference = pixelDifference(face.isolateFile, legacy.isolateFile);

gate(report.errors.length === 0, 'browser emitted no page or console errors', report.errors);
gate(production.every((row) => row.runtime.planPieces === legacy.runtime.planPieces),
  'production silhouette changes no immutable bake-plan piece',
  production.map((row) => [row.id, row.runtime.planPieces]));
gate(production.every((row) => row.runtime.instances === face.runtime.instances) &&
  face.runtime.instances < legacy.runtime.instances,
  'redundant lip and duplicate far-tier cards are absent from production fixed pools', {
    production: face.runtime.instances, legacy: legacy.runtime.instances,
  });
gate(production.every((row) => row.runtime.pools.every((pool) =>
  pool.silhouette === 'production')) && legacy.runtime.pools.every((pool) =>
  pool.silhouette === 'legacy'), 'every limb pool reports the selected A/B vocabulary');
gate(face.runtime.poolCount <= legacy.runtime.poolCount + 3,
  'production vocabulary stays within three fixed pools of legacy', {
    production: face.runtime.poolCount, legacy: legacy.runtime.poolCount,
  });
gate(face.runtime.render.calls <= legacy.runtime.render.calls + 3,
  'production silhouette adds at most three scene draw calls', {
    production: face.runtime.render.calls, legacy: legacy.runtime.render.calls,
  });
gate(production.every((row) => row.runtime.fold.hidden > 0),
  'face, mid-turn, Crown and portrait all cull non-owned facet anatomy',
  production.map((row) => [row.id, row.runtime.fold]));
gate(production.every((row) => row.runtime.shapes.includes('scute') &&
  row.runtime.shapes.includes('cable') && row.runtime.shapes.includes('rib')),
  'every production frame carries lobes, connectors and hardpoints');
gate(report.face1Difference.changedShare >= 0.02 &&
  report.face1IsolateDifference.changedShare >= 0.05,
  'matched A/B proves the shipped frame and isolated anatomy materially changed', {
    full: report.face1Difference, isolate: report.face1IsolateDifference,
  });

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output: out, face1Difference: report.face1Difference,
  face1IsolateDifference: report.face1IsolateDifference, gates: report.gates,
  captures: report.captures.map((row) => ({ id: row.id, full: row.fullFile,
    isolate: row.isolateFile, pools: row.runtime.poolCount,
    calls: row.runtime.render.calls, triangles: row.runtime.render.triangles,
    fold: row.runtime.fold })), errors: report.errors }, null, 2));
if (report.errors.length || report.gates.some((row) => !row.ok)) process.exitCode = 1;
