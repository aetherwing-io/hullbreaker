# T-124 build report — RIG v3, phase 1 (assets, build, checks, packet)

**Status: phase 1 built; nothing under `src/` changed and nothing in the game
loads v3 yet** (phase 2 wires it into T-123's crisp path). Whether v3 looks
right is the operator's call; this report states measurements, costs and the
open look questions. Worktree `/home/user/hullbreaker/.claude/worktrees/T-124`,
branch `task/T-124` (T-109 spike + main 9a9d911). No server is left running:
the two captures used ports 8806 (desktop) and 8807 (phone) through
`tools/art/spike/scene_capture.mjs`, which closes its own server.

## 0. In one screen

- **What ships** (`assets/generated/sprites/`): `rig-v3-d16.png` (1024x1024,
  57 KB), `rig-v3-d23.png` (1024x2048, 107 KB), `rig-v3-d35.png` (2048x2048,
  187 KB), `rig-v3.json` (71 KB); three manifest entries. 355 frames (71
  poses x 5 guns) per density, native renders (never resampled).
- **The look**: the spike's B/D soldier (Irondust, CC0) toon-reduced by the
  same rules, recoloured to a palette MEASURED from boards 01/13 (khaki armour,
  rust undersuit and trim, the game's own gold visor and weapon-identity
  colours); five CC0 guns (quaternius), each placed on the sim's shot line
  first, held in both hands except where noted.
- **Hull separation (entry 27's rule, >= 40 luma)**: v3's fill differs from
  the hull behind it by 67.9-84.8 luma at desktop FAR and 72.4-88.8 at phone
  framing (today: 31.7-57.5 / 35.1-53.4); slid along the deck across the
  whole captured frame, never below 49.4 (702 stops, 0 below 40).
- **Anchor check**: every drawn muzzle within 0.83 px of its exported anchor
  (1065 frame-densities), every anchor on the sim's shot origin (2.4e-6
  tiles). It binds: gun S's mesh moved 0.15 tiles -> all 213 S frame-densities
  fail (1.72-11.21 px), the other 852 pass. It also caught two real defects
  during the build (section 4).
- **Reproducible**: two independent clean builds (own renders, CC0 re-extracted
  from the sha256-checked archives) gave byte-identical atlases and JSON.
- **Not changed**: the outline. v3 keeps D's 1 px near-black ink; on the darkest
  hull it merges (the spike's edge-visibility metric is unchanged vs D), while
  the fill edge one pixel in reads (see section 2). Put to the operator.

## 1. Box 1 — branch, v2 removal, primitive-builder removal

- `49718cc` (integrator): the rejected v2 atlases (`assets/generated/sprites/art-v2/`,
  8 files) and their 4 manifest entries removed.
- `e1fb59d` (this lane, before the restart): the primitive v2 builder removed —
  `tools/art/rig/{model,pose,render}.py`, `tools/art/wasp/{model,render}.py`,
  `tools/art/{build,post,check_anchors,sheets,measure,preview}.py`,
  `tools/art/capture/current-art.mjs` (2799 lines).
- `02c3670` (this lane): `tools/art/lib` trimmed to what the CC0 route uses —
  removed bl.py's Workbench ID-colour contract, MaterialBank, MeshBuilder,
  per-face cel banding and armature builder; kin.py's frame/rotation helpers;
  palette.py's v2 per-class tables; pixel.py's ID-map downscale/despeckle/LUT
  helpers. Kept: the camera/armature helpers, the token parser, the IK, the
  indexed-PNG writer (now vectorized, same bytes) and the grid packer. Proof
  nothing kept depended on the removed code: the spike's `v3_render.py` +
  `v3_post.py` re-run after the trim gave a D idle frame byte-identical to the
  pre-trim render.
- The WIP snapshot `dc32b5f` was reviewed and kept: the `HB_ART_CC0` override
  in the spike scripts, and `tools/art/rig/poses.py` (extended: straight-down
  grounded aims, the firing-kick frames, the loader's `CLIPS` and mirror rule).

## 2. Box 2 — palette from the boards, and hull separation

**Method** (`tools/art/rig/board_palette.py`, re-run by every build, which fails
if a swatch moved): fixed RIG boxes on board 01 (1) and board 13 (panels 1, 2,
3, 5, 6), read off 8x grid zooms; background = k-means (k=4) of a 5 px ring
outside each box; RIG = box pixels > 42 sRGB from every background centre;
deterministic k-means of RIG's pixels per board (board 13 k=6, board 01 k=8);
rust by a stated rule (HSV hue 12-42 deg, saturation >= 0.5, luma >= 30 inside
every RIG mask, k=4). Each swatch is the cluster centre, located at the board
pixel nearest it. Evidence: `board-swatches.png` (the boxes and marked
swatch pixels) and `board-swatches.json` (every cluster, both boards).

| swatch | hex | board | (x, y) | what |
|---|---|---|---|---|
| khaki0 | `#ecdfb9` | 13 | (819, 677) | b13 cluster 1/6: lit armour (L222) |
| khaki1 | `#cdb98f` | 13 | (1287, 235) | b13 cluster 2/6: khaki (L186) |
| khaki2 | `#ae9973` | 13 | (810, 704) | b13 cluster 3/6: khaki mid (L155) |
| khaki3 | `#877e62` | 13 | (1283, 228) | b13 cluster 4/6: khaki shadow (L125) |
| olive4 | `#535649` | 13 | (1410, 689) | b13 cluster 5/6: olive-grey deep (L84) |
| ink | `#101718` | 13 | (338, 239) | b13 cluster 6/6: near-black joints, used as the outline (L21) |
| olive5 | `#4b4f43` | 01 | (570, 408) | b01 cluster 3/8: olive grey (L77) |
| dark6 | `#171e19` | 01 | (573, 395) | b01 cluster 4/8: gunmetal black (L27) |
| rust0 | `#e1a761` | 01 | (561, 401) | rust rule 1/4 (L176) |
| rust1 | `#be8851` | 13 | (1399, 677) | rust rule 2/4 (L146) |
| rust2 | `#965b30` | 01 | (578, 430) | rust rule 3/4 (L104) |
| rust3 | `#653e27` | 13 | (1379, 701) | rust rule 4/4 (L71) |

Plus game tokens, parsed from `src/` (no hex retyped): visor/glow hot
`CONFIG.palette.gun` `#ffc966`, glint `CONCEPT.muzzle` `#fff2d8`, cool rim
`CONCEPT.vapor` `#c2ded8` (`rain` was off every role band), and each gun's
identity part in `CONFIG.palette.shots` (S `#ffa12f`, L `#9ff7ff`, H `#ff9adf`,
F `#ff8a4a`; R's identity is the board rust). Ramps (tone lit/mid/shadow/deep/
rim/glint): armour plates khaki (bright = helmet + near arm, mid = torso + near
leg, far = far limbs one step darker), undersuit rust, visor/glow gold, gun
olive-to-gunmetal. All 30 possible colours sit in a palette role band
(`tools/assets/lib/palette.mjs` `classify`, run by the build); the shipped
atlases use 26 of them each; manifest palette check: pass, 0% alien, 0% off-band.

**Hull separation, measured on the real captured frame** (`tools/art/rig/packet.py`,
`measure-v3.json`). Frames: `scene_capture.mjs` on this branch, all 33 atlases
loaded, RIG hidden by render layer for the RIG-free frame; desktop 1280x720 FAR
DPR 1 (16.24 px/tile), phone = FAR at 844x518 DPR 2 (23.37 device px/tile, RIG
46.7 px; the 844x390 phone frame is its central crop — T-107's lens is that
crop optically, its lift not modelled). Candidates composited 1 texel = 1
device px on the identical frame; v3 = gun R at d16 / d23. Spike B and D were
re-rendered on this host and measured on the same new captures (not inherited
from T-109). Today's gun = the spike's candidate-A gun plane at the same
placement (approximate; the run crop is excluded, RIG moved during it).

Metrics: the spike's (`tools/art/spike/measure.py`) plus three. **FILL vs hull**
= mean |luma(sprite) - luma(RIG-free frame)| over the fill only (the 1 px
outline excluded; today: its silhouette eroded 1 px) — entry 27's rule.
**fill share >= 40** = share of fill pixels meeting the rule. **fill edge
visible** = share of the outermost fill pixels >= 20 luma from the background
2 px out (past the outline) — the edge left when a dark outline merges into a
dark hull. Edge visible / gun edge contrast are the spike's definitions.

#### desktop (16.24 device px/tile; RIG 2 tiles = 32.5 px)

| idle, aim right | today | spike B | spike D | v3 |
|---|---|---|---|---|
| height px | 33 | 32 | 32 | 32 |
| colours | 311 | 25 | 26 | 13 |
| mean luma | 53.7 | 73.6 | 77.0 | 85.0 |
| contrast vs hull (whole) | 31.0 | 56.8 | 59.6 | 63.3 |
| **FILL vs hull (rule >= 40)** | 34.8 | 68.4 | 71.3 | **76.7** |
| fill share >= 40 | 0.312 | 0.655 | 0.658 | 0.701 |
| edge visible (spike metric) | 0.426 | 0.461 | 0.455 | 0.467 |
| fill edge visible | 0.577 | 0.8 | 0.817 | 0.939 |
| dark-outline share | 0.037 | 0.551 | 0.545 | 0.522 |
| gun px | 101 | 78 | 79 | 88 |
| gun edge contrast | 30.1 | 55.2 | 60.9 | 62.3 |

| all six poses (idle, run, jump, aim up-right, firing, facing left) | today | spike B | spike D | v3 |
|---|---|---|---|---|
| height px | 29-33 | 27-32 | 27-32 | 29-32 |
| colours | 206-326 | 25-27 | 26-28 | 12-13 |
| mean luma | 48.0-68.2 | 72.6-75.3 | 75.0-79.0 | 81.6-88.4 |
| contrast vs hull (whole) | 27.5-35.2 | 48.8-61.7 | 51.2-65.3 | 56.3-67.6 |
| **FILL vs hull (rule >= 40)** | 31.7-57.5 | 59.2-77.0 | 62.2-79.5 | **67.9-84.8** |
| fill share >= 40 | 0.232-0.632 | 0.51-0.743 | 0.51-0.764 | 0.66-0.822 |
| edge visible (spike metric) | 0.284-0.496 | 0.137-0.67 | 0.139-0.659 | 0.111-0.626 |
| fill edge visible | 0.542-0.9 | 0.712-0.805 | 0.7-0.837 | 0.876-0.962 |
| dark-outline share | 0.015-0.047 | 0.164-0.747 | 0.167-0.739 | 0.123-0.747 |
| gun px | 101-123 | 75-98 | 75-101 | 86-93 |
| gun edge contrast | 23.4-32.5 | 46.1-55.2 | 51.3-60.9 | 49.8-69.4 |

Hull sweep (v3 idle slid along the deck row, every 4 px, 300 stops across the
whole frame): FILL vs hull min **49.4**, p10 62.8, median 79.7, max 95.6;
fill share >= 40 min 0.561, median 0.748; **stops below 40: 0**.

#### phone (23.37 device px/tile; RIG 2 tiles = 46.7 px)

| idle, aim right | today | spike B | spike D | v3 |
|---|---|---|---|---|
| height px | 48 | 45 | 45 | 45 |
| colours | 614 | 28 | 29 | 14 |
| mean luma | 56.8 | 78.3 | 80.0 | 92.3 |
| contrast vs hull (whole) | 35.4 | 59.8 | 61.0 | 68.1 |
| **FILL vs hull (rule >= 40)** | 41.9 | 69.6 | 70.8 | **79.6** |
| fill share >= 40 | 0.379 | 0.651 | 0.668 | 0.737 |
| edge visible (spike metric) | 0.407 | 0.458 | 0.45 | 0.469 |
| fill edge visible | 0.651 | 0.846 | 0.846 | 0.897 |
| dark-outline share | 0.024 | 0.556 | 0.55 | 0.51 |
| gun px | 224 | 154 | 157 | 177 |
| gun edge contrast | 30.4 | 44.9 | 52.4 | 53.6 |

| all six poses | today | spike B | spike D | v3 |
|---|---|---|---|---|
| height px | 43-48 | 39-46 | 38-46 | 40-46 |
| colours | 411-634 | 28-32 | 29-32 | 14 |
| mean luma | 49.9-70.0 | 78.3-80.3 | 80.0-82.2 | 88.7-93.7 |
| contrast vs hull (whole) | 30.7-36.5 | 54.1-65.9 | 55.9-67.8 | 61.7-74.3 |
| **FILL vs hull (rule >= 40)** | 35.1-53.4 | 63.4-78.2 | 65.4-79.6 | **72.4-88.8** |
| fill share >= 40 | 0.26-0.627 | 0.517-0.72 | 0.526-0.753 | 0.702-0.841 |
| edge visible (spike metric) | 0.245-0.407 | 0.13-0.633 | 0.121-0.628 | 0.064-0.614 |
| fill edge visible | 0.524-0.713 | 0.607-0.859 | 0.681-0.864 | 0.846-0.942 |
| dark-outline share | 0.0-0.038 | 0.165-0.741 | 0.159-0.737 | 0.16-0.669 |
| gun px | 224-261 | 148-195 | 149-198 | 174-180 |
| gun edge contrast | 20.8-30.4 | 40.8-49.7 | 47.9-60.6 | 53.6-65.7 |

Hull sweep (402 stops): FILL vs hull min **49.4**, p10 73.0, median 84.2,
max 99.6; fill share >= 40 min 0.579, median 0.793; **stops below 40: 0**.

**Box 2 verdict by the rule as written**: v3's fill separates from the hull
behind it by >= 40 luma on average in every measured pose, at both framings,
and at every one of 702 positions along the deck. Falsifier: the same
measurement on today's in-game RIG gives 31.7-57.5 (desktop) — three of six
poses under 40 — so the metric can fail. What the numbers do not settle: the
spike's outer-edge metric stays where D had it (0.06-0.63) because the 1 px
ink outline merges into the darkest hull; the run pose stands in front of a
near-black wall band there (0.11 desktop / 0.06 phone). The fill one pixel in
is visible (0.85-0.96). Whether the outline should change is a look question.

## 3. Box 3 — frame inventory x 5 guns, one-command build, provenance

From `src/render/player.js` `sync()` (which body frame each state selects)
and `src/sim/player.js` `computeAim()` (which aims each state can produce:
8-way digital; grounded + down alone gives the down-FACING diagonal, airborne
or on a ladder straight down; strafe (`keys.strafe && v === 0`) holds a set
aim, so straight down is also reachable while grounded). Left = the cell
mirrored about the sim point.

| game state (`player.js`) | drawn today | v3 frames per gun |
|---|---|---|
| aim-idle (stationary) | `aim-right` / `aim-down-right` body + a gun plane rotated to the aim | `stand-{right, up-right, up, down-right, down}` = 5 |
| firing kick (`RIG_RECOIL_MS` 105 ms) | the gun plane slid 0.095 tiles back, any state | `stand-fire-*` x the same 5 aims = 5 (gun slid back, hands follow) |
| run (distance-driven) | contact / pass / flight in a 4-beat c-p-f-p | `run-{contact,pass,flight}-{a,b}` x 5 grounded aims = 30 (either leg leading: an alternating cycle) |
| land-brace (120 ms) | `contact` | reuses `run-contact-a` at the same aim |
| air-rise / air-fall | `air-rise` / `air-fall` | `air-{rise,fall}` x 5 aims = 10 |
| climb (ladder, 4 phases) | `climb-0..3` | `climb-{0..3}` x 5 aims = 20 (far hand on a rung, near hand on the gun) |
| wall contact | `climb-0` / `climb-2` | reuses `climb-0` / `climb-2` |
| crouch (`?crouch=1`, aim levelled) | body squashed, socket 0.45 | `crouch-right` = 1 |
| hit / i-frames | visibility blink | none (the blink stays a draw effect) |
| facing -1 | planes mirrored | the cell mirrored about the sim point |

**71 x 5 = 355 frames per density; 1065 cells.** The far hand: on the gun in
206 frames, on a rung in 100 (every climb frame), resting in 49 — the
straight-down aims, where the gun is drawn in front of the legs (section 4)
and the far hand cannot reach its fore-end (only down aims may let go; any
other unreachable hand is a build error). `rig-v3.json` `lhand` records it.
The pose solver needed no pelvis shift for 340 frames (15 used 0.04-0.08
tiles) and no extra chest twist for 349. Every frame is in
`v3-inventory-R-d16-3x.png` / `v3-inventory-R-d23-2x.png` (gun R).

| chassis | CC0 model | identity at 18-27 px of gun | scale (tiles/unit), thickness |
|---|---|---|---|
| R RIFLE | Bullpup_3 | long chunky block, rust lower body (its `MainLight` parts) | 0.306, x1.40 |
| S SPREAD | Shotgun_ShortStock | long twin tube, rust stock, orange (`shots.S`) pump | 0.226, x2.10 |
| L LASER | SniperRifle_4 | long thin rifle (barrel x2 past the fore-end), cyan (`shots.L`) scope | 0.168, x2.20 |
| H HOMING | SubmachineGun_1 | tall boxy SMG, long pink (`shots.H`) magazine | 0.361, x1.25 |
| F FLAME | Bullpup_2 (the spike's gun) | bulky bullpup, orange (`shots.F`) vertical foregrip | 0.322, x1.40 |

Every gun is scaled so its grip sits on the sim's hand socket and its muzzle
on the sim's shot origin. A stocked M4 (AssaultRifle2_1) was R first: at 16
px/tile its barrel and handguard came out under a pixel and the gun all but
vanished at true size (41-64 gun px vs D's 75-101), so R became the chunkiest
body in the pack.

**One command** (run under `nice -n 15`):

    /opt/hb-art/bin/python -I tools/art/build_rig_v3.py [--jobs 3] [--falsify S]

Steps: CC0 sources sha256-checked (`tools/art/spike/fetch_cc0.py`,
`HB_ART_CC0` overrides the directory) -> the sim's `muzzleY` 1.05 /
`barrelTiles` 0.82 / crouch `muzzleY` 0.45 / `RIG_RECOIL_TILES` 0.095 re-read
from `src/` (the build refuses to run if they moved) -> the board palette
re-measured and every colour role-checked -> render (Blender) -> post -> pack
-> anchor check (-> falsify). Prints every output's sha256.

**Reproducibility**: build A (`tools/art/build/rig-v3`) and build B (a scratch
build dir and output dir, CC0 re-extracted from copies of the verified
archives) rendered independently and, after the one post-side fix in section
4, were posted/packed/checked by the same command with `--keep` (renders
reused, everything downstream re-run):

| file | sha256 (A = B) | bytes |
|---|---|---|
| `rig-v3.json` | `567732b6e91193d5d5445290ecdcc9fb1f527997459c4a227eebe8bd82392c8d` | 71204 |
| `rig-v3-d16.png` | `7d0d53ea6946867417c843293ef1537ca13e92111b55e957e09d2a16da1aef22` | 57289 |
| `rig-v3-d23.png` | `728a45e6136d71094083461ddf3230293c626cad07b1d1814ecc2b758dd7c848` | 107431 |
| `rig-v3-d35.png` | `31aaa3813ca899b215fa4db8fb4fff27679b94da276fe743999d8cf3e49958ae` | 187295 |

**Build time and render cost** (4-core host shared with ~8 agents, load
average 55-90 throughout, builds A and B running at the same time, every
Blender/post process niced 15, `--jobs 3`): render 3229 s (A) / 3200 s (B) for
355 frames; post 1873 s / 1772 s; pack 7-22 s; check 10-29 s; sources + sim +
palette ~15 s; falsify (71 S frames re-rendered in one process + post + pack +
check) 737 s. A clean build was therefore ~85 min under that load. Per frame:
3 Cycles passes on one 744x840 grid (280.8 px/tile), mean 19.5 s wall at that
load (id 5.0 s, normal 5.1 s, AO+depth 9.4 s); an earlier full render of the
same passes (two processes, load 40-90, before the final gun changes)
averaged 6.4 s per frame. Post: ~0.3 s CPU per frame for all three densities.

**Provenance** (`tools/art/spike/cc0.json`; downloads are git-ignored, nothing
third-party is committed; licence as stated on each OpenGameArt page on
2026-10-23):

| id | title / author | page | licence | sha256 (archive) | members used |
|---|---|---|---|---|---|
| irondust-scifi-soldiers | "Sci-fi soldier" / Irondust | https://opengameart.org/content/sci-fi-soldier | CC0 | `4a91f4ae01117656c9a5a8fc71930f852b2c4d3e94f3f9a2c88109ad931e0db4` | Mesh.blend (body, Head1, HandSimple, metarig); FederalSoldierSkin_Albedo.tga + Emission.png (zones only; colours unused) |
| quaternius-ultimate-gun-pack | "Low Poly Guns Pack (Ultimate Gun Pack, July 2019)" / quaternius | https://opengameart.org/content/low-poly-guns-pack | CC0 (OGA copy) | `6bbae4cd42a520bd2ed95881394293e90804a63abdaf121e3b55fa08b7311737` | Bullpup_2, Bullpup_3, Shotgun_ShortStock, SniperRifle_4, SubmachineGun_1 (.fbx) |
| mikemoon-hornet-wasp | "3D Hornet/Wasp" / MikeMoon | https://opengameart.org/content/3d-hornetwasp | CC0 | `4a82eae58e79e59cfdd57936eea1579fe6937fe0e20319959bfd29132a3db35e` | the spike's wasp only (not in v3) |

The only geometry not from these sources is the spike's two-box back pack.
quaternius.com's own licence page now shows the non-CC0 QAL; only the 2019
OpenGameArt copy posted as CC0 is used (the spike's finding, unchanged).

## 4. Box 4 — anchor check: within 1 px, and it binds

`tools/art/rig/check.py`, run by every build on the SHIPPED files: (1)
post's part map, re-coloured, equals the atlas cell byte for byte (so the gun
pixels the check reads are the pixels that ship); (2) the gun pixels on the
bore axis end within 1 px of the exported `drawnMuzzle`; (3) the exported
`muzzle` equals the shot origin recomputed from `src/config.js` and
`drawnMuzzle` equals it minus `RIG_RECOIL_TILES` on stand-fire frames.

| density | frame-densities | fails | max drawn vs anchor | mean | parts != shipped | anchor vs sim max |
|---|---|---|---|---|---|---|
| d16 | 355 | 0 | 0.829 px | 0.417 px | 0 | 2.4e-6 tiles |
| d23 | 355 | 0 | 0.618 px | 0.273 px | 0 | 2.4e-6 tiles |
| d35 | 355 | 0 | 0.818 px | 0.363 px | 0 | 2.4e-6 tiles |

**It binds** (`build_rig_v3.py --falsify S`): gun S re-rendered with its MESH
0.15 tiles down its bore, every anchor left where the sim puts it, posted and
packed beside the honest cells of the other guns -> **all 213 S
frame-densities fail** (drawn muzzle 1.72-4.79 px off at d16, 3.13-8.19 at
d23, 4.59-11.21 at d35), **all 852 others pass**, `FALSIFICATION CONFIRMED`.
Image: `anchor-falsify-S-d16-8x.png` (honest vs moved, the anchor marked).
(0.10 tiles was rejected first: at d16 that is 1.6 px, and a diagonal barrel's
0.71 px quantization could leave a moved frame inside the 1 px tolerance.)

**Two real defects it caught during the build**, both fixed:
1. Straight-down aims: with the gun 0.10 tiles in front of the body's mid
   plane, the barrel ran behind the near leg; drawn muzzles ended 1-24 px
   short (24 of 426 H/F frame-densities failed). Depth is render-only under
   the orthographic camera, so `render.py` draws straight-down guns 0.32 tiles
   forward (`GUN_DEPTH_BY_AIM`); sim geometry and anchors unchanged.
2. `H:climb-3-down` at d16: the SMG's 0.43 px barrel stub lost its last pixel
   to the knee beside it in the majority vote (1.26 px short). Gun parts now
   win a contested pixel at weight 2.0 (the spike's 1.6) in `post.py`; gun
   area changed by 0-5 px per frame.

## 5. Box 5 — the packet (today vs v3 at true size on the real background)

All under `reports/tasks/T-124/` (2.0 MB total). Today = the shipped
renderer's own screenshot (lit, tone-mapped, mipmapped, canvas-resampled);
v3 / spike D are composited 1 texel = 1 device px on the identical RIG-free
frame. Look at the true-size images 1:1, not zoomed.

| # | file | shows |
|---|---|---|
| 1 | `packet-1-true-size.png` | desktop and phone true-size windows, today vs v3 (gun R), plus the boards' RIG box-downscaled to the same on-screen height |
| 2 | `v3-desktop-4x.png` (`-1x`) | six poses x today / spike D / v3, desktop FAR, nearest x4 (and true size) |
| 3 | `v3-phone-4x.png` (`-1x`) | the same at the phone framing, device px |
| 4 | `v3-guns-desktop-1x.png` (`-4x`), `v3-guns-phone-*` | the five guns, idle / aim up-right / run, on the real frame |
| 5 | `v3-run-cycle-desktop-4x.gif`, `v3-run-cycle-phone-4x.gif` | the six-beat run cycle on the real frame, 50 ms a beat (the game's 300 ms stride) |
| — | `v3-desktop-context.png`, `v3-phone-context.png` | the two halves of image 1 alone |
| — | `v3-inventory-R-d16-3x.png`, `v3-inventory-R-d23-2x.png` | all 71 poses of gun R |
| — | `anchor-falsify-S-d16-8x.png` | the anchor check's negative control |
| — | `board-swatches.png`, `board-swatches.json` | the palette measurement |
| — | `measure-v3.json` | every number in section 2 |

## 6. Gates

- `HB_GATE_FAST=1 node tools/pathcheck.mjs` on this worktree after the
  manifest commit: **4122 passed, 0 failed** (the 4 browser-probe assertions
  and 37 of 41 played turn runs skipped by the host's standard flags, not
  counted). This lane changes no runtime file; the manifest gains 3 entries
  and nothing else changes in it.
- Manifest entries: computed by `tools/art/rig/manifest.mjs` with the asset
  gate's own library (`readPngSize`, power-of-two, the alpha-weighted
  histogram + `checkRasterColors`, `validateEntryShape`): palette pass, 0%
  alien, 0% off-band; roles haze, hot-magenta, ink, rust-orange, warm-white
  (+ hull at d23/d35). No `alpha` kind is declared: hard 0/255 pixel-art
  edges, which `cutout` (>= 2% feathered) rejects by design (T-109's call).
  The full `node tools/assets/check.mjs --json` sweep did not finish: killed
  by a 50-minute `timeout` (exit 124, 10 min CPU, niced, load 65-90), as
  T-109's attempt was at 40 minutes (proposed issue below).
- Not run: a bot playtest (no runtime change) and an in-game capture of v3
  (nothing loads it; phase 2).

## 7. Notes for phase 2 (the loader; coordinate with T-123)

- **Density per device**: frame i is cell i in every density, so a loader
  picks the density by device px/tile and indexes the same frame: d16 = x1 at
  1280x720 desktop FAR (DPR 1), x2 at 720 css tall DPR 2 or 1440 tall DPR 1,
  x3 at 2160 tall; d23 = x1 for the phone frame at DPR 2 (1920x1080 FAR wants
  24.4 — d23 draws RIG 4% small there); d35 = x1 for the phone frame at DPR 3
  (the operator's iPhone). FAR px/tile scales with the viewport height
  (0.02256 x css height, measured at 720 / 800 / 518 px).
- **Mirror**: by the GUN (aim.x < -0.1), and by facing for a vertical aim —
  player.js's own mirrorY rule. Strafe can move RIG against the gun: play
  the run cycle backwards there (a backpedal) rather than turning the body
  away from the gun. On a wall the cell mirrors with the gun too.
- **The kick** is drawn standing only (`stand-fire-*`); in motion the loader
  shows the unkicked frame (a whole-cell 1 px kick is an option).
- **Memory**: RGBA8 without mips, d16 4 MB, d23 8 MB, d35 16 MB; a device
  needs one density. If phone memory matters, a per-gun split is possible
  (71 cells each).
- The cells are palette-exact UNLIT pixels for the crisp path (unlit,
  nearest, mip-free, snapped to the device grid). Under today's lit material
  + ACES they would darken (the spike measured gain 0.81/0.76/0.62).
- `assets/generated/` ships whole in the deploy bundle
  (`tools/deploy/build-bundle.mjs`), so the 423 KB of v3 files ride along
  before anything loads them.

## 8. Limitations, stated plainly

- Byte-reproducibility is proven on this host only (Cycles 1 spp at pixel
  centres, fixed seed, AO 16 samples, Mesa/bpy 5.2.3). Another CPU or Blender
  build may move pixels; compare hashes before trusting a build made elsewhere.
- The packet composites; it does not run v3 in the game (no `src/` change in
  phase 1). The phone frame is the FAR shot at the phone density, centre-cropped
  (T-107's lift not modelled; capture canvas ratio 2.139 vs a real 844x390
  phone's 2.2). Today's firing crop caught the `contact` (land-brace) body,
  which is what the game drew at that frozen frame.
- The sim fires from 53% of RIG's height, so every gun is held at the hip;
  boards 01/13 hold the rifle at the shoulder. Moving that is a sim decision.
- Crouch (`?crouch=1`) fires from 0.45 tiles: long magazines dip up to 0.20
  tiles below the deck line (as today's gun plane does there); the cell was
  extended to fit.
- Straight-down aims: 49 of 50 frames per build hold the gun one-handed in
  front of the legs.
- Today's gun numbers use the spike's candidate-A gun plane as a mask
  (approximate: the in-game gun is blurred over it).
- v3 keeps the spike's base-mesh ceiling: a slim CC0 cyber-soldier
  exaggerated in code (bigger helmet, hands, thicker limbs, shorter legs).

## 9. Open look questions for the operator (non-leading)

No in-game URL yet: nothing in `src/` loads v3 in phase 1. Phase 2 will ship
it as the default with `index.html?art=legacy` as today's art (entry 27).
The packet is images 1-5 in section 5.

1. In image 1, at true size, which RIG do you read faster as "an armoured
   person holding a gun" against the hull — today's or v3 — and what, if
   anything, slows the other one down?
2. Compared with the boards' RIG in the strip under image 1, how close is
   v3's colouring to what you meant by "board colours"? What would you change?
3. In image 4 at true size, can you tell the five guns apart? Which pair is
   closest?
4. v3 keeps a 1 px near-black outline, which merges into the darkest parts of
   the hull. Does the outline help, hurt, or not matter to you at true size?
5. Every gun is held at the hip because the game fires from 53% of RIG's
   height; the boards hold the rifle at the shoulder. In images 2-3 and the
   run GIF, does the hip hold read the way you want RIG to fight?

## 10. PROPOSED INBOX ISSUES

## I-??? | art | S3 | repro: `index.html?crouch=1`, crouch while holding R or H; v3 cell `R:crouch-right` | evidence: reports/tasks/T-124/v3-inventory-R-d16-3x.png (last cell)
The crouch prototype fires from 0.45 tiles (`CONFIG.crouch.muzzleY`), so a
gun held on that line puts its magazine and stock 0.1-0.2 tiles under the
deck line — today's gun plane does the same, v3 makes it visible because the
gun is drawn in the hands. It only matters if crouch is kept (it is an
unjudged A/B prototype). Direction: if crouch ships, either hold the gun
canted in the crouch frames or keep magazines above the deck by a crouch-only
grip rule; the sim line stays where it is.

## I-??? | render | S2 | repro: `keys.strafe` held while moving against the aim; ladder/wall with the aim away from the wall | evidence: reports/tasks/T-124/build.md section 7
With the gun baked into the frame (v3), the body can no longer face one way
while the gun points the other, which today's separate gun plane allows
(strafe backpedal; a wall hold aiming away from the wall). Phase 2 needs an
explicit rule — v3's JSON proposes: mirror by the gun, play the run cycle
backwards when travelling against it — and the playtester should check both
cases on a phone. Direction: decide in T-124 phase 2 with T-123's loader;
note the rule in `rig-v3.json` `mirror` (already there) and test it.

## I-??? | harness | S3 | repro: `timeout 3000 nice -n 15 node tools/assets/check.mjs --json` on this host at load 65-90 | evidence: reports/tasks/T-124/build.md section 6; reports/tasks/T-109/build.md section 6
The asset gate's full sweep decodes every large PNG in pure JS and cannot
finish on this host: killed after 50 minutes here (10 min CPU), after 40 in
T-109. Art lanes therefore validate their new entries by calling its library
functions (`tools/art/rig/manifest.mjs` does exactly what the gate does for
those entries) instead of the gate itself, which is weaker evidence than the
gate run. Direction: an `--only <id>` (or `--changed`) mode, and/or a faster
PNG decode, so a lane can run the real gate on what it touched.

## 11. Worktree, branch, commits

`/home/user/hullbreaker/.claude/worktrees/T-124`, branch `task/T-124`:
49718cc (integrator: v2 atlases out), e1fb59d (v2 builder out), dc32b5f (WIP
snapshot, reviewed), 02c3670 (lib trimmed), d730377 (the v3 build), 1d692e7
(README + packet tooling), a760017 (straight-down depth fix), 28b0679 (atlases,
JSON, manifest entries, post weight fix), and this report's commit (packet
images, measurements, palette evidence, README/packet touch-ups). Not merged.

## 12. Single best next action

Put image 1 (`packet-1-true-size.png`), image 4 and the run GIF in front of
the operator with the five questions now — the look verdict does not need the
wiring — and dispatch T-124 phase 2 when T-123 merges: load `rig-v3.json`,
pick the density per device at an integer scale, mirror by the gun, ON by
default with `?art=legacy`.
