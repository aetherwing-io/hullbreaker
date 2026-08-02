PASS

Task: T-053 — procedural raster generation path (`tools/assets/**`, dev-only
asset pipeline). DoD class: **harness/tooling** — zero effect on the shipped
game, tool README updated with an honesty/limitations note.

Commit tested: `2f1af45` (`task/T-053`), merge-base `9cc80f7`.

## Process note — read this first

The shared worktree at `.claude/worktrees/T-053` was **not stable** while I
was gating it: partway through I found uncommitted local edits to
`assets/generated/textures/wear-scuff-overlay.{png,recipe.js}`,
`assets/manifest.json`, `tools/assets/render.mjs`, `tools/assets/README.md`,
and one `compare-*.png`, none of which are in commit `2f1af45` (HEAD had not
moved; this is unlanded work-in-progress, presumably build-T-053 continuing
after `rev53` approved). Reported to team-lead separately.

To keep this verdict about the reviewed commit and not a moving target, I
built my own isolated, detached-HEAD copy (`git worktree add … 2f1af45`) and
re-ran every check there. Where the shared worktree's copy of a file
diverged from the pinned commit (confirmed only `wear-scuff-overlay.png`
did, by sha256), I discarded that capture and regenerated it from the pinned
copy. **Every number and screenshot below is against commit `2f1af45`
exactly**, verified either in the pinned copy or (for the two smoke
playtests, which never touch `assets/`) in the shared worktree at a point
consistent with it.

## 1. Zero game effect — demonstrated

- `diff -rq` between `2f1af45`'s `src/` (and `index.html`) and its own
  merge-base `9cc80f7`'s: **exit 0, no output**. Byte-identical, not
  inherited from a diffstat — checked directly.
- Ran both smoke scripts `--deterministic` against a server pinned to
  `2f1af45` (port 8760) and a server pinned to the merge-base `9cc80f7`
  (port 8761, a separate `git worktree add` at that SHA — this is the honest
  zero-effect baseline, not current `main`, which has moved on with
  unrelated T-051/T-052 work this branch never touched):

  | script | build | outcome | deaths | closestCrushApproachTiles | idleTimeFraction | consoleErrors | pageErrors | bootError |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | mid-route | T-053 | completed | 0 | 35.39 | 0.024 | [] | [] | none |
  | mid-route | baseline | completed | 0 | 35.37 | 0.024 | [] | [] | none |
  | transform-slice | T-053 | completed | 0 | 30.14 | 0.000 | [] | [] | none |
  | transform-slice | baseline | completed | 0 | 30.11 | 0.000 | [] | [] | none |

  The ~0.02–0.03 tile spreads are inside this harness's own documented
  `--deterministic` sample-quantization jitter (README: exact-match is only
  guaranteed run-to-run on the *same* build); they are not attributable to
  T-053. Full reports/screenshots: `evidence/playtest-runs/{t053,baseline}-*/`.
- `node tools/pathcheck.mjs` (pinned copy): **2469 passed, 0 failed**.
- `node tools/assets/check.mjs` (pinned copy): **PASS**, selftest 23 palette +
  25 import-scan + 7 raster-mass + 16 recipe-contract cases ok, "game
  independence: src/ contains no reference to assets/ at all".

## 2. The regenerated assets — validity, identity, durability

All 9 (`backdrop-{colony-cluster,crown-horizon,gill-cavity,limb-segment,
spine-coil}`, `hull-panel-tile`, `vent-louver-plate`, `wear-scuff-overlay`,
`weld-seam-strip`):

- **Decode**: valid PNG signature (checked the header bytes myself) and
  successfully decoded by macOS `sips` — an OS decoder independent of this
  repo's own `lib/png.mjs` — for all 9.
- **Filenames/dimensions unchanged from `main`** (checked against `main`'s
  committed blobs directly, not inherited): 512x256, 1024x256, 512x512,
  1024x512, 512x512, 128x128, 128x128, 128x128, 128x32 — identical on both
  sides. T-052 depends on these exact files; nothing here breaks that.
- `node tools/assets/check.mjs` PASSES (above) and `node
  tools/pathcheck.mjs` is green (above).
- **File size before → after** (durability/load angle — none of these are
  wired into `src/` yet, so today this costs nothing at runtime, but T-051/
  T-052 are about to load them):

  | asset | main | T-053 | ratio |
  | --- | --- | --- | --- |
  | backdrop-colony-cluster | 7,692 B | 225,050 B | 29x |
  | backdrop-crown-horizon | 9,369 B | 413,088 B | 44x |
  | backdrop-gill-cavity | 23,737 B | 374,997 B | 16x |
  | backdrop-limb-segment | 37,776 B | 852,462 B | 23x |
  | backdrop-spine-coil | 31,458 B | 432,482 B | 14x |
  | hull-panel-tile | 1,243 B | 12,125 B | 10x |
  | vent-louver-plate | 2,461 B | 23,916 B | 10x |
  | wear-scuff-overlay | 4,134 B | 11,089 B | 2.7x |
  | weld-seam-strip | 333 B | 8,678 B | 26x |
  | **total** | **118,203 B** | **2,353,887 B** | **~20x** |

  In absolute terms this is still small (largest single file 852KB, all 9
  together ~2.3MB) — not a load-time concern for a laptop-class public URL,
  but a real ~20x jump in disk footprint from this technique, worth watching
  cumulatively as more assets go through it.
- **Texture memory is unaffected.** GPU VRAM for an uncompressed texture is
  set by pixel dimensions (and mip levels), not PNG byte size — since every
  file's W×H is unchanged, wiring these in costs the same VRAM as the flat
  originals would have. The ~20x file-size growth is a disk/network cost
  only, not a texture-memory one.
- **Reproducibility, independently re-run, not inherited**: re-rendered
  `hull-panel-tile.recipe.js` from its committed seed (371232) via
  `render.mjs` against the pinned copy — **sha256-identical** to the
  committed PNG, 20ms in-page. Ran both committed negative-control fixtures:
  `smoke-swatch.recipe.js` → "reproducible: yes — two renders, identical
  bytes"; `nondeterministic.recipe.js` → fails exactly as documented ("the
  same recipe rendered two different images in one run", exit 1, no PNG
  written). All three match the README's claims verbatim.
- **Break/restore, on the live gate**: appended `Math.random()` to
  `hull-panel-tile.recipe.js` (a file untouched by the concurrent edit noted
  above, confirmed clean before and after) → `check.mjs` **FAILed**, naming
  the exact file and line
  ("`hull-panel-tile.recipe.js:299: "Math.random" is not allowed…`"); reverted
  with `git checkout --`, `check.mjs` **PASS** again. `git status --short`
  showed no leftover change from this break/restore afterward.

## 3. Legibility at TRUE on-screen size (evidence: `evidence/qa/`,
`evidence/compare/`) — facts, not a look verdict

- **hull-panel-tile** (authored 2x2 world tiles = 34.8px/copy at the shipped
  FAR view): at true size it reads as a near-flat orange field with visible
  panel-joint grid lines; the bolt row survives only as a faint vertical dot
  smudge per copy. At true size **and** at 3x zoom it shows *less* surface
  detail than the flat-SVG tile it replaces, which had bolder diagonal weld
  marks and a visible dot row at the same on-screen scale
  (`evidence/compare/compare-hull-panel-tile.png`). Since T-052 binds this
  exact file onto large hull surfaces, this is worth a look question for the
  operator: the "painted" route reads flatter, not richer, at this specific
  scale.
- **weld-seam-strip** (4x1 tiles = 69.6x17.4px/copy): true size is a
  featureless brownish bar; bolts, the top chamfer highlight and the
  undercut slat notches only resolve from 4x zoom up.
- **wear-scuff-overlay** (2x2 tiles = 34.8px/copy, ~86% transparent by
  design): true size is effectively imperceptible; individual scuff/scratch
  marks only appear at 4x zoom. Consistent with its stated role as a subtle
  overlay, not a hero surface.
- **vent-louver-plate** (1.5 tiles tall = 26.1px at the shipped FAR view,
  does not tile): at 26.1px it reads only as a plate with a dark recessed
  grille silhouette — individual louvre slats, the broken-louvre detail and
  the acid-green glow bloom only resolve from 2x (52px) up.
- **backdrop-crown-horizon** (60x15 tiles = 1044.7x261.2px true size): spire
  silhouette and the hot-magenta tip accents are legible at true size,
  against a hazier, lower-contrast render than the flat-SVG predecessor.
- **backdrop-limb-segment** (60x30 tiles = 1044.7x522.4px): ladder, hatch
  roundel, panel joints and cable bundles are all legible at true size.
- **backdrop-colony-cluster** (14x7 tiles = 243.8x121.9px): the stated
  human-scale mark (rows of lit windows) stays visible as small lit dots at
  true size.
- **backdrop-gill-cavity** (24x24 tiles = 417.9x417.9px): louvered shutter,
  ladder, walkway rail and rust lip are all clearly legible at true size —
  this asset is large enough on screen that legibility isn't really in
  question.
- **backdrop-spine-coil** (30x30 tiles = 522.4x522.4px): segmented vertebra
  shapes and two lit maintenance-gallery dot-rows are legible at true size.

None of this is a fun/look verdict — see the operator questions below for
where that belongs.

## What I did not evaluate

`assets/manifest.json`'s `generator` field records a mode string
("`--mode raster`") and the seed, not the exact `--brief/--roles/--boards`
codex invocation; that record lives in `tools/assets/runs/spec-<id>.md`,
which is `.gitignore`d (confirmed: `tools/assets/.gitignore` lists `runs/`).
So the *PNG* is provably reproducible from the committed recipe+seed (shown
above), but the specific codex prompt that produced each committed recipe is
not preserved in the repo — only locally, ephemerally. Not a game-effect or
durability defect, so not failing the gate on it, but flagging since the
acceptance box says "exact codex invocation recorded in the manifest" and
that is not quite what's committed.

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: read `tools/assets/.gitignore` (`runs/` ignored) vs `assets/manifest.json`'s `generator` field for any T-053 asset, commit `2f1af45` | evidence: this report, §"What I did not evaluate"
T-053's acceptance box says "generation reproducible with the seed **and
exact codex invocation recorded in the manifest**." The seed half is true and
independently verified (byte-identical re-render). The invocation half is
not: the manifest only stores a generic mode string, and the actual resolved
codex spec (`--brief`, `--roles`, `--boards`, etc.) is written to
`tools/assets/runs/spec-<id>.md`, which is gitignored and was never
committed. A future engineer who wants to know *why* `backdrop-crown-horizon`
was asked for what it was asked for cannot recover that from the repo, only
re-derive a new (nondeterministic) prompt. Fix direction: commit each asset's
resolved spec next to its recipe (e.g.
`assets/generated/backdrops/backdrop-crown-horizon.spec.md`), or add a
`promptRef`/inline `brief` field to the manifest entry.

## I-??? | process | S2 | repro: n/a — observed live in `.claude/worktrees/T-053` during this gate, commit `2f1af45` stayed at HEAD throughout | evidence: this report, §"Process note"
A gate agent found the shared build worktree actively modified (uncommitted)
mid-playtest: `wear-scuff-overlay.{png,recipe.js}`, `manifest.json`,
`render.mjs`, `README.md`, and one `compare-*.png` differed from the reviewed
commit `2f1af45` with no new commit made. `rev53`'s review (`reports/tasks/
T-053/review.md`) approved `2f1af45` and separately noted the worktree was
clean at review time, so this happened after approval. Not a defect in the
approved commit (worked around by gating an isolated pinned copy instead),
but if that local work is valuable it should be committed and re-reviewed
rather than left to be silently lost or picked up by an unrelated future
session in the same worktree.

## Operator checkpoint queue

Nothing here needs an operator look-decision on its own — T-053 is a
harness/tooling change with no shipped-game effect yet. The look question
that matters (does the painted route actually read better than the flat
route it replaces, hull-panel-tile's apparent detail loss at scale
notwithstanding) is already correctly deferred to whichever of T-051/T-052
actually wires these into a running scene; judge it there, against a real
camera, real fog and real lighting, not against this pipeline's flat
composite.

## Commands (reproduce this verdict)

```sh
# pin an isolated copy of the exact reviewed commit
git worktree add /tmp/hb-t053-pin 2f1af45
node tools/serve.mjs 8760 --root /tmp/hb-t053-pin --quiet &
node tools/pathcheck.mjs           # run inside /tmp/hb-t053-pin: 2469 passed, 0 failed
node tools/assets/check.mjs        # run inside /tmp/hb-t053-pin: PASS

# zero-effect baseline
git worktree add /tmp/hb-t053-base 9cc80f7
node tools/serve.mjs 8761 --root /tmp/hb-t053-base --quiet &
diff -rq /tmp/hb-t053-pin/src /tmp/hb-t053-base/src   # exit 0
diff /tmp/hb-t053-pin/index.html /tmp/hb-t053-base/index.html   # exit 0

cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8760 --out /tmp/t053-mid-route
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8760 --out /tmp/t053-transform-slice
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8761 --out /tmp/baseline-mid-route
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8761 --out /tmp/baseline-transform-slice

# reproducibility + negative controls
cd /tmp/hb-t053-pin/tools/assets
node render.mjs assets/generated/textures/hull-panel-tile.recipe.js --out /tmp/hpt.png --base-url http://127.0.0.1:8760
shasum -a 256 /tmp/hpt.png assets/generated/textures/hull-panel-tile.png   # matches
node render.mjs tools/assets/fixtures/recipes/nondeterministic.recipe.js --base-url http://127.0.0.1:8760   # exit 1, no file

# true-size legibility captures
node tile.mjs assets/generated/textures/hull-panel-tile.png --tiles 2 --repeat 4x4 --base-url http://127.0.0.1:8760 --out reports/tasks/T-053/evidence/qa/tile-hull-panel-tile.png
node view.mjs assets/generated/textures/vent-louver-plate.png --tiles 1.5 --base-url http://127.0.0.1:8760 --out reports/tasks/T-053/evidence/qa/view-vent-louver-plate.png
```

Evidence: `reports/tasks/T-053/evidence/playtest-runs/{t053,baseline}-{mid-route,transform-slice}/`,
`reports/tasks/T-053/evidence/qa/`, `reports/tasks/T-053/evidence/compare/`.
