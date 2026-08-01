# Wave gate 2 vs. the bot: a HARNESS limit, with a wave-load question left for the operator

T-018. Prepared by the `gameplay-engineer` lane against `task/T-009`'s tree
(the six-face lattice, pinned and served locally) and against `main`, using
`tools/playtest/run.mjs --deterministic`, real Chrome, `testapi` fidelity.

**Verdict: (a), a harness limit — and it is not close.** The reflex-rule
policy grammar could not express the two things a player does constantly in
this game: *aim off the horizontal*, and *see where the floor ends*. Both
gaps are closed in this task (`tools/playtest/lib/threat.mjs`, the
`terrain.*` probe in `lib/sampler.mjs`, documented in the playtest README,
asserted in `tools/pathcheck.mjs`). No game file, wave gate, or movement
constant was touched.

A residual **feel** question about gate 2's *load* is real but separate, and
is left to the operator with numbers, not resolved here (bottom of this file).

## 1. What the aimless bot could and could not do

The evidence is per-tick, from the run traces (`sample.hostiles` rows, which
carry every hostile's `x`, `y`, `state`, `materialized`). For each sample the
analysis reconstructs the keys the harness actually held, resolves the aim
vector through the game's own rule (`computeAim`, `src/sim/player.js`: aim is
8-way, taken from the held direction pair), and asks two questions: was any
materialized hostile within one hit radius of the ray the gun was pointing
along, and would any of the eight rays available to a player have had one.

`six-face-full-run.json` (T-009's script, unmodified), on T-009's tree,
150 s cap, `--deterministic`:

| | gate 1 | gate 2 |
| --- | --- | --- |
| ticks with a hostile within 14 tiles | 85.6% | 76.0% |
| ticks where the gun pointed at one | **8.8%** | **12.0%** |
| ticks where *some* 8-way direction would have | 26.3% | 36.0% |
| …of those, ones where **level was not** that direction | 14.4% | 12.0% |

The gun pointed at something for one tick in eleven. That is not a difficulty
measurement; it is a measurement of a bot that fires exclusively along the
horizontal because its policy language had no way to say "there is something
above me".

The arithmetic behind it (now asserted in `tools/pathcheck.mjs` so a retune
trips it): wave gate *k* spawns `3 + k` bodies across the lanes in
`CONFIG.waves.comp`. Wave 2's five slots are lanes **2.6 / 4.6 / 2.6 / 4.6 /
7.2** tiles above the deck. A level shot leaves the muzzle at 1.05; the
highest a *level* shot can ever go is a jump apex above that —
`jumpVel²/2·gravity = 2.72`, so 3.77. Three of wave 2's five slots sit above
that line by more than a hit radius. **Without vertical aim, the bot could
only damage them while they were diving into its face** — i.e. it could only
shoot back at something that was already attacking it.

## 2. It also could not see the floor

Every run of `six-face-full-run.json` on either tree loses its **first life at
3.0 s, at x = 31.649**, in the deterministic same place: a 3-tile hole at
columns 29–31 that the "hop on every landing" rule arcs straight into. The
harness's own summary reports it (`3 spent (at 3.0s x 31.649→2.516, …)`), and
the trace shows `y` falling to −5.34 with full hp and no hostile within
14 tiles. It is a fall, not a fight.

The grammar had `pinned` (a wall you are jammed against) and nothing for a
hole you are about to run into, so the only way to jump a gap was a literal
timestamp — the exact failure mode closed-loop policy mode exists to replace.
**One of the bot's three lives was spent before the first gate, on a jump a
player makes without thinking.**

## 3. What changed (harness only)

- `tools/playtest/lib/threat.mjs` — a per-tick projection of the hostile rows
  the sampler already polls into scalar fields the existing `field OP value`
  grammar can compare: distance/offset/**angle** to the nearest hostile, the
  same for the nearest hostile *above the firing line*, per-ray occupancy
  counts for the level / 45° / straight-up rays, and the dive mark. Plus three
  predicates (`targetLevel`, `targetDiag`, `targetVert`).
- `lib/sampler.mjs` — a 12-tile terrain probe (`terrain.gapDist`, `gapWidth`,
  `farY`, `groundY`) read from `window.HB.levelData.groundH`, the same ground
  array the player's own collision reads; and `facing` as a window.HB
  enrichment.
- `lib/policy.mjs` — resolves the `threat.` namespace, validates its field
  names at compile time (a typo throws at load instead of reading false for
  two minutes), and derives the view once per tick before any rule runs.
- Still `&&` only. No `||`, no parens, no arithmetic, no `eval`, no lookahead,
  no memory between ticks — asserted behaviorally in pathcheck.

The extension is documented in `tools/playtest/README.md` ("Relative
geometry: `threat.*` and `terrain.*`"), including the honesty notes: the
corridors are straight lines from the standing muzzle at the current tick (not
a hit prediction), there is no facet-bend awareness, and the two CONFIG
numbers the module mirrors are guarded against drift.

## 4. Same script shape, with aim and a floor probe

`scripts/six-face-aimed-run.json` is `six-face-full-run.json`'s policy with the
new clauses added — same build, same flags, same viewport, nothing about the
game changed. Progression across the tuning runs, all on the T-009 tree,
`--deterministic`:

| policy | first life lost | kills | how far |
| --- | --- | --- | --- |
| T-009's, aimless (baseline) | 3.0 s, x 31.6 (the hole) | 14 | died in gate 2, maxX 154.3 |
| + angle-quantized aim | 3.0 s, x 31.6 (the hole) | 17 | died in gate 2 |
| + terrain probe | 24.8 s, x 79.5 (gate 1 fight) | 15 | died in gate 2 |
| + don't hop into a hostile | **44.1 s, x 151.7 (gate 2 fight)** | 17 | **cleared gates 1 and 2**, died on face 3 |

Gate 1 goes from "costs a life or two" to "cleared without one". Gate 2 goes
from "9 gating bodies, 3.8 s survived, never cleared" to cleared. The
per-tick aim quality moves with it: gate-2 ticks with the gun pointed at a
hostile go **12.0% → 27.7%**, and gate-1 ticks **8.8% → 20.7–29.3%**.

The third row of that table is worth reading twice: the bot's damage log
showed **every single hp loss happening while airborne**, several of them
flying into a *cruising* wasp or the capsule carrier. The reflex hop was
launching RIG into the lane the swarm occupies. Gating the hop on
"nothing within 3.5 tiles" is a one-clause change that only became sayable
with relative geometry.

## 5. Why this is (a) and not (b)

- The deaths do **not** cluster on one unanswerable pattern. Attributed
  per-tick, the losses split between dive contact and *cruise* contact, with a
  carrier collision in the mix — scattered attrition of a bot that flies into
  things, not a wall of simultaneous dives from lanes one aim direction cannot
  cover.
- At least one hostile is in the `dive` state on only **13–17%** of PLAYING
  ticks. The gate is not a continuous dive storm.
- The gate has no timer. The scroll is frozen while it is open
  (`cornerBusy()`), so time spent aiming costs nothing but exposure, and the
  wave cannot advance past the pivot.
- The kill math is generous for anyone who can aim: a wasp is 4 hp, the rifle
  is 1 damage every 130 ms, so a five-slot wave is 2.6 s of on-target fire
  against a wave that takes 1.1 s to materialize.
- And the decisive one: **the same build, same waves, played through the same
  harness with an aim clause added, clears gates 1 and 2.** Nothing about the
  game moved.

## 6. Left for the operator (feel, not fixable here)

Three numbers this investigation surfaced that are *authored*, legible, and
outside a builder's authority to change. They are not bugs and this report is
not asking for a retune — they are the questions a fun oracle should answer.

1. **Gate 2 was fought as 9 gating bodies, not 5.** The HUD said `WAVE 2/6 —
   9 HOSTILES`. Wave 2 authors five; the other four were ambient spawns that
   drifted into the arena before the gate armed (`cornerClearBefore: 10`).
   Some of them spawn *past the corner pivot* on the not-yet-built face and
   take 5–8 s to cruise back into reach while the gate holds shut.
2. **The wasp is the only hostile with no telegraph.** Hound, polyp and mortar
   all have a `tell` state with a pathcheck-asserted fairness window; the wasp
   goes `cruise → dive` on the same frame, at 10 tiles/s, from up to 9 tiles
   away while gated (`gateDiveRange: 9.0`, vs 6.5 ambient) and every 1.1 s
   (`gateDiveCooldownMs`, vs 1.8 s ambient).
3. **Gate escalation is linear in bodies** (`3 + k`: 4, 5, 6, 7, 8, 9) with the
   same lane mix widening upward, while the player's answer set does not grow
   — same 3 hp, same rifle unless a capsule happens to drop.

Suggested checkpoint URL (default six-face run, no flags):
`http://127.0.0.1:8741/index.html`

Questions for the operator, in the order a run answers them:

1. At gate 1, does the wave read as a *fight you win by moving and aiming*, or
   as a damage race you win by standing still and holding fire?
2. At gate 2, is being handed 9 bodies (5 authored + 4 ambient stragglers,
   some arriving from past the corner) the intended pressure, or should the
   corner-clear zone keep ambient spawns out of a gate arena entirely?
3. Does a wasp dive read as *fair* with no telegraph at all, at gate range and
   cadence — or does it want the same kind of `tell` the rest of the roster has?
4. Should the escalation across gates 3–6 add bodies, add *lanes*, or add
   variety of kind? (Wave 6 is nine bodies of one kind.)
5. Is "the gate has no timer" the intended safety valve — i.e. is a patient
   player supposed to be able to out-wait a wave?

## 7. Reproduce

```sh
# serve the tree you want to measure (a pinned worktree, so a multi-minute
# batch describes exactly one build)
cd <worktree> && python3 -m http.server 8751 &

cd tools/playtest
node run.mjs scripts/six-face-aimed-run.json --base-url http://127.0.0.1:8751 \
  --deterministic --max-runtime-ms 245000 --out /tmp/aimed

# the aimless baseline it is measured against
node run.mjs scripts/six-face-full-run.json --base-url http://127.0.0.1:8751 \
  --deterministic --max-runtime-ms 150000 --out /tmp/aimless
```

`node tools/pathcheck.mjs` covers the new harness logic (mirrored CONFIG
constants, grammar rejections, corridor geometry on synthetic samples, and the
wave-2 lane arithmetic this finding rests on).
