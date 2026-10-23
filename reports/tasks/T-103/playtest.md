PASS

# T-103 playtest RE-GATE: weapons sit in RIG's hands

QA re-gate, 2026-10-23. Worktree `/home/user/hullbreaker/.claude/worktrees/T-103`, branch `task/T-103`, HEAD
`c6d475ebf074dacde4ac47b79795e9292446f78b` (`c6d475e`). `git status --short` was empty at the start and at the end, and
the SHA-256 of `src/pure/rig.js` (`6f37f752…`), `src/render/player.js` (`5c066cf4…`), the d78 test, `symmetry.mjs`,
`check.mjs` and `capture.mjs` were identical before and after every run (`$N/pin-sha-{before,after}.txt`). This file
reports measurements and what I saw; it makes no fun or feel claim (feel questions are in section 8).
`$N` = `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t103-regate`.

## Verdict

**PASS.** The one defect the prior gate failed this lane on is fixed, and every re-gate criterion is met on numbers I
took myself on `c6d475e`: facing left, RIG's arms are now lit like facing right (aggregate L/R luma 1.0002 over 520
desktop pairs and 0.9999 over 520 phone pairs, arms drawn alone 0.990 to 1.007). The new pathcheck domain goes red on the
defect and on four of five scratch mutants of it (the fifth is the reviewer's `needsUpdate` case, below). Nothing else
moved: geometry gates, live fist-to-grip, both smoke scripts, selftest and the sim are unchanged, and in a same-page A/B
not one facing-right pixel differs from the pre-fix renderer's. The one hole I found in the new test (the reviewer's
finding, now reproduced live) does not touch the shipped build and does not fail the lane; it is proposed as an S3 issue
below.

**Prior gate:** FAIL at `11ff74e` (S2 art): the two re-posed arm meshes were wound clockwise when RIG faced left and, under
a `DoubleSide` material with +z normals, were lit as back faces (arms 0.71 of the right-facing luma, whole figure 0.958 L/R,
warm tan going grey-olive). The lane's fix is `6708326` (`rigArmTriangleIndex(mirror)` gives each facing a counter-clockwise
triangle order, `writeArm` rewrites the 12 indices in place on a facing change, material `FrontSide`) plus the evidence,
report and `symmetry.mjs` commits up to `c6d475e`. `git diff 11ff74e..c6d475e -- src` is `src/pure/rig.js` (+18) and
`src/render/player.js` (+21/-4); `git diff 11ff74e..c6d475e -- src/sim src/config.js assets index.html` and
`git diff 98b12c9..HEAD -- src/sim src/config.js` are both 0 lines.

## Re-gate criteria (section 7 of the prior verdict), measured at c6d475e

| # | criterion | bound | measured | result |
| --- | --- | --- | --- | --- |
| 1 | aggregate facing symmetry, full desktop matrix (5 guns x 13 rows x 2 facings x 8 aims = 1040 live cells, 520 mirrored pairs) | mean luma L/R 1.000 +-0.005; mean RGB delta within +-0.5/channel; no row off by more than 0.015 | **mean 1.0002** (std 0.0129); RGB delta **(+0.07, -0.00, -0.07)**; rows 0.993 (hit-iframe) to 1.007 (air-fall), worst row deviation 0.0072; pairs more than 2 % darker facing left 6 % (BEFORE 14 %, pre-fix 74 %). `python3 -I mirror-symmetry-check.py` exit **0**, the lane's `tools/rig-grip/symmetry.mjs` exit **0**, same numbers. Phone 844x390 DPR 2, all 1040 cells: 520 pairs, **0.9999**, (+0.08, -0.03, -0.14), rows 0.995 to 1.005, exit 0. Controls: exit 0 on main's BEFORE cells (0.9996), exit 1 on the lane's pre-fix cells (0.9591) and on a pre-fix capture I re-shot today (0.9250) | PASS |
| 2 | left-facing arms drawn alone within +-3 % of right-facing luma | 0.97 to 1.03 | **0.996** (stand, the criterion's own case), 1.007 (run-flight), 0.990 (air-rise), 0.999 (climb-1). The same script at `11ff74e` today: 0.747 / 0.715 / 0.724 / 0.715 | PASS |
| 3 | a pathcheck test red on the defect, green on the fix | red on the defect | d78 (`tools/pathcheck/t-103-arm-winding.mjs`): **4 passed / 0 failed** at `c6d475e`; **1 passed / 3 failed** on the pre-fix source (32000 of 32000 left-facing arm triangles clockwise); red on four of five scratch mutants of the winding/material/upload (the fifth is the reviewer's `needsUpdate` case, below) | PASS |
| 4 | everything else unchanged | n/a | `check.mjs` CLI exit 0, 4840 combinations 0 failures; d77 21/0; full pathcheck 4011/0; sim/config diff 0 lines; live fist-to-grip max **0.022** css px desktop (1040 cells), **0.010** phone 844x390 DPR 2 (1040 cells); mid-route smoke PASS; transform-slice smoke PASS; selftest PASS (39); facing-right renders **pixel-identical** to the pre-fix renderer's in a same-page A/B (0 px, four poses) | PASS |
| 5 | look at a fresh left/right pair, true size and 4x | left-facing arms warm, not grey-olive | looked (section 6): warm tan facing left in every pose I read, at 1x, 4x, 8x and in situ at 10x | PASS |

## 1. Pinning and method

| item | result |
| --- | --- |
| tree | worktree HEAD `c6d475e`, clean, hashes above. Main moved on while I worked (`08e5db1` at my last look); I tested the lane head only, not a merge with main (see the integrator note in section 7) |
| server | `node /home/user/hullbreaker/tools/serve.mjs 8786 --root /home/user/hullbreaker/.claude/worktrees/T-103 --quiet --keep-orphan` (main's copy), `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`; the served `src/pure/rig.js` and `src/render/player.js` have the worktree's SHA-256, not main's (`rig.js` `b9eaf241…`). Stopped by PID at the end (connection refused afterwards) |
| capture tool | the worktree's own `tools/rig-grip/capture.mjs`: it boots the real game in an isolated headless Chrome on an OS-assigned port (8741/8742 never touched), pauses the sim, stages every cell through the shipped `view.player.sync()` hook and reads live `matrixWorld`. RIG is isolated from the world in the matrix cells (the lane's disclosed method); the firing captures keep the world. `--root` points it at an exported tree for the pre-fix controls |
| host | `. ~/.hullbreaker-host.env` in every shell. 4 cores, no GPU (SwiftShader), load average 20 to 44 from other lanes' browsers while I ran |
| retries | one, a harness/launch artifact: my first mid-route attempt died at once with `net::ERR_CONNECTION_REFUSED` because a `--quiet` server is leased to the shell that launched it and exited when my tool call returned (`launcher 6252 disappeared; closing leased Hullbreaker server`). I relaunched it with `--keep-orphan` and re-ran; PASS. Not a game boot failure (proposed issue 2). I also mistyped one crouch capture (no `--rows crouch`), killed it and re-ran it correctly (proposed issue 3) |
| pre-fix controls | `git archive 11ff74e index.html src` into `$N/pre-11ff74e` (assets symlinked: `git diff 11ff74e..c6d475e -- assets` is empty), captured with the same tool. Mutants are scratch copies of `c6d475e` under `$N/mut/`; no tracked file was edited |

## 2. Criterion 1: facing symmetry

Instrument: pair every right-facing cell with the left-facing cell of the mirrored aim (one pose mirrored; lighting does not
care which way RIG faces), mean colour of the figure's pixels (more than 30 off the isolation background), aggregate over
pairs. `python3 -I $N/mirror-symmetry-check.py <capdir> <view>` is the prior gate's script (its source is embedded in the
prior verdict, `git show 5af89c7:reports/tasks/T-103/playtest.md`, appendix); the lane ported it to
`tools/rig-grip/symmetry.mjs`. I ran both on seven cell sets and they print the same numbers, verdict and exit code each
time (only the array formatting differs).

| cell set | pairs | mean luma L/R (std) | pairs >2 % darker facing left | mean RGB delta L-R | rows min..max | exit |
| --- | --- | --- | --- | --- | --- | --- |
| **FIXED c6d475e, desktop FAR, fresh, 1040 cells** (`$N/cap-desktop`) | 520 | **1.0002** (0.0129) | 0.06 | **(+0.07, -0.00, -0.07)** | 0.993..1.007 | **0** |
| **FIXED c6d475e, phone 844x390 DPR 2, fresh, 400 + 640 cells** (`$N/cap-phone-all`) | 520 | **0.9999** (0.0139) | 0.09 | (+0.08, -0.03, -0.14) | 0.995..1.005 | **0** |
| FIXED, portrait 390x844 DPR 2, gun R, 3 rows | 24 | 1.0009 (0.0063) | 0.00 | (+0.05, +0.04, +0.06) | 1.000..1.002 | 0 |
| FIXED, `?crouch=1` row, all guns | 10 | 0.9966 (0.0134) | 0.10 | (-0.10, -0.26, -0.32) | 0.997 | 0 |
| control: main BEFORE `98b12c9` (lane's live BEFORE cells, split by the prior gate) | 520 | 0.9996 (0.0185) | 0.14 | (-0.02, -0.04, -0.04) | 0.990..1.005 | 0 |
| control: the lane's pre-fix AFTER cells (same source) | 520 | 0.9591 (0.0269) | 0.74 | (-3.72, -2.12, -1.17) | 0.927..0.990 | **1** |
| control: `11ff74e` re-captured live today, gun R stand / run-flight / air-rise | 24 | 0.9250 (0.0145) | 1.00 | (-6.27, -3.71, -2.12) | 0.909..0.933 | **1** |
| the same 24 pairs, fixed head | 24 | 0.9984 (0.0119) | 0.08 | (+0.05, -0.10, -0.27) | 0.993..1.004 | 0 |

Cuts of the fixed desktop run (`$N/mirror-symmetry-desktop*.out`, `$N/symmetry-by-aim-fixed.out`):

- by gun: F 1.001, H 1.001, L 1.001, R 0.999, S 1.000;
- by aim class: forward aims (gun mirror equals body facing) 0.9993, **backward aims (strafe: the gun mirror is opposite the
  body facing) 1.0018**, vertical 0.9993. Pre-fix the same three were 0.959 / 0.961 / 0.956; main BEFORE 1.008 / 0.993 / 0.998;
- mirror-image fidelity, blurred pixel difference of each left cell against the mirror of its right twin, sum-RGB per pixel
  (`$N/mirror-blur-diff.out`): fixed 1.911, main BEFORE 1.831 (the floor), pre-fix 2.590;
- repeatability: a second capture of this same head from earlier today (an attempt a container restart killed; used for
  nothing else in this verdict) gave 0.9993 and (-0.02, -0.06, -0.07), also inside the bounds, so run-to-run spread of the
  aggregate is about 0.001 against a bound of 0.005. The lane's own committed figure for this code (measured at `6708326`,
  whose `src/` is identical: 1.0002, std 0.0129, (0.07, 0.00, -0.07)) equals mine to the printed digit.

## 3. Criterion 2: arms drawn alone

`$N/diag-arm-lighting3.mjs` (the prior gate's diagnostic, now taking the tree under test from `T103_ROOT`) stages the pose
facing right and the mirrored aim facing left, hides everything in RIG but the two `rig-arm-*` meshes, and measures the
arms' pixels. Gun R; `analyze-case2.py` output in `$N/analyze-diag-{fixed,prefix,m4}.out`.

| pose | pre-fix `11ff74e` L/R luma | fixed `c6d475e` L/R luma | fixed arm pixels R / L | fixed arm RGB R | fixed arm RGB L |
| --- | --- | --- | --- | --- | --- |
| stand, aim right / left | 0.747 | **0.996** | 134 / 137 | (83.1, 71.4, 55.7) | (82.3, 71.1, 56.1) |
| run-flight, aim down | 0.715 | 1.007 | 120 / 122 | (79.5, 67.3, 52.3) | (79.8, 67.8, 53.0) |
| air-rise, aim down | 0.724 | 0.990 | 118 / 122 | (81.5, 68.6, 52.6) | (80.5, 68.0, 52.3) |
| climb-1, aim right | 0.715 | 0.999 | 65 / 68 | (82.3, 70.6, 55.1) | (81.8, 70.7, 55.6) |

Pre-fix the left-facing arm reads (53.2, 54.4, 47.4), grey-olive, green minus red +1.2. (The prior gate quoted 0.711 for
the stand case from an earlier version of this script; today's pre-fix figures are 0.715 to 0.747, the same 25 to 28 %
deficit. A few percent between runs of this measure comes from the camera's sub-pixel phase at pause time, which differs
per run and per tree.) Live mesh state read in the page: at `c6d475e` material side 0 (`FrontSide`), 0 clockwise triangles
in every arm mesh in both facings, left-facing index `[0,1,2,2,1,3,4,5,6,6,5,7]`; at `11ff74e` side 2 (`DoubleSide`) and 4
clockwise triangles per left-facing arm mesh.

**Same-page A/B, so the camera cannot move between the two shots** (`$N/prefix-emulation.mjs`, `$N/material-ab.mjs`;
outputs `$N/ab-prefix-emulation.out`, `$N/ab-material.out`). In one page of the fixed head, I put the arm meshes back into
the pre-fix renderer's state (material `DoubleSide` with `forceSinglePass`, and the single pre-fix triangle order for both
facings), photographed, restored the shipped state and checked that it came back pixel-identical (0 px differ in all 8
restores). Four poses, whole figure:

| pose (gun R) | facing right: shipped vs pre-fix state | facing left: shipped vs pre-fix state | whole-figure L/R luma, shipped | whole-figure L/R luma, pre-fix state |
| --- | --- | --- | --- | --- |
| stand, aim right / left | **0 px differ** | 141 px differ | 1.006 | 0.924 |
| run-flight, aim down | **0 px differ** | 119 px | 1.014 | 0.948 |
| air-rise, aim down | **0 px differ** | 118 px | 1.016 | 0.940 |
| climb-1, aim right / left | **0 px differ** | 76 px | 0.989 | 0.960 |

So the fix changes no facing-right pixel and, facing left, only pixels inside the arm meshes' footprint. Separately, swapping only the
material (shipped `FrontSide` against the pre-fix `DoubleSide` + `forceSinglePass`, on the fixed index) changes **0 pixels**
in all 8 cells (4 poses x 2 facings), and a same-page repeat is also 0: with the winding right, `FrontSide` hides nothing
that `DoubleSide` drew.

An exhaustive state-level sweep of the same live meshes, all 1040 cells in capture order and again in a seeded shuffle
(so consecutive cells flip facing at random, which is what a stale index buffer would trip on) (`$N/sweep-live-winding.mjs`,
`.log`): hands shown 1040, arm meshes visible 1680, **0 clockwise triangles, 0 not-FrontSide, 0 wrong index for the facing, 0
stale facing flags**, smallest triangle area +0.0489 (positive is counter-clockwise), in both passes. It reads JS-side
state, so it cannot see the GPU upload; the pixel checks above and in section 4 do.

No arm vanishes anywhere in the shipped build: figure pixel count L/R over the 520 desktop pairs has mean 0.9961 and
minimum 0.936 (a wall-row cell; the pre-fix capture's minimum is 0.942 and main's BEFORE 0.955, so it is the body art's
own wall asymmetry, not arms), no pair under 0.90, no cell with RIG hidden (`count-ratio-desktop.out`; phone 0.9949 / 0.940).

## 4. Criterion 3: the test binds

`node $N/run-domain.mjs <tree> t-103-arm-winding.mjs` runs one pathcheck domain from a given tree (the lane's own runner is
`tools/pathcheck.mjs`, which runs all of them; d78 is registered in `tools/pathcheck/manifest.mjs` and the full run counts it).
Scratch trees are `git archive` exports of `c6d475e` (`$N/mut/*`), one edit each, no tracked file touched.

| tree | edit | d78 (passed / failed) | what it reported |
| --- | --- | --- | --- |
| `c6d475e` | none | **4 passed, 0 failed** | green |
| `11ff74e` source + `c6d475e` gate files | the defect itself | **1 passed, 3 failed** | "order: one fixed order [0,2,1,2,3,1,4,6,5,6,7,5] for both facings; clockwise 0/32000 facing right, **32000/32000 facing left**"; the right-order assertion and the material assertion also fail |
| M1 | `ARM_TRIANGLES_FACING_LEFT` set to the right-facing order | 3 / 1, red | 32000/32000 left-facing triangles clockwise |
| M2 | arm material `FrontSide` back to `DoubleSide` | 3 / 1, red | the material contract assertion |
| M3 | `writeArm` always picks facing 1's order | 3 / 1, red | "no arm index found in player.js" (it goes red by the reader losing the spelling, not by a computed area) |
| M6 | the right-facing order made clockwise | 2 / 2, red | 32000/32000 right-facing clockwise; the unchanged-right-order assertion |
| **M4** | **delete `index.needsUpdate = true;` in `writeArm`** | **4 / 0, green** | not seen statically |

Browser-free cross-check (`$N/winding2.mjs`, the shipped `rigArmSegmentCorners` and `rigArmTriangleIndex`): signed area of
the arm triangles is positive in both facings with the shipped per-facing order (0 of 32 clockwise); with the single
pre-fix order every left-facing triangle is negative (16 of 32).

**The reviewer's finding (M4), reproduced live, not a failure.** With the `needsUpdate` line deleted the JS-side state is
still right (index `left`, 0 clockwise triangles, `FrontSide`) but the GPU keeps the facing-right index buffer, so under
`FrontSide` the left-facing arms vanish: arms drawn alone facing right 125 to 139 px, facing left **0 px**, in both poses I
staged (`$N/analyze-diag-m4.out`). The live symmetry check does catch it: a 48-cell capture of that tree gives mean L/R
**0.9045**, mean RGB delta (-6.44, -5.10, -3.49), `symmetry.mjs` and the Python script both exit **1**, and two pairs
show a figure pixel-count drop under 0.90 (the same 24 pairs on the shipped head: 0.9984, exit 0). The line is present in
the shipped build, so I do not fail the lane on it; proposed issue 1 asks for that small capture to run in a browser gate.

## 5. Criterion 4: everything else unchanged

| check | result |
| --- | --- |
| `node tools/rig-grip/check.mjs` (new CLI) | prints stats, **exit 0**: 4840 combinations, 0 failures; worst fist-to-grip 0.0965 atlas px (bound 1); worst muzzle-to-spawn 0.1035 desktop-FAR px (bound 1); gain-1 arm stretch max x1.135 (bound 1.15); portrait max x1.608 (ceiling 1.75). Identical to the prior gate's numbers. Its fail path: in a scratch copy with the fist anchor moved +3 atlas px it prints `FAIL arm strip: fist anchor [1171.8,705.7] is 3.02 px from the painted fist centroid` and **exits 1** (`$N/check-cli-mutant.out`) |
| fault injection through the gate's own parameters (`$N/run-gate-mutants.mjs`) | control 0 failures; fist anchor +3 px red; rivet-gun grip +3 px red; rivet-gun `muzzleY` 82 (main's value) red; +0.3 px (inside tolerance) green: "GATE BINDS" |
| d77 (`t-103-rig-grip-alignment.mjs`) / d78 | **21 passed / 0 failed**; **4 passed / 0 failed** |
| `node tools/pathcheck.mjs` (informational; a green gate is not evidence, decisions entry 21) | `pathcheck: 4011 passed, 0 failed` in 19.6 s; the 4 `render-submission-contract` browser-probe assertions are skipped by `HB_GATE_SKIP_BROWSER_PROBE=1` and not counted. That is the prior gate's 4007 plus d78's 4 |
| sim and config | `git diff 98b12c9..HEAD -- src/sim src/config.js` and `git diff 11ff74e..HEAD -- src/sim src/config.js assets index.html`: 0 lines |
| live fist-to-grip, desktop FAR 1280x800 DPR 1, 1040 cells | max **0.022** / mean 0.0091 css px, 0 cells over 1 css px; muzzle-to-spawn max 0.157 / mean 0.0565 (bound 1, 0 over); hand kind `rig-arm` 1040 of 1040; RIG hidden in 0; page errors 0; arm stretch max 1.102 (16 cells above 1.0, 4 above 1.05). The prior gate measured 0.023 / 0.157: reproduces |
| live fist-to-grip, phone 844x390 DPR 2, all 1040 cells (400 + 640) | max **0.010** / mean 0.0043 css px; muzzle-to-spawn max 0.076; 0 over; `rig-arm` 1040 of 1040; hidden 0; page errors 0; stretch max 1.102 |
| portrait 390x844 DPR 2, gun R, 3 rows (48 cells); `?crouch=1` row (20 cells) | fist-to-grip 0.013 / 0.017, muzzle-to-spawn 0.137 / 0.120, 0 hidden, 0 page errors; portrait arm stretch up to x1.476 (the lane's disclosed limit, unchanged) |
| in situ, desktop FAR, RIG actually firing in the real loop with the real background (gun R: right, left, up-left; paused on the shot frame) | fist-to-grip 0.013 / 0.013 / 0.014 css px; drawn muzzle vs the recoil-shifted spawn 0.102 / 0.049 / 0.036 css px, vs the unshifted spawn 1.71 / 1.72 / 1.69 (the 0.095-tile recoil kick that exists on main; unchanged from the prior gate); each live shot travels along its staged aim (vx +26, -26, and (-18.4, +18.4)) |
| **smoke: `mid-route.json`** (main's harness, worktree served by main's server, `--deterministic --viewport 480x300`) | **PASS**: `smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`. 26 of 26 events dispatched, `bootError` none, `pageErrors` [], 0 console errors, 0 falls. Final sim state x 55.649, y 1, gameMs 9900.198, hp 2, scrollX 56.2043, kills 0; minEdgeMargin 26.53; idle fraction 0.318 (prior gate 0.34: wall-clock-weighted samples; fractions are usable, absolute seconds are not). **Identical to the prior gate's final state** and to the T-102 gate's run on a different build, as it must be with no sim change |
| **smoke: `transform-slice.json`** (same setup, `--max-runtime-ms 20000`) | **PASS**: `smoke-verdict: PASS (outcome=completed deaths=0 tick=938/1104)`. BREACH CLEAR at tick 938, 2 of 2 transformations; final x 146.0874, y 10.4443, scrollX 130.2807, gameMs 15633.646, hp 3, 0 falls; idle fraction 0; minEdgeMargin 30.07; `bootError` none, `pageErrors` [], 0 console errors. **Identical to the prior gate's final state.** The harness's "6 of 58 events never dispatched" is the post-victory freeze |
| `?selftest=1` in the browser | `SELFTEST PASS (39 checks)`, 0 page errors (`$N/selftest.out`) |
| right-facing renders unchanged | the fix reorders only the left-facing triangles and drops `DoubleSide`/`forceSinglePass`. **Same page, camera fixed: 0 facing-right pixels differ between the shipped state and the emulated pre-fix state in all four poses; 0 pixels differ from swapping the material alone in all 8 cells** (section 3). Across runs, the mean absolute colour difference per pixel (sum-RGB) between my fresh facing-right cells and the prior gate's `11ff74e` capture is 1.355 (p99 1.98, max 2.21), against a same-code noise floor of 1.384 (p99 2.09, max 2.52) between two captures of this very head (the sub-pixel phase of the camera at pause time differs per run, so exact equality across runs is not expected). Facing-left cells: 2.110 (p99 3.25, max 3.44) against a floor of 1.351: they changed, as intended |

Pacing: no dead spot in either smoke script (A.5 numbers above; no sim change). I looked at both final screenshots
(`$N/smoke-mid/screenshot.png`, `$N/smoke-transform/screenshot.png`, 480x300): the HUD, the deck, the BREACH CLEAR overlay,
no glitches; RIG is about 6 px tall there, so the arms are judged from the capture tool, not from those frames.

## 6. Criterion 5: what I saw (observation, not a fun verdict)

I read these images; RIG at desktop FAR is about 30 px tall (18.0 to 18.25 px per tile).

- **True size, 1x.** `$N/cap-desktop/sheet-desktop-R-1x.png` (13 poses x 8 aims, facing right on the left half and facing
  left on the right half) and `$N/look/pairs-R-1x.png` (right-facing, mirrored left-facing as captured, left-facing
  flipped back): the two halves read the same warm tan; nothing grey-olive; no missing arm, no seam, no stray pixels.
- **4x.** `$N/look/pairs-R-4x.png` (gun R: stand, run-flight, air-rise), `$N/look/pairs-F-4x.png` (gun F: stand, run-contact,
  air-fall), `$N/look/sheet-S-4x-wall-hit-respawn.png` (gun S, wall / hit / respawn, all 16 columns, facing right above and
  facing left below), `$N/cap-desktop/sheet-desktop-{R,S,L,H,F}-4x.png` (all five guns): facing left is the mirror of
  facing right in colour and form.
- **Pre-fix vs fixed, side by side, same pose, today's captures.** `$N/look/fourway-R-stand-8x-livecontrol.png` and
  `$N/look/fourway-R-4x-livecontrol.png` (columns: pre-fix right | pre-fix left | fixed right | fixed left). Pre-fix left:
  the arm and the torso's near side go grey-olive (luma ratio 0.937 for the stand pose); fixed left: warm tan, 1.007.
  `$N/look/diag-fixed-stand-8x.png`, `$N/look/diag-fixed-flight-air-6x.png`: the arms drawn alone are the same tan facing
  either way.
- **Phone and portrait.** `$N/look/pairs-phone-F-3x.png` (gun F, 844x390 DPR 2), `$N/look/pairs-portrait-R-3x.png`
  (390x844 DPR 2, the long portrait arms): both facings the same warm colour.
- **In the real scene, with its lighting, bloom and tone mapping.** `$N/cap-fire-desktop-R/desktop-firing-sheet-4x.png` and
  `$N/look/fire-R-right-left-upleft-10x.png`: RIG firing right, firing left and firing up-left; the left-facing torso and
  arms are warm tan like the right-facing one (the prior gate's same frame had the left-facing torso grey-olive), the
  gun sits in the fist, the muzzle flash and shot leave from the barrel.
- Everything the prior gate observed about the art is unchanged because the vertex positions and textures are unchanged:
  the guns sit in the fists in all 13 poses, five guns, both facings; aim-up puts the weapon over the helmet for all five
  guns (RIG reads headless at true size); standing up / diagonal aims use the braced crouch; in aim-down air frames the arm
  folds with the elbow above and behind the shoulder; on ladders the gun hand is the far arm, drawn one-handed; portrait
  arms stretch up to x1.5. These are the operator questions in section 8, not defects.

## 7. Limits, and what this does not establish

- Bots and captures are evidence about regressions and looks. They are not a fun verdict, and they say nothing about feel.
- The symmetry measure is a mean colour over a figure mask on staged, paused cells with RIG isolated from the world, on
  SwiftShader. It proves left equals right; it does not prove the arms are the right colour in absolute terms. That the
  right-facing arms did not change is shown separately: 0 differing pixels against the emulated pre-fix renderer in the same
  page (section 3), and within the noise floor across runs.
- **Other facets of the tower** were not captured (the tool stages at s = 6 only). By construction the arm and body quads
  carry the same +z normal in both facings, so their lighting is identical on any facet; this is an inference, not a
  measurement. The same applies to RIG against real ladder rungs and the 0.3-tile climb drop (nobody has judged them in situ).
- In-situ coverage is three firing frames of gun R. The shuffled sweep exercises random facing flips on the real meshes,
  but I did not film continuous play.
- Not tested: real GPU hardware and the 60 fps budget (SwiftShader only; the reviewer measured +2 draws, +8 triangles and
  192 bytes of vertex upload per frame), iOS Safari, ladders in situ, a merge with main.
- **Integrator note** (none of it is a QA criterion): this PASS is pinned to `c6d475e`. Main has moved; the reviewer found
  one conflict, `tools/pathcheck/manifest.mjs`, where main's `d77` / `d78` (T-102 turns, T-101 touch deck) collide with this
  lane's two domains (renaming the lane's to `d79` / `d80` resolves it, per `review.md`). A merge changes the head, so
  `merge-task.sh` will see this file as stale by mtime; `review.md` lists the check that the merge left the lane's files
  alone. I did not test the merged tree. The integrator's ruling of no `?hands=legacy` hatch is recorded in `build.md`
  (the old art is recoverable from `98b12c9`); I have nothing to add to it.

## 8. Operator checkpoint questions (feel; for the queue; I do not judge these)

Unchanged by the fix (the geometry and art are the same). URL: `node tools/serve.mjs 8783 --root
/home/user/hullbreaker/.claude/worktrees/T-103`, then http://127.0.0.1:8783/index.html (desktop) and the same at 844x390 in
devtools; main on 8741 is the comparison.

1. Hold height. Concept board 01 shows the rifle at chest height in both hands; the shipped hold is belt height with one
   lowered arm to a low pistol grip, because the sim fires from 1.05 tiles. Acceptable, or should the muzzle (a sim change
   that moves the shot line) come up?
2. Aiming straight up at true size: the weapon covers the helmet and RIG reads headless. Fine, or a problem for "chaos
   stays readable"?
3. Standing and aiming up or diagonally, RIG hunches into the braced crouch while the sim hitbox stays standing. How does
   that read next to main's raised arms?
4. Aiming down in the air (flight / rise): the arm folds up behind the shoulder. Does the pose look right at speed?
5. Ladders: one hand on the rung, the other holding the weapon at the hip, body drawn 0.3 tiles lower than the sim's feet.
   How does the climb read, and does the mount or dismount pop?
6. Portrait: arms stretched up to x1.5 to stay on the grip. Accept, drop the portrait gain, or scale the sim muzzle?
7. Turning round while firing: the arm and gun now flip facing exactly like the body. Does anything about the turn itself
   (not the colour, which I measured) feel off compared with main?

## PROPOSED INBOX ISSUES

I did not edit SPRINT.md. Issue ids are left for the integrator. `$N` is the scratch directory named at the top.
Status of the prior gate's three proposed issues at `c6d475e`: the left-arm winding defect (S2) is **fixed**
and verified above; `check.mjs` having no CLI (S3) is **fixed** and verified (it prints stats and exits 0 / 1); the 4x
sheets (S3 docs) are **still open**, as proposed issue 4.

## I-??? | bug | S3 | repro: scratch copy of `c6d475e`, delete `index.needsUpdate = true;` in `writeArm` (`src/render/player.js:632`); `node $N/run-domain.mjs <copy> t-103-arm-winding.mjs` stays 4/0; then `node tools/rig-grip/capture.mjs --root <copy> --out $O --views desktop --guns R --rows stand,run-flight,air-rise && node tools/rig-grip/symmetry.mjs $O` (`<copy>` = a tree with `index.html`, `src/`, `assets/`) @ c6d475e | evidence: reports/tasks/T-103/playtest.md section 4; `$N/analyze-diag-m4.out`, `$N/mirror-symmetry-m4-live.out`, `$N/cap-m4/`
d78 binds the winding and the material from the source spelling and cannot see the GPU upload: without `needsUpdate` the
JS-side index is right but the GPU keeps the facing-right one, and under `FrontSide` the left-facing arms vanish (0 arm pixels live; right-facing 125 to 139). The
shipped build has the line and is correct, so nothing blocks T-103. The live check catches it: the same 48-cell
capture gives L/R 0.9045 and exit 1 on the mutant against 0.9984 and exit 0 on the shipped head (about a minute of browser time). Add that
capture plus `symmetry.mjs` (and optionally an arm pixel-count check, `$N/count-ratio.py`) to the browser PLAY gate the
reviewer suggested for T-120. Same hole class as decisions entry 21: a green static gate proves a spelling.

## I-??? | docs | S3 | repro: follow the `tools/playtest/README.md` "Pinned-worktree capture" recipe (`node <main-checkout>/tools/serve.mjs 8749 --root /tmp/hb-pin --quiet &`) inside an agent harness where each tool call is its own shell, then run `node run.mjs … --base-url http://127.0.0.1:8749` from a later call | evidence: `$N/serve-8786.log` ("launcher 6252 disappeared; closing leased Hullbreaker server"), `$N/smoke-mid.log` first attempt `net::ERR_CONNECTION_REFUSED`
A `--quiet` server is leased to its launching process and exits when that shell does, so the recipe (and the QA brief's
`… --quiet &`) fails with a connection refusal on the first run in a per-call shell. It reads like a game boot failure. The recipe should say
`--quiet --keep-orphan` and kill the server by PID afterwards (never `pkill -f` a pattern that appears in the calling command line).

## I-??? | docs | S3 | repro: `node tools/rig-grip/capture.mjs --out $O --views desktop --crouch` @ c6d475e | evidence: tools/rig-grip/README.md, `capture.mjs` usage header
`--crouch` only appends `&crouch=1` to the URL; without `--rows crouch` the tool photographs all 13 default rows (1040
cells) under `?crouch=1`. The README says "`--crouch` boots `?crouch=1` for the crouch row" and the usage line is `[--crouch]`.
Make `--crouch` default `--rows` to `crouch`, or say so in both places.

## I-??? | docs | S3 | repro: `ls reports/tasks/T-103/evidence/` @ c6d475e against SPRINT T-103 acceptance box 1 ("at true FAR size and at 4x") | evidence: reports/tasks/T-103/build.md "Fix cycle 1", `$N/cap-desktop/sheet-desktop-{R,S,L,H,F}-4x.png`
Carried from the prior gate, S3, the integrator's call: only `desktop-R-before-after-4x.png` is committed at 4x; the S / L / H / F 4x
sheets are 4.0 MB together and the lane records the regeneration command instead (each is the committed 1x sheet
magnified by nearest neighbour). I regenerated AFTER-only 4x sheets for all five guns from today's capture; they are in the
scratch directory, not committed, and are not a before/after substitute.

## Appendix: commands and evidence index

Commands (all from the worktree unless noted; `. ~/.hullbreaker-host.env` first):

```sh
# pin + server (main's copy)
node /home/user/hullbreaker/tools/serve.mjs 8786 --root /home/user/hullbreaker/.claude/worktrees/T-103 --quiet --keep-orphan &
# criterion 1: the fresh matrix, then both symmetry tools
node tools/rig-grip/capture.mjs --out $N/cap-desktop --views desktop
python3 -I $N/mirror-symmetry-check.py $N/cap-desktop desktop          # exit 0
node tools/rig-grip/symmetry.mjs $N/cap-desktop --view desktop         # exit 0
node tools/rig-grip/capture.mjs --out $N/cap-phone  --views phone --rows stand,run-flight,air-rise,climb-1,wall
node tools/rig-grip/capture.mjs --out $N/cap-phone2 --views phone --rows run-contact,run-pass,air-fall,climb-0,climb-2,climb-3,hit-iframe,respawn
node tools/rig-grip/capture.mjs --out $N/cap-fire-desktop-R --views desktop --firing --guns R --firing-aims right,left,up-left
node tools/rig-grip/capture.mjs --out $N/cap-portrait --views portrait --guns R --rows stand,run-flight,climb-1
node tools/rig-grip/capture.mjs --out $N/cap-crouch --views desktop --crouch --rows crouch
# pre-fix control (exported 11ff74e) and the M4 mutant
node tools/rig-grip/capture.mjs --root $N/pre-11ff74e --out $N/cap-prefix-R --views desktop --guns R --rows stand,run-flight,air-rise
node tools/rig-grip/capture.mjs --root $N/mut/m4-no-needsUpdate --out $N/cap-m4 --views desktop --guns R --rows stand,run-flight,air-rise
# criterion 2
T103_ROOT=<tree> node $N/diag-arm-lighting3.mjs $N/diag-fixed-R R stand:right,run-flight:down,air-rise:down,climb-1:right
python3 -I $N/analyze-case2.py $N/diag-fixed-R
T103_ROOT=<tree> node $N/prefix-emulation.mjs $N/ab-prefix-emulation R stand:right,run-flight:down,air-rise:down,climb-1:right   # same-page A/B
T103_ROOT=<tree> node $N/material-ab.mjs $N/ab-material R stand:right,run-flight:down,air-rise:down,climb-1:right
QA_ROOT=<tree> node $N/sweep-live-winding.mjs $N/sweep-live-winding.json
# criterion 3 and 4 (headless)
node $N/run-domain.mjs <tree> t-103-arm-winding.mjs ; node $N/run-domain.mjs <tree> t-103-rig-grip-alignment.mjs
node tools/rig-grip/check.mjs ; node $N/run-gate-mutants.mjs ; node tools/pathcheck.mjs ; node $N/winding2.mjs <tree>
# smoke (cwd /home/user/hullbreaker/tools/playtest; main's harness)
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8786 --out $N/smoke-mid
node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300 --max-runtime-ms 20000 --base-url http://127.0.0.1:8786 --out $N/smoke-transform
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs <out>/report.json
node $N/selftest.mjs /home/user/hullbreaker/.claude/worktrees/T-103     # ?selftest=1 title
```

| what | path under `$N` |
| --- | --- |
| desktop matrix, 1040 cells, 5 contact sheets at 1x and 4x | `cap-desktop/{capture.json,cells/,sheet-desktop-{R,S,L,H,F}-{1x,4x}.png}`, log `cap-desktop.log`, `analyze-desktop.out` |
| symmetry outputs | `mirror-symmetry-{desktop,phone-all,portrait,crouch,main-before,lane-prefix,prefix-live,fixed-subsetR,m4-live}.out` (`.mjs.out` = the lane's port), `symmetry-by-aim-{fixed,prefix,before}.out`, `mirror-blur-diff.out`, `count-ratio-{desktop,phone,m4}.out` |
| phone, portrait, crouch, in-situ firing | `cap-phone/`, `cap-phone2/`, `cap-phone-all/` (links), `cap-portrait/`, `cap-crouch/`, `cap-fire-desktop-R/{capture.json,desktop-firing-*.png}`, `analyze-{phone,phone2,portrait,crouch}.out` |
| arms alone, same-page A/B | `diag-fixed-R/`, `diag-prefix-R/`, `diag-m4-R/` (+ `diag.json`), `analyze-diag-{fixed,prefix,m4}.out`, `ab-prefix-emulation/` + `.out`, `ab-material/` + `.out`, `sweep-live-winding.{json,log}` |
| controls | `cap-prefix-R/` (live 11ff74e), `cap-m4/` (live M4), `pre-11ff74e/` (export), `mut/*` (scratch mutants), stored cells from the prior gate: `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t103-gate/{lane-before,lane-after}/` |
| headless gates | `check-cli.out`, `check-cli-mutant.out`, `run-gate.out`, `run-gate-mutants.out`, `d78-mutants.out`, `d78-vs-prefix-src.out`, `winding-fixed.out`, `pathcheck-full.log` |
| smoke | `smoke-mid/{report.json,summary.md,screenshot.png}`, `smoke-mid.{log,verdict}`, `smoke-transform/{…}`, `smoke-transform.{log,verdict}`, `selftest.out` |
| images I read | `look/{pairs-R-1x,pairs-R-4x,pairs-F-4x,pairs-phone-F-3x,pairs-portrait-R-3x,fourway-R-stand-8x-livecontrol,fourway-R-4x-livecontrol,diag-fixed-stand-8x,diag-fixed-flight-air-6x,fire-R-right-left-upleft-10x,sheet-S-4x-wall-hit-respawn}.png` |
| scripts written for this re-gate | `mirror-symmetry-check.py`, `count-ratio.py`, `symmetry-by-aim.py`, `analyze-capture.py`, `analyze-case2.py`, `diag-arm-lighting3.mjs`, `prefix-emulation.mjs`, `material-ab.mjs`, `sweep-live-winding.mjs`, `winding2.mjs`, `run-domain.mjs`, `selftest.mjs`, `pairs.py`, `fourway.py`, `diag-montage.py`, `right-unchanged.py`, `mirror-blur-diff.py`, `run-gate.mjs`, `run-gate-mutants.mjs`, `queue{1,2,3,4,5}.sh`, `smoke-run.sh`, `smoke-transform.sh`, `m4-capture.sh`, `crouch-capture.sh`; the repo-resident equivalent of the symmetry script is `tools/rig-grip/symmetry.mjs` (identical output on all seven cell sets I ran both on) |
| working notes | `notes.md`, `queue.log` |
