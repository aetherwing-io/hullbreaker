REQUEST_CHANGES

Reviewed `task/T-021` at **71fd90b** (diff `main...HEAD`, merge-base `debdc28`),
including the two untracked artifacts. `node tools/pathcheck.mjs`, run by this
gate against a pristine `git archive` export of that commit: **exit 0, 1869
passed, 0 failed.** Browser smoke run by this gate against a served copy of the
worktree (playwright-core, 1440x900): `index.html?selftest=1` **SELFTEST PASS
(29 checks)**, `index.html?split=1&selftest=1` **PASS (29)**,
`index.html?slice=traversal&split=1&selftest=1` **PASS (31)**, zero page errors
on all three.

The four acceptance boxes this pass was dispatched to verify all hold:

- **`?split=1` assertions run on the `?split=1` build.** The static half builds
  `buildLevel(CONFIG, {split:true})` explicitly (`tools/pathcheck.mjs:8613`),
  and the sim probe's child sets `__HB_QUERY__='split=1'` and is pinned by a
  subject guard (`:9138`) that requires the child's own
  `SPLIT_FORKS_ENABLED === true` plus fork-for-fork, height-for-height identity
  with the forks asserted above, and a second guard (`:9187`) requiring
  `7 x forks` runs so no `.every()` can pass over an empty set. The vacuous
  class the task named is closed.
- **The falsifying trio holds through the shipped sim.** Main 0/4 capsules and
  finishes on `weapon === 'R'`; reward 4/4, carrying each fork's own letter,
  every pickup taken forward of `spanX0` in flight or on the span; dead end
  −9.9 tiles of daylight and +2.3 s on every fork, and its escape floor is now
  swept (`marginFloor`) instead of resting on the probe's authored 30.
- **FAR screenshots exist and match the text.** I opened them: `face1-approach`
  carries plate, slot, span and capsule in one frame; `face1-cave` has RIG under
  the plate against the seal; `face1-span` has RIG on the span with the capsule
  in shot; `face2-zip-gate` shows the halt line with face 2 unbuilt and nothing
  hanging over it.
- **Flag off by default leaves the run unchanged.** Generator fingerprint
  equality, `base.solidRects === undefined`, pocket-array identity, no
  `minLane`/`laneCap` row in the default spawn table, `ownsStakes` inert at
  every pace, `splitForks` empty in `src/sim/level.js` and `src/main.js`. Layer
  purity and determinism are clean: `src/pure/split.js` imports only
  `config.js`/`path.js`/`traversal.js`, no THREE/document/window, no
  `Math.random`/`Date.now`/`performance.now`, no rng consumed by fork siting,
  and `src/sim/spawner.js` keeps both seeded draws in their original order
  (`minLane` is applied after the draw as a floor). `CONFIG`'s movement block is
  untouched; `?hook=1` untouched. The committed pathcheck diff has **zero**
  deleted lines — nothing was weakened or retimed to get green.

One finding blocks.

---

**MAJOR — docs/proposals/2026-08-split-decision.md:101 — the write-up still
states a caveat this same commit's harness measures as false.**

§3's last bullet reads "a plate-line policy that hops for no reason takes 4 of 4
capsules without joining the branch". `tools/pathcheck.mjs` at this HEAD now
measures where the hop lands and prints the opposite: all four hop *policy* runs
come down on the **span**, which is joining the branch, and the 52-take-off
sweep finds that only the last ~2.5 tiles of each 7-tile plate (`+5..+7` past
the commit line, on all four forks) collect without joining — asserted at
`tools/pathcheck.mjs:9294` ("a hop taken in the first 4 tiles of the plate lands
on the SPAN every time") and `:9300`. The previous gate's finding required both
the note *and* §3 restated from that measurement; the note was fixed, §3 was
not, so the branch now ships a harness and a packet that contradict each other,
with the packet overstating the defect. The proposal is the artifact the
operator reads before answering the five feel questions in §7, and this bullet
misdescribes the shape of the thing being judged. It is a three-line edit:
restate it as the narrow late window the sweep found.

---

Minors (not blocking; listed for the record):

- **docs/proposals/2026-08-split-decision.md:154 — §6 is now inaccurate.** "The
  only runtime change outside `src/pure/` is one optional pass-through in the
  spawn director" was true at `91eb352`; `71fd90b` adds a render-layer change
  (`src/render/level.js:25,68,100` — authored solids gated by face). The section
  should name it, and §6's "does not touch" list should say `src/render/` is
  touched.
- **docs/proposals/2026-08-split-decision.md:83 vs tools/playtest/README.md:844
  — two different clocks for the same run.** The proposal says the dead-end bot
  loses its first life "10.5 s into the run"; the README, committed later for
  the same script and the same column (x=63.649), says 12.9 s. One is stale.
- **docs/proposals/2026-08-split-decision.md:137 — frame caption drifted from
  the rig.** `face1-span.png` is described as "at the capsule"; `split-capture.mjs`
  deliberately parks RIG **2.5 tiles short** so standing on it does not collect
  it (`tools/playtest/split-capture.mjs:99`, and `frames.json`'s own note).
- **docs/proposals/2026-08-split-decision.md:48 and tools/pathcheck.mjs:8812 —
  the probe does not drive `src/sim/scroll.js`.** Both say it drives "player,
  scroll, spawner, hostiles, capsules"; the probe advances the edge itself with
  `T.setScrollX(T.scrollX + C.scrollSpeed * dt)` (`:8972`, `:9031`, `:9074`) and
  never imports `scroll.js`. It is faithful for the shipped six-face run (no
  camera-follow there, `?momentum=1` off by default, corner events forced done
  on purpose), so this is a wording fix, not a measurement error.
- **tools/pathcheck.mjs:9253 — the fairness threshold is argued against a clamp
  that is not what produced the number.** "a fifth of the 41 the screen clamp
  lets a forward runner bank": the player right clamp at FAR is
  `sRightEdge() - 0.4` (`src/sim/player.js:467`), i.e. roughly 71 tiles of
  daylight, and the 40.6 in the probe is simply what a 21-tile fork window from
  a 30-tile start yields. The `dead <= 15` floor claim stands on its own; the
  comparison sentence should not borrow a clamp.
- **src/pure/lattice.js:222-241 — the density metric now credits a surface
  nobody can stand on.** `latticeSurfacesAt`/`latticeBands` push `r.y1` for
  every solid rect, including the fork seal (`y0..y0+3`) whose top is buried
  directly under the plate (`y0+3..y0+4`): column 64 reports surfaces
  `[2, 5, 6]` and `bandMerge` 0.9 keeps 5 and 6 apart. Route counts stay in the
  3-5 band with the flag on (f6 reads 3-4) and the default build is untouched,
  but it is a phantom route band in a metric this repo's own doctrine says must
  assert what a player can do.
- **artifacts/t021-split/face2-zip-gate.png — the render gate's evidence stops
  one tile short of its subject.** Disclosed in `71fd90b`'s own message: the
  frame's right edge falls at world x~120.7 and fork 2's plate starts at 121, so
  no frame shows a *fork* gated with its face. The pathcheck guard for it
  (`tools/pathcheck.mjs:8727`) is a source-text regex over `unbuiltHidden`/
  `faceRevealed`, which proves the identifier is wired in, not that the meshes
  hide. Both are honest about it; the gap is real and only reachable under
  `?zip=1` (`IS_G1` short-circuits both hooks on every shipped URL).
- **Scope, carried unchanged from the previous gate:** the superseded
  traversal-slice prototype (`src/pure/split.js:87-468` plus ~550 assertions at
  `tools/pathcheck.mjs:8036-8581`) still ships with the branch, on a lane
  `decisions.md` entry 13 closed, and it gives `?split=1` two different
  meanings depending on `?slice=`. Off by default and green, so it harms
  nothing today.

Verified and clean, for the record, beyond the acceptance boxes: the fork never
overlaps T-009's pocket, a corner apron, a bend or the wave gate's halt line
(fork 1 ends at 74 against a halt line of 75, asserted); the cave is floored,
roofed and sealed and nothing the run spawns materialises inside it
(`sealSweep` drives the real spawner the length of the level); the ambient lane
floor is a floor, not a lane assignment, so rng order and cadence are preserved;
route density and the reachability/stranding sweeps hold with the flag on; the
three `split-*.json` scripts and `tools/playtest/README.md` are explicit that
the harness's terrain probe is blind to `solidRects` and therefore cannot select
a branch; `split-capture.mjs` is explicit that RIG is parked, not played, and
that a parked frame proves nothing about standability.

Process note, not a finding: `71fd90b` landed in this worktree **during** this
review, authored by a fix agent from an older, believed-closed T-021 dispatch —
the shared-worktree hazard `docs/ORCHESTRATION.md` documents. Its content is
exactly the diff I had already reviewed as uncommitted work (render gate,
pocket-identity equality, plate sweep, margin floors, `currentWeapon`, the
capture rig's i-frame fix), it is green at 1869/0, and the commit message
records the provenance. Nothing else came in with it. Re-verify HEAD has not
moved again before merging.

Operator questions this gate is not entitled to answer (they belong in the
checkpoint packet, and §7 of the proposal already carries them): whether the
sealed slot reads as a risk at FAR before the commit line, whether ~10 tiles of
daylight plus a doubled time-in-reach is the right price, and whether a free
capsule one late hop off the plate cheapens the fork.
