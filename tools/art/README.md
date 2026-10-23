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
