#!/usr/bin/env node

/* Production-context proof for the modular wasp. This deliberately avoids the
   old brown traversal fixture: every frame is the real six-face Level 1 with
   current Meridian component/foreground art, route visibility and camera. */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'artifacts/wasp-modular-v2/production');
await mkdir(OUT, { recursive: true });

const moments = [
  { id: 'desktop-face1', viewport: { width: 1440, height: 900 }, scroll: 44, corners: 0 },
  { id: 'desktop-mid', viewport: { width: 1440, height: 900 }, scroll: 174, corners: 2,
    death: true },
  { id: 'portrait-face1', viewport: { width: 390, height: 844 }, scroll: 44, corners: 0 },
  { id: 'portrait-mid', viewport: { width: 390, height: 844 }, scroll: 174, corners: 2 },
];

const report = {
  ok: false,
  context: 'current-production six-face Level 1; old traversal fixture excluded',
  browser: null,
  captures: [],
  deaths: [],
  errors: [],
};

function assertProduction(runtime, id) {
  assert.equal(runtime.state, 'PAUSED', `${id}: exact frame frozen`);
  assert.equal(runtime.world?.enabled, true, `${id}: real six-face world enabled`);
  assert.equal(runtime.world?.packState, 'ready', `${id}: current 64-cell world pack ready`);
  assert.equal(runtime.world?.componentArtState, 'ready',
    `${id}: current foreground component art ready`);
  assert.ok(runtime.world?.componentPlacements > 0, `${id}: component detail placed`);
  assert.ok(runtime.world?.componentUnique >= 32, `${id}: broad component vocabulary visible`);
  assert.equal(runtime.components?.state, 'ready', `${id}: component atlas resident`);
  assert.equal(runtime.components?.gpuTextures, 1, `${id}: foreground atlas remains one texture`);
  const wasp = runtime.hostiles.waspModular;
  assert.equal(wasp.ready, true, `${id}: modular wasp ready`);
  assert.equal(wasp.combinations, 64, `${id}: 64 body/wing combinations`);
  assert.equal(wasp.liveBodies, 5, `${id}: five-state combat cluster`);
  assert.deepEqual(wasp.rows.map((row) => row.bodyState), [0, 3, 4, 5, 6],
    `${id}: cruise / dive tell / dive / hit / recover`);
  assert.ok(wasp.activeMinimumWingDepth > wasp.platformOuterDepth,
    `${id}: full assembly outside platform fascia`);
  for (const row of wasp.rows) {
    assert.equal(row.fullyOnActionPlane, true, `${id}:${row.id} platform overlap`);
    assert.equal(row.rootContinuity, true, `${id}:${row.id} root continuity`);
    assert.equal(row.mirroredAsAssembly, true, `${id}:${row.id} full-assembly mirror`);
    assert.equal(row.opacityMatched, true, `${id}:${row.id} no opacity strobe`);
  }
  assert.equal(wasp.rows[0].idleWingEmissive, 0, `${id}: idle wing bloom is off`);
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, launch, newPage }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  for (const moment of moments) {
    const owned = await newPage({
      viewport: moment.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    page.on('pageerror', (error) => report.errors.push(`${moment.id}: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push(`${moment.id}: console: ${message.text()}`);
    });
    try {
      const url = `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far` +
        `&enemies=0&waspmod=1&waspproductionqa=${Date.now()}`;
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING' &&
        typeof globalThis.__HB_HOSTILE_EVOLUTION_VISUAL === 'function', null,
      { timeout: 20000 });
      await page.evaluate(async ({ scroll, corners, portrait }) => {
        const [W, T, C, B, H, M, R] = await Promise.all([
          import('/src/sim/wavegate.js'), import('/src/sim/time.js'),
          import('/src/render/camera.js'), import('/src/sim/bridge.js'),
          import('/src/sim/hostiles.js'), import('/src/sim/mods.js'),
          import('/src/render/hostiles.js'),
        ]);
        H.clearHostiles();
        R.clearCorpses();
        M.clearMods();
        for (let i = 0; i < corners; i++) W.finishCorner(W.cornerEvents[i]);
        H.clearHostiles();
        T.setScrollX(scroll);
        HB.player.x = scroll + (portrait ? 1.0 : 3.0);
        const playerCol = Math.max(0, Math.min(HB.levelData.groundH.length - 1,
          Math.floor(HB.player.x)));
        HB.player.y = HB.levelData.groundH[playerCol];
        HB.player.hp = 3;
        HB.player.lives = 3;
        HB.player.iframesUntil = 1e9;
        C.syncCamera();
        B.view.player.sync();

        const offsets = portrait ? [-3.2, -1.6, 0, 1.6, 3.2] : [-7.0, -3.5, 0, 3.5, 7.0];
        for (let i = 0; i < offsets.length; i++) {
          const x = HB.player.x + offsets[i];
          const col = Math.max(0, Math.min(HB.levelData.groundH.length - 1, Math.floor(x)));
          const deck = HB.levelData.groundH[col];
          // The centre wasp overlaps the platform lip on purpose; presentation
          // depth, not a special harness z-offset, must keep all of it visible.
          const y = deck + (i === 2 ? 0.72 : 3.45 + (i % 2) * 0.65);
          H.spawnHostile(x, y, 0, 'wasp', {
            dir: i % 2 ? -1 : 1, gating: false,
            id: `production-wasp-${portrait ? 'p' : 'd'}-${scroll}-${i}`,
          });
        }
        const wasps = H.hostiles.filter((row) => row.kind === 'wasp');
        for (let i = 0; i < wasps.length; i++) {
          const e = wasps[i];
          e.enterUntil = 0; e.flashUntil = 0; e.stateUntil = Infinity;
          e.diveCdUntil = Infinity; e.staggerUntil = 0;
          e.vx = i % 2 ? -5.8 : 5.8; e.vy = -4.4;
          e.t = (30 + (i + 0.2) / 8 - e.id * 0.173) / 3.25;
          if (i === 0) { e.state = 'cruise'; e.vx = 0; e.vy = 0; }
          if (i === 1) { e.state = 'dive'; e.lockUntil = Infinity; }
          if (i === 2) { e.state = 'dive'; e.lockUntil = 0; }
          if (i === 3) { e.state = 'cruise'; e.staggerUntil = Infinity; }
          if (i === 4) e.state = 'recover';
          B.view.hostiles.sync(e);
        }
        dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
      }, {
        scroll: moment.scroll,
        corners: moment.corners,
        portrait: moment.viewport.width < 600,
      });
      await page.waitForFunction(() => HB.state() === 'PAUSED');
      await page.addStyleTag({ content: '#overlay { display: none !important; }' });
      await page.waitForTimeout(400);

      const runtime = await page.evaluate(async () => {
        const [S, R] = await Promise.all([
          import('/src/render/scene.js'), import('/src/render/route-visibility.js'),
        ]);
        return {
          state: HB.state(),
          world: globalThis.__HB_WORLD?.(),
          components: globalThis.__HB_FOREGROUND_COMPONENT_ART?.(),
          hostiles: globalThis.__HB_HOSTILE_EVOLUTION_VISUAL?.(),
          currentFacet: R.currentWorldFacet(),
          render: { ...S.renderer.info.render },
          resources: S.rendererResourceSnapshot(),
        };
      });
      assertProduction(runtime, moment.id);
      const file = resolve(OUT, `${moment.id}-live.png`);
      await page.screenshot({ path: file });
      report.captures.push({ id: moment.id, file, viewport: moment.viewport,
        scroll: moment.scroll, corners: moment.corners, runtime });

      if (moment.death) {
        const impact = await page.evaluate(async () => {
          const H = await import('/src/sim/hostiles.js');
          H.removeHostile(2, true);
          return globalThis.__HB_HOSTILE_DEATH_VISUAL?.();
        });
        assert.equal(impact.active, 1, 'production death: one actual removed hostile');
        assert.equal(impact.rows[0].poseKey, 'waspmod:7', 'production death: crack body');
        assert.equal(impact.rows[0].wingBankDetached, true, 'production death: wing shear');
        assert.equal(impact.rows[0].spiral, false, 'production death: no spiral');
        const impactFile = resolve(OUT, `${moment.id}-death-impact.png`);
        await page.screenshot({ path: impactFile });

        const start = await page.evaluate(() => HB.gameMs());
        await page.keyboard.press('Escape');
        await page.waitForFunction((t0) => HB.gameMs() >= t0 + 165, start);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => HB.state() === 'PAUSED');
        const rupture = await page.evaluate(() => globalThis.__HB_HOSTILE_DEATH_VISUAL?.());
        assert.equal(rupture.active, 1, 'production rupture remains visible');
        assert.equal(rupture.rows[0].deathCrack, true, 'production rupture keeps crack body');
        assert.equal(rupture.rows[0].posePreserved, true, 'production rupture pose continuity');
        assert.equal(rupture.rows[0].spiral, false, 'production rupture remains non-spiral');
        const ruptureFile = resolve(OUT, `${moment.id}-death-rupture.png`);
        await page.screenshot({ path: ruptureFile });
        report.deaths.push({ id: moment.id, impactFile, ruptureFile, impact, rupture });
      }
    } finally {
      await owned.close();
    }
  }
});

report.ok = report.errors.length === 0;
await writeFile(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  ok: report.ok,
  context: report.context,
  browser: report.browser,
  captures: report.captures.map((row) => ({
    id: row.id,
    file: row.file,
    componentArt: row.runtime.components?.state,
    componentPlacements: row.runtime.world?.componentPlacements,
    bodyStates: row.runtime.hostiles?.waspModular?.rows.map((entry) => entry.bodyState),
    wingPhases: row.runtime.hostiles?.waspModular?.rows.map((entry) => entry.wingPhase),
    fullActionPlane: row.runtime.hostiles?.waspModular?.rows.every(
      (entry) => entry.fullyOnActionPlane),
    calls: row.runtime.render?.calls,
    textures: row.runtime.resources?.memory?.textures,
  })),
  deaths: report.deaths.map((row) => ({
    id: row.id, impact: row.impactFile, rupture: row.ruptureFile,
    poseKey: row.rupture.rows[0].poseKey, noSpiral: !row.rupture.rows[0].spiral,
  })),
  errors: report.errors,
}, null, 2));
if (!report.ok) process.exitCode = 1;
