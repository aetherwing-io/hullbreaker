# mortar-zone-deny — playtest report

- URL: `http://127.0.0.1:63853/index.html?slice=traversal&mortar=1&testapi=1`
- Started: 2026-08-01T15:49:52.703Z
- Wall time: 6.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.5ms / max 133ms (83 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 0
- Stock lives (HUD `×N`): **unavailable** — no lives readout in this trace — the HUD prints ×N only outside the traversal slice (src/ui/hud.js)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.9s of 5.8s PLAYING time (fraction 0.157)
- Airborne time (`airMs`): 3.4s
- Closest approach to crush edge (`minEdgeMargin`): 35.42 tiles
- Vertical range: y 3–12.8 (span 9.8)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 0 events/sec (0 total: 0 down / 0 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **58.4** (airborneKills=0, links≈1, airMs=3394, stallMs=911)

