/* ======================== CROWN SUMMIT ============================ */
/* The normal run's final landmark: a static bridge/transmitter complex baked
   onto the last rising face. It has no collision, no sim state, and no view
   bridge. Fixtures skip the module outright and retain their authored worlds.

   The generated alpha plate carries the authored silhouette and signal color;
   overlapping textured shoulder scutes give it physical depth against the
   route. The existing light rig and fog finish the join without a private
   light or render loop. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ACTIVE_FIXTURE } from '../mode.js';
import { normalAscentPitchAt } from '../pure/ascent.js';
import { crownBakePlan } from '../pure/crown.js';
import { scene } from './scene.js';
import { PAL } from './palette.js';
import { applyHullTexture, applySurface } from './materials.js';
import { postGain } from './post.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { towerPose } from './tower.js';

const SUMMIT_PLATE_URL = new URL(
  '../../assets/generated/backdrops/backdrop-crown-summit-v2.png', import.meta.url
).href;
let summitTexture = null;
if (ACTIVE_FIXTURE === null) {
  // backdrop.js already registers this plate on the normal run. Calling the
  // shared gate with the same URL reuses that resident texture; if its layer
  // is disabled, this registration still happens before the same boot budget
  // closes. No fetch or upload can land during play.
  const summitEntry = preloadTexture(SUMMIT_PLATE_URL);
  await awaitPreloads();
  const entry = await summitEntry;
  if (entry.state === 'ready') summitTexture = entry.tex;
}

// The source plate carries a one-pixel opaque pale contour around its alpha
// silhouette. Tinting can make that contour teal, but it still reads as a
// die-cut border at gameplay scale. Build a Crown-only view of the resident
// texture and inset its alpha by exactly one source pixel. The generated file
// and the distant backdrop use remain untouched; failure simply falls back to
// the original resident texture.
function insetSummitAlpha(source) {
  try {
    const image = source?.image;
    if (!image?.width || !image?.height) return source;
    const cv = document.createElement('canvas');
    cv.width = image.width;
    cv.height = image.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0);
    const frame = g.getImageData(0, 0, cv.width, cv.height);
    const px = frame.data;
    const alpha = new Uint8Array(cv.width * cv.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];

    for (let y = 1; y < cv.height - 1; y++) {
      const row = y * cv.width;
      for (let x = 1; x < cv.width - 1; x++) {
        const i = row + x;
        if (alpha[i] === 0) continue;
        if (alpha[i - 1] === 0 || alpha[i + 1] === 0 ||
            alpha[i - cv.width] === 0 || alpha[i + cv.width] === 0)
          px[i * 4 + 3] = 0;
      }
    }
    g.putImageData(frame, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = source.colorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return source;
  }
}

const crownPlateTexture = summitTexture ? insetSummitAlpha(summitTexture) : null;

const UNIT = ACTIVE_FIXTURE === null ? Object.freeze({
  box: new THREE.BoxGeometry(1, 1, 1),
  plate: new THREE.PlaneGeometry(1, 1),
}) : null;

function lit(color, family) {
  return applySurface(new THREE.MeshStandardMaterial({ color, flatShading: true }), family);
}

function hullLit(color, family, bucket) {
  const material = lit(color, family);
  applyHullTexture(material, bucket);
  // applyHullTexture supplies a neutral gain because limb.js carries its hue
  // in instanceColor. Crown meshes are ordinary meshes, so restore their
  // palette role after that neutral gain has been installed.
  if (material.map) material.color.multiply(new THREE.Color(color));
  return material;
}

const CROWN_HAZE_TINT = ACTIVE_FIXTURE === null
  ? new THREE.Color(PAL.vapor).lerp(new THREE.Color(PAL.limbBg), 0.30)
  : null;

const MATERIAL = ACTIVE_FIXTURE === null ? Object.freeze({
  summitPlate: crownPlateTexture ? new THREE.MeshBasicMaterial({
    map: crownPlateTexture,
    // A teal material wash plus real depth fog keep the plate in the scene.
    // The Crown-only texture view above removes its authored pale contour;
    // this cutoff clears only the remaining soft antialias fringe.
    color: CROWN_HAZE_TINT,
    transparent: true,
    opacity: 0.94,
    alphaTest: 0.18,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: true,
  }) : null,
  foundation: hullLit(PAL.limb.wall, 'plate', 'wall'),
  trim: hullLit(PAL.limb.machine, 'machine', 'scute'),
}) : null;

const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };

// Shared landmark coordinates for the finale presentation. The sim only
// decides when the uplink is live; all signal geometry remains render-side.
export const crownSignal = Object.freeze({
  s: CONFIG.levelLength - 11,
  deckY: 3,
  coreY: 11.15,
  depth: -2.28,
  relays: Object.freeze([
    Object.freeze({ ds: -2.22, y: 10.35 }),
    Object.freeze({ ds: 0, y: 12.10 }),
    Object.freeze({ ds: 2.22, y: 10.35 }),
  ]),
});

function place(mesh, p) {
  const at = towerPose(p.s, _pose);
  mesh.position.set(
    at.x + Math.sin(at.yaw) * p.depth,
    p.y + at.alt,
    at.z + Math.cos(at.yaw) * p.depth
  );
  mesh.rotation.order = 'YZX';
  mesh.rotation.y = at.yaw;
  mesh.rotation.z = p.tilt + (p.shape === 'box'
    ? normalAscentPitchAt(p.s, CONFIG.levelLength) : 0);

  if (p.shape === 'plate') mesh.scale.set(p.w, p.h, 1);
  else mesh.scale.set(p.w, p.h, p.d);
}

function buildCrown() {
  const root = new THREE.Group();
  root.name = 'Crown summit bridge and transmitter';
  const plan = crownBakePlan(CONFIG);

  for (const p of plan) {
    const geometry = UNIT[p.shape];
    const material = MATERIAL[p.kind];
    if (!geometry || !material) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Crown ${p.kind}`;
    mesh.userData.crownRole = p.kind;
    mesh.userData.crownS = p.s;
    mesh.frustumCulled = false;
    // Signal light is an effect; structure follows the global shadow policy.
    if (p.kind === 'summitPlate') {
      mesh.userData.shadow = 'none';
      // Backdrop atmosphere is -40. The Crown paints immediately after it:
      // its deeper world placement receives real scene fog, while avoiding a
      // second full veil pass that would turn the landmark into a ghost.
      mesh.renderOrder = -30;
    }
    place(mesh, p);
    root.add(mesh);
  }

  scene.add(root);
  return root;
}

export const crownRoot = ACTIVE_FIXTURE === null ? buildCrown() : null;

const CROWN_WHITE = ACTIVE_FIXTURE === null ? new THREE.Color(0xffffff) : null;
const CROWN_SIGNAL = ACTIVE_FIXTURE === null ? new THREE.Color(PAL.capsule) : null;

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

/* Animate the existing landmark rather than covering it with a second Crown.
   `energy` is the sustained uplink charge, `surge` is a short wave/transmit
   kick, and `recoil` pushes the whole baked structure inward along its own
   facet normal. Every mutation is reversible through resetCrownPresentation. */
export function setCrownPresentation({ energy = 0, surge = 0, recoil = 0 } = {}) {
  if (!crownRoot || !MATERIAL) return;
  const e = clamp01(energy);
  const kick = clamp01(surge);
  const bloom = postGain();

  if (MATERIAL.summitPlate) {
    MATERIAL.summitPlate.color.copy(CROWN_HAZE_TINT)
      .lerp(CROWN_WHITE, Math.min(0.78, e * 0.54 + kick * 0.24));
    MATERIAL.summitPlate.opacity = 0.94 + e * 0.06;
  }

  // The broad shoulders wake softly; the small machine trim carries most of
  // the magenta so the Crown remains architecture, not a glowing decal.
  MATERIAL.foundation.emissive.copy(CROWN_SIGNAL);
  MATERIAL.foundation.emissiveIntensity = bloom * (e * 0.075 + kick * 0.055);
  MATERIAL.trim.emissive.copy(CROWN_SIGNAL);
  MATERIAL.trim.emissiveIntensity = bloom * (e * 0.18 + kick * 0.14);

  const r = Math.max(0, Number(recoil) || 0);
  const at = towerPose(crownSignal.s, _pose);
  crownRoot.position.set(-Math.sin(at.yaw) * r, -r * 0.16, -Math.cos(at.yaw) * r);
}

export function resetCrownPresentation() {
  if (!crownRoot || !MATERIAL) return;
  if (MATERIAL.summitPlate) {
    MATERIAL.summitPlate.color.copy(CROWN_HAZE_TINT);
    MATERIAL.summitPlate.opacity = 0.94;
  }
  MATERIAL.foundation.emissive.setHex(PAL.glowOff);
  MATERIAL.foundation.emissiveIntensity = 1;
  MATERIAL.trim.emissive.setHex(PAL.glowOff);
  MATERIAL.trim.emissiveIntensity = 1;
  crownRoot.position.set(0, 0, 0);
}
