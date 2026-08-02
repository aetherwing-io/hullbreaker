# T-052 — hull surface textures bound to the limb's material buckets

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-052`,
branch `task/T-052`, built on top of `5c8008e` (T-049's fixed shared preload
gate).

The four generated tiles in `assets/generated/textures/` (`hull-panel-tile`,
`weld-seam-strip`, `vent-louver-plate`, `wear-scuff-overlay`) are now bound as
albedo (+ a reused bump) on `src/render/limb.js`'s InstancedMesh material
buckets — the only large hull surfaces this lane's fence reaches
(`src/render/level.js` and `transform.js` are other lanes' concurrent work
this cycle, same as the `deck`/`plate`/`machine`/`distant` `SURFACE` families
were already left for them). ON by default (decisions.md entry 16), `?tex=flat`
is the A/B and the escape hatch, and every texture goes through the shared
`preload.js` boot gate T-049 fixed, so nothing decodes or uploads mid-run.

## 1. What changed, and why each call landed where it did

`src/render/limb.js` bakes eight InstancedMesh material buckets keyed by name
(`MATERIAL_FOR`). Five get a texture:

| bucket | kinds it covers | texture | why |
| --- | --- | --- | --- |
| `hull` | `hull`, `bdLimb` | hull-panel-tile + wear-scuff-overlay (composited) | the under-deck armour mass RIG runs directly beside — nearest large surface, full treatment |
| `wall` | `wall`, `collar`, `buttress`, `bdDrum` | hull-panel-tile (raw, no wear) | the body behind the combat plane, a tier further back (`depth -6` vs hull's `-1.1`) |
| `scute` | `scute`, `bdRing` | vent-louver-plate + wear-scuff-overlay (composited) | the overlapping skin shingles, the other near surface RIG stands beside |
| `shadow` | `hullRib`, `wallSeam`, `wallCap`, `tendon`, `bdLink`, `markPanel` | weld-seam-strip | this file's own manifest note — "deck-edge lip strip" — names this trim exactly |
| `rib`, `machine`, `skyline`, `scuteAlt` | joint ridges, human-scale fixtures, the silhouette tier, the 0.7-tile skin rib | *(none — family only)* | thin fixtures a tiled panel would smear across, and `skyline` is the tier CONFIG's own comment says must stay "silhouettes, never readable surfaces" |

Every bucket also gets a `SURFACE` family (`applySurface`) it did not have
before (`materials.js`'s roughness/metalness/envMap table, entry 18) — `hull`/
`scute` → `plate`, `wall`/`shadow` → `distant`, `rib`/`machine` → `machine`,
`skyline` → `distant`.

**Reinforcing the depth split, not flattening it** (`limb.js:65-78`'s "warm
near, cool far" note, and the task's binding constraint): `hull` and `scute`
get the sharp map, a bump (the same map reused as a height field — free), and
the wear overlay composited in. `wall` gets the bare albedo at roughly a third
of the bump strength and no wear pass — less relief is less contrast under the
same key light, the material-response half of atmospheric perspective. `shadow`
gets a middling bump. None of this fights the scene fog, which already grades
every one of these harder the further back a piece's `depth` sits.

## 2. Tiling density — rendered, not arithmetic-and-move-on

Every repeat value is `piece size / the tile's own authored world-tile size`
(each PNG's manifest note: hull-panel-tile "~2x2 tile repeat", vent-louver-plate
"~1.5x1.5 tiles", weld-seam-strip "~4x1 tiles"), computed live from
`CONFIG.limb`'s own numbers in the new `src/render/hulltiles.js` (§4) rather
than typed once and left to drift. Verified with `tools/assets/tile.mjs` and a
running dev server before locking any value in:

```
node tools/assets/tile.mjs assets/generated/textures/hull-panel-tile.png --tiles 2
node tools/assets/tile.mjs assets/generated/textures/vent-louver-plate.png --tiles 1.5
node tools/assets/tile.mjs assets/generated/textures/weld-seam-strip.png --tiles 4,1
```

The load-bearing check was an actual in-game capture next to a human-scale
reference object (a ladder, the mark objects T-045 placed for exactly this
calibration) — see §3. The panel lines read as individual, human-plausible
plates beside the ladder rungs, neither a screen-door of tiny repeats nor a
single blown-up copy.

**Known approximation, reported rather than hidden**: `repeat` is a property
of the material's Texture object, shared by every instance in a bucket.
`hull`'s repeat is tuned against the `hull` kind's own (chunkCols, hull.drop);
its co-tenant `bdLimb` (T-045's tier-1 backdrop sister limb, much smaller
per-piece) shares the same per-unit density and so shows a proportionally
different tile count on its own smaller faces. Same for `bdDrum` inside `wall`
and `bdRing` inside `scute`. Correcting this needs a per-instance UV scale
(an `onBeforeCompile` shader tweak reading `instanceMatrix`'s own scale) that
this pass does not add — the backdrop tiers are small, distant, and in haze,
so the compromise is judged low-stakes here, but it is a real approximation,
not a rounding error.

## 3. Degrade safety (decisions.md entry 16's condition)

Every load goes through the shared `preload.js` gate — registered at module
scope in `materials.js`, awaited before the module finishes evaluating, so
nothing decodes or uploads mid-run. `applyHullTexture()` is a no-op for any
bucket whose texture never arrived, exactly like `applySurface()` is a no-op
for an unknown family: the material is left exactly as flat as it was before
this task.

**Proved, not assumed** — temporarily pointed the `hull-panel-tile.png`
registration at a nonexistent file, reloaded, then reverted:

```
[warning] HULLBREAKER art: hull texture hull-panel-tile.png did not load
          (error) — the flat material stays.
TITLE: SELFTEST PASS (39 checks)
SNAP.hullTex.buckets: ["wall","scute","shadow"]   // "hull" correctly absent
```

The game booted, the selftest still passed 39/39, and every OTHER bucket
loaded normally — one failed asset did not take down the rest or the sim.
`git diff HEAD --stat` was empty after reverting the probe edit.

## 4. `src/render/hulltiles.js` — one new file, and why

My fence named `src/render/materials.js`, `src/render/limb.js`, and a new
pathcheck file. I added one more: `src/render/hulltiles.js`, a Node-safe
(no `THREE`, no DOM) module holding the tiling arithmetic and the `?tex=`
flag resolver. **Why it was necessary rather than optional polish**:
`materials.js` and `limb.js` both import `three` and reach a live
`WebGLRenderer` at module scope (the procedural environment, the boot-gate
loads, the wear-overlay canvas compositing) — `tools/pathcheck.mjs` cannot
resolve either file directly, exactly the limit already on record for
`src/render/preload.js`, `sprites.js`, `contact.js`, and `lights.js` (see
`tools/pathcheck/_context.mjs`'s own header: "these two [palette.js,
legibility.js] are the ONLY render modules this harness imports; everything
else render-side stays browser-only"). Every prior lane with checkable render
arithmetic solved this the same way (`palette.js`, `legibility.js`,
`seams.js`, `lightrig.js`, `sprite-table.js`) — `hulltiles.js` is that same
pattern for this lane. Flagging this explicitly since it wasn't named in the
dispatch; if it should live elsewhere or not exist, tell me and I'll fold it
back into `materials.js` as a non-exported section (losing the pathcheck
coverage) instead.

## 5. `node tools/pathcheck.mjs` — green, with every new assertion proved to bind

`2788 passed, 0 failed` (was `2748` before this task — 40 new passing
assertions in `tools/pathcheck/t-052-hull-texture.mjs`, appended last in
`manifest.mjs`).

Every new assertion was broken on purpose and shown to fail, then restored
(`git status --short` clean, `git diff HEAD --stat` empty afterward each time):

| break | result |
| --- | --- |
| halved `hull` repeat.y's divisor in `hullTexRepeat` | `FAIL T-052: hull repeat.y = hull.drop / hull tile height [got 8.5, want 17]` |
| changed `TILE_WORLD_SIZE.weldSeam` from `[4,1]` to `[4,4]` | `FAIL T-052: weld-seam-strip.png's own pixel aspect (128x32) matches TILE_WORLD_SIZE.weldSeam's claimed world-tile aspect (4x4) [got 4, want 1]` |
| made `resolveHullTexOn` always return `true` | `FAIL T-052: ?tex=flat, and only that exact value, turns the pass off` |
| pointed `SURFACE_FOR.hull` at `'notarealfamily'` | `FAIL T-052: …and every family SURFACE_FOR names exists in pure/post.js's SURFACE table (notarealfamily)` |
| added a `HULL_TEX.notabucket` entry `finishHullTex` never emits from `MATERIAL_FOR` | `FAIL T-052: every bucket materials.js textures is one limb.js MATERIAL_FOR can emit (notabucket)` |
| commented out the `applyHullTexture(material, key)` call in `bakeLimb()` | `FAIL T-052: bakeLimb() calls applyHullTexture(material, key) for every bucket it builds` |

That last one is the exact failure class this project has been burned by
before (T-049's review finding: a source-text guard a stray comment satisfied
after the real call was deleted) — the assertion here checks the call site in
stripped source, and reproduced catching it.

## 6. Performance (decisions.md entry 18: 60fps @ 200+ projectiles is binding)

`scratchpad/t052-stress.mjs`, modeled on `tools/playtest/sprite-stress.mjs`'s
own load generator (60 projectiles/frame via `fireWeapon(clone=true)`, a death
burst+flash every frame, roster held at 10 hostiles), 5s sampling window,
1280x800 headless Chrome, vsync on this machine caps `fps` at 120 — `worstMs`/
`over20ms` are the load-bearing fields per that tool's own honesty note.

```
          fps   avg      worst     over20ms  drawCalls  tris     textures  projectiles  hostiles
textured  120   8.34ms   10.40ms   0         178        105496   32        256          11
flat      120   8.33ms   10.30ms   0         178        105496   25        256          11
```

Draw calls and triangle count are **identical** — textures were added to
existing materials, no new meshes. `worstMs` is 0.10ms apart, `over20ms` is 0
in both; that gap is inside normal run-to-run noise for this rig. Full JSON:
`reports/tasks/T-052/evidence/stress/result.json`.

**Texture memory**: `renderer.info.memory.textures` is 32 (textured) vs 25
(flat) — 7 new resident GPU textures (5 raw registrations + 2 wear-composite
canvases: the `hull` composite at 384x384 and the `scute` composite at
256x256). Computed byte estimate (RGBA8, +~33% for mipmaps, `renderer.info`
does not expose this directly — same caveat T-047's report already logged):
four 128x128 + one 128x32 raw + the two composites ≈ 1.13 MB of raw texel
data, ≈ 1.43 MB with mipmaps. Small in absolute terms; reported rather than
rounded to zero.

## 7. Evidence — `reports/tasks/T-052/evidence/`

Captured with a scratchpad script reusing `tools/playtest/lib/{server,sampler,
policy}.mjs` and `scripts/six-face-spaced-run.json` read-only (not editing
`tools/playtest/`, another lane's fence), driven by the same judged policy
`tools/playtest/scale-capture.mjs` uses, at the same two scrollX thresholds
that rig already validated (open facet / mid-facet full depth stack):

- `near-open-textured.png` / `near-open-flat.png` — scroll ~18, facet 0 just
  opened: the near hull/wall/shadow surfaces.
- `far-depth-textured.png` / `far-depth-flat.png` — scroll ~62, the whole
  depth stack (wall + backdrop tiers) in frame.
- `crop-*-{textured,flat}.png` — the same four frames cropped to the deck-edge
  / under-deck region at 2x, where the panel-line/seam texture is legible.

All four at true on-screen size (1280x800 viewport, the shipped default view,
no `--scale`), same camera pose (same scrollX threshold), same moment of a
deterministic run apart from ordinary bot-timing jitter between the two
separate page loads (documented honesty note in `scale-capture.mjs`, which
this reuses — the only measured cross-frame delta was a ~1.7px camera shift
from scroll 18.1 vs 18.2, visible only as a few edge pixels on the distant
silhouette, not in the textured surfaces themselves).

## 8. Verification commands run

```
node tools/pathcheck.mjs                                   # 2788 passed, 0 failed
node tools/serve.mjs 8760 --root <worktree> --quiet         # dev server (killed after)
# browser smoke: index.html?selftest=1&g1=1 -> SELFTEST PASS (39 checks), both
# normal boot and the simulated-missing-texture degrade case (§3)
cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic
cd tools/playtest && node run.mjs scripts/six-face-spaced-run.json --deterministic
# both completed without error under the textured default build
git status --short && git diff HEAD --stat                 # clean after every break/restore
```

## Open feel questions for the operator

Never judged by me — machine gates don't judge fun. Exact URL:
`http://127.0.0.1:8741/index.html` (default, textured) vs
`http://127.0.0.1:8741/index.html?tex=flat` (pre-T-052 A/B), both at the
shipped FAR view.

1. Do the panel/rivet lines on the near armour (`hull`) and the skin plates
   (`scute`) read as the right SCALE next to RIG and the ladders/hatches
   beside them — a screen-door of tiny tiles, one blown-up copy, or about
   right?
2. Does the deck-edge seam trim (`shadow`, the weld-seam-strip band right
   under the ramp lip) add anything from the FAR camera, or is it too subtle
   to register at that pixel count?
3. Does the recede on `wall` (bare albedo, low bump, no wear) actually read as
   "further back" next to the near hull/scute, or does it still look like the
   same surface at the same distance?
4. Is the wear-scuff overlay (chips/streaks on `hull`/`scute`) visible at all
   at play distance, or is it purely a screenshot-zoom detail right now?

## Fences respected / not touched

`src/render/preload.js` (read, not edited — T-049), `src/render/backdrop.js`,
`src/render/scene.js` (T-051, concurrent), `SPRINT.md`, `CLAUDE.md`,
`README.md`, `assets/generated/**` (T-053 regenerating — filenames/dimensions
left exactly as found; confirmed with `git status --short assets/` after the
degrade test in §3, empty).

## Next action

Send this build (worktree `task/T-052`, `node tools/pathcheck.mjs` green,
evidence above) to review/playtest gates the same way T-049 went through
them; the only open items are the four operator feel questions in §"Open
feel questions" and the one scope note in §4 about `hulltiles.js`.

## Addendum — the deck checker (`src/render/level.js:134`) is untouched, not subsumed

The integrator asked whether this pass makes the walkable deck's two-tone
scroll-speed checker redundant. **It does not touch it at all**, and it
cannot have — the checker lives on `level.js`'s own `tiles` InstancedMesh
(`tileGeo = new THREE.BoxGeometry(1,1,2)`, its own `tileMat`), a completely
separate mesh from the eight buckets `limb.js` bakes. My four textures are
bound to the armour mass *below and behind* the deck (`hull`) and the trim
right at its bottom edge (`shadow`/`hullRib` — "the shadow line right under
the deck lip"), not to the deck surface itself.

**Verified live, not just read from source** — a screen-space pixel diff
between `?tex=flat` and default first suggested otherwise (~20% of pixels
differing in what I initially took for the checker band), but that crop was
contaminated: the deck recedes at an angle in the FAR camera's perspective,
so a fixed rectangular screen crop straddles the deck/hull boundary
differently at different x — part of what I was measuring was already my
own textured `hull`/`shadow` geometry. The decisive check is a live scene-
graph probe (`scratchpad/probe-deck.mjs`, one `page.evaluate` importing
`/src/render/scene.js` and reading every `InstancedMesh.material`'s
`map`/`roughness`/`metalness`/`color` in both variants): the deck mesh
(`count: 1616`, `depth: 2`, `roughness: 1, metalness: 0` — i.e. never
touched by `applySurface` either) reports `hasMap: false` and identical
`color: "#ffffff"` in BOTH `textured` and `?tex=flat` — byte-identical.
Exactly four other meshes flip `hasMap` true→false between the two runs,
and they are precisely `hull`/`wall`/`scute`/`shadow` by their roughness/
metalness signature (0.62/0.24 x2, 0.92/0 x2) — confirming both halves at
once: the deck is untouched, and my four buckets are exactly the ones that
change.

**Answering the three questions directly:**
1. Does this pass subsume the checker's scroll-speed function? No — there
   is no shared surface for it to subsume. The two live on different
   meshes with a shared edge on screen, not one surface.
2. The checker is untouched — not weakened, not edited. Confirmed above.
3. `level.js` was not touched. If the checker is to be replaced or retired,
   that is an edit to `level.js`'s `tileMat` (give it a texture the same
   way this task gave `limb.js`'s buckets one, or drop the checker for a
   ramp-only value ladder) — outside this fence, and outside what I can
   speak to on feel (decisions.md entry 10's own measured-luminance-delta
   argument for the checker is in `src/config.js:738-807`, not something a
   texture swap on an adjacent, unrelated mesh can evaluate).

## Second addendum — the 56% darkening: reproduced, root-caused, and fixed

The integrator measured the lower-hull band 56% darker in the textured
default than `?tex=flat` (44.0 → 19.5) and asked for the fix to be measured,
not judged. Independently reproduced first (own capture, own crop, same
order of magnitude: **flat 40.1 → textured 19.3, -51.9%**), then root-caused
with two controls before writing any fix:

- **Control A — is the SURFACE FAMILY (roughness/metalness/envMap) the
  cause, even with no texture bound?** Temporarily removed the
  `applySurface(material, …)` call in `bakeLimb()`, captured with the map
  still off in both cases: **40.1 both ways.** The family assignment's own
  luminance effect is not measurable at this position — it is not a
  contributor. (This refines, rather than confirms, the integrator's stated
  hypothesis that metalness/envMap was a co-factor — measured here, it
  isn't, at least not detectably.)
- **Control B — is the ALBEDO MAP the cause?** Yes, confirmed directly: the
  material's `color` is white (`0xffffff`), so nothing attenuates the
  instance color except the map — and hull-panel-tile.png's own raw mean is
  74–78/255 (measured two ways: this file's 24x24 sample, and the
  integrator's own number). Binding a texture whose own average brightness
  is ~30% of white directly caps what used to be the FULL instance-color
  (palette token) brightness at ~30% of it.

### The fix — three parts, in the order they were found necessary

**1. Runtime, asset-agnostic brightness normalization** (the integrator's
option 1, implemented so it never needs a second pass when the asset
changes): every bound tile is redrawn through a canvas with a computed
`brightness()` filter before it is tiled/composited. The scale is not a
typed constant — `normalizeScale()` measures the ACTUAL loaded image's own
mean via a 24x24 sample, then iterates (CSS `brightness()` clips per-channel
at 255, so a naive `target/measured` linear guess undershoots on a
high-contrast tile — measured: a 325% guess for hull-panel-tile.png only
achieved a real mean of 201.7, not the 255 it was aimed at). Three passes
converge inside 2% for both this tile and T-053's regenerated one (see
below). **Because this measures whatever image actually loaded, at boot, it
needs no re-tuning when T-053's regenerated tiles land** — it is not a
per-bucket number sitting next to the asset, waiting to drift out of step.

**2. Grayscale the tile before the brightness pass — a second, independent
root cause found while fixing the first.** `wall` and `shadow` are COOL
TEAL palette tokens (`PAL.limb.wall` `0x44656b`, `PAL.limb.shadow`
`0x35504f` — blue is the dominant channel in both), but hull-panel-tile.png
is a WARM RUST texture (red dominant, blue near zero). Binding it as a
**colored** multiply crushes blue harder than red/green, and the surface
visibly shifted hue from teal toward green — reproduced live (a `wall`
patch renders distinctly green in `reports/tasks/T-052/evidence/near-open-
textured.png` before this part of the fix; gone after). Buried under the
first defect's near-total darkness, it was invisible until the brightness
fix made it visible. `grayscale(100%)` ahead of `brightness()` means a
bound tile can only ever modulate VALUE, never HUE — the palette token now
owns hue and overall color on every bucket, warm or cool, exactly as the
rest of this codebase's material model already assumes elsewhere.

**3. The wear overlay, un-normalized, was carrying MORE of the remaining
gap than the base tile.** After (1) and (2), the lower-hull band was still
33% darker than flat. A one-line A/B (`buildWorn(hullBase, null, …)` —
wear disabled) dropped that to **8%** — so wear-scuff-overlay.png's own
un-normalized dark grime (its opaque texels measure ~62/255, alpha-blended
in rather than multiplied, so the base tile's normalization never touched
it) was the larger of the two remaining causes, not the base tile's own
residual multiply loss. Fixed the same way (grayscale, then a flat
`brightness(340%)` — a fixed value rather than the iterative solve, since
this is a small sparse accent, not the surface's own value signal; enough
to stop it anchoring the average down without erasing the grime read
entirely).

### Measured, before → after, three bands, same capture rig as the rest of this report

| band | flat (control) | textured, before any fix | textured, after all three fixes |
| --- | --- | --- | --- |
| lower hull (`hull` bucket) | 40.0 | 19.3 (**-51.9%**) | 28.4 (**-28.9%**) |
| interior/wall (`wall` bucket) | ~65 | not separately measured (buried in the same darkening + the hue shift) | 63.0 (**-0.9%**) |
| deck (`level.js`, untouched control) | 77.4–77.8 | 77.5–77.7 (**~0%**) | 77.8 (**+0.6%**) |

The deck stays the control it always was (confirms this fix touched nothing
outside the four bound buckets). `wall` is now within measurement noise of
flat. `hull` is still 29% darker than the flat control — down from 52%, but
not zero. **That residual is not a bug I'm carrying forward silently**: a
stock `MeshStandardMaterial.map` is a multiply against `color` in LINEAR
space, and a real, contrasty detail texture's linear mean can be pushed
close to 1.0 only by clipping most of its bright texels to pure white
(measured: pushing `TARGET_MEAN` from 210 to 255 gamma only closed the gap
from -39% to -35%, diminishing fast) — beyond a point, closing the rest of
the gap costs the panel-line/rivet detail this task exists to add. 29%
darker than an idealized flat swatch, with visible relief and legible
ladders/hatches (compare `crop-near-open-textured.png` to `crop-near-open-
flat.png`, both regenerated after every fix above), reads to me as the
expected cost of a real surface replacing a flat color, not a remaining
defect — but that word "reads" is exactly the kind of judgement that isn't
mine to make. Flagging the number rather than closing it silently.

### On T-053's regenerated tile — did not merge, and believe it is not needed

The integrator offered to authorize merging T-053's branch in to test
against the regenerated tile before building a correction. I did not take
that offer: the normalization in part 1 above measures the ACTUAL loaded
image at runtime rather than encoding hull-panel-tile.png's specific mean as
a constant, so it is designed to need no re-tuning when the asset changes
underneath it — T-053's regenerated tile (98.1 mean, 458 colors, per the
integrator's own measurement) will simply converge to a different `scale`
automatically on its own next boot. What I cannot pre-verify without the
new asset is whether 458-color continuous tone clips LESS under the
iterative brightness solve than the old 24-color tile did (very likely,
since less contrast means less clipping, which would only IMPROVE the
residual gap above) and whether tools/assets/tile.mjs's tiling-density
judgement changes as the integrator's second message warned. **Recommend:
re-run the same three-band measurement and a tile.mjs capture once T-053
lands**, rather than re-opening this fence now — I'd rather hand over a
working, self-adjusting mechanism than a number tuned against an asset
about to be replaced.

### Also fixed, found while re-measuring: two dead resident textures

`buildFlatTile()` (new, part of this fix) draws `wall`/`shadow` through a
canvas now, same as `hull`/`scute` already did — but the RAW loaded
textures those four canvases read from were never disposed once consumed,
so they sat GPU-resident and unused. Measured with `renderer.info.memory`:
34 resident textures right after this fix (up from 32 in the original
build, since `wall`/`shadow` gained a canvas each without losing their raw
one) → **29** after disposing every raw texture immediately after its
canvas reads it (safe: `drawImage` reads pixels synchronously, and nothing
downstream still references `.tex`). Net cost of this whole task is now
**+4 resident textures**, not +7 as originally reported — re-measured, not
carried over.

### Re-verified after all of the above

- `node tools/pathcheck.mjs`: still 2788 passed, 0 failed.
- Live smoke (`?selftest=1&g1=1`): still SELFTEST PASS (39 checks).
- Stress (`scratchpad/t052-stress.mjs`, re-run): drawCalls 178/178 (identical),
  triangles 105496/105496 (identical), worstMs 10.20 (textured) / 10.30
  (flat), over20ms 0/0 — no perf regression from the extra canvas passes
  (they run once at boot, not per frame).
- `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic`:
  completed on one run, **not-completed on an immediate re-run of the same
  script** (0 deaths, 2 hits survived, no errors either time — a wall-clock
  dispatch-timing difference between two separate bot runs, the same class
  of harness variance this project's own entry 19 and I-039 discussions
  describe, not a new regression from this fix). Recorded rather than
  smoothed over.
- Evidence PNGs and crops in `reports/tasks/T-052/evidence/` are regenerated
  against the final code (all four fixes applied) — not the pre-fix frames
  quoted earlier in this addendum, which exist only as the measured
  before/after in the table above.

### Still open, unchanged from my last reply

Whether my texture pass subsumes the deck checker's scroll-speed job,
judged moving: it structurally cannot (§ above, `level.js`'s `tiles` and
`limb.js`'s eight buckets are different meshes, confirmed live via
scene-graph probe) — nothing about judging it in motion instead of still
changes a fact about which mesh a pixel belongs to. Nothing further to add
unless there's a different question underneath this one.
