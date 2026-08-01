# expJ-strafe — playtest report

- URL: `http://127.0.0.1:8771/index.html?testapi=1`
- Started: 2026-08-01T19:32:16.935Z
- Wall time: 65.1s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 140ms (856 samples)

## Outcome
- Result: **not-completed**
- Attempts: 0, falls (final attempt, only visible on victory): 0
- Kills: 21, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 7
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 0, **3 spent** (at 23.1s x 89.25→51.5, 51.7s x 144.627→116.389, 64.4s x 201.541→202.245)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 1.6s of 64.4s PLAYING time (fraction 0.025)
- Airborne time (`airMs`): 55.8s
- Closest approach to crush edge (`minEdgeMargin`): 3.43 tiles
- Vertical range: y 2–10.19 (span 8.19)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **recovery-scramble** (confidence 1, 7 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.03 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **2706.6** (airborneKills=19, links≈6, airMs=55781, stallMs=1595)

