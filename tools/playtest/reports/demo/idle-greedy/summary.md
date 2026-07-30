# idle-greedy — playtest report

- URL: `http://127.0.0.1:54387/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-07-30T00:27:41.681Z
- Wall time: 9.3s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.3ms / max 77ms (120 samples)

## Outcome
- Result: **stalled**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 8.4s of 9.0s PLAYING time (fraction 0.941)
- Airborne time (`airMs`): 0.5s
- Closest approach to crush edge (`minEdgeMargin`): 0.4 tiles
- Vertical range: y 2–4 (span 2)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.29, 2 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **-36.1** (airborneKills=0, links≈1, airMs=530, stallMs=8433)

