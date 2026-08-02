APPROVE

Re-review of HEAD `9e91d7b` ("fix cycle: ship the operator-approved dose (0.5)
ON by default"), superseding the prior APPROVE in this file (which judged
`83ad933`, the FULL-dose-by-default build the operator rejected). All checks
below were performed independently against the running build — live browser
capture of instance colors/fog/draw-calls via a scratch Playwright script, not
by reading the build report's numbers — except where stated.

## Findings, most severe first

1. **`tools/pathcheck.mjs` has not been reconciled with `main`'s split tree
   (T-037).** This branch (forked at `31310be`) still carries the pre-split
   9,700+-line monolith with T-035's own block appended at the tail; `main`
   (now at commit `7883658`) replaced it with a generated runner +
   `tools/pathcheck/*` modules and is at 1834 assertions. `merge-task.sh`
   will hit a real conflict here (main wants a 51-line generated file, this
   branch has a 9,700-line one), and the project has twice lost cycles to a
   pathcheck merge that silently dropped assertions (I-019/I-031,
   T-025/T-026) — this is not a conflict to resolve casually by hand.
   Not a defect in this fix cycle's content, and low-risk once done: I
   independently captured ordered assertion labels with
   `tools/pathcheck-labels.mjs` (main's copy, since this branch predates that
   tool) for the merge-base (`31310be`, 1704 labels), this worktree (1749),
   and `main` (1834), and confirmed by multiset diff that T-035's own 45
   labels are a pure addition over its merge-base (zero dropped) and that
   `main` has touched none of the six `src/` files this task edits since the
   fork except a 12-line, non-conflicting append to `config.js` (T-041's own
   block). Per `pathcheck-migration.md`'s documented caveat for lanes that
   fork after the split landed, the mechanical fix is a new
   `tools/pathcheck/t-035-value-ladder.mjs` module plus one `manifest.mjs`
   line, verified with the same reconciler used for T-041/T-043 — this
   should happen before `merge-task.sh` is invoked on this branch, not during
   it.

2. **Everything else checked clean.** No further findings.

## What was verified, and how

- **The shipped dose matches the approved verdict, by capture.** Served this
  worktree and a materialized checkout of the pre-fix commit (`83ad933`, the
  build the operator actually saw) side by side; read `scene.traverse()` for
  every `InstancedMesh.instanceColor.array` plus `scene.fog`/`background`
  in-page (not screenshots, not the report's own hashes) and hashed them.
  Default URL on `9e91d7b` == `?shade=0.5` on `9e91d7b` == `?shade=0.5` on
  `83ad933` (identical hash, identical fog 46.75/74.75, identical bg), all
  three bit-for-bit. `?shade=0` on `9e91d7b` == default on `main` HEAD
  (identical hash, fog 44.25/72.25) — the escape hatch is exact. This also
  falls out of the code: `git diff 83ad933 9e91d7b -- src/pure/shade.js`
  shows the fix touched only `resolveShadeGain`'s comments/signature (added
  a `dose` fallback param); `limbShadePlan`/`deckShadePlan` and everything
  below them are byte-identical, so feeding the same resolved gain (0.5)
  into unchanged math was always going to reproduce the approved frame —
  the capture confirms the plumbing delivers that gain by default.
- **ON by default, confirmed by capture** — same evidence as above;
  `PALMOD.SHADE_STRENGTH === DOSE && PALMOD.SHADE_GAIN === DOSE` is also
  asserted in pathcheck (`tools/pathcheck.mjs:8957`) with no query present.
- **`?palette=classic` byte-fidelity, confirmed by capture, not by reading
  `CLASSIC.shade`.** `T-035 ?palette=classic` (shade absent) and
  `T-035 ?palette=classic&shade=1` both hash identically to `main HEAD
  ?palette=classic` — three separate captures, same hash, same bg
  (`#46525f`), same fog. `CLASSIC.shade.gain === 0` in the code is the
  mechanism, but the instrument's fidelity is proven by the render output
  matching main's, which it does.
- **Anti-cheat / evidence honesty.** Read the actual pathcheck block
  (`tools/pathcheck.mjs:8896-9291`, not just the build report's table): the
  two packet gates that cannot hold at dose 0.5 are asserted at `?shade=1`
  (`onStats`, still required to hold) and separately recorded as named LIMIT
  assertions at the shipped dose with the exact arithmetic reasoning inline
  (out of reach below gain ≈0.75) — nothing is restated to fit, matching the
  build report's claim. Diffing `83ad933`→`9e91d7b`'s pathcheck changes shows
  the old two-state (on/off) measurement functions were extended to a
  three-state one (on/dose/off); every assertion the old version made is
  still made (now via `deckOn`/`onStats` at gain 1), plus new ones at the
  shipped dose — additive, not weakened.
- **Purity/determinism, `src/pure/shade.js`.** No `THREE`/`document`/
  `window`, no `Math.random`/`Date.now`/`performance.now` (grepped directly).
  Single import, `./rng.js` (`mulberry32`). `limbShadePlan`/`deckShadePlan`
  take no time argument and are called once at bake time in `limb.js`/
  `level.js` (module-init scope, gated by `IS_G1`/`!IS_TRANSFORM_SLICE`), not
  per frame — confirmed by reading both call sites, not just the comments.
- **The granted `camera.js` line.** `git diff 31310be HEAD -- src/render/camera.js`
  is unchanged since the original grant and unchanged by this fix commit
  (not in `9e91d7b`'s diff at all): exactly `+1 import, +7 comment lines, +1
  expression`. With the ladder now on by default, `SHADE_GAIN` (0.5×1=0.5)
  is `>0`, so the intended state ships: the shifted haze band
  (`CONFIG.limb.shadeFog`) is selected on the plain URL, not just behind a
  flag. Nothing else in the file moved.
- **Draw calls.** Independently measured via `renderer.info.render.calls`
  after a forced render: 97 calls / 13 instanced meshes / 2969 instances,
  identical across `main` default, `T-035` default, `?shade=0`, and
  `?shade=1` — zero delta from the pre-existing build in every configuration
  I drove (the 94-vs-97 gap between my number and the build report's is
  viewport/timing noise in the measurement method, not a regression; both
  agree the count doesn't move between doses/palettes, which is the actual
  claim). Checker carrier: `checkerDelta >= 16.77` is still a live-computed
  assertion off `PAL_CONCEPT.ground`/`groundAlt`, not a literal.
- **Scope.** `git diff 31310be..HEAD --stat -- src/ tools/` touches exactly
  `src/config.js`, `src/pure/shade.js`, `src/render/{camera,level,limb,
  palette}.js`, `tools/pathcheck.mjs` — the six files the report claims plus
  the one granted exception. No `SPRINT.md`/`README.md`/`main.js` touch.
  Worktree is clean (`git status --short` empty) after all of the above.

No aesthetic opinion is offered anywhere above; the operator's verdict is the
only one in play, and the build reproduces it bit for bit.
