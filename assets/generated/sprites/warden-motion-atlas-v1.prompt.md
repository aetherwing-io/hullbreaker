# Crown Warden motion atlas v1

Generated with the built-in ImageGen tool on 2026-08-03.

- Design reference: `assets/generated/sprites/crown-warden-v1.png`
- Built-in ImageGen source: `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-99922216-f47e-4a22-8f8e-ece8e634e0a7.png`
- Production asset: `assets/generated/sprites/warden-motion-atlas-v1.png`

## Prompt

> Create a production-ready 4-column by 2-row motion atlas for the exact supplied Hullbreaker CROWN WARDEN boss. Preserve its identity: colossal low quadruped war-machine, dark gunmetal and oxidized bronze armor, ivory repair plates, central magenta iris/interlock, long beam cannon on its left side, nine-cell missile rack on its right, antenna towers, articulated armored legs. Same three-quarter side/front viewpoint, materials, lighting and relative proportions in every cell. Intended canvas 2048x1024, eight equal 512x512 cells. Each full boss completely inside its cell with at least 24px clear margin, no crop, no overlap, no cell dividers, no text/UI/background/floor/cast shadow. Identical deck contact baseline, central iris anchor, and body scale in all eight frames.
>
> Frames left-to-right. Top row: (1) SEALED/IDLE: four legs planted in a wide heavy stance, central iris armored/shuttered, cannon and rack locked; (2) SWEEP ANTICIPATION: left beam-cannon side shoulders drop and brace, left front/rear legs spread and dig in, cannon telescopes forward and charges; right side counterbalances—large readable weight transfer, not glow-only; (3) SWEEP FIRE/RECOIL: beam cannon kicked sharply backward on visible rails, left suspension compressed, opposite legs resisting torque, iris still sealed, hot magenta muzzle core; (4) SWEEP RECOVERY: cannon traveling back to battery, chassis overshoots subtly, one foreleg replants and armor vents open—clearly distinct mechanical recovery.
>
> Bottom row: (5) BARRAGE ANTICIPATION: right missile rack elevates and angles outward, cell doors open, right legs squat and widen, left cannon locks down as counterweight; (6) BARRAGE BURST/RECOIL: several rack cells visibly discharged with rear exhaust, rack driven down/back, right suspension compressed and armor shaken open; no detached missiles in the cell; (7) EXPOSED INTERLOCK: central armor shutters physically peeled open around the magenta iris, chassis unloaded and lower, both weapon systems cooling, vulnerable core projects slightly forward; (8) DAMAGED EXPOSED: same anchored vulnerable state after multiple seals broken—torn outer plates, exposed conduits, one antenna bent, uneven leg stance, brighter inner iris, but unmistakably the same machine and no death explosion.
>
> Animation priorities: every action must be readable through leg/suspension/cannon/rack/shutter silhouette at roughly 80-180 screen pixels wide; no uniform whole-body growth or squash, no unchanged cutout merely rotated, no blinking-only frames. Hardware motion must communicate anticipation, active danger, recovery, and damage before color. Use a perfectly uniform flat #00FF00 chroma-key background with no gradient, checkerboard, fog, halo, floor or green spill beyond the boss. Output only the atlas.

## Production extraction

The generated result arrived as a 1774x887 opaque chroma-key image. It was proportionally resampled to 2048x1024, converted to RGBA with the ImageGen skill's `remove_chroma_key.py` helper (`#00ff00`, soft matte 18–96, spill cleanup), and normalized with one common scale and deck baseline per row. Final validation: 2048x1024 RGBA; all eight 512x512 cells have at least 32 px horizontal margin and 35 px bottom margin; zero visible pixels occur within five pixels of any internal atlas boundary.
