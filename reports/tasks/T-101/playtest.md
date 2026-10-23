PASS

# T-101 playtest gate: the two-thumb touch deck

Gate of record: branch `task/T-101` @ `49f6a0a` (head; merge-base `a217831`, the main of that
moment), worktree `/home/user/hullbreaker/.claude/worktrees/T-101`. Run 2026-10-23 00:58-02:10 UTC on
the GPU-less 4-core host, 1-minute load average 28-49 (other lanes' SwiftShader browsers),
Chromium 141.0.7390.37 headless, `. ~/.hullbreaker-host.env` in every shell. The worktree was
`git status --porcelain` empty before and after and still at `49f6a0a` when I finished. The only
repo files this gate wrote are this file and `reports/tasks/T-101/playtest-evidence/`; the probe
scripts I wrote live in `playtest-evidence/scripts/`. **The verdict is pinned to `49f6a0a`.** Main
has moved since the merge base (now `5252c18`) but only in `reports/`, `docs/proposals/`,
`tools/orch/` and `tools/pathcheck/pathcheck-suite.mjs`: `src/`, `index.html`, `assets/` are byte-identical to
`a217831` and no file T-101 touches was changed on main, so the runtime evidence below holds for the
merged result.

**What this verdict claims.** (1) The lane's multi-touch proof reproduces on a pinned tree, in both
orientations, with every number the build report quotes. (2) The pointer-bookkeeping falsification
reproduces. (3) The keyboard path is unchanged: bit-identical deterministic run against main's
runtime tree, both smoke scripts pass, a non-touch desktop at 1280x720 shows no deck and plays. (4)
The deck, in screenshots at 8 viewport/inset combinations (844x390 plain, with notch left and right,
667x375, 568x270 and 844x340 with toolbar, 932x430 with island insets, 390x844) and a 96-layout
geometry sweep, does not cover RIG, the route band or the hostiles that were on screen at spawn
framing and in the first real frames. **What it does not claim:** anything about fun or
feel (those are routed to the operator as questions in section 6); anything about iPhone Safari
(section 7); that the deck is easy to use with a thumb. A green pathcheck is not evidence (entry 21);
I ran it once, informationally.

## 1. Results at a glance

| # | What | Command (abbreviated; full lines in section 8) | Result |
|---|---|---|---|
| 1 | Lane's touch proof, **landscape** 844x390 (frozen, live, legacy, title, DPR-2 shots) | `node touch-proof.mjs --views landscape --base-url :8778` | **54 passed, 0 failed**, 2387 s. No retry needed, nothing flaky |
| 2 | Same, **portrait** 390x844 (frozen, live, shots) | `... --views portrait --only frozen,live,shots` | **46 passed, 0 failed**, 1550 s |
| 3 | Pointer-bookkeeping falsification (independent re-run) | `... --only frozen --mutate release-all-on-up` | **36 passed, 2 failed**, **72 of 216** ledger steps wrong: exactly the lane's number |
| 4 | Smoke `mid-route.json` (main's harness, deterministic, 480x300) | `run.mjs ... --base-url :8779` + `smoke-verdict.mjs` | **`smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`**, pageErrors/consoleErrors/bootError all empty |
| 5 | A/B of #4 against main's tree (:8780; runtime tree identical to the merge base) | same command | final state identical (exact equality on x, y, scrollX, gameMs, hp, kills, edgeMargin and the rest of the final sample); **585 time-aligned samples, 0 mismatches**; 26-event ledger identical (`scheduledTick`, `actualDispatchTick`, all `frame`) |
| 6 | Smoke `transform-slice.json` (gate flags: `--max-runtime-ms 20000`) | `run.mjs ...` + `smoke-verdict.mjs` | **`PASS (outcome=completed deaths=0 tick=938/1104)`**, no errors; same numbers as the lane's |
| 7 | Desktop, 1280x720, no touch, the plain default URL | `desktop-check.mjs` | **13 passed, 0 failed** (deck hidden, no touch CSS, key leaves title, ArrowRight runs RIG 6 -> 9.48, KeyX fires, Space jumps, deck inert) |
| 8 | My supplementary touch probe (what the lane's proof does not drive), landscape + portrait | `qa-touch-extra.mjs` | **32/32 and 32/32**; with 3 config defects served: **29 passed, 3 failed** (the three matching checks) |
| 9 | Safe-area and viewport sweep, real browser, 6 sizes, CDP safe-area emulation (applied) | `viewport-sweep.mjs` | **21 passed, 0 failed** |
| 10 | Layout sweep with the deck's own pure functions, 96 layouts (12 phone sizes x toolbar x notch side, plus portrait) | `layout-sweep.mjs` | **no problems** (nothing outside the safe area, JUMP/FIRE gap >= 8 px, chips >= 44 px, JUMP >= 64 px, no zone conflicts) |
| 11 | Phone first ten seconds at the plain URL: title -> one tap -> first frames, both orientations | `phone-first-ten.mjs` | **6/6 and 6/6** (title inert deck, one tap starts, tap is not a jump, AudioContext none -> running) |
| 12 | Informational: `node tools/pathcheck.mjs` in the worktree, host skip knob | `HB_GATE_SKIP_BROWSER_PROBE=1` from the host env | 4038 passed, 0 failed (the 4 browser-probe assertions skipped, not counted) |

No page error and no console error in any page of any run above. No `bootError`.

A.5 vocabulary for the keyboard A/B (#5): the sim is bit-identical, so `closestCrushApproachTiles`
(minEdgeMargin) is 26.53 on both sides, 0 deaths, `hitsWithoutDeath` 3 on both. The reports'
`idleTimeFraction` differs (0.331 main, 0.343 T-101); its `playingTimeMs` (384 s and 406 s) is wall
clock for a 9.9 s sim, so I read that as poll weighting while the page sits frozen at the terminal
tick, a harness artifact and not a sim difference. protoScore is not meaningful on this script (no
routes).

## 2. The task's acceptance boxes, one by one

1. **Multi-touch proof at both orientations.** Reproduced (#1, #2). Both orientations, identical
   numbers: stick right + JUMP, tick 1 after the press: `vy 13.40, vx 9.40` (run speed 9.4).
   Held JUMP apex **2.607** tiles (41 ticks held) against tapped **1.014** (3 ticks held). Second
   JUMP press airborne: `airJumpsLeft 1 -> 0`, `vy 12.40` at tick 1. Stick up-right + FIRE: one live
   bullet at **45.0 deg**. Stick down + JUMP on the first catwalk: stood at x 32.95 (landscape) /
   32.93 (portrait) on y 6.35, below the deck at tick 1, landed y 2.00. HP never dropped (RIG's
   i-frames are pinned: see section 7).
2. **Three pointers, every order, falsified.** 3 pointers x 36 press/release orders: **216/216**
   steps exact against both the deck's ledger and the sim's `keys`, both orientations. A second
   finger on JUMP is a second press and lifting one keeps JUMP held. Falsified by me (#3): lifting
   any finger releases every finger turns the ledger red, 72 of 216 steps.
3. **pointercancel, blur, visibilitychange, orientation.** All release every held code, both
   orientations. Two honest qualifiers that match the lane's: the visibility trial is a synthetic
   `hidden` (this headless Chromium delivered neither `blur` nor `visibilitychange` when another
   page was brought to front: `realFocusLoss {blur 0, vis 0}` in both orientations), and blur is an
   isolated dispatched event. A phone's real backgrounding is untested here.
4. **No zoom, `touch-action:none`, `user-select:none`.** Computed styles pass on the deck, JUMP,
   FIRE, SWAP, PAUSE, AUTO, stick, nub and canvas; `html` computes `pan-x pan-y`. Double-tap scale 1
   (cannot fail in Chromium, noted by the lane); pinch scale 1, and the same pinch with
   `touch-action` overridden gives **scale 5**, so the probe can see a zoom.
5. **Keyboard path unchanged.** #4 to #7. The strongest evidence is #5: the same deterministic
   script on main and on T-101 ends in the identical state with the identical dispatch ledger.
6. **`?touch=legacy`.** Snapshot keys `enabled, active, clutch, vector, fire, held, jumps`; old deck
   shown, new deck hidden; drag -> ArrowRight, outer rail adds KeyX, a tap pulses 1 jump (4/4, the
   tap passed here where the lane's own full run lost it to host load). I also diffed the module:
   `git show 98b12c9:src/ui/touch-controls.js` against `src/ui/touch-legacy.js` differs in exactly
   the header comment, the function name and `|| query.get('touch') === 'legacy'`, as claimed.
7. **Screenshots, both orientations, DPR 1 and 2.** Present and reproduced (section 3).
8. **Operator packet.** Present in `build.md` (five questions, mostly non-leading). The URL in it is
   a placeholder ("the integrator's pinned server"); the integrator has to put the real one in the
   checkpoint-queue entry.

## 3. What I saw in the screenshots (the lane's, mine, and the extra sizes)

Files: `playtest-evidence/shots/` (my re-run of the proof's captures, 11 files),
`first-ten/`, `viewports/`, `auto-on/`, plus the lane's `reports/tasks/T-101/shots/` (I looked at
all of them).

**Landscape 844x390.** Left: a dashed ring "MOVE . AIM" at (113, 305), radius 58.5, over the lower-left
hull face. Right: SWAP chip (558, 276, 45x45), FIRE ring (671, 332, r 37, warm rim) and JUMP ring
(760, 316, r 43, grey rim, chevron) over the lower-right hull face. Top right: AUTO and II chips
(45x45) under the "Meridian response" banner, not overlapping the HUD. Bottom centre: a one-line hint
"LEFT THUMB: MOVE + AIM . RIGHT THUMB: JUMP + FIRE". In use: the stick draws a solid rim, a cream nub
on the NE rim and a lime wedge 47.5 degrees wide showing the held sector; JUMP fills cream, FIRE
fills orange, both labels stay readable. With AUTO on (`?autofire=1`, my capture) the AUTO chip goes
lime-bordered with lime text and FIRE gains a 7 px lime "AUTO" tag, legible at DPR 2.

**Do the controls cover RIG, the route band or enemies?** Not in any frame I captured.
- RIG in the real first frames after the starting tap stands at about (375, 203) on the deck,
  roughly 17 px (about 4.5% of 390) tall, at least 180 px from every control. In portrait it is
  about 48 px (5.7% of 844) at (110, 400).
- The route band at the spawn framing (main deck plus the catwalk rows) ends near y 235 at
  844x390. The right-thumb cluster's hit-box top is y 262 (67% of 390) with no insets and **y 241
  (61.9%) with the real-iPhone landscape 21 px home-indicator inset**, where JUMP's visible ring top
  is y 252: so about 6 px to the hit area and 17 px to the ring on a real iPhone, 27 px / 38 px with
  no inset. Tight, but no overlap (`viewports/vp-844x390-notch-left-idle.jpg`). I saw no overlap
  either at 932x430 with 59 px island insets, 667x375, 844x340 with toolbar, or 568x270 with
  toolbar (the tightest: the route's lowest structures end around y 165-175 against a cluster top
  of y 179; I did not measure that one to the pixel), nor in portrait, where the route band is at
  y 430-560 and the cluster starts at y 645.
- Hostiles on screen in these frames (wasps, the carrier, the purple spore) are in the upper half.
  What happens later in the route, with the camera lower or hostiles on the floor, I did not
  measure (see the T-107 hand-off issue below).

**Legibility, measured** (WCAG-style luminance contrast of each control's rim against the scene just
outside it, from the DPR-2 captures; headless render, JPEG q82, so approximate): JUMP ring 3.4:1
(landscape) / 4.0:1 (portrait); FIRE ring 3.7:1 / 3.8:1; the three chips 2.5-2.7:1; the idle stick
ghost **2.0:1** (landscape) and **1.45:1** (portrait). In use: JUMP fill 9.9:1, FIRE fill 4.4:1.
Computed font sizes: button and chip labels 10 px, the ghost label and the hint line 8 px (40% / 60%
alpha), the in-FIRE auto tag 7 px, the modal cue 11 px. The lane chose low occlusion on purpose; no
repo standard sets a contrast floor. I report the numbers and ask the operator (section 6).

**Style.** The deck uses the HUD's monospace type, thin translucent rules and the HUD's own lime
accent, and FIRE's warm rim reads with the rust palette; I see no style break against the HUD or
the concept-art boards (no board covers a touch UI). The lime wedge shares the family of the boards'
"acid-green danger" role, but the HUD already uses that lime for its own pips and rules, so the deck
is consistent with what exists. No anatomy, render or sim file changed (`git diff main...HEAD`
touches no `src/render/` or `src/sim/`), so the static-anatomy rule is not in play.

**The lane's idle and in-use captures are tick-0 frames.** The sim is frozen at tick 0, and the
camera pose there differs from the gameplay framing a few frames later: RIG is about 11 px (2.8% of
390) in the landscape idle frame and about 19 px (2.3% of 844, partly behind the ledge, at the left
edge) in the portrait one, against about 17 px (4.5%) and 48 px (5.7%) in the first real frames
after the tap. The captures show the deck correctly; they must not be used to judge RIG size or
how much of the play band the cluster takes.

**Pacing dead spots.** None attributable to the deck. The one wait a player can hit is by design:
a tap on GAME_OVER is ignored for 650 ms, on VICTORY for 2.4 s (checked: an early tap at 42 ms and
269 ms after the screen showed did not skip it, an armed tap restarted). Whether those delays feel
right is a feel question.

## 4. What the extra probes add (all real CDP multi-touch, frozen sim, ledger and sim `keys` both asserted)

The lane's browser proof drives separate fingers; several of the report's headline claims were
covered only by pure-logic assertions. My `qa-touch-extra.mjs` drives them in the browser (32 checks,
identical at both orientations):
- **One-thumb roll.** A finger down on FIRE holds KeyX; the same finger rolled onto JUMP holds KeyX
  and Space (exactly one JUMP press); lifting frees both.
- **The lens.** A landing in the overlap of the two hit circles presses both; 3 px short of it
  presses FIRE only, 3 px past it JUMP only. The lens is **9.1 px thick** here (3.7-10 px across the
  96-layout sweep): thinner than a thumb pad, so landing on it is luck; the roll is the real path.
- **Slide slop.** Sliding to 1.1 JUMP radii (inside the 1.25 landing slop) does not press JUMP;
  0.92 radius does.
- **iOS edge gutter.** A touch 8 px from the left glass edge spawns no stick (kind `dead`) and holds
  nothing even when dragged; 26 px is a live stick.
- **Second finger in the left zone** takes the stick (the first goes inert, its wiggle and lift
  change nothing); **rim follow** (after a 300 px drag right, pulling back one rim + 22 px reverses
  to ArrowLeft); a FIRE finger dragged across the SWAP chip never presses SWAP; a finger down on
  SWAP holds KeyC until it lifts; PAUSE lifted 120 px off the chip does not pause.
- **AUTO chip** defaults off, toggles on tap, persists to `localStorage` (`1` / `0`).
- **It can fail.** With `slideSlop`, `edgeGutter` and `follow` mutated in `src/config.js` through a
  route (the worktree is untouched), exactly the slide-slop, gutter and rim-follow checks go red
  and the other 29 stay green.
- **Safe areas in a real browser** (viewport sweep): with CDP safe-area emulation applied (47 px
  left, 47 px right, 59 px on both sides, 21 px bottom), `env()` -> `--hud-safe-*` -> `layout.safe`
  read back exactly, every control and the hint line stayed inside the safe area, no page errors.
  That is Chromium's plumbing, not iOS's.

## PROPOSED INBOX ISSUES

The reviewer's findings 1-5 (`reports/tasks/T-101/review.md`) stand and I do not repeat them. Mine
that are not in it, in severity order. SPRINT.md is not edited by this gate.

## I-??? | bug | S2 | repro: `HB_TREE=<tree> node reports/tasks/T-101/playtest-evidence/scripts/title-fit.mjs http://127.0.0.1:<port> <out>` @ T-101 49f6a0a and, with identical numbers, main's runtime tree | evidence: reports/tasks/T-101/playtest-evidence/title-fit/title-414x896.jpg, title-360x740.jpg, title-fit-T101-49f6a0a.json, title-fit-main-runtime-tree.json
**Not caused by T-101; found by this gate.** On every portrait phone width from 320 to 430 the title
wordmark overflows the glass: the H1's text range ends 68 px (320 wide) to 92 px (430 wide) past the
viewport edge, so a player reads "HULLBREAK" with the "ER" cut off, on the first screen they see.
The H1 is a vw-scaled font (13% of the width) with letter-spacing, about 1.15 viewport widths wide.
Landscape 844x390 fits. Main's runtime tree gives the same overflow at every width, so this predates
the lane (its `index.html` diff touches only the deck block and markup). Workaround: landscape, the
tuning target. Entry 20 names mobile rendering defects; route to T-105 (title layout and copy).

## I-??? | docs | S3 | repro: `HB_TREE=<tree> node reports/tasks/T-101/playtest-evidence/scripts/phone-first-ten.mjs http://127.0.0.1:<port> <out> landscape` @ 49f6a0a | evidence: reports/tasks/T-101/playtest-evidence/first-ten/landscape-title.jpg, portrait-title.jpg
On a touch phone the title still says "PRESS ANY KEY" and shows the keyboard legend "MOVE WASD /
ARROWS . JUMP SPACE . FIRE J / X . PAUSE P / ESC". One tap anywhere does start the run (verified, 6/6
at both orientations, and the starting tap is not a jump), but a touch player is told to press a key
and shown controls they do not have; the deck's own legend ("LEFT THUMB: MOVE + AIM . RIGHT THUMB:
JUMP + FIRE") appears only after the run starts. The lane left this to T-105 on purpose
(build.md, scope notes). This files it so T-105's acceptance names it, together with the lane's
proposed docs issue about the pause/death overlay body ("p / esc to resume", "r to climb again"):
on a touch device the title says "TAP TO START" and shows the thumb legend, and the overlays say tap.

## I-??? | feel | S3 | repro: `HB_TREE=<tree> node .../scripts/layout-sweep.mjs` (96 layouts) and `.../scripts/viewport-sweep.mjs http://127.0.0.1:<port> <out>` @ 49f6a0a | evidence: reports/tasks/T-101/playtest-evidence/viewports/layout-sweep-96.txt, vp-844x390-notch-left-idle.jpg
Hand-off to T-107 (closer phone camera), with numbers. The right-thumb cluster's hit-box top is at
58.4-72.3% of the screen height in landscape and 63.9-77% in portrait across 12 phone sizes x
toolbar x notch side (lowest on a 568x270 SE-class viewport with toolbar and insets). At 844x390
with the real-iPhone 21 px bottom inset it is y 241 (61.9%) and the spawn-framing route band ends
near y 235: about 6 px of clearance to the hit area, 17 px to JUMP's ring. Nothing overlaps at
spawn framing at any size tried, but a closer camera, a descent, or hostiles on the floor will move
the band into that margin. T-107's gate should measure RIG, the route band and hostile positions
against `__HB_TOUCH().layout.cluster` and the stick ghost over a whole run in live frames, not at
tick 0 (the lane's committed idle shots are tick-0 frames whose camera pose differs from the
gameplay framing and understate RIG by about 1.5x in landscape and 2.5x in portrait), and should
replace `tools/simlab/race/probe-framing.mjs:119` reading `#touchDeck` (the reviewer's finding 5).

## I-??? | art | S3 | repro: measure rim vs scene contrast on `reports/tasks/T-101/shots/landscape-dpr2-idle.jpg` and `portrait-dpr2-idle.jpg` @ 49f6a0a (method in section 3) | evidence: those two files; reports/tasks/T-101/playtest-evidence/auto-on/auto-on-fonts.json
Idle controls are faint in the headless capture: stick ghost ring 2.0:1 (landscape) and 1.45:1
(portrait) against the local scene, chips 2.5-2.7:1, JUMP/FIRE rings 3.4-4.0:1; hint and ghost text
is 8 px at 40-60% alpha. The lane chose "low occlusion" deliberately and no repo rule sets a floor, so
this is not a defect against anything recorded. The ghost is the only cue for where the left thumb
goes before the first touch. SwiftShader and JPEG make the numbers approximate. Needs the operator's
eye on the phone before anyone retunes alpha; filed so the number exists.

**The lane's own proposed issues (build.md), my status on each:** (1) legacy hatch has no touch exit
from a modal: confirmed by reading `src/ui/overlay.js:59-68` and the legacy CSS, not run; fine for
an escape hatch, relevant only if `?touch=legacy` is ever offered. (2) overlay copy still keyboard:
merged into the second issue above. (3) headless Chromium delivers neither `blur` nor
`visibilitychange` on a real focus loss: **reproduced** (`realFocusLoss {blur 0, vis 0}`, both
orientations). (4) the perf probe reads a stale fixed-path `result.json`: not tested by me; the
merge gate skips that domain with `HB_GATE_SKIP_BROWSER_PROBE=1` and my pathcheck run (#12) skipped
it too. (5) `driver.mjs` `page.goto` 30 s default: not reproduced, my three main-harness smoke runs
all booted at load 28-49.

## 6. Questions for the operator checkpoint queue (feel; not judged here)

Additions to the lane's five-question packet, as questions:
1. In the light you actually play in, are the idle controls easy to find? The stick ring, the three
   small chips and the one-line hint are the faintest (section 3 numbers).
2. When you roll one thumb from FIRE onto JUMP, lifting the thumb ends both. Does ending a jump
   early while you keep firing ever matter to you? (AUTO is the workaround; the lane asks the
   sticky-hold question too.)
3. The FIRE/JUMP overlap is 4-10 px thick. Do you ever try to hit both at once, or do you always
   roll?
4. With a finger held, switch apps, lock the phone or pull a notification down, then come back: does
   RIG keep running or firing? (Headless Chromium cannot deliver a real backgrounding.)
5. Did the title's "PRESS ANY KEY" confuse you, and did the title's name fit the screen in portrait?

## 7. Limits: what this gate cannot prove

- **Chromium only.** No WebKit and no device. Not exercised: the iOS left-edge back-swipe (only the
  20 px gutter's behaviour), `gesturestart` pinch (only `touch-action` plus Chromium's pinch), the
  touchend-only audio unlock (CDP touch grants activation at `pointerdown`; AudioContext went
  `none -> running` after the starting tap in both orientations, which cannot tell the two apart),
  real backgrounding, the callout/loupe, the real notch rendering (CDP safe-area emulation exercises
  `env()`, not iOS), and whether 60 fps holds on the phone (entry 18; SwiftShader here).
- **The live section is closed-loop with the sim held** on the deciding frame (a `document.hidden`
  shadow skips `update` and the draw while rAF, pointer dispatch and the deck run unchanged) and
  RIG's i-frames pinned. It proves deck -> keys -> sim, not real-time thumb latency or feel.
- My supplementary probes run on a frozen sim: input layer only. The contrast numbers come from a
  SwiftShader JPEG capture.
- Auto-fire against live hostiles I did not drive; the reviewer's probe did (hold with a hostile
  inside the edges, release on pause and death, AUTO chip off stores `0`).
- Not re-run: the lane's 14 pathcheck mutations, the reviewer's mutations.
- Sample size: one deterministic run per smoke script per tree (the sim is bit-identical for
  `mid-route`; `transform-slice` is known noisy under `--deterministic`, so no A/B was attempted).

## 8. Commands (cwd and ports as run; scratch under the session scratchpad)

```
. ~/.hullbreaker-host.env
node /home/user/hullbreaker/tools/serve.mjs 8778 --root /home/user/hullbreaker/.claude/worktrees/T-101 --quiet &   # touch proof
node /home/user/hullbreaker/tools/serve.mjs 8779 --root /home/user/hullbreaker/.claude/worktrees/T-101 --quiet &   # smoke + probes
node /home/user/hullbreaker/tools/serve.mjs 8780 --root /home/user/hullbreaker --quiet &                           # main baseline (A/B, title-fit)

cd /home/user/hullbreaker/.claude/worktrees/T-101/tools/playtest
node touch-proof.mjs --views landscape --base-url http://127.0.0.1:8778 --out <scratch>/t101-proof-landscape
node touch-proof.mjs --views portrait --only frozen,live,shots --base-url http://127.0.0.1:8778 --out <scratch>/t101-proof-portrait
node touch-proof.mjs --views landscape --only frozen --mutate release-all-on-up --base-url http://127.0.0.1:8778 --out <scratch>/t101-mutate-release-all

cd /home/user/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8779 --out /tmp/t101-smoke-mid
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8780 --out /tmp/t101-baseline-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --viewport 480x300 --base-url http://127.0.0.1:8779 --out /tmp/t101-smoke-transform
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs <out>/report.json        # after each

# my probes (each takes <baseUrl> <outDir> [view]; HB_TREE selects the tree for the launcher and the pure modules)
HB_TREE=<tree> node reports/tasks/T-101/playtest-evidence/scripts/desktop-check.mjs   http://127.0.0.1:8779 <out>
HB_TREE=<tree> node .../scripts/qa-touch-extra.mjs  http://127.0.0.1:8779 <out> landscape|portrait [mutate]
HB_TREE=<tree> node .../scripts/phone-first-ten.mjs http://127.0.0.1:8779 <out> landscape|portrait
HB_TREE=<tree> node .../scripts/viewport-sweep.mjs  http://127.0.0.1:8779 <out>
HB_TREE=<tree> node .../scripts/layout-sweep.mjs
HB_TREE=<tree> node .../scripts/title-fit.mjs http://127.0.0.1:8779 <out>
HB_TREE=<tree> node .../scripts/auto-on-capture.mjs http://127.0.0.1:8779 <out>

cd /home/user/hullbreaker/.claude/worktrees/T-101 && node tools/pathcheck.mjs          # informational, host skip knob set
```
The `desktop-check`, `qa-touch-extra`, `phone-first-ten`, `viewport-sweep`, `layout-sweep` copies
default `HB_TREE` to this repo checkout, so they keep working after the worktree is pruned;
`title-fit` and `auto-on-capture` default to `/home/user/hullbreaker`.

## 9. Evidence index (all under `reports/tasks/T-101/playtest-evidence/`)

`proof-landscape/`, `proof-portrait/`, `mutate-release-all-on-up/` (report JSON + console log each);
`smoke-mid/`, `smoke-baseline-main-mid/` (with `ab-compare.txt`), `smoke-transform/` (trimmed
reports + `summary.md`); `desktop/` (JSON, log, title and playing JPEGs); `extra-probe/` (landscape,
portrait, MUTATED JSON + logs); `first-ten/`; `viewports/` (JSON, log, `layout-sweep-96.txt`, six
JPEGs); `title-fit/`; `auto-on/`; `shots/` (my 11 proof captures as JPEG q82); `scripts/`.

## 10. Housekeeping

Servers 8778, 8780 and the 8780 re-start were stopped; 8779 is stopped at the end of this gate.
(One careless `pkill -f` pattern killed my own shell once; it touched no other lane's process.) The
worktree is clean at `49f6a0a`. Merge-gate freshness: this file's mtime is later than the head
commit (`2026-10-23 00:56:07`); any new commit on `task/T-101` makes this verdict stale and the
branch needs this gate again. Suggested next action for the integrator: merge through
`tools/orch/merge-task.sh T-101` (both verdicts are green), then put the deck on the iPhone,
sideways, at the plain URL, and watch the three iOS-only behaviours (left-edge swipe, zoom,
first-tap sound) plus question 4 above.
