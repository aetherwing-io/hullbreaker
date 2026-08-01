# six-face-aimed-run — playtest report

- URL: `http://127.0.0.1:8771/index.html?testapi=1`
- Started: 2026-08-01T19:24:45.408Z
- Wall time: 50.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 124ms (664 samples)

## Outcome
- Result: **not-completed**
- Attempts: 0, falls (final attempt, only visible on victory): 0
- Kills: 11, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 7
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 0, **3 spent** (at 23.1s x 88.857→51.5, 31.9s x 97.118→57.553, 49.8s x 154.25→154.25)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 1.4s of 49.9s PLAYING time (fraction 0.029)
- Airborne time (`airMs`): 42.9s
- Closest approach to crush edge (`minEdgeMargin`): 3.35 tiles
- Vertical range: y 2–10.19 (span 8.19)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 1, 8 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.04 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **1578.1** (airborneKills=9, links≈7, airMs=42882, stallMs=1439)

