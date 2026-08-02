PASS

Gate for T-029 (`task/T-029` @ `6ec5b40`, merge-base `da9b597`). Worktree pinned
and served independently of the moving main checkout; nothing here is
inherited from `build.md`/`review.md` without a fresh, independent check.

## Setup

- `node /Users/scottmeyer/projects/hullbreaker/tools/serve.mjs 8867 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-029 --quiet`
  (main's copy, since `tools/serve.mjs` doesn't exist on this branch). Port
  **8867** — 8741/8742 (operator) never touched. Killed at the end of this
  gate (`lsof -ti :8867 | xargs kill`); confirmed freed.
- Harness run from the main checkout (`/Users/scottmeyer/projects/hullbreaker/tools/playtest`)
  against `--base-url http://127.0.0.1:8867` throughout.

## 1. No gameplay regression

- `node tools/pathcheck.mjs` in the worktree: **1701 passed, 0 failed**. Same
  command on a clean `main` checkout: **1674 passed, 0 failed** — the
  +27-assertion delta is authored entirely by this branch (matches review's
  independently-measured count, not the commit message's "+18", which is a
  reporting nit only).
- Smoke suite, both against the pinned worktree:
  - `run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8867`
    → `outcome: completed`, `consoleErrors: []`, `pageErrors: []`.
  - `run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8867`
    → `outcome: completed`, `consoleErrors: []`, `pageErrors: []`. Trace's
    final `hudTR`/`ovBody` read `2/2 TURNS` and `2 of 2 transformations` —
    byte-identical to the shipped v1 demo copy, confirming the fixture-driven
    denominator did not move the untouched v1 case.
- `run.mjs scripts/g2-neck-flip.json --deterministic --base-url http://127.0.0.1:8867`
  → `outcome: completed`, `consoleErrors: []`, `pageErrors: []`. `hudTR`
  transitions `0/1 TURNS → 1/1 TURNS`; final `ovBody` reads `1 of 1
  transformation`; `ovTitle: BREACH CLEAR`. Matches build.md's claim.
- `run.mjs scripts/momentum-weak.json --deterministic --max-runtime-ms 62000 --base-url http://127.0.0.1:8867`
  → `outcome: not-completed` (expected/documented for this script — 3 stock
  lives spent by 22.8s, GAME_OVER; matches the script's own falsifying-gate
  history of a struggling player who never finishes), `consoleErrors: []`,
  `pageErrors: []`. Trace-derived drive peaks at 0.060 (well under the 0.30
  floor bound), consistent with prior T-022 measurement — no regression.
- `run.mjs scripts/momentum-strong.json --deterministic --max-runtime-ms 62000 --base-url http://127.0.0.1:8867`
  → `outcome: not-completed` (documented — no bot run reaches VICTORY on this
  script), `consoleErrors: []`, `pageErrors: []`. Peak `pursuitSpeed` 5.448
  t/s (×1.267, drive 0.667) — same direction/order of magnitude as build.md's
  5.548/×1.290/0.725 (run-to-run keyboard-timing variance is expected and
  documented in the harness README; this is not a regression check on exact
  decimals).
- `?selftest=1` re-checked myself with the correct 1500ms settle (my first
  pass under-waited and mis-read a stale title — corrected before reporting):
  bare **PASS (29 checks)**, `&g2=1` **PASS (30)**, `&slice=transform`
  **PASS (30)**, `&slice=traversal` **PASS (31)**, `&momentum=1` **PASS
  (29)**, `&audio=0` **PASS (29)**. No page errors on any of the six.

## 2. testapi channel not broken

Independent Playwright probe (own script, not the harness), fresh browser
contexts, against the pinned worktree:

- **Without** `?momentum=1` (`?testapi=1` only): `window.HB.snapshot()` has a
  `momentum` key (`'momentum' in snapshot === true`) but its value is
  `undefined`, and `'momentum' in JSON.parse(JSON.stringify(snapshot))` is
  **false** — absent from JSON, not null-ish garbage, exactly the `hook`/`flow`
  pattern. Existing fields sampled from the same snapshot (`pursuitSpeed:
  4.3`, `pursuitPeak: 4.3`, `pace: null` on the v1 slice) are unchanged in
  shape.
- **With** `?momentum=1&testapi=1`: `snapshot().momentum` is a live object,
  keys exactly `['drive', 'peakDrive', 'tier']`, values move over time (0 at
  boot; non-zero after the `momentum-strong` run above).
- Harness-side gap, confirmed and **filed** (was not yet in the Inbox): the
  live channel is correct, but `tools/playtest/lib/sampler.mjs`'s
  `fromTelemetryLike()` (lines 120-150) whitelists trace fields and was never
  given a `momentum` line, so `report.json → trace[]` never carries it (0/804
  samples in the `momentum-weak` run above). Filed as **SPRINT Inbox I-035**
  (docs/S3) — cosmetic to this gate since I verified the real channel directly
  in-browser instead of trusting a report, but worth a one-line fix in
  `tools/` before any future gate tries to cite momentum from a report.

## 3. Three-way turn-count inconsistency — confirmed independently

Captured my own fresh `g2-neck-flip` BREACH CLEAR screenshot against the
pinned worktree (not reused from `build.md`'s evidence) and read all three
locations off the image directly:

- **HUD** (top-right): `ALT 38m · 1/1 TURNS · 0 kills` — **fixed**.
- **Stats panel** (middle box, mid-screen): `TURNS  1 / 2` — **NOT fixed**.
- **Body copy** (below the stats box): `12.2s · 1 of 1 transformation · 0
  kills` — **fixed**.

`git show 6ec5b40 --stat` confirms this lane touched only `src/main.js`,
`src/ui/hud.js`, `src/ui/overlay.js`, `tools/pathcheck.mjs`, and
`reports/tasks/T-029/**` — the stats-panel string lives at
`src/pure/shell.js:413` (`push('TURNS', (s.bands || 0) + ' / 2')`), fed by
`src/ui/shell.js:198`, neither of which this commit changed. Real, but outside
T-029's stated file list and its I-009 acceptance box (which named the HUD and
clear overlay specifically, both of which are now correct). **Already filed**
as SPRINT Inbox **I-033** (by the review pass) with the same repro; I'm not
duplicating it, just confirming it independently rather than inheriting it.
Judged: this does **not** fail T-029 — the task's own file list and inbox
items (I-005/I-009/I-030) are each satisfied; the third location is a
pre-existing defect this lane candidly disclosed (build.md "Open items" #1)
rather than silently left, and no live lane currently owns `shell.js`.

## 4. `window.HB.audio()` — live, in a real browser

Own Playwright probe, fresh contexts each time, against the pinned worktree:

| | `enabled` | `unlocked` | `contextState` | `layers` | `voices` |
|---|---|---|---|---|---|
| before any gesture (`?testapi=1`) | true | false | `none` | 0 | 0 |
| after one keypress (ArrowRight) | true | true | `running` | 1 | 0 |
| `?audio=0` | false | false | `none` | 0 | 0 |

Matches build.md's claimed table exactly, reproduced independently rather than
read off the report.

## 5. pathcheck / selftest final numbers

`node tools/pathcheck.mjs`: **1701 passed, 0 failed**. `?selftest=1`: **PASS
(29 checks)**. Both confirmed above, run by me in this session, not inherited.

## What I did not need to touch

No `src/`, fixture, or tuning edits — only this report and
`/Users/scottmeyer/projects/hullbreaker/SPRINT.md`'s Inbox (added I-035;
I-033 was already present from the review pass, referenced not duplicated).

## Open feel questions (routed to the operator checkpoint queue, not judged here)

Same four questions build.md already raised (G2's `0/1 TURNS` / `1 of 1
transformation` copy adequacy for a one-event fixture; whether `HB.audio()`
deserves an on-screen readout; whether `peakDrive`/`tier` belong on the
end-of-run screen) — machine gates don't judge these, restating only so they
aren't lost: see `reports/tasks/T-029/build.md` "Open feel questions".
