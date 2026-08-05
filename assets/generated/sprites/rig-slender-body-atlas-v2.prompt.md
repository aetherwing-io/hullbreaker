# RIG slender body atlas v2

Promoted on 2026-08-03 from the operator-approved slender RIG identity board.

Identity and generation source:

- `assets/generated/sprites/rig-slender-core-palette-v2.png` (`1449×1086`, RGBA)
- `assets/generated/sprites/rig-slender-core-palette-v2.prompt.md` contains the complete ImageGen prompt and original generated-image provenance.
- Concept target: `docs/concept-art/04-six-phase-escalation.png`

Production selection:

- Idle weapon-mount brace, run contact, run pass, run flight, jump rise, and fall/apex gather were selected from cells 0–5 of the approved 4×4 identity board.
- The generated launch cell was deliberately not promoted: rise and fall already provide the two materially distinct airborne silhouettes needed by the runtime, while the selected six poses are whole, uncropped, and keep one coherent armor identity.
- A separate generated 4×2 candidate was rejected and quarantined because one flight cell was cropped by the generated canvas edge. It is not a production dependency.

Deterministic finishing:

- `node tools/assets/repack-rig-slender.mjs`
- Connected-component extraction retains exactly one complete actor assembly in each intended source cell and rejects disconnected ImageGen debris.
- Pixels are copied 1:1 into six `512×512` windows on a `2048×1024` power-of-two RGBA atlas. No pose is resampled, stretched, rotated, redrawn, or inferred.
- Every used cell has at least 24 transparent pixels of guard. Exact source rectangles, output alpha bounds, rejected components, and measured guards are recorded in `rig-slender-body-atlas-v2.layout.json`.
- Palette finishing leaves every legal pixel byte-for-byte and only reduces the chroma of colors that fall outside Hullbreaker's declared palette bands. Geometry and alpha are untouched; the measured correction is recorded in the layout JSON.

Runtime contract:

- Top row: idle, run contact, run pass, run flight.
- Lower row, first two cells: air rise, air fall.
- Body only. The independently rotating weapon plane stays attached to the simulation muzzle and no baked weapon is present.
- The common pixel-to-world scale preserves relative pose proportions instead of stretching every trim to a uniform box.

