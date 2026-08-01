# scored-run-nojump — playtest report

- URL: `http://127.0.0.1:60959/index.html?score=1&fallback=1&testapi=1`
- Started: 2026-08-01T14:56:12.229Z
- Wall time: 31.1s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 119ms (408 samples)

## Outcome
- Result: **stalled**
- Attempts: 0, falls (final attempt, only visible on victory): 1
- Kills: 4, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 8
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 2, **1 spent** (at 16.0s x 41.662→44.685)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 22.0s of 30.9s PLAYING time (fraction 0.712)
- Airborne time (`airMs`): 4.8s
- Closest approach to crush edge (`minEdgeMargin`): 0.4 tiles
- Vertical range: y -6.95–7.88 (span 14.83)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **recovery-scramble** (confidence 0.86, 6 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.13 events/sec (4 total: 2 down / 2 up)
- protoScore (A.5 formula, REAL — from the game's own event stream, ?score=1): **-16.5** (airborne_kill=1, link=0, airMs=4892, stallMs=21899)
- Score snapshot (final, tune=run): CHARGE 0 (notch 0 COLD), THREAT **325** → OBSERVE; counts {"airborne_kill":1,"launch_kill":0,"link":0,"reclaim":1,"wager":0,"recatch":0,"ground_kill":3}; hot 0ms of 30898ms; setbacks 3

