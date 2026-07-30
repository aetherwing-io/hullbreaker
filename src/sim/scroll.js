/* ============================ SCROLL ============================== */
/* Forced-scroll advance: the corner ritual's frozen-then-eased resume,
   the wave-gate clamp, the fixture's camera-follow floor, and the gate
   arming that used to sit inside updateCamera. The camera *pose* half of
   that function now lives in src/render/camera.js and derives its yaw
   from the same corner events, so the sim owns scroll and only scroll. */

import { CONFIG } from '../config.js';
import { HALT_S } from '../pure/path.js';
import { cornerScrollVel, cornerEventTotalMs } from '../pure/waves.js';
import { traversalFollowTarget } from '../pure/traversal.js';
import { ACTIVE_FIXTURE, IS_TRANSFORM_SLICE } from '../mode.js';
import { gameMs, scrollX, setScrollX } from './time.js';
import { EDGE_R } from './edges.js';
import { activeScrollEnd, activeScrollSpeed } from './level.js';
import { hostiles, removeHostile } from './hostiles.js';
import { player } from './player.js';
import { activeCorner, armGate, finishCorner, updateZipper } from './wavegate.js';
import { updateTransformScroll } from './transform.js';

export function updateScroll(dt) {
  if (IS_TRANSFORM_SLICE) {
    // The transformation fixture's own gate runtime owns the scroll. A
    // starting ritual clears the arena the way a corner gate is already
    // clear before its ritual: nobody fights through a bulkhead flip.
    if (updateTransformScroll(dt, player))
      for (let i = hostiles.length - 1; i >= 0; i--) removeHostile(i, true);
    return;
  }
  const c = activeCorner();
  if (c && c.state === 'turning') {
    const t = gameMs - c.tStart;
    setScrollX(Math.min(scrollX + cornerScrollVel(t, CONFIG) * dt, activeScrollEnd()));
    updateZipper(c, t);
    if (t >= cornerEventTotalMs(CONFIG)) finishCorner(c);
  } else {
    let target = activeScrollEnd();                     // wave-gate / fixture clamp
    if (c) target = Math.min(target, HALT_S[c.k - 1]);
    let nextScroll = scrollX + activeScrollSpeed() * dt;
    if (ACTIVE_FIXTURE) {
      // The fixture's lead is a camera-follow offset, not an invisible player
      // wall. On narrow screens the live frustum becomes the tighter offset.
      const screenLead = Math.max(
        2,
        EDGE_R - CONFIG.edges.margin - ACTIVE_FIXTURE.run.lookAheadTiles
      );
      nextScroll = Math.max(
        nextScroll,
        traversalFollowTarget(
          scrollX,
          player.x + player.hw,
          screenLead,
          ACTIVE_FIXTURE.run
        )
      );
    }
    setScrollX(Math.min(nextScroll, target));
    if (c && c.state === 'idle' && scrollX >= HALT_S[c.k - 1] - 1e-6) armGate(c);
  }
}
