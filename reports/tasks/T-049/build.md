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
honesty note in §6 — each body's box against the background it stands on, at
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
| `node tools/pathcheck.mjs` | **2110 passed, 0 failed** (base of this branch: 1853 — +257 from the new domain) |
| `node tools/assets/check.mjs` | **PASS**; `src/render/sprite-table.js:35: runtime asset reference` listed, no static import |
| `node tools/gatecheck.mjs` | **PASS** — 5 controls red where they must be |
| `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic` | `outcome: completed`, deaths 0 |
| `… run.mjs scripts/transform-slice.json --deterministic` | `outcome: completed`, deaths 0 |
| `… run.mjs scripts/polyp-lane-dodge.json --deterministic` | `outcome: completed`, deaths 0, 13 policy tap fires |
| `… node sprite-fallback-check.mjs` | all checks passed (see §2; 10 of 11 runs) |
| `… node sprite-stress.mjs` | see §3 |
| `… node sprite-capture.mjs` | 5 bodies per mode, all five `ready` on the default URL |

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

## 6. HONESTY LIMITS

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
