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
4. **Judge at true size** — RIG is 32.5 px tall at FAR on a 1280x720 desktop (16.24 px/tile, measured) and ~6% of
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
source URL, author, licence and sha256 in `tools/art/spike/cc0.json` and in the
manifest entry's `generator`/`notes` (the manifest schema has no `provenance`
field; `tools/assets/lib/manifest.mjs` rejects unknown fields). Raw downloads are working material: commit only what the game loads,
processed into the house palette and pixel scale, never a photo texture
pasted onto the hull (entry 14's value ladder and the pixel material still
govern the look).

## RIG v3: the CC0 soldier in the boards' colours (T-124)

Decisions entry 27 picked the spike's B/D -- Irondust's CC0 soldier,
toon-reduced by this pipeline -- recoloured from white to the concept boards'
khaki/rust, and "Free CC0 models + pipeline" for RIG and every enemy. The
primitive-built v2 builder of T-109 phase A is gone (entry 26); its
`tools/art/lib` helpers were trimmed to what this route uses. One command
builds every shipped file:

    /opt/hb-art/bin/python -I tools/art/build_rig_v3.py                 # sources -> sim -> palette -> render -> post -> pack -> check
    /opt/hb-art/bin/python -I tools/art/build_rig_v3.py --falsify S     # + the anchor check's negative control
        [--jobs 1|2|3|5] [--build <dir>] [--out <dir>] [--keep]

Run it under `nice -n 15` on a shared host. Sources live in the git-ignored
`tools/art/build/cc0/` unless `HB_ART_CC0=<dir>` points elsewhere (every
script reads the same variable). Build time: see `reports/tasks/T-124/build.md`.

| Path | Role |
|---|---|
| `build_rig_v3.py` | the one command (steps in its docstring); prints every output's sha256 |
| `rig/poses.py` | the frame inventory -- every state `src/render/player.js` draws x every aim the sim can produce there (71 poses per gun) -- the pose library, the loader's `CLIPS` and mirror rule |
| `rig/guns.py` | the five chassis (R Bullpup_3, S Shotgun_ShortStock, L SniperRifle_4, H SubmachineGun_1, F Bullpup_2): grip/support points, scale so the grip sits on the sim's hand socket, cross-section exaggeration, barrel boost, identity part |
| `rig/render.py` | Blender: the soldier + pack + guns; the gun placed FIRST on the sim's shot line (bore through `(0, muzzleY)`, muzzle `barrelTiles` along the aim), the body solved around it (analytic IK + a fixed, ordered reach search; an unreachable hand is a build error); three packed Cycles passes per frame (`id`: object/region/zone, `nrm`, `aod`: AO + depth) on one 280.8 px/tile grid; anchors exported in tiles |
| `rig/post.py` | the spike's D reduction: samples binned to each density's pixels, weighted-majority material family, 4 tones from the game's key light + AO, cool rim, depth lines, the scripted tidy rules, the 1 px ink outline |
| `rig/board_palette.py`, `rig/palette_v3.py` | the palette MEASURED from boards 01/13 (k-means of RIG's pixels in fixed boxes, nearest-pixel coordinates; a stated rule for the rust plates) + the game's own accent tokens; the build re-measures the boards and fails if a swatch moved |
| `rig/pack.py` | one indexed-PNG atlas per density + ONE JSON naming every frame once |
| `rig/check.py` | the anchor check on the shipped pixels (below) |
| `rig/manifest.mjs` | the manifest entries, computed with the asset gate's own library (`tools/assets/lib`) |
| `rig/packet.py` | today vs v3 at true size on the real captured frame (`spike/scene_capture.mjs`), the measurements, the run-cycle GIF, the inventory and falsification sheets |

**Outputs** (`assets/generated/sprites/`): `rig-v3-d16.png`, `rig-v3-d23.png`,
`rig-v3-d35.png`, `rig-v3.json`. Not wired into the game: phase 2 waits for
T-123's crisp path.

**Densities** (native renders, never resampled; RIG's FAR px/tile scales with
the viewport height, 0.02256 x css height, times the DPR):

| id | px/tile | RIG (2 tiles) | integer-scale screens |
|---|---|---|---|
| d16 | 16.2419 | 32.5 px | x1 1280x720 desktop FAR at DPR 1 (measured); x2 a 720 css-tall window at DPR 2 or 1440 tall at DPR 1; x3 2160 tall |
| d23 | 23.4 | 46.8 px | x1 the phone landscape frame (RIG 6% of 390 css px, T-107) at DPR 2; 1920x1080 FAR wants 24.4 (d23 draws RIG 4% small there) |
| d35 | 35.1 | 70.2 px | x1 the same phone frame at DPR 3 (the operator's iPhone) |

**JSON** (`rig-v3.json`): `frames` lists the 355 keys (`<gun>:<pose>-<aim>`)
ONCE; frame i is cell i of every density's atlas (`x = (i % columns) *
cell.w`, `y = floor(i / columns) * cell.h`). `anchors` (`muzzle` = the sim's
shot origin, `drawnMuzzle`, `hand`, `handL`, `support`, `socket`, `grip`,
`head`, `footR`, `footL`) are in tiles from the sim point, density-independent:
`px = origin + (x, -y) * pxPerTile`. `lhand` says where the far hand is (`gun`,
`rung`, `rest`). `densities` carries each atlas's `pxPerTile`, `image`, `size`,
`cell`, `origin`, `columns` and the screens it serves. `clips` maps the game's
states to poses and aims; `mirror` states the facing rule (cells face +x;
mirror when the gun points left, or for a vertical aim when facing is -1).

**The anchor check** (`rig/check.py`, run by every build on the shipped files):
(1) post's part map, re-coloured, equals the atlas cell byte for byte; (2) the
gun pixels on the bore axis end within 1 px of the exported `drawnMuzzle`;
(3) the exported muzzle equals the shot origin recomputed from
`src/config.js` (`CONFIG.player.muzzleY`, `barrelTiles`, `CONFIG.crouch.muzzleY`)
and `RIG_RECOIL_TILES`. `--falsify S` re-renders gun S with its MESH 0.15 tiles
down the bore (anchors unmoved) and confirms only when exactly S's frames fail.
It caught two real defects while v3 was built: straight-down guns ran behind
the near leg (1-24 px short) until render.py drew them in front
(`GUN_DEPTH_BY_AIM`), and at d16 the SMG's sub-pixel barrel stub lost its
muzzle pixel to the knee beside it until post.py let gun parts win a
contested pixel (majority weight 2.0).

**Limitations, stated plainly.**
- Byte-reproducibility is proven on this host only (two clean builds, same
  sha256 -- `reports/tasks/T-124/build.md`). Cycles on another CPU or Blender
  build may move pixels; compare hashes before trusting a build made elsewhere.
- The 1 px tolerance: a diagonal barrel's last pixel reaches up to 0.71 px
  past its centre line.
- The cells are palette-exact UNLIT pixels; today's lit material + ACES would
  darken them (the spike measured gain 0.81/0.76/0.62). They are meant for the
  crisp path (T-123): unlit, nearest, mip-free, snapped to the device grid.
- The sim fires from the hip (53% of RIG's height); every gun is held there.
  The boards hold the rifle at the shoulder -- a sim decision, not an art one.
- In motion the 105 ms firing kick is not drawn (stand-fire frames carry it
  standing); a strafe backpedal plays the run cycle backwards (loader rule).
- Crouch (`?crouch=1`) fires from 0.45 tiles: long magazines dip up to 0.2
  tiles under the deck line, as today's gun plane does there.

## The A2 art spike (T-109): CC0 model -> toon -> pixels, judged on the real scene

After the operator rejected the primitive-built v2 look (decisions.md entry
26), the spike compares, at true size on the real game background: today's
painted art drawn crisp (A), a professionally modelled CC0 character through
this pipeline with a toon reduction (B), and B plus a scripted 1x tidy pass
(D). Evidence and the operator packet: `reports/tasks/T-109/spike.md`.
Nothing here is loaded by the game.

    /opt/hb-art/bin/python -I tools/art/spike/fetch_cc0.py                  # CC0 sources, sha256-checked
    node tools/art/spike/scene_capture.mjs --view desktop                   # real scene + today's art in it
    node tools/art/spike/scene_capture.mjs --view phone
    /opt/hb-art/bin/python -I tools/art/spike/crisp.py --ppt <p> --out tools/art/build/spike/a-<view>
    /opt/hb-art/bin/python -I tools/art/spike/v3_render.py --ppt <p> --out tools/art/build/spike/b-<view>
    /opt/hb-art/bin/python -I tools/art/spike/v3_post.py --src tools/art/build/spike/b-<view> --out tools/art/build/spike/post-<view>
    /opt/hb-art/bin/python -I tools/art/spike/wasp_v3.py --ppt <p> --out tools/art/build/spike/wasp-<view>
    /opt/hb-art/bin/python -I tools/art/spike/compose.py --view <view>      # sheets -> reports/tasks/T-109/spike/
    /opt/hb-art/bin/python -I tools/art/spike/measure.py --view <view>      # numbers -> measure-<view>.json
    /opt/hb-art/bin/python -I tools/art/spike/packet.py

`<p>` is the device px per tile `scene_capture.mjs` measured (desktop
1280x720: 16.24; phone frame: 2 x 11.70 = 23.39).

| Script | Role |
|---|---|
| `spike/cc0.json`, `fetch_cc0.py` | the CC0 sources (author, page, licence, sha256, members used); downloads into git-ignored `build/cc0/` |
| `spike/scene_capture.mjs` | the real scene: raises `preload.js`'s boot budget at the ROUTE layer so every atlas loads on this slow host, freezes the scroll/hostiles/player each frame from a rAF hook, hides RIG by moving his group to render layer 31, screenshots the RIG-free frame and today's RIG per pose, records live projections |
| `spike/crisp.py` | candidate A: today's atlases + gun cutout + accent plates assembled like `src/render/player.js`, area-downsampled once to device px, 50% alpha cut, unlit |
| `spike/v3_render.py` | candidate B render: Irondust's CC0 soldier + quaternius' CC0 Bullpup on the sim's shot line, analytic IK with a reach search (a hand that cannot reach the gun is a build error), data passes in Cycles at 8x |
| `spike/v3_post.py` | B and D: families from texture zones and bone regions, 4-tone toon from the game's key light, majority reduction, depth lines, ink outline; D adds the scripted tidy rules |
| `spike/wasp_v3.py` | the wasp from MikeMoon's CC0 rigged hornet through the same reduction |
| `spike/compose.py`, `measure.py`, `packet.py` | true-size composites on the captured frames, the numbers, the packet |

Limitations, stated plainly:
- Candidates are composited 1 texel = 1 device px. Today's renderer does not
  draw sprites that way (lit material + ACES, mipmaps, a 1.25x desktop canvas
  downsampled by the browser, 2.14-2.2x on phones); A shows how much of
  today's softness is that path. B/D in the game need a phase-B draw path
  (unlit, nearest, snapped to the device grid, density per device).
- The phone frame is the FAR shot at the phone density, centre-cropped to
  844x390 CSS: the in-flight T-107 lens is that crop optically; its small
  camera lift is not modelled. The capture's canvas ratio (2.139) is close to
  a real 844x390 phone's (2.2), not equal.
- B's look is bounded by its base mesh: a slim CC0 cyber-soldier exaggerated
  in code (bigger helmet, hands and gun; shorter legs), not a model designed
  for a 32 px marine. The sim's hip-height shot line (53% of RIG's height)
  forces a hip hold; boards 01/13 hold the rifle at the shoulder.
- Reproducibility, on this host only: two clean B/D builds at desktop
  density gave byte-identical final PNGs (14/14) and pixel-identical Cycles
  passes (the pass PNG files differ only in Blender's embedded render
  metadata). Cycles runs at 1 spp, fixed seed, AO 16 samples; another CPU or
  Blender build may move pixels — compare hashes before trusting a sheet
  built elsewhere.
