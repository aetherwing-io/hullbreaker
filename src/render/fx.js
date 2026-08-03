/* ================================ FX ============================== */
/* The render half of the baseline feedback pass (T-011): the pools that
   actually draw it. Four additions to the scene, all additive and all
   fixed-size:

     sparks   — impact / death / hurt / pickup particle bursts
     flashes  — muzzle flash, kill pop, pickup pop (expanding, fading)
     rings    — face-hugging weapon / destruction shock fronts
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

const SPARK_MAX = J.pools.particles;
const FLASH_MAX = J.pools.flashes;
const RING_MAX = 24;

// row shape shared by both pools; `ttl <= 0` means free
function makeRow() {
  return {
    t: 0, ttl: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    gravity: 0, size: 0, grow: 0, yaw: 0, r: 0, g: 0, b: 0,
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

let sparks = null, flashes = null, rings = null;
let sparkMesh = null, flashMesh = null, ringMesh = null, crushMesh = null, crushMat = null;
let seed = 1;                            // burst-shape seed, bumped per burst
let liveSparks = 0, liveFlashes = 0, liveRings = 0;

if (JUICE_ENABLED) {
  sparks = makePool(SPARK_MAX);
  flashes = makePool(FLASH_MAX);
  rings = makePool(RING_MAX);

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

  // TorusGeometry lies in local XY; rotating it by the facet yaw makes the
  // shock front hug the same (s,y) combat plane as its victim. One fixed pool
  // makes large kills read as a ring, rather than merely a larger fuzzy ball.
  const ringMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 1, fog: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  ringMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.5, 0.07, 5, 18), ringMat, RING_MAX);
  ringMesh.frustumCulled = false;
  ringMesh.renderOrder = 3;
  ringMesh.setColorAt(0, _c.setRGB(1, 1, 1));
  for (let i = 0; i < RING_MAX; i++) ringMesh.setMatrixAt(i, HIDE);
  scene.add(ringMesh);

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
    tint(row, color);
  }
  seed++;
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

/* A bounded shock front in the active facet plane. `size` is its final
   diameter in tiles; unlike a flash it leaves the center readable. */
export function fxRing(ms, size, s, y, color, depth = 0) {
  if (!JUICE_ENABLED) return;
  const row = claim(rings);
  row.yaw = place(row, s, y, depth);
  row.vx = 0; row.vy = 0; row.vz = 0; row.gravity = 0;
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
}

function advance(pool, mesh, dtMs, alphaOf, isFlash, gain) {
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
    if (isFlash) {
      _m.makeScale(s, s, s);
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
  }
  if (dirty) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  return live;
}

function advanceRings(dtMs, gain) {
  let live = 0, dirty = false;
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
    _m.scale(_ringScale.set(s, s, s));
    _m.setPosition(row.x, row.y, row.z);
    ringMesh.setMatrixAt(i, _m);
    const ag = a * gain;
    ringMesh.setColorAt(i, _c.setRGB(row.r * ag, row.g * ag, row.b * ag));
    dirty = true;
    live++;
  }
  if (dirty) {
    ringMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceColor.needsUpdate = true;
  }
  return live;
}

/* run reset (resetGame in src/main.js): nothing survives a restart */
export function resetFx() {
  if (!JUICE_ENABLED) return;
  clearPool(sparks, sparkMesh);
  clearPool(flashes, flashMesh);
  clearPool(rings, ringMesh);
  liveSparks = 0; liveFlashes = 0; liveRings = 0;
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
    sparks: liveSparks, flashes: liveFlashes, rings: liveRings,
    sparkMax: SPARK_MAX, flashMax: FLASH_MAX, ringMax: RING_MAX,
    crush: crushMat ? clamp01(crushMat.opacity / J.crush.maxOpacity) : 0,
  };
}
