# Deploying HULLBREAKER (itch.io zip · GitHub Pages branch)

T-034 built this story; T-055 fixed the one thing in it that was wrong
(I-048: the bundle omitted `assets/generated/`, so it would have shipped a
game with none of its art and nothing to notice); 2026-08-04 pruned the
~92 MB of pipeline intermediates the art landings had grown into the bundle
and added the GitHub Pages recipe (§7). The 2026-08-05 cache-consistency pass
made the Pages package revision-aware after a new document was observed
loading an older cached HUD module. This is the whole deploy story for a
static-host bundle: how to build it, how it is proven to actually contain
and render the art, the one honest remaining risk (the three.js CDN), and
the exact steps to publish it. Nothing here changes the source game —
`src/`, `index.html`, `assets/`, `tools/pathcheck.mjs`, etc. are all
untouched by the deploy tooling.

## TL;DR

1. `node tools/deploy/build-bundle.mjs` → writes `hullbreaker-web.zip`
   (index.html + src/ + assets/generated/ minus review/source
   intermediates, ~75 MiB — see "Bundle size" below).
2. `node tools/deploy/verify-bundle.mjs` → unzips it into a clean directory
   outside the repo, serves it, and asserts the art actually renders (not
   just that the zip contains files — see "Proving the bundle actually
   works" below). Run this before every upload that matters.
3. For Pages, `build-pages-site.mjs` gives that verified content a
   commit-scoped module URL and `verify-pages-site.mjs` proves a warm browser
   cannot combine two releases (§7). For itch.io, upload the zip as an
   **HTML** project, check **"This file will be played in the browser,"** set
   a viewport size, and save.
4. Open the game page and play it. If it doesn't load, see "The CDN risk"
   below before assuming something else is broken.

## 1. Build the bundle

```
node tools/deploy/build-bundle.mjs
```

This writes `hullbreaker-web.zip` in whatever directory you run it from
(`--out path/to/file.zip` to choose another location). It runs `git archive
--format=zip` against `HEAD`, restricted to `index.html`, `src/`,
`assets/ui/favicon.svg`, and `assets/generated/` minus the pruned
pipeline-intermediate directories described below — everything a browser
fetches from this host. No transformation, no minification, nothing added
or removed beyond that path filter. `--ref <commit-or-branch>` archives a
specific commit instead of your current checkout if you ever need to ship
an older or pinned build.

The zip has `index.html` sitting at its own root (not inside a subfolder) —
that's the layout itch.io's uploader expects.

**Why `assets/generated/` and not all of `assets/` (T-055 / I-048).** Every
runtime asset reference in `src/` — grepped across `src/config.js`,
`src/render/backdrop.js`, `src/render/materials.js`,
`src/render/sprite-table.js`, `src/render/sprites.js`, `src/render/player.js`,
`src/pure/rig.js` — resolves under `assets/generated/{backdrops,textures,
sprites}/`. Nothing loads `assets/approved/` (the operator's own promotion
directory; today it holds only a `.gitkeep`) or `assets/manifest.json`
(asset-pipeline provenance bookkeeping, not fetched by the game), so neither
ships. `assets/ui/favicon.svg` DOES ship, because `index.html` links it.
The `assets/generated/` subtree ships as a directory-level pathspec, not a
curated list of just the files a grep finds referenced today: a per-file
allowlist would silently drift out of sync with a future asset exactly the
way the old `index.html`/`src`-only pathspec silently drifted out of sync
with `decisions.md` entry 16 authorizing runtime assets.

**The one prune (2026-08-04, GitHub Pages).** The subtree ships minus one
naming convention: any path segment starting with `review` or `source`, or
ending in `-sources`. Those are asset-pipeline intermediates (review boards,
source sheets, the foreground pack's ~17 MB of sources) that no runtime code
fetches — 86 tracked files, ~92 MB, more than half the old bundle. All 31
asset paths referenced from `src/` and `index.html` were checked against the
convention before it landed; none match. The residual risk — a future
runtime asset placed in a `source-*` directory silently vanishing from the
bundle — is exactly what `verify-bundle.mjs` catches, loudly, by booting the
zipped game. A broader `*contact*` prune was considered and rejected:
`sprites/rig-run-contact-v1.png` is a real sprite-family file whose name
matches it, so the ~7 MB `action-vfx-v2` contact sheet still ships, along
with the `.svg` sources, `.recipe.js` generation recipes, and staged
glyph/HUD-chip PNGs — the stated, accepted dead weight in exchange for the
bundle never again being the reason a shipped asset is missing.

## 2. Proving the bundle actually works (T-055 / I-048)

**The defect this closes:** a file-count or zip-contents check would have
passed the broken bundle every day since `decisions.md` entry 16 retired
"the game must boot with `assets/` missing" — the old pathspec omitted
`assets/generated/` entirely, and the game's own safety property (every
missing asset degrades to a primitive/flat/canvas shape, per entry 16) meant
the uploaded build would have **run flawlessly and looked exactly like the
pre-2026-08-02 grey-box**, with no error anywhere for anyone to notice.

So the acceptance test does not open the zip and count files:

```
node tools/deploy/verify-bundle.mjs
```

This builds the bundle, **unzips it into a clean directory that is not the
repo** (a fresh `os.tmpdir()` tree), serves that directory with
`tools/serve.mjs` on a scratch port, drives a real headless Chrome
(`playwright-core`, resolved from whichever of `tools/deploy`, `tools/
playtest` or `tools/durability` has it installed, or `$HB_PLAYWRIGHT_CORE`),
and reads the game's own diagnostic surfaces to confirm the art actually
reached the screen rather than its fallback:

| what | read from | fallback if it had failed |
| --- | --- | --- |
| RIG's production body and weapon art | `window.__HB_PRELOAD()` (body/weapon atlas entries ready) plus `window.__HB_RIG_VISUAL()` (body and gun art ready, no canvas fallback) | procedural canvas body / geometry gun |
| every hostile's sprite (both `?spritevar=` candidates) | `window.__HB_SPRITES()` | the primitive body mesh |
| the 4 hull texture files | `window.__HB_HULL_TEX()` | flat material, no bump |
| the 5 backdrop plates (12 placements) | `window.__HB_BACKDROP()` | the existing flat/limb background |

It also re-proves T-034's subpath-hosting claim (itch.io serves from
`https://html.itch.zone/html/<upload-id>/<slug>/`, never the domain root) by
unzipping a second copy under a synthetic three-level path and repeating
**both** the generic `?selftest=1` check and the art-render check there —
a relative-asset-path regression that only shows up under a subpath cannot
hide behind a flat-root-only test passing.

**Proving this test itself binds** (do this again after touching
`build-bundle.mjs` or the asset-loading code path):

```
git archive --format=zip --output=/tmp/broken.zip HEAD -- index.html src
node tools/deploy/verify-bundle.mjs --zip /tmp/broken.zip --skip-subpath
```

That is I-048's exact original bug, reproduced on demand. Measured for this
task: every one of the 24 art checks above reported `FAIL` (`state=failed`
for every registered asset, `built=0/12` backdrop plates), and the tool
exited 1. The same command with no `--zip` (building the real, fixed bundle)
reported all 24 `PASS` plus the subpath re-check, and exited 0. Both runs are
quoted in full in `reports/tasks/T-055/build.md`.

`tools/deploy/verify-bundle.mjs --help` documents `--ref`, `--port`,
`--screenshot` and `--keep`. First run: `npm install` in `tools/deploy/`
(same one-time step `tools/playtest`'s own README asks for).

## 3. What T-034 verified, still true today

**Subpath hosting: works today, unmodified.** The game already uses only
relative paths — `index.html` loads `src/main.js` via a relative
`<script type="module" src="src/main.js">`, and every import inside `src/`
is a relative specifier or a bare `three`/`three/addons/` specifier resolved
by the import map. Every runtime asset load added since T-034 (RIG's
sprite, the hostile sprites, the hull textures, the backdrop plates) resolves
its URL the same subpath-safe way — `new URL('../../assets/generated/…',
import.meta.url)` inside the loading module, never an absolute `/assets/…`
path — so the art travels with the rest of the subpath proof rather than
being a new place for it to break. There is no absolute-root path, no
assumed hostname, and the one runtime use of `location`
(`src/ui/shell.js`'s "copy a link with this flag" helper) reads
`location.pathname` rather than hard-coding one.

Reproved for this task by `verify-bundle.mjs`'s own subpath check (see
above): `?selftest=1` under a synthetic `/html/999999/hullbreaker-alpha/`
path reported **`SELFTEST PASS (39 checks)`** (T-034 measured 29; the suite
has grown with the game since), and the art-render check passed all 24
assertions at that same nested path.

**The favicon 404, for the record: fixed 2026-08-04.** This note used to
record that the game shipped no icon at all and Chrome's automatic
`/favicon.ico` request 404'd. `index.html` now has `<link rel="icon"
href="assets/ui/favicon.svg">` and the favicon is in the bundle pathspec,
so the icon travels with the game on any static host.

## 4. The CDN risk — stated plainly, corrected for T-032

three.js loads from `https://cdn.jsdelivr.net/...` via the import map in
`index.html`. **This is not vendored — it should not be, without a recorded
operator decision** (`CLAUDE.md`'s no-runtime-deps / no-build-step rules).
T-034 measured this with real network interception (Playwright request
routing against the real, unmodified `index.html`), and this task
**re-measured it against current main**, because T-032 (merged after T-034
was written) changed the answer for one of the two cases:

- **CDN fully blocked** (a hard network abort on every `cdn.jsdelivr.net`
  request): **T-032's failure panel now catches this.** The inline
  bootstrap installed in `index.html`'s `<head>` (before the import map)
  runs a capture-phase `error` listener; a blocked module import fails the
  `<script type="module" src="src/main.js">` element itself, which the
  listener treats as fatal (`target.tagName === 'SCRIPT'`) and raises the
  **"The game could not start."** panel — a readable screen, a restart
  button, and the technical detail behind a fold, instead of the silent
  `#232830` dark background T-034 found. Measured for this task (three
  repeated runs, same method as T-034's): the panel appeared in **55–64 ms**
  — near-instant relative to any player-perceived wait, though the exact
  number will vary by machine and is not a frozen constant anywhere. T-032's
  own build report (`reports/tasks/T-032/build.md`) independently lists "a
  cross-origin script error (three.js from the CDN) still produces a panel"
  as a proven, caught case — this task's measurement is the timing behind
  that claim, not a new mechanism.
- **CDN slow** (a 4-second artificial delay, then success): **unchanged** —
  still an identical blank `#232830` screen with no spinner and no "Loading…"
  text for the entire delay, because `<script type="module">` defers all
  execution until its whole static import graph resolves and nothing in
  `index.html` renders before that script runs. Measured again for this
  task: still blank at 5.4s of polling through the delay, exactly as T-034
  found. **This is the honest part still open:** any slow-but-eventually-
  successful load under T-032's 10-second "still loading" boot watchdog
  shows nothing at all until the game appears at once; only a load slower
  than 10 seconds would additionally surface the watchdog's own "Still
  loading." panel, which T-034 predates and could not have measured.

So the risk today is narrower than T-034 left it, not gone: a **fully
blocked** CDN (a school/library/corporate filter, or a jsdelivr outage) now
tells a 9-year-old the game could not start rather than showing him nothing;
a **merely slow** one still shows him nothing for as long as the delay lasts
(up to 10 seconds before the watchdog's own panel would catch it). Two
honest options for the operator, **neither implemented here**: accept the
remaining slow-load gap as-is (jsdelivr is a large, generally reliable CDN,
home networks rarely add multi-second latency to it, and 10 seconds is a
ceiling, not a typical case), or record a decision to vendor three.js into
the repo as a static file, which removes the CDN dependency (and this whole
risk class) entirely at the cost of ~600 KB carried in the repo/host.
Flagging for that decision, not making it.

## 5. Uploading to itch.io (for someone who has never used it)

An agent must never create the itch.io account or upload anything — this
section is written for the **operator** to follow by hand.

1. Go to itch.io and sign in (or create a free account — top-right of the
   site).
2. Click your username in the top-right corner → **"Upload new project."**
3. Fill in a **Title** (e.g. "HULLBREAKER"). itch.io will suggest a URL
   slug under your account (`yourname.itch.io/hullbreaker`) — that's fine to
   accept as-is.
4. Find the field labeled **"Kind of project"** and set it to **"HTML."**
   This is the field that matters most: if it's left as "Downloadable," the
   browser-play option below never appears and itch.io will just offer the
   zip as a download instead of running it.
5. Scroll to **"Uploads."** Click **"Upload files"** and choose the zip built
   in step 1 (`hullbreaker-web.zip`). Wait for it to finish uploading (it is
   ~75 MiB — see "Bundle size" below — so give it a minute or two on a home
   connection rather than seconds).
6. Once it's uploaded, a checkbox appears next to that file named **"This
   file will be played in the browser."** Check it. (If you don't see this
   checkbox, go back to step 4 — "Kind of project" almost certainly isn't
   set to "HTML" yet.)
7. Checking that box reveals an **"Embed options"** section. Set:
   - **Viewport dimensions** — width and height in pixels. `1280` × `720` is
     a reasonable default; the game resizes itself to fill whatever size the
     embed actually is (it listens for window resize and recomputes its
     camera), so this number is a starting size, not a hard limit.
   - **"Click to launch"** vs automatic start — either is fine; "click to
     launch" means the visitor sees a "Run game" button first instead of the
     CDN fetch starting the instant the page loads, which is arguably nicer
     given the CDN risk above (nothing loads until they've chosen to play).
   - **"Fullscreen button"** — worth checking. This is a run-and-gun game;
     more screen space reads better, especially on a laptop.
   - **"Mobile friendly"** — leave unchecked unless you specifically want
     itch.io to also offer this on phones/tablets; the game has never been
     tested for touch input.
8. Scroll down to **Pricing** and **Visibility**. For a private link to test
   with your son, set visibility to **"Restricted"** or **"Draft"** (itch.io
   gives you a direct preview link either way, without requiring the game to
   be publicly listed) — see itch.io's own "Visibility & access" help if the
   exact option names differ from what's described here; itch.io's UI does
   change from time to time, and this document was not verified against a
   live itch.io upload.
9. Click **Save** at the bottom of the page.
10. Open the game's page (itch.io shows you a **"View page"** link after
    saving) and click **Run game** (or wait for it to auto-load, depending on
    what you picked in step 7). This is the actual test — if it doesn't work
    here, none of the steps above matter more than what you literally see.

## 6. After uploading — what to check

- **It boots at all, WITH its art.** You should see RIG's real sprite on a
  textured hull with backdrop plates behind it, not flat grey-box shapes —
  `verify-bundle.mjs` (§2 above) is what proves this before you ever upload,
  but the live itch.io page is the one place it can be confirmed end to end,
  including inside itch.io's own iframe sandbox (see the last bullet below).
  If it's blank instead, open the browser's developer console (F12 →
  Console tab) and look for the CDN error described in §4 — that is the
  single most likely cause, and as of T-032 a blocked CDN should show its
  own readable panel rather than a blank screen at all.
- **Keyboard focus.** itch.io embeds the game in an iframe; on some browsers
  the very first keypress can be "eaten" by the surrounding itch.io page
  instead of reaching the game. If the arrow keys/WASD don't respond
  immediately, click once directly on the game canvas first, then try again.
- **No stray scrollbars** and the canvas fills the embed frame at whatever
  size you picked in step 7 — resize the browser window and confirm the game
  keeps up (it's built to; this is a quick sanity check, not a new
  requirement).
- **The CDN loads inside itch.io's iframe too**, not just on your own
  machine — itch.io's sandboxed iframe generally allows normal outbound
  network requests, but this was never tested directly against a live
  itch.io upload as part of this task or T-034 (no account/upload was
  created for either). This is the one part of "does it actually run on
  itch.io" that genuinely needs the operator's own upload to confirm.

## 7. GitHub Pages tagged releases

`.github/workflows/deploy-pages.yml` is the production path. Pushing any `v*` tag
that resolves to the **current tip of `main`** builds and browser-verifies the
same static content described above, then applies one Pages-only packaging
transform before GitHub's native artifact deployment. A tag on another branch,
or an old commit that is merely an ancestor of `main`, fails before packaging;
a release can therefore never roll the public game backward by accident.

**Why Pages has a packaging transform.** Pages owns the response cache
headers. Appending a release query to `index.html` does not version the URLs of
its ES-module imports, and a real warm browser was observed running new HTML
with an older cached `src/ui/hud.js`. `build-pages-site.mjs` instead publishes
each module graph under its full commit id:

```
releases/<40-character-commit>/src/main.js
```

All relative JS imports remain under that directory. The root document carries
the same commit in a `hullbreaker-build` meta marker and names that exact
`main.js`, so no module URL is shared by two releases. The artifact retains the
four most recent `v*` release tags on the current commit's first-parent history
(about 2.5 MiB each, rather than duplicating the ~77 MiB art pack), allowing an
older cached document to finish booting during a rollout. `/src` and the exact
unmodified root document it booted are pinned to `v0.1.0`, the last unscoped
release. They remain in the artifact permanently: a small compatibility cost
that makes the first migration case provable instead of assuming its cache has
expired.

The workflow itself triggers only for `v*` tags, matching the retention
namespace. First-parent filtering excludes tags on merged side branches. One
honest residual remains without adding a fragile external deployment ledger:
a `v*` tag on an older first-parent commit that failed the current-main guard
is indistinguishable from a successfully published old tag later. It can be
retained and therefore participate in the immutable-asset check. Release tags
should consequently be created only for actual deploy attempts and never
moved or reused.

Art remains in the shared `/assets` tree because the generated filenames are
already versioned. That is now an enforced contract, not an assumption: the
builder compares Git blob ids across every retained release and **refuses to
deploy if a PNG or SVG changed bytes without changing pathname**. Assets that
existed only in a retained release are restored into the union. Rename changed
art with a new `-vN` filename; never overwrite a published asset name.

One repository setting is required once: **Settings → Pages → Build and
deployment → Source → GitHub Actions**. The workflow uses only the automatic
`GITHUB_TOKEN`; no deploy key or repository secret is required. It grants
`contents: read` while building and grants `pages: write` plus `id-token:
write` only to the isolated deploy job.

The production domain is **https://hullbreaker.app/**. The repository Pages
setting owns the domain binding, while every generated site also carries an
exact `CNAME` file and `pages-release.json` marker; the deploy verifier rejects
an artifact if either stops naming `hullbreaker.app`. In Cloudflare, keep the
apex pointed at GitHub Pages and do not proxy it while GitHub is issuing or
renewing the certificate.

Cloudflare DNS should carry the four GitHub Pages apex records (DNS only), plus
the recommended `www` alias:

```
A      @     185.199.108.153
A      @     185.199.109.153
A      @     185.199.110.153
A      @     185.199.111.153
CNAME  www   aetherwing-io.github.io
```

IPv6 may additionally use GitHub's four `2606:50c0:8000::153` through
`2606:50c0:8003::153` `AAAA` records. Once DNS resolves and GitHub finishes the
certificate, enable HTTPS in the Pages setting.

To publish a release from a clean, current `main`:

```
git switch main
git pull --ff-only
git tag -a v0.1.0 -m "HULLBREAKER v0.1.0"
git push origin main v0.1.0
```

Use a new tag for every release; do not move or reuse a published tag. The
workflow installs the verifier's locked Playwright dependency and Chromium,
runs `build-bundle.mjs`, requires `verify-bundle.mjs` to pass at both the flat
root and synthetic nested subpath, builds the commit-scoped Pages tree, and
runs `verify-pages-site.mjs`. That second verifier scans every retained source
graph for an unadjusted asset URL, independently recomputes the shared asset
union and Git blob hashes, then performs the actual rollover races in one
Chromium context. It always proves the exact legacy case (cached v0.1.0 HTML
loading pinned `/src/main.js`, followed by a fresh scoped document); when a
prior scoped `v*` tag exists it additionally proves scoped A→B. In each case it
warms A, switches the server to B while A's document is cache-fresh, proves
cached A remains all-A, then fetches B into that same warm module cache and
proves every first-party JS request is all-B. The public deployment carries no
`reports/`, `tools/`, docs, source intermediates, or repository history.

The manual branch recipe below remains an emergency fallback. It builds the
same zip and stages `gh-pages` directly; use it only if the native Pages
deployment service is unavailable, and switch the Pages source back to
**Deploy from a branch** before relying on it:

```
node tools/deploy/build-bundle.mjs --out /tmp/hb-pages/hullbreaker-web.zip
node tools/deploy/verify-bundle.mjs          # boots the zip; must say PASS
STAGE=$(mktemp -d)
node tools/deploy/build-pages-site.mjs \
  --zip /tmp/hb-pages/hullbreaker-web.zip --ref HEAD \
  --retain-tags 4 --out "$STAGE/site"
node tools/deploy/verify-pages-site.mjs \
  --site "$STAGE/site" --revision "$(git rev-parse HEAD)"
export GIT_DIR=$PWD/.git GIT_WORK_TREE=$STAGE/site GIT_INDEX_FILE=$STAGE/index
git add -A
TREE=$(git write-tree)
if git fetch origin gh-pages:refs/remotes/origin/gh-pages; then
  PARENT=$(git rev-parse refs/remotes/origin/gh-pages)
  COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "deploy: Pages site from $(git rev-parse --short HEAD)")
else
  COMMIT=$(git commit-tree "$TREE" -m "deploy: Pages site from $(git rev-parse --short HEAD)")
fi
git update-ref refs/heads/gh-pages $COMMIT
git push origin gh-pages
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE  # before any normal git work
```

The `GIT_INDEX_FILE` detour is what keeps this from touching the real
working tree or index. The production address is `https://hullbreaker.app/`;
the underlying GitHub URL is `https://aetherwing-io.github.io/hullbreaker/`.
That underlying URL is a subpath, which the game's
`import.meta.url`-relative asset loading already handles; verify-bundle's
subpath check is the same shape and is the proof. Two host facts to know:
Pages serves a private repo only on a paid plan (on a free org the repo
must be public), and no single file may exceed 100 MB (the largest shipped
asset is ~7 MB). Enable or watch the deploy under Settings → Pages.

## Bundle size (measured, 2026-08-04 prune)

Built from `HEAD` after the review/source prune: **74.5 MiB, 349 shipped
files** (86 review/source intermediates, ~92 MB uncompressed, pruned; 200
PNGs tracked under `assets/generated/` before the prune). For scale: the
T-055-era bundle this section first recorded was 2.1 MB / 163 files — the
art landings since are the difference, and the stale number surviving here
is exactly the drift this file is supposed to catch. Re-run
`node tools/deploy/build-bundle.mjs` for the current number; it is printed
on every build and will grow as more art lands.

## Files in this directory

- `build-bundle.mjs` — builds the upload zip from committed files (§1).
- `verify-bundle.mjs` — the falsifying test: unzips the bundle into a clean
  directory outside the repo, serves it, and asserts the art actually
  renders (§2). Dev-only; needs `playwright-core` (`npm install` here once,
  or point `$HB_PLAYWRIGHT_CORE` at `tools/playtest`'s or `tools/
  durability`'s existing install).
- `build-pages-site.mjs` — turns the verified zip into the commit-scoped Pages
  tree, retains the rollout tail, and enforces immutable shared asset names.
- `verify-pages-site.mjs` — structural and real-browser warm-cache A→B proof
  for the Pages tree.
- `asset-union-selftest.mjs` — focused falsifier for two retained releases
  disagreeing on an asset pathname that current has deleted.
- `package.json` — the dev-only `playwright-core` dependency for
  `verify-bundle.mjs`. Not a dependency of the shipped game.
- `README.md` — this document.

None of these files affect `src/`, `index.html`, or anything pathcheck
gates; `node tools/pathcheck.mjs` was run unchanged before and after this
task (see `reports/tasks/T-055/build.md`).
