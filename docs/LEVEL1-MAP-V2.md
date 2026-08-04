# Level 1 map recomposition

Level 1 now uses six authored encounter strips instead of repeating one rising
staircase over the procedural catwalk carpet. The deck remains the reliable
recovery line, while each face supplies two elevated routes that split, cross,
drop and rejoin through real ladders and collision ribs.

This is still one climb up the same hostile Meridian. It does not introduce a
future track type, replace the six-face camera, or expose more of the coil.
Every face keeps its last seven tiles clear for the gate and turn ritual.

## Measured change

| Metric | Previous map | Current map |
| --- | ---: | ---: |
| Total platforms | 87 | 73 |
| Authored encounter platforms | 45 | 52 |
| Traversable ladders | 26 | 32 |
| Collision ribs / cover | 6 | 10 |
| Anonymous density-repair platforms | present | 0 |
| Immediate route range | 3–6 | 3–5 |
| Repeated encounter silhouette | 6 faces | 0 faces |

The lower total platform count is intentional. Long anonymous rows were
removed; the remaining geometry is more connected and more purposeful. The
current map offers more authored encounter pieces and connectors without
turning the screen into a scaffold grid.

| Face | Previous pieces / vertical span | Current silhouette | Support dialect | Current pieces / span | Connectors | Staging sites | Recovery lanes |
| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | 8 / 9.5 | Split Rib | Sparse ribs | 9 / 10 | 5 | 5 | 1 |
| 2 | 7 / 10.5 | Chimney Fork | Service columns | 7 / 11 | 5 | 5 | 1 |
| 3 | 7 / 11.5 | Crossfire Cavity | Inverted cavities | 8 / 12 | 6 | 5 | 2 |
| 4 | 7 / 12.5 | Vent Stack | Exhaust trunks | 8 / 13 | 5 | 5 | 2 |
| 5 | 8 / 13.5 | Kill Braid | Braces and cable braid | 10 / 14 | 5 | 6 | 2 |
| 6 | 8 / 14.5 | Crown Roots | Heavy keel roots | 10 / 15 | 6 | 7 | 2 |

All six faces measure between three and five immediate route bands. Every
authored platform has a reachable support and a forward jump or safe drop.
Ladders join real collision surfaces and leave a clear RIG-width corridor.

The renderer also gives each authored face its own structural support dialect.
The difference is deliberately architectural rather than a palette swap: ribs,
service frames, negative-space cavities, exhaust trunks, braided braces and
Crown buttresses all use the existing component atlas and materials. Shared
arrival and gate modules remain the visual refrain that keeps the six faces on
one continuous machine.

## Encounter language

- **Split Rib** teaches low/high switching and a short apex route without
  blocking Cindermouth's ground-fire lesson.
- **Chimney Fork** adds two wall-launch ribs and a fast vertical fork.
- **Crossfire Cavity** creates opposing defensive perches around a protected
  low escape line.
- **Vent Stack** alternates landings up a tall shaft, then offers a deliberate
  drop back to the middle route.
- **Kill Braid** crosses low, middle and aerial lanes so pressure can approach
  from different heights without sealing the deck.
- **Crown Roots** is the widest and tallest face, with seven explicit defender
  sites and two recovery lanes under the final ascent.

The topology is authored in
[`src/pure/vertical-assault.js`](../src/pure/vertical-assault.js). Platform,
ladder, collision, foreground dressing and route visibility all consume the
same data, so visuals and gameplay cannot silently diverge.

## Production proof

Run:

```sh
node tools/vertical-assault-check.mjs
node tools/vertical-assault/runtime-check.mjs
node tools/vertical-assault/runtime-sim-check.mjs
node tools/pathcheck.mjs
node tools/playtest/level1-map-v2-capture.mjs /private/tmp/hullbreaker-level1-map-v2
```

The production capture visits all six faces, all five ordinary turns, the
Crown approach and three portrait views in one isolated browser. It records
current-face visibility, fold-owned RIG presentation, foreground component
and response-socket ownership, draw calls and texture residency. It does not
use a graybox or traversal fixture.
