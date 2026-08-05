# Crown Warden motion atlas v2

Generated with the built-in ImageGen tool on 2026-08-03 as a whole-body motion
revision of `warden-motion-atlas-v1.png`.

## Source files

- Design/input atlas: `assets/generated/sprites/warden-motion-atlas-v1.png`
- ImageGen chroma-key result:
  `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-49094f8b-c5b7-4242-9cb7-0349873fdbab.png`

## Prompt

> Edit this Crown Warden 4x2 sprite sheet into a genuinely animated 8-pose
> boss atlas for a fast side-view action game. Preserve the same unique
> rust-orange, ivory, blue-black, magenta-lit four-legged command/defense
> machine identity, painterly industrial rendering, left-facing authored
> orientation, orthographic 2D cutout view, common physical size, and common
> planted deck baseline. Use a perfectly uniform pure #00FF00 chroma-key
> background—not transparency checkerboard. Keep eight separated sprites in a
> strict four-column by two-row composition with generous clear margins, no
> overlaps, no crop, no cell dividers, no text, no floor, no scenery, no cast
> shadows.
>
> The old atlas only changed weapons while the heavy body and legs remained
> frozen. Every new state must show unmistakable whole-body weight transfer,
> leg articulation, chassis pitch, armor opening, and recoil while still being
> the same machine and never using uniform scaling.
>
> TOP ROW: (1) SEALED: low broad armored fortress stance, four legs evenly
> planted and compressed, cannon/rack locked, central iris fully shuttered.
> (2) SWEEP TELL: chassis twists and leans hard toward screen-left, left/front
> legs spread and dig into deck, right/rear legs pull under the mass, cannon
> retracts then braces, shoulders visibly loaded. (3) SWEEP FIRE: long cannon
> punches left, body recoils sharply backward/down, front suspension collapses,
> rear legs extend and claw, armor and antennae whip with the force; only a
> small magenta bore light, no long beam. (4) SWEEP RECOVER: cannon
> sagging/retracting, torso canted, one front foot briefly light/offloaded,
> vents open and restrained smoke inside the silhouette.
>
> BOTTOM ROW: (5) BARRAGE TELL: body crouches and shifts opposite the rack,
> rear/right missile pod unfolds high and wide, legs brace asymmetrically,
> clear stored tension. (6) BARRAGE BURST: rack fully flared and recoiling,
> chassis kicked diagonally, rear legs compressed, front legs resisting; short
> magenta exhaust confined around the rack, no projectiles leaving the cell.
> (7) EXPOSED: armored central shutters split far open around a bright magenta
> iris, torso slumps lower, cannon and rack disabled/drooped, all legs splayed
> in a vulnerable stance. (8) DAMAGED EXPOSED: same open-core state but visibly
> wounded—one front leg buckled, one armor shoulder torn away, antenna bent,
> chassis leaning, sparks/smoke restrained inside silhouette; still planted
> and readable, not a different creature.
>
> Prioritize large, clean silhouette differences over tiny surface noise. At
> 100-pixel thumbnail size, each pose must communicate sealed, brace, recoil,
> recovery, rack tell, rack burst, exposed, and damaged from body mechanics
> alone. Keep foot contact on one identical baseline across all eight cells and
> at least 32 pixels of empty chroma around each complete actor.

## Deterministic finishing

The generated 1774x887 RGB sheet was keyed with the ImageGen skill's
`remove_chroma_key.py` (`#00ff00`, tolerance 75, spill cleanup). Each quarter
was trimmed independently without rescaling and recomposed into a 2048x1024
RGBA atlas with eight 512x512 cells. Every frame shares a y=476 planted
baseline, retains at least 38 horizontal transparent pixels, and has no
boundary alpha.

Integration QA found that this first extraction had a binary alpha edge and
small high-chroma colors between Hullbreaker's declared hue roles. A
deterministic finishing pass preserved each pixel's CIELCh lightness/chroma
while snapping only off-band hue to the nearest legal role boundary, then
rebuilt a three-pixel inward straight-alpha matte from protected interior RGB.
Final measured result: zero off-band/alien palette mass, 3.14% partial alpha,
unchanged 2048x1024 cell geometry, shared y=476 anchor, and no cell-boundary
alpha. No pose, scale, socket feature, or opaque interior detail moved.
