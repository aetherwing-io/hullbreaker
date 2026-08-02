PASS

Pre-merge playtest gate for T-041 (S10 — directional impact and travel language),
worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-041`, branch
`task/T-041`, HEAD `0132aa2` (base `d3f6628`). Reviewed against `review.md`
(APPROVE, 3 non-blocking notes). Per the operator's own recorded verdict
(`docs/decisions.md` entry 15 — "played 8744, that's fun!"), feel is settled and
not re-judged here; this gate is mechanical only, per the four checks assigned.

## Setup

Served the pinned worktree at HEAD (not a moving tree) via
`node tools/serve.mjs 8770 --root .claude/worktrees/T-041 --quiet` from the main
checkout — used `serve.mjs`, not `python3 -m http.server`, per the current
README/CLAUDE.md guidance (avoids the stale-`src/*.js`-cache trap). Also checked
out the merge-base `d3f6628` into a scratch worktree
(`/private/tmp/.../scratchpad/T-041-base`, since removed) served on port 8780,
so every "before" number below is independently re-measured on this machine, not
inherited from build.md/review.md. Ports 8741-8746 untouched; 8770/8780 killed
and the scratch worktree pruned at the end (`git worktree list` now shows only
the real T-041 worktree; `git status --short` / `git diff --stat` in the
worktree confirm no stray files from testing).

## 1. Determinism — PASS

`src/pure/juice.js` (183 lines): `grep -nE "Math\.random|Date\.now|performance\.now|THREE|document|window"` →
zero matches. `node tools/pathcheck.mjs`'s own `guardLayer('pure', …)` static
scan also covers it (green, see below).

Ran `scripts/hound-facetank-solo.json` (14s, hold-right + hold-fire against a
hound — heavy, continuous use of the touched code paths: bullets fired every
frame, impact sparks on every hit) 3x `--deterministic` against the T-041
worktree and 3x against the `d3f6628` base, same script, same flags:

| | T-041 branch (3 runs) | base d3f6628 (3 runs) |
|---|---|---|
| final `(x, y, hp, kills)` | identical all 3: `(55.649, 1, 2, 1)` | identical all 3: `(55.649, 1, 2, 1)` |
| kill-tick spread | 15ms (1518/1533/1528) | 33ms (1542/1534/1509) |
| hp-drop-tick spread | 97ms (3563/3660/3572) | 37ms (3592/3580/3555) |
| `minEdgeMargin` spread | 0.228 tiles | 0.078 tiles |
| `airMs` spread | 70ms | 106ms |

Final simulation state converges byte-for-byte in all 6 runs; the sub-100ms/
sub-tile spread in *when* an event lands is the same class of dispatch/frame-
delivery jitter this harness's own README documents and disqualifies as
proof of anything ("Deterministic injection mode" / "the fork is NOT
dt-driven" section) — quantized-`gameMs` dispatch still hands off to a real
CDP-injected key event landing on the *next* real animation frame, unrelated
to render code. T-041's branch numbers are not uniformly tighter or looser
than base's across all four fields (2 of 4 wider, 2 of 4 narrower on n=3), so
this reads as pre-existing harness noise, not a new nondeterminism source —
consistent with `fx.js`/`bullets.js` being render-only (matrix/quaternion
composition for already-spawned instances) and never writing back into sim
state. n=3 per side is a real limitation of this check; flagging honestly
rather than overstating it as proof of a null effect.

## 2. Performance under load — PASS

Re-ran `tools/playtest/juice-stress.mjs` myself (own ephemeral `port:0`, no
conflict with any pinned port) against both trees:

| | before (d3f6628) | after (0132aa2) |
|---|---|---|
| control worstMs | 9.4 | 9.4 |
| stress worstMs | **9.3** | **9.4** |
| stress over20ms | 0 | 0 |
| stress liveProjectiles | 256 | 256 |
| stress errors | [] | [] |

Matches build.md/review.md exactly. Draw-call/geometry/texture budget
independently re-measured a third time (own throwaway script reading
`renderer.info` via `src/render/scene.js`, both trees, 1.5s after boot,
1280x800): **95 calls / 50,204 tris / 58 geometries / 5 textures on both** —
zero delta. (Absolute figures differ slightly from build.md's 94/50,196/58/5
and review.md's 97/50,180/54/5 — three different capture timings/conditions,
as review.md already noted — but all three independent measurements agree on
the load-bearing claim: the delta is exactly zero.)

## 3. Readability under load (pillar 5) — reported, not judged as fun

Ran `scripts/six-face-aimed-run.json` (the default six-face run, real 8-way-
aimed policy, not a synthetic stress loop) `--deterministic
--stop-on-game-over --max-runtime-ms 70000 --video` against the pinned
worktree. Played to a genuine `GAME_OVER` (all 3 lives spent, `gameOverSeen:
true`) at ~51s gameMs, wave gate 2, peak concurrent hostiles 11 on one tick
(HUD read "WAVE 2/6 — 9 HOSTILES" at the busiest visible moment). Zero
`pageErrors`/`consoleErrors` for the full run.

Extracted stills from the recording at the busiest fights (gate 1 ~18-24s,
gate 2 ~44-50s, including the frame just before the final death) —
`/private/tmp/.../scratchpad/combat-load2/frame-{18.2,21.3,24.3,44.4,46.9,49.9}s.png`
and a close crop `crop-49.9s.png`. Observed: at 5-11 concurrent hostiles plus
continuous player fire, bullet noses read as small directional streaks
distinct from the environment's flat teal/orange, impact bursts read as a
brief oriented flash/particle spray at the hit point rather than a
directionless blob or a smear crossing multiple tiles, and hostiles (green
diamond silhouettes) stayed visually distinct from RIG (white humanoid) and
from bullets (thin pale ovals) in every captured frame, including the
densest one. I did not observe the "grotesque smear" failure mode the
build's rejected first draft produced, nor bullets/sparks fusing into an
unreadable mass at the worst hostile count this run produced. This is a
mechanical observation of one run's captures, not a fun verdict — genuinely
worse frames (denser waves, different weapons, different camera angles) are
possible and untested; flagging as an open question below rather than
claiming exhaustive coverage.

## 4. Regression — PASS

- `node tools/pathcheck.mjs` in the worktree: **1763 passed, 0 failed.**
  Base (`d3f6628`, scratch worktree): **1741 passed, 0 failed.** Delta = 22,
  matching a hand-recount of the diff's assertions (14 static call-sites, 2 of
  which loop — the `CONFIG.juice` burst-spec loop over 4 matching entries and
  the `bulletCases` loop over 6 — for 22 assertions actually executed at
  runtime). Minor, non-blocking accuracy note: build.md's "24 new ok()/near()
  calls" is off from both the static call-site count (14) and the executed-
  assertion count (22) — same class of miscount review.md already flagged
  for the "15 vs 18 failures" claim, not a gate-affecting error.
- `scripts/mid-route.json --deterministic`: `completed` (VICTORY), 0 deaths,
  0 errors.
- `scripts/transform-slice.json --deterministic`: `completed` (BREACH CLEAR
  equivalent), 0 deaths, 0 errors.
- `?selftest=1` against the pinned server: **SELFTEST PASS (29 checks)**,
  matching build.md. One run of three incidentally logged a single 404
  console error; a follow-up capture of the actual failing request under the
  same conditions showed zero ≥400 responses, and this harness's own
  `juice-stress.mjs` already special-cases exactly this pattern
  (`/favicon.ico` 404) as known-benign server noise unrelated to the game —
  not attributed to this diff.
- `git status --short` / `git diff --stat` in the worktree: clean (only the
  pre-existing untracked `reports/tasks/T-041/review.md` from the review
  pass; nothing from my testing).

## Evidence paths

- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/stress-before/07-stress-perf.json`,
  `.../stress-after/07-stress-perf.json` — juice-stress before/after
- `.../scratchpad/det-run-{1,2,3}/report.json` (branch), `.../det-base-{1,2,3}/report.json` (base) — determinism comparison
- `.../scratchpad/combat-load2/report.json`, `page@*.webm`, `frame-*.png`, `crop-49.9s.png` — sustained-combat run + captures
- `.../scratchpad/smoke-midroute/report.json`, `.../smoke-transform/report.json` — smoke suite

## Run commands (reproduce)

```sh
node tools/serve.mjs 8770 --root .claude/worktrees/T-041 --quiet &
cd .claude/worktrees/T-041/tools/playtest
node tools/pathcheck.mjs   # from worktree root: 1763 passed, 0 failed
node run.mjs scripts/hound-facetank-solo.json --deterministic --base-url http://127.0.0.1:8770 --out /tmp/det-1   # x3
node juice-stress.mjs /tmp/stress-after
node run.mjs scripts/six-face-aimed-run.json --deterministic --stop-on-game-over --max-runtime-ms 70000 --video --base-url http://127.0.0.1:8770 --out /tmp/combat
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8770 --out /tmp/smoke-mid
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8770 --out /tmp/smoke-tf
```

## Open feel questions

None new — build.md's four feel questions are already answered by
`docs/decisions.md` entry 15 ("that's fun!"). Not re-opening them.

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: `node tools/pathcheck.mjs` in the T-041 worktree (0132aa2) vs a hand-recount of `git show 0132aa2 -- tools/pathcheck.mjs` | evidence: this report's "Regression" section
build.md claims "24 new `ok()`/`near()` calls" for the T-041 pathcheck
addition. The diff has 14 static call-sites (12 `ok(`, 2 `near(`), 2 of which
loop (over `CONFIG.juice`'s 4 speed/size burst specs, and over 6
`bulletCases` entries), producing 22 assertions actually executed —
confirmed against the measured pass-count delta (1763 base-adjusted vs 1741
at merge-base = 22). Neither the call-site count nor the assertion count is
24. Same class as the build's own "15 vs 18 failures" miscount already noted
in review.md — cosmetic, not gate-affecting, but worth a habit fix (count
from the actual pass-delta, not by eye) since this project has been burned
before by unverified numbers in reports.
