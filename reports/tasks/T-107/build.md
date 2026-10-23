# T-107 build report — the phone camera (+ T-204 per-side rise, T-102 R2/R3/I-104)

Worktree `/home/user/hullbreaker/.claude/worktrees/T-107`, branch `task/T-107`,
base `ace6618` (main at dispatch). Resumed from the previous agent's uncommitted
snapshot `f245087`; everything below was re-measured in this session — nothing
in this report is inherited from that snapshot or from another lane without a
re-run. Ports: 8776 (this tree), 8777 (an untouched `git archive ace6618`
export, the "before"), 8778/8779 (the same two trees, owned by the capture
batches); all were stopped at the end.

Host: GPU-less SwiftShader, 4 cores shared with ~7 agents, load average
40-75 through the session. Every browser number below is from that host and
is evidence about the code's geometry and relative cost, never about an
iPhone.

## What a player gets

- **On a phone (touch, landscape)** the camera is the FAR shot through a
  longer lens: RIG's body is **5.58%** of the screen height (21.8 px at
  844x390, measured live; FAR on the same phone today: 3.83%, 14.9 px), and the
  frame shows **67.9 x 31.3 tiles** of route instead of 99.2 x 45.6. The frame is lifted
  0.85 tiles so the lowest landing deck stays above the right-thumb cluster
  (with the iPhone's home-indicator inset) while RIG's head stays inside the
  top on every route surface he can reach. Desktop is untouched: the camera's
  matrices are bit-identical to main at 1280x720, 1920x1080 and 1280x800.
- **Portrait phones** keep FAR's portrait frame exactly (RIG's body is already
  7.0% of the short side there); the lens only ever narrows.
- **Everywhere**, RIG pinned at the right clamp now stays fully on screen
  (on main he was half off at 1280x720 and **entirely off-screen** at 844x390
  and 932x430 — measured in painted pixels, below), and the flat clear-colour
  voids at the screen edge near every corner are filled by the far anatomy
  veil reaching past both corners.
- Behind flags, for the operator to try: `?orbit=joint` (no post-turn zoom
  pump) and `?rise=steep` (the climb made literal: ~101 m instead of 35 m).

## What changed and why

Runtime (6 files):

| file | change |
| --- | --- |
| `src/pure/framing.js` (new) | the pure resolver: device class (`isPhoneViewport`: touch AND short side <= 540 CSS px), `resolveFramingId(?view=, w, h, touch)`, the phone lens (`phoneLensFovDeg`, `framingLens` — only ever narrows; non-phone ids return the shipped fov and zero lift exactly), the actor-plane right clamp (`actorPlaneRightX`, `rightClampInsetTiles`), a three.js-free camera (`lookBasis`, `rayPlanePoint`, `projectNdc`, `framedEdges`) that the labs and pathcheck share, and `jointOrbitAnchor` (R3). |
| `src/render/camera.js` | resolves the lens on every calibration (boot/resize), applies fov (only when it differs) and the lift (camera and look target together, pitch unchanged); EDGE_R = the actor plane's narrowest row minus RIG's widest half-silhouette (I-104); `?orbit=joint` anchor; `cameraFramingSnapshot()` read surface for tools. |
| `src/render/atmosphere.js` | the far veil extends 120 tiles past both of its old edges, painting mirrored, flat at full bow depth, same 20 segments (R2). `?veil=legacy` restores it. |
| `src/pure/ascent.js` | a second profile, `steep` (`?rise=steep`): one grade per face 0.16 -> 0.21, smoothstep blends across each fold, levels onto the summit. The default `helix` is the shipped one bit for bit. |
| `src/mode.js` | `VIEW_REQUEST` (raw `?view=`), `TURN_ORBIT` (`?orbit=joint`), `VEIL_EXTENDED` (`?veil=legacy` escape hatch), `RISE_ID` (selects the ascent profile once at import). |
| `src/config.js` | `CONFIG.framing`: phone bound 540 px, `rigShortSideFrac` 0.056, `liftTiles` 0.85, `actorDepth` 1.15, `actorHalfExtent` 1.295 (pure/rig.js's documented overrun ceiling). |

What I kept from the snapshot, and what I changed after measuring:

- **Kept: the lens model** (narrow the fov at the FAR pose) over a depth
  pull-in. The camera never stands closer to the anatomy than FAR does (no
  clipping risk through the orbit), the backdrop keeps its scale against RIG,
  fog and every distance-keyed system stay as authored.
- **Changed: RIG share 5.8% -> 5.6%, lift 0 -> 0.85.** The snapshot's 5.8% /
  0 put RIG's painted head off the top of the frame on face 6's highest
  surfaces once the helix's tilt across the frame is counted (`-6.3 px` at
  844x390; falsifier row M4a). Solved instead for the largest share at which
  BOTH hold at 844x390, 932x430, 667x375 and a Safari-chrome 844x350: RIG's
  painted head inside the top on every reachable surface, and the lowest deck
  above the right-thumb cluster with the 21 px home-indicator inset. 6.0% is
  infeasible (no lift satisfies both); 5.6% with lift 0.85 holds with >= 1.9 px
  and >= 2.5 px to spare (`evidence/pathcheck-t107-static-labels.txt`).
- **Changed: the lens only narrows.** The snapshot widened portrait to 65.6
  deg (RIG 5.8% of the short side), which pushed the frame's bottom 11.6 tiles
  past the far veil (a new portrait void) and shrank RIG below FAR's own
  portrait size. Portrait now keeps FAR's portrait frame exactly.
- **Changed: the clamp row.** The snapshot calibrated EDGE_R on the actor
  plane at the frame's centre row; the slight downward pitch narrows the
  frame's right edge toward the top by up to 0.75 tiles at 16:9, so RIG high on
  the lattice still overhung (falsifier row M5a: NDC 1.011 at 1024x768).
  EDGE_R now uses the narrowest row.
- **Changed: the veil extension 45 -> 120 tiles.** 45 left 0.4 tiles of margin
  on a FAR phone and did not cover 21:9 (needs 55) or 32:9 (111) monitors.
- **Added:** everything that proves it — the snapshot had no assertions, no
  replica updates, no measurements.

Tooling (zero effect on the game):

- `tools/simlab/lib/sixface-host.mjs` and `tools/simlab/race/edges.mjs` now take
  the lens, the lift and the clamp from `src/pure/framing.js` (they had their
  own route-plane math, which the WIP's camera change would have left silently
  stale: the race lab's `assertCameraSourceMatches()` threw on the snapshot).
  New turn-lab presets `phoneLandscapeTouch`, `phoneMaxTouch`,
  `phoneSmallTouch`, `phonePortraitTouch`; race-lab rows
  `phone-landscape-far` / `phone-portrait-far` (the escape hatch).
- `tools/simlab/race/probe-framing.mjs` re-pointed at the T-101 deck's
  published layout (`__HB_TOUCH().layout`: cluster box, stick ring, split)
  instead of the retired hidden `#touchDeck`.
- New: `tools/pathcheck/t-107-phone-framing.mjs` (domain d79 here; **d81 after
  the merge** — T-103 took d79/d80 on main), `tools/playtest/phone-framing-probe.mjs`,
  `tools/playtest/phone-readability-capture.mjs`, `tools/playtest/framing-cost.mjs`,
  `tools/simlab/framing/{render-only,veil-need,zoom-pump,route-ahead,vertical-band}.mjs`,
  `tools/simlab/framing/{void_columns,readability_sheet}.py`. Documented in
  `tools/simlab/README.md` ("The phone frame (T-107)") and
  `tools/simlab/TURNLAB.md` (limitations 4-5).

## Acceptance, box by box (measured; before = main `ace6618`, after = this branch)

### 1. A pure, asserted framing resolver; desktop byte-identical projection

`src/pure/framing.js` `resolveFramingId(?view=, w, h, touch)`: a touch screen
whose short side is <= 540 CSS px is a phone; everything else is FAR.
Asserted (`tools/pathcheck/t-107-phone-framing.mjs`): every mouse-driven window
(1280x720 ... 2560x1440, and 844x390 / 390x844 with a mouse) is FAR; every
touch phone in both orientations is the phone frame; touch tablets (768-1366
short side) stay FAR; `?view=far` forces FAR on a phone, `?view=phone` forces
the phone frame on desktop, `near`/`mid` keep their meaning, garbage is AUTO;
degenerate sizes are never a phone; every non-phone frame returns the shipped
fov with zero lift **exactly** (`Object.is`).

**Byte-identical projection, proven on the live camera** —
`tools/playtest/phone-framing-probe.mjs` boots main and this branch at
1280x720, 1920x1080 and 1280x800 (`?juice=0` so camera shake is out of the
comparison), poses 17 fixed states through the real module entry points (flat
faces, a turning corner at seven ritual clocks, completed corners, late
faces) and compares position, quaternion, `matrixWorld`, `projectionMatrix`,
fov/aspect/near/far/zoom element by element:

```
1280x720 ?juice=0: 17 poses, 0 differing camera numbers (max |delta| 0)
1920x1080 ?juice=0: 17 poses, 0 differing camera numbers (max |delta| 0)
1280x800 ?juice=0: 17 poses, 0 differing camera numbers (max |delta| 0)
CAMERA IDENTICAL (every element Object.is-equal)
```

(`evidence/desktop-camera-identity.log`, `evidence/identity-*-j0.json`.) A
first run without `?juice=0` differed after completed corners only, by up to
0.29 tiles of camera translation: the corner-completion juice adds shake
trauma, which a paused page never decays, and the shake's phase depends on
each page's `gameMs` at pause. Both trees run the same shake code; the
projection matrices were identical there too. EDGE_L is identical; EDGE_R
moves by design (box 8, I-104).

### 2. RIG's height share at 844x390 / 932x430 / 667x375; portrait

Measured live (`phone-framing-probe.mjs --rig`, RIG standing at the frame's
centre column, touch emulation, `evidence/` probe JSON):

| viewport (touch) | main: body px / % of height | branch: body px / % | branch: painted silhouette px / % (pose frame) | fov | visible route W x H, tiles |
| --- | --- | --- | --- | --- | --- |
| 844x390 | 14.95 / 3.83% | **21.76 / 5.58%** | 23.64 / 6.06% (`contact`) | 40.09 | 67.9 x 31.3 (main: 99.2 x 45.6) |
| 932x430 | 16.48 / 3.83% | **23.99 / 5.58%** | 28.18 / 6.55% (`aim-right`) | 40.09 | 68.0 x 31.3 |
| 667x375 | 14.38 / 3.83% | **20.92 / 5.58%** | 24.58 / 6.55% (`aim-right`) | 40.09 | 55.8 x 31.3 |
| 390x844 (portrait) | 27.38 / 3.24% (7.0% of the short side) | 27.38 / 3.24% — **unchanged, FAR's portrait frame** | 45.47 / 5.39% (`contact`, the 1.5x portrait gain render/player.js still applies) | 56 | 19.0 x 53.9 |

Which "RIG": the **body** — RIG's 1.7-tile collision height, drawn at his
render depth (1.15 tiles toward the camera) — is the measure every RIG % in
this project has used (entry 7's 3.7%, `CONFIG.viewScales`' 7.0/5.0/3.7, T-104's
3.74%), so it is the one the operator's "~6%" was set against. RIG's painted
silhouette is `RIG_BODY_VISUAL_H` = 2.0 tiles (a render-only overrun), so in
paint he is 6.1-6.6% depending on the pose frame. The body share varies about
+-4% across the frame (5.34-5.79% at 844x390) because the camera yaws ~3 deg
toward its look target; the table and the assertion use the centre column.

Why 5.6% and not 6.0% — the vertical band (box 3) does not fit at 6.0%: see the
table there.

**Portrait (justified):** portrait keeps FAR's portrait frame exactly
(asserted: fov 56, lift 0). Its compact portrait framing already draws RIG's
body at **7.0% of the short side** (27.4 px at 390 wide) — larger than the
landscape phone frame — so there is nothing to tighten; widening it to match
landscape (the snapshot's rule, "5.8% of the short side") would shrink RIG and
push the frame's bottom 11.6 tiles past the far anatomy veil. "6% of the short
side" is the right yardstick for a phone (rotating the phone does not change
the glass), and portrait already exceeds it. Consequence for the portrait actor
gain: see "Portrait actor gain" below.

### 3. Look-ahead; the vertical band; the thumbs

**Vertical band — why 0.85 tiles of lift, not ~6.** T-104 modelled a ~6-tile
lift before the T-101 deck existed. With the deck: the lowest landing deck in
the shipped lattice is y 2 and the highest route surface y 17 (asserted from the
level data, so a lattice change re-derives this), RIG's painted head there is at
19.0, and the helix tilts the band ~4 tiles across a phone frame. A 6-tile lift
puts the lowest deck **45 px under the right-thumb cluster** at 844x390
(asserted as the falsifier). Solved over every scroll position on faces 1-6
and every route surface RIG can reach (damage-plane margin to right clamp),
`tools/simlab/framing/vertical-band.mjs`:

| frame | lift | RIG's painted head vs top (worst) | lowest deck vs cluster top, iPhone insets (worst) |
| --- | --- | --- | --- |
| body 6.0% | any | infeasible: lift >= ~1.1 to keep the head in, <= ~0.4 to keep the deck clear | |
| body 5.75% | 1.0 | 1.4 px inside (844x390) | 0.7 px clear |
| **body 5.6%** | **0.85** | **4.3 / 4.8 / 7.3 / 1.9 px inside** (844x390 / 932x430 / 667x375 / 844x350) | **3.8 / 6.3 / 22.7 / 2.5 px clear** |
| body 5.6% | 0 (falsifier M4a) | 6.3 / 7.0 / 3.0 / 7.6 px **off the top** | |
| body 5.6% | 2 (falsifier M4b) | | 10.7 / 9.7 / - / 10.5 px **under** |

(844x350 = the same iPhone in landscape Safari with its toolbar showing.)
Without insets (desktop Chrome emulation) the deck clears the cluster by
22.7-29.3 px. Asserted per viewport in the T-107 domain.

**The stick ring (reported, not met):** RIG on the lowest deck at the far left
of the frame (the resting stick ring's x range, i.e. pressed against the damage
plane) has his feet **15-22 px into the top of the resting stick ring**
(no insets), **38-39 px** with the iPhone's 21 px inset. The ring's centre —
where the left thumb rests — is still ~20 px below his feet. No lift fixes both
this and the head (they pull in opposite directions); a smaller RIG would. Open
question for the operator, and an inbox issue.

**Look-ahead (T-201 owns it; measured here, not met as worded).** Race-lab
replica, 4 policies x 4 seeds + the oracle racer x 2, 300 s each,
`tools/simlab/framing/route-ahead.mjs` (`evidence/route-ahead-*.json`); median
look-ahead to the visible route edge, tiles:

| | rush | climber | fighter | carried | oracle@0 racer |
| --- | --- | --- | --- | --- | --- |
| main, desktop 16:10 | 49 | 44 | 53 | 58 | 15 |
| branch, desktop 16:10 | 49.3 | 43.3 | 51.3 | 60.3 | 15.3 |
| main, phone 844x390 (FAR) | 58 | 59 | 72 | 84 | 30 |
| branch, phone 844x390 (phone frame) | **42** | **42** | **48** | **58** | **12** |
| branch, phone `?view=far` | 59 | 60 | 64 | 78 | 30 |

Route ahead capped at the joint, medians: main phone 17/18/38/38/13 -> branch
phone 15/15/30/32/0. So the closer phone frame **does** show less route ahead
than FAR on the same phone (16-26 tiles at the median), and about what desktop
FAR shows (0-7 tiles less). That is the closer frame itself, not a separate
reduction: the operator chose a 1.5x closer frame on phones, and shifting the
frame forward to compensate would move the damage plane (a difficulty lever).
Under T-201's follow-lead (`lead = clamp(0.3 x (EDGE_R - EDGE_L), 6, 24)`) a
racer sees `lead + 1.99` = **21.8 tiles** ahead on the phone frame (2.3 s at
run speed) vs 24 on today's FAR phone. Escalated to the operator (packet Q1).

### Edge API for T-201 (unchanged shape: `setEdges(left, right)`)

Live calibration, `HB.edges()` minus `scrollX` (probe), and what T-201's
`followLeadTiles(EDGE_R - EDGE_L)` therefore gets:

| viewport | main L / R / W | branch L / R / W | visible route edge (branch) | T-201 lead main -> branch |
| --- | --- | --- | --- | --- |
| 1280x720, 1920x1080 | -31.114 / 50.233 / 81.35 | -31.114 / **47.720** / 78.83 | 50.233 | 24 -> 23.65 |
| 1280x800 | -27.438 / 45.735 / 73.17 | -27.438 / **43.425** / 70.86 | 45.735 | 21.95 -> 21.26 |
| 844x390 touch | -38.975 / 60.184 / 99.16 | **-25.042 / 40.864 / 65.91** | 42.853 | 24 -> 19.77 |
| 932x430 touch | -39.043 / 60.271 / 99.31 | **-25.090 / 40.919 / 66.01** | 42.910 | 24 -> 19.80 |
| 667x375 touch | -31.132 / 50.256 / 81.39 | **-19.467 / 34.569 / 54.04** | 36.300 | 24 -> 16.21 |
| 390x844 touch | -2.015 / 16.985 / 19.00 | -2.015 / **15.881** / 17.90 | 16.985 | 6 -> 6 (clamped) |

What changes on phones: EDGE_L comes in by 14 tiles (the damage plane is still
the screen's left edge — the frame is narrower), EDGE_R by 19, W by a third.
EDGE_R everywhere is now the **actor-plane clamp**, 1.5-2.5 tiles inside the
visible route edge, so `EDGE_R - EDGE_L` is the clamp-to-plane width the sim
actually lets RIG use; the visible route width is 2-2.5 tiles more. RIG kept
`lead` tiles from EDGE_R therefore sees `lead + (routeRight - EDGE_R)` of route.
The race lab's `lookahead`/`routeAhead` histograms measure to EDGE_R, so they
read ~2 tiles low against pre-T-107 numbers (`route-ahead.mjs` adds it back).

### 8. RIG at the right clamp (I-104) — whole sprite on screen, every viewport

EDGE_R = the frame's right edge on the actor plane at its narrowest row, minus
RIG's widest drawn half-silhouette (1.295 tiles = `RIG_SPRITE_MAX_OVERRUN` x
half-width; covers the weapon's 0.825-tile reach).

- Asserted analytically at 17 viewports (desktop 16:10 ... 32:9, touch phones
  both orientations, mouse phones, 260x1000, tablets), RIG at deck height, mid
  and on the highest surfaces: rightmost silhouette point at NDC **<= 0.998**;
  the pre-T-107 route-plane clamp puts his **centre** at NDC 1.028.
- Played (turn proof at the phone frame, 7 runs incl. `?momentum=0`, which
  rides the clamp): RIG's chest at the clamp at NDC **0.952** (was ~1.012).
- Live, in painted pixels (RIG-only draw at the clamp, facing right):

| viewport | main: gap from RIG's outermost pixel to the right edge | branch |
| --- | --- | --- |
| 844x390 touch | **no RIG pixel on screen at all** | 7.28 px (deck), 4.55 px (high) |
| 932x430 touch | **no RIG pixel on screen at all** | 8.18 px, 4.55 px |
| 667x375 touch | 0 px (cut by the edge) | 7.28 px, 4.55 px |
| 1280x720 | 0 px on the deck (cut); **no pixel on screen** high (y 15) | 12.8 px, 8.0 px |
| 1280x800 | 0 px on the deck (cut); **no pixel on screen** high | 13.6 px, 8.8 px |

  On main a phone loses RIG entirely when he is pinned at the right clamp (his
  draw depth narrows the frame by ~1.5-2 tiles at that aspect), and even on
  desktop he vanishes when pinned there high on the lattice (the frame's right
  edge narrows toward the top). Pairs `(deck, high)`: RIG at deck height and at
  y 15, facing right, `phone-framing-probe.mjs --clamp` (`evidence/probe-*.json`).
- Reported, not changed: at the damage plane (EDGE_L) RIG's back still touches
  the left edge (0 px gap, main and branch) — EDGE_L is the damage plane, and
  moving it is a difficulty lever.

### 6. The post-turn zoom pump (R3) — `?orbit=joint`, OFF by default

`tools/simlab/framing/zoom-pump.mjs` (played turn proof, RIG's projected body
height at each corner's ritual end / +1.5 s / settled; `evidence/zoom-pump.json`):

| | shipped (halt-point orbit) | `?orbit=joint` |
| --- | --- | --- |
| 1280x720 | **39.0 / 32.2 / 26.6 px** (T-102 measured 39.0 / 32.3 / 27.4) | **27.0 / 27.2 / 26.6 px** |
| 844x390 touch (phone frame) | 30.8 / 25.3 / 21.0 px | 21.3 / 21.4 / 21.0 px |
| 844x390 mouse (FAR) | 21.1 / 17.5 / 14.4 px (T-102: 21.1 / 17.5 / 14.8) | 14.6 / 14.7 / 14.4 px |

The same at all six corners (`zoom-pump.json`). Asserted: the joint orbit is
the shipped anchor exactly before the ritual and after the catch-up (2.8e-14
tiles), stands at the settled depth from the arriving face right after the
swing (error 2.8e-14) where the shipped orbit stands at 0.693 of it, and moves
the camera no more per frame than the shipped orbit does (8.18 vs 7.98 tiles per
60 Hz frame at the ratchet's snap). Render-only (the sim fingerprints, box T-204).

### T-204 — the per-side rise, `?rise=steep`, OFF by default

`src/pure/ascent.js` `steep`: one grade per face, rising with the pressure,
blended across each fold, levelling onto the summit. Targets in GRADE, so they
hold on today's 88-tile sides and on 176 later (the reviewer's amendment):

| | F1 | F2 | F3 | F4 | F5 | F6 | summit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grade (asserted 0.16-0.21, 9.1-11.9 deg) | 0.16 | 0.17 | 0.18 | 0.19 | 0.20 | 0.21 | 0 |
| rise per side, 88 tiles (asserted 14-18.5 m) | 14.0 | 15.0 | 15.8 | 16.7 | 17.6 | 18.5 | **101 m** (helix: 35 m) |

Asserted: altitude continuous and climbing, grade continuous (no kink at a
fold; falsifier M10 makes one), altitude = the integral of grade to 1e-7; the
default (`?rise=` absent / `0` / anything else) is the shipped helix **bit for
bit** at 4,700 samples (falsifier M8: a 0.0001 change goes red); no `src/sim`
module imports the ascent (falsifier M11).

**Render-only, proven by play** (`tools/simlab/framing/render-only.mjs`,
`evidence/render-only.{log,json}`): the race lab's replica, rush / climber /
carried x 2 seeds + the oracle racer, desktop 16:10 and the phone frame, 480 s
each: **42 of 42** flagged runs (`rise=steep`, `orbit=joint`, `veil=legacy`)
reproduce their control's simulation fingerprint (the whole run minus the
rendered ALT readout and the query label), and the falsifier `momentum=0`
moves **14 of 14**. The lab's own fingerprint cannot be the proof as worded:
it hashes `faces[].altMax` (the HUD ALT, which `?rise=` changes on purpose)
and the query label (which every flag changes) — so it differs for every
flag, render-only or not.

**The currency** (same runs; ALT gained per face, faces 1-6, oracle racer):

| | ALT gain per face, m (min / median / max) | m/s (min / median / max) |
| --- | --- | --- |
| helix, desktop | 5.4 / 5.4 / 6.0 | 0.25 / 0.27 / 0.31 |
| **steep, desktop** | **15.0 / 16.7 / 18.5** | **0.68 / 0.78 / 1.00** |
| helix, phone | 5.4 / 5.4 / 6.0 | 0.25 / 0.26 / 0.31 |
| **steep, phone** | **15.0 / 16.7 / 18.5** | **0.76 / 0.84 / 0.90** |

(T-104's Table M4 for the helix: 5.4 m and 0.25-0.30 m/s — reproduced.) The
proposal's ">= 1.0 m/s" is not met on today's sides: a face still takes ~20 s
with the held gate; T-201's rolling corners shorten that, which raises m/s
without touching the grade.

**On a phone the steep band does not fit** (`vertical-band.mjs`, reported, not
asserted): RIG's painted head on face 6's highest reachable surfaces goes **55
px (844x390) / 61 px (932x430) above the top of the frame**; on desktop it stays
inside (9-25 px to spare). The steep grade tilts the band ~13 tiles across a
66-tile phone frame, more than the free height above the thumbs, so no lift
fixes it. That is a design question for the operator (packet Q4), not a
tuning knob.

**Pitched tiles, analytically** (`src/render/level.js` places each deck column
as a unit box rotated by the local pitch): adjacent columns open a seam of
(1 - cos theta) ~ grade^2/2 tiles — 0.002 on the helix, **0.022 at 0.21** = 0.29 px
at the phone frame, 0.34 px at 1280x720: sub-pixel. RIG's feet sit grade^2/4
tiles under the drawn deck top (0.15 px at 0.21) and his toe/heel meet the
slope at +-grade x 0.35 tiles (+-1 px on the phone). On a constant grade the
rotated tiles' row edges line up across columns (each column is raised by
exactly tan theta per tile), so rows do not stair-step; rows overlap by only
(1 - cos theta) ~ 0.022 tiles. What does step is each column's vertical seam:
the rows stack vertically while every tile leans by theta, so the seam jogs
sideways by sin theta per row — **0.06 tiles (~1.0 px at 1280x720) on the
helix today, 0.21 tiles (~3.3 px at 1280x720, ~2.6 px on the phone) at grade
0.21**. That jog is the measurable form of "stepped tile columns"; whether it
reads is the captures' call (below) and the operator's.

PENDING-T204-CAPTURES

### Defaults, flags and hard rules

| behaviour | default | escape hatch / opt-in |
| --- | --- | --- |
| phone frame on a touch phone (operator-approved, entry 20 addendum) | **ON** | `?view=far` (today's FAR on the phone) |
| phone frame anywhere, for review | off | `?view=phone` |
| right clamp on the actor plane (I-104, a defect fix) | **ON** | none (the race lab can reproduce main with `--root <export>`) |
| far veil past the corners (R2, a defect fix) | **ON** | `?veil=legacy` |
| joint orbit, no zoom pump (R3, unjudged) | off | `?orbit=joint` |
| per-side rise (T-204, unjudged; entry 25 addendum keeps it off) | off | `?rise=steep` |

- **Desktop FAR unchanged (entries 7/17):** the camera is bit-identical (box 1).
  Desktop does change in two places, both defect fixes: the right clamp sits
  2.5 / 2.3 tiles further in (the sim's EDGE_R: spawn trigger, gate held
  view, patrol box, approach dolly, and RIG's clamp all move with it) and the
  frame's edges near corners now show the far anatomy instead of clear colour.
- **Static anatomy (entry 3):** nothing in the world moves. The lens and lift
  are set once per calibration; `?orbit=joint` moves only the camera; the veil
  is a static mesh built once (wider). The posed turn captures show the
  arriving face drawn whole at the hand-off (box 4).
- **Half-dose value ladder (entry 14):** untouched (no colour, material or
  light change). The veil is the same painting, mirrored past its old edges.
- **60 fps condition (entry 18):** box 10.
- **Layer purity / determinism:** `src/pure/framing.js` has no three.js, DOM
  or randomness (pathcheck layer guard + T-003/T-049/T-051 per-file guards);
  the sim is untouched (`git diff --stat ace6618 -- src/sim` is empty).

## Falsification — every new assertion shown to bind

`tools/pathcheck/t-107-phone-framing.mjs`'s static checks were run against a
scratch export of this branch with ONE mutation at a time, then restored
(`evidence/falsification-static.log`; baseline green, green again after the
last restore; the worktree was never mutated):

| # | mutation | went red |
| --- | --- | --- |
| M1 | the phone test uses the LONG side | resolver (phones), hatches, RIG share x3, portrait x3 |
| M2 | FAR's fov off by 1e-9 | desktop identity, portrait identity x3 |
| M3 | RIG share 7% | RIG share x3, head off the top x4 (38-42 px), deck under the cluster x3, clamp (NDC 1.001) |
| M4a | lift 0 | head off the top at all four phones (3.0-7.6 px) |
| M4b | lift 2 | deck under the cluster with iPhone insets x3 (9.7-10.7 px) |
| M5a | clamp on the centre row only (the snapshot's version) | clamp (NDC 1.011 at 1024x768) |
| M5b | clamp without the silhouette inset | clamp (NDC 1.017) |
| M6 | race-lab replica back on the route plane | replica parity |
| M7 | camera.js drops the lift from the pose | the lens/lift source check |
| M8 | helix total rise 35 -> 35.0001 | helix bit-for-bit |
| M9 | steep face 6 grade 0.23 | grade band, rise band, smoothness |
| M10 | steep fold blend ~0 (a kink) | smoothness (grade jump 5e-3, integral error 2.4e-3) |
| M11 | a sim module imports the ascent | render-only static guard |
| M12 | joint orbit pivot stuck at the chamfer start | joint = shipped after the catch-up; settled depth |
| M13 | veil extension 30 tiles | veil coverage (-80.7 tiles) |

The played checks carry their own falsifiers: the render-only proof's
`momentum=0` runs must differ (14/14 did), and the clamp's analytic check
computes the pre-T-107 route-plane clamp beside it (NDC 1.028 > 1).

## Verification (every command run, with its result)

| command | result |
| --- | --- |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` on an untouched `git archive ace6618` (main at dispatch) | **4097 passed, 0 failed** |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` (this branch) | **4151 passed, 0 failed** = 4097 + 48 (T-107 static) + 6 (three existing per-file layer guards — T-003 legibility, T-049 texture names, T-051 backdrop names — now also run over the new `src/pure/framing.js`, and pass) |
| `node tools/pathcheck.mjs` (full tier, this branch, `HB_GATE_SKIP_BROWSER_PROBE=1` per the host policy) | **4511 passed, 0 failed** (15 min 24 s) = 4151 + 295 (T-102's played runs the fast tier skips) + 65 (T-107's played checks); 4 browser-probe assertions skipped, not counted |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` on a scratch merge of this branch onto current main `9bedbaa` (T-103 merged; the manifest conflict resolved with T-107 as **d81**) | **4176 passed, 0 failed** |
| `git merge-tree --write-tree --name-only main HEAD` | one conflict: `tools/pathcheck/manifest.mjs` (both append a domain after d78: T-103's d79/d80 on main, T-107's d79 here). Resolution: keep both, T-107 becomes d81. No other file is changed on both sides. |
| T-107 played checks alone (7 turn runs at the phone frame + render-only) | **65 passed, 0 failed** (`evidence/pathcheck-t107-played-labels.txt`) |
| `node tools/playtest/phone-framing-probe.mjs --compare` main vs branch, 1280x720 / 1920x1080 / 1280x800, `?juice=0` | **CAMERA IDENTICAL** (17 poses x 3, every element) |
| `node tools/simlab/framing/render-only.mjs --seeds 2 --viewports desktop-16x10,phone-landscape --max-game-ms 480000` | 42/42 flagged runs sim-identical, 14/14 falsifier runs differ (16.5 min) |
| `node tools/simlab/framing/zoom-pump.mjs --viewports desktop,phoneLandscapeTouch,phoneLandscape` | table in box 6 |
| `node tools/simlab/framing/route-ahead.mjs` (branch) and `--root <ace6618 export>` (main) | table in box 3 |
| `node tools/simlab/framing/veil-need.mjs`, `vertical-band.mjs` | tables in boxes 3, 7, T-204 |
| `node tools/simlab/turnlab.mjs run --policy run --viewport phoneLandscapeTouch` | VICTORY, 6/6 corners, no violations (7.5 s) |
| `node tools/simlab/race/lab.mjs one '{"policy":"rush","seed":1,"viewport":"desktop-16x10","maxGameMs":30000}'` | runs (the race lab's `assertCameraSourceMatches()` passes on this camera.js; it threw on the snapshot) |

PENDING-VERIFY

## Legacy assertions changed (decisions.md entry 21)

No `tools/pathcheck` assertion was changed, relabelled or deleted. Two
tool-side drift guards were re-pointed because they pinned source text the
fix had to change; the property each guards is kept and now holds through the
shared module:

| file | guard | change | reason |
| --- | --- | --- | --- |
| `tools/simlab/race/edges.mjs` | `assertCameraSourceMatches()` needles `setEdges(probeXAtNdc(-rightNdc), probeXAtNdc(rightNdc))` and `_probe.lookAt(C.lookX, C.lookY - activePortraitLookDrop(), 0)` | replaced by the new call shapes (lens resolution, lifted probe pose, actor-plane clamp) | pinned the pre-T-107 calibration text; the replica now calls `src/pure/framing.js` itself, so "the lab models the page's camera" is enforced by shared code plus the T-107 parity assertion |
| `tools/simlab/lib/sixface-host.mjs` | `edgesForViewport()` (the turn proof's camera) | now the framing module's edges (+ `viewport.touch`) | its route-plane copy would have measured a clamp the page no longer has, at every viewport — green while stale |

## PROPOSED INBOX ISSUES

## I-??? | feel | S2 | repro: `node tools/simlab/framing/route-ahead.mjs` (branch) vs `--root <export of ace6618>` @ task/T-107 | evidence: reports/tasks/T-107/evidence/route-ahead-*.json
The closer phone frame (operator-approved, entry 20 addendum) shows 16-26
tiles less route ahead of RIG than today's FAR phone frame at the median of
every bot style (rush 58 -> 42, carried 84 -> 58, the oracle racer 30 -> 12),
roughly what desktop FAR shows. That is inherent in a 1.5x closer frame; the
remedy is T-201's follow-lead, which on this frame keeps a racer 21.8 tiles of
visible route ahead (lead 19.77 + 1.99 clamp offset). Needs the operator's
call on whether that is enough on a phone (packet Q1), and T-201's lab numbers
re-taken on the built frame (its `phone-landscape-6pct` row is T-104's estimate).

## I-??? | feel | S3 | repro: `node tools/simlab/framing/vertical-band.mjs` and the T-107 domain's "stick ring" labels @ task/T-107 | evidence: reports/tasks/T-107/evidence/pathcheck-t107-static-labels.txt
On a landscape phone, RIG on the lowest deck at the far left of the frame
(pressed against the damage plane) has his feet 15-22 px into the top of the
resting stick ring (38-39 px with the iPhone's 21 px home-indicator inset); the
ring's centre, where the thumb rests, stays ~20 px below. The helix tilts the
band down on the left. No lift fixes this without pushing RIG's head off the top
on face 6; a smaller phone RIG would, or a stick ghost placed lower (T-101/T-105).

## I-??? | art | S2 | repro: `?rise=steep` on 844x390 touch, face 5-6 upper lattice near the right clamp; `node tools/simlab/framing/vertical-band.mjs` @ task/T-107 | evidence: reports/tasks/T-107/evidence/vertical-band-helix-vs-steep.log
With the per-side rise (unjudged, off by default) the band tilts ~13 tiles
across a phone frame: RIG's painted head on face 6's highest reachable
surfaces goes 55-61 px above the top of the frame. Desktop fits. A camera that
follows RIG vertically, a partial roll with the grade, or a lower grade on
phones are the options; it is the operator's design call before `?rise=steep`
can become a default.

## I-??? | art | S3 | repro: render/player.js `portraitActorVisualGain(innerWidth / innerHeight)` on main 9bedbaa; `tools/rig-grip/capture.mjs --views portrait` | evidence: PENDING-STRETCH
Portrait already draws RIG's body at 7.0% of the short side (27.4 px at 390
wide) — larger than the landscape phone frame — yet render/player.js still
applies the 1.5x portrait actor gain, which is what stretches T-103's arms
(T-103's own inbox issue asks for this call). One line removes it:
`const portraitGain = 1;` (or `maxGain: 1` in pure/traversal.js). Not done here:
render/player.js is RIG art, outside this lane's fence. Measured stretch with
and without: PENDING-STRETCH-NUMBERS.

## I-??? | bug | S3 | repro: `phone-framing-probe.mjs --clamp`, `left-deck` / `left-high` @ task/T-107 and main | evidence: reports/tasks/T-107/evidence/probe-*.json
At the damage plane (EDGE_L) RIG's back still touches the left frame edge (0 px
gap, main and branch, every viewport): EDGE_L is calibrated on the route plane
while RIG draws 1.15 tiles toward the camera. Left as is on purpose — EDGE_L is
the damage plane, and moving it is a difficulty lever (LANE-BRIEF) — but the
pinned-at-the-plane frame shows a cut RIG. Fix direction, if wanted: move the
crush visual (render/juice.js) rather than the plane.

## I-??? | docs | S3 | repro: `grep -n "routeAhead\|lookahead" tools/simlab/race/run-child.mjs` @ task/T-107 | evidence: tools/simlab/framing/route-ahead.mjs header
The race lab's `lookahead` / `routeAhead` histograms measure to the sim's
EDGE_R. Since T-107 that is the actor-plane right clamp, 2.0-2.5 tiles inside
the visible route edge, so post-T-107 numbers read ~2 tiles low against
T-104's tables; and every viewport's race-lab baseline changes (the clamp
moved everywhere). T-201 should re-take its baseline on the merged tree.
`edges.mjs` now reports `routeRight` beside `right`.

## I-??? | art | S3 | repro: `node tools/simlab/framing/veil-need.mjs` (vertical column) @ task/T-107 | evidence: reports/tasks/T-107/evidence/veil-need.json
The far veil's vertical extent does not cover the bottom of the frame in
portrait (1.9 tiles past its opaque edge after a turn, pre-existing, 4.2 under
`?orbit=joint`) or the corners of a 32:9 monitor (3.9 tiles). Horizontal voids
(R2) are fixed everywhere; these vertical ones are small and pre-existing.

PENDING-ISSUES

## Operator packet

Build: this branch merged (or `node tools/serve.mjs <port> --root <this worktree>`).
On the iPhone, hold it in **landscape**; every URL below is `index.html` plus
the query shown. The phone frame needs no flag — it is on for every touch phone.

| try | iPhone (landscape) | desktop |
| --- | --- | --- |
| the new default | `index.html` | `index.html` (unchanged camera) |
| A/B: today's frame | `index.html?view=far` | — |
| preview the phone frame | — | `index.html?view=phone` |
| A/B: no post-turn zoom (unjudged) | `index.html?orbit=joint` vs `index.html` | `index.html?orbit=joint` vs `index.html` |
| A/B: the climb made literal (unjudged) | `index.html?rise=steep` vs `index.html` | `index.html?rise=steep` vs `index.html` |
| A/B: the old corner edges | `index.html?veil=legacy` vs `index.html` | `index.html?veil=legacy` vs `index.html` |

Questions (please answer in your own words):

1. On the phone, between `index.html` and `index.html?view=far`: which lets you
   see enough of what is coming, and which makes RIG easier to keep track of?
2. Right after a turn, how quickly do you find RIG? Is that different with
   `?orbit=joint`?
3. With `?orbit=joint`, does anything about the view right after a turn feel
   different from the default — and does that feel like part of the turn?
4. With `?rise=steep`, does the ground read as climbing the beast, or as a
   ramp? On the phone, does anything you need to see go off the top of the
   screen on the later faces?
5. Does RIG ever end up under your thumbs, or under the panels at the top of
   the screen?

PENDING-PACKET
