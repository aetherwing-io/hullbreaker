#!/usr/bin/env node

/* Fast renderer contract gate. Asset extraction remains in the expensive
   packer; this checker proves that the accepted manifest, generated browser
   spec, state selector and deliberately narrow hostile integration still
   agree without launching WebGL. Live composition is proved separately in
   the browser fixture. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import {
  LEVEL1_NEUTRAL_ECOLOGY_VISUAL, enemyEcologyCondensationStarted,
  neutralEnemyEcologyVisualId,
} from '../src/pure/enemy-ecology.js';
import {
  ENEMY_ECOLOGY_ATLAS, ENEMY_ECOLOGY_COMPONENT_SHA256,
  ENEMY_ECOLOGY_MANIFEST_SHA256, ENEMY_ECOLOGY_VARIANTS,
  enemyEcologyVariant,
} from '../src/render/enemy-ecology-spec.js';
import {
  ECOLOGY_ACTION, ECOLOGY_BODY, enemyEcologyActionIndex,
  enemyEcologyBodyIndex, enemyEcologyVisualCode, selectEnemyEcologyVisual,
} from '../src/render/enemy-ecology-select.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root,
  'assets/generated/enemy-ecology/level1-enemy-ecology-atlas-v1.manifest.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
const CELL = manifest.textureBudget.cellPx;
let assertions = 0;

function assert(condition, message) {
  assertions++;
  if (!condition) throw new Error(message);
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function close(a, b, epsilon = 1 / 32 + 1e-9) { return Math.abs(a - b) <= epsilon; }
function source(path) { return readFileSync(join(root, path), 'utf8'); }
function row(overrides = {}) {
  return {
    id: 1, kind: 'hound', hp: 10, maxHp: 10, state: 'prowl',
    stateUntil: 0, enterUntil: 0, flashUntil: 0, tacticPhase: '',
    tacticProgress: 0, x: 0, y: 0, t: 0, vx: 0, vy: 0, dir: 1,
    ...overrides,
  };
}
function expectVisual(label, input, nowMs, body, action) {
  const value = selectEnemyEcologyVisual(input, nowMs);
  assert(enemyEcologyBodyIndex(value) === body,
    `${label}: body ${enemyEcologyBodyIndex(value)} != ${body}`);
  assert(enemyEcologyActionIndex(value) === action,
    `${label}: action ${enemyEcologyActionIndex(value)} != ${action}`);
}
function componentContract(component) {
  return {
    id: component.id,
    contentSha256: component.contentSha256,
    cell: component.atlas.cell,
    visiblePx: component.atlas.visiblePx,
    pivot: component.pivot.cellPx,
    root: component.sockets.root.cellPx,
    attack: component.sockets.attack.cellPx,
  };
}

assert(sha256(manifestBytes) === ENEMY_ECOLOGY_MANIFEST_SHA256,
  'generated spec has a stale manifest hash');
assert(sha256(JSON.stringify(manifest.components.map(componentContract))) ===
  ENEMY_ECOLOGY_COMPONENT_SHA256, 'generated spec has a stale component contract hash');
assert(same(ENEMY_ECOLOGY_ATLAS.canvas, [3840, 1280]) &&
  same(ENEMY_ECOLOGY_ATLAS.grid, [24, 8]) && ENEMY_ECOLOGY_ATLAS.cellPx === 160,
  'runtime atlas geometry changed');
assert(ENEMY_ECOLOGY_ATLAS.componentCount === 192 &&
  ENEMY_ECOLOGY_ATLAS.visualStateCount === 768,
  'runtime vocabulary arithmetic changed');
assert(ENEMY_ECOLOGY_VARIANTS.length === 12 && manifest.variants.length === 12,
  'expected twelve runtime variants');
assert(same(LEVEL1_NEUTRAL_ECOLOGY_VISUAL, {
  hound: 'hound-railfang', wasp: '',
  polyp: 'polyp-needle', mortar: 'mortar-craterpod',
}) && neutralEnemyEcologyVisualId('carrier') === '' &&
  neutralEnemyEcologyVisualId('warden') === '',
  'visual-only neutral identities changed or escaped onto carrier/Warden art');
const staged = { enterUntil: 9000 };
assert(!enemyEcologyCondensationStarted(staged, 5999.999, 3000) &&
  enemyEcologyCondensationStarted(staged, 6000, 3000) &&
  !enemyEcologyCondensationStarted({}, 6000, 3000),
  'condensation visibility is not closed before its exact first frame');

const manifestComponents = new Map(manifest.components.map((entry) => [entry.id, entry]));
for (let variantIndex = 0; variantIndex < manifest.variants.length; variantIndex++) {
  const authored = manifest.variants[variantIndex];
  const spec = ENEMY_ECOLOGY_VARIANTS[variantIndex];
  assert(spec.id === authored.id && spec.family === authored.family &&
    spec.kind === authored.kind, `${authored.id}: generated identity changed`);
  assert(enemyEcologyVariant(spec.id, spec.kind) === spec,
    `${authored.id}: exact id/kind lookup failed`);
  assert(enemyEcologyVariant(spec.id, 'wrong-kind') === null,
    `${authored.id}: renderer accepted a mismatched sim kind`);
  assert(spec.bodyColumn === variantIndex * 2 && spec.actionColumn === variantIndex * 2 + 1,
    `${authored.id}: adjacent body/action columns changed`);
  assert(spec.rows.length === 8, `${authored.id}: expected eight metadata rows`);

  const bodyBounds = [], actionBounds = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let index = 0; index < 8; index++) {
    const body = manifestComponents.get(`${authored.id}-b${index}`);
    const action = manifestComponents.get(`${authored.id}-a${index}`);
    const packed = spec.rows[index];
    assert(!!body && !!action, `${authored.id}: missing source metadata row ${index}`);
    const expected = [
      body.sockets.root.cellPx, body.pivot.cellPx,
      action.pivot.cellPx, action.sockets.attack.cellPx,
    ];
    const actual = [packed.bodyRoot, packed.bodyPivot, packed.actionPivot, packed.actionAttack];
    for (let group = 0; group < 4; group++) for (let axis = 0; axis < 2; axis++)
      assert(close(actual[group][axis], expected[group][axis]),
        `${authored.id} row ${index}: packed coordinate drift`);

    const [rootX, rootY] = body.sockets.root.cellPx;
    const [pivotX, pivotY] = body.pivot.cellPx;
    const [actionPivotX, actionPivotY] = action.pivot.cellPx;
    const [bx, by, bw, bh] = body.atlas.visiblePx;
    const [ax, ay, aw, ah] = action.atlas.visiblePx;
    const bx0 = bx - body.atlas.cell[0] * CELL;
    const by0 = by - body.atlas.cell[1] * CELL;
    const ax0 = ax - action.atlas.cell[0] * CELL;
    const ay0 = ay - action.atlas.cell[1] * CELL;
    bodyBounds.push([bx0 - rootX, rootY - (by0 + bh), bx0 + bw - rootX, rootY - by0]);
    actionBounds.push([
      ax0 - actionPivotX, actionPivotY - (ay0 + ah),
      ax0 + aw - actionPivotX, actionPivotY - ay0,
    ]);
    bodyBounds[index].compose = [pivotX - rootX, rootY - pivotY];
  }
  for (let body = 0; body < 8; body++) for (let action = 0; action < 8; action++) {
    const bb = bodyBounds[body], ab = actionBounds[action];
    const [dx, dy] = bb.compose;
    minX = Math.min(minX, bb[0], dx + ab[0]);
    minY = Math.min(minY, bb[1], dy + ab[1]);
    maxX = Math.max(maxX, bb[2], dx + ab[2]);
    maxY = Math.max(maxY, bb[3], dy + ab[3]);
  }
  [minX, minY, maxX, maxY].forEach((value, index) =>
    assert(close(spec.bounds[index], value, 1e-6),
      `${authored.id}: 64-state fixed-fit union is stale`));
}

// Honest selector coverage: normal role states, the four new tactic branches,
// damage precedence and terminal B7/A7. No test field exists only for art.
const locomotion = [0, 0.2, 0.8].map((x) =>
  enemyEcologyActionIndex(selectEnemyEcologyVisual(row({ x }), 1000)));
assert(same(locomotion, [0, 1, 6]), 'hound locomotion does not articulate A0/A1/A6');
const flight = [0, 0.1, 0.2].map((t) => enemyEcologyActionIndex(
  selectEnemyEcologyVisual(row({ kind: 'wasp', state: 'cruise', t }), 1000)));
assert(same(flight, [0, 1, 6]), 'wasp flight does not articulate A0/A1/A6');
expectVisual('hound tell', row({ state: 'tell' }), 1000,
  ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
expectVisual('hound charge early', row({ state: 'charge',
  stateUntil: 1000 + CONFIG.hound.chargeMs * 0.8 }), 1000,
ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.EARLY);
expectVisual('hound vault peak', row({ state: 'vault',
  stateUntil: 1000 + CONFIG.genome.vaultMs * 0.5 }), 1000,
ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.PEAK);
expectVisual('hound vault follow', row({ state: 'vault',
  stateUntil: 1000 + CONFIG.genome.vaultMs * 0.2 }), 1000,
ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.FOLLOW);
expectVisual('rebound tell', row({ tacticPhase: 'charge-tell' }), 1000,
  ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
expectVisual('rebound reverse vault', row({ tacticPhase: 'reverse-vault', tacticProgress: 0.8 }),
  1000, ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.FOLLOW);
expectVisual('crosswind tell', row({ kind: 'wasp', tacticPhase: 'horizontal-line-tell' }),
  1000, ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
expectVisual('crosswind burst', row({ kind: 'wasp', tacticPhase: 'parallel-burst',
  tacticProgress: 0.7 }), 1000, ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.PEAK);
expectVisual('wasp dive tell', row({ kind: 'wasp', state: 'dive', lockUntil: 1100 }),
  1000, ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
expectVisual('polyp fire early', row({ kind: 'polyp', state: 'fire',
  stateUntil: 1000 + CONFIG.polyp.beamMs * 0.8 }), 1000,
ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.EARLY);
expectVisual('sweepfan tell', row({ kind: 'polyp', tacticPhase: 'bounded-arc-tell' }),
  1000, ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
expectVisual('sweepfan release', row({ kind: 'polyp', state: 'fire',
  tacticPhase: 'sweep-start', tacticProgress: 0.7 }), 1000,
ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.PEAK);
expectVisual('aircomb tell', row({ kind: 'mortar', tacticPhase: 'comb-corridor-tell' }),
  1000, ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
expectVisual('aircomb impact', row({ kind: 'mortar', tacticPhase: 'comb-impact' }),
  1000, ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.FOLLOW);
expectVisual('mortar lob early', row({ kind: 'mortar', state: 'lob', podU: 0.2 }),
  1000, ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.EARLY);
expectVisual('hit override', row({ kind: 'mortar', state: 'fuse', flashUntil: 1100 }),
  1000, ECOLOGY_BODY.HIT, ECOLOGY_ACTION.TELL);
expectVisual('critical override', row({ kind: 'polyp', state: 'vent', hp: 3, maxHp: 10,
  stateUntil: 1000 + CONFIG.polyp.ventMs * 0.75 }),
  1000, ECOLOGY_BODY.CRITICAL, ECOLOGY_ACTION.FOLLOW);
expectVisual('terminal breakup', row({ hp: 0 }), 1000,
  ECOLOGY_BODY.BREAKUP, ECOLOGY_ACTION.SPENT);
assert(enemyEcologyVisualCode(ECOLOGY_BODY.BREAKUP, ECOLOGY_ACTION.SPENT) === 63,
  'B7/A7 must remain packed code 63');

const main = source('src/main.js');
const art = source('src/render/enemy-ecology-art.js');
const runtime = source('src/render/enemy-ecology.js');
const selector = source('src/render/enemy-ecology-select.js');
const tactic = source('src/render/enemy-ecology-tactics.js');
const hostiles = source('src/render/hostiles.js');
const ecologyPresenter = source('src/render/hostile-presenters/ecology.js');
const simHostiles = source('src/sim/hostiles.js');
const simTactics = source('src/sim/ecology-tactics.js');
const spawner = source('src/sim/spawner.js');
const finale = source('src/sim/finale.js');
const ecologyMaterial = hostiles.slice(hostiles.indexOf('function enemyEcologyMaterial'),
  hostiles.indexOf('const WASP_WING_DEPTH_BIAS'));
const tacticSync = tactic.slice(tactic.indexOf('export function syncEnemyEcologyTactics'),
  tactic.indexOf('export function isSweepfanBeam'));
const hideVisual = hostiles.slice(hostiles.indexOf('function hideHostileVisual'),
  hostiles.indexOf('function sync(e)'));
const liveSync = hostiles.slice(hostiles.indexOf('function sync(e)'),
  hostiles.indexOf('installView({ hostiles:'));

assert(main.indexOf("import './render/enemy-ecology-art.js'") >= 0 &&
  main.indexOf("import './render/enemy-ecology-art.js'") <
    main.indexOf("import './render/world-detail-art.js'"),
  'ecology atlas is not registered at the head of the shared preload gate');
assert((art.match(/preloadTexture\(/g) || []).length === 1 &&
  art.includes('await awaitPreloads()') && art.includes('settledBeforeConsumer: true'),
  'ecology art owner must issue and settle exactly one preload request');
assert(!art.includes('.manifest.json') && !art.includes('source-boards') && !art.includes('/review/'),
  'runtime art owner references a non-runtime asset');
assert(ecologyMaterial.includes('new THREE.MeshBasicMaterial') &&
  !/\n\s+emissiveMap\s*:/.test(ecologyMaterial) &&
  !/\n\s+emissive\s*:/.test(ecologyMaterial) &&
  !/\n\s+emissiveIntensity\s*:/.test(ecologyMaterial) &&
  ecologyMaterial.includes('alphaTest: 0.035') &&
  ecologyMaterial.includes('forceSinglePass: true'),
  'ecology material lost its authored-value, alpha-tested, single-pass, ' +
  'non-emissive contract');
for (const [name, text] of Object.entries({ art, runtime, selector, tactic }))
  assert(!/(createElement|OffscreenCanvas|CanvasTexture|canvas\.getContext)/.test(text),
    `${name}: runtime canvas/crop path introduced`);
assert(runtime.includes('componentGeometries: bundles.size * 16') &&
  runtime.includes('visualCombinations: bundles.size * 64') &&
  runtime.includes('quadsPerLiveEnemy: 2') && runtime.includes('crossfade: false'),
  'two-layer/192-geometry/768-state runtime budget changed');
assert(hostiles.includes('enemyEcologyBundle(e.ecologyId || e.ecologyVisualId, e.kind)') &&
  hostiles.includes('presenter.spawn(PRESENTER_API, { e, K, assets, presenter });') &&
  ecologyPresenter.includes("id: 'ecology'") &&
  ecologyPresenter.includes('spawn: (api, context) => api.spawnEcology(context)') &&
  hostiles.includes('attachEnemyEcologyTactics(v, e);         // no-op for every ordinary row'),
  'gameplay-first/visual-only ecology branch or ordinary fallback seam changed');
assert(simHostiles.includes("row?.ecologyId\n    ? ecologyFields.ecologyId : row?.ecologyVisualId || visualId") &&
  simHostiles.includes("resolveEnemyEcology(requestedVisualId, kind)?.id || ''") &&
  !simTactics.includes('ecologyVisualId') &&
  spawner.includes('neutralEnemyEcologyVisualId(kind)') &&
  (spawner.match(/neutralEnemyEcologyVisualId\(/g) || []).length >= 7 &&
  /const ecologyVisualId = entry\.ecologyVisualId \|\|\s+neutralEnemyEcologyVisualId\(entry\.kind\)/
    .test(finale) &&
  (finale.match(/, row,\n\s+ecologyVisualId\)/g) || []).length === 4,
  'visual-only Level-1 ambient/adaptive/finale coverage changed or entered tactic code');
const condensationGuard = liveSync.indexOf(
  'if (!enemyEcologyCondensationStarted(e, gameMs, W.enterMs))');
assert(hostiles.includes('actionMesh.visible = false;') &&
  hostiles.includes('hideHostileVisual(v, e);\n  scene.add(mesh);') &&
  hideVisual.includes('v.mesh.visible = false;') &&
  hideVisual.includes('v.ecologyActionMesh.visible = false;') &&
  hideVisual.includes('hideEnemyEcologyTactics(v);') &&
  condensationGuard >= 0 && condensationGuard < liveSync.indexOf('v.mesh.visible = true;') &&
  liveSync.slice(condensationGuard, liveSync.indexOf('v.mesh.visible = true;'))
    .includes('hideHostileVisual(v, e);'),
  'pre-condensation ecology body/action/tactic visibility no longer fails fully closed');
assert(ecologyPresenter.includes('freezeEnemyEcologyBreakup(v)') &&
  hostiles.includes('if (v.ecology) return null;') &&
  /const rig = e\.kind === 'warden'\s*\? claimDeathRig\(v, e\)\s*:\s*motionFrame >= 0 \? null : claimDeathRig\(v, e\)/.test(hostiles) &&
  /const frozenMotion = motionFrame >= 0 \? \{[\s\S]*rootedTerminal: e\.kind === 'warden'/.test(hostiles) &&
  hostiles.includes("ruptureMode: c.ecologyDeath ? 'ecology-b7-a7'") &&
  hostiles.includes('shrink: c.ecologyDeath ? false') &&
  hostiles.includes('spiral: false'),
  'B7/A7 physical death contract changed');
assert(tactic.includes('ECOLOGY_TACTIC_SLOT_CAP = 3') &&
  tactic.includes('fixedOwnerLocal: true') && tactic.includes('hotLoopAllocations: 0') &&
  tactic.includes("routeAndTurnGate: 'prev+mid+current routeRenderable'") &&
  tactic.includes('materialsDisposed: tacticMaterialsDisposed') &&
  !/\bnew\s+/.test(tacticSync),
  'fixed tactic VFX lost its cap, turn gate, disposal proof or allocation ceiling');
assert(hostiles.includes('v.beam.scale.set(drawReach, sweepfan ? 1 : pulse') &&
  hostiles.includes('(!sweepfanOwner || sweepfan)') &&
  hostiles.includes('enemyOwnsSweepfanBeam(e)') &&
  hostiles.includes('Math.atan2(e.tacticBeamY, e.tacticBeamX)') &&
  hostiles.includes('Math.abs(v.beam.scale.x - e.beamReach)'),
  'Sweepfan exact-vector/no-straight-fallback visual proof changed');

console.log(JSON.stringify({
  ok: true,
  assertions,
  manifestSha256: ENEMY_ECOLOGY_MANIFEST_SHA256,
  componentSha256: ENEMY_ECOLOGY_COMPONENT_SHA256,
  runtime: {
    variants: ENEMY_ECOLOGY_VARIANTS.length,
    componentGeometries: ENEMY_ECOLOGY_VARIANTS.length * 16,
    visualStates: ENEMY_ECOLOGY_VARIANTS.length * 64,
    textures: 1,
    quadsPerEnemy: 2,
    extraDrawsPerEnemy: 1,
  },
  selector: { terminalCode: 63, newTactics: 4 },
}, null, 2));
