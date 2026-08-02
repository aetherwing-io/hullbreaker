REQUEST_CHANGES

- src/render/preload.js:131-153 (awaitPreloads) — the shared boot gate's "any
  lane can register" claim (module header, line ~40; also the doc comment at
  lines 129-130: "Safe to call more than once and from more than one module:
  the second caller gets the same closed gate") is FALSE under concurrent
  independent callers, and I reproduced this empirically rather than by
  reading. Each call to `awaitPreloads()` takes its own local snapshot of
  `entries` (line 133), races it, then unconditionally sets the *module-level*
  `closed = true` (line 142) and force-marks every still-`'pending'` entry —
  including ones registered by a *second* module after the first snapshot was
  taken — as `'timeout'` (lines 144-152), regardless of how much of the
  shared budget has actually elapsed. Test: two throwaway sibling ES modules
  (`src/render/_review-consumer-{first,second}.js`, deleted after use, tree
  confirmed clean before/after with `git status --short`) that do exactly what
  the header prescribes — `preloadTexture(url)` then `await awaitPreloads()`
  at their own top-level scope — loaded via a scratch `review-preload-order-*
  .html` (also deleted) served on an ephemeral port. Across 10 trials of the
  same order, the second module's texture was force-marked `'timeout'` in 7,
  every time within 3-6ms of boot (`preloadSnapshot().costMs` 3-6), not the
  stated 2500ms budget, and the console printed a line that is simply false
  in that circumstance: `"...— still loading after the 2500ms boot budget;
  the game is starting without it."` Swapping which module is imported first
  changed nothing structural (still a race — 2/2 "second loses" on one order,
  then 2/2 both-ready on a re-run of the *identical* order, then 5/6 "second
  loses" again) — this is non-deterministic, run to run, which is a bad
  property for a module purpose-built to fix a determinism bug. It does not
  wedge or crash (the existing null-texture fallback still draws the
  primitive), so entry 16's hard "never wedge" condition holds — but the
  dispatch brief's item 6 asks squarely "is the preload gate actually
  generic — T-040 needs to use it rather than reinvent it," and the answer
  as shipped is no: a second lane following this module's own documented
  pattern (which, per the live task board, T-040 is doing right now —
  "Refactor player.js onto shared preload.js gate" shows completed) has a
  real, majority-of-the-time chance of its own runtime art being silently and
  permanently starved of the budget it was promised, misreported as a timeout
  that did not happen. Fix direction: `awaitPreloads()` needs one shared
  close routine gated on "every entry *currently in `entries`* is settled, or
  the one shared timer (started at first registration) has fired" — not a
  per-call snapshot that lets whichever caller's own subset finishes first
  foreclose on entries a sibling caller is still legitimately waiting on.

- tools/playtest/sprite-stress.mjs / reports/tasks/T-049/build.md §3 — the
  draw-call comparison (144→132/133, independently reproduced by me on this
  HEAD) never restates T-047's caveat that `renderer.info` does not count the
  shadow pass, which the dispatch brief explicitly asked this lane to state
  ("say what your number covers"). Not a correctness bug — the number is real
  and I reproduced it — just an honesty-note omission worth a one-line fix
  before another lane inherits "132 draw calls" as a shadow-inclusive figure.

Everything else checks out under independent re-verification, most of it by
running it myself rather than reading the report:

- **The crux claim (gameMsMax bimodality) holds up, and is worse on the
  no-sprite control.** I ran my own 8-round interleaved test (merge-base
  `0d98c70` on port 8790, this HEAD on port 8791 for both `?sprites=0` and the
  shipped default; both servers and the scratch merge-base worktree torn down
  after) — one merge-base run (zero runtime-asset code anywhere in that tree)
  never reached victory at all: `stopReason=script-window`,
  `gameMsMax=9869ms`, `closestCrushApproachTiles=32.14`, against a
  35.39-35.48 cluster everywhere else across all three conditions and 24
  total runs. The shipped sprite build's own `closestCrushApproachTiles` —
  the gameplay-relevant number — was the *tightest and most excursion-free*
  of the three conditions (35.45-35.48, 8/8 victory, no outliers), while its
  `gameMsMax` bimodality tracked `dispatched` count (16 vs 18) exactly as the
  report describes. This corroborates the report's central claim
  independently: `gameMsMax` alone is not a reliable determinism signal here,
  and T-040's FAIL verdict resting on it should be re-read against
  `stopReason`/`dispatched`/`closestCrushApproachTiles` before asking that
  lane to rework on this number, per the report's own recommendation.
- **Layer purity.** `git diff main...HEAD` touches nothing under `src/sim/`,
  `src/pure/`, `src/main.js`, or `src/mode.js` — confirmed by diff and by
  `tools/pathcheck/t-012-audio-layer-static-guards.mjs`'s static guard, which
  ran clean as part of the full gate. `?hook=1` is untouched and stays inert.
- **pathcheck.** 2117 passed / 0 failed on this HEAD (`6f1a4b8`), base
  (`git merge-base main HEAD` = `0d98c70`) measured myself at 1853 — the
  report's own +264/+263 arithmetic checks out. I independently broke one of
  the boot-gate assertions (deleted `renderer.initTexture(tex)` at
  src/render/preload.js:77) and confirmed pathcheck goes red with the
  comment-stripping fix from commit `6f1a4b8` in place, then restored; tree
  confirmed clean after.
- **The self-caught bug is real and rightly fixed.** Commit `6f1a4b8` found
  and fixed its own assertion-whose-subject-was-prose defect (the raw-text
  `initTexture(` check matching the header comment, not just the code) before
  I could — exactly the practice the project's evidence standard asks for.
- **Entry 16's fallback contract.** I reproduced both halves myself rather
  than trusting the report: (1) ran `sprite-fallback-check.mjs` fresh — sim
  trace identical sample-for-sample across art/no-art, all five kinds
  correctly `ready` vs `failed`, console names the file, no wedge; (2)
  physically moved `assets/generated/sprites` aside, ran pathcheck (10
  failures, all existence assertions, exactly as claimed) and
  `mid-route.json --deterministic` (`outcome: completed`, 0 deaths) against a
  server pointed at the tree with the assets gone, then restored and
  confirmed `git status --short` clean and pathcheck back to 2117/0.
- **Perf.** Reran `sprite-stress.mjs` myself: 144→132 draw calls (report:
  144→133 — within run-to-run noise), 0 frames over 20ms both ways, worst
  frame 10.3-10.4ms both ways, 256 live projectiles. `forceSinglePass` is a
  real `THREE.Material` property in the pinned r170 (verified against the
  CDN-served source), not a made-up API.
- **Palette / hygiene.** No raw hex literals outside `PAL.` tokens in the
  touched render files. No `package.json` or `index.html` changes — no new
  runtime dependency, no build step. Flags: sprites ON by default,
  `?sprites=0` and `?spritevar=` are real escape hatches/A-B, asserted.
- **Readability (pillar 5) and variant choice are correctly left to the
  operator.** The report never self-declares the sprites better-looking; it
  measures a real regression on one axis (background separation, 4 of 5
  roles) and files it as an operator question rather than "fixing" it
  unilaterally. That is the right call and not mine to grade further.

Net: the hostile-sprite wiring itself (src/render/hostiles.js,
src/render/sprite-table.js, src/render/sprites.js) is solid, and the
determinism investigation is a genuine, independently-verified contribution
to the T-040 conversation. The boot-gate module is the one piece that isn't
yet what it's billed as — a concurrency bug in exactly the "any lane can
register" contract this task was asked to build, not just a documentation
gap — and it should be fixed before a second lane (T-040 is already mid-move
onto it) depends on the budget being honored.
