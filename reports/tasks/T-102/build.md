# T-102 build report — the corner turns work every time

Worktree `/home/user/hullbreaker/.claude/worktrees/T-102`, branch `task/T-102`,
base `98b12c9`. Ports used: 8752 (this tree), 8762 (an untouched `git archive`
export of `98b12c9` for "before" frames and the base smoke control); both killed
at the end.

## What a player experienced as "the turn didn't work"

I drove every turn headlessly like a player (20 policies x 4 viewports, every
default verb on) and looked at real frames of every turn at 1280x720 and
844x390. Five things a player can hit were broken and are fixed here; four more
are real but are design, art or camera-feel calls, measured and handed to the
operator; the rest of the list in the task block could not be reproduced and
each attempt is described.

## Defect table

Repro commands run from the worktree root. "Pre-fix" numbers are from the base
code (the falsifier's P rows revert exactly one fix each; the aggregate pre-fix
run is below).

| # | What the player sees | Deterministic repro (script + flags + tick) | Root cause (pre-fix path:line) | Fix |
| --- | --- | --- | --- | --- |
| D1 | Killed on the turning joint, RIG is knocked **back across the sealed fold**: one frame on the old facet, then the seal clamp pops it 1.5 tiles forward. A stock-life respawn within ~10 s of a turn lands **up to 40 tiles behind the fold** — culled for a frame (camera already on the new facet), then teleported 40.5 tiles to the seal. | `node tools/simlab/turnlab.mjs run --policy die-at-hinge --viewport desktop` — pre-fix: tick 1155 (gameMs 19266.7) x 113 -> 111.5 with the seal at 112.65, tick 1156 pop +1.5; at every corner (relocateOutsideOwnedRoute x6, popAfterRelocation x6, playerFacetBackwards x6). `--policy die-after-turn` (stock-life tier): tick 3829 (gameMs 63833.3) x 292.13 -> 248.5, seal 288.65, rigCulledByFold, tick 3830 pop +40.5. | `src/sim/player.js:754` (HULL FALLBACK ground knock `Math.max(le, x - groundKnockTiles)`) and `:811-813` (respawn `ceil(sLeftEdge()) + 3`) consult only the damage plane, never `cornerPlayerRouteWindow`. | `clampToOwnedRoute()` in `src/sim/player.js`: both relocations (and the over-a-gap catch) stay inside the corner/transform route window. Identity inside the window. |
| D2 | **Softlock on a portrait phone**: at 390x844, gate 3 (CONTAIN) never opens. The HUD says one hostile remains; nothing is on screen to shoot. | `node tools/simlab/turnlab.mjs run --policy run --viewport phonePortrait --gunner paced --pace 1400 --max-ticks 21600` — pre-fix: gate 3 arms at tick 3210 (scroll 274) and holds to the tick cap; the mandatory Iris (polyp, gating) sits at x 265.25, NDC x -1.33, while the frozen strip is [271.99, 290.98]; every later beat is parked 300 s behind it. | `src/sim/wavegate.js:325` places rooted bodies on authored stage sockets regardless of the view; beats advance only when the present beat clears (`:117-118` `pullNextGatePresence`, `src/pure/level1-ecology-encounters.js:148` 300 000 ms beat lock). No rule tied a gate holder to the view the halt freezes. | `retireUnseenGateRows()` (`src/sim/wavegate.js`), run every gate frame from `src/sim/scroll.js`: a view-bound row (polyp, mortar, hound) whose whole circle lies outside the frozen strip leaves through the existing deferred gate-break path. Flyers are exempt (their patrol box returns them). |
| D3 | Widening a narrow window (or rotating a narrow tablet) during the cleared-gate approach **scrolls the world backwards**. | `node tools/simlab/turnlab.mjs run --policy resize-approach-late --viewport narrowTall` (260x1000 -> 844x390 at approach + 250 ms) — pre-fix: tick 1334 (gameMs 22250) scroll 98.32 -> 98.00, at all six corners. | `src/sim/scroll.js:121` `setScrollX(Math.min(nextScroll, target))`: the approach-dolly target falls below the scroll already reached when EDGE_R grows. | `Math.max(scrollX, …)`: the plane only ratchets forward, as the rest of the code already assumed. (0.32 tiles today; larger with any closer camera — T-107.) |
| D4 | After the camera hand-off the **arriving face assembles column by column**: catwalks, ladders and hull appear one column per 16 ms from 690 to 860 ms, and on 844x390 five more columns pop at 1100 ms — an assembling reveal of the creature's own anatomy (entry 3). The pre-bend column RIG fights every gate from was never drawn. | Posed frames `base-1280x720-c1-t700` vs `-t860`: 19 249 px change while the camera moves 0.27 deg (10 323 px with the fix, the yaw alone); live module counts in the post-fix captures' sidecar: arriving facet drawn 88/88 at t700 (pure model of the pre-fix schedule: 19/88). | `src/render/route-visibility.js:32` passes `routeColumnBuilt(s)` — the sim's construction rows, which still settle on the retired zipper's schedule (`src/sim/wavegate.js` `updateZipper`, far set at `finishCorner`). | Under the default static-anatomy reveal, route ownership is camera-facet topology alone; `?zip=1` keeps its assembling reveal. The cull stamp changes only at facet hand-offs. |
| D5 | The gate HUD says **"LAST SIGNAL · CLOSING" when it is not the last**: kill it and the gate stays shut. | `node tools/simlab/turnlab.mjs run --policy run --viewport desktop --gunner paced` with the HUD check — pre-fix: gate 3: 149 of 158 LAST SIGNAL ticks had up to 3 gating bodies still queued; gate 2: 64/64; same on 844x390. | `src/ui/hud.js:299-303` counts only the current beat (`activeGateThreatCount`) while multi-beat encounters park later holders. | `gateRequirement()` / `gateRequirementText()` (`src/pure/waves.js`): LAST SIGNAL only when one kill opens the gate; parked holders shown as `+N INBOUND`. |
| R1 | **Binary hand-off pop**: at camera progress 0.96 (t≈690 ms) the whole departing stretch vanishes and the whole arriving stretch appears in one frame — at t680 the camera already looks down the new face and none of it is drawn. | Posed frames `*-c*-t680` vs `*-c*-t700`, every corner, both viewports. | `src/render/camera.js:171-180` (`FOLD_HANDOFF_PROGRESS = 0.96`, `cameraFacingFacet`) consumed by `src/render/limb.js:250` (`behindFold`) and route ownership. A deliberate compromise (comments in camera.js/limb.js): showing the next facet's proud anatomy at the 30 deg hold exposed open backs and put pieces in front of RIG. | **Not fixed** — needs render-art iteration I cannot judge or iterate at ~1 SwiftShader frame/minute. Operator question + inbox issue. |
| R2 | **Flat teal voids at the screen edge near every corner**: on approach the right edge, after each turn the left edge, is bare clear colour. | Measured on the base captures (columns >90 % clear colour): 1280x720 approach c1 12.0 %, c2 4.4 %; 844x390 approach c1 18.7 %, c2 12.7 %, c3 17.1 %; 844x390 after turn 1 10–11 %. | Each face owns finite backdrop planes centred on its midpoint (`src/render/atmosphere.js`); `cameraFaceBlendGain` (`src/render/camera.js:209`) zeroes every face but the current one at rest, by design. A camera halted 14 tiles before a corner (or anchored behind it after) sees past the plane. | **Not fixed** — art call (and reverses a deliberate gain rule). Inbox issue for T-105/T-107. |
| R3 | **Post-turn zoom pump**: right after every turn the view is ~40 % closer and pulls back over ~3.5 s. RIG height at `done` / +1.5 s / settled: 1280x720 39.0 / 32.3 / 27.4 px; 844x390 21.1 / 17.5 / 14.8 px. | Replica projection (`turnlab run --json`). In the captures: `*-t700` (yaw within 0.3 deg of the detent, scroll still frozen at the halt, nearly the `done` pose) vs `*-after1500`. | `src/render/camera.js:282` anchors at `polyAt(SEGS, scrollX)` with the new yaw while the scroll is still frozen at the departing face's halt — the camera orbits the halt point, 15 tiles before the joint, not the joint. | **Not fixed** — camera feel, and T-107 changes camera.js next. Operator question. |
| R4 | **RIG stops dead at every hinge for 1.1 s**, input held (66–67 ticks per corner, 6 corners ≈ 6.6 s per run). | Every policy; `perCorner.pinnedInputTicks` in any `turnlab run --json`. | `src/pure/waves.js:129-135` `cornerJointRule('turning')` is a zero-width window (fold-ownership design). | **Not fixed** — by design; operator question. |

### Could not reproduce (attempt described)

- **Gate opens late because ambient spawns drift past the pivot (old I-022).** `armGate` retires every non-encounter row at the halt (`src/sim/wavegate.js:190` on this branch, `:153` on the base) and the clear counts only the encounter's own gating rows. 0 `gateShutWithKillConditionMet` ticks in the 41 played runs of the final gate (bound: the gate opens on the tick its last gating body dies); 0 off-facet gate bodies; 0 non-encounter hostiles in 1 860 / 2 044 / 1 047 held-gate ticks at 1280x720 / 844x390 / 390x844 (visible-only gunner).
- **Gate opens without the turn firing.** 0 `approachAtBendNoTurn` at 1280x720, 844x390, 390x844 and 260x1000 (the one framing that needs the approach dolly).
- **Fall-through / snag at the hinge.** 0 `hingeFallThrough` / `hingeFallDeath`; no envelope violation on any normal crossing (bound from CONFIG: |dx| <= 11.8 t/s x dt, |dy| <= 32 t/s x dt, snaps only on a traversal-state change).
- **Camera snap direction, over/under-rotation, jitter.** Every corner's yaw stays in [-1.36, 61.21] deg and lands exactly k x 60 deg; no per-tick step beyond the designed peak (easeOutBack slope x amplitude / duration = 15.8 deg/tick at 60 Hz). Framing through the turn: RIG at NDC x 0.20 (1280x720) / 0.16 (844x390) / 0.65 (390x844) when it fires, pulled to centre by the hand-off, never near an edge.
- **Hostiles near the bend.** No gate body ever sat on the far facet or was hidden by the build gate during a held gate; no wasp ever sank into the deck at the frontier (paced gunner, two paces, both landscape viewports).
- **Capsules near the bend.** Weapon pops at the frontier were recaught mid-air; pops on the joint landed after the zipper built their columns. Mechanism worth knowing: capsules (and wasp dive floors, flame crawl, bullets) treat the pre-bend column (`cornerS`) as a hole until the turn because it is in the zipper strip — no player-visible case found.
- **Turns airborne / mid double-jump / hit / paused / resized / backtracked after firing.** Clean under `jump`, `jump2`, `hit-mid-turn`, `pause-mid-turn`, `resize-mid-turn`, `resize-gate`, `resize-approach(-late)`, `backtrack`, `backtrack-approach`.
- **Dropping through / on a ladder at the hinge.** Not reachable: all six aprons `[cornerS-6, cornerS+3)` are flat solid ground at height 3 with no catwalk, ladder or solid rect.

## What changed and why

Runtime (6 files, +125 / -22):

- `src/sim/player.js` — `clampToOwnedRoute()`; HULL FALLBACK (ground knock, over-a-gap catch) and `respawn()` use it (D1). **Outside the enumerated fence list** (it is the turn-at-the-instant-of-death code); no other wave-5 lane touches the file.
- `src/sim/wavegate.js` — `gateRowOutsideHeldView()`, `retireUnseenGateRows()` (D2).
- `src/sim/scroll.js` — the per-gate-frame legibility call (D2); the forward-only scroll guard (D3).
- `src/pure/waves.js` — `gateRequirement()`, `gateRequirementText()` (D5). Wave-gate code by category; not in the enumerated list.
- `src/ui/hud.js` — the held-gate line prints the requirement (D5). Gate UI only, as the integrator scoped it.
- `src/render/route-visibility.js` — default reveal ownership is facet topology (D4). Render ownership around the bend (task "look at" list); not in the enumerated list; no other lane touches it.

No CONFIG constant moved. No camera code changed (T-107 follows).

Tooling (zero effect on the game): `tools/simlab/lib/sixface-host.mjs`,
`tools/simlab/lib/turn-proof.mjs`, `tools/simlab/turnlab.mjs`,
`tools/simlab/turnlab-falsify.mjs`, `tools/simlab/TURNLAB.md` (separate file so
T-104's `tools/simlab/README.md` edit stays conflict-free),
`tools/playtest/turn-pose-capture.mjs`, `tools/playtest/turn-capture.mjs`,
`tools/pathcheck/t-102-corner-turns.mjs` (+1 manifest line).

### Legacy assertions changed (decisions.md entry 21)

| file | label | change | reason |
| --- | --- | --- | --- |
| `tools/pathcheck/vertical-assault-geometry.mjs` | "route ownership is normal-run topology, independent of default or zip corner art" | rewritten -> "route ownership is camera-facet topology in both normal-run reveal styles; only ?zip=1 adds build state" | pinned source text (`route-visibility.js` must not mention `IS_G1`) that blocked D4's fix; the protected property — no reveal style exposes a facet the camera does not own — is still asserted. |
| `tools/pathcheck/future-facet-render-ownership.mjs` | "handoff frame retains its 19 built arrival columns and leaks zero future rows" | relabelled "?zip=1: handoff frame retains …"; arithmetic unchanged | it models the zipper construction schedule, which now governs only the retired `?zip=1` reveal; the default reveal is asserted separately (whole facet at the hand-off). |

### Legacy turn/gate assertions that were GREEN while the behaviour was broken (T-108 evidence)

- `gate-prelude-runtime.mjs` "gate state always has a visible or entering gating body" — green while gate 3 at 390x844 was held forever by an Iris 6.7 tiles off-screen ("visible" meant "presence started", not on screen).
- `fold-handoff-player-ownership.mjs` "the completed bend remains a one-way seal after camera commit" / "the turning joint rejects retreat to the departing facet" — green while HULL FALLBACK and respawn relocated RIG behind the seal; the assertions exercise the clamp arithmetic on synthetic inputs, never a relocation.
- `t-009-static-anatomy-reveal-default.mjs` "the now-default reveal still cannot be animated (CP3 ruling holds)" — inspects `render/limb.js` only, while the route hull, catwalks and ladders were revealed on the zipper schedule (D4).
- `future-facet-render-ownership.mjs` "finish frame expands the same draw prefix to all 88 arrival rows" and `catwalk-built-prefix-visibility.mjs` "the real construction frame keeps its one built segment and withholds four tail segments" — they assert the column-by-column assembly as intended behaviour.
- `tools/playtest/analyze-run.mjs` `GATE_RE` still parses `WAVE k/6 — N HOSTILES`, a HUD format that no longer exists; any gate segmentation from it is silently empty.

## The headless turn proof

`tools/pathcheck/t-102-corner-turns.mjs` (runs in `node tools/pathcheck.mjs`):
41 played runs — 15 policies at 1280x720 and 844x390, `run` / `die-at-hinge` /
`resize-approach-late` at 390x844, `resize-approach-late` at 260x1000,
`stock-life-at-hinge?fallback=0` at both landscape sizes, `run?momentum=0` at
both landscape sizes (they ride the screen clamp, for the framing bound), and the
visible-only paced gunner at three viewports — each through all five turns and
the Crown approach to VICTORY, with one assertion per (run, invariant family);
plus static drift guards on the transcription, the reveal rule evaluated on the
shipped `routeRenderable`, the gate-requirement text and the held-view
predicate. Bounds are stated in `tools/simlab/TURNLAB.md` and are derived from
CONFIG design constants, never from the code under test (three guards were
first written the other way and failed to bind — see falsification).

## Verification (every command run, with its result)

Host: 4 cores shared with three other lanes, load average 30–64 throughout;
Chromium via SwiftShader. Probe env: `HB_PROBE_BOOT_MS=180000
HB_PROBE_SPAWN_MS=300000`.

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` (final code, `e2607de`; the commit after it adds only this report and the captures) | **4342 passed, 1 failed** |
| `node tools/pathcheck.mjs` (tree at `c397ca4`+, before the two clamp-riding runs were added) | 4326 passed, 1 failed |
| the 1 failure, both runs: `render-submission-contract.mjs` "the permanent real-browser performance probe boots the shipped scene" | `perf-probe.mjs` `page.goto` exceeded its hard-coded 45 s navigation timeout at load ≈50. **Same domain on the untouched `98b12c9` export at load ≈47: 4 passed, 1 failed, identical TimeoutError.** Host artifact, not this branch (nothing here touches page load). **Correction to both counts:** in every one of these runs the probe died before writing its `result.json`, yet three of the domain's other assertions passed. They read the fixed shared path `/private/tmp/hullbreaker-pathcheck-render-submission/result.json`, which another run had left behind; this is the defect main fixed after this branch's base, in `e29665b`. That makes 3 of the passes in every count here unproven: 4339 + 3 unproven on this branch, 3985 + 3 unproven on the base. `e29665b` also lets `HB_PROBE_BOOT_MS` widen this `page.goto`. |
| `node tools/pathcheck.mjs` on the untouched `98b12c9` export (same host, same env) — the **before** count | **3988 passed, 1 failed** (the same perf-probe timeout) = 3989 assertions, matching the integrator's figure for `98b12c9` |
| count delta | 3989 -> 4343 assertions: +354, all in `tools/pathcheck/t-102-corner-turns.mjs` (24 static + 330 played: 41 runs x 8, plus 2 matrix-level); the two legacy assertions changed were rewritten/relabelled, not removed |
| T-102 domain alone, post-fix (39-run matrix, before the HUD rows) | 335 passed, 0 failed (378 s) |
| T-102 domain on the untouched `98b12c9` export with the new tools copied in (pre-fix; the 39-run version of the matrix) | **272 passed, 65 failed** — see falsification |
| `node tools/simlab/turnlab-falsify.mjs` (final tree) | **25 of 25 rows went red** ("every guard went red when its behaviour was broken") |
| `node tools/simlab/turnlab.mjs matrix --jobs 3` (19 policies x 3 viewports, oracle gunner, before any fix) | violations only in the 12 death/respawn rows (D1); every other policy/viewport clean. The oracle clears gates too fast to expose D2 — the visible-only paced gunner found it |
| smoke `mid-route.json` with main's harness, read-only, against :8752 (`HB_HARNESS_SLOWDOWN=40 … --deterministic --viewport 480x300`) + `tools/orch/smoke-verdict.mjs` | **PASS** — tick 594/594, deaths 0, outcome not-completed (victory not required) |
| smoke `transform-slice.json`, same recipe, `--max-runtime-ms 20000` (attempts 1-2 at `HB_HARNESS_SLOWDOWN` 40/100 hit the host: the wall cap at tick 629/1104, then the harness's 30 s `page.goto`) | attempt 3 (`HB_HARNESS_SLOWDOWN=100`, 1001 s wall): harness outcome **completed**, deaths 0, falls 0, setbacks 0. **smoke-verdict FAIL**: "deterministic ledger status running; dispatched 52/58 events; stopped at tick 938, terminal tick 1104". The slice reached BREACH CLEAR (`VICTORY`, 2/2 transformations) at tick 938 (gameMs 15 633.6). Victory freezes the sim, so the ledger can never reach its terminal tick. **Base control, the same command against the untouched `98b12c9` export on :8762 (925 s wall): identical** — VICTORY at gameMs 15 633.646, x 146.0874, y 10.4443, scroll 130.2807, tick 938/1104, 52/58 events, the same smoke-verdict FAIL line. Pre-existing on main (main has the same `src/` as `98b12c9`). It is not this branch; see the S1 inbox issue. |
| why this branch cannot change that run | with no death or fallback, none of the changed sim lines execute in `?slice=transform`: `clampToOwnedRoute` runs only in HULL FALLBACK and `respawn`; both `scroll.js` changes sit after the slice's early return (`src/sim/scroll.js:30-36`); the gate functions run only for six-face corners, which stay `idle` in the slice; `hud.js` and `route-visibility.js` are UI/render. Headless A/B: `node tools/simlab/t2lab.mjs run --script tools/playtest/scripts/transform-slice.json --end 18400` gives **byte-identical output** on this branch and on the `98b12c9` export. (t2lab's transcription is older than the live loop, so it records a death at 15.18 s where the browser reached victory; it is A/B evidence only.) |
| `git merge-tree --write-tree --name-only main HEAD` | clean (no conflicts); no file is changed on both main (since `98b12c9`) and this branch |
| played cross-check of the posed method: `tools/playtest/turn-capture.mjs --stage approach --touch --viewport 844x390 --corners 1` vs the posed frames | t350: mean abs dL 0.93, 0.02 % of pixels differ by >24; t700: mean 1.46, 0.24 % (a pickup drawn in the played session) |
| posed captures: page camera vs headless replica, every frame | 0 disagreements in yaw or facing facet (all 4 sessions) |

## Falsification

Each new assertion was shown to fail when the thing it guards is broken.

**Pre-fix, all at once** — the new domain (its 39-run version) run on the
untouched base: 65 failures, exactly where defects existed: the gate family in all 39 played runs
(the old HUD rule's false "LAST SIGNAL", D5), envelope + facet in all 9
death/respawn runs (D1), the ratchet family at 260x1000 (scroll rewind, D3),
VICTORY for the 390x844 paced run (stuck at 2/6, D2), and six static checks
(the shipped base `routeRenderable` draws 19 of 88 arriving rows at the hand-off
— D4 — plus the HUD wiring/text and the missing legibility rule). Families with
no pre-fix defect (hinge, turn, framing, most of ratchet) cannot fail on the
base; the M rows below break them deliberately.

**One break per row** — `node tools/simlab/turnlab-falsify.mjs` on the final
tree (scratch copy; P rows revert one fix, M rows break behaviour that was
already right):

| row | what is broken | guard | went red | evidence |
| --- | --- | --- | --- | --- |
| P1 | relocations ignore the corner route window | die-at-hinge @1280x720 | yes | relocateOutsideOwnedRoute x6, popAfterRelocation x6, playerFacetBackwards x6 |
| P1b | stock-life respawn after a turn lands behind the seal | die-after-turn @844x390 | yes | rigCulledByFold x2, popAfterRelocation x2 |
| P2 | a gate waits on view-bound bodies it cannot show | run, paced gunner @390x844 | yes | gateBlind x10931; TICK_CAP at 2/6 |
| P3 | the approach dolly rewinds the scroll on a resize | resize-approach-late @260x1000 | yes | scrollBackwards x6 |
| P4 | the default reveal reads the zipper construction rows | static (shipped `routeRenderable` evaluated) | yes | "draws the whole arriving facet (88 rows)…" FAIL |
| P5 | the gate HUD calls one visible body the last | run, paced @1280x720 | yes | hudLastButMore x551 |
| P5b | hud.js prints the beat count, not the requirement | static | yes | HUD wiring FAIL |
| M1 | a completed corner seals 2 tiles ahead of the joint | run @1280x720 | yes | teleport x6 |
| M2 | the joint apron loses its deck | run @1280x720 | yes | hingeFallThrough x2, hingeFallDeath x5 |
| M3 | the last gating kill no longer opens the gate | run @1280x720 | yes | gateShutWithKillConditionMet x1188 |
| M4 | reaching the halt no longer arms the gate | run @1280x720 | yes | haltedButIdle x1250 |
| M5 | arriving at the bend no longer fires the turn | run @1280x720 | yes | approachAtBendNoTurn x1246 |
| M6 | the turn fires a tile before the bend | run @1280x720 | yes | teleport x6 |
| M7 | the ratchet settles 6 deg short of the detent | run @1280x720 | yes | cameraFacetBackwards x116 |
| M8 | the snap overshoot triples (backS 3.0) | run @1280x720 | yes | ratchetOutOfEnvelope x6 |
| M9 | a corner completion is reported twice | run @1280x720 | yes | ratchetBaseMismatch x7522 |
| M10 | the second snap jumps instead of easing | run @1280x720 | yes | cameraYawJump x6 |
| M11 | the screen clamp lets RIG run 3 tiles off-frame | run, momentum=0 @1280x720 | yes | rigOffScreen x1430 |
| M12 | a popped weapon settles half a tile into the deck | pop-weapon-at-hinge @1280x720 | yes | capsuleThroughDeck x323 |
| M13 | a cleared prelude skips the joint approach | run @1280x720 | yes | turnSkippedApproach x4 |
| M14 | a completed corner stops sealing the fold | backtrack @1280x720 | yes | playerFacetBackwards x1661, rigCulledByFold x1661 |
| M15 | main.js steps capsules after bullets (replica drift) | static | yes | loop-order FAIL |
| M16 | camera.js portrait framing drifts from the replica | static | yes | PORTRAIT_SAFE FAIL |
| M17 | a reset row the replica does not know | static | yes | reset-registry FAIL |
| M18 | held-view test uses centres instead of circles | static | yes | held-view predicate FAIL |

Honest note: the first falsifier pass found three guards that did **not**
bind — M9 (the camera base was compared with its own hook-call count), M10 (the
yaw-step bound was sampled from the curve under test) and M11 (the framing bound
was derived from the clamp under test, and the default policy never rode the
clamp). All three were rewritten to use independent truths (the sim's count of
completed corners; the design constants; a fixed 1.03 NDC bound plus two
momentum-off clamp-riding runs) and now bind.

## Captures

All in `reports/tasks/T-102/captures/`, JPEG q74, DPR 1.

**How they were made, and what that means for judging them.** Under a
SwiftShader host at load 30–64 the game renders well under 1 fps, so the turns
were *posed*: `node tools/simlab/turnlab.mjs poses --viewport desktop|phoneLandscape`
plays the run headlessly and records the exact sim state at each milestone
(`poses-*.json`); `tools/playtest/turn-pose-capture.mjs` applies it in a paused
page through the same module entry points the frame loop uses (`finishCorner`,
`updateZipper(c, tMs)`, `syncCamera` and every fold cull) and the real renderer
draws it. Every frame's camera yaw and facing facet were checked against the
replica (0 disagreements), and a genuinely played turn matches its posed twin
(Verification). Staging caveats: hostiles are absent (every milestone here is
after the gate cleared). Texture presence also varies between capture sessions
on this host: the preload gate can close before a texture decodes, and it went
both ways between the base and fix sessions. Each sidecar records its session.
In the desktop fix session, 20 assets timed out at the 2.5 s gate: the hull
panel tile, the weld seam, the Crown command art and the enemy atlases, so
those frames draw the hull flat. In the touch 844x390 fix session nothing timed
out. Judge geometry and ownership in these frames, not textures.

Labels: `approach` = gate cleared, RIG 0.6 tiles from the bend (before);
`t350` = the 30 deg ratchet hold, `t700` = the frame after the camera hand-off
(during); `after1500` = 1.5 s after the ritual (after). `t680` = 20 ms before
the hand-off.

| files | what |
| --- | --- |
| `fix-1280x720-c{1-6}-{approach,t350,t700,after1500}.jpg` | desktop, every turn incl. the Crown approach (c6), final tree |
| `fix-touch-844x390-c{1-6}-{approach,t350,t700,after1500}.jpg` | phone landscape, touch context (the iPhone's 6.5 s preload budget), final tree |
| `fix-1280x720-c1-t680.jpg`, `fix-touch-844x390-c1-t680.jpg` | 20 ms before the hand-off — pair with `t700` for R1 |
| `base-1280x720-c1-t700.jpg`, `base-1280x720-c1-t860.jpg` | pre-fix render: the arriving face still assembling after the hand-off (D4); compare `fix-1280x720-c1-t700.jpg` |
| `base-844x390-c1-approach.jpg` | pre-fix: the approach void (R2) as shipped |
| `played-844x390-c1-t350.jpg`, `played-844x390-c1-t700.jpg`, `played-844x390-frames.json` | the played cross-check |
| `fix-1280x720-poses.json`, `fix-touch-844x390-poses.json` | per frame: ritual clock, scroll, RIG, camera yaw/facet (page and replica), live route ownership counts from the real module (`route k` 88/88 at every `t700`), the session's preload record |
| `poses-desktop.json`, `poses-phoneLandscape.json` | the replica poses the frames were made from |

Portrait (390x844) was not captured in the browser (landscape-first per the
operator, and the CPU budget); every portrait claim above is headless.

## Variance (entry 19)

No outcome distribution was measured (the proof uses perfect gunners and an
hp top-up; distributions are T-104's race lab). Where the fixes can move
outcomes: (a) narrow views only (390x844, 260x1000) — the legibility rule
retires 2–3 off-screen deck/rooted bodies at every gate 2–6 (hounds, mortars,
polyps; only CONTAIN's Iris was gating), so those gates get easier and gate 3
becomes winnable at all; nothing is retired at 1280x720 or 844x390; (b) a death
on or just after a joint no longer costs the 1.5-tile ground knock (the seal
absorbs it) and a respawn shortly after a turn drops in at the seal instead of
up to 40 tiles back. Best/worst/spread: not measured.

## Open feel questions for the operator

URL: `index.html` on a build with this branch merged. No flags are needed (FAR is
the default view). Play to the first corner; on the phone, hold it in landscape.

1. At every corner RIG stops dead on the hinge for 1.1 s while the camera
   swings, even with right held. Does that read as a deliberate "ratchet" beat,
   or as the turn snagging?
2. Just after the camera finishes turning the view is about 40 % closer and
   then pulls back over ~3.5 s. Do you notice that, and does it feel like part
   of the turn or like the camera correcting itself?
3. At about two-thirds of the swing the whole next stretch appears and the old
   one disappears in a single frame (compare `c1-t680` and `c1-t700`). Do you
   see a pop there?
4. During every gate fight on the phone the right ~15–20 % of the screen is
   flat teal, and after each turn the left ~10 %. Does it read as fog/sky, or
   as missing world?
5. The gate line now says e.g. "1 HOSTILE · +2 INBOUND" instead of "LAST
   SIGNAL" when more holders are queued. Does it tell you what still needs
   killing?

## PROPOSED INBOX ISSUES

## I-??? | art | S2 | repro: `node tools/simlab/turnlab.mjs poses --viewport desktop > p.json && node tools/playtest/turn-pose-capture.mjs --poses p.json --only t680,t700`, task/T-102 | evidence: reports/tasks/T-102/captures/fix-1280x720-c1-t680.jpg, fix-1280x720-c1-t700.jpg
Every corner ritual swaps worlds in one frame at camera progress 0.96 (t≈690 ms):
the whole departing stretch (limb, hull, route art) vanishes and the whole
arriving stretch appears; at t680 the camera already looks down the new face and
none of it is drawn. Entry 3 asks for a reveal by camera rotation, self-occlusion
and fog. The binary cull (`src/render/camera.js` `FOLD_HANDOFF_PROGRESS`, consumed
by `src/render/limb.js` `behindFold` and route ownership) is a deliberate guard
against proud anatomy showing its open backs / sitting in front of RIG at the
30 deg hold, so the fix is render-art work, judged in captures: e.g. admit the
arriving facet's hull and route art from the ritual start while proud pieces keep
the late hand-off, or hand off during snap 2's fastest motion so motion masks it.

## I-??? | art | S2 | repro: same capture tool, labels `approach` and `after1500`, 844x390 | evidence: reports/tasks/T-102/captures/fix-touch-844x390-c1-approach.jpg, fix-touch-844x390-c3-after1500.jpg
Flat clear-colour voids at the screen edge near every corner. Measured on the
base captures (columns >90 % clear colour): 1280x720 approach c1 12.0 %, c2 4.4 %;
844x390 approach c1 18.7 %, c2 12.7 %, c3 17.1 %; 844x390 after turn 1 10–11 %.
Each face's backdrop planes are finite and centred on the face midpoint
(`src/render/atmosphere.js`) and `cameraFaceBlendGain` (`src/render/camera.js`)
zeroes all but the current face at rest, so a camera halted 14 tiles before a
corner — or anchored behind it after the turn — sees past the plane. On the
operator's primary device this is on screen for every gate fight. Fix direction:
extend each face's veil past its corner or admit the adjacent veil during
gate/approach and the post-turn catch-up; T-105 (phone rendering) with T-107.

## I-??? | feel | S3 | repro: `node tools/simlab/turnlab.mjs run --policy run --viewport desktop --json` (replica projection), task/T-102 | evidence: reports/tasks/T-102/captures/fix-1280x720-c1-t700.jpg vs fix-1280x720-c1-after1500.jpg
After every turn the view is ~40 % closer and pulls back over ~3.5 s (RIG height
at done / +1.5 s / settled: 1280x720 39.0 / 32.3 / 27.4 px; 844x390 21.1 / 17.5 /
14.8 px). `syncCamera` anchors at `polyAt(SEGS, scrollX)` with the new yaw while
the scroll is still frozen at the departing face's halt, so the orbit pivots on
the halt point 15 tiles before the joint. Fix direction for T-107 (which owns the
camera next): orbit the joint and blend back to the scroll anchor as the scroll
passes the chamfer — behind a flag until judged.

## I-??? | bug | S3 | repro: `node tools/simlab/turnlab.mjs run --policy run --viewport desktop --json` (`clampNdc`), task/T-102 | evidence: tools/simlab/TURNLAB.md limitation 4
Pinned at the calibrated right clamp, RIG's chest renders at NDC x ≈1.012 at
1280x720 — about half the sprite past the frame edge. `calibrateEdges` intersects
the z = 0 route plane while RIG draws `RIG_SURFACE_DEPTH` = 1.15 tiles toward the
camera, and the 0.4 margin + half-width does not cover it. Not turn-specific.
Fix direction (T-107): calibrate the clamp at the actor depth or inset by the
body width.

## I-??? | bug | S3 | repro: read `src/sim/level.js` slamSets (strip starts at cornerS) + `builtGroundTopAt`; no player-visible case found, task/T-102 | evidence: this report, "Could not reproduce — capsules near the bend"
The pre-bend column (`cornerS`, the deck RIG holds every gate from) is in the
zipper strip, so sim terrain queries — weapon-capsule floors, wasp dive floors,
flame crawl, bullet terrain — treat it as a hole until the ritual. No visible
symptom reproduced (pops are recaught; dives end above the deck), but the sim
and the rendered deck disagree there. Fix direction: start the strip at the
arriving facet's first column; touches the `?zip=1` choreography and two legacy
zipper models.

## I-??? | docs | S3 | repro: `grep -n GATE_RE tools/playtest/analyze-run.mjs` | evidence: src/ui/hud.js gate line
`analyze-run.mjs` segments gates with `/^WAVE (\d+)\/(\d+) — (\d+) HOSTILES$/`, a
HUD format that no longer exists (it has been `WAVE k/6 · PHASE · …` since before
T-102), so gate segmentation from that tool is silently empty.

## I-??? | bug | S1 | repro: `cd tools/playtest && HB_HARNESS_SLOWDOWN=100 node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --viewport 480x300 --out <dir> && node ../orch/smoke-verdict.mjs <dir>/report.json`, task/T-102 and an untouched 98b12c9 export | evidence: reports/tasks/T-102/build.md, Verification table (transform-slice rows)
`tools/orch/smoke-verdict.mjs` passes a run only if the deterministic ledger
reaches the script's terminal tick (1104 for `transform-slice.json`). Played to
the end, the slice reaches BREACH CLEAR (`VICTORY`, 2/2 transformations) at tick
938 (gameMs 15 633.6). Victory freezes the sim, so the ledger stops at 52/58
events and the verdict is FAIL even though the harness outcome is "completed"
with 0 deaths. Aspect 1.6 calibrates to the same edges at 480x300 and at the
default 1280x800: [-27.438, 45.735] from the fixture branch of `calibrateEdges`,
which equals the edges t2lab measured live at 1280x800. So the smaller smoke
viewport does not cause it. The untouched `98b12c9` export (the same `src/` as
main) gives the identical result: the same victory tick, the same position to 4
decimals, the same verdict line. As things stand, the merge gate's
`smoke transform-slice.json 20000` step cannot pass for any lane. Fix direction
(orch): accept a sampled victory as a terminal state, or end the script's
schedule before the slice's victory tick.

## Pacing observations for T-104 (not acted on)

- Each turn holds RIG for 1.1 s and the gate prelude/halt/approach adds more;
  six corners cost ≈6.6 s of pinned time per run before any fight.
- The ambient spawner resumes on the tick a corner completes and immediately
  spawns every table row inside the frozen right edge: on 1280x720 the right
  edge is 50 tiles ahead of a halt that sits 14 tiles before the corner, so the
  "cornerClearAfter: 20" breather is consumed at once on wide views.

## Where the turn complexity lives

These are facts for T-104, which writes the recommendation. Line counts were
measured on this tree. A module that exists only for turns is counted whole;
for mixed modules I counted the turn-specific top-level functions, including
their comment blocks. Defect ids are this report's rows (D = fixed, R =
measured, not fixed). The last column is answered per defect: would a
pre-authored static corner mesh, placed from the same 2D data, have removed
that defect class?

| part | files (approx. lines) | defects from it | removed by a pre-authored static corner mesh? |
| --- | --- | --- | --- |
| Sim crossing logic | `src/sim/scroll.js` 134; `src/sim/wavegate.js` corner state machine ≈100; `src/sim/level.js` built/unbuilt column state ≈67; `src/pure/waves.js` joint/approach/zipper rules ≈57; `src/sim/player.js` seal/frontier clamps ≈30; 8 `crossesBend` call sites in `src/sim/weapons.js`, `hostiles.js`, `ecology-tactics.js`. ≈400 total | D1, D3; R4 (by design) | No, for all three. Each is a 2D-sim rule on RIG's x or on the scroll: where a relocation lands, the scroll target on a resize, the zero-width joint lock. They behave identically whatever draws the joint. The lock's stated reason is camera ownership (`src/pure/waves.js:149-157`), not geometry. |
| Path/polyline mapping | `src/pure/path.js` ≈95 of 136; `src/render/tower.js` 62 (the one (s, y) -> 3D placement every dynamic entity uses); `src/pure/ascent.js` 52. ≈210 total | none | Not applicable. A mesh placed from the 2D data is placed through this mapping, and every actor still goes through `tower.js`. |
| Wave gate | `src/sim/wavegate.js` ≈335 (`spawnGateRole` alone is 137); `src/pure/level1-ecology-encounters.js` 151; `src/pure/waves.js` ≈80; `src/ui/hud.js` gate line ≈10. ≈575 total | D2, D5 | No. D2 is where rooted bodies spawn relative to the frozen view. D5 is the HUD count versus multi-beat encounters. |
| Camera ratchet | `src/render/camera.js` ≈170 of 343: `syncCamera`/reset ≈80, plus edge calibration and portrait framing ≈90 (the sim's halt, clamps and approach dolly read these). `src/pure/waves.js` timeline + two-snap yaw curve ≈27. ≈200 total | R3 | No. R3 is the orbit pivot: `syncCamera` anchors at `polyAt(SEGS, scrollX)` while the scroll is frozen at the halt. That does not depend on geometry. |
| Procedural corner/hinge geometry | `src/pure/limb.js` 721, of which ≈150 is joint-specific (`limbJoints`, `jointPlan`, `entryShoulderPlan`, `limbFoldBridgeVisible`, `limbInJointApron`); `src/render/limb.js` 611 (`bakeLimb` is 160). `src/render/level.js` (2632) has no hinge geometry: its corner code is the zipper reveal and the culls (next row), and route art is built per column. | none directly | None of my defects came from here. This is the part a Blender corner piece would replace, and it is the stated reason for R1's late hand-off (next row). |
| Render ownership / culling of faces | `src/render/level.js` ≈136 (zipper view hooks, dressing cull, panel draw range); `src/render/camera.js` ≈52 (hand-off, face gain, rationale); `src/render/route-visibility.js` 50; `src/pure/path.js` ≈38; `src/render/limb.js` ≈38; `src/render/bullets.js` ≈27; `src/render/seams.js` ≈20; `src/render/atmosphere.js` ≈19; `src/render/player.js` ≈15; `src/render/crown.js` ≈8; `src/render/backdrop.js` ≈3; plus `routeRenderable` call sites in `hostiles.js`, `capsules.js`, `mods.js`, `action-vfx-runtime.js`, `enemy-ecology-tactics.js`. ≈410 total across 15 render modules; `src/main.js:395-399` calls five separate per-frame fold culls. | D4, R1, R2 | **D4: no, for a corner piece.** D4 was the arriving face's per-column route art (hull panels, catwalks, ladders) reading the sim's zipper rows; the joint was not involved. It could not have happened if that route art were one static mesh per facet, because then nothing is visible per column. **R1: partly.** Three code comments justify the late 0.96 hand-off, and all three describe how per-face procedural pieces look at the 30 deg hold: a "freestanding cream slab" (`camera.js:157-170`); next-face bands that "exposed their backs and made RIG appear behind the fold" (`limb.js:215-219`); service frames whose "back faces read as a second level floating through the fold" (`level.js:1521-1527`). A closed piece authored to read correctly from every ratchet angle removes those reasons for whatever it replaces. The same binary hand-off still drives all 15 consumers, so the pop stays until that rule changes. **R2: no.** The void is missing backdrop: per-face atmosphere/backdrop planes gated by `cameraFaceBlendGain`. A corner mesh would fill it only if it were authored as backdrop large enough to cover that part of the frame. |
| A second turn implementation | The transform slice (`?slice=transform`): `src/pure/transform.js` 726, `src/render/transform.js` 535, `src/sim/transform.js` 226. ≈1490 total, with its own path, halt/gate, yaw curve and moving covers. The six-face run uses only its busy/seal/frontier hooks, which do nothing outside the slice. | none (smoke-run only) | Not examined. |

Two more facts about iteration cost:

- Part of a turn's correctness is decided in `src/render/`. `cameraFacingFacet()` decides whether RIG, route art and actors are drawn. So the headless proof had to re-implement the camera's edge calibration, ratchet yaw, facing facet and pose as pure math (`tools/simlab/lib/sixface-host.mjs`, 308 lines) and cross-check it against the live page. That split does not depend on how the geometry is authored.
- 23 of the 78 pre-existing `tools/pathcheck/` domain files reference the turn vocabulary (corner events, zipper, fold hand-off, bend sets). Two of them assert the column-by-column zipper assembly as intended behaviour (listed under the T-108 evidence above).

## Coordination notes

- T-104 built a parallel six-face replica (`tools/simlab/race/`) with its own
  transcription and drift guards; `tools/simlab/lib/sixface-host.mjs` is the
  same idea. Consolidate after both merge.
- T-107: the approach dolly (D3) engages only when EDGE_R < 15.75; a closer
  phone camera will engage it on phones — the forward-only guard is in place.
  R2/R3 live in the camera/atmosphere code T-107 will touch.
- `decisions.md` entry 23 landed on main after this branch's base (`98b12c9`).
  It says the turn never waits for T-203's rolling gates: survivors carry
  over. This branch fixes today's held gate. D2, D5, and turnlab's `gate`
  family (`gateShutWithKillConditionMet`, `haltedButIdle`, `gateBlind`) all
  assume a gate that holds the turn, so T-203 must replace those invariants,
  not inherit them. The envelope, hinge, turn, facet, ratchet and framing
  families do not depend on the gate holding. R4 (the 1.1 s joint lock) is a
  separate wait from the gate. Whether it counts as "waiting" under entry 23 is
  for the operator or T-203; this report does not interpret it.
- The branch merges cleanly onto current main (`git merge-tree --write-tree
  main task/T-102`: no conflicts). None of the files main changed since
  `98b12c9` are files this branch touches.
- The merge gate runs `node tools/pathcheck.mjs` inside this worktree, and this
  worktree predates `e29665b`. On a loaded host (load ≳45), the perf probe's
  hard-coded 45 s `page.goto` fails here exactly as it does on the base. Bringing
  main into the branch (no conflicts, per the line above) would pick up
  `e29665b`, which lets `HB_PROBE_BOOT_MS` widen that timeout. I did not merge
  main into this branch, as instructed.

## Worktree and branch

`/home/user/hullbreaker/.claude/worktrees/T-102`, branch `task/T-102`.

## Single best next action

Merge T-102: five correctness fixes, each guarded by played-run assertions that
were shown to fail when the behaviour breaks. Before that, fix the merge gate's
transform-slice smoke criterion (the S1 inbox issue). It fails identically on
main, so it would refuse this lane and every other lane on a run that played
cleanly to victory. After the merge, the remaining turn defects a player sees
every time are the 0.96 hand-off pop (R1) and the corner edge voids (R2,
largest on the phone). Both are render-art work, to be iterated against
`tools/playtest/turn-pose-capture.mjs` and these captures. T-107 takes the
post-turn zoom pump (R3) with its camera work.
