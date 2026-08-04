#!/usr/bin/env node
/* Renderer-free proof for the authored Level 1 ecology score.  It rebuilds
 * the current map, resolves every spawn against a real Vertical Assault
 * socket, then primes the live gate seam to prove the pure data is what the
 * simulation actually receives. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { buildLevel } from '../src/pure/generator.js';
import {
  LEVEL1_ECOLOGY_BEAT_LOCK_MS, LEVEL1_ECOLOGY_ENCOUNTERS,
  level1EcologyEncounterDelay, level1EcologyEncounterRow,
} from '../src/pure/level1-ecology-encounters.js';
import { LEVEL1_ENEMY_ECOLOGY, resolveEnemyEcology } from '../src/pure/enemy-ecology.js';
import {
  activeGateThreatCount, waveKind, waveSize,
} from '../src/pure/waves.js';
import { setEdges } from '../src/sim/edges.js';
import {
  clearHostiles, hostileAttackReady, hostiles, hostileEcologySnapshot,
  removeHostile, spawnHostile, updateHostiles,
} from '../src/sim/hostiles.js';
import { player } from '../src/sim/player.js';
import { advanceGameMs, gameMs, setScrollX } from '../src/sim/time.js';
import {
  armGate, cornerEvents, primeGateWave, resetCornerEvents,
} from '../src/sim/wavegate.js';

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions++; }
function same(actual, expected, message) {
  assert.deepEqual(actual, expected, message); assertions++;
}

const level = buildLevel(CONFIG);
const recipeById = new Map(LEVEL1_ENEMY_ECOLOGY.map((row) => [row.id, row]));
const expectedLessons = [
  ['wasp-crosswind', 'wasp-diveclaw'],
  ['hound-railfang', 'hound-vaultjaw'],
  ['polyp-needle', 'polyp-sweepfan', 'wasp-pincer'],
  ['mortar-craterpod', 'mortar-bracketpod', 'hound-rebound'],
  ['polyp-gateweaver', 'mortar-aircomb'],
  [],
];

ok(Object.isFrozen(LEVEL1_ECOLOGY_ENCOUNTERS), 'six-face score is immutable');
same(LEVEL1_ECOLOGY_ENCOUNTERS.length, 6, 'score is Level 1 only');
same(LEVEL1_ECOLOGY_ENCOUNTERS.map((row) => row.response),
  CONFIG.waves.phases, 'score follows the six current Meridian responses');
same(LEVEL1_ECOLOGY_ENCOUNTERS.map((row) => row.rows.length),
  [4, 5, 6, 7, 8, 9], 'score reuses the existing gate body counts exactly');

const taught = new Set();
let maxVisibleBodies = 0;
let maxTacticHazards = 0;
let placementFallbacks = 0;
for (const encounter of LEVEL1_ECOLOGY_ENCOUNTERS) {
  const face = encounter.face;
  const chunk = level.assaults.find((row) => row.face === face);
  ok(chunk, `face ${face} has a current Vertical Assault chunk`);
  same(encounter.rows.length, waveSize(face, CONFIG),
    `face ${face} does not add or remove gate bodies`);
  same(encounter.rows.map((row) => row.slot),
    encounter.rows.map((_, index) => index), `face ${face} slots are contiguous`);

  const teaches = [];
  const beats = new Map();
  for (const row of encounter.rows) {
    ok(Object.isFrozen(row), `${row.id} is frozen`);
    const recipe = recipeById.get(row.ecologyId);
    same(resolveEnemyEcology(row.ecologyId, row.kind), recipe,
      `${row.id} has the reviewed kind/variant pair`);
    ok(['route', 'timing', 'elevation', 'target', 'landing'].includes(row.decision),
      `${row.id} changes a route/timing/elevation/target decision`);
    const stage = chunk.staging.find((entry) => entry.role === row.stageRole);
    ok(stage, `${row.id} resolves its authored staging socket`);
    const platform = chunk.platforms.find((entry) => entry.id === stage.platformId);
    ok(platform && platform.face === face,
      `${row.id} socket belongs to its current face and real platform`);
    ok(stage.x >= chunk.x0 && stage.x <= chunk.x1,
      `${row.id} remains inside its current-face assault strip`);
    if (row.targetStageRole) {
      const target = chunk.staging.find((entry) => entry.role === row.targetStageRole);
      ok(target && chunk.platforms.some((entry) => entry.id === target.platformId),
        `${row.id} denial target is another real current-face socket`);
      ok(target.x >= chunk.x0 && target.x <= chunk.x1,
        `${row.id} denial target cannot leak around a turn`);
    }

    if (row.mode === 'teach') {
      if (!teaches.includes(row.ecologyId)) teaches.push(row.ecologyId);
      taught.add(row.ecologyId);
    } else {
      ok(taught.has(row.ecologyId), `${row.id} is taught before recombination`);
    }
    const members = beats.get(row.beat) || [];
    members.push(row);
    beats.set(row.beat, members);
    same(level1EcologyEncounterRow(face, row.slot), row,
      `${row.id} resolves deterministically by face/slot`);
  }
  same(teaches, expectedLessons[face - 1],
    `face ${face} teaches its promised variants in order`);

  const orderedBeats = [...beats].sort((a, b) => a[0] - b[0]);
  same(orderedBeats.map(([beat]) => beat),
    orderedBeats.map((_, index) => index), `face ${face} beat indices are contiguous`);
  for (const [beat, rows] of orderedBeats) {
    maxVisibleBodies = Math.max(maxVisibleBodies, rows.length);
    const newDenials = new Set(rows.filter((row) =>
      row.mode === 'teach' && row.family === 'denial').map((row) => row.ecologyId));
    ok(newDenials.size <= 1,
      `face ${face} beat ${beat} introduces at most one landing-denial answer`);
    const projectileTactics = rows.filter((row) =>
      row.ecologyId === 'wasp-crosswind' || row.ecologyId === 'mortar-aircomb').length;
    maxTacticHazards = Math.max(maxTacticHazards,
      projectileTactics * CONFIG.enemyEcology.maxHazardsPerBody);
    if (face === 5 && beat >= 2 || face === 6) {
      same(new Set(rows.map((row) => row.family)).size, rows.length,
        `face ${face} beat ${beat} uses at most one member per family`);
    }
  }
}
same(taught.size, 12, 'all twelve archetypes are taught before Scuttle');
ok(LEVEL1_ECOLOGY_ENCOUNTERS[5].rows.every((row) => row.mode === 'recombine'),
  'Scuttle introduces no new base rule');
ok(maxVisibleBodies <= 3, 'one live ecology beat is bounded to a readable triad');
ok(maxTacticHazards <= 6, 'one live beat owns at most six fixed tactic hazards');

// Negative controls: turning the overlay off or asking for an absent/future
// slot returns null, while the old roster function remains byte-stable.
for (let face = 1; face <= 6; face++) {
  for (let slot = 0; slot < waveSize(face, CONFIG); slot++) {
    same(level1EcologyEncounterRow(face, slot, false), null,
      `face ${face} slot ${slot} is inert when ecology is disabled`);
  }
  same(level1EcologyEncounterRow(face, 99), null,
    `face ${face} absent slot fails closed`);
}
same(level1EcologyEncounterRow(7, 0), null, 'future tracks have no Level 1 runtime row');
same(CONFIG.waves.roster.map((rows, face) => rows.map((_, slot) =>
  waveKind(face + 1, slot, CONFIG))), CONFIG.waves.roster,
  'legacy wave roster data is unchanged when no overlay is applied');
same(CONFIG.spawner.pressure.emptyResponseMsByBand, [1050, 850, 650, 500],
  'adaptive pressure shortens its inhale only after observed escalation');
ok(CONFIG.spawner.pressure.hardEmptyBudgetMs >=
    CONFIG.spawner.pressure.emptyResponseMsByBand[0] &&
  CONFIG.spawner.pressure.hardEmptyBudgetMs <= 1150,
  'adaptive pressure retains one named hard empty-field ceiling');
ok(CONFIG.spawner.pressure.mercyHealthRatio > 0 &&
  CONFIG.spawner.pressure.mercyIdleMs >=
    CONFIG.spawner.pressure.emptyResponseMsByBand[0],
  'adaptive pressure mercy remains intact');

// Prelude ownership controls. A current non-gating lesson may hold only when
// a later mobile member of the SAME encounter survives; deleting every
// holder before the halt earns the existing drive-through clear.
clearHostiles();
resetCornerEvents();
const intercept = cornerEvents[1];
setScrollX(intercept.s - CONFIG.waves.haltOffset);
primeGateWave(intercept);
ok(hostiles.some((row) => row.ecologyBeat === 0 && !row.gating) &&
  hostiles.some((row) => row.gating),
  'Intercept starts on a non-gating teach body with a later mobile holder');
armGate(intercept);
same(intercept.state, 'gate',
  'a non-gating teach beat can precede a surviving same-encounter holder');
const interceptThreats = hostiles.filter((row) =>
  row.encounterKey === intercept.encounterKey && !row.gateBreakExit &&
  gameMs >= row.enterUntil - CONFIG.wasp.enterMs);
same(interceptThreats.length, 1,
  'Intercept opens with exactly one current condensation beat');
ok(interceptThreats[0].ecologyId === 'hound-railfang' && !interceptThreats[0].gating,
  'the current non-gating Railfang is still an actionable HUD threat');
same(activeGateThreatCount(
  hostiles, intercept.encounterKey, gameMs, CONFIG.wasp.enterMs,
), 1, 'gate HUD counts the current Railfang instead of future gate holders');
ok(hostiles.some((row) => row.encounterKey === intercept.encounterKey && row.gating &&
  gameMs < row.enterUntil - CONFIG.wasp.enterMs),
  'Intercept retains invisible queued gating bodies as the negative control');
same(activeGateThreatCount([
  ...hostiles,
  { encounterKey: 'ambient:control', enterUntil: gameMs, gating: true },
  { encounterKey: intercept.encounterKey, enterUntil: gameMs, gateBreakExit: true },
], intercept.encounterKey, gameMs, CONFIG.wasp.enterMs), 1,
  'gate HUD ignores unrelated ambient and retiring encounter bodies');

clearHostiles();
resetCornerEvents();
const quarantine = cornerEvents[3];
setScrollX(quarantine.s - CONFIG.waves.haltOffset);
primeGateWave(quarantine);
for (let index = hostiles.length - 1; index >= 0; index--)
  if (hostiles[index].gating) removeHostile(index, false);
ok(hostiles.length > 0 && hostiles.every((row) => !row.gating),
  'prelude control leaves only non-gating ecology denial rows');
armGate(quarantine);
same(quarantine.state, 'approach',
  'destroying every same-encounter holder in the prelude earns drive-through clear');
ok(hostiles.every((row) => row.gateBreakExit),
  'drive-through clear retires its own leftover denial rows');

// Live seam proof: every gate receives the same scored row, current-face
// stage metadata and bounded base durability. Queued beats are resident but
// cannot begin materializing before the prior beat is cleared.
setEdges(-50, 80);
resetCornerEvents();
for (const c of cornerEvents) {
  clearHostiles();
  c.primed = false;
  c.state = 'idle';
  setScrollX(c.s - CONFIG.waves.haltOffset - 1);
  ok(primeGateWave(c), `face ${c.k} ecology gate primes`);
  const rows = [...hostiles].sort((a, b) => a.ecologyBeat - b.ecologyBeat ||
    a.ecologyBeatSlot - b.ecologyBeatSlot);
  same(rows.length, waveSize(c.k, CONFIG),
    `face ${c.k} live gate allocation remains bounded`);
  const expected = LEVEL1_ECOLOGY_ENCOUNTERS[c.k - 1].rows;
  same(rows.map((row) => row.ecologyId), expected.map((row) => row.ecologyId),
    `face ${c.k} live spawn receives exact ecology IDs`);
  same(rows.map((row) => row.kind), expected.map((row) => row.kind),
    `face ${c.k} live spawn receives exact base kinds`);
  same(rows.map((row) => row.ecologyStageRole), expected.map((row) => row.stageRole),
    `face ${c.k} live spawn retains current-face socket telemetry`);
  ok(rows.every((row) => row.hp <= CONFIG[row.kind].hp && row.maxHp <= CONFIG[row.kind].hp),
    `face ${c.k} ecology never inflates HP`);
  const firstBeat = Math.min(...rows.map((row) => row.ecologyBeat));
  const firstRows = rows.filter((row) => row.ecologyBeat === firstBeat);
  ok(Math.min(...firstRows.map((row) => row.enterUntil - CONFIG.wasp.enterMs)) <= gameMs + 1 &&
    Math.max(...firstRows.map((row) => row.enterUntil - CONFIG.wasp.enterMs)) <=
      gameMs + (firstRows.length - 1) * 150 + 1,
  `face ${c.k} first teach beat begins immediately with bounded squad stagger`);
  ok(rows.filter((row) => row.ecologyBeat > firstBeat)
    .every((row) => row.enterUntil - CONFIG.wasp.enterMs >=
      gameMs + LEVEL1_ECOLOGY_BEAT_LOCK_MS - 1),
  `face ${c.k} later beats cannot overlap the clean lesson`);
  const snapshot = hostileEcologySnapshot();
  same(snapshot.bodies, rows.length, `face ${c.k} ecology telemetry sees every body`);
  placementFallbacks += snapshot.rows.filter((row) => row.placementFallback).length;
  ok(snapshot.rows.every((row) => row.stageResolved && !row.placementFallback),
    `face ${c.k} every live body resolves its current-face stage without fallback`);
  ok(snapshot.hazards <= rows.length * CONFIG.enemyEcology.maxHazardsPerBody,
    `face ${c.k} tactic hazards stay under the per-body hard ceiling`);
  for (const hound of rows.filter((row) => row.kind === 'hound')) {
    const x0 = Math.floor(hound.patrolX0), x1 = Math.floor(hound.patrolX1);
    const decks = [];
    for (let x = x0; x <= x1; x++) decks.push(level.groundH[x]);
    ok(decks.length >= 3 && decks.every((deck) => deck > -100 && deck === decks[0]),
      `face ${c.k} ${hound.ecologyId} resolves a real flat hound deck`);
  }
}

// Queued-beat negative control: even standing directly inside a later body's
// future hit circle cannot cause contact, AI state, or tactic activity before
// its condensation window begins.
clearHostiles();
resetCornerEvents();
const observe = cornerEvents[0];
setScrollX(observe.s - CONFIG.waves.haltOffset);
primeGateWave(observe);
armGate(observe);
same(observe.state, 'gate', 'Observe enters the ordinary held gate state');
const queued = hostiles.filter((row) => row.ecologyBeat > 0);
const queuedBefore = queued.map((row) => ({
  id: row.id, x: row.x, y: row.y, state: row.state, tacticState: row.tacticState,
  tacticHazardCount: row.tacticHazardCount,
}));
player.x = queued[0].x;
player.y = queued[0].y - player.h * 0.5;
player.hp = CONFIG.player.maxHealth;
player.iframesUntil = 0;
advanceGameMs(100);
updateHostiles(0.1);
ok(queued.every((row) => !hostileAttackReady(row)),
  'later queued beats cannot arm an attack before their authored unlock');
same(queued.map((row) => ({
  id: row.id, x: row.x, y: row.y, state: row.state, tacticState: row.tacticState,
  tacticHazardCount: row.tacticHazardCount,
})), queuedBefore, 'later queued beats cannot move, collide, or release hazards early');
same(player.hp, CONFIG.player.maxHealth,
  'a queued body overlapping RIG cannot deal early contact damage');

// Event-driven unlock: clearing Observe's first solo answer starts the next
// materialization on the same removal beat instead of waiting on the lock.
const firstIndex = hostiles.findIndex((row) => row.ecologyBeat === 0);
ok(firstIndex >= 0, 'Observe first solo answer is live');
removeHostile(firstIndex, false);
const second = hostiles.find((row) => row.ecologyBeat === 1);
const handoffLatencyMs = second
  ? Math.max(0, second.enterUntil - CONFIG.wasp.enterMs - gameMs) : Infinity;
ok(second && handoffLatencyMs <= 600,
  'clearing one teach beat starts visible condensation within 600 ms');
same(handoffLatencyMs, 0,
  'clearing one teach beat unlocks the next with zero hidden wait');
ok(hostiles.filter((row) => row.ecologyBeat > 1).every((row) =>
  row.enterUntil - CONFIG.wasp.enterMs >= gameMs + LEVEL1_ECOLOGY_BEAT_LOCK_MS - 1),
  'unlocking one beat leaves every later beat safely queued');

// Gate ownership is encounter-local. An unrelated gating hostile can neither
// hold this clear nor get retired as if it belonged to the ecology cohort.
clearHostiles();
resetCornerEvents();
setScrollX(observe.s - CONFIG.waves.haltOffset);
primeGateWave(observe);
armGate(observe);
spawnHostile(observe.s - 30, 8, 0, 'wasp', {
  id: 'unrelated-gating-control', encounterKey: 'ambient:control', gating: true,
});
const unrelated = hostiles.find((row) => row.encounterKey === 'ambient:control');
while (true) {
  const index = hostiles.findIndex((row) => row.encounterKey === observe.encounterKey);
  if (index < 0) break;
  removeHostile(index, false);
}
same(observe.state, 'approach',
  'gate completion ignores unrelated gating bodies outside its encounter');
ok(hostiles.includes(unrelated) && !unrelated.gateBreakExit,
  'gate clear does not retire an unrelated ambient body');

const waveSource = readFileSync(new URL('../src/sim/wavegate.js', import.meta.url), 'utf8');
ok(waveSource.includes('level1EcologyEncounterRow(k, i)') &&
  waveSource.includes('pullNextGatePresence(c);'),
  'live gate uses the opt-in score and event-driven unlock seam');

clearHostiles();
resetCornerEvents();
console.log(`Level 1 ecology encounters: ${assertions} assertions passed`);
console.log(JSON.stringify({
  faces: LEVEL1_ECOLOGY_ENCOUNTERS.map((encounter) => ({
    face: encounter.face,
    response: encounter.response,
    bodies: encounter.rows.length,
    beats: Math.max(...encounter.rows.map((row) => row.beat)) + 1,
    variants: [...new Set(encounter.rows.map((row) => row.ecologyId))],
  })),
  bounds: {
    allocatedGateBodies: Math.max(...LEVEL1_ECOLOGY_ENCOUNTERS.map((row) => row.rows.length)),
    simultaneousBodies: maxVisibleBodies,
    tacticHazards: maxTacticHazards,
    placementFallbacks,
    handoffLatencyMs,
    extraBodies: 0,
    emptyResponseMs: CONFIG.spawner.pressure.emptyResponseMs,
  },
}, null, 2));
