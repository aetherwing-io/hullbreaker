# mid-route-competent — playtest report

- URL: `http://127.0.0.1:8780/index.html?slice=traversal&testapi=1&fixeddt=16.667`
- Started: 2026-10-23T01:10:03.611Z
- Wall time: 393.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 654.3ms / max 2161ms (592 samples)

## Outcome
- Result: **not-completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 3
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 127.1s of 384.5s PLAYING time (fraction 0.331)
- Airborne time (`airMs`): 202.4s
- Closest approach to crush edge (`minEdgeMargin`): 26.53 tiles
- Vertical range: y 1–6.99 (span 5.99)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[mid-catwalk, upper-chimney, wall-launch, recovery-scramble]**
- Route inference (harness-only best guess): **recovery-scramble** (confidence 0.57, 4 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=true
- Hostiles seen: up to 2 concurrent (wasp) on 592/592 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.07 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **1486.6** (airborneKills=0, links≈3, airMs=202395, stallMs=127146)
## Deterministic dispatch (frame-scoped, page-authored ledger)
- Events dispatched: **26 of 26**; sim clock reached 9.9s (advanced 9.8s); stop reason: script-window
- Exact stop: tick 594/594, status **complete**, fixed dt 16.667ms


