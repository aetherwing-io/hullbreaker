# HULLBREAKER — engineering notes

The deep technical detail that used to be the root `README.md`, moved here
2026-08-04 so the front door can be for players. Everything below is
operator/contributor material. Player-facing summary and controls are in
the root README; target game direction in `docs/DESIGN.md`; narrative canon
in `docs/STORY.md`; session startup in `docs/HANDOFF.md`.

One retirement, stated honestly: the old README carried a "current build:
grey-box v3" feature inventory that had drifted from the shipped game (it
listed two enemies where six have production art, and listed the juice
pass, menus, and the WebAudio synth as "not yet built" in the same file
that documented their flags). It is deleted rather than corrected because
`docs/DESIGN.md` + `SPRINT.md` are the canonical inventory and status —
keeping a third copy is how the drift happened.

## Run modes and URL flags

The game boots to its **start screen**; press any key (or click) to run.
`?title=climb|wake|crown` (or the `1`/`2`/`3` keys on the screen itself)
swaps between the three board-05 composition directions. `?shell=0` skips
the shell and boots straight into the run. **Automated sessions never see
the title:** `?testapi=1` (every bot playtest) and `?selftest=1` boot
directly into PLAYING, and even when the title is up it starts the run on
the same keypress that plays the game — it never swallows an input.
`?shell=title` forces the title screen even under those flags, which is
how the harness screenshots it.

The focused traversal playtest is `index.html?slice=traversal`; add
`&enemies=0` to tune movement without wasps. The normal six-face run
remains the default. The camera defaults to the pulled-back `far` view
(RIG ≈ 3.7% of screen height, per the concept-art scale); `?view=near`
restores the original close camera and `?view=mid` sits between.

Because that pull-back is a known scalar, the **FAR readability pass**
scales the things that carry *information* — capsule letters, warning
lamps, tell poses, the diving wasp's commitment cue — back up against it:
information whole, a pose partly. A letter or a lamp gets the full factor;
a tell POSE deforms an actual body, so by design it takes only 60% of the
compensation (`SHARE` in `src/render/legibility.js`). RIG, the camera and
every hitbox are untouched. `?legibility=0` turns the pass off at any view
for an A/B against the pre-pass look.

The **baseline feedback pass** (hit-stop, screen shake, muzzle flashes,
impact/death/hurt/pickup particles, and the crush-plane warning) is on by
default. `?juice=0` disables all of it — including the sim-side hit-stop —
for a simulation-identical pre-juice build to compare against: every dt
scale collapses back to the pre-juice one (CHRONO included, which the pass
composes with rather than replaces), no pool or mesh is built, and no
bridge hook is wrapped. Every intensity is one block, `CONFIG.juice`, in
`src/config.js`. `?audio=0` mutes the synth layer the same way.

The six-face corner ritual reads as a **static-anatomy reveal** by default
(T-009): the camera orbits 60° around a joint of one static faceted
creature limb and the next facet comes out from behind the joint's mass,
rather than zippering itself into place. `index.html?zip=1` restores the
older brick-slam zipper reveal — retired from the world but kept whole and
playable per `decisions.md` entry 3's addendum, since things the ship
*builds* may still assemble. (`?g1=0` is the same escape hatch under the
flag's old name.) Both are render-only: the simulation, the ritual's
timing, the wave gates, the spawn tables and the built-column state machine
are identical in both modes, byte for byte, which `tools/pathcheck.mjs`
proves by running the same scripted pass in each and comparing the whole
trace. See `docs/proposals/2026-07-meridian-monster-greybox-map.md` (gate
G1) for what the experiment set out to prove, `artifacts/g1-limbturn/` for
its frames, and `artifacts/t009-lattice/` for the default run as it ships.

`index.html?momentum=1` arms **earned pace escalation** (`docs/decisions.md`
entry 11) on the six-face run: the pursuing edge stops being a constant and
rises with how well the run is being played — how far RIG is riding toward
the right of the screen plus a decaying kill streak. Drive 0 is the shipped
speed exactly, and a player pushed back toward the plane banks *no*
daylight at all — so the pace never escalates at someone for falling
behind. It is a floor, not a cap: the kill streak is independent, so a
struggling player who keeps connecting still earns up to ×1.12 (that bound
is asserted, and it is what `momentum-weak.json` gates on). Full drive is
×1.40, with a hard ceiling of ×1.70. Ambient spawn cadence rides the same
number, because the spawn table triggers off the right screen edge. The
HUD's `MOMENTUM` meter shows the live drive. Off by default and unjudged:
the policy is `CONFIG.momentum`, the math `src/pure/momentum.js`, and the
two named bot scripts `tools/playtest/scripts/momentum-strong.json` /
`momentum-weak.json` play the same URL well and badly for comparison.

## Architecture

`index.html` is only a shell: CSS, the HUD elements, the three.js import
map, the failsafe bootstrap, and `<script type="module" src="src/main.js">`.
The game is four layers of ES modules, each importing only downward:

| Layer | Contents |
| --- | --- |
| `src/config.js` | `CONFIG` — every normal-run tuning constant, plus the derived weapon roster |
| `src/pure/` | deterministic math and data with no imports outside this layer: `rng`, `path` (tower polyline), `waves` (ritual choreography), `traversal`, `generator` (level + spawn tables), `shell`, `momentum`, `adaptive-fidelity` (the ladder's rung policy) |
| `src/sim/` | the simulation: `time`, `edges`, `input`, `level`, `player`, `weapons`, `hostiles`, `capsules`, `mods`, `spawner`, `wavegate`, `scroll`, `state`. **No module here references THREE, `document` or `window`** |
| `src/render/` + `src/ui/` | `scene`, `tower` (s,y → 3D), `level` (instanced tiles/slats), `camera`, `player`, `hostiles`, `hostile-presenters/` (per-kind draw strategy: sprite, primitive, ecology composite), `capsules`, `bullets`, `juice`, `legibility`, `adaptive-fidelity` (sheds effects load before frames drop), `crown`/`finale` (the summit hold), `backdrop`/`atmosphere` (the facet depth volume); `hud`, `overlay`, `shell`, `audio`, `tint` |

- `src/main.js` is the composition root: input wiring, the frame loop,
  `resetGame`, the self-test, and the debug handle. `src/boot/` owns the
  view-init and run-reset registries so lifecycle order is data, not
  convention.
- `src/sim/bridge.js` is the sim's only outward boundary. Where the
  previous single-file build touched a mesh or an HTML element
  mid-simulation, the sim now calls a named view hook at the same point in
  the frame; `src/render/*` and `src/ui/*` install implementations when
  they load, and an uninstalled hook is a no-op, so the whole sim can be
  imported and stepped in Node.
- Meshes are held in render-side maps keyed by sim rows, so sim entities
  stay plain numbers. Coupling that remains: the corner ritual's build
  state is sim truth in `sim/level.js`, mirrored by tile instances in
  `render/level.js`; `render/camera.js` writes `sim/edges.js` directly via
  `setEdges()`, the one render→sim write outside the bridge (see
  `src/sim/bridge.js` header); `src/mode.js` reads the URL (or
  `globalThis.__HB_QUERY__`) for the run-mode flags the sim needs at boot.
- Normal-run tuning constants are in `CONFIG`; the opt-in slice keeps its
  authored geometry and playtest-only movement overrides in
  `TRAVERSAL_FIXTURE` (`src/pure/traversal.js`).
- The sim runs in 2D logical coordinates `(s, y)` — distance along the
  level and height. A piecewise-linear polyline maps that ribbon onto the
  hexagonal tower for rendering and camera only; collision, physics, and
  spawning never leave 2D.

## Verification

```sh
node tools/pathcheck.mjs
```

For a live browser smoke test, open `index.html?selftest=1` — after 1.5s it
verifies the render loop, pause/resume, resize, and restart, reporting
SELFTEST PASS/FAIL in both the console and the page title.

The headless harness imports `src/config.js` and `src/pure/*` directly and
runs a growing assertion suite (3,800+ and climbing — run it for the
current count) covering polyline continuity, corner-ritual timing,
generator invariants and fingerprint, traversal topology and camera-follow
contracts, movement decisions, spawn ordering, jump math, and the palette
token rules. Before the suite it statically guards both layer contracts:
no three.js/DOM references in `src/pure/` or `src/sim/`, and no cross-layer
imports — the property that keeps the simulation steppable without a
browser. It exits non-zero on failure.

Two further dev-only verification surfaces live under `tools/`, each with
its own README and honesty/limitations notes, and neither affects the
shipped game: `tools/playtest/` — a Playwright bot-player harness that runs
scripted or closed-loop keyboard input in real Chrome and reports
pacing/fairness metrics — and `tools/simlab/` — a headless frame-alignment
lab that steps the real sim in Node with frame-scoped input, built for the
T-002 divergence investigation (finding:
`docs/playtests/2026-07-t2-frame-alignment.md`).

The deploy story (bundle build + the boot-it-and-assert-the-art
verification, plus the GitHub Pages recipe) is `tools/deploy/README.md`.

## `tools/serve.mjs` (the dev server)

```sh
node tools/serve.mjs            # repo root on 8741, dual-stack, caching off
node tools/serve.mjs 8749 --root /tmp/hb-pin   # pin another tree for a gate
node tools/serve.mjs --selftest # 14 checks that the no-cache contract holds
node tools/serve.mjs --help
```

The game is ES modules under `src/`, so it must be **served over http** —
double-clicking `index.html` does not work (browsers block module loads
from `file://`). **Prefer this server over `python3 -m http.server`.**
Python's server sends no `Cache-Control` header, so Chrome applies
heuristic freshness to `src/*.js` and can reuse a module from an earlier
session; on 2026-08-02 that ran a pre-T-022 `src/sim/pace.js` against a
post-T-022 `src/sim/level.js` that imports `momentumScrollSpeed` from it,
and one failed ES-module import blanks the whole page — on a tree where
pathcheck and the selftest were both green. `serve.mjs` sends `no-store` on
every response, emits no `ETag`/`Last-Modified`, and ignores conditional
request headers, so it never answers 304 and a warm cache can never win.

`--selftest` boots on an ephemeral port and asserts the properties the tool
exists for: `no-store` on 200s **and** 404s, no `ETag`/`Last-Modified`, a
conditional GET carrying `If-Modified-Since`/`If-None-Match` answered 200
with a full body rather than 304, working HEAD/range/directory handling,
and no escape above the served root. It needs no browser and exits non-zero
on failure.

**Honesty / limitations.** This is a *development* server and nothing more.

- It is not hardened for exposure beyond your machine: it binds all
  interfaces by default so `localhost` and `127.0.0.1` both work
  (`--host 127.0.0.1` restricts it), it lists directories that have no
  `index.html`, and it has exactly one traversal guard (resolve, then
  require the path stay under the root) rather than a reviewed security
  posture. Do not serve anything you would not hand to whoever shares your
  network.
- `no-store` means the browser refetches everything every load, including
  the modules. Locally that is single-digit milliseconds; over a network it
  would not be. That cost is the point — correctness over warmth for a tree
  that changes every few minutes.
- It does not touch the three.js CDN fetch in `index.html`'s import map,
  which is a cross-origin request the browser still caches normally. A
  stale *three.js* is not a failure mode this prevents.
- Range support is single-range only (`bytes=a-b`), enough for scrubbing a
  `.webm` capture; a multi-range request falls back to a full 200.
- The stale-module failure it prevents was reproduced in real Chrome, both
  ways, before this shipped: with an 8-day-old `mod.js` edited between two
  loads in one persistent profile, `python3 -m http.server` ran the OLD
  bytes and `tools/serve.mjs` ran the NEW ones (T-024 build report).

## Debug handles

Two read-only channels expose the same sampler, so they cannot drift:

- `?testapi=1` publishes `globalThis.__HULLBREAKER_TEST__.snapshot()` — the
  playtest harness's canonical channel: `gameMs`, `state`, `scrollX`,
  `minimumScrollSpeed`, `player.{x,y,vx,vy,grounded,traversalState,
  traversalControlUntil}`, `screenRight`, `edgeMargin`, `weapon`,
  `attempt`, `falls`, `airJumps`. Those names are frozen; everything added
  since is additive, and a run mode that has nothing to say omits its
  block entirely:
  - `hostiles[]` — `{id, kind, state, dir, x, y, hp, materialized}` per
    live hostile (`state` carries houndframe's
    prowl/tell/charge/skid/tumble; `materialized` is false while a hostile
    is still condensing out of the tower depth, which is exactly when it
    has no hitbox). A closed-loop bot policy reads its targets here instead
    of from `window.HB`.
  - `corner` (six-face run only) — the corner ritual's own state:
    `{k, pivotS, haltS, state, tMs, progress}`, where `state` walks
    idle → gate → turning → complete and `tMs`/`progress` measure the
    1100 ms two-snap ritual from its start. `k` is null once all six are
    done.
  - `transform` (`?slice=transform` only) — `band`, `altitude`, `event`,
    `eventState`, plus `tMs`/`progress` through the 990 ms turn and the two
    clamps RIG is actually bounded by: `frontierX` (raw `+Infinity` when no
    turn is pending) and `sealX` (raw `-Infinity` until one commits).
  - `pace`, `pursuitSpeed`, `pursuitPeak`, `setbacks`, `score`, and the
    movement-verb blocks `hook` / `flow` (present only with their flags).
  - `shell` (absent with `?shell=0`) — the front end's own state:
    `{enabled, autostart, atTitle, direction, directions, hud, runMs}`, so
    a bot run can prove it was never parked on the start screen. `state`
    reads `'MENU'` while the title holds a built-but-frozen run; an
    automated session auto-starts and never sees it.
  - When `--deterministic` installed a complete schedule before boot,
    `__HULLBREAKER_TEST__.inputTimeline()` returns read-only tick, event
    and retry-reassertion evidence. There is deliberately no post-boot
    enqueue method: static input timing belongs to the simulation frame,
    not CDP.
- `window.HB` is always present and is a superset: the fields above plus
  `player.{hp,lives,facing,airJumpsLeft}`, `capsules[]`, `kills`,
  `shotsFired`, `scrollEnd`, `edgeLeft`, `edgeRight`, and a copy of
  `sliceStats` — via `HB.snapshot()`. It also holds live references
  (`HB.player`, `HB.playerTune`, `HB.hostiles`, `HB.capsules`, `HB.mods`,
  `HB.sliceStats`, `HB.keys`, `HB.CONFIG`, `HB.fixture`, `HB.levelData`)
  and getters (`HB.state()`, `HB.scrollX()`, `HB.gameMs()`,
  `HB.currentWeapon()`, `HB.kills()`, `HB.shotsFired()`, `HB.edges()`,
  `HB.view()`, `HB.shell()`), plus `HB.g1` (the limb bake's piece count and
  fog band on the default static-anatomy reveal, or null under `?zip=1`) —
  render-mode facts are deliberately kept out of the frozen channel so a
  default-vs-`?zip=1` trace comparison has nothing mode-dependent in it to
  explain away.

Art-render diagnostics used by the deploy verifier: `window.__HB_PRELOAD()`
(per-asset ready/failed), `__HB_RIG_VISUAL()`, `__HB_SPRITES()`,
`__HB_HULL_TEX()`, `__HB_BACKDROP()`.

Both debug channels are pure reads. Writing through the live references
desynchronizes the run — treat them as read-only.
