#!/usr/bin/env node
// Fast source contract for production capsule presentation and pooling. Browser
// captures remain the visual oracle; these checks stop allocation, draw-count,
// pickup-envelope, preload, and future-facet regressions before that slower QA.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const file = resolve(root, 'src/render/capsules.js');
const src = readFileSync(file, 'utf8');
const lootSrc = readFileSync(resolve(root, 'src/ui/loot.js'), 'utf8');
let passed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(`CAPSULE RELIQUARY FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

function numberConst(name) {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`).exec(src);
  if (!match) throw new Error(`CAPSULE RELIQUARY FAIL: missing numeric ${name}`);
  return Number(match[1]);
}

function functionBody(name, nextName) {
  const start = src.indexOf(`function ${name}(`);
  const end = src.indexOf(`function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? src.slice(start, end) : '';
}

const preloadAt = src.indexOf('preloadTexture(new URL(ART_ROOT + ATLAS_FILE');
const awaitAt = src.indexOf('await awaitPreloads()');
ok(preloadAt >= 0 && awaitAt > preloadAt,
  'the atlas registers before the shared boot gate is awaited');
ok((src.match(/preloadTexture\(/g) || []).length === 1,
  'the presentation issues exactly one atlas registration');
ok(/slot\.material\s*=\s*material/.test(src) &&
   /v\.art\.material\s*=\s*slot\.material/.test(src),
  'all atlas cells and pooled rows share the one resident production material');

ok(/const RELIQUARY_PROFILE = Object\.freeze/.test(src) &&
   /role: 'weapon'.*nose: true.*tailFins: true/s.test(src) &&
   /role: 'modifier'.*utilityPods: true/s.test(src),
  'weapon and modifier pickups retain distinct manufactured silhouettes');
ok(/c\.gun\?\.traits/.test(src) && /TRAIT_HARDPOINT\[trait\]/.test(src) &&
   /hardpoint\.geometry\s*=\s*traitGeometry/.test(src),
  'rolled trait entries select typed physical hardpoints');
ok(/for \(let tier = 0; tier <= TIER_MAX; tier\+\+\)/.test(src) &&
   /warm\.push\(compileParts\(lamps\)\)/.test(src),
  'zero-to-three tier lamp sets are compiled before play');

ok(!/RingGeometry/.test(src) && !/collarGeo|bracketGeo/.test(src),
  'production pickups use no circular badge, halo, or ring geometry');
ok(/function compileParts\(parts\)/.test(src) &&
   /metal: compileParts\(metal\), ink: compileParts\(ink\), signal: compileParts\(signal\)/.test(src),
  'invariant hardware is merged once per material');
ok(/PROFILE_GEOMETRY = Object\.freeze/.test(src) &&
   /v\.metal\.geometry = geometry\.metal/.test(src) &&
   /v\.signal\.geometry = geometry\.signal/.test(src),
  'pooled rows swap immutable profile geometry instead of rebuilding hardware');

const poolMax = numberConst('CAPSULE_POOL_MAX');
ok(poolMax >= 13 && poolMax <= 32,
  `the explicit ${poolMax}-row pool covers the measured 13-reward peak with bounded headroom`);
ok(/for \(let rowIndex = 0; rowIndex < CAPSULE_POOL_MAX; rowIndex\+\+\)/.test(src) &&
   /createProductionView\(rowIndex\)/.test(src) &&
   /new THREE\.Mesh\(capsuleGeo, defaultFallbackMaterial\)/.test(src),
  'production and complete fallback rows are both prebuilt at boot');
ok(/FALLBACK_KEYS = Object\.freeze\(\['letter:R', \.\.\.Object\.keys\(ART_TABLE\)\]\)/.test(src) &&
   /fallbackMaterials\.set\(key, buildFallbackMaterials\(key\)\)/.test(src),
  'every legal atlas-failure face is prebuilt, including the popped R gun');

const configureProductionStart = src.indexOf('function configureProduction(');
const configureProductionEnd = src.indexOf('/* -------------------- letter-cube', configureProductionStart);
const configureProductionBody = configureProductionStart >= 0 && configureProductionEnd > configureProductionStart
  ? src.slice(configureProductionStart, configureProductionEnd)
  : '';
const claimBody = functionBody('claimRow', 'configureFallback');
const configureFallbackBody = functionBody('configureFallback', 'spawned');
const spawnedBody = functionBody('spawned', 'removed');
const removedBody = functionBody('removed', 'sync');
const syncStart = src.indexOf('function sync(c)');
const syncEnd = src.indexOf('export function capsuleArtSnapshot', syncStart);
const syncBody = syncStart >= 0 && syncEnd > syncStart ? src.slice(syncStart, syncEnd) : '';
const liveBodies = configureProductionBody + claimBody + configureFallbackBody +
  spawnedBody + removedBody + syncBody;
ok(configureProductionBody && claimBody && configureFallbackBody && spawnedBody && removedBody && syncBody,
  'every live claim/configure/spawn/sync path is inspectable');
ok(!/new THREE\.|new (?:Mesh|Material|Geometry)|\.dispose\(|scene\.add\(/.test(liveBodies),
  'claim, configure, spawn, and sync allocate no geometry/material/mesh or scene nodes');
ok(!/\.scale\.set/.test(syncBody),
  'sync never pumps visual scale');
ok(/scanner\.position\.x/.test(syncBody) && /signalMat\.opacity/.test(syncBody),
  'animation is rigid scanner translation plus bounded light output');

const idleAlpha = numberConst('RELIQUARY_SIGNAL_ALPHA');
const scannerAlpha = numberConst('RELIQUARY_SCANNER_ALPHA');
ok(idleAlpha <= 0.32 && scannerAlpha > idleAlpha,
  `idle signal alpha ${idleAlpha} stays quiet beneath the moving scanner ${scannerAlpha}`);
const signalMaterialBody = functionBody('signalMaterial', 'scannerMaterial');
const scannerMaterialBody = functionBody('scannerMaterial', 'pickupTier');
ok(/THREE\.NormalBlending/.test(signalMaterialBody) &&
   /THREE\.AdditiveBlending/.test(scannerMaterialBody),
  'only the moving scanner is additive; the idle casing signal is normal-blended');
const artMaterialBody = functionBody('artMaterial', 'staticMaterial');
ok(/fog: true/.test(artMaterialBody) && /toneMapped: true/.test(artMaterialBody),
  'painted capsule cells participate in the shipped atmosphere and tone map');
ok(/v\.assembly\.rotation\.z = profileKey === 'mod' \? Math\.PI \* 0\.5 : 0/.test(src),
  'modifier cartridges use a rigid vertical silhouette distinct from weapon reliquaries');
ok(/clip-path: polygon/.test(lootSrc) &&
   /linear-gradient\(#8d5b37, #8d5b37\).*calc\(100% - 15px\) 3px/.test(lootSrc) &&
   !/0 0 26px rgba\(255,196,82/.test(lootSrc),
  'recovery card uses a chamfered physical rail bay without an idle rarity halo');

ok(/function transformedGeometryRadius\(geometry/.test(src) &&
   /for \(const x of \[-RELIQUARY_CASE_W \* 0\.22, RELIQUARY_CASE_W \* 0\.22\]\)/.test(src) &&
   /Object\.values\(traitGeometry\)/.test(src),
  'radial reach is measured from transformed vertices at scanner and hardpoint extrema');
ok(/RELIQUARY_RADIAL_REACH > CAP\.pickupRadius \+ 1e-6/.test(src),
  'module boot asserts the complete transformed silhouette against pickupRadius');
ok(/CAPSULE_SHADOW_FOOTPRINT = Math\.min\([\s\S]*RELIQUARY_RADIAL_REACH \* 0\.80/.test(src) &&
   /v\.production \? CAPSULE_SHADOW_FOOTPRINT : CAP\.size \/ 2/.test(syncBody),
  'production contact shadow derives from the measured footprint and remains capped');

ok(/routeRenderable\(c\.x\)/.test(syncBody) && /releaseContactShadow\(c\)/.test(syncBody),
  'future facets withhold pixels and contact shadow without deleting sim rewards');
ok(/productionDraws:[\s\S]*modifier: 5[\s\S]*weaponTier1: 8[\s\S]*weaponTier3: 10/.test(src),
  'runtime snapshot exposes the 5/8/10-draw merged presentation contract');
ok(/allocationsDuringSpawnAndSync: \{ geometry: 0, material: 0, mesh: 0 \}/.test(src),
  'runtime snapshot exposes the zero-allocation live-path contract');

console.log(`CAPSULE RELIQUARY PASS: ${passed} focused contracts`);
