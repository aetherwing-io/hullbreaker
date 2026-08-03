/* ======================== BULLET INSTANCES ======================== */
/* One fixed pool for every letter weapon, addressed by the same slot index
   as bulletPool in src/sim/weapons.js. The point-collision projectile remains
   the bright CORE. Two presentation-only companions make it readable at the
   true camera scale: a soft halo that grows BACKWARD from the collision nose,
   and three short history segments that describe its path. The latter is the
   important weapon-language layer: SPREAD draws a fan, LASER cuts a corridor,
   HOMING leaves an unmistakable bend, and FLAME drags a crawling wake.

   No companion reaches ahead of the core. `bulletNoseTiles()` still clamps
   the leading edge to the shipped laser nose; each halo is shifted backward
   by half of the extra tail it gains. The sim still collides a point, and
   nothing in this module can damage or steer anything. */

import * as THREE from 'three';
import { CONFIG, BULLET_NOSE_CEILING_TILES } from '../config.js';
import { bulletNoseTiles } from '../pure/juice.js';
import { installView } from '../sim/bridge.js';
import { BULLET_MAX } from '../sim/weapons.js';
import { scene, HIDE } from './scene.js';
import { towerPose } from './tower.js';
import { PAL } from './palette.js';

const _pp = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };   // shared per-frame pose scratch

const bulletMaterial = new THREE.MeshBasicMaterial({
  // Keep the collision core opaque and saturated. Additive blending belongs
  // on the aura/trail; using it on the core pushed amber SPREAD shards to
  // white against the lit hull and erased their faceted silhouette.
  color: 0xffffff, fog: false, depthWrite: false,
});
const bulletMesh = new THREE.InstancedMesh(
  // A faceted diamond remains a projectile when bloom catches it; the old
  // stretched sphere turned each SPREAD pellet into a white egg.
  new THREE.OctahedronGeometry(CONFIG.rifle.radius, 0),
  bulletMaterial,
  BULLET_MAX
);
bulletMesh.frustumCulled = false;
bulletMesh.renderOrder = 3;
scene.add(bulletMesh);

/* Width, aura and wake are presentation units only. The x-axis size of the
   core is still derived exclusively from bulletNoseTiles() below. Values are
   intentionally broad at FAR: the smallest live core is roughly a six-pixel
   mark instead of a sub-pixel bead, while the translucent halo carries shape
   without hiding a target. */
const LOOK = {
  R: { core: 1.35, halo: 2.35, tail: 0.30, trail: 0.11, pulse: 0.00 },
  S: { core: 1.35, halo: 1.95, tail: 0.18, trail: 0.075, pulse: 0.00 },
  L: { core: 2.20, halo: 5.20, tail: 2.10, trail: 0.16, pulse: 0.06 },
  H: { core: 1.90, halo: 3.90, tail: 0.72, trail: 0.15, pulse: 0.20 },
  F: { core: 2.10, halo: 4.50, tail: 0.92, trail: 0.18, pulse: 0.28 },
};

// Per-weapon energy in the soft aura. SPREAD already communicates through
// five physical lanes; giving every pellet a full-power halo merged those
// lanes into a cluster of white discs around RIG.
const HALO_GAIN = { R: 0.78, S: 0.42, L: 0.86, H: 0.72, F: 0.68 };

const haloMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(CONFIG.rifle.radius, 6, 6),
  new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.28, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }),
  BULLET_MAX
);
haloMesh.frustumCulled = false;
haloMesh.renderOrder = 2;
scene.add(haloMesh);

// Four remembered points make three segments. This is one instanced draw,
// fixed for the life of the page; a saturated bullet pool allocates nothing.
const TRAIL_POINTS = 4;
const TRAIL_SEGMENTS = TRAIL_POINTS - 1;
const TRAIL_MAX = BULLET_MAX * TRAIL_SEGMENTS;
const TRAIL_FADE = [0.72, 0.42, 0.20];
const trailMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
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
const _haloPos = new THREE.Vector3();
const _haloScale = new THREE.Vector3();
const _flight = new THREE.Vector3();
const _trailDir = new THREE.Vector3();
const _trailMid = new THREE.Vector3();
const _trailScale = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _trailQ = new THREE.Quaternion();
const _shotColor = new THREE.Color();
bulletMesh.setColorAt(0, _shotColor.setHex(0xffffff));   // allocates instanceColor up front
haloMesh.setColorAt(0, _shotColor.setHex(0xffffff));
trailMesh.setColorAt(0, _shotColor.setHex(0xffffff));
const slotType = new Array(BULLET_MAX).fill('');         // gate color uploads on change
const historyCount = new Uint8Array(BULLET_MAX);
const historyX = new Float32Array(BULLET_MAX * TRAIL_POINTS);
const historyY = new Float32Array(BULLET_MAX * TRAIL_POINTS);
const historyZ = new Float32Array(BULLET_MAX * TRAIL_POINTS);

function trailIndex(slot, segment) { return slot * TRAIL_SEGMENTS + segment; }
function pointIndex(slot, point) { return slot * TRAIL_POINTS + point; }

function slotSpawned(i, type) {
  historyCount[i] = 0;
  if (slotType[i] !== type) {
    slotType[i] = type;
    _shotColor.setHex(PAL.shots[type]);
    bulletMesh.setColorAt(i, _shotColor);
    _shotColor.setHex(PAL.shots[type]).multiplyScalar(HALO_GAIN[type] || 0.7);
    haloMesh.setColorAt(i, _shotColor);
    for (let j = 0; j < TRAIL_SEGMENTS; j++) {
      _shotColor.setHex(PAL.shots[type]).multiplyScalar(TRAIL_FADE[j]);
      trailMesh.setColorAt(trailIndex(i, j), _shotColor);
    }
    bulletMesh.instanceColor.needsUpdate = true;
    haloMesh.instanceColor.needsUpdate = true;
    trailMesh.instanceColor.needsUpdate = true;
  }
}

function hideSlot(i) {
  bulletMesh.setMatrixAt(i, HIDE);
  haloMesh.setMatrixAt(i, HIDE);
  historyCount[i] = 0;
  for (let j = 0; j < TRAIL_SEGMENTS; j++) trailMesh.setMatrixAt(trailIndex(i, j), HIDE);
}

function syncTrail(i, x, y, z, width) {
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
    if (j + 1 >= historyCount[i]) { trailMesh.setMatrixAt(meshI, HIDE); continue; }
    const a = pointIndex(i, j), b = pointIndex(i, j + 1);
    const dx = historyX[a] - historyX[b];
    const dy = historyY[a] - historyY[b];
    const dz = historyZ[a] - historyZ[b];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) { trailMesh.setMatrixAt(meshI, HIDE); continue; }
    _trailDir.set(dx / len, dy / len, dz / len);
    _trailQ.setFromUnitVectors(_axisX, _trailDir);
    _trailMid.set((historyX[a] + historyX[b]) * 0.5,
      (historyY[a] + historyY[b]) * 0.5,
      (historyZ[a] + historyZ[b]) * 0.5);
    const taper = 1 - j * 0.18;
    _trailScale.set(len, width * taper, width * taper);
    _bm.compose(_trailMid, _trailQ, _trailScale);
    trailMesh.setMatrixAt(meshI, _bm);
  }
}

// map (s,y) onto the tower for one live slot: position + a heading-oriented
// scale for every type. `crawling` is F-only (see spawnProj/updateBullets in
// src/sim/weapons.js); every other type always takes the flight branch.
function syncSlot(i, b) {
  const bp = towerPose(b.x, _pp);
  const def = CONFIG.weapons[b.type];
  const look = LOOK[b.type] || LOOK.R;
  const crawling = b.type === 'F' && b.crawling;
  const base = crawling ? def.crawlScale : def.scale;
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
  _bs.set(nose / CONFIG.rifle.radius, base[1] * look.core * pulse,
    base[2] * look.core * pulse);
  const ang = crawling ? 0 : Math.atan2(b.vy, b.vx);
  _bq.setFromEuler(_be.set(0, bp.yaw, ang, 'YZX'));
  _bv.set(bp.x, b.y + bp.alt, bp.z);
  _bm.compose(_bv, _bq, _bs);
  bulletMesh.setMatrixAt(i, _bm);

  // Grow the aura behind the collision nose. For an extra tail T, a centred
  // extent of nose+T/2 shifted backward T/2 has the SAME leading edge (nose)
  // and spends every added tile behind the sim point.
  const ca = Math.cos(ang), sa = Math.sin(ang);
  _flight.set(Math.cos(bp.yaw) * ca, sa, -Math.sin(bp.yaw) * ca);
  _haloPos.copy(_bv).addScaledVector(_flight, -look.tail * 0.5);
  _haloScale.set((nose + look.tail * 0.5) / CONFIG.rifle.radius,
    base[1] * look.halo * pulse, base[2] * look.halo * pulse);
  _bm.compose(_haloPos, _bq, _haloScale);
  haloMesh.setMatrixAt(i, _bm);

  syncTrail(i, _bv.x, _bv.y, _bv.z, look.trail * pulse);
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
  new THREE.SphereGeometry(CONFIG.rifle.radius, 6, 6),
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
    // uniform sphere: take the SMALLEST axis of the shot's scale, or a laser's
    // 7x length would leave a beach ball hanging in the air
    d.scale = Math.min(...def.scale);
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
    _bm.makeScale(s, s, s);
    _bm.setPosition(d.x, d.y, d.z);
    departMesh.setMatrixAt(i, _bm);
  }
  departMesh.instanceMatrix.needsUpdate = true;
}

function flush() {
  bulletMesh.instanceMatrix.needsUpdate = true;
  haloMesh.instanceMatrix.needsUpdate = true;
  trailMesh.instanceMatrix.needsUpdate = true;
  advanceDeparting();
}

// run reset: no tracer survives a restart
export function clearDepartingTracers() {
  for (let i = 0; i < BULLET_MAX; i++) hideSlot(i);
  bulletMesh.instanceMatrix.needsUpdate = true;
  haloMesh.instanceMatrix.needsUpdate = true;
  trailMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < DEPART_MAX; i++) {
    departing[i].until = 0;
    departMesh.setMatrixAt(i, HIDE);
  }
  departMesh.instanceMatrix.needsUpdate = true;
}

installView({ bullets: { slotSpawned, hideSlot, syncSlot, flush, bendCulled } });
