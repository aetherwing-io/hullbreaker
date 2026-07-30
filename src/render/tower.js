/* ============================ TOWER =============================== */
/* The one place logical (s, y) becomes a 3D position: rendering maps the
   2D ribbon onto the hexagonal tower through the pure polyline. Every
   dynamic entity's mesh places through here.

   The transformation fixture swaps the tower polyline for its own static
   path — the same kind of thing with one extra term: the altitude the body
   has climbed by that point. Nothing in this mapping is animated. During a
   transition only the CAMERA's yaw moves (src/render/camera.js); the world
   RIG runs on stays exactly where it was baked, which is what makes a turn
   read as RIG rounding a limb instead of the world rearranging itself. */

import { CONFIG } from '../config.js';
import { SEGS, polyAt, yawAt } from '../pure/path.js';
import { TRANSFORM_PATH, transformPathAt, transformYawAt } from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites

// (s, y, depth) → world placement, plus the yaw for callers that compose
// further on top of it (depth rides the outward face normal, positive =
// toward the camera). `out` receives the same values for callers that want
// the numbers rather than a posed mesh.
export function towerPose(s, out = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 }) {
  if (IS_TRANSFORM_SLICE) {
    transformPathAt(TRANSFORM_PATH, s, out);
    out.yaw = transformYawAt(TRANSFORM_PATH, s, CONFIG.path.yawBlendTiles);
    return out;
  }
  polyAt(SEGS, s, out);
  out.yaw = yawAt(SEGS, s, CONFIG.path.yawBlendTiles);
  out.alt = 0;
  return out;
}

const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };

export function placeOnTower(mesh, s, y, depth) {
  const p = towerPose(s, _pose);
  mesh.position.set(
    p.x + Math.sin(p.yaw) * depth, y + p.alt, p.z + Math.cos(p.yaw) * depth
  );
  mesh.rotation.y = p.yaw;
  return p.yaw;
}

// Static-bake variant for the slice's own geometry: same mapping, but the
// heading is sharp per column so bricks keep a crisp facing (the tower bakes
// its tiles the same way) instead of blending like a moving rig.
export function placeSharp(mesh, s, y, depth) {
  const p = towerPose(s, _pose);
  const yaw = IS_TRANSFORM_SLICE ? transformYawAt(TRANSFORM_PATH, s, 0) : p.yaw;
  mesh.position.set(
    p.x + Math.sin(yaw) * depth, y + p.alt, p.z + Math.cos(yaw) * depth
  );
  mesh.rotation.y = yaw;
  return yaw;
}
