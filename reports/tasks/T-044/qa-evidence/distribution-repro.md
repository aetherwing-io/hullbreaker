# QA reproduction of the T-044 difficulty-distribution measurement

Method: `node run.mjs scripts/<six-face-aimed-run.json|six-face-full-run.json>
--deterministic --stop-on-game-over --max-runtime-ms 245000 --base-url
<pinned>`, run from the MAIN checkout's `tools/playtest` against two pinned
static servers (`tools/serve.mjs`, no python): branch `task/T-044` @ `03b775e`
on port 8790, merge-base `69e1f906262cdebd4bbc7f83f0dd27885e8baa92` (a scratch
`git worktree`) on port 8791. n=5 per cell, not interleaved (one more
non-interleaved session, same limitation build.md's own batches have).
`scrollX` read as the max value in `report.json`'s `trace[]`, same field the
build report used. Reference marks per build.md: 75/140/205 = died AT that
gate's halt; a value strictly above 140 = a genuine gate-2 clear.

| policy | tree | n | values (scrollX) | floor | ceiling | gate-2 clears |
| --- | --- | --- | --- | --- | --- | --- |
| aimed | base | 5 | 95.674, 140, 140, 140, 140 | 95.67 | 140 | 0/5 |
| aimed | branch | 5 | 140, 140, 140, 114.017, 126.652 | 114.02 | 140 | 0/5 |
| full-run (weak) | base | 5 | 140, 75, 75, 75, 75 | 75 | 140 | 0/5 |
| full-run (weak) | branch | 5 | 140, 140, 98.207, 75, 140 | 75 | 140 | 0/5 |

Raw reports: `reports/tasks/T-044/qa-evidence/{aimed,full}-{base,branch}-{1..5}/report.json`.

## What this does and does not show

- **full-base reproduces build.md's own base weak-policy row EXACTLY**
  (`140,75,75,75,75`) — good evidence the harness/build is deterministic and
  my pinned setup matches theirs.
- **This session shows ZERO gate-2 clears on either tree, for either
  policy** — no branch advantage visible in this batch, for aimed OR weak.
  This does not contradict build.md/review.md: both already document that
  some batches show no effect at all (their own interleaved batch: 1/5 both
  trees; one of their non-interleaved aimed-branch batches: 140,140,140,140,140,
  also zero clears). This is a fifth/sixth data point in the same noisy
  picture, not a refutation — but it further weakens confidence in a
  reliable branch advantage and should be read alongside the existing
  batches, not instead of them.
- Folding this batch into the existing pooled aimed-policy counts (n=18/side
  before): base 2/18 -> 2/23 (8.7%), branch 6/18 -> 6/23 (26.1%). Still leans
  branch, smaller margin, same direction as the previous revision's
  downward trend (~5x -> ~3x -> ~3x, roughly, depending which cuts are
  pooled). Not resolved either way; routed to the operator per entry 19,
  same as the build report already does.

## A new observation from these same runs: a pre-existing gate-1 wedge (NOT T-044's terrain)

3 of the 20 runs (`full-base-2`, `full-base-3`, `full-base-4` — 3 of 5 on the
UNMODIFIED merge-base tree; also `full-branch-4`, 1 of 5 on the branch) never
reached GAME_OVER inside the 245s cap: the weak policy spends 2 of its 3
lives quickly, then sits ALIVE, PINNED at essentially one x position
(58.94-59.99, scrollX=75.0 — wave gate 1) for 160-200+ seconds with hp and
lives flat and zero further progress, until the run hits its script-window
cap. `meta.stopReason: "script-window"`, not `"game-over"`. See
`full-base-2/report.json`'s `trace[]` (sampled every ~20s from t=40s to
t=240s: x pinned at 59.47 throughout) and `full-base-3`, `full-base-4`,
`full-branch-4` for the same shape.

This reproduces byte-for-byte on the **unmodified merge-base**
(`69e1f90`), so it predates T-044 and is not caused by ARRIVAL/ARENA (which
only start after corner 1, well past scroll 75/wave gate 1). Filed to
SPRINT's Inbox separately, out of scope for this task's verdict. Caveat,
stated plainly: `six-face-full-run.json`'s policy has **no vertical-aim
rule at all** (that's what makes it "weak" in this project's own
methodology) — a real player always has that verb, so this is evidence of
a possible dead spot at wave gate 1 worth a human look, not proof a human
gets wedged the same way.
