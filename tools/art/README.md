# Art toolchain (dev-only)

Opened by `docs/decisions.md` entry 22. Everything here produces files that the
game loads at runtime under entry 16's contract (an asset may fail; the game
degrades visibly and safely, and the sim never branches on it). Nothing here is
a dependency of the game, and there is still no build step.

## What is installed

| Tool | Use | How to run |
|---|---|---|
| Blender 5.2 LTS as a Python module (`bpy`) | Model, rig, pose and render characters, enemies, kit pieces and backdrop anatomy; export per-frame anchor data | `/opt/hb-art/bin/python your_script.py` |
| Pillow, NumPy, OpenCV (headless) | Pixel-art post-processing (downscale, palette quantize, outline, dither), packing, measuring | same interpreter |
| `rsvg-convert` (librsvg) | Crisp vector UI: touch buttons, HUD glyphs, icons, logo | `rsvg-convert -w 256 in.svg -o out.png` |
| ImageMagick, ffmpeg | Contact sheets, GIF/MP4 from captures | `convert`, `montage`, `ffmpeg` |

Set up a fresh cloud container with `bash tools/orch/cloud-setup.sh` (installs
the Mesa EGL/GL libraries Blender needs, `librsvg2-bin`, and the venv from
`requirements.txt`).

### Limits on this host (no GPU)

- Render with **Cycles on CPU** (`scene.cycles.device = 'CPU'`, low samples
  plus denoise) or **Workbench** (flat/studio shading, fastest). **EEVEE does
  not work here** — it hung in the 2026-10-22 smoke test. A 128x128 Cycles
  frame at 16 samples took ~4.5 s on a loaded 4-core host; batch frames, keep
  sprites small, and never render at final screen size x8 "just because".
- No image-generation model is installed. CPU diffusion is possible through
  Hugging Face but slow and stylistically inconsistent — the very property
  that put guns beside RIG's hands instead of in them. Prefer geometry.

## Why 3D -> sprite for anything that animates

AI-painted frames do not share a skeleton, so the hand, the gun and the feet
drift from frame to frame. A rigged model rendered through a fixed
orthographic camera cannot drift: the weapon is parented to the hand bone, and
the pipeline exports where the hand, muzzle and feet project in every frame.
The game consumes that JSON instead of hand-authored anchors.

Rules for any 3D-sourced sprite:

1. **Orthographic camera, fixed per sheet**, framed so one world unit maps to
   a known pixel count. Record it in the sheet's JSON.
2. **Export anchors per frame** (`world_to_camera_view` on bone heads/empties):
   at least `hand`, `muzzle`, `feet`, plus whatever the sim needs. The game
   reads them; nobody re-types them.
3. **Pixel post-processing is code**, versioned next to the render script:
   render at 2-4x, downscale with a known filter, quantize to the palette
   (`src/render/palette.js` roles, `docs/DESIGN.md` <=8-colour rule), add the
   1 px outline if the look calls for it. Same input, same pixels.
4. **Judge at true size** — RIG is ~30 px tall at FAR on desktop and ~6% of
   screen height on phones (entry 20 addendum). A sheet that reads at 4x and
   smears at 1x fails. Show both in every contact sheet.
5. **Every look change is the operator's call.** Ship a new look behind an
   A/B flag with the current art as the control, plus a contact sheet and a
   3-5 question packet. It becomes the default only on a verdict (entry 16).

## Third-party assets

**CC0 / public domain only.** Reachable from this host: ambientCG
(`ambientcg.com`, CC0 PBR materials), Poly Haven (`api.polyhaven.com`, CC0
textures/HDRIs/models), Kenney (`kenney.nl`, CC0 game kits). OpenGameArt hosts
mixed licences — take only items marked CC0. Record every imported file's
source URL, author and licence in `assets/manifest.json` (`provenance`
field). Raw downloads are working material: commit only what the game loads,
processed into the house palette and pixel scale, never a photo texture
pasted onto the hull (entry 14's value ladder and the pixel material still
govern the look).

## The 3D -> sprite pipeline (T-109)

One command builds RIG (all five guns) and the wasp from primitives in code:

    /opt/hb-art/bin/python tools/art/build.py            # render + post + check, prints sha256s
    /opt/hb-art/bin/python tools/art/build.py --falsify  # proves the anchor check binds

| Path | Role |
|---|---|
| `rig/model.py` | RIG: skeleton (bones), low-poly body parts, five guns (`R S L H F`) in gun-local space, grip/foregrip points, `MUZZLE_X = 0.82` |
| `rig/pose.py` | Pure-numpy pose solver + the frame inventory. The gun is placed FIRST on the sim's shot line (`CONFIG.player.muzzleY`, `barrelTiles`); the right hand bone is the gun frame times a fixed grip offset; analytic two-bone IK reaches the arms and legs; a fixed, ordered search nudges pelvis/lean until every limb reaches (an unreachable hand is a build error) |
| `rig/render.py` | Blender driver: armature, parts parented to bones, guns parented to `hand.R` with `grip.*` / `muzzle.*` / `foregrip.*` empties; renders ID maps; projects the evaluated empties for anchors; asserts Blender's evaluated hand/gun equal the solver's |
| `wasp/model.py`, `wasp/render.py` | The wasp: thorax/head/3-joint abdomen/4 wing bones; idle, 4-phase cruise, dive-lock, 2 dive, hit |
| `lib/bl.py` | Workbench/FLAT/no-AA/no-dither render setup, ID materials, low-poly mesh builder, per-face cel banding, armature + bone parenting, pose writer |
| `lib/pixel.py` | Weighted-mode downscale, despeckle, palette LUT, 1 px ink outline, grid packer, hand-rolled indexed PNG writer |
| `lib/palette.py` | Swatches parsed from `src/render/palette.js` (CONCEPT) and `src/config.js` — no hex is invented here |
| `post.py` | ID maps -> palette atlas PNG + compact anchor JSON + a dev part-ID atlas (for the check) |
| `check_anchors.py` | Drawn muzzle / sting pixel vs exported anchor, <= 1 px, on the shipped pixels |
| `capture/current-art.mjs` | Captures the CURRENT art in the live game (+ the measured px/tile) for comparisons: `node tools/art/capture/current-art.mjs [--only desktop\|phone] [--wasp-only \| --climb-only] [--port N]` (own server; `--port 0` = OS-assigned; `--wasp-only` re-takes the wasp crops into `current-art-wasp.json`; `--climb-only` re-takes the four ladder phases and merges them into `current-art.json`) |
| `sheets.py` | Contact sheets: current vs v2 at true size and 4x, the v2 frame inventory, the five guns, the anchor falsification |
| `measure.py` | Numbers behind the comparison (size, colours, value steps, contrast vs background) -> `reports/tasks/T-109/measurements.json` |
| `preview.py` | Iteration helper (not part of the build) |

**Rendering contract.** Workbench with FLAT lighting, AA off, dither 0, and ID
colours instead of palette colours: every rendered pixel is exactly one
material's (class, light band) or empty. The light band is chosen per face in
Python from the evaluated world normal against one fixed key light — a
deterministic cel shade — so the render has no sampling noise at all. The
pixel post downscales 8x by weighted MODE (no colour blending), despeckles
single-pixel band noise inside the body only, maps IDs to the house palette,
adds a 1 px `capsuleInk` outline, packs a power-of-two grid, and writes an
indexed PNG with a hand-rolled encoder (no metadata, no timestamps).

**Densities.** `far` = 18 px/tile (`capture/current-art.mjs` measured 18.065
px/tile at 1280x800 FAR: RIG's 2.0-tile visual height is 36.1 CSS px, 4.5% of
the height — older docs' "~30 px" predates the 2.0-tile sprite);
`phone2x` = 23.4 px/tile (entry 20 addendum: 6% of a 390 px landscape height,
at DPR 2). Each density is a native render + pixel post, not a resample.

**Outputs** (`assets/generated/sprites/art-v2/`): `rig-v2-{far,phone2x}.png|json`
(300 frames = 60 poses x 5 guns), `wasp-v2-{far,phone2x}.png|json` (9 frames).
JSON per frame: atlas rect, state/aim/gun, and anchors in cell pixels
(`hand`, `handL`, `muzzle`, `head`, `footR`, `footL`; wasp `sting`,
`stingBase`, `eye`, `head`, `wingRoot`), plus `origin` (the sim point) and
`pxPerTile` so tiles = `((x - origin.x) / pxPerTile, (origin.y - y) / pxPerTile)`.
Authored facing +x; facing -1 is a horizontal flip about `origin.x`.

**The anchor check.** On the shipped pixels: (1) the PNG must equal
palette(part-ID atlas) exactly; (2) the drawn gun pixels on the bore axis end
within 1 px of the exported muzzle anchor; (3) the exported muzzle is compared
with the simulation's own shot origin computed from the JSON's `sim` block.
`--falsify` moves gun S's mesh 0.1 tiles (1.8 px) down its barrel while its
empties stay, and the wasp's sting likewise; the build only reports
CONFIRMED when the check fails on exactly those frames.

**Limitations, stated plainly.**
- Byte-reproducibility is proven on this host (two clean builds, identical
  sha256). Workbench rasterizes on Mesa llvmpipe; a different Mesa or bpy
  version may move edge pixels. Rebuild and compare hashes before trusting a
  sheet built elsewhere.
- The anchor tolerance is 1 px because a pixel-art barrel end is quantized:
  a diagonal barrel's last pixel overshoots its true end by up to ~0.87 px.
- The atlases are palette-exact UNLIT pixels. In today's renderer RIG is a lit
  `MeshStandardMaterial` under ACES, which darkens it (the contact sheets show
  an approximate "lit" panel); which material v2 uses is a phase-B call.
- `capture/current-art.mjs` stages only sim state (player row, aim, weapon,
  ladder, a spawned wasp with its `enterUntil` in the past), runs the game at
  `?fixeddt=16` so a slow host advances the sim 16 ms per frame instead of
  skipping, aborts large atlases that cannot appear in the crops so RIG's and
  the wasp's own art survive the 2.5 s boot budget (`--wasp-only` aborts the
  scene's backdrops too, so its crops show flat fallbacks behind the wasp),
  rewinds the scroll with the sim's own setter, climbs the ladder with the
  sim's own climb key (aim held up; the renderer's phase is distance-driven,
  so a phase needs 4-10 rendered frames), and crops at device pixels
  through Playwright's `page.screenshot({ scale: 'device' })`. (A raw DevTools
  `Page.captureScreenshot` with a clip resets the context's device-metrics
  emulation on the game page — `devicePixelRatio` 2 -> 1 after the first
  capture — so later "2x" crops are upscaled DPR-1 renders. Don't use it for
  DPR > 1 evidence.)
  The RIG-free background is the same clip re-shot with RIG stepped 4 tiles
  right (the camera follows the scroll cursor, not RIG). Hiding RIG with the
  i-frame blink was tried first and is unreliable: a slow screenshot lands
  on a random blink phase. Air and climb crops have no RIG-free background,
  so the sheets put v2 on a flat patch there.
  The camera still drifts a few px between a staged pose and its screenshot;
  `sheets.py` measures that drift by image registration. Each label records
  `bodyFrame` / `canvasFallback` / the sim aim, and `sheets.py` pairs each
  crop with the v2 frame for the aim it recorded; a label that times out is
  listed in `errors` and skipped. It took ~1 min per crop at DPR 1 and
  2.5-5 min per crop at DPR 2 on a 4-core host at load 25-48.
