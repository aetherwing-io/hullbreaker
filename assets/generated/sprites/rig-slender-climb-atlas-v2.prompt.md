# RIG slender climb atlas v2

Generated with OpenAI ImageGen on 2026-08-03.

Identity reference:

- `assets/generated/sprites/rig-slender-core-palette-v2.png`
- Concept target: `docs/concept-art/04-six-phase-escalation.png`

Original generated image:

- `/Users/scottmeyer/.codex/generated_images/019fc9eb-8e91-7c21-be57-4836b121c1f2/exec-d7666d72-e522-42df-b913-c9d8af7e9ecf.png`
- Tracked chroma source: `assets/generated/sprites/rig-slender-climb-chroma-v2.png` (`2064×762`, RGB)

Prompt:

> Create a production four-frame horizontal ladder-climb sprite strip for Hullbreaker's RIG, using the supplied slender RIG image as a strict identity reference.
>
> IDENTITY LOCK
> - The exact same tall, slender adult industrial climbing exosuit in every frame: compact helmet and backpack, cream ceramic armor, oxidized copper joints and trim, blue-black exposed mechanics, narrow amber visor, long articulated legs, visible waist.
> - Preserve armor topology, handedness, side-view camera, scale, materials, lighting, and painterly linework. Never drift toward a squat, bulky, chibi, toy-like, or generic space-marine body.
> - Body only: absolutely no gun, weapon, muzzle flash, projectile, ladder, rung, rope, platform, floor, cast shadow, contact shadow, UI, text, labels, numbers, borders, grid, logo, or watermark.
>
> EXACT LOOP
> - Exactly one horizontal row of four equal cells, with a complete full body in every cell and a stable torso/root anchor.
> - Frame 1: left-hand high reach with right knee raised and long counter-extended leg.
> - Frame 2: left-side drive midpoint, hips and shoulders moving upward as limbs cross.
> - Frame 3: right-hand high reach with left knee raised, a true opposite silhouette rather than a duplicate.
> - Frame 4: right-side drive midpoint with opposite limbs crossing.
> - The sequence must loop 1→2→3→4 as forceful vertical climbing. Every pose must read as active load, reach, or drive—not standing, running, jumping, or floating.
> - Articulate shoulders, hips, waist, knees, and ankles naturally. Keep helmet and backpack stable in scale while the whole body changes silhouette.
>
> GAME-SCALE QUALITY
> - Premium painterly game sprite, crisp dark contour, bold medium-size industrial forms readable around 20×42 on-screen pixels.
> - Consistent cool teal ambient light, warm copper edge light, and restrained amber visor practical. No broad white aura or glow card.
> - Generous clear margin; no cropped helmet, pack, hands, elbows, knees, or feet; no extra or missing limbs.
>
> CHROMA
> - Perfectly uniform flat neon-green chroma-key background with no gradient, texture, lighting, or shadow. Use no green on RIG.
> - At least 28 pixels of clear green around every actor and cell boundary.
> - Deliver only the sprite strip, not a presentation mockup.

Deterministic finishing:

- `node tools/assets/repack-rig-slender.mjs`
- Green-dominance straight-alpha removal recovers the foreground colors, and connected-component extraction retains exactly one actor assembly per conceptual quarter.
- Native pixels are copied 1:1 into four `512×1024` windows on a `2048×1024` RGBA atlas. The source-relative vertical placement is preserved; no resampling, stretching, rotation, or redraw occurs.
- Exact source geometry, alpha bounds, guards, rejected components, and palette correction are recorded in `rig-slender-climb-atlas-v2.layout.json`.
- Runtime animation advances by physical ladder distance, then freezes when the player releases vertical intent; it is not a decorative wall-clock loop.


T-103 arm surgery (2026-10-22):

- The same repack command now ends with `tools/assets/rig-arm-surgery.mjs`. Painted forearms and fists that stood out past the torso are erased, and (aim `right` only) the upper arm across the chest is replaced by the same painting's abdomen plates cloned 1:1 from 50 px below. Nothing is resampled, redrawn or generated; every erased/cloned polygon is listed in that file and its pixel counts in the layout JSON (`armSurgery`).
- Why: every painted frame held its fists at chest or shoulder height while the simulation fires from a hip-height hand socket, so the separately mounted weapon floated under the fists. The runtime now re-poses RIG's own arm onto the weapon's painted grip (`src/pure/rig.js` `rigArmPose`), checked by `tools/pathcheck/t-103-rig-grip-alignment.mjs`.
- The near (reaching) arm stays painted on the rung; on the two reach beats the far forearm and fist at the chest are erased because the far arm now holds the weapon one-handed.
