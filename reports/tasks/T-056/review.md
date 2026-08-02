APPROVE

reports/tasks/T-056/build.md:75-76 — the "sky-band(0-45%)" table (27.5/34.8/34.9 p5,
3.41%/2.08%/2.76% share<L25.5) is not producible by a single committed command:
`tools/playtest/fogband-capture.mjs`'s `measureFile` only crops rows 12-88% (no
0-45% mode), and `scale-capture.mjs`'s `bandStats(file,0,0.45)` computes
p05/p50/p95/spread, not the rust/teal-role separation or share<L25.5. I
reproduced the exact reported numbers myself by combining the two committed,
documented conventions against the committed evidence PNGs (rows 0-45% of
`before-shadeFog-shipped-today.png`/`after-limbFog-what-now-ships.png`/
`approved.png`, rust/teal split, share<=25.5), so the figures are genuine and
independently reproducible from checked-in artifacts, not invented — but
build.md doesn't cite the exact command/script that produced them, which the
evidence standard asks for. Not a blocker; worth a one-line note or a
committed `--top 0.45` flag next time this method gets reused.

Everything else checked out and reproduced independently:
- `node tools/pathcheck.mjs`: 3194/0 in the worktree, 3195/0 at merge-base
  (verified in a scratch worktree of `71f3062`), matching the report exactly.
- Label reconciliation via `tools/pathcheck-labels.mjs` (ordered-label diff,
  not count): 8 `T-035/S2` labels removed, 7 added, nothing else moved. Every
  removed label's subject is either the retired `shadeFog` band itself (its
  selection logic, its width-match to the shipped band, its own tier/edge
  behavior) or the pre-T-045 wall/silhouette-pair probe points, which are
  still asserted — just in `tools/pathcheck/pathcheck-suite-3.mjs:87-93` and
  `t-050-shipped-plan-carries-the-scale-pass.mjs`, T-045/T-050's own files —
  not lost. `CONFIG.limb.shadeFog === undefined` is asserted directly
  (`tools/pathcheck/t-035-value-ladder.mjs:379`), so a future re-add of a dead
  key would be caught, not just an inert one.
- `src/config.js`: `shadeFog: { near: 26.5, far: 54.5 }` deleted outright
  (`git diff main...HEAD`), replaced by a comment recording the reconciliation
  and the LIMIT. `CONFIG.shade.dose` is untouched at `0.5`
  (decisions.md entry 14). No other CONFIG value changed (diffed the whole
  file; frozen jump/movement constants at `src/config.js:110-113` untouched).
- `src/render/camera.js`: `SHADE_GAIN` import removed, `calibrateEdges()` is
  one expression again (`const F = IS_G1 ? CONFIG.limb.fog : CONFIG.fog;`),
  reads nothing from the value ladder. Matches the report's claim exactly.
- Geometric argument recomputed independently from live `CONFIG` (not
  trusted from the report): each T-045 tier drops fog factor by exactly
  0.0893 under the old shift; far body carries 22.51% of its own contrast
  under `limb.fog` vs 31.44% under the retired `shadeFog`; the play band's
  screen-edge column costs 3.31%/3.79%/4.60% (FAR/mid/near) under `limb.fog`
  vs 0.00% at every view under the old shift. All four numbers match the
  report and SPRINT.md's T-056 entry to the stated precision.
- Byte-fidelity of the static bakes verified independently (not just
  re-trusted): built a scratch worktree at the merge-base (`71f3062`), ran
  `limbBakePlan`/`limbShadePlan`/`deckShadePlan` on both trees, SHA-256'd per
  material bucket plus the whole plan and the deck shade — identical on every
  hash, both trees. This is the per-mesh-not-whole-scene method the brief
  asked for (correctly avoids T-039's dynamic contact-shadow pool, which the
  report also flags as why a whole-scene hash isn't valid any more).
- The honestly-reported miss (whole-playfield tail stats don't reproduce
  T-035b's ordering, sky-band does) is a sound diagnosis, not a rationalization:
  reproduced both tables from the committed evidence PNGs myself and the
  identical p5=9.3 across all three variants at the whole-crop measurement is
  real and is exactly the kind of tell that points at a near-field floor
  effect rather than the fog band — consistent with T-052/053/054 landing
  real near-field dark detail after T-035b measured this.
- No `src/pure/` or `src/sim/` file is touched by this diff at all, so layer
  purity isn't at issue here; `src/config.js` itself carries no
  THREE/document/window reference (grepped).
- No new draw calls/materials possible: the plan hash proof above makes a
  geometry/instance-count delta structurally impossible, and the diff touches
  no rendering geometry file.
- `git status --short` and `git diff HEAD --stat` clean in the worktree after
  all checks; no port bound; scratch merge-base worktree removed after use.
