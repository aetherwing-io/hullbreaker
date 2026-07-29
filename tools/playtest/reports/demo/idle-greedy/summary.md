# idle-greedy — playtest report

- URL: `http://127.0.0.1:54988/index.html?slice=traversal&enemies=0`
- Started: 2026-07-29T22:54:40.222Z
- Wall time: 9.3s
- Fidelity: **dom** (no `window.HB` — degraded/DOM mode, see limitations)
- Sampling: requested every 75ms, achieved avg 75.7ms / max 80ms (119 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): n/a
- Kills: 0, deaths observed: 0, hits survived: 0

## Pacing / fairness metrics
- Idle time: **unavailable** — window.HB not present or no velocity samples — idle time needs (vx, vy) over time, which the HUD never renders
- Closest approach to crush edge: 0.4 tiles
- Vertical range: **unavailable** — window.HB not present — y position is never shown in the HUD
- Route inference: **unavailable** — window.HB not present — route inference needs an (x, y) position trace, which the HUD never renders
- Air jumps: **unavailable** — window.HB not present — sliceStats.airJumps is never rendered to the HUD mid-run
- Dare pocket: entered=false (not observed), reward taken=false
- Input density: 0 events/sec (0 total: 0 down / 0 up)

