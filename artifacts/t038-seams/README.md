# t038-seams — warm-white seam pips and route-lip lights (S5, T-038)

Evidence for the S5 item in `docs/proposals/2026-08-look-direction.md` §3:
the only proposal in that packet's set claimed to put pixels above
luminance 200 on screen (measured at 0.0% in the packet's own 31-capture
audit). All frames here are 1280x800, the shipped **FAR** default view (no
`?view=` override — absent resolves to `far`), concept palette (no
`?palette=` override).

`?seams=1` is required to see the pass: it ships off by default (CLAUDE.md's
"prototypes ship behind query flags" — this has not had an operator
checkpoint). **`src/render/seams.js` is not wired into `src/main.js` in the
committed diff** — `src/main.js` was fenced to a concurrent task this cycle,
so the one line the integrator needs to add is named in the build report,
and this rig's own copy adds it to a THROWAWAY temp copy only (see
`capture.mjs`, never written back to the real worktree).

## Files

| file | what it is |
|---|---|
| `baseline.png` / `seams.png` | the boot frame, no input, `?seams=` absent vs `=1` — the clean pair the draw-call/instance delta below is measured from |
| `gameplay-baseline.png` / `gameplay-seams.png` | same URLs, both held right 4s from boot — more of the deck lip and a catwalk in frame, for the luminance read |
| `results.json` | the measured numbers below, machine-readable |
| `capture.mjs` | the rig (see "Reproducing") |

## What the pixels say

Draw-call/instance delta, from the clean (no-input) pair — two new
`InstancedMesh`es, exactly matching the packet's own "+1 to +2" estimate:

| | calls | triangles | InstancedMesh | instances |
|---|---|---|---|---|
| baseline | 94 | 50,196 | 13 | 2,969 |
| +seams | 96 | 56,336 | 15 | 3,583 |
| delta | **+2** | +6,140 (307 pips × 12-tri box + 307 halos × 8-tri octahedron) | **+2** | +614 (307 pip cores + 307 halos) |

**Honesty note on the baseline number.** The packet's own audit cites 101
calls / 50,276 tris / 13 InstancedMesh / 2,969 instances for the shipped
default. This rig's own re-measurement of that same unmodified boot frame
reads 94 / 50,196 / 13 / 2,969 — InstancedMesh count and instance count
match exactly; calls/tris are a handful off, most likely a slightly
different frame (HUD/overlay timing, or a wave-gate prop) at the instant
each was captured, not a regression — this is why the delta above is
reported from a **paired** measurement (both sides shot by the same rig,
same instant after load), not by diffing this rig's "after" against the
packet's previously-recorded "before".

Luminance (share of playfield pixels with perceptual luma `0.299R + 0.587G +
0.114B` over 200), from the gameplay pair (held right 4s, more route lip and
one catwalk visible):

| | pixels > L200 | share |
|---|---|---|
| baseline | 989 / 1,024,000 | 0.097% |
| +seams | 3,406 / 1,024,000 | 0.333% |

Roughly a **3.4x** increase in the frame's brightest-pixel share — still a
small fraction of the frame (this pass adds highlight *specks* along route
edges, not a wash), but a real, non-zero answer to the packet's "0.0% of
playfield pixels exceed L200" finding, and the pixels are genuinely new: no
existing geometry in the baseline frame carries an emissive or unlit
warm-white material at this brightness.

**Honesty note on the luminance pair.** This is the packet's own
paired-population caveat (S1's correction, restated for this item): the two
runs are two separate page loads sharing a seed and an identical
hold-right-4s script, not a frame-locked replay, so a hostile or the
capsule glyph can differ in position by a frame or two between them
(`tools/playtest/palette-capture.mjs`'s own honesty note applies
identically). Judge the pip rows and the overall brightness share, not a
pixel-for-pixel diff.

## What the frames show

Both gameplay frames put RIG on the intro deck with a catwalk and a second
deck tier in view. With `?seams=1`, a row of small warm-white diamonds
(the additive halo dominates the box core's silhouette at this camera
angle) runs along: the top lip of the near deck, the top lip of the raised
deck behind it, and the catwalk slat further back — each row stopping
exactly where its own surface stops, per the pure-layer falsifying test in
`tools/pathcheck.mjs`. Nothing here is a judgment that this reads well at
FAR, blends with the existing tell/muzzle vocabulary, or is worth shipping
as the default — that is the operator's call; see the build report's open
questions.

## Reproducing

`capture.mjs` in this directory is the rig. It belongs under
`tools/playtest/`; it is parked here because that directory (and
`src/main.js`) were lane-fenced to concurrent tasks when T-038 ran, matching
`artifacts/hitflash-v1/`'s precedent for the same situation. It takes the
worktree to photograph as an argument, copies it to a throwaway temp
directory (never writing back to the real worktree), serves that copy on an
ephemeral port (never 8741/8742), and writes only into this directory:

```
node artifacts/t038-seams/capture.mjs --root <worktree>
```

It needs `tools/playtest/node_modules` (the harness's own `npm install`, run
once in that directory) and a local Chrome.
