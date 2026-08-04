#!/usr/bin/env node
/* Current-production proof for the Meridian foreground component rebuild.
   Five deliberate poses cover face 1, the middle climb, a live corner turn,
   the Crown approach and portrait gameplay. They use the real six-face level,
   build-prefix ownership, camera, materials and post stack in one isolated
   headless Chrome. No traversal fixture or visible/user browser is touched. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-foreground-kit');
await mkdir(out, { recursive: true });

const variants = [{ id: 'current-production', query: '' }];
const moments = [
  { id: 'desktop-face1', viewport: { width: 1440, height: 900 }, scroll: 44, corners: 0 },
  { id: 'desktop-turn1', viewport: { width: 1440, height: 900 }, scroll: 89, corners: 0, turnMs: 550 },
  { id: 'desktop-mid', viewport: { width: 1440, height: 900 }, scroll: 174, corners: 2 },
  { id: 'desktop-crown', viewport: { width: 1440, height: 900 }, scroll: 382, corners: 5 },
  { id: 'portrait-face1', viewport: { width: 390, height: 844 }, scroll: 44, corners: 0 },
];

const report = {
  browser: null,
  workflow: 'one isolated headless Chrome, ephemeral server, fresh context per matched pose',
  comparison: 'fresh current-production captures only; no stale A/B fixture',
  captures: [],
  errors: [],
};

await withIsolatedBrowser(root, async ({ baseUrl, launch, newPage }) => {
  report.browser = { channel: launch.channel, via: launch.via };
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
    try {
      const url = `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far` +
        `${variant.query}&foregroundqa=${Date.now()}`;
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, {
        timeout: 20000,
      });
      await page.evaluate(async ({ scroll, corners, turnMs, portrait, playerX, playerY }) => {
        const [W, T, C, B, H, M] = await Promise.all([
          import('/src/sim/wavegate.js'), import('/src/sim/time.js'),
          import('/src/render/camera.js'), import('/src/sim/bridge.js'),
          import('/src/sim/hostiles.js'), import('/src/sim/mods.js'),
        ]);
        H.clearHostiles();
        M.clearMods();
        for (let i = 0; i < corners; i++) W.finishCorner(W.cornerEvents[i]);
        if (turnMs != null) {
          const corner = W.cornerEvents[corners];
          corner.state = 'turning';
          corner.tStart = T.gameMs - turnMs;
        }
        T.setScrollX(scroll);
        HB.player.x = playerX ?? (scroll + (portrait ? 1.0 : 3.0));
        const col = Math.max(0, Math.min(
          HB.levelData.groundH.length - 1, Math.floor(HB.player.x),
        ));
        HB.player.y = playerY ?? HB.levelData.groundH[col];
        HB.player.hp = 3;
        HB.player.lives = 3;
        HB.player.iframesUntil = 1e9;
        C.syncCamera();
        B.view.player.sync();
        dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      }, {
        scroll: moment.scroll,
        corners: moment.corners,
        turnMs: moment.turnMs ?? null,
        portrait: moment.viewport.width < 600,
        playerX: moment.playerX ?? null,
        playerY: moment.playerY ?? null,
      });
      await page.addStyleTag({ content: '#overlay { display: none !important; }' });
      await page.waitForTimeout(400);
      const runtime = await page.evaluate(async () => {
        const [S, L, R, T, C] = await Promise.all([
          import('/src/render/scene.js'), import('/src/render/seams.js'),
          import('/src/render/route-visibility.js'), import('/src/sim/time.js'),
          import('/src/config.js'),
        ]);
        const faceTiles = C.CONFIG.path.faceTiles;
        return {
          world: globalThis.__HB_WORLD?.(),
          art: globalThis.__HB_WORLD_DETAIL_ART?.(),
          components: globalThis.__HB_FOREGROUND_COMPONENT_ART?.(),
          componentCatalog: globalThis.__HB_FOREGROUND_COMPONENT_CATALOG?.(),
          responseSockets: globalThis.__HB_FOREGROUND_RESPONSE_SOCKETS?.(),
          seams: L.seamsStats(),
          visibility: {
            scroll: T.scrollX,
            facet: R.currentWorldFacet(),
            current: R.routeRenderable(T.scrollX + 3),
            nextFace: R.routeRenderable(T.scrollX + faceTiles),
            twoFacesAhead: R.routeRenderable(T.scrollX + faceTiles * 2),
          },
          render: { ...S.renderer.info.render },
          resources: S.rendererResourceSnapshot(),
          state: HB.state(),
        };
      });
      const file = resolve(out, `${id}.png`);
      await page.screenshot({ path: file });
      report.captures.push({
        id, variant: variant.id, moment: moment.id,
        viewport: moment.viewport, file, runtime,
      });
    } finally {
      await owned.close();
    }
  }
});

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  browser: report.browser,
  workflow: report.workflow,
  captures: report.captures.map((row) => ({
    id: row.id,
    file: row.file,
    art: row.runtime.art?.state,
    componentArt: row.runtime.components?.state,
    componentPlacements: row.runtime.world?.componentPlacements,
    componentUnique: row.runtime.world?.componentUnique,
    responseSockets: row.runtime.responseSockets?.length,
    fixtureArt: row.runtime.world?.detailVisible,
    visibility: row.runtime.visibility,
    housedLights: row.runtime.seams?.fixtureCount,
    calls: row.runtime.render?.calls,
    triangles: row.runtime.render?.triangles,
    textures: row.runtime.resources?.memory?.textures,
  })),
  errors: report.errors,
}, null, 2));
if (report.errors.length) process.exitCode = 1;
