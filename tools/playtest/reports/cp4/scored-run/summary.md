# scored-run — playtest report

- URL: `http://127.0.0.1:60493/index.html?score=1&fallback=1&testapi=1`
- Started: 2026-08-01T14:54:57.357Z
- Wall time: 31.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 115ms (409 samples)

## Outcome
- Result: **not-completed**
- Attempts: 0, falls (final attempt, only visible on victory): 0
- Kills: 3, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 7
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.9s of 31.0s PLAYING time (fraction 0.029)
- Airborne time (`airMs`): 24.9s
- Closest approach to crush edge (`minEdgeMargin`): 32.86 tiles
- Vertical range: y 0.19–9.01 (span 8.82)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, mid-catwalk, wall-launch]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 1, 7 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 2.5 events/sec (78 total: 39 down / 39 up)
- protoScore (A.5 formula, REAL — from the game's own event stream, ?score=1): **598** (airborne_kill=3, link=0, airMs=25426, stallMs=883)
- Score snapshot (final, tune=run): CHARGE 0 (notch 0 COLD), THREAT **920** → OBSERVE; counts {"airborne_kill":3,"launch_kill":1,"link":0,"reclaim":0,"wager":0,"recatch":2,"ground_kill":0}; hot 13825ms of 30978ms; setbacks 3

