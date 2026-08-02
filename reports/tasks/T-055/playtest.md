PASS

Gate: T-055 (revive the itch.io deploy bundle, fix I-048). Harness-class task,
zero `src/` changes claimed. Worktree pinned at HEAD `30b795d`
(`task/T-055`). All testing below was done against a `git archive HEAD | tar
-x` copy plus a freshly-built zip — the worktree itself was never served or
mutated; the only write into the worktree is this report and the evidence
PNGs under `reports/tasks/T-055/evidence/`.

## What I judged

### 1. Zero effect on the shipped game (shown, not asserted)

- `git diff $(git merge-base main HEAD) HEAD -- src index.html` → **0 lines**.
  The only tracked diff vs `main` is `.gitignore` (+1 line, `tools/deploy/
  node_modules/`), `tools/deploy/**` (new), and `reports/tasks/T-055/**`.
- `node tools/pathcheck.mjs` run directly in the worktree: **3148 passed, 0
  failed** — matches the reviewer's number and the task's expectation.

### 2. Independent bundle build + bundle size/file count

Built the bundle myself (not trusting the committed `build.md`), from the
worktree, output redirected to scratch (`node tools/deploy/build-bundle.mjs
--ref HEAD --out <scratch>/hullbreaker-web.zip`):

- **2160.0 KiB (≈2.1 MB) on disk, 163 actual files + 13 directories (176 zip
  entries), 39 PNGs under `assets/generated/`.** Matches the task's own
  claim independently.
- Confirmed `build-bundle.mjs`'s art guard is real: it refuses (exit 1) to
  build from a ref with zero `assets/generated/**.png` — read in the source,
  and its inverse (a ref that has the art) built cleanly, as above.

### 3. The bundle is genuinely playable, not just loadable

Unzipped the built zip into a **clean directory outside the repo**
(`<scratch>/flat`), served it with `tools/serve.mjs` on a scratch port
(8780 — never 8741/8742), and:

- Ran the two smoke scripts from the **main checkout's** playtest harness
  against that server, `--deterministic --base-url http://127.0.0.1:8780`:
  - `scripts/mid-route.json` → `outcome: completed`, `pageErrors: []`, no
    `bootError`.
  - `scripts/transform-slice.json` → `outcome: completed`, `pageErrors: []`,
    no `bootError`.
  (Screenshots: `evidence/qa-smoke-mid-route.png`,
  `evidence/qa-smoke-transform-slice.png` — end-of-run overlays, textured hull
  visible even at that zoom.)
- Wrote my own diagnostic + capture script (not the task's `verify-bundle.mjs`
  — a second, independent instrument) that boots the unzipped bundle with
  `?shell=0`, reads `window.__HB_PRELOAD/__HB_SPRITES/__HB_HULL_TEX/
  __HB_BACKDROP` directly, and screenshots. Result: RIG's sprite `ready`, all
  5 hostile kinds `ready`, all 5 hull texture files `ready`, all 12 backdrop
  plates `ready`, zero `pageErrors`.
- Drove the run further (held right + fire, hopped every ~1.2s for 9.6s) to
  get actual hostiles on screen and looked at the pixels, not just the flags:
  `evidence/qa-flat-hostile-inview.png`, cropped and upscaled at
  `evidence/qa-rig-crop.png` (RIG is a real marine sprite — helmet, rifle
  silhouette — not a canvas placeholder) and `evidence/qa-hostile-crop.png`
  (a segmented carrier body and a winged wasp body, both clearly illustrated,
  not primitive shapes). Hull shows a plated/checker panel texture and the
  backdrop shows distant machine silhouettes in both `evidence/qa-flat-
  boot.png` and `evidence/qa-subpath-boot.png`.
- Also ran the task's own `node tools/deploy/verify-bundle.mjs --ref HEAD`
  (default ports 8752/8753) as a **corroborating**, not sole, check: 24/24
  art assertions PASS at flat root, `SELFTEST PASS (39 checks)` and 24/24 art
  assertions PASS again at the subpath, overall PASS. Matches my own
  independent instrument's findings exactly.

**Negative control (proves the falsifying test actually binds, and proves
I-048 was real):** built the *old* bug shape directly with `git archive
--format=zip -- index.html src` (no `assets/generated/`), served it
separately (port 8782), and ran my own diagnostic script against it:
game still reaches `PLAYING` with **zero `pageErrors`** — it boots and plays
completely silently — but RIG's sprite reports `state: failed`, all 5
hostile kinds report `failed`, all 5 hull texture files report `false`, and
`backdrop built: 0/12`. Screenshot + crops: `evidence/qa-negative-control-
greybox.png`, `-rig-crop.png` (RIG is a flat grey capsule with a plain
yellow bar for a gun), `-hostile-crop.png` (hostiles are flat green
triangles). Side-by-side against the fixed bundle's crops, this is the exact
defect I-048 described: a broken bundle that looks like a deliberate
grey-box build with no error anywhere. The fix (`assets/generated` in the
pathspec) demonstrably closes it.

### 4. Subpath hosting (itch.io-shaped)

Unzipped a **second** copy of the same zip under a synthetic nested path,
`<scratch>/subpath/html/999999/hullbreaker-alpha/`, served the `subpath`
directory as server root on port 8781, and loaded `http://127.0.0.1:8781/
html/999999/hullbreaker-alpha/index.html?shell=0`.

- `curl` confirmed the server's literal root has no game (`/index.html` at
  the subpath server's root → **404**; only the nested path serves anything).
- Same diagnostic snapshot as flat root: RIG/hostiles/hull/backdrop all
  `ready`, `pageErrors: []`. Screenshot (`evidence/qa-subpath-boot.png`) is
  visually identical to the flat-root capture at the same run instant.
- **Watched the actual network log, not a summary:** captured every
  `page.on('request')` URL for the full boot (111 requests). Filtered out
  the expected `cdn.jsdelivr.net` three.js fetch; **zero** of the remaining
  same-origin requests fell outside `/html/999999/hullbreaker-alpha/`, and
  **zero** requests hit the literal server root (`/` or `/index.html`) at
  all. Subpath hosting holds with no absolute-root leak.

### 5. Durability across the unzipped bundle

Both smoke scripts, the driven 9.6s hostile-capture run, and three repeated
timing/boot loads (see below) completed cleanly on the unzipped, re-served
copy — no blank page, no softlock, no crash, no `pageErrors` in any of the
five separate browser sessions launched against it (2 smoke scripts + flat
diagnostic + subpath diagnostic + hostile-capture + 3 timing runs = 7
sessions total, all clean).

### 6. Load time (honest caveat)

Three cold `chromium.launch()` sessions (fresh profile each time) against
the localhost-served flat bundle: `PLAYING` reached at 413ms / 355ms / 356ms
from navigation start, preload settled ~100ms after that. This is **only
evidence that nothing in the bundle itself is pathologically slow to parse
or boot** — it is served over loopback with no real network latency, so it
is not a stand-in for itch.io's actual public-URL load time, which
`tools/deploy/README.md` §4 already flags as untested against a live upload.

## Commands (reproduce)

```sh
# from the worktree, read-only:
node tools/pathcheck.mjs
node tools/deploy/build-bundle.mjs --ref HEAD --out /tmp/hullbreaker-web.zip
node tools/deploy/verify-bundle.mjs --ref HEAD   # corroborating only

# clean-directory serve + smoke (main checkout harness, pinned worktree):
unzip -q /tmp/hullbreaker-web.zip -d /tmp/hb-flat
node tools/serve.mjs 8780 --root /tmp/hb-flat --quiet &
cd tools/playtest   # main checkout
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8780
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8780

# negative control:
git archive --format=zip --output=/tmp/broken.zip HEAD -- index.html src
node tools/deploy/verify-bundle.mjs --zip /tmp/broken.zip --skip-subpath
# -> expect exit 1, every art check FAIL (this reproduced cleanly)
```

## Verdict

**PASS.** The bundle contains and renders every runtime asset the shipped
game loads, at both flat root and a synthetic itch.io-shaped subpath, proven
by two independent instruments (my own script and the task's
`verify-bundle.mjs`) plus eyes-on screenshots of RIG and two hostile kinds
mid-play — not just an automated verdict. The negative control confirms the
test is a genuine falsifying test: the pre-fix bundle shape boots silently
and looks like the grey-box build, exactly as I-048 described. Zero `src/`/
`index.html` diff vs `main`, pathcheck 3148/0, `.gitignore`/README updated
appropriately. No feel judgment made or needed — this is a harness/tooling
gate.

Evidence: `reports/tasks/T-055/evidence/qa-*.png` (this pass) alongside the
existing `boot-flat.png`/`boot-flat-moved.png` (build report's own capture).
