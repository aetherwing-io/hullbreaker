# Level 1 ecology source-board ledger

These files are offline production evidence. The game must load only
`../level1-enemy-ecology-atlas-v1.png`.

Accepted pack inputs:

- `level1-hunters-6x8-chroma-v1.png`
- `level1-hunters-action-a1-a4-3x4-chroma-v2.png` (Vaultjaw/Rebound A1–A4)
- `level1-hunters-railfang-action-a1-a4-1x4-chroma-v3.png` (Railfang leg-read replacement)
- `level1-aerial-body-b0-b3-3x4-chroma-v2.png`
- `level1-aerial-body-b4-b7-3x4-chroma-v2.png`
- `level1-aerial-action-a0-a3-3x4-chroma-v2.png`
- `level1-aerial-action-a4-a7-3x4-chroma-v2.png` (42px FAR-read replacement set)
- `level1-connectors-action-3x8-chroma-v3.png`
- `level1-connectors-body-b0-b3-3x4-chroma-v3.png`
- `level1-connectors-body-b4-b7-3x4-chroma-v3.png`
- `level1-denial-action-3x8-chroma-v2.png`
- `level1-denial-body-b0-b3-3x4-chroma-v3.png`
- `level1-denial-body-b4-b7-3x4-chroma-v3.png`
- `level1-denial-body-b5-b6-3x2-chroma-v5.png` (composed damage-read replacement)

Retained rejected audit copies:

- `level1-connectors-6x8-chroma-v1.png` returned six actual rows, not eight.
- `level1-denial-body-3x8-chroma-v2.png` returned seven actual rows, not eight.
- `level1-denial-body-b5-b6-3x2-chroma-v4.png` remained too subtle after
  composition and made critical Aircomb look upgraded.
- `level1-aerial-6x8-chroma-v1.png` passed structure but collapsed into a dark
  olive blob at actual desktop play scale and let Scatterbloom rounds read as
  the stronger flying silhouette.

They are intentionally absent from the manifest's `sourceSets`. Nine rejected
ImageGen calls, including revisions not copied into this directory, are recorded
with exact prompts and original output references in
`../level1-enemy-ecology-imagegen-provenance-v1.json`.
