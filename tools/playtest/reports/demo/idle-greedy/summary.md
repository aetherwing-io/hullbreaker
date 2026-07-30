# idle-greedy — playtest report

- URL: `http://127.0.0.1:53538/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-07-30T02:04:51.363Z
- Wall time: 9.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.4ms / max 82ms (119 samples)

## Outcome
- Result: **stalled**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 8.5s of 8.9s PLAYING time (fraction 0.958)
- Airborne time (`airMs`): 0.4s
- Closest approach to crush edge (`minEdgeMargin`): 12.3 tiles
- Vertical range: y 3–3.99 (span 0.99)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.14, 1 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **-63.6** (airborneKills=0, links≈0, airMs=378, stallMs=8521)

