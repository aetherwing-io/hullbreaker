/* ======================== BULLET INSTANCES ======================== */
/* One fixed pool for every letter weapon, addressed by the same slot index
   as bulletPool in src/sim/weapons.js. Simulation still collides a point.
   Presentation gives each weapon a different sentence at actual play scale:

     R  a hex rivet-dart with a split sabot and clipped two-beat tracer
     S  one narrow manufactured flechette with a restrained axial wake
     L  a narrow cyan crystal lance plus three separated corridor segments
     H  a magenta steering dart with a long, visibly bending comet wake
     F  a broad orange wedge and two broken ember/plasma tongues

   The old shared octahedron + spherical halo made all five read as differently
   coloured eggs. Cores now use five low-poly geometries, while the soft layer
   is a tapered plane behind the shot, never an orb. Everything remains fixed
   capacity, instanced, allocation-free in the hot loop, and render-only.

   No companion reaches ahead of the core. `bulletNoseTiles()` still clamps
   the leading edge to the shipped laser nose; every extra tile is shifted
   behind the sim point. Nothing in this module can damage or steer anything. */

import * as THREE from 'three';
import { CONFIG, BULLET_NOSE_CEILING_TILES } from '../config.js';
import { BEND_S, facetAtBends } from '../pure/path.js';
import { TRANSFORM_BEND_S } from '../pure/transform.js';
import { ACTIVE_FIXTURE, IS_TRANSFORM_SLICE, VIEW_ID } from '../mode.js';
import { bulletNoseTiles } from '../pure/juice.js';
import { installView } from '../sim/bridge.js';
import { committedBand } from '../sim/transform.js';
import { BULLET_MAX } from '../sim/weapons.js';
import { cameraFacingFacet } from './camera.js';
import { scene, HIDE } from './scene.js';
import { PROJECTILE_ART, PROJECTILE_ART_SLOT } from './projectile-art.js';
import { towerPose } from './tower.js';
import { PAL } from './palette.js';
import {
  fxCoreRupture, fxDirectedBurst, fxDirectionalFlash, fxFlash,
  fxRoleFragments, fxVapor,
} from './fx.js';
import { routeRenderable } from './route-visibility.js';

/* One painted atlas replaces five generic low-poly cores. It is registered
   with the same boot gate as RIG, hostiles, and the mutation modules: the
   image is resident before the first simulated frame or this file keeps the
   complete geometry path below. `?sprites=0` is the explicit fallback proof.
   Nothing in the simulation can observe which path drew. */
// projectile-art.js is imported early by the composition root. Its frozen
// slot has already joined and settled the one shared preload gate before this
// heavier renderer (fx -> post) is allowed to consume it.
const artSlot = PROJECTILE_ART_SLOT;

const _pp = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };   // shared per-frame pose scratch

const R = CONFIG.rifle.radius;
// Dynamic actors live just proud of the painted hull (RIG and hostile bodies
// both use 1.15). Projectiles previously sat at route depth 0, behind service
// lips and armour panels; at FAR the painted chassis could be depth-culled
// while its additive history segment survived as a white needle. Keep the
// whole projectile sentence on the same combat surface. This is world depth
// only: simulation x/y, hit tests, nose caps and bend ownership are untouched.
const PROJECTILE_SURFACE_DEPTH = 1.15;

// Pullback costs perpendicular pixels much faster than directional length.
// Recover only width at FAR so a rivet remains a rivet instead of becoming a
// long tracer or a bloated orb. Rolled glyph stations share the same gain;
// wake and history widths deliberately do not, keeping chassis identity above
// additive streak brightness.
const PROJECTILE_WIDTH_GAIN = VIEW_ID === 'far' ? 1.24 : (VIEW_ID === 'mid' ? 1.10 : 1);
// Dispatch follows the weapon table rather than a five-letter switch. A future
// procedural/stacked shot gets a safe rifle-form fallback until it supplies a
// visual row; the renderer does not need another branch in its hot loop.
const WEAPON_TYPES = Object.keys(CONFIG.weapons);
const coreMaterial = new THREE.MeshBasicMaterial({
  // Opaque cores retain their hue against the rust deck. Bloom and additive
  // energy belong to the wake plane/trails, never to the identity silhouette.
  color: 0xffffff, fog: false, depthWrite: false,
});

// Every geometry spans local -R…+R on x, so the same scale/anchor arithmetic
// gives it an exact, clamped leading edge. Cross-sections differ deliberately.
const CORE_GEO = {
  R: new THREE.ConeGeometry(R * 0.30, R * 2, 6, 1, false),
  S: new THREE.ConeGeometry(R * 0.42, R * 2, 3, 1, false),
  L: new THREE.CylinderGeometry(R * 0.17, R * 0.17, R * 2, 4, 1, false),
  H: new THREE.ConeGeometry(R * 0.55, R * 2, 4, 1, false),
  F: new THREE.ConeGeometry(R * 1.02, R * 2, 3, 1, false),
};
for (const type of ['R', 'S', 'L', 'H', 'F']) CORE_GEO[type].rotateZ(-Math.PI / 2);

const coreMeshes = {};
for (const type of WEAPON_TYPES) {
  const mesh = new THREE.InstancedMesh(CORE_GEO[type] || CORE_GEO.R, coreMaterial, BULLET_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  coreMeshes[type] = mesh;
}
const coreMeshList = WEAPON_TYPES.map((type) => coreMeshes[type]);

// Production chassis. UVs select one fixed atlas cell in geometry rather
// than by mutating the shared texture transform: all five weapon types can be
// alive in the same frame while still sharing one image, one GPU texture, and
// one material. Equal transparent gutters protect the mip chain at true play
// scale. Every painted nose is positioned from the same clamped `front` value
// used by the fallback below, so richer art never advertises extra collision.
const ART_CELL_OCCUPANCY = 230 / 256;
const ART_LOOK = Object.freeze({
  // Actual FAR-view review put the first atlas pass at only 3-6 pixels of
  // painted ink. Grow chiefly backward (unlimited cosmetic history) and in
  // thickness; frontCap remains the collision-honesty authority. The five
  // bodies now occupy roughly 6-11 pixels of distinct silhouette without
  // moving a hit, speed, or point-collision edge.
  R: Object.freeze({ frontCap: Infinity, tail: 0.70, thickness: 1.18 }),
  // Scatterbloom fires five independent sim pellets, so each slot must read
  // as ONE piece of ammunition. The replacement alpha is 4.34:1; 0.90 at
  // FAR's width gain resolves to about 16x4 display pixels instead of the old
  // fan's enemy-like winged silhouette. Length stays unchanged and collision
  // remains the point/nose contract below.
  S: Object.freeze({ frontCap: Infinity, tail: 0.55, thickness: 0.90 }),
  L: Object.freeze({ frontCap: 0.80, tail: 1.10, thickness: 0.82 }),
  // H/F source cells are naturally the tallest in the atlas. Their former
  // near-square projection resolved into a magenta/orange orb at FAR; retain
  // all painted fins/jaws but present them as directional 12px machines.
  H: Object.freeze({ frontCap: Infinity, tail: 1.02, thickness: 0.64 }),
  F: Object.freeze({ frontCap: Infinity, tail: 1.05, thickness: 0.68 }),
});

function projectileArtGeometry(column) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const u0 = column / PROJECTILE_ART.order.length;
  const u1 = (column + 1) / PROJECTILE_ART.order.length;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), uv.getY(i));
  uv.needsUpdate = true;
  return geo;
}

const artMeshes = {};
let artMaterial = null;
if (artSlot.state === 'ready' && artSlot.tex) {
  artMaterial = new THREE.MeshBasicMaterial({
    map: artSlot.tex,
    transparent: true,
    alphaTest: 0.025,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  for (let column = 0; column < PROJECTILE_ART.order.length; column++) {
    const type = PROJECTILE_ART.order[column];
    const mesh = new THREE.InstancedMesh(
      projectileArtGeometry(column), artMaterial, BULLET_MAX,
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 3.5;
    scene.add(mesh);
    artMeshes[type] = mesh;
  }
}
const artMeshList = Object.values(artMeshes);
const groundArtMesh = artMeshes.G || null;

// A dark hard-silhouette pass makes each tiny chassis hold its shape against
// both the ivory deck and teal sky. It reuses the exact core geometry and a
// slightly wider matrix, so the outline cannot invent reach beyond the
// already-clamped projectile nose. Five fixed low-poly pools cost no runtime
// allocation and remain cheaper than per-shot outline materials/clones.
const shellMaterial = new THREE.MeshBasicMaterial({
  color: PAL.capsuleInk, fog: false, transparent: true, opacity: 0.92,
  depthWrite: false, toneMapped: false,
});
const shellMeshes = {};
for (const type of WEAPON_TYPES) {
  const mesh = new THREE.InstancedMesh(CORE_GEO[type] || CORE_GEO.R,
    shellMaterial, BULLET_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2.75;
  scene.add(mesh);
  shellMeshes[type] = mesh;
}
if (groundArtMesh)
  for (let i = 0; i < BULLET_MAX; i++) groundArtMesh.setMatrixAt(i, HIDE);
const shellMeshList = WEAPON_TYPES.map((type) => shellMeshes[type]);

// The warm impact jewel occupies only the frontmost portion of the sanctioned
// visual nose. It is the same fixed pool for every chassis: aim remains clear
// even when rolled traits recolour the body into a complicated relic.
const tipMesh = new THREE.InstancedMesh(
  new THREE.OctahedronGeometry(1, 0),
  new THREE.MeshBasicMaterial({
    color: PAL.muzzle, fog: false, depthWrite: false, toneMapped: false,
  }),
  BULLET_MAX,
);
tipMesh.frustumCulled = false;
tipMesh.renderOrder = 4;
scene.add(tipMesh);

/* All distances below are presentation tiles. `front` is a fraction/cap of
   the clamped bulletNoseTiles result; `tail` may extend backward freely.
   History count/fill make a hard tracer, an interrupted lance, a curved comet,
   and broken flame tongues from the same one instanced segment pool. */
const LOOK = {
  R: { front: 1.00, frontCap: Infinity, tail: 0.38, wake: 0.16, wakeW: 0.050,
       trail: 0.026, segments: 2, fill: 0.72, gain: 0.58 },
  S: { front: 0.82, frontCap: 0.36, tail: 0.16, wake: 0.05, wakeW: 0.040,
       trail: 0.016, segments: 1, fill: 0.42, gain: 0.28 },
  L: { front: 1.00, frontCap: Infinity, tail: 1.28, wake: 0.36, wakeW: 0.075,
       trail: 0.052, segments: 3, fill: 0.80, gain: 0.82 },
  H: { front: 0.90, frontCap: 0.36, tail: 0.48, wake: 0.34, wakeW: 0.140,
       trail: 0.075, segments: 3, fill: 0.90, gain: 0.70 },
  F: { front: 0.95, frontCap: 0.42, tail: 0.46, wake: 0.48, wakeW: 0.235,
       trail: 0.140, segments: 2, fill: 0.68, gain: 0.78,
       coreColor: PAL.muzzle },
};

// A pointed, asymmetric ribbon in local XY. Its white vertex colour is only
// an alpha silhouette; per-shot identity remains instanceColor.
const wakeGeo = new THREE.BufferGeometry();
wakeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.50,  0.00, 0,
  -0.30,  0.50, 0,
   0.50,  0.15, 0,
   0.50, -0.15, 0,
  -0.30, -0.50, 0,
], 3));
wakeGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
wakeGeo.computeVertexNormals();
const wakeMesh = new THREE.InstancedMesh(
  wakeGeo,
  new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.30, fog: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  }),
  BULLET_MAX,
);
wakeMesh.frustumCulled = false;
wakeMesh.renderOrder = 2;
scene.add(wakeMesh);

// Cindermouth has two authored bodies, not one shell that mysteriously slides.
// The airborne atlas chassis ends at deckIgnited(); after that, two fixed
// instanced flame tongues live wholly BEHIND the simulation point.  A jagged
// top and flat licking foot make this read as low ground fire at FAR/portrait,
// while the warm inner tongue separates it from an orange rigid projectile.
function groundTongueGeometry(core = false) {
  const geo = new THREE.BufferGeometry();
  // Three separated teeth retain one-pixel negative gaps at FAR instead of
  // minifying a continuous flame outline into a generic mound. The compact
  // inner temperature row is independently authored, so it cannot overpaint
  // the entire orange silhouette back to a single bright shape.
  const tongues = core ? [
    [-0.91, -0.17, -0.75, -0.17, -0.82, 0.00],
    [-0.58, -0.17, -0.40, -0.17, -0.49, 0.22],
    [-0.23, -0.17, -0.05, -0.17, -0.13, 0.08],
  ] : [
    [-1.00, -0.23, -0.70, -0.23, -0.82, 0.08],
    [-0.66, -0.23, -0.33, -0.23, -0.49, 0.42],
    [-0.30, -0.23,  0.00, -0.23, -0.13, 0.22],
  ];
  const v = [];
  for (const t of tongues)
    v.push(t[0],t[1],0, t[2],t[3],0, t[4],t[5],0);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

const groundTongueGeo = groundTongueGeometry();
const groundCoreTongueGeo = groundTongueGeometry(true);
const groundFireMesh = new THREE.InstancedMesh(
  groundTongueGeo,
  new THREE.MeshBasicMaterial({
    // Persistent ground fire is hot material, not a permanent muzzle flash.
    // Normal blending preserves the orange saw-tooth silhouette against both
    // pale deck lips and dark hull recesses; additive orange + additive white
    // previously clipped into the same anonymous white diamond that the rigid
    // sliding projectile had been replaced to eliminate.
    color: PAL.shots.F, transparent: true, opacity: 0.90, fog: false,
    side: THREE.DoubleSide, blending: THREE.NormalBlending, depthWrite: false,
  }),
  BULLET_MAX,
);
const groundFireCoreMesh = new THREE.InstancedMesh(
  groundCoreTongueGeo,
  new THREE.MeshBasicMaterial({
    // Amber stays inside the same established shot palette while retaining a
    // readable temperature step. White belongs to the 82 ms ignition beat;
    // keeping the crawler white made every later frame look like impact bloom.
    color: PAL.shots.S, transparent: true, opacity: 0.86, fog: false,
    side: THREE.DoubleSide, blending: THREE.NormalBlending, depthWrite: false,
  }),
  BULLET_MAX,
);
for (const mesh of [groundFireMesh, groundFireCoreMesh]) {
  mesh.frustumCulled = false;
  mesh.renderOrder = mesh === groundFireCoreMesh ? 4.1 : 3.9;
  scene.add(mesh);
}

// Four remembered points make three segments. This is one instanced draw,
// fixed for the life of the page; a saturated bullet pool allocates nothing.
const TRAIL_POINTS = 4;
const TRAIL_SEGMENTS = TRAIL_POINTS - 1;
const TRAIL_MAX = BULLET_MAX * TRAIL_SEGMENTS;
const TRAIL_FADE = [0.72, 0.42, 0.20];
const trailMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 0.055),
  new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.68, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }),
  TRAIL_MAX
);
trailMesh.frustumCulled = false;
trailMesh.renderOrder = 2;
scene.add(trailMesh);

/* --------------------- rolled-trait signatures --------------------- *
 * One fixed instanced glyph pool per trait. The shapes sit behind the sim
 * point and stay small: they annotate a projectile instead of replacing its
 * chassis silhouette. Every pool is allocated once here; the hot loop only
 * writes matrices, including HIDE for traits this recipe does not carry.
 *
 *   RAPID    paired white exhaust chevrons
 *   HEAVY    dense amber impact collar
 *   FORKED   magenta split-tail fork
 *   SEEKER   opposed purple acquisition brackets
 *   PHASE    cyan broken afterimage rails
 *   VOLATILE orange hex blast chamber
 */
function flatGlyph(positions) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// Chassis hardware is separate from rolled traits. A plain R still deserves
// to look like a manufactured weapon, and H must read as a steering machine
// before SEEKER ever rolls onto it. These are small filled silhouettes—not
// hairline decoration—so both survive the portrait viewport.
const CHASSIS_GEO = {
  R: flatGlyph([
    -0.52,-0.12,0,  0.18,-0.12,0, -0.24,-0.48,0,
    -0.52, 0.12,0, -0.24, 0.48,0,  0.18, 0.12,0,
    -0.18,-0.10,0,  0.50,-0.10,0,  0.50, 0.10,0,
    -0.18,-0.10,0,  0.50, 0.10,0, -0.18, 0.10,0,
  ]),
  H: flatGlyph([
    -0.50,-0.46,0,  0.18,-0.10,0, -0.18,-0.08,0,
    -0.50, 0.46,0, -0.18, 0.08,0,  0.18, 0.10,0,
    -0.20,-0.09,0,  0.50,-0.09,0,  0.50, 0.09,0,
    -0.20,-0.09,0,  0.50, 0.09,0, -0.20, 0.09,0,
  ]),
};
const CHASSIS_LOOK = {
  R: { back: 0.58, sx: 0.58, sy: 0.25, color: PAL.modCapsule },
  H: { back: 0.64, sx: 0.66, sy: 0.38, color: PAL.muzzle },
};
const chassisMeshes = {};
for (const type of Object.keys(CHASSIS_GEO)) {
  const mesh = new THREE.InstancedMesh(
    CHASSIS_GEO[type],
    new THREE.MeshBasicMaterial({
      color: CHASSIS_LOOK[type].color, transparent: true, opacity: 0.92,
      fog: false, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }),
    BULLET_MAX,
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 3.25;
  scene.add(mesh);
  chassisMeshes[type] = mesh;
}
const chassisMeshList = Object.values(chassisMeshes);

const TRAIT_GEO = {
  rapid: flatGlyph([
    -0.50,-0.48,0, -0.12,0,0, -0.50,0.48,0,
     0.02,-0.48,0,  0.40,0,0,  0.02,0.48,0,
  ]),
  // HEAVY is a pair of long armour scutes around the chassis. Rings became a
  // circular blob at play scale; these broad clipped plates read as mass and
  // direction with only horizontal, vertical and 45-degree contour changes.
  heavy: flatGlyph([
    -0.50,-0.34,0,  0.18,-0.34,0,  0.50,-0.12,0,
    -0.50,-0.34,0,  0.50,-0.12,0, -0.18,-0.12,0,
    -0.50, 0.12,0,  0.50, 0.12,0,  0.18, 0.34,0,
    -0.50, 0.12,0,  0.18, 0.34,0, -0.50, 0.34,0,
  ]),
  forked: flatGlyph([
     0.50,-0.07,0, -0.06,-0.07,0, -0.50,-0.42,0,
     0.50,-0.07,0, -0.50,-0.42,0, -0.34,-0.18,0,
     0.50, 0.07,0, -0.34, 0.18,0, -0.50, 0.42,0,
     0.50, 0.07,0, -0.50, 0.42,0, -0.06, 0.07,0,
    -0.18,-0.10,0,  0.50,-0.10,0,  0.50, 0.10,0,
    -0.18,-0.10,0,  0.50, 0.10,0, -0.18, 0.10,0,
  ]),
  // Two diagonally opposed acquisition brackets. Four corners still closed
  // into a magenta oval around a stacked Hunger at true MID scale; one upper
  // rear L and one lower forward L leave more than half the chassis open on
  // both axes, so even two stack stations remain steering fins, never a ring.
  seeker: flatGlyph([
    // upper-rear L
    -0.50, 0.48,0, -0.10, 0.48,0, -0.10, 0.34,0,
    -0.50, 0.48,0, -0.10, 0.34,0, -0.50, 0.34,0,
    -0.50, 0.34,0, -0.38, 0.34,0, -0.38, 0.08,0,
    -0.50, 0.34,0, -0.38, 0.08,0, -0.50, 0.08,0,
    // lower-forward L
     0.10,-0.48,0,  0.50,-0.48,0,  0.50,-0.34,0,
     0.10,-0.48,0,  0.50,-0.34,0,  0.10,-0.34,0,
     0.38,-0.34,0,  0.50,-0.34,0,  0.50,-0.08,0,
     0.38,-0.34,0,  0.50,-0.08,0,  0.38,-0.08,0,
  ]),
  phase: flatGlyph([
    -0.50,-0.34,0,  0.04,-0.34,0,  0.04,-0.20,0,
    -0.50,-0.34,0,  0.04,-0.20,0, -0.50,-0.20,0,
     0.18,-0.20,0,  0.50,-0.20,0,  0.50,-0.06,0,
     0.18,-0.20,0,  0.50,-0.06,0,  0.18,-0.06,0,
    -0.50, 0.20,0,  0.04, 0.20,0,  0.04, 0.34,0,
    -0.50, 0.20,0,  0.04, 0.34,0, -0.50, 0.34,0,
     0.18, 0.06,0,  0.50, 0.06,0,  0.50, 0.20,0,
     0.18, 0.06,0,  0.50, 0.20,0,  0.18, 0.20,0,
    -0.16,-0.11,0,  0.24,-0.11,0,  0.40, 0.00,0,
    -0.16,-0.11,0,  0.40, 0.00,0, -0.16, 0.11,0,
  ]),
  // Broken furnace jaws, never a hex-ring badge. The gap leaves the atlas's
  // ember visible while the teeth make a volatile stack physically fiercer.
  volatile: flatGlyph([
    -0.50, 0.34,0, -0.18, 0.34,0, -0.34, 0.10,0,
    -0.10, 0.34,0,  0.22, 0.34,0,  0.06, 0.08,0,
     0.18, 0.34,0,  0.50, 0.34,0,  0.34, 0.10,0,
    -0.50,-0.34,0, -0.34,-0.10,0, -0.18,-0.34,0,
    -0.10,-0.34,0,  0.06,-0.08,0,  0.22,-0.34,0,
     0.18,-0.34,0,  0.34,-0.10,0,  0.50,-0.34,0,
  ]),
};
const TRAIT_STYLE = {
  rapid:   { color: PAL.muzzle, opacity: 0.78 },
  heavy:   { color: PAL.modCapsule, opacity: 0.92 },
  forked:  { color: PAL.capsule, opacity: 0.86 },
  seeker:  { color: PAL.capsule, opacity: 0.88 },
  phase:   { color: PAL.shots.L, opacity: 0.88 },
  volatile:{ color: PAL.shots.F, opacity: 0.90 },
};
const TRAIT_KEYS = Object.keys(TRAIT_GEO);
const traitMeshes = {};
for (const key of TRAIT_KEYS) {
  const style = TRAIT_STYLE[key];
  const mesh = new THREE.InstancedMesh(
    TRAIT_GEO[key],
    new THREE.MeshBasicMaterial({
      color: style.color, transparent: true, opacity: style.opacity,
      // Normal blending keeps stacked glyph colours saturated. Six additive
      // marks on top of one another clipped to white and erased the recipe.
      fog: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
      depthWrite: false, toneMapped: false,
      // Only PHASE's broken rails ignore the depth buffer. The projectile
      // chassis, wake and history trail still disappear behind the hull, so
      // crossing a solid reads as a cyan phased echo rather than every shot
      // becoming an x-ray collision claim.
      depthTest: key !== 'phase',
    }),
    BULLET_MAX,
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = key === 'phase' ? 8 : (key === 'heavy' ? 3 : 2);
  scene.add(mesh);
  traitMeshes[key] = mesh;
}
const traitMeshList = TRAIT_KEYS.map((key) => traitMeshes[key]);

// Tier-two/three rolls earn a second physical station, not merely a larger
// icon: double armour collars, trailing fork vanes, acquisition brackets,
// phased echoes and armed blast chambers. One secondary pool per trait keeps
// stack readability deterministic and bounded even at BULLET_MAX saturation.
const stackMeshes = {};
for (const key of TRAIT_KEYS) {
  const style = TRAIT_STYLE[key];
  const mesh = new THREE.InstancedMesh(
    TRAIT_GEO[key],
    new THREE.MeshBasicMaterial({
      color: style.color, transparent: true, opacity: style.opacity * 0.58,
      fog: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
      depthWrite: false, toneMapped: false, depthTest: key !== 'phase',
    }),
    BULLET_MAX,
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = key === 'phase' ? 7.5 : 1.9;
  scene.add(mesh);
  stackMeshes[key] = mesh;
}
const stackMeshList = TRAIT_KEYS.map((key) => stackMeshes[key]);

const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _be = new THREE.Euler();
const _bs = new THREE.Vector3();
const _bv = new THREE.Vector3();
const _corePos = new THREE.Vector3();
const _shellScale = new THREE.Vector3();
const _artPos = new THREE.Vector3();
const _artScale = new THREE.Vector3();
const _tipPos = new THREE.Vector3();
const _tipScale = new THREE.Vector3();
const _wakePos = new THREE.Vector3();
const _wakeScale = new THREE.Vector3();
const _flight = new THREE.Vector3();
const _trailDir = new THREE.Vector3();
const _trailMid = new THREE.Vector3();
const _trailScale = new THREE.Vector3();
const _traitPos = new THREE.Vector3();
const _traitScale = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _trailQ = new THREE.Quaternion();
const _shotColor = new THREE.Color();
const _traitColor = new THREE.Color();
for (const type of WEAPON_TYPES) {
  coreMeshes[type].setColorAt(0, _shotColor.setHex(0xffffff));
  for (let i = 0; i < BULLET_MAX; i++) {
    coreMeshes[type].setMatrixAt(i, HIDE);
    shellMeshes[type].setMatrixAt(i, HIDE);
    if (artMeshes[type]) artMeshes[type].setMatrixAt(i, HIDE);
  }
}
for (let i = 0; i < BULLET_MAX; i++) tipMesh.setMatrixAt(i, HIDE);
for (let i = 0; i < BULLET_MAX; i++) {
  groundFireMesh.setMatrixAt(i, HIDE);
  groundFireCoreMesh.setMatrixAt(i, HIDE);
}
wakeMesh.setColorAt(0, _shotColor.setHex(0xffffff));
for (let i = 0; i < BULLET_MAX; i++) wakeMesh.setMatrixAt(i, HIDE);
trailMesh.setColorAt(0, _shotColor.setHex(0xffffff));
for (let i = 0; i < TRAIL_MAX; i++) trailMesh.setMatrixAt(i, HIDE);
for (const mesh of traitMeshList)
  for (let i = 0; i < BULLET_MAX; i++) mesh.setMatrixAt(i, HIDE);
for (const mesh of stackMeshList)
  for (let i = 0; i < BULLET_MAX; i++) mesh.setMatrixAt(i, HIDE);
for (const mesh of chassisMeshList)
  for (let i = 0; i < BULLET_MAX; i++) mesh.setMatrixAt(i, HIDE);
const slotType = new Array(BULLET_MAX).fill('');         // gate color uploads on change
const slotVisible = new Uint8Array(BULLET_MAX);
const slotFacetHidden = new Uint8Array(BULLET_MAX);
const slotMeta = new Array(BULLET_MAX).fill(null);
const terminalImpactCounts = { R: 0, S: 0, L: 0, H: 0, F: 0 };
const terminalReasonCounts = {
  hostile: 0, terrain: 0, lifetime: 0, bend: 0, pool: 0, reset: 0,
};
const LIFETIME_SPUTTER = Object.freeze({
  count: 1, speed: 2.2, ms: 120, size: 0.10, gravity: -6,
});
// Mutated in place so the hot path never allocates merely to make diagnostics
// observable. The debug snapshot is the cold path and may copy it outward.
const lastEndpoint = { reason: 'none', effect: 'none', s: 0, y: 0, type: '' };
const lastIgnition = { reason: 'none', s: 0, surfaceY: 0, kind: '' };
let ignitionCount = 0;
const historyCount = new Uint8Array(BULLET_MAX);
const historyX = new Float32Array(BULLET_MAX * TRAIL_POINTS);
const historyY = new Float32Array(BULLET_MAX * TRAIL_POINTS);
const historyZ = new Float32Array(BULLET_MAX * TRAIL_POINTS);

function trailIndex(slot, segment) { return slot * TRAIL_SEGMENTS + segment; }
function pointIndex(slot, point) { return slot * TRAIL_POINTS + point; }

function slotSpawned(i, type, meta = null) {
  historyCount[i] = 0;
  if (groundArtMesh) groundArtMesh.setMatrixAt(i, HIDE);
  groundFireMesh.setMatrixAt(i, HIDE);
  groundFireCoreMesh.setMatrixAt(i, HIDE);
  const visualType = coreMeshes[type] ? type : 'R';
  const look = LOOK[type] || LOOK.R;
  const color = PAL.shots[type] || PAL.shots.R;
  const tier = meta ? meta.tier : 0;
  const rapid = meta ? meta.rapid : 0;
  const heavy = meta ? meta.heavy : 0;
  const forked = meta ? meta.forked : 0;
  const seeker = meta ? meta.seeker : 0;
  const phase = meta ? meta.phase : 0;
  const volatile = meta ? meta.volatile : 0;
  if (slotVisible[i] && coreMeshes[slotType[i]]) {
    coreMeshes[slotType[i]].setMatrixAt(i, HIDE);
    shellMeshes[slotType[i]].setMatrixAt(i, HIDE);
    if (artMeshes[slotType[i]]) artMeshes[slotType[i]].setMatrixAt(i, HIDE);
    if (chassisMeshes[slotType[i]]) chassisMeshes[slotType[i]].setMatrixAt(i, HIDE);
  }
  slotType[i] = visualType;
  slotMeta[i] = meta;
  slotVisible[i] = 1;
  slotFacetHidden[i] = 0;
  _shotColor.setHex(look.coreColor || color);
  // Traits tint toward their own stable colour role rather than toward white.
  // The chassis remains underneath, but a stacked recipe can now be read with
  // the pickup card hidden and without additive bloom erasing every hue.
  if (rapid) _shotColor.lerp(_traitColor.setHex(PAL.muzzle), Math.min(0.20, rapid * 0.07));
  if (heavy) _shotColor.lerp(_traitColor.setHex(PAL.modCapsule), Math.min(0.58, heavy * 0.24));
  if (forked) _shotColor.lerp(_traitColor.setHex(PAL.capsule), Math.min(0.46, forked * 0.17));
  if (seeker) _shotColor.lerp(_traitColor.setHex(PAL.capsule), Math.min(0.58, seeker * 0.22));
  if (phase) _shotColor.lerp(_traitColor.setHex(PAL.shots.L), Math.min(0.64, phase * 0.24));
  if (volatile) _shotColor.lerp(_traitColor.setHex(PAL.shots.F), Math.min(0.68, volatile * 0.26));
  coreMeshes[visualType].setColorAt(i, _shotColor);
  _shotColor.setHex(color);
  if (seeker) _shotColor.lerp(_traitColor.setHex(PAL.capsule), Math.min(0.66, 0.24 + seeker * 0.13));
  if (phase) _shotColor.lerp(_traitColor.setHex(PAL.shots.L), Math.min(0.64, 0.22 + phase * 0.14));
  if (volatile) _shotColor.lerp(_traitColor.setHex(PAL.shots.F), Math.min(0.72, 0.28 + volatile * 0.14));
  _shotColor.multiplyScalar(look.gain * (1 + tier * 0.035));
  wakeMesh.setColorAt(i, _shotColor);
  for (let j = 0; j < TRAIL_SEGMENTS; j++) {
    _shotColor.setHex(color);
    if (seeker) _shotColor.lerp(_traitColor.setHex(PAL.capsule), Math.min(0.72, 0.28 + seeker * 0.15));
    if (phase) _shotColor.lerp(_traitColor.setHex(PAL.shots.L), Math.min(0.66, 0.24 + phase * 0.14));
    if (volatile) _shotColor.lerp(_traitColor.setHex(PAL.shots.F), Math.min(0.72, 0.26 + volatile * 0.15));
    _shotColor.multiplyScalar(TRAIL_FADE[j] * (1 + tier * 0.025));
    trailMesh.setColorAt(trailIndex(i, j), _shotColor);
  }
  coreMeshes[visualType].instanceColor.needsUpdate = true;
  wakeMesh.instanceColor.needsUpdate = true;
  trailMesh.instanceColor.needsUpdate = true;
}

function concealSlotMatrices(i) {
  if (coreMeshes[slotType[i]]) {
    coreMeshes[slotType[i]].setMatrixAt(i, HIDE);
    shellMeshes[slotType[i]].setMatrixAt(i, HIDE);
    if (artMeshes[slotType[i]]) artMeshes[slotType[i]].setMatrixAt(i, HIDE);
    if (chassisMeshes[slotType[i]]) chassisMeshes[slotType[i]].setMatrixAt(i, HIDE);
  }
  tipMesh.setMatrixAt(i, HIDE);
  if (groundArtMesh) groundArtMesh.setMatrixAt(i, HIDE);
  groundFireMesh.setMatrixAt(i, HIDE);
  groundFireCoreMesh.setMatrixAt(i, HIDE);
  wakeMesh.setMatrixAt(i, HIDE);
  for (const mesh of traitMeshList) mesh.setMatrixAt(i, HIDE);
  for (const mesh of stackMeshList) mesh.setMatrixAt(i, HIDE);
  historyCount[i] = 0;
  for (let j = 0; j < TRAIL_SEGMENTS; j++) trailMesh.setMatrixAt(trailIndex(i, j), HIDE);
}

// The sim emits this at the swept top-surface contact, before its first
// ground-fire sync.  Retire the airborne history at that exact point and pay
// off the transformation with a compact downward ignition + low backwash;
// no radial badge suggests damage the sim did not grant.
function deckIgnited(i, b, s, surfaceY, reason = 'deck-ignite', kind = 'deck') {
  ignitionCount++;
  lastIgnition.reason = reason;
  lastIgnition.s = s;
  lastIgnition.surfaceY = surfaceY;
  lastIgnition.kind = kind;
  historyCount[i] = 0;
  for (let j = 0; j < TRAIL_SEGMENTS; j++)
    trailMesh.setMatrixAt(trailIndex(i, j), HIDE);
  if (slotFacetHidden[i] || !projectileOnVisibleFacet(s)) return;
  const dir = b.dir || Math.sign(b.vx) || 1;
  const flameY = surfaceY + (b.def?.hugY || CONFIG.weapons.F.hugY) * 0.48;
  fxFlash(82, 0.30, s, flameY, PAL.muzzle, 0.028);
  fxCoreRupture(s, flameY, PAL.shots.F, dir, -0.38, 0.34, 0.045);
  fxDirectedBurst(CONFIG.juice.impact, s, flameY, PAL.shots.F,
    -dir, 0.62, 0.42, 0.31);
  fxVapor(s, flameY, PAL.shots.F, -dir, 0.26, 0.018);
}

// Real hostile/terrain collisions pay off with the chassis' own endpoint
// sentence. Coordinates and heading come from the terminal sim row, never a
// prior render sample: a fast shot can now die before its first sync without
// sparking behind the target. VOLATILE already owns a larger exact-position
// detonation hook, so it deliberately skips these ordinary effects.
function terminalImpact(i, b, reason) {
  const type = slotType[i];
  terminalImpactCounts[type] = (terminalImpactCounts[type] || 0) + 1;
  const s = b.x, y = b.y;
  const speed = Math.max(0.001, Math.hypot(b.vx, b.vy));
  const ds = b.crawling ? b.dir : b.vx / speed;
  const dy = b.crawling ? 0 : b.vy / speed;
  const px = -dy, py = ds;
  switch (type) {
    case 'S':
      // Five flechettes resolve as one clipped rake ACROSS the flight line.
      fxDirectionalFlash(72, 0.76, 0.14, s, y, PAL.shots.S,
        px, py, 0.04);
      fxDirectedBurst(CONFIG.juice.impact, s, y, PAL.shots.S,
        -ds, -dy, 0.92, 0.48);
      break;
    case 'L':
      // Laser owns the longest, thinnest axis seam in the set.
      fxDirectionalFlash(64, 0.86, 0.075, s, y, PAL.shots.L,
        ds, dy, 0.05);
      fxDirectedBurst(CONFIG.juice.impact, s, y, PAL.shots.L,
        -ds, -dy, 0.10, 0.34);
      break;
    case 'H':
      // Guidance vanes shear sideways when the committed steering dart hits.
      fxDirectionalFlash(74, 0.64, 0.105, s, y, PAL.shots.H,
        px, py, 0.045);
      fxDirectedBurst(CONFIG.juice.impact, s, y, PAL.shots.H,
        px, py, 0.32, 0.44);
      break;
    case 'F':
      // Exact hostileImpact owns Cindermouth's bite because its first contacts
      // pierce and never reach this terminal hook. When the last pierce is
      // spent, do not paint the same contact twice; terrain still gets the
      // ordinary terminal bite plus its physical hull response below.
      if (reason !== 'hostile') {
        fxDirectionalFlash(86, 0.84, 0.22, s, y, PAL.shots.F,
          ds, dy, 0.05);
        fxDirectedBurst(CONFIG.juice.impact, s, y, PAL.shots.F,
          -ds, Math.max(0.18, -dy), 0.68, 0.38);
      }
      break;
    default:
      // Rivet: the smallest, hardest longitudinal pin in the set.
      fxDirectionalFlash(68, 0.58, 0.12, s, y, PAL.shots.R,
        ds, dy, 0.045);
      fxDirectedBurst(CONFIG.juice.impact, s, y, PAL.shots.R,
        -ds, Math.max(0.12, -dy), 0.26, 0.34);
      break;
  }
  if (reason === 'terrain') {
    // The hull answers a true terrain strike with one compact split seam, two
    // sheared bracket chips and a thin pressure leak. Every layer is anchored
    // to the exact sim endpoint above; none expands to imply splash damage.
    const coreScale = type === 'L' ? 0.56 : type === 'F' ? 0.64 : 0.48;
    const coreAspect = type === 'L' ? 2.25 : type === 'R' ? 1.60 : 1.15;
    fxCoreRupture(s, y, PAL.muzzle, ds, dy, coreScale, 0.045, coreAspect);
    fxRoleFragments('machine', s, y, PAL.shots[type] || PAL.shots.R,
      -ds, -dy, type === 'F' ? 0.58 : 0.46);
    // Only combustion leaves a pressure wake. A rivet/laser/homing impact
    // smoking like a shell made all five terminals read as the same event.
    if (type === 'F') fxVapor(s, y, PAL.shots.F, -ds, 0.52, 0.02);
  }
}

// Lifetime is not a hit. A single low-power backward fleck lets fuel visibly
// run out without lying about contact or drawing a radius-sized flash.
function terminalSputter(i, b) {
  const type = slotType[i];
  const speed = Math.max(0.001, Math.hypot(b.vx, b.vy));
  const ds = b.crawling ? b.dir : b.vx / speed;
  const dy = b.crawling ? 0 : b.vy / speed;
  fxDirectedBurst(LIFETIME_SPUTTER, b.x, b.y,
    PAL.shots[type] || PAL.shots.R, -ds, -dy, 0.08);
}

// `(i, b, reason)` is the render-only terminal contract from sim/weapons.js.
// Unclassified pool cleanup and run reset are concealment only. Bend already
// owns a tangent tracer, and a shot hidden behind the active facet must never
// leak an impact around the corner.
function hideSlot(i, b = null, reason = 'pool') {
  if (!slotVisible[i]) return;
  if (terminalReasonCounts[reason] !== undefined) terminalReasonCounts[reason]++;
  lastEndpoint.reason = reason;
  lastEndpoint.effect = 'none';
  lastEndpoint.s = b ? b.x : 0;
  lastEndpoint.y = b ? b.y : 0;
  lastEndpoint.type = slotType[i];
  const endpointVisible = b && !slotFacetHidden[i] && projectileOnVisibleFacet(b.x);
  const volatile = b?.meta?.volatile || slotMeta[i]?.volatile;
  if (endpointVisible && !volatile) {
    if (reason === 'hostile' || reason === 'terrain') {
      terminalImpact(i, b, reason);
      lastEndpoint.effect = 'impact';
    } else if (reason === 'lifetime') {
      terminalSputter(i, b);
      lastEndpoint.effect = 'sputter';
    }
  }
  concealSlotMatrices(i);
  slotVisible[i] = 0;
  slotFacetHidden[i] = 0;
  slotMeta[i] = null;
}

const PROJECTILE_BENDS = IS_TRANSFORM_SLICE ? TRANSFORM_BEND_S : BEND_S;

function visibleProjectileFacet() {
  return IS_TRANSFORM_SLICE ? committedBand : cameraFacingFacet();
}

function projectileOnVisibleFacet(s) {
  // Authored traversal fixtures are planar proofs even when their logical s
  // happens to overlap a normal-run bend coordinate. Only the default helix
  // and the explicit multi-band transform fixture own facet visibility.
  if (ACTIVE_FIXTURE && !IS_TRANSFORM_SLICE) return true;
  return facetAtBends(s, PROJECTILE_BENDS) === visibleProjectileFacet() &&
    routeRenderable(s);
}

function syncTrail(i, x, y, z, look, widthMult) {
  const count = historyCount[i];
  if (count === 0) {
    for (let p = 0; p < TRAIL_POINTS; p++) {
      const k = pointIndex(i, p);
      historyX[k] = x; historyY[k] = y; historyZ[k] = z;
    }
    historyCount[i] = 1;
    for (let j = 0; j < TRAIL_SEGMENTS; j++) trailMesh.setMatrixAt(trailIndex(i, j), HIDE);
    return;
  }

  for (let p = TRAIL_POINTS - 1; p > 0; p--) {
    const to = pointIndex(i, p), from = pointIndex(i, p - 1);
    historyX[to] = historyX[from]; historyY[to] = historyY[from]; historyZ[to] = historyZ[from];
  }
  const head = pointIndex(i, 0);
  historyX[head] = x; historyY[head] = y; historyZ[head] = z;
  historyCount[i] = Math.min(TRAIL_POINTS, count + 1);

  for (let j = 0; j < TRAIL_SEGMENTS; j++) {
    const meshI = trailIndex(i, j);
    if (j >= look.segments || j + 1 >= historyCount[i]) {
      trailMesh.setMatrixAt(meshI, HIDE);
      continue;
    }
    const a = pointIndex(i, j), b = pointIndex(i, j + 1);
    const dx = historyX[a] - historyX[b];
    const dy = historyY[a] - historyY[b];
    const dz = historyZ[a] - historyZ[b];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) { trailMesh.setMatrixAt(meshI, HIDE); continue; }
    _trailDir.set(dx / len, dy / len, dz / len);
    _trailQ.setFromUnitVectors(_axisX, _trailDir);
    const drawLen = len * look.fill;
    // Start at the newer sample and stop short of the older one. The missing
    // fraction is a deliberate gap, what makes LASER segmented and FLAME
    // broken tongues instead of one generic hose.
    _trailMid.set(historyX[a] - _trailDir.x * drawLen * 0.5,
      historyY[a] - _trailDir.y * drawLen * 0.5,
      historyZ[a] - _trailDir.z * drawLen * 0.5);
    const taper = 1 - j * 0.18;
    _trailScale.set(drawLen, look.trail * taper * widthMult, 1);
    _bm.compose(_trailMid, _trailQ, _trailScale);
    trailMesh.setMatrixAt(meshI, _bm);
  }
}

function syncTraitMark(i, key, count, back, sx, sy) {
  const mesh = traitMeshes[key];
  if (!count) { mesh.setMatrixAt(i, HIDE); return; }
  _traitPos.copy(_bv).addScaledVector(_flight, -back);
  const stack = 1 + (count - 1) * 0.11;
  _traitScale.set(sx * stack, sy * stack * PROJECTILE_WIDTH_GAIN, 1);
  _bm.compose(_traitPos, _bq, _traitScale);
  mesh.setMatrixAt(i, _bm);
}

function syncStackMark(i, key, count, back, sx, sy) {
  const mesh = stackMeshes[key];
  if (count < 2) { mesh.setMatrixAt(i, HIDE); return; }
  _traitPos.copy(_bv).addScaledVector(_flight, -back);
  // Third stacks overdrive the secondary station rather than allocating a
  // third object. The authored separation already says “stacked”; this size
  // step says the stack has reached its cap.
  const cap = count >= 3 ? 1.24 : 1;
  _traitScale.set(sx * cap, sy * cap * PROJECTILE_WIDTH_GAIN, 1);
  _bm.compose(_traitPos, _bq, _traitScale);
  mesh.setMatrixAt(i, _bm);
}

function syncChassisDetail(i, type) {
  const mesh = chassisMeshes[type];
  if (!mesh) return;
  const look = CHASSIS_LOOK[type];
  _traitPos.copy(_bv).addScaledVector(_flight, -look.back);
  _traitScale.set(look.sx, look.sy * PROJECTILE_WIDTH_GAIN, 1);
  _bm.compose(_traitPos, _bq, _traitScale);
  mesh.setMatrixAt(i, _bm);
}

// VOLATILE needs a landing sentence, not only a larger projectile. This hook
// is emitted by the exact sim detonation edge, but owns presentation only:
// a split hot core, two kinds of directional shrapnel and a sparse pressure
// wake. It deliberately has no circular collision-radius theatre: the caged
// ember ruptures along its own flight sentence rather than expanding as a
// debug ring.
function volatileImpact(b, radius, stack = 1) {
  const power = Math.max(1, Math.min(3, Number(stack) || 1));
  const radiusGain = Math.max(0.82, Math.min(1.45, radius / 1.2));
  const speed = Math.max(0.001, Math.hypot(b.vx, b.vy));
  const dirS = b.crawling ? b.dir : b.vx / speed;
  const dirY = b.crawling ? 0.12 : b.vy / speed;
  fxCoreRupture(b.x, b.y, PAL.muzzle, dirS, dirY,
    (0.72 + power * 0.13) * radiusGain, 0.055);
  fxRoleFragments('machine', b.x, b.y, PAL.shots.F,
    dirS, dirY + 0.18, (0.62 + power * 0.12) * radiusGain);
  fxVapor(b.x, b.y, PAL.shots.F, -dirS,
    (0.48 + power * 0.10) * radiusGain, 0.025);
  fxDirectedBurst(CONFIG.juice.impact, b.x, b.y, PAL.shots.F,
    dirS, dirY, 0.92, (0.64 + power * 0.17) * radiusGain);
  if (power >= 2) {
    fxDirectedBurst(CONFIG.juice.impact, b.x, b.y, PAL.capsule,
      -dirS, 0.32 - dirY * 0.30, 0.58,
      (0.38 + power * 0.10) * radiusGain);
  }
}

// map (s,y) onto the tower for one live slot: position + a heading-oriented
// scale for every type. `crawling` is F-only (see spawnProj/updateBullets in
// src/sim/weapons.js); every other type always takes the flight branch.
function syncSlot(i, b) {
  // A corner camera commits before RIG has physically crossed the chamfer.
  // Logical shots may still exist on that old surface, but drawing them from
  // its far edge makes the new face look like it is firing at the player.
  // Conceal every companion matrix together while retaining the live sim row;
  // if a valid fixture/camera ever faces the facet again, the next sync can
  // rebuild it without changing damage, lifetime, or trajectory.
  if (!projectileOnVisibleFacet(b.x)) {
    concealSlotMatrices(i);
    slotFacetHidden[i] = 1;
    return;
  }
  slotFacetHidden[i] = 0;
  const bp = towerPose(b.x, _pp);
  const def = b.def || CONFIG.weapons[b.type] || CONFIG.weapons.R;
  const look = LOOK[b.type] || LOOK.R;
  const visualType = coreMeshes[b.type] ? b.type : 'R';
  const meta = b.meta;
  const tier = meta ? meta.tier : 0;
  const heavy = meta ? meta.heavy : 0;
  const rapid = meta ? meta.rapid : 0;
  const forked = meta ? meta.forked : 0;
  const seeker = meta ? meta.seeker : 0;
  const phase = meta ? meta.phase : 0;
  const volatile = meta ? meta.volatile : 0;
  const crawling = b.type === 'F' && b.crawling;
  const base = crawling && def.crawlScale ? def.crawlScale : def.scale;
  // live speed, not the def's nominal one: a homing shot mid-turn or a
  // flame arcing under gravity draws the stretch it is ACTUALLY carrying
  // this frame, same principle as the spark stretch in src/render/fx.js.
  // The crawler's (vx, vy) go stale the instant it starts hugging terrain
  // (position advances by dir * crawlSpeed instead, src/sim/weapons.js), so
  // it reads its own crawl speed instead.
  const speed = crawling ? def.crawlSpeed : Math.hypot(b.vx, b.vy);
  const nose = bulletNoseTiles(base[0] * CONFIG.rifle.radius, speed, BULLET_NOSE_CEILING_TILES);
  // A projectile is a manufactured chassis, not a pickup orb: its silhouette
  // stays rigid from frame to frame. Translation, the segmented history and
  // H's genuinely curved trajectory supply motion; width pumping at FAR only
  // made the body alias between two unrelated pixel silhouettes.
  const pulse = 1;
  const front = Math.min(nose * look.front, look.frontCap);
  const tail = look.tail * (crawling ? 1.22 : 1);
  const ang = crawling ? (b.dir < 0 ? Math.PI : 0) : Math.atan2(b.vy, b.vx);
  _bq.setFromEuler(_be.set(0, bp.yaw, ang, 'YZX'));
  _bv.set(
    bp.x + Math.sin(bp.yaw) * PROJECTILE_SURFACE_DEPTH,
    b.y + bp.alt,
    bp.z + Math.cos(bp.yaw) * PROJECTILE_SURFACE_DEPTH,
  );
  const ca = Math.cos(ang), sa = Math.sin(ang);
  _flight.set(Math.cos(bp.yaw) * ca, sa, -Math.sin(bp.yaw) * ca);
  // The geometry spans -R…+R. Scale to (front + tail), then shift its center
  // by (front - tail)/2 so its leading tip is exactly +front from the sim
  // point and every extra bit of spectacle lives behind it.
  _corePos.copy(_bv).addScaledVector(_flight, (front - tail) * 0.5);
  // Traits widen the readable energy signature behind/around the point, never
  // its leading reach. HEAVY gets a denser core, SEEKER a stronger path, and
  // VOLATILE a broad hot wake; tier supplies a small shared rarity lift.
  const coreWidth = 1 + tier * 0.035 + Math.min(0.95, heavy * 0.27) +
    Math.min(0.52, volatile * 0.14);
  const wakeWidth = 1 + tier * 0.05 + Math.min(0.78, seeker * 0.24) +
    Math.min(0.88, volatile * 0.29);
  const trailWidth = 1 + tier * 0.04 + Math.min(0.82, seeker * 0.27) +
    Math.min(0.54, phase * 0.13) + Math.min(0.58, volatile * 0.16);

  if (crawling) {
    // The chassis has opened at deckIgnited(): hide every rigid airborne body
    // and trait station.  Trait weight now changes the flame sentence itself,
    // so HEAVY³ reads as a denser low wave rather than a metal slug sliding.
    coreMeshes[visualType].setMatrixAt(i, HIDE);
    shellMeshes[visualType].setMatrixAt(i, HIDE);
    if (artMeshes[visualType]) artMeshes[visualType].setMatrixAt(i, HIDE);
    if (chassisMeshes[visualType]) chassisMeshes[visualType].setMatrixAt(i, HIDE);
    tipMesh.setMatrixAt(i, HIDE);
    for (const mesh of traitMeshList) mesh.setMatrixAt(i, HIDE);
    for (const mesh of stackMeshList) mesh.setMatrixAt(i, HIDE);

    const flameLen = 1.95 + Math.min(0.42, heavy * 0.11) +
      Math.min(0.22, volatile * 0.07);
    if (groundArtMesh) {
      // The packed alpha spans 230x37 inside its 256 cell. Its sharp leading
      // lick lands exactly on the live sim point; all forged debris and flame
      // mass extends backward. Vertical scale is derived from that occupied
      // aspect and planted on crawlSurfaceY, never inferred from screen space.
      const planeLen = flameLen / ART_CELL_OCCUPANCY;
      _artPos.copy(_bv).addScaledVector(_flight, -flameLen * 0.5);
      _artPos.y -= 0.08;
      _artScale.set(planeLen,
        planeLen * (1.40 + heavy * 0.035) * PROJECTILE_WIDTH_GAIN, 1);
      _bm.compose(_artPos, _bq, _artScale);
      groundArtMesh.setMatrixAt(i, _bm);
      groundFireMesh.setMatrixAt(i, HIDE);
      groundFireCoreMesh.setMatrixAt(i, HIDE);
    } else {
      // Complete deterministic fallback for ?sprites=0 or a failed boot load.
      // The lowest authored point is planted on the contacted surface.
      _artPos.copy(_bv);
      _artPos.y -= 0.10 * PROJECTILE_WIDTH_GAIN;
      _artScale.set(flameLen, (0.92 + heavy * 0.06) * PROJECTILE_WIDTH_GAIN, 1);
      _bm.compose(_artPos, _bq, _artScale);
      groundFireMesh.setMatrixAt(i, _bm);
      _artPos.copy(_bv).addScaledVector(_flight, -0.04);
      _artPos.y -= 0.10 * PROJECTILE_WIDTH_GAIN;
      _artScale.set(flameLen, 0.92 * PROJECTILE_WIDTH_GAIN, 1);
      _bm.compose(_artPos, _bq, _artScale);
      groundFireCoreMesh.setMatrixAt(i, _bm);
    }

    // A short low backwash and two broken history tongues finish the state.
    // Their front remains behind the point, preserving collision honesty.
    _wakePos.copy(_bv).addScaledVector(_flight, -0.43);
    _wakeScale.set(0.86 + heavy * 0.06, 0.16 * wakeWidth, 1);
    _bm.compose(_wakePos, _bq, _wakeScale);
    wakeMesh.setMatrixAt(i, _bm);
    syncTrail(i, _bv.x, _bv.y, _bv.z, look, trailWidth * 0.82);
    return;
  }

  if (groundArtMesh) groundArtMesh.setMatrixAt(i, HIDE);
  groundFireMesh.setMatrixAt(i, HIDE);
  groundFireCoreMesh.setMatrixAt(i, HIDE);
  const artMesh = artMeshes[visualType];
  if (artMesh) {
    // The visible alpha occupies a centered 230/256 of its cell. Scale that
    // occupied interval to the authored body length, then shift its midpoint
    // so the painted tip lands at `artFront` and every remaining texel lives
    // behind the simulation point. LASER deliberately uses a shorter physical
    // focusing chassis; its longer sanctioned reach remains the segmented
    // energy corridor below, instead of stretching machinery into a bar.
    const artLook = ART_LOOK[visualType] || ART_LOOK.R;
    const artFront = Math.min(front, artLook.frontCap);
    const artTail = artLook.tail * (crawling ? 1.12 : 1);
    const artLen = artFront + artTail;
    const planeLen = artLen / ART_CELL_OCCUPANCY;
    const traitBulk = 1 + Math.min(0.26,
      tier * 0.035 + heavy * 0.045 + seeker * 0.025 + volatile * 0.035);
    _artPos.copy(_bv).addScaledVector(_flight, (artFront - artTail) * 0.5);
    _artScale.set(planeLen,
      planeLen * artLook.thickness * traitBulk * PROJECTILE_WIDTH_GAIN, 1);
    _bm.compose(_artPos, _bq, _artScale);
    artMesh.setMatrixAt(i, _bm);

    // Painted silhouettes carry their own dark shell, nose jewel, rivets and
    // steering hardware. Leaving the fallback passes under them only clips
    // the art to white at minified play scale, so those pools stay dormant.
    coreMeshes[visualType].setMatrixAt(i, HIDE);
    shellMeshes[visualType].setMatrixAt(i, HIDE);
    tipMesh.setMatrixAt(i, HIDE);
    if (chassisMeshes[visualType]) chassisMeshes[visualType].setMatrixAt(i, HIDE);
  } else {
    _bs.set((front + tail) / (R * 2),
      pulse * coreWidth * PROJECTILE_WIDTH_GAIN,
      pulse * coreWidth * PROJECTILE_WIDTH_GAIN);
    _shellScale.set(_bs.x * 1.025, _bs.y * 1.46, _bs.z * 1.46);
    _bm.compose(_corePos, _bq, _shellScale);
    shellMeshes[visualType].setMatrixAt(i, _bm);
    _bm.compose(_corePos, _bq, _bs);
    coreMeshes[visualType].setMatrixAt(i, _bm);

    // The fallback jewel fills the final portion of the clamped nose and
    // stops exactly at its front edge. No trait or pulse can push it farther.
    const tipLen = Math.max(0.045, Math.min(0.14, front * 0.42));
    _tipPos.copy(_bv).addScaledVector(_flight, front - tipLen);
    const tipWidth = (0.065 + Math.min(0.035, heavy * 0.012)) *
      pulse * PROJECTILE_WIDTH_GAIN;
    _tipScale.set(tipLen, tipWidth, tipWidth);
    _bm.compose(_tipPos, _bq, _tipScale);
    tipMesh.setMatrixAt(i, _bm);
  }

  const wakeFront = front * 0.82;
  const wakeTail = tail + look.wake;
  _wakePos.copy(_bv).addScaledVector(_flight, (wakeFront - wakeTail) * 0.5);
  _wakeScale.set(wakeFront + wakeTail, look.wakeW * pulse * wakeWidth, 1);
  _bm.compose(_wakePos, _bq, _wakeScale);
  wakeMesh.setMatrixAt(i, _bm);

  // Each signature occupies its own rigid hardware station BEHIND the
  // collision point. Spread the three body-wrapping traits along the tail;
  // stacking them at one x made a circular magenta/amber badge that erased
  // the weapon chassis at precisely the 6-12px play scale.
  if (!artMesh) syncChassisDetail(i, visualType);
  syncTraitMark(i, 'rapid', rapid, tail + 0.28, 0.54, 0.16);
  // HEAVY and SEEKER are intentionally a few pixels broader at phone scale.
  // Their stations stay wholly behind the sim point: larger cues never imply
  // extra reach or hide the leading collision tip.
  syncTraitMark(i, 'heavy', heavy, 0.64, 0.72, 0.58);
  syncTraitMark(i, 'forked', forked, tail + 0.18, 0.58, 0.27);
  syncTraitMark(i, 'seeker', seeker, 0.30, 0.23, 0.27);
  syncTraitMark(i, 'phase', phase, tail + 0.38, 0.92, 0.27);
  syncTraitMark(i, 'volatile', volatile, 0.91, 0.24, 0.25);

  syncStackMark(i, 'rapid', rapid, tail + 0.82, 0.54, 0.13);
  syncStackMark(i, 'heavy', heavy, 1.28, 0.60, 0.48);
  syncStackMark(i, 'forked', forked, tail + 0.76, 0.52, 0.22);
  syncStackMark(i, 'seeker', seeker, 0.82, 0.19, 0.23);
  syncStackMark(i, 'phase', phase, tail + 1.12, 0.76, 0.21);
  syncStackMark(i, 'volatile', volatile, 1.48, 0.20, 0.21);

  syncTrail(i, _bv.x, _bv.y, _bv.z, look, trailWidth);
}

/* ------------------- departing tracers (bend cull) ------------------ *
 * The sim kills a projectile that reaches a bend boundary (src/sim/weapons.js,
 * per the July 30 operator ruling that projectiles must not curve around
 * corners). Visually a bolt does not blink out at a seam: it leaves the body
 * on the tangent it had and fades. These tracers live in their own small pool
 * because the sim's slot is free for reuse the instant the shot dies. They are
 * pure presentation — nothing here can be hit, and nothing reads them back. */

const DEPART_MAX = 24, DEPART_MS = 300;
const departMesh = new THREE.InstancedMesh(
  // A bend-cull echo keeps the projectile's directional grammar. The former
  // sphere briefly turned every weapon back into an orb at exactly the seam.
  new THREE.BoxGeometry(1, 0.065, 0.065),
  new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }),
  DEPART_MAX
);
departMesh.frustumCulled = false;
departMesh.renderOrder = 2;
scene.add(departMesh);
departMesh.setColorAt(0, _shotColor.setHex(0xffffff));
const departing = [];
for (let i = 0; i < DEPART_MAX; i++)
  departing.push({ until: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 1 });
let departLast = 0;
let departFacet = visibleProjectileFacet();

function clearDepartingPool() {
  for (let i = 0; i < DEPART_MAX; i++) {
    departing[i].until = 0;
    departMesh.setMatrixAt(i, HIDE);
  }
  departMesh.instanceMatrix.needsUpdate = true;
}

// (i, b, fromX): the slot, the projectile row, and the s it entered the
// crossing substep at — the tangent to leave on is the heading THERE, which is
// the facet the shot was actually fired along.
function bendCulled(i, b, fromX) {
  // A hidden old-facet shot must not manufacture a visible farewell streak
  // from behind the fold when it eventually reaches the bend in simulation.
  if (!projectileOnVisibleFacet(fromX)) return;
  const bp = towerPose(fromX, _pp);
  const yaw = bp.yaw;
  const def = b.def || CONFIG.weapons[b.type];
  const vx = b.crawling ? b.dir * def.crawlSpeed : b.vx;
  for (const d of departing) {
    if (d.until > 0) continue;
    d.until = DEPART_MS;
    d.x = bp.x + Math.sin(yaw) * PROJECTILE_SURFACE_DEPTH;
    d.y = b.y + bp.alt;
    d.z = bp.z + Math.cos(yaw) * PROJECTILE_SURFACE_DEPTH;
    d.vx = Math.cos(yaw) * vx; d.vy = b.crawling ? 0 : b.vy; d.vz = -Math.sin(yaw) * vx;
    // Bound the departing needle by the smallest declared axis so LASER does
    // not leave a seven-tile cosmetic hit claim after the sim has culled it.
    d.scale = Math.max(0.34, Math.min(...def.scale));
    const idx = departing.indexOf(d);
    departMesh.setColorAt(idx, _shotColor.setHex(PAL.shots[b.type]));
    departMesh.instanceColor.needsUpdate = true;
    return;
  }
}

function advanceDeparting() {
  const now = performance.now();
  const facing = visibleProjectileFacet();
  if (facing !== departFacet) {
    clearDepartingPool();
    departFacet = facing;
  }
  const dt = departLast ? Math.min(50, now - departLast) : 0;
  departLast = now;
  for (let i = 0; i < DEPART_MAX; i++) {
    const d = departing[i];
    if (d.until <= 0) { departMesh.setMatrixAt(i, HIDE); continue; }
    d.until -= dt;
    if (d.until <= 0) { departMesh.setMatrixAt(i, HIDE); continue; }
    const step = dt / 1000;
    d.x += d.vx * step; d.y += d.vy * step; d.z += d.vz * step;
    const s = d.scale * (d.until / DEPART_MS);        // shrink out instead of pop
    const speed = Math.max(0.001, Math.hypot(d.vx, d.vy, d.vz));
    _trailDir.set(d.vx / speed, d.vy / speed, d.vz / speed);
    _trailQ.setFromUnitVectors(_axisX, _trailDir);
    _trailMid.set(d.x, d.y, d.z);
    _trailScale.set(s, 1, 1);
    _bm.compose(_trailMid, _trailQ, _trailScale);
    departMesh.setMatrixAt(i, _bm);
  }
  departMesh.instanceMatrix.needsUpdate = true;
}

function flush() {
  for (const mesh of artMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of coreMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of shellMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of chassisMeshList) mesh.instanceMatrix.needsUpdate = true;
  tipMesh.instanceMatrix.needsUpdate = true;
  groundFireMesh.instanceMatrix.needsUpdate = true;
  groundFireCoreMesh.instanceMatrix.needsUpdate = true;
  wakeMesh.instanceMatrix.needsUpdate = true;
  trailMesh.instanceMatrix.needsUpdate = true;
  for (const mesh of traitMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of stackMeshList) mesh.instanceMatrix.needsUpdate = true;
  advanceDeparting();
}

// run reset: no tracer survives a restart
export function clearDepartingTracers() {
  for (let i = 0; i < BULLET_MAX; i++) hideSlot(i, null, 'reset');
  for (const mesh of artMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of coreMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of shellMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of chassisMeshList) mesh.instanceMatrix.needsUpdate = true;
  tipMesh.instanceMatrix.needsUpdate = true;
  groundFireMesh.instanceMatrix.needsUpdate = true;
  groundFireCoreMesh.instanceMatrix.needsUpdate = true;
  wakeMesh.instanceMatrix.needsUpdate = true;
  trailMesh.instanceMatrix.needsUpdate = true;
  for (const mesh of traitMeshList) mesh.instanceMatrix.needsUpdate = true;
  for (const mesh of stackMeshList) mesh.instanceMatrix.needsUpdate = true;
  clearDepartingPool();
  departFacet = visibleProjectileFacet();
}

export function bulletTraitVisualSnapshot() {
  const live = { rapid: 0, heavy: 0, forked: 0, seeker: 0, phase: 0, volatile: 0 };
  let slots = 0;
  for (let i = 0; i < BULLET_MAX; i++) {
    if (!slotVisible[i] || slotFacetHidden[i]) continue;
    slots++;
    const meta = slotMeta[i];
    if (!meta) continue;
    for (const key of TRAIT_KEYS) if (meta[key]) live[key]++;
  }
  return {
    fixedPools: artMeshList.length + coreMeshList.length + shellMeshList.length +
      chassisMeshList.length + traitMeshList.length + stackMeshList.length + 5,
    projectileArt: {
      state: artSlot.state,
      file: PROJECTILE_ART.file,
      requests: artSlot.requests,
      paintedPools: artMeshList.length,
      paintedVisible: artMeshList.length > 0,
      error: artSlot.error,
      preloadMs: artSlot.preloadMs,
      gateMs: artSlot.gateMs,
      residency: artSlot.residency,
      settledBeforeConsumer: artSlot.settledBeforeConsumer,
    },
    productionPlacement: {
      surfaceDepth: PROJECTILE_SURFACE_DEPTH,
      widthGain: PROJECTILE_WIDTH_GAIN,
      view: VIEW_ID,
    },
    traitPools: TRAIT_KEYS.length,
    stackPools: stackMeshList.length,
    capacityPerTrait: BULLET_MAX,
    liveSlots: slots,
    live,
    occlusion: {
      chassisDepthTest: coreMaterial.depthTest,
      wakeDepthTest: wakeMesh.material.depthTest,
      trailDepthTest: trailMesh.material.depthTest,
      phaseRailsDepthTest: traitMeshes.phase.material.depthTest,
      phaseStackDepthTest: stackMeshes.phase.material.depthTest,
    },
    endpointLanguage: {
      pooled: true,
      circularRings: false,
      familyCounts: { ...terminalImpactCounts },
      reasonCounts: { ...terminalReasonCounts },
      last: { ...lastEndpoint },
    },
    groundFire: {
      pooled: true,
      pools: groundArtMesh ? 3 : 2,
      capacity: BULLET_MAX,
      ignitionCount,
      lastIgnition: { ...lastIgnition },
      airborneChassisRetired: true,
      paintedWave: !!groundArtMesh,
      whollyBehindPoint: true,
    },
  };
}

if (typeof window !== 'undefined') window.__HB_BULLET_TRAITS = bulletTraitVisualSnapshot;

let bulletViewInstalled = false;
export function initBulletView() {
  if (bulletViewInstalled) return false;
  installView({
    bullets: {
      slotSpawned, hideSlot, syncSlot, flush, bendCulled, deckIgnited, volatileImpact,
    },
  });
  bulletViewInstalled = true;
  return true;
}
