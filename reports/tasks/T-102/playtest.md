PASS

# T-102 playtest gate: the corner turns

QA gate, 2026-10-23. The verdict covers worktree
`/home/user/hullbreaker/.claude/worktrees/T-102`, branch `task/T-102`, commit
`6d3e58fe39a05e7c3ec0857f1edd9f06417c3f02` (clean at the start and at the end of
the gate; re-checked before this file was written). Bots and headless labs are
evidence about regressions, pacing and fairness; they are not a fun verdict.
This file makes no fun or feel claim. Feel observations are routed to the
operator questions near the end.

## Verdict, in one paragraph

PASS. Both smoke scripts complete on the pinned build with no boot error, page
error, console error or death (transform-slice on its second attempt, because the
first was cut by the host's wall-clock cap at tick 913 of 938, not by the game).
D1, D1b, D2 and D3 reproduce on the true base commit and are clean on the fixed
tree, and the falsifier's P1, P2 and P3 rows go red. In all 48 captures RIG is on
screen and standing on drawn geometry, and every turn reads as RIG rounding a
static faceted structure: nothing assembles, and from the hand-off on the arriving
face is fully present (D4 fixed, measured and seen). R1 (the t680 to t700 pop), R2
(edge voids) and R3 (post-turn zoom) are present exactly as the build report
says, unchanged by this lane. Nothing I found blocks the merge; the new findings
are S3 and are listed under "PROPOSED INBOX ISSUES".

## 1. Pinning

| item | result |
| --- | --- |
| worktree head | `6d3e58f`, `git status` clean (0 lines) before, during and after |
| runtime diff vs base `98b12c9` | six files, +125/-22: `src/pure/waves.js`, `src/render/route-visibility.js`, `src/sim/player.js`, `src/sim/scroll.js`, `src/sim/wavegate.js`, `src/ui/hud.js` |
| server | `node /home/user/hullbreaker/tools/serve.mjs 8773 --root /home/user/hullbreaker/.claude/worktrees/T-102 --quiet` (main's copy). `curl -I` shows `Cache-Control: no-store`. The six changed files are served byte-identical (md5) to the worktree, and the served `route-visibility.js` (`4dc535f6…`) differs from main's (`4a9bf63a…`), so main was not being served |
| "before" tree | `git archive 98b12c9` exported to a scratch directory with only the four new lab files overlaid (`tools/simlab/turnlab.mjs`, `turnlab-falsify.mjs`, `lib/sixface-host.mjs`, `lib/turn-proof.mjs`; the lab resolves `src/` relative to itself, so it tests the base code). `diff -rq src` against the worktree lists exactly the six files above. A second server on 8774 serves that export (md5 of its `route-visibility.js` equals main's) |
| host knobs | `. ~/.hullbreaker-host.env` in every shell (`HB_HARNESS_SLOWDOWN=40`, `HB_SMOKE_VIEWPORT=480x300`, browser probe skipped) |

## 2. Smoke set (deterministic, pinned build, main's harness)

```sh
cd /home/user/hullbreaker/tools/playtest && . ~/.hullbreaker-host.env
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8773 --out /tmp/t102-smoke-mid
node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300 --max-runtime-ms 20000 --base-url http://127.0.0.1:8773 --out /tmp/t102-smoke-tr
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs <out>/report.json
```

| script | result | evidence |
| --- | --- | --- |
| `mid-route.json` | **PASS**: `smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`. 26 of 26 events dispatched, exact stop at tick 594, `bootError` none, `pageErrors` [], 0 console errors, 0 deaths, 0 falls, hp 2 at the end. 432 s wall at load 22 to 31 | `playtest-evidence/smoke-mid/` |
| `transform-slice.json`, attempt 1 | **not a result**: `stopReason max-runtime-ms` at 800 s wall (20000 ms x `HB_HARNESS_SLOWDOWN` 40), tick 913 of 938 (the slice wins at 938), gameMs 15 200. Both transformation rituals were already `done`; no boot error, no page error, 0 deaths. `smoke-verdict` reads this as FAIL only because the ledger never reached its end. A harness/host limit, so retried | `playtest-evidence/smoke-transform-attempt1-capped/` |
| `transform-slice.json`, attempt 2 | @@TRANSFORM@@ | `playtest-evidence/smoke-transform/` |

Notes on reading these:

- `mid-route` final state (x 55.649, gameMs 9900.198, hp 2, 0 falls) equals the
  deterministic reference recorded in `tools/playtest/README.md` for this script.
  scrollX (56.204 vs 56.085) and kills (0 vs 1) differ from that 2026-08-05
  reference, which predates many commits and used another viewport, so I do not read
  that as a regression signal.
- I did not run a base A/B of the smokes: the T-102 diff cannot execute in them. The
  transform slice returns from `updateScroll` before the changed lines
  (`src/sim/scroll.js:30-36`), fixtures get an infinite route window from
  `cornerPlayerRouteWindow` (so `clampToOwnedRoute` is the identity), and the gate
  call needs `state === 'gate'`. The build lane's own base control for the
  transform slice reports the same VICTORY state.
- The report's "idle 132.3 s of 374.9 s" (fraction 0.353), `minEdgeMargin` 26.53 and
  `protoScore` 1339.6 (proxy, no `HB.score`) are wall-clock-weighted samples from a
  throttled host (average sample interval 662 ms, maximum 2 872 ms; the sim itself ran
  9.9 s). Fractions and counts are usable; absolute seconds are not. Per the README
  they are trends, and there is nothing to trend against here (no base run).
- Wall-clock risk for the real gate: `tools/orch/merge-task.sh` caps mid-route at
  15000 x 40 = 600 s and transform-slice at 20000 x 40 = 800 s. This host needed 432 s
  and more than 800 s respectively. See the proposed process issue.

## 3. Defects reproduced headlessly, before and after

All commands are `node tools/simlab/turnlab.mjs run ...` run from the worktree
("after") or from the base export ("before"). Outputs are under
`playtest-evidence/headless/`.

| defect | command | before (base `98b12c9`) | after (`6d3e58f`) |
| --- | --- | --- | --- |
| D1 hinge death | `--policy die-at-hinge --viewport desktop` | `relocateOutsideOwnedRoute` 6, `playerFacetBackwards` 6, `popAfterRelocation` 6. First: tick 1155 (gameMs 19 266.7) RIG x 113 to 111.5 against a seal at 112.65, then a +1.5 tile pop at tick 1156 | VICTORY 6/6, violations none |
| D1b stock-life respawn | `--policy stock-life-at-hinge --viewport desktop --query fallback=0` | `relocateOutsideOwnedRoute` 8, `playerFacetBackwards` 8, `popAfterRelocation` 8, `rigCulledByFold` 2. First: tick 1155 RIG at x 70.5 against a seal at 112.65, +42.5 tile pop at tick 1156 | VICTORY 6/6, none |
| D1b via the plain run policy | `--policy run --viewport desktop --query fallback=0` (a real fall after a turn) | 2 relocations behind the seal, 2 culled-by-fold, 2 pops | none |
| D2 portrait softlock | `--policy run --viewport phonePortrait --gunner paced --pace 1400 --max-ticks 21600` | `TICK_CAP`, corners 2/6 (`3:gate`), `gateBlind` 18 131: gate 3 never opens | VICTORY 6/6 at tick 8 384 (gameMs 139 750); gate 3 resolved in 140 gate ticks; none |
| D3 scroll rewind | `--policy resize-approach-late --viewport narrowTall` | `scrollBackwards` 6 (and `gateBlind` 45) | VICTORY 6/6, none |
| D5 HUD "LAST SIGNAL" | lab replica of the old rule inside every run above | `hudLastButMore` 272 (desktop die-at-hinge) to 17 883 (portrait softlock) | 0. This is a replica of the old rule, not the real DOM; the real-DOM check of the new text is in section 5 |
| 14 further runs, fixed tree only | `pop-weapon-at-hinge`, `drop-at-hinge`, `jump2`, `backtrack`, `idle`, `hit-mid-turn`, `pause-mid-turn`, each at desktop and `phoneLandscape` | not run | all VICTORY 6/6, violations none |

Falsifier, from the worktree (scratch copies, never the worktree):

```sh
TMPDIR=<scratchpad> node tools/simlab/turnlab-falsify.mjs --fast-domain --only P1,P2,P3     # 186 s
```

The unbroken copy is green (59 passed, 0 failed). P1 (relocations ignore the route
window) went red on `relocateOutsideOwnedRoute` x6 and `popAfterRelocation` x6; P2
(a gate waits on bodies it cannot show) went red on the paced portrait run
(`2/6, TICK_CAP`); P3 (the dolly can rewind the scroll) went red on
`scrollBackwards` x6 at tick 1334. All three rows went red, as the task asked for P1
and P2. Matching the first two against the true-base runs above, the guards fail on
the same ticks the base fails on.

## 4. The captures: what a player sees

I read all 48 frames at native resolution (24 desktop from
`fix-1280x720-c{1-6}-{approach,t350,t700,after1500}.jpg`, 24 phone from
`fix-touch-844x390-c{1-6}-...`), plus `c1-t680` at both sizes and the base pair. To
find RIG in frames where it is 15 to 40 px tall I projected it with the lab's camera
replica (`playtest-evidence/headless/rig-px-*.json`, which reproduces the page
camera's yaw and facet in every frame, per the sidecars) and cropped on it
(`captures-analysis/desktop-rig-sheet.jpg`, `phone-c1..c6.jpg`).

The captures are posed, not played (the lane's `turn-pose-capture.mjs` header says
so, and why: SwiftShader renders under 1 fps). They show geometry and ownership at
four instants per corner. They show no motion and no hostiles, and the desktop
session's hull and Crown textures timed out (flat hull), so I judged geometry and
ownership only.

### The turn reads as RIG rounding a static structure: yes, at all 12 corner-views

Common to all six corners, desktop and phone:

- **approach**: RIG stands on the deck 0.6 tiles before the bend (3.76% of screen
  height on desktop, 3.77% on phone). A tall dark corner pillar is ahead. The arriving
  face is not visible (it is round the corner).
- **t350 (30 degree hold)**: RIG stands at the deck's end beside the pillar with the
  camera swung 30 degrees. The departing deck recedes to the left. The arriving face
  is not drawn yet (R1).
- **t700 (hand-off)**: the camera has arrived and the arriving face is fully drawn
  (catwalks, ladders, vent boxes, hull to the frame edge). RIG is at the arriving
  deck's left tip, grounded, beside a dark chamfer slab at the hinge, and not off
  screen (chest NDC x about 0.03 on desktop).
- **after1500**: RIG runs along the new face and the camera has moved (closer, R3).

| corner | desktop notes | phone landscape notes |
| --- | --- | --- |
| c1 | right edge flat teal 12.3% at approach | right void 19.0% at approach; left void 10.0 to 11.4% at t700 and after1500 |
| c2 | void 4.8%; a green-lit gap between two deck modules at t700 (background showing through, not a hole in the deck) | void 12.8%; at t350 a hard vertical backdrop-plane edge at about x 115 of 844 with a different dark texture left of it |
| c3 | right 10.1%; left 4.6% at t700 | right 17.3%; left 12.6 to 12.7% after |
| c4 | right 3.4%, no left void | right 11.8%; left 1.7 to 3.8% |
| c5 | right 11.6%; left 0.6 to 3.4% | right 18.5%; left 9.1 to 11.6% |
| c6 (Crown approach) | arriving face is the short Crown platform (30 rows), deck ending in a blunt end, the Crown mechanism drawn flat because its art timed out in that session | same, with the Crown art loaded (magenta lit mechanism); right void 13.5%, no left void |

RIG is visible, on screen and standing on drawn geometry in all 24 desktop and all
24 phone frames. Yaw lands exactly on k x 60 degrees after each corner (60, 120, 180,
240, 300, 360) and stays within [-1.36, 61.21] in the lab runs. RIG's chest stays
inside the frame (desktop x in [-0.04, 1.02], phone [-0.03, 0.87], portrait
[-0.12, 0.75]). The 1.017 at the desktop right clamp is the known I-104.

The "landing visible" part holds only from the hand-off on. At approach and at the
30 degree hold the arriving deck is not on screen at all, by the design of the late
hand-off (R1). That is R1, not a regression from this lane.

### D4: the arriving face is present at the hand-off and does not assemble: confirmed

- Page sidecar: arriving face drawn 88/88 at every `t700` (30/30 at the Crown
  approach), departing 0 shown, both viewports.
- Seen: `captures-analysis/d4-right-third.jpg` puts the right third of `base c1 t700`,
  `base c1 t860` and `fix c1 t700` side by side. The base's `t700` lacks the piston
  catwalk, the ladder tower and the vented lower module at the right; the base's
  settled `t860` has all three; the fix's `t700` already has all three.
- Measured on the untextured structure band (x 660 to 1280, y 200 to 470; hull texture
  differs between capture sessions, so it is excluded): pixels differing by more than
  24 levels, right third only. Base `t700` vs base `t860` (same session): **20.7%**
  (the assembly). Fix `t700` vs base `t860`: **5.8%**. Fix `t700` vs base `t700`:
  **18.2%**. The fix at the hand-off is far closer to the settled state than the
  base's own hand-off frame is.
- Code: `route-visibility.js` now passes `IS_G1 || routeColumnBuilt(s)`, so under the
  default reveal a row draws iff its facet equals the camera's facing facet
  (`routeRenderOwned`), and nothing else in `src/render/` reads the sim's construction
  rows under `IS_G1` (the zipper hooks in `level.js` no-op under it). No future facet
  can leak, and `?zip=1` still takes the old path.

### Known and unfixed (as briefed; not failures of this lane)

- **R1, the t680 to t700 pop.** `fix-1280x720-c1-t680.jpg` and the phone twin show
  the camera already looking down the new face with none of it drawn (RIG on top of
  the pillar over open backdrop); one frame later it is all there.
- **R2, edge voids**, measured by me on the fix captures as the share of columns from
  each edge that are at least 90% flat clear colour. Desktop approach right edge
  3.4 to 12.3%; phone approach right edge 11.8 to 19.0%; phone left edge after the
  turn up to 12.7%. The odd corners (c1, c3, c5) are the worst. These match the build
  lane's base numbers (12.0 / 4.4 desktop, 18.7 / 12.7 / 17.1 phone), so the lane
  neither fixed nor worsened it. On the phone it is on screen at every gate fight.
- **R3, zoom pump**, replica numbers reproduced: RIG height at approach / t350 / t700
  / after1500 is 27.1 / 32.8 / 39.3 / 32.3 px on desktop (3.76 / 4.56 / 5.46 / 4.49% of
  height) and 14.7 / 17.8 / 21.3 / 17.5 px on the phone (the same percentages). The
  concept-art invariant is 3 to 5% of screen height, so the transient exceeds it at
  the hand-off. Phone landscape rests at 3.8%, not the roughly 6% entry 20 asks of
  phones (T-107 has not landed).
- **R4, hinge stop**, reproduced: `pinnedInputTicks` 66 to 67 per corner (1.10 to
  1.12 s); 398 ticks = 6.6 s of a 145.7 s desktop run and of a 140.2 s phone run.

### Style against the boards

Palette and structure follow the visual invariants: deep teal atmosphere, rust-orange
trim and plates, magenta on the Crown, flat-shaded chunky geometry, a faceted tower
turned by the camera (board 13's "camera turn around a static faceted leg"). The
foreground hull is much darker grey-green than board 13/14's rust-orange armor (flat in
the desktop session because the hull tile timed out). That is a general environment-art
gap that this lane did not change; it is an observation, not a T-102 finding.

## 5. Checks I added beyond the brief

1. **The new gate HUD line in the real DOM** (D5). `gateRequirementText` can print up
   to 47 characters in played runs ("WAVE 4/6 · QUARANTINE · 2 HOSTILES · +1 INBOUND",
   on screen 75+ ticks), against 45 for the old maximum, and the panel is
   `nowrap` with `text-overflow: ellipsis`, so an overlong string would lose its
   `+N INBOUND` tail. In real Chromium on the pinned build I imported the page's own
   function, built 39 realistic strings from the authored encounter tables and 12
   worst-case strings, wrote each into `#hudObjective` at 1280x720, 844x390 (coarse
   pointer) and 390x844, and measured. Result: @@HUDFIT@@
2. **D2's reach.** With one logging line added to a scratch copy, retirements by
   `retireUnseenGateRows` over a full paced run: desktop 0, phone landscape 0,
   portrait 10 (gate 2: 2 hounds; gate 3: **both gating Iris polyps** at x 265.25 and
   266.75 against a strip of [271.99, 290.98], plus a hound; gate 4: a mortar and a
   hound; gate 5: a polyp and 2 hounds), 260x1000 7. This confirms the build report's
   claim that wide and landscape views are untouched.
3. **Resize at gate start.** Narrowing 1280x720 to 390x844 two ticks into gate 3
   (`probes/resize-gate-probe.mjs <tree> desktop 390 844 3 2`): the fixed tree goes
   from `polyp* wasp* wasp* hound wasp*` to two wasps, so the in-view gating polyp and
   the hound are retired, and the left-side pincer wasp is culled by the existing flyer
   edge cull. On the base the same action keeps all five rows and the run ends in the
   D2 softlock (`TICK_CAP`). Better than a softlock, but a free partial gate skip. See
   proposed issue 1.
4. **A lab false positive, present on both trees.** `--policy die-after-turn --viewport
   desktop --query fallback=0` reports `teleport` 9 (+1 `rigOffScreen`) on the fixed
   tree and `teleport` 8 on the base (plus the base's D1 kinds). They are one pattern:
   RIG sits at y -2.001 in a pit at x 313.6 to 321.4 with its margin to the left screen
   edge running from +0.4 to -0.55, and is shoved +1.0 tile each time (every 12 to 13
   ticks, the scroll rate of about 0.078 tiles per tick). That is the left crush edge,
   not a turn effect, and the lab's `teleport` invariant does not exempt it. Not a
   T-102 defect; see proposed issue 3.

## 6. What this gate cannot claim

- Posed frames show geometry and ownership at four instants per corner. They show no
  motion, no hostiles and no bullets near a bend. The only played cross-check is the
  build lane's, at c1 844x390 (`played-844x390-c1-t700.jpg` matches the posed `t700` to
  my eye: same drawn face, same void; I did not re-run it). I did not play a six-face
  corner turn in a real browser: at 15 to 40 s browser boots and about 1 frame per
  second, six turns per viewport take hours.
- Portrait was not captured in a browser (the lane's choice, and mine); every portrait
  claim here is headless.
- The labs use perfect or fixed-pace gunners and an hp top-up. They show the turn
  contract holds; they say nothing about outcome distributions (entry 19). D2 makes
  gates 2 to 6 easier on narrow views only (10 retired bodies on portrait, none on
  landscape or desktop); the spread there is unmeasured.
- I did not run `node tools/pathcheck.mjs`. By entry 21 a green gate is not evidence,
  and this verdict does not rest on it. The merge gate runs it separately.
- Three of six changed runtime files are outside the task's fence list
  (`src/sim/player.js`, `src/ui/hud.js`, `src/render/route-visibility.js`); the build
  report discloses this. Lane discipline is the reviewer's call, not a playtest one.

## 7. Operator questions (feel; QA does not judge these)

URL: `index.html` on a build with this branch merged, no flags (FAR is the default).

1. At every corner RIG stops dead on the hinge for about 1.1 s with right held (6.6 s
   per run). Does that read as a deliberate ratchet beat, or as the turn snagging?
2. About two-thirds of the way through the swing the whole next stretch appears and
   the old one disappears in one frame (compare `c1-t680` and `c1-t700`). Do you see a
   pop, and does it break "ascending around a monstrous leg"?
3. After each turn the view starts about 40% closer and eases back out over a few
   seconds (RIG about 5.5% of screen height at the hand-off, 4.5% 1.5 s later, 3.8% at
   rest). Does that read as part of the turn, or as the camera correcting itself?
4. On the phone in landscape, 12 to 19% of the right edge is flat teal during every
   gate fight, and about 10% of the left edge after each odd-numbered turn. Does it
   read as fog or sky, or as missing world?
5. The gate line now reads "1 HOSTILE · +2 INBOUND" instead of "LAST SIGNAL" while
   more holders are queued. Does it tell you what still needs killing?
6. On a narrow screen (portrait phone, thin window) the gate no longer waits on rooted
   bodies that sit off screen, so gates 2 to 6 ask for fewer kills there. Is
   viewport-dependent gate content acceptable (entry 19), given portrait is not the
   tuning target?

## PROPOSED INBOX ISSUES

(Not written to SPRINT.md, per the brief. I-101 to I-108 already cover R1, R2, R3,
the right clamp, the zipper-strip hole and `GATE_RE`; these are new or addenda.)

```
## I-??? | bug | S2 | repro: `cd tools/playtest && . ~/.hullbreaker-host.env && node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300 --max-runtime-ms 20000 --base-url http://127.0.0.1:<port>` against any build, host load 22 to 54 @ 6d3e58f | evidence: reports/tasks/T-102/playtest-evidence/smoke-transform-attempt1-capped/
```
The merge gate's transform-slice smoke can fail for a reason that is not the build.
With the host env's `HB_HARNESS_SLOWDOWN=40` the wall-clock cap is 20000 x 40 = 800 s;
at load 22 to 42 the run needed more (cut at tick 913 of the 938 where the slice wins,
both rituals already done, 0 errors), and `smoke-verdict` reports FAIL ("ledger status
running"). The build lane hit the same cap twice and needed `HB_HARNESS_SLOWDOWN=100`.
`merge-task.sh` retries three times and then calls it "a regression, not flake", so a
busy host can refuse a good merge. mid-route took 432 s against a 600 s gate cap
(15000 x 40). Workaround: `HB_HARNESS_SLOWDOWN=100`. Fix direction: set 100 in
`tools/orch/cloud-setup.sh` / `~/.hullbreaker-host.env`, or scale the cap by measured
sim-ticks per second instead of a fixed wall budget.

```
## I-??? | fairness | S3 | repro: `node reports/tasks/T-102/playtest-evidence/probes/resize-gate-probe.mjs <tree> desktop 390 844 3 2` with <tree> = the T-102 worktree (before: `98b12c9` export) | evidence: this file, section 5.3
```
Resizing or rotating at the start of a held gate deletes gate bodies. On the fixed
tree, narrowing 1280x720 to 390x844 two ticks into gate 3 retires the in-view gating
Iris polyp and the hound (D2's rule, every gate frame) and culls the left pincer wasp
(existing flyer edge cull): 5 rows to 2. On the base the same action keeps all 5 and
softlocks. Flyers could already be shed this way on the base (a gating wasp is culled
when the new left edge passes it); D2 extends it to polyps, mortars and hounds. Low
priority: held gates go away with T-203 (entry 23). If they stay, evaluate the strip
once at arm time instead of every gate frame.

```
## I-??? | art | S3 | addendum to I-102 | evidence: reports/tasks/T-102/playtest-evidence/captures-analysis/phone-c1.jpg .. phone-c5.jpg, fix-touch-844x390-c2-t350.jpg
```
Measured on the fix captures, not just the base ones: flat clear-colour columns from the
edge at approach are 3.4 to 12.3% (desktop) and 11.8 to 19.0% (phone landscape); phone
left edge after the turn is up to 12.7%; odd corners are worst. New: at the 30 degree
hold on the phone (c2, c3, c5) the left edge shows a hard vertical backdrop-plane
boundary (about x 115 of 844 in c2) with a different dark texture on its far side, so
the gap is a visible seam as well as a void, not only a fade.

```
## I-??? | art | S3 | addendum to I-103 | evidence: reports/tasks/T-102/playtest-evidence/headless/rig-px-desktop.json, rig-px-phone.json
```
RIG's rendered height during the turn is 3.76% of screen height at approach, 5.46% at
the hand-off and 4.49% at +1.5 s (desktop and phone alike), so it leaves the 3 to 5%
invariant transiently. Phone landscape rests at 3.8% against entry 20's roughly 6%.
For T-107.

```
## I-??? | bug | S3 | repro: `node tools/simlab/turnlab.mjs run --policy die-after-turn --viewport desktop --query fallback=0 --show 60` @ 6d3e58f and @ 98b12c9 | evidence: reports/tasks/T-102/playtest-evidence/headless/dat-base.json, probes/trace-tele.mjs
```
turnlab's `teleport` invariant flags the crush edge's +1.0 tile shove of a RIG sitting in
a pit (x 313.6 to 321.4, y -2.001, every 12 to 13 ticks, 9 events on the fixed tree, 8
on the base). That is designed edge behaviour, so the lab gives a false positive in the
fall-and-respawn policies, which T-104 and T-108 may reuse. Exempt a tick whose margin
to the left edge crosses the shove threshold, or give it its own kind.
@@HUDISSUE@@
## Evidence index

All under `/home/user/hullbreaker/reports/tasks/T-102/playtest-evidence/` (see its
`README.md`): `smoke-mid/`, `smoke-transform-attempt1-capped/`, `smoke-transform/`,
`headless/`, `captures-analysis/`, `hud-fit/`, `probes/`. The T-102 captures judged are
in the worktree at
`/home/user/hullbreaker/.claude/worktrees/T-102/reports/tasks/T-102/captures/`.
