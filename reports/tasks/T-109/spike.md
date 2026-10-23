# T-109 A2 art spike — look comparison and production method

**Status: spike complete.** Nothing under `src/` changed and nothing here is
loaded by the game. The images and numbers are evidence for the operator;
whether any of it looks right is his call (decisions.md entry 26: the bar is
shipped commercial 2D action games at this on-screen size). Worktree
`/home/user/hullbreaker/.claude/worktrees/T-109`, branch `task/T-109`.

## 1. In one screen

- Four RIGs were put on the **real game scene** (all 33 atlases loaded, RIG
  hidden by render layer, same frozen frame) at **true size** in the two
  framings: desktop 1280x720 FAR (RIG 32.5 px) and the phone frame (RIG 6.0%
  of 390 css px = 46.7 device px at DPR 2), in six poses (idle, run, jump, aim
  up-right, firing, facing left), at 1x and nearest 4x.
- **today** = the shipped renderer's own screenshot; **A** = today's painted
  art drawn crisp (1 texel = 1 device px, unlit); **B** = a CC0 professionally
  modelled soldier + CC0 rifle, posed on the sim's shot line, toon-reduced to
  pixels by script; **D** = B + a scripted 1x tidy pass. A wasp from a CC0
  rigged hornet went through the same B pipeline.
- Measured, not judged: today's in-game RIG is darker than its own painting
  (lit gain 0.81/0.76/0.62 R/G/B) and softer (silhouette-edge visibility 0.43
  vs 0.60 for the same painting drawn crisp at the same brightness) — **a
  large share of today's murk is the render path, not the painting.** Any
  art, from any production route, needs a phase-B sprite path (unlit,
  nearest, snapped to the device grid, density per device) to arrive crisp.
- B/D use 25-32 colours with 3-4 value steps per armour material and differ
  from the hull behind them by 49-68 luma on average (today: 26-37), hold the
  gun with both hands in every frame by construction, and put the drawn
  muzzle on the sim's shot origin (the game's own frozen muzzle flash lands
  on it in the firing panels). Their near-black outline is close to the
  hull's own darks (72% of the desktop frame is below luma 40), so on this
  world their silhouette reads by the fill, not the outline.
- The scripted tidy pass (D) moves the numbers a little (gun edge contrast
  +4 to +11, contrast vs hull -0.1 to +3.6, edge visibility within 0.02); a
  selective outline was tried and measured worse here, so D keeps the ink. A
  script is not an artist.
- Production: CC0 + pipeline costs $0 and ~3-5 lane-weeks; a paid pack
  (Synty POLYGON Battle Royale US$49.99 / Sci-Fi Space US$149.99, verified on
  syntystore.com 2026-10-23) changes the base models, not the work, and carries
  licence questions; a commissioned pixel artist is an estimated US$3k-25k and
  draws one native size for screens whose RIG heights (32.5 / 46.7 / ~70 px)
  are not integer multiples. Section 6.

## 2. The candidates

| | What it is | Made by |
|---|---|---|
| today | the shipped game's own screenshot: the AI-painted atlases (placeholders per entry 26) through the lit `MeshStandardMaterial`, ACES, mipmaps and the canvas resample | `tools/art/spike/scene_capture.mjs` |
| A — today, crisp | the same painted body atlases, R gun cutout and R accent plates, assembled exactly as `src/render/player.js` does (anchorX on the sim x, gun on the hand socket at `muzzleY`, height x1.34, recoil 0.095 on the fire frame), composed at 8x and area-downsampled ONCE to device px, 50% alpha cut, colours as painted | `tools/art/spike/crisp.py` |
| A_lit (numbers only) | A times the per-channel gain the shipped material applies to RIG, measured on the idle pose; it splits "darker" from "softer" | `tools/art/spike/measure.py` |
| B — CC0 3D toon | Irondust's CC0 "Sci-fi soldier" (body, Head1, HandSimple, Rigify metarig) + quaternius' CC0 Bullpup_2, exaggerated for a 32-47 px read (helmet x1.5, hands x1.35, chest x1.16 wider, shoulders x1.3, limbs x1.28-1.34 thicker, arms x1.10 and legs x0.95 long, body x0.93, gun 1.14 tiles long and x1.6 thick); the gun placed FIRST on the sim's shot line (bore through `(0, muzzleY)`, muzzle `barrelTiles` along the aim), the body solved around it by analytic IK with a fixed reach search (a hand that cannot reach the gun is a build error); data passes rendered in Cycles at 8x, 1 spp at pixel centres; reduced by weighted majority to one palette entry per pixel; 4 tones from the game's key light (`LIGHT_RIG.key` az 40 / el 50), a cool rim from its rim light, 1 px depth lines where a near part overlaps a far one, 1 px near-black outline | `tools/art/spike/v3_render.py`, `v3_post.py` |
| D — B + tidy | B plus scripted 1x rules: single-pixel spurs removed / notches filled, one-pixel tone islands merged, the visor drawn as a lit slit in a dark faceplate, the gun's top edge two tones lighter and a glint pixel at its muzzle. A selective "sel-out" outline was also scripted and measured worse on this hull (desktop idle, final pipeline: edge visibility 0.46 with the ink vs 0.30 with sel-out); it is off (`SELOUT_IN_D = False`) | `tools/art/spike/v3_post.py` |
| (C) | not produced: there is no image model on this host, and a human artist's work cannot be simulated here. That route is option (iii) in section 6 | — |
| wasp | MikeMoon's CC0 rigged "3D Hornet/Wasp": wings raised in a V, abdomen pitched down, head x1.65, abdomen x1.4 thicker, body 1.25 tiles long, facing -x like the captured wasp; same reduction, the ENEMY acid ramp (`wasp` #9ce23e, `waspDive` #bdf03e, `carrier` #63b12e, `houndCharge` #3f9e14) over a dark olive carapace, banded abdomen | `tools/art/spike/wasp_v3.py` |

B/D frames: idle, fire, upright (aim 45), jump (air rise), run contact / pass /
flight, at two native densities (16.24 and 23.37 device px/tile — not a
resample). Facing -1 is the mirror about the sim point, as the game mirrors.

## 3. How the comparison was made

`node tools/art/spike/scene_capture.mjs --view desktop|phone` (own server on an
OS-assigned port, closed at exit; Chrome via the playtest install):

- **Framings.** desktop: 1280x720, DPR 1, `?view=far` — measured 16.24 px per
  tile at RIG's render depth, RIG's 2.0-tile visual height = 32.5 px (4.5%).
  phone: 844x518, DPR 2, `?view=far` — 11.685 css px/tile, RIG 23.4 css px =
  46.7 device px = 6.0% of 390; the phone frame is the central 844x390 css of
  it. The in-flight T-107 phone lens (`src/pure/framing.js` on `task/T-107`)
  is the FAR camera pose through a narrower field of view, i.e. optically this
  centre crop; its small camera lift is not modelled.
- **Everything loads.** The served `src/render/preload.js` has its two boot
  budgets raised to 240 s at the route layer (the file differs from `src/`
  only in those constants), so this loaded 4-core host loads all 33
  registered atlases (both views: 33/33 `ready`) as a real device does within
  2.5 s. Phase A instead aborted unrelated atlases; nothing is blocked here.
- **Frozen scene.** A `requestAnimationFrame` hook that runs after the game's
  own frame callback re-sets the scroll cursor (the camera follows it),
  clears hostiles and re-applies the staged player row each frame, so every
  frame is "one update after the same state". The firing pair is one frame
  frozen by `setState('PAUSED')` the frame a muzzle flash is alive (the pause
  overlay hidden by CSS), shot with and without RIG: the same flash in both.
- **RIG hidden by render layer.** The `rig` group (`src/render/player.js`) is
  moved to layer 31, which the camera does not draw; his contact shadow and
  the muzzle flash are separate objects and stay. The RIG-free frame is
  therefore pixel-registered with today's screenshot.
- **Placement.** Every candidate cell carries the sim point in pixel-edge
  coordinates and is pasted where the game projects the staged sim point at
  RIG's render depth (1.15), 1 cell px = 1 device px, never resampled.
- **Today's run crop** moved between the state read and the screenshot (RIG
  was running); its gun numbers are excluded.
- **Renderer facts recorded during capture.** Desktop draws a 1600x900
  canvas for 1280x720 css (pixel ratio 1.25) that the browser downsamples by
  0.8; the phone capture drew 2.139x (a real 844x390 phone: 2.2x by
  `src/pure/render-budget.js`; on a DPR-3 iPhone that 2.2x canvas is then
  UPSCALED 1.36x by the compositor). Today's sprites are resampled at least
  twice before they reach the screen.
- **The background is dark.** Measured on the RIG-free desktop frame: 72% of
  pixels below luma 40, 98% below 80; median 31 (the playfield band around
  the deck: median 35). The brightest large surface near RIG is the deck lip.

Cost on this host (load 7-90 on 4 cores, shared with other lanes): boot
36-91 s (desktop) / 68-106 s (phone); 20-121 s per screenshot. B render 2.5-7 s per pose (7 passes),
reduction ~0.5 s per frame; A ~0.4 s per frame; wasp ~7 s per pose.

## 4. Measurements

`/opt/hb-art/bin/python -I tools/art/spike/measure.py --view desktop|phone`;
every number is in `reports/tasks/T-109/spike/measure-{desktop,phone}.json`.
Definitions: *edge visible* = share of silhouette-edge pixels whose luma
differs by >= 20 from the background pixel touching them; *dark-outline share*
= share of edge pixels darker than both that background and the sprite's
interior median by >= 15; *contrast vs hull behind* = mean |luma(sprite) -
luma(RIG-free background at the same pixel)|; *gun edge contrast* = mean luma
step across the gun's boundary. Today's silhouette is the screenshot
differenced against the identical RIG-free frame (it includes the renderer's
soft fringe); its gun pixels are A's gun mask at the same placement
(approximate).

#### desktop (16.24 device px/tile; RIG 2.0 tiles = 32.5 px)

| idle, aim right | today | A_lit | A | B | D |
|---|---|---|---|---|---|
| height px | 33 | 32 | 32 | 32 | 32 |
| colours | 322 | 297 | 298 | 25 | 26 |
| mean luma | 51.0 | 59.1 | 77.5 | 73.6 | 77.0 |
| value steps (16-bins >=5%) | 7 | 6 | 6 | 6 | 7 |
| contrast vs hull behind | 33.0 | 36.7 | 49.8 | 56.8 | 59.6 |
| edge visible (>=20 luma) | 0.427 | 0.604 | 0.724 | 0.461 | 0.455 |
| dark-outline share | 0.042 | 0.082 | 0.082 | 0.551 | 0.545 |
| gun px | 101 | 118 | 118 | 78 | 79 |
| gun length px | 18 | 18 | 18 | 18 | 18 |
| gun edge contrast | 30.0 | 51.3 | 69.1 | 55.2 | 60.9 |

Ranges over the six poses (idle, run, jump, aim up-right, firing, facing left):

| all poses | today | A_lit | A | B | D |
|---|---|---|---|---|---|
| height px | 30-35 | 29-35 | 29-35 | 27-32 | 27-32 |
| colours | 184-361 | 240-324 | 242-329 | 25-27 | 26-28 |
| mean luma | 41-70.7 | 53.8-60.5 | 70.5-79.2 | 72.6-75.3 | 75-79 |
| value steps (16-bins >=5%) | 5-8 | 5-6 | 5-6 | 5-7 | 6-8 |
| contrast vs hull behind | 25.9-35.8 | 27.2-41.3 | 39.1-57 | 48.8-64 | 51.2-65.3 |
| edge visible (>=20 luma) | 0.32-0.49 | 0.48-0.70 | 0.57-0.85 | 0.14-0.66 | 0.14-0.65 |
| dark-outline share | 0.01-0.08 | 0.01-0.15 | 0.01-0.13 | 0.16-0.74 | 0.17-0.73 |
| gun px | 101-115 | 118-129 | 118-129 | 75-98 | 75-101 |
| gun length px | 18-19 | 18-19 | 18-19 | 18-19 | 18-19 |
| gun edge contrast | 23.1-39.1 | 38.9-51.8 | 52.5-69.1 | 46.1-55.2 | 51.3-60.9 |

lit gain measured on A (today / A, idle): [0.813, 0.763, 0.618]

#### phone (23.37 device px/tile; RIG 2.0 tiles = 46.7 px)

| idle, aim right | today | A_lit | A | B | D |
|---|---|---|---|---|---|
| height px | 48 | 47 | 47 | 45 | 45 |
| colours | 629 | 590 | 613 | 28 | 29 |
| mean luma | 52.6 | 58.8 | 78.2 | 78.3 | 80.0 |
| value steps (16-bins >=5%) | 6 | 6 | 6 | 5 | 6 |
| contrast vs hull behind | 35.7 | 38.2 | 51.8 | 59.8 | 61.0 |
| edge visible (>=20 luma) | 0.416 | 0.591 | 0.704 | 0.458 | 0.45 |
| dark-outline share | 0.047 | 0.099 | 0.103 | 0.556 | 0.55 |
| gun px | 226 | 269 | 269 | 154 | 157 |
| gun length px | 27 | 27 | 27 | 27 | 27 |
| gun edge contrast | 23.7 | 51.2 | 70.5 | 44.9 | 52.4 |

Ranges over the six poses (idle, run, jump, aim up-right, firing, facing left):

| all poses | today | A_lit | A | B | D |
|---|---|---|---|---|---|
| height px | 43-51 | 42-50 | 42-50 | 39-46 | 38-46 |
| colours | 373-707 | 485-642 | 502-662 | 28-32 | 29-32 |
| mean luma | 40.4-66.2 | 53.4-59.5 | 71.1-79.1 | 78.3-80.3 | 80-82.2 |
| value steps (16-bins >=5%) | 5-8 | 6-7 | 6-7 | 5-6 | 5-6 |
| contrast vs hull behind | 26.7-37.3 | 28.1-41.3 | 40.5-58 | 54.1-65.9 | 55.9-67.8 |
| edge visible (>=20 luma) | 0.23-0.44 | 0.46-0.69 | 0.57-0.84 | 0.13-0.63 | 0.12-0.63 |
| dark-outline share | 0.00-0.05 | 0.01-0.17 | 0.01-0.15 | 0.17-0.74 | 0.16-0.74 |
| gun px | 226-258 | 265-269 | 265-269 | 148-195 | 149-198 |
| gun length px | 26-27 | 27 | 27 | 27 | 27 |
| gun edge contrast | 17.2-26.6 | 40.4-51.2 | 55.4-70.5 | 40.8-49.7 | 47.9-60.6 |

lit gain measured on A (today / A, idle): [0.791, 0.756, 0.635]

Value steps per material (B/D part maps, tones used by >= 2 px, all seven
frames): armour 4 / 4 / 3-4 / 4 (bright / mid / dark / undersuit) in both
views; visor 3-4 in B, 2 in D (the slit rule); gun 1-3 in B, 2-3 in D (the
top-edge rule). The back pack is hidden behind the body from this camera
(0-1 tones).

**What the numbers say, plainly.**
- *Render path vs painting.* today -> A_lit is the same painting at the same
  brightness, only drawn crisp: edge visibility rises in every pose (desktop
  0.32-0.49 -> 0.48-0.70; phone 0.23-0.44 -> 0.46-0.69) and so does gun edge
  contrast (desktop idle 30 -> 51; phone idle 24 -> 51). A_lit -> A is only
  the lighting: contrast vs the hull rises (desktop idle 37 -> 50). Both
  halves are the render path, not the painting.
- *B/D vs A.* B/D are flatter (25-32 colours vs A's 240-660) with 3-4 value
  steps per armour material, and sit further from the hull's values (contrast
  vs hull behind higher in every pose and both views). Their outer edge is a
  near-black ink line, which against this dark hull is often within 20 luma of
  what it touches: edge visibility is lower than A's in most poses (the run
  pose sits in front of a near-black wall band: 0.12-0.14). The silhouette
  carries by the bright fill. Removing the ink entirely was tried: the figure
  loses its 1 px border and the feet merge into the light deck lip; not used.
- *Gun.* Same length by construction (the sim's barrel: 18-19 px desktop, 27
  device px phone). A's painted gun + accent plates are bigger (118-129 px
  desktop, 265-269 phone) and have more edge contrast (desktop 53-69, phone
  55-71) than B's bullpup (75-98 / 148-195 px; contrast 46-55 / 41-50); D's
  top-edge rule closes part of that gap (+4 to +11).
- *Gun in hand.* B/D: both hands on the gun in every frame (the build fails
  otherwise) and the drawn muzzle on the sim's shot origin. Today/A: the aim
  paintings' arm is raised to shoulder height while the gun sits at the
  sim's hip-height socket — visible in A's columns; T-103 is fixing that on
  the current art.
- *Hip hold.* B holds the gun at the hip because the sim fires from 1.05 tiles
  (53% of RIG's height); boards 01/13 hold the rifle at the shoulder (phase A
  raised this as a gameplay question; still open).
- *Proportions.* B is a stockier, crouched figure (Metal Slug-like
  proportions): the shortened legs are fitted to the deck by lowering the
  pelvis 0.13 tiles at idle (0.26 at the run's contact), and the arms reach
  down to a grip at hip height. B is 27-32 px tall at desktop and 38-46
  device px on the phone, a little under today's 30-35 / 43-51.
- *Today's firing frame* is brighter (mean luma 70.7 desktop, 66 phone) than
  its other poses because the flash lights RIG's body; the flash itself is in
  both frames of the pair and so is not in the mask.
- *What the numbers do not say:* whether any figure reads as an armoured
  marine, matches the boards, or looks good. Colour count, luma and contrast
  differ partly because A/B/D are unlit and today is lit. Those calls are the
  operator's.

## 5. The wasp (the method on an enemy)

`wasp-desktop.png`, `wasp-phone.png`: today's in-game wasp, held cruising
(dive cooldown pushed out so the crop is not a committed dive), beside the CC0
hornet through the same pipeline (two wing phases), on the same clip of the
hostile-free frame and placed on today's drawn wasp (the renderer presents it
about a tile below its sim row). The candidate has no glow: the game's actor
glow is a separate effect it would keep.

| wasp | view | height px | width px | colours | mean luma | contrast vs hull behind | edge visible |
|---|---|---|---|---|---|---|---|
| today (in-game, cruise) | desktop | 19 | 22 | 144 | 59.3 | 39.3 | 0.533 |
| CC0 wasp, wings up | desktop | 25 | 21 | 11 | 91.3 | 74.8 | 0.198 |
| CC0 wasp, wings down | desktop | 13 | 21 | 11 | 64.5 | 50.8 | 0.143 |
| today (in-game, cruise) | phone | 16 | 34 | 218 | 57.3 | 36.6 | 0.549 |
| CC0 wasp, wings up | phone | 34 | 30 | 12 | 95.6 | 78.8 | 0.09 |
| CC0 wasp, wings down | phone | 18 | 31 | 13 | 69.6 | 53.0 | 0.0 |

What carries over unchanged from RIG: the loader, the posing in code against
a rig, the data passes, the reduction, the palette mapping (here the ENEMY
acid ramp), the outline and the same two native densities. What did not
carry: the hornet is an organic insect, not board 06's bio-industrial drone
(no reactor, no plating, no mechanical joints); the legs and antennae are
thinner than a pixel at these sizes and vanish; and on the dark wall band the
ink outline disappears, as with RIG. A board-faithful drone would need a
different base model or kit-bashed mechanical parts (section 6).


## 6. Production options — bringing all animated actors to the bar

Actors: RIG (five guns, ~60 poses each in v2's inventory), wasp (~9 frames),
hound (~12), polyp (~8), mortar (~6), carrier (~6); two native densities on
the 3D routes. **Every route needs the phase-B sprite path first** (unlit,
nearest, mip-free, snapped to the device grid, density chosen per device, an
A/B flag such as `?art=v3` with today's art as the control): an estimated 2-4
lane-days. Without it any art arrives softened (section 4, today vs A_lit).

| | (i) CC0 models + this pipeline | (ii) paid game-licensed pack + this pipeline | (iii) commissioned human pixel artist |
|---|---|---|---|
| Cash | $0 | US$49.99 (Synty POLYGON Battle Royale: 15 characters + weapons, FBX) or US$149.99 (POLYGON Sci-Fi Space: 20 characters incl. aliens, FBX); prices read on syntystore.com 2026-10-23; enemy kit-bash packs extra | **estimate, not quotes:** ~100-130 hand-drawn frames (RIG body set ~40-60 + guns, enemies ~50) at US$20-50/frame for experienced freelancers ≈ US$3k-8k; top-tier commercial pixel animators ~US$80-150+/frame ≈ US$10k-25k. Get 2-3 quotes |
| Agent effort | ~3-5 lane-weeks: RIG set (port v2's pose library + anchor check to the CC0 model, 5 guns from the CC0 gun pack, 2 densities) ~1 wk; wasp 2-3 days (model in hand); hound / polyp / mortar / carrier 3-5 days each incl. finding or kit-bashing CC0 bases | ~3-4 lane-weeks (less model hunting for RIG; enemies still kit-bashed) | ~1-2 lane-weeks: brief, integration, per-frame anchor data |
| Calendar | 1-2 weeks with parallel lanes | same + purchase | artist availability + ~4-10 weeks + review rounds |
| Ceiling | the base meshes: RIG from a generic slim CC0 soldier exaggerated in code; no CC0 model found matches board 06's enemy forms (OGA has CC0 candidates to kit-bash: "robotic dog base mesh", quaternius' "Animated Mech Pack", several sci-fi turrets — not vetted) | purpose-built game models from one studio, consistent with each other; still generic, not board-06 forms; their flat low-poly planes suit the toon reduction | highest for 32-47 px readability if the artist is strong; every pixel placed |
| Consistency | mixed authors unified by one reduction, palette, light and outline (B + wasp show it carries) | one pack = one style | one artist = one style — but ONE native size: RIG is 32.5 px on a 1280x720 desktop, 46.7 device px on a DPR-2 phone and ~70 on a DPR-3 iPhone, so a drawn size scales by an integer on only some screens (e.g. art authored at 23.4 px is exactly x2 / x3 on DPR-2 / DPR-3 phones but x1.39 on that desktop); otherwise a game-side scale snap or a second drawn size (~1.6-1.8x the cost) |
| Gun in hand / anchors | exported per frame by construction | same | hand-authored per frame (the entry-20 defect class) unless the artist paints over pipeline renders |
| Main risks | CC0 provenance (quaternius.com's licence page now shows its own non-CC0 "Quaternius Asset License (QAL) v1.0", last updated 2026-08-28; only copies posted as CC0, e.g. on OpenGameArt, qualify); thin CC0 supply for bespoke forms | Synty One Time Purchase Licence (as at 9 July 2026): any engine, royalty-free, 5 seats per licence; source files must not be shared outside the team (so they stay out of this public repo); it bars use "in datasets utilised by Generative AI Programs" and "generation of 3D models utilising Generative AI Programs" — whether AI agents driving Blender over the files fall under either is ambiguous: ask Synty in writing before buying | vendor schedule; revisions; style drift from a vague brief; rights assignment must cover a public repo and derivative frames |
| What the operator does | judge 2-3 look packets | choose and buy the pack (agents cannot), put the files on the host git-ignored, settle the AI-clause question | choose / hire (or approve a posted brief), pay, review style frames (one idle + one run at true size first), approve |

A hybrid (iv) also exists: pipeline renders + a pixel artist's paint-over of
key frames per density. It keeps exported anchors and native densities and
costs less per frame than drawing from scratch, but scales with frames x
densities.

Precedent, not proof: Motion Twin described shipping Dead Cells with this
3D-to-pixel method (models animated in 3D, rendered small without
anti-aliasing, toon-shaded; Game Developer / Gamasutra, 2018), with a larger
on-screen character than RIG's 32 px.

Not a recommendation inflation: no route was shown to reach the bar; the
spike shows what route (i) produces after ~2 hours of tuning on one CC0 base
mesh, and what the render path costs any route.

## 7. Operator packet

No in-game URL: this spike wires nothing into the game (no `src/` change, as
dispatched). Phase B, if a route is chosen, would ship the new look behind an
A/B flag (proposed `?art=v3`) with today's art as the control, per entry 16.
The packet is four images, all under `reports/tasks/T-109/spike/`:

1. `packet-1-true-size.png` — desktop 1280x720 FAR at TRUE SIZE: a 480x270
   window of the real frame around RIG, today / A / B / D (idle), plus the
   concept boards' RIG box-downscaled to the same on-screen height (desktop
   and phone) for reference. Look at it 1:1, not zoomed.
2. `rig-desktop-4x.png` — the six poses x four columns, nearest 4x (the 1x
   version is `rig-desktop-1x.png`).
3. `rig-phone-4x.png` — the same at the phone density (device px x4); the true
   size versions are `rig-phone-1x.png` and `rig-phone-context.png`.
4. `wasp-desktop.png` — today's in-game wasp (cruising) beside the CC0 wasp on
   the same frame, true size and x4 (`wasp-phone.png` for the phone density).

Supporting, not in the packet: `rig-desktop-context.png` (the 2x2 alone),
`run-cycle-BD-desktop-4x.gif` (B and D run cycle on the real scene),
`measure-desktop.json`, `measure-phone.json`.

Questions (non-leading; any answer is useful):

1. In image 1, at true size, which of the four RIGs do you read fastest as
   "an armoured person holding a gun" against the hull — and what, if
   anything, gets in the way of the others?
2. The strip under image 1 shows the boards' RIG at the same size. Which
   candidate is closest to what you want RIG to be, and what is the biggest
   gap between it and the boards?
3. B and D differ only by a scripted tidy pass. In images 2-3, is there a
   difference between them that matters to you?
4. In image 4, does the CC0 wasp read as the same enemy as today's, and as
   belonging in the same game as the RIG you preferred?
5. Section 6 prices three routes (CC0 + pipeline; a paid model pack +
   pipeline; a commissioned pixel artist) and a hybrid. Which would you like
   to pursue, or what would you need to know first?


## 8. CC0 provenance

`tools/art/spike/cc0.json` (fetch with `/opt/hb-art/bin/python -I
tools/art/spike/fetch_cc0.py`; downloads go to git-ignored
`tools/art/build/cc0/`, are sha256-checked, and only the listed members are
extracted; nothing third-party is committed):

| id | title / author | page | licence | sha256 (archive) | used for |
|---|---|---|---|---|---|
| irondust-scifi-soldiers | "Sci-fi soldier" / Irondust | https://opengameart.org/content/sci-fi-soldier | CC0 | `4a91f4ae01117656c9a5a8fc71930f852b2c4d3e94f3f9a2c88109ad931e0db4` | RIG body, helmet (Head1), hand, metarig; its albedo only segments plates from undersuit |
| quaternius-ultimate-gun-pack | "Low Poly Guns Pack (Ultimate Gun Pack, July 2019)" / quaternius | https://opengameart.org/content/low-poly-guns-pack | CC0 (OGA copy) | `6bbae4cd42a520bd2ed95881394293e90804a63abdaf121e3b55fa08b7311737` | the R gun stand-in (Bullpup_2) |
| mikemoon-hornet-wasp | "3D Hornet/Wasp" / MikeMoon | https://opengameart.org/content/3d-hornetwasp | CC0 | `4a82eae58e79e59cfdd57936eea1579fe6937fe0e20319959bfd29132a3db35e` | the wasp candidate (Hornet6(Animating).blend) |

Licence as stated on each OpenGameArt page on 2026-10-23. quaternius.com's own
licence page now reads "Quaternius Asset License (QAL) v1.0, last updated
8/28/2026" (no redistribution of the assets as assets) while its FAQ still
says CC0; this spike uses only the OpenGameArt copy posted as CC0 in 2019.
Nothing CC0 was committed or shipped; `assets/manifest.json` is untouched
because no asset was added to the game.

## 9. Rebuild, files, gates

    /opt/hb-art/bin/python -I tools/art/spike/fetch_cc0.py
    node tools/art/spike/scene_capture.mjs --view desktop     # then --view phone (≈10-20 min each here)
    node tools/art/spike/scene_capture.mjs --view desktop --poses firepause,wasp   # (and phone)
    /opt/hb-art/bin/python -I tools/art/spike/crisp.py     --ppt 16.2419 --out tools/art/build/spike/a-desktop
    /opt/hb-art/bin/python -I tools/art/spike/crisp.py     --ppt 23.370  --out tools/art/build/spike/a-phone
    /opt/hb-art/bin/python -I tools/art/spike/v3_render.py --ppt 16.2419 --out tools/art/build/spike/b-desktop
    /opt/hb-art/bin/python -I tools/art/spike/v3_render.py --ppt 23.370  --out tools/art/build/spike/b-phone
    /opt/hb-art/bin/python -I tools/art/spike/v3_post.py --src tools/art/build/spike/b-desktop --out tools/art/build/spike/post-desktop
    /opt/hb-art/bin/python -I tools/art/spike/v3_post.py --src tools/art/build/spike/b-phone   --out tools/art/build/spike/post-phone
    /opt/hb-art/bin/python -I tools/art/spike/wasp_v3.py --ppt 16.2419 --out tools/art/build/spike/wasp-desktop
    /opt/hb-art/bin/python -I tools/art/spike/wasp_v3.py --ppt 23.370  --out tools/art/build/spike/wasp-phone
    /opt/hb-art/bin/python -I tools/art/spike/compose.py --view desktop   # and --view phone
    /opt/hb-art/bin/python -I tools/art/spike/measure.py --view desktop   # and --view phone
    /opt/hb-art/bin/python -I tools/art/spike/packet.py

Reproducibility (this host only): two clean B/D builds at desktop density gave
byte-identical final PNGs, 14/14; the Cycles passes were pixel-identical (the
pass PNG files differ only in Blender's embedded render metadata).

Files (all new unless noted): `tools/art/spike/{cc0.json, fetch_cc0.py,
scene_capture.mjs, crisp.py, v3_render.py, v3_post.py, wasp_v3.py, compose.py,
measure.py, packet.py}`; `tools/art/README.md` (modified: the spike section
and its limitations); `reports/tasks/T-109/spike.md` and
`reports/tasks/T-109/spike/` (sheets, packet, measurements). The WIP snapshot
(5a5c99b) had also added a `--spike` mode to the phase-A
`tools/art/capture/current-art.mjs` (mid-camera and DPR-3 variants of two
crops); `scene_capture.mjs` supersedes it, so that file is restored to its
phase-A state (7d0da5c). Nothing under `src/`, `assets/`, SPRINT or the
decision log changed.

Gates: this lane touches no runtime file and adds no game asset, so the
game-facing gates are unaffected by construction; `node tools/pathcheck.mjs`
was run on this worktree (result in section 11). No server is left running:
each capture started its own on an OS-assigned port and closed it.

## 10. PROPOSED INBOX ISSUES

## I-??? | render | S2 | repro: `resolveRenderPixelRatio(3, 844, 390)` in src/pure/render-budget.js; capture records in tools/art/build/spike/scene/*/scene.json | evidence: reports/tasks/T-109/spike.md section 3
Sprites are resampled twice before they reach the screen, so no art change
can arrive crisp on today's path. Desktop draws a 1.25x canvas that the
browser downsamples by 0.8 (1280x720 css -> 1600x900 canvas, measured);
compact viewports are capped at 2.2x, so on a DPR-3 iPhone (the operator's
device class, entry 20) Safari upscales the canvas by 1.36x. On top of that
RIG is a lit, mipmapped, tone-mapped texture. Measured on today's own art:
the same painting drawn crisp at the same brightness raises silhouette-edge
visibility from 0.43 to 0.60 and gun edge contrast from 30 to 51 (desktop
idle). Direction (phase B, any art route): a sprite path at 1 texel = 1
device px — unlit, nearest, mip-free, snapped to the device grid, density
chosen per device — verified with a capture on a DPR-3 device.

## 11. Gates and notes for the integrator

- `node tools/pathcheck.mjs` on this worktree (host env loaded): **3985
  passed, 4 failed** — the four real-browser perf-probe items ("the permanent
  real-browser performance probe boots the shipped scene", "every built
  transparent DoubleSide material is single-pass or carries a named
  exception", "a paused scene uploads zero unchanged instance-matrix bytes",
  "the composed path does not allocate redundant default-framebuffer MSAA");
  the probe's `result.json` never appeared (it timed out booting at host load
  40-90). Phase A recorded the same four failing on a clean export of the
  base `b114869` on this host (`build.md` section 13). This lane changes no
  runtime file. A green gate is not evidence of looks (entry 21) — the
  evidence is the captures.
- **Self-review against the art-lane rule** ("load the asset in the game"):
  nothing was loaded into the game — the dispatch forbids `src/` changes in
  the spike. The true-size judgement is made on the game's own frames with
  the candidates composited 1 texel = 1 device px, which is what a phase-B
  sprite path would draw (section 3 states what today's path does instead).
- **The branch still carries phase A's rejected v2 atlases**
  (`assets/generated/sprites/art-v2/`, 8 files, and their 4
  `assets/manifest.json` entries). Entry 26 rejected that look and nothing
  loads them. I left them (phase-A deliverables, outside this dispatch);
  under entry 24 the integrator may want to drop them before merging, or
  merge only `tools/` and `reports/`.
- The branch is based on `b114869`; main has since merged T-101/T-102/T-108
  and decisions 23-26. This lane touched none of those files.
- No server is left running: each capture started its own on an
  OS-assigned port and closed it at exit.

