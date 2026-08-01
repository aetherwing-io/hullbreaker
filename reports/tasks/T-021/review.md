REQUEST_CHANGES

Reviewed commit `7f24787` on `task/T-021` (diff `main...HEAD`, merge-base `b83b4e5`).
`node tools/pathcheck.mjs` run by this gate against a pristine export of that
commit: **exit 0, 1787 passed, 0 failed.** Layer purity, determinism and the
frozen movement block are clean (`src/pure/split.js` imports only
`config.js`/`path.js`/`traversal.js`; no THREE/document/window, no
`Math.random`/`Date.now`/`performance.now`; `src/config.js` untouched;
`?hook=1` untouched). The pathcheck diff is purely additive — one import block
and one trailing section — no existing assertion was deleted, weakened or
retimed.

Two findings block the merge.

---

**MAJOR — src/render/level.js:42 — three of the four forks render a solid slab
over an unbuilt face, from boot until that face's corner ritual finishes.**

This branch is the first thing to put `solidRects` on the *six-face* level
(`src/pure/split.js:687` `splitApplyForks`, reaching the runtime through
`src/sim/level.js` → `levelData.solidRects`). `src/render/level.js:130-143`
bakes every solid rect into its own `THREE.Mesh` at boot and files it in
`authoredSolidMeshes` — a list whose own comment still reads "traversal-only
tagged solid rectangles". The face-reveal path never touches that list:
`unbuiltHidden()` (`src/render/level.js:42-58`) hides ground tile instances and
`slatMeshes`, and `faceRevealed()` (`:75-88`, called from
`src/sim/wavegate.js:86` in `finishCorner`) brings exactly those two back.

Measured fork placement on this build (`buildLevel(CONFIG, {split:true})`):

| rect | columns | corner | set |
| --- | --- | --- | --- |
| fork-plate-2 / seal-2 | 121-128 | 89 | `farSets[0]` (120-153) |
| fork-plate-4 / seal-4 | 250-257 | 219 | `farSets[2]` (250-283) |
| fork-plate-6 / seal-6 | 382-389 | 349 | `farSets[4]` (380-413) |

So on faces 2, 4 and 6 the plate and seal are visible while the ground beneath
them, and the fork's own span slat, are hidden — a slab hanging in the void
across the corner ritual, which is the one beat `decisions.md` entry 3 is most
protective of ("revealed, never assembled"). The FAR evidence in
`artifacts/t021-split/` is face 1 only, so nothing in the packet can catch it.

Fix is small and local: gate `authoredSolidMeshes` by face in `unbuiltHidden()` /
`faceRevealed()` exactly as `slatMeshes` already are. Verify by running
`tools/playtest/split-capture.mjs 2` and looking at the approach frame before
corner 1's ritual.

**MAJOR — tools/pathcheck.mjs:9102 and docs/proposals/2026-08-split-decision.md:101 —
the "hop takes 4 of 4 without joining the branch" caveat is asserted from a
probe that never records where the hop landed, and it is wrong.**

`took` (`tools/pathcheck.mjs:8916`) counts only whether the capsule left the
array; the `hop` stage (`:8870`) returns to `'plate'` regardless of the surface
it lands on. Neither the note nor the proposal's §3 has any evidence for the
"without joining the branch" half of the claim.

Measured by this gate, driving the unmodified `src/sim/player.js` off fork 1's
plate at 60 Hz, holding jump and spending the air jump at apex (fork 1: plate
58-65 at y=6, span 65-72 at y=9, capsule x=69 y=10.5):

```
take-off x=59.0 .. 62.5  → capsule taken, LANDS ON THE SPAN (y=9)   [joins the branch]
take-off x=63.0 .. 63.5  → capsule taken, lands back on the DECK (y=2, x≈75.6)
take-off x=64.0 .. 65.0  → capsule taken, lands on a y=4 catwalk (x≈76)
```

Most of the plate's take-off window *is* the branch — the hop lands on the span.
The real caveat is a narrow late window (x≈63-65 of a 7-tile plate) that
collects in flight and comes down on the line it never left, which is the I-019
shape the slice half of this file engineers against explicitly
(`tools/pathcheck.mjs:8036`, "touching it and joining the branch are the same
event"). As written the packet overstates the defect and hides its actual
shape, which is exactly the kind of evidence error that drives a wrong operator
verdict. Record the landing surface in the probe and restate both the note and
§3 from that measurement; then the residual late-hop window is a clean operator
question rather than a claim.

---

Minors (not blocking; listed for the record):

- **tools/pathcheck.mjs:8582 / src/pure/split.js:87 — scope.** The superseded
  traversal-slice prototype ships with the branch: `TRAVERSAL_SPLIT` +
  `splitFixture` (`src/pure/split.js:1-468`) and ~550 assertions
  (`tools/pathcheck.mjs:8036-8581`), on a lane the task closes explicitly
  ("Build it in the six-face run, NOT the traversal slice") and `decisions.md`
  entry 13 rules cannot settle this question. It is off by default and green, so
  it harms nothing, but it is permanent maintenance weight on a closed lane and
  it gives `?split=1` two different meanings.
- **tools/pathcheck.mjs:8838 — the fairness probe's daylight is an input, not a
  measurement.** "The wrong branch always gets out with daylight to spare" is
  measured from an authored 30-tile starting margin (`reset(startX, f.y0, 30)`),
  not from the daylight a played run actually reaches a fork with. Disclosed in
  the comment and the proposal, but the headline fairness claim rests on it.
- **tools/pathcheck.mjs:8915 — a reported field that can never carry evidence.**
  `WPN.weaponKey` is not exported by `src/sim/weapons.js`, so `weapon` is always
  `null` in every probe row.
- **tools/pathcheck.mjs:8639 — "the pocket STAYS" is asserted only as
  non-overlap.** Nothing asserts `lvl.pockets` is identical to the default
  build's. The ordering in `src/pure/generator.js` (pockets sited and carved
  before `splitCarveForks`, splice range strictly inside the fork window) makes
  it true today; entry 12 deserves the direct equality assertion rather than an
  inference.

Verified and clean, for the record: the flag is genuinely off (`buildLevel`
fingerprint, `ownsStakes` inert at every pace, `laneCap`/`minLane` both
optional pass-throughs that leave pre-existing rows byte-identical); the fork
never overlaps a pocket, a corner apron or the wave gate's halt line; nothing
authored spawns inside a seal and the `sealSweep` probe drives the real spawner
to prove it; the sim-driven three-policy currency test is real (main 0/4 taken,
reward 4/4, dead end −9.9 tiles of daylight and +2.3 s on every fork); the
playtest scripts and `tools/playtest/README.md` are honest about the harness's
inability to select a branch, and `split-capture.mjs` is explicit that RIG is
parked, not played.

Integration note, not a finding: at review time the worktree carried a
half-applied merge of `main` (T-022 momentum) whose `tools/pathcheck.mjs` does
not parse (`SyntaxError: Unexpected end of input` at :9650). The reviewed
commit is green on its own; the merged result needs re-running before the gate.
