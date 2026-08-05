#!/usr/bin/env node
// Focused production contract for RIG locomotion, aim attachment, and weapon
// family readability. It intentionally combines source checks with direct PNG
// measurements so a renamed rectangle cannot satisfy a five-chassis claim.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, readPngSize } from './assets/lib/png.mjs';
import {
  RIG_AIM_FRAMES, RIG_BODY_ATLAS_H, RIG_BODY_ATLAS_PATH, RIG_BODY_ATLAS_W,
  RIG_BODY_VISUAL_H, RIG_GUN_MUZZLE_X, RIG_RUN_FRAMES, RIG_WEAPON_ART,
  RIG_CLIMB_ATLAS_H, RIG_CLIMB_ATLAS_PATH, RIG_CLIMB_ATLAS_W,
  RIG_WEAPON_ATLAS_H, RIG_WEAPON_ATLAS_PATH, RIG_WEAPON_ATLAS_W,
} from '../src/pure/rig.js';

const root = new URL('../', import.meta.url);
const playerUrl = new URL('../src/render/player.js', import.meta.url);
const playerSrc = readFileSync(playerUrl, 'utf8');
let passed = 0;

function ok(condition, message) {
  if (!condition) throw new Error(`RIG PRESENTATION FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

function sourceAsset(relative) {
  return new URL(relative, new URL('../src/pure/rig.js', import.meta.url));
}

function section(start, end) {
  const a = playerSrc.indexOf(start);
  const b = playerSrc.indexOf(end, a + start.length);
  return a >= 0 && b > a ? playerSrc.slice(a, b) : '';
}

function alphaSignature(url, columns = 12, rows = 6) {
  const png = decodePng(url);
  const cells = new Array(columns * rows).fill(0);
  const totals = new Array(columns * rows).fill(0);
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const gx = Math.min(columns - 1, Math.floor(x / png.width * columns));
    const gy = Math.min(rows - 1, Math.floor(y / png.height * rows));
    const i = gy * columns + gx;
    totals[i]++;
    if (png.rgba[(y * png.width + x) * 4 + 3] > 16) cells[i]++;
  }
  return cells.map((n, i) => n / totals[i] > 0.12 ? '1' : '0').join('');
}

const preloadEnd = playerSrc.indexOf('await awaitPreloads()');
const preloadSection = playerSrc.slice(0, preloadEnd);
ok(preloadEnd > 0 && /RIG_BODY_ATLAS_PATH/.test(preloadSection) &&
   /RIG_WEAPON_ATLAS_PATH/.test(preloadSection) && /RIG_CLIMB_ATLAS_PATH/.test(preloadSection),
  'body, weapon, and climb atlases all register before the shared boot gate');
ok((preloadSection.match(/preloadTexture\(/g) || []).length === 4,
  'RIG presentation performs exactly four boot-time atlas registrations');
ok(/function applyAtlasUv\(/.test(playerSrc) &&
   !/function applyAtlasCrop|\.offset\.set\(|\.repeat\.set\(/.test(playerSrc),
  'pose and chassis changes use immutable geometry UVs without texture transforms');
ok(!/CanvasTexture|document\.createElement\(['"]canvas['"]\)/.test(playerSrc),
  'RIG presentation creates no runtime canvas textures or crop masks');

ok(Object.keys(RIG_RUN_FRAMES).join(',') === 'contact,pass,flight',
  'locomotion carries authored contact, passing, and airborne key poses');
ok(Object.keys(RIG_AIM_FRAMES).join(',') === 'right,up-right,up,down-right',
  'stationary attachment carries four authored elevation poses and mirrors left');
ok(/runPhase = \(runPhase \+ travelled \/ strideTiles\) % 1/.test(playerSrc),
  'run cadence advances by travelled distance rather than elapsed animation time');
ok(/climbPhase = \(climbPhase \+ climbed \/ RIG_CLIMB_CYCLE_TILES\) % 1/.test(playerSrc),
  'climb cadence advances by vertical distance rather than wall time');
ok(/else if \(!player\.grounded\) \{[\s\S]*bodyFrame = player\.vy >= 0 \? 'air-rise' : 'air-fall'/.test(playerSrc) &&
   /else if \(landing > 0\) \{[\s\S]*bodyFrame = 'contact'/.test(playerSrc),
  'the full airborne arc resolves through a braced landing instead of a planted midair stance');
ok(/airbornePoseContinuous/.test(playerSrc) && /landingBraceActive/.test(playerSrc),
  'runtime telemetry exposes airborne and landing-pose continuity');
ok(/const wallContact = player\.traversalState === 'wall'/.test(playerSrc) &&
   /locomotionState = 'wall'/.test(playerSrc) && /climb-\$\{player\.traversalSide/.test(playerSrc),
  'wall contact selects a facing-aware authored reach pose');
ok(/bodyGroup\.scale\.set\(1, squash, 1\)/.test(playerSrc) &&
   !/bodyScaleX|bodyScaleY|bodyGroup\.scale\.set\(body/.test(playerSrc),
  'authored locomotion frames never pop through procedural whole-body scaling');

const letters = Object.keys(RIG_WEAPON_ART);
ok(letters.join('') === 'RSLHF', 'the held arsenal has exactly the five gameplay chassis');
const files = letters.map((letter) => sourceAsset(RIG_WEAPON_ART[letter].sourcePath));
ok(files.every((url) => existsSync(fileURLToPath(url))),
  'all five painted weapon source cutouts exist');
const signatures = files.map((url) => alphaSignature(url));
ok(new Set(signatures).size === 5,
  'all five chassis have measurably distinct coarse alpha silhouettes');
ok(letters.every((letter) => RIG_WEAPON_ART[letter].worldW <= RIG_BODY_VISUAL_H * 0.60),
  'every chassis stays subordinate to the small-RIG body scale');
ok(/GUN_ART_GEOMETRIES/.test(playerSrc) && /GUN_GEOMETRIES = \{/.test(playerSrc) &&
   /fallbackGunGeo = GUN_GEOMETRIES\.R/.test(playerSrc) && !/BoxGeometry/.test(playerSrc),
  'painted chassis and authored silhouette fallbacks contain no rectangle-gun path');
ok(/GUN_FAMILY_HEIGHT_GAIN = Object\.freeze\(\{/.test(playerSrc) &&
   ['R','S','L','H','F'].every((letter) =>
     new RegExp(`${letter}: 1\\.`).test(section('const GUN_FAMILY_HEIGHT_GAIN', 'const TRAIT_GEOMETRIES'))),
  'all five families carry restrained fixed cross-section gains at shipped scale');
ok(/TRAIT_GEOMETRIES = Object\.freeze\(\{/.test(playerSrc) &&
   ['rapid','heavy','forked','seeker','phase','volatile'].every((trait) =>
     new RegExp(`\\n  ${trait}: gunGeometry`).test(playerSrc)) &&
   /attachment\.visible = count > 0/.test(playerSrc),
  'all six roll traits own bounded physical attachments toggled only on pickup');

ok(/lastAimAngle = Math\.atan2\(ay, ax\)/.test(playerSrc) &&
   /gunGroup\.rotation\.z = lastAimAngle/.test(playerSrc),
  'the weapon rotates on the simulation aim vector');
ok(/function eightWayAimSector\([^)]*\)/.test(playerSrc) &&
   /'right', 'up-right', 'up', 'up-left',[\s\S]*'left', 'down-left', 'down', 'down-right'/.test(playerSrc),
  'runtime reports all eight keyboard/analog aim sectors');
ok(/ax \* 0\.6 - ax \* RIG_GUN_MUZZLE_X/.test(playerSrc) &&
   /player\.muzzleY \+ ay \* 0\.5 - ay \* RIG_GUN_MUZZLE_X/.test(playerSrc),
  'the authored pivot places its muzzle on the exact gameplay spawn ellipse');
ok(Math.abs(RIG_GUN_MUZZLE_X - 0.82) < 1e-9,
  'every authored chassis terminates at the shared 0.82-tile muzzle endpoint');

const syncSection = section('function sync() {', 'const _rigScreenProbe');
ok(syncSection.length > 0 && !/new THREE\.|new (?:Mesh|Material|Geometry|Texture)/.test(syncSection),
  'the live RIG sync path allocates no THREE geometry, material, mesh, or texture');
ok(/fixedMeshes: 10/.test(playerSrc) && /maxVisibleDraws: 6/.test(playerSrc) &&
   /rectangleGunFallback: false/.test(playerSrc),
  'runtime snapshot exposes the fixed ten-mesh/six-draw/no-rectangle budget');
ok(/normalizedOverdriveCharge\(scoreCharge\(\), CONFIG\.score\.max\)/.test(syncSection) &&
   /Math\.max\(0, charge01 - 0\.20\) \* 0\.05/.test(syncSection) &&
   /notch === 1[\s\S]*0\.10 \+ charge01 \* 0\.07/.test(syncSection) &&
   /notch >= 2[\s\S]*0\.28 \+ breakingPulse \* 0\.18/.test(syncSection) &&
   /syncPowerAura\(gameMs, foldGain, charge01, notch, gildedOn\)/.test(syncSection) &&
   /rageStaccato\(gameMs\)/.test(syncSection) &&
   !/setTint|document\.|style\./.test(syncSection),
  'continuous charge, WARM/BREAKING, and RAGE energize RIG locally without a screen wash');
ok(/powerPresentation:\s*\{/.test(playerSrc) &&
   /activeLayers:\s*activePowerLayers/.test(playerSrc) &&
   /dominantPalette:\s*dominantPowerPalette/.test(playerSrc) &&
   /layerPrecedence:\s*\['GILDED_GOLD', 'RAGE_RED_MAGENTA', 'OVERDRIVE_WARM'\]/.test(playerSrc),
  'runtime diagnostics expose stacked power layers and their explicit visual precedence');
ok(!/jumpFlare|jumpExhaust\s*:\s*true|jetExhaust/.test(playerSrc),
  'RIG has no out-of-place jump propulsion visual');

const bodyAtlas = readPngSize(sourceAsset(RIG_BODY_ATLAS_PATH));
const weaponAtlas = readPngSize(sourceAsset(RIG_WEAPON_ATLAS_PATH));
const climbAtlas = readPngSize(sourceAsset(RIG_CLIMB_ATLAS_PATH));
ok(bodyAtlas.width === RIG_BODY_ATLAS_W && bodyAtlas.height === RIG_BODY_ATLAS_H &&
   weaponAtlas.width === RIG_WEAPON_ATLAS_W && weaponAtlas.height === RIG_WEAPON_ATLAS_H &&
   climbAtlas.width === RIG_CLIMB_ATLAS_W && climbAtlas.height === RIG_CLIMB_ATLAS_H,
  'all three production atlases match their power-of-two upload contracts');
ok(existsSync(fileURLToPath(new URL('tools/playtest/rig-presentation-capture.mjs', root))),
  'deterministic FAR desktop and portrait capture harness is present');

console.log(`RIG PRESENTATION PASS: ${passed} focused contracts`);
