// T-103 (playtest FAIL fix): RIG's re-posed arms must be FRONT faces in both
// facings.
//
// The defect this guards: rigArmSegmentCorners() mirrors a left-facing arm by
// negating x, which reverses the quad's winding. The renderer kept one fixed
// triangle order, so every left-facing arm triangle was clockwise, a BACK
// face; under the DoubleSide material three.js flipped its normal and the key
// light dropped out (playtest: the left-facing arm at 71 % of the right-facing
// luma, warm tan turning grey-olive; the whole figure 4 % darker facing left).
// The d77 gate could not see it: its compositor has no lighting.
//
// This domain computes the winding of EVERY arm triangle the renderer can
// draw: the same rigArmPose() solve, the same rigArmSegmentCorners() calls
// with the same `mirror`, and the triangle order read off src/render/player.js
// (the order it really uses, not the one it was meant to use). Counter-
// clockwise in rig space (x right, y up) is front-facing: the arm meshes carry
// no mirroring transform and three.js treats CCW as the front. It then holds
// the material half of the contract: FrontSide and +z normals, so a future
// winding slip makes the arms vanish rather than go quietly dark.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';
import { CONFIG } from '../../src/config.js';
import * as R from '../../src/pure/rig.js';
import { AIMS, CHASSIS, FRAMES } from '../rig-grip/check.mjs';

export const title = 'T-103 — RIG\'s arms are front faces in both facings (winding + material side)';

// The single triangle order player.js used for both facings before the fix.
const PRE_FIX_ORDER = Object.freeze([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]);

// Signed area of triangle (a, b, d) over 2D corners packed x,y: > 0 is
// counter-clockwise with y up.
function signedArea(c, a, b, d) {
  return ((c[b * 2] - c[a * 2]) * (c[d * 2 + 1] - c[a * 2 + 1]) -
    (c[b * 2 + 1] - c[a * 2 + 1]) * (c[d * 2] - c[a * 2])) / 2;
}

// Which triangle order the renderer draws an arm with, for a given mirror.
function rendererOrder(src) {
  const at = src.indexOf('function writeArm(');
  const writeArm = at < 0 ? '' : src.slice(at, src.indexOf('\n}\n', at));
  if (/rigArmTriangleIndex\(pose\.mirror\)/.test(writeArm) && typeof R.rigArmTriangleIndex === 'function') {
    return { how: 'rigArmTriangleIndex(pose.mirror)', orderFor: (m) => R.rigArmTriangleIndex(m) };
  }
  const literal = src.match(/setIndex\(\[([\d,\s]+)\]\)/);
  if (literal) {
    const fixed = literal[1].split(',').map(Number);
    return { how: `one fixed order [${fixed}] for both facings`, orderFor: () => fixed };
  }
  return null;
}

// Every arm the game can show: every rigged frame x aim x facing x chassis x
// viewport gain x recoil, standing and crouched (the gate's own matrix).
function sweep(orderFor) {
  const crouchSquash = CONFIG.crouch.height / CONFIG.player.height;
  const pose = {};
  const corners = new Float32Array(16);
  const byMirror = { 1: { triangles: 0, clockwise: 0 }, '-1': { triangles: 0, clockwise: 0 } };
  let minAbsArea = Infinity;
  for (const frame of FRAMES) for (const aimName of Object.keys(AIMS)) for (const bodyFacing of [1, -1])
    for (const gunFacing of [1, -1]) for (const letter of CHASSIS) for (const gain of [1, 1.5])
      for (const recoil of [0, R.RIG_RECOIL_TILES]) for (const crouched of [false, true]) {
        const aim = AIMS[aimName];
        if (gunFacing !== bodyFacing && Math.abs(aim[0]) > 0.1) continue;
        R.rigArmPose(frame, bodyFacing, gunFacing, aim[0], aim[1], letter,
          crouched ? CONFIG.crouch.muzzleY : CONFIG.player.muzzleY, gain,
          crouched ? crouchSquash : 1, recoil, true, pose);
        if (!pose.ok) continue;
        const order = orderFor(pose.mirror);
        for (const arm of [pose.gunArm, pose.supportArm]) {
          if (!arm) continue;
          // exactly writeArm(): upper strip shoulder->elbow, fore strip elbow->hand
          R.rigArmSegmentCorners(R.RIG_ARM_SEGMENTS.upper, arm.sx, arm.sy, arm.ex, arm.ey,
            pose.thick, pose.mirror, corners, 0);
          R.rigArmSegmentCorners(R.RIG_ARM_SEGMENTS.fore, arm.ex, arm.ey, arm.hx, arm.hy,
            pose.thick, pose.mirror, corners, 8);
          const tally = byMirror[pose.mirror];
          for (let t = 0; t < order.length; t += 3) {
            const a = signedArea(corners, order[t], order[t + 1], order[t + 2]);
            tally.triangles++;
            if (!(a > 0)) tally.clockwise++;
            minAbsArea = Math.min(minAbsArea, Math.abs(a));
          }
        }
      }
  return { byMirror, minAbsArea };
}

export async function run() {
  const src = stripComments(readFileSync(join(srcDir, 'render', 'player.js'), 'utf8'));

  // 1. what the renderer draws is front-facing, both facings
  const drawn = rendererOrder(src);
  const shipped = drawn ? sweep(drawn.orderFor) : null;
  const right = shipped?.byMirror[1], left = shipped?.byMirror[-1];
  ok(!!shipped && right.triangles > 1000 && left.triangles > 1000 &&
     right.clockwise === 0 && left.clockwise === 0 && shipped.minAbsArea > 1e-4,
    'T-103: every arm triangle the renderer draws is counter-clockwise (a front face) facing right ' +
    'AND facing left' + (shipped ? ` (order: ${drawn.how}; clockwise ${right.clockwise}/${right.triangles} ` +
      `facing right, ${left.clockwise}/${left.triangles} facing left)` : ' (no arm index found in player.js)'));

  // 2. the measure binds: the pre-fix single order is clockwise for every
  // left-facing triangle (the defect the playtest measured) and fine facing right
  const preFix = sweep(() => PRE_FIX_ORDER);
  ok(preFix.byMirror[-1].triangles > 1000 &&
     preFix.byMirror[-1].clockwise === preFix.byMirror[-1].triangles &&
     preFix.byMirror[1].clockwise === 0,
    'T-103 binds: one triangle order for both facings (the pre-fix renderer) is caught — ' +
    `${preFix.byMirror[-1].clockwise}/${preFix.byMirror[-1].triangles} left-facing arm triangles clockwise`);

  // 3. facing right is drawn exactly as before the fix (same two triangles per
  // strip, same order), so only the mirrored winding changed
  ok(typeof R.rigArmTriangleIndex === 'function' &&
     R.rigArmTriangleIndex(1).join(',') === PRE_FIX_ORDER.join(',') &&
     R.rigArmTriangleIndex(-1).length === PRE_FIX_ORDER.length,
    'T-103: the right-facing arm keeps its pre-fix triangle order; only the mirrored order flips');

  // 4. the material half: FrontSide, +z normals, no mirroring transform on the
  // arm meshes (a negative scale would flip the winding again), and writeArm
  // mirrors the corners with the same pose.mirror it picks the order for
  const matAt = src.indexOf('const armMaterial = new THREE.MeshStandardMaterial(');
  const armMaterial = matAt < 0 ? '' : src.slice(matAt, src.indexOf('});', matAt));
  const geoAt = src.indexOf('function armGeometry()');
  const armGeometry = geoAt < 0 ? '' : src.slice(geoAt, src.indexOf('\n}\n', geoAt));
  const wAt = src.indexOf('function writeArm(');
  const writeArm = wAt < 0 ? '' : src.slice(wAt, src.indexOf('\n}\n', wAt));
  ok(/side: THREE\.FrontSide/.test(armMaterial) && !/DoubleSide|BackSide/.test(armMaterial) &&
     /normal\[i \* 3 \+ 2\] = 1/.test(armGeometry) &&
     !/\barm(Near|Far)\.scale\b/.test(src) && !/mesh\.scale/.test(src.slice(src.indexOf('const [armFar, armNear]'),
       src.indexOf('function writeArm('))) &&
     (writeArm.match(/pose\.thick, pose\.mirror, _armCorners/g) || []).length === 2,
    'T-103: the arm material is FrontSide with +z normals, the arm meshes are never mirrored by a ' +
    'transform, and writeArm mirrors the corners with the same pose.mirror the order is chosen for');
}
