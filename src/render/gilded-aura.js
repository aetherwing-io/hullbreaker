/* ================== GILDED CHASSIS AURA (render) ================== *
 * The Konami-code reward, as a visual: a chonky golden radiance STACKED
 * behind RIG — one steady breathing halo plus three rings that expand and
 * fade out of phase, so light always seems to be pouring off the chassis.
 *
 * It is presentation only and knows it: this module owns a boolean latch
 * (set from src/main.js when src/pure/konami.js fires), a canvas glow
 * texture, and four meshes. It never imports src/sim state beyond reading
 * nothing at all, writes nothing back, and changes no stat — a placebo
 * chassis the operator may hang a real effect on later.
 *
 * It lives OUTSIDE src/render/player.js on purpose: T-040 freezes that
 * file's construction sites, resident-mesh count, and no-runtime-canvas
 * contract (tools/pathcheck/t-040-rig-sprite.mjs). player.js only mounts
 * this group into its rig, calls syncGildedAura from its own per-frame
 * sync, and reads gildedRigActive() to warm its emissive tint — no meshes
 * or canvases cross the boundary. The gold itself is PAL.gildedGold, an
 * identity token (same value in both palette tables), so this file
 * carries no raw color literals.                                     */

import * as THREE from 'three';
import { PAL } from './palette.js';

const GILDED_RING_MS = 1500;

let gilded = false;
let group = null;
let halo = null;
let rings = [];

export function setGildedRig(on) { gilded = !!on; }
export function gildedRigActive() { return gilded; }
export function gildedAuraVisible() { return !!group && group.visible; }

// Named colors only ('white'/'transparent'): the palette guard forbids
// rgba()/hex literals in tokenized render files, and a white texture
// tinted by material.color is how every other glow in the game does it.
function paintGildedGlow() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'white');
  grad.addColorStop(0.3, 'white');
  grad.addColorStop(1, 'transparent');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/* Mount the stack into RIG's group (called once from player.js after the
   rig is built). Positioned behind the body and the gun so the silhouette
   stays readable on top of its own glow. */
export function mountGildedAura(rigGroup, spriteHeight) {
  if (group) return false;
  const tex = paintGildedGlow();
  const material = () => new THREE.MeshBasicMaterial({
    map: tex, color: PAL.gildedGold, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  group = new THREE.Group();
  halo = new THREE.Mesh(
    new THREE.PlaneGeometry(spriteHeight * 2.1, spriteHeight * 2.1), material());
  group.add(halo);
  rings = [0, 1, 2].map(() => {
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(spriteHeight * 2.6, spriteHeight * 2.6), material());
    group.add(ring);
    return ring;
  });
  group.position.set(0, spriteHeight * 0.5, -0.12);
  group.visible = false;
  rigGroup.add(group);
  return true;
}

/* Per-frame drive, called from player.js's sync with the same gameMs the
   rest of the rig pulses on (the shimmer freezes with hit-stop) and the
   fold occlusion gain, so the aura dims exactly when RIG does. Nothing
   allocates; the whole effect is opacity and uniform scale. */
export function syncGildedAura(gameMs, foldGain) {
  if (!group) return;
  group.visible = gilded && foldGain > 0.01;
  if (!group.visible) return;
  const shimmer = 0.5 + 0.5 * Math.sin(gameMs * 0.0042);
  halo.material.opacity = (0.34 + shimmer * 0.22) * foldGain;
  halo.scale.setScalar(1 + shimmer * 0.1);
  for (let i = 0; i < rings.length; i++) {
    const phase = ((gameMs % GILDED_RING_MS) / GILDED_RING_MS + i / rings.length) % 1;
    const fade = 1 - phase;
    rings[i].material.opacity = fade * fade * 0.5 * foldGain;
    rings[i].scale.setScalar(0.5 + phase * 1.05);
  }
}

/* The shimmer value player.js reuses for its emissive tint, so body glow
   and aura breathe on the same beat. */
export function gildedShimmer(gameMs) {
  return 0.5 + 0.5 * Math.sin(gameMs * 0.0042);
}
