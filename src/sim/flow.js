/* ============================== FLOW ============================== */
/* MOMENTUM SPINE — the runtime half of ?flow=1 (slice only, default off).
   Inert without the flag: every entry point returns its identity value, so a
   flags-off run is byte-identical (asserted by trace fingerprints per pace).

   What it does, in the order the player feels it:
     1. a CONTACT launch (ledge / wall / hook) adds a chain link and refunds
        the air jump — the chain is the reward for not touching the ground;
     2. the link amplifies that launch's FORWARD speed, composed with whatever
        the active pace already does (surge's own chain) and hard-capped;
     3. while the chain lives, the horizontal drive's target speed is raised by
        the same factor, which is the part surge was missing — without it the
        controller pulls a launch back down to runSpeed inside ~30 ms;
     4. ground contact sheds it quickly but not instantly (a bounce keeps it).

   Air jumps deliberately neither build nor break a chain: mashing jump must
   pay nothing (the same anti-degenerate rule A.3 applies to scoring). */

import { CONFIG } from '../config.js';
import { ACTIVE_SLICE, FLOW_ENABLED } from '../mode.js';
import {
  flowAddLink, flowFreshState, flowLaunchMultFor, flowMult, flowSpeedMult, flowStepState,
} from '../pure/flow.js';
import { gameMs } from './time.js';

const F = FLOW_ENABLED && ACTIVE_SLICE ? ACTIVE_SLICE.flow : null;
const AIR_JUMPS = ACTIVE_SLICE && ACTIVE_SLICE.movement.airJumps !== undefined
  ? ACTIVE_SLICE.movement.airJumps
  : CONFIG.player.airJumps;

let st = flowFreshState();
const stats = { links: 0, peakLinks: 0, breaks: 0 };

export function flowActive() { return !!F; }
export function flowLinks() { return F ? st.links : 0; }

/* The launch amplification. Returns `paceMult` untouched when the flag is off,
   so the call site in sim/player.js is a no-op multiply in every shipped mode.
   `baseVx` is the launch's own unamplified speed: flow's ceiling is enforced on
   the PRODUCT, because a launch that preserves its entry speed compounds. */
export function flowLaunch(player, kind, paceMult, baseVx) {
  if (!F) return paceMult;
  if (F.linkVerbs.indexOf(kind) < 0) return paceMult;
  st = flowAddLink(st, gameMs, F);
  stats.links++;
  if (st.links > stats.peakLinks) stats.peakLinks = st.links;
  if (F.refundAirJump) player.airJumpsLeft = AIR_JUMPS;
  return flowLaunchMultFor(paceMult, st.links, F, baseVx);
}

// The sustained part: the drive's target speed while a chain is alive.
export function flowSpeedNow() {
  return F ? flowSpeedMult(st.links, F) : 1;
}

// One frame of window/ground decay. Called from sim/player.js after the
// grounded state for this frame is known.
export function flowStep(dt, grounded) {
  if (!F) return;
  const had = st.links;
  st = flowStepState(st, { dtMs: dt * 1000, grounded, now: gameMs }, F);
  if (had > 0 && st.links === 0) stats.breaks++;
}

// A hit or a setback ends the chain outright: momentum is earned, not kept.
export function flowBreak() {
  if (!F) return;
  if (st.links > 0) stats.breaks++;
  st = flowFreshState();
}

export function flowSnapshot() {
  return {
    enabled: !!F,
    links: F ? st.links : 0,
    max: F ? F.max : 0,
    mult: F ? flowMult(st.links, F) : 1,
    speedMult: flowSpeedNow(),
    peakLinks: stats.peakLinks,
    totalLinks: stats.links,
    breaks: stats.breaks,
    groundedMs: Math.round(st.groundedMs),
  };
}

export function resetFlow() {
  st = flowFreshState();
  stats.links = 0; stats.peakLinks = 0; stats.breaks = 0;
}
