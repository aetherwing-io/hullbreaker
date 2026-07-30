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
node run.mjs scripts/adversarial/t2-transform-seam-rush.json --deterministic --max-runtime-ms 26000
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

## Closed-loop policy mode

Motivated by two attacks the adversarial report (`docs/playtests/2026-07-adversarial.md`,
finding H3) found structurally impossible for a fixed-timestamp script: the
column-39 low-route step needs a jump tapped within a one-to-two-frame
window, but that window is relative to a *moving arrival time* — CP1's pace
tuning changed when the player gets there, so a tap pinned to a literal ms
value that passed pre-CP1 now misses. No amount of retiming a fixed
timestamp fixes this; the script needs to react to the game's own state.

A script may add a `"policy"` block, alongside or instead of `"events"`/`"moves"`:

```json
{ "policy": { "rules": [
  { "when": "pinned",            "do": { "tap": "jump" } },
  { "when": "houndTell",         "do": { "tap": "jump", "holdMs": 90 } },
  { "when": "grounded && x>44",  "do": { "hold": "right" } }
] } }
```

Rules are evaluated every sample tick against that tick's already-polled
snapshot (`lib/sampler.mjs`) — no extra `page.evaluate` calls, no lookahead,
no planning. This is a reflex layer, not an AI, on purpose: every condition a
script can express is meant to be readable at a glance.

**Condition grammar** (`lib/policy.mjs`) — `a && b && c` only, no `||`, no
parens, and never `eval()`/`new Function()`. Each clause is either:

- a named predicate, optionally negated with `!`:
  - `pinned` — grounded, `|vx| < 0.3`, and the harness currently has a
    direction key held (`ArrowLeft`/`ArrowRight`) — the F8/H3 "commanded to
    move but jammed" signal.
  - `airborne`, `grounded` — `player.grounded` false/true.
  - `houndTell`, `houndCharge` — any hostile with `kind: 'hound'` currently
    in the `tell`/`charge` state (`src/sim/hostiles.js`'s
    prowl→tell→charge→skid/tumble machine).
  - `victory` — the traversal-slice VICTORY overlay or `state`.
- a bare sample field, optionally negated, tested for truthiness (e.g. `grounded`, `!grounded`).
- a numeric comparison against a sample field: `field OP number`, `OP` one of `> >= < <= == !=` (e.g. `x>44`, `hp<=1`).

A field that never appears in any sample (a typo, or a field this
slice/fidelity doesn't carry) evaluates its clause to `false` rather than
crashing the run, but every occurrence is counted and surfaced in
`report.json`'s `policy.missingFieldWarnings` (and printed to the console) —
a typo doesn't fail silently forever, it just doesn't stop a 25-second run
either.

**Actions:**

- `tap` — edge-triggered: fires once on a false→true transition, presses the
  key, releases after `holdMs` (default 60ms) via a fire-and-forget timer so
  a tap's hold duration never blocks the sample cadence. Won't re-fire on a
  second consecutive true tick — the condition has to go false and true
  again.
- `hold` — level-triggered: the key is down for exactly as long as the
  condition is true, re-synced every tick. Multiple `hold` rules targeting
  the same code combine by OR.

`run.mjs` rejects a script where a policy `hold` rule and the static
events/moves list target the same code — that ownership conflict is
genuinely ambiguous, same philosophy as the double-edge check on the static
timeline. (`tap` rules aren't checked against the static list — a momentary
press coexisting with a static tap on the same code is unusual but not
structurally ambiguous the same way.)

**Known, accepted limitation** (documented, not engineered around — keeping
this a dumb reflex layer was the point): rapid re-triggering of the same
`tap` code before its previous release fires can release the key early.
Not expected to matter for the shipped predicates — a hound's `tell` window
and a terrain pin don't oscillate faster than one sample interval — but
worth knowing before adding a new fast-oscillating predicate.

**Proof it works, precisely** (`scripts/policy-hound-reactive.json`,
`?slice=traversal&hound=1`, committed under `reports/demo/policy-hound-reactive/`):
rebuilds `hound-jump.json` (two fixed taps at 880ms/1330ms) with zero timed
jumps — `pinned` and `houndTell` only. The committed run shows the *second*
of three hounds (`hostiles[1]`) entering `tell` at x=49.47 while the first
hound had already passed to x=32.38 in `prowl` — the rule correctly fired on
the hound that was actually telegraphing, not a fixed clock. (Whether that
particular jump *dodges* the resulting charge is a separate, real combat-
tuning question the run also surfaced honestly: hp dropped 3→2 despite the
reactive tap firing at the right instant — flagging for `combat`/adversarial
rather than tuning it here.) `scripts/policy-pinned-jump.json` is the
narrower single-predicate version: holds right with zero timed jumps at all,
fires `pinned` 13 times crossing the whole route's terrain, and reaches the
dare pocket (grabbing the reward) purely reactively.

## Deterministic injection mode

The adversarial report also measured non-determinism: `t2-transform-seam-rush`
(hold right + mash Space for 20s, byte-identical input) produced `maxX`
112.11 / 83.65 / 87.30 across three runs — a 28-tile spread — with wall-clock
dispatch jitter interacting with the game's variable-timestep frame loop as
the suspected cause.

`--deterministic` changes *when* an event is sent: instead of a wall-clock
timer, the driver polls `sample.gameMs` (the game's own sim clock, requires
`testapi`/`window.HB`) every sample tick and dispatches any event whose `t`
has been reached, in order. This quantizes dispatch to the sample interval —
an event scheduled for `gameMs=1400` fires at the first tick where
`gameMs>=1400`, up to `sampleMs` of sim time late, recorded per-event as
`gameMsJitterMs` — rather than eliminating jitter outright; lower
`--sample-ms` for a tighter bound. A useful side effect: an event scheduled
during a pause/retry freeze (`gameMs` doesn't advance) correctly waits for
gameplay to resume instead of firing based on real elapsed time regardless.
Requires `testapi`/`window.HB`; without a number in `sample.gameMs`,
`run.mjs` prints an error and exits non-zero rather than silently behaving
like wall-clock mode (this was caught immediately in practice — see
Honesty/limitations below).

**Quantified, both directions:**

- **`mid-route.json` (traversal slice, no ritual thresholds), 3× wall-clock
  vs 3× deterministic:** victory time spread shrank from 609ms (6827–7436ms)
  to 74ms (6297–6371ms) — about 8× tighter. `protoScore` spread shrank from
  32.3 (140.5–172.8) to 2.7 (83.0–85.7) — over 10× tighter. `minEdgeMargin`
  landed on the exact same value (35.44 tiles) in all three deterministic
  runs versus a small spread wall-clock. This is what the mode is supposed
  to do, and it does it.
- **`t2-transform-seam-rush.json` (transform slice, crosses ritual
  thresholds), 5× wall-clock vs 5× deterministic:** `maxX` spread did
  **not** meaningfully shrink (48.39 tiles wall-clock vs 48.48 deterministic)
  — essentially unchanged. But the *reason* is itself the finding: three of
  the five deterministic runs landed at `maxX` 132.45/132.61/132.61 (a
  0.16-tile spread — near-perfect determinism within that cluster), and the
  other two landed at 84.13/84.89. Digging into *when* — the two clusters'
  **first death time diverges by up to ~6.5 seconds of `gameMs`**
  (2805–3351ms vs 8797–9268ms) from byte-identical, sim-time-locked input.
  An input-dispatch-jitter explanation cannot produce a divergence that
  large; something inside the simulation itself forks into one of two
  outcomes depending on factors this mode doesn't control.

**Characterizing the residual divergence (per the task's ask):** dispatch
jitter is not the dominant source of `t2`'s non-determinism — the game's
"clamped variable timestep" (per `README.md`'s architecture notes) means
frame-to-frame `dt` varies with real rendering/host load regardless of when
input was sent, and if a ritual-arming or threshold check is sensitive to
which side of a knife-edge that accumulated variance lands on, byte-identical
input can still fork into qualitatively different runs. Deterministic
*input* was necessary but not sufficient here. This isn't something the
harness can fix by injecting input more precisely — it would need either a
fixed-timestep simulation mode or a way to pin `dt` itself, which is a
game-side question, not a harness one. **Hook request, not a build:** if a
fixed-timestep (or seeded-`dt`) mode for `?slice=transform` (or generally)
is cheap to add, it would let a future harness pass isolate whether the
fork is really `dt`-driven; if not, this is at least now a precisely bounded
finding (~6.5s of gameMs at a specific point early in the run) instead of a
28-tile number with no further diagnosis.

Reproduce the quantification:

```sh
for i in 1 2 3 4 5; do node run.mjs scripts/adversarial/t2-transform-seam-rush.json --max-runtime-ms 26000 --out /tmp/wc-$i; done
for i in 1 2 3 4 5; do node run.mjs scripts/adversarial/t2-transform-seam-rush.json --max-runtime-ms 26000 --deterministic --out /tmp/det-$i; done
```

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
   already ships (introduced pre-module-split in commit `15f66d2`; lives in
   `src/main.js` now, documented there as "the playtest harness's canonical
   channel, field names frozen" and unable to mutate the simulation). **This
   was missed in this harness's first pass**, which assumed no such hook
   existed and built a DOM/HUD-text fallback as the only option; it was
   found while aligning metrics with Appendix A.5 below. It gives exact
   `player.{x,y,vx,vy,grounded,traversalState,traversalControlUntil}`,
   `scrollX`, `gameMs`, `state`, an *unrounded* `edgeMargin`, `weapon`,
   `attempt`, `falls`, `airJumps`.
2. **`full`** (`window.HB.snapshot()`) — `window.HB` is now **unconditional**:
   present on every load, no query param needed (`src/main.js`: "Read-only
   debug handle, always present"). It shares the same underlying
   `telemetry()` function as `testapi` so their common fields can't drift
   apart, and additionally carries `player.{hp,lives,facing,airJumpsLeft}`,
   `kills`, `shotsFired`, `hostiles`, `capsules`. Used whenever `--no-testapi`
   is passed (or if `?testapi=1` is ever removed from `run.mjs`'s default).
   **Note:** `window.HB`'s *other* top-level members (`HB.state`,
   `HB.scrollX`, `HB.currentWeapon`, `HB.kills`, …) are getter **functions**,
   not values — calling them bare (`HB.state` instead of `HB.state()`) would
   silently return a function reference instead of the real value. This
   sampler only ever reads through `HB.snapshot()`, specifically to avoid
   that trap; it was caught during this update, before it ever shipped in a
   committed report (the `full` channel had never actually been exercised —
   `testapi` was always preferred and, until now, always present in every
   demo run).
3. **`dom`** — neither exists. Falls back to parsing the HUD/overlay text
   nodes: attempt count, crush-edge margin (rounded to 1 decimal), kill
   count, hp pips, current weapon letter, dare-pocket/overlay text.

kills/hp/weapon/overlay text are always read from the DOM as a base layer;
`testapi` overlays its frozen minimal set on top (kills/hp still come from
the DOM even in `testapi` mode, since that channel deliberately doesn't
carry them), while `full` (`HB.snapshot()`) overlays its own richer
kills/hp directly since it does carry them.

**Every demo run in this repo runs in `testapi` mode** (the default) — the
degraded-`dom`-mode caveats from earlier drafts of this README don't apply
to the committed demo reports, only to a run with `--no-testapi` on a build
that also somehow lacks `window.HB`.

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
- **jump/air-jump counts** — `sliceStats.airJumps`, from either `testapi` or
  `full`. Only reflects the *current* attempt, since the game resets the
  counter every retry — reported as both `finalAttemptAirJumps` and
  `peakSingleAttemptAirJumps` with that caveat inline.
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

## Fixed: zombie attempts (F7)

The adversarial agent's report (`docs/playtests/2026-07-adversarial.md`,
finding F7) found that the game's fast retry — `scheduleSliceRetry()` and
`resetGame()` in `src/sim/player.js`/`src/main.js` — calls
`releaseAllKeys()` on every death-to-respawn transition. A script that dies
mid-`hold` (e.g. `hold right fromMs:0 toMs:8800`, then dies at 3s) produced a
**zombie second attempt**: the game's `keys.right` gets wiped, and since
Playwright dispatches exactly one `keydown` per `hold` (no OS-level
auto-repeat), nothing ever tells the game the key is still down. Measured in
the adversarial report as 5.2s of `vx = 0` with the key conceptually held.
Every metric computed past that point — idle fraction, route coverage,
margins, `protoScore` — was measuring an empty room.

**Fix** (`lib/driver.mjs`, `reassertHeldKeys`): the driver now tracks which
codes the script currently considers "held" (`heldCodes`, updated as
scripted keydown/keyup events are dispatched) and watches the
`testapi`/`full` `attempts` counter on every sample (already polled every
`sampleMs`, no extra cost). The instant `attempts` ticks up, it re-dispatches
a `keydown` for every currently-held code. Verified empirically that a
second `page.keyboard.down()` for an already-down code produces a real
`repeat: true` keydown, not an error and not a fresh press — and it's
harmless for a held jump specifically, since the game only schedules a new
jump buffer on `!e.repeat`. Detection lag is bounded by `sampleMs` (default
75ms) plus one CDP round-trip, not the multi-second gap the unpatched
harness produced; every run reports the exact lag and count in
`retryReassertions`/`retryDetection`.

**Proof** (`scripts/retry-recovery.json`, committed under
`reports/demo/retry-recovery/`): holds `ArrowRight` only, dies deterministically
around 13.9s (jams on the known column-39 step, `enemies=0`), and the trace
shows `vx` at exactly **0** on the sample carrying the attempt increment
(`tMs=13937`) and **10.08** on the very next sample 75ms later — full run
speed within one polling interval, not 5.2 seconds. `retryReassertions` in
that report's JSON records the single re-press: `{tMs: 13937, attempts: 2,
codes: ["ArrowRight"]}`.

**What this doesn't fix:** a script that dies *while a `tap` is between its
keydown and keyup* (e.g. jump held for its scripted 90ms right as a death
happens) will have that key correctly re-armed too, but the fix can't do
anything about the ~1 polling-interval detection lag itself — a report's
`retryDetection.maxLagMs` states that bound explicitly rather than implying
instantaneous recovery. This is a harness-side fix only; it does not touch
`src/sim/player.js` or `src/main.js` (the adversarial report's suggested
game-side alternative — re-arming held keys on retry, or preserving key
state and only clearing the jump buffer — remains open for
`physics-reviewer` if a game-side fix is still wanted for real-player
experience, which is a separate, `SUSPECTED`-not-`CONFIRMED` question the
adversarial report left open).

## Demo runs

Six scripts are committed under `scripts/`, with their reports committed
under `reports/demo/` (screenshots/videos are gitignored; the JSON + summary
are the actual demo artifact). All six run in **`testapi` fidelity**. The
original four are **re-baselined under `--deterministic`** as of this pass —
see "Deterministic injection mode" above for why that's the more
reproducible reference going forward; numbers below reflect that mode and
will differ from earlier commits' wall-clock baseline (the game's own
tuning has also moved since — CP1 pace/crush fixes landed in the meantime).

| Script | Policy | Result |
| --- | --- | --- |
| `mid-route.json` | Hold right + hold fire + tap jump every ~800ms — a heuristic that leans on the game's forgiving ledge/wall-jump catch instead of solving exact timing | **completed**, idle fraction **0%**, crush margin 35.44 tiles, protoScore **70.2** |
| `dare-pocket.json` | Commits into the dare pocket, retreats within the wager window, then resumes the hop policy | **not-completed**, idle fraction **43%**, crush margin 28.13 tiles, protoScore **65.1** |
| `idle-greedy.json` | Zero key events for 8s (`&enemies=0` to isolate the signal from ambient wasp combat) | **stalled**, idle fraction **95.8%**, crush margin **12.3 tiles**, protoScore **−63.6** |
| `retry-recovery.json` | Holds right only; dies once (`enemies=0`), proves the F7 fix still holds under `--deterministic` | **died**, 1 retry detected, `vx` 0 → 10.8 tiles/s within 75ms of the retry |
| `policy-pinned-jump.json` | Holds right, **zero timed jumps** — the only jump input is `{when: "pinned", do: {tap: "jump"}}` | **not-completed** (reaches the dare pocket, grabs the reward, jams at the dead-end wall — see "Closed-loop policy mode" above), 13 reactive jumps fired across the whole route |
| `policy-hound-reactive.json` | Closed-loop rebuild of `hound-jump.json` — zero timed jumps, `pinned` + `houndTell` only, `?hound=1` | **not-completed** (2.4s window by design, mirroring the script it replaces); correctly dodged-attempted on the *second* of three hounds' `tell`, not a fixed clock — see above for the hp-drop caveat |

The idle fraction / crush-margin / protoScore lockstep finding from the
first pass (before CP1's pace fixes) still holds in shape here — idle
fraction and protoScore both move in the same direction across the three
non-reactive policies, confirming the pursuit-pressure diagnosis in
`docs/FLEET-PLAN.md` remains legible under the new tuning. Absolute numbers
moved because the game did (crush margins are markedly larger post-CP1) —
treat each as "about this, given the tuning at commit time," not as a fixed
target.

Reproduce any of them:

```sh
node run.mjs scripts/mid-route.json --out /tmp/check --deterministic
node run.mjs scripts/dare-pocket.json --out /tmp/check --deterministic
node run.mjs scripts/idle-greedy.json --out /tmp/check --deterministic
node run.mjs scripts/retry-recovery.json --out /tmp/check --deterministic   # F7 regression proof
node run.mjs scripts/policy-pinned-jump.json --out /tmp/check               # closed-loop proof
node run.mjs scripts/policy-hound-reactive.json --out /tmp/check --max-runtime-ms 15000
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
   import — nothing checks it against `index.html` (though the adversarial
   report independently diffed it byte-for-byte against the live fixture and
   found no drift yet), so it can silently go stale if fixture geometry
   changes (flagged in the file's header comment).
4. **Sampling is polled (~75ms), not event-driven.** A single fast frame at
   the true instantaneous minimum/maximum can be missed by a sample or two —
   e.g. the harness's tracked `minEdgeMargin` and the game's own end-of-run
   overlay figure can differ by a small amount for exactly this reason, not
   a bug. The same applies to retry detection (see "Fixed: zombie attempts"
   above): recovery is bounded by the polling interval, not instantaneous.
5. **This harness's first pass missed the `?testapi=1` hook entirely** and
   built a DOM/HUD-text-only fallback assuming no such channel existed. That
   fallback is still there (and still the least-bad option if both `testapi`
   and `window.HB` are ever unavailable), but the initial round of demo
   reports and this README's original "degraded DOM mode" framing were
   written before the hook was found. Worth remembering when trusting any
   analysis this harness (or any tool) produces about its own environment:
   verify the assumption that a capability doesn't exist before designing
   around its absence. The zombie-attempts defect (F7) and the missing
   `airJumps` field (S4) were both caught by the adversarial agent playing
   actual scripts through this harness, not by this harness auditing itself
   — external, adversarial verification found real defects that internal
   testing during the first two passes did not.
6. **Every report before F7's fix should be treated as suspect past a
   run's first death.** The three original demo reports (`mid-route`,
   `dare-pocket`, `idle-greedy`) never died within their scripted windows, so
   they were never actually affected by F7 — but any other harness output
   generated before this fix, from any script that died and kept running,
   measured a zombie attempt for everything after the first retry.
7. **`houndTell`/`houndCharge` (and any future hostile-state predicate) need
   `window.HB`, not `testapi`.** `?testapi=1`'s snapshot doesn't carry
   `hostiles` at all as of this writing; the sampler enriches every sample
   with `window.HB.snapshot()`'s `hostiles` array regardless of which
   channel is primary (window.HB is unconditional, so this works today) —
   but if a future build ever removed `window.HB` while keeping `testapi`,
   these predicates would silently always evaluate false rather than error.
   Worth a real hook request (below) rather than relying on this fallback
   indefinitely.
8. **Deterministic mode fixes one jitter source, not all of them** — see
   "Deterministic injection mode" above. The `t2-transform-seam-rush`
   quantification is the concrete example: don't assume `--deterministic`
   makes a script fully reproducible just because it removes dispatch
   jitter as a variable.
9. **Resource contention between stacked headless Chrome launches is real.**
   Running many `run.mjs` invocations back-to-back in one session (as this
   pass's quantification did — 18 runs total) produced one transient
   `bootError` (game didn't reach a rendered frame within 8s) that a
   simple retry resolved. Not a bug in the harness's logic, but worth
   spacing out heavy batch runs or increasing the boot timeout if it
   recurs — see "Known limitations" below.

## Hook requests for the game/module-split side

1. ~~Add `sliceStats.airJumps` to the `?testapi=1` snapshot~~ — **done**
   (the module split's `src/main.js` publishes it; this harness just needed
   to stop dropping it, fixed above).
2. **Add `hostiles` (with `state`/`dir`) to the `?testapi=1` snapshot**,
   matching what `HB.snapshot()` already carries — closes the gap in
   limitation #7 above and removes this harness's only remaining dependency
   on `window.HB` specifically rather than either channel.
3. **Land `HB.score.events`/`HB.score.snapshot()`** per A.5, once the CHARGE
   system exists, so `computeAirborneKills`/the `links` proxy in
   `lib/metrics.mjs` can be replaced with the real event-derived counts
   instead of the kills+grounded / route-matcher approximations described
   above.
4. **A fixed-timestep (or seeded-`dt`) simulation mode**, at least for
   `?slice=transform` — see "Deterministic injection mode" above. This is
   the one thing deterministic *input* injection cannot fix on its own;
   flagging it as a hook request rather than attempting to build around it
   from the harness side, per this task's own guidance.
5. The module split has landed `src/pure/traversal.js` — `lib/fixture.mjs`'s
   hand-copied snapshot can now be replaced with a real import (not done in
   this pass; scoped out to stay focused on the requested capabilities). The
   adversarial report already diffed the two byte-for-byte and found no
   drift, so this is a safe, low-risk cleanup whenever someone picks it up.
6. `window.HB` now exists (unconditional, richer than `testapi`) — no
   longer a hook request, just confirmed working via `HB.snapshot()`.
7. **In flight, noted for context (not this harness's ask):** the
   `g1-limbturn` agent is adding ritual state + seal position
   (`transformSealX`) to the `?testapi=1`/`HB` snapshot's `transform` object
   in parallel with this pass. This harness didn't wait for it — the
   `transform` field is already passed through verbatim in `lib/sampler.mjs`
   (see "additive telemetry fields" comment there), and the policy condition
   grammar now supports dotted paths and string equality
   (`"transform.eventState=='turning'"`) specifically so that hook lands
   into an already-capable consumer, not one that needs a follow-up change.

## Known limitations (engineering, not measurement)

- No retry/backoff around browser launch or page navigation failures beyond
  the boot-readiness timeout (8s) reported as `meta.bootError` — see
  limitation #9 above for a concrete instance (stacked headless launches).
- The static server has no directory index handling beyond `/` →
  `index.html`; fine for this repo's flat layout, not general-purpose.
- Video recording (`--video`) uses Playwright's built-in per-context
  recorder — reliable, but adds real wall-clock overhead to context
  teardown; left off by default.
- No parallel-run support (one browser per `run.mjs` invocation); running
  multiple scripts concurrently means invoking `run.mjs` multiple times,
  each getting its own ephemeral static-server port.
- Policy `tap` actions can release early under rapid same-code
  re-triggering — see "Closed-loop policy mode" above; not engineered
  around on purpose.

## Files

```
tools/playtest/
  package.json          playwright-core, dev-only, no runtime impact
  run.mjs                CLI entry point
  lib/
    server.mjs           static file server for the repo root
    compile.mjs           moves/events -> flat time-sorted event list; exports resolveCode (shared with policy.mjs)
    policy.mjs             closed-loop rules: condition grammar, tap/hold actions
    driver.mjs            browser launch, input replay (wall-clock or deterministic), policy tick, sampling loop
    sampler.mjs            in-page probe (testapi / window.HB / DOM fallback)
    metrics.mjs            trace -> report metrics, incl. A.5 alignment
    fixture.mjs             hardcoded TRAVERSAL_FIXTURE route-graph snapshot
    report.mjs              report.json + summary.md writer
  scripts/                 example input scripts (incl. retry-recovery.json (F7 proof),
                            policy-pinned-jump.json / policy-hound-reactive.json (closed-loop proof))
  reports/demo/             committed demo run output (json/md only)
  runs/                     default ad-hoc output dir (gitignored)
```

## Single best next action

Pick up the `t2-transform-seam-rush` residual-divergence finding from
"Deterministic injection mode" above: file (or build, if it's cheap and
someone owns `sim/time.js`) the fixed-timestep/seeded-`dt` hook request, then
re-run the 5×/5× quantification. That would tell us whether the ~6.5-second
first-death-time fork is really `dt`-driven or something else entirely — the
one open question this pass could characterize precisely but not close.

Secondary, lower-cost: replace `lib/fixture.mjs`'s hand-copied
`TRAVERSAL_FIXTURE` snapshot with a real `import` from `src/pure/traversal.js`
— the last documented staleness risk in this harness's own code, and the
adversarial report already confirmed there's currently zero drift to
reconcile, so it's a safe, mechanical change whenever picked up.
