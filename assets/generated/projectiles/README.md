# Hullbreaker projectile chassis atlas v1

`projectile-chassis-atlas-v1.png` is the runtime 1280×256 alpha atlas. Its
five 256×256 cells are ordered `R`, `S`, `L`, `H`, `F`. The production atlas
is loaded once and each projectile pool selects its cell with geometry UVs.

`projectile-chassis-atlas-chroma-v1.png` is the untouched built-in ImageGen
source. It is retained for provenance and future repacking.

## Final ImageGen prompt

```text
Use case: stylized-concept
Asset type: production 2D game projectile chassis sprite atlas for Hullbreaker
Primary request: create exactly five strongly distinct industrial sci-fi projectile bodies as isolated painted sprites. They are ammunition fired by the five weapons in Image 1 and must share that weapon sheet's hand-painted hard-surface machinery, burnt-orange brackets, ivory armor, near-black steel seams, rivets, believable wear, and controlled luminous cores. Image 2 is mood and palette reference only, not a composition to copy.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal. The background must be one uniform color with no shadow, gradient, texture, reflection, floor plane, lighting variation, or glow spill.
Composition/framing: exact clean 3 columns by 2 rows atlas layout with equal invisible cells, no dividers or borders. All five projectiles are strict side-profile, horizontal, pointing right, isolated, centered in their cell, with generous padding and no overlap. Top row left-to-right: riveted kinetic sabot; scatter flechette cluster; narrow prismatic Sunspear. Bottom row left-to-right: finned Hunger seeker missile; jagged caged Cindermouth ember; final bottom-right cell completely empty. Each projectile should fill about 72% of its cell width and have a bold readable silhouette at tiny gameplay scale.
Subject details:
1) RIVET SABOT: long cream-metal penetrator nose, clipped hexagonal profile, split dark sabot rails around the rear, one burnt-orange locking band, two or three unmistakable rivet heads; manufactured, dense, not a generic bullet.
2) SCATTER FLECHETTE: one compact integrated cluster of five separate triangular steel darts in a shallow fan, dark central launch collar and orange retaining clips; the five tips must remain individually readable, no explosion and no loose particles.
3) SUNSPEAR: extremely narrow cyan prismatic energy crystal captured between two ivory-black tuning prongs, sharp spear tip, small copper focusing cage at the rear; long clean angular silhouette, not a laser line.
4) HUNGER SEEKER: dark compact missile with a bright hot-magenta guidance chamber, hooked forward sensor, four large asymmetrical burnt-orange steering fins and visible side thruster ports; predatory mechanical silhouette, not a fish or insect.
5) CINDERMOUTH EMBER: angular orange-white plasma shard physically trapped inside a jagged black-and-rust mechanical claw cage, broken sawtooth silhouette and split rear vents; dangerous furnace hardware, not a fireball.
Style/medium: polished hand-painted game sprite art, stylized industrial realism, crisp hard edges, restrained surface detail, slight three-quarter material lighting while retaining strict side-on silhouettes, near-black 2–3 pixel-equivalent perimeter separation.
Color palette: ivory and warm white, burnt orange and copper, near-black steel; cyan only for Sunspear core, hot magenta only for Hunger chamber, orange-white only for Cindermouth core. Do not use any green anywhere in the subjects.
Constraints: exactly five projectile sprites and one empty cell; no weapons, guns, hands, characters, enemies, scenery, labels, text, letters, numbers, icons, arrows, logos, watermark, cast shadows, bloom cloud, smoke, exhaust trail, muzzle flash, motion blur, halo, perfect ring, circular badge, decorative particles, cell border, or grid line. Crisp separated edges suitable for chroma-key extraction.
Avoid: round blobs, eggs, balls, capsules, generic glowing lines, neon clipart, smooth gummy shapes, white additive bars, excessive micro-detail that disappears when reduced, bad crops, touching cell boundaries.
```

References supplied to the built-in tool:

- `assets/generated/weapons/rig-weapons-atlas-v1.png`: material, chassis, and
  paint-language reference.
- `docs/concept-art/01-exterior-gameplay.png`: palette and world-mood reference
  only.

## Extraction and packing

The installed ImageGen chroma helper sampled `#07f806` from the border and
removed it with soft matte, despill, and a one-pixel edge contraction. The
five connected subjects were cropped independently, resized inside 230×230
bounds, centered in 256×256 transparent cells, and packed in the runtime
order above. A detached seven-pixel source fragment beside Scatter was
explicitly rejected before the final pack.
