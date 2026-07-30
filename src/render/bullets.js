/* ======================== BULLET INSTANCES ======================== */
/* One instanced pool for every letter weapon, addressed by the same slot
   index as bulletPool in src/sim/weapons.js. R/S/H are uniform-scale
   spheres, so only L (stretched bolt) and F (flattened crawler) compose
   an orientation. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { BULLET_MAX } from '../sim/weapons.js';
import { scene, HIDE } from './scene.js';
import { towerPose } from './tower.js';

const _pp = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };   // shared per-frame pose scratch

const bulletMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(CONFIG.rifle.radius, 6, 6),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  BULLET_MAX
);
bulletMesh.frustumCulled = false;
scene.add(bulletMesh);
const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _be = new THREE.Euler();
const _bs = new THREE.Vector3();
const _bv = new THREE.Vector3();
const _shotColor = new THREE.Color();
bulletMesh.setColorAt(0, _shotColor.setHex(0xffffff));   // allocates instanceColor up front
const slotType = new Array(BULLET_MAX).fill('');         // gate color uploads on change

function slotSpawned(i, type) {
  if (slotType[i] !== type) {
    slotType[i] = type;
    bulletMesh.setColorAt(i, _shotColor.setHex(CONFIG.palette.shots[type]));
    bulletMesh.instanceColor.needsUpdate = true;
  }
}

function hideSlot(i) { bulletMesh.setMatrixAt(i, HIDE); }

// map (s,y) onto the tower for one live slot: position + scale only for the
// uniform spheres, no yaw/quaternion work
function syncSlot(i, b) {
  const bp = towerPose(b.x, _pp);
  const def = CONFIG.weapons[b.type];
  if (b.type === 'L' || b.type === 'F') {
    _bs.fromArray(b.crawling ? def.crawlScale : def.scale);
    const ang = b.crawling ? 0 : Math.atan2(b.vy, b.vx);
    _bq.setFromEuler(_be.set(0, bp.yaw, ang, 'YZX'));
    _bm.compose(_bv.set(bp.x, b.y + bp.alt, bp.z), _bq, _bs);
  } else {
    const s = def.scale[0];
    _bm.makeScale(s, s, s);
    _bm.setPosition(bp.x, b.y + bp.alt, bp.z);
  }
  bulletMesh.setMatrixAt(i, _bm);
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
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
  DEPART_MAX
);
departMesh.frustumCulled = false;
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
    departMesh.setColorAt(idx, _shotColor.setHex(CONFIG.palette.shots[b.type]));
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
  advanceDeparting();
}

// run reset: no tracer survives a restart
export function clearDepartingTracers() {
  for (let i = 0; i < DEPART_MAX; i++) {
    departing[i].until = 0;
    departMesh.setMatrixAt(i, HIDE);
  }
  departMesh.instanceMatrix.needsUpdate = true;
}

installView({ bullets: { slotSpawned, hideSlot, syncSlot, flush, bendCulled } });
