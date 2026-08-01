PASS

# T-003 — FAR-camera readability pass — playtest gate

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-003`
at `74b7267` (branch `task/T-003`, merge-base `main` `7b0e218`).
Served pinned: `python3 -m http.server 8962` with cwd set to that worktree;
every run below came from the MAIN checkout's harness via `--base-url`
(`tools/playtest`), and the server was killed at the end of the gate.

## Runs

```sh
# required gate set
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8962 --out runs/gate-T-003-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8962 --out runs/gate-T-003-transform

# supplementary: the two flags that actually execute the new tell-lamp path
node run.mjs scripts/polyp-lane-dodge.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8962 --out runs/gate-T-003-polyp
node run.mjs scripts/hound-facetank-solo.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8962 --out runs/gate-T-003-hound

# render-only A/B: same tree, pass off
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --url 'http://127.0.0.1:8962/index.html?slice=traversal&legibility=0&testapi=1' \
  --out runs/gate-T-003-mid-legoff

# in the worktree
node tools/pathcheck.mjs        # 1480 passed, 0 failed
```

| run | exit | `outcome.result` | consoleErrors | pageErrors | bootError |
| --- | --- | --- | --- | --- | --- |
| `gate-T-003-mid` | 0 | **completed** | 0 | 0 | null |
| `gate-T-003-transform` | 0 | **completed** | 0 | 0 | null |
| `gate-T-003-polyp` | 0 | completed | 0 | 0 | null |
| `gate-T-003-hound` | 0 | stalled (script-characteristic, see below) | 0 | 0 | null |
| `gate-T-003-mid-legoff` | 0 | completed | 0 | 0 | null |

No retry was needed; no run hit a transient bootError.

`mid-route`: 1 attempt, 0 falls, idle fraction 0.024, `minEdgeMargin` 35.44
tiles — the same crush margin the playtest README's own deterministic baseline
records (35.44), so pacing is unmoved. `transform-slice`: 1 attempt, idle 0,
2/2 transformations, BREACH CLEAR, `minEdgeMargin` 30.13, 0 lives spent.
`hound-facetank-solo` is an open-loop facetank policy (hold right + fire, one
16 ms jump) that jams on terrain and eats hits by design — 74% idle / 7 hits is
its shape, not a regression; it was run only to execute the hound lamp code
path with error channels watched.

## What I judged in the frames (not the prose)

All committed evidence: `artifacts/legibility-v1/` (30 PNGs, no `-FALLBACK`
frames). I decoded the PNGs and measured them rather than reading the packet's
numbers back.

**1. The glyph is measurably more legible at FAR.** `capsule-glyph--far-before.png`
vs `capsule-glyph--far-after.png` (both 1280×800):

| | magenta plate (px) | letter ink |
| --- | --- | --- |
| before (`?legibility=0`) | 12 × 11 | **not resolvable** — 1 px over the ink threshold; the pixel dump shows a 3-px patch one shade darker than the plate, no glyph shape |
| after (shipped default) | **19 × 19** | a formed **H**: ink core 11 px tall (≈13 px counting the anti-aliased edge rows), ~2 px strokes, dark border ring around the plate |

T-015's baseline is 9.6 px (`screenPx(CAP.size=0.55, far, 800) = 9.6`, asserted
in `tools/pathcheck.mjs`); the pre-pass plate I measured in the shipped frame is
11–12 px, i.e. the same object within capture/AA tolerance, and its *letter* is
the part that had vanished. The branch's own claim ("12.9–13.0 px in Chrome")
is consistent with what the frame carries — it does not overclaim.

**2. The captures really are at FAR** — two independent checks:
- RIG height: 30 px in `wasp-dive--far-{before,after}.png` = **3.75%** of the
  800 px viewport; 29 px = 3.63% in `polyp-onset--far-{before,after}.png`. Both
  sit inside board 13's 3–5% and on entry 7's 3.7%. `capsule-glyph--near-after.png`
  measures 56 px = **7.00%**, exactly the near-view figure, so the near/mid/far
  labels are honest.
- World-scale check with the pass OFF (pure world mass, no compensation): the
  capsule plate measures 22 px (near) / 15 px (mid) / **11 px (far)** — ratios
  1.47 and 2.0 against `depthMult` 1.42 and 1.9.

**3. RIG's own screen fraction is unchanged (entry 7 respected).** Same frames,
before vs after: 30 px vs 30 px (wasp-dive), 29 px vs 29 px (polyp-onset). The
`--views-after` strip shows RIG shrinking near→far while the glyph holds one
size (measured after-plate heights 21 / 20 / 19 px).

**4. I-003 (polyp's first ~300 ms) now carries signal at FAR.**
`polyp-onset--far-before.png` has no bright object anywhere in the play band;
`polyp-onset--far-after.png` gains a 16 × 18 px warm blob (mean RGB 228,209,183
— the warm-amber `polypTell` role after tone mapping) at the barrel aperture,
and its bulb is visibly less dilated than the `polyp-late-tell` control, which
is what an early-tell frame should look like. Honest limit: **a PNG cannot
carry its own ms-into-tell**, so "43 ms in" is the rig's claim, not something I
re-derived; what I can certify is that the frame passed the rig's own
`verify` (`state === 'tell' && leftMs > 590` of an 800 ms tell, i.e. inside the
first 210 ms), that no frame was written `-FALLBACK`, and that `polypLamp()`
lights from the first frame of `tell` unconditionally, with pathcheck asserting
the onset length and the front-loaded curve (`u ** 0.55` ≥ 1.4× linear at 300 ms).

**5. The hound tell gains a real lamp.** `hound-tell--far-after.png` has a
13 × 13 px warm blob (mean 217,201,176) above the chassis that is absent in the
before frame; the rest of the frame is unchanged in composition.

**6. Wasp dive.** `wasp-dive--far-detail.png`: the cruising drone is a dull
green diamond; the committed dive is a hot acid dart pointed down its own
vector. It reads as a different thing at FAR without getting smaller.

**Style vs `docs/concept-art/`:** deep-teal haze, rust deck, acid-green enemy
ecology, warm-amber warnings, hot-magenta pickup — the roles hold in every
frame, and RIG stays a small warm-white silhouette. Nothing in these captures
or in the transform run shows anatomy assembling, articulating or slamming into
place (decisions.md entry 3); the only new motion is a lamp blink, a pose
scale, and the capsule's twirl becoming a bounded rock — a pickup, not anatomy.

## Contract checks

- **No sim/hitbox change:** `git diff main...74b7267 -- src/pure src/sim` is
  **0 bytes**. `src/config.js` is untouched. Changed files are
  `src/render/{legibility.js,capsules.js,hostiles.js,palette.js}`,
  `tools/pathcheck.mjs`, `tools/playtest/legibility-capture.mjs`, `README.md`,
  `docs/DESIGN.md`, `tools/playtest/README.md`, `artifacts/legibility-v1/*`.
- **Behavioural A/B corroborates render-only:** `mid-route` with the pass on vs
  `?legibility=0` on the same tree — completed / 1 attempt / 1 hit both sides,
  `minEdgeMargin` 35.44 vs 35.41, `airMs` 5315 vs 5244, y-span 8.72 vs 8.79:
  inside the harness's documented run-to-run jitter (README honesty #2/#8).
- **No raw color literals:** no `0xRRGGBB` / `#rrggbb` in `capsules.js`,
  `hostiles.js` or `legibility.js`; the one new color (`waspDive`) is a token
  added to **both** palette tables in `src/render/palette.js`.
- **pathcheck green in the worktree:** 1480 passed / 0 failed, including the new
  legibility family (gain arithmetic, RIG-fraction invariant, glyph floor,
  hitbox-containment, damage-volume and layer static guards).

## Feel questions for the operator (routed, not judged)

1. The hound lamp sits ~1 tile above the chassis with a visible gap at FAR —
   does it read as a light *on the machine*, or as a floating marker?
2. `polyp-late-tell--far-after.png`: lamp + fully-open iris make the emplacement
   the largest pale mass on screen. Right amount of "this is about to fire", or
   too much?
3. The capsule twirl is now a bounded rock instead of a full spin — does the
   pickup still read as alive?
4. A committed dive wears hot acid (`waspDive`) rather than the roster's amber
   warning language. Correct split (warning vs commitment), or confusing?
5. Compare `?legibility=0` against the default at `?view=far` — is the boosted
   pose/lamp set worth the loss of "everything is tiny and far away"?

## Harness honesty

Bot runs are evidence about pacing, fairness and regressions, never a fun
verdict. The before/after pairs are two separate runs keyed to sim state, not
frame-locked replay, so RIG/hostile positions differ between sides — I judged
the glyph, the lamp and the pose, plus pixel measurements of the *subject*, not
frame deltas. Route/dare-pocket columns in the traversal-slice summaries carry
their usual caveats; `protoScore` here is the proxy source (no `?score=1`).

## Issue filed

`SPRINT.md` Inbox **I-021** (docs, S3): `README.md` and `docs/DESIGN.md` say the
pass scales tells back up "by the same factor" / "by the view's own pull-back
factor", but a tell POSE takes only 60% of it (`SHARE.pose = 0.6` → gain 1.54 at
FAR vs `depthMult` 1.9). Glyphs and lamps do take the whole factor. The module
header and the commit message state the split correctly; only the two
user-facing docs compress it into a claim the frames do not support.
