# Emplacement motion atlas v1

Generated with the built-in ImageGen tool on 2026-08-03.

- Design references: `assets/generated/sprites/iris-polyp-v2.png`, `assets/generated/sprites/iris-polyp-action-v2.png`, `assets/generated/sprites/spore-mortar-v2.png`, and `assets/generated/sprites/spore-mortar-action-v2.png`
- Built-in ImageGen source: `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-0c429312-c39e-44fd-a421-d0c019039908.png`
- Production asset: `assets/generated/sprites/emplacement-motion-atlas-v1.png`

## Prompt

> Create a production-ready 4-column by 2-row motion atlas for two existing Hullbreaker rooted enemy designs, preserving the exact supplied materials, silhouette language, colors, lighting, viewpoint, and mechanical identity. Intended canvas is 2048x1024, eight equal 512x512 cells. Put the IRIS POLYP / five-petal starfish turret in all four top-row cells and the SPORE MORTAR / quadruped cannon in all four bottom-row cells. Each actor must be completely contained inside its own cell with at least 28px clear margin, identical deck/foot contact anchor and body center across its four frames, no crop, no overlap, no cell dividers, no text, no UI, no environmental backdrop, no cast shadow beyond the feet.
>
> Top row IRIS POLYP frames, left to right: (1) SEALED/IDLE: five armored petals folded slightly inward, iris aperture narrow and dark, three rooted feet planted; (2) ANTICIPATE/AIM: petals mechanically cant and rotate toward the center, iris contracts to a small hot targeting pupil, stalk/hoses visibly tension—meaningful silhouette change, not just a glow; (3) DISCHARGE: petals snap fully open/back like armored shutters, iris barrel telescopes forward, central aperture white-green and clearly aligned to fire; feet remain anchored; (4) RECOIL/RECOVER: barrel driven backward, petals asymmetrically rebounding and starting to close, side vents open with restrained green exhaust—different pose from frames 1–3.
>
> Bottom row SPORE MORTAR frames, left to right: (1) BRACED/IDLE: tube elevated, four legs firmly planted; (2) LOAD/ANTICIPATE: body compresses low, rear legs dig in, front legs widen, cannon tube draws back and lowers slightly—clear stored energy; (3) LAUNCH/RECOIL: tube slams backward/down on its trunnion, front chassis rises slightly while feet stay planted, breech/vent opens with a bright infection-green discharge; silhouette must materially change; (4) RECOVER/VENT: tube overshoots forward then settles, legs replant unevenly, top vents open with restrained green vapor source and chamber dimming.
>
> Animation priorities: hardware motion communicates attack timing before emissive color; action and recovery must be readable at 28–45 screen pixels tall; no uniform whole-body scaling, no simple rotation of an unchanged cutout, no blinking-only frames. Preserve transparent background if supported; otherwise use perfectly flat #00FF00 chroma green with no background variation and no green spill beyond the enemy art. Output only the atlas.

## Production extraction

The generated result arrived as a 1774x887 opaque chroma-key image. It was proportionally resampled to 2048x1024, converted to RGBA with the ImageGen skill's `remove_chroma_key.py` helper (`#00ff00`, soft matte 18–96, spill cleanup), then the four poses in each row were normalized with one common per-enemy scale and one shared foot baseline. Final validation: 2048x1024 RGBA; all eight cells are independently contained; zero visible pixels occur within five pixels of any internal atlas boundary; polyp and mortar frames each retain a common deck anchor.
