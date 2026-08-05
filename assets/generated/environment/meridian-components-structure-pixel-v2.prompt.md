# Meridian pixel-native structure board v2 — production provenance

Generated with the built-in OpenAI ImageGen tool on 2026-08-04. The original
output is preserved at:

`/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-9a4eb944-9cbd-4d16-b0f9-d56f91bc48e3.png`

The production source is
`foreground-pack-sources/meridian-components-structure-pixel-v2.png`. The flat
`#ff00ff` authoring matte was removed with the shared ImageGen chroma-key tool
using a soft matte, 18/95 thresholds, one-pixel edge contraction and spill
cleanup. The resulting RGBA source is packed into the structural half of
`meridian-component-atlas-v1.png`; the established component IDs, pivots,
stretch axes, sockets and single-texture runtime contract are unchanged.

## Exact production prompt

> Use case: stylized-concept
>
> Asset type: replacement production source board for an existing modular
> pixel-art component atlas in the side-view action game HULLBREAKER.
>
> Primary request: Create exactly one 4 by 4 grid containing exactly 16
> isolated mechanical components, one centered component per equal cell, in
> this exact left-to-right, top-to-bottom order:
>
> Row 1 — horizontal traversal edges: (1) Long battered platform route-cap
> trim, horizontal 4:1 silhouette, attachable at both ends. (2) Long
> overlapping armored scute-edge strip, horizontal 3.5:1 silhouette with
> stepped plates. (3) Heavy horizontal I-girder beam with bolted end shoes,
> horizontal 4:1. (4) Industrial broken-gap guard rail with two rooted posts,
> horizontal 4:1, large readable opening.
>
> Row 2 — braces and traversal structure: (5) Single long diagonal armored
> brace with end shoes, about 3:1 diagonal. (6) Connected X cross-brace
> assembly with open negative spaces, about 1.5:1. (7) Vertical ladder-rail
> assembly with two side rails, exactly four broad rungs, and obvious
> top/bottom sockets, about 1:3. (8) Broken horizontal guard rail with one bent
> end and a large readable gap, about 3:1.
>
> Row 3 — conduit vocabulary: (9) Long straight horizontal pressure pipe with
> three broad collars, about 4:1. (10) Clean 90-degree pipe elbow assembly,
> unmistakable L silhouette. (11) Branching T-junction conduit with three open
> attachment ends. (12) Bundled armored power cables held by three broad
> clamps, horizontal about 3:1.
>
> Row 4 — near silhouette and damage: (13) Hooked keel fin or armor scute,
> broad irregular native silhouette with mounting foot. (14) Armored shoulder
> casting with exposed mounting foot, about 2:1. (15) Deep directional vent
> hood with protruding exhaust lip and dark louver mouth, about 1.5:1. (16)
> Sheared armored scute fragment with jagged mechanical edge and attached
> exposed rib stub, irregular silhouette.
>
> Style and rendering: Crisp hand-authored 32-bit pixel art made to remain
> legible when each part is displayed at only 24 to 64 screen pixels. Hard
> deliberate pixel clusters, chunky stair-stepped silhouettes, strong negative
> space, restrained one-pixel highlights. No painterly brushwork, no soft
> antialiasing, no photorealism, no smooth 3D render look.
>
> World language: All parts belong to one colossal ancient mechanical
> creature. Functional Meridian anatomy, not temporary human scaffolding. Deep
> oxidized teal steel, near-black seams and recesses, restrained burnt-copper
> wear on load edges, tiny warm-ivory fastener glints only. Cold dormant
> machinery; no ambient glow. Strong upper-left material light and internal
> contact occlusion.
>
> Layout and extraction: Exactly one connected assembly per cell. Strict
> orthographic front/side presentation. Natural native aspect ratios rather
> than square cards. Generous clear padding; nothing touches or crosses cell
> boundaries. All small bolts, cables, feet and collars remain visibly attached
> to the main component. No grid lines, no cell borders, no frames, no backing
> cards.
>
> Background: Flat perfectly uniform #ff00ff background covering the entire
> canvas and all cell gaps. No gradient, texture, shadow, border, vignette or
> floor. Do not use #ff00ff or magenta inside any component.
>
> Do not include: No text, labels, letters, numbers, UI, inventory cards, outer
> frame, glow, bloom, smoke, steam, green infection, organic growth, bones,
> foliage, characters, enemies, weapons, projectiles, duplicate components, or
> detached debris.

## Review

- All sixteen conceptual cells contain reviewed machinery.
- The broken guard intentionally uses two separated islands inside one cell;
  the packer unions same-cell islands while preserving their negative space.
- Soft-matte proof on near-black showed no magenta contour.
- Packed 1:1 proof passed on near-black, cold teal and warm hull backgrounds.
- Ambient emission remains off; exhaust is a runtime response, not painted fog.

