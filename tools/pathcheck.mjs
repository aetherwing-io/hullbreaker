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
  TRAVERSAL_FIXTURE, traversalLedgeProbe, traversalLedgeDecision,
  traversalWallDecision, traversalSolidAllowsGrab, traversalFollowTarget,
  traversalCameraDepth,
} from '../src/pure/traversal.js';
import {
  solidRectContains, levelSolidCell, buildLevel, buildTraversalLevel,
  buildSpawnTable, GAP,
} from '../src/pure/generator.js';
import {
  TRANSFORM_FIXTURE, TRANSFORM_FRAMES, bandSlamLockMs, bandSlamOffset,
  buildTransformFrames, buildTransformLevel, transformAltDelta,
  transformAtmosphereMix, transformBandIndexAt, transformEventCtx,
  transformEventTotalMs, transformFrontierS, transformHaltS, transformPanelState,
  transformPosAt, transformScrollOffset, transformScrollVel, transformSeamPull,
  transformSealS, transformTimeline, transformTriggerS, transformYawDeltaDeg,
} from '../src/pure/transform.js';

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

/* ===================== world-transformation slice ====================== *
 * The opt-in ?slice=transform demo: a short exterior run, a bulkhead flip
 * inward onto an interior corridor, then a breach return onto an exterior
 * face 30 tiles higher. Asserted the same way the corner ritual is — the
 * timeline must be exact, the surfaces must stay continuous at the seams,
 * and every apron must be valid before the scroll resumes.               */
const XF = TRANSFORM_FIXTURE, XT = CONFIG.transform, XFR = TRANSFORM_FRAMES;
const XTL = transformTimeline(CONFIG);
const XB = XF.bounds;

// --- bands / frames ----------------------------------------------------
{
  let valid = XFR.length === XF.bands.length && XFR[0].s0 === XB.x0 &&
    XFR[XFR.length - 1].s1 === XB.x1;
  for (let i = 1; i < XFR.length; i++) if (XFR[i - 1].s1 !== XFR[i].s0) valid = false;
  ok(valid, 'bands tile the fixture bounds contiguously');
  ok(XFR.map((f) => f.kind).join('>') === 'exterior>interior>exterior',
     'surfaces go exterior → interior → exterior, got ' + XFR.map((f) => f.kind).join('>'));
  ok(JSON.stringify(buildTransformFrames(XF)) === JSON.stringify(XFR),
     'frame table is a pure function of the fixture');
}
{
  // A seam is continuous in POSITION: only heading and altitude step across
  // it. That is what lets one ritual animate the whole transition.
  let seamContinuous = true, turnExact = true, altRises = true;
  for (const ev of XF.events) {
    const from = XFR[ev.fromBand], to = XFR[ev.toBand];
    const p = transformPosAt(from, ev.seamS);
    if (Math.hypot(p.x - to.x, p.z - to.z) > 1e-9) seamContinuous = false;
    if (to.s0 !== ev.seamS) seamContinuous = false;
    if (Math.abs((to.heading - from.heading) / DEG - 2 * XT.snapDeg) > 1e-9) turnExact = false;
    if (!(to.alt > from.alt)) altRises = false;
  }
  ok(seamContinuous, 'every seam point is shared by both of its band frames');
  ok(turnExact, 'every ritual turns exactly 2 × snapDeg (90 deg), matching its yaw curve');
  ok(altRises, 'every transformation gains rendered altitude');
}
{
  // unit s steps stay unit world steps inside a band: the sim ribbon is never
  // stretched by the surface it is drawn on
  let bad = 0;
  for (const f of XFR) {
    for (let s = f.s0; s < f.s1; s++) {
      const a = transformPosAt(f, s), b = transformPosAt(f, s + 1);
      if (Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 1) > 1e-9) bad++;
    }
  }
  ok(bad === 0, 'unit spacing preserved inside every band');
  ok(transformBandIndexAt(XFR, XB.x0) === 0 &&
     transformBandIndexAt(XFR, XF.events[0].seamS - 1) === 0 &&
     transformBandIndexAt(XFR, XF.events[0].seamS) === 1 &&
     transformBandIndexAt(XFR, XF.events[1].seamS) === 2 &&
     transformBandIndexAt(XFR, XB.x1 - 1) === 2,
     'band lookup maps each column to the surface that renders it');
}
{
  // Altitude has to be *unmistakable*, which is a measurable claim: the
  // breach gain exceeds a full screen height, and it is much larger than the
  // flip so the two breaks read differently.
  const screenH = 2 * CC.z * Math.tan(CC.fov / 2 * DEG);
  const flip = XFR[1].alt - XFR[0].alt;
  const breach = XFR[2].alt - XFR[1].alt;
  ok(breach > screenH,
     'breach gain (' + breach + ') exceeds one screen height (' + screenH.toFixed(1) + ')');
  ok(flip > 1 && flip < breach / 3,
     'flip lifts a readable step, the breach is the big one (' + flip + ' vs ' + breach + ')');
  ok(XFR[2].alt >= 30, 'the far exterior face sits at least 30 tiles up, got ' + XFR[2].alt);
}
{
  // The skyline silhouettes are authored at ABSOLUTE altitude, so the same
  // structures loom overhead on face A and lie far below on face C. This is
  // the altitude cue that survives a screenshot, so it is asserted.
  const a = XFR[0], c = XFR[2];
  const eyeA = a.alt + CC.y;
  const deckC = c.alt + 3;
  ok(a.band.skyline.length >= 2 && c.band.skyline.length >= 2,
     'both exterior faces carry background silhouettes');
  ok(a.band.skyline.some((s) => s.top > eyeA + 6),
     'face A silhouettes rise well above the camera eye');
  ok(c.band.skyline.every((s) => s.top < deckC - 5),
     'the same silhouettes sit below the high face deck, not above it');
  ok(c.band.skyline.every((s) => s.height > 12 && s.depth < -10),
     'silhouettes stay tall and behind the combat plane');
  // …and they land inside the strip the camera can actually see below the deck.
  // This is a shallow side-on view, so a roof 25 tiles under RIG is simply
  // off-screen and proves nothing: anything claiming to show the drop has to be
  // in frame at its own distance from the camera.
  let framed = true;
  for (const s of c.band.skyline) {
    const dist = CC.z - s.depth;                        // camera depth + how far back
    const frameBottom = c.alt + CC.lookY - Math.tan(CC.fov / 2 * DEG) * dist;
    if (!(s.top > frameBottom + 2 && s.top < deckC - 5)) framed = false;
  }
  ok(framed, 'every below-deck silhouette is in frame under the deck, not off-screen');
  ok(a.band.hullWall.pattern === 'solid' && c.band.hullWall.pattern === 'towers',
     'the hull encloses RIG low down and opens into towers high up');
  ok(a.band.hullDrop > 12 && c.band.hullDrop > a.band.hullDrop,
     'the high face hangs a longer wall into the fog than the low one');
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
  const gain = XFR[2].alt - XFR[1].alt;                 // the breach: the big lift
  const step1 = gain * XT.altStep1;
  near(transformAltDelta(0, gain, CONFIG), 0, 1e-9, 'altitude flat at t=0');
  near(transformAltDelta(XTL.t1 - 0.001, gain, CONFIG), -XT.altPreloadTiles, 0.01,
       'the deck drops a hair before the first snap');
  near(transformAltDelta(XTL.t2, gain, CONFIG), step1, 1e-9,
       'snap 1 takes exactly altStep1 of the gain');
  near(transformAltDelta(400, gain, CONFIG), step1, 1e-9, 'altitude holds flat through the ratchet');
  near(transformAltDelta(XTL.t4, gain, CONFIG), gain, 1e-9, 'snap 2 lands the full gain exactly');
  near(transformAltDelta(99999, gain, CONFIG), gain, 1e-9, 'altitude clamped after the ritual');
  let peak = 0, minAfter = Infinity;
  for (let t = 0; t <= XTL.t6; t += 0.25) {
    const v = transformAltDelta(t, gain, CONFIG);
    peak = Math.max(peak, v);
    if (t >= XTL.t2) minAfter = Math.min(minAfter, v);
  }
  ok(peak > gain && peak < gain * 1.05, 'altitude lurches past the landing once, peak ' + peak.toFixed(2));
  ok(minAfter >= step1 - 1e-9, 'altitude never sags back below a landed step');
  const flipGain = XFR[1].alt - XFR[0].alt;
  ok(transformAltDelta(XTL.t4, flipGain, CONFIG) === flipGain,
     'the same curve lands the flip gain exactly (one ritual shape, two magnitudes)');
}
{
  const sp = XF.run.minimumScrollSpeed;
  ok(transformScrollVel(0, sp, CONFIG) === 0 && transformScrollVel(XTL.t5 - 0.1, sp, CONFIG) === 0,
     'scroll speed frozen until the settle ends');
  // the seam pull: nothing moves through the wind-up, snap 1 and the hold, then
  // the second clack carries the view through the seam onto the new surface
  ok(transformScrollOffset(0, sp, CONFIG) === 0 &&
     transformScrollOffset(XTL.t3, sp, CONFIG) === 0,
     'the world holds still through the first snap and the ratchet hold');
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
  // the next surface slams in near-to-far and every chunk locks before the
  // scroll resumes — the corner ritual's apron rule, one seam later
  ok(bandSlamOffset(XT.slamStartMs - 1, 0, CONFIG).phase === 'hidden',
     'slam chunk 0 hidden before its start beat');
  near(bandSlamOffset(XT.slamStartMs, 0, CONFIG).dy, XT.slamDropTiles, 1e-9,
       'slam chunk 0 starts a full drop above its base');
  near(bandSlamOffset(XT.slamStartMs + XT.slamDropMs / 2, 0, CONFIG).dy, XT.slamDropTiles * 0.75, 1e-9,
       'gravity ease: half the drop time leaves 75 percent of the distance');
  ok(bandSlamOffset(XT.slamStartMs + XT.slamPerColMs - 1, 1, CONFIG).phase === 'hidden' &&
     bandSlamOffset(XT.slamStartMs + XT.slamPerColMs, 1, CONFIG).phase === 'drop',
     'chunk 1 starts exactly slamPerColMs later');
  const dip = bandSlamOffset(XT.slamStartMs + XT.slamDropMs + 1, 0, CONFIG);
  const lock = bandSlamOffset(XT.slamStartMs + XT.slamDropMs + XT.slamDipMs + 1, 0, CONFIG);
  ok(dip.phase === 'dip' && Math.abs(dip.dy + XT.slamDipTiles) < 1e-9, 'one-beat dip on landing');
  ok(lock.phase === 'locked' && lock.dy === 0, 'chunk locks to base after its dip');
  const lastLock = bandSlamLockMs(CONFIG);
  ok(lastLock === 606 + XT.slamDipMs && lastLock <= XTL.t5,
     'the whole surface is locked (' + lastLock + ' ms) before the scroll resumes (t5=' + XTL.t5 + ')');
  let allLocked = true;
  for (let i = 0; i < XT.slamChunks; i++)
    if (bandSlamOffset(XTL.t5, i, CONFIG).phase !== 'locked') allLocked = false;
  ok(allLocked, 'every slam chunk is locked at t5');
}
{
  const flipEv = XF.events[0], breachEv = XF.events[1];
  const closed = transformPanelState(0, flipEv, CONFIG);
  const jolted = transformPanelState(XT.windUpMs - 0.001, flipEv, CONFIG);
  const opened = transformPanelState(XTL.t4, flipEv, CONFIG);
  const gone = transformPanelState(XTL.t6, flipEv, CONFIG);
  ok(closed.open === 0 && closed.jolt === 0 && closed.visible, 'panel starts closed and latched');
  near(jolted.jolt, XT.panelJoltTiles, 0.01, 'the latch jolts through the wind-up');
  ok(opened.open === 1 && opened.blow === 0, 'the bulkhead leaf tracks the snaps to fully open');
  ok(!gone.visible, 'the panel is gone once the ritual ends');
  near(transformPanelState(XTL.t2, flipEv, CONFIG).open, 0.5, 1e-9,
       'the leaf is exactly half open on snap 1 — it clacks with the world');
  const blown = transformPanelState(XT.windUpMs + XT.panelBlowMs, breachEv, CONFIG);
  ok(blown.blow === XT.panelBlowTiles && blown.spin > Math.PI,
     'the hull panel is blown clear and tumbling by the end of its flight');
  ok(transformPanelState(XTL.t4, breachEv, CONFIG).blow === XT.panelBlowTiles,
     'the breach panel is clear before the surface commits');
}
near(transformAtmosphereMix(XTL.t1, CONFIG), 0, 1e-9, 'atmosphere starts at the first snap');
near(transformAtmosphereMix(XTL.t4, CONFIG), 1, 1e-9, 'atmosphere completes when the surface does');
near(transformAtmosphereMix(9999, CONFIG), 1, 1e-9, 'atmosphere mix clamped');
{
  // The animated frame must start as the FROM surface extended past the seam
  // (what RIG is standing on) and end as the TO surface exactly — that is
  // what keeps the deck under their feet through the whole ritual.
  let startsFrom = true, endsTo = true, pivotFixed = true;
  for (const ev of XF.events) {
    const from = XFR[ev.fromBand], to = XFR[ev.toBand];
    const c0 = transformEventCtx(XFR, ev, 0, CONFIG);
    const p0 = transformPosAt(c0, ev.seamS + 2);
    const q0 = transformPosAt(from, ev.seamS + 2);
    if (Math.abs(c0.heading - from.heading) > 1e-12 || Math.abs(c0.alt - from.alt) > 1e-12 ||
        Math.hypot(p0.x - q0.x, p0.z - q0.z) > 1e-9) startsFrom = false;
    const c1 = transformEventCtx(XFR, ev, XTL.t4, CONFIG);
    for (const s of [ev.seamS, ev.seamS + 3, ev.seamS + 20]) {
      const a = transformPosAt(c1, s), b = transformPosAt(to, s);
      if (Math.hypot(a.x - b.x, a.z - b.z) > 1e-9) endsTo = false;
    }
    if (Math.abs(c1.alt - to.alt) > 1e-12 || Math.abs(c1.heading - to.heading) > 1e-12) endsTo = false;
    const pivot = transformPosAt(transformEventCtx(XFR, ev, 0, CONFIG), ev.seamS);
    for (let t = 0; t <= XTL.t6; t += 15) {
      const p = transformPosAt(transformEventCtx(XFR, ev, t, CONFIG), ev.seamS);
      if (Math.hypot(p.x - pivot.x, p.z - pivot.z) > 1e-9) pivotFixed = false;
    }
  }
  ok(startsFrom, 'a ritual opens on the surface RIG is already standing on');
  ok(endsTo, 'a ritual closes exactly on the next surface frame');
  ok(pivotFixed, 'the seam point never moves during a ritual (the deck stays under RIG)');
}

// --- fixture / apron validity ------------------------------------------
const XL = buildTransformLevel(CONFIG);
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
    if (XFR[ev.toBand].s0 !== ev.seamS || XFR[ev.fromBand].s1 !== ev.seamS) ordered = false;
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
  const IN = XFR[1].band.interior;
  ok(IN.ceilingAbove > PL.height + PL.jumpVel ** 2 / (2 * -PL.gravity) + 1,
     'the interior ceiling clears a full jump, so the corridor never traps RIG');
  ok(XF.platforms.filter((p) => p.x0 >= XFR[1].s0 && p.x1 <= XFR[1].s1)
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

console.log('pathcheck: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
