# dare-pocket-attempt — playtest report

- URL: `http://127.0.0.1:54336/index.html?slice=traversal&testapi=1`
- Started: 2026-07-30T00:27:29.675Z
- Wall time: 10.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.4ms / max 80ms (139 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 3.6s of 10.4s PLAYING time (fraction 0.341)
- Airborne time (`airMs`): 4.2s
- Closest approach to crush edge (`minEdgeMargin`): 11.06 tiles
- Vertical range: y 2–11.51 (span 9.51)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.71, 5 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 1.87 events/sec (20 total: 10 down / 10 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **122.2** (airborneKills=0, links≈4, airMs=4220, stallMs=3551)

