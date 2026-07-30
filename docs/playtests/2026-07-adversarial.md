# Adversarial playtest — traversal slice, July 2026

Prepared by the `adversarial` agent of the fleet push, against `main` at
`5e9dbc8` (the merged module split). Target: `index.html?slice=traversal`.
The physics audit merged as `39bb6dc` landed while these runs were in flight;
it touched only docs, `README.md`, `tools/pathcheck.mjs` and the playtest
README, so no runtime file under `src/` changed and every measurement below
still describes the current tree. Re-verified after that merge:
`node tools/pathcheck.mjs` reports 192 passed / 0 failed, and the headline
script `p4-hold-right-mash-jump` still completes 3/3 at 5.37-5.38s in-game with
a closest crush margin of 18.40 tiles.

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

**Not covered by the new tunneling assertions.** The physics audit merged as
`39bb6dc` added `frame dt clamp vs. collision safety margins (tunneling)` to
`tools/pathcheck.mjs`, but those assertions bound `velocity × dtMax` — they
prove *integrated* motion cannot skip a cell. The crush push is not integrated
motion; it assigns `player.x` directly, so it passes through terrain regardless
of how tight the dt clamp is.

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
  re-arms held keys. **Superseded on 2026-07-30** — see the addendum.

## Addendum — 2026-07-30

### F7 is fixed at the measurement layer only; the game behaviour stands

`18c1a54` ("Fix zombie attempts (F7) and restore dropped airJumps (S4)") fixed
this harness-side: `lib/driver.mjs` now tracks which codes the script considers
held, watches the `attempts` counter every sample tick, and re-dispatches
`keydown` for each held code the moment a retry fires. Post-death samples are
therefore usable again, and the fix records its own re-assertion latency rather
than assuming it is instant.

Two things to keep straight:

- **`src/` is unchanged** (`git diff 39bb6dc HEAD -- src index.html` is empty).
  The game still calls `releaseAllKeys()` on every retry, so the human-side
  question in F7 is still open: movement keys likely recover through Chrome's
  auto-repeat, but jump buffering is gated on `!e.repeat`, so a player holding
  jump across a retry still gets no jump until they release and press again.
- **The defect is no longer observable through the harness.** `x4-retry-input-loss`
  now measures the driver's re-assertion latency, not the game's input loss.
  The pre-fix evidence is preserved above; reproducing the *game* behaviour now
  needs a driver without the re-assertion.

Measured side effect on this report's own baseline numbers: `p1-hold-right-only`
attempt 2 now runs east instead of standing at spawn (final x 38.65 post-fix
versus 27.50 pre-fix), which moves its `minEdgeMargin` from 0.59 to 5.55. Same
game, same script — a different observer.

### In-game victory time is frame-rate sensitive; compare outcome and margin instead

Two full-suite captures on the same commit, hours apart, disagree on timing but
not on verdicts. `p5-hop-500ms` measured 5.55s ×3 in one batch and 5.94s ×3 in
another, while `p4-hold-right-mash-jump` held at 5.36–5.37s in both, and every
outcome and crush margin was identical (18.4 tiles for both scripts). No game
code changed between them; the machine was carrying other agents' browser
batches during the second one. The mechanism is the sensitivity
`tools/pathcheck.mjs` now asserts directly under "discrete jump-apex frame-rate
dependence": under CPU contention a jump resolves on a slightly different frame,
the apex differs, and a 500ms cadence lands somewhere else.

Practical rule for anyone using this suite as a gate: **outcome and
`minEdgeMargin` are the load-robust axes; treat `victorySec` as indicative and
only compare it within one batch.** Do not run two harness batches concurrently.

### New evidence for F4: the crush push can leave the player *behind* the plane, and `edgeMargin` goes negative

Re-capturing the baseline surfaced a sharper version of F4. `x4-retry-input-loss`
produced two qualitatively different micro-behaviours on the same game commit,
both ending in the same wall tunnel:

| | x position while crushed | reported `edgeMargin` |
| --- | --- | --- |
| First capture | smooth slide, 38.727 → 38.924 → 39.118 … at 2.6 tiles/s | pinned at exactly **+0.400** |
| Second capture | snapped tile to tile, 38.649 → 38.649 → 38.649 → 39.649 → … | decays **0.33 → 0.13 → −0.06 → −0.26 → −0.45**, snaps back to +0.35 on each tile step |

Those snapped values are the wall faces (`39 − 0.35 − 0.001 = 38.649`, then
`40 − 0.35 − 0.001 = 39.649`), i.e. the horizontal collision resolver ejecting
the player back out of the column the crush push just shoved them into. While
that tug-of-war runs, the plane advances past the player: **the player is up to
0.60 tiles behind the damage plane**, and the HUD's own EDGE readout — and the
`minEdgeMargin` metric A.5 shares — goes negative, a state nothing downstream
appears to expect. `minEdgeMargin` is not bounded below by
`CONFIG.edges.margin`; any consumer assuming ≥ 0.4 is wrong.

I did not establish why one capture grinds tile-by-tile and the other slides
smoothly. The plausible mechanism is the 220ms hitstun window (which skips the
horizontal drive, leaving the knockback velocity to trigger the collision
resolver) landing on a different frame phase, but that is a hypothesis, not a
result. Either way the F4 outcome held 3/3 in both captures.

For the gate this means **`x4`'s margin is not a comparable axis** — it reflects
which micro-behaviour occurred, not a property of the build. Its outcome (dies
3/3) is comparable.

**Suggested owner.** `physics-reviewer`, alongside F4.

### Baseline and regression-gate procedure

**The frozen pre-CP1 reference is the tables in this report**, captured at
`5e9dbc8`/`39bb6dc`: `p4` completing 3/3 at 5.37s with an 18.40-tile margin,
`p3` 3/3, `p1` 0/3, `x1` first contact 6.98s and first damage 11.23s. Those are
the numbers a CP1 variant has to move.

No committed `baseline-*.json` accompanies them, and the reason is worth
recording rather than hiding: **two attempts to freeze one were both invalidated
by merges landing mid-capture.** The first straddled an edit to
`lib/sampler.mjs`/`lib/driver.mjs` (its first two scripts measured by one
harness, the rest by another). The second, taken from a clean tree, straddled the
CP1 intensity merge itself — 1,119 lines of runtime change including "Bound the
crush clock in seconds" — so its early scripts measured the old game and its
late scripts the new one. Both were deleted. A twelve-script × three-repetition
capture takes about twelve minutes, which on an active integration day is long
enough for the tree to move underneath it.

The lesson for anyone freezing a baseline here: capture only when the integrator
confirms no merge is in flight, then check afterwards that
`git diff <commit-at-start> HEAD -- src index.html tools/playtest/lib` is empty.
The runner records the game commit, harness-lib hash, dirty-tree state and load
average into every `--json` file precisely so a straddled capture is detectable
instead of silently misleading; it cannot prevent one.

```sh
cd tools/playtest

# gate a variant (repeat per variant flag; --query needs no script edits):
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 \
  --query "&intensity=b" --tag variant-b \
  --baseline scripts/adversarial/baseline-2026-07-30.json \
  --json /tmp/variant-b.json \
  scripts/adversarial/*.json

# re-freeze the baseline after an intentional runtime change (clean tree only):
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 --tag base \
  --json scripts/adversarial/baseline-<date>.json scripts/adversarial/p*.json scripts/adversarial/x*.json
```

The headline gate is one line of that delta table: if
`p4-hold-right-mash-jump` still shows `completed 3/3` with `minMargin` near
18.4, the pressure change did not land.

## CP1 variant regression gate — 2026-07-30, game `0a0310f`

Run per the integrator's standing order, against the merged CP1 variants
(`?pace=hunt|swarm|surge`; anything else is `base`). Three scripts × four paces
× 3 repetitions, default viewport, `--max-runtime-ms 26000`:

```sh
cd tools/playtest
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 --tag gate2-base \
  scripts/adversarial/p4-hold-right-mash-jump.json scripts/adversarial/p3-hold-right-hop-nofire.json \
  scripts/adversarial/x1-crush-clock-and-shove.json
# and the same with --query "&pace=hunt" / "&pace=swarm" / "&pace=surge"
```

| Pace | `p4` mash-jump (the minimal winning policy) | `p3` 800ms cadence | `x1` idle: plane contact / first damage |
| --- | --- | --- | --- |
| pre-CP1 (`39bb6dc`) | **3/3**, 5.37s, margin **18.40** | 3/3, 6.78–7.21s | 6.98s / 11.23s, **died 13.66s** |
| base | **3/3**, 5.25–5.26s, margin **18.38–18.40** | 2/3 | 6.98s / 11.23s, no death in 21s |
| hunt | **3/3**, 4.88s, margin **5.74–5.87** | **0/3** | 2.96s / 3.56s, no death in 21s |
| swarm | **3/3**, 5.74–6.77s, margin **6.37–8.25** | 1/3 | 3.87s / 4.40s, no death in 21s |
| surge | **3/3**, 4.93–5.08s, margin **4.59–6.39** | 3/3, margin 1.01–1.26 | 2.28s / 2.89s, no death in 21s |

**The clock fix landed; the degenerate strategy did not close.** All three
variants tighten the naive policy's crush margin from 18.4 tiles to 4.6–8.3 —
a 2.2× to 4× squeeze — and cut an idle player's grace from 6.98s to 2.28–3.87s.
That is a real and large improvement on F3. But `p4` (hold right, mash Space, no
fire, no route reading) still completes **3/3 in every variant**, and in `hunt`
and `surge` it completes *faster* than at base (4.88–5.08s versus 5.25s).

The variants raised the floor without raising the ceiling: slower or sloppier
input is what they punish (`p3`'s 800ms cadence collapses to 0/3 in `hunt`, 1/3
in `swarm`), while mashing remains both viable and optimal. `surge` comes
closest to the gate's headline condition — 4.59 tiles is 1.8 seconds of slack —
but no variant makes `p4` uncomfortable, and none of them touches the reason it
wins: the chimney wall-pump onto an uncontested top tier (F1, F10).

### CRITICAL regression: on `surge`, holding one key wins the slice

`p1-hold-right-only` — ArrowRight held, nothing else, ever — **completes 3/3 on
`surge`** in 12.43–12.50s. Pre-CP1 that policy died 3/3. So did
`p2-hold-right-hold-jump` (stalled 3/3 before, **completes 3/3** now) and
`p6-hop-1200ms` (0/3 before, **completes 3/3** now, in 5.73s). On `surge`, every
policy in this suite completes, including all three that the pre-CP1 build
correctly rejected.

The mechanism, read straight off the `p1` surge trace (r3, all three alike):

| t | state |
| --- | --- |
| 8.05s | pinned at x=55.65, the dare-dead-end lip, on the pocket floor y=1, margin 2.16 |
| 9.19s | crush hit, hp 3→2, knockback |
| 9.79s | **x=56.65 — inside the solid wall column** (body 56.30–57.00) |
| 10.40s | second crush hit, hp 2→1, margin −0.58 |
| 10.47s | **x=57.65, y=0.13 — through the wall and now below the floor** |
| 10.78–11.46s | x marches 58.65 → 62.65 at **y=0.00**, i.e. conveyed six tiles *inside the terrain* (that ground run's surface is y=3) |
| 11.61s | x=63.37, y=4.02, **hp back to 3** — a hull fallback rescues the player onto a surface past the obstacle, at full health |
| 12.45s | x=72.01 → **VICTORY** |

The damage plane is acting as a tunnel-boring machine and the fallback as a free
rescue: two of the three defects already on the board (crush wall-grind,
fallback self-defeat) compound into a third that is much worse than either
description suggests. The pursuit mechanic now *delivers* an inattentive player
to the exit.

On `base`, `hunt` and `swarm` the same one-key policy does not reach the line
inside the script's 16s window, but it is conveyed to x=55.7 / 62.8–63.2 / 63.5
respectively — 8.5 to 16 tiles short. Those runs end because the window ends,
not because anything stopped them; whether a longer window also completes them
is untested and worth one run before assuming `surge` is the only exposure.

**Suggested owner.** `intensity` (task #10 already covers both root causes) —
but this raises the priority: it is not just "idling is free", it is "idling
wins". Verify against `p1`, not only `p4`, when the fix lands.

### New on this build: HULL FALLBACK makes idling free, and its streak cap self-defeats

Pre-CP1, the zero-input script died at 13.66s (3/3). On `0a0310f` it dies in
none of the twelve variant runs: it ends every run at **full hp with
`attempts` still 1**, having been conveyed from x=27.5 to **x=63.4** — 36 tiles
of involuntary forward progress, 8.6 tiles short of the x=72 win line — while
doing nothing at all.

The mechanism is the newly merged `hullFallback` (`src/sim/player.js:463-524`,
proposal B.1 tier 1): what would have been a death drops the player to a lower
surface and restores hp instead. It has a deliberate ceiling —
`if (player.fallbackStreak >= F.maxConsecutive) scheduleSliceRetry(reason)` —
but the line above it resets the streak on forward progress:
`if (player.x > player.fallbackRecoverX) player.fallbackStreak = 0`. The damage
plane's own shove (F3: 2.6+ tiles/s, no input required) supplies that forward
progress, so **the streak never reaches the cap while the plane is pushing.**
The safeguard is defeated by the thing it is supposed to safeguard against.

CONFIRMED for the outcome (12/12 runs, no death, full hp, 36 tiles gained);
the streak-reset explanation is read from the code, not instrumented.

**Suggested owner.** `intensity` (fallback interaction with the conveyor) with
`score-designer` (B.1's intent — a fallback is documented as "never free", and
against an idle player it currently is). Worth resolving before the operator
judges CP1: they will be told the clock is tighter, which is true, but the
consequence of losing to it got softer.

### Gate part 2 — the fairness scripts across all four paces

3 scripts × 4 paces × 3 reps, plus a narrow-viewport pass and the
previously-failing policies as controls.

**Version disclosure, checked after the fact:** the CP3 transformation merge
(`738a890`, 01:07:56Z — it touched `src/sim/player.js`, `scroll.js`, `level.js`,
`spawner.js` and `render/camera.js`) landed inside this batch's window
(01:01:17Z–01:16:32Z). I classified all 60 runs by `meta.startedAt` against that
boundary:

- **No script × pace group is internally mixed** — every three-repetition group
  fell entirely on one side, so no single claim below rests on blended data.
- **Post-merge (current code), therefore safe as stated:** the critical one-key
  regression (`p1` on all four paces, `p2` and `p6` on `surge`), the
  narrow-viewport aspect pass, `x2`/`x3`/`x5` on `surge`, `x5` on `swarm`.
- **Pre-merge, so the pace-to-pace comparisons below cross a version boundary at
  the `surge` column:** `x2` and `x3` on base/hunt/swarm, `x5` on base/hunt.
  Their direction (margin collapsing as the pace tightens) is consistent across
  both sides, but the exact numbers are not a clean single-build series.

I deliberately did **not** re-run the pre-merge groups immediately: the
intensity defect-fix branch is in flight and will invalidate them again, so
those three scripts are queued for the post-fix-cycle capture rather than being
measured twice. The hound merge (`94913ad`, 01:20:36Z) landed after this batch
ended and affected none of it.

Verdicts against each thing the integrator asked to have verified:

| Question | Verdict | Evidence |
| --- | --- | --- |
| Weapon pop (F6) now a real recatch scramble? | **FIXED** | `CONFIG.capsules.popNoCatchMs` 250 gates the pickup test (`src/sim/capsules.js:83`). Empirically, three runs where the player carried H when a wasp connected show weapon H → **R** and staying R for the rest of the run — the capsule genuinely leaves your hands. Pre-CP1 the same situation read H → H. |
| Wall-clip through solids (F4) fixed? | **NOT FIXED** | 16 of 36 runs push the body more than 0.3 tiles into the `dare-dead-end` column while the plane is in contact (x=56.65, body 56.30–57.00, feet y=1, margin 0.23–0.59), and **all 16 emerge past x=57**. The `p1` surge trace additionally shows passage *below* the floor at y=0.00 for six tiles. |
| Dare-pocket cheese (F5)? | **MATERIALLY BETTER** | `x2` still completes 3/3 at every pace, but the margin collapses from 13.87–18.40 at base to 0.40–2.85 (`hunt`), −0.59–3.07 (`swarm`), −0.59 to −0.12 (`surge`). The round trip is now a real wager; it is no longer free. |
| Dawdle survival (five seconds in the dead end)? | **NOT FIXED** | `x5` completes 3/3 at every pace (11.73–16.50s), margins at or below zero under the variants. The fallback carries it. |
| Conveyor free-rides? | **WORSE** | See the critical regression above. |
| Aspect sensitivity of the seconds-bounded clock (F9)? | **PERSISTS** | `p4` at 800×1000 completes 3/3 with margin 11.12 at base (versus 18.40 at 1280×800) and 5.04–6.66 on `surge` (versus 4.59–6.39 wide). Ratios track the frustum exactly as before, so bounding the clock in seconds did not decouple it from window shape. No route closure narrow — that still holds. |
| Held-jump dead-end pin (F11)? | **FIXED at base** | `x3` completes in 6.69–6.71s with **zero pinned time** at base, versus a 9.6s pin and a 16.78s finish pre-CP1. It reappears under `swarm` (0/3, pinned 9.0–9.5s at x=63.65, a different spot) — so the lip itself is passable now, but the policy still finds new places to jam. |

## Standing order #2 — first pass at the CP2/CP3 fixtures (game `94913ad`)

One sharp attack per new fixture, 3 reps each, rather than a full campaign — the
intensity defect-fix branch is in flight and a full sweep would need re-running
after it merges.

### T1 — transform ritual gate: crush suspension CANNOT be farmed (resisted)

`src/sim/player.js:371` suspends crush damage while `transformBusy()`, and
`src/sim/transform.js` only promotes a ritual from `armed` to `turning` once the
scroll has halted at the threshold *and* RIG has walked into it. That reads like
an off switch: walk up to a seam, stop, and the halted scroll should mean a
halted damage plane.

It is not. `t1-transform-gate-stall` (hold right 3s to reach the first
threshold, then zero input for eighteen seconds) **died 3/3, four deaths per
run**, closest margin 0.30–0.33, never getting past x=35.66. The `armMaxMs`
timeout on the armed state does press, and the plane keeps arriving. Refusing to
enter a seam is not a safe hiding place, and the transform fixture's retry loop
handled four consecutive deaths cleanly with no console errors.

```sh
node scripts/adversarial/repeat.mjs --reps 3 --max-runtime-ms 26000 \
  scripts/adversarial/t1-transform-gate-stall.json
```

### H1 — a lone houndframe never meets the naive winning route

`h1-hound-facetank` runs the known-winning p4 policy (hold right + mash Space)
plus held fire against `?hound=1`, never reading a plant and never leaving a
lane. It **completes 3/3 in 4.28–5.36s with zero deaths and zero damage taken**,
crush margin 18.4 — i.e. slightly *faster* than the same policy on the base
slice, and completely untouched.

The reason is F10 again, not i-frames: the hound paces deck lanes while the
winning policy is on the roof at y=12.76–13.12. It never enters the hound's lane
at all. This corroborates the operator's own CP2 note ("a lone hound poses no
threat — placement/layout iteration needed, not stat buffs") from the opposite
direction: the problem is not the hound's strength, it is that the fixture's
dominant route does not pass through anywhere a hound can stand.

**The i-frame facetank question is therefore still open**, and testing it needs a
policy that stays *grounded* through the hound's lane. That is buildable from
`x6-step39-slot-sweep`: its 16ms tap is the only input I have found that puts a
player on the low floor, so "x6's slot pass + hold right + hold fire, never
leaving the deck" is the script that would actually answer it. Named here as the
next concrete attack rather than guessed at.

**Script-error disclosure:** the first version of `h1` held right and fire with
no jump at all, which cannot clear the column-39 step (F8) — it jammed there 3/3
at x=38.65 and never reached the hound, so it measured nothing about the hound.
It was replaced by the version above. Its one incidental result: negative crush
margins (−0.55 to −0.60) re-confirming the wall-grind defect on the hound
fixture too.

### H3 — the grounded facetank is not reachable by open-loop scripting (and that is a finding about F8)

`h3-hound-deck-facetank` was the script I named as the way to answer the i-frame
question: hold right and fire, jump exactly once with a 16ms tap to thread the
column-39 slot, then never leave the deck. It **failed 3/3** — pinned at x=38.65
for 2.2s, then shoved past the step by the plane (the wall-grind again, margins
−0.49 to −0.52), ending stalled at x=49.34 with the hound never engaged.

The reason matters more than the failure: **the 16ms tap passed 3/3 when I
measured it pre-CP1 and passes 0/3 now.** Nothing about the slot changed; the
CP1 movement and pace work changed *when the player arrives at it*, so a tap
pinned to a fixed 1400ms no longer lands inside the one-to-two-frame window.
F8's severity should be restated accordingly: the low route is not merely gated
behind one frame of precision, it is gated behind one frame *relative to a
moving arrival time*, which no fixed-time script can hit twice across builds.

Two open-loop attempts is enough to conclude that **the i-frame facetank
question needs closed-loop control** — a bot that watches `traversalState`/`vx`
for the pin and then taps — and that this harness cannot answer it as built.
Recommending against a third scripted attempt.

### T2 — transform seams did not break, but progress variance is large

`t2-transform-seam-rush` (hold right + mash Space for twenty seconds through
every threshold) produced **no console or page errors, no softlock, and no
observable seal crossing** across three runs. The rituals held.

What it did show is spread: three identical runs reached `maxX` **112.11 / 83.65
/ 87.30** and recorded **1 / 3 / 3** deaths. That is a 28-tile difference in
progress from byte-identical input on one build. Some of that is the death count
compounding, but the first divergence precedes it. Flagging for the
transformation lane as a determinism signal rather than a defect claim — I did
not isolate a cause, and `?slice=transform` has no telemetry for ritual state or
seal position, so a scripted attack currently cannot see the thing it is
attacking.

**Hook request (transformation/harness):** expose ritual state and
`transformSealX` in the `?testapi=1` snapshot. Without them, threshold clipping
and ritual skipping can only be attacked blind — I can tell you nothing broke,
but not that nothing *can*.

### Both transform attacks re-run on the rework (`a89e93d`)

The rework changed fixture geometry, not just presentation, so the T2 numbers
above are superseded by these. Both scripts are geometry-agnostic (they only hold
right and mash), so neither needed retiming.

**T1 holds exactly.** Died 3/3, four deaths per run, `maxX` 35.66, margin
0.28–0.31 — the same figures as before the rework, to two decimals. The gate and
arming machinery are unchanged as the integrator predicted, and refusing to enter
a seam is still not a hiding place.

**T2: the naive policy climbs the new interior further than it climbed the old
one.** `maxX` rose to **132.94 / 119.77 / 119.77** (was 112.11 / 83.65 / 87.30)
and `maxY` to **10.58–10.74** (was ~8.3). So the reworked interior — a
0.42-tiles-per-tile grade with six deck step-ups and roughly 25 tiles of on-foot
ascent — is traversed by hold-right-and-mash, the same policy that clears the
traversal lattice. The new geometry reads as real climbing in the altitude trace,
which is the point of the rework and it works; what it does not yet do is *demand*
anything the naive policy lacks. Worth knowing before the on-foot ascent is
judged as a difficulty increase: it is an altitude increase.

Determinism improved but is not clean: two runs landed identically at 119.77 and
one at 132.94, with deaths 1 / 3 / 1 and the longest pin at wildly different
places (x=60.45 / 30.45 / 65.15). Still a signal for the transformation lane
rather than a defect claim, and still un-diagnosable from outside without the
ritual-state hook above. No console or page errors in any run.

### A1–A4 — hound density and aspect passes on both new fixtures (`a89e93d`)

**The hound roster is invisible to a roof-runner, and hound=3 at swarm density is
not unwinnable.** The question combat asked was whether stage 3's
add-composition creates unwinnable spawn overlaps at swarm's density. It does
not — for this policy it creates nothing at all:

| Config | `p4` mash-jump | `h1` mash + held fire | Crush margin |
| --- | --- | --- | --- |
| `hound=3&pace=swarm` | completed 3/3, 6.77–6.78s, **0 deaths** | completed 3/3, 4.10–5.13s, **0 deaths** | 6.22–6.45 |
| `hound=3` (base pace) | completed 3/3, 5.23–5.24s, **0 deaths** | completed 3/3, 4.09–5.36s, **0 deaths** | 18.40–18.42 |

Reading those two rows against each other isolates the variables cleanly:
**adding the full hound composition changes the naive policy's crush margin by
0.0 tiles at base (18.40 → 18.40) and its clear time by −0.01s (5.25 → 5.24).**
Every tile of the margin squeeze in the top row comes from `swarm`, none from the
hounds. No run took a single death in twelve attempts at maximum roster density.

This is not evidence the encounter is easy for a human — it is evidence the
encounter is *not on the route this policy takes*, which is the same roof-line
finding as F10 and h1, now quantified at full density. Combat's 2.5 cycle can
treat "a lone hound poses no threat" as generalizing to the whole roster until
the roof is contested.

**Aspect, hound fixture: no trap.** `p4` at 800×1000 with `hound=2` completes 3/3
in 4.78–4.79s at margin 11.08–11.12 — the same figures as the traversal slice at
that viewport, so the hound changes nothing about aspect behaviour.

**Aspect, transform fixture: a real asymmetry.** The seam rush at 800×1000
reaches `maxX` **145.04 / 146.07 / 146.00** and **completes 2 of 3 runs**
(16.23s, 18.76s), versus `maxX` 119.77–132.94 and **0 of 3** completions at
1280×800 inside the same twenty-second window — about 13% more progress on the
narrower window, while the crush margin is *tighter* there (5.34–5.71 versus
12.69–13.03). Whether a transform run finishes at all currently depends on
viewport shape. Flagged for the transform lane; I did not isolate the mechanism,
though the portrait camera pullback (`traversalCameraDepth` /
`portraitMinAspect`) changing the follow lead is the obvious suspect.

**Harness bug found while checking that claim (owner: harness-engineer).**
`computeOutcome` in `tools/playtest/lib/metrics.mjs` recognizes only the
traversal slice's overlay: `trace.some((s) => s.ovTitle === 'TRAVERSAL CLEAR')`.
The transform slice's victory overlay reads **`BREACH CLEAR`**, so a completed
transform run is labelled `not-completed` — or `died`, if it also recorded an
attempt. The run above shows 62 consecutive `state === 'VICTORY'` samples from
t=16.29s while the report's own outcome field says `not-completed`. Anyone gating
`?slice=transform` on `outcome.result` today is reading a false negative; the
`victorySec` field in this lane's runner is derived from `state`, which is why
the completions were visible at all.

## Intensity-fix re-gate — the fix works on every criterion I could measure

Runs valid on the fix build (started after `726207c`, before the movement merge
`9a530ab`): 26 runs across hunt, swarm and surge.

| Acceptance criterion | Verdict | Evidence |
| --- | --- | --- |
| `edgeMargin` never negative | **PASS** | 0 of 26 runs below −0.05. The floor is exactly **0.40** (= `CONFIG.edges.margin`) in every run. Before the fix, −0.58 to −0.60 was routine. The wall-grind is closed. |
| `p1-hold-right-only` must fail on surge | **PASS, emphatically** | died 3/3 with **attempts = 5** per run. Before the fix it completed 3/3 in 12.4s. One held key now dies repeatedly instead of being delivered to the exit. |
| `p2-hold-right-hold-jump` must fail on surge | **PASS** | stalled 2/2 (the third repetition's report is missing — the batch was cut short, see below). |
| `x1` must reach a terminal state on every pace | **PASS on hunt and swarm** | died 3/3 on each, **attempts = 3** per run. Before the fix, twelve runs across four paces produced zero deaths and rode the conveyor 36 tiles at full hp. |
| Straddled trio re-measured | **hunt and swarm done** | `x3` on swarm now stalls 3/3 at margin 6.21–6.44 — the lip pin persists as a *stall* but no longer tunnels. `x5` dawdle on swarm dropped to 1/3 completions (was 3/3), so dawdle immunity is materially reduced. `x2` still completes 2–3/3 but at margins of 0.40–7.04. |
| base pace, surge `x1`/`p6`, `view=far` probe | **NOT MEASURED** | base straddled two merges; the rest were lost when the batch aborted (16 `FAILED`/`fatal` lines in its log, first appearing after `9a530ab` landed). |

The manual conflict resolution reads correctly to me as well as measuring
correctly. `fallbackEarnedTiles` only accumulates in the non-pinned branch
(`src/sim/player.js:406`), so plane-driven displacement can no longer reset the
streak safeguard — that is the self-defeat closed at its root rather than
papered over. One scope note for whoever writes the assertion: the six-face
branch of the crush deliberately snaps RIG to the wall's *outside* face
(`player.x = Math.floor(player.x + player.hw) - player.hw - 0.001`), which sits
behind the plane by design, so **"edgeMargin ≥ 0" is a fixture-scoped invariant,
not a global one.**

## Why four captures in a row were invalid, and the fix

Four separate captures in this lane were invalidated by merges landing
mid-batch: the harness sampler/driver edit, the CP3 merge, then the far-default
plus crush-fix pair, then the movement merge. That is not carelessness at either
end — it is arithmetic. A twelve-script × three-repetition capture takes about
fifteen minutes, `run.mjs`'s built-in static server serves the **live working
tree**, and on an active integration day the tree changes faster than that.
Announce-before-merge helps a human notice; it cannot make a fifteen-minute
capture atomic.

The fix is to stop serving the working tree. `repeat.mjs` now takes
`--base-url`, so a capture can target a static server rooted at a *pinned* git
worktree:

```sh
git worktree add /tmp/hb-pin <sha>
(cd /tmp/hb-pin && python3 -m http.server 8749 &)
node scripts/adversarial/repeat.mjs --base-url http://127.0.0.1:8749 --reps 3 <scripts...>
```

Verified end to end against a worktree pinned at `726207c`. A capture taken this
way describes exactly one build no matter what merges during it, and the commit
recorded in the `--json` provenance becomes the pin rather than a guess about
which build was live.

**One more comparability trap, from the same merge window.** `79f8d88` made
`far` the default view. The same policy on the same fixture reports
`minEdgeMargin` **18.40 on `near`** and **35.44 on `far`** — the frustum is
wider, so every margin number in this report from before that commit belongs to
a different camera. Any cross-build margin comparison from here on must pin
`?view=` explicitly; the earlier tables should be read as `view=near` data.

## Single best next action

*(Original recommendation, now partly implemented — the CP1 variants bounded the
clock as suggested. Superseded by the line below.)*

~~Bound the crush margin in *time*, not in screen widths~~ — done in `bbb1c9c`,
and it worked: 18.4 tiles down to 4.6–8.3 across the variants.

**Contest the top tier.** The clock is no longer the binding constraint on the
naive policy; the uncontested roof is. `p4` still wins 3/3 under every variant
because nothing occupies y=10–13.9, where it spends its whole run — the fixture's
wasps only dive at targets *below* them (F10), so the fastest route remains the
safest one. Until something threatens the chimney wall-pump or the roof run,
tightening the clock will keep making mashing *more* optimal rather than less,
because it punishes every slower policy first (`p3`: 3/3 → 0/3 in `hunt`). The
second item, cheap and independent: stop the plane's shove from resetting
`fallbackStreak`, so idling cannot ride a fallback loop 36 tiles forward at full
hp.
