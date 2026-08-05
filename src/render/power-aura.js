/* =============== OVERDRIVE CHASSIS BRACKETS (render) =============== *
 * A single fixed mesh of eight short machine brackets hugs RIG's silhouette.
 * It is intentionally not another gilded halo: OVERDRIVE is earned combat
 * heat, so it is compact, warm-white, and quick.  The secret chassis keeps
 * its large gold halo and slow expanding rings as a unique reward.
 *
 * Threshold state is presentation-only.  Rising into WARM/BREAKING starts a
 * short bracket expansion; steady charge then settles into a low local glow.
 * No bitmap, canvas, new per-frame object, or simulation write is involved. */

import * as THREE from 'three';
import { PAL } from './palette.js';
import {
  OVERDRIVE_ENTRY_MS, clampPower01, overdriveBreath,
} from './power-feedback.js';

let bracket = null;
let previousNotch = 0;
let enteredAt = -1e9;
let lastGameMs = -1;
let lastOpacity = 0;
let lastScale = 1;

function bracketGeometry(spriteHeight) {
  const positions = [];
  const indices = [];
  const halfW = spriteHeight * 0.32;
  const halfH = spriteHeight * 0.54;
  const arm = spriteHeight * 0.13;
  const thick = Math.max(0.035, spriteHeight * 0.022);
  const quad = (x0, y0, x1, y1) => {
    const first = positions.length / 3;
    positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * halfW;
      const y = sy * halfH;
      quad(sx < 0 ? x : x - arm, y - thick * 0.5,
        sx < 0 ? x + arm : x, y + thick * 0.5);
      quad(x - thick * 0.5, sy < 0 ? y : y - arm,
        x + thick * 0.5, sy < 0 ? y + arm : y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function mountPowerAura(rigGroup, spriteHeight) {
  if (bracket) return false;
  bracket = new THREE.Mesh(
    bracketGeometry(spriteHeight),
    new THREE.MeshBasicMaterial({
      color: PAL.muzzle, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
    }),
  );
  bracket.position.set(0, spriteHeight * 0.5, -0.10);
  bracket.name = 'RIG_OVERDRIVE_BRACKETS';
  bracket.userData.feedbackRole = 'overdrive-local';
  bracket.visible = false;
  rigGroup.add(bracket);
  return true;
}

export function syncPowerAura(gameMs, foldGain, charge01, notch, gilded) {
  if (!bracket) return;
  if (gameMs < lastGameMs) {
    previousNotch = 0;
    enteredAt = -1e9;
  }
  lastGameMs = gameMs;
  const safeNotch = Math.max(0, Math.min(2, notch | 0));
  if (safeNotch > previousNotch) enteredAt = gameMs;
  previousNotch = safeNotch;

  const charge = clampPower01(charge01);
  const breath = overdriveBreath(gameMs);
  const entry = clampPower01(1 - (gameMs - enteredAt) / OVERDRIVE_ENTRY_MS);
  const steady = safeNotch >= 2
    ? 0.15 + breath * 0.08
    : safeNotch === 1
      ? 0.09 + charge * 0.045
      : Math.max(0, charge - 0.22) * 0.055;

  // Gold owns the large aura silhouette.  Suppressing these small brackets
  // while gilded prevents two rewards from becoming one anonymous bloom;
  // player.js still carries OVERDRIVE's actual chassis/gun heat underneath.
  lastOpacity = gilded ? 0 : (steady + entry * 0.40) * foldGain;
  lastScale = 1 + entry * 0.20 + (safeNotch >= 2 ? breath * 0.035 : 0);
  bracket.visible = lastOpacity > 0.006;
  if (!bracket.visible) return;
  bracket.material.opacity = lastOpacity;
  bracket.scale.setScalar(lastScale);
}

export function powerAuraSnapshot() {
  return {
    mounted: !!bracket,
    visible: !!bracket && bracket.visible,
    notch: previousNotch,
    opacity: +lastOpacity.toFixed(4),
    scale: +lastScale.toFixed(4),
    fixedMeshes: 1,
    procedural: true,
  };
}
