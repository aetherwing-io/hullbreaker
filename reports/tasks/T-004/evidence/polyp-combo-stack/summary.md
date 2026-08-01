# polyp-combo-stack — playtest report

- URL: `http://127.0.0.1:60636/index.html?slice=traversal&polyp=2&testapi=1`
- Started: 2026-08-01T03:58:20.990Z
- Wall time: 12.3s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 42ms (298 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 1

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 3.8s of 11.7s PLAYING time (fraction 0.327)
- Airborne time (`airMs`): 7.1s
- Closest approach to crush edge (`minEdgeMargin`): 28.07 tiles
- Vertical range: y 3–12.26 (span 9.26)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 3 final attempt (peak single attempt 3; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.97 events/sec (12 total: 6 down / 6 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **79.1** (airborneKills=0, links≈1, airMs=7061, stallMs=3834)

