# scored-run-nojump — playtest report

- URL: `http://127.0.0.1:8788/index.html?fallback=1&testapi=1`
- Started: 2026-08-01T14:57:25.254Z
- Wall time: 31.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 120ms (409 samples)

## Outcome
- Result: **stalled**
- Attempts: 0, falls (final attempt, only visible on victory): 1
- Kills: 4, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 8
- Stock lives (HUD `×N` — the failure counter that works outside fixtures): 3 → 2, **1 spent** (at 16.0s x 41.649→44.652)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 21.9s of 31.0s PLAYING time (fraction 0.707)
- Airborne time (`airMs`): 5.0s
- Closest approach to crush edge (`minEdgeMargin`): 0.44 tiles
- Vertical range: y -6.95–7.9 (span 14.85)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 0.63, 5 connectors matched)
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0.13 events/sec (4 total: 2 down / 2 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **-15.4** (airborneKills=0, links≈4, airMs=4978, stallMs=21889)

