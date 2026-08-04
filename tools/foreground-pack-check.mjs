#!/usr/bin/env node
/* Browser-free Level-1 production contract for Meridian foreground art.
 * It locks source provenance, the canonical face/state mapping, native-shape
 * extraction, legal transforms, response sockets and the low-cost runtime
 * integration that prevents square cards, green fringe and future-face leaks. */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MERIDIAN_DEFENSE_STATES, defensePhaseForRouteFace, meridianResponsePlan,
} from '../src/pure/meridian-response.js';
import {
  FOREGROUND_CUTOUT_COMPONENTS, foregroundCompositionForModule,
} from '../src/render/foreground-components.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const opaqueManifest = json(
  'assets/generated/environment/meridian-foreground-pack-v1.manifest.json',
);
const componentManifest = json(
  'assets/generated/environment/meridian-component-atlas-v1.manifest.json',
);
const provenance = json(
  'assets/generated/environment/meridian-foreground-imagegen-provenance-v1.json',
);
const packer = read('tools/assets/pack-foreground-atlas.mjs');
const componentPacker = read('tools/assets/pack-foreground-components.mjs');
const pack = read('src/render/foreground-pack.js');
const componentArt = read('src/render/foreground-component-art.js');
const generated = read('src/render/foreground-component-spec.generated.js');
const level = read('src/render/level.js');
const response = read('src/pure/meridian-response.js');
const packDoc = read('assets/generated/environment/meridian-foreground-pack-v1.prompt.md');
const componentDoc = read('assets/generated/environment/meridian-component-atlas-v1.prompt.md');
let passed = 0;
function ok(value, message) {
  if (!value) throw new Error(`FOREGROUND PACK FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

function dimensions(file) {
  return execFileSync('magick', [
    'identify', '-format', '%w %h %[channels]', join(root, file),
  ], { encoding: 'utf8' }).trim();
}

ok(existsSync(join(root, opaqueManifest.runtime.file)) &&
   /^2048 2048 srgb\b/i.test(dimensions(opaqueManifest.runtime.file)),
  'opaque atlas exists as the exact 2048x2048 RGB production canvas');
ok(opaqueManifest.runtime.gpuTextures === 1 && opaqueManifest.runtime.emissive === false &&
   opaqueManifest.runtime.grid.join('x') === '8x8' && opaqueManifest.cells.length === 64,
  '64 opaque choices occupy one non-emissive 8x8 texture');
ok(opaqueManifest.sources.map((entry) => entry.file).join('|') === [
  'meridian-pack-source-a-surfaces.png', 'meridian-pack-source-b-service.png',
  'meridian-pack-source-c-structure.png', 'meridian-pack-source-d-defense.png',
].join('|') && opaqueManifest.sources.every((entry) =>
  entry.acceptedCells === 16 && entry.rejectedCells.length === 0),
  'only the four approved source boards feed the opaque pack');
ok(opaqueManifest.review.canonicalDefenseStates.join('|') ===
   MERIDIAN_DEFENSE_STATES.join('|') &&
   opaqueManifest.review.minifiedDefenseContrast >= 0.052,
  'D remains readable at 32px and records Observe through Scuttle exactly');

ok(existsSync(join(root, componentManifest.runtime.file)) &&
   /^2048 1024 srgba\b/i.test(dimensions(componentManifest.runtime.file)),
  'native component atlas exists as the exact 2048x1024 RGBA canvas');
ok(componentManifest.runtime.gpuTextures === 1 &&
   componentManifest.runtime.emissive === false &&
   componentManifest.components.length === 32 &&
   new Set(componentManifest.components.map((entry) => entry.id)).size === 32,
  '32 native shapes share one non-emissive texture with unique identities');
ok(componentManifest.sources.map((entry) => entry.file).join('|') === [
  'meridian-components-structure-chroma-v1.png',
  'meridian-components-defense-chroma-v1.png',
].join('|') && componentManifest.sources.every((entry) =>
  entry.approvedComponents === 16 && entry.rejectedComponents.length === 0),
  'both reviewed chroma boards contribute exactly sixteen accepted assemblies');
ok(componentManifest.review.humanApproved === true &&
   componentManifest.review.approvedComponents === 32 &&
   componentManifest.review.greenRemnant === 0 &&
   componentManifest.review.alphaEdgeGreenRemnant === 0 &&
   componentManifest.review.minifiedGreenRemnant < 0.0003,
  'full-resolution and partial-alpha contours have zero green remnant');
ok(componentManifest.components.every((entry) =>
  entry.visibleRect.w > 0 && entry.visibleRect.h > 0 &&
  entry.visibleRect.w <= 220 && entry.visibleRect.h <= 220 &&
  Math.min(...Object.values(entry.guard)) >= 16 &&
  Number.isFinite(entry.nativeAspect) && entry.nativeAspect > 0.15),
  'every shape uses measured visible bounds, native aspect and a 16px guard');
ok(Object.keys(componentManifest.categories).length === 8 &&
   Object.keys(componentManifest.sockets).length === 9 &&
   componentManifest.sockets.rupture === 4 && componentManifest.sockets.traversal === 2,
  'the approved vocabulary exposes eight categories and nine gameplay socket families');

const byId = new Map(FOREGROUND_CUTOUT_COMPONENTS.map((entry) => [entry.id, entry]));
ok(['observe-scan-iris', 'intercept-route-clamp', 'contain-defense-socket',
  'scuttle-exposed-ribs', 'scuttle-severed-conduit', 'scuttle-spent-purge-ring']
  .every((id) => byId.has(id) && byId.get(id).stretchAxes.length === 0),
  'irises, clamps, sockets and rupture silhouettes cannot be non-uniformly stretched');
ok(byId.get('route-cap-long').stretchAxes.join('') === 'x' &&
   byId.get('ladder-rail').stretchAxes.join('') === 'y' &&
   byId.get('pressure-pipe').stretchAxes.join('') === 'x',
  'only authored beam, ladder and conduit axes may stretch');

ok((pack.match(/preloadTexture\s*\(/g) || []).length === 1 &&
   (componentArt.match(/preloadTexture\s*\(/g) || []).length === 1 &&
   /requests:\s*request \? 1 : 0/.test(pack) &&
   /requests:\s*request \? 1 : 0/.test(componentArt),
  'each atlas has one gated preload owner and no per-placement texture loads');
ok(/FOREGROUND_CUTOUT_COMPONENTS\.length/.test(componentArt) &&
   /gpuTextures:\s*ready \? 1 : 0/.test(componentArt) &&
   /emissive:\s*false/.test(componentArt) &&
   !/emissiveMap|emissiveIntensity/.test(componentArt),
  'component runtime telemetry exposes one texture and no emissive path');
ok(/visibleRect/.test(generated) && /nativeAspect/.test(generated) &&
   !/meridian-components-.*chroma/.test(generated),
  'generated runtime metadata stores measured shapes without requesting source boards');

ok([0, 1, 2, 3, 4, 5, 6, 7].map(defensePhaseForRouteFace).join('|') ===
   '0|0|1|2|3|4|5|5',
  'intro shares Observe and route faces 1..6 map exactly to defense phases 0..5');
const activeCounts = new Array(6).fill(0);
let responsePlansCanonical = true;
for (let phase = 0; phase < 6; phase++) {
  for (let ordinal = 0; ordinal < 160; ordinal++) {
    const plan = meridianResponsePlan(phase, ordinal, ordinal % 5);
    if (plan.active) activeCounts[phase]++;
    responsePlansCanonical &&= plan.phase === phase &&
       plan.state === MERIDIAN_DEFENSE_STATES[phase] &&
       plan.verticalOffset <= -2.9 && plan.safeFromPlayerRadius >= 2.4 &&
       plan.tellLeadMs >= 380;
  }
}
ok(responsePlansCanonical,
  'all response plans stay off-route, player-safe and state-canonical');
ok(activeCounts.every((count) => count >= 14) && activeCounts[5] > activeCounts[0],
  'every phase exposes deterministic response beats and Scuttle escalates cadence');

let compositionsCanonical = true;
for (let phase = 0; phase < 6; phase++) for (let ordinal = 0; ordinal < 80; ordinal++) {
  const composition = foregroundCompositionForModule(phase, ordinal, ordinal % 5);
  compositionsCanonical &&= composition.state === MERIDIAN_DEFENSE_STATES[phase] &&
    composition.shapeIds.length === 2 && composition.surfaceRole.startsWith('surface');
}
ok(compositionsCanonical,
  'all compositions retain material, structure and their canonical defense state');
ok(/defensePhaseForRouteFace\(faceIndexAt\(mid, CONFIG\)\)/.test(level) &&
   /foregroundCompositionForModule\(\s*phase, moduleOrdinal, pattern/.test(level),
  'level composition derives response phase from the real route face at module midpoint');
ok(/atlasCell\.visibleRect/.test(level) &&
   /new THREE\.PlaneGeometry\(1, 1\)/.test(level) &&
   /FOREGROUND_COMPONENT_ATLAS\.canvas/.test(level) &&
   /storageCellsVisible:\s*false/.test(level),
  'runtime samples measured visible rects on merged front planes, never square storage cells');
ok(/transparent:\s*true/.test(level) && /alphaTest:\s*FOREGROUND_COMPONENT_ATLAS\.alphaTest/.test(level) &&
   /depthWrite:\s*true/.test(level) &&
   !/componentMaterial[\s\S]{0,700}(?:emissiveMap|emissiveIntensity)/.test(level),
  'native shapes depth-write through alpha test and share ordinary scene lighting');
ok(/row\.facet === active && routeRenderable\(row\.s\)/.test(level) &&
   /updateRoutePanelDrawRange\(panel, active\)/.test(level) &&
   /samples\.push\(\{ s: row\.visibilityS/.test(level),
  'solids and merged atlas pools obey current facet plus monotonic build-prefix ownership');
const cull = level.slice(
  level.indexOf('export function updateWorldDressingCull'),
  level.indexOf('function buildIndustrialDressing'),
);
ok(!/new\s+THREE\.|\.map\(|\.filter\(|\.slice\(/.test(cull),
  'foreground facet/build-prefix culling remains allocation-free');

const productionSources = [packer, componentPacker, pack, componentArt, generated,
  level, response, JSON.stringify(opaqueManifest), JSON.stringify(componentManifest)].join('\n');
ok(!productionSources.includes('meridian-pack-source-d-state.png'),
  'the rejected D-state board is absent from packers, manifests and runtime modules');
ok(!/infection|infected/i.test(packDoc + '\n' + componentDoc),
  'production art docs use canonical incursion/defense language only');
ok(provenance.generator === 'built-in OpenAI ImageGen' && provenance.assets.length === 3 &&
  provenance.assets.every((entry) =>
  entry.callId && entry.imageCallId && entry.imagegenOutput &&
  entry.prompt.length > 2000) && provenance.assets.map((entry) => entry.id).join('|') ===
  'foreground-pack-d-defense|foreground-components-structure-chroma-v1|' +
  'foreground-components-defense-chroma-v1',
  'adjacent audit records the three exact ImageGen prompts, outputs and call identifiers');

console.log(`FOREGROUND PACK PASS: ${passed}/${passed} contracts passed`);
