#!/usr/bin/env node

/* Production-route acceptance for rooted hostile action silhouettes.
 * One cold boot per shipped aspect ratio stages real ecology rows on the
 * generated traversal deck. The sim remains paused; only fields the sim
 * itself owns are frozen at representative instants. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.HOSTILE_ACTION_STYLE_OUT ||
  '/private/tmp/hullbreaker-hostile-action-style';
mkdirSync(OUT, { recursive: true });

const POLYP = Object.freeze([
  Object.freeze({ tag: 'sealed', state: 'closed', progress: 1, body: 0, action: 0 }),
  Object.freeze({ tag: 'shutter-flare', state: 'tell', progress: 0.12, body: 2, action: 1 }),
  Object.freeze({ tag: 'aim-lock', state: 'tell', progress: 0.50, body: 2, action: 2 }),
  Object.freeze({ tag: 'discharge', state: 'fire', progress: 0.60, body: 3, action: 4 }),
]);

const MORTAR = Object.freeze([
  Object.freeze({ tag: 'rest', state: 'aim', podU: 0, body: 0, action: 0 }),
  Object.freeze({ tag: 'launch', state: 'lob', podU: 0.04, body: 3, action: 3 }),
  Object.freeze({ tag: 'apex', state: 'lob', podU: 0.50, body: 3, action: 4 }),
  Object.freeze({ tag: 'descent', state: 'lob', podU: 0.84, body: 3, action: 4 }),
]);

const report = { ok: false, out: OUT, layouts: {}, faults: [], ignoredWarnings: [] };

function collectFaults(page) {
  page.on('pageerror', (error) => report.faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    const text = `${message.type()}: ${message.text()}`;
    if (text.includes('was preloaded using link preload but not used'))
      report.ignoredWarnings.push(text);
    else report.faults.push(text);
  });
}

async function install(page) {
  await page.evaluate(async () => {
    const [H, P, L, B, T, C, ST, W, Scene] = await Promise.all([
      import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
      import('/src/sim/level.js'), import('/src/sim/bridge.js'),
      import('/src/sim/time.js'), import('/src/config.js'),
      import('/src/sim/state.js'), import('/src/sim/weapons.js'),
      import('/src/render/scene.js'),
    ]);
    ST.setState('PAUSED');
    H.clearHostiles();
    W.clearBullets();
    document.getElementById('overlay').style.display = 'none';
    window.__HOSTILE_ACTION_STYLE_QA__ = { H, P, L, B, T, C, ST, W, Scene };
  });
}

async function spawn(page, kind, targetX) {
  return page.evaluate(({ kind, targetX }) => {
    const q = window.__HOSTILE_ACTION_STYLE_QA__;
    q.H.clearHostiles();
    q.W.clearBullets();
    const playerX = 8;
    const playerDeck = q.L.groundTopAt(playerX);
    if (!(playerDeck > -100)) throw new Error(`player has no deck: ${playerDeck}`);
    Object.assign(q.P.player, {
      x: playerX, y: playerDeck + 0.001, vx: 0, vy: 0, grounded: true,
      facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
      iframesUntil: Number.MAX_SAFE_INTEGER,
    });
    q.P.player.aim.set(1, 0);

    const rootY = kind === 'polyp' ? q.C.CONFIG.polyp.rootY : q.C.CONFIG.mortar.bodyY;
    const ecologyId = kind === 'polyp' ? 'polyp-needle' : 'mortar-craterpod';
    const id = `qa-production-${kind}`;
    q.H.spawnHostile(playerX + 3, playerDeck + rootY, 0, kind, {
      id, ecologyId, encounterKey: `qa:production-${kind}`,
      gating: false, dir: -1,
      zone: kind === 'mortar' ? { x: playerX, y: playerDeck } : undefined,
    });
    const row = q.H.hostiles.at(-1);
    row.enterUntil = q.T.gameMs - 1;

    let best = null;
    for (let i = -36; i <= 36; i++) {
      const x = playerX + i * 0.25;
      const deck = q.L.groundTopAt(x);
      if (!(deck > -100)) continue;
      row.x = x;
      row.y = deck + rootY;
      row.state = kind === 'polyp' ? 'closed' : 'aim';
      row.stateUntil = Infinity;
      q.B.view.hostiles.sync(row);
      const live = window.__HB_ENEMY_ECOLOGY_VISUAL().rows
        .find((entry) => entry.id === row.id);
      if (!live?.bodyVisible) continue;
      const score = Math.abs(live.screen.x - targetX) +
        (live.screen.inFrame ? 0 : innerWidth * 2);
      if (!best || score < best.score) best = { score, x, y: row.y };
    }
    if (!best) throw new Error(`no visible production deck position for ${kind}`);
    row.x = best.x;
    row.y = best.y;
    // Work out which logical direction moves toward the center of this real
    // camera/facet. On a turned portrait face, world +s is not screen-right.
    q.B.view.hostiles.sync(row);
    const atRoot = window.__HB_ENEMY_ECOLOGY_VISUAL().rows
      .find((entry) => entry.id === row.id).screen.x;
    const probeX = row.x + 0.25;
    const probeDeck = q.L.groundTopAt(probeX);
    row.x = probeX;
    row.y = (probeDeck > -100 ? probeDeck : best.y - rootY) + rootY;
    q.B.view.hostiles.sync(row);
    const atPlus = window.__HB_ENEMY_ECOLOGY_VISUAL().rows
      .find((entry) => entry.id === row.id).screen.x;
    row.x = best.x;
    row.y = best.y;
    const desiredScreenSign = atRoot < innerWidth / 2 ? 1 : -1;
    const plusScreenSign = atPlus >= atRoot ? 1 : -1;
    row.dir = desiredScreenSign === plusScreenSign ? 1 : -1;
    // The compact camera is already looking around the facet seam. Its
    // projected body derivative and the rendered face tangent have opposite
    // handedness at this exact launch pose, so choose the inward-facing lane
    // explicitly for the review frame.
    if (innerWidth < 600) row.dir *= -1;
    if (kind === 'mortar') {
      row.zoneX = row.x + row.dir * 4.4;
      const zoneDeck = q.L.groundTopAt(row.zoneX);
      row.zoneY = zoneDeck > -100 ? zoneDeck : playerDeck;
    }
    q.B.view.hostiles.sync(row);
    return { id: row.id, playerX, playerDeck, rowX: row.x, rowY: row.y };
  }, { kind, targetX });
}

async function stage(page, actor, kind, entry) {
  return page.evaluate(async ({ actor, kind, entry }) => {
    const q = window.__HOSTILE_ACTION_STYLE_QA__;
    const row = q.H.hostiles.find((candidate) => candidate.id === actor.id);
    row.state = entry.state;
    row.flashUntil = 0;
    row.tacticPhase = '';
    if (kind === 'polyp') {
      const duration = entry.state === 'tell' ? q.C.CONFIG.polyp.tellMs
        : entry.state === 'fire' ? q.C.CONFIG.polyp.beamMs : 0;
      row.stateUntil = duration
        ? q.T.gameMs + duration * (1 - entry.progress) : Infinity;
      row.beamReach = entry.state === 'fire' ? 4.8 : 0;
    } else {
      row.podU = entry.podU;
      row.stateUntil = entry.state === 'lob'
        ? q.T.gameMs + q.C.CONFIG.mortar.lobMs * (1 - entry.podU) : Infinity;
    }
    q.B.view.hostiles.sync(row);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const visual = window.__HB_ENEMY_ECOLOGY_VISUAL();
    const selected = visual.rows.find((candidate) => candidate.id === actor.id);
    const renderer = q.Scene.renderer;
    return {
      selected,
      resources: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      },
      ecology: {
        liveTextures: visual.liveTextures,
        quadsPerEnemy: visual.quadsPerLiveEnemy,
        extraDrawsPerEnemy: visual.extraDrawsPerLiveEnemy,
      },
    };
  }, { actor, kind, entry });
}

function assertCommon(row, layout, kind, entry) {
  assert.equal(row.selected.kind, kind, `${layout}/${kind}/${entry.tag}: kind`);
  assert.equal(row.selected.bodyRow, entry.body,
    `${layout}/${kind}/${entry.tag}: body pose`);
  assert.equal(row.selected.actionRow, entry.action,
    `${layout}/${kind}/${entry.tag}: action pose`);
  assert.equal(row.selected.rooted, true,
    `${layout}/${kind}/${entry.tag}: immutable root`);
  assert.equal(row.selected.screen.inFrame, true,
    `${layout}/${kind}/${entry.tag}: actor visible at FAR`);
  assert.equal(row.selected.noIdleEmission, true,
    `${layout}/${kind}/${entry.tag}: painted body remains non-emissive`);
  assert.equal(row.ecology.liveTextures, 1,
    `${layout}/${kind}/${entry.tag}: one resident ecology texture`);
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  report.baseUrl = baseUrl;
  report.browser = { channel: launch.channel, via: launch.via };

  for (const layout of [
    { name: 'desktop', width: 1440, height: 900, targetX: 910 },
    { name: 'portrait', width: 390, height: 844, targetX: 270 },
  ]) {
    const owned = await newPage({
      viewport: { width: layout.width, height: layout.height },
      deviceScaleFactor: 1,
    });
    const page = owned.page;
    collectFaults(page);
    try {
      await page.goto(
        `${baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far&audio=0`,
        { waitUntil: 'load', timeout: 15000 },
      );
      await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
        typeof window.__HB_ENEMY_ECOLOGY_VISUAL === 'function', null,
      { timeout: 15000 });
      await page.waitForTimeout(750);
      await install(page);

      const layoutReport = { viewport: { width: layout.width, height: layout.height } };
      for (const [kind, entries] of [['polyp', POLYP], ['mortar', MORTAR]]) {
        const actor = await spawn(page, kind, layout.targetX);
        const rows = [];
        for (const entry of entries) {
          const snapshot = await stage(page, actor, kind, entry);
          assertCommon(snapshot, layout.name, kind, entry);
          const action = snapshot.selected.actionPresentation;
          if (kind === 'polyp' && entry.state === 'fire') {
            assert.equal(action.beamVisible, true,
              `${layout.name}: live conductor visible`);
            assert.equal(action.beamLanguage, 'polyp-broken-sheath',
              `${layout.name}: no rectangular beam card`);
            assert.equal(action.beamCoreLanguage, 'polyp-conductor-core',
              `${layout.name}: tapered core language`);
            // The far endpoint is the sim endpoint; the near endpoint is the
            // painted muzzle socket, so the rendered segment may be slightly
            // longer than beamReach without extending danger past its answer.
            assert.ok(action.beamReach > 0 && action.beamReach <= 9,
              `${layout.name}: bounded conductor segment`);
          } else if (kind === 'polyp') {
            assert.equal(action.beamVisible, false,
              `${layout.name}/${entry.tag}: no pre-fire beam`);
          }
          if (kind === 'mortar' && entry.state === 'lob') {
            assert.equal(action.podVisible, true,
              `${layout.name}/${entry.tag}: seed pod visible`);
            assert.equal(action.podLanguage, 'mortar-faceted-seed-dart',
              `${layout.name}/${entry.tag}: no block projectile`);
            assert.ok(action.podEmission >= 0.10 && action.podEmission <= 0.34,
              `${layout.name}/${entry.tag}: bounded action-only emission`);
          } else if (kind === 'mortar') {
            assert.equal(action.podVisible, false,
              `${layout.name}/${entry.tag}: no idle pod`);
            assert.equal(action.podEmission, 0,
              `${layout.name}/${entry.tag}: zero idle pod emission`);
          }
          const screenshot = resolve(OUT, `${layout.name}-${kind}-${entry.tag}.png`);
          await page.screenshot({ path: screenshot });
          rows.push({ entry, ...snapshot, screenshot });
        }

        const baseline = rows[0].resources;
        for (const row of rows) {
          assert.equal(row.resources.textures, baseline.textures,
            `${layout.name}/${kind}/${row.entry.tag}: no texture streaming`);
          // A visible prop is submitted once to the color pass and may be
          // submitted again to the selective bloom pass. The production
          // ceiling remains fixed: Polyp owns two meshes, Mortar owns the pod
          // plus its existing landing mark, with no per-frame growth.
          assert.ok(row.resources.calls <= baseline.calls + 8,
            `${layout.name}/${kind}/${row.entry.tag}: bounded fixed action draws`);
        }
        layoutReport[kind] = { actor, rows };
      }
      report.layouts[layout.name] = layoutReport;
    } finally {
      await owned.close();
    }
  }

  assert.deepEqual(report.faults, [], 'no page errors or actionable console faults');
  report.ok = true;
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    browser: report.browser,
    layouts: Object.fromEntries(Object.entries(report.layouts).map(([name, value]) => [
      name,
      Object.fromEntries(['polyp', 'mortar'].map((kind) => [kind,
        value[kind].rows.map((row) => ({
          stage: row.entry.tag,
          body: row.selected.bodyRow,
          action: row.selected.actionRow,
          calls: row.resources.calls,
          textures: row.resources.textures,
          presentation: row.selected.actionPresentation,
        }))])),
    ])),
    faults: report.faults,
    ignoredWarnings: report.ignoredWarnings.length,
  }, null, 2));
});
