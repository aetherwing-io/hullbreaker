#!/usr/bin/env node
// Focused promotion gate for the production slender RIG atlases. The global
// asset census is intentionally not required for every character iteration:
// this proves the geometry/palette/runtime contract of exactly this pack.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { decodePng, histogram } from './assets/lib/png.mjs';
import { ALPHA_HUE_FLOOR, checkRasterColors } from './assets/lib/palette.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SPRITES = resolve(ROOT, 'assets/generated/sprites');
const failures = [];
const pass = (condition, message) => {
  if (!condition) failures.push(message);
};

const PACK = [
  { id: 'rig-slender-body-atlas-v2', poses: ['idle', 'contact', 'pass', 'flight', 'air-rise', 'air-fall'], minDiff: 0.08 },
  { id: 'rig-slender-aim-atlas-v2', poses: ['right', 'up-right', 'up', 'down-right'], minDiff: 0.10 },
  { id: 'rig-slender-climb-atlas-v2', poses: ['left-reach', 'left-drive', 'right-reach', 'right-drive'], minDiff: 0.08 },
];

function componentsInCell(image, cell, alphaFloor = 40) {
  const seen = new Uint8Array(cell.w * cell.h);
  const qx = new Int32Array(cell.w * cell.h);
  const qy = new Int32Array(cell.w * cell.h);
  let count = 0;
  for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) {
    const local = y * cell.w + x;
    const alpha = image.rgba[((cell.y + y) * image.width + cell.x + x) * 4 + 3];
    if (seen[local] || alpha < alphaFloor) continue;
    count++;
    let head = 0, tail = 0;
    qx[tail] = x; qy[tail++] = y; seen[local] = 1;
    while (head < tail) {
      const px = qx[head], py = qy[head++];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = px + dx, yy = py + dy;
        if (xx < 0 || xx >= cell.w || yy < 0 || yy >= cell.h) continue;
        const p = yy * cell.w + xx;
        if (seen[p]) continue;
        if (image.rgba[((cell.y + yy) * image.width + cell.x + xx) * 4 + 3] < alphaFloor) continue;
        seen[p] = 1; qx[tail] = xx; qy[tail++] = yy;
      }
    }
  }
  return count;
}

// Compare silhouettes after normalizing each alpha box. This is a FAR-oriented
// contract: mechanically different poses must survive downsampling, not merely
// move a few high-resolution paint pixels.
function normalizedMask(image, alpha, w = 48, h = 80) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(alpha.x + alpha.w - 1,
      alpha.x + Math.floor((x + 0.5) * alpha.w / w));
    const sy = Math.min(alpha.y + alpha.h - 1,
      alpha.y + Math.floor((y + 0.5) * alpha.h / h));
    mask[y * w + x] = image.rgba[(sy * image.width + sx) * 4 + 3] >= 40 ? 1 : 0;
  }
  return mask;
}

function maskDifference(a, b) {
  let changed = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) union++;
    if (a[i] !== b[i]) changed++;
  }
  return union ? changed / union : 0;
}

const results = [];
for (const spec of PACK) {
  const pngPath = resolve(SPRITES, `${spec.id}.png`);
  const layoutPath = resolve(SPRITES, `${spec.id}.layout.json`);
  const promptPath = resolve(SPRITES, `${spec.id}.prompt.md`);
  pass(existsSync(pngPath), `${spec.id}: PNG missing`);
  pass(existsSync(layoutPath), `${spec.id}: layout missing`);
  pass(existsSync(promptPath), `${spec.id}: prompt/provenance missing`);
  if (!existsSync(pngPath) || !existsSync(layoutPath)) continue;

  const image = decodePng(pngPath);
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
  pass(image.width === 2048 && image.height === 1024,
    `${spec.id}: want 2048x1024, got ${image.width}x${image.height}`);
  pass(layout.resampled === false, `${spec.id}: repack must remain 1:1/non-resampled`);
  pass(layout.method === 'connected assembly extraction + 1:1 integer repack',
    `${spec.id}: extraction method drifted`);
  pass(JSON.stringify(layout.poses.map((p) => p.name)) === JSON.stringify(spec.poses),
    `${spec.id}: pose order drifted`);

  const cols = image.width / layout.outputCell[0];
  const masks = [];
  for (const pose of layout.poses) {
    const col = pose.outputCell % cols;
    const row = Math.floor(pose.outputCell / cols);
    const cell = { x: col * layout.outputCell[0], y: row * layout.outputCell[1],
      w: layout.outputCell[0], h: layout.outputCell[1] };
    pass(Math.min(...Object.values(pose.guard)) >= 24,
      `${spec.id}/${pose.name}: transparent guard below 24px`);
    pass(pose.alpha.w >= 60 && pose.alpha.h >= 140,
      `${spec.id}/${pose.name}: implausibly small actor alpha box`);
    pass(componentsInCell(image, cell) === 1,
      `${spec.id}/${pose.name}: output must contain exactly one connected actor assembly`);
    masks.push(normalizedMask(image, pose.alpha));
  }
  let minPairDiff = 1;
  for (let a = 0; a < masks.length; a++) for (let b = a + 1; b < masks.length; b++)
    minPairDiff = Math.min(minPairDiff, maskDifference(masks[a], masks[b]));
  pass(minPairDiff >= spec.minDiff,
    `${spec.id}: least-distinct pose pair ${minPairDiff.toFixed(3)} < ${spec.minDiff}`);

  const hist = histogram(pngPath, { alphaFloor: ALPHA_HUE_FLOOR, weight: 'alpha' });
  const palette = checkRasterColors(hist.colors.map((c) => ({
    color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count,
  })), { roleReportMass: 0.005 });
  pass(palette.ok, `${spec.id}: palette gate failed: ${palette.failures.join('; ')}`);
  results.push({ id: spec.id, cells: layout.poses.length,
    minPairDiff: +minPairDiff.toFixed(3), palette: palette.ok,
    changedShare: layout.paletteFinish?.changedShare });
}

const rigSource = readFileSync(resolve(ROOT, 'src/pure/rig.js'), 'utf8');
const playerSource = readFileSync(resolve(ROOT, 'src/render/player.js'), 'utf8');
for (const spec of PACK) {
  pass(rigSource.includes(`../../assets/generated/sprites/${spec.id}.png`),
    `${spec.id}: src/pure/rig.js does not point at promoted atlas`);
}
pass(!rigSource.includes('rig-climb-atlas-v1.png'), 'runtime still references retired climb v1');
pass(playerSource.includes("bodyFrame = player.vy >= 0 ? 'air-rise' : 'air-fall'"),
  'runtime does not select distinct authored rise/fall silhouettes');
pass(!playerSource.includes('rigGlow') && !playerSource.includes('paintGlowTexture'),
  'RIG must not carry a broad always-on halo');
pass(playerSource.includes('const bodyHeat = notch >= 2') &&
  playerSource.includes("(notch === 1 ? 0.16 : 0)"),
  'body emission must remain zero outside explicit overdrive action');
pass(playerSource.includes(': recoilT * 0.46 + (notch === 1 ? 0.24 : 0);'),
  'weapon emission must remain zero until firing/overdrive action');
pass(!playerSource.includes('CanvasTexture') && !playerSource.includes('applyAtlasCrop'),
  'slender atlas presentation must use fixed UV geometry, not runtime masks/crops');
pass(!playerSource.includes('jumpFlare'),
  'airborne RIG must not render a propulsion/jet flare');

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/manifest.json'), 'utf8'));
for (const spec of PACK) {
  const entry = manifest.assets.find((a) => a.id === spec.id);
  pass(entry?.path === `assets/generated/sprites/${spec.id}.png`,
    `${spec.id}: manifest production path missing`);
  pass(entry?.source === `assets/generated/sprites/${spec.id}.prompt.md`,
    `${spec.id}: manifest provenance path missing`);
  pass(entry?.size?.w === 2048 && entry?.size?.h === 1024 && entry?.gpu === true,
    `${spec.id}: manifest GPU geometry missing`);
  pass(entry?.palette?.status === 'pass', `${spec.id}: manifest palette verdict missing`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, results }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, atlases: results, runtime: {
  bodyStates: 6, aimStates: 4, climbStates: 4,
  airbornePropulsion: false,
  idleEmission: { body: 0, weapon: 0 },
  atlasUv: 'fixed-geometry',
} }, null, 2));
