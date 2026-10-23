/* ============================ FRAMING ============================== */
/* Which lens the camera looks through, and where the screen edges the
   simulation reads land — as pure functions of the viewport (T-107).

   decisions.md entry 20 addendum, verbatim: "Phones only get a tighter frame
   (RIG ~6% of screen height); desktop keeps FAR exactly as decided in
   entries 7/17". Landscape is the tuning target; the device is an iPhone.

   THE PHONE FRAME IS THE FAR SHOT THROUGH A LONGER LENS. The camera pose —
   position, look target, the portrait insets and look drop — is the FAR pose
   at every viewport; on a landscape phone only the vertical field of view
   narrows, to the angle at which RIG's 1.7-tile body (drawn
   CONFIG.framing.actorDepth toward the camera) covers
   CONFIG.framing.phone.rigShortSideFrac of the screen's short side, and the
   camera and its look target rise together by CONFIG.framing.phone.liftTiles
   (pitch unchanged). So the phone composition is FAR's, cropped: the
   backdrop keeps its scale against RIG, the corner orbit keeps FAR's radius,
   the camera never stands closer to the anatomy than FAR does, and every
   system keyed on camera DISTANCE (fog band, legibility gains, hull texel
   budget) stays as authored.

   THE LENS ONLY EVER NARROWS. Where FAR already shows RIG at least that
   large — a portrait phone, whose compact portrait framing (camera.js
   PORTRAIT_SAFE) draws RIG's body at ~7% of the short side — the phone frame
   IS the FAR frame, exactly: widening it would shrink RIG below FAR's own
   portrait size and push the frame's bottom edge 11.6 tiles past the far
   anatomy veil (tools/simlab/framing/veil-need.mjs). Portrait is secondary
   (entry 20 addendum: landscape first).

   Desktop resolves to FAR with the shipped fov and zero lift EXACTLY, so its
   camera projection is byte-identical (asserted in tools/pathcheck/
   t-107-phone-framing.mjs; proven on the live camera matrices by
   tools/playtest/phone-framing-probe.mjs --compare).

   Device class: a phone is TOUCH hardware (the same test the touch deck
   uses, src/ui/touch-controls.js touchHardware) whose short side is at most
   CONFIG.framing.phone.maxShortSidePx CSS px. A fine-pointer desktop window
   of any size stays FAR; a tablet stays FAR. The class is stable across a
   rotation, because rotation does not change the short side.

   The EDGES. The simulation reads two s-offsets from the scroll anchor
   (src/sim/edges.js): EDGE_L, the pursuing damage plane, and EDGE_R, the
   right clamp (also spawn trigger, gate held view, approach dolly and the
   follow lead's width). Both used to be intersections of the frame's centre
   row with the z = 0 route plane, but RIG and hostiles DRAW
   CONFIG.framing.actorDepth toward the camera, where the frustum is
   narrower, and the camera's slight downward pitch narrows the frame's
   right edge toward the top — a RIG pinned at the right clamp rendered with
   its chest at NDC ~1.012 at 1280x720, half the sprite off-frame (I-104),
   and on a FAR phone off it entirely. Under the PHONE LENS EDGE_R is the
   frame's right edge on the actor plane at its NARROWEST row, inset by RIG's
   widest drawn half-silhouette, so RIG's whole sprite stays on screen at the
   clamp anywhere in the frame. Every FAR frame keeps the route-plane edges
   exactly: EDGE_R also drives the spawn trigger, the gate cohort and patrol
   box, the approach dolly and the follow lead, so moving it there would
   change desktop play (actorClampForLens below). EDGE_L stays on the route
   plane everywhere: moving the damage plane is a difficulty lever, not a
   framing fix, and the pinned-at-the-plane overhang is reported (T-107
   report).

   No three.js, no DOM: the device facts arrive as arguments, which is what
   lets the headless labs (tools/simlab/) share this exact math.          */

import { CONFIG } from '../config.js';

export const FRAMING_IDS = Object.freeze(['far', 'phone', 'near', 'mid']);

const finitePositive = (v) => Number.isFinite(v) && v > 0;

// A phone: touch hardware with a short side no larger than the phone bound.
export function isPhoneViewport(width, height, touch, cfg = CONFIG) {
  if (!touch || !finitePositive(width) || !finitePositive(height)) return false;
  return Math.min(width, height) <= cfg.framing.phone.maxShortSidePx;
}

/* `request` is the raw ?view= value. 'phone' forces the phone frame anywhere;
   a declared CONFIG.viewScales id forces that view (so ?view=far is FAR on a
   phone, and near/mid keep their meaning); anything else — absent included —
   is AUTO: the phone frame on a phone, FAR everywhere else. */
export function resolveFramingId(request, width, height, touch, cfg = CONFIG) {
  if (request === 'phone') return 'phone';
  if (typeof request === 'string' && Object.prototype.hasOwnProperty.call(cfg.viewScales, request))
    return request;
  return isPhoneViewport(width, height, touch, cfg) ? 'phone' : 'far';
}

/* The vertical field of view (degrees) at which RIG's body, drawn
   cfg.framing.actorDepth toward a camera standing `cameraDepth` from the
   route plane, covers rigShortSideFrac of the viewport's SHORT side. A
   closed form on the camera's depth axis; the camera's ~2 deg pitch and
   ~3 deg yaw toward its look target move the projected share by well under
   1% (the projected share is what tools/pathcheck/t-107-phone-framing.mjs
   asserts). */
export function phoneLensFovDeg(width, height, cameraDepth, cfg = CONFIG) {
  const w = finitePositive(width) ? width : 1;
  const h = finitePositive(height) ? height : 1;
  const fracOfHeight = cfg.framing.phone.rigShortSideFrac * Math.min(w, h) / h;
  const dist = Math.max(1e-6, cameraDepth - cfg.framing.actorDepth);
  return 2 * Math.atan(cfg.player.height / (2 * fracOfHeight * dist)) * 180 / Math.PI;
}

export function newFramingLens() {
  return { id: 'far', fovDeg: CONFIG.camera.fov, liftTiles: 0, actorClamp: false };
}

/* The lens for a resolved framing id at a viewport. Non-phone ids — and a
   phone whose FAR frame already shows RIG at least the phone size (portrait)
   — return the shipped camera fov, zero lift and the route-plane edges
   EXACTLY (the identity desktop relies on). `cameraDepth` is the FAR-path
   depth camera.js already computed. `actorClamp` is true exactly when the
   phone lens narrows the frame (see actorClampForLens). */
export function framingLens(id, width, height, cameraDepth, cfg = CONFIG, out = newFramingLens()) {
  out.id = id;
  out.fovDeg = cfg.camera.fov;
  out.liftTiles = 0;
  out.actorClamp = false;
  if (id === 'phone') {
    const fov = phoneLensFovDeg(width, height, cameraDepth, cfg);
    if (fov < cfg.camera.fov) {
      out.fovDeg = fov;
      out.liftTiles = cfg.framing.phone.liftTiles;
      out.actorClamp = actorClampForLens(fov, cfg);
    }
  }
  return out;
}

/* Which right edge the sim gets. The sim reads ONE right edge (src/sim/
   edges.js EDGE_R) for RIG's clamp AND for the ambient spawn trigger, the
   gate cohort, the gate patrol box, the approach dolly and T-201's follow
   lead. Calibrating it on the actor plane keeps a pinned RIG whole on screen
   (I-104), but at a FAR frame that moves every one of those 2.3-3 tiles and
   shifts desktop play (measured: ambient spawns trigger 2.5 tiles later at
   1280x720, and T-102's paced gunner meets 2 held gates instead of 5 under
   T-201's escape hatch). So the actor-plane clamp belongs to the phone lens —
   a new frame, calibrated fresh — and every FAR frame (desktop, `?view=far`,
   portrait) keeps main's route-plane edges bit for bit. Fixing the FAR clamp
   without moving the rest needs a second sim edge (T-107 report). */
export function actorClampForLens(fovDeg, cfg = CONFIG) {
  return fovDeg < cfg.camera.fov;
}

/* How far inside the actor-plane frustum edge EDGE_R must sit so RIG's whole
   drawn silhouette stays on screen when the sim pins RIG at the right clamp
   (player.x + hw <= EDGE_R - margin, src/sim/player.js). */
export function rightClampInsetTiles(cfg = CONFIG) {
  return cfg.framing.actorHalfExtent - cfg.player.width / 2 - cfg.edges.margin;
}

/* ------------------- analytic camera (no three.js) ------------------- *
 * THREE.Object3D.lookAt for a camera (local -Z at the target, +Y up) and the
 * ray through an NDC point, so the labs and pathcheck can reproduce
 * camera.js calibrateEdges() and project actors exactly the way the page
 * does. Array math, allocation per call: bake/analysis use only.          */

export function lookBasis(eye, target) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  // x = normalize(cross(worldUp, z)); y = cross(z, x)
  let xx = zz, xy = 0, xz = -zx;
  let xl = Math.hypot(xx, xy, xz);
  if (xl < 1e-12) { xx = 1; xy = 0; xz = 0; xl = 1; }
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return { x: [xx, xy, xz], y: [yx, yy, yz], z: [zx, zy, zz] };
}

// x where the ray through (ndcX, ndcY) meets the plane z = planeZ.
export function rayPlaneX(eye, basis, fovDeg, aspect, ndcX, ndcY, planeZ) {
  return rayPlanePoint(eye, basis, fovDeg, aspect, ndcX, ndcY, planeZ).x;
}

// (x, y) where the ray through (ndcX, ndcY) meets the plane z = planeZ.
export function rayPlanePoint(eye, basis, fovDeg, aspect, ndcX, ndcY, planeZ) {
  const tanY = Math.tan(fovDeg * Math.PI / 360);
  const tanX = tanY * aspect;
  const B = basis;
  const dx = B.x[0] * ndcX * tanX + B.y[0] * ndcY * tanY - B.z[0];
  const dy = B.x[1] * ndcX * tanX + B.y[1] * ndcY * tanY - B.z[1];
  const dz = B.x[2] * ndcX * tanX + B.y[2] * ndcY * tanY - B.z[2];
  const t = (planeZ - eye[2]) / dz;
  return { x: eye[0] + dx * t, y: eye[1] + dy * t };
}

// NDC of a world point (THREE convention); behind = true when not in front.
export function projectNdc(eye, basis, fovDeg, aspect, p) {
  const vx = p[0] - eye[0], vy = p[1] - eye[1], vz = p[2] - eye[2];
  const cx = vx * basis.x[0] + vy * basis.x[1] + vz * basis.x[2];
  const cy = vx * basis.y[0] + vy * basis.y[1] + vz * basis.y[2];
  const cz = vx * basis.z[0] + vy * basis.z[1] + vz * basis.z[2];
  const tanY = Math.tan(fovDeg * Math.PI / 360);
  if (cz >= 0) return { x: NaN, y: NaN, behind: true, dist: -cz };
  return { x: cx / (-cz * tanY * aspect), y: cy / (-cz * tanY), behind: false, dist: -cz };
}

// The frame's right edge on the actor plane: the frame is a quad, so its
// right side meets the plane in a straight line and the narrowest point is
// at the top or bottom row (NDC y = +1 or -1).
export function actorPlaneRightX(xAtNdcY) {
  return Math.min(xAtNdcY(1), xAtNdcY(-1));
}

/* camera.js calibrateEdges() for the NORMAL run, analytically: the probe
   camera at the flat rig pose (yaw 0, anchor at the origin) with the resolved
   depth, lens fov and lift; the portrait look drop and symmetric NDC inset
   supplied by the caller (camera.js PORTRAIT_SAFE owns them).
     left  — EDGE_L: the route plane z = 0 at NDC (-rightNdc, 0) (unchanged)
     right — EDGE_R: under the phone lens, the actor plane's narrowest row at
             NDC +rightNdc minus the clamp inset; at every FAR frame the
             route plane z = 0 at NDC (+rightNdc, 0), exactly as before T-107
     routeRight — the z = 0 right edge, for comparison and reports
   `actorClamp` defaults to the page's rule (actorClampForLens); pass false to
   model a route-plane clamp (T-104's estimate rows, falsifiers). */
export function framedEdges({
  width, height, depth, fovDeg = CONFIG.camera.fov, liftTiles = 0,
  lookDrop = 0, rightNdc = 1, actorClamp,
}, cfg = CONFIG) {
  const C = cfg.camera;
  const onActorPlane = actorClamp === undefined ? actorClampForLens(fovDeg, cfg) : !!actorClamp;
  const aspect = width / height;
  const eye = [C.x, C.y + liftTiles, depth];
  const B = lookBasis(eye, [C.lookX, C.lookY + liftTiles - lookDrop, 0]);
  const left = rayPlaneX(eye, B, fovDeg, aspect, -rightNdc, 0, 0);
  const routeRight = rayPlaneX(eye, B, fovDeg, aspect, rightNdc, 0, 0);
  const right = onActorPlane
    ? actorPlaneRightX((ndcY) => rayPlaneX(eye, B, fovDeg, aspect, rightNdc, ndcY, cfg.framing.actorDepth)) -
      rightClampInsetTiles(cfg)
    : routeRight;
  return { left, right, routeRight, width: right - left, aspect, eye, basis: B, fovDeg, actorClamp: onActorPlane };
}

/* ------------------------- the corner orbit -------------------------- *
 * T-102 R3 (I-103): during a corner ritual the scroll is frozen at the halt,
 * 14 tiles before the joint, and the shipped camera orbits THAT point — so
 * after the 60 deg swing it stands ~12 tiles closer to the arriving face and
 * the view is ~40% closer, easing back over ~3.5 s as the scroll catches up.
 * The 'joint' orbit (?orbit=joint, unjudged, OFF by default) slides the
 * camera's anchor pivot along the chamfer with the ritual's yaw progress u,
 * and projects the scroll's distance from that pivot along the camera's own
 * heading. u = 0 reproduces polyAt(scrollX) exactly on the departing face;
 * u = 1 reproduces it exactly once the scroll passes the chamfer, and before
 * that extends the arriving face's line back past the joint — the camera
 * stays at its normal depth from the face it is looking at.               */
export function jointOrbitAnchor(polyAtFn, segs, scrollX, cornerS, chamferTiles, u, yaw,
  out = { x: 0, z: 0 }) {
  const t = u <= 0 ? 0 : (u >= 1 ? 1 : u);
  const pivotS = cornerS + chamferTiles * t;
  polyAtFn(segs, pivotS, out);
  const d = scrollX - pivotS;
  out.x += Math.cos(yaw) * d;
  out.z -= Math.sin(yaw) * d;
  return out;
}
