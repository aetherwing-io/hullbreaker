# T-025 build report — the harness may only report what the run did

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-025`
Branch: `task/T-025` · commit `5d5cc19` · not merged.

## What changed and why

Three report fields asserted things their runs had not done, and four gates read
them as evidence. All three are the same defect — **a number computed from
something other than the run in front of it** — so all three are fixed the same
way: compute it from this run, or say it does not exist.

### (a) The death counter (I-006)

`metrics.deaths` and `outcome.attempts` both derived from `sliceStats.attempts`,
which `src/main.js` increments only inside `if (ACTIVE_FIXTURE)`.

- **Game-side plumbing** (`src/main.js`, +10 lines, the only shipped-code
  change): `telemetry()`'s `player` block now publishes `hp` and `lives`. Two
  additive, read-only fields on the frozen channel — this is playtest README
  hook request #9, which I-006 itself named as the clean fix. Nothing else in
  the game changed; SELFTEST is 29/29 and every other telemetry field is
  untouched.
- **Harness-side**: `metrics.deaths` now picks the counter that is real for the
  **served** run and names it in `deathsSource`/`deathsScope`:
  fixture run → retries (`sliceStats.attempts` increments); default six-face run
  → stock lives spent; neither knowable → **`null`**, with
  `deathsUnavailableReason`. `metrics.lives` prefers the telemetry field, keeps
  the HUD `×N` parse as the fallback for older/dom traces, and cross-checks the
  two when both exist. `outcome.attempts` is `null` **with a reason** outside
  fixtures rather than `0`, and `outcome.result` reads `died` from a terminal
  `GAME_OVER` or a non-zero death count — I-006's residual (a run that spent two
  lives used to open its summary with `not-completed`).

There is **no third wrong note**: the README's "damage/death events" bullet, its
"stock lives" bullet, the A.5 default-run honesty note (the one I-006 called
wrong on both halves), the `outcome` bullet, hook request #9 and honesty
items 2–3 were all rewritten against the new behavior, and every consumer was
checked — `report.mjs` prints the new shapes, `scripts/adversarial/repeat.mjs`
was already null-safe on `deaths`/`attempts`/`routeIds`/`darePocket`,
`analyze-run.mjs` reads `metrics.lives` whose shape only grew.

### (b) Fixture-derived columns (I-013)

`lib/fixture.mjs` re-exported this checkout's `TRAVERSAL_FIXTURE`
unconditionally. It now **imports no game source at all**: `lib/driver.mjs`
evaluates `probeServedFixture()` in the page once at boot and every
fixture-derived column is computed against that answer, or omitted with a
reason. The probe also reads the run kind from the game's own telemetry shape
rather than the URL: `snapshot.corner` present ⇔ `ACTIVE_FIXTURE === null` (the
default run), `snapshot.transform` present ⇔ the transformation slice, else the
traversal slice — which is also what tells the death counter which counter
applies. Reported as `metrics.servedFixture` and on the console line.

This closes the `--base-url`-against-a-different-checkout hole for these
columns too, since the answer comes from the served page.

### (c) `?enemies=0` (I-026)

Not fixable in the game from this lane (a default-run ambient-spawn kill switch
is a new query flag), so the flag's real meaning is stated everywhere this
harness controls, **from the run's own evidence rather than as a claim**:
`metrics.hostilePresence.enemiesFlag` reports `honoured: true/false/null` with
the roster it actually met, in `report.json`, in `summary.md`, as a stderr
`WARNING`, and in a README section.

### Folded in: I-035

`lib/sampler.mjs`'s `fromTelemetryLike()` now whitelists `momentum` — one line,
in a file this task was already rewriting. It was clean to fold in. `lives` went
in beside it for (a).

## Verification — every command and its result

All runs `--deterministic`, against this worktree served by
`node tools/serve.mjs 8756 --quiet` (**port 8756**, chosen to stay off the
operator's 8741/8742; killed afterwards — `pkill -f "serve.mjs 8756"`).

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **1721 passed, 0 failed** (baseline on this branch was 1701/0; +20 new assertions) |
| `run.mjs scripts/scored-run-baseline.json --max-runtime-ms 34000` (default six-face) | `outcome: died`, `deaths: 2 (from lives)`, `attempts: null` — was `deaths: 0, attempts: 0, not-completed` |
| `run.mjs scripts/ribrun-climb.json --max-runtime-ms 15000` (`?ribrun=1`) | `completed`, `routeIds: [ribline]`, dare pocket absent with reason — was `[mid-catwalk, upper-chimney, wall-launch, recovery-scramble]`, `entered=true` |
| `run.mjs scripts/scored-run-baseline.json --url …/index.html?enemies=0` | `enemiesFlag.honoured: false` — up to 3 rows (`carrier, hound, wasp`) on 212/212 ticks, plus the stderr WARNING |
| `run.mjs scripts/policy-pinned-jump.json` (`?slice=traversal&enemies=0`) | `honoured: true` (0 rows / 131 ticks); fixture path unchanged: `routeIds: [lower-service, dare-pocket]`, pocket entered, reward taken |
| `run.mjs scripts/transform-slice.json` | `completed`; `served build: transform-slice`; deaths from `sliceStats.attempts`; route/pocket/protoScore absent with reasons |
| `run.mjs scripts/momentum-weak.json --max-runtime-ms 14000` (`?momentum=1`) | 185/185 trace rows carry `momentum {drive, peakDrive, tier}` — was 0/804 (I-035) |
| `run.mjs scripts/mid-route.json` (smoke) | `completed`; fixture-derived fields **byte-identical** to the committed demo report (`routeIds []`, `mid-catwalk`, `confidence 0.29`, `entered true`, `rewardTaken false`, `linksApprox 1`) |
| `index.html?selftest=1` in real Chrome | `SELFTEST PASS (29 checks)`; `testapi` snapshot shows `player.hp 3`, `player.lives 3` |

**The falsifying trace for each fix, by path** (committed, with a README stating
what each proves and which claims its artifact does *not* carry):

- (a) `tools/playtest/reports/t025/default-run-deaths/report.json` — hand-verified
  three independent ways, all agreeing on **two** deaths: respawn signatures
  (`hp 1→3`, `x 89.25 → ~51.5`, `setbacks` unchanged) at `gameMs` 22452 / 30402;
  HUD `×3→×2→×1` at those same samples; telemetry `lives 3→2→1`. Telemetry `hp`
  matched the HUD's `▰` pip count on **409 of 409** samples.
- (b) `tools/playtest/reports/t025/ribrun-routes/report.json` — and re-scoring
  that same trace the old way (against this checkout's lattice) reproduces
  I-013's report verbatim, so the before/after is one trace, not two runs.
- (c) `tools/playtest/reports/t025/enemies0-noop/summary.md` (I-026's repro) and
  `…/slice-enemies0-honoured/summary.md` (the flag working, on a fixture).
- I-035: `tools/playtest/reports/t025/momentum-passthrough/summary.md` — **honest
  gap**: the claim is about a field inside `trace[]`, which that summary does not
  contain; it is checkable by the one-line re-run and by the pathcheck assertion.

**The new assertions were confirmed to have teeth**, not just to pass: reverting
the death-counter fix in place turned pathcheck red 2/2 on the I-006 assertions
(`[got 0 from sliceStats.attempts]`); restoring the lattice import turned it red
5/5 on the I-013 assertions (`[got ["lower-service","mid-catwalk",…]]`). Both
reverts were undone and the tree re-verified green.

## Behavior changes a reader of two reports will see

Documented in the README under "Behavior changes to expect in a diff of two
reports":

- `metrics.deaths` may be `null` where it was `0`; `outcome.attempts` is `null`
  on default runs; `outcome.result` may move `not-completed → died`.
- `route.routeIds` / `darePocket.entered` are `null` (not `[]` / `false`) on a
  build with no authored routes or pocket.
- **`protoScore` is `unavailable` on a run with no authored routes and no
  `?score=1`**, where it used to print a number. That number was never a
  measurement of such a run — its A.5 `links` term came from matching the trace
  against connectors the build did not contain.

## Things the operator or integrator should decide (I did not)

1. **The CP4 packet quotes a void number.** `docs/proposals/2026-07-cp4-default-
   run-score-setback.md` line 119 cites the baseline's proxy `protoScore`
   **924.8**; the committed artifact for that row
   (`tools/playtest/reports/cp4/scored-run-baseline/report.json`) shows it was
   computed with `linksApprox: 6`, `routeIds: [lower-service, mid-catwalk,
   wall-launch]` and `darePocket.entered: true` — on a **six-face** run that has
   none of those. This is an I-013 propagation into a live decision packet, the
   same shape as I-007. Line 112–113 of that packet ("`metrics.deaths` and
   `outcome.attempts` are fixture-only") is now stale as well. `docs/` is outside
   this lane's fence, so I filed neither edit — worth an Inbox item.
2. **`?enemies=0` is still misleading in two places I may not edit**: the flag
   table in the repo root `README.md`, and `src/mode.js`'s
   `SLICE_ENEMIES_ENABLED` line, both of which read as global. The README
   section I wrote says so explicitly. The real fix — a default-run ambient-spawn
   kill switch behind a new off-by-default flag — is a game change and needs its
   own task.
3. **Committed-artifact weight**: I committed two full `report.json` traces
   (1.6 MB + 224 KB) because their claims are about the trace, and summaries only
   for the other four. The momentum run's trace (820 KB) would make I-035's claim
   self-checkable; I traded it away for repo weight and said so in the folder
   README. Reverse it if the fleet prefers self-checkable over lean.
4. **Lane collision, expected**: T-027 is concurrently editing
   `tools/playtest/lib/` and `tools/playtest/README.md`. My README edits are the
   metrics/A.5/honesty/hook-request/Files sections plus one new section; my
   `lib/` edits are `fixture.mjs` (rewritten), `metrics.mjs`, `report.mjs`,
   `sampler.mjs` (3 hunks), `driver.mjs` (2 small hunks: one import, one boot
   probe, one return field) and `run.mjs` (2 hunks). The driver hunks are
   deliberately away from the dispatch/shutdown paths T-027 owns.

## Open feel questions for the operator

None — this is a harness/telemetry task with no gameplay surface. The one thing
worth an operator's attention is not a feel question but a trust one: **runs
gated before this commit that reported `deaths: 0` on a default six-face URL
reported nothing at all**, and any conclusion drawn from a default-run
`route`/`darePocket`/proxy-`protoScore` column was about a fixture that build
did not contain.

## Single best next action

File the CP4 packet correction (item 1 above) as an Inbox issue and let a docs
lane void the `924.8` row, before CP4 is judged — it is the last place the
I-013 defect is still being read as evidence.
