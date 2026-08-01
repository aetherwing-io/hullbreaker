REQUEST_CHANGES

Gate: reviewer, task T-009, I-019 fix pass. Worktree
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009 (branch
task/T-009, HEAD d0c3ae1). `node tools/pathcheck.mjs` re-run here:
**1545 passed, 0 failed** (main: 1480). No assertion was deleted or loosened
to get there — the only removals in `main...HEAD` are the two deliberately
moved regression pins (generator shape 49 -> 62 platforms, fingerprint
`cc6afd7c` -> `10606a27`) and the `?g1=1`/`?zip=1` inversion of the
render-mode trace compare, each with its reasoning written in place. Layer
purity, determinism and the frozen constants are clean: `src/pure/lattice.js`
imports only `./path.js`, varies by a seed-free `hash()` and consumes no rng;
`src/config.js` is not in the diff; `?hook=1` is untouched; no
`Math.random`/`Date.now`/`performance.now` anywhere in `src/pure` or
`src/sim`; boot pays one ~10 ms level build now that the spawner passes
`levelData` (my MINOR from the previous pass — fixed). The static-anatomy
default plus the `?zip=1` escape hatch match `decisions.md` entry 3 and its
addendum, and HANDOFF/README/DESIGN are honest that the reveal itself is
still unjudged.

The one defect this cycle exists to close is only partly closed, and the
disclosure of what is left understates it.

## Findings

src/pure/lattice.js:164 — **accept box 1 is not met: a pocket reward is still
collectable from the deck line, by a double jump, on at least 2 of 6 faces.**
I drove the shipped sim with the exact policy `tools/pathcheck.mjs`'s own
T-009 full-run child uses, changed in one respect: it also spends the air jump
while airborne (`bufferJumpUntil` when `!grounded && airJumpsLeft > 0`).
Result: **2 of 6 rewards collected** — face 1 at x=46.36 (t=4.8 s, feet 3.45
over the deck, i.e. past the grounded apex) and face 2 at x=108.21 (t=20.6 s)
— with no climb, no shelf and no retreat, and the run still reached the outro
scroll end. That is I-019's own failure mode ("the free route pays the wager")
one input later, not an exotic case: jump-spam is ordinary play in this genre.
The new assertions cannot see it because the sweep is scoped to `PJ.jumpVel`
launches only; `tools/pathcheck.mjs:7069-7083` says so plainly, which is to
the builder's credit, but a stated gap in a gate is still a gap in the gate.

docs/DESIGN.md:444-448 and src/pure/lattice.js:159-163 — **the residue is
quantified against the wrong body point, so it reads as marginal when it is
not.** Both passages say "the air jump reaches 5.07 ... so a deliberate double
jump at the lip can still *touch* the capsule mid-flight", while the grounded
case two lines earlier correctly uses **head** reach (apex 2.72 + height 1.70
= 4.42). 5.07 is the double jump's **feet** apex; the head reaches 6.77 over
the deck. Against a capsule bob floor of 5.95 over the deck, the capsule sits
**0.82 tiles inside** the player's body box — not touched at the edge of a
0.95 sphere, passed through. The same passages say "a jump-spamming bot takes
face 1's at x=45.3" (singular); the measurement above takes two. These numbers
are the entire basis of the operator call being requested, so they have to be
right.

src/pure/lattice.js:161-163 and docs/DESIGN.md:447-450 — **"not retunable in
the lane" is overstated; a lever inside this module's own constants closes
it.** The `rewardRise` half is correct and I recomputed it: clearing the double
jump needs `rewardRise > 3.52` while the standing-pickup ceiling is 2.50 at the
worst bob phase, so no value satisfies both. But the ladder being blamed is not
frozen: `mid <= landing + apex` is a frozen-constant relation, `shelf = mid +
tierRise` is not — `LATTICE.tierRise` is this file's own number (3) and
`CONFIG.gen.maxReach` is 5. A pocket shelf tier of roughly 4.1-4.6 puts the
capsule above the deck-line double jump (needs shelf > ~5.37 over the deck)
while staying inside a double jump *from the mid lane* (feet apex 5.07) and
inside the generator's own reachability ceiling — it makes the climb harder
without touching the mandatory crossing at all. Whether that trade is wanted is
a feel call and belongs to the operator; foreclosing it in the doc as
arithmetically impossible is not accurate.

tools/playtest/scripts/six-face-full-run.json:3 — **the description repeats a
measurement the integrator has formally retracted.** It states "maxX 154.3,
scroll 140 of 415", "the three lives go at x 31.6, x 93.0 and x 148.0", and
"the lattice tree gets ~1.7x further". `SPRINT.md`'s T-009 CORRECTION (filed as
I-020) records three runs per side — branch 89.25 / 89.25 / 110.65, main
89.25 x3 — and says the ~1.7x claim "does not hold and must not be repeated".
That correction was on main at 13:12 and reached this branch in the 13:47
merge, so the branch now ships the retracted claim next to the record
retracting it. A harness script's own description is exactly where the next
gate will read it.

SPRINT.md, operator checkpoint queue, "G1 limb-turn" entry (MINOR) — the A/B it
names is now a no-op: it asks for "default vs `?g1=1`", and after this task both
select the limb reveal (`src/mode.js:73-74`). The live pair is `default vs
?zip=1`, which is what `artifacts/t009-lattice/README.md` actually captured
(`06-ab-gate1-default.png` / `07-ab-gate1-zip.png`). SPRINT is integrator-owned,
so flagging rather than assigning.

## What is good here and should survive the fix

The I-019 work is not thin. The mandatory-crossing case is closed three
independent ways — a swept arc over every launch column, speed, hold length and
flight instant; an analytic envelope no launch choice can beat; and a
behavioural run of the shipped sim with the shipped pickup code that ends with
all six capsules still hanging — plus drift guards that re-read
`src/sim/capsules.js`, `src/sim/player.js` and `src/main.js` so the arithmetic
cannot silently stop describing the code. `climbSeconds`/`totalSeconds` are
added without disturbing `retreat.seconds`, so the pre-existing crush-clock
assertion is extended rather than re-based. The spawner now builds the table
from the run's own level, with both a source guard and an empty-pockets
regression case. Keep all of it.

## Smallest path back to APPROVE

1. Correct both passages to head reach (6.77) and the measured face count, and
   say plainly that the capsule sits inside the body box, not at the margin.
2. Either raise the pocket shelf tier (extending the assertion to the air jump
   and moving the fingerprint pin deliberately, as this task has already done
   twice), or leave the geometry and post a checkpoint-queue entry carrying the
   corrected numbers with the `tierRise` option named as available — so the
   operator is choosing, not being told the choice does not exist.
3. Drop the retracted 154.3 / 140 / ~1.7x figures from the full-run script
   description.

Not verified by this gate (playtester's): mid-route + transform-slice runs,
`?selftest=1`, console cleanliness, and that default and `?zip=1` both boot.
