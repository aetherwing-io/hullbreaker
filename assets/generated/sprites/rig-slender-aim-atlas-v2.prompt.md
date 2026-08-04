# RIG slender aim atlas v2

Generated with OpenAI ImageGen on 2026-08-03.

Identity reference:

- `assets/generated/sprites/rig-slender-core-palette-v2.png`
- Concept target: `docs/concept-art/04-six-phase-escalation.png`

Original generated image:

- `/Users/scottmeyer/.codex/generated_images/019fc9eb-8e91-7c21-be57-4836b121c1f2/exec-15a40371-498d-49d2-91d2-1b7b10472d77.png`
- Tracked chroma source: `assets/generated/sprites/rig-slender-aim-chroma-v2.png` (`2067×761`, RGB)

Prompt:

> Create a production four-frame horizontal aim-pose sprite strip for Hullbreaker's RIG, using the supplied slender RIG image as a strict identity reference.
>
> IDENTITY LOCK
> - The exact same tall, slender adult industrial climbing exosuit in all four frames: compact helmet and backpack, cream ceramic plates, oxidized copper joints and trim, blue-black exposed mechanisms, narrow amber visor, long legs, visible waist separation.
> - Preserve armor topology, handedness, side-view camera, scale, materials, lighting, and painterly rendering. Never make RIG squat, bulky, chibi, toy-like, or space-marine-shaped.
> - Body only. The game mounts a separate weapon at runtime: draw no gun, rifle, barrel, projectile, muzzle flash, effect, ladder, platform, ground, shadow, UI, text, label, border, grid, logo, or watermark.
>
> EXACT STRIP
> - Exactly one horizontal row of four equal cells, facing right, with one complete full body in every cell.
> - Frame 1: planted aim right with compact connected shoulder and forward-hand weapon mount.
> - Frame 2: aim up-right; torso and shoulders rotate into the diagonal and the long stance counterbalances it.
> - Frame 3: aim straight up; narrow planted stance and both hands/shoulder mount raised vertically without cropping.
> - Frame 4: aim down-right; a low forward lunge with a real torso angle and connected arm mount.
> - The four poses must be mechanically distinct whole-body silhouettes, not one static torso with swapped arms. Helmet and backpack remain stable in size.
>
> GAME-SCALE QUALITY
> - Premium painterly game-sprite finish, crisp dark contour, bold medium-size armor forms, readable around 20×42 on-screen pixels.
> - Consistent cool teal ambient light, warm copper edge light, and restrained amber practical visor light. No broad white aura or baked glow cloud.
> - Full helmet, pack, hands, knees, and feet visible in every cell with generous clear margin and no extra or missing limbs.
>
> CHROMA
> - Perfectly uniform flat neon-green chroma-key background with no gradient, texture, lighting, or shadow. Use no green on the character.
> - At least 28 pixels of clear green around every actor and cell boundary.
> - Deliver only the sprite strip, not a presentation mockup.

Deterministic finishing:

- `node tools/assets/repack-rig-slender.mjs`
- Green-dominance straight-alpha removal recovers foreground color without retaining the generated green field.
- Exactly one connected actor assembly is retained per conceptual quarter; no orphan fragments are accepted.
- Native pixels are copied 1:1 into four `512×1024` windows on a `2048×1024` RGBA atlas. There is no resampling, stretching, rotation, or redraw.
- Exact cell geometry, alpha bounds, guards, and palette correction are recorded in `rig-slender-aim-atlas-v2.layout.json`.

