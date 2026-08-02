PASS

QA verdict for T-045 (the scale pass — graded backdrop tiers + human-scale
reference objects). Worktree pinned at `task/T-045` HEAD `7f1f534`, served
from a dedicated copy (never touched 8741/8742/8749), independently against
the branch tree and against its merge-base `cad82ed` for comparison. Every
claim below was re-run by me; nothing here is inherited from build.md or
review.md without independent reproduction.

## Setup

- Branch tree served: `node tools/serve.mjs 8765 --root
  /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-045 --quiet`
- Base tree (`cad82ed`, this branch's merge-base) checked out to a scratch
  worktree (`git worktree add <scratch>/t045-base cad82ed`) and served on
  `node tools/serve.mjs 8766 --root <scratch>/t045-base --quiet`, used only
  for the entry-19 distribution comparison (item 3 below).
- Both ports killed at the end of this session. Neither 8741 nor 8742 was
  bound, probed, or touched.

## 1. Regression / durability (SPRINT gate + hard rules)

- `node tools/pathcheck.mjs` in the pinned worktree: **1853 passed, 0
  failed** — reproduces the build report's number exactly, and the +41 over
  the merge-base (`cad82ed`: 1812, confirmed by inspection of
  `git diff main...HEAD -- tools/pathcheck.mjs`, which is purely additive)
  matches review.md's reconciliation.
- Read the full T-045 pathcheck block (`tools/pathcheck.mjs`, ~220 added
  lines): the four claims it asserts (haze ladder incl. per-`?view=`
  shift-invariance, play-band fence at every view, far-body column coverage,
  matched near/far mark dimensions traced to `CONFIG.player.height`) are
  computed from the actual bake plan (`limbBakePlan`), not from authored
  config values alone — this is assertion against the emitted geometry, the
  right subject.
- Smoke set against the pinned server, `--deterministic`:
  - `scripts/mid-route.json`: completed, 0 deaths, served build
    `traversal-slice (traversal-v1)` — matches build report.
  - `scripts/transform-slice.json`: completed, 0 deaths, served build
    `transform-slice`, `?enemies=0` honoured (0 hostile rows across 213
    ticks).
  - `scripts/six-face-spaced-run.json` (`--stop-on-game-over
    --max-runtime-ms 145000`, the task-named script): died at 3 lives, 12
    kills, wall time 51.3s / sim clock 50.2s — inside the build report's own
    documented 50.2-55.1s band. Re-ran twice more (see item 3): 9 kills/40.9s
    and 26 kills/78.3s, both clean deaths at 3 lives.
  - `node tools/playtest/g1-capture.mjs selftest`: **ALL PASS, CONSOLE
    CLEAN** (35/35/35/37/36 checks across normal, normal+g1,
    normal+g1+view=near, traversal, transform) — reproduces build.md
    exactly.
  - Direct `?selftest=1` browser check on the pinned port: **SELFTEST PASS
    (35 checks)**.
- `consoleErrors` / `pageErrors` / `teardownErrors`: **empty array on every
  run I made** (mid-route, transform-slice, six-face-spaced-run x3). No NaN
  in any report.json.
- One pre-existing console message — `Failed to load resource: 404` on
  page load, no URL attributable via Playwright's response/requestfailed
  listeners (likely a favicon-class resource, harness-invisible) — is
  **reproduced identically on the `cad82ed` base tree**, so it predates this
  branch and is not a T-045 regression. Not filed as an issue: it is
  unrelated to this diff and I have no evidence beyond "present on both
  trees."
- Worktree hygiene: `git status --short` clean throughout (the reviewer's
  `reports/tasks/T-045/review.md` is the only untracked file, as expected).

## 2. Reference objects, depth staging, readability (gate items 1-3, 5)

- Read `git diff main...HEAD -- src/config.js`: the `mark` table's numbers
  match the build report's claims exactly (`door.rimH: 2.9`, `ladder.rungW:
  1.3`, `ladder.pitch: 0.62`), all derived from `CONFIG.player.height` (1.7)
  and `CONFIG.player.width`, and pathcheck asserts the ratios (door 1.2-2.0x
  RIG's height, rung pitch <= half his height, rung width >= his shoulder
  width, rail post <= 0.8x his height) rather than trusting hardcoded
  numbers.
- `IS_G1 = ACTIVE_FIXTURE === null && !ZIPPER_REVEAL` (`src/mode.js:103`) —
  the backdrop bake runs in the **default six-face run**, the mode a real
  player is actually in, not a demo-only fixture. Confirmed live: my
  `six-face-spaced-run` game-over screenshot (140m, wave 2/6) shows the
  ladder/backdrop mass in frame well past the first joint, later than any
  of the three paired captures in `artifacts/scale-v1/`.
- Viewed all six committed `artifacts/scale-v1/0{1,2,3}-*-{before,after}.png`
  directly. Before: one flat teal wash above the wall in all three. After:
  three distinct, separable planes — a rust-toned near sister-limb with
  visible rung ladders and door/window cutouts, a teal mid drum spine, and a
  stepped teal far-body silhouette — confirmed in every one of the three
  moments, not just a contrived shot. This is real depth staging, not
  authored-but-unseen geometry.
- Reference objects are legible at the shipped FAR view: ladders and door
  cutouts on the hull skirt beneath RIG read as distinct dark rectangles and
  rungs at normal viewing size in every "after" capture; the same ladder
  motif is visible, smaller, on the backdrop sister limb in the same frames
  — the near/far pairing the build report describes as the mechanism is
  visually present, not just asserted in `pathcheck`.
- Readability under combat: the six-face-spaced-run's final frame (wave 2/6,
  6 hostiles, 12 kills already landed) shows hostile markers (green
  triangles) clearly legible against the new backdrop mass, with no overlap
  between hostile icons and the graded anatomy tiers — consistent with the
  play-band fence pathcheck asserts structurally (no backdrop piece is ever
  drawn low enough to intersect the hostile lane cap).

## 3. Re-darkening (gate item 4, decisions.md entry 14) and variance (entry 19)

- Re-ran `node tools/playtest/scale-capture.mjs shots` myself (not read from
  the committed report): reproduces the build report's numbers closely —
  draw calls 102/102, 97/97, 93/88 across the three moments (the
  corner-approach pair differs by up to 5, same class of variance the build
  report documents as tracking live hostile/projectile counts, not the
  limb), and the measured sky-band stats land within a few points of the
  committed table (e.g. 01-after largest-color 28.1% vs the committed
  28.4%, small run-to-run capture jitter per the tool's own honesty note).
  Sky median stayed at 76.5-78.3 across all six frames, never trending
  toward the operator-rejected full-dose darkness (entry 14) — the pass
  adds mass in front of the sky, it does not darken it.
- Ran `tools/playtest/juice-stress.mjs` (the 200+-projectile ceiling probe
  that review.md flagged as **not re-run** in the build report) myself:
  `control` (0 injected load) and `stress` (256 live projectiles + death
  burst + flash every frame) read **identical** frame timing — 30fps,
  avgMs 33.33 both, worstMs 34.4 vs 34.3. This dev machine's headless Chrome
  is vsync-capped at 30Hz here (not 60), so the absolute fps number isn't
  the useful reading — but per the harness's own honesty note, `worstMs`/
  `over20ms` are the load-bearing fields, and they are flat between zero
  load and full stress load. That closes the gap the review noted: the
  scale pass adds no measurable per-frame cost even under the stress
  scenario.
- Entry 19 (spread is the feature, don't accidentally flatten it): the
  scale pass touches only `src/config.js` (a new `CONFIG.limb.backdrop`/
  `.mark` block after the existing `tone` array), `src/pure/limb.js` and
  `src/render/limb.js` — no file under `src/sim/` is in the three-dot diff,
  so hostile/spawn/collision logic cannot have moved. I still checked
  empirically: 3 runs of `six-face-spaced-run.json` on the branch (12
  kills/51.3s, 9 kills/40.9s, 26 kills/78.3s, all 3-life deaths) vs. 2 runs
  on the `cad82ed` base tree (11 kills/57.0s, 10 kills/54.3s, also 3-life
  deaths) — overlapping ranges, same magnitude of run-to-run spread on both
  trees, `minEdgeMargin` identical at 3.59 tiles on two of the branch runs.
  No evidence the render-only change narrowed, widened, or otherwise shifted
  the outcome distribution.

## 4. Perf / draw calls (gate item 6)

Covered above (item 3): draw-call parity reproduced independently
(structural guarantee — 8 material buckets before and after, same
`MATERIAL_FOR` table — plus the re-run stress harness showing no per-frame
cost added). Budget was +1 to +2; measured spend is 0, confirmed twice
(build report and my own re-run).

## What I did not additionally chase

- Did not identify the exact resource behind the pre-existing 404 console
  message (present on both trees) — out of scope for this diff and not
  a T-045 regression.
- Did not push a policy past the first wave gate (corner 1) for a fourth
  capture; the build report's own note that a judged policy dies there on
  every attempt reproduced true in my longer runs too (best run reached
  scroll ~140m before dying, none captured a frame past the joint). No new
  evidence needed here beyond what's already flagged as an open item.

## Verdict

All eight checklist items hold up under independent reproduction: reference
objects exist and are legible in real play, depth staging is real (not
authored-but-invisible), no re-darkening trend, readability during combat is
intact, draw calls are flat (including under the stress harness the review
flagged as unrun), the run-to-run spread is unaffected, and pathcheck +
smoke scripts + selftest matrix are all green with zero console/page errors
across every run I made. **PASS.**

No new defects found. The two proposed issues already in build.md (I-???
sky-still-one-color, I-??? corner-approach bare-sky gap) are both real, both
already correctly scoped as art/S3/needs-an-operator-decision, and I have
nothing to add to them.

## PROPOSED INBOX ISSUES

None from this playtest pass — build.md's two proposed issues stand as
filed; I found no additional defects.
