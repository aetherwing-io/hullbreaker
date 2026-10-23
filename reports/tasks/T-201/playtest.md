PASS

# T-201 playtest gate: the race pass (follow-lead, corners that never wait, survivors follow)

Gated head: `task/T-201` @ **c48ca1e** (the dispatched head). The lane branch has since advanced to `3b0d9e6`
(integrator merge chores). The delta is four files (`reports/tasks/T-201/build.md`,
`tools/pathcheck/t-102-corner-turns.mjs`, `tools/playtest/turn-capture.mjs`, `tools/playtest/turn-pose-capture.mjs`).
Tree hashes are **identical** at both heads for everything I ran or served: `src` 7aa0e091, `index.html` 2cd1acf8,
`assets` a1dc20fd, `tools/playtest/run.mjs` + `lib/` + both smoke scripts, `tools/simlab/race`, `tools/simlab/lib`,
`tools/simlab/turnlab.mjs`, `tools/serve.mjs`, `tools/orch/smoke-verdict.mjs` (`git rev-parse <commit>:<path>` on each).
Everything below therefore holds for 3b0d9e6 as well; the smoke runs were at c48ca1e as required.

Verdict basis: every claim in the dispatch reproduced on an independent sample, the escape hatches restore today's
run except where the documented zipper removal moves a trajectory (shown, by restoring the zipper in a scratch copy,
to be the only cause), the shipped page threw nothing, and nothing a player sees was broken in the frames I looked at.
No defect that blocks the merge. The lane's one self-reported miss, box 5 at portrait (skipping fights is free at
390x844, I-118), I re-measured (skip 6 hits vs rush 8) and do not treat as a gate failure: landscape is the tuning
target (entry 20 addendum) and the landscape rows show skipping costing pressure. Findings (all S3) and operator
questions are at the end.

What this report can and cannot claim (tools/playtest/README.md "Honesty / limitations"): bots are evidence about
pacing, fairness and regressions, not a fun verdict. "Completes six sides without firing" is a statement about a
reflex-dodging bot with perfect jump timing (`skip`), not about a new player. Browser captures ran at ~0.1-1 fps under
SwiftShader on a host at load 50-90, so the sim advanced in 50 ms variable-dt steps (20 Hz); timings measured there are
quantised to 50 ms. The headless lab is a Node replica of `src/main.js` (section 8 has the proof, against the real
page, that it is the game).

## Pin and provenance

- Throughout, `S=/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t201-gate`.
- Lane export: `git -C /home/user/hullbreaker archive c48ca1e | tar -x -C $S/lane` (done by the interrupted session; the
  commands re-create it). Every tracked file hash-compared against `git ls-tree -r c48ca1e`
  with `git hash-object`: 2267 of 2267 identical, checked at the start and again after the last run (no file modified;
  the only newer entry was the `tools/playtest/node_modules` symlink). Served `node /home/user/hullbreaker/tools/serve.mjs
  8802 --root $S/lane --quiet --keep-orphan`.
- Main reference: `git archive main` export in `$S/main`, served on 8803. Its code is identical to main's: `src`,
  `index.html`, `assets` trees equal at main 15a55c5 and at the merge base 1d2d150 (it differs from main HEAD only in
  `SPRINT.md` and three `reports/tasks/*` files added since). "mainlab" in the lab sections = that export's `src/` with
  the lane's `tools/simlab/` copied in (the lane changed none of `src/main.js`, `src/boot/run-reset.js`, so the lab
  replica's drift guards pass on main's sim).
- A previous, interrupted session of mine had produced some artifacts against the same export. I reused four kinds, after
  confirming the export was byte-identical to c48ca1e and unmodified since before they ran: the first smoke runs (both
  scripts were re-run fresh in this session as well), the 22-pair cross-tree table, the single lab runs for `?follow=0`
  alone, `?hinge=flow` and the `rush` portrait row (these three I did **not** re-run), and the desktop/phone boot frames.
  Seven of the earlier single lab runs and four of the moved cross-tree pairs were reproduced fresh and match digest for
  digest. Everything not named here was produced in this session.
- Servers killed, exports deleted when done. Evidence (screenshots, reports, JSON, my helper scripts) stays under
  `$S/out/` and `$S/*.mjs|sh`; nothing was written to the main checkout except this file.

## 1. Merge-gate smoke set (lane harness, pinned lane export, `HB_HARNESS_SLOWDOWN=200`, 480x300)

Head: **c48ca1e** (export hash-verified). Judged with `node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs`.
Both scripts were run **twice** at c48ca1e (one run from the interrupted session, one fresh in this one); final sim
states are bit-identical between the pairs.

```
cd $S/lane/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8802 --out $S/out/rerun-mid-lane      # and out/smoke-mid (earlier)
node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300 --max-runtime-ms 20000 --base-url http://127.0.0.1:8802 --out $S/out/rerun-tr-lane   # and out/smoke-tr (earlier)
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs <out>/report.json
```

| run | verdict | tick | outcome | deaths | page / console errors | bootError |
| --- | --- | --- | --- | --- | --- | --- |
| mid-route, lane (fresh) | **PASS** | 594/594 | not-completed (script window, as on main) | 0 | 0 / 0 | none |
| mid-route, lane (earlier) | **PASS** | 594/594 | same | 0 | 0 / 0 | none |
| transform-slice, lane (fresh) | **PASS** | 938/1104 | completed (VICTORY at tick 938, as on main per smoke-verdict) | 0 | 0 / 0 | none |
| transform-slice, lane (earlier) | **PASS** | 938/1104 | completed | 0 | 0 / 0 | none |

Metrics vs main (A.5 vocabulary, mid-route): `closestCrushApproachTiles` 26.53 on main, lane, lane-hatch; hits 3, kills 0,
deaths 0 on all. `idleTimeFraction` 0.318 / 0.334 / 0.338 / 0.342 and proxy `protoScore` 1042-1148 vary between runs
whose final sim states are bit-identical: they are polled-sample artefacts (wall time 263-319 s at this load), not trends.
Do not read the 9% protoScore spread as a regression. Judgement: the smoke set **PASS** at c48ca1e (and 3b0d9e6, same
runtime); the integrator may use `--skip-smoke` on that basis.

## 2. Default URL boots, errors, HUD encounter line (plain `index.html`, no `testapi`/`shell` params)

Tool: my `$S/t201-gate-capture.mjs` (own Playwright session; waits for the title, taps/clicks to start, waits for
`HB.state()==='PLAYING'`, records every `pageerror`, `console.error`/warning, failed request, HTTP >= 400, the HUD
geometry and `__HB_TOUCH().layout`; then measures every distinct string `rollingEncounterText` can emit (974 strings,
enumerated over its input space from the served tree) written into the live `#hudObjective` slot at the real font/CSS).

| viewport | reached PLAYING | page/console errors | failed requests / HTTP >= 400 | HUD line at start | 974-string fit: truncated / clipped by viewport / overlapping cluster, chips, RIG panel |
| --- | --- | --- | --- | --- | --- |
| 1280x720, mouse, DPR 1 | yes (153 s after navigation, host starved) | 0 | 0 / 0 | `WAVE 1/6 · OBSERVE · CONTACT`, panel 425..855 x 14..56, one line | 0 / 0 / 0 |
| 844x390, touch, DPR 1 | yes (116 s) | 0 | 0 / 0 | same text, panel 514..834 x 7..41; touch cluster 558..814 x 262..378; AUTO/II chips y 54..99 | 0 / 0 / 0 |
| 844x390, touch, DPR 2 | yes (263 s) | 0 | 0 / 0 | identical geometry | 0 / 0 / 0 |
| 390x844, touch, DPR 2 (extra) | yes (292 s) | 0 | 0 / 0 | panel under the RIG panel, one line, clear of AUTO/II | 0 / 0 / 0 |

Longest string 28 characters ("WAVE 1/6 · OBSERVE · CONTACT", "QUARANTINE · 10 HOSTILES +9"); the slot is 304 px wide on the
phone at 8 px type (28 characters is about 158 px by the CSS metrics, so there is slack), 400 px on desktop. Console warnings are the same classes on every run:
preload credential-mode / unused-preload messages from `index.html` (unchanged by the lane) and a GPU-stall driver
message. The 1280x720 corner run (below) additionally logged "HULLBREAKER art: ... still loading after 8973 ms of the
2500 ms boot budget" for the sprite/texture atlases: the game's own safe-degrade path (entry 16) firing because the
host starved the loader; those frames therefore show primitive fallback hostiles and flat hull material (see Limitations).
Judgement: boots clean at both required viewports; the encounter line is fully visible and clear of the touch cluster.

## 3. A corner with enemies alive, played from boot without firing, 844x390 touch (and 1280x720)

`node $S/t201-gate-capture.mjs --base-url http://127.0.0.1:8802 --viewport 844x390 --touch --dpr 1 --out $S/out/phone2 --tag phone- --stages boot,corner,hudfit`
(and `--viewport 1280x720 --out $S/out/desktop2 --tag desk-`). Nothing staged: an in-page driver holds RIGHT, jumps at
holes and steps, **never fires**, tops RIG's hp up each frame (so the capture is about the corner, not survival), and
pauses on the first frame of each milestone to screenshot it with the HUD forced visible. A separate per-frame log
(every rAF: sim clock, scroll, RIG x/y/vx, corner state, whether RIGHT was held) measures the wait independently.

Phone, corner 1 (RIG x / scroll / HUD line):

| milestone | state | RIG x / scroll | what the sim says | HUD line | frame |
| --- | --- | --- | --- | --- | --- |
| approach | idle | 100.30 / 81.70 | 4 encounter wasps + ambient bodies alive | `OBSERVE · 4 HOSTILES` | `out/phone2/phone-844x390-touch-dpr1-c1-02-approach.png` |
| arrive | approach (already armed) | 112.72 / 98.00 (the halt) | 4 encounter bodies alive | `OBSERVE · 4 HOSTILES` | `...-03-arrive.png` |
| t350 | turning | 113.00 / 98.00 | 4 survivors now followers, dormant | `4 FOLLOWING → INTERCEPT` | `...-04-t350.png` |
| t700 | turning, after camera hand-off | 113.00 / 98.00, facet 1 | 4 dormant | (panel fading, empty) | `...-05-t700.png` |
| done | done | 113.47 / 98.40 | 4 dormant, corner boom flash | `INTERCEPT · 4 FOLLOWING` | `...-06-done.png` |
| enter | done | 134.62 / 113.20 | follower #9 condensing at x 139.06 (4.4 tiles ahead of RIG) | same | `...-07-enter.png` |
| follow (+600 ms) | done | 140.26 / 115.91 | all 4 condensing, x 136.3..150.0 | same | `...-08-follow.png` |
| late (+3.2 s) | done | 152.65 / 127.98 | all 4 materialised, x 130.7..149.2 | same | `...-09-late.png` |

The 1280x720 run reproduces the same sequence (arrive 112.72/98.00, done 113.47/98.40, enter 134.15/113.15,
follow 139.79/115.93, late 157.45/131.10; HUD `INTERCEPT · 5 HOSTILES +4` at +3.2 s once side 2's beats are out).

Independent per-frame log (phone `$S/out/phone2/...-sidecar.json` frameLog, 422 frames; desktop 442 frames), analysed with
`$S/framelog.mjs`:

| | phone 844x390 | desktop 1280x720 |
| --- | --- | --- |
| RIG's front reaches the joint (112.6) | sim 14100 ms | 15200 ms |
| corner armed (idle -> approach) | +50 ms (1 frame); scroll lands exactly on the halt, 98.0 | +100 ms |
| turn starts | +100 ms after reaching the joint | +150 ms |
| RIG pressed RIGHT but stood still (\|vx\|<0.3) within 6 tiles of the joint | **0 ms** | **0 ms** |
| RIG's screen position in the 4-5 s after the turn | x 434..604, y 182..218 of 844x390 | x 662..941, y 335..403 of 1280x720 |

(Frame steps are 50 ms here, so 100-150 ms is 2-3 frames; the 60 Hz lab says 83-100 ms.) Judgement:
- **The turn fires without RIG waiting at the joint**: RIG ran through at full speed (vx 9.4) from arrival into the turn.
- **Followers re-enter inside the view and ahead of RIG**: first sighting 4.4 tiles ahead on screen at x ~552 of 844
  (phone), all four inside the frame at +0.6 s and +3.2 s, none drawn before the camera anchor had crossed the bend
  (they are dormant and hidden through the ritual and the first ~3.2 s: `enemyEcologyCondensationStarted` returns false
  for the non-finite `enterUntil`, so `hideHostileVisual` runs; no ghost, NaN or stale-position draw anywhere in the frames).
- **Readability at 844x390** (frames, 3x-10x nearest-neighbour crops in `out/phone2/crops/`): RIG is 17-18 px tall
  (4.5% of 390, 10x crop of the start frame) and findable after the turn; wasps are 8-14 px. At +0.6 s only one of four
  condensing followers is distinguishable; at +3.2 s all four are present as small bodies, their spit (yellow dashes) is
  clear. This is the shipped phone FAR frame (T-107's closer frame is not merged); an operator question below.
- **Nothing drawn on an unbuilt face / no assembly**: the arriving facet is whole at t700 / done / enter / follow / late
  at both viewports; no partial deck, no hole at the pre-bend column, no moving anatomy.
- **RIG findable after the turn**: yes, with one exception at the single frame `done`, where the corner-boom flash
  (existing juice, unchanged by the lane) sits on RIG's position; RIG is visible again by `enter`.

## 4. Headless proofs (lane's `tools/simlab/race/lab.mjs one`, fresh Node process per run, 60 Hz, every default verb on)

Commands (each also with `--query gates=legacy`, `--query follow=0`, `--query 'follow=0&gates=legacy'`, `--query hinge=flow`):
`cd $S/lane && node tools/simlab/race/lab.mjs one '{"policy":"skip","seed":N,"viewport":"desktop-16x10|phone-landscape|desktop-16x9|phone-landscape-6pct|phone-portrait","maxGameMs":600000}'`
(`phone-landscape` = 844x390; `desktop-16x10` = 1280x800; `desktop-16x9` = same aspect as 1280x720). Tables in
`$S/lab-table.mjs` output over `$S/out/lab2`, `$S/out/lab3`.

No-fire (`skip` = rush's movement, trigger never pulled), default race pass vs the `?gates=legacy` falsifier:

| viewport | seeds | default | `?gates=legacy` |
| --- | --- | --- | --- |
| 1280x800 | 1, 2, 3 | VICTORY 6/6 sides in 106.6 / 102.3 / 111.8 s | timeout at 600 s, 0 sides, held at gate 1 for 587 s (seeds 1, 2) |
| 844x390 | 1, 2, 3 | VICTORY 6/6 in 108.0 / 105.2 / 101.0 s | timeout, 0 sides, held 587 s (seeds 1, 2) |
| 16:9 (s1), 6% closer-frame estimate (s1), 390x844 (s1) | 1 | VICTORY 6/6 in 102.5 / 106.3 / 98.5 s | 16:9: timeout, held 584 s |

Across the 22 distinct default runs (9 no-fire, 5 rush, 4 climber, 4 carried; 1-3 seeds; desktop/phone, plus 16:9, 6%, portrait):
**22 of 22 VICTORY with 6/6 sides; 132 corner turns observed; hold at the closed joint (pressing into it) <= 33 ms
on every corner; no held gate (0 s in the gate state); followers carried 389, seen re-entering 389, dropped 0**
(carry-over 4/4/0 at corners 1-5 for the no-fire policy, 0-4 for policies that kill; corner 6 carries none by design).
The one arrival-to-turn gap above 120 ms (0.53 s, `skip` seed 1 @ 844x390, corner 4) is RIG walking the last tiles
after the corner had already armed one frame after arrival (hold pressing at the joint: 17 ms), not a wait.
Idle (no input) is not a softlock: game over at 22-29 s on all three viewports. `?follow=0` alone: the no-fire run
completes (143.8 s desktop, 148.4 s phone) but RIG presses into a closed joint 5.3-6.2 s (desktop) / 5.6-7.9 s (phone) per
corner, which is today's plane and shows the follow term is what removes the wait. `?hinge=flow`: completes (103.4 s).
Determinism: 7 lab runs reproduced bit-for-bit against my earlier-session runs, and `skip` s2 @ 844x390 gives the
lane's own quoted digests `0c48c1a4` / `4263e816`; the `carried` s1 desktop floor pair (default vs `?follow=0`) shares
simDigest `6e6314f6`, the lane's quoted value, with 0 frames where either follow term could act.
Sight cross-check (oracle@0 seed 1): median route ahead ~21 tiles (1280x800) and ~30 (844x390), 2.7% / 3.1% of frames under
3 tiles (lane: 21 / 28, 3%).
Price is pressure (boxes the lane self-reports): skip takes 11-16 hits and 5-8 HULL FALLBACKs per run on landscape against
rush's 7-10 hits / 3-5, and at **portrait** skip 6 hits / 3 vs rush 8 / 3 (free), as the lane reported (I-118).
`fighter` (target-first bot): 2 of 4 runs time out (desktop s1 in side 5, phone s2 in side 3), 2 finish (347-383 s). I
inspected the desktop s1 stall: RIG dances on a y=12 catwalk at x 433-439 aiming diagonally at hounds 8.5 tiles below on
the deck with the joint open and continuous ground at y=3 on both sides: a bot-aim loop, nothing blocks walking on.
Turnlab (`node tools/simlab/turnlab.mjs matrix`, lane export): 56 runs, every one VICTORY with 6/6 corners and
"violations: none": `run, idle, backtrack, die-after-turn, die-mid-turn, hit-mid-turn, pause-mid-turn, resize-mid-turn,
resize-approach` at 1280x720, 844x390 and 390x844 (27); `jump, jump2, backtrack-approach, die-at-hinge, drop-at-hinge,
stock-life-at-hinge, pop-weapon-at-hinge, resize-approach-late, resize-gate` at 1280x720 and 844x390 (18); `run, idle,
resize-mid-turn, resize-approach, die-mid-turn` at 260x1000 (5); `run, die-after-turn, hit-mid-turn` with `hinge=flow` at
1280x720 and 844x390 (6). The R4 A/B reproduces the lane's table exactly (default 66/65 stalled ticks per corner, 394 per
run, 5732 ticks; `hinge=flow` 41 per corner, 246, 5582 ticks).

## 5. Hatch fidelity: `?follow=0&gates=legacy` on the lane vs main

Browser, deterministic (`scripts/mid-route.json`, 480x300, frame-scoped input, `fixeddt=16.667`, identical flags on each):

| tree / URL | tick | gameMs | x | y | hp | kills | scrollX | lives | page / console errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main (8803) | 594 | 9900.198 | 55.649 | 1 | 2 | 0 | 56.2042574319988 | 3 | 0 / 0 |
| lane default (8802), 2 runs | 594 | 9900.198 | 55.649 | 1 | 2 | 0 | 56.2042574319988 | 3 | 0 / 0 |
| lane `?follow=0&gates=legacy` | 594 | 9900.198 | 55.649 | 1 | 2 | 0 | 56.2042574319988 | 3 | 0 / 0 |

Identical in every field. Note this script plays the traversal slice, where the race pass is inert by construction
(`ACTIVE_FIXTURE === null` guards), so it proves "no unintended change to the slice", not "the six-face hatch". The
six-face evidence is the lab:

- Cross-tree: main's `src/` vs lane `src/` with both hatches, same lane lab, 30 pairs (the interrupted session's 22 plus 8
  new ones on seeds 4 / climber seed 2 that nobody had run): **22 identical, 8 moved** (oracle@1500 seeds 1-3 and
  oracle@3000 seed 3 @ 844x390, and in the new sample climber s2 @ 1280x800, oracle@1500 s4 @ 1280x800 and @ 844x390,
  oracle@3000 s4 @ 844x390). This is the lane's own number (18/22 + 4 moved) reproduced, then extended.
- Why they move: I traced the first divergence frame by frame for the lane's four moved runs (`traceEveryMs` and
  `snapshotsAtMs`, `$S/out/diverge/`). All four first divergences sit at a corner pivot (x 288.25 / 376.25: RIG standing
  on the pre-bend deck). In three the first differing quantity is a kill (a wasp beyond the pivot dies earlier on main:
  0.25 hp against 1.75 a frame before, i.e. RIG's shots cross the pre-bend columns on main and not on the lane); in the
  fourth RIG takes a hit on main and not on the lane. Main reports those columns as holes (`builtGroundTopAt` -999,
  `columnBuilt` false at x 286..292) and the lane reports them solid (3, built), which is exactly entry 25 / I-105.
- Proof it is the only cause: I built a scratch copy of the c48ca1e `src/` with main's `src/sim/level.js` restored, main's
  `zipperOffset` appended to `src/pure/waves.js`, main's `updateZipper` / `revealFaceRest` re-added to `wavegate.js`'s
  `finishCorner`, and main's per-frame `updateZipper(c, t)` call re-added to `scroll.js` (`$S/make-lane-zip.mjs`, my own
  transcription, not the lane's). With both hatches on, **all 8 moved runs become digest-identical to main** (bd06c48b,
  99e74983, 5650d45e, 9dc64544; 778e2cf2, c3fba195, f2ed7f0d, 3da97135). So the hatches restore main's run exactly
  except for the intended removal of the zipper, which makes the pre-bend column solid for bullets, wasp dive floors,
  flame crawl, mortar zones and capsules; 8 of 30 sampled six-face trajectories show it.

## 6. `?selftest=1`

`node $S/t201-selftest.mjs --base-url http://127.0.0.1:8802 --viewport 1280x720 --label lane --out $S/out/selftest`
(and `--viewport 390x844`, and `--base-url http://127.0.0.1:8803 --label main`); the title is read after the page's own 1.5 s timer:

| tree | viewport | title | page errors |
| --- | --- | --- | --- |
| lane c48ca1e | 1280x720 | **SELFTEST PASS (39 checks)** | 0 |
| lane c48ca1e | 390x844 | SELFTEST FAIL: view resolved and portrait pullback applied | 0 |
| main | 390x844 | SELFTEST FAIL: view resolved and portrait pullback applied | 0 |

The portrait failure is the **same single check** on main and on the lane (I-114, T-107's portrait framing); not a T-201
effect.

## 7. Screenshots judged (boards 13/14, visual invariants)

Frames: `$S/out/phone2/*.png` (844x390 touch, painted sprites loaded, no art warnings), `$S/out/desktop2/*.png`
(1280x720; art-budget fallback active, composition/HUD/behaviour only), `$S/out/phone-dpr2/`, `$S/out/portrait/`.
The lane changes no render code (`git diff --stat main c48ca1e -- src`: config, mode, pure/waves, pure/momentum,
pure/level1-ecology-encounters, sim/level, sim/pace, sim/scroll, sim/wavegate, ui/hud), so the visual surface of T-201 is
the HUD line, when/where bodies appear, and where the camera sits. Judged on those:
- Side-on camera with slight perspective, connected-hull decks and catwalks, rust/teal palette, RIG 4.5% of frame height
  on both 1280x720 (32 px of 720) and 844x390 (17-18 px of 390): inside the 3-5% invariant. Connected surfaces: yes.
- Static anatomy: the next facet is whole when revealed; nothing builds, nothing moves except the permitted mechanisms.
- The turn composition (t350, t700) matches the existing ritual; the corner boom flash is unchanged.
- Pre-existing, not T-201, visible in these frames: flat clear-colour (#2F565E) strips at the screen edge (right edge 10-17%
  of the width at approach/arrive, left edge ~12% for about 5 s after the turn at 844x390): I-102 (T-107). The
  follow-lead makes the right-edge strip appear about 2.5 s earlier than at a held gate; proposed finding I-121.
- Style breaks attributable to T-201: none found. Pacing dead spots: the ritual (1.1 s) plus ~3.2 s until the first follower
  condenses (4.3 s after the turn starts) have no followers on screen while the HUD says "N FOLLOWING"; ambient bodies
  (5 at x 153-168 at `enter`) and side 2's first beat keep the stretch populated. Operator question 2.

## 8. Extra checks I ran because bots can miss what a player sees

- Followers' proximity at the moment they become shootable (95 followers, five no-fire runs, desktop and 844x390,
  100 ms snapshots, `$S/reentry-run.mjs`): all 95 first appear **ahead** of RIG (3.6-14.3 tiles), become shootable 0.9 s
  later at median |dx| 1.9-3.5 tiles; 34 of 95 within 2 tiles horizontally, 11 of 95 within 2.5 tiles in 2-D, 46 of 95
  already behind RIG. (A racer runs past most of them; the chase the entry-23 wording describes.)
- Concurrent bodies (the lane's addendum flags it as an operator question; I measured it, 100 ms snapshots,
  `$S/peak-bodies.mjs`): `skip` s1 desktop peak 27 alive / 23 materialised and in view, in-view p90 17, p99 23, **27% of
  snapshots with more than 12 bodies in view**; `skip` s1 844x390 peak 28 / 25, p90 15, 19% above 12; `climber` s1
  desktop 23 / 18, 7%; `rush` s1 desktop 21 / 18, 11%. For comparison the lane's addendum reports 12 on main for the
  same climber run and 6 for a competent shooter (I did not re-measure main over a full run: its no-fire and climber
  bots never leave the first held gates, so a whole-run comparison does not exist for them).
- Real page vs the lab replica (`node tools/simlab/race/browser-check.mjs --width 640 --height 400 --stop-ms 24000`,
  default URL, frame-exact hold-right + fire + jumps schedule through the shipped input contract): **MATCH, 1440 ticks,
  final state identical** (RIG x 152.649, scroll 133.065909, 7 kills, 8 hostiles, corner 2 idle, every hostile's x/y/hp
  within 1e-6, live edges within 4e-7 of the replica's), with the page having turned corner 1 and re-entered the
  followers. This is what makes the section 4 lab numbers the shipped sim's numbers.

## Limitations

- Browser captures: 50 ms variable-dt steps, hp topped up by the capture driver, an in-page driver (not a human, not
  the keyboard path; the real input path is covered by `browser-check.mjs`'s frame-input and the smoke scripts).
- The 1280x720 corner run was taken with the host at load 50-90: the art boot budget was exceeded, so its hostiles and
  hull material are the game's safe fallbacks. Its HUD, framing, timing and behaviour are valid; do not judge its art. The
  844x390 and DPR 2 runs did not trip the budget.
- Not exercised: `?hinge=flow` in a real page (lab only), `?zip=1` (retired; I-116), a full six-side run in a real page,
  iOS Safari / a real GPU / 60 fps, audio, touch feel, restart-after-game-over with followers alive in a real page (the
  lab's reset registry guard and the turnlab die-* policies cover it; the code resets every new field in
  `resetCornerEvents`). I did not run `pathcheck` (the merge gate does).
- `skip`, `rush`, `climber` are reflex bots with dodge skill; their hit counts are comparative, not what a person takes.

## For the operator (feel questions, never gated)

Serve the lane and play on the phone at 844x390; URLs: `index.html` (race pass, default), `?follow=0&gates=legacy` (today's
run), `?gates=legacy`, `?follow=0`, `?hinge=flow` (unjudged A/B, off by default).
1. After a corner, do the survivors read as chasing you, or as an ambush? They appear 4-14 tiles ahead but a runner reaches
   them first: about half end up behind you when they turn hostile, a third within two tiles. Is four the right number?
2. After each turn there are ~4 s (1.1 s ritual plus ~3 s) with no followers on screen while the HUD says "4 FOLLOWING".
   Breather, or dead air?
3. When you skip fights, up to 23-25 bodies can be on screen at once (27% of a no-fire desktop run shows more than 12;
   the lane measured 12 on main for a climbing bot). Does the screen stay readable (pillar 5)?
4. On the phone frame (RIG ~17 px) can you find RIG and the followers while moving? Only one of four condensing followers
   is distinguishable 0.6 s into their entrance.
5. Camera: RIG now rides about a quarter of the frame in from the right edge and the frame moves with you whenever you
   lead. More lookahead, but is it comfortable? Also: the turn fires 0.1-0.15 s after you arrive and locks RIG 1.1 s on the
   hinge: crisp, or does the corner snatch control? (default vs `?hinge=flow`.)

## PROPOSED INBOX ISSUES

(Numbers are tentative; the integrator assigns them. All S3: none blocks the merge.)

```
## I-121 | art | S3 | repro: node $S/t201-gate-capture.mjs --base-url <lane c48ca1e> --viewport 844x390 --touch --dpr 1 --stages boot,corner (plain index.html) | evidence: $S/out/phone2/phone-844x390-touch-dpr1-c1-02-approach.png, -03-arrive.png, -06-done.png, -07-enter.png
Flat clear-colour (#2F565E) strips at the frame edge are visible in motion under the follow-lead: the right edge shows
about 10% of the width (x >= ~760 of 844) at the approach frame and 17% or more at arrival, because the view now reaches 24
tiles past RIG up to the undrawn arriving facet; the left edge shows ~12% for about 5 s after each turn. Same defect class as
I-102 (T-107 owns the fix); T-201 does not enlarge the worst case (the arrive frame is the held-gate frame) but shows it
for the last ~2.5 s of every approach instead of only at the halt. Re-judge when T-107 lands.

## I-122 | fairness | S3 | repro: lane lab run-child with snapshotsAtMs every 100 ms (script $S/peak-bodies.mjs): policy skip seed 1 viewport desktop-16x10 and phone-landscape @ c48ca1e | evidence: playtest.md section 8
Peak concurrent bodies roughly double for policies that do not kill because the ambient stream is no longer retired at
the halt and followers ride on top: skip s1 desktop 27 alive (23 in view; 27% of snapshots above 12 in view), 844x390 28 / 25
(19%), climber 23 / 18, rush 21 / 18, against the 12 the lane's addendum measured on main. The addendum calls it an operator question; the lab
measures no peak-bodies figure and nothing bounds it. Add peakBodiesInView to the race lab and decide a bound (or an ambient
cap while followers live) after the operator's readability verdict. Pillar 5.

## I-123 | fairness | S3 | repro: $S/reentry-run.mjs <lane tree> skip {1,2,3} {desktop-16x10,phone-landscape} | evidence: playtest.md section 8
Extends I-118 from portrait to landscape: followers condense 3.6-14.3 tiles ahead of a racing RIG but become shootable 0.9 s
later at median 1.9-3.5 tiles from it (34 of 95 within 2 tiles horizontally, 46 of 95 behind). It is the chase the entry-23
wording asks for, and only 11 of 95 land within 2.5 tiles in 2-D, so a feel call first; recorded so the operator's answer to
question 1 has numbers.

## I-124 | docs | S3 | repro: read README.md query-flag list, docs/HANDOFF.md, docs/DESIGN.md implementation record | evidence: reports/tasks/T-201/build.md "Docs not edited here"
The new defaults (never-wait corners, follow-lead) and the flags ?follow=0, ?gates=legacy, ?hinge=flow (and the removed sim
zipper) are described nowhere outside the build report. Update at merge. Also comment on I-114: the portrait selftest
failure is the same single check ("view resolved and portrait pullback applied") on main and on task/T-201.
```
