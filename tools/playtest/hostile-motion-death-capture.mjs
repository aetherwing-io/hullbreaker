#!/usr/bin/env node

/* Deterministic proof that a motion-atlas hostile dies in the exact pose it
 * was showing. Four hounds cover load/launch/air/land and four wasps cover the
 * complete flight cycle. The real renderer owns every body and corpse; the
 * harness only freezes sim rows, invokes the normal removal bridge, and reads
 * the renderer's structured proof surface before and after rupture. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';
const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.MOTION_DEATH_OUT || '/private/tmp/hullbreaker-motion-death';
mkdirSync(OUT, { recursive: true });

function exactFrames(rows, kind, wanted) {
  const got = rows.filter((row) => row.kind === kind)
    .map((row) => row.motionFrame ?? row.frame).sort((a, b) => a - b);
  assert.deepEqual(got, wanted, `${kind}: expected motion frames ${wanted}, got ${got}`);
}

function assertDeaths(snapshot, phase) {
  assert.equal(snapshot.active, 8, `${phase}: all eight corpses remain active`);
  exactFrames(snapshot.rows, 'hound', [4, 5, 6, 7]);
  exactFrames(snapshot.rows, 'wasp', [7, 7, 7, 7]);
  for (const row of snapshot.rows) {
    assert.equal(row.phase, phase, `${row.kind} frame ${row.motionFrame}: phase`);
    assert.equal(row.ruptureMode, 'frozen-motion',
      `${row.kind} frame ${row.motionFrame}: must keep its live atlas mesh`);
    assert.equal(row.paintedPieces, 0,
      `${row.kind} frame ${row.motionFrame}: no base-art fragment rig`);
    assert.equal(row.poseKey, row.kind === 'wasp' ? 'waspmod:7' : `motion:${row.motionFrame}`,
      `${row.kind} frame ${row.motionFrame}: pose identity`);
    assert.equal(row.facingPreserved, true,
      `${row.kind} frame ${row.motionFrame}: facing continuity`);
    assert.equal(row.posePreserved, true,
      `${row.kind} frame ${row.motionFrame}: geometry/texture/facing continuity`);
  }
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
  const owned = await newPage({ viewport: { width: 1440, height: 900 } });
  const { page } = owned;
  const faults = [];
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      faults.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(
    `${baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
    typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function' &&
    typeof window.__HB_HOSTILE_DEATH_VISUAL === 'function', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');

  const live = await page.evaluate(async () => {
    const H = await import('/src/sim/hostiles.js');
    const P = await import('/src/sim/player.js');
    const B = await import('/src/sim/bridge.js');
    const R = await import('/src/render/hostiles.js');
    H.clearHostiles();
    R.clearCorpses();
    const px = P.player.x, py = P.player.y;
    const offsets = [-8.0, -4.2, 4.2, 8.0];
    for (let i = 0; i < 4; i++) {
      H.spawnHostile(px + offsets[i], py + 0.45, 0, 'hound', {
        dir: i % 2 ? -1 : 1, gating: false, id: `death-hound-${i}`,
      });
      H.spawnHostile(px + offsets[i], py + 4.0, 0, 'wasp', {
        dir: i % 2 ? 1 : -1, gating: false, id: `death-wasp-${i}`,
      });
    }
    const hounds = H.hostiles.filter((e) => e.kind === 'hound');
    const wasps = H.hostiles.filter((e) => e.kind === 'wasp');
    for (let i = 0; i < hounds.length; i++) {
      const e = hounds[i];
      e.enterUntil = 0; e.flashUntil = 0; e.stateUntil = Infinity;
      e.vx = 0; e.vy = 0;
      if (i === 0) e.state = 'tell';
      if (i === 1) { e.state = 'vault'; e.vy = 20; }
      if (i === 2) e.state = 'vault';
      if (i === 3) e.state = 'skid';
    }
    for (let i = 0; i < wasps.length; i++) {
      const e = wasps[i];
      e.enterUntil = 0; e.flashUntil = 0; e.state = 'cruise';
      e.stateUntil = Infinity; e.diveCdUntil = Infinity; e.vx = 0; e.vy = 0;
      // independent modular wing phase: floor(frac(t*3.25 + id*.173) * 8)
      e.t = (16 + (i + 0.2) / 8 - e.id * 0.173) / 3.25;
    }
    for (const e of H.hostiles) B.view.hostiles.sync(e);
    return window.__HB_HOSTILE_EVOLUTION_VISUAL();
  });

  exactFrames(live.motionRows, 'hound', [4, 5, 6, 7]);
  exactFrames(live.motionRows, 'wasp', [0, 0, 0, 0]);
  assert.deepEqual(live.waspModular.rows.map((row) => row.wingPhase).sort((a, b) => a - b),
    [0, 1, 2, 3], 'modular wasps cover four adjacent independent wing phases');
  for (const row of live.motionRows.filter((entry) => entry.kind === 'hound')) {
    assert.equal(row.atlasOwnsSilhouette, true,
      `hound frame ${row.frame}: v2 owns silhouette`);
    assert.ok(row.scale.every((value) => Math.abs(value - row.presentationScale) < 1e-4),
      `hound frame ${row.frame}: legacy non-uniform pose scale leaked into ${row.scale}`);
  }

  await page.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
  await page.screenshot({ path: `${OUT}/01-live-eight-motion-poses.png` });

  const impact = await page.evaluate(async () => {
    const H = await import('/src/sim/hostiles.js');
    for (let i = H.hostiles.length - 1; i >= 0; i--) H.removeHostile(i, true);
    return window.__HB_HOSTILE_DEATH_VISUAL();
  });
  assertDeaths(impact, 'impact');
  await page.screenshot({ path: `${OUT}/02-impact-same-motion-poses.png` });

  const startMs = await page.evaluate(() => window.HB.gameMs());
  await page.keyboard.press('Escape');
  await page.waitForFunction((start) => window.HB.gameMs() >= start + 150, startMs);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
  const rupture = await page.evaluate(() => window.__HB_HOSTILE_DEATH_VISUAL());
  assertDeaths(rupture, 'rupture');
  await page.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
  await page.screenshot({ path: `${OUT}/03-rupture-same-motion-paintings.png` });

  const ownFaults = faults.filter((fault) =>
    /pageerror|uncaught|referenceerror|typeerror|hound-gait|wasp-flight|webgl/i.test(fault));
  assert.deepEqual(ownFaults, [], `runtime faults: ${ownFaults.join(' | ')}`);
  const report = { ok: true, out: OUT, live: live.motionRows, impact, rupture, faults, ownFaults };
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    liveFrames: {
      hound: live.locomotion.hound.activeFrames,
      waspBody: live.waspModular.rows.map((row) => row.bodyState),
      waspWing: live.waspModular.rows.map((row) => row.wingPhase),
    },
    impactFrames: impact.rows.map((row) => `${row.kind}:${row.motionFrame}`),
    rupturePosePreserved: rupture.rows.filter((row) => row.posePreserved).length,
    activeDeathRigs: rupture.pool.activeRigs,
  }, null, 2));
  await owned.close();
});
