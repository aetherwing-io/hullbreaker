#!/usr/bin/env node
/* Focused pure proof for Vertical Assault v2.  This checks authored decision
 * quality and connectivity rather than pinning the incidental platform count
 * of the retired procedural-carpet layout. */

import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { buildLevel } from '../src/pure/generator.js';
import {
  latticeFaces, latticeStranded, latticeUnreachable,
} from '../src/pure/lattice.js';
import {
  VERTICAL_ASSAULT, VERTICAL_ASSAULT_FACES,
} from '../src/pure/vertical-assault.js';

const A = buildLevel(CONFIG);
const B = buildLevel(CONFIG);
const geometry = (level) => ({
  platforms: level.platforms,
  solidRects: level.solidRects,
  ladders: level.ladders,
  assaults: level.assaults,
  arenas: level.arenas,
  report: level.verticalAssault.report,
});
assert.deepEqual(geometry(A), geometry(B),
  'same config produces byte-stable assault geometry');
assert.equal(A.verticalAssault.id, 'vertical-assault-v2');
assert.equal(A.assaults.length, CONFIG.path.faces,
  'one authored assault chunk per Level 1 hull face');
assert.equal(A.lattice.patched, 0,
  'the six authored faces satisfy route density without anonymous repair bars');

const expectedArenaIds = [
  'arena-f2-mid',
  'arena-f3-mid', 'arena-f3-high',
  'arena-f4-mid', 'arena-f4-high', 'arena-f4-perch',
  'arena-f5-mid', 'arena-f5-high', 'arena-f5-third',
  'arena-f6-mid', 'arena-f6-high', 'arena-f6-third',
];
const ids = new Set(A.platforms.map((p) => p.id).filter(Boolean));
for (const id of expectedArenaIds) assert(ids.has(id), `preserves ${id}`);
for (let face = 1; face <= CONFIG.path.faces; face++) {
  assert(ids.has(`pocket-mid-f${face}`), `preserves pocket-mid-f${face}`);
  assert(ids.has(`pocket-shelf-f${face}`), `preserves pocket-shelf-f${face}`);
  if (face > 1) assert(ids.has(`arrival-f${face}`), `preserves arrival-f${face}`);
}

const authored = A.platforms.filter((p) => p.assault);
assert.equal(new Set(authored.map((p) => p.id)).size, authored.length,
  'authored platform IDs are unique');
assert(authored.every((p) => Number.isFinite(p.x0) && Number.isFinite(p.x1) &&
  Number.isFinite(p.y) && p.x1 > p.x0 &&
  p.x1 - p.x0 <= VERTICAL_ASSAULT.maxPlatformLen),
  'authored castings are finite, positive, and remain local maneuver pieces');

assert.deepEqual(A.verticalAssault.report.map((r) => r.span), VERTICAL_ASSAULT.spans,
  'measured local play-space span escalates 10 -> 15 tiles');
assert.equal(new Set(A.verticalAssault.report.map((r) => r.silhouette)).size, 6,
  'all six faces have a distinct named topology silhouette');
assert.equal(new Set(A.verticalAssault.report.map((r) => r.silhouetteSignature)).size, 6,
  'all six faces have distinct measured platform geometry');
assert.deepEqual(A.verticalAssault.report.map((r) => r.supportFamily),
  ['rib', 'service', 'cavity', 'vent', 'braid', 'root'],
  'all six silhouettes publish a distinct structural support dialect');
for (const row of A.verticalAssault.report) {
  assert(row.routeMin >= 3 && row.routeMax <= 5,
    `face ${row.face} keeps 3-5 readable immediate routes including deck`);
  assert(row.connectorCount >= 5,
    `face ${row.face} carries at least five real vertical connectors`);
  assert(row.recoveryCount >= 1,
    `face ${row.face} has an explicit safe drop/recovery lane`);
  assert(row.stagingCount >= 5,
    `face ${row.face} authors enemy staging across spatial roles`);
  assert(row.coverCount >= 1,
    `face ${row.face} has collision ribs/cover, not painted scenery`);
  assert.equal(row.gateApron, 7, `face ${row.face} retains the clean gate apron`);
}
for (let i = 1; i < A.verticalAssault.report.length; i++)
  assert(A.verticalAssault.report[i].span > A.verticalAssault.report[i - 1].span,
    'vertical room escalates every face');

const ladderKeys = ['face', 'id', 'kind', 'x', 'y0', 'y1'];
const ladderKinds = new Set(['rib', 'service', 'organic']);
for (const rail of A.ladders) {
  assert.deepEqual(Object.keys(rail).sort(), ladderKeys,
    `${rail.id} uses the frozen ladder schema`);
  assert(Number.isFinite(rail.x) && rail.y0 < rail.y1 &&
    rail.y1 - rail.y0 <= VERTICAL_ASSAULT.maxLift,
  `${rail.id} has ordered endpoints inside ordinary double-jump reach`);
  assert(ladderKinds.has(rail.kind), `${rail.id} uses a supported visual kind`);
  const lower = A.platforms.find((p) =>
    Math.abs(p.y - rail.y0) < 1e-6 && rail.x >= p.x0 && rail.x < p.x1);
  const upper = A.platforms.find((p) =>
    Math.abs(p.y - rail.y1) < 1e-6 && rail.x >= p.x0 && rail.x < p.x1);
  assert(lower && upper, `${rail.id} joins two real walkable surfaces`);
  assert(upper.y - lower.y <= CONFIG.gen.maxReach,
    `${rail.id} is a fast option rather than the only possible climb`);
  assert(!A.solidRects.some((r) =>
    r.x1 > rail.x - 0.35 && r.x0 < rail.x + 0.35 &&
    r.y1 > rail.y0 && r.y0 < rail.y1),
  `${rail.id} keeps a clear 0.7-tile body corridor`);
}

const wallsByFace = new Map();
for (const rect of A.solidRects.filter((r) => r.assault)) {
  assert(rect.grabbable && rect.y1 > rect.y0 && rect.x1 > rect.x0,
    `${rect.id} is a real positive grabbable collision rib`);
  wallsByFace.set(rect.face, (wallsByFace.get(rect.face) || 0) + 1);
}
for (let face = 1; face <= 6; face++)
  assert((wallsByFace.get(face) || 0) >= 1,
    `face ${face} has at least one placed collision rib/cover`);

assert.equal(latticeUnreachable(A, CONFIG).filter((p) => p.assault).length, 0,
  'every assault platform has a <=double-jump support');
assert.equal(latticeStranded(A, CONFIG).filter((p) => p.assault).length, 0,
  'every assault platform has a forward jump or safe drop');

for (const face of latticeFaces(CONFIG)) {
  const cleanFrom = face.corner - VERTICAL_ASSAULT.gateApron;
  const chunk = A.assaults.find((c) => c.face === face.face);
  assert(chunk.platforms.every((p) => p.x1 <= cleanFrom),
    `face ${face.face} leaves its seven-tile gate apron free of platforms`);
  assert(chunk.solidRects.every((r) => r.x1 <= cleanFrom),
    `face ${face.face} leaves its gate apron free of collision ribs`);
  assert(chunk.ladders.every((r) => r.x < cleanFrom),
    `face ${face.face} leaves its gate apron free of ladders`);
  assert(chunk.staging.every((s) => s.x < cleanFrom),
    `face ${face.face} keeps enemy staging out of the pivot`);
  assert.equal(chunk.routeCount, VERTICAL_ASSAULT_FACES[face.face - 1].routes,
    `face ${face.face} publishes its intended persistent-route count`);

  const anonymousCarpet = A.platforms.filter((p) =>
    !p.id && !p.routeBridge && p.x1 > chunk.x0 && p.x0 < chunk.x1);
  assert.equal(anonymousCarpet.length, 0,
    `face ${face.face} contains no anonymous procedural catwalk carpet`);
}

for (const bridge of A.platforms.filter((p) => p.routeBridge)) {
  let ownsGap = false;
  for (let x = Math.floor(bridge.x0); x < Math.ceil(bridge.x1); x++)
    if (A.groundH[x] <= -100) ownsGap = true;
  assert(ownsGap, `${bridge.id || `${bridge.x0}-${bridge.x1}`} protects a real deck gap`);
}

console.log('Vertical Assault v2: PASS');
console.log(JSON.stringify({
  totals: {
    platforms: A.platforms.length,
    authoredPlatforms: authored.length,
    ladders: A.ladders.length,
    collisionRibs: A.solidRects.length,
    anonymousPatches: A.lattice.patched,
  },
  faces: A.verticalAssault.report.map((row) => ({
    face: row.face,
    silhouette: row.silhouette,
    supportFamily: row.supportFamily,
    span: row.span,
    routes: [row.routeMin, row.routeMax],
    connectors: row.connectorCount,
    staging: row.stagingCount,
    recovery: row.recoveryCount,
  })),
}));
