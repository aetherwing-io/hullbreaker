#!/usr/bin/env node
/* Exact non-browser contract for the resident Meridian depth volume. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MERIDIAN_DEPTH_BUDGET,
  MERIDIAN_DEPTH_COMPONENT_IDS,
  MERIDIAN_DEPTH_LAYERS,
  MERIDIAN_DEPTH_SOURCES,
  meridianCondensationPlan,
  meridianDepthFacePlan,
} from '../src/render/backdrop-depth-plan.js';
import { FOREGROUND_CUTOUT_COMPONENTS } from '../src/render/foreground-component-spec.generated.js';
import { readPngSize } from './assets/lib/png.mjs';

const root = resolve(import.meta.dirname, '..');
const atmosphere = readFileSync(resolve(root, 'src/render/atmosphere.js'), 'utf8');
const backdrop = readFileSync(resolve(root, 'src/render/backdrop.js'), 'utf8');
const plan = readFileSync(resolve(root, 'src/render/backdrop-depth-plan.js'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.js'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'assets/manifest.json'), 'utf8'));
let passed = 0;
let failed = 0;

function ok(condition, label, detail = null) {
  if (condition) {
    passed++;
    console.log(`ok ${passed + failed} - ${label}`);
  } else {
    failed++;
    console.error(`not ok ${passed + failed} - ${label}` +
      (detail == null ? '' : ` :: ${JSON.stringify(detail)}`));
  }
}

const byLayer = new Map(MERIDIAN_DEPTH_LAYERS.map((entry) => [entry.id, entry]));
const far = byLayer.get('far');
const mid = byLayer.get('mid');
const fog = byLayer.get('condensation');
const near = byLayer.get('near');

ok(MERIDIAN_DEPTH_LAYERS.length === 4 &&
  new Set(MERIDIAN_DEPTH_LAYERS.map((entry) => entry.role)).size === 4,
'four distinct fixed presentation roles own far, mid, condensation and near depth');
ok(far.depth < mid.depth && mid.depth < near.depth && near.depth < 0,
  'all anatomical layers are strictly depth-ordered behind the player plane',
  { far: far.depth, mid: mid.depth, near: near.depth });
ok(fog.depthRange[0] > far.depth && fog.depthRange[1] < near.depth,
  'condensation occupies the interstitial world volume, never the action plane',
  fog.depthRange);
ok(far.width / (MERIDIAN_DEPTH_SOURCES.far.canvas[0] /
  MERIDIAN_DEPTH_SOURCES.far.canvas[1]) > 45 &&
  mid.width / (MERIDIAN_DEPTH_SOURCES.mid.canvas[0] /
  MERIDIAN_DEPTH_SOURCES.mid.canvas[1]) > 34,
  'direct maps preserve source aspect while covering the far-view vertical frustum');
ok(far.curve > mid.curve && far.depth - mid.depth < -5,
  'far and mid shells have materially different curvature and depth for turn parallax');

ok(MERIDIAN_DEPTH_BUDGET.facets === 7 &&
  MERIDIAN_DEPTH_BUDGET.meshesPerFacet === 4 &&
  MERIDIAN_DEPTH_BUDGET.totalMeshes === 28,
  'seven facets own exactly four fixed meshes each');
ok(MERIDIAN_DEPTH_BUDGET.settledDrawCalls === 4 &&
  MERIDIAN_DEPTH_BUDGET.turnDrawCalls === 8 &&
  MERIDIAN_DEPTH_BUDGET.maxActiveFacets === 2,
  'the lane costs four settled calls and at most eight during a fold');
ok(MERIDIAN_DEPTH_BUDGET.turnTriangles <= 496 &&
  MERIDIAN_DEPTH_BUDGET.sourceTextures === 3,
  'turn geometry and source residency stay under the exact 496-triangle / 3-texture ceiling',
  MERIDIAN_DEPTH_BUDGET);
ok(MERIDIAN_DEPTH_BUDGET.runtimeCanvases === 0 &&
  MERIDIAN_DEPTH_BUDGET.runtimeCrops === 0 &&
  MERIDIAN_DEPTH_BUDGET.futureGameplaySemantics === 0,
  'the plan explicitly budgets zero runtime canvases, crops and future gameplay semantics');

const forbiddenImageWork = new RegExp(
  'CanvasTexture|OffscreenCanvas|createElement\\([\'\"]canvas[\'\"]\\)|' +
  'getContext\\([\'\"]2d[\'\"]\\)|drawImage\\(|createImageData\\(|putImageData\\(',
);
ok(!forbiddenImageWork.test(atmosphere + '\n' + backdrop),
  'runtime backdrop modules allocate no canvas and perform no image crop/composite');
ok(!/texture\.(?:offset|repeat|center|rotation)|\.clone\(\)\.needsUpdate/.test(atmosphere),
  'resident sources are not transformed into runtime crop windows');
ok(/map:\s*texture/.test(atmosphere) && /directResidentMap:\s*true/.test(atmosphere) &&
  /registerSource\(farBody/.test(backdrop) && /registerSource\(midBody/.test(backdrop) &&
  /registerSource\(fragmentBody/.test(backdrop),
  'far, mid and near art each use one direct preload-gated source map');

for (const source of Object.values(MERIDIAN_DEPTH_SOURCES)) {
  const file = resolve(root, 'src', 'render', source.file);
  const measured = readPngSize(file);
  ok(measured.width === source.canvas[0] && measured.height === source.canvas[1],
    `${source.id} source dimensions match the direct-map contract`, measured);
}
const anatomyManifest = manifest.assets.find((entry) =>
  entry.path === 'assets/generated/backdrops/backdrop-meridian-anatomy-v1.png');
ok(anatomyManifest?.gpu === true,
  'manifest declares the directly mapped far anatomy as one GPU source');

const componentById = new Map(FOREGROUND_CUTOUT_COMPONENTS.map((entry) => [entry.id, entry]));
ok(MERIDIAN_DEPTH_COMPONENT_IDS.length === 2 &&
  MERIDIAN_DEPTH_COMPONENT_IDS.every((id) => componentById.has(id)),
  'near fragments use exactly two reviewed native-shape component families');
ok(MERIDIAN_DEPTH_COMPONENT_IDS.every((id) => {
  const component = componentById.get(id);
  return component.category === 'near-silhouette' && component.sockets.length === 0 &&
    component.emissive === false;
}), 'near fragments are socket-free, non-emissive armour silhouettes—not gameplay props');
ok(!/(?:ladder|platform|capsule|pickup|turret|enemy|hostile|spawn|route-light)/i
  .test(MERIDIAN_DEPTH_COMPONENT_IDS.join(' ')),
  'the direct depth vocabulary cannot reveal a future route, pickup, light or enemy stage');

const facePlansA = Array.from({ length: 7 }, (_, index) => meridianDepthFacePlan(index + 1));
const facePlansB = Array.from({ length: 7 }, (_, index) => meridianDepthFacePlan(index + 1));
const fogPlansA = Array.from({ length: 7 }, (_, index) => meridianCondensationPlan(index + 1));
const fogPlansB = Array.from({ length: 7 }, (_, index) => meridianCondensationPlan(index + 1));
ok(JSON.stringify(facePlansA) === JSON.stringify(facePlansB) &&
  JSON.stringify(fogPlansA) === JSON.stringify(fogPlansB),
  'all 7 facet plans are deterministic across repeated construction');
ok(facePlansA.every((entry) => entry.fragments.length === near.fragmentsPerFacet) &&
  fogPlansA.every((entry) => entry.length === fog.ribbonsPerFacet),
  'each facet has the exact fixed 4-fragment / 5-ribbon allocation');
ok(facePlansA.every((entry) => entry.fragments.every((fragment) =>
  MERIDIAN_DEPTH_COMPONENT_IDS.includes(fragment.id))),
  'every near placement stays inside the approved anatomy-only vocabulary');

ok(/const gain = cameraFaceBlendGain\(face\)/.test(atmosphere) &&
  /mesh\.userData\.facetGain = gain;\s*mesh\.visible = active;/s.test(atmosphere),
  'facet ownership is the camera fold gain and inactive meshes are truly visible=false');
ok(/angleGain\(camera, mesh\.userData\.facetYaw/.test(atmosphere) &&
  /fogTransform = ['"]facet-world-volume['"]/.test(atmosphere),
  'shells and condensation consume world-facing transforms during a turn');
ok(/renderOrder:\s*-62/.test(plan) && /renderOrder:\s*-44/.test(plan) &&
  /playerPlaneDepth:\s*0/.test(plan),
  'every depth draw precedes the zero-depth actor/gameplay plane');
ok(/depthWrite:\s*true/.test(atmosphere) && /alphaTest:\s*0\.035/.test(atmosphere),
  'near armour cutouts depth-test and write their native silhouette behind actors');
ok(!/emissive\s*:/.test(atmosphere) && /idleEmissive:\s*false/.test(atmosphere),
  'ambient depth materials expose no idle emissive/glow channel');

ok(/state:\s*['"]retired['"]/.test(backdrop) &&
  /replacement:\s*['"]facet-anatomy-volume['"]/.test(backdrop) &&
  /legacyPlateMeshes:\s*0/.test(backdrop),
  'dated route-like illustrated plates are retired rather than used to fill the void');
ok(!/buildPlate|PlaneGeometry\(w, h\)|backdropPlate/.test(backdrop),
  'no legacy per-placement plate construction survives in the production owner');
ok((main.match(/syncCamera\(\);[^\n]*\n\s*updateBackdropFacetVisibility\(\);/g) || []).length >= 2,
  'facet visibility refreshes after camera pose in reset and live update paths');
ok(!/scene\.fog\s*=|renderer\.toneMappingExposure|CONFIG\.camera|CONFIG\.viewScales/
  .test(atmosphere + backdrop),
  'the lane contains no global fog, exposure, camera or view-scale hack');

const callbacks = [...atmosphere.matchAll(
  /onBeforeRender\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\};/g,
)].map((match) => match[1]);
ok(callbacks.length >= 2,
  'direct anatomy and world condensation expose bounded opacity callbacks');
ok(callbacks.every((body) => !/\bnew\s+|\.map\(|\.filter\(|\.reduce\(/.test(body)),
  'depth callbacks allocate no arrays, objects or Three.js values per frame');

console.log(`\nDEPTH COMPOSITION: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
