#!/usr/bin/env node
/* Composition QA for the sparse Meridian fixture layer. This is a render-pose
   rig, not a gameplay claim: it uses the real shipped level/camera/materials,
   never mutates CONFIG or renderer resolution, and compares one URL flag
   (`detail=0`) at identical scroll/corner states. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-world-detail');
await mkdir(out, { recursive: true });

const moments = [
  { id: 'face1', viewport: { width: 1440, height: 900 }, scroll: 44, corners: 0 },
  { id: 'corner1-mid', viewport: { width: 1440, height: 900 }, scroll: 89, corners: 0, turnMs: 550 },
  { id: 'face3', viewport: { width: 1440, height: 900 }, scroll: 166, corners: 2 },
  { id: 'crown-face6', viewport: { width: 1440, height: 900 }, scroll: 382, corners: 5 },
  { id: 'portrait-face1', viewport: { width: 390, height: 844 }, scroll: 44, corners: 0 },
];
const variants = [
  { id: 'after', query: '' },
  { id: 'before', query: '&detail=0' },
];

const report = {
  browser: null,
  base: null,
  captures: [],
  errors: [],
};

await withIsolatedBrowser(repoRoot, async ({ baseUrl, launch, newPage }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  report.base = baseUrl;
  for (const variant of variants) for (const moment of moments) {
    const id = `${moment.id}-${variant.id}`;
    const owned = await newPage({
      viewport: moment.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    page.on('pageerror', (error) => report.errors.push(`${id}: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push(`${id}: console: ${message.text()}`);
    });
    const url = `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far` +
      `${variant.query}&worlddetailqa=${Date.now()}`;
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, {
      timeout: 20000,
    });
    const pose = await page.evaluate(async ({ scroll, corners, turnMs, portrait }) => {
      const W = await import('/src/sim/wavegate.js');
      const T = await import('/src/sim/time.js');
      const C = await import('/src/render/camera.js');
      const B = await import('/src/sim/bridge.js');
      const H = await import('/src/sim/hostiles.js');
      const M = await import('/src/sim/mods.js');
      const S = await import('/src/render/scene.js');
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
      document.querySelector('#overlay')?.setAttribute('style', 'display:none!important');
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      return {
        state: HB.state(),
        scroll: HB.scrollX(),
        view: HB.view(),
        world: globalThis.__HB_WORLD?.(),
        art: globalThis.__HB_WORLD_DETAIL_ART?.(),
        preload: globalThis.__HB_PRELOAD?.(),
        render: { ...S.renderer.info.render },
      };
    }, {
      scroll: moment.scroll,
      corners: moment.corners,
      turnMs: moment.turnMs ?? null,
      portrait: moment.viewport.width < 600,
    });
    // Pausing freezes the exact pose but normally raises the game's modal and
    // dim scrim. Suppress that UI with a persistent author-style rule so the
    // evidence remains an undimmed world frame.
    await page.addStyleTag({ content: '#overlay { display: none !important; }' });
    await page.waitForTimeout(450);
    const runtime = await page.evaluate(async () => {
      const { renderer } = await import('/src/render/scene.js');
      return {
        world: globalThis.__HB_WORLD?.(),
        art: globalThis.__HB_WORLD_DETAIL_ART?.(),
        render: { ...renderer.info.render },
      };
    });
    const file = resolve(out, `${id}.png`);
    await page.screenshot({ path: file });
    report.captures.push({ id, file, viewport: moment.viewport, pose, runtime });
    await owned.close();
  }
});

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  browser: report.browser,
  captures: report.captures.map((row) => ({
    id: row.id,
    file: row.file,
    detailState: row.runtime.world?.detailState,
    visible: row.runtime.world?.detailVisible,
    hidden: row.runtime.world?.detailHidden,
    drawPools: row.runtime.world?.detailDrawPools,
    calls: row.runtime.render?.calls,
    triangles: row.runtime.render?.triangles,
  })),
  errors: report.errors,
}, null, 2));
if (report.errors.length) process.exitCode = 1;
