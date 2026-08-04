# Meridian defense VFX source B — Contain / Quarantine v2

Edited with the built-in OpenAI ImageGen tool on 2026-08-03.

Workspace source:

- `meridian-defense-vfx-source-b-contain-quarantine-v2.png` (1254×1254 RGB)

ImageGen source:

- `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-921062a9-6ce2-4f52-97b0-48af927125f0.png`

Edit target:

- `meridian-defense-vfx-source-b-contain-quarantine-v1.png`

Prompt:

> Use case: precise-object-edit
> Asset type: production 2D transient VFX 4x4 source sheet
> Input images: Image 1 is the edit target
> Primary request: Change ONLY the spacing and scale of the existing 16 effects. Preserve every effect's identity, order, materials, direction, color, lighting and flat chroma background. Re-layout them into an exact 4 columns by 4 rows grid with wide, unmistakable bands of pure flat #00ff00 between all rows and columns. Scale or move each complete effect so every visible particle, spark, droplet, dust mote and disconnected debris island has at least a 10% cell margin. Pay special attention to the bottom row: keep cell 3 oxidized dust entirely inside its cell and cell 4 dead slag entirely inside its cell with a broad green gutter between them. Keep the downward vent in top-right fully inside its cell.
> Constraints: no crop, no overlaps, no new effects, no removed islands, no merging neighboring cells, no frames, grid lines, text, labels, cards, shadows, floor, gradients, texture or lighting in the green; no #00ff00 in subjects; preserve the original 16 row-major meanings exactly.
> Avoid: restyling, generic explosions, blur, extra machinery, watermarks

Review:

- Production candidate. The spacing-only edit preserves the complete sixteen
  effects while opening visible green gutters around every disconnected island.
- Runtime preparation trims each cell independently and never stretches it.

