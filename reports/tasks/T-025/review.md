APPROVE

Verified empirically, not taken on the report's word:

- Death count: independently re-ran `scripts/scored-run-baseline.json --deterministic`
  against this worktree served on port 8761 (killed after) and got
  `deaths: 2 (from lives); served build: default-run` — matches the committed
  `tools/playtest/reports/t025/default-run-deaths/`. Inspected the raw trace
  myself: `lives` drops 3→2 at gameMs 22452.1 and 2→1 at 30402.4, both coincide
  with `hp` snapping 1→3 and `x` snapping 89.25→~51.5 — a genuine respawn
  signature, not a glyph-count artifact. `outcome.attempts` is `null` with a
  named reason, `outcome.result` reads `died`.
- Rib run: independently re-ran `scripts/ribrun-climb.json` (`?slice=traversal&ribrun=1`)
  and got `routeIds: ['ribline']` only and `darePocket.entered: null` (reason:
  pocket collapsed to zero width) — zero lattice routes, zero pocket credit,
  matching the claim exactly.
- `?enemies=0`: independently re-ran the baseline script at
  `?enemies=0&testapi=1` on a default-run URL and got the `WARNING` stderr line
  and `enemiesFlag.honoured: false` with the real roster (up to 8 concurrent
  hostiles this run) — the flag's slice-only scope is now stated at the field,
  in `summary.md`, on stderr, and in a new README section, rather than reported
  as an empty roster it didn't have.
- I-035 momentum fold-in: confirmed clean — `lib/sampler.mjs`'s
  `fromTelemetryLike()` whitelists `momentum: s.momentum || null` next to the
  `lives` addition, one line, well commented, no scope creep.
- New-assertion teeth: reverted the `computeDeaths` default-run branch to
  return `deaths: 0` instead of `lives.spent` (the exact I-006 regression) and
  reran pathcheck — it went red on exactly the two assertions that guard this
  case (`got 0 from lives`, `got not-completed`). Restored the file; worktree
  is clean (`git status --short` empty, `git diff --stat` empty) and pathcheck
  is back to 1721/0.
- `node tools/pathcheck.mjs`: 1721 passed, 0 failed, confirmed by direct run.
  Note for the record: the task text's "1704 → 1721 (+17)" compares against
  *current* main, which has moved since T-025 branched. Against the actual
  merge-base (690f863), the true baseline is 1701/0, so the branch adds
  exactly +20 assertions — matching the +20 new `ok(` call sites in the diff
  1:1, and matching `build.md`'s own count. Not a builder error, just a stale
  comparison basis in the dispatch text.
- `src/main.js`: exactly 10 lines, purely additive (`player.hp`/`player.lives`
  onto the frozen telemetry channel, read-only). No movement/jump constant
  touched, no other line in the file changed. Layer purity untouched (no new
  THREE/document/window reference, no upward import). T-029's prior additions
  to the same file (`momentum` block, hostiles, etc.) are undisturbed — no
  conflict, no accidental revert.
- No new runtime deps, no build step, no `package.json` touched.
- Report honesty: `report.json`/`summary.md`/console output all agree —
  `null` is never printed as `0` anywhere I checked (report.mjs branches
  explicitly on `=== null` before formatting; JSON.stringify preserves `null`
  verbatim, unlike `undefined`).

Findings, most severe first:

- `tools/pathcheck.mjs` — **will produce a real merge conflict against
  task/T-027**, not a cosmetic one. Verified by test-merging both into a
  disposable worktree off current main: T-025 alone merges clean; T-025 then
  T-027 conflicts in `tools/pathcheck.mjs` (both append a new assertion block
  at essentially the same anchor point, roughly lines 8244–8503 of the merged
  file). `tools/playtest/lib/driver.mjs`, `lib/report.mjs`, `run.mjs`, and
  `README.md` — all touched by both tasks — auto-merged cleanly in the same
  test, so only `pathcheck.mjs` needs the integrator's attention (splice both
  new blocks in per docs/ORCHESTRATION.md § "Merge playbook", don't drop
  either). Not a defect in this diff; purely a sequencing note for whichever
  of T-025/T-027 merges second.
- `tools/playtest/README.md` — the builder's own note flags that the root
  `README.md`'s `&enemies=0` line and `src/mode.js`'s `SLICE_ENEMIES_ENABLED`
  name still read (to a very literal reader) as if the flag were global. I
  checked both: root `README.md`'s line sits directly under the
  `?slice=traversal` paragraph (not presented as a global flag) and
  `src/mode.js`'s constant is literally named `SLICE_...`, so neither is
  actually a false claim in context — this is the builder being appropriately
  cautious, not a third wrong note. Worth an operator/Inbox item if a fully
  explicit cross-reference is wanted, but not a blocker.
