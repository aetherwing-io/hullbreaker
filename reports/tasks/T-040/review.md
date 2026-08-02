APPROVE

Re-review against `task/T-040` HEAD `1bdc750` (post fix-cycle, post integrator merge).
Verified independently, not inherited, per LANE-BRIEF's evidence standard; every
number below is from a command I ran myself in this session.

## Verified clean (no findings)

- **pathcheck count.** `node tools/pathcheck.mjs` in the worktree: **2515 passed,
  0 failed**. Independently checked out `main` (`2c638aa`, the merge-base named
  in the merge commit) into a scratch worktree and ran pathcheck there: **2469
  passed, 0 failed**. 2469 + 46 = 2515, matches exactly, nothing dropped.
- **The re-homed assertion block is untouched.** Extracted the pre-split
  monolith's T-040 block from `9a4b4fa:tools/pathcheck.mjs` (the last commit
  before the merge) and diffed it byte-for-byte against the body of
  `tools/pathcheck/t-040-rig-sprite.mjs` (lines 24-247, i.e. everything after
  the new `run(SHARED) {` wrapper) — **`diff` produced zero output**. Only the
  file's import header changed, exactly as the merge commit claims.
- **assets/manifest.json.** Valid JSON, 39 entries = main's 38 (`2c638aa`) + the
  lane's 1 (`rig-marine`, verified present with a complete, well-formed record:
  path, source, size, palette-check `status: pass`). `node tools/assets/check.mjs`
  → **PASS**, `rig-marine 256x256, 8.5kB, ink 40%, hull 24%, rust-orange 17%,
  haze 15%`, listed as a runtime reference (not rejected).
- **Layer purity / determinism.** `src/pure/rig.js` reads `CONFIG` only, no
  THREE/document/window, no randomness. `src/config.js` diff against `main` is
  **empty** — `CONFIG.player` (collision + movement constants) untouched.
  `src/render/preload.js`'s `performance.now()`/`Date.now()` use is inside
  `src/render/`, which is legal.
- **New assertions independently proven to bind** (in a throwaway copy under
  the scratchpad, never the reviewed worktree — confirmed `git status --short`
  clean in the real worktree before/after):
  - Appended a real `settled` reference to `player.js` → pathcheck failed with
    `FAIL T-040: player.js carries no second bespoke boot-timeout/lock-in
    mechanism...`; restored → 2515/0.
  - Appended a real `spriteDebugHook` export to `src/sim/player.js` → failed
    with `FAIL T-040: src/sim/player.js carries no reference to the
    sprite/fallback split or the preload gate...`; restored → 2515/0.
  - Widened `RIG_SPRITE_CONTENT_ASPECT` to 3.5 in `src/pure/rig.js` → two
    expected FAILs (`...exceeds the documented 1.3x collision-half-width
    ceiling...` and the shipped-clean check); restored → 2515/0.
- **Asset-missing fallback (entry 16's condition).** Reproduced in a scratch
  copy: renamed `rig-marine.png` away, served, loaded `?selftest=1` —
  **SELFTEST PASS (39 checks)**, zero `pageerror`s, exactly one
  `console.warn` ("RIG sprite did not load (error); showing the procedural
  fallback instead."), `window.__HB_PRELOAD()` reports `state: 'failed'`.
  Restored the file afterward; the real review worktree was never touched for
  this test.
- **Sim never branches on load state.** `src/sim/player.js` carries zero
  reference to sprite/fallback/preload names (gated by pathcheck, and I broke
  it above to confirm the gate is live, not decorative).
- **Escape hatch.** `?rig=canvas` (`QUERY.get('rig') === 'canvas'`) skips
  `preloadTexture` registration entirely (`if (!RIG_FORCE_CANVAS) { ... }` in
  `src/render/player.js`) and forces the plain-shapes fallback — on by
  default, opt-out present, matching entry 16.
- **Render-only, empirically.** Ran `mid-route.json --deterministic` against
  this worktree and a fresh `main`-tip (`2c638aa`) checkout side by side.
  gameMs-aligned position divergence stayed within 0.33/0.91 tiles and final
  `gameMs` differed by ~4ms — consistent with the shared-session frame-timing
  noise this report and its playtest gate already document extensively (up to
  535ms spread called acceptable elsewhere in the same evidence chain), not a
  new divergence introduced by this diff.
- **Perf.** Independently reran `tools/playtest/juice-stress.mjs` against the
  live worktree: 256 live projectiles, `fps ~120`, `worstMs 10.4`,
  `over20ms 0` — matches the committed report's figures, no regression.
  Draw-call structure (`new THREE.Mesh(` count === 3, one `PlaneGeometry` +
  one `BoxGeometry`) matches the "3 constructed, 2 ever visible" claim.
- **Readability.** Viewed the committed evidence directly (not re-judging
  fun/feel, just confirming the claim is not fabricated):
  `v4-sprite-5x-crop.png` and `v5-glance-test-frame1-full.png` show a
  genuinely readable armored figure — helmet, visor, chest/pack mass, two
  separated legs — findable at true ~15×30px size against both wall-panel and
  sky backdrops, a real step up from a flat silhouette. Correctly routed as an
  open feel question to the operator, not self-declared "good."
- **Lane discipline.** `git log --oneline -- SPRINT.md` shows no `T-040:`
  commit — the lane never touched the integrator-owned status line; the only
  changes to `SPRINT.md`/`CLAUDE.md` came from the merge commit itself.

## Findings (non-blocking, most severe first)

1. **`reports/tasks/T-040/playtest.md`'s committed FAIL is stale relative to
   this HEAD.** Its own header pins HEAD `10b5d9e`, which predates the fix
   commits (`9fa8fab`, `334466a`, `022ca70`) that closed the specific defect it
   caught (async `TextureLoader` fetch landing on a live frame during
   `--deterministic` mode). I confirmed structurally (and by my own
   break/restore test above) that the mechanism the FAIL names — a second
   bespoke timeout/lock-in path — no longer exists; top-level
   `await awaitPreloads()` is asserted and present. That said, `build.md`'s own
   post-fix 16-round interleaved re-gate (after the fixes) finds a real,
   unresolved *residual* dispersion specific to the shipped sprite condition
   (1935ms spread, right-skewed, correlated with which texture is bound for
   RIG's mesh) — reported honestly, with a stated-not-proven hypothesis (GPU
   driver deferring mipmap upload past the JS-visible `initTexture()` call),
   and escalated to the shared `preload.js` layer rather than patched
   privately inside this lane's files. A fresh playtest gate against `1bdc750`
   is still owed to give this a current, non-stale verdict — outside my scope
   here, but noting it so it isn't missed.
2. **`src/render/preload.js`'s own docstring still claims general
   multi-caller safety** ("Safe to call more than once and from more than one
   module: the second caller gets the same closed gate," line 130) — this is
   the exact claim T-049's own review found false for a second registering
   module. This file is inherited verbatim from T-049's pre-fix commit
   (`ac4f9c8`) and correctly left untouched by this lane (not its file to
   edit, per lane fences); the honest scoping correction instead lives in
   `player.js`'s own header, which is the right call. `main` does not carry
   `preload.js` yet, so there is no live regression today — flagging only so
   whoever merges T-049's eventual fix confirms it fully supersedes this
   lane's copy rather than leaving two versions of the file's own claims in
   the tree.
