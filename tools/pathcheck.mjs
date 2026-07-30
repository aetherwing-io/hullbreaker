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

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG } from '../src/config.js';
import {
  DEG, CORNER_S, SEGS, HALT_S, polyAt, headingAt, yawAt, faceIndexAt,
} from '../src/pure/path.js';
import {
  waveSize, waveLane, easeOutBack, cornerTimeline, cornerEventTotalMs,
  cornerYawDeltaDeg, cornerScrollVel, zipperOffset,
} from '../src/pure/waves.js';
import {
  TRAVERSAL_FIXTURE, TRAVERSAL_PACES, TRAVERSAL_PACE_IDS, resolveTraversalPace,
  traversalLedgeProbe, traversalLedgeDecision,
  traversalWallDecision, traversalSolidAllowsGrab, traversalFollowTarget,
  traversalCameraDepth, traversalPaceTargetSpeed, traversalPaceStep,
  traversalPocketAdvanceTiles, traversalChainMult, traversalFallbackTarget,
} from '../src/pure/traversal.js';
import {
  SCORE, scoreNotch, scoreNotchMult, scoreFireRateMult, scoreChargeGain,
  scoreThreatGain, scoreApplyGain, scoreDrainPerSec, scoreStep,
  scoreClassification, scoreNotchGlyphs, scoreConnectorAt, scoreRoutesCompleted,
} from '../src/pure/score.js';
import {
  solidRectContains, levelSolidCell, buildLevel, buildTraversalLevel,
  buildSpawnTable,
} from '../src/pure/generator.js';

// The sim layer carries the same no-three.js/no-DOM guarantee as pure/ (see
// guardLayer('sim', ...) below), so it is Node-importable exactly like the
// bot-player harness relies on. A handful of collision-edge assertions drive
// the real sim loop directly below, instead of re-deriving its physics.
import { setEdges as setSimEdges } from '../src/sim/edges.js';
import {
  player as simPlayer, updatePlayer as updateSimPlayer,
  clearPlayerTraversal as clearSimTraversal,
} from '../src/sim/player.js';
import {
  keys as simKeys, bufferJumpUntil as bufferSimJump, clearJumpBuffer as clearSimJumpBuffer,
} from '../src/sim/input.js';
import { platforms as simPlatforms } from '../src/sim/level.js';
import { cornerEvents as simCornerEvents } from '../src/sim/wavegate.js';

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
ok(gH.length === 445 && plats.length === 49 && LVL.chunkLog.length === 59,
   'normal generator shape unchanged (445 columns / 49 platforms / 59 chunks)');
ok(fingerprint(LVL) === 'cc6afd7c',
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
          PU.pocketSpeed >= PU.minSpeed && PU.pocketSpeed <= PU.maxSpeed &&
          PU.accel >= 0 && PU.decel >= 0 &&
          ['constant', 'hunt', 'ramp'].indexOf(PU.mode) >= 0 &&
          F.run.minimumScrollSpeed === PU.cruiseSpeed)) boundedPursuit = false;
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
  let pocketFair = true;
  for (const F of resolved) {
    const D = F.darePocket;
    const advance = traversalPocketAdvanceTiles(F.pursuit, D.timing.retreatSeconds);
    const backtrack = D.reward.x - D.bounds.x0;
    if (D.timing.entryEdgeMarginTiles - backtrack - advance + 1e-9 < D.timing.minExitMarginTiles ||
        D.timing.minExitMarginTiles <= PL.width + 2 * CONFIG.edges.margin ||
        advance <= 0) {
      pocketFair = false;
      console.error('  pocket unfair in pace ' + F.pace.id + ': advance ' + advance.toFixed(2));
    }
  }
  ok(pocketFair, 'dare retreat clears its exit margin at every pace pocket speed');

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
  ok(SCORE.reclaim.lowTiles < SCORE.reclaim.highTiles && SCORE.reclaim.windowMs > 0 &&
     SCORE.linkDropTiles >= 2 && SCORE.launchGraceMs === 600 && SCORE.eventCap === 256,
     'reclaim/link/launch windows and the A.5 ring buffer match the proposal');
}

console.log('pathcheck: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
