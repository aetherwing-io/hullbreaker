# mid-route-competent — playtest report

- URL: `http://127.0.0.1:55782/index.html?slice=traversal&testapi=1`
- Started: 2026-08-02T05:22:06.729Z
- Wall time: 7.7s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.4ms / max 133ms (97 samples)

## Outcome
- Result: **completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 1
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 6.9s PLAYING time (fraction 0.022)
- Airborne time (`airMs`): 5.7s
- Closest approach to crush edge (`minEdgeMargin`): 35.42 tiles
- Vertical range: y 3.31–12.02 (span 8.72)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[none]**
- Route inference (harness-only best guess): **mid-catwalk** (confidence 0.29, 2 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Hostiles seen: up to 2 concurrent (wasp) on 97/97 sampled ticks
- Input density (A.5: deliberately NOT a score input): 3.4 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **92.7** (airborneKills=0, links≈1, airMs=5741, stallMs=151)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **19 of 26**; sim clock reached 6.9s (advanced 6.8s); stop reason: victory
- 7 event(s) left pending, which is expected for a run that stopped at victory — its script window was longer than the run.


