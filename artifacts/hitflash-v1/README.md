# hitflash-v1 — the hit flash at the shipped FAR view (I-010, T-030)

Evidence for inbox item **I-010**: *"a hostile in its hit-flash renders with
`glow = 0xffffff`, which at FAR erases the wasp's green-diamond silhouette
entirely — it becomes a featureless ~13px white quad… Suggest the flash tint
the existing silhouette rather than replace it."*

Every frame here is 1280x800, `?slice=traversal`, the shipped **FAR** default
view, concept palette. The A/B is the operator's existing readability flag:

| panel | URL |
|---|---|
| before | `index.html?slice=traversal&view=far&legibility=0` |
| after (shipped) | `index.html?slice=traversal&view=far` |

Under `?legibility=0` the flash tint resolves to exactly 0, so the "before"
panel is the pre-pass white flash produced by the **same build** as the
"after" panel — not by an older tree.

## Files

| file | what it is |
|---|---|
| `wasp-cruise-hit--far-{before,after}--noflash.png` | a cruising drone, one frame before the flash |
| `wasp-cruise-hit--far-{before,after}--flash.png` | the same drone, same world instant, flashing |
| `wasp-cruise-hit--far-{before,after}--pair.png` | the two above, side by side |
| `wasp-cruise-hit--far-{before,after}--detail.png` | the same pair at 3.4x on the drone |
| `wasp-dive-hit--far-after--*.png` | the same, on a drone that is already wearing the T-003 dive commitment glow |
| `*.json` | the staged frame's sim state + the measured pixels |

## What the pixels say

Measured on the flashed body's **core** (the fully covered pixels, so an
anti-aliased edge over teal cannot flatter the number):

| frame | saturation | hue | luma |
|---|---|---|---|
| cruising drone, no flash | 0.68 | 122° (acid green) | 51 |
| cruising drone, flash **before** | **0.08** | 181° (neutral) | 162 |
| cruising drone, flash **after** | **0.20** | 103° (acid green) | 155 |

The flash keeps its pop (3x the body's luma; the before/after luma differ by
4%) and stops being hueless: saturation is 2.6x the pre-pass value and the hue
returns to the ecology's family instead of landing on neutral.

On a drone that is ALREADY glowing (the dive cue), measured in the same frame
over the body's own box rather than through the diff mask:

| frame | saturation | hue | luma |
|---|---|---|---|
| diving drone, dive glow | 0.43 | 68° | 213 |
| diving drone, flash (after) | 0.26 | 76° | 211 |

so a hit on a committed diver still reads as a wash-out, which is what keeps
"I hit it" from turning into a second commitment cue.

## Honesty notes

* **The frames are staged.** The rig drives the already-judged
  `tools/playtest/scripts/mid-route.json` until a live wasp is beside RIG,
  then writes `flashUntil` on that one hostile row between two rendered
  frames. `flashUntil` is a render-only field (`src/sim/hostiles.js` writes
  it, only `src/render/hostiles.js` reads it), so the run is not steered by
  the intervention — but the moment was chosen by the rig, not by the bot
  landing a shot.
* **The pair is frame-exact, the modes are not.** Inside one panel the two
  frames are one `?fixeddt=6` step apart (the json records `simMsBetween: 12`
  and how far the drone moved: 0.03 tiles for the cruise scenes). The before
  and after panels are two page loads, so judge the flash across them, not
  pixel deltas — though in this set both modes caught the same drone within
  0.04 tiles of the same place.
* **The `*.json` numbers for the DIVE scene are the weak ones.** The rig
  isolates the body as "the pixels that got brighter", which works when the
  body was dark and fails when the body was already glowing: the dive scene's
  core is 9 pixels and its `unflashedCore` hue (189°) is background. The dive
  numbers quoted above were measured over the body's own box instead.
* Frames are judged against boards 01/10 (acid-green danger against teal
  atmosphere and rust structure) and the concept-art visual invariants, not
  against taste, and nothing here is a verdict that the flash *feels* right —
  that is the operator's call.

## Reproducing

`hitflash-capture.mjs` in this directory is the rig. It belongs under
`tools/playtest/`; it is parked here because that directory was lane-fenced to
concurrent harness tasks when T-030 ran. It takes the worktree to photograph
as an argument and serves it on an ephemeral port (never 8741/8742):

```
node artifacts/hitflash-v1/hitflash-capture.mjs --root <worktree> \
     --mode before --extra '&legibility=0' --state cruise --fixeddt 6
node artifacts/hitflash-v1/hitflash-capture.mjs --root <worktree> \
     --mode after --state cruise --fixeddt 6
node artifacts/hitflash-v1/hitflash-capture.mjs --root <worktree> \
     --mode after --state dive --fixeddt 6
```

It needs `tools/playtest/node_modules` (the harness's own `npm install`) and
Chrome; it writes only into this directory.
