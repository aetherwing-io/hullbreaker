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
  frame shows **65.9 x 29.6 tiles** instead of 99.2 x 45.5. The frame is lifted
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

PENDING-SECTIONS
