# T-107 build report — the phone camera (+ T-204 per-side rise, T-102 R2/R3/I-104)

Worktree `/home/user/hullbreaker/.claude/worktrees/T-107`, branch `task/T-107`,
base `ace6618` (main at dispatch), **merged with main `af8bb0b`** (T-103's guns
in hands, decisions 27) at `cda5057` — a merge commit, no rebase; the only
conflict was the pathcheck manifest, where **T-107's domain is now d83** (d79/d80
are T-103's on main; d81 is left for T-201's race pass and d82 for T-105, which
may need one).
Resumed twice from container restarts: first from the previous agent's
uncommitted snapshot `f245087`, then from `dd367d1` (the readability tool's
boot retry and the portrait-gain sheets, reviewed and kept). Everything below
was measured by this lane; nothing is inherited from a snapshot or another
lane without a re-run, and every capture batch the second restart cut short
was re-run from scratch (partial outputs were discarded, not cited). Ports:
8776 (this tree), 8777 (the "before" tree: an untouched `git archive ace6618`
export for the first batches, then main's `src/` at `af8bb0b`, verified
file-for-file); 8778/8779 were used by the first session's batches. All servers
were stopped at the end.

Host: GPU-less SwiftShader, 4 cores shared with several agents, load average
40-80 through both sessions. Every browser number below is from that host and
is evidence about the code's geometry and relative cost, never about an
iPhone.

## What a player gets

- **On a phone (touch, landscape)** the camera is the FAR shot through a
  longer lens: RIG's body is **5.58%** of the screen height (21.8 px at
  844x390, measured live; FAR on the same phone today: 3.83%, 14.9 px), and the
  frame shows **67.9 x 31.3 tiles** of route instead of 99.2 x 45.6. The frame is
  lifted 0.85 tiles so the lowest landing deck stays above the right-thumb
  cluster (with the iPhone's home-indicator inset) while RIG's head stays inside
  the top on every route surface he can stand on. Desktop is untouched: the
  camera's matrices are bit-identical to main at 1280x720, 1920x1080 and 1280x800.
- **Portrait phones** keep FAR's portrait frame exactly (RIG's body is already
  7.0% of the short side there); the lens only ever narrows.
- **Everywhere**, RIG pinned at the right clamp now stays fully on screen
  (on main he was half off at 1280x720 and **entirely off-screen** at 844x390
  and 932x430 — measured in painted pixels, box 8), and the flat clear-colour
  voids at the screen edge near every corner are gone (box 7: 11.8-19.0% of
  columns on approach at 844x390 on main -> 0%).
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

`src/sim/` is untouched (`git diff --stat ace6618 -- src/sim` is empty).

What I kept from the snapshot, and what I changed after measuring:

- **Kept: the lens model** (narrow the fov at the FAR pose) over a depth
  pull-in. The camera never stands closer to the anatomy than FAR does (no new
  clipping risk anywhere in the orbit), the backdrop keeps its scale against
  RIG, fog and every distance-keyed system stay as authored.
- **Changed: RIG share 5.8% -> 5.6%, lift 0 -> 0.85.** The snapshot's 5.8% /
  0 put RIG's painted head off the top of the frame on face 6's highest
  surfaces once the helix's tilt across the frame is counted (13.0 px at
  844x390, 14.3 px at 932x430, 9.3 px at 667x375; `vertical-band.mjs` with the
  snapshot's constants). Solved instead for the largest share at which BOTH
  hold at 844x390, 932x430, 667x375 and a Safari-chrome 844x350: RIG's painted
  head inside the top on every surface he can stand on, and the lowest deck
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
  the lattice still overhung (falsifier M5a: NDC 1.011 at 1024x768).
  EDGE_R now uses the narrowest row.
- **Changed: the veil extension 45 -> 120 tiles.** 45 left 0.4 tiles of margin
  on a FAR phone and did not cover 21:9 (needs 55) or 32:9 (111) monitors.
- **Added:** everything that proves it — the snapshot had no assertions, no
  replica updates, no measurements.

Tooling (zero effect on the game):

- `tools/simlab/lib/sixface-host.mjs` and `tools/simlab/race/edges.mjs` now take
  the lens, the lift and the clamp from `src/pure/framing.js` (they had their
  own route-plane math, which the camera change would have left silently
  stale: the race lab's `assertCameraSourceMatches()` threw on the snapshot).
  New turn-lab presets `phoneLandscapeTouch`, `phoneMaxTouch`,
  `phoneSmallTouch`, `phonePortraitTouch`; race-lab rows
  `phone-landscape-far` / `phone-portrait-far` (the escape hatch).
- `tools/simlab/race/probe-framing.mjs` re-pointed at the T-101 deck's
  published layout (`__HB_TOUCH().layout`: cluster box, stick ghost, split)
  instead of the retired hidden `#touchDeck`.
- New: `tools/pathcheck/t-107-phone-framing.mjs` (domain **d83** — see the
  header), `tools/playtest/phone-framing-probe.mjs`,
  `tools/playtest/phone-readability-capture.mjs`, `tools/playtest/framing-cost.mjs`,
  `tools/simlab/framing/{render-only,veil-need,zoom-pump,route-ahead,vertical-band,thumb-overlap,rig-boxes}.mjs`,
  `tools/simlab/framing/{void_columns,readability_sheet,rig_crops,turn_sheet}.py`. Documented in
  `tools/simlab/README.md` ("The phone frame (T-107)") and
  `tools/simlab/TURNLAB.md` (limitations 4-5).

## Acceptance, box by box (SPRINT T-107 order; before = main `ace6618`, after = this branch)

### 1. A pure, asserted framing resolver; desktop byte-identical projection — MET

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

### 2. RIG's height share at 844x390 / 932x430 / 667x375; portrait — MET

Measured live (`phone-framing-probe.mjs --rig`, RIG standing at the frame's
centre column, touch emulation, `evidence/probe-phone-*.json`):

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
Why 5.6% and not 6.0%: the vertical band (box 3) does not fit at 6.0%.

**Portrait (justified):** portrait keeps FAR's portrait frame exactly
(asserted: fov 56, lift 0). Its compact portrait framing already draws RIG's
body at **7.0% of the short side** (27.4 px at 390 wide) — larger than the
landscape phone frame — so there is nothing to tighten; widening it to match
landscape (the snapshot's rule, "5.8% of the short side") would shrink RIG and
push the frame's bottom 11.6 tiles past the far anatomy veil. "6% of the SHORT
side" is the right yardstick for a phone (rotating the phone does not change
the glass or the thumb), and portrait already exceeds it. Consequence for the
portrait actor gain: see "Portrait actor gain" below.

### 3. Look-ahead (owned by T-201) and the vertical band

**Vertical band — MET with 0.85 tiles of lift, not ~6 (why).** T-104 modelled
a ~6-tile lift for a depth pull-in, before the T-101 deck existed. The lens
model keeps FAR's pose, whose band already sits mid-frame. With the deck: the
lowest landing deck in the shipped lattice is y 2 and the highest route
surface y 17 (asserted from the level data, so a lattice change re-derives
this), RIG's painted head there is at 19.0, and the helix tilts the band ~4
tiles across a phone frame. A 6-tile lift puts the lowest deck **45 px under
the right-thumb cluster** at 844x390 (asserted as the falsifier). Solved over
every scroll position on faces 1-6 and every route surface RIG can reach
(damage-plane margin to right clamp), `tools/simlab/framing/vertical-band.mjs`:

| frame | lift | RIG's painted head vs top (worst) | lowest deck vs cluster top, iPhone insets (worst) |
| --- | --- | --- | --- |
| body 6.0% | any | infeasible: lift >= ~1.1 to keep the head in, <= ~0.4 to keep the deck clear | |
| body 5.8% (the snapshot) | 0 | 13.0 / 14.3 / 9.3 px **off the top** (844x390 / 932x430 / 667x375) | |
| body 5.75% | 1.0 | 1.4 px inside (844x390) | 0.7 px clear |
| **body 5.6%** | **0.85** | **4.3 / 4.8 / 7.3 / 1.9 px inside** (844x390 / 932x430 / 667x375 / 844x350) | **3.8 / 6.3 / 22.7 / 2.5 px clear** |
| body 5.6% | 0 (falsifier M4a) | 6.3 / 7.0 / 3.0 / 7.6 px **off the top** | |
| body 5.6% | 2 (falsifier M4b) | | 10.7 / 9.7 / - / 10.5 px **under** |

(844x350 = the same iPhone in landscape Safari with its toolbar showing.)
Without insets (desktop Chrome emulation) the deck clears the cluster by
22.7-29.3 px. Asserted per viewport in the T-107 domain.

**The same band in PLAY** (`tools/simlab/framing/thumb-overlap.mjs`,
`evidence/thumb-overlap.{log,json}`: the race lab's replica, rush / climber /
fighter / carried x 2 seeds + the oracle racer, 300 s each, 100 ms trace,
every straight-face frame projected through the replica camera): RIG's
painted head goes above the top of the phone frame in **0.17-0.18% of frames**
(rush, climber, fighter; ~0.5 s per 5-minute run), by up to **22 px** — always
mid-jump from face 5's highest surfaces (feet at y 18.6-20.6, above the
highest surface). FAR on the same phone: never (>= 39 px to spare). The
assertion covers standing; a jump apex above the highest surface does not
fit the 5.5-6.5% box together with the deck (an open question for the
operator, packet Q4).

**Look-ahead — NOT MET as worded; escalated.** Race-lab replica, 4 policies x
4 seeds + the oracle racer x 2, 300 s each,
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
reduction: the operator chose a ~1.5x closer frame on phones, and shifting the
frame forward to compensate would move the damage plane (a difficulty lever).
**With T-201's follow-lead, measured — the decisive numbers.** Look-ahead is
T-201's lever, so I measured the two lanes together: the same tool on a
scratch export of `git merge-tree` of this branch and `task/T-201` (`c48ca1e`;
fast gate 4235/0, "T-201 coordination" below), T-201's own race lab with its
follow-lead, the same seeds (`evidence/route-ahead-combined-T-201.{log,json}`).
Visible route ahead of RIG, tiles, median (p10):

| combined tree | rush | climber | fighter | carried | oracle@0 racer |
| --- | --- | --- | --- | --- | --- |
| desktop 16:10 | 23.3 (15.3) | 23.3 (15.3) | 56.3 (36.3) | 59.3 (36.3) | 23.3 (15.3) |
| phone 844x390, the phone frame | **21 (12)** | **21 (12)** | **51 (33)** | **56 (33)** | **21 (12)** |
| phone 844x390, `?view=far` | 32 (27) | 32 (27) | 60 (48) | 76 (51) | 35 (27) |

So under the follow-lead a racer on the phone frame sees **about what desktop
FAR shows** (21 vs 23.3 tiles at the median; 2.2 s at run speed) — T-104's own
phone target (§4.2: lead 18.8 in the 6% frame, + the ~2-tile clamp offset) —
but **11-14 tiles less than today's FAR frame on the same phone**, and its
p10 falls from 27 to 12. The box's "no worse than FAR's on the same seed" is
therefore NOT met, and cannot be met by the camera without moving the damage
plane: the remedy is T-201's lead on phones (its `leadFrac` 0.3 gives 19.8
tiles on the 65.9-tile phone strip; matching the FAR phone's 32-tile median
needs a lead of ~30, which puts RIG just past mid-frame, 53% across). Escalated to the
operator (packet Q1, call (a)) and to T-201 (inbox issue).

**Edge API for T-201 — the shape is unchanged (`setEdges(left, right)`).**
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
the screen's left edge — the frame is narrower, so RIG has 25 tiles of
retreat room behind the scroll instead of 39; desktop 16:10 has 27.4), EDGE_R
by 19, W by a third. EDGE_R everywhere is now the **actor-plane clamp**,
1.5-2.5 tiles inside the visible route edge, so `EDGE_R - EDGE_L` is the
clamp-to-plane width the sim actually lets RIG use; the visible route width
is 2-2.5 tiles more. RIG kept `lead` tiles from EDGE_R therefore sees
`lead + (routeRight - EDGE_R)` of route. The race lab's
`lookahead`/`routeAhead` histograms measure to EDGE_R, so they read ~2 tiles
low against pre-T-107 numbers (`route-ahead.mjs` adds it back; `edges.mjs`
reports `routeRight` beside `right`).

### 4. Five corner turns and the Crown approach at the phone frame — MET

T-102's posed-capture method (`tools/simlab/turnlab.mjs` poses at the phone
frame + `tools/playtest/turn-pose-capture.mjs`), 844x390 touch: every corner
k = 1-6 (five turns + the Crown approach) at approach (before), 350 and 700 ms
into the ritual (during), done and +1.5 s (after) — 30 frames; the joint orbit
at corners 1 and 3 (6 frames); main's FAR phone frame at approach and +1.5 s
(12 frames). Contact sheet: `captures/turns-phone-844x390-sheet.jpg`.

- **The landing is visible:** RIG's painted box (projected through the same
  camera, `tools/simlab/framing/rig-boxes.mjs`) is wholly on screen in all 30
  frames (x 416-596, y 180-242 of 844x390), never under the right-thumb
  cluster (top 262; 241 with the iPhone inset, whose columns RIG never shares
  in these frames), and the arriving face's deck and lattice are in view from
  the ritual's end (t700) on.
- **No camera clipping:** the lens model never moves the camera — every pose is
  FAR's pose plus 0.85 tiles up — so nothing comes closer to the camera than
  it does on desktop today; the joint orbit stands farther from the arriving
  face than the shipped one. No near-plane cut in any of the 48 frames.
- **Static anatomy (entry 3):** in all 48 frames the page's route ownership
  is whole facets only (`turn-pose-capture` sidecars: the arriving face 0/88
  rows drawn through t350, 88/88 from t700; the departing one the reverse;
  no partial facet anywhere), and the page camera equals the replica at every
  frame (0 errors). The arriving stretch is revealed whole, never assembled.
- The pause card ("TAP TO RESUME") in these frames is the capture's: the
  poses are applied to a paused page.

**The Crown face — RIG's readability (T-102's gate note).** RIG cut out at
true size and 4x on face 6 and on the Crown approach (`rig_crops.py`,
`captures/crown-rig-crops-{main,branch}.png`): the phone frame draws him
**31 px tall instead of 21.5** (painted box, +44%), but his figure-ground
contrast does not change (box-vs-surround luminance proxy 0.34 on the branch
vs 0.39 on main at the Crown approach +1.5 s; 0.08 vs 0.01 on the approach):
he is still a dark silhouette against the Crown's lit orange/magenta
machinery. Size is the camera's lever and it is pulled; contrast is RIG's
value/rim lighting (entry 14, RIG art) — an inbox issue, not this lane.

### 5. Hostile tells, bullets and capsules at DPR 2 — PENDING-READABILITY

### 6. The post-turn zoom pump (R3) — MET behind `?orbit=joint` (OFF by default)

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
60 Hz frame at the ratchet's snap). Captures: `captures/r3-orbit-shipped-vs-joint-844x390.jpg`
(corners 1 and 3 at t700 / done / +1.5 s, both orbits). Render-only (T-204's proof).

### 7. Edge voids near corners (R2) — MET at phone and desktop

Same column metric as T-102 (`tools/simlab/framing/void_columns.py`: a column
is a void when >= 90% of its pixels are within 10 of the clear colour
(47, 85, 94), sampled from main's void), on the posed captures:

| 844x390 touch | main (FAR) approach | main +1.5 s after the turn | branch approach | branch t350 / t700 / done | branch +1.5 s |
| --- | --- | --- | --- | --- | --- |
| c1 | 19.0% (right edge) | 11.4% (left edge) | 0% | 0 / 0 / 0% | 0% |
| c2 | 12.8% | 5.5% | 0% | 0 / 0 / 0% | 0% |
| c3 | 17.3% | 12.7% | 0% | 0 / 0 / 0% | 0% |
| c4 | 11.8% | 3.8% | 0% | 0 / 0 / 0% | 0% |
| c5 | 18.5% | 10.4% | 0% | 0 / 0 / 0% | 0% |
| c6 (Crown) | 13.5% | 0% | 0% | 0 / 0 / 0% | 0% |

(T-102 measured "up to 18.7% on approach, 10-11% after a turn" on main.) On
the branch not one pixel of the clear colour remains in any of the 36 phone
frames (clear-pixel share 0.00%; main's c1 +1.5 s: 12.0%), the joint-orbit
frames included. Analytically (`tools/simlab/framing/veil-need.mjs`,
`evidence/veil-need.json`) the extended veil covers every settled pose with
>= 75 tiles to spare at every viewport from 390x844 to 32:9; the old veil
needed 27 more tiles at the phone frame, 45 on a FAR phone, 55 at 21:9 and 111
at 32:9.

**Desktop, 1280x720** (same metric, same clear colour — sampled again from
main's desktop voids: (47, 85, 94) is the dominant edge colour of every main
frame; posed captures of every corner; `evidence/r2-void-columns-1280x720.json`):

| 1280x720 | main approach | main +1.5 s | branch approach | branch t350 | branch +1.5 s | branch +4 s |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | 12.3% (right edge) | 2.9% (left edge) | 0% | 0% | 0% | 0% |
| c2 | 4.8% | 0% | 0% | 0% | 0% | 0% |
| c3 | 10.2% | 4.8% | 0% | 0% | 0% | 0% |
| c4 | 3.4% | 0% | 0% | 0% | 0% | 0% |
| c5 | 11.6% | 2.1% | 0% | 0% | 0% | 0% |
| c6 (Crown) | 5.5% | 0% | 0% | 0% | 0% | 0% |

On the branch's 24 desktop frames the clear-pixel share is 0.00-0.04% —
scattered single texels of the dark-teal painting that fall inside the
tolerance, never a column. The desktop camera is bit-identical to main
(box 1), so at desktop the extended veil is the whole difference.

**Which change removed the voids on the phone — the veil or the narrower
lens?** Same metric, posed corners 1/3/5, all four combinations at 844x390
touch (`evidence/r2-void-columns-844x390-attribution.json`,
`captures/r2-attribution-844x390-c1-approach.jpg`):

| 844x390 touch, void columns | approach c1 / c3 / c5 | +1.5 s c1 / c3 / c5 |
| --- | --- | --- |
| FAR frame, 200-tile veil (main) | 19.0 / 17.3 / 18.5% | 11.4 / 12.7 / 10.4% |
| FAR frame, extended veil (`?view=far`; main's camera bit for bit, box 9) | **0 / 0 / 0%** | **0 / 0 / 0%** |
| phone frame, 200-tile veil (`?veil=legacy`) | 4.7 / 2.4 / 4.0% (right edge) | 0 / 0 / 0% |
| phone frame, extended veil (the default) | 0 / 0 / 0% | 0 / 0 / 0% |

The extended veil alone removes the voids; the narrower lens alone only
shrinks them. One honest cost, visible in the attribution image: the
extension MIRRORS the painting, and on the wide FAR frame at an approach the
mirror axis shows near the right edge as symmetric arches — distant anatomy
instead of a flat void, but a visible symmetry (inbox issue; the phone frame
and desktop 16:9 do not reach the axis in these poses).

### 8. RIG at the right clamp (I-104) — whole sprite on screen, every viewport — MET

EDGE_R = the frame's right edge on the actor plane at its narrowest row, minus
RIG's widest drawn half-silhouette (1.295 tiles = `RIG_SPRITE_MAX_OVERRUN` x
half-width; covers the weapon's 0.825-tile reach).

- Asserted analytically at 17 viewports (desktop 16:10 ... 32:9, touch phones
  both orientations, mouse phones, 260x1000, tablets), RIG at deck height, mid
  and on the highest surfaces: rightmost silhouette point at NDC **<= 0.998**;
  the pre-T-107 route-plane clamp puts his **centre** at NDC 1.028.
- **At the size the renderer actually draws him** (added after the merge with
  T-103): render/player.js scales RIG's body by
  `portraitActorVisualGain(innerWidth / innerHeight)` — up to 1.5x on a
  portrait phone, 1.22x on a portrait tablet. The widest frame in the atlases
  is 1.14 tiles from his x at gain 1 (the run `contact` frame's trailing side;
  facing right the widest is 0.85, `air-fall`), so at 1.5x the 1.295-tile bound
  alone would not cover portrait. The assertion now scales the silhouette (and
  its sample heights) by that gain; the muzzle never moves
  (`rigWeaponPlacement` scales the weapon about it). Result: worst NDC still
  0.998 (667x375 touch, gain 1); **with the gain, worst 0.957 (768x1024 touch,
  gain 1.22)** and lower on portrait phones — the portrait safe inset (46 px per
  side, camera.js `PORTRAIT_SAFE`) keeps the clamp well inside the glass, so
  **no camera change was needed**. A source guard ties the modelled gain to
  player.js's own call (falsifiers M14, M15, M15b below).
- Played (turn proof at the phone frame, 7 runs incl. `?momentum=0`, which
  rides the clamp): RIG's chest at the clamp at NDC **0.952** (was ~1.012).
- Live, in painted pixels (RIG-only draw at the clamp, facing right,
  `phone-framing-probe.mjs --clamp`, `evidence/probe-*.json`):

| viewport | main: gap from RIG's outermost pixel to the right edge | branch (deck, y 15) |
| --- | --- | --- |
| 844x390 touch | **no RIG pixel on screen at all** | 7.28 px, 4.55 px |
| 932x430 touch | **no RIG pixel on screen at all** | 8.18 px, 4.55 px |
| 667x375 touch | 0 px (cut by the edge) | 7.28 px, 4.55 px |
| 1280x720 | 0 px on the deck (cut); **no pixel on screen** high (y 15) | 12.8 px, 8.0 px |
| 1280x800 | 0 px on the deck (cut); **no pixel on screen** high | 13.6 px, 8.8 px |

On main a phone loses RIG entirely when he is pinned at the right clamp (his
draw depth narrows the frame by ~1.5-2 tiles at that aspect), and even on
desktop he vanishes when pinned there high on the lattice (the frame's right
edge narrows toward the top). At the damage plane (EDGE_L) RIG's back still
touches the left edge (0 px gap, main and branch): reported as an inbox
issue, not changed — moving EDGE_L moves the damage plane.

### 9. Escape hatches `?view=far` / `?view=phone` — MET

- `?view=far` on a touch phone (844x390): fov 56, lift 0, route edge 60.184 =
  main's phone calibration (`evidence/probe-phone-branch-viewfar.json`).
  **And the camera itself is main's, bit for bit:** `phone-framing-probe.mjs`
  booted main and this branch's `?view=far` at 844x390 with touch (`?juice=0`)
  and compared 17 poses element by element: **0 differing camera numbers, CAMERA
  IDENTICAL** (`evidence/hatch-viewfar-compare.txt`,
  `evidence/hatch-main-844x390.json`, `evidence/hatch-branch-viewfar-844x390.json`). EDGE_L is identical
  (-38.975); EDGE_R is 57.218 instead of 60.184 — the actor-plane clamp (box 8),
  by design, on every viewport.
- `?view=phone` on desktop (1280x720): fov 40.09, lift 0.85, RIG's body 40.2 px
  = **5.58%** of the height (`evidence/probe-desktop-branch-viewphone.json`).

### 10. Frame cost, phone frame vs FAR on the same viewport — PENDING-COST

### 11. pathcheck green; smoke-verdict PASS; operator packet — MET

See "Verification": on the merged tree the full tier is **4537 passed, 0
failed** and both smoke scripts PASS as the merge gate runs them; "Operator
packet" below.

## The dispatch's further boxes

### T-201 coordination (look-ahead, the edge API)

Box 3: `setEdges(left, right)` keeps its shape; on phones W shrinks by a third
and T-201's lead with it (24 -> 19.8 tiles at 844x390); the clamp moved ~2
tiles in everywhere, so every race-lab baseline shifts and the lab's
histograms read ~2 tiles low against T-104's tables. T-201 should re-take its
baseline on the merged tree; its `phone-landscape-6pct` row was T-104's
estimate and `phone-landscape` is now the built frame.

**Does this change move the camera anchor? By default, no.** T-201's corner
blend and TURNLAB limitation 7 exist because render/camera.js anchors the view
at the scroll (the halt point during a ritual). With no flags:

- desktop: the camera is bit-identical to main (box 1) — same anchor, yaw,
  pose and projection;
- phones: the same anchor and yaw as FAR; only the fov narrows and the camera
  and its look target rise 0.85 tiles together (vertical only, pitch
  unchanged). The horizontal anchoring the blend is built on is untouched;
- what does move everywhere is EDGE_R (the actor-plane clamp, ~2 tiles in), so
  the sim's `[left, right]` strip — and T-201's lead, which reads it live —
  changes by that much (table above).

**`?orbit=joint` (off by default, unjudged) does move the anchor** during a
ritual: the orbit pivot slides from the halt point to the joint, and it
reproduces `polyAt(scrollX)` again once the scroll passes the chamfer. If the
operator keeps it, T-201's corner blend and limitation 7 must be re-measured
under it (the blend's job — bringing the scroll to the halt so the shipped
orbit frames the turn — changes when the orbit no longer pivots on the halt).

**The two lanes together, measured on a combined tree.** A scratch export of
`git merge-tree` of this branch and `task/T-201` (`c48ca1e`; the only conflicts
were the manifest — d81 T-201, d83 T-107 — and `tools/simlab/README.md`, both
sides kept): `HB_GATE_FAST=1 node tools/pathcheck.mjs` **4235 passed, 0
failed** (`evidence/pathcheck-fast-combined-T-201.log`). On that tree a
racer's visible route ahead is 21 tiles (median) on the phone frame, 32-35 on
`?view=far`, 23.3 on desktop (box 3's table). Whichever lane merges second
resolves the same two conflicts; the race lab and the turn lab already read
the edges from `src/pure/framing.js`, so T-201's labs measure the built phone
frame with no further change.

**The combined tree's full tier: 4696 passed, 1 failed — a second-merge
blocker, diagnosed.** The failing check is T-102's coverage guard, extended by
T-201: "the visible-only gunner fought at least three held gates (escape
hatch) or three moving encounters (rolling) per viewport". Reproduced with
`runTurnProof` directly (deterministic; `evidence/paced-gunner-combined-T-201.json`):

| paced visible-only gunner, corners with a held gate (escape hatch) / with encounter kills (rolling) | desktop 1280x720 | phoneLandscape (FAR) | phonePortrait |
| --- | --- | --- | --- |
| main, held gates (default) | 5 | — | — |
| this branch alone, held gates (default) | 6 | — | — |
| T-201 alone, `?gates=legacy&follow=0` | 5 | 4 | 5 |
| **combined, `?gates=legacy&follow=0`** | **2** (corners 3, 6) | 5 | 4 |
| T-201 alone, rolling (default) | 6 | 6 | 5 |
| combined, rolling (default) | 6 | 6 | 6 |

No contract is violated in any run (VICTORY 6/6, no turn-family or gate
violations); only the guard's "the test really fought >= 3 held gates" fails,
at desktop under the escape hatch (corner 2, e.g.: T-201 alone holds 225 ticks
with 4 kills; combined, `gateAt` null — `armGate` took the "earned
drive-through clear" — 1 kill).

**Bisected to one EDGE_R consumer, in scratch copies of the combined tree**
(`evidence/paced-gunner-combined-T-201.json`):

| combined tree, desktop, `?gates=legacy&follow=0` | corners with a held gate |
| --- | --- |
| as merged | 2 |
| control: the lab's EDGE_R back on the route plane (`actorClamp: false`) | 5 (identical to T-201 alone, run for run) |
| only `src/sim/spawner.js` reads the old edge (+2.513 tiles at 1280x720) | **6** |
| only RIG's clamp (`player.js`), only the gate patrol box (`hostiles.js`), only the approach dolly (`scroll.js`), only the defense view (`meridian-defense.js`), or the gate cohort placement (`wavegate.js spawnGateWave`, by +2.513 or by `rightClampInsetTiles()`) | 2 each — no effect |

The cause is the ambient spawn trigger, `spawner.js updateSpawner`: a table
row spawns once `x < sRightEdge() - 1.5` ("just inside the view"). T-107's
I-104 clamp moved EDGE_R 2.5 tiles inward at 1280x720, so **on desktop every
ambient table spawn now triggers 2.5 tiles of scroll later and materialises
~4 tiles inside the right edge instead of ~1.5** (1280x800: 2.3 tiles; a FAR
phone: 3.0; the phone frame's EDGE_R is a different frame altogether). That is
a gameplay side effect of the clamp fix on desktop, through the one-number
edge API — measurable on this branch alone too (the paced gunner meets a held
gate on 6 corners instead of main's 5). The options, none in T-107's fence
(src/sim is T-201's this wave):

1. **Split the edge** (verified at desktop in scratch, row 3): the sim keeps
   the VIEW's right edge for the spawn trigger (and, for consistency, T-201's
   staging band and lead and the gate cohort placement) and the actor-plane
   clamp only for RIG — e.g. `setEdges(left, right, viewRight)`, which
   camera.js can supply in one line (it already computes the route edge as
   `_framingEdgeRouteRight`). This restores main's spawn timing exactly and
   keeps the I-104 fix.
2. Re-model the guard (count earned drive-through clears as gates fought) —
   a legacy-assertion change (entry 21), and it leaves the spawn shift in.
3. Accept the shift as the new baseline and let T-201 re-take its numbers.

The shipped default after T-201 (rolling corners) passes on the combined tree
(6/6/6 sides with kills). Inbox issue below; my recommendation is option 1,
landed with whichever lane merges second.

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
flag, render-only or not. The turn lab's played checks run unchanged under the
flags too (T-107 played checks, `?orbit=joint` rows).

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

**QA captures** (T-102's posed method, every art asset through the boot
preload gate, page camera = replica at every frame): corners 1, 3 and 6 at
approach (a straight), 350 ms into the ritual (the ratchet) and +4 s (the next
straight; c6 = the Crown approach), `?rise=steep` against the shipped helix,
at 844x390 touch (the phone frame) and 1280x720 (desktop FAR) —
`captures/t204-helix-vs-steep-844x390.jpg`, `captures/t204-helix-vs-steep-1280x720.jpg`
(36 frames).

- **The deck visibly climbs.** On the steep frames the deck and every
  catwalk run uphill left to right across the whole frame; on the helix they
  read nearly level. Vertical anatomy (pillars, ladders) stays vertical — the
  camera does not roll; nothing assembles (entry 3).
- **Stepped tile columns: not at true size; a 1-2 px notch per tile when
  magnified.** Same-crop comparisons (`captures/t204-deck-crop-c3-844x390-x3.jpg`,
  `captures/t204-deck-crop-c3-1280x720-x2.jpg`) show the steep deck's top
  edge and lit rim as straight slopes with ordinary raster aliasing. At x6
  (`captures/t204-lip-steep-1280x720-x6.png`) the row boundary under the lit
  lip shows a small notch about once per tile — the analytic seam jog above
  (level.js stacks each column's rows straight down while every tile leans by
  the pitch, so each row is offset sin theta along the slope: 2.9 px at
  1280x720 on face 3, 3.4 px at 0.21; 1.0 px on today's helix). A fix (stack
  rows along the tile's own normal, or shear instead of rotate) is in
  render/level.js, outside this lane — inbox issue.
- **"Firing into a hillside": see the fight captures and the inbox issue.**
  PENDING-STEEPFIGHT

### Portrait actor gain (from T-103)

The portrait framing decision removes the NEED for the gain: portrait keeps
FAR's portrait frame, where RIG's body is already 7.0% of the short side
(27.4 px at 390 wide; painted ~32 px without the gain) — more than the
landscape phone frame's 5.6% (21.8 px; painted 23.6-28.2 px) — so the 1.5x
actor visual gain render/player.js applies in portrait no longer buys a size
the frame lacks. **It is proposed, not removed, for two reasons:** the line
lives in `src/render/player.js` (RIG presentation, outside this lane's fence),
and removing it flips a judged legacy assertion — `pathcheck-suite.mjs`
"responsive portrait composition keeps desktop FAR exact while an iPhone sees
... a readable RIG" pins `portraitActorVisualGain(390/844) === 1.5` and RIG at
4-6% of the portrait **height** with the gain (3.24% without it). Whether
portrait is judged by height (the legacy assertion) or by the short side (this
lane's yardstick, box 2) is the operator's call, and under entry 21 that
assertion change needs his name on it.

The stretch, before and after, measured with `tools/rig-grip/capture.mjs` on
main's tree (= this branch's RIG code; the "after" is a scratch copy with the
one line `const portraitGain = 1;`), 390x844 DPR 2
(`evidence/portrait-gain-stretch.json`, sheets `captures/portrait-gain-main-1.5x-sheet.png`
and `captures/portrait-gain-removed-sheet.png`):

| portrait 390x844 DPR 2, weapon R, rows stand / run-contact / climb-1, 16 aims (48 cells) | arm stretch, worst | cells over x1.05 | fist-to-grip, worst | muzzle-to-spawn, worst |
| --- | --- | --- | --- | --- |
| before: shipped portrait gain 1.5 | **x1.476** | **30 of 48** | 0.012 CSS px | 0.104 CSS px |
| after: gain removed | **x1.000** | **0 of 48** | 0.010 CSS px | 0.104 CSS px |

(T-103 measured the same effect over its 416-cell portrait grid, R and F:
worst x1.58, 291 of 416 over x1.05.) PENDING-STRETCH-FULL

### The touch deck: the cluster, the stick, and `probe-framing.mjs`

Frame-vs-thumb, two currencies:

- **Authored geometry** (asserted, T-107 domain): RIG's feet on the lowest
  landing deck stay above the right-thumb cluster's top edge at every scroll
  position on faces 1-6, at 844x390, 932x430, 667x375 and 844x350, with and
  without the iPhone's insets (box 3's table).
- **Play** (`thumb-overlap.mjs`, 2 seeds x 4 policies + the oracle racer, 300 s,
  every straight-face frame; `evidence/thumb-overlap.{log,json}`):

| 844x390, share of frames | phone frame, no insets | phone frame, iPhone insets | today's FAR, no insets | today's FAR, iPhone insets |
| --- | --- | --- | --- | --- |
| RIG under the right-thumb cluster | **0%** | **0.02%** (fighter: one frame, falling into a pit, 0.7 px) | 0% | 0% |
| RIG inside the resting stick ghost's circle | 0-2.0% (worst 28 px) | **0.5-4.1%** (worst 30 px) | 0% | 0-**22.7%** (worst 13 px) |
| RIG under main's HUD panels (pre-T-105) | **14.5-25.9%** (worst 131 px) | same panels | 2.3-4.0% (worst 53 px) | same |

Policies: rush / climber / fighter / carried (the oracle racer is lower on
every row). The cluster box is MET in play. The **stick ghost is not met as
"never"**: the larger RIG reaches into the ghost's circle when he stands on
a deck in the left third of the frame — with the iPhone inset 458 of the 464
such frames had his feet above the lowest deck, and the worst frames are y 3
decks at gates (corner state `gate`), where the scroll holds and the policies
hang back. Today's FAR frame has him inside it more often, less deeply.
No lift fixes both this and the head at 5.5-6.5% (they pull opposite ways
across the helix's tilt); a smaller phone RIG, a camera that follows RIG
vertically, or a ghost placed lower would. Reported to the operator (packet
Q5) and as an inbox issue. "Stick zone" is read as the resting ghost (where
the left thumb sits), not T-101's whole left `stickZone` fraction, which RIG
crosses whenever he is in the left ~45% of the frame.

**The HUD row is T-105's lane** — these are main's panels as the probe
measured them (`hudRigPanel` 300x116 at the top-left, `hudObjectivePanel`
320x34 at the top-right), not T-105's phone shell. The closer frame raises
the band into them; T-105's layout has to be measured against this frame on the
merged tree (`thumb-overlap.mjs --hud-from <probe JSON>`).

`tools/simlab/race/probe-framing.mjs` now reads `__HB_TOUCH().layout` (cluster
box, stick ghost, split) from the live T-101 deck instead of the retired
hidden `#touchDeck`. Live run (the row the restart did not cut short,
`evidence/probe-framing.json`, photo `captures/probe-framing-phone-landscape.jpg`),
844x390 with touch, the phone frame (fov 40.09, lift 0.85): the page's edges
equal the race lab's analytic replica to 2.7e-13 tiles (L -25.042, R 40.864);
the deck publishes the right-thumb cluster at x 0.661-0.964, y 0.673-0.970 of
the screen (top edge 262 px), the resting stick ghost at x 0.065-0.204, y
0.632-0.932 and the split at 0.45 — the numbers the T-107 domain asserts
against; main's HUD panels cover x 0.012-0.367, y 0.018-0.315 (RIG panel) and
x 0.609-0.988, y 0.018-0.105 (objective). In the photo RIG fires from the
deck above the FIRE/JUMP cluster. PENDING-PROBE-FRAMING

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
  **Measured consequence:** the ambient spawn trigger (`x < EDGE_R - 1.5`)
  fires 2.5 tiles of scroll later at 1280x720, so table spawns materialise ~4
  tiles inside the right edge instead of ~1.5; T-102's paced gunner then meets
  a held gate on 6 corners instead of main's 5, and on a tree combined with
  T-201's escape hatch on only 2 (a full-tier failure — "T-201 coordination").
  The clean fix splits the edge API in the sim (out of this lane's fence).
- **Static anatomy (entry 3):** nothing in the world moves. The lens and lift
  are set once per calibration; `?orbit=joint` moves only the camera; the veil
  is a static mesh built once (wider). The posed turn captures show the
  arriving face drawn whole at the hand-off (box 4).
- **Half-dose value ladder (entry 14):** untouched (no colour, material or
  light change). The veil is the same painting, mirrored past its old edges.
- **60 fps condition (entry 18):** box 10.
- **Layer purity / determinism:** `src/pure/framing.js` has no three.js, DOM
  or randomness (pathcheck layer guard + T-003/T-049/T-051 per-file guards);
  the sim is untouched.

## Falsification — every new assertion shown to bind

`tools/pathcheck/t-107-phone-framing.mjs`'s static checks were run against a
scratch export of this branch with ONE mutation at a time, then restored
(`evidence/falsification-static.log` for M1-M13, `evidence/falsification-clamp-gain.log`
for M14-M15b on the merged tree; baseline green, green again after the last
restore; the worktree was never mutated):

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
| M14 | render/player.js computes its portrait gain from another aspect (`innerHeight / innerWidth`) | the clamp's gain source guard |
| M15 | no portrait safe inset (`PORTRAIT_SAFE.maxInsetPx` 0 in the lab's copy) | clamp at the drawn size (NDC 1.045, 375x667 touch, gain 1.497) |
| M15b | M15 with the clamp assertion made gain-blind | stays GREEN on the clamp (only the replica-parity check fails, on the mutated copy) — so the gain term is what catches a portrait overhang |

The played checks carry their own falsifiers: the render-only proof's
`momentum=0` runs must differ (14/14 did), and the clamp's analytic check
computes the pre-T-107 route-plane clamp beside it (NDC 1.028 > 1).

## Verification (every command run, with its result)

**After the merge with main `af8bb0b` — the state to review** (host knobs from
`~/.hullbreaker-host.env` in every shell; `HB_GATE_SKIP_BROWSER_PROBE=1` per
the host policy):

| command | result |
| --- | --- |
| `git merge main` (merge commit `cda5057`) | one conflict, `tools/pathcheck/manifest.mjs`: main's d79/d80 (T-103) kept, T-107 is **d83** (d81/d82 left free) |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` (merged) | **4176 passed, 0 failed**; after the clamp-gain strengthening (`d8a3295`) the T-107 domain's static checks are 49/0 |
| `node tools/pathcheck.mjs` (full tier, merged, at `d8a3295`) | **4537 passed, 0 failed** (23 min; 4 browser-probe assertions skipped, not counted) (`evidence/pathcheck-full-merged-af8bb0b.log`) |
| smoke, as `tools/orch/merge-task.sh` runs it: `node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --viewport 480x300` + `smoke-verdict.mjs` | **smoke-verdict: PASS** (outcome=not-completed deaths=0 tick=594/594) |
| same, `scripts/transform-slice.json --max-runtime-ms 20000` | **smoke-verdict: PASS** (outcome=completed deaths=0 tick=938/1104) |
| `phone-framing-probe.mjs --compare` main vs `?view=far`, 844x390 touch, `?juice=0` | **CAMERA IDENTICAL** (17 poses) |
| `void_columns.py` on 24 + 12 desktop posed frames; 12 + 12 phone attribution frames | box 7's tables |
| `turn-pose-capture.mjs`: `?rise=steep` 9 frames at 844x390 touch + 9 at 1280x720; `?view=far` and `?veil=legacy` 6 + 6 at 844x390 touch | every boot passed the art preload gate; 0 errors (page camera = replica at every frame) |
| `rig-boxes.mjs` on the 24 desktop frames | RIG's painted box wholly on screen in all 24 (x 744-1022, y 286-402 of 1280x720; 32.8-40.2 px tall) |
| combined tree (`git merge-tree` of this branch and `task/T-201` `c48ca1e`, scratch export): `HB_GATE_FAST=1 node tools/pathcheck.mjs` | **4235 passed, 0 failed** |
| combined tree: `route-ahead.mjs --viewports phone-landscape,phone-landscape-far,desktop-16x10 --seeds 4` | box 3's combined table (17.6 min) |
| combined tree: `node tools/pathcheck.mjs` (full tier) | **4696 passed, 1 failed** — T-102's coverage guard under T-201's escape hatch at desktop; diagnosed in "T-201 coordination" (`evidence/pathcheck-full-combined-T-201.log`) |
| combined tree, T-201 alone (`git archive c48ca1e`), this branch, main: the paced visible-only gunner, `runTurnProof` direct | the failure reproduced and localized (`evidence/paced-gunner-combined-T-201.json`) |
| falsification M14, M15, M15b (scratch export, one mutation at a time) | all bind (`evidence/falsification-clamp-gain.log`) |
| PENDING-VERIFY-MORE | |

**Before the merge (first session, base `ace6618`) — the runs the box tables
above cite:**

| command | result |
| --- | --- |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` on an untouched `git archive ace6618` (main at dispatch) | **4097 passed, 0 failed** |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` (this branch) | **4151 passed, 0 failed** = 4097 + 48 (T-107 static) + 6 (three existing per-file layer guards — T-003 legibility, T-049 texture names, T-051 backdrop names — now also run over the new `src/pure/framing.js`, and pass) |
| `node tools/pathcheck.mjs` (full tier, this branch, `HB_GATE_SKIP_BROWSER_PROBE=1` per the host policy) | **4511 passed, 0 failed** (15 min 24 s) = 4151 + 295 (T-102's played runs the fast tier skips) + 65 (T-107's played checks); 4 browser-probe assertions skipped, not counted |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` on a scratch merge of this branch onto current main `9bedbaa` (T-103 merged; the manifest conflict resolved with T-107 as **d81**) | **4176 passed, 0 failed** |
| `git merge-tree --write-tree --name-only main HEAD` | one conflict: `tools/pathcheck/manifest.mjs` (both append a domain after d78: T-103's d79/d80 on main, T-107's d79 here). Resolution: keep both, T-107 becomes d81. No other file is changed on both sides. |
| T-107 played checks alone (7 turn runs at the phone frame + render-only) | **65 passed, 0 failed** (`evidence/pathcheck-t107-played-labels.txt`) |
| `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --viewport 480x300` + `tools/orch/smoke-verdict.mjs` (branch) | **smoke-verdict: PASS** (outcome=not-completed deaths=0 tick=594/594) |
| `cd tools/playtest && node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300` + `smoke-verdict.mjs` (branch) | **smoke-verdict: PASS** (outcome=completed deaths=0 tick=938/1104) |
| `node tools/playtest/phone-framing-probe.mjs --compare` main vs branch, 1280x720 / 1920x1080 / 1280x800, `?juice=0` | **CAMERA IDENTICAL** (17 poses x 3, every element) |
| `node tools/simlab/framing/render-only.mjs --seeds 2 --viewports desktop-16x10,phone-landscape --max-game-ms 480000` | 42/42 flagged runs sim-identical, 14/14 falsifier runs differ (16.5 min) |
| `node tools/simlab/framing/zoom-pump.mjs --viewports desktop,phoneLandscapeTouch,phoneLandscape` | table in box 6 |
| `node tools/simlab/framing/route-ahead.mjs` (branch) and `--root <ace6618 export>` (main) | table in box 3 |
| `node tools/simlab/framing/thumb-overlap.mjs --seeds 2 --hud-from evidence/probe-phone-branch.json` | tables in boxes 3 and "the touch deck" (3.7 min) |
| `node tools/simlab/framing/veil-need.mjs`, `vertical-band.mjs` | tables in boxes 3, 7, T-204 |
| `node tools/playtest/turn-pose-capture.mjs` (posed captures: 30 + 6 + 12 frames at 844x390 touch; 24 + 12 at 1280x720, branch and main) | 0 errors (page camera = replica at every frame); every boot passed the art preload gate |
| `node tools/simlab/turnlab.mjs run --policy run --viewport phoneLandscapeTouch` | VICTORY, 6/6 corners, no violations (7.5 s) |
| `node tools/simlab/race/lab.mjs one '{"policy":"rush","seed":1,"viewport":"desktop-16x10","maxGameMs":30000}'` | runs (the race lab's `assertCameraSourceMatches()` passes on this camera.js; it threw on the snapshot) |


## Legacy assertions changed (decisions.md entry 21)

No `tools/pathcheck` assertion was changed, relabelled or deleted. Two
tool-side drift guards were re-pointed because they pinned source text the
fix had to change; the property each guards is kept and now holds through the
shared module:

| file | guard | change | reason |
| --- | --- | --- | --- |
| `tools/simlab/race/edges.mjs` | `assertCameraSourceMatches()` needles `setEdges(probeXAtNdc(-rightNdc), probeXAtNdc(rightNdc))` and `_probe.lookAt(C.lookX, C.lookY - activePortraitLookDrop(), 0)` | replaced by the new call shapes (lens resolution, lifted probe pose, actor-plane clamp) | pinned the pre-T-107 calibration text; the replica now calls `src/pure/framing.js` itself, so "the lab models the page's camera" is enforced by shared code plus the T-107 parity assertion |
| `tools/simlab/lib/sixface-host.mjs` | `edgesForViewport()` (the turn proof's camera) | now the framing module's edges (+ `viewport.touch`) | its route-plane copy would have measured a clamp the page no longer has, at every viewport — green while stale |

## Captures

PENDING-CAPTURES

## Operator packet

Build: this branch merged (or `node tools/serve.mjs <port> --root <this worktree>`).
On the iPhone, hold it in **landscape**; every URL below is `index.html` plus
the query shown. The phone frame needs no flag — it is on for every touch
phone; desktop is unchanged unless a flag says otherwise.

| try | iPhone (landscape) | desktop |
| --- | --- | --- |
| the new default | `index.html` | `index.html` (unchanged camera) |
| A/B: today's phone frame | `index.html?view=far` | — |
| preview the phone frame | — | `index.html?view=phone` |
| A/B: the post-turn camera (unjudged) | `index.html?orbit=joint` vs `index.html` | `index.html?orbit=joint` vs `index.html` |
| A/B: the per-side rise (unjudged) | `index.html?rise=steep` vs `index.html` | `index.html?rise=steep` vs `index.html` |
| A/B: the old corner edges (a defect fix; for reference) | `index.html?veil=legacy` vs `index.html` | `index.html?veil=legacy` vs `index.html` |

Questions (please answer in your own words):

1. On the phone, play a few faces with `index.html`, then with
   `index.html?view=far`. In each, how much of what was coming at you could you
   see in time, and how easy was RIG to keep track of?
2. Right after a corner turn, and on the last stretch at the Crown, how quickly
   do you find RIG? After a turn, what do you notice the camera doing with
   `index.html` versus `index.html?orbit=joint`, and which would you keep?
3. Compare `index.html` and `index.html?rise=steep`: how would you describe the
   climb in each? When you fire straight ahead along the deck, what do the
   shots look like they are doing?
4. On the phone with `?rise=steep`, and when jumping from the highest
   platforms, did the screen cut off anything you needed to see?
5. Where, if anywhere, did your thumbs or the panels at the top of the screen
   get in the way of seeing RIG or the route?

Calls only you can make (not feel questions; each is an inbox issue below with
its numbers): (a) the phone frame shows less route ahead than today's FAR
phone — accept it, or have T-201 give phones a longer follow lead? (b) is
portrait judged by its height (the legacy assertion, which keeps RIG's 1.5x
portrait gain and T-103's stretched arms) or by its short side (which lets the
gain go)? (c) RIG's back is cut by the left edge when the damage plane pins
him — "being crushed", or a framing fault worth a 2-3-tile harder plane?

## PROPOSED INBOX ISSUES

## I-??? | bug | S2 | repro: `node tools/pathcheck.mjs` (full tier) on a merge of task/T-107 and task/T-201; or `runTurnProof({ god: true, reactionMs: 350, policy: 'run', viewport: VIEWPORTS.desktop, gunnerMode: 'paced', paceMs: 1400, maxTicks: 54000, query: 'gates=legacy&follow=0' })` on that tree @ task/T-107 + task/T-201 | evidence: reports/tasks/T-107/evidence/pathcheck-full-combined-T-201.log, paced-gunner-combined-T-201.json
Whichever of T-107 and T-201 merges second will fail one full-tier assertion:
T-102's "the visible-only gunner fought at least three held gates (escape
hatch) or three moving encounters (rolling) per viewport" — at desktop under
`?gates=legacy&follow=0` the paced gunner meets a held gate on 2 corners
(T-201 alone: 5; T-107 alone with held gates: 6). Deterministic; no contract
violated; the shipped rolling default passes (6/6/6). Cause, bisected in
scratch: the ambient spawn trigger (`spawner.js updateSpawner`, `x <
sRightEdge() - 1.5`) — T-107's I-104 clamp moved EDGE_R 2.5 tiles inward at
1280x720, so ambient spawns trigger 2.5 tiles later on desktop; restoring the
old edge for the spawner alone restores the guard (6 held gates), while RIG's
clamp, the patrol box, the dolly and the cohort placement have no effect.
Recommended fix (verified at desktop in scratch): split the edge API —
`setEdges(left, right, viewRight)`, the spawner (and T-201's staging/lead)
on the view edge, RIG's clamp on the actor-plane edge. Alternatives: re-model
the guard (entry 21) or accept the shift. Needs the integrator's call before
the second merge; src/sim is outside T-107's fence.

## I-??? | feel | S2 | repro: `node tools/simlab/framing/route-ahead.mjs --root <export of git merge-tree task/T-107 task/T-201> --viewports phone-landscape,phone-landscape-far,desktop-16x10` @ task/T-107 + task/T-201 | evidence: reports/tasks/T-107/evidence/route-ahead-combined-T-201.{log,json}, route-ahead-*.json
The closer phone frame (operator-approved, entry 20 addendum) shows less route
ahead than today's FAR frame on the same phone. With T-201's follow-lead
(measured on a combined tree), a racer's visible route ahead is 21 tiles at
the median (p10 12) on the phone frame vs 32-35 (p10 27) with `?view=far` —
about desktop FAR's 23.3, which is T-104's phone target (§4.2: lead 18.8 in
the 6% frame), but 11-14 tiles less than the FAR phone. The camera cannot buy
it back without moving the damage plane; T-201's lead can (`leadFrac` 0.3 of
the 65.9-tile phone strip = 19.8; matching the FAR phone needs ~30, RIG just
past mid-frame). Operator's call (packet Q1, call (a)); T-201's lab rows
should be re-taken on the built frame (`phone-landscape`, not the
`phone-landscape-6pct` estimate).

## I-??? | feel | S2 | repro: `node tools/simlab/framing/thumb-overlap.mjs --hud-from <phone-framing-probe JSON of the merged tree>` @ task/T-107 (+ T-105) | evidence: reports/tasks/T-107/evidence/thumb-overlap.{log,json}
With main's HUD (the 300x116 RIG panel at the top-left, the 320x34 objective
panel at the top-right of 844x390), RIG on the phone frame is drawn under a
HUD panel in 14.5-25.9% of straight-face frames per bot style (today's FAR
phone frame: 2.3-4.0%): the closer frame raises the play band into the top
strip. T-105's phone shell owns the HUD; its layout needs this measurement on
the merged tree. If the overlap stays, the HUD is the lever (moving the band
down would put the decks under the thumbs, box 3).

## I-??? | feel | S3 | repro: `node tools/simlab/framing/thumb-overlap.mjs` and the T-107 domain's "stick ring" labels @ task/T-107 | evidence: reports/tasks/T-107/evidence/thumb-overlap.log, pathcheck-t107-static-labels.txt
RIG is drawn inside the resting stick ghost's circle in 0.5-4.1% of
straight-face frames with the iPhone's insets (worst 30 px; today's FAR frame:
0-22.7%, worst 13 px) — mostly on y-3 decks in the left third of the frame at
gates, where the scroll holds. Pressed against the damage plane on the lowest
deck his feet are 38-39 px into the ghost's top (its centre, where the thumb
rests, ~20 px lower). No lift fixes this and the head together at 5.5-6.5%;
a lower ghost (T-101), a camera that follows RIG vertically, or a smaller
phone RIG would.

## I-??? | feel | S3 | repro: `node tools/simlab/framing/thumb-overlap.mjs` @ task/T-107 | evidence: reports/tasks/T-107/evidence/thumb-overlap.log ("head off the top")
On the phone frame RIG's painted head leaves the top of the screen in ~0.2% of
straight-face frames (rush, climber, fighter), by up to 22 px — mid-jump from
face 5's highest surfaces (feet at y 18.6-20.6). Standing on any surface is
asserted inside; a jump apex above the highest surface does not fit together
with the deck above the thumbs at this RIG size. Today's FAR phone frame:
never. Same lever as above (vertical follow), or the operator accepts it.

## I-??? | art | S2 | repro: `?rise=steep` on 844x390 touch, face 5-6 upper lattice near the right clamp; `node tools/simlab/framing/vertical-band.mjs` @ task/T-107 | evidence: reports/tasks/T-107/evidence/vertical-band-helix-vs-steep.log
With the per-side rise (unjudged, off by default) the band tilts ~13 tiles
across a phone frame: RIG's painted head on face 6's highest reachable
surfaces goes 55-61 px above the top of the frame. Desktop fits. A camera that
follows RIG vertically, a partial roll with the grade, or a lower grade on
phones are the options; it is the operator's design call before `?rise=steep`
can become a default.

## I-??? | art | S2 | repro: `index.html?rise=steep`, hold right + fire on face 1 (desktop or 844x390 touch); `tools/playtest/phone-readability-capture.mjs --query rise=steep --marks 9000` @ task/T-107 | evidence: PENDING-STEEPFIGHT-EVIDENCE
With the per-side rise (unjudged, off by default) a level shot no longer
travels along its own barrel. RIG and his gun are only translated by the
ascent, never pitched (render/tower.js placeOnTower), and each projectile body
is drawn along its SIM velocity (render/bullets.js, `atan2(vy, vx)`), while
its position rides the ascent. So the barrel is drawn level and points INTO
the deck 6.6 tiles ahead on face 1 (grade 0.16) and 5.0 tiles ahead on face 6
(0.21) — 17 tiles on today's helix — and the shot climbs away from the
barrel's line at 9.1-11.9 deg (3.5 deg today): 10 tiles out it is 1.6-2.1
tiles above that line, 21-27 px on the phone frame and 26-34 px at desktop
(8-10 px on the helix). The shots do follow the deck (sim-correct: they hit
what stands on it); it is the drawn barrel whose line runs into the slope —
the geometry behind docs/proposals/2026-10-race-to-the-top.md §4.1's "a level
shot along the deck reads as firing into a hillside" (there predicted above
grade ~0.25). Whether it reads that way at 0.16-0.21 is the operator's call
(packet Q3). A render-only fix —
pitch RIG's gun group and each projectile body by the local ascent grade —
lives in render/player.js and render/bullets.js (outside T-107's fence);
needed before `?rise=steep` can become a default.

## I-??? | art | S3 | repro: `index.html?rise=steep`, any straight; posed `tools/playtest/turn-pose-capture.mjs --query rise=steep` @ task/T-107 | evidence: reports/tasks/T-107/captures/t204-lip-steep-1280x720-x6.png, t204-deck-crop-c3-*.jpg
render/level.js rotates each deck tile by the local ascent pitch but stacks a
column's rows straight down (`j + 0.5 + alt`), so every row sits sin(theta)
further along the slope than the one above: the vertical seams jog 1.0 px per
row at 1280x720 on today's helix, 2.9 px on face 3 of `?rise=steep` (0.18)
and 3.4 px at 0.21 (~2.3-2.7 px on the phone frame). At true size the steep
deck reads as a straight slope; magnified, the row boundary under the lit lip
notches about once per tile. Stacking rows along the tile's own normal (or
shearing instead of rotating) removes it; a T-204 follow-up in level.js if
the operator keeps the steep rise.

## I-??? | art | S2 | repro: posed turn captures c5/c6 at 844x390 touch (`tools/playtest/turn-pose-capture.mjs`) + `tools/simlab/framing/rig_crops.py` @ task/T-107 | evidence: reports/tasks/T-107/captures/crown-rig-crops-{main,branch}.png, evidence/rig-contrast-*.json
On the Crown face and its approach the phone frame draws RIG 44% taller
(31 px painted vs 21.5 on today's phone), but his figure-ground contrast does
not change (luminance proxy 0.34 vs 0.39 at the Crown approach +1.5 s): a dark
silhouette against the Crown's lit orange/magenta machinery (T-102's gate
note). The camera's lever is spent; RIG's value/rim treatment against the
Crown (inside entry 14's half-dose ladder) is the art lane's.

## I-??? | art | S3 | repro: render/player.js `portraitActorVisualGain(innerWidth / innerHeight)` on main af8bb0b; `node tools/rig-grip/capture.mjs --views portrait --guns RF` on main vs a copy with `const portraitGain = 1;` @ task/T-107 | evidence: reports/tasks/T-107/evidence/portrait-gain-stretch*.json, captures/portrait-gain-*.png
Portrait already draws RIG's body at 7.0% of the short side (27.4 px at 390
wide) — larger than the landscape phone frame's 5.6% — yet render/player.js
still applies the 1.5x portrait actor gain, which is what stretches T-103's
arms (T-103's own inbox issue asks for this call). One line removes it
(`const portraitGain = 1;`, or `maxGain: 1` in pure/traversal.js) and takes the
worst arm stretch from x1.476 to x1.000 (48 cells; 30 -> 0 over x1.05) with
the hands still on the grip (fist-to-grip <= 0.012 CSS px both ways). Not done in T-107: render/player.js is
RIG presentation (outside the fence), and the change flips a judged legacy
assertion — `tools/pathcheck/pathcheck-suite.mjs` "responsive portrait
composition ... a readable RIG", which pins the gain at 1.5 and RIG at 4-6% of
the portrait HEIGHT with it (3.24% without). The operator's call: is portrait
judged by height (that assertion) or by the short side (T-107's yardstick)?

## I-??? | bug | S3 | repro: `phone-framing-probe.mjs --clamp`, `left-deck` / `left-high` @ task/T-107 and main | evidence: reports/tasks/T-107/evidence/probe-*.json
At the damage plane (EDGE_L) RIG's back is cut by the left frame edge (0 px
gap, main and branch, every viewport): EDGE_L is calibrated on the route plane
while RIG draws 1.15 tiles toward the camera. Calibrating it like the new right
clamp (actor plane + RIG's silhouette) would move the damage plane 2.1 tiles
forward on the phone frame and 2.4-2.9 on desktop / FAR phones — RIG would be
crushed that much sooner, a difficulty change. Left as is (LANE-BRIEF: the
damage plane is a difficulty lever); the operator decides whether a cut RIG at
the plane reads as "being crushed" or as a framing fault.

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

## I-??? | art | S3 | repro: `index.html?view=far` on 844x390 touch, any corner approach (or a 21:9 desktop) @ task/T-107 | evidence: reports/tasks/T-107/captures/r2-attribution-844x390-c1-approach.jpg (top right)
The far veil's extension past each corner (R2's fix) mirrors the face's
painting back on itself. On a wide frame at a corner approach the mirror axis
is in view near the screen edge as symmetric arches. It replaces 10-19% flat
clear-colour columns, so it is the better failure, but a painted extension
(or a second painting chosen per corner) would remove the symmetry. Art lane;
`?veil=legacy` reproduces the old voids for comparison.

## I-??? | tooling | S3 | repro: any `tools/playtest/turn-pose-capture.mjs` frame @ main | evidence: reports/tasks/T-107/captures/turn-phone-*.jpg
The posed-capture tool pauses the page to pose it and leaves the pause card
("TAP TO RESUME" / "PAUSED") in every frame (bottom centre, ~155x30 px at
844x390), so turn evidence carries UI the player never sees mid-turn. The
T-107 probes hide `#overlay` before each photo; the same one line would clean
T-102's tool.

## Worktree, branch, next action

PENDING-END
