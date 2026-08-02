# ribrun-climb — playtest report

- URL: `http://127.0.0.1:8756/index.html?slice=traversal&ribrun=1&testapi=1`
- Started: 2026-08-02T02:41:41.966Z
- Wall time: 5.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.8ms / max 156ms (65 samples)

## Outcome
- Result: **completed**
- Served build: **traversal-slice** (fixture `traversal-ribrun-v1`, pace base) — 1 authored route(s), dare pocket absent
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 0
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 4.5s PLAYING time (fraction 0)
- Airborne time (`airMs`): 3.8s
- Closest approach to crush edge (`minEdgeMargin`): 35.42 tiles
- Vertical range: y 3.39–17.14 (span 13.75)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[ribline]**
- Route inference (harness-only best guess): **ribline** (confidence 0.88, 7 connectors matched)
- Air jumps: 1 final attempt (peak single attempt 1; resets every retry)
- Dare pocket: **unavailable** — the served fixture (traversal-ribrun-v1) collapses its dare pocket to a zero-width span (x0 === x1), which is how src/pure/ribrun.js switches the pocket off — there is no pocket on this build to enter
- Hostiles seen: up to 0 concurrent (none) on 0/65 sampled ticks
- Input density (A.5: deliberately NOT a score input): 4.62 events/sec (24 total: 12 down / 12 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **195.3** (airborneKills=0, links≈6, airMs=3779, stallMs=0)

