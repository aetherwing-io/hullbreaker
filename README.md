# HULLBREAKER

Contra-style 2.5D run-and-gun in a single self-contained HTML file, built on
three.js (ES modules via CDN import map). Full 3D low-poly visuals; gameplay
locked to a 2D plane. You are **RIG**, a salvage marine fighting up the
exterior of a feral terraforming ship's tower, one wave at a time.

The target game direction lives in [`docs/DESIGN.md`](docs/DESIGN.md), with
narrative canon and open lore questions in
[`docs/STORY.md`](docs/STORY.md). New working sessions should begin with
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## Play

Open `index.html` in a modern browser — that's the whole game. No build step,
no dependencies beyond the three.js CDN (internet required on first load).

To serve locally instead:

```sh
python3 -m http.server 8741
# → http://127.0.0.1:8741/index.html
```

The focused traversal playtest is available at
`index.html?slice=traversal`. Add `&enemies=0` to tune movement without wasps.
The normal six-face run remains the default.

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

Not yet built (in build order): the remaining enemy roster (polyp turret,
houndframe, spore mortar), the boss, the flight interlude, juice pass
(shake/hit-stop/particles), menus, WebAudio synth. See `docs/DESIGN.md`.

## Architecture

Everything lives in `index.html`, organized into labeled sections:
CONFIG → renderer/scene → loop/time → input → PATH (pure) → level bake →
pools/weapons → player → wasps → spawner → WAVES → fx/audio stubs → ui →
states → main loop.

- Normal-run tuning constants are in `CONFIG`; the opt-in slice keeps its
  authored geometry and playtest-only movement overrides in
  `TRAVERSAL_FIXTURE`.
- The sim runs in 2D logical coordinates `(s, y)` — distance along the level
  and height. A piecewise-linear polyline maps that ribbon onto the hexagonal
  tower for rendering and camera only; collision, physics, and spawning never
  leave 2D.
- Pure logic (path math, level generator, spawn tables, RNG) sits between
  `/* @pure-begin */` and `/* @pure-end */` markers with zero three.js/DOM
  references, so it can be extracted and tested headlessly.

## Verification

```sh
node tools/pathcheck.mjs
```

For a live browser smoke test, open `index.html?selftest=1` — after 1.5s it
verifies the render loop, pause/resume, resize, and restart, reporting
SELFTEST PASS/FAIL in both the console and the page title.

The headless harness extracts the pure block from `index.html` and runs 178
assertions: polyline continuity, corner-ritual timing, normal-generator
invariants and fingerprint, traversal topology and camera-follow contracts,
dare-pocket safety, movement decisions, spawn ordering, and jump math. It exits
non-zero on failure. Pass a different game file as the first argument to test a
variant.
