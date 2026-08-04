# Crown modular asset pipeline

The Crown is a reusable four-organ kit assembled in world space. It is not a
single finale illustration. All art settles at the shared boot preload gate;
the run performs no image fetch, decode, crop, canvas pass, texture upload, or
geometry allocation.

## Source organs and attachment anchors

Attachment pixels are measured from the top-left of the named source image or
atlas cell. The ImageGen masters are retained beside their prompts. Production
loads two Lanczos-filtered 1024×1024 power-of-two packs; the world-plane aspect
restores the master's geometry while the smaller resident textures reduce the
combined GPU allocation by roughly one third. Runtime geometry owns placement
and occlusion; the anchors below are the stable interfaces for later variants.

| Role | Source | Rect/cell | Attachment anchor | Runtime job |
| --- | --- | --- | --- | --- |
| `core` | `crown-command-core-runtime-v2.png` | 1024×1024 full image | 512, 990 | Recessed iris, machinery and cable trunk |
| `rootLeft` | `crown-command-kit-runtime-v2.png` | cell 0,1 (512×512) | 473, 126 | Broad left hull-to-core emergence |
| `rootRight` | `crown-command-kit-runtime-v2.png` | cell 1,1 (512×512) | 41, 131 | Asymmetric right maintenance root |
| `antenna` | `crown-command-kit-runtime-v2.png` | cell 1,0 (512×512) | 256, 488 | Upper receiver and relay cluster |

The atlas keeps its unused top-left alternate core available for future Crown
mutations without another texture. UV-mapped cell geometry shares one atlas
upload; no runtime crop duplicates its pixels. The 1086×1448 core master and
1254×1254 kit master remain the regeneration sources, not runtime residents.

## Depth stack

Back-to-front, the production stack is:

1. dark recessed backplane;
2. command core and antenna organs;
3. separate left/right root organs;
4. tapered shell cuffs and buried summit roots;
5. bowed conductor casings and three independent signal nerves;
6. multi-depth iris well, turbine vanes, rings and six physical shutters;
7. one hinged damaged shoulder, still behind the combat plane.

The painted boundaries are deliberately crossed and hidden by another layer.
The playable plane remains depth 0; the closest Crown surface stays beyond
depth -1.5 so RIG, enemies, projectiles and telegraphs always read first.

## State layers

| State | Fixed art | Mechanical/readability change |
| --- | --- | --- |
| Approach | all four organs | Iris closed; all emissive materials at `glowOff`; only tiny painted practical nodes remain |
| Warden occupation | same architecture | Root conductor stage and first relay wake; no shell or art tint |
| Exposed | same architecture | Iris conductor/ring stage wakes and shutters begin opening |
| Rupture | same architecture | Antenna conductor stage wakes; damaged shoulder hinges outward |
| Signal | same architecture | Iris fully open, carrier launches, action-only shock rings and beam appear |
| Reset | same architecture | Conductors decay to `glowOff`, shutters close, shoulder returns, carrier clock stops |

`src/render/crown-art.js` is the machine-readable pack contract.
`src/pure/crown.js` owns immutable world anchors and depths.
`src/render/crown.js` consumes those contracts and owns fixed mechanisms.
`src/render/finale.js` projects simulation snapshots onto the state layers.

## Extension rules

- A new Crown variant may replace any organ independently, but must retain the
  role name and attachment anchor.
- A new infection/mutation skin should reuse the same roots and mechanisms,
  changing only one atlas cell or the core source where possible.
- Painted glow is limited to small practical nodes. Large glow, beam, rings,
  flashes and bloom belong only to attack, exposure, rupture or signal states.
- Never composite the four organs into one production panorama.
- Never move the command axis for portrait framing. Camera framing adapts to
  the world; the world does not teleport to the camera.
