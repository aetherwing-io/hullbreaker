/* ================= MERIDIAN DEFENSE RESPONSE VFX ================= */
/* One atlas, one reusable plane, one draw at most. The simulation publishes
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
import { scene } from './scene.js';

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
  maxVisible: 0,
  drawSlots: 0,
  stage: 'dormant',
  face: 0,
  state: 'observe',
  socketId: null,
  componentId: null,
  stageSwitches: 0,
  activations: 0,
  missedSocketEvents: 0,
  resets: 0,
};
const componentsUsed = new Set();
const faceSockets = Object.create(null);
const faceComponents = Object.create(null);

let geometry = null;
let material = null;
let mesh = null;
if (DEFENSE_VFX_ART_SLOT.tex) {
  geometry = new THREE.PlaneGeometry(1, 1);
  material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
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

const _rotation = new THREE.Matrix4();
const _pitch = new THREE.Matrix4();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _center = new THREE.Vector3();
let eventKey = '';
let currentSocket = null;
let currentComponent = null;
let currentStage = 'dormant';

function hashString(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
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
  if (!component || !material) return;
  const [u0, top, u1, bottom] = component.uv;
  material.map.repeat.set(u1 - u0, bottom - top);
  material.map.offset.set(u0, 1 - bottom);
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
  stats.drawSlots = 0;
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
  if (stage === 'tell') return 0.86 + progress * 0.14;
  if (stage === 'fire') return 0.96 + Math.sin(progress * Math.PI) * 0.10;
  if (stage === 'recovery') return 1 + progress * 0.07;
  return 1 + progress * 0.11;
}

function place(event) {
  if (!mesh || !currentSocket || !currentComponent) return hide(event.stage);
  const component = currentComponent;
  const stage = event.stage;
  const progress = Math.max(0, Math.min(1, event.progress || 0));
  const opacity = opacityAt(stage, progress, component.maxOpacity);
  if (opacity <= 0.002) return hide(stage);

  const baseHeight = stage === 'fire' ? 2.75 : stage === 'tell' ? 2.35 :
    stage === 'recovery' ? 2.20 : 1.90;
  let height = baseHeight;
  let width = height * component.nativeAspect;
  const maxWidth = stage === 'fire' ? 9.2 : stage === 'tell' ? 7.8 : 7.0;
  if (width > maxWidth) {
    const fit = maxWidth / width;
    width *= fit;
    height *= fit;
  }
  const pulse = stageScale(stage, progress);
  width *= pulse;
  height *= pulse;

  const yaw = currentSocket.world.yaw;
  const pitch = normalAscentPitchAt(currentSocket.route.s, CONFIG.levelLength);
  _rotation.makeRotationY(yaw);
  _rotation.multiply(_pitch.makeRotationZ(pitch));
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
  stats.stage = stage;
}

function sync(event) {
  stats.face = event?.face || 0;
  stats.state = event?.state || 'observe';
  if (!event || event.stage === 'dormant' || !mesh) {
    eventKey = '';
    currentSocket = null;
    currentComponent = null;
    currentStage = 'dormant';
    hide();
    return;
  }

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
  stats.resets++;
  stats.maxVisible = 0;
  stats.stageSwitches = 0;
  stats.activations = 0;
  stats.missedSocketEvents = 0;
  stats.face = 0;
  stats.state = 'observe';
  componentsUsed.clear();
  for (const key of Object.keys(faceSockets)) delete faceSockets[key];
  for (const key of Object.keys(faceComponents)) delete faceComponents[key];
  hide();
}

installView({ meridian: { sync, reset } });

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
    environmentOnly: true,
    attachments: [],
    dormantDraws: stats.stage === 'dormant' ? stats.drawSlots : null,
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_MERIDIAN_DEFENSE_VFX = meridianDefenseVfxSnapshot;
