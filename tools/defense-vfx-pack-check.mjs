#!/usr/bin/env node
/* Isolated contract gate for the integrated Meridian defense VFX content pack. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaCensus, histogram, readPngSize } from './assets/lib/png.mjs';
import { checkRasterColors } from './assets/lib/palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = join(root,
  'assets/generated/vfx/meridian-defense-vfx-pack-v1.manifest.json');
const moduleFile = join(root, 'src/render/defense-vfx-pack.js');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const moduleRaw = readFileSync(moduleFile, 'utf8');
const atlasFile = join(root, manifest.runtime.file);
let passes = 0;
let fails = 0;

function ok(condition, label, detail = null) {
  if (condition) passes++;
  else {
    fails++;
    console.error(`FAIL ${label}${detail === null ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

function filesBelow(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesBelow(file));
    else if (entry.name.endsWith('.js')) out.push(file);
  }
  return out;
}

const components = manifest.components || [];
const ids = new Set(components.map((entry) => entry.id));
const categories = [...new Set(components.map((entry) => entry.category))];
const states = ['tell', 'fire', 'recovery', 'spent'];
const expectedPerCategory = { tell: 2, fire: 3, recovery: 2, spent: 1 };

ok(manifest.version === 1 && components.length === 64 && ids.size === 64,
  '64 unique v1 components');
ok(categories.length === 8 && categories.every((category) =>
  components.filter((entry) => entry.category === category).length === 8),
'eight categories carry eight components each');
ok(categories.every((category) => states.every((state) =>
  components.filter((entry) => entry.category === category &&
    entry.timingState === state).length === expectedPerCategory[state])),
'every category exposes tell 2 / fire 3 / recovery 2 / spent 1');

ok(manifest.dormantMode === 'draw-nothing' &&
  components.every((entry) => entry.timingState !== 'dormant'),
'dormant state draws no sprite');
ok(manifest.environmentOnly === true &&
  ['rig', 'player', 'projectile'].every((name) =>
    manifest.forbiddenAttachments.includes(name)),
'pack is environment-only and forbidden on RIG/player/projectiles');
ok(components.every((entry) => entry.durationMs >= 90 && entry.durationMs <= 1100 &&
  entry.leadMs === (entry.timingState === 'tell' ? entry.durationMs : 0)),
'timing and tell lead are explicit and bounded');
ok(components.filter((entry) => entry.timingState === 'tell')
  .every((entry) => entry.maxOpacity <= 0.38 && entry.emissiveStage === 'tell-low'),
'all tells are low-emission and opacity-capped');
ok(components.filter((entry) => entry.timingState === 'spent')
  .every((entry) => entry.emissiveStage === 'off'),
'spent components carry no emission');
ok(components.every((entry) => entry.maxOpacity > 0 && entry.maxOpacity <= 1 &&
  ['behind-action', 'action-plane', 'front-particles'].includes(entry.depth)),
'opacity and depth contracts are explicit');

const vector = (value) => Array.isArray(value) && value.length === 2 &&
  value.every(Number.isFinite);
const unitPoint = (value) => vector(value) && value.every((part) => part >= 0 && part <= 1);
ok(components.every((entry) => vector(entry.direction) && vector(entry.axis) &&
  unitPoint(entry.pivot) && unitPoint(entry.origin) &&
  Array.isArray(entry.stretchAxes) &&
  entry.stretchAxes.every((axis) => axis === 'x' || axis === 'y') &&
  typeof entry.rotate === 'boolean' && Array.isArray(entry.mirror)),
'direction, axis, pivot, origin, stretch, rotate and mirror metadata is complete');
ok(components.filter((entry) => entry.category === 'pressure-inhale-vent')
  .every((entry) => vector(entry.direction) && /inhale|vent|spent/.test(entry.mechanic)),
'pressure components publish inhale/vent vectors');
ok(components.filter((entry) => entry.category === 'seal-sparks-dust')
  .every((entry) => vector(entry.axis) && /seal|spent/.test(entry.mechanic)),
'seal components publish a mechanical seal axis');
ok(components.filter((entry) => /armor-shear|scuttle-rupture/.test(entry.category))
  .every((entry) => unitPoint(entry.origin)),
'armor/scuttle components publish a shear or rupture origin');

ok(components.every((entry) => Array.isArray(entry.visibleBounds) &&
  entry.visibleBounds.length === 4 && entry.visibleBounds.every(Number.isFinite) &&
  entry.visibleBounds[0] >= 0 && entry.visibleBounds[1] >= 0 &&
  entry.visibleBounds[2] > 0 && entry.visibleBounds[3] > 0 &&
  entry.visibleBounds[0] + entry.visibleBounds[2] <= 1.000001 &&
  entry.visibleBounds[1] + entry.visibleBounds[3] <= 1.000001),
'visible bounds are normalized and contained');
ok(components.every((entry) => entry.sourceGutterPx >= 6 &&
  entry.allIslandsRetained === true && entry.islandCount >= 1),
'source gutters pass and every disconnected island is retained');
ok(components.filter((entry) => entry.disconnectedIslands).every((entry) =>
  entry.islandCount > 1),
'declared multi-island effects remain multi-island after extraction');
ok(components.filter((entry) => entry.nativeAspect < 0.8 || entry.nativeAspect > 1.25)
  .length >= 48,
'at least 48 components retain a clearly native non-square silhouette');

const rects = components.map((entry) => ({ id: entry.id, r: entry.packedRectPx }));
let overlaps = 0;
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i].r;
    const b = rects[j].r;
    if (a[0] < b[0] + b[2] && a[0] + a[2] > b[0] &&
        a[1] < b[1] + b[3] && a[1] + a[3] > b[1]) overlaps++;
  }
}
ok(overlaps === 0, 'packed visible rectangles never overlap', { overlaps });
ok(components.every((entry) => entry.uv.length === 4 &&
  entry.uv[0] >= 0 && entry.uv[1] >= 0 && entry.uv[2] <= 1 && entry.uv[3] <= 1 &&
  entry.uv[2] > entry.uv[0] && entry.uv[3] > entry.uv[1]),
'UV rectangles are normalized and positive');

const size = readPngSize(atlasFile);
ok(size.width === 1024 && size.height === 512 && size.colorType === 6,
  'atlas is one 1024x512 RGBA texture', size);
ok(manifest.runtime.gpuTextures === 1 &&
  manifest.runtime.estimatedGpuBytes === 2 * 1024 * 1024 &&
  manifest.runtime.noRuntimeCrop && manifest.runtime.nativeAspectPreserved,
'runtime budget is one 2 MiB texture with no crop or distortion');
const alpha = alphaCensus(atlasFile);
ok(alpha.transparent > 65 && alpha.partial > 0.1 && alpha.opaque > 0.1,
  'atlas carries real transparent gutters, feathered edges and opaque action', alpha);

const colors = histogram(atlasFile, { alphaFloor: 32, weight: 'alpha' });
const palette = checkRasterColors(colors.colors);
ok(palette.ok && palette.inBandMass > 0.999 && palette.alienMass < 0.00001,
  'palette-normalized atlas has no material off-band or alien mass', {
    inBandMass: palette.inBandMass,
    alienMass: palette.alienMass,
    offBandMass: palette.offBandMass,
  });

ok(/Data-only and side-effect-free/.test(moduleRaw) &&
  /export const DEFENSE_VFX_PACK/.test(moduleRaw) &&
  /export function defenseVfxComponent/.test(moduleRaw) &&
  !/three|preloadTexture|awaitPreloads|document\.|window\.|requestAnimationFrame/i.test(moduleRaw),
'generated module is side-effect-free render data');
const consumers = filesBelow(join(root, 'src'))
  .filter((file) => file !== moduleFile)
  .filter((file) => /defense-vfx-pack/.test(readFileSync(file, 'utf8')));
const consumerNames = consumers.map((file) => relative(root, file).replaceAll('\\', '/')).sort();
ok(JSON.stringify(consumerNames) === JSON.stringify([
  'src/render/defense-vfx-art.js',
  'src/render/meridian-defense-vfx.js',
]), 'only the isolated art owner and environment renderer consume the pack', consumerNames);

console.log(JSON.stringify({
  passes,
  fails,
  components: components.length,
  categories: manifest.review.categories,
  timingStates: manifest.review.timingStates,
  atlas: manifest.runtime,
  alpha,
  palette: {
    inBandMass: palette.inBandMass,
    offBandMass: palette.offBandMass,
    alienMass: palette.alienMass,
    roles: palette.roles,
  },
  minSourceGutterPx: manifest.review.minimumSourceGutterPx,
  multiIslandComponents: components.filter((entry) => entry.islandCount > 1).length,
  nativeAspectComponents: components
    .filter((entry) => entry.nativeAspect < 0.8 || entry.nativeAspect > 1.25).length,
}, null, 2));

if (fails) process.exit(1);
