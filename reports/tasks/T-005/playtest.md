PASS

# Playtest gate — T-005 (harness: fixture.mjs real import)

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-005`
  (commit `7961800`, branch `task/T-005`)
- Diff scope verified: `tools/playtest/{README.md,lib/fixture.mjs,lib/metrics.mjs}`
  only. `src/` and `index.html` byte-identical to main (`git diff main...HEAD
  --stat -- src/ index.html` = empty) — zero effect on the shipped game, per
  the harness definition of done.

## Runs (all exit 0, `"result": "completed"`, no bootError, no console/page errors)

Pinned worktree served with `python3 -m http.server 8774` (cwd = worktree),
killed after the runs. Main checkout's harness run from
`/Users/scottmeyer/projects/hullbreaker/tools/playtest`:

1. `node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8774 --out runs/gate-T-005-mid`
   → exit 0, `completed`, fidelity `testapi`, minEdgeMargin 35.5, attempts 1,
   0 deaths. Evidence: `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-005-mid/report.json`
2. `node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8774 --out runs/gate-T-005-transform`
   → exit 0, `completed` (BREACH CLEAR, 2/2 transformations), fidelity
   `testapi`, minEdgeMargin 30.18. Evidence:
   `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-005-transform/report.json`

Worktree's own harness (the change under test), from
`.claude/worktrees/T-005/tools/playtest` after `npm install` (clean, 0 vulns):

3. `node run.mjs scripts/mid-route.json --deterministic --out /tmp/gate-T-005-wt`
   → exit 0, `completed`, fidelity `testapi`. Evidence: `/tmp/gate-T-005-wt/report.json`
   (gitignored scratch path per the gate assignment; report content quoted below).

No retries needed — no bootError occurred on any run.

## Route-coverage comparison (main harness vs worktree harness, same script)

| metric | main (old hand-copy fixture) | worktree (real import) |
| --- | --- | --- |
| routeIds | `["upper-chimney","recovery-scramble"]` | `["upper-chimney","recovery-scramble"]` |
| matchedRouteId / confidence | `upper-chimney` / 0.88 | `upper-chimney` / 0.88 |
| matchedConnectors | 7, identical list | 7, identical list |
| links (protoScore proxy) | 6 | 6 |

Exact match. The only difference in the two reports' route blocks is the
`method` description string, which is the diff's intended doc change.

Independent drift check (did not take the builder's word): loaded main's
`TRAVERSAL_FIXTURE_SNAPSHOT` and the worktree's imported `TRAVERSAL_FIXTURE`
in one Node process and compared the projection of the real fixture onto the
snapshot's fields — JSON-identical. The real module carries extra fields
(`solidRects`, `platforms`, `enemies`, `hookAnchors`, …) that
`lib/metrics.mjs` never reads, so metrics over any trace are provably
unchanged, not just observed unchanged on this one run. Also verified the
removed exports (`connector()`, `FIXTURE_SOURCE_COMMIT`,
`TRAVERSAL_FIXTURE_SNAPSHOT`) have no remaining consumers in the worktree
(`grep` over `tools/playtest`, only `metrics.mjs` imports from `fixture.mjs`).

## Acceptance checkboxes

- fixture.mjs imports the real module; hand-copy deleted — confirmed in diff.
- route-coverage metrics unchanged on committed demo scripts — confirmed live
  for mid-route (table above) plus the field-projection proof that extends it
  to every trace; transform-slice route block also sane
  (`mid-catwalk`/1.0/links 6).
- README limitations updated — confirmed: limitation #3's staleness half
  removed, hook request #6 marked done, files table and "single best next
  action" updated. The new `--base-url`-against-a-different-checkout caveat
  (route metrics come from the running tree's fixture, not the served one) is
  honestly documented in both fixture.mjs and the README — good harness-honesty
  hygiene, and moot for this gate since worktree `src/` equals main's.

## Screenshots judged

- `runs/gate-T-005-mid/screenshot.png` — TRAVERSAL CLEAR end frame at the
  default FAR view. RIG visible upper-right at roughly 3–4% of screen height
  (board 13's 3–5% range, decisions entry 7). HUD, overlay, and legend text
  all legible. Grey-box palette as expected pre-T-010. No anatomy assembling,
  no glitches, connected hull surfaces where visible.
- `runs/gate-T-005-transform/screenshot.png` — BREACH CLEAR end frame:
  monumental static silhouettes plus the slice's rain/streak ambience; nothing
  assembles or slams (static end frame; entry-3 rule not exercised by this
  harness-only change). No render artifacts.
- Caveat, stated honestly: both captures are end-of-run overlay frames, so
  enemy-tell FAR readability wasn't exercisable here (`transform-slice` runs
  `&enemies=0`; mid-route ended with 0 kills on screen). That question belongs
  to T-003, and this change cannot affect it — the served build's render code
  is byte-identical to main.

## Verdict reasoning

Harness-only change, zero game effect proven, both smoke scripts complete
deterministically through both harness copies, route metrics identical by
observation and by construction, README honesty obligations met. No defects
found; nothing filed to the SPRINT Inbox. No feel questions arise (no
gameplay or render behavior changed), so nothing queued for the operator.
