# Meridian Defense Activation VFX Pack

This is a reviewed, data-only content pack for making the *Meridian* visibly
wake, lock, pressurize, seal, reroute, tear, sterilize, and finally rupture.
It follows the story escalation in `STORY.md`: Observe → Intercept → Contain →
Quarantine → Sterilize → Scuttle. It is wired only as an **environmental
system—never through gameplay actors**: the integration is an isolated
hull-response renderer plus a renderer-free lifecycle/controller. It has no
hidden scene or preload side effects.

## Contents and budget

| Defense response | Reusable transient family | Components |
| --- | --- | ---: |
| Observe | sensor wake / directional scan | 8 |
| Intercept | lock / clamp action | 8 |
| Contain | pressure inhale / vent | 8 |
| Quarantine | seam sparks / dust | 8 |
| Quarantine–Sterilize | power reroute / arcs | 8 |
| Scuttle | armor shear / debris | 8 |
| Sterilize | aperture / discharge | 8 |
| Scuttle | rupture / cable / smoke | 8 |

Every family has the same lifecycle contract: **2 tells, 3 fires, 2 recovery
effects, 1 spent effect**. Across the pack that is 16 tells, 24 fires, 16
recoveries, and 8 spent components. Dormant means `draw-nothing`; there is no
idle sprite and no always-on glow.

The runtime payload is one 1024×512 RGBA texture (2 MiB uncompressed), not four
large source boards:

- `assets/generated/vfx/meridian-defense-vfx-pack-v1.png`
- `assets/generated/vfx/meridian-defense-vfx-pack-v1.manifest.json`
- `src/render/defense-vfx-pack.js` — generated, frozen, data-only lookup module
- `assets/generated/vfx/meridian-defense-vfx-spec-v1.json` — authored timing and
  placement contract

The largest component dimension is 104 px. Native silhouette aspect ratios are
preserved; 58/64 are intentionally non-square. The runtime never performs a
crop, connected-component search, or source-sheet subdivision.

## Integration contract

Each manifest component publishes:

- `packedRectPx` and `uv`: ready atlas bounds;
- `visibleBounds`: normalized visible bounds in its original conceptual cell;
- `pivot` and `origin`: normalized within the packed component rectangle;
- `direction` and `axis`: world-space semantic vectors, where `+x` is right and
  `+y` is up (do not reinterpret these as image pixel coordinates);
- `stretchAxes`, `rotate`, and `mirror`: the only allowed transformations;
- `mount`: required mechanical hull socket, seam, aperture, vent, cable, or
  surface attachment;
- `depth`: `behind-action`, `action-plane`, or `front-particles`;
- `timingState`, `durationMs`, `leadMs`, `maxOpacity`, and `emissiveStage`;
- `islandCount` and `allIslandsRetained`: crop review evidence, including loose
  sparks, paired jaws, smoke, and disconnected debris.

The pack is `environmentOnly`. Attaching any component to `rig`, `player`, or
`projectile` is explicitly forbidden. Sensor and clamp shapes can resemble
fast ammunition when floating in space, so their origin must stay bolted to a
hull socket or seam. Sheet A tells are capped at 0.30 opacity; all tells are
capped at 0.38. They become bright only in `fire`, then decay and clear.

Suggested event flow:

1. Select a component by defense state and lifecycle state.
2. Place its `origin` at the specified `mount` on visible Meridian structure.
3. Rotate/mirror only when metadata permits; stretch only on listed axes.
4. Render at the declared `depth` and never exceed `maxOpacity`.
5. Advance after `durationMs`; after `spent`, release it to the existing pool.
6. Render nothing while dormant.

This makes a tell communicate **where**, **which direction**, and **for how
long** without adding a generic danger halo or persistent biological glow.

The live bridge follows that contract in four isolated modules:

- `src/pure/meridian-defense-lifecycle.js` owns deterministic face timing;
- `src/sim/meridian-defense.js` queues one bounded pressure-environment signal
  at fire onset and never directly or gate-spawns a hostile;
- `src/render/defense-vfx-art.js` owns the single atlas preload and render-only
  escape hatch;
- `src/render/meridian-defense-vfx.js` resolves current-face, corner-safe
  `foregroundResponseSockets()` onto one pooled quad. Dormant, gates, turns,
  finales, and resets submit zero response draws.

## Source and crop review

The ImageGen sources live in `assets/generated/vfx/source-sheets/`. Every
accepted board has its original RGB image, chroma-key-to-alpha result, exact
prompt, references, ImageGen provenance path, and review note. Generation used
the built-in OpenAI ImageGen tool; alpha extraction used the installed ImageGen
skill's `remove_chroma_key.py` with border auto-key, soft matte, thresholds
12/220, and despill.

The packer finds transparent separator bands rather than assuming equal source
quarters. At alpha 64, the accepted sheets have a minimum opaque gutter of 9
px; the apparent edge cases on source A's top-right and source D's top-left do
not touch their cells. A's paired clamp jaws intentionally contain disconnected
islands, and the full cell alpha bounds retain both jaws.

Contain/Quarantine source B v1 is retained as rejected provenance. Its last two
cells met at a separator during alpha-bound review, so a spacing-only ImageGen
edit produced B v2. Only B v2 enters the production atlas; it has a 26 px
minimum opaque gutter.

After packing, a deterministic palette finisher moves only off-band RGB toward
equal-channel luma while preserving geometry and alpha. The final raster audit
reports 100% in-band mass, zero off-band mass, and zero alien mass across the
project's eight color roles.

## Rebuild and review

Fast, server-free review is intentional; it avoids pegging the machine just to
inspect content:

```sh
node tools/assets/pack-defense-vfx.mjs
node tools/defense-vfx-pack-check.mjs
node tools/playtest/defense-vfx-pack-capture.mjs
```

The contract gate covers counts, lifecycle balance, timing, opacity, mounting,
direction, transform permissions, bounds, gutters, islands, atlas overlap,
texture memory, alpha, palette, module purity, and the fact that only the
isolated art owner and environment renderer consume the pack.

The capture tool writes four proofs to
`/private/tmp/hullbreaker-defense-vfx-proof/`:

- `contact-sheet-native-opacity.png` — all 64 at native packed scale and their
  metadata opacity;
- `cold-hull-observe-intercept-tells.png` — A's low-emission tells attached to
  sockets and a seam;
- `warm-hull-observe-intercept-active.png` — the same mechanical grammar in
  fire/recovery;
- `observe-intercept-lifecycle.png` — empty dormant state through spent/clear.

These are flat review composites, not shipped art. They exist to catch weak
silhouettes, accidental projectile reads, bad origins, over-bright tells, lost
islands, and halo problems before an integration lane touches gameplay.
