# hound-wasp-squeeze — playtest report

- URL: `http://127.0.0.1:61328/index.html?slice=traversal&hound=2&testapi=1`
- Started: 2026-08-02T04:18:14.400Z
- Wall time: 3.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 78.1ms / max 177ms (44 samples)

## Outcome
- Result: **not-completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 1
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.5s of 3.4s PLAYING time (fraction 0.158)
- Airborne time (`airMs`): 1.7s
- Closest approach to crush edge (`minEdgeMargin`): 35.39 tiles
- Vertical range: y 1–4.36 (span 3.36)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[lower-service, dare-pocket]**
- Route inference (harness-only best guess): **lower-service** (confidence 0.57, 4 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: entered=false (not observed), reward taken=false
- Hostiles seen: up to 3 concurrent (hound, wasp) on 44/44 sampled ticks
- Input density (A.5: deliberately NOT a score input): 1.64 events/sec (6 total: 3 down / 3 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **91** (airborneKills=0, links≈3, airMs=1688, stallMs=531)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **6 of 6**; sim clock reached 3.3s (advanced 3.3s); stop reason: script-window


