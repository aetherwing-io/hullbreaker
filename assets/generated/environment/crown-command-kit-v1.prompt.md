# Crown command kit v1

Generated with OpenAI ImageGen on 2026-08-03.

Source image:

- `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-58d94349-f4c1-47e4-a226-6de6c07d27bd.png`

References:

- `docs/concept-art/04-six-phase-escalation.png`
- `/private/tmp/hullbreaker-crown-finale-v3/desktop-approach-production.png`

Prompt:

> Create a production-ready 2D modular sprite atlas for the final Crown transmitter structure in the side-view sci-fi action game Hullbreaker.
>
> ART DIRECTION
> - Match the reference concept art's dense, painterly, industrial-mechanical ship detail, oxidized copper armor, blue-black steel recesses, magenta infection energy, tiny warm maintenance lights, pipes, ribs, vents, cables and believable structural weight.
> - Preserve the current game's tiny-player / giant-machine scale, but radically upgrade the crude blocky Crown shown in the second reference.
> - The Crown must feel like Meridian's internal command organ growing out of the hull: part cathedral antenna, part armored machinery, part infected nervous system.
> - Sharp readable silhouettes at normal gameplay scale. No UI, no labels, no text, no characters, no enemies, no standalone platform floor.
>
> LAYOUT — exact 2x2 atlas on a 2048x2048 canvas, one isolated component centered in each 1024x1024 cell:
> TOP LEFT: CENTRAL ARMORED COMMAND CORE. Tall tapered blue-black steel/copper machinery, recessed circular iris cavity with several concentric mechanical shutters visible deep inside, thick armor shoulders, vents, cable sockets, asymmetrical damage. Front-facing side-game presentation, slight 3/4 surface detail but no perspective floor.
> TOP RIGHT: UPPER ANTENNA / SIGNAL CROWN. Cluster of one tall central spire plus asymmetric smaller antennae, articulated signal rings/halos, collars, receiver dishes, conduits, glowing magenta nodes. Must visibly attach at its bottom to the core.
> BOTTOM LEFT: LEFT ROOT ASSEMBLY. Wide tapering armored root that grows from the summit plating up toward the core: overlapping copper shells, blue-black underframe, braces, pistons, exposed cable bundles, torn/infected seams. Its far-left end should terminate irregularly into hull armor and its upper-right end should attach to the core.
> BOTTOM RIGHT: RIGHT ROOT ASSEMBLY, distinct and asymmetric: wider maintenance gantry, conduits, broken armor, secondary receiver hardware, internal magenta infection veins. Far-right termination irregular, upper-left attachment to core.
>
> TECHNICAL
> - Pure flat chroma-key background RGB #00FF00, no gradients, shadows, texture, or glow painted into the green background.
> - Generous 80px safe margin around every cell boundary; no component crosses or touches its cell boundary.
> - No checkerboard, no transparency preview pattern, no frames, borders, captions, callouts, arrows, or guides.
> - Each component must be fully visible, uncropped, isolated, and non-overlapping.
> - Lighting: cool teal ambient from behind, warm copper edge light from below/front, restrained magenta emissive limited to infection/signal anatomy.
> - High-frequency detail should be clustered into bold medium-scale masses so it survives minification.
> - Keep all four components in one consistent material/perspective/lighting language and make attachment interfaces visually compatible.
> - The result should look like finished premium game art, not concept thumbnails or simple vector shapes.

Finishing:

- ImageGen returned a 1254×1254 RGB atlas rather than the requested 2048×2048 size; the native pixels were preserved without resampling.
- Chroma key removed with the ImageGen skill's `remove_chroma_key.py`: `#00ff00`, soft matte, transparent threshold 42, opaque threshold 150, edge feather 0.6, edge contract 1, and spill cleanup.
- Output is a 1254×1254 RGBA PNG. The runtime treats it as a 2×2 atlas with 627×627 source cells.
- Production derives `crown-command-kit-runtime-v2.png` once with a Lanczos
  resample to 1024×1024. Runtime cell geometry maps its four 512×512 cells from
  the single power-of-two atlas upload; no canvas crop or duplicate texture is
  created during play.
- The deterministic palette finisher
  `tools/assets/normalize-painted-palette.mjs` then neutralized 37,250 visible
  pixels (3.5524% of the runtime image; mean blend 0.2855) just far enough to
  enter the six-role project palette. Alpha and every compliant source pixel
  remain byte-identical. The isolated asset gate reports 100% in-band and
  0.0000% alien pixels.
