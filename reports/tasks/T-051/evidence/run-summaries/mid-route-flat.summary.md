# mid-route-competent — playtest report

- URL: `http://127.0.0.1:8761/index.html?slice=traversal&backdrop=flat&testapi=1`
- Started: 2026-08-02T11:50:01.440Z
- Wall time: 8.0s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 77ms / max 200ms (101 samples)

## Outcome
- Result: **completed**
- Served build: **traversal-slice** (fixture `traversal-v1`, pace base) — 6 authored route(s), dare pocket present
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 2
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 7.2s PLAYING time (fraction 0.028)
- Airborne time (`airMs`): 6.2s
- Closest approach to crush edge (`minEdgeMargin`): 34.72 tiles
- Vertical range: y 3–12.98 (span 9.98)
- Route coverage (A.5 `routeIds`, >=3 connectors matched in order): **[upper-chimney, recovery-scramble]**
- Route inference (harness-only best guess): **upper-chimney** (confidence 0.5, 4 connectors matched)
- Air jumps: 2 final attempt (peak single attempt 2; resets every retry)
- Dare pocket: entered=true (position-in-bounds), reward taken=false
- Hostiles seen: up to 2 concurrent (wasp) on 101/101 sampled ticks
- Input density (A.5: deliberately NOT a score input): 3.26 events/sec (26 total: 13 down / 13 up)
- protoScore (A.5 formula, proxy airborneKills/links — see README): **147.6** (airborneKills=0, links≈3, airMs=6185, stallMs=199)
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **20 of 26**; sim clock reached 7.2s (advanced 7.1s); stop reason: victory
- 6 event(s) left pending, which is expected for a run that stopped at victory — its script window was longer than the run.


