# G1 equivalence: default vs ?g1=1 (identical input)

A fixed, feedback-free script of 130 key events, dispatched on the
game's own clock under `?fixeddt=16.6667`, run against the default six-face
build twice (the frame-timing noise floor) and against `?g1=1` once.
Limb pieces baked in the g1 run: **836**.

## Runs

| run | samples | last gameMs | end state | maxX | kills | ritual seen | corners cleared |
| --- | --- | --- | --- | --- | --- | --- | --- |
| defaultA | 1299 | 33200.1 | GAME_OVER | 89.25 | 1 | false | 0 |
| defaultB | 1291 | 33016.7 | GAME_OVER | 89.25 | 2 | false | 0 |
| g1 | 1306 | 33200.1 | GAME_OVER | 89.25 | 3 | false | 0 |

## Frame-timing-independent invariants

| quantity | defaultA | defaultB | g1 |
| --- | --- | --- | --- |
| edgeStrip | 45.334924 | 45.334924 | 45.334924 |
| haltS | 75 | 75 | 75 |
| pivotS | 89 | 89 | 89 |
| gateScrollX | 75 | 75 | 75 |
| turnStartScrollX | null | null | null |
| ritualMaxTMs | 0 | 0 | 0 |
| gateWaveX | [53.5617,64.7078,75.8539,86.8333] | [53.5617,64.7078,75.8539,86.9167] | [53.5617,64.7078,75.8539,86.9167] |
| gateWaveY | [4.6,4.6,4.8599,7.6] | [4.6,4.6,4.8352,7.6] | [4.6,4.6,4.8352,7.6] |
| afterScrollX | null | null | null |
| kindsSeen | ["carrier","wasp"] | ["carrier","wasp"] | ["carrier","wasp"] |
| attempts | 0 | 0 | 0 |

**No cross-mode mismatch:** every quantity either matches in all three runs, or already differs between the two default runs (listed below as noise).

Not frame-timing independent in this build (the two DEFAULT runs already disagree, so these carry no information about the flag):

- `gateWaveX`: defaultA [53.5617,64.7078,75.8539,86.8333], defaultB [53.5617,64.7078,75.8539,86.9167], g1 [53.5617,64.7078,75.8539,86.9167]
- `gateWaveY`: defaultA [4.6,4.6,4.8599,7.6], defaultB [4.6,4.6,4.8352,7.6], g1 [4.6,4.6,4.8352,7.6]

## Trace deviation (max over matched game time)

| pair | samples | max Δx | max Δy | max ΔscrollX | max ΔedgeMargin |
| --- | --- | --- | --- | --- | --- |
| defaultA-vs-defaultB (noise floor) | 765 | 11.851 | 4.35 | 0.0717 | 11.851 |
| defaultA-vs-g1 | 765 | 11.8299 | 4.35 | 0.0717 | 11.8299 |
| defaultB-vs-g1 | 770 | 1.2533 | 1.1533 | 0.0717 | 1.1817 |

Corner ritual covered by every run: **false**
Verdict: **RENDER-ONLY UP TO THE GATE (ritual window proved in tools/pathcheck.mjs)**

Read the deviation table against the noise floor row: two runs of the same
build differ by browser frame timing alone, so a cross-mode pair that is no
further apart than that pair carries no mode-dependent gameplay signal.
