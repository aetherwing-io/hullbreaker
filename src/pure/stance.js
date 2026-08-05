/* ============================= STANCE ============================= */
/* The crouch decision, isolated so the sim keeps one branch and the
   harness can assert the rule. Pure: no three.js, no DOM.

   Why a crouch exists at all: the standing firing line (CONFIG.player
   muzzleY 1.05) passes OVER a houndframe's hit circle, so a player who is
   safely lined up on the same deck cannot reach it with 8-way aim, and the
   8-way down-diagonal buries itself in the deck within a tile. Crouching
   drops the line onto the target.

   Why it is planted: momentum is the game's first pillar. A crouch that let
   you keep running would be strictly better than standing and would quietly
   become the default stance; one that costs all horizontal speed is a trade
   the player makes on purpose, in a safe pocket of time, and it never
   becomes an answer to a charge — the answer to a charge stays a movement
   verb, which tools/pathcheck.mjs asserts by showing the crouched profile
   still sits inside the charge envelope.                                */

export function crouchStance(state, cfg) {
  // Jump always wins: a buffered jump leaves from a crouch with no stand-up
  // delay, so ducking never traps the player in front of a committed charge.
  const crouched = !!(state.enabled && state.grounded && state.down &&
    !state.jumpBuffered && state.traversalState === 'free');
  return crouched
    ? { crouched: true, planted: true, height: cfg.height, muzzleY: cfg.muzzleY }
    : { crouched: false, planted: false, height: state.standHeight, muzzleY: state.standMuzzleY };
}
