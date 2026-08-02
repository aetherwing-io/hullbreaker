# T-027 build report — four harness defects (I-011, I-018, I-023, I-028)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-027`,
branch `task/T-027`. **No `src/` file is touched** — `git diff` against the
branch point shows zero changes under `src/` or `index.html`. Server port used:
**8763** (8741/8742 untouched), killed at the end of the session.

## What changed and why

### (a) I-018 — a `t>0` script against `?shell=title` dispatched nothing, quietly

Two changes, because the issue has two halves.

1. **`tools/playtest/lib/driver.mjs`** — while (and only while) the game is
   parked at the shell title (`sample.state === 'MENU'`), deterministic events
   dispatch on the **wall clock**. That state holds a built-but-frozen run with
   `gameMs` pinned at 0, and the key that would start it was itself gated on
   that clock: the wait could never end. Every other frozen-clock state
   (`PAUSED`, the retry freeze, `GAME_OVER`) keeps the old waiting behaviour on
   purpose. Those events carry `dispatchedVia: "wallclock-title"` and are
   counted on the console, so no report claims sim-time quantization it did not
   have.
2. **`tools/playtest/lib/deterministic.mjs` (new) + `run.mjs`** — every
   deterministic run now writes a dispatch ledger
   (`meta.deterministicDispatch`, plus a `summary.md` section) and exits
   **non-zero with a named reason** when the run cannot have measured
   anything: no clock in any sample, a clock that never advanced, or a clock
   that never reached the first event. Events left pending after a
   `victory`/`game-over`/`max-runtime-ms` stop are `pendingExpected` and stay
   off the console; a run that played its **full** script window and still
   starved events warns. `meta.stopReason` is new and records which.

   **Correction to the issue as filed:** on this tree the old repro already
   exited **1**, not 0 — but with the wrong reason ("sample.gameMs was never a
   number (needs testapi or window.HB)") on a run whose fidelity was `testapi`
   and whose `gameMs` was a perfectly good `0`. I did not reproduce a green
   zero-event run; I reproduced a zero-event run that blamed the wrong thing.
   The evidence report `runs/gate-T-013-title-det-probe/report.json` confirms
   the zero-dispatch half (`events 2, dispatched 0`), so the defect is real;
   the "exit 0" line in I-018 does not reproduce here.

The verdict logic is a pure function of `(result, events)` — no page, no I/O —
so `tools/pathcheck.mjs` asserts all five verdicts on synthetic runs rather
than trusting them. The browser half is a committed script,
`scripts/title-shell-deterministic.json`.

### (b) I-011 — a tap in flight at teardown poisoned `pageErrors`

**`lib/driver.mjs`**: pending tap-release timers are tracked, then at teardown
cancelled and released **while the page is still open** (logged as
`tap-up-teardown`, never a plain `tap-up`, so no report reads as though the tap
ran its full `holdMs`; `tapsSettledAtTeardown` counts them). Anything that
still loses the race is bucketed into a new `teardownErrors` array with its own
`summary.md` section, labelled *not* a game error. `pageErrors` now means the
game threw, and only that.

### (c) I-023 — `x==3+1` compiled and read false forever

**`lib/policy.mjs`**: an **unquoted** comparison value must be a number or a
plain word (`turning`, `dive`, `GAME_OVER`); anything else throws at compile
time with a message naming the problem. Quoting stays the escape hatch —
`=='3+1'` still compiles, because that is an author saying out loud they mean a
string. Nothing is or ever was evaluated as JS. The README claim I-023 flagged
("the compiler rejects … arithmetic") is now true rather than true-only-behind-
ordering-operators, and says so explicitly.

### (d) I-028 — the crush window's rule cancelled by personal space

**`scripts/six-face-spaced-run.json`**: rule 6's guard raised from
`edgeMargin>6` to `edgeMargin>8`, so the crush-plane emergency
(`edgeMargin<8 → hold right`) owns its whole window. Measurement below.

Two supporting harness changes, both in `analyze-run.mjs`:
- the rule-conflict census now names **which two rules** cancelled, for how
  many ticks, in what `edgeMargin` window;
- `--policy <script.json>` replays a different rule set over a recorded trace,
  which is how the before/after below was taken on the *same* trace.

## The I-028 measurement, before and after, on the same traces

`node analyze-run.mjs <run>/report.json --policy <script>`, over the three
committed T-019 traces in the main checkout
(`tools/playtest/runs/gate-T-019-spaced-{1,2,3}`; read-only, nothing written
there). Before = the pre-change file from `git show HEAD:…`, after = the
edited file. **Self-check first:** replaying the *unchanged* file reproduces
the report's embedded-policy numbers exactly (5.3 %, 3 ticks, margin
7.37–7.70), so the deltas below are the guard change and nothing else.

| trace | PLAYING ticks | crush [5] × personal-space [6], before | after | all-cause cancellation before → after |
| --- | --- | --- | --- | --- |
| gate-T-019-spaced-1 | 777 | **3 ticks**, edgeMargin 7.37–7.70 | **0** | 5.3 % → 4.9 % |
| gate-T-019-spaced-2 | 717 | 0 | 0 | 4.5 % → 4.5 % |
| gate-T-019-spaced-3 | 501 | **19 ticks**, edgeMargin 6.41–7.94 | **0** | 8.4 % → 4.8 % |

Trace 1 reproduces I-028's own numbers independently (3 of 777, min margin
7.37). Trace 3 shows the defect was ~6× larger there than in the sampled run.

**Not fixed, and measured: the crush window still cancels from a different
pair.** The two gate-servo `hold left` clauses (rules 2 and 4) carry no margin
guard at all, so they still fire below 8 tiles: 1 + 1 ticks on trace 1 (margins
7.51 and 7.87) and 7 ticks on trace 3 (6.95–7.75). That is the same *class* of
defect as I-028 in the same window, on rules the task did not name; closing it
means putting `edgeMargin>8` on the two gate-servo left-holds, which changes
the gate-fight positioning policy T-019 measured, so I left it and filed it
below rather than retuning quietly.

**Honesty note on the replay:** it answers "what would these rules have
commanded at the states that run visited", not "where would this policy have
gone" — two policies diverge into different runs from the first tick they
differ. It is a before/after on one trace, not a forecast. Same wording is in
the README and the tool's header.

**The script's timing band is NOT re-measured.** T-019's 50.2–55.1 s (9 runs)
was taken with `edgeMargin>6`. I smoke-ran the changed file twice: **42.1 s /
55.8 s**, scroll 111 / 140, 7 / 10 kills, both ending at `GAME_OVER`. Two runs
against a nine-run band with ±6 s spread settles nothing, and I have said so in
the script description, the README table row and the T-019 section instead of
inheriting the old numbers.

## Verification — every command and its result

All browser runs: `--base-url http://127.0.0.1:8763` against this worktree
served by `node tools/serve.mjs 8763 --quiet`.

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **1691 passed, 0 failed** (was 1674 on the branch point) |
| negative control: revert the guard to `edgeMargin>6`, re-run pathcheck | **1689 passed, 1 failed** — the new six-face assertion has teeth; guard restored, green again |
| (a) `node run.mjs scripts/title-shell-deterministic.json --deterministic --max-runtime-ms 9000` | **exit 0**, 4/4 events dispatched, 1 via `wallclock-title`, sim clock +7219 ms, RIG x 6 → 55.65. Before the fix, same script: 0/4 dispatched, `MENU` in every sample, exit 1 with the wrong reason |
| (a) unit verdicts (`lib/deterministic.mjs`, synthetic runs) | no-clock → fatal; frozen clock → fatal naming `MENU×2`; clock ran but never reached t → fatal; healthy run → silent; victory with unspent tail → `pendingExpected`, silent; full window with starved tail → warning. All six asserted in pathcheck |
| (b) `node run.mjs scripts/tap-teardown-probe.json --deterministic --max-runtime-ms 6000` | BEFORE: `pageErrors: ["key up failed for Space: keyboard.up: Target page, context or browser has been closed"]` — **2 of 2 runs**. AFTER: `pageErrors []`, `teardownErrors []`, `tapsSettledAtTeardown` 4–7, taps logged `tap-up-teardown` — **3 of 3 runs** |
| (c) `node -e "…compileCondition('x==3+1').evaluate({x:4},…)"` | BEFORE: compiles, `{result:false,missingFields:[]}`, no warning. AFTER: **throws at compile** with a message naming the unquoted value. `=='3+1'`, `==wasp`, `=='turning'`, `==-3.5`, `==GAME_OVER` all still compile |
| (d) `node analyze-run.mjs <gate-T-019-spaced-{1,2,3}> [--policy …]` | table above |
| smoke: `mid-route.json --deterministic` | **completed** (matches the demo table), 0 page errors, stopReason `victory` |
| smoke: `retry-recovery.json --deterministic --max-runtime-ms 20000` | **died** with 1 retry re-assertion at 18.16 s (`ArrowRight`) — the F7 fix still holds through the teardown change |
| smoke: `policy-pinned-jump.json` | **not-completed**, **13** reactive jumps — the exact number the README documents |
| smoke: `transform-slice.json --max-runtime-ms 20000` | **outcome varies run to run on both harness versions.** 7 alternating pairs against a `git archive HEAD` copy of the pre-change harness: control 4 completed / 3 died, changed 3 completed / 4 died, `maxX` clustered 143.4–146.0 in both. This is the documented transform-slice non-determinism, not a regression — the changed harness's only behavioural differences on a no-policy wall-clock run are bookkeeping |
| smoke: `six-face-spaced-run.json --deterministic --stop-on-game-over --max-runtime-ms 145000` ×2 | exit 0, 42.1 s / 55.8 s, 0 page errors, 0 teardown errors |

## Open questions for the operator (I do not judge fun)

1. Nothing in this task touches gameplay, so there is no feel verdict to ask
   for. The one judgement call worth flagging is a **process** one, not a fun
   one: the six-face policy's published survival band is now attached to a file
   that has changed. I annotated rather than re-measured (9 runs ≈ 8 minutes of
   wall clock). If the fleet wants the band to stay authoritative, someone
   should re-run the nine.

## Follow-ups I did not do

- **The crush window still cancels via rules 2 and 4** (measured above: 1, 0
  and 7 ticks on the three traces). One-line fix per rule (`&& edgeMargin>8`),
  deliberately not taken because it changes the gate-fight servo T-019
  measured. Worth an Inbox issue.
- **`--policy` replay is single-trace evidence.** If a lane wants to price a
  rule change properly, the honest shape is replay-then-rerun, not replay
  alone.

## Files

- `tools/playtest/lib/deterministic.mjs` (new)
- `tools/playtest/lib/driver.mjs`, `run.mjs`, `lib/policy.mjs`, `lib/report.mjs`
- `tools/playtest/analyze-run.mjs`
- `tools/playtest/scripts/six-face-spaced-run.json` (guard + honesty note)
- `tools/playtest/scripts/title-shell-deterministic.json`,
  `scripts/tap-teardown-probe.json` (new regression probes)
- `tools/playtest/README.md` (deterministic contract, grammar guard, teardown
  bucketing, `--policy`, three new honesty items)
- `tools/pathcheck.mjs` (grammar guards, the deterministic verdicts, the
  crush-window invariant)
