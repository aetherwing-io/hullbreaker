# six-face-full-run — playtest report

- URL: `http://127.0.0.1:8792/index.html?testapi=1`
- Started: 2026-08-02T10:40:44.286Z
- Wall time: 113.6s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 77ms / max 383ms (1467 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **3** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 17, hits survived: 6
- Stock lives (source: telemetry): 3 → 0, **3 spent** (at 36.2s x 92.815→65.504, 55.7s x 125.715→116.5, 112.2s x 175.089→175.303)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 6.8s of 112.4s PLAYING time (fraction 0.06)
- Airborne time (`airMs`): 101.1s
- Closest approach to crush edge (`minEdgeMargin`): 3.29 tiles
- Vertical range: y 2–12.01 (span 10.01)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 9 concurrent (carrier, hound, wasp) on 1467/1467 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.02 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **1 of 2**; sim clock reached 112.2s (advanced 112.2s); stop reason: game-over
- 1 event(s) left pending, which is expected for a run that stopped at game-over — its script window was longer than the run.


