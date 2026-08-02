PASS

Task: T-053 — procedural raster generation path (`tools/assets/**`, dev-only
asset pipeline). DoD class: **harness/tooling** — zero effect on the shipped
game, tool README updated with an honesty/limitations note.

Re-gate scope (per team-lead dispatch): narrow — verify the I-044 alpha-cutout
rework only. A prior PASS (`reports/tasks/T-053/playtest.md` in the main
checkout, commit `2f1af45`) already covered generation determinism, the
palette-mass gate rewrite, and general legibility; this pass re-checks what
changed since: the five backdrop plates going from opaque rectangles back to
real cutout silhouettes with an authored feather.

Commit tested: `a7e63d0` (`task/T-053`), merge-base `9cc80f7`.

## Process note — the worktree moved during this gate, verified harmless

Mid-gate, `HEAD` advanced to `6b9f500` ("document the anchor-cap fix and
re-measured calibration") — a second agent finishing the writeup the same
session. This is the same class of shared-worktree drift the previous
playtest report flagged. I did not restart on a freshly pinned copy this
time because I checked first: `git show --stat 6b9f500` touches only
`tools/assets/README.md` and `reports/tasks/T-053/build.md` — no asset PNG,
no recipe, no manifest, no `src/`, no `tools/assets/*.mjs` or `lib/*.mjs`. Every
number and gate result below is therefore valid at both `a7e63d0` and
`6b9f500` identically; nothing measured here could have moved. Practically
useful side effect: `6b9f500`'s README update fixed a real staleness I'd
caught independently before it landed — see "What I did not have to file"
below.

## 1. The nine regenerated files — valid, unchanged shape

All 9 (`backdrop-{colony-cluster,crown-horizon,gill-cavity,limb-segment,
spine-coil}`, `hull-panel-tile`, `vent-louver-plate`, `wear-scuff-overlay`,
`weld-seam-strip`) checked directly against `main`'s committed blobs
(`git show main:<path>`, not inherited from the prior report):

| asset | main bytes | T-053 bytes | ratio | dims (both sides) |
| --- | --- | --- | --- | --- |
| backdrop-colony-cluster | 7,692 | 198,341 | 25.8x | 512x256 |
| backdrop-crown-horizon | 9,369 | 140,660 | 15.0x | 1024x256 |
| backdrop-gill-cavity | 23,737 | 444,616 | 18.7x | 512x512 |
| backdrop-limb-segment | 37,776 | 518,172 | 13.7x | 1024x512 |
| backdrop-spine-coil | 31,458 | 348,758 | 11.1x | 512x512 |
| hull-panel-tile | 1,243 | 12,125 | 9.8x | 128x128 |
| vent-louver-plate | 2,461 | 23,916 | 9.7x | 128x128 |
| wear-scuff-overlay | 4,134 | 16,840 | 4.1x | 128x128 |
| weld-seam-strip | 333 | 8,678 | 26.1x | 128x32 |
| **total** | **118,203** | **1,712,106** | **14.5x** | |

Dimensions identical on both sides for all 9 (checked with `sips -g
pixelWidth -g pixelHeight`, independent of this repo's own decoder) — T-051's
binding on these exact files holds. All 9 decode cleanly: macOS `sips`
succeeds on every file, and `node tools/assets/check.mjs` (which decodes every
PNG through this repo's own zero-dependency `lib/png.mjs`) reports `ok` for
all 38 manifest entries, 9 of them these.

**Byte sizes moved in both directions since the last gate**, worth stating
plainly: the previous PASS report (`2f1af45`, pre-alpha-fix) measured this
same set at 2,353,887 bytes total (~20x main); this gate measures 1,712,106
bytes (~14.5x). The alpha rework *reduced* several files' PNG size even while
adding real transparency data — `backdrop-limb-segment` 852,462 -> 518,172
bytes is the largest drop. Plausible mechanism: large transparent/feathered
regions compress better than the fully-painted-in fog they replaced; not
independently modeled here, just measured.

**PNG color format unchanged, checked at the byte level.** Read each
backdrop's IHDR chunk directly (`bitdepth`, `colortype`) on both `main` and
this branch: all five are `colortype 6` (RGBA, 8-bit) on **both** sides,
identical to before. The alpha rework changes per-pixel alpha *values*
(feathered vs hard-cut), not the pixel format or channel count — relevant to
durability below.

## 2. Gates

```
node tools/pathcheck.mjs        2469 passed, 0 failed
node tools/assets/check.mjs     PASS, 38 assets, "ok" for all 9 regenerated
node tools/assets/check.mjs --selftest
  23 palette + 25 import-scan + 7 raster-mass + 8 alpha-contract + 16 recipe-contract cases, all PASS
```

Matches the build lane's claimed counts exactly — independently re-run, not
inherited. `2469/0` is this branch's own base (predates T-040/T-044/T-049/T-052
landing on `main`), not a regression; computed by running pathcheck in this
worktree directly, not by trusting the number in the dispatch brief.

## 3. Zero effect on the shipped game — demonstrated

- `git diff main...HEAD --name-status -- src/ index.html`: **no output**.
- `git diff $(git merge-base main HEAD)...HEAD --name-status | grep -E
  '^.\s+(src/|index\.html)'`: **NONE**. Byte-identical to the merge-base, not
  inherited from a diffstat.
- Smoke set, pinned worktree (`node tools/serve.mjs 8770 --root
  .claude/worktrees/T-053 --quiet`, port 8770 — never touched 8741/8742):

  | script | outcome | consoleErrors | pageErrors | bootError |
  | --- | --- | --- | --- | --- |
  | mid-route | completed | 0 | 0 | none |
  | transform-slice | completed | 0 | 0 | none |

  Full reports: `/private/tmp/.../scratchpad/t053-{mid-route,transform-slice}/`
  (scratchpad, not committed — the point of this table is the pass/fail and
  error counts, reproduced below under Commands).
- `src/render/` contains no `backdrop.js` and no reference to `assets/` at all
  in this worktree (T-051's wiring is a separate, unmerged lane) — there is
  nothing in this tree that could load these plates yet, which is the
  strongest form of "zero effect."

## 4. Alpha rework, judged at true on-screen size

**Both specifics the dispatch asked for:**

**`backdrop-crown-horizon`, 0.0% opaque.** Census (`node tools/assets/alpha.mjs`,
reproduced independently): 72.18% transparent, 27.82% partial, 0.00% opaque.
Rendered at true on-screen width (1045px, `evidence/qa/alpha-crown-horizon-
truesize.png`): over the actual game-teal background token, the horizon
silhouette is legible but low-contrast — a jagged ridge line is visible on
close inspection, anchored mainly by ~5 small hot-magenta spire-tip accents,
which read more clearly than the ridge shape itself. Over hot magenta and a
checkerboard (both artificial, not the in-game condition), the same alpha data
resolves a sharply-defined, detailed crenellated silhouette with dozens of
individual spire teeth — confirming the shape itself is a real authored
silhouette, not noise or a blurry smear, and that the low real-world contrast
is a color/value choice (teal-on-teal) rather than a soft or malformed alpha
channel. This matches `reports/tasks/T-053/build.md`'s own account (the
recipe applies a flat `0.94` alpha ceiling on top of, not instead of, a real
contour feather, because it's authored as "the most distant thing in the
game") — I verified this by eye independently before reading that section,
same conclusion. **Whether "faint but real" is the right amount of faint for
a horizon element is a look call, not mine** — routed below.

**Two-plate depth composite.** No render code exists in this tree to test the
real three-tier compositing (T-051's `backdrop.js` isn't here), so I built a
flat CSS approximation at true FAR-view pixel scale (60x30 / 60x15 tiles ->
17.412 px/tile, the same arithmetic `tools/assets/README.md` documents and
`view.mjs` uses) — `backdrop-limb-segment` (near, 26.9% opaque) over
`backdrop-crown-horizon` (far, 0% opaque), offset so a far-only strip, a
near-only strip, and a genuine overlap band are all visible in one frame:
`evidence/qa/composite-near-far.png`. Result: in the overlap band the near
plate's opaque body correctly occludes the far plate behind it (physically
correct — a large near foreground mass blocking a distant horizon is not a
defect); where the near plate is transparent (most of its own canvas, and the
entire region outside its bounds), the far plate's silhouette and magenta
accents remain fully visible, unaltered in color or contrast — no haze, no
wash-out, no visible seam at the near plate's own feathered edge. The near
plate's dissolve (13.75% partial alpha, `evidence/alpha/limb-t053-fixed.png`
already committed by the build lane, cross-checked here) blends smoothly into
whatever is behind it rather than the ~0.48%-partial hard cut `main` ships —
this is the actual fix I-044 asked for, and it is genuinely present, not
just declared.

**Every plate's declared alpha kind matches its measured census, independently
re-run** (`check.mjs` thresholds: `cutout` >=5% transparent AND >=2% partial;
`opaque` <=0.5%/<=0.5%; `overlay` >=40% transparent, <=5% opaque):

| asset | declared | transparent | partial | opaque |
| --- | --- | --- | --- | --- |
| backdrop-limb-segment | cutout | 59.38% | 13.75% | 26.88% |
| backdrop-spine-coil | cutout | 49.51% | 20.28% | 30.22% |
| backdrop-crown-horizon | cutout | 72.18% | 27.82% | 0.00% |
| backdrop-colony-cluster | cutout | 41.27% | 23.51% | 35.22% |
| backdrop-gill-cavity | cutout | 6.83% | 35.12% | 58.06% |
| vent-louver-plate | cutout | 5.35% | 5.15% | 89.50% |
| hull-panel-tile | opaque | 0.00% | 0.00% | 100.00% |
| weld-seam-strip | opaque | 0.00% | 0.00% | 100.00% |
| wear-scuff-overlay | overlay | 71.34% | 28.66% | 0.00% |

All comfortably clear their thresholds except `vent-louver-plate`, whose
5.35% transparent sits only 0.35 points above the 5% cutout floor — the
tightest margin in the set (not a failure, worth watching if this specific
plate is regenerated again).

I did not independently re-run the alpha gate's own break/restore (flattening
a plate's alpha to test the gate fails) — I attempted a scratch flatten via
PIL on a copy and the permission system blocked the write, correctly reading
it as editing a fixture file outside QA's lane. Instead I verified the
committed evidence is real rather than asserted: `evidence/alpha/gate-catches-
the-regression.txt` is a real committed file whose 10 named failures (all 5
plates, both the transparent and partial thresholds) match the exact
`ALPHA_RULES` thresholds above, and `git show a7e63d0`'s diff independently
confirms `lib/manifest.mjs`'s `ALPHA_RULES`/`ALPHA_KINDS` and `check.mjs`'s
alpha-contract check landed in this commit, not just in prose.

## 5. Durability

- **Decode is trivial.** Timed `img.decode()` for all 9 assets in real Chrome,
  two clean runs: steady-state 1.1–7.4ms each (total ~25–30ms for all nine).
  One ~55–65ms outlier appeared once per session on whichever asset decoded
  first (`hull-panel-tile` once, `backdrop-limb-segment` once, across 3 runs)
  — a one-time per-page decode-pipeline warm-up, not tied to any specific
  file or to the alpha rework.
- **Texture memory is unaffected**, and this time actually checked at the
  format level rather than inferred from dimensions alone: `main`'s and this
  branch's backdrop PNGs are both `colortype 6` (RGBA8) at identical W×H, so
  uncompressed GPU VRAM (W×H×4 bytes, ignoring mip levels) is bit-for-bit the
  same on both sides. The alpha rework changes stored alpha *values*, not
  channel count — nothing about "adding an alpha channel" costs anything
  here, because main's plates already had one (I-044's own numbers:
  `backdrop-limb-segment` on `main` was already 50.2%/49.3%/0.48% — a
  channel that existed, just barely used).
- **Disk/network footprint is real but small in absolute terms**: 1.71MB for
  all 9 files, largest single file 518KB. Not a load-time concern for a
  laptop-class public URL; see §1 for the ratio vs `main` and why it dropped
  since the prior gate.
- Nothing in this branch is wired to load at runtime yet, so today all of the
  above costs nothing at all — it matters the moment T-051/T-052 land.

## What I did not have to file

While reading `tools/assets/README.md`, I initially found its "Palette
compliance (raster)" table stale relative to the live `check.mjs` output at
`a7e63d0` (README said `wear-scuff-overlay` 1.298% worst off-band /
`backdrop-crown-horizon` 0.0546% worst alien — both pre-alpha-fix numbers;
live `check.mjs` measured 1.365% / 0.0457%, both on `backdrop-crown-horizon`,
since the alpha cutout shrank the counted pixel mass). This would have been a
docs-honesty finding (`I-???` docs S3) — but commit `6b9f500` landed mid-gate
and fixed exactly this, with the correct re-measured numbers and a
`maxAnchors: 48 -> 64` explanation I checked and found consistent with the
live gate output. Noting it here rather than filing it, since it's already
fixed and committed.

## PROPOSED INBOX ISSUES

None. No blocking defect found in this re-gate.

## Operator checkpoint queue (feel — not mine to judge)

The build lane's own 5 questions (`build.md` "Questions for the operator")
already cover the backdrop set generally. One more, specific to this rework,
that isn't in that list:

**`backdrop-crown-horizon`'s silhouette over the actual game-teal background is
low-contrast — evidence: `reports/tasks/T-053/evidence/qa/alpha-crown-horizon-
truesize.png` (top-left panel) and `composite-near-far.png`.** No live URL
exists yet (T-051 isn't merged), so these are flat captures, not a running
scene.

1. The ridge silhouette is legible on close inspection but reads mainly through
   its ~5 magenta spire-tip accents rather than the ridge shape itself — is
   that "distant and hazy" or "too faint to register" for a first-time player
   scanning the sky quickly?
2. Is the magenta-tip-only legibility strategy (silhouette faint, accents
   sharp) the right one for the farthest tier, or should the base silhouette
   carry more value contrast against the sky it will actually sit on?
3. The manifest's own note says "no pixel fully opaque anywhere" is
   intentional for this specific plate (farthest in the depth stack) — is that
   still true once this plate is seen composited with real fog/depth tinting
   from `backdrop.js` rather than the flat teal shown here?

## Commands (reproduce this verdict)

```sh
# gates
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-053
node tools/pathcheck.mjs                    # 2469 passed, 0 failed
node tools/assets/check.mjs                 # PASS, 38 assets
node tools/assets/check.mjs --selftest      # 23+25+7+8+16 cases, PASS

# zero-effect
git diff main...HEAD --name-status -- src/ index.html                 # empty
git diff $(git merge-base main HEAD)...HEAD --name-status | grep -E '^.\s+(src/|index\.html)'  # NONE

# pinned smoke set (port 8770; 8741/8742 untouched)
node tools/serve.mjs 8770 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-053 --quiet &
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8770
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8770
# both: outcome completed, 0 consoleErrors, 0 pageErrors, no bootError

# alpha census + true-size captures
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-053
node tools/assets/alpha.mjs assets/generated/backdrops/backdrop-crown-horizon.png --width 1045 \
  --out reports/tasks/T-053/evidence/qa/alpha-crown-horizon-truesize.png
```

The near/far composite (`composite-near-far.png`) was produced by a scratch
script (not committed to this branch; it only imports `tools/assets/lib/
browser.mjs` read-only and writes its own throwaway page) — happy to hand it
over if the integrator wants it re-runnable; it isn't part of this lane's
deliverable and I didn't add it under `tools/assets/`.

Evidence: `reports/tasks/T-053/evidence/qa/{alpha-backdrop-crown-horizon,
alpha-crown-horizon-truesize,composite-near-far}.png` (this pass);
`reports/tasks/T-053/evidence/alpha/` and `reports/tasks/T-053/build.md`
(build lane's own, cross-checked, not inherited blindly).
