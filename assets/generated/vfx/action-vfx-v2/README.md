# Hullbreaker action VFX v2

Asset-only production candidate pack for high-quality combat, enemy rupture,
Meridian response, and Crown-finale punctuation. It does not replace v1 and no
runtime module references it yet.

## Atlas contract

- `action-vfx-atlas-v2.png`: 1024×1024 RGBA8, one 4 MiB GPU texture.
- 8×8 logical grid, 128×128 cells; every source cell was independently
  cropped, trimmed, aspect-preserved, fitted to at most 116×116, and centered.
- Atlas quadrants: A rifle/scatter, B laser/homing, C combustion/enemy rupture,
  D Meridian/Warden/Crown.
- The manifest publishes a tight visible UV, native aspect, pivot, timing,
  screen-size floor, tint policy, and review verdict for every cell.
- Runtime tint owns cyan, magenta, acid green, and weapon identity. The baked
  atlas contains charcoal, copper, ivory, and neutral value only.

## Review contract

`action-vfx-v2.manifest.json` is authoritative. Of 64 auditable candidates,
59 are production-recommended: 42 survive 12–48px and 17 fine streaks are
restricted to 24–48px. Five cells are explicitly rejected and must never be
selected: `h-broken-crosscut`, `h-spent-hardware`, `f-double-vent-wisp`,
`enemy-rise-vapor`, and `enemy-side-vent`.

The rejected cells remain in the source/atlas so the review is reproducible;
they are not silent dead art. The smoke candidates preserve ImageGen evidence
but are excluded because they bring back v1's soft cloud vocabulary.

## Evidence

- `action-vfx-v2-contact-sheet.png`: full reviewed 8×8 vocabulary.
- `proofs/action-vfx-v2-{12,24,48}px-proof.png`: real minification first, then
  nearest-neighbor enlargement for inspection.
- `action-vfx-v2.provenance.json`: original built-in ImageGen outputs, hashes,
  chroma-removal settings, references, and selected/rejected reasoning.
- `PROMPTS.md`: the four complete generation prompts.

Rebuild the final atlas and data files with:

```sh
node tools/assets/build-action-vfx-v2.mjs
```
