#!/usr/bin/env node

import {
  existsSync, readFileSync, readdirSync, statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, readPngSize } from './assets/lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root,
  'assets/generated/enemy-ecology/level1-enemy-ecology-atlas-v1.manifest.json');
const provenancePath = join(root,
  'assets/generated/enemy-ecology/level1-enemy-ecology-imagegen-provenance-v1.json');
const designPath = join(root, 'docs/LEVEL1-ENEMY-ECOLOGY-PACK.md');
const expectedBodyStates = [
  'quiet-idle', 'awake-locomotion', 'acquisition-load', 'committed-load',
  'recovery-vent', 'impact-damaged', 'critical-damaged', 'death-breakup',
];
const expectedActionPhases = [
  'stowed', 'acquire', 'tell', 'release-early', 'release-peak',
  'follow-through', 'recover', 'spent-fail',
];

let assertions = 0;
function assert(condition, message) {
  assertions++;
  if (!condition) throw new Error(message);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function unique(values) { return new Set(values).size === values.length; }
function canonicalRgbaHash(width, height, rgba) {
  const dimensions = Buffer.alloc(8);
  dimensions.writeUInt32BE(width, 0);
  dimensions.writeUInt32BE(height, 4);
  return createHash('sha256')
    .update('hullbreaker:rgba8:v1\0')
    .update(dimensions)
    .update(rgba)
    .digest('hex');
}
function atlasCellRgba(source, col, row, size) {
  const rgba = Buffer.alloc(size * size * 4);
  const sourceX = col * size, sourceY = row * size;
  for (let y = 0; y < size; y++) {
    const start = ((sourceY + y) * source.width + sourceX) * 4;
    rgba.set(source.rgba.subarray(start, start + size * 4), y * size * 4);
  }
  return rgba;
}
function file(path) {
  const absolute = resolve(root, path);
  assert(existsSync(absolute), `missing ${path}`);
  assert(statSync(absolute).size > 0, `empty ${path}`);
  return absolute;
}
function readJson(path) { return JSON.parse(readFileSync(file(path), 'utf8')); }
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const manifest = readJson(manifestPath);
const provenance = readJson(provenancePath);
const design = readFileSync(file(designPath), 'utf8');
const { arithmetic, semantics, textureBudget, variants, components, review } = manifest;

assert(manifest.version === 1, 'manifest version must be 1');
assert(manifest.status.includes('exact ecologyId'),
  'runtime opt-in status must remain explicit');
assert(arithmetic.archetypes === 12, 'expected 12 archetypes');
assert(arithmetic.nativeLayersPerArchetype === 16, 'expected 16 native layers per archetype');
assert(arithmetic.nativeLayers === 192, 'expected 192 native layers');
assert(arithmetic.bodyStates === 8 && arithmetic.actionPhases === 8,
  'expected independent 8x8 state axes');
assert(arithmetic.visualStatesPerArchetype === 64, 'expected 64 states per archetype');
assert(arithmetic.totalVisualStates === 768, 'expected 768 total states');
assert(arithmetic.familySourceSets === 4, 'expected four family source sets');
assert(arithmetic.physicalAcceptedSourceBoards === 14, 'expected fourteen accepted physical source boards');
assert(same(semantics.bodyStates, expectedBodyStates), 'body semantic order changed');
assert(same(semantics.actionPhases, expectedActionPhases), 'action semantic order changed');

const atlasPath = file(textureBudget.file);
const atlas = readPngSize(atlasPath);
const atlasDecoded = decodePng(atlasPath);
assert(atlas.width === 3840 && atlas.height === 1280 && atlas.colorType === 6,
  `atlas must be 3840x1280 RGBA, got ${atlas.width}x${atlas.height} type ${atlas.colorType}`);
assert(textureBudget.cellPx === 160 && textureBudget.innerMaxPx === 136,
  'atlas cell/inner dimensions changed');
assert(textureBudget.minAtlasGuardPx === 12, 'atlas guard contract changed');
assert(textureBudget.baseBytes === 3840 * 1280 * 4, 'base texture budget arithmetic changed');
assert(textureBudget.estimatedMipmappedBytes === Math.ceil(3840 * 1280 * 4 * 4 / 3),
  'mipmapped texture budget arithmetic changed');
assert(textureBudget.commonQuadsPerEnemy === 2 && textureBudget.sourceBoardsAtRuntime === 0,
  'runtime draw/source-board budget changed');

assert(variants.length === 12, 'variant rows must contain 12 entries');
assert(components.length === 192, 'component rows must contain 192 entries');
assert(unique(variants.map((row) => row.id)), 'variant ids must be unique');
assert(unique(components.map((row) => row.id)), 'component ids must be unique');
assert(unique(components.map((row) => row.contentSha256)),
  'native layer content hashes must be unique; no duplicated states');
assert(components.every((row) => /^[a-f0-9]{64}$/.test(row.contentSha256)),
  'every native layer needs a SHA-256 content identity');
for (const row of components) {
  const [col, atlasRow] = row.atlas.cell;
  const rgba = atlasCellRgba(atlasDecoded, col, atlasRow, textureBudget.cellPx);
  assert(row.contentSha256 === canonicalRgbaHash(
    textureBudget.cellPx, textureBudget.cellPx, rgba,
  ), `${row.id}: content hash is not canonical decoded atlas-cell RGBA`);
}
assert(unique(components.map((row) => row.atlas.cell.join(','))),
  'atlas cells must be one-to-one with native layers');
assert(components.every((row) => row.atlas.cell[0] >= 0 && row.atlas.cell[0] < 24 &&
  row.atlas.cell[1] >= 0 && row.atlas.cell[1] < 8), 'component atlas cell out of bounds');
assert(components.every((row) => row.audit.atlasGuardPx >= 12),
  'a packed native layer violates the 12px atlas guard');
assert(components.every((row) => row.audit.magentaShare <= 0.004),
  'a packed native layer exceeds the magenta-fringe ceiling');
assert(components.every((row) => row.packing?.normalization === 'source-row-height' &&
  row.packing.sourceUnitPx > 0 && row.packing.variantAxisPxPerUnit > 0),
  'a native layer is missing measured uniform-scale metadata');
assert(components.filter((row) => row.index < 7)
  .every((row) => row.audit.largestIslandShare >= 0.70),
  'a live native layer is too disconnected to read as articulated anatomy');
assert(components.every((row) => manifest.invariants.sockets
  .every((socket) => row.sockets[socket])), 'a required composition socket is missing');

const componentById = new Map(components.map((row) => [row.id, row]));
const familyCounts = new Map();
const stateIds = [];
const tacticNames = [];
for (const variant of variants) {
  familyCounts.set(variant.family, (familyCounts.get(variant.family) || 0) + 1);
  tacticNames.push(...variant.newTactics);
  assert(variant.bodyIds.length === 8 && unique(variant.bodyIds),
    `${variant.id}: expected eight unique body ids`);
  assert(variant.actionIds.length === 8 && unique(variant.actionIds),
    `${variant.id}: expected eight unique action ids`);
  assert(variant.visualStateCount === 64 && variant.visualStates.length === 64,
    `${variant.id}: expected a complete 64-state Cartesian product`);
  for (let i = 0; i < 8; i++) {
    const body = componentById.get(`${variant.id}-b${i}`);
    const action = componentById.get(`${variant.id}-a${i}`);
    assert(body?.axis === 'body' && body.index === i, `${variant.id}: missing body ${i}`);
    assert(action?.axis === 'action' && action.index === i, `${variant.id}: missing action ${i}`);
  }
  const variantComponents = components.filter((row) => row.variantId === variant.id);
  assert(variantComponents.length === 16, `${variant.id}: expected 16 native layers`);
  for (const axis of ['body', 'action']) {
    const axisRows = variantComponents.filter((row) => row.axis === axis);
    assert(new Set(axisRows.map((row) => row.packing.scaleGroup)).size === 1 &&
      new Set(axisRows.map((row) => row.packing.variantAxisPxPerUnit)).size === 1,
    `${variant.id}:${axis}: eight rows must share one scale group and scale`);
  }
  assert(new Set(variantComponents.map((row) => JSON.stringify(row.pivot.sourceNormalized))).size === 1,
    `${variant.id}: body/action composition pivots disagree`);
  for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) {
    const index = b * 8 + a;
    const state = variant.visualStates[index];
    const expected = {
      id: `${variant.id}-b${b}-a${a}`,
      bodyId: `${variant.id}-b${b}`,
      actionId: `${variant.id}-a${a}`,
      bodyIndex: b,
      actionIndex: a,
    };
    assert(same(state, expected), `${variant.id}: malformed visual state ${b},${a}`);
    stateIds.push(state.id);
  }
}
assert(same(Object.fromEntries([...familyCounts].sort()), {
  aerial: 3, connector: 3, denial: 3, hunter: 3,
}), 'each ecology family must contain exactly three variants');
assert(unique(stateIds) && stateIds.length === 768, 'visual-state identities must be globally unique');
assert(same([...tacticNames].sort(), [
  'bounded-sweep', 'descent-comb', 'horizontal-burst', 'reverse-vault',
]), 'the asset pack must describe exactly four genuinely new tactic branches');

assert(provenance.accepted.length === 14, 'expected fourteen accepted ImageGen calls');
assert(provenance.rejected.length === 9, 'expected nine rejected ImageGen calls');
assert(provenance.accepted.every((row) => row.callId && row.exactRevisedPrompt &&
  row.generatedOriginal && row.workspaceFile), 'accepted provenance row incomplete');
assert(provenance.rejected.every((row) => row.callId && row.exactRevisedPrompt &&
  row.generatedOriginal), 'rejected provenance row incomplete');
const acceptedWorkspace = provenance.accepted.map((row) => row.workspaceFile).sort();
const manifestSources = Object.values(manifest.sourceSets).map((row) => row.file).sort();
assert(same(acceptedWorkspace, manifestSources), 'accepted provenance/source-set files disagree');
acceptedWorkspace.forEach(file);

assert(review.contacts.length === 12 && unique(review.contacts),
  'expected one 64-state contact sheet per variant');
for (const path of review.contacts) {
  const png = readPngSize(file(path));
  assert(png.width === 2304 && png.height === 1632 && png.colorType === 6,
    `${path}: 64-state proof must be 2304x1632 RGBA`);
}
assert(review.gameplayScale.length === 3 && unique(review.gameplayScale),
  'expected two desktop and one portrait gameplay-scale proofs');
const gameplaySizes = review.gameplayScale.map((path) => readPngSize(file(path)));
assert(gameplaySizes[0].width === 1440 && gameplaySizes[0].height === 900 &&
  gameplaySizes[1].width === 1440 && gameplaySizes[1].height === 900 &&
  gameplaySizes[2].width === 390 && gameplaySizes[2].height === 844,
  'gameplay-scale proof dimensions changed');
const damageFar = readPngSize(file(review.damageScale.far));
const damagePortrait = readPngSize(file(review.damageScale.portrait));
assert(damageFar.width === 960 && damageFar.height === 660 &&
  damagePortrait.width === 390 && damagePortrait.height === 480,
  'damage FAR/portrait proof dimensions changed');
const houndFar = readPngSize(file(review.houndMotionScale.far));
const houndPortrait = readPngSize(file(review.houndMotionScale.portrait));
assert(houndFar.width === 1280 && houndFar.height === 660 &&
  houndPortrait.width === 520 && houndPortrait.height === 480,
  'hound-motion FAR/portrait proof dimensions changed');
const aerialFar = readPngSize(file(review.aerialReadability.far));
const aerialPortrait = readPngSize(file(review.aerialReadability.portrait));
assert(aerialFar.width === 1000 && aerialFar.height === 450 &&
  aerialPortrait.width === 520 && aerialPortrait.height === 390,
  '42px aerial FAR/portrait proof dimensions changed');
const socketProof = readPngSize(file(review.sockets));
assert(socketProof.width === 1200 && socketProof.height === 630,
  'socket proof dimensions changed');
[
  'assets/generated/enemy-ecology/review/bases/level1-face1-clean-v1.png',
  'assets/generated/enemy-ecology/review/bases/level1-mid-clean-v1.png',
  'assets/generated/enemy-ecology/review/bases/level1-portrait-clean-v1.png',
].forEach(file);
const master = readPngSize(file(review.master));
const edge = readPngSize(file(review.edge));
assert(master.width === 1666 && master.height === 2040, 'master proof dimensions changed');
assert(edge.width === 1000 && edge.height === 1896, 'edge proof dimensions changed');
assert(review.composedProofStates === 768, 'all 768 composed states need crop proof');
assert(review.minComposedGuardPx >= 4,
  `composed crop guard is unsafe (${review.minComposedGuardPx}px)`);

assert(design.includes('768') && design.includes('64'),
  'design contract must retain 64/768 state arithmetic');
const designTacticPhrases = {
  'bounded-sweep': 'bounded arc',
  'descent-comb': 'descent comb',
  'horizontal-burst': 'horizontal burst',
  'reverse-vault': 'reverse-vault',
};
for (const tactic of tacticNames) assert(design.includes(designTacticPhrases[tactic]),
  `design contract does not mention ${tactic}`);

const runtimeFiles = sourceFiles(join(root, 'src'))
  .filter((path) => ['.js', '.mjs', '.ts'].includes(extname(path)));
const atlasConsumers = runtimeFiles.filter((path) => {
  const text = readFileSync(path, 'utf8');
  return text.includes('level1-enemy-ecology-atlas') ||
    text.includes('assets/generated/enemy-ecology');
});
const forbiddenRuntimeSources = runtimeFiles.filter((path) => {
  const text = readFileSync(path, 'utf8');
  return text.includes('enemy-ecology/source-boards') ||
    text.includes('enemy-ecology/review/') || text.includes('chroma-v');
});
assert(forbiddenRuntimeSources.length === 0,
  `runtime imported source/review art: ${forbiddenRuntimeSources.join(', ')}`);
assert(atlasConsumers.length === 1 &&
  atlasConsumers[0].endsWith(join('src', 'render', 'enemy-ecology-spec.js')),
`the generated runtime spec must be the atlas's only direct source consumer: ${atlasConsumers.join(', ')}`);

console.log(JSON.stringify({
  ok: true,
  assertions,
  atlas: { width: atlas.width, height: atlas.height, colorType: atlas.colorType },
  ecology: {
    families: Object.fromEntries([...familyCounts].sort()),
    variants: variants.length,
    nativeLayers: components.length,
    distinctLayerHashes: new Set(components.map((row) => row.contentSha256)).size,
    visualStates: stateIds.length,
    newTactics: [...tacticNames].sort(),
  },
  proofs: {
    contacts: review.contacts.length,
    composedStates: review.composedProofStates,
    minComposedGuardPx: review.minComposedGuardPx,
  },
  provenance: { accepted: provenance.accepted.length, rejected: provenance.rejected.length },
  runtimeIntegration: {
    atlasConsumers: atlasConsumers.length,
    forbiddenSourceOrReviewConsumers: forbiddenRuntimeSources.length,
  },
}, null, 2));
