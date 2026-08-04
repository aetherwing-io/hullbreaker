# Wasp body candidates v3 — ImageGen provenance

- Generator: built-in `image_gen.imagegen`, precise edit of the v2 generated sheet above
- Generated output: `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-1dfb5c38-f773-4a9d-8105-dec3a3f40a51.png`
- Repository copy: `wasp-body-candidates-v3.png`
- Referenced edit input: `wasp-body-candidates-v2.png`
- Alpha extraction: `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill --force`
- Key color: `#f506f0`
- Review: accepted production body source. Selected indices 0, 2, 4, 6, 8, 11, 12 and 15 retain 15–50 px source gutter, one significant connected anatomy each, and no chroma fringe.

## Exact prompt

Use case: precise-object-edit.
Asset type: production 2D mechanical wasp BODY-ONLY 4x4 candidate source sheet.
Input: Image 1 is the exact edit target.
Change ONLY layout spacing and scale. Preserve all sixteen body poses exactly: same row-major order, state/action, wasp identity, anatomy, face direction, reactor, dorsal wing-root sockets, hard-surface materials, colors, lighting, and perfectly flat #ff00ff background. Do not add wings.
Re-layout into an exact borderless 4 columns by 4 rows conceptual grid. Uniformly scale down and/or move each complete body within its own cell so every visible needle tip, leg claw, abdomen point, cracked plate and tiny attached edge has a broad unmistakable pure-magenta gutter of at least 12% of that cell on every side. Pay special attention to cells 1, 2, 5, 6, 9 and 11, whose long noses approached the left cell boundary. Every body must remain complete and connected.
Keep the round reactor center and modular wing-root location as consistent across cells as the input. No crop, no overlap, no content touching a cell boundary, no disconnected anatomy, no new/removed parts, no restyling, no pose changes, no frames, grid lines, labels, cards, floor, shadow, fog, glow field, extra creature, #ff00ff subject pixels, or watermark.
