# RIG climb atlas v1

Generated with the built-in ImageGen tool on 2026-08-03.

Reference image:

- `assets/generated/sprites/rig-body-atlas-v1.png` — identity, armor, proportions, palette, material, linework, and rendering anchor.

Prompt:

> Use case: stylized-concept
> Asset type: production 2D game character sprite sheet, body-only climbing animation for Hullbreaker
> Input images: Image 1 is the identity, armor, proportions, palette, material, linework, and rendering anchor for the existing RIG character; preserve that character exactly
> Primary request: create a new four-frame side-view climbing animation strip of the same RIG in heavy cream ceramic armor, black undersuit, worn rust-orange joints and trim, amber visor, and compact orange-lit backpack. Frame 1: left hand reaching high and left knee raised. Frame 2: body driving upward with limbs crossing midpoint. Frame 3: right hand reaching high and right knee raised. Frame 4: body driving upward with opposite limbs crossing midpoint. Each frame must loop cleanly in sequence and read as active vertical climbing, not standing, jumping, floating, or running.
> Style/medium: match Image 1 exactly: polished painterly game sprite, crisp dark outline, readable mechanical joints, battered industrial surface detail, consistent lighting and silhouette
> Composition/framing: one horizontal row of exactly four equal cells, generous even padding, identical character scale and anchor in every cell, full body visible, strictly side-on facing right, no overlap between cells
> Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal
> Constraints: body only; absolutely no gun, weapon, muzzle flash, projectile, ladder, rope, platform, floor, cast shadow, contact shadow, reflection, UI, labels, numbers, grid lines, border, logo, or watermark. Preserve helmet, visor, backpack, armor shapes, colors, proportions, handedness, and identity across all frames. Background must be exactly one uniform #00ff00 with no gradient, texture, lighting variation, or shadows. Do not use #00ff00 anywhere in the character. No extra limbs, no cropped hands or feet.

Post-processing:

- Built-in output copied to a temporary chroma source (`/private/tmp/rig-climb-atlas-chroma-v1.png`, not tracked).
- Background removed with the installed ImageGen skill helper using border auto-key, soft matte, thresholds 12/220, and despill.
- Detected key: `#05f707`.
- Final transparent atlas: `rig-climb-atlas-v1.png` (`2048×1024`, power-of-two GPU canvas).
- The four source cells were repacked as top-aligned `512×724` runtime frame windows; the remaining 300 rows are transparent padding and never sampled.
- A restrained alpha feather and palette-safe shadow neutralization were applied after repacking; the 40 px gameplay-scale silhouette remains crisp while satisfying the declared cutout/palette contracts.
