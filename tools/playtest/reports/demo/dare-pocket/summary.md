# dare-pocket-attempt — playtest report

- URL: `http://127.0.0.1:54958/index.html?slice=traversal`
- Started: 2026-07-29T22:54:28.721Z
- Wall time: 10.7s
- Fidelity: **dom** (no `window.HB` — degraded/DOM mode, see limitations)
- Sampling: requested every 75ms, achieved avg 75.6ms / max 77ms (139 samples)

## Outcome
- Result: **not-completed**
- Attempts: 1, falls (final attempt, only visible on victory): n/a
- Kills: 0, deaths observed: 0, hits survived: 2

## Pacing / fairness metrics
- Idle time: **unavailable** — window.HB not present or no velocity samples — idle time needs (vx, vy) over time, which the HUD never renders
- Closest approach to crush edge: 11.1 tiles
- Vertical range: **unavailable** — window.HB not present — y position is never shown in the HUD
- Route inference: **unavailable** — window.HB not present — route inference needs an (x, y) position trace, which the HUD never renders
- Air jumps: **unavailable** — window.HB not present — sliceStats.airJumps is never rendered to the HUD mid-run
- Dare pocket: entered=true (hud-text), reward taken=false
- Input density: 1.86 events/sec (20 total: 10 down / 10 up)

