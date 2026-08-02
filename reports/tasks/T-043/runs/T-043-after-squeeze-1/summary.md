# hound-wasp-squeeze — playtest report

- URL: `http://127.0.0.1:8760/index.html?slice=traversal&hound=2&testapi=1`
- Started: 2026-08-02T04:18:32.893Z
- Wall time: 3.6s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 77.7ms / max 165ms (44 samples)

## Outcome
- Result: **not-completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 1
- Stock lives: **unavailable** — this trace carries neither player.lives (the ?testapi/HB telemetry field, added T-025) nor a HUD ×N readout (the traversal slice does not print one, src/ui/hud.js) — no life count can be recovered from it

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.8s of 3.3s PLAYING time (fraction 0.227)
- Airborne time (`airMs`): 1.4s
- Closest approach to crush edge (`minEdgeMargin`): 35.42 tiles
- Vertical range: y 2–4.37 (span 2.37)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, dare-pocket]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.57, 4 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Hostiles seen: up to 3 concurrent (hound, wasp) on 44/44 sampled ticks
- Input density (A.5: deliberately NOT a score input): 1.65 events/sec (6 total: 3 down / 3 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **86.3** (airborneKills=0, links≈3, airMs=1447, stallMs=759)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **6 of 6**; sim clock reached 3.3s (advanced 3.3s); stop reason: script-window


