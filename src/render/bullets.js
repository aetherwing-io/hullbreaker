/* ======================== BULLET INSTANCES ======================== */
/* One instanced pool for every letter weapon, addressed by the same slot
   index as bulletPool in src/sim/weapons.js. R/S/H are uniform-scale
   spheres, so only L (stretched bolt) and F (flattened crawler) compose
   an orientation. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SEGS, polyAt, yawAt } from '../pure/path.js';
import { installView } from '../sim/bridge.js';
import { BULLET_MAX } from '../sim/weapons.js';
import { scene, HIDE } from './scene.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites
const YAWB = CONFIG.path.yawBlendTiles;

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

function syncSlot(i, b) {
    // work. Only L (stretched bolt) and F (flattened crawler) compose.
    const bp = polyAt(SEGS, b.x, _pp);
    const def = CONFIG.weapons[b.type];
    if (b.type === 'L' || b.type === 'F') {
      _bs.fromArray(b.crawling ? def.crawlScale : def.scale);
      const yaw = yawAt(SEGS, b.x, YAWB);
      const ang = b.crawling ? 0 : Math.atan2(b.vy, b.vx);
      _bq.setFromEuler(_be.set(0, yaw, ang, 'YZX'));
      _bm.compose(_bv.set(bp.x, b.y, bp.z), _bq, _bs);
    } else {
      const s = def.scale[0];
      _bm.makeScale(s, s, s);
      _bm.setPosition(bp.x, b.y, bp.z);
    }
    bulletMesh.setMatrixAt(i, _bm);
}

function flush() { bulletMesh.instanceMatrix.needsUpdate = true; }

installView({ bullets: { slotSpawned, hideSlot, syncSlot, flush } });
