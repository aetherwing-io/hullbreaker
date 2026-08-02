# T-053 — procedural raster generation path

Branch `task/T-053`, worktree `.claude/worktrees/T-053`. Dev-only: no file under
`src/`, `index.html`, `SPRINT.md`, `CLAUDE.md`, root `README.md` or
`tools/pathcheck/` is touched.

## What was built

A **second generation route** beside the existing SVG one. `gen.mjs --mode
raster` asks codex for a self-contained ES module that *paints* the asset into a
canvas (a "recipe"); `render.mjs` runs it in the playtest harness's Chrome and
writes the PNG. The SVG route is untouched and still the right one for glyphs
and UI marks, where a crisp silhouette at 16px is the whole value.

| File | What it is |
| --- | --- |
| `tools/assets/render.mjs` + `renderer.html` | recipe → PNG. Renders **twice** and refuses to write unless the bytes are identical. |
| `tools/assets/lib/procgen.mjs` | the toolkit a recipe is handed: seeded rng and named streams, **periodic** value noise / fbm / ridge, per-pixel `field()` with `over` blending, palette-derived color math. |
| `tools/assets/lib/recipe.mjs` | the recipe contract, enforced statically — no imports, no `Math.random`, no clock, no network, no DOM, no external images, a literal `meta.seed`, and no off-palette hex literal. |
| `tools/assets/codex/raster-spec-template.md` | the raster ask: palette as hex, on-screen size, the tiling clause, the toolkit reference, and an explicit "layers, not shapes" build order. |
| `tools/assets/compare.mjs` | before/after at true on-screen size with the concept board in the same frame. |
| `tools/assets/fixtures/recipes/` | one worked recipe, and one that must FAIL to render. |

Nine assets regenerated through it — the four hull textures and the five
backdrop plates — at **identical paths and identical dimensions**, so nothing
T-051/T-052 consume moved.

## Gate results

```
node tools/pathcheck.mjs        2469 passed, 0 failed
node tools/assets/check.mjs     PASS (38 assets)
node tools/assets/check.mjs --selftest
  23 palette + 25 import-scan + 7 raster-mass + 16 recipe-contract cases
```

Zero effect on the shipped game, **demonstrated**: `git diff main...HEAD` touches
no runtime file, and the game served from this worktree completes a smoke
playtest —

```
node tools/serve.mjs 8753 --root <worktree> --quiet
cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8753
[playtest] outcome: completed (fidelity: testapi)   deaths: 0
```

(`reports/tasks/T-053/evidence/playtest-mid-route-summary.md`. Port 8753; 8741
and 8742 were never touched. The server was stopped after the run.)

## Second pass — restoring cutout alpha (the regression this lane was sent back for)

**What was wrong.** The first painted pass above regenerated all five backdrop
plates through the recipe route but painted the fog straight into each canvas
as opaque pixels. Every gate that existed at the time stayed green — palette
clean, sizes and paths stable, ids unchanged — because nothing in the pipeline
looked at the alpha channel. The plates the recipes replaced were 40-60%
transparent cutouts; the repainted ones came back **100% opaque rectangles**.
An opaque plate occludes every tier composited behind it, which breaks
T-051/T-052's three-tier parallax layering outright. `reports/tasks/T-053/
evidence/alpha/gate-catches-the-regression.txt` is the gate re-run against
that broken state: 10 named failures, one pair per plate (0% transparent, 0%
partial).

**The fix, in two parts:**

1. `env.mask(fn)` (`tools/assets/lib/procgen.mjs`) — a recipe now paints its
   subject as before and then states its silhouette and dissolve in one place,
   multiplying alpha by `fn(x, y, u, v)`. All five recipes call it once, at the
   end of `render()`, to cut the silhouette and author a real graduated falloff
   (8-12 texels) at the receding/distant edges rather than a one-pixel hard cut.
2. An explicit, gated **alpha contract**. `assets/manifest.json` entries now
   declare `alpha: "cutout" | "opaque" | "overlay"`
   (`tools/assets/lib/manifest.mjs`, `ALPHA_KINDS`/`ALPHA_RULES`), and
   `check.mjs` recomputes the real census (`alphaCensus` in `lib/png.mjs`) and
   fails on disagreement. The declaration is **not** written by `--write` —
   deriving it from the same pixels it's meant to constrain would rubber-stamp
   anything, which is exactly how five plates went opaque with every gate
   green. `tools/assets/alpha.mjs` is a new viewer (over game-teal / hot-magenta
   / checkerboard / the raw alpha channel) for judging a plate's transparency
   by eye, the same shape as this directory's other viewers.

**Measured, before -> after** (percent of all pixels; `node tools/assets/alpha.mjs
<path>` reproduces each):

| plate | alpha=0 (transparent) | alpha=255 (opaque) | partial (the feather) |
| --- | --- | --- | --- |
| colony-cluster | 100% (broken) -> 41.3% | 0% (broken) -> 35.2% | 0% (broken) -> 23.51% |
| crown-horizon | 100% (broken) -> 72.2% | 0% (broken) -> 0.0% | 0% (broken) -> 27.82% |
| gill-cavity | 100% (broken) -> 6.8% | 0% (broken) -> 58.1% | 0% (broken) -> 35.12% |
| limb-segment | 100% (broken) -> 59.4% | 0% (broken) -> 26.9% | 0% (broken) -> 13.75% |
| spine-coil | 100% (broken) -> 49.5% | 0% (broken) -> 30.2% | 0% (broken) -> 20.28% |

For reference, `main`'s pre-T-053 plates sit at ~0.48% partial — a hard cut, not
a dissolve. Every plate here clears the new gate's `minPartial: 2%` floor by a
wide margin, so this is a genuine authored falloff, not a token one.

**`backdrop-crown-horizon` reads 0.0% opaque, and that is authored, not a bug.**
It is the most distant thing in the game (a horizon silhouette seen through
haze); the recipe's mask ends in `env.clamp(multiplier * 0.94, 0, 0.94)` — a
flat 0.94 ceiling applied to every surviving pixel, on top of (not instead of)
the real contour-localized feather at its edges. So the silhouette itself is
still crisp (confirmed by eye: `node tools/assets/alpha.mjs
assets/generated/backdrops/backdrop-crown-horizon.png`, the alpha-channel panel
shows a sharp spire shape, not a smear), it just never quite reaches literal
255. The manifest's updated note says the same thing in-repo: "no pixel fully
opaque anywhere (it is the most distant thing in the game)."

**A real second regression turned up chasing this, and got its own fix.**
`check.mjs` failed after the mask work landed, for two different reasons that
both trace back to the alpha cutout — neither is a defect in the cutout itself:

- **Manifest role staleness on four plates.** `backdrop-limb-segment`,
  `backdrop-spine-coil` and `backdrop-gill-cavity`'s manifest entries still
  claimed a `deep-teal` role that the recomputed palette no longer finds:
  masking away most of a large, previously near-solid teal background field
  pushed its remaining share below the 0.5% `roleReportMass` floor. Confirmed,
  not assumed — `backdrop-colony-cluster` prints `deep-teal 2%` in the current
  sweep, i.e. still present, just thinner. `backdrop-crown-horizon` gained an
  `ink` role for the same reason in reverse: cutting away most of its fog field
  left its ink content as a larger share of a smaller denominator, crossing
  *above* the floor. Fixed with `node tools/assets/check.mjs --write`, which
  only touches the recorded `palette` block (verified: the only other diff in
  `assets/manifest.json` is the `alpha`/`notes` fields already staged by the
  prior pass).
- **A real alien-hue cap failure on `backdrop-colony-cluster`, not a manifest
  staleness issue.** `alienMass` hit 0.137% against the 0.1% cap. Root-caused
  by instrumenting `checkRasterColors`' anchor selection (reverted before
  committing — `tools/assets/lib/palette.mjs` carries no debug code): cutting
  the teal background left its surviving pixels spread over 92 quantized
  buckets above `anchorMinMass`, 11 of them genuine deep-teal shades ranked
  53-91 by mass — all outside the old `maxAnchors: 48`, which was filled
  entirely by the much larger rust/hull/ink noise population that dominates
  the rest of the plate. Without a teal anchor, the small amount of teal-edge
  antialiasing this asset always had lost its blend explanation and read as a
  new hue, though no hue in the image actually changed. Fixed by raising
  `maxAnchors` to 64 (measured: `alienMass` -> 0.0000% at 64, no further change
  at 80/96 — only 92 buckets exist above the floor for this asset), documented
  with its evidence in `tools/assets/README.md` § "Palette compliance
  (raster)" per that section's own rule that a limit change belongs there.
  This was foreseen, not coincidental: the pre-existing "PROPOSED INBOX ISSUES"
  entry below about the alien cap's headroom on dithered content predicted
  exactly this failure mode, on the wrong plate.

**Gates after both fixes:**

```
node tools/assets/check.mjs        PASS (38 assets)
node tools/assets/check.mjs --selftest
  23 palette + 25 import-scan + 7 raster-mass + 8 alpha-contract + 16 recipe-contract cases
node tools/pathcheck.mjs           2469 passed, 0 failed
```

**Provenance note.** `reports/tasks/T-053/evidence/qa/` (four captures, flagged
in an earlier commit on this branch) and this pass's own
`reports/tasks/T-053/evidence/alpha/` and `tools/assets/alpha.mjs` are separate
things: the `qa/` captures are foreign, already noted and left in place; the
`alpha/` evidence and `alpha.mjs` viewer are this lane's own work, built to
make the regression above visible and to prove the fix.

## The gate change, said loudly

**The raster palette check no longer gates on per-color coverage. It judges
mass.** This is the "fix the check to express the property it actually cares
about, and say so loudly" case from the task block, and here is the measurement
that forced it — the old rule exempted any color under 0.5% coverage, which on a
painted asset is nearly every color:

| Asset | route | unique colors | colors judged | pixel mass judged |
| --- | --- | --- | --- | --- |
| `hull-panel-tile` | flat SVG | 24 | 5 | 99.1% |
| `hull-panel-tile` | painted | 458 | 27 | 83.1% |
| `backdrop-gill-cavity` | flat SVG | 77 | 6 | 94.4% |
| `backdrop-gill-cavity` | painted | 19,908 | 4 | **2.8%** |

A gate looking at 2.8% of an image is not a gate. What replaced it asks, of
every non-transparent pixel: is this hue in a role band (legal); is it off band
but on the sRGB segment between two colors this image uses, or inside the
triangle of three of them (a blend — legal, and the literal statement of
"interpolating between two tokens is legal"); or is it neither (**alien**, and
the asset comes back). Two caps, printed on every run whether they bind or not:
alien mass 0.1%, total off-band mass 5%.

**Nothing was loosened to let this work through.** The two things that did move
are both narrower than they sound, and both are measured:

1. **Weight is alpha, and pixels below alpha 32 do not vote on hue.** A canvas
   stores premultiplied color, so a pixel written at alpha 10 comes back
   quantized to steps of 25.5 levels per channel and its hue is rounding noise.
   Measured: 70 pixels of the first painted `wear-scuff-overlay` at alpha 9–10,
   every color in that recipe derived from `env.PALETTE`, read back as
   blue-violets at hue 295–296 and failed the gate. Excluded pixels are not
   hidden — their off-band and alien mass prints on a `faint:` line.
2. **Anchor clustering went from 8 to 16 levels per channel.** At 8 levels the
   bucket mean can be 16 levels from the colors it represents, further than the
   blend tolerance itself, so real blends read as alien. Measured on
   `backdrop-crown-horizon`: 0.0782% → 0.0546%.

Calibration against all 38 committed assets, with the caps unchanged:

| Route | assets | worst off-band | worst alien |
| --- | --- | --- | --- |
| vector → raster | 29 | 0.238% | 0.0000% |
| painted recipe | 9 | 1.298% (`wear-scuff-overlay`) | 0.0546% (`backdrop-crown-horizon`) |
| cap | | 5% | 0.1% |

**The alien cap has under 2x headroom on `backdrop-crown-horizon`**, whose fog is
dithered per pixel. A future painted backdrop could fail it on dither rather than
on a wrong color. The remedy is in the README: read the reported hue clusters
first — a real violation is one cluster carrying the mass at a hue nothing else
uses; dither is hundreds of colors at 0.001% each.

## Proving the new gates bind (broken on purpose, then restored)

| What I broke | What printed | Restored |
| --- | --- | --- |
| appended `const violet = '#4b2bd0';` to `hull-panel-tile.recipe.js` | `hull-panel-tile.recipe.js:299: color literal #4b2bd0 is off-palette — hue 306.1 falls in no role band …` → FAIL | yes |
| appended `const r = Math.random();` to the same file | `…:299: "Math.random" is not allowed in a recipe — non-deterministic — use env.rng() …` → FAIL, and `render.mjs` refused before launching a browser | yes |
| `fixtures/recipes/nondeterministic.recipe.js` (committed, permanent) | `render failed: the same recipe rendered two different images in one run` — exit 1, **no PNG written** | n/a |

The third is the interesting one: it uses `crypto.getRandomValues`, which is not
on the banned-names list and could not be on a list that did not already know
about it. It passes the static scan and is caught one layer down by the double
render. That layering is the design, and it is now a committed negative control:
if that fixture ever renders successfully, every "reproducible: yes" line in the
pipeline is worthless.

The 7 raster-mass and 16 recipe-contract selftest cases run on **every**
`check.mjs` invocation, not only under `--selftest`, and each must-fail case
asserts *which* cap caught it.

## Determinism and auditability

Every asset is `recipe + seed → PNG`, and both halves are in the tree:

- the recipe is committed next to the PNG (`<id>.recipe.js`), and is the
  manifest's `source`;
- the seed is in `meta.seed`, recorded in the manifest's new `seed` field, and
  `check.mjs` refuses a manifest seed that disagrees with the recipe;
- `render.mjs` re-renders twice on every run and compares bytes;
- the resolved spec sent to codex is written to `tools/assets/runs/spec-<id>.md`
  (gitignored, per this directory's existing convention); the nine that produced
  the committed assets are copied into
  `reports/tasks/T-053/evidence/specs/` as the prompts of record, and the exact
  invocation is printed by `gen.mjs` and recorded in the manifest's `generator`.

Honest limit, in the README: **generation is not reproducible, the asset is.**
Re-running the same `gen.mjs` command produces a different program; re-running
`render.mjs` on a committed recipe produces the same pixels (against the same
Chrome build — same trade the SVG rasterizer already carries).

## Cost

| | |
| --- | --- |
| codex calls | 11 (9 assets + 2 retries: `hull-panel-tile`, `wear-scuff-overlay`) |
| tokens | 259,917 total across the 8 calls whose output was captured (22,434 – 42,303 each). The other three ran with inherited stdio and their usage lines were not captured — not estimated here. |
| wall clock | ~10–35 min per call, 8 run concurrently |
| recipe size | 297–1,222 lines, 6,310 total |
| PNG size | 11.8 kB (`hull-panel-tile`) to 832 kB (`backdrop-limb-segment`). **The backdrops got 3–20x heavier**: `backdrop-limb-segment` 38 kB → 832 kB, `backdrop-gill-cavity` 24 kB → 366 kB. Gradients and per-pixel dither do not deflate the way flat fills do. Total `assets/generated/` is now 2.7 MB. |

## What I changed that another lane should know about

- **Paths and dimensions are unchanged.** Every regenerated asset kept its id,
  path and canvas size.
- **The superseded `.svg` sources were deleted** (9 files) and each entry's
  `source` now points at its recipe. Nothing in `src/` referenced them; they
  remain in git at `cd37b91`. A stale SVG next to a PNG it no longer produced is
  a trap, which is why they went rather than being left.
- **Manifest role lists changed on 5 entries, all of them regenerated ones** —
  `backdrop-limb-segment` (+`hull`, +`rust-orange`), `backdrop-crown-horizon`
  (−`haze`), `weld-seam-strip` (+`haze`, +`warm-white`), `vent-louver-plate`
  (+`haze`), `wear-scuff-overlay` (−`hull`). **No untouched asset's recorded
  roles moved**, which is the check that matters for the new mass rule: it
  aggregates per role over all pixels instead of per color above a threshold, and
  on the 29 flat assets that arithmetic lands in the same place. `check.mjs
  --write` did it; no hand edits.
- **`tools/assets/README.md`'s "the game ships zero binary assets today and still
  boots with every file under `assets/` deleted" is corrected** — it stopped
  being true with `docs/decisions.md` entry 16. The static-import rejection stays
  and its *reason* narrowed: a static import binds the file into the module graph
  and turns a missing PNG into a blank page. The error message in `check.mjs`
  now says that instead of citing the retired rule.

## Judged at true on-screen size

Every capture is `reports/tasks/T-053/evidence/compare-<id>.png`: before (SVG
route) and after (recipe route) side by side at the size the shipped FAR camera
gives them, plus a 3x panel, plus the concept board the asset answers to. The
textures are shown **repeated** 4x4 or 4x3, because a seam and a countable motif
are the only two ways a tiling texture fails and neither is visible in one copy.
The wear overlay is composited over a rust deck rather than the fog, or it would
be a picture of nothing.

| Asset | on screen at FAR | capture |
| --- | --- | --- |
| `hull-panel-tile` | 34.8 x 34.8 px per copy, 4x4 | `compare-hull-panel-tile.png` |
| `weld-seam-strip` | 69.6 x 17.4 px per copy, 4x3 | `compare-weld-seam-strip.png` |
| `vent-louver-plate` | 26.1 x 26.1 px, single | `compare-vent-louver-plate.png` |
| `wear-scuff-overlay` | 34.8 x 34.8 px per copy, 4x4, over deck | `compare-wear-scuff-overlay.png` |
| `backdrop-limb-segment` | 1044 x 522 px | `compare-backdrop-limb-segment.png` |
| `backdrop-spine-coil` | 522 x 522 px | `compare-backdrop-spine-coil.png` |
| `backdrop-crown-horizon` | 1044 x 261 px | `compare-backdrop-crown-horizon.png` |
| `backdrop-colony-cluster` | 243 x 122 px | `compare-backdrop-colony-cluster.png` |
| `backdrop-gill-cavity` | 418 x 418 px | `compare-backdrop-gill-cavity.png` |

**Not mine:** four captures under `reports/tasks/T-053/evidence/qa/`
(`tile-*.png`, `view-*.png`, some with `-shared`/`-pinned` suffixes) appeared in
this worktree at 06:36–06:37 while I was finishing, and my `git add -A` swept
them into commit `8e50726`. I did not produce them and I have not judged them —
another agent was running the asset tools against this tree. They are left in
place rather than deleted, since deleting another lane's in-flight artifact is
worse than an unexplained file; their provenance is this paragraph.

**Two of the nine needed a second generation, and both times the capture is what
caught it** — not the gate:

- `hull-panel-tile` v1: wavy organic seams reading as cracks, a rope-like
  highlight on the horizontal joint, and enough bolt heads that a wall of it
  turned into noise at 35px per copy. The palette gate was green throughout.
- `wear-scuff-overlay` v1: one distinctive chip cluster in a fixed position, so
  a 4x4 repeat read as wallpaper. (It also failed the palette gate, on the
  low-alpha premultiply artifact described above.)

I am not the judge of whether the results look right — that is the operator's,
and nothing in this report claims the new assets are better-looking. What I can
report is that they are painted rather than filled: they carry grain, gradient,
occlusion at the panel gaps and atmospheric falloff, which the previous
generation did not, and that they still pass the palette and size gates at those
sizes.

## Questions for the operator (feel/look verdicts — not mine)

Open `reports/tasks/T-053/evidence/compare-hull-panel-tile.png` and
`compare-backdrop-limb-segment.png` first; the rest are the same shape.

1. Looking at the hull tile at TRUE size (the small patch, top left), is the
   plate now too quiet? The retry deliberately removed most of the fittings to
   stop a wall of it reading as noise, and it may have gone past what you wanted
   — where between v1's density and this should it sit?
2. The backdrops keep their teal-dominant reading, with rust only on the nearest
   collar of the limb. Board 13 paints the *foreground* limbs rust and the
   distance teal. Is that the right split for a parallax plate, or should the
   nearest backdrop tier carry more rust?
3. `backdrop-gill-cavity`'s lip is the most saturated rust in the set. At 418px
   on screen it is a mid-distance element competing with foreground geometry —
   does it need to sit further back tonally?
4. The backdrops are 3–20x heavier as files (832 kB for the limb plate). Is that
   a cost you want to pay for the gradients, or should these be authored at half
   resolution and upscaled by the render layer?
5. The palette gate now permits a *blend* between two roles anywhere in the gap
   between their bands (capped at 5% of the image). The wear overlay uses 1.3% of
   that budget on rust fading into ink. Is a fade through the gap acceptable
   art-direction, or should cross-role fades be required to route through the
   neutral axis (desaturate, then re-saturate) as the spec template currently
   only *suggests*?

## PROPOSED INBOX ISSUES

## I-??? | art | S3 | repro: `node tools/assets/compare.mjs --a reports/tasks/T-053/evidence/before/wear-scuff-overlay.png --b assets/generated/textures/wear-scuff-overlay.png --tiles 2 --repeat 4x4 --zoom 3 --bg deck` | evidence: reports/tasks/T-053/evidence/compare-wear-scuff-overlay.png
A tiling asset's repeat is still visible at 3x for every texture in the set —
unavoidable for a single 128px tile, and currently mitigated only by keeping the
motif quiet. If the render layer plans to cover large surfaces with one tile, the
fix direction is a second variant per texture plus per-quad variant selection, or
UV rotation/offset jitter in the material — a render-layer decision, not an asset
one, and worth settling before more tiles are authored against the wrong
assumption.

## I-??? | docs | S3 | repro: `node tools/assets/check.mjs` on any painted backdrop | evidence: tools/assets/README.md § "Palette compliance (raster)"
**Update, second pass: this predicted failure happened, on a different plate,
for a related but distinct reason, and is fixed.** Not the dither-headroom
case predicted below (crown-horizon's alien mass actually *dropped*, 0.0546% ->
0.0457%, after the alpha-cutout pass) — instead `backdrop-colony-cluster`
failed at 0.137% because cutting its background thinned the surviving teal
pixels across more quantized buckets than `maxAnchors: 48` could hold, so its
own antialiased edges lost their blend endpoint. Fixed by raising `maxAnchors`
to 64, evidence in the README section named above and in this file's "Second
pass" section. Leaving the original text below, since the dither-headroom risk
it names is still real and still unaddressed:

The alien-hue cap (0.1%) has under 2x headroom on `backdrop-crown-horizon`
(0.0546%), and the mass there is per-pixel dither of a fog gradient rather than a
wrong hue. The next dithered backdrop may fail the gate for a reason that is not
an art defect. Fix direction: either treat a spray of hundreds of colors each
under 0.005% as an explicit "dither" class distinct from `alien`, or raise the
cap with the evidence written into the calibration table — but only after an
asset actually fails, not preemptively.
