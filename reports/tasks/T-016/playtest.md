# T-016 playtest gate

FAIL

Everything mechanical in this task is green — pathcheck 693/0, both required
smoke scripts complete, both flags behave exactly as specified in the default
six-face run, the A.5 score surface is genuinely consumed, and flagless play is
unchanged. The gate fails on **evidence honesty**, not behavior: the CP4
recommendation's A/B table states a fact about the baseline run that its own
committed artifact contradicts, and the harness README note this task added
points every future default-run gate at a death counter that is structurally
always zero outside fixtures. Both are cheap to fix and the fix makes the CP4
packet *stronger*, not weaker (see "Why this is a FAIL" below).

## Worktree, pinning, and provenance

- Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016`
  at `da29e86` (branch `task/T-016`, merge-base `9eeae4a`).
- Pinned with `python3 -m http.server 8785` served from that worktree (killed
  after the run). Every run below used the MAIN checkout's harness with
  `--base-url http://127.0.0.1:8785`, except the two runs explicitly marked
  "worktree harness" (needed because the `score` passthrough only exists on the
  branch) and the two marked MAINTREE (built-in server, main's live tree).
- Main moved during this gate (`1154b46` → `127a89e`); the worktree did not.
  The MAINTREE comparison below is therefore against a moving reference, which
  is exactly why the worktree was pinned.

## Run commands

```sh
# required smoke set (main harness, pinned worktree)
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8785 --out runs/gate-T-016-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8785 --out runs/gate-T-016-transform

# the builder's scored-run scripts, run by the main harness against the pin
node run.mjs ../../.claude/worktrees/T-016/tools/playtest/scripts/scored-run.json \
  --deterministic --max-runtime-ms 32000 --base-url http://127.0.0.1:8785 --out runs/gate-T-016-scored
node run.mjs ../../.claude/worktrees/T-016/tools/playtest/scripts/scored-run-baseline.json \
  --deterministic --max-runtime-ms 32000 --base-url http://127.0.0.1:8785 --out runs/gate-T-016-scored-baseline
node run.mjs ../../.claude/worktrees/T-016/tools/playtest/scripts/scored-run-nojump.json \
  --deterministic --max-runtime-ms 32000 --base-url http://127.0.0.1:8785 --out runs/gate-T-016-scored-nojump

# flag-isolation probes
node run.mjs <nojump> --deterministic --url "http://127.0.0.1:8785/index.html?fallback=1&testapi=1" --out runs/gate-T-016-fallback-only
node run.mjs <nojump> --deterministic --url "http://127.0.0.1:8785/index.html?score=1&testapi=1"    --out runs/gate-T-016-score-only
node run.mjs scripts/mid-route.json --deterministic --url "http://127.0.0.1:8785/index.html?slice=traversal&score=1&testapi=1" --out runs/gate-T-016-slice-score

# real-A.5 verification + tune check (WORKTREE harness, pinned worktree)
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016/tools/playtest
node run.mjs scripts/scored-run.json --deterministic --max-runtime-ms 32000 \
  --base-url http://127.0.0.1:8785 --out .../runs/gate-T-016-scored-real
node run.mjs scripts/mid-route.json --deterministic --url ".../index.html?slice=traversal&score=1&testapi=1" --out .../runs/gate-T-016-slice-score-wt
node run.mjs scripts/scored-run-nojump.json --deterministic --url ".../index.html?score=1&testapi=1" --out .../runs/gate-T-016-score-only-wt

# flagless byte-identity comparison (main harness, main's own tree)
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --out runs/gate-T-016-mid-MAINTREE
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --out runs/gate-T-016-transform-MAINTREE

# game gate, in the worktree
node /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-016/tools/pathcheck.mjs   # exit 0, 693 passed / 0 failed
```

## Required gate results

| Run | exit | `outcome.result` | console/page errors | bootError |
| --- | --- | --- | --- | --- |
| `mid-route.json` | 0 | **completed** | 0 / 0 | null |
| `transform-slice.json` | 0 | **completed** | 0 / 0 | null |

No retry was needed — no bootError in any of the eleven runs this gate made.

Smoke metrics (worktree pin vs main's tree, same harness, same flags — none):

| Metric | mid-route (pin) | mid-route (main) | transform (pin) | transform (main) |
| --- | --- | --- | --- | --- |
| result | completed | completed | completed | completed |
| idle fraction | 0.024 | 0.026 | 0.000 | 0.000 |
| minEdgeMargin | 35.43 | 35.44 | 30.07 | 30.12 |
| final x | 72.001 | 72.055 | 146.005 | 146.011 |
| protoScore (proxy) | 82.2 | 80.1 | 311.0 | 312.9 |

Within the harness's documented polling/injection noise, i.e. **flagless
behavior is unchanged** — corroborated at source level: the only flagless-path
edits are telemetry (`sliceStats.minEdgeMargin` now tracked in every mode,
setback stats reset in every mode); `RUN_FALLBACK_ENABLED` requires
`?fallback=1` and `SCORE_ENABLED` requires `?score=1`, both `ACTIVE_FIXTURE`-
aware, and `updateScore` still returns immediately when the flag is off.

## Flag verification in the DEFAULT six-face run (not just the slice)

| URL | Score block in telemetry | tune | Setbacks | Lives at end | final x / max x |
| --- | --- | --- | --- | --- | --- |
| `index.html` (baseline) | absent → protoScore falls back to labeled proxy | — | 0 | **×1 (2 spent)** | 75.65 / 89.25 |
| `index.html?score=1&fallback=1` | present, `enabled:true`, 18 events | **run** | **3 absorbed** | **×3 (0 spent)** | 89.25 / 89.25 |
| `index.html?score=1` | present, `enabled:true` | **run** | 0 | — | — |
| `index.html?fallback=1` | absent (correct) | — | 1 | — | — |
| `index.html?slice=traversal&score=1` | present | **slice** | 0 | — | — |

- **Score events are real in the run.** Worktree-harness run
  `gate-T-016-scored-real`: `metrics.protoScore = {protoScore: 597.9, source:
  "HB.score", note: "real: … counts.airborne_kill=3, counts.link=0"}`, with the
  full A.5 snapshot mirrored at `metrics.score` (CHARGE/notch, THREAT 920 →
  OBSERVE, per-event counts, `airMs` 25405, `stallMs` 874, `setbacks` 3,
  `tune: "run"`). All 409 samples carried the block. The A.5 hook landed and is
  consumed — README hook request #3 is genuinely closed on the harness side.
- **The two tunes do not cross-contaminate**: the same `mid-route.json` under
  `?slice=traversal&score=1` reports `tune: "slice"`; the run reports
  `tune: "run"`.
- **The streak ceiling is real, empirically**: `scored-run-nojump` (never
  jumps) took setbacks at t≈3.2 s / 22.4 s / 27.2 s, then spent a stock life
  (HUD ×2) — a terminal ladder exists, no infinite fall loop, and it did not
  out-progress the competent script (x 59.65 vs 89.25). "Dying is not a
  shortcut" holds.
- Flag-shape note (not a defect, worth stating in the packet): in the run the
  arming value is exactly `?fallback=1`; a bare `?fallback` is inert there,
  whereas in the slice `?fallback` is on-by-default and `?fallback=0` disables.
  The proposal's URL table is correct; the asymmetry is only a trap for someone
  typing the flag from memory.

## Why this is a FAIL

Both findings are the same root cause and both are in the artifacts this task
exists to produce.

1. **`metrics.deaths` / `outcome.attempts` cannot see a death in the default
   run, and the new README note tells readers to use them.** They derive from
   `sliceStats.attempts`, which `src/main.js:193` increments only inside
   `if (ACTIVE_FIXTURE)`. Every default-run report therefore reads
   `deaths: 0, attempts: 0` no matter what happened. The note added at
   `tools/playtest/README.md` ("the default run counts `resetGame` calls, not
   deaths — use `metrics.deaths`/`metrics.score.setbacks` for failure counts")
   is wrong on both halves: the run counts nothing, and `metrics.deaths` is the
   same blind counter. Following it will make every future default-run gate
   report zero deaths for a run that died repeatedly. That is the schema's own
   definition of a gate-corrupting defect.
2. **The CP4 evidence table states "0 deaths" for the baseline; it died
   twice.** In my run `gate-T-016-scored-baseline` the trace carries two clean
   respawn signatures — t=19080 ms and t=27412 ms, each hp 1→3 with x snapping
   89.3 → 51.6, `setbacks` unchanged at 0 — and the end-of-run HUD reads
   `RIG ▰▰▰ ×1`, i.e. two of three stock lives spent. The builder's **own
   committed artifact** shows the same thing
   (`tools/playtest/runs/scored-run-baseline-1785557898457/`: hp 3→2→1→3 twice,
   screenshot ends at `×1`). The reviewer's "numbers match the actual run
   artifacts" check did not catch this column.

The correction strengthens the recommendation. The true A/B is: **flags off →
2 stock lives spent and knocked back from x 89.25 to 75.65; flags on → 0 lives
spent, 3 setbacks absorbed, forward progress never lost (final x = max x =
89.25)**. That is a far sharper argument for the promotion than "0 deaths
either way," and it also puts real evidence behind CP4 question 2 (does a
fallback that costs no forward ground punish enough?).

Minimal remediation: fix the README note to state that no death counter exists
on default-run traces today and name what does work (the `score.setbacks`
counter on fallback-armed runs, or a lives read — `lives` is on `HB.snapshot()`
but not on the frozen `testapi` channel, so a hook request or a `--no-testapi`
run is the honest path); fix the baseline row of
`docs/proposals/2026-07-cp4-default-run-score-setback.md` to the numbers above.
No code change to `src/` is required by this verdict.

## Screenshots judged

Frames: `runs/gate-T-016-{mid,transform,scored,scored-baseline,scored-nojump}/screenshot.png`
plus the builder's `runs/scored-run*/screenshot.png` in the worktree.

- **FAR readability / scale invariant:** RIG measures ≈30 px in an 800 px
  viewport (≈3.7 %), inside board 13's 3–5 % band and matching the shipped FAR
  default. Hull silhouettes are connected and readable; ledges and catwalk
  lines separate cleanly from the background at distance.
- **Score readouts at FAR:** the CHARGE notch glyphs ride the weapon readout
  and `THREAT nnn` sits top-right in the default run under `?score=1` — both
  legible screen-space text. The center-line HULL FALLBACK callout is absent in
  the run (slice-gated); the builder discloses this and it is already CP4
  question 5, so it is a queued feel question, not a gate defect.
- **Capsule glyph:** the pickup reads as a green block at FAR; its letter does
  not survive. This corroborates T-015's measured 9.6 px finding already in the
  operator checkpoint queue — not a new defect and not attributable to T-016.
- **No assembling anatomy:** nothing in these frames shows body geometry
  arriving, slamming, or articulating; the run frames are static grey-box hull
  and the transform frame is the post-breach reveal with fog/rain. Honest
  caveat: single end-of-run stills cannot prove choreography either way — the
  static-anatomy judgment for the transform slice rests on T-001's
  `artifacts/cp3-transform-v3/` sequence, not on this gate.
- **Style vs `docs/concept-art/`:** still the neutral grey-box palette (the
  palette pass is T-010, unmerged), so no style verdict is available beyond
  "unchanged by this task." No color-role violations introduced.

## Notes for the operator (feel — never a gate failure)

1. In the flags-on run the fallback never cost forward ground (final x = max x
   = 89.25) while the flags-off run was thrown back 13.6 tiles by a stock
   death. Does a setback that costs altitude but no forward progress read as a
   punishment at run scale? (Sharpens CP4 question 2.)
2. The `scored-run-nojump` probe spends its last 12 s oscillating around
   x ≈ 59 at 71 % idle while the fallback→fallback→life ladder plays out. Does
   that read as "the ship is escalating on me" or as "I am stuck"? (Feeds CP4
   question 3.)
3. `protoScore` on the identical scored-run script varied 586.9 / 597.9 /
   600.5 across three deterministic runs (setbacks, final x, and THREAT were
   stable). Worth knowing before any CP4 number is read as a target.

## Issues filed

- `SPRINT.md` Inbox **I-006** (bug, S1) — default-run death counting blind spot
  plus the README note that directs future gates to it.
- `SPRINT.md` Inbox **I-007** (docs, S2) — CP4 recommendation's baseline row
  claims 0 deaths; artifacts show 2 stock lives spent.

(Numbered I-006/I-007 because other gates appended I-003…I-005 to the Inbox
while this gate was running.)
