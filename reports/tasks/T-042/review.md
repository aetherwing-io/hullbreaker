APPROVE

Findings (none blocking), most severe first:

- tools/pathcheck/manifest.mjs:105 — the branch's pathcheck baseline (2295 = main@2251 + this
  lane's 44) is now stale: current `main` is at 2404 (T-047 light rig and T-048 bloom/post
  merged after this lane's own rebase commit be9809c). Not a defect: this lane touches only
  src/ui/audio.js and three tools/pathcheck/ files, none of which overlap T-047/T-048's
  render/config files, and `tools/orch/merge-task.sh` re-runs pathcheck on main and refuses on
  a drop — but the integrator will need one more `git merge main` (or the offered
  migrate-lane.mjs reconciliation) before merging, to pick up the ~109 assertions landed since.
  Flagging per the dispatch's item 8, not as grounds for changes.

- reports/tasks/T-042/build.md "Frame-time delta" section — the build's own frame-time numbers
  (audio ON ≈60-62ms/frame vs OFF ≈51-52ms/frame) were measured in a software-rendered,
  no-GPU headless sandbox and self-flagged inconclusive; the report explicitly asks for
  re-measurement via tools/playtest/juice-stress.mjs-style stress on real hardware before
  treating any number as final. I did that: same 256-projectile-saturation load
  (juice-stress.mjs's own method — 12x fireWeapon('S', clone=true) + one fxBurst/fxFlash per
  frame, right-held on the six-face run), in real GPU-accelerated Chrome (channel: chrome,
  headless launch, macOS), once at default vsync and once launched with
  `--disable-gpu-vsync --disable-frame-rate-limit`. Default vsync: worstMs 10.3 for both
  audio-on and audio-off (120Hz panel cap masks any delta, as the dispatch warned). With vsync
  effectively removed: audio ON → avgMs 1.50/worstMs 5.1; audio OFF → avgMs 1.48/worstMs 5.0,
  both at the pool-saturating 256 live projectiles. Audio's own per-frame cost at full load is
  on the order of 0.1ms, not the ~10ms the sandbox numbers suggested — a clean, non-sandboxed
  answer to dispatch item 3, consistent with the code being O(1) arithmetic per frame (no
  per-frame allocations found in updatePressure()/updateCombatHeat()/loadScale()). Worth
  folding into build.md, not gating.

- Test-honesty verification was spot-checked, not exhaustive: I personally broke and restored
  2 of the build's claimed 6 break/restore pairs against the live worktree — disabling the
  `voices >= A.maxVoices` guard in tone()/noiseHit() (src/ui/audio.js:182,198) turned the
  80-shot overload assertion red with "got 47" (matches the report's claimed number exactly),
  and reverting gate()'s `lastAt[key] ?? -1e9` back to `|| -1e9` (src/ui/audio.js:157) turned
  the lance-with-headroom repeat assertion red with "got 6" (also an exact match). Both
  restored cleanly (`git status --short` empty, `git diff HEAD --stat` empty, pathcheck back
  to 2295/0 passed) after. I did not independently re-break the other 4 claimed pairs (the
  lance dedup guard, sfxHurt's prio flag, the crushWarnIntensity hardcode, sfxHit's weight
  factor) — noting the scope of my own verification rather than vouching for numbers I didn't
  reproduce myself.

Verified directly and clean:

- Layer purity: src/ui/audio.js imports only `sLeftEdge` from src/sim/edges.js (a genuine
  read-only getter, confirmed against source) beyond the pre-existing T-012 sanctioned-read
  surface; the new tools/pathcheck/t-012-audio-layer-static-guards.mjs:41-46 allowlist entry
  is a one-line, commented, provenance-traceable addition, and its own static assertion (same
  file, line ~55) confirms sim/ never references the audio module. No THREE/document/window
  in src/pure/ or src/sim/; `node tools/pathcheck.mjs` passes 2295/0 in the worktree as-is.
- Determinism: sim/pure untouched by this diff; audio.js's real-time reads (`ctx.currentTime`,
  `document.hidden`, `window.AudioContext`) are pre-existing ui-layer patterns from T-012, not
  new; the one new per-frame sim read (sLeftEdge()) is a pure getter with no side effects. The
  build's own mid-route.json ×3/×3 comparison (closestCrushApproachTiles within 0.02 tiles
  audio-on vs 0.00 off) is consistent with sim trajectories being unaffected by audio.
- Boot-time async: confirmed zero `async`/`await`/`fetch`/`new Promise`/`setTimeout`/
  `setInterval` anywhere in src/ui/audio.js; `buildContext()`/`buildPressure()` run
  synchronously on the keydown-gesture call stack (unlock() → buildContext()), so there is no
  analogue of the T-040 async-asset-race class of defect.
- Voice capping: `A.maxVoices = 14` is unchanged by this diff; the hard cap held at exactly 14
  under an 80-shot overload in both the build's harness and my own break test above.
- Autoplay: unchanged pre-existing gesture-gated `unlock()` on `keydown`; no context is built
  or resumed before a real user gesture.
- No audio files, no build step, no runtime dependency: confirmed — the three-dot diff
  (`git diff main...HEAD --stat`) touches exactly 5 files (src/ui/audio.js,
  tools/pathcheck/manifest.mjs, tools/pathcheck/t-012-audio-layer-static-guards.mjs, the new
  tools/pathcheck/t-042-audio-punch.mjs, and this task's own build.md); no package.json touched.
- On by default: `AUDIO_ON = QUERY.get('audio') !== '0'` is unchanged from T-012; `?audio=0`
  remains the escape hatch, matching decisions.md entry 16.
- Scope/hygiene: no SPRINT.md/CLAUDE.md/README.md touched; no palette or config-constant
  changes; `git status --short --ignored` shows only gitignored tools/playtest/runs and
  node_modules, nothing stray committed; no OSTK artifacts anywhere in the diff.
- Feel/fun: the report never self-declares the work good or fun; five specific, non-leading
  operator questions are listed with an exact URL, correctly routed rather than answered.
