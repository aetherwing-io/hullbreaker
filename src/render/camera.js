/* =========================== CAMERA =============================== */
/* Camera pose plus the frustum-edge calibration the sim's edge module
   consumes. The scroll cursor and the corner events are sim state; this
   module only reads them, so all the renderer decides is where to stand
   and how far through the ritual yaw the view has travelled. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt } from '../pure/ascent.js';
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
import { updateLightRig } from './lights.js';
import { towerPose } from './tower.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites
const _edgeV = new THREE.Vector3();
const _probe = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 200);

function probeXAtNdc(ndcX) {
  _edgeV.set(ndcX, 0, 0.5).unproject(_probe).sub(_probe.position).normalize();
  return _probe.position.x + _edgeV.x * (-_probe.position.z / _edgeV.z);
}

/* Portrait action-safe framing. The normal run's camera keeps a fixed
   vertical FOV, so at 390x844 one logical tile is about 25 CSS px wide while
   the right clamp leaves RIG only CONFIG.edges.margin (0.4 tile / ~10 px)
   inside the glass. The sprite and its readability halo are wider than that.

   Calibrate the normal run's RIGHT gameplay edge against an inset NDC line on
   portrait screens. The renderer, FOV, world, movement tune and left damage
   edge do not move; only the existing camera-derived safe clamp comes inward.
   Landscape is exactly 1, authored fixtures retain their own portrait camera
   correction, and the inset eases in so tablet rotation cannot pop framing. */
const PORTRAIT_SAFE = Object.freeze({ startAspect: 0.9, fullAspect: 0.46, maxInsetPx: 64 });

export function portraitRightNdc(width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const aspect = w / h;
  if (aspect >= PORTRAIT_SAFE.startAspect) return 1;
  const u = Math.min(1, Math.max(0,
    (PORTRAIT_SAFE.startAspect - aspect) /
    (PORTRAIT_SAFE.startAspect - PORTRAIT_SAFE.fullAspect)
  ));
  const insetPx = Math.min(w * 0.18, PORTRAIT_SAFE.maxInsetPx * u);
  return 1 - 2 * insetPx / w;
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
  const rightNdc = ACTIVE_FIXTURE ? 1 : portraitRightNdc(innerWidth, innerHeight);
  setEdges(probeXAtNdc(-1), probeXAtNdc(rightNdc));
  // The transformation slice's atmosphere is a per-band cue owned by
  // src/render/transform.js (interior compresses it, altitude opens it up).
  if (IS_TRANSFORM_SLICE) return;
  // Pulling back — for a narrow slice viewport (portrait correction) or for a
  // ?view= pull-back — should not push the grey-box into fog. Move the fog
  // band by the same depth delta so contrast stays stable at every depth.
  // ?g1=1 swaps the band for the limb's tighter haze (CONFIG.limb.fog): the
  // facet past a joint has to wash out. The pull-back shift composes on top,
  // so ?g1=1&view=far keeps the same contrast at its wider radius.
  // T-035 tried a second band here (CONFIG.limb.shadeFog, selected while the
  // value ladder was armed). T-045 then populated this band with graded
  // anatomy tiers authored against CONFIG.limb.fog, and only one band can be
  // live: measured on the merged tree (T-035b, re-verified for T-056 on this
  // tree), the shift bought the ladder nothing (paired-population separation
  // -34.5 vs -34.7, noise) and cost a point of dark share against the frame
  // the operator approved, so the band is T-045's and this line is one
  // expression again. The known cost is recorded in config.js and asserted
  // as a limit in tools/pathcheck/t-035-value-ladder.mjs.
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

/* Proud world geometry cannot use scrollX as its visibility clock during a
   corner: the gate deliberately freezes scroll fourteen tiles before the
   bend while this camera traverses the whole 60-degree ritual.  Expose the
   camera-facing armour sector as a render-only primitive so the static limb
   and its service dressing can agree on which side of the fold is actually
   readable.

   Do not hand the sector over at the 30-degree ratchet hold.  Both broad
   faces are edge-on there, which is exactly where showing the next face's
   buttress/ridge produced the freestanding cream slab.  The deck edge is
   allowed to bridge the turn in its own renderers; proud anatomy changes
   owner only just before the final detent, when it is within 2.4 degrees of
   being seen square-on.  This is a binary instancing cull, so one transition
   uploads matrices once instead of scaling hundreds of instances per frame. */
const FOLD_HANDOFF_PROGRESS = 0.96;

export function cameraFacingFacet() {
  const step = 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  if (Math.abs(step) < 1e-6) return 0;
  const base = Math.round(camYawBase / step);
  const progress = Math.max(0, Math.min(1, (camYaw - camYawBase) / step));
  return Math.max(0, Math.min(CONFIG.path.faces,
    base + (progress >= FOLD_HANDOFF_PROGRESS ? 1 : 0)));
}

export function cameraFoldSnapshot() {
  const step = 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  const validStep = Math.abs(step) >= 1e-6;
  const base = validStep ? Math.round(camYawBase / step) : 0;
  return {
    yaw: camYaw,
    baseFacet: base,
    facingFacet: cameraFacingFacet(),
    progress: validStep
      ? Math.max(0, Math.min(1, (camYaw - camYawBase) / step))
      : 0,
    handoffProgress: FOLD_HANDOFF_PROGRESS,
  };
}

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
    // Chamfered helix: x/z ride the polyline, y rides the same pure ascent
    // every world bake uses, and yaw remains ritual-driven. Looking up the
    // local grade keeps RIG centred instead of letting the climb drift high.
    const a = polyAt(SEGS, scrollX, _pp);
    ax = a.x; az = a.z;
    if (!ACTIVE_FIXTURE) {
      alt = normalAscentAltAt(scrollX, CONFIG.levelLength);
      altAhead = normalAscentAltAt(scrollX + C.lookX, CONFIG.levelLength);
      slope = (altAhead - alt) / C.lookX;
    }
  }
  const fx = Math.cos(camYaw), fz = -Math.sin(camYaw);   // fwd along the face
  const rx = -fz, rz = fx;                               // right = fwd × up
  camera.position.set(
    ax + fx * C.x + rx * cameraDepth, C.y + alt + slope * C.x, az + fz * C.x + rz * cameraDepth
  );
  _look.set(ax + fx * C.lookX, C.lookY + altAhead, az + fz * C.lookX);
  camera.lookAt(_look);
  /* The light rig (./lights.js) is aimed from HERE, with the UNSHAKEN look
     point and the yaw the ritual has reached — the same two quantities the
     pose is built from, and for the same two reasons the shake is applied
     afterwards: a shadow frustum that rode the shake would make every shadow
     edge jitter under a hit, and the sim must never see the rig at all. */
  updateLightRig(_look.x, _look.y, _look.z, camYaw);
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
