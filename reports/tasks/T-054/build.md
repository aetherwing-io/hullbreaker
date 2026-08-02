# T-054 — the hull texture is invisible in play. Make it read.

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-054`, branch
`task/T-054`, base `6a0d34d` (main, 3148/0). Nothing merged.

**Not judged here:** whether any of this looks good. Numbers, captures, costs and
questions only — the operator is the oracle for look.

---

## 1. Reproducing the finding first

Built `tools/playtest/hulltex-capture.mjs` (new, dev-only): it drives the judged
`six-face-spaced-run` policy against the shipped sim and captures the SAME scroll
threshold twice, default and `?tex=flat`, then measures fixed rectangles. Four
numbers per band:

| metric | what it is |
| --- | --- |
| `mean` | average display luminance — the darkening control |
| `sd` | luminance sd over the band (global contrast; shading gradients dominate) |
| `fine` | mean \|L(x+1,y) − L(x,y)\| along rows — the integrator's metric |
| `struct` | sd of (L − a 21px moving average of L) along rows — amplitude at the 2–20px scale |

`struct` was added because `fine` alone cannot tell 0.3-level pixel mush from a
15-level panel seam: white noise scores well on `fine`. The in-frame anchor for
both is the **deck checker**, which the operator can see — measured in the same
frame, its cells are ~19 screen px with a 15-level step (row dump at y=480:
80 80 … 95 95 … 80), i.e. `fine` 0.79, `struct` 7.4.

**The integrator's numbers reproduce.** On the pre-fix build, over a first-guess
300×90 rectangle: textured mean 23.22 / sd 17.21 / fine 0.985 against `?tex=flat`
25.50 / 18.40 / 0.543 (his: 22.8 / 16.5 / 0.61 against 25.4 / 17.7 / 0.37 — same
shape, same conclusion, different rectangle).

The frozen band used from here on was then chosen by scanning every 300×90 rect
below y=500 for texture coverage >90% and taking the one with the LOWEST
flat-build `fine` — i.e. the cleanest hull surface, least polluted by ladders and
hatches. It is `x=160 y=635 w=300 h=90`, 93% covered by the albedo pass.

**Pre-fix, on that band, the finding is worse than "invisible":**

```
near-open   flat      mean 43.05  sd 6.57  fine 0.417  struct 3.815
near-open   textured  mean 39.90  sd 5.80  fine 0.694  struct 3.020
```

The texture added 0.28 levels of pixel-scale mush and REMOVED 21% of the
structure at the scale the eye reads, on a surface 7.3% darker than the control.

---

## 2. Root cause — two arithmetic defects, neither anyone's misjudgement

### 2a. FREQUENCY (the bigger one)

`materials.js` does not bind a tile PNG; it binds a canvas holding `copies ×
copies` of it (3×3 for hull/wall, 2×2 for scute) so the wear overlay's repeat can
be decorrelated from the base grid. T-052's repeat arithmetic was computed for
ONE copy. Measured consequence, straight out of the shipped functions:

```
worldPerTileCopy (before)  hull [0.67, 0.67]   →  ~12 CSS px on screen
worldPerTileCopy (after)   hull [2.00, 2.00]   →  ~35 CSS px on screen
```

`assets/manifest.json` states the intent for this exact file: *"Authored for a
~2x2 tile repeat (~35x35px on screen)."* A 128px panel design minified 11:1 has
no panel lines left after the mip chain. Fixed in `hullTexRepeat`, which now
divides by the copy count; `worldPerTileCopy()` exposes the claim so the gate can
assert it.

### 2b. RANGE

The normalization multiplied each tile's brightness until its mean reached
235/255, clipping at white. A tile whose mean sits at 92% of full scale has 8% of
its range left to carry every panel line. **Normalizing the MEAN and compressing
the RANGE are not the same operation** — the brief's own insight, and it is the
whole fix on this half:

- the tile is solved to a target mean AND spread well below white (190 ± 52 in
  display terms) by an affine curve fitted to its own histogram;
- the brightness that costs is paid back by `gain`, a SCALAR multiplied into
  `material.color`, so `mean(map) × gainExact == 1` in linear light and the
  surface's average albedo is exactly the flat build's.

Measured over the identical un-normalized composite (both normalizations run in
the gate, not quoted):

| bucket | clip-to-235 (T-052) | tone curve (T-054) | ratio |
| --- | --- | --- | --- |
| hull | 21.5% linear rel. spread, linear mean 0.853 | **30.0%**, linear mean 0.547 | 1.40x |
| wall | 21.4% | 29.3% | 1.37x |
| scute | 39.8% | 50.2% | 1.26x |
| shadow | 48.9% | 52.0% | 1.06x |

### 2c. Where the pixel work now lives, and why that matters more than either fix

Every pixel operation used to be a CSS `filter` string on a 2D context inside
`materials.js` — a file no headless gate can import (three.js + a live
WebGLRenderer at module scope) running a transform no headless gate can execute.
So the gate could only check that the strings were spelled correctly, and **both
defects above sat under a green gate for a full cycle.** The whole texel pipeline
(resample → tile → composite → histogram → tone curve → apply) is now plain
arithmetic on RGBA buffers in `src/render/hulltiles.js`, which is Node-safe.
`tools/pathcheck/t-054-hull-contrast.mjs` runs the SHIPPED transform over the
SHIPPED PNG and asserts on the output pixels.

One consequence worth stating plainly: the canvas is now sized to what the frozen
FAR view can resolve (`screenPxPerWorld` from `CONFIG.camera` + `viewScales.far`,
at 800 CSS px × devicePixelRatio 2), and the tone curve is solved AFTER that
downsample — so whatever the downsample averages away is measured and put back.
hull/wall canvases went 384 → 216px, scute 256 → 104px, shadow unchanged at 128.

---

## 3. The target, and the result

**Stated target, chosen before the fix and justified against the in-frame
anchor:** the hull band's `fine` ≥ **1.2** (3x its own 0.417 flat-build floor, and
above the deck checker's own 0.85–0.91 in the same frame) and `struct` ≥ **5.0**
(the texture's own contribution reaching the checker's relative amplitude, 8.6% of
local mean, added in quadrature to the flat build's baseline), with the lower-hull
mean inside ±10% of the `?tex=flat` control.

### Three bands, before → after, same position, same moment, dpr 1

`reports/tasks/T-054/evidence/before/` and `.../after/`, measured with
`node hulltex-capture.mjs measure --out <dir>`.

**near-open (scroll 18)**

| band | build | flat control | textured | Δmean |
| --- | --- | --- | --- | --- |
| hull | before | 43.05 / 6.57 / **0.417** / **3.815** | 39.90 / 5.80 / **0.694** / **3.020** | −7.3% |
| hull | after | 42.71 / 5.83 / **0.356** / **2.876** | 42.39 / 8.50 / **1.643** / **5.686** | **−0.7%** |
| deck | before | 86.63 / 7.79 / 0.847 / 4.525 | 86.38 / 8.15 / 0.907 / 4.940 | −0.3% |
| deck | after | 86.66 / 8.29 / 0.911 / 5.109 | 86.80 / 8.41 / 0.921 / 5.196 | +0.2% |
| sky | before | 68.47 / 8.78 / 0.124 / 1.737 | 68.23 / 8.95 / 0.144 / 1.715 | −0.4% |
| sky | after | 68.39 / 8.81 / 0.127 / 1.859 | 68.26 / 8.98 / 0.200 / 1.929 | −0.2% |

**far-depth (scroll 62)**

| band | build | flat control | textured | Δmean |
| --- | --- | --- | --- | --- |
| hull | before | 43.45 / 7.38 / **0.638** / **3.173** | 40.55 / 7.99 / **1.105** / **3.627** | −6.7% |
| hull | after | 43.43 / 7.47 / **0.645** / **3.186** | 43.04 / 9.84 / **1.781** / **5.583** | **−0.9%** |
| deck | after | 82.07 / 23.01 / 1.312 / 7.688 | 81.60 / 23.14 / 1.303 / 7.409 | −0.6% |
| sky | after | 48.65 / 12.14 / 1.200 / 4.713 | 48.03 / 11.90 / 1.594 / 4.980 | −1.3% |

(cells are `mean / sd / fine / struct`.)

**Targets met:** `fine` 1.643 and 1.781 against a 1.2 target and a 0.356 flat
floor (4.6x and 2.8x); `struct` 5.686 and 5.583 against a 5.0 target. The
darkening is **not** reintroduced: −0.7% and −0.9%, inside the noise floor below.

**Noise floor, stated because two of these deltas are small.** Across eight runs
of the same policy, the flat control's own band measured `fine` 0.348–0.431 and
`struct` 2.73–4.16 (bot timing jitter moves the frame by a pixel or two between
the pair's two page loads). Deltas under ~0.1 `fine` / ~1.3 `struct` are noise;
the textured deltas above are 4–13x that.

**The `sky` band is not a clean control at far-depth** (26–40% of its pixels move
between textured and flat) — `limb.js` maps the backdrop limb (`bdLimb`,
`bdDrum`, `bdRing`) onto the same hull/wall/scute buckets, so the distant anatomy
wears these tiles too. That is exactly what the operator was comparing the
foreground against. At near-open it is a real control (1.8–2.6%).

### Which half did the work — measured, not asserted

Each row is its own run with its own `?tex=flat` control; frames committed under
`evidence/ab-decomposition/`.

| build | flat `fine` / `struct` | textured `fine` / `struct` | Δmean |
| --- | --- | --- | --- |
| shipped before T-054 | 0.417 / 3.815 | 0.694 / 3.020 | −7.3% |
| density fix only | 0.430 / 4.044 | 0.913 / 4.392 | +2.6% |
| range fix only | 0.356 / 2.867 | 0.877 / 3.381 | +1.2% |
| both (this branch) | 0.356 / 2.876 | 1.643 / 5.686 | −0.7% |

Neither half alone clears the noise floor by much. Together they are
multiplicative, which is the point: restored contrast at a frequency the mip
chain destroys is worth nothing.

### The one measured number that is not derived: `gainTrim = 0.88`

`gain = 1/linMean` is exact in ALBEDO terms, and the frame is not linear — ACES
tone mapping has a toe, and a dark surface whose albedo now swings ±30% about the
same mean comes out of that toe brighter. Untrimmed, the band measured 46.93
against the control's 42.78 (**+9.7%**, most of the ±10% fence spent on an
artifact). At 0.88: 42.71 against 42.95 (−0.6%). Both runs are committed
(`evidence/ab-decomposition/exp-untrimmed-*`, `exp-trim88-*`). The constant is
bounded to (0, 1] in code and asserted: it may correct a brightening, never cause
one.

### Captures

- **True on-screen size first** (1280×800, dpr 1, the size T-052's evidence used):
  `evidence/before/{near-open,far-depth}-{textured,flat}.png`,
  `evidence/after/…` — same four frames after.
- **3x** (nearest-neighbour upscale of the true-size pixels — a magnification of
  what the player is given, NOT a re-render at higher resolution):
  `…-hullband-3x.png` beside each.
- **Retina pair** (`evidence/after-dpr2/`): `renderer.setPixelRatio(min(dpr, 2))`
  means the operator's own screen samples the frame twice as finely as every
  capture rig in this repo takes. Measurements stay on dpr 1 for comparability;
  this pair is what his display actually gets.

---

## 4. Constraints the brief made binding

- **Darkening not reintroduced:** −0.7% / −0.9% against the `?tex=flat` control
  (fence was ~10%). Three-band table above, before and after, same position.
- **Hue preservation survives, still by construction.** `applyToneCurve` writes
  R = G = B = lut[luminance] at every texel — the same guarantee
  `grayscale(100%)` gave — and `gain` is a scalar applied to all three channels of
  `material.color` in the working (linear) space. Two multiplies, neither able to
  shift hue, warm rust tile on the cool teal `wall`/`shadow` tokens included.
  Asserted over the real composited buffer (45,351 texels of the source are
  genuinely colored; 0 of the output are), not over the comment.
- **No raw hex in a tokenized render file:** none added; pathcheck's palette
  guard is green. (`new ImageData(...)` had to become
  `ctx.createImageData(...)` — T-048's asset guard matches the literal string
  `new Image`.)
- **Entry 16 degrade:** proved by causing it. `node hulltex-capture.mjs fallback`
  aborts every `assets/generated/textures/**` request at the network layer:
  state PLAYING, 2428 frames rendered, textured buckets `[]`, every file `false`,
  **0 materials brightened without a map** (max `color.r` on a map-less material:
  1), 0 page errors → PASS. That last check is the new failure mode T-054 could
  introduce, so it is the one worth proving.
- **Perf (entry 18):** `tools/playtest/hulltex-stress.mjs` (new, a copy of
  `backdrop-stress.mjs` with the two variants swapped), 3 readings each, 256 live
  projectiles, vsync-locked at 120Hz:

  ```
  flat      worstMs [10.30, 10.40, 10.30]  over20ms [0, 0, 0]  drawCalls [186, 186, 186]
  textured  worstMs [10.40, 10.40, 10.30]  over20ms [0, 0, 0]  drawCalls [186, 186, 186]
  ```

  fps 119.9–120.1, avgMs 8.33–8.34 in every reading; identical within noise.
  Expected: the pass changes what four textures contain, and makes two of them
  smaller. `evidence/stress/hulltex-stress.json`.
- **Layer purity / static anatomy / frozen camera:** `src/render/` only;
  `hulltiles.js` remains Node-safe (asserted); nothing moves that did not move
  before; the camera is read, never written.

---

## 5. Assertions, and proof that each binds

`tools/pathcheck/t-054-hull-contrast.mjs` (new, registered as d54) plus a
corrected block in `tools/pathcheck/t-052-hull-texture.mjs`.

**The T-052 assertions I replaced were true and useless.** They read
`repeat.x === chunkCols / tileWidth` — true of the formula, silent about what the
formula is for. They are now stated as the claim the asset's own manifest makes:
one authored copy spans its authored world size, and lands at the ~35 CSS px that
note states. Same class of correction as the pocket-reachability lesson in
`CLAUDE.md`: the subject was the author's arithmetic instead of the observable
result.

Seven break-it checks, each run with the property broken and then restored
(`git status --short` clean after each; the tree was committed first so the
restores are provable):

| # | what I broke | what printed |
| --- | --- | --- |
| 1 | `hullTexRepeat` ignores the copy count (the pre-T-054 formula) | 8 FAILs — "one authored copy of the hull bucket's tile spans its own authored world width (2), not 0.67", "…lands at the ~35 CSS px its own manifest note claims (got 11.7 px)" |
| 2 | tone curve target back to mean 235 | FAIL "…and more of it than the clip-to-235 normalization it replaces (26.5% vs 26.5%)" |
| 3 | `applyToneCurve` writes per channel instead of gray | FAIL "every texel of the composited wall tile is R == G == B (45351 colored)" + the gray/opaque probe |
| 4 | `gainTrim: 1.15` (a trim that brightens) | 5 FAILs — "the shipped hull gain is the exact one after a TRIM (2.101 <= 1.827), never above it" ×4 buckets + the bound itself |
| 5 | `resample` averages sRGB bytes instead of linear light | FAIL "resampling a black/white checker averages to 0.5 in LINEAR light (got 0.216)" + 7 knock-on range FAILs |
| 6 | tone curve inverted (`mid - (v-mean)*C`) | FAIL "the tone curve is monotonic (93 inversions)" |
| 7 | texel budget uncapped (upsamples past the source) | FAIL "…never exceeds the source file's own 128px" |

Break 1 is worth reading twice: broken, the gate prints **0.67 world units and
11.7 CSS px** — the shipped pre-T-054 values, recovered by the assertion itself.

`node tools/pathcheck.mjs` → **3195 passed, 0 failed** (base `6a0d34d`: 3148;
+47, of which 8 replaced T-052's superseded repeat assertions).

---

## 6. An asymmetry I found, measured, could not explain, and am not hiding

The pass delivers its detail along the HORIZONTAL scan and almost nothing along
the vertical one. Same band, shipped build:

```
horizontal scan (vertical joint lines)   flat 0.356 / 2.876   textured 1.643 / 5.686
vertical scan   (horizontal joints)      flat 0.750 / 3.845   textured 0.771 / 3.893
```

The composite itself is symmetric — its horizontal joints sit at rows 23/95/167 of
216 and its vertical joints at columns 40–42/112–114/184–186, both at a mean of 16
against a surround near 200. A position-controlled A/B (repeat axes swapped for
the `hull` bucket only, same rig, same scroll threshold, frames committed as
`evidence/ab-decomposition/exp-uvswap-*`) moves the strong lines from vertical
(7.00) to horizontal (8.31), so **the mapping is live in both axes** — the loss is
in sampling, not in the map. Two candidate causes tested and rejected:
anisotropy 8 → 1 changed neither axis (0.84 vs 0.85, 6.98 vs 7.00; frames
committed as `exp-aniso1-*`), and dpr 2 changed neither either (0.86, 7.60).
Traces of the vertical-axis joints ARE present at ~1.5 levels where the arithmetic
predicts them (row means dip at y≈674 and y≈708, spacing 36px = the authored 2
world units), i.e. attenuated roughly 25x rather than absent.

I stopped there rather than spend the lane on it: the gates are met without it,
and my first two in-page probes for a cause were **invalid** — the sim keeps
scrolling between screenshots, so successive shots were at different positions.
Any follow-up should use the capture rig's scroll-thresholded pairs, not a live
tweak. Filed below as a proposed issue.

Also worth one line: **the `bumpMap` measures inert at this view.** Rebuilding
with `bumpScale: 0` on every bucket moved the band by 0.02 `fine` / 0.03 `struct`
(`evidence/ab-decomposition/exp-nobump-*`, taken on the untrimmed build, whose
comparison point is `exp-untrimmed-*`). It is kept at half T-052's values (the
tone curve hands the bump map ~3x the luminance slope it used to see) rather than
removed, because a static two-frame measurement cannot see what relief does to a
slanted face under a moving key light.

---

## 7. Every verification command, and its result

```
node tools/pathcheck.mjs                                   3195 passed, 0 failed
node tools/assets/check.mjs                                PASS
node tools/playtest/hulltex-capture.mjs shots --out reports/tasks/T-054/evidence/after
                                                           4 frames + 4 crops, table in §3
node tools/playtest/hulltex-capture.mjs shots --moments near-open --dpr 2 --out …/after-dpr2
                                                           retina pair
node tools/playtest/hulltex-capture.mjs fallback           PASS (§4)
node tools/playtest/hulltex-stress.mjs                     no regression (§4)
cd tools/playtest && node run.mjs scripts/six-face-spaced-run.json --deterministic
                                                           completed the script window; 0 console
                                                           errors, 0 page errors, 0 teardown errors
                                                           (outcome not-completed: this policy's own
                                                           header records that every run of it dies at
                                                           wave gate 2 — unchanged by this branch)
cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic
                                                           outcome completed, 0 deaths
index.html?selftest=1                                      SELFTEST PASS (39 checks), 0 page errors
index.html?selftest=1&tex=flat                             SELFTEST PASS (39 checks), 0 page errors
```

Dev server for the smoke: `node tools/serve.mjs 8763 --root <worktree> --quiet`,
killed afterwards; port confirmed free. 8741/8742 were never bound, probed or
touched. The capture rigs bind an ephemeral port (0) of their own.

Honesty note on the machine: headless Chrome here reports
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)` — the same GPU path as a
headful window on this machine, checked explicitly because the anisotropy result
in §6 would mean nothing from a software rasterizer. It is still one development
machine, not a device claim.

---

## 8. Files

| file | what changed |
| --- | --- |
| `src/render/hulltiles.js` | the copy-count-aware repeat + `worldPerTileCopy`; the whole texel pipeline (`screenPxPerWorld`, `hullTexCanvas`, `resample`, `tileOver`, `buildToneCurve`, `applyToneCurve`, `composeHullTile`) |
| `src/render/materials.js` | CSS-filter compositing replaced by decode → `composeHullTile` → upload; `gain` on `material.color`; per-bucket tone in the snapshot; bumpScale halved |
| `tools/pathcheck/t-054-hull-contrast.mjs` | new domain (registered d54) |
| `tools/pathcheck/t-052-hull-texture.mjs` | repeat assertions restated as the world-span claim; bucket-table check follows the new shape and cross-checks `TEX_LAYOUT` |
| `tools/playtest/hulltex-capture.mjs` | new evidence rig (shots / measure / crops / bands / fallback) |
| `tools/playtest/hulltex-stress.mjs` | new perf rig, `backdrop-stress.mjs`'s shape |
| `reports/tasks/T-054/**` | this report + evidence |

`src/render/limb.js` was in the fence and **not touched** — nothing needed it.

---

## PROPOSED INBOX ISSUES

```
## I-??? | art | S3 | repro: node tools/playtest/hulltex-capture.mjs shots --moments near-open (task/T-054 @ HEAD) | evidence: reports/tasks/T-054/evidence/ab-decomposition/exp-uvswap-*.png
The hull tile's detail reads along the horizontal scan only: measured on the
shipped band, the textured build gains 4.6x on `fine` and 2.0x on `struct`
scanning rows, and nothing scanning columns (0.750 -> 0.771). The composite is
symmetric and a position-controlled UV-axis swap moves the strong lines to
horizontal, so the map is fine and the loss is in sampling; anisotropy (8 vs 1)
and devicePixelRatio (1 vs 2) were both tested and are not the cause. The
vertical-axis joints are present at ~1.5 levels where the arithmetic predicts
them, i.e. attenuated ~25x rather than missing. Direction: instrument with the
scroll-thresholded capture pairs (a live in-page tweak is invalid — the sim
scrolls between screenshots), and look at per-instance UV scale, which is also
what the co-tenant approximation below wants.

## I-??? | art | S3 | repro: node -e "hullTexRepeat(CONFIG)" against limb.js's MATERIAL_FOR table | evidence: src/render/hulltiles.js header
The repeat is computed per BUCKET but applied per INSTANCE, and a bucket's
co-tenants are different sizes: `bdLimb` rides in `hull`, `bdDrum` in `wall`,
`bdRing` in `scute`. Each of those shows the tile at its own piece's scale rather
than at the authored world size — the backdrop tiers wear a stretched or
compressed copy of the same panel. T-052 reported this as a known approximation
and T-054 did not change it; it is now more visible, because the tile is worth
seeing. Fix direction: a per-instance UV scale attribute.
```

## Open questions for the operator (feel/look — none of these are mine to answer)

URL: `http://127.0.0.1:8741/index.html` (default) versus
`http://127.0.0.1:8741/index.html?tex=flat` (the pass off, one URL apart, same
build). Frames if he would rather not play:
`reports/tasks/T-054/evidence/after/near-open-textured.png` and its `-flat` pair,
plus `after-dpr2/` for what his own screen samples.

1. Standing on the deck at the start of the run, does the under-deck hull now
   read as **panelled plate**, or as **vertical corduroy**? The panel joints
   land every ~35 screen px, which is the size the tile was authored for — if it
   reads as stripes, the tile's own design is the next thing to change, not the
   density.
2. Compare the foreground hull with the backdrop limb behind it. Is the
   foreground now carrying MORE surface detail than the far tiers, or has the
   ordering flipped too far the other way?
3. The panel joints are the darkest thing on that surface (they bottom out near
   black in the tile). At speed, do they read as grooves in armour, or as gaps
   you could fall through?
4. `?tex=flat` versus default at the SAME spot: is the textured build's surface
   brightness indistinguishable from the flat one? It measures within 1%, but
   measured-equal and looks-equal are different questions.
5. Anything shimmering or crawling on the receding facets as the camera scrolls?
   Static captures cannot show that, and it is the one risk the resolution-matched
   canvas could have introduced.
