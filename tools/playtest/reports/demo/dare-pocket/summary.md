# dare-pocket-attempt — playtest report

- URL: `http://127.0.0.1:55928/index.html?slice=traversal&testapi=1`
- Started: 2026-07-29T23:04:18.294Z
- Wall time: 10.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.6ms / max 78ms (139 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 3.5s of 10.4s PLAYING time (fraction 0.34)
- Airborne time (`airMs`): 4.1s
- Closest approach to crush edge (`minEdgeMargin`): 11.05 tiles
- Vertical range: y 2–11.49 (span 9.49)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.71, 5 connectors matched)
- Air jumps: **unavailable** — window.HB has not landed and the ?testapi=1 snapshot does not currently expose sliceStats.airJumps (it has attempt/falls but not airJumps) — recommend adding it alongside those, or via window.HB
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 1.86 events/sec (20 total: 10 down / 10 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **120.7** (airborneKills=0, links≈4, airMs=4088, stallMs=3549)

