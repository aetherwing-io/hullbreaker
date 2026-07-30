/* ============================== HOOK ============================== */
/* SNAP HOOK / TETHER — the runtime state machine (?hook=1, slice only).
   Inert without the flag: this module's update is a single early return, and
   nothing else in the sim references it.

   Three beats, deliberately shaped like the ledge catch the player already
   knows, because DESIGN's rule is "every grab wants to become another launch":

     GRAB  an assisted acquisition — the nearest authored anchor inside its own
           approach arc, with a clear tether line. No aiming, no free-aim
           interrupt; the press IS the input.
     ZIP   a taut pull along the line at zipSpeed (about 2x run speed),
           gravity off, integrated in substeps so it cannot cross a wall the
           endpoint-only player collision would miss.
     HANG  a ~110 ms dangle at the anchor (boards 09/10/12), then
     WHIP  a forward launch with the air jump refunded, so the next thing you
           can do is another grab.

   Ownership: while the tether is taut this module writes the player row's
   position and zeroes its velocity, and src/sim/player.js skips its drive,
   gravity and integration for that frame (exactly how a ledge hang works).
   Every exit path assigns bounded velocities, so the normal integrator never
   resumes holding a zip-speed vector. */

import { CONFIG } from '../config.js';
import { ACTIVE_SLICE, HOOK_ENABLED, HOOK_INPUT } from '../mode.js';
import {
  hookAcquire, hookHoldPoint, hookWhipDir, hookWhipVelocity, hookZipMarch,
} from '../pure/hook.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { sLeftEdge } from './edges.js';
import {
  keys, hookBufferedUntil, jumpBufferedUntil, clearHookBuffer, clearJumpBuffer,
} from './input.js';
import { isSolid } from './level.js';
import { scoreContact, scoreLaunch } from './score.js';
import { flowLaunch } from './flow.js';

const H = HOOK_ENABLED && ACTIVE_SLICE ? ACTIVE_SLICE.hook : null;
const ANCHORS = ACTIVE_SLICE && ACTIVE_SLICE.hookAnchors ? ACTIVE_SLICE.hookAnchors : [];
const CONTROL_MS = ACTIVE_SLICE ? ACTIVE_SLICE.movement.traversalLaunchControlMs : 100;
const EDGE_GUARD = CONFIG.player.traversalEdgeGuard;

const st = {
  phase: 'idle',                 // 'idle' | 'zip' | 'hang'
  anchor: null,
  targetX: 0, targetY: 0,
  fromX: 0, entryVx: 0, dir: 1,
  startedAt: 0, hangUntil: 0,
  cooldownUntil: 0,
  lockedId: null, lockedUntil: 0,
  acquirable: null,              // anchor id the player could grab right now
  grabs: 0, whips: 0, blocked: 0, releases: 0, autoGrabs: 0,
};

export function hookEnabled() { return !!H; }
export function hookAnchors() { return ANCHORS; }
export function hookOwnsMovement() { return st.phase === 'zip' || st.phase === 'hang'; }
export function hookPhase() { return st.phase; }
export function hookActiveAnchor() { return st.anchor; }

// A.5-style read surface: presentation and telemetry only, never a decision.
export function hookSnapshot() {
  return {
    enabled: !!H,
    input: HOOK_INPUT,
    phase: st.phase,
    anchorId: st.anchor ? st.anchor.id : null,
    acquirable: st.acquirable,
    grabs: st.grabs, whips: st.whips, blocked: st.blocked,
    releases: st.releases, autoGrabs: st.autoGrabs,
    cooldownMs: Math.max(0, Math.round(st.cooldownUntil - gameMs)),
  };
}

function bodyFits(player, x, y) {
  const x0 = Math.floor(x - player.hw + 0.02), x1 = Math.floor(x + player.hw - 0.02);
  const y0 = Math.floor(y + 0.02), y1 = Math.floor(y + player.h - 0.02);
  for (let i = x0; i <= x1; i++)
    for (let j = y0; j <= y1; j++)
      if (isSolid(i, j)) return false;
  return true;
}

function acquireState(player) {
  return {
    x: player.x, y: player.y, facing: player.facing,
    now: gameMs, lockedId: st.lockedId, lockedUntil: st.lockedUntil,
  };
}

function grab(player, anchor, api) {
  const hold = hookHoldPoint(anchor, H);
  st.phase = 'zip';
  st.anchor = anchor;
  st.targetX = hold.x; st.targetY = hold.y;
  st.fromX = player.x;
  st.entryVx = player.vx;
  st.dir = hookWhipDir(anchor, player.x, player.facing);
  st.startedAt = gameMs;
  st.grabs++;
  api.clearTraversal(gameMs);          // a grab supersedes a hang or a slide
  player.vx = 0; player.vy = 0;
  player.grounded = false; player.onOneWay = null;
  player.coyoteUntil = 0; player.jumpCutDone = true;
  clearHookBuffer();
  // the contact half of the A.5 pair: a launch that reached an anchor went
  // somewhere, so it links exactly like a launch that reached a ledge
  scoreContact(player.y, 'hook');
}

function whip(player, api, reason) {
  const base = Math.max(H.launchX, Math.abs(st.entryVx || 0));
  const mult = flowLaunch(player, 'hook', api.chainMult(), base);
  // hookWhipVelocity applies the hook's own ceiling on top, so a whip is
  // bounded whether or not the momentum spine is armed
  const v = hookWhipVelocity(H, st.dir, st.entryVx, mult);
  player.vx = v.vx; player.vy = v.vy;
  player.grounded = false; player.onOneWay = null;
  player.coyoteUntil = 0; player.jumpCutDone = true;
  player.traversalControlUntil = gameMs + CONTROL_MS;
  if (H.refundAirJump) player.airJumpsLeft = CONFIG.player.airJumps;
  st.whips++;
  if (reason === 'blocked') st.blocked++;
  release(player, 'whip');
  scoreLaunch('hook', player.x, player.y);
}

// Let go without a launch (down, or a cancel): fall, keeping a little drift.
function drop(player, reason) {
  player.vx = st.dir * Math.min(Math.abs(st.entryVx), CONFIG.player.runSpeed) * 0.5;
  player.vy = H.releaseVy;
  player.grounded = false; player.onOneWay = null;
  player.jumpCutDone = true;
  if (reason === 'down') st.releases++;
  release(player, reason);
}

function release(player, reason) {
  if (st.anchor) {
    st.lockedId = st.anchor.id;
    st.lockedUntil = gameMs + H.sameAnchorLockMs;
  }
  st.phase = 'idle';
  st.anchor = null;
  st.cooldownUntil = gameMs + H.cooldownMs;
  clearHookBuffer();
  clearJumpBuffer();                   // the press was spent on the tether
  void reason;
}

/* One frame. Returns true while the tether owns movement, which is the flag
   src/sim/player.js reads to skip its own drive/gravity/integration.
   `api` = { chainMult, clearTraversal } — the two things only player.js can
   provide, passed in so this module never imports it back (no cycle).     */
export function hookUpdate(player, dt, api) {
  if (!H) return false;

  // presentation + auto mode + the headless bot policies all read this
  const idle = st.phase === 'idle';
  const candidate = idle && gameMs >= st.cooldownUntil
    ? hookAcquire(ANCHORS, acquireState(player), H, isSolid)
    : null;
  st.acquirable = candidate ? candidate.anchor.id : null;

  if (idle) {
    const pressed = hookBufferedUntil > gameMs || keys.hook;
    // `auto`: an anchor grabs itself while airborne, the way a near-missed
    // ledge catches itself. The key still works in either mode.
    const auto = HOOK_INPUT === 'auto' && !player.grounded;
    if (candidate && (pressed || auto)) {
      if (!pressed) st.autoGrabs++;
      grab(player, candidate.anchor, api);
    } else {
      if (H && pressed && !candidate) clearHookBuffer();   // a miss is a miss
      view.hook.sync();
      return false;
    }
  }

  // The crush plane wins over a tether: being dragged into it must not park
  // the player inside the damage edge for the whole zip.
  if (player.x - player.hw < sLeftEdge() + CONFIG.edges.margin + EDGE_GUARD) {
    whip(player, api, 'edge');
    view.hook.sync();
    return false;
  }

  if (keys.down) {                     // established grammar: down releases
    drop(player, 'down');
    view.hook.sync();
    return false;
  }
  const jumped = jumpBufferedUntil > gameMs || keys.jump;

  if (st.phase === 'zip') {
    if (jumped || gameMs - st.startedAt >= H.zipMaxMs) {
      whip(player, api, jumped ? 'jump' : 'timeout');
      view.hook.sync();
      return false;
    }
    const step = hookZipMarch(
      { x: player.x, y: player.y }, { x: st.targetX, y: st.targetY },
      H.zipSpeed, dt, H.zipSubstepTiles,
      (x, y) => bodyFits(player, x, y),
    );
    player.x = step.x; player.y = step.y;
    player.vx = 0; player.vy = 0;
    player.grounded = false; player.onOneWay = null;
    if (step.blocked) {                // clipped a corner: launch, never stick
      whip(player, api, 'blocked');
      view.hook.sync();
      return false;
    }
    if (step.arrived ||
        Math.hypot(st.targetX - player.x, st.targetY - player.y) <= H.arriveRadius) {
      st.phase = 'hang';
      st.hangUntil = gameMs + H.hangMs;
    }
    view.hook.sync();
    return true;
  }

  // hang: the dangle. Always converts — expiry whips, it never drops you.
  player.x = st.targetX; player.y = st.targetY;
  player.vx = 0; player.vy = 0;
  player.grounded = false; player.onOneWay = null;
  if (jumped || gameMs >= st.hangUntil) {
    whip(player, api, jumped ? 'jump' : 'hang-expiry');
    view.hook.sync();
    return false;
  }
  view.hook.sync();
  return true;
}

// A hit, a setback, or a run reset takes RIG off the tether.
export function hookCancel(player) {
  if (!H || st.phase === 'idle') return;
  st.phase = 'idle';
  st.anchor = null;
  st.cooldownUntil = gameMs + H.cooldownMs;
  clearHookBuffer();
}

export function resetHook() {
  st.phase = 'idle';
  st.anchor = null;
  st.targetX = 0; st.targetY = 0;
  st.fromX = 0; st.entryVx = 0; st.dir = 1;
  st.startedAt = 0; st.hangUntil = 0;
  st.cooldownUntil = 0;
  st.lockedId = null; st.lockedUntil = 0;
  st.acquirable = null;
  st.grabs = 0; st.whips = 0; st.blocked = 0; st.releases = 0; st.autoGrabs = 0;
}

// render/hook.js reads the live tether ends (presentation only)
export function hookTether(player) {
  if (!H || st.phase === 'idle' || !st.anchor) return null;
  return {
    x0: player.x, y0: player.y + H.handHeight,
    x1: st.anchor.x, y1: st.anchor.y,
    phase: st.phase,
  };
}
