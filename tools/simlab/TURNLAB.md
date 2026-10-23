# turnlab — the shipped corner turns, played headlessly (T-102)

`turnlab` drives the **default six-face run** (no fixture; momentum, CHARGE,
HULL FALLBACK, aim assist and hit-stop all on, exactly as shipped) through
all five turns and the Crown approach with closed-loop player policies, and
checks every tick against the turn contract. It exists because the operator
reported that the turns "don't quite work right all of the time" and the
existing turn assertions were about authored intent, not about play.

Zero effect on the shipped game: it imports `src/` read-only. No
dependencies. (This file sits beside `README.md` instead of inside it only to
keep a concurrent lane's README edit conflict-free; fold it in at will.)

| file | what it does |
| --- | --- |
| `lib/sixface-host.mjs` | boots the real sim modules in a fresh process; transcribes `src/main.js` `update()` / `resetGame()` and the sim rows of `src/boot/run-reset.js` (render calls dropped, legal by the bridge contract); replicates as pure math the three render quantities a turn's correctness lives in: the screen-edge calibration (`render/camera.js` `calibrateEdges`), the camera ratchet's yaw and facing facet, and the camera pose + projection (for framing). |
| `lib/turn-proof.mjs` | the policies, the oracle / visible-only gunners, and the per-tick invariants (below); `collectPoses()` for the posed browser captures. |
| `turnlab.mjs` | CLI: `run`, `matrix`, `poses`, `list`. |
| `turnlab-falsify.mjs` | mutation proof that every guard binds: copies the tree to a scratch dir, breaks one thing per row (P* rows revert one T-102 fix; M* rows break behaviour that was already right), runs the guarding check, prints a table. Never edits the worktree. |

```sh
node tools/simlab/turnlab.mjs list
node tools/simlab/turnlab.mjs run --policy die-at-hinge --viewport desktop
node tools/simlab/turnlab.mjs matrix --jobs 3                # every policy x 4 viewports
node tools/simlab/turnlab.mjs run --policy run --viewport phonePortrait --query fallback=0
node tools/simlab/turnlab.mjs run --policy run --viewport phonePortrait --gunner paced --pace 1400 --max-ticks 21600
node tools/simlab/turnlab.mjs poses --viewport phoneLandscape > /tmp/poses.json
node tools/simlab/turnlab-falsify.mjs                         # 33 rows (T-201: P4 -> Z1, N1-N8); minutes
node tools/simlab/turnlab-falsify.mjs --fast-domain --only P1,P2,P3   # the per-edit tier binds
```

The gate is `tools/pathcheck/t-102-corner-turns.mjs`, which runs inside
`node tools/pathcheck.mjs` in one of two tiers:

- **full** (default): the static guards plus all 50 played runs (T-102's 41,
  plus T-201's: a never-firing run at three viewports, the held-gate escape
  hatch `?gates=legacy&follow=0` with the paced gunner at three viewports and
  `?gates=legacy` at 1280x720, and `?hinge=flow` at two). About 4.5 minutes on
  a loaded 4-core host (T-201 measured 267 s at load 40-49);
- **per-edit** (`HB_GATE_FAST=1`): the same static guards plus 5 of the 50
  played runs, one per fixed defect that only a played run can catch, and the
  operator's device: `die-at-hinge` @1280x720 (D1), the paced visible-only
  gunner @390x844 (D2's successor under rolling corners: never wait, every
  staged body in frame), `resize-approach-late` @260x1000 (D3), `run`
  @844x390, and (T-201) a never-firing `run` @844x390. It prints one
  `SKIP t-102-corner-turns: 45 of 50 …` line, and the skipped runs are not
  counted as passes. Its runs are drawn from the full matrix, with the same
  options as their full-matrix twins.

`turnlab-falsify.mjs --fast-domain` uses that whole per-edit domain as every
row's guard. It first checks the tier is green on the unbroken copy, then
counts a row as red only on a FAIL line naming the row's own violation.

Children exit on their own if their parent dies (`process.ppid` is checked
every 600 ticks). The per-edit hook `kill -9`s a pathcheck that outlives its
watchdog, and an orphaned run would otherwise play on to its tick cap.

## Policies

`run` (hold right, gap-jump reflex — since T-201 it also jumps off a catwalk
end that drops toward a hole and spends the air jump falling over one, because
under the follow-lead RIG runs whole sides at the frozen run speed instead of
riding the scroll at the right clamp), `jump` / `jump2` (cross the bend on a
jump / mid double-jump), `idle` (stop for 4 s once the gate opens),
`backtrack` (hold left for 3.3 s from the turn's first tick),
`backtrack-approach` (walk away from the bend after the clear),
`die-at-hinge` / `die-mid-turn` / `die-after-turn` (lethal hit on the turn's
first tick / at 500 ms / 300 ms after it completes), `stock-life-at-hinge`
(the same with the fallback streak exhausted; run it with `--query
fallback=0` for the pure stock-lives tier), `hit-mid-turn` (a 1-hp hit at
300 ms), `pause-mid-turn` (90 paused frames at 450 ms), `resize-mid-turn`,
`resize-gate`, `resize-approach`, `resize-approach-late` (orientation /
window changes at each phase), `drop-at-hinge` (down+jump across the bend),
`pop-weapon-at-hinge` (a carried gun knocked loose on the apron).

Hits are applied inside the frame where a hostile's contact damage lands
(`hooks.afterPlayer`), never between frames, so relocations are classified
on the tick they happen.

**Gunners.** `oracle` (default) kills every body `reactionMs` (350) after it
solidifies, through the real death path (`forceBreakHostile` →
`destroyHostile` → `removeHostile` → `onHostileRemoved`). `paced` kills one
body per `paceMs`, and only a body that is materialized, on the camera-facing
facet and inside the projected frame — so a body the player cannot see
genuinely holds its gate. `none` (T-201) never kills and never even holds the
fire key: the no-softlock proof for corners that never wait. All are reported
in every summary; `god` (on by default) tops up hp so every run reaches all six
corners.

**Two corner lifecycles (T-201).** The default run's corners are ROLLING
(decisions.md entry 23 #2: the turn never waits; the side's encounter plays on
the move and its mobile bodies follow RIG onto the next side); `?gates=legacy`
restores the held gate. Every summary carries `rolling`. The gate family below
is asserted on held-gate runs only; on rolling runs the never-wait family
replaces it (`tools/pathcheck/t-102-corner-turns.mjs` `familiesFor`).

## Invariants (per tick)

| family | violation kinds | bound |
| --- | --- | --- |
| envelope | `teleport`, `popAfterRelocation`, `relocateOutsideOwnedRoute` | `|dx| <= max(runSpeed, wallJumpX, ledgeLaunchX, knockbackX, fallback tossVx, scroll x hardCeilMult) * dt`, `|dy| <= max(jumpVel, airJumpVel, -terminalVel, wallJumpY, ledgeLaunchY, knockbackY, |tossVy|) * dt`, plus the ledge/ladder snap allowance only on a tick whose traversal state changed; all from `CONFIG`. A respawn/fallback must land inside `cornerPlayerRouteWindow` and the next two ticks must stay inside the envelope. |
| hinge | `hingeFallThrough`, `hingeFallDeath`, `capsuleThroughDeck` | feet never cross below a solid apron deck top (−0.05); no fall death within a tile of an apron; no pickup sinks into a solid column |
| gate (held gates: `?gates=legacy`) | `gateShutWithKillConditionMet`, `haltedButIdle`, `gateBlind`, `hudLastButMore` | the gate opens on the same tick its last gating body dies; a corner never sits `idle` at its halt; a shut gate never shows nothing of its encounter (present, on-facet, on-screen) for longer than one 900 ms entrance beat (`CONFIG.wasp.enterMs`); LAST SIGNAL only when one kill opens it |
| neverWait (rolling corners, the default) | `turnWaitedAfterArrival`, `haltedButIdle`, `beatOverBound`, `stagedOutsideView`, `carriedInvisible`, `carryLost`, `hudTooLong`, `hudBrokenButAlive`, `gateStateInRolling` | RIG presses into a CLOSED joint (corner idle or held) for at most 200 ms (T-201 box: 0.2 s plus the ritual); the halt always arms; no beat waits more than 6 s for the one before it; every encounter body and every follower starts condensing on the camera-facing facet, inside the projected frame, and (landscape) >= 6 tiles inside the damage plane; every body that followed RIG round corner k re-entered before corner k+1 turns; the encounter line fits 28 characters and never says BROKEN while a body of it lives; a rolling corner never enters `gate` |
| turn | `approachAtBendNoTurn`, `turnWithoutRigAtBend`, `turnSkippedApproach` | `approach` + RIG at `BEND_S` turns on that tick; a turn starts only from `approach`, with RIG exactly on the bend |
| facet | `playerFacetBackwards`, `cameraFacetBackwards`, `rigCulledByFold` | facets never decrease within a run; `render/player.js` `foldVisibility()` is 1 on every PLAYING tick |
| ratchet | `ratchetOutOfEnvelope`, `ratchetBaseMismatch`, `cameraYawJump`, `scrollBackwards` | yaw within `[windUpDeg, 60 + 5%]` per corner and exactly `k x 60` after k corners; no per-tick yaw step beyond the curve's own steepest step at this dt; the scroll never decreases |
| framing | `rigOffScreen` | RIG's chest NDC never exceeds `max(1, flat-face clamp NDC) + 0.02` (see limitation 4) |

## Honesty / limitations

1. **A transcription can drift.** `update()`, `resetGame()` and the reset
   registry are copied, not imported. The pathcheck domain re-reads
   `src/main.js`, `src/boot/run-reset.js` and `render/camera.js`'s
   `PORTRAIT_SAFE` and fails on any drift (falsified: rows M15–M17).
2. **The camera is a replica.** Yaw, facing facet and pose are recomputed from
   the same pure curves and the same bridge hook the renderer uses; the posed
   browser captures cross-check yaw and facing facet against the live page at
   every frame (0 disagreements recorded in the T-102 captures).
3. **The oracle is a perfect shot.** Proofs about the turn are not proofs
   about the fight. Outcome distributions (who survives which gate) are out of
   scope here — see the T-104 race lab.
4. **The framing bound is relative.** On a flat face RIG pinned at the right
   clamp already renders with its chest at NDC ≈1.012 at 1280x720 (edges are
   calibrated on the z = 0 route plane; RIG draws 1.15 tiles toward the
   camera). That general clamp fact is reported separately; this lab only
   asserts that a turn never makes it worse.
5. **Viewports are calibrated analytically** (`edgesForViewport`), not probed;
   portrait/landscape/desktop/narrow (260x1000) only.
6. **`drop-at-hinge` cannot drop through anything** in the shipped lattice:
   every joint apron (`[cornerS-6, cornerS+3)`) is flat solid ground with no
   catwalk, ladder or solid rect. The policy still crosses on a jump.
7. **(T-201) The frame after a turn is skewed until the scroll crosses the
   bend.** `render/camera.js` anchors the view at the scroll; after a turn the
   anchor stays on the departing facet until the scroll passes the bend, so the
   sim's `[left, right]` strip overstates what is drawn on the arriving facet
   (about 0.6 tiles per tile of lag on landscape views; measured with the
   camera replica in this lab). The rolling encounter therefore stages nothing
   — no beat, no follower — until the scroll has crossed the last bend, and the
   never-wait family checks every staged body against the PROJECTED frame, not
   the strip. If `render/camera.js` changes how it anchors after a turn (T-107's
   `?orbit=joint`), re-measure.
8. **(T-201) God mode can make an impossible crush.** With hp topped up every
   tick, a RIG stuck in a pit against a wall is crushed by the damage plane
   forever, and the plane's crush pin (`src/sim/player.js`: RIG pinned at the
   wall's outside face) moves RIG a whole tile whenever the plane crosses a
   column — which the envelope family reports as a teleport. In real play the
   crush kills in three frames (or HULL FALLBACK relocates). T-201 met this once
   (stock-life-at-hinge?fallback=0 @1280x720, after the old gap reflex fell into
   face 4's pocket pit at full speed) and fixed the policy, not the check; the
   envelope family still does not classify the crush pin as a designed
   relocation (reported as an inbox issue).
