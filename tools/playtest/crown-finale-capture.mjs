#!/usr/bin/env node
/* Matched normal-run proof for the Crown architecture. Four page boots cover
   production/legacy × desktop/portrait; each page then captures the exact
   same approach, Warden and transmission states. The harness pauses the real
   loop, changes presentation-only rows through the existing bridge, and owns
   its isolated browser/server lifecycle. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../assets/lib/png.mjs';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-crown-finale');
await mkdir(out, { recursive: true });

function pixelDifference(aFile, bFile) {
  const a = decodePng(aFile);
  const b = decodePng(bFile);
  if (a.width !== b.width || a.height !== b.height) return null;
  let changed = 0;
  let sum = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const delta = Math.abs(a.rgba[i] - b.rgba[i]) +
      Math.abs(a.rgba[i + 1] - b.rgba[i + 1]) +
      Math.abs(a.rgba[i + 2] - b.rgba[i + 2]);
    if (delta >= 12) changed++;
    sum += delta / 3;
  }
  const pixels = a.width * a.height;
  return { changedShare: +(changed / pixels).toFixed(5), meanDelta: +(sum / pixels).toFixed(3) };
}

const layouts = [
  { id: 'desktop', viewport: { width: 1440, height: 900 }, playerLead: 3.0 },
  { id: 'portrait', viewport: { width: 430, height: 900 }, playerLead: 1.9 },
];
const variants = ['production', 'legacy'];
const states = ['approach', 'warden', 'signal'];

const report = {
  output: out,
  browser: null,
  captures: [],
  gates: [],
  errors: [],
};
const gate = (ok, label, detail = null) => report.gates.push({ ok: Boolean(ok), label, detail });

async function prepareFinalFacet(page, playerLead) {
  return page.evaluate(async ({ playerLead }) => {
    const W = await import('/src/sim/wavegate.js');
    const T = await import('/src/sim/time.js');
    const C = await import('/src/render/camera.js');
    const B = await import('/src/sim/bridge.js');
    const H = await import('/src/sim/hostiles.js');
    const M = await import('/src/sim/mods.js');
    const CR = await import('/src/render/crown.js');
    H.clearHostiles();
    M.clearMods();
    B.view.finale.reset();
    for (let i = 0; i < 5; i++) W.finishCorner(W.cornerEvents[i]);
    CR.updateCrownFacetCull();
    const hiddenBeforeCommit = !CR.crownRoot.visible;
    W.finishCorner(W.cornerEvents[5]);
    T.setScrollX(415);
    CR.updateCrownFacetCull();
    HB.player.x = 415 + playerLead;
    const col = Math.max(0, Math.min(HB.levelData.groundH.length - 1,
      Math.floor(HB.player.x)));
    HB.player.y = HB.levelData.groundH[col];
    HB.player.hp = 3;
    HB.player.lives = 3;
    HB.player.iframesUntil = 1e9;
    C.syncCamera();
    B.view.player.sync();
    return {
      hiddenBeforeCommit,
      visibleAfterCommit: CR.crownRoot.visible,
      crown: CR.crownPresentationSnapshot(),
    };
  }, { playerLead });
}

async function stage(page, state, playerLead) {
  return page.evaluate(async ({ state, playerLead }) => {
    const T = await import('/src/sim/time.js');
    const C = await import('/src/render/camera.js');
    const B = await import('/src/sim/bridge.js');
    const H = await import('/src/sim/hostiles.js');
    const L = await import('/src/sim/level.js');
    const CR = await import('/src/render/crown.js');
    const F = await import('/src/render/finale.js');
    const { CONFIG } = await import('/src/config.js');
    H.clearHostiles();
    B.view.finale.reset();
    const scroll = L.END_SCROLL;
    T.setScrollX(scroll);
    HB.player.x = scroll + playerLead;
    const col = Math.max(0, Math.min(HB.levelData.groundH.length - 1,
      Math.floor(HB.player.x)));
    HB.player.y = HB.levelData.groundH[col];
    HB.player.vx = 0;
    HB.player.vy = 0;
    C.syncCamera();
    B.view.player.sync();
    CR.updateCrownFacetCull();

    if (state === 'warden') {
      const x = L.END_SCROLL + 11.4;
      H.spawnHostile(x, L.groundTopAt(x) + CONFIG.warden.bodyY, 0, 'warden', {
        dir: -1,
        gating: false,
        finaleWave: 0,
        arena: { x0: L.END_SCROLL + 2, x1: L.END_SCROLL + 10 },
      });
      const e = H.hostiles[0];
      e.enterUntil = 0;
      e.flashUntil = 0;
      e.state = 'exposed';
      e.openedAt = T.gameMs - CONFIG.warden.exposedMs * 0.46;
      e.stateUntil = T.gameMs + CONFIG.warden.exposedMs * 0.54;
      e.hp = e.maxHp - CONFIG.warden.windowDamage;
      B.view.hostiles.sync(e);
      B.view.finale.started({
        phase: 'defend', elapsedMs: 5900, kills: 3, quota: 8,
        progress: 0.54, wave: 2,
        warden: {
          present: true, defeated: false, hp: e.hp, maxHp: e.maxHp,
          health: e.hp / e.maxHp, damage: CONFIG.warden.windowDamage,
          stage: 1, seal: 2, shielded: false, attack: 'exposed', mercy: false,
        },
      });
    } else if (state === 'signal') {
      B.view.finale.transmit({
        phase: 'transmit', elapsedMs: 12400, kills: 11, quota: 8,
        progress: 0.34, wave: 3,
        warden: {
          present: false, defeated: true, hp: 0, maxHp: CONFIG.warden.hp,
          health: 0, damage: CONFIG.warden.hp, stage: 3, seal: 4,
          shielded: false, attack: 'broken', mercy: false,
        },
      });
    }

    return {
      crown: CR.crownPresentationSnapshot(),
      finale: F.finalePresentationSnapshot(),
      hostiles: H.hostiles.length,
    };
  }, { state, playerLead });
}

await withIsolatedBrowser(repoRoot, async ({ baseUrl, newPage, launch }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  for (const layout of layouts) for (const variant of variants) {
    const owned = await newPage({
      viewport: layout.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    const pageId = `${layout.id}-${variant}`;
    try {
      page.on('pageerror', (error) =>
        report.errors.push(`${pageId}: ${error.stack || error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error')
          report.errors.push(`${pageId}: console: ${message.text()}`);
      });
      const legacy = variant === 'legacy' ? '&crown=legacy' : '';
      await page.goto(
        `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far&enemies=0${legacy}`,
        { waitUntil: 'load', timeout: 30000 },
      );
      await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING' &&
        typeof globalThis.__HB_CROWN_PRESENTATION === 'function', null,
      { timeout: 20000 });
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => HB.state() === 'PAUSED');
      await page.addStyleTag({ content: '#overlay { display: none !important; }' });
      const ownership = await prepareFinalFacet(page, layout.playerLead);

      for (const state of states) {
        const staged = await stage(page, state, layout.playerLead);
        await page.waitForTimeout(state === 'signal' ? 180 : 90);
        const runtime = await page.evaluate(async () => {
          const { renderer, scene } = await import('/src/render/scene.js');
          const pools = [];
          scene.traverse((object) => {
            if (object.userData?.environmentRole !== 'crown-architecture') return;
            pools.push({
              name: object.name,
              role: object.userData.crownRole,
              count: object.count || 1,
              instanced: !!object.isInstancedMesh,
            });
          });
          return { pools, render: { ...renderer.info.render } };
        });
        const file = resolve(out, `${layout.id}-${state}-${variant}.png`);
        await page.screenshot({ path: file });
        let isolate = null;
        if (state === 'approach' && variant === 'production') {
          await page.evaluate(async () => {
            const { scene } = await import('/src/render/scene.js');
            scene.traverse((object) => {
              if (!object.isMesh) return;
              object.userData.crownQaVisible = object.visible;
              object.visible = object.userData.environmentRole === 'crown-architecture';
            });
          });
          await page.waitForTimeout(50);
          isolate = resolve(out, `${layout.id}-approach-production-crown-only.png`);
          await page.screenshot({ path: isolate });
          await page.evaluate(async () => {
            const { scene } = await import('/src/render/scene.js');
            scene.traverse((object) => {
              if (!object.isMesh || object.userData.crownQaVisible === undefined) return;
              object.visible = object.userData.crownQaVisible;
              delete object.userData.crownQaVisible;
            });
          });
        }
        report.captures.push({
          id: `${layout.id}-${state}-${variant}`,
          layout: layout.id,
          state,
          variant,
          file,
          isolate,
          ownership,
          staged,
          runtime,
        });
      }
    } finally {
      await owned.close();
    }
  }
});

report.differences = {};
for (const layout of layouts) for (const state of states) {
  const production = report.captures.find((row) =>
    row.layout === layout.id && row.state === state && row.variant === 'production');
  const legacy = report.captures.find((row) =>
    row.layout === layout.id && row.state === state && row.variant === 'legacy');
  report.differences[`${layout.id}-${state}`] = pixelDifference(production.file, legacy.file);
}

const production = report.captures.filter((row) => row.variant === 'production');
const desktop = production.find((row) => row.id === 'desktop-approach-production');
gate(report.errors.length === 0, 'browser emitted no Crown page or console errors', report.errors);
gate(production.every((row) => row.ownership.hiddenBeforeCommit && row.ownership.visibleAfterCommit),
  'future final facet owns no Crown pixels before commit and all production states reveal after commit');
gate(production.every((row) => row.staged.crown.variant === 'production' &&
  row.staged.crown.bounds.nearestDepth < -1.5),
  'all Crown mass remains behind RIG, Warden, projectiles and combat tells');
gate(production.every((row) => row.staged.crown.paintedOrgans === 4 &&
  row.staged.crown.modularArt && row.staged.crown.assetPixels?.core?.[0] === 1024 &&
  row.staged.crown.assetPixels?.core?.[1] === 1024 &&
  row.staged.crown.assetPixels?.kit?.[0] === 1024 &&
  row.staged.crown.assetPixels?.kit?.[1] === 1024),
  'two power-of-two boot textures supply four independent core/root/antenna organs');
gate(desktop.runtime.pools.some((row) => row.role === 'foundation' && row.instanced) &&
  desktop.runtime.pools.some((row) => row.role === 'shell' && row.instanced) &&
  desktop.runtime.pools.some((row) => row.role === 'antenna' && row.instanced) &&
  desktop.runtime.pools.some((row) => row.role === 'aperture-mechanism') &&
  desktop.staged.crown.physicalShutters === 6 && desktop.staged.crown.hingedRupture,
  'buried roots, tapered scutes, antenna hardware, deep iris and hinged damage frame the art');
gate(production.every((row) => row.staged.crown.stagedConductors === 3) &&
  production.filter((row) => row.state === 'approach').every((row) =>
    !row.staged.finale.visible),
  'three signal materials are state-driven while the ambient approach remains dormant');
gate(production.filter((row) => row.state === 'signal').every((row) =>
  row.staged.finale.canonicalAxis && !row.staged.finale.portraitCarrier &&
  row.staged.finale.carrierClockActive),
  'desktop and portrait transmission share one world axis; payoff clock wakes only on signal');
gate(production.filter((row) => row.state !== 'signal').every((row) =>
  !row.staged.finale.carrierClockActive),
  'the private carrier clock stays asleep during approach and Warden combat');
gate(Object.values(report.differences).every((row) => row.changedShare >= 0.006),
  'matched desktop/portrait approach, Warden and signal frames materially differ from legacy',
  report.differences);
const approachOverhead = layouts.map((layout) => {
  const prod = report.captures.find((row) =>
    row.id === `${layout.id}-approach-production`);
  const old = report.captures.find((row) =>
    row.id === `${layout.id}-approach-legacy`);
  return { layout: layout.id, calls: prod.runtime.render.calls - old.runtime.render.calls };
});
gate(approachOverhead.every((row) => row.calls <= 72),
  'modular depth stack stays within a bounded 72-call approach overhead', approachOverhead);

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  output: out,
  differences: report.differences,
  gates: report.gates,
  captures: report.captures.map((row) => ({
    id: row.id,
    file: row.file,
    isolate: row.isolate,
    crown: row.staged.crown,
    finale: row.staged.finale,
    draw: row.runtime.render,
  })),
  errors: report.errors,
}, null, 2));
if (report.errors.length || report.gates.some((row) => !row.ok)) process.exitCode = 1;
