# Adversarial playtest — traversal slice, July 2026

Prepared by the `adversarial` agent of the fleet push, against `main` at
`5e9dbc8` (the merged module split). Target: `index.html?slice=traversal`.

This report attacks the **fun and fairness** of the current build. Every claim is
either CONFIRMED by a committed input script that reproduces it, or SUSPECTED
from reading the fixture data and sim code, and labelled as such. No game code,
existing script, or existing doc was modified; the only new runtime-adjacent
files are the input scripts and batch runner under
`tools/playtest/scripts/adversarial/`.

All numbers below come from 47 harness runs (`tools/playtest/run.mjs`, `testapi`
fidelity, real Chrome via CDP). **Zero console or page errors were observed in
any run**, and dispatch jitter stayed at or under 4ms.

## How to reproduce

```sh
cd tools/playtest
npm install                                   # once

# any single finding, three times, with the extra numbers this report cites:
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p4-hold-right-mash-jump.json

# the long-window scripts (x1, x3, x4, x5, x6) need a raised runtime cap:
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 \
  scripts/adversarial/x1-crush-clock-and-shove.json

# aspect-ratio pass:
node scripts/adversarial/repeat.mjs --reps 3 --viewport 800x1000 \
  scripts/adversarial/p4-hold-right-mash-jump.json
```

`repeat.mjs` shells out to the unmodified `run.mjs` once per repetition and
prints outcome, `maxX`, victory time, closest crush margin, idle fraction,
deaths, `protoScore`, longest pinned stretch, `maxY`, and route coverage per
run. Raw reports land in the gitignored `tools/playtest/runs/adversarial/`.

## Findings, ranked by severity

| # | State | Claim | Headline evidence |
| --- | --- | --- | --- |
| F1 | CONFIRMED | Two keys with no timing and no route reading clear the slice in 5.37s — 1.30× the theoretical sprint | p4 3/3 completed, idle 0, crush margin never below 18.4 tiles |
| F2 | CONFIRMED | The fire key is decorative: deleting it changes nothing | p3 (= committed demo minus fire) 3/3 completed, 0 kills |
| F3 | CONFIRMED | The pursuit clock's period (9.9s) is longer than the whole slice; on open ground the damage edge is a conveyor, not a hazard | x1: first contact at 6.98s, first damage at 11.23s, 4.25s of damage-free shoving |
| F4 | CONFIRMED | The damage edge pushes the player *through* solid terrain for 1 hp | x3: pinned player crosses the 1-tile dead-end wall at y=6 and goes on to win |
| F5 | CONFIRMED | The dare pocket is a free pickup, not a wager, at 1280×800 and wider | x2: entry margin 23.6–25.8, exit margin 18.2–19.2 vs a design floor of 8 |
| F6 | CONFIRMED | The weapon-pop-on-hit mechanic is a no-op — the capsule is re-caught the same frame | x2 r2/r3: hit while holding H, weapon still H, no recovery scramble |
| F7 | CONFIRMED | The fast retry silently drops held input; the next attempt starts unresponsive | x4: 5.2s of zero motion with ArrowRight held, instant motion on re-press |
| F8 | CONFIRMED | The low route is closed to any human jump: the column-39 step needs a ≤25ms tap | x6: the 16ms tap passes 3/3; every longer hold tested elsewhere fails |
| F9 | CONFIRMED | The only pressure system in the slice is 2× weaker on a wide window than a narrow one | saturated margin 36.1 / 25.8 / 18.3 tiles at aspect 2.67 / 1.60 / 0.80 |
| F10 | CONFIRMED | The fastest route is also the safest — the fixture's wasps cannot reach it | winning policies fly at y=10–13.9; wasps sit at y=8.4/8.8 and only dive downward |
| F11 | CONFIRMED | Holding jump dead-ends against a 1-tile lip for 10 seconds | p2/x3: pinned at x=55.65 for 9.6s with two keys held |
| S1 | SUSPECTED | Three routes declare a `wall-jump` verb at a connector pair where no wall is grabbable | `overhang-top → post-*` vs `dare-dead-end.grabbable === false` |
| S2 | SUSPECTED | Modifier/CHRONO interactions cannot be tested in the fixture at all | no carrier in the fixture, `updateSpawner` returns early for the slice |
| S3 | SUSPECTED | i-frames exceed the run: 3 hp × 1200ms ≈ 3.6s of invulnerability in a 5.4s win | `CONFIG.player.iframesMs`, naive runs survive every hit |
| S4 | SUSPECTED | The harness under-reports what `testapi` already provides (`airJumps`) | `main.js:200` publishes it, `lib/sampler.mjs` drops it |

---

### F1 — CONFIRMED — Hold right and mash jump clears the slice; route choice is decorative

**Claim.** The minimal winning policy is **two keys, no timing information, no
route reading, no firing**: hold `ArrowRight` and tap `Space` every 220ms. It
completes the slice in **5.37s in-game**, against a theoretical straight-line
sprint of `(72 − 27.5) / 10.8 = 4.12s` (the figure `tools/pathcheck.mjs:583`
asserts). The naive policy is therefore within **1.30×** of optimal, and the
gap available to skill across the whole fixture is about **1.25 seconds**.

**Reproduction.**
```sh
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p4-hold-right-mash-jump.json
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p3-hold-right-hop-nofire.json
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p5-hop-500ms.json
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p6-hop-1200ms.json
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p1-hold-right-only.json
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p2-hold-right-hold-jump.json
```

**Evidence — the cadence sweep.** Every policy is hold-right plus a jump
rhythm, with no fire key and no knowledge of the level:

| Script | Jump input | Result (3 runs) | In-game win time | Min crush margin | Idle |
| --- | --- | --- | --- | --- | --- |
| `p1-hold-right-only` | none | **died 3/3** | — | 0.59–0.63 | 0.87 |
| `p2-hold-right-hold-jump` | held forever | **stalled 3/3** | — | 0.40–0.44 | 0.65–0.70 |
| `p4-hold-right-mash-jump` | tap /220ms | **completed 3/3** | 5.37 / 5.37 / 5.37 s | 18.40–18.42 | 0.00–0.014 |
| `p5-hop-500ms` | tap /500ms | **completed 3/3** | 5.55 / 5.55 / 5.55 s | 18.38–18.40 | 0.00 |
| `p3-hold-right-hop-nofire` | tap /800ms | **completed 3/3** | 6.78 / 6.78 / 7.21 s | 17.40–18.42 | 0.00–0.033 |
| `p6-hop-1200ms` | tap /1200ms | **failed 3/3** (1 stalled, 2 died) | — | 0.86 / 7.51 / 6.79 | 0.24–0.48 |

The winning band is wide — three unrelated cadences spanning 220ms to 800ms all
clear it — so no single resonance with the geometry explains it. What every
winning run does is identical: pump the chimney-left wall (`solidRects`
`chimney-left`, x 39–40) with contact launches until it clears the wall top at
y=10, then run the unobstructed top tier (chimney tops y=10, `post-high` y=8.35,
`exit-high` y=9.35) east to the rejoin. Measured `maxY` for winning runs is
**13.57–13.89**, i.e. above every authored platform. Route coverage is the same
two routes in every winning run (`upper-chimney`, `recovery-scramble`) — 2 of the
6 authored routes, and the same 2 every time.

**Contracts violated.**
- DESIGN, *Moment-to-moment loop*: "Holding fire while moving right is not
  enough. A successful encounter makes the player deliberately change route,
  timing, or target priority."
- DESIGN, *Fun acceptance*: "players make a deliberate route or target-priority
  choice every few seconds."
- FLEET-PLAN diagnosis 2 and 4 (uncontested routes, no stakes differential).

**Suggested owner.** `intensity` (route stakes / pressure), with `combat` for
the contest side.

---

### F2 — CONFIRMED — Fire is decorative

**Claim.** `scripts/adversarial/p3-hold-right-hop-nofire.json` is the committed
demo `scripts/mid-route.json` with the fire key removed and nothing else
changed. It completes 3/3 with the same route coverage, the same 17–18 tile
crush margin, and 0 kills. Nothing in the slice requires, rewards, or even
notices shooting.

**Reproduction.** `node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p3-hold-right-hop-nofire.json`

**Evidence.** completed 3/3, `finalKills` 0 in every naive run (`p3`, `p4`,
`p5`); `protoScore` 139.7–155.1 with `airborneKills=0`.

**Contract violated.** DESIGN pillar 2, "Combat happens through movement …
Traversal is not downtime between fights; it is how the player fights."

**Suggested owner.** `combat`.

---

### F3 — CONFIRMED — The pursuit clock is slower than the slice, and the edge is a conveyor on open ground

**Claim.** Three separate numbers, all reproducible:

1. **Standing still from spawn buys 6.98 seconds** before the damage plane even
   touches the player (spawn margin 18.4 tiles ÷ `minimumScrollSpeed` 2.6).
2. **On open ground the plane does no damage at all.** It sets
   `player.x = le + player.hw` (`src/sim/player.js:322`) and only calls
   `damagePlayer` when `playerOverlapsSolid()`. Measured: from t=6.98s to
   t=11.23s the player is shoved from x=27.5 to x=38.68 at exactly 2.6 tiles/s
   with hp pinned at 3 — **4.25 seconds of damage-free conveyor**, including
   being carried down the 3→2 ground step. First damage lands only when the +1
   step at column 39 pins them.
3. **After any forward motion the clock is 9.9 seconds.** A player who has run
   right sits at the follow-lead saturation margin of 25.7 tiles
   (`followLeadTiles` 16 plus the frustum's left offset of 10.38 tiles at
   1280×800, minus the body half-width). x3 measures the decay directly:
   margin 25.66 at t=4.17s to 1.41 at t=13.50s — 9.3s of standing perfectly
   still, still untouched.

The fixture's own `targetPlaySeconds` is **4–12s** and pathcheck asserts the
sprint at 4.12s. A clock whose period is 9.9s cannot produce a timed decision
inside a pass; it can only punish someone who has stopped playing.

**Reproduction.**
```sh
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x1-crush-clock-and-shove.json
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x3-deadend-lip-pin.json
```

**Evidence.** x1 (zero input, `&enemies=0`) is deterministic to ~3ms across
3 runs: plane contact at 6.980 / 6.982 / 6.983s, first damage at 11.232 /
11.233 / 11.233s, death at 13.658 / 13.662 / 13.663s, `maxX` 44.95–44.97, idle
fraction 0.95, `protoScore` −73.7. **Doing nothing at all survives 11.2 seconds
and travels 11 tiles forward.** x3 gives the saturated-margin decay above.

**Contract violated.** DESIGN, *Route-choice and pursuit contract*: "The
scrolling damage edge turns topology into a clock. It should create decisions."

**Suggested owner.** `intensity`. The two levers are `followLeadTiles` (16) and
`minimumScrollSpeed` (2.6); note that F9 shows the resulting clock is also
aspect-ratio dependent, so the fix should bound the *margin*, not just the speed.

---

### F4 — CONFIRMED — The damage edge pushes the player through solid terrain for 1 hp

**Claim.** The left-edge push is a raw position assignment with no collision
resolution:

```js
// src/sim/player.js:321-324
if (player.x - player.hw < le) {
  player.x = le + player.hw;
  if (playerOverlapsSolid() && !cornerBusy()) damagePlayer(1, player.x - 1);   // crushed against terrain
}
```

So a player pinned against terrain is not crushed *against* it — they are pushed
**into and through** it, paying 1 damage per `iframesMs` (1200ms). At the plane's
2.6 tiles/s a one-tile wall takes 0.38s to cross, which fits inside a single
i-frame window: **one wall costs exactly 1 hp.**

**Reproduction.** `node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x3-deadend-lip-pin.json`

**Evidence.** x3, all three runs: the player stands on the dare overhang's roof
at x=55.65, y=6.00, jammed against the `dare-dead-end` rect (column 56, solid
y=1..7). The plane arrives at t=14.95s, deals one hit (hp 2→1), and then the
trace walks the player *inside* the wall — x=55.87, 56.07, 56.28, 56.67 at
y=6.00–6.24, reported `grounded` — and out the other side, where they run on and
**win at 16.78s**. The same tunneling appears in x1, where the shove carries the
pinned player through the column-39 step corner onto the floor above.

This is double-edged and worth an explicit decision rather than a silent fix: it
is why none of my attacks could produce a softlock, but it also means solid
geometry is permeable for 1 hp, and in the six-face run the plane could push a
player into thicker hull, a corner apron, or an unbuilt-face column (the
right-hand clamp guards forward motion past a corner; nothing guards this).

**Contract violated.** DESIGN pillar 5 ("Chaos stays readable … able to explain
why they were hit"), and the technical acceptance goal of reproducible
collision.

**Suggested owner.** `physics-reviewer`.

---

### F5 — CONFIRMED — The dare pocket is a free pickup, not a wager

**Claim.** A prompt player can enter the pocket, take the H capsule, retreat,
climb out, and clear the slice with roughly **2.3× the safety margin the fixture
believes it is pricing**. The fixture's numbers
(`darePocket.timing`: `retreatSeconds` 1.5, `entryEdgeMarginTiles` 18,
`minExitMarginTiles` 8) are internally consistent and pathcheck asserts them
(`pathcheck.mjs:588-595`) — but the *actual* margin at pocket entry is ~25.8
tiles, not 18, because the camera-follow lead has already saturated.

**Reproduction.**
```sh
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x2-pocket-grab-then-naive.json
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x5-pocket-dawdle.json
```

**Evidence.**

| Run | Reward taken | Margin entering pocket | Margin leaving pocket | Min margin | Outcome |
| --- | --- | --- | --- | --- | --- |
| x2 r1 | no (drop-through missed) | — | — | 15.67 | completed 8.70s |
| x2 r2 | **yes** | 23.59 | 19.15 | 14.06 | completed 8.63s |
| x2 r3 | **yes** | 25.78 | 18.17 | 13.64 | completed 8.65s |
| x5 r2 (+5s standstill) | **yes** | 25.77 | 6.79 | 2.06 | completed 14.09s |
| x5 r3 (+5s standstill) | **yes** | 25.77 | 6.01 | 0.63 | completed 13.65s |

The round trip costs a prompt player ~1.1s and ~7 tiles of margin, leaving
18–19 tiles — more than twice the fixture's own 8-tile floor. Standing in the
dead end for a further **five seconds** finally pushes the exit margin below
that floor (6.0–6.8 tiles), and even that player escapes, clears the slice, and
loses at most 1 hp. Break-even by arithmetic is about a **seven-second nap**,
which is longer than the whole intended pass.

The wager only becomes real when the window is narrow: at 800×1000 the same
script left **3.54 tiles** (1.4s) in one of two runs (F9).

**Contract violated.** DESIGN, *Fun acceptance*: "dead-end pickups feel like
conscious wagers rather than generator tricks"; the pocket currently reads as a
detour with a price tag but no risk.

**Suggested owner.** `intensity` for pricing (the honest fix is to bound the
margin, per F3/F9, not to shrink the pocket).

**Honesty note.** x2/x5 reach the pocket through a drop-through on the
chimney-floor catwalk, which is timing-fragile open-loop: the reward grab
reproduced in 2 of 3 runs (and 4 of 6 across iterations). Check
`metrics.darePocket.rewardTaken` before quoting a single run. The margin numbers
above are only from runs where it is `true`.

---

### F6 — CONFIRMED — The weapon-pop-on-hit mechanic is a no-op

**Claim.** DESIGN (*Weapons (shipped)*) promises: "On taking a hit the capsule
pops out toward the threat — recatch within 2.2s or you're back on the rifle",
and treats the pop as "an excellent local panic". It never happens. The popped
capsule spawns **inside the player's own AABB** and is re-collected on the same
frame:

- `src/sim/player.js:371` — `spawnCapsule('letter', currentWeapon, player.x, player.y + 1.2, 'pop', …)`. The player's body spans `y … y+1.7`, so `y+1.2` is inside it.
- `src/main.js:169-171` — `updateHostiles` (which calls `damagePlayer`) runs *before* `updateCapsules` in the same frame.
- `src/sim/capsules.js:80-84` — `updateCapsules` tests `circleHitsPlayer(c.x, c.y, 0.95)` with no ownership check and no grace window, and calls `setWeapon(c.letter)`.

**Reproduction.** `node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x2-pocket-grab-then-naive.json` — inspect the trace for a run where `rewardTaken` is true and hp drops.

**Evidence.** In the x2 runs the player picks up H, then takes a wasp hit
(hp 3→2), and the sampled `weapon` reads `H` both before and after. The only
code path that can set the weapon back to `H` is a capsule pickup, so the pop
and the recatch both happened inside one 75ms sample.

**Contract violated.** DESIGN, *Weapon roles in the lattice*: the recovery-floor
discussion assumes losing a weapon is a real setback; and *Fun acceptance*:
"losing a weapon creates a memorable recovery scramble".

**Suggested owner.** `combat` (a few frames of no-catch grace, or spawn the
capsule outside the body, would restore the intended panic).

---

### F7 — CONFIRMED — The fast retry drops input the player is holding

**Claim.** `scheduleSliceRetry()` and `resetGame()` both call `releaseAllKeys()`
(`src/sim/player.js:388`, `src/main.js:111`), and `keys[k]` is only ever set by a
`keydown` handler. A player still holding a key when the auto-retry fires starts
the next attempt with that key registered as up.

**Reproduction.** `node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x4-retry-input-loss.json`

**Evidence.** x4 holds `ArrowRight` continuously and dies deterministically at
13.29s. Attempt 2 spawns at 13.97s and the player **stands at x=27.50 with
vx=0.0 for 5.2 seconds** while the key is still physically down. A single
scripted release-and-re-press at 19.2s produces `vx=1.2` on the very next sample
and full run speed immediately after. 3/3.

**Two different consequences, with different confidence:**

- **Measurement (CONFIRMED, and this one matters to the whole fleet):** any
  harness script whose run dies produces a *zombie* second attempt that receives
  no input at all. Every metric after the first death — idle fraction, route
  coverage, margins, `protoScore` — is measuring an empty room. This affects the
  committed demo reports as soon as a policy dies, and it is why my policy table
  reports first-attempt behaviour explicitly.
- **Human experience (SUSPECTED):** real Chrome sends auto-repeat `keydown`
  events for a physically held key, and the handler sets movement keys on repeat
  as well (`src/main.js:88-92`), so a human's movement would likely recover
  within one repeat interval. Jump, however, is explicitly gated on `!e.repeat`,
  so a held jump is genuinely dead until released and re-pressed. Needs a
  hands-on check; Playwright sends exactly one `keydown`, so the harness
  measures the worst case.

**Contract at stake.** HANDOFF's definition of done, "A missed catch or route
choice produces a recoverable scramble", and DESIGN's control-preservation rule
for transitions.

**Suggested owner.** `physics-reviewer` for the game side (re-arm held keys on
retry, or keep the key state and only clear the jump buffer);
`harness-engineer`/`docs` for the measurement caveat.

---

### F8 — CONFIRMED — The low route's column-39 step needs a ≤25ms jump tap

**Claim.** A grounded player running east on the y=2 floor is stopped at
x=38.65 by the +1 step at column 39, and the *only* jump that gets through is
one released within about **one frame** of the press. The geometry:

- `groundRuns` step from `{32..39, y:2}` to `{39..47, y:3}`, and `solidRects`
  `chimney-left` occupies the *same column* 39 from y=5 to y=10. The passable
  slot is therefore cells (39,3) and (39,4) only — two tiles tall.
- Clearing the step needs feet ≥ 2.98; fitting under the wall needs
  feet + 1.68 < 5, i.e. feet < 3.32. The player must be inside that 0.34-tile
  band at the moment the horizontal collision check runs.
- With the slice's `jumpVel` 16.5 and `gravity` −42 an uncut jump crosses that
  band in ~21ms and then rises to 5.24, so the head enters cell (39,5) and every
  frame of the crossing is blocked. Only the release-cut (`jumpCutMult` 0.58)
  keeps the apex low enough: releasing at 16ms peaks at feet 3.26 (passes),
  at 33ms peaks at 3.44 (blocked), at 50ms peaks at 3.62 (blocked).
- Neither forgiving verb rescues it. The ledge probe rejects the step because
  the hanging body would be inside the lower floor (`traversal.js:39-43`, the
  outside-column check) — a +1 step has no room to hang beside. And a wall
  launch fires *away* from the wall (`vx = -side * wallJumpX`).

**Reproduction.** `node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x6-step39-slot-sweep.json`

**Evidence.** x6 holds right (pinning the player at x=38.65) and sweeps eleven
jump hold lengths from 16ms to 500ms. The **16ms** tap passes in all three runs,
identically: t=1443 y=2.48 rising, t=1596 x=38.86 y=3.20 — through the slot —
then it runs the y=3 floor from x=39.6 to 46.9 and goes on to clear the slice in
8.44s. This is the only run in the whole session whose route coverage matched
`lower-service`.

Longer holds were never re-tested at the step in the same run (the player had
already passed it), but the failures are on record elsewhere: `p1` (no jump)
pinned 3/3, `p6` (1200ms cadence, 380ms holds) pinned at the same x in the run
that stalled, and the x2 iterations with 380ms holds at that spot rose along the
wall face and fell back every time.

**Contracts violated.**
- DESIGN level-construction contract: "every mandatory route is reachable with
  already taught verbs"; and *Route-choice and pursuit contract*: "most moments
  offer at least two viable forward routes." A player on the low floor at x=38
  has **zero** forward options with a human-length keypress.
- The fixture declares this transition as an ordinary verb —
  `{ routeId: 'lower-service', from: 'low-approach', to: 'low-step', verb: 'run-jump' }`
  — and routes `dare-pocket` across the same floor. Two of six declared routes
  are gated behind a one-frame input.
- `tools/pathcheck.mjs` asserts the graph's shape, the verb *vocabulary*
  (lines 557-562) and the dare timing, but never that a declared verb can
  actually execute at that connector pair.

**Suggested owner.** `physics-reviewer` (owns pathcheck growth — an assertion
that every declared edge is executable would have caught this), with the fixture
geometry owner (`intensity`) for the fix: dropping `chimney-left` to start at
y=6, or lowering the step, opens the route to a normal jump.

---

### F9 — CONFIRMED — The pursuit clock is a function of window aspect ratio

**Claim.** The crush margin — and therefore the entire pressure system — scales
with the frustum width, which scales with aspect ratio. The same naive policy
faces a 2× different clock across ordinary window shapes.

**Reproduction.**
```sh
node scripts/adversarial/repeat.mjs --reps 3 --viewport 800x1000 scripts/adversarial/p4-hold-right-mash-jump.json
node scripts/adversarial/repeat.mjs --reps 3 --viewport 1600x600 scripts/adversarial/p4-hold-right-mash-jump.json
node scripts/adversarial/repeat.mjs --reps 2 --viewport 800x1000 --max-runtime-ms 26000 scripts/adversarial/x1-crush-clock-and-shove.json
```

**Evidence.** `EDGE_L` measured from the traces as
`x − hw − edgeMargin − scrollX` (constant within a run, as designed):

| Viewport | Aspect | `EDGE_L` | Saturated margin | Standing-still slack | Spawn → plane contact | p4 result |
| --- | --- | --- | --- | --- | --- | --- |
| 1600×600 | 2.67 | −20.67 | 36.07 tiles | 13.9 s | — | completed 3/3 |
| 1280×800 | 1.60 | −10.38 | 25.78 tiles | 9.9 s | 6.98 s | completed 3/3 |
| 800×1000 | 0.80 | −3.06 | 18.30 tiles | 7.0 s | **4.18 s** | completed 3/3 |

**Positive result inside this finding:** no route broke narrow. The winning
policy completes 3/3 at every viewport, and the portrait pullback
(`traversalCameraDepth`, `portraitMinAspect` 0.9) does keep the play area
usable. What changes is fairness, not reachability: the dare-pocket run kept
only 3.54 tiles of margin at 800×1000 versus 13.6–15.7 at 1280×800, and an idle
player is touched by the plane at 4.18s instead of 6.98s.

**Contract at stake.** DESIGN technical acceptance: "no unavoidable route closure
across supported aspect ratios" is *met*; but the pursuit contract's implicit
promise of a consistent clock is not.

**Suggested owner.** `physics-reviewer` (aspect coupling) with `intensity`
(whatever bounds the margin should be expressed in tiles-of-reaction-time, not
in screen widths).

---

### F10 — CONFIRMED — The fastest route is also the safest

**Claim.** The fixture's two wasps cannot contest the route every naive policy
takes, so the degenerate strategy is *also* the lowest-risk one — the exact
inverse of the intended stakes differential.

**Evidence.**
- Wasps dive only when the player is below them:
  `if (Math.abs(e.x - player.x) < diveRange && player.y + 1 < e.y …)`
  (`src/sim/hostiles.js:98`). The fixture's wasps sit at y=8.4 (x=37) and y=8.8
  (x=63); winning runs travel the top tier at y=10–13.9 (measured `maxY`
  13.57–13.89), i.e. permanently above both.
- The wasps cruise **left** at 2.0 tiles/s while the player advances at 10.8,
  and the slice has no ambient spawns at all (`src/sim/spawner.js:23` returns
  early for the slice, and the fixture spawns only its two authored wasps), so
  both threats are behind the player within a few seconds and are eventually
  culled.
- Naive runs recorded **0 kills** and at most 2 hp of incidental contact damage,
  with no consequence in a 5.4s run (see S3).
- With enemies enabled, the wasp is what punishes a stopped player, and it does
  so long before the clock does: in p1 the pinned player lost hp at margins of
  18.10, 12.00 and 5.56 tiles (t=4.0s, 6.4s, 8.9s), so the run ended by wasp
  4.8 seconds before the plane would have reached them. With `&enemies=0` (x1,
  x4) the same pin dies to the crush instead, at 13.66s. Either way the threat
  only exists for a player who has stopped moving.

**Contract violated.** FLEET-PLAN diagnosis 2 ("route choice only matters when
routes carry different threats"); DESIGN enemy-role table, where the wasp's job
is "Contests open crossings and predictable jump arcs".

**Suggested owner.** `combat` (a threat that occupies the top tier or contests
the wall-pump), `intensity` (route stakes).

---

### F11 — CONFIRMED — Holding jump dead-ends against a 1-tile lip

**Claim.** `hold right + hold Space` — a policy that ought to be strong, because
`jumpBuffered` is `(jumpBufferedUntil > now || keys.jump)` in the traversal
decisions, so a held key auto-launches off every ledge and wall — instead parks
the player against the `dare-dead-end` lip on the overhang roof at x=55.65 for
**9.6 seconds**, doing nothing, until the damage plane arrives and tunnels them
through (F4).

**Reproduction.**
```sh
node scripts/adversarial/repeat.mjs --reps 3 scripts/adversarial/p2-hold-right-hold-jump.json
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 scripts/adversarial/x3-deadend-lip-pin.json
```

**Evidence.** p2: stalled 3/3, `maxX` 55.65–58.38, longest pin 9631–9715ms at
x=55.65. x3 (same policy, 22s window): pinned 9634–9639ms, then crushed through
and completed.

**Why it happens (and why it is unfair rather than merely bad play).** Three
rules combine so that the same held input that solves every other surface
solves nothing here: the jump buffer is only armed on a `keydown` with
`!e.repeat` (`src/main.js:91`), so a held jump never re-arms; the lip is
`grabbable: false`, so there is no wall state to launch from; and the lip is one
tile tall — too short to ledge-catch, tall enough to block. The player gets no
feedback distinguishing "you need to re-press" from "you are stuck".

**Contract at stake.** DESIGN pillar 5 (readability) and "every grab wants to
become another launch".

**Suggested owner.** `physics-reviewer` / `intensity`.

---

### S1 — SUSPECTED — Three routes declare a `wall-jump` verb where nothing is grabbable

Read from the fixture, not reproduced by a script.
`lower-service`, `mid-catwalk` and `dare-pocket` all declare
`overhang-top → post-low`/`post-mid` with `verb: 'wall-jump'`
(`src/pure/traversal.js:182, 188, 215`). The only wall between the overhang roof
and those platforms is `dare-dead-end`, which carries `grabbable: false` and is
rejected for both wall adhesion and its top ledge catch — deliberately, and
asserted in `pathcheck.mjs:692-694`. The actual move there is a plain one-tile
hop over the lip. The verb data is fiction for those three edges, which matters
because it is the data the harness, the future chunk assembler, and the
level-construction contract all read. Owner: `docs` plus `physics-reviewer`.

### S2 — SUSPECTED — Modifier and CHRONO interactions are untestable in the fixture

The slice spawns two wasps and one `mode: 'fixed'` H capsule; no carrier exists
in the fixture, `dropFromCarrier` is therefore never called, and
`updateSpawner` returns immediately for the slice. RAGE / GHOST SQUAD / ORBITAL
LANCE / CHRONO cannot be obtained in the traversal slice at all, so the
"CHRONO × slice retry" and "modifier × traversal" attack surfaces are currently
empty rather than clean. Anyone who needs them measured has to add a carrier to
the fixture or attack the six-face run. Owner: `combat` / `score-designer`.

### S3 — SUSPECTED — i-frames outlast the run

`CONFIG.player.iframesMs` is 1200 and `maxHealth` is 3, so a player has up to
3.6s of invulnerability available inside a 5.4s winning run, and nothing in the
slice can spend it faster. My naive runs took 0–2 hits with no observable
consequence. Reading-based; worth keeping in mind before concluding that added
enemy density has made the slice dangerous. Owner: `combat`.

### S4 — SUSPECTED (harness) — `airJumps` is available but dropped

`src/main.js:200` already publishes `airJumps: sliceStats.airJumps` in the
`?testapi=1` snapshot, but `tools/playtest/lib/sampler.mjs`'s `testapi` branch
does not copy it, so every report prints "Air jumps: unavailable" and the
README's hook request #1 and "single best next action" are both stale. One line
in the sampler. Owner: `harness-engineer`.

Related positive: `tools/playtest/lib/fixture.mjs`'s hand-copied snapshot is
**byte-identical** to the live `TRAVERSAL_FIXTURE` for every key it carries
(`id`, `bounds`, `entry`, `exit`, `connectors`, `routes`, `darePocket`,
`rejoin`) — I diffed them against the real import. The drift the README warns
about has not happened yet.

---

## What the game correctly resists

Attacks that failed are findings too. None of these produced a defect:

1. **The single-key policy loses.** `p1-hold-right-only` died 3/3. There is a
   real, if low, input floor — and the 1200ms cadence (`p6`) also fails 3/3, so
   the floor is somewhere between one hop per 800ms and one per 1200ms.
2. **No softlock exists anywhere in the fixture.** Across 47 runs and every
   pin, dead end, wall state and pocket dawdle I tried, the player always
   either escaped, was tunneled free by the plane (F4), or died and retried.
3. **The crush-edge guard on traversal states works.** `src/sim/player.js:316-320`
   clears a ledge/wall state that comes within `traversalEdgeGuard` of the plane
   and injects a forward nudge of `activeScrollSpeed()`. I never produced a
   grab-state death, and never saw a grab carry a player into the damage plane.
4. **The non-grabbable dare wall holds.** No run ever entered a wall state on
   column 56; every stop there was a plain grounded block, exactly as
   `traversalSolidAllowsGrab` intends.
5. **No fall deaths, no void.** `falls` is 0 in every run; the fixture's floors
   are continuous and `killY` is never reached except after a genuine death.
6. **No i-frame or ledge-hover exploit found.** `ledgeHangMs` 240 with
   `traversalRecatchMs` 180 gives no re-catch loop that beats gravity, and the
   scroll has no gate in the slice to stall — `updateScroll` always advances by
   at least `minimumScrollSpeed`, so there is nothing to hold hostage.
7. **Zero console or page errors in 47 runs**, at three viewports, including
   runs that died, retried, tunneled through walls, and stood still for 20s.
8. **The harness rejects malformed scripts.** `lib/compile.mjs` caught a
   duplicate `keydown` I introduced while iterating (overlapping jump taps)
   instead of silently swallowing it.

## Determinism, and what this harness can and cannot prove

Same script, three runs, same machine:

- **Sub-frame stable when the policy avoids knife-edge transitions.** `p4`:
  in-game victory 5.37 / 5.37 / 5.37 s, `maxX` 72.01 / 72.01 / 72.09,
  `maxY` 13.68 / 13.87 / 13.57. `p5`: 5.55 s ×3. `x1`: contact and death times
  within ~3ms, pinned 8347 / 8344 / 8346 ms. `x6`: 8.44 / 8.45 / 8.44 s.
- **Outcome-stable but path-unstable when a transition is fragile.** `x2`:
  8.70 / 8.63 / 8.65 s, all completed, but the pocket drop-through succeeded in
  2 of 3 (and route coverage differed between runs: `mid-catwalk|upper-chimney|
  wall-launch|recovery-scramble` versus `upper-chimney|recovery-scramble`).
- **Outcome-unstable only where the policy is already marginal.** `p6`:
  not-completed / died / died.

Real-keyboard jitter was 0–2ms average and ≤4ms max in every run, so the
variance above is physics-timing sensitivity, not dispatch noise. Practically:
three repetitions are enough to claim *"this policy wins/loses reliably"*, and
not enough to claim *"this policy takes route R"* — route claims need either
many runs or a closed-loop bot. Every route claim in this report is either
backed by 3/3 agreement or explicitly flagged.

Two further limits worth stating plainly:

- **Open-loop scripts cannot react.** Nothing here proves a *human* can or
  cannot do something; F8's one-frame window is a geometry-and-physics
  derivation that the sweep confirms in one direction (16ms passes) and that
  human keypress durations make implausible in the other.
- **Any run that dies measures nothing after the death** (F7). Treat
  post-death samples in any report from this harness as void until the retry
  re-arms held keys.

## Single best next action

Bound the crush margin in *time*, not in screen widths: clamp
`traversalFollowTarget`'s effective lead so the plane is never more than ~2.5–3
seconds behind a moving player at any aspect ratio, then re-run this suite. F1,
F3, F5 and F9 are all the same root cause — a 9.9-second clock that no 5-second
route can feel — and F10's "safest route is fastest" only becomes interesting
once standing on the roof costs something. The suite is the regression test: if
`p4-hold-right-mash-jump` still completes 3/3 with 18 tiles of margin after the
change, the pressure fix did not land.
