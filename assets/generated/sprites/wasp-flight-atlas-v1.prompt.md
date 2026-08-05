# Meridian wasp flight atlas v1

- Tool: built-in OpenAI ImageGen (`image_gen`), reference-guided generation
- Generated: 2026-08-03
- Reference images:
  - `assets/generated/sprites/wasp-drone-v2.png` — locked cruise identity and materials
  - `assets/generated/sprites/wasp-drone-downstroke-v1.png` — locked downstroke identity
  - `assets/generated/sprites/wasp-drone-action-v2.png` — locked dive identity, excluded from the normal-flight cycle
- Chroma source retained outside the project at `/private/tmp/hullbreaker-enemy-motion/wasp-flight-atlas-v1-chroma.png`
- Final asset: `wasp-flight-atlas-v1.png`, 2048×512 RGBA, four 512×512 cells

## Final prompt

```text
Use case: stylized-concept
Asset type: production 2D game sprite animation atlas, four equal horizontal cells
Primary request: create a four-phase cyclic flight atlas for the exact Meridian wasp drone identity shown in the references.
Input images: Image 1 is the locked cruise identity and materials reference; Image 2 is the locked downstroke identity reference; Image 3 is the locked committed-dive identity reference only (do not use the dive pose in this normal-flight cycle).
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local background removal. One uniform color only: no shadows, gradients, texture, floor, reflections, glow spill, or lighting variation.
Subject: the same single acid-green and black mechanical wasp drone repeated exactly four times, one centered full-body side-view pose per equal-width cell, all facing right (+x). Flight phases: wings fully raised, wings mid-down, wings fully lowered/back, wings mid-up. Preserve the exact head, needle nose, round green reactor core, abdomen, leg count, black/orange hardware, material rendering and body proportions. Reactor center and hard body must occupy exactly the same pixel coordinate inside every cell. Only articulated wings and a very slight leg tuck may change. Keep every silhouette fully separated, with generous identical padding.
Style/medium: exact reference's polished illustrated 2D game sprite, crisp hard-surface machinery, readable high-contrast silhouette at 20-40 CSS pixels.
Composition/framing: 4:1 horizontal atlas, four equal cells, no borders or labels; consistent scale and baseline.
Constraints: do not redesign the drone; no extra wings, legs, weapons, exhaust, motion streaks, blur, duplicate bodies, cast shadow, contact shadow, text, watermark, grid, or cell dividers. Background must be only #ff00ff and #ff00ff must not appear anywhere in the drone. Crisp isolated edges. The body/reactor anchor may not drift between cells.
```

## Post-processing

The built-in result was keyed with the imagegen skill's `remove_chroma_key.py` helper using border auto-key, soft matte, thresholds 12/220, and despill. Empty vertical padding was then cropped without resampling; each frame was centered into a 512×512 cell and concatenated horizontally.

The production gate found 1.0104% alien hue mass and only 1.09% partially transparent pixels in that first pack. A deterministic cleanup changed only those deficiencies: 1,657 visible pixels whose CIELCh hue belonged to none of the eight project role bands were progressively neutralized toward their equal-channel luma until the existing palette classifier accepted them, and three inward-only silhouette rings were alpha-capped at 112/184/232. No frame was translated, cropped, rescaled, or expanded; canvas/cell geometry and every positive-alpha silhouette extent stayed fixed. The final audit measures 0% alien hue mass and 3.36% partial alpha. The alpha census, unchanged per-frame boxes, and FAR-scale silhouette checks live in `tools/assets/check.mjs` and `tools/enemy-motion-check.mjs`.
