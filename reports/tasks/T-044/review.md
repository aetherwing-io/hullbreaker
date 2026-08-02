APPROVE

## Scope of this pass

Focused re-review only: the integrator's monolith→module migration (`a73e028`)
and the builder's follow-up fix (`3cbc015`) that turned the resulting RED
(2497/2) into `2502 passed, 0 failed`. Static-anatomy compliance, layer
purity, determinism, and the difficulty-distribution measurement were
already verified in the prior review pass and are not re-litigated here. Worktree left clean (`git status --short` / `git diff HEAD --stat` both empty
at time of writing).

## Findings (most severe first)

- `tools/pathcheck/t-044-corner-setpieces.mjs:8,13` (hygiene, not a blocker)
  — the migrated module imports `existsSync`, `readdirSync`, `stripComments`,
  `readFileSync`, and `near` from `_context.mjs`/`node:fs`, none of which are
  called anywhere in the file (only `join` and, after the fix, `execFileSync`
  are used). This is debris from the integrator's mechanical re-homing at
  `a73e028`, not something the builder's fix commit touched or introduced.
  Harmless (ESM doesn't error on unused named imports; this is a `tools/`
  harness file, not shipped game code, so no layer-purity or determinism rule
  is implicated) — worth a one-line trim next time this file is touched, not
  worth a fix cycle on its own.
- Everything else below checked out clean; no other findings.

## Check 1 — the T-039 platform-count collision: FIXED, not silenced

`tools/pathcheck/t-039-contact-shadows.mjs`'s `(a)` block did **not** get a
bumped magic number. The builder replaced the exact-count assertion
(`csPlatforms.length === 62`) with a non-trivial lower bound
(`csPlatforms.length >= 20`), and rewrote the comment to state plainly that
the count was never the property T-039 cares about — it was only a guard
against the per-platform loop below running vacuously (0 platforms → 0
iterations → the "every platform differs from `groundTopAt`" check would
pass trivially on nothing).

I verified this claim rather than took it on the commit message's word:

- **The actual property-under-test is the unchanged per-platform loop**
  (`t-039-contact-shadows.mjs:70-79`, byte-identical before and after this
  fix): `ok(resolved === pl.y, ...)` for every real platform in the shipped
  level, using `contactShadowGroundY`. I broke the underlying property
  directly — flipped `pl.y > best` to `pl.y < best` in
  `src/pure/contactShadow.js:38` (wrong-surface selection) — and reran
  `node tools/pathcheck.mjs` against the current 77-platform level: 30+
  `FAIL T-039 (a): an actor standing on the platform [...] casts onto the
  PLATFORM top (got ...), not groundTopAt (...)` failures, i.e. the real
  test still binds on this branch's terrain, not just on the pre-migration
  62-platform level T-039 was originally written against. Restored
  (`git checkout -- src/pure/contactShadow.js`); pathcheck back to
  `2502 passed, 0 failed`; `git status --short` clean.
- **The `>= 20` bound is a real precedent, not invented for this fix**:
  `tools/pathcheck/pathcheck-suite.mjs:687` already asserts
  `plats.length >= 20` ("catwalk lanes generated") for exactly the same
  non-vacuousness reason, cited by name in the new comment.
- **The count itself is still pinned, just in one place instead of two**:
  `pathcheck-suite.mjs:710` (`gH.length === 445 && plats.length === 77 && ...`)
  is the generator's own regression pin and was already updated at the
  `a73e028` migration step (`62 → 77`, message string also corrected from
  stale "62 platforms" text). T-039 no longer duplicates that pin, which is
  the actual fix to the "cross-lane collision" the report describes — one
  fact, one assertion, one place to go stale, rather than two.

This reads as the correct fix, not a maintenance trap and not a loosened
gate: the property T-039's own build report (`reports/tasks/T-039/build.md`
§2) says its negative control actually exercised — "flipped the
platform-selection comparison → 63 assertions failed" — is the per-platform
loop, and that loop is untouched.

## Check 2 — the lane's own terrain proof (FAILURE 2): migration gap, genuinely fixed

`tools/pathcheck/t-044-corner-setpieces.mjs`'s driven six-face proof calls
`execFileSync` to run the sim headlessly in a child process
(`t-044-corner-setpieces.mjs:221`). The re-homing at `a73e028` split the
228-line monolith block into a standalone module with explicit imports but
dropped the `execFileSync` import — every other domain module that shells
out (`t-009-pocket-route-works-driven.mjs`, `t-009-whole-run-crossable-driven.mjs`,
etc.) imports it directly from `node:child_process`, and nothing re-exports
it from `_context.mjs`. The fix commit (`3cbc015`) adds exactly that one
import line and touches nothing else in the file.

I reproduced this directly rather than trusting the diagnosis: removed the
`execFileSync` import from the current (fixed) file and reran pathcheck —
result was **exactly one failure**, `FAIL T-044: the six-face run with
ARRIVAL/ARENA installed simulates headlessly end to end (...)`, at
`2498 passed, 1 failed`. The three downstream assertions that depend on the
child's output (`run.state`, `run.scrollX >= run.end`, `run.mounted.length >=
3`) are structurally gated behind `if (run)` — with the import missing they
are silently skipped rather than failed, the same idiom
`t-009-whole-run-crossable-driven.mjs:110` already uses for its own
driven proof, so this is an existing codebase pattern, not something new
introduced by this fix. Restored the import; pathcheck back to
`2502 passed, 0 failed`; `git status --short` clean. This confirms the
failure was pure harness plumbing (a `ReferenceError` in the parent process
before the child ever runs), not a real terrain/traversal regression against
merged main — no assertion threshold, comparison, or message changed for
this half of the fix, only the missing import.

## Check 3 — the integrator's migration: verified, reconciles cleanly

- **Assertion text/order for the T-044 block**: diffed the T-044 section of
  the pre-migration monolith (`git show 03b775e:tools/pathcheck.mjs`, lines
  9237-9463) against the equivalent span of the new
  `tools/pathcheck/t-044-corner-setpieces.mjs` (lines 19-245) — **byte-identical**,
  `diff` empty. The only textual change anywhere in this file across the
  whole migration+fix is the one added `import { execFileSync } ...` line,
  which sits outside the diffed span.
- **T-039/pathcheck-suite.mjs at the migration step**: `git diff main a73e028
  -- tools/pathcheck/t-039-contact-shadows.mjs` is empty — the integrator's
  merge commit touched `manifest.mjs` (new `d49` import/registration) and
  `pathcheck-suite.mjs` (the two re-pins, `62→77` and the fingerprint) only;
  `t-039-contact-shadows.mjs` was untouched until the builder's own fix
  commit, which is the one change reviewed under Check 1.
- **2502 reconciles as main's 2469 plus this lane's own, nothing dropped**:
  confirmed by direct count rather than arithmetic on the report's say-so.
  `main`'s `buildLevel(CONFIG).platforms.length` is 62; this branch's is 77
  (checked directly with a one-off `node -e` import of each tree's
  `src/pure/generator.js`). `t-044-corner-setpieces.mjs` contains exactly 18
  `ok(` calls (all single-invocation, no loops) — matches the report's "18
  new assertions" claim. The remaining 2502 − 2469 − 18 = 15 comes from
  `t-039-contact-shadows.mjs`'s own per-platform loop
  (`for (const pl of csPlatforms) { ok(...) }`) now iterating 77 times
  instead of 62 — a natural consequence of the terrain legitimately adding
  15 platforms, not a hidden or invented assertion. `main` and this branch
  both report `t-039-contact-shadows.mjs` at 34 `ok(` call sites in source
  (one of them a loop), so no assertion was added or removed there either —
  only the loop's iteration count grew with the level.

Net: both post-migration failures were genuine harness/integration defects
(a duplicate, brittle count-pin, and a lost import) with root causes fully
understood and independently reproduced by breaking each fix and watching
the exact original failure come back; neither was papered over by weakening
what the tests actually check. `node tools/pathcheck.mjs` reproduces
`2502 passed, 0 failed` on a clean worktree.
