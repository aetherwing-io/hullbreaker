# T-055 — build report

Fixes I-048: the deploy bundle omitted `assets/generated/`, so uploading it
would silently ship the game with none of its art — and nothing would look
wrong, because every asset falls back to a primitive/flat/canvas shape
(decisions.md entry 16's own safety property). Worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-055`, branch
`task/T-055`, based on `main` @ `5684af2`. **Zero `src/` changes** — nothing
under `src/`, `index.html`, or `assets/` was touched.

## What changed and why

`task/T-034` (unmerged, predates every art lane) had three files: `tools/
deploy/build-bundle.mjs`, `tools/deploy/README.md`, and its own build report.
Its bundle pathspec was `index.html src` only, which was correct when it was
written (the game shipped zero binary assets) and has been wrong since
`decisions.md` entry 16 authorized runtime assets — main now loads 39 tracked
PNGs at runtime and none of them were in the archive.

**`tools/deploy/build-bundle.mjs` (rewritten from T-034's version).** Pathspec
is now `index.html src assets/generated` — see "Why `assets/generated/` and
not all of `assets/`" below for the deliberate narrowing. Added a third guard
(alongside the existing "ref has `index.html`" / "ref has `src/`" checks):
the ref must have at least one tracked PNG under `assets/generated/`, or the
build refuses with an explicit I-048 citation instead of silently producing
an art-less zip again. `--out`/`--ref`/`--help` behavior is unchanged.

**`tools/deploy/verify-bundle.mjs` (new).** The falsifying test the task
asked for: builds (or takes `--zip` for an existing one), unzips into a
clean `os.tmpdir()` directory **outside the repo**, serves it with `tools/
serve.mjs` on a scratch port, drives real headless Chrome (`playwright-core`,
`channel: 'chrome'`, resolved the same way `tools/durability/abuse.mjs`
already does — this directory's own install, then `tools/playtest`'s or
`tools/durability`'s, then `$HB_PLAYWRIGHT_CORE`), and reads `window.
__HB_PRELOAD()` / `__HB_SPRITES()` / `__HB_HULL_TEX()` / `__HB_BACKDROP()` to
assert the art reached `'ready'` rather than its fallback. It re-unzips a
second copy under a synthetic `/html/999999/hullbreaker-alpha/` path
(T-034's exact itch.io-shaped subpath) and repeats both the generic `?
selftest=1` check and the art-render check there, so a relative-asset-path
regression that only shows up under a subpath cannot hide behind a
flat-root-only pass.

**`tools/deploy/package.json` + `package-lock.json` (new).** Dev-only
`playwright-core` dependency, matching `tools/playtest`'s and `tools/
durability`'s own pattern exactly (own `package.json`, `npm install` once,
never a dependency of the game). `node_modules` added to the root
`.gitignore` alongside the existing `tools/playtest/` and `tools/
durability/` entries.

**`tools/deploy/README.md` (rewritten).** Kept T-034's structure and its
still-true claims (subpath hosting, the upload walkthrough), added §2 ("Proving
the bundle actually works") documenting `verify-bundle.mjs` and the binding
proof, corrected §3/4 (now the CDN section) for T-032, and added a "Bundle
size" section with the measured number. Full reasoning for the `assets/generated/`
vs. all-of-`assets/` decision is in the README itself (§1), not just here.

## Why `assets/generated/` and not all of `assets/`

Every runtime asset reference in `src/` was grepped and read, file by file:
`src/config.js` (backdrop root), `src/render/backdrop.js`,
`src/render/materials.js` (`TEX_DIR`), `src/render/sprite-table.js`
(`SPRITE_ROOT`), `src/render/sprites.js`, `src/render/player.js`
(`RIG_SPRITE_PATH`, from `src/pure/rig.js`). All eleven of them resolve under
`assets/generated/{backdrops,textures,sprites}/`. Nothing in `src/` ever
constructs a path under `assets/approved/` or reads `assets/manifest.json`.

- `assets/approved/` — confirmed via `tools/assets/README.md` ("`assets/
  approved/` is the operator's directory. Nothing here writes to it.") to be
  the operator's own manual-promotion directory; today it is empty but for a
  `.gitkeep`. Nothing to ship.
- `assets/manifest.json` — asset-pipeline provenance bookkeeping (per-file
  palette-check results, generator/task/notes), read by `tools/assets/
  check.mjs` and friends, never by the game. Nothing to ship.

The whole `assets/generated/` subtree ships rather than a curated list of the
specific files a static grep finds loaded today, deliberately: a per-file
allowlist in the bundle script would drift out of sync with a future asset
exactly the way the old `index.html`/`src`-only pathspec drifted out of sync
with entry 16 authorizing runtime assets in the first place — which is the
defect this task exists to close. The cost is stated, not hidden: `assets/
generated/` also carries `.svg` sources, `.recipe.js` generation recipes, and
a handful of manifest-only glyph/HUD-chip PNGs nothing in `src/` loads
(explicitly marked `"NOTHING LOADS IT"` in `assets/manifest.json`'s own notes
— staged design evidence for still-open operator directions, e.g. the T-036
glyph-scale candidates). Measured: **284 KB of dead weight in a 2.1 MB
tree** (`find assets/generated -name '*.svg' -o -name '*.recipe.js' | xargs
du -ch`).

## Verification — every command and its result

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **3148 passed, 0 failed** (unchanged before and after this task's changes — no `src/` file was touched) |
| `node tools/deploy/build-bundle.mjs` | `Wrote …/hullbreaker-web.zip (2160.0 KiB, 163 tracked files, 39 PNGs under assets/generated/, ref HEAD)` |
| `node tools/deploy/build-bundle.mjs --help` | prints usage, exit 0 |
| `node tools/deploy/build-bundle.mjs --ref not-a-real-ref` | `could not read ref 'not-a-real-ref' — not a valid commit/branch in this repo.`, exit 1 |
| `node tools/deploy/build-bundle.mjs --ref 1046f00` (a real pre-asset commit) | `'1046f00' has no tracked PNGs under assets/generated/ — refusing to build a bundle that would silently ship with none of the game's art (I-048)…`, exit 1 — the new guard, proven against a real historical ref |
| `node tools/deploy/verify-bundle.mjs` (builds fresh from HEAD) | **PASS** — 24/24 art checks + subpath `?selftest=1` (39 checks) + subpath art re-check, all green (full transcript below) |

### Proving the new test binds (I-048 reproduced on demand)

```
git archive --format=zip --output=/tmp/broken.zip HEAD -- index.html src
node tools/deploy/verify-bundle.mjs --zip /tmp/broken.zip --skip-subpath
```

This is I-048's exact original bug: `index.html` + `src/` only, no
`assets/generated/`. Result — every art check failed, and the tool exited 1:

```
-- flat root --
  [FAIL] RIG sprite (not canvas fallback)  (state=failed (error))
  [FAIL] hostile sprite: hound (not primitive)  (variant=b state=failed (error))
  [FAIL] hostile sprite: carrier (not primitive)  (variant=b state=failed (error))
  [FAIL] hostile sprite: wasp (not primitive)  (variant=b state=failed (error))
  [FAIL] hostile sprite: polyp (not primitive)  (variant=b state=failed (error))
  [FAIL] hostile sprite: mortar (not primitive)  (variant=b state=failed (error))
  [FAIL] hull texture file: hull-panel-tile.png  (not ready)
  [FAIL] hull texture file: hull-panel-tile.png?wall  (not ready)
  [FAIL] hull texture file: vent-louver-plate.png  (not ready)
  [FAIL] hull texture file: weld-seam-strip.png  (not ready)
  [FAIL] hull texture file: wear-scuff-overlay.png  (not ready)
  [FAIL] backdrop plates built  (built=0/12)
  [FAIL] backdrop plate: limbSegment (1)  (state=failed (error))
  ... (12 plates, all failed) ...

verify-bundle: FAIL
```

The game itself still booted in that run (nothing thrown, no console error
visible to a player, exactly entry 16's safety property working as intended)
— which is the whole reason I-048 is dangerous and a file-count check would
have missed it. Restoring to the real bundle (no `--zip`, building fresh from
`HEAD`) reproduced the full green transcript below. `git status --short` was
clean before and after this proof — the broken zip and its unzip target both
lived under `os.tmpdir()`, never inside this worktree.

### Full green transcript (`node tools/deploy/verify-bundle.mjs --ref HEAD`)

```
Wrote …/bundle-under-test.zip (2160.0 KiB, 163 tracked files, 39 PNGs under assets/generated/, ref HEAD).

-- flat root --
  [PASS] RIG sprite (not canvas fallback)  (state=ready)
  [PASS] hostile sprite: hound (not primitive)  (variant=b state=ready)
  [PASS] hostile sprite: carrier (not primitive)  (variant=b state=ready)
  [PASS] hostile sprite: wasp (not primitive)  (variant=b state=ready)
  [PASS] hostile sprite: polyp (not primitive)  (variant=b state=ready)
  [PASS] hostile sprite: mortar (not primitive)  (variant=b state=ready)
  [PASS] hull texture file: hull-panel-tile.png  (ready)
  [PASS] hull texture file: hull-panel-tile.png?wall  (ready)
  [PASS] hull texture file: vent-louver-plate.png  (ready)
  [PASS] hull texture file: weld-seam-strip.png  (ready)
  [PASS] hull texture file: wear-scuff-overlay.png  (ready)
  [PASS] backdrop plates built  (built=12/12)
  [PASS] backdrop plate: limbSegment (1)  (state=ready)
  ... (12 plates, all ready) ...

-- subpath hosting: ?selftest=1 at /html/999999/hullbreaker-alpha/ --
  [PASS] page title: "SELFTEST PASS (39 checks)"

-- subpath (art render) --
  [PASS] RIG sprite (not canvas fallback)  (state=ready)
  ... (all 24 checks, all ready) ...

verify-bundle: PASS
```

Both runs used the self-contained `playwright-core` install in `tools/
deploy/node_modules` (`npm install` run once in that directory, matching
`tools/playtest`'s own convention) — no reliance on `$HB_PLAYWRIGHT_CORE` for
the final proof, though that fallback also works (checked separately).
Ports used: 8760/8761 and 8765/8766 for repeated manual runs, all scratch,
all killed after. **8741/8742 were never bound.**

### CDN behavior — re-measured against current main (README §4 correction)

T-034's original measurement (blank `#232830` screen forever on a blocked
CDN, blank screen for the whole delay on a slow one) predates T-032. Repeated
T-034's exact method (Playwright request interception against the real,
unmodified `index.html`, no fixture) against this task's tree:

| scenario | result |
| --- | --- |
| CDN fully blocked (`route.abort('connectionfailed')` on `cdn.jsdelivr.net`) | **the T-032 failure panel now appears** — measured **55ms, 62ms, 64ms, 63ms** across four runs — `showing()` reports `'boot'`, panel text "The game could not start." |
| CDN slow (4s artificial delay, then success) | **unchanged**: still the blank `#232830` background with no panel through the entire delay (polled to 5.4s with no panel raised); the game then boots normally once the import resolves |

The blocked-CDN timing (order of 60ms, not the "~250ms" figure floated in
`SPRINT.md`'s I-048 entry) is this task's own measurement, on this machine,
not inherited — expect it to vary by machine/network stack, but it is
near-instant relative to any player-perceived wait either way. `tools/
deploy/README.md` §4 states both results plainly, including the still-open
gap (a slow-but-successful load under the 10s boot watchdog still shows
nothing for its duration).

## Bundle size and file count (measured)

**2160.0 KiB (≈2.1 MB), 163 tracked files, 39 PNGs under `assets/
generated/`.** Backdrop plates alone: ~1.6 MB (five files, 140–508 KB each,
`du -ch assets/generated/backdrops/*.png`). Fine for a public URL; stated
here and in the README rather than left for the operator to discover after
an upload.

## Open items

None outstanding for this task's own scope.

1. The CDN-slow-but-under-10s gap (blank screen, no panel, for however long
   the delay lasts) is real and unchanged from T-034 — an operator decision
   (accept, or vendor three.js), not made here, per the same reasoning T-034
   gave.
2. The favicon 404 T-034 found is still present, still cosmetic, still
   fenced to whoever next touches `index.html`.
3. `assets/generated/`'s ~284 KB of manifest-only, nothing-loads-it PNGs/SVGs
   (T-036's glyph-scale candidates, etc.) ship in every bundle by design (see
   "Why `assets/generated/` and not all of `assets/`" above). If that ever
   becomes real weight (a much larger staged batch), the trade only gets
   revisited by hand — this task is not proposing a manifest-driven filter.

## Open feel questions for the operator

None — this is a harness task with a machine-checkable acceptance test, not
a feel question. The two operator decisions T-034 originally flagged (CDN
risk acceptance vs. vendoring three.js; the 1280×720 embed viewport size)
are unchanged and still open, restated in `tools/deploy/README.md` §4/§5.

## Worktree / branch

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-055`
- Branch: `task/T-055` (not merged; based on `main` @ `5684af2`)
- Files added: `tools/deploy/build-bundle.mjs` (rewritten), `tools/deploy/
  README.md` (rewritten), `tools/deploy/verify-bundle.mjs` (new), `tools/
  deploy/package.json` + `package-lock.json` (new), `reports/tasks/T-055/
  build.md` (this report), `reports/tasks/T-055/evidence/boot-flat.png` +
  `boot-flat-moved.png` (new). One line added to the root `.gitignore`
  (`tools/deploy/node_modules/`, matching the existing `tools/playtest/` and
  `tools/durability/` entries). No other files touched; `src/`, `index.html`,
  `assets/`, `tools/pathcheck.mjs`, `tools/playtest/**`, `tools/durability/**`,
  `SPRINT.md`, `CLAUDE.md` all unmodified.

## Evidence

- `reports/tasks/T-055/evidence/boot-flat.png` — the built bundle, unzipped
  to a clean `os.tmpdir()` directory, served, and loaded fresh (`?shell=0`,
  spawn position): tiled hull-panel deck texture, a backdrop plate silhouette
  in the distance (upper right), RIG's real sprite (tiny, on the walkway).
- `reports/tasks/T-055/evidence/boot-flat-moved.png` — same served bundle,
  after ~4.5s of held `ArrowRight`: two hostile sprites visible (small
  acid-green shapes), a capsule pickup glyph, more of the hull tiling and
  backdrop in view. `window.HB.hostiles.length === 5` at capture time.

Both screenshots are visual corroboration; the falsifying test's actual
teeth are the `window.__HB_*` diagnostic-surface assertions in `verify-
bundle.mjs`, which is what the binding proof above exercises. I make no claim
about how good the art looks — T-053/T-054 already own that question
(hull-texture visibility specifically); this task only confirms the shipped
asset is the thing rendering, not its fallback.

## Single best next action

Integrator merges `task/T-055` (or the operator runs `node tools/deploy/
build-bundle.mjs && node tools/deploy/verify-bundle.mjs` themself, then
uploads the resulting `hullbreaker-web.zip` per `tools/deploy/README.md` §5).
The two decisions T-034 left open (CDN risk acceptance vs. vendoring; embed
viewport size) are still the operator's to make and are not blockers for
using the bundle as-is.
