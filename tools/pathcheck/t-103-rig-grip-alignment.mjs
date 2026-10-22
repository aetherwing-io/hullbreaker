// Domain: T-103 — RIG's weapon sits in his hands (decisions.md entries 20, 21)
//
// The operator: "the models are a little off (like guns don't align to
// hands)". Root cause: every painted RIG frame held its fists at chest or
// shoulder height while the simulation fires from a hip-height hand socket,
// so the gun hung 15-28 css px (desktop FAR) away from the nearest painted
// fist (reports/tasks/T-103/build.md). The painted arms are now removed from
// the frames and RIG's own arm, cut from his aim painting, is re-posed onto
// the weapon's grip every frame.
//
// Everything below is measured from PAINTED PIXELS: the gate renders the
// shipped atlases through the same placement functions src/render/player.js
// runs (tools/rig-grip/raster.mjs) and compares where the painted fist lands
// with where the painted grip lands. tools/rig-grip/capture.mjs repeats the
// measurement on the live three.js meshes in a browser; this domain is the
// fast, per-change half.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';
import { decodePng } from '../assets/lib/png.mjs';
import { ARM_SURGERY, polygonPixels } from '../assets/rig-arm-surgery.mjs';
import {
  AIMS, CHASSIS, FRAMES, ONE_ATLAS_PX, measureWeapon, reachable, renderCombo, runGripCheck,
} from '../rig-grip/check.mjs';
import {
  RIG_ARM_RIGS, RIG_ARM_SEGMENTS, RIG_STATIONARY_STANCE, RIG_WEAPON_ART,
  RIG_WEAPON_ATLAS_PATH, rigArmPose, rigBodyFrameSpec, rigStationaryAimFrame,
} from '../../src/pure/rig.js';

export const title = 'T-103 — RIG holds the weapon: rendered fist on rendered grip';

const SPRITES = new URL('../../assets/generated/sprites/', import.meta.url);

export async function run() {
  // --- 1. every combination the game can draw ------------------------------
  const full = runGripCheck();
  const s = full.stats;
  ok(full.failures.length === 0,
    'T-103: every (frame x aim x body facing x gun facing x chassis x viewport gain x recoil) ' +
    'combination puts the rendered fist on the rendered grip and the rendered muzzle on the ' +
    'sim spawn' + (full.failures.length ? ' — ' + full.failures.slice(0, 6).join('; ') : ''));
  ok(s.combos >= FRAMES.length * 8 * 2 * CHASSIS.length * 2 * 2,
    `T-103: the matrix is exhaustive (${s.combos} combinations over ${FRAMES.length} frames, ` +
    `8 aims, both facings, ${CHASSIS.length} chassis, desktop+portrait gain, rest+recoil)`);
  ok(s.maxFistGripAtlasPx <= 1,
    `T-103: worst rendered fist-to-grip distance is ${s.maxFistGripAtlasPx.toFixed(3)} atlas px ` +
    `(bound 1; one atlas px = ${ONE_ATLAS_PX.toFixed(5)} tiles = ` +
    `${(ONE_ATLAS_PX * 18.1).toFixed(3)} desktop FAR px)`);
  ok(s.maxMuzzleScreenPx <= 1,
    `T-103: worst rendered muzzle-to-spawn distance is ${s.maxMuzzleScreenPx.toFixed(3)} ` +
    'screen px at desktop FAR (bound 1)');
  ok(s.maxStretchGain1 <= 1.15,
    `T-103: at FAR (gain 1) no on-screen pose stretches the arm past x1.15 to reach the grip ` +
    `(worst x${s.maxStretchGain1.toFixed(3)}, ${s.stretchedGain1} stretched combos)`);
  ok(s.maxStretchPortrait <= 1.75,
    `T-103: portrait (actor gain 1.5) arm stretch stays under its documented ceiling ` +
    `(worst x${s.maxStretchPortrait.toFixed(3)}; see build.md "portrait")`);

  // --- 2. the fast centroid IS the rendered centroid ------------------------
  {
    let worst = 0, n = 0;
    for (const frame of ['aim-right', 'contact', 'air-fall', 'climb-2']) {
      for (const aimName of ['right', 'up-left', 'down']) for (const letter of ['R', 'F']) {
        for (const gain of [1, 1.5]) {
          const a = renderCombo({ frame, aim: AIMS[aimName], bodyFacing: -1, gunFacing: -1, letter, gain });
          const b = renderCombo({ frame, aim: AIMS[aimName], bodyFacing: -1, gunFacing: -1, letter,
            gain, raster: true });
          for (const k of ['fist', 'grip', 'muzzle']) {
            worst = Math.max(worst, Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y) / (ONE_ATLAS_PX * gain));
            n++;
          }
        }
      }
    }
    ok(n === 144 && worst <= 0.3,
      `T-103: the affine centroid shortcut matches a literal rasterization within ` +
      `${worst.toFixed(3)} atlas px over ${n} sampled measurements (bound 0.3)`);
  }

  // --- 3. the painted arms are really gone from the shipped atlases ----------
  {
    let opaque = 0, checked = 0;
    for (const [atlas, poses] of Object.entries(ARM_SURGERY)) {
      const img = decodePng(fileURLToPath(new URL(`${atlas}.png`, SPRITES)));
      for (const ops of Object.values(poses)) for (const poly of ops.erase || []) {
        const px = polygonPixels(poly, img.width, img.height);
        for (let i = 0; i < px.length; i += 2) {
          checked++;
          if (img.rgba[(px[i + 1] * img.width + px[i]) * 4 + 3] >= 8) opaque++;
        }
      }
    }
    ok(checked > 15000 && opaque === 0,
      `T-103: every pixel where a painted forearm or fist used to float is transparent in the ` +
      `shipped atlases (${checked} pixels checked, ${opaque} still painted)`);
  }

  // --- 4. the gate binds (LANE-BRIEF: break it, watch it go red) -------------
  {
    const one = { frames: ['aim-right', 'contact', 'climb-0'], aims: ['right', 'up'], chassis: ['R'],
      gains: [1], recoils: [0] };
    const handOff = runGripCheck({ ...one, inject: { handOffset: [3 * ONE_ATLAS_PX, 0] } });
    ok(handOff.failures.some((f) => /atlas px off the rendered grip/.test(f)),
      'T-103 binds: a hand solved 3 atlas px off its grip is reported');
    const R = RIG_WEAPON_ART.R;
    const gripMoved = runGripCheck({ ...one,
      weaponArt: { ...RIG_WEAPON_ART, R: { ...R, grip: [R.grip[0] + 3, R.grip[1]] } } });
    ok(gripMoved.failures.some((f) => /^R: grip anchor .* from the painted grip centroid/.test(f)),
      'T-103 binds: a grip anchor moved 3 px off the painted pistol grip is reported');
    const oldMuzzle = runGripCheck({ ...one,
      weaponArt: { ...RIG_WEAPON_ART, R: { ...R, muzzleY: 82 } } });
    ok(oldMuzzle.failures.some((f) => /^R: muzzleY 82 is not the painted muzzle-face middle/.test(f)),
      'T-103 binds: the pre-T-103 R muzzle row (82, the bottom edge of the brake) is reported');
    const fistMoved = runGripCheck({ ...one,
      fistAnchor: [RIG_ARM_SEGMENTS.fore.to[0] + 3, RIG_ARM_SEGMENTS.fore.to[1]] });
    ok(fistMoved.failures.some((f) => /^arm strip: fist anchor/.test(f)),
      'T-103 binds: a fist anchor moved 3 px off the painted fist is reported');
    const tight = runGripCheck({ ...one, frames: ['aim-right'], chassis: ['F'], aims: ['right', 'left'],
      maxStretchAtGain1: 1.01 });
    ok(tight.failures.some((f) => /arm stretched/.test(f)),
      'T-103 binds: the stretch bound reports an over-reached arm');
    // the painted-pixel measurement itself: the grip box really holds a grip
    const img = decodePng(fileURLToPath(new URL(RIG_WEAPON_ATLAS_PATH,
      new URL('../../src/pure/rig.js', import.meta.url))));
    const emptyBox = measureWeapon(img, { ...R, gripBox: [R.trimW - 30, 0, 20, 20] });
    ok(emptyBox.gripPixels < 1000,
      'T-103 binds: a grip box placed off the weapon finds no pistol grip to measure');
  }

  // --- 5. the renderer runs exactly this math --------------------------------
  {
    const src = stripComments(readFileSync(join(srcDir, 'render', 'player.js'), 'utf8'));
    const sync = src.slice(src.indexOf('function sync() {'), src.indexOf('const _rigScreenProbe'));
    ok(/rigWeaponPlacement\(ax, ay, player\.facing, player\.muzzleY, gunFamilyHeightGain,\s*portraitGain, lastRecoil, _gunPlacement\)/.test(sync) &&
       /gunGroup\.position\.set\(0, _gunPlacement\.pivotY, RIG_GUN_DEPTH\)/.test(sync) &&
       /gunAssembly\.scale\.set\(_gunPlacement\.scaleX, _gunPlacement\.scaleY, 1\)/.test(sync) &&
       /gunAssembly\.position\.x = _gunPlacement\.offsetX/.test(sync),
      'T-103: the drawn weapon is placed by rigWeaponPlacement(), the function the gate measures');
    ok(/rigArmPose\(shownBodyFrame, faceX, player\.facing, ax, ay, currentWeapon, player\.muzzleY,\s*portraitGain, squash, lastRecoil, gunUsesArt, _armPose\)/.test(sync) &&
       /writeArm\(/.test(sync) && !/new THREE\./.test(sync),
      'T-103: the hands are solved by rigArmPose() on the frame actually shown, written in place');
    ok(/RIG_CLIMB_BODY_DROP/.test(src) && /function stationaryAimFrame[\s\S]{0,200}rigStationaryAimFrame/.test(src),
      'T-103: player.js uses the shared climb drop and stance table the gate measured');
  }

  // --- 5b. the per-frame math reuses its scratch (the render loop calls it
  // every frame and must stay allocation-free) ---------------------------------
  {
    const out = {};
    rigArmPose('contact', 1, 1, 1, 0, 'R', 1.05, 1, 1, 0, true, out);
    const keep = [out.grip, out.support, out.gunArm, out.gunShoulder, out.placement, out.supportSolve];
    rigArmPose('aim-down-right', -1, -1, 0, 1, 'F', 1.05, 1.5, 1, 0.05, true, out);
    ok(keep.every(Boolean) && [out.grip, out.support, out.gunArm, out.gunShoulder, out.placement,
      out.supportSolve].every((v, i) => v === keep[i]) &&
       rigBodyFrameSpec('contact') === rigBodyFrameSpec('contact'),
      'T-103: rigArmPose() writes into the caller\'s scratch objects and the frame table is cached');
  }

  // --- 6. retired stances can never be selected ------------------------------
  {
    const shown = new Set();
    for (let deg = 0; deg < 360; deg += 1) {
      const a = deg * Math.PI / 180;
      shown.add(rigStationaryAimFrame(Math.cos(a), Math.sin(a)));
    }
    ok([...shown].sort().join(',') === Object.values(RIG_STATIONARY_STANCE).sort().join(',') &&
       !shown.has('aim-up') && !shown.has('aim-up-right') &&
       [...shown].every((f) => RIG_ARM_RIGS[f]),
      'T-103: every stationary aim lands on a stance with a hand rig; the raised-arm `up` ' +
      'paintings (helmet/chest hidden behind the arms) are never shown');
    ok(FRAMES.every((f) => reachable(f, [1, 0]) || reachable(f, [0, 1])),
      'T-103: every rigged frame is reachable by some aim');
  }
}
