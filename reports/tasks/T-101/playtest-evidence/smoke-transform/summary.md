# transform-slice — playtest report

- URL: `http://127.0.0.1:8779/index.html?slice=transform&enemies=0&testapi=1&fixeddt=16.667`
- Started: 2026-10-23T01:39:08.521Z
- Wall time: 985.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 1023.4ms / max 2721ms (954 samples)

## Outcome
- Result: **completed**
- Served build: **transform-slice** — 0 authored route(s), dare pocket absent
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 0
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.0s of 945.1s PLAYING time (fraction 0)
- Airborne time (`airMs`): 813.4s
- Closest approach to crush edge (`minEdgeMargin`): 30.07 tiles
- Vertical range: y 3–12.89 (span 9.89)
- Route coverage / inference: **unavailable** — the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose fixture authors no connectors, routes or dare pocket
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose fixture authors no connectors, routes or dare pocket
- `?enemies=0`: **honoured** — ?enemies=0 sets SLICE_ENEMIES_ENABLED (src/mode.js), which is read in exactly one place: src/sim/spawner.js, where a FIXTURE spawns its authored list. It is SLICE-ONLY — the default six-face run's ambient spawner never consults it (SPRINT I-026). On this run it held: zero hostile rows across 954 sampled ticks.
- Input density (A.5: deliberately NOT a score input): 0.06 events/sec (58 total: 29 down / 29 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose fixture authors no connectors, routes or dare pocket. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (frame-scoped, page-authored ledger)
- Events dispatched: **52 of 58**; sim clock reached 15.6s (advanced 15.5s); stop reason: script-window
- Exact stop: tick 938/1104, status **running**, fixed dt 16.667ms
- WARNING: 6 of 58 events never dispatched — the run stopped (script-window) with the sim clock at 15634ms, short of the next event's t=15800ms


