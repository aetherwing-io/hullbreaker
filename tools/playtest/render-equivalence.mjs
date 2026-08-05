#!/usr/bin/env node
// Matched-frame pixel gates for T-058 (single-pass transparent quads) and
// T-061 (canvas MSAA removed behind the composed path).

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] || '/private/tmp/hullbreaker-render-equivalence');
const BASE = 'testapi=1&shell=0&audio=0&adaptive=0&fixeddt=16.667';

function diffPixels(a, b) {
  if (a.length !== b.length) return { sameSize: false, bytesA: a.length, bytesB: b.length };
  let changedBytes = 0, changedPixels = 0, maxDelta = 0, totalDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let pixelChanged = false;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(a[i + c] - b[i + c]);
      if (delta) { changedBytes++; pixelChanged = true; }
      if (delta > maxDelta) maxDelta = delta;
      totalDelta += delta;
    }
    if (pixelChanged) changedPixels++;
  }
  return {
    sameSize: true, bytes: a.length, pixels: a.length / 4,
    changedBytes, changedPixels,
    changedPixelPercent: +(changedPixels / (a.length / 4) * 100).toFixed(6),
    meanChannelDelta: +(totalDelta / a.length).toFixed(8), maxDelta,
    byteIdentical: changedBytes === 0,
  };
}

function withinNoise(diff, ...noise) {
  const changed = Math.max(...noise.map((row) => row.changedPixelPercent));
  const mean = Math.max(...noise.map((row) => row.meanChannelDelta));
  const max = Math.max(...noise.map((row) => row.maxDelta));
  return diff.changedPixelPercent <= changed + 0.05 &&
    diff.meanChannelDelta <= mean + 0.01 && diff.maxDelta <= max + 2;
}

async function readFrame(page, singlePass = true) {
  const frame = await page.evaluate(async (forceSinglePass) => {
    const S = await import('/src/render/scene.js');
    const P = await import('/src/render/post.js');
    const seen = new Set();
    let toggled = 0;
    S.scene.traverse((object) => {
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!material || seen.has(material.uuid)) continue;
        seen.add(material.uuid);
        if (material.transparent && material.side === 2 &&
            !material.userData?.allowTwoPassTransparent) {
          material.forceSinglePass = forceSinglePass;
          toggled++;
        }
      }
    });
    P.renderFrame();
    const gl = S.renderer.getContext();
    gl.finish();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let binary = '';
    for (let i = 0; i < pixels.length; i += 0x8000)
      binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
    return {
      width, height, toggled, pixels: btoa(binary),
      resources: S.rendererResourceSnapshot(),
      materials: S.materialSubmissionSnapshot(),
      snapshot: window.HB.snapshot(),
    };
  }, singlePass);
  return { ...frame, pixels: Buffer.from(frame.pixels, 'base64') };
}

async function auditMaterialDeltas(page) {
  return page.evaluate(async () => {
    const S = await import('/src/render/scene.js');
    const P = await import('/src/render/post.js');
    const gl = S.renderer.getContext();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const bytes = width * height * 4;
    const before = new Uint8Array(bytes);
    const after = new Uint8Array(bytes);
    const owners = new Map();
    S.scene.traverse((object) => {
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!material?.transparent || material.side !== 2 ||
            material.userData?.allowTwoPassTransparent) continue;
        let rows = owners.get(material);
        if (!rows) owners.set(material, rows = []);
        rows.push({ object: object.name || object.type,
          geometry: object.geometry?.type || null });
      }
    });
    const changed = [];
    for (const [material, rows] of owners) {
      material.forceSinglePass = false;
      P.renderFrame(); gl.finish();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, before);
      material.forceSinglePass = true;
      P.renderFrame(); gl.finish();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, after);
      let changedPixels = 0, totalDelta = 0, maxDelta = 0;
      for (let i = 0; i < bytes; i += 4) {
        let pixelChanged = false;
        for (let c = 0; c < 4; c++) {
          const delta = Math.abs(before[i + c] - after[i + c]);
          totalDelta += delta;
          if (delta) pixelChanged = true;
          if (delta > maxDelta) maxDelta = delta;
        }
        if (pixelChanged) changedPixels++;
      }
      if (changedPixels) changed.push({
        id: material.id,
        name: material.name || null,
        type: material.type,
        changedPixelPercent: +(changedPixels / (bytes / 4) * 100).toFixed(6),
        meanChannelDelta: +(totalDelta / bytes).toFixed(8),
        maxDelta,
        owners: rows.slice(0, 8),
      });
    }
    return changed.sort((a, b) => b.meanChannelDelta - a.meanChannelDelta);
  });
}

async function open(owner, query, targetMs, action = false) {
  const handle = await owner.newPage({ viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1 });
  await handle.page.goto(`${owner.baseUrl}/index.html?${query}`, {
    waitUntil: 'load', timeout: 45000,
  });
  await handle.page.waitForFunction(() => window.HB?.state() === 'PLAYING', null,
    { timeout: 20000 });
  if (action) await handle.page.keyboard.down('j');
  await handle.page.waitForFunction((ms) => window.HB.gameMs() >= ms, targetMs,
    { timeout: 15000 });
  if (action) await handle.page.keyboard.up('j');
  await handle.page.evaluate(async () => {
    const state = await import('/src/sim/state.js');
    state.setState('PAUSED');
  });
  return handle;
}

await mkdir(OUT, { recursive: true });
const result = { measuredAt: new Date().toISOString(),
  tool: 'tools/playtest/render-equivalence.mjs' };

await withIsolatedBrowser(ROOT, async (owner) => {
  const combat = await open(owner, BASE, 750, false);
  const combatOptimized = await readFrame(combat.page, true);
  const combatRepeat = await readFrame(combat.page, true);
  const combatLegacy = await readFrame(combat.page, false);
  await combat.page.screenshot({ path: resolve(OUT, 'combat-two-pass.png') });
  await readFrame(combat.page, true);
  await combat.page.screenshot({ path: resolve(OUT, 'combat-single-pass.png') });
  const combatNoise = diffPixels(combatOptimized.pixels, combatRepeat.pixels);
  const combatDiff = diffPixels(combatRepeat.pixels, combatLegacy.pixels);
  result.singlePassCombat = {
    toggledMaterials: combatOptimized.toggled,
    noise: combatNoise,
    diff: combatDiff,
    withinNoise: withinNoise(combatDiff, combatNoise),
  };
  await combat.close();

  const action = await open(owner, BASE, 4200, true);
  const actionOptimized = await readFrame(action.page, true);
  const actionRepeat = await readFrame(action.page, true);
  const actionLegacy = await readFrame(action.page, false);
  await action.page.screenshot({ path: resolve(OUT, 'action-two-pass.png') });
  await readFrame(action.page, true);
  await action.page.screenshot({ path: resolve(OUT, 'action-single-pass.png') });
  const actionNoise = diffPixels(actionOptimized.pixels, actionRepeat.pixels);
  const actionDiff = diffPixels(actionRepeat.pixels, actionLegacy.pixels);
  result.singlePassAction = {
    toggledMaterials: actionOptimized.toggled,
    noise: actionNoise,
    diff: actionDiff,
    withinNoise: withinNoise(actionDiff, actionNoise),
  };
  if (!result.singlePassAction.withinNoise)
    result.singlePassAction.materialDeltas = await auditMaterialDeltas(action.page);
  await action.close();

  const noCanvasAa = await open(owner, BASE, 750, false);
  const oldCanvasAa = await open(owner, `${BASE}&canvasaa=1`, 750, false);
  const noAaFrame = await readFrame(noCanvasAa.page, true);
  const noAaRepeat = await readFrame(noCanvasAa.page, true);
  const oldAaFrame = await readFrame(oldCanvasAa.page, true);
  const oldAaRepeat = await readFrame(oldCanvasAa.page, true);
  await noCanvasAa.page.screenshot({ path: resolve(OUT, 'composer-canvas-msaa-off.png') });
  await oldCanvasAa.page.screenshot({ path: resolve(OUT, 'composer-canvas-msaa-on.png') });
  result.composerCanvasMsaa = {
    off: noAaFrame.resources.context,
    on: oldAaFrame.resources.context,
    sameSimFrame: noAaFrame.snapshot.gameMs === oldAaFrame.snapshot.gameMs &&
      noAaFrame.snapshot.scrollX === oldAaFrame.snapshot.scrollX,
    offNoise: diffPixels(noAaFrame.pixels, noAaRepeat.pixels),
    onNoise: diffPixels(oldAaFrame.pixels, oldAaRepeat.pixels),
    diff: diffPixels(noAaRepeat.pixels, oldAaRepeat.pixels),
  };
  result.composerCanvasMsaa.withinNoise = withinNoise(
    result.composerCanvasMsaa.diff,
    result.composerCanvasMsaa.offNoise,
    result.composerCanvasMsaa.onNoise,
  );
  await noCanvasAa.close();
  await oldCanvasAa.close();
});

const failures = [];
for (const [name, gate] of [
  ['single-pass combat', result.singlePassCombat],
  ['single-pass action', result.singlePassAction],
]) if (!gate.withinNoise) failures.push(`${name}: delta exceeds repeat-render noise`);
if (!result.composerCanvasMsaa.sameSimFrame)
  failures.push('canvas MSAA pages did not settle on the same sim frame');
if (!result.composerCanvasMsaa.withinNoise)
  failures.push('canvas MSAA: delta exceeds repeat-render noise');
if (result.composerCanvasMsaa.off.samples > 1)
  failures.push(`composer default framebuffer still has ${result.composerCanvasMsaa.off.samples} samples`);
if (result.composerCanvasMsaa.on.samples < 2)
  failures.push(`forced old canvas path has only ${result.composerCanvasMsaa.on.samples} samples`);
result.failures = failures;
await writeFile(resolve(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out: OUT, ...result }, (key, value) =>
  Buffer.isBuffer(value) ? undefined : value, 2));
if (failures.length) process.exitCode = 1;
