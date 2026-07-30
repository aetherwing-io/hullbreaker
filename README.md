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

The focused traversal playtest is available at
`index.html?slice=traversal`. Add `&enemies=0` to tune movement without wasps.
The normal six-face run remains the default. The camera defaults to the
pulled-back `far` view (RIG ≈ 3.7% of screen height, per the concept-art
scale); `?view=near` restores the original close camera and `?view=mid`
sits between.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move + 8-way aim |
| Space (or K) | Jump — hold for height, press again in air for double jump |
| J (or X) | Fire (hold for auto) |
| Shift | Strafe-lock (freeze aim while moving) |
| Down + Jump | Drop through catwalks |
| P / Esc | Pause |
| R | Restart (any time in the traversal slice; on death/victory elsewhere) |

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
  bolts can't tunnel through thin walls or enemies on slow frames)

Not yet built (in build order): the remaining enemy roster (houndframe, polyp
turret, spore mortar), the boss, the flight interlude, juice pass
(shake/hit-stop/particles), menus, WebAudio synth. See `docs/DESIGN.md`.

## Architecture

`index.html` is only a shell: CSS, the HUD elements, the three.js import map,
and `<script type="module" src="src/main.js">`. The game is four layers of ES
modules, each importing only downward:

| Layer | Contents |
| --- | --- |
| `src/config.js` | `CONFIG` — every normal-run tuning constant, plus the derived weapon roster |
| `src/pure/` | deterministic math and data with no imports outside this layer: `rng`, `path` (tower polyline), `waves` (ritual/zipper choreography), `traversal` (the slice fixture + movement decisions), `generator` (level + spawn tables) |
| `src/sim/` | the simulation: `time`, `edges`, `input`, `level`, `player`, `weapons`, `hostiles`, `capsules`, `mods`, `spawner`, `wavegate`, `scroll`, `state`. **No module here references THREE, `document` or `window`** |
| `src/render/` + `src/ui/` | `scene`, `tower` (s,y → 3D), `level` (instanced tiles/slats), `camera`, `player`, `hostiles`, `capsules`, `bullets`, `mods`, `fx` stub; `hud`, `overlay`, `tint` |

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
178 assertions: polyline continuity, corner-ritual timing, normal-generator
invariants and fingerprint, traversal topology and camera-follow contracts,
dare-pocket safety, movement decisions, spawn ordering, and jump math. Before
the suite it statically guards both layer contracts: no three.js/DOM references
(in code, comments excepted) and no cross-layer imports in `src/pure/` or
`src/sim/` — the property that keeps the simulation steppable without a
browser. It exits non-zero on failure. (The old "pass a different game file as
argv" mode is gone: the harness imports modules instead of scraping a file.)

### Debug handles

Two read-only channels expose the same sampler, so they cannot drift:

- `?testapi=1` publishes `globalThis.__HULLBREAKER_TEST__.snapshot()` — the
  playtest harness's canonical channel: `gameMs`, `state`, `scrollX`,
  `minimumScrollSpeed`, `player.{x,y,vx,vy,grounded,traversalState,
  traversalControlUntil}`, `screenRight`, `edgeMargin`, `weapon`, `attempt`,
  `falls`, `airJumps`.
- `window.HB` is always present and is a superset: the fields above plus
  `player.{hp,lives,facing,airJumpsLeft}`, `hostiles[]` and `capsules[]`
  (position/kind/hp), `kills`, `shotsFired`, `scrollEnd`, `edgeLeft`,
  `edgeRight`, and a copy of `sliceStats` — via `HB.snapshot()`. It also holds
  live references (`HB.player`, `HB.playerTune`, `HB.hostiles`, `HB.capsules`,
  `HB.mods`, `HB.sliceStats`, `HB.keys`, `HB.CONFIG`, `HB.fixture`,
  `HB.levelData`) and getters
  (`HB.state()`, `HB.scrollX()`, `HB.gameMs()`, `HB.currentWeapon()`,
  `HB.kills()`, `HB.shotsFired()`, `HB.edges()`).

Both are pure reads. Writing through the live references desynchronizes the
run — treat them as read-only.
