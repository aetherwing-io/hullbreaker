# scored-run-baseline — playtest report

- URL: `http://127.0.0.1:8756/index.html?testapi=1`
- Started: 2026-08-02T02:40:25.937Z
- Wall time: 31.2s
- Fidelity: **testapi**
- Sampling: requested every 75ms, achieved avg 75.9ms / max 158ms (409 samples)

## Outcome
- Result: **died**
- Served build: **default-run** — 0 authored route(s), dare pocket absent
- Attempts: **n/a** — sliceStats.attempts is fixture-only — src/main.js increments it inside `if (ACTIVE_FIXTURE)` and this run is the default six-face run, so the counter is structurally frozen at its initial value here. Read outcome.deaths / metrics.lives.
- Deaths: **2** (source: `lives` — stock lives spent on the default six-face run (player.lives decreases; fixtures do not spend lives, this run is not one). HULL FALLBACK absorptions (?fallback=1) cost no life — see metrics.score.setbacks — so a fallback-armed run's failure story is both numbers.)
- Kills: 5, hits survived: 4
- Stock lives (source: telemetry): 3 → 1, **2 spent** (at 22.5s x 89.25→51.577, 30.4s x 89.25→51.5)

## Pacing / fairness metrics
- Idle time (A.5 `stallMs`): 0.9s of 31.0s PLAYING time (fraction 0.029)
- Airborne time (`airMs`): 26.5s
- Closest approach to crush edge (`minEdgeMargin`): 3.59 tiles
- Vertical range: y 0.75–9.01 (span 8.26)
- Route coverage / inference: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Air jumps: 0 final attempt (peak single attempt 0; resets every retry)
- Dare pocket: **unavailable** — the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against
- Hostiles seen: up to 8 concurrent (carrier, hound, wasp) on 409/409 sampled ticks
- Input density (A.5: deliberately NOT a score input): 2.5 events/sec (78 total: 39 down / 39 up)
- protoScore (A.5 formula): **unavailable** — the A.5 `links` term cannot be approximated on this build: the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare pocket, so there is nothing for this metric to be computed against. Run with ?score=1 for the game's own event-derived link count (metrics.score), which needs no route matcher.

