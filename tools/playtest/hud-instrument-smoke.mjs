#!/usr/bin/env node
// Browser-level contract for the compact live instrument. This checks the
// player-facing DOM against the same sim getters in one page evaluation, so a
// pretty but stale meter cannot pass. Screenshots land in /private/tmp for
// quick desktop/phone review without adding generated evidence to the repo.

import { withIsolatedBrowser } from './lib/isolated-browser.mjs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = '/private/tmp/hullbreaker-hud-instrument';
const VIEWS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'landscape', viewport: { width: 844, height: 390 }, mobile: true },
  {
    name: 'notched-landscape', viewport: { width: 844, height: 390 }, mobile: true,
    safe: { top: 0, right: 47, bottom: 21, left: 47 },
  },
  { name: 'portrait', viewport: { width: 390, height: 844 }, mobile: true },
];

let failed = false;
const fail = (message) => { failed = true; console.error(`FAIL: ${message}`); };
const overlaps = (a, b) =>
  !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
  for (const view of VIEWS) {
    const owned = await newPage({
      viewport: view.viewport,
      deviceScaleFactor: view.mobile ? 2 : 1,
      isMobile: !!view.mobile,
      hasTouch: !!view.mobile,
    });
    const { page } = owned;
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await page.goto(
        `${baseUrl}/index.html?testapi=1&shell=0&audio=0&juice=0${view.mobile ? '&touch=1' : ''}`,
        { waitUntil: 'load', timeout: 30000 },
      );
      if (view.safe) {
        await page.evaluate((safe) => {
          for (const [edge, px] of Object.entries(safe))
            document.documentElement.style.setProperty(`--hud-safe-${edge}`, `${px}px`);
        }, view.safe);
      }
      await page.waitForFunction(() => !!globalThis.HB, null, { timeout: 15000 });
      const bootState = await page.evaluate(() => HB.state());
      if (bootState === 'MENU') await page.keyboard.press('Enter');
      else if (bootState !== 'PLAYING') await page.keyboard.press('r');
      await page.waitForFunction(() => globalThis.HB?.state() === 'PLAYING', null,
        { timeout: 5000 });

      // Write the real singleton state through existing sim APIs, force the
      // normal HUD reader once, and compare before rAF can advance either
      // meter. The visual layer never gets a test-only setter.
      const live = await page.evaluate(async () => {
        const [score, pace, hud] = await Promise.all([
          import('/src/sim/score.js'),
          import('/src/sim/pace.js'),
          import('/src/ui/hud.js'),
        ]);
        HB.player.hp = 2;
        HB.player.lives = 2;
        for (let i = 0; i < 8; i++) score.scoreKill('wasp', 'R', {
          grounded: false, x: 5, y: 5, vy: 1,
        });
        for (let i = 0; i < 80; i++) pace.updateMomentum(.1, {
          playerLeft: 90,
          edgeLeft: 0,
          edgeRight: 100,
          kills: i,
          hp: 2,
          lives: 2,
          nowMs: i * 100,
          held: false,
        });
        hud.updateHUD();

        const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
        const rig = document.getElementById('hudRigPanel');
        const run = document.getElementById('hudRunPanel');
        return {
          expected: {
            charge: Math.round(score.scoreCharge()),
            rush: Math.round(pace.momentumDrive() * 100),
          },
          shown: {
            charge: Number(rig.dataset.overdrive),
            chargeState: rig.dataset.overdriveState,
            rush: Number(run.dataset.rushValue),
            rushState: run.dataset.rush,
            hp: document.getElementById('hudHealthValue').textContent,
            lives: document.getElementById('hudLives').textContent,
            waveLabel: document.getElementById('hudMetricBLabel').textContent,
          },
          boxes: {
            rig: rect('hudRigPanel'),
            run: rect('hudRunPanel'),
            objective: rect('hudObjectivePanel'),
          },
        };
      });

      const { rig, run, objective } = live.boxes;
      const contained = run.left >= rig.left && run.right <= rig.right &&
        run.top >= rig.top && run.bottom <= rig.bottom;
      if (errors.length) fail(`${view.name}: browser errors: ${errors.join(' | ')}`);
      if (!contained) fail(`${view.name}: ascent strip escaped the RIG instrument`);
      if (overlaps(rig, objective)) fail(`${view.name}: RIG instrument overlaps objective`);
      if (view.safe && (rig.left < view.safe.left ||
          objective.right > view.viewport.width - view.safe.right)) {
        fail(`${view.name}: HUD escaped the synthetic safe area`);
      }
      if (live.shown.charge !== live.expected.charge)
        fail(`${view.name}: Overdrive ${live.shown.charge} != sim ${live.expected.charge}`);
      if (live.shown.rush !== live.expected.rush)
        fail(`${view.name}: Rush ${live.shown.rush} != sim ${live.expected.rush}`);
      if (live.shown.hp !== '2/3' || live.shown.lives !== '×2')
        fail(`${view.name}: HULL/lives did not mirror player state`);
      if (view.name === 'desktop' && live.shown.waveLabel !== 'WAVE')
        fail(`${view.name}: normal run does not expose the wave metric`);

      await page.screenshot({ path: `${OUT}-${view.name}.png` });
      console.log(`PASS: ${view.name} charge=${live.shown.charge}% ` +
        `rush=${live.shown.rush}% ${live.shown.rushState}`);
    } finally {
      await owned.close();
    }
  }
});

process.exit(failed ? 1 : 0);
