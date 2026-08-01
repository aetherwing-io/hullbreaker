# CP3 v3 equivalence: baseline vs cover-choreography rework (identical input)

The v3 rework (T-001) is render + pure-choreography only. Three runs of
`tools/playtest/scripts/transform-slice.json` under `--deterministic`
(input injection keyed to gameMs, `?fixeddt`), all on this worktree:
one with the rework stashed (**baseline** = merged main), two with it
applied (**v3a**, **v3b** — the same-build pair is the frame-timing noise
floor). Traces compared on a 50 ms interpolated game-time grid.

## Trace deviation (max over matched game time)

| pair | max Δx | max Δy | max ΔscrollX |
| --- | --- | --- | --- |
| v3a-vs-v3b (noise floor) | 0.68 | 5.53 | 3.67 |
| baseline-vs-v3a | 0.28 | 2.66 | 1.66 |
| baseline-vs-v3b | 0.96 | 5.52 | 5.03 |

Every cross-build pair sits at or inside the same-build noise floor: no
mode-dependent gameplay signal. (The Δy magnitude is jump-phase sampling
noise — the same magnitude the G1 equivalence pack measured between two
runs of one build.)

## Outcome invariants

| quantity | baseline | v3a | v3b |
| --- | --- | --- | --- |
| result | completed | completed | completed |
| attempts / falls / deaths | 1 / 0 / 0 | 1 / 0 / 0 | 1 / 0 / 0 |
| rituals fired | flip + breach | flip + breach | flip + breach |
| final band / altitude | 2 / 20 | 2 / 20 | 2 / 20 |

## The stronger claim is static

`git diff` for the rework touches no `src/sim/` file, and
`tools/pathcheck.mjs` now asserts statically that no sim module references
`transformPanelState`, `transformVapor`, or `transformCoverAjar` — the sim
cannot read the cover choreography, so the rework is sim-equivalent by
construction, not just by measurement. The sim-facing pure surface
(timeline beats, scroll offsets, halt/trigger/frontier/seal geometry,
level build) is unchanged and still pinned by the existing assertions.

Verdict: **RENDER-ONLY** (trace noise floor + static import guard).
