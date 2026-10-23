# simlab — headless frame-alignment laboratory

Dev-only tooling that drives the **real, unmodified simulation** (`src/sim/*`
+ `src/pure/*`) in Node child processes with a fixed timestep and
**synchronous, frame-scoped input**: a scripted key event is applied directly
to `src/sim/input.js` at an exact frame boundary, before that frame's
`update`. That is precisely the injection semantics `tools/playtest/README.md`
hook request #5 asks for — buildable harness-side with no game change because
the sim layer is renderer-free by contract (`src/sim/bridge.js`,
`__HB_QUERY__` headless mode selection).

Built for SPRINT **T-002**: closing the `t2-transform-seam-rush` divergence
question. Findings and repro commands:
`docs/playtests/2026-07-t2-frame-alignment.md`.

This tool has **zero effect on the shipped game**. No dependencies; run with
plain `node`.

## Usage

```sh
node tools/simlab/t2lab.mjs run                 # one replica run, JSON summary
node tools/simlab/t2lab.mjs repeat --n 4        # bit-determinism proof (full-trace digests)
node tools/simlab/t2lab.mjs sweep               # shift each tap ±1 frame, report outcome forks
node tools/simlab/t2lab.mjs phases              # model the real driver's quantized dispatch,
                                                #   sweep the sampler phase
node tools/simlab/t2lab.mjs diverge --shift-tap 6:1   # per-frame first-divergence vs baseline
```

Options (all modes): `--dt <ms>` (default 16.667 — matches the browser
`?fixeddt=16.667` runs), `--end <gameMs>` (default 21000), `--edges L,R`
(default: the 1280×800 far-view calibration measured from the live page via
`window.HB.edges()`), `--script <path>` (default: the t2 adversarial script),
`--reassert-frames N` (default 4 — models the driver's held-key reassert lag
after a retry, bounded by one sample interval).

`sweep` accepts `--shift -1,1` (frame offsets to try per tap). `phases`
accepts `--sample-gamems` (default 151 ≈ 75 ms real × the measured
gameMs/wall ratio of the fixeddt browser runs) and `--step`.

## What the replica reproduces, and how faithfully

- The **frame loop is transcribed from `src/main.js`** (`update()` order,
  `resetGame()` for the transform slice) rather than imported — `main.js` is
  the composition root and pulls in three.js. Render/UI calls are dropped,
  which is legal by the bridge contract (uninstalled hooks are no-ops). If
  `main.js`'s update order changes, `t2lab.mjs` must be updated by hand; the
  transcription is commented inline for diffing.
- `scheduleSliceRetry`'s 650 ms wall-clock `setTimeout` (the sim's single
  wall-clock escape hatch) is captured by a virtual-timer shim and fired as
  soon as the loop sees `SLICE_RETRY`. `gameMs` is frozen for the whole
  freeze in the browser too, so this is sim-time-faithful.
- The driver's post-retry **held-key reassert** is modeled with a fixed
  `--reassert-frames` lag. In the real harness that lag is *variable*
  (bounded by one sample interval + a CDP round trip) — a real, additional
  jitter source this replica deliberately holds constant.
- Screen edges are a **constant calibration** (`--edges`), not a live camera
  probe; use the values measured from the browser at the viewport you are
  comparing against.

## Honesty / limitations

1. **The replica is not the browser.** It proves properties of the
   *simulation* under controlled input; it cannot prove where the browser's
   own event queue lands a CDP keystroke. Its `sync` dispatch mode is the
   idealized frame-scoped hook; its `quantized` mode *models* the real
   driver's deterministic-mode dispatch (poll-gated on `gameMs` at a sampler
   cadence) but not CDP/rAF races.
2. **A transcription can drift.** The `update()`/`resetGame()` copies must
   track `src/main.js`. The in-family cross-check (replica outcomes land in
   the same fork clusters, gaps, and halt-bound ritual signature as the
   browser batch) is the guard used in T-002; re-verify it before trusting
   new conclusions from an aged copy.
3. **One viewport.** Edge calibration is baked per run; conclusions about
   spawn timing and follow-lead only transfer to the calibrated viewport
   (1280×800 far view by default).
4. **`repeat` proves determinism only for the exercised path** (this script,
   this dt, this fixture). It is not a general no-nondeterminism proof for
   every slice — pathcheck's new T-002 assertions carry the durable,
   CI-shaped version of the claim.

---

# race lab — the shipped six-face run as distributions (T-104)

`tools/simlab/race/` measures the DEFAULT six-face run (no fixture, every
default-on system live: momentum pace, CHARGE, HULL FALLBACK, aim assist,
hit-stop) headlessly, for `docs/proposals/2026-10-race-to-the-top.md`. Zero
effect on the shipped game: it only imports `src/` read-only and writes under
`artifacts/t104-race/`. No dependencies for the Node half; the two browser
checks reuse `tools/playtest/node_modules` (playwright-core) via
`tools/playtest/lib/isolated-browser.mjs`.

| file | what it does |
| --- | --- |
| `race/edges.mjs` | analytic replica of `src/render/camera.js` calibrateEdges (FAR depth, portrait pullback, compact portrait multiplier, portrait look drop and NDC inset). Re-reads camera.js and throws if `PORTRAIT_SAFE` or the call shapes drift. Since T-107 the lens (FAR, or the phone frame on a touch phone), the lift and the actor-plane right clamp come from `src/pure/framing.js`, the module the camera calls; the lab's phone-sized viewports are touch phones, and `routeRight` reports the visible route edge beside `right` (the sim's clamp). |
| `race/run-child.mjs` | ONE run in a fresh process: transcribed boot (`calibrateEdges` → `resetGame`), the sim half of `src/boot/run-reset.js`'s registry in registry order, and `src/main.js` `update()` for the six-face run at a fixed 1/60 s. Drift guards re-read main.js and run-reset.js and refuse to run if the update order, the registry ids or resetGame's six-face lines changed. Optional `instrument: "oracle"`, `replay`, `snapshotsAtMs`. |
| `race/policies.mjs` | seeded reflex bots: `rush` (always right — the racer), `climber` (takes every higher surface and ladder), `fighter` (mid-screen, target-first), `carried` (a novice pushed along by the plane), `idle` (no input). Shared gate reflex: firing-spot search over walkable surfaces with the eight rays plus the shipped fire-time aim assist. |
| `race/lab.mjs` | `baseline` runs the matrix (4 viewports — desktop 16:10, phone landscape FAR, phone landscape at RIG 6 % (estimate), phone portrait — × (4 policies × 12 seeds + idle + oracle@0/1500/3000 × 3 seeds) = 232 runs) and writes `baseline.json` / `baseline.md`; `check` re-runs every committed run (or every K-th with `--every K`) and compares fingerprints; `one '<json>'` runs one config. |
| `race/doc-tables.mjs` | prints the markdown tables from `baseline.json`; `--condensed` prints exactly the Tables M1–M8 the proposal embeds. |
| `race/sight.mjs` | why a racer's view is empty: splits one run's climb frames (corner idle, real sides) into standing at a closed joint, pinned at the right screen clamp, and free, and reports the route-ahead quantiles of the free ones. `--preset racer` reproduces the three runs the proposal's §2.7 quotes. |
| `race/daylight.mjs` | where a single run loses the daylight behind it: samples one run's trace and splits the frames under N tiles of margin by corner state (a frozen plane in a held gate and an advancing plane during a climb are different problems). `--preset phone-crowding` reproduces the four runs the proposal's §4.5 quotes. |
| `race/gate-view.mjs` | static: resolves every authored gate row to its Vertical Assault staging socket as `src/sim/wavegate.js` does and reports which sockets sit outside the view held at `HALT_S`, per viewport (`gate-view.json`). |
| `race/facts.mjs` | static course arithmetic from source (`facts.json`). |
| `race/climb-plan.mjs` | the proposed nine-side climb in the track-archetype schema, run through the shipped `trackArchetypeViolations()` (`climb-plan.json`). |
| `race/browser-check.mjs` | fidelity proof: plays a frame-exact input schedule in real Chrome (`?testapi=1&fixeddt=16.667` + the frame-input bootstrap) and the same schedule through the replica; diffs the frozen final state field by field. |
| `race/probe-framing.mjs` | boots each viewport in Chrome, compares the live edge calibration with `edges.mjs`, saves one framing screenshot per viewport. Since T-107 it reads the T-101 thumb deck's published layout (`__HB_TOUCH().layout`: the right-thumb cluster box, the resting stick ring, the stick zone's edge) instead of the retired hidden `#touchDeck`, and records the live lens. |

```sh
node tools/simlab/race/lab.mjs baseline            # 232 runs; 1572 s wall on 2 jobs at load ~35
node tools/simlab/race/lab.mjs check               # reproduce: every fingerprint must match
node tools/simlab/race/lab.mjs check --every 8     # a deterministic 29-run subset
node tools/simlab/race/doc-tables.mjs --condensed  # the doc's Tables M1–M8
node tools/simlab/race/facts.mjs
node tools/simlab/race/gate-view.mjs
node tools/simlab/race/sight.mjs --preset racer
node tools/simlab/race/daylight.mjs --preset phone-crowding
node tools/simlab/race/climb-plan.mjs
node tools/simlab/race/browser-check.mjs           # 640x400, 24 s of game; SwiftShader-bound
node tools/simlab/race/probe-framing.mjs
```

## The oracle is an instrument, not a player

`instrument: "oracle"` breaks every materialized hostile inside the screen
through the game's own death path (`forceBreakHostile`: kill tally, score
event and gate bookkeeping all run) once it has been visible for
`oracleLatencyMs`. With `rush` movement it measures the AUTHORED FLOOR of each
side and gate (latency 0) and a competent shooter's time-to-kill (1500, 3000).
It is the only thing in the lab that writes sim state other than input, and
only when asked. It cannot see or kill anything outside the screen edges —
deliberately, because a player cannot either.

## Honesty / limitations

1. **Bots are reflex players, not people.** Their gate times on sides 3–6 are
   dominated by how badly they handle armoured, rooted teaching bodies (Iris
   Polyp windows, mortar perches). Read gate stalls from the oracle rows; read
   bot rows for behaviour (where a style spends its time, what it sees, how it
   dies) and for spread, never as "how long a human takes".
2. **The transcription can drift.** `run-child.mjs` copies `update()` and the
   reset registry rather than importing `main.js` (which pulls three.js). The
   drift guards catch reorders and renames; they cannot catch a NEW sim call
   added to `update()` between two guarded lines. `browser-check.mjs` is the
   end-to-end proof; re-run it after any change to `main.js`.
3. **Fidelity is proven for one input path.** `browser-check.mjs` compares one
   24 s open-loop schedule at 640×400 (in landscape the edge calibration
   depends only on aspect, so this is the 1280×800 simulation at a quarter of
   the painted pixels; the tool also checks the page's live edges against
   `edges.mjs`). Policies read state the browser would also have, but a
   closed-loop policy cannot be replayed in Chrome frame-exactly through the
   current harness (policy rules are sampled, not frame-scoped). Under
   SwiftShader on a loaded shared host the check takes up to an hour: rAF
   advances one fixed step per painted frame.
4. **Edges are a constant calibration per viewport**, exactly as the game
   computes them at boot; no resize or rotation mid-run is modelled.
5. **Fixed 1/60 s step.** The browser default is a variable step clamped to
   50 ms; outcomes at other frame rates can differ by a frame here and there.
6. **Phone = framing only.** The lab simulates a phone's edge calibration, not
   touch input (T-101 owns the touch deck); a bot presses the same intent
   booleans either way. Since T-107, `phone-landscape` and `phone-portrait`
   are the SHIPPED touch-phone frames (landscape: the phone lens, RIG's body
   5.6% of the height; portrait: FAR's portrait frame, which the lens never
   widens), `phone-landscape-far` / `phone-portrait-far` are the `?view=far`
   escape hatch, and `phone-landscape-6pct` stays T-104's pure-pull ESTIMATE
   (depth 26.644, route-plane edges) so T-104's tables reproduce. Baselines
   taken before T-107 do not reproduce after it: the right clamp moved on
   every viewport (the I-104 fix) and the phone rows changed framing.
7. **600 s cap.** A run still alive at 600 s of game time is reported as
   `timeout`. The ecology beat lock (`LEVEL1_ECOLOGY_BEAT_LOCK_MS` = 300 s) can
   hold a gate that long; a real player would have quit first.
8. **Bots and the oracle perceive only the screen.** Bullets are not
   edge-culled in the sim, so a bot that aimed at off-screen bodies would
   clear portrait gates no human can see; `liveHostiles()` therefore only
   returns hostiles inside the screen edges. A blind shot can still connect
   by luck, as it can for a player.
9. **One run per process.** The `src/` sim modules are module-level
   singletons, so `runOne()` is not re-entrant: a second call in the same
   process returns an empty trace and a different fingerprint. `lab.mjs` and
   `daylight.mjs` therefore spawn one child per run; a new tool must do the
   same (this bit `daylight.mjs` once and was caught by the fingerprints).
10. **The terrain-stall counter includes held gates.** `framesTerrainStall`
   counts frames where right is held, RIG is grounded and free, dx is
   ~0 and RIG is not at the right clamp — which also happens while a gate
   holds the scroll and the bot presses against arena geometry. On side 5
   that is nearly all of it (a traced `rush` run: 3,012 of 3,073 near-still
   samples inside the gate-5 fight). Read it per corner state, or restrict
   the counter to corner-idle frames, before calling it a layout defect.
11. **Lookahead is route, not screen.** Table M7's "route ahead" is RIG's
   front to the right screen edge, clipped at the active corner's bend (the
   next side is round the limb, not ahead), counted only on frames where the
   pursuing edge moves. It measures what the frame frees up, not where a
   player looks.

## The phone frame (T-107): `tools/simlab/framing/`

Measurements behind the phone frame, the corner-camera fixes and the
per-side rise. All dev-only, zero effect on the game; every number in
`reports/tasks/T-107/build.md` re-derives from these.

| file | what it measures |
| --- | --- |
| `framing/render-only.mjs` | that a flag changes only the picture: identical policy/seed/viewport runs of the race-lab replica with and without each flag (`rise=steep`, `orbit=joint`, `veil=legacy`), compared on a SIMULATION fingerprint (the whole run minus the rendered ALT readout and the query label); a sim flag (`momentum=0`) must make every run differ, or the comparison does not bind. Also records ALT gained per face (T-204's currency). |
| `framing/veil-need.mjs` | pure replica of each face's far anatomy veil and the camera: how far past the veil's opaque span the frame's edges reach at the gate, ritual and post-turn poses, per viewport, legacy vs extended veil, both orbits (T-102 R2). |
| `framing/void_columns.py` | the same voids on real captures: share of columns (and rows) at least 90% the page's own clear colour (Pillow + NumPy). |
| `framing/zoom-pump.mjs` | RIG's projected height at each corner's ritual end, +1.5 s and settled, halt-point vs joint orbit (T-102 R3). |
| `framing/route-ahead.mjs` | route ahead of RIG per framing on the same seeds, from the lab's own histograms, to the sim's clamp and to the visible route edge; `--root` runs another tree's own lab (e.g. an export of main). |
| `framing/readability_sheet.py` | a contact sheet of every hostile, projectile and capsule a `tools/playtest/phone-readability-capture.mjs` session recorded, true size and 3x, with median on-screen sizes. |

The browser half lives beside the other capture tools (documented in their
headers; listed here so the T-107 set is in one place):
`tools/playtest/phone-framing-probe.mjs` (the live camera per viewport: the
desktop identity proof by element-wise comparison of the camera matrices
against another tree, edges, lens, the deck's cluster box, RIG's projected and
painted height, the clamp in painted pixels, a clear-colour reference frame),
`tools/playtest/phone-readability-capture.mjs` (a deterministic fight paused at
game-time marks, with every body's screen box) and
`tools/playtest/framing-cost.mjs` (interleaved frame-cost rounds under the
256-projectile stress path). The posed turn frames use T-102's
`tools/playtest/turn-pose-capture.mjs` with `--touch` and poses from
`turnlab.mjs poses --viewport phoneLandscapeTouch`.

Honest limits: the replicas reproduce the camera from the same pure module
the page uses and are cross-checked against the live page by
`tools/playtest/phone-framing-probe.mjs`; none of them measures an iPhone
(SwiftShader on a shared host), and none of them judges look or feel.
