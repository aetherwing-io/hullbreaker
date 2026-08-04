#!/usr/bin/env node

/* Fast final acceptance for reviewed enemy-ecology bodies.
 *
 * This deliberately avoids a route replay. A paused traversal fixture stages
 * three real sim rows, lets the production renderer consume two animation
 * frames, and proves the future row never leaks body/action/tactic visuals.
 * A second fixture roots Railfang on a real generated deck. The same page is
 * resized for portrait so one cold boot supplies both layouts. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.ECOLOGY_FIXTURE_OUT ||
  '/private/tmp/hullbreaker-final-ecology-fixture';
mkdirSync(OUT, { recursive: true });

const startedAt = Date.now();
let page = null;
const faults = [];

async function twoRenderFrames() {
  await page.evaluate(() => new Promise((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
  }));
}

async function installQaModules() {
  await page.evaluate(async () => {
    const [H, P, L, B, T, C, ST, W, Waves] = await Promise.all([
      import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
      import('/src/sim/level.js'), import('/src/sim/bridge.js'),
      import('/src/sim/time.js'), import('/src/config.js'),
      import('/src/sim/state.js'), import('/src/sim/weapons.js'),
      import('/src/pure/waves.js'),
    ]);
    ST.setState('PAUSED');
    H.clearHostiles();
    W.clearBullets();
    document.getElementById('overlay').style.display = 'none';
    window.__FINAL_ECOLOGY_QA__ = { H, P, L, B, T, C, ST, W, Waves };
  });
}

async function stageMixedEcology() {
  const ids = await page.evaluate(() => {
    const q = window.__FINAL_ECOLOGY_QA__;
    const C = q.C.CONFIG;
    q.H.clearHostiles();
    q.W.clearBullets();

    const playerX = 8;
    const deck = q.L.groundTopAt(playerX);
    const compact = innerWidth < 600;
    assertDeck(deck, 'mixed fixture player deck');
    Object.assign(q.P.player, {
      x: playerX, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
      facing: 1, traversalState: 'free', ladderId: null,
      onOneWay: null, iframesUntil: Number.MAX_SAFE_INTEGER,
    });
    q.P.player.aim.set(1, 0);

    const encounterKey = 'qa:final-ecology-mixed';
    q.H.spawnHostile(playerX + (compact ? 0.28 : 4.6),
      deck + (compact ? 2.75 : 5.2), 0, 'wasp', {
      id: 'qa-live-crosswind', ecologyId: 'wasp-crosswind',
      encounterKey, gating: true, dir: -1,
    });
    const crosswind = q.H.hostiles.at(-1);
    crosswind.enterUntil = q.T.gameMs - 1;
    crosswind.state = 'cruise';
    crosswind.stateUntil = Infinity;
    crosswind.formationReady = true;

    q.H.spawnHostile(playerX + (compact ? 0.62 : 6.7),
      deck + (compact ? 4.35 : 6.6), 300000, 'wasp', {
      id: 'qa-future-diveclaw', ecologyId: 'wasp-diveclaw',
      encounterKey, gating: true, dir: -1,
    });
    const future = q.H.hostiles.at(-1);

    q.H.spawnHostile(playerX + (compact ? -0.32 : 2.1),
      deck + (compact ? 1.55 : 3.4), 0, 'wasp', {
      id: 'qa-visual-only', encounterKey, gating: false, dir: -1,
    }, 'wasp-diveclaw');
    const visualOnly = q.H.hostiles.at(-1);
    visualOnly.enterUntil = q.T.gameMs - 1;
    visualOnly.state = 'cruise';
    visualOnly.stateUntil = Infinity;

    for (const row of q.H.hostiles) q.B.view.hostiles.sync(row);
    if (compact) {
      fitLiveRowToScreen(crosswind, 78, deck + 2.75);
      fitLiveRowToScreen(visualOnly, 308, deck + 1.55);
    }
    return {
      encounterKey,
      crosswind: crosswind.id,
      future: future.id,
      visualOnly: visualOnly.id,
    };

    function assertDeck(y, label) {
      if (!(y > -100)) throw new Error(`${label}: ${y}`);
    }

    function fitLiveRowToScreen(row, targetX, fixedY) {
      let best = null;
      for (let i = -32; i <= 32; i++) {
        row.x = playerX + i * 0.25;
        row.y = fixedY;
        q.B.view.hostiles.sync(row);
        const visual = window.__HB_ENEMY_ECOLOGY_VISUAL();
        const live = visual.rows.find((entry) => entry.id === row.id);
        if (!live?.bodyVisible) continue;
        const score = Math.abs(live.screen.x - targetX) +
          (live.screen.inFrame ? 0 : innerWidth);
        if (!best || score < best.score) best = { score, x: row.x };
      }
      if (!best) throw new Error(`no compact on-screen placement for ${row.ecologyId}`);
      row.x = best.x;
      row.y = fixedY;
      q.B.view.hostiles.sync(row);
    }
  });
  await twoRenderFrames();
  return page.evaluate((fixtureIds) => {
    const q = window.__FINAL_ECOLOGY_QA__;
    const visual = window.__HB_ENEMY_ECOLOGY_VISUAL();
    const byId = (id) => visual.rows.find((row) => row.id === id);
    const rawById = (id) => q.H.hostiles.find((row) => row.id === id);
    const row = (id) => {
      const e = rawById(id);
      return {
        id: e.id,
        ecologyId: e.ecologyId,
        ecologyVisualId: e.ecologyVisualId,
        ecologyMechanics: [...e.ecologyMechanics],
        effectiveMechanics: [...e.effectiveMechanics],
        tactics: [...e.tactics],
        tacticHazards: e.tacticHazards,
        gating: e.gating,
        enterUntil: e.enterUntil,
      };
    };
    const selected = {
      crosswind: byId(fixtureIds.crosswind),
      future: byId(fixtureIds.future),
      visualOnly: byId(fixtureIds.visualOnly),
    };
    const visibleCount = visual.rows.filter((entry) => entry.bodyVisible ||
      entry.actionVisible || entry.tacticVisual.visible > 0).length;
    const hudThreatCount = q.Waves.activeGateThreatCount(
      q.H.hostiles, fixtureIds.encounterKey, q.T.gameMs,
      q.C.CONFIG.wasp.enterMs,
    );
    return {
      ids: fixtureIds,
      selected,
      raw: {
        crosswind: row(fixtureIds.crosswind),
        future: row(fixtureIds.future),
        visualOnly: row(fixtureIds.visualOnly),
      },
      counts: {
        allocatedEcologyBodies: visual.liveBodies,
        visibleCount,
        hudThreatCount,
        visualOnlyBodies: visual.visualOnlyBodies,
      },
      materials: visual.materials,
      activation: visual.activation,
      hud: {
        center: document.getElementById('hudTC').textContent,
        right: document.getElementById('hudTR').textContent,
      },
    };
  }, ids);
}

async function stageRailfang() {
  const id = await page.evaluate(() => {
    const q = window.__FINAL_ECOLOGY_QA__;
    const C = q.C.CONFIG;
    q.H.clearHostiles();
    q.W.clearBullets();

    const playerX = 8;
    const playerDeck = q.L.groundTopAt(playerX);
    // The compact camera turns world-x into a much steeper screen-space arc;
    // keep the proof on this face instead of merely proving an offscreen mesh.
    const houndX = playerX + (innerWidth < 600 ? 0.42 : 4.1);
    const houndDeck = q.L.groundTopAt(houndX);
    if (!(playerDeck > -100 && houndDeck > -100))
      throw new Error(`Railfang fixture has no deck: ${playerDeck}/${houndDeck}`);
    Object.assign(q.P.player, {
      x: playerX, y: playerDeck + 0.001, vx: 0, vy: 0, grounded: true,
      facing: 1, traversalState: 'free', ladderId: null,
      onOneWay: null, iframesUntil: Number.MAX_SAFE_INTEGER,
    });
    q.P.player.aim.set(1, 0);

    q.H.spawnHostile(houndX, houndDeck + C.hound.rideY, 0, 'hound', {
      id: 'qa-live-railfang', ecologyId: 'hound-railfang',
      encounterKey: 'qa:final-railfang', gating: false, dir: -1,
      patrol: { x0: houndX - 1.5, x1: houndX + 1.5 },
    });
    const hound = q.H.hostiles.at(-1);
    hound.enterUntil = q.T.gameMs - 1;
    hound.state = 'prowl';
    hound.stateUntil = Infinity;
    hound.vx = 0;
    hound.vy = 0;
    q.B.view.hostiles.sync(hound);
    if (innerWidth < 600) {
      let best = null;
      for (let i = -32; i <= 32; i++) {
        const candidateX = playerX + i * 0.25;
        const candidateDeck = q.L.groundTopAt(candidateX);
        if (!(candidateDeck > -100)) continue;
        hound.x = candidateX;
        hound.y = candidateDeck + C.hound.rideY;
        q.B.view.hostiles.sync(hound);
        const live = window.__HB_ENEMY_ECOLOGY_VISUAL().rows
          .find((entry) => entry.id === hound.id);
        if (!live?.bodyVisible) continue;
        const score = Math.abs(live.screen.x - 82) +
          (live.screen.inFrame ? 0 : innerWidth);
        if (!best || score < best.score)
          best = { score, x: candidateX, y: hound.y };
      }
      if (!best) throw new Error('no compact on-screen placement for Railfang');
      hound.x = best.x;
      hound.y = best.y;
      q.B.view.hostiles.sync(hound);
    }
    return hound.id;
  });
  await twoRenderFrames();
  return page.evaluate((houndId) => {
    const q = window.__FINAL_ECOLOGY_QA__;
    const visual = window.__HB_ENEMY_ECOLOGY_VISUAL();
    const railfang = visual.rows.find((row) => row.id === houndId);
    return {
      railfang,
      materials: visual.materials,
      counts: {
        allocatedEcologyBodies: visual.liveBodies,
        visibleCount: visual.rows.filter((entry) => entry.bodyVisible ||
          entry.actionVisible || entry.tacticVisual.visible > 0).length,
        hudThreatCount: q.Waves.activeGateThreatCount(
          q.H.hostiles, 'qa:final-railfang', q.T.gameMs,
          q.C.CONFIG.wasp.enterMs,
        ),
      },
    };
  }, id);
}

function assertMixed(result, label) {
  const { selected, raw, counts } = result;
  assert.equal(selected.crosswind.gameplayEcologyId, 'wasp-crosswind',
    `${label}: Crosswind owns gameplay ecology`);
  assert.equal(selected.crosswind.bodyVisible, true,
    `${label}: live Crosswind body visible`);
  assert.equal(selected.crosswind.noEmissiveMaps, true,
    `${label}: Crosswind has no emissive map`);
  assert.equal(selected.crosswind.noIdleEmission, true,
    `${label}: Crosswind has no idle emission`);
  assert.equal(selected.crosswind.screen.inFrame, true,
    `${label}: Crosswind is framed for visual review`);
  assert.equal(selected.future.gameplayEcologyId, 'wasp-diveclaw',
    `${label}: future Diveclaw owns gameplay ecology`);
  assert.equal(selected.future.bodyVisible, false,
    `${label}: future body hidden`);
  assert.equal(selected.future.actionVisible, false,
    `${label}: future action hidden`);
  assert.equal(selected.future.tacticVisual.visible, 0,
    `${label}: future tactics hidden`);
  assert.equal(selected.future.preCondensationHidden, true,
    `${label}: future row fails closed before condensation`);
  assert.equal(selected.visualOnly.visualOnly, true,
    `${label}: presentation-only body identified`);
  assert.equal(raw.visualOnly.ecologyId, '',
    `${label}: visual-only row has no gameplay ecology`);
  assert.equal(raw.visualOnly.ecologyVisualId, 'wasp-diveclaw',
    `${label}: visual-only row owns reviewed art`);
  assert.deepEqual(raw.visualOnly.ecologyMechanics, [],
    `${label}: visual-only base mechanics empty`);
  assert.deepEqual(raw.visualOnly.tactics, [],
    `${label}: visual-only tactics empty`);
  assert.equal(raw.visualOnly.tacticHazards, null,
    `${label}: visual-only hazards absent`);
  assert.equal(counts.allocatedEcologyBodies, 3,
    `${label}: all three ecology meshes allocated`);
  assert.equal(counts.visibleCount, 2,
    `${label}: only current bodies visible`);
  assert.equal(counts.hudThreatCount, counts.visibleCount,
    `${label}: actionable HUD count matches rendered threat count`);
  assert.equal(result.materials.paintedInkFloor.material, 'MeshBasicMaterial',
    `${label}: ecology preserves atlas value with an unlit material`);
  assert.equal(result.materials.paintedInkFloor.emissiveMap, false,
    `${label}: authored-value floor is non-emissive`);
  assert.equal(result.materials.paintedInkFloor.idleEmissiveIntensity, 0,
    `${label}: authored-value floor has zero idle emission`);
}

function assertRailfang(result, label) {
  assert.equal(result.railfang.ecologyId, 'hound-railfang',
    `${label}: Railfang art selected`);
  assert.equal(result.railfang.rooted, true, `${label}: rooted body contract`);
  assert.equal(result.railfang.settled, true, `${label}: body materialized`);
  assert.equal(result.railfang.bodyVisible, true, `${label}: body visible`);
  assert.ok(Math.abs(result.railfang.rootError) <= 0.001,
    `${label}: root error ${result.railfang.rootError}`);
  assert.equal(result.railfang.noEmissiveMaps, true,
    `${label}: Railfang has no emissive map`);
  assert.equal(result.railfang.noIdleEmission, true,
    `${label}: Railfang has no idle emission`);
  assert.equal(result.railfang.screen.inFrame, true,
    `${label}: Railfang is framed for visual review`);
  assert.equal(result.materials.paintedInkFloor.material, 'MeshBasicMaterial',
    `${label}: Railfang uses the bounded unlit ink floor`);
  assert.equal(result.counts.visibleCount, 1, `${label}: one rendered threat`);
  assert.equal(result.counts.hudThreatCount, 1,
    `${label}: non-gating teaching threat still counted`);
}

const report = {
  ok: false,
  out: OUT,
  baseUrl: null,
  browser: null,
  layouts: {},
  faults,
};

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  report.baseUrl = baseUrl;
  report.browser = { channel: launch.channel, via: launch.via };
  const owned = await newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  page = owned.page;
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error')
      faults.push(`${message.type()}: ${message.text()}`);
  });

  try {
    for (const layout of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'portrait', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: layout.width, height: layout.height });
      // Cold-boot each aspect ratio. Resizing an already paused traversal page
      // preserves the prior camera's damped yaw/look for several frames, which
      // can put correct tower-depth actors outside a compact screenshot even
      // though a real portrait launch never does. Two local boots remain faster
      // than a route replay and make both images representative shipped views.
      await page.goto(
        `${baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far&audio=0`,
        { waitUntil: 'load', timeout: 15000 },
      );
      await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
        typeof window.__HB_ENEMY_ECOLOGY_VISUAL === 'function', null,
      { timeout: 15000 });
      await installQaModules();
      const mixed = await stageMixedEcology();
      assertMixed(mixed, layout.name);
      const mixedPath = resolve(OUT, `${layout.name}-mixed-ecology.png`);
      await page.screenshot({ path: mixedPath });

      const railfang = await stageRailfang();
      assertRailfang(railfang, layout.name);
      const railfangPath = resolve(OUT, `${layout.name}-railfang-root.png`);
      await page.screenshot({ path: railfangPath });
      report.layouts[layout.name] = {
        viewport: { width: layout.width, height: layout.height },
        mixed: { ...mixed, screenshot: mixedPath },
        railfang: { ...railfang, screenshot: railfangPath },
      };
    }
    assert.deepEqual(faults, [], 'fixture emitted no console warnings/errors or page errors');
    report.ok = true;
    report.elapsedMs = Date.now() - startedAt;
    writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: true,
      out: OUT,
      elapsedMs: report.elapsedMs,
      desktop: {
        counts: report.layouts.desktop.mixed.counts,
        future: report.layouts.desktop.mixed.selected.future,
        visualOnly: report.layouts.desktop.mixed.raw.visualOnly,
        railfang: report.layouts.desktop.railfang.railfang,
      },
      portrait: {
        counts: report.layouts.portrait.mixed.counts,
        railfangRootError: report.layouts.portrait.railfang.railfang.rootError,
      },
      faults,
    }, null, 2));
  } finally {
    await owned.close();
    page = null;
  }
});
