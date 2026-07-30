/* ============================== PACE ============================== */
/* The pursuing damage edge's speed, one frame at a time. The shipped run
   and the `base` slice pace hold a constant; the CP1 variants make the
   edge a behavior (hunt rubber-bands off the player's margin, surge ramps
   with elapsed pass time). The decision math itself is pure
   (src/pure/traversal.js) so the harness can assert it; this module only
   owns the current value and who is allowed to write it (sim/scroll.js). */

import { CONFIG } from '../config.js';
import { ACTIVE_SLICE } from '../mode.js';
import { traversalPaceStep } from '../pure/traversal.js';

const PURSUIT = ACTIVE_SLICE ? ACTIVE_SLICE.pursuit : null;

let speed = PURSUIT ? PURSUIT.cruiseSpeed : CONFIG.scrollSpeed;
let peak = speed;

export function paceSpeed() { return speed; }
export function pacePeak() { return peak; }
export function pacePursuit() { return PURSUIT; }

export function updatePace(dt, ctx) {
  if (!PURSUIT) return;
  speed = traversalPaceStep(PURSUIT, speed, ctx, dt);
  if (speed > peak) peak = speed;
}

// run reset (resetGame in src/main.js): the edge rewinds to its opening speed
export function resetPace() {
  speed = PURSUIT ? PURSUIT.cruiseSpeed : CONFIG.scrollSpeed;
  peak = speed;
}
