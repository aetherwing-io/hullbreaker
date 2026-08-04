#!/usr/bin/env node

/* Production FAR proof for world reliquaries and the weapon recovery reveal.
 * Staging uses real spawnCapsule(), rolled immutable gun recipes, the render
 * bridge, and the shipped DOM reveal. No proof-only visual is introduced. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.CAPSULE_RECOVERY_OUT ||
  '/private/tmp/hullbreaker-capsule-recovery';
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
        `&capsulerecovery=${Date.now()}`,
        { waitUntil: 'load', timeout: 15000 },
      );
      await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
        typeof window.__HB_CAPSULE_ART === 'function' &&
        typeof window.__HB_LOOT_REVEAL === 'function', null,
      { timeout: 15000 });

      // Let boot/weather transients retire before pausing the evidence frame.
      // Pausing during a lightning/exposure beat would freeze that unrelated
      // full-screen veil forever and make a quiet pickup impossible to judge.
      await page.waitForTimeout(1200);

      // First freeze a reward exactly where the production generator placed
      // it: face-one pocket shelf, real fixed mode, real surrounding route.
      // The later 4x2 gallery is only a variant comparison instrument.
      const natural = await page.evaluate(async () => {
        const [C, P, L, B, T, ST, Cam, CFG] = await Promise.all([
          import('/src/sim/capsules.js'), import('/src/sim/player.js'),
          import('/src/sim/level.js'), import('/src/sim/bridge.js'),
          import('/src/sim/time.js'), import('/src/sim/state.js'),
          import('/src/render/camera.js'), import('/src/config.js'),
        ]);
        ST.setState('PAUSED');
        document.getElementById('overlay').style.display = 'none';
        const reward = C.capsules.find((c) => c.mode === 'fixed');
        if (!reward) throw new Error('No production fixed reward found');
        const playerX = reward.x - 3.0;
        const deck = L.groundTopAt(playerX);
        T.setScrollX(Math.max(0, reward.x - CFG.CONFIG.camera.lookX));
        Object.assign(P.player, {
          x: playerX, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
          facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
          iframesUntil: Number.MAX_SAFE_INTEGER,
        });
        P.player.aim.set(1, 0);
        Cam.syncCamera();
        B.view.player.sync();
        for (const c of C.capsules) B.view.capsules.sync(c);
        return {
          reward: {
            kind: reward.kind, letter: reward.letter, mode: reward.mode,
            x: reward.x, y: reward.y,
          },
          player: { x: P.player.x, y: P.player.y },
          world: window.__HB_CAPSULE_ART(),
        };
      });
      await page.evaluate(() => new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))));
      const encounterScreenshot = resolve(OUT, `${layout.name}-natural-encounter.png`);
      await page.screenshot({ path: encounterScreenshot });
      assert.equal(natural.reward.mode, 'fixed',
        `${layout.name}: natural proof retains generator-authored fixed mode`);
      assert.ok(Math.abs(natural.reward.x - natural.player.x) >= 2.3,
        `${layout.name}: natural proof does not collect the staged reward`);

      const staged = await page.evaluate(async ({ compact }) => {
        const [C, P, L, B, T, ST, G, W, Cam] = await Promise.all([
          import('/src/sim/capsules.js'), import('/src/sim/player.js'),
          import('/src/sim/level.js'), import('/src/sim/bridge.js'),
          import('/src/sim/time.js'), import('/src/sim/state.js'),
          import('/src/pure/gunroll.js'), import('/src/sim/weapons.js'),
          import('/src/render/camera.js'),
        ]);
        ST.setState('PAUSED');
        while (C.capsules.length) C.removeCapsule(C.capsules.length - 1);
        document.getElementById('overlay').style.display = 'none';
        T.setScrollX(0);
        const startX = compact ? 6.2 : 6.8;
        const deck = L.groundTopAt(startX);
        Object.assign(P.player, {
          x: startX - 2.0, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
          facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
          iframesUntil: Number.MAX_SAFE_INTEGER,
        });
        P.player.aim.set(1, 0);
        Cam.syncCamera();
        B.view.player.sync();

        const weaponRows = [
          ['S', 0.18, 'qa-cap-s'], ['L', 0.45, 'qa-cap-l'],
          ['H', 0.72, 'qa-cap-h'], ['F', 0.96, 'qa-cap-f'],
        ];
        const xGap = compact ? 2.75 : 3.25;
        for (let i = 0; i < weaponRows.length; i++) {
          const [letter, progress, seed] = weaponRows[i];
          const x = startX + i * xGap;
          const gun = G.rollGun(letter, progress, seed);
          const c = C.spawnCapsule('letter', letter, x, deck + 2.15,
            'fixed', 0, gun);
          c.t = 0.35 + i * 0.28;
          B.view.capsules.sync(c);
        }
        for (let i = 0; i < 4; i++) {
          const letter = ['RG', 'GS', 'CH', 'OL'][i];
          const x = startX + i * xGap;
          const c = C.spawnCapsule('mod', letter, x, deck + 5.10,
            'fixed', 0);
          c.t = 0.62 + i * 0.31;
          B.view.capsules.sync(c);
        }

        // The recovery proof uses a real tier-three recipe and compiler.
        const recoveryGun = G.rollGun('F', 0.98, 'qa-recovery-apex');
        const recoveryDef = G.compileGunDef(recoveryGun, W.weaponDef('F'));
        return {
          state: ST.state,
          world: window.__HB_CAPSULE_ART(),
          recoveryGun,
          recoveryDef,
        };
      }, { compact: layout.width < 600 });

      await page.evaluate(() => new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))));
      const worldScreenshot = resolve(OUT, `${layout.name}-world-reliquaries.png`);
      await page.screenshot({ path: worldScreenshot });

      const recovery = await page.evaluate(({ gun, def }) => {
        const bridge = window.__HB_TEST__?.bridge;
        document.getElementById('overlay').dataset.state = 'playing';
        // Test API versions differ; the installed bridge remains available
        // through a direct module import in the fallback below.
        return import('/src/sim/bridge.js').then((B) => {
          (bridge?.view || B.view).loot.acquired(gun, def, { recatch: true });
          return true;
        });
      }, { gun: staged.recoveryGun, def: staged.recoveryDef });
      assert.equal(recovery, true, `${layout.name}: recovery reveal invoked`);
      await page.waitForTimeout(420);
      const recoverySnapshot = await page.evaluate(() => window.__HB_LOOT_REVEAL());
      const recoveryScreenshot = resolve(OUT, `${layout.name}-weapon-recovered.png`);
      await page.screenshot({ path: recoveryScreenshot });

      assert.equal(staged.state, 'PAUSED', `${layout.name}: evidence frame frozen`);
      assert.equal(staged.world.atlas.enabled, true, `${layout.name}: capsule atlas enabled`);
      assert.equal(staged.world.live.production, 8,
        `${layout.name}: eight production reliquaries visible`);
      assert.equal(staged.world.live.fallback, 0,
        `${layout.name}: no fallback box visible`);
      assert.equal(staged.world.presentation.rigidScale, true,
        `${layout.name}: world pickups retain rigid envelope`);
      assert.equal(recoverySnapshot.active, true,
        `${layout.name}: recovery card is visibly active`);
      assert.equal(recoverySnapshot.last.recatch, true,
        `${layout.name}: copy identifies weapon recovery`);

      report.layouts[layout.name] = {
        viewport: { width: layout.width, height: layout.height },
        encounterScreenshot,
        worldScreenshot,
        recoveryScreenshot,
        natural,
        world: staged.world,
        recovery: recoverySnapshot,
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
    desktop: report.layouts.desktop,
    portrait: report.layouts.portrait,
    faults: report.faults,
  }, null, 2));
});
