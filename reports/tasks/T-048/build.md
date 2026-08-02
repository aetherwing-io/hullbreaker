# T-048 — bloom on the shipped URL, and real material response

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048`, branch
`task/T-048`, base `4f967fb` (the commit that recorded decisions entry 18).
Machine: Apple M4 Max, headless Chrome via `channel: 'chrome'`, ANGLE Metal —
**real GPU, not SwiftShader** (probed: `ANGLE (Apple, ANGLE Metal Renderer:
Apple M4 Max)`).

---

## 1. FRAME TIME UNDER LOAD — the binding condition first

Every reading below is the 256-live-projectile stress path (the game's own
`fireWeapon` at 60 shots/frame plus a death burst and flash every frame), at a
**deviceScaleFactor 2 drawing buffer (2560x1600)** — the operator's retina
pixel ratio, which is where a full-screen pass actually costs something.
`before` is the same build with `?bloom=0`, i.e. the direct
`renderer.render(scene, camera)` path.

### 1a. Vsync-locked — "was any frame late?" (the entry-18 currency)

`artifacts/post-v1/stress-locked-x2/post-capture.json`, 3 runs per mode,
alternated:

| mode | avgMs | worstMs | **over20ms** | draw calls |
|---|---|---|---|---|
| before (`?bloom=0`) | 8.33 / 8.33 / 8.34 | 10.4 / 10.3 / 10.4 | **0 / 0 / 0** | 105 |
| **after (shipped)** | 8.32 / 8.33 / 8.33 | 10.2 / 10.3 / 10.3 | **0 / 0 / 0** | 119 |
| after, `?aa=0` | 8.34 / 8.35 / 8.33 | 10.3 / 10.5 / 11.3 | **0 / 0 / 0** | 119 |

And through the project's own frozen harness, `tools/playtest/juice-stress.mjs`,
before (`tools/playtest/runs/T-048-before/`) and after
(`tools/playtest/runs/T-048-after/`), unmodified:

| reading (stress case) | before | after |
|---|---|---|
| fps | 120 | 119.9 |
| avgMs | 8.33 | 8.34 |
| **worstMs** | **9.3** | **9.3** |
| **over20ms** | **0** | **0** |
| liveProjectiles | 256 | 256 |

**No dropped frames, on either harness.** The brief's stated baseline (worst
frame ~9.4 ms at 101 draw calls) reproduces: this tree measures 9.3 ms at 105
calls before, 9.3 ms at 119 calls after.

### 1b. Vsync UNLOCKED — "how much budget did it actually spend?"

`over20ms = 0` at 120 Hz only proves nothing was late; it cannot see headroom.
Re-run with Chrome's frame-rate limiter off
(`artifacts/post-v1/stress-unlocked-x2/`, 4 runs per mode, alternated), same
load, same retina buffer:

| mode | avgMs (4 runs) | mean | delta vs before |
|---|---|---|---|
| before (`?bloom=0`) | 1.72 / 1.70 / 1.63 / 1.60 | **1.66** | — |
| **after (shipped, `samples: 2`)** | 3.63 / 3.08 / 2.40 / 2.82 | **2.98** | **+1.32 ms** |
| after, `?aa=0` | 2.21 / 2.20 / 2.22 / 2.29 | **2.23** | +0.57 ms |

**The shipped pass costs about +1.3 ms per frame** at 2560x1600 under the
256-projectile load on this machine — about 8% of a 16.7 ms budget. It holds
the budget. I am not claiming that number for any other machine.

### 1c. What MSAA cost, and why `samples` is 2

A composer does not inherit the canvas's antialiasing (`scene.js` constructs
the renderer with `antialias: true`, which only ever applied to the canvas), and
RIG is ~30 px at the frozen view, so silhouette antialiasing is a readability
property, not a cosmetic one. Buying it back on the composer's own targets is
the single most expensive thing this pass does:

- First measurement, both ping-pong buffers multisampled at 4x: **+6 to +9 ms**
  at retina, with `over20ms` 2-23 even unlocked. That would have failed the
  condition.
- `EffectComposer` clones the target it is given, so the second buffer was
  multisampled too — and it only ever holds full-screen quads, which gain
  nothing from samples and pay for a resolve on every read. Setting
  `composer.renderTarget2.samples = 0` (src/render/post.js) cut 4x MSAA from
  ~9.3-12.9 ms to 3.9-6.5 ms.
- Measured after that fix at retina: 0 samples **+0.6 ms**, 2 samples
  **+1.3 ms**, 4 samples **+2.0 to +4.3 ms**.

Shipped: **2**. `?aa=0|1|2|3|4` overrides it for comparison; anything else
resolves to the shipped value.

### Honesty notes on the numbers

1. An earlier stress table in this session read 46-58 fps for the composer and
   120 fps without it. That was **machine contention** — other lanes' browsers
   running at the same time — and it reproduced as 120 fps on both sides once
   the machine was quiet. It is in this report because it is exactly the kind of
   number that would have failed the lane for the wrong reason. Every table
   above alternates the modes so both sides sit in the same weather, and reports
   every repeat rather than a mean alone.
2. `drawMs` in the JSON is CPU time around the submit path, summed over the
   dozen `renderer.render()` calls a composed frame makes and published once per
   rAF turn. WebGL is asynchronous, so it is a floor on the cost, not the cost.
3. Draw calls per displayed frame go **105 → 119** (+14: the scene pass, the
   bright pass, five blur pairs, the composite, the output blit). Note for other
   lanes: `renderer.info.autoReset` is now **false**, reset once per frame in
   `renderFrame()`, because a composer's internal renders were resetting the
   counters mid-frame and any probe reading `info.render.calls` would have seen
   the last pass's handful. The number now means "everything drawn for this
   displayed frame", on both paths.

---

## 2. What changed, and why

### 2.1 `src/render/post.js` (new) — the composer

`RenderPass → UnrealBloomPass → OutputPass`, **ON by default**, `?bloom=0`
(or `off`) as the escape hatch, `?bloom=<n>` as a strength override.

Tuning lives in `src/config.js`'s `POST_TUNE` block: `strength 0.62`,
`radius 0.30`, `threshold 0.78` (a **linear-light** luminance — the pass runs
before tone mapping, where the lit deck sits near 0.1 and an unlit warm-white
quad sits near 1, so the threshold is what keeps bloom off the hull and off
enemy bodies), `samples 2`, `emissiveGain 1.45`.

**The addons load dynamically.** `three/addons/*` is four more CDN modules at
boot; a static import puts the whole module graph behind that fetch, and one
failed fetch is a blank page — the P1 class this project treats as worse than
any missing effect. So the composer is built after the first frames are already
drawn, and *every* failure path (fetch, construction, a throw inside
`composer.render()`) falls back to the direct draw permanently and says so
through `postSnapshot()`.

Proven, not asserted: with every `examples/jsm` request aborted
(`artifacts/post-v1/probe/`), the game reports `status: 'failed'`,
`error: 'Failed to fetch dynamically imported module: …EffectComposer.js'`, and
still runs — `state: PLAYING`, 180 frames sampled, worstMs 10.3, `over20ms 0`,
failsafe faults 0, no failure panel, frame mean luminance 69.25 (a normal
picture). Screenshot: `artifacts/post-v1/probe/offline-fallback.png`.

### 2.2 The atmosphere had to be held, or the whole frame moved

**This is the finding of the lane, and it was measured, not anticipated.**
Wired the ordinary way, the composer made the frame *much darker* before bloom
did anything: the traversal fixture's sky band fell from luminance **42.90 to
25.24** and its whole-frame mean from **47.10 to 31.62**; the six-face combat
frame's mean fell 66.98 → 64.36. Entry 14 already ruled the frame "too dark" —
shipping that would have answered the operator in the wrong direction, and it
would have invalidated every value the look lanes are tuning against.

Cause: three.js resolves two uniforms against the current render target rather
than against the material — the background clear color and the fog color
(`getUnlitUniformColorSpace`). Drawn to the canvas both get their **sRGB-encoded**
numbers and the background skips tone mapping entirely (this is exactly what
`src/render/palette.js`'s calibration note records as "scene.background/fog is
drawn raw", and what every CONCEPT token was authored against). Drawn into a
render target both get **linear** numbers and both then go through OutputPass's
tone map.

Fog needed the same correction as the sky for a reason worth writing down: three's
fragment chain is `tonemapping_fragment` → `colorspace_fragment` → `fog_fragment`
(ten shaders in three.module.js end in that exact order), so **the fog blend
happens after the tone map, in display space**. I got this wrong once — corrected
by measurement, which showed distant geometry jumping from (47,86,94) to
(135,171,176) — and the corrected version is what shipped.

`src/render/post.js` therefore hands the composer, for one frame only, the
values whose tone-mapped result IS the authored token, and restores the authored
colors immediately after (`src/render/transform.js` copies the fog color into the
background per band, and the fog-ladder lanes read them too — nothing outside
that function ever sees a compensated color).

Result, on matched frames: sky **72.76 → 73.19** and **42.90 → 42.90**; sampled
pixels identical — sky `(20,50,56)` both sides, deck `(119,66,27)` both sides.
The residual is bloom's own bleed.

Two things this does *not* do, both stated rather than hidden:

- The **middle of the fog ramp** cannot be reproduced exactly: the shipped blend
  is linear in display space, the composed one is linear in light. Both ends are
  byte-exact; a half-fogged pixel differs by a few levels.
- It does **not** settle whether today's atmosphere is right. Today the sky
  skips a tone map the haze goes through, so they do not actually agree on
  screen; the composer is the first thing here that *could* make them agree.
  That is an operator verdict, so the default is "change nothing but the bloom",
  and **`?atmos=tone`** shows the alternative.

The inverse curve lives in `src/pure/tonemap.js` — arithmetic with no renderer
in it — specifically so the gate can assert the round trip on every atmosphere
token instead of trusting a comment.

### 2.3 Material response (`src/pure/post.js` SURFACE + `src/render/materials.js`)

`roughness`/`metalness` were never set anywhere in `src/`; every surface sat at
`MeshStandardMaterial`'s defaults (roughness 1, metalness 0 — a perfectly matte
dielectric) and had nothing to respond to light with. Now there is a family
table, and the hostile roster wears it: `carapace` for the flyers, `chassis` for
the houndframe's exposed running gear, `emplacement` for the two rooted kinds.

**Metalness with nothing to reflect renders BLACK** — a metal has no diffuse
response — and entry 14 forbids a darker frame, so a small **generated**
environment ships with the families: a vertical gradient between the rig's own
`hemiSky` / `bg` / `hemiGround` tokens, prefiltered through PMREM. Built on
first use, never fetched, and a failure returns null (families then simply have
no envMap).

**Scope I could not reach, and did not take:** the hull, deck and limb surfaces
are the bulk of the frame and live in `level.js` / `limb.js` (T-035),
`player.js` (T-040) and `transform.js`, which my fences exclude. The `deck`,
`plate`, `machine` and `distant` families are authored and unused, and adopting
one is a single call — `applySurface(mat, 'deck')` — with the environment shared
and already built. **The material half of this lane is therefore partial by
construction**, and the integrator should hand those four families to whichever
lane owns those files next. If the operator wants the hull to read as metal, it
is one lane's worth of one-line changes, not new work.

### 2.4 Emissive gain — what makes bloom mean anything

Bloom bleeds only what is above threshold, and every emissive family draws at
exactly its token color, which sits under it. `postGain()` (1.45) lifts the
flash/spark pools (`fx.js`), the tell lamps, the polyp's live beam, the mortar
pod and detonation, and the hostile body emissive (`hostiles.js`) over the line.
It returns **1 whenever the composer is not actually drawing** — `?bloom=0`, or a
failed fetch — so the escape hatch really is the pre-pass look, not a clipped
version of it. `fx.js` reads it once per frame, not once per particle row.

### 2.5 Tuning I changed after looking at frames

First pass shipped `radius 0.45`, `gain 1.7`. On the polyp scene the tell lamp's
halo was wide enough to eat the polyp's own silhouette — which is the pillar-5
failure entry 18 names ("bloom that buries a wasp"). Tightened to `radius 0.30`,
`gain 1.45`; the body reads inside its own glow now. **I am not judging whether
it looks good — that is the operator's, and both knobs are one number each.**

---

## 3. Readability evidence (frames are matched, so they can be subtracted)

`artifacts/post-v1/`, 1280x800, five scenes, each captured twice from the same
fixture with `?fixeddt` and an input schedule keyed to the game's own clock, the
run frozen from inside the page at a named `gameMs`. Every pair reports
`frameExact: true` — same sim instant, same RIG position, same kill count — so
the two images differ by the draw path and nothing else.

| scene | sky mean | frame mean | above L200 | mean abs Δ | max Δ | pixels moved >8 |
|---|---|---|---|---|---|---|
| far-combat | 72.76 → 73.19 | 66.98 → 67.83 | 0.141% → 0.159% | 0.99 | 148 | 2.52% |
| far-combat-late | 72.68 → 73.15 | 69.03 → 70.08 | 0.146% → 0.159% | 1.25 | 143 | 3.56% |
| traversal-hunt | 43.18 → 43.25 | 45.69 → 46.57 | 0.191% → 0.212% | 0.91 | 138 | 2.63% |
| polyp-tell | 43.61 → 43.67 | 47.31 → 48.22 | 0.228% → 0.250% | 1.03 | 158 | 3.03% |
| hound-tell | 42.90 → 42.90 | 47.10 → 47.39 | 0.126% → 0.132% | 0.36 | 159 | 0.99% |

Read: a **large** delta over a **small** area near the light sources (max ~150
levels), and 96.4-99.0% of the frame moved by 8 levels or less. The sky band
moves by ≤0.5 of a level — the frame is not hazed and it is not darkened.

---

## 4. Verification — every command and its result

| command | result |
|---|---|
| `node tools/pathcheck.mjs` (base `4f967fb`) | 1834 passed, 0 failed |
| `node tools/pathcheck.mjs` (this branch) | **1871 passed, 0 failed** |
| `node tools/playtest/juice-stress.mjs runs/T-048-before` (this worktree, before any change) | 120 fps, worst 9.3 ms, over20ms 0, 256 live |
| `node tools/playtest/juice-stress.mjs runs/T-048-after` | 119.9 fps, worst 9.3 ms, over20ms 0, 256 live |
| `node run.mjs scripts/mid-route.json --deterministic` | **completed**, 0 deaths — matches the README's documented outcome |
| `node run.mjs scripts/dare-pocket.json --deterministic` | **not-completed**, 0 deaths — matches the README |
| `node run.mjs scripts/idle-greedy.json --deterministic` | **stalled** — matches the README |
| `post-capture.mjs --probe` (`?selftest=1`) | **SELFTEST PASS (39 checks)** |
| `post-capture.mjs --probe` (addons aborted) | `status: failed`, PLAYING, 180 frames, worst 10.3 ms, 0 faults, no panel |
| `post-capture.mjs` (5 scenes) | 5/5 `frameExact: true` |
| `post-capture.mjs --stress --scale 2 --repeats 3` | over20ms 0 on all 12 readings |
| `post-capture.mjs --stress --unlocked --scale 2 --repeats 4` | +1.32 ms mean vs before |

### One existing assertion changed, and why it is not a weakening

`tools/pathcheck/pathcheck-suite-2.mjs:248` pinned the exact source text
`renderer.render(scene, camera); updateHUD();` inside the frame loop's try/catch.
T-048 changed the **spelling** of the draw to `renderFrame()`. The property that
assertion is about — the draw sits in its own try/catch so a step that throws
still paints the frame it broke on — is unchanged and still gated; only the
regex moved. Coverage went **up**, not down: the new domain additionally asserts
that `main.js` never calls `renderer.render` directly, that the fallback sits
after the composer branch, and that a composer throw retires the composer instead
of throwing at the failsafe every frame.

### The new gate binds — six defects injected, six caught

`tools/pathcheck/t-048-post-pass.mjs` (34 assertions — the branch's gate
runs **1871 passed, 0 failed** against the base's **1834 passed, 0 failed**,
measured by running the gate in a scratch copy of `git merge-base main HEAD`;
the other three are the layer guards the two new `src/pure/` files pick up),
listed in
`manifest.mjs` as `d40`). Each break was applied, the gate run, and the tree
restored (`git status --short` clean afterwards):

| break | gate said |
|---|---|
| junk in `?bloom=` disables the pass | FAIL `junk in ?bloom= resolves to the shipped default…` |
| the tone-map inverse returns its input | FAIL `every background/atmosphere token survives the tone-map round trip…` (worst 23 on 0x2a525c) |
| a composer throw does not retire the composer | FAIL `a throw inside the composer retires it permanently…` |
| a hostile names a family that does not exist | FAIL `…and every family a mesh names exists in the table (gunmetal)` |
| the emissive gain applies with the pass off | FAIL `postGain() is the gain only while the composer is ACTUALLY drawing…` |
| the addons become a static import | FAIL `…and nothing anywhere imports three/addons at module scope` |

---

## 5. How this composes with T-047 (tone mapping + shadows)

**I did not touch `src/render/scene.js` or `src/render/camera.js`.** The
composer reads that lane's decisions rather than making its own:

- `OutputPass` re-reads `renderer.toneMapping` and `renderer.outputColorSpace`
  **every frame** and rebuilds its defines when either changes (verified in the
  addon's source). Whatever T-047 sets, the composed frame gets — this module
  never sets either, so there is no double tone map.
- The scene is rendered into a render target, where three applies **no** tone
  mapping; OutputPass applies it once, on the canvas. A pixel bloom did not
  touch comes out where it was.
- **Sequencing:** merge order does not matter for correctness, with one caveat.
  The atmosphere compensation is solved against **ACESFilmic** specifically
  (what `scene.js` sets today). If T-047 moves to AgX or Neutral, the
  compensation stands down on its own and reports `atmos: 'unmatched'` in
  `HB.post()` rather than applying an inverse for a curve that is no longer in
  use — the frame would then get that lane's tone-mapped sky, which is a look
  change to judge, not a crash. If they change the curve, ping me and the
  inverse generalizes in one function.
- Shadows: a shadow map is drawn before the scene pass and is unaffected by the
  composer. No interaction expected. If their light rig changes `hemiSky` /
  `hemiGround` / `bg`, the generated environment in `materials.js` follows them
  automatically — it is built from those tokens.
- If T-047 wants an environment scene-wide, `surfaceEnv()` returns exactly what
  `scene.environment` wants; that assignment belongs in their file, not mine.

---

## 6. Open feel questions for the operator (I do not judge these)

Serve the branch and compare — `node tools/serve.mjs 8750 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-048`:

- **A/B:** `http://127.0.0.1:8750/index.html` vs
  `http://127.0.0.1:8750/index.html?bloom=0`

1. With bullets and the muzzle flash glowing, does a firefight read as MORE
   legible or LESS at true size — can you still pick a wasp out of a burst?
2. The houndframe/polyp tell lamps now spill light onto the deck around them
   (`?slice=traversal&polyp=1`). Does that make the telegraph easier to catch,
   or does it wash the body you are supposed to be reading?
3. Strength is one number (`?bloom=0.35` softer, `?bloom=1.2` stronger — try
   both): which dose?
4. `?atmos=tone` puts the sky and the haze through the tone map, which makes
   them agree with each other for the first time and makes the frame darker
   overall. Default is off, because entry 14 says do not re-darken. Do you want
   to see it as a considered option, or is that closed?
5. The enemies now have a metal/carapace response; the hull, deck and limbs do
   not, because those files belong to other lanes this cycle. Worth spending a
   lane on the hull families next, or is the enemy read enough for now?

## PROPOSED INBOX ISSUES

```
## I-??? | art | S3 | repro: any URL, src/render/{level,limb,transform,player}.js | evidence: reports/tasks/T-048/build.md §2.3
The `deck`, `plate`, `machine` and `distant` surface families in src/pure/post.js are authored, gated
and unused: the files that would wear them were fenced to other lanes this cycle. The bulk of the
frame is therefore still a matte dielectric at the class defaults while the enemies respond to light,
which is a half-finished look rather than a neutral one. Fix direction: one lane, four one-line
applySurface() calls, and a re-judgement of the value ladder afterwards since a specular response
changes what the ladder is tuning.
```

```
## I-??? | bug | S3 | repro: any URL with ?bloom=0 vs default, tools/playtest/post-capture.mjs | evidence: src/render/post.js "ATMOSPHERE COMPENSATION"
Today the sky is drawn with no tone mapping at all while fogged geometry is tone mapped, so "fog
matched to background" (asserted in pathcheck as a token identity) is NOT what lands on screen — a
fully fogged surface and the sky behind it agree only because the fog uniform is also handed over in
display space. The composer path reproduces this exactly on purpose, but the underlying mismatch is
still there and any lane retuning the fog ladder will meet it. Fix direction: an operator verdict on
?atmos=tone, then delete whichever half is wrong.
```
