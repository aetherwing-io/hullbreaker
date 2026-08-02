PASS

Gate subject: `task/T-052`, HEAD `a9b70a6` ("T-052: fix the measured 52-56%
lower-hull darkening + a hue-shift bug"), worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-052`. First
playtest gate for this task; no prior verdict to supersede.

## 0. Setup — pinned, not a moving tree

The worktree was never modified for this gate (`git status --short` before
and after: only my own new `reports/tasks/T-052/` files and a concurrently-
written `review.md` from another agent — neither is mine, both untouched by
me). A scratch copy was pinned instead: `git archive HEAD | tar -x -C
<scratch>`, served with `node tools/serve.mjs 8760 --root <scratch>
--quiet` (port 8760 — not 8741/8742). All runs below hit
`http://127.0.0.1:8760`. Server killed at the end of this gate.

## 1. Headless gate

`node tools/pathcheck.mjs` on the worktree itself: **2788 passed, 0
failed** — matches `build.md`'s own count exactly (I did not just re-read
their number; I ran it).

`node tools/assets/check.mjs`: **PASS**. All four generated tiles present
and palette-conformant (`hull-panel-tile` rust-orange 82%/ink 17%,
`weld-seam-strip` rust-orange 72%/ink 27%/hull 1%, `vent-louver-plate`
rust-orange 69%/ink 26%/hull 1%/acid-green 1%, `wear-scuff-overlay` ink
76%/rust-orange 16%/hull 3%/haze 1% — no third hue, matches the acceptance
box's "hull-panel-tile currently reads rust-brown" note under this
project's actual token name).

## 2. Smoke scripts — all completed, zero page/console errors

| script | flags | outcome | notes |
| --- | --- | --- | --- |
| `scripts/mid-route.json` | `--deterministic` | completed x3/3 | `pageErrors: []` every run |
| `scripts/transform-slice.json` | `--deterministic` | completed | `pageErrors: []` |
| `scripts/six-face-spaced-run.json` | `--deterministic --stop-on-game-over --max-runtime-ms 70000` | died at 50.9s, 3 lives spent, 14 kills | matches the documented gate-2 ceiling (`tools/playtest/README.md` "Where a reflex policy actually stops") almost exactly — this is the expected shape of this run, not a regression |
| `scripts/six-face-spaced-run.json` | `--deterministic --max-runtime-ms 25000` (default cap) | not-completed (stopReason `max-runtime-ms`), 0 deaths | sanity run at the default cap; superseded by the 70s run above for the durability read |

No `bootError`, no `pageErrors`, no console errors in any run's `report.json`.
Per I-040's "one non-completing run is not a regression" note: I did not
observe any spurious non-completion on `mid-route`/`transform-slice` across
4 total runs — cleaner than the one flaky rerun `build.md`'s own addendum
recorded on this same commit, so nothing here contradicts their honesty note
either way.

## 3. Readability — the central question

Judged moving (video capture, `--video`, extracted at 5-10fps with
`ffmpeg`) and in stills, textured (default) vs `?tex=flat`, against my own
independently-driven runs (not the builder's evidence, though I looked at
that too and it holds up).

**(1) Can the player still instantly parse the world?** Yes, in every
capture I took. Standable ground (the checker-pattern deck), platform
edges, catwalk hazard lines (the glowing lights), capsule markers (magenta
`S`/`H`), hostiles (acid-green sprites), and RIG (white silhouette) all read
at the same on-screen size and position in both variants — see
`playtest-evidence/six-face-deck-textured.png` vs
`-flat.png` (same policy, same approximate scroll position). RIG's own
screen-height fraction is untouched by this task (no camera/scale change),
consistent with the concept-art invariant.

**(2) The lower hull band specifically.** Captured it directly (not just
from a distance) in combat, in the death-overlay frame, and in the builder's
own near/far crops. The dark band under the deck (ladders, windows, the
armor mass) stays legible in every capture I took — ladders and windows read
identically in both variants; nothing needed to fight or navigate in that
band disappears into the dark. The residual ~29% luminance drop on the
`hull` bucket that `build.md` self-reports (measured there, re-derivable
from my own `qa-stress` texture-count numbers matching theirs) does not, in
my captures, cross into "hides something a player needs" — but see the open
question below; darkness-vs-legibility is a threshold call I can confirm
hasn't been crossed *yet*, not a guarantee it never will be as the asset
changes under T-053.

**(3) Does texture detail read at true size, or is it noise?** Read at
true size (1280x800, no `--scale`), the panel-line/rivet detail is a subtle
value modulation, not a competing visual signal — it never out-competes the
catwalk lights, capsule markers, or hostile sprites for attention in any
capture. Cross-checked against a specific precedent: SPRINT's I-040 finding
("against a darker panel/pillar background element, RIG's own dark ink
outline blends toward the background") is exactly the risk class this task
raises by darkening `wall`/`shadow`. I found the specific dark vertical
fixture RIG stands beside during the WAVE 1/6 gate fight (see
`playtest-evidence/rig-vs-dark-pillar-{textured,flat}.png`) and it is
**pixel-for-pixel unaffected** — that fixture is in the untextured `rib`/
`machine`-class family (build.md's own table: "thin fixtures a tiled panel
would smear across... none — family only"), so this task does not touch
the exact surface I-040 was about. RIG remains legible against it in both
variants. Separately, `playtest-evidence/wall-texture-visible-{textured,
flat}.png` (a wide combat-arena crop) confirms the `wall` bucket's texture
*is* genuinely present — faint vertical striations visible in the textured
frame, absent in flat — while the catwalk lights and hostile sprites in the
same crop stay equally bright and readable in both.

**(4) Shimmer/crawl while moving.** Sampled 5 consecutive video frames
(~0.2s apart) over the same `wall`-bucket region during active scroll/combat
(`crops/tex-f095/f097/f100/f102-wall.png`, not all copied into the worktree
evidence dir — available in my working notes if needed) — the striations
hold steady position and spacing frame to frame, no visible moiré/crawl at
this sampling cadence. **Honesty note on this specific check**: video
extraction at 5-10fps cannot rule out true 60fps-scale shimmer the way a
frame-accurate capture could; I did not find an artifact, but this is
evidence of absence at a coarser sampling rate than the concern is stated
at, not a frame-by-frame proof.

## 4. Entry 16 (decisions.md) — degrade safety, verified in play, independently

Ran my own break/restore against the scratch copy (never the worktree),
full transcript in `playtest-evidence/degrade-check-log.txt`:

- **404** (`hull-panel-tile.png` renamed away): SELFTEST still **PASS (39
  checks)**, `hullTex.buckets` drops exactly `hull`+`wall` (both consumers
  of that file), the other two buckets stay textured, one warning per
  affected registration, `pageErrors: []`.
- **Malformed** (`weld-seam-strip.png` overwritten with 200 random bytes):
  same shape — SELFTEST PASS, only `shadow` drops, one warning,
  `pageErrors: []`.
- **Gameplay does not change**: re-ran `mid-route.json --deterministic`
  against the 404'd server. Outcome: completed, 0 deaths — indistinguishable
  from three non-degraded control runs on the same commit (`gameMsMax`
  5787.7ms fell *inside* the non-degraded spread of 5356.6-6340.4ms across 3
  control runs). That's the actual evidence for "gameplay does not branch on
  asset load" — not that the run merely looked similar, but that its timing
  sits inside this build's own already-measured non-determinism band.
- **Not reproduced**: the third failure mode named in the brief ("delay a
  tile past the boot budget"). My scratch rig has no network-throttling
  hook, and the component actually responsible for that path is T-049's
  shared `preload.js` gate, which this task only consumes. Recommend a
  targeted repro against `preload.js` itself if that specific edge needs
  closing — I'm not asserting it's fine, I'm saying I didn't test it and
  said so.

## 5. Performance (decisions.md entry 18)

Independently reproduced `build.md`'s own stress rig (read-only reuse of
`tools/playtest/sprite-stress.mjs`'s load generator — 60 projectiles/frame,
death burst+flash every frame, roster held at 10 hostiles, 5s window,
1280x800 headless Chrome), against my pinned server, not theirs:

```
textured  fps 120    avg 8.33ms  worst 10.40ms  over20ms 0  drawCalls 179  tris 105504  textures 29  projectiles 256  hostiles 11
flat      fps 120.1  avg 8.33ms  worst 10.30ms  over20ms 0  drawCalls 178  tris 105496  textures 25  projectiles 256  hostiles 11
```

`over20ms` is 0 in both (vsync caps `fps` at 120 on this machine, per the
tool's own honesty note — `worstMs`/`over20ms` are the load-bearing fields).
Draw call/triangle counts within 1 unit of each other (ordinary per-frame
roster variance, not a regression). Texture count +4 (29 vs 25), matching
`build.md`'s own re-measured "net cost is +4 resident textures, not +7"
claim after their dead-texture-disposal fix — independently confirmed, not
inherited. Full JSON: `playtest-evidence/perf-stress-result.json`.

## 6. What I did not chase further, and why that's fine for a PASS

- The self-reported 29%-darker-than-flat `hull` bucket and the small
  per-instance UV-scale approximation on `bdLimb`/`bdDrum`/`bdRing` are both
  disclosed, measured, and judged low-stakes by the builder for reasons that
  held up under my own spot checks (distant/hazy tiers, no legibility loss
  found). Neither is a readability *failure* by my testing; both are
  legitimate open feel questions, not gate-blocking defects, so I'm routing
  them below rather than failing the gate over a number that's already
  honestly on the record.
- I did not test all six of the game's named "faces" end to end — no bot
  policy has ever cleared wave gate 2 (`docs/playtests/2026-08-victory-box.md`,
  reconfirmed by my own 70s six-face run reaching the same gate). This is a
  pre-existing, documented harness/game ceiling unrelated to this task; I
  played as much of the six-face run as any policy on record can reach.

## PROPOSED INBOX ISSUES

None. No bug, fairness, or durability defect found in this gate — the two
open items above are feel questions, not filed as issues.

## Open feel questions for the operator (not judged here)

Carried forward / narrowed from `build.md`'s own four questions, since my
testing bears most directly on the first two:

1. In `playtest-evidence/six-face-deck-textured.png` vs `-flat.png`, does
   the lower-hull band (ladders, windows) read as "a real surface, slightly
   in shadow" or "too dark for its own detail to matter" — and does that
   change your answer once T-053's regenerated, higher-contrast tile lands
   (per `build.md`, the normalization is asset-agnostic and will re-converge
   automatically, but the resulting darkness delta hasn't been re-measured
   against the new asset yet)?
2. `playtest-evidence/wall-texture-visible-textured.png` vs `-flat.png`:
   is the faint panel-line detail on the `wall` tier worth its own subtlety,
   or is it too faint to register at play distance (i.e., wasted cost)?
3. Same three questions `build.md` already asked about tiling scale, the
   deck-edge seam trim's visibility, and the wear overlay's visibility at
   play distance — unchanged, not re-litigated here.

Exact URLs: `http://127.0.0.1:8741/index.html` (default, textured) vs
`http://127.0.0.1:8741/index.html?tex=flat` (A/B), both FAR camera default.
