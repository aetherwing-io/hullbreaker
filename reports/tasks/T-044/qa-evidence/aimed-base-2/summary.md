# six-face-aimed-run — playtest report

- URL: `http://127.0.0.1:8791/index.html?testapi=1`
- Started: 2026-08-02T08:55:31.233Z
- Wall time: 53.6s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.4ms / max 125ms (698 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **3** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 10, hits survived: 6
- Stock lives (source: telemetry): 3 → 0, **3 spent** (at 27.6s x 86.001→51.5, 37.4s x 91.649→57.5, 52.8s x 153.049→152.609)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 1.3s of 52.8s PLAYING time (fraction 0.025)
- Airborne time (`airMs`): 44.1s
- Closest approach to crush edge (`minEdgeMargin`): 3.59 tiles
- Vertical range: y 2–10.04 (span 8.04)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 10 concurrent (carrier, hound, wasp) on 698/698 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.04 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **1 of 2**; sim clock reached 52.8s (advanced 52.7s); stop reason: game-over
- 1 event(s) left pending, which is expected for a run that stopped at game-over — its script window was longer than the run.


