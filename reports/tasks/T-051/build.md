# T-051 — backdrop layers: build report

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-051`
Branch: `task/T-051`

## What changed, and why

`src/render/scene.js:25` set `scene.background = new THREE.Color(PAL.bg)`, and
in the default G1 mode `src/render/limb.js`'s `bakeLimb()` overwrites that with
`PAL.limbBg` — either way, until now nothing in `src/` referenced the five
generated plates in `assets/generated/backdrops/` (`backdrop-limb-segment`,
`spine-coil`, `gill-cavity`, `colony-cluster`, `crown-horizon`). This lane
wires those five plates onto twelve static, textured quads along the six-face
route — two per facet (a nearer plate + a farther one), cycling the five
plates so no facet repeats its own pairing — each authored once from
`CONFIG.BACKDROP_TUNE` and never touched again after boot (static anatomy,
decisions.md entry 3). Depths/heights/tints grade near->far (warm/large ->
cool/flat), the same atmospheric-perspective lever `CONFIG.limb.backdrop`'s
box tiers already use, and the two systems are independent (this lane never
touches `src/render/limb.js` or `src/render/materials.js`, both T-052's this
cycle).

Files:
- `src/render/backdrop.js` (new) — builds the twelve quads, once, at boot,
  behind the shared preload gate.
- `src/render/backdrop-table.js` (new) — the Node-safe half: the sizing/fence
  arithmetic, importable by pathcheck with no browser (same split as T-049's
  `src/render/sprite-table.js`). Not explicitly named in the dispatch, added
  as a sibling of `backdrop.js` on the same precedent — flagging it here in
  case that reading is wrong.
- `src/config.js` — appended `BACKDROP_TUNE` (placements, tiers, plate
  canvas dims) as its own top-level export, at the end of the file, same
  reason `LIGHT_RIG`/`POST_TUNE` are out-of-line: several look lanes append
  to this file concurrently.
- `src/render/palette.js` — appended three tint tokens (`backdropNear`/
  `backdropMid`/`backdropFar`) to both `CLASSIC` and `CONCEPT`, same
  append-only style as the existing T-038 block.
- `src/main.js` — **one new import line**, `import './render/backdrop.js';`,
  placed after the existing `scene.js` import. See "the wiring problem"
  below for why this couldn't stay inside `scene.js` alone as dispatched.
- `tools/pathcheck/t-051-backdrop.mjs` (new) + `manifest.mjs` (appended last).
- `tools/playtest/backdrop-capture.mjs`, `tools/playtest/backdrop-stress.mjs`
  (new, dev-only harness tools).

`src/render/scene.js` ends up with **zero diff** — see below.

## The wiring problem (why `src/main.js` needed one line)

The task named `scene.js` as the file to wire this through. I tried three
ways to make `scene.js` import `backdrop.js` (a plain static import, an
awaited dynamic `import()`, a deferred/unawaited dynamic `import()`) and
proved, empirically, that none of them work:

`backdrop.js` needs the shared preload gate (`src/render/preload.js`), and
`preload.js` imports `renderer` from `scene.js`. ES modules evaluate a
module's own dependencies **in full** before that module's own top-level
code runs, regardless of where in the source the `import` sits. So if
`scene.js` imports `backdrop.js`, `scene.js`'s own body (`export const
renderer = new THREE.WebGLRenderer(...)`, `export const scene = new
THREE.Scene()`, etc.) cannot run until `backdrop.js` — and `preload.js`
beneath it — finish evaluating. That is a real cycle:

- **Static `import './backdrop.js'` in scene.js**: `backdrop.js`'s own body
  ran fine (nothing in its registration loop reads `renderer`/`scene`
  synchronously), but its `buildPlate()` step (which calls `scene.add(mesh)`,
  reached only *after* its own `await awaitPreloads()`) hit
  `scene`/`renderer` still in their temporal dead zone — `scene.js`'s body
  genuinely cannot have run yet, because `scene.js`'s body running is what
  `backdrop.js` finishing is a *prerequisite for*. Every plate would "build"
  successfully into a caught exception, forever, on every load — safe, but
  permanently inert.
- **`await import('./backdrop.js')` in scene.js**: this outright deadlocks
  the boot. Confirmed twice: once against the real served worktree (the
  T-032 failure panel appeared after the 10s boot watchdog, `window.HB`
  never existed), and independently with a 4-file minimal Node ESM repro
  (`a.mjs` exports a const, then `await import('./b.mjs')`; `b.mjs` imports
  that const from `c.mjs`; `c.mjs` imports it back from `a.mjs`) — Node
  prints `Warning: Detected unsettled top-level await at a.mjs:3` and never
  proceeds. This is a real, unrecoverable deadlock class (two async modules
  in a cycle), not a bug I could catch with a `try`/`catch`.
- **Deferred/unawaited `import('./backdrop.js')` in scene.js**: avoids the
  deadlock (values are read after `scene.js`'s own body already ran), but
  loses the "hold the boot until textures are resident" guarantee — a
  dynamically-imported module is fetched only when the `import()` call
  executes, which is reliably *later* than the eagerly-fetched static graph
  sprites.js/hostiles.js already sit in, so it would race (and likely lose)
  against `sprites.js`'s own `awaitPreloads()` closing the gate before this
  module ever registers a texture. Not provably reliable, so not shipped.

`src/render/sprites.js` avoids all of this because it is reached from
`src/main.js` **after** `main.js`'s own `import { camera, renderer, scene }
from './render/scene.js'` line — by then `scene.js` has already fully
evaluated, so `preload.js`'s read of `renderer` is an ordinary forward
dependency, not a cycle. `backdrop.js` is wired the same way: one new import
in `src/main.js`, right after the existing `scene.js` import, verified to
change nothing else. I flagged this mid-task to the team lead
(`SendMessage`, before making the edit) since `main.js` wasn't on either side
of the dispatch's fence list; proceeded since it wasn't explicitly fenced and
the fix is a single, well-precedented line.

`tools/pathcheck/t-051-backdrop.mjs` asserts the one fact that is actually
load-bearing here — `src/render/scene.js` does not import `backdrop.js`
itself — proved to bind (see below); it does **not** assert an import order
inside `main.js`, because I tested that too (backdrop.js's import moved
before scene.js's in `main.js`) and it made no difference (backdrop.js
still names `scene.js` in its own import list either way, so `scene.js`
evaluates as *its* dependency regardless of main.js's own encounter order).
Keeping a non-binding assertion around would have been exactly the kind of
gate the project's evidence standard warns against.

## Verification

### `node tools/pathcheck.mjs`

Baseline (before this task): `2748 passed, 0 failed`.
After: **`3024 passed, 0 failed`** (276 new assertions).

### Assertions proved to bind (broken, observed red, restored, observed green)

All of these were broken on real files in this worktree (`src/config.js`,
`src/render/backdrop.js`, `src/render/scene.js`), not synthetic strings,
except the sim/pure ban (a throwaway file was added under `src/pure/` to
prove the regex fires against real code — not a comment, since `stripComments`
removes those first — then deleted; nothing else was touched).

1. **Play-band clearance.** `tiers.near.yBottom` 17.0 -> 14.0 (below the
   computed near-view floor of 16.298):
   `FAIL T-051: tier near clears the play band at every view scale (yBottom 14 >= required 16.298)`
   → restored to 17.0, green.
2. **Canvas-dims-match-file.** `plates.limbSegment.canvas` `[1024,512]` ->
   `[1024,999]`:
   `FAIL T-051: backdrop-limb-segment.png recorded canvas 1024x999 is the size in the file (1024x512)`
   → restored, green.
3. **Module-scope await.** `await awaitPreloads();` -> `awaitPreloads();` in
   `backdrop.js`:
   `FAIL T-051: the await sits at module scope...`
   → restored, green.
4. **`scene.js` must not import `backdrop.js`.** Added `import
   './backdrop.js';` to the end of `scene.js`:
   `FAIL T-051: src/render/scene.js does not import backdrop.js itself...`
   → removed, green. (This is the one that also matters behaviourally — see
   the wiring section above.)
5. **sim/pure ban, all three patterns.** A throwaway `src/pure/
   _t051_scratch_ban_test.js` with real (non-comment) code naming an assets
   path, `render/backdrop.js`, and `BACKDROP_TUNE`:
   `FAIL` x3, one per pattern → file deleted, green.
6. **No second `TextureLoader`.** Added `new THREE.TextureLoader()` to
   `backdrop.js`: both this task's own assertion AND T-049's pre-existing
   cross-file check fired (`found: render/backdrop.js, render/preload.js`)
   → removed, green.

`git status --short` and `git diff HEAD --stat` were clean after every
break/restore cycle.

### Browser

- `index.html?selftest=1&shell=title` → `SELFTEST PASS (39 checks)`, no page
  errors.
- `?testapi=1` (default six-face run): `window.__HB_BACKDROP()` reports
  `{"on":true,"built":12,...}`, all 12 slots `"ready"`, `window.HB` exists,
  game state `PLAYING`, no page errors.
- `?testapi=1&backdrop=flat`: `{"on":false,"built":0}`, all slots `"off"` —
  the flat/box-only background is unaffected.
- Confirmed inert/correct under `?slice=transform` (`{"on":false, state:
  "off"}` for every slot — the transformation slice's camera doesn't ride
  the six-face polyline these quads are placed on) and working under
  `?palette=classic` and `?zip=1` (12/12 built in both).
- `tools/playtest/run.mjs scripts/mid-route.json --deterministic` (traversal
  slice, backdrop active there too) — completed, 0 deaths, matches the
  script's own baseline shape.
- `tools/playtest/run.mjs scripts/six-face-spaced-run.json --deterministic
  --max-runtime-ms 60000` — died at scroll 153.5 (script's own header
  records 140-153 across nine runs); unaffected by this change.

## Perf (`tools/playtest/backdrop-stress.mjs`)

Same load `sprite-stress.mjs`/`juice-stress.mjs` use (60 projectiles/frame
via `fireWeapon('S', clone=true)`, right held on the default run), 3 runs per
variant, one browser per reading, 1280x800 headless Chrome:

```
flat      worstMs [10.40, 10.30, 10.40]  over20ms [0, 0, 0]  drawCalls [150, 150, 150]
backdrop  worstMs [10.30, 10.30, 10.40]  over20ms [0, 0, 0]  drawCalls [174, 174, 174]
```

`worstMs` and `over20ms` are unchanged across the distribution; `drawCalls`
moves by +24 for the 12 quads (5 unique textures — the shared preload gate
de-dupes by URL, so a repeated plate costs no second fetch). Full data in
`tools/playtest/runs/backdrop-stress/result.json` (not committed —
`tools/playtest/.gitignore` excludes `runs/`; regenerate with `node
tools/playtest/backdrop-stress.mjs`).

## Evidence (`reports/tasks/T-051/evidence/`)

Paired captures (`tools/playtest/backdrop-capture.mjs shots`), same
deterministic policy (`scripts/six-face-spaced-run.json`) driving both
variants, frame taken at the same `scrollX` threshold in each pair:

| moment | scrollX | what changes |
|---|---|---|
| `01-early` | ~20 | before facet 1's own plates — reference frame |
| `02-facet1-plates` | ~56 | facet 1: `limbSegment` (near, depth −13) + `crownHorizon` (far, depth −23) |
| `03-corner1-approach` | ~84 | facet 1's plates receding as corner 1 fills the frame |
| `04-facet2-plates` | ~121 | facet 2: `spineCoil` (mid, depth −18) + `colonyCluster` (far, depth −23) |

Each moment has a `-before.png` (`?backdrop=flat`) and `-after.png` (shipped
default) pair. `window.__HB_BACKDROP().built` was 12 in every `-after` shot
and 0 in every `-before` shot.

**Facets 3-6 are not captured.** `six-face-spaced-run.json`'s own header
records nine measured runs of this exact policy: every one reaches wave
gate 2 (scroll ~140-153) and none clears it. Reaching facets 3-6 (s=186.5,
251.5, 316.5, 381.5) would need either a better policy than any this repo
ships or a poked `CONFIG`, and a poked `CONFIG` is not evidence about the
shipped build (same call `scale-capture.mjs` made for the same reason).

## Open feel questions for the operator

Never judged here — measurements and captures only.

1. `reports/tasks/T-051/evidence/02-facet1-plates-after.png` vs
   `-before.png`: does the limb-segment plate read as "the creature's own
   anatomy receding into the haze," or does it read as a flat image pasted
   over the sky?
2. `04-facet2-plates-after.png`: the spine-coil plate is tinted quite dark/
   cool to sit inside the fog band at that depth (haze fraction ~0.59 under
   the shipped G1 fog) — is it visible enough to register at all during
   actual play (moving, under fire), or does it need to sit closer/brighter?
3. Depths were deliberately chosen close to but distinct from
   `CONFIG.limb.backdrop`'s own three tiers, so the two systems' geometry
   doesn't coincide. Serving both at once (visible together in
   `02-facet1-plates-after.png`'s upper-right, where the existing box-tier
   sister limb and this task's new plate both sit) — does that read as one
   coherent creature, or as two unrelated things sharing the sky?
4. Is pairing a near+far plate per facet (rather than one plate per facet,
   or the same plate repeated at every facet) the right density, or does
   cycling through five different plates across six facets read as
   inconsistent/scattered rather than as one body?

Capture URL for a live look: `http://127.0.0.1:<port>/index.html?testapi=1`
vs `?testapi=1&backdrop=flat`, served from this worktree.

## Worktree / branch

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-051`
- Branch: `task/T-051`
- `git status --short`: clean except this task's own new/modified files.

## Next action

Send this diff to review. The one thing worth a second pair of eyes before
merge: the `src/main.js` edit (one import line) — I judged it in-scope
(not on the fence list, single line, mirrors existing `hostiles.js`/
`sprites.js` precedent exactly, verified necessary by direct experiment) but
flagged it to the team lead as soon as I found it rather than silently
routing around the dispatched file list.
