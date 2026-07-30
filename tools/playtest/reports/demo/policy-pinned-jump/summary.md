# policy-pinned-jump — playtest report

- URL: `http://127.0.0.1:53251/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-07-30T02:04:08.455Z
- Wall time: 10.3s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.4ms / max 82ms (133 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 1.7s of 10.0s PLAYING time (fraction 0.174)
- Airborne time (`airMs`): 6.6s
- Closest approach to crush edge (`minEdgeMargin`): 24.23 tiles
- Vertical range: y 1–3.99 (span 2.99)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, dare-pocket]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.57, 4 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=true
- Input density (A.5: deliberately NOT a score input): 0.19 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **139.9** (airborneKills=0, links≈3, airMs=6563, stallMs=1732)

