/* ================================ FX ============================== */
/* The render half of the baseline feedback pass (T-011): the pools that
   actually draw it. Three additions to the scene, all additive and all
   fixed-size:

     sparks   — impact / death / hurt / pickup particle bursts
     flashes  — muzzle flash, kill pop, pickup pop (expanding, fading)
     crush    — the pursuing damage plane's warning haze

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

   Colors come from role names, never literals: the render palette module
   (src/render/palette.js) is imported LAZILY and optionally — it is
   another lane's file and may not exist in a given build — falling back
   to CONFIG.palette's grey-box roles until it resolves. Nothing here
   holds a hex of its own.

   ?juice=0 (src/mode.js): no geometry, no material, no mesh is built and
   every entry point returns immediately — a disabled boot costs the same
   three.js work as the pre-juice game.                                 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { JUICE_ENABLED } from '../mode.js';
import {
  burstVelocity, clamp01, flashAlpha, particleAlpha, particleScale, warnPulse,
} from '../pure/juice.js';
import { scene, HIDE } from './scene.js';
import { towerPose } from './tower.js';

const J = CONFIG.juice;

/* ----------------------------- palette ---------------------------- *
 * Role names only. The fallback table is CONFIG.palette's grey-box roles
 * (the same values palette.js's CLASSIC table mirrors), so a build without
 * the palette module looks like the grey-box rather than like nothing. */
const ROLE = {
  muzzle: CONFIG.palette.shots.R,        // warm white: player fire family
  enemyGlow: CONFIG.palette.wasp,        // hostile ecology
  capsule: CONFIG.palette.capsule,       // pickup magenta
  modCapsule: CONFIG.palette.modCapsule, // modifier gold
  warn: CONFIG.palette.houndTell,        // the roster's one warning amber
  rig: CONFIG.palette.player,            // RIG's own off-white
};

if (JUICE_ENABLED) {
  // optional + lazy: resolves after boot if the module is present, and is a
  // no-op if it is not. Never awaited — the pools are usable immediately.
  import('./palette.js').then((m) => {
    const P = m && m.PAL;
    if (!P) return;
    if (P.muzzle !== undefined) ROLE.muzzle = P.muzzle;
    if (P.enemyGlow !== undefined) ROLE.enemyGlow = P.enemyGlow;
    if (P.capsule !== undefined) ROLE.capsule = P.capsule;
    if (P.modCapsule !== undefined) ROLE.modCapsule = P.modCapsule;
    if (P.houndTell !== undefined) ROLE.warn = P.houndTell;
    if (P.player !== undefined) ROLE.rig = P.player;
    if (crushMat) crushMat.color.set(ROLE.warn);
  }).catch(() => {});                    // absent module: keep the fallback
}

export function fxRole(name) { return ROLE[name]; }

/* ------------------------------ pools ----------------------------- */

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
const _vel = { s: 0, y: 0, d: 0 };

const SPARK_MAX = J.pools.particles;
const FLASH_MAX = J.pools.flashes;

// row shape shared by both pools; `ttl <= 0` means free
function makeRow() {
  return {
    t: 0, ttl: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    gravity: 0, size: 0, grow: 0, r: 0, g: 0, b: 0,
  };
}

const sparks = [];
const flashes = [];
let sparkMesh = null, flashMesh = null, crushMesh = null, crushMat = null;
let seed = 1;                            // burst-shape seed, bumped per burst
let liveSparks = 0, liveFlashes = 0;

if (JUICE_ENABLED) {
  for (let i = 0; i < SPARK_MAX; i++) sparks.push(makeRow());
  for (let i = 0; i < FLASH_MAX; i++) flashes.push(makeRow());

  // no `color` here on purpose: the material's default white is the identity
  // that instanceColor multiplies, so the per-row role color IS the color and
  // this module never names one of its own
  const sparkMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5), sparkMat, SPARK_MAX);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 2;
  sparkMesh.setColorAt(0, _c.setRGB(1, 1, 1));       // allocate instanceColor up front
  for (let i = 0; i < SPARK_MAX; i++) sparkMesh.setMatrixAt(i, HIDE);
  scene.add(sparkMesh);

  const flashMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  flashMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), flashMat, FLASH_MAX);
  flashMesh.frustumCulled = false;
  flashMesh.renderOrder = 2;
  flashMesh.setColorAt(0, _c.setRGB(1, 1, 1));
  for (let i = 0; i < FLASH_MAX; i++) flashMesh.setMatrixAt(i, HIDE);
  scene.add(flashMesh);

  // the crush warning: one thin, tall slab standing ON the damage plane, in
  // the play plane's depth. Additive and capped well under 1, so it tints the
  // air the plane is about to sweep instead of masking what stands in it.
  crushMat = new THREE.MeshBasicMaterial({
    color: ROLE.warn, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  crushMesh = new THREE.Mesh(
    new THREE.BoxGeometry(J.crush.width, J.crush.height, J.crush.depth), crushMat);
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

function claim(pool, cursorRef) {
  // prefer a free row; otherwise take the round-robin one (oldest-ish), so a
  // burst during a firefight replaces stale sparks instead of being dropped
  for (let k = 0; k < pool.length; k++) {
    const i = (cursorRef.i + k) % pool.length;
    if (pool[i].ttl <= 0) { cursorRef.i = (i + 1) % pool.length; return pool[i]; }
  }
  const row = pool[cursorRef.i];
  cursorRef.i = (cursorRef.i + 1) % pool.length;
  return row;
}

const sparkCursor = { i: 0 }, flashCursor = { i: 0 };

function place(row, s, y, depth) {
  const p = towerPose(s, _pose);
  row.x = p.x + Math.sin(p.yaw) * depth;
  row.y = y + p.alt;
  row.z = p.z + Math.cos(p.yaw) * depth;
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
    const row = claim(sparks, sparkCursor);
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
    tint(row, color);
  }
}

/* A flash: instant on, short hold, out. `sizeMult` scales the configured
   size (a spread volley's muzzle flash is the same flash, not five). */
export function fxFlash(ms, size, s, y, color, depth = 0) {
  if (!JUICE_ENABLED) return;
  const row = claim(flashes, flashCursor);
  place(row, s, y, depth);
  row.vx = 0; row.vy = 0; row.vz = 0; row.gravity = 0;
  row.t = 0;
  row.ttl = ms;
  row.size = size;
  row.grow = size * 0.8;                 // expands as it dies
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
  crushMesh.position.set(p.x, C.y0 + C.height / 2 + p.alt, p.z);
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
  liveSparks = advance(sparks, sparkMesh, dtMs, particleAlpha, false);
  liveFlashes = advance(flashes, flashMesh, dtMs, flashAlpha, true);
}

function advance(pool, mesh, dtMs, alphaOf, isFlash) {
  let live = 0, dirty = false;
  const dt = dtMs / 1000;
  for (let i = 0; i < pool.length; i++) {
    const row = pool[i];
    if (row.ttl <= 0) continue;
    row.t += dtMs;
    if (row.t >= row.ttl) {
      row.ttl = 0;
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
    _m.makeScale(s, s, s);
    _m.setPosition(row.x, row.y, row.z);
    mesh.setMatrixAt(i, _m);
    // additive blending: fading the COLOR is the fade, and it keeps the whole
    // pool on one material (one draw call) instead of a per-row opacity
    mesh.setColorAt(i, _c.setRGB(row.r * a, row.g * a, row.b * a));
    dirty = true;
    live++;
  }
  if (dirty) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  return live;
}

/* run reset (resetGame in src/main.js): nothing survives a restart */
export function resetFx() {
  if (!JUICE_ENABLED) return;
  for (let i = 0; i < sparks.length; i++) {
    sparks[i].ttl = 0;
    sparkMesh.setMatrixAt(i, HIDE);
  }
  for (let i = 0; i < flashes.length; i++) {
    flashes[i].ttl = 0;
    flashMesh.setMatrixAt(i, HIDE);
  }
  sparkMesh.instanceMatrix.needsUpdate = true;
  flashMesh.instanceMatrix.needsUpdate = true;
  liveSparks = 0; liveFlashes = 0;
  if (crushMesh) { crushMesh.visible = false; crushMat.opacity = 0; }
}

// read-only debug/telemetry surface (see window.HB.juice and ?testapi=1)
export function fxStats() {
  return {
    sparks: liveSparks, flashes: liveFlashes,
    sparkMax: SPARK_MAX, flashMax: FLASH_MAX,
    crush: crushMat ? clamp01(crushMat.opacity / J.crush.maxOpacity) : 0,
  };
}
