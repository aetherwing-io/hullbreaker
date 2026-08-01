# polyp-lane-dodge — playtest report

- URL: `http://127.0.0.1:64280/index.html?slice=traversal&polyp=1&testapi=1`
- Started: 2026-08-01T04:21:40.692Z
- Wall time: 12.3s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 42ms (296 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 5.3s of 11.6s PLAYING time (fraction 0.459)
- Airborne time (`airMs`): 5.3s
- Closest approach to crush edge (`minEdgeMargin`): 26.63 tiles
- Vertical range: y 3–12.79 (span 9.79)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **46.4** (airborneKills=0, links≈1, airMs=5340, stallMs=5338)

