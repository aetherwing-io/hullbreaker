#!/usr/bin/env node

/* Fast visual acceptance for Scatterbloom's five-pellet sentence.
 *
 * One cold production boot per aspect stages the real RIG, one reviewed
 * Crosswind wasp, and one real fireWeapon('S') trigger. The five sim pellets
 * advance through updateBullets before the page freezes, so the screenshot
 * judges the production atlas, camera, wake, spread, and hostile scale in one
 * frame without a long traversal replay. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.SCATTERBLOOM_OUT ||
  '/private/tmp/hullbreaker-scatterbloom-clarity';
mkdirSync(OUT, { recursive: true });

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  const report = {
    ok: false,
    baseUrl,
    browser: { channel: launch.channel, via: launch.via },
    layouts: {},
    faults: [],
  };

  for (const layout of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'portrait', width: 390, height: 844 },
  ]) {
    const owned = await newPage({
      viewport: { width: layout.width, height: layout.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    page.on('pageerror', (error) =>
      report.faults.push(`${layout.name} pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        report.faults.push(`${layout.name} ${message.type()}: ${message.text()}`);
    });

    try {
      await page.goto(
        `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far&enemies=0` +
        `&scatterproof=${Date.now()}`,
        { waitUntil: 'load', timeout: 15000 },
      );
      await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
        typeof window.__HB_BULLET_TRAITS === 'function' &&
        typeof window.__HB_ENEMY_ECOLOGY_VISUAL === 'function', null,
      { timeout: 15000 });

      const staged = await page.evaluate(async ({ compact }) => {
        const [H, P, L, B, T, C, ST, W, Cam] = await Promise.all([
          import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
          import('/src/sim/level.js'), import('/src/sim/bridge.js'),
          import('/src/sim/time.js'), import('/src/config.js'),
          import('/src/sim/state.js'), import('/src/sim/weapons.js'),
          import('/src/render/camera.js'),
        ]);
        ST.setState('PAUSED');
        H.clearHostiles();
        W.clearBullets();
        document.getElementById('overlay').style.display = 'none';

        const scroll = 0;
        T.setScrollX(scroll);
        const playerX = 8;
        const deck = L.groundTopAt(playerX);
        if (!(deck > -100)) throw new Error(`no fixture deck at ${playerX}`);
        Object.assign(P.player, {
          x: playerX, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
          facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
          iframesUntil: Number.MAX_SAFE_INTEGER,
        });
        P.player.aim.set(1, 0);
        Cam.syncCamera();
        B.view.player.sync();

        const waspX = playerX + (compact ? 5.0 : 7.0);
        H.spawnHostile(waspX, deck + 5.4, 0, 'wasp', {
          id: `qa-scatter-crosswind-${compact ? 'p' : 'd'}`,
          ecologyId: 'wasp-crosswind', encounterKey: 'qa:scatterbloom',
          gating: false, dir: -1,
        });
        const wasp = H.hostiles.at(-1);
        wasp.enterUntil = T.gameMs - 1;
        wasp.state = 'cruise';
        wasp.stateUntil = Infinity;
        wasp.formationReady = true;
        wasp.vx = 0;
        wasp.vy = 0;
        B.view.hostiles.sync(wasp);

        // One real trigger owns exactly five real sim rows. Start above the
        // deck so the lower fan member remains airborne during the brief
        // evidence advance; the wasp is deliberately beyond/above the fan.
        W.fireWeapon('S', playerX + 0.55, deck + 2.8, 1, 0, true);
        W.updateBullets(0.105);
        const pellets = W.bulletPool.filter((row) => row.alive);
        return {
          state: ST.state,
          player: { x: P.player.x, y: P.player.y },
          wasp: { id: wasp.id, x: wasp.x, y: wasp.y,
            ecologyId: wasp.ecologyId },
          pellets: pellets.map((row) => ({
            type: row.type, x: row.x, y: row.y,
            vx: row.vx, vy: row.vy, damage: row.damage,
          })),
          projectileVisual: window.__HB_BULLET_TRAITS(),
          ecologyVisual: window.__HB_ENEMY_ECOLOGY_VISUAL(),
          config: {
            count: C.CONFIG.weapons.S.count,
            damage: C.CONFIG.weapons.S.damage,
            speed: C.CONFIG.weapons.S.speed,
          },
        };
      }, { compact: layout.width < 600 });

      await page.evaluate(() => new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))));
      assert.equal(staged.state, 'PAUSED', `${layout.name}: exact evidence frame frozen`);
      assert.equal(staged.pellets.length, 5, `${layout.name}: one trigger owns five pellets`);
      assert.ok(staged.pellets.every((row) => row.type === 'S'),
        `${layout.name}: every live row is Scatterbloom`);
      assert.equal(staged.projectileVisual.projectileArt.state, 'ready',
        `${layout.name}: production projectile atlas resident`);
      assert.equal(staged.projectileVisual.projectileArt.paintedVisible, true,
        `${layout.name}: painted chassis selected`);
      assert.equal(staged.projectileVisual.liveSlots, 5,
        `${layout.name}: five painted projectile slots visible`);
      const waspVisual = staged.ecologyVisual.rows.find((row) =>
        row.id === staged.wasp.id);
      assert.equal(waspVisual?.bodyVisible, true,
        `${layout.name}: comparison wasp visible`);
      assert.equal(staged.config.count, 5, `${layout.name}: sim spread count unchanged`);
      assert.equal(staged.config.damage, 1, `${layout.name}: sim damage unchanged`);
      assert.equal(staged.config.speed, 23, `${layout.name}: sim speed unchanged`);

      const screenshot = resolve(OUT, `${layout.name}-one-wasp-five-flechettes.png`);
      await page.screenshot({ path: screenshot });
      report.layouts[layout.name] = {
        viewport: { width: layout.width, height: layout.height },
        screenshot,
        ...staged,
        waspVisual,
      };
    } finally {
      await owned.close();
    }
  }
  assert.deepEqual(report.faults, [], 'capture emitted no warnings/errors/page faults');
  report.ok = true;
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    out: OUT,
    desktop: {
      screenshot: report.layouts.desktop.screenshot,
      pellets: report.layouts.desktop.pellets.length,
      wasp: report.layouts.desktop.waspVisual?.ecologyId,
      art: report.layouts.desktop.projectileVisual.projectileArt.state,
    },
    portrait: {
      screenshot: report.layouts.portrait.screenshot,
      pellets: report.layouts.portrait.pellets.length,
      wasp: report.layouts.portrait.waspVisual?.ecologyId,
      art: report.layouts.portrait.projectileVisual.projectileArt.state,
    },
    faults: report.faults,
  }, null, 2));
});
