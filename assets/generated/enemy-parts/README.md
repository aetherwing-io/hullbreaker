# Meridian mutation parts v1

`meridian-mutation-atlas-v1.png` is the runtime 1024x512 transparent atlas.
Its 256px cells are ordered left-to-right as:

- top: `BULWARK`, `VAULT`, `TWINSTRIKE`, `SALVO`
- bottom: `RELAY`, `PINCER`, `AEGIS`, `BACKLASH`

`meridian-mutation-atlas-chroma-v1.png` is the untouched built-in ImageGen
source. The runtime image was keyed locally, globally cleared only where green
dominance identified the chroma field, despilled on translucent edge pixels,
contracted by one source pixel, then downsampled. A dark-background inspection
preserved the powered green internals and Aegis' magenta/ivory lens.

## Final prompt

```text
Use case: stylized-concept
Asset type: production 2D game sprite modular-parts atlas on chroma key

Primary request: create one exact 4-column by 2-row atlas containing eight isolated, physically believable Meridian enemy mutation modules. These are bolt-on sprite elements that will be composited over the existing enemy bodies in the references to create deterministic mutated enemies. Match the crisp hand-painted / stylized 3D hard-surface sprite quality, material density, blackened iron, worn burnt-orange armor, exposed mechanisms, and acid-green contained energy of the existing enemy sprites. Every module must materially alter silhouette and look engineered from the Meridian's own body rather than like a UI icon or floating effect.

Fixed cell order, left to right:
Top row:
1. BULWARK — three nested articulated frontal armor scutes with hinges, compact side-view facing left; closed defensive silhouette.
2. VAULT — paired piston-and-coil hind-leg booster assembly, compact side-view, attachment sockets visible.
3. TWINSTRIKE — bifurcated flight rail and twin directional vanes, horizontal side-view, no wing membrane.
4. SALVO — paired asymmetrical micro-mortar pod rack with two distinct barrels, three-quarter side view.
Bottom row:
5. RELAY — mechanical iris hinge yoke with split rotating jaws and cable root, frontal-three-quarter.
6. PINCER — swept hooked interception fins with split tail vane, side-view; angular but richly mechanical, not plain triangles.
7. AEGIS — armored crown projector assembly with three prongs and a contained magenta/ivory emitter lens; no complete ring.
8. BACKLASH — three partial copper-black discharge coil shoes and clamp nodes mounted to a small central harness; broken-circle silhouette, not a perfect ring.

Layout:
- exact 4x2 atlas, equal-size cells, each object centered in its cell
- every object occupies about 58–66% of its cell width and 50–62% of cell height
- at least 44 px-equivalent empty chroma padding around every object and around the outer canvas
- no module may cross a cell midpoint or touch another module
- do not draw cell dividers, panels, frames, labels, text, numbers, legends, shadows, or guide marks
- all eight modules fully visible and completely uncropped

Lighting and rendering:
- crisp production game-sprite rendering with readable material planes at 24–48 pixels in gameplay
- warm ivory rim light and restrained internal glow, but no bloom or halo outside hard silhouettes
- consistent three-quarter hard-surface presentation, high edge definition, opaque parts

Color language:
- charcoal iron and worn burnt orange dominate
- tiny acid-green powered internals for modules 1–6
- AEGIS uses contained hot-magenta plus ivory lens as its unique command accent
- BACKLASH uses contained copper/acid-green coils
- never use chroma green #00FF00 inside any object

Background/removal constraints:
- perfectly flat, uniform solid pure chroma green #00FF00 background across the entire canvas
- no ground, no floor, no cast/contact shadow, no environment, no particles, no smoke
- no transparency checkerboard, no soft spill, no reflection, no watermark
- complete opaque hard contours, generous separation

Avoid: complete enemies, humanoid parts, weapon pickups, generic icons, flat vector symbols, pixel art, sleek sci-fi, broad neon surfaces, white additive bars, perfect debug rings, plain triangular fins, cropped objects, perspective mismatch.
```

Reference roles: `docs/concept-art/06-enemy-form-language.png` supplied the
industrial form language; the hound, wasp, polyp, and mortar production sprites
supplied exact rendering/material references. They were references, not edit
targets.
