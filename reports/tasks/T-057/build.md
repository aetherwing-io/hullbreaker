# T-057 build report — I-049 lower-hull shimmer

**Status: T-057's acceptance box is NOT met.** Both named suspects were tested
rigorously and neither closes I-049. One harmless correctness fix (anisotropy)
shipped on its own merits; the canvas-resize suspect was tested four ways and
every version made shimmer measurably **worse**, so none of it shipped. This
report is written to support marking the SPRINT task `blocked` and escalating
— see "What I recommend" at the end.

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-057`,
branch `task/T-057`, based on main at 3195/0. `git status --short` clean
except the new files listed below; `git diff --stat`:

```
src/render/materials.js      | 30 ++++++++++++++++++++++++++++--
tools/pathcheck/manifest.mjs |  2 ++
```
New, untracked: `tools/pathcheck/t-057-hull-shimmer.mjs`,
`tools/playtest/hulltex-shimmer.mjs`, `reports/tasks/T-057/` (this file +
evidence). **`src/render/hulltiles.js` is byte-identical to main** — every
canvas-resize experiment below was tested and reverted, none of it shipped.

Pinned server for live judgment: `node tools/serve.mjs 8757 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-057 --quiet` is
running now at **http://127.0.0.1:8757/index.html** (port 8757, not 8741/8742).

## What shipped

`src/render/materials.js`: `renderer.capabilities.getMaxAnisotropy()` read
once at module scope and used at both places this file used to hardcode
`anisotropy: 8` (the `preloadTexture` opts and the composited `CanvasTexture`
in `buildTile`). This GPU reports 16 in this test environment; the fix asks
for whatever the device actually supports instead of a guess that can drift
out of date, and cannot regress a lesser GPU (still gets its own real max).
Zero cost, zero regression on every metric this task ran (below).

`tools/playtest/hulltex-shimmer.mjs`: a new, deterministic sibling to
`hulltex-capture.mjs` — see its own header for the full method. Short version:
drives `hold right` (no jump — avoids vertical-bob confound) at a
60fps-equivalent constant speed (`?fixeddt=16.67`), captures 8 consecutive
*rendered* frames of the frozen lower-hull band
(`x:160,y:635,w:300,h:90`, copied from `hulltex-capture.mjs`'s own
`BANDS.hull`) via an in-page `requestAnimationFrame` + `drawImage` blit (no
Node round-trip during the capture — see below for why that mattered), and
reports two numbers:

- **`reversal`** — the brief's own specified test: count pixels with any
  frame-to-frame `|delta| > 6`, then what fraction of those have two adjacent
  such deltas of **opposite sign**.
- **`residual`** — a second instrument I added because `reversal` alone
  cannot separate "aliasing" from "more real detail scrolling by" (see
  "Why I added a second metric" below): the RMS error between frame *t+1* and
  frame *t* shifted rigidly by the frame's own known scroll amount (best-fit
  sub-pixel shift, searched, not assumed). Real detail translating smoothly is
  well predicted by a rigid shift (low residual); content a rigid shift cannot
  explain (mip-level instability, GPU box-filter phase drift) is not
  (high residual), independent of how much real detail is present.

`tools/pathcheck/t-057-hull-shimmer.mjs` (appended last, `d55`): guards (1)
the anisotropy fix stays dynamic — no hardcoded literal reappears — and (2)
`hulltiles.js` still produces the exact 3×3-copy, multiple-of-4-cellPx,
non-power-of-two canvas T-054 shipped, so a future edit can't silently
reintroduce one of the regressions below without this failing. `node
tools/pathcheck.mjs`: **3201 passed, 0 failed** (3195 + 6 new).

## Determinism had to be built before any of these numbers meant anything

First pass polled `scrollX` from Node with `page.waitForTimeout()` between
checks. Running the SAME code twice gave **7842** and **9551–9659** "changing"
pixels — a bigger swing than any of the fixes below produced. The polling
round-trip competes with the game's own `requestAnimationFrame` callback for
the same thread, so which exact rendered frame the loop stopped on drifted
run to run — different runs landed on different sub-texel phases of the same
periodic panel-line pattern, and a fixed-rectangle metric over a periodic
pattern is not phase-invariant. Moving the whole "wait for scroll, then
capture 8 frames" sequence into ONE `page.evaluate` (no Node round-trip once
it starts) made every number below **bit-identical across repeats** at the
`near-open` moment (`--repeats`, proven in the log below) — I do not trust a
single-run number anywhere in this report unless it is at that moment.

`far-depth` (scroll ≥ 62) is NOT reachable with a bare hold-right — RIG runs
into an obstacle and dies well short of 62 — so that moment uses the SAME
reflex policy (`six-face-spaced-run.json`) `hulltex-capture.mjs`'s own `shots()`
drives with, and inherits that policy's own already-documented bot-timing
jitter (T-054's `playtest.md`: "two identically-scripted deterministic runs
can still fork via frame-boundary input-delivery timing"). Reported as a
range across repeats, never a single number.

## Measurements — near-open (lower-hull band, deterministic, bit-identical across repeats)

```
                          changing  reversing%  residualRMSE   (textured / flat)
baseline (main, no T-057 changes)
  textured                 7804       46.6         1.8951
  flat                     2454       34.3         1.6072

shipped (this branch: anisotropy fix only, hulltiles.js untouched)
  textured                 7823       46.5         1.8936
  flat                     2454       34.3         1.6072
```

**Shipped vs baseline: no meaningful change** (+0.24% changing, -0.1pt
reversing%, -0.08% residual — all inside what I'd call noise if this weren't
bit-deterministic; it's real but practically negligible). **T-057's
acceptance box asked for shimmer to fall toward flat's level (2454/34.3). It
did not move.**

Fine detail (T-054's own metric, `hulltex-capture.mjs measure`, unchanged
since `hulltiles.js` is untouched, re-measured anyway per the evidence
standard): near-open hull band, textured **1.754** vs flat **0.428**
(target was "stays at or above 1.648" — it does). Mean 42.78 vs 43.04
(-0.6%, inside the ~1.5% darkening fence). Full table and PNGs in
`reports/tasks/T-057/evidence/`.

Perf (`hulltex-stress.mjs`, entry 18): worstMs 9.3–9.4ms both variants,
`over20ms` 0/0/0 both, drawCalls 186 both, 256 live projectiles — unchanged,
as expected (no texture size changed). `reports/tasks/T-057/evidence/stress-run/`.

## Why I added a second metric, and what it changed about my conclusion

The brief's own `reversal` test cannot distinguish "aliasing" from "a
texture with genuinely more high-frequency content, translating perfectly
smoothly": a richer signal has more local luminance extrema per world-unit of
travel, so even flawless rendering of MORE real detail produces more sign
reversals than a flatter surface — that is the detail being visible, which is
what T-054 was for, not a defect. I built `residual` to cross-check: does
frame *t+1* look like frame *t* shifted by the known scroll amount? Both
metrics moved together on every experiment below, which is why I trust the
conclusion rather than one number in isolation.

## Everything I tried, in order, all reproducible (near-open, deterministic)

```
                                              changing  reversing%  residual
baseline (main)                                7804      46.6        1.895
POT-round cellPx + copies 3->4 ("suspect 1")   9645      52.9        2.249   WORSE
POT-CEIL cellPx + copies 3->4                  9657      52.4        2.239   WORSE (same, not better)
copies 3->4 alone (cellPx UNCHANGED at 72)    10050      47.8        1.987   WORSE
POT-round cellPx alone (copies UNCHANGED at 3) 7508      51.1        2.090   MIXED, net worse
wear overlay disabled (canvas unchanged)        7812      46.7        1.889   no change
copies 3->4 + wear disabled                    10029      48.0        1.977   same as copies-alone —
                                                                              rules out wear overlay
bumpMap disabled (albedo map still bound)       7791      46.7        1.865   no change
minFilter: LinearMipmapNearest (no trilinear
  blend between adjacent mip levels)            7832      46.4        1.897   no change
anisotropy 8 -> device max (16 here), alone     7823      46.5        1.894   no change (shipped anyway)
```

Every canvas-resize variant is **equal or worse**, never better, on both
metrics, regardless of direction (round vs ceiling), regardless of which
knob moved (cellPx alone, copies alone, both together), and independent of
the wear overlay (disabling it changes nothing, at either canvas size — ruled
out as a confound). Disabling the bump map and forcing single-mip-level
(non-trilinear) sampling also changed nothing. **I could not find any change
within my fences that reduces this metric without also reducing T-054's fine
detail** (the failure mode the task explicitly warned against and asked the
gate to be able to tell apart — the numbers above are exactly how I checked
that a "fix" wasn't just flattening the texture again: fine detail is
untouched because `hulltiles.js` is untouched).

**Honest, unresolved observation**: the copies-alone test (cellPx fixed at
72, only the repeat count changed from 3 to 4) moved the metric substantially
(7804 → 10050) even though `worldPerTileCopy()` proves the on-screen
world-space tiling density is copies-invariant by construction (the copies
term cancels algebraically: `rep = d/(T·copies)`, `rep·copies = d/T`). I do
not have an explanation for this that I trust — my best guess is that GPU mip
generation and/or the `repeat` value's own floating-point precision interacts
with the instanced geometry's UV assignment in a way the frame-centre
analytic model doesn't capture, but I did not chase this further because
`limb.js` (where that UV assignment lives) is fenced from me this cycle. This
is the strongest lead I found for someone with access to `limb.js`.

## The anisotropy result's own honesty note

Headless Chrome in this harness reports `getMaxAnisotropy() === 16` and
`isWebGL2 === true`, but `renderer.getContext().getParameter(VENDOR/RENDERER)`
returns generic `"WebKit"` strings rather than a real GPU/ANGLE string — this
is very likely software rasterization (SwiftShader or similar), not the
operator's actual GPU. Anisotropic filtering quality is a hardware rasterizer
feature; a software implementation reporting the capability does not prove it
renders with the same quality a discrete/integrated GPU's dedicated
texture-filtering hardware would. **The negligible effect measured here is
not strong evidence the fix is useless on the operator's real hardware** —
it is evidence it is safe (no regression) and correct (asks for what the
device says it can do), not evidence it solves I-049 there. This is a real
limitation of a headless test harness for this specific kind of question, not
something I can resolve without the operator's own screen.

## Moving captures (not judged — for the operator/reviewer, not self-graded)

Two ~9s clips recorded from THIS shipped tree (both `?fixeddt=16.67`, hold
right from load), scratch-only (not committed — binary, regenerate with the
commands below if needed past this session):
`/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t057/video-evidence/video-final/` (default)
and `.../video-final-flat/` (`?tex=flat` control). Regenerate:
```
cd tools/playtest
node run.mjs <script> --video --max-runtime-ms 12000 --out <dir>
```
(scripts used: ad hoc `{"url":"index.html?fixeddt=16.67","moves":[{"hold":"right","fromMs":200,"toMs":8800}]}`
and the same with `&tex=flat` appended — not committed, described here for
reproducibility). Both runs ended in death (a bare hold-right with no jump
walks into a hazard) — expected, the clips only need the first several
seconds of hull-band scroll, which they have. **I did not judge these** —
they exist so a reviewer can watch motion rather than trust a still, per this
lane's own evidence standard. Live URL for the operator to look at directly:
**http://127.0.0.1:8757/index.html** (hold right; the hull band is the lower
third of the screen once facet 0 opens).

## What I recommend

I think this SPRINT task should go to `blocked` with this report attached,
not stay `todo`/`doing` for another cycle guessing at more variants — I tried
eight, all within my fences, all negative or regressive. Three concrete next
steps, in the order I'd try them:

1. **Check the anisotropy fix on the operator's real hardware** before
   concluding it's inert — this harness's software rendering cannot validate
   it either way (see above). Cheapest next step, zero code required.
2. **The copies-alone anomaly** (7804→10050 with the world-space density
   provably unchanged) is the one result I can't explain and didn't expect —
   worth a `limb.js`-literate lane's time to look at the instanced UV
   assignment, since that file is fenced from me.
3. **Consider whether some of what I-049 measured is the cost of T-054's own
   density fix being visible**, not a distinct filtering defect — I could not
   separate "real detail scrolling" from "aliasing" cleanly with either
   metric I tried, and every intervention that touches the canvas moved both
   together. If a future lane also can't separate them, that's a pillar-level
   question (readable chaos vs surface fidelity) for the operator, not
   something a headless gate can resolve alone.

## Open questions for the operator

Not feel questions about a change (nothing here changes what he sees) — but
worth asking given the outcome:

1. At **http://127.0.0.1:8757/index.html**, holding right through facet 0's
   opening stretch: does the lower-hull flicker still look like what you
   flagged, or does it read differently than you remembered?
2. Is a laptop's real GPU available for a same-URL, same-eyes comparison
   against `?tex=flat`, to settle whether the anisotropy read (item 1 above)
   is worth more investigation on real hardware?
3. Given eight tested variants found no fix without giving up T-054's detail
   gain: is "some shimmer" an acceptable cost of readable hull detail for
   now, or does this stay a live priority for another lane (possibly one
   with `limb.js` in its fences)?

## Verification commands and results (this session, this tree)

```
node tools/pathcheck.mjs                          → 3201 passed, 0 failed
node tools/playtest/hulltex-shimmer.mjs measure --repeats 2
  → near-open textured 7823/46.5/1.8936 (both repeats identical)
  → near-open flat     2454/34.3/1.6072 (both repeats identical)
  → far-depth textured 10693-11652 / 52.5-55.8 / 3.26-3.79 (policy-driven, jitter expected)
  → far-depth flat     3785-4202 / 42.6-44.3 / 1.84-1.89
node tools/playtest/hulltex-capture.mjs shots      → near-open hull: textured fine 1.754 vs
                                                      flat 0.428; mean 42.78 vs 43.04 (-0.6%)
node tools/playtest/hulltex-stress.mjs             → worstMs 9.3-9.4ms both, over20ms 0/0/0,
                                                      drawCalls 186 both
git status --short                                 → clean except the new files listed above
```

Break/restore proof for both new pathcheck assertions (full transcript above
in this session; summary):
- Reverting the anisotropy fix (hardcoded `8` again) → 2 of the 6 new
  assertions FAIL (`3199 passed, 2 failed`); restoring → `3201 passed, 0
  failed`.
- Reintroducing the rejected canvas resize (POT cellPx + 4×4 copies) → 3 of
  the 6 FAIL (`3198 passed, 3 failed`); restoring → `3201 passed, 0 failed`.

## Evidence paths

Committed: `reports/tasks/T-057/evidence/{near-open,far-depth}-{textured,flat}.png`
(+ `-hullband-3x.png` crops), `shimmer-report.json`, `stress-run/result.json`.
Scratch (not committed, regenerate per the commands in this report):
`.../scratchpad/t057/` — every intermediate probe script and the two video
clips.
