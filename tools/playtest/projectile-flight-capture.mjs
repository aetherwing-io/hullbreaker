#!/usr/bin/env node

/* Production-scale proof for all five player projectile families.
 *
 * Each viewport boots the ordinary game, freezes the outer loop, then uses
 * fireWeapon() + updateBullets() to stage real live rows.  Several short
 * updates populate the renderer's fixed history pools; no screenshot-only
 * mesh or texture is introduced.  Cindermouth is shown both airborne and in
 * its authored deck-fire state so the old rigid floor-slide failure is easy
 * to reject at shipped FAR scale. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.PROJECTILE_FLIGHT_OUT ||
  '/private/tmp/hullbreaker-projectile-flight';
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
        `&projectileflight=${Date.now()}`,
        { waitUntil: 'load', timeout: 15000 },
      );
      await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
        typeof window.__HB_BULLET_TRAITS === 'function', null,
      { timeout: 15000 });

      const staged = await page.evaluate(async () => {
        const [H, P, L, B, T, ST, W, Cam, FX] = await Promise.all([
          import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
          import('/src/sim/level.js'), import('/src/sim/bridge.js'),
          import('/src/sim/time.js'), import('/src/sim/state.js'),
          import('/src/sim/weapons.js'), import('/src/render/camera.js'),
          import('/src/render/fx.js'),
        ]);
        ST.setState('PAUSED');
        H.clearHostiles();
        W.clearBullets();
        document.getElementById('overlay').style.display = 'none';

        T.setScrollX(0);
        const x = 6.2;
        const deck = L.groundTopAt(x);
        if (!(deck > -100)) throw new Error(`no fixture deck at ${x}`);
        Object.assign(P.player, {
          x: x - 1.1, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
          facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
          iframesUntil: Number.MAX_SAFE_INTEGER,
        });
        P.player.aim.set(1, 0);
        Cam.syncCamera();
        B.view.player.sync();

        // Five separated production fire paths. Scatterbloom and Hunger own
        // their real multi-shot counts; the high target makes Hunger curve
        // without entering another family's line.
        H.spawnHostile(x + 10.5, deck + 9.1, 0, 'hound', {
          id: 'qa-projectile-seeker-target', gating: false, dir: -1,
        });
        const target = H.hostiles.at(-1);
        target.enterUntil = T.gameMs - 1;
        target.hp = 999;
        target.vx = 0;
        target.vy = 0;
        B.view.hostiles.sync(target);

        W.fireWeapon('R', x, deck + 2.25, 1, 0.02, true);
        W.fireWeapon('S', x, deck + 3.75, 1, 0, true);
        W.fireWeapon('L', x, deck + 5.30, 1, 0.015, true);
        W.fireWeapon('H', x, deck + 6.85, 1, 0.08, true);
        // One airborne furnace and one deliberately steep contact become the
        // two distinct authored states, never one rigid body sliding on deck.
        W.fireWeapon('F', x, deck + 8.45, 1, -0.08, true);
        W.fireWeapon('F', x + 0.55, deck + 1.25, 1, -0.72, true);

        for (let frame = 0; frame < 7; frame++) W.updateBullets(0.026);
        // Advance the clocks explicitly while the outer loop is frozen. A
        // wall-clock sleep cannot retire game-time FX in PAUSED state; that
        // mistake previously froze the 82ms white ignition flash over the
        // acceptance frame. This is now provably post-ignition live time.
        const ignitionAtGameMs = T.gameMs;
        T.advanceGameMs(140);
        FX.updateFx(140);

        const rows = W.bulletPool.filter((row) => row.alive);
        const byType = {};
        for (const row of rows) byType[row.type] = (byType[row.type] || 0) + 1;
        const crawling = rows.filter((row) => row.type === 'F' && row.crawling).length;
        const airborneF = rows.filter((row) => row.type === 'F' && !row.crawling).length;
        return {
          state: ST.state,
          rows: rows.map((row) => ({
            type: row.type, x: row.x, y: row.y, vx: row.vx, vy: row.vy,
            crawling: row.crawling,
          })),
          byType,
          crawling,
          airborneF,
          ignitionAtGameMs,
          capturedAtGameMs: T.gameMs,
          postIgnitionAgeMs: T.gameMs - ignitionAtGameMs,
          visual: window.__HB_BULLET_TRAITS(),
        };
      });

      await page.evaluate(() => new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))));
      assert.equal(staged.state, 'PAUSED', `${layout.name}: evidence frame frozen`);
      for (const type of ['R', 'S', 'L', 'H', 'F'])
        assert.ok(staged.byType[type] >= 1, `${layout.name}: ${type} remains live`);
      assert.ok(staged.crawling >= 1, `${layout.name}: Cindermouth deck-fire live`);
      assert.ok(staged.airborneF >= 1, `${layout.name}: Cindermouth airborne live`);
      assert.ok(staged.postIgnitionAgeMs >= 140,
        `${layout.name}: acceptance frame is beyond the 82ms ignition flash`);
      assert.equal(staged.visual.projectileArt.state, 'ready',
        `${layout.name}: production projectile atlas resident`);
      assert.equal(staged.visual.projectileArt.paintedVisible, true,
        `${layout.name}: production painted chassis selected`);
      assert.equal(staged.visual.groundFire.paintedWave, true,
        `${layout.name}: deck fire selects the painted wave cell`);
      assert.equal(staged.visual.groundFire.airborneChassisRetired, true,
        `${layout.name}: no rigid airborne chassis survives deck ignition`);
      assert.equal(staged.visual.groundFire.whollyBehindPoint, true,
        `${layout.name}: painted wave trails the exact live sim point`);

      const screenshot = resolve(OUT, `${layout.name}-all-families.png`);
      await page.screenshot({ path: screenshot });
      report.layouts[layout.name] = { screenshot, ...staged };
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
    desktop: report.layouts.desktop.screenshot,
    portrait: report.layouts.portrait.screenshot,
    families: report.layouts.desktop.byType,
    cindermouth: {
      airborne: report.layouts.desktop.airborneF,
      deckFire: report.layouts.desktop.crawling,
    },
    faults: report.faults,
  }, null, 2));
});
