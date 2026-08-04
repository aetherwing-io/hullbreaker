#!/usr/bin/env node
/* Real-browser proof for the current six-face Meridian defense response.
 * Boots the shipped composition root, walks all six existing faces, captures
 * real tell/fire/recovery/spent/turn states, and compares the fixed renderer to the
 * render-only `?defensevfx=0` escape hatch. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-meridian-defense-runtime');
await mkdir(out, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const PORTRAIT = { width: 900, height: 1200 };
const STATES = ['observe', 'intercept', 'contain', 'quarantine', 'sterilize', 'scuttle'];
const errors = [];
const report = { output: out, browser: null, faces: [], captures: {}, turn: null,
  resources: null, livePerformance: null, gates: [], errors };
const gate = (ok, label, detail = null) =>
  report.gates.push({ ok: Boolean(ok), label, detail });

async function boot(newPage, { off = false, viewport = DESKTOP } = {}) {
  const owned = await newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const { page } = owned;
  const tag = off ? 'off' : 'production';
  page.on('pageerror', (error) => errors.push(`${tag}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${tag}: console: ${message.text()}`);
  });
  const query = off ? '&defensevfx=0' : '';
  await page.goto(`${globalThis.__defenseBase}/index.html?testapi=1&shell=0&audio=0` +
    `&view=far&fixeddt=20${query}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING' &&
    globalThis.__HB_MERIDIAN_DEFENSE_VFX && globalThis.__HB_DEFENSE_VFX_ART,
  null, { timeout: 40000 });
  await page.addStyleTag({ content: '#overlay { display: none !important; }' });
  await page.evaluate(async () => {
    const [C, D, H, L, P, R, SP, ST, T, W, WG] = await Promise.all([
      import('/src/config.js'),
      import('/src/pure/meridian-defense-lifecycle.js'),
      import('/src/sim/hostiles.js'),
      import('/src/sim/level.js'),
      import('/src/sim/player.js'),
      import('/src/render/scene.js'),
      import('/src/sim/spawner.js'),
      import('/src/sim/state.js'),
      import('/src/sim/time.js'),
      import('/src/sim/weapons.js'),
      import('/src/sim/wavegate.js'),
    ]);
    globalThis.__MERIDIAN_DEFENSE_QA__ = { C, D, H, L, P, R, SP, ST, T, W, WG };
  });
  return owned;
}

async function resourceSnapshot(page) {
  return page.evaluate(() => {
    const q = globalThis.__MERIDIAN_DEFENSE_QA__;
    const info = q.R.renderer.info;
    return {
      memory: { ...info.memory },
      render: { ...info.render },
      perf: globalThis.HB.perf(),
      art: globalThis.__HB_DEFENSE_VFX_ART(),
      vfx: globalThis.__HB_MERIDIAN_DEFENSE_VFX(),
      sim: globalThis.HB.snapshot().meridianDefense,
      pressure: q.SP.pressureDirectorSnapshot(),
    };
  });
}

async function enterFace(page, face) {
  return page.evaluate((face) => {
    const q = globalThis.__MERIDIAN_DEFENSE_QA__;
    const C = q.C.CONFIG;
    q.ST.setState('PAUSED');
    q.H.clearHostiles();
    q.W.clearBullets();
    for (let i = 0; i < face - 1; i++) {
      const corner = q.WG.cornerEvents[i];
      if (corner.state === 'done') continue;
      corner.sealed = true;
      q.WG.finishCorner(corner);
    }
    const phase = face - 1;
    const faceStart = C.path.introTiles + phase * C.path.faceTiles;
    const faceEnd = faceStart + C.path.faceTiles;
    const trigger = q.D.MERIDIAN_DEFENSE_TRIGGER_TILES[phase];
    const lessonSites = q.SP.spawnTable.filter((row) => {
      const f = Math.max(1, Math.min(C.path.faces,
        1 + Math.floor(Math.max(0, row.x - C.path.introTiles) / C.path.faceTiles)));
      return C.spawner.lesson.kindByFace[f - 1] === row.type;
    });
    const wanted = faceStart + trigger + 2;
    let playerX = null;
    let playerY = null;
    let best = Infinity;
    for (let x = faceStart + trigger; x <= Math.min(faceStart + 21, faceEnd - 22); x += 0.25) {
      const y = q.L.groundTopAt(x);
      const yl = q.L.groundTopAt(x - 0.55);
      const yr = q.L.groundTopAt(x + 0.55);
      if (y <= -100 || yl <= -100 || yr <= -100) continue;
      if (Math.max(Math.abs(yl - y), Math.abs(yr - y)) > C.hound.stepUpTiles) continue;
      if (lessonSites.some((row) => Math.abs(x - row.x) < C.spawner.lesson.clearTiles + 1))
        continue;
      const distance = Math.abs(x - wanted);
      if (distance < best) { best = distance; playerX = x; playerY = y; }
    }
    if (playerX === null) throw new Error(`face ${face} has no defense proof standing patch`);
    q.T.setScrollX(faceStart + 2);
    q.P.player.x = playerX;
    q.P.player.y = playerY + 0.001;
    q.P.player.vx = 0;
    q.P.player.vy = 0;
    q.P.player.grounded = true;
    q.P.player.onOneWay = null;
    q.P.player.hp = C.player.maxHealth;
    q.P.player.lives = 99;
    q.P.player.iframesUntil = Number.MAX_SAFE_INTEGER;
    // Arm the real pressure observer at the new route position before the
    // next ordinary animation frame asks the lifecycle to activate.
    q.SP.updateSpawner();
    q.H.clearHostiles();
    q.W.clearBullets();
    q.ST.setState('PLAYING');
    return { face, faceStart, faceEnd, trigger, playerX, playerY };
  }, face);
}

async function waitStage(page, face, stage, { progress = 0, socket = false } = {}) {
  await page.waitForFunction(({ face, stage, progress, socket }) => {
    const sim = globalThis.HB.snapshot().meridianDefense?.presentation;
    const vfx = globalThis.__HB_MERIDIAN_DEFENSE_VFX();
    return sim?.face === face && sim.stage === stage && sim.progress >= progress &&
      (!socket || !!vfx.socketId);
  }, { face, stage, progress, socket }, { timeout: 8000 });
  return resourceSnapshot(page);
}

async function freezeCapture(page, file, viewport = null) {
  await page.evaluate(() => globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PAUSED'));
  if (viewport) await page.setViewportSize(viewport);
  await page.waitForTimeout(80);
  const snapshot = await resourceSnapshot(page);
  await page.screenshot({ path: file });
  if (viewport) await page.setViewportSize(DESKTOP);
  await page.evaluate(() => globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PLAYING'));
  return snapshot;
}

async function walkSixFaces(page) {
  const baseline = await resourceSnapshot(page);
  let face3Fire = null;
  for (let face = 1; face <= 6; face++) {
    const setup = await enterFace(page, face);
    await waitStage(page, face, 'tell', { progress: 0.34, socket: true });
    const tell = await resourceSnapshot(page);
    if (face === 1) {
      const file = resolve(out, 'face1-observe-tell-desktop.png');
      report.captures.face1TellDesktop = file;
      await freezeCapture(page, file);
    }
    if (face === 6) {
      const desktop = resolve(out, 'face6-scuttle-tell-desktop.png');
      report.captures.face6TellDesktop = desktop;
      await freezeCapture(page, desktop);
      const portrait = resolve(out, 'face6-scuttle-tell-portrait.png');
      report.captures.face6TellPortrait = portrait;
      await freezeCapture(page, portrait, PORTRAIT);
    }
    await waitStage(page, face, 'fire', { progress: 0.08, socket: true });
    const fire = await resourceSnapshot(page);
    if (face === 3) {
      const file = resolve(out, 'face3-contain-fire-desktop.png');
      report.captures.face3FireDesktop = file;
      face3Fire = await freezeCapture(page, file);
    }
    if (face === 6) {
      const desktop = resolve(out, 'face6-scuttle-fire-desktop.png');
      report.captures.face6FireDesktop = desktop;
      await freezeCapture(page, desktop);
      const portrait = resolve(out, 'face6-scuttle-fire-portrait.png');
      report.captures.face6FirePortrait = portrait;
      await freezeCapture(page, portrait, PORTRAIT);
    }
    const recovery = await waitStage(page, face, 'recovery', {
      progress: face === 6 ? 0.16 : 0,
      socket: true,
    });
    if (face === 6) {
      const desktop = resolve(out, 'face6-scuttle-recovery-desktop.png');
      report.captures.face6RecoveryDesktop = desktop;
      await freezeCapture(page, desktop);
      const portrait = resolve(out, 'face6-scuttle-recovery-portrait.png');
      report.captures.face6RecoveryPortrait = portrait;
      await freezeCapture(page, portrait, PORTRAIT);
    }
    await page.waitForFunction((face) => {
      const snapshot = globalThis.HB.snapshot().meridianDefense;
      const p = snapshot?.presentation;
      return p?.face === face && p.stage === 'dormant' && p.reason === 'spent';
    }, face, { timeout: 8000 });
    const after = await resourceSnapshot(page);
    if (face === 6) {
      const desktop = resolve(out, 'face6-scuttle-spent-desktop.png');
      report.captures.face6SpentDesktop = desktop;
      await freezeCapture(page, desktop);
      const portrait = resolve(out, 'face6-scuttle-spent-portrait.png');
      report.captures.face6SpentPortrait = portrait;
      await freezeCapture(page, portrait, PORTRAIT);
    }
    report.faces.push({ face, state: STATES[face - 1], setup,
      tell: { sim: tell.sim, vfx: tell.vfx },
      fire: { sim: fire.sim, vfx: fire.vfx, pressure: fire.pressure.telemetry },
      recovery: { sim: recovery.sim, vfx: recovery.vfx },
      after: { sim: after.sim, vfx: after.vfx, pressure: after.pressure.telemetry } });
  }
  // This rolling number intentionally remains capture-contaminated and is
  // reported under captureCadencePerf below. A separate simultaneous ON/OFF
  // pair owns the actual no-capture live-frame gate.
  return { baseline, final: await resourceSnapshot(page), face3Fire };
}

async function runFace3Comparison(page) {
  const baseline = await resourceSnapshot(page);
  await enterFace(page, 3);
  await waitStage(page, 3, 'fire', { progress: 0.08, socket: false });
  const fire = await resourceSnapshot(page);
  return { baseline, fire };
}

async function sampleLiveFrames(page, count = 36) {
  return page.evaluate((wanted) => new Promise((resolveSample) => {
    const deltas = [];
    let previous = 0;
    const tick = (now) => {
      if (previous) deltas.push(now - previous);
      previous = now;
      if (deltas.length < wanted) requestAnimationFrame(tick);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const quantile = (p) => sorted[Math.min(sorted.length - 1,
          Math.floor((sorted.length - 1) * p))];
        resolveSample({
          samples: deltas.length,
          averageMs: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
          medianMs: quantile(0.50),
          p75Ms: quantile(0.75),
          p95Ms: quantile(0.95),
          minMs: sorted[0],
          maxMs: sorted.at(-1),
        });
      }
    };
    requestAnimationFrame(tick);
  }), count);
}

async function measureLivePair(newPage) {
  // Both pages remain visible and render concurrently, so background machine
  // contention is shared.  No screenshots, viewport swaps or PNG encoding run
  // inside this sample. Each page is paused on the same real Contain fire beat;
  // the only systematic difference is the defense renderer escape hatch.
  const onOwned = await boot(newPage);
  await onOwned.page.evaluate(() =>
    globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PAUSED'));
  const offOwned = await boot(newPage, { off: true });
  await offOwned.page.evaluate(() =>
    globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PAUSED'));
  try {
    await Promise.all([
      (async () => {
        await enterFace(onOwned.page, 3);
        await waitStage(onOwned.page, 3, 'fire', { progress: 0.12, socket: true });
        await onOwned.page.evaluate(() =>
          globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PAUSED'));
      })(),
      (async () => {
        await enterFace(offOwned.page, 3);
        await waitStage(offOwned.page, 3, 'fire', { progress: 0.12, socket: false });
        await offOwned.page.evaluate(() =>
          globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PAUSED'));
      })(),
    ]);
    await Promise.all([onOwned.page.waitForTimeout(500), offOwned.page.waitForTimeout(500)]);
    const [onFrames, offFrames, onResources, offResources] = await Promise.all([
      sampleLiveFrames(onOwned.page), sampleLiveFrames(offOwned.page),
      resourceSnapshot(onOwned.page), resourceSnapshot(offOwned.page),
    ]);
    return {
      mode: 'simultaneous-no-capture-rAF',
      state: 'paused-real-face3-fire',
      on: { frames: onFrames, render: onResources.render, memory: onResources.memory },
      off: { frames: offFrames, render: offResources.render, memory: offResources.memory },
      incremental: {
        medianMs: onFrames.medianMs - offFrames.medianMs,
        p75Ms: onFrames.p75Ms - offFrames.p75Ms,
        calls: onResources.render.calls - offResources.render.calls,
        triangles: onResources.render.triangles - offResources.render.triangles,
      },
    };
  } finally {
    await Promise.all([onOwned.close(), offOwned.close()]);
  }
}

async function captureTurn(newPage) {
  const owned = await boot(newPage);
  const { page } = owned;
  await enterFace(page, 1);
  await waitStage(page, 1, 'tell', { progress: 0.24, socket: true });
  await page.evaluate(() => {
    const q = globalThis.__MERIDIAN_DEFENSE_QA__;
    const corner = q.WG.cornerEvents[0];
    q.T.setScrollX(corner.s - q.C.CONFIG.waves.haltOffset);
    q.P.player.x = corner.s - q.C.CONFIG.waves.haltOffset + 2;
    corner.state = 'turning';
    corner.tStart = q.T.gameMs - 550;
  });
  await page.waitForFunction(() => {
    const sim = globalThis.HB.snapshot().meridianDefense;
    const vfx = globalThis.__HB_MERIDIAN_DEFENSE_VFX();
    return sim?.presentation?.stage === 'dormant' && vfx.drawSlots === 0;
  }, null, { timeout: 5000 });
  await page.evaluate(() => globalThis.__MERIDIAN_DEFENSE_QA__.ST.setState('PAUSED'));
  await page.waitForTimeout(80);
  const file = resolve(out, 'turn1-mid-defense-dormant.png');
  await page.screenshot({ path: file });
  const during = await resourceSnapshot(page);
  // Prove that a pre-fire interruption returned its activation token instead
  // of leaving the face permanently consumed.
  await page.evaluate(() => {
    const q = globalThis.__MERIDIAN_DEFENSE_QA__;
    const corner = q.WG.cornerEvents[0];
    corner.state = 'idle';
    corner.primed = false;
    q.T.setScrollX(q.C.CONFIG.path.introTiles + 2);
    q.P.player.x = q.C.CONFIG.path.introTiles + 10;
    q.ST.setState('PLAYING');
  });
  await waitStage(page, 1, 'tell', { progress: 0, socket: true });
  const retried = await resourceSnapshot(page);
  await owned.close();
  return { file, during, retried };
}

await withIsolatedBrowser(repoRoot, async ({ baseUrl, launch, newPage }) => {
  globalThis.__defenseBase = baseUrl;
  report.browser = { channel: launch.channel, via: launch.via };
  const productionOwned = await boot(newPage);
  const production = await walkSixFaces(productionOwned.page);
  await productionOwned.close();
  // Use fresh, otherwise identical face-3 pages for the render-only A/B.
  // Comparing against the six-face walk includes unrelated lazy world assets
  // and makes renderer.info.memory describe different loaded builds.
  const matchedOwned = await boot(newPage);
  const matched = await runFace3Comparison(matchedOwned.page);
  await matchedOwned.close();
  const offOwned = await boot(newPage, { off: true });
  const off = await runFace3Comparison(offOwned.page);
  await offOwned.close();
  report.turn = await captureTurn(newPage);
  report.resources = { production, matched, off };
  report.livePerformance = await measureLivePair(newPage);
});

const finalVfx = report.resources.production.final.vfx;
const finalSim = report.resources.production.final.sim;
const faceSockets = Object.values(finalVfx.faceSockets);
const face3On = report.resources.matched.fire;
const face3Off = report.resources.off.fire;
const memoryDelta = {
  geometries: face3On.memory.geometries - face3Off.memory.geometries,
  textures: face3On.memory.textures - face3Off.memory.textures,
  calls: face3On.render.calls - face3Off.render.calls,
  triangles: face3On.render.triangles - face3Off.render.triangles,
};
report.resources.deltaAtFace3Fire = memoryDelta;

gate(errors.length === 0, 'browser emitted no page or console errors', errors);
gate(finalSim.activations === 6 && finalSim.impulses === 6 &&
  finalSim.activatedMask === 63 && finalSim.impulseMask === 63,
'faces 1-6 activate once and queue exactly one impulse each', finalSim);
gate(faceSockets.length === 6 && faceSockets.every((row, i) =>
  row.phase === i && row.state === STATES[i] && row.routeS <= row.cornerLimit &&
  row.playerDistance >= 2.4),
'every face resolves a current-face, corner-safe, off-player socket', finalVfx.faceSockets);
gate(report.faces[0].state === 'observe' && report.faces[0].tell.vfx.socketId &&
  report.faces[5].state === 'scuttle' && report.faces[5].tell.vfx.socketId,
'Observe and Scuttle each visibly activate on their own route sockets');
gate(report.faces.every((row) => row.after.vfx.drawSlots === 0 &&
  row.after.vfx.mechanismDrawSlots === 0 &&
  row.after.vfx.stage === 'dormant'),
'dormant and post-spent states submit zero defense draws');
gate(report.faces.every((row) => row.after.pressure.environment.signals >= row.face),
'each fire impulse reaches pressure only through a later safe spawner window',
report.faces.map((row) => [row.face, row.after.pressure.environment]));
gate(report.faces.every((row) => row.after.pressure.committedThreats <= 4),
'environment-provoked adaptive pressure remains inside the four-threat envelope');
gate(report.faces.every((row) => row.after.pressure.bodies.face <= 2),
'environment impulses never bypass the adaptive outstanding-body ceiling');
gate(report.turn.during.vfx.drawSlots === 0 &&
  report.turn.during.sim.presentation.stage === 'dormant' &&
  report.turn.retried.sim.presentation.stage === 'tell' &&
  report.turn.retried.vfx.socketId,
'mid-turn owns zero VFX and a pre-fire interruption safely retries afterward');
gate(finalVfx.poolGeometry === 1 && finalVfx.poolSlots === 1 &&
  finalVfx.maxVisible === 1 && finalVfx.atlasTextures === 1 &&
  finalVfx.mechanismPools === 2 && finalVfx.mechanismParts === 10 &&
  finalVfx.fixedAtBoot === true && finalVfx.textureTransforms === false,
'runtime stays at one atlas draw plus two fixed body-mechanism pools', finalVfx);
gate(memoryDelta.geometries >= 0 && memoryDelta.geometries <= 4 &&
  memoryDelta.textures >= 0 && memoryDelta.textures <= 1 &&
  memoryDelta.calls <= 10 && memoryDelta.triangles <= 420,
'matched render-only A/B stays inside the fixed four-geometry mechanism budget', memoryDelta);
const live = report.livePerformance;
gate(live.on.frames.samples === live.off.frames.samples &&
  live.on.frames.samples >= 36 &&
  live.on.frames.medianMs <= live.off.frames.medianMs * 1.35 + 6 &&
  live.on.frames.p75Ms <= live.off.frames.p75Ms * 1.35 + 8 &&
  live.incremental.calls <= 10 && live.incremental.triangles <= 420,
'simultaneous no-capture live frames keep defense overhead bounded', live);

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
const summary = {
  output: out,
  browser: report.browser,
  faces: report.faces.map((row) => ({
    face: row.face, state: row.state,
    socket: row.tell.vfx.faceSockets[row.face],
    tell: row.tell.vfx.faceComponents[row.face]?.tell,
    fire: row.fire.vfx.faceComponents[row.face]?.fire,
    environmentSignals: row.after.pressure.environment.signals,
    committed: row.after.pressure.committedThreats,
  })),
  lifecycle: { activations: finalSim.activations, impulses: finalSim.impulses,
    dormantDraws: finalVfx.dormantDraws, componentsUsed: finalVfx.componentsUsed },
  resources: memoryDelta,
  captureCadencePerf: report.resources.production.final.perf,
  livePerformance: report.livePerformance,
  captures: report.captures,
  turn: report.turn.file,
  gates: report.gates,
  errors,
};
await writeFile(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (errors.length || report.gates.some((row) => !row.ok)) process.exitCode = 1;
