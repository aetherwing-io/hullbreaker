#!/usr/bin/env node
/* Focused asset gate for the reviewed action-VFX v2 candidate pack. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaCensus, decodePng, histogram, readPngSize } from './assets/lib/png.mjs';
import { checkRasterColors } from './assets/lib/palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/generated/vfx/action-vfx-v2');
const manifest = JSON.parse(readFileSync(join(dir, 'action-vfx-v2.manifest.json'), 'utf8'));
const provenance = JSON.parse(readFileSync(join(dir, 'action-vfx-v2.provenance.json'), 'utf8'));
const atlasFile = join(root, manifest.runtime.file);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
let passes = 0;
const ok = (condition, label) => { assert.ok(condition, label); passes++; };

ok(manifest.schema === 'hullbreaker-action-vfx-v2' && manifest.version === 2,
  'v2 schema');
ok(manifest.assetOnly === true && manifest.runtimeIntegrated === false,
  'reviewed pack remains asset-only');
ok(manifest.components.length === 64 &&
  new Set(manifest.components.map((entry) => entry.id)).size === 64,
  '64 unique auditable cells');
ok(manifest.review.productionCount === 59 && manifest.review.rejectedCount === 5 &&
  manifest.review.smallScaleProductionCount === 42 &&
  manifest.review.mediumScaleProductionCount === 17,
  'review counts and scale tiers are frozen');
ok(manifest.review.rejectedIds.every((id) =>
  !manifest.review.productionIds.includes(id)), 'rejected cells are never production IDs');

const size = readPngSize(atlasFile);
ok(size.width === 1024 && size.height === 1024 && size.bitDepth === 8 && size.colorType === 6,
  'one 1024 square RGBA8 atlas');
ok(manifest.runtime.cellPx[0] === 128 && manifest.runtime.cellPx[1] === 128 &&
  manifest.runtime.estimatedGpuBytes === 4 * 1024 * 1024,
  '128px cells in one 4 MiB texture');
ok(manifest.runtime.noRuntimeCrop === true,
  'pack forbids runtime pixel crops/copies');
ok(sha256(atlasFile) === manifest.metrics.sha256 &&
  sha256(atlasFile) === provenance.packing.atlasSha256, 'atlas hashes agree');

const atlas = decodePng(atlasFile);
let minimumGuard = 128;
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    let x0 = 128, y0 = 128, x1 = -1, y1 = -1;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const a = atlas.rgba[(((row * 128 + y) * atlas.width) + col * 128 + x) * 4 + 3];
        if (a <= 32) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    ok(x1 >= x0 && y1 >= y0, `cell ${col},${row} is not empty`);
    minimumGuard = Math.min(minimumGuard, x0, y0, 127 - x1, 127 - y1);
  }
}
ok(minimumGuard >= 6 && minimumGuard === manifest.metrics.minimumTransparentGuardPx,
  'all cells retain six transparent guard pixels');

const alpha = alphaCensus(atlasFile);
ok(alpha.transparent > 75 && alpha.partial > 5 && alpha.opaque > 5,
  'atlas has real transparent gutters, feathered edges, and opaque action');
const palette = checkRasterColors(
  histogram(atlasFile, { alphaFloor: 32, weight: 'alpha' }).colors);
ok(palette.ok && palette.inBandMass === 1 && palette.alienMass === 0,
  'project palette validation is exact');

let visibleWeight = 0, forbiddenWeight = 0;
for (let i = 0; i < atlas.rgba.length; i += 4) {
  const r = atlas.rgba[i], g = atlas.rgba[i + 1], b = atlas.rgba[i + 2], a = atlas.rgba[i + 3];
  if (a <= 32) continue;
  const w = a / 255; visibleWeight += w;
  if (b > r + 12 || g > r + 12 ||
      (g > r + 14 && g > b + 8) || (r > g + 14 && b > g + 14)) forbiddenWeight += w;
}
ok(forbiddenWeight === 0 && visibleWeight > 0,
  'no cyan, acid-green, or magenta is baked into visible pixels');

ok(manifest.components.every((entry) =>
  entry.uv.length === 4 && entry.uv[0] >= 0 && entry.uv[1] >= 0 &&
  entry.uv[2] <= 1 && entry.uv[3] <= 1 && entry.uv[2] > entry.uv[0] &&
  entry.uv[3] > entry.uv[1] && entry.nativeAspect > 0 &&
  entry.pivot.length === 2 && entry.pivot.every((v) => v >= 0 && v <= 1) &&
  entry.timing.durationMs > 0 && [12, 24].includes(entry.screenExtentPx.min) &&
  entry.screenExtentPx.max === 48),
  'every component publishes valid UV/aspect/pivot/timing/scale data');

for (const board of provenance.boards) {
  const chroma = join(root, board.chroma);
  const cutout = join(root, board.alpha);
  const chromaSize = readPngSize(chroma), alphaSize = readPngSize(cutout);
  ok(chromaSize.width === 1254 && chromaSize.height === 1254,
    `${board.id} chroma source is 1254 square`);
  ok(alphaSize.width === 1254 && alphaSize.height === 1254 && alphaSize.colorType === 6,
    `${board.id} cutout is RGBA`);
  ok(sha256(chroma) === board.chromaSha256 && sha256(cutout) === board.alphaSha256,
    `${board.id} source hashes agree`);
}

for (const [name, expected] of [
  ['action-vfx-v2-contact-sheet.png', [2048, 2048]],
  ['proofs/action-vfx-v2-48px-proof.png', [1536, 1536]],
  ['proofs/action-vfx-v2-24px-proof.png', [1536, 1536]],
  ['proofs/action-vfx-v2-12px-proof.png', [1536, 1536]],
]) {
  const proof = readPngSize(join(dir, name));
  ok(proof.width === expected[0] && proof.height === expected[1], `${name} dimensions`);
}

ok(sha256(join(dir, 'PROMPTS.md')) === provenance.promptsSha256,
  'complete prompt record hash agrees');

console.log(JSON.stringify({
  ok: true,
  passes,
  atlas: manifest.runtime,
  review: manifest.review,
  alpha,
  minimumGuardPx: minimumGuard,
  bakedRuntimeTintMass: forbiddenWeight / visibleWeight,
}, null, 2));
