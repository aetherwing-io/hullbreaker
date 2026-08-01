# mortar-hound-stack — playtest report

- URL: `http://127.0.0.1:63879/index.html?slice=traversal&mortar=2&testapi=1`
- Started: 2026-08-01T15:50:00.168Z
- Wall time: 5.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.9ms / max 152ms (72 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 0
- Stock lives (HUD `×N`): **unavailable** — no lives readout in this trace — the HUD prints ×N only outside the traversal slice (src/ui/hud.js)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 5.0s PLAYING time (fraction 0)
- Airborne time (`airMs`): 3.9s
- Closest approach to crush edge (`minEdgeMargin`): 35.41 tiles
- Vertical range: y 3–12.79 (span 9.79)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **72.3** (airborneKills=0, links≈1, airMs=3941, stallMs=0)

