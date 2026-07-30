# dare-pocket-attempt — playtest report

- URL: `http://127.0.0.1:53444/index.html?slice=traversal&testapi=1`
- Started: 2026-07-30T02:04:39.622Z
- Wall time: 10.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.4ms / max 80ms (139 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 4.4s of 10.4s PLAYING time (fraction 0.427)
- Airborne time (`airMs`): 4.2s
- Closest approach to crush edge (`minEdgeMargin`): 28.13 tiles
- Vertical range: y 2–10.81 (span 8.81)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.43, 3 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 1.86 events/sec (20 total: 10 down / 10 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **65.1** (airborneKills=0, links≈2, airMs=4224, stallMs=4448)

