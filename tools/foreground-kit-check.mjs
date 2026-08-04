#!/usr/bin/env node
/* Focused, browser-free contract for the production Meridian foreground kit.
   This checks the authored decisions that are easiest to regress while a
   screenshot still looks superficially busy: cold body / warm route split,
   non-rectangular silhouettes, structural-only dressing, opt-in cutout art,
   sparse housed luminaires, and allocation-free facet culling. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/lib/png.mjs';
import { CONFIG } from '../src/config.js';
import { buildLevel } from '../src/pure/generator.js';
import { limbBakePlan } from '../src/pure/limb.js';
import {
  deckSeamRuns, platformSeamRuns, seamPipCount, SEAMS,
} from '../src/pure/seams.js';
import {
  foregroundComponentCatalogStats, foregroundCompositionForModule,
} from '../src/render/foreground-components.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const level = read('src/render/level.js');
const seams = read('src/render/seams.js');
const seamPlan = read('src/pure/seams.js');
const art = read('src/render/world-detail-art.js');
const limb = read('src/render/limb.js');
const pack = read('src/render/foreground-pack.js');
const componentArt = read('src/render/foreground-component-art.js');
let passed = 0;
function ok(value, message) {
  if (!value) throw new Error(`FOREGROUND KIT FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

ok(/const cADepth = \[/.test(level) && /const cBDepth = \[/.test(level) &&
   /const cCDepth = \[/.test(level) && /const cDDepth = \[/.test(level) &&
   /const scuteDepthFamilies = \[cADepth, cBDepth, cCDepth, cDDepth\]/.test(level) &&
   /\[1\.86, 1\.68\]/.test(level) && /routeCapPanelColor/.test(level) &&
   /0\.78 \+ down \* 0\.18/.test(level) &&
   /edge \* edge \* 0\.18/.test(level) && /const _routeCapKey/.test(level),
  'four directional scute families keep copper phrase-authored under a neutral camera-edge key, recessed service bands and a cold irregular keel');
ok(/function extrudedProfile/.test(level) && /function platformProfileGeometry/.test(level) &&
   /function solidProfileGeometry/.test(level) && /function bottomArmourGeometry/.test(level),
  'platforms, solids and the hull underside use profiled silhouettes rather than raw boxes');
ok(/const rootFrac = \[0\.34, 0\.62, 0\.43, 0\.70\]/.test(level) &&
   /catwalkGussetGeometry/.test(level) && /broken back-plane guard/.test(level) &&
   /fascia aperture/.test(level),
  'catwalks own off-centre roots, solid gussets, recessed fascia and sparse broken guards');
ok(/const BODY_OUTLINES = Object\.freeze\(\[/.test(limb) &&
   /plannedShape === 'body'/.test(limb) && /rootFade/.test(limb),
  'existing limb texture buckets route through ragged, value-faded lower roots without animation');
ok(/const ARMOUR_OUTLINES = Object\.freeze\(\[/.test(limb) &&
   /lower edge breaks into a keel\/notch rhythm/.test(limb) &&
   /shoulder = Math\.max\(0, Math\.min\(1, \(y \+ 0\.46\) \/ 0\.92\)\)/.test(limb),
  'foreground scutes own authored shoulders, keels and a fixed occlusion-value lip');

const phraseMatch = limb.match(
  /const SCUTE_MATERIAL_PHRASE = Object\.freeze\(\[([\s\S]*?)\]\);/,
);
const scutePhrase = phraseMatch
  ? [...phraseMatch[1].matchAll(/'(\w+)'/g)].map((match) => match[1]) : [];
const builtForLimb = buildLevel(CONFIG);
const limbPlan = limbBakePlan(CONFIG, builtForLimb.groundH);
const productionScutes = limbPlan.filter((piece) => piece.kind === 'scute');
const scuteMaterials = productionScutes.map((piece) => scutePhrase[Math.abs(
  Math.floor(piece.s / CONFIG.limb.scute.every) + piece.facet * 2,
) % scutePhrase.length]);
const warmScutes = scuteMaterials.filter((key) => key === 'scute').length;
ok(scutePhrase.length === 5 && scutePhrase.filter((key) => key === 'scute').length === 2 &&
   scutePhrase.filter((key) => key === 'wall').length === 3 &&
   productionScutes.length > 40 && warmScutes < productionScutes.length / 2,
  `five fixed scute pools alternate ${warmScutes} oxidized castings through ` +
  `${productionScutes.length - warmScutes} shadow-steel castings without another drawable`);
ok(/PRODUCTION_SUBSTRATE_MATERIAL[\s\S]*scuteRib: 'shadow'[\s\S]*bodyRib: 'shadow'[\s\S]*flankTendon: 'shadow'/.test(limb),
  'macro ribs, tendons and scute hardpoints join the body substrate instead of floating as warm planks');
ok(!/dressLight\s*\(/.test(level) && !/OctahedronGeometry|service lamp halos/.test(level),
  'level dressing contains no floating point lights, diamond halos or editor-marker lamps');

const compositionA = [];
const compositionB = [];
for (let phase = 0; phase < 6; phase++) {
  for (let ordinal = 0; ordinal < 40; ordinal++) {
    const pattern = ordinal % 5;
    compositionA.push(foregroundCompositionForModule(phase, ordinal, pattern));
    compositionB.push(foregroundCompositionForModule(phase, ordinal, pattern));
  }
}
ok(JSON.stringify(compositionA) === JSON.stringify(compositionB) &&
   new Set(compositionA.map((row) => row.seed)).size === compositionA.length,
  'all 240 opening-to-summit component compositions are deterministic and seed-distinct');
const catalog = foregroundComponentCatalogStats();
ok(catalog.total >= 90 && catalog.emissiveDefaults === 0 &&
   catalog.categories['trim-cap'] >= 2 && catalog.categories['beam-brace'] >= 3 &&
   catalog.categories['pipe-conduit'] >= 4,
  `the ${catalog.total}-part production vocabulary covers caps, braces and junctions with zero idle emissive defaults`);

const sourceAssets = [
  ['foreground pack', 'assets/generated/environment/meridian-foreground-pack-v1.png', 2048, 2048],
  ['native component atlas', 'assets/generated/environment/meridian-component-atlas-v1.png', 2048, 1024],
];
for (const [label, file, width, height] of sourceAssets) {
  const image = decodePng(join(root, file));
  ok(image.width === width && image.height === height,
    `${label} source is present at its declared ${width}x${height} production dimensions`);
}
ok(!/createElement\(['"]canvas|new\s+THREE\.CanvasTexture|drawImage\s*\(/.test(
  `${level}\n${pack}\n${componentArt}`,
), 'runtime surface composition uses resident source textures with no canvas manufacture or crop pass');

const spine = level.slice(
  level.indexOf('function dressServiceSpines'),
  level.indexOf('function buildDressingPool'),
);
ok(/for \(let i = 0; i < ladders\.length; i\+\+\)/.test(spine) &&
   !/faceStart|anchors\s*=|rungCount/.test(spine),
  'vertical mounts are generated only for real traversable ladders, never decorative scaffolds');
ok(/WORLD_DETAIL_ART_ON/.test(art) &&
   /QUERY\.get\('fixtureart'\)\s*===\s*'1'/.test(art) &&
   /const request = WORLD_DETAIL_ART_ON/.test(art),
  'painted prop cutouts are opt-in reference art and allocate no production texture');

ok(/housed route luminaires/.test(seams) && /route luminaire slots/.test(seams) &&
   /surface spill/.test(seams),
  'route light is a metal housing, inset slot and local surface spill');
ok(!/OctahedronGeometry|AdditiveBlending/.test(seams) &&
   /NormalBlending/.test(seams) && /opacity:\s*0\.07/.test(seams),
  'route light has no star/diamond bloom geometry and keeps restrained alpha spill');
ok(/platformStride:\s*3/.test(seamPlan) && /pipEvery:\s*28/.test(seamPlan) &&
   /clusterGap:\s*0\b/.test(seamPlan),
  'light layout is sparse authored punctuation, never a paired-dot ruler');

const built = buildLevel(CONFIG);
const deck = deckSeamRuns(built.groundH, SEAMS);
const platforms = platformSeamRuns(built.platforms, SEAMS);
const fixtures = seamPipCount(deck) + seamPipCount(platforms);
ok(fixtures > 0 && fixtures <= 60,
  `full 445-tile climb owns ${fixtures} housed luminaires (bounded at 60)`);
ok(platforms.every((run) => built.platforms.some((p) =>
  p.x0 === run.s0 && p.x1 === run.s1)),
  'every catwalk luminaire remains inside a real collision-authored platform');

const cull = level.slice(
  level.indexOf('export function updateWorldDressingCull'),
  level.indexOf('function buildIndustrialDressing'),
);
ok(!/new\s+THREE\.|\.map\(|\.filter\(|\.slice\(/.test(cull),
  'facet/build-prefix hot path only swaps fixed matrices and draw ranges');
ok(/gate = p\.x1 - 0\.001/.test(level) &&
   /visibilityS/.test(level) && /routeRenderable/.test(cull),
  'large structural pieces wait for their complete build prefix and current facet');
ok(/updateRoutePanelDrawRange\(panel, active\)/.test(cull) &&
   /routeWorldFacet\(row\.anchorS \?\? row\.s\)/.test(level) &&
   /panel\.facet === active/.test(level),
  'merged pack, component and painted panels retain exact facet ownership and a current-face draw prefix');
const limbCull = limb.slice(
  limb.indexOf('export function updateLimbFoldCull'),
  limb.indexOf('export function limbFoldCullSnapshot'),
);
ok(/behindFold[\s\S]*piece\.facet !== cameraFacet[\s\S]*setMatrixAt\(row\.instance, hidden \? HIDE/.test(limbCull) &&
   /limbFoldBridgeVisible\(piece, cameraFacet/.test(limbCull),
  'every proud limb casting is hidden behind the camera fold except an exact chamfer bridge');
ok(/new Map\(\)/.test(level.slice(level.indexOf('function buildDressingPanelPools'))) &&
   /const bucketKey = materialKey \+ '\/' \+ shape \+ '\/' \+ textureVariant/.test(limb) &&
   /new THREE\.InstancedMesh\(geometry\[shape\], material, indices\.length\)/.test(limb),
  'surface detail remains merged by ownership or pooled by fixed material/shape/variant');

console.log(`FOREGROUND KIT PASS: ${passed}/${passed} contracts passed`);
