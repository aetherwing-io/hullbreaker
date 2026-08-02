REQUEST_CHANGES

- task/T-049 (branch ref) — HEAD moved from the assigned `89f145f` to `d41d002`
  during this review: a concurrent agent (fix-T-049) merged main
  (`4f74259`, resolving an add/add conflict against T-040's own,
  independently-merged 171-line `src/render/preload.js` — "this gate
  wins") and then landed one doc-only commit (`d41d002`). This review
  judges `d41d002`, three-dot diff against the current merge-base
  `97194ad`. All findings and numbers below are against that HEAD, verified
  in scratch copies (`git archive <ref> | tar -x`), not the live worktree,
  after the live worktree itself gave an inconsistent pathcheck count
  (2829 vs a scratch copy's 2748) mid-session for exactly the reason
  `89f145f` documents.

- tools/playtest/_reviewer-repro.mjs (whole file, landed in commit
  `4f74259`) — a throwaway diagnostic script I (the reviewer) wrote into
  the live worktree while independently reproducing the multi-caller races
  was swept into fix-T-049's concurrent merge commit and is now tracked on
  `task/T-049`. This is the exact "shared-worktree hazard" `89f145f`
  already filed as a proposed inbox issue, recurring live during this
  review. The file is inert (registered in no manifest, imported by
  nothing, does not affect any measurement above) but must not reach
  `main`: `git rm tools/playtest/_reviewer-repro.mjs` + a follow-up commit
  before merge. Not fixing it myself, per "you change nothing" — task/T-051
  and task/T-052 both branched at `5c8008e`, before this landed, so neither
  has inherited it yet.

- tools/pathcheck/t-049-hostile-sprites.mjs:204 (`ok(/state: 'refused'/.test(preloadSrc), ...)`)
  and tools/playtest/preload-concurrency-check.mjs (no condition ever
  calls `preloadTexture()` after the gate has closed) — a fourth false
  green. The "refused vs timeout" guard is a literal-text presence check,
  and none of the five behavioural conditions (plain/slow-second/
  over-budget/awaits-first/warm-up) exercises a post-close registration.
  I confirmed the gap by patching a scratch copy of `src/render/preload.js`
  (the `if (closed) { ... }` block starting at line 130) so a post-close
  registration silently falls through to the normal pending/load path —
  reintroducing the exact mid-run-upload defect this module exists to
  prevent — while leaving a dead `{ state: 'refused' }` object literal in
  unreachable code to keep the regex matching. Both `pathcheck` (2748/0,
  then 2829/0 re-confirmed on current HEAD with the same patch) and the
  full `preload-concurrency-check.mjs` suite (all conditions, e.g. 6+3+1+
  3+2 checks) stayed 100% green with real refusal completely disabled.
  The shipped code itself is correct — I read it directly and it does
  refuse post-close registrations — this is a coverage gap, not a live
  bug, but it is precisely the class of defect this lane was asked to
  hunt for a fourth time. Fix: add a sixth condition to
  `preload-concurrency-check.mjs` that registers after `awaitPreloads()`
  has resolved once and asserts `state === 'refused'`.

- reports/tasks/T-049/build.md:590-612 (§7's "merged (with shadows, bloom,
  surfaces)" perf table, e.g. "stress draw calls, 256 projectiles | 144 →
  133 | 181 → 166") — stale and now backwards. Measured after the FIRST
  main-merge (`d29297f`, main@`2c638aa`) and never re-measured after the
  SECOND (`4f74259`, main@`97194ad`, folding in all of T-040 and T-044).
  Reran `sprite-stress.mjs` twice on a clean scratch copy of current HEAD
  (`d41d002`): quiet-board draw calls are 60/60 for both bodies, not the
  reported 29; under the 256-projectile stress test, primitives draw 193,
  sprites 201 — sprites now cost 8 MORE draw calls than primitives, the
  opposite of the report's "181 → 166" and its stated conclusion ("the
  sprite path still costs fewer draw calls"). The load-bearing acceptance
  number (60fps, 0 frames over 20ms at 256 projectiles) still holds on my
  fresh measurement (fps 120-126, worst frame 10.2-10.9ms both ways), so
  this is a stale/reversed secondary claim, not a functional regression —
  but it is exactly the "never inherit a measured number across a change
  that could move it" violation the project's own evidence standard names,
  and should be re-measured and corrected before another lane treats it as
  current.
