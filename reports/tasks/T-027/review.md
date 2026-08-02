APPROVE

Port used: 8790 (8741/8742 untouched).

Scope check: `git diff main...HEAD --stat` (base `810d326`) touches only
`reports/tasks/T-027/build.md`, `tools/pathcheck.mjs`, `tools/playtest/**`.
Zero `src/` files, zero `index.html`. Layer purity / determinism / static-
anatomy / frozen-jump-constant rules are therefore not implicated by this
diff; no `?hook=1` touch found in the diff.

## Independent verification of the six items

1. **I-018 correction — CONFIRMED.** `git show 810d326:tools/playtest/run.mjs`
   shows the pre-T-027 code unconditionally set `process.exitCode = 1` with
   the message "sample.gameMs was never a number…" whenever
   `dispatchedCount === 0`, regardless of why. The committed evidence
   (`tools/playtest/runs/gate-T-013-title-det-probe/report.json`, fidelity
   `testapi`, 2 events / 0 dispatched, no `actualDispatchGameMs` on either
   event) matches that shape exactly, so the old repro already exited 1 for
   the wrong reason. The Inbox's "still exits 0" clause does not reproduce;
   the zero-dispatch clause does. `SPRINT.md:1560` (I-018 as filed) is now
   stale on that one clause and should be annotated by the integrator during
   triage — this diff isn't the place for it (`SPRINT.md` isn't in scope
   here) but it shouldn't be silently forgotten.

2. **I-028 before/after — CONFIRMED on all three traces, exactly.** Reran
   `analyze-run.mjs --policy` myself against the three committed traces
   (`tools/playtest/runs/gate-T-019-spaced-{1,2,3}`), both against
   `git show 810d326:…six-face-spaced-run.json` (self-check) and the current
   file. Self-check reproduces the embedded numbers byte-for-byte (trace 1:
   `[5]×[6]` 3 ticks, edgeMargin 7.37–7.70). After the guard change that pair
   is 0/0/0 on all three; all-cause cancellation moves 5.3→4.9%, 4.5→4.5%,
   8.4→4.8% — matching build.md's table exactly. The claimed residual
   (gate-servo `hold left` rules 2/4 still cancelling 1, 0, 7 ticks) also
   reproduced exactly.

3. **Negative control — has teeth, but the reported count is off by one.**
   Reverting `edgeMargin>8`→`>6` in `tools/playtest/scripts/six-face-spaced-run.json`
   and rerunning `node tools/pathcheck.mjs` gives **1690 passed, 1 failed**
   (reproducibly, twice), not build.md's claimed "1689 passed, 1 failed" —
   1691 total either way (1690+1 here vs. the clean run's 1691+0), so the
   assertion genuinely flips red on revert and the count discrepancy is a
   one-off transcription slip in the build report, not a real second failure.
   Restored the file afterward; worktree confirmed clean and back to
   1691/0.

4. **Six-face survival-band annotation — present and accurate where this
   diff touches, not everywhere the figure appears.** `tools/playtest/README.md`
   and the script's own `description` both correctly mark 50.2–55.1s as the
   pre-`edgeMargin>8` measurement. The identical figure is also quoted,
   un-annotated, in three files this diff does not touch:
   `docs/playtests/2026-08-victory-box.md:64,74,308`,
   `tools/playtest/reports/t019/README.md:15`, and `SPRINT.md:1681`. Those are
   dated T-019 playtest records, not living docs this task owns, so leaving
   them alone is defensible lane discipline rather than an omission — but
   flagging it since a future reader could quote any of the three as if it
   described current behavior.

5. **transform-slice non-determinism — CONFIRMED pre-existing, not
   introduced.** Ran 4 alternating runs myself against a `git archive 810d326`
   copy (old harness) and 4 against the worktree (new harness), same served
   game code, same URL: old harness 2 completed / 2 died, new harness 2
   completed / 2 died. Matches the builder's own wider 7-pair sample in
   direction and magnitude; the harness change doesn't touch anything in this
   script's own code path (no policy, no `--deterministic`).

6. **Assertion counts — CONFIRMED.** Base (`810d326`, via `git archive` into a
   clean tree): **1674 passed, 0 failed**. Worktree HEAD: **1691 passed, 0
   failed**. +17 assertions, all new, none deleted (`git diff … | grep '^-'`
   on `tools/pathcheck.mjs` returns nothing — purely additive).

Also directly re-ran both browser repro scripts myself (not just trusted
build.md): `title-shell-deterministic.json --deterministic` → 4/4 dispatched,
1 via `wallclock-title`, exit 0; `tap-teardown-probe.json --deterministic`
→ 2/2 clean runs, `pageErrors: []`, `teardownErrors: []`,
`tapsSettledAtTeardown` 3 and 7 (one of three attempts hit an unrelated
browser-boot timeout under machine load, unrelated to this diff — retried
clean).

## Findings (non-blocking)

- `reports/tasks/T-027/build.md:128` — the negative-control row reports
  "1689 passed, 1 failed"; the true count (reproduced twice) is 1690/1. Minor
  transcription error in the self-report, not in the tested code; the
  substance of the claim (the assertion has teeth) holds.
- `tools/playtest/lib/driver.mjs:356-359` — the comment "any keyboard failure
  from this point on is the harness closing up" sits directly above the
  `flushPendingTapReleases()` call, but `tearingDown` isn't set `true` until
  *after* that call returns, so a hypothetical non-`CLOSED_RE` failure during
  the flush itself would still route to `pageErrors` via `noteKeyError`'s
  `CLOSED_RE` fallback rather than the `tearingDown` branch. Harmless in
  practice (Playwright's own close-race errors all match `CLOSED_RE`), but
  the comment slightly overstates what the flag actually guarantees at that
  point in the sequence.

## Merge-order note (T-025 overlap, not a defect in this diff)

Both branches touch `tools/pathcheck.mjs`, `tools/playtest/lib/driver.mjs`,
`tools/playtest/lib/report.mjs`, `tools/playtest/README.md`, and
`tools/playtest/run.mjs`. Checked each with `git diff main...HEAD` on both
worktrees (same `main` tip, so base line numbers are directly comparable):

- **`tools/pathcheck.mjs` — real, but shallow, collision at the same anchor.**
  T-025's new top-level section and T-027's new top-level section (the
  deterministic-dispatch honesty block) both insert immediately after the
  same `}\n}` at base line ~8035 (T-025's hunk header: `@@ -8035,6 +8035,191
  @@`; T-027's second hunk: `@@ -8024,9 +8057,124 @@`, whose insertion also
  ends at that same boundary after nesting the crush-window assertion just
  *inside* it). This is exactly the "two lanes appending different truths to
  the same place" class `docs/ORCHESTRATION.md` §"Merge playbook" already
  paid for once. The two new sections are semantically independent (T-025:
  death/route/enemies-flag telemetry honesty; T-027: crush-window +
  deterministic-dispatch honesty) and neither references the other, so the
  fix is splice-both, not choose-one: land whichever merges first normally,
  then for the second, do NOT trust a naive auto-merge — pull the second
  lane's self-contained section by its banner comment through its closing
  brace (`git show <branch>:tools/pathcheck.mjs`) and splice it into the
  post-first-merge file, per the playbook's explicit brace-counting warning.
  Re-run `node tools/pathcheck.mjs` after and confirm the total equals
  1674 (this branch's base) + both lanes' new-assertion counts, 0 failed.
- **`tools/playtest/lib/driver.mjs` — low risk, needs a manual check, not a
  rewrite.** T-025 inserts `servedFixture,` right after `trace,` in the
  returned object (line 297 in the pre-diff file); T-027 inserts four fields
  (`teardownErrors, tapsSettledAtTeardown, titleWallclockDispatches,
  stopReason`) right after `pageErrors,` (line 300) — 3 lines apart, likely
  to render as one touchy hunk rather than two independent ones. Not a
  logical conflict (both are pure additions to the same growing object), but
  worth a manual look after merge to confirm the resolved object literal has
  **all five** new fields, since a careless resolution could silently drop
  one side and produce `undefined` at the call site rather than an error.
- **`tools/playtest/lib/report.mjs`, `run.mjs`, `README.md` — low risk,
  well-separated.** Checked hunk locations on both sides; in all three files
  T-025's and T-027's edits land in different, non-adjacent sections (e.g. in
  `report.mjs` T-025 rewrites the "Outcome"/pacing block while T-027 adds
  content after the score section and after "Errors observed"; in `run.mjs`
  T-027 wholesale-replaces the old honesty-check block that T-025 never
  touches). Ordinary 3-way merge should resolve these without hand-editing.

Recommended order: no functional dependency either way: merge whichever gate
finishes first, then treat the second merge's `pathcheck.mjs` resolution as
the one step needing the splice technique above rather than `git merge`'s
default output, and re-verify `driver.mjs`'s merged return object by eye.
