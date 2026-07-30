/* ============================ TOWER =============================== */
/* The one place logical (s, y) becomes a 3D position: rendering maps the
   2D ribbon onto the hexagonal tower through the pure polyline. Every
   dynamic entity's mesh places through here.

   The transformation fixture swaps the polyline for its band frames (an
   origin, a heading and a rendered altitude) and, while a ritual runs, for
   that ritual's animated frame. Same contract, one extra term: altitude.
   Everything that draws in (s, y) reads it from `activeFrame()`, so the
   camera, RIG, hostiles, capsules, bullets and the slice's own hull
   geometry can never disagree about where the world currently is. */

import { CONFIG } from '../config.js';
import { SEGS, polyAt, yawAt } from '../pure/path.js';
import {
  TRANSFORM_FRAMES, transformEventCtx, transformFrameCtx, transformPosAt,
} from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
import { gameMs } from '../sim/time.js';
import { activeTransformEvent, committedBand } from '../sim/transform.js';

const _pp = { x: 0, z: 0 };     // polyAt scratch shared by the per-frame call sites
const _ctx = { s0: 0, x: 0, z: 0, heading: 0, alt: 0, kind: '', band: 0 };
let _ctxStamp = -1;

// The frame the world is drawn in this tick: a committed band, or the
// animated frame of the ritual in progress. Recomputed once per gameplay
// frame (gameMs advances exactly once per update) and shared by reference.
export function activeFrame() {
  if (_ctxStamp !== gameMs) {
    const ev = activeTransformEvent();
    if (ev && ev.state === 'turning') {
      transformEventCtx(TRANSFORM_FRAMES, ev, gameMs - ev.tStart, CONFIG, _ctx);
    } else {
      transformFrameCtx(TRANSFORM_FRAMES[committedBand], _ctx);
    }
    _ctxStamp = gameMs;
  }
  return _ctx;
}

// (s, y, depth) → world placement for a mesh, plus the yaw for callers that
// compose further on top of it (depth rides the outward face normal,
// positive = toward the camera). `out` receives the same values for callers
// that need the numbers instead of a mesh.
export function towerPose(s, out = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 }) {
  if (IS_TRANSFORM_SLICE) {
    const c = activeFrame();
    transformPosAt(c, s, out);
    out.yaw = c.heading;
    out.alt = c.alt;
    return out;
  }
  polyAt(SEGS, s, out);
  out.yaw = yawAt(SEGS, s, CONFIG.path.yawBlendTiles);
  out.alt = 0;
  return out;
}

const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };

export function placeOnTower(mesh, s, y, depth) {
  if (IS_TRANSFORM_SLICE) {
    const p = towerPose(s, _pose);
    mesh.position.set(
      p.x + Math.sin(p.yaw) * depth, y + p.alt, p.z + Math.cos(p.yaw) * depth
    );
    mesh.rotation.y = p.yaw;
    return p.yaw;
  }
  const yaw = yawAt(SEGS, s, CONFIG.path.yawBlendTiles);
  const wp = polyAt(SEGS, s, _pp);
  mesh.position.set(wp.x + Math.sin(yaw) * depth, y, wp.z + Math.cos(yaw) * depth);
  mesh.rotation.y = yaw;
  return yaw;
}
