# HULLBREAKER

Contra-style 2.5D run-and-gun, no build step: a thin `index.html` shell plus ES
modules under `src/`, built on three.js (via CDN import map). Full 3D low-poly
visuals; gameplay locked to a 2D plane. You are **RIG**, a salvage marine
fighting up the exterior of a feral terraforming ship's tower, one wave at a
time.

The target game direction lives in [`docs/DESIGN.md`](docs/DESIGN.md), with
narrative canon and open lore questions in
[`docs/STORY.md`](docs/STORY.md). New working sessions should begin with
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## Play

The game is ES modules under `src/`, so it must be **served over http** —
double-clicking `index.html` no longer works (browsers block module loads from
`file://`). There is still no build step and no dependency beyond the three.js
CDN (internet required on first load).

```sh
python3 -m http.server 8741
# → http://127.0.0.1:8741/index.html
```

The game boots to its **start screen** — a composition study of concept
board 05's middle direction ("The Ship Wakes"); press any key (or click) to
run. `?title=climb|crown` (or the `1`/`2`/`3` keys on the screen itself)
swaps to the other two board-05 directions; none of the three has been
judged canon yet. `?shell=0` restores the pre-shell boot, straight into the
run. **Automated sessions never see the title:** `?testapi=1` (every bot
playtest) and `?selftest=1` boot directly into PLAYING, and even when the
title is up it starts the run on the same keypress that plays the
game — it never swallows an input. `?shell=title` forces the title screen
even under those flags, which is how the harness screenshots it.

The focused traversal playtest is available at
`index.html?slice=traversal`. Add `&enemies=0` to tune movement without wasps.
The normal six-face run remains the default. The camera defaults to the
pulled-back `far` view (RIG ≈ 3.7% of screen height, per the concept-art
scale); `?view=near` restores the original close camera and `?view=mid`
sits between.

Because that pull-back is a known scalar, the **FAR readability pass** scales
the things that carry *information* — capsule letters, the houndframe's and
the Iris Polyp's warning lamps, tell poses, the diving wasp's commitment cue —
back up by the same factor, so they land at the screen size the near view
already read at. RIG, the camera and every hitbox are untouched.
`?legibility=0` turns the whole pass off at any view for an A/B against the
pre-pass look.

The **baseline feedback pass** (hit-stop, screen shake, muzzle flashes,
impact/death/hurt/pickup particles, and the crush-plane warning) is on by
default. `?juice=0` disables all of it — including the sim-side hit-stop — for
a simulation-identical pre-juice build to compare against: every dt scale
collapses back to the pre-juice one (CHRONO included, which the pass composes
with rather than replaces), no pool or mesh is built, and no bridge hook is
wrapped. Every intensity is one block, `CONFIG.juice`, in `src/config.js`.
`?audio=0` mutes the synth layer the same way.

The six-face corner ritual reads as a **static-anatomy reveal** by default
(T-009): the camera orbits 60° around a joint of one static faceted creature
limb and the next facet comes out from behind the joint's mass, rather than
zippering itself into place. `index.html?zip=1` restores the older brick-slam
zipper reveal — retired from the world but kept whole and playable per
`decisions.md` entry 3's addendum, since things the ship *builds* may still
assemble. (`?g1=0` is the same escape hatch under the flag's old name.)

Both are render-only: the simulation, the ritual's timing, the wave gates, the
spawn tables and the built-column state machine are identical in both modes,
byte for byte, which `tools/pathcheck.mjs` proves by running the same scripted
pass in each and comparing the whole trace. Combine with the view flags
(`?zip=1&view=near`) as usual. This began as the opt-in G1 limb-turn
experiment — see `docs/proposals/2026-07-meridian-monster-greybox-map.md`
(gate G1) for what it set out to prove, `artifacts/g1-limbturn/` for its
frames, and `artifacts/t009-lattice/` for the default run as it ships now.
`index.html?momentum=1` arms **earned pace escalation** (`docs/decisions.md`
entry 11) on the six-face run: the pursuing edge stops being a constant and
rises with how well the run is being played — how far RIG is riding toward the
right of the screen (the daylight he banks by running at 9.4 t/s against a
4.3 t/s scroll) plus a decaying kill streak. Drive 0 is the shipped speed
exactly, and a player pushed back toward the plane banks *no* daylight at all —
so the pace never escalates at someone for falling behind. It is a floor, not a
cap: the kill streak is independent, so a struggling player who keeps
connecting still earns up to ×1.12 (that bound is asserted, and it is what
`momentum-weak.json` gates on). Full drive is ×1.40, with a hard ceiling of
×1.70 that later boost work shares and that the live path clamps to. Ambient spawn cadence rides the same number, because the
spawn table triggers off the right screen edge. The HUD's `MOMENTUM` meter
shows the live drive. Off by default and unjudged: the policy is
`CONFIG.momentum`, the math `src/pure/momentum.js`, and the two named bot
scripts `tools/playtest/scripts/momentum-strong.json` /
`momentum-weak.json` play the same URL well and badly for comparison.

`index.html?g1=1` is the **G1 limb-turn experiment** on that normal six-face
run: the same corner ritual, re-read as the camera orbiting 60° around a joint
of one static faceted creature limb instead of the next face zippering itself
into place. It is render-only and opt-in — the simulation, the ritual's timing,
the wave gates, the spawn tables and the built-column state machine are the
shipped ones, byte for byte, which `tools/pathcheck.mjs` proves by running the
same scripted pass in both modes and comparing the whole trace. Combine it with
the view flags (`?g1=1&view=near`) as usual. See
`docs/proposals/2026-07-meridian-monster-greybox-map.md` (gate G1) for what it
is trying to prove and `artifacts/g1-limbturn/` for the frames.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move + 8-way aim |
| Space (or K) | Jump — hold for height, press again in air for double jump |
| J (or X) | Fire (hold for auto) |
| Shift | Strafe-lock (freeze aim while moving) |
| Down + Jump | Drop through catwalks |
| P / Esc | Pause (the pause screen carries the options panel) |
| R | Restart (any time in the traversal slice; while paused, or on death/victory, elsewhere) |
| Q | Back to the start screen (from pause, death or victory) |
| H | Hide/show the HUD (start screen or pause) |
| 1 / 2 / 3 | Start screen only: swap the board-05 composition |

## Current build: grey-box v3 — "corner waves"

The level is the exterior of a hexagonal tower: six 65-tile faces, each a
combat wave. The forced scroll halts at each corner until the wave is
cleared; the killing shot triggers the **corner ritual** — the view ratchets
60° around the corner in two chunky snaps while the next face (void until
that moment) assembles itself, brick columns slamming down in a zipper
spreading from the corner. Then the scroll eases back in.

Implemented:

- Kinematic player controller: coyote time, jump buffering, variable jump
  height, double jump, drop-through catwalks, i-frames/knockback, 3 lives
- Forced scroll with left-edge damage plane, wave gates, corner rituals
- Opt-in authored traversal lattice with six connected routes, forgiving ledge
  catches, wall launches, a visible H dare pocket, camera follow, and fast retry
- Pattern-chunk level generator (stairs, gap-hops, plateaus, trenches,
  island-hops, ridges) with three vertical tiers of one-way catwalks
- Two enemies: wasp drone (sine cruise + dive) with escalating per-wave
  spawn composition, and the carrier drone (one per face) that drops a
  letter capsule when killed
- Full weapon system: R rifle / S spread / L laser (piercing) / H homing
  swarm / F flame wave (ground-crawling); taking a hit pops your capsule
  out for a ~2.2s recatch window, classic style
- Rare stackable modifiers from late carriers: RAGE (2× fire rate),
  GHOST SQUAD (two clones replay your shots on delay), ORBITAL LANCE
  (telegraphed screen clear), CHRONO (world at 0.35×, you at full speed)
- Mock-3D enemy presence: enemies materialize out of the tower depth,
  breathe on the depth axis while alive, and dissolve back on death —
  collision is strictly 2D and only while fully materialized
- Pooled instanced bullets, instanced tiles; all generation, spawning, and
  sim randomness is seeded and reproducible (the simulation itself runs on
  a clamped variable timestep; projectiles integrate in substeps so fast
  bolts can't tunnel through thin walls or enemies on slow frames, and cull
  cleanly at hex-corner/transform bends on the face tangent rather than
  visibly curving around them — the operator's view-scale-verdict ruling
  that shots shouldn't snipe across corners)

Houndframe (the floor-denial charger) is built and operator-judged in the
traversal slice (`?slice=traversal&hound=1|2|2.5|3`; hound 2.5 is the working
baseline — `docs/decisions.md` entries 4 and 6) but not yet placed in the
default six-face run. The Iris Polyp turret ships as the opt-in
`?slice=traversal&polyp=1` solo / `?polyp=2` combination trial, awaiting its
feel verdict; the Spore Mortar (delayed landing-zone denial) ships the same
way as `?slice=traversal&mortar=1` solo / `?mortar=2` combination, also
awaiting a verdict. Not yet built (in build order): the boss,
the flight interlude, juice pass (shake/hit-stop/particles), menus, WebAudio
synth. See `docs/DESIGN.md` and `SPRINT.md` — the wave-4 delivery queue
covers these.

## Architecture

`index.html` is only a shell: CSS, the HUD elements, the three.js import map,
and `<script type="module" src="src/main.js">`. The game is four layers of ES
modules, each importing only downward:

| Layer | Contents |
| --- | --- |
| `src/config.js` | `CONFIG` — every normal-run tuning constant, plus the derived weapon roster |
| `src/pure/` | deterministic math and data with no imports outside this layer: `rng`, `path` (tower polyline), `waves` (ritual/zipper choreography), `traversal` (the slice fixture + movement decisions), `generator` (level + spawn tables), `shell` (start-screen compositions, run-stat rows, the shell's key-intent table) |
| `src/sim/` | the simulation: `time`, `edges`, `input`, `level`, `player`, `weapons`, `hostiles`, `capsules`, `mods`, `spawner`, `wavegate`, `scroll`, `state`. **No module here references THREE, `document` or `window`** |
| `src/render/` + `src/ui/` | `scene`, `tower` (s,y → 3D), `level` (instanced tiles/slats), `camera`, `player`, `hostiles`, `capsules`, `bullets`, `mods`, `fx` stub; `hud`, `overlay`, `shell` (title / options / run stats), `audio`, `tint` |

- `src/main.js` is the composition root: input wiring, the frame loop,
  `resetGame`, the self-test, and the debug handle.
- `src/sim/bridge.js` is the sim's only outward boundary. Where the previous
  single-file build touched a mesh or an HTML element mid-simulation, the sim
  now calls a named view hook at the same point in the frame; `src/render/*`
  and `src/ui/*` install implementations when they load, and an uninstalled
  hook is a no-op, so the whole sim can be imported and stepped in Node.
- Meshes are held in render-side maps keyed by sim rows, so sim entities stay
  plain numbers. Coupling that remains: the corner ritual's build state is sim
  truth in `sim/level.js`, mirrored by tile instances in `render/level.js`
  (updated idempotently per corner across `updateZipper`'s two call sites —
  the per-frame advance in `sim/scroll.js` and the force-lock in
  `finishCorner`); `render/camera.js` writes `sim/edges.js` directly via
  `setEdges()`, the one render→sim write outside the bridge (see
  `src/sim/bridge.js` header); `src/mode.js` reads the URL (or
  `globalThis.__HB_QUERY__`) for the run-mode flags the sim needs at boot.
- Normal-run tuning constants are in `CONFIG`; the opt-in slice keeps its
  authored geometry and playtest-only movement overrides in
  `TRAVERSAL_FIXTURE` (`src/pure/traversal.js`).
- The sim runs in 2D logical coordinates `(s, y)` — distance along the level
  and height. A piecewise-linear polyline maps that ribbon onto the hexagonal
  tower for rendering and camera only; collision, physics, and spawning never
  leave 2D.
- `src/pure/` replaces the old `/* @pure-begin */ … /* @pure-end */` markers:
  purity is now enforced by module boundaries and checked by the harness.

## Verification

```sh
node tools/pathcheck.mjs
```

For a live browser smoke test, open `index.html?selftest=1` — after 1.5s it
verifies the render loop, pause/resume, resize, and restart, reporting
SELFTEST PASS/FAIL in both the console and the page title.

The headless harness imports `src/config.js` and `src/pure/*` directly and runs
a growing assertion suite (178 at the module split, 600+ and climbing as
fleet work lands — run it for the current count) covering polyline
continuity, corner-ritual timing, normal-generator invariants and
fingerprint, traversal topology and camera-follow contracts, dare-pocket
safety, movement decisions, spawn ordering, and jump math. Before
the suite it statically guards both layer contracts: no three.js/DOM references
(in code, comments excepted) and no cross-layer imports in `src/pure/` or
`src/sim/` — the property that keeps the simulation steppable without a
browser. It exits non-zero on failure. (The old "pass a different game file as
argv" mode is gone: the harness imports modules instead of scraping a file.)

Two further dev-only verification surfaces live under `tools/`, each with its
own README and honesty/limitations notes, and neither affects the shipped
game: `tools/playtest/` — a Playwright bot-player harness that runs scripted
or closed-loop keyboard input in real Chrome and reports pacing/fairness
metrics — and `tools/simlab/` — a headless frame-alignment lab that steps the
real sim in Node with frame-scoped input, built for the T-002 divergence
investigation (finding: `docs/playtests/2026-07-t2-frame-alignment.md`).

### Debug handles

Two read-only channels expose the same sampler, so they cannot drift:

- `?testapi=1` publishes `globalThis.__HULLBREAKER_TEST__.snapshot()` — the
  playtest harness's canonical channel: `gameMs`, `state`, `scrollX`,
  `minimumScrollSpeed`, `player.{x,y,vx,vy,grounded,traversalState,
  traversalControlUntil}`, `screenRight`, `edgeMargin`, `weapon`, `attempt`,
  `falls`, `airJumps`. Those names are frozen; everything added since is
  additive, and a run mode that has nothing to say omits its block entirely:
  - `hostiles[]` — `{id, kind, state, dir, x, y, hp, materialized}` per live
    hostile (`state` carries houndframe's prowl/tell/charge/skid/tumble;
    `materialized` is false while a hostile is still condensing out of the
    tower depth, which is exactly when it has no hitbox). A closed-loop bot
    policy reads its targets here instead of from `window.HB`.
  - `corner` (six-face run only) — the corner ritual's own state:
    `{k, pivotS, haltS, state, tMs, progress}`, where `state` walks
    idle → gate → turning → complete and `tMs`/`progress` measure the 1100 ms
    two-snap ritual from its start. `k` is null once all six are done.
  - `transform` (`?slice=transform` only) — `band`, `altitude`, `event`,
    `eventState`, plus `tMs`/`progress` through the 990 ms turn and the two
    clamps RIG is actually bounded by: `frontierX` (raw `+Infinity` when no
    turn is pending) and `sealX` (raw `-Infinity` until one commits).
  - `pace`, `pursuitSpeed`, `pursuitPeak`, `setbacks`, `score`, and the
    movement-verb blocks `hook` / `flow` (present only with their flags).
  - `shell` (absent with `?shell=0`) — the front end's own state:
    `{enabled, autostart, atTitle, direction, directions, hud, runMs}`, so a
    bot run can prove it was never parked on the start screen. `state` reads
    `'MENU'` while the title holds a built-but-frozen run; an automated
    session auto-starts and never sees it.
- `window.HB` is always present and is a superset: the fields above plus
  `player.{hp,lives,facing,airJumpsLeft}`, `capsules[]`, `kills`,
  `shotsFired`, `scrollEnd`, `edgeLeft`, `edgeRight`, and a copy of
  `sliceStats` — via `HB.snapshot()`. It also holds
  live references (`HB.player`, `HB.playerTune`, `HB.hostiles`, `HB.capsules`,
  `HB.mods`, `HB.sliceStats`, `HB.keys`, `HB.CONFIG`, `HB.fixture`,
  `HB.levelData`) and getters
  (`HB.state()`, `HB.scrollX()`, `HB.gameMs()`, `HB.currentWeapon()`,
  `HB.kills()`, `HB.shotsFired()`, `HB.edges()`, `HB.view()`,
  `HB.shell()` — the same shell block the telemetry channel publishes),
  plus `HB.g1`
  (the limb bake's piece count and fog band on the default static-anatomy
  reveal, or null under `?zip=1`) — render-mode facts are deliberately kept
  out of the frozen channel so a default-vs-`?zip=1` trace comparison has
  nothing mode-dependent in it to explain away.

Both are pure reads. Writing through the live references desynchronizes the
run — treat them as read-only.
