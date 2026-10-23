# `tools/rig-grip/` — does RIG's weapon sit in his hands?

T-103 tooling. The operator's report (decisions.md entry 20): *"the models are a
little off (like guns don't align to hands)."* Every painted RIG frame held its
fists at chest or shoulder height while the simulation fires from a hip-height
hand socket (`CONFIG.player.muzzleY` = 1.05 tiles, 0.82-tile barrel), so the
weapon hung 15-28 css px (desktop FAR) from the nearest painted fist. The fix
removes the painted arms from the frames (`tools/assets/rig-arm-surgery.mjs`,
erase or 1:1 clone only) and re-poses RIG's own arm, cut from his aim painting,
onto the weapon's painted grip every frame (`src/pure/rig.js` `rigArmPose`).

| file | what it is |
|---|---|
| `raster.mjs` | Deterministic software compositor: draws the shipped atlases through the same placement functions `src/render/player.js` runs (`rigBodyPoint`, `rigWeaponPlacement`, `rigArmPose`, `rigArmSegmentCorners`). Also writes PNGs. |
| `check.mjs` | The measured gate (`runGripCheck`): re-measures every anchor from painted pixels, then for every combination checks the rendered fist centroid against the rendered grip centroid (bound 1 atlas px) and the rendered muzzle face against the sim spawn (bound 1 desktop-FAR px). Accepts fault injection so the gate can prove it binds. Run by `tools/pathcheck/t-103-rig-grip-alignment.mjs`, or directly: `node tools/rig-grip/check.mjs [--json]` prints the stats and every failure and exits 1 on any failure. |
| `preview.mjs` | Fast offline contact sheet (no browser): `node tools/rig-grip/preview.mjs --out x.png --gun F --ppt 120 --frames aim-right,contact --aims right,up`. |
| `capture.mjs` | The live half: boots the real game, pauses it, drives the shipped presentation hook (`view.player.sync`) through every pose x aim x facing x weapon, reads the live mesh geometry + `matrixWorld` to measure fist-vs-grip and muzzle-vs-spawn on screen, photographs each cell, and composes true-size and 4x sheets. Works against pre-T-103 trees (`--root <exported tree>`) using a table of the old painted fist positions. `--firing` captures RIG actually firing in four directions with the real background; `--crouch` boots `?crouch=1` for the crouch row. |
| `symmetry.mjs` | The shading half the geometric gates cannot see: `node tools/rig-grip/symmetry.mjs <capture dir> [--view desktop]` pairs every right-facing cell with the left-facing cell of the mirrored aim and compares the figure's mean colour; exit 0 only if the aggregate is symmetric (mean luma ratio L/R 1.000 +- 0.005, mean RGB delta within +-0.5, no pose row off by more than 0.015). Pre-T-103 main: 0.9996, exit 0. T-103 before its winding fix: 0.958, exit 1. Node port of the T-103 playtester's script, same numbers. |
| `compose.mjs` | BEFORE/AFTER sheets from two (or more, merged) capture dirs: every pose row twice, BEFORE above AFTER, with the live measurements in the row header (and per cell at 4x). The 4x sheet is the true-size capture magnified by nearest neighbour. |

```sh
node tools/pathcheck.mjs                                   # includes the T-103 domains (d77 grip, d78 arm winding)
node tools/rig-grip/check.mjs                              # the grip gate alone; exit 1 on any failure
node tools/rig-grip/capture.mjs --out /tmp/cap --views desktop,phone
node tools/rig-grip/capture.mjs --out /tmp/before --root /path/to/exported/base --label BEFORE
node tools/rig-grip/capture.mjs --out /tmp/fire --views phone --firing
node tools/rig-grip/compose.mjs --before /tmp/before --after /tmp/cap --out /tmp/sheets --guns RSLHF --scales 1,4
node tools/rig-grip/symmetry.mjs /tmp/cap                  # facing-left vs facing-right shading; exit 1 if lopsided
```

Every capture/compose run binds only the OS-assigned ephemeral port of the
repo's `withIsolatedBrowser` helper (never 8741/8742).

## Honesty / limitations

- `raster.mjs` is not a GPU: nearest texel, no mipmaps, lighting, tone mapping
  or bloom. Its claims are about GEOMETRY (where painted pixels land), which is
  what alignment needs. `check.mjs` uses the exact affine centroid of the
  painted pixels and cross-checks it against a literal rasterization on a
  sample (agreement within 0.3 atlas px is asserted).
- `raster.mjs`, `check.mjs`, d77 and the fist-to-grip capture are all blind to
  shading. When T-103's arms were drawn as back faces facing left, every one of
  them stayed green; the T-103 playtest caught it by colour. `symmetry.mjs`
  measures that colour, and `tools/pathcheck/t-103-arm-winding.mjs` (d78) holds
  its cause, the triangle winding and the FrontSide material.
- The gate measures centroids. "Fist on grip" means the alpha centroid of the
  painted closed fist lands on the alpha centroid of the painted pistol grip;
  it does not judge whether the result LOOKS held. That is the operator's call
  at true size (`capture.mjs` sheets).
- `capture.mjs` isolates RIG for the matrix sheets (world objects hidden, lights,
  materials, tone mapping and bloom unchanged) because SwiftShader draws the full
  Meridian at under 1 fps on a loaded host; `--in-situ` and `--firing` keep the
  world. The climb rows are staged on the deck column so every cell shares one
  camera geometry; the presentation reads only the traversal state.
- "Death" is the respawn drop `loseLife()` produces: the game has no death pose.
  The hit row stages a real `damagePlayer()` and photographs the VISIBLE phase of
  the i-frame blink (the hidden phase hides body, arms and weapon together).
- Portrait (actor visual gain 1.5) cannot satisfy hand-on-grip, muzzle-on-spawn and
  boots-on-deck at once with natural arms: the gun stays on the sim's hip-height
  bore while the body is drawn 1.5x. The arms stretch to keep the hands on the
  weapon (median x1.23, worst x1.61 of their FAR length). Reported, bounded, not
  hidden — see reports/tasks/T-103/build.md.
