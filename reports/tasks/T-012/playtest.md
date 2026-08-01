PASS

# T-012 playtest gate — WebAudio synth layer

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-012`
(branch `task/T-012`, HEAD `26de15f` — "T-012 fix: ambience recount on
corner.finished (post-'done'), sim-true pickup gating, honest header, builder
report"). Diff vs `main`: `src/ui/audio.js` (new, 554 lines), one side-effect
import line in `src/main.js`, 69 lines of new `tools/pathcheck.mjs` guards, and
the builder report. No render, sim, pure, fixture, or tuning file is touched.

Pinned for the whole gate: `python3 -m http.server 8782` served from the
worktree; every harness invocation below ran from the MAIN checkout's
`tools/playtest` against `http://127.0.0.1:8782` (killed at the end of the
session). Nothing was tested against a moving tree.

## Run commands (all exit 0)

```sh
# pin (background, from the worktree)
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-012 && python3 -m http.server 8782

# required smoke set, from the MAIN checkout's tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8782 --out runs/gate-T-012-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8782 --out runs/gate-T-012-transform

# muted boot (same script, ?audio=0 appended via --url)
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --url "http://127.0.0.1:8782/index.html?slice=traversal&audio=0&testapi=1" \
  --out runs/gate-T-012-mid-audio0

# selftest through the harness (title lands in the trace's `title` field)
node run.mjs scripts/idle-greedy.json --deterministic --max-runtime-ms 15000 \
  --url "http://127.0.0.1:8782/index.html?selftest=1&testapi=1" \
  --out runs/gate-T-012-selftest

# worktree's own headless gate
node tools/pathcheck.mjs      # (run inside the worktree) -> 654 passed, 0 failed
```

Two scratch probes drove the gates the harness structurally cannot reach
(page title, console *warnings*, AudioContext lifecycle, and the corner-ritual
ambience recount). Both are read-only observers — CDP key events plus wrappers
around `AudioContext` / `AudioParam.prototype.linearRampToValueAtTime`; no game
state is poked. Sources and raw output:

- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/474930e2-7e23-4651-9683-c17c797cb579/scratchpad/audio-gate-probe.mjs`
- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/474930e2-7e23-4651-9683-c17c797cb579/scratchpad/layer-probe.mjs`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-012-audio-probe/layer-probe.json`

## Evidence

| Artifact | Path |
| --- | --- |
| mid-route (audio on) | `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-012-mid/` (`report.json`, `summary.md`, `screenshot.png`) |
| transform-slice (audio on) | `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-012-transform/` |
| mid-route (`?audio=0`) | `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-012-mid-audio0/` |
| selftest run | `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-012-selftest/` |
| corner-ritual + layer probe | `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-012-audio-probe/` (`probe.json`, `layer-probe.json`, `corner-turning.png`, `final.png`) |

## What I judged

**1. Required smoke set — both green, first attempt, no retry needed.**
`mid-route` → `"result": "completed"`, testapi fidelity, idle fraction 0.018,
`minEdgeMargin` 33.11 tiles, 0 deaths, protoScore 112.6 (proxy).
`transform-slice` → `"result": "completed"`, idle fraction 0, `minEdgeMargin`
30.07, route coverage `[mid-catwalk, wall-launch]`, 0 deaths, protoScore 318.9
(proxy). `meta.bootError: null` on both; no bootError occurred anywhere in this
gate, so the one-retry allowance was not used.

**2. Zero console errors, and zero console warnings including autoplay.**
`consoleErrors: []` and `pageErrors: []` in all four harness reports. The
harness only records console type `error`, so the probes additionally listened
for type `warning` (the class Chrome's autoplay-blocked message falls in) across
four boots — default no-input, default + real keydown, `?audio=0` + keydown,
and `?selftest=1`: **zero warnings, zero errors, zero page errors in every
case.**

**3. Autoplay contract holds in both directions.** With the constructor
instrumented: default boot with no input → **0** AudioContexts created (nothing
is built before a gesture, so there is nothing to block); default boot after a
real CDP keydown → **1** context, `state: "running"`; `?audio=0` + the same
keydown → **0** contexts, i.e. the flag hard-disables rather than muting a live
graph. Muted boot also plays identically: `?audio=0` mid-route completed with
the same metric family as audio-on.

**4. Selftest green through the harness.** The `gate-T-012-selftest` trace's
distinct `title` values are `["HULLBREAKER — grey-box", "SELFTEST PASS (14
checks)"]` — the title flips to PASS in-trace, so the verdict is in the report,
not only in a screenshot. Selftest exercises pause/resume/resize/restart, which
is the path most likely to break an audio context; it passed with a clean
console.

**5. Audio does not perturb the sim.** Concern worth stating because the game
uses a variable timestep, so main-thread work can move the trajectory. Three
deterministic `mid-route` runs audio-on gave `minEdgeMargin` 33.11 / 35.44 /
35.44; three audio-off gave 35.44 / 35.44 / 35.42. The single 33.11 outlier is
the first (cold-launch) run of the session, not a side of the A/B — the audio-on
and audio-off families are otherwise identical and both sit on the README's
recorded deterministic baseline (35.44). No systematic divergence.

**6. Per-face ambience layering fires on the right hook — verified as
scheduling, not as sound.** I drove the *default six-face run* (audio on) with a
naive hold-right/hold-fire/hop policy plus an aim sweep until the corner-1 gate
wave was cleared and the ritual completed (`corner.k` advanced 1 → 2, i.e.
`finishCorner` committed `state='done'` and fired `corner.finished`). Across
that run: **zero console warnings/errors**. `applyLayers()` ramps every ambience
layer's level gain in one batch, so batches of ≥7 `linearRampToValueAtTime`
calls are the observable signature. Two batches occurred: at unlock
(t≈1.3 s) a batch with exactly **1** value == 1 (base bed only), and at
t≈28.5 s — immediately after the corner finished at wall t≈27.3 s — a batch with
exactly **2** values == 1. The second ambience layer entered the mix on corner
completion, which is precisely the post-`done` recount the reviewer's MAJOR
finding asked for, confirmed in a live run rather than only by static assertion.

**7. Worktree pathcheck: 654 passed, 0 failed** (run inside the worktree), incl.
the new layer-purity guards proving `src/sim/` never references the audio
module.

## Screenshots judged

- `runs/gate-T-012-mid/screenshot.png` (TRAVERSAL CLEAR overlay), 
  `runs/gate-T-012-transform/screenshot.png` (BREACH CLEAR), and the two default-run
  frames in `runs/gate-T-012-audio-probe/` (`corner-turning.png` during the corner
  ritual, `final.png` after the turn) — plus a 4× crop of RIG from the
  corner-turning frame.
- **FAR readability:** RIG reads as a small pale capsule with an orange rifle
  stub; silhouette legible, no glyph or plate detail; the last gate wasp is a
  plain white quad and the pickup a small acid-green tick. This is the already
  recorded FAR cost (decisions entry 7's accepted follow-up; T-015's measured
  9.6 px capsule; SPRINT checkpoint-queue "Glyph scale at FAR", T-003) — not a
  new defect, and structurally impossible for this diff to have caused: it
  touches no render code.
- **Style vs `docs/concept-art/`:** still the grey-box palette (deep-teal /
  rust-orange roles are T-010's in-flight lane). Silhouettes are flat-shaded and
  chunky, surfaces read as a connected hull, side-on camera with perspective
  depth — consistent with the visual invariants at the current grey-box stage.
  Nothing regressed against boards 10/11/13.
- **Assembling anatomy:** nothing in the captured frames shows body geometry
  assembling; the post-corner frame shows the next face already present and
  revealed by the camera turn, and the transform-slice frame reads as static
  fogged anatomy. Honest limit: I captured two frames of the corner ritual, not
  a full keyframe sequence, so this is "no violation observed", not "the ritual
  choreography is clear" — the shipped corner zipper is a known, separately
  tracked item (T-009), untouched by this task.

## Honesty / limitations of this gate

- **I cannot hear anything.** Every audio claim above is about *scheduling and
  API behavior* — contexts created, ramps issued, values targeted, errors
  absent. Whether the SFX read as hit/hurt/jump/launch/pickup/warning/ritual,
  whether per-face ambience is *audible* as a new band entering the mix (T-012's
  "per-face ambience layering audible across corner rituals" criterion), whether
  the mix balance and ducking feel right, and whether any of it is fun are all
  **unverifiable in headless CI and unverified here**. They need the operator
  (or a human at a real speaker). Routed to the operator as questions below —
  never failed on.
- `protoScore`, `airborneKills`, and `links` remain proxies per the harness
  README; treat them as trend evidence only.
- Frame rate was not measured. The sim clock tracked realtime with audio on
  (gameMs ≈ wall clock across the 28 s corner probe), which is a weak positive,
  not an fps measurement. A real 60 fps / 200-projectile check belongs with
  T-011's juice pass.
- Sampling is polled (~75 ms); the probes' corner-state and ramp-batch timings
  are bounded by a 200 ms poll, so quoted instants are ±one poll.
- One S3 defect filed (see below). It does not affect the shipped game's
  behavior, so it does not gate the merge.

## Routed to the operator (feel — not gate criteria)

Suggested for the SPRINT checkpoint queue when the integrator posts T-012's
packet (the builder report already lists five; these are the gate's additions,
with the exact URLs I ran):

1. `http://127.0.0.1:8741/index.html` — over the first corner ritual, does the
   new ambience band read as *another layer of the machine waking up*, or just
   as "louder"?
2. `http://127.0.0.1:8741/index.html?slice=transform` — do the two ritual snaps
   land on the camera detents, or do they sound early/late against the picture?
3. `?audio=0` vs default on the same route — does muting change how the pace
   reads? (If yes, DESIGN's caveat about re-asking "boring" verdicts after
   feedback lands applies to audio too.)
4. Is the SFX-vs-ambience balance right, or is the ambience bus too quiet to
   carry the altitude story it is meant to tell?

## Issues filed

- **I-005** (S3, `SPRINT.md` Inbox) — `audioSnapshot()` is exported from
  `src/ui/audio.js` and documented in-code as a "read-only debug surface
  (browser console)", but nothing imports it and it is never attached to
  `window`/`HB`, so with no build step and ES-module scoping it is unreachable
  from a console or a harness probe. Cosmetic for players, real for QA: I had to
  instrument the WebAudio API to observe layer state that this function already
  computes.
