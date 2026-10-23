# T-120 — rebuild the test gate (checkpoint 1)

Lane T-120, branch `task/T-120`, worktree `/home/user/hullbreaker/.claude/worktrees/T-120`,
based on main `5252c18` (T-108 merged), with main merged back in at `ace6618` (T-102 and
T-101 merged) in `bb1fdfb`; main's one later commit (`5dd7335`) touches only
`reports/tasks/T-103/review.md`, so the tree tested here is current main + this branch.
Plan: `docs/proposals/2026-10-test-audit.md` §7 (T-108's audit). The container restarted
during the final PLAY run; it was re-run from scratch afterwards (§2.3).

This is a **checkpoint**, not the end of the lane. Done: step 0 (and the re-key after two
lane merges), the tier runner, the PLAY gate, all seven behaviour tests T-120 owns (each
red on its mutant), the merge gate, six numbered batches — three of them deletions or
rewrites (21 sites gone) — and I-106. Not done: most of steps 3 and 4 — 21 of the 554
pin/noise sites are gone; the rest are listed by lane under "Deferred" with what each is
waiting for.

Host for every number below: the 4-core cloud container, no GPU (SwiftShader), shared with
3-5 other lanes. 1-minute load averages are given with each measurement and were **25-58**
during this work (my own mutation samples and browser runs were a large part of the upper
half). Every wall-clock number is load-bound; every red/green outcome is not.

## 1. Tier structure and timings

| tier | command | what runs | measured (this host) |
|---|---|---|---|
| **CORE**, per edit | `HB_GATE_FAST=1 node tools/pathcheck.mjs` (the PostToolUse hook) | every domain not listed DEEP or PLAY in `tools/pathcheck/_tiers.mjs` (65 on the merged tree), 54 of them in 3 parallel lane processes; long played proofs run their per-edit subset (T-102: 4 of 41 runs) | **3823 passed, 0 failed**: **10.7 s** on a calm host (load 0.3-0.8, after the container restart; `--serial` 11.2 s, identical per-domain counts) **60.9 s** at load 27-41 (merged tree) and **91.2 s** at load ~45 (final tree). Pre-merge, load ~35: lanes 38.0 s vs `--serial` 62.1 s. Before T-120: the old full fast run 70.4 s at load ~42. Worst seen: 114.7 s (2 lanes, load ~55) and 154.1 s (3 lanes, load ~58) while my own 2-job mutation sample ran — so above load ~55 the per-edit gate can pass the hook's 120 s watchdog |
| **CORE**, merge | `node tools/pathcheck.mjs` (merge-task.sh step 5 and the post-merge check, `HB_GATE_FAST` unset) | the same 65 domains, T-102's full 41-run matrix included | CORE + DEEP together: **4400 passed, 0 failed, 378.8 s** (load 35-45); T-102's matrix is 377 s of that in a lane of its own, so CORE alone is bounded by it (~380 s) |
| **DEEP** | `node tools/pathcheck.mjs --deep` | CORE + 14 DEEP domains: flag fixtures and prototypes (`?slice=traversal` paces, `?ribrun=1`, `?score=1`, `?hook=1`/`?flow=1`, the fallback-exploit fixture) and the harness self-tests | merge mode: in the row above. Pre-merge (no T-102 matrix yet), 76 domains: 3994 passed in 111.0 s (load ~45) |
| **PLAY** | `node tools/orch/play-gate.mjs` (merge-task.sh step 6, against the pinned worktree) | real browser, the DEFAULT URL at 1280x800, 844x390 and 390x844 (touch): boot, failsafe, selftest, degrade, ownership, smoke, perf (§2 below) | pre-merge tree: **41 passed, 0 failed, 20 known, 11 reported, 0 skipped in 2560 s** (load ~40). Merged tree: §2.3 |
| everything | `node tools/pathcheck.mjs --tier all` | the pre-T-120 suite (CORE + DEEP + the browser probe domain) | — |

Runner facts (`tools/pathcheck.mjs`, README `tools/pathcheck/README.md`):
- The contract is unchanged: last line `pathcheck: N passed, M failed`, non-zero exit on any
  failed assertion, a domain that threw, a lane that died, or a refusal (an unlisted domain
  module, a stale tier map). `manifest.mjs` stays the one ordered list; a new domain is CORE
  in the main process by default, so a lane that touches nothing else gets the safe tier.
- Lanes are wall time only: every INDEPENDENT domain run alone in a fresh process produces
  exactly its count in the serial suite — `node tools/pathcheck.mjs --check-lanes`: 61/61 at
  batch 1, **54/54 on the final tree** (34 s, calm host; the two merged domains included:
  t-102-corner-turns +59/-0, touch-deck-contract +46/-0). Fixed on the way (`d6d7715`): the
  check's serial reference ran CORE only, so the PLAY-tier probe domain always read DIFF.
  On a calm host lanes buy little (10.7 vs 11.2 s: the child-process domains already use
  every core); under load they cut the wall time by ~40 % (38.0 vs 62.1 s at load ~35).
  A lane whose parent dies is killed by a watchdog thread within 4 s (measured: parent
  SIGKILLed, lanes gone).
- `--json F` writes per-domain passes / fails / ms / FAIL lines and lane timings; a failed
  run prints its FAIL lines grouped by the audit disposition of the failing domain.
- The prelude (`tools/pathcheck/_context.mjs`) now also bans `Math.random`, `Date.now`,
  `new Date`, `crypto.getRandomValues/randomUUID` in `src/pure/`, `src/sim/` and
  `src/mode.js` statically, before any domain runs.

## 2. The seven behaviour tests T-120 owns (proposal §7.4), each red on its mutant

Every falsifier is a mutant in `tools/orch/mutants.mjs` applied to a scratch tree by
`tools/orch/mutation-sample.mjs` (anchor count asserted, restore hash-verified), judged by
**that tree's own gate** (`node tools/pathcheck.mjs`), or by the PLAY gate against that tree
served on 8781. Headless evidence: `reports/tasks/T-120/evidence/mutants-new-headless-tests.json`
and the two full samples in §4.

| # | test (tier) | currency | green on | red on |
|---|---|---|---|---|
| 4 | `t-120-input-forgiveness` (CORE; 18 assertions) | a press a little late (off the deck) or a little early (before landing) still jumps, **with the air jump withheld**, at 120/60/30 Hz, and the windows are exactly the tuned ones (coyote 100 ms, jump buffer 120 ms) | every tree since `e8aa5d6` | **M01** (coyote never granted): 3 FAIL, "forgiven lateness: none"; **M43** (buffer cleared on landing): 3 FAIL; **M44** (coyote x3): 3 FAIL, "forgiven beyond it: 108.3 … 158.3 ms" at 120 Hz. Before it, M01 was green in all 76 headless domains (T-108) |
| 6 | headless half: `t-120-determinism-and-art-blind-sim` twin C (CORE); browser half: PLAY `degrade` | the sim cannot tell whether the art loaded; a boot with every `assets/generated/` request aborted plays the same frame-exact schedule to the same sim state | headless always; PLAY `degrade` PASS (4 checks) | **M10** (wasp hitbox grows when a render global says the art is ready): FAIL twin C. **M12** (main.js throws): PLAY boot FAIL. The browser comparison is honest about this host: when the art run's own art also missed its budget it is REPORTED inconclusive, not passed (desktop's 2.5 s budget: 0/33 ready at load ~40, so since `c4b2944` it runs at 844x390, whose 6.5 s budget got 33/33 at boot in two runs at load 27-42) |
| 7 | `t-120-determinism-and-art-blind-sim` twins A/B (CORE) + the prelude ban | the default run, enemies on, every default verb on, is identical frame by frame across processes (600 frames: spawns, first dive, bullets, capsules) | always | **M05**, **M41** (`Math.random` in sim, `Date.now` in pure): prelude exit before any domain. **M05b** (`Math['random']`, evades the ban): FAIL in this test, the retry test and g1-1 |
| 8 | `t-120-prototype-flags-inert` (CORE; 21) | `src/mode.js` under every player/operator URL (none, testapi, selftest, slice=traversal, slice=transform, g2): every unjudged prototype (hook, flow, autobounce, ribrun, crouch, zip reveal, hound/polyp/mortar trial) is off unless typed, with a positive control per flag | always | **M07** (`?hook=1` armed by default in the slice): 2 FAIL; **M07b** (`?flow=1` armed): 2 FAIL |
| 9 | `t-120-retry-replays-the-run` (CORE; 7) | a dirty run retried through the REAL `src/boot/run-reset.js` registry (render rows stubbed via loader hooks) equals a fresh boot at the same clock, every frame for 10 s | always | **M34** (hostile-rng owner registered but no-op): FAIL — the pin it replaced (`boot-registry-contract`) was GREEN on M34; **M45** (the pace owner's reset lost): FAIL. Reported, not asserted: a retry at a LATER clock diverges at frame 42 (FP rounding, §6) |
| 10 | PLAY `failsafe` (4 forced failures x 3 viewports) | the failure panel reaches the player — readable, button on screen, no sim frame run — when main.js throws, rejects a promise nobody handles, 404s, or never arrives | clean tree: 12/12 PASS, panel on screen in 0.4-11.2 s | **M36** (slow-boot watchdog dead): FAIL at never-arrives (run at desktop and portrait: both FAIL); **M37** (bubble-phase listener): FAIL at 404 (the slow panel shows instead); **M46** (no rejection listener): FAIL at the rejected-promise case |
| 11 | PLAY `ownership` (pre-turn half); turn half = T-102's turn proof (CORE) | nothing is drawn on a face the climb has not reached: RIG 13 tiles short of the first bend with GHOST SQUAD and ORBITAL LANCE active, every visible on-screen object near the route (instances included) mapped back to route s through the path polyline AND the ascent altitude | clean: 3052 objects over 12 frames, 0 violations | **M20** (ghost clones 40 tiles ahead — the evasion that kept `mod-route-visibility`'s regexes green): FAIL "Mesh at s=140 (facet 1, camera 0, 24 frames)" |

Also red-proved, not one of the seven: the PLAY defect ratchet (`201e13e`: a tracked defect
may not get worse — title overflow 840 px in 397 and HUD 30.5 % fail on a mutated tree, the
clean tree is KNOWN / REPORT) and the I-106 harness self-test (`383c9f6`: the old pattern
and a HUD separator change each fail it).

### 2.1 PLAY gate checks (`tools/orch/play-gate.mjs`)

boot (per viewport: title, start by a TAP on phones / a key on desktop, the loop runs, no
failure panel or fault, zero page errors, zero console errors/warnings beyond named host
noise, one fetch per URL, no visible text overflowing, no keyboard copy on a coarse pointer,
HUD coverage ceiling, art and frame times reported), failsafe, selftest (`?selftest=1` per
viewport), degrade, ownership, smoke (mid-route, transform-slice and the new
`default-url-smoke.json`, best of three, `tools/orch/smoke-verdict.mjs`), perf (gated on a
GPU host through `pathcheck --tier play`; REPORT-ONLY here, per the integrator's call).
GPU-less hosts shrink the drawing buffer (DPR 0.5, `HB_PLAY_DPR` overrides; CSS layout is
unchanged) — at DPR 1 the desktop boot took 139 s to the title.

KNOWN (printed every run, never failing; the gate says when one stops reproducing):
K1 title overflow (T-105; may not exceed 1.36x its box), K2 keyboard copy on touch (T-105),
K3 failsafe hint "Press R" on touch (T-105), K4 preload double fetch (T-105), K5
`?selftest=1` fails at 390x844 — its expected camera depth predates `PORTRAIT_SAFE` (T-107).

### 2.2 Adopted, not rewritten

T-102's `t-102-corner-turns` (CORE, own lane; its 4-run `HB_GATE_FAST` subset per edit, the
41-run matrix at merge) and T-101's `touch-deck-contract` (CORE invariant tier) are in the
tiers as they landed. T-101's real-touch rig `tools/playtest/touch-proof.mjs` (15-25 min
here) is run by no gate yet — see §7.

### 2.3 PLAY on the merged tree

Full run on the merged tree (main `ace6618` + this branch; main's later `5dd7335` is a
report file only), after the container restart, load 3 -> 30 as the other lanes came back:
**43 passed, 1 failed, 20 known, 10 reported, 0 skipped in 1436 s**
(`reports/tasks/T-120/evidence/play-gate-merged.log`). The first attempt, at load ~40, was
killed by the restart after its ownership step (`play-gate-merged-interrupted.log`).
- boot: title in 15.3 / 35.8 / 23.2 s and playing in 26.8 / 45.9 / 28.2 s (desktop / 844x390 /
  390x844); zero page errors and zero unexplained console lines in all three; HUD 8.7 / 14.0 /
  16.4 %; art at boot 14/33 (desktop, 2.5 s budget), 33/33 (844x390), 13/33 (390x844).
- failsafe 12/12 (panel on screen in 0.2-10.8 s); selftest PASS at desktop and 844x390, K5 at
  390x844; ownership PASS (3062 objects, clones live 12/12); smoke: mid-route,
  transform-slice and default-url-smoke all PASS on the first attempt.
- degrade at 844x390 is **conclusive for the first time**: 38 art requests aborted, and "the
  sim state at the terminal tick is identical with 14 art surfaces ready and with none".
- **the one FAIL** was degrade's "missing art never raises the failure panel or a fault": the
  art-blocked page showed the freeze-watchdog panel (`frozen`, 0 faults). Cause: the watchdog
  raises `frozen` after 4 s without a frame and never downgrades it; the frame loop beats on
  every rAF frame (src/main.js `frame()`), and SwiftShader frames on this host took 7.4-28.3 s
  in the same run's boots — a host measurement, like the frame budget. Fix
  (`tools/orch/lib/failsafe-check.mjs`, used by boot and degrade): on a GPU-less host a
  `frozen` panel is REPORTED only when the page measured a frame of at least the 4 s bound
  AND the loop's beat counter advances afterwards; any other panel, a fault, a halt, or a
  loop that stays stopped fails, and everything fails on a GPU host. Falsifier
  (`tools/orch/failsafe-check-probe.mjs`, real page, load ~30): the panel forced over a live
  loop -> REPORT (a 17.5 s frame measured, the loop kept beating); the same with the loop
  stopped -> **FAIL** "the frame loop did not beat again after the freeze panel"; a `crash`
  panel -> **FAIL**. 3 of 3 as expected.
- Also fixed after that run: a degrade run still advancing when its 720 s budget ran out
  failed as if it had wedged (seen once, with two PLAY gates sharing the host at load ~40:
  the art run at 0.1 fps). The schedule takes one rendered frame per tick, so now a run
  whose tick still advances 20 s later is REPORTED inconclusive on a GPU-less host, and a
  run whose tick stopped fails (missing art must never wedge the game).
- Re-run of degrade with both fixes on the merged tree (load 25-64, 898 s): **5 passed, 0 failed** —
  300/300 ticks both runs; no panel, no fault, no page error with the art blocked; and the
  comparison conclusive again: "identical with 41 art surfaces ready and with none"
  (`evidence/play-degrade-merged-rerun.log`). Falsifier for the slow-vs-wedged rule (a tree where one failed art load stops the frame
  loop for good; budget lowered to 360 s): the art run finished, the art-blocked run's tick
  stopped, and the step **FAILED** — "both runs reached the end of the input schedule —
  blocked: Timeout 360000ms exceeded" (`evidence/play-degrade-wedge-falsifier.log`).

## 3. Batches (one commit each, with its proof)

| commit | batch | sites | census `--check` | proof |
|---|---|---|---|---|
| `f72ecfc` | step 0: re-key the audit to main 5252c18, re-lock | +1 classified (finite-height invariant) | exit 0 (lock 2050 -> 2051) | 17 drifted ranges fixed, 0 verdicts changed |
| `e8aa5d6` / `84b31fb` | 1: tier runner + four headless behaviour tests | +22 CORE | exit 0 (2073) | 11/11 falsifiers RED in CORE |
| `3033483` | 2: noise deletions (RETIRED + TAUTOLOGY) | **-7** (2 dare-wager RETIRED, 1 keyboard-copy RETIRED that M28 was red on, 4 TAUTOLOGY); 4 audit-RETIRED sites **kept** after review (reclassified PURE-INVARIANT, deep) | exit 0 (2066) | edited domains 796 passed; mutation sample below |
| `6d60548` | 3: PLAY gate + merge gate | — | — | M12, M36, M37 red in the browser |
| `3f2d876` | 4: three pins replaced by behaviour tests | **-4** REWRITE (boot-registry x2 + `tools/boot-registry-check.mjs`; 2 index.html failsafe regexes) | exit 0 (2062) | replacements red on M34, M45 / M36, M37, M46 |
| `46b03af` | 5: three PIN-only domains + two checkers | **-10** (t-057-hull-shimmer 6, capsule-reliquary 2, enemy-ecology-render 2) | exit 0 (2052; 80 -> 77 domains) | mutation sample below |
| `c4b2944` | 6: PLAY `ownership` | — | — | M20 red |
| `201e13e` | tracked PLAY defects may not get worse | — | — | ratchet red on its mutant |
| `bb1fdfb` | merge main (T-102, T-101): classify + tier | +65 new, 2 relabelled | exit 0 (2117) | 3823 / 4400 passed |
| `383c9f6` | I-106: analyze-run reads the shipped HUD | +4 DEEP | exit 0 (2121) | self-test red on 2 mutants |
| `c8380c5` | docs: `docs/ORCHESTRATION.md`'s gate table, `tools/pathcheck/README.md` | — | — | — |
| `d6d7715` | `--check-lanes` reference = the whole suite; merge-commit flake wording | — | — | 54/54 same |
| the report commit | PLAY gate on a GPU-less host: a SwiftShader-caused freeze panel over a live loop and a still-advancing degrade run are REPORTED, a stopped loop or a wedge still fails (`tools/orch/lib/failsafe-check.mjs`, `tools/orch/failsafe-check-probe.mjs`); this report and its evidence | — | exit 0 (2121, unchanged) | probe 3/3; wedge falsifier FAIL; degrade re-run 5/0 |

Totals against the audit's plan: DELETE 379 -> 360 (17 deleted, 4 kept on review; +3 PINs
in T-101's new domain, +1 relabel), REWRITE-AS-BEHAVIOUR 175 -> 176 (4 replaced; +4 iOS
regex guards in T-101's domain, +1 relabel), DELETE-WITH-FEATURE 50 -> 53 (T-102's three
`?zip=1` lines join T-121's list).

## 4. Mutation sample, before and after the deletion batches

Runner: each mutant applied to its own scratch tree; the tree's own `node tools/pathcheck.mjs
--deep --json` (`HB_GATE_FAST=1`) decides; `redCore` says whether CORE alone was red.
Before = `84b31fb` (runner + the four tests, no deletions); after = `c4b2944` (batches 2-6).
Raw: `reports/tasks/T-120/evidence/mutation-before-84b31fb.json`, `mutation-after-c4b2944.json`.

| kind (what red means) | n | before `84b31fb` red / green | after `c4b2944` red / green |
|---|---|---|---|
| property (a real defect: red is right) | 33 | 28 / 4 (+M46, added later) | 26 / 7 |
| evasion (a defect built to slip past a pin) | 6 | 2 / 4 | 2 / 4 |
| refactor (no behaviour change: red is a false alarm) | 5 | 4 / 1 | 3 / 2 |
| fix (a defect FIXED: red is obstruction) | 1 | 1 / 0 | 0 / 1 |
| intended (a design change the operator could ask for) | 3 | 2 / 1 | 2 / 1 |
| robustness (half-made edit: must be red, not hang) | 1 | 1 / 0 | 1 / 0 |
| equivalent / blind controls (must stay green) | 6 | 0 / 6 | 0 / 6 |

Every change, and why (every other mutant has the same verdict and the same failing domains):
- **M24** (refactor: one space in a registry entry) RED -> green: the false alarm went with
  `boot-registry-contract` (batch 4).
- **M28** (fix: the touch-correct failsafe copy) RED -> green: the obstruction went with
  pathcheck-suite-2's keyboard-copy pin (batch 2).
- **M36, M37** (property: index.html's slow-boot watchdog dead / bubble-phase listener)
  RED -> green **headless, by design**: their regex pins were replaced by the PLAY gate's
  failsafe step (batch 4), which is red on both in a real browser (M36: never-arrives case at
  desktop and portrait; M37: the 404 case shows the slow panel instead). The failsafe is
  PLAY's per the audit (§7.2). **M46** (new: no rejection listener) is likewise green headless
  and red in PLAY.
- **M29** (intended: retune the retired dare pocket) stays red, 3 -> 2 failing sites: the
  wager-cost pin went (batch 2); left are pathcheck-suite's dare margin (T-107/T-201 fence) and
  pacing-variants' "retreat clears its exit margin at the daylight each pace grants", which
  batch 2 KEPT on review — entry 9 keeps "daylight against the pursuing edge holds"; a retune
  that breaks the retreat should be red. The operator may read that differently.

So: two false alarms / obstructions removed, no property kill lost — the two that left the
headless tiers are red in PLAY. Still green and known: M12/M13 (a boot-time throw: PLAY boot
is red), M20 (PLAY ownership is red), M23/M33/M35 (evasions with no behaviour test yet, §6),
M31 (T-103's fence), M39 (DEEP; M39b red), M30 (intended, correctly green).
New-test falsifiers in both samples: M01, M05, M05b, M07, M07b, M10, M34, M41, M43, M44, M45
all RED in CORE.

## 5. merge-task.sh

`tools/orch/merge-task.sh <id>` keeps its contract (the only path to main, run from the main
checkout; exit code; pathcheck's final `pathcheck: N passed, M failed` line; bounded runs;
`HB_GATE_FAST` unset at merge). Changes:
- step 5: the CORE tier in the worktree (`node tools/pathcheck.mjs`), then
- step 6: the PLAY gate against the worktree pinned by `tools/serve.mjs --root <worktree>`
  (no more `python3 -m http.server`), main's copy of `play-gate.mjs` when it exists (so a
  branch cannot weaken the gate that judges it), log in
  `tools/playtest/runs/merge-<id>-play/play-gate.log`; smoke flakes carried into the merge
  commit as before;
- post-merge: the CORE tier on main;
- every step bounded: TERM at its bound, KILL 20 s later (`HB_PLAY_BOUND_S`, default 5400 s);
- `--skip-play` for pure-docs tasks; `--skip-smoke` now skips only the smoke scripts.
- `tools/gatecheck.mjs`'s mutant mirror also copies `tools/pathcheck/lib/`.

## 6. Findings (proposed inbox issues — the integrator files them)

## PROPOSED INBOX ISSUES

- **I-??? | bug | S4 | repro: `node tools/pathcheck.mjs --only t-120-retry-replays-the-run` (its reported note) | evidence: src/sim/hostiles.js `gameMs < e.enterUntil - W.enterMs`** —
  a retry at a later clock than a fresh boot diverges at the first hostile spawn (frame 42)
  by one frame of wasp motion: FP rounding of "deadline - duration" on the monotonic clock.
  Invisible, but it makes retried bot evidence differ from fresh-boot evidence. Fix: compare
  against a stored start time. Owner: a sim lane.
- **I-??? | bug | S4 | repro: `grep -n nextWaspId src/sim/hostiles.js src/boot/run-reset.js`** —
  `nextWaspId` is never reset by a retry. Identity only (no visible effect); the retry test
  normalizes ids. Owner: a sim lane.
- **I-??? | bug | S3 | repro: `node tools/orch/play-gate.mjs --only selftest --views portrait` | evidence: K5** —
  `?selftest=1` fails "view resolved and portrait pullback applied" at 390x844: its expected
  camera depth predates `render/camera.js` `PORTRAIT_SAFE`. The selftest never ran at a phone
  viewport before. Owner: T-107 (camera).
- **I-??? | bug | S3 | repro: play-gate boot step | evidence: K1-K4** — on a phone the title
  clips ("HULLBREAK", 450 px in 343 at 390x844), the title and failsafe panel tell a touch
  player to press keys, the four `<link rel=preload>` images are fetched twice (crossorigin
  mismatch). Owner: T-105.
- **I-??? | harness | S3 | evidence: play-gate boot REPORT lines** — at boot on this host the
  art misses its budget: phones 13 ready / 20 timeout at load ~40 (33/33 at load ~27-42 in
  other runs), desktop 0/33 (2.5 s budget). HUD coverage 7.0-8.7 % desktop, 14.0 % at 844x390
  (385 cells inside the central 60 % x 60 %), 12.7-16.4 % at 390x844 — T-105 owns the bound.
- **I-??? | test-gap | S3** — the hull shimmer (I-049) is guarded by nothing automatic since
  `t-057-hull-shimmer`'s regexes went (they would have passed a shimmering build): a DEEP
  temporal-flicker metric over `tools/playtest/hulltex-shimmer.mjs` captures.
- **I-??? | test-gap | S3** — the view-registry half of the deleted `tools/boot-registry-check.mjs`
  (13 views in order, juice before action paint) has no behavioural replacement: a PLAY probe
  that every registered view draws.
- **I-??? | test-gap | S3** — three evasions are still green: M23 (a fault storm halts instead
  of restarting), M33 (a catwalk's last half tile stops being solid — T-201's fence), M35 (a
  resumed tab advances the whole gap). Each needs a behaviour test before its pin goes.

## 7. Deferred, by lane

| waits for | what | why |
|---|---|---|
| **T-121** (in flight) | the 53 DELETE-WITH-FEATURE sites (hook v1 / zip corner, incl. T-102's three `?zip=1` lines), `g1-1-render-only-proved-sim`, the snap-hook flow section | fence: they go with the code |
| **T-201** (in flight) | sites in wave gate / scroll / waves / encounters, `future-facet-render-ownership` ~:64, `catwalk-built-prefix-visibility` ~:52 (M25 refactor false alarm, M33 evasion) | fence |
| **T-107** (in flight) | camera / atmosphere / ascent / view-scale / portrait sites (`view-scale-experiment`, pathcheck-suite's portrait pins incl. the `split` 1.15 / 24-30 tiles conjuncts); K5 | fence |
| **T-103 / T-109** (in flight) | `t-040-rig-sprite` (:110/:111, M31 green), `gilded-chassis`, `t-103-rig-grip-alignment`, tools/art | fence |
| **T-105** (in flight) | K1-K4 fixes, then their KNOWN entries go; the real HUD bound — until T-105 sets it in `play-gate.mjs` (`HUD_CEILING`), the gate holds the HUD to the largest reading on main + 5 points, so a deliberately larger HUD must change that line | owner |
| T-120, next batches | the 360 DELETE sites, in (domain, label) batches, fenced ones skipped — the largest: world-transitions 52 (a SHARED producer: delete the `ok()` lines, keep the values later domains read), pathcheck-suite 23, t-013-game-shell 19, t-052-hull-texture 18, crown-command-architecture 15, g2-neck-access-plate-flip-gate 14, limb-silhouette-production 14, t-039-contact-shadows 13; the 176 REWRITE pins in priority order: pathcheck-suite-2's 28 (the T-032 wiring pins: keys, freeze watchdog, frame-loop fault handling — M22 false alarm, M23/M35 evasions), `mod-route-visibility` (needs the departed-face half of `ownership`), `hostile-presenter-contract` (move its registry unit test first), t-049-hostile-sprites 18 | no fence; each REWRITE needs its replacement red on a property mutant first |
| T-120, harness | DEEP harness self-tests carrying t-018/t-027's intent before those pins go; a PLAY-deep `touch` step running T-101's `touch-proof.mjs` | not started |

## 8. Worktree, branch, next action

- Worktree `/home/user/hullbreaker/.claude/worktrees/T-120`, branch `task/T-120`, head: see
  `git log -1 task/T-120`. Not merged; tree clean; no server left running (8780-8782 used).
- **Single best next action:** run reviewer + playtester on `task/T-120` and merge this
  checkpoint (`tools/orch/merge-task.sh T-120`). The T-120 merge itself is judged by main's
  current merge-task.sh (pathcheck in the worktree — which is now this branch's CORE tier,
  ~380 s at load ~40 because T-102's matrix runs in full — the old smoke step, post-merge
  pathcheck); every merge after it gets the PLAY gate (43 min at load ~40, smoke included)
  instead of the smoke-only step and the `--skip-smoke` policy. Then continue the deletion
  batches (§7).
