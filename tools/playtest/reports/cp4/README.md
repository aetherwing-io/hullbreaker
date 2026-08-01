# CP4 evidence — score + setback in the default six-face run

The bot-run artifacts behind the A/B table in
`docs/proposals/2026-07-cp4-default-run-score-setback.md`. They live here,
not under `tools/playtest/runs/`, because `runs/` is gitignored (harness
convention: ephemeral scratch runs) — a decision packet must not cite paths
that disappear with the worktree. Screenshots are gitignored too (`*.png`),
so these are traces and summaries only.

Regenerate them from a clean checkout of this branch (the same three commands
run twice give you the `scored-run` / `scored-run-repeat` pair; the repeats
will not match these numbers exactly — see the variance note at the bottom):

```sh
cd tools/playtest
node run.mjs scripts/scored-run.json          --deterministic --max-runtime-ms 32000 --out runs/cp4-scored
node run.mjs scripts/scored-run-baseline.json --deterministic --max-runtime-ms 32000 --out runs/cp4-baseline
node run.mjs scripts/scored-run-nojump.json   --deterministic --max-runtime-ms 32000 --out runs/cp4-nojump
# the two ceiling/isolation probes and the slice tune check need an explicit URL,
# so serve the worktree first:  python3 -m http.server 8788 --bind 127.0.0.1
node run.mjs scripts/scored-run-nojump.json --deterministic --max-runtime-ms 32000 \
  --url "http://127.0.0.1:8788/index.html?score=1&testapi=1"    --out runs/cp4-ceiling
node run.mjs scripts/scored-run-nojump.json --deterministic --max-runtime-ms 32000 \
  --url "http://127.0.0.1:8788/index.html?fallback=1&testapi=1" --out runs/cp4-fallback-only
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --url "http://127.0.0.1:8788/index.html?slice=traversal&score=1&testapi=1" --out runs/cp4-slice-tune
```

| Directory | Run | What it is evidence for |
| --- | --- | --- |
| `scored-run/` | `scored-run.json`, `?score=1&fallback=1` | the CP4 candidate: 3 setbacks absorbed, **0 stock lives spent**, final x = max x |
| `scored-run-repeat/` | `scored-run.json` again, same flags | the disclosed outlier: an identical `--deterministic` repeat that absorbed **2** setbacks with THREAT 444 instead of 3 with 920, while lives spent (0) and final x (89.25) held. Kept so the variance paragraph in the proposal is checkable, not just asserted |
| `scored-run-baseline/` | `scored-run.json`'s inputs, **no flags** | the shipped path under identical inputs: **2 of 3 stock lives spent**, 13.8 tiles of ground lost |
| `scored-run-nojump/` | `scored-run-nojump.json`, `?score=1&fallback=1` | "dying is not a shortcut": stalls out at x 59.65 having spent a life and 3 setbacks |
| `ceiling-score-only/` | same script, `?score=1` only | the control: with the fallback disarmed the same inputs reach `GAME_OVER` in 9.8 s |
| `fallback-only/` | same script, `?fallback=1` only | flag isolation: no score block at all, same fallback ladder |
| `slice-tune-check/` | `mid-route.json`, `?slice=traversal&score=1` | the slice still prices with `tune: "slice"` — the two tunes do not cross-contaminate |

`report.json` (the full trace) is committed for the two runs the headline A/B
compares; the rest carry `summary.md` only, to keep the repo from swallowing
a megabyte per probe.

**Reading these summaries honestly.** Two lines in every default-run summary
are fixture-flavored and mean nothing here — `Route coverage` / `Route
inference` / `Dare pocket` are matched against the *traversal fixture's*
authored connectors, and `Attempts` / `attempt-counter deaths` are
`sliceStats.attempts`, which the game only increments inside a fixture. The
failure counters that do work outside a fixture are the `Stock lives` line
(HUD `×N`) and, on `?score=1` runs, `setbacks` in the score-snapshot line.
See `tools/playtest/README.md`, "Honesty note for default-run (non-slice)
traces".

**Variance.** `--deterministic` pins input to sim time, not the browser's
frame cadence, so repeats of the same script differ. Measured over five runs
of `scored-run.json`: lives spent (0) and final x (89.25) identical every
time, protoScore inside ≈2 % (586.9 / 597.9 / 598.0 / 598.8 / 600.5), but
setbacks 3 four times and 2 once, THREAT 920 four times and 444 once. Compare
`scored-run/` against `scored-run-repeat/` to see it. Treat the structural
outcomes as the evidence and the meter numbers as a band.
