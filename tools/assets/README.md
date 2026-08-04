# HULLBREAKER asset pipeline

A dev-only toolchain for producing graphical assets that belong in this game:
ask a generator for one, render it to a texture, prove it obeys the palette and
the texture rules, and look at it **at the size it will actually be on screen**
before believing it works.

**The toolchain** has no effect on the game itself: it lives under
`tools/assets/` (plus the staging directory `assets/`), never edits
`index.html` or `src/`, adds no runtime dependency, and `node
tools/pathcheck.mjs` is green with all of it present.

**The assets it produces are a different matter, and this changed on
2026-08-02.** `docs/decisions.md` entry 16 RETIRED the old "the game must boot
with every file under `assets/` missing" rule — it was self-imposed, and it
forbade the game from using the very pipeline built to feed it. Sprites,
textures and generated art may now load at runtime, and lanes are wiring them
in. What replaces the old rule: a missing or failed asset must degrade **visibly
and safely** (the T-032 failure panel exists for this), must never wedge the
game, and gameplay must never branch on whether an asset loaded. `check.mjs`
still rejects a **static ES import** of an `assets/` path anywhere in `src/`,
because that is the one shape that turns a missing file into a dead boot rather
than a degraded frame — see "Game independence" below, which is now a statement
about *how* assets load, not about whether they may.

## Quick start

```sh
node tools/assets/check.mjs                       # the gate: manifest + palette + sizes
node tools/assets/rasterize.mjs assets/generated/glyphs/capsule-letter-h.svg --size 128
node tools/assets/render.mjs assets/generated/textures/hull-panel-tile.recipe.js
node tools/assets/view.mjs assets/generated/glyphs/capsule-letter-h.png --tiles 0.55
node tools/assets/sheet.mjs --assets a.png,b.png --px 9.6,18.2 --out sheet.png
node tools/assets/tile.mjs assets/generated/textures/hull-panel-tile.png --tiles 2
node tools/assets/compare.mjs --a old.png --b new.png --tiles 2 --repeat 4x4 --board docs/concept-art/01-exterior-gameplay.png
```

Run everything from the repo root. `check.mjs` needs **no dependency at all** —
plain Node, no `npm install`, no browser. The rasterizer and viewer need a
Chrome, and get it from the playtest harness's existing install:

```sh
cd tools/playtest && npm install     # once per checkout, shared by both tools
```

`tools/assets/package.json` lists `playwright-core` too, but installing it here
is a fallback, not the expected path: `lib/browser.mjs` resolves
`tools/playtest/node_modules` first so one install serves both harnesses, and
the same `channel: 'chrome'` choice applies (drives installed system Chrome over
CDP, no bundled-binary download — that harness's README explains why).

## The ten tools

| Command | What it does |
| --- | --- |
| `check.mjs` | Validates `assets/manifest.json`, palette compliance, power-of-two sizes, the recipe contract, and the game's independence from all of it. Exits non-zero on any failure. Zero dependencies. |
| `rasterize.mjs` | SVG → PNG at an exact pixel size, through Chrome. Transparent by default. Reports the palette of what it just wrote. |
| `render.mjs` + `renderer.html` | **RECIPE → PNG**: runs a self-contained canvas-painting module in Chrome, twice, and requires the two PNGs to be byte-identical before writing one (T-053). |
| `view.mjs` + `viewer.html` | Screenshots an asset at its real on-screen height next to a RIG-height reference bar, plus a 2x/4x/8x/native ramp. |
| `sheet.mjs` + `sheet.html` | Screenshots *many* assets at their true on-screen sizes in one image — the comparison the viewer cannot make (T-036). |
| `alpha.mjs` | Shows an asset's transparency: over the game teal, over hot magenta, over a checkerboard, and its alpha channel as greyscale, with the census numbers (T-053). |
| `tile.mjs` | Screenshots one texture **repeated** at true on-screen size. A seam and a countable motif are invisible in a single copy and are the only two ways a tiling texture fails (T-046). |
| `compare.mjs` | Two assets side by side at true on-screen size, with the concept board they answer to in the same frame — the "is this different from what it replaced, where it matters" shot (T-053). |
| `gen.mjs` + `codex/*.md` | Fills the generation spec from the palette table and the scale arithmetic, then optionally runs `codex exec`. Two modes: `vector` (asks for an SVG) and `raster` (asks for a recipe). Optional — nothing else depends on it. |
| `probe.mjs` | Histograms any PNG's hue clusters in CIELCh. This is where the palette numbers below came from. |

## The palette rule

**A role is a hue band, not a hex.** Shades and tints of a role are legal — a
flat-shaded facet needs a lit tone and a shadow tone of the same material, and
DESIGN's eight-color budget would be spent inside a single asset otherwise. A
color whose hue lands in no band is off-palette and fails the check. Lightness
and chroma are free above the neutral floor; alpha is ignored entirely.

Below CIELCh chroma **12** a color carries no hue commitment and passes on the
neutral axis regardless of lightness — that is how ink strokes, hull greys and
fog tones stay legal without spending chromatic roles.

DESIGN's Concept section caps the palette at eight colors and names five. This
pipeline spends the other three on the neutral axis the grey-box already uses,
so there are exactly eight roles, and `check.mjs` asserts that ceiling.

| Role | Band (CIELCh hue) | Anchor | Measured evidence |
| --- | --- | --- | --- |
| `deep-teal` | 200–240 | `#0e5f6c` | boards 10/11/13 mass clusters at h 207.9–223.7, 17–24% of screen each; shipped `shots.L` h 206.5 |
| `rust-orange` | 48–78 | `#9b5c31` | boards 01/06/07/13 rust at h 51.7–63.9; shipped `shots.F` h 53.1, `houndTell` h 71.3 |
| `warm-white` | 78–100 | `#ffe79b` | boards 01/13 highlights h 82.3–93.0; shipped `shots.S` 79.5, `gun` 81.3, `modCapsule` 89.2, `shots.R` 94.6 |
| `acid-green` | 100–150 | `#a8c22a` | boards 01/06/07 acid at h 103.6–113.1; shipped `houndCharge` 130.6, `hound` 129.2, `wasp` 141.7, `carrier` 146.3 |
| `hot-magenta` | 325–5 (wraps) | `#ff4fd8` | boards 01/07/13 accents h 330.0–0.3; shipped `capsule` 336.4, `shots.H` 338.1 |
| `ink` | neutral axis | `#14181e` | shipped capsule letter ink (L 8.1), `CONFIG.palette.bg` (L 15.9) |
| `haze` | neutral axis | `#46525f` | shipped `CONFIG.limb.bg` (L 34.3) |
| `hull` | neutral axis | `#767c85` | shipped `CONFIG.palette.ground` (L 51.8), `player` (L 87.9) |

**Every number in that table is measured, not chosen.** DESIGN names the roles in
words ("deep teal environment, rust-orange metal") and the grey-box only commits
real hex to three of them, so the teal and rust bands would otherwise have been
one agent's taste. `probe.mjs` histogrammed the operator-endorsed boards in
CIELCh; those clusters set each band's center, and each band was then widened
just far enough to also admit the colors the game already ships. Re-derive any
row with:

```sh
node tools/assets/probe.mjs docs/concept-art/13-human-scale-monster-climb-grammar.png
node tools/assets/probe.mjs docs/concept-art/01-exterior-gameplay.png --min-chroma 35
```

The gate can demonstrably reject things. `check.mjs --selftest` runs five tables,
**all of them on every invocation**, not just under the flag — a band wide enough
to accept everything would silently turn the whole check into a no-op, and so
would an import scan or a mass rule that has quietly stopped matching:

| Table | Cases | What it pins |
| --- | --- | --- |
| palette | 23 | 14 colors measured off the boards or lifted from `src/config.js` that must classify to a named role; 9 (pure red, orange-red, pure blue, royal blue, violet, sky blue, pure cyan, jade green, an unparseable string) that must be rejected |
| import scan | 25 | 12 static-import shapes that must be rejected, 13 runtime shapes that must stay legal (see "Game independence") |
| raster mass | 7 | 3 painted-asset shapes that must pass, 4 off-palette shapes that must fail — each naming *which* cap must catch it (see "Palette compliance (raster)") |
| alpha contract | 8 | 3 alpha censuses that must pass, 5 that must fail — including the real regression (a cutout that came back 100% opaque) and the real pre-T-053 plate (a cutout with a 0.48% hard cut) |
| recipe contract | 16 | 11 recipe shapes that must be rejected (`Math.random`, a clock, an import, an external image, network, DOM, a missing export, a computed seed, an off-palette literal), 5 that must stay legal |

## Palette compliance (raster) — judged by mass, not by coverage

**The rule above says which colors are legal. This section is about how a PNG is
judged against it, and it changed in T-053** when the pipeline started producing
*painted* assets instead of rasterized flat fills.

The original raster check judged one color at a time and exempted anything under
0.5% coverage (`--min-coverage`), because antialiasing manufactures thousands of
one-off edge blends and judging those would fail every asset. That is the right
shape for a flat vector fill: a handful of authored colors, each covering a big
fraction of the image, plus a fringe. **On a painted asset it stops looking at
most of the image.** A procedural surface built from noise and gradients spreads
its pixels over thousands of unique colors, almost none of which reaches 0.5%,
and every one of those is exempt by construction. Measured on the same subject
drawn both ways (`node tools/assets/check.mjs --json` and the histogram helper in
"Honesty" #4 reproduce these):

| Asset | route | unique colors | colors judged | **pixel mass judged** |
| --- | --- | --- | --- | --- |
| `hull-panel-tile` | flat SVG (T-046) | 24 | 5 | 99.1% |
| `hull-panel-tile` | painted recipe | 458 | 27 | 83.1% |
| `backdrop-gill-cavity` | flat SVG (T-046) | 77 | 6 | 94.4% |
| `backdrop-gill-cavity` | painted recipe | 19,908 | 4 | **2.8%** |

The exemption grows with exactly the technique this pipeline now uses: the more
painted the asset, the less of it the old gate looked at, down to 3% of the
pixels on the most heavily graded plate in the set. So raster assets are judged
by
**mass** (`checkRasterColors` in `lib/palette.mjs`). Every non-transparent pixel
is classified, and the question asked of each is *where did this color come
from*:

| Verdict | Meaning | Legal? |
| --- | --- | --- |
| in band | hue inside a role band, or chroma below the neutral floor | yes — and it should be nearly everything |
| blend | off band, but on the straight sRGB segment between two colors this image itself uses in quantity, or inside the triangle of three of them | yes — interpolating between palette tokens introduces no new hue |
| alien | off band and on no such segment or triangle | **no** |

Two pixels do not vote, and both exclusions are measured rather than assumed:

- **Weight is alpha, not pixel count.** A pixel contributes as much color as its
  alpha says it does.
- **Below alpha 32, a pixel's stored hue is not evidence.** A canvas stores
  premultiplied color, so what lands in the PNG is quantized to steps of `255/a`
  levels — 8 levels at alpha 32, 25.5 at alpha 10 — which on a dark color swings
  the CIELCh hue by tens of degrees. Measured: 70 pixels of `wear-scuff-overlay`
  at alpha 9–10, every color in that recipe derived from `env.PALETTE`, read back
  as blue-violets at hue 295–296 and failed the gate over rounding noise
  contributing under 4% of a composited pixel each. Those pixels are excluded
  from the hue verdict and their off-band mass is printed on its own `faint:`
  line — excluded, not hidden, so an off-palette accent hiding at 5% opacity is
  still visible in the output.

Two caps, both printed on every run whether they bind or not:

| Cap | Value | What it is for |
| --- | --- | --- |
| `alienMass` | 0.1% of non-transparent pixels | the hard one: a hue nobody in this image mixed. An alien hue does not arrive in small quantities by accident. |
| `offBandMass` | 5% | the "third hue as a design element" guard. A blend between two owned tokens is legal per pixel, but if a twentieth of the image sits in the gap between two bands then the gap is what the asset is made of. |

**Both numbers are calibrated against every asset in this repo, not chosen.**
Sweep of all 38 committed assets (29 rasterized from SVG, 9 painted from
recipes) under the final rule, **re-measured after T-053's alpha-cutout pass**
(the five backdrop plates went from opaque rectangles to real cutouts, which
moves these numbers — see below):

| Route | assets | worst off-band | worst alien |
| --- | --- | --- | --- |
| vector → raster | 29 | 0.238% (`capsule-lit-spread`) | 0.0000% |
| painted recipe | 9 | 1.365% (`backdrop-crown-horizon`) | 0.0457% (`backdrop-crown-horizon`) |
| **cap** | | **5%** | **0.1%** |

The painted worst case for off-band mass is now the horizon fog itself: cutting
the plate to a cutout shrank the counted (non-transparent) pixel mass, so the
same fog-dither population that used to be 0.0546% of a much bigger opaque
image is now a slightly larger share of a smaller one. It is still dither on
the line between the fog's own colors, not a new hue.

**The alien cap has under 3x headroom on the tightest asset**, and that is worth
knowing before the next painted backdrop: `backdrop-crown-horizon` is a fog
gradient dithered per pixel, and its 0.0457% is dither landing a few levels off
the line between the four colors its fog is actually made of, not a wrong hue.
If a future asset fails this cap, read the reported hue clusters first — a real
violation is one cluster carrying most of the mass at a hue nothing else in the
image uses; dither noise is a spray of hundreds of colors each at 0.001%.
Changing either number is an art decision and belongs in this table with its
evidence.

**`maxAnchors` raised 48 → 64 in the same pass, for the same reason.** Cutting a
plate's background to transparency doesn't touch its RGB, but it does shrink
the counted pixel mass — so a role that legitimately carries a few percent of
the image can end up split across more buckets than fit in the old cap, once
the huge, few-bucket flat fill that used to dominate it is gone. Measured on
`backdrop-colony-cluster`: masking its teal background left the surviving teal
pixels spread over 92 quantized buckets above `anchorMinMass`, 11 of them
genuine deep-teal shades ranked 53–91 — outside the old top 48, which was full
of the rust/hull/ink noise that dominates the rest of the plate. Their absence
turned 0.137% of teal-edge antialiasing "alien" (cap 0.1%) with zero change to
which hues the asset actually uses; `alienMass` -> 0.0000% at `maxAnchors: 64`
and does not improve further at 80 or 96 (only 92 buckets exist above the
floor for this asset). Every other committed asset already reads `alienMass:
0.0000%` at 64 (several — `backdrop-gill-cavity`, `backdrop-limb-segment`,
`backdrop-spine-coil`, `vent-louver-plate`, `wear-scuff-overlay` — have more
raw color diversity than `maxAnchors` allows too, they just did not happen to
lose an anchor that anything off-band needed), so this widens the pool without
measurably loosening what counts as a legal blend.

`--min-coverage` still exists and still defaults to 0.005, but it now sets only
the mass a role needs to be **recorded** in the manifest. It no longer decides
what is judged, because everything is.

**The rule can be observed failing.** `check.mjs --selftest` runs 7 raster cases
on every invocation: three that must pass (a flat two-role asset; two roles
meeting along a soft 32-step edge; 4,000 shades of one role from noise) and four
that must fail (a violet accent off the teal–magenta line at 1%; the same violet
at 0.15%; half the image parked in the legal-blend gap; a jade green between two
bands neither of which is used). Each must-fail case also asserts *which* cap
caught it, so a rule that started failing everything for one reason would be
caught too.

Known permissiveness, stated plainly: the blend test admits any point on the
segment between two used colors — and, since three-way blends are real (two
layers of paint over a third, a fog pass over an already-graded surface), any
point inside the triangle of three of them. So an image that legitimately uses
both teal and magenta in quantity can carry a pixel anywhere on the line between
them, including hues that belong to neither. That is the literal statement of
"interpolating between palette tokens is legal"; the `offBandMass` cap is what
stops it from becoming a look. Blend endpoints are the image's own in-band
colors, clustered on a 16-level-per-channel grid and capped at the 48 heaviest
(12 for triangles, which cost O(n³)) — a color the asset barely uses cannot
license a hue.

## Alpha semantics — declared, never derived

**An asset's transparency is a contract with whatever composites it, and it is
now stated in the manifest and checked against the pixels.** This section exists
because of a live defect, not a hypothetical one: T-053 regenerated five backdrop
plates from ~50%-transparent cutouts into fully opaque rectangles with the fog
painted in, and *every gate stayed green* — palette clean, sizes right, ids and
paths stable, and no effect on the game to detect because nothing loaded them
yet. The lane layering those plates for parallax would have been the thing that
found out, at merge, because an opaque plate occludes every tier behind it.

| `alpha` | Means | Checked |
| --- | --- | --- |
| `cutout` | a shape on transparency; the transparent region must read as absent | ≥5% fully transparent **and** ≥2% partial — the feather |
| `opaque` | every pixel opaque; a tiling surface wants no alpha at all | ≤0.5% transparent, ≤0.5% partial |
| `overlay` | mostly transparent, nothing solid: modulates the surface under it | ≥40% transparent, ≤5% fully opaque |

Three rules that matter more than the numbers:

1. **`--write` does not fill this in.** A declaration derived from the file it is
   meant to constrain agrees with anything — that is the "assertion whose subject
   is the author's intent" failure this repo keeps paying for. The field is
   typed by a person; `check.mjs` only ever disagrees with it.
2. **A `backdrops` entry must declare it.** That is the one category whose
   consumer composites in depth tiers, so an undeclared plate is a missing
   contract, not a default.
3. **The feather threshold is the interesting one.** A cutout needs partial
   alpha, because a one-pixel alpha cut on a flat camera-facing plane *cannot be
   dissolved downstream* — no fog colour, depth offset or material setting will
   soften an edge that is binary in the file. The plates this pipeline inherited
   carried 0.28–1.80% partial (antialiasing only) and were judged too hard-edged
   by the lane consuming them, so the rule asks for 2% and the raster spec asks
   the generator for a dissolve measured in tens of pixels.

`gen.mjs --mode raster` **requires `--alpha`**; there is no default, because a
default is how this happened. `tools/assets/alpha.mjs` is the picture that goes
with the numbers — the plate over the game teal, over hot magenta, over a
checkerboard, and its alpha channel as greyscale:

```sh
node tools/assets/alpha.mjs assets/generated/backdrops/backdrop-limb-segment.png
```

## Manifest schema

`assets/manifest.json` is `{ "assets": [ ... ] }`. Per entry:

| Field | | Meaning |
| --- | --- | --- |
| `id` | required | kebab-case, unique |
| `path` | required | repo-relative, under `assets/generated/` or `assets/approved/`, inside its category directory |
| `category` | required | `glyphs` \| `textures` \| `sprites` \| `ui` \| `fx` \| `backdrops` \| `environment` |
| `size` | required | `{ "w": n, "h": n }` — checked against the file's own header, not trusted |
| `task` | required | the task that produced it, e.g. `T-015` |
| `source` | optional | what produced the pixels: an `.svg` original (palette-checked too) or a `.recipe.js` module (contract-checked, never executed) |
| `seed` | optional | recipe assets only: the recipe's `meta.seed`, recomputed from the source and refused if it disagrees. Recipe + seed is the whole input to the PNG |
| `alpha` | optional, **required for `backdrops`** | `cutout` \| `opaque` \| `overlay` — the transparency contract, checked against the alpha channel. Never auto-filled (see "Alpha semantics") |
| `gpu` | optional | defaults `true`; power-of-two enforced. `false` requires a `notes` reason |
| `palette` | optional | recomputed and compared on every check; `--write` fills it in |
| `notes`, `generator`, `addedOn` | optional | provenance and caveats |

`--write` recomputes `size` and `palette` from the files themselves; a plain
check then fails if the manifest and the pixels disagree. Never hand-edit the
derived fields — the point is that they cannot be wrong on purpose.

`assets/approved/` is the operator's directory. Nothing here writes to it.

## In-game scale, and why the viewer exists

The asset-artist standing orders say a glyph that reads at 512px and smears at
14px has failed. The operator's view-scale verdict (`docs/decisions.md` entry 7)
made FAR the default camera, where RIG is **3.7%** of screen height. So
"does this asset read?" is a question about a specific, small pixel count:

```
CONFIG.player.height        = 1.7 tiles
CONFIG.viewScales far/mid/near -> RIG at 3.7% / 5.0% / 7.0% of screen height
                                  (measured, stated in src/config.js's comment)

px = frac x viewportHeight x tiles / 1.7
```

A weapon capsule is `CONFIG.capsules.size` = 0.55 tiles, so at the harness's
default 1280x800 viewport it is **9.6 pixels tall** next to a 29.6px RIG. The
viewer renders exactly that, beside a 2x/4x/8x/native ramp so you can see where
the read breaks down. Both numbers are the game's own; this tool re-derives
nothing.

```sh
node tools/assets/view.mjs assets/generated/glyphs/capsule-letter-h.png --tiles 0.55
node tools/assets/view.mjs <asset> --view near --bg haze --headed    # compare views, watch it live
```

`viewer.html` imports no game module and is not referenced by `index.html`; it
is a static page the playtest harness's static server happens to be able to
serve.

### Comparing candidates — `sheet.mjs`

The viewer answers "does **this** asset read at this size". Choosing a direction
asks something the viewer cannot show: *which* of several candidates reads, and
whether a player can tell them apart. That needs every candidate at one true
size in one image, so `sheet.mjs` drives `sheet.html` the same way `view.mjs`
drives `viewer.html` — same server, same Chrome, same scale arithmetic:

```sh
node tools/assets/sheet.mjs \
  --assets assets/generated/glyphs/capsule-mark-laser.png,assets/generated/glyphs/capsule-lit-laser.png \
  --px 9.6,18.2,23.4 --rowlabels "raw,SHIPPED,max" --bg deck \
  --out reports/tasks/T-036/sheet.png
```

Rows take either `--tiles` (resolved against the view fractions, like the
viewer) or `--px` (given directly — then the viewport height does not enter the
arithmetic at all). `--bg` adds `teal`/`deck`/`limb` to the viewer's backdrops,
which are `CONCEPT.bg`, the lit rust deck and the six-face haze: a capsule's
legibility flips with what it is sitting on, so judging on one backdrop is not
judging. Everything the viewer's honesty note says applies here unchanged — it
is the same flat composite, with no fog, perspective, lighting, mipmapping or
tone mapping (see limitation 11 below for how much tone mapping actually moves).

## Generating with codex

```sh
node tools/assets/gen.mjs --id vent-plate --category textures \
  --brief "an armoured vent cover, four louvres, one broken open" \
  --roles rust-orange,ink --size 128 --tiles 1.2 --boards 10,13 --dry-run

node tools/assets/gen.mjs --id hound-brace-a --category sprites \
  --brief "a low, wide charging frame, side on, facing right" \
  --roles acid-green,ink,rust-orange --size 64x32 --grid 32x16 \
  --tiles 1.7,0.9 --boards 06,07
```

The spec is built from `codex/spec-template.md` with the palette table generated
from `lib/palette.mjs` and the scale note computed for the asset's tile box —
so the constraints a generator receives and the constraints `check.mjs` enforces
cannot drift apart. Every resolved spec is written to
`tools/assets/runs/spec-<id>.md` as the prompt of record. Codex runs with
`-s read-only`: it proposes an SVG, this wrapper writes the file.

**`--size` takes `WxH`, and `--tiles` takes `W,H`** (T-046). Half this game's
subjects are not square: a hound is 1.7 x 0.9 tiles and a deck lip strip is 4 x
1, and a square canvas either wastes half its pixels or invites the generator to
compose for a box the asset will never occupy. One number still means a square
canvas and a height in tiles, exactly as before.

**`--grid` is the design grid, and it is the point.** Set it to the asset's true
on-screen pixel box and the generator draws in units the player will actually
see: the spec then says "one unit is one pixel, a feature under one unit thick
does not exist", and the raster is a plain 2x oversample of that grid rather than
extra resolution to spend on detail that dies. A hound authored on a 32x16 grid
at a 64x32 canvas keeps every edge on a whole screen pixel. This is the direct
answer to the defect that opened the readability question in T-036 — art that
looks finished at 128px and smears at 9.6px — and it costs nothing to use.

**Codex is optional by design.** Nothing else in the pipeline calls `gen.mjs`.
With the CLI absent it still writes the spec, prints the exact command to run
later, and exits 3 — distinct from 2 (usage) and 1 (failure) so a caller can
tell "unavailable" from "went wrong".

## The raster route — ask for a painter, not a picture (T-053)

```sh
node tools/assets/gen.mjs --id hull-panel-tile --category textures \
  --mode raster --tiling xy --size 128 --tiles 2 --seed 371232 \
  --roles rust-orange,ink,hull,haze,warm-white --boards 1,13 \
  --brief "a seamless tile of the Meridian's exterior armour skin ..."

node tools/assets/render.mjs assets/generated/textures/hull-panel-tile.recipe.js
```

**Why.** Codex is a coding agent — images in, code out. Asked for an SVG it
hand-places rectangles, and next to painted concept boards the result is flat
clip-art: hard-edged fills with nothing happening inside them. It cannot emit a
painting. It *can* write a program that renders one — value noise and fbm,
directional grunge, edge-wear masks, panel-gap occlusion, gradient ramps,
dithered atmospheric haze — and that ask has a far higher ceiling while keeping
every property the SVG route was chosen for: the source is text that diffs, the
output is deterministic, the repo gains no dependency, and the pixels are still
palette-checked. The vector route is **not** deprecated: a glyph or a UI mark
whose whole value is a crisp silhouette at 16px is still better as an SVG, and
flat fills are a feature there.

**The recipe contract** (stated to the generator in
`codex/raster-spec-template.md`, enforced by `lib/recipe.mjs`):

```js
export const meta = { id, size: { w, h }, seed, roles: [...] };
export function render(ctx, env) { /* paint */ }
```

- **No imports.** Everything arrives on `env`; a recipe never pins a path inside
  `tools/`.
- **No `Math.random`, no clock, no network, no `document`/`window`, no external
  images.** `Math.random` is deleted from the renderer page, so a call throws.
- Randomness comes from `env.rng()`, `env.stream(name)`, `env.noise()`,
  `env.fbm()`, `env.ridge()` — all seeded from `meta.seed`.

**Determinism is proved, not asserted.** `render.mjs` renders the recipe twice,
in two browser contexts, and refuses to write anything if the two PNGs differ.
Reproducing a committed asset is `node tools/assets/render.mjs <recipe>`; the
manifest records the seed and `check.mjs` refuses a manifest seed that disagrees
with the recipe.

**The toolkit on `env`** (`lib/procgen.mjs`, browser- and Node-safe):

| | |
| --- | --- |
| `rng()`, `stream(name)` | seeded floats; named streams so adding a layer does not reshuffle earlier ones |
| `noise(x, y, {period, seed})` | **periodic** value noise — sample at `(u*P, v*P)` with whole `P` and the field wraps at the canvas edge, which is what makes a tile seamless |
| `fbm(...)`, `ridge(...)` | fractal sum and its folded variant, periodic at every octave |
| `field(fn, {blend})` | per-pixel painting; `fn(x,y,u,v)` returns `[r,g,b,a]` or `null`. `blend:'over'` composites onto what is already there |
| `mix`, `shade`, `rgba`, `hexToRgb`, `rgbToHex`, `PALETTE` | sRGB color math and the role anchors, so a recipe never types a hex the palette table does not own |
| `clamp`, `lerp`, `smoothstep`, `band` | ramps |

`tools/assets/fixtures/recipes/smoke-swatch.recipe.js` is a worked example and
the fixture the render path is exercised with; nothing loads it.

**Two committed negative controls, because a gate nobody has watched fail is a
rumour:**

```sh
node tools/assets/render.mjs tools/assets/fixtures/recipes/smoke-swatch.recipe.js
#  -> reproducible: yes — two renders, identical bytes

node tools/assets/render.mjs tools/assets/fixtures/recipes/nondeterministic.recipe.js
#  -> render failed: the same recipe rendered two different images in one run
#     exit 1, and no PNG is written
```

The second one is the interesting one. It uses `crypto.getRandomValues`, which
is **not** on the banned-names list and could not be on a list that did not
already know about it, so it passes the static scan cleanly and is caught one
layer down by the double render. That layering is deliberate: the scan catches
what it can name and points at the line, the double render proves the property.
If that fixture ever renders successfully, every "reproducible: yes" line in this
pipeline is worthless.

The scan's own two directions are pinned in `check.mjs --selftest`'s recipe
table (16 cases), and both halves can be watched failing by appending one line
to any committed recipe:

```sh
printf "\nconst r = Math.random();\n" >> assets/generated/textures/hull-panel-tile.recipe.js
node tools/assets/check.mjs     # FAIL, naming the file and line
git checkout assets/generated/textures/hull-panel-tile.recipe.js
```

**Why the checker never runs a recipe.** `check.mjs` stays a bare `node
tools/assets/check.mjs` — no browser, no sandbox, no `npm install`, and no trust
in whatever a generator wrote. It reads the recipe with the same lexer the
import scan uses and reports contract violations statically. The property that
static reading cannot prove — that the module is actually deterministic — is
proved instead by `render.mjs`'s two-render byte comparison, which is where it
belongs.

## Demo round-trip (committed evidence)

One asset walked the whole pipeline, and everything below is in the tree:

| Step | Artifact |
| --- | --- |
| source | `assets/generated/glyphs/capsule-letter-h.svg` (1.3kB) |
| rasterized | `assets/generated/glyphs/capsule-letter-h.png` — 128x128, **821 bytes**, 8 unique colors |
| manifest | `assets/manifest.json` entry `capsule-letter-h`, palette `pass`, roles hot-magenta / ink / warm-white |
| judged at scale | `tools/assets/reports/demo/capsule-letter-h/viewer-far.png` |

It is a style study for the weapon-capsule box face that
`src/render/capsules.js` currently draws procedurally into a 64px canvas. Three
magenta shades (L 45.2 / 63.2 / 75.9, all at hue ~336) exercise the
shades-of-a-role rule; ink carries the letter; warm-white carries the rivets.
Letterforms are rectangles, not `<text>`, so rasterizing does not depend on an
installed font.

**What judging it at scale actually showed** — and this is the point of the
viewer, not a footnote: at 9.6px the chamfered corners and all four rivets are
gone, and the ink `H` survives only as a smudge. That is direct evidence for the
readability follow-up `docs/decisions.md` entry 7 left open ("scale tells/glyphs
up as an art/readability pass"). **It is a finding for the operator, not
something this task resolved** — a capsule glyph at the shipped FAR view cannot
carry a letter at 0.55 tiles, and the fix (bigger capsules? a shape-coded
silhouette instead of a letter? a HUD-side readout?) is a feel decision.

**T-036 turned that question into artifacts.** Seventeen candidates covering the
four named directions are staged under `assets/generated/glyphs/` and
`assets/generated/ui/`, each rasterized here and judged at true on-screen size;
the side-by-side sheets, the measurements and the operator packet are in
`reports/tasks/T-036/`. Two numbers from it belong in this file because they
change how any future glyph is authored: the shipped face is **18.2px**, not
9.6px (the legibility pass's `GLYPH_GAIN` 1.9 restores it), and going past 1.9
is not a bigger number but a rule change — `tools/pathcheck.mjs` asserts a
compensated glyph lands at the *same* screen size at every view, so more scale
has to come from a sim constant or a new verdict. **The decision itself is still
the operator's and is still open.**

## Honesty / limitations — read before trusting a green check

1. **A green palette check is not an art verdict.** It proves no hue strayed
   outside a measured band. It says nothing about whether the shapes belong in
   this game, whether the silhouette reads, or whether the asset is any good —
   only the operator judges that (`CLAUDE.md`: machine gates never judge fun).
2. **The `acid-green` band is the widest at 50°, knowingly.** The boards paint
   acid-green markedly more yellow (h 103.6–113.1) than the grey-box paints its
   hostile ecology (h 129.2–146.3), and the band had to admit both. Narrowing it
   means deciding which end is canon — an art decision flagged for the operator,
   not a tolerance to quietly tighten.
3. **Raster palette checking used to be coverage-gated — it is not any more, and
   items #3 and #4 are kept as the record of the defect that replaced it.**
   Until T-053 only colors covering ≥0.5% of non-transparent pixels were judged,
   so a genuinely wrong 3-pixel accent in a 512x512 texture could not fail the
   build, and on a *painted* asset over half the pixel mass went unexamined
   (measured above, "Palette compliance (raster)"). Raster assets are now judged
   by mass with two caps and a blend test; SVG literals are still judged one at a
   time at threshold zero. What has NOT changed: a blend of two legal roles can
   still land between bands — it is now explicitly classified as a blend and
   counted against the 5% `offBandMass` cap rather than silently exempted.
4. **Measured, from when #3 was the live rule:** the committed 128x128 demo has 8 unique
   colors — 5 authored, 3 blends, none of them off-palette or above the gate.
   The same SVG rendered at a non-power-of-two 100x100 produces **31** unique
   colors, of which **5 blends** clear the 0.5% gate (1.21%, 1.19%, 1.02%,
   0.72%, 0.72%) — all `hot-magenta` shades, so the check still passes on
   merit, not by luck. The one blend that *misclassifies* is `#ffdcc5`, a
   warm-white/magenta edge blend the rule reads as `rust-orange`, and it sits
   at **0.44% — below** the gate, not above it. So the coverage gate is doing
   its job here by a 0.06-point margin, and the miss is invisible twice over:
   below the gate it neither enters the recorded role list nor shows up in the
   ungated note from #3, which lists only colors belonging to *no* role.
   Power-of-two sizes and integer coordinates are not just a GPU rule here;
   they keep the palette evidence clean. Re-derive both censuses with:

   ```sh
   node tools/assets/rasterize.mjs assets/generated/glyphs/capsule-letter-h.svg --size 100 --out tools/assets/runs/h-100.png
   node --input-type=module -e "
   import {histogram} from './tools/assets/lib/png.mjs';
   import {classify} from './tools/assets/lib/palette.mjs';
   const hex = (c) => '#' + [c.r,c.g,c.b].map((v) => v.toString(16).padStart(2,'0')).join('');
   for (const c of histogram('tools/assets/runs/h-100.png',{alphaFloor:8}).colors.sort((a,b) => b.coverage-a.coverage))
     console.log(hex(c), (c.coverage*100).toFixed(2)+'%', classify(hex(c)).roleId ?? 'OFF-PALETTE');
   "
   ```

   (The five authored literals are `#ff4fd8 #b8309b #ff9adf #fff0c2 #14181e`;
   everything else in that listing is a blend.)

   (Per #5 these counts hold for the Chrome build that produced the committed
   demo — re-rasterizing the 128px PNG byte-identically is the cheap check
   that you are on it.)
5. **PNG bytes are only reproducible against the same Chrome build.**
   Antialiasing is the renderer's business. Re-rasterizing on a different
   machine can produce a byte-different (visually identical) PNG, so do not
   treat the PNG as a checksum of the SVG.
6. **The SVG color scanner is a scanner, not a parser.** It reads paint
   attributes and CSS declarations of the same names out of the file text. A
   color arriving from outside the file (external stylesheet, remote `<use>`)
   is invisible to it. Assets here are single self-contained files, which is
   also what the spec template demands. CSS named colors are treated as a hard
   failure rather than silently skipped — a color the gate cannot read is a
   color the gate cannot enforce.
7. **The viewer is a flat composite, not the game.** It puts the asset on screen
   at the right pixel height on a flat backdrop. There is no fog, perspective,
   lighting, mipmapping, or three.js material in it, and the FAR-view fraction
   it scales from is `src/config.js`'s stated measurement, not something this
   tool re-measures per run. It answers "does this read at this size", not "does
   this look right in the scene" — for the latter, get the asset into the render
   layer and screenshot a real run with `tools/playtest`.
8. **16-bit PNG samples are truncated to 8 bits** when decoding, and interlaced
   (Adam7) PNGs throw rather than decode. Chrome never emits either from this
   pipeline; the limitation matters only if an asset arrives from elsewhere.
9. **`gen.mjs` does not validate what codex returns.** It extracts the first
   `<svg>` (or, in raster mode, the first fenced `js` block that exports a
   `render`) from the reply and writes it. **Generation is nondeterministic: the
   same spec will not produce the same asset twice.** The *seed* makes a
   committed recipe reproducible, not the ask that produced the recipe — re-run
   the same `gen.mjs` command and you get a different program. Nothing retries
   until something passes; the check-and-look loop is deliberately a human's. In
   raster mode `gen.mjs` runs the contract scan and prints violations, but it
   never rewrites what a generator wrote.
10. **Assets may now load at runtime (`docs/decisions.md` entry 16), and this
    pipeline does not know which ones do.** It stages files, proves properties
    about them, and records them in the manifest; the render/ui layer decides
    what to load and owns the visible-and-safe degradation when a load fails.
    A green check here says nothing about whether the game reads the file.
11. **An authored hex is not the pixel the game draws, and the gap is large —
    measured.** The shipped capsule face is `PAL.capsule` `#ff4fd8` (luminance
    126.3, CIELCh chroma ~76) drawn on an *unlit* `MeshBasicMaterial`. In the
    committed capture `artifacts/look-v1/z04-capsule-letters-4x.png` that same
    face lands at `rgb(226,167,214)` — **luminance 182.7, chroma 33.2**: it is
    lifted 56 levels and its chroma is more than halved, which is why the pickup
    reads on screen as pale lavender rather than hot magenta. The ink letter
    `#14181e` (L 23.6) lands at `rgb(90,88,107)`, L 89.5. Plate-vs-letter
    *contrast* survives nearly intact (102.7 authored → 93.2 drawn), so the
    practical rule is: **trust this pipeline's value relationships, do not trust
    its hues or absolute levels.** Two known transforms sit between the two
    numbers — the renderer's ACES tone mapping (`src/render/scene.js`) and the
    `CanvasTexture` that never sets `colorSpace` (`src/render/capsules.js:121`,
    already the operator's open question in `docs/proposals/2026-08-look-
    direction.md` §6 Q5b) — and this measurement does not apportion blame
    between them. Re-derive it from the committed capture; nothing here is
    modelled.
12. **A stack of legal colors is not a legal color, and the SVG scanner cannot
    see it — measured (T-046).** `lib/svg.mjs` reads the file's paint literals;
    the raster check reads the pixels the browser composited. Those differ the
    moment an asset builds its value steps out of semi-transparent copies:
    `backdrop-limb-segment`'s first generation authored **69 literals that are
    all individually legal** (five base colors at ~40 alpha levels) and
    composited to `#3c5462` — CIELCh h 245.0, chroma 12.2 — over **1.73%** of the
    asset, which is off-palette in every band and above the coverage gate, so
    `check.mjs` failed it while a source-literal scan called it clean. The
    spec template now forbids alpha-stacked depth outright and the asset was
    regenerated with opaque steps. Read it as: **the raster check is the gate,
    the SVG scan is a convenience**, and any asset whose depth comes from
    transparency has to be judged on its pixels.
13. **`tile.mjs` is a flat CSS repeat, not a material.** It proves a tile's
    edges continue and shows whether the eye can count the copies at the real
    on-screen size. It does not know how the render layer will map UVs, and it
    has no mipmapping, fog, lighting or perspective — a texture that tiles
    cleanly here can still seam in the scene if the geometry maps it differently.
    `compare.mjs` is the same flat composite with two assets and a board in it.
14. **A recipe's PNG is reproducible against the same Chrome, not across
    Chromes** — the same trade as #5, and it is why `render.mjs` compares two
    renders *within one run* rather than against a stored hash. Canvas 2D
    compositing, `toDataURL` encoding and any least-significant-bit rounding
    belong to the browser. The durable record is the recipe and its seed; the
    PNG is a build artifact that happens to be committed.
15. **The recipe scan is a lexer, not a parser** (`lib/recipe.mjs`, same trade as
    `lib/imports.mjs`). It reads `meta` fields with regexes over masked source
    and matches banned identifiers by name, so a recipe that computed its seed at
    runtime, or reached `Math["random"]` through a computed member access, would
    pass the scan. Both are caught downstream — the first by the manifest's
    seed comparison, the second by the two-render byte comparison — which is the
    intended division: static reading catches what it can name, the render proves
    the property that actually matters.
16. **`env.field` is where a recipe's time goes.** A full-canvas per-pixel pass
    with 4–5 octaves of fbm is milliseconds at 128x128 and tens of milliseconds
    at 1024x512; a recipe that layers a dozen such passes will be slow, and
    `render.mjs` runs it twice. The timeout is 90s per render, and the in-page
    render time is printed so a slow recipe is visible rather than mysterious.

## Game independence

`check.mjs` fails if any file under `src/` contains a **static ES import** of an
`assets/` path. Runtime references (a `THREE.TextureLoader` URL, a CSS `url()`,
an `img.src`, a dynamic `import()`) are legal, and every one found is listed in
the check output so the set stays visible as it grows.

**The reason narrowed on 2026-08-02.** It used to be "the game must boot with
every asset file missing" — a blanket ban that `docs/decisions.md` entry 16
retired. Runtime assets are now sanctioned; what they owe is visible, safe
degradation, never a wedge. A *static* import is still rejected because it is
the one shape that binds the file into the module graph: a missing PNG then
stops being a degraded frame and becomes a blank page, which is a P1 defect
whatever the art was going to be.

At the time of writing, `src/` in this worktree contains no reference to
`assets/` at all; two concurrent lanes are adding the first runtime loads.

The listing counts **runtime references only**: a rejected static import is
reported as an error and excluded from that line — the whole statement's line
span, not just the keyword's line — with the count of rejected imports named
beside it. (Until I-002 it was printed in both places, under a header that said
"runtime, not imports".)

**The scan reads statement grammar, not lines** (`lib/imports.mjs`, T-026). Both
obvious regexes are wrong, and the tree has now been bitten by one of them:

- the old line-anchored pattern saw a specifier only on the keyword's own line,
  so `import {\n x,\n} from '../assets/x.png'` exited **0** and was filed as a
  *runtime* reference — the gate reported green while the invariant it exists to
  protect was violated (I-014);
- widening it across newlines swallows the file between an `import` and the next
  unrelated `'assets/…'` literal, and starts failing legal runtime code — the
  counter-example this README has carried since T-017, and still a live shape:
  `tools/assets/fixtures/runtime-reference/src/render/textures.js` is exactly it.

So the scanner walks the statement: after the keyword only an import clause may
appear (identifiers, `*`, `as`, `,`, `{`, `}`, comments, whitespace), the
specifier is the first string literal, and — except for a side-effect
`import 'x'` — the word right before it must be `from`. The first character that
cannot belong to a clause ends the scan, so a statement can never read past its
own end into the next line. `export … from` counts too: a re-export binds the
module exactly as hard as an import does.

`check.mjs --selftest` runs 25 import-scan cases beside the palette ones, on
**every** invocation: 12 shapes that must be rejected (multi-line, four-line,
namespace, side-effect, re-export, comments inside the clause, one after a regex
literal holding a quote, one after a template literal quoting a fake import, one
under a shebang, one after a division) and 13 that must stay legal (the
counter-example above, dynamic `import()`, a URL constant, `export default '…'`,
an export clause with no `from`, commented-out and template-quoted imports,
`import` as a property name).

Two of those must-reject cases are scars, not decoration. The scanner's first
draft lexed the `#!/usr/bin/env node` shebang as code — `/usr/` reads as a regex
literal and `node` as the last identifier, so the file's first import looked
like a property access and was **skipped**. Caught by running the scanner across
all 105 `.js`/`.mjs` files in `src/` and `tools/` and requiring it to find at
least what a naive single-line regex finds: it under-counted in 14 files, all of
them shebanged tools. It now finds 540 static imports there against the naive
regex's 473 (the difference is multi-line imports, which is the point).

End-to-end, the exit code is proven by two committed fixture trees rather than
asserted:

```sh
node tools/assets/check.mjs --root tools/assets/fixtures/multiline-import    # exits 1: 2 hard imports
node tools/assets/check.mjs --root tools/assets/fixtures/runtime-reference   # exits 0: 3 runtime refs
node tools/gatecheck.mjs                                                     # runs both, and the pathcheck controls
```

**Limitations of the scan, stated:** it is a lexer over `src/`, not a JS parser
and not a bundler.

1. It reads `src/` only. An `assets/` import from `index.html` or a tool is not
   its business.
2. A module specifier that is *computed* (`import(base + name)`) cannot be read
   by any static scan. Dynamic imports are legal here anyway, so this costs the
   gate nothing — but a composed **runtime** URL only shows up in the reference
   listing if the literal fragment contains `assets/` (the fixture's
   `` `${CONFIG.assetsBase}/glyphs/…` `` is listed at its base constant, not at
   the template). The listing is a ledger, not a gate.
3. Distinguishing a regex literal from a division needs the preceding token; the
   scanner uses the standard heuristic and, if a suspected literal has no closing
   delimiter before the newline, re-reads it as ordinary code. That keeps any
   mis-lex inside one line instead of blinding the rest of the file, and the two
   selftest cases with a quote inside a regex and inside a template literal pin
   it.
4. An `import` statement written inside a template literal would be reported as
   a dependency. False positives are loud and fixable; the alternative bias
   (false negatives) is what I-014 was.

The earlier fixture evidence still holds: a throwaway tree with an off-palette
SVG, a lying `size`, a non-power-of-two GPU texture, a malformed manifest entry
and a `src/` file that hard-imports a PNG produces 11 distinct failures and a
non-zero exit.

## Negative controls — `node tools/gatecheck.mjs`

A gate nobody has watched fail is a rumour, and two of this repo's gates were
green while the invariant they protect was violated (I-014 here, I-024 in
pathcheck's fair-gap probe). `tools/gatecheck.mjs` makes both fail on purpose:
it feeds the two committed fixture trees to `check.mjs`, then mutates
`tools/pathcheck.mjs` in a scratch copy — screen clamp removed, floor column
measured at run speed, speed meter stuck — and requires the *named* assertion to
appear in each mutant's failure list. It asserts the number of textual
replacements too, so a mutation that stops applying fails loudly instead of
passing green.

It takes about 15 seconds (it runs pathcheck three times) and is not the
per-change gate: `node tools/pathcheck.mjs` still is. Run it after touching
`lib/imports.mjs`, `checkGameIndependence`, or pathcheck's `FAIR-GAP` block.
Its honesty note is the header of the file: it proves each gate rejects the
defect it was built for, and cannot prove either gate complete.

## Files

```
tools/
  gatecheck.mjs          the negative controls: makes check.mjs and pathcheck fail on purpose

tools/assets/
  package.json          dev-only; prefers tools/playtest's playwright-core install
  check.mjs              the gate — manifest, palette, sizes, recipe contract, game independence
  rasterize.mjs          SVG -> PNG through Chrome
  render.mjs             RECIPE -> PNG through Chrome, rendered twice and compared
  renderer.html          the recipe host page (imports nothing from src/)
  view.mjs               screenshot an asset at in-game scale
  viewer.html            the viewer page itself (imports nothing from src/)
  sheet.mjs              screenshot many assets at true size, side by side
  sheet.html             the sheet page itself (imports nothing from src/)
  tile.mjs               screenshot a texture repeated at true size
  compare.mjs            two assets + a board in one frame, at true size
  alpha.mjs              an asset's transparency, as four panels and a census
  gen.mjs                codex spec builder + optional invocation (vector | raster)
  probe.mjs              hue-cluster histogram — where the palette numbers came from
  codex/
    spec-template.md         the vector spec, with the palette table injected
    raster-spec-template.md  the raster spec: asks for a canvas recipe, not an SVG
  lib/
    color.mjs            sRGB parsing, CIELAB/LCh conversion
    png.mjs              zero-dependency PNG decode (node:zlib) + histogram
    svg.mjs              paint-literal and size extraction
    palette.mjs          the eight roles, the classification rule, the raster mass rule
    procgen.mjs          the toolkit a recipe is handed: seeded noise, fbm, field, color math
    recipe.mjs           the recipe contract, checked without executing anything
    manifest.mjs         manifest schema, load/save
    imports.mjs          the statement-level static-import scan (game independence)
    browser.mjs          playwright-core resolution + Chrome launch + static server
  fixtures/
    multiline-import/    a tree check.mjs must REJECT (I-014's shape)
    runtime-reference/   a tree check.mjs must ACCEPT (the newline-regex counter-example)
    recipes/             a worked recipe example; nothing loads it
  reports/demo/          committed demo evidence (the viewer screenshot)
  runs/                  ad-hoc specs, codex replies, screenshots (gitignored)

assets/
  manifest.json          the index every asset is recorded in
  generated/<category>/  staging — what this pipeline writes
  approved/              the operator's directory; nothing here writes to it
```

## Single best next action

**Get a verdict on `reports/tasks/T-036/packet.md`, and produce no further glyph
batch until there is one.** The previous version of this section asked for the
readability question to be taken to the operator as prose; T-036 answered it
with artifacts instead — four directions, seventeen candidates, every one judged
at the size it will really be on screen, with each direction's adoption cost
(including whether it needs a runtime-loading decision) stated. What is still
missing is the only thing a machine here can never supply: the operator's
choice. Everything downstream — a glyph batch, `src/render/capsules.js`'s draw
code, whether this pipeline's output ever loads at runtime — sequences behind
that one answer, and picking it inside a lane would be a machine judging fun.
