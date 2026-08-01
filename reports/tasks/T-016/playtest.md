# T-016 playtest gate — re-gate of the fix cycle

PASS

Both defects that failed the first gate are fixed, and I verified each one
against the artifact rather than the prose. The mechanical gates are green
again on the fix-cycle tip: pathcheck 798/0, both required smoke scripts exit
0 with `"result": "completed"`, zero console errors, zero page errors, no
bootError, no retry needed. Two residual honesty nits remain (both already
named as reviewer MINORs, neither contradicted by any artifact) — filed as an
Inbox S3 rather than held against the gate.

## Worktree, pinning, and provenance

- Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016`
  at **`a08753b`** (branch `task/T-016`, merge-base with `main` `cb321a6`,
  clean working tree). The first gate ran `da29e86`; the fix cycle is
  `da40e29..a08753b`.
- Pinned with `python3 -m http.server 8803` served from that worktree; killed
  after the last run.
- Every run below used the **MAIN checkout's** harness
  (`/Users/scottmeyer/projects/hullbreaker/tools/playtest`) with
  `--base-url http://127.0.0.1:8803`, except the two marked WORKTREE HARNESS,
  which had to run from the branch because `metrics.lives` — the thing under
  re-gate — only exists there.
- **The fix cycle touched no `src/` file** (`git diff --stat 3f42874 a08753b
  -- src/` is empty; the only changes are
  `docs/proposals/2026-07-cp4-default-run-score-setback.md`,
  `tools/playtest/README.md`, `tools/playtest/lib/metrics.mjs`,
  `tools/playtest/lib/report.mjs`, plus the committed CP4 artifacts). The
  first gate's game-behavior findings (flags default-off, flagless path
  unchanged, both tunes isolated, score events real) therefore still stand and
  were not re-derived from scratch; the two smoke runs re-confirm the flagless
  path at the same numbers.

## Run commands

```sh
# pin
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016 && python3 -m http.server 8803 &

# required smoke set (MAIN harness, pinned worktree)
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8803 --out runs/gate-T-016-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8803 --out runs/gate-T-016-transform

# re-gate evidence (WORKTREE HARNESS — metrics.lives lives on the branch)
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016/tools/playtest
node run.mjs scripts/scored-run-baseline.json --deterministic --max-runtime-ms 32000 \
  --base-url http://127.0.0.1:8803 \
  --out /Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate2-T-016-baseline-wtharness
node run.mjs scripts/scored-run-nojump.json --deterministic --max-runtime-ms 32000 \
  --base-url http://127.0.0.1:8803 \
  --out /Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate2-T-016-nojump

# game gate, in the worktree
node /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016/tools/pathcheck.mjs   # exit 0
```

## Required gate results

| Run | exit | `outcome.result` | console / page errors | bootError |
| --- | --- | --- | --- | --- |
| `scripts/mid-route.json` | 0 | **completed** | 0 / 0 | null |
| `scripts/transform-slice.json` | 0 | **completed** | 0 / 0 | null |

`node tools/pathcheck.mjs` in the worktree: **798 passed, 0 failed, exit 0**.

Smoke metrics (fresh, this gate) vs the first gate's pinned run of the same
scripts — inside documented polling/injection noise, i.e. the flagless path is
still unchanged:

| Metric | mid-route (now) | mid-route (first gate) | transform (now) | transform (first gate) |
| --- | --- | --- | --- | --- |
| result | completed | completed | completed | completed |
| idle fraction | 0.041 | 0.024 | 0.000 | 0.000 |
| minEdgeMargin | 35.49 | 35.43 | 30.07 | 30.07 |
| final x | 72.006 | 72.001 | 146.005 | 146.005 |
| protoScore (proxy) | 87.3 | 82.2 | 319.6 | 311.0 |

Evidence: `tools/playtest/runs/gate-T-016-{mid,transform}/{report.json,summary.md,screenshot.png}`.

## Defect 1 re-gate — does the A/B table agree with its cited artifact?

**Fixed.** I opened
`.claude/worktrees/T-016/tools/playtest/reports/cp4/scored-run-baseline/report.json`
and `.../scored-run/report.json` directly and recomputed every number in the
two headline rows from the trace, rather than reading the summaries:

| Claim in `docs/proposals/2026-07-cp4-default-run-score-setback.md` §Evidence | What the cited artifact actually says | Verdict |
| --- | --- | --- |
| baseline "died twice: 2 of 3 stock lives spent (t = 19.1 s, 27.3 s)" | `metrics.lives = {start 3, end 1, spent 2, losses[gameMs 19053.2, 27311.5]}` | agrees |
| "each respawn snapping x 89.25 → ~51.6" | losses carry `xBefore 89.25 → x 51.611 / 51.582`; trace shows `hp 1→3` at those instants | agrees |
| "ends at HUD ×1" | distinct `hudTL` sequence in the trace: `×3` → `×2` → `×1`, last value `RIG ▰▰▰  ×1` | agrees |
| "final x 75.48 against a max x of 89.25" | trace final x **75.4757**, max x **89.250** | agrees |
| "4 hits survived", "0 setbacks", "proxy protoScore 924.8" | `hitsWithoutDeath 4`, `score: null`, `protoScore {924.8, source: "proxy"}` | agrees |
| row 1 "protoScore 598.0 (source HB.score, real)… 3 airborne kills, 1 launch kill, 2 recatches, THREAT 920 (OBSERVE), hot 13.8 s of 31.0 s, 3 setbacks, 0 lives spent (HUD ×3), final x = max x = 89.25" | `protoScore 598 {source: "HB.score"}`, counts `airborne_kill 3 / launch_kill 1 / recatch 2`, `threat 920` → OBSERVE, `hotMs 13825` of `playMs 30978`, `setbacks 3`, `lives.spent 0` (every `hudTL` in the trace is `×3`), trace final x = max x = **89.250** | agrees |

The "0 deaths" claim that failed the first gate is gone, and the correction
box states the cause (`sliceStats.attempts` is fixture-only) accurately. Both
headline rows now cite a **committed** `report.json`, not a gitignored `runs/`
path.

Independent reproduction (not just artifact-reading): a fresh
`scored-run-baseline.json` run I made against the pin reproduced the
structural claim exactly — `lives.spent = 2` (losses at gameMs 19074.8 and
27416.4, `xBefore 89.25 → x 51.579` both times), ends `×1`, max x 89.250,
final x 74.69 (vs the doc's 75.48 — inside the documented run-to-run band).
Evidence: `tools/playtest/runs/gate2-T-016-baseline-wtharness/report.json`.

## Defect 2 re-gate — is the misleading death-counter note corrected?

**Fixed, and the replacement works.** Three checks:

1. **The note is gone in its wrong form.** `tools/playtest/README.md` now
   says `outcome.attempts` and `metrics.deaths` are **fixture-only** and
   structurally `0` on a default run, names `src/main.js`'s
   `if (ACTIVE_FIXTURE)` guard as the reason, and directs readers to
   `metrics.lives.spent` (+ `metrics.lives.losses[]`) and
   `metrics.score.setbacks` instead. The "damage/death events" bullet carries
   the same correction, and hook request #9 (publish `player.lives`/`hp` on
   the frozen `?testapi` channel) is filed. It also gives an independent
   raw-trace signature (`hp 1→3` + `x` snapping back + `setbacks` unchanged =
   stock respawn; `hp 1→3` + `setbacks` incrementing + `x` continuous =
   absorbed fallback), which is exactly how I verified defect 1 by hand.
2. **The report itself now warns in-band.** Every report object carries
   `deathsScope: "fixture-only (sliceStats.attempts increments; always 0 in
   the default run — use lives.spent)"`. Confirmed in both committed CP4
   traces and in my own fresh runs.
3. **The replacement counter is not itself blind.** On my fresh default-run
   traces the new counter reports the deaths the old path could not see:
   baseline `deaths: 0` / `lives.spent: 2`; `scored-run-nojump`
   `deaths: 0` / `lives.spent: 1` (loss at 15.9 s, `x 41.649 → 44.5`). The
   HUD parse is corroborated by the screenshots themselves — the baseline
   frame's HUD reads `RIG ▰▰▰ ×1` and the nojump frame reads `×2`, matching
   `lives.end` in each report. The documented limitations hold too: on the
   traversal slice the counter reports `unavailable` with the reason (`hud.js`
   prints no `×N` there), which is what the committed `slice-tune-check`
   summary shows.

## Extra check I ran because the first gate could not: rows 3–5

The first gate's FAIL was about a claim contradicted by its artifact. To be
sure the rest of the table is not the same class of problem, I re-ran
`scored-run-nojump.json` (row 3's script, same flags) against the pin:

| Row 3 claim | My independent run |
| --- | --- |
| stalled; setbacks at 3.2 / 22.4 / 27.4 s | `outcome.result: stalled`; setbacks at **3.2 / 22.4 / 27.1 s** |
| 1 stock life spent at 16.0 s | `lives.spent 1` at **15.9 s** |
| ends at x 59.65; 21.9 s of 30.9 s idle | final x **59.649**; `stallMs 21888` of `playMs 30883` |
| protoScore −16.5 (real, `HB.score`) | `protoScore −16.5 {source: "HB.score"}`; `setbacks 3` |

Every checkable number reproduces within the harness's documented variance.
So rows 3–5 are **accurate but not fully checkable from their committed
artifacts** — their `summary.md` files carry lives/stall/score lines but not
final x or setback timestamps, and no `report.json` is committed for them.
That is a checkability gap in a decision packet, not a false claim; filed as
Inbox **I-008 (docs, S3)**, not held against this gate.

## Screenshots judged

Frames: `tools/playtest/runs/gate-T-016-{mid,transform}/screenshot.png`,
`tools/playtest/runs/gate2-T-016-{baseline-wtharness,nojump}/screenshot.png`.

- **FAR readability / scale invariant:** measured on the default-run baseline
  frame at 6× crop, RIG spans ≈32.5 px of the 800 px viewport ≈ **4.1 %** —
  inside board 13's 3–5 % band and consistent with the shipped FAR default
  (decisions.md entry 7). The silhouette survives at that size: head, torso,
  legs and the yellow rifle line read as a facing tell. Hull surfaces are
  connected, the ledge/catwalk lines separate cleanly from the background,
  and hostiles read as distinct green wedges against the grey hull.
- **Score readouts at FAR:** the `?score=1&fallback=1` frame carries
  `THREAT 325` top-right and the CHARGE notch glyphs after the weapon
  readout; the flags-off baseline frame carries neither — flag gating is
  visible in the pixels, not just in telemetry. Both readouts are
  screen-space text and legible at FAR.
- **No assembling anatomy:** nothing in these frames shows body geometry
  arriving, slamming, or articulating. Honest caveat, unchanged from the
  first gate: single end-of-run stills cannot prove choreography either way —
  the static-anatomy judgment for the transform slice rests on T-001's
  `artifacts/cp3-transform-v3/` sequence, not on this gate. This task changed
  no render file at all.
- **RIG absent from the nojump frame — explained, not a defect:** the player
  is at x 59.65 / hp 1 in that sample, and took a hit at gameMs 30357, ~500 ms
  before the screenshot. `src/render/player.js:55` sets
  `rig.visible = gameMs >= player.iframesUntil || blink()`, so the frame
  landed on an i-frame blink-off phase. Pre-existing shipped behavior,
  untouched by T-016; flagged here only so a future reader does not file it as
  a missing-player bug.
- **Style vs `docs/concept-art/`:** still the neutral grey-box palette (the
  palette pass is T-010, unmerged), so there is no style verdict available
  beyond "unchanged by this task" — no color-role or silhouette violations
  introduced. The capsule still reads as a green block whose letter does not
  survive at FAR, which is T-015's already-queued glyph-scale question, not a
  T-016 defect.

## Residual, non-blocking (named, not held against the gate)

1. **Rows 3–5 are not checkable from their committed artifacts** (I-008, S3).
   Verified accurate by an independent run above; committing
   `scored-run-nojump/report.json`, or adding final x + setback times to those
   summaries, would close it.
2. **`outcome.result` can still never read `died` on a default-run trace** —
   `computeOutcome` (`tools/playtest/lib/metrics.mjs:285`) keys off the same
   fixture-only `attempts`, so my baseline run that spent two lives is labeled
   `not-completed`, which is the first line of every `summary.md`. The
   corrected README note enumerates `metrics.deaths` and `outcome.attempts`
   but not `outcome.result`. This is the last hole of I-006's class; annotated
   on I-006 rather than filed fresh.

## Notes for the operator (feel — never a gate failure)

1. Re-measured this pass: flags-off spends **2 stock lives and gets thrown
   back from x 89.25 to 74.7–75.5**, while flags-on spends **0 lives and never
   loses forward ground** (final x = max x = 89.25, 3 setbacks absorbed). Does
   a setback that costs altitude but no forward progress punish enough at run
   scale? (CP4 question 2.)
2. The never-jumping probe spends its last ~12 s pinned at x 59.65 at 71 %
   idle while setback → life → setback → setback plays out, and the frame at
   that moment shows two wasps working RIG over on one ledge. Does that read
   as "the ship is escalating on me" or as "I am stuck"? (CP4 question 3.)
3. Variance worth knowing before any CP4 number is read as a target: on the
   identical `scored-run` script the packet measured protoScore 586.9–600.5,
   setbacks 3 or 2, THREAT 920 or 444 — while lives spent (0) and final x
   (89.25) never moved. Structural outcomes are stable; the meter is not.

## Issues filed / annotated in `SPRINT.md`'s Inbox

- **I-006** (bug, S1) — annotated: harness half **fixed and verified** at
  `a08753b` (`metrics.lives` + `deathsScope` + corrected note); residual
  `outcome.result` hole recorded on the same entry; the game-side counter
  remains fixture-only by design, now documented and filed as harness README
  hook request #9.
- **I-007** (docs, S2) — annotated: **fixed and verified**; every number in
  the two headline rows recomputed from the committed traces by this gate.
- **I-008** (docs, S3) — new: CP4 evidence rows 3–5 cite numbers absent from
  their committed artifacts (accuracy confirmed by an independent run; the gap
  is checkability).

## Scope note

`reports/tasks/T-016/review.md` was **not** overwritten by this gate. The
reviewer's fresh `APPROVE` for this exact fix cycle (`3f42874..a08753b`) is
newer than the first playtest verdict and is the reviewer lane's artifact, not
QA's; overwriting it would have destroyed the review gate's record. This file
is the fresh playtest verdict.
