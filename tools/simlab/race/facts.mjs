#!/usr/bin/env node
/* facts.mjs — the static arithmetic behind docs/proposals/2026-10-race-to-the-top.md.
 *
 *   node tools/simlab/race/facts.mjs            # prints JSON, writes artifacts/t104-race/facts.json
 *
 * Everything here is computed from shipped source (src/config.js,
 * src/pure/path.js, src/pure/ascent.js, src/pure/waves.js,
 * src/pure/vertical-assault.js, src/pure/level1-ecology-encounters.js,
 * src/sim/finale.js constants, src/pure/track-archetypes.js) plus the
 * analytic camera replica in ./edges.mjs. No simulation is stepped, so these
 * are properties of the authored course, not of any player.             */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, viewportEdges } from './edges.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const SRC = join(ROOT, 'src');
const imp = (rel) => import('file://' + join(SRC, rel));

const { CONFIG } = await imp('config.js');
const PATH = await imp('pure/path.js');
const ASC = await imp('pure/ascent.js');
const WAVES = await imp('pure/waves.js');
const VA = await imp('pure/vertical-assault.js');
const ECO = await imp('pure/level1-ecology-encounters.js');
const TA = await imp('pure/track-archetypes.js');
const r = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

const P = CONFIG.player;
const g = P.gravity;
const apex1 = P.jumpVel ** 2 / (2 * -g);
// air jump fired at the single-jump apex (the generous case the lattice is built around)
const apex2 = apex1 + P.airJumpVel ** 2 / (2 * -g);
const L = CONFIG.levelLength;
const corners = PATH.CORNER_S;
const altAt = (s) => ASC.normalAscentAltAt(s, L);
const faceRise = corners.map((c, i) => r(altAt(c) - altAt(i ? corners[i - 1] : CONFIG.path.introTiles)));

const views = {};
for (const [id, v] of Object.entries(VIEWPORTS)) {
  const e = viewportEdges(v.width, v.height, CONFIG, v.rigFraction);
  const visibleHeightTiles = 2 * e.depth * Math.tan((CONFIG.camera.fov / 2) * Math.PI / 180);
  const rigPx = P.height / visibleHeightTiles * v.height;
  views[id] = {
    px: `${v.width}x${v.height}`,
    estimate: !!v.estimate,
    depthMultOfBaseZ: r(e.depth / CONFIG.camera.z, 3),
    widthTiles: r(e.width), leftEdge: r(e.left), rightEdge: r(e.right),
    cameraDepth: r(e.depth, 3),
    visibleHeightTiles: r(visibleHeightTiles),
    localYBottom: r(e.bottom), localYTop: r(e.top),
    rigPxBeforeActorGain: r(rigPx, 1),
    rigScreenFraction: r(rigPx / v.height * 100, 2) + '%',
    faceTilesPerScreen: r(CONFIG.path.faceTiles / e.width, 2),
    secondsOfRunVisible: r(e.width / P.runSpeed, 2),
    secondsOfScrollVisible: r(e.width / CONFIG.scrollSpeed, 2),
  };
}

const M = CONFIG.momentum;
const facts = {
  tool: 'tools/simlab/race/facts.mjs',
  movement: {
    runSpeed: P.runSpeed, scrollFloor: CONFIG.scrollSpeed,
    scrollEarnedCeiling: r(CONFIG.scrollSpeed * M.ceilMult), scrollHardCeiling: r(CONFIG.scrollSpeed * M.hardCeilMult),
    runOverScrollFloor: r(P.runSpeed / CONFIG.scrollSpeed), bankRateAtFloor: r(P.runSpeed - CONFIG.scrollSpeed),
    singleJumpApexTiles: r(apex1), doubleJumpApexTiles: r(apex2),
  },
  path: {
    faces: CONFIG.path.faces, faceTiles: CONFIG.path.faceTiles,
    introTiles: CONFIG.path.introTiles, outroTiles: CONFIG.path.outroTiles,
    levelLength: L, corners, halts: PATH.HALT_S, bends: PATH.BEND_S,
    haltOffset: CONFIG.waves.haltOffset, gatePreludeTiles: WAVES.GATE_PRELUDE_TILES,
    gateApron: VA.VERTICAL_ASSAULT.gateApron, assaultSpans: VA.VERTICAL_ASSAULT.spans,
    secondsPerFaceAtScrollFloor: r(CONFIG.path.faceTiles / CONFIG.scrollSpeed),
    secondsPerFaceAtEarnedCeiling: r(CONFIG.path.faceTiles / (CONFIG.scrollSpeed * M.ceilMult)),
    secondsPerFaceAtRunSpeed: r(CONFIG.path.faceTiles / P.runSpeed),
  },
  ascent: {
    totalRise: ASC.NORMAL_ASCENT.totalRise, easeInTiles: ASC.NORMAL_ASCENT.easeInTiles,
    gradeAfterEase: r(ASC.normalAscentGradeAt(200, L), 4),
    pitchDeg: r(ASC.normalAscentPitchAt(200, L) * 180 / Math.PI, 2),
    risePerFace: faceRise,
    altAtCorners: corners.map((c) => r(altAt(c))),
    altAtLevelEnd: r(altAt(L)),
  },
  gates: {
    waveSizes: CONFIG.waves.roster.map((row) => row.length),
    rosterKinds: CONFIG.waves.roster,
    ecologyBeatLockMs: ECO.LEVEL1_ECOLOGY_BEAT_LOCK_MS,
    beatsPerGate: ECO.LEVEL1_ECOLOGY_ENCOUNTERS.map((f) => new Set(f.rows.map((row) => row.beat)).size),
    ritualMs: WAVES.cornerEventTotalMs(CONFIG),
    materializeMs: CONFIG.wasp.enterMs,
  },
  views,
  archetypes: Object.fromEntries(Object.entries(TA.TRACK_ARCHETYPES).map(([k, plan]) => {
    const rep = TA.trackArchetypeReport(plan);
    return [k, { segments: rep.segments, totalLengthTiles: rep.totalLengthTiles,
      totalRiseTiles: rep.totalRiseTiles, minLength: rep.minLengthTiles, maxLength: rep.maxLengthTiles,
      surfaces: rep.surfaces, violations: rep.violations.length }];
  })),
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = resolve(ROOT, 'artifacts/t104-race');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'facts.json'), JSON.stringify(facts, null, 1));
  console.log(JSON.stringify(facts, null, 1));
}
export default facts;
