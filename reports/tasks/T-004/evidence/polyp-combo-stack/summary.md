# polyp-combo-stack — playtest report

- URL: `http://127.0.0.1:64373/index.html?slice=traversal&polyp=2&testapi=1`
- Started: 2026-08-01T04:22:16.606Z
- Wall time: 12.3s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 42ms (297 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 4.8s of 11.7s PLAYING time (fraction 0.409)
- Airborne time (`airMs`): 6.0s
- Closest approach to crush edge (`minEdgeMargin`): 25.95 tiles
- Vertical range: y 3–12.79 (span 9.79)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 3 final attempt (peak single attempt 3; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **58.3** (airborneKills=0, links≈1, airMs=5958, stallMs=4772)

