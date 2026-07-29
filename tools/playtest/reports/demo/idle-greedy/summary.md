# idle-greedy — playtest report

- URL: `http://127.0.0.1:55951/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-07-29T23:04:29.785Z
- Wall time: 9.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.6ms / max 77ms (119 samples)

## Outcome
- Result: **stalled**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 8.5s of 8.9s PLAYING time (fraction 0.949)
- Airborne time (`airMs`): 0.5s
- Closest approach to crush edge (`minEdgeMargin`): 0.4 tiles
- Vertical range: y 2.39–4 (span 1.61)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.29, 2 connectors matched)
- Air jumps: **unavailable** — window.HB has not landed and the ?testapi=1 snapshot does not currently expose sliceStats.airJumps (it has attempt/falls but not airJumps) — recommend adding it alongside those, or via window.HB
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **-37.2** (airborneKills=0, links≈1, airMs=456, stallMs=8463)

