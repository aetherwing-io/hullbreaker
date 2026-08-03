/* ======================== RENDERER / SCENE ======================== */
/* The one renderer, scene, and camera. Every other render module adds meshes
   to this scene; the simulation never sees it.

   The light rig moved to ./lights.js (+ ./lightrig.js for its descriptors and
   arithmetic) when decisions.md entry 18 authorized a real one: a key, a
   fill, a rim, a shadow map fitted to the play band, and exposure. It is
   still exactly one rig, installed from exactly one place — here, one line
   after the scene exists, and before any other module can add a mesh, which
   is what lets it decide what each mesh does with light without reaching
   into a dozen lane-owned files. ?light=flat restores the pre-T-047 rig. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PAL } from './palette.js';
import { installLightRig } from './lights.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });

// Preserve the authored camera scale while buying actual sub-pixel coverage.
// Making every sprite/world unit larger and pulling the camera back by the
// same ratio produces the identical projection and therefore zero extra
// detail.  Rendering that projection above display resolution and letting
// the browser downsample it does sharpen geometry, alpha cutouts and diagonal
// rails without making RIG look any larger against the Meridian.
export function renderPixelRatio(
  dpr = devicePixelRatio,
  width = innerWidth,
  height = innerHeight,
) {
  const compact = Math.min(width, height) < 600;
  const supersample = compact ? 1.10 : 1.25;
  const cap = compact ? 2.20 : 2.25;
  const base = Math.min(Math.max(1, dpr), 2);
  const target = Math.min(Math.max(1, dpr) * supersample, cap);
  // Supersampling is optional detail above the old <=2 DPR policy, so it may
  // spend only a bounded backing-store budget. On an already enormous/retina
  // viewport this naturally falls back to `base` instead of multiplying an
  // 8-12Mpx frame again; it never renders below the previous policy.
  const pixelBudget = compact ? 2_000_000 : 6_600_000;
  const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, width * height));
  return Math.max(base, Math.min(target, budgetRatio));
}

// DPR can change without a reload (dragging between displays, browser zoom,
// phone rotation changing the compact bucket). WebGLRenderer does not follow
// it on its own: setSize() keeps using the ratio captured at boot. Keep the
// one renderer's backing-store policy live, while leaving every authored
// camera/world dimension alone.
export function syncRenderPixelRatio(
  dpr = devicePixelRatio,
  width = innerWidth,
  height = innerHeight,
) {
  const ratio = renderPixelRatio(dpr, width, height);
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
  return ratio;
}

syncRenderPixelRatio();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// Registered before camera.js and post.js listeners. A resize therefore
// updates the backing-store ratio first; their normal size/projection work
// then consumes the new value before the next frame.
addEventListener('resize', () => syncRenderPixelRatio());

export const scene = new THREE.Scene();
// fog matched to background, by construction: both come from the one token
scene.background = new THREE.Color(PAL.bg);
scene.fog = new THREE.Fog(PAL.bg, CONFIG.fog.near, CONFIG.fog.far);

export const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 200);

export const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);   // shared "invisible instance" matrix

installLightRig(renderer, scene);
