APPROVE

Re-review of the T-016 fix cycle (`3f42874..a08753b`, on top of the already-approved
promotion). Gate run by me in the worktree: `node tools/pathcheck.mjs` → **798 passed,
0 failed, exit 0**. Both items the playtest FAIL named are genuinely fixed, and I
verified the headline A/B against the committed traces rather than the prose:

- `tools/playtest/reports/cp4/scored-run/report.json` — protoScore 598 (`source:
  "HB.score"`), `tune: "run"`, THREAT 920, counts airborne 3 / launch 1 / recatch 2,
  setbacks 3, hot 13825 ms of 30978 ms, `lives.spent = 0` (HUD `×3`), final x = max x =
  89.250. Matches the doc's row 1 exactly.
- `tools/playtest/reports/cp4/scored-run-baseline/report.json` — `lives.spent = 2` at
  t 19053 ms / 27311 ms, x 89.25 → 51.611 / 51.582, ends `×1`, final x 75.4757 (doc:
  75.48) against max x 89.250, 0 setbacks, proxy protoScore 924.8, 4 hits survived. The
  "0 deaths" claim that failed the gate is gone; the correction box states the cause
  (`sliceStats.attempts` is fixture-only) correctly.
- `tools/playtest/README.md` — the note no longer points default-run gates at
  `metrics.deaths`; it names `metrics.lives.spent` + `metrics.score.setbacks`, marks
  `deaths`/`outcome.attempts` fixture-only in the report itself (`deathsScope`), and
  files hook request #9. `computeLives`'s HUD parse checks out: `hudTL` sits in the
  sampler's base object and survives every fidelity path, `src/ui/hud.js:78` emits the
  lives `×N` before FLOW's `×mult` so the regex cannot mis-latch, and the slice's
  missing readout is handled through `unavailableReason`.

Checklist: layer purity clean (`SCORE_RUN`/`RUN_FALLBACK` are frozen pure data; no
THREE/document/window; the one new import, `src/sim/player.js` → `src/pure/score.js`,
is downward; static guards green). Determinism clean (no `Math.random`/`Date.now`/
`performance.now`; sim stays 2D). Verdict compliance: flags default-off
(`RUN_FALLBACK_ENABLED` needs literal `?fallback=1` and is `ACTIVE_FIXTURE`-gated),
`?hook=1` untouched, FAR default untouched, CONFIG/jump constants untouched, no render
or anatomy changes, lives-as-ceiling proposed for the CP4 verdict rather than adopted
(decisions.md 0a respected). Test honesty: pathcheck only gains assertions (the two `-`
lines are import-list reflow), shipped smoke scripts untouched, new headless children
assert both flags and the flagless path. Perf: one extra `Math.min` per frame for
`minEdgeMargin`, no new per-frame allocation. Browser smokes not re-run here — that is
the playtest gate's job.

Findings (all MINOR; none blocks merge):

docs/proposals/2026-07-cp4-default-run-score-setback.md:132 — MINOR: the variance
paragraph reports "five repeats of `scored-run.json`" with five protoScores (586.9 /
597.9 / 598.0 / 598.8 / 600.5), but the same document's run census at line 100 says
"eleven runs made for this document" and enumerates only two scored-run executions (row
1 and `scored-run-repeat`). The other three values match the T-016 playtest gate's runs
verbatim (`reports/tasks/T-016/playtest.md`, note 3) and have no committed artifact, so
the correction box's "every number below has been re-measured on this branch's tip"
(line 80) does not hold for them. The numbers are accurate and the band is the
conservative direction, so this is attribution rather than a false claim — but on a
task whose whole purpose is evidence honesty, one clause ("three of the five repeats
are the T-016 playtest gate's runs, uncommitted") should say so. Same sentence in
`tools/playtest/reports/cp4/README.md:56` and `tools/playtest/README.md:680`.

SPRINT.md:308 — MINOR (carried from the first review, still open): the Operator
checkpoint queue holds G1 and CP3-v3 entries but no CP4 entry, and this worktree does
not touch `SPRINT.md`. Acceptance item "CP4 operator packet remains queued" therefore
completes only if the integrator appends the URL + 5 questions from the proposal's "CP4
operator packet" section at merge, per the T-001/T-015 convention. Do not let it drop.

tools/playtest/lib/metrics.mjs:285 — MINOR: `computeOutcome`'s `'died'` branch keys off
the same fixture-only `attempts`, so `outcome.result` can never read `died` on a
default-run trace — `scored-run-baseline` reports `not-completed` after spending two
lives. The corrected honesty note enumerates `metrics.deaths` and `outcome.attempts`
but not `outcome.result`, which is the first line of every summary. One clause in that
note (or deriving `died` from `lives.spent` when attempts are unavailable) closes the
last hole of this class.

docs/proposals/2026-07-cp4-default-run-score-setback.md:120 — MINOR: rows 3–5 (nojump,
ceiling control, flag isolation) cite setback timestamps (3.2 / 22.4 / 27.4 / 27.8 s),
final x (59.65, 31.65) and the `GAME_OVER` / "SIGNAL LOST" terminal state, none of which
appear in the only artifact committed for those runs — their `summary.md` carries lives,
stall and score lines but neither final x nor setback times, and `report.json` is
committed for the two headline runs only. Nothing contradicts the artifacts and every
number that *is* checkable checks out, but "the A/B agrees with its committed artifact"
is literally true only for rows 1–2. Committing `scored-run-nojump/report.json`, or
adding final x + setback times to those summaries, would make the whole table checkable.

tools/playtest/README.md:467 — MINOR: the validation sentence says "`lives` is the only
addition", but the same change also adds `deathsScope` to every report object (a static
label, harmless, but it makes the byte-identical claim imprecise as written).

tools/playtest/reports/cp4/scored-run/report.json:1 — MINOR (hygiene): the two committed
traces are 1.1 MB + 1.0 MB, ~2.1 MB against 1.2 MB for all seven existing demo runs
combined. Committing them is the right answer to "a decision packet must not cite
gitignored paths" and the cp4 README already limits it to two runs — worth a
down-sampled trace or a prune once CP4 is judged, not a merge blocker.
