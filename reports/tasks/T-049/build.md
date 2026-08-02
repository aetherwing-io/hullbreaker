# T-049 — the generated hostile sprites, wired into the game

The five hostile roles now draw as the T-046 sprite art on billboarded quads,
ON by default, with `?sprites=0` back to the primitives and `?spritevar=`
switching candidates. The condition `docs/decisions.md` entry 16 attaches to
runtime assets — degrade visibly and safely, never wedge, and **never let the
sim branch on whether art loaded** — is implemented as the design of the loader
and then *measured*, not asserted in a comment.

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-049`,
branch `task/T-049`.

---

## 1. TRUE SIZE FIRST — what the FAR camera actually draws

**Look at this before anything else.** One frame per mode at 1280x800, all five
roles planted on the opening deck, cropped 1:1 — every enemy here is the size
the shipped camera draws it (a houndframe is 30 x 16 px, a drone 17 x 17):

- **`artifacts/sprites-v1/lineup-true-size.png`** — sprites (shipped) /
  primitives (`?sprites=0`) / variant a (`?spritevar=a`), stacked.

Per role, the same three modes at 1x and at 4x, from the same frames:

| role | sheet |
| --- | --- |
| houndframe | `artifacts/sprites-v1/role-hound.png` |
| drone (wasp) | `artifacts/sprites-v1/role-wasp.png` |
| carrier | `artifacts/sprites-v1/role-carrier.png` |
| Iris Polyp | `artifacts/sprites-v1/role-polyp.png` |
| Spore Mortar | `artifacts/sprites-v1/role-mortar.png` |

Full frames: `frame-sprites.png`, `frame-primitive.png`, `frame-variant-a.png`.
A busy frame with the sprite roster under the 256-projectile barrage:
`artifacts/sprites-v1/perf/stress-sprites.png` (and `stress-primitives.png`
beside it — `tools/playtest/runs/` is gitignored, so the readings and the two
frames are copied into `artifacts/sprites-v1/perf/`).
The drone's dive, mirrored both ways at 6x:
`artifacts/sprites-v1/wasp-dive-facing.png`.

Rig: `tools/playtest/sprite-capture.mjs` (new). It spawns one of each kind
through the game's own `spawnHostile()` outside every trigger range, so nothing
is mid-telegraph, and projects each body through the game's own camera to place
the crops. Its header carries the honesty notes; the load-bearing one is that
the three modes are three page loads, so bodies drift by a few tiles between
them — judge the art, not pixel deltas.

### The one measurement that cuts against the sprites

Measured off the committed frames above — the method is two sentences and the
honesty note in §10 — each body's box against the background it stands on, at
true size:

| role | mode | drawn px | body mean L | bg L | body p10..p90 | px separated by >=20 L |
| --- | --- | --- | --- | --- | --- | --- |
| carrier | sprites | 471 | 51.2 | 44.1 | 21..92 | **217** |
| carrier | primitives | 588 | 94.1 | 44.1 | 83..99 | **560** |
| polyp | sprites | 614 | 51.8 | 44.1 | 11..116 | **344** |
| polyp | primitives | 526 | 102.8 | 44.1 | 61..134 | **489** |
| mortar | sprites | 611 | 56.5 | 44.1 | 14..118 | **341** |
| mortar | primitives | 440 | 104.8 | 44.1 | 66..124 | **405** |
| wasp | sprites | 292 | 39.4 | 44.1 | 8..76 | **151** |
| wasp | primitives | 191 | 112.1 | 44.1 | 27..182 | **143** |
| hound | sprites | 918 | 64.7 | 44.1 | 25..90 | **629** |
| hound | primitives | 1137 | 106.5 | 44.1 | 74..124 | **1136** |

Read it this way, and no further: **the primitives are flat slabs of bright
acid (mean luminance 94–112 against a 44 background) and the sprites are darker
machines with an internal value range** (a polyp runs 11..116 inside one body).
The sprites carry shape; the primitives carry pop. On the count of pixels that
separate from the background by a full value step, the sprite is behind the
primitive for four of five roles — most for the carrier (217 vs 560) and the
houndframe (629 vs 1136) — and level for the drone (151 vs 143), which also
gains 53% more drawn area.

That is a measurement, not a verdict, and pillar 5 says readability outranks
fidelity — so it is question 1 for the operator below. I have not tried to
"fix" it: lifting the art's values or adding an ink rim to a hostile is art
direction, and it belongs to the operator and the asset lane, not to the lane
that wires the pipe. It is filed as a proposed inbox issue instead.

---

## 2. THE ASSET-MISSING PROOF — entry 16's condition, as a test

`node tools/playtest/sprite-fallback-check.mjs` (new) answers three questions in
two conditions (art served / every `assets/generated/sprites/**` request aborted
at the network). Last run, all checks passed:

```
=== 0. both runs are actually comparable ===
  PASS  art:    the scripted stretch ran start to finish without a death — state=PLAYING attempts=1
  PASS  no-art: the scripted stretch ran start to finish without a death — state=PLAYING attempts=1

=== 1. the sim must not branch on whether the art loaded ===
  PASS  both runs produced the scripted 48 samples of 250ms game time — 51 / 50 recorded
  PASS  the two sim traces are identical, sample for sample — 48 samples compared

=== 2. the art really did fail in the no-art run, and drew in the other ===
  PASS  every kind loaded its sprite in the control run — hound:ready carrier:ready wasp:ready polyp:ready mortar:ready
  PASS  every kind reports a FAILED sprite when the art is unreachable — hound:failed … mortar:failed
  PASS  the failure is visible in the console, naming the file — "HULLBREAKER art: hound sprite
        hound-brace-b.png did not load (error) — drawing the primitive body instead."

=== 3. nothing is blank: every body still draws, both ways ===
  PASS  art:    carrier 70% / polyp 77% / mortar 68% / wasp 51% / hound 67% of its box differs from the background
  PASS  no-art: carrier 57% / polyp 78% / mortar 59% / wasp 53% / hound 62%

=== 4. it did not wedge ===
  PASS  art:    showing=null halted=false faults=0 uncaught=0 beats=755
  PASS  no-art: showing=null halted=false faults=0 uncaught=0 beats=786
```

The trace half is the load-bearing one. Both runs play the same held input
under `?fixeddt=16.6667` (the sim's own constant-step hook), with the keys
pressed **inside the page on the frame the game's own clock crosses the mark**,
and the page records a digest of `HB.snapshot()` — player position/velocity/hp/
lives/facing, kills, shots, scroll, every hostile's kind/position/hp/state,
every capsule — every 250 ms of game time. 48 samples, identical strings.
Evidence: `artifacts/sprites-v1/fallback/fallback-check.json`.

**And the brief's own test, with the files physically gone**
(`mv assets/generated/sprites /tmp/…`, full log in §5):

- `node tools/pathcheck.mjs` → **10 failures, all of them the existence
  assertions** (`T-049: hound/a names an asset that exists (hound-brace-a.png)`
  …), 2080 passed. The gate notices.
- `node run.mjs scripts/mid-route.json --deterministic` → `outcome: completed`,
  `deaths: 0`. The game plays.
- The frame with the art physically deleted:
  `artifacts/sprites-v1/no-assets-on-disk/lineup-true-size.png` — all three
  modes draw the primitives, identically to `?sprites=0`.
- Restored → `pathcheck: 2110 passed, 0 failed`, `git status --short` clean of
  anything but this lane's files.

### One flake, disclosed

Eleven runs of `sprite-fallback-check.mjs`, ten of them clean. **One reported
"4 CHECK(S) FAILED" and I did not capture which four** — the invocation piped
through `tail`, and the next nine runs (including the four consecutive ones
logged to `/tmp` and every run since) were green, so I could not reproduce it.
I am not claiming to know what it was.

Two things about it are known. First, the run happened *after* the one harness
bug I did find and fix (the script ends each run by polling from Node, so one
condition could record an extra trailing sample and the old "same number of
samples" check went red on it; the comparison window is now the scripted 48
samples, with both raw lengths reported). Second, the most plausible remaining
cause is a run that ended in a death — the digest only records while PLAYING,
and a retry moves RIG, which would cascade into roughly that many failures — so
the script now opens with a check that both runs finished in PLAYING with at
most one attempt, which turns that case into one clear message instead of four
mystery ones. Anyone running this as a gate should run it twice before
believing a red.

---

## 3. FRAME COST — measured before and after, same session

`node tools/playtest/sprite-stress.mjs` (new; method copied from
`juice-stress.mjs`, which is why its numbers are comparable in kind). Full
readings: `artifacts/sprites-v1/perf/result.json`.

```
  primitives  quiet board: 29 calls empty, 42 with 5 hostiles (2.6 draw calls per body)
  sprites     quiet board: 29 calls empty, 37 with 5 hostiles (1.6 draw calls per body)
  primitives  fps 119.9  avg 8.34ms  worst 10.30ms  over20ms 0  drawCalls 144  tris 50702  projectiles 256  hostiles 11
  sprites     fps 120.0  avg 8.33ms  worst 10.30ms  over20ms 0  drawCalls 133  tris 50382  projectiles 256  hostiles 11
```

- **60 fps holds with 256 live projectiles**, both ways: zero frames over 20 ms,
  worst frame 10.30 ms in both. rAF is vsync-locked at 120 Hz here, so `fps` is
  a ceiling, not a headroom figure — `worstMs`/`over20ms` are the readings.
- **Draw calls drop.** The five-role roster costs 13 calls as primitives and 8
  as sprites (a polyp is 3 meshes + a stalk, a mortar is a cone + 3 legs; each
  becomes one quad). Per-role, medians over 90 frames on an idle board:
  polyp −2, mortar −3, hound/wasp/carrier unchanged.
- **This cost one real fix.** The first wiring made every sprite body cost
  **two** draw calls, not one: a `DoubleSide` **transparent** material is drawn
  twice per frame by three.js (back faces, then front) to help sorting. Traced
  it by wrapping `renderer.renderBufferDirect` and counting
  `Mesh:PlaneGeometry+map+T: 2` per body. A flat quad cannot overlap itself, so
  the material now sets `forceSinglePass: true` and the roster went from +13 to
  +8. Without that line, the sprites would have *raised* the call count.
- The 101-call figure in the dispatch brief is not a number I could reproduce
  in this tree; the baseline I measured (`?sprites=0`, same session, same
  machine) is the one quoted above, and every comparison here is against it.
- **What these draw-call numbers cover.** This branch has no shadow pass, so
  `renderer.info.render.calls` is the whole frame here. T-047 adds shadow maps
  and its report notes that `renderer.info` does not account for the shadow
  pass — so nobody should carry "133 draw calls" forward as a shadow-inclusive
  figure once that lane lands. The same note is now in
  `tools/playtest/sprite-stress.mjs`'s header so the next reader of the tool
  meets it before the number.

---

## 4. WHAT CHANGED, AND WHY IT IS SHAPED THIS WAY

### New: `src/render/sprite-table.js` (Node-safe, no THREE, no DOM)

The roster and the arithmetic. Node-safe on purpose, exactly like `palette.js`
and `legibility.js`: the part that can lie about SIZE is the part a headless
gate must be able to import.

**The sizing rule is the whole point of the file.** A generated sprite does not
fill its canvas — the drone's art covers 94% x 88% of a 32x32 PNG — so sizing
the quad to the canvas draws the body *smaller than the primitive it replaces*.
T-046 measured exactly that failure (`wasp-drone-a` at 15.2 x 13.1 px against
the shipped octahedron's 17.4 x 17.4). So the quad is sized from the **ink**:
the opaque bounding box of the art is fitted to the box the primitive drew, and
the quad grows past it by exactly the transparent margin. Consequences, all
asserted:

- every role's drawn ink is the primitive's box, to the tile;
- the ground kinds stand on their own mount line (`hound.rideY`,
  `polyp.rootY`, `mortar.bodyY`) rather than on a number picked by eye;
- the drone's drawn half-width is `visualRadius` exactly, so
  `waspDiveStretch()`'s existing clamp still lands the stretched nose on
  `contactRadius` and not past it — the drawn body never claims reach the sim
  did not give it.

One role is deliberately not box-matched: the **tripod is 1.5 tube-diameters
wide** (`MORTAR_STANCE`) instead of 1.0, because the source art is square and
squashing it into the cone's footprint bends the legs into a pillar. The hit
circle is unchanged and still inside the drawn tube; the extra width is legs,
which is the same theater the houndframe's 1.7-tile chassis already has over
its 0.42-tile hit circle.

### New: `src/render/sprites.js` (the loader)

Eager load of the five selected variants at module load (~7 kB total; a lazy
load would turn the first houndframe of a run into a box that changes shape
mid-charge). Nothing in it throws: a 404, a decode failure, a file that was
never copied and a mistyped `?spritevar=` all land in the same state, and
`spriteTexture()` returns `null`, which `hostiles.js` reads as "draw the
primitive".

**On "degrade visibly":** the visible degrade is that the hostile is *drawn*,
as the primitive, on the first frame — plus one console line naming the file,
plus a note handed to the T-032 bootstrap so the detail is in the panel if one
is ever raised for any reason. It deliberately does **not** raise that panel: a
missing picture is not a dead game, and `index.html`'s own handler already says
so ("a picture or a stylesheet that failed to arrive is not a dead game").
`window.__HB_SPRITES()` is the read surface for gates and the console; it is
here rather than on `window.HB` because `src/main.js` is another lane's file
and because the sim must not be able to see this state at all.

Texture setup worth flagging: `colorSpace = SRGBColorSpace` (unset, the whole
roster renders washed out under the ACES output), `anisotropy 4`, and
**mipmapped linear minification rather than `NearestFilter`** — T-046's
integration note suggested nearest, but at FAR a 64 px texture is drawn at
~30 px, which is *minification*, and nearest sampling on a moving 30 px sprite
crawls as the texel grid slides under the pixel grid.

### Changed: `src/render/hostiles.js`

- `spawned()` takes the sprite **only if the texture is already in hand**;
  otherwise it builds the primitive exactly as before. The fallback path is the
  shipped pre-T-049 renderer, not a placeholder.
- The polyp's barrel + stalk and the mortar's three legs are not built for a
  sprite body (they are drawn into the art) — that is where the draw calls go.
  Every damage prop (beam, pod, mark, blast slab) is built for both bodies,
  unchanged, and still drawn from what the sim marched.
- All the existing state theater keeps working untouched: the tell/charge/dive/
  swell poses scale the quad around the sim row as they scaled the solid, the
  tell lamps were always separate meshes, and the hit flash still rides
  `emissive` — which is why the material is `MeshStandardMaterial` with
  `emissiveMap` set to the art, so a flash lights the drawn pixels and leaves
  the transparent margin dark. (T-046 called the flash a real decision for
  whoever wired this; the answer is "keep the language, pay a lit material".)
- Three per-kind differences the art forces, all render-only: sprites are
  authored facing +x so a left-facing body mirrors (`scale.x < 0`); the
  **tripod does not roll** (`mortarRoll`'s tilt is drawn into the art, and
  rolling it again aims the tube at the deck); the **drone banks instead of
  spinning** (a tumbling picture of a machine reads as a bug) and still points
  down its dive vector — verified both ways in
  `artifacts/sprites-v1/wasp-dive-facing.png`.
- A texture that lands after a body of its kind already spawned rebuilds that
  body in place, so a slow network cannot leave one houndframe a box for its
  whole life. Nothing about the sim row is read or written to do it.
- Corpses keep the facing they died with (`face` on the corpse row) instead of
  flipping on the frame of death.

### New assets

`assets/generated/sprites/*.png` + `.svg` — the ten T-046 candidates, copied at
identical paths and bytes. **`assets/manifest.json` is deliberately untouched**:
T-046's branch adds these entries itself, and adding them here too would collide
on merge (duplicate ids fail `check.mjs`). Copying the SVG sources as well means
either merge order leaves the manifest's `source` fields pointing at real files.

### Flags

| URL | effect |
| --- | --- |
| *(none)* | sprites ON, variant `b` on all five roles |
| `?sprites=0` | the primitive bodies, byte-identical to the pre-T-049 renderer |
| `?spritevar=a` | the other candidate on all five |
| `?spritevar=hound:a,wasp:b` | per-role; anything unnamed keeps the default |

Variant `b` ships because it measured higher interior contrast at true size in
four of five roles (mean neighbour-pixel value difference after downsampling to
the on-screen size: hound 15.3 vs 6.6, wasp 22.2 vs 19.6, polyp 21.1 vs 18.7,
mortar 31.4 vs 23.1; the carrier is the exception at 16.4 vs 19.2). That is a
proxy for "the parts stay distinguishable", not a judgement — question 2 below.

---

## 5. EVERY VERIFICATION COMMAND, AND WHAT IT PRINTED

Run from the worktree unless noted.

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **2121 passed, 0 failed** (base of this branch: 1853 — +268 from the new domain, including the boot-gate contract in §6) |
| `node tools/assets/check.mjs` | **PASS**; `src/render/sprite-table.js:35: runtime asset reference` listed, no static import |
| `node tools/gatecheck.mjs` | **PASS** — 5 controls red where they must be |
| `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic` | `outcome: completed`, deaths 0 |
| `… run.mjs scripts/transform-slice.json --deterministic` | `outcome: completed`, deaths 0 |
| `… run.mjs scripts/polyp-lane-dodge.json --deterministic` | `outcome: completed`, deaths 0, 13 policy tap fires |
| `… node sprite-fallback-check.mjs` | all checks passed (see §2; 10 of 11 runs) |
| `… node sprite-stress.mjs` | see §3 |
| `… node sprite-capture.mjs` | 5 bodies per mode, all five `ready` on the default URL |
| `… node asset-boot-probe.mjs` | boot gate costs 14ms, boot unchanged, zero frames over 20ms (§6) |
| `… node preload-concurrency-check.mjs` | 9/9 checks pass; 5 fail against the reviewed gate (§6) |

### The new assertions bind — six breaks, each restored

Every one of these was made, run, and reverted; the tree is clean
(`git status --short` shows only this lane's files).

| what was broken | what pathcheck printed |
| --- | --- |
| a sim module named an asset path | `FAIL T-049: src/sim/hostiles.js names an assets/ path …` + `names an image file` → 2 failed |
| a recorded ink box no longer matched the PNG | `FAIL T-049: wasp-drone-b.png recorded ink box [0,0,32,32] is the opaque bounding box measured from its pixels ([2,2,30,28])` |
| the quad sized to the canvas instead of the ink (T-046's defect) | 10 failures, e.g. `hound/a: the quad exceeds the ink by exactly the PNG's transparent margin (x) [got 1, want 1.103…]` |
| the loader dropped its error callback | `FAIL T-049: the texture load passes an error callback that routes to the fallback …` |
| a declared sprite file went missing | `FAIL T-049: polyp/b names an asset that exists (polyp-iris-b.png)` |
| `hostiles.js` used the sprite without checking it arrived | `FAIL T-049: spawned() asks for a texture and accepts null as an answer` |

Restored → `pathcheck: 2110 passed, 0 failed`.

### A scoping decision inside the gate, stated out loud

The contract assertion ("gameplay must not branch on whether art loaded") bans
asset paths, image files, texture loaders and the sprite modules **in
`src/sim/`**. For `src/pure/` it bans only the two things that would let a pure
module *branch* on a load (a loader call, an import of either sprite module),
not the mere mention of a path — T-040's branch stores a sprite path as a
constant in `src/pure/rig.js`, and legislating that from this lane would fail
another lane's merged decision without making this contract any safer.

---

## 6. THE BOOT GATE — asked for after T-040 failed its gate on the load path

The team lead reported that T-040 (RIG as a runtime sprite) failed its playtest
gate on the *loading mechanism*, with deterministic runs of `mid-route.json`
finishing 6352 / 6864 / 8308 ms of sim time apart and one crush-edge approach
2.4 tiles worse, and asked this lane to (1) make all asset loading finish before
the sim's first frame, (2) prove it with the same measurement, and (3) build the
general answer if I could.

**Correction to §2 of this report, first.** The "identical sim traces" evidence
there ran under `?fixeddt=16.6667`, which pins the sim step. It proves the sim
does not *branch* on the asset. It is blind by construction to frame-time
jitter from a load, and I should not have let it stand as the whole determinism
story.

### What shipped: `src/render/preload.js`

One boot gate any lane can register with.

- `preloadTexture(url)` registers a texture and returns a promise that
  **never rejects**.
- Residency means **uploaded**: `renderer.initTexture()` runs during boot,
  because a texture that has only been fetched still uploads on its first
  draw — that moves the stall into the run instead of removing it.
- `awaitPreloads()` resolves when everything is resident **or** one shared
  wall-clock budget (`PRELOAD_BUDGET_MS = 2500`, inside the T-032 bootstrap's
  10 s boot watchdog) expires. `src/render/sprites.js` awaits it **at module
  scope**; the ES module graph holds `src/main.js` — which imports the hostile
  renderer, which imports the loader — until it settles. No fenced file
  changed.
- **A late arrival is disposed, never applied.** Uploading a texture that
  turned up after the gate closed would be the same defect, rarer. The
  mid-run "texture arrived late, rebuild the body" path that §4 described has
  been **deleted** for the same reason: every kind's state is final before the
  first frame.
- `preloadSnapshot()` / `window.__HB_PRELOAD()` is the read surface.
- Pathcheck now enforces the contract, including that **`THREE.TextureLoader`
  is constructed in `preload.js` and nowhere else under `src/`** — a lane that
  hand-rolls a second loader trips the gate and gets told to route through
  `preloadTexture()`. (T-040 will trip this on merge; that is the intended
  convergence, and the lead has been told.)

### What it costs, measured directly

`node tools/playtest/asset-boot-probe.mjs` (new; five page loads per
condition, fixed 6 s wall window of held input):

| condition | boot → first PLAYING frame | preload cost | worst frame | over 20 ms | sim ms in a fixed 6 s window |
| --- | --- | --- | --- | --- | --- |
| merge-base | 159–169 ms | — | 10.20–10.30 ms | 0 | 6047–6099 (spread **52**) |
| `?sprites=0` | 158–179 ms | — | 10.30–10.40 ms | 0 | 6044–6057 (spread **13**) |
| shipped default | 155–165 ms | **14 ms, 5/5 resident** | 10.30–10.40 ms | 0 | 6051–6056 (spread **5**) |

The whole five-texture preload costs **14 ms**, boot to first frame is no
slower than the base tree, no frame in any condition exceeded 10.4 ms, and in a
fixed window the sprite build accumulates sim time *more* tightly than base.

### REWORK after review: the gate was not actually shared

Review found — empirically, not by reading — that the first version of this
module failed the one property it was built for. `awaitPreloads()` raced a
**private snapshot** of the registry taken at entry, then set the module-level
`closed` and force-marked every still-pending entry `'timeout'`. Two
independent sibling modules doing exactly what the header prescribed lost the
second module's texture in **7 of 10 trials, within 3–6 ms**, with a console
line claiming a 2500 ms budget had elapsed. The doc comment ("safe to call…
from more than one module") was the opposite of the behaviour.

Fixed in three parts:

1. **One settlement, one clock.** `awaitPreloads()` returns a single shared
   promise; `settle()` re-reads the registry after every wait instead of
   racing a snapshot, so a sibling registering while the gate is open is
   waited for. The deadline is `startedAt + PRELOAD_BUDGET_MS`, set once at
   the first registration — nobody gets a fresh budget and nobody is robbed
   of the shared one.
2. **Registering after close is refused by name**, loudly, instead of being
   accepted into a gate that will never open.
3. **The diagnostics stopped lying.** A timeout reports the time actually
   waited (`still loading after 2502ms of the 2500ms boot budget`).

**Proved with the reviewer's test shape, and made deterministic.**
`node tools/playtest/preload-concurrency-check.mjs` loads two independent
sibling modules (`tools/playtest/fixtures/preload-concurrency/lane-{first,second}.js`)
that adopt the gate exactly as documented, in three conditions:

```
=== plain: 10 trials, both lanes must end resident ===
  PASS  both lanes resident in every trial — 10/10; second-lane states: ready
  PASS  the gate closed inside its budget every time — costMs 3-4ms of 2500
  PASS  both registrations are visible in one shared registry — entries per trial: 2

=== slow-second: the second lane is 400ms behind (inside the budget) ===
  PASS  a slower second lane is WAITED FOR, not foreclosed on — ready/ready @406ms  ready/ready @404ms  ready/ready @405ms
  PASS  the gate really did hold the boot for it — costMs 406, 404, 405

=== over-budget: the second lane is 3200ms behind (past the budget) ===
  PASS  the first lane still gets its asset — ready
  PASS  the second lane is timed out rather than waited for forever — timeout
  PASS  the gate closed at its budget, not before and not much after — costMs 2502 vs budget 2500
  PASS  the timeout message states the time actually waited — still loading after 2502ms of the 2500ms boot budget
```

**And the test binds.** Restoring the reviewed `awaitPreloads()` verbatim and
re-running it produces **5 failures**, including the `slow-second` condition
turning the intermittent defect into a deterministic one:

```
  FAIL  both lanes resident in every trial — 4/10; second-lane states: timeout, ready
  FAIL  a slower second lane is WAITED FOR, not foreclosed on — ready/timeout @4ms  ready/timeout @4ms  ready/timeout @3ms
  FAIL  the gate really did hold the boot for it — costMs 4, 4, 3
  FAIL  the gate closed at its budget, not before and not much after — costMs 3 vs budget 2500
  FAIL  the timeout message states the time actually waited — still loading after the 2500ms boot budget
```

4/10 both-ready against the reviewer's 3/10 — the same defect at the same rate.
Restored, all nine checks pass again. Four static guards now hold the *shape*
of the fix in pathcheck (shared promise, single deadline, honest message,
refusal path) so it cannot be unpicked without the browser tool running; each
was broken and restored (see the table below, rows 8–11).

### The refusal path had no behavioural cover — the fourth false green, and the first one found by someone else

Review patched a scratch copy so that a registration arriving after the gate
closed fell through to the normal load path — reintroducing exactly the
mid-run upload this module exists to prevent — and **pathcheck plus all five
conditions of `preload-concurrency-check.mjs` stayed green**. The only guard
was a source-literal `state: 'refused'` match, i.e. an assertion about how the
code looks; no test ever registered late.

Fixed with a sixth condition and a fixture that registers only after
`awaitPreloads()` has resolved (`fixtures/preload-concurrency/lane-late.js`,
requesting a real file nothing else uses, so a broken refusal would visibly
load something). It asserts the state is `refused`, that no texture comes
back, that the warning names the file, and that the two on-time lanes are
unaffected.

**Proved binding**, by deleting the refusal block outright:

```
  FAIL  the late page finished at all — a post-close registration must not
        return a promise that never settles — 3 of 3 trials hung waiting for the fixture
  FAIL  a registration after the gate closed is REFUSED — (no trial completed)
  FAIL  and no texture is handed back for it — nothing was loaded mid-run — (no trial completed)
  FAIL  the refusal names the file and says what to do instead — (no trial completed)
  FAIL  the two on-time lanes are unaffected by the late one — (no trial completed)
```

The first line is a finding in itself: with the refusal removed, a post-close
`preloadTexture()` returns a promise **nothing will ever settle** (`settle()`
has already run and will not run again), so the caller's `await` hangs
forever. The first version of this condition surfaced that as an uncaught
exception that killed the tool; it now catches the timeout and reports it as a
named failure, because a gate that dies is a gate nobody can read.

**Tally: four false greens in this lane's own guards.** The raw-text
`initTexture` match (matched its own prose), the `warmMs <= costMs` ordering
check (true either side of the close), eight source-literal shape guards
(assert appearance, not behaviour), and now the refusal path (no behavioural
cover at all). Three were caught by breaking things on purpose here; the
fourth by a reviewer doing the same. The rule that keeps holding: **an
assertion is worth exactly what its falsification test is worth, and until
someone breaks the guarded thing, that is zero.**

### The boot-gate assertions bind — eleven breaks, and one of them was mine

Same discipline as §5: every guard broken on purpose, restored immediately.

| what was broken | what pathcheck printed |
| --- | --- |
| a second `TextureLoader` in another render module | `FAIL … TextureLoader is constructed in src/render/preload.js and nowhere else … (found: render/fx.js, render/preload.js). Route it through preloadTexture() instead.` |
| the module-scope `await` removed | `FAIL … sprites.js awaits the preload gate AT MODULE SCOPE — that top-level await is what holds src/main.js` |
| `renderer.initTexture()` deleted (residency drops to "fetched") | `FAIL … the gate uploads each texture during boot` |
| budget raised to 60000 ms | `FAIL … declares a finite budget (60000ms) inside the T-032 bootstrap's 10s boot watchdog` + the drift check |
| budget changed to 1200 ms in the file only | `FAIL … the budget this harness reasons about (2500ms) is the one src/render/preload.js actually ships (1200ms)` |
| a late arrival applied instead of disposed | `FAIL … a texture that arrives after the gate closed is disposed, never applied` |
| the mid-run "swap the body" path restored | `FAIL … no "the texture turned up late, swap the body" path survives` |
| the reviewed per-call snapshot gate restored | `FAIL … awaitPreloads() hands every caller the SAME in-flight settlement promise` + `FAIL … ONE deadline started at the first registration` + `FAIL … a timeout reports the time ACTUALLY waited` (3 failures) |
| the post-close refusal path removed | `FAIL … an asset registered after the gate closed is refused by name` |

**The third row failed to fail on the first attempt, and that is the useful
part of this table.** The `initTexture` assertion tested the *raw* file for
`renderer.initTexture(`, and this module's own header comment contains that
string — so deleting the CALL left the gate green. It is exactly the failure
this repo has a standing rule about (an assertion whose subject is the author's
prose rather than the observable code), it was invisible until the guard was
broken on purpose, and it is the reason the rule exists. Fixed by stripping
comments before every check in the block; the break then printed the line
above. Assertion count 2116 → 2117 with the added budget-drift check.

### The measurement the request was based on does not isolate what it looks like

I could not honestly report "spread back at base level" using
`meta.deterministicDispatch.gameMsMax` on `mid-route.json`, because that number
is bimodal in **every** condition, including one with no runtime asset at all.
Eight interleaved rounds (one run of each condition per round, so background
load from the other lanes' browsers hits all three equally):

| condition | runs | gameMsMax | note |
| --- | --- | --- | --- |
| merge-base | 8 | 6328.8–6353.7 | all `stop=victory`, `dispatched=18/26` |
| `?sprites=0` | 8 | 6315.3–6344.2 **plus one 9936.8** | the outlier stopped on `script-window`, never reached victory, `crush=32.490` |
| shipped default | 8 | two modes: 4 runs 6331.6–6346.0, 4 runs 5765.2–5785.4 | the low mode is `dispatched=16/26`, i.e. victory reached two input events sooner |

Two things follow. First, **the no-asset control produced the largest excursion
in the set** — a 3.6 s swing and a 2.9-tile-worse crush margin with no texture
loading anywhere in the build — so an excursion of this kind is not evidence
about a load path on its own. Second, the shipped default's two modes differ by
`dispatched` count, not by frame quality: the harness dispatches deterministic
input on whichever ~13 Hz sample crosses each event's `gameMs`, so a boot that
lands a few ms differently can shift an input by a whole sample, change a jump,
and end the run at a different victory moment. `closestCrushApproachTiles` —
the gameplay-relevant number — was 35.39–35.42 (base), 35.39–35.44 plus the
32.49 outlier (`sprites=0`), and 35.44–35.46 (shipped, tightest of the three,
no excursion in 8 runs).

**So I am not claiming the boot gate fixed a `gameMsMax` spread, and I am not
claiming this lane ever had T-040's defect.** What I can show is that the gate
is right on the merits, costs 14 ms, and that on the metrics that isolate cause
— boot time, worst frame, frames over 20 ms, sim time in a fixed window, and
the `?fixeddt` trace equality in §2 — the sprite build is indistinguishable
from the base tree or better. The pre-fix run in this section's first draft that finished
1036 ms short is, on this evidence, the same bimodality, and I am withdrawing it
as a demonstration that my lane reproduced the defect.

**This matters for T-040's verdict**, and the lead has it: before asking that
lane to rework on this number, check each run's `meta.stopReason` and
`meta.deterministicDispatch.dispatched`. A run that stopped on `script-window`
while its siblings stopped on `victory` is a different run, not a slower one.

---

## 7. MERGED WITH MAIN (2c638aa) — and re-measured, not inherited

Main moved from `0d98c70` (1853 assertions) to `2c638aa` (2469) while this
lane was in review: T-039 contact shadows, T-047's light rig, T-048's bloom +
surface families, T-042 audio, T-050's scale-pass gate. Two conflicts, both in
files this lane owns or created, both resolved here rather than handed to the
integrator conflicted:

- **`tools/pathcheck/manifest.mjs`** — the expected both-appended collision.
  Main's `d41`–`d48` kept as-is; this lane's domain re-numbered to `d49` and
  appended last. 50 domains, loads clean.
- **`src/render/hostiles.js`** — a real semantic merge, one hunk in
  `spawned()`. Main wrapped the body material in `applySurface(…, K.surface)`
  (T-048's per-kind roughness/metalness); this lane made that material
  conditional on whether a sprite texture is in hand. **Resolved so either
  body wears the kind's surface family**: a sprite quad is still a
  `MeshStandardMaterial` answering the same light rig, so a drone shell keeps
  responding like a shell whether its pixels come from a texture or a flat
  token. `applySurface()` only writes roughness/metalness/envMap, so the map,
  emissiveMap, alphaTest and single-pass transparency from `spriteMaterial()`
  all survive it. Everything else auto-merged: contact shadows
  (`syncContactShadow`/`releaseContactShadow`) are keyed on kind and body-
  agnostic, and `emissiveIntensity = postGain()` sits in the shared part of
  `sync()` above the sprite/primitive branch, so the sprite's hit flash and
  state glows get T-048's bloom headroom for free.

**Nothing was dropped, proved as a multiset rather than a count** (the method
`migrate-lane.mjs` documents, after two hand-merges silently dropped
assertions while printing green). Ordered label logs captured for base, main,
lane and merged with `tools/pathcheck-labels.mjs`:

```
base 1853   main 2469   lane 2121   merged 2747
expected (main + (lane - base)) = 2737
MISSING from merged: 0
EXTRA in merged:    10
```

All ten extras are the same two assertions applied to five files that did not
exist at this branch point — `src/pure/{contactShadow,post,seams,shade,
tonemap}.js`, each getting this lane's "a pure module may not name a texture
loader or a sprite module" pair. That is the guard correctly extending to new
pure modules, which is what it is for. **2747 passed, 0 failed.**

**Perf re-measured on the merged tree, twice — because the tree moved twice
and a measured number may not be carried across a change that could move it.**
The middle column below was taken against main `2c638aa`; main then took
T-040 and T-044 and the second merge landed, so it is **stale and kept only as
a record of that point**. The right-hand column is the current tree.

| reading | pre-merge (own base) | vs main 2c638aa — STALE | vs main 7c5ad31 — CURRENT |
| --- | --- | --- | --- |
| roster draw calls, 5 hostiles | 42 → 37 | 79 → 74 | **73 → 68** |
| stress draw calls, 256 projectiles | 144 → 133 | 181 → 166 | **201 → 183** |
| worst frame | 10.30 ms both | 10.40 / 10.30 ms | **10.30 ms both** |
| frames over 20 ms | 0 both | 0 both | **0 both** |
| triangles | ~50.7k | ~105.4k | ~107.4k |

(each pair is primitives → sprites). The conclusion is unchanged and now
measured on the tree that would actually merge: the sprite path costs **fewer**
draw calls than the primitives it replaces — 5 fewer on a five-hostile roster,
18 fewer under the barrage — and 60 fps holds with 256 live projectiles on the
heavier renderer. Evidence: `artifacts/sprites-v1/perf/result-merged2.json`
(current) and `result-merged.json` (the stale middle column). Main-pass figures
only: main has a shadow pass and T-047's report states `renderer.info` does not
account for it.

Re-run against the merged tree, all green:Re-run against the merged tree, all green: pathcheck 2747/0, assets check
PASS, gatecheck PASS, `sprite-fallback-check` 9/9, `preload-concurrency-check`
9/9, `mid-route.json --deterministic` completed / 0 deaths, and the true-size
capture re-shot (`artifacts/sprites-v1/lineup-true-size.png` is now the
merged renderer: same five bodies, now under the light rig and bloom).

---

## 8. I-039: THE GPU WARM-UP IS BUILT, MEASURED — AND IT DOES NOT FIX IT

Asked to add a warm-up render to the shared gate so a driver's deferred upload
finishes before frame 1, and to prove it with T-040's 16-round interleaved
design. Built, measured, and **the requested fix does not work on this lane.**
Reporting that rather than shipping it as though it did. Raw data:
`reports/tasks/T-049/i039-evidence/` (four CSVs, 132 runs, plus the scripts).

**First, a correction I owe.** My §6 said this metric was "bimodal in every
condition, including one with no runtime asset at all". That leaned on a
`?sprites=0` outlier, and `?sprites=0` is **not** a no-asset control — it is
this lane's code with loading switched off. The true control (a tree without
the sprite path) never deviated in my data either, 8/8. T-040's 16-round design
was better than mine and its correction stands.

### What was built

`warmResident()` in `src/render/preload.js`, run inside `settle()` **before**
the gate opens: every resident texture is drawn once into a 4x4 offscreen
target, then **one pixel is read back**. The readback is the point —
`readRenderTargetPixels` blocks until the GPU has executed the queued work, so
a driver cannot defer mipmap/upload work into frame 1. It restores the previous
render target (the visible canvas is never touched), swallows every error (a
warm-up that did not happen is slower, not broken), and costs a measured
**8 ms**. `?warm=0` is the A/B control. Four static guards, each broken and
restored: readback present, offscreen + restored, ordered before `closed`, flag
wired.

### The 16-round interleaved measurement (4 conditions, 64 runs)

Control is **current main** (`2c638aa`) — no sprite path at all. One run of
each condition per round, so session load hits all four equally.

| condition | deviating rounds | `dispatched` values | `gameMsMax` |
| --- | --- | --- | --- |
| main (control) | **1 / 16** | 18, 19 | 6328–6884 |
| `?sprites=0` (escape hatch) | **1 / 16** | 18, 26 | 6317–9952 |
| sprites, `?warm=0` | **11 / 16** | 15, 16, 18, 19, 23 | 5298–8274 |
| sprites, warm-up ON (shipped) | **14 / 16** | 15, 16, 17, 18, 19, 26 | 5353–9940 |

**The warm-up did not reduce the deviation** (11/16 → 14/16; at n=16 that
difference is not meaningful, but it is certainly not the drop to control level
that was asked for).

### So I isolated the cause instead — and it is the load, not the draw

Temporary measurement patch (applied, measured, reverted; `git status` clean):
the gate loads **and warms** all five textures, and `hostiles.js` never uses
them. 12 rounds, interleaved:

| condition | deviating |
| --- | --- |
| main | **0 / 12** |
| gate loads + warms 5 textures, **never drawn** | **12 / 12** |
| `?sprites=0` (nothing loaded) | **1 / 12** |

Loading alone reproduces it in full. Drawing adds nothing. That kills my own
"sprites make frames cheaper" hypothesis and corroborates T-040's direction.

### And it is not boot latency either

A scratch control: **main's code plus 25 ms of artificial boot delay and
nothing else** — no assets, no gate, no textures. 12 rounds:

| condition | deviating | crush range |
| --- | --- | --- |
| main, untouched | 2 / 12 | 35.37–35.42 |
| main + 25 ms boot delay, no assets | **2 / 12** | 35.39–35.43 |
| gate loads + warms 5 textures, never drawn | **10 / 12** | **30.85**–35.43 |

Pure latency of the same magnitude the gate costs changes nothing. **Something
about performing five texture loads — fetch, decode, upload — perturbs the
early run even when the work provably completed before frame 1 and the result
is never drawn.** Candidates I have not separated: image-decoder threads
winding down, GC from decode allocations, or driver-side work a 4x4 readback
does not drain. Separating fetch from decode from upload is one more
experiment (~30 runs) and I will run it on request.

`?fixeddt` is **not** a workaround: with the step pinned, all three conditions
scatter worse, control included (main 2/8 deviating, `gameMsMax` 4533–19683).

### Scope of the negative result — and the one question left open

Every asset in those 132 runs was a **32–64 px sprite of 0.6–2.9 kB**, i.e. a
trivial mipmap chain. The negative result is about that class and no other.
Whether the warm-up earns its 8–14 ms on a LARGE texture — RIG's 256x256, and
soon T-051's backdrop plates and T-052's hull tiles — is **untested at any
useful n**, not answered no. T-040 attempted exactly that measurement on
`rig-marine.png` and got 1/7 with the warm-up against 4/7 without: opposite in
direction to my numbers, noise at that size, and cut short when their worktree
was pruned mid-run (§ the proposed inbox issue below). Both of us agreed not to
let it settle into "measured, doesn't help".

It is roughly 40 minutes to answer properly: `?warm=0` is the A/B, 16
interleaved rounds is the design, and the run must go against a **scratch copy**
(`git archive <rev> | tar -x -C <dir>`) rather than a live worktree — which is
what interfered with the last attempt. The same caveat is now written into
`src/render/preload.js` beside the disclaimer, because that comment is where a
future lane will read the conclusion and it should not over-claim its own
scope.

### What I recommend, and what I am not claiming

- **I am not claiming the warm-up fixes I-039.** It is kept because the hazard
  it addresses is real and independently argued (a deferred upload landing in
  frame 1), it costs 8 ms, and `?warm=0` makes it falsifiable. If the lead
  would rather not ship an 8 ms mechanism with no demonstrated benefit, say so
  and I will remove it — I would rather delete it than let it imply a fix.
- **The next move is a methodology decision, not more code in `preload.js`.**
  On this evidence no amount of "finish the load earlier" helps, because the
  load already finishes before frame 1. Comparing an asset-loading build
  against a non-loading one through `run.mjs`'s sampled dispatch does not
  isolate a game defect.
- **What did stay clean under a frame-accurate harness:** the in-page dispatch
  used by `sprite-fallback-check.mjs` produced sim traces **identical
  sample-for-sample** between art-loaded and art-blocked runs. That is the
  measurement I would build the gate on.

---

## 9b. SECOND MERGE (main 7c5ad31): two lanes had built the same file

T-040 merged first, and it brought **its own independent `src/render/preload.js`**
into main — a 171-line implementation, not the gate this lane built. So the
merge was an add/add conflict between two versions of a shared boot gate,
which `docs/ORCHESTRATION.md`'s merge playbook names as "how a cycle dies" and
had already planned for, assuming T-049 merged first. The order came out
reversed, so I re-ran the playbook's own three checks rather than assume its
conclusion still held:

| check | result |
| --- | --- |
| same API surface? | main's exports `PRELOAD_BUDGET_MS`, `preloadTexture`, `awaitPreloads`, `preloadSnapshot`; mine exports those four **plus** `WARM_ON` — a strict superset |
| what does the consumer use? | main's `player.js` imports exactly `{ awaitPreloads, preloadTexture }`, and its own comments say it is waiting on "T-049's concurrency fix" |
| do T-040's assertions pin the gate's internals? | no — every one is against `player.js` / `sim/player.js`, none against the gate |

So the documented answer holds with the order reversed: **T-049's gate
satisfies T-040 wholesale**, and the conflict resolves by taking this lane's
version. No hand-composition. `tools/pathcheck/manifest.mjs` composed both
lanes' domains (52 total, this lane's renumbered `d51`).

**The integration works, and this is the first time both lanes' assets have
gone through one gate together:**

```
gate cost 33ms, warm 11ms, 6 assets registered:
   ready   21ms  hound-brace-b.png     ready   21ms  polyp-iris-b.png
   ready   21ms  carrier-hauler-b.png  ready   21ms  mortar-tripod-b.png
   ready   21ms  wasp-drone-b.png      ready   21ms  rig-marine.png
warnings: none
```

RIG's 256x256 registers beside the five hostile sprites, from a different
module, and both lanes get their art. That is precisely the case §9.2's grace
turns exist for — before them, whichever module awaited first would have
starved the other.

**One smoke run came back `not-completed`, and it is the known bimodality, not
a regression.** That run stopped on `script-window` with `dispatched=26/26`,
`gameMsMax` 9865, crush 30.47 — the same excursion mode documented in §8, seen
there in `?sprites=0` and in main's own control. Six interleaved rounds
against current main settled it:

| | rounds reaching victory | crush range |
| --- | --- | --- |
| main (7c5ad31) | **6 / 6** | 35.21–35.38 |
| this branch, merged | **6 / 6** | 35.26–35.43 |

Gates on the merged tree: pathcheck **2829 / 0** (including T-040's own domain
running against this gate), assets check PASS, gatecheck PASS,
`preload-concurrency` 14/14, `sprite-fallback` 9/9.

---

## 9. FIX CYCLE (task #146): a second multi-caller race, and brittle guards

Three things came out of the fix cycle. Two were real defects; one was an
artifact worth naming so nobody chases it again.

### 9.1 The "1 failing assertion" was two processes sharing a worktree

My first pathcheck of the cycle reported `FAIL T-049/I-039: the warm-up reads
a pixel back`; the next five runs on the identical committed tree reported
**2748–2751 passed, 0 failed**. A static regex over an unchanged file cannot
fail intermittently, so I hashed the file before each of six consecutive runs:
the hash changed between run 1 (`a24dde225fe4`) and run 2 (`025e8f555610`)
with no edit of mine, and `git diff HEAD` showed one changed line that was
gone thirty seconds later. Another agent was running break/restore against
`src/render/preload.js` **in this worktree** while I ran the gate. Flagged to
`fix-T-049`; not a defect in the tree.

### 9.2 A SECOND multi-caller race — real, and the keystone one

The concurrency fix in §6 handles a sibling registering *while the gate is
open*. It did **not** handle a caller that awaits the gate *before anyone has
registered*: `settle()` saw an empty registry, broke immediately, set
`closed`, and every later registration was refused by name.

That is precisely the keystone shape — T-040, T-051 and T-052 all import this
gate, and **module evaluation order is decided by the import graph, not by who
owns an asset**. Measured with a third fixture
(`fixtures/preload-concurrency/lane-awaits-first.js`, imported first):

| | before | after |
| --- | --- | --- |
| lane-first / lane-second | **refused / refused**, 3 of 3 | **ready / ready**, 3 of 3 |
| gate cost | 0 ms (closed instantly) | 12–19 ms |

Fix: the registry must be **quiet for two macrotask turns** before it counts
as complete (`GRACE_TURNS`), bounded by the same single deadline. Two turns is
sub-millisecond. Now a permanent condition in
`preload-concurrency-check.mjs`; removing the grace turns puts it straight
back to `refused/refused` 3 of 3.

### 9.3 The guards were asserting appearance, not behaviour

Several boot-gate assertions matched exact source text — `if (!gate) gate =
settle();`, and worst a whitespace-sensitive 200-character window around
`warmResident(...)` followed by `closed = true;`. Those fail on a reformat
that changes nothing and pass on a rewrite that breaks the contract, and three
lanes are about to edit around this file. They are replaced by behavioural
checks in the browser tool; what stays static is only what a text scan is the
right tool for (which file may construct a loader, whether a declared constant
matches the one the harness reasons about).

**One of the replacements was itself a false green, caught by breaking it.**
The ordering check first compared `warmMs <= costMs` — which is true whichever
side of `closed = true` the warm-up runs on, and it duly passed with the two
lines swapped. The module now records `warmedWhileClosed` and the tool asserts
that; the same break then prints
`FAIL … warmedWhileClosed=false`. That is the third false green this lane has
found in its own gates by breaking them on purpose (§6, §9.3, and the raw-text
`initTexture` match). The pattern is consistent: **an assertion written from
the author's mental model passes for the wrong reason until someone breaks the
thing it guards.**

Assertion count 2751 → 2748: eight source-literal guards removed, five
behavioural checks added to the browser tool, three formatting-independent
static ones kept.

---

## 10. HONESTY LIMITS

- **Every capture is one moment of one run.** The three modes are three page
  loads; bodies drift between them. Nothing here is a pixel diff.
- **The lineup is injected.** These five never stand in a row in play, and a
  mortar planted with its zone out of range is not a mortar doing its job. The
  frames prove size, silhouette and value at the real camera — not composition,
  not difficulty.
- **The contrast table in §1 is a heuristic.** "Background" is the modal colour
  of a 40 px box around the body, "body" is everything else in that box; that
  counts a sliver of deck edge as body when a hostile straddles one, and it
  says nothing about hue separation or about motion. It was computed off the
  committed frames with `tools/assets/lib/png.mjs`; the script is scratch, the
  method is the two sentences above, and the frames are in the tree so it can be
  redone.
- **Frame numbers are this machine, headless Chrome, 1280x800, one session.**
  Only compare readings from the same run of `sprite-stress.mjs`.
- **No claim is made about how any of this looks.** Not better, not worse, not
  "reads well". The operator is the only oracle for that.
- **Untested failure mode:** a file that arrives *corrupt* takes the loader's
  error callback like a 404 does, but was not exercised. Aborted requests and
  physically deleted files were.

---

## PROPOSED INBOX ISSUES

```
## I-??? | art | S2 | repro: node tools/playtest/sprite-capture.mjs (frames in artifacts/sprites-v1/) | evidence: artifacts/sprites-v1/lineup-true-size.png + §1 table of reports/tasks/T-049/build.md
The T-046 sprite bodies are darker than the flat palette bodies they replace —
mean luminance 39-65 against a 44 background, where the primitives sit at
94-112 — so the count of pixels that separate from the background by a full
value step falls for four of five roles (carrier 217 vs 560, hound 629 vs 1136,
polyp 344 vs 489, mortar 341 vs 405; the drone is level at 151 vs 143). The
sprites carry shape; the primitives carried pop. Pillar 5 makes this a
readability question, not a taste one. Fix direction belongs to the asset lane,
not the wiring lane: lift the body values a step, or give the hostile roster one
authored ink rim / rim-light the way the capsule glyphs got an ink edge, and
re-measure with the same script. Do NOT solve it by brightening the whole frame
(entry 14: the operator judged the full value ladder too dark, and this is the
opposite lever).
```

```
## I-??? | bug | S2 | repro: two agents active in one worktree; or `git worktree remove` while a background measurement runs | evidence: reports/tasks/T-049/build.md §9.1, and T-040's independent sighting from the other side
```
A LANE'S WORKTREE IS NOT SAFE TO MEASURE IN WHILE ANOTHER AGENT HOLDS IT, AND
NOT SAFE TO PRUNE WHILE ONE IS RUNNING. Hit twice this cycle, from both ends,
and it cost a 16-round experiment.

(a) Two agents editing one worktree. While I ran the gate, another agent was
running break/restore against src/render/preload.js in the same directory. My
pathcheck reported one FAIL that five later runs on the identical committed
tree could not reproduce; hashing the file before each of six consecutive runs
caught the file changing under me (a24dde225fe4 -> 025e8f555610, no edit of
mine). T-040 hit the same thing from the other side: their worktree's
preload.js "silently reverted to the pre-fix version with no edit of mine".

(b) Pruning a worktree with a background run in it. T-040's worktree was
merged and pruned mid-experiment; their background process started failing
with "no such file or directory" and the 16-round run died at n=7, which is
too small to weigh. The work was not recoverable — the directory was gone.

Neither is exotic: this fleet runs several agents at once, gate agents
routinely read another lane's tree, and the merge step legitimately prunes.
Fix direction, cheapest first: (1) a lane announces "I am measuring, do not
touch <path>" and gate agents copy the tree instead of reading it in place —
`git archive <rev> | tar -x -C <scratch>` is what I used for control trees all
cycle and it is interference-immune by construction; (2) the merge script
refuses to prune a worktree whose directory has been written to in the last N
minutes, or at least prints what it is about to delete; (3) any measurement
longer than a couple of minutes runs against a scratch copy on principle, not
against the live lane. The diagnostic that catches (a) in one line is worth
keeping: hash the file before each run and compare.
```

## I-??? | bug | S3 | repro: tools/playtest/sprite-fallback-check.mjs, 11 runs | evidence: reports/tasks/T-049/build.md §2 "One flake"
One run in eleven of the new fallback check reported 4 failed checks whose
detail was not captured; the ten others passed, including every run since. Two
suspected causes have been addressed (an extra trailing sample from the
Node-side run-ending poll; a death mid-stretch, which now fails loudly as its
own check), but neither is proven to be the one that fired. Anyone running this
as a gate should run it twice before believing a red, and should paste the full
output rather than a tail — that is how the detail was lost.
```

---

## QUESTIONS FOR THE OPERATOR

Serve this worktree (integrator: `node tools/serve.mjs 8749 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-049`). Every URL
below is `http://127.0.0.1:8749/…`.

1. **Sprites at all, at this size?** `/index.html?slice=traversal&hound=3`
   against `/index.html?slice=traversal&hound=3&sprites=0`. The sprites carry
   legs, plates and a dark underside; the primitives are brighter flat slabs and
   measurably separate from the background more (§1). Which one do you want to
   fight?
2. **Which candidate?** `/index.html?slice=traversal&hound=3` (variant b, the
   shipped default) against `…&spritevar=a`. `b` is the plated read with the
   value break, `a` is the bold single mass. Per role if you want to split it:
   `…&spritevar=hound:b,carrier:a,wasp:a,polyp:b,mortar:b`.
3. **The drone specifically.** `/index.html?slice=traversal&hound=2` — it is
   17 px, it is the one that kills you from off-screen, and its sprite is the
   darkest thing in the roster (mean luminance 39 against a 44 background). Does
   it still read as it dives, or should the drone alone keep the diamond?
4. **The tripod's stance.** `/index.html?slice=traversal&mortar=1`. Its sprite
   is 1.5x wider than the cone it replaces so the legs read as a stance. Its hit
   circle did not move, so the outer legs are decoration you cannot shoot. Is
   that the right trade for a static emplacement?
5. **Is this the direction to spend the next asset batch on** — more hostile
   variants, or the backdrops T-046 flagged (`backdrop-colony-cluster`) as the
   stronger scale lever?

---

## THE SINGLE BEST NEXT ACTION

Get answers to questions 1 and 2 in front of the asset lane before generating
anything else: the §1 contrast table says the current batch trades pop for
shape, and if the operator wants both, the next batch needs a value/rim
instruction in `tools/assets/codex/spec-template.md` — which is a one-line
change to make *before* another nineteen assets exist, not after.
