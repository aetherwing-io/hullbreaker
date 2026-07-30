# mid-route-competent — playtest report

- URL: `http://127.0.0.1:54257/index.html?slice=traversal&testapi=1`
- Started: 2026-07-30T00:27:20.054Z
- Wall time: 8.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.3ms / max 79ms (108 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 1

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 7.6s PLAYING time (fraction 0.03)
- Airborne time (`airMs`): 6.3s
- Closest approach to crush edge (`minEdgeMargin`): 18.38 tiles
- Vertical range: y 3.36–12.36 (span 9)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 0.5, 4 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 3.06 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **149.1** (airborneKills=0, links≈3, airMs=6328, stallMs=226)

