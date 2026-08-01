# scored-run-nojump — playtest report

- URL: `http://127.0.0.1:8788/index.html?score=1&testapi=1`
- Started: 2026-08-01T14:58:02.567Z
- Wall time: 31.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.3ms / max 112ms (406 samples)

## Outcome
- Result: **not-completed**
- Attempts: 0, falls (final attempt, only visible on victory): 0
- Kills: 0, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 0
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 0, **3 spent** (at 3.2s x 31.649→2.644, 6.6s x 31.649→5.5, 9.8s x 31.649→31.649)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 9.8s PLAYING time (fraction 0)
- Airborne time (`airMs`): 3.3s
- Closest approach to crush edge (`minEdgeMargin`): 3.89 tiles
- Vertical range: y -7–7 (span 14)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.14, 1 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.13 events/sec (4 total: 2 down / 2 up)
- protoScore (A.5 formula, REAL — from the game's own event stream, ?score=1): **40.2** (airborne_kill=0, link=0, airMs=3347, stallMs=0)
- Score snapshot (final, tune=run): CHARGE 0 (notch 0 COLD), THREAT **0** → OBSERVE; counts {"airborne_kill":0,"launch_kill":0,"link":0,"reclaim":0,"wager":0,"recatch":0,"ground_kill":0}; hot 0ms of 9805ms; setbacks 0

