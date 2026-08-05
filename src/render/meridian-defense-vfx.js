/* ================= MERIDIAN DEFENSE RESPONSE VFX ================= */
/* One optional atlas transient, two fixed body-response draws, and two fixed
 * pixel-native ambient-life draws. The simulation publishes
 * a renderer-free lifecycle through view.meridian; this module resolves that
 * event onto the already-baked foregroundResponseSockets() records. No mesh
 * follows RIG, a hostile, or a projectile, and no renderer callback can write
 * gameplay state. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentPitchAt } from '../pure/ascent.js';
import { installView } from '../sim/bridge.js';
import { DEFENSE_VFX_ART_SLOT } from './defense-vfx-art.js';
import { DEFENSE_VFX_PACK } from './defense-vfx-pack.js';
import { foregroundResponseSockets } from './level.js';
import { PAL } from './palette.js';
import { postGain } from './post.js';
import { HIDE, scene } from './scene.js';

const sockets = foregroundResponseSockets();
const socketsByPhase = Array.from({ length: 6 }, () => []);
for (const socket of sockets) {
  if (socket.phase >= 0 && socket.phase < socketsByPhase.length)
    socketsByPhase[socket.phase].push(socket);
}
for (const list of socketsByPhase) list.sort((a, b) => a.route.s - b.route.s);

const catalog = new Map();
for (const component of DEFENSE_VFX_PACK.components) {
  const key = `${component.defenseState}:${component.timingState}`;
  if (!catalog.has(key)) catalog.set(key, []);
  catalog.get(key).push(component);
}

const stats = {
  enabled: !!DEFENSE_VFX_ART_SLOT.tex,
  sockets: sockets.length,
  socketKinds: Object.fromEntries([...new Set(sockets.map((row) => row.kind))]
    .sort().map((kind) => [kind, sockets.filter((row) => row.kind === kind).length])),
  poolGeometry: DEFENSE_VFX_ART_SLOT.tex ? 1 : 0,
  poolSlots: DEFENSE_VFX_ART_SLOT.tex ? 1 : 0,
  mechanismPools: 2,
  mechanismParts: 10,
  ambientLifePools: 0,
  ambientLifeParts: 0,
  ambientLifeDrawSlots: 0,
  ambientLifeVisible: 0,
  ambientLifeMotions: 0,
  maxVisible: 0,
  drawSlots: 0,
  mechanismDrawSlots: 0,
  readableExtent: 0,
  stage: 'dormant',
  face: 0,
  state: 'observe',
  socketId: null,
  componentId: null,
  stageSwitches: 0,
  activations: 0,
  ambientCycles: 0,
  missedSocketEvents: 0,
  resets: 0,
};
const componentsUsed = new Set();
const faceSockets = Object.create(null);
const faceComponents = Object.create(null);

let geometry = null;
let material = null;
let mesh = null;
let mechanismRoot = null;
let scutePool = null;
let conduitPool = null;
let scuteMaterial = null;
let conduitMaterial = null;
let ambientShellPool = null;
let ambientJointPool = null;
let ambientShellMaterial = null;
let ambientJointMaterial = null;

function responseScuteGeometry() {
  // Seven-sided hull casting, triangulated directly instead of asking
  // ExtrudeGeometry for curves/bevels the shipped camera cannot resolve.
  // Six instances now cost 144 triangles rather than hundreds of tiny bevel
  // faces while retaining real thickness and an irregular mechanical edge.
  const outline = [
    [-0.50, -0.29], [-0.34, -0.50], [0.22, -0.45],
    [0.50, -0.16], [0.39, 0.31], [0.10, 0.50], [-0.43, 0.25],
  ];
  const positions = [];
  const push = (point, z) => positions.push(point[0], point[1], z);
  for (let i = 1; i < outline.length - 1; i++) {
    push(outline[0], 0.5); push(outline[i], 0.5); push(outline[i + 1], 0.5);
    push(outline[0], -0.5); push(outline[i + 1], -0.5); push(outline[i], -0.5);
  }
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    push(a, -0.5); push(b, -0.5); push(b, 0.5);
    push(a, -0.5); push(b, 0.5); push(a, 0.5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

if (DEFENSE_VFX_ART_SLOT.tex) {
  geometry = new THREE.PlaneGeometry(1, 1);
  geometry.userData.unitUv = Float32Array.from(geometry.attributes.uv.array);
  material = new THREE.MeshBasicMaterial({
    color: PAL.muzzle,
    map: DEFENSE_VFX_ART_SLOT.tex,
    transparent: true,
    opacity: 0,
    alphaTest: 0.018,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: false,
  });
  // Transparent DoubleSide materials otherwise submit separate front/back
  // passes. The response sheet is a flat cutout, so one pass is both correct
  // and keeps the pooled transient to one call / one quad.
  material.forceSinglePass = true;
  material.name = 'Meridian defense response atlas';
  material.alphaToCoverage = true;
  mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Meridian defense response pooled plane';
  mesh.userData.environmentRole = 'meridian-defense-response';
  mesh.userData.environmentOnly = true;
  mesh.userData.attachments = Object.freeze([]);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = true;
  mesh.visible = false;
  scene.add(mesh);

}

// The painted sheet is optional punctuation, never the Meridian itself.  Keep
// the physical ten-part response resident even when that sheet is disabled or
// misses the boot budget.  This also gives the new pixel/native direction a
// complete presentation path with zero generated-art dependency.
mechanismRoot = new THREE.Group();
mechanismRoot.name = 'Meridian defense body-owned mechanism';
mechanismRoot.userData.environmentRole = 'meridian-defense-response';
mechanismRoot.userData.environmentOnly = true;
mechanismRoot.userData.attachments = Object.freeze([]);
mechanismRoot.matrixAutoUpdate = false;
mechanismRoot.visible = false;

scuteMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.66,
  metalness: 0.68,
  flatShading: true,
  fog: true,
});
scuteMaterial.name = 'Meridian defense moving armour';
conduitMaterial = new THREE.MeshStandardMaterial({
  color: PAL.limb.machine,
  roughness: 0.48,
  metalness: 0.78,
  emissive: PAL.glowOff,
  emissiveIntensity: 0,
  flatShading: true,
  fog: true,
});
conduitMaterial.name = 'Meridian defense buried conductors';

scutePool = new THREE.InstancedMesh(
  responseScuteGeometry(), scuteMaterial, 6);
scutePool.name = 'Meridian defense shutters clamps and vent louvres';
scutePool.frustumCulled = false;
scutePool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const scuteA = new THREE.Color(PAL.limb.hull);
const scuteB = new THREE.Color(PAL.limb.scute);
for (let i = 0; i < 6; i++) scutePool.setColorAt(i, i % 3 ? scuteA : scuteB);
scutePool.instanceColor.needsUpdate = true;
mechanismRoot.add(scutePool);

conduitPool = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1), conduitMaterial, 4);
conduitPool.name = 'Meridian defense staged conduit rails';
conduitPool.frustumCulled = false;
conduitPool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mechanismRoot.add(conduitPool);
scene.add(mechanismRoot);
stats.mechanismPools = 2;
stats.mechanismParts = 10;

// Three tiny maintenance carriages keep the dormant hull alive between major
// immune responses.  They are deliberately built from square, low-part-count
// castings rather than down-scaled illustrations: chassis + opposed ratchets
// in one pool, two dark joint blocks in another.  All three carriages still
// cost exactly two draws, allocate nothing per frame, never glow, and occupy
// only authored off-route response sockets on the current visible face.
const AMBIENT_RIGS = 3;
const AMBIENT_SHELLS_PER_RIG = 3;
const AMBIENT_JOINTS_PER_RIG = 2;
ambientShellMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.74,
  metalness: 0.52,
  flatShading: true,
  fog: true,
});
ambientShellMaterial.name = 'Meridian pixel-native maintenance castings';
ambientJointMaterial = new THREE.MeshStandardMaterial({
  color: PAL.limb.shadow,
  roughness: 0.84,
  metalness: 0.34,
  flatShading: true,
  fog: true,
});
ambientJointMaterial.name = 'Meridian pixel-native maintenance joints';
ambientShellPool = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1), ambientShellMaterial,
  AMBIENT_RIGS * AMBIENT_SHELLS_PER_RIG,
);
ambientJointPool = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1), ambientJointMaterial,
  AMBIENT_RIGS * AMBIENT_JOINTS_PER_RIG,
);
ambientShellPool.name = 'Meridian dormant maintenance carriage shells';
ambientJointPool.name = 'Meridian dormant maintenance carriage joints';
for (const pool of [ambientShellPool, ambientJointPool]) {
  pool.frustumCulled = false;
  pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pool.userData.environmentRole = 'meridian-ambient-maintenance';
  pool.userData.environmentOnly = true;
  scene.add(pool);
}
const ambientHull = new THREE.Color(PAL.limb.hull);
const ambientScute = new THREE.Color(PAL.limb.scute);
for (let i = 0; i < ambientShellPool.count; i++)
  ambientShellPool.setColorAt(i, i % 3 ? ambientHull : ambientScute);
ambientShellPool.instanceColor.needsUpdate = true;
stats.ambientLifePools = 2;
stats.ambientLifeParts = ambientShellPool.count + ambientJointPool.count;

const _rotation = new THREE.Matrix4();
const _pitch = new THREE.Matrix4();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _center = new THREE.Vector3();
const _mechanismMatrix = new THREE.Matrix4();
const _part = new THREE.Object3D();
const _partColor = new THREE.Color();
const _mechanismPose = { open: 0, strike: 0, shear: 0, vent: 0 };
const _ambientBase = new THREE.Matrix4();
const _ambientTurn = new THREE.Matrix4();
const _ambientMatrix = new THREE.Matrix4();
const _ambientScale = new THREE.Vector3();
const _ambientOffset = new THREE.Vector3();
const ambientLifeSockets = new Array(AMBIENT_RIGS).fill(null);
let eventKey = '';
let currentSocket = null;
let currentComponent = null;
let currentStage = 'dormant';
let ambientCycle = -1;
let ambientLifeFace = -1;
let ambientLifeCycle = -1;
let ambientLifeHidden = false;

// Dormant hull machinery gets a slow, recurring physical breath between the
// authored immune events. It never draws the action atlas, glows, queues an
// impulse, or follows an actor; the same fixed shutters simply flex at a
// current-face response socket often enough to read as Meridian being alive.
const AMBIENT_PERIOD_MS = 3600;
const AMBIENT_ACTIVE_MS = 3000;
const AMBIENT_LIFE_PERIOD_MS = 2800;
const AMBIENT_LIFE_ACTIVE_MS = 2300;

function hashString(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function hideAmbientLife() {
  if (!ambientShellPool || !ambientJointPool) return;
  if (!ambientLifeHidden) {
    for (let i = 0; i < ambientShellPool.count; i++)
      ambientShellPool.setMatrixAt(i, HIDE);
    for (let i = 0; i < ambientJointPool.count; i++)
      ambientJointPool.setMatrixAt(i, HIDE);
    ambientShellPool.instanceMatrix.needsUpdate = true;
    ambientJointPool.instanceMatrix.needsUpdate = true;
    ambientLifeHidden = true;
  }
  stats.ambientLifeVisible = 0;
  stats.ambientLifeMotions = 0;
  stats.ambientLifeDrawSlots = 0;
}

// MENU can render before the first simulation tick. Seed every fixed slot to
// the shared hidden matrix so the pool never flashes as fifteen unit cubes at
// the world origin during that first frame.
hideAmbientLife();

function ambientWorldPart(pool, index, socket, pitch,
  lx, ly, lz, sx, sy, sz, rz = 0) {
  const yaw = socket.world.yaw;
  _ambientBase.makeRotationY(yaw);
  _ambientBase.multiply(_ambientTurn.makeRotationZ(pitch));
  _ambientMatrix.copy(_ambientBase);
  if (rz) _ambientMatrix.multiply(_ambientTurn.makeRotationZ(rz));
  _ambientMatrix.scale(_ambientScale.set(sx, sy, sz));
  _ambientOffset.set(lx, ly, lz).applyMatrix4(_ambientBase);
  _ambientMatrix.setPosition(
    socket.world.x + _ambientOffset.x,
    socket.world.y + _ambientOffset.y,
    socket.world.z + _ambientOffset.z,
  );
  pool.setMatrixAt(index, _ambientMatrix);
}

function chooseAmbientLifeSockets(event, cycle) {
  if (ambientLifeFace === event.face && ambientLifeCycle === cycle) return;
  ambientLifeFace = event.face;
  ambientLifeCycle = cycle;
  ambientLifeSockets.fill(null);
  const list = socketsByPhase[event.phase] || [];
  if (!list.length) return;
  const lo = Math.max(event.playerX - 25, Math.min(event.viewLeft, event.viewRight) - 2);
  const hi = Math.min(event.playerX + 34, Math.max(event.viewLeft, event.viewRight) + 2,
    event.cornerLimit);
  const start = hashString(`ambient-life:${event.face}:${cycle}`) % list.length;
  let filled = 0;
  for (let step = 0; step < list.length && filled < AMBIENT_RIGS; step++) {
    const socket = list[(start + step) % list.length];
    if (!socket.causeResponse || !socket.route.offRoute ||
        socket.route.s < lo || socket.route.s > hi ||
        Math.abs(socket.route.s - event.playerX) < socket.route.safeFromPlayerRadius)
      continue;
    let separated = true;
    for (let i = 0; i < filled; i++) {
      if (Math.abs(ambientLifeSockets[i].route.s - socket.route.s) < 4.2) {
        separated = false;
        break;
      }
    }
    if (separated) ambientLifeSockets[filled++] = socket;
  }
  // Sparse faces still get life. Revisit legal sockets and relax only the
  // visual spacing; player/corner safety and current-face ownership remain.
  for (let step = 0; step < list.length && filled < AMBIENT_RIGS; step++) {
    const socket = list[(start + step) % list.length];
    if (ambientLifeSockets.includes(socket) || !socket.causeResponse ||
        !socket.route.offRoute || socket.route.s < lo || socket.route.s > hi ||
        Math.abs(socket.route.s - event.playerX) < socket.route.safeFromPlayerRadius)
      continue;
    ambientLifeSockets[filled++] = socket;
  }
}

function syncAmbientLife(event) {
  const allowed = event && event.stage === 'dormant' && event.face > 0 &&
    (event.reason === 'awaiting-activation' || event.reason === 'spent');
  if (!allowed) return hideAmbientLife();

  const now = Math.max(0, Number(event.nowMs) || 0);
  const cycle = Math.floor(now / AMBIENT_LIFE_PERIOD_MS);
  chooseAmbientLifeSockets(event, cycle);
  let visible = 0;
  let moving = 0;
  for (let rig = 0; rig < AMBIENT_RIGS; rig++) {
    const socket = ambientLifeSockets[rig];
    const shellBase = rig * AMBIENT_SHELLS_PER_RIG;
    const jointBase = rig * AMBIENT_JOINTS_PER_RIG;
    if (!socket) {
      for (let partIndex = 0; partIndex < AMBIENT_SHELLS_PER_RIG; partIndex++)
        ambientShellPool.setMatrixAt(shellBase + partIndex, HIDE);
      for (let partIndex = 0; partIndex < AMBIENT_JOINTS_PER_RIG; partIndex++)
        ambientJointPool.setMatrixAt(jointBase + partIndex, HIDE);
      continue;
    }
    const phaseOffset = rig * (AMBIENT_LIFE_PERIOD_MS / AMBIENT_RIGS) +
      (hashString(socket.id) % 420);
    const local = (now + phaseOffset) % AMBIENT_LIFE_PERIOD_MS;
    const active = local < AMBIENT_LIFE_ACTIVE_MS;
    const raw = active ? local / AMBIENT_LIFE_ACTIVE_MS : 1;
    // Twelve deliberate route-space detents preserve a clean, authored
    // pixel-step at FAR rather than sub-pixel mush from a smooth tween.
    const step = Math.min(11, Math.floor(raw * 12));
    const stride = step / 11;
    const direction = (hashString(socket.id) & 1) ? 1 : -1;
    const travel = direction * (-0.52 + stride * 1.04);
    const foreLift = active && (step & 1) ? 0.10 : 0;
    const rearLift = active && !(step & 1) ? 0.10 : 0;
    const pitch = normalAscentPitchAt(socket.route.s, CONFIG.levelLength);
    const shiver = active && (step === 4 || step === 9) ? direction * 0.08 : 0;

    ambientWorldPart(ambientShellPool, shellBase, socket, pitch,
      travel, 0.02, -0.10, 0.54, 0.24, 0.26, shiver);
    ambientWorldPart(ambientShellPool, shellBase + 1, socket, pitch,
      travel - 0.24, -0.17 + rearLift, -0.08, 0.20, 0.18, 0.20,
      -0.20 - rearLift * 0.8);
    ambientWorldPart(ambientShellPool, shellBase + 2, socket, pitch,
      travel + 0.24, -0.17 + foreLift, -0.08, 0.20, 0.18, 0.20,
      0.20 + foreLift * 0.8);
    ambientWorldPart(ambientJointPool, jointBase, socket, pitch,
      travel - 0.17, 0.15, -0.07, 0.10, 0.09, 0.29);
    ambientWorldPart(ambientJointPool, jointBase + 1, socket, pitch,
      travel + 0.17, 0.15, -0.07, 0.10, 0.09, 0.29);
    visible++;
    if (active) moving++;
  }
  ambientShellPool.instanceMatrix.needsUpdate = true;
  ambientJointPool.instanceMatrix.needsUpdate = true;
  ambientLifeHidden = visible === 0;
  stats.ambientLifeVisible = visible;
  stats.ambientLifeMotions = moving;
  stats.ambientLifeDrawSlots = visible ? 2 : 0;
}

function stageHook(socket, stage) {
  if (stage === 'tell') return socket.hooks.includes('armed');
  if (stage === 'fire')
    return socket.hooks.includes('active') || socket.hooks.includes('armed');
  if (stage === 'recovery')
    return socket.hooks.includes('spent') || socket.hooks.includes('active') ||
      socket.hooks.includes('armed');
  return socket.hooks.includes('spent') || socket.hooks.includes('armed');
}

function selectSocket(event) {
  const list = socketsByPhase[event.phase] || [];
  const lo = Math.max(event.playerX - 24, Math.min(event.viewLeft, event.viewRight) - 2);
  const hi = Math.min(event.playerX + 34, Math.max(event.viewLeft, event.viewRight) + 2,
    event.cornerLimit);
  const target = event.playerX + 11;
  let best = null;
  let bestScore = Infinity;
  for (const socket of list) {
    if (socket.state !== event.state || !socket.causeResponse ||
        !socket.route.offRoute || socket.route.playerAdjacent) continue;
    if (socket.route.s < lo || socket.route.s > hi) continue;
    if (Math.abs(socket.route.s - event.playerX) < socket.route.safeFromPlayerRadius) continue;
    if (!stageHook(socket, 'tell')) continue;
    const score = Math.abs(socket.route.s - target) +
      (socket.route.s < event.playerX ? 2.5 : 0);
    if (score < bestScore) { best = socket; bestScore = score; }
  }
  return best;
}

function selectComponent(event, stage) {
  const entries = catalog.get(`${event.state}:${stage}`) || [];
  if (!entries.length) return null;
  const wanted = event.stageDurationMs || 0;
  let bestDelta = Infinity;
  const closest = [];
  for (const entry of entries) {
    const delta = Math.abs(entry.durationMs - wanted);
    if (delta < bestDelta) {
      bestDelta = delta;
      closest.length = 0;
      closest.push(entry);
    } else if (delta === bestDelta) closest.push(entry);
  }
  return closest[hashString(`${currentSocket?.id}:${event.face}:${stage}`) % closest.length];
}

function configureComponent(component) {
  currentComponent = component;
  stats.componentId = component?.id || null;
  if (!component || !material || !geometry) return;
  const [u0, top, u1, bottom] = component.uv;
  // Bake the selected atlas rectangle into the one resident quad's UVs.
  // The atlas Texture itself stays immutable: no clone, repeat/offset crop,
  // canvas pass or upload is introduced when a stage changes.
  const uv = geometry.attributes.uv;
  const unit = geometry.userData.unitUv;
  for (let i = 0; i < uv.count; i++) {
    const u = unit[i * 2], v = unit[i * 2 + 1];
    uv.setXY(i, u0 + u * (u1 - u0), 1 - bottom + v * (bottom - top));
  }
  uv.needsUpdate = true;
  mesh.renderOrder = component.depth === 'front-particles' ? 14 :
    component.depth === 'action-plane' ? 12 : 10;
  componentsUsed.add(component.id);
}

function recordSocket(event) {
  if (!currentSocket) return;
  stats.socketId = currentSocket.id;
  faceSockets[event.face] = {
    id: currentSocket.id,
    phase: currentSocket.phase,
    state: currentSocket.state,
    routeS: currentSocket.route.s,
    playerDistance: Math.abs(currentSocket.route.s - event.playerX),
    cornerLimit: event.cornerLimit,
  };
}

function hide(stage = 'dormant') {
  if (mesh) mesh.visible = false;
  if (material) material.opacity = 0;
  if (mechanismRoot) mechanismRoot.visible = false;
  if (conduitMaterial) {
    conduitMaterial.emissive.setHex(PAL.glowOff);
    conduitMaterial.emissiveIntensity = 0;
  }
  stats.drawSlots = 0;
  stats.mechanismDrawSlots = 0;
  stats.readableExtent = 0;
  stats.stage = stage;
  if (stage === 'dormant') {
    stats.socketId = null;
    stats.componentId = null;
  }
}

function opacityAt(stage, progress, cap) {
  if (stage === 'tell') return cap * Math.sin(progress * Math.PI / 2);
  if (stage === 'fire') return cap * (0.82 + Math.sin(progress * Math.PI) * 0.18);
  if (stage === 'recovery') return cap * 0.42 * (1 - progress);
  return cap * 0.20 * (1 - progress);
}

function stageScale(stage, progress) {
  if (stage === 'tell') return 0.94 + progress * 0.06;
  if (stage === 'fire') return 0.98 + Math.sin(progress * Math.PI) * 0.055;
  if (stage === 'recovery') return 1 + progress * 0.035;
  return 1;
}

const STATE_INDEX = Object.freeze({
  observe: 0, intercept: 1, contain: 2,
  quarantine: 3, sterilize: 4, scuttle: 5,
});

function ease(v) {
  const u = Math.max(0, Math.min(1, Number(v) || 0));
  return u * u * (3 - 2 * u);
}

function part(pool, index, x, y, z, sx, sy, sz, rz = 0) {
  _part.position.set(x, y, z);
  _part.rotation.set(0, 0, rz);
  _part.scale.set(sx, sy, sz);
  _part.updateMatrix();
  pool.setMatrixAt(index, _part.matrix);
}

function mechanismPose(stage, progress, stateIndex) {
  const u = ease(progress);
  const late = ease((progress - 0.58) / 0.42);
  if (stage === 'ambient') {
    const breath = Math.sin(progress * Math.PI);
    _mechanismPose.open = 0.08 + breath * (0.13 + stateIndex * 0.008);
    _mechanismPose.strike = 0;
    _mechanismPose.shear = 0;
    _mechanismPose.vent = 0.08 + breath * 0.18;
    return _mechanismPose;
  }
  if (stage === 'tell') {
    _mechanismPose.open = 0.18 + u * (0.34 + stateIndex * 0.045);
    _mechanismPose.strike = 0;
    _mechanismPose.shear = 0;
    _mechanismPose.vent = u * (stateIndex >= 2 ? 0.72 : 0.30);
    return _mechanismPose;
  }
  if (stage === 'fire') {
    const punch = Math.sin(Math.min(1, progress / 0.36) * Math.PI);
    _mechanismPose.open = stateIndex === 1 || stateIndex === 3
      ? 0.06 + late * 0.10 : 0.62 + stateIndex * 0.045;
    _mechanismPose.strike = punch;
    _mechanismPose.shear = stateIndex === 5 ? ease(progress / 0.66) : 0;
    _mechanismPose.vent = stateIndex >= 2 ? 1 : 0.42;
    return _mechanismPose;
  }
  if (stage === 'recovery') {
    _mechanismPose.open = stateIndex === 5 ? 0.82 : 0.56 * (1 - u) + 0.16;
    _mechanismPose.strike = 0;
    _mechanismPose.shear = stateIndex === 5 ? 0.82 + u * 0.18 : 0;
    _mechanismPose.vent = (1 - u) * (stateIndex >= 2 ? 0.72 : 0.26);
    return _mechanismPose;
  }
  _mechanismPose.open = stateIndex === 5 ? 0.95 : 0.08 * (1 - u);
  _mechanismPose.strike = 0;
  _mechanismPose.shear = stateIndex === 5 ? 1 : 0;
  _mechanismPose.vent = 0;
  return _mechanismPose;
}

function placeMechanism(event, progress, rotation, yaw, stageOverride = null) {
  if (!mechanismRoot || !scutePool || !conduitPool || !currentSocket) return;
  const stateIndex = STATE_INDEX[event.state] ?? 0;
  const stage = stageOverride || event.stage;
  const ambient = stage === 'ambient';
  const pose = mechanismPose(stage, progress, stateIndex);
  const extent = (4.6 + stateIndex * 0.58) * (ambient ? 0.62 : 1);
  const split = 0.48 + pose.open * (0.76 + stateIndex * 0.055);
  const shear = pose.shear * (0.72 + stateIndex * 0.06);
  const slam = pose.strike * (stateIndex === 1 || stateIndex === 3 ? -0.34 : 0.18);
  const fan = 0.12 + pose.vent * (0.22 + stateIndex * 0.014);
  const jawH = (2.16 + stateIndex * 0.13) * (ambient ? 0.70 : 1);
  const jawW = (0.46 + stateIndex * 0.025) * (ambient ? 0.86 : 1);

  // Opposed armour jaws. Observe parts, Intercept/Quarantine strike inward,
  // Contain/Sterilize open into a vent/collimator, and Scuttle tears both
  // halves away from their fasteners. The six asymmetrical pieces keep the
  // response from reading as a decal or a perfect icon.
  part(scutePool, 0, -split - shear, 0.12 + shear * 0.18, 0,
    jawW, jawH, 0.32, -fan - shear * 0.16 + slam);
  part(scutePool, 1, split + shear * 0.78, -0.08 - shear * 0.12, 0.01,
    jawW * 1.08, jawH * 0.91, 0.34, fan + shear * 0.12 - slam);
  part(scutePool, 2, -0.30 - shear * 0.44, 1.24 + pose.open * 0.30, -0.04,
    extent * 0.29, 0.28, 0.28, 0.08 + fan * 0.38);
  part(scutePool, 3, 0.42 + shear * 0.50, -1.18 - pose.open * 0.26, -0.03,
    extent * 0.32, 0.26, 0.30, -0.06 - fan * 0.46);
  part(scutePool, 4, -extent * 0.31 - shear * 0.34, 0.64, -0.08,
    extent * 0.21, 0.20, 0.24, 0.28 + fan + shear * 0.12);
  part(scutePool, 5, extent * 0.30 + shear * 0.38, -0.58, -0.07,
    extent * 0.23, 0.22, 0.25, -0.24 - fan - shear * 0.09);
  scutePool.instanceMatrix.needsUpdate = true;

  const railSpread = 0.33 + pose.open * 0.34;
  const railLength = extent * (0.42 + stateIndex * 0.018);
  part(conduitPool, 0, -railSpread, 0.56, -0.13,
    railLength, 0.085, 0.12, 0.10 + fan * 0.12);
  part(conduitPool, 1, railSpread, -0.48, -0.12,
    railLength * 0.94, 0.080, 0.12, -0.09 - fan * 0.10);
  part(conduitPool, 2, -0.14, 0.16, -0.11,
    0.10, 1.38 + pose.vent * 0.44, 0.12, fan * 0.36);
  part(conduitPool, 3, 0.34, -0.10, -0.10,
    0.10, 1.22 + pose.vent * 0.38, 0.12, -fan * 0.42);
  conduitPool.instanceMatrix.needsUpdate = true;

  const actionEnergy = stage === 'fire'
    ? 0.42 + pose.strike * 0.58
    : stage === 'tell' ? progress * 0.16
      : stage === 'recovery' ? (1 - progress) * 0.12 : 0;
  conduitMaterial.emissive.copy(_partColor.setHex(
    stateIndex >= 4 ? PAL.capsule : PAL.modCapsule));
  conduitMaterial.emissiveIntensity = postGain() * actionEnergy;

  _mechanismMatrix.copy(rotation);
  _mechanismMatrix.setPosition(
    currentSocket.world.x - Math.sin(yaw) * 0.035,
    currentSocket.world.y,
    currentSocket.world.z - Math.cos(yaw) * 0.035,
  );
  mechanismRoot.matrix.copy(_mechanismMatrix);
  mechanismRoot.matrixWorldNeedsUpdate = true;
  mechanismRoot.visible = true;
  stats.mechanismDrawSlots = 2;
  stats.readableExtent = Number(extent.toFixed(2));
}

function syncAmbient(event) {
  const allowed = event.face > 0 &&
    (event.reason === 'awaiting-activation' || event.reason === 'spent');
  if (!allowed || !mechanismRoot) {
    ambientCycle = -1;
    hideAmbientLife();
    return hide();
  }
  syncAmbientLife(event);
  const shifted = Math.max(0, Number(event.nowMs) || 0) + event.phase * 733;
  const cycle = Math.floor(shifted / AMBIENT_PERIOD_MS);
  const local = shifted - cycle * AMBIENT_PERIOD_MS;
  if (local >= AMBIENT_ACTIVE_MS) return hide();

  if (cycle !== ambientCycle || !currentSocket ||
      currentSocket.phase !== event.phase ||
      currentSocket.route.s > event.cornerLimit) {
    ambientCycle = cycle;
    currentSocket = selectSocket(event);
    if (currentSocket) stats.ambientCycles++;
  }
  if (!currentSocket) return hide();

  const progress = local / AMBIENT_ACTIVE_MS;
  const yaw = currentSocket.world.yaw;
  const pitch = normalAscentPitchAt(currentSocket.route.s, CONFIG.levelLength);
  _rotation.makeRotationY(yaw);
  _rotation.multiply(_pitch.makeRotationZ(pitch));
  placeMechanism(event, progress, _rotation, yaw, 'ambient');
  if (mesh) mesh.visible = false;
  if (material) material.opacity = 0;
  stats.drawSlots = 0;
  stats.stage = 'ambient';
}

function place(event) {
  if (!currentSocket) return hide(event.stage);
  const component = currentComponent;
  const stage = event.stage;
  const progress = Math.max(0, Math.min(1, event.progress || 0));
  const yaw = currentSocket.world.yaw;
  const pitch = normalAscentPitchAt(currentSocket.route.s, CONFIG.levelLength);
  _rotation.makeRotationY(yaw);
  _rotation.multiply(_pitch.makeRotationZ(pitch));
  placeMechanism(event, progress, _rotation, yaw);
  stats.stage = stage;
  // A missing/retired painted transient must not erase the response. The
  // native shutters above tell/fire/recover on their own; only the optional
  // pressure/debris punctuation disappears.
  if (!mesh || !material || !component) {
    if (mesh) mesh.visible = false;
    if (material) material.opacity = 0;
    stats.drawSlots = 0;
    return;
  }
  const opacity = opacityAt(stage, progress, component.maxOpacity);
  const stateIndex = STATE_INDEX[event.state] ?? 0;
  const baseHeight = stage === 'fire' ? 4.15 + stateIndex * 0.22
    : stage === 'tell' ? 3.05 + stateIndex * 0.14
      : stage === 'recovery' ? 3.45 + stateIndex * 0.16
        : 2.55 + stateIndex * 0.12;
  let height = baseHeight;
  let width = height * component.nativeAspect;
  const maxWidth = stage === 'fire' ? 11.8 + stateIndex * 0.62
    : stage === 'tell' ? 9.2 + stateIndex * 0.42
      : 10.2 + stateIndex * 0.46;
  if (width > maxWidth) {
    const fit = maxWidth / width;
    width *= fit;
    height *= fit;
  }
  const pulse = stageScale(stage, progress);
  width *= pulse;
  height *= pulse;

  if (opacity <= 0.002) {
    mesh.visible = false;
    material.opacity = 0;
    stats.drawSlots = 0;
    return;
  }
  _offset.set(
    -(component.origin[0] - 0.5) * width,
    -(0.5 - component.origin[1]) * height,
    0,
  ).applyMatrix4(_rotation);
  const depth = component.depth === 'front-particles' ? 0.12 :
    component.depth === 'action-plane' ? 0.065 : 0.02;
  _center.set(
    currentSocket.world.x + Math.sin(yaw) * depth,
    currentSocket.world.y,
    currentSocket.world.z + Math.cos(yaw) * depth,
  ).add(_offset);
  _matrix.copy(_rotation);
  _matrix.scale(_scale.set(width, height, 1));
  _matrix.setPosition(_center);
  mesh.matrix.copy(_matrix);
  mesh.matrixWorldNeedsUpdate = true;
  material.opacity = opacity;
  mesh.visible = true;
  stats.drawSlots = 1;
  stats.maxVisible = 1;
}

function sync(event) {
  stats.face = event?.face || 0;
  stats.state = event?.state || 'observe';
  if (!event || !mechanismRoot) {
    eventKey = '';
    currentSocket = null;
    currentComponent = null;
    currentStage = 'dormant';
    hideAmbientLife();
    hide();
    return;
  }
  if (event.stage === 'dormant') {
    eventKey = '';
    currentComponent = null;
    currentStage = 'dormant';
    syncAmbient(event);
    return;
  }
  ambientCycle = -1;
  hideAmbientLife();

  const nextKey = `${event.face}:${event.startedAtMs}`;
  if (nextKey !== eventKey) {
    eventKey = nextKey;
    currentSocket = selectSocket(event);
    currentComponent = null;
    currentStage = 'dormant';
    stats.activations++;
    stats.socketId = currentSocket?.id || null;
    recordSocket(event);
    if (!currentSocket) stats.missedSocketEvents++;
  }
  // Camera-edge calibration and a moving RIG can put the exact activation
  // frame between socket windows. Keep looking during the whole low tell;
  // nothing draws and no new event is manufactured until a current-face,
  // corner-safe socket becomes readable.
  if (!currentSocket && event.stage === 'tell') {
    currentSocket = selectSocket(event);
    recordSocket(event);
  }
  if (!currentSocket || currentSocket.phase !== event.phase ||
      currentSocket.route.s > event.cornerLimit) return hide(event.stage);
  if (event.stage !== currentStage) {
    currentStage = event.stage;
    stats.stageSwitches++;
    configureComponent(selectComponent(event, event.stage));
    if (!faceComponents[event.face]) faceComponents[event.face] = {};
    faceComponents[event.face][event.stage] = currentComponent?.id || null;
  }
  place(event);
}

function reset() {
  eventKey = '';
  currentSocket = null;
  currentComponent = null;
  currentStage = 'dormant';
  ambientCycle = -1;
  ambientLifeFace = -1;
  ambientLifeCycle = -1;
  ambientLifeSockets.fill(null);
  stats.resets++;
  stats.maxVisible = 0;
  stats.stageSwitches = 0;
  stats.activations = 0;
  stats.ambientCycles = 0;
  stats.missedSocketEvents = 0;
  stats.face = 0;
  stats.state = 'observe';
  componentsUsed.clear();
  for (const key of Object.keys(faceSockets)) delete faceSockets[key];
  for (const key of Object.keys(faceComponents)) delete faceComponents[key];
  hideAmbientLife();
  hide();
}

let meridianViewInstalled = false;
export function initMeridianView() {
  if (meridianViewInstalled) return false;
  installView({ meridian: { sync, reset } });
  meridianViewInstalled = true;
  return true;
}

export function meridianDefenseVfxSnapshot() {
  return {
    ...stats,
    componentsUsed: [...componentsUsed].sort(),
    faceSockets: Object.fromEntries(Object.entries(faceSockets)
      .map(([face, row]) => [face, { ...row }])),
    faceComponents: Object.fromEntries(Object.entries(faceComponents)
      .map(([face, row]) => [face, { ...row }])),
    atlasState: DEFENSE_VFX_ART_SLOT.state,
    atlasTextures: DEFENSE_VFX_ART_SLOT.gpuTextures,
    estimatedGpuBytes: DEFENSE_VFX_ART_SLOT.estimatedGpuBytes,
    totalDrawSlots: stats.drawSlots + stats.mechanismDrawSlots +
      stats.ambientLifeDrawSlots,
    fixedAtBoot: true,
    textureTransforms: false,
    environmentOnly: true,
    attachments: [],
    dormantDraws: stats.stage === 'dormant' ? stats.drawSlots : null,
    dormantMechanismDraws: stats.stage === 'dormant'
      ? stats.mechanismDrawSlots : null,
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_MERIDIAN_DEFENSE_VFX = meridianDefenseVfxSnapshot;
