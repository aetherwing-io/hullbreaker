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
import { ACTIVE_FIXTURE, IS_TRANSFORM_SLICE, VIEW_ID } from '../mode.js';
import { installView } from '../sim/bridge.js';
import { gameMs, scrollX } from '../sim/time.js';
import { setEdges } from '../sim/edges.js';
import { activeCorner } from '../sim/wavegate.js';
import { renderer, scene, camera } from './scene.js';
import { towerPose } from './tower.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites
const _edgeV = new THREE.Vector3();
const _probe = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 200);

function probeXAtNdc(ndcX) {
  _edgeV.set(ndcX, 0, 0.5).unproject(_probe).sub(_probe.position).normalize();
  return _probe.position.x + _edgeV.x * (-_probe.position.z / _edgeV.z);
}

// ?view=<id> (CONFIG.viewScales) pulls the camera straight back along its
// depth axis only, independent of the traversal-slice portrait correction
// above: near is depthMult 1 (exact, so `near`/absent is byte-identical to
// the pre-view-scale camera), mid/far shrink RIG's screen fraction and widen
// the calibrated s-strip by the same factor. See CONFIG.viewScales' comment.
function activeViewDepthMult() {
  return (CONFIG.viewScales[VIEW_ID] || CONFIG.viewScales.near).depthMult;
}

export function activeCameraDepth() {
  const base = ACTIVE_FIXTURE
    ? traversalCameraDepth(CONFIG.camera.z, innerWidth / innerHeight, ACTIVE_FIXTURE.run)
    : CONFIG.camera.z;
  return base * activeViewDepthMult();
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
  // The transformation slice's atmosphere is a per-band cue owned by
  // src/render/transform.js (interior compresses it, altitude opens it up).
  if (IS_TRANSFORM_SLICE) return;
  // Pulling back — for a narrow slice viewport (portrait correction) or for a
  // ?view= pull-back — should not push the grey-box into fog. Move the fog
  // band by the same depth delta so contrast stays stable at every depth.
  const fogShift = cameraDepth - C.z;
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
const _tp = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };   // transform-slice pose scratch

// Pose from the scroll cursor: the anchor rides the polyline, the yaw is
// whatever the active corner ritual has reached this frame (was the second
// half of updateCamera).
export function syncCamera() {
  const C = CONFIG.camera;
  const cameraDepth = activeCameraDepth();
  let ax, az, alt = 0;
  if (IS_TRANSFORM_SLICE) {
    // The slice's frame carries the heading AND the phase altitude: the same
    // pose code, one term higher up the ship. Everything the frame lifts, the
    // hull already behind RIG does not — that is the climb, rendered.
    const p = towerPose(scrollX, _tp);
    ax = p.x; az = p.z; alt = p.alt;
    camYaw = p.yaw;
  } else {
    const c = activeCorner();
    camYaw = c && c.state === 'turning'
      ? camYawBase + cornerYawDeltaDeg(gameMs - c.tStart, CONFIG) * DEG * CONFIG.path.turnSign
      : camYawBase;
    // chamfered camera path: anchor rides the polyline; yaw is ritual-driven
    const a = polyAt(SEGS, scrollX, _pp);
    ax = a.x; az = a.z;
  }
  const fx = Math.cos(camYaw), fz = -Math.sin(camYaw);   // fwd along the face
  const rx = -fz, rz = fx;                               // right = fwd × up
  camera.position.set(ax + fx * C.x + rx * cameraDepth, C.y + alt, az + fz * C.x + rz * cameraDepth);
  _look.set(ax + fx * C.lookX, C.lookY + alt, az + fz * C.lookX);
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
