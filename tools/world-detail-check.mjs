#!/usr/bin/env node
/* Focused production contract for the sparse Meridian hull fixtures. This is
   intentionally browser-free: it inspects the shipped alpha pixels and the
   boot/merge/cull source architecture. Runtime captures cover composition. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/lib/png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const main = read('src/main.js');
const owner = read('src/render/world-detail-art.js');
const level = read('src/render/level.js');
const seams = read('src/pure/seams.js');
const prompt = read('assets/generated/environment/meridian-detail-atlas-v1.prompt.md');
const manifest = JSON.parse(read('assets/manifest.json'));
const png = decodePng(join(root, 'assets/generated/environment/meridian-detail-atlas-v1.png'));
let passed = 0;

function ok(value, message) {
  if (!value) throw new Error(`WORLD DETAIL FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

function occurrences(text, re) { return (text.match(re) || []).length; }

const roles = [
  'gill', 'pipe-spine', 'gallery', 'breach',
  'vent-bank', 'sensor', 'exhaust', 'containment',
];
const expectedInk = [
  [44, 73, 423, 365], [131, 42, 249, 428], [76, 40, 359, 432],
  [71, 60, 370, 392], [32, 111, 448, 289], [92, 66, 328, 380],
  [77, 79, 357, 354], [95, 79, 321, 353],
];

ok(png.width === 2048 && png.height === 1024 && png.colorType === 6,
  'atlas is the exact 2048x1024 RGBA production canvas');

for (let cell = 0; cell < 8; cell++) {
  const cellX = (cell % 4) * 512;
  const cellY = Math.floor(cell / 4) * 512;
  let minX = 512, minY = 512, maxX = -1, maxY = -1;
  let visible = 0, partial = 0, boundary = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const alpha = png.rgba[((cellY + y) * png.width + cellX + x) * 4 + 3];
    if (alpha > 20) {
      visible++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (alpha > 0 && alpha < 255) partial++;
    if (alpha > 0 && (x < 5 || x >= 507 || y < 5 || y >= 507)) boundary++;
  }
  const bbox = [minX, minY, maxX - minX + 1, maxY - minY + 1];
  ok(JSON.stringify(bbox) === JSON.stringify(expectedInk[cell]),
    `${roles[cell]} visible-ink bounds are pixel-exact (${bbox.join(',')})`);
  ok(boundary === 0 && minX >= 32 && minY >= 32 && maxX <= 479 && maxY <= 479,
    `${roles[cell]} has transparent boundary guards and at least 32px crop safety`);
  ok(visible > 40000 && partial > 3000,
    `${roles[cell]} carries substantial painted mass and a feathered silhouette`);
}

ok(roles.every((role) => prompt.includes(role === 'pipe-spine' ? 'pipe spine' :
   role === 'vent-bank' ? 'vent bank' : role)),
  'prompt/provenance records all eight materially distinct fixture roles');

const ownerAt = main.indexOf("import './render/world-detail-art.js'");
const postAt = main.indexOf("from './render/post.js'");
const levelAt = main.indexOf("from './render/level.js'");
ok(ownerAt >= 0 && ownerAt < postAt && ownerAt < levelAt,
  'dependency-light atlas owner evaluates before post and level consumers');
ok(occurrences(owner, /preloadTexture\s*\(/g) === 1 &&
   occurrences(level, /preloadTexture\s*\(/g) === 0 &&
   occurrences(level, /TextureLoader/g) === 0,
  'atlas has exactly one preload owner and level has no loader or retry path');
ok(/await\s+awaitPreloads\(\)/.test(owner) &&
   /WORLD_DETAIL_ART_SLOT\s*=\s*Object\.freeze/.test(owner) &&
   /settledBeforeConsumer:\s*true/.test(owner),
  'shared gate settles one immutable ready/failed/off decision before consumers');
ok(/state:\s*WORLD_DETAIL_ART_ON\s*\?\s*\(ready\s*\?\s*'ready'\s*:\s*'failed'\)/.test(owner) &&
   /dressDetailFallback/.test(level) && /detailFallbacks/.test(level),
  'an explicitly requested but failed atlas selects bounded manufactured fallbacks');
ok(/QUERY\.get\('fixtureart'\)\s*===\s*'1'/.test(owner) &&
   /const request = WORLD_DETAIL_ART_ON/.test(owner),
  'painted cutout atlas is comparison-only: production performs no 2048x1024 upload');

const grammar = level.slice(
  level.indexOf('const WORLD_DETAIL_ROLE_ROWS'),
  level.indexOf('const WORLD_DETAIL_WIDTH'),
);
const grammarRoles = [...grammar.matchAll(/'(gill|pipe-spine|gallery|breach|vent-bank|sensor|exhaust|containment)'/g)]
  .map((m) => m[1]);
ok(grammarRoles.length === 18 && new Set(grammarRoles).size === 8,
  'authored grammar places exactly three landmarks on each of six faces and uses all roles');
ok(/anchors\s*=\s*\[13\.5,\s*33\.0,\s*52\.0\]/.test(level) &&
   /WORLD_DETAIL_WIDTH/.test(level) && /platformNear/.test(level) && /gapNear/.test(level),
  'large sparse anchors adapt deterministically to real deck/platform/gap context');
ok(/planeWidth\s*=\s*WORLD_DETAIL_ART\.cellSize\s*\*\s*scale/.test(level) &&
   /planeHeight\s*=\s*WORLD_DETAIL_ART\.cellSize\s*\*\s*scale/.test(level) &&
   !/texture\.offset|texture\.repeat|setViewOffset/.test(level),
  'runtime maps each complete 512px cell; measured ink only normalizes size and anchor');
ok(/visibilityS\s*=\s*planeCenterS\s*\+\s*planeWidth\s*\/\s*2/.test(level) &&
   /routeWorldFacet\(startS\s*\+\s*0\.001\)/.test(level) &&
   /routeWorldFacet\(visibilityS\s*-\s*0\.001\)/.test(level),
  'the full transparent footprint is build-gated and rejected if it crosses a facet');
ok(/worldDetailPanels/.test(level) && /vertexStride:\s*12/.test(level) &&
   /appendFixtureQuad\(acc, row, true\)/.test(level) &&
   /appendFixtureQuad\(acc, row, false\)/.test(level),
  'fixtures merge by facet at 12 vertices each: same-alpha recess plus painted face');
const fixturePool = level.slice(
  level.indexOf('function buildWorldDetailPanelPools'),
  level.indexOf('function updateRoutePanelDrawRange'),
);
ok(/alphaTest:\s*0\.055/.test(fixturePool) && /transparent:\s*false/.test(fixturePool) &&
   /depthWrite:\s*true/.test(fixturePool) && !/PlaneGeometry/.test(fixturePool),
  'cutout material depth-writes with no translucent backing card or per-fixture mesh');
ok(/detailVertices/.test(level) && /detailTriangles/.test(level) &&
   /detailDrawPools/.test(level) && /detailVisible/.test(level),
  'runtime telemetry exposes bounded fixture, visibility, vertex, triangle and draw counts');

const cull = level.slice(
  level.indexOf('export function updateWorldDressingCull'),
  level.indexOf('function buildIndustrialDressing'),
);
ok(!/new\s+THREE\.|\.map\(|\.filter\(|\.slice\(/.test(cull),
  'visibility hot path only changes fixed matrices/draw ranges and allocates no render objects');
ok(/SCUTE_PHRASE/.test(level) && /\[9,\s*6,\s*11,\s*7,\s*8,\s*10,\s*14\]/.test(level) &&
   /housed-slots/.test(read('src/render/seams.js')) &&
   /clusterGap:\s*0\b/.test(seams),
  'armor and housed deck lights use irregular macro rhythm with no paired debug dots');

const entry = manifest.assets.find((asset) => asset.id === 'meridian-detail-atlas-v1');
ok(entry?.path === 'assets/generated/environment/meridian-detail-atlas-v1.png' &&
   entry?.source === 'assets/generated/environment/meridian-detail-atlas-v1.prompt.md' &&
   entry?.gpu === true && entry?.alpha === 'cutout' &&
   entry?.size?.w === 2048 && entry?.size?.h === 1024,
  'manifest records the GPU, alpha, dimensions, production path and provenance');

console.log(`WORLD DETAIL PASS: ${passed}/${passed} contracts passed`);
