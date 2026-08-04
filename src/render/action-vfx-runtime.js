/* ==================== ACTION VFX V2 RUNTIME ====================== */
/* A bounded painted-action accent layer.  It observes the finished bridge
 * chain (src/main.js imports it immediately AFTER juice), then places one of
 * twelve preallocated planes at exact damage/death endpoints.  Every plane
 * owns a material but all share one resident texture; every approved atlas
 * rectangle owns immutable boot-built UV geometry.  Event and frame paths
 * allocate no Object3D, geometry, material, texture, canvas, array, or crop.
 *
 * This is punctuation, never gameplay: no callback writes simulation state,
 * no complete actor is transformed, and route visibility keeps each mark on
 * the facet that owns its endpoint through a turn.                         */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { view } from '../sim/bridge.js';
import { gameMs, hitStopRemainingMs } from '../sim/time.js';
import { ACTION_VFX_ART_SLOT, actionVfxArtStats } from './action-vfx-art.js';
import {
  ACTION_VFX_COMPONENTS, ACTION_VFX_REJECTED, ACTION_VFX_RUPTURES,
  ACTION_VFX_WEAPONS,
} from './action-vfx-spec.js';
import { camera, renderer, scene } from './scene.js';
import { PAL } from './palette.js';
import { routeRenderable, routeWorldFacet } from './route-visibility.js';
import { towerPose } from './tower.js';

// Twelve is a hard draw ceiling, not a target.  At 130–300 ms lifetimes the
// ordinary fight sits at 1–3 visible marks; a screen-clearing trait burst
// recycles the oldest punctuation instead of adding traversal/draw pressure.
export const ACTION_VFX_ROW_MAX = 12;
const SURFACE_DEPTH = 1.34;
const IVORY_EMISSION_MAX = 0.14;
const DEG = Math.PI / 180;

const TARGET_PX = Object.freeze({
  R: 32,
  S: 38,
  L: 48,
  H: 34,
  F: 40,
  wasp: 34,
  hound: 42,
  machine: 44,
  warden: 48,
});

const geometries = [];
const rows = [];

function componentGeometry(component) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const [u0, top, u1, bottom] = component.uv;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), 1 - bottom + v * (bottom - top));
  }
  // The matrix anchor is the exact bridge endpoint.  Translating immutable
  // geometry once makes the authored atlas pivot, not the card center, land
  // on that point without a per-event offset or texture transform.
  geometry.translate(0.5 - component.pivot[0], component.pivot[1] - 0.5, 0);
  geometry.computeBoundingSphere();
  geometry.name = `action-vfx-v2:${component.id}`;
  geometry.userData.actionVfxId = component.id;
  return geometry;
}

if (ACTION_VFX_ART_SLOT.tex) {
  for (const component of ACTION_VFX_COMPONENTS)
    geometries.push(componentGeometry(component));

  for (let i = 0; i < ACTION_VFX_ROW_MAX; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: ACTION_VFX_ART_SLOT.tex,
      emissive: PAL.muzzle,
      emissiveMap: ACTION_VFX_ART_SLOT.tex,
      emissiveIntensity: 0,
      roughness: 0.62,
      metalness: 0.18,
      transparent: true,
      opacity: 0,
      alphaTest: 0.018,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: false,
    });
    material.forceSinglePass = true;
    material.alphaToCoverage = true;
    material.name = `Action VFX v2 pooled paint ${i}`;

    const mesh = new THREE.Mesh(geometries[0], material);
    mesh.name = `Action VFX v2 pooled row ${i}`;
    mesh.userData.actionVfx = true;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = true;
    mesh.renderOrder = 7;
    mesh.visible = false;
    scene.add(mesh);

    rows.push({
      mesh, material,
      active: false,
      component: 0,
      s: 0,
      y: 0,
      facet: 0,
      angle: 0,
      targetPx: 0,
      ageMs: 0,
      claimedAt: 0,
      durationMs: 0,
      peakMs: 0,
      fadeStartMs: 0,
    });
  }
}

const counters = {
  claims: 0,
  damageEndpoints: 0,
  deathEndpoints: 0,
  resets: 0,
  recycles: 0,
  liveRows: 0,
  visibleDraws: 0,
  maxVisibleDraws: 0,
  facetRejects: 0,
  faults: 0,
  collisionEvents: 0,
  damagedEvents: 0,
  lethalEvents: 0,
  undamagedEvents: 0,
  unsupportedWeaponEvents: 0,
};

// These are preallocated scalar records. The collision callback writes them
// synchronously; telemetry is the only path that materializes an object.
const lastDamage = {
  valid: false, s: 0, y: 0, vx: 0, vy: 0, type: 'R', id: '',
  targetId: 0, targetKind: '', lethal: false, collisionFrameMs: 0, sequence: 0,
};
const lastDeath = {
  valid: false, s: 0, y: 0, vx: 0, vy: 0, role: 'machine', id: '',
  targetId: 0, targetKind: '', collisionFrameMs: 0, sequence: 0,
};
const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
const _viewPoint = new THREE.Vector3();
const _yaw = new THREE.Matrix4();
const _roll = new THREE.Matrix4();
const _scale = new THREE.Matrix4();
const _matrix = new THREE.Matrix4();

let cursor = 0;
let impactSerial = 0;
let selectedMask = 0;
let lastFrameMs = gameMs;
let dead = false;
let observerInstallCalls = 0;
let observerInstallSuccesses = 0;
let observerInstallSkips = 0;
let lastRawMs = 0;
let lastDtMs = 0;
let hitStopHeldFrames = 0;

function validWeapon(type) {
  return type === 'R' || type === 'S' || type === 'L' || type === 'H' || type === 'F';
}

function hideRow(row) {
  row.mesh.visible = false;
  row.material.opacity = 0;
  row.material.emissiveIntensity = 0;
}

function retireAll(countReset) {
  for (let i = 0; i < rows.length; i++) {
    rows[i].active = false;
    hideRow(rows[i]);
  }
  counters.liveRows = 0;
  counters.visibleDraws = 0;
  cursor = 0;
  if (countReset) counters.resets++;
}

function warnDead(error) {
  if (!dead) console.warn(
    'HULLBREAKER action VFX v2: painted accents disabled after error', error,
  );
  dead = true;
  counters.faults++;
  retireAll(false);
}

function claim(componentIndex, s, y, angle, targetPx, delayMs) {
  if (!rows.length || dead) return;
  const component = ACTION_VFX_COMPONENTS[componentIndex];
  if (!component || component.reviewStatus !== 'production') return;

  const row = rows[cursor];
  cursor = (cursor + 1) % rows.length;
  if (row.active) counters.recycles++;

  row.active = true;
  row.component = componentIndex;
  row.s = s;
  row.y = y;
  row.facet = routeWorldFacet(s);
  row.angle = angle;
  row.targetPx = Math.max(component.screenExtentPx.min,
    Math.min(component.screenExtentPx.max, targetPx));
  row.ageMs = -delayMs;
  row.claimedAt = gameMs;
  row.durationMs = component.timing.durationMs;
  row.peakMs = component.timing.peakMs;
  row.fadeStartMs = component.timing.fadeStartMs;
  row.mesh.geometry = geometries[componentIndex];
  hideRow(row);

  selectedMask |= 1 << componentIndex;
  counters.claims++;
}

function onHostileImpact(
  _slot, type, x, y, vx, vy, targetId, targetKind, damaged, lethal,
) {
  counters.collisionEvents++;
  if (!damaged) {
    counters.undamagedEvents++;
    return;
  }
  counters.damagedEvents++;
  if (!validWeapon(type)) {
    counters.unsupportedWeaponEvents++;
    return;
  }

  // The terminal bullet branch owns all ten primitives. No actor polling,
  // recent-shot window, HP diff, or next-frame sync may alter this endpoint.
  const angle = Math.abs(vx) + Math.abs(vy) > 0.000001
    ? Math.atan2(vy, vx) : 0;
  const choices = ACTION_VFX_WEAPONS[type];
  const weaponIndex = choices[impactSerial % choices.length];
  impactSerial++;
  claim(weaponIndex, x, y, angle, TARGET_PX[type], 0);
  const weaponComponent = ACTION_VFX_COMPONENTS[weaponIndex];
  lastDamage.valid = true;
  lastDamage.s = x;
  lastDamage.y = y;
  lastDamage.vx = vx;
  lastDamage.vy = vy;
  lastDamage.type = type;
  lastDamage.id = weaponComponent.id;
  lastDamage.targetId = targetId;
  lastDamage.targetKind = targetKind;
  lastDamage.lethal = lethal;
  lastDamage.collisionFrameMs = gameMs;
  lastDamage.sequence = impactSerial;
  counters.damageEndpoints++;

  if (!lethal) return;
  counters.lethalEvents++;
  let role = 'machine';
  let componentIndex = ACTION_VFX_RUPTURES.machine;
  let targetPx = TARGET_PX.machine;

  if (targetKind === 'wasp') {
    role = 'wasp';
    componentIndex = ACTION_VFX_RUPTURES.wasp;
    targetPx = TARGET_PX.wasp;
  } else if (targetKind === 'hound') {
    role = 'hound';
    componentIndex = ACTION_VFX_RUPTURES.hound;
    targetPx = TARGET_PX.hound;
  } else if (targetKind === 'mortar') {
    role = 'mortar';
    componentIndex = ACTION_VFX_RUPTURES.mortar;
  } else if (targetKind === 'polyp') {
    role = 'polyp';
    componentIndex = ACTION_VFX_RUPTURES.polyp;
  } else if (targetKind === 'warden') {
    role = 'warden';
    targetPx = TARGET_PX.warden;
    const warden = ACTION_VFX_RUPTURES.warden;
    // Three small rooted beats replace one pasted explosion card.  All three
    // retain the exact Warden endpoint; delays affect reveal only.
    claim(warden[0], x, y, angle, targetPx, 0);
    claim(warden[1], x, y, angle + 0.5 * Math.PI, 44, 260);
    claim(warden[2], x, y, angle - 0.25 * Math.PI, 40, 550);
    componentIndex = warden[0];
  }

  if (role !== 'warden')
    claim(componentIndex, x, y, angle, targetPx, 0);

  const component = ACTION_VFX_COMPONENTS[componentIndex];
  lastDeath.valid = true;
  lastDeath.s = x;
  lastDeath.y = y;
  lastDeath.vx = vx;
  lastDeath.vy = vy;
  lastDeath.role = role;
  lastDeath.id = component.id;
  lastDeath.targetId = targetId;
  lastDeath.targetKind = targetKind;
  lastDeath.collisionFrameMs = gameMs;
  lastDeath.sequence = impactSerial;
  counters.deathEndpoints++;
}

function onStateScreen(next) {
  if (next !== 'PLAYING') return;
  retireAll(true);
  impactSerial = 0;
  lastDamage.valid = false;
  lastDeath.valid = false;
  lastFrameMs = gameMs;
}

function installStateAfter(name, observer) {
  const holder = view;
  const previous = holder[name];
  holder[name] = (a, b, c) => {
    previous(a, b, c);
    if (dead) return;
    try { observer(a, b, c); } catch (error) { warnDead(error); }
  };
}

function installImpactAfter(observer) {
  const previous = view.bullets.hostileImpact;
  view.bullets.hostileImpact = (a, b, c, d, e, f, g, h, i, j) => {
    previous(a, b, c, d, e, f, g, h, i, j);
    if (dead) return;
    try { observer(a, b, c, d, e, f, g, h, i, j); }
    catch (error) { warnDead(error); }
  };
}

let observersInstalled = false;

// Static-import source order is not a sufficient postcondition when an art
// owner above us suspends on top-level await: a late renderer can otherwise
// resume and overwrite a wrapper. Main calls this explicit installer from its
// body, after *all* dependencies have settled, and immediately after juice's
// corresponding installer. Delegation still happens first at every event.
export function installActionVfxObservers() {
  observerInstallCalls++;
  if (!ACTION_VFX_ART_SLOT.tex || observersInstalled) {
    observerInstallSkips++;
    return false;
  }
  observersInstalled = true;
  observerInstallSuccesses++;
  installImpactAfter(onHostileImpact);
  installStateAfter('stateScreen', onStateScreen);
  return true;
}

function stepRows(dtMs) {
  let live = 0;
  let visible = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.active) {
      if (row.mesh.visible) hideRow(row);
      continue;
    }

    // A claim made by a bridge hook later in this same sim frame starts at
    // exact age zero. Existing rows advance on juice's clock: hit-stop holds
    // physical paint with the actor instead of letting its card finish early.
    if (row.claimedAt !== gameMs) row.ageMs += dtMs;
    const elapsed = row.ageMs;
    if (elapsed >= row.durationMs) {
      row.active = false;
      hideRow(row);
      continue;
    }

    live++;
    if (elapsed < 0) {
      hideRow(row);
      continue;
    }

    // Both predicates are intentional. routeRenderable owns current camera
    // topology; the frozen facet proves a mark can never migrate if path data
    // or a future fixture remaps the same logical coordinate during its life.
    if (!routeRenderable(row.s) || routeWorldFacet(row.s) !== row.facet) {
      hideRow(row);
      counters.facetRejects++;
      continue;
    }

    const component = ACTION_VFX_COMPONENTS[row.component];
    const pose = towerPose(row.s, _pose);
    const x = pose.x + Math.sin(pose.yaw) * SURFACE_DEPTH;
    const y = row.y + pose.alt;
    const z = pose.z + Math.cos(pose.yaw) * SURFACE_DEPTH;

    // Resolve authored target pixels into world units at this endpoint each
    // frame.  FAR/portrait/camera turns retain the reviewed 12/24–48 px
    // vocabulary without scaling the actor or changing gameplay framing.
    _viewPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const viewDepth = Math.max(0.1, -_viewPoint.z);
    const cssHeight = Math.max(1,
      renderer.domElement.clientHeight || globalThis.innerHeight || 1);
    const worldPerPx = 2 * viewDepth * Math.tan(camera.fov * DEG * 0.5) / cssHeight;

    const fade = elapsed < row.fadeStartMs ? 0
      : Math.min(1, (elapsed - row.fadeStartMs) /
          Math.max(1, row.durationMs - row.fadeStartMs));
    const rise = Math.min(1, elapsed / Math.max(1, row.peakMs));
    const pulse = (0.92 + 0.08 * rise) * (1 - 0.08 * fade);
    const extent = row.targetPx * worldPerPx * pulse;
    let width, height;
    if (component.nativeAspect >= 1) {
      width = extent;
      height = extent / component.nativeAspect;
    } else {
      height = extent;
      width = extent * component.nativeAspect;
    }

    _yaw.makeRotationY(pose.yaw);
    _roll.makeRotationZ(row.angle);
    _scale.makeScale(width, height, 1);
    _matrix.copy(_yaw).multiply(_roll).multiply(_scale).setPosition(x, y, z);
    row.mesh.matrix.copy(_matrix);
    row.mesh.matrixWorldNeedsUpdate = true;
    row.material.opacity = 0.92 * (1 - fade);
    // A very short warm-ivory contact glint, then ordinary lit physical paint.
    row.material.emissiveIntensity = elapsed < 64
      ? IVORY_EMISSION_MAX * (1 - elapsed / 64) : 0;
    row.mesh.visible = true;
    visible++;
  }
  counters.liveRows = live;
  counters.visibleDraws = visible;
  counters.maxVisibleDraws = Math.max(counters.maxVisibleDraws, visible);
}

export function updateActionVfx() {
  if (!ACTION_VFX_ART_SLOT.tex || dead) return;
  const raw = Math.max(0, Math.min(50, gameMs - lastFrameMs));
  lastFrameMs = gameMs;
  const held = hitStopRemainingMs() > 0;
  const dtMs = held ? raw * CONFIG.juice.hitStop.scale : raw;
  lastRawMs = raw;
  lastDtMs = dtMs;
  if (held && raw > 0) hitStopHeldFrames++;
  try { stepRows(dtMs); } catch (error) { warnDead(error); }
}

export function actionVfxSnapshot() {
  const selectedIds = [];
  for (let i = 0; i < ACTION_VFX_COMPONENTS.length; i++)
    if (selectedMask & (1 << i)) selectedIds.push(ACTION_VFX_COMPONENTS[i].id);

  return {
    enabled: !!ACTION_VFX_ART_SLOT.tex && !dead,
    observersInstalled,
    observerInstall: {
      calls: observerInstallCalls,
      successes: observerInstallSuccesses,
      skips: observerInstallSkips,
      idempotent: true,
    },
    art: actionVfxArtStats(),
    textureCount: ACTION_VFX_ART_SLOT.gpuTextures,
    maxRows: ACTION_VFX_ROW_MAX,
    liveRows: counters.liveRows,
    visibleDraws: counters.visibleDraws,
    maxVisibleDraws: counters.maxVisibleDraws,
    selectedIds,
    resets: counters.resets,
    recycles: counters.recycles,
    claims: counters.claims,
    damageEndpoints: counters.damageEndpoints,
    deathEndpoints: counters.deathEndpoints,
    facetRejects: counters.facetRejects,
    faults: counters.faults,
    clock: {
      lastRawMs: +lastRawMs.toFixed(3),
      lastDtMs: +lastDtMs.toFixed(3),
      activeScale: lastRawMs > 0 ? +(lastDtMs / lastRawMs).toFixed(4) : 1,
      configuredHitStopScale: CONFIG.juice.hitStop.scale,
      hitStopRemainingMs: +hitStopRemainingMs().toFixed(3),
      hitStopHeldFrames,
    },
    observerEvents: {
      collisions: counters.collisionEvents,
      damaged: counters.damagedEvents,
      lethal: counters.lethalEvents,
      undamaged: counters.undamagedEvents,
      unsupportedWeapons: counters.unsupportedWeaponEvents,
    },
    lastDamageEndpoint: lastDamage.valid ? {
      s: lastDamage.s, y: lastDamage.y, vx: lastDamage.vx, vy: lastDamage.vy,
      weapon: lastDamage.type, id: lastDamage.id,
      targetId: lastDamage.targetId, targetKind: lastDamage.targetKind,
      lethal: lastDamage.lethal, collisionFrameMs: lastDamage.collisionFrameMs,
      sequence: lastDamage.sequence,
    } : null,
    lastDeathEndpoint: lastDeath.valid ? {
      s: lastDeath.s, y: lastDeath.y, vx: lastDeath.vx, vy: lastDeath.vy,
      role: lastDeath.role, id: lastDeath.id,
      targetId: lastDeath.targetId, targetKind: lastDeath.targetKind,
      collisionFrameMs: lastDeath.collisionFrameMs,
      sequence: lastDeath.sequence,
    } : null,
    contract: {
      source: 'sim-bullet-hostile-impact',
      collisionFrame: true,
      inference: false,
      blend: 'normal',
      material: 'physical-paint',
      atlasTextures: 1,
      atlasBytes: 4 * 1024 * 1024,
      screenExtentPx: { min: 12, mediumMin: 24, max: 48 },
      ivoryEmissionMax: IVORY_EMISSION_MAX,
      facetOwned: true,
      exactEndpoints: true,
      hitStopHeld: true,
      hotPathAllocation: false,
      runtimeCanvas: false,
      runtimeCrop: false,
      textureTransforms: false,
      rejectedIds: ACTION_VFX_REJECTED.length,
      rejectedSelected: false,
    },
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_ACTION_VFX = actionVfxSnapshot;
