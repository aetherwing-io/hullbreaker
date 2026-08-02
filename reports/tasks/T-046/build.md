# T-046 — codex asset batch: 19 candidates, staged and gated

Nineteen assets generated through `tools/assets/gen.mjs` → `codex exec` → rasterize
→ `check.mjs`, every one judged at the size the shipped FAR camera will really draw
it. Nothing is wired into the game: this lane touched `assets/**`,
`tools/assets/**` and `reports/tasks/T-046/**` only.

`node tools/assets/check.mjs` → **PASS**, 38 entries (19 new).
`node tools/pathcheck.mjs` → **1812 passed, 0 failed**.
`node tools/gatecheck.mjs` → **PASS**, 5 controls red where they must be.

Total shipped bytes if every candidate were adopted: **129.1 kB of PNG** (sprites
14.7 kB, backdrops 107.4 kB, textures 7.9 kB). No candidate is adopted; the
operator picks.

---

## 1. What is in the batch

Two candidates for each of the five DESIGN enemy roles (a shape-first read and a
board-faithful read), five backdrop/anatomy elements, four surface textures.

| id | category | png | size | drawn at FAR |
| --- | --- | --- | --- | --- |
| `hound-brace-a` / `-b` | sprites | 0.9 / 1.5 kB | 64x32 | 29.6 x 15.7 px |
| `wasp-drone-a` / `-b` | sprites | 0.8 / 0.8 kB | 32x32 | 17.4 x 17.4 px |
| `carrier-hauler-a` / `-b` | sprites | 0.9 / 0.6 kB | 64x32 | 29.6 x 15.7 px |
| `polyp-iris-a` / `-b` | sprites | 1.5 / 1.7 kB | 64x64 | 31.3 x 37.4 px |
| `mortar-tripod-a` / `-b` | sprites | 2.8 / 2.2 kB | 64x64 | 29.6 x 30.1 px |
| `backdrop-limb-segment` | backdrops | 36.9 kB | 1024x512 | ~1045 x 522 px (60x30 tiles) |
| `backdrop-spine-coil` | backdrops | 30.7 kB | 512x512 | ~522 x 522 px (30x30 tiles) |
| `backdrop-crown-horizon` | backdrops | 9.1 kB | 1024x256 | ~1045 x 261 px (60x15 tiles) |
| `backdrop-colony-cluster` | backdrops | 7.5 kB | 512x256 | ~244 x 122 px (14x7 tiles) |
| `backdrop-gill-cavity` | backdrops | 23.2 kB | 512x512 | ~418 x 418 px (24x24 tiles) |
| `hull-panel-tile` | textures | 1.2 kB | 128x128 | 34.8 px per 2-tile repeat |
| `weld-seam-strip` | textures | 0.3 kB | 128x32 | 69.6 x 17.4 px per repeat |
| `vent-louver-plate` | textures | 2.4 kB | 128x128 | 26.1 px |
| `wear-scuff-overlay` | textures | 4.0 kB | 128x128 | 34.8 px per 2-tile repeat |

Every sprite's drawn size comes from the game's own numbers, not from taste:
`CONFIG.player.height` 1.7 tiles at the FAR view's stated 3.7% of screen height
gives **17.41 px per world tile** at the harness's 1280x800, and each role's box
is its `CONFIG` size (`hound.size` `[1.7,0.9]`, `wasp.visualRadius` 0.5,
`polyp.size`+`barrelTiles`+`rootY`, `mortar.size`+`bodyY`). RIG is 29.6 px in the
same frame.

## 2. Judged at true size first — the sheets

**Look at these before any zoom.** Row 1 of every sheet is the real on-screen
size; 2x and 4x are underneath only to show where the read comes from.

| role | on the rust deck | on the teal fog |
| --- | --- | --- |
| hound | `reports/tasks/T-046/sheet-hound-deck.png` | `sheet-hound-teal.png` |
| wasp | `sheet-wasp-deck.png` | `sheet-wasp-teal.png` |
| carrier | `sheet-carrier-deck.png` | `sheet-carrier-teal.png` |
| polyp | `sheet-polyp-deck.png` | `sheet-polyp-teal.png` |
| mortar | `sheet-mortar-deck.png` | `sheet-mortar-teal.png` |

Column 1 of each sheet is a **control**: the silhouette the game draws today
(`BoxGeometry` / `OctahedronGeometry` / `DodecahedronGeometry` / `ConeGeometry`)
filled with the shipped CONCEPT palette token, in
`reports/tasks/T-046/controls/`. It is the authored color unlit — per the
pipeline README's limitation 11, the renderer's tone mapping lifts and desaturates
what actually lands on screen, so read the controls as *shape and value
relationships*, not as a color match.

Backdrops at true on-screen size, with the frame's RIG height stated in the
title: `scale-backdrop-limb-segment.png`, `scale-backdrop-spine-coil.png`,
`scale-backdrop-crown-horizon.png`, `scale-backdrop-colony-cluster.png`,
`scale-backdrop-gill-cavity.png`.

Textures repeated at true on-screen size: `tile-hull-panel.png`,
`tile-weld-seam.png`, `tile-vent-plate.png`, `tile-wear-overlay.png`.

## 3. What the true-size pass actually showed

Observations, not verdicts. Every one is visible in the named artifact.

- **The shape-vs-detail A/B splits by role, and it splits on VALUE, not on
  detail count.** In `sheet-hound-deck.png` at 15.7 px, `hound-brace-b`'s
  hull-grey legs put a value break under the acid mass and the legs survive;
  `hound-brace-a`'s all-acid body loses its legs and reads as one wedge. Same
  story on teal. Whichever is preferred, the transferable rule is that a small
  sprite keeps the parts that differ in VALUE from their neighbours.
- **The mortar and the polyp gain the most from a sprite.** At 30-37 px the
  control cone and the control bulb are ambiguous shapes; `mortar-tripod-a`
  reads as an aimed launcher (bore + tripod) and `polyp-iris-a` reads as a
  rooted turret with a firing lane, which is exactly what board 07 says those
  two kinds must announce.
- **The wasp is the hardest and the least improved.** Measured: the shipped
  octahedron fills its 1.0-tile box corner to corner (17.4 x 17.4 px), while
  `wasp-drone-a`'s opaque bounding box is 88% x 75% of its canvas — so on the
  same quad it draws **15.2 x 13.1 px** and carries less mass than the diamond
  it replaces. `wasp-drone-b` is 94% x 88% (16.3 x 15.2 px) and darker (56% ink)
  which helps it on the rust deck and hurts it against teal fog. A drone this
  small may be a case where the shape (a dart that points where it dives) is
  worth more than any interior detail — see question 2.
- **Bounding-box fill for the whole set** (opaque bbox as a fraction of canvas):
  carrier-a 94%/100%, carrier-b 94%/94%, hound-a 91%/94%, hound-b 94%/94%,
  mortar-a 100%/94%, mortar-b 97%/94%, polyp-a 91%/91%, polyp-b 94%/94%,
  wasp-a 88%/75%, wasp-b 94%/88%. Whoever wires these in needs these numbers:
  a sprite drawn on a quad sized to the CONFIG box will be smaller than that box
  by exactly this fraction.
- **The hull tile tiles cleanly and still betrays itself.** `tile-hull-panel.png`
  shows no seam, but the single weld bead repeats every 2 tiles and the eye
  counts it. Same defect, worse, in `tile-wear-overlay.png`: at true size the
  wear marks read as a regular polka pattern rather than damage. Fix direction is
  a larger repeat or moving the one-off marks into decals — not a redraw of the
  tile's base.
- **`backdrop-colony-cluster` is the strongest scale argument in the batch** and
  the cheapest (7.5 kB): at true size it is 244 x 122 px of lit windows in rows,
  about four RIG-heights tall, and the windows are what makes the hull behind it
  read as enormous. It is the one asset here that directly serves entry 17's
  "human-scale reference objects placed against enormous features".
- **`backdrop-crown-horizon` keeps magenta to spire tips**, which keeps the
  hot-magenta pickup role uncontested in the play plane while still putting the
  Crown on the horizon (board 14's promise).

## 4. The palette gate did its job — twice, and once for real

- **A real failure, not a drill.** `backdrop-limb-segment`'s first generation
  built its fog steps by stacking ~40 alpha levels of five legal colors. Every
  SVG literal was legal; the composited pixels were not — `#3c5462`, CIELCh
  h 245.0 / chroma 12.2, at **1.73%** coverage, off-palette in every band and
  above the 0.5% gate. `check.mjs` failed the batch. Fixed at the source: the
  spec template now forbids alpha-stacked depth, the asset was regenerated with
  opaque steps (now `deep-teal 85%, haze 8%, ink 3%`, zero alpha literals), and
  the lesson is written into the README as limitation 12.
- **Deliberate break/restore, to show the manifest claims bind.** With
  `wasp-drone-a`'s recorded size falsified to 64x32 and `hound-brace-a`'s
  recorded roles trimmed to `[acid-green]`, `check.mjs` printed:

  ```
  2 problems:
    - hound-brace-a: manifest records roles [acid-green], recomputed [acid-green, ink, rust-orange] (run --write)
    - wasp-drone-a: manifest size 64x32 != actual 32x32 (run --write)
  FAIL
  ```

  Restored from backup, `check.mjs` → PASS. Tree clean (`git status --short`
  shows only this lane's intended files).

Per-asset palette results are in the `check.mjs` output and recorded in
`assets/manifest.json`; the largest ungated blend in the batch is `#37505d` at
0.04%, well under the 0.5% coverage gate.

## 5. Pipeline changes (tools/assets only, no game effect)

1. **`gen.mjs --size WxH` and `--tiles W,H`.** Half this game's subjects are not
   square. A hound is 1.7 x 0.9 tiles; a square canvas either wastes half its
   pixels or invites a composition the asset will never occupy. One number still
   means square, exactly as before.
2. **`gen.mjs --grid` — the design grid, which is the substantive change.** Set
   it to the asset's true on-screen pixel box and the generator is told "one
   viewBox unit is one pixel the player will see; a feature under one unit thick
   does not exist", with the raster a plain 2x oversample. Every sprite here was
   authored on a 16x16 / 32x16 / 32x32 grid. This is the direct answer to the
   defect that opened T-036's readability question — art that looks finished at
   128 px and smears at 9.6 px.
3. **`spec-template.md`**: a small-size art doctrine (silhouette first, 3-4 value
   steps, one accent, contact/orientation) and the opaque-fill rule from §4.
4. **`tile.mjs` (new)**: screenshots a texture repeated at true on-screen size. A
   seam and a countable motif are the only two ways a tiling texture fails and
   neither is visible in one copy. Documented in the README's tool table with its
   own honesty note (limitation 13): flat CSS repeat, no UV mapping, no mipmaps.
5. **README**: tool table, the `--grid` rationale, limitations 12 and 13.

## 6. Integration notes — named precisely, deliberately NOT done

Nine lanes are live and T-040 owns the runtime sprite path, so this lane wired
nothing. What adoption would need:

- **A sprite loader in the render layer** (`src/render/hostiles.js` swapping the
  per-kind `geo` for a billboarded `PlaneGeometry` + `THREE.TextureLoader`,
  `magFilter: THREE.NearestFilter` for the sprite grid to stay crisp,
  `colorSpace = THREE.SRGBColorSpace` — see README limitation 11 for why the
  unset colorSpace matters). Entry 16 requires the failure path: on load error
  keep the current procedural mesh, surface it in the T-032 failure panel, and
  never let the sim branch on it.
- **The quad must be sized from the CONFIG box divided by the bbox fill in §3**,
  or every sprite draws smaller than the hitbox it represents. The wasp is the
  case where that error is 25% in area.
- **Facing**: every sprite is authored facing RIGHT; the render mirrors on
  `e.dir` (`scale.x = -1`), which is free.
- **State theater is already render-side and should stay**: `houndPose`,
  `polypPose`, `waspPose`, `mortarPose`, the tell lamps and the hit-flash tint
  all operate on scale/emissive and work unchanged on a textured quad, except
  that `emissive` has no effect on `MeshBasicMaterial` — the flash would have to
  become a color multiply or a second additive quad. That is a real design
  decision, not a port, and it belongs to whoever owns the sprite path.
- **Backdrops** are the natural fit for T-045's tier work: they are billboards at
  fixed depth, not geometry, and their fog steps are baked. They must sit behind
  the play-band fence that lane is asserting.

**`check.mjs`'s independence gate, as entry 16 asks.** It currently fails any
static ES import of an `assets/` path from `src/`, and today `src/` contains no
reference to `assets/` at all, so it is green and harmless. It should be re-aimed,
not deleted, and the new contract is testable:

- keep the static-import rejection (a hard import still makes art a boot
  dependency, which entry 16 explicitly did not authorize);
- add: every runtime asset reference found in `src/` must sit in a module that
  also references the failure surface, or be accompanied by an `onError`/`catch`
  in the same statement region — i.e. prove the degrade path exists at the site;
- add: no file under `src/sim/` or `src/pure/` may reference `assets/` at all,
  in any form — that is the "gameplay must not branch on whether art loaded"
  half of the contract, and it is the half a machine can actually check;
- prove both by fixtures the way `fixtures/multiline-import` and
  `fixtures/runtime-reference` already prove the current rule, and wire them into
  `tools/gatecheck.mjs`.

I did not implement this: it changes a gate other lanes are running against
during a nine-lane session, and the fixture work is a task, not a side effect.

## PROPOSED INBOX ISSUES

```
## I-??? | art | S3 | repro: node tools/assets/tile.mjs assets/generated/textures/wear-scuff-overlay.png --tiles 2 --bg deck | evidence: reports/tasks/T-046/tile-wear-overlay.png
The wear overlay tiles seamlessly but its motif is countable: at the true 2-tile
repeat (34.8px) the chips and bleeds read as a regular polka pattern rather than
damage, which is the opposite of what an overlay is for. Same defect in milder
form in hull-panel-tile, where the single weld bead repeats every 2 tiles. Fix
direction: author the base tile with no one-off marks at all and move chips,
bleeds and the weld bead into sparse decals placed by the render layer, or take
the repeat out to 4-8 tiles.
```

```
## I-??? | art | S3 | repro: node tools/assets/view.mjs assets/generated/backdrops/backdrop-limb-segment.png --tiles 30 | evidence: reports/tasks/T-046/scale-backdrop-limb-segment.png
tools/assets/viewer.html cannot display an asset taller than roughly the
viewport: at --tiles 30 (522px of an 800px frame) it screenshots an empty page,
and raising the viewport only rescales the arithmetic. Backdrop evidence in this
report had to be produced through sheet.mjs with an explicit --cell instead. The
viewer's 2x/4x/8x ramp is also meaningless for an asset that is already half the
screen. Fix direction: clamp or drop the ramp above some size and let the primary
stop scroll.
```

## Questions for the operator

Each names an artifact to look at. None can be answered by a machine.

1. **Sprites at all, for these five?** Sheets `sheet-*-deck.png` row 1 put the
   shipped flat-shaded primitive next to two sprite candidates at the exact size
   the game draws them. Is the sprite direction worth taking for the whole
   hostile roster, for some of it (the mortar and polyp gain most), or not yet?
2. **Wasp: shape or detail?** `sheet-wasp-deck.png` / `sheet-wasp-teal.png`. At
   17 px the shipped diamond has more mass than either candidate. Is a swarm
   drone better served by a bolder abstract shape that always reads (and takes
   its meaning from the dive pose the render already does), rather than a
   miniature machine?
3. **Which read for the hound and the carrier — `-a` or `-b`?** `-a` is one bold
   mass, `-b` carries board 06's plates and legs with a hull-grey value break.
   `sheet-hound-deck.png`, `sheet-carrier-deck.png`.
4. **Is `backdrop-colony-cluster` the scale lever you want pushed hardest?**
   `scale-backdrop-colony-cluster.png`. It is 7.5 kB, it is a town of lit windows
   about four RIG-heights tall, and it says "this machine is inhabited" in one
   glance. If yes, the follow-up batch should be four more of these at varying
   distances rather than more enemy variants.
5. **How much rust may the backdrop tiers carry?** `backdrop-gill-cavity` puts a
   rust-orange lip (34% of the asset) on a mid-distance element, which reads as
   anatomy but competes with the deck's "you can stand here" language. The other
   four backdrops are teal/haze only. Should distance be strictly teal?

## Honesty limits

- **Every sheet, view and tile capture is a flat composite** — no fog, no
  perspective, no lighting, no mipmapping, no tone mapping, and no three.js
  material. They answer "does this read at this size", never "does this look
  right in the scene". Nothing here has been seen inside the game, because
  nothing here is wired into the game.
- **The controls are authored colors, unlit.** README limitation 11 measured the
  gap on the shipped capsule: `#ff4fd8` lands on screen at luminance 182.7 and
  chroma 33.2 against 126.3 / ~76 authored. Trust value relationships in this
  report; do not trust its hues or absolute levels.
- **A green `check.mjs` is not an art verdict.** It proves no hue strayed outside
  a measured band and that the manifest cannot lie about size or palette. It says
  nothing about whether these belong in the game.
- **Generation is nondeterministic.** Re-running any spec in
  `tools/assets/runs/spec-<id>.md` produces a different asset. The specs are the
  prompt of record; the committed SVG/PNG pairs are the artifacts.
- **No performance claim is made.** Nineteen textures at 129 kB is a byte cost,
  not a frame cost; draw calls, texture binds and atlas questions belong to
  whoever wires them in.
