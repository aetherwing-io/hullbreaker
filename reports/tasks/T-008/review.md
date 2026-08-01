APPROVE

Re-verify review of task/T-008 @ 66b13d0 (merge-base f759439; main merged in at 6a88dd8).
Scope: full `git diff main...HEAD` (24 files), with focus on the one new commit 66b13d0
"G2 pressure script: knockback recovery + pocket-scoped pinned (no fixture change)".
Worktree clean, no untracked files. Gate run by the reviewer inside the worktree:
`node tools/pathcheck.mjs` → **881 passed, 0 failed**, exit 0.
No BLOCKER or MAJOR findings. All MINORs below; the five from the first review are carried
forward unchanged (none were in the fix scope, none regressed).

## Regression diagnosis: verified as (b) — a script defect; the fixture is untouched

Every load-bearing claim in 66b13d0 checks out statically:

- `git show 66b13d0 --stat` touches only `tools/playtest/README.md` and the two
  `tools/playtest/scripts/g2-neck-flip*.json`. No fixture geometry, no spawn table, no
  CONFIG, no `src/` change — "fix the script, not the fixture" is literally true.
- `pinned` really is true at every respawn: `tools/playtest/lib/policy.mjs:64` defines it as
  `grounded && |vx| < 0.3 && (ArrowRight|ArrowLeft held)` — all three true on the first tick
  after a reset while the script holds right. Scoping it to x125.5–130.5 removes the retry
  trap and still covers the 126–129 dare pocket and rib-a at x130.
- I compiled both policies offline against `lib/policy.mjs` and probed three states: the
  pocket rule fires at x=128 and **not** at the x=93.5 spawn; the new `!grounded && vx<-1`
  fires only on the airborne-negative-vx (knockback) sample; no missing-field warnings —
  `vx` is a real sample field (`tools/playtest/lib/sampler.mjs:91`).
- The knockback reflex cannot mask a defect, because it spends only in-game resources:
  `src/sim/player.js:526` sets `vx = away * knockbackX` (`src/config.js:87` knockbackX 6,
  iframesMs 1200) and `damagePlayer` never touches `airJumpsLeft`, so after a *ground* jump
  RIG genuinely still holds `airJumps: 1` (`src/config.js:73`). Hitstun locks horizontal
  drive only (`src/sim/player.js:235-240`), not the jump path, and the tap re-buffers after
  `clearJumpBuffer()`. With no air jump left the rule changes nothing — it gives the bot
  exactly the recourse a human has, which is the opposite of an easier script.
- "Main's newer enemies never reach this fixture" holds: G2's `spawns[]` authors only wasps
  plus one hound; the polyps live solely in `bands[].threatSockets`, read only by
  `src/render/transform.js:195` (render dressing — no `spawnHostile` path).
- Retracting the earlier "completed, attempts 1, falls 0" as a lucky draw is the honest call
  and matches the harness's own documented residual variance under `--deterministic`
  (`tools/playtest/README.md:206-241`).
- The README honesty note (`tools/playtest/README.md:128+`) documents the retry trap for the
  next script author instead of burying it. That is the behavior this gate wants.

## Hard-rule sweep on the full diff (re-checked, not inherited)

Layer purity (`src/pure/transform.js` has no THREE/document/window, no upward import;
sim→render only through `src/sim/bridge.js`; the new static guard asserts the sim source can
never read `plateRamp`/`seatRake`/`.gate.`). Determinism (no `Math.random`/`Date.now`/
`performance.now` added under `src/pure` or `src/sim` — the only `Date.now` in the diff is
dev-only `tools/playtest/g2-capture.mjs`; sim stays 2D `(s, y)`; the hound rides the seeded
`hostileRng`). Static anatomy (only the declared `access-plate` moves; ribs are baked once in
`buildRibs`; the plate rake is render dressing over the static carried deck). Frozen CONFIG
untouched (`G2F.movement === undefined` asserted). `?hook=1` inert. `?g2=1` off by default,
every other URL byte-identical to v1. Test honesty: no assertion deleted or weakened — the
only `-` lines in pathcheck are an import-list reflow; +445 lines of new assertions cover
reachability, gap width/landing strips, dare-pocket retreat timing against the frozen jump
physics, connector/exit continuity, and a key whitelist that blocks a drive-by choreography
override. Perf: no new per-frame allocation. Scope: stays in the T-008 lane; no runtime deps,
no build step, no OSTK artifacts; the SPRINT operator packet (5 questions) is intact.

## Findings (MINOR only)

tools/pathcheck.mjs:2581 — MINOR (new): the "authored pressure" section asserts spawn
ordering, seam-clear distance, apex-lane proximity and hound patrol containment, but nothing
binds ambient spawn placement to the *mandatory* gaps — which is exactly the relation behind
this task (the x106 lane-4.2 wasp diving back across the required 100–102 teach gap). The
fixture's fairness there is argued only in prose in the script description. Suggest an
assertion pairing each mandatory gap with the wasps whose authored lane can reach its
crossing arc, so the invariant cannot silently regress on a table retune. Not a blocker: this
diff does not change the placement, and whether that contest is fair is a feel call.

artifacts/g2-neck-flip/README.md:55 — MINOR (new): "the same route the committed
`tools/playtest/scripts/g2-neck-flip.json` proves deterministically" now overstates the
harness guarantee, given this task established that a committed script in this family can
fork run-to-run on both trees under `--deterministic`. `tools/playtest/README.md:206-241` is
the honest reference; "proves across repeated runs" (with the run count) would match it.

tools/playtest/scripts/g2-neck-flip-pressure.json:3 — MINOR (new): the diagnosis evidence
(the pre-merge control run extracted at 44a55c0, the 6× post-fix runs) exists only as prose
in the 66b13d0 commit message and this description. Nothing under `reports/` or `artifacts/`
carries the numbers, so the "not a merge regression" claim is not re-auditable from the tree.
Suggest recording the control-run figures alongside the operator packet.

src/mode.js:29 — MINOR (carried): `IS_G2` is unscoped, so `?slice=traversal&g2=1` sets both
`IS_TRAVERSAL_SLICE` and `IS_TRANSFORM_SLICE` — collision from the traversal fixture, but
`ACTIVE_FIXTURE`/scroll runtime/render bake from G2. Unreachable from any documented URL, but
every sibling prototype flag here is defensively scoped; one
`QUERY.get('slice') !== 'traversal'` clause would match the convention.

src/sim/spawner.js:48 — MINOR (carried): the fixture hound spawns at `groundTopAt(s.x)` (raw
deck) while the established convention is `deck + CONFIG.hound.rideY`
(`src/pure/traversal.js:849`), so the frame materializes ~0.45 tiles low and hugs up —
cosmetic here. Same line: `groundTopAt` returns `-999` over a gap, so a future fixture
authoring a hound above an authored gap would leave a permanently un-decked hostile; nothing
asserts a hound's own column has ground.

src/pure/transform.js:378 — MINOR (carried): `TRANSFORM_FIXTURE`/`TRANSFORM_PATH`/
`TRANSFORM_BEND_S` are mutable exported bindings reassigned by `selectTransformFixture()`.
Re-verified correct today — every module that snapshots one at module-body time
(`src/sim/transform.js:29`, `src/sim/spawner.js:23`, `src/sim/weapons.js:36`,
`src/sim/hostiles.js:57`, `src/mode.js:66`) also imports `./mode.js`, forcing mode.js's body
(and the selection call) to evaluate first — but the invariant is comment-only. A static
guard ("any src file importing a live transform binding must also import mode.js") would stop
a future module silently snapshotting v1 under `?g2=1`.

tools/playtest/README.md:559 — MINOR (carried): still says "Seven scripts are committed under
`scripts/`" and the file-tree inventory still omits the new `g2-capture.mjs` sibling. The new
`pinned` honesty note landed in this commit; the inventory did not.

src/ui/hud.js:114 (with src/ui/overlay.js:77) — MINOR (carried): both hardcode the v1 demo's
two-turn copy, so `?g2=1` (one event) reads "1/2 TURNS" / "1 of 2 transformations" after the
flip, visible in the committed frames. Builder-flagged in
`artifacts/g2-neck-flip/README.md` as a lane fence but never filed in SPRINT's Inbox;
`ACTIVE_FIXTURE.events.length` is the fix once those files are unfenced.

## Operator questions (not blockers, reviewer scope)

1. The x106 lane-4.2 wasp's dive envelope reaches back across the mandatory 100–102 *teach*
   gap. DESIGN gives the wasp that job ("contests open crossings and predictable jump arcs")
   and the game's answer is the held air jump under 1200 ms of iframes — but whether the
   first teach gap should be the contested one is a feel call.
2. Two of the six post-fix pressure runs still took one death at the hound's x129 landing lip
   and finished anyway. Is that the intended cost of the dare-pocket rejoin?
3. The three packet questions already queued at SPRINT.md:320-333 (16-tile pull in the same
   ~990 ms, the plate's rake to the interior grade, five-route readability at FAR) stand.
