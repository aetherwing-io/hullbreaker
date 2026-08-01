APPROVE

Gate: `node tools/pathcheck.mjs` in the worktree → 847 passed, 0 failed
(main checkout today: 741 → +106 new assertions, none deleted or weakened;
pathcheck's only `-` lines are import-list reflows). Worktree clean, no
untracked files. Flags-off contract verified by reading the fall-through
paths, not only by assertion: with no `?g2=1`, `transformHaltS`,
`transformSeamPull`, `transformScrollOffset`, `buildTransformLevel`,
`buildCover`, `applyCover`, `buildRibs` and the spawner's hound branch all
resolve to the shipped v1 behavior. Layer purity, determinism (no new
`Math.random`/`Date.now`/`performance.now`, 2D `(s, y)` intact), the
static-anatomy rule (only the tagged plate moves; ribs/scutes/decks are baked
once), the zero-altitude ritual, frozen CONFIG constants, and `?hook=1`
inertness all hold. No BLOCKER or MAJOR findings.

src/mode.js:28 — MINOR: `IS_G2` is unscoped, so `?slice=traversal&g2=1` sets
`IS_TRAVERSAL_SLICE` and `IS_TRANSFORM_SLICE` both true — collision comes from
the traversal fixture while `ACTIVE_FIXTURE`, the scroll runtime and the
render bake come from G2 (mismatched/invisible surfaces). Unreachable from any
documented URL, but every other prototype flag here is defensively scoped
(`HOOK/FLOW/AUTOBOUNCE` behind `IS_TRAVERSAL_SLICE`, `IS_G1` behind
`ACTIVE_FIXTURE === null`); one `QUERY.get('slice') !== 'traversal'` clause
would match the convention.

src/sim/spawner.js:48 — MINOR: the fixture hound spawns at `groundTopAt(s.x)`
(the raw deck) while the established hound convention derives spawn height as
`deck + CONFIG.hound.rideY` (src/pure/traversal.js:849), so the frame
materializes 0.45 tiles low and hugs up — cosmetic today. Same line:
`groundTopAt` returns `-999` over a gap, so a future fixture authoring a hound
above an authored gap would leave a permanently un-decked `gating: true`
hostile; nothing asserts a hound's own column has ground (the new
patrol-continuity check, tools/pathcheck.mjs:2565, covers this fixture only
incidentally).

tools/playtest/README.md:546 — MINOR: harness README stale against the
"tool's own README updated" DoD — still says "Seven scripts are committed
under `scripts/`" (now nine), and its file-tree inventory (line 779) documents
`transform-capture.mjs` but not the new sibling `g2-capture.mjs`. The honesty
note itself does exist, just not there (g2-capture.mjs:11-18,
artifacts/g2-neck-flip/README.md "Honesty notes").

src/ui/hud.js:114 (with src/ui/overlay.js:77) — MINOR: both hardcode the v1
demo's two-turn copy, so `?g2=1` (one event) reads "1/2 TURNS" and "1 of 2
transformations" after the flip, visible in the committed frames.
Builder-flagged in artifacts/g2-neck-flip/README.md as a lane fence but not
filed in SPRINT's Inbox; `ACTIVE_FIXTURE.events.length` is the fix when those
files are unfenced.

src/pure/transform.js:378 — MINOR: `TRANSFORM_FIXTURE`/`TRANSFORM_PATH`/
`TRANSFORM_BEND_S` are now mutable exported bindings reassigned by
`selectTransformFixture()` from src/mode.js:33. Correct today — every module
that snapshots one at module-body time (src/sim/transform.js:29,
src/sim/spawner.js:24, src/sim/weapons.js:36, src/sim/hostiles.js:57,
src/mode.js:66) also imports `../mode.js`, which forces mode.js's body to
evaluate first — but the invariant is comment-only. A static guard ("any src
file importing a live transform binding must also import mode.js") would stop
a future module silently snapshotting v1 under `?g2=1`.

Operator questions, not blockers (already queued, SPRINT.md:320-333 with the
`?g2=1` URL): the 14-tile apron makes the ritual pull travel 16 tiles in the
same ~990 ms where v1 pulled 11; the relocked plate's rake to the interior
grade; five-route readability at the FAR default.
