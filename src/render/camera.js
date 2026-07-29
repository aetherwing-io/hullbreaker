/* =========================== CAMERA =============================== */
/* Camera pose plus the frustum-edge calibration the sim's edge module
   consumes. The scroll cursor and the corner events are sim state; this
   module only reads them, so all the renderer decides is where to stand
   and how far through the ritual yaw the view has travelled. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { DEG, SEGS, polyAt } from '../pure/path.js';
import { cornerYawDeltaDeg } from '../pure/waves.js';
import { traversalCameraDepth } from '../pure/traversal.js';
import { ACTIVE_SLICE } from '../mode.js';
import { installView } from '../sim/bridge.js';
import { gameMs, scrollX } from '../sim/time.js';
import { setEdges } from '../sim/edges.js';
import { activeCorner } from '../sim/wavegate.js';
import { renderer, scene, camera } from './scene.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites
const _edgeV = new THREE.Vector3();
const _probe = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 200);

function probeXAtNdc(ndcX) {
  _edgeV.set(ndcX, 0, 0.5).unproject(_probe).sub(_probe.position).normalize();
  return _probe.position.x + _edgeV.x * (-_probe.position.z / _edgeV.z);
}

export function activeCameraDepth() {
  return ACTIVE_SLICE
    ? traversalCameraDepth(CONFIG.camera.z, innerWidth / innerHeight, ACTIVE_SLICE.run)
    : CONFIG.camera.z;
}

function calibrateEdges() {
  const C = CONFIG.camera;
  const cameraDepth = activeCameraDepth();
  _probe.fov = C.fov;
  _probe.aspect = innerWidth / innerHeight;
  _probe.position.set(C.x, C.y, cameraDepth);
  _probe.lookAt(C.lookX, C.lookY, 0);
  _probe.updateProjectionMatrix();
  _probe.updateMatrixWorld(true);
  setEdges(probeXAtNdc(-1), probeXAtNdc(1));
  // Pulling back for a narrow slice viewport should not push the grey-box into
  // fog. Move the fog band by the same depth delta so contrast stays stable.
  const fogShift = ACTIVE_SLICE ? cameraDepth - C.z : 0;
  scene.fog.near = CONFIG.fog.near + fogShift;
  scene.fog.far = CONFIG.fog.far + fogShift;
}

export { calibrateEdges };

// the resize listener is registered in src/main.js with the other input wiring
export function handleResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  calibrateEdges();
}

let camYaw = 0;                 // render yaw (radians); animated by corner events
let camYawBase = 0;             // face heading after all completed corners
const _look = new THREE.Vector3();

// Pose from the scroll cursor: the anchor rides the polyline, the yaw is
// whatever the active corner ritual has reached this frame (was the second
// half of updateCamera).
export function syncCamera() {
  const c = activeCorner();
  camYaw = c && c.state === 'turning'
    ? camYawBase + cornerYawDeltaDeg(gameMs - c.tStart, CONFIG) * DEG * CONFIG.path.turnSign
    : camYawBase;
  // chamfered camera path: anchor rides the polyline; yaw is ritual-driven
  const C = CONFIG.camera;
  const cameraDepth = activeCameraDepth();
  const a = polyAt(SEGS, scrollX, _pp);
  const fx = Math.cos(camYaw), fz = -Math.sin(camYaw);   // fwd along the face
  const rx = -fz, rz = fx;                               // right = fwd × up
  camera.position.set(a.x + fx * C.x + rx * cameraDepth, C.y, a.z + fz * C.x + rz * cameraDepth);
  _look.set(a.x + fx * C.lookX, C.lookY, a.z + fz * C.lookX);
  camera.lookAt(_look);
  camera.updateMatrixWorld();
}

// a completed ritual leaves the camera on the next face's heading
function cornerFinished() {
  camYawBase += 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  camYaw = camYawBase;
}
installView({ corner: { finished: cornerFinished } });

// run reset (resetGame in src/main.js): back to the first face's heading
export function resetCameraYaw() { camYaw = 0; camYawBase = 0; }
