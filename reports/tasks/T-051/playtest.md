FAIL

# T-051 — backdrop layers: playtest gate

Worktree pinned: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-051`,
branch `task/T-051`, HEAD `32ca489` (matches dispatch; `git status --short` was
clean before I touched anything, and I never edited the worktree). Served a
scratch archive, never the live worktree:

```sh
git -C .claude/worktrees/T-051 archive HEAD | tar -x -C /tmp/hb-t051-pin
node tools/serve.mjs 8761 --root /tmp/hb-t051-pin --quiet   # port 8761, mine; never 8741/8742
```

All commands below ran against `http://127.0.0.1:8761` (or the harness's own
ephemeral server for the two dev tools that spin up their own). Port 8761
killed at the end of this session.

## Verdict, in one paragraph

Durability, the asset-failure path, and perf all PASS, independently
re-measured, not inherited. The gate fails on the build's own acceptance box:
**"far edge dissolves into the fog color, proven by capture" is false, and I
have the capture.** At the exact spot the team lead flagged (~x=810,y=205 in a
1280x720 capture, the 17m marker) there is a one-pixel-wide, zero-gradient
color step from the plate's own tone straight to the flat sky color — not a
dissolve. It is not a one-frame accident: it reproduces at three other scroll
positions and under `?palette=classic`, and I traced it to a real, checkable
cause below rather than just eyeballing it. Per the assignment ("this IS yours
to judge"), a hard-edged rectangle sitting in the sky is a readability/fidelity
miss against the concept-art invariant of connected-hull surfaces, independent
of any "does it look nice" opinion I'm not offering.

## Note on timing — the branch moved during this gate

I pinned and gated exactly `32ca489` as dispatched, in an archived scratch
copy, per instructions ("never test a moving tree"). Partway through my
session I found `reports/tasks/T-051/review.md` had landed in the main
checkout (commit `083edc1`): the reviewer independently reached the same
core finding — REQUEST_CHANGES on the exact same acceptance-box line, with
their own root-cause trace (PIL alpha measurement on
`backdrop-limb-segment.png`: ~99.5% pure 0/255, ~0.48% partial/AA). My
finding (§4 below) was already fully independent by the time I read theirs —
same conclusion, different evidence (pixel-scan of a live capture plus a
direct PIL check of both `backdrop-limb-segment.png` *and*
`backdrop-crown-horizon.png`, plus the fog-fraction arithmetic) — and I
extend theirs with recurrence at 3 more scroll positions and under
`?palette=classic`. I also found the worktree's `HEAD` has since moved to
`5c030fc` ("T-051 fix: move backdrop depths behind the nearest existing box
tile") and that `SPRINT.md`'s new operator-checkpoint entry ("backdrop depth:
visible-but-seamed, or clean-but-buried?") frames the *remaining* depth
tradeoff as a feel question with no machine answer, explicitly not blocking.
**That checkpoint is about the commit after mine** — it exists because the
depth-shuffle fix hides the seam by occluding the plate behind existing box
geometry, which is a different, later question than "does 32ca489 meet its
own acceptance box." At `32ca489`, the box's claim is falsified, plainly and
reproducibly, which is what this verdict is about. A fresh gate against
whatever commit carries T-053's real fix (feathered alpha, per I-044) is a
separate cycle. Flagging this to the team lead alongside this report rather
than silently re-gating a commit I wasn't asked to test.

## 1. Durability — PASS

- `node tools/pathcheck.mjs` against the pinned copy: **3024 passed, 0
  failed** — matches `reports/tasks/T-051/build.md`'s own claim, reproduced
  independently rather than trusted.
- Smoke set, both `--deterministic`, both against the pinned server:
  - `scripts/mid-route.json` → `completed`, `testapi` fidelity, 0 deaths, 0
    `pageErrors`, `bootError: null`.
  - `scripts/transform-slice.json` (`?slice=transform`, where the backdrop is
    inert by design) → `completed`, 0 `pageErrors`, `bootError: null`.
- Default six-face run, both variants, `scripts/six-face-spaced-run.json
  --deterministic --stop-on-game-over --max-runtime-ms 90000`: default
  (backdrop on) and `?backdrop=flat`, one run each — both `pageErrors: []`,
  `bootError: null`, `stopReason: game-over`. Neither wedged, crashed, or lost
  a save. Summaries: `evidence/run-summaries/sixface-default.summary.md`,
  `sixface-flat.summary.md`.
- Six faces: I could only drive RIG through facets 1–2 (scroll 0–~140) with
  any policy this repo ships — same ceiling `build.md` reports and the same
  one `docs/playtests/2026-08-victory-box.md` documents repo-wide (wave gate
  2, scroll 140/415, every policy tried). I also tried `?enemies=0` to bypass
  combat and reach facets 3–6 for a look-only check; it does **not** take
  effect on the default six-face run (SPRINT I-026 — the flag is fixture-only)
  — confirmed again here, still live 8 hostile rows on 507/507 ticks. Facets
  3–6's backdrop placements are therefore **unverified in live play by
  anyone**, same as `build.md` states; not a new hole this task opened, and
  not something either of us can currently close without either a better bot
  policy or a human playtester. Pathcheck's own arithmetic re-derivation
  covers all 12 placements including 3–6 (play-band clearance, sizing, fog
  ladder), so the *numbers* are checked; the *look* isn't.

## 2. Asset-failure path (entry 16's binding condition) — PASS

Three independent break tests via Playwright route interception on
`backdrop-crown-horizon.png` (used at faces 1/4/6), each against a fresh
browser context on the pinned server:

| mode | what I did | boot | result |
|---|---|---|---|
| 404 | `route.fulfill({status:404})` | 398ms to PLAYING | 3 `crownHorizon` slots → `failed`, error `"error"`; other 4 plates `ready`; `pageErrors: []`; `#fail` panel `display:none` |
| slow | delayed response 4000ms (> the 2500ms `PRELOAD_BUDGET_MS`) | 4249ms to PLAYING | 3 slots → `failed`, error `"still loading after 2518ms of the 2500ms boot budget"`; `pageErrors: []`; panel stayed hidden |
| malformed | `route.fulfill({status:200, contentType:'image/png', body: <garbage bytes>})` | 345ms to PLAYING | 3 slots → `failed`, error `"error"`; `pageErrors: []`; panel stayed hidden |

In every case: boot completed well inside the T-032 10s watchdog, the
existing flat/limb background stayed up for the affected slots, the other 9
plates loaded normally, and gameplay proceeded — holding right for 3s after
boot advanced `scrollX` by 12–13 tiles in all three modes (baseline shape,
`state: PLAYING` throughout). No thrown errors, no failure panel, no branch a
player could feel. Raw results: `evidence/run-summaries/assetfail-404.result.json`,
`assetfail-slow.result.json`, `assetfail-malformed.result.json`. Screenshots
`evidence/qa-07/08/09-assetfail-*.png` — nothing looks broken (no black hole,
no stretched geometry) in any of the three.

Repro (needs a small route-interception harness; not committed — describe on
request, or see the exact intercept regex/fulfill bodies in the result JSONs'
implied setup): point Playwright at the pinned server, route
`**/*backdrop-crown-horizon.png`, apply one of the three fulfills above,
navigate to `?testapi=1`, wait for `HB.state()==='PLAYING'`.

## 3. Perf — PASS, re-measured independently

Ran the builder's own `tools/playtest/backdrop-stress.mjs` from the pinned
copy (own ephemeral server, 60 projectiles/frame via `fireWeapon('S',
clone=true)`, right held, 3 repeats/variant, 1280x800 headless Chrome):

```
flat      worstMs [10.30, 10.30, 10.30]  over20ms [0, 0, 0]  drawCalls [150, 150, 149]
backdrop  worstMs [10.70, 10.30, 10.30]  over20ms [0, 0, 0]  drawCalls [174, 174, 174]
```

Matches `build.md`'s own table closely (10.30–10.40 there vs 10.30–10.70
here — both inside noise, both nowhere near 16.7ms/20ms). `over20ms` is zero
on both sides at 256 live projectiles (above the 200+ bar). Full data:
`evidence/run-summaries/backdrop-stress-qa.result.json`.

Texture memory / draw calls at rest (no stress load, `renderer.info`,
T-047's caveat restated — this counts GPU-tracked object counts, not raw
VRAM bytes):

| | flat | backdrop | delta |
|---|---|---|---|
| draw calls | 142 | 166 | +24 (matches build.md's "+24 for the 12 quads") |
| textures | 25 | 30 | +5 (5 unique plates, shared preload gate de-dupes by URL) |
| geometries | 63 | 75 | +12 (the 12 quads) |

## 4. Readability / occlusion — mostly PASS, with the one confirmed defect above

Captured `?testapi=1` vs `?testapi=1&backdrop=flat` at matched `scrollX`
(8/12/15/17/20/25/30/40, hold-right only, both variants) plus reviewed the
committed `build.md` evidence (facets 1–2, `six-face-spaced-run` policy). In
every capture, every backdrop plate sits entirely above
`CONFIG.limb.playBand.y1` — no plate ever overlaps a platform, ladder, deck
line, capsule, or hostile in any frame I looked at, on either palette. The
play-band clearance fence pathcheck asserts is visually true, not just
arithmetically true.

**The confirmed defect** (`evidence/qa-01..06`, `qa-10`): at the 17m marker,
scanning `y=205` from `x=795` to `x=830` on the default build, color is a flat
`(49,87,95)` through `x=813`, then jumps straight to `(13,48,43)` at
`x=815` — one column, no intermediate value, no anti-aliasing. Same shape at
`sx=25` and `sx=40` (`qa-05`, `qa-06`), and under `?palette=classic`
(`qa-10`) — not a one-off. `qa-03` is a 3x crop of the exact region, `qa-04`
a wider 2x context crop showing the whole plate is a straight-edged rotated
rectangle sitting on top of the pre-existing box-tier geometry, not something
blending into it.

I traced this rather than just reporting the pixels. Reading the source art
directly (`assets/generated/backdrops/`, read-only — I did not touch these
files):
- `backdrop-limb-segment.png` (the near-tier plate visible in every capture
  above — large, warm-tinted, `depth: -13`) carries a **binary** alpha mask:
  every sampled texel is 0 or 255, no intermediate value in an 8x8 coarse
  scan. It has a real cutout shape, but the cutout's own edge is
  hard/unfeathered in the source art.
- `backdrop-crown-horizon.png` (the far-tier plate at the same facet) is
  **fully opaque** everywhere sampled — no alpha cutout at all, just a plain
  rectangle.
- `backdrop.js`'s material sets `fog: true`, which blends **color** toward
  `scene.fog.color` by distance — it does nothing to an alpha edge's spatial
  sharpness. So neither plate's edge was ever going to soften on its own:
  the opaque one has no edge to soften, and the cutout one's edge is exactly
  as hard as the PNG's own mask.
- Independently, `BACKDROP_TUNE`'s own numbers (re-derived via
  `backdrop-table.js`'s `fogFraction`, matching pathcheck's own computation)
  show the near/mid/far tiers land at fog fractions 0.411/0.589/0.768 under
  the shipped G1 config — all **partial by design** (pathcheck asserts
  exactly this: "none is fully clamped to background"). So even a feathered
  edge would still land short of matching the flat, fully-fogged sky exactly
  at these depths under the current tuning.

I'm not assigning this to one lane's fence over the other — it's the
material choice (color-only fog, no edge falloff) and the tuning (partial
haze by design) compounding with the source art (a hard or absent alpha
cutout) at once, and any of the three could close the gap. What I can state
plainly: the acceptance box's specific, capture-gated claim is false as
shipped, confirmed independently and reproducibly, not inherited from the
team lead's observation.

## 5. Secondary finding — asset load measurably perturbs an open-loop script's exact path (fairness/evidence-integrity, not a play-breaking bug)

Not asked for directly, but surfaced while trying to verify "gameplay must
not change," so reporting it. `scripts/mid-route.json --deterministic`, 3
runs on the shipped default vs 3 on `?backdrop=flat` (same pinned server):

| | route | matchedRouteId | linksApprox | protoScore | finalX | closestCrush |
|---|---|---|---|---|---|---|
| default #1/#2/#3 | — | mid-catwalk (x3) | 1/1/1 | 87.5/86.4/87.8 | 72.04/72.04/72.07 | 35.39/35.27/35.21 |
| `backdrop=flat` #1/#2/#3 | — | upper-chimney, recovery-scramble x2 | 3/4/4 | 147.6/143.5/145.2 | 72.03/72.06/72.05 | 34.72/35.40/35.41 |

Final x and closest-crush-approach are effectively identical across all six
runs (well inside this script's own documented run-to-run spread), but the
route matcher's best guess and `protoScore` cluster tightly on **each side**
and separate cleanly **between** sides (3/3 vs 3/3, not overlapping) — that's
a correlated, reproducible difference, not noise. Sample-by-sample trace
comparison shows why: at matched `gameMs≈2350`ms, default has RIG at
`x=40.79,y=11.52` and flat has RIG at `x=36.77,y=8.16` — a genuine 4+ tile
divergence in the middle of the run, not just a metric artifact, that
re-converges near the end because the script always walks to the same final
region. `mid-route.json` is documented in this repo's own README as a
knife-edge, fixed-timing script that "leans on the game's forgiving
ledge/wall-jump catch instead of solving exact timing" — the likely
mechanism is that loading 5 more textures (and one more GPU warm-up pass)
shifts the boot's real-time cost, which shifts which frame the first scripted
key lands on, which this exact class of script is already known to fork on
(same shape as this repo's own `t2-transform-seam-rush` finding and T-049's
own I-039 sprite-loading finding — this is not a new class of hazard, T-051
just adds to the same asset-count that triggers it).

The closed-loop `six-face-spaced-run.json` (what `build.md`'s own evidence
captures are driven by, and a fairer test since it reacts to state rather
than firing on a fixed clock) reached the **same** ceiling in one run each
way — scroll 140, x≈151.3 — but sim-time-to-death differed a lot (47968ms
default vs 63754ms flat), on the high side of but not flatly outside this
policy's own documented wide spread (44–56s reported elsewhere for
combat-driven reasons unrelated to backdrops). One run each way is thin
evidence for this specific comparison; flagging the direction, not a hard
number.

**Why this doesn't change my verdict on "gameplay must not change":** final
position and crush margin are unaffected, and the mechanism (boot-time asset
count shifting frame alignment for an already frame-sensitive script) is a
pre-existing, already-documented class of behavior, not something T-051's
own logic branches on. But it does mean a before/after A/B using a
fixed-timing script under `--deterministic` should not be taken as "same
seeded sim, one variable changed" without checking for this — worth an inbox
entry so it isn't rediscovered from scratch next time an asset lane adds
textures.

## Evidence

- `reports/tasks/T-051/evidence/qa-01-17m-marker-default.png` /
  `qa-02-17m-marker-flat.png` — the named capture, both variants.
- `qa-03-hard-edge-crop-3x.png`, `qa-04-hard-edge-context-2x.png` — the
  cropped/zoomed edge.
- `qa-05-25m-marker-default-recurrence.png`,
  `qa-06-40m-marker-default-recurrence.png` — same defect, other positions.
- `qa-07/08/09-assetfail-{404,slow-timeout,malformed}.png` — the three
  failure-mode screenshots, nothing visibly broken.
- `qa-10-classic-palette-hard-edge.png` — same defect under
  `?palette=classic`.
- `run-summaries/*.summary.md` — the nine playtest-harness runs cited above.
- `run-summaries/backdrop-stress-qa.result.json` — the independent perf
  reading.
- `run-summaries/assetfail-{404,slow,malformed}.result.json` — the three
  break-test readings (boot timing, panel state, backdrop/preload snapshots,
  scroll advance).

## Commands to reproduce

```sh
# pin + serve (port mine, never 8741/8742)
git -C .claude/worktrees/T-051 archive HEAD | tar -x -C /tmp/hb-t051-pin
node tools/serve.mjs 8761 --root /tmp/hb-t051-pin --quiet &

# gate + smoke
(cd /tmp/hb-t051-pin && node tools/pathcheck.mjs)
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8761
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8761 --max-runtime-ms 20000

# perf, independent
node /tmp/hb-t051-pin/tools/playtest/backdrop-stress.mjs /tmp/backdrop-stress-qa

# six-face, both variants
node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over --max-runtime-ms 90000 --base-url http://127.0.0.1:8761
node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over --max-runtime-ms 90000 --url "http://127.0.0.1:8761/index.html?backdrop=flat"

# mid-route on/off, 3x each, for the secondary finding
for i in 1 2 3; do node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8761 --out /tmp/mr-$i; done
for i in 1 2 3; do node run.mjs scripts/mid-route.json --deterministic --url "http://127.0.0.1:8761/index.html?slice=traversal&backdrop=flat" --out /tmp/mrf-$i; done

# the 17m-marker capture + hard-edge pixel check: hold ArrowRight from boot on
# ?testapi=1, screenshot at 1280x720 when snapshot().scrollX first reaches
# 17, then scan row y=205 from x=795..830 in the PNG for the color step.
```

## PROPOSED INBOX ISSUES

**No new number for the hard-edge finding — it's already `I-044` / the
reviewer's `REQUEST_CHANGES`, and I don't want a duplicate triaged.** My §4
above is independent corroborating evidence for that same entry, not a new
defect: same conclusion (a hard alpha-cutout edge that no fog/depth tuning
can dissolve), reached by a different method (a live capture pixel-scan plus
a direct PIL check of *both* `backdrop-limb-segment.png` and
`backdrop-crown-horizon.png`, plus the `BACKDROP_TUNE` fog-fraction
arithmetic), extending it with recurrence at 3 more scroll positions and
under `?palette=classic`. File this report's §4 under `I-044`'s evidence
list if useful; please don't mint a second issue for it.

## I-??? | bug | S3 | repro: `node run.mjs scripts/mid-route.json --deterministic --base-url <pinned>` x3, then again with `&backdrop=flat` x3 — commit `32ca489` | evidence: reports/tasks/T-051/evidence/run-summaries/mid-route*.summary.md, mid-route-flat*.summary.md
Loading T-051's 5 backdrop textures (on top of whatever else the shared
preload gate already carries) measurably and reproducibly perturbs
`mid-route.json`'s exact mid-run trajectory under `--deterministic` — 3/3
default runs match route `mid-catwalk` (protoScore 86.4–87.8) and 3/3
`?backdrop=flat` runs match a different route entirely (protoScore
143.5–147.6), with sample-level position differing by 4+ tiles mid-run
despite converging to the same final x and crush margin. Likely the same
class of boot-time-shifts-frame-alignment hazard already documented for
T-049's sprite loading (I-039) and the repo's own `t2-transform-seam-rush`
finding, not something new to fix in `backdrop.js` itself — but worth
recording so a future before/after A/B on a fixed-timing script under
`--deterministic` doesn't assume "same seeded sim, one variable changed"
without checking. Not play-affecting (final position/crush margin hold), so
not blocking on its own.

## Open feel questions

None new from me. `build.md`'s own four questions stand, and my finding in §4
gives a technical answer to part of question 1 (the "reads as a flat image
pasted over the sky" read is not just an impression; there's a confirmed hard
edge behind it). `SPRINT.md` already carries a separate, later operator
checkpoint ("backdrop depth: visible-but-seamed, or clean-but-buried?") for
the depth-tradeoff question that emerged from the fix cycle on the commit
*after* the one I gated (`5c030fc`) — that one is genuinely a feel call with
no machine answer, and it's already correctly routed. I'm not adding to it or
asking the operator anything myself: the hard-edge finding on `32ca489` is a
checkable defect that falsifies a written, capture-testable acceptance line,
not a feel call, per this gate's own instructions to judge occlusion/
competition myself.
