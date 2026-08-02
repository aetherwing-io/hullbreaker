# T-025 evidence — the three report fields that were lying

Every fix in T-025 (SPRINT `I-006`, `I-013`, `I-026`, plus `I-035`) is checked
against a real browser run, committed here so the claim and the artifact are the
same object. All six runs are `--deterministic`, against this branch served from
its own worktree with `node tools/serve.mjs 8756 --quiet` (port chosen to stay
off the operator's 8741/8742), on 2026-08-02.

Reproduce any of them:

```sh
node <worktree>/tools/serve.mjs 8756 --quiet &
cd <worktree>/tools/playtest
node run.mjs <script> --deterministic --base-url http://127.0.0.1:8756 --out <dir>
```

| folder | script / URL | what it proves | full `report.json`? |
| --- | --- | --- | --- |
| `default-run-deaths/` | `scripts/scored-run-baseline.json` (default six-face, `--max-runtime-ms 34000`) | **I-006.** `deaths: 2` from `lives`, `outcome: died`, `outcome.attempts: null` with a reason — where the pre-T-025 harness reported `deaths: 0, attempts: 0, not-completed` | yes |
| `ribrun-routes/` | `scripts/ribrun-climb.json`, `?slice=traversal&ribrun=1` | **I-013.** `routeIds: [ribline]` (the rib's own and only route) and the dare-pocket column absent with a reason | yes |
| `enemies0-noop/` | `scripts/scored-run-baseline.json` at `--url …/index.html?enemies=0` | **I-026.** `?enemies=0` reported as a **no-op on this run** — up to 3 live rows (`carrier, hound, wasp`) on 212 of 212 sampled ticks | summary only (the claim is stated in full in the `?enemies=0` line) |
| `slice-enemies0-honoured/` | `scripts/policy-pinned-jump.json`, `?slice=traversal&enemies=0` | the other half of I-026: on a **fixture** URL the flag does work — `honoured: true`, zero rows across 131 ticks. Also the no-regression check for the fixture path: `routeIds: [lower-service, dare-pocket]`, pocket entered, reward taken | summary only |
| `transform-slice/` | `scripts/transform-slice.json` | the transformation-slice branch of the served-fixture probe: `served build: transform-slice`, deaths from `sliceStats.attempts`, route/pocket/protoScore absent with reasons, run still `completed` | summary only |
| `momentum-passthrough/` | `scripts/momentum-weak.json`, `?momentum=1` (`--max-runtime-ms 14000`) | **I-035.** Not visible in `summary.md`: the check is that `report.json`'s `trace[]` rows carry `momentum: {drive, peakDrive, tier}` — 185 of 185 here, against 0 of 804 before the sampler whitelisted it. Re-run the command above and read any trace row to confirm | summary only — see the honesty note below |

## Honesty notes

- **Two of the six carry a full `report.json`; four carry only `summary.md`.**
  The two that carry the trace are the ones whose claim is *about the trace*
  (the hand-counted death signatures, and the route match). The four
  summary-only folders each state their whole claim in the summary line quoted
  above — except `momentum-passthrough/`, whose claim is specifically about a
  field inside `trace[]` and therefore is **not** checkable from what is
  committed here; it is checkable by the re-run command, and by
  `tools/pathcheck.mjs`'s assertion that `lib/sampler.mjs` whitelists the field.
  Committing that 820 KB trace instead would make it self-checkable; it was
  left out for repo weight, which is a trade, not a proof.
- **The death count in `default-run-deaths/` was hand-verified from its own
  trace**, three independent ways, all agreeing on two deaths: respawn
  signatures (`hp 1→3` with `x` snapping `89.25 → ~51.5` and `setbacks`
  unchanged) at `gameMs` 22452 and 30402; the HUD's `×3→×2→×1` text at those
  same two samples; and telemetry `lives 3→2→1`. In that trace telemetry `hp`
  also matched the HUD's `▰` pip count on 409 of 409 samples.
- **`ribrun-routes/` also carries its own before/after.** Re-scoring that exact
  trace the way the pre-T-025 harness did (against this checkout's lattice
  `TRAVERSAL_FIXTURE`) yields `routeIds: [mid-catwalk, upper-chimney,
  wall-launch, recovery-scramble]` and `dare pocket: entered=true` — I-013's
  report, reproduced verbatim from the committed trace.
- These are single runs, not distributions. They are here to show a *field's*
  behavior, not to characterize a policy: nothing in this folder should be
  quoted as a pacing or difficulty measurement.
