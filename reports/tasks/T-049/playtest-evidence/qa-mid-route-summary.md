# mid-route-competent — playtest report

- URL: `http://127.0.0.1:8790/index.html?slice=traversal&testapi=1`
- Started: 2026-08-02T11:09:32.259Z
- Wall time: 7.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.8ms / max 188ms (95 samples)

## Outcome
- Result: **completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 1
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 6.8s PLAYING time (fraction 0.028)
- Airborne time (`airMs`): 5.3s
- Closest approach to crush edge (`minEdgeMargin`): 34.9 tiles
- Vertical range: y 3–13.05 (span 10.05)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 0.5, 4 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Hostiles seen: up to 2 concurrent (wasp) on 95/95 sampled ticks
- Input density (A.5: deliberately NOT a score input): 3.47 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **137.6** (airborneKills=0, links≈3, airMs=5341, stallMs=188)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **19 of 26**; sim clock reached 6.7s (advanced 6.6s); stop reason: victory
- 7 event(s) left pending, which is expected for a run that stopped at victory — its script window was longer than the run.


