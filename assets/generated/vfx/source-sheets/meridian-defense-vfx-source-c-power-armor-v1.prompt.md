# Meridian defense VFX source C — Power / Armor v1

Generated with the built-in OpenAI ImageGen tool on 2026-08-03.

Workspace source:

- `meridian-defense-vfx-source-c-power-armor-v1.png` (1672×941 RGB)

ImageGen source:

- `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-c41c6531-c499-4249-97cd-c00b64e34e67.png`

Reference images:

- `docs/concept-art/08-transformation-sequences.png` — transformation action
- `docs/concept-art/11-creature-flip-breach-sequences.png` — self-damage/material reference
- `docs/concept-art/13-human-scale-monster-climb-grammar.png` — scale reference

Prompt:

> Use case: stylized-concept
> Asset type: production 2D transient VFX source sheet for a fast side-view platform shooter
> Input images: reference boards show Hullbreaker's colossal mechanical-creature hull, self-damaging transformation, oxidized copper scutes, black steel machinery, and readable debris action
> Primary request: Create an EXACT 4 columns by 4 rows atlas containing 16 isolated native-shape transient effects, row-major. The top two rows are QUARANTINE-TO-STERILIZE power reroute/arcs: 1 branching current precharge pulled toward a side socket (tell), 2 busbar pulses queued left-to-right (tell), 3 hard electrical arc bridging two mechanical contacts (fire), 4 forked directional arc discharge from one origin (fire), 5 socket-overload spokes with one clear source edge (fire), 6 fading arc echo with broken segments (recovery), 7 thin copper-vapor energy trail (recovery), 8 charred insulation flecks with no glow (spent). The bottom two rows are SCUTTLE-ONSET armor shear/debris: 9 angled stress-line crawl from a marked shear origin (tell), 10 fastener sparks racing along one shear axis (tell), 11 plate-edge shard fan thrown from one origin (fire), 12 rivet and fastener burst traveling outward (fire), 13 long rib-strip tear with clear travel direction (fire), 14 falling heavy metal chunks (recovery), 15 trailing shear sparks and slivers (recovery), 16 peeled armor flakes and dead fragments (spent).
> Scene/backdrop: perfectly flat solid #00ff00 chroma-key background only
> Style/medium: premium painterly industrial game VFX, bold legible silhouettes at 48–96 screen pixels, dense hard-surface fragments and controlled electrical anatomy
> Lighting/mood: white-hot and restrained magenta electrical core, warm copper-orange sparks, dark blue-black and oxidized copper debris; no green subjects
> Composition/framing: exact borderless 4x4 grid, one complete non-overlapping effect centered in each conceptual cell, generous 10% cell margin, no component touches a boundary
> Constraints: current travel, shear origin, shear axis and debris direction must be unmistakable; fully visible and uncropped; no text, labels, numbers, grid lines, frames, cards, characters, weapons, enemies, complete machinery panels, platforms, cast shadows, reflections, floor, or background lighting; uniform chroma background without gradients/texture; never use #00ff00 in an effect
> Avoid: generic lightning-ball icons, generic explosions, biological infection, square stickers, symmetric decorative halos, soft blurry blobs, persistent ambient glow, watermarks

Review:

- Accepted 16/16 cells. Arc endpoints, shear origins and debris vectors remain
  complete with visible green separation at every boundary.
- Runtime preparation trims each cell independently and never stretches it.

