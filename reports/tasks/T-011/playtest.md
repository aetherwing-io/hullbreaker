PASS

Gate: T-011 (juice — baseline feedback pass). Playtester verdict on the
pinned worktree `.claude/worktrees/T-011` at `14ade6b`
("T-011 review fixes: restore CHRONO on the scroll, drop the dangling palette
import, measure the budget"), served read-only on `:8804`
(`python3 -m http.server 8804`, cwd = that worktree; killed after the run).
Main checkout served on `:8805` for the pre-juice baseline comparison only.
Every harness invocation is the MAIN checkout's `tools/playtest`.

Nothing in this report is a fun verdict. Feel observations are parked as
operator questions at the bottom.

## Run commands (all exited 0)

```sh
# required smoke set, pinned worktree
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 \
     --base-url http://127.0.0.1:8804 --out runs/gate-T-011-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
     --base-url http://127.0.0.1:8804 --out runs/gate-T-011-transform

# (a) ?juice=0 A/B — same scripts, flag appended via --url
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 \
     --url "http://127.0.0.1:8804/index.html?slice=traversal&juice=0&testapi=1" \
     --out runs/gate-T-011-mid-juice0
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
     --url "http://127.0.0.1:8804/index.html?slice=transform&enemies=0&juice=0&testapi=1" \
     --out runs/gate-T-011-transform-juice0
# repeats + pre-juice baseline (main checkout on :8805)
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
     --base-url http://127.0.0.1:8804 --out runs/gate-T-011-mid-b
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
     --url "http://127.0.0.1:8804/index.html?slice=traversal&juice=0&testapi=1" \
     --out runs/gate-T-011-mid-juice0-b
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
     --base-url http://127.0.0.1:8805 --out runs/gate-T-011-mid-mainbase

# (b) budget, run from the worktree's own dev tool against its own tree
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-011/tools/playtest
node juice-stress.mjs <outdir>

# (d) + gate hygiene, in the worktree
node tools/pathcheck.mjs            # 881 passed, 0 failed
```

No retries were needed: zero `bootError`, zero page errors, zero console
errors across all seven `run.mjs` invocations.

## Required smoke set — both `"result": "completed"`

| run | result | attempts / falls | idle frac | minEdgeMargin | airMs | protoScore (proxy) | errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gate-T-011-mid` | completed | 1 / 0 | 0.024 | 35.41 | 5256 | 86.9 | 0 |
| `gate-T-011-transform` | completed | 1 / 0 | 0.000 | 30.06 | 13592 | 288.1 | 0 |

Transform run also reports lives 3 → 3 (0 spent) and route coverage
`[mid-catwalk, wall-launch]`; mid-route reports 1 hit survived, dare pocket
entered, air jumps 3 — all in family with the README's committed
`--deterministic` demo baselines.

## (a) `?juice=0` boots and completes identically to baseline

Five mid-route runs and two transform runs, three trees/flags:

| run | tree / flag | result | attempts/falls/hits | idle frac | minEdge | airMs | victory gameMs | final x |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gate-T-011-mid` | T-011, juice ON | completed | 1/0/1 | 0.024 | 35.41 | 5256 | 6326 | 72.06 |
| `gate-T-011-mid-b` | T-011, juice ON | completed | 1/0/1 | 0.024 | 35.42 | 5280 | 6316 | 72.07 |
| `gate-T-011-mid-juice0` | T-011, `juice=0` | completed | 1/0/1 | 0.023 | 35.42 | 5076 | 6349 | 72.05 |
| `gate-T-011-mid-juice0-b` | T-011, `juice=0` | completed | 1/0/1 | 0.024 | 35.41 | 5141 | 6351 | 72.04 |
| `gate-T-011-mid-mainbase` | **main** (pre-juice) | completed | 1/0/1 | 0.024 | 35.39 | 5094 | 6360 | 72.06 |

Transform: juice ON idle 0 / minEdge 30.06 / airMs 13592 / final x 146.08;
`juice=0` idle 0 / minEdge 30.07 / airMs 13591 / final x 146.02. Both
completed with `BREACH CLEAR`.

Boot check beyond the harness (headless Chrome, worktree on :8804, zero page
errors and zero >=400 responses on all four loads):

- `?selftest=1` → `SELFTEST PASS (17 checks)`, `HB.juice().enabled === true`
- `?selftest=1&juice=0` → `SELFTEST PASS (17 checks)`, `enabled === false`
- `?slice=transform&selftest=1` → `SELFTEST PASS (20 checks)`
- `?slice=transform&selftest=1&juice=0` → `SELFTEST PASS (20 checks)`

Read honestly: `juice=0` on the T-011 tree lands on the same structural
outcome as pre-juice `main` (same attempts/falls/hits, `minEdgeMargin` inside
0.03 tiles, final x inside 0.02 tiles, victory within ~11ms of sim time), and
`juice=0` sits closer to `main` than juice-ON does on every column. The
juice-ON pair is consistently ~30-40ms *earlier* to victory and ~150-190ms
higher on `airMs` than either juice-off run — the right sign and roughly the
right size for the one hurt freeze this script takes (`hurtMs` 90 at
`scale` 0.08 removes ~83ms of simulated time), i.e. exactly the
gameplay-affecting behavior the pass declares. Two runs per side is not a
significance claim; harness limitation #8 (deterministic mode does not remove
frame-alignment divergence) applies and I am not asserting more than the
table shows.

## (b) fps under the 200+ projectile clause — REPORTED, not asserted

Independent re-run of the worktree's own `tools/playtest/juice-stress.mjs`
(three separate browsers, one reading each, 1280x800 headless Chrome, default
six-face run, right held; load = the game's own `fireWeapon(..., clone=true)`
x12/frame plus one death burst + flash per frame; reading =
`window.HB.perf()` over the last 180 real frames after 5s of sustained load):

| reading | live projectiles | sparks / flashes | fps | avgMs | worstMs | frames >20ms |
| --- | --- | --- | --- | --- | --- | --- |
| control (no load) | 0 | 0 / 0 | 120.7 | 8.29 | 9.4 | 0 |
| **stress, juice ON** | **256** | **224 / 17** (both pools saturated) | **120.0** | **8.34** | **9.3** | **0** |
| stress, `?juice=0` | 256 | 0 / 0 | 120.1 | 8.33 | 9.4 | 0 |

Numbers reproduced independently of the builder's committed
`artifacts/t011-juice/07-stress-perf.json` and agree with it. Honesty, taken
from the tool's own header and repeated here because it matters: rAF is
vsync-locked, so `fps` cannot exceed this panel's 120Hz — the load-bearing
fields are `worstMs` and `over20ms`, both of which show no late frame under a
load heavier than the game can itself produce. This is one dev machine in
headless Chrome, not a claim about any target device.

## (c) impact / death / pickup / hurt / crush at FAR — do effects obscure threats?

Judgement: **no.** Evidence in
`tools/playtest/runs/gate-T-011-far/` (full 1280x800 frames at the shipped
default view, which resolves to `far`; `crops/` holds 2-3x zooms of the same
frames; the capture scripts are copied in beside them).

Real gameplay beats (`?slice=traversal&hound=1`, hold right + hold fire):

- `juiceon-kill1-t0.png` / `-t60.png` / `-t180.png` — a wasp kill on top of
  RIG. t0: white kill flash + muzzle quad; t60: acid-green death flash with
  RIG's dark silhouette still legible inside it; t180: frame fully clear, a
  few green sparks left. Both hounds and the second wasp stay plainly
  readable in all three frames; the crush band, catwalks and the magenta
  capsule are untouched.
- `juiceon-hurt1-t0.png` — the wasp that lands the hit is drawn clearly on
  top of / beside the hurt flash. The incoming threat is not hidden.
- `juiceon-crush-edge{3,2,1,0p4}.png` — the crush warning at edgeMargin 3.0 /
  1.9 / 1.0 / 0.4 tiles (sampled intensity 0.01 / 0.15 / 0.39 / 0.44, pulse
  phase included). It reads as a pale additive band standing just inside the
  plane; deck, capsule and hostiles behind it stay fully visible, consistent
  with `CONFIG.juice.crush.maxOpacity` 0.55 "never hides a deck or a hostile".

Footprint measurement (`fx-*.png`, `crops/fx-*-3x.png`): the render-side
spawners were called with the shipped `CONFIG.juice` specs at RIG's position
via the game's own `fxBurst`/`fxFlash` — synthetic in trigger, identical in
what it draws. At FAR, RIG stands ~29px of 800 (~3.7% of screen height, inside
the board-13 invariant of 3-5%). Pickup flash ~18px across, magenta, sits at
RIG's waist with head, rifle and both neighbours still readable; death flash
~20px, acid-green; impact sparks are 3-4 dots. Every burst is gone by
130-190ms (`flashMs`), sparks by 240-420ms.

Worst case on purpose, `juice-stress/07-stress-perf.png`: 256 live projectiles
plus both effect pools saturated (a load the player cannot produce). Even
there the hound, the wasp, the catwalk edges and the deck silhouettes stay
separable; the effect mass is concentrated on RIG's muzzle line.

Style vs `docs/concept-art/` roles: acid-green = death/danger, hot-magenta =
pickup/reward, warm-white/amber = player fire and muzzle. That is the
documented colour-role list, not an invention of this pass.

Static-anatomy rule (decisions.md entry 3): re-captured the ritual keyframes
with juice ON via the worktree's `tools/playtest/transform-capture.mjs`
(15/15 frames, `.claude/worktrees/T-011/tools/playtest/runs/transform-v3/`).
`03-flip-snap1-plate-clack.png` and `12-breach-snap2-altitude.png` show a
solid pre-existing structure revealed by camera yaw — no assembling anatomy,
no zip-in, nothing new introduced by the feedback pass. Shake is a camera
nudge (`maxOffset` 0.15 tiles / `maxRollDeg` 0.55), which the rule permits.

## (d) hit-stop is asserted deterministic in pathcheck — confirmed

`node tools/pathcheck.mjs` in the worktree: **881 passed, 0 failed**. The
hit-stop determinism block is `tools/pathcheck.mjs:4512-4570`, which drives
`src/sim/time.js`'s clock frame by frame at 8.333 / 16.667 / 33.33ms steps and
asserts the same *simulated* time is removed at every cadence, to within one
frame of quantization (`:4534` — "a kill removes killMs*(1-scale) of simulated
time at 120/60/30 fps"), plus `:4539` that the freeze is never rounded away at
any cadence. Supporting assertions: the scale is bounded to (0,1] so no
tunneling/substep margin can be widened; stacked freezes are capped at
`maxMs`; `maxMs` is shorter than hitstun+iframes; a reset clears the clock and
the first post-reset sample only seeds the baseline (retry safety). Static
guards at `:4694`/`:4697`/`:4706` keep the decision sim-side: `src/sim/time.js`
owns it and only announces through `view.juice.hitStop`, no render module can
write the clock, and the loop samples it once before any entity update. No
`Math.random`/`Date.now`/`performance.now` in `src/pure/juice.js` or
`src/sim/time.js` (grepped; the existing layer-purity guards cover it).

## Defects filed

- `SPRINT.md` Inbox **I-016** (docs, S3) — three stale doc strings still in the
  tree at `14ade6b`, all already raised as MINOR in
  `reports/tasks/T-011/review.md` and surviving the merge otherwise. Not a
  gate blocker: no runtime effect, and the accurate wording already exists in
  `README.md`.

No other defect found. Nothing to file against the harness.

## Operator questions (feel — NOT gate criteria, not judged here)

Suggested URLs, worktree or post-merge main, A/B by appending `&juice=0`:

1. `index.html?slice=traversal&hound=1` — at the moment a kill or a hit lands
   *on RIG's own tile*, the flash disc covers RIG's silhouette for ~130-150ms
   (`juiceon-kill1-t0.png`). Correct punctuation, or should the player's own
   body stay readable through its own hit?
2. `index.html?slice=traversal` then let the crush plane close — the warning
   band at edgeMargin 3 tiles is nearly invisible (intensity 0.01) and only
   reads from ~2 tiles in. Does the warning start early enough to be a
   warning?
3. `index.html` vs `index.html?juice=0` on the six-face run — is hit-stop
   (42ms kill / 90ms hurt at scale 0.08) felt as weight, or as a hitch?
4. DESIGN's own caveat: with feedback landed, do any earlier "boring" verdicts
   read differently now?
