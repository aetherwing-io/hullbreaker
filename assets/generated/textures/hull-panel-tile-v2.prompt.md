# Hull panel tile v2 ImageGen prompt

Generated with the built-in ImageGen tool using the exterior-gameplay,
vertical-assault, existing scute, and Crown-summit images as style/material
references. `hull-panel-tile-v2.png` is a 512px runtime downsample.
`hull-panel-mirror-tile-v2.png` is the exact-seam 512px mirrored variant.

```text
Use case: stylized-concept
Asset type: seamless production game texture for Meridian climbable hull panels

Primary request: create one perfectly square, orthographic, seamless/tileable color texture for the exterior deck and armor panels of the Meridian. Replace the current simple brown checkerboard with dense but readable blackened-iron machinery under overlapping worn burnt-orange armor scutes. Match the references' giant industrial creature-ship: forged plates, recessed seams, small rivet clusters, narrow ventilation slots, inset braces, chipped orange coating, soot, subtle oily blue-black metal, and a few tiny ivory maintenance lamps. It must look excellent when repeated across large 3D platform faces and still read cleanly when the player is very small.

Composition:
- straight-on orthographic material capture; no camera perspective and no horizon
- one continuous surface, not a framed panel, not an object on a background
- large irregular armor shapes crossing the tile boundaries so repetition does not form a checkerboard
- deep recessed mechanical seams and narrow dark understructure between plates
- distribute detail unevenly with one quieter traversal band; avoid a centered focal point
- all four edges must join seamlessly with their opposite edges
- no outer border, no bevel around the whole image, no corner screws defining the tile
- no text, glyphs, symbols, hazard stripes, logos, creatures, characters, weapons, or environment

Style/medium: crisp hand-painted stylized 3D game material, chunky hard-surface concept-art quality, rich physically plausible metal and paint; not photoreal
Lighting: neutral soft top-left material lighting with restrained highlights; no cast shadow beyond local recesses; no baked directional spotlight
Palette: charcoal/blue-black iron, oxidized burnt orange, tiny dirty ivory lights; no broad green or magenta
Texture scale: medium-to-large plate language, readable at 64–256 pixels per tile, no high-frequency grit carpet
Constraints:
- exact square image
- genuinely seamless on X and Y
- fully opaque; no transparency
- consistent color/value at opposite edges
- no frame, no floor, no sky, no perspective, no watermark
Avoid: flat brown checkerboard, repeated square grid, generic sci-fi wall, clean spaceship panel, brick wall, wood, stone, overly noisy scratches, embossed text, central emblem, vignette, visible image boundary.
```
