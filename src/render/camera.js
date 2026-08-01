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
import {
  TRANSFORM_FIXTURE, TRANSFORM_PATH, transformAltAt, transformBandHeading,
  transformYawDeltaDeg,
} from '../pure/transform.js';
import { ACTIVE_FIXTURE, IS_G1, IS_TRANSFORM_SLICE, JUICE_ENABLED, VIEW_ID } from '../mode.js';
import { shakeAt, traumaAdd, traumaAfter } from '../pure/juice.js';
import { installView } from '../sim/bridge.js';
import { gameMs, scrollX } from '../sim/time.js';
import { setEdges } from '../sim/edges.js';
import { activeCorner } from '../sim/wavegate.js';
import { activeTransformEvent, committedBand } from '../sim/transform.js';
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
  // ?g1=1 swaps the band for the limb's tighter haze (CONFIG.limb.fog): the
  // facet past a joint has to wash out. The pull-back shift composes on top,
  // so ?g1=1&view=far keeps the same contrast at its wider radius.
  const fogShift = cameraDepth - C.z;
  const F = IS_G1 ? CONFIG.limb.fog : CONFIG.fog;
  scene.fog.near = F.near + fogShift;
  scene.fog.far = F.far + fogShift;
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

/* ------------------------------ shake ------------------------------ *
 * Trauma (T-011): events add it, it decays, amplitude is trauma squared,
 * and it is applied LAST — after the pose and the lookAt — as a camera-
 * local translation plus a roll. Two properties this ordering buys, both
 * load-bearing:
 *
 *   1. The sim never sees it. calibrateEdges() poses its own probe camera
 *      from CONFIG, so setEdges (the one sanctioned render→sim write) is
 *      computed from the UNSHAKEN pose and the damage plane cannot be
 *      moved by an effect. towerPose is likewise untouched.
 *   2. It is bounded in world tiles, so the FAR default view (decisions.md
 *      entry 7, RIG ~3.7% of screen height) never smears — CONFIG.juice
 *      .shake.maxOffset is the whole budget.
 *
 * Decay runs on gameMs, which only advances while PLAYING, so a pause
 * freezes the shake instead of draining it behind the overlay.        */
const S = CONFIG.juice.shake;
let trauma = 0;
let traumaLastMs = 0;
const _shake = { x: 0, y: 0, roll: 0 };

// the render layer's one juice write surface (src/render/juice.js calls it)
export function addTrauma(amount) {
  if (!JUICE_ENABLED || !(amount > 0)) return;
  trauma = traumaAdd(trauma, amount);
}

export function cameraTrauma() { return trauma; }
const _tp = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };   // transform-slice pose scratch

// Pose from the scroll cursor: the anchor rides the polyline, the yaw is
// whatever the active corner ritual has reached this frame (was the second
// half of updateCamera).
export function syncCamera() {
  const C = CONFIG.camera;
  const cameraDepth = activeCameraDepth();
  let ax, az, alt = 0, altAhead = 0, slope = 0;
  if (IS_TRANSFORM_SLICE) {
    // The anchor rides the static path (position AND the altitude the body has
    // climbed by here); the YAW is the only animated quantity in a transition —
    // the view swinging through the bend on the two-detent curve, exactly like
    // the corner ritual. Nothing in the world moves to meet it.
    const p = towerPose(scrollX, _tp);
    ax = p.x; az = p.z; alt = p.alt;
    const ev = activeTransformEvent();
    const base = transformBandHeading(TRANSFORM_FIXTURE, committedBand, CONFIG);
    camYaw = ev && ev.state === 'turning'
      ? base + transformYawDeltaDeg(gameMs - ev.tStart, CONFIG) * DEG
      : base;
    // Where the body climbs, the view runs along the climb: the look point takes
    // the altitude of the path ahead, so RIG stays framed on a 30-degree ramp
    // instead of walking off the top of the screen.
    altAhead = transformAltAt(TRANSFORM_PATH, scrollX + C.lookX);
    slope = (altAhead - alt) / C.lookX;
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
  camera.position.set(
    ax + fx * C.x + rx * cameraDepth, C.y + alt + slope * C.x, az + fz * C.x + rz * cameraDepth
  );
  _look.set(ax + fx * C.lookX, C.lookY + (IS_TRANSFORM_SLICE ? altAhead : alt), az + fz * C.lookX);
  camera.lookAt(_look);
  if (JUICE_ENABLED) applyShake();
  camera.updateMatrixWorld();
}

// after the pose, before the world matrix: local translate + roll, so the
// shake reads the same on every face heading and never rewrites the anchor
function applyShake() {
  const dtMs = Math.max(0, Math.min(50, gameMs - traumaLastMs));
  traumaLastMs = gameMs;
  if (trauma <= 0) return;
  trauma = traumaAfter(trauma, dtMs, S.decayPerSec);
  shakeAt(trauma, gameMs, S, _shake);
  camera.translateX(_shake.x);
  camera.translateY(_shake.y);
  camera.rotateZ(_shake.roll * DEG);
}

// a completed ritual leaves the camera on the next face's heading
function cornerFinished() {
  camYawBase += 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  camYaw = camYawBase;
}
installView({ corner: { finished: cornerFinished } });

// run reset (resetGame in src/main.js): back to the first face's heading,
// and no trauma survives a restart — a death shake must not ride into the
// retry frame, the run has to start still
export function resetCameraYaw() {
  camYaw = 0; camYawBase = 0;
  trauma = 0; traumaLastMs = gameMs;
}
