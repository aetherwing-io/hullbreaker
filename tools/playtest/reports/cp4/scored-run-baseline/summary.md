# scored-run-baseline — playtest report

- URL: `http://127.0.0.1:60658/index.html?testapi=1`
- Started: 2026-08-01T14:55:34.913Z
- Wall time: 31.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 118ms (409 samples)

## Outcome
- Result: **not-completed**
- Attempts: 0, falls (final attempt, only visible on victory): 0
- Kills: 5, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 4
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 1, **2 spent** (at 19.1s x 89.25→51.611, 27.3s x 89.25→51.582)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 1.7s of 31.0s PLAYING time (fraction 0.056)
- Airborne time (`airMs`): 24.1s
- Closest approach to crush edge (`minEdgeMargin`): 3.67 tiles
- Vertical range: y 0.22–9.01 (span 8.8)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, mid-catwalk, wall-launch]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 1, 7 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 2.5 events/sec (78 total: 39 down / 39 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **924.8** (airborneKills=5, links≈6, airMs=24062, stallMs=1740)

