# Meridian native component atlas v1 — production provenance

Generated with the built-in OpenAI ImageGen tool on 2026-08-04, reviewed as
two 4×4 chroma boards, and packed by
`tools/assets/pack-foreground-components.mjs` into one 2048×1024 RGBA runtime
atlas. These are native-shaped mechanical cutouts—not decals, cards or square
tiles—and complement the opaque body-material pack documented in
`meridian-foreground-pack-v1.prompt.md`.

The exact unedited ImageGen prompts, reference lists, tool call identifiers and
original output paths for both boards and the D-defense replacement are stored
in the adjacent indexed audit file
`meridian-foreground-imagegen-provenance-v1.json`.

## Source index

| Board | Production source | Original built-in ImageGen output | Contents |
| --- | --- | --- | --- |
| Structure | `foreground-pack-sources/meridian-components-structure-chroma-v1.png` | `/Users/scottmeyer/.codex/generated_images/019fca44-054a-73e2-bf97-add9bf75d6b6/exec-8aedebcb-6fe8-4045-955a-c2ec5d244270.png` | Route caps, scutes, girders, rails, braces, ladder, pipes, conduits, silhouette armor, vent and Scuttle fragment |
| Defense | `foreground-pack-sources/meridian-components-defense-chroma-v1.png` | `/Users/scottmeyer/.codex/generated_images/019fca44-054a-73e2-bf97-add9bf75d6b6/exec-609e6d10-b241-48be-b4cf-44e51ade1eed.png` | Observe, Intercept, Contain, Quarantine, Sterilize and Scuttle response hardware |

Both sources are 1254×1254 opaque RGB images with exactly sixteen connected
assemblies. Each was approved in its native 4×4 board before extraction. The
shared direction is orthographic cold oxidized teal machinery with restrained
burnt-copper wear, deep recesses and small-scale silhouette clarity. Ambient
emission is off; any state tell is tiny, physical and housed.

## Extraction and packing

The packer derives alpha from the flat `#22F01F` authoring matte, clamps green
spill, finds one connected assembly per conceptual source cell, expands its
measured bounds by six source pixels, contracts the keyed contour by one source
pixel, and proportionally downsamples it with Lanczos filtering. It then trims
to the true visible shape, centers that shape in a guarded 256×256 atlas cell,
and records its exact visible rectangle, native aspect, pivot, legal stretch
axes, rotations, mirror policy, anchors, sockets, depth band, state range,
rarity and gameplay role.

The square cells are storage only. Runtime planes sample measured visible
bounds, preserve native aspect and permit non-uniform scaling only on declared
rail, pipe, beam or ladder axes. Circular irises, clamp jaws, rupture shapes and
irregular silhouettes cannot be stretched.

The resulting runtime asset is
`assets/generated/environment/meridian-component-atlas-v1.png`: 2048×1024
RGBA, 32 reviewed components, one GPU texture, no emissive map. The atlas owns
an 18 px-or-greater transparent guard around every extracted assembly. The
adjacent `meridian-component-atlas-v1.edge-proof.png` composites eight contour
stress cases at 1:1 over black, cold hull and warm metal for review.

## Runtime vocabulary

The 32 components form eight visual categories: trim caps, beam braces,
ladder/rails, pipe/conduit, near silhouettes, a service organ, canonical
defense-state hardware and Scuttle damage. Their metadata exposes nine usable
socket families: traversal, spawn, interlock, clamp, defense, pressure, power,
vent and rupture.

Defense-state selection follows the canonical route mapping exactly:

1. Observe
2. Intercept
3. Contain
4. Quarantine
5. Sterilize
6. Scuttle

The short intro shares Observe and does not consume a stage. Response sockets
are deterministic, off the player route, carry safe-radius and tell-lead
metadata, and are intentionally renderer-agnostic so later directors can deploy
real hazards from the same authored interfaces without guessing from pixels.

## Review status

- Both 16-component boards: approved.
- Extracted atlas and 1:1 edge proof: approved.
- Full-resolution green remnant: zero.
- Partial-alpha edge green remnant: zero.
- Non-uniform stretch: restricted by component metadata.
- Runtime material: ordinary scene-lit metal, alpha-tested, depth-writing,
  non-emissive.
- Gameplay capture: desktop face 1, first turn, Quarantine, Scuttle and portrait
  face 1; no square cards, green fringe or illegal stretch observed.
