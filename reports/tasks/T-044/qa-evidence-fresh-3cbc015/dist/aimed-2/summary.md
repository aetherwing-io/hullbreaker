# six-face-aimed-run — playtest report

- URL: `http://127.0.0.1:8792/index.html?testapi=1`
- Started: 2026-08-02T10:34:16.829Z
- Wall time: 68.4s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.4ms / max 185ms (891 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **3** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 19, hits survived: 6
- Stock lives (source: telemetry): 3 → 0, **3 spent** (at 31.9s x 130.83→74.686, 47.8s x 149.949→116.5, 67.5s x 182.212→182.772)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 2.7s of 67.6s PLAYING time (fraction 0.041)
- Airborne time (`airMs`): 57.0s
- Closest approach to crush edge (`minEdgeMargin`): 3.13 tiles
- Vertical range: y 2–9.94 (span 7.94)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 9 concurrent (carrier, hound, wasp) on 891/891 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.03 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **1 of 2**; sim clock reached 67.5s (advanced 67.5s); stop reason: game-over
- 1 event(s) left pending, which is expected for a run that stopped at game-over — its script window was longer than the run.


