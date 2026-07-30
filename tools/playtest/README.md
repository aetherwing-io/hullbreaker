# HULLBREAKER bot-player playtest harness

A dev-only tool that plays HULLBREAKER in a real browser from a scripted
sequence of keyboard events, then reports pacing/fairness metrics from what
actually happened. This exists because `tools/pathcheck.mjs` proves routes
are reachable *mathematically* — nothing before this harness actually played
the game. Fleet agents can use it to run reproducible playthroughs and get
numbers instead of vibes.

This tool has **no effect on the game itself**. It lives entirely under
`tools/playtest/`, has its own `package.json` and dev-only dependency
(`playwright-core`), and never edits `index.html`.

## Quick start

```sh
cd tools/playtest
npm install                       # once
node run.mjs scripts/mid-route.json
```

This starts a local static server for the repo, launches your installed
Chrome (headless, via Playwright's CDP driver — no browser binary download),
loads `index.html?slice=traversal&testapi=1`, replays the script's key events
with real timing, samples game state ~13x/sec, and writes `report.json` +
`summary.md` + a screenshot into `runs/<script-name>-<timestamp>/`.

Useful flags:

```sh
node run.mjs scripts/mid-route.json --headed          # watch it play
node run.mjs scripts/mid-route.json --video            # also record a .webm
node run.mjs scripts/mid-route.json --out my-run-dir    # explicit output dir
node run.mjs scripts/mid-route.json --url http://localhost:8741/index.html?slice=traversal
node run.mjs scripts/mid-route.json --no-testapi        # test what a debug-flag-free session sees
node run.mjs --help                                     # full flag list
```

`--url` skips the built-in static server entirely — point it at a
`python3 -m http.server` instance or anything else already serving the repo.

## Input-script format

A script is one JSON file: a URL, an optional viewport/duration, and a list
of key events. Two ways to author events, freely mixable in one file:

**Raw** — exactly what gets dispatched, in `KeyboardEvent.code` terms:

```json
{ "events": [
  { "t": 600, "type": "keydown", "code": "Space" },
  { "t": 680, "type": "keyup",   "code": "Space" }
] }
```

**Semantic sugar** — a thin layer that expands to the same raw events before
anything is dispatched (see `lib/compile.mjs`):

```json
{ "moves": [
  { "hold": "right", "fromMs": 0,   "toMs": 4200 },
  { "tap":  "jump",  "atMs": 600, "holdMs": 90 }
] }
```

Recognized aliases: `left`/`right`/`up`/`down` (arrow keys), `jump` (Space),
`fire` (KeyJ), `strafe` (ShiftLeft), `pause` (KeyP), `restart` (KeyR). You can
also use a raw `code` directly (`KeyA`, `KeyD`, `KeyK`, `KeyX`, `ShiftRight`,
`Escape`, …) anywhere an alias is accepted. These are the exact `code`
values the game's own `KEYMAP` in `index.html` listens for — nothing is
translated or reinterpreted at dispatch time.

Full script shape:

```json
{
  "name": "my-script",
  "description": "what this is trying to prove",
  "url": "index.html?slice=traversal",
  "viewport": { "width": 1280, "height": 800 },
  "durationMs": 9000,
  "events": [ ... ],
  "moves": [ ... ]
}
```

`durationMs` is a floor on the run length — it matters most for scripts with
few or zero events (an idle-test script has no events at all but must still
run its full intended window). The actual stop time is
`max(last event time, durationMs) + tailMs` (tail defaults to 900ms), capped
by `--max-runtime-ms` (default 25000ms) as a hang safety net, or cut short
~400ms after the traversal-slice VICTORY overlay is observed.

The compiler (`lib/compile.mjs`) rejects a script with unmatched
keydown/keyup pairs for the same code — that's a script bug, not something
the driver silently tolerates.

## How input is actually delivered

Every event is a real Chrome DevTools Protocol key event via
`page.keyboard.down/up(code)` — the same mechanism a human's keypress
produces, not a synthetic DOM `dispatchEvent` and not direct state mutation.
This was verified empirically: Playwright's keyboard API accepts the game's
exact `code` strings (`KeyD`, `ArrowLeft`, `Space`, `ShiftLeft`, …) and
produces `e.code` values that match 1:1, so scripts can use real key codes
directly with no translation layer to trust.

Each run reports achieved dispatch jitter (`meta.dispatchJitterMsAvg/Max` in
`report.json`) — the difference between an event's scheduled `t` and when it
was actually sent — and achieved sampling interval, not just the requested
ones. In local testing this harness dispatched within ~1ms of schedule on
average and sampled state within ~1-2ms of the requested 75ms interval; see
each run's own report for its actual numbers rather than assuming these.

## Browser: real Chrome, no download

The driver launches Playwright's `chromium` module with `channel: 'chrome'`,
which drives your **installed system Chrome** (`/Applications/Google
Chrome.app` on macOS) over CDP instead of downloading a bundled Chromium
binary. This was a deliberate choice for this environment: `playwright-core`
(no bundled browsers) plus `channel: 'chrome'` works out of the box with zero
network access to Playwright's own CDN. If system Chrome isn't available,
pass `--channel chromium` after running `npx playwright install chromium`
once (requires that download to succeed in your environment) — the rest of
the harness is unaffected either way.

## State sampling: three fidelity channels

The sampler (`lib/sampler.mjs`) checks, in order:

1. **`testapi`** — `globalThis.__HULLBREAKER_TEST__.snapshot()`, present when
   the URL has `?testapi=1` (which `run.mjs` adds **by default**; disable
   with `--no-testapi`). This is a read-only telemetry hook the game itself
   already ships (introduced in commit `15f66d2`, "Accelerate traversal
   slice from playtest feedback"; since the module split it lives in
   `src/main.js`, documented as unable to mutate the simulation). **This
   was missed in this harness's
   first pass**, which assumed no such hook existed and built a DOM/HUD-text
   fallback as the only option; it was found while aligning metrics with
   Appendix A.5 below. It gives exact `player.{x,y,vx,vy,grounded,
   traversalState,traversalControlUntil}`, `scrollX`, `gameMs`, `state`, an
   *unrounded* `edgeMargin`, `weapon`, `attempt`, `falls`.
2. **`full`** (`window.HB`) — the splitter's planned debug handle, not
   present on `main` as of this writing. Same kind of data as `testapi`, from
   a different source, for whenever it lands.
3. **`dom`** — neither exists. Falls back to parsing the HUD/overlay text
   nodes: attempt count, crush-edge margin (rounded to 1 decimal), kill
   count, hp pips, current weapon letter, dare-pocket/overlay text.

kills/hp/weapon/overlay text are always read from the DOM as a base layer and
merged with whichever physics channel is available — neither telemetry
channel exposes those itself.

**Every demo run in this repo now runs in `testapi` mode** (see below) — the
degraded-`dom`-mode caveats from earlier drafts of this README no longer
apply to the committed demo reports, only to a hypothetical run with
`--no-testapi` and no `window.HB`.

## Metrics and what they mean

- **`fidelity` / `highFidelityDetected` / `testapiDetected`** — which channel
  supplied the majority of samples.
- **outcome** (`completed` / `died` / `stalled` / `not-completed`) — derived
  from the traversal slice's own overlay text (`TRAVERSAL CLEAR` = completed)
  and `attempts`/idle fraction for the other labels. See `computeOutcome` in
  `lib/metrics.mjs`; it's a heuristic, not ground truth, and `stalled`
  specifically requires an idle-fraction number that only `testapi`/`full`
  fidelity supplies (in `dom`-only mode it falls back to `not-completed`).
- **idle time** (A.5 `stallMs`) — **grounded `&&` `abs(vx) < 2` `&&`
  `traversalState === 'free'`**, over PLAYING time. This is the direct proxy
  for the operator's "boring" verdict in `docs/FLEET-PLAN.md`. See "Alignment
  with the score proposal (A.5)" below — this replaced an earlier, different
  placeholder threshold in this harness.
- **airborne time** (`airMs`) — total PLAYING time where `grounded === false`
  (includes wall-slide, since the player isn't on a floor). `testapi`/`full`
  only.
- **closest crush-edge approach** (`minEdgeMargin`) — minimum observed
  `edgeMargin`. Available in **every** fidelity mode (the HUD renders a
  rounded version, `testapi`/`full` give the exact value) — this one metric
  alone cleanly separated all three demo policies even in the very first,
  degraded-mode pass of this harness.
- **vertical range** (`minY`/`maxY`/`span`) — `testapi`/`full` only.
- **route coverage** (A.5 `routeIds`) — every fixture route (from
  `lib/fixture.mjs`'s hardcoded `TRAVERSAL_FIXTURE` snapshot) with `>= 3`
  connectors visited in order, matched within a 2.2-tile radius. Also reports
  a supplementary single-best-guess `matchedRouteId`/`confidence` (this
  harness's addition, not part of A.5). `testapi`/`full` only, and
  approximate even then — nearest-neighbor greedy matching, not a
  topological solve, against a fixture copy that can silently drift from
  `index.html` (see `lib/fixture.mjs`'s header comment).
- **jump/air-jump counts** — `sliceStats.airJumps`. **Still unavailable even
  in `testapi` mode** — the snapshot has `attempt`/`falls` but not
  `airJumps`. Only `window.HB` (if it adds it) can supply this today. Even
  then it only reflects the *current* attempt, since the game resets the
  counter every retry.
- **input density** — scripted events/sec. Always available (a script
  property, not an observation). A.5 is explicit that this is **not** a
  score input ("rewarding input density would reward mashing"); it's
  reported purely as a harness/pacing diagnostic and never feeds `protoScore`.
- **damage/death events** — `deaths` counts `attempts` increments (every
  mode); `hitsWithoutDeath` counts hp-pip decreases that didn't coincide with
  a death (every mode — hp pips are always in the HUD).
- **airborne kills, `protoScore`** — see the A.5 section immediately below;
  both are proxies pending the real score-event stream.
- **dare pocket** — `entered` (position-in-bounds in `testapi`/`full`, or the
  `H WAGER`/`H ACQUIRED` HUD text in `dom` mode) and `rewardTaken` (current
  weapon letter matches the fixture's reward letter — every mode).

## Alignment with the score proposal (A.5)

`docs/proposals/2026-07-score-and-setback.md` Appendix A.5 defines a shared
instrumentation vocabulary so bot runs are comparable before and after the
CHARGE/THREAT score system exists. Per the integrator's coordination
request, this harness adopted it as follows:

- **Idle time now has exactly one owner and one threshold, per A.5's
  request.** This harness's *original* idle-time definition (before this
  update) was `sqrt(vx²+vy²) < 1.2` tiles/sec with no `grounded` or
  `traversalState` gating — a placeholder, chosen before `traversalState`
  was even observable. **A.5's definition was adopted in full**, replacing
  it: `grounded && abs(vx) < 2 && traversalState === 'free'`. This is not a
  disagreement to reconcile — the harness now matches A.5 exactly — but it
  is flagged here per the integrator's request because it changed real
  output: the `idle-greedy` demo's outcome went from `not-completed` (old
  threshold, DOM-only mode, idle fraction unavailable) to `stalled` (new
  threshold, `testapi` mode, idle fraction 0.949).
- **Route coverage**: `metrics.route.routeIds` implements A.5's rule exactly
  (`>= 3` connectors visited in order). The match radius (2.2 tiles) is this
  harness's own choice — A.5 doesn't specify one — and is documented inline.
- **`protoScore`**: computed with A.5's exact published formula,
  `100·airborneKills + 25·links + 12·(airMs/1000) − 8·(stallMs/1000)`, but
  **`airborneKills` and `links` are proxies, not the real thing**, because
  `HB.score.events`/`HB.score.snapshot()` don't exist yet (A.5 proposes them
  as a *future* surface, not something already shipped):
  - `airborneKills` proxy: every observed increase in the kills counter where
    the preceding `testapi`/`full` sample had `grounded === false`.
  - `links` proxy: `(best-matched route's matched-connector count) − 1`, i.e.
    connector-to-connector transitions the position trace actually passed
    through, from this harness's own route matcher.
  - Both are labeled `unavailableReason`/`note` in the report so a reader
    doesn't mistake them for the authoritative event-derived numbers A.5
    describes. **Replace both with real counts once `HB.score.events` lands**
    — that's a small, isolated change in `lib/metrics.mjs`'s
    `computeAirborneKills`/`inferRoute`.
- **Input density is deliberately excluded from `protoScore`**, per A.5's own
  reasoning; reported separately.
- `minEdgeMargin` is read from the game (via `testapi`/HUD), never
  recomputed, per A.5's determinism note.

## Demo runs

Three scripts are committed under `scripts/`, with their reports committed
under `reports/demo/` (screenshots/videos are gitignored; the JSON + summary
are the actual demo artifact). All three now run in **`testapi` fidelity**.

| Script | Policy | Result |
| --- | --- | --- |
| `mid-route.json` | Hold right + hold fire + tap jump every ~800ms — a heuristic that leans on the game's forgiving ledge/wall-jump catch instead of solving exact timing | **completed**, idle fraction **0%**, airborne 6.0s, crush margin 17.6 tiles, protoScore **147.5** |
| `dare-pocket.json` | Commits into the dare pocket, retreats within the wager window, then resumes the hop policy | **not-completed**, idle fraction **34%**, crush margin 11.1 tiles, protoScore **120.7** |
| `idle-greedy.json` | Zero key events for 8s (`&enemies=0` to isolate the signal from ambient wasp combat) | **stalled**, idle fraction **94.9%**, crush margin **0.4 tiles**, protoScore **−37.2** |

The headline finding: idle fraction (0% / 34% / 95%), crush-edge margin
(17.6 / 11.1 / 0.4 tiles), and protoScore (147.5 / 120.7 / −37.2) all move in
lockstep and cleanly separate all three policies — "moving with intent,"
"moving but distracted," and "standing still." That's a direct, working
confirmation of the pursuit-pressure diagnosis in `docs/FLEET-PLAN.md`
("Pursuit clock too soft ... no timed decisions"), and it's now backed by
real position/velocity data, not just the crush-margin proxy alone.

Reproduce any of them (exact numbers will vary run-to-run — physics timing
against a live scroll/spawn clock isn't perfectly deterministic frame-to-frame
for an open-loop script):

```sh
node run.mjs scripts/mid-route.json --out /tmp/check
node run.mjs scripts/dare-pocket.json --out /tmp/check
node run.mjs scripts/idle-greedy.json --out /tmp/check
```

## Honesty / limitations — read before trusting a report

1. **Open-loop scripts are not a real playtester.** A script can't see the
   screen or react to a missed jump; it plays back fixed timing against
   physics and hopes. The `mid-route` completion should be read as "a naive
   hold-right-and-hop policy can clear this route by leaning on ledge/wall
   forgiveness," not "this route is easy" — a human or a future closed-loop
   bot (reading `testapi`/`window.HB` and reacting per-frame) is a different
   kind of evidence. `dare-pocket` not completing in one scripted attempt is
   the expected, unsurprising case, not a harness failure.
2. **`airborneKills` and `links` (and therefore `protoScore`) are proxies**,
   not the real A.5 event-derived numbers — see the A.5 section above. They
   are internally consistent enough to rank the three demo policies
   correctly, but should not be treated as literally comparable to a future
   `HB.score.snapshot()`-derived score until the real event stream exists.
3. **Route coverage/inference is approximate.** The nearest-connector greedy
   matcher in `lib/metrics.mjs` is not a topological solve, and
   `lib/fixture.mjs` is a hand-copied snapshot of `TRAVERSAL_FIXTURE`, not an
   import — nothing checks it against `index.html`, so it can silently go
   stale if fixture geometry changes (flagged in the file's header comment).
4. **Jump/air-jump counts remain unavailable** even in `testapi` mode — the
   snapshot doesn't expose `sliceStats.airJumps`. Only a future `window.HB`
   (or a trivial addition to the `testapi` snapshot) can supply this.
5. **Sampling is polled (~75ms), not event-driven.** A single fast frame at
   the true instantaneous minimum/maximum can be missed by a sample or two —
   e.g. the harness's tracked `minEdgeMargin` and the game's own end-of-run
   overlay figure can differ by a small amount for exactly this reason, not
   a bug.
6. **This harness's first pass missed the `?testapi=1` hook entirely** and
   built a DOM/HUD-text-only fallback assuming no such channel existed. That
   fallback is still there (and still the least-bad option if `testapi` is
   disabled and `window.HB` hasn't landed), but the initial round of demo
   reports and this README's original "degraded DOM mode" framing were
   written before the hook was found. Worth remembering when trusting any
   analysis this harness (or any tool) produces about its own environment:
   verify the assumption that a capability doesn't exist before designing
   around its absence.

## Hook requests for the game/module-split side

1. **Add `sliceStats.airJumps` to the `?testapi=1` snapshot** (or expose it
   via `window.HB`) — the only field this harness still can't get despite
   `testapi` otherwise covering almost everything asked for. Trivial,
   alongside the existing `attempt`/`falls` fields.
2. **Land `HB.score.events`/`HB.score.snapshot()`** per A.5, once the CHARGE
   system exists, so `computeAirborneKills`/the `links` proxy in
   `lib/metrics.mjs` can be replaced with the real event-derived counts
   instead of the kills+grounded / route-matcher approximations described
   above.
3. Once the module split lands `src/pure/traversal.js`, replace
   `lib/fixture.mjs`'s hand-copied snapshot with a real import.
4. `window.HB` itself is now a lower priority for this harness specifically
   — `testapi` already covers player physics/traversal state/scrollX/state.
   It's still useful to other consumers per the splitter's original brief.

## Known limitations (engineering, not measurement)

- No retry/backoff around browser launch or page navigation failures beyond
  the boot-readiness timeout (8s) reported as `meta.bootError`.
- The static server has no directory index handling beyond `/` →
  `index.html`; fine for this repo's flat layout, not general-purpose.
- Video recording (`--video`) uses Playwright's built-in per-context
  recorder — reliable, but adds real wall-clock overhead to context
  teardown; left off by default.
- No parallel-run support (one browser per `run.mjs` invocation); running
  multiple scripts concurrently means invoking `run.mjs` multiple times,
  each getting its own ephemeral static-server port.

## Files

```
tools/playtest/
  package.json          playwright-core, dev-only, no runtime impact
  run.mjs                CLI entry point
  lib/
    server.mjs           static file server for the repo root
    compile.mjs           moves/events -> flat time-sorted event list
    driver.mjs            browser launch, input replay, sampling loop
    sampler.mjs            in-page probe (testapi / window.HB / DOM fallback)
    metrics.mjs            trace -> report metrics, incl. A.5 alignment
    fixture.mjs             hardcoded TRAVERSAL_FIXTURE route-graph snapshot
    report.mjs              report.json + summary.md writer
  scripts/                 example input scripts
  reports/demo/             committed demo run output (json/md only)
  runs/                     default ad-hoc output dir (gitignored)
```

## Single best next action

Add `sliceStats.airJumps` to the `?testapi=1` snapshot (one line, alongside
the existing `attempt`/`falls` fields) — it's the single remaining gap this
harness can't close on its own, and unlike `HB.score.events` it doesn't
require the score system to exist first.
