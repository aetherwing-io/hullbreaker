#!/usr/bin/env node
/* Frozen, renderer-free proof for the body-plan track grammar.  This does not
 * install an archetype into generator/path/camera; it protects the data seam
 * that a later integration pass may consume. */

import assert from 'node:assert/strict';

import { CONFIG } from '../src/config.js';
import {
  CURRENT_SIX_FACE_PATH,
  DEFENSE_PHASES,
  PACE_CONTRACT,
  TRACK_ARCHETYPES,
  TRACK_SEGMENT_FIELDS,
  buildWormTrack,
  revealNeighborhood,
  trackArchetype,
  trackArchetypeReport,
  trackArchetypeViolations,
  trackSegmentRanges,
  wormCompatibilityReport,
} from '../src/pure/track-archetypes.js';

const expectedCounts = Object.freeze({
  WORM: [1, 1, 1, 1, 1, 1],
  SKY_RAY: [2, 2, 2, 1, 2, 1],
  QUADRUPED: [2, 2, 2, 1, 2, 1],
});

for (const [key, plan] of Object.entries(TRACK_ARCHETYPES)) {
  const violations = trackArchetypeViolations(plan);
  assert.deepEqual(violations, [], `${key} must satisfy route/reveal/phase invariants`);
  assert(Object.isFrozen(plan), `${key} plan is frozen`);
  assert(Object.isFrozen(plan.segments), `${key} segment array is frozen`);
  assert.strictEqual(plan.paceContract, PACE_CONTRACT, `${key} shares the 1x pace contract`);
  assert.deepEqual(
    plan.segments.map((row) => row.phase),
    expectedCounts[key].flatMap((count, index) => Array(count).fill(index + 1)),
    `${key} decouples physical segments from the ordered phase overlay as authored`,
  );

  for (const segment of plan.segments) {
    assert(Object.isFrozen(segment), `${segment.id} is frozen`);
    assert(Object.isFrozen(segment.socketEcology), `${segment.id} ecology is frozen`);
    assert.deepEqual(Object.keys(segment).sort(), [...TRACK_SEGMENT_FIELDS].sort(),
      `${segment.id} uses the exact feature-ready schema`);
    assert(!Object.hasOwn(segment, 'speed') && !Object.hasOwn(segment, 'playerSpeed'),
      `${segment.id} cannot smuggle a pace change into geometry data`);
  }

  const ranges = trackSegmentRanges(plan);
  assert.equal(ranges[0].s0, plan.introTiles, `${key} route begins after intro`);
  for (let i = 1; i < ranges.length; i++) {
    assert.equal(ranges[i].s0, ranges[i - 1].s1,
      `${key} has no route gap between ${ranges[i - 1].id} and ${ranges[i].id}`);
  }

  for (let i = 0; i < plan.segments.length; i++) {
    const visible = new Set(revealNeighborhood(plan, i));
    assert(visible.has(plan.segments[i].id), `${key} reveal includes its active segment`);
    assert(visible.size <= 3, `${key} reveal is a local neighborhood, never the whole body`);
    for (const id of visible) {
      const row = plan.segments.find((candidate) => candidate.id === id);
      assert.equal(row.phase, plan.segments[i].phase,
        `${key} reveal cannot leak the next defense phase around a corner`);
    }
  }
}

assert.strictEqual(trackArchetype('worm'), TRACK_ARCHETYPES.WORM);
assert.strictEqual(trackArchetype('sky-ray'), TRACK_ARCHETYPES.SKY_RAY);
assert.strictEqual(trackArchetype('QUADRUPED'), TRACK_ARCHETYPES.QUADRUPED);
assert.equal(trackArchetype('warehouse'), null, 'unsupported body plans fail closed');

const currentTune = Object.freeze({
  faces: CONFIG.path.faces,
  faceTiles: CONFIG.path.faceTiles,
  introTiles: CONFIG.path.introTiles,
  outroTiles: CONFIG.path.outroTiles,
  turnDeg: CONFIG.path.turnDeg,
  turnSign: CONFIG.path.turnSign,
  chamferTiles: CONFIG.path.chamferTiles,
});
assert.deepEqual(currentTune, CURRENT_SIX_FACE_PATH,
  'compatibility fixture must drift loudly if the shipped six-face constants change');

const rebuiltWormA = buildWormTrack(currentTune);
const rebuiltWormB = buildWormTrack(currentTune);
assert.equal(JSON.stringify(rebuiltWormA), JSON.stringify(rebuiltWormB),
  'WORM construction is byte-deterministic');
assert.deepEqual(rebuiltWormA, TRACK_ARCHETYPES.WORM,
  'default WORM is the exact current six-face construction');

const compatibility = wormCompatibilityReport(rebuiltWormA, currentTune);
assert.equal(compatibility.ok, true, `WORM compatibility failed: ${compatibility.failedChecks.join(', ')}`);
assert.deepEqual(compatibility.expectedCorners, [112, 200, 288, 376, 464, 552]);
assert.deepEqual(compatibility.actualCorners, compatibility.expectedCorners);
assert.deepEqual(compatibility.expectedBendStarts,
  [112, 114, 200, 202, 288, 290, 376, 378, 464, 466, 552, 554]);
assert.equal(compatibility.totalRouteTiles, 583);
assert.equal(compatibility.semanticTurnDeg, 60);
assert.equal(compatibility.circuitTurnDeg, 360);

const sky = TRACK_ARCHETYPES.SKY_RAY;
assert(sky.segments.slice(0, 6).every((row) => row.lengthTiles <= 34),
  'SKY_RAY begins with six short tail/gill chicane segments');
assert(sky.segments.slice(7).every((row) => row.lengthTiles >= 78),
  'SKY_RAY ends on long dorsal/wing straightaways');
assert(sky.segments.slice(0, 6).some((row) => row.surface === 'interior'),
  'SKY_RAY breaches into gill processors before reaching the dorsal surface');

const quadruped = TRACK_ARCHETYPES.QUADRUPED;
assert(quadruped.segments.filter((row) => row.transitionKind === 'joint-hub').length >= 3,
  'QUADRUPED contains repeated joint-hub arenas');
assert(quadruped.segments.filter((row) => row.lengthTiles >= 74).length >= 3,
  'QUADRUPED contains long limb/shell spans');
assert(quadruped.segments.some((row) => row.transitionKind === 'torso-transfer'),
  'QUADRUPED contains a torso transfer');

// Mutation fixtures prove the validator is guarding the intended seams, not
// merely blessing the three exported constants.
const badReveal = JSON.parse(JSON.stringify(TRACK_ARCHETYPES.SKY_RAY));
badReveal.segments[1].revealAhead = 1; // phase 1 would expose phase 2.
assert.match(trackArchetypeViolations(badReveal).join('\n'), /crosses defense phase/);

const badRoute = JSON.parse(JSON.stringify(TRACK_ARCHETYPES.QUADRUPED));
badRoute.segments[1].id = badRoute.segments[0].id;
badRoute.segments[2].lengthTiles = 0;
badRoute.segments[3].phase = 4;
const badRouteReport = trackArchetypeViolations(badRoute).join('\n');
assert.match(badRouteReport, /duplicated/);
assert.match(badRouteReport, /lengthTiles must be positive/);
assert.match(badRouteReport, /ordered without skips/);

const reports = Object.values(TRACK_ARCHETYPES).map(trackArchetypeReport);
assert.deepEqual(reports.map((row) => row.violations), [[], [], []]);
assert.deepEqual(reports.map((row) => row.segments), [6, 10, 10]);
assert.deepEqual(reports.map((row) => row.totalLengthTiles), [528, 456, 606]);
assert.deepEqual(reports.map((row) => row.totalRiseTiles), [0, 74, 100]);

console.log('Body-plan track archetypes: PASS');
console.log(JSON.stringify({
  phases: DEFENSE_PHASES,
  archetypes: reports.map((row) => ({
    id: row.id,
    segments: row.segments,
    phaseSegments: row.phaseSegments.map((phase) => phase.count),
    routeTiles: row.totalLengthTiles,
    riseTiles: row.totalRiseTiles,
    turnDeg: row.netTurnDeg,
    surfaces: row.surfaces,
    lengthRange: [row.minLengthTiles, row.maxLengthTiles],
  })),
  wormCompatibility: compatibility,
}, null, 2));
