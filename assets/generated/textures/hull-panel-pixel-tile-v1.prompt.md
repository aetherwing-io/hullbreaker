# Hull panel pixel tile v1 — ImageGen and finishing record

Generated on 2026-08-05 with the built-in OpenAI ImageGen workflow. The
references were the shipped painted hull material, the production pixel-art
wasp atlas, and a current desktop gameplay capture. Their roles were kept
separate: the old hull supplied subject matter, the wasp supplied pixel-cluster
discipline, and the capture supplied palette, camera scale, and value context.

## Initial generation prompt

```text
Create a square, opaque, seamless/tileable pixel-art material atlas for the
large climbable hull and lower machinery of the game shown in the gameplay
reference. This is a production game texture, not concept art and not a scene.

Preserve the old hull texture's subject language—overlapping burnt-orange
armour plates, charcoal and deep-teal recessed machinery, broad black seams,
braces, access bays, and only a few warm maintenance lights—but rebuild every
shape as actual pixel art authored for its final sampling scale. Follow the
pixel-cluster discipline of the wasp reference: hard rectangular clusters,
deliberately stepped diagonals, crisp one-value boundaries, no painterly
reduction artifacts.

Author on a 256 x 256 logical pixel grid. Use 16–20 flat colors total. No
feature may be smaller than 4 logical pixels in either dimension; important
seams and highlights should be 6–12 pixels wide. Let a few large plate and
machinery silhouettes dominate each quadrant. Keep about 70% of the image in
broad quiet value masses so it remains stable when displayed at 64–256 pixels
and minified on a phone. Make opposite edges continue naturally in X and Y.
Avoid a centered emblem, outer frame, checkerboard grid, evenly repeated
panels, text, symbols, hazard stripes, characters, weapons, perspective,
horizon, transparency, gradients, anti-aliasing, soft shadows, photographic
noise, one-pixel scratches, rivet carpets, micro-greebles, and thin wires.

Palette: blackened blue-charcoal, deep desaturated teal, rust-brown,
burnt-orange armour, muted ochre edge light, and at most four small warm-ivory
lamp clusters. Lighting is restrained top-left material lighting expressed
only through flat pixel clusters. Output one square texture filling the image.
```

## Selected refinement prompt

```text
Refine the first generated hull tile into a stricter production pixel material
while preserving its overall plate-and-machinery composition and the game's
burnt-orange / charcoal / deep-teal identity shown in the gameplay reference.

Reduce the image to a strict 16-color-style palette and make the pixel clusters
substantially larger. Merge all tiny highlights, scratches, rivets, slits, and
small repeated marks into broad stepped shapes. No isolated one-pixel marks,
no thin cables, no thin decorative lines, no dither, no gradients, no
anti-aliasing, and no painterly shading. Every surviving detail should remain
readable after the tile is displayed at 96 pixels: major seams at least 6
logical pixels wide and minor features at least 4 pixels wide. Keep large
quiet fields across most plates and recesses. Use exactly four compact warm
maintenance-light clusters, subordinate to the armour. Maintain an opaque
square material with edge-continuing X/Y composition, no border, no scene,
no text, and no central emblem.
```

The second ImageGen result was selected. ImageGen outputs 1254 x 1254 pixels;
the selected result is preserved without alteration as
`hull-panel-pixel-tile-v1-source.png`.

## Deterministic runtime finishing

The production tile was reduced once, offline, with box sampling and a hard
palette reduction. Runtime code does not spatially resample this asset.

```sh
magick hull-panel-pixel-tile-v1-source.png \
  -filter box -resize 256x256! -dither none -colors 20 -alpha off PNG24:hull-panel-pixel-tile-v1.png
```

Measured output: 256 x 256 pixels, opaque, 19 unique RGB colors. Runtime uses
mirrored repeat, generated mipmaps, trilinear minification, and the device's
maximum supported anisotropy. The game's existing neutral-luminance tone pass
still runs so the material continues to inherit palette hue from geometry. A
pixel-specific 20-SD contrast budget (versus the painting's 28) keeps hard
cluster edges stable and subordinate at mobile scale without blurring or
resampling them.
