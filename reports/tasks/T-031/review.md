APPROVE

Verified independently (not just re-read): `node tools/pathcheck.mjs` → 1704 passed, 0
failed on this tree. `git diff main...HEAD --name-only` → exactly README.md,
docs/DESIGN.md, reports/tasks/T-031/build.md, tools/playtest/palette-capture.mjs,
tools/playtest/scripts/mortar-zone-deny.json — zero files under src/, working tree
clean, no OSTK artifacts. `git diff --stat ebd71eb main -- <edited paths>` is empty,
confirming this lane's base already equals main for every file it touches (no
inherited drift, no expected merge conflict on these five files); cross-checked all
other live task/* branches for overlap on mortar-zone-deny.json/palette-capture.mjs
and found none (T-027's only overlap is six-face-spaced-run.json, already correctly
identified and left alone by this lane).

All seven issues accounted for and each independently verified against the code,
not just the report's prose:

- I-001 (sampler comment): confirmed already fixed by 4b8e53c, an ancestor of this
  branch (`git log` shows it before ebd71eb). Read tools/playtest/lib/sampler.mjs
  and src/main.js:455 (telemetry() maps hostiles) / :610-618 (snapshot() adds
  capsules only) — matches the "closed, no edit" claim exactly.
- I-002 (check.mjs header): confirmed already fixed by T-026's 0059363 (merged via
  b003bff, an ancestor of ebd71eb). Reproduced the defect myself: checked out
  0059363^ into a scratch worktree, built a fixture with one static import + one
  runtime reference, ran the old check.mjs — the import line is listed BOTH under
  "runtime, not imports" and under "problems" (the actual bug). Ran the same
  fixture against this worktree's check.mjs — the import appears only under
  "problems", header says "(1 static import rejected below, not counted here)".
  Matches the build.md transcript.
- I-015 (palette-capture.mjs): read the diff line by line. Before: `shot()` was
  `page.screenshot({ path: <final path> })`, writing straight to the committed
  artifact. After: `shot()` buffers to a per-scene `pending` Map and returns the
  buffer; `writeFileSync` only runs in the outer loop after both palette contexts
  for a scene have returned (palette-capture.mjs:463, inside the scene loop, after
  the `for (const pal of PALETTES)` block). Any throw inside `scene.run` (e.g.
  driveIrisCycle's verification-failure path at :382) propagates out of the pal
  loop before reaching the writeFileSync line, so a failed scene writes nothing.
  The stale `verifyTellFrame/verifyBeamFrame` comment (confirmed absent from the
  pre-fix file via `git show ebd71eb:...`, real functions are `measure()` /
  `captureIrisCycle`) is also corrected. This is the whole defect, fixed correctly.
- I-016 (`?juice=0` "byte-identical"): doc-side fix verified against
  src/main.js:540 (`samplePerf(t)` called unconditionally in `frame()`) and
  src/main.js:474-475 (`juice`/`perf` keys always present in telemetry()) — both
  support the new "simulation-identical" wording. The two src/ comment sites
  correctly left alone and reported as out of scope for a docs-only lane.
- I-017 (mortar-zone-deny.json): diff is the `description` string only (confirmed
  via `git diff`), "Regression signals" untouched. Both cited numbers are real:
  reports/tasks/T-014/evidence/README.md:27 ("~830 ms"), reports/tasks/T-014/
  playtest.md:153-154/67 ("~150 ms", "x = 62.21"). No policy rule changed.
- I-021 (SHARE vs "same factor"): src/render/legibility.js:85 has
  `SHARE = { glyph: 1, cue: 1, pose: 0.6 }`, and its own header comment (lines
  14-49) already states the "information whole, a pose partly" / hit-circle
  reasoning the doc edit now surfaces — not an invented rationale. Gains checked
  by hand: far depthMult 1.9 (src/config.js:32) for glyph/cue, `1 + (1.9-1)*0.6 =
  1.54` for pose, matching pathcheck.mjs:6064/6067/6069's assertions (build.md's
  own citation is off by a couple of lines — 6062/6067/6069 vs actual 6064/6067/
  6069 — but that's the internal report, not a committed doc, and immaterial).
- I-027 (spaced-run numbers): confirmed genuine, live conflict. `task/T-027`
  (branch a07e9c4, unmerged) edits the identical one-line `description` string in
  tools/playtest/scripts/six-face-spaced-run.json plus the same `edgeMargin>8`
  policy-rule change this report describes. Leaving it alone was the right call,
  not an easy-item dodge — the proposed replacement text is drafted and cites only
  committed evidence (reports/tasks/T-019/playtest.md), not the gitignored raw
  run dirs.

Commit-message accounting checks out: 4 fixed here (I-015, I-016 doc-side,
I-017, I-021) + 2 already-fixed (I-001, I-002) + 1 blocked (I-027) = 7/7, matches
"fix four drifted claims, close two already-fixed, block one."

No invented measurements found anywhere in the diff: the two new DESIGN.md numbers
(1.9, 1.54) are arithmetic over asserted constants; every mortar/spaced-run number
is cited to a committed reports/ path; the build.md itself explicitly lists what
was dropped for lack of evidence (I-017/I-027 raw-run timings, the mortar 4/4 vs
3/3 count from the builder's own uncommitted re-run) rather than silently
restating a guess.
