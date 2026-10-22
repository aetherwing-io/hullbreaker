# T-108 — what the test suite actually protects, and a lean gate (2026-10)

Lane T-108 (harness), branch `task/T-108` off `main` 38d0409. Answers
`decisions.md` entry 21 — *"the tests may be misleading or not valuable too,
i had no idea what i was doing"* — with measurements, not opinions. Nothing in
`src/`, `tools/pathcheck/` or any check was changed; every tool written for
this audit lives under `tools/orch/` and has zero effect on the game or the gate.

## Executive summary

1. **Valuable in part — one call site in eight.** 241 of 2,049 (12 %) are CORE: they drive the real sim or guard a hard rule, and 8 of the 12 CORE-aimed property mutants turned the gate red. Keep them as they are.
2. **A quarter is noise that costs.** 508 sites (25 %) are plain PINs, RETIRED or TAUTOLOGY, and 139 more are PINs standing in for a real property. PIN-guarded bugs: 0 of 5 went red; harmless refactors: 4 of 4 did.
3. **Blind to what the operator named.** No gate caught, or could have caught, any of the 6 entry-20 or 5 integrator mobile defects (all 5 reproductions stay green); one assertion *requires* the touch-copy bug.
4. **Cost.** One browser domain is 89–93 % of a 325–338 s gate run; it timed out both times and three of its assertions still passed on a stale file. The other 76 domains take 24–36 s; a merge costs ≈ 20 min here (§6).
5. **Do this, after wave 1 merges (§7.6):** a headless CORE gate of ≈ 30 s (196 CORE + 738 invariant sites + a `Math.random`/`Date.now` ban), a real-browser PLAY gate on the default URL at desktop and both phone orientations, and deep suites for fixtures. Delete 508 sites, rewrite 139, add 8 behaviour tests.

## How to reproduce every number

All numbers below come from these committed tools and their committed outputs
(`tools/orch/evidence/`); `tools/orch/test-audit.json` is the machine-readable
copy of this whole document.

| what | command (from the worktree root) | output |
|---|---|---|
| one instrumented full gate run (per-domain wall time, passes, fails) | `node tools/orch/pathcheck-timed.mjs --json tools/orch/evidence/timing-full-run-N.json` | `tools/orch/evidence/timing-full-run-{1,2}.json` (+ `.log`) |
| per-call-site evaluation counts (a patched **scratch copy** of `_context.mjs`) | `node tools/orch/callsite-census.mjs --scratch <empty dir> --out tools/orch/evidence/callsite-counts.json --skip render-submission-contract` | `tools/orch/evidence/callsite-counts.json` |
| every standalone check, timed once | `node tools/orch/standalone-census.mjs --out tools/orch/evidence/standalone-census.json` | `tools/orch/evidence/standalone-census.json` |
| the binding mutation sample | `node tools/orch/mutation-sample.mjs --scratch <empty dir>` (sample defined in `tools/orch/mutants.mjs`; this audit ran it in batches and joined them with `--merge`, the joined file names its batches in `merged`) | `tools/orch/evidence/mutation-results.json` (+ `mutation-results-batch{2,4}.json`) |
| classification join → JSON | `node tools/orch/test-census.mjs --print` (hand classification: `tools/orch/test-audit-spec.mjs`, `tools/orch/standalone-spec.mjs`) | `tools/orch/test-audit.json` |
| the tables in this document | `node tools/orch/audit-tables.mjs [--section classes\|examples\|domains\|mutation\|standalone\|cost\|spotcheck]` | stdout |
| reproducibility re-run of six mutants | `node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M01,M02,M07,M10,M20,M21 --out tools/orch/evidence/mutation-recheck.json` | `tools/orch/evidence/mutation-recheck.json` |
| the default URL at desktop and both phone orientations (title overflow, keyboard copy on touch, failsafe hint, double fetches, console warnings, HUD coverage, boot-budget misses) | `node tools/orch/phone-probe.mjs --out tools/orch/evidence/phone-probe.json` | `tools/orch/evidence/phone-probe.json` |
| merge-gate smoke, one attempt per script | the command line in the header of the output file (`tools/serve.mjs` on :8758, `run.mjs --deterministic`, `smoke-verdict.mjs`) | `tools/orch/evidence/smoke-timing.txt` |
| inventory sizes in §1 | `wc -l tools/pathcheck/*.mjs`; `grep -l "readFileSync\|readdirSync" tools/pathcheck/*.mjs \| wc -l`; `find tools -name "*-check.mjs" -not -path "*/node_modules/*"`; `ls tools/playtest/scripts/*.json tools/playtest/scripts/adversarial/*.json \| wc -l`; `ok`/`near` split and source-text domains from `test-audit.json` → `sites[].fn`, `sites[].srcText` | stdout |

Host: 4-core cloud container, no GPU (SwiftShader), shared with three other
lanes running browsers. Recorded 1-minute load averages: **23.6–31.6** in the
JSONs that record one (`timing-full-run-{1,2}.json`, `callsite-counts.json`)
and **45–60** during the smoke runs (`smoke-timing.txt`); the other runs did not
record it. Every wall-clock number is from that host under that load and will
move on another machine. The red/green outcome of the headless domains and of
every mutant does not depend on load; everything that boots a browser or races
a timeout does (the browser domain, the smoke's navigation timeout, the
standalone checks that timed out), and is called out where it occurs.

## 1. What was audited

| surface | size | run by the merge gate? |
|---|---|---|
| `tools/pathcheck.mjs` + `tools/pathcheck/` | 79 modules (77 domains + `_context.mjs` + `manifest.mjs`), 16,734 lines; **2,049 `ok()`/`near()` call sites** (1,936 `ok`, 113 `near`) that evaluate **3,989 times per run**; 49 of the 79 modules read files from disk; 47 of the 77 domains contain at least one assertion whose condition reads source/file text (387 such call sites) | yes — twice per merge (worktree, then main post-merge), plus the PostToolUse hook after every `src/` edit |
| standalone checks | 35 `*-check.mjs` files (30 directly in `tools/`, 5 in `tools/perf/`, `tools/playtest/`, `tools/vertical-assault/`), plus `tools/assets/check.mjs`, `tools/gatecheck.mjs`, `tools/movement/selftest.mjs`, `tools/deploy/asset-union-selftest.mjs` — **39 surfaces** | 10 of 39, only because a pathcheck `*-contract.mjs` domain spawns them |
| in-page `?selftest=1` | 48 `check()` call sites (some in loops), `src/main.js:873-1135` | no |
| deploy verifiers | `tools/deploy/verify-bundle.mjs`, `tools/deploy/verify-pages-site.mjs` | no (release-time) |
| merge-gate smoke | `tools/playtest/run.mjs` on `scripts/mid-route.json` + `scripts/transform-slice.json`, `--deterministic`, judged by `tools/orch/smoke-verdict.mjs` | yes |
| playtest capture scripts | 58 `tools/playtest/*.mjs` (3 harness, 3 browser checks, 52 capture/stress/probe tools — per file in `test-audit.json` → `standalone.playtestFiles`) and 61 bot scripts (42 in `tools/playtest/scripts/`, 19 in its `adversarial/`) | 2 of 61 scripts (the smoke) |

## 2. Classes (the rubric)

Each pathcheck call site and each other surface got exactly one class. The
rubric is also the header of `tools/orch/test-audit-spec.mjs`.

- **CORE** — the subject is something a player would notice in the build it
  targets, or a hard rule: driven through the real sim (crossable, no
  softlock, no clipping, bullets don't turn corners, determinism, boot) or a
  static check of a hard rule (layer purity, determinism bans, frozen
  movement constants **and their physical reasoning**, the frozen FAR camera,
  `?hook=1` inert, static anatomy, palette tokens, "the sim never branches on
  whether art loaded").
- **PURE-INVARIANT** — a cheap, correct property of pure logic or authored data
  that any reasonable implementation keeps (continuity, clamping, monotonicity,
  schema integrity, fairness arithmetic tying an enemy's tell to the player's
  jump physics). Static reachability of *authored* geometry lands here, because
  CLAUDE.md is explicit that it is not evidence about play.
- **PIN** — the subject is an implementation detail: a regex over source text,
  the order of statements in a function body, a golden hash, an exact count,
  or an exact constant no decision protects. A PIN whose *intent* is a CORE
  property is marked `core` and counted as a **rewrite** candidate, not a plain
  deletion.
- **RETIRED** — guards a superseded design: the dare wager (entries 9/10,
  named in 21), asset independence (16), blanket off-by-default flags (16),
  the keyboard-only device (20 superseded "No touch"), hook v1 (5: inert, no
  further investment), zip-assembly as the world's reveal (3).
- **TAUTOLOGY** — cannot fail, or checks data against itself, against a
  checker's own printed count, or against a stale/foreign result file.
- **SLOW-ENV** — needs a real browser or wall-clock timing; its verdict moves
  with host load.

Scope is recorded separately from class: **shipped** (the default URL a player
gets) vs **flag** (an opt-in fixture or prototype: `?slice=traversal`,
`?slice=transform`, `?g2=1`, `?ribrun=1`, `?pace=`, `?hook=1`, `?flow=1`, trial
stages) vs **harness** (self-tests of the playtest instrument).

## 3. Classification results

### 3.1 pathcheck, by class (`node tools/orch/audit-tables.mjs --section classes`)

| class | call sites | % sites | evaluations/run | % evals | shipped sites | flag-only sites | harness sites |
|---|---:|---:|---:|---:|---:|---:|---:|
| CORE | 241 | 11.8% | 757 | 19.0% | 196 | 45 | 0 |
| PURE-INVARIANT | 1160 | 56.6% | 2382 | 59.7% | 738 | 358 | 64 |
| PIN | 572 | 27.9% | 753 | 18.9% | 455 | 85 | 32 |
| RETIRED | 59 | 2.9% | 59 | 1.5% | 6 | 53 | 0 |
| TAUTOLOGY | 16 | 0.8% | 37 | 0.9% | 16 | 0 | 0 |
| SLOW-ENV | 1 | 0.0% | 1 | 0.0% | 1 | 0 | 0 |
| **total** | **2049** | | **3989** | | 1412 | 541 | 96 |

PIN detail: 330 of 572 PIN sites read source/file text; 139 PIN/TAUTOLOGY sites carry a CORE intent (REWRITE candidates).
Resolution: 1046 sites classified by a hand range, 893 by their domain's hand default, 110 by the source-text rule (PIN).

| disposition | call sites | evaluations/run |
|---|---:|---:|
| CORE-GATE:invariant-tier | 738 | 1830 |
| DELETE | 508 | 710 |
| DEEP | 467 | 647 |
| CORE-GATE | 196 | 662 |
| REWRITE-AS-BEHAVIOUR | 139 | 139 |
| PLAY-GATE | 1 | 1 |

How each class was assigned (counts in the *Resolution* line above): a
hand-written line range always wins; a site no range covers whose condition
reads source/file text becomes PIN by the mechanical rule
(`tools/orch/lib/features.mjs`); every other site takes its domain's
hand-written default, chosen after reading the domain.

**Error estimate.** A reproducible random sample of 40 of the
default-classified PURE-INVARIANT sites (`--section spotcheck`, seed 7) was
re-judged by hand: 5 of the 40 are better called PIN or TAUTOLOGY —
`authored-slope-rib-run.mjs:214` ("exactly those flanges"),
`t-047-light-rig.mjs:134` and `:139` (assert that the *escape-hatch* rig keeps
its old defect), `t-052-hull-texture.mjs:97` and `t-051-backdrop.mjs:137`
(re-derive the placement formula they test) — and none was better called
CORE. So read PURE-INVARIANT as an upper bound
(about one in eight of its default-classified sites is really a pin) and
PIN/TAUTOLOGY as lower bounds.

### 3.2 Examples (`--section examples`)

| class | example (file:line) | what it asserts |
|---|---|---|
| CORE | `t-009-whole-run-crossable-driven.mjs:111` | T-009: a held-jump policy survives the whole lattice (state … , lives … ) |
| CORE | `pathcheck-suite.mjs:606` | every face-1 gap before the first wave gate is crossable from the deck at SCROLL speed … with one held jump, window >= … — *FAIR-GAP: every face-1 gap crossable at the SCROLL FLOOR, with speed meter + negative control (I-021/I-024)* |
| CORE | `damage-plane-never-leaves-geometry-behind.mjs:80` | a plane-pinned player never ends a frame inside terrain, got … frames |
| CORE | `g1-1-render-only-proved-sim.mjs:138` | every simulated value is identical between ?zip=1 and the default: scroll, … gate state, ritual clock, built columns, … |
| CORE | `t-002-ritual-decision-trace-frame.mjs:308` | palette: no raw color literals — 0xRRGGBB or CSS #hex/rgb() — in … tokenized render files (0xffffff identity base … — *no scattered CONFIG.palette reads / raw colour literals in tokenized render files (palette hard rule)* |
| PURE-INVARIANT | `t-011-juice-feedback-pass.mjs:62` | T-011: hit-stop is a dt SCALE in (0,1] — it can only ever slow the … frame, so every tunneling/substep margin asserted … |
| PURE-INVARIANT | `pathcheck-suite-2.mjs:51` | T-032: ONE bad frame is a blip — it never costs a run — *fault-streak policy: one bad frame never costs a run; storms restart bounded times then stop legibly* |
| PURE-INVARIANT | `t-038-seam-pips.mjs:63` | seams: every pip sits inside its own run's [s0,s1) — a pip run can never … advertise a ledge that does not exist ( … … |
| PURE-INVARIANT | `view-scale-experiment.mjs:159` | hound telegraph is at least twice the reaction cost of jumping clear ( … : tell … s vs … s) |
| PIN | `mod-route-visibility.mjs:14` | each clone slot clears stale art before requiring a present, route-owned trail sample |
| PIN | `pathcheck-suite.mjs:790` | normal generator fingerprint unchanged, got — *golden generator shape 583/90/79 and fingerprint 10d82694: fails on every intentional level change* |
| PIN | `pathcheck-suite-2.mjs:245` | T-032: a simulation fault is caught and handed to the policy — *frame loop structure (halt check first, rAF before work, try/catch around update and draw) by regex* |
| PIN | `crown-command-architecture.mjs:51` | production is a frozen 31-part modular organ; the seven-part former plinth is capture-only |
| PIN | `boot-registry-contract.mjs:16` | registry manifests retain every declared owner — *exact "13 views, 31 reset owners"* |
| RETIRED | `pathcheck-suite-2.mjs:146` | T-032: the panel names BOTH ways back in (a key and a button), got " … " — *panel must name "R" and "button" — the keyboard-only device assumption entry 20 superseded; it pins the touch-device copy defect* |
| RETIRED | `pathcheck-suite.mjs:994` | dare entry margin covers backtrack plus scroll advance and preserves the exit margin — *dare entry margin covers the backtrack (dare wager, entries 9/10/21)* |
| RETIRED | `snap-hook-driven-through-real-sim.mjs:207` | the zip arrives and dangles before it throws (the boards’ dangle) |
| RETIRED | `pursuit-model.mjs:69` | entering the dare pocket drops the edge to pocketSpeed on the same frame — *entering the dare pocket drops the edge to pocketSpeed (dare wager, entries 9/10/21)* |
| TAUTOLOGY | `render-submission-contract.mjs:24` | every built transparent DoubleSide material is single-pass or carries a named exception — *read from a fixed shared /private/tmp/…/result.json: passes on a stale or foreign result when the probe fails* |
| TAUTOLOGY | `t-040-rig-sprite.mjs:110` | T-040: gun inner x matches the exported constant — *gun inner/outer x "matches the exported constant" — the value is computed from that constant* |
| TAUTOLOGY | `t-011-juice-feedback-pass.mjs:283` | T-011: sim layer imports no render module: — *sim imports no render module — already enforced by _context.mjs guardLayer (exits before any domain), so this line can never be the one …* |
| TAUTOLOGY | `capsule-reliquary-contract.mjs:21` | all twenty-seven capsule reliquary presentation contracts remain registered — *greps the checker's own printed count — adding a contract fails it, weakening one does not* |
| SLOW-ENV | `render-submission-contract.mjs:22` | the permanent real-browser performance probe boots the shipped scene — *the probe boots the shipped scene (real browser; host-load dependent)* |

### 3.3 Every domain (`--section domains`)

`ms (run 1)` is from `tools/orch/evidence/timing-full-run-1.json`. Verdict
`SPLIT` = its kept lines go to more than one tier, or it keeps only a few lines (the line ranges and reasons
are in `tools/orch/test-audit-spec.mjs`, per site in `tools/orch/test-audit.json`).
A verdict says where a domain *lives*; PIN, RETIRED and TAUTOLOGY lines inside a
kept domain are still deleted line by line (§7.5). `test-census.mjs` lists in
`problems` any verdict its own sites contradict (a DELETE domain keeping a line,
a CORE-GATE domain with deep lines, a DEEP domain with CORE-gate lines) — none
today.

| # | domain | scope | sites | evals | CORE | P-INV | PIN | RET | TAUT | SLOW | ms (run 1) | verdict |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | `pathcheck-suite` | shipped | 135 | 168 | 20 | 82 | 29 | 4 |  |  | 3990 | SPLIT |
| 1 | `view-scale-experiment` | flag | 135 | 214 | 3 | 123 | 8 | 1 |  |  | 8 | SPLIT |
| 2 | `world-transitions` | flag | 115 | 144 | 4 | 57 | 54 |  |  |  | 88 | DEEP |
| 3 | `g2-neck-access-plate-flip-gate` | flag | 111 | 132 | 16 | 80 | 15 |  |  |  | 176 | SPLIT |
| 4 | `pacing-variants` | flag | 25 | 25 | 2 | 18 | 1 | 4 |  |  | 2 | DEEP |
| 5 | `movement-verb-prototypes` | flag | 39 | 39 | 1 | 13 |  | 25 |  |  | 3 | SPLIT |
| 6 | `authored-slope-rib-run` | flag | 32 | 32 | 1 | 30 |  | 1 |  |  | 130 | DEEP |
| 7 | `rib-run-driven-through-real-sim` | flag | 11 | 25 | 8 |  | 3 |  |  |  | 994 | DEEP |
| 8 | `headroom-over-every-authored-ground-run` | flag | 2 | 2 |  | 2 |  |  |  |  | 1 | DEEP |
| 9 | `pursuit-model` | flag | 5 | 5 |  | 4 |  | 1 |  |  | 1 | DEEP |
| 10 | `hull-fallback-tier-1` | shipped | 4 | 4 |  | 4 |  |  |  |  | 0 | CORE-GATE |
| 11 | `charge-threat-prototype` | shipped | 22 | 22 | 1 | 16 | 4 |  | 1 |  | 1 | SPLIT |
| 12 | `cp4-promotion-full-run-tune` | shipped | 11 | 11 |  | 5 | 6 |  |  |  | 0 | SPLIT |
| 13 | `score-wiring-sim-layer` | flag | 12 | 12 | 11 |  | 1 |  |  |  | 102 | DEEP |
| 14 | `cp4-promotion-wiring-default-run-score` | shipped | 11 | 11 | 10 |  | 1 |  |  |  | 498 | CORE-GATE |
| 15 | `snap-hook-driven-through-real-sim` | flag | 21 | 21 |  |  |  | 21 |  |  | 857 | DELETE |
| 16 | `damage-plane-never-leaves-geometry-behind` | shipped | 5 | 5 | 4 | 1 |  |  |  |  | 2 | CORE-GATE |
| 17 | `hull-fallback-cannot-pay-itself` | flag | 9 | 9 | 9 |  |  |  |  |  | 620 | DEEP |
| 18 | `g1-limb-read-tower-bend-cull` | shipped | 35 | 51 | 13 | 21 | 1 |  |  |  | 59 | SPLIT |
| 19 | `bend-cull-driven-through-real-bullet` | shipped | 8 | 8 | 8 |  |  |  |  |  | 335 | CORE-GATE |
| 20 | `g1-1-render-only-proved-sim` | shipped | 7 | 7 | 7 |  |  |  |  |  | 1987 | CORE-GATE |
| 21 | `t-002-ritual-decision-trace-frame` | shipped | 33 | 36 | 12 | 20 | 1 |  |  |  | 713 | SPLIT |
| 22 | `t-003-far-view-legibility-compensation` | shipped | 38 | 115 | 2 | 28 | 8 |  |  |  | 38 | SPLIT |
| 23 | `t-012-audio-layer-static-guards` | shipped | 12 | 38 |  | 2 | 10 |  |  |  | 13 | SPLIT |
| 24 | `t-014-spore-mortar` | flag | 53 | 87 | 1 | 45 | 7 |  |  |  | 3 | SPLIT |
| 25 | `t-011-juice-feedback-pass` | shipped | 71 | 115 | 4 | 43 | 23 |  | 1 |  | 30 | SPLIT |
| 26 | `t-013-game-shell` | shipped | 67 | 229 |  | 33 | 34 |  |  |  | 28 | SPLIT |
| 27 | `t-009-six-face-lattice` | shipped | 29 | 29 | 1 | 20 | 8 |  |  |  | 299 | SPLIT |
| 28 | `t-009-static-anatomy-reveal-default` | shipped | 8 | 8 | 2 | 1 | 5 |  |  |  | 526 | SPLIT |
| 29 | `t-009-houndframe-stations-six-face` | shipped | 12 | 12 |  | 9 | 3 |  |  |  | 2 | CORE-GATE |
| 30 | `t-009-non-gating-station-cannot` | shipped | 4 | 4 | 4 |  |  |  |  |  | 375 | CORE-GATE |
| 31 | `t-009-whole-run-crossable-driven` | shipped | 5 | 5 | 5 |  |  |  |  |  | 738 | CORE-GATE |
| 32 | `t-009-pocket-route-works-driven` | shipped | 2 | 2 | 2 |  |  |  |  |  | 265 | CORE-GATE |
| 33 | `t-018-bot-harness-relative-geometry` | harness | 46 | 58 |  | 31 | 15 |  |  |  | 8 | DEEP |
| 34 | `t-027-bot-harness-deterministic-dispatch` | harness | 9 | 9 |  | 7 | 2 |  |  |  | 2 | DEEP |
| 35 | `t-025-harness-may-not-report` | harness | 20 | 20 |  | 15 | 5 |  |  |  | 9 | DEEP |
| 36 | `momentum-earned-pace-escalation` | shipped | 72 | 72 | 20 | 43 | 9 |  |  |  | 1530 | SPLIT |
| 37 | `t-029-runtime-truth-three-debug` | harness | 21 | 27 |  | 11 | 10 |  |  |  | 320 | DEEP |
| 38 | `pathcheck-suite-2` | shipped | 47 | 71 |  | 16 | 30 | 1 |  |  | 13 | SPLIT |
| 39 | `t-041-impact-language` | shipped | 14 | 22 |  | 10 | 4 |  |  |  | 2 | CORE-GATE |
| 40 | `t-043-wasp-aim-lock-squad` | shipped | 18 | 18 | 11 | 7 |  |  |  |  | 795 | CORE-GATE |
| 41 | `t-039-contact-shadows` | shipped | 35 | 304 | 3 | 17 | 15 |  |  |  | 74 | SPLIT |
| 42 | `pathcheck-suite-3` | shipped | 27 | 41 | 2 | 19 | 6 |  |  |  | 66 | SPLIT |
| 43 | `t-035-value-ladder` | shipped | 44 | 44 | 5 | 23 | 16 |  |  |  | 524 | SPLIT |
| 44 | `t-038-seam-pips` | shipped | 27 | 32 | 5 | 15 | 7 |  |  |  | 52 | SPLIT |
| 45 | `t-047-light-rig` | shipped | 56 | 116 | 5 | 36 | 15 |  |  |  | 19 | SPLIT |
| 46 | `t-048-post-pass` | shipped | 34 | 34 | 2 | 17 | 15 |  |  |  | 18 | SPLIT |
| 47 | `t-042-audio-punch` | shipped | 30 | 43 | 1 | 17 | 12 |  |  |  | 1590 | SPLIT |
| 48 | `t-050-shipped-plan-carries-the-scale-pass` | shipped | 12 | 21 |  | 6 | 6 |  |  |  | 53 | SPLIT |
| 49 | `t-040-rig-sprite` | shipped | 44 | 47 | 3 | 24 | 15 |  | 2 |  | 5 | SPLIT |
| 50 | `t-044-corner-setpieces` | shipped | 17 | 17 | 3 | 9 | 4 | 1 |  |  | 781 | SPLIT |
| 51 | `t-049-hostile-sprites` | shipped | 49 | 353 | 2 | 28 | 19 |  |  |  | 660 | SPLIT |
| 52 | `t-052-hull-texture` | shipped | 33 | 49 |  | 16 | 17 |  |  |  | 66 | SPLIT |
| 53 | `t-051-backdrop` | shipped | 33 | 343 | 1 | 20 | 12 |  |  |  | 32 | SPLIT |
| 54 | `t-054-hull-contrast` | shipped | 22 | 44 |  | 20 | 2 |  |  |  | 564 | CORE-GATE |
| 55 | `t-057-hull-shimmer` | shipped | 6 | 6 |  |  | 6 |  |  |  | 1 | DELETE |
| 56 | `fold-handoff-player-ownership` | shipped | 21 | 21 |  | 14 | 7 |  |  |  | 5 | SPLIT |
| 57 | `future-facet-render-ownership` | shipped | 17 | 17 |  | 5 | 12 |  |  |  | 8 | SPLIT |
| 58 | `mod-route-visibility` | shipped | 3 | 3 |  |  | 3 |  |  |  | 0 | DELETE |
| 59 | `limb-fold-bridge-locality` | shipped | 10 | 22 |  | 6 | 4 |  |  |  | 46 | SPLIT |
| 60 | `catwalk-built-prefix-visibility` | shipped | 10 | 10 |  | 5 | 5 |  |  |  | 65 | SPLIT |
| 61 | `vertical-assault-geometry` | shipped | 32 | 329 | 1 | 22 | 9 |  |  |  | 132 | CORE-GATE |
| 62 | `gate-prelude-runtime` | shipped | 18 | 18 | 13 | 4 | 1 |  |  |  | 1015 | CORE-GATE |
| 63 | `capsule-reliquary-contract` | shipped | 2 | 2 |  |  | 1 |  | 1 |  | 47 | DELETE |
| 64 | `projectile-presentation-contract` | shipped | 8 | 8 | 2 |  | 2 |  | 4 |  | 919 | SPLIT |
| 65 | `limb-silhouette-production` | shipped | 19 | 25 | 1 | 2 | 15 |  | 1 |  | 47 | SPLIT |
| 66 | `actor-motion-contract` | shipped | 2 | 2 |  | 1 |  |  | 1 |  | 715 | CORE-GATE |
| 67 | `crown-command-architecture` | shipped | 28 | 28 |  | 10 | 18 |  |  |  | 5 | SPLIT |
| 68 | `enemy-ecology-render-contract` | shipped | 2 | 2 |  |  | 2 |  |  |  | 283 | DELETE |
| 69 | `hostile-presenter-contract` | shipped | 2 | 2 |  |  | 1 |  | 1 |  | 138 | DELETE |
| 70 | `boot-registry-contract` | shipped | 2 | 2 |  |  | 2 |  |  |  | 439 | DELETE |
| 71 | `adaptive-fidelity-contract` | shipped | 2 | 2 |  | 1 |  |  | 1 |  | 148 | CORE-GATE |
| 72 | `render-submission-contract` | shipped | 5 | 5 |  |  | 1 |  | 3 | 1 | 300866 | REWRITE |
| 73 | `frame-input-contract` | shipped | 10 | 10 | 6 | 1 | 3 |  |  |  | 27 | SPLIT |
| 74 | `gilded-chassis` | shipped | 22 | 25 | 3 | 13 | 6 |  |  |  | 41 | SPLIT |
| 75 | `power-feedback-contract` | shipped | 17 | 19 | 1 | 7 | 9 |  |  |  | 4 | SPLIT |
| 76 | `depth-layer-contract` | shipped | 12 | 19 |  | 5 | 7 |  |  |  | 7 | SPLIT |

### 3.4 Standalone checks (`--section standalone`; one run each, `tools/orch/evidence/standalone-census.json`)

| check | run by the gate? | class | exit here | ms here | verdict |
|---|---|---|---|---:|---|
| `tools/action-vfx-check.mjs` | no | PIN | 0 | 401 | DELETE |
| `tools/action-vfx-v2-check.mjs` | no | PIN | 0 | 6256 | DELETE |
| `tools/action-vfx-v2-runtime-check.mjs` | no | PIN | 0 | 517 | DELETE |
| `tools/actor-motion-check.mjs` | pathcheck | PURE-INVARIANT | 0 | 2700 | CORE-GATE |
| `tools/adaptive-fidelity-check.mjs` | pathcheck | PURE-INVARIANT | 0 | 115 | CORE-GATE |
| `tools/boot-registry-check.mjs` | pathcheck | PIN | 0 | 133 | DELETE |
| `tools/capsule-reliquary-check.mjs` | pathcheck | PIN | 0 | 105 | DELETE |
| `tools/cindermouth-ground-fire-check.mjs` | pathcheck | CORE | 0 | 299 | CORE-GATE |
| `tools/defense-vfx-pack-check.mjs` | no | PIN | 0 | 2510 | DELETE |
| `tools/depth-composition-check.mjs` | no | PIN | 0 | 1909 | DELETE |
| `tools/destruction-flourish-check.mjs` | pathcheck | PIN | 0 | 1149 | DELETE |
| `tools/enemy-ecology-render-check.mjs` | pathcheck | PIN | 0 | 958 | DELETE |
| `tools/enemy-ecology-runtime-check.mjs` | no | PURE-INVARIANT | **1** | 3072 | TRIAGE (red today, cause unknown: its owner fixes it or deletes it) |
| `tools/enemy-motion-check.mjs` | no | PURE-INVARIANT | **1** | 187 | TRIAGE (red today, cause unknown: its owner fixes it or deletes it) |
| `tools/finale-pacing-check.mjs` | no | CORE | **1** | 380 | REWRITE (keep the twin-replay determinism, drop the form pin) |
| `tools/foreground-kit-check.mjs` | no | PIN | 0 | 2452 | DELETE |
| `tools/foreground-pack-check.mjs` | no | SLOW-ENV | **1** | 215 | DELETE (host-tool dependent) |
| `tools/hostile-presenter-check.mjs` | pathcheck | PIN | 0 | 429 | DELETE |
| `tools/level1-ecology-encounter-check.mjs` | no | PURE-INVARIANT | 0 | 834 | DEEP |
| `tools/level1-enemy-ecology-check.mjs` | no | PIN | 0 | 3133 | DELETE |
| `tools/meridian-defense-check.mjs` | no | PURE-INVARIANT | 0 | 299 | DEEP |
| `tools/player-presentation-check.mjs` | no | PIN | 0 | 811 | REWRITE (measure the painted hand anchor vs the gun socket per frame) |
| `tools/pressure-envelope-check.mjs` | no | PURE-INVARIANT | 0 | 763 | DEEP |
| `tools/projectile-presentation-check.mjs` | pathcheck | PIN | 0 | 892 | DELETE |
| `tools/projectile-terminal-check.mjs` | pathcheck | CORE | 0 | 421 | CORE-GATE |
| `tools/rig-slender-check.mjs` | no | PIN | **1** | 8645 | TRIAGE (red today, cause unknown: its owner fixes it or deletes it) |
| `tools/track-archetypes-check.mjs` | no | PURE-INVARIANT | 0 | 794 | DEEP |
| `tools/vertical-assault-check.mjs` | no | PURE-INVARIANT | 0 | 425 | DEEP |
| `tools/wasp-modular-v2-check.mjs` | no | PURE-INVARIANT | 0 | 4301 | DEEP |
| `tools/world-detail-check.mjs` | no | PIN | 0 | 928 | DELETE |
| `tools/perf/render-budget-check.mjs` | no | PURE-INVARIANT | 0 | 131 | CORE-GATE (frame budget support) |
| `tools/playtest/sprite-fallback-check.mjs` | no | CORE | **1** | 42785 | PLAY-GATE (after fixing) |
| `tools/playtest/preload-concurrency-check.mjs` | no | CORE | 0 | 55003 | PLAY-GATE |
| `tools/vertical-assault/runtime-check.mjs` | no | PURE-INVARIANT | 0 | 443 | DEEP |
| `tools/vertical-assault/runtime-sim-check.mjs` | no | CORE | 0 | 1893 | CORE-GATE |
| `tools/assets/check.mjs` | no | RETIRED | TIMEOUT | 300385 | RE-AIM (entry 16) or DELETE the independence half |
| `tools/gatecheck.mjs` | no | PURE-INVARIANT | TIMEOUT | 300141 | KEEP the FAIR-GAP controls; fold into the mutation harness |
| `tools/movement/selftest.mjs` | no | SLOW-ENV | TIMEOUT | 302257 | PLAY-GATE (desktop + phone rows) |
| `tools/deploy/asset-union-selftest.mjs` | no | PURE-INVARIANT | 0 | 427 | DEEP (deploy) |

29 of the 39 are run by nothing automatic. Six of those are **red on this tree
right now** and nobody had noticed, because nothing runs them:
`enemy-ecology-runtime-check` (an exact visual-identity table drifted),
`enemy-motion-check` ("wasp frame 0: substantial opaque body"),
`finale-pacing-check` (pins "reviewed neutral forms"), `foreground-pack-check`
(shells out to ImageMagick, absent here), `rig-slender-check` ("body emission
must remain zero outside explicit overdrive action" — either a real look
regression or a stale pin; unknowable without an owner), and
`tools/playtest/sprite-fallback-check.mjs` (Playwright `TimeoutError` on this
loaded host). Three more timed out at 300 s: `tools/assets/check.mjs`,
`tools/gatecheck.mjs` (its baseline is a full pathcheck, including the browser
domain) and `tools/movement/selftest.mjs`. An ungated check is a check that
decays; the ones worth keeping must move into a gate or be deleted.

### 3.5 The other surfaces

| surface | class | what it really checks | verdict |
|---|---|---|---|
| `?selftest=1` (`src/main.js:873-1135`) | CORE + SLOW-ENV | 48 in-browser lifecycle `check()` sites: canvas attached, render loop alive, pause/resume, resize, restart, flags plumbed, failsafe panel renders and reads plainly, RIG at 3–5 % on the title | genuine boot evidence that **no gate runs**; desktop-shaped (no touch, keyboard-only key checks). Move into the PLAY gate at desktop and phone viewports. |
| `tools/deploy/verify-bundle.mjs` | CORE + SLOW-ENV | builds the zip, unzips it *outside* the repo, serves it, drives real Chrome and asserts each art surface reached `ready` rather than its fallback | the best falsifying test in the repo (written because a file-count check would have passed a bundle with no art). 1280×800 only; records page errors but not console warnings. Keep as the release gate; add a phone row and console-warning capture. |
| `tools/deploy/verify-pages-site.mjs` | CORE + SLOW-ENV | a warm-cache release race cannot combine two module graphs | real incident guard; keep as a release gate. |
| merge-gate smoke | CORE + SLOW-ENV | boot + full deterministic schedule + no page errors + no stall | the only browser evidence in the merge gate — and both scripts boot **opt-in fixtures** (`index.html?slice=traversal`, `index.html?slice=transform&enemies=0`), never the default URL a player opens; desktop/480×300 viewport, keyboard input; served with `python3 -m http.server` although CLAUDE.md warns against it (T-024). Keep, add the default URL and a phone/touch row. |
| `tools/playtest/*.mjs` capture scripts | SLOW-ENV | screenshots/contact sheets/metrics for operator judgement | evidence instruments, correctly not gates. `hud-instrument-smoke.mjs` is the only phone-viewport *assertion* in the repo (390×844 and 844×390, `hasTouch`) and it checks HUD-vs-HUD overlap and safe areas — not how much of the play field the HUD covers. |

## 4. Binding sample: break the guarded thing, see if the gate goes red

**Method** (`tools/orch/mutation-sample.mjs`, sample in `tools/orch/mutants.mjs`).
The tree is `git archive`d into a scratch directory. For each mutant the exact
anchor text is asserted to occur the expected number of times (a mutation that
silently stops applying is worse than none — the rule `tools/gatecheck.mjs`
already follows), the edit is applied to the scratch copy only, every
pathcheck domain except the browser one runs through the instrumented runner,
and the original bytes are written back and hash-verified before the next
mutant. **Red** = the runner exits non-zero (an assertion failed, a domain
threw, or the prelude layer guard exited). **Named assertion** = the specific
assertion the mutant was aimed at is among the failures. The browser domain is
excluded by default (≈5 min per run here; beyond booting the scene it only
judges material passes, idle uploads and MSAA); M13 runs it, after only the
three SHARED producers.

Mutant kinds: **property** (break the guarded property the way a real
regression could — red is a *kill*); **refactor** (semantics-preserving
rewrite — red is a *false alarm*); **intended** / **fix** (a change a decision
allows, or the fix for an observed defect — red is an *obstruction*);
**blind** (reproduce an entry-20 or integrator-observed defect no class claims
to guard); **equivalent** (kept as a lesson, excluded from rates — M04's first
design changed nothing in the tested scenario).

### 4.1 Kill rate per class (`--section mutation`)

| target class | property mutants | gate red (killed) | named assertion red | kill rate | harmless refactors | refactors red (false alarms) | intended changes / fixes | of those red (obstruction) | blind defect repros | of those red |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CORE | 12 | 8 | 6 | 0.67 | 1 | 0 | 0 | 0 | 0 | 0 |
| SLOW-ENV | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| PURE-INVARIANT | 6 | 6 | 5 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| PIN | 5 | 0 | 0 | 0 | 4 | 4 | 1 | 1 | 0 | 0 |
| RETIRED | 0 | 0 | 0 | - | 0 | 0 | 3 | 2 | 0 | 0 |
| TAUTOLOGY | 2 | 1 | 0 | 0.5 | 0 | 0 | 0 | 0 | 0 | 0 |
| (none — blind spot) | 0 | 0 | 0 | - | 0 | 0 | 0 | 0 | 5 | 0 |

Sample: 42 mutants — 26 property, 5 refactor, 4 intended/fix, 5 blind, 1 equivalent (excluded), 1 robustness (excluded). Rows: the first run, overridden per id by mutation-results-batch2.json, mutation-results-batch4.json.

### 4.2 Every mutant

| id | class | kind | gate | named assertion | failing domains | mutation |
|---|---|---|---|---|---|---|
| M01 | CORE | property | green | silent |  | coyote time silently stops being granted on landing (a late press no longer forgives) |
| M02 | CORE | property | **RED** | red | damage-plane-never-leaves-geometry-behind | the six-face wall stops holding a plane-pinned player (the adversarial F4 shove-through-a-wall regression) |
| M03 | CORE | property | **RED** | red | bend-cull-driven-through-real-bullet, projectile-presentation-contract | bullets turn corners again (entry 7: they must not) |
| M04 | CORE | equivalent | green | silent |  | intended: any surviving body holds the gate. Actually equivalent here: ambient stations are never gate rows |
| M04b | CORE | property | **RED** | red | t-009-non-gating-station-cannot | the wave gate opens while a gating houndframe is still alive (players skip the fight the gate exists for) |
| M05 | CORE | property | **RED** | red | g1-1-render-only-proved-sim | determinism: Math.random() enters the sim (wasp dive lock jitter, lengthen-only so no fairness bound moves) |
| M06 | CORE | property | **RED** | red | t-043-wasp-aim-lock-squad | a wasp dives the frame it commits — the aim-lock tell is gone |
| M07 | CORE | property | green | silent |  | ?hook=1 stops being inert: the rejected hook arms by default in the traversal slice (CLAUDE.md: keep it inert) |
| M08 | CORE | property | **RED** | - | (prelude/layer guard) | layer purity: the sim imports the renderer |
| M09 | CORE | property | **RED** | red | t-038-seam-pips | palette rule: a raw hex literal lands in a tokenized render file |
| M10 | CORE | property | green | silent |  | entry 16: the sim branches on whether art loaded (wasp hitbox grows when a render-set global says the art is ready) |
| M11 | CORE | property | **RED** | silent | rib-run-driven-through-real-sim, t-009-pocket-route-works-driven | the air jump is never restored on landing (double jump lost after the first one) |
| M12 | CORE | property | green | - |  | the game no longer boots: src/main.js throws during module evaluation (blank page + failsafe panel) |
| M13 | SLOW-ENV | property | **RED** | red | render-submission-contract | same boot-breaking throw, run against the ONE browser domain (perf probe) — does it go red, and for which assertions? |
| M14 | PURE-INVARIANT | property | **RED** | red | t-011-juice-feedback-pass | outside a hit-stop freeze the world runs 25% fast |
| M15 | PURE-INVARIANT | property | **RED** | silent | t-039-contact-shadows | contact shadow keeps drawing (with negative opacity) above its configured ceiling |
| M16 | PURE-INVARIANT | property | **RED** | red | t-038-seam-pips | deck seam pips run three tiles past the ledge they advertise |
| M17 | PURE-INVARIANT | property | **RED** | red | pathcheck-suite-2 | durability: ONE bad frame restarts the run |
| M18 | PURE-INVARIANT | property | **RED** | red | momentum-earned-pace-escalation, t-029-runtime-truth-three-debug | entry 11: a struggling player (drive 0) is pushed 5% faster than the shipped floor |
| M19 | PURE-INVARIANT | property | **RED** | red | view-scale-experiment | a hound retune shortens its telegraph below twice the reaction cost |
| M20 | PIN | property | green | silent |  | ghost-squad clones are drawn 40 tiles ahead, on an unbuilt facet — the property the regex claims to guard |
| M21 | PIN | refactor | **RED** | red | mod-route-visibility | rename the loop local `cm` to `clone` (no behaviour change) |
| M22 | PIN | refactor | **RED** | red | pathcheck-suite-2 | rename the frame loop's catch binding `err` to `e` (no behaviour change) |
| M23 | PIN | property | green | silent |  | durability: a fault storm that should RESTART the run halts it instead (the recover branch is dead) — ui/failsafe.js |
| M24 | PIN | refactor | **RED** | red | boot-registry-contract | add one space inside a registry entry (whitespace only) |
| M25 | PIN | refactor | **RED** | red | catwalk-built-prefix-visibility | swap the operands of one catwalk-overlap comparison in sim/player.js (identical semantics) |
| M26 | CORE | refactor | green | - |  | swap two independent statements in the landing branch of sim/player.js (no behaviour change) — driven tests should stay green |
| M33 | PIN | property | green | silent |  | the last half tile of every catwalk stops being solid (players drop off early); the regex still matches its prefix |
| M34 | PIN | property | green | silent |  | run teardown: the hostile RNG owner stays registered but no longer resets (a retry no longer replays the same run) |
| M35 | PIN | property | green | silent |  | durability: a resumed tab advances the whole gap again (catch-up multiplier) while the regexed Math.min(50, t - last) text stays |
| M27 | PIN | intended | **RED** | red | pathcheck-suite, g2-neck-access-plate-flip-gate, t-009-whole-run-crossable-driven, t-044-corner-setpieces, catwalk-built-prefix-visibility, vertical-assault-geometry | entry 20 "the sides are a little short": lengthen every face by 20% (88 -> 106 tiles, levelLength 583 -> 691 to match) — a change the operator asked for |
| M27h | PIN | robustness | **HUNG** | - | (timeout: no domain finished) | an incomplete config edit (faceTiles 88 -> 106 without levelLength) — the gate should go red; it hangs instead |
| M28 | RETIRED | fix | **RED** | red | pathcheck-suite-2 | fix the integrator-observed touch defect: the failsafe panel says "Press R, or click the button" on a phone |
| M29 | RETIRED | intended | **RED** | red | pathcheck-suite, pacing-variants | retune the retired dare pocket: shrink its entry margin 18 -> 12 tiles (entries 9/10/21 retired the wager) |
| M30 | RETIRED | intended | green | silent |  | touch the rejected hook v1 (entry 5): lengthen its dangle 110 -> 160 ms |
| M31 | TAUTOLOGY | property | green | silent |  | the gun box is lifted 0.3 tiles off RIG's hand axis; the assertion compares the gun span to the constant it is computed from |
| M32 | TAUTOLOGY | property | **RED** | silent | (prelude/layer guard) | the sim imports a render module — the domain's own guard vs. the prelude guard that runs first |
| B1 | NONE | blind | green | - |  | entry 20 "guns don't align to hands": draw the gun 0.35 tiles above and 0.12 ahead of the hand socket (render only) |
| B2 | NONE | blind | green | - |  | integrator: portrait title clips "HULLBREAKER" — force the title wider than a 390-px viewport |
| B3 | NONE | blind | green | - |  | integrator: HUD covers the top-left of 844x390 — make every HUD panel 60% of the viewport |
| B4 | NONE | blind | green | silent |  | entry 20 "turns don't quite work right": the sim starts the corner ritual 1.5 tiles before RIG physically reaches the joint |
| B5 | NONE | blind | green | - |  | integrator: preload images fetched twice (crossorigin mismatch) — make it worse: a sixth uncredentialed preload |

### 4.3 What the sample says

**CORE assertions mostly bind — where they drive the real loop.** The
driven tests caught every mutant that went through code they actually
execute: the plane shoving RIG through a wall (M02), bullets turning corners
(M03), the gate opening under a live gating hound (M04b), `Math.random()` in
the sim (M05, caught by `g1-1`'s frame-by-frame comparison of two processes),
a wasp diving without its tell (M06), the sim importing the renderer (M08,
the prelude guard), a raw colour literal (M09) and the air jump never coming
back (M11). The control refactor inside code those domains drive (M26)
stayed green — no false alarm. **Four CORE claims did not bind:**
- **M01** — coyote time removed entirely: green everywhere. The assertion
  named "a press up to 6 frames late (one coyote window) still crosses every
  face-1 gap" is satisfied by the *air jump*; the probe's own comment says
  coyote time buys zero frames on a flat gap. The intent is in the message,
  the mechanics test something else — this project's signature failure
  (LANE-BRIEF "Evidence standard").
- **M07** — `?hook=1` armed by default in `src/mode.js`: green. The "flags off
  is the shipped game" check calls `resolveTraversalPace(id)` with its default
  arguments; the shipped wiring passes `{ hook: HOOK_ENABLED, flow: FLOW_ENABLED }`
  from `mode.js`, which no test resolves.
- **M10** — the sim branching on a render-set "art ready" global: green. The
  entry-16 guards are name lists (`sprite|preload|TextureLoader|assets/…`);
  they are also why CORE's evaluation count is inflated — 462 of its 757
  evaluations are four such name-scan loops over every sim/pure file.
- **M12** — `src/main.js` throwing at boot: green across all 76 headless
  domains; nothing headless evaluates `main.js`. In the browser domain alone
  (**M13**) the probe's boot assertion went red — and its three result
  assertions went **green**, read from a `result.json` another run wrote at
  20:23, 2 h 20 min earlier. A game that cannot start passed 3 of 4.

Two driven tests also show *how* driven tests go blind: the FAIR-GAP probe and
the g2 apex test **inject state** each attempt (`p.airJumpsLeft = PL.airJumps`),
so a bug in the landing branch that restores it (M11) was invisible to both;
it was caught only by the pocket-route and rib-run tests, which play
continuously.

**PURE-INVARIANTs bind.** All six turned the gate red, five at the named
assertion (M15 by a sibling in the same domain): hit-stop running the world
fast (M14), contact shadows drawn above their ceiling (M15), seam pips
advertising missing ledges (M16), one bad frame restarting the run (M17), the
momentum floor raised 5 % (M18), a hound tell shortened below the reaction
cost (M19). Cheap, correct and binding — the case for keeping them in the
fast gate's invariant tier.

**PINs are the worst kind, exactly as the brief predicted.** Five PIN
property mutants — each breaking the property its pin claims to protect, where
the regex does not look — all stayed **green**: ghost-squad clones drawn on an
unbuilt facet (M20), the failsafe's restart branch dead (M23), the last half
tile of every catwalk non-solid (M33), the hostile RNG no longer reset between
runs (M34), a resumed tab advancing the whole gap again (M35). Four
semantics-preserving refactors — renaming a loop local (M21), renaming a
catch binding (M22), one extra space inside a registry entry (M24), swapping
a comparison's operands (M25) — all turned it **red**. Kill rate 0 / 5, false
alarms 4 / 4. The operator-requested "longer sides" change (M27, faces 88 → 106 tiles
with `levelLength` 583 → 691 to match): **RED** — 9 assertion(s) in 6 domain(s) (`pathcheck-suite`, `g2-neck-access-plate-flip-gate`, `t-009-whole-run-crossable-driven`, `t-044-corner-setpieces`, `catwalk-built-prefix-visibility`, `vertical-assault-geometry`). Of those nine, two are the
golden pins (583/90/79 shape, fingerprint), three pin coordinates of today's
geometry (`catwalk-built-prefix-visibility`'s face-3 shelf at s = 266), one is
a hidden coupling (`g2-neck…:602` drops a synthetic one-way platform at
x = 430 "past the generator's platform range", which the longer level now
reaches), one is a genuine content signal (`vertical-assault-geometry`:
longer faces need authored routes, not density-repair bars), and two driven
CORE tests stop short of the outro (scroll 646 of 661) inside their fixed
24,000-frame budget — the budget or a real stall; whoever lengthens the faces
must find out which. Made *incompletely* (faceTiles without `levelLength`,
M27h) the change does not fail the gate at all: **hung** — the gate never finished; killed after 120 s with no domain completed (a red that only a timeout can deliver) — the gap-run scan in
`pathcheck-suite.mjs` never advances over the undefined columns, so the gate
spins until something kills it (the PostToolUse hook's 120 s watchdog would
report it as a hook problem).

**RETIRED assertions obstruct.** The touch-copy fix (M28) turned the gate red
at `pathcheck-suite-2.mjs:146`; shrinking the retired dare pocket's margin
(M29) red at three dare assertions; lengthening the rejected hook's dangle
(M30) stayed green — retired assertions obstruct when a change crosses the
retired design's own invariants, not for in-range tweaks.

**TAUTOLOGIES do not bind.** Lifting the gun box 0.3 tiles off RIG's hand
axis (M31) stayed green — the assertion compares the gun span to the constant
it is computed from. A sim→render import (M32) turned the gate red in 0.3 s,
but at the prelude layer guard: the domain assertion aimed at it
(`t-011-juice-feedback-pass.mjs:283`) never got to run, and never can.

**The blind mutants stayed blind: 0 of 5 red.** The gun drawn 0.35 tiles off
the hand socket (B1), a title wider than a 390 px phone (B2), HUD panels
covering 60 % × 45 % of the viewport (B3), the corner ritual starting 1.5
tiles before RIG reaches the joint (B4) and a sixth uncredentialed preload
(B5) — all green.

## 5. Blind spots: the defects the operator and the integrator actually saw

Entry 21 says none of the entry-20 defects was caught by any gate. This
table says which check came closest, whether it *could* have caught the
defect, and why it did not. The `mutant` column is the reproduction in
`tools/orch/mutants.mjs` and what the gate did with it. The integrator's
mobile observations were made on 048716c; none of `index.html`,
`src/ui/shell.js`, `src/ui/hud.js`, `src/ui/failsafe.js`, `src/render/preload.js` changed between it and 38d0409
(`git diff --stat 048716c HEAD` on those paths is empty), and
`tools/orch/phone-probe.mjs` re-measured all four on this tree
(`tools/orch/evidence/phone-probe.json`; fresh headless Chrome per viewport,
isMobile + hasTouch + DPR 3 for the phone rows).

| defect (source) | closest existing checks | could it have caught it? | why none did | mutant → gate |
|---|---|---|---|---|
| "it's only one level" (operator, entry 20) | none | no — content scope, not a regression | correct for a gate not to judge scope. But the suite *pins* the one level: golden fingerprint + 583/90/79 shape (`pathcheck-suite.mjs:774-790`), "outro is face 7", exact per-face counts ("arena tier count escalates exactly 1,2,3,3,3", "one pocket per face") — a second level or a re-shaped first one fights them | M27 (faces 88→106 tiles, the "sides" fix below) → **RED** — 9 assertion(s) in 6 domain(s) (`pathcheck-suite`, `g2-neck-access-plate-flip-gate`, `t-009-whole-run-crossable-driven`, `t-044-corner-setpieces`, `catwalk-built-prefix-visibility`, `vertical-assault-geometry`) |
| "the models are a little off (like guns don't align to hands)" (operator) | `t-040-rig-sprite.mjs:110-112`; ungated `tools/player-presentation-check.mjs`; capture `rig-presentation-capture.mjs` (human-judged) | yes, if it measured pixels: the hand anchor per frame vs the gun socket | t-040 compares the gun span to the constants it is computed from (TAUTOLOGY) and pins a reach number; player-presentation-check regexes the socket *line* `gunGroup.position.set(0, player.muzzleY, 0.25)`. Nothing reads where the painted hands are | B1 (gun drawn 0.35 above / 0.12 ahead of the socket) → **green** — no assertion failed; M31 (gun box lifted off the hand axis) → **green** — no assertion failed |
| "on mobile some things don't render correctly" (operator) | 15 capture scripts shoot a phone viewport (human-judged; `tools/playtest/*.mjs` naming both 390 and 844); ungated `hud-instrument-smoke.mjs`; portrait camera arithmetic (`pathcheck-suite.mjs:1030-1035`); mobile *byte* budgets (`t-013-game-shell.mjs:283`, `t-049-hostile-sprites.mjs:126`) | yes, for the layout/copy/network defects below — with a phone-viewport browser assertion | no gate boots a phone viewport. The merge smoke runs desktop (480×300 on GPU-less hosts) with keyboard input on `?slice=` URLs; `?selftest=1` is desktop-shaped and not gated. **Measured here** (`tools/orch/evidence/phone-probe.json`): in 2 of 3 fresh boots of the default URL 38 art files missed the preload boot budget — 2.5 s at desktop, and even the 6.5 s mobile budget at 390×844 ("still loading after 15039ms of the 6500ms boot budget; the game is starting without it") — and by design the run then plays on fallback bodies throughout (late textures are disposed). The mobile budget exists because real iPhone/Safari evidence showed exactly this on Pages (`src/render/preload.js:70-77`). The suite asserts the fallback *exists* (regex); nothing measures how often the shipped look actually arrives on a slow device | see the four integrator rows; boot-budget misses: 38 / 0 / 38 (desktop / landscape / portrait) |
| "the 'sides' are a little short" (operator) | none | no — a length/feel call | correct not to gate feel; nothing *reports* seconds-per-face at scroll/run speed to the operator either. The fix (longer faces) is obstructed by pins | M27 → **RED** — 9 assertion(s) in 6 domain(s) (`pathcheck-suite`, `g2-neck-access-plate-flip-gate`, `t-009-whole-run-crossable-driven`, `t-044-corner-setpieces`, `catwalk-built-prefix-visibility`, `vertical-assault-geometry`) |
| "the 'turns' don't quite work right all of the time" (operator) | `fold-handoff-player-ownership`, `future-facet-render-ownership`, `limb-fold-bridge-locality`, `catwalk-built-prefix-visibility` (pure functions fed the regression's own constants + regex over the wiring); `t-002` (transform slice trace); `t-009-whole-run-crossable-driven` (one policy, one dt) | partly: a driven corner test across frame rates and input timing | "all of the time" is a distribution over dt, input timing and position; every check runs one deterministic path at one fixed dt, and the sim's own trigger (`advanceCornerApproach` in `src/sim/wavegate.js`) is never driven against the joint — the regex checks only that `sim/player.js` *calls* it | B4 (ritual starts 1.5 tiles before RIG reaches the joint) → **green** — no assertion failed |
| "those [touch] controls as we implemented are too wonky" (operator) | **nothing** — zero references to `src/ui/touch-controls.js` in `tools/pathcheck/`; no gate sends a touch event | the feel, no (operator's verdict); the mapping, yes | the suite was built while the goal block said "No touch" (superseded by entry 20 on 2026-10-22) | — |
| portrait 390×844 title clips "HULLBREAKER" to "HULLBREAK" (integrator, main 048716c) | `t-013-game-shell` (shell data, keyboard intents); `?selftest=1` title checks (desktop, ungated); 390×844 captures (human) | yes — `scrollWidth > clientWidth` on visible text at a phone viewport | no DOM-layout assertion exists at any viewport. **Measured here:** the title `h1` needs 450 px in a 343 px box at 390×844 (524 in 397 at 844×390, and 795 in 602 even at 1280×800) | B2 (title forced wider than 390 px) → **green** — no assertion failed |
| title says "PRESS ANY KEY" and lists keyboard controls on a touch device (integrator) | `t-013-game-shell.mjs:134-189` (keyboard intent routing) | yes — copy check on a coarse pointer | no test models a touch device; the prompt is hard-coded at `src/ui/shell.js:102` and its text is asserted nowhere. **Measured here:** "press any key", "wasd", "arrow", "space" on the title with `(pointer: coarse)` true at both phone viewports | present on this tree; gate green in run 1 |
| failsafe panel says "Press R, or click the button" (integrator) | `pathcheck-suite-2.mjs:146` | it **requires** the defect: `/\bR\b/` and `/button/` must match the hint | entry 20 superseded the keyboard-only device after the check was written | M28 (the touch-copy fix) → **RED** — 1 assertion(s) in 1 domain(s) (`pathcheck-suite-2`) |
| HUD panel covers the top-left quarter of 844×390 (integrator) | ungated `tools/playtest/hud-instrument-smoke.mjs` (844×390, 390×844, `hasTouch`) | yes — it already boots that viewport | it asserts HUD panels don't overlap *each other* and respect safe areas (and leaves the title with a *keyboard* Enter on a touch page); it never bounds how much of the play field they cover, and nothing runs it. **Measured here:** visible HUD panels cover 14.0 % of 844×390 — the RIG panel alone spans 36 % of the width and 30 % of the height at the top-left — and 16.4 % of 390×844 | B3 (every HUD panel ≥ 60vw × 45vh) → **green** — no assertion failed |
| four `<link rel=preload>` images fetched twice — crossorigin mismatch warnings (integrator) | `t-049-hostile-sprites.mjs:171` (regex: the loader lives in preload.js); `preload-concurrency-check.mjs` (gate behaviour, ungated); merge smoke and `verify-bundle.mjs` (page errors only); mobile byte budgets | yes — count requests per URL, capture console warnings | every browser check listens for `pageerror` only; a doubled download is a warning, not an error, and nothing counts requests. **Measured here:** exactly four URLs fetched twice at every viewport, each with Chrome's "preload … is not used because the request credentials mode does not match" warning | B5 (one more uncredentialed preload) → **green** — no assertion failed |

## 6. Cost

### 6.1 One instrumented full gate run (`--section cost`)

| run | when (UTC) | load avg (1/5/15) | total s | browser domain s | other 76 domains s | passed | failed |
|---|---|---|---:|---:|---:|---:|---:|
| `tools/orch/evidence/timing-full-run-1.json` | 2026-10-22T21:25:17.354Z | 23.64 / 20.52 / 20 | 325.3 | 300.9 | 24.2 | 3988 | 1 |
| `tools/orch/evidence/timing-full-run-2.json` | 2026-10-22T22:55:26.190Z | 27.06 / 26.12 / 32.42 | 337.6 | 301.5 | 35.8 | 3988 | 1 |

| domain (run 1) | ms | share of run |
|---|---:|---:|
| `render-submission-contract` | 300866 | 92.5% |
| `pathcheck-suite` | 3990 | 1.2% |
| `g1-1-render-only-proved-sim` | 1987 | 0.6% |
| `t-042-audio-punch` | 1590 | 0.5% |
| `momentum-earned-pace-escalation` | 1530 | 0.5% |
| `gate-prelude-runtime` | 1015 | 0.3% |
| `rib-run-driven-through-real-sim` | 994 | 0.3% |
| `projectile-presentation-contract` | 919 | 0.3% |
| `snap-hook-driven-through-real-sim` | 857 | 0.3% |
| `t-043-wasp-aim-lock-squad` | 795 | 0.2% |

**What dominates.** One domain: `render-submission-contract` boots a real
browser through `tools/playtest/perf-probe.mjs` and took 300.9 s of the
325.3 s run — it hit `HB_PROBE_SPAWN_MS` (300 000 ms, the value
`tools/orch/cloud-setup.sh` exports for cloud hosts; the code default of 45 s
would cut it off sooner, and it did not finish in 300 s) and failed, so on this host under this
load **the headless gate is red for an environmental reason**. The other 76 domains together took 24.2 s, the prelude (layer
guards + importing every domain module) 0.28 s. Among the headless domains the
costliest are the child-process sim drivers — `pathcheck-suite` (FAIR-GAP
probe, 4.0 s), `g1-1-render-only-proved-sim` (2.0 s), `t-042-audio-punch`
(1.6 s), `momentum-earned-pace-escalation` (1.5 s), `gate-prelude-runtime`
(1.0 s) — i.e. the valuable driven CORE tests are the expensive headless ones,
and they are cheap in absolute terms. Source-text pins cost nothing to run;
their cost is the false alarms in §4. The per-call-site census run (scratch
copy, browser domain skipped, load 31.6 recorded) took 47.2 s for the same 76 domains:
the headless part roughly doubles under heavier load.

**Run 2 (verification, at the end of the audit):** `tools/orch/evidence/timing-full-run-2.json`, run while
the M27 re-runs and the reproducibility re-check shared the host: 337.6 s total;
the browser domain again hit its 300 s spawn timeout (301.5 s, +4/−1 — the
same three passes from the same stale `result.json`), the other 76 domains
took 35.8 s, and 3,988 passed / 1 failed exactly as in run 1. Same shape:
one domain ≈ 89–93 % of the run, everything else well under a minute.

**The merge gate on this host** (`tools/orch/merge-task.sh`) is the sum of:
pathcheck in the worktree (≈325 s here, browser domain included) + the smoke
(two scripts, up to three attempts each; one attempt each measured here:
`mid-route.json` **484 s** wall, PASS; `transform-slice.json` **39 s**, FAIL — `page.goto`'s fixed 30 s navigation timeout in `run.mjs` expired under load, which the gate's best-of-three would retry; `tools/orch/evidence/smoke-timing.txt`) + pathcheck again on main after the merge (≈325 s). That is
roughly **11 minutes of pathcheck per merge, ~92 % of it the same browser
probe twice**, plus ≈ 9 minutes of smoke here — about **20 minutes per merge
on this host before any retry**, and red for environmental reasons in two
places (the probe's 300 s spawn timeout, `run.mjs`'s 30 s navigation timeout). The PostToolUse hook
(`.claude/hooks/check-changed.sh`) runs the same full pathcheck after every
`src/` edit with a 120 s watchdog — shorter than one gate run here, so on this
host the "fast per-change check" cannot complete.

**The standalone checks**, if someone ran all 39 (`standalone-census.json`):
1,049.5 s, of which 902.8 s are three ~300 s timeouts (`tools/assets/check.mjs`,
`tools/gatecheck.mjs`, `tools/movement/selftest.mjs`); the other 36 take
146.7 s together.

**Proposed cost.** CORE gate: the 76 headless domains took 24.2 s (run 1)
to 35.8 s (run 2) and the kept subset is a strict subset of them, so roughly
15–35 s on this host plus the new behaviour tests (each a handful of
child-process sim runs — today's driven domains cost 1–5 s apiece); deleting the 508 + 139 sites removes no meaningful time (pins are
cheap) — the saving is the browser domain moving out (−300 s per run, twice
per merge, plus every hook fire). PLAY gate: the existing smoke plus three
viewport boots of the default URL; on this GPU-less host each boot is
~15–30 s of scene boot before any check (per `tools/orch/cloud-setup.sh`), so
budget ≈ 3–6 min per merge here and far less on a GPU host.

## 7. Proposal

The operator's own words set the bar: guard **what a player would notice**,
and keep the hard rules that make headless evidence trustworthy (entry 16's
"kept, deliberately" list and entry 21's never-weaken list). Three tiers.

### 7.1 CORE gate — headless, every change, ≈ 30 s on this loaded host

Runs in one Node process like today (the SHARED/singleton coupling stays
explicit — see §7.6), **without any browser**.

| part | what | today's size |
|---|---|---|
| prelude | `guardLayer(pure)` / `guardLayer(sim)` and the unlisted-module guard — **plus** a static ban of `Math.random` and `Date.now` in `src/pure/` and `src/sim/` (CLAUDE.md's hard rule; today only `performance` is banned globally and the rest is seven per-file regexes) | 2 guards |
| CORE ∩ shipped | every call site classed CORE whose subject is the default run: the FAIR-GAP probe, whole-run / pocket-route crossability, damage-plane no-clip, bend cull, render-only-cannot-change-sim, wave-gate softlock guards, wasp aim-lock, fallback mercy, momentum floor, determinism twin runs, frozen movement constants **with** their physical reasoning, FAR camera, static anatomy, palette tokens, "sim cannot tell whether art loaded" | 196 sites / 662 evaluations |
| invariant tier | PURE-INVARIANT ∩ shipped: cheap correct properties (hit-stop only slows a frame, contact shadow never over-strength, a seam pip never advertises a missing ledge, one bad frame never costs a run, hound/polyp tells exceed the reaction cost…). Reported **separately** from CORE: a red here means "a design invariant moved — ask its owner", not "a player will notice" | 738 sites / 1,830 evaluations |
| new behaviour tests | §7.4 items 2-5 (gun-in-hand, corner turns across dt and input timing, coyote/jump-buffer forgiveness, touch-input contract), cross-process determinism of the default run with enemies on, `?hook=1`/`?flow=1` inert at the `mode.js` level | to write |

Measured cost of the kept part today: the 76 non-browser domains took 24.2 s
in run 1 (`timing-full-run-1.json`) and include every CORE∩shipped site; the
kept subset is smaller. The PostToolUse hook's 120 s budget becomes
meaningful again (one gate run took 325 s here, so on this host the hook
cannot finish today).

### 7.2 PLAY gate — real browser, every merge (replaces "smoke" and the browser domain)

One script (proposed `tools/orch/play-gate.mjs`, built on the existing
`tools/playtest/lib/isolated-browser.mjs`, served by `tools/serve.mjs` not
`python3 -m http.server`), three viewports: desktop 1280×800, phone landscape
844×390 and phone portrait 390×844 (`isMobile`, `hasTouch`, DPR 3 — LANE-BRIEF
already names these as the phone checks every lane must do by hand).

1. **Boot the default URL** (`index.html`, plus `?testapi=1` only for the
   harness hooks) to PLAYING — on phones by a *tap*, not a key. Today the
   smoke never boots the default URL (M12: a boot-breaking throw in `main.js`
   is invisible to every headless domain).
2. **No page errors and no console errors or warnings**, and **no URL fetched
   twice** (counts `page.on('request')` per URL — the preload double-fetch).
   Host noise is allow-listed by pattern, not by count: SwiftShader's
   `GL Driver Message … GPU stall` lines appear on this container and mean
   nothing about the game.
3. **Layout bounds**: no visible text in `#shell`, `#overlay`, `#fail` overflows
   its box or the viewport (the "HULLBREAK" clip); HUD panels cover at most an
   agreed share of the viewport and stay out of the play band (the 844×390
   HUD defect; the share is a number for the operator to set, see §7.7).
4. **Device-appropriate copy**: on a coarse pointer, no visible text tells the
   player to press a key (title "PRESS ANY KEY", failsafe "Press R"). This is
   the replacement for `pathcheck-suite-2.mjs:146`, which requires the opposite.
5. **`?selftest=1` PASS** at all three viewports (it exists and no gate runs it).
6. **Deterministic smoke**: the existing `mid-route.json` and
   `transform-slice.json` **plus** a short default-URL six-face script,
   judged by `tools/orch/smoke-verdict.mjs` (best of three stays, flake
   recorded, as merge-task.sh does now).
7. **Safe asset degradation**: one boot with `assets/generated/**` blocked —
   reaches PLAYING, fallbacks draw, no failsafe panel, and the sim state after
   N frames equals the art-loaded run's (fix and promote
   `tools/playtest/sprite-fallback-check.mjs`; M10 shows today's guard is a
   name list).
8. **Did the shipped look arrive?** Per viewport, how many art surfaces
   reached `ready` at boot versus their fallback, read from the game's own
   diagnostics (`window.__HB_PRELOAD` / `__HB_SPRITES` / `__HB_HULL_TEX` /
   `__HB_BACKDROP`, exactly as `verify-bundle.mjs` reads them) — always
   reported, gated on a GPU host. On this container 38 files missed the boot budget
   (2.5 s desktop, 6.5 s mobile) in 2 of 3 fresh boots
   (`tools/orch/evidence/phone-probe.json`).
9. **Frame budget** (`worstMs` / `over20ms` under the 256-projectile stress,
   entry 18): *reported* on SwiftShader hosts, *gated* only on a GPU host — on
   this container a frame-time number is a measurement of the other lanes.
   The material/idle-upload/MSAA hygiene that `render-submission-contract`
   checks today moves here, with a per-run output directory (§8 issue 1).

### 7.3 DEEP suites — optional, nightly or on demand, never merge-blocking

- **Fixtures and prototypes** (`?slice=traversal`, `?slice=transform`, `?g2=1`,
  `?ribrun=1`, `?pace=`, `?flow=1`, hound/polyp/mortar trial stages): 467
  call sites classed CORE∩flag or PURE-INVARIANT∩flag/harness, including the
  driven rib-run and fallback-exploit proofs. They are correct and they guard
  opt-in builds; run them when someone touches those fixtures.
- **Harness self-tests** (`t-018`, `t-025`, `t-027`, `t-029`): keep with
  `tools/playtest/`; they protect the instrument, not the game.
- **Mutation sample**: `tools/orch/mutation-sample.mjs` (this audit's) plus
  `tools/gatecheck.mjs`'s three FAIR-GAP controls — rerun after any gate
  change; a kill rate that drops is a gate regression.
- **Distributions** (entry 19): `tools/pressure-envelope-check.mjs` and the
  six-face policy bot runs, reported as best/worst/spread, never gated.
- **Release gates**: `tools/deploy/verify-bundle.mjs` and `verify-pages-site.mjs`
  before every Pages tag (add a phone viewport and console-warning capture).

### 7.4 Behaviour tests to add (each with its currency and its falsifier)

Entry 10's rule: a box names the currency and the test that would falsify it;
entry 21's: a new test binds only when shown red on the defect. Each row names
the mutant in `tools/orch/mutants.mjs` that must turn it red.

| # | test | currency (what a player notices) | falsified by | tier |
|---:|---|---|---|---|
| 1 | **Phone shell: layout, copy, network** — at 390×844 and 844×390 with touch: no text overflow, no keyboard-only instructions on a coarse pointer, HUD coverage bound, zero console warnings, one fetch per URL | the title reads "HULLBREAKER" not "HULLBREAK"; a phone player is told to tap; the HUD leaves the play field; the boot does not download its art twice | B2, B3, B5, M28 — and the current tree (all four integrator defects are present at 38d0409, so this test starts red until they are fixed) | PLAY |
| 2 | **Gun in hand** — for every RIG locomotion/aim frame and all 8 aim angles, the gun group's origin lies within ~1 painted pixel at FAR of that frame's measured hand anchor (atlas alpha or authored hand point) | the gun sits in RIG's hands (entry 20) | B1, M31 (both survive today) | CORE |
| 3 | **Corner turns across frame rates and input timing** — every corner, held-right+jump policy at dt ∈ {1/120, 1/60, 1/30, 0.05} × N seeded input jitters: the ritual starts only with RIG at the joint, RIG never ends a frame on an unbuilt facet or behind the seal, the camera commits, the next face is reached within T s; the failure *distribution* is reported, the gate is zero failures | "the turns work right all of the time" (entry 20) | B4 (survives today) | CORE |
| 4 | **Input forgiveness** — run off a lip with the air jump withheld and press jump k frames late: k ≤ coyote frames jumps, beyond does not; press k frames before landing: k ≤ buffer frames fires on landing | a late or early press is forgiven exactly as tuned | M01 (survives the whole suite today: the assertion named "one coyote window" is satisfied by the air jump) | CORE |
| 5 | **Touch input contract** — synthetic touch sequences through the shipped touch scheme reach `src/sim/input.js` as the intended intents (move, fire, jump, air jump), start a run from the title and dismiss the failsafe panel | the phone controls do what they claim (whether they feel good stays the operator's verdict) | any edit that breaks the touch→intent mapping; today **no test references `src/ui/touch-controls.js` at all** | CORE (+ PLAY row) |
| 6 | Default-URL boot + safe degradation in the PLAY gate (§7.2 items 1 and 7) | the game a player opens boots; missing art never changes play | M12, M10 | PLAY |
| 7 | Cross-process determinism of the default run with enemies on, plus the static `Math.random`/`Date.now` ban | replays and bot evidence stay honest | M05 (caught today only because the jitter landed inside `g1-1`'s compared window) | CORE |
| 8 | `?hook=1` / `?flow=1` inert at the `mode.js` level (child process, no query) | the rejected hook never arms by default | M07 (survives today: the existing check calls the pure function with its default arguments) | CORE |

### 7.5 Deletion list (with reasons)

Per call site, with its reason, in `tools/orch/test-audit.json` → `sites[]`
where `disposition` is `DELETE` (508) or `REWRITE-AS-BEHAVIOUR` (139); compact lists in `lists.delete`, `lists.rewriteAsBehaviour`, `lists.deleteWholeDomains`, `lists.deleteStandalone`.

| bucket | call sites | why |
|---|---:|---|
| RETIRED | 59 | guard superseded designs: dare wager (entries 9/10/21 — e.g. `pathcheck-suite.mjs:974-994`, `pursuit-model.mjs:69`, `pacing-variants.mjs:110-199`), hook v1 (entry 5 — `snap-hook-driven-through-real-sim.mjs` whole, `movement-verb-prototypes.mjs:86-254`), the keyboard-only device (entry 20 — `pathcheck-suite-2.mjs:146`) |
| TAUTOLOGY | 16 | stale/foreign result files (`render-submission-contract.mjs:24-28`), values compared to the constants they are computed from (`t-040-rig-sprite.mjs:110-111`), a domain re-checking what the prelude guard already exits on (`t-011-juice-feedback-pass.mjs:283`), checkers' own printed counts grepped by their wrappers (`*-contract.mjs` second assertions) |
| PIN (no CORE intent) | 433 | regex over source, exact counts and exact constants nobody decided: e.g. `mod-route-visibility.mjs` (statement sequences), `crown-command-architecture.mjs` (31 parts, 19 regexes), `boot-registry-contract.mjs` ("13 views, 31 reset owners"), `t-057-hull-shimmer.mjs`, `cp4-promotion-full-run-tune.mjs` ("exactly the slice table halved"), the golden level fingerprint and 583/90/79 shape (`pathcheck-suite.mjs:774-790` — marked `core`, so in the rewrite bucket below) |
| PIN with CORE intent → **rewrite first, then delete** | 139 | the property matters but the test reads code: frame-loop fault handling by regex (`pathcheck-suite-2.mjs:231-269`), asset-failure fallbacks by regex (`t-049-hostile-sprites.mjs:258-284`, `t-051-backdrop.mjs:179-237`), corner wiring by regex (`fold-handoff-player-ownership.mjs:113-128`), title keypress handling by regex (`t-013-game-shell.mjs:320-336`), pool allocation shapes, the golden fingerprint. Each is replaced by a §7.2/§7.4 behaviour test before it goes |
| whole domains (already counted in the rows above) | 7 domains (38 sites) | every line of `snap-hook-driven-through-real-sim`, `t-057-hull-shimmer`, `mod-route-visibility`, `capsule-reliquary-contract`, `enemy-ecology-render-contract`, `hostile-presenter-contract`, `boot-registry-contract` is disposed DELETE or REWRITE; three more (`cp4-promotion-full-run-tune`, `t-012-audio-layer-static-guards`, `crown-command-architecture`) keep only their pure lines |
| standalone checks | 15 | 14 PIN-dominant checks, plus `foreground-pack-check` (red here only because ImageMagick is absent: port it off `magick` or delete it). Three more are red today for a cause nobody has diagnosed (`enemy-ecology-runtime-check`, `enemy-motion-check`, `rig-slender-check`) and are marked TRIAGE, not DELETE: a red check may be the one telling the truth, so its owner decides (`tools/orch/standalone-spec.mjs` verdicts) |

Nothing in the CORE ∩ shipped list is deleted, weakened, or moved out of the
per-change gate. Entry 21's never-weaken list (boot, page errors,
determinism, layer purity, reachability, no softlock, the movement envelope,
the frame budget, safe asset degradation) maps entirely onto §7.1/§7.2 —
several of those properties are *strengthened* (determinism ban, boot of the
default URL, behavioural asset degradation, frame budget on real GPUs).

### 7.6 Migration plan — runs AFTER the wave-1 lanes merge

Wave-1 lanes are adding pathcheck domains now; touching `tools/pathcheck/`
before they land buys merge conflicts in exactly the file the T-037 split was
built to keep conflict-free. So:

0. **Now (this branch, no conflict surface):** land `tools/orch/` (tools,
   evidence, `test-audit.json`) and this proposal. Zero runtime effect. The
   integrator records the adoption as a `decisions.md` entry — it changes
   the merge process, so it is not a lane's call.
1. **After wave 1 merges — re-census.** `node tools/orch/test-census.mjs`
   reports every new domain as `no spec for domain X` in `problems`; classify
   each with the same rubric (a 10-minute job per domain) so the numbers in
   §3 are current before anything is deleted.
2. **Write the new tests first** (§7.4), each landing with a `mutants.mjs`
   entry that turns it red; run the mutation sample before and after — the
   kill rate of the kept gate must not drop.
3. **Split the manifest, don't fork the runner**: `manifest.mjs` exports
   `CORE_DOMAINS` and `DEEP_DOMAINS` (order preserved; the three SHARED
   producers `pathcheck-suite`, `view-scale-experiment`, `world-transitions`
   stay first in both — they are also where shipped CORE lines live, so split
   them by moving flag-only blocks into new deep domains rather than the
   reverse). `node tools/pathcheck.mjs` = core; `--deep` = everything. The
   unlisted-module guard stays.
4. **Move the browser out of pathcheck**: `render-submission-contract`
   becomes a PLAY-gate step with a per-run output directory; merge-task.sh
   runs CORE (worktree) → PLAY (pinned worktree, `tools/serve.mjs`) → CORE
   (post-merge, *not* the full suite twice).
5. **Delete in reviewed batches** — RETIRED, then TAUTOLOGY, then plain PIN,
   then each REWRITE once its replacement is green and proven red — every
   batch listing site + reason (entry 21 requires the reviewer to check each),
   and re-running the mutation sample after each batch.
6. **Docs** (integrator-owned): CLAUDE.md "Headless gate" / "Browser smoke"
   lines, `tools/pathcheck/README.md`, the ORCHESTRATION merge playbook.

### 7.7 Not decided here (operator / integrator)

- Adopting the three-tier gate is a process decision → a new `decisions.md`
  entry, not this lane's.
- The HUD coverage bound and the touch-copy wording are feel/look calls for
  the operator: the PLAY gate needs a number and a sentence, not a verdict.
- Whether flag-only fixtures (traversal slice, transform demo, G2, rib run,
  paces, trial stages) are still wanted at all — if not, their 467 deep-suite
  sites go with them.

## 8. Proposed inbox issues

Per LANE-BRIEF, numbered `I-???` for the integrator to assign.

```
## I-??? | bug | S2 | repro: node tools/orch/pathcheck-timed.mjs on a loaded host (1-min load 23.6 recorded) at 38d0409 | evidence: tools/orch/evidence/timing-full-run-1.json + .log
render-submission-contract reads its verdict from a FIXED shared path,
/private/tmp/hullbreaker-pathcheck-render-submission/result.json. In T-108's
run the perf probe timed out at 300 s, yet all three of its result
assertions PASSED — they read a result.json written an hour earlier by some
other run on the host (mtime 20:23 vs run 21:20). Two lanes running pathcheck
at once can likewise read each other's result. Fix: per-run output dir
(mkdtemp), delete before spawning, and assert the file's mtime/nonce. Better:
move the probe out of pathcheck into the PLAY gate (proposal §7.2).

## I-??? | bug | S2 | repro: node tools/orch/pathcheck-timed.mjs (1-min load 23.6 recorded) | evidence: tools/orch/evidence/timing-full-run-1.json
One browser domain is 92.5 % of the headless gate's wall time (300.9 of
325.3 s) and its verdict moves with host load (it failed here). merge-task.sh
runs the full pathcheck twice per merge and the PostToolUse hook runs it after
every src/ edit with a 120 s budget it can no longer meet. Fix: proposal §7.1
(CORE gate without a browser) + §7.2.

## I-??? | bug | S3 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M28 | evidence: tools/orch/evidence/mutation-results.json
tools/pathcheck/pathcheck-suite-2.mjs:146 REQUIRES the failsafe hint to name
"R" and a "button" — the keyboard copy the integrator observed on phones.
Fixing the copy for touch (M28: "Tap the button to play again.") turns the
gate red. Retire the assertion (entry 20 superseded the keyboard-only
device) and replace it with the PLAY-gate device-copy check.

## I-??? | bug | S3 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M01 | evidence: tools/orch/evidence/mutation-results.json
Coyote time has no binding test. Setting coyoteUntil = gameMs while grounded
(src/sim/player.js:429 — no coyote window at all) leaves all 76 headless domains green; the FAIR-GAP
assertion named "a press up to 6 frames late (one coyote window) still
crosses" is satisfied by the AIR JUMP, as its own comment explains. Add the
input-forgiveness test (proposal §7.4 #4).

## I-??? | bug | S3 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M07,M10 | evidence: tools/orch/evidence/mutation-results.json
Two hard rules are guarded only at the wrong level: (a) arming ?hook=1 by
default in src/mode.js stays green (the "flags off is the shipped game" check
calls the pure resolver with default arguments); (b) a sim branch on a
render-set global (globalThis.__HB_ART_READY__) stays green (the entry-16
guards are name lists: sprite|preload|TextureLoader|assets/…). Add the
mode-level inertness check and the behavioural degradation run (§7.4 #6, #8).

## I-??? | bug | S3 | repro: grep -n "banned" tools/pathcheck/_context.mjs | evidence: tools/pathcheck/_context.mjs:74
guardLayer bans `performance` but not `Math.random` or `Date.now` in src/sim
and src/pure; CLAUDE.md states all three as a hard rule. Seven per-file
regexes cover a handful of modules. M05 (Math.random in sim/hostiles.js) was
caught only because g1-1's compared window happened to contain a wasp dive.

## I-??? | harness | S3 | repro: node tools/orch/standalone-census.mjs | evidence: tools/orch/evidence/standalone-census.json
29 of 39 standalone checks are run by nothing automatic; six are red on this
tree (enemy-ecology-runtime, enemy-motion, finale-pacing, foreground-pack
[needs ImageMagick], rig-slender, playtest/sprite-fallback [TimeoutError]) and
three time out at 300 s (assets/check, gatecheck, movement/selftest).
rig-slender-check reports "body emission must remain zero outside explicit
overdrive action" — either a real RIG look regression or a stale pin; it needs
an owner's call, as do enemy-motion-check ("wasp frame 0: substantial opaque
body") and enemy-ecology-runtime-check (marked TRIAGE in the audit, not
DELETE). Each ungated check should move into a gate or be deleted (proposal
§7.5).

## I-??? | harness | S3 | repro: read tools/orch/merge-task.sh step 6 | evidence: tools/playtest/scripts/mid-route.json:4, transform-slice.json:4
The merge-gate smoke boots only opt-in fixtures (?slice=traversal and
?slice=transform&enemies=0), never the default URL a player opens, at a
desktop/480x300 viewport with keyboard input, and serves the worktree with
python3 -m http.server although CLAUDE.md (T-024) says to use tools/serve.mjs.
Fix: proposal §7.2.

## I-??? | art | S2 | repro: node tools/orch/phone-probe.mjs on the loaded host at 38d0409 | evidence: tools/orch/evidence/phone-probe.json
In 2 of 3 fresh boots of the default URL on this loaded host 38 art files
missed the preload boot budget: at desktop the 2.5 s one ("still loading
after 16333ms of the 2500ms boot budget; the game is starting without it"),
at 390x844 portrait even the widened 6.5 s mobile one ("after 15039ms of the
6500ms boot budget"). Those runs play their whole length on fallback bodies
(textures that arrive after the gate closes are disposed, by design). The
mobile budget was widened because real iPhone/Safari evidence showed the
large depth sources losing the 2.5 s race on Pages (src/render/preload.js:70-77),
so this failure mode is known on the real device; whether 6.5 s is enough
there is measured by no gate. A candidate contributor to entry 20's "on mobile
some things don't render correctly", NOT a confirmed cause (measured on a
CPU-starved container, not an iPhone). Nothing in any gate measures how often
the shipped look actually arrives; verify-bundle checks it once, at 1280x800,
at release time. Fix direction: make "art reached ready at boot" a reported
PLAY-gate number per viewport, and let the operator decide whether a late
texture should swap in instead of being discarded.
```

## 9. Honesty / limitations

- **The classification is a judgement, made fast.** 2,049 call sites were
  classed in one lane's sitting: 1,046 by explicit line ranges, 893 by a
  domain default chosen after reading the domain, 110 by the source-text rule.
  The spot check in §3.1 puts the error at about one in eight (5 of 40) for
  the default-classified PURE-INVARIANT sites. The per-site JSON exists precisely
  so a reviewer can disagree line by line; `tools/orch/test-census.mjs`
  re-derives every count from the spec in under a second.
- **The source-text detector is lexical** (`tools/orch/lib/features.mjs`):
  it tracks variables assigned from `readFileSync` and anything derived from
  them by name, so it over-flags reused names (57 flagged sites are classed
  something other than PIN by hand, e.g. `catwalk-built-prefix-visibility`
  evaluates a function it extracted from render source — real behaviour,
  fragile mechanism) and misses source read through helpers it does not
  recognise (242 PIN sites are not text reads: exact counts and constants).
- **The mutation sample is small and chosen, not random.** 42 mutants (26
  property, 5 refactor, 4 intended/fix, 5 blind, 1 equivalent, 1 robustness),
  run in batches in two scratch trees and joined with `mutation-sample.mjs
  --merge`: the first run (34 mutants), `-batch2` (6) and `-batch4` (M27,
  M27h; an interrupted third batch, the original one-edit M27 that hung
  before `--timeout-ms` existed, was replaced by it and not kept). Six were
  re-run for reproducibility into `tools/orch/evidence/mutation-recheck.json`:
  same red/green, same named-assertion hit, same failing domains and counts.
  Mutants were written to break a property the way a plausible regression
  would; a different author would pick different ones. Kill rates are
  evidence about the *kind* of assertion, not a precise defect-detection
  probability. Every mutant is re-runnable and its anchor is checked before
  it applies.
- **Subset runs.** Every mutant except M13 ran all 76 headless domains; none
  ran the browser domain except M13, which ran it with only the three SHARED
  producers ahead of it. A mutant that only
  the browser domain could catch would be under-reported — M12/M13 exist to
  show what that domain does and does not see.
- **Timing is from one loaded host.** 1-minute load averages of 23.6–31.6 are
  recorded in the JSONs that record one, 45–60 in `smoke-timing.txt`; the
  standalone census, the mutation runs and the phone probe did not record it.
  The browser domain's 300.9 s is its spawn timeout (`HB_PROBE_SPAWN_MS=300000`,
  set by `tools/orch/cloud-setup.sh` for loaded cloud hosts; the code default
  is 45 s), not its natural runtime, which was not measured on an idle host.
  The *shape* — one domain dominating, the other 76 together well under a
  minute (24–36 s) — is what this audit relies on.
- **Not measured:** the end-to-end wall time of `merge-task.sh` (it requires
  the main checkout and gate verdicts — out of this lane's fence); it is
  stated as the sum of its measured parts. Whether killed hook runs leave
  orphaned probe browsers was not measured.
- **No fun was judged.** Nothing here says a mechanic feels right; "too
  wonky", "sides a little short" and "turns don't work right all of the time"
  remain the operator's to judge. The tests proposed for them measure the
  mechanical precondition (the mapping works, the turn starts at the joint at
  every frame rate), never the feel.
- **One self-inflicted orphan, cleaned up.** The first standalone census sent
  SIGTERM to checks that hit the 300 s timeout; `tools/assets/check.mjs`
  survived it and kept a core busy for ~34 minutes before T-108 noticed and
  killed it. `tools/orch/standalone-census.mjs` now uses SIGKILL; a check's own
  grandchildren (browsers) can still outlive a kill, which is one more reason
  the PLAY gate should own a single browser lifecycle
  (`tools/playtest/lib/isolated-browser.mjs` already does).
