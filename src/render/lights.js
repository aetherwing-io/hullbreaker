/* ======================== LIGHT RIG (three.js) ===================== */
/* The one place that builds light objects, configures tone mapping and
   exposure, and owns the shadow map. ./lightrig.js holds the descriptors and
   the arithmetic; this module is the wiring, and it is the only file in the
   tree that may create a THREE light (the lighting skill's guardrail 1, moved
   here from scene.js when the rig outgrew four lines).

   Installed by ./scene.js immediately after the renderer and scene exist, and
   driven once a frame by ./camera.js's syncCamera(), which already computes
   the unshaken look point and the face heading this rig needs. Nothing else
   calls in.

   SHADOW ENROLLMENT — read this before adding a mesh anywhere.
   Meshes are built in a dozen modules owned by other lanes, so this module
   does not reach into them: it wraps scene.add() and decides from the
   MATERIAL what a new object does with light.

     lit material (Standard/Physical/Lambert/Phong/Toon)      -> receives
     …and opaque (not transparent, depthWrite on, normal blend) -> also casts
     MeshBasicMaterial (bullets, sparks, flashes, beams, lamps,
     capsule faces, mods, rain, vapor, contact quads)         -> neither

   That split is not a heuristic about names: in this codebase the unlit
   MeshBasicMaterial IS the effects layer, so the rule excludes every additive
   and multiplied quad by construction, including ones merged in later. It
   also excludes the hostile bodies from CASTING while they fade in or
   dissolve, because a Standard material with transparent:true and opacity 0
   would still write a full-strength shadow — an enemy's shadow arriving
   before the enemy is a readability lie (pillar 5), so a fading body receives
   light but throws nothing until its lane opts in.

   A module that wants a different answer sets `mesh.userData.shadow` to
   'none' | 'cast' | 'receive' | 'both' before adding it.

   The hook is Object3D.prototype.add rather than scene.add, and that is not
   belt-and-braces: src/render/transform.js adds its band GROUP to the scene
   first and fills it afterwards, so a scene.add-only hook enrolled 5 of 585
   meshes in the transformation slice — a mode-dependent hole that no error
   and no default-run screenshot would have shown. Wrapping add() catches a
   child whenever it arrives, at its own subtree's cost and once per object
   (the memo below), with nothing added to the per-frame path. */

import * as THREE from 'three';
import { CONFIG, LIGHT_RIG } from '../config.js';
import { PAL } from './palette.js';
import {
  ACTIVE_RIG, LIGHT_RIG_ID, lightVector, shadowPolicy, shadowTexelTiles, snapToTexel,
} from './lightrig.js';

const S = LIGHT_RIG.shadow;
// A directional light's position only sets a direction, so any distance works
// for the two that cast nothing; this one just keeps them clear of the world.
const NON_CASTER_DISTANCE = 50;

let keyLight = null;                 // the one shadow caster, if the rig has one
let viewLights = [];                 // [{ desc, light, target }] re-aimed per frame
let installedScene = null;

/* ------------------------- shadow enrollment ----------------------- */

/* The whole three.js half of the policy: a THREE material becomes the plain
   { lit, opaque } descriptor shadowPolicy() (./lightrig.js) decides on. Every
   unlit material in this codebase is an effect, so `lit` is the split that
   separates matter from light without naming a single module. */
function describe(m) {
  if (!m) return null;
  return {
    lit: !!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial ||
      m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial),
    opaque: m.transparent !== true && m.depthWrite !== false &&
      (m.blending === undefined || m.blending === THREE.NormalBlending),
  };
}

// exported for the harness: what a given mesh does with light, as data, so it
// can be read back rather than inferred from a screenshot
export function shadowPolicyFor(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  return shadowPolicy(mats.map(describe), obj.userData && obj.userData.shadow);
}

function enroll(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData.__hbShadowWhy) return;              // decided once, at add time
    const p = shadowPolicyFor(o);
    o.castShadow = p.cast;
    o.receiveShadow = p.receive;
    o.userData.__hbShadowWhy = p.why;
  });
}

/* ---------------------------- installation ------------------------- */

function makeLight(desc) {
  if (desc.type === 'hemisphere') {
    const l = new THREE.HemisphereLight(PAL[desc.sky], PAL[desc.ground], desc.intensity);
    return { light: l, target: null };
  }
  const l = new THREE.DirectionalLight(PAL[desc.color], desc.intensity);
  return { light: l, target: new THREE.Object3D() };
}

export function installLightRig(renderer, scene) {
  installedScene = scene;
  const rig = ACTIVE_RIG;

  // Tone mapping was already ACESFilmic; what entry 18 adds is exposure and
  // an explicit color space. scene.background and fog are drawn RAW (three.js
  // mixes fog after the tone-mapping stage), so exposure moves lit surfaces
  // against the haze and moves nothing else — the lever the audit's
  // "backdrop brighter than the deck" finding actually needs.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = rig.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.shadowMap.enabled = rig.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  for (const desc of rig.lights) {
    const { light, target } = makeLight(desc);
    if (desc.frame === 'world') {
      // target left at the origin: the pre-T-047 rig's aim, verbatim
      light.position.set(desc.worldPosition[0], desc.worldPosition[1], desc.worldPosition[2]);
    }
    if (target) light.target = target;
    if (rig.shadows && desc.casts) {
      light.castShadow = true;
      light.shadow.mapSize.set(S.mapSize, S.mapSize);
      light.shadow.bias = S.bias;
      light.shadow.normalBias = S.normalBias;
      const c = light.shadow.camera;
      c.left = -S.halfWidth; c.right = S.halfWidth;
      c.top = S.halfHeight; c.bottom = -S.halfHeight;
      c.near = S.near; c.far = S.far;
      c.updateProjectionMatrix();
      keyLight = light;
    }
    scene.add(light);
    if (target) scene.add(target);
    if (desc.frame === 'view') viewLights.push({ desc, light, target });
  }

  /* Enrollment is skipped entirely when the rig casts nothing, so ?light=flat
     and ?light=noshadow leave every mesh exactly as its own module built it —
     the escape hatch is the old frame, not a near-miss of it. */
  if (rig.shadows) {
    enroll(scene);
    const add = THREE.Object3D.prototype.add;
    THREE.Object3D.prototype.add = function addAndEnroll(...objects) {
      const out = add.apply(this, objects);
      for (const o of objects) if (o && o.traverse) enroll(o);
      return out;
    };
  }

  // Aim once at install: the first frame is drawn before syncCamera() runs,
  // and a directional light sitting on top of its own target has no direction
  // at all. CONFIG's look point is where the view starts.
  updateLightRig(CONFIG.camera.lookX, CONFIG.camera.lookY, 0, 0);
}

/* ---------------------------- per frame ---------------------------- */

const _dir = { x: 0, y: 0, z: 0 };
const _focus = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _lightDir = new THREE.Vector3();
const _WORLD_UP = new THREE.Vector3(0, 1, 0);

/* Aim the view-framed lights at the play band and slide the shadow frustum
   with it. Called from syncCamera() with the UNSHAKEN look point (so screen
   shake cannot make the shadows jitter) and the face heading the view has
   reached this frame.

   The band is snapped to whole shadow texels along both of the light's own
   axes: without that, a frustum that follows the run makes every shadow edge
   crawl and shimmer as the sample grid slides under static geometry — the
   most visible artifact this rig can produce at FAR, where a deck lip is a
   few pixels tall. */
export function updateLightRig(lookX, lookY, lookZ, yawRad) {
  if (!viewLights.length) return;
  const ahead = S.aheadTiles;
  const tx = Math.cos(yawRad), tz = -Math.sin(yawRad);      // travel = screen right
  _focus.set(lookX + tx * ahead, lookY, lookZ + tz * ahead);

  for (const { desc, light, target } of viewLights) {
    lightVector(desc, yawRad, _dir);
    if (desc.type === 'hemisphere') {
      // a hemisphere light's gradient axis IS its world position vector, so
      // this is a direction, not a place
      light.position.set(_dir.x, _dir.y, _dir.z);
      continue;
    }
    const dist = light === keyLight ? S.distance : NON_CASTER_DISTANCE;
    _lightDir.set(_dir.x, _dir.y, _dir.z);
    _aim.copy(_focus);
    if (light === keyLight && S.snapToTexel) {
      _right.crossVectors(_lightDir, _WORLD_UP).normalize();
      _up.crossVectors(_right, _lightDir).normalize();
      const texelX = shadowTexelTiles(S);
      const texelY = 2 * S.halfHeight / S.mapSize;
      _aim.copy(_lightDir).multiplyScalar(_focus.dot(_lightDir))
        .addScaledVector(_right, snapToTexel(_focus.dot(_right), texelX))
        .addScaledVector(_up, snapToTexel(_focus.dot(_up), texelY));
    }
    target.position.copy(_aim);
    target.updateMatrixWorld();
    light.position.copy(_aim).addScaledVector(_lightDir, dist);
    light.updateMatrixWorld();
  }
}

/* Read surface for the browser smoke test and the capture rig: which rig is
   live, what it is doing, and how many meshes each side of the enrollment
   split landed on. Cheap enough to call from a gate, never from the loop. */
export function lightRigSnapshot() {
  let meshes = 0, casters = 0, receivers = 0;
  if (installedScene) {
    installedScene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      meshes++;
      if (o.castShadow) casters++;
      if (o.receiveShadow) receivers++;
    });
  }
  return {
    id: LIGHT_RIG_ID,
    label: ACTIVE_RIG.label,
    shadows: ACTIVE_RIG.shadows,
    exposure: ACTIVE_RIG.exposure,
    lights: ACTIVE_RIG.lights.length,
    shadowMapSize: ACTIVE_RIG.shadows ? S.mapSize : 0,
    shadowBandTiles: ACTIVE_RIG.shadows ? [2 * S.halfWidth, 2 * S.halfHeight] : [0, 0],
    meshes, casters, receivers,
  };
}
