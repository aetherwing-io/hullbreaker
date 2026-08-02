# six-face-full-run — playtest report

- URL: `http://127.0.0.1:8791/index.html?testapi=1`
- Started: 2026-08-02T09:04:06.751Z
- Wall time: 241.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 76.3ms / max 131ms (3159 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **2** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 8, hits survived: 3
- Stock lives (source: telemetry): 3 → 1, **2 spent** (at 3.0s x 31.649→2.528, 28.5s x 61.064→51.5)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 21.9s of 240.9s PLAYING time (fraction 0.091)
- Airborne time (`airMs`): 216.9s
- Closest approach to crush edge (`minEdgeMargin`): 3.59 tiles
- Vertical range: y -5.57–12.01 (span 17.59)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 8 concurrent (carrier, hound, wasp) on 3159/3159 sampled ticks
- Input density (A.5: deliberately NOT a score input): 0.01 events/sec (2 total: 1 down / 1 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.
## Deterministic dispatch (input keyed to the game's own clock)
- Events dispatched: **2 of 2**; sim clock reached 240.9s (advanced 240.9s); stop reason: script-window


