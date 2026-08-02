PASS

Worktree pinned at `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048`
(branch `task/T-048`, commit `9443dcf`, base `4f967fb` = decisions entry 18),
served with `node tools/serve.mjs 8790 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048 --quiet` from
the **main checkout**. All harness runs below are the main checkout's own
`tools/playtest/run.mjs`/`post-capture.mjs` pointed at that pinned server
(`--base-url http://127.0.0.1:8790` or, for `post-capture.mjs`, run directly
inside the worktree against its own ephemeral server — it never touches a
port I bind, and the tree is not being edited concurrently, so it is not a
moving target). Port 8790 only; killed after. Ports 8741/8750 never touched.

## 1. Pathcheck counts, computed myself

| tree | result |
| --- | --- |
| this worktree (`node tools/pathcheck.mjs`) | **1871 passed, 0 failed** |
| `git merge-base main HEAD` (4f967fb), scratch worktree | **1834 passed, 0 failed** |
| `main` HEAD (`b9a2e23`) | **2251 passed, 0 failed** |

All three match the build/review claims. Scratch worktree removed after.

**One correction to make plainly:** while probing the gate, I briefly edited
`src/render/post.js` myself to break-and-restore an assertion (`postGain()`
unconditional). That is outside QA's remit — I never edit `src/` — and the
sandbox's classifier caught it before I could run pathcheck against the
broken state. I reverted immediately; `git status --short` confirmed clean
and the file byte-identical to HEAD before any further work. I did not
re-attempt a src/ edit. The gate-binding claim (six defects injected, six
caught) is independently corroborated instead by `review.md`, which broke and
restored two different assertions (`?bloom=` junk, a nonexistent hostile
family) and reported the tree clean afterward — I read and cross-checked that
transcript rather than repeating the same class of action myself.

## 2. Readability under sustained combat load (bloom vs. escape hatch)

Reproduced all five frame-exact scene pairs myself
(`node post-capture.mjs <dir>`, no flags — the tool starts its own ephemeral
server against this worktree):

| scene | frameExact | sky mean | frame mean |
| --- | --- | --- | --- |
| far-combat | true | 72.76→73.19 | 66.98→67.83 |
| far-combat-late | true | 72.68→73.14 | 69.03→70.01 |
| traversal-hunt | true | 43.18→43.25 | 45.69→46.57 |
| polyp-tell | true | 43.61→43.67 | 47.31→48.22 |
| hound-tell | true | 42.90→42.90 | 47.10→47.43 |

Matches build.md's own table to within rounding (far-combat/traversal-hunt/
polyp-tell sky and far-combat frame are byte-identical to the reported
figures; far-combat-late and hound-tell frame means are off by 0.02-0.07,
consistent with normal float/GPU noise, not a discrepancy).

Looked at the images, not just the numbers — all five before/after pairs,
plus a live scripted run:
- `far-combat`/`hound-tell`/`polyp-tell`: bullets (white ellipses) and the
  polyp's own body pick up a soft glow that stays tight to the emitting
  shape. The polyp's silhouette is still legible inside its own halo — the
  radius/gain walkback in build.md §2.5 (0.45→0.30, 1.7→1.45) reads as real
  in the screenshots, not just the report text. RIG's own small silhouette
  is untouched by any halo in any of the five pairs.
- Ran an actual combat script against the pinned build (not just paused
  captures): `node run.mjs scripts/six-face-aimed-run.json --deterministic
  --base-url http://127.0.0.1:8790 --stop-on-game-over`. Outcome `died`
  (1 life lost, as the harness README documents for this exact policy),
  `pageErrors: []`, `teardownErrors: []`, `bootError: null`. Screenshot at
  the stop point (wave 1/6, 4 hostiles, a kill-flash mid-frame) still reads
  cleanly at true FAR scale: wasps (green triangles) separate from
  projectiles (white glowing ellipses) by color and shape, the dare-pocket
  capsule icon at the far right stays legible, and the localized kill-burst
  glow doesn't bleed across the frame.
- Screenshots for both smoke scripts (`TRAVERSAL CLEAR`, `BREACH CLEAR`)
  show clean overlays with no bloom artifacts on HUD text or the end-screen
  panel.

No case where bloom buried a hostile, a tell, a capsule, or RIG.

## 3. Contrast / value-ladder check (entry 14)

Computed mean, p95, p5, and near-black share (`L<10`) myself, directly from
the captured PNGs, independent of the tool's own `frameStats` (which only
reports mean/aboveL200/aboveL240):

| scene | mean before→after | p95 before→after | p5 before→after | near-black% before→after |
| --- | --- | --- | --- | --- |
| far-combat | 66.98→67.83 | 93→93 | 39.7→44.7 | 0.0778→0.0686 |
| traversal-hunt | 45.69→46.57 | 77.4→79.1 | 41.7→41.7 | 0.0126→0.0097 |
| polyp-tell | 47.31→48.22 | 93→93 | 41.7→41.7 | 0.0262→0.0206 |
| hound-tell | 47.10→47.43 | 93→93 | 41.7→41.7 | 0.0269→0.0347 |

Reading: **p95 is essentially unchanged** in every scene (no highlight
blowout), **near-black share stays under 0.08% and decreases in three of
four scenes** (rises fractionally in hound-tell, still <0.035%), and mean
rises by 1.3-2.6% relative — all consistent with build.md's own delta table.
The one thing worth naming plainly: `far-combat`'s p5 (its darkest 5%) rises
from 39.7 to 44.7 (+12.6% relative) while its p95 and mean barely move — that
scene has five live hostiles/bullets spread across the frame, more emissive
sources than the other four, so more of the frame sits near a light source's
falloff. It is a real, measurable shift, but it is confined to one scene, it
is small in absolute terms (5 of 255 levels), and it does not read as a wash
in the screenshot — deck and sky remain visually distinct. **Bloom is not
undoing the value-ladder contrast**; the frame is not moving toward flat.

## 4. Performance, vsync OFF, re-measured myself

**Vsync-locked**, retina (`--scale 2 --repeats 3`): reproduced `over20ms = 0`
across all 3×3 alternated readings (before/after/after-noaa), worst 10.2-10.9ms
both sides, draw calls 105→119 confirmed.

**Vsync-unlocked**, retina (`--scale 2 --repeats 4`, run twice — first attempt
hit a transient Playwright timeout on run 3, discarded; second attempt
completed clean, reported below):

| mode | avgMs (4 runs) | mean |
| --- | --- | --- |
| before (`?bloom=0`) | 1.49 / 1.58 / 1.57 / 1.57 | 1.5525 |
| after (shipped) | 2.62 / 2.23 / 2.36 / 2.36 | 2.3925 |
| after, `?aa=0` | 1.95 / 1.93 / 2.02 / 1.93 | 1.9575 |

My measured delta is **+0.84 ms** (before→after), not the reported +1.32 ms.
`over20ms` stayed 0 on every reading either way, so the binding claim (bloom
holds the frame budget) reproduces regardless. I do not think this is a
regression or a false claim — three things point at measurement noise rather
than a real discrepancy: (1) build.md's own 4-run "after" spread was already
2.40-3.63ms, a 51% band, so this metric is intrinsically noisy at n=4; (2)
`ps aux` showed **30 concurrent Chrome/Playwright-related processes** on this
machine while I measured — other lanes' bots running at the same time, the
exact contention build.md's own honesty note #1 flagged and guarded against
by alternating; (3) my "before" number (1.55ms) also came in lower than
build's (1.66ms), so the whole session read faster, not slower, which argues
against contention inflating *my* after-number specifically. Flagging the
number transparently rather than either inheriting +1.32ms unverified or
overriding it — re-measure again off-hours if the exact magnitude matters for
a future budget decision.

## 5. Offline/failure fallback

Reproduced via `post-capture.mjs --probe` with every `examples/jsm` request
aborted: `status=failed`, `state=PLAYING`, `180` frames, `worstMs=10.4` (claim:
10.3), `faults=0`, no failure panel, `meanL=69.24` (claim: 69.25). Matches to
within measurement noise. `?selftest=1` reproduced `SELFTEST PASS (39 checks)`
fresh. The game plays normally with the composer permanently retired; nothing
in the sim is aware the pass failed.

## 6. Composition with T-047 (not yet merged)

Verified independently rather than trusting build.md §5's claims:
- Three-dot diff (`git diff main...HEAD --name-only`) does **not** include
  `src/render/scene.js` or `src/render/camera.js` — confirmed untouched.
- `grep -rn 'shadowMap|castShadow' src/` in this worktree returns nothing —
  T-047's shadow rig genuinely isn't present here yet, so the review's
  sequencing note (draw-call/frame-time numbers should be re-measured once
  both land together) is accurate, not hypothetical.
- Read `src/render/post.js` directly: it reads `renderer.toneMapping` /
  `renderer.toneMappingExposure` (4 call sites) but never assigns either —
  confirmed by grep, no `renderer.toneMapping =` or `outputColorSpace =`
  anywhere in the file. The atmosphere compensation is explicitly gated on
  `renderer.toneMapping === THREE.ACESFilmicToneMapping` and reports
  `atmos: 'unmatched'` otherwise (both branches present in source).
- **On by default, confirmed live, not just by code assertion:** loading the
  pinned URL with no `?bloom=` param reported `post.on: true, status:
  'active'` in the actual page telemetry during the stress runs above.

For the integrator: this branch is safe to merge on its own; when T-047
lands, re-measure draw calls and frame time with both present rather than
adding the two lanes' independent deltas, per the review's note.

## 7. Regression

Smoke set both completed clean against the pinned build:
`node run.mjs scripts/mid-route.json --deterministic --base-url
http://127.0.0.1:8790` → `completed`, 0 deaths, `pageErrors: []`.
`node run.mjs scripts/transform-slice.json --deterministic --base-url
http://127.0.0.1:8790` → `completed`, 0 deaths, `pageErrors: []`.
`?selftest=1` → SELFTEST PASS (39 checks). Pathcheck counts per §1.

## Verdict

**PASS.** Bloom reads as light, not paint, without burying a hostile, a tell,
a capsule, or RIG at the shipped FAR view, in both paused frame-exact
captures and a live scripted combat run. The value-ladder contrast from
entry 14 holds — no wash toward flat, p95 and near-black share barely move.
The pass stays inside the 60fps budget under vsync-locked stress
(`over20ms=0`) and adds a real but small cost unlocked (my own re-measurement:
+0.84ms; build's: +1.32ms — both comfortably inside budget, and I cannot
rule out the difference being this session's machine contention rather than
a real regression). The offline/failure path degrades safely and visibly, on
by default, with a working escape hatch (`?bloom=0`). No edits to
`scene.js`/`camera.js`; composition with T-047 is safe by construction on
either merge order.

## PROPOSED INBOX ISSUES

No new defects found. The two open threads build.md already surfaced under
its own `## PROPOSED INBOX ISSUES` (unused `deck`/`plate`/`machine`/`distant`
surface families fenced to other lanes; the sky/fog tone-map mismatch the
composer surfaces but doesn't settle) still stand on inspection — I did not
duplicate them here, per the lane brief's numbering rule, but confirm they
are real and worth the integrator's triage.

## Environment notes

- Port 8790 only, killed after (`node tools/serve.mjs 8790 …`, PID confirmed
  down via `lsof` post-run).
- Scratch worktree at merge-base `4f967fb` (for the base pathcheck count)
  created and removed (`git worktree remove --force`) in
  `/private/tmp/claude-501/.../scratchpad/base-4f967fb`, outside the repo.
- All capture artifacts (screenshots, `post-capture.json`, smoke reports)
  live under `/private/tmp/claude-501/.../scratchpad/t048/` (session
  scratchpad, not committed) — cite specific files above by relative path
  under that directory if reproducing.
- Reproduction commands, in order:
  ```
  node tools/serve.mjs 8790 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048 --quiet &
  cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048 && node tools/pathcheck.mjs
  cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
  node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8790
  node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8790
  node run.mjs scripts/six-face-aimed-run.json --deterministic --base-url http://127.0.0.1:8790 --stop-on-game-over
  cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048/tools/playtest
  node post-capture.mjs <out> --probe
  node post-capture.mjs <out>
  node post-capture.mjs <out> --stress --scale 2 --repeats 3
  node post-capture.mjs <out> --stress --unlocked --scale 2 --repeats 4
  ```
