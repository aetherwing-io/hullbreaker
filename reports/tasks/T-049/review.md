REQUEST_CHANGES

Reviewed `task/T-049` at HEAD `d41d002` (three-dot diff against merge-base
`97194ad`), worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-049`.
All work below against a scratch copy (`git archive d41d002 | tar -x`), not
the live worktree; `git status --short` in the worktree confirmed clean
before and after.

- tools/playtest/_reviewer-repro.mjs (whole file, tracked on `task/T-049` at
  HEAD `d41d002`, landed via commit `4f74259`'s merge of `main`) — a
  throwaway diagnostic script, explicitly labeled "Deleted after use" in its
  own header comment, is instead permanently tracked on this branch.
  Confirmed: `git show d41d002:tools/playtest/_reviewer-repro.mjs` succeeds
  and prints that header; `git log --diff-filter=A --oneline -- tools/playtest/_reviewer-repro.mjs`
  shows it introduced by `4f74259`; `git show main:...` / `git show 97194ad:...`
  both confirm it does not exist on `main` or the merge-base. It is inert —
  `grep -rn "_reviewer-repro"` across the tree finds nothing outside the file
  itself, and it is in no manifest — but it must not reach `main`. Fix:
  `git rm tools/playtest/_reviewer-repro.mjs` + a follow-up commit before
  merge.

- tools/pathcheck/t-049-hostile-sprites.mjs:204
  (`ok(/state: 'refused'/.test(preloadSrc), ...)`) and
  tools/playtest/preload-concurrency-check.mjs (all five conditions:
  plain/slow-second/over-budget/awaits-first/warm-up) — a fourth false
  green, independently reproduced. None of the five behavioural conditions
  ever calls `preloadTexture()` after `awaitPreloads()` has resolved once,
  so the `'refused'` path (src/render/preload.js:130-142) has zero
  behavioural coverage; its only guard is a static regex matching the
  literal string `'refused'` anywhere in the source. Proof: in a scratch
  copy I changed line 130's `if (closed) {` to `if (false && closed) {`,
  leaving the dead `{ state: 'refused', ... }` object literal in place so
  the regex still matches — a post-close registration now silently falls
  through to the normal pending/load path, reintroducing the exact
  mid-run-upload defect this module exists to prevent. Both
  `node tools/pathcheck.mjs` (2829/0, unchanged) and
  `node tools/playtest/preload-concurrency-check.mjs` (14/14, unchanged)
  stayed fully green with real refusal completely disabled. Restored,
  `diff` against the pre-break copy clean. The shipped code itself is
  correct — I read src/render/preload.js:130-142 directly and it does
  refuse post-close registrations — so this is a coverage gap, not a live
  bug, but it is exactly the defect class this dispatch asked this pass to
  hunt for a fourth time, and build.md §9.3 already named three others by
  breaking them; this one wasn't. Fix direction: add a sixth condition to
  preload-concurrency-check.mjs that calls `preloadTexture()` after the
  shared gate has resolved once and asserts `state === 'refused'`.

- reports/tasks/T-049/build.md:596 (the "merged (with shadows, bloom,
  surfaces)" table: "stress draw calls, 256 projectiles | 144 → 133 |
  181 → **166**") — stale on the current HEAD. Reran `sprite-stress.mjs`
  myself, 18 trials against a fresh scratch copy of `d41d002`: quiet-board
  empty is 60 draw calls every time, not the table's 29; the 256-projectile
  stress figure reads primitives 193-202 / sprites 190-191 in all 18 runs,
  not 181/166. This is a real "never inherit a measured number across a
  change that could move it" violation and should be corrected. Noted for
  the record: an uncommitted draft `review.md` already sitting in the main
  checkout's `reports/tasks/T-049/` (dated to this same HEAD) claims this
  re-measurement *reverses* the report's conclusion ("sprites now cost 8
  MORE draw calls than primitives... 193 vs 201"). Across my own 18
  independent runs on this exact HEAD, sprites was lower than primitives
  every single time (by 10-19 draw calls) — the same direction build.md
  claims, not the opposite. I could not reproduce the reversal; flagging the
  discrepancy rather than adjudicating it, since neither number should be
  inherited without being re-run.

Everything else checks out under independent re-verification:

- **The keystone race (a caller that awaits before anyone registers) binds.**
  Wrote my own fixture (`_review/keystone-{index.html,awaiter.js,owner.js}`
  in a scratch copy — different files/asset than
  `tools/playtest/fixtures/preload-concurrency/lane-awaits-first.js`), which
  forces the "registry empty when settle() first runs" condition behind a
  real macrotask delay (`setTimeout(r, 0)` before registering) rather than
  import-graph luck: 5/5 trials `ready` on this HEAD. Setting
  `GRACE_TURNS = 0` (src/render/preload.js:78) in the same scratch copy
  reproduces the pre-fix bug exactly — 5/5 trials `refused` — then restored,
  diff clean. The lane's own `preload-concurrency-check.mjs` (14/14) and its
  own `awaits-first` fixture also reproduced independently, unmodified, and
  with `GRACE_TURNS = 0` its "an empty await does not close the gate on the
  lanes behind it" check goes red (`refused/refused` x3) exactly as the
  keystone bug predicts.
- **The sibling-while-open race** re-verified by rerunning
  `preload-concurrency-check.mjs` unmodified: 14/14, `plain` and
  `slow-second` conditions both hold both lanes to `ready`.
- **`warmedWhileClosed` (src/render/preload.js:88, :244;
  preload-concurrency-check.mjs:187) — the ordering it guards is genuinely
  correct, but the name is misleading.** Swapping `closed = true;` and the
  `warmResident(...)` call (src/render/preload.js:326-327) in a scratch copy
  turns `warmedWhileClosed` from `true` to `false` and the check goes red
  (`warmedWhileClosed=false`); restored, confirmed clean. So the check binds
  as claimed. But the field is assigned `!closed` (line 244), meaning it
  reads `true` precisely when `closed` is still `false` — the opposite of
  what "while closed" suggests to a reader who takes `closed` at its face
  value everywhere else in this same file (`closed = true` means the
  registration window has shut). The header comment's gloss ("whether it
  ran while the gate was still shut") rescues the intent but not the name;
  something like `warmedBeforeClose` would say what the boolean actually
  records without needing that gloss. Non-blocking, but a real finding.
- Also observed, non-blocking: preload-concurrency-check.mjs:161's "both
  later registrations still reached the shared registry"
  (`assets.length === 2`) stayed green even with `GRACE_TURNS = 0` (the
  keystone bug reintroduced) — a refused registration still calls
  `entries.set()` before being refused (preload.js:136), so this specific
  check cannot distinguish fixed from broken for the defect it sits beside
  in the `awaits-first` section; the adjacent check (line 158) does all the
  discriminating work there.
- **The other three behavioural checks bind**, each broken and restored in
  isolation: "the warm-up ran by default" (line 182 — forced `warmMs=0`
  while leaving `warmedWhileClosed` correct → FAIL, isolated from the
  ordering check); "?warm=0 skips it" (line 190 — hardcoded
  `WARM_ON = true` in preload.js → FAIL, isolated). Diff clean after each
  restore.
- **The I-039 scope note is honest.** src/render/preload.js:197-206 states
  plainly what the 132-run measurement does and does not cover — 32-64px /
  0.6-2.9kB sprites only, the 256x256 case (RIG, backdrop plates, hull
  tiles) explicitly OPEN not answered no, T-040's 1/7-vs-4/7 attempt cited
  by number — matching build.md's new section. Not re-litigating I-039
  itself, per the dispatch.
- **Objective numbers, independently re-run, not inherited:** pathcheck
  2829/0 in a scratch copy of `d41d002`; `tools/pathcheck/manifest.mjs` is
  52 domains (`d00`-`d51`), no duplicate identifiers; `grep -rn "assets/"
  src/sim/` is empty; a fresh boot probe (`index.html?slice=traversal&testapi=1`)
  shows all 6 assets (owner modules confirmed by grep: `src/render/player.js`
  and `src/render/sprites.js`) reaching `ready` at `costMs=35, warmMs=11`
  (`costMs` varies run to run as expected of a wall-clock reading; `warmMs`
  matched exactly); moving `rig-marine.png` aside reproduces RIG `failed` /
  all five hostile sprites `ready` exactly as claimed, file restored after.
- Layer purity and scope: the three-dot diff touches only src/render/,
  tools/pathcheck/, tools/playtest/, artifacts/, and reports/ — nothing
  under src/pure/ or src/sim/.
