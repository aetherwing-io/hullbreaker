# T-035 — the value ladder (packet items S1 + S2)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-035`,
branch `task/T-035` (fast-forwarded to main's `856a9a3` before work started, so
the packet and `artifacts/look-v1/` were in the tree).

**No aesthetic verdict is claimed anywhere in this report.** The ladder is
behind an off-by-default flag precisely so the operator judges it; what is
below is arithmetic, captures and the questions that need an answer.

**WHAT THIS DOES AND DOES NOT REACH — up front, not in a footnote.** This is
not a whole-game value change. `src/render/limb.js` gates on `IS_G1`, so the
LIMB half of the ladder — the ~900-piece body, which is most of the pixels it
moves — applies to the six-face run **only**. It changes nothing under
`?slice=traversal` or `?slice=transform`. The DECK half (`src/render/level.js`)
reaches the six-face run and the traversal slice; the transform slice bakes no
deck tiles, so `?slice=transform&shade=1` is a complete no-op. The S2 fog shift
is likewise `IS_G1`-only. The last look pass overclaimed by moving hue over
byte-identical geometry, so: the numbers below are the six-face run unless a
row says "slice", and the slice's own change is one ramp on the deck stack.

---

## What changed and why

The packet's one-line finding is that the grey-box read is a VALUE range, not a
hue: 0.0% of playfield pixels over luminance 200 in all fifteen gameplay
captures, 99% inside a 45–70 window out of 255, one flat token over 29–34% of
the screen. The cause is structural, not a palette choice: `palette.js` authors
where a **lit** face lands (~0.45× albedo, re-measured and confirmed —
`PAL.ground`'s token luminance 141.6 renders at 63) and nothing ever authored
where an **occluded** one lands. `CONFIG.limb.tone` is ±4% of *hue*, so every
instance of a material shipped at ~1.0× its token.

- **`src/pure/shade.js` (new, THREE-free, deterministic).** Four terms folded
  into one multiplier per baked piece: key-light extinction by depth behind the
  combat plane; ring occlusion sampled from an occupancy grid built from the
  whole plan (the piece's own footprint is skipped, so a big plate is not dark
  for being big); a top-face rake lift read off the piece's proportions; and a
  coherent two-octave wear field seeded through `mulberry32` on integer lattice
  cells of `(s, y)`. `limbShadePlan(plan, cfg, gain)` is plan-level by
  construction — occlusion is about what is *around* a piece. `deckShadePlan
  (groundH, cfg, gain)` is the deck's half. No time argument, no `Math.random`,
  no `Date.now`/`performance.now`, no upward imports.
- **Gain, not a boolean.** Every export returns `1 + gain * (raw - 1)`, so
  gain 0 is **exactly** 1.0 and the default build is bit-identical. `?shade=1`
  is full strength, `?shade=0.5` is half — a real operator dial from one build.
  `CLASSIC.shade.gain === 0`, so `?palette=classic&shade=1` is still the
  byte-faithful grey-box instrument for the queued Palette v1 A/B (verified in
  the browser: the live instance-color hash is identical, `98b8c4a0`).
- **`src/render/limb.js`** applies it next to `limbFacetTone`, still
  `new THREE.Color(token)`-derived, no literal. **`src/render/level.js`** ramps
  the four-tile deck stack (lit lip → shadowed face) and multiplies the shared
  stain field per column, through a reused scratch `Color`.
- **`src/config.js`** carries the whole model in one `CONFIG.shade` block with
  its reasoning, plus `CONFIG.limb.shadeFog` (S2).
- **`src/render/camera.js`** (one line + comment) selects the retuned band when
  the ladder is armed. **This file was not in my assigned list** — see "Fence"
  below.
- **`tools/pathcheck.mjs`**: +37 assertions in ONE delimited block
  (`/* ==== T-035 value ladder (S1 + S2) ==== */`) immediately before the
  summary lines, importing what it needs dynamically so the shared import
  header is untouched. Splice-friendly for T-025/T-027.

### Two measured corrections that changed the design mid-task

1. **A first draft with a monotone deck ramp to 0.22×** dropped the captured
   frame's p95 by 13% and collapsed the traversal slice's slab-vs-void
   separation from 33.5 to 5.3 luminance levels — the slabs nearly merged with
   their own backdrop. The shipped ramp is one hard contact step under the lip
   (which is what gate (b) demands) plus a shallow tail, with the **lip lifted**
   (1.35× linear ≈ 1.13× display). A ladder that only removes light makes the
   sky the brightest thing in the frame, which is the packet's own "nothing
   reads as lit" finding pointing the other way.
2. **`?shade=1` initially failed `?selftest=1`** ("limb haze armed"). See the
   S2 limitation below — it is why the fog retune ships as a shift and not as
   the wider ramp the numbers argue for.

---

## Verification — every command and its result

| command | result |
|---|---|
| `node tools/pathcheck.mjs` (worktree) | **1742 passed, 0 failed** (main baseline 1705 → +37) |
| `index.html?selftest=1` | SELFTEST PASS (29 checks) |
| `index.html?selftest=1&shade=1` | SELFTEST PASS (29 checks) |
| `?selftest=1&shade=1&palette=classic` | SELFTEST PASS (29) |
| `?selftest=1&shade=1&slice=transform` | SELFTEST PASS (30) |
| `?selftest=1&shade=1&zip=1` | SELFTEST PASS (26) |
| `?selftest=1&shade=1&view=near` | SELFTEST PASS (29) |
| `?selftest=1&shade=0.5` / `?selftest=1&shade=junk` | SELFTEST PASS (29) each |
| `run.mjs scripts/six-face-full-run.json --deterministic` (worktree, no flag) | outcome `died`, 1 death, 0 falls |
| same script with `?shade=1` | outcome `died`, 1 death, 0 falls, **summary JSON identical**; the life is lost at the same place (x = 31.649 both) |
| `run.mjs scripts/mid-route.json --deterministic` with `?slice=traversal&shade=1` | outcome `completed`, 0 deaths |
| draw calls / meshes / instances, read live from `renderer.info` + scene walk | 94 / 13 / 2969 — **identical with the flag on and off**, in every mode captured |
| page errors across all capture runs | none |

Playtests were run from the main checkout's harness with `--base-url` /`--url`
against the pinned worktree on port 8749 and `--out` into the scratchpad:
nothing was written under `tools/playtest/`. Port 8749 only; the server was
killed afterwards. Ports 8741/8742 untouched.

### The S1 gates (arithmetic, in `tools/pathcheck.mjs`)

Luminance is Rec.709 over **sRGB display bytes** — the space every number in
the packet's evidence is measured in — while the multiplier acts in the
renderer's linear working space, so each instance is taken
token → linear → ×tone ×shade → back to sRGB → luma. Stating the gate in
multiplier space would have been ~2.2× weaker.

| gate | shipped default | `?shade=1` |
|---|---|---|
| (a) instances below 0.55× their token's luminance | **0.0%** | **70.9%** (gate ≥ 20%) |
| (a) worst per-material normalized spread | **0.000** | **0.490** (gate ≥ 0.45) |
| (b) checker token delta | 16.77 | 16.77 (unchanged) |
| (b) worst-column row-1→row-2 step | 0 | **21.5 levels** (must exceed 16.77) |
| (b) along-s deck wear swing | 0% | 8.2% (must stay under the checker's 11.9%) |
| (c) columns where the deck's top row is not the brightest | — | **0** |
| (c) dimmest deck top row vs brightest limb instance | 124.8 vs **145.4 (rule violated today)** | 131.5 vs 98.5 ✓ |
| (e) plan pieces / material buckets | 829 / 8 | 829 / 8 |

Per-material display ramps under the ladder: machine 54 levels, rib 44, shadow
40, wall 38, scute 34, hull 33, scuteAlt 31, skyline 22. Boards 13/10 measure
52–81 levels for rust; the shipped build measured 34.0–34.4 *across the whole
material*, with zero range inside one.

### The capture gate (pre-registered before any capture)

Full table and the frames: `artifacts/shade-v1/README.md`.

- **P1 (the gate) PASSED.** Paired population, `median(rust px) − median(teal
  px)`: −15.0 → **−61.0** at 10 s (−59.8 at 3 s, −61.0 at 20 s; −35.7 at
  `?shade=0.5`). The teal median did not move (78 → 78), so the widening is not
  the frame going dark together. The sign is the direction board 13 has it: far
  body L=78 over near deck L=36.
- **P2 (my own anti-"dirty, not lit" guard) FAILED AS WRITTEN**, and I am not
  re-specifying it quietly. p95 fell 90 → 78 (−13%, cap was −5%). Diagnosis:
  p95 on this frame is a *mid-tone* statistic — the deck's four-tile stack,
  today one flat value, is now a ramp, and that population moved down. The
  highlight statistics rose: p99 106 → 108, p99.9 138 → 146, share over L140
  0.10% → 0.16%. A uniform darkening moves all of those down together; these
  moved apart. **Operator: this is the one number that says "too dark", and it
  is exactly the judgment I cannot make.**
- **P3 (reported, never a gate):** share under L25.5 goes 0.5% → 50.2% at 10 s
  (boards: 24–29%). At `?shade=0.5` it is 4.9%.

---

## Known costs and limits — read these before merging

1. **The traversal slice loses separation.** `?slice=traversal&shade=1` takes
   the deck-vs-void separation from 33.5 to 14.1 levels (an earlier draft hit
   5.3). The slice has no backdrop at all, so ramping the slab faces moves them
   toward the void. Frames 08/09 in `artifacts/shade-v1/`.
2. **Scope limit:** `src/render/limb.js` gates on `IS_G1`, so **the limb half
   changes nothing under `?slice=traversal` or `?slice=transform`.** The
   transform slice does not bake deck tiles either, so `?slice=transform&
   shade=1` is a complete no-op.
3. **S2 shipped as a SHIFT, not the widening the numbers argue for.**
   `src/main.js`'s selftest asserts `limb haze armed` as a *band-width*
   comparison against `CONFIG.limb.fog`, so any widened ramp fails
   `?selftest=1&shade=1`. `src/main.js` is fenced to T-032 this cycle. Shipped:
   `shadeFog { near: 26.5, far: 54.5 }` — same width, shifted, which takes the
   protected play band **fully out of the fog ramp** at every view and aspect
   (measured 0.0%, and 0.0–0.3% even at ultrawide 2.40, against 3.3–9.3%
   today) and clears the near air (wall tier 0.16 → 0.07). What it does **not**
   do is rescue the deepest authored slab at depth −34, which is at fog 1.00 —
   fully erased — under both bands. That needs `near 25.75 / far 63.0` (width
   37.25, tiers 0.07 / 0.57 / 0.79, all derived and recorded in `config.js` so
   the follow-up need not re-derive them) **plus one line in `src/main.js`**:
   compare the selftest's band against the band `camera.js` selected rather
   than against `CONFIG.limb.fog`. A pathcheck assertion records the limit so
   no later report can claim the tier is staged.
4. **`window.HB.g1.fog` now under-reports.** It hard-reads `CONFIG.limb.fog`
   (`src/main.js:...`), so with `?shade=1` the debug handle names a band the
   renderer is not using. Harmless to play, wrong to a reader — the I-019/I-031
   "green guard over a value nothing reads" family. One line, in the same fenced
   file. **Recommend filing as an Inbox issue.**
5. **One file outside my stated list, taken with the integrator's permission.**
   `src/render/camera.js` was not in T-035's file list. It is the only consumer
   of `CONFIG.limb.fog`, and `calibrateEdges()` re-runs on every resize, so no
   render module can own the band without being clobbered — S2 is unshippable
   without it, and the alternative was leaving a derived-but-dead constant in
   `config.js`. I asked before touching it; the integrator checked ownership
   (no live lane holds `camera.js`) and **granted the line**. The whole diff
   against main is +1 import, +1 expression, +7 comment lines:

       const F = IS_G1 ? (SHADE_GAIN > 0 ? CONFIG.limb.shadeFog : CONFIG.limb.fog) : CONFIG.fog;

   With `?shade=` absent, `SHADE_GAIN` is 0, so the expression selects exactly
   `CONFIG.limb.fog` — visible by inspection, and pathcheck asserts the source
   text so it cannot drift into an unconditional swap. Nothing else in the file
   was touched: no refactor, no cleanup.
6. The wear field is what supplies most of the within-material range for
   materials whose pieces are geometrically identical (56 hull slabs, 6 joint
   ridges). At `?shade=1` that reads as strong weathering; whether it reads as
   *weathering* or as *dirt* is a feel question (Q3 below).

---

## Operator checkpoint packet

Serve the branch and open these. `node tools/serve.mjs 8749 --root
<worktree>` (or after merge, the usual `node tools/serve.mjs`, then use 8741).

- A: `http://127.0.0.1:8741/index.html` — the shipped build, unchanged.
- B: `http://127.0.0.1:8741/index.html?shade=1` — the ladder, full.
- C: `http://127.0.0.1:8741/index.html?shade=0.5` — the ladder, half.
- D: `http://127.0.0.1:8741/index.html?slice=traversal&shade=1` — deck half only.
- E: `http://127.0.0.1:8741/index.html?palette=classic&shade=1` — proof the
  grey-box instrument is untouched (should be indistinguishable from
  `?palette=classic`).

Questions:

1. **A vs B vs C — which value range is the game?** B puts 50% of the frame
   under L25.5 and takes the play surfaces well below the haze; C is halfway
   (4.9%). Is the answer B, C, something between, or "not this axis"?
2. **In B, the body wall behind the deck goes nearly black and the catwalk
   lines read as bright rails on a void.** Is that the "ledge on something
   enormous" read you want, or has the wall stopped being a surface?
3. **Does the weathering read as weathering?** The stains run in ~23- and
   ~7-tile bands across the hull and the deck lip. Grime, or noise?
4. **D (the slice): the slabs are dimmer against the same flat void.** Does the
   route still read at speed, or does the slice need the ladder off until it has
   a backdrop (packet item S4)?
5. **Direction check for everything downstream:** B keeps the haze band as the
   *brightest* population and pushes the play surfaces below it — board 13's
   arrangement. The alternative reading of the packet ("the sky is brighter than
   the ground, so nothing reads as lit") would invert that and put the haze
   under the deck. Every later item (backdrop tiers, sky ramp, seam pips) gets
   calibrated against whichever you pick, so this one is worth answering
   explicitly.

---

## Single best next action

Get the operator's answer to question 5 (and 1) before any other look item is
built — S3/S4/S5 all calibrate against the value range this task establishes,
and re-tuning them twice is the cost of skipping it. If the lane wants a build
task instead while that waits: land the `src/main.js` one-liner from limit 3 +
the `HB.g1.fog` fix from limit 4 together, which unblocks the full S2 band and
removes a debug-handle lie in one small, fenced-file change.
