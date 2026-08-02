# T-050 — what the shipped default actually renders (I-037)

Three frames, 1440x900, shipped FAR view, `?shell=0`, **matched on the scroll
cursor** (`window.HB.scrollX() >= 8`) rather than on a wall clock — the shipped
scroll is a constant, so the same cursor is the same camera pose in every build.
Captured by `scratchpad/t050-capture.mjs` through
`tools/playtest/lib/server.mjs`; the piece counts are `window.HB.g1.pieces`,
read from each page.

| file | build | plan | scroll |
|---|---|---|---|
| `01-shipped-default.png` | `task/T-050` = `main`, plain URL | **1633** pieces (818 mark/backdrop) | 8.1652 |
| `02-scale0-escape-hatch.png` | same build, `?scale=0` | 829 pieces, 0 mark/backdrop | 8.1654 |
| `03-stale-build-pre-T-045.png` | `/private/tmp/hb-pin-main-cd37b91` (`cd37b91`) | 829 pieces, 0 mark/backdrop | 8.1658 |

**01 vs 02** is the honest A/B for the scale pass: one build, one URL apart,
everything else identical. Pixels that differ between them: **344,711 = 26.6% of
the frame**, 215,485 of them in the top third (the graded backdrop tiers) and
100,665 in the bottom third (the hull-skirt ladders, hatches and doors).

**03 is NOT that comparison** and must not be read as one. It is a whole tree
from before the scale pass merged, so it is missing T-035b, T-038, T-039, T-040,
T-042, T-047 and T-048 as well — the seam pips, the route-lip highlights, the
contact shadows, the light rig, tone mapping and bloom are all absent from it
too. It is here for one purpose: it is what a stale cache or a stale server root
serves, i.e. what the I-037 session was looking at while `main` rendered 01.
