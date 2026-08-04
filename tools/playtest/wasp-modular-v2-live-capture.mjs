#!/usr/bin/env node

/* Short, isolated proof of the production modular wasp in the real renderer.
   The harness freezes existing sim rows; it never substitutes a viewer or
   changes collision/tell timing. One browser is reused, then always closed. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

// Keep the already-approved short capture entry point useful for the current
// six-face production proof without broadening the browser command surface.
if (process.argv.includes('--production')) {
  await import('./wasp-modular-v2-production-capture.mjs');
  process.exit(process.exitCode || 0);
}

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.WASP_MODULAR_OUT ||
  resolve(ROOT, 'artifacts/wasp-modular-v2/live');
mkdirSync(OUT, { recursive: true });
const faults = [];
const runs = [];

function assertLive(snapshot, label) {
  const modular = snapshot.waspModular;
  assert.equal(modular.ready, true, `${label}: compact modular atlas ready`);
  assert.equal(modular.bodyStates, 8, `${label}: eight body states`);
  assert.equal(modular.wingPhases, 8, `${label}: eight wing phases`);
  assert.equal(modular.combinations, 64, `${label}: 64 combinations`);
  assert.equal(modular.textureCount, 1, `${label}: one resident texture`);
  assert.equal(modular.drawCallsPerWasp, 2, `${label}: body + wing only`);
  assert.equal(modular.crossfade, false, `${label}: no opacity crossfade`);
  assert.equal(modular.opacityStrobe, false, `${label}: no opacity strobe`);
  assert.equal(modular.idleWingBloom, false, `${label}: no idle wing bloom`);
  assert.ok(modular.activeMinimumWingDepth > modular.platformOuterDepth,
    `${label}: whole assembly remains outside platform fascia`);
  assert.deepEqual(modular.rows.map((row) => row.bodyState), [0, 3, 4, 5, 6],
    `${label}: idle / tell / attack / recoil / recovery silhouettes`);
  for (const row of modular.rows) {
    assert.equal(row.fullyOnActionPlane, true, `${label}:${row.id} action plane`);
    assert.equal(row.rootContinuity, true, `${label}:${row.id} body/wing root`);
    assert.equal(row.mirroredAsAssembly, true, `${label}:${row.id} full mirror`);
    assert.equal(row.opacityMatched, true, `${label}:${row.id} opacity constant`);
  }
  assert.equal(modular.rows[0].idleWingEmissive, 0,
    `${label}: idle wing material has no bloom energy`);
}

function assertDeath(snapshot, label) {
  assert.equal(snapshot.active, 5, `${label}: five wasp corpses active`);
  for (const row of snapshot.rows) {
    assert.equal(row.kind, 'wasp', `${label}: only wasps in proof`);
    assert.equal(row.poseKey, 'waspmod:7', `${label}: authored death crack selected`);
    assert.equal(row.motionFrame, 7, `${label}: terminal body state`);
    assert.equal(row.deathCrack, true, `${label}: terminal chassis visible`);
    assert.equal(row.wingBankDetached, true, `${label}: wing bank shears separately`);
    assert.equal(row.spiral, false, `${label}: no spiral removal`);
    assert.ok(row.boundedBodyTiltRad < Math.PI / 2, `${label}: bounded body tilt`);
    assert.ok(row.boundedWingTiltRad < Math.PI / 2, `${label}: bounded wing tilt`);
    assert.equal(row.posePreserved, true, `${label}: death pose/texture continuity`);
  }
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'portrait', width: 720, height: 1280 },
  ]) {
    const owned = await newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const { page } = owned;
    page.on('pageerror', (error) => faults.push(`${viewport.name}: pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        faults.push(`${viewport.name}: ${message.type()}: ${message.text()}`);
    });
    await page.goto(
      `${baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&waspmod=1`,
      { waitUntil: 'load' },
    );
    await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
      typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function' &&
      typeof window.__HB_HOSTILE_DEATH_VISUAL === 'function', { timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.HB.state() === 'PAUSED');

    const live = await page.evaluate(async ({ narrow }) => {
      const H = await import('/src/sim/hostiles.js');
      const P = await import('/src/sim/player.js');
      const B = await import('/src/sim/bridge.js');
      const R = await import('/src/render/hostiles.js');
      H.clearHostiles();
      R.clearCorpses();
      const px = P.player.x, py = P.player.y;
      const offsets = narrow ? [-4.4, -2.2, 0, 2.2, 4.4] : [-7.2, -3.6, 0, 3.6, 7.2];
      for (let i = 0; i < offsets.length; i++) {
        H.spawnHostile(px + offsets[i], py + (i === 2 ? 0.72 : 3.5 + (i % 2) * 0.55),
          0, 'wasp', { dir: i % 2 ? -1 : 1, gating: false,
            id: `modular-proof-${narrow ? 'p' : 'd'}-${i}` });
      }
      const wasps = H.hostiles.filter((row) => row.kind === 'wasp');
      for (let i = 0; i < wasps.length; i++) {
        const e = wasps[i];
        e.enterUntil = 0; e.flashUntil = 0; e.stateUntil = Infinity;
        e.diveCdUntil = Infinity; e.staggerUntil = 0;
        e.vx = i % 2 ? -5.8 : 5.8; e.vy = -4.4;
        e.t = (24 + (i + 0.2) / 8 - e.id * 0.173) / 3.25;
        if (i === 0) { e.state = 'cruise'; e.vx = 0; e.vy = 0; }
        if (i === 1) { e.state = 'dive'; e.lockUntil = Infinity; }
        if (i === 2) { e.state = 'dive'; e.lockUntil = 0; }
        if (i === 3) { e.state = 'cruise'; e.staggerUntil = Infinity; }
        if (i === 4) { e.state = 'recover'; }
        B.view.hostiles.sync(e);
      }
      document.getElementById('overlay').style.display = 'none';
      return window.__HB_HOSTILE_EVOLUTION_VISUAL();
    }, { narrow: viewport.name === 'portrait' });
    assertLive(live, viewport.name);
    await page.screenshot({ path: `${OUT}/01-${viewport.name}-live-combat.png` });

    const impact = await page.evaluate(async () => {
      const H = await import('/src/sim/hostiles.js');
      for (let i = H.hostiles.length - 1; i >= 0; i--) H.removeHostile(i, true);
      return window.__HB_HOSTILE_DEATH_VISUAL();
    });
    assertDeath(impact, `${viewport.name}-impact`);
    await page.screenshot({ path: `${OUT}/02-${viewport.name}-death-impact.png` });

    const startMs = await page.evaluate(() => window.HB.gameMs());
    await page.keyboard.press('Escape');
    await page.waitForFunction((start) => window.HB.gameMs() >= start + 165, startMs);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.HB.state() === 'PAUSED');
    const rupture = await page.evaluate(() => window.__HB_HOSTILE_DEATH_VISUAL());
    assertDeath(rupture, `${viewport.name}-rupture`);
    await page.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
    await page.screenshot({ path: `${OUT}/03-${viewport.name}-death-rupture.png` });
    runs.push({ viewport, live: live.waspModular, impact, rupture });
    await owned.close();
  }

  const ownFaults = faults.filter((fault) =>
    /pageerror|uncaught|referenceerror|typeerror|wasp-modular|waspmod|webgl/i.test(fault));
  assert.deepEqual(ownFaults, [], `runtime faults: ${ownFaults.join(' | ')}`);
  const report = { ok: true, out: OUT, launch, runs, faults, ownFaults };
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    viewports: runs.map((row) => row.viewport),
    liveStates: runs[0].live.rows.map((row) => row.bodyState),
    liveWingPhases: runs[0].live.rows.map((row) => row.wingPhase),
    minWingDepth: runs[0].live.activeMinimumWingDepth,
    platformDepth: runs[0].live.platformOuterDepth,
    deathPose: runs[0].impact.rows[0].poseKey,
    noSpiral: runs.every((run) => run.rupture.rows.every((row) => !row.spiral)),
    drawCallsPerWasp: runs[0].live.drawCallsPerWasp,
    gpuBytes: runs[0].live.estimatedGpuBytes,
    ownFaults,
  }, null, 2));
});
