/* ======================== CROWN SUMMIT ============================ */
/* Fixed world architecture for Meridian's final command/transmitter. The
   Crown is baked once, bolted behind the final playable apron and revealed by
   the same built-facet ownership as the route. It never owns gameplay state.

   Production uses one recessed command-organ image plus three independent
   root/antenna atlas cells. Opaque textured scutes own the silhouette and
   conceal every image boundary. A real multi-depth iris, bowed conductors and
   one hinged rupture plate provide the finale motion; no mesh is allocated or
   texture derived while the run is moving. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ACTIVE_FIXTURE, QUERY } from '../mode.js';
import {
  CROWN_APPROACH, CROWN_MECHANICAL_LIMITS, crownBakePlan, crownBounds,
  crownMechanicalPose, stepCrownTurbine,
} from '../pure/crown.js';
import { scene } from './scene.js';
import { PAL } from './palette.js';
import { applyHullTexture, applySurface } from './materials.js';
import { postGain } from './post.js';
import { CROWN_ART, CROWN_ART_SLOT } from './crown-art.js';
import { towerPose } from './tower.js';
import { routeRenderable, routeVisibilityStamp } from './route-visibility.js';

const LEGACY_CROWN = QUERY.get('crown') === 'legacy';
const legacyTexture = CROWN_ART_SLOT.legacy;
const coreTexture = CROWN_ART_SLOT.core;
const kitTexture = CROWN_ART_SLOT.kit;

function crownCastingGeometry(outline, bevelSize = 0.025, bevelThickness = bevelSize) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize,
    bevelThickness,
  });
  geometry.translate(0, 0, -0.5);
  geometry.computeBoundingSphere();
  return geometry;
}

function atlasCellGeometry(col, row) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.attributes.uv;
  const u0 = col * 0.5;
  const u1 = u0 + 0.5;
  const v0 = 1 - (row + 1) * 0.5;
  const v1 = v0 + 0.5;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geometry;
}

const UNIT = ACTIVE_FIXTURE === null ? Object.freeze({
  box: new THREE.BoxGeometry(1, 1, 1),
  plate: new THREE.PlaneGeometry(1, 1),
  rootLeft: crownCastingGeometry([
    [-0.50, -0.43], [-0.43, -0.50], [-0.14, -0.44], [0.05, -0.50],
    [0.36, -0.36], [0.50, 0.18], [0.40, 0.45], [0.17, 0.50],
    [-0.11, 0.39], [-0.31, 0.24], [-0.48, 0.08],
  ], 0.035),
  rootRight: crownCastingGeometry([
    [-0.50, 0.11], [-0.38, 0.43], [-0.15, 0.50], [0.10, 0.42],
    [0.31, 0.29], [0.48, 0.03], [0.50, -0.40], [0.37, -0.49],
    [0.08, -0.43], [-0.12, -0.50], [-0.42, -0.36],
  ], 0.035),
  rootCrown: crownCastingGeometry([
    [-0.50, -0.32], [-0.42, -0.50], [-0.12, -0.43], [0.07, -0.50],
    [0.42, -0.38], [0.50, -0.09], [0.34, 0.34], [0.10, 0.50],
    [-0.17, 0.45], [-0.41, 0.20],
  ], 0.042),
  recess: crownCastingGeometry([
    [-0.35, -0.50], [0.31, -0.50], [0.48, -0.34], [0.50, 0.20],
    [0.34, 0.43], [0.12, 0.50], [-0.20, 0.46], [-0.44, 0.24],
    [-0.50, -0.22],
  ], 0.025),
  shellLeft: crownCastingGeometry([
    [-0.50, -0.47], [-0.27, -0.50], [0.16, -0.38], [0.44, -0.13],
    [0.50, 0.25], [0.26, 0.48], [-0.02, 0.50], [-0.35, 0.27],
    [-0.47, -0.08],
  ], 0.038),
  shellRight: crownCastingGeometry([
    [-0.48, 0.18], [-0.33, 0.43], [-0.04, 0.50], [0.26, 0.37],
    [0.49, 0.07], [0.50, -0.42], [0.25, -0.50], [-0.13, -0.38],
    [-0.42, -0.15],
  ], 0.038),
  shoulderLeft: crownCastingGeometry([
    [-0.50, -0.36], [-0.43, -0.50], [0.02, -0.43], [0.43, -0.26],
    [0.50, 0.11], [0.30, 0.43], [-0.04, 0.50], [-0.36, 0.29],
  ], 0.045),
  shoulderRight: crownCastingGeometry([
    [-0.50, -0.08], [-0.30, 0.38], [0.07, 0.50], [0.40, 0.28],
    [0.50, -0.20], [0.35, -0.47], [-0.10, -0.50], [-0.39, -0.33],
  ], 0.045),
  crownCap: crownCastingGeometry([
    [-0.50, -0.35], [-0.34, -0.50], [0.05, -0.43], [0.39, -0.22],
    [0.50, 0.12], [0.24, 0.48], [-0.07, 0.50], [-0.42, 0.18],
  ], 0.042),
  gear: new THREE.RingGeometry(0.31, 0.50, 18),
  antennaPod: crownCastingGeometry([
    [-0.33, -0.50], [0.31, -0.50], [0.44, -0.34], [0.31, 0.11],
    [0.13, 0.28], [0.04, 0.50], [-0.06, 0.50], [-0.17, 0.23],
    [-0.35, 0.05], [-0.46, -0.31],
  ], 0.020),
  conduit: crownCastingGeometry([
    [-0.50, 0], [-0.465, 0.50], [0.465, 0.50], [0.50, 0],
    [0.465, -0.50], [-0.465, -0.50],
  ], 0.035),
  cableA: crownCastingGeometry([
    [-0.50, -0.06], [-0.39, -0.31], [-0.17, -0.42], [0.04, -0.16],
    [0.27, 0.33], [0.45, 0.38], [0.50, 0.14], [0.42, -0.12],
    [0.26, 0.01], [0.06, -0.49], [-0.18, -0.50], [-0.42, -0.26],
  ], 0.022),
  cableB: crownCastingGeometry([
    [-0.50, 0.12], [-0.43, 0.36], [-0.25, 0.31], [-0.04, -0.26],
    [0.17, -0.49], [0.38, -0.32], [0.50, -0.07], [0.44, 0.19],
    [0.26, 0.39], [0.06, 0.10], [-0.17, -0.50], [-0.39, -0.32],
  ], 0.022),
  rupture: crownCastingGeometry([
    [-0.48, -0.50], [0.20, -0.46], [0.04, -0.18], [0.42, -0.02],
    [0.13, 0.19], [0.50, 0.42], [-0.08, 0.50], [-0.31, 0.21],
    [-0.16, -0.05], [-0.50, -0.24],
  ], 0.018),
  shutter: crownCastingGeometry([
    [-0.48, -0.34], [0.50, -0.16], [0.18, 0.47], [-0.15, 0.50],
  ], 0.012),
  turbineVane: crownCastingGeometry([
    [-0.48, -0.16], [0.50, -0.05], [0.37, 0.20], [-0.36, 0.34],
  ], 0.008),
  apertureFill: new THREE.CircleGeometry(1, 32),
  apertureRingWide: new THREE.RingGeometry(0.68, 1.0, 32),
  apertureRingMid: new THREE.RingGeometry(0.51, 0.64, 28),
  apertureRingInner: new THREE.RingGeometry(0.27, 0.45, 24),
  apertureLens: new THREE.CircleGeometry(1, 24),
  kitRootLeft: atlasCellGeometry(
    CROWN_ART.cells.rootLeft.col, CROWN_ART.cells.rootLeft.row),
  kitRootRight: atlasCellGeometry(
    CROWN_ART.cells.rootRight.col, CROWN_ART.cells.rootRight.row),
  kitAntenna: atlasCellGeometry(
    CROWN_ART.cells.antenna.col, CROWN_ART.cells.antenna.row),
}) : null;

function lit(color, family) {
  return applySurface(new THREE.MeshStandardMaterial({ color, flatShading: true }), family);
}

function hullLit(color, family, bucket) {
  const material = lit(color, family);
  applyHullTexture(material, bucket);
  if (material.map) material.color.multiply(new THREE.Color(color));
  return material;
}

function artMaterial(texture, opacity = 1) {
  return texture ? new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity,
    alphaTest: 0.035,
    depthWrite: true,
    side: THREE.FrontSide,
    fog: true,
  }) : null;
}

const MATERIAL = ACTIVE_FIXTURE === null ? Object.freeze({
  summitPlate: artMaterial(legacyTexture, 0.86),
  coreArt: artMaterial(coreTexture, 0.98),
  atlasArt: artMaterial(kitTexture, 0.97),
  backplane: hullLit(PAL.limb.shadow, 'distant', 'wall'),
  foundationWarm: hullLit(PAL.limb.hull, 'plate', 'hull'),
  foundationDark: hullLit(PAL.limb.wall, 'machine', 'wall'),
  shellWarm: hullLit(PAL.limb.hull, 'plate', 'hull'),
  shellDark: hullLit(PAL.limb.wall, 'machine', 'wall'),
  shellIvory: lit(PAL.limb.rib, 'machine'),
  hardware: hullLit(PAL.limb.machine, 'machine', 'wall'),
  antenna: hullLit(PAL.limb.wall, 'machine', 'wall'),
  conduitCasing: hullLit(PAL.contactShadow, 'distant', 'shadow'),
  signal0: lit(PAL.limb.machine, 'machine'),
  signal1: lit(PAL.limb.machine, 'machine'),
  signal2: lit(PAL.limb.machine, 'machine'),
  void: new THREE.MeshBasicMaterial({ color: PAL.contactShadow, fog: true }),
  apertureMachine: hullLit(PAL.limb.wall, 'machine', 'wall'),
  apertureRim: lit(PAL.limb.machine, 'machine'),
  apertureShutter: hullLit(PAL.limb.wall, 'machine', 'wall'),
  apertureLens: lit(PAL.contactShadow, 'machine'),
  damage: hullLit(PAL.limb.wall, 'machine', 'wall'),
}) : null;

const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
const _dummy = new THREE.Object3D();
const _local = new THREE.Object3D();
const _matrix = new THREE.Matrix4();

// One axis for desktop and portrait: the Crown is genuinely mounted inside
// the final held arena instead of teleporting its beam to a phone-only tap.
export const crownSignal = Object.freeze({
  s: CONFIG.levelLength - CROWN_APPROACH.coreFromEnd,
  deckY: CROWN_APPROACH.deckY,
  coreY: CROWN_APPROACH.deckY + 9.62,
  depth: -1.70,
  relays: Object.freeze([
    Object.freeze({ ds: -6.12, y: CROWN_APPROACH.deckY + 18.25 }),
    Object.freeze({ ds: 2.90, y: CROWN_APPROACH.deckY + 20.98 }),
    Object.freeze({ ds: 6.48, y: CROWN_APPROACH.deckY + 15.62 }),
  ]),
});

function placeAnchor(object, p) {
  const at = towerPose(p.s, _pose);
  object.position.set(
    at.x + Math.sin(at.yaw) * p.depth,
    p.y + at.alt,
    at.z + Math.cos(at.yaw) * p.depth,
  );
  object.rotation.order = 'YZX';
  object.rotation.y = at.yaw;
  object.rotation.z = p.tilt || 0;
  return object;
}

function place(object, p) {
  placeAnchor(object, p);
  if (p.shape === 'plate') object.scale.set(p.w, p.h, 1);
  else object.scale.set(p.w, p.h, p.d);
  return object;
}

function partMatrix(p, local = null) {
  place(_dummy, p);
  _dummy.updateMatrix();
  if (!local) return _dummy.matrix.clone();
  _local.position.set(local.x || 0, local.y || 0, local.z || 0);
  _local.rotation.set(0, 0, local.rz || 0);
  _local.scale.set(local.sx ?? 1, local.sy ?? 1, local.sz ?? 1);
  _local.updateMatrix();
  return _matrix.multiplyMatrices(_dummy.matrix, _local.matrix).clone();
}

function addPool(root, name, geometry, material, rows, role) {
  if (!rows.length || !geometry || !material) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.userData.crownRole = role;
  mesh.userData.crownParts = rows.map((row) => ({ s: row.p.s, shape: row.p.shape }));
  for (let i = 0; i < rows.length; i++) mesh.setMatrixAt(i, rows[i].matrix);
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

function materialForPart(p) {
  if (p.kind === 'backplane') return MATERIAL.backplane;
  if (p.kind === 'foundation')
    return p.shape === 'rootRight' ? MATERIAL.foundationDark : MATERIAL.foundationWarm;
  if (p.kind === 'shell') {
    if (p.shape === 'shellLeft' || p.shape === 'shellRight' ||
        p.shape === 'crownCap') return MATERIAL.shellDark;
    if (p.shape === 'shoulderLeft') return MATERIAL.shellIvory;
    return MATERIAL.shellWarm;
  }
  if (p.kind === 'hardware') return MATERIAL.hardware;
  if (p.kind === 'antenna') return MATERIAL.antenna;
  if (p.kind === 'trim') return MATERIAL.signal0;
  return MATERIAL[p.kind];
}

function artGeometry(p) {
  if (p.asset === 'rootLeft') return UNIT.kitRootLeft;
  if (p.asset === 'rootRight') return UNIT.kitRootRight;
  if (p.asset === 'antenna') return UNIT.kitAntenna;
  return UNIT.plate;
}

function artMaterialFor(p) {
  if (p.kind === 'summitPlate') return MATERIAL.summitPlate;
  if (p.asset === 'core') return MATERIAL.coreArt;
  return MATERIAL.atlasArt;
}

const apertureRig = {
  shutters: [],
  lens: null,
  rings: [],
};
const ruptureRig = {
  mesh: null,
};
const mechanicalRig = {
  groups: null,
  turbine: null,
};

const mechanicalState = {
  packetAt: -Infinity,
  ruptureAt: -Infinity,
  transmissionAt: -Infinity,
  lastAt: null,
  turbineAngle: 0,
  attackCommitted: false,
  pose: crownMechanicalPose(),
};

function createMechanicalGroups(root) {
  const core = crownSignal.s;
  const specs = {
    root: { name: 'Crown root mechanical group', s: core,
      y: CROWN_APPROACH.deckY - 0.15, depth: -2.02 },
    core: { name: 'Crown core mechanical group', s: core,
      y: crownSignal.coreY, depth: -1.82 },
    antenna: { name: 'Crown antenna mechanical group', s: core + 2.90,
      y: CROWN_APPROACH.deckY + 15.38, depth: -3.74 },
    shell: { name: 'Crown shell mechanical group', s: core,
      y: crownSignal.coreY, depth: -3.46 },
  };
  const groups = {};
  for (const [role, anchor] of Object.entries(specs)) {
    const group = new THREE.Group();
    group.name = anchor.name;
    group.userData.crownRole = `${role}-mechanical-group`;
    placeAnchor(group, anchor);
    group.userData.crownMotionBase = Object.freeze({
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
      rz: group.rotation.z,
      yaw: group.rotation.y,
    });
    root.add(group);
    groups[role] = group;
  }
  mechanicalRig.groups = groups;
  return groups;
}

// Pool instance matrices and painted organs are authored in Crown-root world
// coordinates. Object3D.attach re-parents each existing draw while preserving
// that pose, giving the moving families real pivots without another mesh.
function attachPreservingPose(root, group, object) {
  if (!group || !object) return object;
  root.updateMatrixWorld(true);
  group.updateMatrixWorld(true);
  group.attach(object);
  return object;
}

function groupForPart(groups, p) {
  if (p.kind === 'rootArt' || p.kind === 'foundation') return groups.root;
  if (p.kind === 'antennaArt' || p.kind === 'antenna') return groups.antenna;
  if (p.kind === 'shell' || p.kind === 'damage') return groups.shell;
  if (p.kind === 'coreArt' || p.kind === 'backplane' || p.kind === 'hardware' ||
      p.kind === 'summitPlate' || p.kind === 'void') return groups.core;
  return null;
}

function buildAperture(root, p) {
  const group = new THREE.Group();
  group.name = 'Crown deep mechanical iris';
  group.userData.crownRole = 'aperture-mechanism';
  placeAnchor(group, p);
  root.add(group);

  const radius = p.w * 0.5;
  const fill = new THREE.Mesh(UNIT.apertureFill, MATERIAL.void);
  fill.name = 'Crown iris deep well';
  fill.scale.setScalar(radius * 0.96);
  fill.position.z = -0.16;
  group.add(fill);

  const backRing = new THREE.Mesh(UNIT.apertureRingWide, MATERIAL.apertureMachine);
  backRing.name = 'Crown iris recessed machinery ring';
  backRing.scale.setScalar(radius * 0.95);
  backRing.position.z = -0.105;
  group.add(backRing);
  apertureRig.rings.push(backRing);

  const turbine = new THREE.Group();
  turbine.name = 'Crown committed-attack turbine group';
  turbine.userData.crownRole = 'turbine-mechanical-group';
  group.add(turbine);
  mechanicalRig.turbine = turbine;

  const vaneRows = [];
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI * 2 * i / 10;
    const local = new THREE.Object3D();
    local.position.set(Math.cos(angle) * radius * 0.56, Math.sin(angle) * radius * 0.56, -0.045);
    local.rotation.z = angle + Math.PI * 0.18;
    local.scale.set(radius * 0.38, radius * 0.16, 0.07);
    local.updateMatrix();
    vaneRows.push({ p, matrix: local.matrix.clone() });
  }
  addPool(turbine, 'Crown iris turbine vanes', UNIT.turbineVane,
    MATERIAL.apertureMachine, vaneRows, 'aperture-turbine');

  const midRing = new THREE.Mesh(UNIT.apertureRingMid, MATERIAL.apertureRim);
  midRing.name = 'Crown iris induction ring';
  midRing.scale.setScalar(radius * 0.97);
  midRing.position.z = -0.010;
  group.add(midRing);
  apertureRig.rings.push(midRing);

  const innerRing = new THREE.Mesh(UNIT.apertureRingInner, MATERIAL.apertureMachine);
  innerRing.name = 'Crown iris inner stator';
  innerRing.scale.setScalar(radius * 0.97);
  innerRing.position.z = 0.018;
  group.add(innerRing);
  apertureRig.rings.push(innerRing);

  for (let i = 0; i < 6; i++) {
    const angle = Math.PI * 2 * i / 6 + Math.PI / 6;
    const mesh = new THREE.Mesh(UNIT.shutter, MATERIAL.apertureShutter);
    mesh.name = 'Crown physical iris shutter';
    mesh.scale.set(radius * 0.29, radius * 0.39, 0.075);
    mesh.position.set(
      Math.cos(angle) * radius * 0.57,
      Math.sin(angle) * radius * 0.57,
      0.040,
    );
    mesh.rotation.z = angle - Math.PI / 2;
    group.add(mesh);
    apertureRig.shutters.push({
      mesh,
      angle,
      radius: radius * 0.57,
      baseRotation: angle - Math.PI / 2,
    });
  }

  const lens = new THREE.Mesh(UNIT.apertureLens, MATERIAL.apertureLens);
  lens.name = 'Crown command lens';
  lens.scale.setScalar(radius * 0.22);
  lens.position.z = 0.075;
  group.add(lens);
  apertureRig.lens = lens;
  return group;
}

function buildRupture(root, p) {
  const group = new THREE.Group();
  group.name = 'Crown rupturing service shoulder';
  group.userData.crownRole = 'damage';
  placeAnchor(group, p);
  const mesh = new THREE.Mesh(UNIT.rupture, MATERIAL.damage);
  mesh.name = 'Crown hinged rupture plate';
  mesh.scale.set(p.w, p.h, p.d);
  group.add(mesh);
  root.add(group);
  ruptureRig.mesh = mesh;
  return group;
}

function applyApertureOpen(amount = 0) {
  const open = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < apertureRig.shutters.length; i++) {
    const row = apertureRig.shutters[i];
    const travel = row.radius + open * 0.48;
    row.mesh.position.x = Math.cos(row.angle) * travel;
    row.mesh.position.y = Math.sin(row.angle) * travel;
    row.mesh.rotation.z = row.baseRotation + (i % 2 ? -1 : 1) * open * 0.28;
  }
  if (ruptureRig.mesh) {
    ruptureRig.mesh.position.x = open * 0.62;
    ruptureRig.mesh.position.y = open * 0.15;
    ruptureRig.mesh.position.z = open * 0.065;
    ruptureRig.mesh.rotation.z = open * 0.18;
  }
}

function buildCrown() {
  const root = new THREE.Group();
  root.name = LEGACY_CROWN
    ? 'Crown summit legacy visual comparison'
    : 'Crown integrated command organ v4';
  const plan = crownBakePlan(CONFIG, CROWN_APPROACH.deckY, { legacy: LEGACY_CROWN });
  const motionGroups = createMechanicalGroups(root);
  const pools = new Map();
  const signalRows = [[], [], []];
  let paintedOrgans = 0;
  let signalPoolCount = 0;

  for (const p of plan) {
    if (p.kind === 'summitPlate' || p.kind === 'coreArt' ||
        p.kind === 'rootArt' || p.kind === 'antennaArt') {
      const material = artMaterialFor(p);
      if (!material) continue;
      const art = new THREE.Mesh(artGeometry(p), material);
      art.name = p.kind === 'summitPlate'
        ? 'Crown legacy summit panorama'
        : `Crown recessed ${p.asset} organ`;
      art.userData.crownRole = p.kind;
      art.userData.crownAsset = p.asset || 'legacy';
      art.userData.shadow = 'none';
      art.renderOrder = -30 + paintedOrgans;
      art.frustumCulled = false;
      place(art, p);
      root.add(art);
      attachPreservingPose(root, groupForPart(motionGroups, p), art);
      paintedOrgans++;
      continue;
    }
    if (/^signal[0-2]$/.test(p.kind)) {
      signalRows[p.stage || 0].push(p);
      continue;
    }
    if (p.kind === 'trim') {
      signalRows[0].push(p);
      continue;
    }
    if (p.kind === 'void') {
      const aperture = buildAperture(root, p);
      attachPreservingPose(root, motionGroups.core, aperture);
      continue;
    }
    if (p.kind === 'damage') {
      const rupture = buildRupture(root, p);
      attachPreservingPose(root, motionGroups.shell, rupture);
      continue;
    }

    const material = materialForPart(p);
    const materialName = Object.entries(MATERIAL).find(([, value]) => value === material)?.[0] || p.kind;
    const key = `${p.kind}:${p.shape}:${materialName}`;
    if (!pools.has(key)) pools.set(key, { p, rows: [], material });
    pools.get(key).rows.push({ p, matrix: partMatrix(p) });
  }

  for (const [key, bucket] of pools) {
    const { p, rows, material } = bucket;
    const pool = addPool(root, `Crown ${key} fixed pool`, UNIT[p.shape], material, rows, p.kind);
    attachPreservingPose(root, groupForPart(motionGroups, p), pool);
  }

  for (let stage = 0; stage < signalRows.length; stage++) {
    const rows = signalRows[stage];
    if (!rows.length) continue;
    for (const shape of new Set(rows.map((p) => p.shape))) {
      const shaped = rows.filter((p) => p.shape === shape);
      const motionGroup = stage === 0 ? motionGroups.root
        : stage === 1 ? motionGroups.core : motionGroups.antenna;
      const casing = addPool(root,
        `Crown stage ${stage + 1} ${shape} conductor casings`, UNIT[shape],
        MATERIAL.conduitCasing,
        shaped.map((p) => ({ p, matrix: partMatrix(p) })), 'signal-casing');
      attachPreservingPose(root, motionGroup, casing);
      const nerve = addPool(root,
        `Crown stage ${stage + 1} ${shape} recessed signal nerves`, UNIT[shape],
        MATERIAL[`signal${stage}`],
        shaped.map((p) => ({
          p,
          matrix: partMatrix(p, { z: 0.57, sx: 0.94, sy: 0.26, sz: 0.12 }),
        })), `signal${stage}`);
      attachPreservingPose(root, motionGroup, nerve);
      signalPoolCount += 2;
    }
  }

  root.userData.crownPresentation = Object.freeze({
    variant: LEGACY_CROWN ? 'legacy' : 'production',
    parts: plan.length,
    pools: pools.size + signalPoolCount,
    paintedOrgans,
    modularArt: !LEGACY_CROWN,
    stagedConductors: LEGACY_CROWN ? 0 : signalRows.filter((rows) => rows.length).length,
    physicalShutters: apertureRig.shutters.length,
    hingedRupture: !!ruptureRig.mesh,
    mechanicalGroups: Object.keys(motionGroups),
    turbineGroup: !!mechanicalRig.turbine,
    bounds: crownBounds(CONFIG, { legacy: LEGACY_CROWN }),
  });
  root.traverse((object) => {
    if (object.isMesh || object.isGroup) object.userData.environmentRole = 'crown-architecture';
  });
  scene.add(root);
  applyApertureOpen(0);
  return root;
}

export const crownRoot = ACTIVE_FIXTURE === null ? buildCrown() : null;
let crownCullStamp = '';

// Generated and texture-resident at boot, but owned by the built final facet.
export function updateCrownFacetCull() {
  if (!crownRoot) return;
  const stamp = routeVisibilityStamp();
  if (stamp === crownCullStamp) return;
  crownCullStamp = stamp;
  crownRoot.visible = routeRenderable(crownSignal.s);
}

updateCrownFacetCull();

const CROWN_SIGNAL = ACTIVE_FIXTURE === null ? new THREE.Color(PAL.capsule) : null;
const CROWN_WARM = ACTIVE_FIXTURE === null ? new THREE.Color(PAL.modCapsule) : null;

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

function stageEnergy(energy, stage, surge = 0) {
  return clamp01(energy * 3.15 - stage * 0.92 + surge * 0.24);
}

function glow(material, color, amount) {
  if (!material?.emissive) return;
  material.emissive.copy(color);
  material.emissiveIntensity = postGain() * amount;
}

function resetMechanicalGroups() {
  const groups = mechanicalRig.groups;
  if (groups) for (const group of Object.values(groups)) {
    const base = group.userData.crownMotionBase;
    group.position.set(base.x, base.y, base.z);
    group.rotation.z = base.rz;
  }
  if (mechanicalRig.turbine) mechanicalRig.turbine.rotation.z = 0;
}

function applyMechanicalPose(pose, turbineAngle) {
  const groups = mechanicalRig.groups;
  if (!groups) return;
  resetMechanicalGroups();

  const rootBase = groups.root.userData.crownMotionBase;
  groups.root.position.y = rootBase.y -
    pose.rootCompression * CROWN_MECHANICAL_LIMITS.packetRootTravel;

  const coreBase = groups.core.userData.crownMotionBase;
  groups.core.position.y = coreBase.y +
    pose.rootCompression * CROWN_MECHANICAL_LIMITS.packetCoreTravel +
    pose.coreKick * CROWN_MECHANICAL_LIMITS.transmissionCoreTravel * 0.18;
  const coreTravel = pose.transmissionRecoil *
    CROWN_MECHANICAL_LIMITS.transmissionCoreTravel;
  groups.core.position.x = coreBase.x - Math.cos(coreBase.yaw) * coreTravel;
  groups.core.position.z = coreBase.z + Math.sin(coreBase.yaw) * coreTravel;

  const antennaBase = groups.antenna.userData.crownMotionBase;
  groups.antenna.rotation.z = antennaBase.rz +
    pose.antennaWhip * CROWN_MECHANICAL_LIMITS.antennaWhipRadians;

  const shellBase = groups.shell.userData.crownMotionBase;
  const shellTravel = pose.transmissionRecoil *
    CROWN_MECHANICAL_LIMITS.shellRecoilTravel;
  groups.shell.position.x = shellBase.x + Math.cos(shellBase.yaw) * shellTravel;
  groups.shell.position.y = shellBase.y + shellTravel * 0.14;
  groups.shell.position.z = shellBase.z - Math.sin(shellBase.yaw) * shellTravel;
  // One central pivot gives left and right shell masses opposite travel. The
  // damaged right shoulder also owns its existing hinge, so recoil stays
  // intentionally asymmetric without splitting an instanced draw.
  groups.shell.rotation.z = shellBase.rz + pose.transmissionRecoil *
    CROWN_MECHANICAL_LIMITS.shellRecoilRadians;

  if (mechanicalRig.turbine) mechanicalRig.turbine.rotation.z = turbineAngle;
}

export function triggerCrownMechanicalAction(action, nowMs = 0) {
  if (!Object.hasOwn(mechanicalState, `${action}At`)) return false;
  mechanicalState[`${action}At`] = Number(nowMs) || 0;
  return true;
}

function driveCrownMechanics(nowMs, attackCommitted) {
  const now = Math.max(0, Number(nowMs) || 0);
  const dt = mechanicalState.lastAt === null || now < mechanicalState.lastAt
    ? 0 : now - mechanicalState.lastAt;
  mechanicalState.lastAt = now;
  mechanicalState.attackCommitted = !!attackCommitted;
  mechanicalState.turbineAngle = stepCrownTurbine(
    mechanicalState.turbineAngle, dt, mechanicalState.attackCommitted,
  );
  mechanicalState.pose = crownMechanicalPose({
    packetAgeMs: now - mechanicalState.packetAt,
    ruptureAgeMs: now - mechanicalState.ruptureAt,
    transmissionAgeMs: now - mechanicalState.transmissionAt,
  });
  applyMechanicalPose(mechanicalState.pose, mechanicalState.turbineAngle);
}

function resetCrownMechanics() {
  mechanicalState.packetAt = -Infinity;
  mechanicalState.ruptureAt = -Infinity;
  mechanicalState.transmissionAt = -Infinity;
  mechanicalState.lastAt = null;
  mechanicalState.turbineAngle = 0;
  mechanicalState.attackCommitted = false;
  mechanicalState.pose = crownMechanicalPose();
  resetMechanicalGroups();
}

/* Energy walks from the buried roots, through the iris, into the antenna.
   Armor and painted organs retain their authored colors. Only conductor cores,
   nested rings and the lens emit. Shutters translate/rotate and one damaged
   plate hinges; no Crown mesh scales, fades in, or grows. */
export function setCrownPresentation({
  energy = 0, surge = 0, nowMs = 0, attackCommitted = false,
} = {}) {
  if (!crownRoot || !MATERIAL) return;
  const e = clamp01(energy);
  const kick = clamp01(surge);
  const s0 = stageEnergy(e, 0, kick);
  const s1 = stageEnergy(e, 1, kick);
  const s2 = stageEnergy(e, 2, kick);

  glow(MATERIAL.signal0, CROWN_SIGNAL, s0 * 0.46 + kick * 0.10);
  glow(MATERIAL.signal1, CROWN_SIGNAL, s1 * 0.58 + kick * 0.12);
  glow(MATERIAL.signal2, CROWN_WARM, s2 * 0.72 + kick * 0.14);
  glow(MATERIAL.apertureRim, CROWN_SIGNAL, s1 * 0.38 + s2 * 0.20);
  glow(MATERIAL.apertureLens, CROWN_WARM, s1 * 0.30 + s2 * 0.70 + kick * 0.18);

  const opening = clamp01((e - 0.54) / 0.40 + kick * 0.34);
  applyApertureOpen(opening);
  driveCrownMechanics(nowMs, attackCommitted);
}

export function resetCrownPresentation() {
  if (!crownRoot || !MATERIAL) return;
  for (const material of [
    MATERIAL.signal0, MATERIAL.signal1, MATERIAL.signal2,
    MATERIAL.apertureRim, MATERIAL.apertureLens,
  ]) {
    if (!material?.emissive) continue;
    material.emissive.setHex(PAL.glowOff);
    material.emissiveIntensity = 1;
  }
  applyApertureOpen(0);
  resetCrownMechanics();
  // The landmark anchor itself is an invariant. All spectacle is local to
  // the registered mechanical families above.
  crownRoot.position.set(0, 0, 0);
  crownRoot.rotation.set(0, 0, 0);
  crownRoot.scale.set(1, 1, 1);
}

export function crownPresentationSnapshot() {
  return crownRoot ? {
    ...crownRoot.userData.crownPresentation,
    visible: crownRoot.visible,
    signalS: crownSignal.s,
    signalY: crownSignal.coreY,
    mechanics: {
      ...mechanicalState.pose,
      turbineAngle: mechanicalState.turbineAngle,
      attackCommitted: mechanicalState.attackCommitted,
      rootAnchored: crownRoot.position.lengthSq() === 0 &&
        crownRoot.rotation.x === 0 && crownRoot.rotation.y === 0 && crownRoot.rotation.z === 0 &&
        crownRoot.scale.x === 1 && crownRoot.scale.y === 1 && crownRoot.scale.z === 1,
    },
    assetPixels: {
      core: coreTexture?.image ? [coreTexture.image.width, coreTexture.image.height] : null,
      kit: kitTexture?.image ? [kitTexture.image.width, kitTexture.image.height] : null,
      legacy: legacyTexture?.image ? [legacyTexture.image.width, legacyTexture.image.height] : null,
    },
  } : { variant: 'fixture', visible: false, parts: 0, pools: 0 };
}

if (typeof window !== 'undefined') window.__HB_CROWN_PRESENTATION = crownPresentationSnapshot;
