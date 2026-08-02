# T-040 — RIG silhouette: five boxes to a real 30 px outline with three value zones

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040`,
branch `task/T-040`. Implements look-direction packet §3 item S8.

## SHARED PRELOAD GATE ADOPTED — and the interleaved re-gate finds a real, unresolved residual effect

Team lead's direction: use `src/render/preload.js` (built by T-049 after it hit
the identical mid-run-fetch defect on its own hostile sprites) instead of this
lane's bespoke `loadRigSpriteBeforeBoot()`/`Promise.race`/`settled`/
`RIG_SPRITE_BOOT_TIMEOUT_MS` machinery — "do not invent a second mechanism" —
and re-gate with a better methodology: interleave conditions within each
round, report the full distribution instead of a 2-3 run spread, and say
plainly which numbers are bimodal in the control rather than reading a signal
into scatter (this is the standard the previous FAIL/fix cycle was missing;
T-049 separately found `gameMsMax` bimodal in *its own* zero-asset control,
which meant my earlier n=2/n=3 evidence couldn't actually separate "the sprite
did it" from "the metric is just noisy" — team lead's words, and fair).

### What changed in the code

`src/render/player.js` now imports `preloadTexture`/`awaitPreloads` from
`./preload.js` and registers RIG's sprite through it exactly like
`src/render/sprites.js` registers the hostiles: `preloadTexture(url).then(entry
=> ...)` to apply the UV crop and swap the fallback out on `'ready'`, one
top-level `await awaitPreloads();` to hold the module graph (and so
`src/main.js`'s `requestAnimationFrame`) until every registered asset is
resident or the shared budget gives up. The bespoke timeout constant, the
`settled` flag, `Promise.race`, and the manual `renderer.initTexture()` call
are gone — `preload.js` does all of that internally now, once, for every lane.

`tools/pathcheck.mjs`'s T-040 block was rewritten to match: it now asserts
player.js imports `preloadTexture`/`awaitPreloads` from `./preload.js`, awaits
`awaitPreloads()` at top level, and carries **no** second bespoke
timeout/lock-in mechanism (`Promise.race`, `RIG_SPRITE_BOOT_TIMEOUT_MS`,
`renderer.initTexture(`, a bare `settled` flag, or `loadRigSpriteBeforeBoot`
itself) — each of the three new assertions broken and restored in turn to
prove it binds. Net -2 assertions (5 removed, 3 added) — 1789 → 1787 passed,
0 failed. The sim-purity check on `src/sim/player.js` was extended to also
reject `preloadTexture`/`preload.js` references, so the sim still cannot
branch on whether an asset loaded, now covering the new import names too.

Re-verified after the refactor, headless and in-browser (fresh servers on
ports 8793/8794, identity confirmed against the worktree's own files by line
count and, for `preload.js`, an MD5 match — I was burned twice earlier this
session by squatted ports serving stale content, so I check this every time
now):

- `node tools/pathcheck.mjs` → **1787 passed, 0 failed**.
- `?selftest=1` → **SELFTEST PASS (29 checks)**, `window.__HB_PRELOAD()` shows
  `rig-marine.png` reaching `'ready'` in 74ms, well inside the 2500ms shared
  budget, no `pageErrors`.
- `?selftest=1&rig=canvas` → still **SELFTEST PASS**; `__HB_PRELOAD()` shows
  an empty asset list (`costMs: 0`) — confirms the escape hatch never
  registers with the shared gate at all, exactly as before.
- Sprite file moved aside and selftest re-run → still **SELFTEST PASS**, no
  `pageErrors`, console carries exactly one line ("RIG sprite did not load
  (error); showing the procedural fallback instead."), `__HB_PRELOAD()`
  reports `state: 'failed'` — the asset-missing degrade-safely path still
  works unchanged through the shared gate.
- `tools/playtest/run.mjs scripts/mid-route.json --deterministic` completes
  (`outcome: completed`) against the refactored tree.

### The re-gate, with the new methodology — and an honest, not-clean result

Three conditions, 16 interleaved rounds (one run of each per round, so
whatever the shared session's ambient load is doing hits all three equally
within a round), `mid-route.json --deterministic`, reading
`meta.deterministicDispatch.gameMsMax` from each `report.json`:

- **base** — pristine `main` (commit `3c1c14e`, pre-T-040, zero runtime asset
  loading of any kind), served fresh on its own pinned port.
- **hatch** — this commit, `?rig=canvas` (the escape hatch: never touches
  `preload.js` at all, same code otherwise).
- **ship** — this commit, shipped default (RIG's sprite through the shared
  gate).

| round | base | hatch | ship |
|---|---|---|---|
| 1 | 6329.7 | 6329.8 | 6632.5 |
| 2 | 6331.6 | 6357.9 | 7234.4 |
| 3 | 6346.0 | 6334.5 | 6833.7 |
| 4 | 6500.4 | 6348.0 | 7150.5 |
| 5 | 6333.6 | 6352.8 | 7017.2 |
| 6 | 6316.1 | 6334.6 | 7152.3 |
| 7 | 6345.4 | 6333.6 | 5739.8 |
| 8 | 6326.9 | 6353.3 | 5746.3 |
| 9 | 6316.6 | 6358.7 | 7674.6 |
| 10 | 6340.5 | 6369.2 | 6551.6 |
| 11 | 6335.0 | 6354.3 | 6338.4 |
| 12 | 6361.4 | 6331.3 | 6345.8 |
| 13 | 6351.3 | 6336.8 | 6344.5 |
| 14 | 6349.6 | 6354.7 | 6346.7 |
| 15 | 6357.4 | 6361.8 | 6342.5 |
| 16 | 6330.9 | 6352.7 | 5747.4 |

Full distributions (sorted), n=16 each:

| condition | sorted `gameMsMax` (ms) | spread | biggest single gap |
|---|---|---|---|
| **base** | 6316.1, 6316.6, 6326.9, 6329.7, 6330.9, 6331.6, 6333.6, 6335.0, 6340.5, 6345.4, 6346.0, 6349.6, 6351.3, 6357.4, 6361.4, **6500.4** | 184ms | 139ms (one mildly-high value, not a second mode) |
| **hatch** | 6329.8, 6331.3, 6333.6, 6334.5, 6334.6, 6336.8, 6348.0, 6352.7, 6352.8, 6353.3, 6354.3, 6354.7, 6357.9, 6358.7, 6361.8, 6369.2 | 39ms | 11ms — no gap anywhere close to a second mode |
| **ship** | 5739.8, 5746.3, 5747.4, 6338.4, 6342.5, 6344.5, 6345.8, 6346.7, 6551.6, 6632.5, 6833.7, 7017.2, 7150.5, 7152.3, 7234.4, 7674.6 | **1935ms** | 591ms, between 5747.4 and 6338.4 |

**Saying plainly what the control shows, per the new house rule**: in this
16-round interleaved sample, **neither control is bimodal**. `base` is a tight
184ms-spread cluster with one unremarkable high value; `hatch` — same code as
`ship`, minus which texture is bound — is tighter still, 39ms across all 16
runs, no gap anywhere near "a second mode." That is a different result than
T-049 reported for its own zero-asset control (a ~9936ms outlier against a
6315–6344 cluster across 8 rounds) — I am not disputing that finding, which is
about a different sprite set on a different lane's code path; I'm reporting
what *my* controls did, on *this* measurement, honestly, rather than assuming
the same conclusion transfers.

**`ship` is not bimodal either, more precisely: it's a wide, right-skewed
spread with three visible clusters** — 3 runs low (~5743ms), 5 in the middle
(~6343ms, closely matching `hatch`'s own cluster), and 8 stretched across a
long high tail (6552–7675ms). 13 of 16 `ship` runs land at or above `hatch`'s
own maximum (6369.2ms); only the 3 low runs and none of the mid-cluster runs
undercut it. Both controls staying this tight at n=16 is itself evidence: if
the whole session were simply "getting busier" and hitting every condition
equally, I'd expect `base`/`hatch` to develop their own outliers by now, and
they haven't (checked round-by-round above — the rounds where `ship` is most
extreme, e.g. round 2 at 7234.4 or round 9 at 7674.6, are unremarkable rounds
for `base`/`hatch`: 6331.6/6357.9 and 6316.6/6358.7). **This is real dispersion
specific to the condition that actually draws RIG's loaded PNG, not shared
machine noise landing on everyone alike** — which is a materially different,
more concerning finding than "the metric is bimodal everywhere, ignore it."

### What I found chasing it, and what I'm not claiming

I do not want to just report the numbers and stop, since they point somewhere
specific. Comparing a low `ship` run (round 7, final `gameMs` 5739.8) against
a high one (round 1, final `gameMs` 6632.5) sample-by-sample: the two
trajectories track within ~10ms of each other for the entire scripted window
— they are not accumulating drift — until the low run's `deterministicDispatch`
records `stopReason: 'victory'` at 16/26 scripted events dispatched, while the
high run keeps going to 18/26 before its own `'victory'`. Both are legitimate
route completions (`deaths: 0`, `gameOverSeen: false` in both) — the bot
simply crosses the slice's end trigger at a different point in the scripted
sequence, which openloop scripts are sensitive to by construction (see
`tools/playtest/README.md`'s honesty note on why open-loop runs don't finish
route-identical) — but the SOURCE of that sensitivity, on this evidence,
correlates with which texture is bound for RIG's mesh, not with anything
`base`/`hatch` are doing in the same round.

My best-supported (not proven) hypothesis for the mechanism: `renderer.
initTexture()` — which `preload.js`'s `prepare()` calls during the awaited
boot phase — does call `gl.texImage2D`/`gl.generateMipmap` synchronously from
three.js's own source (checked against the exact CDN module, `three@0.170.0`,
`WebGLTextures.js`'s `uploadTexture`/`generateMipmap`), so the *JS-visible*
call really does look complete before frame 1. But `rig-marine.png` is a real
256×256 image with a full 9-level mipmap chain, against the procedural
fallback's tiny 34×96 canvas — and GPU drivers are well known to queue GL
commands and defer the actual execution of expensive ones (mipmap generation
among them) until the driver needs the result, which for a texture is the
next draw call that actually samples it. If that's what's happening here, the
cost `preload.js`'s boot gate was built to move off the live frame is still
landing on frame 1 of real gameplay for the ship condition specifically,
because the JS call that looks synchronous isn't necessarily synchronous on
the GPU side. I have not proven this with a GPU trace — I don't have the
tooling for that in this session — so I'm reporting it as my best-supported
hypothesis, not a finding.

**What this means for the task, precisely**: the SPECIFIC mechanism the
original playtest gate caught (an async `fetch`/decode landing mid-run) is
closed — verified structurally (no code path left that can do it) and
empirically (`preloadSnapshot` shows `'ready'` at 74ms, long before any
gameplay frame). But this interleaved re-measurement surfaces a second,
narrower effect that the shared gate as currently built does not appear to
close for a real (larger, mipmapped) sprite texture specifically. Since
`preload.js` is shared with T-049 and any fix belongs at that layer (e.g. an
explicit warm-up render/`renderer.compile()` pass at the end of the boot gate,
so the GPU driver is forced to actually finish the deferred work during boot
rather than on first sample) — not something I should patch privately inside
`player.js`, which would be exactly the "second mechanism" I was told not to
build — I'm escalating this rather than shipping a unilateral fix. Raw
`report.json` files for all 48 runs are in
`/tmp/t040-regate-runs/` (session-local; re-run via `tools/playtest/run.mjs
scripts/mid-route.json --deterministic --url <url>` against `base`/`hatch`/
`ship` URLs to regenerate, one run of each per round, interleaved).

### Housekeeping (repeated request)

`reports/tasks/T-040/review.md` was removed from this worktree in the prior
round (it cited pathcheck 1767 and the first, box-attempt evidence
filenames — stale before every rework since). Confirming again: it is gone,
not merely untracked; there is nothing left to commit or delete.

## PLAYTEST FAIL FIXED — the sprite's async load broke `--deterministic` mode

`reports/tasks/T-040/playtest.md` (verdict: FAIL) measured a real defect:
`THREE.TextureLoader().load()` for the sprite is async, and letting its
fetch/decode/first-use-GPU-upload land on an arbitrary live frame perturbed
`--deterministic` mode's frame timing enough to change the simulated
trajectory. Three identical scripted runs of `mid-route.json` landed at
`gameMs` 6352/6864/8308 (spread ~1956ms) and `minEdgeMargin`
35.336/35.313/32.898 (spread ~2.44 tiles) on the shipped default, where the
merge-base tree and this same commit's `?rig=canvas` escape hatch (which
skips the fetch) both stayed within ~20ms / 0.02 tiles.

### The fix

`src/render/player.js`'s `loadRigSpriteBeforeBoot()` now:

1. Kicks off the fetch, but the WHOLE sprite-vs-fallback decision is
   `await`ed at module top level. Because nothing else in the codebase
   imports named exports from `render/player.js` (it is a side-effect
   import in `src/main.js`), that top-level `await` blocks `main.js`'s own
   module evaluation — and therefore its `requestAnimationFrame(frame)`
   call — until the decision settles. The fetch can no longer land mid-run;
   it can only ever affect how long BOOT takes.
2. Forces the GPU upload eagerly via `renderer.initTexture(tex)` inside
   that same awaited path — three.js otherwise defers the actual
   `texImage2D` upload to the first frame that renders the texture, which
   would reintroduce exactly the same class of mid-run stall even with the
   fetch itself safely awaited.
3. Is bounded by `Promise.race` against a 2000ms timeout (`RIG_SPRITE_
   BOOT_TIMEOUT_MS`), so a slow or broken network delays boot by at most
   ~2s rather than hanging it — comfortably under the ~10s boot-watchdog
   budget mentioned in T-032's failsafe policy (not yet merged into this
   branch, so referenced in comments only, not imported).
4. LOCKS the decision with a `settled` flag once made (by success, failure,
   or timeout): a load that finishes moments after the timeout fires is
   deliberately ignored rather than swapped in mid-run. A rare slow-network
   player keeps the fully-working fallback for that whole session instead
   of risking the exact defect this fix exists to close.

`tools/pathcheck.mjs` gained 5 new assertions gating this structurally (top-
level `await`, `Promise.race` + a sane timeout bound, >= 2 `settled` guards,
`renderer.initTexture` present) — each broken and restored in turn to prove
they bind, same evidence standard as every other gate in this report.

### Re-measurement — the honest, complete picture

Re-ran the playtester's own measurement (`mid-route.json --deterministic`,
same commit) after the fix, and it is genuinely better, but I want to report
what I found precisely rather than round it to "fixed":

| condition | runs | `gameMs` values | spread |
|---|---|---|---|
| **T-040 HEAD, shipped default, WITH this fix** | 7 | 6536.5/6332.9/6828.4/6340.3/6323.6/6358.5/6858.3 | **535ms** |
| merge-base `d3f6628`, re-checked out fresh, same session, right now | 5 | 5750.0/6325.5/6368.2/6538.5/7140.5 | **1391ms** |
| T-040 HEAD, `?rig=canvas` (zero fetch), same session, right now | 3 | 6825.9/8318.4/6864.5 | **1493ms** |

Two things are both true here:

1. **The fix works.** Before it, ALL 3 sprite-default runs were scattered
   (spread ~1956ms, including one run 2.44 tiles worse on `minEdgeMargin`).
   After it, most runs (5 of 7: 6323.6–6358.5) land in a tight ~35ms
   cluster, with 2 further out (6536.5, 6858.3) — no run comes anywhere
   near the old ~2000ms-scale outlier, and the fixed sprite path's own
   spread (535ms) is now SMALLER than both the pristine, untouched
   merge-base tree's (1391ms) and this same commit's zero-fetch escape
   hatch's (1493ms), measured contemporaneously.
2. **General machine contention on this shared session is a large,
   separate factor right now**, and it affects EVERY tree, not just mine.
   `uptime` during this re-measurement showed load averages of 12–19
   (climbing over the course of the session — other agents' concurrent
   pathcheck/playtest runs), versus the playtester's own noted ~10–16
   during the original gate. Re-checking the UNMODIFIED merge-base tree
   just now, under today's higher load, produced a 1391ms spread on its
   own — far looser than the playtester's original ~19ms measurement of
   that exact same tree. This is consistent with, and additional evidence
   for, the pre-existing architectural risk `tools/playtest/README.md`
   already documents (the `t2-transform-seam-rush` finding) as a known,
   unresolved sensitivity of `--deterministic` mode to main-thread frame
   timing under load — not something introduced by, or left unfixed by,
   this task's sprite work.

**What I am claiming, precisely**: the specific mechanism the playtest gate
identified — an async fetch/decode/upload competing with the frame loop
during a live run — is closed, verifiably (the mechanism can no longer
occur at all once boot completes, by construction, not just "usually").
**What I am not claiming**: that `--deterministic` mode is now perfectly
reproducible on this machine under heavy shared load — it isn't, for any
tree, right now, and that is a pre-existing condition of this shared
session rather than a T-040 regression. If the operator or integrator want
byte-identical reproducibility even under heavy contention, that is the
`t2-transform-seam-rush`-class fix, a separate and larger piece of work
than this task's scope.

Raw `report.json` files for all 15 runs above are in `/tmp/t040-det-run{1..7}`,
`/tmp/t040-det-base{1..5}`, `/tmp/t040-det-canvas{1..3}` (session-local, not
committed; re-run the commands below to regenerate):

```sh
cd tools/playtest
for i in 1 2 3 4 5; do node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:<port> --out /tmp/sprite-$i; done
# compare trace[-1].gameMs / trace[-1].score.minEdgeMargin across runs
```

### Housekeeping (per the playtest gate's note)

The stale, untracked `reports/tasks/T-040/review.md` (citing pathcheck 1767
and the first, box-attempt evidence filenames) has been removed from this
worktree — it predated every rework in this report and would have misled
the next reader. A fresh review against this commit is still owed.

## CORRECTION — a file-naming mistake sent the wrong evidence to review

The team lead reviewed `v3-final-far-default.png` / `v3-final-5x-crop.png` /
`v3-bullet-family-5x-crop.png` and reported RIG reading WORSE than the
approved box version: thin, pale, low-contrast against the teal backdrop.
**Those files are not the current state.** They are this report's SECOND
attempt — the plain-shapes canvas sprite, superseded by the real PNG sprite
below — and I labeled this section "v3, current" while naming the sprite's
own evidence `v4-*`, which is exactly the kind of self-inflicted ambiguity
that sends a reviewer to stale evidence. That is on me, not the reader.

**The current state's own evidence is entirely under `v4-*.png` and
`v5-*.png`.** `v3-*` and everything in the "HISTORICAL — v2 attempt"
section below is superseded and should not be re-judged as-is.

That said, the underlying craft concern — silhouette mass and contrast
against the world, judged at a glance in a busy frame, not from a careful
still crop — is a fair test to demand regardless of which file was open,
so I ran it against the ACTUAL current sprite before replying. See
"Glance-test re-verification" below, added after the correction above.

## RULE CHANGE + SPRITE UPGRADE (v4, current) — read this first

`docs/decisions.md` **entries 16 and 17** landed mid-task and reopened, then
closed, this item's whole approach:

- **Entry 16**: "the game must boot with every file under `assets/`
  missing" is RETIRED. Runtime asset loading and sprites are AUTHORIZED. The
  one attached condition: a failed/missing asset must degrade visibly and
  safely, and **the sim must never branch on whether an asset loaded**.
  Entry 16 also retired blanket off-by-default flags for approved work —
  approved work ships ON, with an escape hatch back for comparison.
- **Entry 17**: the operator confirmed FAR **permanently** — "the idea is to
  make the player feel the scale of climbing a giant monster... i think we
  can do it really well if you try hard." RIG stays ~15×30 px. No camera
  change is coming to rescue character fidelity; the answer is a
  genuinely-crafted 30 px sprite, not a bigger RIG.
- Same session: the operator approved the five look-packet builds
  (including this task's v2 silhouette pass) — "all of those 5 builds look
  good to me." **That did not reverse the fidelity rejection** — the sprite
  upgrade is on top of an accepted foundation, not a rescue of a rejected one.

So: RIG is now a **real PNG sprite**, built through `tools/assets/` +
`codex`, loaded at runtime, with the v2 canvas-shapes version kept as the
graceful-degradation fallback.

### What changed

- **`assets/generated/sprites/rig-marine.svg`/`.png`** — the new sprite,
  generated via `tools/assets/gen.mjs` (which drives `codex exec`),
  rasterized via `tools/assets/rasterize.mjs`. Manifest entry `rig-marine`
  in `assets/manifest.json`, palette-checked (`hull`/`rust-orange`/`haze`/
  `ink`, all within `tools/assets/lib/palette.mjs`'s measured bands).
  Deliberately **body-only, no weapon drawn** — the existing 3D gun box
  still supplies the 8-way-aim weapon visual, so a baked-in gun would
  double up against it (this is why the brief explicitly told codex not to
  draw one).
- **`src/pure/rig.js`** — gained `RIG_SPRITE_PATH`/`RIG_SPRITE_W`/
  `RIG_SPRITE_H`/`RIG_SPRITE_UV`/`RIG_SPRITE_MAX_OVERRUN`/
  `RIG_SPRITE_CONTENT_ASPECT` and `spriteImageViolations()` (same
  prove-it-rejects shape as the existing `spriteViolations()`). The v2
  canvas-shapes data (`HELMET`/`TORSO`/`LEG_FRONT`/`LEG_BACK`/`VISOR`/
  `SPRITE_W`/`SPRITE_H`) is kept, unchanged, as the fallback's own data.
- **`src/render/player.js`** — now builds TWO body planes: `fallbackMesh`
  (the v2 canvas sprite, shown immediately, cannot fail) and `spriteMesh`
  (the real PNG, hidden until `loadRigSprite()`'s `THREE.TextureLoader`
  call succeeds, at which point it swaps in and hides the fallback). Both
  mirror on `player.facing` in `sync()`. `?rig=canvas` forces the fallback
  and skips the network load entirely (the escape hatch entry 16 asks for).
  On a failed load: `console.warn`, nothing else — the fallback was already
  showing and keeps showing.
- **`tools/pathcheck.mjs`** — new assertions for `spriteImageViolations`
  (shipped-clean + three prove-it-rejects cases), for the loader's presence
  (`TextureLoader`, `RIG_SPRITE_PATH`, the escape-hatch flag, a failure
  handler), for the asset file actually existing on disk, and — the entry
  16 condition, gated directly rather than trusted — that
  `src/sim/player.js` carries **zero** reference to `sprite`/`fallbackMesh`/
  `spriteMesh`/`TextureLoader` anywhere in its source.

### Why the sprite is wider than the collision box, on purpose

The generated art's own drawn bounding box (measured from the PNG's alpha
channel, not guessed) has a width:height of 0.513 — wider than the frozen
collision box's 0.7/1.7 = 0.412 — because a natural running/walking stance's
legs spread past the hitbox. This is a **render-only** choice: `CONFIG.
player.width`/`height` are untouched (verified: `git diff` against
`src/config.js` is empty), and it is the same documented-not-narrowed
precedent this file already carries for the gun (`GUN_OUTER_X` exceeds 2×
the collision half-width) and that `CONFIG.hound` already carries for its
own 2.4×-width visual silhouette over a tighter hit circle.
`RIG_SPRITE_MAX_OVERRUN` (1.3×) names the ceiling and `spriteImageViolations`
gates it, so a future asset swap can't silently grow past what was judged.

### The UV crop, and why it exists

The 256×256 source PNG is 77% transparent padding around the drawn figure
(codex draws into the square canvas gen.mjs's spec template requires — T-046
is extending `gen.mjs` for non-square canvases in a separate lane, so this
task did not touch that file). Mapping the whole square onto a plane sized
for the drawn content would stretch it; `RIG_SPRITE_UV` names the exact
crop rectangle (measured from the alpha bounding box) and `src/render/
player.js` applies it via `texture.offset`/`repeat` rather than editing
geometry UVs directly.

### Asset-generation iteration log

Three codex passes, each judged before moving on (see `reports/tasks/
T-040/evidence/`):

1. **`v4-rejected-iter1-with-gun.png`** — first brief asked for a running,
   firing marine. Read well even at true size
   (`v4-rejected-iter1-viewer.png`) but drew its own rifle, reaching wide —
   this would double up against the separately-rotating 3D gun mesh needed
   for 8-way aim, so it was rejected on a structural (not aesthetic) ground
   before ever reaching the render layer.
2. **`v4-rejected-iter2-wide-stance.png`** — regenerated body-only (no
   weapon, arms tucked), but the stance's feet spread to ~0.61× the
   figure's own height in width — wider than justified.
3. **Shipped**: same body-only brief, explicitly asked for a narrower
   profile ("total width... must not exceed roughly 60 percent of...
   height"). Bounding-box aspect came back at 0.513 — narrower, still a
   clear armored read (helmet, chest plate, back-pack bulge, separated
   legs) at true size (`v4-asset-pipeline-viewer.png`, the `tools/assets/
   view.mjs` composite — read the 29.6px leftmost figure, not the 8×/native
   panels to their right).

### Verification

- **`node tools/pathcheck.mjs`: `1784 passed, 0 failed`.**
- **`node tools/assets/check.mjs`: PASS** — manifest palette-checks both
  assets; the new runtime reference is listed (`src/pure/rig.js:69`), not
  rejected, matching the tool's documented runtime-vs-static-import
  distinction.
- **Browser `?selftest=1`: `SELFTEST PASS (29 checks)`**, against a
  server whose freshness was checked (`curl -I` + line-count match) before
  trusting the result.
- **Bot playtest** (`mid-route.json --deterministic`, verified server):
  `outcome: completed`, `deaths: 0`.
- **Facing flip**: `v4-sprite-facing-left-5x.png` — gun and pack both
  correctly mirrored running left.
- **Escape hatch** (`?rig=canvas`): `v4-escape-hatch-canvas-5x.png` — the
  v2 canvas fallback, confirmed distinct from the sprite.
- **Failure path, proven, not assumed**: renamed `rig-marine.png` away,
  recaptured (`v4-missing-asset-fallback-5x.png` — identical to the
  escape-hatch capture, as expected), and separately captured the page's
  own console/error stream: **zero `pageerror`s**, one 404 (expected), and
  my own `console.warn` firing with the exact logged message — then
  restored the file and reconfirmed `git status --short` clean.
- **Half-dose world** (decisions.md entry 14): re-verified via the same
  scratch-composite method as the v2 addendum below (T-035's current
  worktree, read-only, layered with this branch's files — nothing written
  back to `.claude/worktrees/T-035`), confirmed `SHADE_STRENGTH === 0.5`,
  captured `v4-halfdose-5x.png` — the sprite reads clearly against the real
  shipped background.
- **True on-screen size, put first per the operator's instruction**:
  `v4-sprite-far-default.png` (full frame) and `v4-sprite-true-size-crop.png`
  (native-resolution crop, no magnification) — `v4-sprite-5x-crop.png` is
  the detail view, not the judged one.

### Glance-test re-verification (added in response to the team lead's review)

The team lead's test, applied to the actual current sprite rather than the
stale files: full 1280×800 frames, deck + backdrop + hostiles in view,
holding right and firing through a live run (`?seed=7`, 10 captures over
~7s), judged "can I find him instantly" rather than "is the sprite well
drawn." `reports/tasks/T-040/evidence/v5-glance-test-frame1-full.png` and
`v5-glance-test-frame2-full.png` are two representative frames (RIG plus
2-3 hostiles each); `v5-glance-test-frame1-5x-detail.png` is a crop of
frame 1, included only to show WHY the full-frame read holds up, not as
the thing being judged.

**Self-assessment, not a verdict — the operator is the only one who judges
this**: in both frames I could locate RIG within a glance, including in
frame 1 where he stands against a lighter mid-teal wall panel rather than
the darker "sky" backdrop my earlier single-figure captures happened to
use. The rust-orange boots/pack accents and the dark ink outline (40% of
the sprite's own pixel coverage, per `tools/assets/check.mjs`'s palette
read) are doing real separation work there. I do not have a captured frame
where he reads as a "thin pale sliver" the way the STALE v3 evidence does —
the real sprite has visible torso/leg/helmet mass, not a 1-2px ribbon.

**What I am not claiming**: that this settles the operator's bar ("meet
the expectations of a little boy's father's game"), that the sprite cannot
be improved, or that further contrast/darkening would not help. Only that
the specific regression reported — reading WORSE than the approved box
version, thin-ribbon-like — does not reproduce against the actual current
files in the frames I captured. If the operator (or the team lead, on
these corrected files) still finds it wanting, that is a real, separate
finding I have not tried to argue away, and the lever most available to
me without another asset-generation round-trip is a material-level
tint/darken pass (see "Honest limits" below) rather than a full re-draw.

### Honest limits

- **A further contrast/darkening pass is possible without a new asset.**
  `spriteMesh.material` is a `THREE.MeshStandardMaterial` with a `map`; its
  `color` property multiplies against the texture, so a below-white tint
  (e.g. darkening toward `PAL.playerDark`) would darken the whole sprite
  uniformly, or a second lighter accent could be added the same way the
  fallback's visor accent works. Not done here because the glance-test
  re-verification above did not reproduce the reported regression against
  the actual current sprite — if the operator judges the corrected
  evidence and still wants more contrast, this is the fast lever, not
  another codex round-trip.
- **The overrun is real, not hidden.** The sprite's own drawn content is
  ~25% wider (at its half-width) than the collision box. It is bounded and
  asserted, and it is the same class of choice this file's gun and
  `CONFIG.hound` already ship with, but it is a genuine, if small,
  divergence between what is drawn and where the hitbox actually is.
- **The crop rectangle is a measured, hand-set constant**, not recomputed
  live. If `rig-marine.png` is regenerated, `RIG_SPRITE_UV` (and
  `RIG_SPRITE_CONTENT_ASPECT`) need re-measuring — the one-liner used is in
  this file's own history (a Python/Pillow alpha-bounding-box scan); there
  is no automated re-derivation step.
- **`gen.mjs`'s square-canvas constraint was worked around, not fixed** —
  T-046 owns extending it for non-square canvases; this task used the
  square canvas as-is (with padding + a UV crop) rather than touch that
  file, per lane discipline.
- **A parallel lane (T-049, visible in the shared task queue) appears to be
  building a generic runtime sprite-loader module for the five enemy
  roles.** This task's loader is scoped to RIG only and was not
  coordinated with that lane (no shared code); flagging it for the
  integrator as a likely future consolidation point, not a conflict today
  (different files: `src/render/player.js` vs whatever T-049 introduces).
- Draw calls: 3 meshes constructed (fallback plane, sprite plane, gun box),
  but only 2 are ever visible at once — the actual per-frame draw count is
  unchanged from the v2 rework (2), still down from the rejected v1's 7 and
  the original 5.

## Open feel questions for the operator (v3 — current)

Never judged here. Exact URL: `index.html` (shipped default, no query
flags), FAR camera. Evidence: `reports/tasks/T-040/evidence/v4-*.png` (true
size first, 5× crop for detail).

1. Does the real sprite read as "a much higher quality asset in line with
   the concept art" — the operator's own bar from the rejection — or is it
   an incremental improvement that still falls short?
2. The body-only design (no baked-in weapon) means the gun always reads as
   a separate object riding alongside RIG rather than integrated into his
   held pose — is that seam acceptable, or does the weapon need to be part
   of the sprite itself (which would require per-aim-angle sprite frames,
   a materially bigger task)?
3. Is the walking/running stance's asymmetry (front leg forward, back leg
   trailing, pack bulge on the back) reading as intended, or does it need
   a different silhouette entirely?
4. Should more of the packet's other approved sprite-adjacent ideas
   (backdrop tiers, human-scale reference objects — entry 17's stated
   priority, "selling the scale") take precedence over further RIG
   iteration, given RIG already improved twice this session?

## Best next action

Fresh review + playtest pass needed against this commit specifically (not
the superseded v1/v2 commits) — `reports/tasks/T-040/review.md` predates
this rework. If green, merge via `tools/orch/merge-task.sh T-040`, then
route the four v3 questions above to the operator's checkpoint queue.
Flag the T-049 sprite-loader overlap to the integrator for triage.

---

## HISTORICAL — v2 attempt (canvas-shapes sprite, superseded by the sprite above)

## OPERATOR REJECTION AND REWORK — read this section first

The box/value-zone version below (committed `7a48f27`/`a8e2bc9`, already
independently reviewed — `reports/tasks/T-040/review.md` — APPROVE) was
**rejected by the operator** on a screenshot of the shipped FAR view: *"this
is RIG? i was hoping for a much higher quality asset in line with the
concept art."* That review is superseded by this rework; do not treat it as
current. Everything from here through "What changed and why" below is the
**superseded v1 attempt**, kept as a historical record, not the shipped
state. The current state is described in this section and verified in
`## v3 verification` further down.

**The gap, read off the boards.** `docs/concept-art/01-exterior-gameplay.png`
(cropped/5×'d — see the operator dispatch for the exact crop) shows RIG as a
compact armored marine: a helmet with a small gold-amber visor glint, a
gunmetal-grey torso, and a dynamic running/firing pose — nothing like a
stack of six flat-shaded boxes. Board 13's tiny white silhouette still reads
as a *figure*, not a primitive, because of pose and outline, not detail (at
that size detail is invisible regardless).

**Why more boxes cannot fix it.** RIG is frozen at ~15×30 px on screen
(decisions.md entry 7). At that size, geometric detail (a visor box, a pack
box) contributes at most a few pixels and cannot read as a shape — the
six-box version's own evidence showed this. What DOES read at 30 px is a
*crafted 30 px image*: a deliberate outline, a few broad value regions, one
accent — a pixel-art-adjacent discipline, not a modelling one.

**The approach:** a small set of plain shapes (`src/pure/rig.js`'s `HELMET`
ellipse, `TORSO` polygon with its own back-side pack bulge, two independent
`LEG_FRONT`/`LEG_BACK` polygons) rasterized once into a `CanvasTexture`
(sanctioned per `.claude/skills/threejs-textures/SKILL.md`'s guardrails,
precedent at `src/render/capsules.js`'s `faceTexture`) and mapped onto a
single billboard-style plane, replacing all six boxes. The gun is
untouched — still the small 3D box it always was, still swept through
8-way aim every frame.

### Iteration log — three real mistakes, each caught by looking, not by reasoning

This section exists because the operator's instruction was explicit:
*"judge every iteration at TRUE on-screen size… put the true-size crop
first in your report, not the zoom."* Two of these three mistakes would
have shipped invisibly if judged only by a 5× crop or a flat 2D debug dump.

1. **A single hand-plotted silhouette polygon, authored blind.** First
   instinct: replicate `index.html`'s `.sl-rig::before` clip-path technique
   (one closed path, a notch pulled up between the feet to imply two legs)
   as a single 14-point polygon, coordinates picked by reasoning about
   fractions on paper, never rendered before wiring it into the 3D scene.
   Result, at true on-screen size:
   `reports/tasks/T-040/evidence/v3-mistake1-thin-ribbon-5x.png` — an
   illegible thin ribbon, not a figure. **Fix:** stopped trusting
   hand-derived coordinates; built a throwaway `page.evaluate()` that
   recreates the exact canvas-drawing code and dumps the texture alone as a
   PNG, viewed before touching the 3D scene again. That dump showed the
   real problem (see item 2's shape) and led to abandoning the "one clever
   path" idea for a small set of plain shapes (ellipse + polygons), which
   read as a figure immediately in the same standalone dump.
2. **Plain shapes, but still paper-thin in the real 3D scene.** The
   standalone canvas dump of the new plain-shapes design looked correct.
   Wired into the actual `PlaneGeometry` + `MeshBasicMaterial({alphaTest:
   0.5})`, the on-screen result was — again — a paper-thin vertical sliver:
   `reports/tasks/T-040/evidence/v3-mistake2-alphatest-paperthin-5x.png`.
   Root cause, confirmed empirically (not assumed): at RIG's true ~12 px
   on-screen width, the GPU's own mipmapping blurs the texture's alpha
   channel enough that an `alphaTest: 0.5` cutoff discards almost the whole
   shape, leaving only the highest-alpha center pixels. **Fix:** switched
   to `transparent: true` alpha *blending* instead of an alphaTest cutout —
   blending degrades gracefully under mip-blur; a cutoff does not.
3. **Fixed the thinness, introduced a wash-to-white.** With blending fixed,
   the shape's outline was correct, but every value zone (dark torso, mid
   helmet) rendered as near-uniform light grey, at BOTH the shipped FAR
   distance and a much closer `?view=near` test (which ruled out a
   minification artifact, since minification would matter less up close,
   not identically): `reports/tasks/T-040/evidence/v3-mistake3-unlit-
   washout-5x.png`. Root cause, worked out from `src/render/palette.js`'s
   own header note ("values are authored against what the renderer
   PRODUCES… with the light rig + ACES tone mapping") and confirmed by
   computing the actual ACES Filmic curve against the raw token values:
   `MeshBasicMaterial` is UNLIT, so it fed the canvas's raw RGB straight
   into the tone-mapping curve with no light-rig attenuation first: ACES's
   midtone compression pushes an unlit ~0.47 input to ~0.71-0.75 output
   for BOTH `playerDark` and `playerMid`, collapsing the two into nearly
   the same near-white — computed by hand from the Narkowicz ACES
   approximation three.js uses, and it matched the measured on-screen
   pixels closely. **Fix:** switched to `MeshStandardMaterial` (lit), the
   same material every other mesh in the game uses and the material the
   whole palette was calibrated against — the zones separated again.

A fourth, smaller lesson that did NOT need a mistake screenshot to learn:
a thin ink outline and a soft gradient lift-band (added for extra polish
after fix 3) measured as barely-there on screen — any feature narrower than
roughly a texel or two of the *final* on-screen size (not the supersampled
canvas) is sub-pixel once minified and blends away rather than reading as a
separate feature. Dropped both in favor of BROAD, single-flat-color zones,
which is what actually shows up as distinct regions at this size.

### What ships now

`src/pure/rig.js`: `HELMET` (ellipse), `TORSO` (polygon, pack bulge baked
into its own edge), `LEG_FRONT`/`LEG_BACK` (independent polygons, a real
gap between them), `VISOR` (accent ellipse), plus `SPRITE_W`/`SPRITE_H`/
`CANVAS_W`/`CANVAS_H` and `spriteViolations()` (the envelope gate — every
field overridable so pathcheck can construct synthetic bad cases). Gun data
(`GUN_BOX`, `gunLocalXSpan`, `GUN_INNER_X`/`GUN_OUTER_X`) is carried forward
unchanged.

`src/render/player.js`: `paintRigTexture()` draws `LEG_BACK`/`LEG_FRONT`
(mid), `TORSO` (dark), `HELMET` (mid), and the visor accent (gun-gold) as
FLAT fills onto a canvas once at module load; a `PlaneGeometry(SPRITE_W,
SPRITE_H)` with a `MeshStandardMaterial({map, transparent: true, side:
DoubleSide})` carries it. `sync()` gained one line: `bodyMesh.scale.x =
player.facing < 0 ? -1 : 1` — the silhouette is authored facing +x (front/
gun side), so it mirrors correctly when the sim's own facing flips, using
the same sign `CONFIG.player.aim` already reads. Everything else in
`sync()` (crouch squash, flow lean, i-frame blink) is untouched.

`src/render/palette.js`: `playerDark`/`playerMid` widened past their
original gap (both tables) — the tone-mapping mistake above meant the
original raw gap, correct in the abstract, read as nearly flat once lit and
tone-mapped; re-measured on screen before and after, not assumed.

`tools/pathcheck.mjs`: the T-040 block rewritten for the new shape set
(`spriteViolations` replaces `rigEnvelopeViolations`, one prove-it-rejects
case per shape kind), draw-call count updated (`RIG` now draws exactly 2
meshes total — 1 body plane + 1 gun box — down from the rejected version's
7 and the ORIGINAL 5).

### v3 verification

- **`node tools/pathcheck.mjs`: `1774 passed, 0 failed`.** Broke the
  envelope guard again on this version (`SPRITE_W` widened to 0.9) and
  confirmed two independent assertions fail with the exact expected
  messages, then restored to green with a clean `git status --short`.
- **Browser `?selftest=1`: `SELFTEST PASS (29 checks)`** — verified against
  a freshly-confirmed server (checked response `Content-Length`/line count
  against the actual file before trusting the result; a stray server on a
  reused port gave a false pass earlier in this same session and was
  caught the same way).
- **Bot playtest** (`mid-route.json --deterministic --base-url
  http://127.0.0.1:8771`, server identity verified first): `outcome:
  completed`, `deaths: 0`.
- **Facing flip**: ran left with a fired shot —
  `reports/tasks/T-040/evidence/v3-facing-left-5x-crop.png` shows the gun
  and the silhouette both correctly mirrored.
- **True-size result** (put first, per the operator's instruction):
  `reports/tasks/T-040/evidence/v3-final-far-default.png` (full frame,
  shipped default URL) and the native-resolution crop inside it. The 5×
  crop for detail is `v3-final-5x-crop.png`.
- **Bullet-family check, re-measured on the final version**:
  `reports/tasks/T-040/evidence/v3-bullet-family-5x-crop.png` — a fired
  rifle burst next to RIG. The torso now reads visibly darker than the
  tracer at native resolution, a real, larger separation than the v1
  version's head-only bright zone gave (numbers below).

Native-resolution (1×) pixel samples from the final version, sampled
directly, not estimated:
- background (laddered default): `(28,53,53)`
- torso (dark, majority of the figure): roughly `(100-140, 100-140,
  95-125)` — a real, visible step down from
- helmet/legs (mid): roughly `(150-160, 148-158, 130-142)`
- tracer (for comparison, same capture): `(226,222,205)`, still brighter
  than either RIG zone, but now clearly separated from the torso rather
  than sharing a value family with the whole figure the way v1's
  all-bright design did.

**Honest limit, stated plainly:** this is still a small, soft result at
true size — recognizably a runner with a gun, head/torso/leg value
separation, an asymmetric pose and a back-side pack bulge, but it is not
"high detail" in the way the concept art itself is, because 30 px cannot
carry that much information regardless of technique. If the operator's bar
requires more than this size can support, the honest next step is the
escalation the dispatch itself named: propose a RIG-size change against
decisions.md entry 7, with evidence, rather than keep re-authoring the same
30 px canvas. That is a decision for the operator, not something to
silently work around here.

---

## HISTORICAL — v1 attempt (superseded, six boxes/three zones)

Everything from here to "Addendum — recalibrated against the shipped
half-dose world" is the REJECTED first attempt, kept for the record.

## What changed and why

RIG's box list moved out of `src/render/player.js` into a new pure module,
`src/pure/rig.js`, so the silhouette's ENVELOPE (does every box stay inside
the frozen 0.7 × 1.7 collision box, laterally and vertically?) is gated by
`pathcheck` instead of trusted from review — same precedent as
`src/pure/shell.js`'s `compositionViolations`.

Two boxes were added to the table:
- **visor** (0.30 × 0.10 × 0.30, head front) — the helmet/visor break.
- **pack** (0.22 × 0.34 × 0.16, torso back) — the pack mass.

Three value zones now split the six body boxes (was four: torso/head/legL/
legR):
- **bright** — head + visor + gun arm → `PAL.player` (unchanged token: the read)
- **dark** — torso + pack → new `PAL.playerDark`
- **mid** — legs → new `PAL.playerMid`

`src/render/player.js` now builds every body mesh from `RIG_BOXES` in a loop
(one `THREE.Mesh` per box, material picked by `zone`), and builds the gun
mesh from a `GUN_BOX` constant in the same module, instead of six/seven
hand-written literal calls. `sync()` (crouch squash, flow lean, i-frame
blink) is untouched — it still operates on the whole `rig` group.

`src/render/palette.js` gained `playerDark`/`playerMid` in **both** `CLASSIC`
and `CONCEPT`, each inside a delimited `/* ==== T-040 RIG silhouette ==== */`
block at its insertion point (two insertion points — one per table — since
the two tables are separate object literals; each is clearly delimited).
CLASSIC's pair are hand-authored neutral greys (not derived from any CONCEPT
role, matching CLASSIC's own byte-faithful-to-grey-box character). CONCEPT's
pair are darker steps down the *same* warm-neutral family as `PAL.player`
(low channel spread, `r >= g >= b`) — a hue change would be a new color role
per the packet's correction, so none was introduced.

`tools/pathcheck.mjs` gained one delimited block
(`T-040: RIG silhouette (pure + guards)`) appended immediately before the
final summary print (an ES module's `import` is hoisted regardless of its
textual position, so this is legal at the literal end of the file, which is
what the dispatch asked for).

### The adversarial-review correction, honored explicitly

The packet flagged an earlier draft's claim — "the silhouette can never lie
about where RIG is" — as false: `src/render/player.js`'s gun sweeps a
0.75-long box through 8-way aim every frame and already reaches `|x| =
0.825`, more than double the 0.35 collision half-width. I did not try to
narrow the gun (out of scope, and it's an aim-pose fact, not a silhouette
defect). Instead:

- `rigEnvelopeViolations()` in `src/pure/rig.js` is asserted over **body**
  boxes only (`RIG_BOXES` — head/visor/torso/pack/legL/legR); the gun is
  never passed to it.
- The gun's own local x-span is a separate exported fact
  (`GUN_INNER_X`/`GUN_OUTER_X`, computed from `GUN_BOX`, not a hand-copied
  literal), and `tools/pathcheck.mjs`'s new block asserts `GUN_OUTER_X ===
  0.825` (the packet's own measured figure) and `GUN_OUTER_X > 2 *
  BODY_HALF_WIDTH` **by name**, so the gate documents the true, wider-than-
  the-body state instead of passing green over a violated property.
- Both `src/pure/rig.js`'s header comment and `tools/pathcheck.mjs`'s new
  block restate this in words, not just in code.

Also carried: the two shipped per-frame transforms (`rig.scale.y = squash`
for `?crouch=1`, `rig.rotation.z = lean` for `?flow=1`) are noted in
`rig.js`'s header as blind spots this table cannot see — it gates the REST
pose only, applied to the whole assembled group, so it can't break any
individual box's envelope.

## Files touched

- `src/pure/rig.js` — **new**. `RIG_BOXES`, `GUN_BOX`, `BODY_HALF_WIDTH`,
  `BODY_HEIGHT`, `ZONES`, `gunLocalXSpan()`, `GUN_INNER_X`/`GUN_OUTER_X`,
  `rigEnvelopeViolations()`.
- `src/render/player.js` — box list replaced by a loop over `RIG_BOXES` +
  `GUN_BOX`; three zone materials instead of one shared material;
  `sync()` unchanged.
- `src/render/palette.js` — `playerDark`/`playerMid` added to `CLASSIC` and
  `CONCEPT`, each in a delimited T-040 block.
- `tools/pathcheck.mjs` — one delimited block appended at the end (before
  the summary print).

Nothing else was touched — confirmed with `git status --short` /
`git diff --stat` showing exactly these four paths throughout.

## Collision box / movement: unchanged (verified, not just claimed)

`BODY_HALF_WIDTH = CONFIG.player.width / 2` and `BODY_HEIGHT =
CONFIG.player.height` are **read** from `CONFIG.player`, never written —
`src/pure/rig.js` has no assignment into `CONFIG` anywhere. `tools/
pathcheck.mjs`'s new block asserts `BODY_HALF_WIDTH === 0.35` and
`BODY_HEIGHT === 1.7` explicitly, so a future change to either constant
fails loudly here rather than silently deriving a new envelope. `sync()`'s
crouch/flow logic is byte-identical to before this task.

## Draw-call delta

Before: 4 body meshes (torso/head/legL/legR) + 1 gun mesh = **5**.
After: 6 body meshes (+ visor, + pack) + 1 gun mesh = **7**.
Delta: **+2**, matching the packet's budget exactly. Asserted in
`tools/pathcheck.mjs` (`RIG_BOXES.length + 1 === 7`).

## Verification

**`node tools/pathcheck.mjs`: `1767 passed, 0 failed`.**

Evidence the new assertions actually bind (LANE-BRIEF's evidence standard —
a gate proven only by going green is not evidence): I broke each of the two
load-bearing new checks in turn and confirmed the exact expected failure,
then restored and reconfirmed green + a clean `git status --short`/`git diff
HEAD --stat`:

1. Widened `torso`'s `x` from `0` to `0.6` in `src/pure/rig.js` →
   `node tools/pathcheck.mjs` → `1766 passed, 1 failed`, with:
   `FAIL T-040: the shipped RIG body table is inside its own envelope —
   torso: x-extent [0.360,0.840] reaches 0.840, past the 0.350 collision
   half-width`. Restored → `1767 passed, 0 failed`.
2. Changed `CONCEPT.playerMid` to `0xe5e2d9` (near-identical to `player`) in
   `src/render/palette.js` → `1766 passed, 1 failed`, with:
   `FAIL T-040: concept RIG zones clear a 100/765 luminance floor between
   every pair (12, 332)` (the 12 is exactly the packet's failure mode: two
   tokens landing only 2% apart). Restored → `1767 passed, 0 failed`.

Also exercised, inline in the same pathcheck block (not just "prove it
breaks" — the synthetic cases run every time): a box escaping the lateral
half-width, a box topping out above the collision height, an undeclared
zone name, and a table missing a zone are all separately constructed and
asserted to produce the matching violation message.

**Browser smoke** (`?selftest=1`, served locally on a scratch port, killed
after): `SELFTEST PASS (29 checks)`.

**Bot playtest** (`tools/playtest/run.mjs scripts/mid-route.json
--deterministic`): `outcome: completed`, `deaths: 0`. No behavior change was
expected (render-only), and none appeared.

**Worktree hygiene**: `git status --short` shows exactly
`src/pure/rig.js` (new) + the three modified files, no stray artifacts, both
before and after every capture/break/restore cycle in this session.

## Evidence

Captured via a scratch Playwright script (not committed, not under
`tools/playtest/**`) against a temporary local server, killed afterward.
**First attempt was invalidated and redone**: port 8753 turned out to be
squatted by an unrelated stray `python -m http.server` from earlier in this
shared session (my `node tools/serve.mjs 8753` failed to bind and logged
"already in use," which I didn't check before capturing) — both "before" and
"after" shots from that attempt were silently served from the stale
process's own tree and were identical. Re-verified the server identity via
`curl -I` (`Server:` header) before recapturing on a genuinely free port,
and confirmed in-page (via a temporary, since-removed console.log) that all
three zone materials resolve to the correct, distinct hex values before
trusting any screenshot.

- `reports/tasks/T-040/evidence/before-far-default.png` /
  `after-far-default.png` — full 1280×800 frame at the shipped FAR default
  (`?deterministic=1`, no other flags), RIG mid-run.
- `reports/tasks/T-040/evidence/before-5x-crop.png` /
  `after-5x-crop.png` — a 140×170 native-resolution crop around RIG, scaled
  5× with point (nearest-neighbor) sampling, no interpolation.

Native-resolution (1×, un-scaled) pixel read at RIG's on-screen size — the
actual thing a player sees, not the 5× magnification — sampled straight down
a column through the figure in the "after" crop:
- head/visor band (`y=76..81`): RGB ≈ (167,165,151), sum 483
- torso/pack band (`y=82..96`): RGB ≈ (69,64,51), sum 184
- leg band (`y=97..104`): RGB ≈ (121,116,95), sum 332

Three distinct, ordered bands (bright > mid > dark) are genuinely present at
true on-screen scale, not only in the 5× crop.

**Baseline used above: the pre-T-035 flat build.** All screenshots and pixel
reads in the section above were captured against my own worktree, which does
not carry T-035's value ladder at all — there is no `src/pure/shade.js`, no
`CONFIG.shade`, on `task/T-040`. That is the flat, un-laddered background.

## Addendum — recalibrated against the shipped half-dose world (decisions.md entry 14)

The operator ruled the value-ladder dose at **half** (`docs/decisions.md`
entry 14: "C on the ladder feels better, shade=0.5 the other is too dark"),
shipped as the **default** — not a query flag. T-035 (which owns
`src/config.js`/`src/pure/shade.js`/`src/render/level.js`/`src/render/
limb.js`/`src/render/camera.js`) has this on its branch, uncommitted, as a
live fix-cycle at the time of writing; it has not merged to `main` and my
branch does not carry it, so my own worktree cannot render the real shipped
background on its own.

**Method — composite, never committed, never merged.** Built a scratch copy
(outside the repo, under the session scratchpad) by copying T-035's current
worktree in full (its committed + uncommitted state, read-only — nothing in
`.claude/worktrees/T-035` was touched), then overlaying my own
`src/pure/rig.js` and `src/render/player.js` verbatim, and hand-splicing my
two delimited `playerDark`/`playerMid` blocks into T-035's current
`palette.js` at the same two insertion points I use on my own branch (`git
diff`-verified those insertion points are untouched by T-035's edits, so
this is not a resolution of any real conflict — see the player.js note
below). Confirmed `SHADE_STRENGTH === 0.5` by direct module import before
trusting anything rendered from it, and confirmed `?selftest=1` still prints
`SELFTEST PASS (29 checks)` against the composite. Served on a scratch port,
killed after. This composite is evidence-only — none of it is on my branch,
and nothing under `src/config.js`/`src/pure/shade.js`/`src/render/{level,
limb,camera}.js` was written by me anywhere.

**`src/render/player.js` note for the T-039 coordination ask:** read T-039's
current (uncommitted) diff to that file before touching anything. Its edits
are a new import plus two new lines after `scene.add(rig)` plus one new line
inside `sync()` — none of it touches the box-construction block my change
owns, so the two diffs land in disjoint regions of the file. No action
needed beyond staying aware of it, which is what this note is.

**Result: the darker world does not hurt RIG's silhouette — if anything it
helps.** The backdrop teal in the laddered default reads noticeably darker
(`(16,32,32)`, sum 80) than the flat build's (`(28,53,53)`, sum 134), which
*increases* the value gap between RIG's zones and the background rather
than closing it. RIG's own tokens are unaffected by the ladder (it only
touches environment instance colors), so the same three bands from the flat
build reappear unchanged at native resolution, sampled at the identical
on-screen size against the real shipped background:

- background (laddered default): `(16,32,32)`, sum 80
- head/visor: `(167,165,151)`/`(175,173,160)`, sum ≈ 483–508
- torso/pack: `(69,64,51)`, sum 184
- legs: `(121,116,95)`, sum 332
- deck (context): ≈ `(174–184,113–122,48–78)`, sum ≈ 345–384

Evidence: `reports/tasks/T-040/evidence/halfdose-far-default.png` (full
frame, shipped default URL — no query flags — against the composite),
`halfdose-5x-crop.png` (native-res 5× crop, same method as the earlier
section), `shade0-flat-5x-crop.png` (`?shade=0` on the same composite, for a
direct before/after of the ladder itself with everything else held fixed).
**No code change was made or needed**: my palette tokens are static hex
values, not derived from `CONFIG.shade` in any way, so there was nothing to
retune — this addendum is a verification pass, and it came back clean.

### The RIG-vs-own-bullets value family (pillar 5)

Fired a rifle burst in the same composite and captured RIG and his own
tracer in one frame: `reports/tasks/T-040/evidence/bullet-family-5x-crop.png`.
Measured natively: the tracer renders at `(226,222,205)`, sum 653 — brighter
than RIG's head/visor band (sum ≈ 483–508) by a real margin, but the same
*hue family* (both near-white, warm-neutral, R>G>B by a small margin). That
family-sharing is a **documented design choice**, not an oversight:
`src/render/palette.js`'s role table names RIG "warm off-white — the player
silhouette (**muzzle family**)" as role 6, immediately under MUZZLE (role 5)
— they were deliberately grouped.

What this task's already-shipped zone split changes, quantified rather than
asserted: **before T-040, 100% of RIG's silhouette carried this family**
(one flat token, torso/head/legs alike — see the pre-existing `before-5x-
crop.png` in this same report). After T-040, only the **bright** zone
(head + visor) is in that family; by the box table's own vertical extent
(`src/pure/rig.js`, `RIG_BOXES`), that is:

- bright (head ∪ visor, y 1.4–1.7): **0.30 / 1.695 ≈ 17.7%** of RIG's height
- dark (torso ∪ pack, y 0.525–1.375): **0.85 / 1.695 ≈ 50.1%**
- mid (legs, y 0.005–0.555): **0.55 / 1.695 ≈ 32.4%**

So roughly **82% of RIG's silhouette moved out of the bullet's value family
by this task**, down from 100%. I read that as the direct, already-realized
part of the pillar-5 win — measured from the geometry, not eyeballed.

**What I did not do, and why:** I did not shrink or retint the bright zone
further. `PAL.player` is used outside this module too (`src/render/mods.js`'s
ghost-clone tint, `src/render/fx.js`'s particle color), and the item's own
spec explicitly keeps it as "the **existing** bright `PAL.player`" — an
unchanged token was a stated constraint, not an oversight I could quietly
relax. Fully separating RIG's remaining bright zone from his own tracers by
*hue* (rather than value) would reverse the documented "muzzle family"
grouping in `palette.js`'s role table, which is exactly the kind of change
the standing correction on this item flags as needing `docs/decisions.md`
first ("a different hue is a new color role"), not a unilateral render
tweak from this lane. I'm reporting the measured remainder (~18% of RIG,
brighter than the other two zones by design, sharing a hue family with his
own tracers by *existing* documented design intent) rather than deciding
whether that remainder is a problem — that's a look call for the operator,
not something a machine gate or I get to resolve by picking a new color.

## HISTORICAL — v2's own operator questions (superseded by the v3 sprite above; question 4 is answered by entry 17 — FAR stays, do not re-ask)

Never judged here — machine gates don't judge fun or look. For the exact
URL: `index.html` (shipped default, no query flags) at the FAR camera. Put
`v3-final-far-default.png` / the native-resolution crop in front of the
operator FIRST — the 5× crop (`v3-final-5x-crop.png`) is detail evidence,
not the thing being judged.

1. At true on-screen size, does this read as a *figure* — helmet, torso,
   legs, gun — or still as an indistinct blob? This is the direct
   replacement for the rejected six-box version; is it actually better, and
   is it enough?
2. Does the asymmetric running pose (front leg reaching down-forward, back
   leg trailing, a back-side pack bulge) add anything at this size, or does
   the pose read as noise/blur rather than motion?
3. The dark torso now visibly separates from the bright rifle tracer
   (`v3-bullet-family-5x-crop.png`) — is that separation enough, or does
   RIG still get lost among his own shots in a firefight with several
   tracers on screen at once?
4. This build report's own honest limit: is a flat-shape canvas sprite at
   ~15×30 px capable of the quality bar you want at all, or does closing
   that gap actually require RIG to be bigger on screen — which would mean
   revisiting decisions.md entry 7 (the frozen FAR default), a call only
   you can make?
5. Is the visor glint (the one accent) visible/legible at this size, or is
   it too small to register at all?

## HISTORICAL — v2's own "next action" (superseded — see the top of this report for the current one)

Send to review/playtest per the loop protocol — the existing `reports/
tasks/T-040/review.md` is for the SUPERSEDED v1 commit and needs a fresh
pass against the current `src/pure/rig.js`/`src/render/player.js`/
`src/render/palette.js`/`tools/pathcheck.mjs`. If both come back green,
merge via `tools/orch/merge-task.sh T-040` from the main checkout, then
route the five v3 questions above to the operator's checkpoint queue with
the URL and evidence paths listed. If the operator's answer to question 4
is "make him bigger," that is a pillar/decisions-entry-7 conflict per this
lane's standing instructions — escalate it rather than resolve it here.
