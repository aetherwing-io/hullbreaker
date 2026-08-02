# HULLBREAKER — VISUAL DIRECTION PACKET

**For:** the operator. **Prompted by:** "let's start considering the look, too. I've seen a lot of greybox."
**Date:** 2026-08-01. **Repository state:** read-only audit against a green tree (`node tools/pathcheck.mjs` →
`1674 passed, 0 failed`). Four other lanes (T-024…T-032) were editing worktrees while this was written; nothing
here touched the repo.

**This document contains no opinion about what looks good.** Every direction below is presented with its cost,
its falsifying test, and its risk. You are the only oracle for look. What this document *does* decide is the
boundary between what a lane may build tomorrow and what needs your signature first — that boundary is the
whole point of the packet.

**Read this first — the one-line finding.** The thing that reads as grey-box is not the hue. It is the **value
range**. The concept palette (T-010, shipped default) changed hues over byte-identical geometry, identical
light intensities, identical materials and near-identical draw counts (101 vs 100 calls, 50,276 vs 50,264
triangles — `evidence/04-default-run-20s.png` vs `evidence/19-default-run-palette-classic.png`). It was a
recolor of the grey-box, not a replacement of it. Another hue pass will land the same way.

---

## 1. What grey-box actually means here

Thirty-one fresh PNGs were captured from the shipped build through real headless Chrome at 1280×800 and
1920×1080 (temporary server, killed afterwards; `git status --porcelain` empty). Files are under
`/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/look/evidence/`.
Every number below is measured from those files or read out of the code.

**There are no highlights and almost no darks.** 0.0% of playfield pixels exceed luminance 200 in *all fifteen*
gameplay captures. 99% of pixels sit inside a 45–70 step window out of 255 (`04-default-run-20s.png` p5=47,
p95=83). The boards put 24–29% of every frame in the darkest tenth; the shipped frame puts 0.2–1.1%
(`artifacts/t009-lattice/merged/01-pocket-face1.png` band0 = 0.2%).

**One flat hex is a third of the screen.** `#2f565e` — `PAL.limbBg`, the haze token
(`src/render/palette.js:179`) — covers 29.3% of `01-pocket-face1.png` and 34.2% of `05-corner2-approach.png`.
It is drawn as an unlit fill. Six tones cover ~85% of the six-face frame. In `?slice=traversal` a *single*
color covers 87–91.5% of the playfield and the median luminance literally equals the 5th percentile
(`evidence/09b-hostiles-close.png`: p5 = p50 = 44).

**Nothing reads as lit.** The sky is *brighter* than the ground: backdrop `rgb(40,80,88)` L=73, deck
`rgb(96,56,24)` L=63, back wall L=43. The entire light rig is two lights and no shadows —
`HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.1)` at the default `(0,1,0)` plus
`DirectionalLight(PAL.sun, 1.6)` at `(6,12,8)` (`src/render/scene.js:24-28`). `grep -rn
'castShadow|receiveShadow|shadowMap' src/` returns nothing. Undersides are lifted by hemisphere fill and
nothing occludes anything.

**Fog cannot stage depth, because fog *is* the background.** `scene.background = new THREE.Color(PAL.bg)` and
`new THREE.Fog(PAL.bg, ...)` come from the same token (`src/render/scene.js:17-18`), and the six-face run
overwrites both to `PAL.limbBg` (`src/render/limb.js:85-86`). Measured live at the FAR default the band is
near 44.25 / far 72.25 with the camera 42.75 from the play plane — **the play plane sits at the very start of
the ramp**, so nothing between RIG's surface and the backdrop grades at all. Distance collapses planes instead
of staging them.

**The world is one primitive.** Live geometry census on the default URL: 87 BoxGeometry, 4 Octahedron, 3
Sphere. Deck = one InstancedMesh of 1,616 boxes. Limb = 829 unit boxes in 8 instanced draws. RIG = five boxes.
Only two material classes exist in the whole game: `MeshStandardMaterial` and `MeshBasicMaterial`, and every
Standard is constructed with only `{color, flatShading:true}` — `roughness`, `metalness` and every map slot are
never set anywhere in `src/`.

**The limb's entire weathering system is seven ±4% RGB multipliers** (`CONFIG.limb.tone`, applied at
`src/render/limb.js:106-110`) plus a 3-way hash stagger. At FAR that is imperceptible.

**The loudest placeholder signal is a checkerboard.** `tiles.setColorAt(idx, (i+j)%2===0 ? cA : cB); //
checker = scroll-speed readability` (`src/render/level.js:122`). It is authored as a legibility device and it
is doing that job — but it is also the exact pattern every engine uses to mean "no texture yet."

**Actors are labelled primitives.** RIG measures 15×30 px = 3.75% of screen height (spec-compliant per
`docs/concept-art/README.md:281-283`) but is 230 lit pixels of head sphere + torso box + two leg boxes, with no
helmet, pack or silhouette break (`evidence/z01-rig-far-default-5x.png`). He shares his value family with his
own tracers — the four largest bright-neutral blobs in `05-traversal-slice-4s.png` are RIG and three of his own
bullets. A weapon capsule is a lavender box with the letter S/H/L printed on it
(`evidence/z04-capsule-letters-4x.png`). A wasp is a ~12 px green diamond.

**Placeholder markers still ship.** Browser tab reads `HULLBREAKER — grey-box` (`index.html:5`), the VICTORY
overlay body reads `grey-box complete` (`src/ui/overlay.js:104-105`), `src/main.js:2` says "grey-box pass," and
a 3–4 line dev control legend plus fixture banners are on screen in every gameplay frame.

**The most art-directed image in the product is the CSS start screen, not the 3D scene.**
`evidence/01-start-screen.png` runs p1=18 → p99=235 with 77.7% below L40 and 1.3% above L200 — layered
gradients, rivet stripes, inset shadows, lamp glows, a clip-path RIG silhouette (`index.html:79-122`). The 3D
scene uses none of those techniques.

**The two states most likely to have produced your impression:** `?slice=traversal`
(`evidence/05-traversal-slice-4s.png`, `16-ribrun.png`) — checkered orange slabs floating in flat teal void
with no background, no hull connection, no horizon. 202 distinct colors at 5-bit precision.

**Honesty limit on this evidence.** The capture bot (hold-right + periodic jump) reaches GAME_OVER at wave gate
1 within ~21–24 s, so nothing past the first wave gate, no later face and no high-altitude phase is in these
frames. The committed `artifacts/t009-lattice/merged/` set reaches 116 m only by topping RIG's HP up every poll,
which its README discloses. Also: ~120 of the 187 committed artifact files are **pre-palette** grey frames
(measured single-hue 210° blue-grey at 68–99.6%) — `artifacts/cp3-transform*/`, `g1-limbturn/`, `t011-juice/`,
`g2-neck-flip/`, and the four root frames of `t009-lattice/`. Do not use those as "the current look." The
current-representative sets are `artifacts/t009-lattice/merged/`, `artifacts/legibility-v1/`,
`artifacts/shell-v1/` titles, and the `*--concept.png` half of `artifacts/palette-v1/`.

---

## 2. The gap to the boards

Measured board-vs-build, same tooling on both sides. Boards read: `docs/concept-art/01-exterior-gameplay.png`,
`06-enemy-form-language.png`, `10-creature-lattice-chaos.png`, `11-creature-flip-breach-sequences.png`,
`13-human-scale-monster-climb-grammar.png`, `14-vertical-assault-level.png`.

| Property | Boards | Shipped |
|---|---|---|
| Darkest tenth of value range | 24.4–28.9% of frame | 0.2–1.1% |
| Pixels in the two mid bands | — | 82–91% (lum 51–102) |
| Largest single exact color | ≤ 0.31% of frame | 29.3–34.2% (`#2f565e`) |
| Distinct colors | 115,701–145,414 | 3,868–4,420 |
| Atmosphere hue luminance spread | 59.9–85.0 levels | p50 = p75 = p95 = 78.3 (a constant) |
| Material shadow-to-light ramp (rust) | 52.1–80.7 levels | 34.0–34.4, never below L55 |
| Edge energy (mean / strong-edge %) | 14.0–15.8 / 10.6–12.9% | 4.6–4.9 / 3.6% |
| Amber / warm accent coverage | 2.6–8.3% | 0.3–0.4% |
| Neutral / charcoal coverage | 5.6–8.6% | < 0.5% |
| Hue families carrying the frame | 6–8 at once | 2 (rust ~43% + teal ~55% ≈ 99%) |

**Aerial perspective runs backwards.** In board 13 panel 1 the far body reads *lighter and hazier* (`#125c67`,
L=78) than the near deck RIG runs on (`#202522`, L=36). The shipped renderer inverts this by explicit design —
`src/render/palette.js:32` states "the deck stays the brightest large surface in every mode," and measured
shipped rust p05 never drops below 55.6.

**The sky is a gradient before any geometry is drawn.** Board 14 samples `#03111d` (L=15) top, `#144260` (L=59)
mid-left, `#0e2a3b` (L=38) lower right — a 44-level vertical ramp. `scene.js:17` sets one flat `THREE.Color`.

**Form vocabulary the boards use and the build has none of:** curved vertebral drums, interlocking rib arches,
overlapping carapace scutes with a serrated bottom line, gill louvers, tendon belts, deep joint cups,
three-lobed gimbal rosettes at every pivot — every one covered in fasteners, louvers and running rows of
warm-white seam pips. `docs/concept-art/PROMPTS.md:261` names "one warm-white segmented edge light" as a
*required* continuity landmark. Zero architecture meshes in the build carry emission
(`grep 'emissive' src/render/` hits only `hostiles.js:365,405`).

**Scale cues the boards use and the build has none of:** a tiny lit settlement at frame bottom (boards 09, 10,
13, 14), a second limb receding into fog (09, 10, 13), a magenta Crown glow along the spine (09, 10, 13, 14), a
hanging tethered figure (09, 10). The only depth cue shipped is one flat haze plane.

**The invariant that is not met.** `docs/concept-art/README.md:287-288` requires "a creature-ship macro
silhouette visible often enough that local machinery never collapses into a warehouse." In the captures, only
the G2 ribline frame (`evidence/11-g2-neck-flip.png`) reads as a body; every other gameplay frame reads as a
wall plus a deck, and the limb bake's silhouette pieces appear as unexplained dark rectangles floating in the
upper frame — a defect `artifacts/t009-lattice/README.md` already acknowledges.

**Two things the boards themselves do not agree on — flagged for you, not for a lane:**

1. **Teal vs indigo.** Boards 01/10/13 are teal-dominant (57.0 / 70.0 / 68.9%). Board 14 — the *newest*
   environment board, the one `CLAUDE.md` names as leading environment form — is **64.5% indigo** with teal at
   7.2%, and its own refinement prompt in `PROMPTS.md` names a "deep indigo, cyan, amber/rust, coral,
   warm-white palette." `README.md:293` says "deep teal atmosphere." Shipped `CONCEPT.bg` is teal `0x143238`
   (`src/render/palette.js:124`). **This is a documented-invariant change and needs your decision** (§4.6).
2. **The boards were drawn for a closer camera than the game ships.** `PROMPTS.md:16,152` asks for RIG at ~7%
   of frame height and board 13's prompt asks 8–10%; the shipped FAR default is 3.7%. Board surface detail was
   authored to be read at roughly **twice** the shipped angular size. Whether board-level detail density
   resolves at FAR is an open evidence question, and it is the reason several directions below carry a
   projected-pixel gate rather than a taste argument.

---

## 3. Ship now, no decision needed

Eleven work items, all legal under existing rules, all adversarially reviewed for legality against
`docs/decisions.md`, `CLAUDE.md`, the ten `.claude/skills` guardrails and `tools/pathcheck.mjs`. Ranked by
visual-gain-per-cost.

**Three standing conditions apply to every item here**, and none of them is a decision entry:
- Anything that changes shipped pixels needs a checkpoint packet (exact URL + 3–5 questions) before it becomes
  the judged default. Several of these should ship behind an off-by-default flag so you get a clean A/B from
  one build.
- **Palette v1 is still queued and unjudged** (`SPRINT.md` Operator checkpoint queue). Every item that
  re-ranks the value ladder makes the `artifacts/palette-v1/` pairs stale — those must be **re-captured, never
  inherited**.
- **T-030 is at `review` right now** and holds `src/render/palette.js`, `hostiles.js` and `legibility.js`
  (I-003, I-010, I-032). Items 4, 5, 8 and 10 sequence *behind* it.

---

### ⭐ S1 — Bake a value ladder into the existing instance colors — **SEQUENCE THIS FIRST**
**Cost:** medium. **Draw-call delta:** zero. **Perf delta:** zero (bake-time only).

**What changes.** New THREE-free `src/pure/shade.js` computing, per baked piece, an occlusion score (occupancy
neighbours over `limbBakePlan`), a top-face rake score, and a seeded wear scalar (`mulberry32` from
`src/pure/rng.js`, keyed on integer `(s,y)` so `--deterministic` captures reproduce). Fold into one multiplier
applied at `src/render/limb.js:106-110` next to `limbFacetTone`, and at `src/render/level.js:105-124` add a
per-depth-row ramp (row d=1 lit, d=4 down to ~0.35×) plus the per-column wear term. Ramp constants live in a
`shade` sub-table in **both** palette tables. Colors stay `new THREE.Color(PAL.x).multiplyScalar(k)` — never a
literal; both files are in pathcheck's tokenized list (`tools/pathcheck.mjs:5981-5983`).

**Files:** `src/pure/shade.js`, `src/render/limb.js`, `src/render/level.js`, `src/render/palette.js`,
`src/config.js`, `tools/pathcheck.mjs`.

**Board / pillar:** boards 13 and 10 (24–29% of frame in the darkest tenth; 52–81 level material ramps).
Pillar 5 — value separation is the only surface information that survives at 3.7% RIG height. Pillar 1
secondarily: a per-row deck ramp gives the deck lip a second scroll-speed carrier so the checker is no longer
the only one.

**Falsifying test.** (a) ≥20% of baked limb instances land below 0.55× their base token's luminance **and** the
per-material normalized luminance spread ≥ 0.45 — today's ±4% tone table makes both arithmetically impossible,
so this **cannot pass on current main**. (b) The two checker token values still differ by ≥ today's
`|lum(cA)−lum(cB)|`, **and** the per-column top-row-vs-row-2 delta exceeds the checker delta. (c) The deck's
top row is the highest-luminance instance in its column and higher than every limb material's brightest
instance — the "deck stays the brightest large surface" rule asserted as arithmetic instead of prose. (d)
`src/pure/shade.js` contains no `Math.random`/`Date.now`/`performance.now`; two calls with the same seed return
identical arrays. (e) Draw calls and instance counts unchanged from the measured baseline (101 calls / 13
InstancedMesh / 2,969 instances).

**Corrections carried from adversarial review — a builder must not skip these.**
- The deck rows **already** alternate: `j = groundH[i] − d` so `(i+j)%2` flips per row (columns 20–25 measured
  ABAB/BABA/ABAB/…). The claim "every row is the same value" is false. What this adds is a monotone *ramp*,
  not a first alternation — rewrite the rationale or a reviewer will reject the packet on first read.
- `CLASSIC.shade` must be **exact identity**, not "near-identity," or `?palette=classic` stops being your
  byte-faithful grey-box instrument for the Palette v1 A/B.
- With CLASSIC at identity, the one palette toggle now moves hue *and* value together, so **this needs its own
  off-by-default flag** or you cannot judge the ladder independently.
- The cavity term needs the whole plan, not one piece — make it a plan-level pass (`limbShadePlan(plan, cfg)`),
  still time-free.
- Scope limit worth stating: `src/render/limb.js` gates on `IS_G1`, so the limb half changes **nothing** under
  `?slice=traversal` or `?slice=transform`.
- The capture-side check must be a **paired-population** measurement — median luminance of play-plane pixels
  minus median of backdrop pixels must *widen* — not "share below L40 rises," which is satisfied by uniformly
  darkening the frame, i.e. by the exact "dirty, not lit" failure this risks.

**Risk.** `src/render/palette.js:28-32` authored every CONCEPT value against "a lit face lands at roughly
0.45× its albedo"; pushing occluded faces to 0.30× produces genuinely dark mass and changes what the queued
Palette v1 verdict is judging. `level.js:122` states the checker's job is scroll-speed readability — dropping
its amplitude without a replacement carrier is a pillar-1/5 regression, which is what gate (b) exists to catch.

**Why this one first.** It is the direct answer to the largest measured gap (value collapse, §2 row 1), it
costs zero draw calls and zero frame time, and **everything else in this section is calibrated against it** —
backdrop tiers, sky ramp, seam pips and contact shadows all get tuned against whatever value range the world
ends up with. Do it first or every downstream item gets tuned twice. Pair it with S2 in the same task or
immediately after; S2 is four numbers and the two interact directly.

---

### S2 — Retune the haze ladder and the limb fog band together
**Cost:** small. **Draw-call delta:** zero.

**What changes.** Two things that currently cancel each other. (a) `CONFIG.limb.fog {near:24, far:52}`
(`src/config.js:450`), selected for the default run at `src/render/camera.js:71`, lands at 44.25/72.25 once
the FAR pull-back shift of +20.25 is folded in — while the camera sits 42.75 from the play plane. The play
plane is at the *start* of the ramp, so nothing between RIG's surface and the backdrop grades at all.
Re-author near/far so the ramp occupies the depth the limb's mass actually occupies. (b) Re-author the CONCEPT
backdrop ladder (`limbBg`, `limb.wall/shadow/skyline`, `transform.wall/skyline`) so measured luminance
separation between rust play surfaces and teal backdrop is ~30 steps instead of the measured 10–20. **CLASSIC
must not move** — `tools/pathcheck.mjs:5893` asserts byte-fidelity to `CONFIG.palette`. Update the calibration
prose at `src/render/palette.js:28-32` and `src/render/limb.js:36-42` **in the same change**; those comments
are the only written record of the 0.45× rule.

**Files:** `src/config.js`, `src/render/palette.js`, `src/render/limb.js`, `tools/pathcheck.mjs`.

**Board / pillar:** board 13 (far body L=78 hazier than near deck L=36). Pillar 5 — aerial perspective is the
cheapest legal device that tells the player which plane is playable.

**Falsifying test.** (i) A numeric ladder assertion replacing today's prose — signed luminance separation
between `PAL.ground` and `PAL.limbBg` in CONCEPT meets the stated minimum, while the CLASSIC byte-fidelity
assertion at `:5893` and the teal/rust family guards at `:5906-5917` all still pass. (ii) `CONFIG.limb.fog`
near/far re-asserted at their new values in the same commit as the updated reasoning — **there is no assertion
on those two numbers today** (only `CONFIG.fog` 30/74 at `:419`), so they can currently be moved silently.
(iii) Fog transmittance at the **worst-case distance to any point in the visible s-window crossed with
playBand** (from the probe-camera math at `src/render/camera.js:51-60`) stays under a stated cap — *not*
transmittance "at the play plane's depth," which would go green while a hostile at the screen edge sits inside
the ramp. That is exactly the failure the comment at `camera.js:64-73` was written about.

**Risk, stated plainly.** This is the cheapest direction here and, by the project's own evidence, **the most
likely to disappoint on its own**: T-010 already ran a hue pass over byte-identical geometry and you still say
grey-box. A value-only pass is the same experiment with different numbers. Ship it *with* S1, not instead of
it. It also edits the exact defaults the queued Palette v1 packet is about — offer it as the **second half of
that packet**, never as a silent substitution.

---

### S3 — A third material family: charcoal machined steel vs rust carapace
**Cost:** small. **Draw-call delta:** zero. **Perf delta:** zero.

**What changes.** A token-role split with no geometry change. (a) `src/render/palette.js` gains
`steelDark/steel/steelLit/steelEdge` in **both** tables — charcoal-neutral with a faint teal bias in CONCEPT;
CLASSIC keeps its existing greys. (b) `MATERIAL_FOR` at `src/render/limb.js:47-51` remaps machine-role kinds:
`kerb → steel`, `tendon → steelDark`, `cup`/`collar` → `steelLit`, while `hull`/`scute`/`scuteRib`/`ridge` stay
rust carapace. **`kerb` alone is 404 of the 829 baked pieces (48.7%, measured by running the shipped bake)** —
one remap recolors nearly half the on-screen body mass without touching a matrix. (c) `src/render/level.js:129`
authored solids move to steel; catwalk slats at `:145` stay rust because they are the route lip. (d)
`src/render/transform.js` gets the same split on its machine/panel keys — `palette.js:194` already comments
that panel means "covers are ship-built mechanisms: metal, may move," so the palette already wants this
distinction and has no color for it.

**Files:** `src/render/palette.js`, `src/render/limb.js`, `src/render/level.js`, `src/render/transform.js`,
`tools/pathcheck.mjs`.

**Board / pillar:** board 06 ("charcoal and rust-orange armor", `PROMPTS.md:129`) plus boards 10/13, which
thread charcoal machinery through rust anatomy. Boards run 5.6–8.6% neutral; shipped is < 0.5%. Pillar 5 — acid
green currently has to separate hostiles from a world that is one material in two hues; a third neutral family
gives the world internal contrast so the enemy role is not the only structural separator. It also gives
`decisions.md` entry 0b's form hierarchy (meso anatomy vs local colony-ship infrastructure) an actual visual
distinction rather than a documented one.

**Falsifying test.** (a) Both tables carry the identical `steel*` key set — the nested key-shape parity guard at
`tools/pathcheck.mjs:5881` fires automatically. (b) Among the tokens the limb bake **actually reads via
`MATERIAL_FOR`**, ≥3 distinct hue families present, neutral tokens at HSL saturation < 0.15 and rust > 0.30
(hex math, no browser — fails on current tables). (c) CLASSIC byte-unchanged (existing assertion). (d) A
headless capture at FAR shows the neutral hue family at ≥4% of playfield pixels against the < 0.5% measured
today — this requires adding a hue-histogram check to the playtest harness and is an honest added cost.

**Correction carried from review — the dead-token trap.** Repointing `kerb` off `machine` makes
`PAL.limb.machine` a token no mesh reads, while `tools/pathcheck.mjs:5914-5919` still certifies it as rust — a
green guard over dead code, which is the exact I-019/I-031 failure mode `SPRINT.md:684-686` names as this
cycle's lead theme. The hue guard must be rebuilt so its subject is "tokens a mesh actually reads," derived
from `MATERIAL_FOR` plus the call sites, not a hand-maintained array. Same for `PAL.solid`.

**Open question this raises for you, deliberately not decided in code.** `DESIGN.md` caps the budget at ≤8
color roles and `docs/concept-art/README.md:293-294` lists five, none of which is a neutral/charcoal family.
Whether "charcoal machinery" is a ninth role or an extension of the existing near-black INK role is a
documentation question. It is flagged in the checkpoint packet (§6 Q2), not resolved here. Also note the board
citation is an *inference*: `PROMPTS.md:129` gives charcoal-and-rust to the **enemy** board; extending it to
world machine-roles is a reading.

---

### S4 — Populate the empty fog band: graded backdrop anatomy tiers
**Cost:** medium. **Draw-call delta:** +1 to +2.

**What changes.** Step 1 (CONFIG-shaped, hours, no new geometry): replace `CONFIG.limb.silhouette` with
`CONFIG.limb.backdrop` and move the two existing plates from depth −34/−26 to −12 and −19, adding a third at
−24. That puts them at fog factors ≈ 0.375 / 0.625 / 0.80 — a three-step aerial-perspective ladder **inside**
the shipped band, instead of one piece clamped to invisible and one at 12.5% contrast. Step 2 (the form work):
new plan kinds emitted from `src/pure/limb.js`, consumed by the same instanced buckets in `src/render/limb.js`
— (a) a **second limb** reusing `facetPlan`'s own hull/scute/kerb primitives at 2.5–3× scale along a diagonal
(self-similarity is what makes two masses read as one creature rather than as scenery, and it costs no new
primitive); (b) vertebral drums as a 16-gon prism; (c) a far hull mass whose top edge steps rather than running
flat. Every backdrop piece stays **behind** the combat plane (`depth < 0`, so `limbOutwardReach ≤ 0`), which
satisfies `limbPlanViolations` trivially and means none of it can ever occlude RIG, a hostile or a bullet.
Baked once, never touched — the static-anatomy rule holds by construction.

**Files:** `src/config.js`, `src/pure/limb.js`, `src/render/limb.js`, `tools/pathcheck.mjs`.

**Board / pillar:** board 13 panels 1/4/6 (3–4 limbs receding into haze behind the played arm), reinforced by
boards 10 and 14. Pillar 5 — hostiles, tracers and capsules currently sit on one unmodulated field 52.9% of the
frame wide. Pillar 3 secondarily: `DESIGN.md:218-225`'s altitude-presentation list (background silhouettes
changing by altitude) has nowhere to live until the band is populated.

**Falsifying test.** For every entry in `CONFIG.limb.backdrop` compute
`f = (|depth| + CONFIG.camera.z − CONFIG.limb.fog.near) / (CONFIG.limb.fog.far − CONFIG.limb.fog.near)`; assert
`f ∈ [0.25, 0.85]`, consecutive tiers differ by ≥ 0.15, and `f` is identical across all three entries of
`CONFIG.viewScales`. **Today `CONFIG.limb.silhouette[0]` computes f = 1.16 and fails** — the gate is red on
current main, which is the point. Plus the existing `limbPlanViolations`-empty and
`far.length === CORNER_S.length * 2` assertions must stay green with the new kinds present.

**Honesty flag — this is the one direction in this section that did NOT receive an adversarial legality
ruling.** Its arithmetic was not independently re-derived the way S1/S3/S5/S6 were. Treat its fog-factor
numbers as proposed rather than verified, and require the builder to re-derive them against
`CONFIG.viewScales.far` before writing code.

**Risk.** `CONFIG.limb.joint`'s own note warns that "anything with mass above eye level shows the camera its
unlit underside," and a tier spanning the frame horizontally recreates the interior/warehouse macro read that
`decisions.md` entry 0b **rejected**. Tiers must stay thin in depth, sit above the wall cap, and never run edge
to edge. Second: more silhouette above the play band competes with tracked enemies at FAR — which is verbatim
the already-queued **G1 corner-reveal packet** question, so this folds into that packet rather than opening a
new one.

---

### S5 — Warm-white seam pips and route-lip lights: the frame's only highlights
**Cost:** small–medium. **Draw-call delta:** +1 to +2.

**What changes.** New `src/pure/seams.js` (deterministic, THREE-free) deriving pip runs from the data that
already defines routes — `groundH` deck-edge runs, the `platforms` array for catwalk ends, `limbBakePlan`
scute/kerb seam boundaries — each run **terminating exactly where its ledge terminates**. New
`src/render/seams.js`: one InstancedMesh of small boxes on the pip token plus one additive halo pool copying
the merged T-011 idiom verbatim from `src/render/fx.js:106-135` (`AdditiveBlending`, `depthWrite:false`,
`fog:false`, `renderOrder 2`, alpha faked by multiplying instance color so the pool stays one draw). Pip world
size scales through the existing `src/render/legibility.js` gain with a new SHARE entry. **Static intensity
only — no travel, no pulse, no chase.** This is the only proposal in the whole set that produces pixels above
luminance 200, measured at exactly 0.0% today.

**Files:** `src/pure/seams.js`, `src/render/seams.js`, `src/render/palette.js`, `src/render/legibility.js`,
`src/render/level.js`, `tools/pathcheck.mjs`.

**Board / pillar:** boards 10/11/13/14 all carry running rows of warm-white pips on every scute seam and route
lip; `PROMPTS.md:261` names "one warm-white segmented edge light" as a **required** continuity landmark. Pillar
5 via the sanctioned entry-7 route (scale the *cues*, never RIG and never the camera). It is also the first
implementation carrier for `decisions.md` entry 11's requirement that a dead end be legible as a risk *before*
commitment — a pip run that stops is a route that stops.

**Falsifying test.** (a) Pip runs are **derived, not authored**: for every catwalk platform and deck-edge run,
the pip run's end index equals the route's end index (pure test against `platforms` and `groundH`), so a pip
line can never advertise a ledge that does not exist. (b) Pip/lamp tokens sit **outside the amber WARN hue
band** in both tables, and below `PAL.muzzle` and every hostile tell in luminance — gate the **hue family**,
not just the value, or a pip at the exact `houndTell` hue passes. (c) The static-anatomy guard mirrored onto
**both** modules: `src/pure/seams.js` has no `gameMs/tMs/dt/Math.random`, **and** `src/render/seams.js` matches
the render-side guard the limb already carries at `tools/pathcheck.mjs:5366-5373` (`!/installView|view\./`),
which mechanically forbids the animated version arriving later by accident. (d) Exact draw-call delta against a
recorded baseline, not a ceiling. (e) `src/render/seams.js` **added to the tokenized array** at
`tools/pathcheck.mjs:5981-5983` — membership is opt-in, not automatic.

**Correction carried from review — drop the amber.** The original proposal wanted warm amber work lamps.
`src/render/palette.js`'s role table and `tools/pathcheck.mjs:5940-5947` make warm amber the roster's **one**
warning language ("a telegraph must never read as a body"), and `PROMPTS.md:129` gives amber tell lights to
*enemies*. The board canon this direction cites for its own landmark says warm-**white**: `PROMPTS.md` reads
"warm-white player fire and route-edge lights." Amber-for-architecture would give amber a second, benign
meaning in the same frames as the open I-003 and I-032 defects — **that needs a decision entry redefining the
WARN role.** Ship warm-white only (MUZZLE family). If you want the amber work lamps, that is §4.7.

**Risk.** Three FAR-readability defects are already in flight under T-030 (I-003 polyp tell, I-010 hit flash,
I-032 unmarked fork risk) and this adds hundreds of bright specks to the same frame. Sequence after T-030
merges. A pip subtending under ~1.5 px twinkles as the camera translates, which reads as flicker, not light —
hence the projected-pixel gate. Additive quads with `fog:false` never recede, so distant pips must be
pre-attenuated by depth at bake time.

---

### S6 — Contact shadows: one instanced multiply-blended quad pool
**Cost:** medium. **Draw-call delta:** +1.

**What changes.** New `src/render/contact.js`: **one** InstancedMesh of a flat `PlaneGeometry(1,1)` with
`MeshBasicMaterial({ color: PAL.contactShadow, blending: THREE.MultiplyBlending, transparent: true,
depthWrite: false, fog: true })`, fixed pool, hidden rows parked on the shared `HIDE` matrix — the exact
pooling idiom already in `src/render/fx.js:106-135`. `MultiplyBlending` is core three.js: **no addon, no light,
no shadow map, no post pass, no asset**, so this does not touch the lighting guardrail at all. The ground query
already exists and is read-only: `groundTopAt(x)` / `builtGroundTopAt(x)` / `platforms` are exported from
`src/sim/level.js` and `src/render/level.js` already imports from that module, so no new layer crossing and no
sim write. One row per actor per frame — RIG, each hostile, each capsule — placed through `towerPose` so it
rides the correct facet normal at a bend. Opacity and radius fall off with `(actor.y − groundY)`, which is what
makes altitude readable.

**Files:** `src/render/contact.js`, `src/render/palette.js`, `src/render/player.js`,
`src/render/hostiles.js`, `src/render/capsules.js`, `tools/pathcheck.mjs`.

**Board / pillar:** boards 13 and 14 put every form in near-black occlusion (undersides sample L 6–24) while
the shipped frame's darkest large surface never drops below L43. This is the cheapest legal source of the
missing bottom of the value range. Pillar 5 — a wasp's height above the deck becomes readable at 12 px, which
no current cue provides. Pillar 2 — dodging and aiming are vertical decisions, so height must read before it
can be played.

**Falsifying test.** (a) **Surface selection, the gate the original proposal omitted:** for every one of the 62
platform spans in the shipped level, drive the **shipped** query with an actor standing on it and assert the
resolved shadow Y equals that platform's top, not `groundTopAt(x)` — a shadow punching through a catwalk onto
the deck is a cue that actively lies about position. (b) Drawn radius never exceeds the actor's own footprint
for RIG and every hostile kind. (c) The opacity/radius falloff is monotonically decreasing in
`(actor.y − groundY)` and reaches exactly 0 at the configured ceiling — **this function must live in
`src/pure/`**, because pathcheck imports exactly two render modules (`palette.js`, `legibility.js`,
`tools/pathcheck.mjs:141-149`) and cannot import `contact.js`. (d) `renderer.info` probe and
`node tools/playtest/juice-stress.mjs` — both belong in `tools/playtest` with real Chrome, not in pathcheck.

**Corrections carried from review.** `fog:true` is mandatory — `fx.js`'s `fog:false` is an exemption for
*additive* quads only; a multiply quad that does not fade with the fog band becomes the darkest thing on a far
facet. And the mode-guard rationale must be restated: "the transformation slice has no `groundH`" is **false**
(400 of 445 ground columns measured under `?slice=transform`); the real hazard is that `level.js:96` skips the
tile bake for that slice and `transform.js` draws its own band geometry, so sim `groundH` need not coincide
with the drawn floor. State it correctly or someone deletes the guard on finding the premise wrong.

**Risk.** More transparent geometry stacked on the play plane alongside sparks, flashes and the crush slab is
exactly the clutter pillar 5 forbids. Needs an off switch for the A/B.

---

### S7 — Break the dead-straight route edge: segment rhythm and a shingled skin
**Cost:** medium. **Draw-call delta:** zero.

**What changes.** Measured on the shipped bake: **all 404 kerbs sit at outward reach exactly 0.36** and
`groundH` runs only 2..4 across the whole level, so the deck lip really is a near-straight line for the length
of a facet. No board 13 arm holds a straight top edge for more than one segment. In `facetPlan`, keep the
per-column kerb exactly as it is (the `kerbs.length === solid columns` assertion must stay literally true) and
add: a segment rhythm every 6–8 columns; a `strap` vertical band at each boundary; **scute shingling** (replace
the 1-of-3 stagger with a monotone downward step that resets at each boundary, so the skin's bottom line
serrates); and **wall stepping** (per-segment plates whose top y steps by ±`W.stepY`). Author the period
coprime with `CONFIG.path.faceTiles` so the rhythm never phase-locks.

**Files:** `src/pure/limb.js`, `src/config.js`, `src/render/limb.js`, `tools/pathcheck.mjs`.

**Board / pillar:** board 13 (every arm is a chain of overlapping segments with a serrated top line and a ring
joint at each boundary), board 10. Pillar 1 — the deck lip is the line a player reads speed and ledge position
from at FAR, and a 6–8 tile beat is a coarser scroll cadence than the 1-tile checker, which is what would let
the checker's contrast come down without costing speed read.

**Two kills carried from review — the shippable version is smaller than proposed.**
1. **The `rimGutter` mechanism cannot produce a visible change.** It recesses in *depth*, and the FAR camera is
   nearly axial — at `(5.0, 6.2, 42.75)` looking at `(7.4, 4.8, 0)`, a 0.31-tile depth recession moves a point
   by ~0.7% of its off-axis offset: about **0 px at frame centre, ~2 px at the frame edge**. The proposed gate
   ("longest run of identical outward reach ≤ segment.every") passes identically on a 0.001 recession — it
   certifies a change nobody can see. Express the rhythm in a dimension the camera sees (kerb top `y`, or a
   break in the lip's length) and gate it in **projected pixels**.
2. **The `strap` collides with a shipped assertion.** Measured, a strap from the lip (y ≈ +3.7) down across the
   scutes (y ≈ −4) sits inside `playBand [−1.0, 12.6]`, so any strap with reach > 0 that is not literally
   `kind==='kerb'` trips `limbPlanViolations` (`src/pure/limb.js:274`); making it `'kerb'` breaks
   `kerbs.length === solid` (`tools/pathcheck.mjs:5424`); putting it behind the plane buries it behind scutes
   that already reach 0.73–1.15 outward. The honest path is to **re-scope** the ramp-edge assertion to
   route-edge kerbs and add a kerb-class set to `limbPlanViolations` — a re-scope, not a weakening.

**Clean today:** the scute serration and wall stepping. Wall sits at reach −6.55 (exempt by construction), and
serrating *downward* moves scutes away from the play band, whose margin is only 0.6 tiles today (scute ytop max
−1.60 vs `playBand.y0` −1.0).

---

### S8 — RIG silhouette: five boxes to a 30 px outline with three value zones
**Cost:** small. **Draw-call delta:** +2.

**What changes.** Add a visor/helmet break (~0.30 × 0.10 × 0.30 at the head front) and a pack mass (~0.22 ×
0.34 × 0.16 behind the torso) to `src/render/player.js`, then split value into three zones — torso and pack on
a new darker token, head/visor and gun arm on the existing bright `PAL.player`, legs on a mid token. Three
zones is about the most a 30 px figure can hold, and it is what separates him from a white tracer. Move the box
list into a THREE-free `src/pure/rig.js` table (same precedent as `src/pure/shell.js`) so the harness gates the
envelope instead of trusting review. Add `playerDark`/`playerMid` to **both** tables — parity is already
asserted at `tools/pathcheck.mjs:5878-5880`.

**Files:** `src/pure/rig.js`, `src/render/player.js`, `src/render/palette.js`, `tools/pathcheck.mjs`.

**Board / pillar:** board 13 (the white figure holds as a *figure* at ~1.5% of panel height because he carries
a pack, a helmet break and a dark under-value); board 06 for the value-zone grammar. Pillar 5 — RIG sharing a
value family with his own projectiles is the readability floor of the frame. Pillar 2 — the gun-arm zone is
what makes the 8-way aim pose readable at 30 px.

**Corrections carried from review.**
- **The envelope claim is already false today.** `src/render/player.js:32-37` puts a 0.75-long box at x=0.45
  inside `gunGroup`, reaching |x| = 0.825 — more than twice the 0.35 half-width of the 0.7 × 1.7 collision box
  — and `gunGroup.rotation.z` sweeps it through 8-way aim every frame (`:50`). So "the silhouette can never lie
  about where RIG is" is untrue *now*. State the assertion over **body** boxes and bound the gun's **swept**
  envelope separately, in words as well as code, or you get a green gate over a violated property.
- A static box table is blind to two shipped per-frame transforms: `rig.scale.y = squash` (crouch, `:47-48`)
  and `rig.rotation.z = lean` (FLOW, `:54-55`). It gates the rest pose only — say so.
- The three-zone gate must assert **luminance separation between the tokens**, not "each zone ≥ 3 px tall."
  Two tokens 2% apart pass a height gate and RIG still reads as one blob.
- **A darker value inside the existing player role is legal. A different HUE for the torso is a new color role
  and needs a decisions.md entry first** (`docs/concept-art/README.md`'s invariants name roles, not values).
- Lane collision: `palette.js` and the FAR-readability findings sit inside T-030 (`review` now, and its accept
  box covers I-010's hit flash). Sequence through the integrator.

---

### S9 — An enforced actor-layer contrast contract (durability, not pixels)
**Cost:** small. **Draw-call delta:** zero.

**What changes.** Three FAR readability defects have been filed one at a time (I-003, I-010, I-032). They keep
arriving because nothing asserts the property each violates. This adds the invariant: a `CONTRAST` block of
bare numeric floors in `src/render/legibility.js` beside `SHARE` and `LAMP_R`, plus assertions in pathcheck's
palette block generalizing the shape already used at `tools/pathcheck.mjs:5929`
(`lum(C.waspDive) > lum(C.wasp)`) to the full ordering across both tables. **This is not a re-fix** — I-010 and
I-032 are in flight under T-030; this lands as the guard that keeps them fixed.

**Structural constraint:** `tools/pathcheck.mjs:6157-6160` asserts `legibility.js` "imports only config and
mode — no three.js, no sim, no render." The CONTRAST block must therefore be **bare numbers**, with the token
comparison done inside pathcheck. Importing `palette.js` into `legibility.js` breaks that assertion outright.

**Correction carried from review — and it is the honest limit of this item.** A luminance floor on raw albedo
is **not what the player sees**, in three ways: (a) fog is live and bg-colored, so at FAR every actor is
blended toward `PAL.bg` and a raw token-pair delta says nothing about separation at the depth it is drawn; (b)
the defect being cured is a *pixel-share* collapse and token-pair contrast is area-blind; (c) the deck and limb
draw white-base × `instanceColor` × `CONFIG.limb.tone`, which raw-token math models not at all. So: keep the
**ordering** assertions (cheap, real), state the **floors** against fog-composited values at a named draw
distance, and pair it with a measured frame-histogram gate from a capture at a named wave state —
`tools/playtest/palette-capture.mjs` and `legibility-capture.mjs` already exist for exactly this.

**Carve-out.** The fork-risk clause **cannot be gated today**: there is no token for a dead-end branch (I-032
*is* the report that fork risk is unmarked). Worse, inventing one collides with "the roster's ONE warning
language" (`palette.js:131-132`; guard at `tools/pathcheck.mjs:5940`) — a route hazard in WARN amber would make
a dead end read as a hostile tell. That clause waits for T-030's I-032 marking, or needs its own decision
(§4.7).

---

### S10 — Directional impact and travel language inside the existing pools
**Cost:** small. **Draw-call delta:** zero.

**What changes.** Impact today is a radial burst of uniform-scaled octahedra (`_m.makeScale(s,s,s)`,
`src/render/fx.js:267`); shots are 6×6-segment spheres whose only orientation work is the L laser and F crawler
(`src/render/bullets.js:46-58`). At FAR a radial burst is a smudge that says something happened but not which
way it went. Compose a stretch along each row's own velocity instead of a uniform scale; extend the L/F
orientation branch so every shot carries a mild stretch along its heading. Curves go in `src/pure/juice.js`
beside `burstVelocity`/`particleScale` (already imported at `fx.js:39-41`), so they are assertable without a
browser and driven off the juice clock. Rides the existing `?juice=0` A/B — no new pool, material, draw call or
token.

**Files:** `src/render/fx.js`, `src/render/bullets.js`, `src/pure/juice.js`, `src/config.js`,
`tools/pathcheck.mjs`.

**Corrections carried from review — the second one is load-bearing.**
1. Bound the streak by **one frame** of displacement (`v × 1/60`), not by lifetime travel. `CONFIG.juice.impact`
   is speed 5.5, ms 240, size 0.12 → the proposed ceiling is 1.32 tiles, an **11× elongation** = 23 screen px
   at FAR. A grotesque smear passes the proposed gate.
2. **The half that touches a damage-carrying object has no gate at all.** `src/sim/weapons.js:161` collides a
   projectile as a **point** — the bullet has no radius in the sim whatsoever. Stretching along heading pushes
   the drawn *nose* ahead of the only point that damages: exactly the lie `waspDiveStretch()` exists to
   prevent. The existing damage-prop guard at `tools/pathcheck.mjs:6165-6172` reads **only**
   `src/render/hostiles.js`, so `bullets.js` is outside its scope entirely. Add a gate whose subject is the
   sim's collision model — composed drawn half-length *ahead* of the bullet center, in tiles, at or under a
   named ceiling (the shipped L bolt's `7 × 0.16 = 1.12` tiles of nose is the existing precedent) — and extend
   the static guard's file list to include `bullets.js`.

**Sequencing:** this only changes pixels during combat beats. Follow S1–S6 rather than lead.

---

### S11 — Procedural canvas surface atlas (panel lines, weld seams, louvers, wear)
**Cost:** large. **Draw-call delta:** zero (maps ride existing materials). **Ships flag-off.**

**What changes.** New `src/render/surfacetex.js`, a memoized factory in the exact shape
`src/render/capsules.js:91-125` already ships (`document.createElement('canvas')` → `THREE.CanvasTexture`,
cached, deliberately never disposed). One canvas per material key: `plate`, `carapace`, `machine`, `deck`.
Drawn in greyscale/alpha from PAL tokens, bound as `map` on the **existing** MeshStandardMaterials with
`flatShading:true` untouched and no `normalMap`/`aoMap`/`roughness`/`metalness` change. Per-instance hue keeps
coming from `instanceColor`, so the map modulates and any value ladder still governs.

**Legality ruling — this one had a genuine conflict and it is resolved.** The `threejs-textures` guardrail's
sanctioned list is explicit and unqualified ("CanvasTexture, DataTexture, procedural/generated textures … UV
manipulation, texture settings on any of the above"), and `threejs-materials`' decision requirement is scoped
by its own rationale to **file-backed** maps ("a first binary runtime dependency … plus a network fetch"),
which a canvas draw is not. `capsules.js:121` already ships a `CanvasTexture` as `map` on a shipped material
with pathcheck green. **No new decision entry is required for the technique.** But **default-on is not legal**:
`threejs-materials` §3 says the absence of `map` is deliberate and load-bearing, and `CLAUDE.md`'s hard rule is
"Prototypes ship behind query flags, off by default." Ship as `?surf=1`, default **off**, default URL
byte-identical. (`?legibility=0` / `?juice=0` are *not* precedent for default-on — those shipped as baseline
feedback for a shipped mechanic under entry 8.)

**Author at FAR resolution, not board resolution.** At the frozen FAR default one world unit ≈ 20 screen px at
1280×800 (RIG is ~30 px for ~1.5 units), so a rivet at 1/8 of a face is ~2.5 px and will not survive. What
survives is a bold panel split and a dark gutter per tile face.

**Falsifying test.** (a) No `new Image`, no `fetch`, no `TextureLoader`, no `'assets/'` string; file joins the
tokenized list so every `fillStyle` must be a PAL token. (b) `?selftest=1` asserts the game still boots and
renders when the canvas factory is forced to return `null` — graceful fallback, so asset independence is not
re-introduced through a canvas that could fail. (c) `renderer.info.memory.textures ≤ 16` and draw calls
**exactly unchanged** — an increase means a material got split and the change is wrong. (d) **The strongest
gate in the whole proposal set:** assert in `legibility.js`'s own screen arithmetic that the smallest authored
feature, as a fraction of a tile face, projects to **≥ 3 px** at the frozen FAR default — the same class of
prediction pathcheck already makes for the 9.6 px capsule glyph. That decides the FAR-visibility question
*before any art is drawn*.

**Do not fix `capsules.js` as a drive-by.** The shipped CanvasTexture never sets `tex.colorSpace`, so canvas
colors do not match the same token used as a material color. Setting it **changes shipped pixels**. Scope
`SRGBColorSpace` to the new textures and put the capsules question in the packet (§6 Q5).

**Why last.** It is the only direction here whose payoff depends on **drawing quality** rather than on
arithmetic, and it multiplies with S1 — a map over an AO ramp can crush values. Do not merge both blind. It
also addresses the largest raw measured gap (edge energy 4.6–4.9 vs 14.0–15.8), which is why it is in the list
at all despite ranking last on gain-per-cost.

---

### Sequencing summary

| # | Item | Cost | Draw calls | Sequence |
|---|---|---|---|---|
| S1 | Baked value ladder on instance colors | medium | 0 | **first** |
| S2 | Fog band + haze ladder retune | small | 0 | with S1 |
| S3 | Charcoal steel material family | small | 0 | after T-030 |
| S4 | Graded backdrop anatomy tiers | medium | +1–2 | after S1/S2 |
| S5 | Warm-white seam pips | small–med | +1–2 | after T-030 |
| S6 | Contact shadows | medium | +1 | after S1 |
| S7 | Segment rhythm / shingled skin (reduced scope) | medium | 0 | any |
| S8 | RIG silhouette + value zones | small | +2 | after T-030 |
| S9 | Contrast contract (guard, not pixels) | small | 0 | after T-030 |
| S10 | Directional impact/travel | small | 0 | after S1–S6 |
| S11 | Procedural surface atlas (`?surf=1`, off) | large | 0 | last |

Measured headroom for all of it: the shipped default frame is **101 draw calls, 50,276 triangles, 5 textures,
13 InstancedMesh / 2,969 instances** at 1280×800. The look is **not** constrained by performance today. (One
exception to watch: `?slice=transform` runs **580 calls / 580 geometries** because `transform.js`'s `boxAt()`
allocates a mesh and geometry per piece with zero instancing — any per-band dressing there multiplies draw
calls one-for-one.)

---

## 4. Needs your decision first

Each of these needs a **new `docs/decisions.md` entry recorded before any code lands**. None re-litigates an
existing verdict; each is a choice only you can make.

### 4.1 — Light rig: raking key, and/or a play-band shadow map
**Decision requested, in one sentence:** *Authorize a flagged light-rig experiment that touches
`renderer.shadowMap` and the hemisphere/directional intensities in `src/render/scene.js` — and, separately,
authorize adoption of any alternate rig as the default.*

**What it buys visually.** The boards' light is a high warm key raking across a cold ambient: top faces take a
warm rust-amber, every vertical face and underside falls to near-black (board undersides sample L 6–24). The
shipped `HemisphereLight` at 1.1 **fills** every underside, which is why nothing occludes anything and why the
darkest large surface never drops below L43. A rake plus real occlusion is the device the boards use to
separate one plane of armour from the next, and a contact shadow is what stops props floating at 3.7% RIG
height.

**Cost of saying yes.** Large, and the shader time is not the real cost. Every CONCEPT token was authored
against this rig's ~0.45× lit-face factor (`src/render/palette.js:28-32`, `src/render/limb.js:34-42`), so
**adopting a new rig means re-authoring the whole CONCEPT table — a second full palette cycle.** Shadow maps
over 2,969 instances in 13 pools is exactly where the 60fps-with-200+-projectiles budget gets spent; one
directional shadow camera spanning fog.near→far gives poor texel density, and acne or peter-panning on a
15×30 px RIG is likely. And a guard must be written **as part of this work**: I grepped `tools/pathcheck.mjs`
and there is **zero** coverage of `shadowMap` or `toneMapping` today, so a flagged prototype can leak into the
default path with every gate green.

**Deliverable if you say yes:** the comparison, not the feature. `?light=<id>` default-shipped-rig, two
alternates behind it, matched `--deterministic` frames of default vs rake vs shadow at FAR on `/index.html`,
`?slice=traversal` and `?g1=1` into `artifacts/<name>/`, with a **measured frame-time table**. The guard uses
the established idiom: export a pure `resolveLightRig(value)` plus a rig descriptor table, assert
`resolveLightRig(null|''|'junk') === shipped` and that the shipped descriptor has exactly 2 lights and
`shadows === false` — a static source regex cannot express this once the branch exists.

**Note:** S6 (contact shadows) delivers *grounding* and *darks* without this decision, because
`MultiplyBlending` is core three.js and adds no light object. If grounding is the whole goal, S6 gets you most
of it for free. This decision is about **directional key light and real occlusion**, which S6 cannot fake.

---

### 4.2 — Gradient sky as `scene.background`
**Decision requested:** *Authorize `scene.background` to be a non-uniform texture, superseding the
single-token "fog matched to background" invariant with an explicit sky-stop/fog contract naming which token
must equal the gradient at the play band on **each** of the three background paths.*

**What it buys visually.** Board 14's sky ramps 44 luminance levels before any geometry is drawn; the shipped
sky is one hex covering 29–34% of the frame.

**Cost of saying yes.** It rewrites the live assertion at `tools/pathcheck.mjs:6011-6013` (`new
THREE.Color(PAL.bg)` / `new THREE.Fog(PAL.bg,`), which is the mechanical encoding of DESIGN's "fog matched to
background" invariant. There are **three** background owners in the tree — `scene.js:17`, `limb.js:85`
(six-face default, `PAL.limbBg`), `transform.js:370` — and `transform.js:370` does
`scene.background.copy(scene.fog.color)`, which **throws on a Texture** (`Texture.copy` of a Color leaves
`source` undefined). All three must change together or you get a half-change plus a crash in the transform
slice. There is also a real band artifact if the gradient's value at the play band does not match the fog
color.

**Cheaper alternative that needs no decision:** S4 already puts graded mass in the fog band, and a **sky
shell** — a large open-ended cylinder mesh with a CanvasTexture, `BackSide` — is ordinary render geometry, not
`scene.background`, and is shippable-now. One caveat measured from the shipped polyline: the FAR camera orbits
the tower axis at radius **99.3–114.5**, so an axis-centred shell needs R > 114.5, which puts the far wall at
up to ~229 against `camera.far = 200` in `src/render/scene.js` — either raise `camera.far` (one number, legal)
or parent the shell to the camera per frame and state in the packet that the sky follows the camera and is
atmosphere, not anatomy.

---

### 4.3 — Post-processing (bloom, DOF, grade, vignette)
**Decision requested:** *Authorize an `EffectComposer` pass on the shipped URL.*

**What it buys visually.** Today enemy "glow" is a flat emissive hex with **no bloom to bleed it** — a tell can
change hue but can never bleed light onto anything (`src/render/hostiles.js:358-365`). S5's pips would be the
frame's first pixels above L200; bloom is what would make them read as *light* rather than as bright specks.

**Cost of saying yes.** Two costs that are usually missed: a composer **silently loses the renderer's MSAA**
(`antialias:true`, `scene.js:9`) and **does not inherit ACES tone mapping** — so an FXAA/SMAA pass is a cost of
entry, not an upgrade. It is also the first `three/addons/*` import in the project, i.e. a second CDN runtime
dependency, which the geometry guardrail lists as its own gating question. The telemetry snapshot exposes no
frame-time field today, so a perf claim requires adding render-side sampling first. **Nothing in the machine
gates catches a composer wired into the default path** — `main.js`'s selftest (`renderer.info.render.frame >
0`) still passes when `composer.render()` replaces `renderer.render()`. Ceiling until a decision: flag default
OFF, shipped URLs byte-identical, measured before/after frame time at FAR, packet with frames.

---

### 4.4 — Runtime asset loading
**Decision requested:** *Authorize `src/` to load a file under `assets/` at runtime.*

**What it buys visually.** Hand-authored textures, models, HDR environments — i.e. everything the offline asset
pipeline (`tools/assets/`, opened by entry 8) can currently produce but nothing can consume.

**Cost of saying yes, and a sub-rule that survives the decision.** Even after an entry, **a hard dependency on
an asset file stays illegal** — the game must still boot with every file under `assets/` missing, with
graceful fallback to the procedural look. `DRACOLoader`/`KTX2Loader` specifically remain illegal regardless,
because they fetch decoder binaries from URLs outside the import map (`index.html:176-183` maps exactly two
specifiers) — a new third-party runtime dependency under "no build step, no runtime dependencies."

**Honesty item you should know before deciding:** the asset-independence gate has a filed hole (I-014). The
import scan at `tools/assets/check.mjs:176` only matches when the specifier is on the **same line** as the
`import` keyword, so a multi-line import evades it and `check.mjs` still prints PASS. `index.html` is not
scanned by either tool. **Do not treat a green `check.mjs` as proof of asset independence.**

---

### 4.5 — Tone mapping / exposure / color space
**Decision requested:** *Authorize a change to `renderer.toneMapping`, `toneMappingExposure`, or
`outputColorSpace`.*

**What it buys.** ACES is already set and shapes every screenshot you have judged. Exposure is at the default
1; `outputColorSpace` and `THREE.ColorManagement` are never assigned anywhere in `src/` (grep returns only
`scene.js:12`).

**Cost of saying yes.** Same as 4.1: every CONCEPT value is calibrated against ACES at ~0.45× albedo, so this
re-ranks the whole value ladder. Related live subtlety: the shipped CanvasTexture never sets `tex.colorSpace`,
so canvas colors do not match the same token used as a material color — arguably a bug, but fixing it changes
shipped pixels, so it is your question, not a drive-by fix (§6 Q5).

---

### 4.6 — Teal vs indigo atmosphere
**Decision requested:** *Change the atmosphere color role from "deep teal" (`README.md:293`) to board 14's deep
indigo — or confirm teal stands and board 14 is the outlier.*

**What it buys / costs.** Board 14 is the newest environment board and the one `CLAUDE.md` names as leading
environment form; it is 64.5% indigo with teal at 7.2%, and its own prompt names "deep indigo." Boards 01/10/13
are teal-dominant (57.0/70.0/68.9%). Shipped `CONCEPT.bg` is teal `0x143238`. This is a change to a
**documented invariant** in the Visual invariants list, and pathcheck carries a teal-family channel predicate
(`g > r && b > r`, `tools/pathcheck.mjs:5906-5909`) that would have to move with it. It must not arrive
disguised as a gradient stop or a shade ramp inside any other direction.

---

### 4.7 — Two smaller role questions, bundled
**(a) Warm-amber work lamps on architecture.** *Decision requested: authorize amber to mean "work light" on
static architecture in addition to its current sole meaning, "incoming."* Amber is the roster's one warning
language, guarded at `tools/pathcheck.mjs:5940-5947`. S5 ships **warm-white only** without this; the amber half
needs it. Cost of yes: a telegraph and a lamp share a hue in the same frames as open defects I-003 and I-032.

**(b) A route-risk color role.** *Decision requested: authorize a color role for a dead-end/hazard branch,
distinct from the hostile WARN family.* `decisions.md` entry 11 requires a dead end be legible as a risk before
commitment, and I-032 reports that fork risk is unmarked. Any marking drawn in WARN amber would make a dead end
read as a hostile tell. Without this, S9's fork clause cannot be gated.

**(c) An outline/ink silhouette language for the actor layer.** See §5 — the proposed implementation is dead,
but if you want a hard silhouette edge on actors at all, a reshaped version needs an entry authorizing it,
because it pushes toward a cel-shaded read and away from the boards' industrial rendering. That is a look
verdict, not an engineering one.

---

## 5. Ruled out — do not re-propose

**Killed in this review:**

- **Gradient sky assigned to `scene.background`, as specified.** Killed on two independent grounds: it ships an
  unjudged look **default-on** with no flag (`threejs-textures` guardrail: "Background and environment are a
  judged look, not a knob … an unjudged look ships behind a query flag declared in `src/mode.js`, off by
  default"; plus `CLAUDE.md`'s hard rule), and its mandatory constraint was gated against `PAL.bg` while the
  shipped default path overwrites background and fog to **`PAL.limbBg`** (`src/render/limb.js:85-86`; `IS_G1`
  is true by default and `tools/pathcheck.mjs:7491` asserts exactly that) — a green gate over a mismatch the
  constraint existed to prevent. Its **backdrop-mass half is salvageable and is S4**, provided the mass is
  authored into `limbBakePlan` rather than beside it, so `limbPlanViolations` and the play-band guards can see
  it. The `scene.background`-texture half is §4.2.
- **Ink separation shell (inverted-hull outline) on RIG/hostiles/capsules.** Ruled **illegal as constructed**.
  Its safety gate ("the existing hit-circle assertions must still pass byte-identically") is vacuous — those
  assertions compute from `CONFIG.hound.size`/`CONFIG.polyp.size`/`CONFIG.wasp.visualRadius`, not from any mesh
  scale, so they pass for **any** body scale including 0. Measured, the invariants actually break: at the
  illustrated `INK_RIM 0.12` the hound's drawn inradius goes 0.450 → 0.396 against an unchanged hitRadius of
  0.42, and the compensated capsule letter goes 13.05 px → 11.48 px against `LEGIBLE_PX_FLOOR 12`, **silently
  reopening the exact T-003 defect entry 7's follow-up was opened to close** — while both lines still report
  PASS. The parameter window between "rim is visible" and "hit circles still contained" is empty or ~0.3 points
  wide depending on which actor you read it against. A reshaped version needs §4.7(c).

**Previously judged and rejected — standing, never re-litigate** (`docs/decisions.md`, `docs/concept-art/README.md`):

- The rectilinear **warehouse macro form** of boards 1–5 and 8 (entry 0b). Their palette, enemy readability and
  route logic are explicitly *not* superseded.
- **Board 12's pulled-out camera** — "it pulls too far out, makes RIG microscopic, and turns the climb into an
  infographic." Macro comparison board only.
- **Continuous helix rotation** of the world. Turns are discrete, chunky events.
- **The brick-slam zipper as a world/anatomy reveal**, and any "assets thrown together and smack into place"
  transition (entry 3). This supersedes the literal scute/rib assembly imagery in boards 10–13 and the
  moving-wall imagery in board 08. Zip-assembly is **retired from the world but retained** for things the ship
  *builds* — traps, emplacements, later enemies — and the choreography code stays extractable at `?zip=1`.
- **Snap hook v1** (`?hook=1`). Inert, no further investment, the one render file deliberately exempt from
  palette tokens. The *verb* is not banned; a future tether must be marker-less and button-less.
- **NEAR as default, and "make RIG bigger" as the readability fix** (entry 7). The sanctioned fix is scaling
  tells and glyphs — shipped as `src/render/legibility.js`. Also rejected: projectiles visibly curving around
  corners.
- **Pricing a reward in height or reach** (entry 9, three failed passes). Any assertion whose subject is
  reward-out-of-reach or retreat-timing-as-cost is *removed*, not weakened.
- **Raw hex literals in the twelve tokenized render files** (`tools/pathcheck.mjs:5981-5983`), and **gates that
  award altitude by camera snap** (board 14 ruling: "if a gate appears to award height by camera snap, it has
  drifted").

**Structurally illegal, no verdict unlocks it:** `THREE`/`document`/`window`/`renderer`/`scene`/`performance`
tokens or upward imports in `src/config.js`, `src/pure/`, `src/sim/`; a second renderer, scene, canvas or rAF
loop; a static import of an `assets/` path; any raycast or 3D value feeding sim state; `OrbitControls` or a
free-look camera even off by default; mouse/pointer input reaching sim; mixer/skeletal/morph or vertex
displacement on the Meridian's anatomy — **which may not even be prototyped**.

---

## 6. Operator checkpoint packet

**LOOK DIRECTION v1 (this packet).** Nothing below has been built — these are the frames that exist **today**,
so the questions are about what the current build is missing and which of §3's directions is worth a lane. Play
the default six-face run first; entry 13's rider applies (a verdict taken in `?slice=traversal` is re-asked in
the six-face run, not inherited).

Play, in order:

1. `http://127.0.0.1:8741/index.html` — the shipped default at FAR.
2. `http://127.0.0.1:8741/index.html?palette=classic` — the byte-faithful grey-box baseline, same geometry,
   same lights, same materials, only hues differ.
3. `http://127.0.0.1:8741/index.html?slice=traversal` — the state the audit measures as the most
   placeholder-looking in the build (one color over 87–91.5% of the playfield).
4. `http://127.0.0.1:8741/index.html?g1=1` — the corner orbit around the static limb, where the backdrop band
   S4 would populate is most visible.

Then compare against `docs/concept-art/13-human-scale-monster-climb-grammar.png`,
`10-creature-lattice-chaos.png`, `06-enemy-form-language.png` and `14-vertical-assault-level.png`. Fresh
measured frames of all four URLs are in
`/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/look/evidence/`
(`04-default-run-20s.png`, `19-default-run-palette-classic.png`, `05-traversal-slice-4s.png`,
`14-view-far.png`). **Do not use the pre-palette artifact sets** listed in §1.

**Questions:**

1. Play 1 then 2 back to back. The audit's finding is that they differ in hue only — geometry, lighting,
   materials and composition are identical. **When you say "grey-box," is the thing you are seeing the colors,
   or the flat unlit surfaces and the absence of dark and bright?** §3's first move (S1) is a value-range pass
   with no hue change; that is the wrong first move if your answer is the colors.

2. Board 06 and boards 10/13 thread **charcoal machinery** through rust anatomy; the boards run 5.6–8.6%
   neutral and the build measures under 0.5%. `DESIGN.md` caps the palette at ≤8 roles and the Visual
   invariants list names five, none of them neutral. **Is charcoal machined metal a new color role you want, an
   extension of the existing near-black INK role, or not a direction at all?** (S3 is a 404-of-829-piece remap
   that hangs on this answer.)

3. On 1 and 4, look at the band above the deck. Today it is one flat hex covering 29–34% of the screen, and
   `CONFIG.limb.silhouette`'s two distant plates sit at a depth where fog erases them (computed fog factor
   1.16, i.e. fully hazed). Boards 09/10/13/14 all put a second limb, a lit settlement and a distant Crown in
   that band. **Do you want mass in that band — and if so, does mass up there help you read the play plane, or
   compete with the enemies you are tracking?** (This is the same question the queued G1 corner-reveal packet
   asks; S4 would fold into it rather than open a new one.)

4. Every board scute seam and route lip carries a running row of warm-white pips; `PROMPTS.md:261` names it a
   required continuity landmark. The build has **0.0% of pixels above luminance 200 in all fifteen gameplay
   captures** — there are no highlights anywhere. **Should route lips carry light?** And separately: warm-white
   is the player-fire/muzzle role, warm-amber is the roster's one warning language — **is amber allowed to also
   mean "work light" on static architecture, or must architecture stay out of amber entirely?** (S5 ships
   warm-white-only without a decision; the amber half needs §4.7(a).)

5. Two things that would change shipped pixels but are too small to be their own packet. (a) The tab title
   still reads `HULLBREAKER — grey-box` (`index.html:5`), the VICTORY overlay says "grey-box complete"
   (`src/ui/overlay.js:104-105`), and a 3–4 line dev control legend plus fixture banners are on screen in every
   gameplay frame — **which of those should come off for delivery, and which are still load-bearing for you?**
   (b) The shipped capsule `CanvasTexture` never sets `colorSpace` (`src/render/capsules.js:121`), so its
   canvas colors do not match the same token used as a material color. Fixing it is a two-line change that
   **shifts the letter's rendered value** — **do you want it fixed, or left as judged?**

**Not asked here, deliberately, because they are already queued and must not be duplicated:** Glyph scale at
FAR (asset batches are held on it), Palette v1 concept-vs-classic, the default corner reveal, CP3 v3, G2 flip,
and T-028's juice-restraint and FAR-tells questions. Any answer to Q1–Q5 that touches those merges into the
existing packet rather than opening a second one.

---

## Appendix — process gaps found while writing this

Reported because they cost cycles if they stay buried, not as work requests.

1. **T-013's promised board-05 title-direction packet was never filed.** `docs/DESIGN.md:534-543` records that
   "The Ship Wakes" ships as default "not because a direction has been judged — that verdict is queued," and
   `SPRINT.md:1093` still lists "shell" as a packet to append. It is not in the checkpoint queue. Delivery box
   13 treats exactly this as falsifying.
2. **Delivery box 9 ("climb is the dominant motion; a face that reads as a flat corridor is a defect") has no
   falsifying assertion.** Pathcheck asserts per-face route density and spawn-density escalation; neither is
   climb.
3. **Three skill-pack guardrails are stale and will mislead a builder.** `threejs-interaction` §7 states "there
   is no pathcheck guard rejecting raw color literals in render files today" — **wrong since T-010 merged**.
   `threejs-lighting` §4 says `src/render/palette.js` does not exist on main — it does. `threejs-textures`
   describes the palette pass as in-flight and unmerged. The tokenized list quoted across the skills also omits
   `legibility.js`, which pathcheck now includes (`tools/pathcheck.mjs:5981-5983`).
4. **`tools/pathcheck.mjs` has zero coverage of `shadowMap`, `composer`, `EffectComposer`, `Loader`, `addons`
   or `toneMapping`** (verified by grep). Green proves no *encoded* rule was broken and says nothing about
   consent. Any of those must ship with its own static guard written in the same change.
5. **`CONFIG.limb.fog` near/far have no assertion** (only `CONFIG.fog` 30/74 at `tools/pathcheck.mjs:419`), so
   the two numbers that set the default run's entire atmosphere band can currently be moved silently. S2 closes
   this.
