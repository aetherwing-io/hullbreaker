#!/usr/bin/env node
/* Deterministic contract + allocation-shape check for the first Level 1
 * ecology runtime seam. This is intentionally renderer-free: presentation
 * consumes these fields later, while the decision geometry is proved here. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import {
  ENEMY_TACTICS, LEVEL1_ENEMY_ECOLOGY, LEVEL1_NEUTRAL_ECOLOGY_VISUAL,
  aircombTooth, crosswindPulse, effectiveEcologyMechanics,
  neutralEnemyEcologyVisualId, reboundLaunch, resolveEnemyEcology,
  segmentBandHitsRect, sweepfanDirection,
} from '../src/pure/enemy-ecology.js';
import { LEVEL1_ECOLOGY_ENCOUNTERS } from '../src/pure/level1-ecology-encounters.js';
import {
  beginCrosswind, beginRebound, makeEnemyEcologyFields, updateAircomb,
  updateCrosswind, updateEnemyTacticHazards, updateRebound, updateSweepfan,
} from '../src/sim/ecology-tactics.js';
import { hostiles, clearHostiles, spawnHostile } from '../src/sim/hostiles.js';
import { FINALE_TIMING, startFinale, updateFinale } from '../src/sim/finale.js';
import { builtGroundTopAt } from '../src/sim/level.js';
import { player } from '../src/sim/player.js';
import { advanceGameMs, gameMs, setScrollX } from '../src/sim/time.js';
import { setEdges } from '../src/sim/edges.js';

let passes = 0;
function pass(condition, message) {
  assert.ok(condition, message);
  passes++;
  console.log(`PASS ${message}`);
}

function same(a, b, message) {
  assert.deepEqual(a, b, message);
  passes++;
  console.log(`PASS ${message}`);
}

/* --------------------------- immutable data ----------------------- */

pass(Object.isFrozen(LEVEL1_ENEMY_ECOLOGY), 'the twelve-role ecology table is frozen');
pass(LEVEL1_ENEMY_ECOLOGY.length === 12, 'exactly twelve Level 1 archetypes are declared');
pass(new Set(LEVEL1_ENEMY_ECOLOGY.map((row) => row.id)).size === 12,
  'every ecology ID is unique');
same(LEVEL1_NEUTRAL_ECOLOGY_VISUAL, {
  hound: 'hound-railfang',
  wasp: 'wasp-diveclaw',
  polyp: 'polyp-needle',
  mortar: 'mortar-craterpod',
}, 'ordinary Level 1 kinds own deterministic zero-recipe visual identities');
pass(Object.isFrozen(LEVEL1_NEUTRAL_ECOLOGY_VISUAL) &&
    neutralEnemyEcologyVisualId('carrier') === '' &&
    neutralEnemyEcologyVisualId('warden') === '',
  'carrier and Warden remain on their dedicated production art');
pass(Object.entries(LEVEL1_NEUTRAL_ECOLOGY_VISUAL).every(([kind, id]) => {
  const neutral = resolveEnemyEcology(id, kind);
  return neutral && neutral.mechanics.length === 0 && neutral.tactics.length === 0;
}), 'every visual-only default is a zero-mechanic, zero-tactic recipe');

for (const family of ['hunter', 'aerial', 'connector', 'denial']) {
  pass(LEVEL1_ENEMY_ECOLOGY.filter((row) => row.family === family).length === 3,
    `${family} owns exactly three archetypes`);
}
for (const row of LEVEL1_ENEMY_ECOLOGY) {
  pass(Object.isFrozen(row) && Object.isFrozen(row.mechanics) && Object.isFrozen(row.tactics),
    `${row.id} recipe and trait lists are immutable`);
  pass(!('hp' in row) && !('maxHp' in row) && !('hitRadius' in row),
    `${row.id} carries no hidden durability or collision inflation`);
  same(resolveEnemyEcology(row.id, row.kind), row, `${row.id} resolves only to its frozen recipe`);
  pass(resolveEnemyEcology(row.id, row.kind === 'wasp' ? 'hound' : 'wasp') === null,
    `${row.id} fails closed on the wrong base kind`);
}

const tacticRows = LEVEL1_ENEMY_ECOLOGY.filter((row) => row.tactics.length);
same(tacticRows.map((row) => row.id), [
  'hound-rebound', 'wasp-crosswind', 'polyp-sweepfan', 'mortar-aircomb',
], 'only the four reviewed archetypes add a new behavior kernel');
same(tacticRows.flatMap((row) => row.tactics), Object.values(ENEMY_TACTICS),
  'each new tactic is expressed exactly once');

const mergedCrosswind = effectiveEcologyMechanics(
  resolveEnemyEcology('wasp-crosswind', 'wasp'),
  { genes: Object.freeze(['TWINSTRIKE', 'PINCER', 'BULWARK', 'BACKLASH']) });
same(mergedCrosswind, ['PINCER', 'TWINSTRIKE', 'BULWARK'],
  'pinned existing organs consume the same three-slot genome ceiling');
const mergedRebound = effectiveEcologyMechanics(
  resolveEnemyEcology('hound-rebound', 'hound'),
  { genes: Object.freeze(['VAULT', 'BULWARK', 'BACKLASH']) });
same(mergedRebound, ['BULWARK', 'BACKLASH'],
  'Rebound reserves locomotion so a random VAULT cannot erase its paid charge');

const inert = makeEnemyEcologyFields('wasp', null, 7);
pass(inert.ecologyId === '' && inert.tactics.length === 0 && inert.tacticHazards === null,
  'a row without ecologyId remains inert and allocates no hazard pool');
const inertEnemy = { ...inert, state: 'cruise' };
pass(updateRebound(inertEnemy, 1 / 60) === '' &&
    updateCrosswind(inertEnemy, 1 / 60, -10, 10) === false &&
    updateSweepfan(inertEnemy, true) === false &&
    updateAircomb(inertEnemy, true, -10, 10) === false,
  'all four runtime kernels fail closed for an unassigned ordinary enemy');

/* ----------------------------- pure geometry ---------------------- */

const reboundA = reboundLaunch(1, CONFIG.enemyEcology.rebound);
const reboundB = reboundLaunch(1, CONFIG.enemyEcology.rebound);
same(reboundA, reboundB, 'Rebound launch is deterministic');
pass(reboundA.dir === -1 && reboundA.vx < 0 && reboundA.vy > 0,
  'Rebound reverses the paid charge and freezes an upward ballistic launch');

const pulsesA = [0, 1, 2].map((i) => crosswindPulse(i, 10, 5, -1,
  CONFIG.enemyEcology.crosswind));
const pulsesB = [0, 1, 2].map((i) => crosswindPulse(i, 10, 5, -1,
  CONFIG.enemyEcology.crosswind));
same(pulsesA, pulsesB, 'Crosswind three-pulse release is deterministic');
pass(pulsesA.length === 3 && pulsesA.every((p) => p.vx < 0 && p.vy === 0),
  'Crosswind is exactly three parallel horizontal pulses');

const vector = {};
const firstVector = sweepfanDirection(-1, 1, 0, CONFIG.enemyEcology.sweepfan, vector);
for (let i = 0; i < 20000; i++) {
  const out = sweepfanDirection(-1, i & 1 ? -1 : 1, (i % 101) / 100,
    CONFIG.enemyEcology.sweepfan, vector);
  assert.strictEqual(out, firstVector, 'Sweepfan must reuse the caller-owned vector');
}
passes++;
console.log('PASS Sweepfan performs 20,000 active-frame solves with one stable output object');
pass(CONFIG.enemyEcology.sweepfan.halfAngleRad < Math.PI / 2,
  'Sweepfan arc is bounded below a half-room spin');
pass(segmentBandHitsRect(0, 0, 8, 4, 0.2, 3.8, 4.2, 1.8, 2.2) &&
    !segmentBandHitsRect(0, 0, 8, 4, 0.2, 3.8, 4.2, 4.0, 4.4),
  'Sweepfan band collision agrees with its drawn diagonal segment');

const teethA = [0, 1, 2].map((i) => aircombTooth(i, 20, 1,
  CONFIG.enemyEcology.aircomb));
const teethB = [0, 1, 2].map((i) => aircombTooth(i, 20, 1,
  CONFIG.enemyEcology.aircomb));
same(teethA, teethB, 'Aircomb three-tooth corridor is deterministic');
const toothGaps = [teethA[1].x - teethA[0].x, teethA[2].x - teethA[1].x];
pass(teethA.length === 3 && toothGaps[1] > toothGaps[0],
  'Aircomb is exactly three teeth with one deliberately wider visible gap');
pass(toothGaps[1] - teethA[1].radius - teethA[2].radius > CONFIG.player.width,
  'Aircomb wide gap clears the full RIG collision width');

/* ------------------------ stable runtime pools -------------------- */

setScrollX(0);
setEdges(-20, 40);
player.x = 8;
player.y = 2;
player.vx = 0;
player.vy = 0;
clearHostiles();
advanceGameMs(CONFIG.wasp.enterMs + 50);

function spawn(kind, x, y, row) {
  spawnHostile(x, y, 0, kind, row);
  const e = hostiles[hostiles.length - 1];
  e.enterUntil = gameMs - 1;
  return e;
}

spawnHostile(4, 6, 0, 'wasp', { id: 'runtime-visual-only', gating: false },
  neutralEnemyEcologyVisualId('wasp'));
const visualOnly = hostiles[hostiles.length - 1];
pass(visualOnly.ecologyId === '' && visualOnly.ecologyVisualId === 'wasp-diveclaw' &&
    visualOnly.ecologyMechanics.length === 0 && visualOnly.tactics.length === 0 &&
    visualOnly.tacticHazards === null && visualOnly.hp === CONFIG.wasp.hp &&
    visualOnly.maxHp === CONFIG.wasp.hp,
  'visual-only identity selects reviewed art without tactics, recipe mechanics, hazards or HP drift');
clearHostiles();

spawnHostile(4, 6, 0, 'wasp', { id: 'runtime-bad-visual', gating: false },
  'hound-railfang');
const wrongVisual = hostiles[hostiles.length - 1];
pass(wrongVisual.ecologyId === '' && wrongVisual.ecologyVisualId === '' &&
    wrongVisual.tacticHazards === null,
  'visual-only identity fails closed when its base kind does not match');
clearHostiles();

const crosswind = spawn('wasp', 14, 7, { id: 'runtime-crosswind',
  ecologyId: 'wasp-crosswind', gating: false });
pass(crosswind.ecologyVisualId === crosswind.ecologyId &&
    crosswind.hp === CONFIG.wasp.hp && crosswind.maxHp === CONFIG.wasp.hp &&
    crosswind.pincer && crosswind.twinstrike,
  'authored Crosswind identity owns its exact art and reuses base durability plus PINCER/TWINSTRIKE');
const crosswindPool = crosswind.tacticHazards;
const crosswindSlots = [...crosswindPool];
for (let cycle = 0; cycle < 32; cycle++) {
  player.x = 8; player.y = 2;
  crosswind.x = 14; crosswind.y = crosswind.baseY = 7;
  crosswind.state = 'cruise'; crosswind.formationReady = true;
  crosswind.diveCdUntil = 0; crosswind.twinPassesLeft = 0;
  assert.ok(beginCrosswind(crosswind, 9, 900, true),
    `Crosswind cycle ${cycle + 1} enters its explicit tell`);
  advanceGameMs(CONFIG.enemyEcology.crosswind.tellMs + 1);
  updateCrosswind(crosswind, 0, -20, 40);
  player.y = -50; // keep the resource replay from exercising life-loss flow
  for (let frame = 0; frame < 40; frame++) {
    advanceGameMs(16);
    updateEnemyTacticHazards(crosswind, 0.016, -20, 40);
    updateCrosswind(crosswind, 0.016, -20, 40);
    assert.strictEqual(crosswind.tacticHazards, crosswindPool);
    for (let i = 0; i < 3; i++) assert.strictEqual(crosswind.tacticHazards[i], crosswindSlots[i]);
  }
}
passes++;
console.log('PASS Crosswind enters 32 tells and replays 1,280 active frames without hazard-array/object growth');

// Find one current-face strip wide enough for all three comb teeth.
let combCenter = 0;
for (let x = 8; x < 30; x += 0.5) {
  const sites = [0, 1, 2].map((i) => aircombTooth(i, x, 1,
    CONFIG.enemyEcology.aircomb).x);
  if (sites.every((site) => builtGroundTopAt(site) > -100)) {
    combCenter = x;
    break;
  }
}
pass(combCenter > 0, 'a current-face Aircomb corridor resolves on built terrain');
const combGround = builtGroundTopAt(combCenter);
const aircomb = spawn('mortar', combCenter + 3, combGround + CONFIG.mortar.bodyY, {
  id: 'runtime-aircomb', ecologyId: 'mortar-aircomb', gating: false,
  zone: { x: combCenter, y: combGround },
});
pass(aircomb.hp === CONFIG.mortar.hp && aircomb.maxHp === CONFIG.mortar.hp && aircomb.salvo,
  'Aircomb reuses base mortar durability and the reviewed SALVO sequencing');
const aircombPool = aircomb.tacticHazards;
const aircombSlots = [...aircombPool];
for (let cycle = 0; cycle < 24; cycle++) {
  player.x = combCenter; player.y = 2;
  aircomb.state = 'aim'; aircomb.salvoShotsRemaining = 0;
  updateAircomb(aircomb, true, -20, 40);
  assert.ok(aircomb.state === 'lob', `Aircomb cycle ${cycle + 1} owns a full launch tell`);
  advanceGameMs(CONFIG.mortar.lobMs + 1);
  updateAircomb(aircomb, true, -20, 40);
  player.y = -50;
  for (let frame = 0; frame < 36; frame++) {
    advanceGameMs(16);
    updateEnemyTacticHazards(aircomb, 0.016, -20, 40);
    updateAircomb(aircomb, true, -20, 40);
    assert.strictEqual(aircomb.tacticHazards, aircombPool);
    for (let i = 0; i < 3; i++) assert.strictEqual(aircomb.tacticHazards[i], aircombSlots[i]);
  }
  // The recipe reuses SALVO, but releases never overlap: reset after the
  // first comb solely to replay the pool contract many times.
  aircomb.state = 'aim';
}
passes++;
console.log('PASS Aircomb owns 24 full tells and replays 864 active frames without hazard-array/object growth');

const sweepGround = builtGroundTopAt(combCenter + 6);
const sweep = spawn('polyp', combCenter + 6, sweepGround + CONFIG.polyp.rootY, {
  id: 'runtime-sweepfan', ecologyId: 'polyp-sweepfan', gating: false, dir: -1,
});
pass(sweep.hp === CONFIG.polyp.hp && sweep.maxHp === CONFIG.polyp.hp,
  'Sweepfan keeps base polyp durability');
pass(sweep.tacticHazards === null, 'Sweepfan allocates no projectile/hazard pool');
player.x = -50; player.y = -50;
for (let cycle = 0; cycle < 40; cycle++) {
  sweep.state = 'fire';
  sweep.tacticDir = cycle & 1 ? -1 : 1;
  sweep.tacticStartedAt = gameMs;
  sweep.tacticUntil = sweep.stateUntil = gameMs + CONFIG.polyp.beamMs;
  for (let frame = 0; frame < 30; frame++) {
    advanceGameMs(16);
    updateSweepfan(sweep, true);
    assert.strictEqual(sweep.tacticHazards, null);
  }
}
passes++;
console.log('PASS Sweepfan replays 1,200 active frames with no per-body hazard objects');

const rebound = spawn('hound', combCenter + 2, combGround + CONFIG.hound.rideY, {
  id: 'runtime-rebound', ecologyId: 'hound-rebound', gating: false,
});
pass(rebound.hp === CONFIG.hound.hp && rebound.maxHp === CONFIG.hound.hp && !rebound.vault,
  'Rebound keeps base hound durability and cannot be replaced by VAULT');
rebound.dir = 1; rebound.state = 'charge'; rebound.tacticUses = 0;
pass(beginRebound(rebound), 'Rebound arms only after an explicit charge commitment');
pass(!beginRebound(rebound), 'Rebound permits at most one reverse vault per charge cycle');
advanceGameMs(CONFIG.enemyEcology.rebound.brakeTellMs + 1);
updateRebound(rebound, 0);
pass(rebound.state === 'reboundVault' && rebound.dir === -1,
  'Rebound leaves the brake tell on one frozen reverse arc');

/* ---------------- visual-only finale integration ---------------- */

clearHostiles();
pass(startFinale(), 'the runtime fixture starts a fresh Crown finale');
advanceGameMs(FINALE_TIMING.armingMs + 1);
updateFinale();
const finaleWarden = hostiles.find((e) => e.kind === 'warden');
const finaleSupport = hostiles.filter((e) => e.kind !== 'warden');
pass(finaleWarden?.ecologyId === '' && finaleWarden?.ecologyVisualId === '',
  'the Crown Warden remains on its dedicated production art');
same(finaleSupport.map((e) => [e.kind, e.ecologyId, e.ecologyVisualId]), [
  ['hound', '', 'hound-railfang'],
  ['wasp', '', 'wasp-diveclaw'],
  ['wasp', '', 'wasp-diveclaw'],
], 'the first real finale packet receives neutral reviewed art only');
pass(finaleSupport.every((e) => e.tactics.length === 0 &&
    e.ecologyMechanics.length === 0 && e.tacticHazards === null),
  'finale support art enables no ecology tactic, recipe mechanic or hazard allocation');

/* ---------------------- explicit worst-case budget ---------------- */

const largestGateBodies = Math.max(...CONFIG.waves.roster.map((rows) => rows.length));
const adaptiveBodies = Math.max(...CONFIG.spawner.pressure.targetMaxByFace);
const runtimeAssignments = LEVEL1_ECOLOGY_ENCOUNTERS.reduce(
  (count, encounter) => count + encounter.rows.length, 0);
const liveBeatRows = LEVEL1_ECOLOGY_ENCOUNTERS.flatMap((encounter) =>
  [...new Set(encounter.rows.map((row) => row.beat))].map((beat) =>
    encounter.rows.filter((row) => row.beat === beat)));
const budget = {
  runtimeAssignmentsNow: runtimeAssignments,
  extraBodiesAdded: 0,
  largestSimultaneousAssignedBeat: Math.max(...liveBeatRows.map((rows) => rows.length)),
  largestAssignedTacticHazards: Math.max(...liveBeatRows.map((rows) => rows.filter((row) =>
    row.ecologyId === 'wasp-crosswind' || row.ecologyId === 'mortar-aircomb').length *
      CONFIG.enemyEcology.maxHazardsPerBody)),
  hazardsPerProjectileTacticBody: CONFIG.enemyEcology.maxHazardsPerBody,
  largestExistingAuthoredGateBodies: largestGateBodies,
  theoreticalGateHazardsIfEveryBodyWereManuallyOptedIn:
    largestGateBodies * CONFIG.enemyEcology.maxHazardsPerBody,
  largestExistingAdaptiveCommittedBodies: adaptiveBodies,
  theoreticalAdaptiveHazardsIfEveryBodyWereManuallyOptedIn:
    adaptiveBodies * CONFIG.enemyEcology.maxHazardsPerBody,
};
pass(budget.runtimeAssignmentsNow === 39 && budget.extraBodiesAdded === 0,
  'all existing gate slots are assigned without adding a body');
pass(budget.largestSimultaneousAssignedBeat === 3 &&
    budget.largestAssignedTacticHazards <= 6,
  'authored ecology stays inside one readable triad and six fixed hazards');
pass(budget.hazardsPerProjectileTacticBody === 3,
  'every Crosswind/Aircomb owner has a hard three-hazard ceiling');

const source = readFileSync(new URL('../src/sim/ecology-tactics.js', import.meta.url), 'utf8');
pass(source.includes('sweepfanDirection(e.dir, e.tacticDir, u,') &&
    source.includes('CONFIG.enemyEcology.sweepfan, sweepVector)'),
  'live Sweepfan passes a stable out-object instead of allocating per fire frame');

console.log(`\n${passes} ecology runtime checks passed`);
console.log(JSON.stringify({ budget }, null, 2));
