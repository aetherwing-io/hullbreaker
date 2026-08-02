# T-030 build report — palette repoint + the FAR readability notes it left

worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-030`,
branch `task/T-030`. One runtime file changed: `src/render/hostiles.js`.

## The task's premise is one issue out of date

The task block says `src/render/hostiles.js` "still reads
`CONFIG.palette.wasp/carrier/hound/houndTell/houndCharge`". It does not, and
has not since `b708bac` ("T-010: reconcile the palette with T-004's polyp;
land the hostiles wiring"), which is on `main`. Evidence on this tree:

- `grep -n "CONFIG" src/render/hostiles.js` returns only geometry/tuning reads
  (`CONFIG.wasp.visualRadius`, `CONFIG.hound`, …) — zero `CONFIG.palette`.
- `grep -nE "0x[0-9a-fA-F]{3,8}|#[0-9a-fA-F]{6}" src/render/hostiles.js`
  returns nothing.
- `tools/pathcheck.mjs` already lists `hostiles.js` in its `tokenized` set and
  asserts both properties (no `CONFIG.palette` reads, no raw color literals),
  plus "every sim ENEMY kind has a body color token in both modes".
- SPRINT's own I-004 entry carries a **RESOLVED — closed at the T-010 merge**
  block saying exactly this.

So **acceptance box 1 was already satisfied when this task was written**, and
nothing in this branch was needed to satisfy it (it is still green here).
What was genuinely open was the rest of the goal line: I-010, the freshness of
the committed artifacts, and re-evidencing I-003 on the current tree.

## What changed

**`src/render/hostiles.js` — the hit flash tints the body instead of replacing
it (I-010).** A hit set `mat.emissive` to `PAL.hitFlash` (full white). At the
shipped FAR view that is a ~15px body rendered as a hueless pale quad: the
frame no longer says wasp, or even hostile. That is the defect I-010 filed
after it cost the T-008 screenshot gate real time.

The flash now uses `hitFlash` mixed toward each kind's own body color, one
color per kind resolved at module load (no hot-loop allocation, no new
per-frame work; the corpse death-pop carries the same color). The mix is
ramped by the readability pass's existing rule rather than a new one:

```
HIT_TINT = 0.8 * clamp((CUE_GAIN - 1) / (viewScales.far.depthMult - 1), 0, 1)
```

- `?view=near` → `CUE_GAIN` 1 → tint **0** → `THREE.Color(0xffffff).lerp(c, 0)`
  is 0xffffff exactly: the near view keeps the art it always had, which is the
  contract `src/render/legibility.js` states and pathcheck asserts for gains.
- `?legibility=0` → `CUE_GAIN` 1 at every view → tint 0 → the operator's A/B
  is the pre-pass white flash, produced by this same build.
- `?view=far` (shipped default) → tint 0.8.

No sim file, no palette token, and no `CONFIG` value changed; `PAL.hitFlash`
and `PAL.glowOff` keep their asserted mode-independent identity values.

**Artifacts re-captured (a stale artifact is worse than none):**

| directory | why it was stale | how it was refreshed |
|---|---|---|
| `artifacts/palette-v1/` (21 files) | shot before T-003's tell lamps and T-014's mortar | `node tools/playtest/palette-capture.mjs` |
| `artifacts/legibility-v1/` (30 files) | shot on T-003's branch, before later merges | `node tools/playtest/legibility-capture.mjs` |
| `artifacts/g2-neck-flip/` (10 frames + `index.json`) | **grey-box palette** (pre-T-010 default) *and* the pre-fix white flash in frame `00` — the exact frame I-010 was filed from | `node tools/playtest/g2-capture.mjs shots`, then copied in; README carries a dated re-capture note |
| `artifacts/hitflash-v1/` (new) | — | the I-010 A/B, its measurements, and the rig that made them |

Every one of the 51 palette/legibility frames differed from a fresh capture,
so the whole of both sets was replaced rather than a subset.

## Verification

| command | result |
|---|---|
| `node tools/pathcheck.mjs` | **1674 passed, 0 failed** (unchanged count: the change adds no pure logic) |
| `index.html?selftest=1` (headless Chrome, ephemeral port) | **SELFTEST PASS (29 checks)**, no page errors |
| `index.html?selftest=1&legibility=0&view=near` | **SELFTEST PASS (29 checks)**, no page errors |
| `node run.mjs scripts/mid-route.json --deterministic` | outcome `completed`, `pageErrors: []` |
| `node run.mjs scripts/polyp-lane-dodge.json --deterministic` | outcome `completed`, `pageErrors: []` |
| `node run.mjs scripts/hound-facetank-solo.json --deterministic` | outcome `stalled` — **the same outcome this script produces with the change stashed** (checked: `git stash push src/render/hostiles.js` → re-run → `stalled`), i.e. the script's normal result, not a regression |
| `node tools/playtest/palette-capture.mjs` | exit 0, all scenes verified (polyp frames pixel-verified by the rig) |
| `node tools/playtest/legibility-capture.mjs` | exit 0, 0 `-FALLBACK` frames; polyp onset frames verified at **41ms / 42ms** into the 800ms tell |
| `node tools/playtest/g2-capture.mjs shots` | 10/10 frames, `errors: []`, every beat within 200ms and 0.35 tiles of the committed `index.json` |

Servers: every capture and check ran on an **ephemeral port** (`startStaticServer(…, {port: 0})`),
so 8741/8742 were never touched. For operator judging, serve on 8743
(`python3 -m http.server 8743`).

### Measured, not asserted (I-010)

Flashed body core (fully covered pixels only), FAR, 1280x800, concept palette
— `artifacts/hitflash-v1/*.json` and the README there:

| frame | saturation | hue | luma |
|---|---|---|---|
| cruising drone, no flash | 0.68 | 122° acid | 51 |
| cruising drone, flash — `?legibility=0` (before) | **0.08** | 181° neutral | 162 |
| cruising drone, flash — shipped default (after) | **0.20** | 103° acid | 155 |
| diving drone, dive commitment glow | 0.43 | 68° | 213 |
| diving drone, flash (after) | 0.26 | 76° | 211 |

The before/after pair caught the same drone within 0.04 tiles of the same
place, and each panel's two frames are one `?fixeddt=6` step (12ms) apart, so
the comparison is a like-for-like one. The pop is intact (3x the body's luma,
4% off the old flash's brightness) and the flash stops being hueless; on a
body that is already glowing it still reads as a wash-out (saturation 0.43 →
0.26), which is what keeps it from becoming a second commitment cue.

### Measured, not asserted (I-003, the polyp's first beat)

Fresh `polyp-onset` capture at **42ms** into the 800ms iris tell, FAR, in a
46x46px box on the emplacement, counting pixels at luma ≥ 150:

| frame | bright px | mean colour | hue |
|---|---|---|---|
| `?legibility=0` (pre-pass) | 27 | (116,174,43) | 87° — the body's lit top, i.e. no warning at all |
| shipped default | **213** | (206,200,158) | 44° — the warm WARN lamp |

So the first ~300ms of the tell **does** carry a signal on the shipped tree
(T-003's onset flash + front-loaded dilation); the box is met with evidence
rather than by restating the finding. Whether 213px of warm lamp is *enough*
warning is a feel call and is in the questions below.

## Acceptance boxes

- [x] **hostiles read CONCEPT tokens; no raw hex literal in a tokenized render
  file** — already true before this branch (see above); still asserted green.
- [x] **FAR side-by-sides, judged against boards 01/10 and the invariants** —
  `artifacts/palette-v1/*--pair.png`, all re-captured. Against the invariants:
  deep teal atmosphere, rust-orange structure, acid-green danger, hot-magenta
  reward, warm-white player fire are all present and separated; RIG stays at
  the FAR 3.7% figure (no camera or scale change was made); surfaces read as
  connected hull. Threat still separates from teal and rust: the drones read
  against both the teal sky band and the rust deck in `sixface-action--pair`
  and `traversal-action--pair`, and the classic panel beside them is the
  grey-box control.
- [x] **the polyp tell's first ~300ms carries a signal at FAR** — measured
  above, with fresh frames.
- [x] **stale artifacts re-captured or removed** — four directories handled
  (table above). **Five more are stale and were NOT in this lane**: see the
  finding below.
- [x] **I-032 in scope only if T-021 survives** — T-021 is `blocked` awaiting
  the operator, so per the dispatch ruling I-032 is **deferred, moot for now**;
  no fork geometry was touched.

## Findings for the integrator

1. **Seven more artifact directories are grey-box-era and no longer match a
   fresh capture**: `cp3-transform/`, `cp3-transform-v2/`, `cp3-transform-v3/`,
   `g1-limbturn/`, `t009-lattice/`, `t011-juice/`, `shell-v1/`. Measured on one
   frame from each, not guessed: a fixed 400x200 box reads mean hue 211–217°
   at saturation 0.23–0.34, which is exactly what a fresh `?palette=classic`
   frame reads (215° / 0.23), while the shipped concept default reads
   116° / 0.58 in the same box. Each has its own rig
   (`transform-capture.mjs`, `g1-capture.mjs`, …) and its own task's claims
   attached, so refreshing them is a separate task, not this lane's.
2. **The other half of I-010 is untouched**: RIG blinks through his i-frames
   (`src/render/player.js:55`), which is what made the T-008 gate frame contain
   "a white square and no visible player". That file was outside this lane. A
   fresh g2 frame can still hide RIG on the wrong blink phase.
3. **No new pathcheck assertions were added** — `tools/` is lane-fenced this
   cycle. The change adds no new pure function (the tint is one clamped
   expression over the already-asserted `CUE_GAIN`), so nothing new is
   *unasserted logic*, but if the fence lifts, three assertions are worth
   having: tint is exactly 0 at `near` and under `?legibility=0`, tint is
   strictly positive and ≤ `HIT_TINT_FAR` at `far`, and the flash color per
   kind stays strictly less saturated than that kind's own body token.
4. **The capture rig for I-010 is parked in the artifact directory**
   (`artifacts/hitflash-v1/hitflash-capture.mjs`) for the same fence reason.
   It belongs at `tools/playtest/hitflash-capture.mjs` with a README row; it
   writes only into its own artifact directory and uses an ephemeral port.

## Operator questions (feel — not mine to judge)

Serve the worktree on a free port, e.g. `python3 -m http.server 8743` from
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-030`.

Frames to compare first: `artifacts/hitflash-v1/wasp-cruise-hit--far-before--detail.png`
vs `…--far-after--detail.png`, and `…/wasp-dive-hit--far-after--detail.png`.

1. **Hit feedback, FAR.** `http://127.0.0.1:8743/index.html?slice=traversal&view=far`
   against `…&legibility=0` (the old white flash): does a hit still land as
   hard when the flash keeps the acid hue, or did the pop lose its punch?
2. **Divers.** A hit on a *diving* wasp now reads as a wash-out at the same
   brightness rather than a jump to white. Is that legible in play, or does a
   hit on a committed diver now read as "nothing happened"?
3. **The alternative tune.** Driving the flash's emissive softer (0.55) brings
   back the body's facet shading — the flashed drone looks like a lit diamond
   instead of a flat one — but it measured the same saturation as the dive
   glow (0.46), i.e. it trades hit/commitment separation for shape. Worth it?
4. **The polyp's first beat (I-003).** `http://127.0.0.1:8743/index.html?slice=traversal&polyp=1&view=far`
   — at 42ms into the tell the lamp is 213px of warm amber where the pre-pass
   had none. Does the opening of the reaction window now feel warned, or still
   dead?
5. **Enemy intensity against boards 01/10.** `artifacts/palette-v1/sixface-action--pair.png`
   and `traversal-action--pair.png`: do the hostiles reach the boards' acid
   intensity at FAR now, or do they still sit under it?

## Single best next action

Gate this branch (reviewer + playtester), then file the artifact-freshness
sweep from finding 1 as its own task — seven directories of grey-box evidence
are quietly telling every future reader the game is grey.
