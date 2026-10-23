# T-120 — rebuild the test gate (checkpoint 1, then fix round 1)

**Fix round 1 is §9** — it answers `review.md` (REQUEST_CHANGES) and `playtest.md` (S2) on
`7064c00` item by item, and supersedes §1's per-edit numbers and §5's server pin. §1-§8 are
the checkpoint-1 record as it was handed back.

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

## 9. Fix round 1 (review REQUEST_CHANGES and playtest S2 on 7064c00)

Code head **`f35d9e6`** on `task/T-120`; the branch head is the commit that adds this section
on top of it. Commits: `231bd3a` (step 0: main with T-103), `1c7da23` (PLAY gate: B1, I-C, B2,
P2, I-E), `1118da3` (the headless gate's own rules: B3, I-D, the determinism ban, census and
sample tooling), `106b887` (P1: the per-edit budget; the retry test widened; the census
re-locked), `489f399` (B1 follow-up: degrade liveness over five frame times, crawls judged on
average rates), `c8d1c0c` (main merged again: T-201, the race pass; its domain classified),
`5ad79dc` (PLAY degrade boots against its budget), `00c4a82`, `3720674` and `f35d9e6` (the
per-edit budget after T-201: its per-edit race runs trimmed, one no-fire run per edit, 150-frame
T-120 windows), then this report. Not merged; tree clean. This section supersedes §1's
per-edit numbers and §5's description of the server pin.

Host: the same 4-core container, no GPU. 1-minute load **39-96** through this round: five
other lanes (T-105, T-107, T-123, T-124, and the T-121 and T-201 playtest gates) ran
throughout. CPU-seconds below are `bash time` user+sys over the whole waited-for process
tree. Every falsifier ran on a scratch copy (`src`, `index.html`, `tools`; the worktree was
never mutated) with the tree's own gate.

Evidence: `reports/tasks/T-120/evidence/fix-round-1/` — `p1-cpu-and-hook.txt` (CPU-s, hook
runs, final verification), `t102-fast-falsify.txt` and `t102-prefix-twins.txt`,
`retry-owner-sweep-per-edit.json` (all 31 owners + a control, final code),
`retry-owner-sweep-10-both-tiers.json` (the reviewer's ten green owners in both tiers, run
while the per-edit prefix was still 10 s) and `retry-corner-events-both-tiers.json`,
`determinism-falsifiers.json`, `b3-falsifiers.json`, `gate-rule-falsifiers.json`,
`b1-slow-degrade-*.log`, `b2-perf-tree-trace.txt`, `p2-pin-tree-probe.log`, the PLAY runs
`play-degrade-failsafe-1c7da23.log`, `play-degrade-489f399.log` (the load-event FAIL fixed in
`5ad79dc`) and `play-degrade-failsafe-head.log`; after the T-201 merge, `p1-merged.txt` (CPU-s,
hook runs, T-201's per-run costs, both trims), `t102-fast-falsify-merged.txt`,
`t102-fast-falsify-head.txt` (four per-edit runs), `t102-prefix-twins-merged.txt`,
`t120-150-frame-window-falsifiers.json` and `final-verification-head.txt`.

### 9.1 Step 0, twice

`git merge main` -> `231bd3a` (T-103). `manifest.mjs`: T-103's domains keep d79/d80 as main
numbered them; T-103's two domains are classified in the spec (CORE-GATE, default CORE;
negative controls and harness-fidelity lines PURE-INVARIANT; 25 new sites) and tiered
(INDEPENDENT; `COST_MS` 950 / 60). Lock 2121 -> 2146.

**Then main took T-201 (the race pass, `b8d1b81`; main `71d3941`), and at the integrator's
request the branch merged it again before this report: `c8d1c0c`.** Conflicts, resolved
keeping T-201's assertions intact (entry 21): `manifest.mjs` (T-201's `t-201-race-pass` keeps
d81, d82 is left free for T-105, which takes it next, T-120's seven domains are d83-d89);
`t-102-corner-turns.mjs` (T-201's never-wait families, its new matrix rows — no-fire,
`?gates=legacy`, `?hinge=flow` — its fifth per-edit run and its played checks are kept; the
per-edit corner prefixes cover the new runs too, and the paced-gunner and no-fire count checks
count only the corners a prefix plays, which is why D2's successor plays three corners: the
label's "three" holds in both tiers; T-201's no-fire turn run was a five-corner prefix for the
same reason until `3720674` moved it to the full tier, §9.3);
`tools/simlab/TURNLAB.md`. **I-121 folded in**: `run()` asserts both `?hinge=flow` rows stay
planned, in both tiers (the stall binding is silent without them). Census after the merge:
`rekey-ranges.mjs` moved 34 ranges and removed one; the 11 SITES entries whose sites T-201
deleted with the zipper (entry 25) are gone; `t-201-race-pass` has its spec (CORE-GATE,
default CORE; `pureChecks()` PURE-INVARIANT; its three source reads by label: the
camera/sim hand-off twin CORE, the lead-derivation and no-zipper regexes PIN kept until a
replacement is shown red); 13 other T-201 sites that the source-text rule misfiled get label
entries mirroring the sites they replaced. 0 mechanical decisions; lock 2172 -> **2217**;
`test-census --check` exits 0.

### 9.2 Blocking

| item | before (7064c00) | after | falsifier: red without the fix |
|---|---|---|---|
| **B1** slow degrade | a run still advancing at the budget returned before any check: one REPORT "INCONCLUSIVE … nothing compared"; page errors, the failure panel and the aborted-art count were never read | `tools/orch/lib/degrade-verdicts.mjs` (pure; play-gate.mjs fills the records). Page errors, the failsafe verdict and the aborted-art check are read on **both runs whatever their speed**; a run whose tick did not move for five of its own average frame times (20 s to 2 min; one SwiftShader frame can take 10-20 s here) is WEDGED (FAIL); the art-blocked run averaging under 25 % of the art run's tick rate (boot to budget, both runs in parallel) CRAWLS (FAIL), whether or not the art run finished; the sim is compared at the terminal tick or at the furthest common checkpoint (every 50 ticks, sampled in the page each rendered frame). Only that comparison can be INCONCLUSIVE, and only when the lagging run reached no checkpoint (or the art run had no art ready by then) | real browser, both runs slow on purpose (60 s budget, 38/300 ticks, load 52-79): a tree whose missing-art path throws -> **FAIL** "art-blocked run: no page error" + **FAIL** failsafe fault; a tree that raises the crash panel -> **FAIL** "no failure panel, fault or halt" — the comparison INCONCLUSIVE in both. 15 verdict fixtures (incl. those two, two crawls, one long frame that is not a crawl, wedge, GPU host, no art ready); the 7064c00 rule restored -> 8 fixtures red; "any progress is slow" -> the crawl fixture red; a crawl judged only when the art run finished -> the neither-finished crawl red; a crawl read off the 20 s probe window -> the long-frame fixture red |
| **I-C** inconclusive re-run | — | merge-task.sh greps `^play-gate REPORT degrade .*INCONCLUSIVE`, re-runs `--only degrade` once at 2.5x the budget (`HB_PLAY_DEGRADE_BUDGET_MS`), prints it in a banner and writes the outcome into the merge commit ("PLAY gate (recorded, not hidden): …") | every degrade fixture's verdict lines, printed as play-gate prints them, through that grep: exactly the two INCONCLUSIVE outcomes re-run; a FAIL never reaches it (the gate already failed) |
| **B2** perf tree | on a GPU host perf ran `<--root>/tools/pathcheck.mjs --tier play` in `--root` = main | `--tree` (merge-task.sh passes `--root <main> --tree <worktree>`): perf runs the tree under test's own `pathcheck --tier play` with cwd = that tree, and the in-process server (no `--base-url`) serves it | stub trees whose `tools/pathcheck.mjs` prints where it runs, GPU-host path: new gate -> `B2-STUB tree: cwd=<tree> script=<tree>/tools/pathcheck.mjs args=--tier play`; the 7064c00 gate, as merge-task called it -> `B2-STUB root` (the defect). `HB_PLAY_PERF_DRY=1` with the merge shape prints `node /home/user/hullbreaker/.claude/worktrees/T-120/tools/pathcheck.mjs --tier play (cwd /home/user/hullbreaker/.claude/worktrees/T-120)` |
| **B3** selector checker | the executed half of `enemy-ecology-render-check` and the `makeResetRegistry` unit test were deleted with their pins | `tools/pathcheck/enemy-ecology-selector.mjs` (CORE, lane): spec/manifest hashes, variant count and identities, the condensation boundary, per-variant ids/columns/packing/fit, locomotion and flight articulation, 19 selector rows (one added: the plain mortar fuse), code 63 — 31 assertions. The registry tests are back in `t-120-retry-replays-the-run.mjs` (order + snapshot, a duplicate id refused, a failing owner named, no reentrancy) | rebound tell shows the EARLY frame -> **RED** "rebound tell shows body 2 / action 2 (got 2 / 3)"; a condensing body one frame late -> **RED**; the mortar fuse showing COMMIT -> **RED** "mortar fuse tell shows body 2 / action 2 (got 3 / 2)" (green before the new row); the registry accepting a duplicate id -> **RED** |

### 9.3 Playtest S2

**P2 / I-B — the pin proves itself.** `tools/orch/lib/pin-tree.sh`: port 0 by default (the
kernel picks a free one), the bound port read back from serve.mjs's banner, the banner's
root must resolve to the worktree, the pid must be alive (`kill -0`) before and after the
checks, and `/index.html` must be byte-equal to the worktree's. merge-task.sh step 6 uses
it (`HB_PLAY_PORT` pins a fixed port, still proven). Falsifier `tools/orch/pin-tree-probe.sh
<tree> <other-tree> 8808`: (1) ephemeral pin OK and answering; (2) another tree's server
squatting on :8808 -> **REFUSED** ("pin-tree: the server for <tree> exited before it was
ready: port 8808 is already in use"); (3) control: the old any-200 readiness loop reports
ready against that squatter — the defect was visible to the probe.

**P1 / I-A — the per-edit budget.** Currency: CPU-seconds, `HB_GATE_FAST=1 node
tools/pathcheck.mjs`, the same `src/` (this branch does not touch `src/`), interleaved with
main's tools on a `git archive` of main:

| | old gate (main's tools) | this tier |
|---|---|---|
| playtest, at 7064c00 | 20.8-21.7 (main @ fc0724d) | 28.0-28.4 |
| this round, before the t-102 cut | 23.3-24.6 (main now carries T-103's domains) | 25.0-27.7 |
| this round, before the T-201 merge (`489f399`) | **24.9, 24.6** (load 66-94) | **21.5** (load 86-89); 20.9, 20.0 (load 53-94) just before the retry test's per-edit prefix went from 10 to 20 s (+0.2 CPU-s, measured) |
| after merging T-201 (`c8d1c0c`) | 37.5, 37.4 (load 70-89) | 34.8, 35.1 (load 72-89) |
| T-201's per-edit race runs trimmed (`00c4a82`) | 38.2 (load 64-68) | 25.9, 25.9 (load 63-73) |
| **head: one no-fire run per edit, 150-frame T-120 windows (`3720674`, `f35d9e6`)** | (as above) | **24.2, 23.8** (load 60-71) |

The real hook (`.claude/hooks/check-changed.sh`, unmodified, on a payload naming this
worktree's `src/main.js`): before the t-102 cut 117.5 s, **killed at 120 s**, 95.9 s (load
42-60; the playtester: killed 3 of 6 at load 49-70); **after it, before the T-201 merge: 79.3,
78.1, 82.5 s, exit 0 all three, at load 46-58** — 37-42 s of margin (measured before the retry
prefix grew by its 0.2 CPU-s, ~1 % of the tier). **After merging T-201: killed at 120 s twice
(load 72-83)** — T-201 merged with a per-edit tier of 3 min 19 s by its own measurement at load
50-90. **After trimming T-201's per-edit runs (`00c4a82`): still killed at 120 s, three of three at
load 63-65** (the tier took 141-169 s at that load). **At the head (`f35d9e6`): 96.2, 100.7, 100.8 s, exit 0 all three, at load 44-60** — 19-24 s
of margin, and per-edit CPU-s 37 % under main's gate on the same `src/`. What moved (cost, not coverage —
every hard-rule guard still runs in the per-edit tier: the layer and determinism prelude,
CONFIG's frozen constants, entry 3's reveal rule; every assertion still runs at merge):
- **t-102-corner-turns** was 8.3 of ~25 CPU-s (its four whole six-corner runs). Each per-edit
  run now plays only through the corner in `FAST_SUBSET`'s last column, using turn-proof's
  own `stopAfterCorner`, capped at a minute of game time per corner: the domain alone (static
  checks included, `--only`, serial) **10.0 -> 4.1 CPU-s** before the merge (4.8 with T-201's
  fifth run). Falsified with T-102's own `turnlab-falsify.mjs --fast-domain`: before the
  merge P1 red (corner 1's relocation, tick 1155), P3 red (corner 1's approach, tick 1334), P2
  **green at two corners** — the gate-blind defect bit only at corner 3's gate on 390x844 — so
  D2 played three: red (TICK_CAP at 2/6). **On the merged tree** (rolling corners by default,
  held gates only on `?gates=legacy`, five per-edit runs: D1, D3 and the plain run two corners,
  D2's successor three for its three moving encounters, the no-fire run five for its five
  staged sides): P1, P3, N1, N8, N2, N3, N4, N6 **all red**; P2 green — its held gate now
  lives on the escape hatch, which the per-edit tier never played (T-201's choice: no `?query`
  runs per edit); the full tier plays it. Each prefix is its full-matrix twin up to the stop:
  per-corner records identical for every corner before the last, and the last corner's
  record differs only in counters the twin keeps adding after the stop (paced @390x844:
  `encounterKills` 3 vs 4 — a corner-3 body killed on the next side; no-fire @844x390:
  `carried` / `carriedEntered` 0 vs 4 — followers re-entering after the turn); no violation in
  either before the stop.
- **t-201-race-pass** (T-201, merged mid-round) was 14.2 of the merged tier's ~35 CPU-s.
  Measured per run, alone, on top of the domain's 3.0 CPU-s of pure checks and shared
  producers: oracle 1.4 each, skip (no-fire) 1.3, the floor-promise pair 3.7 + 3.0. `00c4a82`
  keeps the operator's frame (oracle @ phone-landscape-6pct, the box assertions) and the
  no-fire run per edit; the desktop oracle run and the floor pair move to the merge gate's
  full set (22 runs, every T-201 assertion unchanged — entry 21). `3720674` then plays T-201's
  no-fire turn run (`gunnerMode: 'none'` @844x390 in t-102, ~1.7 CPU-s) in the full tier only:
  t-201-race-pass plays its own no-fire run at 844x390 per edit (NO SOFTLOCK — every corner
  taken —, NEVER-WAIT, BEATS, PRESSURE), and the t-102 per-edit falsifier rows bind without it
  (re-run with the four runs: P1, P3, N1, N2, N3, N4, N6, N8 all red). **Both trims change
  another lane's reviewed per-edit choice; each is one commit, and reverting `00c4a82` and
  `3720674` restores T-201's selection.**
- **the T-120 driven tests compare 150 frames per edit** (`f35d9e6`; 300 before, 600 at
  merge): the first spawn (frame 42) and dive (96) are inside, and every red mutant of both
  tests diverges by frame 96 — re-run at 150: the dead input-keys, pace (M45), spawner,
  hostile-rng (M34, frame 42) and hit-stop owners, M05c (frame 96) and M10 (frame 42) all red,
  both controls green.
- the three T-120 driven tests: forgiveness at 60 Hz only per edit (120/30 Hz at merge), one
  child for both scenarios; determinism with two children (the third twin only to tell a
  failure apart); retry with the report-only later clock skipped; both compare fewer frames
  per edit (see above). Each prints one SKIP line.
- lanes: past a 1-minute load of 12 per core no lanes start (measured: at load 60-85 the serial
  run was no slower, 151-215 s against 195-200 s, and the lanes only added 2-4 CPU-s of
  duplicated module loading); the tally line says so. Lane processes skip the prelude guards
  their runner already ran.
- **a killed run is reported**, but only to readers of later runs: every later run in the same
  tree prints `pathcheck: WARNING — N earlier run(s) in this tree never finished …` at its
  start and above the tally, until a full CORE run (the merge gate) finishes there. Measured:
  a run SIGKILLed after start -> every later `HB_GATE_FAST=1` run warned (the next two, and the
  per-edit run in §9.6); the `--deep` run in §9.6 said "this full run re-checks the tree and
  clears the report", and the marker was gone after it. **The hook
  itself still swallows a kill** (it exits 0 on 137 and its stderr note never reaches the
  agent); that needs a `.claude` change I may not make — proposal in §9.5.
- `t-042-audio-punch` (the playtester's other lever) is **not** subset: alone it is 1.1 CPU-s
  over six fresh children that each guard a different behaviour (load scaling, voice cap,
  lance strike, combat duck, pressure curve, damage weight); the budget is met without it.

### 9.4 Non-blocking

- **I-D, external kills** (`tools/pathcheck/lib/spawn.mjs`): a child killed by SIGTERM, SIGHUP or
  SIGINT that is not our own timeout is run again once, printed (`pathcheck note: child … was
  killed by SIGTERM from outside the gate — running it again once (external kills so far:
  N)`) and counted; twice is a FAIL. Our own timeout (SIGKILL) is never re-run. Self-tests
  (DEEP, `t-120-gate-self-tests`): once -> re-run and counted; always -> "killed from outside
  twice"; `timeoutMs: 1` -> "timed out", not counted. Retry removed -> all three red. Scope:
  children started through spawn.mjs (the T-120 tests); t-102's, t-042's, t-201's and
  pathcheck-suite's children still FAIL on an outside kill — loudly.
- **`test-census --check` is read-only**: it writes `test-audit.json` only without `--check` or
  with `--write-lock`, and otherwise reports "tools/orch/test-audit.json is stale".
- **I-G, the hook filter: not fixed** — `.claude/hooks/check-changed.sh` is configuration this
  lane must not change. Proposal in §9.5.
- **I-H**: `mutation-sample.mjs` removes its scratch trees on exit and on SIGINT/SIGTERM/SIGHUP
  (`--keep-trees` keeps them).
- **Freeze-panel leniency on a fake page** (`tools/orch/lib/failsafe-check.mjs`): 9 fixtures,
  one per branch — healthy PASS; GPU-less frozen panel over a live loop after a 9 s frame
  REPORT; the loop stays stopped FAIL; no frame as long as the bound FAIL; GPU host FAIL;
  fault FAIL; halt FAIL; crash panel FAIL; a fault without a panel FAIL. Liveness check removed
  -> the stopped-loop fixture red. play-gate.mjs runs these and the 15 degrade fixtures at
  start-up and refuses (exit 3) if one fails; `--self-test` prints them.
- **The retry test, 12 -> 18 of 31 owners** (every `RUN_RESET_REGISTRY` row replaced by a
  no-op, this test alone, per-edit tier; review finding 5). The dirty prefix now also picks up
  SPREAD and kills one hostile through the sim's own death path on its last frame (arming the
  kill's 42 ms hit-stop), turns CHRONO on and holds a key into the retry; the state compared
  gains the modifiers, the held keys and the per-weapon kills; the prefix is 20 s in both tiers
  (a 10 s one never reached the first gate: `corner-events` read green per edit).
  Red now: input-keys, hostiles, projectiles, capsules, starter-weapon, weapon-kills,
  modifiers, scroll, pace, score, spawner, hostile-rng, kill-count, shot-count, player,
  corner-events, hit-stop, slice-stats. Still green, and why: four render rows stubbed by
  design (corpses, projectile-tracers, camera-yaw, juice-presentation), five fixtures or
  prototypes inert in the default run (slice-retry, hook-input, hook, flow, transform), four
  live owners the first 20 s never reach (carrier-drops, meridian-defense, finale,
  future-faces). The same list is in the test's header; the control (no mutation) is green.
  Mutants M47-M52 (`tools/orch/mutants.mjs`, domain-scoped) record the six new ones.
  Drift guard (review finding 6): a sim call main.js's `update()` or `resetGame()` gains that
  the replica does not transcribe now fails (mutant: red).
- **The determinism ban** (`_context.mjs`): bracket access `Math['random']` / `Date["now"]` is
  read now (M05b: a prelude kill, "nondeterministic call in sim module …: Math['random']").
  An alias (`const R = Math; R.random()`, M05c) is invisible to any regex: the cross-process
  twins catch it, red at frame 96 in both tiers. Timers are not banned: `src/sim/player.js:648`
  keeps a pre-existing wall-clock `setTimeout` (§9.5).
- **I-E docs**: `tools/orch/PLAY-GATE.md` (runbook: commands, reading a result, the two GPU-less
  leniencies, what to do on each failure); `play-gate.mjs --help` and `pathcheck.mjs --help`
  print their usage instead of starting a run; ORCHESTRATION.md no longer says merge-task pins
  with `python3 -m http.server`; `tools/playtest/README.md` names the smoke trio including
  `default-url-smoke.json`; `tools/pathcheck/README.md` documents the CPU budget, killed-run
  reports and external kills; `tools/simlab/TURNLAB.md` the corner prefixes.

### 9.5 Inbox items from main, and proposed inbox issues (new this round)

- **I-121 — folded in** (`c8d1c0c`): `run()` asserts both `?hinge=flow` rows stay planned
  ("T-201: the full matrix still plans both ?hinge=flow rows"), in both tiers.
- **I-115 — not folded in; answer.** The envelope family would read the damage plane's crush
  pin under god mode (`src/sim/player.js`: RIG put at the wall's outside face, a tile at a
  time) as a teleport. No run of either tier produces it today (T-201 fixed the policy that
  fell into face 4's pocket pit), so there is no live false FAIL, and a fix is not cheap to
  prove: it needs a run that reaches the pin on purpose (T-201's old gap reflex replayed into
  that pit) to show the exemption fires there and nowhere else. Proposed fix: in
  `tools/simlab/lib/turn-proof.mjs`, treat a tick on which RIG took the pin's 1 hp at the
  wall face (`x + hw` one millimetre short of a column boundary, the plane's left edge on
  RIG) as a designed relocation, like a respawn; falsify both ways. Owner: whoever next
  touches the turn lab.

- **I-??? | config | S3 | repro: `printf '{"tool_input":{"file_path":"<wt>/tools/pathcheck/_tiers.mjs"}}' | .claude/hooks/check-changed.sh`** —
  (I-G) edits to the gate's own domains and to `index.html` run nothing per edit. Proposed
  filter: `*/src/*|*/index.html|*/tools/pathcheck.mjs|*/tools/pathcheck/*.mjs)` (a case `*`
  matches `/`, so `lib/` is covered). For `*/tools/orch/*.mjs` the useful per-edit check is not
  pathcheck but `node tools/orch/play-gate.mjs --self-test && node tools/orch/test-census.mjs
  --check` (seconds). Budget: the per-edit tier is ~24 CPU-s with T-201 merged (§9.3).
- **I-??? | config | S3 | repro: a hook run past 120 s** — the hook exits 0 on its own kill
  (137) and its note goes to stderr, which the agent never sees, so an unchecked edit reads as
  a clean one. Options for the integrator: exit 2 with an honest "not checked — not a failure
  of your edit" message, or raise `PATHCHECK_TIMEOUT_S` and the hook timeout in
  `.claude/settings.json` (the hook is async). pathcheck's own report (§9.3) reaches only
  readers of later runs.
- **I-??? | bug | S4 | repro: `grep -n setTimeout src/sim/player.js`** — line 648 schedules the
  `?slice=traversal` auto-retry with a 650 ms wall-clock `setTimeout`, so under `?fixeddt` (bots,
  harness) the retry lands on a host-dependent tick. Fix: a `gameMs` deadline checked in the
  player update. Owner: a sim lane. Not banned in the prelude because the ban would fail here.
- **I-??? | harness | S4 | repro: name a loop index `i` in `tools/pathcheck/t-102-corner-turns.mjs` and run `node tools/orch/test-census.mjs --check`** —
  the census's source-text rule (`tools/orch/lib/features.mjs fileTextVars`) taints variables
  by NAME across a whole file: a callback parameter named like an earlier text variable
  re-filed seven locked t-102 sites, and filed the two new ones, as PIN. `--check` caught it
  as "verdict drift" (that is its job); renamed here. Scoping the taint to declarations would
  remove the class.
- **I-??? | harness | S3 | repro: `node tools/orch/play-gate.mjs --only degrade` at load ~80 @ 489f399 | evidence: evidence/fix-round-1/play-degrade-489f399.log** —
  the degrade step navigated with `waitUntil: 'load'`, which waits for every art file; at
  load ~83 the art run's load event missed `BOOT_MS` (180 s) and the step FAILED "both runs
  could be read" before any check. **Fixed here** (`5ad79dc`): it navigates to `'commit'` like
  the boot, failsafe and ownership steps, so booting counts against the degrade budget. The
  `?selftest=1` step still navigates with `'load'`: the same class under load, not changed
  here.
- **I-??? | harness | S3** — with T-201 merged the per-edit tier is ~24 CPU-s here even after
  this round's trims (§9.3): the hook's 120 s holds at load 44-60 (96-101 s) and not at 63-65;
  every played proof a lane adds per edit moves that line down. The audit's rule could be
  written down: a per-edit run must be the cheapest run that binds its lane's fixed defect,
  measured in CPU-s on this host, and the lane's report says so.
- **I-??? | harness | S4** — the retry test still cannot see four live owners the first 20 s of
  the default run never touch: `carrier-drops` (no carrier killed), `meridian-defense` (not yet
  active), `finale`, `future-faces` (no corner built). A second scenario that plays through the
  first corner's turn would cover `future-faces`; the other three need state the default run
  reaches minutes later.

### 9.6 Verification on the head

On the code head `f35d9e6` (main with T-201 merged, every fix-round change; `src/` identical to
main's):

- `HB_GATE_FAST=1 node tools/pathcheck.mjs`: **3911 passed, 0 failed**, 24.2 / 23.8 CPU-s (152-159 s at load
  60-71, no lanes; 96-101 s inside the real hook at load 44-60, §9.3); five SKIP lines (t-102 46 of
  50 runs and its prefixes, t-201 20 of 22, the three T-120 tests' rates and windows), and the
  killed-run WARNING for the five hook runs killed while the tier was still too slow
- `node tools/pathcheck.mjs --deep` (CORE + DEEP, `HB_GATE_FAST` unset: T-102's 50 whole runs,
  T-201's 22 race runs, the full T-120 windows, the gate self-tests): **4656 passed, 0 failed**, 708.8 s wall and 185.5 CPU-s at load
  49-69, no lanes. It opened and closed with `pathcheck: WARNING — 5 earlier run(s) in this tree
  never finished …; this full run re-checks the tree and clears the report`: the five real hook
  runs the watchdog killed during the measurements above; their markers were gone after it
- `HB_GATE_FAST=1 node tools/pathcheck.mjs --check-lanes`: **57 same, 0 different** (every INDEPENDENT domain alone gives
  its count in the serial `--tier all` reference; enemy-ecology-selector and both T-103 domains
  included; t-201-race-pass runs in the main process), 231 s at load 39-69
- `node tools/orch/test-census.mjs --check`: exit 0, 2217 sites locked, 0 mechanical decisions.
- `node tools/orch/play-gate.mjs --self-test`: **24 of 24** verdict fixtures hold (15 degrade, 9 failsafe)
- PLAY `--only degrade,failsafe` on the worktree pinned by pin-tree.sh on :8808: **18 passed, 0 failed, 8 known, 1 reported
  in 778 s** (load 38-57). failsafe: all 12 forced failures (throw, rejected promise, 404, never
  arrives, at three viewports) put the panel on screen; the 8 KNOWN are K3 (the coarse-pointer
  panel copy, T-105). degrade: the five safety checks PASS on both runs; the schedule did not
  finish in 720 s (art run 180/300 at 0.24 ticks/s, art-blocked run 193/300 at 0.26, both
  advancing: REPORT, not a crawl), and the sim was compared at tick 150, the furthest both
  reached — **PASS, identical with 41 art surfaces ready and with none**

Before the T-201 merge the same set was green on `14bd8d8`/`106b887`/`489f399`: per-edit 3871
passed (21.5 CPU-s at load 86-89, no lanes, the killed-run WARNING from the SIGKILL test at the
start and above the tally); `--deep` 4490 passed in 791.8 s (116.6 CPU-s) — it printed "this
full run re-checks the tree and clears the report", and the marker was gone after it;
`--check-lanes` 57 same, 0 different; PLAY degrade + failsafe on `1c7da23`: 18 passed, 0 failed,
8 known, 1 reported in 800 s at load 46-88 — failsafe: all 12 forced failures (throw, rejected
promise, 404, never arrives, three viewports) put the panel on screen, the 8 KNOWN are K3 (the
coarse-pointer panel copy, T-105); degrade: the five safety checks PASS on both runs, the
schedule did not finish in 720 s (art run 111/300, art-blocked run 200/300, both advancing:
REPORT) and the sim was compared at tick 100, the furthest both reached — **PASS, identical
with 41 art surfaces ready and with none** (under the 7064c00 rule that run said only
"INCONCLUSIVE … nothing compared"). A re-run on `489f399` at load ~83 FAILED before any check
(the art run's load event missed 180 s) — the defect `5ad79dc` fixes (§9.5).

### 9.7 Next

**Main moved again after the merge of `71d3941`: T-105 merged (`7ecb1c4`).** Not merged here (the
request was main at `71d3941`). The next merge of main: take T-105's
`import * as d82 from './t-105-phone-shell.mjs'` (and its `d82,` row) in place of the
"d82: kept free for T-105" comment — T-120's numbers do not change; classify
`t-105-phone-shell` (26 sites, pure and static, no child processes) and T-105's
`touch-deck-contract` edits in the census; re-check the PLAY gate's KNOWN entries K1-K4 and
`HUD_CEILING`, which T-105 owns and may have fixed or set (the gate prints "tracked defect … was
not observed" for a fixed one), and the freeze-panel fixtures against T-105's new failsafe
policy (a 6 s stall before the first frames no longer raises the panel); re-measure the
per-edit tier with T-105's domain.

The checkpoint plan's remaining deletion and rewrite batches (§7) are **not started** this
round: they wait for this round's verdicts, and the domains of the lanes still in flight stay
fenced (T-107, T-123, T-124; T-201 and T-105 merged during this round). Single best next
action: reviewer + playtester on the head of `task/T-120` (this report's commit, on top of code
head `f35d9e6`).
