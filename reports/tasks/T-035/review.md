APPROVE

Verification performed independently (not inherited from build.md), against
worktree HEAD 83ad933 (task/T-035, base 31310be):

- `node tools/pathcheck.mjs` in the worktree: 1742 passed, 0 failed. Diff is
  additive-only in `tools/pathcheck.mjs` (317 insertions, 0 deletions,
  `git diff main...HEAD --numstat`) — no existing assertion weakened or
  removed.
- Gate 1 (arithmetically impossible on main): re-derived the S1(a) metric
  from scratch against the CURRENT MAIN TIP's own `config.js`/`palette.js`/
  `pure/limb.js` (unmodified by this branch — diffed byte-identical against
  main), independent script, not the worktree's pathcheck code: share below
  0.55x = 0.00%, worst per-material spread = 0.0000. Both gates (>=20%,
  >=0.45) are confirmed red on main by arithmetic, matching the report.
- Gate 2 (paired-population anti-cheat): decoded the committed
  `artifacts/shade-v1/03-*.png` / `04-*.png` PNGs directly (independent
  script, playfield crop 12-88%, rust=r>g>b, teal=g>r&&b>r, Rec.709 luma) —
  rustMedian 63.3->17.3, tealMedian 78.3->78.3 (unchanged), separation
  -15.0->-61.0. Confirms the widening is not uniform darkening: the backdrop
  population is untouched, only the play-plane population moved.
- `src/pure/shade.js`: no THREE/document/window/Math.random/Date.now/
  performance.now (grepped directly); imports only `./rng.js`; automatically
  covered by pathcheck's `guardLayer('pure', ...)` glob (no registration
  needed). `limbShadePlan(plan, cfg, gain)` and `deckShadePlan(groundH, cfg,
  gain)` are both plan/column-level, called once at module load
  (`bakeLimb()`/the `if (!IS_TRANSFORM_SLICE)` block), not per frame.
- `CLASSIC.shade = { gain: 0 }` makes every returned multiplier `1 + 0*(raw-1)
  === 1` by IEEE754 exactly (not approximately), and the limb/level call
  sites multiply by that `k` — a multiply by exactly 1.0 is bit-identical to
  the pre-change color math. `resolveShadeGain` defaults absent/junk/0/
  negative to 0, so the default URL (no `?shade=`) is bit-identical to main
  regardless of palette.
- `src/render/camera.js`: only file outside T-035's stated list; the dispatch
  message to me independently confirms the lead granted this one line.
  Diff is exactly `+1 import, +7 comment, net +1 expression` (numstat 9
  insertions/1 deletion) and nothing else in the file changed. Condition
  holds: `SHADE_GAIN > 0` gates the swap, so with `?shade=` absent
  (`SHADE_GAIN` is 0) the expression selects `CONFIG.limb.fog`, identical to
  today.
- Checker carrier (pillar 1/5): `checkerDelta` is computed live from
  `PAL_CONCEPT.ground`/`groundAlt` (not a hardcoded literal) and gated
  `>= 16.77`; `minStep > checkerDelta` is a real, live-computed assertion
  (reported 21.5 > 16.77). The "rows already alternate" correction from the
  spec's adversarial-review appendix is reflected accurately in the
  `level.js` comment (does not claim to fix a first alternation).
- Draw calls/instances: the code diff structurally guarantees zero delta
  between flag-on and flag-off (no new `InstancedMesh`, no new material, same
  bucket/index structure in both `limb.js` and `level.js` — confirmed by
  reading the full diff). One discrepancy worth recording for the operator:
  the build report and `artifacts/shade-v1/README.md` measure **94** draw
  calls on this worktree's default run, against the packet's cited **101**-
  call baseline. This is honestly disclosed in the committed README ("that
  count was taken on a different frame of the same build") rather than
  hidden, and is not attributable to this diff (no geometry/material/draw-
  call-affecting code changed) — flagging as a documentation note, not a
  finding against this task.
- Flag/scope discipline: `?shade=` is its own flag, independent of
  `?palette=`; `src/main.js` (fenced to another lane) is untouched (absent
  from the diff); no new runtime deps; no build step.

No findings rise to REQUEST_CHANGES. One item for the record, most severe
first:

`artifacts/shade-v1/README.md:99` / `reports/tasks/T-035/build.md:96` —
draw-call count measured on this worktree (94) does not match the packet's
cited baseline (101, `docs/proposals/2026-08-look-direction.md:651`). Already
disclosed as a different-frame measurement rather than a regression; worth
an operator/integrator note so a future report doesn't inherit either number
without re-measuring, but not a defect in this task's own zero-delta claim
(which is separately guaranteed by the unchanged `InstancedMesh`/material
structure).
