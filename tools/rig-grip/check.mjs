// check.mjs — T-103's measured weapon-hold gate.
//
// Two kinds of evidence, both measured from PAINTED PIXELS:
//   1. anchors: every number the placement math trusts (weapon muzzle row,
//      grip centroid, fist centroid) is re-measured from the shipped PNGs;
//   2. rendered alignment: for every (body frame x aim x body facing x gun
//      facing x chassis x viewport gain x recoil) combination, the fist that
//      holds the weapon and the weapon's grip are RENDERED (tools/rig-grip/
//      raster.mjs, the same placement functions src/render/player.js runs)
//      and the alpha centroids of the painted fist pixels and the painted
//      grip pixels must land within ONE atlas pixel of each other; the
//      rendered muzzle face must land within 1 screen px (desktop FAR) of
//      the simulation's bullet spawn.
// `runGripCheck(opts)` returns { failures, stats, table } and accepts fault
// injections so tools/pathcheck/t-103-rig-grip-alignment.mjs can prove each
// assertion binds.
//
// Run directly it is the same gate on its own:
//   node tools/rig-grip/check.mjs [--json]
// prints the stats and every failure, and exits 1 if there is any failure
// (0 only when every combination passes). pathcheck runs it through d77.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../assets/lib/png.mjs';
import { CONFIG } from '../../src/config.js';
import {
  RIG_AIM_WORLD_PER_PIXEL, RIG_ARM_RIGS, RIG_ARM_SEGMENTS, RIG_BODY_ATLAS_PATH,
  RIG_GUN_MUZZLE_X, RIG_RECOIL_TILES, RIG_STATIONARY_STANCE, RIG_WEAPON_ART,
  RIG_WEAPON_ATLAS_PATH, RIG_WEAPON_MUZZLE_FACE_COLUMNS, rigStationaryAimFrame,
} from '../../src/pure/rig.js';
import { paintedCentroid, poseLayers, renderedCentroid, subLayer } from './raster.mjs';

const RIG_JS = new URL('../../src/pure/rig.js', import.meta.url);
const pngCache = new Map();
const png = (rel) => {
  if (!pngCache.has(rel)) pngCache.set(rel, decodePng(fileURLToPath(new URL(rel, RIG_JS))));
  return pngCache.get(rel);
};

// Desktop FAR measured 18.05 css px per tile at 1280x800 (and phone landscape
// 17.6 device px at DPR 2); 18.1 keeps the screen-px bound conservative.
export const FAR_PX_PER_TILE = 18.1;
export const ONE_ATLAS_PX = RIG_AIM_WORLD_PER_PIXEL;   // the finest RIG atlas texel
export const AIMS = {
  right: [1, 0], 'up-right': [Math.SQRT1_2, Math.SQRT1_2], up: [0, 1],
  'up-left': [-Math.SQRT1_2, Math.SQRT1_2], left: [-1, 0],
  'down-left': [-Math.SQRT1_2, -Math.SQRT1_2], down: [0, -1],
  'down-right': [Math.SQRT1_2, -Math.SQRT1_2],
};
export const CHASSIS = Object.keys(RIG_WEAPON_ART);
export const FRAMES = Object.keys(RIG_ARM_RIGS);

function alphaAt(img, x, y) { return img.rgba[(y * img.width + x) * 4 + 3]; }

// Can the game show this body frame with this aim? The two stationary stances
// are picked by aim elevation (rigStationaryAimFrame); every other frame
// (run, air, climb, wall, and the aim-atlas-failure `idle`) takes any aim.
// Alignment is asserted on the SUPERSET; only the stretch bound is limited
// to what a player can actually put on screen.
export function reachable(frame, aim) {
  const stances = new Set(Object.values(RIG_STATIONARY_STANCE));
  return !stances.has(frame) || rigStationaryAimFrame(aim[0], aim[1]) === frame;
}

// --- painted measurements -------------------------------------------------
export function measureWeapon(img, spec) {
  const x0 = spec.atlasX + spec.trimX, y0 = spec.atlasY + spec.trimY;
  let top = Infinity, bot = -Infinity;
  for (let qx = spec.trimW - RIG_WEAPON_MUZZLE_FACE_COLUMNS; qx < spec.trimW; qx++) {
    for (let qy = 0; qy < spec.trimH; qy++) {
      if (alphaAt(img, x0 + qx, y0 + qy) >= 128) { top = Math.min(top, qy); bot = Math.max(bot, qy); }
    }
  }
  const [bx, by, bw, bh] = spec.gripBox;
  let n = 0, sx = 0, sy = 0;
  for (let qy = by; qy < by + bh; qy++) for (let qx = bx; qx < bx + bw; qx++) {
    if (alphaAt(img, x0 + qx, y0 + qy) >= 128) { n++; sx += qx + 0.5; sy += qy + 0.5; }
  }
  return { muzzleMid: (top + bot + 1) / 2, muzzleTop: top, muzzleBottom: bot,
    grip: n ? [sx / n, sy / n] : null, gripPixels: n };
}

export function measureFist(img, box = RIG_ARM_SEGMENTS.fore.fistBox) {
  const [bx, by, bw, bh] = box;
  let n = 0, sx = 0, sy = 0;
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    if (alphaAt(img, x, y) >= 128) { n++; sx += x + 0.5; sy += y + 0.5; }
  }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

export function opaqueCount(img, [x, y, w, h]) {
  let n = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (alphaAt(img, xx, yy) >= 128) n++;
  return n;
}

// --- one rendered combination ---------------------------------------------
// Returns world-space (rig-local tiles) centroids of the rendered painted
// fist, rendered painted grip and rendered muzzle face, plus the sim spawn.
export function renderCombo({ frame, aim, bodyFacing, gunFacing, letter, gain = 1,
  squash = 1, muzzleY = CONFIG.player.muzzleY, recoil = 0, inject = {}, raster = false }) {
  const { layers, pose } = poseLayers({ frame, bodyFacing, gunFacing, aim, letter, muzzleY,
    gain, squash, recoil, arms: true, inject });
  const gunTag = pose.gunLayer === 'far' || pose.gunLayer === 'near' ? 'gun-fore' : null;
  const fistLayer = layers.find((L) => L.tag === gunTag);
  const gunLayer = layers.find((L) => L.tag === 'gun');
  const spec = RIG_WEAPON_ART[letter];
  const gx0 = spec.atlasX + spec.trimX, gy0 = spec.atlasY + spec.trimY;
  const [bx, by, bw, bh] = inject.gripBox || spec.gripBox;
  // raster: true rasterizes the layers (the slow, literal render); otherwise
  // the painted centroid is carried through the same affine map (exact).
  const ppt = Math.max(400, 2.2 / (RIG_AIM_WORLD_PER_PIXEL * gain));
  const measure = (L) => (raster ? renderedCentroid(L, { ppt }) : paintedCentroid(L));
  const fist = fistLayer ? measure(subLayer(fistLayer, RIG_ARM_SEGMENTS.fore.fistBox, 'fist')) : null;
  const grip = measure(subLayer(gunLayer, [gx0 + bx, gy0 + by, bw, bh], 'grip'));
  const face = RIG_WEAPON_MUZZLE_FACE_COLUMNS;
  const muzzle = measure(subLayer(gunLayer, [gx0 + spec.trimW - face, gy0, face, spec.trimH], 'muzzle'));
  const spawn = { x: aim[0] * RIG_GUN_MUZZLE_X, y: muzzleY + aim[1] * RIG_GUN_MUZZLE_X };
  return { pose, fist, grip, muzzle, spawn };
}

// The centroid of the last N painted columns sits ~N/2 px behind the muzzle
// TIP along the bore; compare it with the spawn advanced by that same amount
// so the bound measures cross-bore and along-bore placement, not N.
const faceCentroidX = new Map();
function muzzleError(combo, letter, gain, recoil) {
  const spec = RIG_WEAPON_ART[letter];
  const s = spec.worldW / spec.trimW;
  if (!faceCentroidX.has(letter)) {
    // painted centroid of the face columns, in trimmed px (unrotated)
    const img = png(RIG_WEAPON_ATLAS_PATH);
    const x0 = spec.atlasX + spec.trimX, y0 = spec.atlasY + spec.trimY;
    let n = 0, sx = 0;
    for (let qx = spec.trimW - RIG_WEAPON_MUZZLE_FACE_COLUMNS; qx < spec.trimW; qx++)
      for (let qy = 0; qy < spec.trimH; qy++)
        if (alphaAt(img, x0 + qx, y0 + qy) >= 128) { n++; sx += qx + 0.5; }
    faceCentroidX.set(letter, sx / n);
  }
  const back = (spec.trimW - faceCentroidX.get(letter)) * s * gain + recoil;
  const ax = combo.pose.placement.angle;
  const ex = combo.spawn.x - Math.cos(ax) * back, ey = combo.spawn.y - Math.sin(ax) * back;
  return Math.hypot(combo.muzzle.x - ex, combo.muzzle.y - ey);
}

// --- the whole gate ---------------------------------------------------------
export function runGripCheck({ frames = FRAMES, aims = Object.keys(AIMS), chassis = CHASSIS,
  gains = [1, 1.5], recoils = [0, RIG_RECOIL_TILES], inject = {}, weaponArt = RIG_WEAPON_ART,
  fistAnchor = RIG_ARM_SEGMENTS.fore.to, maxStretchAtGain1 = 1.15, portraitStretchCeiling = 1.75,
  crouch = true } = {}) {
  const failures = [];
  const table = [];
  const weaponImg = png(RIG_WEAPON_ATLAS_PATH);
  const bodyImg = png(RIG_BODY_ATLAS_PATH);

  // 1. anchors are measured, not authored
  for (const letter of chassis) {
    const spec = weaponArt[letter];
    const m = measureWeapon(weaponImg, spec);
    if (Math.abs(m.muzzleMid - spec.muzzleY) > 0.5)
      failures.push(`${letter}: muzzleY ${spec.muzzleY} is not the painted muzzle-face middle ${m.muzzleMid}`);
    if (!m.grip || m.gripPixels < 1000)
      failures.push(`${letter}: gripBox holds ${m.gripPixels} painted pixels — not a pistol grip`);
    else if (Math.hypot(m.grip[0] - spec.grip[0], m.grip[1] - spec.grip[1]) > 0.5)
      failures.push(`${letter}: grip anchor [${spec.grip}] is ${Math.hypot(m.grip[0] - spec.grip[0],
        m.grip[1] - spec.grip[1]).toFixed(2)} px from the painted grip centroid ` +
        `[${m.grip.map((v) => v.toFixed(1))}]`);
  }
  const fist = measureFist(bodyImg);
  if (!fist || fist.n < 600) failures.push(`arm strip: fistBox holds ${fist?.n || 0} painted pixels`);
  else if (Math.hypot(fist.x - fistAnchor[0], fist.y - fistAnchor[1]) > 0.75)
    failures.push(`arm strip: fist anchor [${fistAnchor}] is ${Math.hypot(fist.x - fistAnchor[0],
      fist.y - fistAnchor[1]).toFixed(2)} px from the painted fist centroid [${fist.x.toFixed(1)}, ${fist.y.toFixed(1)}]`);
  for (const [name, seg] of Object.entries(RIG_ARM_SEGMENTS)) {
    if (opaqueCount(bodyImg, [seg.x, seg.y, seg.w, seg.h]) < 1500)
      failures.push(`arm strip ${name}: atlas rect [${seg.x},${seg.y},${seg.w},${seg.h}] is (nearly) empty`);
  }

  // 2. rendered alignment, every combination
  const stats = { combos: 0, maxFistGripAtlasPx: 0, maxMuzzleScreenPx: 0, maxStretchGain1: 1,
    maxStretchPortrait: 1, stretchedGain1: 0, worst: null };
  for (const frame of frames) for (const aimName of aims) for (const bodyFacing of [1, -1])
    for (const gunFacing of [1, -1]) for (const letter of chassis) for (const gain of gains)
      for (const recoil of recoils) {
        const aim = AIMS[aimName];
        // the gun facing only picks the weapon's mirror for a vertical aim
        if (gunFacing !== bodyFacing && Math.abs(aim[0]) > 0.1) continue;
        const combo = renderCombo({ frame, aim, bodyFacing, gunFacing, letter, gain, recoil, inject });
        stats.combos++;
        const label = `${frame}/${aimName}/body${bodyFacing > 0 ? 'R' : 'L'}/gun${gunFacing > 0 ? 'R' : 'L'}/${letter}/gain${gain}/recoil${recoil.toFixed(3)}`;
        if (!combo.fist || !combo.grip) {
          failures.push(`${label}: no rendered ${combo.fist ? 'grip' : 'fist'} pixels`);
          continue;
        }
        const dAtlas = Math.hypot(combo.fist.x - combo.grip.x, combo.fist.y - combo.grip.y) / (ONE_ATLAS_PX * gain);
        const dMuzzle = muzzleError(combo, letter, gain, recoil) * FAR_PX_PER_TILE / gain;
        const stretch = combo.pose.gunArm.stretch;
        table.push({ label, dAtlas, dMuzzle, stretch, shown: reachable(frame, aim), gain });
        if (dAtlas > stats.maxFistGripAtlasPx) { stats.maxFistGripAtlasPx = dAtlas; stats.worst = label; }
        stats.maxMuzzleScreenPx = Math.max(stats.maxMuzzleScreenPx, dMuzzle);
        const shown = reachable(frame, aim);
        if (shown && gain === 1) {
          stats.maxStretchGain1 = Math.max(stats.maxStretchGain1, stretch);
          if (stretch > 1.0001) stats.stretchedGain1++;
        } else if (shown) stats.maxStretchPortrait = Math.max(stats.maxStretchPortrait, stretch);
        if (dAtlas > 1) failures.push(`${label}: rendered fist centroid is ${dAtlas.toFixed(2)} atlas px off the rendered grip`);
        if (dMuzzle > 1) failures.push(`${label}: rendered muzzle is ${dMuzzle.toFixed(2)} screen px off the sim spawn`);
        if (shown && gain === 1 && stretch > maxStretchAtGain1)
          failures.push(`${label}: arm stretched x${stretch.toFixed(3)} to reach the grip (bound ${maxStretchAtGain1})`);
        if (shown && gain !== 1 && stretch > portraitStretchCeiling)
          failures.push(`${label}: portrait arm stretched x${stretch.toFixed(3)} (ceiling ${portraitStretchCeiling})`);
      }
  // 3. crouch (?crouch=1 prototype, off by default): the body is squashed to
  // the crouch height and the sim fires from CONFIG.crouch.muzzleY with the
  // aim forced level; the shown frame is the level stance.
  if (crouch) {
    const squash = CONFIG.crouch.height / CONFIG.player.height;
    for (const aimName of ['right', 'left']) for (const bodyFacing of [1, -1]) for (const letter of chassis)
      for (const gain of gains) {
        const aim = AIMS[aimName];
        const frame = rigStationaryAimFrame(aim[0], aim[1]);
        const combo = renderCombo({ frame, aim, bodyFacing, gunFacing: bodyFacing, letter, gain, squash,
          muzzleY: CONFIG.crouch.muzzleY, inject });
        stats.combos++;
        const label = `crouch/${frame}/${aimName}/body${bodyFacing > 0 ? 'R' : 'L'}/${letter}/gain${gain}`;
        const dAtlas = Math.hypot(combo.fist.x - combo.grip.x, combo.fist.y - combo.grip.y) / (ONE_ATLAS_PX * gain);
        const dMuzzle = muzzleError(combo, letter, gain, 0) * FAR_PX_PER_TILE / gain;
        const stretch = combo.pose.gunArm.stretch;
        table.push({ label, dAtlas, dMuzzle, stretch, shown: true, gain });
        stats.maxFistGripAtlasPx = Math.max(stats.maxFistGripAtlasPx, dAtlas);
        stats.maxMuzzleScreenPx = Math.max(stats.maxMuzzleScreenPx, dMuzzle);
        if (dAtlas > 1) failures.push(`${label}: rendered fist centroid is ${dAtlas.toFixed(2)} atlas px off the rendered grip`);
        if (dMuzzle > 1) failures.push(`${label}: rendered muzzle is ${dMuzzle.toFixed(2)} screen px off the crouched sim spawn`);
        if (gain === 1 && stretch > maxStretchAtGain1)
          failures.push(`${label}: arm stretched x${stretch.toFixed(3)} to reach the grip (bound ${maxStretchAtGain1})`);
        if (gain === 1) stats.maxStretchGain1 = Math.max(stats.maxStretchGain1, stretch);
      }
  }
  return { failures, stats, table };
}

// --- CLI ---------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const { failures, stats, table } = runGripCheck();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: failures.length === 0, stats, failures }, null, 2));
  } else {
    const worstStretch = table.filter((r) => r.shown && r.gain === 1).sort((a, b) => b.stretch - a.stretch)[0];
    console.log(`rig-grip gate: ${stats.combos} combinations in ${Date.now() - t0} ms`);
    console.log(`  worst fist-to-grip   ${stats.maxFistGripAtlasPx.toFixed(4)} atlas px (bound 1) at ${stats.worst}`);
    console.log(`  worst muzzle-to-spawn ${stats.maxMuzzleScreenPx.toFixed(4)} desktop-FAR px (bound 1)`);
    console.log(`  arm stretch: gain-1 max x${stats.maxStretchGain1.toFixed(3)} (bound 1.15; ` +
      `${stats.stretchedGain1} stretched)${worstStretch ? ` at ${worstStretch.label}` : ''}; ` +
      `portrait max x${stats.maxStretchPortrait.toFixed(3)} (ceiling 1.75)`);
    for (const f of failures.slice(0, 40)) console.log(`  FAIL ${f}`);
    if (failures.length > 40) console.log(`  ... and ${failures.length - 40} more failures`);
    console.log(failures.length ? `RIG-GRIP GATE: FAIL (${failures.length} failures)` : 'RIG-GRIP GATE: PASS');
  }
  process.exitCode = failures.length ? 1 : 0;
}
