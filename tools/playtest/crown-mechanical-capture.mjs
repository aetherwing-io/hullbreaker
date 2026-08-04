#!/usr/bin/env node
/* Fast production-only proof for Crown mechanical responses. The normal
   finale bridge receives accelerated snapshots for one defense packet, one
   committed Warden attack, rupture, and transmission. Each state advances
   into the visible action envelope before capture; no simulation tune or
   world geometry is changed. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-crown-mechanical');
await mkdir(out, { recursive: true });

const report = { output: out, browser: null, captures: [], gates: [], errors: [] };
const gate = (ok, label, detail = null) =>
  report.gates.push({ ok: Boolean(ok), label, detail });

async function prepare(page, baseUrl) {
  await page.goto(
    `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far&enemies=0`,
    { waitUntil: 'load', timeout: 30000 },
  );
  await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING' &&
    typeof globalThis.__HB_CROWN_PRESENTATION === 'function', null, { timeout: 20000 });
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => HB.state() === 'PAUSED');
  await page.addStyleTag({ content: '#overlay { display: none !important; }' });
  await page.evaluate(async () => {
    const W = await import('/src/sim/wavegate.js');
    const T = await import('/src/sim/time.js');
    const C = await import('/src/render/camera.js');
    const B = await import('/src/sim/bridge.js');
    const H = await import('/src/sim/hostiles.js');
    const L = await import('/src/sim/level.js');
    const CR = await import('/src/render/crown.js');
    H.clearHostiles();
    B.view.finale.reset();
    for (const corner of W.cornerEvents) W.finishCorner(corner);
    T.setScrollX(L.END_SCROLL);
    HB.player.x = L.END_SCROLL + 3;
    const col = Math.max(0, Math.min(HB.levelData.groundH.length - 1,
      Math.floor(HB.player.x)));
    HB.player.y = HB.levelData.groundH[col];
    C.syncCamera();
    B.view.player.sync();
    CR.updateCrownFacetCull();
  });
}

async function stage(page, state) {
  return page.evaluate(async ({ state }) => {
    const B = await import('/src/sim/bridge.js');
    const CR = await import('/src/render/crown.js');
    const { scene, renderer } = await import('/src/render/scene.js');
    const makeWarden = (attack = 'idle', defeated = false) => ({
      present: !defeated, defeated, hp: defeated ? 0 : 54, maxHp: 72,
      health: defeated ? 0 : 0.75, damage: defeated ? 72 : 18,
      stage: defeated ? 3 : 1, seal: defeated ? 4 : 2,
      shielded: !defeated, attack, mercy: false,
    });
    const shot = (elapsedMs, patch = {}) => ({
      phase: 'defend', elapsedMs, kills: 4, quota: 8, progress: 0.58,
      wave: 1, warden: makeWarden(), ...patch,
    });
    B.view.finale.reset();

    if (state === 'idle') {
      B.view.finale.started(shot(1000));
    } else if (state === 'packet') {
      B.view.finale.started(shot(2000, { wave: 0 }));
      B.view.finale.sync(shot(2100, { wave: 1 }));
      B.view.finale.sync(shot(2190, { wave: 1 }));
    } else if (state === 'attack') {
      B.view.finale.started(shot(3000, { warden: makeWarden('sweepTell') }));
      B.view.finale.sync(shot(3100, { warden: makeWarden('sweepFire') }));
      B.view.finale.sync(shot(3180, { warden: makeWarden('sweepFire') }));
    } else if (state === 'rupture') {
      B.view.finale.started(shot(4000, { warden: makeWarden('exposed') }));
      B.view.finale.sync(shot(4100, { warden: makeWarden('broken', true) }));
      B.view.finale.sync(shot(4220, { warden: makeWarden('broken', true) }));
    } else if (state === 'transmission') {
      B.view.finale.started(shot(5000, { warden: makeWarden('broken', true) }));
      B.view.finale.transmit(shot(5100, {
        phase: 'transmit', progress: 0.18, wave: 3,
        warden: makeWarden('broken', true),
      }));
      B.view.finale.sync(shot(5260, {
        phase: 'transmit', progress: 0.34, wave: 3,
        warden: makeWarden('broken', true),
      }));
    }

    let drawables = 0;
    scene.traverse((object) => {
      if (object.userData?.environmentRole === 'crown-architecture' && object.isMesh)
        drawables++;
    });
    return {
      crown: CR.crownPresentationSnapshot(),
      crownDrawables: drawables,
      render: { ...renderer.info.render },
    };
  }, { state });
}

await withIsolatedBrowser(repoRoot, async ({ baseUrl, newPage, launch }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  const owned = await newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const { page } = owned;
  page.on('pageerror', (error) => report.errors.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
  });

  try {
    await prepare(page, baseUrl);
    for (const state of ['idle', 'packet', 'attack', 'rupture', 'transmission']) {
      const runtime = await stage(page, state);
      await page.waitForTimeout(50);
      const file = resolve(out, `${state}.png`);
      await page.screenshot({ path: file });
      report.captures.push({ state, file, ...runtime });
    }

    const byState = Object.fromEntries(report.captures.map((row) => [row.state, row]));
    gate(report.errors.length === 0, 'browser emitted no Crown errors', report.errors);
    gate(report.captures.every((row) => row.crown.mechanics.rootAnchored),
      'the far Crown root remains anchored in every action state');
    gate(byState.packet.crown.mechanics.rootCompression > 0.35,
      'a defense packet visibly compresses the buried root family',
      byState.packet.crown.mechanics);
    gate(byState.attack.crown.mechanics.attackCommitted &&
      byState.attack.crown.mechanics.turbineAngle > 0.3,
    'a committed Warden attack advances the separate turbine',
    byState.attack.crown.mechanics);
    gate(Math.abs(byState.rupture.crown.mechanics.antennaWhip) > 0.18,
      'Warden rupture whips the antenna group', byState.rupture.crown.mechanics);
    gate(byState.transmission.crown.mechanics.transmissionRecoil > 0.45,
      'transmission recoils the asymmetric shell/core groups',
      byState.transmission.crown.mechanics);
    gate(new Set(report.captures.map((row) => row.crownDrawables)).size === 1,
      'action states add no Crown drawables',
      report.captures.map((row) => ({ state: row.state, drawables: row.crownDrawables })));
  } catch (error) {
    report.errors.push(error.stack || error.message);
  } finally {
    await owned.close();
  }
});

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length || report.gates.some((row) => !row.ok)) process.exitCode = 1;
