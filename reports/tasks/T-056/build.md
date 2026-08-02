# T-056 — one haze band, not two lanes' intent

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-056`,
branch `task/T-056`, cut from main at `71f3062` (T-054 merged).

**What shipped: `task/T-035b`'s reconciliation (band = T-045's), re-verified
on the current tree rather than inherited.** `CONFIG.limb.shadeFog` is
deleted, `src/render/camera.js` is one expression again
(`const F = IS_G1 ? CONFIG.limb.fog : CONFIG.fog;`), and
`tools/pathcheck/t-035-value-ladder.mjs`'s S2 block is replaced with the
version that asserts against the live band instead of a dead one. This is
the same code T-035b (`204075b`, unmerged) proposed; every number below was
re-measured on this tree, not copied from that branch's report.

## Why re-measure instead of inherit

T-035b was cut before T-052 (hull tiling), T-053 (finish pass) and T-054
(hull-texture reads) landed — all three change what the frame's pixels look
like. The team lead's brief was explicit that its numbers should not be
assumed to still hold. They mostly do, but not for the reason I expected
going in, and that's worth stating plainly (see "What did NOT reproduce
cleanly" below).

## The mechanism, re-derived directly (not from a screenshot)

The actual claim under all of this is geometric: three.js fogs on view-space
depth, camera.js shifts the band by `cameraDepth - camera.z`, and a backdrop
piece's fog factor is `(|depth| + camera.z - band.near) / (band.far -
band.near)`. None of `CONFIG.limb.fog`, `CONFIG.limb.shadeFog`,
`CONFIG.limb.backdrop`, `CONFIG.camera`, or `CONFIG.viewScales` moved since
T-035b — confirmed by diff — so I recomputed T-035b's central numbers
straight from current `CONFIG`, no browser involved:

| tier (depth) | f(limb.fog) | f(shadeFog) | delta | own-contrast under limb.fog / shadeFog |
|---|---|---|---|---|
| sister (-14) | 0.4261 | 0.3368 | 0.0893 | 57.4% / 66.3% |
| spine (-19) | 0.5996 | 0.5103 | 0.0893 | 40.0% / 49.0% |
| far body (-24) | 0.7749 | 0.6856 | 0.0893 | 22.5% / 31.4% |

Exactly reproduces T-035b's claim ("each tier drops ~0.09", "far body 31%
under the shift instead of ~20%") to four decimal places — the shift is a
uniform 0.0893 subtraction at every tier, because the two bands are the same
width (28) and differ only in the near/far shift. The LIMIT it recorded is
equally exact on this tree:

| band | worst play-band screen-edge haze (any shipped view) |
|---|---|
| `limb.fog` | **4.60%** at `?view=near`, 3.31% at FAR (matches "3.3% / 4.6%" exactly) |
| `shadeFog` | 0.00% at every view |

This is the load-bearing evidence for the decision, and it doesn't depend on
a bot run, a screenshot, or anything T-052/053/054 could have moved.

## The screenshot re-verification (three variants, current tree)

Captured with `tools/playtest/fogband-capture.mjs` (new, dev-only —
committed under `tools/playtest/`), which drives the judged
`six-face-spaced-run.json` policy for 10 s wall-clock at 1280×800, FAR
default, and measures the playfield crop (rows 12–88%) by the same
rust/teal role split (`r>g>b` / `g>r && b>r`) `artifacts/shade-v1/README.md`
and T-035b both used. **Honesty note: this is a fresh implementation of that
method, not a replay of either report's original script — neither committed
the tool that produced its numbers.** Three variants, same run, same
moment (scrollX 43.7–44.1, none died before 10 s):

| variant | separation (whole playfield) | p5 | share<L25.5 | rust med / teal med |
|---|---|---|---|---|
| shipped today (`shadeFog`, shifted) | 11.8 | 9.3 | 15.00% | 47.78 / 59.63 |
| **T-045's band (`limb.fog`)** | 14.7 | 9.3 | 14.01% | 47.78 / 62.49 |
| approved reference (`?scale=0`) | 30.7 | 9.3 | 14.65% | 47.57 / 78.29 |

**These whole-playfield numbers do not reproduce T-035b's magnitudes, and I
am not claiming they do.** p5 is identical (9.3) across all three variants —
a tell that something other than the fog band now dominates the darkest 5%
of the WHOLE crop. Restricting to the upper 45% of frame (the
`scale-capture.mjs` convention, where the backdrop tiers actually sit)
recovers the same ordering T-035b reported:

| variant | sky-band(0–45%) p5 | share<L25.5 |
|---|---|---|
| shipped (shifted) | 27.5 | **3.41%** |
| T-045's band | 34.8 | **2.08%** |
| approved reference | 34.9 | 2.76% |

Shipped is the darkest of the three and T-045's band tracks the approved
reference closely (34.8 vs 34.9), while shipped diverges (27.5) — the same
direction and the same relative ordering T-035b found (shipped worst, T-045's
band and the approved reference close together and both better), even
though the absolute numbers differ. **My diagnosis for why the
whole-playfield tail statistic no longer discriminates:** T-052/T-053/T-054
added real dark detail (grout, contact shadows, weld seams) to near-field
hull surfaces that didn't exist when T-035b measured this — a run of ~28k
pixels at luminance 8–9 in the *whole* crop, common to all three variants,
now swamps a metric that used to be dominated by the backdrop's own value.
That is a tail-statistic artifact of unrelated lanes, not evidence against
the fog-band conclusion — the direct fog-factor computation above is
unaffected by it and is what the decision actually rests on.

Evidence: `reports/tasks/T-056/evidence/before-shadeFog-shipped-today.png`,
`after-limbFog-what-now-ships.png` (identical run/position, one code line
apart — `after` IS what the default URL now renders), `approved.png`
(`?scale=0`), `capture-report.json`.

## What did NOT change

- **`CONFIG.shade.dose = 0.5`** — untouched. Confirmed by diff; the value
  ladder itself (`src/pure/shade.js`, `src/render/limb.js`, `level.js`) is
  untouched by this diff, full stop.
- **Static bakes.** No file that produces baked geometry or instance colors
  (`src/render/limb.js`, `level.js`, `materials.js`, `contact.js`,
  `seams.js`, `bullets.js`, `fx.js`, `src/pure/limb.js`, `src/pure/shade.js`)
  is touched by this diff, and none of them ever referenced
  `CONFIG.limb.shadeFog` (confirmed by a repo-wide grep before removing it).
  Per the lane brief's per-mesh-not-whole-scene caution (T-039's dynamic
  contact-shadow pool broke the old whole-scene-hash method), I verified this
  the more precise way available here: called `limbBakePlan`, `limbShadePlan`
  and `deckShadePlan` — the pure, deterministic plan builders every
  InstancedMesh is built from — directly in Node on this branch and on the
  merge-base (`71f3062`) in a scratch worktree, hashed the plan, the shade
  multipliers and the deck shade per material-bucket (`kind`) and as a whole.
  **Byte-identical in every bucket, both trees.** This is a stronger claim
  than a live-scene screenshot hash (exact SHA-256 over the actual data
  structures every mesh is built from, not an approximate render), and it
  needed no browser.
- **Draw calls / instance counts.** Not independently profiled this run —
  they follow deterministically from the plan proven byte-identical above
  (materials.size, InstancedMesh count and per-bucket instance count are all
  pure functions of the plan), so a delta is structurally impossible. Spot
  check: 1633 limb pieces / 183 draw calls per frame on this tree at
  `?testapi=1`, matching T-045's own recorded piece count.
- Palette tokens, layer purity, frozen `CONFIG` movement constants, static
  anatomy, frozen FAR camera — all unchanged, all law, none touched.

## What changed

- `src/config.js`: `CONFIG.limb.shadeFog` deleted (not left inert), replaced
  with a comment block recording the reconciliation and the LIMIT.
- `src/render/camera.js`: the `SHADE_GAIN` import and conditional are gone;
  `calibrateEdges()` selects `CONFIG.limb.fog` unconditionally under `IS_G1`.
  **This retires the out-of-fence line the integrator granted T-035** — the
  file now reads nothing from the value ladder at all, so a future dose
  change cannot move T-045's tiers as a side effect. Per the brief: say so
  plainly — done.
- `tools/pathcheck/t-035-value-ladder.mjs`: the S2 block now asserts against
  the live band. Label reconciliation vs `main` (`tools/pathcheck-labels.mjs`,
  full ordered-label diff, not just a count): **8 removed, 7 added, all 15
  are `T-035/S2` labels — no other lane's assertion moved** (verified by
  literal `comm` diff of the two label sets, not by trusting the count).
- **A side effect worth recording, not claimed as a fix in itself**:
  `window.HB.g1.fog` (`src/main.js`, not touched — outside this diff's file
  list) hard-reads `CONFIG.limb.fog` and was flagged by T-035's own report as
  under-reporting once the shift shipped. It is no longer wrong: the debug
  handle and the renderer now agree by construction, because there is only
  one band.
- New: `tools/playtest/fogband-capture.mjs` (dev-only evidence rig, same
  shape as `scale-capture.mjs`/`backdrop-capture.mjs`). It also documents in
  its own header how it gets the "T-045 band" variant on an otherwise
  unpatched tree (a scripted, always-restored temporary edit of
  `camera.js`'s one fog-select line) — this is the same mechanism used to
  produce the `approved`/`before`/`after` triple above.

## Verification — every command and its result

| check | result |
|---|---|
| `node tools/pathcheck.mjs` | **3194 passed, 0 failed** (main/merge-base 3195) |
| Label reconciliation vs `main` (`tools/pathcheck-labels.mjs` + `comm`) | 8 removed / 7 added, all `T-035/S2`, no other lane's label moved |
| Break test 1: re-add `shadeFog` to config | `T-035/S2: there is ONE haze band…` goes **FAIL**, restored to green |
| Break test 2: restore camera.js's `SHADE_GAIN` conditional | both "selects the limb band unconditionally" and "reads nothing from the ladder" assertions go **FAIL**, restored to green |
| Break test 3: shift `CONFIG.limb.fog` to `{20,48}` | 6 assertions go **FAIL** (the pin, the tier-fence, the LIMIT cap, and — usefully — T-045's/T-051's *own* independent backdrop-tier assertions, proving they're wired to the same live band), restored to green |
| `git status --short` after every break/restore | clean, confirmed each time |
| `?selftest=1` / `&shade=0` / `&shade=1` / `&scale=0` / `&palette=classic` / `&g1=1` / `&view=near` / `&view=mid` | PASS (39 checks each) |
| `?selftest=1&slice=traversal` | PASS (41 checks) |
| Plan/shade fingerprint (this branch vs merge-base `71f3062`, per-`kind`-bucket SHA-256 over `limbBakePlan`+`limbShadePlan`+`deckShadePlan`) | **identical in every bucket** |
| Draw calls / instance count spot check | 1633 pieces, 183 draw calls/frame |

## The recorded LIMIT (carried forward, not fixed)

At the band this task ships, the protected play band's screen-edge column
carries **3.31% haze at FAR / 4.60% at `?view=near`** (0.00% under the old
shifted band). A hostile at the extreme frame edge is washed that far toward
the backdrop. Fixing it means re-deriving T-045's three tier depths against a
wider band — that lane's calibration to redo, not this task's. Asserted as a
LIMIT in `tools/pathcheck/t-035-value-ladder.mjs` rather than hidden.

## What is NOT true any more, and needs no further action

`docs/decisions.md` entry 14 (`shade.dose = 0.5`) does not move — this task
does not touch the value ladder. The only thing that changed is which fog
CONFIG the renderer's atmosphere reads; RIG, the deck, and every baked
instance are pixel-for-pixel what they were before this branch (proven
above, not asserted).

## Open feel questions for the operator

Screenshots: `reports/tasks/T-056/evidence/before-shadeFog-shipped-today.png`
(today's shipped look) vs `after-limbFog-what-now-ships.png` (what this task
makes default) — same run, same moment, one fog-band constant apart. URL to
look at it live: `http://127.0.0.1:8749/index.html` on this worktree served
via `node tools/serve.mjs 8749 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-056` (8741/8742
are reserved for the operator and were not touched).

1. Does the backdrop (sister limb / spine drums / far body silhouette) read
   as more or less distant now that it's slightly less hazed than today's
   shipped build?
2. Is the haze itself — the air between RIG and the wall — noticeably
   thinner now that the band starts 2.5 tiles closer to camera?
3. The recorded LIMIT: a hostile at the extreme edge of the frame is washed
   up to 4.6% toward the backdrop at `?view=near` (0% today). Worth chasing,
   or leave it for whenever T-045's tiers get re-derived against a wider
   band?

No verdict is claimed here — these are measurements and a question set, not
a judgment.

## Single best next action

Merge this before any further look-direction work calibrates against the
frame — `?view=`, `?scale=`, and T-045's own three tiers are all now measured
against the band the renderer actually uses instead of a band it silently
ignored.
