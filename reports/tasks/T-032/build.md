# T-032 — durability: a 9-year-old never meets a blank screen

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-032`,
branch `task/T-032`. No difficulty was touched; no movement constant moved.

## What changed

**`index.html` — the failsafe bootstrap (new).** An inline classic script in
`<head>`, before the import map, that imports nothing. It owns the panel, its
words and its watchdogs. This is the load-bearing decision: the incident that
motivated the task was a module that would not parse, so `src/main.js` never
executed — a panel drawn by `main.js` cannot report that `main.js` never ran.
It installs capture-phase `error` and `unhandledrejection` handlers, a
10 s boot watchdog, and a 1 s-tick freeze watchdog that reads the frame
loop's heartbeat. Panel markup is static in the body (a boot failure has
nobody left to build it) and every player-facing line carries `.fail-plain`.

**`src/pure/failsafe.js` (new).** The deterministic policy: a fault-streak
state machine (`faultStep`) and a plain-language rule
(`plainLanguageIssues`). No clock of its own — the caller passes the time in,
so the same fault sequence always produces the same decisions and pathcheck
drives it directly. Escalation is slow in frames and fast in seconds: one bad
frame is a blip, 500 ms of continuous breakage buys a restart, a second
500 ms buys another, and after that the panel goes up — under 2 s from the
first broken frame to a readable screen.

**`src/ui/failsafe.js` (new).** The half that needs a running game: the
heartbeat, the policy applied to frame faults and to post-boot uncaught
errors, the one repair the game can make on its own (`resetGame` through a
host hook), the lost-surface path, and the read surfaces `?selftest=1` and
`window.HB.failsafe()` use.

**`src/main.js`.** The frame loop now checks the halt flag first, requests
the next frame before any work, beats the heartbeat, and catches the step and
the draw separately (a simulation fault still paints the frame it broke on).
`failsafeBooted()` is the last statement in the file. A `webglcontextlost`
listener fails legibly. Six new `?selftest=1` checks paint the real panel and
gate the words that *rendered*. **The dt clamp was already there and was not
touched** — `Math.min(50, t - last)`; it is now also asserted against the
policy constant.

**`tools/pathcheck.mjs`.** A T-032 section: the fault policy driven as
arithmetic, the panel text held to the readability rule, the bootstrap's
integrity (it parses, it imports nothing, it is installed before the game
module, its watchdog numbers equal the policy's), and the shape of the frame
loop.

**`tools/durability/` (new, dev-only).** `abuse.mjs` + README. Twelve
scenarios, real Chrome through playwright-core, ports 8747/8748.

## Which failure classes the panel does and does not catch

Honest list, because this is the part that is easy to overclaim.

**Caught, and proven by a scenario:**

- a module in the graph that fails to parse or fails to load (the 2026-08-02
  incident) — the boot panel, with the file, line and message behind the fold;
- any uncaught error or rejected promise before boot completes;
- a storm of uncaught errors after boot;
- an exception thrown inside `update()` or the draw, every frame;
- the frame loop silently ceasing to be scheduled while the page is visible
  (freeze watchdog);
- a lost WebGL context — nothing thrown, loop still beating;
- a boot that never finishes (10 s watchdog, a soft "still loading" panel
  that removes itself if the game does come up).

**Not caught, by construction:**

- **the page never arriving at all** (server down, no network) — the browser
  shows its own error page and no script of ours runs;
- **the inline bootstrap failing to parse.** Nothing can report that. It is
  gated instead: pathcheck compiles the extracted block with `new Function`
  and fails if it does not parse;
- **a game that keeps running while quietly doing the wrong thing** — RIG
  stuck in geometry, a wave that never spawns, a soft-lock with a live loop.
  Nothing throws, the heartbeat keeps beating, no watchdog fires. This is a
  playtest question, and the biggest remaining hole in "durable to play";
- **a cross-origin script error** (three.js from the CDN) still produces a
  panel, but the detail behind the fold will be the browser's sanitised
  `Script error.` with no file or line;
- **a resource that is not a script** failing to load is noted but never
  panels — a missing picture is not a dead game;
- **anything after the panel is up.** The loop stands down deliberately; the
  only way back is a reload, which today costs the run (T-033's save/continue
  is the thing that would make that cheap).

## Verification — every command and its result

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **1775 passed, 0 failed** (branch point: 1704 — the new T-032 section adds 71 executed assertions from 46 call sites) |
| `index.html?selftest=1` | **SELFTEST PASS (35 checks)** |
| `index.html?selftest=1&shell=title` | **SELFTEST PASS (35 checks)** |
| `index.html?selftest=1&slice=traversal` | **SELFTEST PASS (37 checks)** |
| `index.html?selftest=1&g2=1` | **SELFTEST PASS (36 checks)** |
| `node tools/durability/abuse.mjs` | **12 passed, 0 failed, 0 skipped** |
| `playtest mid-route --deterministic` | completed, 0 deaths (base tree: completed, 0 deaths) |
| `playtest six-face-full-run --deterministic` | died, 1 death, 33 tap fires (base tree: died, 1 death, 33 tap fires) |
| `playtest transform-slice --deterministic` | completed, 0 deaths |

Smoke scripts were run against this worktree served on 8747 and against a
pristine `git archive` of the branch point on 8749; outcomes, deaths and the
life lost at x≈31.6 are identical, so the frame-loop change is behaviour
-neutral. Ports 8741/8742 were never bound; all dev servers were killed after.

**Abuse scenario results** (`artifacts/t032-durability/`, `--json` available):

- `boot` — booted, panel down, 181 frames, nothing thrown.
- `broken-import` — panel up, "The game could not start.", operator detail
  `Uncaught SyntaxError: Unexpected identifier 'is'
  (…/src/pure/path.js:106:6)`. Screenshots `boot-failure.png` and
  `boot-failure-detail.png` committed.
- `background` — 60.0 s hidden with a key held: **2 frames painted, the
  simulation advanced 59.3 ms** (one clamped step is 50 ms), RIG moved 0.191
  tiles, the held key was released, no panel while hidden or after, state
  `PLAYING`.
- `frozen-watchdog` — loop unscheduled with nothing thrown: panel up, "The
  game got stuck." (`frozen-loop.png`).
- `resize` — 40 sizes down to 320×200: no throw, finite position and edges.
- `pause-transitions` — title handoff paused and resumed; P during a fixture
  retry left the run `PLAYING`; 100 toggles ended `PLAYING` with 0 faults;
  paused at the corner **gate** with the clock advancing 0.0 ms across 5 s of
  pause, resumed cleanly.
- `restart-spam` — 60 restarts: `PLAYING`, position finite.
- `key-mash` — 1000 random key events: `PLAYING`, 0 faults.
- `stray-error` — 4 blips over 5 s: **no panel**, run continues, 0 restarts.
- `error-storm` — panel up reading "The game stopped." after 2 restarts.
- `frame-crash` — throwing accessor on the live player row: panel up, loop
  stood down (heartbeat frozen), `mid-run-failure.png`.
- `context-lost` — panel up reading "The game got stuck."

**The new assertions were mutation-tested** (each mutation applied, pathcheck
run, tree restored):

| mutation | caught by |
| --- | --- |
| inline watchdog `bootMs` 10000 → 9000 | "the inline watchdog numbers are the policy's" |
| panel line → "A fatal runtime error occurred." | "player-facing line reads plainly" (3 jargon hits) |
| delete the halt check from `frame()` | "the halt check is the FIRST thing the loop does" |
| dt clamp 50 → 120 | the T-032 clamp assertion plus 6 pre-existing tunneling assertions |

## Acceptance boxes

- [x] boot failure renders a legible panel naming what broke and offering a
      reload — verified by breaking an import; screenshots committed.
- [x] a mid-run uncaught error does not silently freeze the game — it
      restarts up to twice, then fails legibly; `frame-crash`, `error-storm`,
      `frozen-watchdog` and `context-lost` all end in a panel, never a still
      canvas.
- [x] 60 s backgrounded, no catch-up: **59.3 ms of simulation across 60 s of
      wall clock**; the clamp is asserted in pathcheck against the policy
      constant and against tile-crossing.
- [x] resize / pause / restart-spam driven headlessly with console and page
      errors reported. **Partial**: the pause was taken at the corner gate,
      the title handoff, a fixture retry and 100 toggles — *not* inside the
      1100 ms yaw ritual (see below).
- [x] pathcheck assertions for the new pure logic; no movement constant moved.

## Where I fell short, precisely

**Pausing inside the 1100 ms corner turn was not driven headlessly.** The
turn only starts when its gate wave dies, and this harness's policy is
deliberately stupid (hold right, auto-fire, hop). Measured over four 90 s
runs it reaches the gate every time and never clears it. An in-page watcher
stays armed to press P on the first frame of a turn if the wave ever does
die. Static reading says the pause is safe there (`update()` returns early,
`gameMs` freezes, the ritual timeline is a pure function of `gameMs`, the
draw path does not touch the ritual), and the gate-phase pause proves the
scroll-halted half — but that is reasoning plus a partial test, not the test
the box asks for. **Suggested follow-up for the playtester**, who has the
real bot policy: pause inside a corner turn and inside a transform ritual.

**The `background` scenario reproduces the browser's behaviour rather than
being the browser.** Measured: headless Chrome keeps every tab visible (a
second tab in front left the game's page at `visibilityState: 'visible'`,
still painting ~120 fps), `Page.setWebLifecycleState('frozen')` was accepted
and changed nothing (7200 frames across a 60 s "suspension"), and
`Emulation.setPageVisibilityOverride` is gone from the protocol. So the
scenario performs the same sequence in-page: visibility flips to hidden,
`visibilitychange` fires, rAF stops being serviced for the minute, and the
frame that lands on return carries a timestamp a minute later. Someone should
still alt-tab a real laptop once.

**One thing I noticed and did not fix:** every page load logs a 404 in the
console (no favicon). Harmless, but it is noise inside any screenshot the
operator's son sends back, and one `<link rel="icon">` would remove it. Left
alone as out of scope for this task — flagging it for T-034's bundle work.

## Open questions for the operator (feel — I do not judge these)

1. **The words.** Panel reads: *"The game stopped. / Something inside it
   broke while you were playing. It is not your fault. / [Play again] / Press
   R, or click the button, to play again. / If this keeps happening, show
   this screen to a grown-up."* Is that the right voice for Fox, or too
   careful? Screenshots: `artifacts/t032-durability/mid-run-failure.png`,
   `boot-failure.png`.
2. **Losing the run.** A panel means a reload, which costs the current run.
   Is that acceptable until T-033's save/continue lands, or should a mid-run
   crash try harder to keep him where he was?
3. **The 10 s "Still loading." panel.** On a slow connection the CDN fetch of
   three.js can take a while; 10 s is my guess at "long enough that a child
   thinks it is broken". Too eager, or not eager enough?
4. **Two restarts before giving up.** A permanently broken frame restarts his
   run twice (about a second and a half) before the panel. Would you rather
   it never restart silently — panel immediately — so he always knows why the
   run ended?
5. **A lost drawing surface ends the run.** A GPU reset shows the panel
   instead of trying to rebuild in place. Cheap to reverse if you would
   rather it attempted a recovery first.

## URLs to look at

- `node tools/serve.mjs` then `http://127.0.0.1:8741/index.html` — unchanged
  play; the panel should never appear.
- The failure panel, without breaking anything:
  `http://127.0.0.1:8741/index.html` then in the console
  `__HB_FAILSAFE.show('crash', 'pretend failure')` (`__HB_FAILSAFE.hide()`
  puts it away).
