# t038-seams — warm-white seam pips and route-lip lights (S5, T-038)

Evidence for the S5 item in `docs/proposals/2026-08-look-direction.md` §3:
the only proposal in that packet's set claimed to put pixels above
luminance 200 on screen (measured at 0.0% in the packet's own 31-capture
audit). All frames here are 1280x800, the shipped **FAR** default view (no
`?view=` override — absent resolves to `far`), concept palette (no
`?palette=` override).

**Recalibrated against decisions.md entry 14 (2026-08-02).** The first
version of this evidence was measured before T-035's value ladder existed.
Entry 14 makes the HALF-dose ladder the shipped default and states plainly:
"seam pips... calibrate against the value range the world actually ships
with." Every number and frame below is now measured against a **scratch
merge of `task/T-038` + `task/T-035`** (T-035 has not merged to `main` yet,
so this is the closest available approximation of the world this pass will
actually ship into — see "Reproducing" for the exact method). The prior,
pre-ladder numbers are **not preserved here**; if you need them, they were:
draw calls 94→96, gameplay-pair luminance 0.097%→0.333%.  They are
superseded, not additional evidence — the difference from the numbers below
turned out to be negligible (see "Why the ladder barely moved the number"),
but they were the wrong world to cite and a reviewer correctly flagged that.

## Ships ON by default (decisions.md entries 16 and 17, 2026-08-02)

Entry 16 retires the blanket "prototypes ship behind query flags, off by
default" rule and names this exact pass as an example of the harm it caused
("the value ladder, the seam pips and the RIG pass all landed invisible
behind flags he never typed"). Entry 17 goes further: shown five pinned
lanes including this one, the operator's verdict was *"all of those 5
builds look good to me"* — seam pips are explicitly one of the approved
builds, cleared to merge. `resolveSeams` resolves ON for absent/''/junk;
**`?seams=0`** is the escape hatch back to the pre-pass look, matching
`resolveLegibility`'s shape. The query strings in every scenario below
reflect this: the "baseline" (no pips) side is the explicit `&seams=0`, not
an absent flag.

**`src/render/seams.js` is now wired into `src/main.js`.** A reviewer
(`reports/tasks/T-038/review.md`) first caught that it was not — the team
lead confirmed the fence on that file (written when T-032 held it) had
lifted, since T-032 merged before this task finished. `import
'./render/seams.js';` sits after `import './render/level.js';`. Every
number and frame below is from the **real, wired worktree** (or a scratch
merge of it with T-035, see below) — no throwaway copy is needed for this
purpose any more; `capture.mjs` still uses one internally only because it
is designed to be pointed at *any* worktree, including ones where the fence
has not lifted.

## Files

| file | what it is |
|---|---|
| `baseline.png` / `seams.png` | the boot frame, no input, `&seams=0` vs absent (on) — the clean pair the draw-call/instance delta below is measured from |
| `gameplay-baseline.png` / `gameplay-seams.png` | same URLs, both held right 4s from boot — more of the deck lip and a catwalk in frame, for the luminance read |
| `results.json` | the measured numbers below, machine-readable |
| `capture.mjs` | the rig (see "Reproducing") |

## What the pixels say

Draw-call/instance delta, from the clean (no-input) pair — two new
`InstancedMesh`es, exactly matching the packet's own "+1 to +2" estimate,
**measured against the T-035-merged (half-dose ladder) world**:

| | calls | triangles | InstancedMesh | instances |
|---|---|---|---|---|
| `&seams=0` | 94 | 50,196 | 13 | 2,969 |
| default (on) | 96 | 56,336 | 15 | 3,583 |
| delta | **+2** | +6,140 (307 pips × 12-tri box + 307 halos × 8-tri octahedron) | **+2** | +614 (307 pip cores + 307 halos) |

Identical to the pre-recalibration numbers — expected, since the value
ladder changes instance *colors* on existing deck/limb geometry, not draw
calls or instance counts, and this pass adds its own separate meshes.

Luminance (share of playfield pixels with perceptual luma `0.299R + 0.587G +
0.114B` over 200), from the gameplay pair (held right 4s, more route lip and
one catwalk visible), **measured against the T-035-merged world**:

| | pixels > L200 | share |
|---|---|---|
| `&seams=0` | 989 / 1,024,000 | 0.097% |
| default (on) | 3,210 / 1,024,000 | 0.313% |

Roughly a **3.2x** increase — statistically the same delta as every earlier
measurement of this pass (0.097%→0.33% ± a few hundredths of a point run to
run; this is the final number, post the halo-fog and depth-gain fixes
below, both of which dim a modest fraction of pips and pull it down
slightly from 0.33%). See below for why the ladder itself barely moves it.

**Honesty note on the baseline draw-call number.** The packet's own audit
cites 101 calls / 50,276 tris for the shipped default. This rig's own
re-measurement of that same unmodified boot frame reads 94 / 50,196 —
InstancedMesh/instance counts match exactly; calls/tris are a handful off,
most likely a slightly different HUD/wave-gate instant at capture, not a
regression. The delta above is from a **paired** measurement (both sides
shot by the same rig, same instant after load), never inherited from the
packet's previously-recorded number.

**Honesty note on the luminance pair.** The packet's own paired-population
caveat (S1's correction): the two runs are two separate page loads sharing
a seed and an identical hold-right-4s script, not a frame-locked replay, so
a hostile or the capsule glyph can differ in position by a frame or two
between them. Judge the pip rows and the overall brightness share, not a
pixel-for-pixel diff.

## Why the ladder barely moved the number

A plumbing sanity check first, to rule out "the ladder isn't actually
active in this merge": mean frame luma (whole-frame average, same
gameplay-pair script, `&seams=0` fixed) —

| URL | mean luma |
|---|---|
| `&shade=0` (pre-T-035 grey-box value range) | 68.29 |
| absent (shipped half dose) | 58.28 |
| `&shade=1` (full dose, operator-rejected) | 46.82 |

Monotonic and clearly separated — the ladder is genuinely live in this
merge, darkening the whole frame by about 10 luma points at the shipped
dose. **The luminance->200 share barely moves anyway** because the ladder
and the pips occupy non-overlapping parts of the histogram: T-035's own
docs (`src/config.js`'s `shade` block) target a **52-81 display-level**
material ramp — the ladder crushes shadows and separates mid-tones, all
well under 200. It was never going to touch the population of pixels
*above* 200, which before this pass was ~0 and is now whatever this pass's
own unlit warm-white tokens contribute. The two passes are compatible by
construction, not by coincidence: S1 (value ladder) buys value *separation*
in the low-to-mid range; S5 (this pass) buys the frame's only actual
*highlights*. A secondary, expected effect this data is also consistent
with: since the ladder darkens the surrounding surface (mean luma 68→58)
while the pip tokens stay fixed at their own authored brightness, the
pips' **contrast against their surround** should widen under the shipped
dose relative to the pre-ladder world — stated as an implication of the
measurement above, not separately measured pixel-by-pixel here.

## What the frames show

Both gameplay frames put RIG on the intro deck with a catwalk and a second
deck tier in view. With the pass on (default), a row of small warm-white
diamonds (the additive halo dominates the box core's silhouette at this
camera angle) runs along: the top lip of the near deck, the top lip of the
raised deck behind it, and the catwalk slat further back — each row
stopping exactly where its own surface stops, per the pure-layer falsifying
test in `tools/pathcheck.mjs`. Nothing here is a judgment that this reads
well at FAR, blends with the existing tell/muzzle vocabulary, or is worth
shipping as the default — that is the operator's call; see the build
report's open questions.

## The halo fog fix (review finding, fixed)

The first version of this pass copied `src/render/fx.js`'s additive-pool
idiom verbatim, including `fog: false`. A reviewer caught that this
reintroduces the exact risk the packet's own S5 section names: "additive
quads with `fog:false` never recede, so distant pips must be pre-attenuated
by depth at bake time." fx.js's pools are short-lived and player-proximate,
so fog never mattered for them; this pass is the first STATIC, whole-level
bake — 307 pips scattered across all 445 tiles, all of which the camera
scrolls past at some point in a run, so "distance from camera" is not fixed
at bake time the way a depth-only analysis (this report's own first
version) assumed. Fixed: both materials now set `fog: true`, so a pip
recedes into the haze exactly in lockstep with the deck/limb surface it
rides, automatically staying correct if the fog band is retuned later
(S2). Asserted in `tools/pathcheck.mjs` (proven to bind by break/restore).

**Second, complementary mechanism added on top: `depthGain` (bake-time).**
The team lead pushed back that `fog:true` alone does not literally
"pre-attenuate by depth at bake time" — fog is a render-time mechanism, not
a bake-time one. That is correct, and the two are not redundant: fog
handles the case this module's actual geometry has plenty of (distance
from the *current* camera position, which changes continuously as the run
scrolls past all 445 tiles and genuinely cannot be known at bake time),
while `src/pure/seams.js`'s new `depthGain(depth, cfg)` handles the literal,
bake-time-knowable quantity the packet's risk note names: how proud a pip
sits of the surface it rides. The catwalk tier (shallower) now bakes at a
fixed 0.72x multiplier relative to the deck tier (proudest, 1.0x) on the
halo's own instance color — small, because this module's two depth tiers
are genuinely close together (both near the play plane; the ?g1=1 limb
backdrop this pass does not cover is where a large depth spread would
actually live), but real, deterministic, and pathcheck-assertable in a way
runtime fog cannot be.

## Reproducing

`capture.mjs` in this directory is the rig. It takes the worktree to
photograph as an argument, copies it to a throwaway temp directory (never
writing back to the real worktree — this is still useful for pointing at a
worktree where `src/render/seams.js` is not yet wired into `src/main.js`),
serves that copy on an ephemeral port (never 8741/8742), and writes only
into this directory:

```
node artifacts/t038-seams/capture.mjs --root <worktree>
```

**To reproduce the recalibrated numbers above** (T-038 + T-035, since T-035
has not merged to `main` as of this writing): make a scratch clone of a
T-038 worktree, add the T-035 worktree as a remote, merge it. One conflict:
`tools/pathcheck.mjs`. Since T-037 (pathcheck's per-domain split, merged to
`main` mid-cycle) this file is a thin runner, not a monolith — T-035's
branch predates that split and still appends a raw block to the old
monolith shape, so resolving the conflict means converting T-035's
appended block into its own `tools/pathcheck/*.mjs` domain module (static
imports instead of the block's dynamic `await import()`, wrapped in
`export async function run(SHARED) {}`, registered in `manifest.mjs`) the
same way this task's own `t-038-seam-pips.mjs` was written directly against
the new convention. This conversion is scratch-only scaffolding for taking
a measurement, not committed anywhere — do this in a throwaway clone, never
in either real worktree.

It needs `tools/playtest/node_modules` (the harness's own `npm install`, run
once in that directory) and a local Chrome.
