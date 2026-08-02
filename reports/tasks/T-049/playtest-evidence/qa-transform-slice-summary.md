# transform-slice — playtest report

- URL: `http://127.0.0.1:8790/index.html?slice=transform&enemies=0&testapi=1`
- Started: 2026-08-02T11:09:44.967Z
- Wall time: 16.5s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.9ms / max 168ms (211 samples)

## Outcome
- Result: **completed**
- Served build: **transform-slice** — 0 authored route(s), dare pocket absent
- Attempts: 1, falls (final attempt, only visible on victory): 0
- Deaths: **0** (source: `sliceStats.attempts` — fixture retries: sliceStats.attempts increments (src/main.js resetGame, inside `if (ACTIVE_FIXTURE)`). A HULL FALLBACK absorption is not a retry — see metrics.score.setbacks — and a manual R restart increments the same counter.)
- Kills: 0, hits survived: 0
- Stock lives (source: telemetry): 3 → 3, **0 spent**

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 15.7s PLAYING time (fraction 0.011)
- Airborne time (`airMs`): 13.2s
- Closest approach to crush edge (`minEdgeMargin`): 30.17 tiles
- Vertical range: y 3–13.1 (span 10.1)
- Route coverage / inference: **unavailable** — the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose fixture authors no connectors, routes or dare pocket
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose fixture authors no connectors, routes or dare pocket
- `?enemies=0`: **honoured** — ?enemies=0 sets SLICE_ENEMIES_ENABLED (src/mode.js), which is read in exactly one place: src/sim/spawner.js, where a FIXTURE spawns its authored list. It is SLICE-ONLY — the default six-face run's ambient spawner never consults it (SPRINT I-026). On this run it held: zero hostile rows across 211 sampled ticks.
- Input density (A.5: deliberately NOT a score input): 3.51 events/sec (58 total: 29 down / 29 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose fixture authors no connectors, routes or dare pocket. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **52 of 58**; sim clock reached 15.6s (advanced 15.6s); stop reason: victory
- 6 event(s) left pending, which is expected for a run that stopped at victory — its script window was longer than the run.


