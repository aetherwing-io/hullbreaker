#!/usr/bin/env node
/* climb-plan.mjs — the proposed three-level climb, as data, validated.
 *
 *   node tools/simlab/race/climb-plan.mjs     # prints the report, writes artifacts/t104-race/climb-plan.json
 *
 * docs/proposals/2026-10-race-to-the-top.md §5 recommends nine long sides in
 * three levels. This file states that plan in the FROZEN segment schema of
 * src/pure/track-archetypes.js (the same fields SKY_RAY and QUADRUPED use) and
 * runs the shipped validator, trackArchetypeViolations(), over it — so the
 * proposal is checked against the schema the integration will consume, not
 * merely described. It also derives the timing arithmetic the doc quotes:
 * seconds per side at the scroll floor, at the earned momentum ceiling, and at
 * RIG's run speed (the racer under a follow-lead scroll), and the render grade
 * each side's rise implies.
 *
 * This is a PROPOSAL fixture under tools/. Nothing in src/ imports it and it
 * changes nothing in the game.                                              */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const SRC = join(ROOT, 'src');
const { CONFIG } = await import('file://' + join(SRC, 'config.js'));
const TA = await import('file://' + join(SRC, 'pure', 'track-archetypes.js'));

export const SIDE_TILES = 176;   // 2 x the shipped 88-tile bay

// level, bay-B strip (the shipped vertical-assault face it reuses, or NEW)
const ROWS = [
  ['L1', 'split-rib', { id: 'leg-p1-ankle-scutes', phase: 1, bodyZone: 'ankle-scutes', turnDeg: 60, riseTiles: 28,
    surface: 'exterior', traversalDensity: 'restrained', traversalBands: 3, transitionKind: 'facet-ratchet',
    socketEcology: ['aerial-nest', 'arc-intercept', 'carrier-dare'] }],
  ['L1', 'chimney-fork', { id: 'leg-p2-shin-ribline', phase: 2, bodyZone: 'shin-ribline', turnDeg: 60, riseTiles: 30,
    surface: 'exterior', traversalDensity: 'braided', traversalBands: 4, transitionKind: 'facet-ratchet',
    socketEcology: ['ground-pursuit', 'arc-intercept', 'aerial-nest'] }],
  ['L1', 'NEW knee-gimbal', { id: 'leg-p2-knee-gimbal', phase: 2, bodyZone: 'knee-gimbal', turnDeg: 30, riseTiles: 30,
    surface: 'exterior', traversalDensity: 'dense', traversalBands: 4, transitionKind: 'joint-hub',
    socketEcology: ['joint-clamp', 'ground-pursuit', 'carrier-dare'] }],
  ['L2', 'NEW haunch-ribline', { id: 'rib-p3-haunch-ribline', phase: 3, bodyZone: 'haunch-ribline', turnDeg: 0, riseTiles: 36,
    surface: 'exterior', traversalDensity: 'braided', traversalBands: 4, transitionKind: 'access-plate',
    socketEcology: ['rooted-interlock', 'under-rib-ambush', 'carrier-dare'] }],
  ['L2', 'crossfire-cavity', { id: 'neck-p3-cervical-interior', phase: 3, bodyZone: 'cervical-interior', turnDeg: 60, riseTiles: 20,
    surface: 'interior', traversalDensity: 'dense', traversalBands: 4, transitionKind: 'facet-ratchet',
    socketEcology: ['rooted-interlock', 'under-rib-ambush', 'mortar-perch'] }],
  ['L2', 'vent-stack', { id: 'neck-p4-pressure-tract', phase: 4, bodyZone: 'pressure-tract', turnDeg: 0, riseTiles: 30,
    surface: 'interior', traversalDensity: 'dense', traversalBands: 5, transitionKind: 'dorsal-breach',
    socketEcology: ['mortar-perch', 'countermeasure-vent', 'rupture-chain'] }],
  ['L3', 'kill-braid', { id: 'spine-p5-dorsal-ridge', phase: 5, bodyZone: 'dorsal-ridge', turnDeg: 60, riseTiles: 32,
    surface: 'exterior', traversalDensity: 'assault', traversalBands: 5, transitionKind: 'collar-ratchet',
    socketEcology: ['aerial-nest', 'ground-pursuit', 'mortar-perch'] }],
  ['L3', 'NEW collar', { id: 'spine-p5-collar', phase: 5, bodyZone: 'collar', turnDeg: 60, riseTiles: 32,
    surface: 'exterior', traversalDensity: 'assault', traversalBands: 5, transitionKind: 'collar-ratchet',
    socketEcology: ['joint-clamp', 'rupture-chain', 'carrier-dare'] }],
  ['L3', 'crown-roots', { id: 'crown-p6-crown-roots', phase: 6, bodyZone: 'crown-roots', turnDeg: 0, riseTiles: 36,
    surface: 'exterior', traversalDensity: 'assault', traversalBands: 5, transitionKind: 'crown-entry',
    socketEcology: ['summit-defense', 'rooted-interlock', 'carrier-dare'] }],
];

const segments = ROWS.map(([, , s]) => Object.freeze({
  ...s, lengthTiles: SIDE_TILES, revealAhead: 0, revealBehind: 0,
  socketEcology: Object.freeze([...s.socketEcology]),
}));

export const CLIMB_PLAN = Object.freeze({
  id: 'meridian-climb-proposal',
  bodyPlan: 'Meridian (single body, three regions)',
  version: 1,
  entrySegmentId: segments[0].id,
  exitSegmentId: segments[segments.length - 1].id,
  introTiles: CONFIG.path.introTiles,
  outroTiles: CONFIG.path.outroTiles,
  turnModel: Object.freeze({ stepsPerCorner: 2, stepDeg: 30, turnSign: 1, chamferTiles: 2 }),
  paceContract: TA.PACE_CONTRACT,
  segments: Object.freeze(segments),
});

const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const runSpeed = CONFIG.player.runSpeed;
const floor = CONFIG.scrollSpeed;
const ceiling = CONFIG.scrollSpeed * CONFIG.momentum.ceilMult;

export function climbReport() {
  const violations = TA.trackArchetypeViolations(CLIMB_PLAN);
  const report = TA.trackArchetypeReport(CLIMB_PLAN);
  const sides = ROWS.map(([level, strip], i) => {
    const s = segments[i];
    const grade = s.riseTiles / s.lengthTiles;
    return {
      level, id: s.id, phase: TA.DEFENSE_PHASES[s.phase - 1], surface: s.surface,
      bayB: strip, tiles: s.lengthTiles, riseM: s.riseTiles,
      grade: r(grade, 3), pitchDeg: r(Math.atan(grade) * 180 / Math.PI, 1),
      secondsAtScrollFloor: r(s.lengthTiles / floor), secondsAtEarnedCeiling: r(s.lengthTiles / ceiling),
      secondsAtRunSpeed: r(s.lengthTiles / runSpeed), transition: s.transitionKind,
    };
  });
  const levels = ['L1', 'L2', 'L3'].map((L) => {
    const rows = sides.filter((s) => s.level === L);
    const sum = (k) => r(rows.reduce((a, s) => a + s[k], 0));
    return { level: L, sides: rows.length, tiles: sum('tiles'), riseM: sum('riseM'),
      movingSecondsAtScrollFloor: sum('secondsAtScrollFloor'),
      movingSecondsAtEarnedCeiling: sum('secondsAtEarnedCeiling'),
      movingSecondsAtRunSpeed: sum('secondsAtRunSpeed') };
  });
  return {
    tool: 'tools/simlab/race/climb-plan.mjs',
    schema: 'src/pure/track-archetypes.js TRACK_SEGMENT_FIELDS',
    violations, valid: violations.length === 0,
    totals: { segments: report.segments, tiles: report.totalLengthTiles, riseM: report.totalRiseTiles,
      netTurnDeg: report.netTurnDeg, surfaces: report.surfaces },
    shippedForComparison: {
      tiles: CONFIG.path.faces * CONFIG.path.faceTiles, sides: CONFIG.path.faces, renderRiseM: 35,
    },
    sides, levels,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const rep = climbReport();
  const out = resolve(ROOT, 'artifacts/t104-race');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'climb-plan.json'), JSON.stringify(rep, null, 1));
  console.log(JSON.stringify(rep, null, 1));
  if (!rep.valid) process.exit(1);
}
