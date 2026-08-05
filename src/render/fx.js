/* ================================ FX ============================== */
/* The render half of the baseline feedback pass (T-011): the pools that
   actually draw it. Every addition is fixed-size; combat never constructs
   geometry or grows an array:

     sparks    — impact / death / hurt / pickup machined fragments
     flashes   — jagged muzzle / impact apertures (expanding, fading)
     breaches  — separated face-hugging destruction shutters
     cores     — compact split-hot machinery at a true terminal point
     fragments — wing, hound and machine silhouettes in one shared row pool
     vapor     — sparse rising aftermath, never a smoke disk
     crush     — the pursuing damage plane's warning haze

   WHAT THIS MODULE IS NOT: it decides nothing. `src/render/juice.js` owns
   the event vocabulary (what a kill looks like), `src/pure/juice.js` owns
   the curves, `CONFIG.juice` owns every intensity, and the sim owns the
   only effect with gameplay consequences (hit-stop, `src/sim/time.js`).
   This file is pools + placement.

   Hot-loop rules, inherited from the instanced pools already in
   src/render/bullets.js: every row is preallocated, the per-frame update
   touches numbers only, a full pool DROPS the newest request rather than
   growing, and colors ride instanceColor (one buffer upload per frame,
   only while something is alive).

   Colors come from role names, never literals: this module names roles
   (muzzle, enemyGlow, capsule, …) and resolves them through ONE table,
   whose values are CONFIG.palette's grey-box roles — the colors the rest
   of the game already draws with. Nothing here holds a hex of its own,
   and that table is the single swap point for the render-palette lane
   when it lands. It is deliberately NOT wired to a module that does not
   exist in this branch: a dangling import 404s on every boot and lands a
   console error in every playtest report.

   ?juice=0 (src/mode.js): no geometry, no material, no mesh is built and
   every entry point returns immediately — a disabled boot costs the same
   three.js work as the pre-juice game.

   S10 (directional impact/travel language): the spark pool no longer draws
   a uniform-scaled blob. Each row orients onto and stretches along its own
   live velocity (advance(), below) so a burst carries which way it went.
   The curve is src/pure/juice.js's travelStretch() — assertable without a
   browser — and this module still adds no pool, material, or draw call.  */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PAL } from './palette.js';
import { JUICE_ENABLED } from '../mode.js';
import {
  burstVelocity, clamp01, flashAlpha, particleAlpha, particleScale, travelStretch, warnPulse,
} from '../pure/juice.js';
import { postGain } from './post.js';
import { scene, HIDE } from './scene.js';
import { towerPose } from './tower.js';

const J = CONFIG.juice;

/* ----------------------------- palette ---------------------------- *
 * Role names only, resolved from the render palette module — the same tokens
 * bullets, hostiles and capsules draw with, so an effect can never disagree
 * with the thing it is feedback for. This is the swap point this table was
 * written for: T-010 landed src/render/palette.js, so the six values now come
 * from PAL and no call site below changed. Reading CONFIG.palette here would
 * fail pathcheck's tokenized-render-file guard. */
const ROLE = {
  muzzle: PAL.shots.R,        // warm white: player fire family
  enemyGlow: PAL.wasp,        // hostile ecology
  capsule: PAL.capsule,       // pickup magenta
  modCapsule: PAL.modCapsule, // modifier gold
  warn: PAL.houndTell,        // the roster's one warning amber
  rig: PAL.player,            // RIG's own off-white
};

const HOSTILE_ROLE = {
  wasp: PAL.wasp,
  carrier: PAL.carrier,
  hound: PAL.hound,
  polyp: PAL.polyp,
  mortar: PAL.mortar,
  warden: PAL.warden,
};

export function fxRole(name) { return ROLE[name]; }
export function fxShotColor(type) { return PAL.shots[type] || PAL.shots.R; }
export function fxHostileColor(kind) { return HOSTILE_ROLE[kind] || PAL.wasp; }

/* ------------------------------ pools ----------------------------- */

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
const _vel = { s: 0, y: 0, d: 0 };
// S10 spark stretch scratch: local +x is the axis travelStretch() elongates,
// oriented per-row onto the row's own live velocity (see advance() below).
const _sq = new THREE.Quaternion();
const _sAxisX = new THREE.Vector3(1, 0, 0);
const _sDir = new THREE.Vector3();
const _sScale = new THREE.Vector3();
const _sPos = new THREE.Vector3();
const _ringScale = new THREE.Vector3();
const _flashRot = new THREE.Matrix4();
const _ringRot = new THREE.Matrix4();
const _fragmentRot = new THREE.Quaternion();
const _fragmentQ = new THREE.Quaternion();
const _vaporScale = new THREE.Vector3();
const _vaporRot = new THREE.Matrix4();

const SPARK_MAX = J.pools.particles;
const FLASH_MAX = J.pools.flashes;
const RING_MAX = 24;
const CORE_MAX = J.pools.cores;
const FRAGMENT_MAX = J.pools.fragments;
const VAPOR_MAX = J.pools.vapor;
const D = J.destruction;

// row shape shared by both pools; `ttl <= 0` means free
function makeRow(index) {
  return {
    index, kind: 0,
    t: 0, ttl: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    gravity: 0, size: 0, grow: 0, yaw: 0, spin: 0, roll: 0,
    // Fixed shape multipliers. Flash/core rows use these to turn the same
    // pooled authored glyph into a long punch, a clipped rake, or a crosswise
    // guidance shear. They are numbers on an existing row, not new geometry.
    aspectX: 1, aspectY: 1,
    r: 0, g: 0, b: 0,
  };
}

/* A pool is its fixed rows plus an O(1) free stack: `free[0..top)` holds the
   indices of the dead rows, so a claim is a pop and never a scan of the pool.
   A row enters the stack exactly once, on its live→free transition in
   advance(); resetFx rebuilds the stack wholesale. `cursor` is only used when
   the stack is empty (a saturated pool), where the claim recycles the
   round-robin row — still one step, no scan. */
function makePool(n) {
  const rows = new Array(n);
  const free = new Int32Array(n);
  // claim() pops from the end. Reverse the initial stack so ordinary bursts
  // occupy low contiguous draw slots (0,1,2…) and InstancedMesh.count can be
  // the active high-water mark instead of the full capacity.
  for (let i = 0; i < n; i++) { rows[i] = makeRow(i); free[i] = n - 1 - i; }
  return { rows, free, top: n, cursor: 0, claims: 0, recycles: 0 };
}

let sparks = null, flashes = null, rings = null, cores = null, fragments = null, vapors = null;
let sparkMesh = null, flashMesh = null, ringMesh = null, coreMesh = null;
let fragmentMeshes = null, vaporMesh = null, crushMesh = null, crushMat = null;
let seed = 1;                            // burst-shape seed, bumped per burst
let liveSparks = 0, liveFlashes = 0, liveRings = 0, liveCores = 0;
let liveFragments = 0, liveVapors = 0;
let proofVisible = true;

/* These three silhouettes replace the primitive debug vocabulary this pool
 * originally shipped with (octahedron particles, sphere flashes and a
 * mathematically perfect torus). They are built once at boot, still render
 * through the same three fixed instanced pools, and allocate nothing when a
 * shot or death happens.
 *
 * Local +x is the travel axis for a shard. Four deliberately unequal faces
 * give it a nose, shoulder and torn tail, so velocity stretch reads as metal
 * or shell casing rather than a glowing diamond. */
function machinedShardGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
     0.55,  0.00,  0.00,
    -0.08,  0.22,  0.08,
    -0.08, -0.18,  0.10,
    -0.50,  0.04, -0.06,
  ], 3));
  geo.setIndex([
    0, 1, 2,
    0, 3, 1,
    0, 2, 3,
    1, 3, 2,
  ]);
  geo.computeVertexNormals();
  return geo;
}

// A compact, asymmetric aperture plus disconnected tapered rays. Its broken
// outline remains readable at FAR without becoming the old fuzzy light ball.
function impactFlashGeometry() {
  const positions = [];
  const indices = [];
  const hub = [
    [0.21, 0.02], [0.10, 0.20], [-0.12, 0.17],
    [-0.22, -0.03], [-0.07, -0.19], [0.15, -0.14],
  ];
  positions.push(0, 0, 0);
  for (const p of hub) positions.push(p[0], p[1], 0);
  for (let i = 0; i < hub.length; i++)
    indices.push(0, 1 + i, 1 + ((i + 1) % hub.length));

  // angle, inner radius, outer radius, half-width at the root. Unequal gaps
  // prevent the glyph from resolving into a starburst wheel.
  const rays = [
    [0.02, 0.19, 0.56, 0.055],
    [0.84, 0.23, 0.45, 0.048],
    [1.76, 0.18, 0.62, 0.060],
    [2.70, 0.22, 0.48, 0.052],
    [3.58, 0.19, 0.58, 0.068],
    [4.84, 0.21, 0.50, 0.050],
    [5.56, 0.20, 0.42, 0.043],
  ];
  for (const [angle, inner, outer, half] of rays) {
    const base = positions.length / 3;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tx = -sa * half, ty = ca * half;
    positions.push(
      ca * inner + tx, sa * inner + ty, 0,
      ca * outer, sa * outer, 0,
      ca * inner - tx, sa * inner - ty, 0,
    );
    indices.push(base, base + 1, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

// Five separated trapezoidal iris plates: an opening/breaking mechanism, not
// a complete circle. fxRing keeps its old exported name for callers and
// telemetry compatibility, but no ring geometry exists in this effect pool.
function breachFrontGeometry() {
  const positions = [];
  const indices = [];
  const plates = [
    [0.08, 0.30, 0.53, 0.115, 0.045],
    [1.18, 0.34, 0.48, 0.095, 0.060],
    [2.24, 0.28, 0.51, 0.125, 0.052],
    [3.34, 0.35, 0.55, 0.090, 0.050],
    [4.61, 0.29, 0.49, 0.120, 0.066],
  ];
  for (const [angle, inner, outer, halfInner, halfOuter] of plates) {
    const base = positions.length / 3;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tx = -sa, ty = ca;
    positions.push(
      ca * inner + tx * halfInner, sa * inner + ty * halfInner, 0,
      ca * outer + tx * halfOuter, sa * outer + ty * halfOuter, 0,
      ca * outer - tx * halfOuter, sa * outer - ty * halfOuter, 0,
      ca * inner - tx * halfInner, sa * inner - ty * halfInner, 0,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

// A core rupture is two torn machine halves and two severed bus bars around a
// dark seam. Local +x is aligned to the incoming strike. It opens laterally;
// there is no closed contour that could be mistaken for a collision radius.
function rupturedCoreGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.08, 0.36,0, -0.48, 0.16,0, -0.36,-0.25,0,
    -0.08, 0.36,0, -0.36,-0.25,0, -0.10,-0.12,0,
     0.08, 0.31,0,  0.12,-0.14,0,  0.43,-0.22,0,
     0.08, 0.31,0,  0.43,-0.22,0,  0.50, 0.12,0,
    -0.32, 0.08,0, -0.72, 0.02,0, -0.32,-0.05,0,
     0.30, 0.06,0,  0.74,-0.03,0,  0.30,-0.08,0,
  ], 3));
  return geo;
}

// Three physical debris alphabets. Each is deliberately asymmetric and open:
// wasp vanes flutter as a split membrane, hounds shed one armour scute plus a
// tendon strip, and machinery ejects a bracket and a sheared tooth. They share
// one row pool but retain separate fixed meshes, so role never becomes colour
// alone at the 3–7px FAR silhouette.
function wingFragmentGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
     0.56, 0.00,0, -0.20, 0.25,0, -0.48, 0.06,0,
     0.36,-0.04,0, -0.12,-0.09,0, -0.38,-0.31,0,
  ], 3));
  return geo;
}

function houndFragmentGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
     0.52, 0.04,0,  0.12, 0.26,0, -0.46, 0.15,0,
     0.52, 0.04,0, -0.46, 0.15,0, -0.30,-0.18,0,
     0.28,-0.10,0, -0.10,-0.16,0, -0.50,-0.30,0,
  ], 3));
  return geo;
}

function machineFragmentGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.50,-0.24,0,  0.18,-0.24,0,  0.18,-0.08,0,
    -0.50,-0.24,0,  0.18,-0.08,0, -0.32,-0.08,0,
    -0.50,-0.08,0, -0.32,-0.08,0, -0.32, 0.28,0,
    -0.50,-0.08,0, -0.32, 0.28,0, -0.50, 0.18,0,
     0.28, 0.04,0,  0.54, 0.13,0,  0.31, 0.24,0,
  ], 3));
  return geo;
}

// A pressure wake made from three disconnected tapered streams, weighted
// upward. Scaling stretches their gaps as well as their ink, so aftermath
// dissipates into air instead of becoming a translucent circle or cloud card.
function vaporAftermathGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.34,-0.18,0, -0.18,-0.02,0, -0.24, 0.58,0,
    -0.34,-0.18,0, -0.24, 0.58,0, -0.39, 0.28,0,
    -0.05,-0.24,0,  0.09,-0.02,0,  0.02, 0.74,0,
    -0.05,-0.24,0,  0.02, 0.74,0, -0.11, 0.32,0,
     0.25,-0.17,0,  0.38, 0.03,0,  0.31, 0.50,0,
     0.25,-0.17,0,  0.31, 0.50,0,  0.19, 0.22,0,
  ], 3));
  return geo;
}

// Normal-blended instanced matter needs a real per-row alpha; instanceColor
// carries RGB only. One fixed float attribute per resident row keeps fades
// honest without allocating materials, cards or geometry during combat.
function withInstanceOpacity(geometry, count) {
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  opacity.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceOpacity', opacity);
  return geometry;
}

function installInstanceOpacity(material) {
  material.customProgramCacheKey = () => 'hullbreaker-instance-opacity-v1';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' +
        'attribute float instanceOpacity;\n' +
        'varying float vInstanceOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
        'vInstanceOpacity = instanceOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' +
        'varying float vInstanceOpacity;')
      .replace('#include <alphatest_fragment>',
        'diffuseColor.a *= vInstanceOpacity;\n#include <alphatest_fragment>');
  };
  return material;
}

// The pursuing boundary is a gameplay plane, not a wall in the world.  Its
// old 0.8 x 15 x 2.2 box could fill a cropped screen edge with one continuous
// additive face whenever the camera caught it obliquely.  These disconnected
// chevrons keep the same one-mesh budget and the same full-height warning
// reach, but leave more air than metal at every height.  Local +x points from
// the pursuing edge into the playable route, so every mark says "move".
function crushBoundaryGeometry() {
  const positions = [];
  const indices = [];

  function bar(x0, y0, x1, y1, thickness) {
    const base = positions.length / 3;
    const dx = x1 - x0, dy = y1 - y0;
    const invLength = 1 / Math.max(1e-6, Math.hypot(dx, dy));
    const nx = -dy * invLength * thickness * 0.5;
    const ny = dx * invLength * thickness * 0.5;
    positions.push(
      x0 + nx, y0 + ny, 0,
      x1 + nx, y1 + ny, 0,
      x1 - nx, y1 - ny, 0,
      x0 - nx, y0 - ny, 0,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const count = 8;
  const step = J.crush.height / count;
  const chevronHeight = Math.min(1.08, step * 0.58);
  const halfWidth = J.crush.width * 0.39;
  const thickness = Math.max(0.085, J.crush.width * 0.13);
  for (let i = 0; i < count; i++) {
    // A restrained alternating set-back breaks the UI-perfect ladder while
    // preserving an unmistakable, repeated direction of travel.
    const cx = (i % 2 ? -0.045 : 0.035) * J.crush.width;
    const cy = -J.crush.height * 0.5 + step * (i + 0.5);
    const left = cx - halfWidth;
    const tip = cx + halfWidth;
    bar(left, cy + chevronHeight * 0.5, tip, cy, thickness);
    bar(tip, cy, left, cy - chevronHeight * 0.5, thickness);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

if (JUICE_ENABLED) {
  sparks = makePool(SPARK_MAX);
  flashes = makePool(FLASH_MAX);
  rings = makePool(RING_MAX);
  cores = makePool(CORE_MAX);
  fragments = makePool(FRAGMENT_MAX);
  vapors = makePool(VAPOR_MAX);

  // no `color` here on purpose: the material's default white is the identity
  // that instanceColor multiplies, so the per-row role color IS the color and
  // this module never names one of its own
  const sparkMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // Unlike the flat cards below, a spark is a closed four-face shard. Its rear
  // facets are deliberately visible through the additive shell; forcing the
  // camera-facing single pass removes that small interior glint during live
  // impacts. Keep this one measured exception to the scene-wide single-pass
  // rule so the optimized frame remains pixel-equivalent to shipped art.
  sparkMat.userData.allowTwoPassTransparent = 'closed additive shard facets';
  sparkMesh = new THREE.InstancedMesh(machinedShardGeometry(), sparkMat, SPARK_MAX);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 2;
  // A fixed pool is a capacity ceiling, not permission to submit an empty
  // draw forever. updateFx raises count while any row is live and drops it
  // back to zero once the pool cools, without reallocating the instance data.
  sparkMesh.count = 0;
  sparkMesh.setColorAt(0, _c.setRGB(1, 1, 1));       // allocate instanceColor up front
  for (let i = 0; i < SPARK_MAX; i++) sparkMesh.setMatrixAt(i, HIDE);
  scene.add(sparkMesh);

  const flashMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false,
    // Contact punctuation belongs over the struck painted actor/deck, not
    // under its alpha-tested card. Event ownership already culls bends and
    // hidden facets; disabling the local depth test prevents a full-card
    // actor from erasing the exact collision while renderOrder keeps the
    // optional painted action-atlas free to finish the composite above it.
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  flashMesh = new THREE.InstancedMesh(impactFlashGeometry(), flashMat, FLASH_MAX);
  flashMesh.frustumCulled = false;
  flashMesh.renderOrder = 4.1;
  flashMesh.count = 0;
  flashMesh.setColorAt(0, _c.setRGB(1, 1, 1));
  for (let i = 0; i < FLASH_MAX; i++) flashMesh.setMatrixAt(i, HIDE);
  scene.add(flashMesh);

  // The separated iris plates lie in local XY; facet yaw makes the breach hug
  // the same (s,y) combat plane as its victim. One fixed pool makes a large
  // break read as manufactured shutters ejecting, never a debug radius.
  const ringMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
    forceSinglePass: true,
  });
  ringMesh = new THREE.InstancedMesh(breachFrontGeometry(), ringMat, RING_MAX);
  ringMesh.frustumCulled = false;
  ringMesh.renderOrder = 3;
  ringMesh.count = 0;
  ringMesh.setColorAt(0, _c.setRGB(1, 1, 1));
  for (let i = 0; i < RING_MAX; i++) ringMesh.setMatrixAt(i, HIDE);
  scene.add(ringMesh);

  const coreMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    forceSinglePass: true,
  });
  coreMesh = new THREE.InstancedMesh(rupturedCoreGeometry(), coreMat, CORE_MAX);
  coreMesh.frustumCulled = false;
  coreMesh.renderOrder = 4.2;
  coreMesh.count = 0;
  coreMesh.setColorAt(0, _c.setRGB(1, 1, 1));
  for (let i = 0; i < CORE_MAX; i++) coreMesh.setMatrixAt(i, HIDE);
  scene.add(coreMesh);

  const fragmentMat = installInstanceOpacity(new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.94, fog: true, side: THREE.DoubleSide,
    forceSinglePass: true,
    // Shell, scutes and brackets are matter. Additive blending made every
    // death look like a green/orange energy puff and erased the role shapes
    // against a bright deck. Normal alpha keeps their authored colour/value.
    blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
  }));
  fragmentMeshes = [
    new THREE.InstancedMesh(withInstanceOpacity(wingFragmentGeometry(), FRAGMENT_MAX),
      fragmentMat, FRAGMENT_MAX),
    new THREE.InstancedMesh(withInstanceOpacity(houndFragmentGeometry(), FRAGMENT_MAX),
      fragmentMat, FRAGMENT_MAX),
    new THREE.InstancedMesh(withInstanceOpacity(machineFragmentGeometry(), FRAGMENT_MAX),
      fragmentMat, FRAGMENT_MAX),
  ];
  for (const mesh of fragmentMeshes) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 2.15;
    mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    mesh.count = 0;
    const opacity = mesh.geometry.getAttribute('instanceOpacity');
    for (let i = 0; i < FRAGMENT_MAX; i++) {
      mesh.setMatrixAt(i, HIDE);
      opacity.setX(i, 0);
    }
    opacity.needsUpdate = true;
    scene.add(mesh);
  }

  const vaporMat = installInstanceOpacity(new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.72, fog: true, side: THREE.DoubleSide,
    forceSinglePass: true,
    // After-pressure is a thin stained wake, never a persistent light source.
    blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
  }));
  vaporMesh = new THREE.InstancedMesh(
    withInstanceOpacity(vaporAftermathGeometry(), VAPOR_MAX), vaporMat, VAPOR_MAX);
  vaporMesh.frustumCulled = false;
  vaporMesh.renderOrder = 1.8;
  vaporMesh.count = 0;
  vaporMesh.setColorAt(0, _c.setRGB(1, 1, 1));
  const vaporOpacity = vaporMesh.geometry.getAttribute('instanceOpacity');
  for (let i = 0; i < VAPOR_MAX; i++) {
    vaporMesh.setMatrixAt(i, HIDE);
    vaporOpacity.setX(i, 0);
  }
  vaporOpacity.needsUpdate = true;
  scene.add(vaporMesh);

  // One sparse mechanical boundary marker, still one mesh and one material.
  // It rides the actor/deck surface instead of occupying a deep volume, so an
  // oblique facet or a screen crop can reveal chevrons but never a solid wall.
  crushMat = new THREE.MeshBasicMaterial({
    color: ROLE.warn, transparent: true, opacity: 0, fog: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  crushMesh = new THREE.Mesh(crushBoundaryGeometry(), crushMat);
  crushMesh.name = 'Pursuit boundary hazard chevrons';
  crushMesh.userData.environmentRole = 'crush-warning';
  crushMesh.frustumCulled = false;
  crushMesh.visible = false;
  crushMesh.renderOrder = 1;
  scene.add(crushMesh);
}

/* ---------------------------- spawning ---------------------------- *
 * (s, y) in, world out: a burst is placed through the same towerPose the
 * meshes use, and its velocities are composed onto the local face frame —
 * tangent along the ribbon, world up, and the outward face normal — so a
 * spark thrown "forward" on face 4 goes forward on face 4.             */

function claim(pool) {
  // free row if there is one (pop), otherwise the round-robin one
  // (oldest-ish), so a burst during a firefight replaces stale sparks
  // instead of being dropped. Both branches are O(1) and allocation-free —
  // a saturated pool must not make the spawn path cost more, which is
  // exactly when the frame budget is tightest.
  pool.claims++;
  if (pool.top > 0) return pool.rows[pool.free[--pool.top]];
  pool.recycles++;
  const row = pool.rows[pool.cursor];
  pool.cursor = (pool.cursor + 1) % pool.rows.length;
  return row;
}

// RIG, hostiles and live projectiles all inhabit this outward route plane.
// Effect callers pass only a tiny local bias (0..0.1): treating that value as
// an absolute depth parked debris behind the deck and made real wing/scute
// fragments disappear under the corpse they belonged to.
const FX_SURFACE_DEPTH = 1.15;
function place(row, s, y, depth) {
  const p = towerPose(s, _pose);
  const surfaceDepth = FX_SURFACE_DEPTH + depth;
  row.x = p.x + Math.sin(p.yaw) * surfaceDepth;
  row.y = y + p.alt;
  row.z = p.z + Math.cos(p.yaw) * surfaceDepth;
  return p.yaw;
}

function tint(row, color) {
  _c.set(color);
  row.r = _c.r; row.g = _c.g; row.b = _c.b;
}

/* A particle burst. `spec` is one of CONFIG.juice's effect blocks
   (impact/death/hurt/pickup): count, speed, ms, size, gravity. */
export function fxBurst(spec, s, y, color, scale = 1) {
  if (!JUICE_ENABLED) return;
  const n = Math.max(1, Math.round(spec.count * scale));
  const sd = seed++;
  for (let i = 0; i < n; i++) {
    const row = claim(sparks);
    const yaw = place(row, s, y, 0);
    burstVelocity(sd, i, n, spec.speed * scale, _vel);
    row.vx = Math.cos(yaw) * _vel.s + Math.sin(yaw) * _vel.d;
    row.vy = _vel.y;
    row.vz = -Math.sin(yaw) * _vel.s + Math.cos(yaw) * _vel.d;
    row.gravity = spec.gravity;
    row.t = 0;
    row.ttl = spec.ms;
    row.size = spec.size * scale;
    row.grow = 0;
    row.aspectX = 1; row.aspectY = 1;
    tint(row, color);
  }
}

/* A clean directional fan for muzzle language. Unlike fxBurst's radial debris,
   these rows all leave along the aim with a bounded angular spread. SPREAD can
   therefore announce five lanes before its projectiles separate, while FLAME
   throws a short rake of hot tongues. It still claims the same spark pool. */
export function fxDirectedBurst(spec, s, y, color, dirS, dirY, spreadRad, scale = 1) {
  if (!JUICE_ENABLED) return;
  const n = Math.max(1, Math.round(spec.count * scale));
  const baseAngle = Math.atan2(dirY, dirS);
  for (let i = 0; i < n; i++) {
    const row = claim(sparks);
    const yaw = place(row, s, y, 0);
    const across = n === 1 ? 0 : i / (n - 1) - 0.5;
    const angle = baseAngle + spreadRad * across;
    const speed = spec.speed * scale * (0.82 + 0.18 * ((i + seed) % 3) / 2);
    const localS = Math.cos(angle) * speed;
    row.vx = Math.cos(yaw) * localS;
    row.vy = Math.sin(angle) * speed;
    row.vz = -Math.sin(yaw) * localS + Math.sin((i + seed) * 2.4) * speed * 0.08;
    row.gravity = spec.gravity;
    row.t = 0;
    row.ttl = spec.ms;
    row.size = spec.size * scale;
    row.grow = 0;
    row.aspectX = 1; row.aspectY = 1;
    tint(row, color);
  }
  seed++;
}

// The hot split left at a TRUE terminal point. Unlike fxFlash it has a dark
// central seam and a preferred strike axis; unlike a breach it never expands
// to advertise a radius. The row uses the fixed core pool and the ordinary
// flash lifetime curve.
export function fxCoreRupture(
  s, y, color, dirS, dirY, scale = 1, depth = 0.04, aspect = 1,
) {
  if (!JUICE_ENABLED) return;
  const row = claim(cores);
  row.yaw = place(row, s, y, depth);
  row.vx = Math.atan2(dirY, dirS);
  row.vy = 0; row.vz = 0; row.gravity = 0;
  row.t = 0;
  row.ttl = D.core.ms;
  // The former coefficient reduced an ordinary seam to two hot pixels at the
  // shipped camera. It now begins legible and opens for only 165ms. `aspect`
  // stretches only along the committed strike; the exact sim point remains
  // the centre and no collision reach changes.
  row.size = D.core.size * scale * 0.76;
  row.grow = D.core.size * scale * 0.54;
  row.aspectX = Math.max(0.55, Math.min(3.8, aspect));
  row.aspectY = 1;
  tint(row, color);
}

// One shared row pool, three physical meshes. `role` selects silhouette only;
// velocity remains tied to the incoming shot/body direction supplied by the
// caller. Saturation recycles a fixed row and clears its previous role mesh,
// so an intense chain can never allocate or leave a stale wing in the air.
export function fxRoleFragments(role, s, y, color, dirS, dirY, scale = 1) {
  if (!JUICE_ENABLED) return;
  let kind = 2, spec = D.machine;
  if (role === 'wing') { kind = 0; spec = D.wing; }
  else if (role === 'hound') { kind = 1; spec = D.hound; }
  const n = Math.min(8, Math.max(1, Math.round(spec.count * scale)));
  const baseAngle = Math.atan2(dirY, dirS);
  const burstSeed = seed++;
  for (let i = 0; i < n; i++) {
    const row = claim(fragments);
    for (let m = 0; m < 3; m++) {
      fragmentMeshes[m].setMatrixAt(row.index, HIDE);
      fragmentMeshes[m].geometry.getAttribute('instanceOpacity').setX(row.index, 0);
    }
    const yaw = place(row, s, y, 0.035);
    const across = n === 1 ? 0 : i / (n - 1) - 0.5;
    const jitter = (((i + burstSeed) % 3) - 1) * 0.075;
    const angle = baseAngle + spec.spread * across + jitter;
    const speed = spec.speed * Math.min(1.35, 0.82 + scale * 0.18) *
      (0.84 + 0.08 * ((i + burstSeed) % 3));
    const localS = Math.cos(angle) * speed;
    row.vx = Math.cos(yaw) * localS;
    row.vy = Math.sin(angle) * speed;
    row.vz = -Math.sin(yaw) * localS +
      Math.sin((i + burstSeed) * 1.7) * speed * 0.10;
    row.gravity = spec.gravity;
    row.t = 0;
    row.ttl = spec.ms;
    // Keep the smallest staged armour chip above minification while retaining
    // a strong scale step between a hit and a death plate.
    row.size = spec.size * (0.72 + Math.min(1.55, scale) * 0.90);
    row.grow = 0;
    row.aspectX = 1; row.aspectY = 1;
    row.kind = kind;
    row.roll = ((i + burstSeed) % 7) * 0.61;
    row.spin = (((i + burstSeed) % 5) - 2) * 4.2;
    tint(row, color);
  }
  // A saturated row can change role (wing -> hound, etc.). Upload all three
  // HIDE writes now; advanceFragments only dirties the row's NEW mesh, so
  // deferring this would leave the recycled old silhouette stranded onscreen.
  for (let m = 0; m < 3; m++) {
    fragmentMeshes[m].instanceMatrix.needsUpdate = true;
    fragmentMeshes[m].geometry.getAttribute('instanceOpacity').needsUpdate = true;
  }
}

// One short sparse pressure wake. It rises and opens its internal gaps; there
// is no opaque smoke card, closed cloud outline or collision-sized front.
export function fxVapor(s, y, color, driftS = 0, scale = 1, depth = 0.015) {
  if (!JUICE_ENABLED) return;
  const row = claim(vapors);
  const yaw = place(row, s, y, depth);
  const localS = Math.max(-1, Math.min(1, driftS)) * D.vapor.drift * scale;
  row.vx = Math.cos(yaw) * localS;
  row.vy = D.vapor.rise * (0.86 + (seed % 3) * 0.08) * scale;
  row.vz = -Math.sin(yaw) * localS;
  row.gravity = 0;
  row.t = 0;
  row.ttl = D.vapor.ms;
  row.size = D.vapor.size * Math.min(1.35, scale);
  row.grow = 0;
  row.aspectX = 1; row.aspectY = 1;
  row.yaw = yaw;
  row.roll = ((seed % 7) - 3) * 0.11;
  row.spin = (seed++ & 1 ? 1 : -1) * 0.24;
  tint(row, color);
}

function spawnFlash(ms, fromSize, toSize, s, y, color, depth,
  roll = null, aspectX = 1, aspectY = 1) {
  const row = claim(flashes);
  row.yaw = place(row, s, y, depth);
  // Local roll changes the broken aperture without changing its facet. It is
  // deterministic and stored on the existing row; no random stream or event
  // allocation enters the render layer.
  row.vx = roll === null ? ((seed++ % 17) - 8) * 0.13 : roll;
  row.vy = 0; row.vz = 0; row.gravity = 0;
  row.t = 0;
  row.ttl = ms;
  row.size = fromSize;
  row.grow = toSize - fromSize;
  row.aspectX = Math.max(0.35, Math.min(8, aspectX));
  row.aspectY = Math.max(0.35, Math.min(3, aspectY));
  tint(row, color);
}

/* A flash: instant on, short hold, out. `sizeMult` scales the configured
   size (a spread volley's muzzle flash is the same flash, not five). */
export function fxFlash(ms, size, s, y, color, depth = 0) {
  if (!JUICE_ENABLED) return;
  spawnFlash(ms, size, size * 1.8, s, y, color, depth);
}

/* A rooted directional contact stroke using the existing broken-aperture
 * pool. The short axis is authored in tiles and `length / width` only changes
 * the pooled instance matrix. Every family can own a strong silhouette
 * without adding a material, draw, texture or collision radius. Its centre
 * remains the exact terminal `(s,y)` and never drifts after contact. */
export function fxDirectionalFlash(
  ms, length, width, s, y, color, dirS, dirY, depth = 0.035,
) {
  if (!JUICE_ENABLED) return;
  const safeWidth = Math.max(0.04, width);
  spawnFlash(ms, safeWidth, safeWidth * 1.22, s, y, color, depth,
    Math.atan2(dirY, dirS), Math.max(1, length / safeWidth), 1);
}

// Boss machinery sometimes fails inward. Same aperture, same fixed flash
// pool, inverse scale sentence: it closes onto the core instead of pretending
// another explosion happened. The small positive end avoids a zero matrix.
export function fxImplode(ms, size, s, y, color, depth = 0) {
  if (!JUICE_ENABLED) return;
  spawnFlash(ms, size, size * 0.08, s, y, color, depth);
}

/* A bounded broken-shutter front in the active facet plane. `size` is its
   final diameter in tiles; unlike a flash it leaves the center readable.
   The old name is API compatibility, not a promise of circular geometry. */
export function fxRing(ms, size, s, y, color, depth = 0) {
  if (!JUICE_ENABLED) return;
  const row = claim(rings);
  row.yaw = place(row, s, y, depth);
  row.vx = ((seed++ % 13) - 6) * 0.10;  // initial local shutter orientation
  row.vy = (seed & 1 ? 1 : -1) * 0.30;  // restrained counter-rotation
  row.vz = 0; row.gravity = 0;
  row.t = 0;
  row.ttl = ms;
  row.size = size * 0.28;
  row.grow = size * 0.72;
  tint(row, color);
}

/* The crush warning, driven per frame from the live margin (0 = off). */
export function fxCrush(intensity, sEdge, tMs) {
  if (!JUICE_ENABLED || !crushMesh) return;
  if (intensity <= 0) {
    if (crushMesh.visible) { crushMesh.visible = false; crushMat.opacity = 0; }
    return;
  }
  const C = J.crush;
  // stand the band just INSIDE the plane: centred on the plane itself, half of
  // it hangs off the edge of the frame and the cue is half as readable
  const p = towerPose(sEdge + C.width * C.inset, _pose);
  // Dynamic actors live at route depth 1.15.  Put the warning just proud of
  // that same painted combat surface: deck and hostiles can occlude it, fog
  // can recede it, and it cannot expose a box side during a facet transition.
  const surfaceDepth = 1.16;
  crushMesh.position.set(
    p.x + Math.sin(p.yaw) * surfaceDepth,
    C.y0 + C.height / 2 + p.alt,
    p.z + Math.cos(p.yaw) * surfaceDepth,
  );
  crushMesh.rotation.y = p.yaw;
  crushMesh.visible = true;
  // the pulse rides ON the intensity ramp: it never fully blinks out once the
  // margin is closing, or the frame the player needs it would be the dark one
  crushMat.opacity = C.maxOpacity * intensity * (0.55 + 0.45 * warnPulse(intensity, tMs, C));
}

/* ----------------------------- per frame -------------------------- *
 * dtMs is the JUICE clock's step — src/render/juice.js scales it by the
 * sim's hit-stop, so particles hold still inside a freeze with everything
 * else. Nothing here reads a wall clock of its own.                    */
export function updateFx(dtMs) {
  if (!JUICE_ENABLED) return;
  // T-048 (decisions.md entry 18): one read per frame, not per row. A muzzle
  // flash and an impact burst are light sources; bloom only bleeds what is
  // above its threshold, and these pools draw at exactly their token color,
  // which sits under it. postGain() is 1 whenever the bloom pass is not
  // drawing — ?bloom=0, or a composer that failed to load — so the pools
  // upload the pre-pass colors, unchanged, on those paths.
  const gain = postGain();
  liveSparks = advance(sparks, sparkMesh, dtMs, particleAlpha, false, gain);
  liveFlashes = advance(flashes, flashMesh, dtMs, flashAlpha, true, gain);
  liveRings = advanceRings(dtMs, gain);
  liveCores = advance(cores, coreMesh, dtMs, flashAlpha, true, gain);
  liveFragments = advanceFragments(dtMs, gain);
  liveVapors = advanceVapors(dtMs, gain);
}

function advance(pool, mesh, dtMs, alphaOf, isFlash, gain) {
  let live = 0, drawCount = 0, dirty = false;
  const dt = dtMs / 1000;
  const rows = pool.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.ttl <= 0) continue;
    row.t += dtMs;
    if (row.t >= row.ttl) {
      row.ttl = 0;
      pool.free[pool.top++] = i;         // the one place a row rejoins the stack
      mesh.setMatrixAt(i, HIDE);
      mesh.setColorAt(i, _c.setRGB(0, 0, 0));
      dirty = true;
      continue;
    }
    if (!isFlash) {
      row.vy += row.gravity * dt;
      row.x += row.vx * dt;
      row.y += row.vy * dt;
      row.z += row.vz * dt;
    }
    const u = row.t / row.ttl;
    const a = alphaOf(u);
    const s = isFlash ? particleScale(u, row.size, row.size + row.grow)
                      : row.size * (0.6 + 0.4 * (1 - u));
    if (isFlash) {
      _m.makeRotationY(row.yaw);
      _m.multiply(_flashRot.makeRotationZ(row.vx));
      _m.scale(_sScale.set(s * row.aspectX, s * row.aspectY, s));
      _m.setPosition(row.x, row.y, row.z);
    } else {
      // S10: a mild stretch along the row's OWN current velocity instead of
      // a uniform scale, so a burst reads which way it went at FAR instead
      // of smudging into a uniform blob (pillar 2/5). Recomputed every
      // frame from the live, post-gravity velocity, so the streak's
      // direction and length track the actual arc rather than a spawn-time
      // snapshot, and shrink back toward zero for free as the particle
      // settles. Bounded to one frame of travel (travelStretch, src/pure/
      // juice.js) — never lifetime distance, which would smear a short,
      // fast burst into a rod (see that module's header for the measured
      // 11x case this replaced).
      const speed = Math.hypot(row.vx, row.vy, row.vz);
      if (speed > 1e-4) {
        _sDir.set(row.vx, row.vy, row.vz).multiplyScalar(1 / speed);
        _sq.setFromUnitVectors(_sAxisX, _sDir);
      } else {
        _sq.identity();
      }
      _sScale.set(s + travelStretch(speed), s, s);
      _sPos.set(row.x, row.y, row.z);
      _m.compose(_sPos, _sq, _sScale);
    }
    mesh.setMatrixAt(i, _m);
    // additive blending: fading the COLOR is the fade, and it keeps the whole
    // pool on one material (one draw call) instead of a per-row opacity.
    // `gain` rides the same multiply — free, and it is 1 with the pass off.
    const ag = a * gain;
    mesh.setColorAt(i, _c.setRGB(row.r * ag, row.g * ag, row.b * ag));
    dirty = true;
    live++;
    drawCount = i + 1;
  }
  if (dirty) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.count = drawCount;
  return live;
}

function advanceRings(dtMs, gain) {
  let live = 0, drawCount = 0, dirty = false;
  const rows = rings.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.ttl <= 0) continue;
    row.t += dtMs;
    if (row.t >= row.ttl) {
      row.ttl = 0;
      rings.free[rings.top++] = i;
      ringMesh.setMatrixAt(i, HIDE);
      ringMesh.setColorAt(i, _c.setRGB(0, 0, 0));
      dirty = true;
      continue;
    }
    const u = row.t / row.ttl;
    const a = flashAlpha(u);
    const s = particleScale(u, row.size, row.size + row.grow);
    _m.makeRotationY(row.yaw);
    _m.multiply(_ringRot.makeRotationZ(row.vx + row.vy * u));
    _m.scale(_ringScale.set(s, s, s));
    _m.setPosition(row.x, row.y, row.z);
    ringMesh.setMatrixAt(i, _m);
    const ag = a * gain;
    ringMesh.setColorAt(i, _c.setRGB(row.r * ag, row.g * ag, row.b * ag));
    dirty = true;
    live++;
    drawCount = i + 1;
  }
  if (dirty) {
    ringMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceColor.needsUpdate = true;
  }
  ringMesh.count = drawCount;
  return live;
}

function advanceFragments(dtMs, gain) {
  let live = 0;
  let live0 = 0, live1 = 0, live2 = 0;
  let draw0 = 0, draw1 = 0, draw2 = 0;
  let dirty0 = false, dirty1 = false, dirty2 = false;
  const dt = dtMs / 1000;
  const rows = fragments.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.ttl <= 0) continue;
    const mesh = fragmentMeshes[row.kind];
    const opacity = mesh.geometry.getAttribute('instanceOpacity');
    row.t += dtMs;
    if (row.t >= row.ttl) {
      row.ttl = 0;
      fragments.free[fragments.top++] = i;
      mesh.setMatrixAt(i, HIDE);
      mesh.setColorAt(i, _c.setRGB(0, 0, 0));
      opacity.setX(i, 0);
      if (row.kind === 0) dirty0 = true;
      else if (row.kind === 1) dirty1 = true;
      else dirty2 = true;
      continue;
    }
    row.vy += row.gravity * dt;
    row.x += row.vx * dt;
    row.y += row.vy * dt;
    row.z += row.vz * dt;
    const u = row.t / row.ttl;
    const speed = Math.max(0.0001, Math.hypot(row.vx, row.vy, row.vz));
    _sDir.set(row.vx, row.vy, row.vz).multiplyScalar(1 / speed);
    _sq.setFromUnitVectors(_sAxisX, _sDir);
    _fragmentRot.setFromAxisAngle(_sAxisX, row.roll + row.spin * u);
    _fragmentQ.copy(_sq).multiply(_fragmentRot);
    // Physical wreckage does not shrink out of existence. The fixed instanced
    // alpha attribute carries retirement while bracket/wing/scute keeps mass.
    const s = row.size;
    _sScale.set(s, s, s);
    _sPos.set(row.x, row.y, row.z);
    _m.compose(_sPos, _fragmentQ, _sScale);
    mesh.setMatrixAt(i, _m);
    // Normal-blended matter must not inherit the post-bloom compensation used
    // by hot additive glyphs; doing so turns debris back into emissive confetti.
    const ag = particleAlpha(u);
    mesh.setColorAt(i, _c.setRGB(row.r, row.g, row.b));
    opacity.setX(i, ag);
    if (row.kind === 0) dirty0 = true;
    else if (row.kind === 1) dirty1 = true;
    else dirty2 = true;
    if (row.kind === 0) { live0++; draw0 = i + 1; }
    else if (row.kind === 1) { live1++; draw1 = i + 1; }
    else { live2++; draw2 = i + 1; }
    live++;
  }
  if (dirty0) {
    fragmentMeshes[0].instanceMatrix.needsUpdate = true;
    fragmentMeshes[0].instanceColor.needsUpdate = true;
    fragmentMeshes[0].geometry.getAttribute('instanceOpacity').needsUpdate = true;
  }
  if (dirty1) {
    fragmentMeshes[1].instanceMatrix.needsUpdate = true;
    fragmentMeshes[1].instanceColor.needsUpdate = true;
    fragmentMeshes[1].geometry.getAttribute('instanceOpacity').needsUpdate = true;
  }
  if (dirty2) {
    fragmentMeshes[2].instanceMatrix.needsUpdate = true;
    fragmentMeshes[2].instanceColor.needsUpdate = true;
    fragmentMeshes[2].geometry.getAttribute('instanceOpacity').needsUpdate = true;
  }
  fragmentMeshes[0].count = draw0;
  fragmentMeshes[1].count = draw1;
  fragmentMeshes[2].count = draw2;
  return live;
}

function advanceVapors(dtMs, gain) {
  let live = 0, drawCount = 0, dirty = false;
  const dt = dtMs / 1000;
  const rows = vapors.rows;
  const opacity = vaporMesh.geometry.getAttribute('instanceOpacity');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.ttl <= 0) continue;
    row.t += dtMs;
    if (row.t >= row.ttl) {
      row.ttl = 0;
      vapors.free[vapors.top++] = i;
      vaporMesh.setMatrixAt(i, HIDE);
      vaporMesh.setColorAt(i, _c.setRGB(0, 0, 0));
      opacity.setX(i, 0);
      dirty = true;
      continue;
    }
    row.x += row.vx * dt;
    row.y += row.vy * dt;
    row.z += row.vz * dt;
    const u = row.t / row.ttl;
    // Brief pressure appears quickly, then the disconnected wisps spend most
    // of their life fading. This avoids a long luminous fog layer in crowds.
    const a = Math.min(1, u * 6) * (1 - u) * (1 - u) * D.vapor.opacity;
    _m.makeRotationY(row.yaw);
    _m.multiply(_vaporRot.makeRotationZ(row.roll + row.spin * u));
    _m.scale(_vaporScale.set(
      row.size * (0.70 + u * 0.82),
      row.size * (0.56 + u * 1.34),
      1,
    ));
    _m.setPosition(row.x, row.y, row.z);
    vaporMesh.setMatrixAt(i, _m);
    // Vapor is stained pressure, not a light. Stable RGB plus true instanced
    // alpha fades transparent instead of darkening into a black card.
    vaporMesh.setColorAt(i, _c.setRGB(row.r, row.g, row.b));
    opacity.setX(i, a);
    dirty = true;
    live++;
    drawCount = i + 1;
  }
  if (dirty) {
    vaporMesh.instanceMatrix.needsUpdate = true;
    vaporMesh.instanceColor.needsUpdate = true;
    opacity.needsUpdate = true;
  }
  vaporMesh.count = drawCount;
  return live;
}

/* run reset (resetGame in src/main.js): nothing survives a restart */
export function resetFx() {
  if (!JUICE_ENABLED) return;
  setFxProofVisible(true);
  clearPool(sparks, sparkMesh);
  clearPool(flashes, flashMesh);
  clearPool(rings, ringMesh);
  clearPool(cores, coreMesh);
  clearFragmentPool();
  clearPool(vapors, vaporMesh);
  liveSparks = 0; liveFlashes = 0; liveRings = 0; liveCores = 0;
  liveFragments = 0; liveVapors = 0;
  if (crushMesh) { crushMesh.visible = false; crushMat.opacity = 0; }
}

/* Read-only-capture companion: produce an exact same-frame VFX-on/off pair
 * without replay drift. The action proof toggles only these already-existing
 * pool meshes between two screenshots; simulation, camera, actor/corpse pose,
 * game time and every row remain frozen. Normal runtime never calls this. */
export function setFxProofVisible(visible) {
  if (!JUICE_ENABLED) return;
  proofVisible = !!visible;
  sparkMesh.visible = proofVisible;
  flashMesh.visible = proofVisible;
  ringMesh.visible = proofVisible;
  coreMesh.visible = proofVisible;
  for (let i = 0; i < fragmentMeshes.length; i++)
    fragmentMeshes[i].visible = proofVisible;
  vaporMesh.visible = proofVisible;
}

// every row dead, every index back on the stack, cursor rewound: the free
// stack is rebuilt wholesale here rather than pushed row by row, so a reset
// can never leave a stale or duplicated index behind
function clearPool(pool, mesh) {
  const rows = pool.rows;
  const opacity = mesh.geometry.getAttribute('instanceOpacity');
  for (let i = 0; i < rows.length; i++) {
    rows[i].ttl = 0;
    pool.free[i] = rows.length - 1 - i;
    mesh.setMatrixAt(i, HIDE);
    if (opacity) opacity.setX(i, 0);
  }
  pool.top = rows.length;
  pool.cursor = 0;
  pool.claims = 0;
  pool.recycles = 0;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = 0;
  if (opacity) opacity.needsUpdate = true;
}

function clearFragmentPool() {
  const rows = fragments.rows;
  for (let i = 0; i < rows.length; i++) {
    rows[i].ttl = 0;
    fragments.free[i] = rows.length - 1 - i;
    for (let m = 0; m < 3; m++) {
      fragmentMeshes[m].setMatrixAt(i, HIDE);
      fragmentMeshes[m].geometry.getAttribute('instanceOpacity').setX(i, 0);
    }
  }
  fragments.top = rows.length;
  fragments.cursor = 0;
  fragments.claims = 0;
  fragments.recycles = 0;
  for (let m = 0; m < 3; m++) {
    fragmentMeshes[m].instanceMatrix.needsUpdate = true;
    fragmentMeshes[m].geometry.getAttribute('instanceOpacity').needsUpdate = true;
    fragmentMeshes[m].count = 0;
  }
}

// read-only debug/telemetry surface (see window.HB.juice and ?testapi=1)
export function fxStats() {
  const activeDrawPools = (sparkMesh?.count ? 1 : 0) +
    (flashMesh?.count ? 1 : 0) + (ringMesh?.count ? 1 : 0) +
    (coreMesh?.count ? 1 : 0) + (vaporMesh?.count ? 1 : 0) +
    (fragmentMeshes ? fragmentMeshes.reduce((n, mesh) => n + (mesh.count ? 1 : 0), 0) : 0);
  return {
    sparks: liveSparks, flashes: liveFlashes, rings: liveRings,
    cores: liveCores, fragments: liveFragments, vapor: liveVapors,
    sparkMax: SPARK_MAX, flashMax: FLASH_MAX, ringMax: RING_MAX,
    coreMax: CORE_MAX, fragmentMax: FRAGMENT_MAX, vaporMax: VAPOR_MAX,
    fixedRows: SPARK_MAX + FLASH_MAX + RING_MAX + CORE_MAX + FRAGMENT_MAX + VAPOR_MAX,
    fixedDrawPools: 8,
    activeDrawPools,
    physicalFade: 'fixed-instance-opacity',
    proofVisible,
    recycles: {
      sparks: sparks?.recycles || 0, flashes: flashes?.recycles || 0,
      rings: rings?.recycles || 0, cores: cores?.recycles || 0,
      fragments: fragments?.recycles || 0, vapor: vapors?.recycles || 0,
    },
    crush: crushMat ? clamp01(crushMat.opacity / J.crush.maxOpacity) : 0,
  };
}
