/* ============================ FRAMING ============================== */
/* Which lens the camera looks through, and where the screen edges the
   simulation reads land — as pure functions of the viewport (T-107).

   decisions.md entry 20 addendum, verbatim: "Phones only get a tighter frame
   (RIG ~6% of screen height); desktop keeps FAR exactly as decided in
   entries 7/17". Landscape is the tuning target; the device is an iPhone.

   THE PHONE FRAME IS THE FAR SHOT THROUGH A LONGER LENS. The camera pose —
   position, look target, the portrait insets and look drop — is the FAR pose
   at every viewport; on a phone only the vertical field of view changes, to
   the angle at which RIG's 1.7-tile body covers CONFIG.framing.phone
   .rigShortSideFrac of the screen's SHORT side. So the phone composition is
   FAR's, cropped: the backdrop keeps its scale against RIG, the corner orbit
   keeps FAR's radius (the post-turn zoom pump stays FAR's 1.4x instead of a
   dolly's ~1.8x), the camera never stands closer to the anatomy than FAR
   does, and every system keyed on camera DISTANCE (fog band, legibility
   gains, hull texel budget, the selftest's depth identity in landscape)
   stays exactly as authored. Desktop resolves to FAR with fov 56 and no
   lift, so its projection is byte-identical (tools/pathcheck/t-107-*.mjs and
   the T-107 live pose probe).

   Device class: a phone is TOUCH hardware (the same test the touch deck
   uses, src/ui/touch-controls.js touchHardware) whose short side is at most
   CONFIG.framing.phone.maxShortSidePx CSS px. A fine-pointer desktop window
   of any size stays FAR; a tablet stays FAR. The class is stable across a
   rotation, because rotation does not change the short side.

   The EDGES. The simulation reads two s-offsets from the scroll anchor
   (src/sim/edges.js): EDGE_L, the pursuing damage plane, and EDGE_R, the
   right clamp (also spawn trigger, gate held view, approach dolly and the
   follow lead's visible width). Both used to be intersections with the z=0
   route plane, but RIG and hostiles DRAW CONFIG.framing.actorDepth toward
   the camera, where the frustum is narrower — a RIG pinned at the right
   clamp rendered with its chest at NDC ~1.012 at 1280x720, half the sprite
   off-frame (I-104). EDGE_R is now calibrated on the actor plane and inset
   by RIG's widest drawn half-silhouette, so the whole sprite stays on screen
   at the clamp. EDGE_L stays on the route plane: moving the damage plane is
   a difficulty lever, not a framing fix (LANE-BRIEF: do not tune the
   difficulty curve), and the pinned-at-the-plane overhang is reported.

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

/* `request` is the raw ?view= value. 'phone' forces the phone lens anywhere;
   a declared CONFIG.viewScales id forces that view (so ?view=far is FAR on a
   phone, and near/mid keep their meaning); anything else — absent included —
   is AUTO: the phone lens on a phone, FAR everywhere else. */
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
   ~5 deg yaw toward its look target move the measured share by under 1%
   (asserted against a full projection in tools/pathcheck/t-107-*.mjs). */
export function phoneLensFovDeg(width, height, cameraDepth, cfg = CONFIG) {
  const w = finitePositive(width) ? width : 1;
  const h = finitePositive(height) ? height : 1;
  const fracOfHeight = cfg.framing.phone.rigShortSideFrac * Math.min(w, h) / h;
  const dist = Math.max(1e-6, cameraDepth - cfg.framing.actorDepth);
  return 2 * Math.atan(cfg.player.height / (2 * fracOfHeight * dist)) * 180 / Math.PI;
}

export function newFramingLens() {
  return { id: 'far', fovDeg: CONFIG.camera.fov, liftTiles: 0 };
}

/* The lens for a resolved framing id at a viewport. Non-phone ids return the
   shipped camera fov and zero lift EXACTLY (the identity desktop relies on).
   `cameraDepth` is the FAR-path depth camera.js already computed. */
export function framingLens(id, width, height, cameraDepth, cfg = CONFIG, out = newFramingLens()) {
  out.id = id;
  if (id === 'phone') {
    out.fovDeg = phoneLensFovDeg(width, height, cameraDepth, cfg);
    out.liftTiles = cfg.framing.phone.liftTiles;
  } else {
    out.fovDeg = cfg.camera.fov;
    out.liftTiles = 0;
  }
  return out;
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
  const tanY = Math.tan(fovDeg * Math.PI / 360);
  const tanX = tanY * aspect;
  const B = basis;
  const dx = B.x[0] * ndcX * tanX + B.y[0] * ndcY * tanY - B.z[0];
  const dz = B.x[2] * ndcX * tanX + B.y[2] * ndcY * tanY - B.z[2];
  return eye[0] + dx * ((planeZ - eye[2]) / dz);
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

/* camera.js calibrateEdges() for the NORMAL run, analytically: the probe
   camera at the flat rig pose (yaw 0, anchor at the origin) with the resolved
   depth, lens fov and lift; the portrait look drop and symmetric NDC inset
   supplied by the caller (camera.js PORTRAIT_SAFE owns them).
     left  — EDGE_L: the route plane z = 0 at NDC -rightNdc (unchanged rule)
     right — EDGE_R: the actor plane at NDC +rightNdc, minus the clamp inset
     routeRight — the old z = 0 right edge, for comparison and reports    */
export function framedEdges({
  width, height, depth, fovDeg = CONFIG.camera.fov, liftTiles = 0,
  lookDrop = 0, rightNdc = 1, actorClamp = true,
}, cfg = CONFIG) {
  const C = cfg.camera;
  const aspect = width / height;
  const eye = [C.x, C.y + liftTiles, depth];
  const B = lookBasis(eye, [C.lookX, C.lookY + liftTiles - lookDrop, 0]);
  const left = rayPlaneX(eye, B, fovDeg, aspect, -rightNdc, 0, 0);
  const routeRight = rayPlaneX(eye, B, fovDeg, aspect, rightNdc, 0, 0);
  const right = actorClamp
    ? rayPlaneX(eye, B, fovDeg, aspect, rightNdc, 0, cfg.framing.actorDepth) - rightClampInsetTiles(cfg)
    : routeRight;
  return { left, right, routeRight, width: right - left, aspect, eye, basis: B, fovDeg };
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
