# g2-neck-flip — playtest report

- URL: `http://127.0.0.1:57898/index.html?g2=1&enemies=0&testapi=1`
- Started: 2026-08-02T01:57:08.055Z
- Wall time: 13.1s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.6ms / max 163ms (168 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 0
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 12.3s PLAYING time (fraction 0)
- Airborne time (`airMs`): 3.2s
- Closest approach to crush edge (`minEdgeMargin`): 30.11 tiles
- Vertical range: y 3–7.85 (span 4.85)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **lower-service** (confidence 0, 0 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.3 events/sec (4 total: 2 down / 2 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **38.4** (airborneKills=0, links≈0, airMs=3200, stallMs=0)

