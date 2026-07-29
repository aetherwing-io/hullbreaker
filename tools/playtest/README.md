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
loads `index.html?slice=traversal`, replays the script's key events with real
timing, samples game state ~13x/sec, and writes `report.json` + `summary.md`
+ a screenshot into `runs/<script-name>-<timestamp>/`.

Useful flags:

```sh
node run.mjs scripts/mid-route.json --headed          # watch it play
node run.mjs scripts/mid-route.json --video            # also record a .webm
node run.mjs scripts/mid-route.json --out my-run-dir    # explicit output dir
node run.mjs scripts/mid-route.json --url http://localhost:8741/index.html?slice=traversal
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
This was verified empirically (see commit history): Playwright's keyboard
API accepts the game's exact `code` strings (`KeyD`, `ArrowLeft`, `Space`,
`ShiftLeft`, …) and produces `e.code` values that match 1:1, so scripts can
use real key codes directly with no translation layer to trust.

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

## Metrics and what they mean

Every report has two fidelity modes, and **the mode actually observed in
this environment today is `dom` (degraded)** — see Limitations below for
exactly why and what that costs.

- **`fidelity` / `hbDetected`** — `full` if `window.HB` was present on the
  page (a debug handle the splitter agent is adding as part of the module
  split; not present on `main` as of this writing), `dom` if the harness fell
  back to reading the HUD/overlay text nodes instead.
- **outcome** (`completed` / `died` / `stalled` / `not-completed`) — derived
  from the traversal slice's own overlay text (`TRAVERSAL CLEAR` = completed)
  and `sliceStats.attempts`/idle fraction for the other labels. See
  `computeOutcome` in `lib/metrics.mjs` for the exact heuristic; it's a
  heuristic, not ground truth, and is intentionally conservative about
  claiming `stalled` when idle time isn't measurable (dom mode almost always
  reports `not-completed` instead of `stalled` for that reason).
- **idle time** — total/fraction of PLAYING time where `sqrt(vx²+vy²)` stays
  below 1.2 tiles/sec. **Full-fidelity only.** This is the direct proxy for
  the operator's "boring" verdict from `docs/FLEET-PLAN.md`, and it is
  currently the single biggest reason to land `window.HB` — see Hook
  requests below.
- **closest crush-edge approach** — minimum observed `sliceStats.minEdgeMargin`
  (the game already computes this every frame; the harness just tracks its
  minimum). Available in **both** fidelity modes, because the HUD renders it
  directly (`EDGE {n}` in the top-right HUD). This one metric alone
  discriminated cleanly across the three demo scripts even without
  `window.HB` — see demo results below.
- **vertical range** (`minY`/`maxY`/`span`) — **full-fidelity only**; the HUD
  never shows y position.
- **route inference** — matches the (x, y) trace against a hardcoded copy of
  `TRAVERSAL_FIXTURE`'s connector graph (`lib/fixture.mjs`) using a greedy
  nearest-connector-in-order match within a 2.2-tile radius, and reports the
  best-matching route id and a confidence score. **Full-fidelity only** and
  approximate even then — it's nearest-neighbor matching, not a topological
  solve, and the fixture copy is a hand-maintained snapshot (see the header
  comment in `lib/fixture.mjs`) that can silently drift from `index.html`.
- **jump/air-jump counts** — `sliceStats.airJumps`. **Full-fidelity only**,
  and even then only reflects the *current* attempt: the game resets this
  counter to 0 on every retry, so a multi-attempt run's peak/final numbers
  understate the session total. Reported as both `finalAttemptAirJumps` and
  `peakSingleAttemptAirJumps` with that caveat inline.
- **input density** — scripted events/sec. Always available; it's a property
  of the script, not of observed play.
- **damage/death events** — `deaths` counts `sliceStats.attempts` increments
  (works in both modes); `hitsWithoutDeath` counts hp pip decreases that
  didn't coincide with a death (also both modes, since hp pips are rendered
  in the HUD as `▰▰▰`/`▱`).
- **dare pocket** — `entered` (position-in-bounds in full mode, or the
  `H WAGER`/`H ACQUIRED` HUD text in dom mode) and `rewardTaken` (current
  weapon letter matches the fixture's reward letter — visible in both
  modes).

## Demo runs

Three scripts are committed under `scripts/`, with their reports committed
under `reports/demo/` (screenshots/videos are gitignored; the JSON + summary
are the actual demo artifact — rerun with `--video` locally to get fresh
video/screenshots).

| Script | Policy | Result (this environment, dom mode) |
| --- | --- | --- |
| `mid-route.json` | Hold right + hold fire + tap jump every ~800ms — a heuristic that leans on the game's forgiving ledge/wall-jump catch instead of solving exact timing | **completed** in 8.5s, crush margin 18.4 tiles, 1 hit taken, 0 kills |
| `dare-pocket.json` | Commits into the dare pocket, retreats within the wager window, then resumes the hop policy | **not-completed** within its 9.5s window, crush margin 11.1 tiles, 2 hits taken |
| `idle-greedy.json` | Zero key events for 8s (`&enemies=0` to isolate the signal from ambient wasp combat) | **not-completed**, crush margin **0.4 tiles** — pinned against the pursuing edge |

That 18.4 / 11.1 / 0.4 tile spread is the headline finding: even in degraded
DOM-only mode, the crush-edge-margin metric alone cleanly separates "moving
with intent," "moving but distracted," and "standing still," which is
exactly the pursuit-pressure diagnosis in `docs/FLEET-PLAN.md` ("Pursuit
clock too soft ... no timed decisions"). The `mid-route` completion was
verified against the game's own end-of-run overlay text (`TRAVERSAL CLEAR`,
"7.6s · 0 kills · 2 air jumps · closest damage-edge margin: 15.7 tiles" —
note this final in-overlay number differs slightly from the running-min the
harness tracked mid-flight, 18.4 vs 15.7, because the harness's last sample
before the overlay appeared wasn't the single minimum instant; both numbers
come from the same `sliceStats.minEdgeMargin` field, just sampled at
~75ms resolution rather than every frame).

Reproduce any of them:

```sh
node run.mjs scripts/mid-route.json --out /tmp/check
node run.mjs scripts/dare-pocket.json --out /tmp/check
node run.mjs scripts/idle-greedy.json --out /tmp/check
```

## Honesty / limitations — read before trusting a report

1. **This environment has no `window.HB` yet.** Every demo report above ran
   in degraded DOM mode. That mode is genuinely reliable for: outcome
   (completed/not), attempts/deaths, hp/hits, kills, current weapon, dare
   pocket entry/reward, and — crucially — crush-edge margin, because the
   game already computes and displays that number. It **cannot** measure
   idle time, vertical range, or route inference, because the HUD never
   renders position or velocity. Those fields are `null` with an explicit
   `unavailableReason` string in every report rather than an invented number.
2. **Open-loop scripts are not a real playtester.** A script can't see the
   screen or react to a missed jump; it plays back fixed timing against
   physics and hopes. The `mid-route` completion should be read as "a naive
   hold-right-and-hop policy can clear this route by leaning on ledge/wall
   forgiveness," not "this route is easy" — a human or a future closed-loop
   bot (reading `window.HB` and reacting per-frame) is a different kind of
   evidence. `dare-pocket` not completing in one scripted attempt is the
   expected, unsurprising case, not a harness failure.
3. **Route inference is approximate and undemonstrated in this environment.**
   The nearest-connector greedy matcher in `lib/metrics.mjs` has not been
   exercised against a real (x, y) trace because no demo run had
   full fidelity. It should be treated as unverified until a `window.HB` run
   confirms it against a known route.
4. **`lib/fixture.mjs` is a hand-copied snapshot**, not an import. Nothing
   checks it against `index.html`'s real `TRAVERSAL_FIXTURE`. If fixture
   geometry changes, route inference silently goes stale until someone
   re-syncs it by hand (flagged in the file's header comment).
5. **Sampling is polled, not event-driven.** At ~75ms intervals a fast state
   change (e.g. a single frame spent at the true minimum crush margin) can be
   missed by a sample or two; the mid-route demo's 18.4-tile harness reading
   vs. the game's own 15.7-tile end-of-run figure is a real example of that
   resolution gap, not a bug.
6. **`outcome: 'stalled'` is effectively unreachable in dom mode** today
   because it requires an idle-fraction number `full` fidelity supplies. The
   idle-greedy demo therefore reports `not-completed`, not `stalled` — read
   the crush-margin number (0.4 tiles) as the actual evidence of stalling
   here, not the outcome label.

## Hook requests for the game/module-split side

In priority order:

1. **`window.HB` with at least**: `player.{x,y,vx,vy,grounded,hp}`,
   `scrollX`, `state`, `currentWeapon`, `kills`, `hostiles` (array or count),
   `sliceStats` (same shape already in `index.html`). This one addition
   unlocks idle time (the operator's direct "boring" proxy), vertical range,
   and route inference — currently the three most valuable metrics this
   harness can't deliver.
2. Once the module split lands `src/pure/traversal.js`, replace
   `lib/fixture.mjs`'s hand-copied snapshot with a real import and delete
   the staleness risk.
3. Nothing else blocks this harness — it does not need any other index.html
   change.

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
    sampler.mjs            in-page probe (window.HB or DOM fallback)
    metrics.mjs            trace -> report metrics
    fixture.mjs             hardcoded TRAVERSAL_FIXTURE route-graph snapshot
    report.mjs              report.json + summary.md writer
  scripts/                 example input scripts
  reports/demo/             committed demo run output (json/md only)
  runs/                     default ad-hoc output dir (gitignored)
```

## Single best next action

Land `window.HB` (splitter's lane) and re-run all three demo scripts. That
alone converts idle time, vertical range, and route inference from
`unavailableReason` strings into real numbers, and lets a second demo pass
directly answer the fleet's actual question: how much of a "competent" or
"idle" run is genuinely idle, not just how close it got to the crush edge.
