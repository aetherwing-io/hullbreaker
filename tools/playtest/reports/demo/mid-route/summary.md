# mid-route-competent — playtest report

- URL: `http://127.0.0.1:55902/index.html?slice=traversal&testapi=1`
- Started: 2026-07-29T23:04:08.918Z
- Wall time: 7.8s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.5ms / max 78ms (97 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 6.8s PLAYING time (fraction 0)
- Airborne time (`airMs`): 6.0s
- Closest approach to crush edge (`minEdgeMargin`): 17.57 tiles
- Vertical range: y 3.28–12.25 (span 8.97)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 0.5, 4 connectors matched)
- Air jumps: **unavailable** — window.HB has not landed and the ?testapi=1 snapshot does not currently expose sliceStats.airJumps (it has attempt/falls but not airJumps) — recommend adding it alongside those, or via window.HB
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 3.34 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **147.5** (airborneKills=0, links≈3, airMs=6041, stallMs=0)

