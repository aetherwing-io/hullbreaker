/* =========================== CAMERA =============================== */
/* Camera pose plus the frustum-edge calibration the sim's edge module
   consumes. The scroll cursor and the corner events are sim state; this
   module only reads them, so all the renderer decides is where to stand
   and how far through the ritual yaw the view has travelled. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt } from '../pure/ascent.js';
import { CORNER_S, DEG, SEGS, polyAt } from '../pure/path.js';
import { cornerYawDeltaDeg } from '../pure/waves.js';
import { portraitViewDepthMult, traversalCameraDepth } from '../pure/traversal.js';
import {
  framingLens, jointOrbitAnchor, newFramingLens, resolveFramingId, rightClampInsetTiles,
} from '../pure/framing.js';
import {
  TRANSFORM_FIXTURE, TRANSFORM_PATH, transformAltAt, transformBandHeading,
  transformYawDeltaDeg,
} from '../pure/transform.js';
import {
  ACTIVE_FIXTURE, IS_G1, IS_TRANSFORM_SLICE, JUICE_ENABLED, TURN_ORBIT, VIEW_ID, VIEW_REQUEST,
} from '../mode.js';
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

// The same ray, met on the plane where actors are DRAWN (CONFIG.framing
// .actorDepth toward the camera) instead of the z = 0 route plane.
function probeXAtNdcOnActorPlane(ndcX) {
  _edgeV.set(ndcX, 0, 0.5).unproject(_probe).sub(_probe.position).normalize();
  return _probe.position.x +
    _edgeV.x * ((CONFIG.framing.actorDepth - _probe.position.z) / _edgeV.z);
}

/* Viewport framing (T-107, src/pure/framing.js). Resolved on every
   calibration (boot and resize) and cached, so the frame loop reads it with
   no allocation. Touch hardware is the touch deck's own test
   (src/ui/touch-controls.js touchHardware), so the phone lens is on exactly
   when the deck it frames around can be. Fixtures keep their authored
   framing: FAR lens, no lift, route-plane edges, as before. */
const _lens = newFramingLens();
let _framingCameraDepth = CONFIG.camera.z * CONFIG.viewScales.far.depthMult;
let _framingEdgeRouteRight = 0;

function touchHardware() {
  return (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}

function resolveActiveLens(cameraDepth) {
  const id = ACTIVE_FIXTURE
    ? 'far'
    : resolveFramingId(VIEW_REQUEST, innerWidth, innerHeight, touchHardware());
  return framingLens(id, innerWidth, innerHeight, cameraDepth, CONFIG, _lens);
}

// Read surface for tools (turn-pose-capture, the T-107 probes): the lens the
// page resolved, plus the edge it replaced. Allocates; not for the frame loop.
export function cameraFramingSnapshot() {
  return {
    id: _lens.id, fovDeg: _lens.fovDeg, liftTiles: _lens.liftTiles,
    cameraDepth: _framingCameraDepth, cameraFov: camera.fov,
    touch: touchHardware(), viewRequest: VIEW_REQUEST, orbit: TURN_ORBIT,
    edgeRouteRight: _framingEdgeRouteRight,
  };
}

/* Portrait action-safe framing. The normal run and authored fixtures share a
   minimum effective aspect: below 0.9 the camera pulls back so a phone keeps
   enough horizontal combat context instead of magnifying a narrow route slit.
   At 390x844 that changes the visible width from roughly 21 to 41 world tiles.

   Calibrate the normal run against symmetric inset NDC lines and lower its
   look target so the action strip rises above the touch deck. The renderer,
   world scale and movement tune remain exact. Landscape is unchanged,
   authored fixtures retain their own portrait correction, and both changes
   ease in so tablet rotation cannot pop framing. */
const PORTRAIT_SAFE = Object.freeze({
  startAspect: 0.9,
  fullAspect: 0.56,
  compactViewDepthMult: 1.15,
  maxInsetPx: 46,
  lookDropTiles: 1.55,
});

function portraitBlend(width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const aspect = w / h;
  if (aspect >= PORTRAIT_SAFE.startAspect) return 0;
  return Math.min(1, Math.max(0,
    (PORTRAIT_SAFE.startAspect - aspect) /
    (PORTRAIT_SAFE.startAspect - PORTRAIT_SAFE.fullAspect)
  ));
}

export function portraitRightNdc(width, height) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const u = portraitBlend(width, height);
  const insetPx = Math.min(w * 0.18, PORTRAIT_SAFE.maxInsetPx * u);
  return 1 - 2 * insetPx / w;
}

export function portraitLookDrop(width, height) {
  return PORTRAIT_SAFE.lookDropTiles * portraitBlend(width, height);
}

function activePortraitLookDrop() {
  return ACTIVE_FIXTURE ? 0 : portraitLookDrop(innerWidth, innerHeight);
}

// ?view=<id> (CONFIG.viewScales) pulls the camera straight back along its
// depth axis only, independent of the traversal-slice portrait correction
// above: near is depthMult 1 (exact, so explicit `near` is byte-identical to
// the pre-view-scale camera); absent selects FAR, while mid/far shrink RIG's screen fraction and widen
// the calibrated s-strip by the same factor. See CONFIG.viewScales' comment.
function activeViewDepthMult() {
  const base = (CONFIG.viewScales[VIEW_ID] || CONFIG.viewScales.far).depthMult;
  if (ACTIVE_FIXTURE) return base;
  return portraitViewDepthMult(base, innerWidth / innerHeight, {
    startAspect: PORTRAIT_SAFE.startAspect,
    fullAspect: PORTRAIT_SAFE.fullAspect,
    compactMult: PORTRAIT_SAFE.compactViewDepthMult,
  });
}

export function activeCameraDepth() {
  // The normal run used to bypass this portrait pullback while every authored
  // fixture used it. That made desktop captures look correct but left the
  // shipped iPhone view at the uncorrected fixed-vertical-FOV scale.
  const framing = ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run : CONFIG.camera;
  const base = traversalCameraDepth(CONFIG.camera.z, innerWidth / innerHeight, framing);
  return base * activeViewDepthMult();
}

function calibrateEdges() {
  const C = CONFIG.camera;
  const cameraDepth = activeCameraDepth();
  // T-107: the lens for this viewport (src/pure/framing.js). Desktop resolves
  // FAR with fov === C.fov and zero lift, so the scene camera is untouched
  // and its projection stays byte-identical; a phone narrows the fov only —
  // the camera pose below is the FAR pose at every viewport.
  const lens = resolveActiveLens(cameraDepth);
  _framingCameraDepth = cameraDepth;
  if (camera.fov !== lens.fovDeg) {
    camera.fov = lens.fovDeg;
    camera.updateProjectionMatrix();
  }
  _probe.fov = lens.fovDeg;
  _probe.aspect = innerWidth / innerHeight;
  _probe.position.set(C.x, C.y + lens.liftTiles, cameraDepth);
  _probe.lookAt(C.lookX, C.lookY + lens.liftTiles - activePortraitLookDrop(), 0);
  _probe.updateProjectionMatrix();
  _probe.updateMatrixWorld(true);
  const rightNdc = ACTIVE_FIXTURE ? 1 : portraitRightNdc(innerWidth, innerHeight);
  // Portrait used to protect only the right pursuit edge. RIG could still be
  // carried half under the left glass—the exact place a thumb starts—so the
  // same modest inset now protects both sides of the action strip.
  //
  // T-107 (I-104): EDGE_L stays on the route plane — it is the damage plane,
  // and moving it is a difficulty lever, not a framing fix. EDGE_R is met on
  // the plane actors are DRAWN on and inset by RIG's widest drawn
  // half-silhouette (src/pure/framing.js rightClampInsetTiles), so a RIG the
  // sim pins at the right clamp keeps its whole sprite on screen (it used to
  // render with its chest at NDC ~1.012 at 1280x720). Fixtures keep the
  // route-plane edge their authored pacing was tuned on.
  _framingEdgeRouteRight = probeXAtNdc(rightNdc);
  setEdges(probeXAtNdc(-rightNdc), ACTIVE_FIXTURE
    ? _framingEdgeRouteRight
    : probeXAtNdcOnActorPlane(rightNdc) - rightClampInsetTiles());
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

function foldSmoothstep(a, b, value) {
  const u = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/* One-based world-face gain for broad atmospheric shells. Unlike proud
   geometry, air needs an overlap while the camera is actually orbiting or a
   teal hole opens between two curved veils. The arriving face begins only
   after the ritual moves, reaches full strength before the 0.96 topology
   handoff, and the departing face is exactly gone at that handoff. At every
   settled/gate frame only the current face is nonzero, so a wide desktop view
   cannot see the next plate early or retain the previous one after commit. */
export function cameraFaceBlendGain(face) {
  const fold = cameraFoldSnapshot();
  const departing = fold.baseFacet + 1;
  const arriving = departing + 1;
  if (face === departing)
    return 1 - foldSmoothstep(0.50, FOLD_HANDOFF_PROGRESS, fold.progress);
  if (face === arriving)
    return foldSmoothstep(0.08, 0.88, fold.progress);
  return 0;
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

/* ?orbit=joint (T-102 R3, unjudged, OFF by default; src/pure/framing.js
   jointOrbitAnchor): while a corner turns, the anchor's pivot slides along
   the chamfer with the yaw progress; after the turn, until the scroll has
   caught up past the chamfer, the anchor stays on the arriving face's line.
   The shipped default orbits the frozen halt point instead (the ~40% zoom
   pump). Allocation-free: writes the shared _pp scratch. */
function jointOrbitAnchorNow(c) {
  const step = 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  const chamfer = CONFIG.path.chamferTiles;
  if (c && c.state === 'turning' && Math.abs(step) >= 1e-6)
    return jointOrbitAnchor(polyAt, SEGS, scrollX, CORNER_S[c.k - 1], chamfer,
      (camYaw - camYawBase) / step, camYaw, _pp);
  const completed = Math.abs(step) >= 1e-6 ? Math.round(camYawBase / step) : 0;
  if (completed >= 1 && completed <= CORNER_S.length &&
      scrollX < CORNER_S[completed - 1] + chamfer)
    return jointOrbitAnchor(polyAt, SEGS, scrollX, CORNER_S[completed - 1], chamfer,
      1, camYaw, _pp);
  return polyAt(SEGS, scrollX, _pp);
}

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
    const a = TURN_ORBIT === 'joint' && !ACTIVE_FIXTURE
      ? jointOrbitAnchorNow(c)
      : polyAt(SEGS, scrollX, _pp);
    ax = a.x; az = a.z;
    if (!ACTIVE_FIXTURE) {
      alt = normalAscentAltAt(scrollX, CONFIG.levelLength);
      altAhead = normalAscentAltAt(scrollX + C.lookX, CONFIG.levelLength);
      slope = (altAhead - alt) / C.lookX;
    }
  }
  const fx = Math.cos(camYaw), fz = -Math.sin(camYaw);   // fwd along the face
  const rx = -fz, rz = fx;                               // right = fwd × up
  // T-107: the phone lens may raise camera and look target together (pitch
  // unchanged); zero on desktop and in fixtures, where adding it is exact.
  const lift = _lens.liftTiles;
  camera.position.set(
    ax + fx * C.x + rx * cameraDepth, C.y + alt + slope * C.x + lift, az + fz * C.x + rz * cameraDepth
  );
  _look.set(
    ax + fx * C.lookX,
    C.lookY + altAhead - activePortraitLookDrop() + lift,
    az + fz * C.lookX,
  );
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
let cameraViewInstalled = false;
export function initCameraView() {
  if (cameraViewInstalled) return false;
  installView({ corner: { finished: cornerFinished } });
  cameraViewInstalled = true;
  return true;
}

// run reset (resetGame in src/main.js): back to the first face's heading,
// and no trauma survives a restart — a death shake must not ride into the
// retry frame, the run has to start still
export function resetCameraYaw() {
  camYaw = 0; camYawBase = 0;
  trauma = 0; traumaLastMs = gameMs;
}
