# mid-route-competent — playtest report

- URL: `http://127.0.0.1:8761/index.html?slice=traversal&testapi=1`
- Started: 2026-08-02T11:50:51.098Z
- Wall time: 7.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 77.5ms / max 165ms (95 samples)

## Outcome
- Result: **completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 1
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 6.8s PLAYING time (fraction 0.036)
- Airborne time (`airMs`): 5.3s
- Closest approach to crush edge (`minEdgeMargin`): 35.27 tiles
- Vertical range: y 3–12.01 (span 9.01)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Hostiles seen: up to 2 concurrent (wasp) on 95/95 sampled ticks
- Input density (A.5: deliberately NOT a score input): 3.45 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **86.4** (airborneKills=0, links≈1, airMs=5277, stallMs=243)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **19 of 26**; sim clock reached 6.8s (advanced 6.7s); stop reason: victory
- 7 event(s) left pending, which is expected for a run that stopped at victory — its script window was longer than the run.


