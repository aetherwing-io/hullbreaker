# RIG slender core palette v2

Generated with OpenAI ImageGen on 2026-08-03.

Source image:

- `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-5b60ff03-7691-4265-9f14-4a45ad1eb8da.png`

References:

- Slender eight-pose identity candidate: `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-870a55a0-3dfd-4ce3-a656-4ab718bfd85a.png`
- `docs/concept-art/04-six-phase-escalation.png`

Prompt:

> Build one comprehensive production sprite palette for Hullbreaker's redesigned RIG: the same tall, slender, sophisticated industrial climbing exosuit from Image 1, covering the entire core movement/aim/traversal vocabulary in one consistent atlas.
>
> IDENTITY LOCK
> - Preserve Image 1's exact slender adult proportions, compact helmet and backpack, cream ceramic armor, oxidized copper joints/trim, blue-black exposed mechanisms, narrow amber visor.
> - Never drift back toward a squat, bulky, chibi, toy-like, or space-marine body.
> - Same character, armor topology, handedness, scale, lighting, and side-view camera in every frame.
> - Body only: no gun, weapon, projectile, effects, ladder, rope, platform, ground, shadow, UI, text, labels, borders, grid lines or watermark.
>
> EXACT ATLAS
> Create exactly 4 columns × 4 rows: sixteen equal cells on one canvas. Full body fully visible in every cell, centered, no overlap, generous clear margin, consistent root/foot anchor and character scale.
>
> Row 1 — locomotion:
> 1 idle/weapon-mount brace facing right
> 2 run contact, long front stride
> 3 run passing, hips high and rear leg passing
> 4 run flight, both feet airborne in extended stride
>
> Row 2 — airborne/landing:
> 1 jump launch, rear foot pushing off
> 2 jump rise, legs trailing and torso reaching
> 3 apex/fall transition, limbs gathering
> 4 hard landing brace, long legs absorbing impact
>
> Row 3 — aiming body mechanics:
> 1 aim right, compact connected shoulder/hand mount
> 2 aim up-right, torso and shoulders rotate diagonally
> 3 aim straight up, planted narrow stance and fully raised mount
> 4 aim down-right, low forward lunge with real torso angle
>
> Row 4 — traversal:
> 1 ladder climb left-hand reach / right knee high
> 2 ladder drive midpoint
> 3 ladder climb right-hand reach / left knee high
> 4 ledge mantle: one hand planted high, hips rising over edge
>
> ANIMATION QUALITY
> - Poses must be mechanically distinct whole-body silhouettes, not limb swaps on a static torso.
> - Run cycle must flow 1→2→3→4; ladder cycle must flow 1→2→3→4.
> - Helmet and backpack remain stable in size; waist, hips, shoulders and knees articulate naturally.
> - Premium painterly game-sprite finish with crisp dark contour and bold medium-size forms that survive around 20×42 on-screen pixels.
> - Lighting consistent across all sixteen: cool teal ambient, warm copper edge, bright amber visor.
> - Adult human anatomy around 7.5 heads tall. Long legs and visible waist separation are mandatory.
>
> CHROMA / CROP
> - Perfectly uniform flat #00FF00 chroma-key background, no gradient, texture, lighting or shadows.
> - Do not use green anywhere in the character.
> - At least 28px of pure green around every character and every cell boundary.
> - No cropped hands, feet, helmet, pack, or motion; no extra/missing limbs.
> - Deliver only the atlas, not a presentation mockup.

Finishing:

- ImageGen returned a 1449×1086 RGB atlas. Native pixels were preserved without resampling.
- Chroma key removed with the ImageGen skill's `remove_chroma_key.py`: `#00ff00`, soft matte, transparent threshold 42, opaque threshold 150, edge feather 0.45, edge contract 1, and spill cleanup.
- Runtime integration repacks validated cells to a uniform power-of-two atlas and records the final root/hand anchors separately.
- A separate 4×2 candidate was rejected and quarantined because its top-right flight pose was cropped by the generated canvas edge; it is not a production dependency.
