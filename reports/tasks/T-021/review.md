APPROVE

SECOND PASS. Reviewed `task/T-021` at **bb6bdd1** (diff `main...HEAD`,
merge-base `debdc28`; working tree clean, no untracked files). Gates run by this
gate, in the worktree:

- `node tools/pathcheck.mjs` → **exit 0, 1887 passed, 0 failed** (was 1869/0;
  +18 assertions, and the committed pathcheck diff still has **zero** deleted
  lines — nothing was weakened or retimed to get green).
- Browser smoke against a curl-proven pin of the worktree (playwright-core,
  1440x900; served copy's `src/pure/split.js` md5 matches the HEAD blob):
  `index.html?selftest=1` **SELFTEST PASS (29 checks)**,
  `?split=1&selftest=1` **PASS (29)**, `?slice=traversal&split=1&selftest=1`
  **PASS (31)**. Zero page errors on all three.
- The three `split-*.json` scripts, `--deterministic` against that pin: all
  three run and report cleanly (the only `pageErrors` entry is a
  keyboard-teardown message after the browser closes). Their metrics
  corroborate the README's own characterisation rather than contradicting it —
  idle 0.257 / 0.251 / 0.088 and vertical range 7.96 / 8.09 / 12.04 for
  dead-end / main-line / reward-branch.

**The MAJOR from the first pass is fixed.** `docs/proposals/2026-08-split-decision.md:101`
no longer claims a hopping plate-line policy "takes 4 of 4 capsules without
joining the branch"; it now states what the harness measures — every take-off
reaches the free capsule, all four hop-policy runs and every take-off in the
first 4 tiles of plate land on the **span**, and only the last ~2.5 tiles
(+5..+7, 20 of 52 swept) collect without joining. That restatement matches the
two assertions that gate it (`tools/pathcheck.mjs:9417`, `:9424`) and the
printed sweep note. All six first-pass minors are addressed as well: §6 now
names `src/render/level.js` as the second runtime change outside `src/pure/`;
both the write-up and `tools/playtest/README.md` now quote the repeating column
(x=63.649) and refuse a per-script clock; the `face1-span` caption says the rig
parks 2.5 tiles short; the PLAYED-NOT-DERIVED header names the edge
substitution instead of claiming it drives `src/sim/scroll.js`; the fairness
threshold no longer borrows a clamp figure; the phantom route band is gone from
`src/pure/lattice.js` and the real one-column thinness it hid is asserted as a
bounded exception with its arithmetic; and `face2-zip-gate.png` was reshot wide
with `subjectInFrame` recorded, plus a five-frame `face1-zip-*` built-half
control.

The acceptance boxes, re-verified rather than inherited:

- **`?split=1` assertions run on the `?split=1` build.** The static half builds
  `buildLevel(CONFIG, {split:true})` (`tools/pathcheck.mjs:8614`); the sim probe's
  child sets `__HB_QUERY__='split=1'` and is pinned by a subject guard
  (`:9221`) requiring the child's own `SPLIT_FORKS_ENABLED === true` plus
  fork-for-fork, height-for-height identity with the forks asserted above, and a
  run-count guard (`:9260`) requiring `7 x forks` runs so no `.every()` can pass
  over an empty set.
- **The falsifying trio holds through the shipped sim.** Main 0/4 capsules,
  finishing on `weapon === 'R'`; reward 4/4 carrying each fork's own letter,
  every pickup taken forward of the commit line in flight or on the span; dead
  end −9.9 tiles of daylight and +2.3 s on every fork, with its escape floor
  swept (`marginFloor`) rather than resting on the probe's authored 30. The
  probe's policies really traverse (`ok` requires reaching `f.x1 - 1`, and a
  failed climb stalls against the seal).
- **FAR screenshots exist and show what the text claims.** I opened them:
  `face1-approach` carries plate, slot, span and capsule in one frame with RIG
  visible on the deck; `face1-cave` has RIG under the plate against the seal;
  `face2-zip-gate` shows the halt line with face 2's ground unbuilt and fork 2's
  columns empty; `face1-zip-approach` is the built control with the plate and
  seal standing.
- **Flag off leaves the default run unchanged — proven, not argued.** I built
  the default level and spawn table from a `git archive` of the merge-base and
  of HEAD and diffed the serialised results: **byte-identical**. Independently:
  the render face-gate cannot touch the traversal slice either — its four
  authored solids (and the six the slice overlay adds) all sit before the first
  corner at 89, so `onFutureFace` is false for every one of them.

Layer purity and determinism are clean: `src/pure/split.js` imports only
`config.js` / `path.js` / `traversal.js`, no THREE/document/window, no
`Math.random`/`Date.now`/`performance.now`, no rng consumed by fork siting; the
purity guard globs the whole directory so the new file is covered.
`src/sim/spawner.js` keeps both seeded draws in their original order (`minLane`
is a floor applied after the draw). `CONFIG`'s movement block is untouched;
`?hook=1` is untouched; no new runtime deps, no build step, no OSTK artifacts;
the render change costs one `onFutureFace` scan per solid on two hooks that
no-op under the default `IS_G1` reveal, nothing per-frame.

---

Minors (not blocking; listed for the record):

- **tools/playtest/scripts/split-main-line.json:3 — the script description still
  quotes the per-script clock the fix pass repudiated.** It reads "first death
  12.9 s at x=63.649 ... idle fraction 0.28". The same commit established from
  four runs that the first life is lost at 10.4/10.5/12.9/12.9 s with both
  values on both scripts, and both the write-up and the README now quote only
  the column. This third artifact still presents a variable as a property of
  the script (my own run of it measured idle 0.251). Same class as the fixed
  minor, one file short.
- **src/pure/lattice.js:564 — `latticeSupportYExcluding` was not brought along
  with `latticeSupportY`.** Line 302 now credits an authored plate as a launch
  pad; the exclusion variant the thin pass uses for its load-bearing test
  (`:550`) still sees only deck and catwalks, so the two halves of the same
  arithmetic now disagree with the flag on. The direction is conservative (it
  over-estimates strandedness and therefore keeps a platform it could have
  thinned) and it is unreachable with the flag off, so it is a consistency nit
  rather than a defect.
- **src/pure/split.js:21-488 — the superseded traversal-slice lane still ships**
  (with ~550 assertions at `tools/pathcheck.mjs:8036-8581`), on a lane
  `decisions.md` entry 13 closed, and `?split=1` therefore means two different
  things depending on `?slice=`. Carried unchanged from the first pass; the fix
  pass added the banner at `src/pure/split.js:1-19` naming which half is
  superseded rather than deleting the lane, which is the right call for a
  builder — removal is an integrator/operator decision. Green and off by
  default, so it harms nothing today.

Process note, not a finding: `main` has moved to `8cff12d` since this branch's
merge-base, but only by docs and this task's own gate artifacts
(`docs/ORCHESTRATION.md`, `reports/tasks/T-021/review.md`) — no runtime file
collides, so the merge should be mechanical. Re-verify HEAD has not moved again
before merging, given this worktree's shared-dispatch history.

Operator questions this gate is not entitled to answer (they are already in §7
of the proposal): whether the sealed slot reads as a risk at FAR before the
commit line, whether ~10 tiles of daylight plus a doubled time-in-reach is the
right price, whether a free capsule one late hop off the plate cheapens the
fork, and whether four forks plus six pockets is "lots of split decisions".
