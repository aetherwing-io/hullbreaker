APPROVE

Second pass (fix cycle re-review). Gate run by me: `node tools/pathcheck.mjs`
in the worktree — 881 passed, 0 failed (was 859 before the fix commit; the
count only grew). Headless Chromium boot of the served worktree:
`index.html?selftest=1` → `SELFTEST PASS (17 checks)`,
`?selftest=1&juice=0` → `SELFTEST PASS (17 checks)`, `?testapi=1` →
PLAYING with `juice{enabled:true, sparkMax:224, flashMax:20}` and
`perf{frames:180, fps:121.9, worstMs:9.3, over20ms:0}`. The only 404 on any
boot is `/favicon.ico` (confirmed by URL) — the palette 404 is gone.

Prior findings, all verified fixed
- MAJOR CHRONO regression — fixed. src/main.js:245-247 now composes:
  `wScale = (chrono) * hScale` and `updateScroll(dt * wScale)`, so scroll,
  hostiles and capsules keep the CHRONO treatment they had on `main` and
  merely gain the freeze; RIG and bullets take `hScale` alone, matching
  `main`'s unscaled-under-CHRONO behavior. With `?juice=0` every scale
  collapses to the pre-juice one.
- MAJOR pathcheck assertion that hard-coded the regression — replaced by
  three assertions (tools/pathcheck.mjs:4707-4718) that state the composed
  scale and split scroll/world from RIG/bullets, with messages matching what
  the code does.
- MAJOR dangling `import('./palette.js')` — removed; the six roles resolve
  from `CONFIG.palette` (all six keys exist: shots.R, wasp, capsule,
  modCapsule, houndTell, player). tools/pathcheck.mjs:4744-4749 now walks
  every relative specifier in both juice modules and asserts the target file
  exists, so a re-introduced dangling import fails the gate.
- MINOR pools stepping after the death return — `updateJuice()` moved above
  `if (state !== 'PLAYING') return;` (src/main.js:255), with an order
  assertion at tools/pathcheck.mjs:4719-4724. The residual "effects hold on
  the death screen" is now consistent with the rest of the frozen world
  (`update()` is not called while not PLAYING, so `gameMs` stops with it).
- MINOR O(n) `claim()` — replaced by a per-pool Int32Array free stack
  (src/render/fx.js:87-92, 149-159); a row rejoins the stack exactly once,
  on its live→dead transition (fx.js:249), and `clearPool` rebuilds it
  wholesale, so no index can be stale or duplicated. Saturated claims fall
  back to one round-robin step. Asserted (pathcheck.mjs:4770-4780).
- MINOR unmeasured budget — tools/playtest/juice-stress.mjs plus
  artifacts/t011-juice/07-stress-perf.json record 256 live projectiles + 224
  sparks + 16 flashes at 8.33ms avg / 9.4ms worst / 0 frames over 20ms,
  against a no-load control and the same load under `?juice=0`, with the
  vsync-cap caveat stated in the tool, the JSON, tools/playtest/README.md and
  docs/DESIGN.md.

MINOR
src/render/juice.js:27 — stale header: "Colors are role names resolved by
fx.js (optional lazy palette import)". The lazy import is exactly what the
fix removed; fx.js's own header and DESIGN.md were updated, this one was
missed, so the next agent goes looking for an import that must not come back.

docs/DESIGN.md:462 (and src/mode.js:110) — still say `?juice=0` gives a
"byte-identical pre-juice build" where README.md:36 was corrected to
"simulation-identical". The simulation claim is now true and verified; the
frame is not literally identical (samplePerf still samples every frame and
`telemetry()` still carries the added `juice`/`perf` keys under `?juice=0`).
Prefer the README's wording in all three places.

Verified clean (no finding)
- Layer purity: no THREE/document/window in pure or sim; src/sim/time.js's
  only render contact is `view.juice.hitStop` through src/sim/bridge.js:34,
  declared as a noop and asserted inert by default; no sim file imports
  `../render/` (asserted per-file). pure/juice.js imports nothing.
- Determinism: no Math.random/Date.now/performance.now in pure or sim; bursts
  come from the seeded `hash01`, never the sim rng stream; hit-stop is a
  function of kills/hp/gameMs only, and pathcheck drives the clock at
  120/60/30fps to prove the same simulated time is removed at every cadence.
  The sim stays 2D; shake lives entirely in the render pose.
- Verdict compliance: nothing assembles anatomy (entry 3) — particles, a
  camera offset, and one additive warning band; `?hook=1` untouched; FAR
  default untouched and the shake budget is asserted against RIG's height
  (entry 7); frozen jump/movement constants unchanged (CONFIG gains only the
  new `juice` block).
- Edge safety: `calibrateEdges()` poses `_probe` from CONFIG, and
  `applyShake()` runs after `lookAt` on the real camera only — the one
  sanctioned render→sim write cannot be moved by an effect (asserted).
  `camera.position.set()` each frame means the shake cannot accumulate.
- Reset paths: `resetGame()` ends in `setState('PLAYING')`, and
  `src/sim/state.js:14` fires `stateScreen` on every set (even PLAYING →
  PLAYING), so the fixture fast-retry does clear the pools; trauma and the
  hit-stop clock are additionally zeroed directly in `resetGame()`.
- Test honesty: no assertion deleted or weakened — the only removed lines in
  tools/pathcheck.mjs are two import rewrites; the fix cycle added assertions
  rather than relaxing any. No playtest script retimed.
- Perf: fixed pools, no allocation in the spawn path (asserted), one draw
  call per pool, instance buffers uploaded only when something changed;
  `perfSnapshot()` and `juiceSnapshot()` are called from `telemetry()` only
  (on demand), and `samplePerf` writes into a preallocated Float64Array.
- Scope: fx.js was the reserved empty landing site on `main`; every other
  touched file is this pass's own lane. No new runtime deps (juice-stress
  uses tools/playtest's existing playwright-core), no build step, no OSTK
  artifacts, SPRINT.md untouched.
- Hook wrappers keep the 3-arg delegate shape of src/ui/audio.js, and every
  wrapped hook's call sites pass ≤3 args (checked in sim/weapons, sim/
  hostiles, sim/capsules, sim/wavegate, sim/transform, sim/state).

Operator questions (not blockers)
- Hit-stop scales RIG's own update, so control is slowed for 42ms per kill /
  90ms per hit. Intensity is the feel verdict this task defers.
- A kill landing inside a longer freeze extends the deadline but fires no
  second `view.juice.hitStop`, so a crowd kill reads as one beat with one
  shake.
- Timers stay on real `gameMs` during a freeze (the documented CHRONO
  convention), so up to ~110ms of enemy state-machine time passes while
  motion crawls. Far smaller than CHRONO's own accepted drift, but it is the
  same simplification and it now fires on every kill.
