PASS

# T-121 playtest gate: codebase cleanup, batches 1-4

Lane `task/T-121` at **f3fa49a** (the reviewed a30030f plus a clean merge of main af8bb0b, incl. T-103), tested against
main **af8bb0b**. Claim under test (decisions.md entry 24's rule): nothing a player sees or the simulation computes
changed, except that `?zip=1` / `?g1=0` are now inert (entry 25).

**Verdict: PASS.** Across 3 deterministic runs (traversal, transform, default six-face with fire and kills) the lane
and main agree on every sampled tick and on the final state; every art- and bloom-matched frame pair is pixel-identical
(0 changed pixels, 8 pairs, 3 viewport sizes, plus corner-ritual frames for corners 1, 2 and 4); 0 page errors,
0 console errors, 0 non-200 responses and 0 requests for the 3 removed assets in 27 browser sessions; the retired flags
are inert on the lane and live on main; `?selftest=1` passes. Where a pair is not pixel-comparable it is listed with
the reason below and carries no weight. No defect found in the lane. Nothing here is a feel judgement. Not covered by this
gate (see Limits): the bloom-on frame (bloom never booted on this host), audio, an organically played corner, and the
node-only race lab / pathcheck / bundle checks the reviewer and integrator own.

Smoke re-judge (what the integrator's `--skip-smoke` condition asks for): both scripts ran against the f3fa49a export and
`smoke-verdict.mjs` says PASS for each: `mid-route.json` PASS, `transform-slice.json` PASS (main, af8bb0b, PASS alike).

## What was served (the tree is pinned, not a moving worktree)

| | lane | main reference |
|---|---|---|
| source | `git -C /home/user/hullbreaker/.claude/worktrees/T-121 archive f3fa49a` | `git -C /home/user/hullbreaker archive af8bb0b` |
| export | `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121-gate/exports/lane-f3fa49a` | `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121-gate/exports/main-af8bb0b` |
| server | `node /home/user/hullbreaker/tools/serve.mjs 8791 --root <export> --keep-orphan` | same, port 8792 |
| proof of pin | all 481 files under `index.html`, `src/`, `assets/` hash (git blob) equal to commit f3fa49a | all 484 equal to commit af8bb0b |

Tree delta lane vs main, from the exports and from `git diff`: exactly 12 `src/` files (`mode.js`, `pure/enemy-ecology.js`,
`pure/pressure.js`, `render/{atmosphere,contact,fx,juice,legibility,level,limb,materials,preload}.js`), the three
removed PNGs, and `index.html` byte-identical. The +/- lines of those 12 files are identical to the reviewed
e5ce7d4 to a30030f delta, so the merge of main did not change what was reviewed. The lane worktree and the main checkout
were not modified by this gate (`git status` clean in both before this report was written; this file is the only new
path).

Host: GPU-less, 4 cores, load average 30 to 100 for the whole gate, `HB_HARNESS_SLOWDOWN=100`, `HB_SMOKE_VIEWPORT=480x300`
(`. ~/.hullbreaker-host.env`). Evidence root below is `R` =
`/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121-gate/r2`. The stopped a30030f
session's files were moved to `.../t121-gate/stale-a30030f/` and are NOT evidence for this head; its `main-ref` export was
deleted as asked. When the gate finished I stopped both servers and deleted my two exports (885 MB, shared disk); they
are recreated by the two `git archive` commands above, and the per-file hash lists that pinned them are kept in `R`.

## 1. Smoke set (harness from MAIN, lane on :8791, main on :8792, `--deterministic --viewport 480x300`)

Commands (cwd `/home/user/hullbreaker/tools/playtest`, `. ~/.hullbreaker-host.env` first):

```
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8791 --out $R/smoke/lane-mid
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8792 --out $R/smoke/main-mid
node run.mjs scripts/transform-slice.json --deterministic --viewport 480x300 --max-runtime-ms 20000 --base-url http://127.0.0.1:8791 --out $R/smoke/lane-transform   (and :8792 -> main-transform)
node run.mjs $R/scripts/sixface-static.json --deterministic --viewport 480x300 --max-runtime-ms 30000 --base-url http://127.0.0.1:8791 --out $R/smoke/lane-sixface   (and :8792)
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs $R/smoke/<run>/report.json
node $R/bin/cmp-runs.mjs $R/smoke/lane-<x>/report.json $R/smoke/main-<x>/report.json lane main
```

(`mid-route` ran with the default `--max-runtime-ms`, not merge-task's 15000; under `HB_HARNESS_SLOWDOWN=100` that cap is
never reached and both stopped on `script-window`. My log lines end `head=af8bb0b`: that is the main checkout's HEAD, not
the lane's; the lane runs hit the f3fa49a export on :8791.)

| run | smoke-verdict | final x | y | hp | kills | gameMs | scrollX | tick | wall (harness) |
|---|---|---|---|---|---|---|---|---|---|
| lane mid-route | PASS (not-completed, deaths 0) | 55.649 | 1 | 2 | 0 | 9900.198000000022 | 56.2042574319988 | 594/594 | 249 s |
| main mid-route | PASS | 55.649 | 1 | 2 | 0 | 9900.198000000022 | 56.2042574319988 | 594/594 | 238 s |
| lane transform-slice | PASS (completed, VICTORY, deaths 0) | 146.0873654000007 | 10.444311638728403 | 3 | 0 | 15633.645999999837 | 130.28069560000068 | 938 (stop 1104) | 761 s |
| main transform-slice | PASS | 146.0873654000007 | 10.444311638728403 | 3 | 0 | 15633.645999999837 | 130.28069560000068 | 938 (stop 1104) | 726 s |
| lane six-face static (default URL, fire; score counts airborne 3, launch 1, ground 1) | PASS (tick 1494/1494) | 112.25 | 3 | 2 | n/a on this channel | 24900.498000000465 | 98 | 1494/1494 | 2092 s |
| main six-face static | PASS | 112.25 | 3 | 2 | same score counts | 24900.498000000465 | 98 | 1494/1494 | 1169 s |

Lane equals main on x, y, hp, kills, gameMs, scrollX, tick in every row (the mid-route numbers also equal the builder's
recorded fingerprint, so the T-101/T-102/T-103 merges did not move it). `cmp-runs.mjs` also compared every tick both
traces sampled: mid-route 563 shared ticks, transform 914, six-face 1479, **0 differing ticks** over the full sim
vocabulary (position, velocity, scroll, lives, hostiles, capsules, score, transform, pace). Final-state hash and
frame-input ledger hash are equal in all three (mid `c1b25f642f6b5e53` / `af91377183458396`; transform
`1617dca579d27d51` / `9314c98e30da2008`; six-face `27fefc8da4a56b0e` / `72fa6121e5f4073c`). Tick-weighted A.5 metrics are
identical lane vs main (idle / air fraction / minEdgeMargin): mid 0.3321 / 0.5258 / 26.533, transform 0 / 0.8587 /
30.0668, six-face 0.0433 / 0.7972 / 33.5088. The harness's own wall-weighted idle fraction differed slightly (mid 0.322
vs 0.329) because sampling is wall-clock polled on a loaded host (README limitation 4); the sim is identical.
Errors: all six reports have `bootError null`, `pageErrors 0`, `consoleErrors 0`, `teardownErrors 0`. The mid-route and
transform end-of-run screenshots are byte-identical lane vs main (sha256 `0050da14...` and `b2a290fd...`).

## 2. Default URL, boots and request ledger (`$R/bin/probe.mjs --mode plain`)

`/index.html` with no query, left the way a player leaves the title (Enter on desktop, a tap on phone), 6 s of play after.

| session | MENU to PLAYING | page errors | console errors | unique same-origin paths | non-200 | removed assets requested |
|---|---|---|---|---|---|---|
| lane 1280x720 | yes | 0 | 0 | 196 (160 modules, 35 assets) | 0 | 0 |
| main 1280x720 | yes | 0 | 0 | 196 | 0 | 0 |
| lane 844x390 touch | yes | 0 | 0 | 196 | 0 | 0 |
| main 844x390 touch | yes | 0 | 0 | 196 | 0 | 0 |

The request sets are equal lane vs main (`onlyA=[] onlyB=[]`; 35 asset files, 15,039,025 bytes both). Over all 27 completed
probe sessions (16 lane, 11 main, boots, frames, selftest): 5,695 responses, 5,398 same-origin, **0 non-200, 0 4xx/5xx,
0 failed requests, 0 requests for `backdrop-meridian-coils-v2`, `sprite-atlas-action-v2`, `sprite-atlas-production-v2`,
0 page errors, 0 console errors**. Independent server-side ledger for the whole gate, including the 20 boot-only boots
(`$R/serve-8791.log`, `$R/serve-8792.log`): lane 7,196 requests = 7,195 x 200 plus one 404; main 5,994 x 200. The single
404 is my own `curl` pin check (line 8 of the lane log, before the first browser request); the same curl returned 200 on
main (line 7 of its log). Those two lines are the only lines in either log that name a removed asset.
The removed-asset names
exist nowhere in the lane tree outside two documents that describe their removal (`reports/tasks/T-121/build.md`,
`docs/proposals/2026-10-cleanup.md`); a partial-name grep over `src/` and `index.html` finds only the surviving
`backdrop-meridian-coils-v3`, and a grep for path concatenation around those names finds nothing. Console warnings are the same categories on both trees (4 link-preload credential-mode, 4
preload-unused, 4 GL-driver "GPU stall"); the one boot that also logged 38 "HULLBREAKER art: ... still loading" lines
is the designed degraded-art path, discussed under "Art-budget boots" below.

## 3. Fixed-tick frame, lane vs main (`?testapi=1&fixeddt=16.667`, empty frame-input schedule, sim frozen on tick 60)

Comparator `$R/bin/cmp-frame2.mjs` (JSON in `$R/cmp/`): errors, request sets, all 32 non-presentation keys of
`HB.snapshot()`, the `testapi` snapshot, `HB.g1`, world-dressing stats, the bridge wiring of all 38 slots, then pixels
only if the preload-gate art state and the bloom boot status match.

Pixel-comparable pairs (art 33/33 ready on both, bloom `failed` on both, i.e. direct rendering). All: sim snapshot
identical, testapi identical, wiring identical in 38/38 slots, request sets identical, 0 errors.

| pair | viewport / tick | changed pixels |
|---|---|---|
| lane vs main default (clock-dilated boot, see limits) | 844x390 touch, tick 60 | **0 / 329,160** |
| lane default (2nd boot) vs main default | 1280x720, tick 60 | **0 / 921,600** |
| lane vs main, default six-face URL, static script replayed to tick 450 (7.5 s, 4 kills, 3 live hostiles, weapon S) | 480x300, tick 450 | **0 / 144,000** |
| lane `?zip=1` vs main default | 844x390 touch, tick 60 | 0 / 329,160 |
| lane `?g1=0` vs main default | 844x390 touch, tick 60 | 0 / 329,160 |
| lane `?zip=1` vs lane `?g1=0` | 844x390 touch, tick 60 | 0 / 329,160 |
| lane `?zip=1&g1=0` vs lane default, and vs main default (dilated) | 844x390 touch, tick 60 | 0 / 329,160 (both) |
| smoke end-of-run screenshots, mid-route and transform | 480x300 | byte-identical |

The only `HB.snapshot()` leaves that differ in any matched pair are wall-clock telemetry: `actionVfx.art.{preloadMs,gateMs}`,
`perf.{fps,avgMs,worstMs}`, `post.boot.{costMs,programWarmMs}`. Bridge slot chains at `level.zipperColumn`,
`level.faceRevealed` and `corner.finished` are `[fn:zipperColumn]`, `[juice, fn:faceRevealed]`, `[fn:cornerFinished]`:
the do-nothing owners the builder kept so audio's corner boom stays silent are in place and wiring equals main.

Corner-ritual frames (`$R/bin/turn-pose-capture-qa2.mjs`, which is T-102's `turn-pose-capture.mjs` with the sim frozen on
an exact tick instead of `KeyP` at a wall-clock gameMs; poses file reused from the stopped session, made with
`turnlab poses --viewport phoneLandscape`, and cross-checked by the tool itself: it records an error if the page's camera
yaw or facet disagrees with the replica's for any pose, and there was none; each pose goes through `finishCorner` /
`updateZipper`, i.e. through the two hooks batch 4 emptied; `errors none` in all eight sidecars):

| capture | frames | result |
|---|---|---|
| corner 1, labels approach, t350, t680, t700, done, after1500, default URL, four sessions (lane1, lane2, main1, main2) | 6 per session | all 24 frames pixel-identical to each other: lane-vs-lane 0, main-vs-main 0 (noise floor 0), all four lane-vs-main cross pairings 0 |
| corners 2 and 4, labels approach, t350, t680, done, `bloom=0` on both (lane4, main4) | 8 | all 8 pixel-identical, page-side fold/limb/route snapshots equal |
| corners 2 and 4, default URL (lane3, main3) | 8 | pixels differ (maxDelta 55-112) but bloom status was `failed` on the lane and `active` on main in that boot: not comparable, replaced by the `bloom=0` pair above; page snapshots were equal in all 8 |

This closes the question the stopped a30030f session left open (corner frames that differed with equal page snapshots):
with the sim frozen on an exact tick and the boot states matched, the corner frames are identical.

## 4. `?zip=1` and `?g1=0` on the lane

- Frame mode (tick 60, phone and desktop) and plain mode (title to PLAYING, phone): both flags boot with 0 page and 0
  console errors, same 196 request paths as the default.
- Behave like the default: `HB.g1.pieces` is 1640 (the static-anatomy limb is baked) and world-dressing stats equal the
  default's; the 32 sim snapshot keys are identical to the lane default; with matched art the frame is pixel-identical
  to the lane default and to main's default (table above).
- Positive control, so the inertness is not a probe blind spot: on **main**, `?zip=1&g1=0` gives `HB.g1 = null` (limb not
  baked), different world stats and different draw calls, and 320,949 of 329,160 pixels differ from main's default
  (the legacy orange-brick grey-box tower, `$R/probe/d-main-zipg1-844/frame-a.png`), while the 32 sim keys stay identical
  (render-only, as the g1-1 domain asserts). On the lane the same URL renders the default. That is entry 25's intended
  change and the only behaviour difference found.
- No code in `src/` reads the `zip` or `g1` query keys any more (grep over the lane export); remaining mentions are
  comments.

## 5. `?selftest=1` at 1280x720

Lane: document title **`SELFTEST PASS (39 checks)`**, 0 page errors, 0 console errors. Main: identical title. Evidence:
`$R/probe/lane-selftest/probe.json`, `$R/probe/lane-selftest/selftest.png`.

## 6. Deleted artifacts: reference spot-check (not a fail criterion)

244 files under `artifacts/` are deleted vs main (the sum of their blob sizes is exactly the 36,983,185 bytes the index
claims; 18 top-level entries; plus the 3 PNGs, 5,724,415 bytes). Five spot-checked (`$R/spot5.txt`), each recoverable with
`git show e5ce7d4:<path>`:

| file | references in the lane tree outside the archive index |
|---|---|
| `artifacts/cp3-transform-v2/00-boot-exterior-face-A.png` | none (path or basename) |
| `artifacts/lightrig/after/bright-3000ms.png` | none |
| `artifacts/review-legibility/frames-montage.png` | none |
| `artifacts/sprites-v1/bodies.json` | none by path; the name `bodies.json` appears only as an output filename in `tools/playtest/sprite-capture.mjs:236` |
| `artifacts/t011-juice/07-stress-perf.json` | `docs/DESIGN.md:614` (already rewritten to say removed, with the recovery command), `reports/tasks/T-011/{playtest,review}.md` (historical citations) |

Extent, confirming the reviewer: references by path to a removed folder in kept files are exactly (a) 13 gate reports
(T-008, T-011, T-030, T-032, T-035, T-038, T-044, T-045, T-047, T-048, T-049, T-050, T-056), (b) two repointed live docs
(`docs/DESIGN.md`, `docs/WASP-MODULAR-MOTION.md`), (c) two `src/` comments (`config.js:1412`, `render/hostiles.js:1189`) and
one assertion label (`tools/pathcheck/t-047-light-rig.mjs:302`), (d) capture-script output paths. No live doc relies on a
deleted file as current evidence; the two artifact folders `decisions.md` cites (`cp3-transform`, `look-v1`) are kept; all
regenerating scripts the index names exist. One inaccuracy: the index row for `cp3-transform-v2` says "cited by nothing"
but `reports/tasks/T-030/build.md` (the "Seven more artifact directories" finding) names it (S3, below).

## Judgement

(a) **Metrics.** The task states one bound, equality. Sim state, per-tick traces, tick-weighted A.5 metrics and both
hashes are equal lane vs main; `HB.snapshot()` sim keys are equal at tick 60 and tick 450. No trend to read: there is
no difference.

(b) **Errors.** Every `report.json` has `bootError null` and empty `pageErrors`, `consoleErrors`, `teardownErrors`. All
27 completed probe sessions and all 8 pose sessions (`errors: []` in each sidecar): 0 page errors, 0 console errors; the
failsafe panel never showed in any probe session. Three of the 27 recorded `fatal` for harness or host reasons, none for a
game error: two 844x390 action-frame runs exceeded the 25-minute wait because the sim ran at about 0.3 tick/s under load
(re-run at 480x300 per the retry rule, which matched), and one retry that I stopped myself. They carried 0 page and 0
console errors. Three more retry sessions I stopped before they wrote a result.

(c) **Screenshots, looked at** (smoke finals for the traversal, transform and six-face runs, plain boots at both
viewports (the main 844x390 one is byte-identical to the lane's), selftest, frame pairs, corner frames from corners 1, 2
and 4, the action frame zoomed 3x and 8x, the main control frame): no glitch, blank or black frame, wrong
colour, z-fight or missing geometry that main does not also have; HUD, wave banner, touch controls, hull, backdrop and
platforms read normally; in the corner frames the anatomy is static and the camera orbits it, nothing assembles (entry 3
holds), and the flat clear-colour void at the screen edge near corners is the already-filed I-102, identical on main.
Style versus the concept boards is not in question for a change whose frames equal main's pixel for pixel. One readability
note, not a finding against this lane: in the 480x300 action frame RIG (airborne, about 12 px tall) is a dark figure on
dark hull and took me a zoom to find; the frame is identical on main and 480x300 is the harness's smallest viewport.

## Art-budget boots, and why some pairs carry no weight

The boot's preload gate (2.5 s desktop, 6.5 s touch) closes on whatever has loaded, by design (entry 16). On this host
a fixed tail of 19-20 assets (hull panel tile, weld seam, hound/carrier/wasp/polyp/mortar sprites, actor and VFX atlases,
crown kit, mutation atlas) missed it in a share of boots, which renders the documented fallback (flat hull, primitive
pickups). It happened to **both** trees. My first uncontrolled sessions made it look lane-specific (undilated 1280x720
boots: 7 of 9 lane vs 1 of 7 main), so I ran a controlled boot-only test (`$R/bin/boot-art.mjs`, 10 stages, one lane and
one main boot at the same time, launch order alternating, `$R/bootart/`): **lane 6 of 10 boots with the tail missing,
main 4 of 10, one fixed set of assets every time** (union 20, 19 in every tail). Server latency per request is also
equal on the two servers (p50 1-2 ms, p90 12-29 ms) and the gate cost measured in matched dilated boots is not higher
on the lane. I read the skew in the first batch as sampling noise; I found no mechanism for it in the diff (the lane
removes dead exports and write-only locals and changes no module order). A lane boot with art missing and a main boot
with art present differ in 40-50 % of pixels by construction; such pairs, and any pair where the bloom boot status
differed, are marked inconclusive and were re-run, never counted as evidence:

| pair | why excluded |
|---|---|
| lane vs main default, 844x390 and 1280x720 (first undilated boots) | lane 13 ready / 20 timeout, main 33 ready; bridge wiring then also differs, in exactly the two slots (`bullets.hostileImpact`, `stateScreen`) that `src/render/action-vfx-runtime.js` wraps only when its atlas is ready (reviewer finding 7) |
| lane `?zip=1&g1=0` desktop; lane default (first phone boot) vs the others; swap-order desktop pair | same 20-asset tail on one side |
| lane vs main default, desktop, clock-dilated | art 33/33 on both but bloom `failed` on the lane and `active` on main |
| main `?zip=1&g1=0` vs main default | the control: differs for the flag's own reason (see section 4) |
| six-face static end-of-run screenshots (480x300, `run.mjs` does not record the boot state) | 52 % of pixels differ with mean channel delta 0.64, max 58, consistent with a boot-state difference; sim identical on 1479 ticks; replaced by the matched action frame above |

## Limits of this evidence (read before leaning on it)

- **Bloom.** The post-processing pass never booted on the lane in any of my sessions (`post.status` `failed`,
  "not ready inside the 1200ms boot budget; direct rendering retained"): 20 of 22 frame/pose sessions `failed`, 2 `active`
  (both on main), 2 off by flag, and all 20 boot-only boots `failed`. So no matched pair shows the bloom-on frame, which
  is the shipped look on a real GPU.
  T-121 touches no post-processing file (`src/render/post.js` is unchanged), but this gate does not prove bloom-on
  identity. The operator's GPU is the only place that is checked.
- **Clock dilation is a harness technique, not a game change.** In four of the pairs (and all `--dilate 30` pose runs)
  `performance.now()` runs at 1/30 speed from before page scripts, identically for whichever tree is served, so the art
  gate and boot budgets are reachable on this overloaded host (`$R/bin/probe2.mjs`, `turn-pose-capture-qa2.mjs`). A
  clock-dilated lane frame is pixel-identical to the same tree's undilated, art-matched frame at both viewports
  (`$R/cmp/lane-dilated-vs-undilated-1280.json`, `$R/cmp/lane-dilated-vs-zip1undilated-844.json`), so the technique does not
  alter the render. Frames are
  frozen-tick captures (tick 60, tick 450) and posed corner states, not an organically played corner traversal.
- **Audio is not tested.** Headless Chrome never unlocks an AudioContext. The only proxy is bridge wiring (38 slots,
  identical lane vs main when art matches). I-111 (audio observers discarded at boot) is untouched and unchanged.
- Deterministic runs prove equality on the inputs they replay (a 9.9 s traversal route, the 15.6 s transform slice, a
  24.9 s default run with fire and four kills). They do not cover every weapon, capsule, hostile kind or corner played
  organically. The builder's race lab (29 runs) and traversal matrix (44 runs) are node-only and were not re-run here.
- `pathcheck`, the race lab, the deploy-bundle build and `verify-bundle.mjs` were not re-run by this gate (the reviewer
  and integrator own them). Bots here are evidence about regressions only; this report makes no fun or feel claim.

## Open feel questions for the operator

None. The gate asserts equality, not quality. (One carry-over for the integrator, not a question about this lane: the
staged hook deletion will stop the page calling `preventDefault()` on `L` and `E`, a browser-level difference noted in
`reports/tasks/T-121/build.md`.)

## Evidence index (all under `R`)

- smoke: `R/smoke/{lane,main}-{mid,transform,sixface}/{report.json,summary.md,screenshot.png}`,
  `R/smoke/cmp-{mid,transform,sixface}.txt`, `R/smoke/*.log`
- probes: `R/probe/<session>/probe.json` (+ `plain.png`, `frame-a.png`, `frame-b.png`, `selftest.png`), `R/probe/*.log`
- comparisons: `R/cmp/*.json`, `R/cmp/poses-*.txt`, `R/cmp/lane-dilated-vs-undilated-*.json`
- corner frames: `R/poses/{lane1,main1,lane2,main2,lane3,main3,lane4,main4}/`
- art-budget base rate: `R/bootart/*.json`
- server ledgers: `R/serve-8791.log`, `R/serve-8792.log`; pin proof: `R/lane.ls-tree.txt`, `R/lane.hashes.txt`, `R/main.ls-tree.txt`, `R/main.hashes.txt`
- spot-check: `R/spot5.txt`, `R/deleted-artifacts.txt`
- tools written for this gate: `R/bin/` (`probe.mjs`, `probe2.mjs`, `probe3.mjs`, `cmp-frame2.mjs`, `cmp-runs.mjs`,
  `cmp-poses2.mjs`, `boot-art.mjs`, `turn-pose-capture-qa2.mjs`, the queue scripts), `R/scripts/sixface-static.json`

## PROPOSED INBOX ISSUES

## I-??? | harness | S3 | repro: `node $R/bin/probe.mjs --base-url http://127.0.0.1:8791 --mode frame --viewport 1280x720 --stop-ms 1000` run twice against one served tree @ f3fa49a (plus `$R/bin/boot-art.mjs` ten times) | evidence: $R/bootart/*.json, $R/cmp/swap-1280.json, $R/cmp/d-frame-default-1280-t1.json
On the loaded GPU-less host, two boots of the same tree differ in art and bloom: in a controlled boot-only test 6 of 10
lane boots and 4 of 10 main boots lost the same 20-asset tail to the preload gate (flat-hull fallback frames, 40-50 % of
pixels different from a ready-art frame), and the bloom pass reported `active` in 2 of 22 sessions and `failed`
("not ready inside the 1200ms boot budget") in the rest, flipping between two boots of the same tree. Every pixel gate
and every before/after capture is therefore decided by boot luck unless it records and matches `__HB_PRELOAD()` and
`HB.snapshot().post.status` first (the T-121 build report proposed the same; this is corroboration with a method).
Fix direction (T-120 / harness lane): put a boot-clock dilation (`performance.now` at 1/30 speed via `addInitScript`,
shown here to leave the rendered frame unchanged) and the art/bloom match check into the shared capture helper; treat
bloom-on frames as unverifiable on this host and say so in any gate that touches `post.js`.

## I-??? | docs | S3 | repro: read `docs/archive/2026-10-artifacts-index.md` row `artifacts/cp3-transform-v2` against `reports/tasks/T-030/build.md` ("Seven more artifact directories") @ f3fa49a | evidence: $R/spot5.txt, reports/tasks/T-121/review.md item 1
The archive index says `cp3-transform-v2` is cited by nothing; T-030's build report names it. More generally, 13 kept
gate reports (T-008, T-011, T-030, T-032, T-035, T-038, T-044, T-045, T-047, T-048, T-049, T-050, T-056) cite removed
artifact folders by path, now recoverable only with `git show e5ce7d4:<path>`. Fix direction: correct the one index
row and add one sentence to the index saying those 13 reports' paths are history-only; no per-report edits needed.
