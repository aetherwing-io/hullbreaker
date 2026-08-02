PASS

Gate playtest for T-035 (the value ladder, shipping at the operator-approved
half dose), HEAD `9e91d7b` ("fix cycle: ship the operator-approved dose (0.5)
ON by default"), branch `task/T-035`. This supersedes any stale FAIL/absent
verdict from the pre-fix build.

**Read this caveat before the results: the tree moved mid-gate.** While this
playtest was running, a concurrent agent merged `main` into `task/T-035`
(commit `fe333a0`, "Merge main into task/T-035: re-split the merged pathcheck
monolith, 1898 labels reconciled"), overwriting live files in the same
worktree path (`.claude/worktrees/T-035`) I was serving — `src/main.js` and
four other files rewritten at 00:25:19-27, confirmed by `stat` mtimes against
my run-output timestamps. I caught this by cross-checking file mtimes against
my report timestamps (build.md's own six-face-full-run outputs land in
`tools/playtest/runs/`, gitignored, so nothing of mine is committed there
either) and stopped, diffed `9e91d7b..fe333a0`, and re-did every affected
measurement against a **separate, immutable, detached worktree pinned at
`9e91d7b` exactly** (`git worktree add <scratch>/pin-9e91d7b 9e91d7b --detach`,
served on its own port, never touched again). All numbers below are from that
immutable pin except where marked. **Filed as a process issue below** — a
playtest gate should never share a mutable path with a lane that can still
write to it.

## Verdict basis

1. **Shipped default == approved dose — CONFIRMED independently.** Not by
   reading build.md/review.md's own hashes: I re-imported the live
   `src/render/scene.js` module in-page (`await import('/src/render/scene.js')`
   returns the cached ESM namespace with no window.HB exposure needed) and
   hashed every `InstancedMesh.instanceColor.array` plus `scene.fog`/
   `scene.background`, across servers for this worktree, a detached checkout
   of the pre-fix commit `83ad933`, and the main checkout's current HEAD.
   Result: `T-035 default` == `T-035 ?shade=0.5` == `83ad933 ?shade=0.5`
   (identical hash, fog 46.75/74.75, bg `#2f565e`) — the plain URL reproduces
   the exact frame the operator approved. `T-035 ?shade=0` == `main HEAD
   default` (identical hash, fog 44.25/72.25) — the escape hatch is exact.
2. **Combat readability, ladder ON, hostiles LIVE — nothing got harder to
   see.** Drove the shipped `six-face-full-run.json` policy (hold fire, hold
   right, hostiles live: wasp/hound/carrier all spawned) at `?shade=0`
   (pre-ladder), default (shipped 0.5), and `?shade=1` (rejected full),
   capturing frames mid-fight at matched moments (multiple wasps + RIG +
   bullet tracers + a magenta "H" capsule glyph on screen together; a
   verified houndframe TELL via the harness's own blink-phase wait). At every
   dose, including the rejected full dose: wasps (bright green triangles),
   the hound (cream/tan, clearly lit against the deck), RIG (white/grey
   figure), bullet tracers (small white dots), and the capsule glyph all read
   clearly against both the teal backdrop and the orange checker deck. I did
   not find anything that got harder to see at the shipped dose vs the
   pre-ladder look.
3. **`?palette=classic` byte-faithful — CONFIRMED independently**, same
   method as (1): `T-035 ?palette=classic` (shade absent) and `T-035
   ?palette=classic&shade=1` both hash identically to `main HEAD
   ?palette=classic` (same bg `#46525f`, same fog) — the unjudged Palette v1
   A/B instrument survives.
4. **The checker still carries scroll speed, judged in motion.** Held right
   at the default dose and sampled `window.HB.scrollX()` + screenshots every
   400ms: scrollX advanced steadily (~4.8 units/s, no stalls) and the
   orange/dark-orange checker pattern visibly scrolls under RIG across the
   sequence, staying high-contrast throughout — not judged from a still.
5. **Performance: 200+ live projectiles, zero regression, zero new draw
   calls — with an honest caveat about this shared machine.** Using the same
   method as T-011's `juice-stress.mjs` (the game's own `fireWeapon(clone=
   true)` × 12/frame saturating the 256-slot bullet pool, plus a death burst
   +flash/frame), a clean, uncontended reading taken right after the pin was
   built: **256 live projectiles, 120fps (vsync ceiling), worstMs 9.3-9.4ms,
   over20ms=0 at every dose** (control/default/`?shade=0`/`?shade=1`); draw
   calls stable at 105-108 across every configuration — zero delta from the
   dose. A later re-run of the identical script, taken while ~40 other
   Chrome/Node playtest processes from concurrent teammates were active on
   this shared machine, read a flat 30fps/33ms ceiling **identical between
   control (0 injected load) and stress (256 projectiles) and identical
   across every dose** — that uniformity is itself the tell that it is a
   host-level vsync/GPU-contention artifact of the shared machine, not a
   frame-cost regression, and I am not using it as the performance claim; it
   is reported for transparency only.
6. **Variance/distribution — spread preserved, re-measured after the
   contamination above was caught.** My first pass (3 default-dose runs vs 3
   `?shade=0` runs of `six-face-full-run.json --deterministic
   --max-runtime-ms 150000`) mixed one pre-merge run with five post-merge
   runs (the T-043 wasp-lock/squad-stagger code landed on the tree mid-run,
   confirmed by file mtimes) — discarded, not reported. Re-run cleanly
   against the immutable `9e91d7b` pin, 3 runs per side:
   | | best (max x) | worst (min x) | spread |
   |---|---|---|---|
   | default (shipped, dose 0.5) | 125.9 | 59.0 | 66.9 |
   | `?shade=0` (pre-ladder base) | 124.1 | 60.2 | 63.9 |
   Spreads are within ~5% of each other and the best/worst bands overlap
   almost completely (59.0-125.9 vs 60.2-124.1). **Honesty note (entry 19's
   standard):** a scripted bot reads `window.HB` state, not pixels, so this
   is not itself proof a *human's* outcome distribution is unmoved — it
   proves the **sim's** distribution is unmoved, which follows both from this
   measurement and from the code: `src/pure/shade.js`'s exports are called
   once at bake time in `limb.js`/`level.js` (module-init scope), never in
   the per-frame sim path, so there is no mechanism for the dose to reach
   `window.HB`'s state at all. The residual ~2-3 unit differences between
   otherwise-matched runs are real-time policy-evaluation jitter (this
   script's own description names the same noise source), not a shade
   effect. The human-readability side of entry 19's concern is (2) above.
7. **Regression and durability — green.**
   - `node tools/pathcheck.mjs` against the immutable `9e91d7b` pin: **1749
     passed, 0 failed**, reproduced twice. Base (`git merge-base main HEAD` =
     `31310be`, pathcheck run in a separate scratch checkout): **1704 passed**.
     Delta **+45**, a pure addition (no assertion count dropped) — matches
     both build.md's and review.md's claims, independently reconfirmed rather
     than inherited. Main's current HEAD (`03bd762` at time of writing): 1834
     passed; `git diff 9e91d7b..HEAD --stat -- src/` for main shows only a
     12-line append to `config.js` (T-041's own block) — none of T-035's six
     files were touched by main since the fork, consistent with review's
     finding #1.
   - Smoke suite: `mid-route.json` and `transform-slice.json`, both
     `--deterministic` against the pin: both **completed**, 0 deaths, 0
     falls, 0 console/page errors.
   - `?selftest=1` **PASS (35 checks)** at the default URL, `?shade=0`,
     `?shade=1`, and `?palette=classic` — 0 console/page errors on a clean
     page load (one stray favicon 404 seen once in a long-lived browser
     session did not reproduce on a fresh load and is unrelated to game
     code).
   - **Zero NaN/Infinity colours**: sampled all `instanceColor` arrays (8907
     channel values) after 20s of live combat (hits, deaths, hit-flash tint
     all exercised) — none.
   - **Zero console/page errors** across all 6 clean six-face-full-run
     variance runs and both smoke runs.

## Evidence (all ephemeral scratch, not committed — cite the commands to
reproduce, per this project's convention for run outputs)

- Fidelity/hash script, checker-motion capture, readability capture,
  hound-tell capture, stress-check: written to
  `/private/tmp/claude-501/.../scratchpad/*.mjs` this session; re-run with
  `node <script>.mjs` against a server on the immutable pin.
- Immutable pin used for the corrected measurements: `git worktree add
  <scratch>/pin-9e91d7b 9e91d7b --detach`, served via `node tools/serve.mjs
  8754 --root <scratch>/pin-9e91d7b --quiet` (worktree removed and port
  killed after use).
- Smoke + variance runs: `cd tools/playtest && node run.mjs
  scripts/six-face-full-run.json --deterministic --max-runtime-ms 150000
  --base-url http://127.0.0.1:8754 --out <dir>` (and `--url
  ".../index.html?shade=0"` for the base-look side); `mid-route.json` /
  `transform-slice.json` the same way with `--base-url`.
- Ports used: 8750 (initial pin of the live T-035 worktree, killed once the
  contamination was found), 8751 (detached `83ad933`, removed), 8752 (main
  checkout, killed), 8754 (immutable `9e91d7b` pin, worktree + port removed
  after use). 8741-8749/8753 never touched.

## PROPOSED INBOX ISSUES

## I-??? | docs | S2 | repro: n/a (process observation, not code) | evidence: file mtimes vs run-output timestamps this session; `git log --oneline 9e91d7b..fe333a0` in `.claude/worktrees/T-035`
A concurrent agent merged `main` into `task/T-035` (commit `fe333a0`) directly
in the shared worktree path `.claude/worktrees/T-035` while this playtest gate
was actively serving and testing that same path from a live HTTP server,
overwriting `src/main.js` and four other files mid-run. It happened to be a
reasonable fix (resolving review.md's finding #1, the pathcheck-monolith merge
risk) and the shade/palette rendering files T-035 actually changed were
untouched by it, but the mechanism is unsafe in general: a gate agent's
"pin the worktree" step only protects against the gate agent's own mutations,
not a teammate's. This contaminated one of two variance-measurement passes
(caught via mtime cross-check, redone against an immutable detached pin, not
reported). Fix direction: gates should always pin via a detached/immutable
copy (as this report's corrected measurements now do) rather than serving the
live `task/<id>` worktree path directly, OR the lane brief should say
explicitly that no one — including the integrator — touches a worktree once
a review/playtest gate has been dispatched against it, until the verdict
lands.

## I-??? | docs | S3 | repro: read `reports/tasks/T-035/review.md`'s opening paragraph vs `git show 83ad933:reports/tasks/T-035/build.md` and `git show 83ad933:src/pure/shade.js` | evidence: `resolveShadeGain` in `83ad933`'s `src/pure/shade.js` defaults absent/junk/negative to 0; that commit's own build.md states "The ladder is behind an off-by-default flag precisely so the operator judges it"; a live capture of `83ad933`'s plain default URL hashes identically to the escape-hatch (`?shade=0`) look, not to the full dose
`review.md`'s current re-review opens by calling `83ad933` "the FULL-dose-by-
default build the operator rejected." That's not what `83ad933` shipped: its
own code and its own build report both say the ladder was OFF by default
there, and the operator was shown the A/B via explicit `?shade=0`/`0.5`/`1`
query params on that pinned build (`docs/decisions.md` entry 14), not via a
differing default. This doesn't touch any claim that was actually load-bearing
— review's real verification target was `?shade=0.5` equivalence between
`83ad933` and `9e91d7b`, which I independently reconfirmed and which holds —
so it does not change this verdict. Worth a one-line correction in review.md
for future readers who take the framing at face value.

## What I judged and could not find fault with

Byte-fidelity of the shipped default, the escape hatch, and `?palette=
classic`; combat readability with the ladder on at every dose including the
rejected one; the checker's scroll-speed carrier in motion; draw-call and
frame-time neutrality across doses (under clean conditions); the sim's
outcome-distribution spread across doses; pathcheck's assertion count and its
purity/additivity over the merge-base; the smoke suite; selftest at four
configurations; colour-channel sanity after sustained combat. No P1/P2 game
defects found. Two process/docs findings above, neither blocking.
