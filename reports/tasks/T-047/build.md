# T-047 — a real light rig, shadows on the play band, tone mapping

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-047`,
branch `task/T-047`, commits `bba83bc` + `1416740` (+ this report).
Authorized by `docs/decisions.md` entry 18; conditions from that entry are
answered section by section below.

---

## 1. Frame time under load — the condition that decides the lane

**The gate (`tools/playtest/juice-stress.mjs`, 256 live projectiles, vsync-locked
120 Hz panel, headless Chrome 1280x800).** Base = `git merge-base main HEAD`
(4f967fb) extracted to a scratch tree and served by its own copy of the tool;
after = this branch. Final paired run on a quiet machine:

| build | reading | fps | avgMs | worstMs | over20ms | live projectiles |
|---|---|---|---|---|---|---|
| before (4f967fb) | control | 120 | 8.33 | 9.4 | **0** | – |
| before (4f967fb) | **stress** | 120 | 8.33 | **9.4** | **0** | 256 |
| after (T-047) | control | 120 | 8.33 | 9.3 | **0** | – |
| after (T-047) | **stress** | 120 | 8.33 | **9.4** | **0** | 256 |
| after, `?juice=0` | stress | 120 | 8.33 | 9.4 | **0** | 256 |

Artifacts: `artifacts/lightrig/{before,after}/juice-stress-final/07-stress-perf.json`.

Three earlier paired runs are kept in the same directories
(`juice-stress-1..3`). They bracket the noise honestly: `worstMs` wandered
9.3–17.5 ms on BOTH builds and one *unloaded* after-control hit 24.3 ms with
`over20ms: 1`, while a period when the machine was busy pinned every reading —
before and after, loaded and unloaded — to a 30 Hz vsync clamp (33.33 ms,
`over20ms: 180`). Those readings say nothing about this change; they are
reported so nobody later mistakes one of them for a regression. **`over20ms`
was 0 in every stress reading of both builds.**

**What the rig actually costs**, measured where vsync cannot hide it: one page,
vsync disabled, 256 projectiles injected, alternating 90-frame windows with
`renderer.shadowMap.autoUpdate` on and off (so the delta is the depth pass, not
the cost of receiving), median over 7–8 windows per state —
`tools/playtest/lightrig-capture.mjs --shadowcost`:

| mode | depth pass ON | depth pass OFF | **shadow pass** |
|---|---|---|---|
| default six-face run | 1.674 ms | 1.356 ms | **+0.32 ms** |
| default run (repeat readings) | 2.159 / 2.328 ms | 1.907 / 1.920 ms | **+0.25 / +0.41 ms** |
| `?slice=transform` (573 casters, 578 draws) | 2.359 ms | 1.676 ms | **+0.68 ms** |

So: **0.25–0.68 ms of the 16.7 ms budget**, and the 60 fps bar holds at 256
projectiles with zero late frames. I am not claiming a "no cost" result — I am
claiming a measured one, on this machine, with the method written down.

**Draw calls.** Mean per frame under stress, sampled every frame rather than
once: before 100.3, after (shadows on) 100.3, `?light=noshadow` 99.9,
`?light=flat` 100.4 — unchanged. **Caveat worth carrying forward:** three.js'
`renderer.info.render` does **not** count the shadow depth pass (toggling it
moved `calls` by −0.6, i.e. nothing). The default run enrolls **76 casting
objects of 92 meshes**; those draws are real and invisible to the project's
draw-call metric. Filed as an issue below.

---

## 2. What changed, and why

The measured starting point (`docs/proposals/2026-08-look-direction.md`, and
re-measured here): `HemisphereLight(1.1)` + `DirectionalLight(1.6)`, no
`castShadow` / `receiveShadow` / `shadowMap` anywhere in `src/`, exposure 1.

- **`src/render/lightrig.js`** (new, deliberately three.js-free like
  `palette.js` and `legibility.js`): rig descriptors, view-relative direction
  math, the irradiance model the value ladder is asserted through, the
  shadow-band arithmetic, and the enrollment policy. Node-importable, so
  pathcheck asserts behaviour rather than source shape.
- **`src/render/lights.js`** (new): the only module in the tree that builds a
  light. Owns tone mapping, exposure, `outputColorSpace`, the shadow map, the
  per-frame aim, and shadow enrollment.
- **`src/config.js`**: the `LIGHT_RIG` block — angles, dose, shadow band. No
  colors (they stay palette tokens).
- **`src/render/scene.js`**: installs the rig, one line after the scene exists.
- **`src/render/camera.js`**: aims it from the **unshaken** look point and the
  yaw the corner ritual has reached, before `applyShake()`.

**The rig.** Warm key at azimuth 40°, elevation 50°, intensity 2.45; cool
hemisphere fill at 0.62 (down from 1.1 — the uniform fill was why nothing had
form); cool rim/kicker at 214°, 12°, 0.75, which exists to lift the faces the
key leaves black rather than to double the key. Exposure 1.35. Shadow map
2048², ortho band 80 × 56 tiles fitted to the visible strip, texel 0.039 tiles,
PCF-soft, texel-snapped so edges do not crawl as the band follows the run.

**Two decisions worth challenging in review.**

1. **Angles are view-relative, not world-fixed.** The tower turns 60° six
   times; a world-fixed key frontlights two faces and backlights two, and the
   deck — the anchor of the whole CONCEPT value ladder — would change rank
   mid-run. Measured: the shipped rig lights each surface family identically
   on all six faces (spread < 1e-9); the pre-T-047 rig varied the same wall by
   0.41 between faces. The cost is that through a corner the key turns *with*
   the view. Nothing is animated by a clock (pathcheck asserts no
   clock reference in either module), but this is a look question and it is
   in the operator list below.
2. **The key is at 50°, not lower.** A true rake (< 40°) makes verticals
   brighter than horizontals, which inverts the deck's place at the top of the
   ladder every CONCEPT token was authored against — and `palette.js` is
   another lane's file this cycle, so the rig had to preserve the ranking
   instead of re-authoring the palette. Asserted, and the assertion was proven
   to bind by lowering the key to 30° and watching the gate go red.

**Shadow enrollment without touching a fenced file.** Meshes are built in a
dozen lane-owned modules, so `lights.js` wraps `Object3D.prototype.add` and
decides from the **material**: lit (Standard/Physical/Lambert/Phong/Toon) →
receives; lit *and* opaque → also casts; unlit (`MeshBasicMaterial` — which in
this codebase means every bullet, spark, flash, beam, lamp, capsule face, mod
and rain drop, and a later lane's contact-shadow quads) → neither. A lit but
**transparent** body — a hostile at `opacity: 0` mid-materialize — receives and
does **not** cast, because three.js' depth material ignores opacity and would
otherwise throw a full shadow for an enemy that is not on screen yet. Any lane
can override with `mesh.userData.shadow = 'none'|'cast'|'receive'|'both'`
without this module knowing its name.

The hook is at `Object3D.prototype.add` and not `scene.add` because the first
version of it was wrong in a way no default-run screenshot would show:
`src/render/transform.js` adds its band group to the scene and fills it
afterwards, so `?slice=transform` enrolled **5 casters of 585 meshes**. Now 573
of 585 (`?g2=1`: 5/580 → 570/580). Commit `1416740`; there is an assertion
naming it.

---

## 3. Value: the frame got brighter, not darker (entry 14)

Deterministic captures on the default six-face run at the FAR default, during
live combat (3–5 hostiles on screen at every mark, recorded per frame).
`L` = Rec.709 luma on sRGB bytes. `aboveSky` = share of the frame brighter
than the backdrop band, which is the audit's real finding stated as one number:
*does anything read as lit?*

| mark | build | mean | p95 | p99 | aboveSky | below L40 | sky−deck band |
|---|---|---|---|---|---|---|---|
| 3000 ms | before | 69.8 | 89.5 | 108.6 | 50.3% | 4.5% | +13.0 |
| | **shipped rig** | **72.9** | **110.4** | **132.9** | **69.0%** | 10.7% | +10.9 |
| | `?light=bright` | 76.5 | 120.6 | 140.9 | 72.9% | 10.4% | +5.2 |
| | `?light=noshadow` | 78.0 | 110.6 | 133.8 | 74.3% | 2.2% | +0.2 |
| 6000 ms | before | 68.2 | 89.9 | 111.9 | 40.0% | 4.5% | +16.2 |
| | **shipped rig** | **72.8** | **110.8** | **134.1** | **62.9%** | 11.4% | +11.5 |
| | `?light=bright` | 77.4 | 121.7 | 145.4 | 68.8% | 11.1% | +4.2 |
| | `?light=noshadow` | 78.6 | 110.8 | 135.8 | 70.0% | 1.9% | −0.4 |
| 9000 ms | before | 67.5 | 89.9 | 111.9 | 37.8% | 5.0% | +16.7 |
| | **shipped rig** | **72.6** | **110.8** | **134.1** | **59.1%** | 11.5% | +10.7 |
| | `?light=bright` | 77.4 | 121.7 | 144.6 | 67.7% | 11.2% | +3.0 |
| | `?light=noshadow` | 78.5 | 111.1 | 134.9 | 66.5% | 1.8% | −0.9 |

Reading it straight:

- **Not darker.** Frame mean rises 68.2 → 72.8 at the 6 s mark, and at every
  mark. Contrast is bought with direction and exposure, not by lowering the
  frame (entry 14).
- **Things read as lit now.** p95 89.9 → 110.8, p99 112 → 134, and the share of
  the frame above the backdrop haze goes 40% → 63%.
- **The audit's inversion is reduced, not eliminated.** The sky band still
  averages ~11 above the deck band (was ~16). `?light=noshadow` shows why: with
  the same lights and no cast shadows the gap closes to ≈0, so the residual is
  *cast shadow on the foreground mass*, which is the thing the boards do too.
  Whether it should be pushed further is a look call, not a bug — question 4
  below.
- **Darks are new.** Below-L40 pixels go 4.5% → 11.4%. That is the form; it is
  also the readability risk, and it is the first thing the playtester should
  attack.

Three doses were captured; the middle one ships. Exposure 1.18 (measured, then
rejected here rather than shipped) held the mean but left the deck band *below*
the backdrop again; exposure 1.5 ships selectable as `?light=bright` because
entry 14 was itself a dose verdict and dose is the operator's call.

Transformation slice, same rig: `artifacts/lightrig/transform/` (ship vs flat
at two marks) — mean 49.3 → 56.9, p95 74.5 → 97.9 at the 3 s mark.

---

## 4. The escape hatch, and what "identical" is worth here

`?light=flat` rebuilds the pre-T-047 rig from descriptors —
`HemisphereLight(hemiSky, hemiGround, 1.1)` at the default `(0,1,0)` plus
`DirectionalLight(sun, 1.6)` at `(6,12,8)`, no shadows, exposure 1 — and
enrollment is skipped entirely when a rig casts nothing, so no mesh flag
changes either. Measured against the base commit served from its own tree:

- luma statistics identical at all three marks (mean 69.8/68.2/67.5, p95
  89.5/89.9/89.9, aboveSky 50.3/40.1/37.8%);
- pixel difference 0.08–0.15% of the frame — **the same size as the difference
  between two runs of one unchanged build** (0.07–0.17%, measured in
  `artifacts/lightrig/repeat/`), which comes from a jump keyup landing inside a
  paused frame and shifting particle phase.

For scale, the shipped rig differs from the base build in **54–69%** of pixels.
An earlier byte-identical result for the same comparison was luck, not
evidence, and the capture tool's honesty note now says so.

`?light=noshadow` = the same rig with the map off (isolates cost and
readability), `?light=bright` = one dose up. Anything unrecognized — including
`?light=junk` and no flag at all — resolves to the shipped rig.

---

## 5. Verification — every command and its result

| command | result |
|---|---|
| `node tools/pathcheck.mjs` (worktree) | **1950 passed, 0 failed** (base: 1834 — +116 from `tools/pathcheck/t-047-light-rig.mjs`, listed in `manifest.mjs`) |
| `node tools/playtest/lightrig-capture.mjs --smoke --tag after` | **13/13 modes booted with a rig, zero page/console errors**; `?selftest=1` → **SELFTEST PASS (35 checks)** |
| `node run.mjs scripts/mid-route.json --deterministic` | completed, 0 deaths, 0 console/page errors — same outcome as base |
| `node run.mjs scripts/scored-run.json --deterministic` | not-completed (open-loop script), 0 deaths, 0 errors — same as base |
| `node run.mjs scripts/hound-wasp-squeeze.json --deterministic` | not-completed, 0 deaths, 0 errors — same as base |
| `juice-stress.mjs` before/after ×4 pairs | table in §1; `over20ms: 0` in every stress reading of both builds |
| `lightrig-capture.mjs --shadowcost` ×3 | depth pass +0.25…+0.68 ms |
| `git status --short` after every break/restore | clean |

**Modes smoked** (rig id / shadows / casters of meshes): default 76/92, zipper
68/84, traversal slice 71/82, transform slice 573/585, G2 570/580, classic
palette 76/92, `view=near` 76/91, `juice=0` 76/89, flat 0/92, noshadow 0/92,
bright 76/92, `light=junk` → shipped rig, selftest PASS.
Evidence: `artifacts/lightrig/after/smoke.json`.

### The new assertions bind — proved by breaking them

Each break was applied to the committed tree, pathcheck run, then
`git checkout --` restored; `git status --short` verified clean after.

| break | gate said |
|---|---|
| key elevation 50° → 30° | FAIL "…a key raked below ~40 degrees closes it (0.004)" |
| exposure 1.35 → 0.9 | FAIL "exposure goes UP, never down" + FAIL "the wall behind the play plane is not dimmer than it shipped (0.338 vs 0.375)" |
| shadow halfWidth 40 → 20 | FAIL "the shadow band covers the whole visible strip at the FAR default (20 >= 36.4 tiles)" |
| shadow halfWidth 40 → 220 | FAIL "…and it stops there", FAIL "a fraction of the run, never a whole-level shadow camera", FAIL "shadow texel is 0.2148 tiles" |
| policy: let unlit meshes cast | FAIL "an UNLIT mesh casts nothing…" + 2 more |
| policy: let a fading (opacity 0) hostile cast | FAIL "a lit but TRANSPARENT body receives and does not cast…" |
| `Date.now()` added to `updateLightRig` | FAIL "src/render/lights.js reads no clock — the anatomy stays static (entry 3)" |
| a second module builds a light (`scene.js`) | FAIL "src/render/lights.js is the ONLY module that constructs a light (found: render/scene.js)" |
| flat rig hemisphere 1.1 → 1.2 | FAIL "flat hemisphere = HemisphereLight(hemiSky, hemiGround, 1.1)…" |
| key descriptor goes world-fixed | FAIL ×4, including "the shipped rig lights a camera surface identically on all six faces (spread 4.1e-1)" |

---

## 6. For the operator — look questions I cannot answer

Serve this worktree on a free port (`node tools/serve.mjs 8749 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-047`) and play the
default run; the A/B is one query flag, live in the same session:

- `http://127.0.0.1:8749/index.html` — shipped rig
- `http://127.0.0.1:8749/index.html?light=flat` — the build as it was
- `http://127.0.0.1:8749/index.html?light=bright` — one dose up
- `http://127.0.0.1:8749/index.html?light=noshadow` — same lights, no shadows

1. **Dose.** Default vs `?light=bright`: which one is the deck you want to run
   on? (`bright` is +6% mean, +10 p95, and closes the backdrop-vs-deck gap
   further; the default keeps more of the frame under the haze value.)
2. **Shadows vs readability.** Near-black pixels went 4.5% → 11.4%. Playing at
   true size with hostiles live, does anything you need to see — a deck lip, a
   wasp diving into a shadowed pocket, an amber tell — get lost? `?light=noshadow`
   is the same frame with the shadows removed and nothing else changed.
3. **The corner.** The key is fixed relative to the view, so through a 60°
   corner the lighting turns with the camera instead of staying put in the
   world. Watch one corner in both `?light=flat` and the default: does the turn
   read as the camera orbiting a static body, or does the body look like it
   moved? (A world-fixed alternative costs the deck its rank as the brightest
   surface on two of six faces — that is the trade.)
4. **Is the deck lit enough?** The backdrop haze is drawn raw and cannot be
   dimmed from here, so "the sky is brighter than the ground" is now a question
   about how much light the deck gets. `?light=noshadow` shows the ceiling for
   this rig (deck band level with the sky). Do you want the shipped rig pushed
   toward that, or is the shadowed foreground mass right?
5. **RIG at 3.75%.** Against the darker deck the marine now reads as the
   brightest small thing in frame. Is that the separation you wanted from a
   30 px figure, or is he now too hot against the surface he stands on?

---

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: `lightrig-capture.mjs --shadowcost --tag after` (commit 1416740) | evidence: `artifacts/lightrig/after/shadow-cost.json`
`renderer.info.render.calls` does not count the shadow depth pass: toggling
`shadowMap.autoUpdate` under load moves the per-frame mean by −0.6 calls while
76 casting objects are being drawn into the map. Every "N draw calls" number in
this project's reports is therefore now an under-count while shadows are on,
and two lanes quoting it will compare different things. Fix direction: state
the caster count beside the draw-call count in report templates, or add a
`castersDrawn` figure to whatever tool the next lane uses.

## I-??? | art | S3 | repro: `?slice=traversal` with any hostile alive (commit 1416740) | evidence: `src/render/lights.js` header, `artifacts/lightrig/after/smoke.json`
Hostile bodies never cast shadows. Their material is
`MeshStandardMaterial({ transparent: true, opacity: 0 })` for the whole
materialize/dissolve arc, and three.js' depth material ignores opacity, so
letting them cast would put a full-strength shadow under an enemy that has not
faded in yet. The result is that the one class of object a player tracks most
closely is the one with no ground contact. Fix direction belongs to the
hostiles lane, not here: flip `mesh.castShadow` (or `userData.shadow = 'both'`)
at the moment the fade completes and clear it when the dissolve starts.

## I-??? | bug | S3 | repro: `lightrig-capture.mjs --tag repeat --variants 'flatA=,flatB='` | evidence: `artifacts/lightrig/repeat/`
Two captures of the same build at the same sim-time mark land on identical sim
state but differ in 0.07–0.17% of pixels. Cause: a jump `keyup` scheduled for a
frame that the capture paused is dropped, which leaves particle and animation
phase slightly different. It is a harness property, not a game defect, but any
future lane that tries a byte-exact frame comparison will chase it. Fix
direction: have the in-page driver re-issue pending key transitions on resume.

---

## Single best next action

Get the operator in front of `?light=flat` vs the default vs `?light=bright` on
a pinned build and take the dose verdict (questions 1 and 2 above) — every
downstream look lane, including T-048's bloom, is now calibrating against
whichever of those three the frame actually ships with.
