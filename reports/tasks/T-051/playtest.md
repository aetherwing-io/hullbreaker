PASS

# T-051 — backdrop layers: re-gate against `8ee8494` (main absorbed: T-049, T-052, T-053)

Narrow re-gate per the team lead's dispatch. Worktree pinned:
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-051`, branch
`task/T-051`, HEAD `8ee8494` (`git status --short` clean before and after —
this report's own evidence went only into `reports/tasks/T-051/evidence/`,
nothing under `src/`, fixtures or tuning was touched). Served a scratch
archive, never the live worktree, per instructions:

```sh
mkdir -p /tmp/hb-t051-pin
git -C .claude/worktrees/T-051 archive HEAD | tar -x -C /tmp/hb-t051-pin
node tools/serve.mjs 8781 --root /tmp/hb-t051-pin --quiet   # port mine; never 8741/8742/8753
```

All playtest-harness runs below ran against `http://127.0.0.1:8781`; the two
dev tools that spin up their own ephemeral server (`backdrop-capture.mjs`,
`backdrop-stress.mjs`) were run from inside the **pinned scratch copy's own**
`tools/playtest/`, so they too only ever read `8ee8494`'s files. Port 8781
killed at the end of this session.

## Verdict, in one paragraph

**The one item the prior gate failed on — "far edge dissolves into the fog
color, proven by capture" — is now met, independently re-measured, not
inherited.** T-053's feathered-alpha fix is real at the asset level (all 5
plates went from ~0.3-1.8% partial alpha with a literal 0→255 single-pixel
step surviving somewhere in every file, to 13.75-35.12% partial alpha with
that instant full-magnitude step gone from all five), and it is real in
rendered play: the one plate placement I could get live in front of the
camera (`backdrop-limb-segment`, near tier, faces 1/3/5) now shows a genuine
multi-pixel colour ramp into the sky/fog tone wherever it's visible, at two
different screen positions, with the previous defect's exact signature (a
single pixel, zero-intermediate-value jump) not reproducing anywhere I
looked. Durability, the combined-lane readability check, and perf with
everything live all independently re-confirm clean. One honest wrinkle,
already known and explicitly non-blocking per the dispatch: at the shipped
depths most plate placements are occluded behind existing box-tier geometry
at the camera positions I sampled, so this gate mostly re-confirms the
**visible** slivers dissolve correctly rather than exercising all twelve
placements equally — detailed below, and it corroborates rather than
contradicts the already-open, already-routed operator checkpoint on that
exact tradeoff.

## 1. Durability — PASS

- `node tools/pathcheck.mjs` against the pinned copy: **3148 passed, 0
  failed**.
- Smoke set, both `--deterministic` against the pinned server:
  - `scripts/mid-route.json` → `completed`, `testapi` fidelity, 0 deaths, 0
    `pageErrors`, `bootError: null`, `minEdgeMargin` 35.12 tiles, idle
    fraction 0.06. (`evidence/runs/mid-route/`)
  - `scripts/transform-slice.json` → `completed`, 0 `pageErrors`,
    `bootError: null`, `minEdgeMargin` 30.09 tiles. (`evidence/runs/transform-slice/`)
- `scripts/six-face-spaced-run.json --deterministic --stop-on-game-over
  --max-runtime-ms 90000` (default build — backdrop, hull textures and
  sprites all live together, the actual combined-lane load): `died` at the
  same documented ceiling (`docs/playtests/2026-08-victory-box.md` — wave
  gate 2, scroll ~140), reached scroll 140.0 exactly, `pageErrors: []`,
  `consoleErrors: []`, `teardownErrors: []`, `stopReason: game-over`, 3 lives
  spent cleanly (telemetry/HUD cross-check agrees). Neither wedged, crashed,
  nor lost a save; camera tracked RIG throughout (`scrollX` advanced
  monotonically with RIG's own x in every sample I inspected).
  (`evidence/runs/sixface-default/`)
- Six faces: same ceiling every prior gate in this repo has hit (facets 1-2
  reachable, facets 3-6 not, by any policy this repo ships — pre-existing,
  not new, not something this re-gate can close). `?enemies=0` still does
  not take effect on the default six-face run (SPRINT I-026), confirmed
  again live (8 hostile rows still present).
- Asset-failure path (entry 16's binding condition): not re-run this
  session — the prior gate PASSed it independently and nothing in T-049's,
  T-052's or T-053's merges touches `backdrop.js`'s try/catch or the shared
  preload gate's degrade path. Flagging that this was inherited, not
  re-verified, in case a future gate wants it re-proven after a preload.js
  change specifically.

## 2. The previously-failing acceptance box — now PASS, measured two ways

### 2a. Asset level — direct alpha-channel measurement, all 5 plates, full image (not coarse-sampled)

| plate | pre-T-053 (0% / 255% / partial%) | post-T-053 (0% / 255% / partial%) | max single-pixel ALPHA step anywhere (255 = literal instant cutout surviving) |
|---|---|---|---|
| backdrop-limb-segment | 50.18 / 49.34 / 0.48 | 59.38 / 26.88 / **13.75** | 255 → 181 |
| backdrop-spine-coil | 52.10 / 46.11 / 1.80 | 49.51 / 30.22 / **20.28** | 255 → 111 |
| backdrop-gill-cavity | 40.14 / 59.40 / 0.46 | 6.83 / 58.06 / **35.12** | 255 → 10 |
| backdrop-colony-cluster | 53.54 / 46.18 / 0.28 | 41.27 / 35.22 / **23.51** | 255 → 89 |
| backdrop-crown-horizon | 60.51 / 39.19 / 0.31 | 72.18 / **0.00** / 27.82 | 255 → 80 |

(`pre-T-053` = commit `22c4445`, the T-046 candidates, the last point before
T-053 touched these files; `post-T-053` = this commit's own files. Measured
with a pixel-by-pixel PIL scan I wrote this session, not sampled/coarse —
script and full output in this report's evidence.) These numbers match the
team lead's cited 13.75-35.12% partial range exactly, and match a
concurrently-running reviewer's independent PIL scan of the same commit
(`reports/tasks/T-051/review.md`, unprompted by me) to two decimal places on
every plate, including `crownHorizon`'s 0.00% exactly — two different people,
two different scripts, same commit, same numbers.

Beyond the aggregate percentages, I measured the **outer silhouette
boundary specifically** (the edge that faces the sky in-game, isolated from
interior panel-line/rivet alpha noise, which is a different, non-blocking
concern from this acceptance box): for every scanline that runs from the
image's own transparent border inward to first-fully-opaque, the ramp width
in pixels. Pre-T-053, every one of the 5 files had a median outer-boundary
ramp of 1-2px (the old hard-cutout signature). Post-T-053, the four plates
that still have any fully-opaque core at all (`limbSegment`, `spineCoil`,
`gillCavity`, `colonyCluster`) show outer-boundary ramps with **medians from
7px to 380px depending on plate/side and zero occurrences of a <=1px
transition** anywhere I scanned. `crownHorizon` is a special case, addressed
next.

**`crownHorizon` went from "half hard-edged opaque shape" to "100% soft,
zero fully-opaque pixels anywhere."** No scanline in this file ever reaches
alpha>=250 at all (confirmed both by my outer-boundary scanner returning
zero hits on every side, and by the raw 0.00% figure above), versus 39.19%
fully-opaque pre-fix with a literal instant-cutout edge. This is a real,
measurable side-effect of the feathering fix specific to this one plate —
not a hard-edge regression (the opposite: it can't produce a hard edge
because it now has no fully-solid region to transition *from*), but flagging
it as an honest observation rather than silently folding it into "all 5
plates fixed the same way." The independent reviewer traced this to
`src/render/palette.js:303`'s `CONCEPT.backdropFar` being "deliberately
identical" to the fog/sky tone at this tier's ~80% authored haze fraction —
i.e. this plate is designed to read as almost-pure-haze at the `far` tier
regardless of its own alpha, so the practical visual impact is likely small,
but I haven't independently confirmed that claim myself and am reporting it
as their finding, not mine.

### 2b. Rendered-frame level — live capture, two screen positions, same plate

I could only get one of the five plates (`backdrop-limb-segment`, the
`near`-tier plate at faces 1/3/5) genuinely in front of the camera at the
positions I sampled — see §3 below for why. Where it *was* visible, I
scanned the rendered screenshot's own RGB values (not the source PNG) across
the boundary:

- **`evidence/regate/backdrop-capture-fresh/02-facet1-plates-after.png`**
  (scroll 56.2, six-face-spaced-run's own policy, 1440x900): crop at
  `evidence/regate/facet1-plate-crop-2x.png`. Row y=20, x=700→772: `(47,86,94)
  → (39,73,79) → (42,76,82) → … → (12,28,31)` — nine-plus distinct
  intermediate values sampled every pixel across a ~70px span, monotonic,
  no single-step jump anywhere near the old defect's ~74-magnitude
  instantaneous jump.
- **`evidence/regate/marker-17-default.png`** (a fresh, independent
  hold-ArrowRight-from-boot capture at 1280x720, reproducing the *exact*
  prior methodology — scrollX=17.17): crop at
  `evidence/regate/marker17-plate-crop-2x.png`. The literal old coordinate
  (y=205, x=790-834) is now **flat pure sky `(48,87,95)` throughout** — the
  plate's silhouette has moved/is occluded at that exact pixel, so there is
  no edge there to fail on at all. A visible sliver of the *same* plate sits
  elsewhere in the same frame (x≈1080-1150); scanned there instead: y=60/80,
  x=1080→1220, again many intermediate values over roughly 40-50px, e.g.
  `(48,86,94) → (38,72,79) → (35,67,74) → (28,58,63) → (22,48,53) → (18,38,41)
  → (17,36,39) → (16,35,37)`, no single-pixel jump.
- Re-ran `tools/playtest/backdrop-capture.mjs` (the builder's own rig, not
  mine) against the pinned copy for all 4 of its moments (`01-early`,
  `02-facet1-plates`, `03-corner1-approach`, `04-facet2-plates`) — full
  `default` vs `?backdrop=flat` pairs at `evidence/regate/backdrop-capture-fresh/`.
  Diffing each pair (`evidence/regate/diff-*.png`) to locate where a plate
  is actually present (as opposed to timing-jitter noise from independently
  re-run hostile/light positions, which dominates a naive whole-frame diff
  and is why an early, naive pass of my own automated hard-edge scanner
  produced false positives at box-tile mesh silhouettes and HUD text edges —
  same trap the independent reviewer's report calls out explicitly): only
  `02-facet1-plates` shows a large, coherent, plate-shaped diff region.
  `01-early` (scroll 20), `03-corner1-approach` (scroll 84) and
  `04-facet2-plates` (scroll 121) show **no visible plate at all** in either
  variant at these exact camera framings — see §3.

### 2c. What this does and doesn't prove

I have a rendered capture proving the visible plate edge dissolves, at two
different screen positions, on the one plate/tier I could get in front of
the camera. I do **not** have a live capture proving the other four plates
(`spineCoil`, `gillCavity`, `colonyCluster`, `crownHorizon`) dissolve
on-screen, because none of them were visible at any of the four scroll
positions I sampled (backdrop-capture.mjs's own facet-1/facet-2 moments) —
not because of a rendering defect, but because the depth retune's
box-geometry occlusion buries them at those exact framings (§3). The
asset-level PNG measurement in §2a covers all five files directly and
unambiguously, and is what I'm resting the PASS verdict on for the four I
couldn't get on-screen — `backdrop.js`'s material setup (`alphaTest: 0.02`,
`fog: true`, `transparent: true`) is identical for all twelve placements, so
a fix proven at the asset level for a shared code path is fair evidence
without needing all twelve placements individually on-screen, but I want
this gap named plainly rather than implied away.

## 3. Readability with backdrop + hull textures + RIG + hostile sprites all live — PASS, with an honest qualifier

Captured 4 moments (`facet1`/`corner1`/`facet2`/`gate2-approach`, scroll
56/84/121/138 — the last one closest to the wave-gate-2 ceiling, richest in
hostiles/projectiles) × 4 variants (`all-on`, `?backdrop=flat`, `?tex=flat`,
`?backdrop=flat&tex=flat`), all driven by `six-face-spaced-run.json`'s own
policy for a fair, reactive comparison. 16/16 captures succeeded.
(`evidence/regate/readability/`)

- **RIG stays legible and small** in every capture (all-on and every flat
  variant) — no case where the combination crowds or hides the player
  sprite.
- **Standable ground vs. hazard vs. background reads cleanly** in every
  variant: the warm rust/orange hull-tile checker pattern (T-052) stays
  confined to real standable surfaces with a bright highlight rim + light
  glints marking the walkable edge, distinctly warmer/more saturated than
  both the cool grey-teal box silhouettes and the flat sky. Hostiles
  (a hound-class ground unit, a wasp with a dive trail, projectile streams)
  read as clearly separate moving elements against both the textured and
  flat-textured deck.
- **Where the backdrop plate actually shows through** (`facet1`, the one
  visible instance from §2b), it sits entirely above the play band,
  desaturated/blurred relative to the crisp foreground hull, and never
  competes with a platform, capsule, or hostile silhouette — consistent with
  pathcheck's play-band-clearance assertion and the prior gate's own
  capture-based confirmation of the same.
- **The honest qualifier, and the most useful thing this check found:** at 3
  of the 4 sampled moments (`corner1`, `facet2`, `gate2-approach`), the
  backdrop plate is not visibly present at all — `all-on` and
  `?backdrop=flat` are visually indistinguishable at those exact camera
  framings (confirmed both by eye and by the diff scan in §2b). So the
  "backdrop + textures + all sprites, all live at once, never played before"
  combination is *not* noisier than any single lane suggested, but a real
  part of why is that the backdrop is largely not there yet to compete —
  this reinforces, rather than newly discovers, SPRINT's existing
  `CP — backdrop depth: visible-but-seamed, or clean-but-buried?` checkpoint.
  I'm not opening a new checkpoint for it (the existing one already asks the
  right questions and is explicitly non-blocking for this gate); adding this
  as corroborating evidence for that entry.

## 4. Perf with everything on — PASS

`tools/playtest/backdrop-stress.mjs` (the builder's own tool) against the
pinned copy, 60 projectiles/frame injected via the game's own
`fireWeapon(clone=true)` saturating the 256-slot pool (confirmed
`liveProjectiles: 256` every run — well past the 200+ bar), 3 repeats each
side, `flat` = backdrop off only (textures + sprites still on, the
next-best isolation this tool offers) vs `backdrop` = the full shipped
default (backdrop + textures + sprites, i.e. everything on):

| | worstMs (3 runs) | over20ms (3 runs) | drawCalls | geometries | textures | triangles |
|---|---|---|---|---|---|---|
| flat (backdrop off) | 10.40, 10.40, 10.40 | 0, 0, 0 | 162 | — | — | 107174 |
| everything on | 10.30, 10.30, 10.30 | 0, 0, 0 | 185-186 | — | — | 107210-107222 |

Zero frames over the 20ms slow-frame threshold across all 6 runs; worstMs
comfortably under the 16.67ms/60fps budget on both sides (this harness's own
honesty note applies: rAF is vsync-locked in headless Chrome, so `worstMs`/
`over20ms` are the load-bearing fields, not a raw fps number — reported
`fps` was 120/120.1 here, a headless-Chrome/host-refresh artifact, not a
game claim).

Separately queried `renderer.info` directly across all four flag
combinations to isolate each lane's own memory cost (`/tmp` throwaway
script, output only, no file left behind):

| variant | geometries | textures | draw calls | triangles |
|---|---|---|---|---|
| both flat (pre-T-051/052 baseline) | 73 | 26 | 152 | 107044 |
| `?backdrop=flat` only (tex on) | 73 | 30 | 152 | 107044 |
| `?tex=flat` only (backdrop on) | 87 | 31 | 176 | 107092 |
| all on (shipped default) | 87 | 35 | 176 | 107092 |

Textures/draw-calls/geometry deltas are small and additive between the two
lanes, consistent with the T-051/T-052 build reports' own claims (+24 draw
calls for the 12 backdrop quads, +4-5 textures per lane) — no surprise, no
regression signal.

## Evidence

- `evidence/runs/{mid-route,transform-slice,sixface-default}/` — this
  session's own smoke-set reports/summaries/screenshots.
- `evidence/regate/backdrop-capture-fresh/` — fresh 4-moment × 2-variant
  captures from the builder's own `backdrop-capture.mjs`, this commit.
- `evidence/regate/diff-{01-early,02-facet1,03-corner1,04-facet2}.png` —
  diff masks locating where a plate is actually visible per moment.
- `evidence/regate/facet1-plate-crop-2x.png` — 2x crop of the one confirmed
  live plate/sky boundary, facet 1.
- `evidence/regate/marker-{17,25,40}-{default,flat}.png`,
  `diff-marker-{17,25,40}.png`, `marker17-plate-crop-2x.png` — the exact
  prior-gate methodology re-run fresh, plus the diff/crop that located the
  still-visible sliver at the 17m marker.
- `evidence/regate/readability/` — 16 captures, 4 moments × 4 flag
  combinations.
- `evidence/regate/backdrop-stress/result.json` — perf, this session's own
  run of the builder's tool.
- This report's own PNG alpha-channel scan scripts are not committed
  (scratch, per instructions) — the numbers in §2a are reproducible with any
  pixel-level PNG reader; method described inline.
- **Not touched, left exactly as the builder/reviewer left them:**
  `evidence/{01-early,02-facet1-plates,03-corner1-approach,04-facet2-plates}-{after,before}.png`,
  `evidence/qa-*.png`, `evidence/run-summaries/*` — the prior gate's and
  build report's own evidence. (I briefly overwrote the four `0N-*` pairs by
  pointing `backdrop-capture.mjs` at the shared default output directory;
  caught it via `git status`, restored them with `git checkout --`, and
  re-ran into `evidence/regate/backdrop-capture-fresh/` instead. Worth a
  process note: that script's `--out` should probably default somewhere
  gate-run-specific rather than the shared evidence root, so a re-gate can't
  silently clobber the build's own evidence — filed below.)

## Commands to reproduce

```sh
# pin + serve (port mine, never 8741/8742/8753)
git -C .claude/worktrees/T-051 archive HEAD | tar -x -C /tmp/hb-t051-pin
node tools/serve.mjs 8781 --root /tmp/hb-t051-pin --quiet &

# gate + smoke
(cd /tmp/hb-t051-pin && node tools/pathcheck.mjs)
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8781
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8781
node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over \
  --max-runtime-ms 90000 --base-url http://127.0.0.1:8781

# builder's own rigs, run from the PINNED copy so they serve 8ee8494's own files
cd /tmp/hb-t051-pin/tools/playtest
node backdrop-capture.mjs shots --out <somewhere-that-is-not-the-shared-evidence-dir>
node backdrop-stress.mjs <outDir>

# asset-level alpha scan (any pixel-level PNG reader; this session used PIL)
python3 -c "
from PIL import Image
im = Image.open('assets/generated/backdrops/backdrop-limb-segment.png').convert('RGBA')
w,h = im.size; px = im.load()
# count alpha==0 / ==255 / partial over all w*h pixels, and scan each row/col
# from a transparent border inward to first alpha>=250 for the outer-boundary
# ramp width — see §2a for the full method and numbers on all 5 plates
"
```

## PROPOSED INBOX ISSUES

**No new number for the gradient finding — this gate closes it, it doesn't
open anything.** §2/§2a/§2b above are this gate's own independent
confirmation that T-053 + the depth retune together satisfy the acceptance
box; no defect to file.

## I-??? | tooling | S4 | repro: `cd <any-worktree>/tools/playtest && node backdrop-capture.mjs shots` twice, from two different pinned copies, without an explicit `--out` | evidence: this report's own evidence section, above
`backdrop-capture.mjs`'s default `--out` is `reports/tasks/T-051/evidence`
— the same shared directory the builder's own `build.md` evidence lives in.
Running the tool again during a re-gate (as I did, before catching it via
`git status --short`) silently overwrites the build's own committed-intent
evidence files with a fresh run's output, with no prompt and no diff
warning. Nothing was lost here (`git checkout --` restored them cleanly
since nothing had been committed over them), but a re-gate against a
*merged* commit where the original build.md capture came from a
*pre-merge* commit would silently destroy the only record of what the build
report's own screenshots actually showed, replacing them with a
merged-tree re-capture that looks superficially the same but isn't provably
the same evidence anymore. Low severity (caught immediately by normal git
hygiene, no game-code impact, dev-tool only) but a five-minute fix: default
`--out` to something gate-run-scoped (e.g. include a timestamp, or require
`--out` explicitly and refuse to run without it), same shape as
`run.mjs --out`'s own explicit-directory convention.

## Open feel questions

None new from me. The existing `CP — backdrop depth: visible-but-seamed, or
clean-but-buried?` checkpoint already asks the right questions and is
explicitly non-blocking for this gate; §3 above adds corroborating
evidence (3 of 4 sampled camera framings show no plate at all) rather than
opening a new one. Same for `CP — the hull is darker than it was` (T-052) —
untouched by this re-gate, nothing new to add.
