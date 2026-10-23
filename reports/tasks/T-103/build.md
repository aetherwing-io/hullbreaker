# T-103 build report — RIG's weapon sits in his hands

Worktree `/home/user/hullbreaker/.claude/worktrees/T-103`, branch `task/T-103`
(base `main` 98b12c9). Operator defect (decisions.md entry 20): *"the models
are a little off (like guns don't align to hands)."*

**What changed, in one line:** the painted arm parts outside RIG's torso
(forearms, fists, a far arm swinging clear) are cut out of his body frames,
and RIG's own arm (copied 1:1 from his aim painting) is bent onto the
weapon's painted pistol grip every frame. The weapon stays exactly where the
simulation fires from. **No simulation change:** `src/sim/` and
`src/config.js` are byte-identical to main, and so are `CONFIG.player.muzzleY`
and `barrelTiles`. The drawn muzzle was moved onto the sim spawn, never the
other way round.

I do not judge fun or looks. Everything below is measurement; the look
questions are at the end.

## Fix cycle 1: playtest FAIL, left-facing arms lit as back faces

The playtest gate (reports/tasks/T-103/playtest.md, head 11ff74e) failed T-103
on one defect, and it was real. When RIG faced left, the two re-posed arm
meshes rendered as back faces and lost the key light. The left-facing arm drew
at 71 % of the right-facing luma (warm tan turned grey-olive), and the whole
figure was 4 % darker facing left (mean luma ratio L/R 0.958 on desktop,
0.959 on phone, against 0.9996 on pre-T-103 main).

**Cause.** `rigArmSegmentCorners()` mirrors a left-facing arm by negating x,
which reverses a quad's winding. `player.js` drew both facings with one
triangle order, `[0,2,1, 2,3,1, …]`, so every left-facing arm triangle was
clockwise. The material was `DoubleSide` with +z normals, so three.js flipped
the normal and N·L for the key light went negative. My gates could not see it:
`raster.mjs`/d77 and the fist-to-grip capture measure geometry, not light. I
did not catch it in my own sheets either.

**Fix (6708326; render-only, no sim change):**

- `src/pure/rig.js` `rigArmTriangleIndex(mirror)` gives each facing's triangle
  order: the same two triangles per strip (TL-BL-TR, BL-BR-TR), wound
  counter-clockwise either way. The right-facing order is exactly the old one.
- `src/render/player.js` `writeArm()` rewrites the 12 indices in place, only
  when the facing changes (no allocation, a 24-byte upload per turn), with the
  same `pose.mirror` it passes to `rigArmSegmentCorners()`. The arm material is
  now `FrontSide`: with the winding right, +z is the lit side, and a future
  winding slip makes the arms vanish rather than go quietly dark.

**The test that binds:** `tools/pathcheck/t-103-arm-winding.mjs`, a new domain
registered as d78 with 4 assertions.

- It computes the signed area of every arm triangle the renderer can draw:
  every rigged frame x 8 aims x facings x 5 chassis x gain 1/1.5 x recoil 0/max
  x standing/crouched, 64,000 triangles. It uses the same `rigArmPose()` solve
  and the same `rigArmSegmentCorners()` calls as `writeArm()`, with the
  triangle order read off `player.js`, i.e. the order the renderer really uses.
- It also holds the material contract: `FrontSide`, +z normals, no mirroring
  transform on the arm meshes, and `writeArm` mirroring the corners with the
  `pose.mirror` the order is chosen for.
- Its own binding proof: one fixed order for both facings is caught on every
  left-facing triangle.

Red then green:

```
# new domain against a git-archive export of the pre-fix head 11ff74e
FAIL T-103: every arm triangle the renderer draws is counter-clockwise (a front face) facing right AND facing left
     (order: one fixed order [0,2,1,2,3,1,4,6,5,6,7,5] for both facings; clockwise 0/32000 facing right, 32000/32000 facing left)
FAIL T-103: the right-facing arm keeps its pre-fix triangle order; only the mirrored order flips
FAIL T-103: the arm material is FrontSide with +z normals, the arm meshes are never mirrored by a transform, and …
T-103 — RIG's arms are front faces in both facings (winding + material side): 1 passed, 3 failed
# the same domain on the fix
T-103 — RIG's arms are front faces in both facings (winding + material side): 4 passed, 0 failed
```

**Re-gate criteria (playtest.md section 7), measured on the fixed build:**

| criterion | result |
|---|---|
| 1. `python3 -I mirror-symmetry-check.py <full desktop capture>` exits 0: mean luma ratio L/R 1.000 +- 0.005, mean RGB delta within +-0.5, no row off by more than 0.015 | **exit 0, SYMMETRIC.** 520 pairs from a fresh 1040-cell desktop capture at 6708326: mean **1.0002** (std 0.0129; pre-T-103 main 0.9996 / 0.0185), mean RGB delta **(0.07, -0.00, -0.07)**, rows 0.993 (hit-iframe) to 1.007 (air-fall), guns 0.999–1.001, pairs more than 2 % darker facing left 6 % (main 14 %). The repo's own port, `node tools/rig-grip/symmetry.mjs`, prints identical numbers and also exits 0. On the pre-fix head both scripts give 0.9579 and exit 1 |
| 2. left-facing arms alone within +-3 % of right-facing luma (`diag-arm-lighting.mjs` case `stand:right`, then `analyze-case.py`) | **1.012** (right-facing arms: 139 px, RGB 82.2/70.9/55.6, luma 72.2; left-facing: 138 px, RGB 83.1/71.8/56.3, luma 73.1; G−R shift −0.1; shipped before the fix: 0.711). Under the now-shipped FrontSide the left-facing arms show all 138 px (they vanished before). Whole figure L/R 1.011 |
| 3. a pathcheck test red on the defect, green on the fix | d78, above: red on 11ff74e, green on 6708326 |
| 4. nothing else moves | `runGripCheck` unchanged: 4840 combinations, 0 failures, worst 0.0965 atlas px / 0.1035 px, stretch x1.135 / x1.608. d77 21/21. Live fist→grip on the fixed desktop capture: max 0.022 / mean 0.0091 css px; muzzle max 0.157 / mean 0.0565 css px (identical to before the fix: the vertex positions did not change, only the triangle order). Smoke: both PASS on the first attempt at 6708326 (main's harness, host knobs loaded, pinned worktree on 8753), and the final states are **identical** to the playtest's: mid-route `tick=594/594`, x 55.649, gameMs 9900.198, hp 2; transform-slice BREACH CLEAR at `tick=938/1104`, gameMs 15633.646, x 146.0874, y 10.4443, scrollX 130.2807, hp 3, 0 falls. Zero page errors and zero console errors in both |

**Also requested:**

- `node tools/rig-grip/check.mjs` now runs the gate. It prints the stats and
  exits 1 on any failure: PASS, exit 0 on the fix. With the fist anchor moved
  +3 atlas px in a scratch copy: "RIG-GRIP GATE: FAIL (4841 failures)", exit 1.
- New `tools/rig-grip/symmetry.mjs`: the playtester's facing-symmetry check
  ported to Node, next to the fist-to-grip tool, so the repo has a gate that
  sees shading. It matches the Python to the printed digit on the pre-T-103
  cells (0.9996, exit 0), the pre-fix AFTER cells (0.9579, exit 1) and the
  fixed cells (1.0002, exit 0).
- **4x sheets for S/L/H/F are not committed.** They come to 4.0 MB for the
  four (0.96–1.05 MB each), over the ~2 MB ceiling. Each is exactly the
  committed 1x sheet magnified 4x by nearest neighbour:
  `convert evidence/desktop-S-before-after-1x.png -filter point -resize 400% s4.png`
  or PIL `Image.NEAREST`. The `compose.mjs` 4x variant also prints a number
  under each cell; it is regenerable from the capture directories with
  `node tools/rig-grip/compose.mjs --before <before dirs> --after <after dir> --out <dir> --scales 4`.
  A copy sits in the worktree's ignored `tools/playtest/runs/T-103-sheets-fix/`.
- **All AFTER evidence is re-shot on the fixed build:** the desktop sheets,
  the crouch row, the phone firing shots and the portrait stand row. The
  BEFORE halves are unchanged. Facing symmetry (`symmetry.mjs`; the numbers
  are also in `evidence/capture-summary.json` under `facingSymmetry`):

  | capture | pairs | before the fix: mean L/R | after (6708326): mean L/R, RGB delta, verdict |
  |---|---|---|---|
  | desktop FAR, 1040 cells | 520 | 0.9579 | **1.0002**, (0.07, 0.00, -0.07), SYMMETRIC |
  | phone 844x390 DPR 2, R and F, 416 cells | 208 | 0.9566 | **1.0005**, (0.06, 0.02, -0.04), SYMMETRIC |
  | crouch row (`?crouch=1`), all guns | 10 | 0.9279 | **1.0039**, (0.13, 0.26, 0.29), SYMMETRIC |
  | portrait 390x844 DPR 2, R, 3 rows | 24 | 0.9261 | **1.0004**, (0.02, 0.02, 0.02), SYMMETRIC |
  | pre-T-103 main 98b12c9, desktop (control) | 520 | — | 0.9996, (-0.02, -0.04, -0.04), SYMMETRIC |

  In situ, the phone firing sheet's aim-left panel now shows the same warm tan
  as aim-right. Its numbers did not move: fist→grip 0.007–0.010 css px; the
  muzzle is 0.011–0.050 css px from the recoil-shifted spawn; every shot runs
  along its aim.

**Integrator rulings recorded:**

- No `?hands=legacy` hatch. T-103 fixes an operator-named defect; the old art
  is recoverable from git (98b12c9).
- The recoil-shifted muzzle on the shot frame (1.7 css px at desktop FAR) is
  pre-existing and acceptable.

## Acceptance status

| # | box | status | currency / falsifying test |
|---|---|---|---|
| 1 | before/after contact sheet, every pose x aim x facing x gun, true FAR size and 4x | **met** (desktop FAR, all 5 guns at true size; 4x committed for R, regenerable for all) | `evidence/desktop-*-before-after-*.png`; 1040 live cells per tree plus the crouch row |
| 2 | grip within 1 atlas px of the hand for every combination, measured on the RENDERED result, proven to bind | **met** | gate `tools/rig-grip/check.mjs` (pathcheck domain d77): worst 0.097 atlas px over 4840 combinations. The gate draws the shipped atlases through a software compositor that runs player.js's own placement functions, and checks the GPU UVs against it; it compares painted-pixel centroids, not authored numbers. Moving one anchor 3 px turns it red (Falsification). On the real three.js meshes in the browser: worst 0.022 css px after, 28.42 css px on main |
| 3 | drawn muzzle vs sim spawn within 1 screen px at FAR | **met** | gate: worst 0.104 desktop-FAR px. Live: worst 0.157 css px after, 2.61 css px on main. Sim untouched |
| 4 | climb/ladder holds or stows the weapon deliberately | **met: one-handed hold** | the painted near hand stays on the rung and the far arm holds the weapon at the sim socket. Climb rows, live: fist-grip ≤ 0.008 css px, arm stretch 1.000 |
| 5 | phone capture 844x390 DPR 2, RIG firing in four directions | **met** | `evidence/phone-firing-after-{1x,4x}.png`: real loop, real background, game paused on the frame each shot was simulated. Right, up-right, up, left: every shot travels along the staged aim (checked). Fist→grip 0.007–0.010 css px. The muzzle sits 0.011–0.050 css px from the spawn shifted back by the 0.095-tile recoil kick, and 0.83–0.87 css px from the unshifted spawn, which is the kick itself |
| 6 | pathcheck green; smoke scripts complete | **met** | At 6708326, with main merged in by the integrator (11ff74e) and `~/.hullbreaker-host.env` loaded: **`pathcheck: 4011 passed, 0 failed`** (4007 at 11ff74e, plus d78's 4). The 4 browser-probe assertions are skipped on this GPU-less host and not counted. Smoke at the fixed head: mid-route PASS (tick 594/594) and transform-slice PASS (victory at tick 938/1104), first attempt each, with the final states identical to the playtest's. Earlier cycle: before the merge, all three full runs gave 4006/4010, and the 4 failures were the probe timing out on its 45 s page load; run directly, that probe passed all four of its assertions |

## Root causes (measured on main 98b12c9 with the same live tool)

1. **Painted hands and the firing socket never met.** The sim fires from a
   hand socket at `(0, CONFIG.player.muzzleY = 1.05)`, which is RIG's hip,
   along a fixed 0.82-tile barrel. The renderer correctly hangs the weapon
   there. But every painted RIG frame holds its fists at chest or shoulder
   height: pumping run arms, a boxer's guard in the aim stances, both hands on
   rungs while climbing. Nothing connected the two, so the drawn grip sat
   **3.0–28.4 css px (mean 12.4) from the nearest painted fist** at desktop
   FAR, across all 1040 cells. The worst row is standing and aiming up (28.4 px).
   Re-anchoring a frame cannot fix this: the hands are 0.5–0.6 tiles above
   the socket, and lowering them that far sinks the boots through the deck.
2. **Weapon art anchors were never measured.** `RIG_WEAPON_ART.muzzleY`
   (82/103/82/95/95) sat on the bottom edge of the muzzle brake, not on the
   face middle (measured 59/80.5/71/87/82). There was no grip anchor at all.
3. **Weapon depth parallax.** The weapon was drawn at z=0.25 in front of RIG's
   plane, but projectiles render on RIG's surface depth. That costs about 3 px
   once RIG is 30 tiles off the view axis. Causes 2 and 3 together put the
   drawn muzzle **0.43–2.61 css px (mean 1.31) off the spawn** on main. The
   scatter is worst (2.6 px).
4. **Two stances cannot hold a hip-level weapon. These are the frames that
   are unfixable without new art:** `aim/up-right` (cell 1) and `aim/up`
   (cell 2) of `rig-slender-aim-atlas-v2`. Both paint the arms raised across
   the helmet and chest. Once those arms are removed there is no painted face
   or chest behind them, and erasing or cloning cannot invent one. They are
   kept untouched in the atlas and retired from selection. Every stationary
   aim now uses the level stance (`aim-right`) or the braced crouch
   (`aim-down-right`). Every other frame is fixed by erasing and re-posing.
5. **Why every RIG check stayed green while the guns floated.** None of them
   measured a hand. See "Legacy checks that were GREEN while guns floated".

## What changed and why

**Art (fence: `assets/generated/sprites/rig-*`, rebuilt by `tools/assets/`).**
`tools/assets/rig-arm-surgery.mjs` (new) is the last pass of
`tools/assets/repack-rig-slender.mjs`. It only erases pixels or copies them
1:1: no generated pixels, no resampling, no codex. Per pose it:

- erases the painted arm parts that stick out past the torso (polygons listed
  per pose);
- patches the one place where a painted upper arm crossed the chest
  (`aim/right`) with a 1:1 clone of that painting's own abdomen plates;
- copies RIG's near arm from the `aim/right` painting, where it is straight
  and fully visible, into the body atlas's unused cell 6 as two strips:
  upper arm, and forearm + closed fist.

The repack refuses any surgery that splits a silhouette into two pieces, and
it rebuilds all three atlases byte-for-byte (Verification).

**`assets/manifest.json` (one step outside the listed fence; please judge).**
I touched only the three RIG atlas entries:

- the body atlas's recorded `palette.roles` loses `hot-magenta`. Erasing the
  arms took that role below the gate's 0.5% recording mass, and this field is
  derived: it is exactly what `tools/assets/check.mjs --write` would write for
  that entry;
- one T-103 sentence is appended to each entry's `notes`.

Without this, `tools/assets/check.mjs` reports "manifest records roles
[…hot-magenta…], recomputed […]" for the body atlas. Verification has the
before/after palette numbers.

**`src/pure/rig.js`** (render-only data and arithmetic; nothing in `src/sim/`
reads it):

- re-measured weapon anchors: `muzzleY` (face middle), `gripBox`/`grip` (alpha
  centroid of the painted pistol grip), `support` (under the fore-end);
- `RIG_GUN_FAMILY_HEIGHT_GAIN`, moved here from player.js because the grip a
  fist holds moves with it;
- the arm-strip table, per-frame painted shoulder pivots (`RIG_ARM_RIGS`), the
  stance table and `rigStationaryAimFrame()`, `RIG_CLIMB_BODY_DROP` (0.3 tiles,
  render-only), draw depths, and procedural-fallback grips;
- pure functions `rigWeaponPlacement`, `rigPlaceWeaponPoint`,
  `rigWeaponLocalPoint`, `rigBodyPoint`, `rigBodyFrameSpec`, `solveRigArm`
  (two-bone), `rigArmSegmentCorners`, `rigArmSegmentUvs` and `rigArmPose`.
  They write into caller scratch objects and use a cached frame table, so the
  hot path allocates nothing.

**`src/render/player.js`:**

- the weapon is placed by `rigWeaponPlacement()`, the same numbers the arm
  solve and the gate use;
- two arm meshes from one new construction site: 8 dynamic vertices each, and
  one material sharing the body-atlas texture. The near arm draws over the
  weapon; the far arm (support hand, or the gun hand on ladders) draws between
  body and weapon;
- the weapon draws at z=0.02 instead of 0.25, removing root cause 3's
  parallax. Depths are reordered so the gun hand is never depth-rejected
  behind an accent plate;
- the climb plane is drawn 0.3 tiles lower, and the stance table is shared
  with the gate;
- the snapshot gains a `hands` block for telemetry.

Budget: 5 → 6 construction sites, 10 → 12 resident meshes, 6 → 8 maximum
visible draws.

**Gate and tools (new):**

- `tools/rig-grip/raster.mjs`: a software compositor that runs the same
  placement functions as player.js;
- `check.mjs`: the gate;
- `capture.mjs`: live browser capture and measurement;
- `compose.mjs`: the before/after sheets;
- `preview.mjs`: offline sheets;
- `README.md`, which includes an honesty/limitations section;
- `tools/pathcheck/t-103-rig-grip-alignment.mjs`, 21 assertions, registered as
  d77.

## Verification (every command run, with its result)

This table is the first cycle's record (head b5b2ffe, before the playtest).
The fix cycle's results are in "Fix cycle 1" above.

All commands were run from the worktree unless a path says otherwise. The host
is a 4-core container with no GPU (SwiftShader), shared with three or four
other lanes; load average was 25–55 throughout.

| # | command | result |
|---|---|---|
| 1 | `HB_PROBE_BOOT_MS=180000 HB_PROBE_SPAWN_MS=300000 node tools/pathcheck.mjs` (at 7096cb0; src identical to HEAD) | **`pathcheck: 4006 passed, 4 failed`** in 2m06s. All 4 failures are the browser perf-probe domain (`render-submission-contract`): `page.goto: Timeout 45000ms exceeded` while booting the scene at load ~35, so the probe never ran. The other 4006, d77 included, pass. **Count: base 3989 (integrator, main 98b12c9) → 4010 on this branch** (+21 from d77; the legacy domains were edited in place and their counts are unchanged). I also ran the probe exactly as that domain spawns it (`node tools/playtest/perf-probe.mjs --seconds 2 --idle --draw-samples 1 --out <scratch>`, HB_PROBE_BOOT_MS=180000). Tries 1–4, at load 45–61, died at the probe's hard-coded 45 s `page.goto`. **Try 5, at load ~30, booted: exit 0, `materialViolations 0`, `instanceUploadKbPerFrame 0`, MSAA samples 0, `errors []`** (117.7 s to PLAYING). So all four of the domain's assertions hold on this branch whenever the scene can boot; the new transparent DoubleSide arm material is single-pass. Main has since made this domain skippable on GPU-less hosts (`HB_GATE_SKIP_BROWSER_PROBE=1`, 1a3a400) and given it a private output directory (e29665b). Two more full runs gave the same 4006/4 with the same `page.goto` timeout: b7a3a44 at load 36, and 6658940 at load 19 while a capture was also running. |
| 2 | T-103 domain alone: `node --input-type=module -e "const c=await import('./tools/pathcheck/_context.mjs');const m=await import('./tools/pathcheck/t-103-rig-grip-alignment.mjs');await m.run({});console.log(c.counts())"` | **21 passed, 0 failed** (7–15 s). Stats: 4840 combinations; worst fist→grip 0.0965 atlas px; worst muzzle→spawn 0.104 desktop-FAR px; worst gain-1 stretch x1.135; worst portrait stretch x1.608; analytic vs literal raster ≤ 0.3 atlas px over 144 samples |
| 3 | `git diff 98b12c9..HEAD -- src/sim src/config.js \| wc -l` | **0**: no simulation or config change |
| 4 | `node tools/player-presentation-check.mjs` | "RIG PRESENTATION PASS: 32 focused contracts" on this branch, and also on main (where the guns float) |
| 5 | `node tools/rig-slender-check.mjs` | exit 1 on **both** main and this branch, with the same two pre-existing emission-literal failures (proposed issue) |
| 6 | `node tools/assets/repack-rig-slender.mjs --out <scratch>`, then a PIL pixel compare and a JSON compare | all three atlases are **pixel-identical** and all three layouts are **identical** to the committed files: the art is reproducible from its sources plus `rig-arm-surgery.mjs` |
| 7 | `node tools/assets/check.mjs` (the full asset gate; 56 min on this host; run at 7096cb0, before the manifest fix) | FAIL, 3 problems. Two are not T-103's: `backdrop-meridian-anatomy-v1` is not power-of-two, and `meridian-detail-atlas-v1` has 1.249% alien hue mass. Both involve files and manifest entries that are byte-identical to main (`git diff 98b12c9..HEAD -- assets/` touches only the three RIG atlases, their layouts and prompts, and those three manifest entries), so they were already there. My run of the full gate on the main export was cut off at my one-hour job limit. The third was T-103's: the body atlas's recorded roles still listed `hot-magenta`. Fixed in d8ace29. Afterwards I re-ran the gate's own palette rule (`histogram` + `checkRasterColors`, 0.5% recording mass) on the three RIG atlases: all three **match** the manifest. On main the same rule matches as well. |
| 8 | smoke, per the coordinator: from `/home/user/hullbreaker/tools/playtest`, `HB_HARNESS_SLOWDOWN=40 node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8753 --out <worktree>/tools/playtest/runs/smoke-mid-route`, then `node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs <out>/report.json` | **mid-route: PASS** (`outcome=not-completed deaths=0 tick=594/594`) on the 4th run. The first three died in the harness before the game booted: `page.goto: Timeout 30000ms exceeded`, at load 30–34. Main has since scaled that timeout (8fd25fc). Direct load-time samples on this host took 6.3–42.1 s for the untouched main export and 7.2–37.5 s for this branch, so the timeouts are the host, not the build. |
| 9 | the same with `scripts/transform-slice.json` | **transform-slice: PASS** on attempt 3 (`outcome=completed deaths=0 tick=938/1104`). The slice reaches BREACH CLEAR at tick 938, and main's verdict counts a sampled victory as terminal since 8fd25fc. Attempt 1 also reached victory at tick 938 but was judged by the older verdict ("ledger status running; 52/58 events"). Attempt 2 hit the harness wall-clock cap at tick 818 (load ~50). **Control:** the same command on the untouched main 98b12c9 export, at the same time, hit the same cap at tick 807; T-102's lane and 8fd25fc record main reaching victory at the same tick, 938. |
| 10 | `node tools/rig-grip/capture.mjs …` (live; see "Contact sheets") | desktop 1040 + 20 crouch cells, phone 416, portrait 416 per tree, plus the firing and portrait re-shoots. **Zero page errors** in every capture behind the evidence. RIG is visible in every cell (main's first respawn row photographed the hidden blink phase and was re-shot) |


## Falsification performed

**The gate fails when one anchor moves.** Each mutation below was applied to
a `git archive HEAD` export in scratch, never to the worktree. The T-103
domain was then run from that export with its own `_context.mjs`, and the
export was restored byte-for-byte afterwards (`cmp` clean). The unmutated
control passed 21/21.

| mutation (one number in `src/pure/rig.js`) | d77 result | what it reported |
|---|---|---|
| A: fist anchor `RIG_ARM_SEGMENTS.fore.to` 1168.8 → 1171.8 (+3 atlas px) | 19 passed, 2 failed | "arm strip: fist anchor [1171.8,705.7] is 3.02 px from the painted fist centroid [1168.8, 705.7]"; "worst rendered fist-to-grip distance is 6.190 atlas px (bound 1; one atlas px = 0.00466 tiles = 0.084 desktop FAR px)" |
| B: rivet-gun grip `RIG_WEAPON_ART.R.grip` 76.2 → 79.2 (+3 px) | 19 passed, 2 failed | "R: grip anchor [79.2,136.9] is 2.97 px from the painted grip centroid [76.2,136.9]"; "worst rendered fist-to-grip distance is 1.958 atlas px" |
| C: rivet-gun `muzzleY` 59 → 82 (main's value) | 18 passed, 3 failed | "R: muzzleY 82 is not the painted muzzle-face middle 59"; "worst rendered muzzle-to-spawn distance is 1.660 screen px at desktop FAR (bound 1)"; fist-grip 10.42 atlas px |

In C the fist-grip failure is real, not noise. The shifted bore row moves the
grip, and on vertical aims with the weapon mirrored against the body
(flight/contact, aim down) the grip then lands 0.168 tiles from the shoulder.
That is inside the arm's fold radius |upper − fore| = 0.218, so no bend
reaches it. The gate reports any fist that does not land, whatever the cause.
The shipped anchors keep that distance at ≥ 0.253.

**Built-in binding proofs run on every pathcheck.** Six of d77's 21
assertions inject a fault and require the gate to report it:

- a solved hand 3 atlas px off its grip;
- a grip anchor 3 px off the painted grip;
- main's muzzle row 82;
- a fist anchor 3 px off the painted fist;
- a stretch bound tighter than the shipped arms;
- a grip box placed off the weapon (it finds no grip).

**The live instrument catches misalignment too.** The same
`tools/rig-grip/capture.mjs`, pointed at an export of main, measured
fist-to-grip at 3.0–28.4 css px and muzzle-to-spawn at 0.43–2.61 css px. On
this branch it measures 0.000–0.022 css px fist-to-grip and 0.003–0.157 css px muzzle-to-spawn (all 1040 cells; crouch row 0.017 / 0.12).

## Contact sheets and captures

Every sheet is made from **live renders of the shipped game**: the real
`index.html` booted in headless Chrome, paused, staged through the shipped
presentation hook (`view.player.sync`), and photographed. BEFORE is an export
of main 98b12c9. AFTER is this branch at the winding fix (6708326): every
AFTER half of the committed evidence was re-shot there in fix cycle 1.

Each pose row appears twice, BEFORE above AFTER. Columns are the 8 aim
directions x 2 facings. Rows are: stand (idle stance), run contact/pass/flight,
jump rise and fall, climb beats 0–3, wall cling, hit/i-frames (the visible
blink phase), and respawn drop. The game has no death pose, so the respawn
drop stands in for it. Each row header carries the live measurements; at 4x,
each cell does too.

Committed (`reports/tasks/T-103/evidence/`):

| file | what |
|---|---|
| `desktop-{R,S,L,H,F}-before-after-1x.png` | **every pose x aim x facing, one sheet per gun, TRUE desktop-FAR size** (1280x800 DPR 1) |
| `desktop-R-before-after-4x.png` | the rivet-gun sheet at 4x, by nearest neighbour |
| `desktop-crouch-RSLHF-before-after-{1x,4x}.png` | crouch row for all five guns in one sheet (`?crouch=1`, an A/B prototype that is off by default; the sim forces a level aim when crouched) |
| `phone-firing-after-{1x,4x}.png` | **phone 844x390, DPR 2**: RIG actually firing right / up-right / up / left, in situ (world visible), at true device size and 4x; each panel is a 12x8-tile window of the live viewport |
| `phone-firing-before-4x.png` | the same four shots on main 98b12c9, for comparison |
| `portrait-R-stand-before-after-1x.png` | portrait 390x844 DPR 2, standing, all 8 aims: the long-arm conflict (Known limits, question 5), whole figure at true size |
| `capture-summary.json` | live numbers per tree / view / row / gun (max/mean/min fist-grip, muzzle-spawn, arm stretch), plus the per-shot firing records |

Not committed (size), but present in the worktree's ignored
`tools/playtest/runs/T-103-sheets/` and regenerable with `compose.mjs`:

- `desktop-{S,L,H,F}-before-after-4x.png`;
- `phone-{R,F}-before-after-{1x,4x}.png` (844x390 DPR 2);
- `portrait-R-before-after-{1x,4x}.png` (390x844 DPR 2; stand, run-contact and climb-1 rows, both facings). The first full portrait matrix (R and F, every row) cropped RIG's helmet, so its sheets were dropped; its measurements are mesh-based, unaffected by the crop, and stay in `capture-summary.json`. The crop now scales with the portrait gain (8ce79c8);
- the per-gun crouch sheets;
- `firing-after/phone-firing-*-viewport.png` and `firing-before/…`: the full
  844x390 DPR 2 viewport for each shot, about 1.1 MB each.

The phone and portrait numbers are in `capture-summary.json` and in the table
below.

The S/L/H/F 4x sheets (about 1 MB each) were left out of the commit to keep
evidence under ~5 MB. Each is exactly the committed 1x sheet magnified 4x by
nearest neighbour (`compose.mjs … --scales 4`).

Live numbers (css px at the capture viewport):

| view / tree | cells | fist→grip max / mean | muzzle→spawn max / mean | arm stretch max |
|---|---|---|---|---|
| desktop FAR 1280x800 DPR 1, main 98b12c9 | 1040 | 28.42 / 12.35 | 2.614 / 1.306 | (painted arms) |
| desktop FAR 1280x800 DPR 1, task/T-103 @ 6708326 | 1040 | **0.022 / 0.009** | **0.157 / 0.057** | 1.102 (16 cells > 1.0) |
| desktop FAR crouch row (`?crouch=1`), main | 20 | 17.36 / 15.58 | 1.927 / 1.060 | (painted arms) |
| desktop FAR crouch row (`?crouch=1`), task/T-103 | 20 | **0.017 / 0.016** | **0.120 / 0.085** | 1.057 |
| phone 844x390 DPR 2 (R, F), main | 416 | 13.86 / 6.03 | 1.038 / 0.685 | (painted arms) |
| phone 844x390 DPR 2 (R, F), task/T-103 @ 6708326 | 416 | **0.010 / 0.005** | **0.077 / 0.028** | 1.102 |
| portrait 390x844 DPR 2 (R, F), main | 416 | 53.03 / 23.49 | 2.580 / 1.910 | (painted arms) |
| portrait 390x844 DPR 2 (R, F), task/T-103 (captured before the fix, src 213e935; geometry unchanged by it) | 416 | **0.018 / 0.007** | **0.137 / 0.050** | **1.579** (median 1.24; see Known limits) |
| phone firing, in situ, 844x390 DPR 2 (R: right, up-right, up, left), main | 4 shots | 8.94–14.73 (range) | 0.66–0.95 vs the recoil-shifted spawn (range) | (painted arms) |
| phone firing, in situ, 844x390 DPR 2 (R: right, up-right, up, left), task/T-103 | 4 shots | **0.007–0.010** | **0.011–0.050** vs the recoil-shifted spawn | 1.000 |

Phone numbers are css px; one css px is two device px at DPR 2.
`legacyAimArmAlignedTrue` in the summary is 100 of 1060 desktop cells on
**both** trees, so that flag cannot tell a held gun from a floating one.

Capture commands (scratch dirs; the BEFORE tree is a `git archive 98b12c9`
export):

```sh
node tools/rig-grip/capture.mjs --root <main export> --out <b> --views desktop --label "BEFORE ..."
node tools/rig-grip/capture.mjs --root <main export> --out <b-sup> --views desktop --rows stand,respawn --label "BEFORE ..."
node tools/rig-grip/capture.mjs --out <a> --views desktop --label "AFTER ..."
node tools/rig-grip/capture.mjs [--root <main export>] --out <c> --views desktop --crouch --rows crouch
node tools/rig-grip/capture.mjs [--root <main export>] --out <p> --views phone,portrait --guns RF
node tools/rig-grip/capture.mjs [--root <main export>] --out <f> --views phone --firing
node tools/rig-grip/capture.mjs [--root <main export>] --out <q> --views portrait --guns R --rows stand,run-contact,climb-1
node tools/rig-grip/compose.mjs --before <b>,<b-sup> --after <a> --out <dir> --guns RSLHF --scales 1,4
```

The `stand,respawn` re-shoot of main exists for two reasons. Its first respawn
row photographed the hidden blink phase (the capture now waits for a visible
phase, as the hit row already did). And the first BEFORE run predates the
capture recording the legacy `aimArmAligned` flag.

## Legacy assertions changed (decisions.md entry 21)

| file | assertion label (old → new) | why |
|---|---|---|
| `tools/pathcheck/gilded-chassis.mjs` | "…without growing past its five frozen construction sites" → "six" | T-103 adds one construction site (the two arm meshes) |
| `tools/pathcheck/t-040-rig-sprite.mjs` | "five fixed construction sites, ten resident meshes, and at most six visible draws" → "six / twelve / eight" | same two arm meshes, counted honestly |
| `tools/player-presentation-check.mjs` | "stationary attachment carries four authored elevation poses and mirrors left" → "stationary aim uses the level and braced-crouch stances (four cells retained) and mirrors left" | up/up-right stances retired (root cause 4) |
| `tools/player-presentation-check.mjs` | "all five families carry restrained fixed cross-section gains at shipped scale" | the regex on a player.js literal became a numeric check of `RIG_GUN_FAMILY_HEIGHT_GAIN` (the table moved to rig.js) |
| `tools/player-presentation-check.mjs` | "the weapon rotates on the simulation aim vector" | the regex `gunGroup.rotation.z = lastAimAngle` became `_gunPlacement.angle` plus a numeric check of the angle |
| `tools/player-presentation-check.mjs` | "one hand socket and one fixed barrel radius place the muzzle in all aim directions" | the source-spelling regex (`position.set(0, player.muzzleY, 0.25)`) became numeric pivot/offset checks; z=0.25 was the parallax bug |
| `tools/player-presentation-check.mjs` | "portrait RIG presentation is bounded and scales the weapon about its exact muzzle endpoint" | the regex on the offset expression became a numeric `offsetX` check |
| `tools/player-presentation-check.mjs` | "runtime snapshot exposes the fixed ten-mesh/six-draw…" → "twelve-mesh/eight-draw… (T-103 adds two arm meshes)" | the arm meshes |
| `tools/playtest/rig-presentation-capture.mjs` | its internal aim-frame expectations (`up`, `up-right`, `up-left` → `down-right`) | the retired stances; this is the legacy capture's own consistency throw, not a pathcheck assertion |
| `tools/pathcheck/t-103-rig-grip-alignment.mjs` (d77, T-103's own) | "the arm strips' GPU texture coordinates land on the same atlas corners…": its triangulation clause now reads `rigArmTriangleIndex(1)` (still `0,2,1,2,3,1,4,6,5,6,7,5`) instead of a `setIndex([…])` literal | fix cycle 1: the index is now chosen per facing; still 21 assertions, all green |

No assertion was deleted, and no bound was loosened.

## Legacy checks that were GREEN while guns floated (T-108 evidence)

All of these were re-run or read today against main 98b12c9 (a scratch
`git archive` export) and set beside the live measurement of the same tree.

- **`node tools/player-presentation-check.mjs`** printed "RIG PRESENTATION
  PASS: 32 focused contracts" on main. On the same tree the drawn grip sat
  3.0–28.4 css px from the nearest painted fist. Its contracts check source
  spellings and table shapes; none of them measures a hand. (It also passes
  32/32 on this branch, so it is not evidence either way.)
- **`__HB_RIG_VISUAL().aimArmAligned`** was `true` on 80 of 80 standing cells
  on main while those cells measured 6.8–28.4 css px (0.38–1.57 tiles)
  fist-to-grip. It is
  `shownBodyFrame === stationaryAimFrame(aim) && thatFrame.ready`. That means
  "the stance painting matches the aim sector", not "the hand holds the gun".
  `tools/playtest/rig-presentation-capture.mjs` asserts it.
- **`rig-presentation-capture.mjs` `maxMuzzleError`** compares
  `snapshot.muzzle.drawnX/Y`, built from the gun group's own transform plus
  the nominal barrel length, with `lastSimMuzzle`, built from the same
  inputs. It is 0 by construction, so its `> 1e-9` throw cannot fire. Over
  the same cells the painted muzzle was 0.43–2.61 css px off the spawn
  (wrong `muzzleY` rows plus z=0.25 parallax).
- **`tools/pathcheck/t-040-rig-sprite.mjs` and `gilded-chassis.mjs`** count
  meshes and draws; neither is about hands. The whole of pathcheck was green
  on main while the guns floated. I do not cite pathcheck's count as evidence
  that the art is right. The rendered-pixel gate (d77) and the live captures
  are that evidence.
- **`node tools/rig-slender-check.mjs` is RED on main and red on this
  branch**, with the same two failures: "body emission must remain zero
  outside explicit overdrive action" and "weapon emission must remain zero
  until firing/overdrive action". Both grep player.js for emission literals
  that changed before T-103. Nothing runs this script; see the proposed
  issue.

## Known limits and gaps (not hidden)

- **Portrait arms stretch.** Portrait gives RIG an actor visual gain of 1.5,
  and hand-on-grip, muzzle-on-spawn and boots-on-deck cannot all hold with
  natural arms. The weapon stays on the sim's hip-height bore and the body is
  drawn 1.5x, so the arms lengthen: gate worst x1.608 (asserted ceiling 1.75),
  live worst x1.58, median x1.24, with 291 of 416 portrait cells over x1.05 (R and F, 390x844 DPR 2). This is a conflict between a shipped readability
  choice and gameplay truth, so it is put to the operator as question 5 and a
  proposed issue, not resolved here.
- **Aiming straight up puts the weapon in front of the torso.** The sim spawn
  for aim up is 0.82 tiles above a 1.05-tile socket, which is helmet height.
  The drawn muzzle must sit there, so the receiver crosses the chest.
- **Stretch at landscape scale.** Gate worst x1.135 (Cindermouth, level
  stance with the body facing away from the aim, which is strafe/backpedal).
  42 of the reachable gain-1 combinations stretch at all. Live worst
  x1.102 in 2 of 1040 cells (Cindermouth, standing level aim with the body facing away from the aim). The normal forward Cindermouth stance is x1.070; 16 cells stretch at all.
- **Body pose vs weapon angle** (the integrator's "same defect class"). The
  arm is solved for every aim, so arm and weapon can no longer disagree. The
  torso still does not turn with the aim: run, jump and climb frames ignore
  it, as on main. A painted level guard under an up-aimed gun is gone,
  because the painted arms are gone.
- **One arm painting for every pose.** Both strips are cut from the
  `aim/right` painting, lit the way that painting is lit. At desktop FAR the
  arm is about 16 css px from shoulder pivot to fist centre (0.88 tiles,
  including the 1.25 reach gain).
- **Retired stances.** The `aim/up` and `aim/up-right` paintings are kept in
  the atlas but are no longer shown. Standing aim up / up-right / up-left now
  uses the braced crouch, which is a visible change from main (question 2).
  Down-aims already used it on main.
- **Ladder: one-handed by design.** The painted near hand stays on the rung.
  The climb plane is drawn 0.3 tiles lower than on main so the free arm
  reaches the hip socket. This is render-only; nothing on a ladder touches
  the boots.
- **Gunless `idle` frame.** It is shown only when the aim atlas fails to
  load. The gate covers it analytically, but it is not captured live.
- **Performance is not measured on real hardware.** This host renders with
  SwiftShader. The cost is 2 extra draws and 16 vertex positions (192 bytes)
  rewritten per frame, with no per-frame allocation (asserted in d77).
- **Captures isolate RIG.** World meshes are hidden; lights, materials, tone
  mapping and bloom stay as shipped. Only the firing captures are in-situ.
- **Not run end-to-end:** `tools/playtest/rig-presentation-capture.mjs`. I
  updated only its aim-frame expectations; it hard-codes `/private/tmp` and
  4–15 s timeouts.
- **Full asset gate.** It is red on main for two problems that are not T-103's
  (Verification #7). T-103's own drift, the body atlas roles, is fixed in
  d8ace29 and re-checked with the gate's rule.

## Integrator decisions (decision 1 now ruled; the rest still open)

1. **ON by default, no escape hatch: RULED by the integrator.** No
   `?hands=legacy` hatch, because T-103 fixes an operator-named defect; the old
   art is recoverable from git (98b12c9). (I had raised it against entry 22's
   A/B rule and entry 20's `?touch=legacy` precedent.)
2. **Retired stances.** Standing aim up / up-right / up-left now shows the
   braced crouch instead of main's raised-arm paintings (root cause 4).
   Keeping those paintings would need new art for the face and chest the
   raised arms hide. No image generator is on this host; entry 22's Blender
   pipeline would be the route.
3. **Manifest touch.** `assets/manifest.json` changed in three RIG entries
   only (see "What changed").

## Operator look questions (true size; I do not judge these)

Serve the branch with
`node tools/serve.mjs 8753 --root /home/user/hullbreaker/.claude/worktrees/T-103 --quiet`
and open **http://127.0.0.1:8753/index.html** (desktop, and a phone or
devtools at 844x390). Main on 8741 is the comparison. The stills are in
`evidence/`.

1. On a phone in landscape, firing in each direction (`evidence/phone-firing-*.png`,
   or live): what do you see RIG doing with the weapon?
2. Standing still and aiming up or diagonally, RIG now drops into the braced
   crouch; main showed the raised-arm paintings. How does the standing aim
   read to you?
3. On ladders RIG keeps one hand on the rung and holds the weapon in the
   other. How does the climb read?
4. Aiming straight up, the weapon sits in front of RIG's chest and helmet,
   because the shot leaves at helmet height. What do you notice there?
5. Holding the phone upright (portrait), RIG's arms are drawn longer than in
   landscape to reach the weapon. What do you notice?

## PROPOSED INBOX ISSUES

## I-??? | art | S2 | repro: open index.html in a portrait viewport (390x844; RIG's actor visual gain 1.5) and stand, run, jump or climb with any weapon | evidence: the weapon stays on the simulation's hip-height bore while the body is drawn 1.5x, so T-103's arms stretch to keep the hands on the grip: gate maxStretchPortrait 1.608 (asserted ceiling 1.75), live portrait cells worst x1.58, median x1.24, with 291 of 416 portrait cells over x1.05 (R and F, 390x844 DPR 2) (reports/tasks/T-103/build.md "Known limits"; evidence/portrait-R-stand-before-after-1x.png; evidence/capture-summary.json). On main the portrait gun floated even further from the painted fists. This needs an operator call: accept the long arms, drop RIG's portrait gain, or scale the sim muzzle with the gain (that last one is a sim change).

## I-??? | bug | S3 | repro: on main 98b12c9 stand still aiming up with any weapon, then read `__HB_RIG_VISUAL().aimArmAligned`, run tools/playtest/rig-presentation-capture.mjs (maxMuzzleError), and run tools/player-presentation-check.mjs | evidence: aimArmAligned was true on 80/80 standing cells while the live fist-to-grip gap was 6.8–28.4 css px; maxMuzzleError compares the gun group's transform with itself (always 0) while the painted muzzle sat 0.43–2.61 css px off the spawn; player-presentation-check passed 32/32. rig-presentation-capture also hard-codes `/private/tmp` and 4–15 s timeouts. Retire these as alignment evidence or re-point them at tools/rig-grip (T-108's audit lane).

## I-??? | bug | S3 | repro: `node tools/rig-slender-check.mjs` on main 98b12c9 and on task/T-103 | evidence: exits 1 on both with "body emission must remain zero outside explicit overdrive action" and "weapon emission must remain zero until firing/overdrive action". Both are source-literal greps for emission expressions that changed before T-103, and no gate runs the script. Update the literals or retire the script.

## I-??? | docs | S3 | repro: two lanes give a scratch directory the same generic name inside the shared session scratchpad (`…/scratchpad/base`) | evidence: T-103's main export at `scratchpad/base` was replaced mid-run (2026-10-23 00:36) by another lane's `src/` + `tools/simlab/` extract. The next capture booted from it, got 404s, and never reached PLAYING. Every capture that went into evidence ran before the overwrite or was re-shot from a fresh export (`scratchpad/t103-base-98b12c9`). LANE-BRIEF could tell lanes to prefix scratch paths with their task id.

Fixed in fix cycle 1, so not re-filed from the playtest:

- the left-facing back-face arms (6708326 plus d78);
- `tools/rig-grip/check.mjs` doing nothing when run directly (it now has a CLI).

The playtest's 4x-sheets item is answered by the regeneration note in "Fix
cycle 1".

Not re-filed, because main fixed them after 98b12c9 while this lane ran (I hit both):

- the browser perf probe certifying a shared, stale `result.json` after its own boot failed (fixed in e29665b);
- the harness `page.goto` not scaling with `HB_HARNESS_SLOWDOWN`, together with a sampled transform-slice victory failing the smoke verdict (fixed in 8fd25fc).


## Worktree, branch, next action

- Worktree `/home/user/hullbreaker/.claude/worktrees/T-103`, branch
  `task/T-103`. Fix cycle 1 is committed on top of the integrator's merge
  11ff74e; the tree is clean after the final commit. Not merged.
- Ports used: 8753 (this worktree) and 8763 (the main export, for the timing
  and smoke controls), both through `tools/serve.mjs`. In fix cycle 1, 8753
  served the smoke runs again; it is stopped now, as is 8763. The capture
  tools use the repo's `withIsolatedBrowser` helper, which binds an
  OS-assigned ephemeral port. 8741/8742 were never touched.
- **Single best next action:** re-gate T-103 at the new head. The reviewer
  should look at the fix-cycle delta: `src/pure/rig.js`
  `rigArmTriangleIndex`, `src/render/player.js` `writeArm` and the FrontSide
  material, the new d78 domain, the `check.mjs` CLI and `symmetry.mjs`. The
  playtester should re-run section 7 (my run: criterion 1 exit 0 at mean
  1.0002, criterion 2 at 1.012). Then queue the look questions; the portrait
  answer is the one that could reopen this lane.
