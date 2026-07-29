/* ============================= EDGES ============================== */
/* Screen edges as constant s-offsets from scrollX, calibrated at boot and
   on resize with a probe camera at the local rig pose. Replaces per-frame
   frustum unprojection, which goes invalid the moment the camera yaws.
   Because they derive from scrollX, edges freeze during corner events.
   The calibration itself is renderer geometry and lives in
   src/render/camera.js; it pushes the result in through setEdges. */

import { scrollX } from './time.js';

export let EDGE_L = 0, EDGE_R = 0;

export function setEdges(left, right) { EDGE_L = left; EDGE_R = right; }

export function sLeftEdge()  { return scrollX + EDGE_L; }
export function sRightEdge() { return scrollX + EDGE_R; }
