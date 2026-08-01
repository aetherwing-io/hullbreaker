# polyp-facetank — playtest report

- URL: `http://127.0.0.1:64309/index.html?slice=traversal&polyp=1&testapi=1`
- Started: 2026-08-01T04:21:54.291Z
- Wall time: 14.1s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 42ms (342 samples)

## Outcome
- Result: **stalled**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 8.7s of 13.9s PLAYING time (fraction 0.622)
- Airborne time (`airMs`): 4.2s
- Closest approach to crush edge (`minEdgeMargin`): 16.09 tiles
- Vertical range: y 3–12.79 (span 9.79)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **6.3** (airborneKills=0, links≈1, airMs=4207, stallMs=8652)

