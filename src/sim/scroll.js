/* ============================ SCROLL ============================== */
/* Forced-scroll advance: the corner ritual's frozen-then-eased resume,
   the wave-gate clamp, the fixture's camera-follow floor, and the gate
   arming that used to sit inside updateCamera. The camera *pose* half of
   that function now lives in src/render/camera.js and derives its yaw
   from the same corner events, so the sim owns scroll and only scroll. */

import { CONFIG } from '../config.js';
import { BEND_S, HALT_S } from '../pure/path.js';
import {
  cornerApproachScrollTarget, cornerScrollVel, cornerEventTotalMs, gatePreludeReady,
} from '../pure/waves.js';
import {
  traversalFollowTarget, traversalMarginCapScroll,
} from '../pure/traversal.js';
import { ACTIVE_FIXTURE, ACTIVE_SLICE, IS_TRANSFORM_SLICE, MOMENTUM_ENABLED } from '../mode.js';
import { gameMs, scrollX, setScrollX, sliceStats } from './time.js';
import { EDGE_R, sLeftEdge, sRightEdge } from './edges.js';
import { activeScrollEnd, activeScrollSpeed } from './level.js';
import { hostiles, kills, removeHostile } from './hostiles.js';
import { updateMomentum, updatePace } from './pace.js';
import { player } from './player.js';
import {
  activeCorner, armGate, cornerBusy, finishCorner, primeGateWave, updateZipper,
} from './wavegate.js';
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
  /* MOMENTUM (T-022, ?momentum=1, six-face run only): the same "decide this
     frame's edge speed before anything reads it" contract the fixture pursuit
     model above uses. Its inputs are player state only — where RIG sits
     between the damage plane and the right clamp, the kill tally, and hp —
     because entry 11's escalation is EARNED, never a per-face script.

     `held` covers every stretch where the scroll is not advancing: a wave-gate
     fight, a corner ritual, or the level-end clamp. The daylight bank holds
     its last moving reading there (the plane is not closing, so screen
     position would otherwise hand anyone who reaches a gate the ceiling for
     free) while the kill term keeps working — what escalates a held arena is
     clearing it. */
  if (MOMENTUM_ENABLED) {
    const clamp = c ? Math.min(activeScrollEnd(), HALT_S[c.k - 1]) : activeScrollEnd();
    updateMomentum(dt, {
      playerLeft: player.x - player.hw,
      edgeLeft: sLeftEdge(),
      edgeRight: sRightEdge(),
      kills,
      hp: player.hp,
      lives: player.lives,
      nowMs: gameMs,
      held: cornerBusy() || scrollX >= clamp - 1e-6,
    });
  }
  if (c && c.state === 'turning') {
    const t = gameMs - c.tStart;
    setScrollX(Math.min(scrollX + cornerScrollVel(t, CONFIG) * dt, activeScrollEnd()));
    updateZipper(c, t);
    if (t >= cornerEventTotalMs(CONFIG)) finishCorner(c);
  } else {
    let target = activeScrollEnd();                     // wave-gate / fixture clamp
    if (c) {
      // Gate combat still freezes at HALT_S. After the clear, give the camera
      // the smallest forward dolly that keeps RIG visible while their centre
      // physically reaches BEND_S. Without this composition a portrait/FAR
      // frustum could clamp the right edge more than a tile before the joint,
      // leaving the run permanently in `approach` with no enemies remaining.
      const cornerTarget = cornerApproachScrollTarget(
        c.state, HALT_S[c.k - 1], BEND_S[c.k - 1], EDGE_R,
        CONFIG.edges.margin, player.hw,
      );
      target = Math.min(target, cornerTarget);
    }
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
      // A pace that bounds crush slack in seconds also caps how far behind the
      // player the plane may sit, so the clock cannot be widened by a wider
      // screen. Scroll only ever ratchets forward, so this can crowd the player
      // but never rewind the world.
      const cap = ACTIVE_SLICE ? ACTIVE_SLICE.pursuit.marginCapTiles : 0;
      if (cap > 0) {
        nextScroll = Math.max(nextScroll, traversalMarginCapScroll(
          player.x - player.hw, sLeftEdge() - scrollX, cap,
        ));
      }
    }
    setScrollX(Math.min(nextScroll, target));
    if (c && gatePreludeReady(c.state, c.primed, scrollX, HALT_S[c.k - 1]))
      primeGateWave(c);
    if (c && c.state === 'idle' && scrollX >= HALT_S[c.k - 1] - 1e-6) armGate(c);
  }
}
