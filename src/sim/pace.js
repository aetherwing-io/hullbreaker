/* ============================== PACE ============================== */
/* The pursuing damage edge's speed, one frame at a time. The shipped run
   and the `base` slice pace hold a constant; the CP1 variants make the
   edge a behavior (hunt rubber-bands off the player's margin, surge ramps
   with elapsed pass time). The decision math itself is pure
   (src/pure/traversal.js) so the harness can assert it; this module only
   owns the current value and who is allowed to write it (sim/scroll.js).

   T-022 adds the six-face run's own model beside them: MOMENTUM, the
   earned escalation of decisions.md entry 11. Same ownership contract —
   sim/scroll.js is the only caller, the math is pure
   (src/pure/momentum.js), and this module owns the live drive. It is
   deliberately NOT a fourth fixture pace: those escalate on elapsed pass
   time (`ramp`/surge, a scripted ramp) or rubber-band the edge off raw
   margin (`hunt`) inside one authored slice, while momentum reads how the
   run is being PLAYED and answers with pace the player earned. Off unless
   ?momentum=1. */

import { CONFIG } from '../config.js';
import { ACTIVE_SLICE, MOMENTUM_ENABLED } from '../mode.js';
import { traversalPaceStep } from '../pure/traversal.js';
import {
  momentumBankSample, momentumCombatStep, momentumOnDamage, momentumScreenFrac,
  momentumSpeed, momentumStep, momentumTarget, momentumTier,
} from '../pure/momentum.js';

const PURSUIT = ACTIVE_SLICE ? ACTIVE_SLICE.pursuit : null;
const M = CONFIG.momentum;

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

/* ---------------------------- momentum ----------------------------- *
 * Live escalation state for the six-face run. Every field is written from
 * one place (updateMomentum, called by sim/scroll.js before anything reads
 * the frame's scroll speed) and every input is simulation state — RIG's
 * position between the two screen edges, the kill tally, hp/lives, and the
 * sim clock. No wall clock, no rng: the same inputs replay to the same
 * escalation, which is what keeps --deterministic bot runs reproducible.  */

let drive = 0;                  // 0..1, the earned escalation
let bank = 0;                   // 0..1, last MOVING read of the daylight bank
let combat = 0;                 // 0..1, decaying kill streak
let peakDrive = 0;              // run-high, for the operator packet
let mercyUntil = 0;             // gameMs: drive may fall but not rise
let prevKills = 0, prevHp = 0, prevLives = 0, primed = false;

export function momentumEnabled() { return MOMENTUM_ENABLED; }
export function momentumDrive() { return drive; }
export function momentumPeakDrive() { return peakDrive; }
// The pursuing edge's speed this frame. Drive 0 returns CONFIG.scrollSpeed
// exactly — the floor is the shipped run, not a slower version of it.
export function momentumScrollSpeed() { return momentumSpeed(drive, CONFIG.scrollSpeed, M); }
export function momentumSnapshot() {
  const s = momentumScrollSpeed();
  return {
    enabled: MOMENTUM_ENABLED,
    drive, bank, combat, peakDrive,
    tier: momentumTier(drive, M),
    speed: s,
    mult: s / CONFIG.scrollSpeed,
  };
}

/* ctx: { playerLeft, edgeLeft, edgeRight, kills, hp, lives, nowMs, held }
   `primed` seeds the kill/health baselines on the first frame after a reset
   so a fresh run never reads its own initialization as a hit — the same
   contract stepHitStop uses in sim/time.js.                              */
export function updateMomentum(dt, ctx) {
  if (!MOMENTUM_ENABLED) return;
  if (!primed) {
    prevKills = ctx.kills; prevHp = ctx.hp; prevLives = ctx.lives;
    primed = true;
  }
  const killsThisFrame = ctx.kills > prevKills ? ctx.kills - prevKills : 0;
  const hurt = ctx.hp < prevHp;
  const died = ctx.lives < prevLives;
  prevKills = ctx.kills; prevHp = ctx.hp; prevLives = ctx.lives;
  // A setback sheds what it cost: a life clears the escalation outright, a
  // heart caps it. Either way the mercy window forbids re-earning for a beat,
  // so the run answers a mistake by easing off. This, plus momentumBank's
  // deadband (a player being carried banks nothing), is the whole
  // anti-death-spiral argument, and both halves are asserted.
  if (died) { drive = 0; bank = 0; combat = 0; mercyUntil = ctx.nowMs + M.hitMercyMs; }
  else if (hurt) {
    drive = momentumOnDamage(drive, M);
    combat = 0;
    mercyUntil = ctx.nowMs + M.hitMercyMs;
  }
  combat = momentumCombatStep(combat, killsThisFrame, dt, M);
  bank = momentumBankSample(
    bank, momentumScreenFrac(ctx.playerLeft, ctx.edgeLeft, ctx.edgeRight), ctx.held, M);
  drive = momentumStep(drive, momentumTarget(bank, combat, M), dt, M, {
    mercy: ctx.nowMs < mercyUntil,
  });
  if (drive > peakDrive) peakDrive = drive;
  // `peak` is the telemetry channel's pursuitPeak — it must mean "the fastest
  // this run's edge ever got" in every mode, or a momentum trace would report
  // a peak below its own live speed.
  const now = momentumScrollSpeed();
  if (now > peak) peak = now;
}

// run reset (resetGame in src/main.js): the edge rewinds to its opening speed
export function resetPace() {
  speed = PURSUIT ? PURSUIT.cruiseSpeed : CONFIG.scrollSpeed;
  peak = speed;
  drive = 0; bank = 0; combat = 0; peakDrive = 0; mercyUntil = 0;
  prevKills = 0; prevHp = 0; prevLives = 0; primed = false;
}
