# The VICTORY box: a reflex policy stops at wave gate 2, and here is the arithmetic

T-019. Prepared by the `gameplay-engineer` lane on `task/T-019`, against
`main` pinned and served locally (`python3 -m http.server 8771` from the
worktree), `tools/playtest/run.mjs --deterministic`, real Chrome, `testapi`
fidelity, 1440×900.

**Verdict: no bot run reaches VICTORY, and this task did not get one.**
Thirteen policy variants (plus a latency control) over 49 runs land on the same
wall — wave **gate 2**, scroll **140 of 415**, at about **50 s**, all three
lives spent. Exactly one run in 49 got past it (scroll 165, gate 3 in sight,
64 s) and then died the same way. The last delivery box has to be answered by
an **operator run**; the packet is §6.

No game file, wave gate, or movement constant was touched: `git diff
main...HEAD -- src/` is empty, and pathcheck now asserts that the six-face
policies contain no absolute position, scroll distance or clock time, so
"the bot won" can never quietly mean "the script knew where to jump".

## 1. The wall, measured

Every variant is the same shape of policy — `&&`-only reflex rules over
`threat.*` / `terrain.*` relative geometry (the T-018 grammar) — differing by
one idea each. All runs `--deterministic`, 1440×900, same served tree; the
batch runs added `--stop-on-game-over` inside a 140 s window, and every one of
them ended at GAME_OVER far inside it. "Survived" is the sim clock at the last
sample, i.e. how long the run stayed alive.

| variant | what it changes vs the shipped aimed policy | runs | survived (s), sorted | median | scroll |
| --- | --- | --- | --- | --- | --- |
| `six-face-aimed-run` (T-018's, the baseline) | — | 5 | 46.7 / 46.7 / 47.5 / 49.8 / 52.8 | 47.5 | 140 ×5 |
| same, `--sample-ms 40` | halves reaction latency — a control, not a policy | 3 | 44.1 / 50.2 / 50.2 | 50.2 | 140 ×3 |
| `expA-nohop` | deletes the free hop | 1 | 45.5 | — | 140 |
| `expB-v1` | grounded rewrite: dive-angle aim, terrain-driven jumps | 1 | 33.9 | — | 103 |
| `expC-pace9` / `expD-pace24` | pace servo: hold a standoff from the crush plane instead of riding the right clamp | 1 + 1 | 41.5 / 45.4 | — | 133 / 140 |
| `expE-v3` | grounded rewrite + personal space + early steep-dive dodge | 3 | 29.7 / 30.3 / 50.4 | 30.3 | 75–140 |
| `expF-v4` | `expE` + `pinned && terrain.stepUp>0.5` | 3 | 30.0 / 49.2 / 50.2 | 49.2 | 75–140 |
| `expG-step` | shipped + the step guard alone | 3 | 48.1 / 50.1 / 51.9 | 50.1 | 140 ×3 |
| `expH-dodge` | shipped + the steep-dive dodge alone | 3 | 35.0 / 48.3 / 51.9 | 48.3 | 97–140 |
| `expI-space` | shipped + personal space alone | 3 | 52.0 / 52.2 / 58.8 | 52.2 | 140 ×3 |
| `expJ-strafe` | shipped + a `strafe`-locked 45° servo (§3.2) | 10 | 48.8 / 49.0 / 49.1 / 49.3 / 49.4 / 52.8 / 53.7 / 56.2 / 58.2 / **64.4** | 51.1 | 140 ×9, **165** ×1 |
| **`six-face-spaced-run`** (shipped by this task) | baseline + personal space + step guard | 7 (+1 from the committed file: 52.0) | 50.2 / 52.2 / 52.9 / 53.6 / 54.4 / 54.9 / 55.1 | **53.6** | 140 ×8 |
| `expL-strafe-space` | strafe servo + personal space + step guard | 4 | 33.3 / 45.1 / 49.3 / 49.8 | 47.2 | 75–140 |

Three things to read out of that table.

**Scroll 140 is not a coincidence.** `HALT_S[1] = 140` — the scroll freezes
there for wave gate 2 and does not move again until the wave is dead, so
"scroll 140" is literally "reached gate 2, never cleared it". Gate 1 was
cleared **45 times out of 49** (median 11.3 s held, range 7.6–18.2, with 5–7
bodies present where the wave authors 4). Gate 2 was cleared **once in 41**
(11.9 s, 9 bodies present where the wave authors 5); the other 40 runs ended
inside it, a median 5.3 s after it armed. **Nothing ever reached gate 3.**

**Nothing moved the wall.** Deleting the hop, adding a pace servo, adding
personal space, adding a dive dodge, fixing the terrain probe, using the
game's own strafe lock, doubling the sample rate — every variant's median sits
in a 30 s…54 s band whose top half is indistinguishable run to run, and the
gate that ends the run never changes.

**The best of them is worth about 10 %.** `six-face-spaced-run` (median 53.6 s
over 7 runs, all seven inside 50.2–55.1) beats the shipped aimed policy's
47.5 s. It is committed as the new best-known reflex policy, and it is still
nowhere near the run.

## 2. Why: the exchange rate

The run's requirements are authored and countable.

- **Bodies that must die.** A gate holds the scroll until every *gating*
  hostile in the arena is dead (`onHostileRemoved`, `src/sim/wavegate.js`).
  The six waves author `3 + k` each: **4 + 5 + 6 + 7 + 8 + 9 = 39**. On top of
  that, ambient spawns drift into the arena before it arms (I-022, filed by
  T-018 and reproduced here on `main`): the HUD's own body count peaked at
  **5–6 at gate 1 (4 authored)** and **7–9 at gate 2 (5 authored)**. Taking
  the measured +1…+4, a full run has to kill roughly **50–55 gating bodies**.
- **Damage budget.** 3 hp × 3 lives = **9 hits**, no heal anywhere in the run.
- **What the bot actually trades.** Across all 49 runs: **0.6–2.3 kills per
  hit taken**, median ≈ 1.3. (Every run spends exactly 9 — that is what ends
  it.)

So the requirement is about **6 kills per hit** and the measured rate is
**1.3**. The gap is a factor of four to five, not a tuning margin.

The same gap in time: 415 scroll tiles at 4.3 tiles/s is **96.5 s** of
scrolling, plus the gates, which freeze it. Measured across 45 cleared gate-1
fights and the single cleared gate 2, a gate takes a **median 11.3 s** (range
7.6–18.2) for 5–7 bodies — about 2 s per body — so the six waves, at the body
counts they actually field, are roughly **100–130 s**. A finished run is
therefore **200–230 s** of PLAYING time. The best policy's median run survives
**53.6 s**; the longest run of the whole task, on any variant, was **64.4 s**.

**This is not a difficulty claim.** Nothing above says the run is too hard, or
too long, or that a wave should be smaller — a bot is not a fun oracle, and
the numbers here describe a reflex policy's ceiling, not a player's. The
operator questions in §6 are the ones that *are* about difficulty, and they
are left open on purpose.

## 3. Four structural limits, with per-tick evidence

### 3.1 Aiming and dodging are the same key

`computeAim` (`src/sim/player.js`) resolves the shot heading from the held
direction pair. There is no aim axis: to point the gun at something you must
walk toward it, and to dodge you must point the gun away. A human resolves
this in *time* — shoot at range, dodge late — which is a plan. A reflex rule
has one tick's geometry and must pick.

The dive census (`analyze-run.mjs`) is where this shows up as a number. Every
`cruise→dive` inside the 14-tile corridor, classified by the angle the diver
came in at — because that angle *is* which of the three 8-way rays could
answer it. **453 dives over 22 runs:**

| dive angle | the only ray that points at it | dives | ended in contact | diver killed mid-dive |
| --- | --- | --- | --- | --- |
| shallow (slope ≤ 0.5) | level — free, it is the default aim | 334 | 16 % | 22 % |
| ~45° (0.5–2.2) | the diagonal: `up` **and** the direction *toward* it, i.e. closing on it | 66 | 20 % | 18 % |
| steep (> 2.2) | vertical: `up` and **no horizontal key**, i.e. standing still under it | 53 | 21 % | 11 % |

Read the last column first. **Four dives in five end with the wasp alive.** It
recovers, climbs back to its lane, and dives again 1.1 s later
(`gateDiveCooldownMs`) — and the gate does not open until it is dead
(`onHostileRemoved`). Dodging is survival, not progress; only the kill counts,
and a kill is 4 hp at 130 ms a shot, i.e. **520 ms of *sustained* fire on one
target**.

The steep row is where the axis conflict bites hardest: the only ray that
points at a near-vertical dive requires standing still, and standing still is
precisely what makes that dive land. `expC-pace9` shows both halves in one
run — three grounded hp losses with a diver at slope 2.6–2.7 overhead — and
when the dodge rule was made to fire instead (`expE`/`expF`), the dive stops
connecting and nothing dies. Answering the beat and punishing it are mutually
exclusive commands on one axis.

### 3.2 The ceiling on "the gun points at something" is a position problem

`analyze-run.mjs` reports, per tick, both *did the active ray have a target*
and *would any of the three 8-way rays have had one from where RIG is
standing*. That second number is the ceiling a perfect ray-chooser could hit
without moving anywhere different:

| phase | some ray available | policy on target |
| --- | --- | --- |
| inside a gate | 25–36 % of ticks (16 runs) | 18–31 % |
| open route | 5–8 % of ticks | 5–9 % |

The policy already converts most of what it is offered. The missing two thirds
are ticks where **no** ray out of RIG's current position touches anything —
which is a statement about where RIG is standing, several ticks earlier, not
about which key it presses now. That is the definition of planning.

`expJ-strafe` is the strongest attempt to beat it inside the grammar: use the
game's own `strafe` key (`ShiftLeft`, `KEYMAP` in `src/main.js`), which
freezes the aim vector while you move, to hold a 45° line on a target while
retreating to keep it there — a bang-bang servo on `threat.upSlope` around 1.
It produced the only run that cleared gate 2 (21 kills, scroll 165) — and over
ten runs a median of 51.1 s, no better than the baseline's 47.5 s and
below the 53.6 s of the far simpler personal-space policy. One tail is not a
capability. (Its aim coverage is
deliberately *not* reported: the analyzer reads the aim off the held keys, and
a frozen aim makes that wrong. Stated in the tool, not hidden.)

### 3.3 Simultaneous threats have no arbitration

`hold` rules OR together per key code. Two rules that disagree about which way
to run both fire, `left` and `right` are both down, `h = 0` in `computeAim`,
and RIG stands still with its old facing. There is no priority, no "nearest
first", no tie-break — by design, because the grammar is meant to stay
reviewable.

Measured across 16 runs: **0–9.9 % of ticks with a hostile in view**, and the
variants that hold a second opinion about direction are the ones that get it
(the shipped-plus-personal-space policy runs 4.8–9.9 %; the T-018 policy, which
has only one directional idea at a time, runs 0–2.2 %). A wave gate is exactly
the situation that produces it: 5–9 bodies, several inside corridor range, on
both sides at once. Note what the trade is — the policy that stands still more
often is also the one that survives longest, because the alternative was
walking into the body it was arguing about.

### 3.4 No memory, by construction

`tools/pathcheck.mjs` asserts that neither `policy.mjs` nor `threat.mjs`
carries module-level mutable state, and that `deriveThreat` is a pure function
of one sample. So a policy cannot: count down the 1200 ms of i-frames it just
earned and spend them pushing; commit to one wasp for the four rifle hits it
takes to kill it (130 ms cadence, 4 hp — 520 ms of *sustained* fire on one
target); or run a two-beat plan like "back off, re-open the angle, come back".
Every one of those is what the missing 5× looks like in practice.

This is not a defect to fix in the grammar. A layer with memory, target
commitment and lookahead is a planner, and a planner's run says nothing about
whether a *player* can win — which is what the delivery box is actually
asking.

## 4. What this corrects in the T-018 finding

T-018 wrote: "the bot's damage log showed **every single hp loss happening
while airborne**", and drew a hop-gating clause from it. That correlation does
not survive a controlled comparison.

The shipped policy is airborne **84–90 %** of its playing time, so "every hp
loss was airborne" is what chance produces. The variants that deleted the free
hop are airborne **32–44 %** — and they take the same 9 hits, in the same
~50 s, at the same gate (`expA` 45.5 s, `expF` 49.2/50.2 s, vs shipped
46.7–52.8 s). Their damage splits roughly with their airborne fraction (3–5 of
9 airborne).

Being airborne is exposure, not cause. Two real mechanisms sit underneath it,
both worth keeping:

- A jump apex (2.72 tiles) crosses the low wave lane (2.6 above the deck), so
  a hop *into* a cruising body is a real collision — and equally, a wasp only
  dives when `player.y + 1 < e.y`, so being airborne **suppresses** dives from
  the lane you are level with. The two effects largely cancel; the measurement
  says they do.
- The `pinned` predicate says RIG is jammed while trying to run, but not why.
  Answering every pin with a jump makes the bot pogo against things that are
  not steps — including the screen's own right clamp, which during a gate sits
  at the corner pivot. That is now `terrain.stepUp`, and it is worth having
  even though it did not move the wall.

## 5. What was added to the harness

All of it dev-only; the game is untouched.

- `threat.diveSlope` / `diveAdx` — the dive mark's angle, completing the
  `(adx, slope)` pair the nearest mark and up-mark already had. A dive is the
  one hostile motion the sim aims *at* RIG (heading set from the player's
  position once, then frozen), so the ray that answers it is the ray that
  points at it.
- `terrain.landDist` / `landY` / `stepUp`, and a `gapDist` that starts the
  scan at RIG's own column — mid-fall it now reads 0 instead of "a hole is
  right in front of me", which was the same small number as the opposite
  situation.
- `analyze-run.mjs` — the per-tick forensics every number above comes from:
  damage attribution, gate timeline with the HUD's own body counts, aim
  coverage per phase, the rule-conflict census, the dive census, and
  `--brief` for one markdown row per run.
- `--stop-on-game-over` — a dead six-face run reports in ~50 s instead of
  sampling a frozen world for the rest of a four-minute window. Off by
  default.
- `scripts/six-face-spaced-run.json` — the best-measured reflex policy: the
  T-018 aimed policy plus personal space and the step guard. It is the one
  variant whose whole distribution beat the baseline (7 runs, 50.2–55.1 s), and
  it still dies in gate 2 every time. Committed evidence for it, for the
  baseline, and for the single run that cleared gate 2 is under
  `tools/playtest/reports/t019/`.
- pathcheck: the new marks are asserted on synthetic geometry, and every
  `six-face-*.json` policy is held to relative geometry — no `x`, no
  `scrollX`, no `gameMs`, and static moves may only hold fire. A scripted win
  now fails the gate instead of passing review.

## 6. Operator packet — the box needs a human run

**URL (default six-face run, no flags):** `http://127.0.0.1:8741/index.html`
(serve with `python3 -m http.server 8741` from the repo root).

**What would close the box:** one operator run of the shipped six-face route,
played to VICTORY or to wherever it ends, with the ending noted (which gate,
how many lives left). That is the evidence the delivery box wants and the one
thing a bot cannot supply.

Questions, in the order a run answers them:

1. **Gate 2 is fought as 7–9 bodies where the wave authors 5** (ambient
   stragglers drift into the arena before it arms — I-022). Playing it, does
   the second gate read as the intended step up from the first, or as a spike?
2. **The whole route is 9 hits for ~50 gating bodies.** How many hits do you
   spend clearing gates 1 and 2 — and from that, does a six-gate run feel like
   it has the life budget it needs, or does it want a heal, a checkpoint, or
   fewer bodies?
3. **The corner arena is about 14 tiles wide** (crush plane behind, the pivot
   clamp ahead) while 5–9 bodies dive into it at 10 tiles/s. Does the fight
   feel like it has room to move — pillar 2 — or like a box you win by
   trading hp?
4. **The wasp still has no telegraph** (T-018's question 3, unanswered):
   `cruise → dive` on the same frame, at gate range 9 and a 1.1 s cadence.
   Fair, or does it want the `tell` the rest of the roster has?
5. **Do gates 3–6 assume a weapon?** A carrier drop is the only upgrade path,
   and it is incidental — the bot picked up LASER twice in 49 runs, by
   accident (it shot a carrier that happened to be on its firing line, and the
   capsule happened to drift into it). If SPREAD/LASER is the intended answer to eight or nine bodies,
   the delivery of it may need to be something the player can choose to go get.

## 7. Reproduce

```sh
# serve the tree under test (a pinned worktree, so a batch describes one build)
cd <worktree> && python3 -m http.server 8771 &

cd tools/playtest
# the best-measured policy (this task's), and the T-018 baseline it beats by 10%
node run.mjs scripts/six-face-spaced-run.json --base-url http://127.0.0.1:8771 \
  --deterministic --stop-on-game-over --max-runtime-ms 145000 --out /tmp/spaced
node run.mjs scripts/six-face-aimed-run.json --base-url http://127.0.0.1:8771 \
  --deterministic --stop-on-game-over --max-runtime-ms 145000 --out /tmp/aimed

node analyze-run.mjs /tmp/spaced            # full per-tick breakdown
node analyze-run.mjs --brief /tmp/spaced /tmp/aimed   # one row each, for batches
```

`node tools/pathcheck.mjs` covers the new marks and the anti-scripting guard.
