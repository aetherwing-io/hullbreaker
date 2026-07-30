# retry-recovery — playtest report

- URL: `http://127.0.0.1:54677/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-07-30T00:29:14.962Z
- Wall time: 21.3s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.3ms / max 81ms (279 samples)

## Outcome
- Result: **died**
- Attempts: 2, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 1, hits survived: 3
- Retry key re-assertion: 1 retry transition(s) detected, held keys re-pressed within <=75ms each time (script held: ArrowRight) — see README "Fixed: zombie attempts (F7)"

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 17.6s of 20.3s PLAYING time (fraction 0.87)
- Airborne time (`airMs`): 1.1s
- Closest approach to crush edge (`minEdgeMargin`): 0.4 tiles
- Vertical range: y 2–3.99 (span 1.99)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.57, 4 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.09 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **-52.5** (airborneKills=0, links≈3, airMs=1130, stallMs=17627)

