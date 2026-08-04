# Wasp body candidates v2 — ImageGen provenance

- Generator: built-in `image_gen.imagegen`
- Generated output: `/Users/scottmeyer/.codex/generated_images/019fca34-0ad9-7713-b3bf-dee2ee53e3db/exec-a552ef62-4a5c-4df6-9b83-0497c8544510.png`
- Repository copy: `wasp-body-candidates-v2.png`
- Alpha extraction: `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill --force`
- Key color: `#fb02f9`
- Review: rejected for production packing because selected cells retained only 3–7 px of source gutter. Retained as the exact visual input to the spacing-only v3 edit.

## Exact prompt

Use case: production 2D game asset candidate sheet.
Asset type: exact 4 columns by 4 rows source sheet, sixteen isolated BODY-ONLY pose candidates for the same Meridian mechanical wasp drone.
Reference identity: preserve the exact small acid-green/black/copper mechanical insect identity, long needle head, round luminous reactor at the shoulder center, segmented armored abdomen, articulated metal legs, industrial hard-surface materials, side-view facing RIGHT. This is a tiny hostile viewed at roughly 28–36 screen pixels, so the hard dark chassis silhouette, bright reactor, nose direction, and leg grouping must remain bold.
Critical modular construction: REMOVE ALL WINGS AND ALL WING MEMBRANES from every candidate. Show two clean mechanical wing-root sockets on the dorsal chassis, fully visible, so a separately rendered wing layer can attach behind the body. The reactor center and wing-root center must occupy the EXACT SAME normalized pixel location in all sixteen cells. No candidate may lose or duplicate the head, abdomen, legs, reactor, or sockets.
Exact row-major content, two alternatives for each of eight states:
cells 1–2 level cruise/hover, stable compact abdomen and hanging legs;
cells 3–4 pitch-up/climb, nose raised and legs tucked;
cells 5–6 hard bank/turn or pitch-down, abdomen counter-rotated and legs braced;
cells 7–8 dive-lock tell, needle aimed forward/down, chassis tightly loaded but stationary;
cells 9–10 dive-attack, needle and abdomen stretched into a committed dart;
cells 11–12 hit-recoil, asymmetric mechanical flinch with one leg kicked outward but body intact;
cells 13–14 recover/brake, nose lifting, abdomen swung down, legs reopening;
cells 15–16 death-crack, reactor housing visibly cracked and armor sprung apart but still one coherent body ready to hand into debris.
Backdrop: perfectly flat uniform #ff00ff chroma key only.
Composition: exact borderless 4x4 conceptual grid, one complete centered body per cell, generous 12% empty cell margin including every leg tip and loose armor edge, no content touching any cell boundary, all face right, consistent side-on camera, no perspective drift.
Style: premium painterly production sprite, dense mechanical detail, crisp controlled alpha-ready edges, readable value separation, no generic green blob.
Lighting: restrained acid-green reactor and eye only, dark gunmetal and oxidized copper hardware; no broad glow or aura.
Constraints: no text, labels, grid lines, frames, cards, floor, platform, shadow, fog, projectile, muzzle flash, explosion, detached debris, extra creature, generic biological infection; absolutely no wings or triangular green fins; no #ff00ff in the subject; fully visible, uncropped.
Avoid: mascot/cartoon proportions, soft blobs, duplicated anatomy, floating legs, fake motion blur, always-on bloom, strobe-like identity changes, watermark.
