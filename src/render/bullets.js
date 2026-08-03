/* ======================== BULLET INSTANCES ======================== */
/* One fixed pool for every letter weapon, addressed by the same slot index
   as bulletPool in src/sim/weapons.js. Simulation still collides a point.
   Presentation gives each weapon a different sentence at actual play scale:

     R  a thin, hard rectangular needle with a clipped two-beat tracer
     S  five compact triangular flechettes; the fan itself is the trail
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
import { bulletNoseTiles } from '../pure/juice.js';
import { installView } from '../sim/bridge.js';
import { BULLET_MAX } from '../sim/weapons.js';
import { scene, HIDE } from './scene.js';
import { towerPose } from './tower.js';
import { PAL } from './palette.js';

const _pp = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };   // shared per-frame pose scratch

const R = CONFIG.rifle.radius;
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
  R: new THREE.BoxGeometry(R * 2, R * 0.34, R * 0.34),
  S: new THREE.ConeGeometry(R * 0.42, R * 2, 3, 1, false),
  L: new THREE.CylinderGeometry(R * 0.17, R * 0.17, R * 2, 4, 1, false),
  H: new THREE.ConeGeometry(R * 0.55, R * 2, 4, 1, false),
  F: new THREE.ConeGeometry(R * 1.02, R * 2, 3, 1, false),
};
for (const type of ['S', 'L', 'H', 'F']) CORE_GEO[type].rotateZ(-Math.PI / 2);

const coreMeshes = {};
for (const type of WEAPON_TYPES) {
  const mesh = new THREE.InstancedMesh(CORE_GEO[type] || CORE_GEO.R, coreMaterial, BULLET_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  coreMeshes[type] = mesh;
}
const coreMeshList = WEAPON_TYPES.map((type) => coreMeshes[type]);

/* All distances below are presentation tiles. `front` is a fraction/cap of
   the clamped bulletNoseTiles result; `tail` may extend backward freely.
   History count/fill make a hard tracer, an interrupted lance, a curved comet,
   and broken flame tongues from the same one instanced segment pool. */
const LOOK = {
  R: { front: 1.00, frontCap: Infinity, tail: 0.38, wake: 0.18, wakeW: 0.070,
       trail: 0.026, segments: 2, fill: 0.72, pulse: 0.00, gain: 0.58 },
  S: { front: 0.82, frontCap: 0.36, tail: 0.16, wake: 0.08, wakeW: 0.105,
       trail: 0.024, segments: 1, fill: 0.42, pulse: 0.00, gain: 0.34 },
  L: { front: 1.00, frontCap: Infinity, tail: 1.28, wake: 0.42, wakeW: 0.105,
       trail: 0.052, segments: 3, fill: 0.80, pulse: 0.06, gain: 0.82 },
  H: { front: 0.90, frontCap: 0.36, tail: 0.48, wake: 0.38, wakeW: 0.205,
       trail: 0.075, segments: 3, fill: 0.90, pulse: 0.18, gain: 0.70 },
  F: { front: 0.95, frontCap: 0.42, tail: 0.46, wake: 0.62, wakeW: 0.420,
       trail: 0.140, segments: 2, fill: 0.68, pulse: 0.20, gain: 0.78,
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

const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _be = new THREE.Euler();
const _bs = new THREE.Vector3();
const _bv = new THREE.Vector3();
const _corePos = new THREE.Vector3();
const _wakePos = new THREE.Vector3();
const _wakeScale = new THREE.Vector3();
const _flight = new THREE.Vector3();
const _trailDir = new THREE.Vector3();
const _trailMid = new THREE.Vector3();
const _trailScale = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _trailQ = new THREE.Quaternion();
const _shotColor = new THREE.Color();
const _traitColor = new THREE.Color();
for (const type of WEAPON_TYPES) {
  coreMeshes[type].setColorAt(0, _shotColor.setHex(0xffffff));
  for (let i = 0; i < BULLET_MAX; i++) coreMeshes[type].setMatrixAt(i, HIDE);
}
wakeMesh.setColorAt(0, _shotColor.setHex(0xffffff));
for (let i = 0; i < BULLET_MAX; i++) wakeMesh.setMatrixAt(i, HIDE);
trailMesh.setColorAt(0, _shotColor.setHex(0xffffff));
for (let i = 0; i < TRAIL_MAX; i++) trailMesh.setMatrixAt(i, HIDE);
const slotType = new Array(BULLET_MAX).fill('');         // gate color uploads on change
const slotVisible = new Uint8Array(BULLET_MAX);
const historyCount = new Uint8Array(BULLET_MAX);
const historyX = new Float32Array(BULLET_MAX * TRAIL_POINTS);
const historyY = new Float32Array(BULLET_MAX * TRAIL_POINTS);
const historyZ = new Float32Array(BULLET_MAX * TRAIL_POINTS);

function trailIndex(slot, segment) { return slot * TRAIL_SEGMENTS + segment; }
function pointIndex(slot, point) { return slot * TRAIL_POINTS + point; }

function slotSpawned(i, type, meta = null) {
  historyCount[i] = 0;
  const visualType = coreMeshes[type] ? type : 'R';
  const look = LOOK[type] || LOOK.R;
  const color = PAL.shots[type] || PAL.shots.R;
  const tier = meta ? meta.tier : 0;
  const phase = meta ? meta.phase : 0;
  const volatile = meta ? meta.volatile : 0;
  if (slotVisible[i] && coreMeshes[slotType[i]]) coreMeshes[slotType[i]].setMatrixAt(i, HIDE);
  slotType[i] = visualType;
  slotVisible[i] = 1;
  _shotColor.setHex(look.coreColor || color);
  if (tier) _shotColor.lerp(_traitColor.setHex(0xffffff), Math.min(0.30, tier * 0.08));
  if (phase) _shotColor.lerp(_traitColor.setHex(PAL.shots.L), Math.min(0.30, phase * 0.12));
  coreMeshes[visualType].setColorAt(i, _shotColor);
  _shotColor.setHex(color);
  if (volatile) _shotColor.lerp(_traitColor.setHex(PAL.muzzle), Math.min(0.58, 0.28 + volatile * 0.10));
  _shotColor.multiplyScalar(look.gain * (1 + tier * 0.07));
  wakeMesh.setColorAt(i, _shotColor);
  for (let j = 0; j < TRAIL_SEGMENTS; j++) {
    _shotColor.setHex(color);
    if (volatile) _shotColor.lerp(_traitColor.setHex(PAL.muzzle), Math.min(0.48, 0.22 + volatile * 0.08));
    _shotColor.multiplyScalar(TRAIL_FADE[j] * (1 + tier * 0.05));
    trailMesh.setColorAt(trailIndex(i, j), _shotColor);
  }
  coreMeshes[visualType].instanceColor.needsUpdate = true;
  wakeMesh.instanceColor.needsUpdate = true;
  trailMesh.instanceColor.needsUpdate = true;
}

function hideSlot(i) {
  if (!slotVisible[i]) return;
  if (coreMeshes[slotType[i]]) coreMeshes[slotType[i]].setMatrixAt(i, HIDE);
  wakeMesh.setMatrixAt(i, HIDE);
  slotVisible[i] = 0;
  historyCount[i] = 0;
  for (let j = 0; j < TRAIL_SEGMENTS; j++) trailMesh.setMatrixAt(trailIndex(i, j), HIDE);
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

// map (s,y) onto the tower for one live slot: position + a heading-oriented
// scale for every type. `crawling` is F-only (see spawnProj/updateBullets in
// src/sim/weapons.js); every other type always takes the flight branch.
function syncSlot(i, b) {
  const bp = towerPose(b.x, _pp);
  const def = CONFIG.weapons[b.type] || CONFIG.weapons.R;
  const look = LOOK[b.type] || LOOK.R;
  const visualType = coreMeshes[b.type] ? b.type : 'R';
  const meta = b.meta;
  const tier = meta ? meta.tier : 0;
  const heavy = meta ? meta.heavy : 0;
  const seeker = meta ? meta.seeker : 0;
  const volatile = meta ? meta.volatile : 0;
  const crawling = b.type === 'F' && b.crawling;
  const base = crawling && def.crawlScale ? def.crawlScale : def.scale;
  // live speed, not the def's nominal one: a homing shot mid-turn or a
  // flame arcing under gravity draws the stretch it is ACTUALLY carrying
  // this frame, same principle as the spark stretch in src/render/fx.js.
  // The crawler's (vx, vy) go stale the instant it starts hugging terrain
  // (position advances by dir * crawlSpeed instead, src/sim/weapons.js), so
  // it reads its own crawl speed instead.
  const speed = crawling ? CONFIG.weapons.F.crawlSpeed : Math.hypot(b.vx, b.vy);
  const nose = bulletNoseTiles(base[0] * CONFIG.rifle.radius, speed, BULLET_NOSE_CEILING_TILES);
  // Position-driven flicker is deterministic and remains legible during a
  // hit-stop. Only the energy weapons pulse; rifle/spread keep a hard edge.
  const pulse = 1 + look.pulse * Math.sin(b.x * 3.7 + b.y * 2.3 + i * 0.61);
  const front = Math.min(nose * look.front, look.frontCap);
  const tail = look.tail * (crawling ? 1.22 : 1);
  const ang = crawling ? (b.dir < 0 ? Math.PI : 0) : Math.atan2(b.vy, b.vx);
  _bq.setFromEuler(_be.set(0, bp.yaw, ang, 'YZX'));
  _bv.set(bp.x, b.y + bp.alt, bp.z);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  _flight.set(Math.cos(bp.yaw) * ca, sa, -Math.sin(bp.yaw) * ca);
  // The geometry spans -R…+R. Scale to (front + tail), then shift its center
  // by (front - tail)/2 so its leading tip is exactly +front from the sim
  // point and every extra bit of spectacle lives behind it.
  _corePos.copy(_bv).addScaledVector(_flight, (front - tail) * 0.5);
  // Traits widen the readable energy signature behind/around the point, never
  // its leading reach. HEAVY gets a denser core, SEEKER a stronger path, and
  // VOLATILE a broad hot wake; tier supplies a small shared rarity lift.
  const coreWidth = 1 + tier * 0.05 + heavy * 0.13 + volatile * 0.07;
  const wakeWidth = 1 + tier * 0.09 + seeker * 0.10 + volatile * 0.24;
  const trailWidth = 1 + tier * 0.07 + seeker * 0.13 + volatile * 0.14;
  _bs.set((front + tail) / (R * 2), pulse * coreWidth, pulse * coreWidth);
  _bm.compose(_corePos, _bq, _bs);
  coreMeshes[visualType].setMatrixAt(i, _bm);

  const wakeFront = front * 0.82;
  const wakeTail = tail + look.wake;
  _wakePos.copy(_bv).addScaledVector(_flight, (wakeFront - wakeTail) * 0.5);
  _wakeScale.set(wakeFront + wakeTail, look.wakeW * pulse * wakeWidth, 1);
  _bm.compose(_wakePos, _bq, _wakeScale);
  wakeMesh.setMatrixAt(i, _bm);

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

// (i, b, fromX): the slot, the projectile row, and the s it entered the
// crossing substep at — the tangent to leave on is the heading THERE, which is
// the facet the shot was actually fired along.
function bendCulled(i, b, fromX) {
  const bp = towerPose(fromX, _pp);
  const yaw = bp.yaw;
  const def = CONFIG.weapons[b.type];
  const vx = b.crawling ? b.dir * CONFIG.weapons.F.crawlSpeed : b.vx;
  for (const d of departing) {
    if (d.until > 0) continue;
    d.until = DEPART_MS;
    d.x = bp.x; d.y = b.y + bp.alt; d.z = bp.z;
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
  for (const mesh of coreMeshList) mesh.instanceMatrix.needsUpdate = true;
  wakeMesh.instanceMatrix.needsUpdate = true;
  trailMesh.instanceMatrix.needsUpdate = true;
  advanceDeparting();
}

// run reset: no tracer survives a restart
export function clearDepartingTracers() {
  for (let i = 0; i < BULLET_MAX; i++) hideSlot(i);
  for (const mesh of coreMeshList) mesh.instanceMatrix.needsUpdate = true;
  wakeMesh.instanceMatrix.needsUpdate = true;
  trailMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < DEPART_MAX; i++) {
    departing[i].until = 0;
    departMesh.setMatrixAt(i, HIDE);
  }
  departMesh.instanceMatrix.needsUpdate = true;
}

installView({ bullets: { slotSpawned, hideSlot, syncSlot, flush, bendCulled } });
