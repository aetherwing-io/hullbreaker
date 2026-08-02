# T-045 — the scale pass: what a player can now compare RIG against

**Worktree** `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-045`
**Branch** `task/T-045` (base `cad82ed`, which was `main`'s tip when this
started — T-035 had not merged, so there was nothing to rebase onto)

## Lead: the comparison objects

Before this branch there was **no object of known size anywhere in the frame
except RIG himself**, so nothing in the picture could tell you whether the
Meridian was continent-sized or room-sized. The hull under his feet was a bare
rust field for ~30 tiles, and the haze band above the wall held two pieces of
"distant anatomy", one of which computes a fog factor of **1.16** — clamped to
100% haze, i.e. drawn in exactly the background color and invisible at every
shipped view — and one at 0.875, i.e. 12.5% of its own contrast.

A player can now compare him against, in the same frame:

1. **Rung ladders, hatches, personnel doors and a gantry railing**, sized
   against `CONFIG.player.height` (RIG is 1.7 tiles; a door is 2.9, a rail post
   1.0, rungs 0.62 apart and 1.3 wide — wider than his 0.7-tile shoulders).
   They run down the hull skirt directly beneath his feet, in the bottom third
   of the frame, and they are the *only* new detail he can see up close.
2. **The same ladder and the same railing, at the same absolute size, on the
   backdrop limb** at depth 14 — asserted identical, because a reference object
   re-sized to look good at distance is not a reference object. That pairing is
   the mechanism: the eye calibrates on the near ladder and then reads the same
   ladder, tiny, on something crossing the sky.
3. **Four graded steps of anatomy** between him and the sky where there was one
   flat field: the wall at fog 0.161, the sister limb at 0.446, vertebral drums
   at 0.625, the far body at 0.804, sky at 1.0.
4. **Something enormous in frame at every column of the run** — asserted, not
   asserted-about-authored-geometry: the far body's mass overlaps every `s` in
   `[0, levelLength]` within one chamfer.

**Before/after, same moment, same run, one URL apart:**
`artifacts/scale-v1/0{1,2,3}-*-{before,after}.png` (1440x900, shipped FAR).

## What changed

| File | Change |
|---|---|
| `src/config.js` | `CONFIG.limb.backdrop` (three tiers) + `CONFIG.limb.mark` (reference objects), with both derived fences written out. `CONFIG.limb.silhouette` untouched — it is now the `?scale=0` A/B. |
| `src/pure/limb.js` | Tier and mark emitters; `limbBakePlan(cfg, groundH, {scale})`; three audit helpers (`limbFogFactor`, `limbBackdropPieces` + `limbAbovePlayBand`, `limbBackdropGaps`). |
| `src/render/limb.js` | 13 new kinds mapped onto the **existing eight** material keys; `?scale=0` read from `QUERY`. |
| `tools/pathcheck.mjs` | One self-contained T-045 block, +41 assertions (lifts verbatim into a `tools/pathcheck/` domain module once T-037's split lands — that split is not in this branch's base). |
| `tools/playtest/scale-capture.mjs` + README | New dev-only paired-capture and measurement rig. |

**Tier 1 is a sister limb, not a backdrop plate.** It reuses the played limb's
own vocabulary — segmented mass, a lip along the top, rings at the segment
joints — at ~2.6x scale on a diagonal, because self-similarity is what makes
two masses read as one *creature* rather than as scenery. It wears the palette's
**rust body tokens**; the drums and far body wear **teal** structure/distance
tokens. Warm near, cool far, is what atmospheric perspective is.

### The two fences every number is derived from

**Haze ladder.** `f = (|depth| + camera.z − limb.fog.near) / (fog.far − fog.near)`.
`camera.js` shifts the band by exactly the view pull-back, so the shift cancels
and a tier grades identically at `?view=near|mid|far` (asserted the long way,
through the shift, not by trusting the cancellation). Authored: **0.446 /
0.625 / 0.804**, deltas 0.179 and 0.179 against a 0.15 floor.

**Play-band screen fence.** For a pinhole camera, two points at the same screen
x order by `(y − camera.y) / distance`, so "is this piece drawn above the play
band" is exact arithmetic and needs no projection. `?view=near` binds hardest;
the floors it imposes are y = 16.58 / 18.00 / 19.43 for depths 14 / 19 / 24
(far: 14.70 / 15.44 / 16.19). Every backdrop piece clears its floor at all three
views. **Consequence, which is the point for pillar 5: no hostile, tracer,
capsule or falling RIG is ever drawn against new backdrop mass.** The air where
the fight happens is exactly as clean as it was. It is also why nothing here can
become the interior "warehouse" read entry 0b rejected — a lid would have to
hang into the play band to be a lid.

Reference objects are fenced the other way: every one sits entirely **below**
`playBand.y0`, inside the authored hull-skirt band, inside the FAR frame, and
with outward reach ≤ 0, so not one of them is mass the fall rules must judge.

## Verification — every command and its result

| Command | Result |
|---|---|
| `node tools/pathcheck.mjs` (in the worktree) | **1853 passed, 0 failed** (base `cad82ed`: 1812 — **+41**) |
| `node tools/playtest/run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over --max-runtime-ms 145000` | completed: **55.1 s, 12 kills, 3 deaths, ended at game-over**, 722 samples at avg 75.9 ms. Inside that script's own documented 50.2–55.1 s band (one run, so read the band, not the decimals). Summary committed at `reports/tasks/T-045/playtest-six-face-spaced-run.md` |
| `node tools/playtest/run.mjs scripts/mid-route.json --deterministic` | **completed, 0 deaths**, served build `traversal-slice (traversal-v1)`. The slice sets `ACTIVE_FIXTURE ≠ null`, so `IS_G1` is false and the limb bake does not run there at all. `reports/tasks/T-045/playtest-mid-route.md` |
| `node tools/playtest/g1-capture.mjs selftest` | **ALL PASS, CONSOLE CLEAN** — normal 35 checks, normal+g1 35, normal+g1+view=near 35, traversal 37, transform 36 |
| `node tools/playtest/scale-capture.mjs shots` | 6 frames + the measurement table below; **no page errors on either variant** |

### Proving the new assertions bind (break → red → restore)

Each break was applied to the committed tree, `node tools/pathcheck.mjs` run,
then `git checkout --` restored. Tree verified clean afterwards; pathcheck back
to 1853/0.

| Break | What printed |
|---|---|
| sister tier depth −14 → −34 | `FAIL backdrop tier 0 (depth -34) grades at f=1.161, inside the visible haze band` + 5 more |
| sister tier floor y0 17 → 10 | `FAIL at ?view=near/mid/far every backdrop piece draws entirely ABOVE the play band … bdLimb bottoms at y=12.40` (3 fails) |
| far-body segment overlap 0.6 → −6 (holes in the horizon) | `FAIL the far body overlaps every column of the run: no mass within 2 tiles of s in [0, 1]` |
| a door authored at 6 tiles | `FAIL a door is door-sized against RIG himself: 6 tiles vs a 1.7-tile marine (3.53x)` |
| mark band moved up into the play band | `FAIL every near-limb reference object sits below the protected play band` |
| far body given its own material | `FAIL the scale pass adds no material bucket, therefore no draw call: 9 instanced draws with it, 8 without` |
| `?scale=0` renamed | `FAIL the pass is ON by default with ?scale=0 as the escape hatch (entry 16)` |
| sister-limb rungs scaled 2.5x "to look right at distance" | `FAIL markRung is the SAME absolute width on both limbs (1.300x0.200 vs 3.250x0.200)` |

### Cost

**Draw calls: zero added.** Measured as real GL draw calls per animation frame
(the WebGL context is wrapped in an init script; three.js's `renderer.info` is
on no global), same three moments, both variants:

| moment | before (`?scale=0`) | after (default) |
|---|---|---|
| 01 climb-open | 102 | 102 |
| 02 climb-mid | 103 | 103 |
| 03 corner-approach | 100 | 100 |

The corner-approach pair moved by ±1 between runs, which tracks live hostile
and projectile counts, not the limb. The structural guarantee is the asserted
one: the limb bakes **one instanced draw per distinct material**, and the pass
maps all 13 new kinds onto the 8 keys that already existed — 8 buckets before,
8 after. Budget was +1 to +2; it spends 0. Bake plan: 829 → 1633 static pieces,
uploaded once at boot and never touched (no per-frame, ritual or build hook in
the module — still asserted).

### Frame measurement (`scale-capture.mjs measure`)

Same statistics as the audit table in the look packet, **recomputed by this rig,
not that pipeline** — read the delta, not the absolute against that table.
"sky" is the upper 45% of frame, where the haze band lands.

| frame | largest exact color | distinct colors | sky p05/p50/p95 | sky spread |
|---|---|---|---|---|
| 01 before | `#2f565e` **38.2%** | 4049 | 46.8 / 78.3 / 78.3 | 31.5 |
| 01 after | `#2f565e` **28.4%** | 5443 | 41.3 / 77.3 / 78.3 | 37.0 |
| 02 before | `#2f565e` **40.2%** | 4358 | 46.7 / 78.3 / 78.3 | 31.6 |
| 02 after | `#2f565e` **32.2%** | 7071 | 36.1 / 78.3 / 78.3 | 42.2 |
| 03 before | `#2f565e` **47.7%** | 7181 | 50.5 / 78.3 / 78.3 | 27.7 |
| 03 after | `#2f565e` **39.8%** | 8263 | 40.6 / 78.3 / 78.3 | 37.7 |

**Honest reading:** the single flat haze token drops by 8–10 points of frame
coverage and distinct colors rise 15–62%, but `#2f565e` is *still* the largest
single color in every frame and the sky band's median is still exactly 78.3.
This narrows the gap the audit measured; it does not close it. Closing it needs
either the sky itself to stop being one value (§4.2, needs a decision) or more
mass in the band than the play-band fence permits.

## Open questions for the operator — you judge, I do not

Serve the merged build and compare, same URL, one flag apart:

- **after (shipped default):** `http://127.0.0.1:8741/index.html`
- **before:** `http://127.0.0.1:8741/index.html?scale=0`

(also captured: `artifacts/scale-v1/`, three matched pairs)

1. Standing on the deck at the shipped FAR view: does the ladder-and-hatch band
   on the hull below RIG make him read as *small*, or does it read as busy
   texture that pulls the eye off the fight?
2. The limb crossing the upper frame is meant to read as **another arm of the
   same creature**. Does it read as body, or as scenery/architecture floating
   above the level?
3. There is a deliberate strip of clean haze between the top of the wall and
   the bottom of the backdrop, so nothing is ever drawn behind a hostile. Does
   that gap read as distance, or does it make the backdrop look like it is
   hovering? (If it should come down behind the fight, that is a readability
   trade I need you to make, not me.)
4. The far horizon carries a cluster of spires once per face — board 14's Crown
   silhouette, unlit. Is a visible distant Crown something you want in frame
   during the run, or does it belong only at the end of the climb?
5. Three tiers or fewer? The nearest one (the sister limb) does the most work
   and costs the most attention; the drums are nearly subliminal at 62% haze.

## What I did not do, and why

- **No frame past the first joint.** Corner 1 is a wave gate that must be fought
  open, and the judged policy died there on every attempt this rig made
  (GAME_OVER at scroll 88). A poked `CONFIG` would have produced the frame and
  would not have been evidence.
- **No new palette tokens and no light/post work.** `src/render/palette.js` is
  contended (T-030/T-035) and the light rig and post-processing both need a
  decision entry first. Every value here comes from existing tokens plus fog.
- **No seam pips, lamps or emissives.** That is T-038's lane; the backdrop and
  the Crown spires are silhouette only.
- **`?scale=0` keeps one pre-existing oddity**, unchanged and now documented:
  the legacy `silhouette[0]` slab misses the same play-band fence by 0.27 tiles
  at `?view=near`. It is invisible at f=1.16 anyway. The fence is asserted on
  the shipped plan only, and the assertion that the legacy backdrop still
  contains a fully-hazed slab is deliberate — it keeps the defect this pass
  replaced documented rather than remembered.

## PROPOSED INBOX ISSUES

```
## I-??? | art | S3 | repro: index.html (default), any moment mid-facet | evidence: reports/tasks/T-045/build.md measurement table
The background is still one exact color over 28-40% of the frame, and the upper
band's median luminance is still exactly 78.3 — a constant. The scale pass adds
mass in front of that field but cannot fix the field itself, because the play-band
fence (correctly) keeps mass out of the air the fight happens in. Fix direction:
the sky itself has to carry a gradient (look packet §4.2, needs an operator
decision) — this is the remaining half of the "aerial perspective runs backwards"
finding, and no lane can close it without that decision.
```

```
## I-??? | art | S3 | repro: index.html, right of any corner pivot | evidence: artifacts/scale-v1/03-corner-approach-after.png
Approaching a joint, everything past the pivot is empty haze: the next facet's
anatomy is authored on the next heading, so at 60 degrees off it is edge-on and
effectively invisible from here. The far body now bridges one chamfer past each
end of its facet, which softens it, but the left third of the corner-approach
capture is still bare sky. Fix direction: a corner-local backdrop piece authored
on the CHAMFER heading (it bisects the two facets), so a turn is revealed with
mass behind it rather than with a hole.
```

## Single best next action

Get the operator's verdict on question 2 (does the sister limb read as body or
as scenery). Everything else in the pass is fenced and asserted; that one answer
decides whether tier 1 grows into the run's main scale device or gets pushed
deeper and quieter, and it is the only question whose answer changes the shape
of the next build rather than its dose.
