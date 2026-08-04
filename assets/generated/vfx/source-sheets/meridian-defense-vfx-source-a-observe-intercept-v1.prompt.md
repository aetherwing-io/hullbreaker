# Meridian defense VFX source A — Observe / Intercept v1

Generated with the built-in OpenAI ImageGen tool on 2026-08-03.

Workspace source:

- `meridian-defense-vfx-source-a-observe-intercept-v1.png` (1536×1024 RGB)

ImageGen source:

- `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-f02ba188-f4f4-42eb-8808-bbbb27161ddb.png`

Reference images:

- `docs/concept-art/02-bulkhead-flip.png` — mechanical action/material reference
- `docs/concept-art/04-six-phase-escalation.png` — escalation/palette reference
- `docs/concept-art/13-human-scale-monster-climb-grammar.png` — scale reference

Prompt:

> Use case: stylized-concept
> Asset type: production 2D transient VFX source sheet for a fast side-view platform shooter
> Input images: reference boards show Hullbreaker's dense painterly industrial Meridian machinery, tiny-player scale, oxidized copper armor, blue-black steel, and readable transformation action
> Primary request: Create an EXACT 4 columns by 4 rows atlas containing 16 isolated native-shape transient effects, row-major. The top two rows are OBSERVE sensor wake/scan effects: 1 shutter-slit wake chevrons (tell), 2 directional wedge sweep (tell), 3 sharp triangular scan fan (fire), 4 parallel raster rake (fire), 5 expanding range ripple cut by a directional notch (fire), 6 receding ghost rake (recovery), 7 sparse relay spark tail (recovery), 8 dead sensor mote scatter (spent). The bottom two rows are INTERCEPT lock/clamp effects: 9 opposed clamp-jaw motion streaks (tell), 10 diagonal lock rails converging on a socket (tell), 11 inward clamp-strike burst (fire), 12 cross-axis locking-pin collision (fire), 13 barrier-seal sweep with a clear axis (fire), 14 rebounding metal splinters (recovery), 15 receding clamp sparks (recovery), 16 spent lock shims and dust (spent).
> Scene/backdrop: perfectly flat solid #00ff00 chroma-key background only
> Style/medium: premium painterly game VFX, hard industrial/mechanical energy, bold readable silhouettes at 48–96 screen pixels, crisp controlled edges, native elongated/fan/wedge shapes
> Lighting/mood: cold teal-white sensor energy, warm ivory sparks, extremely restrained magenta only in tiny control nodes
> Composition/framing: exact borderless 4x4 grid, one complete non-overlapping effect centered in each conceptual cell, generous 10% cell margin, no component touches a cell boundary
> Constraints: direction and origin must be unmistakable; fully visible and uncropped; no text, labels, numbers, grid lines, frames, cards, characters, weapons, enemies, machinery panels, platforms, cast shadows, reflections, floor, or background lighting; the background is one uniform color with no gradients or texture; do not use #00ff00 anywhere in an effect
> Avoid: generic explosions, biological infection, circular decorative halos without a direction notch, square stickers, soft blurry blobs, persistent ambient glow, bloom clouds, watermarks

Review:

- Accepted 16/16 cells. Every silhouette is separated from its conceptual cell
  boundary; native directionality remains legible before alpha extraction.
- Runtime preparation trims each cell independently and never stretches it.

