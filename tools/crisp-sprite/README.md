# `tools/crisp-sprite/` — measuring the crisp sprite path (T-123)

decisions.md entry 27: every atlas-drawn actor (RIG, hostiles, pickups) is
drawn unlit at full gain, nearest-neighbour, mip-free, on the device pixel
grid, at a density chosen per device. The path itself is
`src/render/crisp-sprites.js` (GPU) and `src/pure/crisp-sprite.js` +
`src/pure/render-budget.js` (arithmetic, asserted in
`tools/pathcheck/t-123-crisp-sprite.mjs`). These tools measure what a player
would see; none of them changes the game.

| file | what it does |
|---|---|
| `lib.mjs` | Shared boot: an isolated headless Chrome context at a named view (`desktop` 1280x720@1, `phone` 844x390@2, `phone3` 844x390@3, `portrait` 390x844@3, `spikephone` 844x518@2 — the T-109 spike's proxy for the phone framing). Raises `src/render/preload.js`'s two boot budgets and `src/render/post.js`'s composer budget **at the route layer** (the served files differ only in those constants) so a slow host loads every atlas and keeps the shipped composed path; `--direct` keeps the shipped composer budget. Optional `--three-dir` serves the three.js CDN files from a local byte-identical copy. |
| `capture.mjs` | The T-109 spike's method on the real scene: a frozen, paused frame per pose (idle, run, jump, aim up-right, firing, facing left) shot three ways — with RIG, without RIG, without his gun — plus the live projection of his sim point and the renderer facts the no-resample box is judged on (`pixelRatio`, canvas vs css x dpr, compositor scale, composer status). `--probe` runs the **grid probe**: one `renderFrame()`, the canvas read back immediately, every drawn crisp actor's pixels compared 1:1 with its device-resolution tile at the rectangle the pure helper gave it, its anchor re-projected by the probe itself and snapped by the pure helper; then again with each falsifier injected (a half-pixel quad offset, a half-pixel figure offset) and restored. `--actors` adds a five-kind hostile lineup and two pickups, frozen once materialized, shot with and without every crisp actor (and probed). Works on `?art=legacy` and on a pre-T-123 tree (RIG hidden by the spike's render-layer trick there). `--no-gunless` skips the gun-hidden shot (today's path is then measured against column A's gun mask at the same placement, as the spike measured "today"). `--falsify lit` serves the crisp path with the lit material restored (the tile pass's unlit patch removed, the light rig enrolled on its layer — route layer only) so the gain gate can be shown red. `--direct` keeps the shipped composer budget, i.e. the direct (no-composer) path on this host. |
| `reference.mjs` | The spike's column A rebuilt for today's art: every RIG layer the game draws (T-103's `tools/rig-grip/raster.mjs` placement math, plus the R gun's accent plates) composed at 16x the live device density recorded by `capture.mjs`, area-reduced once (premultiplied, sRGB-encoded box, 50% alpha cut), sim point on a pixel edge. The reference for "gain vs its atlas". |
| `legacy-equivalence.mjs` | `?art=legacy` against the pre-T-123 tree: per view, BASE, LANE`?art=legacy`, BASE again (the cross-boot noise floor) and LANE default (the control that proves the comparison can see the crisp path), each paused inside the frame callback the first time `gameMs` reaches `--tick-ms` under `?fixeddt=16.667`, then one `renderFrame()` read back with `gl.readPixels`. Writes the four frames and `equivalence.json` (pixels differing, max channel delta). |
| `cost.mjs` | Frame cost, interleaved variants (e.g. base tree, crisp, `?art=legacy`) at the same views, under the decisions.md entry 18 stress path (`tools/playtest/sprite-stress.mjs`'s load: 12 clone shots per frame saturating the 256-slot pool, a death burst per frame, ten hostiles kept alive): `HB.perf()` avg/worst/over20ms and 15 isolated `renderFrame()` draws bracketed by `gl.finish()`. |

```sh
node tools/serve.mjs 8804 --root <lane tree> --quiet --keep-orphan   # never 8741/8742
node tools/crisp-sprite/capture.mjs --base-url http://127.0.0.1:8804 --out /tmp/cap \
  --views desktop,phone --probe --actors
node tools/crisp-sprite/capture.mjs --base-url http://127.0.0.1:8804 --out /tmp/cap-legacy \
  --views desktop,phone --query art=legacy
node tools/crisp-sprite/reference.mjs --capture /tmp/cap/desktop/capture.json
node tools/crisp-sprite/capture.mjs --base-url http://127.0.0.1:8804 --out /tmp/cap-lit \
  --views desktop --poses idle --no-gunless --falsify lit          # the gain falsifier
node tools/crisp-sprite/legacy-equivalence.mjs --out /tmp/equiv --views desktop,phone \
  --base http://127.0.0.1:8805 --lane http://127.0.0.1:8804
node tools/crisp-sprite/cost.mjs --out /tmp/cost.json --views desktop,phone,phone3 \
  --variant base=http://127.0.0.1:8805 --variant crisp=http://127.0.0.1:8804 \
  --variant legacy=http://127.0.0.1:8804?art=legacy
```

The image metrics (gain, silhouette-edge visibility, gun-edge contrast) are
the T-109 spike's own `tools/art/spike/measure.py` (`stats`, `today_mask`,
the eroded-mean gain) applied to these captures; that module lives on
`task/T-109` until T-124 lands `tools/art/` on main, so it is imported, not
copied.

## Honesty / limitations

- **No GPU here.** SwiftShader rasterizes on a CPU shared with other lanes:
  boots take 1-5 minutes and one full-scene frame tens of seconds at load
  70-95. So `capture.mjs` holds the game's own loop while it shoots
  (`lib.mjs` holdLoop: `document.hidden` reads true for `src/main.js` only,
  no visibility event fires) and draws exactly one `renderFrame()` per shot,
  and `legacy-equivalence.mjs` makes `renderer.render` a no-op during the
  run-up to its tick (every variant alike; the sim never reads the
  renderer) and draws only the compared frame. Cost numbers are only
  comparable inside one `cost.mjs` run; the drawing-pixel ratio is the
  hardware-independent part. Nothing here measures an iPhone.
- **The freeze is not play.** Captures stage RIG on a fixed deck spot with the
  scroll pinned and hostiles cleared (or a fixed lineup), then pause; frames
  are comparable, not representative of a run in motion.
- **The budget raise is a host workaround.** On a device the boot gate's
  2.5 s / 6.5 s budgets and the composer's 1.2 s budget are what ship; here
  they are raised so the measurement is of the real art and the real
  composed path instead of their fallbacks.
- **`reference.mjs` is a reconstruction.** It follows crisp.py's method
  (compose high, reduce once, cut at 50%) through T-103's placement code; the
  in-game path is separate GPU code, so agreement is evidence. Nearest-texel
  sampling at 16x the device density is its prefilter, not LANCZOS.
- **The grid probe compares what it can.** Texels the bloom ceiling holds
  under the bloom threshold are counted, not compared; off-screen tile
  texels are skipped; a bright effect blooming over an actor would show up
  as mismatches (the probe stages none).
