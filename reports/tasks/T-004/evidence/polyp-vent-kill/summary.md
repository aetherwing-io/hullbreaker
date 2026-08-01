# polyp-vent-kill — playtest report

- URL: `http://127.0.0.1:60604/index.html?slice=traversal&polyp=1&testapi=1`
- Started: 2026-08-01T03:58:10.315Z
- Wall time: 9.7s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 42ms (233 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 1, deaths observed: 0, hits survived: 1

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 2.7s of 9.1s PLAYING time (fraction 0.298)
- Airborne time (`airMs`): 4.5s
- Closest approach to crush edge (`minEdgeMargin`): 30.47 tiles
- Vertical range: y 3.34–15.51 (span 12.17)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 1.44 events/sec (14 total: 7 down / 7 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **57.3** (airborneKills=0, links≈1, airMs=4488, stallMs=2696)

