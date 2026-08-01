#!/usr/bin/env node
// pathcheck.mjs — HULLBREAKER pure-layer harness.
//
// Imports src/config.js and the src/pure/* modules directly (the game is now
// split into ES modules, so there is no pure block to regex out of the HTML),
// checks that the pure layer still references no three.js/DOM surface and
// imports nothing outside itself, then runs the assertion suite below with
// node. Exits non-zero on any failure.
//
// Run from the repo root:  node tools/pathcheck.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG } from '../src/config.js';
import {
  DEG, BEND_S, CORNER_S, SEGS, HALT_S, bendSList, crossesBend, polyAt, headingAt,
  yawAt, faceIndexAt,
} from '../src/pure/path.js';
import {
  waveSize, waveLane, easeOutBack, cornerTimeline, cornerEventTotalMs,
  cornerYawDeltaDeg, cornerScrollVel, zipperOffset,
} from '../src/pure/waves.js';
import {
  TRAVERSAL_FIXTURE, TRAVERSAL_PACES, TRAVERSAL_PACE_IDS, resolveTraversalPace,
  HOUND_TRIAL, houndTrialStage, POLYP_TRIAL, polypTrialStage, traversalEnemyPlan,
  traversalLedgeProbe, traversalLedgeDecision,
  traversalWallDecision, traversalSolidAllowsGrab, traversalFollowTarget,
  traversalCameraDepth, traversalPaceTargetSpeed, traversalPaceStep,
  traversalPocketAdvanceTiles, traversalChainMult, traversalFallbackTarget,
  traversalMarginCapScroll, traversalPocketEntryMargin,
} from '../src/pure/traversal.js';
import {
  polypBeamHitsRect, polypBeamReach, polypBendClampRange,
} from '../src/pure/polyp.js';
import {
  burstVelocity, clamp01 as juiceClamp01, crushWarnIntensity, flashAlpha, hash01,
  hitStopArm, hitStopEvent, hitStopMsFor, hitStopScaleAt, particleAlpha,
  particleScale, shakeAt, traumaAdd, traumaAfter, warnPulse,
} from '../src/pure/juice.js';
import { crouchStance } from '../src/pure/stance.js';
import { assistDirection, assistVerticalReach } from '../src/pure/assist.js';
import {
  TRAVERSAL_HOOK, TRAVERSAL_FLOW, traversalGroundYAt, traversalRewardBuried,
} from '../src/pure/traversal.js';
import {
  TRAVERSAL_RIBRUN, ribrunCatchBand, ribrunCatchStep, ribrunClearSpan, ribrunDecks,
  ribrunFixture, ribrunFlanges, ribrunHopSpan, ribrunJumpArc,
} from '../src/pure/ribrun.js';
import {
  hookAnchorReachableFrom, hookArcAccepts, hookHoldPoint, hookLineClear,
  hookWhipDir, hookWhipVelocity, hookZipMarch,
} from '../src/pure/hook.js';
import {
  flowAddLink, flowCompose, flowFreshState, flowGroundLifetimeMs, flowLaunchMultFor,
  flowMult, flowSpeedMult, flowStepState,
} from '../src/pure/flow.js';
import {
  RUN_FALLBACK, SCORE, SCORE_RUN, scoreNotch, scoreNotchMult, scoreFireRateMult,
  scoreChargeGain, scoreThreatGain, scoreApplyGain, scoreDrainPerSec, scoreStep,
  scoreClassification, scoreNotchGlyphs, scoreConnectorAt, scoreRoutesCompleted,
} from '../src/pure/score.js';
import {
  solidRectContains, levelSolidCell, buildLevel, buildTraversalLevel,
  buildSpawnTable, GAP,
} from '../src/pure/generator.js';
// T-009: the lattice pass is asserted through its own exports (namespace
// import so the appended section stays one self-contained block).
import * as latticeModule from '../src/pure/lattice.js';
import {
  limbBakePlan, limbFacets, limbFacetTone, limbJoints, limbOutwardReach,
  limbPlanViolations, limbSpanHasGap, limbSpansPlayBand,
} from '../src/pure/limb.js';
import {
  TRANSFORM_BEND_S, TRANSFORM_FIXTURE, TRANSFORM_FIXTURES, TRANSFORM_PATH,
  bandSlamOffset,
  buildTransformLevel,
  buildTransformPath, selectTransformFixture, transformAltAt,
  transformAtmosphereMix, transformBandHeading,
  transformBandIndexAt, transformBendSList, transformCoverAjar,
  transformEventTotalMs, transformFrontierS,
  transformGradeAt, transformHaltS,
  transformHeadingAt, transformPanelState, transformPathAt, transformScrollOffset,
  transformVapor,
  transformScrollVel, transformSeamPull, transformSealS, transformTimeline,
  transformTriggerS, transformYawAt, transformYawDeltaDeg,
} from '../src/pure/transform.js';

// The sim layer carries the same no-three.js/no-DOM guarantee as pure/ (see
// guardLayer('sim', ...) below), so it is Node-importable exactly like the
// bot-player harness relies on. A handful of collision-edge assertions drive
// the real sim loop directly below, instead of re-deriving its physics.
import { setEdges as setSimEdges } from '../src/sim/edges.js';
import { ENEMY as simEnemyTable } from '../src/sim/hostiles.js';
import {
  player as simPlayer, updatePlayer as updateSimPlayer,
  clearPlayerTraversal as clearSimTraversal,
} from '../src/sim/player.js';
import {
  keys as simKeys, bufferJumpUntil as bufferSimJump, clearJumpBuffer as clearSimJumpBuffer,
} from '../src/sim/input.js';
import {
  platforms as simPlatforms, groundH as simGroundH, isSolid as simIsSolid,
} from '../src/sim/level.js';
import {
  setScrollX as setSimScrollX, scrollX as simScrollX,
  advanceGameMs as advanceSimGameMs, hitStopRemainingMs as simHitStopRemainingMs,
  resetHitStop as resetSimHitStop, stepHitStop as stepSimHitStop,
} from '../src/sim/time.js';
import { cornerEvents as simCornerEvents } from '../src/sim/wavegate.js';

// The render-side palette module (T-010) is deliberately Node-safe — no
// three.js, DOM writes guarded — precisely so its token tables and pure
// resolvers can be asserted here. It is the ONE render module this harness
// imports; everything else render-side stays browser-only.
import {
  CLASSIC as PAL_CLASSIC, CONCEPT as PAL_CONCEPT, PAL as PAL_ACTIVE,
  PALETTE_ID as PAL_ID, atmosphereBg, resolvePaletteId,
} from '../src/render/palette.js';

/* ---------------------- layer guards (static) ------------------------ *
 * The pure layer must stay runnable with zero three.js/DOM surface and must
 * not reach into src/sim, src/render, or src/ui — that is what makes it
 * testable here. The sim layer carries the same no-renderer rule (it may use
 * src/pure, src/config.js and src/mode.js): it is what lets a Node bot
 * harness import and step the whole simulation with no browser. Comments are
 * stripped first, so prose may still name three.js or the DOM.          */
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const layerFiles = (name) =>
  readdirSync(join(srcDir, name)).filter((f) => f.endsWith('.js')).map((f) => join(srcDir, name, f));

const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/;
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\/\/[^\n'"`]*$/gm, ' ');

function guardLayer(label, files, allowed) {
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const hit = stripComments(src).match(banned);
    if (hit) {
      console.error('pathcheck: forbidden ' + label + ' reference in ' + file + ': ' + hit[0]);
      process.exit(1);
    }
    for (const m of src.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gm)) {
      if (!allowed(m[1])) {
        console.error('pathcheck: ' + label + ' module ' + file + ' imports across its layer: ' + m[1]);
        process.exit(1);
      }
    }
  }
}

guardLayer(
  'pure',
  [join(srcDir, 'config.js'), ...layerFiles('pure')],
  (spec) => spec === '../config.js' || /^\.\/[\w-]+\.js$/.test(spec),
);
guardLayer(
  'sim',
  layerFiles('sim'),
  (spec) => spec === '../config.js' || spec === '../mode.js' ||
    /^\.\/[\w-]+\.js$/.test(spec) || /^\.\.\/pure\/[\w-]+\.js$/.test(spec),
);

/* ===================== pathcheck test suite ====================== */
let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; console.error('FAIL ' + msg); }
}
function near(a, b, eps, msg) {
  ok(Math.abs(a - b) <= eps, msg + ' [got ' + a + ', want ' + b + ']');
}
function fingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const PP = CONFIG.path, WW = CONFIG.waves;

// --- level arithmetic --------------------------------------------------
ok(CONFIG.levelLength === PP.introTiles + PP.faces * PP.faceTiles + PP.outroTiles,
   'levelLength = intro + faces*faceTiles + outro');
ok(CORNER_S.join(',') === '89,154,219,284,349,414',
   'cornerS list, got ' + CORNER_S.join(','));
ok(HALT_S.join(',') === '75,140,205,270,335,400',
   'haltS = cornerS - haltOffset, got ' + HALT_S.join(','));

// --- segment table / circuit closure ----------------------------------
ok(SEGS.length === 1 + 2 * PP.faces, '2 bends per corner -> 13 segments, got ' + SEGS.length);
ok(SEGS[0].s0 === 0 && SEGS[0].x === 0 && SEGS[0].z === 0 && SEGS[0].heading === 0,
   'path starts at origin, heading 0');
near(SEGS[SEGS.length - 1].heading, 2 * Math.PI * PP.turnSign, 1e-9,
     'headings complete a 360 deg circuit');

// bend anchors agree with polyAt
for (let i = 1; i < SEGS.length; i++) {
  const p = polyAt(SEGS, SEGS[i].s0);
  near(p.x, SEGS[i].x, 1e-9, 'anchor x at segment ' + i);
  near(p.z, SEGS[i].z, 1e-9, 'anchor z at segment ' + i);
}
// continuity across every bend
for (let i = 1; i < SEGS.length; i++) {
  const a = polyAt(SEGS, SEGS[i].s0 - 1e-7);
  const c = polyAt(SEGS, SEGS[i].s0 + 1e-7);
  ok(Math.hypot(a.x - c.x, a.z - c.z) < 1e-5, 'polyAt continuous at bend ' + i);
}
// arc length: unit steps stay unit inside faces, and never stretch anywhere;
// a step straddling one 30 deg bend may shrink to at most cos(15 deg).
{
  const a = polyAt(SEGS, 40), c = polyAt(SEGS, 41);
  near(Math.hypot(a.x - c.x, a.z - c.z), 1, 1e-9, 'unit spacing inside a face');
}
{
  let bad = 0;
  const lo = Math.cos(PP.turnDeg * DEG / 2) - 1e-6;
  for (let s = 0; s < CONFIG.levelLength; s++) {
    const a = polyAt(SEGS, s), c = polyAt(SEGS, s + 1);
    const d = Math.hypot(a.x - c.x, a.z - c.z);
    if (d > 1 + 1e-9 || d < lo) { bad++; console.error('  bad step at s=' + s + ' d=' + d); }
  }
  ok(bad === 0, 'every unit step length in [cos(15deg), 1]');
}

// --- headings (sharp) --------------------------------------------------
near(headingAt(SEGS, 50), 0, 0, 'face 1 heading 0');
near(headingAt(SEGS, 89.5), 30 * DEG, 1e-12, 'chamfer diagonal heading 30 deg');
near(headingAt(SEGS, 91.5), 60 * DEG, 1e-12, 'face 2 heading 60 deg');
near(headingAt(SEGS, 300), 240 * DEG, 1e-9, 'after 4 corners heading 240 deg');
near(headingAt(SEGS, 440), 360 * DEG, 1e-9, 'outro heading 360 deg');

// --- yaw blending (dynamic entities) ----------------------------------
near(yawAt(SEGS, 88, 1), 0, 1e-12, 'yaw untouched 1 tile before first bend');
near(yawAt(SEGS, 90, 1), 30 * DEG, 1e-9, 'yaw exactly mid-corner at chamfer center');
near(yawAt(SEGS, 92, 1), 60 * DEG, 1e-9, 'yaw complete 1 tile after second bend');
near(yawAt(SEGS, 120, 1), 60 * DEG, 1e-9, 'yaw equals face heading mid-face');
near(yawAt(SEGS, 50, 0), headingAt(SEGS, 50), 0, 'blend 0 degrades to sharp heading');
{
  let prev = -1, mono = true;
  for (let s = 87; s <= 93; s += 0.05) {
    const y = yawAt(SEGS, s, PP.yawBlendTiles);
    if (y < prev - 1e-9) mono = false;
    prev = y;
  }
  ok(mono, 'yaw monotone through a corner');
}

// --- face indexing -----------------------------------------------------
ok(faceIndexAt(0, CONFIG) === 0 && faceIndexAt(23, CONFIG) === 0, 'intro is face 0');
ok(faceIndexAt(24, CONFIG) === 1 && faceIndexAt(88, CONFIG) === 1, 'face 1 spans 24..88');
ok(faceIndexAt(89, CONFIG) === 2, 'corner column belongs to the next face');
ok(faceIndexAt(413, CONFIG) === 6, 'last face column');
ok(faceIndexAt(414, CONFIG) === 7 && faceIndexAt(444, CONFIG) === 7, 'outro is face 7');

// --- corner ritual timeline -------------------------------------------
const total = cornerEventTotalMs(CONFIG);
ok(total === 1100, 'event total 1100 ms, got ' + total);
near(cornerYawDeltaDeg(0, CONFIG), 0, 1e-9, 'yawDelta 0 at t=0');
near(cornerYawDeltaDeg(-50, CONFIG), 0, 1e-9, 'yawDelta 0 before event');
near(cornerYawDeltaDeg(69.999, CONFIG), WW.windUpDeg, 0.01, 'wind-up reaches -1.5 deg');
near(cornerYawDeltaDeg(220, CONFIG), 30, 1e-9, 'snap 1 lands exactly 30 at impact frame');
near(cornerYawDeltaDeg(350, CONFIG), 30, 1e-9, 'ratchet hold flat at 30');
near(cornerYawDeltaDeg(770, CONFIG), 60, 1e-9, 'snap 2 lands exactly 60');
near(cornerYawDeltaDeg(1100, CONFIG), 60, 1e-9, 'settled at 60 at event end');
near(cornerYawDeltaDeg(99999, CONFIG), 60, 1e-9, 'clamped after event');
{
  let minY = 0;
  for (let t = 0; t <= 70; t += 0.25) minY = Math.min(minY, cornerYawDeltaDeg(t, CONFIG));
  near(minY, WW.windUpDeg, 0.05, 'wind-up dips to windUpDeg');
}
{
  let peak = 0;
  for (let t = 70; t <= 220; t += 0.25) peak = Math.max(peak, cornerYawDeltaDeg(t, CONFIG));
  ok(peak > 30.5 && peak < 32, 'snap 1: single small overshoot (~1.4 deg), peak ' + peak);
}
{
  let peak = 0;
  for (let t = 640; t <= 770; t += 0.25) peak = Math.max(peak, cornerYawDeltaDeg(t, CONFIG));
  ok(peak > 60.4 && peak < 62, 'snap 2: single small overshoot, peak ' + peak);
}
// hold intervals must be perfectly flat (clack ... clack, no wobble)
{
  let flat = true;
  for (let t = 220; t <= 640; t += 1) if (cornerYawDeltaDeg(t, CONFIG) !== 30) flat = false;
  for (let t = 770; t <= 1100; t += 1) if (cornerYawDeltaDeg(t, CONFIG) !== 60) flat = false;
  ok(flat, 'holds are dead flat');
}
// easeOutBack shape at s = backS
near(easeOutBack(0, WW.backS), 0, 1e-12, 'easeOutBack(0) = 0');
near(easeOutBack(1, WW.backS), 1, 1e-12, 'easeOutBack(1) = 1');
{
  let eMax = 0;
  for (let u = 0; u <= 1; u += 0.0005) eMax = Math.max(eMax, easeOutBack(u, WW.backS));
  ok(eMax > 1.02 && eMax < 1.06, 'easeOutBack overshoot ~5 percent, got ' + eMax);
}

// --- scroll resume -----------------------------------------------------
ok(cornerScrollVel(0, CONFIG) === 0 && cornerScrollVel(899.9, CONFIG) === 0,
   'scroll frozen until t=900');
near(cornerScrollVel(1000, CONFIG), CONFIG.scrollSpeed * 0.25, 1e-9,
     'quadratic ease at resume midpoint');
near(cornerScrollVel(1100, CONFIG), CONFIG.scrollSpeed, 1e-9, 'full speed at event end');
near(cornerScrollVel(5000, CONFIG), CONFIG.scrollSpeed, 1e-9, 'clamped to full speed after');

// --- brick zipper ------------------------------------------------------
ok(zipperOffset(219, 0, CONFIG).phase === 'hidden', 'column 0 hidden before impact frame');
near(zipperOffset(220, 0, CONFIG).dy, WW.zipDropTiles, 1e-9, 'column 0 starts 2.75 above');
near(zipperOffset(280, 0, CONFIG).dy, WW.zipDropTiles * 0.75, 1e-9,
     'gravity ease: u=0.5 -> 75 percent of drop remains');
ok(zipperOffset(235, 1, CONFIG).phase === 'hidden' && zipperOffset(236, 1, CONFIG).phase === 'drop',
   'column 1 starts exactly 16 ms later');
{
  const d = zipperOffset(220 + WW.zipDropMs + 1, 0, CONFIG);
  ok(d.phase === 'dip' && Math.abs(d.dy + WW.zipDipTiles) < 1e-9, 'one-beat dip after landing');
}
{
  const l = zipperOffset(220 + WW.zipDropMs + WW.zipDipMs + 1, 0, CONFIG);
  ok(l.phase === 'locked' && l.dy === 0, 'column locks to base after dip');
}
{
  const lastLand = WW.zipStartMs + (WW.zipCols - 1) * WW.zipPerColMs + WW.zipDropMs;
  ok(lastLand === 820 && lastLand < total,
     'last slam column lands at 820 ms, before the event ends (' + lastLand + ')');
  const T = cornerTimeline(CONFIG);
  ok(lastLand + WW.zipDipMs <= T.t5,
     'zipper fully locked (' + (lastLand + WW.zipDipMs) + ' ms) before scroll resumes (t5=' + T.t5 + ')');
}

// --- waves -------------------------------------------------------------
ok([1, 2, 3, 4, 5, 6].map(function (k) { return waveSize(k, CONFIG); }).join(',') === '4,5,6,7,8,9',
   'wave sizes 4..9');

// --- wave composition (escalation across the 6 faces) ------------------
{
  let prevMean = -1, okComp = true;
  for (let k = 1; k <= PP.faces; k++) {
    const comp = WW.comp[k - 1];
    if (comp.length !== waveSize(k, CONFIG)) { okComp = false; console.error('  comp length wave ' + k); }
    let sum = 0, hasLow = false;
    for (const c of comp) {
      if (!(c >= 0 && c < WW.laneHeights.length)) okComp = false;
      if (c === 0) hasLow = true;
      sum += c;
    }
    if (!hasLow) { okComp = false; console.error('  wave ' + k + ' has no low-lane slot'); }
    if (k >= 3 && comp.indexOf(2) < 0) { okComp = false; console.error('  wave ' + k + ' lacks a high slot'); }
    const mean = sum / comp.length;
    if (mean < prevMean - 1e-9) { okComp = false; console.error('  altitude mix regresses at wave ' + k); }
    prevMean = mean;
  }
  ok(okComp, 'wave comp: sizes match waveSize, lanes valid, altitude mix escalates');
}
ok(waveLane(1, 0, CONFIG) === WW.laneHeights[WW.comp[0][0]] &&
   waveLane(6, 8, CONFIG) === WW.laneHeights[WW.comp[5][8]] &&
   waveLane(2, 7, CONFIG) === WW.laneHeights[WW.comp[1][7 % 5]],
   'waveLane maps comp slots to lane heights (wrapping)');

// --- retune constants --------------------------------------------------
const PL = CONFIG.player, CC = CONFIG.camera, GG = CONFIG.gen, SP = CONFIG.spawner;
ok(CONFIG.scrollSpeed === 4.3 && PL.runSpeed === 9.4 && PL.accelGround === 120 && PL.accelAir === 76,
   'stage-2 motion retune (4.3 / 9.4 / 120 / 76)');
ok(PL.jumpVel === 14 && PL.gravity === -36 && PL.fallGravityMult === 1.5 && PL.terminalVel === -32 &&
   PL.jumpCutMult === 0.45 && PL.airJumps === 1 && PL.airJumpVel === 13,
   'jump tune frozen');
const apex1 = PL.jumpVel * PL.jumpVel / (2 * -PL.gravity);
const apex2 = PL.airJumpVel * PL.airJumpVel / (2 * -PL.gravity);
ok(apex1 > 2.2 && apex1 < 3, 'single jump clears +2 lanes, not +3 (apex ' + apex1 + ')');
ok(apex1 + apex2 > 3.4, 'double jump clears +3 lanes (apex ' + (apex1 + apex2) + ')');
{
  const tUp = PL.jumpVel / -PL.gravity;
  const tDown = Math.sqrt(2 * apex1 / (-PL.gravity * PL.fallGravityMult));
  ok((tUp + tDown) * PL.runSpeed > CONFIG.gen.gapMax + 1.5,
     'full jump at run speed clears the widest gap with margin');
}
ok(CC.fov === 56 && CC.x === 5.0 && CC.y === 6.2 && CC.z === 22.5 && CC.lookX === 7.4 && CC.lookY === 4.8,
   'camera pull-back pose');
{
  const halfH = CC.z * Math.tan(CC.fov / 2 * DEG);
  ok(PL.height / (2 * halfH) < 0.09, 'player under 9 percent of screen height');
  const frac = CONFIG.scrollSpeed / (2 * halfH * 16 / 9);
  ok(frac > 0.10 && frac < 0.125, 'scroll crosses ~10-12 percent of screen width per second, got ' + frac);
}
ok(CONFIG.fog.near === 30 && CONFIG.fog.far === 74, 'fog pushed out with the camera');
ok(CONFIG.rifle.radius === 0.16, 'tracer readability radius');
ok(CONFIG.wasp.visualRadius === 0.5 && CONFIG.wasp.contactRadius === 0.55 &&
   CONFIG.wasp.visualRadius < CONFIG.wasp.contactRadius,
   'wasp visual bump stays inside its hitbox');

// --- pattern-chunk generator ------------------------------------------
const LVL = buildLevel(CONFIG);
const gH = LVL.groundH, plats = LVL.platforms;
ok(gH.length === CONFIG.levelLength, 'groundH spans the level');
{
  let bad = 0;
  for (let i = 0; i < gH.length; i++) {
    const g = gH[i];
    if (typeof g !== 'number') { bad++; continue; }
    if (g > -100 && (g < GG.minH || g > GG.maxH)) bad++;
  }
  ok(bad === 0, 'every column defined; solid heights within [minH, maxH]');
}
{
  let flat = true;
  for (let i = 0; i < PP.introTiles; i++) if (gH[i] !== 3) flat = false;
  for (let i = CONFIG.levelLength - GG.tailFlat; i < CONFIG.levelLength; i++) if (gH[i] !== 3) flat = false;
  ok(flat, 'intro and outro tail flat at h=3');
}
{
  let bad = 0;
  for (let i = 1; i < gH.length; i++)
    if (gH[i] > -100 && gH[i - 1] > -100 && Math.abs(gH[i] - gH[i - 1]) > 2) bad++;
  ok(bad === 0, 'adjacent solid steps <= 2');
}
{
  let badRun = 0, badLand = 0, badDelta = 0, gapCols = 0;
  let i = 0;
  while (i < gH.length) {
    if (gH[i] > -100) { i++; continue; }
    const start = i;
    while (i < gH.length && gH[i] < -100) i++;
    const run = i - start;
    gapCols += run;
    if (run > GG.gapMax) badRun++;
    if (start === 0 || i >= gH.length) { badLand++; continue; }
    let solid = 0;
    while (i + solid < gH.length && gH[i + solid] > -100) solid++;
    if (solid < GG.landingMin) badLand++;
    if (Math.abs(gH[start - 1] - gH[i]) > 1) badDelta++;
  }
  ok(badRun === 0, 'gap runs <= gapMax');
  ok(badLand === 0, 'every gap has >= landingMin solid columns after it');
  ok(badDelta === 0, 'height change across each gap <= 1');
  ok(gapCols >= 10, 'terrain actually has gaps, got ' + gapCols + ' gap columns');
}
{
  const kinds = new Set(LVL.chunkLog);
  ok(kinds.size >= 6, 'chunk variety: ' + kinds.size + ' of 8 kinds used');
  ok(gH.includes(GG.minH) && gH.includes(GG.maxH), 'height band fully used (2 and 4 both appear)');
}
{
  let clean = true;
  for (const cs of CORNER_S) {
    for (let s = cs - 5; s <= cs + 2; s++) if (gH[s] !== 3) clean = false;
    for (const p of plats) if (p.x1 >= cs - 3 && p.x0 <= cs + 3) clean = false;
  }
  ok(clean, 'corner aprons flat and platform-free');
}
{
  ok(plats.length >= 20, 'catwalk lanes generated, got ' + plats.length);
  let badY = 0, unreachable = 0;
  for (const p of plats) {
    if (p.y > GG.laneCapY) badY++;
    let best = -999;
    for (let k = Math.max(0, p.x0 - 1); k <= Math.min(gH.length - 1, p.x1 + 1); k++)
      if (gH[k] > -100) best = Math.max(best, gH[k]);
    for (const q of plats)
      if (q !== p && q.y < p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1) best = Math.max(best, q.y);
    if (p.y - best > GG.maxReach) { unreachable++; console.error('  unreachable catwalk ' + JSON.stringify(p)); }
  }
  ok(badY === 0, 'catwalks capped at laneCapY');
  ok(unreachable === 0, 'every catwalk within double-jump reach');
}

// --- authored traversal slice ------------------------------------------
// Re-pinned by T-009 (six-face integration): the lattice pass now carves one
// dare pocket per face and repairs route density (src/pure/lattice.js), so the
// shipped six-face geometry deliberately moved — 49 -> 62 catwalks, and the
// build result gained its `pockets` / `lattice` report. The chunk stream itself
// is untouched (59 chunks, same seed, same rng draws): the lattice consumes no
// randomness. Both values below are regression pins, not targets — if a change
// moves them again it has to be as deliberate as this one was.
ok(gH.length === 445 && plats.length === 62 && LVL.chunkLog.length === 59,
   'normal generator shape pinned (445 columns / 62 platforms / 59 chunks), got ' +
   gH.length + '/' + plats.length + '/' + LVL.chunkLog.length);
ok(fingerprint(LVL) === 'dad96774',
   'normal generator fingerprint unchanged, got ' + fingerprint(LVL));

const fixtureBefore = JSON.stringify(TRAVERSAL_FIXTURE);
const configBefore = JSON.stringify(CONFIG);
const TL = buildTraversalLevel(CONFIG);
const TL2 = buildTraversalLevel(CONFIG);
ok(JSON.stringify(TL) === JSON.stringify(TL2),
   'traversal fixture builds deterministically');
ok(JSON.stringify(TRAVERSAL_FIXTURE) === fixtureBefore && JSON.stringify(CONFIG) === configBefore,
   'traversal build does not mutate fixture metadata or CONFIG');
ok(TL !== TL2 && TL.groundH !== TL2.groundH && TL.platforms !== TL2.platforms &&
   TL.solidRects !== TL2.solidRects &&
   TL.solidRects.every(function (r, i) { return r !== TL2.solidRects[i]; }),
   'traversal builds return fresh geometry arrays and solid objects');

const TF = TRAVERSAL_FIXTURE;
const TP = { ...PL, ...TF.movement };
const B = TF.bounds;
ok(Number.isInteger(B.x0) && Number.isInteger(B.x1) &&
   B.x0 >= 0 && B.x0 < B.x1 && B.x1 <= CONFIG.levelLength,
   'fixture bounds are a valid half-open level interval');
ok(TL.groundH.length === CONFIG.levelLength &&
   TL.groundH.every(function (h) { return Number.isFinite(h); }),
   'traversal ground spans the level with finite numeric heights');

{
  let valid = true;
  const covered = new Set();
  for (const run of TF.groundRuns) {
    if (!Number.isInteger(run.x0) || !Number.isInteger(run.x1) ||
        !Number.isFinite(run.y) || run.x0 < B.x0 || run.x1 > B.x1 ||
        run.x0 >= run.x1) valid = false;
    for (let x = run.x0; x < run.x1; x++) {
      if (covered.has(x) || TL.groundH[x] !== run.y) valid = false;
      covered.add(x);
    }
  }
  ok(valid && covered.size === B.x1 - B.x0,
     'authored ground runs cover fixture bounds once and match built heights');
}
{
  const ids = new Set();
  let valid = true;
  for (const p of TF.platforms) {
    if (typeof p.id !== 'string' || ids.has(p.id) ||
        !Number.isFinite(p.x0) || !Number.isFinite(p.x1) || !Number.isFinite(p.y) ||
        p.x0 < B.x0 || p.x1 > B.x1 || p.x0 >= p.x1) valid = false;
    ids.add(p.id);
  }
  ok(valid && ids.size === TF.platforms.length,
     'authored platforms have unique ids and finite in-bounds spans');
}
{
  const ids = new Set();
  let valid = true, halfOpen = true, built = true;
  for (const r of TF.solidRects) {
    if (typeof r.id !== 'string' || ids.has(r.id) ||
        ![r.x0, r.x1, r.y0, r.y1].every(Number.isInteger) ||
        r.x0 < B.x0 || r.x1 > B.x1 || r.x0 >= r.x1 || r.y0 >= r.y1 ||
        (r.grabbable !== undefined && typeof r.grabbable !== 'boolean')) valid = false;
    ids.add(r.id);
    if (!solidRectContains(r, r.x0, r.y0) ||
        !solidRectContains(r, r.x1 - 1, r.y1 - 1) ||
        solidRectContains(r, r.x1, r.y0) ||
        solidRectContains(r, r.x0, r.y1) ||
        solidRectContains(r, r.x0 - 1, r.y0)) halfOpen = false;
    if (!levelSolidCell(TL, r.x0, r.y0, 8)) built = false;
  }
  ok(valid && ids.size === TF.solidRects.length,
     'authored solid rectangles have unique ids and integer in-bounds extents');
  ok(halfOpen, 'solid rectangle membership is half-open on x and y');
  ok(built, 'level solid predicate includes every authored solid rectangle');
}
{
  const deadEnd = TF.solidRects.find(function (r) { return r.id === 'dare-dead-end'; });
  ok(!!deadEnd &&
     !traversalSolidAllowsGrab(TF, deadEnd.x0, deadEnd.y0, PL.height) &&
     traversalSolidAllowsGrab(TF, 39, 5, PL.height) &&
     traversalSolidAllowsGrab(null, deadEnd.x0, deadEnd.y0, PL.height),
     'dare dead-end rejects hidden wall adhesion without changing other walls or normal mode');
}
{
  const overhangs = TF.solidRects.filter(function (r) { return r.role === 'overhang'; });
  const o = overhangs[0];
  const x = o && Math.floor((o.x0 + o.x1) / 2);
  ok(overhangs.length === 1, 'fixture declares exactly one tagged overhang');
  ok(!!o && levelSolidCell(TL, x, o.y0, 8) &&
     !levelSolidCell(TL, x, o.y0 - 1, 8) &&
     !levelSolidCell(TL, x, o.y1, 8),
     'overhang is solid while its underside and space above stay open');
  ok(!!o && o.y0 - TL.groundH[x] > PL.height + 0.5,
     'overhang leaves player-height clearance below it');
}
{
  const x = B.x0, ground = TL.groundH[x];
  ok(levelSolidCell(TL, x, ground - 1, 8) && !levelSolidCell(TL, x, ground, 8),
     'level solid predicate preserves half-open ground-top collision');
}

const connectorById = new Map();
let connectorIntegrity = true;
for (const c of TF.connectors) {
  if (typeof c.id !== 'string' || connectorById.has(c.id) ||
      !Number.isFinite(c.x) || !Number.isFinite(c.y) ||
      c.x < B.x0 || c.x >= B.x1 ||
      levelSolidCell(TL, Math.floor(c.x), Math.floor(c.y), 8)) connectorIntegrity = false;
  connectorById.set(c.id, c);
}
ok(connectorIntegrity && connectorById.size === TF.connectors.length &&
   connectorById.has(TF.entry) && connectorById.has(TF.exit),
   'connectors are unique, finite, in bounds, open, and include entry/exit');

const routeById = new Map(TF.routes.map(function (r) { return [r.id, r]; }));
let edgeIntegrity = true;
for (const e of TF.edges) {
  if (!routeById.has(e.routeId) || !connectorById.has(e.from) ||
      !connectorById.has(e.to) || e.from === e.to ||
      typeof e.verb !== 'string' || e.verb.length === 0) edgeIntegrity = false;
}
ok(edgeIntegrity, 'every traversal edge names a route, two connectors, and a verb');
ok(TF.routes.length === 6 && routeById.size === 6,
   'fixture declares six uniquely named traversal routes');

{
  let valid = true;
  const used = new Set();
  for (const route of TF.routes) {
    const ids = route.connectorIds;
    if (!Array.isArray(ids) || ids.length < 2 ||
        ids[0] !== TF.entry || ids[ids.length - 1] !== TF.exit) valid = false;
    for (let i = 1; i < ids.length; i++) {
      const found = TF.edges.some(function (e) {
        return e.routeId === route.id && e.from === ids[i - 1] && e.to === ids[i];
      });
      if (!found) valid = false;
      used.add(route.id + '|' + ids[i - 1] + '|' + ids[i]);
    }
  }
  const allUsed = TF.edges.every(function (e) {
    return used.has(e.routeId + '|' + e.from + '|' + e.to);
  });
  ok(valid, 'all six route sequences travel entry to rejoin on consecutive declared edges');
  ok(allUsed, 'every declared traversal edge participates in its route sequence');
}
{
  const outgoing = new Map(), incoming = new Map();
  for (const e of TF.edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, new Set());
    if (!incoming.has(e.to)) incoming.set(e.to, new Set());
    outgoing.get(e.from).add(e.to);
    incoming.get(e.to).add(e.from);
  }
  let maxChoices = 0;
  for (const choices of outgoing.values()) maxChoices = Math.max(maxChoices, choices.size);
  const fork = TF.firstFork;
  ok(maxChoices >= 2 && maxChoices <= TF.immediateChoiceCap &&
     TF.immediateChoiceCap === 3,
     'graph splits without exceeding the three-choice readability cap');
  ok(fork.connector === TF.entry && fork.choices.length >= 2 &&
     fork.choices.length <= TF.immediateChoiceCap &&
     fork.choices.every(function (id) { return connectorById.has(id); }),
     'declared first fork offers valid bounded route choices');
  ok((incoming.get(TF.exit) || new Set()).size >= 2 &&
     TF.routes.every(function (r) { return r.connectorIds[r.connectorIds.length - 1] === TF.exit; }),
     'alternate routes reconnect through a shared exit');
  const elevations = new Set(TF.connectors.map(function (c) {
    return Math.round(c.y * 100) / 100;
  }));
  ok(elevations.size >= 5, 'connector graph uses at least five distinct elevations');
}
{
  const verbs = new Set(TF.edges.map(function (e) { return e.verb; }));
  ok(Array.from(verbs).some(function (v) { return v.indexOf('ledge') >= 0 || v.indexOf('catch') >= 0; }) &&
     Array.from(verbs).some(function (v) { return v.indexOf('wall') >= 0; }),
     'route graph exercises both ledge-catch and wall-jump verbs');
}

{
  const D = TF.darePocket;
  const dareRoute = routeById.get('dare-pocket');
  const rewardRoutes = TF.routes.filter(function (r) {
    return r.connectorIds.indexOf(D.rewardConnector) >= 0;
  });
  ok(!!dareRoute && rewardRoutes.length === 1 && rewardRoutes[0].id === dareRoute.id &&
     TF.routes.some(function (r) { return r.connectorIds.indexOf(D.rewardConnector) < 0; }),
     'dare reward is optional and confined to its named route');
  let retreatValid = D.retreatPath[0] === D.rewardConnector &&
    D.retreatPath[D.retreatPath.length - 1] === D.rejoin;
  for (let i = 1; i < D.retreatPath.length; i++) {
    if (!TF.edges.some(function (e) {
      return e.routeId === dareRoute.id &&
        e.from === D.retreatPath[i - 1] && e.to === D.retreatPath[i];
    })) retreatValid = false;
  }
  ok(retreatValid, 'dare reward has a directed retreat path back to the declared rejoin');

  const nominalSeconds = (TF.rejoin.x0 - TF.run.playerSpawn.x) / TP.runSpeed;
  ok(Number.isFinite(nominalSeconds) &&
     nominalSeconds >= TF.targetPlaySeconds.min &&
     nominalSeconds <= TF.targetPlaySeconds.max,
     'slice uninterrupted sprint stays in the fast target range, got ' + nominalSeconds.toFixed(2) + ' s');
  const retreatAdvance = D.timing.retreatSeconds * TF.run.minimumScrollSpeed;
  const retreatDistance = D.reward.x - D.bounds.x0;
  ok(TF.run.minimumScrollSpeed > 0 &&
     TF.run.minimumScrollSpeed < TP.runSpeed &&
     D.timing.entryEdgeMarginTiles - retreatDistance - retreatAdvance + 1e-9 >=
       D.timing.minExitMarginTiles &&
     D.timing.minExitMarginTiles > PL.width + 2 * CONFIG.edges.margin,
     'dare entry margin covers backtrack plus scroll advance and preserves the exit margin');
}
{
  const run = TF.run;
  const playerRight0 = run.playerSpawn.x + PL.width / 2;
  const followStart = run.startScroll + run.followLeadTiles;
  const slack = followStart - playerRight0;
  const timeToFollow = slack / (TP.runSpeed - run.minimumScrollSpeed);
  const nearestForkX = Math.min.apply(null, TF.firstFork.choices.map(function (id) {
    return connectorById.get(id).x;
  }));
  ok(Number.isFinite(timeToFollow) && timeToFollow >= 0.5,
     'opening sprint stays unpinned for at least half a second, got ' + timeToFollow.toFixed(2) + ' s');
  ok(followStart >= nearestForkX + PL.width / 2,
     'camera-follow threshold reaches the first authored route choice');
  ok(traversalFollowTarget(run.startScroll, playerRight0, 100, run) === run.startScroll &&
     traversalFollowTarget(run.startScroll, followStart + 2, 100, run) === run.startScroll + 2 &&
     traversalFollowTarget(run.startScroll, followStart + 2, 10, run) === followStart - 8,
     'camera follow is idle inside its lead and tracks beyond authored or narrow-screen leads');
  ok(TP.wallJumpX * 0.05 < run.lookAheadTiles,
     'camera look-ahead exceeds the largest one-frame contextual launch');
  const portraitAspect = 390 / 844;
  const portraitDepth = traversalCameraDepth(CC.z, portraitAspect, run);
  const portraitWidth = 2 * portraitDepth * Math.tan(CC.fov / 2 * DEG) * portraitAspect;
  ok(traversalCameraDepth(CC.z, 16 / 9, run) === CC.z &&
     portraitDepth > CC.z &&
     portraitDepth <= CC.z * 2 &&
     portraitWidth >= TF.darePocket.timing.entryEdgeMarginTiles + run.lookAheadTiles,
     'portrait pullback preserves retreat room and preview without shrinking play below half scale');
}

/* ===================== view-scale experiment (viewscale lane) =========== *
 * ?view=near|mid|far (CONFIG.viewScales) pulls the camera straight back
 * along its depth axis only, in src/render/camera.js's activeCameraDepth():
 * whatever depth the slice/portrait math above already produced gets
 * multiplied by viewScales[id].depthMult. That function needs three.js
 * (unproject) to calibrate the real screen edges, so it can't run in this
 * pure harness — but the RIG screen-height fraction it targets is
 * closed-form: reproduce syncCamera's geometry for a straight face (yaw 0,
 * so fx=1,fz=0,rx=0,rz=1 — the same identity the portrait check above
 * leans on) and solve the same 2·depth·tan(vFov/2) screen-height-at-depth
 * the render loop uses. Browser-side confirmation (real calibrated edges,
 * actual rendered RIG height in pixels) lives in the headless selftest and
 * playtest screenshot evidence — see the viewscale agent's report.        */
{
  const VS = CONFIG.viewScales;
  const ids = Object.keys(VS);
  ok(ids.length >= 3 && VS.near && VS.mid && VS.far && VS.near.id === 'near' &&
     ids.every(function (id) { return VS[id].id === id && typeof VS[id].label === 'string'; }),
     'at least three named views declared (near/mid/far present), ids self-consistent');
  ok(VS.near.depthMult === 1,
     '`near` is depthMult 1 exactly: ?view=near reproduces the pre-view-scale camera (default is far per operator verdict)');
  ok(ids.every(function (id) { return Number.isFinite(VS[id].depthMult) && VS[id].depthMult >= 1; }) &&
     VS.near.depthMult < VS.mid.depthMult && VS.mid.depthMult < VS.far.depthMult,
     'every view only pulls the camera back (never in), strictly increasing near < mid < far');

  // RIG screen-height fraction at a given total camera depth: same geometry
  // as syncCamera for a straight face, measured at the fixture's own spawn
  // height so it matches what a screenshot at boot actually shows.
  function rigFraction(depth) {
    const P = { x: CC.x, y: CC.y, z: depth };
    const T = { x: CC.lookX, y: CC.lookY, z: 0 };
    const D = { x: T.x - P.x, y: T.y - P.y, z: T.z - P.z };
    const dlen = Math.sqrt(D.x * D.x + D.y * D.y + D.z * D.z);
    const dir = { x: D.x / dlen, y: D.y / dlen, z: D.z / dlen };
    const footY = TF.run.playerSpawn.y;
    const Q = { x: CC.lookX, y: footY + PL.height / 2, z: 0 };
    const QP = { x: Q.x - P.x, y: Q.y - P.y, z: Q.z - P.z };
    const viewDepth = QP.x * dir.x + QP.y * dir.y + QP.z * dir.z;
    const screenHeightWorld = 2 * viewDepth * Math.tan(CC.fov / 2 * DEG);
    return PL.height / screenHeightWorld;
  }

  const fNear = rigFraction(CC.z * VS.near.depthMult);
  const fMid = rigFraction(CC.z * VS.mid.depthMult);
  const fFar = rigFraction(CC.z * VS.far.depthMult);
  ok(Math.abs(fNear - 0.07) < 0.01,
     'near matches the concept-art invariant (docs/concept-art/README.md: RIG ~7% of screen height), got ' +
       (fNear * 100).toFixed(2) + '%');
  ok(fMid < fNear && fFar < fMid,
     'each further view shrinks RIG strictly more than the last, got ' +
       [fNear, fMid, fFar].map(function (f) { return (f * 100).toFixed(2) + '%'; }).join(' > '));
  ok(Math.abs(fMid - 0.05) < 0.005 && Math.abs(fFar - 0.037) < 0.005,
     'mid/far land near the operator-requested ~5% / ~3.5-4% targets, got ' +
       (fMid * 100).toFixed(2) + '% / ' + (fFar * 100).toFixed(2) + '%');
}

{
  const apex = TP.jumpVel * TP.jumpVel / (2 * -TP.gravity);
  const tUp = TP.jumpVel / -TP.gravity;
  const tDown = Math.sqrt(2 * apex / (-TP.gravity * TP.fallGravityMult));
  ok(TP.runSpeed > PL.runSpeed && TP.accelGround > PL.accelGround &&
     TP.jumpVel > PL.jumpVel && TP.jumpCutMult > PL.jumpCutMult,
     'slice tune is intentionally faster and gives short jump taps more authority');
  ok(apex >= 3 && apex <= 3.5 && tUp >= 0.3 && tUp <= 0.45 && tUp + tDown < 0.8,
     'slice jump is higher but remains quick, apex ' + apex.toFixed(2) + ' in ' + (tUp + tDown).toFixed(2) + ' s');
  ok(TP.ledgeLaunchY >= TP.jumpVel * 0.9 &&
     TP.wallJumpY >= TP.jumpVel * 0.9 &&
     TP.ledgeLaunchX >= TP.runSpeed * 0.8 &&
     TP.wallJumpX >= TP.runSpeed * 1.1,
     'contextual launches match the stronger jump and preserve forward authority');
  ok(TP.ledgeHangMs <= 300 && TP.wallSlideMs <= 400 &&
     TP.traversalLaunchControlMs >= 80 && TP.traversalLaunchControlMs <= 150 &&
     TP.traversalRecatchMs >= 120 && TP.traversalRecatchMs <= 250,
     'grab dwell, launch control, and recatch windows stay inside responsive budgets');
}

/* --- houndframe: telegraph fairness vs. player reaction physics --------
 * The hound is only legitimate if the tell is a real reaction window and the
 * movement answer physically fits inside it. These assertions tie the enemy's
 * constants to the *player's* jump constants for the frozen six-face tune AND
 * for every pace's movement overlay, so neither a hound retune nor a pacing
 * retune can silently make the charge unfair — it fails here instead.
 *
 * Two closing speeds matter per pace, because surge amplifies launches:
 *   sustained — the ground drive times the pace's chain ceiling. The charge
 *               must beat this, or retreat becomes a valid answer and the
 *               enemy stops being a movement problem.
 *   burst     — the strongest contact launch times that same ceiling. The
 *               telegraph must stay visible for at least twice the reaction
 *               cost even when the player arrives on a chained wall launch.
 * A chained burst CAN transiently exceed the charge speed (surge peaks at
 * 15.93 vs 15.5) and that is deliberate: outrunning a hound with a live launch
 * chain is exactly surge's thesis and one of DESIGN's listed answers. What may
 * never happen is a charge landing before the tell was legible.           */
function riseTimeTo(T, h) {              // seconds from a grounded jump to feet height h
  const g = -T.gravity;
  const disc = T.jumpVel * T.jumpVel - 2 * g * h;
  return disc < 0 ? Infinity : (T.jumpVel - Math.sqrt(disc)) / g;
}
function airTimeAbove(T, h) {            // seconds the feet stay above h on a full jump
  const g = -T.gravity;
  const apex = T.jumpVel * T.jumpVel / (2 * g);
  if (apex <= h) return 0;
  return (T.jumpVel / g - riseTimeTo(T, h)) +
    Math.sqrt(2 * (apex - h) / (g * T.fallGravityMult));
}
{
  const HD = CONFIG.hound;
  const clearance = HD.rideY + HD.hitRadius;      // feet height that clears its hit circle
  const tellSec = HD.tellMs / 1000;
  // buffered-input latency: a jump pressed anywhere in the buffer window plus
  // one slow (30 fps) frame before it is serviced
  const latency = (PL.jumpBufferMs + 1000 / 30) / 1000;
  const contactGap = HD.hitRadius + PL.width / 2;
  // one row per player tune the hound can ever meet: the frozen six-face tune,
  // then every pace's resolved movement overlay with its own chain ceiling
  const HOUND_TUNES = [['normal tune', PL, null]].concat(
    TRAVERSAL_PACE_IDS.map(function (id) {
      const F = resolveTraversalPace(id);
      return ['pace ' + id, { ...PL, ...F.movement }, F.chain];
    })
  );
  let tightestVisible = Infinity, tightestTune = '';
  for (const [label, T, chain] of HOUND_TUNES) {
    const chainMult = chain ? traversalChainMult(chain.max, chain) : 1;
    const sustained = T.runSpeed * chainMult;
    const burst = Math.max(T.runSpeed, T.ledgeLaunchX, T.wallJumpX) * chainMult;
    const cost = riseTimeTo(T, clearance) + latency;
    ok(Number.isFinite(cost) && tellSec >= 2 * cost,
       'hound telegraph is at least twice the reaction cost of jumping clear (' + label +
       ': tell ' + tellSec.toFixed(3) + ' s vs ' + cost.toFixed(3) + ' s)');
    // The telegraph has to stay legible for that same window even at the pace's
    // fastest possible approach — the hound is planted through its whole tell,
    // so this is (sense range − contact gap) / burst closing speed.
    const visible = (HD.senseRange - contactGap) / burst;
    ok(visible >= 2 * cost,
       'telegraph stays visible for twice the reaction cost at the fastest ' +
       'approach this pace allows (' + label + ': ' + visible.toFixed(3) + ' s vs ' +
       cost.toFixed(3) + ' s, burst ' + burst.toFixed(2) + ' t/s)');
    if (visible / cost < tightestVisible) { tightestVisible = visible / cost; tightestTune = label; }
    // once airborne the player must stay clear for longer than the charge
    // needs to sweep past their body — a dodge cannot be undone by landing
    const sweepWindow = 2 * (HD.hitRadius + T.width / 2) / HD.chargeSpeed;
    ok(airTimeAbove(T, clearance) > 3 * sweepWindow,
       'a full jump outlasts the charge sweep by 3x (' + label + ': air ' +
       airTimeAbove(T, clearance).toFixed(3) + ' s vs sweep ' + sweepWindow.toFixed(3) + ' s)');
    // sustained sprint: the tell still fires ahead of the player, and the
    // charge still beats the ground drive so retreat is never the answer
    ok(sustained * tellSec + contactGap < HD.senseRange,
       'telegraph fires ahead of a sustained sprint (' + label + ': ' +
       (sustained * tellSec + contactGap).toFixed(2) + ' < ' + HD.senseRange + ')');
    ok(HD.chargeSpeed > sustained,
       'charge outruns the sustained drive: retreat is not an answer (' + label +
       ': ' + HD.chargeSpeed + ' vs ' + sustained.toFixed(2) + ')');
    ok(HD.prowlSpeed < T.runSpeed * 0.5,
       'prowl is slow enough to get behind (' + label + ')');
  }
  /* RULING (CP2.5, closed-loop harness finding): a bot that jumps the instant it
     sees the tell still eats the charge, while a jump timed late clears it. That
     is INTENDED, and it is arithmetic rather than taste: the telegraph is longer
     than a jump stays above the charge envelope, so "jump at the light" cannot
     be the answer to a hound — by the time the charge arrives an onset jump has
     already landed. The tell is half a second of DECISION (commit late, reroute,
     drop behind, or shoot it now that crouch/assist exist), and the accelerating
     blink resolving into a held coil is what says "not yet… NOW".
     Two things must hold for that to be a skill rather than a trap: the onset
     jump must genuinely be too early (or the ruling is a lie), and the set of
     jump times that DO work must be wide enough for a human. */
  {
    const clear = HD.rideY + HD.hitRadius;
    const tellSec = HD.tellMs / 1000;
    const rise = riseTimeTo(TP, clear);
    const air = airTimeAbove(TP, clear);
    const sweep = 2 * (HD.hitRadius + TP.width / 2) / HD.chargeSpeed;
    // worst-case trigger distance: the tell fires at sense range, the player
    // keeps closing through it, the hound recoils, then they converge
    const gapAtCommit = HD.senseRange - TP.runSpeed * tellSec + HD.tellBackTiles;
    const contact = tellSec + Math.max(0, gapAtCommit) / (HD.chargeSpeed + TP.runSpeed);
    ok(air < contact + sweep,
       'an onset jump lands before the charge arrives (' + air.toFixed(3) + ' s of air vs ' +
       contact.toFixed(3) + ' s to contact): the tell is a commit cue, not a reflex cue');
    // …and the answer window is generous once the player waits for the coil
    const windowSec = (contact + sweep) - (contact) + (air - rise - sweep);
    ok(windowSec >= 0.3,
       'the set of jump times that clear the charge spans ' + windowSec.toFixed(3) +
       ' s — well over human timing jitter');
    ok(HD.tellCoilMs >= 80 && HD.tellCoilMs <= HD.tellMs * 0.3,
       'the commit coil is a distinct final beat of the tell, not the whole tell');
    // the coil must also start no earlier than the point where a jump works, or
    // the cue would be telling the player to move while moving is still wrong
    ok(tellSec - HD.tellCoilMs / 1000 + rise <= contact,
       'the coil fires inside the window where jumping actually clears the charge');
  }
  ok(tightestVisible >= 2,
     'tightest telegraph headroom across all tunes is ' + tightestVisible.toFixed(2) +
     'x the reaction cost (' + tightestTune + ')');
  // A hound hit must cost margin, never the run: its knockback may not eat a
  // meaningful share of the seconds-bounded crush slack a pace grants.
  {
    let survivable = true, worst = 0;
    for (const id of TRAVERSAL_PACE_IDS) {
      const F = resolveTraversalPace(id);
      const cap = F.pursuit.marginCapTiles;
      if (!cap) continue;                          // base: unbounded screen-width clock
      const knocked = PL.knockbackX * (PL.hitstunMs / 1000);
      worst = Math.max(worst, knocked / cap);
      if (knocked > cap * 0.25) survivable = false;
    }
    ok(survivable,
       'a hound hit spends at most a quarter of any pace crush slack (worst ' +
       (worst * 100).toFixed(0) + '%)');
  }
  ok(HD.chargeSpeed * HD.chargeMs / 1000 >= HD.senseRange,
     'the charge sweeps at least the ground it threatened (' +
     (HD.chargeSpeed * HD.chargeMs / 1000).toFixed(1) + ' vs ' + HD.senseRange + ' tiles)');
  ok(HD.chargeSpeed * 0.05 / HD.substeps <= 0.45,
     'charge substeps stay under 0.45 tiles at a clamped 50 ms frame (no tunneling)');
  ok(HD.hitRadius < HD.size[0] / 2 && HD.hitRadius < HD.size[1] / 2,
     'hound hit circle stays inside its silhouette');
  ok(HD.hp * CONFIG.weapons.R.fireRateMs / 1000 <= 1,
     'hound dies to under a second of baseline rifle fire: no HP sponge');
  ok(HD.chargeCooldownMs / (HD.tellMs + HD.chargeMs + HD.chargeCooldownMs) >= 0.4,
     'the floor is denied temporarily, not permanently (safe fraction of the cycle)');
  /* Facetanking arithmetic (pre-empting the adversarial question): i-frames
     must cover ONE charge sweep so a single pass cannot shred a player who
     mistimed once — and must expire well inside the hound's own cycle, so
     walking through a chokepoint a second time costs a second point. Measured
     against the real numbers: a grounded hold-right policy took exactly 1 hp
     per charge cycle, 2 hp across the two chokepoints of a 6.5 s pass. */
  {
    const sweepWindow = 2 * (HD.hitRadius + PL.width / 2) / HD.chargeSpeed;
    const cycleMs = HD.tellMs + HD.chargeMs + HD.chargeCooldownMs;
    ok(PL.iframesMs / 1000 > sweepWindow * 2,
       'i-frames cover a whole charge sweep: one pass costs one point, not several');
    ok(PL.iframesMs < cycleMs,
       'i-frames expire inside the hound cycle: the next charge is not free (' +
       PL.iframesMs + ' < ' + cycleMs + ' ms)');
    ok(Math.ceil(PL.maxHealth * cycleMs / 1000) <= 8,
       'facetanking a chokepoint hound spends the whole health bar in under 8 s');

    /* Mercy-chain farming (code review's open adversarial case): the fallback
       streak clears after `recoverTiles` of un-pinned FORWARD progress, and a
       hound charging from behind knocks the player forward, so hound hits do
       credit that counter. Two bounds keep it from being a strategy: a whole
       health bar of knockback banks less than the threshold, and the plane
       advances further during the hits than the hits can ever bank. */
    const FB = TF.fallback;
    const knockTiles = PL.knockbackX * (PL.hitstunMs / 1000);
    ok(knockTiles * PL.maxHealth < FB.recoverTiles,
       'a full health bar of forward hound knockback banks ' +
       (knockTiles * PL.maxHealth).toFixed(2) + ' tiles, under the ' +
       FB.recoverTiles + '-tile mercy threshold: charges cannot buy a fallback');
    let losingTrade = true;
    const hitsNeeded = Math.ceil(FB.recoverTiles / knockTiles);
    for (const id of TRAVERSAL_PACE_IDS) {
      const PU = resolveTraversalPace(id).pursuit;
      // one hit per hound cycle (i-frames, asserted above), so banking the
      // threshold takes this long — and the edge eats this much ground meanwhile
      if (!(hitsNeeded * (cycleMs / 1000) * PU.cruiseSpeed > FB.recoverTiles * 2)) {
        losingTrade = false;
      }
    }
    ok(losingTrade,
       'farming mercy off hound hits needs ' + hitsNeeded +
       ' charges and costs far more ground than it banks, at every pace');
  }
  ok(HD.laneBelow >= (GG.maxH - GG.minH) + HD.rideY,
     'lane band reaches a full generator step below the plate: the step down is no loophole');
  ok(2.35 - HD.rideY > HD.laneAbove,
     'lane band stops below the mid catwalk: a hound denies the floor, not the tier above');
  ok(HD.stepUpTiles < GG.maxH - GG.minH + 1e-9,
     'a full generator height step can still stop a charge');
}
{
  // --- houndframe trial: authored teach/test/remix stages --------------
  const HD = CONFIG.hound;
  const STAGE_NAMES = ['solo', 'combo', 'squeezePlus', 'mix', 'aim'];
  // stages the operator plays for feel carry the threat contract below; the aim
  // bench is a target range and declares itself with `bench: true`
  const FEEL_STAGES = STAGE_NAMES.filter(function (n) { return !HOUND_TRIAL.stages[n].bench; });
  // the chokepoint placement contract applies to every stage except the frozen
  // CP2 baseline (stage 2, kept exactly as judged) and the bench's station rules
  const PLACED_STAGES = STAGE_NAMES.filter(function (n) { return !HOUND_TRIAL.stages[n].frozen; });
  ok(STAGE_NAMES.filter(function (n) { return HOUND_TRIAL.stages[n].frozen; }).join(',') === 'combo',
     'exactly one stage claims the frozen-baseline exemption, and it is stage 2');
  ok(traversalEnemyPlan(TF, null) === TF.enemies &&
     traversalEnemyPlan(TF, 'nonsense') === TF.enemies &&
     traversalEnemyPlan(null, 'solo').length === 0,
     'without an opt-in stage the slice keeps its own composition exactly');
  ok(TF.enemies.length === 2 && TF.enemies.every(function (e) { return e.kind === 'wasp'; }),
     'fixture default composition is still the two authored wasps');
  ok(STAGE_NAMES.every(function (n) { return houndTrialStage(n) === HOUND_TRIAL.stages[n]; }) &&
     houndTrialStage(null) === null && houndTrialStage('nope') === null,
     'trial stages resolve by name and reject anything else');
  ok(STAGE_NAMES.every(function (n) {
    const s = HOUND_TRIAL.stages[n];
    return ['replace', 'add'].indexOf(s.compose) >= 0 && s.id === n &&
      typeof s.label === 'string' && s.enemies.length >= 1;
  }), 'every stage declares an id, a label, and one of the two composition rules');

  /* The composition rule, proved against every pace: with no stage the plan IS
     the pace's list (identity, so no ?pace= URL changes behavior); a `replace`
     stage fields only its own roster (teaching a new enemy stays isolated at
     every pacing); an `add` stage appends its hounds and leaves every pace row —
     ids, positions, per-enemy tunes — untouched. */
  {
    const trialBefore = JSON.stringify(HOUND_TRIAL);
    const paceBefore = JSON.stringify(TRAVERSAL_PACES);
    let identity = true, replaced = true, appended = true, unique = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const F = resolveTraversalPace(id);
      if (traversalEnemyPlan(F, null) !== F.enemies ||
          traversalEnemyPlan(F, 'nonsense') !== F.enemies) identity = false;
      for (const name of STAGE_NAMES) {
        const stage = HOUND_TRIAL.stages[name];
        const plan = traversalEnemyPlan(F, name);
        const ids = new Set(plan.map(function (e) { return e.id; }));
        if (ids.size !== plan.length) unique = false;
        if (!plan.some(function (e) { return e.kind === 'hound'; })) unique = false;
        if (stage.compose === 'replace') {
          if (plan.length !== stage.enemies.length ||
              !plan.every(function (e, i) { return e.id === stage.enemies[i].id; })) replaced = false;
        } else {
          const tail = plan.slice(F.enemies.length);
          const authored = new Set(stage.enemies.map(function (e) { return e.id; }));
          if (plan.length !== F.enemies.length + stage.enemies.length ||
              !F.enemies.every(function (e, i) {
                return JSON.stringify(plan[i]) === JSON.stringify(e);
              }) ||
              // the appended tail is exactly the stage's own authored rows, and
              // it always brings at least one hound (it is a hound stage)
              !tail.every(function (e) { return authored.has(e.id); }) ||
              !tail.some(function (e) { return e.kind === 'hound'; })) {
            appended = false;
          }
        }
      }
    }
    ok(identity, 'no stage selected: every pace plan is its own authored list, unchanged');
    ok(replaced, 'replace stages field only their own roster at every pace');
    ok(appended, 'the add stage appends hounds and leaves every pace row byte-identical');
    ok(unique, 'composed plans have unique ids and always contain a hound, at every pace');
    ok(JSON.stringify(HOUND_TRIAL) === trialBefore &&
       JSON.stringify(TRAVERSAL_PACES) === paceBefore,
       'composing a plan mutates neither the trial table nor the pace table');
  }

  for (const name of STAGE_NAMES) {
    const plan = traversalEnemyPlan(TF, name);
    const hounds = plan.filter(function (e) { return e.kind === 'hound'; });
    const ids = new Set(plan.map(function (e) { return e.id; }));
    ok(hounds.length >= 1 && ids.size === plan.length &&
       plan.every(function (e) {
         return Number.isFinite(e.x) && Number.isFinite(e.y) &&
           Number.isFinite(e.delayMs) && e.delayMs >= 0 &&
           e.x >= B.x0 && e.x < B.x1;
       }),
       name + ' stage authors uniquely named, in-bounds hostiles including a hound');

    /* The CP2 placement contract. "One hound doesn't pose any threat" was a
       PLACEMENT verdict, so it is placement that is asserted: every hound
       stands on the surface it guards, paces a SHORT span (a long span is how a
       frame ends up eight tiles from the decision, i.e. scenery), and that span
       is centred on the connector it declares it `owns` — with a charge from
       either end still sweeping that connector. */
    let planted = true, paced = true, owns = true, sweeps = true;
    for (const h of hounds) {
      const roof = h.surface === 'solid-top';
      const span = h.patrol.x1 - h.patrol.x0;
      if (Math.abs(h.y - (h.deck + HD.rideY)) > 1e-9 || Math.abs(h.dir) !== 1 ||
          h.x < h.patrol.x0 || h.x > h.patrol.x1) planted = false;
      if (roof) {
        // a raised runner needs an authored solid whose TOP is its deck, and
        // whose extent contains the whole span with a tile of edge to spare
        const rect = TF.solidRects.find(function (r) {
          return r.y1 === h.deck && h.x >= r.x0 && h.x < r.x1;
        });
        if (!rect || h.patrol.x0 < rect.x0 + 1 || h.patrol.x1 > rect.x1 - 1) paced = false;
        // sim-side: the surface really is solid under the frame, and open above
        if (!rect || !levelSolidCell(TL, Math.floor(h.x), h.deck - 1, 8) ||
            levelSolidCell(TL, Math.floor(h.x), h.deck, 8)) planted = false;
        // falling off a roof must cost position, never the run: ground below
        if (!(TL.groundH[Math.floor(h.x)] > -100 &&
              TL.groundH[Math.floor(h.x)] < h.deck)) sweeps = false;
      } else {
        if (TL.groundH[Math.floor(h.x)] !== h.deck) planted = false;
        const run = TF.groundRuns.find(function (r) { return h.x >= r.x0 && h.x < r.x1; });
        if (!run || run.y !== h.deck ||
            h.patrol.x0 < run.x0 + 0.5 || h.patrol.x1 > run.x1 - 0.5) paced = false;
      }
      // a threat span is short; a bench station may be shorter still
      const minSpan = HOUND_TRIAL.stages[name].bench ? 0.5 : 2.0;
      if (!HOUND_TRIAL.stages[name].frozen && (span < minSpan || span > 4.0)) paced = false;

      if (HOUND_TRIAL.stages[name].frozen) continue;      // baseline: predates the contract
      const c = connectorById.get(h.owns);
      if (!c || c.x < h.patrol.x0 || c.x > h.patrol.x1 ||
          Math.abs(c.y - h.deck) > 0.6) owns = false;
      // from either end of the span, a charge still reaches what it owns
      const reach = HD.chargeSpeed * HD.chargeMs / 1000;
      if (!c || Math.max(Math.abs(c.x - h.patrol.x0), Math.abs(c.x - h.patrol.x1)) > reach) {
        sweeps = false;
      }
    }
    ok(planted, name + ' hounds sit on the authored surface they guard, facing a declared way');
    ok(paced, name + ' hound patrol spans are short and inside one authored surface');
    ok(owns, name + ' every hound owns a real connector inside its patrol span');
    ok(sweeps, name + ' a charge from either end of the span still sweeps what it owns');

    // Per-route threat assignment: every hostile the TRIAL authors is assigned
    // to a real route, and a hound must actually stand on a connector that route
    // walks — that is what makes "choosing a route" mean "choosing a matchup".
    // (The remix stage also carries the pace's own rows, which are the pacing
    // lane's to place and are checked by the pace assertions instead.)
    const authoredIds = new Set(HOUND_TRIAL.stages[name].enemies.map(function (e) { return e.id; }));
    let assigned = true, onRoute = true;
    for (const e of plan.filter(function (r) { return authoredIds.has(r.id); })) {
      const route = routeById.get(e.contests);
      if (!route) { assigned = false; continue; }
      if (e.kind !== 'hound') continue;
      if (HOUND_TRIAL.stages[name].frozen) {          // baseline: any connector on the route
        const some = route.connectorIds.some(function (id) {
          const c = connectorById.get(id);
          return c && c.x >= e.patrol.x0 && c.x <= e.patrol.x1 && Math.abs(c.y - e.deck) < 0.5;
        });
        if (!some) onRoute = false;
      } else if (route.connectorIds.indexOf(e.owns) < 0) onRoute = false;
    }
    ok(assigned, name + ' stage assigns every hostile to a declared fixture route');
    ok(onRoute, name + ' every hound owns a connector its assigned route actually walks');
  }
  {
    // Route stakes: hounds may not colonise every line. The floor and the one
    // shared roof segment are theirs; at least two routes stay a pure air
    // problem, so choosing an elevation is still choosing a matchup.
    for (const name of FEEL_STAGES) {
      const hounds = traversalEnemyPlan(TF, name).filter(function (e) { return e.kind === 'hound'; });
      const houndRoutes = new Set(hounds.map(function (h) { return h.contests; }));
      const clear = TF.routes.filter(function (r) { return !houndRoutes.has(r.id); });
      ok(clear.length >= 2,
         name + ' leaves at least two routes hound-free (' + clear.length + ')');
    }
  }
  {
    /* Roof fairness (the first hounds above the floor). A raised lane commits
       the player: they arrive at one point and cannot side-step off it for
       free. So the telegraph has to start BEFORE they are inside the span —
       the arrival connector sits outside the patrol span, and within sense
       range of it, which is exactly "tell visible before the catwalk commits
       you into the patrol span". */
    let fair = true, checked = 0;
    for (const name of FEEL_STAGES) {
      for (const h of traversalEnemyPlan(TF, name)) {
        if (h.kind !== 'hound' || h.surface !== 'solid-top') continue;
        checked++;
        const rect = TF.solidRects.find(function (r) {
          return r.y1 === h.deck && h.x >= r.x0 && h.x < r.x1;
        });
        // both approaches onto the surface: its two edges
        for (const arrival of [rect.x0, rect.x1]) {
          const gap = arrival < h.patrol.x0
            ? h.patrol.x0 - arrival
            : arrival - h.patrol.x1;
          if (!(gap > 0.5 && gap < HD.senseRange)) fair = false;
        }
        // and the surface has to be wider than the span it is patrolled with,
        // or there is nowhere to dodge on it at all
        if (!(rect.x1 - rect.x0 >= (h.patrol.x1 - h.patrol.x0) + 3)) fair = false;
      }
    }
    ok(checked >= 1 && fair,
       'every roof hound telegraphs before its span, on a surface with room to dodge');
  }
  {
    // "Hound forces the jump that the wasp contests" — the combination stage
    // has to actually place the air threat on the arc that answers a charge.
    const combo = traversalEnemyPlan(TF, 'combo');
    const wasps = combo.filter(function (e) { return e.kind === 'wasp'; });
    const hounds = combo.filter(function (e) { return e.kind === 'hound'; });
    const apex = TP.jumpVel * TP.jumpVel / (2 * -TP.gravity);
    const contested = wasps.some(function (w) {
      return hounds.some(function (h) {
        return w.contests === h.contests &&
          Math.abs(w.x - h.x) < CONFIG.wasp.diveRange &&
          w.y > h.deck + apex + 1 &&
          w.y - h.deck < CONFIG.wasp.diveSpeed * CONFIG.wasp.diveMs / 1000;
      });
    });
    ok(wasps.length >= 1 && hounds.length >= 1 && contested,
       'combo stage puts a wasp in dive reach of the jump arc over a hound plate');
    // the pocket guard owns the MOUTH: the wager's only way in and out, so the
    // dare stops being a free pickup — and its charge can still be baited out
    // through that mouth, which is what keeps the retreat contract intact.
    const pocketHound = traversalEnemyPlan(TF, 'solo').find(function (e) {
      return e.owns === TF.darePocket.commit;
    });
    const mouthX = connectorById.get(TF.darePocket.commit).x;
    ok(!!pocketHound &&
       Math.abs(pocketHound.patrol.x0 - mouthX) <= 1.0 &&
       pocketHound.patrol.x1 < TF.darePocket.reward.x &&
       HD.chargeSpeed * HD.chargeMs / 1000 > pocketHound.patrol.x1 - mouthX,
       'the pocket guard owns the mouth without camping the reward, and can be baited out');
  }
}

/* --- Iris Polyp: sightline fairness, iris rhythm, rooted placement -----
 * The polyp is legitimate only if (1) the tell is a real reaction window for
 * the SLOWEST escape, not just the jump; (2) the beam locks one lane and
 * never a tier; (3) the iris rhythm makes openings, not hit points, the way
 * it dies; and (4) the rooted station actually covers the connector it
 * declares it owns, over the real fixture terrain. Constants are tied to the
 * player's physics for the frozen tune AND every pace overlay, mirroring the
 * houndframe contract above.                                            */
{
  const PP = CONFIG.polyp;
  const HD = CONFIG.hound;
  const R = CONFIG.weapons.R;
  const cycleMs = PP.tellMs + PP.beamMs + PP.ventMs + PP.cooldownMs;
  const latency = (PL.jumpBufferMs + 1000 / 30) / 1000;
  const isSolidAt = function (x, y) { return levelSolidCell(TL, Math.floor(x), Math.floor(y), 8); };

  // -- the sim roster row and its render twin ---------------------------
  ok(!!simEnemyTable.polyp && simEnemyTable.polyp.gating === false &&
     simEnemyTable.polyp.start === 'closed' &&
     simEnemyTable.polyp.hp === PP.hp && simEnemyTable.polyp.hitR === PP.hitRadius,
     'sim ENEMY table carries the polyp: non-gating, born closed, CONFIG-matched');
  {
    const renderSrc = readFileSync(join(srcDir, 'render', 'hostiles.js'), 'utf8');
    ok(Object.keys(simEnemyTable).every(function (k) {
      return new RegExp(k + ':\\s*\\{').test(renderSrc);
    }), 'every sim ENEMY kind has a LOOK row in render/hostiles.js (polyp included)');
  }

  // -- iris rhythm: temporary lock, honest opening, no sponge -----------
  ok(PP.hp * R.fireRateMs <= PP.ventMs,
     'one vent window of baseline rifle fire kills the polyp (' +
     (PP.hp * R.fireRateMs) + ' <= ' + PP.ventMs + ' ms): the opening is honest');
  ok(PP.cooldownMs / cycleMs >= 0.4,
     'the lane is locked temporarily, not permanently (closed fraction ' +
     (PP.cooldownMs / cycleMs).toFixed(2) + ' of the cycle)');
  ok(PP.beamMs / cycleMs <= 0.2,
     'the beam itself holds the lane for at most a fifth of the cycle');
  ok(PL.iframesMs > PP.beamMs,
     'i-frames outlast one volley: standing in the beam costs one point, not a bar');
  ok(PL.iframesMs < cycleMs,
     'i-frames expire inside the iris cycle: the next volley is not free');
  ok(PP.hitRadius < PP.size + 1e-9,
     'polyp hit circle stays inside its bulb silhouette');
  ok(PP.beamStepTiles < 0.5 && PP.beamHalf < 0.5,
     'sight march is finer than a 1-tile wall and the band is under half a tile tall');
  // the CP2 aim-gap lesson, applied at authoring time: the bulb centers on
  // the standing firing line, so spending an opening never needs the
  // crouch/assist prototypes
  ok(Math.abs(PL.muzzleY - PP.rootY) <= PP.hitRadius / 2,
     'a standing level shot from the polyp lane center-punches the bulb (muzzle ' +
     PL.muzzleY + ' vs root ' + PP.rootY + ')');

  // -- escape physics: the tell covers the SLOWEST answer, per tune -----
  {
    const jumpRise = PP.rootY + PP.beamHalf;      // feet clear of the band, from the deck
    const dropFall = PL.height - (PP.rootY - PP.beamHalf);   // head below the band
    ok(dropFall > 0, 'the band sits low enough that a drop-through can duck it at all');
    const TUNES = [['normal tune', PL]].concat(
      TRAVERSAL_PACE_IDS.map(function (id) {
        return ['pace ' + id, { ...PL, ...resolveTraversalPace(id).movement }];
      })
    );
    for (const [label, T] of TUNES) {
      const jumpCost = riseTimeTo(T, jumpRise) + latency;
      ok(Number.isFinite(jumpCost) && PP.tellMs / 1000 >= 2 * jumpCost,
         'polyp tell is at least twice the cost of jumping clear of the band (' + label +
         ': ' + (PP.tellMs / 1000).toFixed(3) + ' s vs ' + jumpCost.toFixed(3) + ' s)');
      const dropCost = Math.sqrt(2 * dropFall / (-T.gravity * T.fallGravityMult)) + latency;
      ok(PP.tellMs / 1000 >= 2 * dropCost,
         'polyp tell is at least twice the cost of dropping below the band (' + label +
         ': vs ' + dropCost.toFixed(3) + ' s): the slowest escape still has headroom');
      ok(airTimeAbove(T, jumpRise) > PP.beamMs / 1000,
         'a full jump stays above the band for longer than the whole volley (' + label +
         ': ' + airTimeAbove(T, jumpRise).toFixed(3) + ' s vs ' + (PP.beamMs / 1000) + ' s)');
    }
  }

  // -- pure geometry units ----------------------------------------------
  ok(polypBendClampRange(10, 1, 9, [14]) === 4 &&
     polypBendClampRange(10, -1, 9, [14]) === 9 &&
     polypBendClampRange(10, -1, 9, [8]) === 2 &&
     polypBendClampRange(10, 1, 9, []) === 9 &&
     polypBendClampRange(10, 1, 9, [10]) === 0,
     'bend clamp: a sightline stops at the first facet bend ahead, ignores bends behind');
  {
    const r1 = polypBeamReach(10, 0, -1, 9, function (x) { return Math.floor(x) === 5; }, 0.35);
    ok(r1 > 4 - 1e-9 && r1 <= 4 + 0.35 + 1e-9 && r1 < 5,
       'reach march stops within one step of a wall face and never crosses a 1-tile wall');
    ok(polypBeamReach(10, 0, -1, 9, function () { return false; }, 0.35) === 9,
       'reach march runs to the clamped range over open ground');
    ok(polypBeamReach(10, 0, 1, 9, function () { return true; }, 0.35) <= 0.35 + 1e-9,
       'a barrel against a wall has no lane at all');
  }
  ok(!polypBeamHitsRect(10, 5, -1, 0, 0.32, 0, 20, 0, 10), 'zero reach hits nothing');
  ok(polypBeamHitsRect(10, 5, -1, 4, 0.32, 7, 8, 4, 6), 'a body in the lane is hit');
  ok(!polypBeamHitsRect(10, 5, -1, 4, 0.32, 10.2, 11, 4, 6), 'behind the barrel tip is safe');
  ok(!polypBeamHitsRect(10, 5, -1, 4, 0.32, 7, 8, 5.4, 7), 'above the band is safe');
  ok(!polypBeamHitsRect(10, 5, -1, 4, 0.32, 7, 8, 3, 4.6), 'below the band is safe');

  // -- stages and composition -------------------------------------------
  const PSTAGE_NAMES = ['solo', 'combo'];
  ok(Object.keys(POLYP_TRIAL.stages).join(',') === PSTAGE_NAMES.join(','),
     'the polyp trial is exactly teach (solo) then one two-enemy combination (combo)');
  ok(PSTAGE_NAMES.every(function (n) { return polypTrialStage(n) === POLYP_TRIAL.stages[n]; }) &&
     polypTrialStage(null) === null && polypTrialStage('nope') === null,
     'polyp stages resolve by name and reject anything else');
  ok(POLYP_TRIAL.stages.solo.enemies.length === 1 &&
     POLYP_TRIAL.stages.solo.enemies[0].kind === 'polyp',
     'the teach stage is ONE polyp and nothing else: every point of damage is the beam');
  {
    const polypBefore = JSON.stringify(POLYP_TRIAL);
    const HSTAGE_NAMES = [null, 'solo', 'combo', 'squeezePlus', 'mix', 'aim'];
    let identity = true, replaced = true, derived = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const F = resolveTraversalPace(id);
      for (const h of HSTAGE_NAMES) {
        const withNone = traversalEnemyPlan(F, h);
        if (h === null && traversalEnemyPlan(F, null, null) !== F.enemies) identity = false;
        if (JSON.stringify(traversalEnemyPlan(F, h, null)) !== JSON.stringify(withNone) ||
            JSON.stringify(traversalEnemyPlan(F, h, 'nonsense')) !== JSON.stringify(withNone)) {
          identity = false;
        }
        for (const p of PSTAGE_NAMES) {
          const stage = POLYP_TRIAL.stages[p];
          const plan = traversalEnemyPlan(F, h, p);
          if (plan.length !== stage.enemies.length) { replaced = false; continue; }
          plan.forEach(function (e, i) {
            const a = stage.enemies[i];
            if (e.id !== a.id || e.kind !== a.kind) replaced = false;
            if (a.deck !== undefined) {
              const ride = e.kind === 'polyp' ? PP.rootY : HD.rideY;
              if (Math.abs(e.y - (a.deck + ride)) > 1e-9) derived = false;
            }
          });
        }
      }
    }
    ok(identity, 'no ?polyp=: every pace x hound-stage plan is byte-identical to today');
    ok(replaced, 'polyp stages field only their own roster, at every pace and hound stage');
    ok(derived, 'polyp rows root at deck+rootY, hound rows ride deck+rideY, in composed plans');
    ok(JSON.stringify(POLYP_TRIAL) === polypBefore,
       'composing a plan never mutates the polyp trial table');
  }

  // -- rooted placement over the real fixture terrain -------------------
  for (const name of PSTAGE_NAMES) {
    const plan = traversalEnemyPlan(TF, null, name);
    const ids = new Set(plan.map(function (e) { return e.id; }));
    ok(ids.size === plan.length && plan.every(function (e) {
      return Number.isFinite(e.x) && Number.isFinite(e.y) &&
        Number.isFinite(e.delayMs) && e.delayMs >= 0 && e.x >= B.x0 && e.x < B.x1;
    }), name + ' polyp stage authors uniquely named, in-bounds hostiles');
    const polyps = plan.filter(function (e) { return e.kind === 'polyp'; });
    ok(polyps.length === 1, name + ' fields exactly one polyp: the lesson stays attributable');
    for (const p of polyps) {
      const mount = (p.mount || '').split(':');
      const plat = TF.platforms.find(function (r) { return r.id === mount[1]; });
      ok(mount[0] === 'platform' && !!plat && plat.y === p.deck &&
         p.x >= plat.x0 + 0.5 && p.x <= plat.x1 - 0.5 && Math.abs(p.dir) === 1,
         name + ' polyp is rooted on its declared catwalk, inside its extent, facing a declared way');
      const route = routeById.get(p.contests);
      const c = connectorById.get(p.owns);
      ok(!!route && !!c && route.connectorIds.indexOf(p.owns) >= 0,
         name + ' polyp owns a real connector its assigned route actually walks');
      const y = p.deck + PP.rootY;
      const tip = p.x + p.dir * PP.barrelTiles;
      const clamp = polypBendClampRange(tip, p.dir, PP.sightRange, BEND_S);
      ok(clamp === PP.sightRange,
         name + ' no facet bend cuts this station (the clamp is armed but idle here)');
      const reach = polypBeamReach(tip, y, p.dir, clamp, isSolidAt, PP.beamStepTiles);
      ok(reach > 2,
         name + ' beam has a real lane to lock (reach ' + reach.toFixed(1) + ' tiles)');
      ok(polypBeamHitsRect(tip, y, p.dir, reach, PP.beamHalf,
           c.x - 0.35, c.x + 0.35, c.y, c.y + PL.height),
         name + ' beam covers a standing body at the connector it owns');
      const shared = connectorById.get('overhang-top');
      ok(!polypBeamHitsRect(tip, y, p.dir, reach, PP.beamHalf,
           shared.x - 0.35, shared.x + 0.35, shared.y, shared.y + PL.height),
         name + ' the shared overhang-top decision point stays outside the lock: the ' +
         'fork is chosen in the open (board 07)');
      const x0 = p.dir > 0 ? tip : tip - reach;
      const x1 = p.dir > 0 ? tip + reach : tip;
      let below = true, above = true, clips = false;
      for (const run of TF.groundRuns) {
        if (run.x1 <= x0 || run.x0 >= x1) continue;
        if (run.y + PL.height >= y - PP.beamHalf) below = false;
      }
      for (const plat2 of TF.platforms) {
        if (plat2.id !== mount[1] && plat2.x1 > x0 && plat2.x0 < x1 &&
            plat2.y > p.deck && plat2.y <= y + PP.beamHalf) above = false;
        if (plat2.id !== mount[1] && plat2.x0 < p.x + PP.size && plat2.x1 > p.x - PP.size &&
            plat2.y >= p.deck && plat2.y <= y + PP.size * (1 + PP.tellSwell)) clips = true;
      }
      ok(below, name + ' every deck below the span stays a safe reroute: no standing body in the band');
      ok(above, name + ' no higher catwalk inside the span sits in the band: one lane, never a tier');
      ok(!clips, name + ' the bulb (even swollen) clips no neighboring catwalk');
      // the roof tail behind the pocket wall pays a toll inside the span —
      // a DECLARED fact, not an accident, and fair: hopping the band from the
      // roof is strictly easier than the asserted from-deck jump, and the
      // pocket floor below it is asserted clear by the deck check above
      const roof = TF.solidRects.find(function (r) { return r.id === 'dare-overhang'; });
      ok(polypBeamHitsRect(tip, y, p.dir, reach, PP.beamHalf,
           roof.x1 - 1.5, roof.x1, roof.y1, roof.y1 + PL.height),
         name + ' the roof freeway pays a toll at the span tail (declared)');
    }
  }

  // -- the combination: a vertical stack on one decision ----------------
  {
    const combo = traversalEnemyPlan(TF, null, 'combo');
    ok(combo.length === 2,
       'the combination stage is exactly two enemies: one new lesson at a time');
    const p = combo.find(function (e) { return e.kind === 'polyp'; });
    const h = combo.find(function (e) { return e.kind === 'hound'; });
    ok(!!p && !!h, 'combo pairs the polyp with a houndframe');
    const span = h.patrol.x1 - h.patrol.x0;
    const run = TF.groundRuns.find(function (r) { return h.x >= r.x0 && h.x < r.x1; });
    const hc = connectorById.get(h.owns);
    const reachH = HD.chargeSpeed * HD.chargeMs / 1000;
    ok(!!run && run.y === h.deck && TL.groundH[Math.floor(h.x)] === h.deck &&
       Math.abs(h.y - (h.deck + HD.rideY)) <= 1e-9 && Math.abs(h.dir) === 1 &&
       h.x >= h.patrol.x0 && h.x <= h.patrol.x1 &&
       h.patrol.x0 >= run.x0 + 0.5 && h.patrol.x1 <= run.x1 - 0.5 &&
       span >= 2.0 && span <= 4.0 &&
       !!hc && routeById.get(h.contests).connectorIds.indexOf(h.owns) >= 0 &&
       hc.x >= h.patrol.x0 && hc.x <= h.patrol.x1 && Math.abs(hc.y - h.deck) <= 0.6 &&
       Math.max(Math.abs(hc.x - h.patrol.x0), Math.abs(hc.x - h.patrol.x1)) <= reachH,
       'combo hound is the judged rejoin beat: planted, short span, owns a swept connector');
    const y = p.deck + PP.rootY;
    const tip = p.x + p.dir * PP.barrelTiles;
    const reach = polypBeamReach(tip, y, p.dir,
      polypBendClampRange(tip, p.dir, PP.sightRange, BEND_S), isSolidAt, PP.beamStepTiles);
    const x0 = p.dir > 0 ? tip : tip - reach;
    ok(hc.x > x0 && hc.x < (p.dir > 0 ? tip + reach : tip) &&
       hc.y + PL.height < y - PP.beamHalf,
       'the hound prices the drop reroute directly beneath the locked lane: a vertical stack');
    ok(h.contests !== p.contests,
       'the two threats price different routes — reroute vs lock is a real choice, ' +
       'never double jeopardy on one line');
  }
}

/* --- the 8-way aim gap, and the two prototypes answering it -----------
 * CP2, operator verbatim: "sometimes I'm lined up to shoot and safe and can't
 * quite get the projectiles to the target." That is geometry, not feel: the
 * standing firing line passes over a houndframe's hit circle, and the 8-way
 * down-diagonal buries itself in the deck within a tile. Both prototypes are
 * asserted against that same geometry, so neither can drift into either
 * uselessness or autoplay.                                                */
{
  const HD = CONFIG.hound, CR = CONFIG.crouch, AS = CONFIG.assist;
  const circleTop = HD.rideY + HD.hitRadius;      // 0.87 over the deck it walks
  const circleBottom = HD.rideY - HD.hitRadius;

  // the gap itself — the reason both flags exist. If a retune ever closes it,
  // these prototypes are pointless and this assertion says so out loud.
  ok(PL.muzzleY > circleTop,
     'the standing firing line really does pass over a houndframe (' + PL.muzzleY +
     ' vs ' + circleTop.toFixed(2) + '): the aim gap is real');
  // a 45-degree down shot from a standing muzzle reaches the deck in about a
  // tile, so the 8-way answer covers point-blank range only
  ok(PL.muzzleY < 1.5,
     'the down-diagonal reaches the deck within ~1 tile, so 8-way covers point blank only');

  // --- crouch -------------------------------------------------------
  ok(CR.muzzleY > circleBottom && CR.muzzleY < circleTop,
     'the crouched firing line lands inside the hound hit circle (' + CR.muzzleY + ')');
  ok(Math.abs(CR.muzzleY - HD.rideY) <= HD.hitRadius / 2,
     'the crouched line sits near the middle of that circle, not on its edge');
  ok(CR.height <= PL.height * 0.65 && CR.height > 0,
     'crouching is a real profile change (' + CR.height + ' vs ' + PL.height + ')');
  // crouch may NOT become an answer to the charge: the crouched body still
  // occupies the charge envelope, so the movement verb stays the movement verb
  ok(CR.height > circleBottom,
     'a crouched player is still inside the charge envelope: crouch is not a dodge');
  {
    const base = {
      enabled: true, grounded: true, down: true, jumpBuffered: false,
      traversalState: 'free', standHeight: PL.height, standMuzzleY: PL.muzzleY,
    };
    const on = crouchStance(base, CR);
    ok(on.crouched && on.planted && on.height === CR.height && on.muzzleY === CR.muzzleY,
       'crouch engages grounded with down held, and plants the player while it does');
    const off = [
      { enabled: false }, { grounded: false }, { down: false },
      { jumpBuffered: true }, { traversalState: 'wall' },
    ].map(function (patch) { return crouchStance({ ...base, ...patch }, CR); });
    ok(off.every(function (r) {
      return !r.crouched && !r.planted &&
        r.height === PL.height && r.muzzleY === PL.muzzleY;
    }), 'crouch never engages disabled, airborne, un-held, mid-launch, or on a wall');
    ok(!crouchStance({ ...base, jumpBuffered: true }, CR).crouched,
       'a buffered jump always wins over the stance: ducking cannot eat the tell window');
  }

  // --- aim assist ---------------------------------------------------
  ok(AS.maxDeg <= AS.coneDeg && AS.coneDeg < 45 && AS.maxDeg <= 10 && AS.range > 0,
     'assist bounds are light: cone < 45 deg, correction <= 10 deg, cap <= cone');
  ok(AS.range <= CONFIG.weapons.R.speed * CONFIG.weapons.R.lifeMs / 1000,
     'assist never reaches past the baseline rifle shot it is correcting');
  // the design contract: from minFixTiles out, the cap is enough to drop a
  // level shot onto a hound; closer than that the player crouches or jumps
  ok(assistVerticalReach(AS.minFixTiles, AS) >= PL.muzzleY - HD.rideY,
     'assist closes the standing firing-line gap from ' + AS.minFixTiles +
     ' tiles out (reach ' + assistVerticalReach(AS.minFixTiles, AS).toFixed(2) + ')');
  // …and the anti-autoplay bound: even at maximum range it cannot pull a shot
  // into a different lane, so it can never pick a target the player did not
  ok(assistVerticalReach(AS.range, AS) < 2.35,
     'at maximum range the correction stays inside one lane (' +
     assistVerticalReach(AS.range, AS).toFixed(2) + ' < 2.35 tile tier gap)');
  {
    const cfg = AS;
    const none = assistDirection(1, 0, 0, 0, [], cfg);
    ok(none.x === 1 && none.y === 0 && none.targetId === 0,
       'assist with no targets returns the heading untouched');
    const far = assistDirection(1, 0, 0, 0, [{ id: 1, x: cfg.range + 2, y: 0 }], cfg);
    const behind = assistDirection(1, 0, 0, 0, [{ id: 2, x: -4, y: 0 }], cfg);
    const outside = assistDirection(1, 0, 0, 0, [{ id: 3, x: 4, y: 4 }], cfg);
    ok(far.targetId === 0 && behind.targetId === 0 && outside.targetId === 0,
       'assist ignores targets out of range, behind the player, or outside the cone');
    // a target inside the cone but past the cap: rotated by exactly the cap
    const capped = assistDirection(1, 0, 0, 0, [{ id: 4, x: 6, y: -1.5 }], cfg);
    ok(capped.targetId === 4 && Math.abs(capped.adjustedDeg + cfg.maxDeg) < 1e-9 &&
       Math.abs(Math.hypot(capped.x, capped.y) - 1) < 1e-12,
       'a correction past the cap is clamped to the cap and stays a unit heading');
    // a hound 6 tiles ahead on the player's own deck: the exact CP2 complaint
    const dy = HD.rideY - PL.muzzleY;
    const hound = assistDirection(1, 0, 0, 0, [{ id: 5, x: 6, y: dy }], cfg);
    const hitsAt6 = Math.abs(hound.y / hound.x * 6 - dy) <= HD.hitRadius;
    ok(hound.targetId === 5 && hitsAt6,
       'the corrected shot reaches a hound standing 6 tiles away on the same deck');
    // nearest-inside-cone wins, deterministically
    const two = assistDirection(1, 0, 0, 0,
      [{ id: 6, x: 8, y: -0.2 }, { id: 7, x: 4, y: -0.1 }], cfg);
    ok(two.targetId === 7, 'assist prefers the smallest angular offset, deterministically');
  }
}

/* --- contesting the flight lane (adversarial F10 / the roof freeway) ---
 * A mash-jump policy with fire held clears the slice untouched by flying above
 * everything authored: nothing on the floor can reach it, and a hound never
 * will. Wasps only dive at a player BELOW them, so the fix inside the existing
 * roster is wasps parked above the highest place a player can reach.       */
{
  const topPlatform = Math.max.apply(null, TF.platforms.map(function (p) { return p.y; }));
  const apex = TP.jumpVel * TP.jumpVel / (2 * -TP.gravity);
  const reachableApex = topPlatform + apex;       // best case standing launch
  const diveReach = CONFIG.wasp.diveSpeed * CONFIG.wasp.diveMs / 1000;
  let contested = 0, valid = true;
  for (const name of ['solo', 'squeezePlus']) {
    const ceiling = traversalEnemyPlan(TF, name).filter(function (e) {
      return e.kind === 'wasp' && e.y > topPlatform;
    });
    if (ceiling.length < 1) valid = false;
    for (const w of ceiling) {
      contested++;
      // above the highest apex a player can make, plus the dive's own gate…
      if (!(w.y > reachableApex + 1)) valid = false;
      // …still able to reach down into the lane it is watching…
      if (!(w.y - topPlatform <= diveReach)) valid = false;
      // …and high enough that its deepest reach cannot punish a player who is
      // merely clearing a floor hound: dodging a charge stays free of the roof
      if (!(w.y - diveReach > 3 + apex + PL.height + CONFIG.wasp.contactRadius)) valid = false;
      if (!(w.tune && w.tune.diveRange >= CONFIG.wasp.diveRange)) valid = false;
    }
  }
  ok(contested >= 3 && valid,
     'the teach and 2.5 stages park wasps above the highest reachable apex (' +
     reachableApex.toFixed(2) + '), close enough to dive into it');
}

// --- traversal movement decisions --------------------------------------
function gridGeometry(cells) {
  const filled = new Set(cells.map(function (c) { return c[0] + ',' + c[1]; }));
  return {
    isSolid: function (i, j) { return filled.has(i + ',' + j); },
    minCellX: 0,
    maxCellX: 20,
    minPlayerX: 0,
  };
}
const ledgeState = {
  x: 1.4, y: 1.58, hw: PL.width / 2, h: PL.height,
  vx: 3, vy: -2, grounded: false, down: false, hInput: 1,
  now: 100, recatchUntil: 0,
};
{
  const caught = traversalLedgeProbe(ledgeState, gridGeometry([[2, 2]]));
  ok(!!caught && caught.side === 1 && caught.cellX === 2 && caught.topY === 3 &&
     Math.abs(caught.snapX - 1.649) < 1e-9 && Math.abs(caught.snapY - 1.58) < 1e-9,
     'ledge probe catches a falling right-side near miss and returns its snap');
  const left = traversalLedgeProbe(
    { ...ledgeState, x: 2.4, vx: -3, hInput: -1 },
    gridGeometry([[1, 2]])
  );
  ok(!!left && left.side === -1 && left.cellX === 1,
     'ledge probe mirrors correctly for a left-side catch');
}
{
  const deadEndState = {
    x: 57.5, y: 5.58, hw: PL.width / 2, h: PL.height,
    vx: -3, vy: -2, grounded: false, down: false, hInput: -1,
    now: 100, recatchUntil: 0,
  };
  const deadEndCells = new Set(Array.from({ length: 6 }, function (_, i) {
    return '56,' + (i + 1);
  }));
  const baseGeometry = {
    isSolid: function (i, j) { return deadEndCells.has(i + ',' + j); },
    minCellX: 0,
    maxCellX: CONFIG.levelLength,
    minPlayerX: -Infinity,
  };
  const otherwiseCatchable = traversalLedgeProbe(deadEndState, baseGeometry);
  const authoredGeometry = {
    ...baseGeometry,
    allowsGrab: function () { return false; },
  };
  ok(!!otherwiseCatchable && otherwiseCatchable.cellX === 56 &&
     traversalLedgeProbe(deadEndState, authoredGeometry) === null,
     'non-grabbable dare wall rejects its top ledge catch as well as wall adhesion');
}
{
  const rejected = [
    { grounded: true },
    { vy: 0 },
    { down: true },
    { now: 100, recatchUntil: 101 },
    { hInput: 0, vx: 0 },
  ].every(function (patch) {
    return traversalLedgeProbe({ ...ledgeState, ...patch }, gridGeometry([[2, 2]])) === null;
  });
  ok(rejected, 'ledge probe rejects grounded, rising, releasing, recatch, and no-intent states');
  ok(traversalLedgeProbe(ledgeState, gridGeometry([])) === null &&
     traversalLedgeProbe(ledgeState, gridGeometry([[2, 2], [2, 3]])) === null &&
     traversalLedgeProbe(ledgeState, gridGeometry([[2, 2], [1, 2]])) === null,
     'ledge probe rejects missing ledges, blocked tops, and blocked hanging bodies');
}
{
  const base = {
    down: false, jumpBuffered: false, now: 100, until: 500,
    side: 1, entryVx: 3,
  };
  const hang = traversalLedgeDecision(base, TP);
  const down = traversalLedgeDecision({ ...base, down: true }, TP);
  const expired = traversalLedgeDecision({ ...base, now: 500 }, TP);
  ok(hang.kind === 'hang' && hang.vx === 0 && hang.vy === 0,
     'ledge decision holds only inside its short hang window');
  ok(down.kind === 'release' && expired.kind === 'release' &&
     down.recatchUntil === base.now + TP.traversalRecatchMs &&
     expired.recatchUntil === 500 + TP.traversalRecatchMs,
     'down and timeout release a ledge with recatch protection');
  const launch = traversalLedgeDecision({
    ...base, side: -1, entryVx: 8, jumpBuffered: true,
  }, TP);
  ok(launch.kind === 'launch' && launch.vx === -TP.ledgeLaunchX &&
     launch.vy === TP.ledgeLaunchY &&
     launch.recatchUntil === base.now + TP.traversalRecatchMs,
     'ledge jump applies its responsive minimum and launches upward along the side');
  ok(traversalLedgeDecision({ ...base, down: true, jumpBuffered: true }, TP).kind === 'release',
     'ledge release takes priority over a simultaneous buffered jump');
}
{
  const wallGeometry = gridGeometry([[3, 1]]);
  const base = {
    side: 1, cellX: 3, y: 1.2, h: PL.height, vy: -10,
    grounded: false, down: false, hInput: 1, jumpBuffered: false,
    now: 100, until: 500,
  };
  const slide = traversalWallDecision(base, wallGeometry, TP);
  const slowSlide = traversalWallDecision({ ...base, vy: -2 }, wallGeometry, TP);
  ok(slide.kind === 'slide' && slide.vx === 0 && slide.vy === -TP.wallSlideSpeed &&
     slowSlide.kind === 'slide' && slowSlide.vy === -2,
     'wall slide caps fast falls without accelerating a slower descent');

  const jump = traversalWallDecision({ ...base, jumpBuffered: true }, wallGeometry, TP);
  const leftJump = traversalWallDecision(
    { ...base, side: -1, cellX: 1, hInput: -1, jumpBuffered: true },
    gridGeometry([[1, 1]]),
    TP
  );
  ok(jump.kind === 'jump' && jump.vx === -TP.wallJumpX && jump.vy === TP.wallJumpY &&
     leftJump.kind === 'jump' && leftJump.vx === TP.wallJumpX && leftJump.vy === TP.wallJumpY,
     'wall jumps launch upward and away from either wall');
  ok(jump.recatchUntil === base.now + TP.traversalRecatchMs &&
     leftJump.recatchUntil === base.now + TP.traversalRecatchMs,
     'wall jumps apply recatch protection');

  const releases = [
    [base, gridGeometry([])],
    [{ ...base, grounded: true }, wallGeometry],
    [{ ...base, down: true }, wallGeometry],
    [{ ...base, hInput: -1 }, wallGeometry],
    [{ ...base, now: 500 }, wallGeometry],
    [{ ...base, side: 0 }, wallGeometry],
  ].map(function (pair) {
    return traversalWallDecision(pair[0], pair[1], TP);
  });
  ok(releases.every(function (r) {
    return r.kind === 'release' && Number.isFinite(r.recatchUntil);
  }), 'wall decision releases on no wall, landing, down, away input, timeout, or no side');
}

/* ======================= world transitions (slice) ====================== *
 * The opt-in ?slice=transform demo: an outer face, a flip inward through an
 * opening onto an inner passage that CLIMBS, then a breach back out onto an
 * outer face 36 tiles higher.
 *
 * The governing rule, and what most of these assertions defend: the body is
 * ONE STATIC MASS. Nothing assembles, slams or rotates into place — the path
 * is baked with its bends and its altitude profile, and a transition is the
 * VIEW swinging through a bend on the corner ritual's detent curve while RIG
 * runs the chamfer. So the checks below pin the path (continuity, unit
 * spacing, exact turns, a walkable grade), the view curve (exact detents,
 * dead-flat holds), the covers (the only moving parts) and every apron.    */
const XF = TRANSFORM_FIXTURE, XT = CONFIG.transform;
const XP = TRANSFORM_PATH;
const XTL = transformTimeline(CONFIG);
const XB = XF.bounds;

// --- the body: one static path -----------------------------------------
{
  let valid = XF.bands[0].s0 === XB.x0 &&
    XF.bands[XF.bands.length - 1].s1 === XB.x1;
  for (let i = 1; i < XF.bands.length; i++)
    if (XF.bands[i - 1].s1 !== XF.bands[i].s0) valid = false;
  ok(valid, 'stretches tile the fixture bounds contiguously');
  ok(XF.bands.map((b) => b.kind).join('>') === 'exterior>interior>exterior',
     'the run goes outside → inside → outside, got ' + XF.bands.map((b) => b.kind).join('>'));
  ok(JSON.stringify(buildTransformPath(XF, CONFIG)) === JSON.stringify(XP),
     'the path is a pure function of the fixture');
  ok(XP.segs.length === 1 + 2 * XF.events.length,
     'two bends per turn, got ' + XP.segs.length + ' segments');
}
{
  // Position is continuous everywhere (a bend is a chamfer, not a jump) and a
  // unit of s is a unit of world inside a stretch: the ribbon is never
  // stretched by the body it is drawn on.
  let bad = 0, cont = true;
  for (let s = XB.x0; s < XB.x1; s++) {
    const a = transformPathAt(XP, s), b = transformPathAt(XP, s + 1);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 1 + 1e-9 || d < Math.cos(XT.snapDeg * DEG / 2) - 1e-6) bad++;
  }
  for (const g of XP.segs) {
    const a = transformPathAt(XP, g.s0 - 1e-7), b = transformPathAt(XP, g.s0 + 1e-7);
    if (Math.hypot(a.x - b.x, a.z - b.z) > 1e-5) cont = false;
  }
  ok(bad === 0, 'every unit step along the body stays a unit step (no stretch)');
  ok(cont, 'the path is continuous through every bend');
}
{
  // Each turn is exactly two detents of snapDeg, and the heading a stretch
  // rests at is what the view rests at — so the animated yaw and the baked
  // geometry can never disagree about where "around the bend" is.
  let turns = true;
  for (let i = 0; i < XF.events.length; i++) {
    const ev = XF.events[i];
    const before = transformHeadingAt(XP, ev.seamS - XT.chamferTiles);
    const after = transformHeadingAt(XP, ev.seamS + XT.chamferTiles);
    if (Math.abs((after - before) / DEG - 2 * XT.snapDeg) > 1e-9) turns = false;
    if (Math.abs(before - transformBandHeading(XF, ev.fromBand, CONFIG)) > 1e-9) turns = false;
    if (Math.abs(after - transformBandHeading(XF, ev.toBand, CONFIG)) > 1e-9) turns = false;
  }
  ok(turns, 'every turn is two snapDeg detents, and stretch headings match the view rest angles');
  ok(Math.abs(transformYawDeltaDeg(XTL.t4, CONFIG) - 2 * XT.snapDeg) < 1e-9,
     'the animated view delta lands exactly on the geometric turn');
}
{
  // The climb is geometry, not an event: monotone, gained inside the body, and
  // at a grade RIG can plausibly run up.
  const P = XP.profile;
  let monotone = true, maxGrade = 0;
  for (let i = 1; i < P.length; i++) {
    if (P[i].alt < P[i - 1].alt - 1e-9 || P[i].s <= P[i - 1].s) monotone = false;
    maxGrade = Math.max(maxGrade, (P[i].alt - P[i - 1].alt) / (P[i].s - P[i - 1].s));
  }
  const total = P[P.length - 1].alt - P[0].alt;
  const screenH = 2 * CC.z * Math.tan(CC.fov / 2 * DEG);
  // The rendered grade is only half the climb: the passage decks step up too, so
  // RIG gains altitude with their legs as well as along the ramp. Both halves
  // together have to clear a screen height, and the ramp alone has to stay at a
  // slope a side-on view can still read.
  const deckClimb = XF.groundRuns.filter((r) => !r.gap)
    .reduce((m, r) => Math.max(m, r.y), 0) - XF.run.playerSpawn.y;
  ok(monotone, 'the altitude profile only ever climbs');
  ok(total + deckClimb > screenH,
     'the run climbs more than a screen height (' + total + ' rendered + ' +
     deckClimb + ' jumped)');
  ok(deckClimb >= 4, 'a real part of the climb is jumped, got ' + deckClimb + ' tiles of deck');
  ok(maxGrade > 0.2 && maxGrade <= 0.45,
     'the grade stays readable side-on, got ' + maxGrade.toFixed(2) + ' tiles per tile');
  const seam1 = XF.events[0].seamS, seam2 = XF.events[1].seamS;
  ok(transformAltAt(XP, XB.x0) === 0 && transformAltAt(XP, seam1 - XT.chamferTiles) === 0,
     'the outer face is flat: nothing is climbed before the way in');
  ok(transformAltAt(XP, seam2 + XT.chamferTiles) === total &&
     transformAltAt(XP, XB.x1 - 1) === total,
     'the high face is flat: the climb finished when RIG came back out');
  const inside = transformAltAt(XP, seam2 - XT.chamferTiles) - transformAltAt(XP, seam1);
  ok(inside > total * 0.8,
     'the body is climbed from the inside (' + inside.toFixed(1) + ' of ' + total + ' tiles)');
  // and RIG is the thing that gains it: at run speed the climb takes seconds
  const climbSeconds = (seam2 - seam1) / PL.runSpeed;
  ok(climbSeconds > 3, 'the ascent is run, not cut: ' + climbSeconds.toFixed(1) + ' s of climbing');
}
{
  const A = XF.bands[0], C = XF.bands[2];
  const deckC = transformAltAt(XP, C.s0 + 6) +
    XF.groundRuns.find((r) => r.x0 === C.s0).y;
  const eyeA = CC.y;
  ok(A.skyline.length >= 2 && C.skyline.length >= 2,
     'both outer faces carry background silhouettes');
  ok(A.skyline.some((sk) => sk.top > eyeA + 6),
     'low-face silhouettes rise well above the camera eye');
  ok(C.skyline.every((sk) => sk.top < deckC - 5),
     'the same silhouettes sit below the high deck, not above it');
  let framed = true;
  for (const sk of C.skyline) {
    const dist = CC.z - sk.depth;
    const frameBottom = transformAltAt(XP, sk.atS) + CC.lookY - Math.tan(CC.fov / 2 * DEG) * dist;
    if (!(sk.top > frameBottom + 2 && sk.top < deckC - 5)) framed = false;
  }
  ok(framed, 'every below-deck silhouette is in frame under the deck, not off-screen');
  ok(A.hullWall.pattern === 'solid' && C.hullWall.pattern === 'towers',
     'the body encloses RIG low down and opens into towers high up');
  const screenH = 2 * CC.z * Math.tan(CC.fov / 2 * DEG);
  ok(!!C.weather && !A.weather && C.weather.count > 100 &&
     C.weather.speed > 10 && C.weather.spanY >= screenH,
     'only the high face runs weather, and it spans the whole view');
  ok(A.hullDrop > 12 && C.hullDrop > A.hullDrop,
     'the high face hangs a longer wall into the fog than the low one');
}
{
  // Nothing arrives: the assembly curve still exists, but it is reserved for
  // hostile constructs and no transition parameter references it.
  ok(!!XT.assembly && XT.assembly.chunks > 0,
     'the assembly choreography is retained for later hostile constructs');
  const transitionKeys = Object.keys(XT).filter((k) => k !== 'assembly');
  ok(transitionKeys.every((k) => !/slam|assemble/i.test(k)),
     'no transition constant drives an assembly, got ' + transitionKeys.join(','));
  const slam = bandSlamOffset(XT.assembly.startMs + XT.assembly.dropMs + XT.assembly.dipMs + 1,
                              0, CONFIG);
  ok(slam.phase === 'locked' && slam.dy === 0,
     'the reserved assembly curve still settles to its base');
}

// --- ritual timeline ---------------------------------------------------
{
  const total = transformEventTotalMs(CONFIG);
  ok(total === 990, 'transformation ritual total 990 ms, got ' + total);
  ok(total >= 800 && total <= 1200, 'ritual stays inside the 0.8-1.2 s transformation budget');
  ok(XTL.t1 === 90 && XTL.t2 === 250 && XTL.t3 === 550 && XTL.t4 === 690 && XTL.t5 === 810,
     'timeline beats at 90/250/550/690/810, got ' +
     [XTL.t1, XTL.t2, XTL.t3, XTL.t4, XTL.t5].join('/'));
}
near(transformYawDeltaDeg(0, CONFIG), 0, 1e-9, 'ritual yaw 0 at t=0');
near(transformYawDeltaDeg(-50, CONFIG), 0, 1e-9, 'ritual yaw 0 before the event');
near(transformYawDeltaDeg(XTL.t1 - 0.001, CONFIG), XT.windUpDeg, 0.01,
     'wind-up reaches the counter-rotation blink');
near(transformYawDeltaDeg(XTL.t2, CONFIG), XT.snapDeg, 1e-9, 'snap 1 lands exactly 45');
near(transformYawDeltaDeg(400, CONFIG), XT.snapDeg, 1e-9, 'ratchet hold flat at 45');
near(transformYawDeltaDeg(XTL.t4, CONFIG), 2 * XT.snapDeg, 1e-9, 'snap 2 lands exactly 90');
near(transformYawDeltaDeg(99999, CONFIG), 2 * XT.snapDeg, 1e-9, 'yaw clamped after the ritual');
{
  let flat = true;
  for (let t = XTL.t2; t <= XTL.t3; t += 1)
    if (transformYawDeltaDeg(t, CONFIG) !== XT.snapDeg) flat = false;
  for (let t = XTL.t4; t <= XTL.t6; t += 1)
    if (transformYawDeltaDeg(t, CONFIG) !== 2 * XT.snapDeg) flat = false;
  ok(flat, 'ritual holds are dead flat (clack … clack, no wobble)');
  let peak1 = 0, peak2 = 0, dip = 0;
  for (let t = XTL.t1; t <= XTL.t2; t += 0.25) peak1 = Math.max(peak1, transformYawDeltaDeg(t, CONFIG));
  for (let t = XTL.t3; t <= XTL.t4; t += 0.25) peak2 = Math.max(peak2, transformYawDeltaDeg(t, CONFIG));
  for (let t = 0; t <= XTL.t1; t += 0.25) dip = Math.min(dip, transformYawDeltaDeg(t, CONFIG));
  ok(peak1 > XT.snapDeg && peak1 < XT.snapDeg * 1.06, 'snap 1 overshoots once, peak ' + peak1);
  ok(peak2 > 2 * XT.snapDeg && peak2 < 2 * XT.snapDeg * 1.04, 'snap 2 overshoots once, peak ' + peak2);
  near(dip, XT.windUpDeg, 0.05, 'wind-up dips to windUpDeg');
}
{
  const sp = XF.run.minimumScrollSpeed;
  ok(transformScrollVel(0, sp, CONFIG) === 0 && transformScrollVel(XTL.t5 - 0.1, sp, CONFIG) === 0,
     'scroll speed frozen until the settle ends');
  // the seam pull: the view travels the chamfer from the FIRST detent onward, so
  // the bend comes to the player instead of the world assembling at a distance
  ok(transformScrollOffset(0, sp, CONFIG) === 0 &&
     transformScrollOffset(XTL.t2, sp, CONFIG) === 0,
     'the view holds still through the wind-up and into the first detent');
  ok(transformSeamPull(XTL.t3, CONFIG) > XT.seamPullTiles * 0.4,
     'the bend is already coming to the player during the ratchet hold');
  near(transformSeamPull(XTL.t5, CONFIG), XT.seamPullTiles, 1e-9,
       'the seam pull completes exactly as the settle ends');
  ok(XT.seamPullTiles > XT.haltOffset,
     'the pull carries the view past the seam it halted before (' + XT.seamPullTiles +
     ' > ' + XT.haltOffset + ')');
  let monotone = true, prev = -1;
  for (let t = 0; t <= XTL.t6; t += 5) {
    const v = transformScrollOffset(t, sp, CONFIG);
    if (v < prev - 1e-12) monotone = false;
    prev = v;
  }
  ok(monotone, 'the ritual never scrolls the world backwards');
  const endOffset = transformScrollOffset(XTL.t6, sp, CONFIG);
  near(endOffset, XT.seamPullTiles + sp * (XT.resumeMs / 1000) / 3, 1e-9,
       'the resume ramp adds exactly its closed-form distance');
  const d = (transformScrollOffset(XTL.t6, sp, CONFIG) -
             transformScrollOffset(XTL.t6 - 1, sp, CONFIG)) * 1000;
  near(d, sp, 0.02, 'the ritual hands back to ordinary scrolling at full speed');
  near(transformScrollVel(XTL.t5 + XT.resumeMs / 2, sp, CONFIG), sp * 0.25, 1e-9,
       'quadratic ease at the resume midpoint');
  near(transformScrollVel(XTL.t6, sp, CONFIG), sp, 1e-9, 'full fixture speed at the ritual end');
  near(transformScrollVel(9999, sp, CONFIG), sp, 1e-9, 'scroll clamped to full speed after');
}
{
  /* --- covers: mechanisms with hinges, not anatomy — and never debris ---
   * The CP3 v3 grammar (decisions.md entry 3; greybox proposal G2/G4): the
   * flip plate swings, clacks with the camera's detents, and RELOCKS flush
   * during the hold; the vent cover is blown to its stop and caught ON the
   * detent. Both persist forever — a cover that vanished or tumbled apart
   * would be assembly played backwards.                                  */
  const XC = XT.cover;
  const flipEv = XF.events[0], breachEv = XF.events[1];

  // The pure state exposes exactly a hinged mechanism: swing + latch + seat.
  // No blow distance, no spin — the disintegrating-cover API is gone.
  const shape = Object.keys(transformPanelState(500, breachEv, CONFIG)).sort().join();
  ok(shape === 'jolt,open,seated,visible',
     'cover state is hinge-swing only (no blow/spin fields), got ' + shape);

  // Arm phase: latch throw, one heavy swing to ajar, then dead still.
  ok(transformCoverAjar(0, CONFIG) === 0 &&
     transformCoverAjar(XC.unlatchMs, CONFIG) === 0,
     'the plate holds shut through the latch throw');
  near(transformCoverAjar(XC.unlatchMs + XC.ajarMs, CONFIG), XC.ajarFrac, 1e-9,
       'the arm swing lands exactly at ajar');
  near(transformCoverAjar(1e9, CONFIG), XC.ajarFrac, 1e-9,
       'and holds there: ajar is a rest state, not a drift');
  {
    let peak = 0;
    for (let t = 0; t <= XC.unlatchMs + XC.ajarMs; t += 2)
      peak = Math.max(peak, transformCoverAjar(t, CONFIG));
    ok(peak > XC.ajarFrac && peak < XC.ajarFrac * 1.1,
       'the arm swing overshoots once and settles, peak ' + peak.toFixed(3));
  }
  ok(XC.ajarFrac >= 0.75 && XC.ajarFrac < 0.9,
     'ajar clears the combat lane and still visibly owes the relock');
  // Even a full sprint from the arming lookahead cannot outrun the swing, so
  // a ritual never fires against a half-open plate.
  const sprintMs = (XT.armLookahead + XT.triggerOffset) / PL.runSpeed * 1000;
  ok(sprintMs > XC.unlatchMs + XC.ajarMs,
     'the arm window outlasts the swing at a sprint (' + sprintMs.toFixed(0) +
     ' > ' + (XC.unlatchMs + XC.ajarMs) + ' ms)');

  // Flip ritual: ajar → clacks with snap 1 → relocks during the hold →
  // seated flush forever (G2: snap 1 exposes and carries the plate, the hold
  // rotates and relocks only the plate, snap 2 commits only the camera).
  const f0 = transformPanelState(0, flipEv, CONFIG);
  near(f0.open, XC.ajarFrac, 1e-9,
       'the ritual takes the plate exactly where the arm swing left it');
  ok(!f0.seated && f0.visible, 'ajar is not seated, and the plate is in the world');
  {
    let flat = true;
    for (let t = 0; t <= XTL.t1; t += 1)
      if (transformPanelState(t, flipEv, CONFIG).open !== XC.ajarFrac) flat = false;
    ok(flat, 'the plate waits out the wind-up: its next beat is the camera detent');
  }
  near(transformPanelState(XTL.t2, flipEv, CONFIG).open, XC.snapFrac, 1e-9,
       'snap 1 carries the plate to snapFrac — it clacks with the view');
  const seatT = XTL.t2 + XC.relockMs;
  ok(XC.relockMs < XT.holdMs,
     'the relock finishes inside the ratchet hold, before snap 2');
  ok(transformPanelState(seatT - 1, flipEv, CONFIG).seated === false &&
     transformPanelState(seatT, flipEv, CONFIG).seated === true,
     'the seat clack lands at t2+relockMs exactly');
  {
    // Monotone up to the snap's own settle: easeOutBack overshoots by design,
    // and that settle is bounded by the overshoot of the yaw curve it rhymes
    // with — anything larger would read as the plate bouncing.
    const settle = (XC.snapFrac - XC.ajarFrac) * 0.06;
    let mono = true, prev = -1;
    for (let t = 0; t <= XTL.t6; t += 1) {
      const v = transformPanelState(t, flipEv, CONFIG).open;
      if (v < prev - settle) mono = false;
      prev = v;
    }
    ok(mono, 'the plate never swings backwards beyond its own snap settle');
  }
  for (const t of [seatT, XTL.t3, XTL.t4, XTL.t6, 1e9]) {
    const st = transformPanelState(t, flipEv, CONFIG);
    ok(st.open === 1 && st.seated && st.visible,
       'relocked flush and STAYS at t=' + t + ': nothing pops out of the world');
  }

  // Breach ritual: shut and straining, blown to the stop across snap 1 — one
  // overswing, caught ON the detent — then dead still, hanging, forever.
  const b0 = transformPanelState(0, breachEv, CONFIG);
  ok(b0.open === 0 && b0.visible, 'the vent cover starts shut');
  {
    let shut = true;
    for (let t = 0; t <= XTL.t1; t += 1)
      if (transformPanelState(t, breachEv, CONFIG).open !== 0) shut = false;
    ok(shut, 'the vent cover only strains through the wind-up — the blow is on the detent');
    near(transformPanelState(XTL.t1 - 0.001, breachEv, CONFIG).jolt, XT.panelJoltTiles, 0.01,
         'the strain jolt peaks as the wind-up ends');
  }
  {
    let bpeak = 0;
    for (let t = XTL.t1; t <= XTL.t2; t += 0.5)
      bpeak = Math.max(bpeak, transformPanelState(t, breachEv, CONFIG).open);
    ok(bpeak > 1.1 && bpeak < 1.5,
       'the cover is blown past its stop once and caught, peak ' + bpeak.toFixed(2));
  }
  near(transformPanelState(XTL.t2, breachEv, CONFIG).open, 1, 1e-9,
       'caught ON the first detent: the blow and the view clack together');
  for (const t of [XTL.t3, XTL.t4, XTL.t6, 1e9]) {
    const st = transformPanelState(t, breachEv, CONFIG);
    ok(st.open === 1 && !st.seated && st.visible,
       'the vent cover hangs on its caught stop at t=' + t + ' — no tumble, no vanish');
  }
}
{
  // --- vapor: the atmosphere is what moves, and it clears before commit ---
  near(transformVapor(XTL.t1, CONFIG).density, 0, 1e-9, 'no vapor before the blow');
  near(transformVapor(XTL.t2, CONFIG).density, 1, 1e-9, 'the burst peaks ON the first detent');
  near(transformVapor(XTL.t4, CONFIG).density, 0, 1e-9,
       'the sightline is fully clear when snap 2 commits the camera (G4)');
  near(transformVapor(1e9, CONFIG).density, 0, 1e-9, 'and stays clear');
  {
    let rise = true, fall = true, prev = -1;
    for (let t = XTL.t1; t <= XTL.t2; t += 1) {
      const v = transformVapor(t, CONFIG).density;
      if (v < prev - 1e-12) rise = false;
      prev = v;
    }
    prev = 2;
    for (let t = XTL.t2; t <= XTL.t4; t += 1) {
      const v = transformVapor(t, CONFIG).density;
      if (v > prev + 1e-12) fall = false;
      prev = v;
    }
    ok(rise && fall, 'vapor rises to the detent and only clears after it');
    let reachMono = true;
    prev = -1;
    for (let t = 0; t <= XTL.t6; t += 1) {
      const v = transformVapor(t, CONFIG).reach;
      if (v < prev - 1e-12) reachMono = false;
      prev = v;
    }
    ok(reachMono && transformVapor(XTL.t4, CONFIG).reach === 1,
       'the burst travels outward monotonically and has fully left by commit');
  }
}
{
  // --- the ritual grants no altitude: the climb is run, not snapped ------
  for (const ev of XF.events) {
    const gained = transformAltAt(XP, ev.seamS + XT.chamferTiles) -
                   transformAltAt(XP, ev.seamS - XT.chamferTiles);
    ok(gained <= 2 * XT.chamferTiles * 0.45 + 1e-9,
       ev.id + ' grants at most a stride of altitude across its chamfer, got ' +
       gained.toFixed(2));
  }
}
{
  // --- static guards: the rework is render-only by construction ----------
  // No sim module can see the cover/vapor choreography, so no gameplay
  // decision can depend on it: the sim-equivalence claim in one grep, the
  // same style of proof the G1 limb bake uses.
  for (const file of layerFiles('sim')) {
    const src = stripComments(readFileSync(file, 'utf8'));
    ok(!/transformPanelState|transformVapor|transformCoverAjar/.test(src),
       file.split('/').pop() + ' never reads the cover choreography');
  }
  // …and the transition render can never call the retired assembly curves
  // or grow a debris system back.
  const rsrc = stripComments(readFileSync(join(srcDir, 'render', 'transform.js'), 'utf8'));
  ok(!/bandSlamOffset|zipperOffset/.test(rsrc),
     'src/render/transform.js never calls assembly choreography');
  ok(!/debris|tumbl/i.test(rsrc),
     'no debris system in the transition render: covers stay whole');
}
near(transformAtmosphereMix(XTL.t1, CONFIG), 0, 1e-9, 'atmosphere starts at the first snap');
near(transformAtmosphereMix(XTL.t4, CONFIG), 1, 1e-9, 'atmosphere completes when the surface does');
near(transformAtmosphereMix(9999, CONFIG), 1, 1e-9, 'atmosphere mix clamped');
// --- fixture / apron validity ------------------------------------------
const XL = buildTransformLevel(CONFIG);
{
  // Interior threat sockets: mounts the combat roster will fill later. They are
  // asserted like any other authored geometry so the corridor cannot drift into
  // a state where a later polyp lands inside a wall or on a seam apron.
  const IB = XF.bands[1];
  const sockets = IB.threatSockets || [];
  const ids = new Set();
  let valid = true;
  for (const so of sockets) {
    if (typeof so.id !== 'string' || ids.has(so.id) ||
        !['polyp', 'hazard'].includes(so.kind) ||
        so.x < IB.s0 + XT.thresholdTiles || so.x >= IB.s1 ||
        !Number.isFinite(so.y) || so.depth > -1) valid = false;
    ids.add(so.id);
    if (levelSolidCell(XL, Math.floor(so.x), Math.floor(so.y), 8)) valid = false;
    for (const ev of XF.events)
      if (so.x >= ev.seamS - 5 && so.x < ev.seamS + XT.thresholdTiles) valid = false;
  }
  ok(sockets.length >= 3 && valid && ids.size === sockets.length,
     'interior threat sockets are unique, open, behind the plane and clear of the aprons');
  ok(sockets.some((so) => so.kind === 'polyp') && sockets.some((so) => so.kind === 'hazard'),
     'the interior declares both an emplacement and a hazard socket for the roster pass');
}
{
  const XL2 = buildTransformLevel(CONFIG);
  const fixtureBefore2 = JSON.stringify(XF);
  const configBefore2 = JSON.stringify(CONFIG);
  ok(JSON.stringify(XL) === JSON.stringify(XL2), 'transformation fixture builds deterministically');
  ok(JSON.stringify(XF) === fixtureBefore2 && JSON.stringify(CONFIG) === configBefore2,
     'transformation build mutates neither the fixture nor CONFIG');
  ok(XL.groundH !== XL2.groundH && XL.platforms !== XL2.platforms && XL.fixture === XF,
     'transformation builds return fresh geometry and reference their fixture');
  let outsideMatches = true;
  for (let i = 0; i < CONFIG.levelLength; i++)
    if ((i < XB.x0 || i >= XB.x1) && XL.groundH[i] !== gH[i]) outsideMatches = false;
  ok(outsideMatches, 'the seeded layout outside the fixture bounds is untouched');
}
{
  let valid = true;
  const covered = new Set();
  for (const run of XF.groundRuns) {
    if (!Number.isInteger(run.x0) || !Number.isInteger(run.x1) || run.x0 >= run.x1 ||
        run.x0 < XB.x0 || run.x1 > XB.x1 ||
        (!run.gap && !Number.isFinite(run.y))) valid = false;
    for (let x = run.x0; x < run.x1; x++) {
      if (covered.has(x)) valid = false;
      if (XL.groundH[x] !== (run.gap ? GAP : run.y)) valid = false;
      covered.add(x);
    }
  }
  ok(valid && covered.size === XB.x1 - XB.x0,
     'authored surfaces cover the fixture bounds once and match the built heights');
}
{
  // Seam aprons: flat, solid, platform-free staging ground through the whole
  // threshold. A ritual must never fire over a gap or a step.
  let clean = true;
  for (const ev of XF.events) {
    const a = ev.seamS - 5, b = ev.seamS + XT.thresholdTiles;
    const h = XL.groundH[a];
    for (let s = a; s < b; s++) if (XL.groundH[s] !== h) clean = false;
    for (const p of XF.platforms) if (p.x1 > a && p.x0 < b) clean = false;
  }
  ok(clean, 'every seam apron is flat, solid and platform-free through its threshold');
}
{
  let ordered = true;
  for (const ev of XF.events) {
    const halt = transformHaltS(ev, CONFIG);
    const trig = transformTriggerS(ev, CONFIG);
    const front = transformFrontierS(ev, CONFIG);
    const seal = transformSealS(ev, CONFIG);
    if (!(halt < ev.seamS && ev.seamS < trig && trig < front &&
          front < ev.seamS + XT.thresholdTiles && seal < trig && seal > ev.seamS)) ordered = false;
    if (ev.seamS - halt !== XT.haltOffset) ordered = false;
    if (XF.bands[ev.toBand].s0 !== ev.seamS || XF.bands[ev.fromBand].s1 !== ev.seamS) ordered = false;
  }
  ok(ordered,
     'gate geometry orders halt < seam < seal < trigger < frontier < threshold end');
  // The trigger is past the seam ON PURPOSE: the new surface only renders from
  // the seam onward, so RIG must be standing on it when the world commits.
  ok(XF.events.every((ev) => transformTriggerS(ev, CONFIG) - PL.width / 2 >= ev.seamS),
     'RIG is wholly past the seam before a ritual can fire');
  // and the seam has to be on screen while the scroll waits at the apron
  const halfW = CC.z * Math.tan(CC.fov / 2 * DEG) * (16 / 9);
  ok(XT.haltOffset + XT.thresholdTiles < halfW + CC.x,
     'the whole threshold is visible from the apron halt at 16:9');
  ok(XT.armLookahead > 0 && XT.armLookahead < XT.haltOffset &&
     XT.pressedOffset > 0 && XT.pressedOffset < XT.haltOffset,
     'the arming lookahead and the squeeze cap both stay inside the apron');
  ok(XT.pressedOffset + XT.thresholdTiles < halfW + CC.x,
     'even a squeezed dawdler sees the whole ritual on screen');
}
{
  const ids = new Set();
  let valid = true, reachable = true;
  for (const p of XF.platforms) {
    if (typeof p.id !== 'string' || ids.has(p.id) || p.x0 >= p.x1 ||
        p.x0 < XB.x0 || p.x1 > XB.x1 || !Number.isFinite(p.y)) valid = false;
    ids.add(p.id);
    let best = -999;
    for (let k = p.x0 - 1; k <= p.x1 + 1; k++)
      if (XL.groundH[k] > -100) best = Math.max(best, XL.groundH[k]);
    for (const q of XF.platforms)
      if (q !== p && q.y < p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1) best = Math.max(best, q.y);
    if (p.y - best > GG.maxReach) reachable = false;
  }
  ok(valid && ids.size === XF.platforms.length,
     'authored catwalks have unique ids and in-bounds spans');
  ok(reachable, 'every authored catwalk is within double-jump reach of a lower surface');
}
{
  // The slice deliberately keeps the FROZEN normal-run controller (DESIGN:
  // the same 2D controls throughout), so its layout must be legal for it.
  ok(XF.movement === undefined,
     'the transformation fixture overrides no movement constant');
  let widest = 0, badLanding = 0;
  let i = XB.x0;
  while (i < XB.x1) {
    if (XL.groundH[i] > -100) { i++; continue; }
    const start = i;
    while (i < XB.x1 && XL.groundH[i] < -100) i++;
    widest = Math.max(widest, i - start);
    let solid = 0;
    while (i + solid < XB.x1 && XL.groundH[i + solid] > -100) solid++;
    if (solid < GG.landingMin) badLanding++;
    if (Math.abs(XL.groundH[start - 1] - XL.groundH[i]) > 1) badLanding++;
  }
  ok(widest > 0 && widest <= GG.gapMax, 'fixture gaps stay inside the jumpable band, widest ' + widest);
  ok(badLanding === 0, 'every fixture gap has a legal landing strip after it');
  const tUp = PL.jumpVel / -PL.gravity;
  const tDown = Math.sqrt(2 * (PL.jumpVel ** 2 / (2 * -PL.gravity)) / (-PL.gravity * PL.fallGravityMult));
  ok((tUp + tDown) * PL.runSpeed > widest + 1.5,
     'the frozen jump clears the fixture widest gap with margin');
  const IN = XF.bands[1].interior;
  ok(IN.ceilingAbove > PL.height + PL.jumpVel ** 2 / (2 * -PL.gravity) + 1,
     'the interior ceiling clears a full jump, so the corridor never traps RIG');
  ok(XF.platforms.filter((p) => p.x0 >= XF.bands[1].s0 && p.x1 <= XF.bands[1].s1)
       .every((p) => p.y + PL.height + 0.5 < XL.groundH[Math.floor(p.x0)] + IN.ceilingAbove),
     'interior catwalks keep player headroom under the ceiling');
}
{
  let sorted = true, clear = true, typed = true;
  for (let i = 0; i < XF.spawns.length; i++) {
    const e = XF.spawns[i];
    if (i > 0 && e.x <= XF.spawns[i - 1].x) sorted = false;
    if (e.x < XB.x0 || e.x >= XB.x1) clear = false;
    if (e.type !== 'wasp' || !Number.isFinite(e.lane)) typed = false;
    for (const ev of XF.events)
      if (e.x >= ev.seamS - XF.spawnClear.before && e.x <= ev.seamS + XF.spawnClear.after) clear = false;
  }
  ok(sorted, 'the fixture ambient table is strictly ascending');
  ok(clear, 'no ambient spawn sits in a seam-clear zone');
  ok(typed, 'fixture spawns are authored wasps with authored lanes');
  ok(XF.spawns.length >= 4 && XF.spawns.length <= 8,
     'the ecology stays simple: this slice proves the transformation, got ' + XF.spawns.length);
}
{
  const run = XF.run;
  const halfWide = CC.z * Math.tan(CC.fov / 2 * DEG) * (16 / 9);
  ok(run.startScroll + CC.x - halfWide >= XB.x0,
     'the opening frame is filled by authored hull, not void off the left edge');
  ok(run.endScroll < XF.finish.x0 && XF.finish.x1 <= XB.x1 &&
     XF.finish.x0 > XF.events[1].seamS + 20,
     'the run window ends on the far exterior face, past the breach');
  ok(run.minimumScrollSpeed > 0 && run.minimumScrollSpeed < PL.runSpeed,
     'RIG can outrun the pursuing edge in the fixture');
  const sprint = (XF.finish.x0 - run.playerSpawn.x) / PL.runSpeed +
    2 * transformEventTotalMs(CONFIG) / 1000;
  ok(sprint >= XF.targetPlaySeconds.min && sprint <= XF.targetPlaySeconds.max,
     'an uninterrupted run plus both rituals fits the fixture target, got ' + sprint.toFixed(1) + ' s');
  ok(XL.groundH[Math.floor(run.playerSpawn.x)] <= run.playerSpawn.y,
     'the spawn point stands on authored ground');
}

/* ================ G2 — neck access-plate flip gate (?g2=1) ============== *
 * The monster-g2-neck-flip fixture: the greybox proposal's §G2 gate built on
 * the transform-slice machinery with T-001's landed flip choreography reused
 * verbatim. These assertions defend, in order: the opt-in selection wiring
 * (every shipped URL keeps v1 byte-identical), the proposal's own numbers
 * (halt 140 / pivot 154 / 14-tile apron / 10–12-tile plate / connectors near
 * y 3-6-9 / five routes / hound low + wasp apex), the static-anatomy rule
 * (gate overrides are geometry only — the shared curves are untouched), and
 * the same fixture-validity contract the v1 sections hold themselves to.   */
const G2F = TRANSFORM_FIXTURES['monster-g2-neck-flip'];
const G2P = buildTransformPath(G2F, CONFIG);
const G2L = buildTransformLevel(CONFIG, G2F);
const G2E = G2F.events[0];
const G2B = G2F.bounds;
const G2GATE = G2E.gate;

// --- selection wiring: opt-in, restorable, off by default ---------------
{
  ok(TRANSFORM_FIXTURE === XF && XF.id === 'transform-v1',
     'the live transform fixture defaults to v1 (G2 is opt-in)');
  ok(Object.keys(TRANSFORM_FIXTURES).sort().join() ===
     'monster-g2-neck-flip,transform-v1',
     'exactly two authored transform fixtures');
  const v1Fix = TRANSFORM_FIXTURE;
  const v1Path = JSON.stringify(TRANSFORM_PATH);
  const v1Bends = JSON.stringify(TRANSFORM_BEND_S);
  const v1Json = JSON.stringify(v1Fix);
  const sel = selectTransformFixture('monster-g2-neck-flip');
  ok(sel === G2F && TRANSFORM_FIXTURE === G2F &&
     TRANSFORM_BEND_S.length === 1 && TRANSFORM_BEND_S[0] === G2E.seamS &&
     TRANSFORM_PATH.segs.length === 3,
     'selecting g2 swaps fixture, path and bend list together');
  ok(JSON.stringify(buildTransformLevel(CONFIG)) === JSON.stringify(G2L),
     'the default-arg level build follows the live selection');
  const back = selectTransformFixture('transform-v1');
  ok(back === v1Fix && TRANSFORM_FIXTURE === v1Fix &&
     JSON.stringify(TRANSFORM_PATH) === v1Path &&
     JSON.stringify(TRANSFORM_BEND_S) === v1Bends &&
     JSON.stringify(TRANSFORM_FIXTURE) === v1Json,
     'reselecting v1 restores the shipped bindings exactly (selection mutates nothing)');
  ok(selectTransformFixture('no-such-fixture') === v1Fix,
     'an unknown fixture id falls back to v1: the flag cannot half-arm');
}

// --- the proposal's own gate numbers ------------------------------------
{
  ok(G2F.id === 'monster-g2-neck-flip' && G2E.kind === 'flip' &&
     G2F.bands.map((b) => b.kind).join('>') === 'exterior>interior',
     'G2 is one flip from the haunch exterior into the neck interior');
  ok(transformHaltS(G2E, CONFIG) === 140 && G2E.seamS === 154,
     'scroll halt 140 and pivot 154, exactly the proposal P2 numbers (u51/u65)');
  ok(G2E.seamS - transformHaltS(G2E, CONFIG) === 14,
     'the gate apron is the proposal 14 tiles');
  ok(transformHaltS(G2E, CONFIG) >= 119 &&
     G2E.seamS + XT.thresholdTiles <= 161,
     'gate arena and threshold stay inside the proposal s119-161 screen window');
  ok(G2GATE.haltS === transformHaltS(G2E, CONFIG) &&
     G2GATE.pivotS === G2E.seamS,
     'the gate declaration matches the computed halt and pivot');
  // the override mechanism must not leak into the shipped demo
  ok(XF.events.every((ev) => transformHaltS(ev, CONFIG) === ev.seamS - XT.haltOffset),
     'v1 events keep the CONFIG halt offset (no override present)');
  near(transformSeamPull(XTL.t5, CONFIG), XT.seamPullTiles, 1e-9,
       'seam pull without an event still resolves to the CONFIG tiles');
  // pull override: same landing invariant as both v1 turns (halt + pull = seam + 2)
  near(transformSeamPull(XTL.t5, CONFIG, G2E), G2E.seamPullTiles, 1e-9,
       'the G2 event pull reaches its authored tiles by t5');
  near(transformSeamPull(XTL.t2, CONFIG, G2E), 0, 1e-9,
       'the G2 pull still starts on the first detent');
  ok(transformHaltS(G2E, CONFIG) + G2E.seamPullTiles === G2E.seamS + 2 &&
     XF.events.every((ev) => transformHaltS(ev, CONFIG) + XT.seamPullTiles === ev.seamS + 2),
     'every turn, v1 and G2, lands its ritual pull exactly 2 tiles past the pivot');
  near(transformScrollOffset(XTL.t5, G2F.run.minimumScrollSpeed, CONFIG, G2E),
       G2E.seamPullTiles, 1e-9,
       'the ritual scroll offset carries the G2 pull override');
  // the wider apron still frames the whole ritual
  const halfW = CC.z * Math.tan(CC.fov / 2 * DEG) * (16 / 9);
  ok(G2E.haltOffset + XT.thresholdTiles < halfW + CC.x,
     'the whole G2 threshold is visible from its 14-tile apron halt at 16:9');
  ok(XT.armLookahead < G2E.haltOffset && XT.pressedOffset < G2E.haltOffset,
     'arming lookahead and squeeze cap stay inside the G2 apron');
  let ordered = true;
  {
    const halt = transformHaltS(G2E, CONFIG);
    const trig = transformTriggerS(G2E, CONFIG);
    const front = transformFrontierS(G2E, CONFIG);
    const seal = transformSealS(G2E, CONFIG);
    if (!(halt < G2E.seamS && G2E.seamS < trig && trig < front &&
          front < G2E.seamS + XT.thresholdTiles && seal < trig && seal > G2E.seamS)) ordered = false;
    if (G2F.bands[G2E.toBand].s0 !== G2E.seamS ||
        G2F.bands[G2E.fromBand].s1 !== G2E.seamS) ordered = false;
  }
  ok(ordered, 'G2 gate geometry orders halt < seam < seal < trigger < frontier < threshold end');
  ok(transformTriggerS(G2E, CONFIG) - PL.width / 2 >= G2E.seamS,
     'RIG is wholly past the G2 seam before the ritual can fire');
}

// --- one static body: path, bands, climb --------------------------------
{
  let valid = G2F.bands[0].s0 === G2B.x0 &&
    G2F.bands[G2F.bands.length - 1].s1 === G2B.x1;
  for (let i = 1; i < G2F.bands.length; i++)
    if (G2F.bands[i - 1].s1 !== G2F.bands[i].s0) valid = false;
  ok(valid, 'G2 stretches tile the fixture bounds contiguously');
  ok(JSON.stringify(buildTransformPath(G2F, CONFIG)) === JSON.stringify(G2P),
     'the G2 path is a pure function of the fixture');
  ok(G2P.segs.length === 1 + 2 * G2F.events.length,
     'two bends for the one G2 turn, got ' + G2P.segs.length + ' segments');
  let bad = 0, cont = true;
  for (let s = G2B.x0; s < G2B.x1; s++) {
    const a = transformPathAt(G2P, s), b = transformPathAt(G2P, s + 1);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 1 + 1e-9 || d < Math.cos(XT.snapDeg * DEG / 2) - 1e-6) bad++;
  }
  for (const g of G2P.segs) {
    const a = transformPathAt(G2P, g.s0 - 1e-7), b = transformPathAt(G2P, g.s0 + 1e-7);
    if (Math.hypot(a.x - b.x, a.z - b.z) > 1e-5) cont = false;
  }
  ok(bad === 0 && cont, 'the G2 path is continuous with unit steps through its bend');
  const before = transformHeadingAt(G2P, G2E.seamS - XT.chamferTiles);
  const after = transformHeadingAt(G2P, G2E.seamS + XT.chamferTiles);
  ok(Math.abs((after - before) / DEG - 2 * XT.snapDeg) < 1e-9 &&
     Math.abs(before - transformBandHeading(G2F, 0, CONFIG)) < 1e-9 &&
     Math.abs(after - transformBandHeading(G2F, 1, CONFIG)) < 1e-9 &&
     G2F.bands[0].headingDeg === G2GATE.normalBeforeDeg &&
     G2F.bands[1].headingDeg === G2GATE.normalAfterDeg,
     'the G2 turn is two snapDeg detents between the declared surface normals');
  ok(JSON.stringify(transformBendSList(G2F)) === JSON.stringify([G2E.seamS]),
     'the bullet bend cull boundary sits on the G2 seam');
  // the climb: earned on the ribline, flat across the whole gate footprint
  const P = G2P.profile;
  let monotone = true, maxGrade = 0;
  for (let i = 1; i < P.length; i++) {
    if (P[i].alt < P[i - 1].alt - 1e-9 || P[i].s <= P[i - 1].s) monotone = false;
    maxGrade = Math.max(maxGrade, (P[i].alt - P[i - 1].alt) / (P[i].s - P[i - 1].s));
  }
  ok(monotone, 'the G2 altitude profile only ever climbs');
  ok(maxGrade > 0.2 && maxGrade <= 0.45,
     'the G2 grade stays readable side-on, got ' + maxGrade.toFixed(2));
  ok(transformAltAt(G2P, 89) === 12,
     'P2 starts at the proposal +12 render altitude');
  ok(transformAltAt(G2P, transformHaltS(G2E, CONFIG)) - transformAltAt(G2P, 89) >= 14,
     'at least +14 of P2 lift is earned on foot before the halt');
  let flat = true;
  for (let s = transformHaltS(G2E, CONFIG); s <= G2E.seamS + XT.thresholdTiles; s++)
    if (transformAltAt(G2P, s) !== G2GATE.altBefore) flat = false;
  ok(flat && G2GATE.altBefore === G2GATE.altAfter,
     'altitude is dead flat across apron, seam and threshold: the ritual grants 0');
  const climbSeconds = (transformHaltS(G2E, CONFIG) - 89) / PL.runSpeed;
  ok(climbSeconds > 4, 'the P2 ascent is run, not cut: ' +
     climbSeconds.toFixed(1) + ' s of ribline');
}

// --- authored surfaces, gaps, routes ------------------------------------
{
  let valid = true;
  const covered = new Set();
  for (const run of G2F.groundRuns) {
    if (!Number.isInteger(run.x0) || !Number.isInteger(run.x1) || run.x0 >= run.x1 ||
        run.x0 < G2B.x0 || run.x1 > G2B.x1 ||
        (!run.gap && !Number.isFinite(run.y))) valid = false;
    for (let x = run.x0; x < run.x1; x++) {
      if (covered.has(x)) valid = false;
      if (G2L.groundH[x] !== (run.gap ? GAP : run.y)) valid = false;
      covered.add(x);
    }
  }
  ok(valid && covered.size === G2B.x1 - G2B.x0,
     'G2 authored surfaces cover the fixture bounds once and match the built heights');
  let outsideMatches = true;
  for (let i = 0; i < CONFIG.levelLength; i++)
    if ((i < G2B.x0 || i >= G2B.x1) && G2L.groundH[i] !== gH[i]) outsideMatches = false;
  ok(outsideMatches, 'the seeded layout outside the G2 bounds is untouched');
  let widest = 0, badLanding = 0;
  let i = G2B.x0;
  while (i < G2B.x1) {
    if (G2L.groundH[i] > -100) { i++; continue; }
    const start = i;
    while (i < G2B.x1 && G2L.groundH[i] < -100) i++;
    widest = Math.max(widest, i - start);
    let solid = 0;
    while (i + solid < G2B.x1 && G2L.groundH[i + solid] > -100) solid++;
    if (solid < GG.landingMin) badLanding++;
    if (Math.abs(G2L.groundH[start - 1] - G2L.groundH[i]) > 1) badLanding++;
  }
  ok(widest > 0 && widest <= GG.gapMax,
     'G2 gaps stay inside the jumpable band, widest ' + widest);
  ok(badLanding === 0, 'every G2 gap has a legal landing strip after it');
  ok(G2F.movement === undefined, 'the G2 fixture overrides no movement constant');
  // catwalk validity + double-jump reachability (same rule as v1)
  const ids = new Set();
  let pvalid = true, reachable = true;
  for (const p of G2F.platforms) {
    if (typeof p.id !== 'string' || ids.has(p.id) || p.x0 >= p.x1 ||
        p.x0 < G2B.x0 || p.x1 > G2B.x1 || !Number.isFinite(p.y)) pvalid = false;
    ids.add(p.id);
    let best = -999;
    for (let k = p.x0 - 1; k <= p.x1 + 1; k++)
      if (G2L.groundH[k] > -100) best = Math.max(best, G2L.groundH[k]);
    for (const q of G2F.platforms)
      if (q !== p && q.y < p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1) best = Math.max(best, q.y);
    if (p.y - best > GG.maxReach) reachable = false;
  }
  ok(pvalid && ids.size === G2F.platforms.length,
     'G2 catwalks have unique ids and in-bounds spans');
  ok(reachable, 'every G2 catwalk is within double-jump reach of a lower surface');
  // five routes, by name: ridge, chimney, scapular plate, floor, underside
  ok(['r1-', 'r2-', 'r3-', 'r5-'].every((pre) =>
       G2F.platforms.some((p) => p.id.startsWith(pre))) &&
     G2L.groundH[135] === 3,
     'all five proposal routes are authored (r1 ridge, r2 chimney, r3 plate, low floor, r5 underside)');
  const plate = G2F.platforms.find((p) => p.id === 'r3-scapular-plate');
  ok(plate && plate.x1 - plate.x0 >= 10,
     'the scapular plate is broad: ' + (plate ? plate.x1 - plate.x0 : 0) + ' tiles');
}

// --- the twin-rib chimney (authored solids) -----------------------------
{
  const ribs = G2F.solidRects;
  ok(ribs.length === 2 && ribs.every((r) =>
       Number.isInteger(r.x0) && Number.isInteger(r.x1) &&
       Number.isInteger(r.y0) && Number.isInteger(r.y1) &&
       r.x0 >= G2B.x0 && r.x1 <= G2B.x1 && r.y1 > r.y0),
     'the chimney is exactly two in-bounds authored ribs');
  ok(JSON.stringify(G2L.solidRects.map((r) => ({ ...r }))) === JSON.stringify(ribs.map((r) => ({ ...r }))),
     'the built level carries the authored ribs');
  const [ra, rb] = ribs;
  ok(rb.x0 - ra.x1 >= 3 && rb.x0 - ra.x1 <= 5,
     'the chimney mouth between the ribs is a jumpable 3-5 tiles, got ' + (rb.x0 - ra.x1));
  // the low route runs (and a hound paces) beneath both ribs
  let clearance = true;
  for (const r of ribs)
    for (let x = r.x0; x < r.x1; x++)
      if (r.y0 - G2L.groundH[x] < PL.height + 0.3) clearance = false;
  ok(clearance, 'both rib undersides clear a running player on the low route');
  ok(ribs.every((r) => r.x1 <= G2E.seamS - 5 || r.x0 >= G2E.seamS + XT.thresholdTiles),
     'no rib intrudes on the gate apron or threshold');
  // solid collision truth: the rib cells really are solid, the mouth is not
  ok(levelSolidCell(G2L, ra.x0, ra.y0, 8) === true &&
     levelSolidCell(G2L, ra.x0, ra.y1, 8) === false &&
     levelSolidCell(G2L, ra.x1, Math.floor((ra.y0 + ra.y1) / 2), 8) === false,
     'rib collision matches its authored rect (solid inside, open above and beside)');
  const apex = G2F.platforms.find((p) => p.id === 'r2-apex');
  ok(apex && apex.x0 >= ra.x0 && apex.x1 <= rb.x1 && apex.y > 10 && apex.y < rb.y1,
     'the chimney apex catwalk sits between and above the ribs');
  // a wasp contests the apex hop (proposal: the wall-launch apex)
  const apexWasp = G2F.spawns.find((s) => s.type === 'wasp' &&
    s.x >= apex.x0 - 3 && s.x <= apex.x1 + 3);
  const laneY = apexWasp && Math.min(G2L.groundH[Math.floor(apexWasp.x)] + apexWasp.lane, 10);
  ok(!!apexWasp && laneY >= apex.y - 1.5 && laneY <= apex.y + 1.5,
     'a wasp contests the chimney apex at its own height');
}

// --- the plate, the carry, the connectors -------------------------------
{
  ok(G2GATE.plate.tiles >= 10 && G2GATE.plate.tiles <= 12,
     'the access plate is the proposal 10-12 tiles, got ' + G2GATE.plate.tiles);
  const carry = G2GATE.carry;
  ok(carry.s0 === G2E.seamS - 5 && carry.s1 === G2E.seamS + XT.thresholdTiles,
     'the carried deck spans exactly the ritual footprint (apron mouth through threshold)');
  ok(carry.s0 < G2E.seamS && carry.s1 > G2E.seamS,
     'the carried surface exists on BOTH sides of the seam: it is carried, not rebuilt');
  let flat = true, clean = true;
  for (let s = carry.s0; s < carry.s1; s++)
    if (G2L.groundH[s] !== carry.y) flat = false;
  for (const p of G2F.platforms) if (p.x1 > carry.s0 && p.x0 < carry.s1) clean = false;
  ok(flat, 'the carried deck is flat and solid at the declared height');
  ok(clean, 'the G2 apron is platform-free through its threshold');
  // three continuity connectors near local y 3 / 6 / 9
  const want = [3, 6, 9];
  ok(G2GATE.connectors.length === 3 &&
     G2GATE.connectors.every((c, i) => Math.abs(c.y - want[i]) <= 0.5),
     'continuity connectors sit near local y 3, 6 and 9');
  ok(G2GATE.connectors[0].y === carry.y &&
     G2GATE.connectors[0].during === 'carried',
     'the low connector IS the carried deck, marked carried during the flip');
  ok(G2GATE.connectors.every((c) => c.before && c.during && c.after),
     'every connector declares its before/during/after visibility');
  // mid and high: a shelf reaches the mouth outside, a catwalk answers inside
  let linked = true;
  for (const c of G2GATE.connectors.slice(1)) {
    const outside = G2F.platforms.some((p) =>
      p.y === c.y && p.x1 >= carry.s0 && p.x1 <= G2E.seamS);
    const inside = G2F.platforms.some((p) =>
      p.y === c.y && p.x0 >= G2E.seamS && p.x0 <= G2E.seamS + 10);
    if (!outside || !inside) linked = false;
  }
  ok(linked, 'mid and high connectors have a shelf to the mouth and a catwalk beyond it');
  ok(G2GATE.forwardExits.length >= 2 &&
     G2GATE.forwardExits.every((id) => G2GATE.connectors.some((c) => c.id === id)),
     'two or more declared forward exits survive the transformation');
  ok(G2GATE.mechanism === 'access-plate',
     'the gate declares the plate as its only permitted motion');
}

// --- the dare pocket (underside hang) -----------------------------------
{
  const dp = G2GATE.darePocket;
  const shelf = G2F.platforms.find((p) => p.id === 'r5-pocket-shelf');
  let gapAll = true;
  for (let s = dp.s0; s < dp.s1; s++) if (G2L.groundH[s] > -100) gapAll = false;
  ok(gapAll && shelf && shelf.x0 <= dp.s0 && shelf.x1 >= dp.s1 && shelf.y === dp.floorY,
     'the underside pocket is a floor gap with its hang shelf beneath');
  const deckY = G2L.groundH[dp.s1];
  const apexRise = PL.jumpVel * PL.jumpVel / (2 * -PL.gravity);
  ok(dp.floorY + apexRise >= deckY + 0.5,
     'a single frozen jump escapes the pocket with clearance to spare');
  // declared retreat timing is honest: at least the physics minimum, still short
  const rise = deckY - dp.floorY;
  const disc = Math.sqrt(PL.jumpVel * PL.jumpVel - 2 * -PL.gravity * rise);
  const riseT = (PL.jumpVel - disc) / -PL.gravity;
  const minSec = riseT + (dp.rejoinS - dp.s0) / PL.runSpeed;
  ok(dp.retreatSec >= minSec && dp.retreatSec <= 2,
     'declared pocket retreat (' + dp.retreatSec + 's) covers the physics minimum (' +
     minSec.toFixed(2) + 's) and stays a SHORT hang');
  ok(dp.s1 <= transformHaltS(G2E, CONFIG),
     'the pocket commits before the gate halt, not inside the arena');
  const ribA = G2F.solidRects[0];
  ok(Math.abs(dp.rejoinS - ribA.x0) <= 2,
     'the underside hang rejoins at the chimney base, per the proposal route 5');
  // the reward socket hangs in the pocket, in open air
  const rw = G2GATE.sockets.reward[0];
  ok(!!rw && rw.x >= dp.s0 && rw.x < dp.s1 && rw.y >= dp.floorY &&
     !levelSolidCell(G2L, Math.floor(rw.x), Math.floor(rw.y), 8),
     'the pocket reward socket is declared, inside the pocket, in open air');
}

// --- authored pressure: hound low, wasps contested ----------------------
{
  let sorted = true, clear = true, typed = true;
  for (let i = 0; i < G2F.spawns.length; i++) {
    const e = G2F.spawns[i];
    if (i > 0 && e.x <= G2F.spawns[i - 1].x) sorted = false;
    if (e.x < G2B.x0 || e.x >= G2B.x1) clear = false;
    if (e.type === 'wasp') { if (!Number.isFinite(e.lane)) typed = false; }
    else if (e.type === 'hound') { if (!e.patrol || !Number.isFinite(e.dir)) typed = false; }
    else typed = false;
    for (const ev of G2F.events)
      if (e.x >= ev.seamS - G2F.spawnClear.before && e.x <= ev.seamS + G2F.spawnClear.after) clear = false;
  }
  ok(sorted, 'the G2 ambient table is strictly ascending');
  ok(clear, 'no G2 spawn sits in the seam-clear zone');
  ok(typed, 'G2 spawns are authored wasps with lanes plus houndframes with patrols');
  ok(G2F.spawns.length >= 4 && G2F.spawns.length <= 8,
     'the G2 ecology stays simple, got ' + G2F.spawns.length);
  const hounds = G2F.spawns.filter((s) => s.type === 'hound');
  ok(hounds.length === 1, 'exactly one houndframe pressures the gate, got ' + hounds.length);
  const h = hounds[0];
  let floorRun = true;
  for (let s = Math.floor(h.patrol.x0); s <= Math.ceil(h.patrol.x1); s++)
    if (G2L.groundH[s] !== 3) floorRun = false;
  ok(floorRun, 'the hound patrol paces a continuous stretch of the low joint-collar floor');
  ok(h.patrol.x1 - h.patrol.x0 >= 6,
     'the patrol is a real chokepoint span (entry 6: placement, not stats), got ' +
     (h.patrol.x1 - h.patrol.x0).toFixed(1) + ' tiles');
  ok(h.x >= h.patrol.x0 && h.x <= h.patrol.x1 && h.patrol.x1 < G2GATE.carry.s0,
     'the hound spawns inside its patrol, short of the carried deck');
}

// --- interior validity + threat sockets (same contract as v1) -----------
{
  const IB = G2F.bands[1];
  const IN = IB.interior;
  ok(IN.ceilingAbove > PL.height + PL.jumpVel ** 2 / (2 * -PL.gravity) + 1,
     'the neck interior ceiling clears a full jump');
  ok(G2F.platforms.filter((p) => p.x0 >= IB.s0 && p.x1 <= IB.s1)
       .every((p) => p.y + PL.height + 0.5 < G2L.groundH[Math.floor(p.x0)] + IN.ceilingAbove),
     'interior catwalks keep player headroom under the neck ceiling');
  const sockets = IB.threatSockets || [];
  const ids = new Set();
  let valid = true;
  for (const so of sockets) {
    if (typeof so.id !== 'string' || ids.has(so.id) ||
        !['polyp', 'hazard'].includes(so.kind) ||
        so.x < IB.s0 + XT.thresholdTiles || so.x >= IB.s1 ||
        !Number.isFinite(so.y) || so.depth > -1) valid = false;
    ids.add(so.id);
    if (levelSolidCell(G2L, Math.floor(so.x), Math.floor(so.y), 8)) valid = false;
    for (const ev of G2F.events)
      if (so.x >= ev.seamS - 5 && so.x < ev.seamS + XT.thresholdTiles) valid = false;
  }
  ok(sockets.length >= 3 && valid && ids.size === sockets.length,
     'G2 threat sockets are unique, open, behind the plane and clear of the apron');
  ok(sockets.some((so) => so.kind === 'polyp') && sockets.some((so) => so.kind === 'hazard'),
     'the neck interior declares both emplacement and hazard sockets');
  ok(G2GATE.sockets.enemy.slice().sort().join() ===
     sockets.map((so) => so.id).sort().join(),
     'the gate declaration and the band agree on the enemy socket ids');
}

// --- run window ---------------------------------------------------------
{
  const run = G2F.run;
  const halfWide = CC.z * Math.tan(CC.fov / 2 * DEG) * (16 / 9);
  ok(run.startScroll + CC.x - halfWide >= G2B.x0,
     'the G2 opening frame is filled by authored hull, not void');
  ok(run.endScroll < G2F.finish.x0 && G2F.finish.x1 <= G2B.x1 &&
     G2F.finish.x0 > G2E.seamS + 20,
     'the G2 run ends well inside the neck, past the flip');
  ok(run.minimumScrollSpeed > 0 && run.minimumScrollSpeed < PL.runSpeed,
     'RIG can outrun the pursuing edge in the G2 fixture');
  const sprint = (G2F.finish.x0 - run.playerSpawn.x) / PL.runSpeed +
    transformEventTotalMs(CONFIG) / 1000;
  ok(sprint >= G2F.targetPlaySeconds.min && sprint <= G2F.targetPlaySeconds.max,
     'an uninterrupted G2 run plus the ritual fits the target, got ' + sprint.toFixed(1) + ' s');
  ok(G2L.groundH[Math.floor(run.playerSpawn.x)] <= run.playerSpawn.y,
     'the G2 spawn point stands on authored ground');
}

// --- choreography reuse: geometry overrides only ------------------------
{
  // The G2 event may add gate GEOMETRY on top of a v1 flip event — never a
  // second choreography. Whitelist the extra keys so a drive-by curve
  // override cannot sneak in through the fixture.
  const baseKeys = new Set(Object.keys(XF.events[0]));
  const extras = Object.keys(G2E).filter((k) => !baseKeys.has(k)).sort().join();
  ok(extras === 'gate,haltOffset,plateRamp,seamPullTiles',
     'G2 event extras are gate geometry + declarations only, got: ' + extras);
  // and the shared flip curve is bit-identical for both events at every beat
  let same = true;
  for (let t = -50; t <= transformEventTotalMs(CONFIG) + 100; t += 10) {
    const a = transformPanelState(t, XF.events[0], CONFIG);
    const b = transformPanelState(t, G2E, CONFIG, {});
    if (a.open !== b.open || a.jolt !== b.jolt || a.seated !== b.seated) same = false;
  }
  ok(same, 'the G2 plate runs T-001 flip choreography verbatim (relock on the hold)');
  // static-anatomy guard: the sim can never read the render-only gate fields
  for (const file of layerFiles('sim')) {
    const src = stripComments(readFileSync(file, 'utf8'));
    ok(!/plateRamp|seatRake|\.gate\./.test(src),
       file.split('/').pop() + ' never reads the G2 render-only gate fields');
  }
}

// --- ledge-probe reach/gap epsilon boundaries --------------------------
// traversalLedgeProbe's candidate column is cellX = floor(x + side*(hw +
// ledgeReachX)) -- which already caps gap = cellX - (x+hw) at ledgeReachX by
// construction (floor() can't overshoot the value it floors). So a grab
// right at maximum reach must still catch (that boundary IS reachable and
// worth pinning); an approach further than reach simply resolves to a
// different, empty cellX rather than tripping the explicit `gap >
// ledgeReachX` branch, which is effectively unreachable dead code documented
// here for whoever next touches this function. The `-0.03` overlap
// tolerance on the near side, by contrast, is an independent check and IS
// reachable -- pinned below.
{
  const hw = PL.width / 2;
  const farGeo = gridGeometry([[12, 2]]);
  const atMaxReach = traversalLedgeProbe(
    { ...ledgeState, x: 12 - hw - PL.ledgeReachX + 0.001, hInput: 1 }, farGeo);
  ok(!!atMaxReach && atMaxReach.cellX === 12,
     'a ledge grab right at maximum reach (gap approx ledgeReachX) still catches');
  const insideOverlap = traversalLedgeProbe(
    { ...ledgeState, x: 12 - hw + 0.02, hInput: 1 }, farGeo);   // gap approx -0.02
  const outsideOverlap = traversalLedgeProbe(
    { ...ledgeState, x: 12 - hw + 0.05, hInput: 1 }, farGeo);   // gap approx -0.05
  ok(!!insideOverlap, 'ledge probe forgives a small overlap inside the -0.03 tolerance (gap approx -0.02)');
  ok(outsideOverlap === null, 'ledge probe rejects overlap deeper than the -0.03 tolerance (gap approx -0.05)');
}

// --- ambient spawn director -------------------------------------------
{
  const table = buildSpawnTable(CONFIG);
  ok(table.length > 20, 'ambient table populated, got ' + table.length);
  let sorted = true, clean = true, inBounds = true;
  for (let i = 0; i < table.length; i++) {
    const x = table[i].x;
    if (i > 0 && x <= table[i - 1].x) sorted = false;
    if (CORNER_S.some(function (cs) { return x >= cs - SP.cornerClearBefore && x <= cs + SP.cornerClearAfter; })) clean = false;
    if (x < SP.startS || x >= CONFIG.levelLength - SP.endFromEnd) inBounds = false;
  }
  ok(sorted, 'spawn table strictly ascending');
  ok(clean, 'no ambient spawns inside corner-clear zones');
  ok(inBounds, 'spawn positions within authored range');
  const carriers = table.filter((e) => e.type === 'carrier');
  ok(carriers.length === CONFIG.carrier.perFaceFrac.length,
     'one carrier row per face, got ' + carriers.length);
  ok(Object.keys(CONFIG.weapons).every((k) => CONFIG.palette.shots[k] !== undefined),
     'every weapon letter has a shot color');
  const perFace = new Array(PP.faces).fill(0);
  for (const e of table) {
    const f = faceIndexAt(e.x, CONFIG);
    if (f >= 1 && f <= PP.faces) perFace[f - 1]++;
  }
  ok(perFace[PP.faces - 1] > perFace[0],
     'density escalates: face 6 (' + perFace[PP.faces - 1] + ') > face 1 (' + perFace[0] + '), all: ' + perFace.join(','));
  let esc = true;
  for (let k = 1; k < PP.faces; k++) {
    if (SP.faceGapSec[k] >= SP.faceGapSec[k - 1]) esc = false;
    if (SP.pairChance[k] < SP.pairChance[k - 1]) esc = false;
  }
  ok(esc, 'per-face gap shrinks and pair chance grows');
  ok(Math.round(SP.faceGapSec[PP.faces - 1] * CONFIG.scrollSpeed) >= 6,
     'hottest face still >= 6 tiles between ambient spawns');
}

// --- frame dt clamp vs. collision safety margins (tunneling) -----------
// src/main.js clamps the frame dt with Math.min(N, t - last) before any sim
// step. src/sim/player.js resolves the X-axis wall stop and the Y-axis
// ceiling stop by checking only the single grid cell at the END of that
// frame's move (not every cell crossed) -- correct only as long as no
// attainable velocity can cross a full tile in one clamped frame. (Falling
// onto solid ground or a one-way platform IS swept cell-by-cell and is
// exercised directly below; it does not depend on this budget.) Read the
// clamp from source instead of duplicating it as a second magic number, so
// this stays true if the clamp itself is ever retuned.
{
  const mainSrc = readFileSync(join(srcDir, 'main.js'), 'utf8');
  const m = mainSrc.match(/Math\.min\(\s*(\d+(?:\.\d+)?)\s*,\s*t\s*-\s*last\s*\)/);
  ok(!!m, 'main.js frame loop clamps dt with the expected Math.min(N, t - last) shape');
  const dtMax = (m ? Number(m[1]) : 50) / 1000;

  const maxHorizVel = Math.max(PL.runSpeed, PL.wallJumpX, PL.knockbackX,
    TP.runSpeed, TP.wallJumpX, TP.ledgeLaunchX);
  const maxUpVel = Math.max(PL.jumpVel, PL.airJumpVel, PL.wallJumpY, PL.ledgeLaunchY,
    TP.jumpVel, TP.airJumpVel, TP.wallJumpY, TP.ledgeLaunchY);
  ok(maxHorizVel * dtMax < 0.9,
     'no configured horizontal speed crosses a full tile in one clamped frame (endpoint-only wall check would tunnel), got ' +
     (maxHorizVel * dtMax).toFixed(3) + ' tiles at ' + maxHorizVel + ' u/s');
  ok(maxUpVel * dtMax < 0.9,
     'no configured upward speed crosses a full tile in one clamped frame (endpoint-only ceiling check would tunnel), got ' +
     (maxUpVel * dtMax).toFixed(3) + ' tiles at ' + maxUpVel + ' u/s');

  // src/sim/weapons.js caps bullet substeps at 4 regardless of speed, so a
  // fast enough projectile could exceed the intended ~0.45-unit substep and
  // tunnel through a 1-wide pillar or the smallest hostile hitbox. Guard the
  // real worst case (speed * dtMax / 4) against both.
  const minHitDiameter = 2 * Math.min(CONFIG.wasp.contactRadius, CONFIG.carrier.hitRadius);
  let worstSubstep = 0;
  for (const letter of Object.keys(CONFIG.weapons)) {
    worstSubstep = Math.max(worstSubstep, CONFIG.weapons[letter].speed * dtMax / 4);
  }
  ok(worstSubstep < Math.min(0.9, minHitDiameter * 0.9),
     'every weapon speed keeps the capped bullet substep under both a 1-wide pillar and the smallest hostile hitbox, worst case ' +
     worstSubstep.toFixed(3) + ' tiles');
}

// --- sim-layer collision integration ------------------------------------
// Drives the real, unmodified src/sim/player.js loop (not a reimplementation)
// against a synthetic one-way platform placed past the generator's platform
// range (x >= 417 has none) so it can't collide with authored terrain. Pins
// three collision-edge behaviors from the physics review: a fast fall at the
// clamped max frame dt must not tunnel through a one-way platform, rising
// through the same platform must pass through it, and resting on it for many
// frames must not chatter loose from float drift.
{
  setSimEdges(-1000, 1000);                    // wide viewport: no frustum clamp interference
  for (const c of simCornerEvents) c.state = 'done';   // no wave-gate right-edge clamp either
  for (const k in simKeys) simKeys[k] = false;

  const testX0 = 430, testX1 = 434, testY = 10;
  simPlatforms.push({ x0: testX0, x1: testX1, y: testY });
  const midX = (testX0 + testX1) / 2;

  simPlayer.x = midX; simPlayer.y = testY + 20;
  simPlayer.vx = 0; simPlayer.vy = 0;
  simPlayer.grounded = false; simPlayer.onOneWay = null; simPlayer.dropUntil = 0;
  clearSimTraversal(0);
  let landedAt = -1;
  for (let i = 0; i < 60 && landedAt < 0; i++) {
    updateSimPlayer(0.05);                     // the real clamped max frame dt
    if (simPlayer.grounded) landedAt = i;
  }
  ok(landedAt >= 0 && simPlayer.y === testY && simPlayer.vy === 0,
     'fast fall at the clamped max frame dt lands exactly on a one-way platform, no tunneling (y=' +
     simPlayer.y + ' at frame ' + landedAt + ')');

  simPlayer.x = midX; simPlayer.y = testY - 0.5;
  simPlayer.vx = 0; simPlayer.vy = 16;
  simPlayer.grounded = false; simPlayer.onOneWay = null; simPlayer.dropUntil = 0;
  clearSimTraversal(0);
  updateSimPlayer(0.05);
  ok(simPlayer.y > testY && !simPlayer.grounded,
     'rising through a one-way platform passes through instead of snapping to it (y=' + simPlayer.y + ')');

  simPlayer.x = midX; simPlayer.y = testY;
  simPlayer.vx = 0; simPlayer.vy = 0;
  simPlayer.grounded = true; simPlayer.onOneWay = simPlatforms[simPlatforms.length - 1];
  simPlayer.dropUntil = 0;
  clearSimTraversal(0);
  let everFell = false;
  for (let i = 0; i < 300; i++) {
    updateSimPlayer(1 / 60);
    if (!simPlayer.grounded) everFell = true;
  }
  ok(!everFell && simPlayer.y === testY,
     '300 frames resting on a one-way platform stay pinned with no float-drift chatter (y=' + simPlayer.y + ')');
}

// --- discrete jump-apex frame-rate dependence ---------------------------
// src/pure/generator.js documents that the semi-implicit integrator's
// DISCRETE jump apex is lower than the analytic apex checked earlier
// (2.61 @60Hz / 2.49 @30Hz vs analytic 2.72), and that the mid-lane's +2.35
// offset was chosen to stay under both with margin (+0.26 / +0.14) -- but
// that comment only reasons about 60Hz and 30Hz. The real worst case is
// whatever src/main.js's frame clamp allows (dt=0.05s, 20fps-equivalent),
// which is slower than 30Hz and never checked anywhere. Simulate the actual
// discrete jump with the real sim loop at that clamp floor and confirm the
// margin the generator relies on hasn't gone (or drifted toward) negative.
{
  function jumpApex(dt, doDouble) {
    for (const k in simKeys) simKeys[k] = false;
    simPlayer.x = 438; simPlayer.y = 3;
    simPlayer.vx = 0; simPlayer.vy = 0;
    simPlayer.grounded = true; simPlayer.onOneWay = null;
    simPlayer.airJumpsLeft = PL.airJumps;
    simPlayer.coyoteUntil = 0; simPlayer.dropUntil = 0; simPlayer.jumpCutDone = true;
    clearSimTraversal(0);
    clearSimJumpBuffer();
    simKeys.jump = true;               // held throughout: no variable-height cut
    bufferSimJump(1);                  // gameMs stays 0; 1 > 0 fires the jump next call
    let maxY = simPlayer.y, airJumped = !doDouble, prevVy = 0;
    for (let i = 0; i < 400; i++) {
      if (!airJumped && i > 0 && prevVy > 0 && simPlayer.vy <= 0) {
        bufferSimJump(1);               // air-jump at apex 1: maximizes total height
        airJumped = true;
      }
      prevVy = simPlayer.vy;
      updateSimPlayer(dt);
      maxY = Math.max(maxY, simPlayer.y);
      if (simPlayer.grounded && i > 4) break;
    }
    return maxY - 3;
  }
  const DT_20FPS = 0.05;              // the real src/main.js clamp floor, extracted above
  const apexSingle60 = jumpApex(1 / 60, false);
  const apexSingle30 = jumpApex(1 / 30, false);
  const apexSingleFloor = jumpApex(DT_20FPS, false);
  near(apexSingle60, 2.61, 0.02, 'discrete single-jump apex at 60Hz matches the documented figure');
  near(apexSingle30, 2.49, 0.02, 'discrete single-jump apex at 30Hz matches the documented figure');
  ok(apexSingleFloor > 2.35,
     'discrete single-jump apex clears the mid-lane +2.35 offset even at the actual dt-clamp floor (20fps), margin ' +
     (apexSingleFloor - 2.35).toFixed(3) + ' tiles -- thinner than the documented 30Hz margin, worth a wider buffer if retuned');
  const apexDoubleFloor = jumpApex(DT_20FPS, true);
  ok(apexDoubleFloor > 3,
     'discrete double-jump apex clears the +3 high-lane offset at the dt-clamp floor, margin ' +
     (apexDoubleFloor - 3).toFixed(3) + ' tiles');
}

/* ================= pacing variants (CP1) ========================== *
 * Three sharply different pacing arguments over one fixture. Everything
 * asserted here is a property the operator's A/B depends on: the geometry is
 * identical across variants, each variant's pursuit model is bounded and
 * fair, and the dare pocket stays provably escapable at every variant's
 * pocket speed — a variant that can crush a prompt player in the pocket is a
 * generation error, not intensity.                                       */
{
  const pacesBefore = JSON.stringify(TRAVERSAL_PACES);
  const fixtureSnapshot = JSON.stringify(TRAVERSAL_FIXTURE);
  const resolved = TRAVERSAL_PACE_IDS.map(function (id) { return resolveTraversalPace(id); });
  ok(TRAVERSAL_PACE_IDS.length >= 3 && TRAVERSAL_PACE_IDS[0] === 'base',
     'at least three paces declared, base first, got ' + TRAVERSAL_PACE_IDS.join(','));
  ok(JSON.stringify(TRAVERSAL_PACES) === pacesBefore &&
     JSON.stringify(TRAVERSAL_FIXTURE) === fixtureSnapshot,
     'resolving a pace mutates neither the pace table nor the base fixture');
  ok(resolveTraversalPace('nonexistent-pace').pace.id === 'base',
     'an unknown ?pace= falls back to base rather than breaking the slice');

  const baseResolved = resolved[0];
  ok(JSON.stringify(baseResolved.movement) === JSON.stringify(TRAVERSAL_FIXTURE.movement) &&
     JSON.stringify(baseResolved.enemies) === JSON.stringify(TRAVERSAL_FIXTURE.enemies) &&
     baseResolved.run.minimumScrollSpeed === TRAVERSAL_FIXTURE.run.minimumScrollSpeed &&
     baseResolved.rewards.length === 1 && baseResolved.chain === null,
     'the base pace is the shipped pass unchanged (default behavior preserved)');

  let sameGeometry = true, boundedPursuit = true, sameRoutes = true;
  const seenLabels = new Set();
  for (const F of resolved) {
    const PU = F.pursuit;
    if (JSON.stringify(F.groundRuns) !== JSON.stringify(TRAVERSAL_FIXTURE.groundRuns) ||
        JSON.stringify(F.platforms) !== JSON.stringify(TRAVERSAL_FIXTURE.platforms) ||
        JSON.stringify(F.solidRects) !== JSON.stringify(TRAVERSAL_FIXTURE.solidRects) ||
        JSON.stringify(F.connectors) !== JSON.stringify(TRAVERSAL_FIXTURE.connectors) ||
        F.bounds !== TRAVERSAL_FIXTURE.bounds) sameGeometry = false;
    if (JSON.stringify(F.routes) !== JSON.stringify(TRAVERSAL_FIXTURE.routes) ||
        JSON.stringify(F.edges) !== JSON.stringify(TRAVERSAL_FIXTURE.edges)) sameRoutes = false;
    if (typeof F.pace.id !== 'string' || typeof F.pace.label !== 'string' ||
        typeof F.pace.hypothesis !== 'string' || F.pace.hypothesis.length < 40 ||
        seenLabels.has(F.pace.label)) boundedPursuit = false;
    seenLabels.add(F.pace.label);
    if (!(PU.minSpeed > 0 && PU.minSpeed <= PU.cruiseSpeed && PU.cruiseSpeed <= PU.maxSpeed &&
          // the pocket clamp is a release, never a spike: it may (and now does)
          // sit below the pursuit floor, because it is the only speed acting
          // during a retreat and traversalPaceStep applies it before the clamp
          PU.pocketSpeed > 0 && PU.pocketSpeed <= PU.cruiseSpeed &&
          PU.accel >= 0 && PU.decel >= 0 &&
          PU.edgePinDamageMs >= 0 && PU.crushSlackSeconds >= 0 &&
          ['constant', 'hunt', 'ramp'].indexOf(PU.mode) >= 0 &&
          F.run.minimumScrollSpeed === PU.cruiseSpeed)) boundedPursuit = false;
    // crush slack authored in seconds resolves to a margin cap in tiles
    const wantCap = PU.crushSlackSeconds ? PU.crushSlackSeconds * PU.cruiseSpeed : 0;
    if (Math.abs(PU.marginCapTiles - wantCap) > 1e-9) boundedPursuit = false;
    // the player must always be able to outrun the edge on the flat
    const TPp = { ...PL, ...F.movement };
    if (PU.maxSpeed >= TPp.runSpeed) boundedPursuit = false;
    if (PU.mode === 'hunt' && !(PU.mercyTiles > 0 && PU.mercyTiles < PU.comfortTiles)) boundedPursuit = false;
    if (PU.mode === 'ramp' && !(PU.rampMs > 0)) boundedPursuit = false;
  }
  ok(sameGeometry, 'every pace shares one geometry: an A/B compares pacing only');
  ok(sameRoutes, 'every pace shares one route graph, so route metrics stay comparable');
  ok(boundedPursuit,
     'each pace declares a labelled hypothesis and a bounded, outrunnable pursuit model');

  // dare-pocket retreat timing, re-proved at each variant's pocket speed
  // A pace that bounds slack in seconds grants LESS daylight at the pocket than
  // the authored screen-width figure, so the wager is re-derived per pace from
  // the margin it actually gets (adversarial F8: the shipped pocket was a free
  // pickup with 18-19 tiles of exit margin against a documented 8-tile floor).
  let pocketFair = true;
  for (const F of resolved) {
    const D = F.darePocket;
    const entry = traversalPocketEntryMargin(F);
    const advance = traversalPocketAdvanceTiles(F.pursuit, D.timing.retreatSeconds);
    const backtrack = D.reward.x - D.bounds.x0;
    const exit = entry - backtrack - advance;
    if (exit + 1e-9 < D.timing.minExitMarginTiles ||
        D.timing.minExitMarginTiles <= PL.width + 2 * CONFIG.edges.margin ||
        backtrack <= 0 || advance <= 0 ||
        D.reward.x < D.bounds.x0 || D.reward.x >= D.bounds.x1) {
      pocketFair = false;
      console.error('  pocket unfair in pace ' + F.pace.id + ': entry ' + entry.toFixed(2) +
        ' backtrack ' + backtrack + ' advance ' + advance.toFixed(2) +
        ' exit ' + exit.toFixed(2) + ' need ' + D.timing.minExitMarginTiles);
    }
  }
  ok(pocketFair,
     'dare retreat clears its exit margin at the daylight each pace actually grants');
  // …and the wager is no longer free: a pace with a real clock must leave less
  // slack than the shipped screen-width pocket did.
  {
    const slack = resolved.filter(function (F) { return F.pursuit.marginCapTiles > 0; })
      .map(function (F) {
        return traversalPocketEntryMargin(F) - (F.darePocket.reward.x - F.darePocket.bounds.x0) -
          traversalPocketAdvanceTiles(F.pursuit, F.darePocket.timing.retreatSeconds);
      });
    const baseSlack = traversalPocketEntryMargin(resolved[0]) -
      (resolved[0].darePocket.reward.x - resolved[0].darePocket.bounds.x0) -
      traversalPocketAdvanceTiles(resolved[0].pursuit, resolved[0].darePocket.timing.retreatSeconds);
    ok(slack.length >= 2 && slack.every(function (v) { return v < baseSlack; }),
       'every seconds-bounded pace makes the pocket a tighter wager than base, got ' +
       slack.map(function (v) { return v.toFixed(1); }).join(',') + ' vs ' + baseSlack.toFixed(1));
  }

  /* ---- the crush clock is bounded in SECONDS, not in screen width -------- *
   * The shipped lead is a distance, so the same fixture gives 13.9 s of slack
   * at 1600x600 and 7.0 s at 800x1000 (adversarial F6) — two different games
   * from one build. A pace that declares crushSlackSeconds must produce the
   * same clock on any frustum. This also has to hold for the view-scale
   * experiment (?view=near|mid|far, CONFIG.viewScales just above): a wider
   * view only ever manifests here as a more negative edgeOffset (a further-
   * left calibrated EDGE_L), and -31.1/-42.4 are the actual EDGE_L a
   * from-scratch reimplementation of calibrateEdges's unproject math
   * produces for `far` at 16:9/21:9 respectively (near/16:9 is -12.2, for
   * comparison) — real view-scale magnitudes, not arbitrary stand-ins.     */
  {
    let invariant = true, contested = true, clocks = [];
    for (const F of resolved) {
      const cap = F.pursuit.marginCapTiles;
      if (cap <= 0) continue;
      const playerLeft = 40;
      // narrow portrait through view-scale-widened landscape, same clock
      for (const edgeOffset of [-3.1, -10.4, -12.2, -18.0, -31.1, -42.4]) {
        const scroll = traversalMarginCapScroll(playerLeft, edgeOffset, cap);
        const margin = playerLeft - (scroll + edgeOffset);
        if (Math.abs(margin - cap) > 1e-9) invariant = false;
        if (Math.abs(margin / F.pursuit.cruiseSpeed - F.pursuit.crushSlackSeconds) > 1e-9)
          invariant = false;
      }
      clocks.push(F.pace.id + '=' + F.pursuit.crushSlackSeconds + 's');
      // and standing still has to actually kill: the plane cannot be a conveyor
      if (!(F.pursuit.edgePinDamageMs > 0 &&
            F.pursuit.edgePinDamageMs * PL.maxHealth < F.pursuit.crushSlackSeconds * 4000))
        contested = false;
    }
    ok(invariant && clocks.length >= 2,
       'seconds-bounded paces produce one aspect-invariant clock: ' + clocks.join(' '));
    // The cap only governs if it is tighter than the narrowest supported
    // frustum's own follow margin; past that the screen binds first and the
    // clock would drift with aspect ratio again. 15.6 tiles is the measured
    // steady-state follow margin at 900x1000 (the fixture's portraitMinAspect
    // 0.9); the same probe reads 23.1 at 1280x800 and 33.4 at 1600x600, which
    // is the 2.1x variance this whole mechanism exists to remove.
    const PORTRAIT_FOLLOW_MARGIN = 15.6;
    const caps = resolved.map(function (F) { return F.pursuit.marginCapTiles; });
    ok(caps.every(function (c) { return c <= PORTRAIT_FOLLOW_MARGIN; }),
       'every declared crush clock still binds inside the narrowest supported ' +
       'frustum, caps ' + caps.map(function (c) { return c.toFixed(1); }).join(','));
    ok(contested,
       'a seconds-bounded pace also makes the plane lethal, so idling is not a free ride');
  }

  /* ---- the roof line is contested (adversarial F1/F10) ------------------ *
   * Every winning degenerate policy pumps a chimney wall to its top and runs
   * the y:10 roof east, because a wasp only dives when the player is BELOW it
   * and every authored wasp sat at y 8.4-8.8. A pace has to price that line. */
  {
    const roofY = Math.max.apply(null, TRAVERSAL_FIXTURE.solidRects.map(function (r) { return r.y1; }));
    let priced = 0;
    for (const F of resolved) {
      if (F.pace.id === 'base') continue;
      const above = F.enemies.filter(function (e) { return e.y > roofY + 1; });
      if (above.length >= 1) priced++;
      else console.error('  roof line uncontested in pace ' + F.pace.id);
    }
    ok(priced === resolved.length - 1,
       'every variant places a hostile above the y=' + roofY + ' roof so the fastest line costs something');
  }

  /* ---- no 1-tile lip on a walkable roof (adversarial F11) --------------- */
  {
    const overhang = TRAVERSAL_FIXTURE.solidRects.find(function (r) { return r.role === 'overhang'; });
    const lip = TRAVERSAL_FIXTURE.solidRects.find(function (r) { return r.id === 'dare-dead-end'; });
    ok(overhang && lip && lip.y1 <= overhang.y1 && lip.x0 >= overhang.x1 - 1,
       'the pocket dead end never rises above the overhang roof it meets (no held-jump trap)');
    ok(lip.y1 > TRAVERSAL_FIXTURE.groundRuns.find(function (r) {
      return r.x0 <= lip.x0 && r.x1 > lip.x0;
    }).y + PL.height,
       'the dead end still seals the pocket for a player standing inside it');
  }

  // authored rewards and hostiles per pace
  let stakesValid = true;
  for (const F of resolved) {
    const ids = new Set();
    if (JSON.stringify(F.rewards[0]) !== JSON.stringify(F.darePocket.reward)) stakesValid = false;
    for (const r of F.rewards) {
      if (r.mode !== 'fixed' || r.x < F.bounds.x0 || r.x >= F.bounds.x1 ||
          levelSolidCell(TL, Math.floor(r.x), Math.floor(r.y), 8)) stakesValid = false;
    }
    for (const e of F.enemies) {
      if (ids.has(e.id) || ['wasp', 'carrier'].indexOf(e.kind) < 0 ||
          e.x < F.bounds.x0 || e.x >= F.bounds.x1 || e.y <= 0 || e.delayMs < 0 ||
          levelSolidCell(TL, Math.floor(e.x), Math.floor(e.y), 8)) stakesValid = false;
      ids.add(e.id);
      if (e.tune) {
        const T = e.tune;
        if ((T.hp !== undefined && !(T.hp > 0)) ||
            (T.cruiseSpeed !== undefined && !(T.cruiseSpeed >= 0)) ||
            (T.diveRange !== undefined && !(T.diveRange > 0)) ||
            (T.diveCooldownMs !== undefined && !(T.diveCooldownMs > 0))) stakesValid = false;
      }
    }
  }
  ok(stakesValid,
     'every pace spawns unique, in-bounds, non-embedded hostiles and fixed rewards');

  // route stakes actually differ: no two paces field the same threat layout
  const layouts = new Set(resolved.map(function (F) {
    return JSON.stringify(F.enemies.map(function (e) { return [e.kind, e.x, e.y]; }));
  }));
  ok(layouts.size === resolved.length,
     'the variants differ in kind: no two share a threat layout');
  const enemyCounts = resolved.map(function (F) { return F.enemies.length; });
  ok(Math.max.apply(null, enemyCounts) >= 2 * Math.min.apply(null, enemyCounts),
     'density spread across paces is real, got ' + enemyCounts.join(','));

  // movement/verb budgets hold for every pace, not just the base tune
  let verbsValid = true;
  for (const F of resolved) {
    const TPp = { ...PL, ...F.movement };
    const apex = TPp.jumpVel * TPp.jumpVel / (2 * -TPp.gravity);
    if (!(apex >= 3 && apex <= 3.5)) verbsValid = false;
    if (!(TPp.ledgeHangMs <= 300 && TPp.wallSlideMs <= 400 &&
          TPp.traversalLaunchControlMs >= 80 && TPp.traversalLaunchControlMs <= 150 &&
          TPp.traversalRecatchMs >= 120 && TPp.traversalRecatchMs <= 250)) verbsValid = false;
    if (!(TPp.ledgeLaunchY >= TPp.jumpVel * 0.9 && TPp.wallJumpY >= TPp.jumpVel * 0.9 &&
          TPp.ledgeLaunchX >= TPp.runSpeed * 0.8 &&
          TPp.wallJumpX >= TPp.runSpeed * 1.1)) verbsValid = false;
    // a chained launch is still readable inside the camera's look-ahead
    const chainMax = traversalChainMult(F.chain ? F.chain.max : 0, F.chain);
    if (TPp.wallJumpX * chainMax * 0.05 >= F.run.lookAheadTiles) verbsValid = false;
    if (F.chain && !(F.chain.windowMs > 0 && F.chain.step > 0 && F.chain.max >= 1 &&
                     chainMax <= 1.35)) verbsValid = false;
    if (TPp.ledgeAutoLaunch && !(TPp.ledgeHangMs > 0)) verbsValid = false;
  }
  ok(verbsValid,
     'every pace keeps jump apex, dwell budgets, launch authority and chain gain in range');

  // The dt-clamp/tunneling budget proved above for the base tune has to hold for
  // every pace, chain amplification included: the X wall stop and the Y ceiling
  // stop are endpoint-only, so no attainable launch may cross a tile in one
  // clamped frame. Read the clamp from source rather than restating it.
  {
    const mainSrc = readFileSync(join(srcDir, 'main.js'), 'utf8');
    const mm = mainSrc.match(/Math\.min\(\s*(\d+(?:\.\d+)?)\s*,\s*t\s*-\s*last\s*\)/);
    const dtMax = (mm ? Number(mm[1]) : 50) / 1000;
    let worstH = 0, worstUp = 0, worstPace = '';
    for (const F of resolved) {
      const TPp = { ...PL, ...F.movement };
      const chainMax = traversalChainMult(F.chain ? F.chain.max : 0, F.chain);
      // chaining amplifies forward speed only — asserted here, and the reason
      // src/sim/player.js multiplies vx and not vy
      const h = Math.max(TPp.runSpeed, TPp.knockbackX,
        TPp.wallJumpX * chainMax, TPp.ledgeLaunchX * chainMax);
      const up = Math.max(TPp.jumpVel, TPp.airJumpVel, TPp.wallJumpY, TPp.ledgeLaunchY);
      if (h > worstH) { worstH = h; worstPace = F.pace.id; }
      worstUp = Math.max(worstUp, up);
      // the pursuing edge is a relative speed too: it can only push the player
      if (F.pursuit.maxSpeed * dtMax >= 0.9) worstH = Infinity;
    }
    ok(worstH * dtMax < 0.9,
       'no pace (chain included) crosses a tile in one clamped frame, worst ' +
       (worstH * dtMax).toFixed(3) + ' tiles in pace ' + worstPace);
    ok(worstUp * dtMax < 0.9,
       'no pace raises a vertical launch into the endpoint-only ceiling check, worst ' +
       (worstUp * dtMax).toFixed(3) + ' tiles');
  }
  ok(traversalChainMult(0, null) === 1 && traversalChainMult(5, null) === 1,
     'no chain config means no launch amplification anywhere else in the game');
  {
    const c = { windowMs: 900, step: 0.1, max: 2, refundAirJump: true };
    ok(traversalChainMult(0, c) === 1 &&
       Math.abs(traversalChainMult(1, c) - 1.1) < 1e-9 &&
       Math.abs(traversalChainMult(9, c) - 1.2) < 1e-9,
       'chain multiplier starts at 1 and clamps at its declared max');
  }

  // surge's auto-launch ledge: expiry throws you off instead of dropping you
  {
    const base = { down: false, jumpBuffered: false, now: 600, until: 500, side: 1, entryVx: 4 };
    const auto = { ...PL, ...TRAVERSAL_PACES.surge.movement };
    const a = traversalLedgeDecision(base, auto);
    ok(a.kind === 'launch' && a.auto === true && a.vy === auto.ledgeLaunchY,
       'ledgeAutoLaunch converts dwell expiry into a launch');
    ok(traversalLedgeDecision({ ...base, down: true }, auto).kind === 'release' &&
       traversalLedgeDecision({ ...base, now: 100, jumpBuffered: true }, auto).auto === false,
       'auto-launch still lets down release and an early jump launch first');
  }
}

/* ============ MOVEMENT VERB PROTOTYPES (wave 3, opt-in) ============= *
 * SNAP HOOK (?hook=1) and the MOMENTUM SPINE (?flow=1). Both are flags-off by
 * default, so the first thing asserted is that the shipped resolution is
 * untouched; everything after that is a property the prototypes' fairness or
 * collision safety depends on:
 *   - every authored anchor is acquirable from a taught position, cannot be
 *     grabbed from ahead (a grab is always forward progress), fits a hanging
 *     body, and cannot be reached through rock;
 *   - the zip's substep is finer than the thinnest wall in the fixture, so a
 *     tether cannot tunnel where the endpoint-only player collision would;
 *   - no chain of any length puts a horizontal launch past the dt-clamp
 *     displacement budget the whole controller relies on.                   */
{
  const HK = TRAVERSAL_HOOK, FL = TRAVERSAL_FLOW;
  const AN = TRAVERSAL_FIXTURE.hookAnchors;
  const solid = (i, j) => levelSolidCell(TL, i, j, 8);
  const bodyFits = (x, y) => {
    for (let i = Math.floor(x - PL.width / 2 + 0.02); i <= Math.floor(x + PL.width / 2 - 0.02); i++)
      for (let j = Math.floor(y + 0.02); j <= Math.floor(y + PL.height - 0.02); j++)
        if (solid(i, j)) return false;
    return true;
  };

  // ---- flags off is the shipped game -----------------------------------
  {
    let inert = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const plain = resolveTraversalPace(id);
      const off = resolveTraversalPace(id, TRAVERSAL_FIXTURE, { hook: false, flow: false });
      if (plain.hook !== null || plain.flow !== null) inert = false;
      if (JSON.stringify(plain.movement) !== JSON.stringify(off.movement)) inert = false;
      // the pace's own movement overrides, untouched by the prototypes
      const want = { ...TRAVERSAL_FIXTURE.movement, ...(TRAVERSAL_PACES[id].movement || {}) };
      if (JSON.stringify(plain.movement) !== JSON.stringify(want)) inert = false;
    }
    ok(inert, 'no ?hook / ?flow: every pace resolves exactly as it shipped');
  }
  {
    let overlay = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const on = resolveTraversalPace(id, TRAVERSAL_FIXTURE, { hook: true, flow: true });
      const plain = resolveTraversalPace(id);
      if (JSON.stringify(on.hook) !== JSON.stringify(HK)) overlay = false;
      if (JSON.stringify(on.flow) !== JSON.stringify(FL)) overlay = false;
      // flow's ONLY movement override is surge's auto-launch, generalized
      const diff = Object.keys(on.movement).filter((k) =>
        JSON.stringify(on.movement[k]) !== JSON.stringify(plain.movement[k]));
      if (diff.length !== (plain.movement.ledgeAutoLaunch ? 0 : 1) ||
          (diff.length === 1 && diff[0] !== 'ledgeAutoLaunch')) overlay = false;
      if (on.movement.ledgeAutoLaunch !== true) overlay = false;
      // and the geometry, routes and stakes are still the pace's own
      if (JSON.stringify(on.enemies) !== JSON.stringify(plain.enemies) ||
          JSON.stringify(on.platforms) !== JSON.stringify(plain.platforms) ||
          JSON.stringify(on.rewards) !== JSON.stringify(plain.rewards)) overlay = false;
    }
    ok(overlay,
       'arming both verbs adds the two tuning tables and exactly one movement override');
  }

  // ---- anchor data ------------------------------------------------------
  {
    let valid = true, ordered = true;
    const ids = new Set();
    for (let i = 0; i < AN.length; i++) {
      const a = AN[i];
      if (ids.has(a.id) || typeof a.note !== 'string' || !a.teaches) valid = false;
      ids.add(a.id);
      if (a.x < TRAVERSAL_FIXTURE.bounds.x0 || a.x >= TRAVERSAL_FIXTURE.bounds.x1) valid = false;
      if (!(a.arc && a.arc.length === 2 && a.arc[0] >= 0 && a.arc[0] < 360 &&
            a.arc[1] >= 10 && a.arc[1] <= 90)) valid = false;
      if (solid(Math.floor(a.x), Math.floor(a.y))) valid = false;   // never embedded
      const hold = hookHoldPoint(a, HK);
      if (!bodyFits(hold.x, hold.y)) valid = false;                 // a body can hang here
      if (i > 0 && AN[i - 1].x > a.x) ordered = false;
    }
    ok(AN.length >= 4 && AN.length <= 6 && valid,
       'four to six anchors, unique, in bounds, not embedded, and hangable');
    ok(ordered, 'anchors are authored in forward order, so acquisition ties break forward');
  }

  // ---- an anchor can never be grabbed from ahead of it ------------------
  {
    let forwardOnly = true;
    for (const a of AN) {
      // a position directly ahead at hand height, and one ahead-and-above
      if (hookArcAccepts(a, a.x + 4, a.y) || hookArcAccepts(a, a.x + 4, a.y + 3))
        forwardOnly = false;
    }
    ok(forwardOnly,
       'every anchor arc rejects an approach from ahead: a grab is always forward progress');
  }

  // ---- reachability: every anchor is acquirable from a taught position ---
  {
    const conns = TRAVERSAL_FIXTURE.connectors;
    const rows = [];
    let allReachable = true, teachesValid = true;
    for (const a of AN) {
      const from = conns.filter((c) =>
        hookAnchorReachableFrom(a, c.x, c.y, HK, solid, 1));
      rows.push(a.id + '<-' + (from.map((c) => c.id).join('/') || 'NOTHING'));
      if (!from.length) allReachable = false;
      if (!from.some((c) => c.id === a.teaches)) teachesValid = false;
    }
    ok(allReachable,
       'every hook anchor is acquirable from at least one authored connector: ' + rows.join(' '));
    ok(teachesValid,
       'each anchor is acquirable from the connector it claims to teach from');
  }

  // ---- the roof line is priced: leaving it is a real option -------------
  {
    const span = AN.find((a) => a.id === 'pocket-span');
    const roof = TRAVERSAL_FIXTURE.connectors.find((c) => c.id === 'chimney-top');
    ok(!!span && !!roof && hookAnchorReachableFrom(span, roof.x, roof.y, HK, solid, 1),
       'the roof (chimney-top) can grab the pocket-span anchor, so leaving the degenerate ' +
       'fast line is an available choice rather than a nerf');
    // …and that grab moves the player FORWARD and DOWN, off the roof
    ok(span.x > roof.x && hookHoldPoint(span, HK).y < roof.y,
       'and that grab is a forward, downward transfer (roof y=' + roof.y +
       ' → hold y=' + hookHoldPoint(span, HK).y.toFixed(2) + ')');
  }

  // ---- line of sight is honest ------------------------------------------
  {
    const wall = TRAVERSAL_FIXTURE.solidRects.find((r) => r.id === 'chimney-left');
    const thinnest = Math.min.apply(null, TRAVERSAL_FIXTURE.solidRects.map((r) => r.x1 - r.x0));
    ok(HK.losStepTiles < thinnest,
       'the tether sight step (' + HK.losStepTiles + ') is finer than the thinnest authored wall (' +
       thinnest + '), so it cannot step over one');
    const midRow = wall.y0 + 1;
    ok(!hookLineClear(wall.x0 - 2, midRow + 0.5, wall.x1 + 2, midRow + 0.5, solid, HK.losStepTiles),
       'a tether line through a wall is refused');
    ok(hookLineClear(wall.x0 - 2, wall.y1 + 1.5, wall.x1 + 2, wall.y1 + 1.5, solid, HK.losStepTiles),
       'a tether line over that same wall is allowed');
    // the dare pocket keeps its authored retreat: no hook out from under the roof
    const pocketFloorY = TRAVERSAL_FIXTURE.groundRuns.find((r) => r.x0 === 47).y;
    const span = AN.find((a) => a.id === 'pocket-span');
    ok(!hookAnchorReachableFrom(span, 52, pocketFloorY, HK, solid, 1),
       'standing in the dare pocket cannot hook out through the overhang — the wager keeps ' +
       'its measured retreat');
  }

  // ---- the zip cannot tunnel at the dt clamp ----------------------------
  {
    const mainSrc = readFileSync(join(srcDir, 'main.js'), 'utf8');
    const mm = mainSrc.match(/Math\.min\(\s*(\d+(?:\.\d+)?)\s*,\s*t\s*-\s*last\s*\)/);
    const dtMax = (mm ? Number(mm[1]) : 50) / 1000;
    const travel = HK.zipSpeed * dtMax;
    const steps = Math.max(1, Math.ceil(travel / HK.zipSubstepTiles));
    const perStep = travel / steps;
    ok(perStep <= HK.zipSubstepTiles + 1e-9 && HK.zipSubstepTiles <= 0.5,
       'the zip advances at most ' + perStep.toFixed(3) +
       ' of a tile per substep at the dt clamp (budget ' + HK.zipSubstepTiles + ')');
    // a substepped body cannot cross a 1-wide wall: clearing it needs
    // 1 + player width of travel, i.e. several substeps, each of which is tested
    ok(HK.zipSubstepTiles < 1 - 1e-9,
       'and a substep is smaller than a wall, so every crossing attempt is tested inside it');
    // the whip, and the drive, under every pace with both verbs armed
    let worstH = 0, worstUp = 0, worst = '';
    for (const id of TRAVERSAL_PACE_IDS) {
      const F = resolveTraversalPace(id, TRAVERSAL_FIXTURE, { hook: true, flow: true });
      const TPp = { ...PL, ...F.movement };
      const paceChain = traversalChainMult(F.chain ? F.chain.max : 0, F.chain);
      const composed = flowCompose(paceChain, F.flow.max, F.flow);
      const cands = [
        TPp.runSpeed * flowSpeedMult(F.flow.max, F.flow),       // sustained drive
        Math.min(F.flow.launchCeiling, TPp.wallJumpX * composed),
        Math.min(F.flow.launchCeiling, TPp.ledgeLaunchX * composed),
        F.hook.launchCeiling,                                   // the whip's own bound
        TPp.knockbackX,
      ];
      const h = Math.max.apply(null, cands);
      if (h > worstH) { worstH = h; worst = id; }
      worstUp = Math.max(worstUp, TPp.jumpVel, TPp.airJumpVel, TPp.wallJumpY,
        TPp.ledgeLaunchY, F.hook.launchY);
    }
    ok(worstH * dtMax < 0.9,
       'hook + flow + every pace chain keeps horizontal displacement under a tile per clamped ' +
       'frame, worst ' + (worstH * dtMax).toFixed(3) + ' tiles (' + worstH.toFixed(2) +
       ' u/s in ' + worst + ')');
    ok(worstUp * dtMax < 0.9,
       'no verb raises an upward launch into the endpoint-only ceiling check, worst ' +
       (worstUp * dtMax).toFixed(3) + ' tiles');
    // the whip must not out-jump a jump, or the hook becomes a better jump button
    let sane = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const TPp = { ...PL, ...resolveTraversalPace(id).movement };
      if (!(HK.launchY < TPp.jumpVel && HK.launchX >= TPp.runSpeed * 0.8)) sane = false;
    }
    ok(sane, 'the whip has launch authority but never beats a plain jump for height');
  }

  // ---- hook state-machine invariants (pure) -----------------------------
  {
    ok(HK.sameAnchorLockMs > HK.cooldownMs && HK.cooldownMs > 0,
       'a released anchor stays locked longer than the global cooldown: no instant re-grab');
    ok(HK.hangMs > 0 && HK.hangMs <= 200 && HK.zipMaxMs > 0 && HK.zipMaxMs <= 600,
       'the dangle is readable but never a pause, and a zip can never become a ride');
    ok(HK.minRange > PL.height * 0.8 && HK.range > HK.minRange &&
       HK.range < TRAVERSAL_FIXTURE.run.lookAheadTiles * 4,
       'acquisition has both a floor (no grabbing what you stand under) and a ceiling');
    // whip direction: from behind = forward, overhead = facing
    const a = { id: 'x', x: 50, y: 8, arc: [200, 70] };
    ok(hookWhipDir(a, 45, 1) === 1 && hookWhipDir(a, 55, -1) === -1 &&
       hookWhipDir(a, 50.1, 1) === 1 && hookWhipDir(a, 50.1, -1) === -1,
       'a whip always throws the way the player travelled through the anchor');
    // entry speed is preserved and then bounded
    const slow = hookWhipVelocity(HK, 1, 3, 1);
    const fast = hookWhipVelocity(HK, 1, 14, 1);
    const capped = hookWhipVelocity(HK, 1, 14, 1.3);
    ok(slow.vx === HK.launchX && fast.vx === 14 && capped.vx === HK.launchCeiling &&
       slow.vy === HK.launchY,
       'the whip preserves a fast approach, floors a slow one, and clamps at its ceiling');
    // the zip march: arrives, stops at the last position that fit, never overshoots
    const open = () => true;
    const m1 = hookZipMarch({ x: 0, y: 0 }, { x: 10, y: 0 }, 16, 1 / 60, 0.3, open);
    ok(!m1.arrived && Math.abs(m1.x - 16 / 60) < 1e-9 && m1.traveled <= 16 / 60 + 1e-9,
       'one frame of zip travels exactly speed x dt and no further');
    const m2 = hookZipMarch({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 16, 1 / 60, 0.3, open);
    ok(m2.arrived && m2.x === 0.1, 'a zip inside one frame arrives exactly on the anchor');
    const blocked = hookZipMarch({ x: 0, y: 0 }, { x: 10, y: 0 }, 16, 1 / 60, 0.05,
      (x) => x < 0.12);
    ok(blocked.blocked && blocked.x < 0.12 && blocked.x > 0,
       'a blocked zip stops at the last position that fit and reports it, so it can launch');
  }

  // ---- momentum spine (pure) -------------------------------------------
  {
    ok(FL.linkVerbs.indexOf('air') < 0 && FL.linkVerbs.length === 3,
       'only contact launches build a chain — mashing the air jump pays nothing');
    ok(flowMult(0, FL) === 1 && flowMult(-3, FL) === 1 &&
       Math.abs(flowMult(FL.max, FL) - (1 + FL.step * FL.max)) < 1e-9 &&
       flowMult(FL.max + 5, FL) === flowMult(FL.max, FL),
       'the chain multiplier starts at 1, rises per link, and clamps at its max');
    ok(flowCompose(1.18, FL.max, FL) === FL.maxTotalMult &&
       flowCompose(1, 0, FL) === 1 && flowCompose(1, 1, FL) > 1,
       'composing with a pace chain is capped at maxTotalMult');
    ok(flowSpeedMult(FL.max, FL) <= FL.speedMultCap + 1e-9 && flowSpeedMult(0, FL) === 1,
       'the sustained drive multiplier is capped and neutral at rest');
    ok(flowCompose(1, 0, null) === 1 && flowMult(3, null) === 1 &&
       flowLaunchMultFor(1.18, 4, null, 13.5) === 1.18,
       'with no flow config nothing anywhere is amplified');
    // the ceiling holds for every base speed a launch can carry
    let bounded = true;
    for (const base of [6, 10.8, 11.6, 13.5, 15.9, 20]) {
      for (let links = 0; links <= FL.max; links++) {
        const m = flowLaunchMultFor(1.18, links, FL, base);
        if (base * m > FL.launchCeiling + 1e-9) bounded = false;
        if (m > flowCompose(1.18, links, FL) + 1e-9) bounded = false;
      }
    }
    ok(bounded,
       'no chain length and no entry speed can push an amplified launch past the ceiling');
    // decay: a bounce keeps the chain, standing sheds it one link at a time
    {
      const dtMs = 1000 / 60;
      const stepFor = (ms, grounded, from) => {
        let st = from;
        for (let t = 0; t < ms; t += dtMs)
          st = flowStepState(st, { dtMs, grounded, now: 1e6 }, FL);
        return st;
      };
      const full = flowAddLink(flowAddLink(flowAddLink(flowAddLink(
        flowFreshState(), 0, FL), 0, FL), 0, FL), 0, FL);
      ok(full.links === FL.max, 'four contact launches fill the chain');
      const bounced = stepFor(FL.groundGraceMs * 0.8, true, full);
      ok(bounced.links === FL.max,
         'a bounce through the floor inside the grace keeps every link');
      const shed = stepFor(FL.groundGraceMs + FL.groundDecayMs * 1.5, true, full);
      ok(shed.links === FL.max - 1,
         'standing past the grace sheds exactly one link per decay step, got ' + shed.links);
      const gone = stepFor(flowGroundLifetimeMs(FL.max, FL) + 3 * dtMs, true, full);
      ok(gone.links === 0,
         'a full chain dies on the floor in ' + flowGroundLifetimeMs(FL.max, FL) +
         ' ms — quickly, but not instantly');
      ok(flowGroundLifetimeMs(FL.max, FL) < 1000 && FL.groundGraceMs >= 150,
         'that lifetime is under a second and its grace is long enough for a real bounce');
      const expired = flowStepState({ ...full, expiresAt: 100 },
        { dtMs, grounded: false, now: 200 }, FL);
      ok(expired.links === 0,
         'and an airborne chain expires on its own window: a long fall is not a chain');
      const alive = flowStepState({ ...full, expiresAt: 1000 },
        { dtMs, grounded: false, now: 200 }, FL);
      ok(alive.links === FL.max, 'inside the window, airborne time costs nothing');
    }
  }
}

/* ============ THE AUTHORED SLOPE — rib run (?ribrun=1) ============== *
 * The movement lane's other live candidate next to FLOW (decisions.md entry
 * 5). src/pure/ribrun.js swaps the fixture's lattice for one long ascending
 * ribline; what is asserted here is the SLOPE CONTRACT — that the rib is
 * climbable with the FROZEN jump constants, that its cadence is a property
 * of the geometry rather than of a retune, and that a mistimed hop is
 * repaid rather than punished — plus the same structural rules the shipped
 * fixture's own ground, platforms, connectors and routes are held to.
 *
 * Nothing here may pass by changing a movement constant: every number is
 * derived from the resolved tune, and the tune is asserted frozen next to
 * the shipped fixture's above.                                          */
{
  const RIB = TRAVERSAL_RIBRUN;
  const RF = ribrunFixture();
  const RT = { ...PL, ...RF.movement };
  const decks = ribrunDecks();
  const flanges = ribrunFlanges();
  const RL = buildTraversalLevel(CONFIG, RF);
  const RB = RF.bounds;
  const solid = function (x, y) { return levelSolidCell(RL, x, y, 8); };

  // --- the flag is genuinely off by default ---------------------------
  ok(RF !== TRAVERSAL_FIXTURE && RF.id === 'traversal-ribrun-v1' &&
     JSON.stringify(TRAVERSAL_FIXTURE.groundRuns) !== JSON.stringify(RF.groundRuns) &&
     JSON.stringify(buildTraversalLevel(CONFIG).groundH) === JSON.stringify(TL.groundH),
     'the rib run is an overlay: it never touches the shipped fixture or its built level');
  {
    // The two rules resolveTraversalPace grew for overlay fixtures must be
    // no-ops for every shipped URL: same rewards, same rosters, same order.
    let unchanged = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const F = resolveTraversalPace(id);
      const pace = TRAVERSAL_PACES[id];
      const want = [
        { ...TRAVERSAL_FIXTURE.darePocket.reward, ...(pace.pocketReward || {}) },
        ...(pace.rewards || []),
      ];
      if (JSON.stringify(F.rewards) !== JSON.stringify(want)) unchanged = false;
      if (JSON.stringify(F.enemies) !==
          JSON.stringify(pace.enemies || TRAVERSAL_FIXTURE.enemies)) unchanged = false;
      if (F.rewards.some(function (r) { return traversalRewardBuried(TRAVERSAL_FIXTURE, r); }))
        unchanged = false;
    }
    ok(unchanged,
       'reward culling and hostile-free resolution are inert for the shipped fixture at every pace');
    ok(traversalGroundYAt(TRAVERSAL_FIXTURE, 54) === 1 &&
       traversalGroundYAt(TRAVERSAL_FIXTURE, TRAVERSAL_FIXTURE.bounds.x1) === null &&
       traversalGroundYAt(null, 54) === null,
       'the deck lookup reads authored ground runs and stays null outside them');
  }

  // --- the slope itself ------------------------------------------------
  {
    let monotone = true, uniform = true, covered = 0;
    for (let i = 1; i < decks.length; i++) {
      if (decks[i].y - decks[i - 1].y !== RIB.riser) monotone = false;
      if (i < decks.length - 1 && decks[i].x1 - decks[i].x0 !== RIB.tread) uniform = false;
      if (decks[i].x0 !== decks[i - 1].x1) monotone = false;   // no seam, no gap
    }
    for (const d of decks) covered += d.x1 - d.x0;
    const climb = decks[decks.length - 1].y - decks[0].y;
    ok(monotone && uniform && decks.length === RIB.steps + 1,
       'the rib is one contiguous monotone staircase: ' + RIB.steps + ' risers of ' +
       RIB.riser + ' over treads of ' + RIB.tread);
    ok(covered === RB.x1 - RB.x0 && decks[0].x0 === RB.x0 &&
       decks[decks.length - 1].x1 === RB.x1,
       'rib decks cover the fixture bounds exactly once with no gap column');
    ok(climb === RIB.steps * RIB.riser && climb >= 12,
       'the rib climbs ' + climb + ' tiles — a long straight, not a step up');
    const slope = RIB.riser / RIB.tread;
    ok(slope > 0.2 && slope < 0.5,
       'the authored slope reads as a diagonal (' + slope.toFixed(3) +
       ' = ' + (Math.atan(slope) * 180 / Math.PI).toFixed(1) + ' degrees)');
  }
  {
    // every riser is a real vertical face in the BUILT level, and every deck
    // is open above: an ascending line must never hide an overhead.
    let faces = 0, openAbove = true;
    for (let i = 1; i < decks.length; i++) {
      const face = decks[i].x0, lower = decks[i - 1].y, upper = decks[i].y;
      let wall = true;
      for (let j = lower; j < upper; j++) if (!solid(face, j)) wall = false;
      if (wall && !solid(face, upper) && !solid(face - 1, lower)) faces++;
    }
    const headroom = RIB.riser + ribrunJumpArc(RT).apex + PL.height;
    for (const d of decks)
      for (let x = d.x0; x < d.x1; x++)
        for (let j = d.y; j < d.y + headroom; j++) if (solid(x, j)) openAbove = false;
    ok(faces === RIB.steps,
       'every riser is a solid face with an open lip and an open approach, got ' + faces);
    ok(openAbove,
       'no rib column hides an overhead inside a full jump over its own deck');
  }

  // --- the slope contract, against the frozen tune ---------------------
  {
    const arc = ribrunJumpArc(RT);
    const clear = ribrunClearSpan(RT, RIB.riser);
    const hop = ribrunHopSpan(RT);
    ok(RT.jumpVel === TRAVERSAL_FIXTURE.movement.jumpVel &&
       RT.gravity === TRAVERSAL_FIXTURE.movement.gravity &&
       RT.runSpeed === TRAVERSAL_FIXTURE.movement.runSpeed &&
       RT.airJumps === PL.airJumps,
       'the rib run inherits the fixture tune untouched — the slope does the work');
    ok(arc.apex > RIB.riser + 1,
       'one grounded jump clears a riser with over a tile of analytic margin (apex ' +
       arc.apex.toFixed(2) + ' vs riser ' + RIB.riser + ')');
    ok(clear && clear.width > 4,
       'the window in which a jump clears the next riser is ' + clear.width.toFixed(2) +
       ' tiles wide (' + (clear.width / RT.runSpeed * 1000).toFixed(0) + ' ms at run speed)');
    ok(clear.to < RIB.tread && RIB.tread - clear.to < 1,
       'a cleared riser lands back on the deck ' + (RIB.tread - clear.to).toFixed(2) +
       ' tiles before the next one: a real footfall, and a short one');
    ok(clear.to / RIB.tread > 0.85,
       'the rib is ' + (100 * clear.to / RIB.tread).toFixed(0) +
       '% airborne at a constant cadence — the momentum is the geometry');
    ok(hop > RIB.tread && hop < RIB.tread + 1.5,
       'one full jump carries ' + hop.toFixed(2) + ' tiles, so the tread of ' + RIB.tread +
       ' is one hop: a constant cadence is a fixed point of the rib');
    ok(clear.from < RIB.tread - clear.to + 1,
       'and the jump that starts that cadence can be made from the footfall itself');
  }
  {
    // Tier 3: the riser face converts a fall into a ledge catch. Proved by
    // calling the real probe against the real built rib, from the pinned
    // position the x-collision leaves a body in.
    const band = ribrunCatchBand(RT, RIB.riser);
    const step = ribrunCatchStep(RT, RIB.riser, 0.05);
    ok(band.height > 0.6 && band.lo > 0 && band.hi < RIB.riser,
       'the catch band is a real ' + band.height.toFixed(2) +
       '-tile window strictly between the lower deck and the lip');
    ok(step.step < band.height,
       'a body pinned to the face cannot step over that band in one clamped frame (' +
       step.step.toFixed(2) + ' vs ' + band.height.toFixed(2) + ' tiles)');
    let caught = 0, missedLow = 0;
    const geo = {
      isSolid: solid,
      allowsGrab: function () { return true; },
      minCellX: 1, maxCellX: CONFIG.levelLength - 1, minPlayerX: -Infinity,
    };
    for (let i = 1; i < decks.length; i++) {
      const face = decks[i].x0, lower = decks[i - 1].y;
      const pinnedX = face - PL.width / 2 - 0.001;
      const mid = lower + (band.lo + band.hi) / 2;
      const hit = traversalLedgeProbe({
        x: pinnedX, y: mid, hw: PL.width / 2, h: PL.height,
        vx: RT.runSpeed, vy: -6, grounded: false, down: false, hInput: 1,
        now: 1000, recatchUntil: 0,
      }, geo, RT);
      if (hit && hit.cellX === face && hit.topY === decks[i].y) caught++;
      const below = traversalLedgeProbe({
        x: pinnedX, y: lower + 0.02, hw: PL.width / 2, h: PL.height,
        vx: RT.runSpeed, vy: -6, grounded: false, down: false, hInput: 1,
        now: 1000, recatchUntil: 0,
      }, geo, RT);
      if (below === null) missedLow++;
    }
    ok(caught === RIB.steps,
       'every riser converts a pinned fall inside the band into a ledge catch on its own lip, got ' +
       caught + '/' + RIB.steps);
    ok(missedLow === RIB.steps,
       'and a body already down at deck height is not silently caught — the band is the contract');
  }
  {
    // Tier 2: the flanges, and the pocket they deliberately leave in front
    // of each face so tier 3 still exists.
    const band = ribrunCatchBand(RT, RIB.riser);
    let valid = true, hangsFree = true, tiles = true;
    for (let i = 0; i < flanges.length; i++) {
      const f = flanges[i], lower = decks[i].y, upper = decks[i + 1].y;
      if (f.y !== upper - RIB.flange.drop || f.x1 > f.face - PL.width / 2 - 0.05 ||
          f.x0 <= decks[i].x0 || f.x1 <= f.x0) valid = false;
      // a one-way plate must hang in open air over the deck it overlooks
      for (let x = Math.floor(f.x0); x <= Math.floor(f.x1 - 1e-9); x++)
        if (solid(x, Math.floor(f.y)) || solid(x, Math.floor(f.y) - 1)) hangsFree = false;
      // the three repair tiers must leave no hole: catch band, then flange,
      // then the deck above.
      if (!(f.y - lower <= band.hi + 1e-9 && f.y - lower > 0 && f.y < upper)) tiles = false;
    }
    ok(flanges.length === RIB.steps && valid,
       'one flange per riser, one tile under its deck, stopping clear of the face');
    ok(hangsFree, 'every flange hangs in open air over the deck below it');
    ok(tiles,
       'the flange picks up exactly where the catch band stops: no miss height falls between the tiers');
    ok(RIB.flange.gap > PL.width / 2,
       'the catch pocket in front of each face is wider than a pinned body (' +
       RIB.flange.gap + ' vs ' + (PL.width / 2) + ' tiles), so tier 3 is reachable');
    ok(RF.platforms.length === RIB.steps &&
       RF.platforms.every(function (p, i) {
         return p.id === flanges[i].id && p.x0 === flanges[i].x0 &&
           p.x1 === flanges[i].x1 && p.y === flanges[i].y;
       }) && RF.solidRects.length === 0,
       'the fixture fields exactly those flanges as one-way plates and no lattice walls');
  }

  // --- the fixture's own structural rules -----------------------------
  {
    const ids = new Set();
    let integrity = true;
    for (const c of RF.connectors) {
      if (typeof c.id !== 'string' || ids.has(c.id) ||
          !Number.isFinite(c.x) || !Number.isFinite(c.y) ||
          c.x < RB.x0 || c.x >= RB.x1 || solid(Math.floor(c.x), Math.floor(c.y)))
        integrity = false;
      ids.add(c.id);
    }
    const known = function (id) { return ids.has(id); };
    ok(integrity && ids.size === RF.connectors.length &&
       known(RF.entry) && known(RF.exit),
       'rib connectors are unique, in bounds, standing in open air, and include entry/exit');
    ok(RF.edges.every(function (e) { return known(e.from) && known(e.to); }) &&
       RF.routes.length === 1 &&
       RF.routes[0].connectorIds.every(known) &&
       RF.routes[0].connectorIds.length === RF.connectors.length,
       'the ribline route names every connector once and every edge resolves');
    const crest = decks[decks.length - 1];
    ok(RF.rejoin.x0 >= crest.x0 && RF.rejoin.x0 < crest.x1 && RF.rejoin.y === crest.y &&
       RF.rejoin.x0 === TRAVERSAL_FIXTURE.rejoin.x0,
       'the victory line sits on the crest at the same x the shipped fixture uses');
    ok(RF.run.playerSpawn.x === TRAVERSAL_FIXTURE.run.playerSpawn.x &&
       RF.run.playerSpawn.y === decks[0].y &&
       RF.run.startScroll === TRAVERSAL_FIXTURE.run.startScroll &&
       RF.run.endScroll === TRAVERSAL_FIXTURE.run.endScroll,
       'spawn and run window are the fixture\'s own: only the ground moved');
    ok(RF.darePocket.bounds.x0 === RF.darePocket.bounds.x1 &&
       RF.hostileFree === true && RF.enemies.length === 0,
       'a single line has no dare pocket and fields no lattice-authored hostiles');
    const rw = RF.darePocket.reward;
    const deckAt = traversalGroundYAt(RF, rw.x);
    ok(deckAt !== null && rw.y > deckAt && rw.y - deckAt < PL.height,
       'the stake rides the line: ' + (rw.y - deckAt).toFixed(2) +
       ' tiles over the deck at x=' + rw.x + ', grabbed on the way through');
    let culled = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const F = resolveTraversalPace(id, RF);
      if (F.enemies.length !== 0) culled = false;
      for (const r of F.rewards) {
        const g = traversalGroundYAt(RF, r.x);
        if (g === null || r.y < g) culled = false;
      }
    }
    ok(culled,
       'at every pace the rib fields no hostiles and no stake buried inside its own rock');
  }
}

/* ------- the rib run, driven through the REAL sim loop ---------------- *
 * The arithmetic above proves the slope is climbable in principle. This
 * proves it is climbed — by the unmodified src/sim/player.js, from the
 * fixture's own spawn, with the fixture's own pursuing edge, under a
 * two-rule policy that is the whole point of the acceptance test: HOLD
 * RIGHT, and press JUMP when there is ground (or a lip) under you. No new
 * key, no anchor, no timing table.
 *
 * It runs at three frame times because the discrete jump apex is
 * frame-rate dependent and the rib's whole claim is that the FROZEN
 * constants clear it: 60Hz, 30Hz, and src/main.js's own dt clamp
 * (0.05 s, 20fps-equivalent), which is the worst case a real session can
 * reach. The repair tiers are load-bearing here, not decorative — the
 * three frame times land in different phases of the rib and each ends up
 * using a different one.                                                */
{
  const child = `
    globalThis.__HB_QUERY__ = 'slice=traversal&ribrun=1' + (process.env.HB_EXTRA || '');
    const base = ${JSON.stringify('file://' + join(srcDir, 'sim'))};
    const M = await import(${JSON.stringify('file://' + join(srcDir, 'mode.js'))});
    const E = await import(base + '/edges.js');
    const T = await import(base + '/time.js');
    const I = await import(base + '/input.js');
    const PLm = await import(base + '/player.js');
    const SC = await import(base + '/scroll.js');
    const WG = await import(base + '/wavegate.js');
    const p = PLm.player;
    const F = M.ACTIVE_SLICE;
    for (const c of WG.cornerEvents) c.state = 'done';
    // A calibrated 16:10 frustum, not an infinite one: the pursuing edge and
    // the crush plane are part of what the rib has to be climbed against.
    E.setEdges(-9, 17);
    function run(dt) {
      p.x = F.run.playerSpawn.x; p.y = F.run.playerSpawn.y;
      p.vx = 0; p.vy = 0; p.grounded = true; p.onOneWay = null; p.jumpCutDone = true;
      p.airJumpsLeft = PLm.P.airJumps; p.hp = PLm.P.maxHealth;
      p.iframesUntil = 0; p.hitstunUntil = 0; p.coyoteUntil = 0; p.dropUntil = 0;
      p.fallbackStreak = 0; p.fallbackEarnedTiles = 0; p.edgePinnedMs = 0;
      p.traversalChain = 0; p.traversalChainUntil = 0;
      PLm.clearPlayerTraversal(0);
      I.clearJumpBuffer();
      for (const k in I.keys) I.keys[k] = false;
      T.setScrollX(F.run.startScroll);
      T.resetSliceStats && T.resetSliceStats();
      const t0 = T.gameMs;
      I.keys.right = true;                       // rule 1: hold right
      let releaseAt = 0, frames = 0, airborne = 0, slowMs = 0, maxSlowMs = 0;
      let catches = 0, flanges = 0, walls = 0, lastState = 'free', lastGrounded = true;
      const flangeY = new Set(F.platforms.map(function (pl) { return pl.y; }));
      let victoryMs = -1, maxY = p.y, airJumps = 0, prevAirJumpsLeft = p.airJumpsLeft;
      for (let i = 0; i < 4000; i++) {
        T.advanceGameMs(dt * 1000);
        const now = T.gameMs;
        // rule 2: jump when there is something under you — deck, flange or lip
        if ((p.grounded || p.traversalState === 'ledge') && now >= releaseAt) {
          I.bufferJumpUntil(now + PLm.P.jumpBufferMs);
          I.keys.jump = true;
          releaseAt = now + 380;
        }
        if (now >= releaseAt) I.keys.jump = false;
        SC.updateScroll(dt);
        PLm.updatePlayer(dt);
        frames++;
        if (!p.grounded) airborne++;
        // every hold the rib can put on forward motion — a hang, a slide, a
        // re-acceleration off a stop — measured as one number
        if (Math.abs(p.vx) < 2) { slowMs += dt * 1000; maxSlowMs = Math.max(maxSlowMs, slowMs); }
        else slowMs = 0;
        if (p.airJumpsLeft < prevAirJumpsLeft) airJumps++;
        prevAirJumpsLeft = p.airJumpsLeft;
        if (p.traversalState === 'ledge' && lastState !== 'ledge') catches++;
        if (p.traversalState === 'wall' && lastState !== 'wall') walls++;
        if (p.grounded && !lastGrounded && flangeY.has(p.y)) flanges++;
        lastState = p.traversalState; lastGrounded = p.grounded;
        maxY = Math.max(maxY, p.y);
        if (p.x >= F.rejoin.x0) { victoryMs = now - t0; break; }
      }
      return {
        dt, victoryMs, x: p.x, y: p.y, maxY, hp: p.hp, airJumps,
        spawnX: F.run.playerSpawn.x,
        airborneFrac: airborne / frames, maxSlowMs, catches, flanges, walls,
        setbacks: T.sliceStats.setbacks, failures: T.sliceStats.failures,
      };
    }
    console.log(JSON.stringify({
      runs: [run(1 / 60), run(1 / 30), run(0.05)],
      spawnY: F.run.playerSpawn.y,
      crestY: F.rejoin.y,
      targetPlaySeconds: F.targetPlaySeconds,
    }));
  `;
  function ribChild(extra) {
    try {
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child],
        { encoding: 'utf8', env: { ...process.env, HB_EXTRA: extra || '' } }));
    } catch (e) {
      console.error('pathcheck: rib run child failed: ' + e.message);
      return null;
    }
  }
  const sim = ribChild('');
  ok(!!sim, 'the rib run steps headlessly through the real sim with no DOM');
  if (sim) {
    const cleared = sim.runs.filter(function (r) { return r.victoryMs >= 0; });
    ok(cleared.length === 3,
       'hold right + jump on contact climbs the whole rib at 60Hz, 30Hz and the dt clamp, got ' +
       sim.runs.map(function (r) {
         return (1 / r.dt).toFixed(0) + 'Hz:' + (r.victoryMs >= 0 ? 'clear' : 'x=' + r.x.toFixed(1));
       }).join(' '));
    for (const r of cleared) {
      const label = (1 / r.dt).toFixed(0) + 'Hz';
      const seconds = r.victoryMs / 1000;
      ok(seconds >= sim.targetPlaySeconds.min && seconds <= sim.targetPlaySeconds.max,
         label + ': the rib is a ' + seconds.toFixed(2) +
         's pass, inside the fixture\'s own 4-12 s window');
      ok(r.maxY - sim.spawnY >= 12 && r.y >= sim.crestY,
         label + ': the run actually ascends ' + (r.maxY - sim.spawnY).toFixed(1) +
         ' tiles and finishes on the crest');
      ok(r.airborneFrac > 0.8,
         label + ': ' + (100 * r.airborneFrac).toFixed(0) +
         '% of the climb is airborne — sustained, not a stair-stop shuffle');
      const avg = (r.x - r.spawnX) / seconds;
      ok(avg > 0.85 * TRAVERSAL_FIXTURE.movement.runSpeed,
         label + ': the whole climb averages ' + avg.toFixed(1) + ' t/s, ' +
         (100 * avg / TRAVERSAL_FIXTURE.movement.runSpeed).toFixed(0) +
         '% of flat-ground run speed with every repair paid for');
      ok(r.maxSlowMs < 600,
         label + ': the rib never holds RIG still for long — longest stretch under 2 t/s is ' +
         r.maxSlowMs.toFixed(0) + ' ms (a hang, a slide, or a re-acceleration off one)');
      ok(r.setbacks === 0 && r.failures === 0 && r.hp === PL.maxHealth,
         label + ': the climb costs no hull and takes no fallback');
      ok(r.airJumps === 0,
         label + ': the air jump is never spent — the rib is climbed on the ground jump alone');
    }
    ok(sim.runs.some(function (r) { return r.catches > 0; }) &&
       sim.runs.some(function (r) { return r.flanges > 0 || r.walls > 0; }),
       'across the three frame times the repair tiers are really exercised (catches ' +
       sim.runs.map(function (r) { return r.catches; }).join('/') + ', flange landings ' +
       sim.runs.map(function (r) { return r.flanges; }).join('/') + ')');
  }
  // FLOW composes rather than competes: same geometry, same policy, and the
  // momentum spine's auto-launch turns a catch into a launch with no press.
  const flowed = ribChild('&flow=1');
  ok(!!flowed && flowed.runs.every(function (r) { return r.victoryMs >= 0; }),
     'the rib run composes with ?flow=1 at every frame time — the A/B is one URL apart');
}

/* ------------- headroom over every authored ground run --------------- *
 * A route you can run along must not hide an invisible underside: if the
 * clearance over a ground column is barely the player's height, arriving a
 * fraction high (a hop, a landing bounce) bonks a ceiling the player never
 * saw and converts a sprint into a wall slide. This caught a 0.3-tile
 * threading window at the chimney mouths (x 39 and 44) on the low route.  */
{
  let worst = Infinity, worstX = -1;
  for (const run of TRAVERSAL_FIXTURE.groundRuns) {
    for (let x = run.x0; x < run.x1; x++) {
      let ceil = Infinity;
      for (const r of TRAVERSAL_FIXTURE.solidRects) {
        // a rect standing ON the deck (the pocket's dead-end wall) is a visible
        // wall, not a hidden ceiling — only overheads count here
        if (x < r.x0 || x >= r.x1 || r.y0 <= run.y) continue;
        ceil = Math.min(ceil, r.y0);
      }
      const clearance = ceil - run.y;
      if (clearance < worst) { worst = clearance; worstX = x; }
    }
  }
  ok(worst >= PL.height + 1.0,
     'every authored ground column clears the player with a tile of slack, worst ' +
     worst.toFixed(2) + ' tiles at x=' + worstX + ' (need ' + (PL.height + 1) + ')');
  // and the trimmed chimney still presents enough wall to kick off from its floor
  {
    const floor = TRAVERSAL_FIXTURE.platforms.find(function (p) { return p.id === 'chimney-floor'; });
    const walls = TRAVERSAL_FIXTURE.solidRects.filter(function (r) {
      return r.id === 'chimney-left' || r.id === 'chimney-right';
    });
    const bodyRows = [Math.floor(floor.y + 0.02), Math.floor(floor.y + PL.height - 0.02)];
    ok(walls.length === 2 && walls.every(function (r) {
      return r.y0 <= bodyRows[1] && r.y1 > bodyRows[1] && r.y1 - r.y0 >= 4;
    }), 'both chimney walls still overlap a player standing on the chimney floor');
  }
}

/* ------------------- pursuit model (pure step math) ------------------ */
{
  const hunt = TRAVERSAL_PACES.hunt.pursuit;
  const ramp = TRAVERSAL_PACES.surge.pursuit;
  const flat = TRAVERSAL_PACES.base.pursuit;
  const ctx = function (margin, elapsed, inPocket) {
    return { marginTiles: margin, elapsedMs: elapsed, inPocket: !!inPocket };
  };
  ok(traversalPaceTargetSpeed(flat, ctx(50, 9e9)) === flat.cruiseSpeed &&
     traversalPaceStep(flat, flat.cruiseSpeed, ctx(50, 9e9), 1 / 60) === flat.cruiseSpeed,
     'a constant pace is exactly constant');
  ok(traversalPaceTargetSpeed(hunt, ctx(hunt.comfortTiles + 1, 0)) === hunt.maxSpeed &&
     traversalPaceTargetSpeed(hunt, ctx(hunt.mercyTiles - 1, 0)) === hunt.minSpeed &&
     traversalPaceTargetSpeed(hunt, ctx((hunt.mercyTiles + hunt.comfortTiles) / 2, 0)) ===
       hunt.cruiseSpeed,
     'hunt charges on banked margin, eases when the player is nearly pinned');
  {
    let mono = true, prev = -1;
    for (let t = 0; t <= ramp.rampMs * 1.5; t += 100) {
      const v = traversalPaceTargetSpeed(ramp, ctx(20, t));
      if (v < prev - 1e-9) mono = false;
      prev = v;
    }
    ok(mono && traversalPaceTargetSpeed(ramp, ctx(20, 0)) === ramp.cruiseSpeed &&
       traversalPaceTargetSpeed(ramp, ctx(20, ramp.rampMs)) === ramp.maxSpeed &&
       traversalPaceTargetSpeed(ramp, ctx(20, ramp.rampMs * 9)) === ramp.maxSpeed,
       'ramp escalates monotonically from cruise to max and clamps there');
  }
  {
    // rate limiting: a step can never move faster than the declared accel/decel
    let bounded = true, hitsMax = false;
    let v = hunt.cruiseSpeed;
    for (let i = 0; i < 600; i++) {
      const next = traversalPaceStep(hunt, v, ctx(20, i * 16.7), 1 / 60);
      if (next - v > hunt.accel / 60 + 1e-9 || v - next > hunt.decel / 60 + 1e-9) bounded = false;
      if (next > hunt.maxSpeed + 1e-9 || next < hunt.minSpeed - 1e-9) bounded = false;
      v = next;
      if (Math.abs(v - hunt.maxSpeed) < 1e-9) hitsMax = true;
    }
    ok(bounded && hitsMax, 'pursuit speed is rate-limited and reaches its ceiling');
  }
  {
    // the pocket clamp is immediate in every pace: that is what makes the
    // retreat provable rather than dependent on how fast the edge was going
    let clamped = true;
    for (const id of TRAVERSAL_PACE_IDS) {
      const PU = TRAVERSAL_PACES[id].pursuit;
      const stepped = traversalPaceStep(PU, PU.maxSpeed, ctx(1, 9e9, true), 1 / 60);
      if (stepped > PU.pocketSpeed + 1e-9) clamped = false;
      const slow = traversalPaceStep(PU, PU.minSpeed, ctx(1, 9e9, true), 1 / 60);
      if (slow > PU.pocketSpeed + 1e-9) clamped = false;
    }
    ok(clamped, 'entering the dare pocket drops the edge to pocketSpeed on the same frame');
  }
}

/* ------------------ HULL FALLBACK tier 1 (proposal B.1) -------------- */
{
  const FB = TRAVERSAL_FIXTURE.fallback;
  ok(FB.minDropTiles > 0 && FB.dropAboveTiles > 0 && FB.iframesMs > 0 &&
     FB.messageMs > 0 && FB.maxConsecutive >= 1 && FB.recoverTiles > 0 &&
     FB.tossVx > 0 && FB.tossVy < 0 && FB.groundKnockTiles > 0,
     'fallback constants are declared and signed correctly');
  ok(traversalFallbackTarget([3, 5.35, 8.35], 8.35, FB) === 5.35 &&
     traversalFallbackTarget([3, 5.35, 8.35], 5.35, FB) === 3 &&
     traversalFallbackTarget([3], 3, FB) === null &&
     traversalFallbackTarget([], 9, FB) === null,
     'fallback picks the highest genuinely lower surface, or nothing');
  ok(traversalFallbackTarget([3, 8.35 - FB.minDropTiles + 0.01], 8.35, FB) === 3,
     'a surface inside minDropTiles is not a fallback route');
  // Tier 1 must always have a defined outcome: either a genuinely lower route
  // to be dislodged onto, or a surface so close to the deck that the fallback
  // pays margin instead of altitude. A platform with neither would leave the
  // player stuck, which is the failure mode this assertion exists to catch.
  let defined = true, elevatedCovered = 0;
  for (const pl of TRAVERSAL_FIXTURE.platforms) {
    const x = Math.floor((pl.x0 + pl.x1) / 2);
    const surfaces = [TL.groundH[x]];
    for (const q of TRAVERSAL_FIXTURE.platforms)
      if (x + PL.width / 2 > q.x0 && x - PL.width / 2 < q.x1) surfaces.push(q.y);
    const lower = traversalFallbackTarget(surfaces, pl.y, FB);
    const lowest = Math.min.apply(null, surfaces);
    if (lower !== null) elevatedCovered++;
    else if (pl.y - lowest >= FB.minDropTiles) {
      defined = false;
      console.error('  undefined fallback below platform ' + pl.id);
    }
  }
  ok(defined && elevatedCovered >= TRAVERSAL_FIXTURE.platforms.length - 1,
     'every authored platform resolves to a lower route or to the margin knock, got ' +
     elevatedCovered + '/' + TRAVERSAL_FIXTURE.platforms.length + ' with a lower route');
}

/* ============== CHARGE / THREAT prototype (proposal A.4) ============= */
{
  ok(SCORE === CONFIG.score, 'the score module reads its tune from CONFIG');
  let monotone = true;
  for (let i = 1; i < SCORE.notches.length; i++)
    if (SCORE.notches[i] <= SCORE.notches[i - 1]) monotone = false;
  ok(monotone && SCORE.notches.length === 2 &&
     SCORE.notches[SCORE.notches.length - 1] === SCORE.max &&
     SCORE.notchMult.length === SCORE.notches.length + 1 &&
     SCORE.notchNames.length === SCORE.notches.length + 1,
     'A.4 prototype: two monotone notches, top notch at full charge, one mult/name each');
  ok(scoreNotch(0) === 0 && scoreNotch(SCORE.notches[0] - 0.01) === 0 &&
     scoreNotch(SCORE.notches[0]) === 1 && scoreNotch(SCORE.max) === 2 &&
     scoreNotch(9999) === 2,
     'notch thresholds are inclusive, ordered, and clamped');
  ok(scoreNotchMult(0) === 1 && scoreNotchMult(2) > scoreNotchMult(1) &&
     scoreNotchMult(99) === SCORE.notchMult[SCORE.notchMult.length - 1],
     'THREAT multiplier rises with the notch and clamps');
  ok(scoreFireRateMult(0) === 1 && scoreFireRateMult(1) === SCORE.warmFireMult &&
     scoreFireRateMult(2) === SCORE.warmFireMult && SCORE.warmFireMult < 1,
     'WARM shortens the fire interval; nothing else is gated by notch 1');
  ok(Object.keys(SCORE.gain).sort().join(',') === Object.keys(SCORE.threat).sort().join(','),
     'CHARGE and THREAT tables cover the same event set');
  ok(['airborne_kill', 'launch_kill', 'link', 'reclaim', 'wager', 'recatch']
       .every(function (k) { return SCORE.gain[k] > 0 && SCORE.threat[k] > 0; }) &&
     SCORE.gain.airborne_kill > SCORE.gain.ground_kill * 3 &&
     SCORE.gain.wager > SCORE.gain.link,
     'A.1 event set is priced, and movement kills dominate ground kills');
  // the asymmetry that is the whole design: the floor cools you, the air does not
  ok(scoreDrainPerSec({ grounded: false, traversal: false, launchGrace: false, vx: 0 }) === 0 &&
     scoreDrainPerSec({ grounded: true, traversal: true, launchGrace: false, vx: 0 }) === 0 &&
     scoreDrainPerSec({ grounded: true, traversal: false, launchGrace: true, vx: 0 }) === 0 &&
     scoreDrainPerSec({ grounded: true, traversal: false, launchGrace: false, vx: 9 }) ===
       SCORE.drain.moving &&
     scoreDrainPerSec({ grounded: true, traversal: false, launchGrace: false, vx: 0 }) ===
       SCORE.drain.stopped &&
     SCORE.drain.stopped > SCORE.drain.moving,
     'drain: zero in the air/traversal/launch window, worst while standing still');
  ok(SCORE.stallSpeed === 2.0 && SCORE.stallTickMs === 100,
     'stall threshold matches A.5 (and therefore the playtest harness) exactly');
  ok(scoreStep(50, SCORE.drain.stopped, 1, 0) === 50 - SCORE.drain.stopped &&
     scoreStep(10, SCORE.drain.stopped, 1, 0) === 0 &&
     scoreStep(40, SCORE.drain.stopped, 1, 34) === 34 &&
     scoreStep(SCORE.max, -50, 1, 0) === SCORE.max,
     'drain never crosses the phase floor and charge never exceeds its max');
  ok(scoreApplyGain(SCORE.max - 1, 'airborne_kill') === SCORE.max &&
     scoreApplyGain(0, 'not_an_event') === 0,
     'gains clamp at max and unknown events are inert');
  {
    // a fixed event script produces a fixed notch timeline (A.5 determinism)
    // one plausible hot streak inside a 4-12 s pass, then a long stall
    const script = [
      ['step', 0.5], ['link'], ['airborne_kill'], ['step', 0.15], ['launch_kill'],
      ['airborne_kill'], ['step', 0.1], ['launch_kill'], ['wager'], ['step', 3.0],
    ];
    const run = function () {
      let charge = 0;
      const timeline = [];
      for (const row of script) {
        if (row[0] === 'step') charge = scoreStep(charge, SCORE.drain.stopped, row[1], 0);
        else charge = scoreApplyGain(charge, row[0]);
        timeline.push(scoreNotch(charge) + ':' + charge.toFixed(2));
      }
      return timeline.join(' ');
    };
    const a = run(), b = run();
    ok(a === b, 'the same event script always produces the same notch timeline');
    ok(/(^|\s)1:/.test(a) && /(^|\s)2:/.test(a),
       'the scripted 6-second horizon actually reaches BREAKING, got ' + a);
  }
  {
    let climbing = true, prev = '';
    for (const row of SCORE.classification) {
      if (scoreClassification(row[0]) !== row[1]) climbing = false;
      if (row[0] > 0 && scoreClassification(row[0] - 1) === row[1]) climbing = false;
      prev = row[1];
    }
    ok(climbing && scoreClassification(-5) === SCORE.classification[0][1] &&
       scoreClassification(9e9) === prev,
       'classification ladder is a monotone step function of THREAT');
  }
  ok(scoreNotchGlyphs(0).length === SCORE.notches.length &&
     scoreNotchGlyphs(2) === '▮▮' && scoreNotchGlyphs(1) === '▮▯' &&
     scoreNotchGlyphs(0).indexOf('▰') < 0,
     'notch glyphs are one per notch and never collide with the hp pips');
  ok(scoreThreatGain('airborne_kill', 0) === SCORE.threat.airborne_kill &&
     scoreThreatGain('airborne_kill', 2) ===
       SCORE.threat.airborne_kill * SCORE.notchMult[2] &&
     scoreThreatGain('stall_tick', 2) === 0,
     'THREAT scales with the notch and stalling never subtracts from it');
  {
    const C = TRAVERSAL_FIXTURE.connectors;
    const entry = C.find(function (c) { return c.id === 'entry'; });
    ok(scoreConnectorAt(C, entry.x, entry.y, 0.5) === 'entry' &&
       scoreConnectorAt(C, entry.x, entry.y + 40, 2.2) === null,
       'connector visits resolve by nearest inside the radius');
    const mid = TRAVERSAL_FIXTURE.routes.find(function (r) { return r.id === 'mid-catwalk'; });
    ok(scoreRoutesCompleted(TRAVERSAL_FIXTURE.routes, mid.connectorIds.slice(0, 3))
         .indexOf('mid-catwalk') >= 0 &&
       scoreRoutesCompleted(TRAVERSAL_FIXTURE.routes, mid.connectorIds.slice(0, 2))
         .indexOf('mid-catwalk') < 0 &&
       scoreRoutesCompleted(TRAVERSAL_FIXTURE.routes,
         mid.connectorIds.slice(0, 3).reverse()).indexOf('mid-catwalk') < 0,
       'A.5 route coverage: three connectors, in order, or it does not count');
  }
  ok(SCORE.shockDamage >= CONFIG.wasp.hp && SCORE.shockDamage < CONFIG.carrier.hp &&
     SCORE.shockRadius > CONFIG.wasp.contactRadius,
     'BREAKING launch shock kills a wasp on contact without deleting a carrier');
  /* ---- the weapon-pop panic actually happens (adversarial F9) ---------- *
   * The popped capsule spawns inside the player's own AABB, so the same
   * frame's pickup test used to hand the weapon straight back: DESIGN's
   * "recatch it within 2.2s" beat was a no-op. The grace window has to be long
   * enough for the pop's own arc to clear the body in BOTH axes.            */
  {
    const C = CONFIG.capsules;
    const t = C.popNoCatchMs / 1000;
    const rise = C.popVy * t + 0.5 * C.gravity * t * t;      // from y + 1.2
    const drift = C.popVx * t;
    ok(C.popNoCatchMs > 0 && C.popNoCatchMs < C.recatchMs * 0.2,
       'the pop grace is real but small against the recatch window');
    ok(1.2 + rise > PL.height || drift > PL.width / 2 + C.pickupRadius,
       'by the end of the grace the popped capsule has left the player: rise ' +
       (1.2 + rise).toFixed(2) + ' vs height ' + PL.height + ', drift ' + drift.toFixed(2));
  }
  ok(SCORE.reclaim.lowTiles < SCORE.reclaim.highTiles && SCORE.reclaim.windowMs > 0 &&
     SCORE.linkDropTiles >= 2 && SCORE.launchGraceMs === 600 && SCORE.eventCap === 256,
     'reclaim/link/launch windows and the A.5 ring buffer match the proposal');
}

/* ============ CP4 promotion: the full-run tune (T-016) =============== */
/* The default six-face run prices the same event stream with A.3's
 * un-doubled table (SCORE_RUN) — A.4 is explicit that the slice's ~6 s
 * meter horizon "must not carry to the full game". These assertions pin
 * the intended relationship: everything structural identical, gains and
 * drain exactly halved. A deliberate run-side retune updates SCORE_RUN in
 * src/pure/score.js and these lines together.                            */
{
  ok(SCORE_RUN !== SCORE && Object.isFrozen(SCORE_RUN) && Object.isFrozen(SCORE_RUN.gain) &&
     Object.isFrozen(SCORE_RUN.drain),
     'the run tune is its own frozen table, not an alias of the slice tune');
  ok(SCORE_RUN.notches === SCORE.notches && SCORE_RUN.notchMult === SCORE.notchMult &&
     SCORE_RUN.threat === SCORE.threat && SCORE_RUN.warmFireMult === SCORE.warmFireMult &&
     SCORE_RUN.classification === SCORE.classification && SCORE_RUN.max === SCORE.max &&
     SCORE_RUN.launchGraceMs === SCORE.launchGraceMs &&
     SCORE_RUN.stallSpeed === SCORE.stallSpeed && SCORE_RUN.eventCap === SCORE.eventCap,
     'run and slice tunes share notches, THREAT prices, ladder, windows and caps — ' +
     'the two event streams stay comparable event-for-event');
  ok(Object.keys(SCORE_RUN.gain).sort().join(',') === Object.keys(SCORE.gain).sort().join(',') &&
     Object.keys(SCORE.gain).every(function (k) { return SCORE_RUN.gain[k] * 2 === SCORE.gain[k]; }),
     'run CHARGE gains are exactly A.3 (the slice table halved), every event');
  ok(SCORE_RUN.drain.moving * 2 === SCORE.drain.moving &&
     SCORE_RUN.drain.stopped * 2 === SCORE.drain.stopped &&
     SCORE_RUN.drain.stopped > SCORE_RUN.drain.moving && SCORE_RUN.drain.moving > 0,
     'run drain is A.3 (halved) and keeps the floor-cools-you asymmetry');
  ok(scoreApplyGain(0, 'airborne_kill', SCORE_RUN) === SCORE_RUN.gain.airborne_kill &&
     scoreDrainPerSec({ grounded: true, traversal: false, launchGrace: false, vx: 0 },
       SCORE_RUN) === SCORE_RUN.drain.stopped &&
     scoreDrainPerSec({ grounded: false, traversal: false, launchGrace: false, vx: 0 },
       SCORE_RUN) === 0,
     'the pure functions accept the run tune: gains, worst-case drain, free air');
  ok(scoreThreatGain('airborne_kill', 1, SCORE_RUN) ===
       scoreThreatGain('airborne_kill', 1, SCORE),
     'a WARM airborne kill is worth identical THREAT under either tune');
  // the horizon claim in numbers: from WARM, a dead stop cools to zero in
  // ~0.9 s under the slice tune and ~1.8 s under the run tune
  ok(SCORE.notches[0] / SCORE.drain.stopped < 1 &&
     SCORE_RUN.notches[0] / SCORE_RUN.drain.stopped > 1.5,
     'the run meter horizon is genuinely slower than the slice meter horizon');

  /* ---- HULL FALLBACK run tune (B.1 tier 1, promoted) ---- */
  const FBS = TRAVERSAL_FIXTURE.fallback;
  ok(Object.isFrozen(RUN_FALLBACK) &&
     Object.keys(RUN_FALLBACK).sort().join(',') === Object.keys(FBS).sort().join(','),
     'the run fallback tune has exactly the slice fallback field set');
  ok(Object.keys(FBS).every(function (k) { return RUN_FALLBACK[k] === FBS[k]; }),
     'run fallback values match the slice values for the first CP4 pass — ' +
     'one grammar at two timescales, not two grammars (retune = update both)');
  ok(RUN_FALLBACK.maxConsecutive >= 2 && RUN_FALLBACK.recoverTiles > 0 &&
     RUN_FALLBACK.minDropTiles > 0 && RUN_FALLBACK.tossVx > 0 && RUN_FALLBACK.tossVy <= 0 &&
     RUN_FALLBACK.iframesMs > 0 && RUN_FALLBACK.groundKnockTiles > 0,
     'run fallback: real mercy chain, bounded streak, forward toss, paid ground knock');
  ok(traversalFallbackTarget([3, 6, 9], 9, RUN_FALLBACK) === 6 &&
     traversalFallbackTarget([9], 9, RUN_FALLBACK) === null,
     'the shared fallback-target rule picks the highest genuinely-lower route ' +
     'under the run tune, and null when nothing is lower');
}

/* ------------- score wiring at the sim layer (A.1 semantics) --------- *
 * src/sim/score.js resolves ?score=1 at module-init time, so proving its
 * emission rules needs a process whose __HB_QUERY__ is set before any import.
 * Running it as a child keeps the rest of this suite in normal mode (main's
 * collision block drives updatePlayer with the six-face tune). Everything
 * asserted here is a rule from proposal A.1/A.3 that a refactor could break
 * silently: what counts as a link, what an air jump may and may not pay, the
 * ORBITAL LANCE exception, and single-shot launch-shock arming.          */
{
  const child = `
    globalThis.__HB_QUERY__ = 'slice=traversal&pace=surge&score=1';
    const S = await import(${JSON.stringify('file://' + join(srcDir, 'sim', 'score.js'))});
    const out = { steps: [] };
    const step = (label) => {
      const s = S.scoreSnapshot();
      out.steps.push([label, s.counts.link, s.counts.airborne_kill,
        s.counts.launch_kill, s.counts.ground_kill, s.charge]);
    };
    S.scoreLaunch('wall', 42, 6); S.scoreContact(8.2, 'wall'); step('wall+2.2');
    S.scoreLaunch('wall', 42, 8.2); S.scoreContact(8.8, 'wall'); step('wall+0.6');
    S.scoreLaunch('air', 42, 9); S.scoreContact(12, 'land'); step('air+3');
    S.scoreLaunch('ledge', 50, 8); S.scoreContact(5.3, 'land'); step('ledge-2.7');
    out.shockCold = !!S.consumeLaunchShock();
    S.scoreKill('wasp', 'R', { grounded: false, vy: -3, x: 50, y: 9 }); step('airkill');
    S.scoreKill('wasp', 'OL', { grounded: false, vy: -3, x: 50, y: 9 }); step('lance');
    // houndframe: a deck unit must need no special case at all — the same
    // single death path classifies it by what the PLAYER was doing, and its
    // kind rides through into the A.5 envelope untouched.
    S.scoreKill('hound', 'R', { grounded: false, vy: 1.5, x: 42, y: 3.5 }); step('houndair');
    S.scoreKill('hound', 'R', { grounded: true, vy: 0, x: 42, y: 3.5 }); step('houndground');
    out.houndEvents = S.scoreEvents
      .filter((e) => e.kind === 'hound' &&
        (e.type === 'airborne_kill' || e.type === 'ground_kill'))
      .map((e) => e.type + ':' + e.kind + ':' + e.weapon).join(',');
    out.types = S.scoreEvents.map((e) => e.type).join(',');
    out.envelope = Object.keys(S.scoreEvents.find((e) => e.type === 'airborne_kill')).join(',');
    out.tune = S.scoreSnapshot().tune;
    S.resetScore();
    out.afterReset = S.scoreSnapshot();
    out.eventsAfterReset = S.scoreEvents.length;
    console.log(JSON.stringify(out));
  `;
  let sim = null;
  try {
    sim = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child],
      { encoding: 'utf8' }));
  } catch (e) {
    console.error('pathcheck: sim score child failed: ' + e.message);
  }
  ok(!!sim, 'sim/score.js runs headlessly with ?score=1 and no DOM');
  if (sim) {
    const byLabel = new Map(sim.steps.map(function (r) { return [r[0], r]; }));
    ok(byLabel.get('wall+2.2')[1] === 1 && byLabel.get('wall+0.6')[1] === 1,
       'a wall kick that gains 2 tiles links; one that gains 0.6 does not');
    ok(byLabel.get('air+3')[1] === 1,
       'an air jump never links, however high it goes (hopping pays nothing)');
    ok(byLabel.get('ledge-2.7')[1] === 2,
       'a launch that drops two tiles still links: elevation *change*, not gain');
    ok(byLabel.get('airkill')[2] === 1 && byLabel.get('airkill')[3] === 1,
       'an airborne kill inside the launch window stacks airborne_kill + launch_kill');
    ok(byLabel.get('lance')[2] === 1 && byLabel.get('lance')[4] === 1,
       'an ORBITAL LANCE kill scores as a ground kill even while airborne');
    ok(sim.shockCold === false,
       'the launch shock does not arm below BREAKING');
    ok(sim.houndEvents === 'airborne_kill:hound:R,ground_kill:hound:R',
       'a houndframe scores through the same death path, airborne vs grounded, ' +
       'with its kind intact and no special case, got ' + sim.houndEvents);
    ok(byLabel.get('houndair')[2] === 2 && byLabel.get('houndair')[4] === 1 &&
       byLabel.get('houndground')[4] === 2,
       'killing a hound mid-charge while airborne counts as an airborne kill; ' +
       'killing it from the deck counts as a ground kill');
    ok(sim.envelope === 't,notch,type,x,y,kind,weapon,vy',
       'A.5 envelope shipped verbatim for airborne_kill, got ' + sim.envelope);
    ok(sim.afterReset.charge === 0 && sim.afterReset.threat === 0 &&
       sim.afterReset.counts.link === 0 && sim.eventsAfterReset === 0,
       'HB.score.reset() clears the meter, the score and the ring buffer');
    ok(sim.tune === 'slice',
       'a slice run prices its stream with the slice tune and says so');
  }
}

/* ------ CP4 promotion wiring: the DEFAULT run, ?score=1&fallback=1 ---- *
 * Same child-process trick (src/mode.js resolves flags at import time),
 * driving the unmodified sim with NO slice selected. What is asserted is
 * exactly what T-016 promoted: the run tune actually prices the stream, a
 * lethal hit becomes a HULL FALLBACK that keeps lives and control, the
 * streak ceiling hands over to the stock lives tier instead of retrying,
 * and with the flags absent the default run is byte-for-byte the shipped
 * lives path with a fully inert meter.                                   */
{
  const simBase = JSON.stringify('file://' + join(srcDir, 'sim'));
  const childOn = `
    globalThis.__HB_QUERY__ = 'score=1&fallback=1';
    const base = ${simBase};
    const M = await import(${JSON.stringify('file://' + join(srcDir, 'mode.js'))});
    const T = await import(base + '/time.js');
    const E = await import(base + '/edges.js');
    const ST = await import(base + '/state.js');
    const L = await import(base + '/level.js');
    const PLm = await import(base + '/player.js');
    const S = await import(base + '/score.js');
    const out = {};
    out.flags = [M.SCORE_ENABLED, M.RUN_FALLBACK_ENABLED,
      M.ACTIVE_SLICE === null, M.ACTIVE_FIXTURE === null];
    out.tune = S.scoreSnapshot().tune;
    S.scoreKill('wasp', 'R', { grounded: false, vy: -2, x: 30, y: 6 });
    out.chargeAirKill = S.scoreSnapshot().charge;
    ST.setState('PLAYING');
    E.setEdges(0, 120);
    const p = PLm.player;
    const lives0 = p.lives;
    // (1) dislodged from an elevated platform: altitude paid, lives kept,
    // control kept (state stays PLAYING), hp refilled, meter dropped to floor
    const pl = L.platforms.find((q) => {
      const mid = (q.x0 + q.x1) / 2;
      const g = L.groundTopAt(mid);
      return g > -100 && q.y - g > 1.3 && mid > 6 && mid < 110;
    });
    out.foundPlatform = !!pl;
    T.advanceGameMs(3000);
    p.x = (pl.x0 + pl.x1) / 2; p.y = pl.y; p.vx = 0; p.vy = 0;
    p.grounded = true; p.hp = 1; p.iframesUntil = 0; p.hitstunUntil = 0;
    PLm.damagePlayer(1, p.x - 1);
    out.fb1 = {
      livesKept: p.lives === lives0, hpFull: p.hp === PLm.P.maxHealth,
      dropped: p.y < pl.y, tossed: p.vy === -3 && p.vx > 0,
      playing: ST.state === 'PLAYING',
      setbacks: T.sliceStats.setbacks, charge: S.scoreSnapshot().charge,
    };
    // (2) second un-recovered fallback on flat ground: the margin knock pays
    let gi = 8;
    while (L.groundTopAt(gi) < -100) gi++;
    T.advanceGameMs(2000);
    const x2 = gi + 0.5;
    p.x = x2; p.y = L.groundTopAt(gi); p.vx = 0; p.vy = 0;
    p.grounded = true; p.hp = 1; p.iframesUntil = 0; p.hitstunUntil = 0;
    PLm.damagePlayer(1, p.x - 1);
    out.fb2 = { livesKept: p.lives === lives0, knockedBack: p.x < x2,
      setbacks: T.sliceStats.setbacks };
    // (3) the ceiling: a third consecutive un-recovered death escalates to the
    // stock lives tier (respawn, one life spent) instead of retrying/looping
    T.advanceGameMs(2000);
    p.hp = 1; p.iframesUntil = 0; p.hitstunUntil = 0;
    PLm.damagePlayer(1, p.x - 1);
    out.ceiling = { lives: p.lives, hpFull: p.hp === PLm.P.maxHealth,
      setbacks: T.sliceStats.setbacks, playing: ST.state === 'PLAYING' };
    const sb = S.scoreEvents.filter((e) => e.type === 'setback');
    out.setbackEvents = sb.length;
    out.setbackEnvelope = sb.length ? Object.keys(sb[0]).join(',') : '';
    out.setbackKinds = sb.map((e) => e.kind).join(',');
    console.log(JSON.stringify(out));
  `;
  const childOff = `
    globalThis.__HB_QUERY__ = '';
    const base = ${simBase};
    const M = await import(${JSON.stringify('file://' + join(srcDir, 'mode.js'))});
    const T = await import(base + '/time.js');
    const E = await import(base + '/edges.js');
    const ST = await import(base + '/state.js');
    const L = await import(base + '/level.js');
    const PLm = await import(base + '/player.js');
    const S = await import(base + '/score.js');
    const out = {};
    out.armed = [M.SCORE_ENABLED, M.RUN_FALLBACK_ENABLED];
    S.scoreKill('wasp', 'R', { grounded: false, vy: -2, x: 30, y: 6 });
    out.meterInert = S.scoreSnapshot().charge === 0 && S.scoreEvents.length === 0;
    ST.setState('PLAYING');
    E.setEdges(0, 120);
    const p = PLm.player;
    const lives0 = p.lives;
    let gi = 8;
    while (L.groundTopAt(gi) < -100) gi++;
    p.x = gi + 0.5; p.y = L.groundTopAt(gi); p.vx = 0; p.vy = 0;
    p.grounded = true; p.hp = 1; p.iframesUntil = 0; p.hitstunUntil = 0;
    PLm.damagePlayer(1, p.x - 1);
    out.stock = { livesSpent: p.lives === lives0 - 1, hpFull: p.hp === PLm.P.maxHealth,
      setbacks: T.sliceStats.setbacks, playing: ST.state === 'PLAYING' };
    console.log(JSON.stringify(out));
  `;
  let on = null, off = null;
  try {
    on = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', childOn],
      { encoding: 'utf8' }));
    off = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', childOff],
      { encoding: 'utf8' }));
  } catch (e) {
    console.error('pathcheck: CP4 promotion child failed: ' + e.message);
  }
  ok(!!on && !!off, 'the default-run sim boots headlessly with and without the CP4 flags');
  if (on) {
    ok(on.flags.every(Boolean),
       '?score=1&fallback=1 arms both prototypes in the default run, no slice active');
    ok(on.tune === 'run' && on.chargeAirKill === SCORE_RUN.gain.airborne_kill,
       'the default run prices events with the RUN tune (airborne kill +' +
       SCORE_RUN.gain.airborne_kill + ', not the slice tune +' + SCORE.gain.airborne_kill +
       '), got +' + on.chargeAirKill);
    ok(on.foundPlatform === true, 'the seeded six-face level offers an elevated ' +
       'platform with ground below to prove the dislodge against');
    ok(on.fb1.livesKept && on.fb1.hpFull && on.fb1.dropped && on.fb1.tossed &&
       on.fb1.playing && on.fb1.setbacks === 1,
       'a lethal hit with ?fallback=1 is a HULL FALLBACK: altitude paid, lives ' +
       'and control kept, hp refilled, play never stops');
    ok(on.fb1.charge === 0,
       'the fallback drops CHARGE to the phase floor (B.1: the fall pays nothing)');
    ok(on.fb2.livesKept && on.fb2.knockedBack && on.fb2.setbacks === 2,
       'on the lowest route the fallback takes margin instead of altitude — never free');
    ok(on.ceiling.lives === 2 && on.ceiling.hpFull && on.ceiling.setbacks === 2 &&
       on.ceiling.playing,
       'the third consecutive un-recovered death crosses the streak ceiling and ' +
       'spends a stock life — the run keeps its terminal state, no free fall loop');
    ok(on.setbackEvents === 2 && on.setbackKinds === 'fallback,ground' &&
       on.setbackEnvelope === 't,notch,type,kind,phase,y0,y1,x',
       'the A.5 setback envelope rides the run stream: kinds ' + on.setbackKinds);
  }
  if (off) {
    ok(off.armed.every((f) => f === false) && off.meterInert === true,
       'with no flags the default-run meter is fully inert (no events, no charge)');
    ok(off.stock.livesSpent && off.stock.hpFull && off.stock.setbacks === 0 &&
       off.stock.playing,
       'with no flags a lethal hit spends a life through the shipped stock path');
  }
}

/* ------- the snap hook, driven through the REAL sim loop -------------- *
 * The pure functions above prove the geometry; this proves the wiring. Same
 * child-process trick the score block uses (src/mode.js resolves its flags at
 * import time), driving the unmodified src/sim/player.js with ?hook=1&flow=1&
 * score=1 from the fixture's own spawn point. What is asserted here is exactly
 * what a refactor could silently break: the tether owns movement while it is
 * taut, it always hands back a bounded forward launch, a grab is never a stop,
 * and a hook launch pays a CHARGE `link` through the ordinary A.1 path with no
 * special-casing.                                                          */
{
  const child = `
    globalThis.__HB_QUERY__ = 'slice=traversal&pace=surge&hook=1&flow=1&score=1';
    const base = ${JSON.stringify('file://' + join(srcDir, 'sim'))};
    const M = await import(${JSON.stringify('file://' + join(srcDir, 'mode.js'))});
    const E = await import(base + '/edges.js');
    const T = await import(base + '/time.js');
    const I = await import(base + '/input.js');
    const PLm = await import(base + '/player.js');
    const HK = await import(base + '/hook.js');
    const FL = await import(base + '/flow.js');
    const S = await import(base + '/score.js');
    const WG = await import(base + '/wavegate.js');
    const p = PLm.player;
    const out = { phases: [], events: [] };
    // a viewport wide enough that neither the crush plane nor the right clamp
    // participates: this block is about the verb, not about the frustum
    E.setEdges(-200, 200);
    for (const c of WG.cornerEvents) c.state = 'done';
    const spawn = M.ACTIVE_SLICE.run.playerSpawn;
    const place = () => {
      p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0;
      p.grounded = true; p.onOneWay = null; p.jumpCutDone = true;
      p.airJumpsLeft = 0;                      // so a refund is observable
      p.hp = PLm.P.maxHealth;
      p.iframesUntil = 0; p.hitstunUntil = 0; p.coyoteUntil = 0; p.dropUntil = 0;
      PLm.clearPlayerTraversal(0);
      I.clearJumpBuffer(); I.clearHookBuffer();
      for (const k in I.keys) I.keys[k] = false;
      HK.resetHook(); FL.resetFlow();
    };
    // the real frame order: the clock advances, then the player steps. Every
    // window in these verbs (buffer, dangle, cooldown, chain) is a gameMs
    // deadline, so a stepper that froze the clock would prove nothing.
    const step = (n, dt) => {
      const d = dt || 1 / 60;
      for (let i = 0; i < n; i++) { T.advanceGameMs(d * 1000); PLm.updatePlayer(d); }
    };

    // 1. a grab from the fixture's own spawn: press, then let it run
    place();
    out.anchors = M.ACTIVE_SLICE.hookAnchors.length;
    I.bufferHookUntil(T.gameMs + M.ACTIVE_SLICE.hook.bufferMs);
    step(1);
    const zip = HK.hookSnapshot();
    out.zip = { phase: zip.phase, anchor: zip.anchorId, vx: p.vx, vy: p.vy,
      grounded: p.grounded, y: p.y };
    let sawHang = false, movedForward = p.x;
    for (let i = 0; i < 60; i++) {
      step(1);
      const s = HK.hookSnapshot();
      if (s.phase === 'hang') sawHang = true;
      if (s.phase !== 'zip' && s.phase !== 'hang') break;
      if (s.phase === 'zip' && (p.vx !== 0 || p.vy !== 0)) out.zipVelocityLeak = true;
      movedForward = p.x;
    }
    out.sawHang = sawHang;
    const after = HK.hookSnapshot();
    out.whip = { phase: after.phase, grabs: after.grabs, whips: after.whips,
      vx: p.vx, vy: p.vy, airJumpsLeft: p.airJumpsLeft, x: p.x, y: p.y,
      cooldownMs: after.cooldownMs };
    out.flowAfterWhip = FL.flowSnapshot();
    out.launchCeiling = M.ACTIVE_SLICE.hook.launchCeiling;
    out.launchY = M.ACTIVE_SLICE.hook.launchY;
    // a second press on the same frame must not re-grab (cooldown + lock)
    I.bufferHookUntil(T.gameMs + M.ACTIVE_SLICE.hook.bufferMs);
    step(1);
    out.regrab = HK.hookSnapshot().grabs;
    // …and the flight lands, which is where the A.1 link is paid
    for (let i = 0; i < 240 && !p.grounded; i++) step(1);
    out.landed = { grounded: p.grounded, y: p.y };
    out.score = S.scoreSnapshot().counts;
    out.events = S.scoreEvents.map((e) => e.type);

    // 2. down releases instead of launching (the established grammar)
    place();
    I.bufferHookUntil(T.gameMs + M.ACTIVE_SLICE.hook.bufferMs);
    step(2);
    I.keys.down = true;
    step(1);
    const dropped = HK.hookSnapshot();
    out.drop = { phase: dropped.phase, releases: dropped.releases, whips: dropped.whips,
      vy: p.vy };
    I.keys.down = false;

    // 3. pressing with no anchor in range does nothing at all
    place();
    p.x = 70; p.y = 4;
    const before = { x: p.x, y: p.y };
    I.bufferHookUntil(T.gameMs + M.ACTIVE_SLICE.hook.bufferMs);
    step(3);
    out.miss = { phase: HK.hookSnapshot().phase, grabs: HK.hookSnapshot().grabs,
      moved: Math.abs(p.x - before.x) > 3 };

    // 4. a live momentum chain carried into the plane's wall pocket dies like
    //    everything else: the crush resolves in its own frame, the chain and the
    //    tether are both cleared by the damage path, and no frame ever leaves
    //    RIG inside terrain or behind the plane.
    const C = await import(${JSON.stringify('file://' + join(srcDir, 'config.js'))});
    const LV = await import(base + '/level.js');
    const overlaps = () => {
      for (let i = Math.floor(p.x - p.hw + 0.02); i <= Math.floor(p.x + p.hw - 0.02); i++)
        for (let j = Math.floor(p.y + 0.02); j <= Math.floor(p.y + p.h - 0.02); j++)
          if (LV.isSolid(i, j)) return true;
      return false;
    };
    const ST = await import(base + '/state.js');
    const dt = 1 / 60;
    // Drives the plane into RIG exactly as src/main.js's loop would: the frame
    // is only simulated while the run is PLAYING, so nothing is measured after a
    // terminal state the real game would never step.
    const shoveIntoWall = (atX, atY, links) => {
      place();
      ST.setState('PLAYING');
      T.sliceStats.setbacks = 0;
      p.x = atX; p.y = atY; p.grounded = true;
      for (let i = 0; i < links; i++) FL.flowLaunch(p, 'wall', 1, 13.5);
      const before = FL.flowSnapshot().links;
      E.setEdges(0, 60);
      T.setScrollX(p.x - p.hw - C.CONFIG.edges.margin - 0.15);
      let insideSolid = 0, behindPlane = 0, hpZeroFrames = 0, frames = 0;
      let chainAtCrush = null;
      for (let f = 0; f < 90; f++) {
        T.setScrollX(T.scrollX + 3 * dt);                 // the plane advances
        T.advanceGameMs(dt * 1000);
        const hpBefore = p.hp;
        PLm.updatePlayer(dt);
        frames++;
        if (p.hp < hpBefore) chainAtCrush = FL.flowSnapshot().links;
        if (p.hp <= 0) hpZeroFrames++;
        if (overlaps()) insideSolid++;
        if (p.x - p.hw < E.sLeftEdge() + C.CONFIG.edges.margin - 1e-6) behindPlane++;
        if (ST.state !== 'PLAYING') break;               // the real loop stops here
        if (T.sliceStats.setbacks > 0) break;
      }
      return {
        before, frames, insideSolid, behindPlane, hpZeroFrames, chainAtCrush,
        chainAfter: FL.flowSnapshot().links, hookPhase: HK.hookSnapshot().phase,
        setbacks: T.sliceStats.setbacks, state: ST.state, hp: p.hp,
      };
    };
    // 4a. the sealed dare pocket: nowhere to fall, nowhere to retreat — the
    //     merged contract calls that terminal, and a live chain must not rescue it
    const pocket = M.ACTIVE_SLICE.darePocket.bounds;
    out.sealed = shoveIntoWall(pocket.x1 - 1 - p.hw - 0.05, 1, 2);
    // 4b. the other half of the setback contract: a lethal HIT mid-chain (no
    //     wall involved) dislodges RIG to the route below and play continues —
    //     and the chain is gone there too, because a setback un-earns momentum.
    place();
    ST.setState('PLAYING');
    T.sliceStats.setbacks = 0;
    p.x = 42; p.y = 5.35; p.grounded = true;        // the chimney floor
    E.setEdges(-40, 60);
    T.setScrollX(20);
    FL.flowLaunch(p, 'wall', 1, 13.5);
    FL.flowLaunch(p, 'wall', 1, 13.5);
    const hitChain = FL.flowSnapshot().links;
    PLm.damagePlayer(PLm.P.maxHealth, p.x - 1);     // a lethal hit, not a crush
    out.dislodged = {
      before: hitChain, chainAfter: FL.flowSnapshot().links,
      hookPhase: HK.hookSnapshot().phase,
      setbacks: T.sliceStats.setbacks, state: ST.state, hp: p.hp,
      y: p.y, movedDown: p.y < 5.35,
    };
    console.log(JSON.stringify(out));
  `;
  let sim = null;
  try {
    sim = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child],
      { encoding: 'utf8' }));
  } catch (e) {
    console.error('pathcheck: sim hook child failed: ' + e.message);
  }
  ok(!!sim, 'sim/hook.js drives the real player loop headlessly with ?hook=1');
  if (sim) {
    ok(sim.zip.phase === 'zip' && sim.zip.anchor === 'entry-lift' && !sim.zip.grounded,
       'pressing hook at the fixture spawn grabs the anchor that teaches it (got ' +
       sim.zip.phase + '/' + sim.zip.anchor + ')');
    ok(sim.zip.vx === 0 && sim.zip.vy === 0 && !sim.zipVelocityLeak,
       'while the tether is taut the player carries no velocity — it owns position, ' +
       'so the normal integrator can never resume holding a zip-speed vector');
    ok(sim.sawHang, 'the zip arrives and dangles before it throws (the boards’ dangle)');
    ok(sim.whip.phase === 'idle' && sim.whip.whips === 1 && sim.whip.grabs === 1,
       'the dangle always converts: one grab, one whip, back to idle');
    // vy is sampled one frame after the launch, so it has already paid one
    // frame of gravity — the bound that matters is that it never EXCEEDS the
    // authored lift (a hook must not out-jump a jump) and is still rising.
    ok(sim.whip.vx > 0 && sim.whip.vx <= sim.launchCeiling + 1e-9 &&
       sim.whip.vy > 0 && sim.whip.vy <= sim.launchY + 1e-9 &&
       sim.whip.vy > sim.launchY - 1.0,
       'the whip throws forward at a bounded speed (' + sim.whip.vx.toFixed(2) +
       ' <= ' + sim.launchCeiling + ') with the authored lift (vy ' +
       sim.whip.vy.toFixed(2) + ' of ' + sim.launchY + ')');
    ok(sim.whip.airJumpsLeft === 1,
       'the whip refunds the air jump, so a grab can become another launch');
    ok(sim.whip.y > sim.zip.y + 2,
       'the grab gained real altitude: ' + (sim.whip.y - sim.zip.y).toFixed(2) + ' tiles');
    ok(sim.regrab === 1, 'the cooldown and the anchor lock refuse an instant re-grab');
    ok(sim.flowAfterWhip.links === 1 && sim.flowAfterWhip.mult > 1,
       'a hook launch is a momentum-chain link');
    ok(sim.landed.grounded && sim.score.link >= 1,
       'the launch that followed the grab pays a CHARGE `link` through the ordinary ' +
       'A.1 path — no scoring special case for the hook');
    ok(sim.events.indexOf('link') >= 0 && sim.events.indexOf('stall_tick') < 0,
       'and the A.5 event stream carries it, with no stall while the tether ran');
    ok(sim.drop.phase === 'idle' && sim.drop.releases === 1 && sim.drop.whips === 0 &&
       sim.drop.vy < 0,
       'down releases the tether and drops, exactly like a ledge or a wall');
    ok(sim.miss.phase === 'idle' && sim.miss.grabs === 0 && !sim.miss.moved,
       'a press with no valid anchor is simply a miss: nothing moves, nothing sticks');
    /* the crush contract, with the momentum spine live. Both outcomes the merged
       crush/fallback rules define are exercised: the sealed pocket is terminal
       (nowhere to fall, nowhere to retreat) and the open step is a dislodging.
       In both, a live chain must die with the crush — momentum is earned, and
       being crushed is exactly the thing that un-earns it.                    */
    {
      const r = sim.sealed;
      ok(r.before === 2, 'crush case: two contact launches armed a live chain');
      ok(r.chainAtCrush === 0 && r.chainAfter === 0 && r.hookPhase === 'idle',
         'a live chain carried into the plane\'s wall pocket dies on the crush frame ' +
         'itself (chain at crush ' + r.chainAtCrush + ', tether ' + r.hookPhase + ')');
      ok(r.behindPlane === 0, 'and no frame left RIG behind the damage plane');
      ok(r.hpZeroFrames <= 1,
         'the crush still resolves in its own frame rather than grinding (' +
         r.hpZeroFrames + ' frame(s) at zero hp)');
      ok(r.state === 'SLICE_RETRY' && r.setbacks === 0,
         'and the sealed pocket stays terminal: the momentum spine cannot buy a ' +
         'rescue the merged fallback rule denies (state ' + r.state + ')');
    }
    {
      const r = sim.dislodged;
      ok(r.before === 2 && r.chainAfter === 0 && r.hookPhase === 'idle',
         'a lethal hit mid-chain also un-earns the chain (' + r.before + ' → ' +
         r.chainAfter + ')');
      ok(r.setbacks === 1 && r.state === 'PLAYING' && r.hp > 0 && r.movedDown,
         'and the setback is still a dislodging, not a stop: play continues at full ' +
         'hp on a lower route (y ' + r.y.toFixed(2) + ', setbacks ' + r.setbacks + ')');
    }
  }
}

/* ---- the damage plane never leaves geometry behind it ------------------ *
 * Two shipped versions of the plane push were wrong in opposite directions:
 * assigning x with no collision test shoved a pinned player through a solid
 * wall (adversarial F4), and ejecting them back out of the column they were
 * shoved into left them BEHIND the plane (edgeMargin -0.60) and ground them
 * through the wall a tile per frame regardless. This drives the real sim
 * against a real two-tile step in the shipped level and pins down the
 * six-face contract: the wall holds, the player never ends a frame inside
 * terrain, and the hp cadence is the shipped one (i-frame gated, not a
 * teleport). The fixture's stricter contract — margin never negative,
 * because a crush resolves in its own frame — is proved in the child
 * process below, where the slice can actually be selected.               */
{
  // find a step at least as tall as the player, with room to stand in front
  let stepX = -1;
  for (let i = 40; i < 300; i++) {
    if (simGroundH[i] > -100 && simGroundH[i + 1] > -100 &&
        simGroundH[i + 1] - simGroundH[i] >= 2 &&
        simGroundH[i - 1] === simGroundH[i]) { stepX = i; break; }
  }
  ok(stepX > 0, 'the shipped level contains a player-height step to pin against');

  const savedScroll = simScrollX;
  simKeys.left = false; simKeys.right = false; simKeys.jump = false;
  simKeys.down = false; simKeys.fire = false;
  clearSimJumpBuffer();
  clearSimTraversal(0);
  setSimEdges(0, 30);                         // le = scrollX + edges.margin
  const hw = simPlayer.hw;
  simPlayer.x = stepX + 1 - hw - 0.05;        // standing right at the wall face
  simPlayer.y = simGroundH[stepX];
  simPlayer.vx = 0; simPlayer.vy = 0;
  simPlayer.grounded = true; simPlayer.onOneWay = null;
  simPlayer.hp = CONFIG.player.maxHealth; simPlayer.lives = 3;
  simPlayer.iframesUntil = 0; simPlayer.hitstunUntil = 0;
  simPlayer.edgePinnedMs = 0;
  setSimScrollX(simPlayer.x - hw - CONFIG.edges.margin - 0.2);

  const dt = 1 / 60;
  let behindPlane = 0, insideSolid = 0, pastWall = 0, hpDrops = 0;
  const startHp = simPlayer.hp;
  for (let f = 0; f < 240; f++) {
    setSimScrollX(simScrollX + CONFIG.scrollSpeed * dt);   // the plane advances
    const hpBefore = simPlayer.hp;
    updateSimPlayer(dt);
    if (simPlayer.hp < hpBefore) hpDrops++;
    if (simPlayer.lives < 3) break;             // resolved: the crush killed
    const le = simScrollX + CONFIG.edges.margin;
    if (simPlayer.x - hw < le - 1e-6) behindPlane++;
    // never inside terrain at the end of a frame
    const x0 = Math.floor(simPlayer.x - hw + 0.02), x1 = Math.floor(simPlayer.x + hw - 0.02);
    const y0 = Math.floor(simPlayer.y + 0.02), y1 = Math.floor(simPlayer.y + simPlayer.h - 0.02);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) if (simIsSolid(i, j)) insideSolid++;
    if (simPlayer.x + hw > stepX + 1 + 1e-6) pastWall++;   // never through the wall
  }
  ok(insideSolid === 0,
     'a plane-pinned player never ends a frame inside terrain, got ' + insideSolid + ' frames');
  ok(pastWall === 0,
     'the plane never pushes a player through the wall it is pinned against, got ' +
     pastWall + ' frames');
  ok(hpDrops > 0 && simPlayer.hp < startHp || simPlayer.lives < 3,
     'being crushed against terrain costs hp instead of being free');
  // Each crush frame costs one hp with no i-frame gating, so the pin resolves in
  // at most maxHealth frames (~50ms) rather than grinding for a second and a half.
  ok(behindPlane <= CONFIG.player.maxHealth,
     'the six-face pin resolves within an hp bar instead of stranding the player ' +
     'behind the plane, got ' + behindPlane + ' frames');

  // restore the module state the later assertions share
  setSimScrollX(savedScroll);
  simPlayer.hp = CONFIG.player.maxHealth; simPlayer.lives = 3;
  simPlayer.iframesUntil = 0; simPlayer.edgePinnedMs = 0;
  clearSimTraversal(0);
}

/* ---- HULL FALLBACK cannot pay for itself (fixture contract) ------------ *
 * The streak that caps consecutive fallbacks used to clear on player.x, and
 * the damage plane's own shove supplies forward x — so a zero-input run reset
 * the safeguard with the exact displacement the safeguard exists to punish and
 * never died (12/12 runs at full hp, conveyed 36 tiles). Selecting the slice
 * needs __HB_QUERY__ before module init, hence a child process; it also lets
 * this assert the fixture's strict plane invariant, which the six-face branch
 * above deliberately does not share.                                       */
{
  const child = (query, drive) => `
    globalThis.__HB_QUERY__ = ${JSON.stringify(query)};
    const [T, E, S, P, ST, IN, L, C] = await Promise.all([
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'time.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'edges.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'scroll.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'player.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'state.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'input.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'sim', 'level.js'))},
      ${JSON.stringify('file://' + join(srcDir, 'config.js'))},
    ].map((u) => import(u)));
    const F = ${JSON.stringify('file://' + join(srcDir, 'mode.js'))};
    const M = await import(F);
    const fx = M.ACTIVE_SLICE;
    // the fixture's own opening state, as resetGame would leave it
    E.setEdges(-3.1, 24);                       // 1280x800 calibration
    T.setScrollX(fx.run.startScroll);
    T.sliceStats.startedAt = 0;
    T.sliceStats.setbacks = 0;
    P.player.x = fx.run.playerSpawn.x; P.player.y = fx.run.playerSpawn.y;
    P.player.vx = 0; P.player.vy = 0;
    P.player.hp = P.P.maxHealth; P.player.lives = P.P.lives;
    P.player.grounded = false; P.player.onOneWay = null;
    P.player.iframesUntil = 0; P.player.hitstunUntil = 0;
    P.player.fallbackStreak = 0; P.player.fallbackEarnedTiles = 0;
    P.player.edgePinnedMs = 0;
    ST.setState('PLAYING');
    const dt = 1 / 60;
    const out = { negMargin: 0, insideSolid: 0, worstMargin: Infinity, setbacks: 0,
                  hpZero: 0, states: {}, cap: fx.fallback.maxConsecutive };
    for (let f = 0; f < 900; f++) {
      ${drive}
      T.advanceGameMs(dt * 1000);
      S.updateScroll(dt);
      P.updatePlayer(dt);
      out.states[ST.state] = (out.states[ST.state] || 0) + 1;
      if (ST.state !== 'PLAYING') break;
      const margin = P.player.x - P.player.hw - E.sLeftEdge();
      out.worstMargin = Math.min(out.worstMargin, margin);
      if (margin < -1e-6) out.negMargin++;
      const x0 = Math.floor(P.player.x - P.player.hw + 0.02);
      const x1 = Math.floor(P.player.x + P.player.hw - 0.02);
      const y0 = Math.floor(P.player.y + 0.02);
      const y1 = Math.floor(P.player.y + P.player.h - 0.02);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++)
        if (L.isSolid(i, j)) out.insideSolid++;
    }
    out.setbacks = T.sliceStats.setbacks;
    out.finalState = ST.state;
    out.streak = P.player.fallbackStreak;
    out.earned = Math.round(P.player.fallbackEarnedTiles * 100) / 100;
    P.cancelSliceRetry();
    console.log(JSON.stringify(out));
  `;
  const run = (query, drive, label) => {
    try {
      return JSON.parse(execFileSync(process.execPath,
        ['--input-type=module', '-e', child(query, drive)], { encoding: 'utf8' }));
    } catch (e) {
      console.error('pathcheck: slice child (' + label + ') failed: ' + e.message);
      return null;
    }
  };

  const fx0 = resolveTraversalPace('hunt');
  // zero input: the plane conveys, nothing is earned, the cap must fire
  const idle = run('slice=traversal&pace=hunt', '', 'idle');
  ok(!!idle, 'the fixture sim steps headlessly with no input');
  if (idle) {
    ok(idle.finalState === 'SLICE_RETRY' &&
       idle.setbacks >= 1 && idle.setbacks <= idle.cap,
       'a zero-input fixture run reaches a terminal state: ' + idle.setbacks +
       ' fallbacks then ' + idle.finalState);
    ok(idle.earned < fx0.fallback.recoverTiles,
       'conveyed displacement cannot buy the fallback mercy chain: earned ' +
       idle.earned + ' of ' + fx0.fallback.recoverTiles + ' tiles');
    ok(idle.negMargin === 0,
       'the fixture plane never strands the player behind it, worst margin ' +
       idle.worstMargin.toFixed(3));
    ok(idle.insideSolid === 0,
       'a crushed fixture player never ends a frame inside terrain, got ' +
       idle.insideSolid + ' frames');
  }

  // The mercy chain, driven where a lower route exists: take a fallback, run
  // forward under your own power past recoverTiles, take another — the streak
  // must have been forgiven, so the cap is not tripped and play continues.
  const mercy = (() => {
    const script = `
      globalThis.__HB_QUERY__ = 'slice=traversal&pace=hunt';
      const [T, E, S, P, ST, IN] = await Promise.all([
        ${JSON.stringify('file://' + join(srcDir, 'sim', 'time.js'))},
        ${JSON.stringify('file://' + join(srcDir, 'sim', 'edges.js'))},
        ${JSON.stringify('file://' + join(srcDir, 'sim', 'scroll.js'))},
        ${JSON.stringify('file://' + join(srcDir, 'sim', 'player.js'))},
        ${JSON.stringify('file://' + join(srcDir, 'sim', 'state.js'))},
        ${JSON.stringify('file://' + join(srcDir, 'sim', 'input.js'))},
      ].map((u) => import(u)));
      E.setEdges(-3.1, 24);
      const put = (x, y) => {
        P.player.x = x; P.player.y = y; P.player.vx = 0; P.player.vy = 0;
        P.player.hp = P.P.maxHealth; P.player.iframesUntil = 0;
        P.player.grounded = true; P.player.onOneWay = null;
        T.setScrollX(x - 30);                 // plane far behind: room to be knocked back
      };
      ST.setState('PLAYING');
      P.player.fallbackStreak = 0; P.player.fallbackEarnedTiles = 0;
      const out = {};
      put(60, 8.35);                          // an upper route with floor below it
      P.loseLife('damage');
      out.firstStreak = P.player.fallbackStreak;
      out.firstState = ST.state;
      IN.keys.right = true;                   // earn the mercy back on foot
      for (let f = 0; f < 120; f++) {
        T.advanceGameMs(1000 / 60); S.updateScroll(1 / 60); P.updatePlayer(1 / 60);
        if (ST.state !== 'PLAYING') break;
      }
      IN.keys.right = false;
      out.earned = Math.round(P.player.fallbackEarnedTiles * 100) / 100;
      put(P.player.x, 8.35);
      P.loseLife('damage');
      out.secondStreak = P.player.fallbackStreak;
      out.secondState = ST.state;
      P.cancelSliceRetry();
      console.log(JSON.stringify(out));
    `;
    try {
      return JSON.parse(execFileSync(process.execPath,
        ['--input-type=module', '-e', script], { encoding: 'utf8' }));
    } catch (e) {
      console.error('pathcheck: mercy child failed: ' + e.message);
      return null;
    }
  })();
  ok(!!mercy, 'the fixture sim can be driven through a fallback and a recovery');
  if (mercy) {
    ok(mercy.firstStreak === 1 && mercy.firstState === 'PLAYING',
       'a fallback with a route below it keeps play running, streak ' + mercy.firstStreak);
    ok(mercy.earned >= fx0.fallback.recoverTiles,
       'running forward under your own power is credited: earned ' + mercy.earned +
       ' of ' + fx0.fallback.recoverTiles + ' tiles');
    ok(mercy.secondStreak === 1 && mercy.secondState === 'PLAYING',
       'the earned mercy forgives the streak instead of tripping the cap: streak ' +
       mercy.secondStreak + ', state ' + mercy.secondState);
  }
}

/* ---- G1: the limb read of the tower, and the bend cull ----------------- *
 * ?g1=1 is a RENDER interpretation of the shipped corner ritual (the camera
 * orbits a static faceted leg instead of a face being zippered into place), so
 * the assertions here are about two things only: that the bake plan is static
 * and legal, and that projectiles stop at a bend instead of steering around
 * the body with the ribbon. Nothing in this section touches sim behaviour,
 * which is the whole claim being checked.                                  */
{
  const level = buildLevel(CONFIG);
  const groundH = level.groundH;
  const plan = limbBakePlan(CONFIG, groundH);
  const L = CONFIG.limb;

  // --- the plan is a static bake, not choreography ---------------------
  ok(plan.length > 200, 'the limb bakes a body (' + plan.length + ' pieces)');
  {
    const again = limbBakePlan(CONFIG, groundH);
    ok(JSON.stringify(plan) === JSON.stringify(again),
       'the bake plan is deterministic: same config, same body, no rng');
    const src = readFileSync(join(srcDir, 'pure', 'limb.js'), 'utf8');
    ok(!/\bgameMs\b|\btMs\b|\bdt\b|Math\.random/.test(stripComments(src)),
       'src/pure/limb.js takes no time or randomness argument: a body that ' +
       'cannot be animated cannot assemble (CP3 ruling)');
    const rsrc = stripComments(readFileSync(join(srcDir, 'render', 'limb.js'), 'utf8'));
    ok(!/installView|view\./.test(rsrc),
       'src/render/limb.js installs no view hook at all: no per-frame, ritual ' +
       'or build callback can move the limb');
  }

  // --- facets and joints line up with the shipped path -----------------
  {
    const facets = limbFacets(CONFIG);
    ok(facets.length === CONFIG.path.faces + 1,
       'one armour facet per straight run of the polyline, got ' + facets.length);
    ok(facets[0].s0 === 0 && facets[facets.length - 1].s1 === CONFIG.levelLength,
       'the facets cover the whole level, intro to outro');
    let contiguous = true;
    for (let i = 1; i < facets.length; i++)
      if (facets[i].s0 !== facets[i - 1].s1 + CONFIG.path.chamferTiles) contiguous = false;
    ok(contiguous, 'consecutive facets are exactly one chamfer apart');
    for (const f of facets) {
      const a = headingAt(SEGS, f.s0 + 0.5), b = headingAt(SEGS, f.s1 - 0.5);
      ok(Math.abs(a - b) < 1e-12,
         'facet ' + f.k + ' is one flat plane: no bend inside it');
    }
    const joints = limbJoints(CONFIG);
    ok(joints.length === CORNER_S.length &&
       joints.every((j, i) => j.s === CORNER_S[i]),
       'one joint per shipped corner, at the shipped pivot');
    ok(joints.every((j) => Math.abs(j.sMid - (j.s + CONFIG.path.chamferTiles / 2)) < 1e-12),
       'the joint is centred on the chamfer, so its mass reads as one hinge');
    // the generator's apron is what makes far outward mass legal at a joint
    for (const j of joints)
      ok(!limbSpanHasGap(groundH, j.apron0, j.apron1),
         'joint ' + j.k + ' apron is solid ground in every column');
    ok(limbFacetTone(0, CONFIG).join() === '1,1,1',
       'facet 0 is the untinted reference tone');
  }

  // --- the two rules that keep the theatre honest ----------------------
  {
    const bad = limbPlanViolations(plan, CONFIG, groundH);
    ok(bad.length === 0, 'no limb piece breaks the play-band/fall rules' +
       (bad.length ? ': ' + bad[0].why + ' ' + JSON.stringify(bad[0].piece) : ''));
    const outward = plan.filter((p) => limbOutwardReach(p, CONFIG) > 0);
    ok(outward.length > 0, 'the limb HAS outward armour (that is the parallax)');
    // the deck kerb is the one documented exception (its top is below the deck,
    // so a camera looking down at the deck cannot have it occlude anything on
    // the deck) and carries its own two rules, checked by limbPlanViolations
    ok(outward.every((p) => p.kind === 'kerb' || !limbSpansPlayBand(p, CONFIG)),
       'not one outward piece except the deck kerb enters y [' +
       L.playBand.y0 + ', ' + L.playBand.y1 + ']');
    {
      const kerbs = plan.filter((p) => p.kind === 'kerb');
      const solid = groundH.filter((g) => g > -100).length;
      ok(kerbs.length === solid,
         'the ramp edge runs every solid column and only those (' +
         kerbs.length + ' vs ' + solid + ')');
      ok(kerbs.every((p) => p.y + p.h / 2 <= groundH[Math.floor(p.s)] + 1e-9),
         'every kerb top sits below the deck it edges: it can never occlude RIG');
      ok(kerbs.every((p) => limbOutwardReach(p, CONFIG) <= L.kerbOutwardMax),
         'no kerb reaches more than ' + L.kerbOutwardMax + ' past the plane');
      // continuity is the whole point: the line must not break at a joint
      const j = limbJoints(CONFIG)[0];
      let run = 0;
      for (let x = j.apron0; x < j.apron1; x++)
        if (kerbs.some((p) => Math.abs(p.s - (x + 0.5)) < 1e-9)) run++;
      ok(run === j.apron1 - j.apron0,
         'the ramp edge is unbroken across a joint apron (' + run + '/' +
         (j.apron1 - j.apron0) + ' columns)');
    }
    const far = outward.filter((p) => limbOutwardReach(p, CONFIG) > L.fallOutwardMax);
    ok(far.length === CORNER_S.length * 2,
       'exactly the joint buttress and cup reach far outward, got ' + far.length);
    // an enemy at the spawn cap, and a rig at the deck, are never inside armour
    const capY = CONFIG.gen.laneCapY;
    ok(L.playBand.y1 >= capY + 0.5,
       'the protected band clears the hostile lane cap (' + capY + ')');
    ok(L.playBand.y0 <= -1,
       'the protected band clears the deck stack (4 tiles below ground)');
  }

  // --- projectiles leave on the tangent: the bend cull -----------------
  {
    const bends = bendSList(CONFIG);
    ok(bends.length === CORNER_S.length &&
       bends.every((b, i) => b === CORNER_S[i] + CONFIG.path.chamferTiles / 2),
       'a bend boundary sits at every chamfer midpoint, got ' + bends.join());
    ok(BEND_S.join() === '90,155,220,285,350,415',
       'shipped bend boundaries, got ' + BEND_S.join());
    ok(TRANSFORM_BEND_S.join() === TRANSFORM_FIXTURE.events.map((e) => e.seamS).join(),
       'the transformation fixture bends at its seams');
    ok(bends.every((b) => b < TRAVERSAL_FIXTURE.bounds.x0 || b > TRAVERSAL_FIXTURE.bounds.x1),
       'no bend boundary falls inside the traversal slice: the movement fixture ' +
       'is on one straight facet, so the cull cannot change its gunplay');
    ok(crossesBend(bends, 89.5, 90.5) && crossesBend(bends, 90.5, 89.5),
       'a crossing is caught in both directions: no shooting backwards around a limb');
    ok(!crossesBend(bends, 80, 89.9) && !crossesBend(bends, 90.1, 99),
       'a shot that stays on one facet is never culled');
    ok(!crossesBend(bends, 90, 91),
       'a projectile already past a boundary is not culled again by it');
    // Tunneling: the test is over the whole substep interval, so the fastest
    // bolt at the worst clamped frame cannot skip a boundary. Prove it with the
    // real substep arithmetic from src/sim/weapons.js.
    {
      const fastest = Math.max(...Object.values(CONFIG.weapons).map((w) => w.speed));
      const dt = 0.05;                       // the frame clamp in src/main.js
      const steps = Math.min(4, Math.max(1, Math.ceil(fastest * dt / 0.45)));
      const perStep = fastest * dt / steps;
      ok(perStep <= 0.5, 'worst substep is ' + perStep.toFixed(3) + ' tiles');
      let skipped = 0;
      for (let start = 85; start < 89.999; start += perStep / 3) {
        let x = start, hit = false;
        for (let k = 0; k < 40 && !hit; k++) {
          const x0 = x; x += perStep;
          if (crossesBend(bends, x0, x)) hit = true;
        }
        if (!hit) skipped++;
      }
      ok(skipped === 0, 'no max-speed bolt path fired short of a boundary skips it (' +
         skipped + ' skipped)');
      // and a 10x-over-speed projectile, in case a later weapon outruns the
      // substep budget: the interval test still catches it
      let hitBig = false;
      for (let x = 80, k = 0; k < 5; k++) { const x0 = x; x += 4; if (crossesBend(bends, x0, x)) hitBig = true; }
      ok(hitBig, 'even a 4-tile-per-substep projectile is caught by the interval test');
    }
  }
}

/* ---- the bend cull, driven through the REAL bullet loop ---------------- *
 * The pure interval test above is the rule; this is the rule actually running
 * in src/sim/weapons.js. A child process so the shipped six-face mode is
 * selected at module init, and so the view bridge can be instrumented without
 * leaking into the assertions that share this process's module state.
 *
 * The control matters as much as the case: the same shot fired at a hostile on
 * THIS side of the bend must still kill it, or "no damage past the bend" would
 * pass for a build where the gun simply stopped working.                    */
{
  const simUrl = 'file://' + join(srcDir, 'sim');
  const child = `
    globalThis.__HB_QUERY__ = '';
    const [W, H, P, B, T] = await Promise.all([
      import(${JSON.stringify('file://' + join(srcDir, 'sim', 'weapons.js'))}),
      import(${JSON.stringify('file://' + join(srcDir, 'sim', 'hostiles.js'))}),
      import(${JSON.stringify('file://' + join(srcDir, 'sim', 'player.js'))}),
      import(${JSON.stringify('file://' + join(srcDir, 'sim', 'bridge.js'))}),
      import(${JSON.stringify('file://' + join(srcDir, 'sim', 'time.js'))}),
    ]);
    const LANE = 7;                       // above every generator ground height
    const culls = [];
    B.installView({ bullets: { bendCulled: (i, b, fromX) => culls.push({ x: b.x, fromX, phase: 'far' }) } });
    P.player.x = 85; P.player.y = 3; P.player.facing = 1;
    // both hostiles fully materialized before anything is fired: a wasp still
    // condensing out of the tower depth has no hitbox at all
    H.spawnHostile(92, LANE, 0);          // past the bend: must be unreachable
    H.spawnHostile(87, LANE, 0);          // before it: the control, must die
    T.advanceGameMs(2000);
    const past = H.hostiles[0], near = H.hostiles[1];
    const pastHp0 = past.hp, nearHp0 = near.hp;
    const run = (steps) => {
      for (let k = 0; k < steps; k++) {
        W.updateBullets(1 / 60);
        T.advanceGameMs(1000 / 60);
      }
    };
    // 1. the case: fire past the bend, with the near hostile removed from the line
    H.hostiles.splice(1, 1);
    W.fireWeapon('L', 85, LANE, 1, 0, true);        // the fastest bolt in the roster
    run(90);
    const pastHp = past.hp;
    // 2. the control: put the near hostile back and fire the same shot
    H.spawnHostile(87, LANE, 0);
    T.advanceGameMs(2000);
    const ctrl = H.hostiles[H.hostiles.length - 1];
    const ctrlHp0 = ctrl.hp;
    W.fireWeapon('R', 85, LANE, 1, 0, true);        // R does not pierce: it stops here
    run(30);
    const ctrlHp = ctrl.hp;
    // 3. backwards: from the far facet toward the one RIG came from, with the
    //    arena emptied so nothing but the boundary can stop the bolt
    H.hostiles.splice(0, H.hostiles.length);
    const back = [];
    B.installView({ bullets: { bendCulled: (i, b, fromX) => back.push({ x: b.x, fromX }) } });
    W.fireWeapon('R', 95, LANE, -1, 0, true);
    run(60);
    console.log(JSON.stringify({
      culls, back, pastHp0, pastHp, ctrlHp0, ctrlHp,
      live: W.bulletPool.filter((b) => b.alive).length,
    }));
  `;
  let sim = null;
  try {
    sim = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child],
      { encoding: 'utf8' }));
  } catch (e) {
    console.error('pathcheck: bend-cull child failed: ' + e.message);
  }
  ok(!!sim, 'the bullet loop runs headlessly with no renderer');
  if (sim) {
    ok(sim.culls.length === 1, 'one shot fired across a bend, one cull, got ' + sim.culls.length);
    if (sim.culls.length) {
      const c = sim.culls[0];
      ok(c.x >= 90 && c.x <= 90.5,
         'the bolt dies within half a tile past the boundary, at ' + c.x.toFixed(3));
      ok(c.fromX < 90,
         'the departure tangent is read from BEFORE the boundary (' + c.fromX.toFixed(3) + ')');
    }
    ok(sim.pastHp === sim.pastHp0,
       'a hostile 2 tiles past the bend takes no damage: no shooting around the limb');
    ok(sim.ctrlHp < sim.ctrlHp0,
       'CONTROL: the same bolt still kills a hostile on this side of the bend ' +
       '(' + sim.ctrlHp0 + ' -> ' + sim.ctrlHp + ')');
    ok(sim.back.length === 1 && sim.back[0].x <= 90 && sim.back[0].x > 89.4,
       'a shot fired back toward the previous facet dies at the same boundary, got ' +
       JSON.stringify(sim.back));
    ok(sim.live === 0, 'no culled projectile is left alive in the pool');
  }
}

/* ---- ?g1=1 is render-only, proved at the sim layer -------------------- *
 * The strongest form of the claim: run the SAME scripted six-face pass twice
 * in two child processes, once with no flags and once with __HB_QUERY__ set to
 * ?g1=1, with a fixed timestep and no renderer at all — then compare the full
 * simulation trace. src/sim/* and src/pure/* both import src/mode.js, so if the
 * flag reached any simulated decision (scroll, gate arming, the ritual clock,
 * the built-column state machine, spawn tables, collision, the player) the two
 * traces would differ. The gate wave is cleared through the real removal path,
 * so the corner ritual actually fires inside the compared window.
 *
 * This is the mechanical half of the render-only proof; the browser half (which
 * exercises the render layer that the flag DOES change) lives in
 * tools/playtest/g1-capture.mjs's `equivalence` mode.                       */
{
  const simBase = 'file://' + join(srcDir, 'sim');
  const traceChild = (query) => `
    globalThis.__HB_QUERY__ = ${JSON.stringify(query)};
    const [T, E, LV, SC, PLm, IN, ST, HO, WP, SP, WG] = await Promise.all([
      import(${JSON.stringify(simBase + '/time.js')}),
      import(${JSON.stringify(simBase + '/edges.js')}),
      import(${JSON.stringify(simBase + '/level.js')}),
      import(${JSON.stringify(simBase + '/scroll.js')}),
      import(${JSON.stringify(simBase + '/player.js')}),
      import(${JSON.stringify(simBase + '/input.js')}),
      import(${JSON.stringify(simBase + '/state.js')}),
      import(${JSON.stringify(simBase + '/hostiles.js')}),
      import(${JSON.stringify(simBase + '/weapons.js')}),
      import(${JSON.stringify(simBase + '/spawner.js')}),
      import(${JSON.stringify(simBase + '/wavegate.js')}),
    ]);
    // the boot the composition root performs: edges from the camera probe
    // (hard-coded here to the shipped 16:9 calibration, identical either way),
    // the level's build state, and the player on the first face
    E.setEdges(-18.9, 26.4);
    LV.unbuildFutureFaces();
    ST.setState('PLAYING');
    const p = PLm.player;
    p.x = 6; p.y = 3; p.vx = 0; p.vy = 0;
    IN.keys.right = true; IN.keys.fire = true;
    const dt = 1 / 60;
    const rows = [];
    let jumpUntil = 0;
    for (let f = 0; f < 2400; f++) {
      // A jump policy, not a jump schedule: hop when the deck ahead is a gap or
      // a step. It reads only simulation state, so it is deterministic — and if
      // the flag under test changed any of that state, the policy would diverge
      // too, which makes the comparison stricter rather than weaker.
      if (p.grounded &&
          (LV.groundTopAt(p.x + 1.7) < -100 || LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
        IN.bufferJumpUntil(T.gameMs + 120);
        IN.keys.jump = true;
        jumpUntil = T.gameMs + 260;
      }
      if (T.gameMs > jumpUntil) IN.keys.jump = false;
      T.advanceGameMs(dt * 1000);
      SC.updateScroll(dt);
      SP.updateSpawner();
      PLm.updatePlayer(dt);
      if (ST.state !== 'PLAYING') break;
      HO.updateHostiles(dt);
      WP.updateBullets(dt);
      // Clear the gate the way the game does — through the one removal path
      // that reports to the gate runtime — as soon as the wave has fully
      // materialized, so the ritual fires at a deterministic frame.
      const c = WG.activeCorner();
      if (c && c.state === 'gate') {
        for (let i = HO.hostiles.length - 1; i >= 0; i--)
          if (T.gameMs >= HO.hostiles[i].enterUntil) HO.removeHostile(i, false);
      }
      const cc = WG.activeCorner();
      rows.push([
        f, T.gameMs.toFixed(3), T.scrollX.toFixed(6),
        p.x.toFixed(6), p.y.toFixed(6), p.vx.toFixed(6), p.vy.toFixed(6),
        p.grounded ? 1 : 0, p.hp, p.lives,
        cc ? cc.k : 0, cc ? cc.state : 'done', cc ? (cc.tStart | 0) : 0,
        HO.hostiles.length, HO.kills,
        // the built-column state machine: what the next face collides as
        LV.columnBuilt(89) ? 1 : 0, LV.columnBuilt(100) ? 1 : 0,
        LV.builtGroundTopAt(92).toFixed(3),
        HO.hostiles.map((e) => e.x.toFixed(3) + ':' + e.y.toFixed(3)).join('|'),
      ].join(','));
      if (cc === null) break;                     // every corner done
    }
    console.log(JSON.stringify({
      rows: rows.length,
      digest: rows.join(String.fromCharCode(10)).length,
      trace: rows,
      state: ST.state, kills: HO.kills, scrollX: T.scrollX,
    }));
  `;
  const runTrace = (query) => {
    try {
      return JSON.parse(execFileSync(process.execPath,
        ['--input-type=module', '-e', traceChild(query)],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    } catch (e) {
      console.error('pathcheck: g1 equivalence child failed (' + query + '): ' + e.message);
      return null;
    }
  };
  // T-009 flipped which of these two render modes is the default (the static
  // limb reveal now ships without a flag, decisions.md entry 3), so the pair
  // under comparison is spelled the other way round — `?zip=1` is the legacy
  // brick-slam reveal and the empty query is the limb. The claim, the trace,
  // and the two modes being compared are exactly the same as before; only the
  // flag that selects them moved.
  const base = runTrace('?zip=1');
  const g1 = runTrace('');
  ok(!!base && !!g1, 'the six-face sim runs headlessly in both render modes');
  if (base && g1) {
    ok(base.rows > 1000,
       'the scripted pass is long enough to contain a corner ritual (' + base.rows + ' frames)');
    // the window really did include the ritual and the face commit
    const turning = base.trace.filter((r) => r.split(',')[11] === 'turning').length;
    ok(turning > 50, 'the compared window contains the turning ritual (' + turning + ' frames)');
    const committed = base.trace.some((r) => r.split(',')[16] === '1');
    ok(committed, 'the compared window contains the next face committing to collision');
    let firstDiff = -1;
    for (let i = 0; i < Math.min(base.trace.length, g1.trace.length); i++)
      if (base.trace[i] !== g1.trace[i]) { firstDiff = i; break; }
    ok(base.rows === g1.rows,
       'both modes simulate the same number of frames (' + base.rows + ' vs ' + g1.rows + ')');
    ok(firstDiff === -1,
       'every simulated value is identical with ?g1=1: scroll, gate state, ritual ' +
       'clock, built columns, spawns, hostiles, player' +
       (firstDiff >= 0 ? ' — first difference at frame ' + firstDiff +
         '\n  base: ' + base.trace[firstDiff] + '\n  g1:   ' + g1.trace[firstDiff] : ''));
    ok(base.kills === g1.kills && base.state === g1.state &&
       base.scrollX === g1.scrollX,
       'same kills, same end state, same scroll cursor');
  }
}

/* ---- T-002: ritual decision trace + frame-scoped input determinism ---- *
 * The t2-transform-seam-rush investigation (docs/playtests/
 * 2026-07-t2-frame-alignment.md) instrumented the transformation ritual's
 * arming check and proved two properties this section pins down as regression
 * assertions:
 *   (1) THE TRACE CONTRACT — src/sim/transform.js's decision trace records,
 *       for a rush at the seam, the halt/trigger/arm/start frames with the
 *       halt-bound signature: RIG reaches triggerS first, parks at the
 *       frontier clamp, and the ritual's start frame is set by the
 *       autonomous scroll halt (binding 'halt'), with the start-frame
 *       trigger margin equal to the frontier-to-trigger distance — i.e. the
 *       arming check is NOT knife-edge on input arrival in the rush case.
 *   (2) FRAME-SCOPED DETERMINISM — two headless transform-slice runs with
 *       byte-identical, frame-indexed input produce bit-identical full
 *       simulation traces. This is the boundary claim behind playtest
 *       README hook request #5: everything nondeterministic about t2 lives
 *       in browser-side input *delivery*, not in the sim.               */
{
  const simBase = 'file://' + join(srcDir, 'sim');
  const xfChild = (drive, frames, extra) => `
    globalThis.__HB_QUERY__ = 'slice=transform&enemies=0';
    const [T, E, LV, SC, PLm, IN, ST, HO, WP, SP, XFm] = await Promise.all([
      import(${JSON.stringify(simBase + '/time.js')}),
      import(${JSON.stringify(simBase + '/edges.js')}),
      import(${JSON.stringify(simBase + '/level.js')}),
      import(${JSON.stringify(simBase + '/scroll.js')}),
      import(${JSON.stringify(simBase + '/player.js')}),
      import(${JSON.stringify(simBase + '/input.js')}),
      import(${JSON.stringify(simBase + '/state.js')}),
      import(${JSON.stringify(simBase + '/hostiles.js')}),
      import(${JSON.stringify(simBase + '/weapons.js')}),
      import(${JSON.stringify(simBase + '/spawner.js')}),
      import(${JSON.stringify(simBase + '/transform.js')}),
    ]);
    const M = await import(${JSON.stringify('file://' + join(srcDir, 'mode.js'))});
    const FX = M.ACTIVE_FIXTURE;
    E.setEdges(-3.1, 24);
    T.setScrollX(FX.run.startScroll);
    const p = PLm.player;
    p.x = FX.run.playerSpawn.x; p.y = FX.run.playerSpawn.y;
    p.vx = 0; p.vy = 0; p.grounded = false;
    ST.setState('PLAYING');
    const dt = 1 / 60;
    const rows = [];
    let jumpUntil = 0;
    for (let f = 0; f < ${frames}; f++) {
      ${drive}
      T.advanceGameMs(dt * 1000);
      SC.updateScroll(dt);
      SP.updateSpawner();
      PLm.updatePlayer(dt);
      if (ST.state !== 'PLAYING') break;
      HO.updateHostiles(dt);
      WP.updateBullets(dt);
      rows.push([f, T.gameMs.toFixed(3), T.scrollX.toFixed(6),
        p.x.toFixed(6), p.y.toFixed(6), p.vx.toFixed(6), p.vy.toFixed(6),
        p.grounded ? 1 : 0, p.hp,
        (XFm.activeTransformEvent() || { state: 'complete' }).state].join(','));
      ${extra || ''}
    }
    PLm.cancelSliceRetry();
    console.log(JSON.stringify({
      rows: rows.length, digest: rows.join(String.fromCharCode(10)),
      state: ST.state, x: p.x,
      trace: XFm.transformDecisionTrace(),
      afterReset: (XFm.resetTransform(), XFm.transformDecisionTrace()),
    }));
  `;
  const runXf = (drive, frames, extra, label) => {
    try {
      return JSON.parse(execFileSync(process.execPath,
        ['--input-type=module', '-e', xfChild(drive, frames, extra)],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    } catch (e) {
      console.error('pathcheck: T-002 child (' + label + ') failed: ' + e.message);
      return null;
    }
  };

  // (1) reactive rush to the first seam: hold right, hop gaps and steps
  const rushDrive = `
      if (p.grounded &&
          (LV.groundTopAt(p.x + 1.7) < -100 || LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
        IN.bufferJumpUntil(T.gameMs + 120);
        IN.keys.jump = true;
        jumpUntil = T.gameMs + 260;
      }
      if (T.gameMs > jumpUntil) IN.keys.jump = false;
      IN.keys.right = true;
  `;
  const rush = runXf(rushDrive, 900,
    'if (XFm.transformEvents[0].state === "done" && f > 0 && rows.length && ' +
    'XFm.transformEvents[0].dFinishAt > 0 && T.gameMs > XFm.transformEvents[0].dFinishAt + 500) break;',
    'rush');
  ok(!!rush, 'the transform-slice sim rushes the first seam headlessly');
  if (rush) {
    const ev = rush.trace[0];
    const XT2 = CONFIG.transform;
    ok(ev.state === 'done' && ev.finishAt > 0,
       'the rush completes the first ritual (state ' + ev.state + ')');
    ok(ev.haltAt > 0 && ev.triggerAt > 0 && ev.armAt > 0 && ev.startAt > 0,
       'the decision trace records halt/trigger/arm/start frames');
    ok(ev.armAt <= ev.startAt && ev.startAt >= ev.haltAt && ev.startAt >= ev.triggerAt,
       'trace ordering: armed before started, started after both preconditions');
    ok(ev.triggerAt < ev.haltAt && ev.binding === 'halt',
       'a rush is HALT-bound: RIG reaches the trigger ' +
       ((ev.haltAt - ev.triggerAt) / 1000).toFixed(2) + 's before the scroll halt — ' +
       'the arming check is not the input knife-edge (T-002)');
    const frontierMargin = XT2.thresholdTiles - XT2.clampMargin - XT2.triggerOffset;
    near(ev.startTriggerMargin, frontierMargin, 0.05,
       'start-frame trigger margin equals the frontier-to-trigger distance ' +
       '(RIG parked at the clamp, position contracted before the start frame)');
    ok(rush.afterReset.every((d) => d.startAt === -1 && d.haltAt === -1 &&
       d.triggerAt === -1 && d.armAt === -1 && d.finishAt === -1 && d.binding === null),
       'resetTransform clears the whole decision trace');
  }

  // (2) frame-indexed blind schedule, run twice: bit-identical traces.
  // Taps land on absolute FRAME numbers (down 13k+18, up 7 frames later) —
  // the synchronous injection semantics of playtest README hook request #5.
  const schedDrive = `
      const ph = f % 13;
      if (ph === 5) {
        IN.bufferJumpUntil(T.gameMs + 120);
        IN.keys.jump = true;
      } else if (ph === 12) {
        IN.keys.jump = false;
      }
      IN.keys.right = true;
  `;
  const runA = runXf(schedDrive, 600, '', 'sched-A');
  const runB = runXf(schedDrive, 600, '', 'sched-B');
  ok(!!runA && !!runB, 'the frame-indexed schedule runs headlessly twice');
  if (runA && runB) {
    ok(runA.rows === runB.rows && runA.digest === runB.digest,
       'byte-identical frame-scoped input yields a bit-identical simulation ' +
       'trace (' + runA.rows + ' frames) — t2 nondeterminism is input ' +
       'DELIVERY, not the sim (T-002)');
    ok(runA.state === runB.state && runA.x === runB.x,
       'same end state and final position across the twin runs');
  }
}

// --- palette pass (T-010): centralized render-side color roles ---------
// DESIGN Concept: deep teal environment, rust-orange metal, acid-green enemy
// glow, hot-magenta pickups, warm-white muzzle light; fog matched to
// background. Concept is the default; ?palette=classic is the grey-box
// baseline and must stay byte-faithful to CONFIG.palette.
{
  ok(resolvePaletteId('classic') === 'classic', 'palette: ?palette=classic resolves classic');
  ok(resolvePaletteId(null) === 'concept' && resolvePaletteId('') === 'concept' &&
     resolvePaletteId('junk') === 'concept',
     'palette: absent/junk ?palette resolves to the concept default');
  ok(PAL_ID === 'concept' && PAL_ACTIVE === PAL_CONCEPT,
     'palette: headless import (no query) lands on the concept default');

  const keyShape = (t) => Object.keys(t).sort().join(',');
  ok(keyShape(PAL_CLASSIC) === keyShape(PAL_CONCEPT),
     'palette: classic and concept tables carry identical token sets');
  for (const nested of ['limb', 'transform', 'shots', 'tints']) {
    ok(keyShape(PAL_CLASSIC[nested]) === keyShape(PAL_CONCEPT[nested]),
       'palette: nested "' + nested + '" token sets match across modes');
  }

  // classic fidelity: every key CONFIG.palette carries must appear unchanged,
  // so the grey-box comparison URL can never drift from the shipped look
  let faithful = true;
  for (const [k, v] of Object.entries(CONFIG.palette)) {
    if (k === 'shots' || k === 'tints') {
      for (const [kk, vv] of Object.entries(v)) if (PAL_CLASSIC[k][kk] !== vv) faithful = false;
    } else if (k.startsWith('hook')) {
      continue;                    // hook.js is judged-rejected and untokenized on purpose
    } else if (PAL_CLASSIC[k] !== v) faithful = false;
  }
  ok(faithful, 'palette: classic table is byte-faithful to CONFIG.palette');
  ok(PAL_CLASSIC.limbBg === CONFIG.limb.bg, 'palette: classic limb haze is CONFIG.limb.bg');

  // role hue guards on the concept table — the point of the pass. Channel
  // predicates, not exact values, so a later tuning stays inside its role.
  const ch = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const teal = (h) => { const [r, g, b] = ch(h); return g > r && b > r; };
  const rust = (h) => { const [r, g, b] = ch(h); return r > g && g > b; };
  const acid = (h) => { const [r, g, b] = ch(h); return g > r && g > b; };
  const C = PAL_CONCEPT;
  // boards 01/10/13 split the two environment roles: atmosphere/backdrop is
  // deep teal, everything RIG runs on plus all body mass is rust metal
  ok([C.bg, C.limbBg, C.limb.wall, C.limb.shadow, C.limb.skyline,
      C.transform.wall, C.transform.skyline, C.rain, C.vapor].every(teal),
     'palette: concept atmosphere/backdrop ladder is deep teal (g,b over r) — ' +
     'weather and breach vapor are atmosphere, so they ride the same family');
  ok(PAL_CLASSIC.vapor === 0xaebbc6 && PAL_CLASSIC.rain === 0x9fb4c6,
     'palette: classic weather/vapor stay byte-faithful to the shipped literals');
  ok([C.ground, C.groundAlt, C.catwalk, C.solid, C.limb.hull, C.limb.scute,
      C.limb.scuteAlt, C.limb.rib, C.limb.machine, C.transform.hull,
      C.transform.ceiling, C.transform.rib, C.transform.machine,
      C.transform.panel].every(rust),
     'palette: concept body/route/mechanism ladder is rust-orange (r>g>b)');
  // every token in this list is read by a mesh in src/render/hostiles.js —
  // the guard certifies the ecology that actually ships, not authored colors
  // no module consumes (that is why there is no generic "enemyGlow" token).
  ok([C.wasp, C.carrier, C.hound, C.houndCharge,
      C.polyp, C.polypBeam].every(acid),
     'palette: concept enemy tokens are acid green (g dominant)');
  // the roster's ONE warning language: tells (and the polyp's spent-vent
  // ember) stay warm in BOTH modes — a telegraph must never read as a body,
  // so it may not drift into the acid family the way the bodies do.
  ok([C.houndTell, C.polypTell, C.polypVent,
      PAL_CLASSIC.houndTell, PAL_CLASSIC.polypTell, PAL_CLASSIC.polypVent]
       .every((h) => rust(h) && !acid(h)),
     'palette: hostile tells/vent stay warm WARN amber in both modes');
  // Every hostile kind the SIM can spawn needs a body token in both tables.
  // This is the guard the T-010/T-004 collision was missing: the polyp landed
  // on main while this branch was in flight, CLASSIC never learned about it,
  // and the byte-fidelity assertion below only caught it after the merge.
  ok(Object.keys(simEnemyTable).every((k) =>
       PAL_CLASSIC[k] !== undefined && PAL_CONCEPT[k] !== undefined),
     'palette: every sim ENEMY kind has a body color token in both modes ' +
     '(' + Object.keys(simEnemyTable).join(', ') + ')');
  // identity tokens are an ABSENCE of palette choice: they may not be remapped
  ok(PAL_CLASSIC.glowOff === PAL_CONCEPT.glowOff && PAL_CLASSIC.glowOff === 0x000000 &&
     PAL_CLASSIC.hitFlash === PAL_CONCEPT.hitFlash && PAL_CLASSIC.hitFlash === 0xffffff,
     'palette: glowOff/hitFlash identity tokens are mode-independent');
  {
    const m = C.capsule.match(/^#([0-9a-f]{6})$/i);
    const [r, g, b] = m ? ch(parseInt(m[1], 16)) : [0, 0, 0];
    ok(r > 2 * g && b > 2 * g, 'palette: concept pickup capsule stays hot magenta');
  }
  {
    const [r, g, b] = ch(C.muzzle);
    ok(r >= g && g >= b && b >= 200, 'palette: concept muzzle/lance is warm white');
  }
  ok(Object.keys(CONFIG.weapons).every((k) =>
       PAL_CLASSIC.shots[k] !== undefined && PAL_CONCEPT.shots[k] !== undefined),
     'palette: every weapon letter has a shot color in both modes');

  // the transform fixture's three authored atmosphere bgs remap to teal in
  // concept and pass through untouched in classic (unknown values pass too)
  const bandBgs = TRANSFORM_FIXTURE.bands.map((b) => b.atmosphere.bg);
  ok(bandBgs.every((bg) => teal(atmosphereBg(bg, PAL_CONCEPT))),
     'palette: every transform atmosphere bg lands teal under concept');
  ok(bandBgs.every((bg) => atmosphereBg(bg, PAL_CLASSIC) === bg) &&
     atmosphereBg(0x123456, PAL_CONCEPT) === 0x123456,
     'palette: classic atmosphere is identity; unknown bgs pass through');

  // centralization is structural, not aspirational: the recolored render
  // modules may not reach CONFIG.palette directly any more. hostiles.js was
  // lane-fenced to the in-flight hostiles task (T-004) while this branch was
  // open; that task has merged, so the fence is lifted and the module is
  // tokenized like the rest. hook.js stays the ONE exemption — a judged-
  // rejected prototype (decisions.md entry 5) that gets no further investment.
  const tokenized = ['scene.js', 'level.js', 'capsules.js', 'bullets.js',
    'player.js', 'mods.js', 'limb.js', 'transform.js', 'tower.js', 'fx.js',
    'hostiles.js'];
  let scattered = [], literals = [];
  for (const f of tokenized) {
    const src = stripComments(readFileSync(join(srcDir, 'render', f), 'utf8'));
    if (/CONFIG\.palette|CONFIG\.limb\.bg/.test(src)) scattered.push(f);
    // raw colors are forbidden here too — a merged-in literal must be pulled
    // into palette.js (both tables) or it silently skips the concept remap
    // (this caught nothing at authoring time; T-001's vapor literal arrived
    // via merge). Both spellings count: 0xRRGGBB numbers AND CSS strings
    // ('#rgb'/'#rrggbb'/'#rrggbbaa', rgb()/rgba()), because the palette
    // already carries string tokens (capsuleInk, capsule) and a string
    // literal would skip the remap exactly as silently. The one exception is
    // 0xffffff: the identity base color of instance-/tint-colored materials,
    // not a palette choice.
    const colorLiteral =
      /0x[0-9a-fA-F]{6}\b|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\s*\(/g;
    for (const m of src.match(colorLiteral) || []) {
      if (m.toLowerCase() !== '0xffffff') literals.push(f + ':' + m);
    }
  }
  ok(scattered.length === 0,
     'palette: no scattered CONFIG.palette reads in tokenized render files' +
     (scattered.length ? ' (found: ' + scattered.join(', ') + ')' : ''));
  ok(literals.length === 0,
     'palette: no raw color literals — 0xRRGGBB or CSS #hex/rgb() — in ' +
     'tokenized render files (0xffffff identity base excepted)' +
     (literals.length ? ' (found: ' + literals.join(', ') + ')' : ''));
  const sceneSrc = stripComments(readFileSync(join(srcDir, 'render', 'scene.js'), 'utf8'));
  ok(/new THREE\.Color\(PAL\.bg\)/.test(sceneSrc) && /new THREE\.Fog\(PAL\.bg,/.test(sceneSrc),
     'palette: scene background and fog are constructed from the same bg token');
}

/* =============== T-012: audio layer (ui) static guards ================= *
 * src/ui/audio.js is presentation-only: it may read exported sim state and
 * wrap src/sim/bridge.js view hooks, but the sim must not know it exists,
 * it must not touch the render layer, and every sim surface it imports is
 * a sanctioned read surface or the bridge itself. Same class of static
 * guarantee guardLayer() gives pure/ and sim/, scoped to the one ui module
 * that observes the sim rather than rendering it.                        */
{
  const audioSrc = readFileSync(join(srcDir, 'ui', 'audio.js'), 'utf8');
  const audioCode = stripComments(audioSrc);
  const imports = [...audioSrc.matchAll(/^\s*import\s*(?:{([^}]*)}\s*from\s*)?['"]([^'"]+)['"]/gm)]
    .map((m) => ({ names: (m[1] || '').split(',').map((s) => s.trim()).filter(Boolean), spec: m[2] }));
  ok(imports.length > 0, 'T-012: audio module declares imports');
  ok(imports.every((im) => !/render|three/i.test(im.spec)),
     'T-012: ui/audio.js imports nothing from the render layer or three.js');
  // every sim import is bridge or a read surface — no setters, no spawners
  const audioSimAllow = {
    '../sim/bridge.js': ['view'],
    '../sim/time.js': ['gameMs', 'sliceStats'],
    '../sim/player.js': ['player', 'circleHitsPlayer'],
    '../sim/wavegate.js': ['activeCorner', 'cornerEvents'],
    '../sim/transform.js': ['transformEvents'],
  };
  for (const im of imports) {
    if (!im.spec.startsWith('../sim/')) continue;
    const allow = audioSimAllow[im.spec];
    ok(!!allow && im.names.length > 0 && im.names.every((n) => allow.includes(n)),
       'T-012: audio sim import is a sanctioned read surface: ' +
       im.spec + ' { ' + im.names.join(', ') + ' }');
  }
  // the sim layer never references the audio module (feature is ui-side only)
  for (const f of layerFiles('sim'))
    ok(!stripComments(readFileSync(f, 'utf8')).includes('audio'),
       'T-012: sim untouched by the audio layer: ' + f);
  // main.js integration is exactly one side-effect import line
  const mainCode = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  ok((mainCode.match(/audio/g) || []).length === 1 &&
     mainCode.includes("import './ui/audio.js';"),
     'T-012: main.js integration is the single side-effect import line');
  // wrappers delegate to the previously-installed hook before any synth work
  ok(/prev\(a, b, c\);/.test(audioCode),
     'T-012: audio hook wrappers call the prior implementation first');
  // ?audio=0 hard-disables: no wrapper install, no listeners, no context
  ok(/QUERY\.get\('audio'\) !== '0'/.test(audioCode) && /if \(AUDIO_ON\)/.test(audioCode),
     'T-012: ?audio=0 gates all wiring off');
  // the cue schedule audio keys on: both rituals expose ordered snap frames
  const audioCT = cornerTimeline(CONFIG), audioTT = transformTimeline(CONFIG);
  ok(audioCT.t1 < audioCT.t2 && audioCT.t2 < audioCT.t3 &&
     audioCT.t3 < audioCT.t4 && audioCT.t4 < audioCT.t6,
     'T-012: corner snap impact frames (t2, t4) are ordered inside the ritual');
  ok(audioTT.t1 < audioTT.t2 && audioTT.t2 < audioTT.t3 &&
     audioTT.t3 < audioTT.t4 && audioTT.t4 < audioTT.t6,
     'T-012: transform snap impact frames (t2, t4) are ordered inside the ritual');
  // ambience layer recount rides the post-'done' hook: wavegate.finishCorner
  // fires faceRevealed BEFORE c.state = 'done' and corner.finished after it,
  // so counting layers on faceRevealed is off by one and drops the last
  // face's layer (review finding, T-012). Guard both sides of the fix.
  ok(/function onCornerFinished\(\)[^\n]*applyLayers\(\)/.test(audioCode),
     'T-012: onCornerFinished recounts ambience layers (post-done hook)');
  ok(!/function onFaceRevealed\(\)[^\n]*applyLayers\(\)/.test(audioCode),
     'T-012: onFaceRevealed does not recount layers (fires pre-done, undercounts)');
  const wavegateCode = stripComments(
    readFileSync(join(srcDir, 'sim', 'wavegate.js'), 'utf8'));
  const wgFinish = wavegateCode.slice(wavegateCode.indexOf('function finishCorner'));
  ok(wgFinish.indexOf("state = 'done'") >= 0 &&
     wgFinish.indexOf("state = 'done'") < wgFinish.indexOf('view.corner.finished'),
     "T-012: wavegate.finishCorner commits state='done' before corner.finished fires");
}

/* ================ T-011: juice — the feedback pass ==================== *
 * Two halves, asserted separately because they live on opposite sides of
 * the boundary:
 *
 *   (a) src/pure/juice.js — the curves (hit-stop policy, trauma/shake,
 *       crush warning, burst shapes). Pure, so everything below is a
 *       direct call.
 *   (b) src/sim/time.js — the hit-stop CLOCK, driven here frame by frame
 *       at two different frame rates, because hit-stop is the one effect
 *       in the pass that changes gameplay and it must remove the same
 *       amount of simulated time at any cadence.
 *
 * Plus the static guards that keep the pass on its own side of the line:
 * the sim owns the timing, the renderer owns the looks, and ?juice=0
 * takes the whole thing out.
 *
 * This section runs LAST on purpose: it advances the shared gameMs clock,
 * so nothing that assumes a fresh clock may follow it.                  */
{
  const JU = CONFIG.juice, HS = JU.hitStop, SH = JU.shake, CR = JU.crush;

  /* --- config block: one home for every intensity --------------------- */
  ok(JU && HS && SH && CR && JU.muzzle && JU.impact && JU.death && JU.hurt &&
     JU.pickup && JU.pools,
     'T-011: CONFIG.juice carries one block per effect (hit-stop, shake, ' +
     'muzzle, impact, death, hurt, pickup, crush, pools)');
  for (const [name, spec] of [['impact', JU.impact], ['death', JU.death],
                              ['hurt', JU.hurt], ['pickup', JU.pickup]])
    ok(spec.count > 0 && spec.speed > 0 && spec.ms > 0 && spec.size > 0 &&
       Number.isFinite(spec.gravity),
       'T-011: burst spec ' + name + ' declares count/speed/ms/size/gravity');
  ok(JU.pools.particles > 0 && JU.pools.flashes > 0 &&
     JU.pools.particles >= JU.death.count * 4,
     'T-011: fixed pools are sized for a firefight (>= four simultaneous deaths)');

  /* --- hit-stop policy (pure) ----------------------------------------- */
  ok(HS.scale > 0 && HS.scale <= 1,
     'T-011: hit-stop is a dt SCALE in (0,1] — it can only ever slow the ' +
     'frame, so every tunneling/substep margin asserted above still holds');
  ok(HS.killMs > 0 && HS.hurtMs > HS.killMs && HS.maxMs >= HS.hurtMs,
     'T-011: hurt outlasts a kill, and the stack cap covers the longest single ' +
     'freeze');
  ok(HS.maxMs < CONFIG.player.hitstunMs + CONFIG.player.iframesMs,
     'T-011: even a maximally stacked freeze is shorter than the hit-stun it ' +
     'punctuates (the freeze is a beat, never a pause)');
  ok(hitStopEvent(0, 0, 3, 3) === null, 'T-011: a quiet frame arms nothing');
  ok(hitStopEvent(0, 1, 3, 3) === 'kill', 'T-011: a kill arms the kill freeze');
  ok(hitStopEvent(0, 0, 3, 2) === 'hurt', 'T-011: damage taken arms the hurt freeze');
  ok(hitStopEvent(0, 2, 3, 2) === 'hurt',
     'T-011: a kill and a hit on the same frame resolve to the HURT beat');
  ok(hitStopEvent(1, 0, 3, 3) === null && hitStopEvent(0, 0, 2, 3) === null,
     'T-011: a rewound tally or a healed hp (respawn) arms nothing');
  ok(hitStopMsFor('kill', HS) === HS.killMs && hitStopMsFor('hurt', HS) === HS.hurtMs &&
     hitStopMsFor(null, HS) === 0,
     'T-011: freeze duration comes from CONFIG, per event kind');
  ok(hitStopArm(0, 1000, 0, HS) === 0, 'T-011: a null event never arms the clock');
  ok(hitStopArm(0, 1000, HS.killMs, HS) === 1000 + HS.killMs,
     'T-011: arming sets the deadline one duration ahead');
  ok(hitStopArm(1000 + HS.hurtMs, 1000, HS.killMs, HS) === 1000 + HS.hurtMs,
     'T-011: a shorter freeze never truncates a longer one already running');
  ok(hitStopArm(1000 + HS.maxMs, 1000, HS.hurtMs, HS) === 1000 + HS.maxMs,
     'T-011: stacked freezes are capped at maxMs from now — a crowd kill can ' +
     'never stall the run');
  ok(hitStopScaleAt(1000, 1000 + HS.killMs, HS) === HS.scale &&
     hitStopScaleAt(1000 + HS.killMs, 1000 + HS.killMs, HS) === 1 &&
     hitStopScaleAt(1000, 0, HS) === 1,
     'T-011: the scale is live only strictly before the deadline');

  /* --- hit-stop clock (sim), driven at two frame rates ----------------- *
   * The property that matters: the SAME simulated time is removed whatever
   * the cadence, to within one frame of quantization. That is what keeps a
   * kill from being worth more on a fast machine.                        */
  function freezeLoss(frameMs) {
    resetSimHitStop();
    stepSimHitStop(0, 3);                // prime: a fresh run never freezes
    let lost = 0, frozenFrames = 0;
    const frames = Math.ceil((HS.maxMs + 200) / frameMs);
    for (let f = 0; f < frames; f++) {
      advanceSimGameMs(frameMs);
      const scale = stepSimHitStop(1, 3);   // one kill, seen from frame 0 on
      lost += frameMs * (1 - scale);
      if (scale !== 1) frozenFrames++;
    }
    return { lost, frozenFrames };
  }
  const want = HS.killMs * (1 - HS.scale);
  const fast = freezeLoss(8.333), slow = freezeLoss(16.667), crawl = freezeLoss(33.33);
  ok(Math.abs(fast.lost - want) <= 8.333 * (1 - HS.scale) + 1e-9 &&
     Math.abs(slow.lost - want) <= 16.667 * (1 - HS.scale) + 1e-9 &&
     Math.abs(crawl.lost - want) <= 33.33 * (1 - HS.scale) + 1e-9,
     'T-011: a kill removes killMs*(1-scale) of simulated time at 120/60/30 fps, ' +
     'to within one frame of quantization [got ' + fast.lost.toFixed(2) + ' / ' +
     slow.lost.toFixed(2) + ' / ' + crawl.lost.toFixed(2) + ', want ' +
     want.toFixed(2) + ']');
  ok(fast.frozenFrames > 0 && crawl.frozenFrames > 0,
     'T-011: the freeze is visible at every cadence (never rounded away)');
  {
    resetSimHitStop();
    stepSimHitStop(0, 3);
    advanceSimGameMs(16);
    const s1 = stepSimHitStop(0, 3);
    ok(s1 === 1 && simHitStopRemainingMs() === 0,
       'T-011: an uneventful frame leaves the world running');
    advanceSimGameMs(16);
    stepSimHitStop(0, 2);                // took a hit
    ok(simHitStopRemainingMs() > 0 && simHitStopRemainingMs() <= HS.hurtMs + 1e-6,
       'T-011: damage arms a live freeze bounded by hurtMs');
    resetSimHitStop();
    ok(simHitStopRemainingMs() === 0,
       'T-011: resetHitStop clears the freeze (a retry starts moving)');
    // …and the priming rule: the first sample after a reset is silent even
    // when the tallies it sees are non-zero (mid-run restarts, fixture retry)
    advanceSimGameMs(16);
    stepSimHitStop(7, 1);
    ok(simHitStopRemainingMs() === 0,
       'T-011: the first sample after a reset only seeds the baseline');
    advanceSimGameMs(16);
    stepSimHitStop(8, 1);
    ok(simHitStopRemainingMs() > 0,
       'T-011: …and the sample after that arms normally');
    resetSimHitStop();
  }

  /* --- trauma / shake -------------------------------------------------- */
  ok(juiceClamp01(-1) === 0 && juiceClamp01(2) === 1 && juiceClamp01(0.4) === 0.4,
     'T-011: clamp01 bounds the unit interval');
  ok(traumaAdd(0.9, 0.5) === 1 && traumaAdd(0, SH.kill) === SH.kill,
     'T-011: trauma accumulates and saturates at 1');
  ok(traumaAfter(1, 1000, SH.decayPerSec) === Math.max(0, 1 - SH.decayPerSec) &&
     traumaAfter(0.1, 1000, SH.decayPerSec) === 0,
     'T-011: trauma decays linearly and never goes negative');
  ok(SH.decayPerSec > 0 && 1 / SH.decayPerSec < 1,
     'T-011: full trauma drains in under a second — a shake is a punctuation ' +
     'mark, not a state');
  {
    const out = { x: 0, y: 0, roll: 0 };
    shakeAt(0, 1234, SH, out);
    ok(out.x === 0 && out.y === 0 && out.roll === 0,
       'T-011: no trauma, no shake (the camera is exactly where the pose put it)');
    let worst = 0, worstRoll = 0, samples = 0, nonzero = 0;
    for (let t = 0; t < 4000; t += 3.1) {
      shakeAt(1, t, SH, out);
      worst = Math.max(worst, Math.abs(out.x), Math.abs(out.y));
      worstRoll = Math.max(worstRoll, Math.abs(out.roll));
      samples++;
      if (Math.abs(out.x) > 1e-6) nonzero++;
    }
    ok(worst <= SH.maxOffset + 1e-9 && worstRoll <= SH.maxRollDeg + 1e-9,
       'T-011: shake is bounded by the configured world-tile / degree budget');
    ok(nonzero > samples * 0.9, 'T-011: the shake actually moves (not a flat line)');
    shakeAt(0.5, 900, SH, out);
    const half = Math.abs(out.x);
    shakeAt(1, 900, SH, out);
    near(half, Math.abs(out.x) * 0.25, 1e-9,
       'T-011: amplitude is trauma SQUARED — half the trauma is a quarter the ' +
       'shake, so small events barely move the frame (pillar 5)');
  }
  {
    // readability budget, measured against the shipped FAR view: the whole
    // shake stays a small fraction of RIG's own height at the default depth
    ok(SH.maxOffset < CONFIG.player.height * 0.12,
       'T-011: peak shake offset stays under an eighth of RIG\'s height — at the ' +
       'FAR default (decisions.md entry 7) the frame nudges, it never smears');
  }

  /* --- crush-edge warning --------------------------------------------- */
  ok(crushWarnIntensity(CR.startTiles, CR) === 0 &&
     crushWarnIntensity(CR.startTiles + 5, CR) === 0,
     'T-011: the crush warning is silent while the margin is safe');
  ok(crushWarnIntensity(0, CR) === 1 && crushWarnIntensity(-2, CR) === 1,
     'T-011: …saturates at the plane itself');
  {
    let monotone = true, prevI = -1;
    for (let m = CR.startTiles; m >= -0.5; m -= 0.05) {
      const v = crushWarnIntensity(m, CR);
      if (v < prevI - 1e-12) monotone = false;
      prevI = v;
    }
    ok(monotone, 'T-011: warning intensity only ever rises as the margin closes');
    ok(crushWarnIntensity(CR.startTiles / 2, CR) < 0.5,
       'T-011: the ramp is eased so the LAST tile carries the warning, not the ' +
       'whole approach');
  }
  ok(CR.startTiles > CONFIG.player.width &&
     CR.startTiles < CONFIG.player.runSpeed * 0.6,
     'T-011: the warning window is wider than RIG and shorter than a second of ' +
     'running — enough to react, not a permanent light');
  {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 2000; t += 7) {
      const v = warnPulse(0.6, t, CR);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    ok(lo >= 0 && hi <= 1 && hi - lo > 0.9, 'T-011: the warning pulse spans 0…1');
    ok(CR.pulseFastMs < CR.pulseSlowMs,
       'T-011: the pulse accelerates as the margin closes — the same warning ' +
       'grammar as the hound tell and the polyp iris');
  }

  /* --- bursts and life curves ----------------------------------------- */
  {
    let inRange = true, distinct = new Set(), maxMag = 0;
    const out = { s: 0, y: 0, d: 0 };
    for (let seed = 1; seed <= 6; seed++) {
      for (let i = 0; i < JU.death.count; i++) {
        burstVelocity(seed, i, JU.death.count, JU.death.speed, out);
        const mag = Math.hypot(out.s, out.y, out.d);
        maxMag = Math.max(maxMag, mag);
        if (!(mag <= JU.death.speed * 1.3)) inRange = false;
        distinct.add(Math.round(Math.atan2(out.y, out.s) * 100));
      }
    }
    ok(inRange, 'T-011: burst speeds stay inside their configured budget [max ' +
       maxMag.toFixed(2) + ']');
    ok(distinct.size >= JU.death.count,
       'T-011: a burst fans into distinct directions (no cross, no wheel)');
    const a = { s: 0, y: 0, d: 0 }, b = { s: 0, y: 0, d: 0 };
    burstVelocity(3, 4, 10, 8, a);
    burstVelocity(3, 4, 10, 8, b);
    ok(a.s === b.s && a.y === b.y && a.d === b.d,
       'T-011: bursts are seeded, not random — the same event always looks the ' +
       'same, and nothing here touches the sim rng stream');
    ok(hash01(0) >= 0 && hash01(0) < 1 && hash01(99999) >= 0 && hash01(99999) < 1,
       'T-011: the burst hash stays in [0,1)');
  }
  ok(particleAlpha(0) === 1 && particleAlpha(1) === 0 &&
     particleAlpha(0.5) < 0.5 && particleAlpha(2) === 0,
     'T-011: particles fade out fast and end at zero (no pop)');
  ok(particleScale(0, 1, 3) === 1 && particleScale(1, 1, 3) === 3,
     'T-011: particle scale interpolates its endpoints');
  ok(flashAlpha(0) === 1 && flashAlpha(0.1) === 1 && flashAlpha(1) === 0 &&
     flashAlpha(0.5) < 1,
     'T-011: a flash is instant-on, holds briefly, then decays to zero');

  /* --- static guards: which layer owns what ---------------------------- */
  const juiceSrc = readFileSync(join(srcDir, 'render', 'juice.js'), 'utf8');
  const juiceCode = stripComments(juiceSrc);
  const fxSrc = readFileSync(join(srcDir, 'render', 'fx.js'), 'utf8');
  const fxCode = stripComments(fxSrc);
  const timeCode = stripComments(readFileSync(join(srcDir, 'sim', 'time.js'), 'utf8'));
  const camCode = stripComments(readFileSync(join(srcDir, 'render', 'camera.js'), 'utf8'));
  const mainSrc = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));

  // the sim never imports the render layer (guardLayer already enforces the
  // general rule; this names the juice case so a future shortcut is loud)
  for (const f of layerFiles('sim'))
    ok(!/from\s*['"]\.\.\/render\//.test(stripComments(readFileSync(f, 'utf8'))),
       'T-011: sim layer imports no render module: ' + f);
  // hit-stop is decided sim-side and only ANNOUNCED to the renderer
  ok(/stepHitStop/.test(timeCode) && /view\.juice\.hitStop\(/.test(timeCode),
     'T-011: src/sim/time.js owns the hit-stop decision and notifies the view');
  ok(!/hitStopUntil\s*=/.test(juiceCode) && !/hitStopUntil\s*=/.test(fxCode) &&
     !/hitStopUntil\s*=/.test(camCode),
     'T-011: no render module can write the hit-stop clock');
  ok(/view\.juice\.hitStop/.test(
       stripComments(readFileSync(join(srcDir, 'sim', 'bridge.js'), 'utf8'))) === false &&
     /juice:\s*{\s*hitStop:\s*noop\s*}/.test(
       stripComments(readFileSync(join(srcDir, 'sim', 'bridge.js'), 'utf8'))),
     'T-011: the bridge declares the juice hook as an inert no-op by default');
  // every entity dt in the loop rides the same scale (a partial freeze would
  // desync the substep projectile integration against the world)
  ok(/const hScale = stepHitStop\(kills, player\.hp\);/.test(mainSrc),
     'T-011: the loop samples hit-stop once, before any entity update');
  ok(/const wScale = \(gameMs < mods\.chronoUntil[^\n]*\) \* hScale;/.test(mainSrc),
     'T-011: hit-stop COMPOSES with CHRONO (wScale = chrono × hit-stop) instead ' +
     'of replacing it');
  ok(/updateScroll\(dt \* wScale\)/.test(mainSrc) &&
     /updateHostiles\(dt \* wScale\)/.test(mainSrc) &&
     /updateCapsules\(dt \* wScale\)/.test(mainSrc),
     'T-011: the pursuing scroll and the world still take the CHRONO-scaled dt ' +
     '(now × hit-stop) — CHRONO must keep slowing the scroll it always slowed');
  ok(/updatePlayer\(dt \* hScale\)/.test(mainSrc) &&
     /updateBullets\(dt \* hScale\)/.test(mainSrc),
     'T-011: RIG and their projectiles take the hit-stop factor ALONE — the ' +
     'freeze is global, and CHRONO still leaves the player at full speed');
  // the pools step before the death return: the frame RIG dies is the frame
  // that spawns RIG's own burst, and a row only gets a matrix when they step
  ok(mainSrc.indexOf('updateJuice();') > mainSrc.indexOf('updatePlayer(dt * hScale)') &&
     mainSrc.indexOf('updateJuice();') <
       mainSrc.indexOf("if (state !== 'PLAYING') return;"),
     'T-011: the effect pools step after RIG and BEFORE the death early-return, ' +
     'so a death frame still draws its own burst');
  ok(/updateScore\(dt,/.test(mainSrc),
     'T-011: the CHARGE meter still steps on real dt (proposal A.3), unscaled by ' +
     'a freeze');
  // render side: shake is applied after the pose and never near the edge probe
  const syncBody = camCode.slice(camCode.indexOf('export function syncCamera'));
  ok(syncBody.indexOf('camera.lookAt(_look)') < syncBody.indexOf('applyShake()'),
     'T-011: shake is applied after the camera pose, never before it');
  const calBody = camCode.slice(camCode.indexOf('function calibrateEdges'),
    camCode.indexOf('export { calibrateEdges }'));
  ok(!/trauma|shake/i.test(calBody),
     'T-011: edge calibration (the one sanctioned render→sim write) is computed ' +
     'from the UNSHAKEN probe pose — an effect can never move the damage plane');
  // palette: role names resolved from the shared palette module, zero literals,
  // and no import of a module that is not in the tree (a dangling specifier —
  // static or lazy — is a 404 and a console error on every single boot).
  // Updated at the T-011 merge: this assertion originally required
  // CONFIG.palette reads, which was correct when T-011 branched. T-010 then
  // landed src/render/palette.js and a guard REJECTING CONFIG.palette reads in
  // tokenized render files, fx.js among them. The invariant is unchanged — an
  // effect resolves its color from the same shared table the thing it is
  // feedback for draws with, never from a literal — only the table moved.
  ok(!/0x[0-9a-fA-F]{3,8}/.test(fxCode) && !/0x[0-9a-fA-F]{3,8}/.test(juiceCode),
     'T-011: the juice modules carry no color literals — roles only');
  ok(/\bPAL\./.test(fxCode) && !/CONFIG\.palette\./.test(fxCode),
     'T-011: …and every fx role resolves from the render palette module (PAL), ' +
     'not CONFIG.palette — which T-010 forbids in tokenized render files');
  for (const [rel, code] of [['render/fx.js', fxCode], ['render/juice.js', juiceCode]]) {
    const here = dirname(join(srcDir, rel));
    for (const m of code.matchAll(/(?:import\s*\(|from)\s*['"](\.[^'"]+)['"]/g))
      ok(existsSync(join(here, m[1])),
         'T-011: ' + rel + ' imports only modules that exist: ' + m[1]);
  }
  // wrappers delegate, exactly like the audio layer
  ok(/prevImpl\(a, b, c\);/.test(juiceCode),
     'T-011: juice hook wrappers call the prior implementation first');
  ok(/QUERY\.get\('juice'\) !== '0'/.test(
       stripComments(readFileSync(join(srcDir, 'mode.js'), 'utf8'))),
     'T-011: ?juice=0 is the documented kill flag');
  ok(/if \(JUICE_ENABLED\)/.test(juiceCode) && /if \(!JUICE_ENABLED\)/.test(fxCode) &&
     /if \(!JUICE_ENABLED\) return 1;/.test(timeCode),
     'T-011: ?juice=0 gates the wiring, the pools, and the sim scale (a disabled ' +
     'boot is the pre-juice game)');
  // fixed pools, no per-event allocation in the hot path
  ok(!/makeRow\(\)/.test(fxCode.slice(fxCode.indexOf('export function fxBurst'))) &&
     !/new (Array|Int32Array|THREE\.)/.test(
       fxCode.slice(fxCode.indexOf('export function fxBurst'))),
     'T-011: bursts claim from a preallocated pool — the hot loop allocates ' +
     'nothing');
  // …and the claim itself is O(1): pop the free stack, else one round-robin
  // step. A scan would make the spawn path cost most exactly when the pool is
  // saturated and the frame budget is tightest.
  {
    const claimBody = fxCode.slice(fxCode.indexOf('function claim(pool)'),
      fxCode.indexOf('function place('));
    ok(/pool\.rows\[pool\.free\[--pool\.top\]\]/.test(claimBody) &&
       /pool\.cursor = \(pool\.cursor \+ 1\) % pool\.rows\.length/.test(claimBody) &&
       !/for\s*\(/.test(claimBody) && !/while\s*\(/.test(claimBody),
       'T-011: claiming a pool row is O(1) — a free-stack pop or one ' +
       'round-robin step, never a scan of the pool');
    ok(/pool\.free\[pool\.top\+\+\] = i;/.test(fxCode),
       'T-011: …and a row rejoins the free stack exactly where it dies');
  }
}

/* ============ T-009: the six-face lattice (route density) ============== *
 * The default run's own level-construction contract, asserted the way the
 * traversal fixture's is. Everything here reads the SHIPPED build (`LVL`
 * above) through src/pure/lattice.js's own exported functions, so the
 * generator and the harness can never disagree about what "readable route",
 * "reachable", "stranded", or "measured retreat" mean.                    */
{
  const LAT = latticeModule;
  const L = LAT.LATTICE;
  const lvl = { groundH: LVL.groundH, platforms: LVL.platforms };

  // --- route density: 3-5 readable routes, every face, every window -----
  {
    let thin = 0, busy = 0, worst = 99, most = 0;
    for (const span of LAT.latticeInterior(CONFIG)) {
      for (let s = span.a; s <= span.b; s++) {
        const c = LAT.latticeRouteCount(lvl, s, CONFIG);
        if (c < L.minRoutes) thin++;
        if (c > L.maxRoutes) busy++;
        worst = Math.min(worst, c); most = Math.max(most, c);
      }
    }
    ok(thin === 0, 'T-009: no face window reads fewer than ' + L.minRoutes +
       ' routes (worst ' + worst + ', ' + thin + ' thin windows)');
    ok(busy === 0, 'T-009: no face window reads more than ' + L.maxRoutes +
       ' routes (most ' + most + ', ' + busy + ' busy windows)');
    ok(LAT.latticeInterior(CONFIG).length === CONFIG.path.faces,
       'T-009: the density invariant covers all six faces');
  }

  // --- the lattice pass is a fixpoint, not a schedule -------------------
  // Re-running both passes on the shipped level must want nothing: if it did,
  // the level the player gets would depend on where a loop happened to stop.
  {
    const copy = { groundH: LVL.groundH, platforms: LVL.platforms.slice() };
    const add = LAT.latticePatchPass(copy, CONFIG);
    const cut = LAT.latticeThinPass(copy, CONFIG);
    ok(add.length === 0 && cut.length === 0,
       'T-009: the lattice pass converged (' + add.length + ' more patches, ' +
       cut.length + ' more thins wanted)');
    const again = buildLevel(CONFIG);
    ok(fingerprint(again) === fingerprint(LVL),
       'T-009: the lattice is deterministic across builds');
  }

  // --- reachability and stranding ---------------------------------------
  {
    const bad = LAT.latticeUnreachable(lvl, CONFIG);
    ok(bad.length === 0, 'T-009: every catwalk (patched or authored) is within ' +
       'double-jump reach of a support, got ' + bad.length + ' orphans');
    const stranded = LAT.latticeStranded(lvl, CONFIG);
    ok(stranded.length === 0, 'T-009: no catwalk strands the player at its ' +
       'forward end, got ' + JSON.stringify(stranded.slice(0, 3)));
  }

  // --- dare pockets: shape, placement, entry, and the measured retreat ---
  {
    const pockets = LVL.pockets;
    const P = L.pocket;
    ok(pockets.length === CONFIG.path.faces,
       'T-009: one dare pocket per face, got ' + pockets.length);
    // the authored sites and the built terrain agree
    const sites = LAT.latticePocketSites(CONFIG, LVL.groundH);
    ok(JSON.stringify(sites) === JSON.stringify(pockets),
       'T-009: the built pockets are exactly the authored sites');

    let badFace = 0, badArena = 0, badChasm = 0, badDrop = 0, badApron = 0;
    let badShelf = 0, badMount = 0, badEntry = 0, badReward = 0, badRetreat = 0;
    let badMid = 0;
    const PJ = CONFIG.player;
    const apex = (PJ.jumpVel * PJ.jumpVel) / (2 * -PJ.gravity);
    const doubleApex = apex + (PJ.airJumpVel * PJ.airJumpVel) / (2 * -PJ.gravity);
    for (const p of pockets) {
      const face = faceIndexAt(p.x0, CONFIG);
      if (face !== p.face || faceIndexAt(p.x1 - 1, CONFIG) !== p.face) badFace++;
      // never inside the wave gate's arena, never in a corner apron
      if (p.x1 > p.corner - P.cornerClearBefore) badArena++;
      if (p.x0 < p.corner - CONFIG.path.faceTiles + P.cornerClearAfter) badApron++;
      // the chasm is exactly the authored hole, with solid runs either side
      let holes = 0, approachSolid = 0, landingSolid = 0;
      for (let s = p.x0; s < p.x1; s++) {
        const g = LVL.groundH[s];
        if (s >= p.gap.x0 && s < p.gap.x1) { if (g < -100) holes++; continue; }
        if (g < -100) continue;
        if (s < p.gap.x0) { if (g === p.deckY) approachSolid++; }
        else if (g === p.landingY) landingSolid++;
      }
      if (holes !== P.gapCols) badChasm++;
      if (approachSolid !== P.approachCols || landingSolid !== P.landingCols) badDrop++;
      // the deck steps down by exactly one across the hole: legal for a gap
      // (<= 1) and worth an extra tile of airtime to a cut jump
      if (p.deckY - p.landingY !== P.landingDrop &&
          !(p.landingY === CONFIG.gen.minH && p.deckY === CONFIG.gen.minH)) badDrop++;
      // the shelf: tip over the void, mount over the landing
      if (!(p.shelf.x0 === p.gap.x0 && p.shelf.x1 > p.gap.x1)) badShelf++;
      for (let s = p.gap.x1; s < p.shelf.x1; s++)
        if (!(LVL.groundH[s] > -100)) badMount++;
      // ENTRY CONTRACT: the shelf may not be jumpable from the deck (or the
      // pocket is not a pocket, it is a shortcut), and must be one air jump
      // over its own mid lane (or it is not enterable at all).
      if (p.shelf.y - p.landingY <= doubleApex) badEntry++;
      if (p.mid.y - p.landingY > apex) badEntry++;
      if (p.shelf.y - p.mid.y > doubleApex) badEntry++;
      if (Math.abs((p.shelf.y - p.mid.y) - L.tierRise) > 1e-9) badMid++;
      // the reward sits over the tip, inside the pickup radius of the deck
      if (!(p.reward.x >= p.shelf.x0 && p.reward.x <= p.shelf.x0 + 1)) badReward++;
      if (!(p.reward.y - p.shelf.y > 0 && p.reward.y - p.shelf.y <= CONFIG.capsules.pickupRadius + 1))
        badReward++;
      // the wager: the retreat has to leave real daylight when it is over
      const advance = CONFIG.scrollSpeed * p.retreat.seconds;
      if (Math.abs(advance - p.retreat.edgeAdvanceTiles) > 1e-9) badRetreat++;
      if (P.timing.entryEdgeMarginTiles - advance < P.timing.minExitMarginTiles) badRetreat++;
      if (p.retreat.depthTiles !== P.gapCols) badRetreat++;
    }
    ok(badFace === 0, 'T-009: every pocket lies wholly inside its own face');
    ok(badArena === 0, 'T-009: no pocket reaches into the wave gate arena ' +
       '(>= ' + P.cornerClearBefore + ' tiles clear of the corner)');
    ok(badApron === 0, 'T-009: no pocket sits on a corner apron exit');
    ok(badChasm === 0, 'T-009: every pocket chasm is exactly ' + P.gapCols + ' columns');
    ok(badDrop === 0, 'T-009: every pocket has its authored approach/landing runs, ' +
       'and the deck steps down exactly ' + P.landingDrop + ' across the hole');
    ok(badShelf === 0, 'T-009: every shelf tip hangs over the chasm');
    ok(badMount === 0, 'T-009: every shelf mount sits over solid landing');
    ok(badEntry === 0, 'T-009: a shelf is unreachable from the deck (double-jump ' +
       'apex ' + doubleApex.toFixed(2) + ') and one air jump over its own mid lane');
    ok(badMid === 0, 'T-009: shelf sits exactly one tier (+' + L.tierRise + ') over its mid lane');
    ok(badReward === 0, 'T-009: every pocket reward sits on the shelf tip');
    ok(badRetreat === 0, 'T-009: every pocket retreat is measured and fits the ' +
       'clock (' + P.timing.entryEdgeMarginTiles + ' tiles of daylight in, >= ' +
       P.timing.minExitMarginTiles + ' out)');

    // the chasm itself, against the frozen jump: a HELD jump clears it with
    // slack from a launch one tile short of the lip
    {
      const airMs = (2 * PJ.jumpVel) / -PJ.gravity;
      const fall = Math.sqrt((2 * apex) / (-PJ.gravity * PJ.fallGravityMult));
      const reach = PJ.runSpeed * (airMs / 2 + fall);
      ok(reach - (P.gapCols + 1.7) > 0.5,
         'T-009: a held jump clears a pocket chasm with slack (' +
         reach.toFixed(2) + ' tiles of travel vs ' + (P.gapCols + 1.7).toFixed(2) + ' needed)');
      ok(P.gapCols <= CONFIG.gen.gapMax,
         'T-009: the pocket chasm respects the generator gap ceiling');
    }
  }

  // --- pockets never leak into the traversal slice ----------------------
  // The slice overlays its fixture on the same seeded build; face 1's pocket
  // lands inside those bounds and must be completely overwritten, or the
  // judged slice would silently change under another lane's feet.
  {
    const slice = buildTraversalLevel(CONFIG);
    const fb = TRAVERSAL_FIXTURE.bounds;
    let leaked = 0;
    for (const p of slice.platforms)
      if (p.pocket && p.x1 > fb.x0 && p.x0 < fb.x1) leaked++;
    ok(leaked === 0, 'T-009: no pocket catwalk survives inside the traversal fixture band');
    let groundOk = true;
    for (const run of TRAVERSAL_FIXTURE.groundRuns)
      for (let x = run.x0; x < run.x1; x++) if (slice.groundH[x] !== run.y) groundOk = false;
    ok(groundOk, 'T-009: the fixture band still owns its authored ground runs');
  }
}

/* ---- T-009: the static-anatomy reveal is the DEFAULT corner ritual ----- *
 * decisions.md entry 3 made "the body never assembles" a rule; T-009 makes it
 * the shipped behaviour of the six-face run instead of an opt-in experiment.
 * The zipper is retired from the world, NOT deleted (that entry's addendum):
 * its choreography stays whole, installed, and playable behind ?zip=1 for the
 * traps/emplacements lane. Both halves are asserted here — the resolution, in
 * a child process because src/mode.js reads its query once at import; and the
 * extractability, at the source level.                                    */
{
  const modeUrl = 'file://' + join(srcDir, 'mode.js');
  const probe = (query) => {
    const src = `
      globalThis.__HB_QUERY__ = ${JSON.stringify(query)};
      const M = await import(${JSON.stringify(modeUrl)});
      console.log(JSON.stringify({ g1: M.IS_G1, zip: M.ZIPPER_REVEAL }));
    `;
    try {
      return JSON.parse(execFileSync(process.execPath,
        ['--input-type=module', '-e', src], { encoding: 'utf8' }));
    } catch (e) {
      console.error('pathcheck: T-009 mode probe failed (' + query + '): ' + e.message);
      return null;
    }
  };
  const plain = probe('');
  const zip = probe('?zip=1');
  const off = probe('?g1=0');
  const slice = probe('?slice=traversal');
  ok(plain && plain.g1 === true,
     'T-009: the default six-face run renders the static limb, no flag needed');
  ok(zip && zip.g1 === false && zip.zip === true,
     'T-009: ?zip=1 restores the brick-slam reveal (the choreography is still playable)');
  ok(off && off.g1 === false,
     'T-009: ?g1=0 is the same escape hatch, for anyone who knew the old flag');
  ok(slice && slice.g1 === false,
     'T-009: the fixtures still own their own transitions (no limb bake there)');
  {
    const lvl = stripComments(readFileSync(join(srcDir, 'render', 'level.js'), 'utf8'));
    ok(/function zipperColumn\(/.test(lvl) && /installView\([^)]*zipperColumn/.test(lvl),
       'T-009: the zipper hook is still written and still installed (retired, not deleted)');
    const wg = stripComments(readFileSync(join(srcDir, 'sim', 'wavegate.js'), 'utf8'));
    ok(/zipperOffset/.test(wg) && /function updateZipper\(/.test(wg),
       'T-009: the gate runtime still drives the zipper timeline for ?zip=1');
    const limbSrc = stripComments(readFileSync(join(srcDir, 'render', 'limb.js'), 'utf8'));
    ok(!/installView|view\./.test(limbSrc) && !/\bgameMs\b|\btMs\b/.test(limbSrc),
       'T-009: the now-default reveal still cannot be animated (CP3 ruling holds)');
  }
  // the ritual itself is untouched: the two-snap detent curve is the camera's,
  // and it is the same curve at the same times it was before this task
  {
    const T = cornerTimeline(CONFIG);
    ok(cornerYawDeltaDeg(T.t2, CONFIG) === CONFIG.path.turnDeg &&
       Math.abs(cornerYawDeltaDeg(T.t6, CONFIG) - 2 * CONFIG.path.turnDeg) < 1e-9,
       'T-009: the corner is still two 30 deg detents, ' + T.t6 + ' ms end to end');
  }
}

/* ------ T-009: houndframe stations on the six-face run (faces 2+) ------ *
 * decisions.md entry 6 as invariants: a station stands ON the thing it owns,
 * on a plate it can actually charge across, with the answer to it already
 * built one jump above — and it can never hold a wave gate shut.          */
{
  const LAT = latticeModule;
  const H = LAT.LATTICE.hound;
  const table = buildSpawnTable(CONFIG, LVL);
  const stations = table.filter((r) => r.type === 'hound');
  const PJ = CONFIG.player;
  const apex = (PJ.jumpVel * PJ.jumpVel) / (2 * -PJ.gravity);

  ok(stations.length === CONFIG.path.faces - (H.firstFace - 1),
     'T-009: one houndframe station per face from ' + H.firstFace +
     ' on, got ' + stations.length);
  {
    const faces = stations.map((r) => faceIndexAt(r.x, CONFIG)).sort((a, b) => a - b);
    ok(faces.every((f, i) => f === H.firstFace + i),
       'T-009: stations sit on consecutive faces ' + H.firstFace + '..' +
       CONFIG.path.faces + ', got ' + faces.join(','));
    ok(!faces.includes(1), 'T-009: face 1 teaches the lattice with no floor denial');
  }

  let badPlate = 0, badSpan = 0, badArena = 0, badRow = 0, badAnswer = 0, badSweep = 0;
  const sweep = CONFIG.hound.chargeSpeed * (CONFIG.hound.chargeMs / 1000);
  for (const r of stations) {
    if (r.patrol.x1 - r.patrol.x0 !== H.patrolCols) badSpan++;
    if (!(r.x > r.patrol.x0 && r.x < r.patrol.x1)) badSpan++;
    // the plate: every patrol column solid, one height, and that height is
    // the deck the row declares (the spawner derives the ride height from it)
    for (let s = r.patrol.x0; s < r.patrol.x1; s++)
      if (!(LVL.groundH[s] > -100) || LVL.groundH[s] !== r.deck) badPlate++;
    // a charge has to be able to sweep what it owns, from either end
    if (sweep < r.patrol.x1 - r.patrol.x0) badSweep++;
    // never in a gate arena, never in the ambient corner-clear zones
    for (const cs of CORNER_S) {
      if (r.x > cs - H.cornerClearBefore && r.x < cs + CONFIG.spawner.cornerClearAfter) badArena++;
      if (r.x >= cs - CONFIG.spawner.cornerClearBefore && r.x <= cs + CONFIG.spawner.cornerClearAfter)
        badArena++;
    }
    if (r.gating !== false || r.dir !== -1 || r.kind !== 'hound') badRow++;
    // THE ANSWER: a catwalk over the plate, inside one jump of it. A hound
    // denies the floor; if the floor is all there is, it denies the route.
    const over = LVL.platforms.some((p) =>
      p.x1 > r.patrol.x0 && p.x0 < r.patrol.x1 &&
      p.y > r.deck && p.y - r.deck <= apex);
    if (!over) badAnswer++;
  }
  ok(badSpan === 0, 'T-009: every station patrols exactly ' + H.patrolCols +
     ' columns around its own spawn column');
  ok(badPlate === 0, 'T-009: every station stands on solid, single-height plate');
  ok(badSweep === 0, 'T-009: a charge (' + sweep.toFixed(1) +
     ' tiles) sweeps the whole patrol span');
  ok(badArena === 0, 'T-009: no station sits in a gate arena or a corner-clear zone');
  ok(badRow === 0, 'T-009: every station row is a non-gating hound facing back down the lane');
  ok(badAnswer === 0, 'T-009: every station has a catwalk answer within one jump ' +
     '(apex ' + apex.toFixed(2) + ') over its plate');
  // the placement contract itself: the owned landing is the pocket's
  {
    let owned = 0;
    for (const r of stations)
      if (LVL.pockets.some((p) => r.owns === p.id + '-landing' &&
          r.patrol.x0 === p.gap.x1 && r.deck === p.landingY)) owned++;
    ok(owned === stations.length,
       'T-009: every station owns its face pocket landing (' + owned + '/' + stations.length + ')');
  }
}

/* ---- T-009: a non-gating station cannot hold a wave gate shut ---------- *
 * The behavioural half of the row-level `gating` opt-out, driven through the
 * real gate runtime in a child process: with the wave dead, a corner whose
 * only survivor is an ambient houndframe must still turn — and the control
 * (the same body with the kind's own gating value) must still hold it.    */
{
  const simBase = 'file://' + join(srcDir, 'sim');
  const child = `
    const [T, E, ST, HO, WG] = await Promise.all([
      import(${JSON.stringify(simBase + '/time.js')}),
      import(${JSON.stringify(simBase + '/edges.js')}),
      import(${JSON.stringify(simBase + '/state.js')}),
      import(${JSON.stringify(simBase + '/hostiles.js')}),
      import(${JSON.stringify(simBase + '/wavegate.js')}),
    ]);
    E.setEdges(-18.9, 26.4);
    ST.setState('PLAYING');
    const out = {};
    const station = { dir: -1, patrol: { x0: 60, x1: 63 }, gating: false };
    const c0 = WG.cornerEvents[0];
    WG.armGate(c0);
    HO.spawnHostile(61.5, 3.45, 0, 'hound', station);
    for (let i = HO.hostiles.length - 1; i >= 0; i--)
      if (HO.hostiles[i].kind === 'wasp') HO.removeHostile(i, false);
    out.nonGating = c0.state;
    out.houndAlive = HO.hostiles.some((e) => e.kind === 'hound');
    // control: the same body without the opt-out holds the gate
    c0.state = 'done';
    while (HO.hostiles.length) HO.removeHostile(0, false);
    const c1 = WG.cornerEvents[1];
    WG.armGate(c1);
    HO.spawnHostile(126.5, 3.45, 0, 'hound', { dir: -1, patrol: { x0: 125, x1: 128 } });
    for (let i = HO.hostiles.length - 1; i >= 0; i--)
      if (HO.hostiles[i].kind === 'wasp') HO.removeHostile(i, false);
    out.gating = c1.state;
    console.log(JSON.stringify(out));
  `;
  let res = null;
  try {
    res = JSON.parse(execFileSync(process.execPath,
      ['--input-type=module', '-e', child], { encoding: 'utf8' }));
  } catch (e) {
    console.error('pathcheck: T-009 gating child failed: ' + e.message);
  }
  ok(!!res, 'T-009: the gate runtime runs headlessly for the gating check');
  if (res) {
    ok(res.houndAlive === true, 'T-009: the station is still alive when the wave dies');
    ok(res.nonGating === 'turning',
       'T-009: a non-gating station does not hold the ritual (state ' + res.nonGating + ')');
    ok(res.gating === 'gate',
       'T-009: a gating hound still holds it — the opt-out is what changed things ' +
       '(state ' + res.gating + ')');
  }
}

/* ---- T-009: the whole run is crossable, driven through the REAL sim ---- *
 * The lattice assertions above are geometry. This one is behaviour: a child
 * process runs the shipped six-face simulation with a traversal policy — hold
 * right, and HOLD a jump whenever the deck one tile ahead is a hole or a step
 * — and the run has to reach the outro without the terrain killing it.
 *
 * Two deliberate simplifications, both stated rather than hidden: hostiles are
 * removed every frame (which also clears each gate the moment it arms), so
 * this proves the ROUTE and not the fight; and the policy jumps at the LIP
 * (probe 1.2), because that is what the right-screen clamp demands — a pinned
 * player crosses ground at scroll speed, so a jump spent 2 tiles early lands
 * in the hole it was meant to clear. That asymmetry is exactly why a pocket
 * chasm is two columns wide; see src/pure/lattice.js.
 *
 * Measured for the record (terrain-only, same policy): on `main` this policy
 * falls at x=266 and x=363 and is out of lives at 363; with the lattice it
 * falls once (x=266.2, a seeded chunk gap that predates this task) and reaches
 * the scroll end with 2 lives. No fall may land inside an authored pocket.  */
{
  const simBase = 'file://' + join(srcDir, 'sim');
  const child = `
    const [T, E, LV, SC, PLm, IN, ST, HO, WP, SP, WG] = await Promise.all([
      import(${JSON.stringify(simBase + '/time.js')}),
      import(${JSON.stringify(simBase + '/edges.js')}),
      import(${JSON.stringify(simBase + '/level.js')}),
      import(${JSON.stringify(simBase + '/scroll.js')}),
      import(${JSON.stringify(simBase + '/player.js')}),
      import(${JSON.stringify(simBase + '/input.js')}),
      import(${JSON.stringify(simBase + '/state.js')}),
      import(${JSON.stringify(simBase + '/hostiles.js')}),
      import(${JSON.stringify(simBase + '/weapons.js')}),
      import(${JSON.stringify(simBase + '/spawner.js')}),
      import(${JSON.stringify(simBase + '/wavegate.js')}),
    ]);
    E.setEdges(-18.9, 26.4);
    LV.unbuildFutureFaces();
    ST.setState('PLAYING');
    const p = PLm.player;
    p.x = 6; p.y = 3;
    IN.keys.right = true;
    const dt = 1 / 60;
    let jumpUntil = 0, maxX = 0, falling = false;
    const falls = [];
    for (let f = 0; f < 20000; f++) {
      if (p.grounded &&
          (LV.groundTopAt(p.x + 1.2) < -100 || LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
        IN.bufferJumpUntil(T.gameMs + 120);
        IN.keys.jump = true;
        jumpUntil = T.gameMs + 420;          // HOLD it: a committed jump
      }
      if (T.gameMs > jumpUntil) IN.keys.jump = false;
      T.advanceGameMs(dt * 1000);
      SC.updateScroll(dt);
      PLm.updatePlayer(dt);
      maxX = Math.max(maxX, p.x);
      if (p.y < -6 && !falling) { falls.push(p.x); falling = true; }
      if (p.y > 0) falling = false;
      if (ST.state !== 'PLAYING') break;
      while (HO.hostiles.length) HO.removeHostile(0, false);   // route, not fight
      HO.updateHostiles(dt);
      WP.updateBullets(dt);
      if (T.scrollX >= LV.activeScrollEnd()) break;
    }
    console.log(JSON.stringify({
      x: p.x, maxX, scrollX: T.scrollX, end: LV.activeScrollEnd(),
      lives: p.lives, hp: p.hp, state: ST.state, falls,
    }));
  `;
  let run = null;
  try {
    run = JSON.parse(execFileSync(process.execPath,
      ['--input-type=module', '-e', child], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  } catch (e) {
    console.error('pathcheck: T-009 full-run child failed: ' + e.message);
  }
  ok(!!run, 'T-009: the six-face run simulates headlessly end to end');
  if (run) {
    ok(run.state === 'PLAYING' || run.state === 'VICTORY',
       'T-009: a held-jump policy survives the whole lattice (state ' + run.state +
       ', lives ' + run.lives + ')');
    ok(run.scrollX >= run.end,
       'T-009: the run reaches the outro scroll end (' + run.scrollX.toFixed(1) +
       ' of ' + run.end + ', maxX ' + run.maxX.toFixed(1) + ')');
    const inPocket = run.falls.filter((x) =>
      LVL.pockets.some((p) => x >= p.x0 - 1 && x < p.x1 + 1));
    ok(inPocket.length === 0,
       'T-009: no authored pocket ever swallows the policy (falls at ' +
       JSON.stringify(run.falls.map((x) => +x.toFixed(1))) + ', in-pocket ' +
       JSON.stringify(inPocket) + ')');
  }
}

console.log('pathcheck: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
