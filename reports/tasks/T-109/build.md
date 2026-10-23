# T-109 build report — phase A: headless Blender -> pixel sprite sheets with anchors

**Status: phase A complete; phase B not started** (it waits for T-103 to
merge, per the integrator). Nothing under `src/` changed. The v2 sheets are
built, checked and committed but **nothing in the game loads them yet**.
Nothing here says v2 looks better. That is the operator's call, and the
contact sheets are there for it.

Worktree `/home/user/hullbreaker/.claude/worktrees/T-109`, branch
`task/T-109`, based on main `b114869`. No server is left running: the capture
tool starts its own server and closes it at exit — port 8759, or an
OS-assigned port (`--port 0`) for the passes that ran beside another one
(the wasp-only passes and one climb probe). One wasp-only start went out on
8758 by mistake and was killed within seconds; nothing else touched another
port, and 8741/8742 were never bound.

## 1. Pipeline layout and the one build command

    /opt/hb-art/bin/python tools/art/build.py            # render + post + check (~3.5-6.5 min here)
    /opt/hb-art/bin/python tools/art/build.py --falsify  # proves the anchor check binds (~1.5 min)

| File | What it does |
|---|---|
| `tools/art/rig/model.py` | RIG from primitives in code: 17-bone skeleton, ~45 low-poly parts (helmet + amber visor, chunky pauldrons, chest plate, pack, dark undersuit, greaves, boots), five guns in gun-local space ending exactly at `MUZZLE_X = 0.82` |
| `tools/art/rig/pose.py` | pure-numpy pose solver + the 60-pose inventory. **The gun is placed first**, on the simulation's own shot line (bore through `(0, CONFIG.player.muzzleY)`, muzzle `barrelTiles` down it, exactly as `src/sim/player.js` spawns a shot). The right hand bone = gun frame x a fixed grip offset; analytic two-bone IK reaches arms and legs; a fixed, ordered search nudges pelvis height/offset and lean until every limb reaches. An unreachable limb is a build error, never a gap |
| `tools/art/rig/render.py` | Blender: armature, parts bone-parented, the five guns parented to `hand.R` with `grip.<L>` / `muzzle.<L>` / `foregrip.<L>` empties; renders ID maps; exports anchors by projecting the **evaluated** empties through the fixed ortho camera; asserts Blender's evaluated hand and gun match the solver (worst 6e-7 tiles) |
| `tools/art/wasp/model.py`, `render.py` | the wasp: thorax, head, 3-joint abdomen, four wing bones; 9 frames |
| `tools/art/lib/bl.py` | Workbench / FLAT / AA off / dither 0 / ID-colour materials, mesh builder, per-face cel banding, armature + pose writer |
| `tools/art/lib/pixel.py` | weighted-MODE 8x downscale (no colour blending), despeckle (body bands only), palette LUT, 1 px ink outline, grid packer, hand-rolled indexed-PNG writer (no metadata) |
| `tools/art/lib/palette.py` | every swatch parsed from `src/render/palette.js` CONCEPT / `src/config.js`; no hex invented |
| `tools/art/post.py` | ID maps -> atlas PNG + compact JSON (+ a dev part-ID atlas for the check); fails if any pose touches its cell border |
| `tools/art/check_anchors.py` | the anchor check (section 4) |
| `tools/art/capture/current-art.mjs` | in-game captures of the CURRENT art + measured px/tile (section 7) |
| `tools/art/sheets.py`, `measure.py` | contact sheets and measurements (sections 8-9) |

Shipped (`assets/generated/sprites/art-v2/`, manifest entries `rig-v2-far`,
`rig-v2-phone2x`, `wasp-v2-far`, `wasp-v2-phone2x`):

| File | Size | Frames | Cell (px) | Colours | Bytes |
|---|---|---|---|---|---|
| `rig-v2-far.png` + `.json` | 1024x1024 | 300 | 42x45, origin (18,40) | 11 | 37.0 KB + 96.5 KB |
| `rig-v2-phone2x.png` + `.json` | 2048x1024 | 300 | 54x58, origin (23,53) | 11 | 52.8 KB + 97.6 KB |
| `wasp-v2-far.png` + `.json` | 512x64 | 9 | 36x34, origin (20,17) | 7 | 1.0 KB + 2.7 KB |
| `wasp-v2-phone2x.png` + `.json` | 512x64 | 9 | 46x44, origin (26,22) | 7 | 1.3 KB + 2.7 KB |

Densities: **far = 18 px/tile**, measured (live camera projection at RIG's
render depth, 1280x800 FAR: RIG's 2.0-tile visual height = 36.1 CSS px —
the "~30 px" figure in older docs is stale); **phone2x = 23.4 px/tile** =
6% of a 390 px landscape height (entry 20 addendum) at DPR 2 (46.8 px RIG).
Each is a native render + pixel post, not a resample.

JSON per frame: atlas rect, `gun`/`frame`/`state`/`aim`/`aimDeg`/`socket`,
`lhand` (on the gun or free), and anchors in cell pixels — RIG `hand` (right
palm on the grip = the gun's parent bone), `handL`, `muzzle`, `head`,
`footR`, `footL`; wasp `sting`, `stingBase`, `eye`, `head`, `wingRoot`.
Top level: `origin` (the sim point), `pxPerTile`, `sim` (`muzzleY`,
`barrelTiles`, `crouchMuzzleY` the art was posed around), `authoredFacing`
+1 with the mirror rule.

## 2. Frame inventory: what the game uses today vs what v2 renders

From `src/pure/rig.js` + `src/render/player.js` at `b114869`:

| Game today | How it is drawn today | v2 frames (per gun x5) |
|---|---|---|
| aim-idle: right, up-right, up, down-right (left = mirror; exact down uses down-right) | aim atlas body + separate gun plane rotated about the hand socket | `stand-{right,up-right,up,down-right}` = 4 |
| run: contact / pass / flight (4-beat cycle contact-pass-flight-pass) | body atlas + gun plane | `run-{contact,pass,flight}-a-{right,up-right,up,down-right}` = 12, **plus** the same three with the other leg leading (`-b`, 12) so phase B can run a true alternating cycle |
| jump: air-rise / air-fall | body atlas + gun plane | `air-{rise,fall}-{right,up-right,up,down-right,down}` = 10 |
| land-brace | reuses `contact` | reuse `run-contact-a-<aim>` |
| climb: 4 phases | climb atlas + gun plane | `climb-{0..3}-{right,up-right,up,down-right,down}` = 20 |
| wall contact | reuses climb 0 / 2 | reuse `climb-0` / `climb-2` (same as today) |
| hit / i-frames | visibility blink only; no frame | `hit-right` = 1 (new; blink stays a material effect) |
| crouch (`?crouch=1` prototype) | body squash, muzzle drops to 0.45 | `crouch-right` = 1, posed around `CONFIG.crouch.muzzleY` |
| idle (gunless) | fallback when the aim atlas fails | not needed: every v2 frame holds its gun |
| 5 chassis R S L H F | separate painted cutout atlas, 8-way rotation | baked into every frame |
| trait hardware (rapid/heavy/forked/seeker/phase/volatile), overdrive/rage/gilded tints | procedural overlay meshes / emissive | **not rendered** — phase B decision (the `hand`/`muzzle` anchors give the bore axis to mount overlays on) |

Wasp (neutral wasp, `src/render/sprite-table.js`): today = idle card, 4-frame
flight loop, dive card, hit = material flash. v2 = `idle`, `cruise-0..3`,
`dive-lock` (new tell pose), `dive-0/1`, `hit` (new recoil pose).

Total: 300 RIG + 9 wasp frames per density, 618 per build.

Two-handed holds: the right hand holds the gun in every frame by construction.
The left hand takes the foregrip wherever the solver can reach it (stand and
run right / up-right / up, air up / up-right, crouch) and is free by design on
climb (it climbs) and hit (flung back), and by reach on down / down-right
aims (the gun points away from the far shoulder). 143 / 300 frames are
two-handed.

## 3. Render cost and build time

Final clean builds on this host (4 cores, shared with other agents' lanes;
load average 24-30 throughout):

| | build C | build D |
|---|---|---|
| total, one command | 241 s | 207 s |
| frames rendered | 618 | 618 |

Per frame (render call + PNG round trip, Workbench at 8x the output cell):
RIG far 128 ms mean / 1.4 s max (the max is the first frame's GL init),
RIG phone2x 145 ms mean; wasp 174-250 ms mean. Stage split (build C): render
RIG far 80 s, phone2x 89 s; post 13 s / 31 s; checks 2-3 s each; wasp
~8 s per density. An earlier build with another agent's capture running took
394 s. Cycles was not needed: Workbench gives exact flat IDs in ~0.1 s.

## 4. Anchor check — drawn muzzle pixel vs exported anchor

`tools/art/check_anchors.py`, run by every build, on the **shipped pixels**:
1. the shipped PNG must equal palette(part-ID atlas) exactly — 0 mismatched
   pixels on all four sheets, so the part map the check reads is what ships;
2. the gun's pixels on the bore axis (within 0.75 px of the line through the
   exported muzzle along the aim); the drawn barrel ends at the far edge of
   the furthest of them; it must be within 1 px of the exported anchor;
3. the exported muzzle vs the simulation's shot origin, computed
   independently from the JSON's `sim` block, `socket` and `aimDeg`.

| Sheet | frames | max drawn-vs-anchor | mean | anchor-vs-sim max | fails |
|---|---|---|---|---|---|
| rig-v2-far | 300 | **0.867 px** | 0.493 px | 0.0001 px | 0 |
| rig-v2-phone2x | 300 | 0.382 px | 0.249 px | 0.0 px | 0 |
| wasp-v2-far (sting) | 9 | 0.528 px | 0.276 px | n/a | 0 |
| wasp-v2-phone2x | 9 | 0.536 px | 0.198 px | n/a | 0 |

The 0.867 px worst case is the 45-degree aims: a diagonal barrel's last
pixel reaches 0.5*(|dx|+|dy|) = 0.71 px past its centre. Errors are
identical for a given (gun, aim) in every body state, as they must be: the
sim fixes the gun, the body moves around it.

**It binds (falsification, `build.py --falsify`, final pose set):** gun S's
MESH moved 0.1 tiles (1.8 px) down its barrel, its empties left in place ->
**all 60 S frames fail** (2.14-2.34 px), the other 240 frames stay at
0.867 px max, check exit 1. Wasp sting mesh moved 0.1 tiles -> all 9 frames
fail (1.28-2.42 px). The build prints `FALSIFICATION CONFIRMED` only when the
check fails on exactly the moved part. Reports:
`tools/art/build/reports/anchor-check-*.json` (rebuilt, git-ignored).

**Sim muzzle delta (for phase B):** 0.0001 px — the art is posed around the
sim, so the render-only `?art=v2` path will not need to move the shot origin.
Consequence the operator should see: the sim's socket is at 1.05 tiles, 53%
of RIG's 2.0-tile visual height, so v2 holds every gun at the HIP. Boards
01/06/13 hold the rifle at the shoulder (~70% of height). Moving that would
be a sim change (`CONFIG.player.muzzleY` is asserted against the houndframe's
hit circle) and is not proposed here.

## 5. Reproducibility proof

Two clean builds (all intermediates and outputs deleted before each):

| File | sha256 (build C = build D) |
|---|---|
| rig-v2-far.json | `f501ba15a87b37c4fa0be75424ebe41f202a1a77b4b3b68801a1b94248d0aec6` |
| rig-v2-far.png | `587f95be1e9a821108a52be7d43512f690947715c2fda7df0f7a17345cfb69fc` |
| rig-v2-phone2x.json | `8b85708636b311fe99364867b5cec8c7d7c98649c160dbd31e2c760841e1a817` |
| rig-v2-phone2x.png | `48ab480d4ec1a654963c48fc8ac6fb4b51a148ead17cef81f2a0fa0673744c9c` |
| wasp-v2-far.json | `9ce226e9f1d491e595b37c193a9a241aced10056ae3ab84dd1efae1c227d507b` |
| wasp-v2-far.png | `1fe906f764639723ceee61b9b875622ac15215c741fd592a5492a45755970452` |
| wasp-v2-phone2x.json | `0491b949e7c9f7678954f9c18f9cc56d550703db9a521879f08bcf34d788d012` |
| wasp-v2-phone2x.png | `f2c0a2c63eb013ecd138f84e40f49ff7975203da06a5e9fbad3afbfbef9939aa` |

Byte-identical, 8/8. (Two earlier pairs, before the last pose edit, were also
identical to each other.) Why it holds: Workbench FLAT with AA and dither off
rasterizes ID colours with no sampling noise; banding, downscale, despeckle
and packing are integer numpy with fixed tie-breaks; frame order comes from
the pose library; the PNG encoder is hand-rolled (no timestamps). Limit:
proven on this host's Mesa llvmpipe + bpy 5.2.3; another GL stack could move
edge pixels — re-run the two-build comparison there.

## 6. Palette

Every sheet colour is a token: RIG `capsuleInk < playerDark < playerMid <
player` (4 value steps) + `gun` gold (the ONE accent: the visor) + the
weapon-identity `shots.*` colours and `muzzle` on the guns (11 colours).
Wasp: `capsuleInk` + `houndCharge < carrier < wasp` + `waspDive` (dive
frames) + `mortarPod` wings + `polypBeam` sting (7).

Asset gate: the full `node tools/assets/check.mjs` sweep did not finish in
40 minutes on this host, twice (exit 124 from `timeout`; it decodes every
large PNG in pure JS). Its per-entry rules were run on the four new entries
with its own libraries (`validateEntryShape`, unique ids/paths, `readPngSize`
vs the recorded size, power-of-two, `checkRasterColors` roles): all pass, and
the recorded palette blocks equal the recomputed ones. `alpha` is
deliberately not declared: these are hard 0/255 pixel-art edges (0% partial),
which the `cutout` contract (>= 2% feathered) would reject by design.

## 7. How the CURRENT art was captured (and what that capture can't show)

`node tools/art/capture/current-art.mjs` loads the unmodified game
(`?testapi=1&audio=0&view=far&momentum=0&score=0&fixeddt=16`) in headless
Chrome on port 8759 (own ephemeral server, closed at exit), stages only sim
state the way `tools/playtest/rig-presentation-capture.mjs` does (player row,
aim, weapon, ladder, a spawned wasp), and takes tight crops. It also measures
px/tile by projecting RIG's feet and a point 2.0 tiles above them, at RIG's
render depth, through the live camera: **desktop 1280x800: 18.065 px/tile,
RIG 36.1 px = 4.5% of the height.** The tool is resumable per part:
`--only desktop|phone` re-takes one view, `--wasp-only` the wasp crops,
`--climb-only` the four ladder phases (merged into the existing record).

Honesty notes:
- **Load workarounds.** This host ran at load 24-48 throughout. Three things
  were needed for the crops to be RIG's real art: (1) `?fixeddt=16` (the
  game's own verification hook) so a slow frame advances the sim 16 ms
  instead of skipping, otherwise RIG fell or ran out of frame between a state
  read and a screenshot; (2) large atlases that cannot appear in these crops
  (Crown, Warden, emplacement, VFX packs, mutation parts, ecology variants,
  projectile chassis, other hostiles) are aborted at the network layer so RIG's
  and the wasp's atlases make the 2.5 s boot budget; (3) the scroll is
  rewound with the sim's own `setScrollX` before each staged pose so every
  crop shares one background. Every RIG crop records `bodyFrame`,
  `canvasFallback` and the sim aim; all 17 labels were captured in both views
  and none fell back. Cost: ~1 min per crop at DPR 1, 2.5-5 min at DPR 2.
- **Background panel.** v2 is composited onto the aim-right clip with RIG
  out of it. Desktop: RIG hidden by the game's own i-frame blink (inspected
  RIG-free; the actor mask then finds a 37x26 px RIG). Phone: the same blink
  method left RIG IN the background (a slow device-scale screenshot lands on
  a random blink phase) — caught because the phone actor mask came out as a
  140 px edge fragment. The tool now steps RIG 4 tiles right, out of the
  clip, and re-shoots the same clip (the camera follows the scroll cursor,
  not RIG: `src/render/camera.js`); `--bg-only` re-took the phone background
  that way (actor mask 47x35 px, 610 px).
- **Climb, fixed after a first failure.** The first desktop pass got only
  `climb-0`: phases 1-3 timed out at 90 s. Probed: the ladder climbs 0.192
  tiles per 16 ms frame and the renderer advances one climb phase per 0.6
  tiles, so a phase needs 4-10 frames, and a frame took 5-25 s at this load.
  The same staging also released the climb key, so the sim's `computeAim`
  returned the aim to facing: that `climb-0` crop was aim-RIGHT while labelled
  aim-up and paired with v2's aim-up frame. Fixed: one continuous climb with
  the climb key, aim held up by strafe (the climbing player's own aim), a
  600 s wait, merged by `--climb-only`; and `sheets.py`/`measure.py` now pair
  every crop with the v2 frame for the aim the capture recorded. All four
  phases are captured in both views (sim y 6.38 / 7.15 / 7.72 / 8.30).
- **Wasp.** In the main pass the shipped wasp textures missed the boot
  budget (primitive fallback; not used). The `--wasp-only` pass also aborts
  the backdrops, so its crops show flat fallbacks behind the real pixel wasp.
  The captured wasp cruises toward RIG with `dir` -1 (the sim's default for
  a spawn with no row, `src/sim/hostiles.js`; these crops predate the tool
  recording `dir` per crop, which it now does). The sheets show v2 mirrored
  to that facing, as the game mirrors a -1 row.
- **Phone framing** does not exist in the game yet (T-107 is `todo`). The
  "phone" view is an 829x518 viewport (16:10) whose height puts FAR RIG at
  23.4 CSS px (measured 11.70 px/tile), captured at DPR 2 in device pixels
  (46.8 px RIG): the right pixel budget through the real renderer, not a
  phone composition. Two earlier phone passes were discarded: one cropped at
  CSS scale, and one taken with raw DevTools clipped captures, which (probed)
  reset Playwright's DPR emulation to 1 after the first shot, so its "2x"
  crops were upscaled DPR-1 renders. The kept crops use Playwright's
  `page.screenshot({ scale: 'device' })`, which keeps DPR 2 (every phone row
  records `captureScale: 2`). The desktop stand/run/air crops were taken by
  the tool's first version with DevTools clipped captures; at DPR 1 that is
  exact. Desktop climb crops are from the current version.
- **The "v2 lit~" panel is an approximation.** Today RIG is a lit
  `MeshStandardMaterial` under ACES. Measured on the aim-right crop (RIG's
  pixels isolated by registering the RIG-free background and differencing),
  the shipped material maps the current frame's mean texel (96.6, 75.7, 56.2)
  to (66.6, 53.3, 34.0) on screen at desktop, a per-channel gain of
  **(0.69, 0.70, 0.61)**; phone gives (0.67, 0.67, 0.56). Part of that is
  RIG's edge pixels blending into the darker background (the interior alone,
  mask eroded 1 px, gives (0.65, 0.62, 0.49)). "v2 lit~" multiplies v2 by the
  view's gain. Phase B decides the material.
- **Camera drift.** At `fixeddt=16` the scroll keeps moving between staging a
  pose and its screenshot; image registration puts the background 6 px
  (desktop) / 1 device px (phone) from the stand crops. v2's sim point is
  placed on the midpoint between the current RIG's boots as found in its crop
  — the same point the current art pins to the sim x
  (`RIG_AIM_FRAMES.right.anchorX`). In the run cells RIG moved between the
  state read and the captured frame, so the current RIG sits left of v2.

## 8. Contact sheets (committed, `reports/tasks/T-109/`)

1x is the judgement scale. Every RIG cell is three panels at identical
framing: **current** (the shipped renderer's crop) | **v2** (atlas cell,
unlit, on the same background, at RIG's measured feet) | **v2 lit~**
(section 7). Air and climb rows have no RIG-free crop, so v2 sits on a flat
patch of that crop's median colour there (labelled "v2 on flat bg").

| File | Shows | Bytes |
|---|---|---|
| `contact-rig-desktop-1x.png` | 17 RIG pairs at 1280x800 FAR, DPR 1, true size (RIG 36 px) | 106.8 KB |
| `contact-rig-desktop-4x.png` | the same, nearest 4x | 178.6 KB |
| `contact-rig-phone-1x.png` | 17 RIG pairs at the phone budget, device pixels at DPR 2 (RIG 47 px = 23.4 CSS px) | 177.1 KB |
| `contact-rig-phone-2x.png` | the same, nearest 2x (= 4x CSS) | 246.9 KB |
| `contact-wasp-desktop-1x.png`, `-4x.png` | 4 in-game cruise crops vs v2 cruise-0..3, then v2 idle, dive-lock, dive-0/1, hit | 17.9 KB / 26.3 KB |
| `contact-wasp-phone-1x.png`, `-2x.png` | the same at DPR 2 | 22.5 KB / 27.9 KB |
| `v2-rig-inventory-R-far-2x.png` | all 60 poses of gun R in `rig-v2-far` | 44.9 KB |
| `v2-rig-guns-far-4x.png` | the five guns in four poses | 20.6 KB |
| `anchor-falsify-S-6x.png` | the falsification: exported muzzle (magenta cross) on the honest S gun vs the S mesh moved 0.1 tiles | 16.8 KB |
| `measurements.json` | every number in section 9, per pose and view | 19.6 KB |

Rebuild: `node tools/art/capture/current-art.mjs` (then `--climb-only`,
`--wasp-only`, `--bg-only` as needed), `/opt/hb-art/bin/python
tools/art/sheets.py`, `/opt/hb-art/bin/python tools/art/measure.py`. The
in-game crops are git-ignored working files (`tools/art/build/current/`).

## 9. Comparison — measurements, not taste

Per pose, at true size, on the identical background (`measure.py`;
`measurements.json` has every row). "current" exists for the 8 stand rows
(the ones that share the RIG-free background). Ranges over those rows:

| Desktop (1280x800, DPR 1) | current | v2 (unlit) | v2 lit~ |
|---|---|---|---|
| height, px | 36-42 | 35-37 | same |
| distinct colours in RIG | 319-441 | 6-7 | 6-7 |
| mean luma (0-255) | 52-62 | 108-114 | 75-79 |
| value steps (16-level bins holding >= 5%) | 6-8 | 4-5 | 4-5 |
| mean luma contrast vs the same background pixels | 33-39 | 78-87 | 50-57 |

| Phone (DPR 2, device px) | current | v2 (unlit) | v2 lit~ |
|---|---|---|---|
| height, px | 47-54 | 45-47 | same |
| distinct colours in RIG | 510-743 | 6-7 | 6-7 |
| mean luma | 49-60 | 115-120 | 76-79 |
| value steps | 5-9 | 4 | 4 |
| contrast vs background | 36-43 | 83-89 | 50-55 |

Other measured facts:
- **Size matches.** v2 RIG is 35-38 px tall at desktop (current 36-42 px,
  the top end being the raised gun) and 45-49 device px on phone (current
  47-54). The wasp: desktop width 24-25 px for v2 cruise vs 20-26 px for the
  in-game wasp (wing phase), phone 32 vs 28-34 device px.
- **Weapon identity area.** v2 bakes each gun into the frame with its
  `shots.*` colour on 11-26 px at desktop stand-right (R 11, S 19, L 13,
  H 18, F 26; of ~440 opaque px). The current gun cutouts are larger: a
  hue-matched estimate gives ~37 px for L and ~84 px for H (S and F cannot be
  separated from the current RIG's own rust-orange that way).
- **Texture budget.** Current RIG = body + aim + climb atlases (3 x
  2048x1024) + weapons atlas (2048x256): 1.81 MB of PNG, ~27 MB as RGBA8,
  ~36 MB with the mip chains `src/render/preload.js` builds. v2:
  `rig-v2-far` 37 KB PNG + 96 KB JSON, 1024x1024 (4 MB RGBA8 without mips);
  `rig-v2-phone2x` 53 KB + 98 KB, 2048x1024 (8 MB).
  Wasp: current 3 PNGs 45 KB; v2 1.0-1.3 KB + 2.7 KB JSON per density.
- **Frames.** Current: 4 aim + 3 run + 2 air + 4 climb body frames (plus a
  gunless idle fallback), with a separate gun cutout rotated to the aim. v2:
  300 frames per density, the gun baked in for every aim the sim can produce
  in that state (right, up-right, up, down-right, and down when airborne or
  climbing; left = mirror). The sim's aim is 8-way already.
- **Shot origin.** Both put the drawn muzzle on the sim's shot origin: the
  current renderer reports `drawnX/Y` equal to `simX/Y` in all 34 capture
  rows (its own telemetry, not a pixel measurement); v2's exported muzzle is
  within 0.0001 px of it and the drawn barrel end within 0.87 px (section 4).

What these numbers do not say: whether either reads better. v2 is unlit
palette pixels and current is lit, tone-mapped, mipmapped pixels, so
colour count, luma and contrast differ largely because of the material, not
the drawing; "v2 lit~" narrows that only approximately. `fine_detail` (in
the JSON) is higher for v2 mostly because of the 1 px ink outline and hard
edges; it measures edges, not legibility. The comparison is the operator's.


## 10. Notes for phase B (render-only `?art=v2`, after T-103 merges)

- **Frame selection** is a pure lookup: `<gun>:<state>-<aim>` using the table
  in section 2 (run uses `-a` frames for today's 4-beat cycle, or `-a`/`-b`
  for a true alternating cycle); facing -1 mirrors the cell about
  `origin.x`. The sim's aim is already 8-way (`computeAim`), so baking the
  gun into the frame loses no direction the game can produce.
- **Placement**: one quad per sheet (`cell / pxPerTile` tiles), offset so
  `origin` sits on `(player.x, player.y)`; the separate gun plane is hidden on
  `?art=v2` because the gun is in the frame. The muzzle anchor is on the sim
  shot origin (0.0001 px), so the muzzle flash and bullets need no change.
- **Material**: the atlases are palette-exact unlit pixels authored at
  1 texel = 1 CSS px (far) or 1 device px at DPR 2 (phone2x). To show them as
  authored: unlit, `toneMapped: false`, `NearestFilter`, no mipmaps. Today's
  lit `MeshStandardMaterial` would render them roughly as the "v2 lit~"
  panel. This is a look decision for the operator (question 3 below).
  `src/render/preload.js` `prepare()` forces mipmaps +
  `LinearMipmapLinearFilter` on every preloaded GPU texture (only `magFilter`
  is overridable), so the v2 path needs a filter option there.
- **Sub-pixel crawl**: `preload.js` notes that nearest sampling on a moving
  sprite crawls. At 1 texel = 1 px that is avoidable by snapping the quad to
  the screen pixel grid; without the snap, NEAREST v2 will shimmer as RIG
  moves. Phase B should decide snap vs linear explicitly.
- **Density**: `far` on desktop; `phone2x` once T-107's phone framing lands.
  A DPR-2 desktop at FAR shows the far sheet at 2x (crisp with NEAREST).
- **Trait hardware and power tints** (rapid/heavy/forked/seeker/phase/
  volatile overlays, OVERDRIVE/RAGE/GILDED emissive) are not baked; they can
  ride on the `hand` -> `muzzle` axis from the JSON.
- **Wasp**: v2 is authored facing +1; today's production wasp is painted
  facing -1 (`spriteFaceX` bakes that in), so the v2 branch needs authored
  +1. v2's dive frames already pitch 30 degrees nose-down; today's procedural
  dive roll would add to it.
- **Hit / i-frames**: keep today's blink; `hit-right` is available as a
  hitstun pose if wanted.

## 11. Open look questions for the operator (non-leading)

Packet URL for phase B will be the `?art=v2` build; for now the evidence is
the contact sheets in section 8.

1. At true desktop size (`contact-rig-desktop-1x.png`), which RIG reads
   faster as "a human-scale armoured marine holding a gun": current, v2, or
   v2 lit~? What, if anything, is missing from the one you prefer?
2. In v2 every gun is held at the hip, because the game fires from there
   (the shot origin is 53% of RIG's height). The boards hold it at the
   shoulder. Does the hip hold read as intended, or should the firing line
   itself be revisited (a gameplay change, separate decision)?
3. v2 shows the palette's RIG tokens unlit (`player` warm off-white down to
   `playerDark`); today's RIG renders darker and browner under the lit
   material (mean luma 52-62 vs v2 108-114 and v2 lit~ 75-79, section 9).
   Which brightness should RIG have against the teal/rust world?
4. At true size (`v2-rig-guns-far-4x.png` shows them enlarged), can you tell
   the five guns apart on v2? Which pair is closest?
5. Does the v2 wasp (`contact-wasp-desktop-1x.png`, shown at the captured
   wasp's facing) read as the same enemy as today's, and at the shipped size
   is it more, less, or equally clear?

## 12. PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: tools/art/capture/current-art.mjs at b114869 | evidence: tools/art/build/current/current-art.json (`scale`)
The docs state RIG is "~15x30 px" / "3.75%" at desktop FAR (entries 15/17,
LANE-BRIEF, T-107's "~3.7%"). Measured through the live camera at 1280x800:
18.065 px/tile and RIG's 2.0-tile visual height = 36.1 px = 4.5% of the
height (30 px is consistent with the older 1.7-tile sprite height). Art lanes sizing
work to "30 px" are 17% under the real budget; T-107's phone target ("~6%")
should be judged against the measured 4.5% baseline. Fix: restate the
measured number where the docs quote it.

## I-??? | art | S3 | repro: headless Chrome on a loaded 4-core host, index.html?testapi=1 | evidence: this report section 7
On a slow machine the shared 2.5 s desktop boot budget (src/render/preload.js)
drops most atlases ("still loading after 17117ms of the 2500ms boot budget")
and the whole run shows primitive fallbacks, including the hostile sprites.
That is the designed safe degradation, but it means a slow laptop sees the
grey-box game for the entire run with no later recovery. Direction: consider
a late-apply path between runs (never mid-run, per the T-049 determinism
reasoning) or a budget that scales with measured boot time.

## I-??? | harness | S3 | repro: tools/art/capture/current-art.mjs history; probe in reports/tasks/T-109/build.md section 7 | evidence: devicePixelRatio 2 -> 1 after one CDP capture
On the live game page in a Playwright context with `deviceScaleFactor: 2`,
one DevTools `Page.captureScreenshot` with a clip resets the device-metrics
emulation: `devicePixelRatio` reads 1 afterwards, the renderer drops to DPR 1,
and later "2x" crops are silently upscaled DPR-1 renders. No tool in the repo
uses raw CDP screenshots today (checked), but phone evidence at DPR 2 (T-103,
T-105, T-107 all ask for it) should be taken with `page.screenshot({ scale:
'device' })` and should record `devicePixelRatio` at capture time.

## 13. Files

New: `tools/art/{build.py, post.py, check_anchors.py, sheets.py, measure.py,
preview.py, .gitignore}`, `tools/art/lib/{bl.py, kin.py, pixel.py,
palette.py}`, `tools/art/rig/{model.py, pose.py, render.py}`,
`tools/art/wasp/{model.py, render.py}`, `tools/art/capture/current-art.mjs`,
`assets/generated/sprites/art-v2/` (8 files), `reports/tasks/T-109/`
(this report, contact sheets, `measurements.json`).
Modified: `tools/art/README.md` (pipeline section), `assets/manifest.json`
(four entries added, nothing else touched — the file round-trips
byte-identically). Nothing under `src/` changed; SPRINT/CLAUDE/README
untouched.

Gates: `node tools/pathcheck.mjs` on this worktree: **3985 passed, 4
failed**. The four are one real-browser probe (`tools/playtest/perf-probe.mjs`
timed out booting under this host's load, so its `result.json` never
appeared): "the permanent real-browser performance probe boots the shipped
scene", "every built transparent DoubleSide material is single-pass or
carries a named exception", "a paused scene uploads zero unchanged
instance-matrix bytes", "the composed path does not allocate redundant
default-framebuffer MSAA". The same four fail on a clean export of base
`b114869` on this host (3985 / 4 there too); this lane touches no runtime
file. Asset gate: section 6.
