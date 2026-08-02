# policy-pinned-jump — playtest report

- URL: `http://127.0.0.1:8756/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-08-02T02:42:41.981Z
- Wall time: 10.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.4ms / max 156ms (131 samples)

## Outcome
- Result: **not-completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 0
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 1.6s of 9.9s PLAYING time (fraction 0.16)
- Airborne time (`airMs`): 6.7s
- Closest approach to crush edge (`minEdgeMargin`): 24.5 tiles
- Vertical range: y 1–3.95 (span 2.95)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, dare-pocket]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.57, 4 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=true
- `?enemies=0`: **honoured** — ?enemies=0 sets SLICE_ENEMIES_ENABLED (src/mode.js), which is read in exactly one place: src/sim/spawner.js, where a FIXTURE spawns its authored list. It is SLICE-ONLY — the default six-face run's ambient spawner never consults it (SPRINT I-026). On this run it held: zero hostile rows across 131 sampled ticks.
- Input density (A.5: deliberately NOT a score input): 0.2 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **142.4** (airborneKills=0, links≈3, airMs=6678, stallMs=1590)

