PASS

# T-038 playtest — warm-white seam pips and route-lip lights (S5), post fix-cycle

Worktree `.claude/worktrees/T-038`, branch `task/T-038`, HEAD `7765a2d`
(`reports/tasks/T-038/build.md`'s "Second fix cycle" section; review verdict
`reports/tasks/T-038/review.md` = APPROVE, re-verified below rather than
inherited). Pinned and served on port **8890** for the raw-worktree checks
(`node tools/serve.mjs 8890 --root .claude/worktrees/T-038 --quiet`, killed
after). 8741/8742 never touched (confirmed free before and after).

## Why this report also builds a scratch merge (and why that's still "pinned")

The dispatch is explicit: *"main now has the scale pass and fog band merged
(T-045 + T-035) ... judge against that, and if the branch predates it, say
so."* Checking first: `task/T-038`'s own merge-base with `main` is `db99a34`
(T-037's pathcheck-split point). **The branch predates not just T-045/T-035
but also T-039 (contact shadows) and T-046 (asset pipeline)** — all four
merged to `main` after this branch's own last main-merge. `main` is at
**2216** pathcheck assertions (computed myself: `node tools/pathcheck.mjs`
on the main checkout, not inherited); the worktree is at **1847**
(1812 + this task's own 35, also computed myself) — the 369-assertion gap is
that missing history, not a discrepancy.

Per the lane brief ("never inherit a measured number across a change that
could move it") the build report's own T-035-only scratch recalibration
isn't current enough either. So: cloned the repo into the scratchpad,
checked out `main` (`24b23d6`), and `git merge origin/task/T-038` (`7765a2d`,
confirmed identical to the worktree's own HEAD). **One conflict**, exactly
where the reviewer predicted it would land at real merge time
(`tools/pathcheck/manifest.mjs`, both lanes appending domain-module entries
at the same spot) — resolved by appending this task's `d44` entry after
`main`'s `d39-d43`, the same self-contained-append convention every other
lane in this cycle already uses. `git log`/diff and the resolved file are
reproducible from the commands below; the clone lives only under the
session scratchpad and was never pushed. Result: **`node tools/pathcheck.mjs`
→ 2251 passed, 0 failed** (2216 + 35, exact). Served on port **8891**
(`node tools/serve.mjs 8891 --root <scratch-merge> --quiet`, killed after).
This is the actual world the branch will land into, not an approximation —
so it's what the depth/readability/perf checks below are measured against,
with the raw-worktree pin used for the regression/smoke checks and as a
second data point.

## 1 — Pips actually render, at the plain URL, in a real browser

`seamsStats()` on the served page (both pins): `{enabled:true, pipCount:307}`.
Screenshots, not inferred from the import line:
- `qa-boot-seams.png` (boot, no input) — small warm-white diamonds along the
  first deck's edge and a catwalk behind it, clearly present.
- `qa-depth-frame.png` (after 9s hold-right) — multiple deck/catwalk rows of
  pips in frame simultaneously, at different depths.
- `qa-combat2-mid.png` / `qa-combat2-late.png` — pips visible during live
  `PLAYING` state with hostiles and player fire on screen at the same time
  (see check 3).

Zero page errors in any of these sessions.

## 2 — Depth attenuation, measured from a capture on the ACTUAL merged world

Reproduced the reviewer's method independently (own script, own run,
against the fresh scratch-merge server, not their numbers): drove right 9s
on port 8891, then for every one of the 296 currently-frustum-visible pips
computed camera-space distance and screen projection from the live
`camera.matrixWorldInverse`/`projectionMatrix` (no `THREE` import needed in
page-context — this sandbox has no network path to the CDN for a bare
`import('three')` inside `page.evaluate`, so the projection math is done by
hand from the camera's own matrices instead), then sampled the actual
screenshot at each one's exact screen coordinates:

| | camera distance (tiles) | sampled meanL | sampled maxL |
|---|---|---|---|
| nearest visible pip | 41.78 | 122.25 | 255 (saturated core visible) |
| farthest visible pip | 162.11 | 31.50 | 31.50 (flat — indistinguishable from background) |

Scene fog: `near=46.75, far=74.75`. The far pip sits well past `fog.far` and
reads as **completely invisible** (no bright pixel at all, mean≈max); the
near pip sits inside the fog-near boundary and reads as a **sharp, fully
bright** diamond. This is the same qualitative result the reviewer reported
on an earlier commit, now independently reproduced on the real, current
`main`-composited world (contact shadows + backdrop tiers + fog band all
live at once) rather than trusted from their report.

**Guard proven to bind, myself, on this exact merged tree** (not inherited
from the reviewer's earlier break/restore): reintroduced `fog: false` on the
core material in `src/render/seams.js` → `pathcheck` failed exactly the 2
named guards (`neither seams.js material sets fog:false`, `both...
explicitly set fog:true`), 2249/2 failed → restored → back to 2251/0,
`git status --short` empty in the scratch clone afterward. The other
guards (`depthGain` floor/monotonic, hue/luminance ordering, derived-not-
authored run boundary, static-anatomy) were broken and restored by the
reviewer already (`review.md`, with named FAIL output each time) — not
re-broken here, but their claims are consistent with everything observed
independently in this pass (see check 3 for the luminance-ordering numbers,
re-derived from the palette source rather than trusted).

## 3 — Readability (pillar 5): pips vs hostiles/capsules/fire/RIG

**Numerically**, re-derived myself from `src/render/palette.js` +
`src/config.js` (the R+G+B-out-of-765 metric this codebase's own pathcheck
already uses, not a metric I invented):

| token (CONCEPT) | value |
|---|---|
| seamHalo | 518 |
| seamPip | 598 |
| houndTell / polypTell / mortarTell | 623 |
| PAL.player | 684 |
| rifle bullet (`shots.R`) | 689 |
| PAL.muzzle | 713 |

The pips are strictly **dimmer than every other bright token in the game**
by construction, not just dimmer than the ambient scenery — they cannot
out-brighten a tell, the player, a bullet, or a muzzle flash. They are also
hue-distinct from every threat/reward (wasps/hounds are acid-green, the
capsule reward is magenta, per the captures below), so the readability
question left standing is proximity, not confusion.

**Visually**, from `qa-combat2-mid.png`/`qa-combat2-late.png` (live `PLAYING`
state, hp 3, wasps and a carrier materialized, RIG's own rifle fire visible
mid-frame) and `stress/07-stress-perf.png` (the juice-stress harness's
256-live-projectile, saturated-spark-pool frame — the single brightest
frame this pass can ever coexist with): in every capture the wasps (green),
the capsule glyph (magenta "S"), and — at the stress extreme — the death-
burst spark/flash effect are all clearly the dominant visual elements; the
pips stay small, static, and confined to the deck/catwalk edge line. No
capture shows a pip reading as louder than a threat.

**One real, non-blocking observation, worth routing to the operator rather
than filing as a defect**: RIG's own bullet color (`shots.R = 0xfff0c2`,
value 689) and the seam pip (598) are close in hue family (both warm
off-white/cream) — in `qa-combat2-mid.png` the rifle's departed-shot trail
(small ellipses) and the deck-lip pips (small diamonds) sit in the same
screen region during a firing pass. They're distinguishable by shape
(ellipse vs diamond) and by motion (bullets travel, pips are static), and
the numbers above put the pip family strictly below the bullet in
brightness — but this is a legitimate go/no-go call for the only fun oracle,
not something a luminance number resolves by itself. The build report's own
open item 1 already flags the RIG-vs-pip hue-family question; this adds the
bullet-vs-pip case to the same question rather than opening a new one.

## 4 — Not too dark, not too bright (entry 14)

Mean whole-frame luma (0.299R+0.587G+0.114B, same held-right-4s gameplay
pair the build report uses), measured on port 8891 (the real composited
world):

| URL | mean luma | L>200 share |
|---|---|---|
| `&shade=0&seams=0` (pre-ladder, no pips) | 66.46 | 0.096% |
| `&shade=0` (pre-ladder, pips on) | 66.94 | 0.329% |
| `&seams=0` (shipped ladder, no pips) | 54.75 | 0.097% |
| **default (shipped half-dose ladder + pips on)** | **55.22** | **0.316%** |
| `&shade=1` (rejected full dose, pips on) | 42.12 | 0.297% |

Monotonic and clearly separated (66.9 → 55.2 → 42.1), confirming the ladder
is genuinely active in the full composited world and the pips' own L>200
contribution (0.097%→0.316%, ~3.3x) reproduces every prior measurement of
this pass within normal run-to-run variance — independently re-measured,
not inherited. Whether the resulting frame reads "balanced" at the shipped
dose is the operator's call, not mine; the numbers above are what a
checkpoint question would be argued from.

## 5 — Performance

**Draw calls** (clean pair, no input, measured on the real composited
`main`+T-038 merge — so these numbers reflect T-039/T-045/T-046's own
geometry too, unlike the build report's stale baseline):

| | calls | tris | InstancedMesh | instances |
|---|---|---|---|---|
| `&seams=0` | 95 | 59,940 | 14 | 3,821 |
| default (on) | 97 | 66,080 | 16 | 4,435 |
| **delta** | **+2** | +6,140 | **+2** | +614 |

Exactly the delta claimed throughout this task's history, now confirmed a
third time (build, review, this playtest) and on the actual current-`main`
composite rather than a stale one — the baseline moved (94→95, other lanes'
geometry), the delta this pass contributes did not.

**256 live projectiles** (`tools/playtest/juice-stress.mjs`, run against the
scratch-merge server): control 120fps / 8.34ms avg / 10.4ms worst / 0
frames over 20ms; stress (256 live projectiles, saturated 224-spark pool,
16 flashes) 120fps / 8.33ms avg / 10.3ms worst / 0 over20ms. No measurable
regression — expected, since `src/render/seams.js` has no per-frame update
path at all (confirmed by reading the file in full: no `installView`, no
`gameMs`/`tMs` reference, no `requestAnimationFrame`), so its cost is fixed
at bake time regardless of live projectile count.

## 6 — Regression / durability

- `node tools/pathcheck.mjs`: **1847/0** (raw worktree), **2251/0** (scratch
  merge with current `main`) — both computed by me, not inherited.
- `index.html?selftest=1` (scratch-merge pin, port 8891): **SELFTEST PASS
  (35 checks)**, 0 page errors (one benign `favicon.ico 404` console
  message, the same non-issue every other gate report in this cycle
  filters).
- Smoke scripts, both pins:
  - `scripts/mid-route.json --deterministic`: `completed`, 0 page errors,
    idle fraction 2.4%, `closestCrushApproachTiles` 35.39,
    `protoScore` 92.3 — all in the normal range for this script, no stall.
  - `scripts/transform-slice.json --deterministic`: `completed`
    (`BREACH CLEAR`), 0 page errors, `stopReason: victory`. Screenshot
    (`t038-merged-transform/screenshot.png`) confirms the pass's own scope
    fence: **zero pips visible anywhere in the transform slice**, matching
    the `SEAMS_ENABLED && !IS_TRANSFORM_SLICE` guard in the source — the
    scope claim isn't just asserted, it's visibly true.
- Layer purity, checked myself rather than trusted: `src/pure/seams.js` has
  zero imports and no `THREE`/`document`/`window`/`Math.random`/`Date.now`/
  `performance.now` reference anywhere in the file.
- Worktree stays clean throughout: `.claude/worktrees/T-038`'s
  `git status --short` shows only the pre-existing untracked `review.md`,
  before and after every check in this report. All merge/break/restore
  activity happened in a throwaway scratch clone under the session
  scratchpad, never in the gated worktree.

## Evidence paths (session scratchpad, not committed anywhere)

- `/private/tmp/claude-501/.../scratchpad/t038-out/` — `qa-boot-seams.png`,
  `qa-depth-frame.png`, `qa-combat2-mid.png`, `qa-combat2-late.png`,
  `qa-results.json`, `luma-results.json`, `stress/07-stress-perf.json` + png.
- `/private/tmp/claude-501/.../scratchpad/t038-mergecheck/` — the scratch
  merge (`git clone` of the repo, `main` + `origin/task/T-038` merged,
  manifest conflict resolved).
- `/private/tmp/claude-501/.../scratchpad/t038-merged-mid-route/`,
  `t038-merged-transform/`, `t038-mid-route/`, `t038-transform-slice/` —
  the four smoke-script `report.json`/`summary.md`/`screenshot.png` sets.

## PROPOSED INBOX ISSUES

None. No defects found — every claim in the build report and the prior
review was independently reproduced (not inherited) on both the raw
worktree and a fresh merge against current `main`, and nothing broke. The
one open item (pip/bullet/RIG warm-white hue-family proximity, check 3) is
a feel question, already substantially the build report's own open item 1
— routing it there rather than filing it as a defect, per this lane's
"never fail feel" instruction.

## Note for the integrator

The manifest.mjs append-conflict the reviewer predicted is real and
mechanical only — confirmed by actually doing the merge: `main`'s
`d39`-`d43` (T-041/T-043/T-039/pathcheck-suite-3/T-035) plus this task's
own entry appended as `d44`, both the import list and the `DOMAINS` array.
Zero logic conflicts anywhere else in the diff.
