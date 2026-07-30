# mid-route-competent — playtest report

- URL: `http://127.0.0.1:53396/index.html?slice=traversal&testapi=1`
- Started: 2026-07-30T02:04:33.270Z
- Wall time: 5.3s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.3ms / max 77ms (67 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 4.5s PLAYING time (fraction 0)
- Airborne time (`airMs`): 3.8s
- Closest approach to crush edge (`minEdgeMargin`): 35.44 tiles
- Vertical range: y 3.4–15.44 (span 12.04)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 4.92 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **70.2** (airborneKills=0, links≈1, airMs=3763, stallMs=0)

