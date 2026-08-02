PASS

QA playtest gate for T-043 (wasp aim-lock + squad stagger), worktree
`.claude/worktrees/T-043`, branch `task/T-043`, HEAD `a2e6d97`. Read
`docs/LANE-BRIEF.md`, `reports/tasks/T-043/build.md`, and
`reports/tasks/T-043/review.md` (APPROVE) before starting. All raw evidence
this report cites is committed under `reports/tasks/T-043/qa-runs/` in this
worktree.

**PASS is on mechanism/regression/durability. The dominant, must-not-miss
finding is a real, measured difficulty/consistency shift (§2) that the
build report and review both only sampled thinly — I re-measured it at
N=12 and it is large and reproducible. Per the dispatch's own framing
("If it got easier, that is a finding for the operator, not automatically
a FAIL"), I am reporting it as evidence for the operator/integrator to act
on, not failing the gate over it — but it should not be merged past without
someone consciously deciding what to do with it.**

## Setup

- Servers: **8761** (this branch, `a2e6d97`) and **8762** (pre-change pin,
  `git merge-base main HEAD` = `69e1f90`, via `git worktree add
  /tmp/hb-pin-before 69e1f90`), both `node tools/serve.mjs <port> --root
  <tree> --quiet`. Neither 8741-8747 was touched (checked
  `lsof -iTCP -sTCP:LISTEN` before binding). Both killed after use, confirmed
  by a refused `curl`; `/tmp/hb-pin-before` worktree removed.
- `node tools/pathcheck.mjs` in the worktree: **1760 passed, 0 failed** —
  matches build.md and the reviewer's independently-verified count exactly.
- `index.html?selftest=1` on 8761: **`SELFTEST PASS (29 checks)`** (Playwright
  `page.title()` read directly — `run.mjs`'s own report doesn't capture
  `document.title`, so this was checked out-of-band).
- Smoke set: `scripts/mid-route.json` and `scripts/transform-slice.json`,
  `--deterministic --base-url http://127.0.0.1:8761`. Both `completed`,
  `pageErrors: []`, `consoleErrors: []`. Evidence:
  `reports/tasks/T-043/qa-runs/smoke-mid/`, `.../smoke-transform/`.

## 1. Determinism and the squad clock

**Code-level: no leaked clock.** `clearHostiles()` resets `lastWaspLockMs =
-Infinity` (src/sim/hostiles.js diff, confirmed same as review). `gameMs`
itself never resets except at page load (`src/sim/time.js`, "only advances
while PLAYING") — by design, not a bug — so a within-session restart is the
right test, not a fresh-clock test.

**In-session restart, tested directly** (not via `run.mjs`, which has no
restart primitive — a small ad-hoc Playwright script driving
`?testapi=1` on 8761): held right with no dodging until `state===GAME_OVER`
(`gameMs=9800.5`), sent `KeyR` down/up, confirmed `state` flipped to
`PLAYING` at `gameMs=10134.7` with a fresh `hostiles.length===2`, kept
holding right, and observed the **first post-restart wasp commit at
gameMs=11493.0 — 1358ms after resuming input, not delayed, not stuck, not
skipped.** No `pageErrors`. This directly answers the dispatch's ask: the
clock resets cleanly across a real in-page restart and a wasp can commit
normally afterward.

**Byte-identical replay: no, and this needs an honest, larger-sample
answer than build.md's N=3 gave.** 12×`hound-wasp-squeeze.json`
(`?slice=traversal&hound=2`) `--deterministic` on each tree
(`reports/tasks/T-043/qa-runs/squeeze-{before,after}/run-*.report.json`):

- **BEFORE** (`69e1f90`): wasp first-commit `gameMs` spread across 12 runs
  is 1253.0–1272.8 (19.8ms spread, all one basin). `hitsWithoutDeath` is
  **1/1 in all 12 runs (12/12 = 100%)** — 8 of 12 attribute the hit to the
  wasp's dive (airborne, hp-drop ~1402–1424), 4 of 12 to the hound's charge
  (grounded, hp-drop ~1563–1574) — so the *which-body-hits* fork already
  existed pre-T-043 (not something this task introduced), but the *outcome*
  (always exactly 1 hit) never varied.
- **AFTER** (`a2e6d97`): wasp first-commit `gameMs` is now **bimodal**:
  6 runs at ~1201–1206, 6 runs at ~1248–1270 (a ~60ms gap between the two
  clusters that BEFORE never showed). More importantly, **`hitsWithoutDeath`
  is 1 in only 6 of 12 runs — the other 6 register hp unchanged at 3 for the
  entire run (`min(hp)==max(hp)==3`, verified directly from the trace, not
  inferred).** Hit rate: **6/12 = 50%**, down from BEFORE's 12/12 = 100%.
  Zero `pageErrors`/`consoleErrors` in all 24 runs either side.
- Tracing the mechanism on a matched pair (after-run1, hit, vs after-run2,
  no-hit): both wasps commit within 4ms of each other and the two
  trajectories track within 0.03 tiles of each other up to ~1424ms — then the
  **hound's** own `tell`→`charge` transition (code this task never touches)
  fires at 1499ms in run1 vs 1431ms in run2, a ~68ms fork that compounds
  through physics into a clean miss in run2. This is the same class of
  effect the harness's own README already documents and does not fully
  explain (`--deterministic` fixes *dispatch* jitter, not delivered-frame
  jitter — see README "Deterministic injection mode" and honesty items 8/11,
  and the `t2-transform-seam-rush` case study). **It predates this task** —
  BEFORE already shows the same knife-edge forking which body lands the hit
  — but AFTER is the first time, in 12 tries, that the fork lands somewhere
  that drops the hit rate below 100%. The 220ms freeze changes exactly the
  relative timing between the wasp's real-time arrival and the player's
  jump arc that this knife edge is sensitive to, so this is best read as
  *this task's change moving where a pre-existing harness/engine
  sensitivity lands*, not a new leak this task introduced.
- Full-game scale, 3×`six-face-aimed-run.json --deterministic
  --stop-on-game-over --max-runtime-ms 90000` each side
  (`reports/tasks/T-043/qa-runs/sixface-{before,after}/`): BEFORE is tight
  (kills 11/11/14, `scrollX` **140/140/140** — every run hits the documented
  gate-2 ceiling exactly). AFTER is markedly wider (kills 10/11/**23**,
  `scrollX` **117.7**/140/**205** — one run stalls *short* of the old
  ceiling, another **breaks past it** to 205 with nearly double the kills and
  a 75s run vs BEFORE's tight 51–53s band). All 6 lives-spent = 3/3,
  0 `pageErrors`/`consoleErrors`/`teardownErrors`. A plausible, evidence-
  grounded mechanism (not asserted as certain): a full six-face run has many
  concurrently-eligible wasps sharing one clock, so which wasp wins the race
  for `lastWaspLockMs` at any instant is itself timing-sensitive in a way the
  old, independent-per-wasp check never was — compounding the pre-existing
  CDP-delivery sensitivity into a wider spread than the single-wasp squeeze
  shows alone.

## 2. Difficulty — measured, both directions, larger sample than build.md/review had

Build.md's own six-face evidence was 1 run/side and said so explicitly;
review flagged the kill-count trend as "possible, not blocking." My N=12
squeeze sample is a real statistic, not a single run, and it is
unambiguous: **a fixture that punished 12/12 identical deterministic
attempts before this change punishes only 6/12 after — a measured 50-point
drop in hit rate on this fixture, attributable to the lock changing the
relative timing of a guaranteed-feeling hit into a sometimes-clean dodge.**
The six-face sample (N=3/side, real evidence but not a large statistic)
points the same general direction — wider outcome variance, and on average
more forward progress and more kills — but is genuinely two-sided (one
after-run did *worse* than every before-run). Per this gate's own framing,
I am not treating "it may have gotten easier" as an automatic FAIL, but the
numbers above are real and should reach the operator before this merges
past them — see PROPOSED INBOX ISSUE below.

## 3. Does the telegraph read? (mechanism confirmed; feel is not mine to judge)

Captured with a small ad-hoc Playwright driver (same URL/params as
`hound-wasp-squeeze.json`, not `run.mjs`, to get frame-level control) —
screenshots and the exact per-frame `x,y` under
`reports/tasks/T-043/qa-runs/telegraph-shots/`:

- **AFTER, two samples 125ms apart during the lock**: `x=42.183, y=8.361` at
  both `gameMs=1219.3` and `gameMs=1344.2` — **pixel-identical position**,
  confirming the freeze is real and exactly as documented, not a rendering
  fluke. A third sample past the lock boundary (`gameMs=1460.8`) shows
  movement resuming (`x=42.026, y=8.110`).
- **BEFORE, the same three-sample cadence**: the wasp has already moved
  noticeably by the *second* sample (`x=41.962→41.306`, ~0.66 tiles in
  133ms) — there is no freeze at all, matching the pre-change code exactly.
- Screenshots (`burst-after-f0.png`/`f1.png`, `before-lock.png`,
  `after-lock.png`, `*-cruise.png`, `*-recover.png`) are all at the default
  FAR view, 1280×800. RIG and the wasp/hound sprites are legible; nothing
  overlaps the HUD text; no glitch or visual break against the shipped
  style was seen at any of the six captured states (cruise/lock/dive/
  recover, before and after).
- **What this can and cannot tell you**: a static screenshot cannot show
  *absence of motion* — the whole mechanism is a temporal cue (a pose that
  doesn't move where every other pose does). The paired frames above are
  the closest a still image gets to proving it; whether it *reads* as "about
  to launch" versus "a stutter" (build.md's own §5 Q1) is a feel question I
  am not answering. **All four of build.md's §5 feel questions remain
  unanswered here and should stay routed to the operator** — I did not find
  anything in this pass that resolves them.

## 4. Regression

`node tools/pathcheck.mjs`: 1760/0, matching build.md and review. Both smoke
scripts complete clean. `?selftest=1`: 29/29. Zero `pageErrors`/
`consoleErrors`/`teardownErrors` across all 24 squeeze runs, 6 six-face
runs, 2 smoke runs, and the restart-session probe (33 browser sessions
total). Note per the dispatch: this branch's pathcheck is still the
1760-assertion monolith (`main` is at 1812 with the module split in
progress on a separate lane) — judged on its own terms, not against main's
count, per the lane brief.

## 5. Durability — no stuck wasps

Checked for a wasp permanently stuck in `dive` (never reaching `recover`)
across all 6 six-face runs by tracking per-id state duration. Found several
apparent 20,000–52,000ms "still diving" readings **in both BEFORE and
AFTER at similar frequency** (before: 7/12, 2/9, 4/16 ids per run over
threshold; after: 9/17, 2/8, 5/11) — traced this to my own analysis script,
not the game: `id` is a single global counter (`nextWaspId++`, shared
across every hostile kind despite the name) so ids never collide, and a
wasp that's permanently removed from `hostiles[]` mid-dive (killed, most
likely) never reappears in the trace, so my "still open at end of trace"
fallback wrongly attributed the *entire remaining run length* to it. Since
the artifact appears at the same order of magnitude in the **unmodified**
tree — which has no lock/launched flag at all — it cannot be a T-043-
introduced stuck-state bug, and it matches the reviewer's own code-level
finding: the `dive`→`recover` transition keeps its unconditional
`gameMs > e.stateUntil` exit alongside the new `launched &&` floor check, so
nothing can hold a wasp in `dive` forever. No durability defect found.

**Squad stagger under real dense combat** (supplementary, not a defect):
the pathcheck's synthetic 4-wasp cluster test proves ≥260ms holds at
sim-clock resolution (re-verified: 1760/0, and the reviewer's own
independent break/restore reproduced the same failure messages). My 75ms-
polled six-face traces measured apparent gaps as low as 225–234ms between
consecutive wasp first-commits in two of three AFTER runs. Given ±75ms of
independent sampling slop per event at this poll rate, a measured 225ms gap
is consistent with a true gap anywhere from ~150–300ms — **this is not
proof of a violation**, just a resolution limit of this harness at default
`--sample-ms`. Flagging as an evidence gap (a `--sample-ms 20` re-run would
close it) rather than a finding.

## Ports and cleanup

8761 and 8762 only; 8741-8747 never touched. Both killed
(`pkill -f "serve.mjs 87(61|62)"`), confirmed by refused `curl`.
`/tmp/hb-pin-before` worktree removed (`git worktree remove --force`,
confirmed via `git worktree list`). `.claude/worktrees/T-043` `git status
--short` shows only this new report tree (`reports/tasks/T-043/qa-runs/`,
`reports/tasks/T-043/playtest.md`) and the pre-existing untracked
`review.md` — no edits to `src/`, `tools/pathcheck.mjs`, or anything outside
my lane.

## PROPOSED INBOX ISSUES

```
## I-??? | fairness | S2 | repro: cd tools/playtest && for i in 1..12; do node run.mjs scripts/hound-wasp-squeeze.json --deterministic --base-url <server for commit 69e1f90 or a2e6d97>; done | evidence: reports/tasks/T-043/qa-runs/squeeze-{before,after}/run-*.report.json (this worktree)
T-043's wasp aim-lock (WASP_DIVE_LOCK_MS=220) measurably drops
hound-wasp-squeeze.json's hit rate from 12/12 (100%, pre-change,
git merge-base main HEAD = 69e1f90) to 6/12 (50%, task/T-043 a2e6d97) across
12 identical --deterministic attempts each side — hp stays at 3/3 for the
whole run in exactly half the after-runs, verified directly from each
run's hp trace (not inferred). The mechanism is real and traceable: freezing
the wasp for 220ms before it moves shifts when its (frozen-aim) trajectory
arrives at the player's real-time position, and on this fixture that shift
sometimes lands the fixed 2-tap dodge clean instead of clipped. A matched
before/after trace pair shows the fork is proximally triggered by the
HOUND's own tell→charge timing (code this task never touches) diverging by
~68ms between two near-identical early trajectories — consistent with the
harness's own documented, unresolved CDP-frame-delivery sensitivity
(playtest README "Deterministic injection mode", honesty items 8/11), not
a new bug T-043 introduces from scratch. Full-game six-face evidence
(N=3/side, reports/tasks/T-043/qa-runs/sixface-{before,after}/) points the
same general direction with much wider variance than before (scrollX
140/140/140 before vs 117.7/140/205 after; kills 11/11/14 vs 10/11/23) but
is two-sided, not uniformly easier. The operator's live "do NOT tune the
difficulty curve" directive (SPRINT.md 2026-08-02 OPERATOR GOAL CHANGE) is
the reason this is filed rather than waved through as pure legibility, per
review.md's own (non-blocking) flag on the same axis — that flag used 1
run/side; this is the N=12 confirmation. Recommend: an explicit
operator/integrator decision (accept as an acceptable side effect of a
legibility fix that predates the mandate, retune WASP_DIVE_LOCK_MS/
WASP_SQUAD_STAGGER_MS, or ship behind the WASP_AGGRO_ON flag build.md §4
already sketched) rather than silent merge.
```
