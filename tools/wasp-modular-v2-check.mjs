#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaCensus, decodePng, histogram, readPngSize } from './assets/lib/png.mjs';
import { checkRasterColors } from './assets/lib/palette.mjs';
import {
  selectWaspBodyState, selectWaspWingPhase, WASP_BODY,
} from '../src/render/wasp-modular-select.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = join(root,
  'assets/generated/sprites/wasp-modular-v2/wasp-modular-atlas-v2.manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const atlasFile = join(root, manifest.runtime.file);
const atlas = decodePng(atlasFile);

assert.equal(manifest.bodyStates.length, 8, 'eight body states');
assert.equal(manifest.wingPhases.length, 8, 'eight independent wing phases');
assert.equal(new Set(manifest.bodyStates.map((row) => row.id)).size, 8,
  'body ids are unique');
assert.equal(new Set(manifest.wingPhases.map((row) => row.id)).size, 8,
  'wing ids are unique');
assert.equal(manifest.review.combinations, 64, '8×8 exposes 64 coherent combinations');
assert.deepEqual(manifest.review.selectedSignificantIslands, Array(16).fill(1),
  'selected bodies and wing assemblies each have one significant connected anatomy');
assert.ok(manifest.review.minimumSourceGutterPx >= 15,
  'selected source crops retain at least 15px opaque gutter');
assert.ok(manifest.review.candidateReview
  .filter((row) => row.selected).every((row) => row.issues.length === 0),
'every selected candidate passes crop/anatomy/chroma review');

const atlasSize = readPngSize(atlasFile);
assert.equal(atlasSize.width, 1024, 'atlas width is one compact POT texture');
assert.equal(atlasSize.height, 512, 'atlas height is one compact POT texture');
assert.equal(atlasSize.bitDepth, 8, 'atlas is eight-bit');
assert.equal(atlasSize.colorType, 6, 'atlas is RGBA');
assert.equal(manifest.runtime.gpuTextures, 1);
assert.equal(manifest.runtime.estimatedGpuBytes, 2 * 1024 * 1024);
assert.equal(manifest.runtime.sharedGeometries, 16);
assert.equal(manifest.runtime.meshesPerWasp, 2);
assert.equal(manifest.runtime.drawCallsPerWasp, 2);
assert.equal(manifest.runtime.addedDrawCallsPerWasp, 1);
assert.equal(manifest.runtime.crossfade, false);

function pixelStats(row) {
  const [x0, y0, w, h] = row.packedRectPx;
  const [ax, ay] = row.packedAnchorLocalPx;
  let visible = 0, lowAlpha = 0, darkStructure = 0, acid = 0;
  let sumX = 0, sumY = 0, minY = h, maxY = -1;
  let mask = '';
  const targetW = 40, targetH = 32;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * atlas.width + x0 + x) * 4;
      const r = atlas.rgba[i], g = atlas.rgba[i + 1], b = atlas.rgba[i + 2];
      const a = atlas.rgba[i + 3];
      if (a > 0 && a <= 32) lowAlpha++;
      if (a <= 64) continue;
      visible++; sumX += x; sumY += y;
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (luma < 102) darkStructure++;
      if (g > 118 && g > r * 1.05 && g > b * 1.3) acid++;
    }
  }
  for (let oy = 0; oy < targetH; oy++) {
    const sy0 = Math.floor(oy * h / targetH);
    const sy1 = Math.max(sy0 + 1, Math.ceil((oy + 1) * h / targetH));
    for (let ox = 0; ox < targetW; ox++) {
      const sx0 = Math.floor(ox * w / targetW);
      const sx1 = Math.max(sx0 + 1, Math.ceil((ox + 1) * w / targetW));
      let on = false;
      for (let sy = sy0; sy < sy1 && !on; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          if (atlas.rgba[((y0 + sy) * atlas.width + x0 + sx) * 4 + 3] > 64) {
            on = true; break;
          }
        }
      }
      mask += on ? '1' : '0';
    }
  }
  return {
    visible, mask,
    centroid: [(sumX / visible - ax) / w, (sumY / visible - ay) / h],
    vertical: [(minY - ay) / h, (maxY - ay) / h],
    structureShare: darkStructure / visible,
    acidShare: acid / visible,
    lowAlphaShare: lowAlpha / Math.max(1, visible + lowAlpha),
  };
}

const bodyStats = manifest.bodyStates.map(pixelStats);
const wingStats = manifest.wingPhases.map(pixelStats);
assert.equal(new Set(bodyStats.map((row) => row.mask)).size, 8,
  'all body states remain distinct at a 40×32 shipped-scale mask');
assert.equal(new Set(wingStats.map((row) => row.mask)).size, 8,
  'all wing phases remain distinct at a 40×32 shipped-scale mask');
assert.ok(wingStats.every((row) => row.structureShare >= 0.18),
  'every wing phase carries dark mechanical spars at shipped scale');
assert.ok(wingStats.every((row) => row.acidShare <= 0.72),
  'no wing phase collapses into an undifferentiated acid-green triangle');
assert.ok(wingStats.every((row) => row.lowAlphaShare < 0.10),
  `quiet wing art has no broad low-alpha halo (${wingStats
    .map((row) => row.lowAlphaShare.toFixed(3)).join(', ')})`);

// The cycle must travel raised → horizontal → lowered → raised. Its anchored
// centroid is deliberately coarse; this catches a reordered/strobing source
// without pretending a raster metric can judge animation taste.
const wingY = wingStats.map((row) => row.centroid[1]);
assert.ok(wingY[0] < wingY[2] && wingY[2] < wingY[4],
  'downstroke progresses raised → horizontal → lowered');
assert.ok(wingY[4] > wingY[6] && wingY[6] > wingY[7],
  'upstroke returns lowered → horizontal → raised');
const cycleSteps = wingStats.map((row, i) => {
  const next = wingStats[(i + 1) % wingStats.length];
  return Math.hypot(row.centroid[0] - next.centroid[0],
    row.centroid[1] - next.centroid[1]);
});
assert.ok(Math.max(...cycleSteps) < 0.24,
  `neighboring wing phases must not teleport (${Math.max(...cycleSteps)})`);
assert.ok(manifest.review.wingAnchorDriftCell[0] < 0.06 &&
  manifest.review.wingAnchorDriftCell[1] < 0.07,
'wing-root source drift stays within the modular alignment budget');
assert.ok(manifest.review.bodyAnchorDriftCell[0] < 0.12 &&
  manifest.review.bodyAnchorDriftCell[1] < 0.22,
'reactor source drift is measured and corrected by per-state geometry anchors');

const now = 1000;
const base = { state: 'cruise', t: 0, id: 0, lockUntil: 0, staggerUntil: 0 };
assert.equal(selectWaspBodyState({ ...base, state: 'dive', lockUntil: now + 1 }, now, {}),
  WASP_BODY.DIVE_LOCK, 'existing lock window owns the dive tell art');
assert.equal(selectWaspBodyState({ ...base, state: 'dive', lockUntil: now }, now, {}),
  WASP_BODY.DIVE_ATTACK, 'launch switches exactly when the existing lock expires');
assert.equal(selectWaspBodyState({ ...base, staggerUntil: now + 1 }, now, {}),
  WASP_BODY.HIT_RECOIL, 'existing stagger owns hit recoil');
assert.equal(selectWaspBodyState({ ...base, state: 'recover' }, now, {}),
  WASP_BODY.RECOVER_BRAKE, 'existing recover state owns braking art');
assert.equal(selectWaspBodyState(base, now, { turning: true, dy: 0 }),
  WASP_BODY.TURN_BANK, 'render-local facing change selects the turn silhouette');
assert.deepEqual([...Array(8)].map((_, phase) => selectWaspWingPhase({
  ...base, t: phase / (8 * 3.25), id: 0,
})), [...Array(8).keys()], 'one 3.25Hz cycle visits all eight adjacent phases in order');

const palette = checkRasterColors(histogram(atlasFile, { alphaFloor: 32, weight: 'alpha' }).colors);
assert.ok(palette.ok && palette.offBandMass === 0 && palette.alienMass === 0,
  `atlas palette drift: ${JSON.stringify(palette.failures)}`);
const alpha = alphaCensus(atlasFile);
assert.ok(alpha.transparent > 60 && alpha.partial > 1 && alpha.opaque > 1,
  'atlas has real transparent guards and antialiased painted action');

function jsFilesBelow(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesBelow(file));
    else if (entry.name.endsWith('.js')) out.push(file);
  }
  return out;
}
const forbidden = jsFilesBelow(join(root, 'src/sim'))
  .concat(jsFilesBelow(join(root, 'src/pure')))
  .filter((file) => /wasp-modular/.test(readFileSync(file, 'utf8')));
assert.deepEqual(forbidden, [], 'sim and pure layers cannot import modular presentation');

console.log(JSON.stringify({
  ok: true,
  candidates: manifest.review.candidates,
  selected: manifest.review.selected,
  combinations: manifest.review.combinations,
  runtime: manifest.runtime,
  minSourceGutterPx: manifest.review.minimumSourceGutterPx,
  bodyAnchorDriftCell: manifest.review.bodyAnchorDriftCell,
  wingAnchorDriftCell: manifest.review.wingAnchorDriftCell,
  wingCycleY: wingY.map((v) => Number(v.toFixed(3))),
  wingCycleSteps: cycleSteps.map((v) => Number(v.toFixed(3))),
  wingStructureShare: wingStats.map((v) => Number(v.structureShare.toFixed(3))),
  wingAcidShare: wingStats.map((v) => Number(v.acidShare.toFixed(3))),
  alpha,
  palette: { inBandMass: palette.inBandMass, offBandMass: palette.offBandMass,
    alienMass: palette.alienMass, roles: palette.roles },
}, null, 2));
