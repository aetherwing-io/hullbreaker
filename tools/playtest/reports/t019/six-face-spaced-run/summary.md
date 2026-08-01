# six-face-spaced-run — playtest report

- URL: `http://127.0.0.1:8771/index.html?testapi=1`
- Started: 2026-08-01T19:42:10.265Z
- Wall time: 52.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 122ms (693 samples)

## Outcome
- Result: **not-completed**
- Attempts: 0, falls (final attempt, only visible on victory): 0
- Kills: 10, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 7
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 0, **3 spent** (at 20.6s x 85.676→51.5, 28.0s x 60.438→51.5, 52.0s x 150.649→150.641)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 2.7s of 52.0s PLAYING time (fraction 0.051)
- Airborne time (`airMs`): 42.6s
- Closest approach to crush edge (`minEdgeMargin`): 3.59 tiles
- Vertical range: y 2–10.16 (span 8.16)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 1, 8 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.04 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **1464.6** (airborneKills=8, links≈7, airMs=42565, stallMs=2653)

