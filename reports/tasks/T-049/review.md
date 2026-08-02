APPROVE

Re-review scope confirmed: `git diff --name-only d41d002..658539f` touches only
`artifacts/**`, `reports/**`, and `tools/playtest/**` — no `src/` file, no
`index.html`. The runtime is unchanged since the passing playtest at `d41d002`;
this review covers only the three outstanding items from the prior cycle.

1. Sixth condition (`late`, tools/playtest/preload-concurrency-check.mjs:170-221)
   plus fixture (`fixtures/preload-concurrency/index-late.html`,
   `lane-late.js`) — reproduced independently, not taken on the lane's word.
   Used two scratch copies (`git archive HEAD | tar -x`, `node_modules`
   symlinked in, run against ephemeral `port: 0`, never 8741/8742):
   - Deleting only the `if (closed) {...}` refusal block in
     `src/render/preload.js` (lines 130-142) leaves the residual `closed`
     check inside the `TextureLoader` success callback (line 167 at HEAD),
     so the fallback path never calls `done()` and the caller's
     `await preloadTexture()` hangs forever. Reran the check: exactly the 5
     clean FAILs the lane reports (page hangs; the other four late-checks
     read "(no trial completed)"), all other conditions (plain, slow-second,
     over-budget, awaits-first, warm-up) stay green. Matches the lane's claim
     exactly.
   - Also removed the second, residual `closed` guard in the load callback
     (so a late registration truly succeeds silently) to test the
     distinguishing claim: the check then reports a *different* signature —
     "the late page finished at all" PASSES, and the state/hasTexture/warning
     checks FAIL with real data (`ready, ready, ready`; `hasTexture=true`
     ×3; no warning) — i.e. the actual mid-run-load defect this gate exists
     to prevent. So the check does distinguish "hung" from "loaded when it
     should have refused"; they are not collapsed into one failure mode.
   - Ran the real HEAD code unmodified: all 15 conditions PASS, including the
     three "late" ones (refused / no texture / warning names the file /
     on-time lanes unaffected).
   - The check drives real behaviour through a headless browser
     (`window.__T049_LATE`, `__HB_PRELOAD()`) — grepped for any source-text
     inspection of `preload.js` in the check file; none found. Not a guard in
     disguise.

2. `tools/playtest/_reviewer-repro.mjs` — confirmed absent: the diff shows a
   69-line pure deletion, `git ls-tree -r 658539f` has no such path, and it is
   not present in the worktree.

3. `reports/tasks/T-049/build.md` §7 perf table — confirmed re-measured, not
   inherited. The table now carries three columns: pre-merge (own base),
   "vs main 2c638aa — STALE" (explicitly labeled as a record of a point the
   tree has since moved past), and "vs main 7c5ad31 — CURRENT" (bold, the
   number that stands). Cross-checked the CURRENT column against
   `artifacts/sprites-v1/perf/result-merged2.json` (measuredAt
   2026-08-02T12:13:51Z): draw calls 73→68 and 201→183, worstMs 10.3/10.3,
   over20ms 0/0, triangles ~107.4k all match the JSON's `quiet`/`perf`
   fields. Prose was updated to match (no longer claims a single "merged"
   number).

Working tree left clean (`git status --short` empty); no scratch files were
introduced into this worktree.
