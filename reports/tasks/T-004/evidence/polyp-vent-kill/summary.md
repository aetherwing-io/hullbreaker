# polyp-vent-kill — playtest report

- URL: `http://127.0.0.1:64344/index.html?slice=traversal&polyp=1&testapi=1`
- Started: 2026-08-01T04:22:09.413Z
- Wall time: 6.4s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.7ms / max 42ms (152 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 1, deaths observed: 0, hits survived: 1

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.5s of 5.7s PLAYING time (fraction 0.078)
- Airborne time (`airMs`): 3.5s
- Closest approach to crush edge (`minEdgeMargin`): 35.41 tiles
- Vertical range: y 3–12.79 (span 9.79)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.31 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **64** (airborneKills=0, links≈1, airMs=3550, stallMs=451)

