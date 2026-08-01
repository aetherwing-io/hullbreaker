PASS

T-013 (game shell: start screen, pause/options, death/restart, run stats) —
playtest gate, `task/T-013 d3c8d28`, worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-013`.

The gate's central risk was named in the assignment: **a shell that eats input
would silently break every future gate.** It does not. Every committed script
run against the pinned worktree behaves as it does on main, the shell never
appears in an automated session, and the one input path that *does* cross the
shell (the keypress that leaves the title screen) falls through into gameplay —
measured, not assumed.

## How it was pinned

```sh
# under test — the T-013 worktree, served, never a moving tree:
(cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-013 && python3 -m http.server 8805)

# control — merge-base of task/T-013 and main (cb321a6), detached worktree, served:
git worktree add --detach <scratch>/pin-base cb321a6
(cd <scratch>/pin-base && python3 -m http.server 8806)
```

The control is the **merge-base**, not `main`'s head, on purpose: `task/T-013`
branched at `cb321a6` and main has since taken T-006/T-008/T-010/T-011/T-016
merges the branch does not carry, so a diff against main's head would mix the
shell's effect with five other lanes'. Merge-base isolates T-013's own 18-file
diff. Main's committed demo baselines are compared separately below.

All runs used the **main checkout's** harness
(`/Users/scottmeyer/projects/hullbreaker/tools/playtest`) with `--base-url`.

## Required gate runs (both exit 0, both `"result": "completed"`)

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8805 --out runs/gate-T-013-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8805 --out runs/gate-T-013-transform
```

| run | result | attempts / falls | idle | minEdgeMargin | protoScore | bootError / pageErrors / consoleErrors |
| --- | --- | --- | --- | --- | --- | --- |
| `gate-T-013-mid` | completed | 1 / 0 | 0.024 | 35.41 | 85.4 (proxy) | null / 0 / 0 |
| `gate-T-013-transform` | completed | 1 / 0 | 0 | 30.13 | 290 (proxy) | null / 0 / 0 |

No retry was needed — no `bootError` occurred in any of the 16 runs below.

## Critical regression surface: the shell does not eat input

**(a) Full committed demo set, T-013 vs merge-base control, same harness, same flags.**

```sh
node run.mjs scripts/mid-route.json        --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:{8805,8806} --out runs/gate-T-013-{,CTRL-}mid
node run.mjs scripts/transform-slice.json  --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:{8805,8806} --out runs/gate-T-013-{,CTRL-}transform
node run.mjs scripts/polyp-lane-dodge.json --deterministic --max-runtime-ms 18000 --base-url http://127.0.0.1:{8805,8806} --out runs/gate-T-013-{,CTRL-}polyp
node run.mjs scripts/retry-recovery.json   --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:{8805,8806} --out runs/gate-T-013-{,CTRL-}retry
```

Structural outcomes are **identical on all four scripts**: same `result`, same
attempts, same falls, same kills, same hits, same lives spent, same dare-pocket
columns, same route coverage, same final x to ~0.1 tile. The three completing
scripts reached the same terminal x (mid 72.08 / 72.00, polyp 72.04 / 72.01,
transform 146.09 / 146.01).

**First-input latency — the metric that would expose a swallowed key** — is
unchanged: first sample with `|vx| > 0.5` lands at `gameMs` 124 (T-013) vs 119
(control) on mid-route, 113 vs 123 on transform, 121 vs 132 on polyp. A shell
eating the opening `ArrowRight` would show as a multi-hundred-ms or permanent
gap here; it shows as sub-sample noise in both directions.

**No sample in any run carried `state: 'MENU'`.** Every automated run traced
`PLAYING` → (`VICTORY`) only, which is the harness contract `src/mode.js`
claims (`?testapi=1` ⇒ `SHELL_AUTOSTART`), verified from the run traces rather
than from the source comment.

**F7 retry recovery still works, to the sample.** `retry-recovery` died and
retried once on both sides: exactly one reassertion, `ArrowRight`, at
tMs 18159 (T-013) vs 18169 (control), `retryDetection.maxLagMs` 75 on both, and
`vx` 0.00 → **10.80** on the very next sample on both. The shell's `keydown`
pre-hook sits in front of `KEYMAP` and does not disturb the re-press path.

**(b) Numeric deltas sit inside the harness's own jitter band.** mid-route was
repeated 3× on T-013 and 2× on the control:

| side | victory `gameMs` | minEdgeMargin | airMs | protoScore | peak air jumps |
| --- | --- | --- | --- | --- | --- |
| T-013 ×3 | 6340 / 5010 / 6352 | 35.41 / 35.43 / 35.44 | 5135 / 4360 / 4982 | 85.4 / 77.3 / 83.6 | 3 / 2 / 3 |
| control ×2 | 6359 / 6827 | 35.44 / 35.46 | 5242 / 5795 | 86.7 / 93.3 | 2 / 2 |

The within-side spread (1342 ms of victory time on the T-013 side alone)
exceeds every cross-side delta, which is exactly what
`tools/playtest/README.md` honesty items 2, 4 and 8 predict for a
`--deterministic` run: the mode removes dispatch jitter, not frame-alignment
jitter. Read these as "unchanged," not as "identical" — the harness cannot
prove identity here and this report does not claim it.

**(c) Against main's committed demo baselines** (`reports/demo/*/report.json`,
same scripts, main's tuning):

| script | source | result | att/falls | edge | routeIds | dare | proto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mid-route | demo baseline (main) | completed | 1/0 | 35.44 | [] | true/false | 70.2 |
| mid-route | control (cb321a6) | completed | 1/0 | 35.44 | [] | true/false | 86.7 |
| mid-route | **T-013** | completed | 1/0 | 35.41 | [] | true/false | 85.4 |
| transform | demo baseline (main) | completed | 1/0 | 30.13 | [mid-catwalk, wall-launch] | true/false | 288.7 |
| transform | control (cb321a6) | completed | 1/0 | 30.16 | [mid-catwalk, wall-launch] | true/false | 284.9 |
| transform | **T-013** | completed | 1/0 | 30.13 | [mid-catwalk, wall-launch] | true/false | 290 |

## Browser self-test through the harness

```sh
node run.mjs <scratch>/selftest.json             --base-url http://127.0.0.1:8805 --out runs/gate-T-013-selftest         # index.html?selftest=1
node run.mjs <scratch>/selftest-shell-title.json --base-url http://127.0.0.1:8805 --out runs/gate-T-013-selftest-title   # index.html?selftest=1&shell=title
node run.mjs <scratch>/selftest.json             --base-url http://127.0.0.1:8806 --out runs/gate-T-013-CTRL-selftest    # control
```

- `?selftest=1` (default six-face run, autostart path): `document.title` reads
  **`SELFTEST PASS (23 checks)`**; trace states `PLAYING` only — never parked on
  a title screen. Control at merge-base: `SELFTEST PASS (14 checks)`. The 9 new
  checks are the shell's own (harness contract, direction resolution, quit-to-
  title, "title consumes no gameplay key", the three DOM composition checks,
  "any key leaves the title into a live run", "leaving the title does not spend
  an attempt").
- `?selftest=1&shell=title` (title forced on top of an automated session):
  **`SELFTEST PASS (23 checks)`**, trace states `MENU|PLAYING` — the self-test
  pushes through the title and leaves the game playing.
- `node tools/pathcheck.mjs` in the worktree: **993 passed, 0 failed**, exit 0.

## The human path (not covered by any committed script)

```sh
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --url "http://127.0.0.1:8805/index.html?slice=traversal&shell=title" --out runs/gate-T-013-mid-fromtitle
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --url "http://127.0.0.1:8805/index.html?slice=traversal&shell=0"     --out runs/gate-T-013-mid-shell0
```

- **From the title screen**, the unmodified `mid-route` script still **completes
  the route** (victory `gameMs` 6349, edge 35.57, states `MENU|PLAYING|VICTORY`),
  with the first movement sample at `gameMs = 8` — i.e. the same `ArrowRight`
  that dismissed the title also drove RIG, at the very start of sim time. This
  is the acceptance claim "enters run on input" measured end-to-end, and it is
  the strongest available evidence that no gameplay key is consumed.
- **`?shell=0`** completes identically (victory `gameMs` 6338, edge 35.42,
  states `PLAYING|VICTORY`), so the documented escape hatch is real.

## Screenshots judged (all at the shipped FAR default view)

- `tools/playtest/runs/gate-T-013-title/screenshot.png` — start screen,
  direction 2/3 "The Ship Wakes" (the shipped default). Against
  `docs/concept-art/05-start-screen-directions.png`'s **middle** panel the
  structure carries: the hinged rust plate on the same top-left→bottom-right
  diagonal, RIG small on the plate with a muzzle flash, teal fog left,
  machinery mass and acid-green glow right, magenta point lights. Palette stays
  inside DESIGN's role set (deep teal / rust-orange / acid-green / magenta /
  warm white). RIG measures as a human-scale figure, not a hero shot —
  `?selftest=1` measures the laid-out element at board 13's 3–5% of frame
  height on all three directions and that check passes.
- `tools/playtest/runs/gate-T-013-pause/screenshot.png` — PAUSED with the
  options panel. The overlay's own `#ovTitle`/`#ovBody` text ("PAUSED" / "p /
  esc to resume") is unchanged, so the harness's DOM scrape is intact; the
  panel is an added sibling. VIEW row confirms **FAR** is the live default.
- `tools/playtest/runs/gate-T-013-transform/screenshot.png` (BREACH CLEAR) and
  `.../gate-T-013-mid/screenshot.png` (TRAVERSAL CLEAR) — run-stats panels.
  Every number cross-checks against the same run's `report.json`: TIME 0:15.6 vs
  victory `gameMs` 15656; TIME 0:06.3 vs 6340; CLOSEST EDGE 30.1 / 35.4 vs
  `minEdgeMargin` 30.13 / 35.41; AIR JUMPS 3 vs peak 3; ATTEMPT 1 vs 1. The
  stats screen is reading the telemetry the game already keeps, as claimed.
- `.claude/worktrees/T-013/artifacts/shell-v1/gameover-stats.png` — SIGNAL LOST
  + stats on the default six-face run (DEATHS 3 derived from lives, which is the
  counter that works outside a fixture).
- `.claude/worktrees/T-013/artifacts/shell-v1/title-crown.png` (and
  `title-climb`, `title-wake`, `title-narrow`) — directions 1 and 3 hold board
  05's left/right panels the same way; the narrow capture shows the media query
  reflowing rather than clipping.
- **Static-anatomy rule (decisions.md entry 3) is respected.** Every animation
  in the shell's CSS is light, vapour or UI: `sl-drift` (steam), `sl-flash`
  (muzzle), `sl-pulse` (the PRESS ANY KEY prompt). No structural element
  translates, scales or assembles; the hull plate is already hinged open when
  the screen appears, exactly as the board draws it. Both keyframes are disabled
  under `prefers-reduced-motion`.
- No glitches, no z-fighting, no missing silhouettes in any frame. In-run
  rendering is untouched: the control's `gate-T-013-CTRL-mid` frame and T-013's
  differ only by the added panel (same terrain, same HUD strings, same EDGE
  readout).

## Defect filed

- **I-018** (S3, bug) — `?shell=title` + `--deterministic` starves event
  dispatch: at the title screen the sim clock is frozen at `gameMs = 0`, and
  deterministic injection is keyed to `gameMs`, so a script whose *first* event
  is at `t > 0` never dispatches at all and the run sits on the title for its
  whole window. Reproduced with `runs/gate-T-013-title-det-probe` (first event
  at `t = 1200`): zero events dispatched, `dispatchJitterMsAvg: null`, no
  `actualDispatchMs` on any event record, `NEVER MOVED`, outcome
  `not-completed`, exit 0. No committed script can hit it (they all autostart
  under `?testapi=1`), which is why it is S3 and not S2 — but it is silent
  enough to burn a future gate that forces the title for a capture.

## Notes for the operator (feel — not judged here)

Bots measure pacing and regressions; they do not judge fun. These go to the
checkpoint queue rather than into the verdict:

1. **Which board-05 direction is canon?** The task's own packet question. The
   shipped default is direction 2, "The Ship Wakes"
   (`http://127.0.0.1:8741/index.html?shell=title`); directions 1 and 3 are one
   keypress away (`1`/`2`/`3`) or `?title=climb|wake|crown`.
2. **The run-stats panel is centred and covers the frozen scene.** Compare
   `runs/gate-T-013-mid/screenshot.png` with `runs/gate-T-013-CTRL-mid/screenshot.png`:
   in the control, RIG is visible at the victory pose; in T-013 the panel sits
   over him. The run is over, so nothing gameplay-critical is hidden — but is
   the "look at what you just did" frame worth preserving (panel offset lower or
   to one side)?
3. **The pause screen says it twice**: the panel's key row reads "P / ESC
   resume" directly above the overlay's own "p / esc to resume" line. Harmless,
   and the overlay text is deliberately frozen for the harness — worth a
   decision on which line should carry it.
4. **Does the title read at a glance?** RIG is deliberately tiny (board 13's
   scale rule) against a large empty left field where the logo sits. Does the
   composition still say "one human on a continent-sized machine," or does the
   figure get lost?

## Honesty / limitations of this report

- The harness ran from the **main checkout** while serving an **older tree**
  (the branch's merge-base is `cb321a6`; main has moved). `lib/fixture.mjs`
  resolves `TRAVERSAL_FIXTURE` from the tree the harness runs in, so route
  coverage and dare-pocket columns are computed against main's fixture for both
  sides (README limitation 3). Both sides share the bias, so the comparison is
  apples-to-apples; the absolute route numbers are not a statement about either
  tree.
- `protoScore` here is the **proxy** form (`source: "proxy"`, no `?score=1` in
  these scripts) — comparable between these runs, not to a real `HB.score` run.
- `--deterministic` does not make a run reproducible (README items 4 and 8);
  the repeat table above is the measured band, and the verdict rests on
  structural outcomes, not on numeric identity.
- The `shell` telemetry block that `src/main.js` now publishes is **not**
  forwarded by `lib/sampler.mjs` (it normalizes a fixed field set), so
  "0 samples carrying `shell`" in these reports is a harness limitation, not
  evidence about the game. The `state` field, which the sampler does carry, is
  what proves no run parked on `MENU`.
- The static server on 8805 died once between runs (a `page.goto`
  `ERR_CONNECTION_REFUSED`, loud, no report written) and was restarted; the
  affected probe was re-run. No completed run in this report was served by a
  dead or mid-swap tree.
