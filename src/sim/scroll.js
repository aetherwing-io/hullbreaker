/* ============================ SCROLL ============================== */
/* Forced-scroll advance: the corner ritual's frozen-then-eased resume,
   the wave-gate clamp, the fixture's camera-follow floor, and the gate
   arming that used to sit inside updateCamera. The camera *pose* half of
   that function now lives in src/render/camera.js and derives its yaw
   from the same corner events, so the sim owns scroll and only scroll. */

import { CONFIG } from '../config.js';
import { HALT_S } from '../pure/path.js';
import { cornerScrollVel, cornerEventTotalMs } from '../pure/waves.js';
import {
  traversalFollowTarget, traversalMarginCapScroll,
} from '../pure/traversal.js';
import { ACTIVE_SLICE } from '../mode.js';
import { gameMs, scrollX, setScrollX, sliceStats } from './time.js';
import { EDGE_R, sLeftEdge } from './edges.js';
import { activeScrollEnd, activeScrollSpeed } from './level.js';
import { updatePace } from './pace.js';
import { player } from './player.js';
import { activeCorner, armGate, finishCorner, updateZipper } from './wavegate.js';

export function updateScroll(dt) {
  // The pursuit model decides this frame's edge speed before anything reads
  // it. Its inputs are the two things a pursuing edge can honestly react to:
  // how much daylight the player has, and how long the pass has been running.
  if (ACTIVE_SLICE) {
    const bounds = ACTIVE_SLICE.darePocket.bounds;
    updatePace(dt, {
      marginTiles: player.x - player.hw - sLeftEdge(),
      elapsedMs: gameMs - sliceStats.startedAt,
      inPocket: player.x >= bounds.x0 && player.x < bounds.x1,
    });
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
    if (ACTIVE_SLICE) {
      // The fixture's lead is a camera-follow offset, not an invisible player
      // wall. On narrow screens the live frustum becomes the tighter offset.
      const screenLead = Math.max(
        2,
        EDGE_R - CONFIG.edges.margin - ACTIVE_SLICE.run.lookAheadTiles
      );
      nextScroll = Math.max(
        nextScroll,
        traversalFollowTarget(
          scrollX,
          player.x + player.hw,
          screenLead,
          ACTIVE_SLICE.run
        )
      );
      // A pace that bounds crush slack in seconds also caps how far behind the
      // player the plane may sit, so the clock cannot be widened by a wider
      // screen. Scroll only ever ratchets forward, so this can crowd the player
      // but never rewind the world.
      const cap = ACTIVE_SLICE.pursuit.marginCapTiles;
      if (cap > 0) {
        nextScroll = Math.max(nextScroll, traversalMarginCapScroll(
          player.x - player.hw, sLeftEdge() - scrollX, cap,
        ));
      }
    }
    setScrollX(Math.min(nextScroll, target));
    if (c && c.state === 'idle' && scrollX >= HALT_S[c.k - 1] - 1e-6) armGate(c);
  }
}
