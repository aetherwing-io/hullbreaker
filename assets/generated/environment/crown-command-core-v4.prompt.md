# Crown command core v4

Generated with OpenAI ImageGen on 2026-08-03.

Production asset:

- `assets/generated/environment/crown-command-core-v4.png`

Source image:

- `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-f8516d98-a835-4521-b28d-af82ffbf5b57.png`

References:

- `docs/concept-art/04-six-phase-escalation.png`
- `docs/concept-art/13-human-scale-monster-climb-grammar.png`
- `docs/concept-art/14-vertical-assault-level.png`
- `assets/generated/sprites/crown-warden-v1.png`

Prompt:

> Create one self-contained Meridian Crown command-core machinery asset for the
> finale of a fast side-view platform shooter. It is the recessed internal
> machine housed behind separate procedural armor, not a whole level,
> background panorama, floor, or platform. Make a tall, tapered, asymmetrical
> industrial transmitter grown into a colossal mechanical-kaiju hull, with a
> deep central multi-ring iris, nested turbines, coil windings, bus bars,
> shutter vanes, recessed gears, cable bundles, torn scute armor, organic root
> conduits, uneven antennas, and one broken shoulder. Use painterly dark iron,
> warm rusted bronze, worn ivory ceramic, teal-shadow steel, and restrained
> magenta control energy. Match the Warden's material fidelity and the concept
> art's organic-mechanical integration. Center the complete tall 3:4 silhouette
> with generous padding. No characters, weapons, text, HUD, platform, scenery,
> beam, explosion, or loose debris. Use an exactly flat solid `#00ff00`
> background and no green in the subject. Avoid symmetry, Gothic cathedral
> shapes, rectangular scaffolding, copper bars, flat shelves, empty black
> circles, broad panoramas, low-poly, vector, pixel-art, and watermarks.

Finishing:

- ImageGen returned a 1086×1448 RGB image.
- Chroma key was removed with the ImageGen skill's
  `remove_chroma_key.py` using border auto-key sampling (`#03fa03`), soft
  matte thresholds 22/92, one-pixel feather, one-pixel edge contraction, and
  despill cleanup.
- Output is an RGBA PNG. The runtime places it as recessed command machinery
  behind independent root art, opaque hull shells, and an animated physical
  aperture so the asset never owns the complete Crown silhouette.
- Production derives `crown-command-core-runtime-v2.png` once with a Lanczos
  resample to 1024×1024. Mapping that square source onto the authored 15×20
  world plane restores the master's 3:4 geometry while reducing resident GPU
  pixels and satisfying the power-of-two texture contract. No runtime resample
  or crop occurs.
- The deterministic palette finisher
  `tools/assets/normalize-painted-palette.mjs` then neutralized 17,222 visible
  pixels (1.6424% of the runtime image; mean blend 0.2991) just far enough to
  enter the six-role project palette. Alpha and every compliant source pixel
  remain byte-identical. The isolated asset gate reports 100% in-band and
  0.0000% alien pixels.
