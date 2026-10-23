/* ============================ SCROLL ============================== */
/* Forced-scroll advance: the corner ritual's frozen-then-eased resume,
   the wave-gate clamp, the fixture's camera-follow floor, the six-face
   follow-lead (T-201/T-202), and the gate arming that used to sit inside
   updateCamera. The camera *pose* half of that function now lives in
   src/render/camera.js and derives its yaw from the same corner events, so
   the sim owns scroll and only scroll. */

import { CONFIG } from '../config.js';
import { BEND_S, HALT_S } from '../pure/path.js';
import {
  cornerApproachScrollTarget, cornerScrollVel, cornerEventTotalMs, gatePreludeReady,
} from '../pure/waves.js';
import { followCornerFloor, followLeadTiles, followScrollFloor } from '../pure/momentum.js';
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
  retireUnseenGateRows, updatePursuers, updateRollingEncounter,
} from './wavegate.js';
import { updateTransformScroll } from './transform.js';

/* FOLLOW-LEAD (T-202 block, docs/proposals/2026-10-race-to-the-top.md §4.2;
   ON by default, `?follow=0` restores the plain pursuit plane). The lowest
   scroll this frame may hold: RIG's front stays `lead` tiles inside the right
   edge, lead = clamp(0.3 x visible width, 6, 24) read from the LIVE edge
   calibration (sim/edges.js — the phone camera lane changes it), and on the
   approach to an idle corner the plane also keeps pace with the corner blend
   (src/pure/momentum.js followCornerFloor) so a racer reaches the joint with
   the scroll at the halt. Never above the run's scroll end; -Infinity (no
   floor) when the follow-lead is off. */
function followFloorNow(c) {
  if (!FOLLOW_ENABLED) return -Infinity;
  const front = player.x + player.hw;
  const lead = followLeadTiles(EDGE_R - EDGE_L, CONFIG.follow);
  let floor = followScrollFloor(front, EDGE_R, lead);
  if (c && c.state === 'idle') {
    const jointFront = c.s + 1 - CONFIG.edges.margin;    // cornerJointRule('idle').frontierRight
    floor = Math.max(floor, followCornerFloor(HALT_S[c.k - 1], jointFront, front, CONFIG.follow));
  }
  return Math.min(floor, activeScrollEnd());
}

/* The daylight RIG has when its front stands on the follow line this frame —
   the lead line, or (approaching an idle corner) the corner blend's line,
   whichever binds first. The momentum bank saturates there (src/pure/
   momentum.js momentumLeadBank): riding the follow line is the follow
   frame's "riding the right clamp", blend included, so a racer's escalation
   is not shed in the last tiles before every joint. Tiles from the damage
   plane, read from the live edges. */
function followLineDaylight(c) {
  const lead = followLeadTiles(EDGE_R - EDGE_L, CONFIG.follow);
  let daylight = (EDGE_R - EDGE_L) - lead - 2 * player.hw;
  if (c && c.state === 'idle') {
    const jointFront = c.s + 1 - CONFIG.edges.margin;
    const frontOnBlend = jointFront - (HALT_S[c.k - 1] - scrollX) / (1 + CONFIG.follow.cornerBlendRate);
    daylight = Math.min(daylight, frontOnBlend - 2 * player.hw - sLeftEdge());
  }
  return daylight;
}

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
      leadDaylight: FOLLOW_ENABLED ? followLineDaylight(c) : undefined,
    });
  }
  const followFloor = followFloorNow(c);
  if (c && c.state === 'turning') {
    const t = gameMs - c.tStart;
    // The ritual owns the scroll. RIG is pinned on the hinge, so the follow
    // floor sits at or below the scroll already reached and never moves it —
    // except under ?hinge=flow, where RIG may run on after the camera
    // hand-off and the frame keeps its lead instead of snapping afterwards.
    setScrollX(Math.min(Math.max(scrollX + cornerScrollVel(t, CONFIG) * dt, followFloor),
      activeScrollEnd()));
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
    // T-102: the plane only ever ratchets forward. A cleared-gate approach
    // dolly reached for a narrow frame must not rewind the world when a resize
    // widens it mid-approach (the new target can sit below the scroll already
    // reached: 0.32 tiles at 260x1000, more with any closer camera).
    let next = Math.max(scrollX, Math.min(nextScroll, target));
    // FOLLOW-LEAD: a floor applied after the halt clamp. RIG cannot pass the
    // corner frontier before the turn, and the corner blend tops out at the
    // halt, so on a wide view the floor never carries the camera past the
    // halt; on a narrow one (portrait) the lead itself passes it and the halt
    // arms first, exactly like the approach dolly above. A held legacy gate
    // keeps its scroll.
    if (!c || c.state !== 'gate') next = Math.max(next, followFloor);
    setScrollX(next);
    if (c && !GATES_ROLLING && gatePreludeReady(c.state, c.primed, scrollX, HALT_S[c.k - 1]))
      primeGateWave(c);
    if (c && c.state === 'idle' && scrollX >= HALT_S[c.k - 1] - 1e-6) armGate(c);
    // T-102 (held gate only): the frozen view decides which deck/rooted
    // bodies can hold it. Re-checked every gate frame because a resize
    // changes the strip. Rolling encounters stage every body inside the live
    // view instead and hold nothing, so they never reach this state.
    if (c && c.state === 'gate') retireUnseenGateRows(c);
  }
  if (GATES_ROLLING) {
    const planeTilesPerSec = dt > 0 ? (scrollX - scrollBefore) / dt : 0;
    if (c) updateRollingEncounter(c, player.x + player.hw, planeTilesPerSec);
    updatePursuers(player.x, planeTilesPerSec);
  }
}
