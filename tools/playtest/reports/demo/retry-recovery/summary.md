# retry-recovery — playtest report

- URL: `http://127.0.0.1:54534/index.html?slice=traversal&enemies=0&testapi=1`
- Started: 2026-07-30T02:06:44.395Z
- Wall time: 21.3s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.4ms / max 84ms (279 samples)

## Outcome
- Result: **died**
- Attempts: 2, falls (final attempt, only visible on victory): 0
- Kills: 0, deaths observed: 1, hits survived: 1
- Retry key re-assertion: 1 retry transition(s) detected, held keys re-pressed within <=75ms each time (script held: ArrowRight) — see README "Fixed: zombie attempts (F7)"

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 18.1s of 20.3s PLAYING time (fraction 0.892)
- Airborne time (`airMs`): 0.7s
- Closest approach to crush edge (`minEdgeMargin`): 0.4 tiles
- Vertical range: y 2–3.97 (span 1.97)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.29, 2 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.09 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **-111.6** (airborneKills=0, links≈1, airMs=677, stallMs=18094)

