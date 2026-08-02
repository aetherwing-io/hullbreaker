# six-face-aimed-run — playtest report

- URL: `http://127.0.0.1:8792/index.html?testapi=1`
- Started: 2026-08-02T10:38:16.632Z
- Wall time: 104.6s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.6ms / max 252ms (1361 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **3** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 20, hits survived: 6
- Stock lives (source: telemetry): 3 → 0, **3 spent** (at 45.4s x 154.25→116.5, 57.7s x 131.738→116.5, 103.6s x 215.624→215.624)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 5.2s of 103.7s PLAYING time (fraction 0.05)
- Airborne time (`airMs`): 88.6s
- Closest approach to crush edge (`minEdgeMargin`): 3.59 tiles
- Vertical range: y 2–9.87 (span 7.87)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 14 concurrent (carrier, hound, wasp) on 1361/1361 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.02 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **1 of 2**; sim clock reached 103.6s (advanced 103.5s); stop reason: game-over
- 1 event(s) left pending, which is expected for a run that stopped at game-over — its script window was longer than the run.


