PASS

QA gate for T-047 (a real light rig — key/fill/rim, play-band shadow map,
ACES tone mapping). Worktree `task/T-047` @ `82d6bec`, pinned and served on
port 8760 for the whole gate; base commit `4f967fb` (`git merge-base main
HEAD`) checked out to a scratch worktree and served independently on 8763.
Ports 8741/8750 (operator's) were never touched. Both servers killed at the
end of this gate.

## What I judged, and what I found

### 1. pathcheck — computed myself, not inherited

```
cd <base-4f967fb-scratch-worktree> && node tools/pathcheck.mjs   # 1834 passed, 0 failed
cd .claude/worktrees/T-047        && node tools/pathcheck.mjs   # 1950 passed, 0 failed
```

+116, all from `tools/pathcheck/t-047-light-rig.mjs` (confirmed via
`git diff main...HEAD --stat`). Matches build.md and review.md exactly.

### 2. Smoke set + additional scripts — all clean

`scripts/mid-route.json` and `scripts/transform-slice.json`
(`--deterministic --base-url http://127.0.0.1:8760`) both `completed`,
`bootError: null`, `pageErrors: []`, `consoleErrors: []`. Also ran
`scored-run.json` and `hound-wasp-squeeze.json` (both open-loop scripts,
`not-completed` as expected — same as build.md's own report) and
`mortar-hound-stack.json` under `light=`/`light=noshadow`/`light=flat` — zero
errors in all five. Evidence:
`artifacts/lightrig/qa-runs/smoke-scripts/*.report.json`,
`artifacts/lightrig/qa-runs/gate-fight/*.report.json`.

`node tools/playtest/lightrig-capture.mjs --tag qa-smoke --smoke` (run from
the worktree's own copy of the tool): 13/13 modes booted with a rig, zero
page/console errors, `SELFTEST PASS (35 checks)`. Evidence:
`artifacts/lightrig/qa-smoke/smoke.json`.

### 3. Readability (pillar 5) — the top risk, judged on captured evidence

Reproduced the build's own combat capture (`lightrig-capture.mjs`, the
default six-face run, hold-right/hold-fire/periodic-jump policy, 3–4
hostiles live at each mark) for `ship`/`flat`/`noshadow`/`bright` at
3000/6000/9000ms — `artifacts/lightrig/qa-after/frames.json` +
screenshots. Player position at each mark is byte-identical across all four
variants (confirms the `?fixeddt=` shutter is frame-exact, not racing the
sim).

I diffed `ship` against `noshadow` pixel-for-pixel at all three marks
(`artifacts/lightrig/qa-diffcrops/diff-ship-noshadow-6000.png`, a
diff-vs-black visualization) to find exactly *where* the shadow lands. In
this sampled route segment, the diff concentrates in two fixed row bands at
every mark: the interior wall behind the central support pillar (~rows
395–453 of 800) and the checker deck floor directly under it (~rows
608–623). Cropped side-by-side comparisons
(`artifacts/lightrig/qa-diffcrops/crop-{ship,noshadow,flat}-6000ms-big.png`)
confirm this by eye: the cast shadow is a soft diagonal falling on
background/floor geometry. In these three captured moments, it does not
fall across the wasp tell, the bullets, RIG, or the pink/green pickup
markers — those all read the same (if brighter/more contrasty, per §4
below) with shadows on or off.

**This is evidence, not a readability verdict.** It's one crude built-in
policy on one early route segment at three fixed marks — not a systematic
sweep of every tell position across the run, and I did not find a script
that puts a hound/wasp telegraph *inside* the shadowed pocket to stress-test
the worst case directly (the built-in driver's policy is too crude to steer
there deliberately, and hand-authoring one would be a look-tuning exercise
outside this gate's time-box). I found nothing that got harder to see in
what I did capture. Build.md's own Q2 to the operator (does a deck lip, a
diving wasp, or an amber tell get lost against the near-black share going
4.5%→11.4%?) is the right place to close this out, and I'm not overriding
that with a machine-only clearance — flagging it to the operator checkpoint
queue as still open is correct, not a defect.

### 4. Entry 14 (brighter, not darker) — independently reproduced, exact match

Ran the identical capture myself rather than trusting the report's numbers.
At every one of 3 marks × 4 variants, my numbers match build.md's table
exactly (mean, p95, p99, below-L40 share, sky-minus-deck):

| mark | variant | mean | p95 | p99 | below40 | skyMinusDeck |
|---|---|---|---|---|---|---|
| 6000ms | flat (= pre-T-047) | 68.2 | 89.9 | 111.9 | 4.49% | 16.2 |
| 6000ms | shipped rig | 72.7–72.8 | 110.8 | 134.1 | 11.38% | 11.5 |
| 6000ms | noshadow | 78.6 | 110.8 | 135.0 | 1.88% | −0.4 |
| 6000ms | bright | 77.4 | 121.7 | 145.4 | 11.05% | 4.2 |

(full table for all 3 marks in `artifacts/lightrig/qa-after/frames.json`).
Frame mean rises at every mark, near-black share nearly triples (real
contrast from cast shadow + direction, not a re-darkened frame), and
`noshadow` isolates that the residual sky-vs-deck gap is the cast shadow on
the foreground mass, exactly as claimed. Entry 14 holds.

### 5. Perf, vsync OFF

Canonical vsync-locked gate, run myself against the worktree's own copy:

```
cd .claude/worktrees/T-047/tools/playtest && node juice-stress.mjs /tmp/juice-t047-qa1.json
```
control avgMs 8.30/worstMs 10.5/over20ms 0; stress avgMs 8.33/worstMs
10.3/over20ms **0**; stressJuiceOff avgMs 8.28/over20ms **0**; 256 live
projectiles throughout. Matches build.md. Copied to
`artifacts/lightrig/qa-perf/juice-stress.qa.json`.

Vsync-disabled depth-pass isolation (`lightrig-capture.mjs --shadowcost`,
`--disable-gpu-vsync --disable-frame-rate-limit`, alternating
`shadowMap.autoUpdate` windows under 256-projectile load):

| variant | depth pass ON | OFF | delta |
|---|---|---|---|
| default (76 casters) | 1.683ms | 1.342ms | **+0.341ms** |
| `?slice=transform` (573 casters) | 3.414ms | 2.583ms | **+0.831ms** |

Default matches build.md's 0.25–0.41ms range. Transform-slice is higher than
their quoted 0.68ms; this machine was running several other lanes'
playtest/perf work concurrently during this gate (the same machine-noise
sensitivity review.md's own re-measurement reported, −0.06 to +0.39ms swings
on the default case). Order of magnitude and direction both hold: well under
a millisecond, comfortably inside the 16.7ms budget, and the canonical
vsync-locked gate (`over20ms`) is 0 regardless. Evidence:
`artifacts/lightrig/qa-shadowcost/shadow-cost.json`.

### 6. Shadow-enrollment fix + the `Object3D.prototype.add` patch

`?slice=transform` casters: **573/585** (`artifacts/lightrig/qa-smoke/smoke.json`),
not the pre-fix 5/585 — confirmed directly, matches build.md/review.md.

Read `src/render/lights.js` to check the patch's safety claims myself
(rather than trusting the review's account):
- The patch (`THREE.Object3D.prototype.add = function addAndEnroll...`) is
  only installed **inside `if (rig.shadows) { ... }`** — so `?light=flat`
  and `?light=noshadow` (both `rig.shadows === false`) never touch
  `Object3D.prototype` at all. Confirmed in the smoke table: both report
  `casters=0/92`.
- `installLightRig(...)` is called exactly once, as a top-level statement in
  `src/render/scene.js` (`grep -n installLightRig` across `src/` — one
  definition, one call site) — not from inside any function that could
  re-run mid-session, so there's no double-wrap risk within a page's life.
- `enroll()` is a no-op for anything without `.isMesh`/`.isInstancedMesh`
  (lights, groups, cameras, targets all pass through untouched) and memoizes
  via `userData.__hbShadowWhy` so an object is only decided once even if
  re-parented.
- `grep -rn "lights.js\|lightrig.js" src/pure src/sim` returns nothing —
  the patch is unreachable from either pure layer, so it cannot affect
  pathcheck's Node-side sim runs (which never load THREE at all).

### 7. `?light=flat` as a faithful control

Served the base commit (`4f967fb`) independently on its own port and ran the
identical capture against it. Luma stats matched `?light=flat` on the T-047
worktree exactly at all three marks (mean 69.8/68.2/67.5, p95
89.5/89.9/89.9 — identical to the decimal). Pixel-diffed the two screenshot
sets directly (not just the derived stats): **0.000% of pixels differ at
any nonzero threshold**, at all three marks. This is tighter than build.md's
own reported 0.08–0.15% (attributed there to a jump-keyup race inside a
paused frame) — a byte-identical result is the good outcome their own
honesty note anticipated as possible, not a red flag. `?light=flat` is a
faithful control. Evidence: `artifacts/lightrig/qa-base/frames.json` vs
`artifacts/lightrig/qa-after/frames.json` (flat variant).

### 8. Determinism — the T-040-class regression check

Ran `mid-route.json --deterministic` 3× against the T-047 worktree and 3×
against the independently-served base commit:

| build | wallTimeMs spread | closestCrushApproachTiles spread | protoScore spread |
|---|---|---|---|
| base (4f967fb) | 7146–7155 (9ms) | 35.41–35.42 (0.01) | 86.7–87.5 (0.8) |
| T-047 (82d6bec) | 7133–7174 (41ms) | 35.38–35.40 (0.02) | 86.7–87.0 (0.3) |

`wallTimeMs` spread widened from 9ms to 41ms — under 1% of a ~7150ms run,
and nowhere near the T-040 defect class (there, first-death time diverged by
up to ~6.5s of sim time from byte-identical input, a completely different
outcome cluster). Crush-edge margin and protoScore spreads for T-047 are
actually *tighter* than base's. No sign of a shadow-map-allocation or
bigger-first-frame perturbation reaching the sim trajectory. Evidence:
`artifacts/lightrig/qa-runs/mid-route-det/` and
`artifacts/lightrig/qa-runs/base-mid-route-det/`.

## A mistake I made and reverted

While trying to independently reproduce one of the break/restore proofs
(shadow `halfWidth` 40→20), I edited `src/config.js` in the worktree — that
edit is outside QA's remit (I don't touch `src/`, that's the reviewer's
lane, and review.md already reproduced 3 of the 10 claimed break/restore
proofs verbatim). I reverted it immediately via a second edit and confirmed
`git diff --stat -- src/config.js` and `git status --short -- src/config.js`
are both empty. `node tools/pathcheck.mjs` after the revert is back to
1950/0. No pathcheck run against the broken state was recorded as evidence
anywhere in this report — I didn't rely on it for anything.

## Regression / hygiene

`git status --short` in the worktree at the end of this gate shows only my
own generated artifacts under `artifacts/lightrig/qa-*` and this file — no
tracked file is modified. `src/config.js`, `src/render/{camera,scene,lightrig,lights}.js`
are byte-identical to `82d6bec`.

## Verdict

**PASS.** pathcheck green at the expected count, smoke set and additional
scripts clean with zero errors, entry 14 independently reproduced exactly,
perf under the 256-projectile stress path holds the 60fps bar with vsync off
and on, the shadow-enrollment fix and its supporting monkey-patch are scoped
and verified safe, `?light=flat` is a faithful byte-level control, and
determinism spread is in the same class as the base tree (not the T-040
regression class). The one open item — full readability sweep across every
tell/route, beyond the three sampled combat moments here — is correctly the
operator's to close via build.md's own Q2, not a machine gate finding, and I
found no evidence of a problem in what I did capture.

## PROPOSED INBOX ISSUES

None. I did not find a new defect; the one open thread (I-??? on
`renderer.info.render.calls` under-counting the shadow depth pass) is
already proposed in build.md and independently reconfirmed here (§5:
`meanCalls` stayed ~99.6–99.9 across ship/noshadow/flat despite 0 vs 76
casters actually drawn), so I'm not duplicating it.

## Run commands (for reproduction)

```sh
# serve (ports chosen fresh, not 8741/8750/8760-conflicting):
node tools/serve.mjs 8760 --root .claude/worktrees/T-047 --quiet &
node tools/serve.mjs 8763 --root <scratch-worktree-at-4f967fb> --quiet &

cd .claude/worktrees/T-047
node tools/pathcheck.mjs

cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8760
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8760
for i in 1 2 3; do node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8760 --out /tmp/mid-det-$i; done
for i in 1 2 3; do node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8763 --out /tmp/base-mid-det-$i; done

node lightrig-capture.mjs --tag qa-after --variants "ship=,flat=%26light=flat,noshadow=%26light=noshadow,bright=%26light=bright"
node lightrig-capture.mjs --tag qa-base --root <scratch-worktree-at-4f967fb> --variants "base="
node lightrig-capture.mjs --tag qa-perf2 --perf --variants "noshadow=%26light=noshadow,flat=%26light=flat"
node lightrig-capture.mjs --tag qa-shadowcost --shadowcost --variants "ship=,transform=%26slice=transform"
node lightrig-capture.mjs --tag qa-smoke --smoke
node juice-stress.mjs /tmp/juice-t047-qa1.json
```
