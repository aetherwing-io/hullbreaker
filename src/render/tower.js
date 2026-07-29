/* ============================ TOWER =============================== */
/* The one place logical (s, y) becomes a 3D position: rendering maps the
   2D ribbon onto the hexagonal tower through the pure polyline. Every
   dynamic entity's mesh places through here. */

import { CONFIG } from '../config.js';
import { SEGS, polyAt, yawAt } from '../pure/path.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites

// (s, y, depth) → tower world placement for a mesh. depth rides the outward
// face normal (positive = toward camera). Returns the yaw for callers that
// compose further on top of it. Every dynamic entity places through here.
export function placeOnTower(mesh, s, y, depth) {
  const yaw = yawAt(SEGS, s, CONFIG.path.yawBlendTiles);
  const wp = polyAt(SEGS, s, _pp);
  mesh.position.set(wp.x + Math.sin(yaw) * depth, y, wp.z + Math.cos(yaw) * depth);
  mesh.rotation.y = yaw;
  return yaw;
}
