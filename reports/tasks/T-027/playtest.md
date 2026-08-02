PASS

Pinned worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-027`,
branch `task/T-027`, HEAD `a07e9c4`. Served with
`node tools/serve.mjs 8791 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-027 --quiet`
(port 8791 — 8741/8742 untouched, confirmed still owned by the operator's
processes before I started and after I stopped mine). All runs below were
driven with `--base-url http://127.0.0.1:8791` against this pinned tree.
Nothing here is taken on build.md's or review.md's word alone — every claim
was independently re-run, and where a claim depended on comparing against the
pre-fix harness, I built a second tree (`git archive 810d326`) and ran the
same scripts against it, live, rather than reading `git show` and trusting
the diff.

Scope re-check: `git diff main...HEAD --stat` — only `reports/tasks/T-027/
build.md`, `tools/pathcheck.mjs`, `tools/playtest/**`. Zero `src/`, zero
`index.html`. Confirms review's scope finding independently.

## 1. The four fixes, verified empirically — including the loud-failure path

**(a) I-018, wall-clock title dispatch.** Ran `scripts/title-shell-
deterministic.json --deterministic --max-runtime-ms 9000` twice against the
pinned tree: **exit 0 both times**, `meta.deterministicDispatch` = `{events:4,
dispatched:4, viaWallclockTitle:1, fatal:null, warning:null, stopReason:
"script-window"}`. Read the raw event array myself: event 1 (`ArrowRight
keydown`, t=600) carries `dispatchedVia:"wallclock-title"` with no
`actualDispatchGameMs`; the other three carry `dispatchedVia:"gameMs"` with
real sim-clock timestamps. Sim clock reached 7249.9ms.

Negative control, live, not just `git show`: copied the same script into a
`git archive 810d326` tree and ran it against the same served page. Result:
**exit 1**, `[playtest] ERROR: --deterministic requested but no events were
dispatched — sample.gameMs was never a number (needs testapi or window.HB)`.
I then read that run's own trace directly: `fidelity: "testapi"`, `state:
"MENU"`, **`gameMs: 0`** — a real number, not absent. This independently
reproduces review's finding and the build report's own correction: the old
harness already exited non-zero on this shape, but for the *wrong* reason
(blaming a missing clock that was in fact present and simply frozen). The
fix changes what a title-shell run does (dispatch on the wall clock, exit 0,
correct) and would also have changed what a genuinely-clockless run reports
(the message now names the real states visited, not a canned "needs
testapi" line) — both halves are now correct.

**Loud-failure path, independently exercised beyond pathcheck's own
fixtures.** `lib/deterministic.mjs` is a pure function, so I imported it
myself and ran three cases pathcheck.mjs does not: a clock frozen at a
*nonzero* value (12345ms, e.g. `PAUSED`) → fatal, names the state and the
stuck value; a fully empty trace array → fatal, "gameMs was never a number";
an unrecognized `stopReason` ("bootError") with events still pending → correct
**warning**, not fatal, naming the real stop reason. All three matched the
module's contract. I also read `run.mjs` myself to confirm the wiring: `if
(deterministic && deterministic.fatal) { console.error(...); process.exitCode
= 1; }` — a fatal diagnosis reliably becomes a non-zero exit with the full
named reason on stderr; `warning` only logs, never fails the run. A silent
green zero-measurement run is not reachable through this path, and a fatal
exit always carries the real cause, not a placeholder.

**(b) I-011, tap-teardown race.** Ran `scripts/tap-teardown-probe.json
--deterministic --max-runtime-ms 6000` **3 times**: `pageErrors: []`,
`teardownErrors: []`, `tapsSettledAtTeardown` 5/7/7, all logged
`tap-up-teardown` (confirmed in `policyLog`, never a plain `tap-up`).
Negative control against the `810d326` tree with the same script copied in:
**2/2 runs reproduced the exact original defect** — `pageErrors: [{"message":
"key up failed for Space: keyboard.up: Target page, context or browser has
been closed"}]`. Also read `lib/report.mjs`'s output logic directly: page
errors and teardown errors render under two different headers (`## Errors
observed` vs `## Harness teardown notes (NOT game errors)`), and the old
tree's report genuinely used the former for what is now routed to the
latter.

**(c) I-023, grammar guard.** Beyond build.md's own five compile cases, I ran
four more of my own: `x==3*2` and `x==1/2` (other arithmetic operators) both
correctly **throw** at compile with a message naming the exact offending
value; `x==foo.bar` (unquoted dotted value) also throws, same message shape;
all of build.md's originally-cited passing cases (`==wasp`, `=='3+1'`,
`==turning`, `==-3.5`, `==GAME_OVER`) still compile. Then I checked whether
this could regress any *existing* script: `grep -rn '"when"' scripts/*.json |
grep '=='` and a broader `grep -rln '==' scripts/*.json` both return **zero
matches** — no committed script currently uses `==` in a policy condition at
all, so the stricter grammar cannot break anything already in the repo.

**(d) I-028, crush-window guard.** See §2 below — this is the item with the
most riding on it, verified in the most depth.

## 2. The I-028 linchpin — self-check and before/after, independently re-run

Copied the three T-019 traces from the main checkout's (gitignored, but
present on disk) `tools/playtest/runs/gate-T-019-spaced-{1,2,3}/report.json`
and ran `analyze-run.mjs` against them myself, three ways per trace:

1. **No `--policy` flag** (report's own embedded rule set, recorded at
   `edgeMargin>6`): all-cause cancellation **5.3% / 4.5% / 8.4%** of PLAYING
   ticks — matches build.md exactly.
2. **`--policy` pointing at `git show 810d326:…six-face-spaced-run.json`**
   (the unchanged file, fetched fresh, not copy-pasted from any report):
   **byte-identical 5.3% / 4.5% / 8.4%.** This is the self-check the whole
   before/after argument depends on, and it holds — replaying the unchanged
   file through `--policy` reproduces the embedded numbers exactly, so the
   delta below is attributable to the guard change alone.
3. **`--policy` pointing at the current worktree file** (`edgeMargin>8`):
   **4.9% / 4.5% / 4.8%** — matches build.md's claimed after-numbers exactly.

Per-pair census, read directly rather than trusting the top-line percentage:
the specific `[5] edgeMargin<8 (right)` vs `[6] …edgeMargin>6 (left)` pair
cancels **3 ticks (margin 7.37–7.70) / 0 / 19 ticks (margin 6.41–7.94)**
before, and **is absent from the census entirely (0/0/0) on all three traces**
after — the crush rule's window is clean. The stated residual (gate-servo
rules 2 and 4, which name no margin guard and were deliberately left alone)
still shows up unchanged after the guard change: trace 1 has `[5]×[4]`=1 tick
(7.87) and `[5]×[2]`=1 tick (7.51); trace 2 has neither; trace 3 has `[5]×[2]`
=7 ticks (6.95–7.75) — exactly the "1+1 / 0 / 7" build.md reports, and exactly
what I-036 (already filed) tracks. The linchpin holds; the numbers mean what
the report says they mean.

## 3. Six-face run: no degradation, but the published band needs re-running — my own data reinforces that, doesn't contradict it

Confirmed the annotation exists where it should: `git diff 810d326 HEAD --
scripts/six-face-spaced-run.json` shows the script's own `description` field
gained an explicit "CHANGED BY T-027 (I-028) … THE TIMING BAND ABOVE HAS NOT
BEEN RE-MEASURED with this guard … Treat 50.2-55.1 s as the pre-change number
until someone re-runs the nine" paragraph. Present and accurate.

I then ran `six-face-spaced-run.json --deterministic --stop-on-game-over
--max-runtime-ms 145000` **5 times** myself (build.md's own smoke test was 2
runs). All 5: exit 0, `pageErrors: []`, `teardownErrors: []`, `meta.bootError:
null`, dispatch ledger `fatal: null` / `warning: null`, all ended at genuine
`GAME_OVER` (3 lives spent, confirmed via the HUD-parsed `lives.losses[]`
trail in each report, not just the summary line). Survival: **56.2s / 47.7s /
89.3s / 77.9s / 52.5s**; kills **8 / 11 / 21 / 26 / 8**. Two of five runs
(77.9s, 89.3s) land well above the documented pre-change band's max (55.1s),
and the kill counts spread wider (8–26) than the documented 10–16. No run
crashed, errored, or fell below the old band's floor.

Judgment: this is **not evidence of degradation** — nothing broke, and if
anything the guard fix (RIG now actually runs from the crush plane instead of
standing still against it) plausibly *helps* survival in some seeds — but it
is clear evidence the fix changed real gameplay-adjacent behavior enough that
the old 9-run band is stale, exactly as build.md already said. My 5-run
sample independently reinforces "someone should re-run the nine" rather than
settling it; I'm flagging it as corroboration of an already-open
recommendation, not a new defect, so no new Inbox entry for this by itself.

Screenshots (the two longest-surviving runs, 89.3s/21 kills and 77.9s/26
kills GAME_OVER screens) — both clean: readable "SIGNAL LOST" stat panel, no
overlapping/garbled text, silhouettes and palette consistent with the rest of
the six-face run, no anatomy assembling in view, HUD legible. Nothing to flag
visually.

## 4. transform-slice variance — confirmed pre-existing, by code proof, not just by luck of a sample

Read every hunk of the `driver.mjs` diff against its line numbers
(`git diff main...HEAD -- tools/playtest/lib/driver.mjs`, 12 hunks). For a
script like `transform-slice.json` — timed `moves` only, no `policy`, run
**without** `--deterministic` — every touched hunk is either (a) new
bookkeeping fields on the returned object with no control-flow effect, (b)
inside the `state === 'MENU'` branch of `dispatchDueDeterministicEvents`,
which only exists under `--deterministic`, or (c) policy-tap-release
machinery (`pendingTapReleases`, `flushPendingTapReleases`) that is a no-op
when no `tap` was ever fired. There is no code path by which this diff can
change wall-clock, non-policy input timing. That settles the "pre-existing,
not introduced" question structurally, independent of any particular sample.

Empirically, I ran `transform-slice.json --max-runtime-ms 20000` (no
`--deterministic`, matching build.md's own no-policy smoke row) **6 times
fresh against the new harness** and **4 times against a `git archive 810d326`
copy**, same served page both times. My sample: new harness 6/6 **died**; old
harness 2/4 completed, 2/4 died. That skew is worth stating plainly rather
than smoothing over — it does *not* match review's evenly-split 2/2-vs-2/2
sample or build.md's 7-pair sample. But it doesn't contradict the "pre-
existing" conclusion either: the old harness in my own sample also produced
both outcomes (it is not stable), and I ran my six new-harness attempts and
four old-harness attempts in two separate back-to-back batches on the same
machine — exactly the kind of session/load clustering the README's own
"Known limitations" #9 (stacked headless Chrome launches) warns can skew a
batch. Given the structural no-op proof above, I read my batch's skew as
sampling variance under load, not a regression, but flag the specific numbers
so nobody downstream treats "died" as a stable rate for this script on either
harness — it never has been (README honesty item #1: an open-loop timed
script is a naive policy, not a route difficulty measurement).

## 5. Regression

- `node tools/pathcheck.mjs` in the worktree: **1691 passed, 0 failed.**
- Independently rebuilt the branch point (`git archive 810d326` into a clean
  tree) and ran pathcheck there myself: **1674 passed, 0 failed.** +17, all
  additive (matches both reports).
- Negative control, redone myself rather than trusted: reverted rule 6's
  guard back to `edgeMargin>6` in the worktree's own script file and re-ran
  pathcheck: **1690 passed, 1 failed**, naming the T-027 crush-window
  assertion. This is 1690, not build.md's transcription-erred "1689" — matches
  review's correction exactly. File restored afterward; worktree confirmed
  clean (`git status --porcelain` empty) and pathcheck back to 1691/0.
- `?selftest=1` via a scripted Playwright check against the pinned tree:
  **SELFTEST PASS (29 checks)**.
- Smoke set: `mid-route.json --deterministic` → **completed**.
  `transform-slice.json --deterministic` → **completed** (deterministic mode
  removes enough jitter for this one run; see §4 for the non-deterministic
  variance, which is a separate, already-documented limitation).
  `retry-recovery.json --deterministic --max-runtime-ms 20000` → **died**,
  one retry re-assertion at gameMs **18161** for `ArrowRight` — matches
  build.md's 18.16s exactly, `pageErrors: []`. `policy-pinned-jump.json` →
  **not-completed**, **13** reactive tap-jumps fired — the exact number the
  README documents, `pageErrors: []`.

## 6. Durability lens (SPRINT.md, 2026-08-02 OPERATOR GOAL CHANGE)

This diff touches no gameplay, so there's no beatability or difficulty
question here — but it is squarely an instrument the fleet will lean on to
diagnose exactly the kind of report the goal change anticipates ("he'll
enjoy finding and reporting play problems"). The specific failure class this
task closes — a `--deterministic` run that measured nothing and still
reported a plausible-looking `not-completed` at exit 0 — is precisely the
"green run that measured nothing is worse than no instrument" case the goal
block warns about, and I verified both halves of the fix live: the shape now
runs and measures (title-shell probe, §1a), and the backstop for every other
way the clock can die is loud with a correctly-named reason, checked with
synthetic cases beyond the ones already in pathcheck (§1a). I-011's fix
serves the same durability read from a different angle: a harness that used
to blame the *game* for a teardown race would corrupt exactly the "is it
broken" signal a future gate needs. No gameplay durability claim is made or
implied by this task, and none should be read into it.

## Summary

All four fixes verified working, each against its own real repro and (where
one existed) a live negative control against the pre-fix code — not just
`git show` or trusting the build/review reports. The I-028 measurement's
linchpin (self-check reproduces embedded numbers exactly) holds under my own
independent replay. The six-face guard change introduces no crash/error
regression and no evidence of harm; it does make the published survival band
stale, which the task already flagged honestly, and my own 5-run sample adds
weight to re-running the nine rather than contradicting the need. transform-
slice's run-to-run variance is proven pre-existing by direct inspection of
the diff's guarded hunks, independent of any one sample's luck. pathcheck,
selftest, and the full smoke set are green with counts matching both prior
reports exactly (including confirming review's off-by-one correction over
build.md's own transcription). No new defects found; I-036 already covers
the one open residual (gate-servo rules 2/4) this task's own build report
flagged and left. No new Inbox entries filed.
