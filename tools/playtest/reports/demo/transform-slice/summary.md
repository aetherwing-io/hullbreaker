# transform-slice — playtest report

- URL: `http://127.0.0.1:58306/index.html?slice=transform&enemies=0&testapi=1`
- Started: 2026-07-30T02:18:15.588Z
- Wall time: 16.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.4ms / max 81ms (214 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 15.6s PLAYING time (fraction 0)
- Airborne time (`airMs`): 13.6s
- Closest approach to crush edge (`minEdgeMargin`): 30.13 tiles
- Vertical range: y 3–13.16 (span 10.16)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[mid-catwalk, wall-launch]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.86, 6 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 3.52 events/sec (58 total: 29 down / 29 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **288.7** (airborneKills=0, links≈5, airMs=13645, stallMs=0)

