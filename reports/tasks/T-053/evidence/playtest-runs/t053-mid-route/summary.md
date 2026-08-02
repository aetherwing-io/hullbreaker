# mid-route-competent — playtest report

- URL: `http://127.0.0.1:8760/index.html?slice=traversal&testapi=1`
- Started: 2026-08-02T11:29:33.030Z
- Wall time: 7.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 77.2ms / max 198ms (90 samples)

## Outcome
- Result: **completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 1
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 6.4s PLAYING time (fraction 0.024)
- Airborne time (`airMs`): 5.2s
- Closest approach to crush edge (`minEdgeMargin`): 35.39 tiles
- Vertical range: y 3.27–12.17 (span 8.9)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 3 final attempt (peak single attempt 3; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Hostiles seen: up to 2 concurrent (wasp) on 90/90 sampled ticks
- Input density (A.5: deliberately NOT a score input): 3.63 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **86.1** (airborneKills=0, links≈1, airMs=5189, stallMs=152)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **18 of 26**; sim clock reached 6.3s (advanced 6.3s); stop reason: victory
- 8 event(s) left pending, which is expected for a run that stopped at victory — its script window was longer than the run.


