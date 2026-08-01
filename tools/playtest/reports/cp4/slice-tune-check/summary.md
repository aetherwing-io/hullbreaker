# mid-route-competent — playtest report

- URL: `http://127.0.0.1:8788/index.html?slice=traversal&score=1&testapi=1`
- Started: 2026-08-01T14:58:43.476Z
- Wall time: 7.1s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.7ms / max 117ms (90 samples)

## Outcome
- Result: **completed**
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Kills: 0, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): 0, hits survived: 1
- Stock lives (HUD `×N`): **unavailable** — no lives readout in this trace — the HUD prints ×N only outside the traversal slice (src/ui/hud.js)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 6.4s PLAYING time (fraction 0.024)
- Airborne time (`airMs`): 5.2s
- Closest approach to crush edge (`minEdgeMargin`): 35.43 tiles
- Vertical range: y 3.41–12.03 (span 8.62)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 3 final attempt (peak single attempt 3; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Input density (A.5: deliberately NOT a score input): 3.68 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, REAL — from the game's own event stream, ?score=1): **61.2** (airborne_kill=0, link=0, airMs=5199, stallMs=148)
- Score snapshot (final, tune=slice): CHARGE 0 (notch 0 COLD), THREAT **0** → OBSERVE; counts {"airborne_kill":0,"launch_kill":0,"link":0,"reclaim":0,"wager":0,"recatch":0,"ground_kill":0}; hot 0ms of 6343ms; setbacks 0

