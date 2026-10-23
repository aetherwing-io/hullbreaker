# T-201 build report — the race pass (follow-lead, corners that never wait, survivors that follow)

Worktree `/home/user/hullbreaker/.claude/worktrees/T-201`, branch `task/T-201`,
base `08e5db1` (the lane was resumed from WIP snapshot `1c65ce5`, rebased onto
`08e5db1` as `aa58d4b`; everything below was re-measured on this tree by the
resuming agent — nothing is carried over from the dead session's notes).
Port 8774 served a pinned `git archive` export of this branch for the browser
capture and the smoke playtests; killed at the end. No base-comparison server
was needed (the "before" numbers come from headless runs of a `git archive`
export of `08e5db1`).

Folds T-201 (visible, fightable, bounded beats), T-202 (follow-lead scroll +
arm on arrival) and T-203 (rolling gates, rewritten for decisions entry 23 #2:
"Keep climbing, they follow — The turn never waits; survivors chase you onto
the next side, so skipping fights costs you pressure instead of time").

**In one paragraph.** The default six-face run now races. The scroll keeps
RIG `lead = clamp(0.3 x live view width, 6, 24)` tiles from the right edge and
blends into each corner's halt exactly as RIG reaches the joint, so a racer
sees a median 18-29 tiles of route ahead on landscape views (5.8 of a 6-tile
lead in portrait) instead of 0-16, and never stands at a closed joint
(worst-side p90 0.03 s, was 5-8 s on landscape views). Corners arm on arrival whatever is
alive; each side's encounter plays its authored teach → test → remix → break
beats on the move (proximity, clear, or a 6 s bound — the 300 s lock is gone
from the default), staged inside the live view at every viewport; the side's
survivors (up to 4) follow RIG round the corner and re-enter on the next side.
A run that never fires now finishes all six sides at every viewport (was:
stuck at the first gate, 24 of 24), and pays for it in hits and fallbacks at
the three landscape viewports — but **not at portrait** (box 5, reported).
The momentum bank saturates on the follow line (entry 11's tension, named);
`CONFIG.player` and the momentum ceilings are byte-identical. The sim-side
zipper is gone (I-105 fixed); with it restored in a scratch copy, the escape
hatches `?follow=0&gates=legacy` reproduce main's trajectories 22 of 22.
`?hinge=flow` (R4) is built, OFF by default, and measured. Full pathcheck
4552/0, per-edit 4155/0, both falsifier tables all red, smoke PASS.

## What changed and why

### 1. Follow-lead scroll (T-202) — ON by default, `?follow=0` restores today's plane

- `src/config.js` `CONFIG.follow = { leadFrac: 0.3, leadMinTiles: 6,
  leadMaxTiles: 24, cornerBlendRate: 0.5 }` — the only config change. No width
  is typed: `src/sim/scroll.js` computes `lead = followLeadTiles(EDGE_R -
  EDGE_L, CONFIG.follow)` from the LIVE edge calibration every frame (T-107
  changes the frame in parallel; asserted by a source check in the T-201
  domain). Today's leads: desktop FAR 16:10 21.95 tiles, FAR phone 844x390 24
  (capped), the lab's estimated closer phone frame 18.77, portrait 6 (floor).
- `src/pure/momentum.js` `followLeadTiles`, `followScrollFloor` (the
  fixtures' follow rule for the six-face run: the scroll advances at least fast
  enough to keep RIG's front `lead` tiles inside the right edge — a FLOOR,
  never a ceiling), `followCornerFloor` (the corner blend, below).
- **The corner blend** (`followCornerFloor`, `cornerBlendRate`). The lead
  alone brings a racer to a closed joint with the scroll 9.2 tiles (desktop) /
  21.6 tiles (FAR phone) short of the corner's halt. I measured what that does
  with the T-102 camera replica: render/camera.js anchors the view at the
  scroll, so the turn would orbit a point 24-37 tiles before the joint instead
  of today's 15, and right after it RIG draws 2-4x their size (desktop 59 px vs
  27 settled; 844x390 56 px vs 15) with the arriving facet out of frame. So on
  the approach to an idle corner the plane also gains 0.5 tiles on RIG per tile
  RIG closes, reaching the halt exactly when RIG's front reaches the joint. The
  corner then arms at its halt the moment RIG arrives (no wait) and the ritual
  frames the turn exactly as today. It never binds on a view whose lead already
  passes the halt (portrait). This replaces the brief's literal "arm on
  arrival" (arming with the scroll short of the halt), which I built first and
  measured as broken framing (above); the box it serves — the racer never
  waits at a joint — is met (box 2).
- Escape hatch `?follow=0` (`src/mode.js FOLLOW_ENABLED`): no floor, no blend,
  no bank re-expression — today's scroll exactly.

### 2. The momentum bank, re-expressed in tiles from the damage plane (entry 11's tension, named)

Entry 11 makes banked daylight the currency of escalation; T-022 reads it as
RIG's fraction of the strip between the plane and the right clamp, and riding
the clamp (frac 0.97-0.99) saturated the bank. Under follow the clamp is never
reached — the lead converts the leading ~30 % of the frame from bank into
lookahead (desktop's maximum daylight drops from ~72 to ~51 tiles) — so the
shipped ramp would cap a racer's bank at ~0.37 and the momentum ceiling would be
unreachable by racing. `momentumLeadBank` (`src/pure/momentum.js`): daylight
(RIG's back to the plane) at or beyond the daylight RIG has when its front
stands on the **follow line** banks fully; anywhere behind it the shipped
fraction ramp runs unchanged, so a player who never reaches the line banks
exactly what they banked before (floor promise) and the carried player's
deadband stays a deadband. The follow line is the lead line, or — approaching
an idle corner — the corner blend's line when that binds first
(`src/sim/scroll.js followLineDaylight`). Without the blend term the
phone-landscape racer's drive never passed 0.67 on any face (the blend binds
over roughly the last half of every side there); with it, it reaches the
ceiling on 5 of 6 faces (oracle@0 seed 1, per-face max 1.00 0.94 1.00 1.00
1.00 1.00; desktop 1.00/0.98-1.00; portrait byte-identical — the blend never
binds there). `CONFIG.momentum` and its ceilings are untouched.

### 3. Corners never wait; the encounter rolls on the move; survivors follow (entry 23 #2) — ON by default, `?gates=legacy` restores held gates

- **Arming.** `armGate` (`src/sim/wavegate.js`) under the rolling default
  sets the corner straight to `approach` when the scroll reaches the halt:
  the joint opens whatever is alive, and the turn fires when RIG reaches the
  bend, exactly as a cleared gate does today. Nothing is retired at arming;
  the encounter keeps fighting until the turn fires.
- **Beats on the move** (`rollingBeatDue`, `src/pure/waves.js`): teach → test
  → remix → break stay the authored beats of `src/pure/level1-ecology-
  encounters.js` (same slots, same reviewed bodies). Beat `j` is released when
  the first of these happens: RIG's front crosses its proximity line (`(beats -
  1 - j) x 15 + 16` tiles before the joint) with its rooted sockets inside the
  staging band and at least 1.5 s after the previous beat; the previous beat is
  cleared (+300 ms breath); or the **stated bound: 6 s** after the previous
  beat, cleared or not. The teach beat also releases on today's scroll prelude
  rule. The 300 s beat lock is gone from the default path (it still governs
  `?gates=legacy`).
- **Every body inside the live view** (`rollingStageBand`, `rollingStageX`):
  bodies are staged against the view at the moment their beat is released —
  at least 6 tiles inside the damage plane (plus the plane's advance over the
  entrance at its current speed, so the margin should still hold when the body
  becomes shootable; box 4 shows where it falls short), 1.5 tiles inside the
  right edge, short of the corner pivot. An authored socket is used verbatim when it lies inside the
  band; otherwise the body is displaced into it (rooted bodies onto the
  nearest authored mount in band, `rollingMount`; hounds onto a deck,
  `rollingHoundDeck`). Nothing is staged while the camera anchor is still
  behind the last bend (`viewOnFacet`): until the scroll crosses the bend the
  arriving facet is drawn skewed and the sim's strip overstates what is in
  frame by ~0.6 tiles per tile of lag (measured with the T-102 camera
  replica). This is what lets the held-gate rule `retireUnseenGateRows` (it
  fired for any aspect <= ~1.15) go: it now runs only under `?gates=legacy`.
- **Carry-over** (`beginPursuit`, `updatePursuers`): when the turn fires, the
  side's encounter bodies still alive — and mobile slots the racer outran —
  follow RIG round the corner, at most `carryMax = 4` (pillar 5), ranked own
  gating survivors first, then other own survivors, then outran mobile slots
  (spawned as the same reviewed bodies), then earlier followers. Ambient
  bodies and everything over the cap leave through the existing gate-break
  exit, as at a legacy turn. Followers are dormant (unshootable, hidden)
  during the ritual and re-enter on the arriving facet once the corner is done
  and the camera anchor has crossed the bend, 150 ms apart, preferably 4-14
  tiles ahead of RIG, each with an ordinary entrance tell; one that finds no
  room within 4 s is dropped and counted. Corner 6 (the Crown approach)
  carries nothing. The price of skipping is pressure (entry 12), never time.
- **HUD encounter line** (`rollingEncounterText`, `src/ui/hud.js`
  gate/encounter line only): what is on RIG now, what is inbound, who followed
  round the last corner — never a kill requirement; every string fits the
  ~28-character slot (asserted over 67 200 states). "BROKEN" is never shown
  while an encounter body is alive.
- All tuning lives in `ROLLING_GATES` (`src/pure/waves.js`), not `CONFIG`,
  because this lane's fence limits `src/config.js` to the follow block. Moving
  it into `CONFIG.waves` is a mechanical follow-up.

### 4. R4 A/B: `?hinge=flow` (unjudged, OFF by default)

`cornerJointRule(..., flowOpen)` (`src/pure/waves.js`) and `hingeFlowOpen`
(`src/sim/wavegate.js`): after the camera hand-off (690 ms; the sim's
`FOLD_HANDOFF_PROGRESS` is asserted equal to render/camera.js's) the turning
joint opens forward and RIG may run on; before it the arriving facet is not
drawn yet, so RIG stays on the hinge exactly as in the default. Measured below.

### 5. Sim-side zipper removal (entry 25, I-105)

- `src/sim/wavegate.js`: `updateZipper` and its call are gone.
  `src/pure/waves.js`: `zipperOffset` and the zipper rules are gone.
- `src/sim/level.js` (zipper state only): the six-face run never unbuilds a
  column (no build schedule, no settle); `builtSolidAt`/`builtGroundTopAt` are
  therefore the plain geometry queries there. The **traversal slice** keeps the
  faces beyond its play area inert (marked once at reset, never settled),
  matching its renderer, so the slice's behaviour is unchanged.
- I-105 is fixed in the sim: the pre-bend column (the deck RIG fights every
  corner from) is no longer a hole for capsule floors, wasp dive floors, flame
  crawl and bullet terrain (re-modelled assertion in
  `future-facet-render-ownership.mjs`, below).
- **T-121 has not merged** (main `9bedbaa`: its review is APPROVE, no merge),
  so every render consumer of a sim export is left intact: `slamSets`,
  `farSets`, `columnBuilt`, `levelBuildRevision` and the `view.level`
  hooks (`unbuiltHidden`, `faceRevealed`) still exist; `render/level.js`'s
  `?zip=1` branch still reads `slamSets`/`farSets`. T-121 deletes them.

### 6. Labs, replicas and tools (dev-only; zero effect on the game)

- **Race lab** (`tools/simlab/race/`): `run-child.mjs` records per corner the
  arrival time, hold at the joint, survivors at the turn, followers,
  re-entries seen in view, beat log and beat gaps; staging against the live
  view for every staged/re-entering body; `framesFollowNear` (frames either
  follow term could act on, computed identically with the follow-lead off);
  `simDigest` (a trajectory-only digest comparable across trees and queries);
  `unbuiltAtTurns`; a 0.1-tile route-ahead histogram (portrait's lead is 6 and
  the old 1-tile bins floor 5.8 to 5). `lab.mjs` gains `--query`,
  `--viewports`, `--policies` and the new aggregate columns; `policies.mjs`
  gains `skip` (rush's movement, trigger never pulled).
  New: `stage-view.mjs` (the played successor of `gate-view.mjs`),
  `replica-agree.mjs` (race lab vs turnlab on one frame-exact schedule),
  `race-falsify.mjs` (mutation table for the T-201 domain),
  `corner-capture.mjs` (the phone check, played from boot).
- **Turnlab** (`tools/simlab/lib/turn-proof.mjs`, `sixface-host.mjs`,
  `turnlab-falsify.mjs`): the never-wait family (below), gunner `none`, the
  `run` policy made competent at run speed (under follow RIG runs whole sides
  at the frozen run speed instead of riding the scroll at the clamp; the old
  reflex fell into the face-4 pocket pit and the god-mode crush pin then
  dragged RIG one tile per column — a harness artefact recorded as TURNLAB.md
  limitation 8 and a proposed inbox issue), and falsifier rows Z1, N1-N6 and
  N8 (no N7: see the falsification tables).

## Acceptance boxes — measured before / after, and how each was falsified

"Before" is `08e5db1` (main at the lane's base; `git archive` export, the lab
tools copied in), "after" is this branch. Lab numbers are `node
tools/simlab/race/lab.mjs baseline --seeds 6` on each tree (160 runs each:
rush, climber, fighter, carried, skip x 6 seeds, idle, oracle@0/1500/3000 x 3
seeds, at the four lab viewports; 60 Hz fixed step, every default verb on).
Before: digest `2acfb162`, 1407 s; after: digest `6da0adf5`, 1863 s. Cells
are `median [min-max]` unless stated. The lab's `phone-landscape-6pct` row is
an ESTIMATE of T-107's closer phone frame (RIG at 6 % of screen height), not a
shipped frame.

### Box 1 — Sight (racer median route-ahead >= 0.9 x lead; <= 5 % of moving frames under 3 tiles) — MET

| viewport (lead; 0.9 x lead) | before: median / share < 3 | after (3 seeds, 1-tile bins) | after (seed 1, 0.1-tile bins) | `?follow=0` on this branch (falsifier) |
| --- | --- | --- | --- | --- |
| desktop 16:10 (21.95; 19.76) | 6 / 44 % | 21 / 3 % | 21.7 / 3.0 % | 4.1 / 47.5 % |
| phone 844x390 (24; 21.6) | 16 / 39 % | 28 / 3 % | 28.9 / 3.4 % | 17.1 / 38.4 % |
| phone 6 % estimate (18.77; 16.89) | 1 / 53 % | 18 / 2 % | 18.6 / 2.1 % | 2.5 / 51.8 % |
| portrait 390x844 (6; 5.4) | 0 / 98 % | 5 / 3 % (bins floor 5.8 to 5) | 5.8 / 3.5 % | 0.3 / 97.5 % |

Guard: T-201 domain `[oracle@0 vp] SIGHT` (fine bins, all four viewports;
falsifier F1 — floor never applied — goes red: "median 6.4 tiles … 41.9 %
under 3").

### Box 2 — Wait at a joint (racer and rush p90 <= 0.5 s before the corner arms, every side, every viewport) — MET

Worst side's p90 of (corner armed − RIG first at the joint), seconds:

| viewport | oracle@0 before → after | rush before → after | oracle@0 with `?follow=0` on this branch (falsifier), per side |
| --- | --- | --- | --- |
| desktop | 5.90 → 0.03 | 6.49 → 0.03 | 6.00, 5.87, 5.80, 5.83, 5.88, 5.90 |
| phone 844x390 | 7.70 → 0.03 | 7.98 → 0.03 | 7.28, 6.65, 7.57, 4.95, 7.65, 7.47 |
| phone 6 % | 5.20 → 0.03 | 5.60 → 0.03 | 5.25, 5.15, 5.10, 5.23, 4.98, 5.15 |
| portrait | 0.35 → 0 | 0.41 → 0 | 0.35, 0.35, 0.33, 0.33, 0.35, 0.35 |

Guard: domain `WAIT` (racer, 4 viewports); F2 (corner blend removed) red.

### Box 3 — Never-wait corners (held <= 0.2 s + ritual for EVERY policy; no-fire completes six sides; survivors present on the next side) — MET

- **Hold after arrival** (pressing into a closed joint), worst side's p90 over
  every policy group (rush, climber, fighter, carried, skip, oracle@0/1500/
  3000) — after: <= 0.03 s at desktop, 844x390 and portrait, <= 0.05 s at 6 %;
  no corner entered a held state in any of the 160 runs (gate-held 0 s
  everywhere). Before: up to 6.4 / 8.5 / 6.1 / 1.2 s pressing at the joint,
  plus held gates (per-side medians up to 161 s).
- **No-fire policy** (`skip`, rush's movement, trigger never pulled):
  after 24 of 24 runs VICTORY with 6/6 sides (97-107 s median per viewport);
  before 24 of 24 timed out at 600 s with 0 sides (stuck at the first held
  gate). Turnlab's never-firing `run` reaches VICTORY at 1280x720, 844x390
  and 390x844 with every family clean (T-102 domain, full tier).
- **Survivors follow, counted** (followers / seen re-entering inside the view,
  per corner 1-5, medians): skip 4/4 at every corner at every viewport; rush
  2-4; carried 0-4; oracle@0 0-2 (it kills almost everything). Over all 160
  after runs: 2111 followers, 2111 re-entered, 2111 seen condensing inside
  the view, 0 dropped. Corner 6 (the Crown approach) carries nothing by
  design.
- **Falsified**: `?gates=legacy` — the no-fire run is held at the first joint
  587 s and times out at 0 sides at all four viewports; F3 (a rolling corner
  holds like a gate) → "NO SOFTLOCK … timeout after 600 s with 0/6 corners";
  F4 (survivors vanish) → "followed/seen 0/0 0/0 0/0 2/2 0/0"; F5 (never
  re-enter) → "4/0 4/0 4/0 4/0 4/0"; turnlab N1, N3, N4, N8.

### Box 4 — Visible beats (0 staged outside the view at every viewport; none < 6 tiles from the plane at landscape; stated bound) — MET at staging, with one caveat

`node tools/simlab/race/stage-view.mjs <baseline.json>` (played successor of
`gate-view.mjs`: every encounter body and follower, against the live view at
the frame it begins to condense, and again the frame it becomes shootable):

| viewport | bodies staged (after) | outside the view: before → after | < 6 tiles from the plane at staging: before → after (nearest) | < 6 tiles when shootable: before → after (nearest) |
| --- | --- | --- | --- | --- |
| desktop | 1899 | 0 → 0 | 0 → 0 (9.0) | 0 → 0 (8.1) |
| phone 844x390 | 1965 | 0 → 0 | 0 → 0 (20.5) | 0 → 0 (19.6) |
| phone 6 % | 1914 | 0 → 0 | 193 → 0 (6.01) | 152 → **30** (5.23) |
| portrait | 1553 | 200 → 0 | 546 → 1 (6.00) | 414 → 403 (0.63; portrait is exempt from the 6-tile rule) |

The 6-tile rule holds where it is applied (staging). At the 6 % frame 30 of
1722 bodies (1.7 %) drift to 5.2-6.0 tiles by the time they become shootable:
the band adds the plane's advance at its CURRENT speed over the entrance, and
the follow-lead can speed the plane up mid-entrance when RIG breaks into a run.
Reported, not hidden; a proposed fix is in the inbox issues (bound the advance
by RIG's run speed).

**Stated bound: 6 s** (`ROLLING_GATES.beatBoundMs`). Longest observed wait in
the 160 after runs: 6.017 s (the bound plus one frame). 81 of 3041 beat
releases (2.7 %) came from the bound — the fighter policy at every viewport,
carried at 844x390, skip at desktop seeds 1 and 3, idle; the rest by proximity
(2274), clear (569) or the teach prelude (117).
`gate-view.mjs` itself (static: the authored sockets against the view HELD at
the halt — today's `?gates=legacy`) is unchanged from main: 27 of 39 sockets
outside the held portrait view, 13 within 6 tiles of the plane at the 6 %
frame. Guards: domain `VISIBLE`/`BEATS` (oracle, skip, carried runs), turnlab
`stagedOutsideView`/`carriedInvisible`/`beatOverBound` on the projected frame;
falsifiers F6 (9 staged outside at 6 %), F7 (pure), F7b (skip @desktop under
the 300 s lock: 6.6 s), turnlab N2 (`stagedOutsideView` x22 at 390x844), N3.

### Box 5 — Price is pressure — MET at the three landscape viewports, NOT MET at portrait

Same movement, with and without the trigger (`rush` vs `skip`), hits and
HULL FALLBACKs per run, after:

| viewport | skip hits | rush hits | skip fallbacks | rush fallbacks |
| --- | --- | --- | --- | --- |
| desktop | 15.5 [14-16] | 11 [7-12] | 7 [6-8] | 5 [3-6] |
| phone 844x390 | 13 [11-17] | 7.5 [6-11] | 6 [5-8] | 3 [3-5] |
| phone 6 % | 17.5 [15-18] | 10.5 [8-12] | 8 [6-8] | 4.5 [4-5] |
| portrait | **5 [3-8]** | **6 [6-8]** | **2.5 [1-3]** | **3 [2-3]** |

At portrait skipping costs nothing measurable: the re-entry band there is
about one tile wide just ahead of RIG (`rigX + 4 .. R − 1.5` on a 19-tile
view with a 6-tile lead), so followers condense in RIG's path and are run
past before their 0.9 s entrance ends. Before, skip took 0-3 hits because it
never got past the first gate. The `fighter` policy (stands in every fight) is
not the comparator here — it takes the most hits of all (30-56 per run) — but
it shows the other half of the box: fighting is no longer punished by time.

**A policy that fights well clears sides faster than today** (per-side seconds,
medians, sides 1-6):

| group @ viewport | before | after |
| --- | --- | --- |
| oracle@1500 @ desktop | 27.7 / 18.1 / 26.4 / 28.4 / 28.8 / 25.7 (victory 160.8 s) | 14.6 / 11.8 / 12.8 / 13.7 / 12.8 / 13.2 (95.8 s) |
| oracle@1500 @ 844x390 | 21.3 / 18.5 / 27.9 / 29.2 / 27.6 / 25.1 (158.6 s) | 14.8 / 11.7 / 12.1 / 11.8 / 11.9 / 12.5 (92.0 s) |
| oracle@1500 @ 6 % | 20.8 / 18.3 / 18.2 / 28.3 / 19.3 / 26.0 (146.9 s) | 15.1 / 12.4 / 12.1 / 11.8 / 13.4 / 13.2 (92.8 s) |
| oracle@1500 @ portrait | 25.2 / 20.8 / 22.6 / 23.5 / 18.0 / 23.8 (152.6 s) | 13.6 / 10.7 / 10.7 / 13.1 / 11.6 / 12.2 (92.0 s) |
| fighter @ desktop | 26.2 / 27.1 / 92.4 / 40.5 / 130.2 / 87.1 | 24.9 / 22.2 / 37.4 / 26.3 / 35.4 / 35.0 |

Falsified: F4 (survivors vanish) and F5 (never re-enter) turn the domain's
`PRESSURE` red.

### Box 6 — Floor promise (fingerprints identical where neither term binds) — MET

`carried` seeds 1-3 at desktop and the 6 % frame, default vs `?follow=0`: all
six pairs have 0 frames where either follow term (or the bank's saturation on
the follow line) could act, and all six trajectory digests are identical
(desktop `6e6314f6`, `4aac4efe`, `d1b609ba`; 6 % `cc667ce4`, `e0e017f8`,
`4a083e63`). Guard: domain `FLOOR`; F9 (the term binds every frame) red
("28d4e072 != 6e6314f6").

### Box 7 — The turnlab proof (t-102-corner-turns.mjs, both tiers) — MET

Full tier (50 runs) and per-edit tier (5 runs) green inside `node
tools/pathcheck.mjs` / `HB_GATE_FAST=1 node tools/pathcheck.mjs` (results
below). Envelope, hinge, turn, facet, ratchet and framing families pass on
every run, default and hatch; the held-gate family runs verbatim on the
`?gates=legacy` runs; on default runs it is REPLACED by the never-wait family
(table "Legacy assertions replaced" rows 7-11), each shown red by its own row.

### Box 8 — Both lab replicas updated, drift guards green, agreeing — MET

See "Replica agreement" below: 6 of 6 configurations MATCH field for field.

### Box 9 — Hard rules — MET (see "Hard rules" below)

### Box 10 — Phone check — MET (see "Phone check" below)

### Box 11 — Operator packet — below

## Legacy assertions replaced (entry 21: name, reason, replacement, shown red)

| # | Old assertion (file) | Why it went | Replacement | Red on the defect it guards |
| --- | --- | --- | --- | --- |
| 1 | The eight `zipperOffset` schedule pins in `tools/pathcheck/pathcheck-suite.mjs` ("column 0 hidden before impact frame", "column 0 starts 2.75 above", "gravity ease: u=0.5 -> 75 percent of drop remains", "column 1 starts exactly 16 ms later", "one-beat dip after landing", "column locks to base after dip", "last slam column lands at 820 ms, before the event ends", "zipper fully locked … before scroll resumes") | They pinned the brick-slam zipper's schedule, deleted from the sim with entry 25. Their protected property — the arriving face is whole before the scroll resumes — now holds by construction. | `t-201-race-pass.mjs` played "[oracle@0 vp]: every column exists through a played turn" (0 unbuilt ground columns anywhere in the level at all 12 turn starts and ends of the racer's run; 4 viewports) and static "the sim keeps no zipper: no build schedule, no settle, no zipper hook call" | F15 ("430 unbuilt ground columns"), F14 |
| 2 | `future-facet-render-ownership.mjs` ~l.43 "the built current hull survives while the pre-bend construction edge stays hidden" | It asserted the zipper-era hole at the pre-bend column (I-105) as intended. | "T-201: the pre-bend column (the deck RIG fights from) is built in the sim and drawn before the turn", read from the sim's own `columnBuilt` after the boot/reset row | L1 |
| 3 | `future-facet-render-ownership.mjs` ~l.64 "?zip=1: handoff frame retains its 19 built arrival columns and leaks zero future rows" | It modelled the zipper build schedule (19 columns built at the 690 ms hand-off) with `zipperOffset`. Protected property (dispatch item 4): at the hand-off the default reveal draws the whole arriving facet and nothing beyond it. | "T-201: at the 690 ms handoff the default reveal draws all 88 arrival rows and leaks no other facet", with the sim's `columnBuilt` | L1 ("got 0 of 88, 2 leaked") |
| 4 | `catwalk-built-prefix-visibility.mjs` ~l.52: "regression pins a real partially built catwalk inside the 690–1100 ms handoff interval", "the real construction frame keeps its one built segment and withholds four tail segments", "the draw frontier lands exactly at route s=…" | Same zipper schedule, driven through the real `pocket-shelf-f3` catwalk that straddled the zipper strip edge. | Same catwalk: "regression drives the real five-segment pocket-shelf-f3 catwalk…", "T-201: at the corner-2 handoff its arriving catwalk is drawn whole (5 of 5 segments), not a construction prefix", "T-201: before that handoff none of it is drawn" | L2 ("2 of 5 segments") |
| 5 | `t-102-corner-turns.mjs` static "?zip=1 keeps its assembling reveal" | T-102's pin of the retired flag's construction rows; the sim no longer keeps them. | "T-201: with no sim build state, even the retired ?zip=1 branch of routeRenderable draws the whole arriving facet at the handoff (88 of 88 rows)" | turnlab Z1 (replaces T-102's P4) |
| 6 | `t-009-static-anatomy-reveal-default.mjs` "the gate runtime still drives the zipper timeline for ?zip=1" | Entry 25 deleted the zip corner's sim half. | "T-201: the gate runtime drives no zipper timeline" (inverted static check) | putting `updateZipper`/`zipperOffset` back in wavegate.js (static regex) |
| 7 | turnlab gate family on DEFAULT runs: `gateShutWithKillConditionMet` | A rolling corner has no kill condition. The promise "the climb never stalls on something the player cannot act on" becomes "a closed joint never holds RIG". | `turnWaitedAfterArrival` (pressing into a closed joint > 200 ms), `gateStateInRolling` (a rolling corner entering the held-gate state) | N1, N8 |
| 8 | turnlab gate family on DEFAULT runs: `gateBlind`, and the D2 row (portrait softlock) | No held view exists to be blind in. D2's property — nothing the player must deal with sits where they cannot see it, and no beat parks behind an unseen holder — restated for a live view. | `stagedOutsideView` (every staged body begins condensing inside the PROJECTED frame), `carriedInvisible` (every follower re-enters inside it), `beatOverBound` (no beat waits > 6 s, a beat still waiting at the turn included). The D2 run (paced visible-only gunner @390x844) stays in both tiers with these. | N2, N3; `beatOverBound` only via the race lab's identical check (F7b, F7) — no turnlab policy starves a beat |
| 9 | turnlab gate family on DEFAULT runs: `hudLastButMore`, and the D5 row | The rolling line states no kill requirement, so "LAST SIGNAL" cannot lie; "the HUD never lies about what remains" becomes "never BROKEN while a body is alive, and the line fits its slot". | `hudBrokenButAlive`, `hudTooLong` | N5, N6 |
| 10 | (new) | Survivors must reappear. | `carryLost` (a follower neither re-entered nor dropped-and-counted by the next corner's turn) | N4 |
| 11 | `haltedButIdle` | Kept in both families: the corner still arms at its halt. | — | M4 (default runs) |
| 12 | `gate-prelude-runtime.mjs` (every scenario), the legacy half of `t-009-non-gating-station-cannot.mjs`, T-102's rows P2/P5/M3/M13 and the turnlab gate family | They describe the HELD gate, which is now the `?gates=legacy` hatch: kept verbatim, run on the hatch. `t-009-non-gating-station-cannot.mjs` also asserts the default corners reach `approach` (never a held gate). | — | P2, P5, M3, M13 on `gates=legacy&follow=0` |
| 13 | `momentum-earned-pace-escalation.mjs` probes and `t-029-runtime-truth-three-debug.mjs`'s right-clamp telemetry probe | They hold RIG at the right clamp, which the follow-lead makes unreachable. | The T-022 probes run on `?follow=0` (T-022's own model); lead-line twins (`HB_MOM_PLACE=lead`) assert the re-expressed bank is byte-identical behind the line and saturates on it; a racing probe asserts the plane never outruns RIG's run speed | F10, F16 and the pure bank assertions |

## Distributions (entry 19: best / worst / median / spread, per policy and viewport)

`median [min-max]` per run, before → after (spread = max − min); 6 seeds per
bot policy, 3 per oracle latency; `run s` is capped at 600 s (T = still alive
at the cap).

| policy | viewport | outcomes (V victory, T 600 s timeout, GO game over) | run s | hits | fallbacks | lives lost | kills |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rush | desktop | 6 T → 6 V | 600 [600-600] → 102.9 [99.6-105.8] | 36 [22-45] → 11 [7-12] | 16.5 [9-21] → 5 [3-6] | 1 [0-2] → 0 [0-0] | 44.5 [34-56] → 33 [29-41] |
| climber | desktop | 2 V 4 T → 6 V | 600 [345.9-600] → 97.8 [96.1-98.4] | 30 [26-35] → 4.5 [4-6] | 13.5 [11-16] → 2 [1-2] | 1 [1-2] → 0 [0-0] | 38 [36-55] → 37.5 [35-40] |
| fighter | desktop | 4 T 2 V → 3 T 3 V | 600 [401-600] → 473.4 [195.7-600] | 43 [26-59] → 30 [8-42] | 18.5 [13-28] → 14 [3-21] | 1 [0-2] → 0 [0-1] | 80 [58-89] → 90.5 [40-110] |
| carried | desktop | 6 T → 6 V | 600 [600-600] → 188.3 [186.6-191.1] | 40.5 [32-60] → 35.5 [31-39] | 19 [16-29] → 17.5 [15-19] | 1 [0-2] → 0 [0-0] | 70.5 [58-86] → 69 [56-77] |
| skip | desktop | 6 T → 6 V | 600 [600-600] → 106.2 [102.3-111.8] | 2 [2-3] → 15.5 [14-16] | 0 [0-1] → 7 [6-8] | 0 [0-0] → 0 [0-1] | 0 [0-0] → 1 [1-1] |
| oracle@0 | desktop | 3 V → 3 V | 134.7 [134.7-136.2] → 90.9 [84.7-90.9] | 1 [1-1] → 3 [0-3] | 0 [0-0] → 1 [0-1] | 0 [0-0] → 0 [0-0] | 138 [138-145] → 118 [116-118] |
| oracle@1500 | desktop | 3 V → 3 V | 160.8 [160.5-164] → 95.8 [94.1-97.6] | 9 [8-9] → 10 [7-12] | 4 [3-4] → 4 [3-6] | 0 [0-0] → 0 [0-0] | 106 [104-107] → 112 [110-113] |
| oracle@3000 | desktop | 3 V → 3 V | 204.8 [204.8-210.4] → 100.4 [100.3-101] | 15 [15-17] → 11 [10-12] | 7 [7-8] → 5 [5-5] | 0 [0-0] → 0 [0-0] | 113 [112-116] → 108 [107-108] |
| rush | 844x390 | 5 T 1 GO → 6 V | 600 [243.4-600] → 103.1 [100.4-107.6] | 33 [28-48] → 7.5 [6-11] | 14.5 [12-22] → 3 [3-5] | 1.5 [1-3] → 0 [0-0] | 52.5 [44-57] → 35 [29-43] |
| climber | 844x390 | 5 T 1 V → 6 V | 600 [418.2-600] → 97.1 [96.4-97.4] | 34 [26-51] → 4 [3-4] | 15.5 [11-24] → 2 [1-2] | 2 [1-2] → 0 [0-0] | 54.5 [46-65] → 29.5 [27-31] |
| fighter | 844x390 | 6 T → 5 V 1 T | 600 [600-600] → 237.4 [200.7-600] | 27.5 [10-41] → 30.5 [12-39] | 12.5 [4-19] → 15 [5-19] | 1 [0-2] → 0 [0-1] | 52 [50-55] → 95 [39-104] |
| carried | 844x390 | 6 T → 6 V | 600 [600-600] → 197.1 [195.3-200.6] | 30 [7-38] → 37.5 [34-45] | 13 [3-17] → 17 [16-21] | 1 [0-2] → 1 [0-2] | 44.5 [9-50] → 63 [58-65] |
| skip | 844x390 | 6 T → 6 V | 600 [600-600] → 104.4 [101-110.2] | 3 [3-3] → 13 [11-17] | 1 [1-1] → 6 [5-8] | 0 [0-0] → 0 [0-0] | 0 [0-0] → 1 [1-1] |
| oracle@0 | 844x390 | 3 V → 3 V | 136.9 [136.9-143.1] → 88.6 [85.8-88.6] | 0 [0-0] → 1 [1-1] | 0 [0-0] → 0 [0-0] | 0 [0-0] → 0 [0-0] | 158 [158-166] → 124 [122-124] |
| oracle@1500 | 844x390 | 3 V → 3 V | 158.6 [155.5-182] → 92 [90.5-93.2] | 4 [2-6] → 4 [4-6] | 1 [1-3] → 2 [2-2] | 0 [0-0] → 0 [0-0] | 107 [107-120] → 92 [92-92] |
| oracle@3000 | 844x390 | 3 V → 3 V | 198.4 [198.3-216.6] → 100 [97.1-100.1] | 14 [13-15] → 10 [6-10] | 7 [6-7] → 4 [3-5] | 0 [0-0] → 0 [0-0] | 102 [100-107] → 91 [88-91] |
| rush | 6 % | 5 T 1 GO → 6 V | 600 [170.3-600] → 101.6 [99.7-103.8] | 30 [22-39] → 10.5 [8-12] | 13 [8-18] → 4.5 [4-5] | 1 [0-3] → 0 [0-0] | 39.5 [17-55] → 27.5 [21-38] |
| climber | 6 % | 3 T 3 V → 6 V | 512.1 [401.8-600] → 96.5 [95.1-97.1] | 38 [25-44] → 4 [4-7] | 18 [10-20] → 2 [1-3] | 1 [0-2] → 0 [0-0] | 42 [36-50] → 30 [17-32] |
| fighter | 6 % | 3 T 2 V 1 GO → 3 V 3 T | 539.6 [183.7-600] → 448.7 [201.5-600] | 41.5 [18-51] → 30 [5-42] | 20 [6-25] → 15.5 [2-21] | 1 [0-3] → 0 [0-1] | 81 [34-106] → 84 [42-107] |
| carried | 6 % | 2 GO 3 V 1 T → 6 V | 489.1 [334.2-600] → 184.9 [181.8-188.5] | 52 [24-59] → 41 [32-43] | 24.5 [9-28] → 19.5 [16-21] | 2 [0-3] → 0 [0-0] | 77.5 [33-82] → 72 [57-80] |
| skip | 6 % | 6 T → 6 V | 600 [600-600] → 106.7 [102.6-109.6] | 1 [1-2] → 17.5 [15-18] | 0 [0-1] → 8 [6-8] | 0 [0-0] → 0 [0-1] | 0 [0-0] → 1 [1-1] |
| oracle@0 | 6 % | 3 V → 3 V | 133.7 [133.7-140.7] → 88.7 [88.7-90.3] | 0 [0-2] → 1 [0-1] | 0 [0-0] → 0 [0-0] | 0 [0-0] → 0 [0-0] | 145 [141-145] → 124 [124-125] |
| oracle@1500 | 6 % | 3 V → 3 V | 146.9 [145.8-154.5] → 92.8 [92.1-97.4] | 10 [8-11] → 9 [7-11] | 5 [4-5] → 4 [3-5] | 0 [0-0] → 0 [0-0] | 104 [102-106] → 115 [115-116] |
| oracle@3000 | 6 % | 3 V → 3 V | 205.1 [199.7-211.1] → 101.5 [100-102.1] | 11 [10-16] → 14 [12-14] | 5 [5-8] → 6 [6-7] | 0 [0-0] → 0 [0-0] | 119 [119-122] → 114 [114-115] |
| rush | portrait | 2 V 4 T → 6 V | 600 [177-600] → 92.3 [90.6-94] | 13 [10-19] → 6 [6-8] | 5.5 [4-9] → 3 [2-3] | 0 [0-1] → 0 [0-0] | 15.5 [12-35] → 20 [18-22] |
| climber | portrait | 3 T 3 V → 6 V | 397.2 [169.5-600] → 89.9 [89.4-90.3] | 12 [6-14] → 7.5 [6-8] | 5.5 [2-7] → 3 [2-4] | 0 [0-1] → 0 [0-0] | 21 [11-33] → 18 [14-19] |
| fighter | portrait | 6 GO → 3 V 3 GO | 137.6 [77.9-263.5] → 191.4 [144.7-204.6] | 28 [16-61] → 56 [44-60] | 11 [5-29] → 27 [19-28] | 3 [3-3] → 2.5 [1-3] | 39.5 [27-57] → 79 [50-91] |
| carried | portrait | 3 V 3 GO → 3 V 3 GO | 225.1 [160.6-305.5] → 157.6 [147.5-161.6] | 47 [34-54] → 41 [36-44] | 20.5 [14-25] → 18 [17-19] | 2.5 [0-3] → 2.5 [1-3] | 47.5 [28-56] → 44 [37-59] |
| skip | portrait | 6 T → 6 V | 600 [600-600] → 97.3 [93.8-98.5] | 0 [0-0] → 5 [3-8] | 0 [0-0] → 2.5 [1-3] | 0 [0-0] → 0 [0-0] | 0 [0-0] → 1 [1-1] |
| oracle@0 | portrait | 3 V → 3 V | 125.5 [124.1-127] → 88.1 [86.5-88.9] | 2 [2-2] → 2 [2-2] | 0 [0-0] → 0 [0-0] | 0 [0-0] → 0 [0-0] | 130 [130-132] → 131 [127-132] |
| oracle@1500 | portrait | 3 V → 3 V | 152.6 [150.8-157.1] → 92 [87.5-94.3] | 8 [6-10] → 4 [4-6] | 4 [3-4] → 2 [2-3] | 0 [0-0] → 0 [0-0] | 77 [66-83] → 50 [44-58] |
| oracle@3000 | portrait | 3 V → 3 V | 172.9 [168.4-172.9] → 90.9 [86.8-93.8] | 8 [8-10] → 6 [4-6] | 4 [3-5] → 2 [2-3] | 0 [0-0] → 0 [0-0] | 41 [35-43] → 32 [30-38] |

Reading it:

- Every bot policy except `fighter` now finishes every run at every
  landscape viewport (before: 1-3 of 6, or none). `carried` at portrait still
  loses 3 of 6 to deaths, as before.
- `fighter` still times out 7 of 24 (before: 15 of 24, all inside held gates).
  Now every timeout sits in the corner's `approach` state with the joint OPEN
  for 455-533 s: the target-first bot stands on a deck aiming level at a hound
  prowling on the deck below and never walks the last tiles (fighter seed 6
  @desktop, snapshots at 120 / 150 / 199 s: RIG x 262.35 y 7.5 holding
  left + fire; the side's hound at x 256-257, y 3.45). A bot-aim artefact, not
  a hold — nothing in the sim stops it walking on. Recorded, not "fixed" by
  teaching the bot.
- `carried` at 844x390 takes more hits than before (30 → 37.5) because it now
  plays all six sides instead of timing out on side 4.
- Kills drop for racers (rush 44.5 → 33 at desktop): they outrun ambient
  bodies and leave survivors to follow; `fighter` kills more (80 → 90.5).

## Fingerprint moves (an intentional sim change)

- **Default run:** 160 of 160 lab trajectories differ from main — expected:
  the follow-lead, the rolling corners and the zipper removal each change
  trajectories.
- **Zipper removal alone:** both hatches on this branch (`?gates=legacy&
  follow=0`) vs main, on a 22-run subset (climber s1, idle, oracle@0/1500/3000
  x 3 seeds, at desktop and 844x390): **18 identical, 4 moved** — oracle@1500
  s1-s3 and oracle@3000 s3 at 844x390 (victory 158.6 → 168.3, 182.0 → 172.4,
  155.5 → 155.6, 198.3 → 197.6 s).
- **The hatches restore today's run exactly:** the same 22 runs on a scratch
  copy of this branch with the base sim zipper restored verbatim
  (`updateZipper`, `zipperOffset`, base `src/sim/level.js`) are **22 of 22
  identical** to main. So the four moves above are the zipper removal and
  nothing else.

## R4 A/B: `?hinge=flow` — pinned ticks per corner, both ways

`node tools/simlab/turnlab.mjs run --policy run --viewport <vp> [--query hinge=flow] --json`
(60 Hz ticks; "pinned" = ticks the corner is turning, "stalled" = ticks RIG
stood still with a direction held):

| viewport | variant | per corner pinned / pinned-with-input / stalled | stalled per run | run ticks to VICTORY | turnlab violations |
| --- | --- | --- | --- | --- | --- |
| desktop 1280x720 | default (hinge lock) | 67/67/66, 66/66/65, 67/67/66, 67/67/66, 67/67/66, 66/66/65 | 394 ticks (6.6 s) | 5732 | 0 |
| desktop 1280x720 | `?hinge=flow` | 67/67/41, 66/66/41, 67/67/41, 67/67/41, 67/67/41, 66/66/41 | 246 ticks (4.1 s) | 5582 | 0 |
| phone 844x390 | default | 67/67/66, 66/66/65, 67/67/66, 67/67/66, 67/67/66, 66/66/65 | 394 ticks (6.6 s) | 5750 | 0 |
| phone 844x390 | `?hinge=flow` | 67/67/41, 66/66/41, 67/67/41, 67/67/41, 67/67/41, 66/66/41 | 246 ticks (4.1 s) | 5714 | 0 |

Under `?hinge=flow` RIG still stands on the hinge until the camera hand-off
(41 ticks = 690 ms, because before it the arriving facet is not drawn) and
then runs on for the last ~25 ticks of the ritual. Both variants pass every
turnlab family (envelope, hinge, turn, facet, ratchet, framing, never-wait);
the T-102 domain also plays `?hinge=flow` at two viewports in its full tier.
Default stays the hinge lock until the operator plays both.

## Phone check (844x390, hasTouch, DPR 1)

`node tools/simlab/race/corner-capture.mjs --base-url http://127.0.0.1:8774
--viewport 844x390 --touch --dpr 1 --corner 1` against a pinned `git archive`
of `bb07b63` (src identical to this branch's HEAD). Played from boot through
the shipped frame loop and renderer (SwiftShader, variable dt): an in-page
driver holds right, jumps at holes and steps, **never fires**; RIG's hp is
topped up; nothing is posed. Frames and sidecar:
`reports/tasks/T-201/captures/` (the sidecar records every hostile with its
follower flag at each frame; console errors: none).

| frame | corner | RIG x / scroll | what the sim says | HUD encounter line |
| --- | --- | --- | --- | --- |
| `00-arrive` | 1, approach (armed the moment RIG reached the joint) | 112.72 / 98.00 (halt) | 4 encounter wasps alive and shootable | `OBSERVE · 4 HOSTILES` |
| `01-t350` | turning, 350 ms | 113.00 / 98.00 | the turn fired with them alive: all 4 are followers (dormant) | `4 FOLLOWING → INTERCEPT` |
| `02-t700` | turning, 700 ms (after the camera hand-off) | 113.00 / 98.00 | 4 followers dormant | same |
| `03-done` | done | 113.47 / 98.40 | 4 followers dormant (the scroll has not crossed the bend yet) | — |
| `04-enter` | side 2 | 134.62 / 113.20 | first follower condensing at x 139.06 (4.4 tiles ahead of RIG) | `INTERCEPT · 4 FOLLOWING` |
| `05-follow` | side 2, +600 ms | 140.26 / 115.91 | all 4 condensing at x 136.3-150.0, inside the view | `INTERCEPT · 4 FOLLOWING` |

The pause that freezes each frame fades the HUD and thumb deck
(`body.at-modal`); the capture tool un-hides them with CSS so the frame reads
as the playing frame it was paused on, and hides the "TAP TO RESUME" cue.
Not judged here: how readable four small wasps are at this size (operator
question 2/3).

## Replica agreement (race lab vs turnlab)

`node tools/simlab/race/replica-agree.mjs …` plays one frame-exact open-loop
schedule (hold right, jump every 900 ms, 70 s) through both six-face replicas
in fresh processes and diffs RIG, scroll, kills, every live hostile and every
corner's lifecycle and carry-over counters:

| viewport | query / fire | ticks | corners turned | followers | hostiles at end | result |
| --- | --- | --- | --- | --- | --- | --- |
| 844x390 | default | 4200 | 5 | 20 | 16 | MATCH |
| 1280x800 | default | 4200 | 4 | 16 | 13 | MATCH |
| 390x844 | default | 4200 | 5 | 20 | 17 | MATCH |
| 844x390 | default, fire held | 4200 | 5 | 20 | 10 | MATCH |
| 844x390 | `gates=legacy&follow=0` | 4200 | 0 (held gate, no fire) | 0 | 4 | MATCH |
| 1280x800 | `hinge=flow` | 4200 | 5 | 20 | 25 | MATCH |

Both replicas' drift guards are green (the race lab throws on a drifted
`update()`/`resetGame()`/boot order/reset registry in every run; T-102's static
guards M15-M17 hold the turnlab's).

## Hard rules

- `CONFIG.player`, `CONFIG.momentum` (ceilings included) and `CONFIG.waves`
  are byte-identical to `08e5db1` (compared by importing both trees' CONFIG);
  the only config change is the added `follow` block.
- Determinism: the same race-lab run twice in fresh processes gives the same
  `simDigest`/fingerprint (`skip` seed 2 @ phone-landscape: `0c48c1a4` /
  `4263e816` both times); the two replicas agree tick for tick (above);
  pathcheck's static guards (no `Math.random`/`Date.now`/`performance.now` in
  `src/pure`, `src/sim`) are green.
- Layer purity: pathcheck's static layer guards green; the new sim code calls
  outward only through `view.*` bridge hooks that already existed.
- Static anatomy: nothing of the creature moves or assembles; the sim no
  longer even keeps a build schedule. Followers re-entering use the ordinary
  enemy entrance tell (enemies are not anatomy).
- Hot loop: the per-frame rolling path reuses module scratch objects
  (`dueScratch`, `bandScratch`, `reentryBand`, `statusOut`, the HUD's
  `rollingTextIn`); allocation happens only at events (a beat release, the
  turn, a re-entry).

## Falsification tables (a green gate is not evidence that a gate works)

### `node tools/simlab/race/race-falsify.mjs` — the T-201 domain, 19 rows, all red

Each row breaks one thing in a scratch copy and runs the domain's pure
assertions plus only the played runs that guard that row (`HB_T201_RUNS`);
the unbroken copy first runs the union of those runs and is green (68 passed,
0 failed; the two legacy domains 17/0 and 10/0).

| row | broken | guard | red? | evidence |
| --- | --- | --- | --- | --- |
| F1 | follow-lead floor never applied | oracle@0 desktop | YES | SIGHT: median 6.4 tiles (>= 19.8), 41.9 % under 3 |
| F2 | corner blend removed | oracle@0 desktop | YES | "at the joint the corner blend puts the scroll exactly on the halt" + WAIT |
| F3 | a rolling corner holds like a gate while gating bodies live | skip 844x390 | YES | NO SOFTLOCK: timeout after 600 s with 0/6 corners |
| F4 | survivors vanish at the turn | skip 844x390 | YES | PRESSURE: followed/seen 0/0 0/0 0/0 2/2 0/0 |
| F5 | followers never re-enter | skip 844x390 | YES | PRESSURE: followed/seen 4/0 x 5 |
| F6 | bodies staged at their sockets whatever the view | oracle@0 6 % | YES | VISIBLE: 9 of 39 outside the view |
| F7 | bound = the old 300 s lock | pure | YES | "a beat nobody clears and nobody approaches waits exactly its 6000 ms bound" |
| F7b | bound = the old 300 s lock (played) | skip desktop | YES | BEATS: side 6 waits 6.6 s |
| F8 | encounter line outgrows its slot | pure | YES | longest 34 characters |
| F9 | the follow term binds every frame | carried s1 desktop pair | YES | FLOOR: 28d4e072 != 6e6314f6 |
| F10 | bank not re-expressed | pure | YES | "riding the lead line banks fully" |
| F11 | `?follow=0` inert | oracle@0 `follow=0` | YES | waits > 3 s at 0 of 6 joints, median 21.7 tiles ahead |
| F12 | `?gates=legacy` inert | oracle@0 `gates=legacy&follow=0` | YES | 0 gates held |
| F13 | sim hand-off drifts from the camera's | pure/static | YES | 678 ms; progress 0.9 in waves.js vs 0.96 in render/camera.js |
| F14 | the sim settles columns again | static | YES | "the sim keeps no zipper" |
| F15 | the six-face run starts its future faces unbuilt again | oracle@0 desktop | YES | 430 unbuilt ground columns at the turns |
| F16 | the bank saturates on the lead line only | oracle@0 844x390 | YES | BANK: per-face max drive 0.67 0.66 0.66 0.65 0.65 0.66 |
| L1 | (as F15) future-facet ownership | `future-facet-render-ownership.mjs` | YES | pre-bend column not built; 0 of 88 arrival rows at the hand-off |
| L2 | (as F15) catwalk at the hand-off | `catwalk-built-prefix-visibility.mjs` | YES | 2 of 5 segments |

### `node tools/simlab/turnlab-falsify.mjs` — the T-102 domain, 32 rows, all red

| rows | result |
| --- | --- |
| P1, P1b, P3, M1, M2, M5-M10, M12, M14 (envelope, hinge, turn, facet, ratchet families on the DEFAULT race-pass run) | all red, as at T-102 |
| M11 (framing: the clamp loosened 3 tiles) | red on `?follow=0` (`rigOffScreen` x1389). On the default it cannot bind: the follow-lead keeps a racer off the right clamp, so loosening the clamp changes nothing a run sees — the row now runs where the clamp still binds. |
| P2, P5, M3, M13 (held-gate rows) | red on the `?gates=legacy&follow=0` hatch (`gateBlind` x10931, `hudLastButMore` x561, `gateShutWithKillConditionMet` x1188, `turnSkippedApproach` x3) |
| M4 (`haltedButIdle`) | red on the default (x1618) |
| P5b, M15-M18 (static) | red |
| Z1 (replaces P4: sim marks future faces unbuilt again) | red: "even the retired ?zip=1 branch … draws the whole arriving facet (2 of 88 rows)" |
| N1, N8 (a rolling corner holds / falls back into `gate`) | red: `turnWaitedAfterArrival` x4505, `gateStateInRolling` x4516 |
| N2 (staged at sockets whatever the view, 390x844) | red: `stagedOutsideView` x22 |
| N3 (followers re-enter past the right edge) | red: `carriedInvisible` x14 |
| N4 (followers never come back) | red: `carryLost` x5 |
| N5 (BROKEN while live) | red: `hudBrokenButAlive` x540 |
| N6 (line too long) | red: `hudTooLong` x213 |

Two rows needed fixing before they could bind and are reported as such: P3
still targeted the pre-rewrite `scroll.js` line (the first run printed
"MUTATION NOT APPLIED"), and M11 is moved to `?follow=0` for the reason above.
**`beatOverBound` has no turnlab row:** with the bound raised to the old 300 s
lock, none of 12 turnlab policy/gunner/viewport combinations starves a beat
(run@1280x720 none and paced, run@390x844 paced and none, run@844x390 none,
idle@1280x720 and @844x390 none, backtrack@1280x720 and @844x390 none,
backtrack-approach@1280x720 none, die-after-turn@1280x720 none,
die-mid-turn@844x390 none): each reaches every beat's line, or clears it,
inside 6 s. The same invariant, measured the same way, is red in the race lab
(F7b, F7). Recorded as TURNLAB.md limitation 9.

## Operator packet

Serve this branch: `node tools/serve.mjs 8774 --root /home/user/hullbreaker/.claude/worktrees/T-201`
(or the M1 release links). Play each on desktop and on the phone (844x390
landscape):

| what | URL |
| --- | --- |
| the race pass (new default) | `http://127.0.0.1:8774/index.html` |
| today's run (both escape hatches) | `http://127.0.0.1:8774/index.html?follow=0&gates=legacy` |
| follow-lead only (held gates back) | `http://127.0.0.1:8774/index.html?gates=legacy` |
| rolling corners only (today's scroll) | `http://127.0.0.1:8774/index.html?follow=0` |
| R4: RIG keeps moving through the ratchet (unjudged, OFF by default) | `http://127.0.0.1:8774/index.html?hinge=flow` |

Questions (please answer in your own words):

1. Which side made you stop moving, and why?
2. At a corner, what happened to the enemies that were still alive? Did
   anything about it feel unfair or confusing?
3. How far ahead could you see where you were going? Did anything hit you that
   you could not see coming?
4. Default vs `?hinge=flow`: at the corners, which felt better, and what was
   different?
5. Default vs `?follow=0&gates=legacy`: which would you rather play again, and
   why?

Things I measured but cannot judge (feel calls, not defects): followers are
invisible and unshootable for the 1.1 s ritual plus the time the scroll needs to
cross the bend (they re-enter 150 ms apart after that); the follow-lead moves
the camera at RIG's speed whenever RIG leads, so the frame moves more than
today; the phone frame's encounter bodies are small at 844x390 (the capture
frames below).

## Proposed inbox issues

```
## I-??? | harness | S3 | repro: node tools/simlab/turnlab.mjs run --policy stock-life-at-hinge --viewport desktop --query fallback=0 with tools/simlab/lib/turn-proof.mjs's gap reflex as of ab4c4fc @ task/T-201 | evidence: tools/simlab/TURNLAB.md limitation 8
The turnlab envelope family reports the damage plane's crush pin (src/sim/player.js:
RIG pinned at a wall's outside face, moved a whole tile when the plane crosses a
column) as a teleport. Only reachable under the harness's god mode (hp topped up
every tick); T-201 fixed the policy that walked into it, not the check. Owner: harness.

## I-??? | bug | S3 | repro: open ?zip=1 on task/T-201 and take any corner | evidence: src/render/level.js unbuiltHidden/zipperColumn
With the sim zipper gone, render/level.js's retired ?zip=1 branch still hides each
arriving face's first 31 tower columns (slamSets) at boot and nothing calls
zipperColumn to bring them back, so ?zip=1 shows holes. T-121 deletes the flag's
render half; if T-201 merges first, ?zip=1 is broken until T-121 lands. Owner: T-121.

## I-??? | tuning | S3 | repro: read src/pure/waves.js ROLLING_GATES | evidence: this report
The rolling-encounter constants live in src/pure/waves.js (ROLLING_GATES) because
T-201's fence limited src/config.js to CONFIG.follow; CONFIG.waves' zip* constants
(zipCols aside, which still sizes slamSets for the render) are now dead config.
Move ROLLING_GATES into CONFIG.waves and drop the dead zip* keys with T-121's
render cleanup. Owner: the next gameplay lane in waves.js.

## I-??? | balance | S3 | repro: node tools/simlab/race/lab.mjs baseline --seeds 6 --viewports phone-portrait --policies rush,skip @ task/T-201 | evidence: this report, box 5
At 390x844 skipping every fight costs nothing measurable (skip 5 [3-8] hits vs rush
6 [6-8]): with a 6-tile lead on a 19-tile view the follower re-entry band is about one
tile wide just ahead of RIG, so followers condense in RIG's path and are run past
before their entrance ends. Options: re-enter BEHIND RIG on narrow views (they
"chase"), or widen the window when the band collapses. A feel call first (operator
question 2); portrait is not the operator's device. Owner: gameplay.

## I-??? | bug | S4 | repro: node tools/simlab/race/stage-view.mjs <lab baseline> (6 % row, "< 6 then") @ task/T-201 | evidence: this report, box 4
At the closer phone frame 30 of 1722 encounter bodies (1.7 %) stand 5.2-6.0 tiles from
the damage plane at the moment they become shootable, although all were staged >= 6:
the staging band adds the plane's advance at its CURRENT speed over the entrance, and
the follow-lead can speed the plane up mid-entrance. Bound the advance by RIG's run
speed (the follow floor cannot outpace it outside the corner blend). Owner: gameplay.

## I-??? | harness | S3 | repro: node tools/simlab/race/lab.mjs check | evidence: I-113, this report's fingerprint section
Every race-lab fingerprint moves with T-201 by design (follow-lead + rolling corners
+ zipper removal). artifacts/t104-race/baseline.json (seeds 12) must be regenerated
on main after T-201 merges (T-201 ran seeds 6 for its before/after only). The lab's
phone-landscape-6pct row is an ESTIMATE of T-107's closer frame (rigFraction 0.06);
re-point it at T-107's real calibration when T-107 merges. Owner: integrator / T-210.
```

## Verification commands and results (all run on this tree by the resuming agent)

Host: GPU-less 4-core container shared with other lanes (load 50-90 during
these runs). `. ~/.hullbreaker-host.env` loaded in every shell.

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` (full tier, final tree) | **4552 passed, 0 failed**, exit 0 (10 min 16 s). The 4 browser-probe assertions are skipped by the host knob (not counted) |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs` (final tree) | **4155 passed, 0 failed**, exit 0 (3 min 19 s); SKIP lines: t-102 45 of 50 played runs, t-201 17 of 22 |
| `node tools/simlab/race/lab.mjs baseline --seeds 6` | before (export of `08e5db1` + this lane's lab tools) digest `2acfb162`, 1407 s; after digest `6da0adf5`, 1863 s. The after beat-gap column uses the closed-gap metric; the open interval (a beat still waiting at the turn) is asserted by the domain since `d0e9b33` |
| `node tools/simlab/race/stage-view.mjs <baseline.json>` (after and before) | box 4 table |
| `node tools/simlab/race/gate-view.mjs` | unchanged from main (its JSON artifact is byte-identical) |
| `node tools/simlab/race/race-falsify.mjs` | 19 of 19 rows red, baselines green, exit 0 |
| `node tools/simlab/turnlab-falsify.mjs` | 32 of 32 rows red, exit 0 |
| `node tools/simlab/race/replica-agree.mjs` (6 configurations) | 6 of 6 MATCH |
| `node tools/simlab/turnlab.mjs run --policy run --viewport desktop/phoneLandscape [--query hinge=flow] --json` | R4 table |
| `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --viewport 480x300 --base-url http://127.0.0.1:8774` then `node tools/orch/smoke-verdict.mjs <report.json>` | **PASS** (outcome not-completed, deaths 0, tick 594/594) |
| same with `scripts/transform-slice.json --max-runtime-ms 20000` | **PASS** (outcome completed, deaths 0, tick 938/1104) |
| `node tools/simlab/race/corner-capture.mjs --base-url http://127.0.0.1:8774 --viewport 844x390 --touch --dpr 1 --corner 1` | 6 frames + sidecar, console errors: none |
| scratch: zipper restored verbatim, `lab.mjs baseline --seeds 1 --viewports desktop-16x10,phone-landscape --policies climber --query 'gates=legacy&follow=0'` vs before | 22 of 22 identical |
| same subset on this branch vs before | 18 of 22 identical, 4 moved (the zipper) |
| floor pairs (`carried` s1-3 @ desktop and 6 %, default vs `?follow=0`) | 6 of 6 untouched and identical |
| the same race-lab run twice (`skip` s2 @ 844x390) | identical `simDigest` and fingerprint |
| `oracle@0`, momentum drive per face, HEAD before the blend-line bank vs after | 844x390 max drive 0.65-0.67 → 0.94-1.00; desktop 0.99-1.00 both; portrait identical |

The smoke playtests and the capture ran against a pinned `git archive` of
`bb07b63`; `git diff bb07b63 HEAD -- src` is empty (later commits are tools and
this report).

## Coordination and merge notes

- **Main moved** (`9bedbaa`). `git merge-tree` reports one conflict:
  `tools/pathcheck/manifest.mjs`. T-103's merge took slots d79/d80; this
  branch's domain is d79 (`t-201-race-pass.mjs`). Resolution: renumber it to
  the next free slot (d81) — one import line, one list entry. No other file
  conflicts. T-103 touched `src/pure/rig.js` and `src/render/player.js`
  (presentation), not the sim paths measured here.
- **T-121 has not merged.** Render consumers of sim exports are intact
  (`slamSets`, `farSets`, `columnBuilt`, `levelBuildRevision`,
  `view.level.unbuiltHidden/faceRevealed`). Shared files likely to meet:
  `tools/pathcheck/t-009-static-anatomy-reveal-default.mjs` (one assertion
  inverted here), `src/mode.js`, `src/sim/level.js`'s comments. After T-121,
  `slamSets`/`farSets`/`levelBuildRevision` can go.
- **T-107 (phone camera) is in flight.** Nothing here types a width: the lead
  and the staging band read the live edges every frame. Re-measure after it
  merges: the corner blend and TURNLAB limitation 7 both exist because
  render/camera.js anchors the view at the scroll (an anchor change such as
  `?orbit=joint` changes what the blend is for); the race lab's 6 % row is an
  estimate of T-107's frame. Shared tooling: `tools/simlab/lib/turn-proof.mjs`,
  `sixface-host.mjs`, `src/mode.js`, the manifest.
- **T-120 (harness):** `tools/playtest/analyze-run.mjs`'s `GATE_RE` (I-106)
  parses a line that no longer exists. The default HUD line is now
  `rollingEncounterText` (e.g. `OBSERVE · 4 HOSTILES`, `4 FOLLOWING →
  INTERCEPT`, `INTERCEPT · 4 FOLLOWING`, `CONTAIN BROKEN · CLIMB →`); the
  held-gate line appears only under `?gates=legacy`.
- **Docs not edited here** (README.md is excluded by the dispatch; docs/ is
  outside this lane's fence): README's query-flag list, docs/DESIGN.md's
  implementation record and docs/HANDOFF.md should gain the new default
  corners and follow-lead and the flags `?follow=0`, `?gates=legacy`,
  `?hinge=flow` when this merges. The harness docs (tools/simlab/README.md,
  tools/simlab/TURNLAB.md) are updated, limitations included.
- Inbox: **I-105** is fixed in the sim (verified by the re-modelled
  future-facet assertion). **I-107** (fallback streak re-earned by pacing in a
  held gate): no held gate exists by default any more; not re-measured.
  **I-113**: see the proposed issue above.

## Worktree, branch, ports

- Worktree `/home/user/hullbreaker/.claude/worktrees/T-201`, branch
  `task/T-201`, base `08e5db1`; lane commits `aa58d4b` (the dead session's WIP
  snapshot, rebased) through this report's commit.
- Port 8774 served the pinned export for the capture and the smoke runs;
  killed at the end. Port 8775 was not needed.

## Single best next action

Gate it (reviewer + playtester on `task/T-201`, renumbering its pathcheck
domain to d81 at merge), then put the operator packet in front of the
operator on the phone at 844x390 — the defaults ship ON, and `?hinge=flow`,
the followers' disappearance during the ritual and portrait's free skipping
all wait on his answers.
