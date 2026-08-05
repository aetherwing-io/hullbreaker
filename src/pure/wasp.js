/* ============================== WASP =============================== */
/* Wasp drone pure logic. Cruise, bob, and recover are simple enough to stay
   inline in src/sim/hostiles.js; this module holds the two things worth
   pinning down in isolation:

     - the dive's AIM, a pure vector calc extracted so pathcheck can assert
       its geometry without stepping a live sim, and
     - the LOCK + SQUAD timing that turns an instant commit into a readable
       tell and turns a cluster of drones into a rotating threat instead of
       a simultaneous wall (T-043, "enemies feel like they are coming for
       me" pushed one notch further — see decisions.md entries 6 and 12).

   No imports outside this layer.                                        */

// The dive's target vector, unit-normalized and scaled to travel speed.
// Frozen at commit and never recomputed — the roster's "commits, does not
// re-aim" doctrine already governs the hound's charge and the polyp's beam
// (decisions.md entry 6: placement over stats); this just names the same
// calculation the sim always ran inline, so it can be asserted on its own.
export function diveVelocity(ex, ey, tx, ty, speed) {
  const dx = tx - ex, dy = ty - ey;
  const n = Math.hypot(dx, dy) || 1;
  return { vx: dx / n * speed, vy: dy / n * speed };
}

// WASP_DIVE_LOCK_MS — the aim-lock beat between a wasp COMMITTING to a dive
// and actually leaving its cruise position.
//
// Not in CONFIG.wasp: that file is fenced to a concurrent lane (T-041) for
// the length of this task. It is an ordinary roster timing constant and
// belongs there once that fence lifts (flagged in this task's report) —
// kept here, exported and documented, rather than buried as a magic number
// in src/sim/hostiles.js.
//
// Every other gating/rooted kind (hound, polyp, mortar) spends its whole
// reaction window in a visibly different WARNING pose before it commits —
// only the wasp's dive went straight from cruise to a moving hitbox with no
// wind-up at all (src/render/hostiles.js's own comment on the dive pose:
// "The sim gives it no wind-up state to telegraph — a dive commits the
// frame it starts"). This constant is the fix, and it needs no new render
// code: the sim now enters the 'dive' state — and its already-shipped hot
// acid dart pose, oriented down the frozen aim vector — BEFORE it starts
// moving, so the drawn commitment cue itself becomes the tell. A stationary,
// hot-glowing dart already pointed at you reads as "about to launch," and
// gives a beat where a shot or a step answers it instead of the dive being
// simultaneous with its own reaction window.
// 190 ms remains above buffered-jump latency at the slow 30 fps contract,
// while removing the extra "I already dodged this" pause players felt after
// the pose had clearly committed.
export const WASP_DIVE_LOCK_MS = 190;

// True once the lock beat has elapsed and the dive may actually move.
export function diveLaunched(nowMs, lockUntilMs) {
  return nowMs >= lockUntilMs;
}

// WASP_SQUAD_STAGGER_MS — the minimum gap between two DIFFERENT wasps'
// first commitments to a dive.
//
// Without it, every wasp in a cluster shares the same "is the player in my
// dive range" predicate, so the first pass under a multi-wasp wave could
// commit all of them on the same frame: a simultaneous wall with nothing
// individual to read, the "same body repeated" failure mode rather than a
// wave of hunters. This never touches a single wasp's own diveCooldownMs
// (how soon THAT drone may dive again) — it only orders distinct first
// commitments into a sequence, so a cluster reads as one drone locking on,
// being answered, and the next one pressing, rather than a synchronized
// swarm. It does not lower the roster's validated pressure (decisions.md
// entry 12: "it is the wasp that ended the attempt") — the same drones
// still all commit within about a second of first contact, just not on the
// same frame.
export const WASP_SQUAD_STAGGER_MS = 260;

// True when enough time has passed since the last squad-wide commitment for
// another wasp to lock on. `lastCommitMs` is the whole squad's shared clock,
// not a per-wasp field — that is what makes this order commitments across
// bodies instead of gating any one body's own cooldown.
export function squadReady(nowMs, lastCommitMs, staggerMs) {
  return nowMs - lastCommitMs >= staggerMs;
}
