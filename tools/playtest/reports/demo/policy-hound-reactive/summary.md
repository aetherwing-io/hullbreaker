# policy-hound-reactive — playtest report

- URL: `http://127.0.0.1:53332/index.html?slice=traversal&hound=1&testapi=1`
- Started: 2026-07-30T02:04:19.577Z
- Wall time: 3.6s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.6ms / max 77ms (45 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.3s of 3.3s PLAYING time (fraction 0.091)
- Airborne time (`airMs`): 1.8s
- Closest approach to crush edge (`minEdgeMargin`): 35.44 tiles
- Vertical range: y 1–4.24 (span 3.24)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, dare-pocket]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.57, 4 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.55 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **94.3** (airborneKills=0, links≈3, airMs=1813, stallMs=302)

