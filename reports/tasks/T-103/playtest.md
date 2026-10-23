FAIL

# T-103 playtest gate: weapons sit in RIG's hands

QA gate, 2026-10-23. Worktree `/home/user/hullbreaker/.claude/worktrees/T-103`, branch `task/T-103`, HEAD
`11ff74e3fadc9a4d63e21efbc3283174117e5e7e` (`11ff74e`, "Merge main into task/T-103"). `git status --short` was
empty before, between and after every run. Bots, captures and measurements are evidence about regressions and looks;
this file makes no fun or feel claim, and feel observations are routed to the operator questions in section 8.

## Verdict

**FAIL, on one visible defect that the lane did not disclose and that none of its gates can see: whenever RIG faces
left, his two re-posed arms are lit as back faces.** The arm renders at 71 % of the right-facing luminance (red channel
62 %), warm tan turning grey-olive, and the whole figure is 4 % darker on average across 520 live desktop pairs and 200
phone pairs. The pre-T-103 build is symmetric on the same measurement (mean luma ratio L/R 0.9996, same script).
Cause: `rigArmSegmentCorners` mirrors by negating x (`src/pure/rig.js:508`) without reordering the quad, so every
left-facing arm triangle is wound clockwise, and the arm material is `DoubleSide` with fixed +z normals
(`src/render/player.js:582-596`), so three.js flips the normal and the key light drops out. Proven in the page
(section 5): with `FrontSide` the left-facing arms vanish (0 of 126 pixels); with the triangles re-wound the
left-facing arm is back to 0.993 of the right-facing luminance and the figure to 1.000. It is in the lane's own
committed evidence (`phone-firing-after-4x.png`, "aim left" panel). The fix is a few lines and the re-gate is cheap
(section 7). It is the operator's own complaint, "the models are a little off", reintroduced by the fix for it, which
is why I am not passing it as a nit.

Everything else passes and reproduces, and **nothing else I found blocks the merge**:

- **Smoke:** `mid-route.json` PASS and `transform-slice.json` PASS on the pinned worktree, first attempt each; final
  sim state identical to the T-102 gate's runs on a different build (as it must be: no sim change).
- **Live measurement (the lane's tool, my runs):** 1040 desktop-FAR cells and 400 phone-landscape cells, worst
  fist-to-grip 0.023 css px, worst muzzle-to-spawn 0.157 css px (bound 1, zero cells over), zero page errors, RIG
  visible in every cell, in-situ desktop firing frames consistent.
- **Headless:** `runGripCheck` 4840 combinations / 0 failures, d77 21/21, the gate goes red when an anchor moves,
  `pathcheck` 4007 passed / 0 failed, `src/sim` and `src/config.js` byte-identical to the base.
- **Looks:** the guns sit in the fists in every pose, aim and gun, in both facings; no arm seams, no missing pixels,
  layering consistent; the lane's disclosed limits are visible as described.

**Next action:** return T-103 to the lane for the arm-winding fix (a few lines in `src/pure/rig.js` / `src/render/player.js`
plus a test that binds), then re-gate against section 7. `merge-task.sh` will need a PASS newer than the new head.

## 1. Pinning

| item | result |
| --- | --- |
| tree | worktree HEAD `11ff74e`; main at `5252c18` is merged into it. vs main: 40 files, +5077/-96; `src/` is only `src/pure/rig.js` (+345/-5) and `src/render/player.js` (+157/-29); `git diff 98b12c9..HEAD -- src/sim src/config.js` is **0 lines**. Main's `src/`, `assets/` and `index.html` are byte-identical to the lane's base `98b12c9`, so a `git archive 98b12c9` export is a faithful BEFORE |
| server | `node /home/user/hullbreaker/tools/serve.mjs 8783 --root /home/user/hullbreaker/.claude/worktrees/T-103 --quiet` (main's copy, node pid 18078). `curl -I` shows `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`. The served `src/pure/rig.js` has the worktree's SHA-256 (`42ed7224…`) and not main's (`b9eaf241…`). Killed at the end |
| capture tool | the worktree's own `tools/rig-grip/capture.mjs` (it does not exist on main); it serves the worktree itself through `withIsolatedBrowser` on an OS-assigned port. Ports 8741/8742 were never touched |
| host | `. ~/.hullbreaker-host.env` in every shell (`HB_HARNESS_SLOWDOWN=100`, `HB_SMOKE_VIEWPORT=480x300`, browser probe skipped). 4 cores, no GPU (SwiftShader), load average 23-45, with a reviewer's capture and other lanes' browsers running at the same time. No run was lost to a boot failure, so nothing was retried |
| lane's sheets vs head | the sheets are labelled `f1cb327`; `git diff f1cb327..11ff74e -- src assets tools/assets` is only manifest notes/roles, README and the capture/compose tools, so the committed sheets show the shipped art and code. My live cells are closer to the lane's AFTER than to its BEFORE in 443 of 443 cells compared (blurred difference 0.62 vs 4.66 sum-RGB per pixel). Exact pixel equality is not expected: the camera's sub-pixel phase at pause time differs per run |

## 2. Smoke set (main's harness, pinned worktree, `--deterministic`, 480x300)

```sh
cd /home/user/hullbreaker/tools/playtest && . ~/.hullbreaker-host.env
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8783 --out $S/smoke-mid
node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300 --max-runtime-ms 20000 --base-url http://127.0.0.1:8783 --out $S/smoke-transform
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs <out>/report.json
```
(`$S` = `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t103-gate`)

| script | verdict and evidence |
| --- | --- |
| `mid-route.json` | **PASS**: `smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`. 26 of 26 events dispatched, `bootError` none, `pageErrors` [], 0 console errors, 0 deaths, 0 falls. Final state x 55.649, gameMs 9900.198, hp 2, scrollX 56.204, minEdgeMargin 26.53, **identical to the T-102 gate's run of the same script on a different build** (as it must be: no sim change). Idle fraction 0.34 (T-102: 0.353); the absolute seconds in `summary.md` (116.6 s idle of 342.9 s) are wall-clock weighted samples on a throttled host and mean nothing; fractions and counts are usable. 350 s wall on the first attempt |
| `transform-slice.json` | **PASS** on the first attempt: `smoke-verdict: PASS (outcome=completed deaths=0 tick=938/1104)`. BREACH CLEAR at tick 938, 2 of 2 transformations: gameMs 15633.646, x 146.0874, y 10.4443, scrollX 130.2807, hp 3, 0 falls, **identical to the T-102 gate's run and to the lane's base-98b12c9 control**. `bootError` none, `pageErrors` [], 0 console errors, idle fraction 0, minEdgeMargin 30.07. The harness's "6 of 58 events never dispatched" line is the post-victory freeze. 863 s wall |

No pacing dead spot in either (A.5 numbers above); no regression in the sim. Evidence:
`$S/smoke-mid/{report.json,summary.md,screenshot.png}`, `$S/smoke-transform/{…}`.

## 3. Headless gates (the lane's own, re-run)

| command (from the worktree) | result |
| --- | --- |
| `node tools/rig-grip/check.mjs` (as assigned) | exit 0 in 0.4 s **with no output**. The file only exports `runGripCheck`; it has no CLI entry, so run directly it checks nothing. Reported as proposed issue 2 below. The real gate is the next row |
| `runGripCheck()` called from my own script (`$S/run-gate.mjs`) | 4840 combinations, **0 failures**. Worst fist-to-grip 0.0965 atlas px (bound 1); worst muzzle-to-spawn 0.1035 desktop-FAR px (bound 1); gain-1 arm stretch max x1.135; portrait max x1.608, median x1.234. Matches the build report to the digit |
| T-103 pathcheck domain alone (the lane's command) | `{ passes: 21, fails: 0 }` |
| gate binding, from outside (`$S/run-gate-mutants.mjs`, through the gate's own fault-injection parameters, no file edited) | control 0 failures; fist anchor +3 atlas px -> red ("fist anchor [1171.8,705.7] is 3.02 px from the painted fist centroid"); rivet-gun grip +3 px -> red; rivet-gun `muzzleY` 82 (main's value) -> red; a +0.3 px nudge inside the stated tolerance stays green. The lane's source-mutation table (3 mutants, 2-3 failures each) was not repeated |
| `node tools/pathcheck.mjs` at `11ff74e` (informational: a green gate is not evidence, decisions entry 21) | `pathcheck: 4007 passed, 0 failed`, 53 s. The 4 `render-submission-contract` browser-probe assertions are skipped by `HB_GATE_SKIP_BROWSER_PROBE=1` and not counted, so the lane's 4 host-bound failures are gone on this tree |
| `git diff 98b12c9..HEAD -- src/sim src/config.js` | 0 lines. "No simulation change" holds |

What these gates are: centroid arithmetic over painted pixels (check.mjs/raster.mjs), a software compositor with
no lighting. They prove the hand lands on the grip. They cannot see shading, which is exactly where the defect is.

## 4. Live re-measure (the lane's `tools/rig-grip/capture.mjs`, my runs, real game, real three.js meshes)

The tool boots `index.html?testapi=1&audio=0&view=far&momentum=0&score=0`, pauses, stages every pose through the
shipped `view.player.sync()` hook, and measures from live `matrixWorld`: the fist centre on the arm mesh vs the
painted grip centroid on the weapon mesh, and the painted muzzle face vs the sim's bullet spawn placed the way
`bullets.js` places it. RIG is isolated from the world (the lane's disclosed method).

| view | cells | fist->grip css px max / mean | muzzle->spawn css px max / mean | arm stretch max | RIG hidden | page errors |
| --- | --- | --- | --- | --- | --- | --- |
| desktop FAR 1280x800 DPR 1: 5 guns x 13 rows x 2 facings x 8 aims | **1040** | **0.023** / 0.0089 | **0.157** / 0.0565 | 1.102 (16 cells > 1.0, 4 > 1.05) | 0 | 0 |
| phone landscape 844x390 DPR 2: 5 guns x rows stand, run-flight, air-rise, climb-1, wall x 16 | **400** (of 1040; see below) | **0.008** / 0.0042 | **0.076** / 0.0295 | 1.102 | 0 | 0 |
| desktop FAR in situ, RIG actually firing (gun R: right, up-right, up, left), real background, paused on the shot frame | **4 shots** | 0.020 | 0.102 vs the recoil-shifted spawn; 1.78 vs the unshifted spawn (the 0.095-tile recoil kick, see below) | - | - | 0 |

Bound: 1 css px (the task's 1 screen px at FAR). **Zero cells over, in either view.** Hand kind is `rig-arm` in 1440
of 1440 cells. Lane's numbers for comparison: 0.022 / 0.157 desktop, 0.011 / 0.076 phone; they reproduce. The phone
view is 8.8 css px per tile (17.6 device px), the same device scale as desktop; it is not yet the tighter phone frame
of entry 20's addendum (T-107's job). The phone run is 5 of 13 rows because the host could not afford the full
1040 cells twice; the other rows are covered by the desktop run and by the lane's R+F phone matrix (416 cells).

In-situ firing, desktop FAR (`$S/cap-fire-desktop-R/`):

| aim | body frame | fist->grip css px | muzzle vs spawn css px | vs recoil-shifted spawn | recoil kick (tiles) | live shot travels along the staged aim |
| --- | --- | --- | --- | --- | --- | --- |
| right | aim-right | 0.013 | 1.722 | 0.102 | 0.095 | True |
| up-right | aim-down-right | 0.015 | 1.785 | 0.072 | 0.095 | True |
| up | aim-down-right | 0.016 | 1.737 | 0.023 | 0.095 | True |
| left | aim-right | 0.02 | 1.707 | 0.058 | 0.095 | True |

The muzzle sits one recoil kick (RIG_RECOIL_TILES 0.095 = 1.7 css px at 18 px/tile) behind the nominal spawn on the frame
of the shot; the kick is a presentation feature that exists on main, lasts 105 ms and decays quadratically (above 1 css px for
about the first 25 ms), and the lane separated it from the placement error in `b7a3a44`. The lane's phone figure of
0.83-0.87 css px against the unshifted spawn is the same kick at 8.8 px/tile. I read acceptance box 3 ("drawn muzzle and sim
bullet spawn within 1 screen px at FAR") as the static placement, as the lane did; read to include the kick it would be
exceeded for the first ~25 ms after each shot at desktop FAR, which is a call for the integrator, not a defect I am failing
on. The static bound is met in all 1440 matrix cells and every live shot travels along the staged aim.

Standing aim -> body frame, from the live cells: right and left -> `aim-right`; up-right, up, up-left, down-*, down
-> `aim-down-right` (the braced crouch). `aim-up` and `aim-up-right` are never shown: the lane's disclosed retirement
holds.

Control: the lane measured main `98b12c9` with this same tool at 3.0-28.4 css px fist-to-grip (mean 12.4) and 0.43-2.61 css px muzzle-to-spawn over the 1040 desktop cells, so the instrument can fail. I started a one-row control against a `git archive 98b12c9` export but stopped it at load 50+ on this host, so those BEFORE numbers are the lane's, not re-measured by me (my independent BEFORE control is the facing-symmetry one in section 5, on the lane's live BEFORE cells).

My own contact sheets (AFTER only, true size and 4x, **all five guns** including the 4x sheets the lane left out of
its commit): `$S/cap-desktop/sheet-desktop-{R,S,L,H,F}-{1x,4x}.png`, phone `$S/cap-phone/sheet-phone-{R,S,L,H,F}-{1x,4x}.png`,
numbers in `$S/cap-desktop/capture.json`, `$S/cap-phone/capture.json`.

## 5. The defect (basis of the FAIL)

**What it is.** Facing left, RIG's near and far arm strips are shaded as back faces. The same pose, mirrored, is
darker and greener than facing right, on every gun, in every pose that shows the arms.

**Measured on the live render** (`$S/mirror-symmetry-check.py`, embedded in the appendix; it pairs each right-facing
cell with the left-facing cell of the mirrored aim and compares the mean colour of the figure's pixels):

| tree (cells measured by the same script) | pairs | mean luma ratio L/R (std) | share of pairs > 2 % darker facing left | mean RGB delta L-R | script exit |
| --- | --- | --- | --- | --- | --- |
| BEFORE, main `98b12c9`: the lane's live BEFORE cells (`$S/lane-before/`) | 520 | **0.9996** (0.0185) | 0.14 | (-0.02, -0.04, -0.04) | **0 (symmetric)** |
| AFTER, the lane's live AFTER cells, same sheets (`$S/lane-after/`) | 520 | **0.9591** (0.0269) | 0.74 | (-3.72, -2.12, -1.17) | 1 |
| AFTER, desktop FAR, my live capture (`$S/cap-desktop/`) | 520 | **0.9579** (0.0269) | 0.75 | (-3.98, -2.26, -1.23) | 1 |
| AFTER, phone landscape, my live capture (`$S/cap-phone/`) | 200 | **0.9593** (0.0274) | 0.71 | (-3.80, -2.23, -1.30) | 1 |

A single pair is noisy (the mirrored sprite lands on a different sub-pixel phase, so BEFORE's own pairs spread
0.94-1.07), which is why the check gates on the aggregate. The shift is not noise: 95 % of AFTER pairs have the left
facing cell no brighter than the right (p95 1.001, against 1.028 for BEFORE), and 88 % of the 520 (gun, pose, aim)
pairs are darker than their own BEFORE pair (paired mean -0.0405). By row (my desktop capture), mean luma ratio L/R: stand 0.944, run
0.940-0.947, jump rise 0.927, jump fall 0.944, hit/i-frames 0.930, respawn 0.947, climb 0.983-0.989, wall 0.981 (in the
climb and wall frames the gun arm is the far arm, drawn behind the receiver, so less of it shows). By gun (my desktop capture): R 0.946, S 0.959, L 0.959, H 0.960, F 0.965.

The arms are only about a sixth of the figure's visible pixels in the stand pose (68 of 428), so the arm itself is hit much harder. In-page, standing, rivet
gun, aim right facing right vs aim left facing left, arms drawn alone (`$S/diag-R/`, `$S/analyze-case.py`; the script also
stages run-flight, air-rise and climb-1, but I stopped it after the stand case, which was enough to prove the cause, to
spare the host):

| | pixels | mean RGB | luma | G-R |
| --- | --- | --- | --- | --- |
| right-facing arms, as shipped | 126 | (85.4, 72.8, 56.6) | 74.3 | -12.6 (warm tan) |
| left-facing arms, as shipped | 126 | (52.5, 53.5, 46.4) | 52.8 | +1.0 (grey-olive) |
| left-facing arms, `side = FrontSide` | **0** | - | - | the arms disappear |
| left-facing arms, triangles re-wound (page-only experiment) | 128 | (84.4, 72.4, 56.9) | 73.8 | -11.9 |

Left/right arm luma 0.711 as shipped (red channel 0.615), **0.993 re-wound**. The whole figure: luma ratio 0.921 as
shipped, **1.000** re-wound. Image: `$S/diag-stand-R-vs-L-vs-fixed-10x.png` (shipped facing right | shipped facing
left, flipped back for comparison | facing left with the winding corrected). At true size it is subtle (RIG's torso
reads greyer when he faces left); at 3x it is plain: `$S/mirror-pairs-3x.png` (rows: gun R stand, gun R run-contact,
gun F stand, gun F run-contact; left half facing right, right half the mirrored aims facing left) and
`$S/mirror-pairs-1x.png` at true size. It also shows in situ, in the real scene with its lighting, bloom and tone
mapping: my desktop firing frames at 10x, `$S/fire-desktop-R-right-vs-left-10x.png` (RIG firing right: torso warm tan;
firing left: torso grey-olive, same pose, same deck).

**Why** (read from the code, then proven):

- `src/pure/rig.js:508` `out[offset + i * 2] = mirror < 0 ? -wx : wx;` negates x without swapping the corners.
- `src/render/player.js:582-587` the strip geometry has fixed +z normals and fixed indices `[0,2,1, 2,3,1, …]`.
- `src/render/player.js:590-596` the arm material is `MeshStandardMaterial` with `side: THREE.DoubleSide`.
- Exact, browser-free (`$S/winding.mjs`, calls the shipped `rigArmSegmentCorners`): signed area of triangle
  `[0,2,1]`/`[2,3,1]` is **+0.0606/+0.0606 facing right and -0.0606/-0.0606 facing left**, for both strips and every
  arm direction tried. Counter-clockwise is front-facing; clockwise is not.
- For a back face a `DoubleSide` standard material flips the normal (`normal *= faceDirection`), so the directional
  light's N.L goes negative and only the hemisphere light is left. The body mesh is `FrontSide` and mirrors by
  `scale.x = -1`, which three.js handles, so the body keeps its light and the arms do not. Inference from
  `src/render/lightrig.js` (key light fixed at (6,12,8)) and `placeOnTower` (RIG yaws with the facet): which facing
  goes dark may differ on other faces; I only captured the start face.
- Proven in the page, tree untouched: `FrontSide` makes the left-facing arms vanish (0 of 126 px); re-winding the
  indices for the mirrored pose restores the arm's colour and the figure's mean colour.

**Why nothing caught it.** `raster.mjs` composites with no lighting, so the d77 gate, `check.mjs` and the live
fist-to-grip tool are all blind to shading; `player-presentation-check.mjs` greps spellings. The BEFORE sheets in the
lane's own evidence are symmetric and the AFTER sheets are not; the effect is visible in
`phone-firing-after-4x.png` (aim left panel, olive patches on RIG's torso against the warm tan of the aim-right panel)
and in every left-facing column of the `desktop-*-before-after` sheets. It was not mentioned in `build.md`.

**Why FAIL and not a nit.** It is new (BEFORE is symmetric), objective (the numbers above), on screen whenever RIG
runs, aims or climbs facing left in the default build (least in the climb frames, 1-2 %), on all five guns, on desktop
and phone; it hits the very
asset the lane delivers; and the operator's own words were about the models looking off. It is also cheap: the cause
is in two files and the in-page experiment shows the cure. To be fair about its size: at true 1x in situ, with RIG
standing still, it is at the edge of what the eye picks up (see my firing sheet `$S/cap-fire-desktop-R/desktop-firing-sheet-1x.png`);
it is plain from 3x up, and what a player gets at 1x is a shading flip on the arm and torso each time RIG turns round
(an inference from the symmetric BEFORE and the 4-8 % whole-figure step, not something I filmed). I fail it on the
measurements, the regression against a symmetric BEFORE and the operator's stated complaint, not on a claim that it is
glaring at 1x; if the integrator weighs the severity differently, nothing else here blocks the merge.

Suggested cures (the lane's call): re-wind the arm quads per facing (two prebuilt index sets), or write the strip
normals as `z = mirror` so the shader's flip lands on +z, or give the arm material one explicit winding and mirror in
the UVs instead. Whichever is chosen, it needs a test that binds (section 7).

## 6. What I saw (true size and zoomed; everything below is observation, not a fun verdict)

I read the lane's committed sheets at true size, 3x, 4x and up to 14x (`$S/lane-crops/`), my own live cells at
6x-10x, and the offline software previews at 60 px/tile (`$S/preview/`, `tools/rig-grip/preview.mjs`, no lighting).
RIG at desktop FAR is about 30 px tall (18.0-18.25 px/tile).

- **Do the guns sit in the fists, idle / run / jump / climb / aim, five guns, both facings?** Yes, geometrically and
  to the eye. In all 13 rows (stand, run contact/pass/flight, jump rise/fall, climb 0-3, wall cling, hit/i-frames,
  respawn drop) the gun arm is a strip from RIG's shoulder down the front of the torso to the weapon's lower
  pistol grip, and the weapon sits at his belt. The software previews (`$S/preview/stand-FRS-noarms-vs-arms-3x.png`,
  `$S/preview/stand-LH-noarms-vs-arms-3x.png`) show it plainly: without arms each weapon has a bare painted grip;
  with them a gloved hand is on it. At true size the 3-4 px fist is not separately legible on most guns; the
  connection reads through the arm strip ending at the grip. (Cindermouth's bright orange block under the dome is
  present on main too, so it is weapon art and not the fist; the arm ends on it.)
- **Arm seams?** None visible at 1x-14x. The elbow between the two strips is not a seam; the offline 60 px/tile
  previews show a continuous sleeve.
- **Missing pixels where the arms were erased?** None. Counting background enclosed inside the figure's silhouette
  over the lane's 1040 BEFORE/AFTER cells: BEFORE 1342 px in 481 cells, AFTER **917 px in 366 cells**, so AFTER has
  fewer gaps. 25 cells gain 4 px or more (max +10); I looked at four of the worst at 11x (H wall down-left, F run-flight
  down, R climb-2 up-right, L run-flight down): small gaps between arm, weapon and legs, not missing chunks.
- **Gun in front of / behind the body wrongly?** Layering is consistent: weapon in front of the body, near arm over
  the weapon, support arm between body and weapon. On ladders the gun hand is the far arm (behind the receiver) while
  the painted near hand stays on the rung: one-handed, deliberate, no floating gun (acceptance box 4). Climb frames are
  drawn 5 px lower than on main (the 0.3-tile render drop).
- **Run frames:** BEFORE already had no pumping arms in the run frames, so nothing was lost there.
- **Disclosed limits, as seen** (not failed): (1) *aim up* puts the weapon over the helmet for **all five guns**: at
  true size RIG has no head, the gun sits on his shoulders (`$S/lane-crops/stand-up-5guns-AFTER-10x.png`); the build
  report says "chest" in its limits and "chest and helmet" in its question 4, which is the accurate one. (2) standing
  up/up-right/up-left aims use the braced crouch (hunched); confirmed in my live cells. (3) portrait arms stretch up to
  x1.58: not re-run (landscape first, entry 20 addendum); I read `portrait-R-stand-before-after-1x.png`: the arms are
  visibly long and thin. (4) the "retired" stances are not shown anywhere.
- **Observations the lane did not make** (none fails the lane): in aim-down poses in the flight / air-rise frames the
  solved arm folds with the elbow above and behind the shoulder, a dark wedge at true size
  (`$S/preview/F-flight-air-down-ppt70.png`, `$S/my-flight-down-6x.png`); the shipped hold is belt height, where the
  chest-height two-handed hold in concept board 01 is a different look (the sim's 1.05-tile muzzle is gameplay truth,
  so this is a design question, not a defect); the lane's captures isolate RIG from the world, so RIG against real
  ladder rungs and the 0.3-tile climb drop has not been judged in situ by anyone (the only in-situ frames are firing
  shots on a deck).
- **Not tested:** real GPU hardware and the 60 fps budget (SwiftShader only), iOS Safari, portrait, ladders in situ,
  the `?crouch=1`
  prototype (I read the lane's 1x/4x crouch sheets; its left-facing cells show the same grey-olive), feel.

## 7. Re-gate criteria (falsifiable)

1. `python3 -I mirror-symmetry-check.py <capture dir> desktop` (appendix) exits 0 on a full desktop capture of the
   fixed tree: mean luma ratio L/R 1.000 +-0.005, mean RGB delta within +-0.5 per channel, no row off by more than
   0.015 (BEFORE: 0.9996, (-0.02, -0.04, -0.04), worst row 0.990; the same script already returns exit 0 on BEFORE and
   exit 1 on the shipped AFTER, which is its binding proof).
2. Left-facing arms drawn alone within +-3 % of the right-facing luma (`diag-arm-lighting.mjs` case `stand:right`;
   shipped 0.711, re-wound 0.993).
3. A test that goes red on the defect and green on the fix, living in pathcheck: for each strip and both mirrors the
   drawn triangle winding (after whichever cure is chosen) is front-facing under the shipped material, or a live
   check like (1). Show it red against the current head.
4. Everything else must not move: `runGripCheck` stats, d77 21/21, both smoke scripts' final states (mid-route x 55.649
   / gameMs 9900.198; transform tick 938 / gameMs 15633.646), live fist-to-grip <= 1 css px.
Nothing else needs repeating: the lane's fix does not touch the sim.

Notes for the integrator (decisions the lane raised or that I ran into; none is a QA criterion and none is why this
fails):

- The lane ships the new hold ON by default with no `?hands=legacy` way back, which sits against decisions entry 22
  ("every new look ships behind an A/B flag with the current art as the control") and against the touch precedent in
  entry 20 (a default-on replacement that shipped with `?touch=legacy`). Its build report raises this as decision 1; I have nothing to add except that the old look is recoverable
  only from `98b12c9`.
- `assets/manifest.json` changed in the three RIG atlas entries (decision 3 in the lane's report); the merge gate does not
  run the asset gate, which the lane says is red on main for two unrelated problems.
- Acceptance box 3 and the recoil kick: see the end of section 4.

## 8. Operator checkpoint questions (feel; for the queue after the shading fix; I do not judge these)

URL: `node tools/serve.mjs 8783 --root <worktree>` then http://127.0.0.1:8783/index.html (desktop) and the same at
844x390 in devtools. Main on 8741 is the comparison.

1. Hold height. Concept board 01 shows RIG with the rifle at chest height in both hands; the shipped hold is belt
   height with one lowered arm to a low pistol grip, because the sim fires from 1.05 tiles. Is that read acceptable,
   or should the muzzle (a sim change) come up? (It would be a sim change that moves the shot line.)
2. Aiming straight up at true size: the weapon covers the helmet, RIG reads headless. Fine, or a problem for
   "chaos stays readable"?
3. Standing and aiming up or diagonally, RIG hunches into the braced crouch. How does that read next to main's raised
   arms?
4. Aiming down in the air (flight / rise): the arm folds up behind the shoulder. Does the pose look right at speed?
5. Ladders: one hand on the rung, the other holding the weapon at the hip, body drawn 5 px lower. How does the climb
   read, and does the mount/dismount pop?
6. (The lane's) portrait: arms stretched up to x1.58 to stay on the grip. Accept, drop the portrait gain, or scale the
   muzzle?

## PROPOSED INBOX ISSUES

I did not edit SPRINT.md. Issue ids are left for the integrator. `$S` is the scratch directory named in the appendix.

## I-??? | art | S2 | repro: `cd /home/user/hullbreaker/.claude/worktrees/T-103 && . ~/.hullbreaker-host.env && node tools/rig-grip/capture.mjs --out $O --views desktop --guns R --rows stand,run-flight,air-rise` then `python3 -I mirror-symmetry-check.py $O desktop` (script embedded in reports/tasks/T-103/playtest.md; this 48-cell subset already shows the defect, the full 1040-cell matrix is the pass criterion) @ task/T-103 11ff74e; browser-free: `node winding.mjs` (same file) | evidence: reports/tasks/T-103/playtest.md section 5; $S/diag-stand-R-vs-L-vs-fixed-10x.png; $S/mirror-pairs-3x.png; the lane's own reports/tasks/T-103/evidence/phone-firing-after-4x.png (aim-left panel)
Facing left, T-103's re-posed arm meshes render as back faces and lose the key light. `rigArmSegmentCorners` (src/pure/rig.js:508) mirrors by negating x without reordering the quad, so every left-facing arm triangle is clockwise (signed area -0.0606 vs +0.0606 facing right, both strips, every arm direction); the arm material is `DoubleSide` with fixed +z normals (src/render/player.js:582-596), so three.js flips the normal and N.L goes negative. Live: 520 desktop and 200 phone mirrored pairs have mean luma ratio L/R 0.958 / 0.959 (74 % of pairs more than 2 % darker facing left); the same script on the pre-T-103 cells gives 0.9996 (14 %) and exits 0. Arms drawn alone: left-facing 71 % of the right-facing luma, red 62 %, warm tan to grey-olive. In the page, `FrontSide` makes the left-facing arms vanish (0 of 126 px) and re-winding the mirrored triangles restores the arm to 0.993 and the figure to 1.000. Fails T-103 (see playtest.md); fix by re-winding per facing, or normals z = mirror, and add a test that binds (re-gate criteria in playtest.md section 7). The lane's gates are blind to it because raster.mjs has no lighting; a live symmetry check belongs next to the fist-to-grip tool.

## I-??? | bug | S3 | repro: `cd /home/user/hullbreaker/.claude/worktrees/T-103 && node tools/rig-grip/check.mjs; echo $?` @ 11ff74e | evidence: reports/tasks/T-103/playtest.md section 3; tools/rig-grip/README.md file table
`tools/rig-grip/check.mjs` exits 0 in 0.4 s with no output: the file only exports `runGripCheck` and has no CLI entry, yet its README row calls it "the measured gate". A gate that is green by doing nothing is the entry-21 failure mode. Give it a main that prints the stats and exits non-zero on failures, or say in the README that it only runs through the d77 pathcheck domain.

## I-??? | docs | S3 | repro: `ls reports/tasks/T-103/evidence/` @ 11ff74e against SPRINT T-103 acceptance box 1 ("at true FAR size and at 4x") | evidence: reports/tasks/T-103/build.md "Contact sheets and captures"
Only `desktop-R-before-after-4x.png` is committed. The S/L/H/F 4x sheets live in the worktree's git-ignored `tools/playtest/runs/T-103-sheets/` (present, 1 MB each) and disappear when the worktree is pruned; the 1x sheets for all five guns are committed. Commit them (about 4 MB), or record the regeneration command as the evidence. QA regenerated AFTER-only 4x sheets for all five guns in its own run (`$S/cap-desktop/sheet-desktop-*-4x.png`), which are not a substitute for the before/after pairs.

## Appendix: evidence index and embedded scripts

### Evidence index (all under `$S` = `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t103-gate`)

| what | path |
| --- | --- |
| mid-route smoke | `$S/smoke-mid/{report.json,summary.md,screenshot.png}`, log `$S/smoke-mid.log` |
| transform-slice smoke | `$S/smoke-transform/{report.json,summary.md,screenshot.png}`, log `$S/smoke-transform.log` |
| desktop FAR matrix (1040 cells) | `$S/cap-desktop/{capture.json,cells/,sheet-desktop-{R,S,L,H,F}-{1x,4x}.png}`, log `$S/cap-desktop.log`, analysis `$S/analyze-desktop.out` |
| phone landscape (400 cells) | `$S/cap-phone/{capture.json,cells/,sheet-phone-*}`, analysis `$S/analyze-phone.out` |
| in-situ desktop firing, gun R | `$S/cap-fire-desktop-R/{capture.json,desktop-firing-*.png,desktop-firing-sheet-*.png}`, `$S/fire-desktop-R-right-upright-5x.png`, `$S/fire-desktop-R-up-zoom7x.png`, `$S/fire-desktop-R-right-vs-left-10x.png` (the defect in situ) |
| facing symmetry (the defect) | `$S/mirror-symmetry-{desktop,phone,lane-before,lane-after}.out`, `$S/mirror-pairs-1x.png`, `$S/mirror-pairs-3x.png`, the split lane cells `$S/lane-before/`, `$S/lane-after/` |
| in-page diagnostic (arms only, FrontSide, re-wound) | `$S/diag-R/*.png`, `$S/analyze-case.py`, `$S/diag-stand-R-vs-L-vs-fixed-10x.png`, `$S/diag-stand-R-SNA-10x.png` (shipped / no arms / arms only), `$S/diag-stand-R-overlay2-10x.png` (visible vs hidden arm pixels), script `$S/diag-arm-lighting.mjs` (run: `node diag-arm-lighting.mjs <out> R stand:right`) |
| lane's sheets, my crops and zooms | `$S/lane-crops/*.png` |
| offline software previews (no lighting) | `$S/preview/*.png` |
| headless gate runs | `$S/run-gate.out`, `$S/run-gate-mutants.out`, `$S/d77.out`, `$S/pathcheck-full.log`, `$S/check-mjs.out` |
| hole census, mirror colour on the lane's sheets | `$S/holes.py`, `$S/mirror-color.py` |
| scripts written for this gate | `$S/{winding.mjs,mirror-symmetry-check.py,diag-arm-lighting.mjs,analyze-case.py,analyze-capture.py,run-gate.mjs,run-gate-mutants.mjs,holes.py,mirror-color.py,repro-blur.py,montage.py,cells.py,zoomcell.py,mycells.py}` |
| working notes | `$S/notes.md` |

### Embedded: exact winding, browser-free (`$S/winding.mjs`, run from the worktree)

```js
// QA scratch: signed area (CCW > 0, seen from +z) of the arm quads' two triangles, as player.js indexes them
// ([0,2,1, 2,3,1] over corners TL,TR,BL,BR), for mirror = +1 and -1.
const W = '/home/user/hullbreaker/.claude/worktrees/T-103';
const R = await import(`${W}/src/pure/rig.js`);
const out = new Float32Array(8);
const area = (c, a, b, d) => ((c[b*2]-c[a*2])*(c[d*2+1]-c[a*2+1]) - (c[b*2+1]-c[a*2+1])*(c[d*2]-c[a*2])) / 2;
for (const [name, seg] of Object.entries(R.RIG_ARM_SEGMENTS)) {
  if (!seg.w) continue;
  for (const [x0, y0, x1, y1, label] of [[0, 1.3, 0.1, 0.8, 'shoulder->down-front'], [0, 1.3, 0.5, 1.0, 'shoulder->forward-down'], [0, 1.3, -0.4, 1.0, 'shoulder->backward-down']]) {
    const row = {};
    for (const mirror of [1, -1]) {
      R.rigArmSegmentCorners(seg, x0, y0, x1, y1, 0.0047, mirror, out, 0);
      row[mirror > 0 ? 'facing right' : 'facing left'] = [area(out, 0, 2, 1), area(out, 2, 3, 1)].map((v) => +v.toFixed(6));
    }
    console.log(name.padEnd(6), label.padEnd(26), JSON.stringify(row));
  }
}
```

Output at `11ff74e`: every row reads `facing right [+x, +x]` and `facing left [-x, -x]` (e.g. `upper
shoulder->down-front {"facing right":[0.060628,0.060628],"facing left":[-0.060628,-0.060628]}`).

### Embedded: the facing-symmetry check (`$S/mirror-symmetry-check.py`; exit 1 if the aggregate is off)

```python
# QA scratch: facing symmetry of RIG's render, from a tools/rig-grip/capture.mjs cells/ directory.
# For every (view, gun, row, aim): the right-facing cell and the left-facing cell with the MIRRORED aim should be
# mirror images in colour (lighting does not care which way RIG faces).  Measures the mean RGB of the figure's
# pixels in each cell.  A single pair is noisy (the mirrored sprite lands on a different sub-pixel phase; the
# pre-T-103 build's own pairs spread 0.94-1.07), so the gate is on the AGGREGATE:
#   mean luma ratio L/R within 1.000 +- 0.005, mean RGB delta (L - R) within +-0.5 per channel,
#   and no pose row whose mean luma ratio is off by more than 0.015.
# Control, pre-T-103 main 98b12c9 (520 pairs from the lane's BEFORE sheets): mean 0.9996, std 0.0185, mean RGB
# delta (-0.02, -0.04, -0.04), worst pose mean 0.990 (wall).   T-103 @ 11ff74e: mean 0.958, mean RGB delta (-4.0, -2.3, -1.2).
#   python3 -I mirror-symmetry-check.py <capdir> [view=desktop]        exit 0 = symmetric, 1 = not
import sys, os, glob
import numpy as np
from PIL import Image

cap = sys.argv[1]; view = sys.argv[2] if len(sys.argv) > 2 else 'desktop'
MIR = {'right': 'left', 'left': 'right', 'up-right': 'up-left', 'up-left': 'up-right',
       'down-left': 'down-right', 'down-right': 'down-left', 'up': 'up', 'down': 'down'}
BG = np.array([0x4a, 0x56, 0x5c])
LUMA = np.array([0.2126, 0.7152, 0.0722])
def fig(path):
    a = np.array(Image.open(path).convert('RGB')).astype(float)
    m = np.abs(a - BG).sum(axis=2) > 30
    return a[m].mean(axis=0)
pairs = []
for f in sorted(glob.glob(f'{cap}/cells/{view}-*-R.png')):
    base = os.path.basename(f)[:-6]
    gun, rest = base.split('-', 2)[1:]
    for aim in sorted(MIR, key=len, reverse=True):
        if rest.endswith('-' + aim):
            row = rest[:-(len(aim) + 1)]; break
    else:
        continue
    twin = f'{cap}/cells/{view}-{gun}-{row}-{MIR[aim]}-L.png'
    if not os.path.exists(twin): continue
    mR, mL = fig(f), fig(twin)
    pairs.append((gun, row, aim, (mL @ LUMA) / (mR @ LUMA), mL - mR))
if not pairs:
    print('no mirrored pairs found'); sys.exit(2)
ratio = np.array([p[3] for p in pairs]); d = np.array([p[4] for p in pairs])
print(f'{len(pairs)} mirrored pairs in {cap} ({view})')
print(f'  luma ratio L/R: mean {ratio.mean():.4f}  std {ratio.std():.4f}  p5 {np.percentile(ratio, 5):.3f}  median {np.median(ratio):.3f}  p95 {np.percentile(ratio, 95):.3f}')
print(f'  share of pairs more than 2 % darker facing left: {(ratio < 0.98).mean():.2f}   (control: 0.14)')
print(f'  mean RGB delta (L - R): {d.mean(axis=0).round(2)}')
by = {}
for p in pairs: by.setdefault(p[1], []).append(p[3])
means = {k: float(np.mean(v)) for k, v in by.items()}
print('  mean luma ratio by row:', {k: round(v, 3) for k, v in means.items()})
bad = []
if abs(ratio.mean() - 1) > 0.005: bad.append(f'mean luma ratio {ratio.mean():.4f} is not 1.000 +- 0.005')
if np.abs(d.mean(axis=0)).max() > 0.5: bad.append(f'mean RGB delta {d.mean(axis=0).round(2)} is not within +-0.5')
for k, v in means.items():
    if abs(v - 1) > 0.015: bad.append(f'row {k}: mean luma ratio {v:.3f}')
print('SYMMETRIC' if not bad else 'NOT SYMMETRIC: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
```

Use it on a capture directory: `node tools/rig-grip/capture.mjs --out $O --views desktop` (all 1040 cells, about 19
minutes on this host; the aggregate needs the 520 pairs to be stable), then `python3 -I mirror-symmetry-check.py $O
desktop`. On `11ff74e` it exits 1; on the pre-T-103 cells (`$S/lane-before`, split from the lane's BEFORE sheets) it
exits 0.
