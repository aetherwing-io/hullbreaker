# polyp-facetank — playtest report

- URL: `http://127.0.0.1:60572/index.html?slice=traversal&polyp=1&testapi=1`
- Started: 2026-08-01T03:57:55.277Z
- Wall time: 14.2s
- Fidelity: **testapi**
- Sampling: requested every 40ms, achieved avg 40.8ms / max 45ms (342 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 7.2s of 13.9s PLAYING time (fraction 0.516)
- Airborne time (`airMs`): 5.6s
- Closest approach to crush edge (`minEdgeMargin`): 20.84 tiles
- Vertical range: y 3–12.92 (span 9.92)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.85 events/sec (12 total: 6 down / 6 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **35.3** (airborneKills=0, links≈1, airMs=5645, stallMs=7179)

## Errors observed
- [page error] key up failed for Space: keyboard.up: Target page, context or browser has been closed

