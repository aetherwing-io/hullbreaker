/* ============================ SCROLL ============================== */
/* Forced-scroll advance: the corner ritual's frozen-then-eased resume,
   the wave-gate clamp, the fixture's camera-follow floor, the six-face
   follow-lead (T-201), and the gate arming that used to sit inside
   updateCamera. The camera *pose* half of that function now lives in
   src/render/camera.js and derives its yaw from the same corner events, so
   the sim owns scroll and only scroll. */

import { CONFIG } from '../config.js';
import { BEND_S, HALT_S } from '../pure/path.js';
import {
  cornerApproachScrollTarget, cornerArrivalReady, cornerJointRule, cornerScrollVel,
  cornerEventTotalMs, gatePreludeReady,
} from '../pure/waves.js';
import { followLeadTiles, followScrollFloor } from '../pure/momentum.js';
import {
  traversalFollowTarget, traversalMarginCapScroll,
} from '../pure/traversal.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, FOLLOW_ENABLED, GATES_ROLLING, IS_TRANSFORM_SLICE,
  MOMENTUM_ENABLED,
} from '../mode.js';
import { gameMs, scrollX, setScrollX, sliceStats } from './time.js';
import { EDGE_L, EDGE_R, sLeftEdge, sRightEdge } from './edges.js';
import { activeScrollEnd, activeScrollSpeed } from './level.js';
import { hostiles, kills, removeHostile } from './hostiles.js';
import { updateMomentum, updatePace } from './pace.js';
import { player } from './player.js';
import {
  activeCorner, armGate, cornerBusy, finishCorner, primeGateWave,
  retireUnseenGateRows, rollingPrimeReady, updateRollingEncounter,
} from './wavegate.js';
import { updateTransformScroll } from './transform.js';

// A corner arms when RIG reaches its closed joint as well as when the scroll
// reaches the halt — under the follow-lead (T-202) and under rolling corners
// (entry 23 #2: the turn never waits). `?follow=0&gates=legacy` is today's
// halt-only arming exactly.
const ARM_ON_ARRIVAL = FOLLOW_ENABLED || GATES_ROLLING;

export function updateScroll(dt) {
  if (IS_TRANSFORM_SLICE) {
    // The transformation fixture's own gate runtime owns the scroll. A
    // starting ritual clears the arena the way a corner gate is already
    // clear before its ritual: nobody fights through a bulkhead flip.
    if (updateTransformScroll(dt, player))
      for (let i = hostiles.length - 1; i >= 0; i--) removeHostile(i, true);
    return;
  }
  const scrollBefore = scrollX;
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
  // FOLLOW-LEAD (T-202): the lead and the scroll floor that keeps RIG's front
  // that far inside the right edge, from the LIVE edge calibration.
  const lead = FOLLOW_ENABLED ? followLeadTiles(EDGE_R - EDGE_L, CONFIG.follow) : 0;
  const followFloor = FOLLOW_ENABLED
    ? Math.min(followScrollFloor(player.x + player.hw, EDGE_R, lead), activeScrollEnd())
    : -Infinity;
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
     clearing it.

     Under the follow-lead the right clamp is never reached, so the bank's
     saturating position moves to the lead line (`leadDaylight`, src/pure/
     momentum.js momentumLeadBank — entry 11's tension, named there). */
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
      leadDaylight: FOLLOW_ENABLED ? EDGE_R - lead - EDGE_L - 2 * player.hw : undefined,
    });
  }
  if (c && c.state === 'turning') {
    const t = gameMs - c.tStart;
    // The ritual owns the scroll. RIG is pinned on the hinge, so the follow
    // floor equals the scroll already reached and never moves it — except
    // under ?hinge=flow, where RIG may run on after the camera hand-off and
    // the frame keeps its lead instead of snapping after the ritual.
    setScrollX(Math.min(Math.max(scrollX + cornerScrollVel(t, CONFIG) * dt, followFloor),
      activeScrollEnd()));
    if (t >= cornerEventTotalMs(CONFIG)) finishCorner(c, player.x);
  } else {
    let target = activeScrollEnd();                     // wave-gate / fixture clamp
    if (c) {
      // Gate combat still freezes at HALT_S. After the clear, give the camera
      // the smallest forward dolly that keeps RIG visible while their centre
      // physically reaches BEND_S. Without this composition a portrait/FAR
      // frustum could clamp the right edge more than a tile before the joint,
      // leaving the run permanently in `approach` with no enemies remaining.
      // A corner armed on arrival holds the scroll where it was (heldS).
      const cornerTarget = cornerApproachScrollTarget(
        c.state, c.heldS === null ? HALT_S[c.k - 1] : c.heldS, BEND_S[c.k - 1], EDGE_R,
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
    // T-102: the plane only ever ratchets forward. A cleared-gate approach
    // dolly reached for a narrow frame must not rewind the world when a resize
    // widens it mid-approach (the new target can sit below the scroll already
    // reached: 0.32 tiles at 260x1000, more with any closer camera).
    let next = Math.max(scrollX, Math.min(nextScroll, target));
    // FOLLOW-LEAD: a floor applied after the halt clamp. RIG cannot pass the
    // corner frontier before the turn, so the floor keeps the joint (and at
    // most one lead of the next facet) in frame and never runs the camera
    // past the corner; on narrow views it is what keeps the joint reachable
    // without the approach dolly. A held legacy gate keeps its scroll.
    if (FOLLOW_ENABLED && (!c || c.state !== 'gate')) next = Math.max(next, followFloor);
    setScrollX(next);
    if (c && c.state === 'idle' && !c.primed &&
        (gatePreludeReady(c.state, c.primed, scrollX, HALT_S[c.k - 1]) ||
         rollingPrimeReady(c, player.x)))
      primeGateWave(c, dt > 0 ? (scrollX - scrollBefore) / dt : 0);
    if (c && c.state === 'idle') {
      if (scrollX >= HALT_S[c.k - 1] - 1e-6) armGate(c);
      // (the rule object is only built near the joint: the hot path stays
      // allocation-free on every other frame)
      else if (ARM_ON_ARRIVAL && player.x + player.hw >= c.s - 1 &&
          cornerArrivalReady(c.state, player.x + player.hw,
            cornerJointRule('idle', c.s, BEND_S[c.k - 1], player.hw, CONFIG.edges.margin)
              .frontierRight)) armGate(c, true);
    }
    // T-102 (held gate only): the frozen view decides which deck/rooted
    // bodies can hold it. Re-checked every gate frame because a resize
    // changes the strip. Rolling encounters stage every body inside the live
    // view instead, so nothing needs retiring.
    if (c && c.state === 'gate') retireUnseenGateRows(c);
    if (c && GATES_ROLLING)
      updateRollingEncounter(c, player.x, dt > 0 ? (scrollX - scrollBefore) / dt : 0);
  }
}
