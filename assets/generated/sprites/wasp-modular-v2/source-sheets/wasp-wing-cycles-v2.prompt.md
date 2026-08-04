# Wasp wing cycles v2 — ImageGen provenance

- Generator: built-in `image_gen.imagegen`
- Generated output: `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-19d8d964-ade2-4683-b799-88196551ead3.png`
- Repository copy: `wasp-wing-cycles-v2.png`
- Alpha extraction: `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill --force`
- Key color: `#f305f6`
- Review: Cycle A (top two rows, phases 0–7) accepted. Every selected cell has 26–39 px source gutter, one significant connected wing assembly, no chroma fringe, and a continuous hinged centroid path. Cycle B remains as reviewed alternates.

## Exact prompt

Use case: production 2D game asset candidate sheet.
Asset type: exact 4 columns by 4 rows source sheet containing two complete eight-phase flight cycles for a modular Meridian wasp WING-ONLY layer.
Reference identity: use the reference wasp's acid membrane, dark articulated spars, mechanical veins and industrial mounting hardware, but draw ONLY the wing assemblies. No head, reactor, torso, abdomen, legs, weapon, eye, or complete insect body.
Anatomy: each cell is one coherent PAIR-OF-PAIRS wing assembly viewed side-on facing right: two near wings and two subtly darker far wings, all hinged to one compact shared mechanical root socket. Wings must be articulated mechanical membranes with curved/segmented outlines, visible black/copper spars, elbow joints and membrane veins. They must NOT read as flat acid-green triangles. The shared root socket must occupy the EXACT SAME normalized pixel coordinate in all sixteen cells, ready to sit behind a separate body layer.
Exact layout and motion continuity:
top two rows are CYCLE A phases 0–7 in row-major order: fully raised, raised-mid downstroke, forward-horizontal, down-forward, fully lowered/back, lower-mid upstroke, rear-horizontal, raised-mid return;
bottom two rows are an alternate CYCLE B with the same phase order and same identity.
Neighboring phases must form an anatomically continuous high-speed flap: modest joint progression, no teleport, no swapped wing count, no strobe, no identity or camera change. Phase 7 must flow cleanly back to phase 0.
Backdrop: perfectly flat uniform #ff00ff chroma key only.
Composition: exact borderless 4x4 conceptual grid, one complete centered wing assembly per cell, generous 12% empty margin around every membrane tip and detached-looking edge, no content touching any cell boundary, same scale and side-on camera in every cell.
Style: premium painterly production sprite, crisp hard mechanical spars, thin translucent membranes with restrained acid-green internal light, far wings darker for depth, readable at 28–36 screen pixels.
Lighting: quiet cruise energy, localized membrane veins and root seam only; no broad halo, no aura, no bloom cloud.
Constraints: no text, labels, numbers, grid lines, frames, cards, body parts, floor, platform, shadow, fog, projectile, explosion, detached debris; no #ff00ff in the subject; fully visible and uncropped.
Avoid: simple green triangles, leaf shapes, butterfly/fairy wings, biological soft tissue, generic glow wedges, motion-blur smears, duplicated or missing wings, perspective drift, watermark.
