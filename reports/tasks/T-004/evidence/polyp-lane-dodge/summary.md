# polyp-lane-dodge — playtest report

- URL: `http://127.0.0.1:60539/index.html?slice=traversal&polyp=1&testapi=1`
- Started: 2026-08-01T03:57:41.681Z
- Wall time: 12.3s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 42ms (297 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 3.8s of 11.7s PLAYING time (fraction 0.322)
- Airborne time (`airMs`): 6.8s
- Closest approach to crush edge (`minEdgeMargin`): 31 tiles
- Vertical range: y 3–12.39 (span 9.39)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.98 events/sec (12 total: 6 down / 6 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **77.1** (airborneKills=0, links≈1, airMs=6849, stallMs=3756)

