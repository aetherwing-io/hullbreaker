PASS

Pinned worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-025`,
branch `task/T-025`, HEAD `b6239a8`. Served with
`node tools/serve.mjs 8763 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-025 --quiet`
(port 8763 — 8741/8742 untouched), killed after each capture session.
All runs below were driven with `--base-url http://127.0.0.1:8763` against
this pinned tree, `--deterministic` where the task called for it. Nothing
here is taken on the report's or the reviewer's word — every claim below was
independently re-run and, where the task demanded it, the raw trace was
inspected directly rather than reading the summary line.

## 1. Death count, independently re-derived from the raw trace

Ran `scripts/scored-run-baseline.json --deterministic --max-runtime-ms 34000`.
Harness reported `deaths: 2 (from lives); served build: default-run`,
`outcome.result: died`, `outcome.attempts: null`.

I did not accept that from the report. I loaded that run's own
`report.json` and walked `trace[]` myself, looking only at raw
`lives`/`hp`/`x`/`setbacks` fields (not any of the harness's own derived
fields), scanning for `lives` decrements and checking what else moved on the
same sample:

```
LIVES DROP 3 -> 2 at gameMs 22462.1  hp 1 -> 3  x 89.25 -> 51.611  setbacks 0
LIVES DROP 2 -> 1 at gameMs 30412.1  hp 1 -> 3  x 89.25 -> 51.5    setbacks 0
```

Exactly two drops, each a genuine respawn signature (hp snaps to full, x
snaps from the maxX the run had reached back to the spawn point, on the same
sample as the lives decrement) — not a glyph-count artifact, not a
`resetGame()` restore counted as a gain (only decreases are ever counted).
This matches the harness's own reported `deaths: 2` exactly, and is close to
(not identical to — small gameMs jitter, ~10ms, expected and documented under
"Honesty/limitations" for `--deterministic` reruns) the build report's own
independently-taken numbers (22452.1/30402.4). Two independent people, two
runs, same two-death read from raw telemetry.

`report.json`'s `metrics.lives.crossCheck` also agrees:
`{telemetrySpent: 2, hudSpent: 2, agrees: true}` — the HUD `×N` parse and the
telemetry `lives` field concur on this trace, independently of my own read.

## 2. No third wrong note — every consumer checked, all agree

Read `report.json`, `summary.md`, the `[playtest]` stderr line, and
`tools/playtest/README.md` for the default-run-with-deaths run above:

- `report.json`: `deaths: 2`, `deathsSource: "lives"`, `outcome.attempts: null`
  with `attemptsUnavailableReason` naming the frozen counter, `outcome.result:
  "died"`.
- `summary.md`: `Attempts: **n/a** — sliceStats.attempts is fixture-only …`,
  `Deaths: **2** (source: \`lives\` — …)`, `Result: **died**`. Same numbers,
  same reasons, same wording basis as `report.json`.
- stderr / `[playtest]` line: `deaths:  2 (from lives); served build:
  default-run` — agrees.
- `tools/playtest/README.md`: grepped for the old wrong phrasing
  (`damage/death events`, `fixture-only (sliceStats.attempts increments;
  always 0…`) — zero hits, nothing stale survives. The new "What a report may
  claim about deaths" section states the same three-way split (fixture retries
  / default-run stock lives / neither-knowable-is-null) that the code
  implements, and gives the same hand-verified trace numbers I reproduced
  above.
- `analyze-run.mjs` and `scripts/adversarial/repeat.mjs`: both read
  `metrics.lives`/`metrics.deaths` through null-safe accessors
  (`repeat.mjs`'s `num()` filters to `typeof v === 'number'`, so a `null`
  death count is excluded from an aggregate rather than coerced to 0) — no
  `?? 0` or `|| 0` pattern anywhere in `tools/playtest/*.mjs` /
  `tools/playtest/lib/*.mjs` reads of `deaths`/`attempts` (checked by grep).

No field reads `0` where the truth is unknown, anywhere I looked.

## 3. Rib-run zero-credit case

Ran `scripts/ribrun-climb.json --deterministic` (`?slice=traversal&ribrun=1`)
against the pinned tree:

- `route.routeIds: ["ribline"]` — the rib fixture's own single authored
  route, not any of the four lattice routes (`mid-catwalk`, `upper-chimney`,
  `wall-launch`, `recovery-scramble`) the old code credited on this exact
  script.
- `darePocket.entered: null`, `unavailableReason`: "the served fixture
  (traversal-ribrun-v1) collapses its dare pocket to a zero-width span …
  there is no pocket on this build to enter."
- `servedFixture.kind: "traversal-slice"`, `id: "traversal-ribrun-v1"`,
  `hasDarePocket: false`.

Zero lattice-route credit, zero dare-pocket credit, matching the build
report's claim exactly.

## 4. `?enemies=0` honest warning

Ran `scripts/scored-run-baseline.json --deterministic` at
`?enemies=0&testapi=1` against the pinned tree (default six-face run):

- stderr: `WARNING: ?enemies=0 sets SLICE_ENEMIES_ENABLED … It is SLICE-ONLY
  — the default six-face run's ambient spawner never consults it … up to 8
  live hostile rows (carrier, hound, wasp) were present on 408 of 408 sampled
  ticks …`
- `report.json`: `hostilePresence.enemiesFlag.honoured: false`, real roster
  (`maxConcurrent: 8`, `kindsObserved: [carrier, hound, wasp]`), matching
  `summary.md`'s `?enemies=0`: **NO-OP on this run** line verbatim.

Cross-checked the positive case too: `scripts/transform-slice.json`'s URL
carries `?slice=transform&enemies=0` (a fixture) and reports
`enemiesFlag.honoured: true`, "zero hostile rows across 214 sampled ticks" —
the flag working where it is supposed to. No fabricated empty roster in
either direction; the report states what the flag actually did on the
served run.

## 5. Regression

- `node tools/pathcheck.mjs` on the pinned tree: **1721 passed, 0 failed**
  (direct run, matches the claimed figure).
- `scripts/mid-route.json` (smoke): **completed**; fixture-derived fields
  reproduce the committed demo report exactly — `routeIds: []`,
  `matchedRouteId: mid-catwalk`, `confidence: 0.29`, `darePocket.entered:
  true`, `rewardTaken: false` — confirming no regression where the served
  fixture and this checkout's own fixture are the same thing.
- `scripts/transform-slice.json` (smoke): **completed**; `deaths: 0 (from
  sliceStats.attempts)`, route/pocket/protoScore all correctly absent with
  reasons (fixture authors none).
- `index.html?selftest=1` in a real headless Chrome (playwright-core,
  already a `tools/playtest` dev dependency): **SELFTEST PASS (29 checks)**.
- `src/main.js` diff against merge-base: **10 lines, purely additive**
  (`hp`/`lives` onto the frozen `telemetry()` channel, read-only). Confirmed
  via `git diff <merge-base>..HEAD -- src/` that this is the *only* file
  under `src/` touched, and the diff contains no deletions — no movement/jump
  constant moved, no other line in the file changed.
- `tools/pathcheck.mjs`'s own diff is +185/-0 — purely additive, no existing
  assertion weakened or removed.

## 6. Durability lens

This harness change is itself a durability fix in the sense the operator's
goal cares about: before it, a default six-face run that spent two lives
reported `deaths: 0, attempts: 0, not-completed` — the exact shape a
diagnostic reading of a kid's bug report would need to trust, and the exact
shape that was silently wrong. An instrument that reports "nothing happened"
when two lives were actually spent would misdirect triage on a real
durability complaint (e.g. "he says he died and lost progress" would read as
a false negative). The fix replaces every such silent-zero with either a real
number sourced from what the served build actually did, or an explicit
`null` + reason. I verified the real number independently (section 1) rather
than trusting the harness's account of itself, which is the standard this
lens demands. I found nothing that still lies.

## Findings

None new. The reviewer's one sequencing note — `tools/pathcheck.mjs` will
merge-conflict (not silently corrupt) against `task/T-027`'s own new
assertion block at roughly the same anchor point — is a real, already-
verified-by-test-merge integrator note, not a defect in this diff; I did not
re-verify it myself (out of playtest scope) and am not filing a duplicate
Inbox issue for it. No new Inbox issue filed by this gate; numbering
untouched (next free is I-037 per the team lead's note, unused here).

## Commands run (for reproduction)

```
node tools/serve.mjs 8763 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-025 --quiet
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8763 --max-runtime-ms 20000
node run.mjs scripts/scored-run-baseline.json --deterministic --base-url http://127.0.0.1:8763 --max-runtime-ms 34000
node run.mjs scripts/ribrun-climb.json --deterministic --base-url http://127.0.0.1:8763 --max-runtime-ms 15000
node run.mjs scripts/scored-run-baseline.json --deterministic --base-url http://127.0.0.1:8763 --url "http://127.0.0.1:8763/index.html?enemies=0&testapi=1" --max-runtime-ms 34000
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8763 --max-runtime-ms 20000
node tools/pathcheck.mjs
# headless selftest via playwright-core (script inline, see session transcript)
pkill -f "serve.mjs 8763"
```
