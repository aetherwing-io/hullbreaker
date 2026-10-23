# PLAY gate runbook (`tools/orch/play-gate.mjs`)

The merge gate's browser step (T-120). A real Chrome, the **default URL** a player
opens, at 1280x800, 844x390 and 390x844 (touch). `node tools/orch/play-gate.mjs --help`
prints the options; the file header documents every step.

## Running it

| what | command |
|---|---|
| the whole gate, serving this checkout | `node tools/orch/play-gate.mjs` |
| against a pinned tree (what merge-task.sh does) | `node tools/orch/play-gate.mjs --base-url http://127.0.0.1:<port> --root <main> --tree <worktree>` |
| one step / one viewport | `--only degrade --views landscape` |
| its own verdict rules, no browser (1 s) | `node tools/orch/play-gate.mjs --self-test` |

Pin a tree by hand with `node tools/serve.mjs <port> --root <tree> --quiet --keep-orphan`
and prove the pin before trusting a result: the server's banner names its root, and
`curl -s http://127.0.0.1:<port>/index.html | cmp - <tree>/index.html`. merge-task.sh does
this itself (`tools/orch/lib/pin-tree.sh`).

Load `. ~/.hullbreaker-host.env` first. On this GPU-less host every viewport renders at
DPR 0.5 and a full run takes 25-45 minutes (1436 s at load 3-30, 2560 s at ~40).

## Reading a result

Every line is `PASS`, `FAIL`, `KNOWN`, `REPORT` or `SKIP`; the last line counts them; the
exit code is non-zero iff anything FAILed. `--out <dir>` keeps `play-gate.json` and
failure screenshots.

- **FAIL** blocks a merge. Read the detail after the dash; the screenshot is in `--out`.
- **KNOWN** is a defect present on main that a named lane owns (K1 and K5 in the file;
  T-105 fixed K2-K4, which are FAILs again). It never fails — unless it got WORSE than
  recorded (the title overflow ratio): then it is a FAIL. When a known defect stops
  reproducing the gate says so; delete its entry in the lane that fixed it.
- **REPORT** is a measurement this host cannot judge: frame times, art at boot, HUD
  coverage, perf on a GPU-less host, and the two rules below. The HUD line FAILs past its
  ceiling (T-105's 10 % at 844x390; the merged reading + 5 points at 390x844; main + 5 on
  desktop) and, on a phone, for any HUD cell inside the central 60 % x 60 % (T-105).

## The two GPU-less leniencies, and what still fails

1. **Freeze panel** (`tools/orch/lib/failsafe-check.mjs`). The failsafe raises `frozen`
   after 4 s without a frame (10 s inside T-105's warm-up, before the first 3 frames);
   one SwiftShader frame here can take 8-100 s. A `frozen` panel is REPORTED only when
   the page measured a frame at least as long as the bound that could have fired it AND
   its loop kept beating afterwards. Any other panel, a fault, a halt, or a loop that stays stopped fails.
2. **Slow degrade** (`tools/orch/lib/degrade-verdicts.mjs`). The art-blocked boot plays
   one tick per rendered frame. Page errors, the failure panel and the aborted-art check
   are judged on both runs **whatever their speed**; a run whose tick did not move for five
   of its own average frame times (at least 20 s, at most 2 min) is a wedge (FAIL); the
   art-blocked run averaging under 25 % of the art run's tick rate, boot to budget, is a
   CRAWL (FAIL) whether or not the art run finished — one long frame does not decide it; only
   the sim comparison can be INCONCLUSIVE, and only when the lagging run reached no
   checkpoint (every 50 ticks) or the art run had no art ready by the compared tick
   (nothing was compared either way). merge-task.sh re-runs an inconclusive degrade
   **once** at 2.5x the budget and writes the outcome into the merge commit. By hand:
   `HB_PLAY_DEGRADE_BUDGET_MS=1600000 node tools/orch/play-gate.mjs --only degrade ...`.

On a GPU host neither leniency applies, and `perf` runs the tree under test's own
`node tools/pathcheck.mjs --tier play` (the real-browser render-submission probe).

## When it fails

- `boot ... boots to its title`: the default URL did not reach PLAYING in the budget.
  Check the page errors in the detail, then `HB_PROBE_BOOT_MS` (a loaded host is slow).
- `failsafe ...`: a forced failure (throw / rejected promise / 404 / never arrives) did
  not put the failure panel on screen. A real regression of index.html's watchdog.
- `degrade ...`: see above. `CRAWLS` or `WEDGED` is about missing art, not the host.
- `ownership ...`: something was drawn on a face the climb has not reached (entry 3).
- `smoke ...`: three attempts failed; that is a regression, not flake.
- `REFUSED — its own verdict logic fails`: someone changed a rule; run `--self-test`.
