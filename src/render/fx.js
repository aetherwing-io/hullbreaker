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
   three.js work as the pre-juice game.                                 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PAL } from './palette.js';
import { JUICE_ENABLED } from '../mode.js';
import {
  burstVelocity, clamp01, flashAlpha, particleAlpha, particleScale, warnPulse,
} from '../pure/juice.js';
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

/* A pool is its fixed rows plus an O(1) free stack: `free[0..top)` holds the
   indices of the dead rows, so a claim is a pop and never a scan of the pool.
   A row enters the stack exactly once, on its live→free transition in
   advance(); resetFx rebuilds the stack wholesale. `cursor` is only used when
   the stack is empty (a saturated pool), where the claim recycles the
   round-robin row — still one step, no scan. */
function makePool(n) {
  const rows = new Array(n);
  const free = new Int32Array(n);
  for (let i = 0; i < n; i++) { rows[i] = makeRow(); free[i] = i; }
  return { rows, free, top: n, cursor: 0 };
}

let sparks = null, flashes = null;
let sparkMesh = null, flashMesh = null, crushMesh = null, crushMat = null;
let seed = 1;                            // burst-shape seed, bumped per burst
let liveSparks = 0, liveFlashes = 0;

if (JUICE_ENABLED) {
  sparks = makePool(SPARK_MAX);
  flashes = makePool(FLASH_MAX);

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

function claim(pool) {
  // free row if there is one (pop), otherwise the round-robin one
  // (oldest-ish), so a burst during a firefight replaces stale sparks
  // instead of being dropped. Both branches are O(1) and allocation-free —
  // a saturated pool must not make the spawn path cost more, which is
  // exactly when the frame budget is tightest.
  if (pool.top > 0) return pool.rows[pool.free[--pool.top]];
  const row = pool.rows[pool.cursor];
  pool.cursor = (pool.cursor + 1) % pool.rows.length;
  return row;
}

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
    tint(row, color);
  }
}

/* A flash: instant on, short hold, out. `sizeMult` scales the configured
   size (a spread volley's muzzle flash is the same flash, not five). */
export function fxFlash(ms, size, s, y, color, depth = 0) {
  if (!JUICE_ENABLED) return;
  const row = claim(flashes);
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
  clearPool(sparks, sparkMesh);
  clearPool(flashes, flashMesh);
  liveSparks = 0; liveFlashes = 0;
  if (crushMesh) { crushMesh.visible = false; crushMat.opacity = 0; }
}

// every row dead, every index back on the stack, cursor rewound: the free
// stack is rebuilt wholesale here rather than pushed row by row, so a reset
// can never leave a stale or duplicated index behind
function clearPool(pool, mesh) {
  const rows = pool.rows;
  for (let i = 0; i < rows.length; i++) {
    rows[i].ttl = 0;
    pool.free[i] = i;
    mesh.setMatrixAt(i, HIDE);
  }
  pool.top = rows.length;
  pool.cursor = 0;
  mesh.instanceMatrix.needsUpdate = true;
}

// read-only debug/telemetry surface (see window.HB.juice and ?testapi=1)
export function fxStats() {
  return {
    sparks: liveSparks, flashes: liveFlashes,
    sparkMax: SPARK_MAX, flashMax: FLASH_MAX,
    crush: crushMat ? clamp01(crushMat.opacity / J.crush.maxOpacity) : 0,
  };
}
