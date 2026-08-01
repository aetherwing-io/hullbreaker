REQUEST_CHANGES

Gate run: `node tools/pathcheck.mjs` in the worktree — 859 passed, 0 failed.
Browser boot (headless Chromium, worktree served on :8763): `index.html?selftest=1`
→ title `SELFTEST PASS (17 checks)`.

MAJOR
src/main.js:244 — CHRONO regression, outside this task's lane. `main` ran
`updateScroll(dt * wScale)` with `wScale = chronoScale`; this branch runs
`updateScroll(dt * hScale)`, so the pursuing scroll (and the `updatePace` dt
it drives) no longer slows during the CHRONO modifier while hostiles and
capsules still do (`dt * wScale`, lines 249/251). CHRONO's shipped meaning —
`docs/DESIGN.md:455` "world at 0.35×" — silently changes, the mod gets more
dangerous rather than less, and the change survives `?juice=0` (hScale is
pinned to 1, but the chrono factor is still gone), which falsifies the
"byte-identical pre-juice build" claim in README.md:34 and docs/DESIGN.md:460.
`wScale` is already computed on line 243 and already carries `hScale`; the
fix is `updateScroll(dt * wScale)`.

tools/pathcheck.mjs:4707 — the new assertion hard-codes the regression above
(`/updateScroll\(dt \* hScale\)/`) under a message that claims "scroll, RIG,
projectiles and the CHRONO-scaled world all take the same hit-stop factor" —
which is exactly what the code does not do for CHRONO. Whatever line 244
becomes, this regex and its message have to state the composed scale, or the
next agent reads a green gate as proof the behavior is intended.

src/render/fx.js:59 — `import('./palette.js')` targets a module that exists in
neither this branch nor `main` (T-010 is unmerged and currently
REQUEST_CHANGES). Verified against the served worktree: every boot issues
`404 http://127.0.0.1:8763/src/render/palette.js` and logs a console error.
tools/playtest/lib/driver.mjs:44 filters only the favicon 404, so this lands
in the "Errors observed" section of every playtest report from now on
(reports/tasks/*/playtest.md), and the playtester's standing orders judge
`errors/console/bootError`. tools/pathcheck.mjs:4727 then asserts the lazy
import must be present, so the dangling reference is locked in. Either land
the pass with the CONFIG.palette roles only (and let the palette lane wire
its own colors when it merges), or gate the import on a flag/feature probe
that does not fetch a non-existent URL. Related, non-blocking: T-010's
palette table has no `enemyGlow` token (its header says so explicitly), so
even after that lane merges the death-burst role would silently keep the
grey-box fallback while the enemies around it change color.

MINOR
src/main.js:254 — `updateJuice()` sits after the `state !== 'PLAYING'` early
return (line 248) and `resetFx()` only runs on re-entering PLAYING
(src/render/juice.js:176), so live sparks and flashes freeze mid-air on the
death/victory screen until the next run starts instead of finishing their
life curves.

src/render/fx.js:151 — `claim()` linear-scans the whole pool per particle; with
the 224-spark pool saturated, one 10-particle death burst walks up to 2240
rows. Bounded and allocation-free, but it is the only non-constant cost in
the spawn path — a free-list or a single round-robin cursor would remove it.

artifacts/t011-juice/ — the DoD asks for a measured "60fps with 200+
projectiles + effects". `perfSnapshot()` (src/main.js:392) is the right
instrument and 07-stress-after.png shows the stress frame, but no reading is
recorded anywhere in the diff, so the packet still asserts the budget rather
than showing it. Paste the `?testapi=1` `perf` object (fps/avgMs/worstMs/
over20ms) into the task report or an artifact next to the screenshot.

Verified clean (no finding)
- Layer purity: sim/pure carry no THREE/document/window; `src/sim/time.js`'s
  new render contact is `view.juice.hitStop` through src/sim/bridge.js:34,
  declared as a noop, and the sim imports no render module (asserted).
  `src/sim/time.js` importing `../mode.js` matches twelve existing sim modules.
- Determinism: no Math.random/Date.now/performance.now in pure or sim; bursts
  come from the seeded `hash01`, never the sim rng stream; the sim stays 2D
  and the shake lives entirely in the render pose.
- Verdict compliance: nothing assembles anatomy (entry 3) — the additions are
  particles, a camera offset and an additive warning band; `?hook=1` untouched;
  FAR default untouched; frozen jump/movement constants unchanged; the shake is
  bounded in world tiles and asserted against RIG's height for the FAR view
  (entry 7).
- Edge safety: `calibrateEdges()` poses `_probe`, not the shaken camera, so the
  one sanctioned render→sim write cannot be moved by an effect (src/render/
  camera.js:51-60).
- Test honesty: no assertion deleted or weakened (pathcheck ok() count 545 →
  607, the only removed line is an import rewrite); the hit-stop clock is
  driven at 120/60/30fps and asserted to remove the same simulated time.
- Hook wrappers use the same 3-arg delegate shape as src/ui/audio.js:356, and
  every wrapped hook is called with ≤3 args, so no existing render hook loses
  an argument.

Operator questions (not blockers)
- A kill landing inside a longer freeze extends the deadline but fires no
  second `view.juice.hitStop`, so a crowd kill reads as one beat with one
  shake. Intended per the comment; worth a feel verdict.
- Hit-stop scales RIG's own update (`dt * hScale`), so control is slowed for
  42/90ms on every kill and hit — the intensity question the task defers to the
  operator.
