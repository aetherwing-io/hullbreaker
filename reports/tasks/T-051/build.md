# T-051 — backdrop layers: build report

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-051`
Branch: `task/T-051`

## Files touched outside the dispatched fence (`backdrop.js`, `scene.js`)

For T-052 merge coordination, named up front:

| File | Why |
|---|---|
| `src/config.js` | Appended `BACKDROP_TUNE` as its own top-level export at the end of the file (never touched an existing line) — same out-of-line pattern `LIGHT_RIG`/`POST_TUNE` already use so concurrent look lanes appending to this file don't collide. |
| `src/render/palette.js` | Appended 6 new tokens (`backdropNear`/`Mid`/`Far` × `CLASSIC`/`CONCEPT`) after the existing T-038 block, dot-assignment style, no existing line touched. |
| `src/main.js` | One new import line, `import './render/backdrop.js';`, after the existing `scene.js` import. Necessary — see "The wiring problem" below — not a convenience. |

`src/render/scene.js` (the file actually named in the dispatch, alongside
`backdrop.js`) ends up with **zero diff** — the wiring could not go there;
see below. `src/render/materials.js` and `src/render/limb.js` (T-052's this
cycle) are untouched. `assets/generated/**` (T-053's this cycle) is
untouched.

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
removes those first — then deleted; nothing else was touched). These break/
restore cycles were run against the ORIGINAL `-13/-18/-23` depths, before the
post-review fix below moved them to `-16/-21/-26` — the exact numbers quoted
are a snapshot of that moment; the assertions themselves re-derive everything
from live `CONFIG.BACKDROP_TUNE` each run, so they hold identically against
the shipped depths (pathcheck was re-run green after the change, see below).

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
| `02-facet1-plates` | ~56 | facet 1: `limbSegment` (near, depth −16) + `crownHorizon` (far, depth −26) |
| `03-corner1-approach` | ~84 | facet 1's plates receding as corner 1 fills the frame |
| `04-facet2-plates` | ~121 | facet 2: `spineCoil` (mid, depth −21) + `colonyCluster` (far, depth −26) |

Each moment has a `-before.png` (`?backdrop=flat`) and `-after.png` (shipped
default) pair. `window.__HB_BACKDROP().built` was 12 in every `-after` shot
and 0 in every `-before` shot.

**Facets 3-6 are not captured.** `six-face-spaced-run.json`'s own header
records nine measured runs of this exact policy: every one reaches wave
gate 2 (scroll ~140-153) and none clears it. Reaching facets 3-6 (s=186.5,
251.5, 316.5, 381.5) would need either a better policy than any this repo
ships or a poked `CONFIG`, and a poked `CONFIG` is not evidence about the
shipped build (same call `scale-capture.mjs` made for the same reason).

## Post-review fix: the hard edge (found by the integrator's own capture)

The integrator served this worktree read-only, captured backdrop-on vs
`?backdrop=flat` at the same in-play position ("17m"), and reported two
factual observations: (1) a hard rectangular/diagonal edge where the plate
meets the sky, not a dissolve, and (2) the pre-existing pale silhouette boxes
and this task's painted plate not reading as one material world. Both turned
out to be the same root cause, and my first theory for (1) was wrong.

**What I assumed, and why it was wrong.** I first assumed the edge was a
fog-grading gap: the plate's alpha silhouette is real, correctly-cut art (not
a geometry bug), and its material blends toward `scene.fog.color` only
partially (haze fraction 0.41-0.77 at the original depths) — a plate that
never reaches full haze never converges to the SAME flat color the truly-
empty background is drawn in, so its silhouette edge would always show some
contrast. That theory is real and correct as far as it goes, but it predicts
an edge against *open sky*. I checked the actual pixels at the reported
location (`?backdrop=flat` at the identical position) and found the
"before" frame already has the existing `CONFIG.limb.backdrop` sister-limb
box tile filling that exact region — there was no open sky there to grade
into. `BACKDROP_TUNE.tiers.near.depth` (originally `-13`) sits almost
exactly on top of `CONFIG.limb.backdrop.sister.depth` (`-14`), and
`near.yBottom` (`17.0`) was authored to the identical floor
(`sister.y0 = 17.0`) — not "close but distinct," directly co-located. The
hard edge is where this plate's real (non-rectangular) alpha silhouette
abuts that tile's own flat-shaded box geometry at a near-identical depth and
height — a **compositing seam between two independently-built layers that
occupy the same screen region**, not a fog-vs-void gap. That is also
observation (2): the two "visual languages" are seen side by side because
they are, literally, occupying the same volume.

**What I changed.** `BACKDROP_TUNE.tiers` moved from `-13/-18/-23` to
`-16/-21/-26` (`yBottom` raised to match: `17.9/19.2/20.8`, still clearing
the play-band fence by 0.6-0.8 tiles at every view scale, pathcheck green
throughout). This is a real fix mechanism, not a fudge: with `depthWrite:
false` but `depthTest` still on (the default), a plate now sitting
meaningfully behind the nearest existing box tile is correctly *occluded* by
that tile's own opaque, nearer surface wherever the tile has mass — no seam,
because this plate is not drawn there at all — and shows through cleanly (at
more haze) wherever the tile leaves a gap. I tried the *full* fix first
(pushing every tier behind ALL three existing tiers, `-18/-23/-29`): it
does eliminate the seam everywhere I checked, but it also makes the plates
nearly or fully invisible at every reachable capture point (see history in
`src/config.js`'s own comment on `BACKDROP_TUNE` — the intermediate value is
recorded there for whoever revisits this). `-16/-21/-26` is the middle
ground I shipped: pushed past the *nearest* existing tier's own extent
rather than past all three, so the plates are still visibly present in the
committed captures while the worst, most direct co-location is gone.

**What this does NOT fix, stated plainly:**
- The seam is *reduced*, not eliminated. Two authored layers with no
  coordination between them (this task cannot touch `src/render/limb.js`,
  T-052's this cycle) will still collide somewhere the hashed per-facet
  offsets in `limb.js`'s own bake plan happen to put a tile edge against
  this plate's edge. I have not proven zero collisions across the whole
  route, only measured a reduction at the three moments this repo's bot
  policies can reach.
- The two visual languages (painted texture vs. flat-shaded box) still read
  as different materials where both are in frame — moving my depths changes
  *whether* and *how much* of each is visible at a given moment, not
  whether they look like the same kind of surface. That is the operator's
  call, not a depth number's.
- This was tuned against the CURRENT five plates. The team lead's message
  also reports T-053 has regenerated all five through a new procedural
  path — `backdrop-limb-segment.png` alone moved from 660 to 19,305 unique
  colors and mean luminance 36.3 -> 80.5. A markedly brighter plate needs a
  HIGHER haze fraction to converge on the same background/tile color at its
  edge, so these depths will very likely need to move again once T-053
  lands. Noted as a dependency, not re-tuned against art that isn't in this
  tree yet (`assets/generated/**` is fenced to T-053; I did not touch it).

Evidence for this fix in `reports/tasks/T-051/evidence/` was recaptured
after the depth change (same four moments, same policy). `node
tools/pathcheck.mjs` and `tools/playtest/backdrop-stress.mjs` were re-run
after the change: 3024/0 and worstMs/over20ms unchanged (see updated numbers
above, already reflect the shipped depths).

## Open feel questions for the operator

Never judged here — measurements and captures only.

1. `reports/tasks/T-051/evidence/02-facet1-plates-after.png` vs
   `-before.png`: does the limb-segment plate read as "the creature's own
   anatomy receding into the haze," or does it read as a flat image pasted
   over the sky?
2. Same frame: even after moving this plate's depth behind the nearest
   existing box tile (see "Post-review fix" above), the two are still
   visible together at this moment. Does that read as one coherent creature,
   or as two unrelated things sharing the sky? If the plate is meant to
   *replace* what the box tile stands in for, that's worth saying; if
   they're meant to coexist, that's worth saying too.
3. `04-facet2-plates-after.png`: the spine-coil plate is now quite faint
   (depth −21, haze fraction ~0.70 under the shipped G1 fog — recomputed via
   `backdrop-table.js`'s own `fogFraction()`, not estimated) — visible in
   this still frame, but is it visible enough to register at all during
   actual play (moving, under fire)? The alternative (shallower, bolder, but
   reintroducing more of the seam from observation 2) is a real trade-off,
   not a solved problem.
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
