# six-face-aimed-run — playtest report

- URL: `http://127.0.0.1:8790/index.html?testapi=1`
- Started: 2026-08-02T08:45:21.449Z
- Wall time: 38.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.4ms / max 131ms (498 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **3** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 10, hits survived: 3
- Stock lives (source: telemetry): 3 → 0, **3 spent** (at 25.8s x 76.624→51.5, 33.0s x 110.649→70.61, 37.5s x 110.649→110.649)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.2s of 37.5s PLAYING time (fraction 0.006)
- Airborne time (`airMs`): 33.6s
- Closest approach to crush edge (`minEdgeMargin`): 3.16 tiles
- Vertical range: y -7.11–11.15 (span 18.25)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 8 concurrent (carrier, hound, wasp) on 498/498 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.05 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **1 of 2**; sim clock reached 37.5s (advanced 37.5s); stop reason: game-over
- 1 event(s) left pending, which is expected for a run that stopped at game-over — its script window was longer than the run.


