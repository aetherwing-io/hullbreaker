PASS

# T-120 checkpoint 1 — playtest gate (QA)

Tested head: `task/T-120` @ `7064c00cd58868c02ae5fa62c129f8b901a2db12`, worktree
`/home/user/hullbreaker/.claude/worktrees/T-120` (HEAD re-read at the end of the session: unchanged; `git status`
clean). Main at the time: `9bedbaa` .. `fc0724d` (only SPRINT/decisions/gate-artifact commits in between: `git diff
--stat 9bedbaa fc0724d -- tools src index.html assets .claude` is empty). Date 2026-10-23, 05:54-07:58 UTC.
Host: GPU-less (SwiftShader), 4 cores, 1-minute load average **32 to 112** for the whole session (never calm), the
shared volume at 99-100 % (a tool call failed with "Disk full" at 07:03; I removed my own 380 MB scratch trees).

This PASS is for head `7064c00` only (merge-task.sh requires verdicts newer than the head), it says nothing about
fun or feel, and it does **not** cure `review.md`'s three blocking findings. Read the five caveats before trusting it:

1. **The per-edit hook budget is not met at this host's usual load**, and under contention it is *worse than the
   gate it replaces*: new CORE per-edit tier 103-118 s vs main's old gate 86-91 s at load 42-55 (4 + 4 alternating
   runs), 28 CPU-s vs 21 CPU-s; the real hook script was killed at its 120 s watchdog in 3 of 6 runs. Confirmed only
   at the best case (load <= 48: 64 s, margin 56 s). Filed as S2 (I-A below). §2, §5.
2. **PLAY at its default budget returned `degrade` INCONCLUSIVE (REPORT) at load 61-75** (run mean 61.7, max 91.6) — four of the five degrade
   checks were never made. It was conclusive only when re-run with the documented host knob
   (`HB_PROBE_BOOT_MS=400000`, budget 1600 s): 5 passed. This is live evidence for review blocker 1. §3.
3. **The merge gate's random-port pin can silently test another lane's tree** — reproduced live against T-121's
   server on :8791 (the reviewer found the same by reading). S2 (I-B). §7.
4. **One spurious CORE FAIL** (`t-120-retry-replays-the-run`, children killed by an external SIGTERM) turned the real
   hook's exit code to 2 once in 14 completed CORE-tier runs; not reproducible in 5 more runs of the four heavy T-120
   domains at load 81-112. S3 (I-D). §5.
5. The GPU-host perf path (review blocker 2) and iPhone Safari are untested here; PLAY perf is report-only on this host.

No operator feel questions: the game is bit-identical to the merge base.

## 1. Zero game effect — PASS

```
git -C <wt> diff --stat main...HEAD -- src index.html assets      -> (empty, 0 bytes)
tree objects, HEAD vs merge-base ace6618:
  src         e7a92ad36cb8… == e7a92ad36cb8…
  index.html  2cd1acf872a3… == 2cd1acf872a3…
  assets      d833284dda39… == d833284dda39…
```
Branch diff = 57 files, all under `tools/pathcheck*`, `tools/orch/`, `tools/playtest/`, `tools/gatecheck.mjs`, three
deleted standalone checkers, `docs/ORCHESTRATION.md`, `reports/tasks/T-120/`; nothing outside the declared lane.
No dangling reference to the three deleted checkers outside audit data (`tools/orch/test-audit.json`,
`standalone-spec.mjs`, evidence) and `docs/proposals`. The smoke runs (§3) also read: no bootError, zero page errors,
zero console errors, on all three scripts.

## 2. Tier timing (worktree, `. ~/.hullbreaker-host.env`; load = 1-min loadavg, mean of 2-s samples)

Per-edit tier = `HB_GATE_FAST=1 node tools/pathcheck.mjs` (the hook's command). All green: **3823 passed, 0 failed**.

| run | wall | CPU (user+sys) | load start -> end (mean) | result |
|---|---|---|---|---|
| fast-run-1 | 63.8 s | - | 32.9 -> 46.9 (41.8) | 3823/0 |
| fast-run-2 | 64.4 s | - | 45.1 -> 52.6 (47.7) | 3823/0 |
| fast-run-3 | **100.0 s** | - | 53.1 -> 63.6 (63.3) | 3823/0 (20 s from the kill) |
| merge-mode (`env -u HB_GATE_FAST`) | **368.7 s** | - | 59.2 -> 63.0 (60.4) | **4118 passed, 0 failed**, T-102's 41-run matrix included (lane 1 = that alone, 365.9 s) |

Paired comparison, alternating A-B-B-A so drift cancels (CPU from bash `time`, whole waited-for tree; main's code
state is the same for all four old-gate runs):

| gate | wall (4 runs) | CPU (3-4 runs) | load mean | passes |
|---|---|---|---|---|
| main's old gate, `HB_GATE_FAST=1` | 90.8, 89.4, 86.9, 85.9 s (mean 88.3) | 21.2, 20.8, 21.7 s | 41-51 | 4122/0 |
| T-120 CORE per-edit tier | 108.9, 117.5, 103.0, 105.3 s (mean 108.7) | 28.3, 28.0, 28.4 s | 50-55 | 3823/0 |

Reading: from load ~50 up, wall time here is ~3.7-4.2 x CPU-seconds for both gates (the shared host gives my whole
process tree roughly one core-quarter, so three parallel lanes buy no wall time), so the new tier's extra ~7 CPU-s
becomes ~20 s of wall. Those 7 CPU-s are the lane's own behaviour domains: `t-120-retry-replays-the-run`,
`t-120-input-forgiveness`, `t-120-determinism-and-art-blind-sim`, `t-120-prototype-flags-inert` = 7.3-7.8 CPU-s alone
(5 repeats at load 81-112: 39-51 s wall, 51/0 each). Per-domain wall in one contended run (`ab-t120-3.json`):
t-102 61.5 s, t-042-audio-punch 47.9 s, **t-120-retry 45.4 s**, t-120-input-forgiveness 21.7 s, momentum 17.9 s,
t-044 17.2 s, t-043 16.2 s, g1-1 14.1 s, t-120-determinism 13.3 s. Calm-host bound by CPU accounting: 27-28 CPU-s on
4 free cores is >= ~7 s; the lane's measured calm figure is 10.7 s (not reproduced: the host never went calm).
The lane's "60.9 s at load 27-41, old gate 70.4 s at ~42" is consistent with my two earliest runs (64 s at load 42-48);
no later run reproduced it (103-118 s at load 50-55, against the old gate's 86-91 s).

## 3. PLAY gate (`tools/orch/play-gate.mjs`, served from the worktree by main's `serve.mjs` on :8788)

`node tools/orch/play-gate.mjs --base-url http://127.0.0.1:8788 --out <scratch>/play-out`, GPU-less (DPR 0.5), 2
parallel contexts, boot budget 180000 ms. Started 06:08:21Z, load 63 at start, mean 61.7, max 91.6.

**`play-gate: 39 passed, 0 failed, 20 known (tracked), 11 reported, 0 skipped in 2556 s`**, exit 0 (bound in
merge-task.sh: 5400 s).

| step | result |
|---|---|
| boot x3 | 20 PASS. Default URL (no query): title in 49.7 / 138.7 / 73.2 s, playing at 110.8 / 182.0 / 84.2 s (desktop / 844x390 / 390x844; each phase has a 180 s budget — landscape used 77 % of it at load ~62), start by key on desktop and by TAP on phones, zero page errors, zero unexplained console lines, one fetch per URL beyond K4, no overflow beyond K1 |
| failsafe 4 cases x 3 views | **12/12 PASS**: throws, rejected promise, 404 -> "The game could not start."; never-arrives -> "Still loading."; panel on screen in 0.1-11.0 s (never-arrives 10.1-10.7 s; the desktop 404 case's 11.0 s is host delay, budget 30 s), button on screen, no sim frame run |
| selftest x3 | desktop PASS (39 checks), 844x390 PASS (39), 390x844 KNOWN K5 |
| ownership | 2 PASS: 3062 on-screen route-near objects over 12 frames, GHOST SQUAD clones live in 12/12, nothing drawn on an unreached face (identical numbers to the lane's run) |
| smoke x3 | **mid-route PASS** (not-completed, deaths 0, tick 594/594), **transform-slice PASS** (completed, deaths 0, tick 938/1104), **default-url-smoke PASS** (not-completed, deaths 0, tick 294/294) — all on attempt 1, no flake note; ticks identical to the lane's run on a different host/load; each `report.json`: bootError none, pageErrors [], consoleErrors 0 |
| degrade | **REPORT** "INCONCLUSIVE: the frame-exact schedule did not finish within 720 s (art run finished, art-blocked run still advancing at tick 294/300) — neither run wedged; nothing compared" |
| perf | REPORT (report-only on a GPU-less host, as designed) |
| KNOWN 20 | K1 title overflow x3, K2 keyboard copy on touch x2, K3 failsafe "Press R" on touch x8, K4 preload double fetch x6, K5 selftest portrait x1 — all five still reproduce at their recorded magnitude; no "tracked defect not observed" note |
| REPORT 11 | boot: HUD 8.7 / 14.0 / 16.4 % (ceilings 14.0 / 19.0 / 21.5), art at boot 13/33 ready on all three (budgets 2.5 s / 6.5 s / 6.5 s, 38 "missed the boot budget" warnings), frame times 0.1-0.2 fps, worst frame 33.2 / 105.6 / 35.8 s (SwiftShader: a measurement of the host); degrade; perf |

**Degrade re-run** (the harness-limitation retry): same worktree, `HB_PROBE_BOOT_MS=400000 node tools/orch/play-gate.mjs
--base-url http://127.0.0.1:8788 --only degrade --out <scratch>/play-out-degrade` (budget 4 x boot = 1600 s), load mean
47.6: **5 passed, 0 failed, 0 reported in 923 s** — both runs 300/300 ticks; 38 art requests aborted and no art ready;
no failure panel or fault; no page error; "the sim state at the terminal tick is identical with 14 art surfaces ready
and with none". So the tree degrades safely; the shipped gate just cannot show it at its default budget when the host
is this busy. That is the reviewer's blocker 1, now with a live reproduction: in the slow branch
(`play-gate.mjs:538-549`) `bare.pageErrors`, `bare.fsv` and "art requests aborted / none ready" are never read.

## 4. Do the behaviour tests bind? — PASS

Runner: `HB_GATE_FAST=1 node tools/orch/mutation-sample.mjs --scratch <scratch>/mut --only M01,M34 --jobs 2 --out
<scratch>/mut/mutation-results.json` from the worktree (git-archives HEAD `7064c00`; the tool asserts each anchor
occurs exactly once — `--dry` said "anchors ok" — and hash-verifies the restore; I re-compared both mutated files to
`git show HEAD:` afterwards: identical). Each mutant is judged by its scratch tree's own `pathcheck.mjs --deep`.

| | exit | CORE tier red | failing domain | assertions |
|---|---|---|---|---|
| unmutated scratch tree (control, same command) | 0 | no | - | **4109 passed, 0 failed**, 76 s |
| unmutated, the two domains alone (`--only`) | 0 | no | - | t-120-input-forgiveness 18/0, t-120-retry-replays-the-run 7/0 |
| **M01** (`player.coyoteUntil = gameMs` — coyote never granted) | 1 | **yes** | only `t-120-input-forgiveness` | 3 FAIL: "a press up to 100 ms after RIG ran off the deck still jumps with the air jump withheld (forgiven lateness: none ms; refused inside the window: 16.67 … 91.67)" at 120, 60 and 30 Hz; domain 15/3, whole tree 4106/3 |
| **M34** (`hostile-rng` owner registered, reset a no-op) | 1 | **yes** | only `t-120-retry-replays-the-run` | 1 FAIL: "a retry replays the same run … (first difference at frame 42 in: hostiles)"; domain 6/1, whole tree 4108/1 |

Cross-check: M01 leaves the retry test 7/0 and M34 leaves the forgiveness test 18/0, so each test binds to its own
property and nothing else went red. `targetHit` reads false for both because `expect` still names the *old* pin's
text (the old assertions stayed green on M01, and boot-registry-contract is deleted); the red comes from the new
tests, as claimed. No hang, no lane died, no prelude exit.

PLAY falsifiers, re-run on this host (a scratch root with a mutated `index.html` and symlinks to the worktree's `src/`
and `assets/`, served on :8789 / :8790, `--only failsafe --views desktop`): **M46** (no `unhandledrejection` listener)
-> 3 PASS, 1 FAIL at the rejected-promise case (panel "Still loading." at 10.2 s instead of "The game could not
start."); **M36** (slow-boot timer dead) -> 3 PASS, 1 FAIL at never-arrives ("no #fail.on within 30000 ms"). The
clean tree is 12/12 in §3. Servers stopped and scratch removed afterwards.

## 5. The per-edit hook (main's `.claude/hooks/check-changed.sh`, unmodified, real script, synthetic payload)

`printf '{"tool_input":{"file_path":"<wt>/src/main.js"}}' | /home/user/hullbreaker/.claude/hooks/check-changed.sh`
(runs pathcheck with `HB_GATE_SKIP_BROWSER_PROBE=1 HB_GATE_FAST=1` in the worktree, 120 s watchdog, `kill -9` on the
parent). Six runs:

| run | wall | load mean | outcome |
|---|---|---|---|
| hook-1 | 102.8 s (CPU 27.0 s) | 67.6 | finished green, **margin 17 s** |
| hook-2 | 124.5 s | 70.3 | **killed at 120 s** ("pathcheck exceeded 120s and was killed … Not treating this as a pathcheck failure", exit 0) |
| hook-3 | 124.1 s | 69.4 | **killed at 120 s** |
| hook-4 | 120.1 s | 49.0 (start 37.4, end 54.5) | **killed at 120 s** (CPU 18.4 s done of ~27) |
| hook-5 | 121.0 s | 61.2 (43.5 -> 77.3) | pathcheck finished at 119.4 s, **1 spurious FAIL** (see below), hook exit **2** |
| hook-6 (`nice -n -20`, an attempt to emulate a calm host) | 98.0 s (CPU 24.6 s) | 71.6 | green, margin 22 s |

Answer to "would it finish inside 120 s on a calm-ish host": **yes at the best case I saw (direct runs at load 42-48:
63.8 and 64.4 s, margin ~56 s; the CPU bound says ~7 s on idle cores); not at this host's prevailing load 49-80 —
2 of 6 real-hook runs finished green with 17-22 s to spare, 3 were killed, 1 ended at 121 s.** `nice` did not help
(a 2.6 CPU-s single-thread loop took 17.1 s at nice 0 and 14.7 s at nice -20; /proc/stat over 5 s: user 82.5 %,
system 15.1 %, idle 0.0 %, steal 0.6 % — the box is CPU-saturated and shared per cgroup), so a calm host cannot be
emulated here. The hook is async and fails soft (kill message on stderr, exit 0), so nothing blocks, but above the
budget the per-edit gate stops gating, and says so only in one stderr line.

Other hook facts: **no orphans after the watchdog's `kill -9`** — killed the pathcheck parent 25 s in with 6
descendants (3 lanes + 3 grandchildren): 5 alive at +1 s, 1 at +3 s, 0 at +5 s (the lane watchdog works); the hook
**does not fire** on edits to `tools/pathcheck/*.mjs` or `tools/orch/*` (exits 0 in 0.06-0.14 s; its filter is
`*/src/*|*/tools/pathcheck.mjs`), which is where this lane put the gate; and the **spurious FAIL in hook-5** was
`FAIL T-120: both retry twins ran headlessly — retried: child default-run-child.mjs … exit null SIGTERM: — fresh: …
exit null SIGTERM:` — both `mode:"retry"` children were SIGTERMed by something outside the gate (`runChild`'s own
timeout sends SIGKILL, nothing in `tools/pathcheck*` or `tools/orch` signals them), the 600-frame `trace` child had
already finished. Cause not identified: nothing in this tree sends that signal, so something outside it did (a pattern
kill by another agent on this shared host would fit; unconfirmed). It did not recur in 5 further runs of the four heavy
T-120 domains at load 81-112 (51/0 each). The harm: the hook returned exit 2 ("pathcheck
FAILED after editing …") — a false blocking message — and at the merge gate the same event would refuse a merge.

## 6. Screenshots, actually looked at

Smoke canvases (480x300, the `HB_SMOKE_VIEWPORT` host knob, not a player viewport):
`play-out/smoke-mid-route/screenshot.png` (traversal slice: HUD, "H WAGER -> EXIT LEFT" overlay, RIG on a catwalk,
hull and backdrop render), `smoke-default-url-smoke/screenshot.png` (the shipped six-face run: HUD with OVERDRIVE
COLD / ASCENT / WAVE 1/6 OBSERVE, catwalk deck, RIG, field-brief footer wraps cleanly; hostiles carrier+wasp up to 4
concurrent, lives 3 -> 3), `smoke-transform-slice/screenshot.png` (BREACH CLEAR result card readable, 15.6 s / 2 of 2
transformations / 0 kills). No blank page, no missing art, no corruption. **One glitch:** on the BREACH CLEAR card the
caption "flip inward -> the passage climbs -> breach out, one 2D controller the whole way" is drawn over the FIELD BRIEF
footer, whose text shows through it (crop: `shots/transform-slice-bottom-x3.png`). It is in an opt-in fixture
(`?slice=transform`) at a 480x300 canvas, I did not check a player viewport, and the game is unchanged by this lane,
so it exists on main; S3 (I-F).
Failure panels (forced by me, CDP capture, desktop 1280x800 and phone 390x844; `shots/failsafe-{throws,never}-
{desktop,portrait}.png`): title, one-sentence reason, a large green "Try again" button fully on screen, "What broke
(for grown-ups)" fold; readable at both sizes; the phone panel says "Press R, or click the button" (K3, tracked).
Not judged: FAR-view tell readability and style against `docs/concept-art/` boards — the game is bit-identical to the
merge base and the smoke canvas is too small to judge them.

## 7. Merge mechanics (read, and one hazard demonstrated; merge-task.sh itself was NOT run)

`bash -n tools/orch/merge-task.sh` OK. Step 6 draws `PORT=$(( 8760 + RANDOM % 200 ))`, starts
`node tools/serve.mjs --root "$WT" --port "$PORT" … &` and then loops until *any* server answers 200. Live
reproduction with the exact commands: port **8791 was already held by T-121's `serve.mjs`** (pid 1148, `--root
…/worktrees/T-121`); my `serve.mjs` on :8791 exited 1; the readiness loop returned `ready=yes`; `GET :8791/src/main.js`
-> 200 from the other tree. 12 foreign listeners were in 8760-8959 at that moment (8776-8779, 8784, 8785, 8791, 8792,
8794-8797) = ~6 % per draw. The old code (python `http.server` + `sleep 1`) had the same hazard with no check at all,
so this is not a regression, but PLAY is now the merge gate's only browser evidence. Also: `docs/ORCHESTRATION.md:240`
still says merge-task.sh "pins with `python3 -m http.server`" (now false); neither `play-gate.mjs` nor `pathcheck.mjs`
handles `--help` (read, not run: `play-gate.mjs --help` would start the 40-minute gate).

## 8. What this run does not show

Fun or feel (never judged). The GPU-host perf path and review blocker 2 (`--root` = main) — report-only here. Safari.
A calm-host timing (CPU accounting only). DEEP tier (not asked; the lane and reviewer ran it: 4109/0). The old gate's
behaviour at the same instant as the new one (alternation only approximates it). Per-run noise: wall times moved
64 -> 118 s at a nominal load of 42-55, so load is a weak predictor and CPU-seconds the stable number.

## 8b. Re-gate checklist for the fix round (what I will run on the new head)

`git diff --stat main...HEAD -- src index.html assets` empty; `HB_GATE_FAST=1 node tools/pathcheck.mjs` three times with
CPU-seconds recorded (the number that does not move with load: 28.2 now, old gate 21.2) and the real hook script;
merge-mode CORE once; the full PLAY gate, plus `--only degrade` at `HB_PROBE_BOOT_MS=400000` if it comes back
INCONCLUSIVE; M01, M34 red and the unmutated tree green; the failsafe falsifiers M36 / M37 / M46 red on this host; a
new falsifier for blocker 1 (an art-blocked page that throws or shows the panel while the run is slow must FAIL, not
REPORT); the I-B port-collision repro against a live foreign server.

## 9. Evidence (all under `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t120-gate/`)

`timings.tsv` (every row above), `step1-*.txt`, `fast-run-{1,2,3}.log`, `merge-mode.log`, `ab-{main,t120}-{1..4}.log`
(+ `ab-t120-3.json` per-domain), `hook-run-{1..6}*.log`, `orphan-test.out`, `play-gate.log` + `play-out/`
(`play-gate.json`, `smoke-*/{report.json,summary.md,screenshot.png}`), `degrade-rerun.log` + `play-out-degrade/`,
`play-failsafe-M46.log`, `play-failsafe-M36.log`, `mut/{mutation-results.json,M01.json,M34.json,control-unmutated.json,
only-two-unmutated.json}`, `mutation-M01-M34.log`, `control-unmutated-scratch.log`, `t120-tests-repeat-{1..5}.log`,
`shots/*.png`; tools: `timed.sh`, `timed2.sh` (CPU), `hook-run.sh`, `orphan-test.sh`, `failsafe-shots.mjs`.
Commands, in order: `. ~/.hullbreaker-host.env`; `HB_GATE_FAST=1 node tools/pathcheck.mjs` (worktree and main);
`env -u HB_GATE_FAST node tools/pathcheck.mjs`; `node /home/user/hullbreaker/tools/serve.mjs 8788 --root <wt> --host
127.0.0.1 --quiet --keep-orphan`; the two `play-gate.mjs` lines in §3; the `mutation-sample.mjs` line in §4 then
`HB_GATE_FAST=1 node <scratch>/mut/tree/tools/pathcheck.mjs --deep --json <f>`; `node tools/pathcheck.mjs --only
t-120-input-forgiveness,t-120-retry-replays-the-run`; the hook line in §5.

## PROPOSED INBOX ISSUES

(ids are the integrator's; latest in SPRINT is I-120)

- **I-A | bug | S2 | repro: `HB_GATE_FAST=1 node tools/pathcheck.mjs` in task/T-120 @ 7064c00 and in main @ fc0724d, alternating, under `bash -c 'TIMEFORMAT="%R %U %S"; time …'`; hook: `printf '{"tool_input":{"file_path":"<wt>/src/main.js"}}' | .claude/hooks/check-changed.sh` | evidence: reports/tasks/T-120/playtest.md §2, §5** —
  The new per-edit tier costs 28.0-28.4 CPU-s against main's old gate 20.8-21.7, and under this host's contention that
  is 103-118 s against 86-91 s (load 42-55). The real hook was killed at its 120 s watchdog in 3 of 6 runs (mean load
  49-70) and finished green in 98-103 s twice. The lane's own "60.9 s vs 70.4 s" was reproduced only by my two earliest
  runs (64 s at load 42-48). The four
  T-120 behaviour domains are about a quarter of the CPU (7.3-7.8 of 28 s; `t-120-retry-replays-the-run` alone 45 s
  of contended wall). Options: raise `PATHCHECK_TIMEOUT_S` and `.claude/settings.json`'s hook timeout (the hook is
  async); give the retry/forgiveness/determinism tests a `HB_GATE_FAST` subset (the retry test's dirty prefix is 1200
  frames); a FAST subset or DEEP for `t-042-audio-punch` (47.9 s contended); and make a killed run loud.
- **I-B | bug | S2 | repro: with a foreign server on the drawn port (live: `node tools/serve.mjs 8791 --root …/worktrees/T-121` already running) run merge-task.sh step 6's `node tools/serve.mjs --root <wt> --port 8791 --host 127.0.0.1 --quiet &` and its readiness `node -e "http.get(…)"` loop, then `curl :8791/src/main.js` | evidence: playtest.md §7** —
  `serve.mjs` exits 1 on the taken port, the loop reports ready against the squatter, and PLAY + smoke judge another
  lane's tree. 12 foreign listeners in 8760-8959 on this host (~6 % per draw). Same as review item 8, now reproduced.
  Fix: `kill -0 "$SRV"` in the loop plus a byte comparison of a worktree-only file (ORCHESTRATION: "prove the server
  pin"), or bind port 0 and read the port back.
- **I-C | bug | S2 | repro: `node tools/orch/play-gate.mjs --base-url <pinned>` at load 60-90 (the 06:08Z run) vs `HB_PROBE_BOOT_MS=400000 … --only degrade` | evidence: playtest.md §3, `play-out/play-gate.json`, `degrade-rerun.log`** —
  Live confirmation of review blocker 1: the default-budget gate returned REPORT INCONCLUSIVE with the art-blocked
  run at tick 294/300 and made none of the four checks that do not need the schedule to finish. With a 1600 s budget
  the same tree passes all five (923 s). Beyond the reviewer's fix (check page errors / panel / aborted-request count
  on every run that has data), merge-task.sh could re-run `--only degrade` once with a larger budget when the first
  result is inconclusive.
- **I-D | bug | S3 | repro: hook-run-5 (`.claude/hooks/check-changed.sh`, 07:44Z); did not recur in 5 repeats | evidence: `hook-run-5.log`** —
  `t-120-retry-replays-the-run` failed with `exit null SIGTERM` on both `mode:"retry"` children (killed from outside
  the gate; `runChild`'s timeout is SIGKILL). The hook then returned exit 2, a false blocking message. Harden
  `tools/pathcheck/lib/spawn.mjs`: re-run a child once when it dies of SIGTERM/SIGHUP/SIGINT (never on its own timeout
  or a non-zero exit) and print that it did.
- **I-E | docs | S3 | repro: `grep -n "still pins with" docs/ORCHESTRATION.md`; `grep -n default-url-smoke tools/playtest/README.md`; read `tools/orch/play-gate.mjs` | evidence: playtest.md §7** —
  ORCHESTRATION.md:240 says merge-task.sh pins with `python3 -m http.server` (false since this lane);
  `tools/playtest/README.md` does not list `scripts/default-url-smoke.json`; the PLAY gate has no runbook (flags and the
  `HB_PROBE_BOOT_MS` / `HB_PLAY_DPR` / `HB_PLAY_JOBS` knobs live only in its header) and neither it nor `pathcheck.mjs`
  handles `--help`, so `--help` starts a full run.
- **I-F | art | S3 | repro: `node tools/orch/play-gate.mjs --only smoke` (transform-slice.json, 480x300) | evidence: `play-out/smoke-transform-slice/screenshot.png`, `shots/transform-slice-bottom-x3.png`** —
  The BREACH CLEAR caption overlaps the FIELD BRIEF footer (footer text shows through). Opt-in fixture, tiny canvas,
  a player viewport not checked; present on main (this lane does not touch `src/`). Owner: T-105/T-107 HUD pass.
- **I-G | bug | S3 | repro: `printf '{"tool_input":{"file_path":"<wt>/tools/pathcheck/_tiers.mjs"}}' | .claude/hooks/check-changed.sh` (exits 0 in 0.06 s, runs nothing) | evidence: playtest.md §5** —
  The hook's filter is `*/src/*|*/tools/pathcheck.mjs`, so edits to the gate's own domains, tier map, `tools/orch/*` and
  `play-gate.mjs` get no per-edit check. Add `*/tools/pathcheck/*|*/tools/orch/*.mjs` (mind I-A's budget first).
- **I-H | bug | S3 | repro: `node tools/orch/mutation-sample.mjs --scratch <dir> --only M01,M34 --jobs 2` | evidence: this session's disk-full tool error at 07:03Z** —
  Each job leaves a ~190 MB `git archive` tree in the scratch dir (382 MB for two) on a volume that sat at 99-100 %;
  delete the trees on success (keep with `--keep`), since the evidence JSON is all anyone reads.
