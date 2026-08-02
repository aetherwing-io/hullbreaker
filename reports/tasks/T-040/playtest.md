FAIL

Gate subject: `task/T-040`, HEAD `1bdc750` ("Merge main into task/T-040: re-home
the lane's assertions as a domain module, 2515 labels (2469 + 46)"), worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040`.

**This supersedes the committed `playtest.md` at this same path from HEAD
`10b5d9e`** (commit `9a4b4fad`, "T-040: commit playtest verdict and evidence
from the re-gate") — that verdict is stale relative to `1bdc750` (three fix
commits plus an integrator migration merge landed since). Per the team lead's
instruction this file is being overwritten with a fresh, from-scratch gate
against current HEAD, run per `docs/LANE-BRIEF.md`'s evidence standard
(everything below is a command I ran myself this session, not inherited from
`build.md` or `review.md`).

Read first: `docs/LANE-BRIEF.md`, `reports/tasks/T-040/build.md` (in the
worktree), the untracked but current `reports/tasks/T-040/review.md`
(APPROVE, re-reviewed against `1bdc750`), `docs/decisions.md` entries 15/16/17.

**Servers** (ephemeral ports only, 8741/8742 untouched):
- `node tools/serve.mjs 8781 --root .claude/worktrees/T-040 --quiet` — the
  worktree under test.
- `node tools/serve.mjs 8782 --root <scratch worktree at 2c638aa> --quiet` —
  merge-base (`git merge-base main task/T-040` = `2c638aa`, confirmed).
- Freshness verified both ways before trusting any result: response headers
  (`Cache-Control: no-store...`), served-vs-disk line counts for
  `src/render/player.js` (260/260, 67/67), and an MD5 match on
  `src/render/preload.js` between the served bytes and the worktree file.
- Both killed at the end of this gate; the merge-base scratch worktree was
  removed.

## 1. Pathcheck + regression — GREEN

- Worktree: `node tools/pathcheck.mjs` → **2515 passed, 0 failed**.
- Merge-base `2c638aa` (fresh scratch checkout): **2469 passed, 0 failed**.
  2469 + 46 = 2515 — reconciles exactly with the integrator's migration claim,
  nothing dropped.
- `scripts/mid-route.json --deterministic --base-url :8781`: `outcome:
  completed`, `deaths: 0`, `pageErrors: []`, `bootError: none`, `stopReason:
  victory`.
- `scripts/transform-slice.json --deterministic --base-url :8781`: `outcome:
  completed`, `deaths: 0`, `pageErrors: []`, `bootError: none`, `stopReason:
  victory`.
- Browser `?selftest=1`: **SELFTEST PASS (39 checks)**, zero pageErrors.
- Browser `?selftest=1&rig=canvas`: **SELFTEST PASS (39 checks)**, zero
  pageErrors.

## 2. Asset-missing fallback (entry 16's binding condition) — CONFIRMED SAFE

Renamed `assets/generated/sprites/rig-marine.png` aside (`mv` to `.qa-bak`),
loaded `?selftest=1` fresh:
- **SELFTEST PASS (39 checks)**, `pageErrors: []`.
- Console carried exactly one relevant line: `[warning] RIG sprite did not
  load (error); showing the procedural fallback instead.` plus the expected
  one `404`.
- `window.__HB_PRELOAD()` reported `{closed:true, state:'failed', ...}` for
  `rig-marine.png` — the gate resolved, did not hang.
- `scripts/mid-route.json --deterministic` against the asset-missing tree:
  `outcome: completed`, `deaths: 0` — the game is fully playable on the
  fallback.
- `grep -rn "sprite|fallbackMesh|spriteMesh|TextureLoader|preload"
  src/sim/` → **zero matches**, confirmed by direct inspection (the sim does
  not branch on load state).
- Restored the file; `git status --short` confirmed clean afterward (only
  the pre-existing untracked `review.md`).

Evidence: `playtest-evidence/qa2-asset-missing-fallback.png`.

## 3. Perf, vsync forced off — GREEN

Chrome launched with `--disable-gpu-vsync --disable-frame-rate-limit` (the
team lead's ask — vsync hid real per-frame cost from two other lanes
tonight), 256 live projectiles saturated via the game's own `fireWeapon`
path plus death-burst/flash pools, `window.HB.perf()`'s 180-frame ring read
after 5s of sustained load:

| tree | fps | avgMs | worstMs | over20ms | mean draw calls | max draw calls |
|---|---|---|---|---|---|---|
| T-040 HEAD `1bdc750` | 531.6 | 1.88 | 4.7 | 0 | 141.0 | 146 |
| merge-base `2c638aa` | 529.3 | 1.89 | 4.6 | 0 | 145.4 | 151 |

With vsync out of the way, the real per-frame cost is nowhere near the 16.67ms
(60fps) budget on either tree, and T-040's mean/max draw calls are **lower**
than merge-base's (not higher) — consistent with, and additional evidence
for, `review.md`'s independent live read (101→99, "a net decrease of 2, not
an increase"); the two figures differ because this run's method averages
draw calls over an animated 5s stress window including the pooled bullet/fx
geometry, not a single static read, but the direction agrees. **No
perf regression.**

## 4. Glance test at true FAR size, in live combat — REPRODUCES, WITH A SHARPER CAVEAT THAN PREVIOUSLY FILED

Method: `scripts/six-face-spaced-run.json` (shipped default `index.html`, no
query flags) run with `--deterministic --base-url :8781 --video
--max-runtime-ms 45000`. Extracted frames from the recorded `.webm` with
`ffmpeg`, calibrated against the run's own `trace[]` (video time vs `tMs`
line up within ~30ms — confirmed by matching the HUD's own kill counter in
the extracted frame against `trace[].kills` at the same timestamp).

- Full combat frames at `t≈22.0s` (7 hostiles materialized, 4 kills) and
  `t≈29.9s` (5 hostiles, 6 kills): RIG is findable at a glance in both —
  small, dark-outlined armored figure, distinct from the hostiles'
  green diamond/triangle silhouettes.
  (`playtest-evidence/qa2-t22.0s-full-frame-7hostiles.png`,
  `qa2-t29.9s-full-frame-6kills.png`)
- **A finer-grained burst** (12 frames at 300ms spacing through one
  continuous firefight, `t=20.0–23.3s`) surfaces the same effect the prior
  gate filed as a feel item, but characterizes it more precisely:
  - At `t=20.9s`, with no shot mid-flight from his own muzzle, RIG reads
    clearly — helmet highlight, torso, gun bar, legs, real value separation
    against the dark wall-panel backdrop.
    (`qa2-t20.9s-rig-clear-4x.png`, `qa2-t20.9s-rig-zoom8x.png`)
  - At `t=20.6s` and `t=21.8s` (rifle fires every 130ms per `CONFIG.
    weapons.R.fireRateMs`, so a firefight is in near-continuous muzzle
    flash), the flash/tracer bloom sits directly on or immediately beside
    RIG's own position and visually dominates the same few pixels his
    sprite occupies — his outline is not fully gone, but it is
    materially harder to pick out than at `t=20.9s`.
    (`qa2-t20.6s-muzzle-flash-obscures-4x.png`)
  - At `t=21.2s`, a different, additive problem: RIG is positioned against
    a *darker* panel/pillar edge (not the lighter wall panel of the other
    frames) and his own dark ink outline blends toward the background value
    rather than separating from it.
    (`qa2-t21.2s-rig-lowcontrast-dark-panel-4x.png`)

**What I am and am not claiming.** This does not contradict `review.md`'s
"findable in all three frames" judgment — it isn't, on the frames the
review looked at. It sharpens the *already-filed* I-??? readability item
(muzzle occlusion) with two things the earlier evidence didn't isolate: (1)
the occlusion recurs on a predictable cadence tied to the rifle's own
130ms fire rate, not a one-off, because the default weapon fires almost
continuously while the fire key is held; (2) a second, independent
contrast failure mode exists against dark background geometry, not just
against his own muzzle flash. Routing this as a **feel/readability**
observation, not a bug — I am not failing this gate on it, per this
project's rule that machine gates don't judge fun/feel. Filed below for the
operator checkpoint queue and the Inbox, as a sharper version of the
existing finding rather than a new one.

## 5. Render-only / determinism — FAILS THE SPECIFIC ASK, NARROWLY AND AT LOW FREQUENCY

**This is the reason for the FAIL verdict**, and it needs precise framing:
the mechanism the *original* playtest FAIL caught (`10b5d9e`'s gate) —
`THREE.TextureLoader().load()` racing the frame loop mid-run, producing a
~2000ms-scale outlier on effectively every sprite-default run — **is
confirmed fixed, both structurally and empirically.** `src/render/player.js`
registers through the shared `preload.js` gate with a single top-level
`await awaitPreloads()`; there is no second bespoke timeout/lock-in path
(verified: grepped for `Promise.race`, `settled`, `RIG_SPRITE_BOOT_TIMEOUT_MS`
— none present). That specific defect does not reproduce.

**But `build.md`'s own honest re-measurement flagged a second, narrower
residual effect** (GPU-driver-deferred mipmap upload landing on frame 1 of
gameplay instead of during the awaited boot gate) and explicitly said it
was unproven and needed a fresh, independent gate. I ran that gate:
**16-round interleaved measurement** (one run of base / hatch / ship per
round, so shared-session load hits all three equally within a round —
same method the team lead specified), `scripts/mid-route.json
--deterministic`, reading both `meta.deterministicDispatch.{gameMsMax,
dispatched}` and `metrics.closestCrushApproachTiles` (minEdgeMargin) from
every `report.json`. Raw data:
`playtest-evidence/determinism-regate/results-16x3.csv` (48 runs, all
`stopReason: victory`, zero `pageErrors` anywhere); reproduction script at
`playtest-evidence/determinism-regate/regate-repro.sh`.

| condition | n | `gameMsMax` spread | dispatched-event-count histogram (of 26 scripted) | `minEdgeMargin` spread |
|---|---|---|---|---|
| **base** (merge-base `2c638aa`) | 16 | 33.9ms | **{18: 16}** — zero deviation | 0.05 tiles (35.37–35.42) |
| **hatch** (`?rig=canvas`, same commit, skips the fetch) | 16 | 654.1ms | **{16: 1, 18: 15}** — 1/16 deviate | 0.04 tiles excluding one 35.31 read — no meaningful safety shift |
| **ship** (shipped default) | 16 | 2560.5ms | **{16: 2, 18: 9, 19: 3, 21: 1, 23: 1}** — 7/16 (44%) deviate | **2.35 tiles (33.04–35.39)** |

**Answering the team lead's explicit ask directly: is the control bimodal?**
No. `base` shows *zero* variation in dispatched-event-count across 16
rounds — not "tight," literally identical every single time. `hatch` shows
one deviation in 16. This is not the "the metric is bimodal everywhere,
ignore it" pattern from the earlier, retracted theory; if it were, `base`
would show its own scatter under the same shared-session load, and across
16 interleaved rounds it did not, once. **`ship`'s dispersion is real and
condition-specific** — attributable to whichever asset-loading path is
live for RIG's mesh, not to ambient machine noise, which is the honest,
correctly-attributed finding `build.md` already flagged and asked to have
independently re-checked.

**Going one step further than `build.md`'s own re-gate** (which tracked only
`gameMsMax`, not the safety-relevant crush-margin metric): of the 16 `ship`
runs, **1 (6.25%)** — the most extreme, `dispatched=23`, `gameMsMax=8299.4` —
produced a `minEdgeMargin` of **33.04 tiles**, a genuine ~2.3-tile-worse
closest crush-edge approach than the ~35.37-tile band every `base`/`hatch`
run lands in, similar in *magnitude* to what the original FAIL caught
(32.898 vs ~35.3), just far rarer now (1-in-16 vs essentially every run
before the fix). The other 15/16 `ship` runs — including 6 of the 7 that
showed dispatched-count timing drift — stayed within or very close to the
safe band (35.04–35.39).

**Stated plainly, in both directions.** The specific ask — "a deterministic
run should produce identical positions to the base tree" — is not true for
the shipped default, confirmed with a controlled, repeated, properly-
interleaved measurement, not a 2–3-run spread. It is also **not remotely
the same severity** as the original FAIL: this is now a low-frequency (~6%
by my minEdgeMargin criterion, ~44% by the more sensitive but less
consequential dispatched-count criterion) residual, already disclosed and
escalated by the builder (not discovered by me from scratch), correctly
attributed to `src/render/preload.js` — a module shared with T-049, not a
file this lane owns — and it is **fully absent in the `?rig=canvas` escape
hatch**, which is on by default's-equivalent-safe today. In absolute terms,
even the worst reading (33.04 tiles) is nowhere near the game's own
"emergency" threshold (`edgeMargin<8` in the shipped reactive-policy
scripts) — nothing in this data shows a real near-miss, only a measurable
break in run-to-run reproducibility.

Per this project's own evidence standard ("never soften a FAIL to keep the
loop moving," and determinism is listed as a hard rule with no magnitude
carve-out), I'm reporting this as a FAIL rather than rounding it to green
because it's rare and small. But the fix does not belong in this lane: per
`build.md`'s own scoping (correct, and matching the "don't invent a second
mechanism" instruction this lane was already given), the actual lever is
`preload.js` forcing a real warm-up render/`renderer.compile()` pass at the
end of its boot gate so a GPU driver's deferred mipmap work actually
finishes before frame 1, not something `player.js` can privately patch.
**This is very likely a systemic finding, not specific to RIG** — any other
lane (T-049 included) that registers a real, larger, mipmapped texture
through the same shared gate should expect the same residual risk until
`preload.js` gets that fix.

## Reproduce this gate

```sh
node tools/serve.mjs 8781 --root .claude/worktrees/T-040 --quiet &
node tools/serve.mjs 8782 --root <scratch checkout of 2c638aa> --quiet &

node tools/pathcheck.mjs                                                    # worktree: 2515/0
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8781
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8781
node run.mjs scripts/six-face-spaced-run.json --deterministic --base-url http://127.0.0.1:8781 --video --max-runtime-ms 45000

# determinism regate (§5) — the script this report ran, 16 interleaved rounds:
bash <this report's dir>/playtest-evidence/determinism-regate/regate-repro.sh
# then compare meta.deterministicDispatch.{gameMsMax,dispatched} and
# metrics.closestCrushApproachTiles across conditions per round.

# asset-missing fallback (§2):
mv assets/generated/sprites/rig-marine.png assets/generated/sprites/rig-marine.png.bak
# reload ?selftest=1, confirm PASS + one console.warn + zero pageErrors, then restore.
```

## PROPOSED INBOX ISSUES

Not self-numbered per the lane brief — proposing for integrator triage.

## I-??? | bug | S2 | repro: `bash reports/tasks/T-040/playtest-evidence/determinism-regate/regate-repro.sh` against a pinned `task/T-040` worktree (`1bdc750`) served on one port and merge-base `2c638aa` served on another; compare `meta.deterministicDispatch.dispatched` and `metrics.closestCrushApproachTiles` per round | evidence: `reports/tasks/T-040/playtest.md` §5; `reports/tasks/T-040/playtest-evidence/determinism-regate/results-16x3.csv` (48 runs)

The original async-fetch determinism defect is fixed, but a second, narrower
residual remains in the shipped default: 16 properly-interleaved rounds of
`mid-route.json --deterministic` show the merge-base tree dispatching
exactly 18/26 scripted events every single time (0/16 deviation) and the
`?rig=canvas` escape hatch deviating once in 16, while the shipped sprite
default deviates in 7/16 (44%) — and in the single most extreme case
(`dispatched=23`, `gameMsMax=8299ms`) produces a `minEdgeMargin` of 33.04
tiles against every control run's tight 35.3–35.4-tile band, a real
~2.3-tile-worse closest crush-edge approach from byte-identical input.
Magnitude and frequency are both far lower than the pre-fix defect (then:
~every run, ~2000ms/2.4-tile; now: ~1-in-16, similar per-incident
magnitude), and it is fully absent in the escape hatch. `build.md`'s own
account (this same branch) proposes the fix belongs in `src/render/
preload.js` (shared with T-049): an explicit warm-up render/
`renderer.compile()` pass at the end of the boot gate, so a GPU driver's
deferred mipmap upload actually completes before frame 1 rather than
landing on it. Likely systemic to any lane registering a large mipmapped
texture through the same shared gate, not unique to RIG.

## I-??? | feel | S3 | repro: `node run.mjs scripts/six-face-spaced-run.json --deterministic --base-url <pinned task/T-040 1bdc750> --video --max-runtime-ms 45000`, extract frames at 300ms spacing through any sustained firefight (this report used `t=20.0–23.3s`) | evidence: `reports/tasks/T-040/playtest-evidence/qa2-t20.9s-rig-clear-4x.png` vs `qa2-t20.6s-muzzle-flash-obscures-4x.png` vs `qa2-t21.2s-rig-lowcontrast-dark-panel-4x.png`

Sharper version of the already-filed muzzle-occlusion finding: because the
default rifle fires every 130ms (`CONFIG.weapons.R.fireRateMs`) and is held
near-continuously in combat, the flash/tracer bloom sits on or beside RIG's
position on a predictable, recurring cadence during a firefight, not as a
one-off. A second, independent contrast failure also reproduces: against a
darker panel/pillar background element (as opposed to the lighter wall
panel most prior evidence used), RIG's own dark ink outline blends toward
the background rather than separating from it. Neither is a new defect
class — routing as a sharper restatement of the existing feel item for the
operator checkpoint queue, not a bug, and not a reason to fail this gate.

## Open feel questions for the operator (not judged here)

Carried forward from `build.md`/`review.md`, plus this gate's own §4:

1. Does the real sprite read as "a much higher quality asset in line with
   the concept art" (the operator's own bar), or still short of it?
2. Is the muzzle-flash/tracer occlusion during sustained fire (§4) and the
   dark-panel low-contrast case acceptable, or does either need a fix (a
   material tint/darken pass is the fast lever named in `build.md`, with no
   new asset needed)?
3. Body-only sprite (no baked-in gun) means the weapon always reads as a
   separate object riding alongside RIG — acceptable, or does it need to be
   part of the sprite itself?

Exact URL: `index.html` (shipped default, no query flags), FAR camera.
