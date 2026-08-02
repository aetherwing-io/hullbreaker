FAIL

Gate subject: `task/T-040`, HEAD `10b5d9e` ("T-040 report: clarify a naming mistake,
add glance-test re-verification"), worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040`.
Read `docs/LANE-BRIEF.md`, `reports/tasks/T-040/build.md`, `reports/tasks/T-040/review.md`,
and `docs/decisions.md` entries 15/16/17 (on `main`; this worktree's own `docs/decisions.md`
predates them — it branched at merge-base `d3f6628`, before entries 14-19 landed).

Server: worktree served on `http://127.0.0.1:8765` via `node tools/serve.mjs 8765
--root .claude/worktrees/T-040 --quiet` (ephemeral port, not 8741/8742; killed at
the end of this gate). Merge-base tree checked out read-only at
`git worktree add /private/tmp/.../scratchpad/base-d3f6628 d3f6628`, served on
`http://127.0.0.1:8766`.

## 0. Pre-existing process note (not part of this verdict, but load-bearing context)

`reports/tasks/T-040/review.md` in this worktree is **stale**: it is untracked
(`git status --short` shows `?? reports/tasks/T-040/review.md`, never committed)
and its own text references pathcheck `1767 passed` and evidence file names
(`before-far-default.png`, `after-far-default.png`) that match the **first,
operator-rejected v1 box attempt** (commit `a8e2bc9`), not the current v4 PNG-sprite
HEAD (`10b5d9e`, `1784 passed`). No review exists yet against the sprite rework
(`24eb9b1`) or the report-correction commit (`10b5d9e`). I did not treat this
review as current; I re-verified everything myself from the actual HEAD rather
than trusting either the stale review or build.md's own numbers. Flagging this
gap for the integrator — a fresh review pass against `10b5d9e` is still owed.

## 1. Pathcheck + smoke set — GREEN

- `node tools/pathcheck.mjs` in the worktree: **1784 passed, 0 failed** (matches
  build.md's own final figure).
- Merge-base `d3f6628` in a scratch worktree: **1741 passed, 0 failed** — branch
  adds 43 assertions, consistent with the new sprite-loader block.
- `main` HEAD `24b23d6` (for reference, not the base used for the delta above):
  **2216 passed, 0 failed**.
- `node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8765`:
  `outcome: completed`, `deaths: 0`, `pageErrors: []`, `bootError: none`,
  `stopReason: victory`.
- `node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8765`:
  `outcome: completed`, `deaths: 0`, `pageErrors: []`, `bootError: none`,
  `stopReason: victory`.
- Browser `?selftest=1` was not independently re-run by me beyond the smoke
  scripts above (build.md's own `SELFTEST PASS (29 checks)` claim is consistent
  with a healthy tree and I have no reason to doubt it, but I did not re-run it
  myself — noting this as unverified-by-me rather than inheriting it silently).

## 2. Glance test at true FAR size, in live combat — PASSES ITS OWN BAR

Method: `tools/playtest/scripts/six-face-spaced-run.json` (the shipped default
`index.html`, no query flags beyond the harness's own `testapi=1`) run with
`--deterministic --base-url http://127.0.0.1:8765 --video --max-runtime-ms 45000`.
Extracted full 1280x800 frames from the recorded video with `ffmpeg` at three
combat moments, cross-checked against the run's own `trace[]` (`tMs`/`hostiles`/
`kills`) to confirm each frame actually shows live hostiles and an in-progress
fight, not a quiet moment:

- `t≈1.8s` — early run, no hostiles yet, RIG alone against a wall panel.
- `t≈25.7s` — `WAVE 1/6 — 4 HOSTILES` HUD banner, 5 kills logged, two wasps
  materialized nearby (one `dive`).
- `t≈40.9s` — 10 kills logged, a hound plus two wasps materialized nearby.

Evidence (copied into this report's own evidence folder, not committed to
`main` by me): `playtest-evidence/qa-glance-frame-t1.8s.png`,
`qa-glance-frame-t25.7s-wave1-5kills.png`,
`qa-glance-frame-t40.9s-10kills-hound.png`, plus 5x native-resolution crops
(`qa-glance-crop-*-5x*.png`).

Judgment: in all three full frames, RIG is findable at a glance — a small
armored figure (helmet, torso, gun bar, articulated legs) against both the
darker wall-panel backdrop and the lighter sky/deck backdrop, clearly distinct
in silhouette from the blocky rectangular level geometry and from the hostiles
(rendered as saturated green diamonds/triangles, a very different hue and
shape language). I did not lose him in any of the three frames, including the
two busy combat ones. This is a real, meaningful improvement over the
operator-rejected box version.

## 3. Separation from his own tracers — PARTIAL, MEASURED BOTH WAYS

Native-resolution (1x, un-scaled) pixel sampling, Python/Pillow, directly on
the extracted frames (not estimated):

- **When a bullet is not on top of him** (`t≈1.8s` frame, a departed tracer
  ~25px away from RIG): RIG's own brightest point (a highlight, likely the
  gun-mount/shoulder) peaks around RGB-sum **~430-455**; most of his figure
  reads **~130-430**, some of it (the dark ink outline) actually *darker* than
  the ~136-sum wall-panel background it sits against. The tracer itself reads
  **~660-765** (up to pure white `(255,255,255)`). That is a real, comfortably
  measured value gap — RIG is not in the same "brightest blob" bracket as his
  own shots when they're in flight away from him. This is a genuine
  improvement over entry 15's finding (the old box version put his *entire*
  body in one uniform near-white token, sharing the tracer's value family
  100% of the time).
- **At the instant a shot is fired** (`t≈25.7s` frame — `qa-glance-crop-
  t25.7s-5x-muzzle-overlap.png`): the muzzle point sits on RIG's own body, so
  a freshly-spawned round (RGB `(255,255,255)`, sum 765) renders directly on
  his torso for a frame or two. He does **not** vanish — his helmet and legs
  remain visible on either side of the bright dot — but a real, reproducible
  partial occlusion of his torso happens every time he fires, because the
  gun's muzzle point is on his own body. This is structural to the existing
  gun/fire mechanic (unrelated to this task's sprite work, and not something
  T-040 was asked to fix), but it means "the four brightest blobs are RIG and
  three of his own shots" (entry 15's original framing) doesn't fully
  disappear — it becomes "RIG's torso occasionally IS one of the brightest
  blobs, for one frame, because his own bullet is sitting on it." Reporting
  this precisely rather than rounding it to either "fixed" or "not fixed."

## 4. Asset-missing fallback (entry 16's condition) — CONFIRMED, PROVEN NOT ASSUMED

- Renamed `assets/generated/sprites/rig-marine.png` → `.png.bak`. Loaded
  `http://127.0.0.1:8765/index.html?testapi=1` in a scratch Playwright script,
  drove it into `PLAYING`, and captured console/network/page state:
  `pageErrors: []`; console carried exactly the expected
  `[warning] RIG sprite failed to load; showing the procedural fallback
  instead.` plus one `404` for the renamed file; screenshot shows the v2
  canvas-shapes fallback figure, game fully playable (fell off once, ×2
  lives shown, unrelated to the missing asset).
- `?rig=canvas` escape hatch, asset present: renders the identical fallback
  figure, confirming it is a genuine, working escape hatch, not gated behind
  the missing-asset path.
- Independently grepped `src/sim/player.js` for
  `sprite|fallbackMesh|spriteMesh|TextureLoader`: **zero matches** — confirms
  by direct inspection (not trusted from build.md) that the sim does not
  branch on asset-load status.
- Restored `rig-marine.png`, confirmed `git status --short` clean afterward
  (only my own new report files show as untracked).

## 5. Render-only / determinism — FAILS THE SPECIFIC CHECK THIS GATE ASKED FOR

This is the reason for the FAIL verdict.

`git diff d3f6628 HEAD --stat -- src/config.js` is empty — `CONFIG.player`
(collision box, movement constants) is byte-identical to the merge-base. That
part of "render-only" holds. But the dispatch's actual ask was narrower and
stronger: **"compare a deterministic run against the base tree and confirm
identical positions."** I could not confirm that, and instead measured the
opposite:

Ran `scripts/mid-route.json --deterministic` repeatedly, same commit, same
machine, back-to-back (so ambient system load — this shared session was
running under load average ~10-16, with two long-lived stray
`node tools/pathcheck.mjs` processes from other agents pinned at ~100% CPU
each — was held as close to constant across all three conditions below as a
shared machine allows):

| condition | runs | final `gameMs` | spread | `minEdgeMargin` | spread |
|---|---|---|---|---|---|
| merge-base `d3f6628` (`--base-url :8766`) | 2 | 6326 / 6345 | **19ms** | 35.375 / 35.396 | **0.02** |
| T-040 HEAD, `?rig=canvas` (skips the network fetch) | 2 | 6356 / 6359 | **3ms** | 35.331 / 35.335 | **0.004** |
| T-040 HEAD, shipped default (sprite, on by default) | 3 | 6352 / 6864 / **8308** | **~1956ms** | 35.336 / 35.313 / **32.898** | **~2.44** |

Base and the escape-hatch mode are both tightly reproducible, matching the
harness README's own documented behavior for this exact script ("victory time
spread shrank... to 74ms... over 10x tighter" under `--deterministic`). The
shipped default is not: one of three runs took ~2 seconds longer in sim time
and scraped the crush edge almost 2.5 tiles closer than the other two. Turning
the escape hatch on — which does nothing except skip
`THREE.TextureLoader().load()` for the sprite PNG — restores base-tree-level
tightness on the same commit. That isolates the cause to the new async sprite
fetch specifically, not to general system noise (which would have shown up in
the base-tree numbers too, and didn't).

Read plainly: **the same scripted input, byte-identical, produces a
measurably different physical trajectory and a materially worse closest
crush-edge approach on some runs of the shipped build, purely because of
asset-load timing competing with the render/physics frame loop.** This is
exactly the class of frame-boundary sensitivity `tools/playtest/README.md`'s
"Deterministic injection mode" section already documents as a known,
unresolved architectural risk elsewhere in this codebase (the `t2-transform-
seam-rush` finding) — T-040 is the first task to add a new source of main-
thread work (a network fetch + texture decode/upload) during the exact early
window that risk lives in, and it reproducibly triggers it here.

This does not mean collision code or `CONFIG` changed — they didn't, and
`build.md`'s "Collision box / movement: unchanged" section is correct as far
as it goes. But it is silent on the fact that the *played, observed*
simulation outcome is not run-to-run reproducible in the shipped default
mode, which is the more load-bearing claim for "render-only" and the one this
gate was specifically asked to check. Per this project's own evidence
standard, an assertion whose subject is "the code I touched" rather than "the
observable result a deterministic run produces" is the exact failure pattern
to guard against.

Raw report.json files for all 7 runs above are in
`/private/tmp/claude-501/.../scratchpad/{det-t040,det-t040-run2,det-t040-run3,
det-t040-canvas-run1,det-t040-canvas-run2,det-base,det-base-run2}/report.json`
(session scratchpad, not committed — paths given for this gate's own
reproducibility; re-run the commands in §7 below to regenerate).

## 6. Perf — GREEN, and better than the reference figure

- **Draw calls**, measured live via `renderer.info.render.calls` (dynamic
  `import('./src/render/scene.js')` inside the running page, same module
  instance the game booted — not a code-count guess): merge-base **101**
  (confirms the dispatch's own "101 baseline" reference), T-040 HEAD default
  **99**. A net **decrease of 2**, not an increase — consistent with build.md's
  claim that the six-box-plus-gun original (5 meshes) collapsed to one body
  plane + one gun box (2 meshes), even though the current diff carries a third,
  normally-hidden fallback plane.
- **200+ live projectiles**, `tools/playtest/juice-stress.mjs` (256-slot
  bullet pool saturated + full spark/flash pools, `window.HB.perf()`'s 180-
  frame wall-clock ring):
  - T-040: `fps 121.1, avgMs 8.26, worstMs 10.3, over20ms 0`, 256 live
    projectiles.
  - merge-base: `fps 120.3, avgMs 8.31, worstMs 10.4, over20ms 0`, 256 live
    projectiles.
  - Statistically indistinguishable; 60fps holds with zero dropped frames on
    both trees, comfortably above the 200-projectile bar.

## 7. On-by-default — CONFIRMED

A plain `?testapi=1` session (no `rig=` flag) renders the real PNG sprite by
default (the same draw-call measurement in §6 was taken in this mode); the
`?rig=canvas` escape hatch renders the v2 fallback on demand. Matches entries
16/17's "approved work ships ON, with an escape hatch back."

## Reproduce this gate

```sh
# server (kill when done — do not touch 8741/8742):
node tools/serve.mjs 8765 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040 --quiet &

cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040
node tools/pathcheck.mjs                                     # 1784 passed, 0 failed

cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8765
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8765
node run.mjs scripts/six-face-spaced-run.json --deterministic --base-url http://127.0.0.1:8765 --video --max-runtime-ms 45000

# determinism check (§5) — repeat 3x each, compare trace[].gameMs / .x / .score.minEdgeMargin:
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8765                              # shipped default (sprite)
node run.mjs scripts/mid-route.json --deterministic --url "http://127.0.0.1:8765/index.html?slice=traversal&rig=canvas"  # escape hatch

# perf (§6):
node juice-stress.mjs /tmp/t040-stress    # 256 live projectiles, fps/avgMs/worstMs/over20ms
```

## PROPOSED INBOX ISSUES

Not self-numbered per the lane brief — proposing for integrator triage.

## I-??? | bug | S2 | repro: `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --base-url <pinned task/T-040 10b5d9e>` x3, compare against the same script with `--url ".../index.html?slice=traversal&rig=canvas"` x2 and against merge-base `d3f6628` x2 | evidence: this report §5; `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/{det-t040,det-t040-run2,det-t040-run3,det-t040-canvas-run1,det-t040-canvas-run2,det-base,det-base-run2}/report.json` (session scratchpad — re-run to regenerate if these are cleaned up)
The shipped default RIG sprite's async `TextureLoader` fetch introduces real run-to-run non-determinism into `--deterministic` mode: 3 identical-input runs land at `gameMs` 6352/6864/8308 (spread ~2s) and `minEdgeMargin` 35.336/35.313/32.898 (spread ~2.4 tiles), where the merge-base tree and the same commit's own `?rig=canvas` escape hatch (which skips the fetch) both land within ~20ms / 0.02 tiles across repeats. The fix direction is almost certainly to decouple the texture decode/upload from the frame that's mid-flight (preload before the sim clock starts advancing, or ensure the swap-in doesn't stall a `requestAnimationFrame` callback), not to touch collision/CONFIG, which are already untouched.

## I-??? | docs | S3 | repro: open `<task/T-040 10b5d9e>/reports/tasks/T-040/review.md`, note it is untracked (`git status --short`) and its own text/pathcheck-count (`1767 passed`) matches commit `a8e2bc9` (the operator-rejected v1 box attempt), not `10b5d9e` (the current v4 sprite, `1784 passed`) | evidence: `reports/tasks/T-040/review.md` vs `reports/tasks/T-040/build.md`'s "v4 verification" section; `git log --oneline -- reports/tasks/T-040/review.md` (empty — never committed)
No review exists yet against the current HEAD (the sprite rework, `24eb9b1`, or the report-correction commit, `10b5d9e`). The loop protocol calls for review + playtest on the same commit; this gate ran playtest without a matching current review. Needs a fresh review pass before/alongside any merge decision.

## I-??? | feel | S3 | repro: open `reports/tasks/T-040/playtest-evidence/qa-glance-crop-t25.7s-5x-muzzle-overlap.png` (native-resolution crop, no magnification beyond the stated 5x) | evidence: same file; pixel reads in this report §3
At the instant RIG fires, the muzzle-spawned round (near-pure-white) renders directly on his torso for a frame, partially occluding it — structural to the gun's muzzle-at-body-position geometry, not a T-040 regression, but it means entry 15's "shares a value family with his own bullets" finding is only mostly closed, not fully. Routing as a feel/readability question rather than a bug: does this brief torso occlusion during rapid fire read as acceptable, or does the operator want the muzzle point moved off-body (a larger change)?

## Open feel questions for the operator (not judged here)

Carried forward from build.md unchanged — machine gates don't judge fun/look.
Exact URL: `index.html` (shipped default, no query flags), FAR camera. See
build.md's "Glance-test re-verification" section and this report's §2/§3
evidence for the additional combat-frame captures.
