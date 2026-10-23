# T-108 — what the test suite actually protects, and a lean gate (2026-10)

Lane T-108 (harness), branch `task/T-108`. First pass on `main` 38d0409
(2026-10-22); review pass (2026-10-23) after merging `main` 2fa58bb into the
branch (c80dad0) and answering `reports/tasks/T-108/review.md` finding by
finding (§10). Answers `decisions.md` entry 21 — *"the tests may be misleading
or not valuable too, i had no idea what i was doing"* — with measurements, not
opinions. Nothing in `src/`, `tools/pathcheck/` or any check was changed; every
tool written for this audit lives under `tools/orch/` and has zero effect on the
game or the gate. Entry 24 has since queued T-120 to rebuild the gate from this
document and T-121 to clean the rest of the codebase; entry 25 released hook v1
and the zip-assembly corner for deletion.

## Executive summary

1. **Valuable in part.** 251 of 2,050 call sites (12 %) are CORE: they drive the real sim or guard a hard rule, and 10 of the 15 CORE-aimed property mutants turned the gate red. Keep them.
2. **A quarter is noise.** 379 sites (18 %) go outright, 50 go with hook v1 and the zip corner (T-121), and 175 pins are rewritten as behaviour tests first. Five bugs placed just outside a pin's regex stayed green (an existence proof, not a rate); 4 of 4 harmless refactors went red.
3. **Blind to what the operator named.** No gate caught, or could have caught, any of the 6 entry-20 or 5 integrator mobile defects; one assertion *requires* the touch-copy bug.
4. **Cost.** At the base one browser domain was ~90 % of a 325–338 s gate run and timed out both times; main now skips it on GPU-less hosts, so here the gate is its headless part (38 s at load 23, 59–76 s at load 32–39) and nothing on this host checks render hygiene.
5. **Do this (§7):** a fast headless gate (1,002 sites), a real-browser PLAY gate on the default URL at desktop and both phone orientations, deep suites for fixtures. Land the behaviour tests first — four are already being written by T-101, T-102, T-103 and T-105 — then delete, keyed by assertion label, re-running the mutation sample after each batch (§7.6).

## How to reproduce every number

All numbers below come from these committed tools and their committed outputs
(`tools/orch/evidence/`); `tools/orch/test-audit.json` is the machine-readable
copy of this whole document. Classification counts are on the merged tree
(c80dad0, whose `tools/pathcheck/` equals main 2fa58bb); where a number is from
the first pass's base (38d0409) the text says so.

| what | command (from the worktree root) | output |
|---|---|---|
| one instrumented full gate run (per-domain wall time, passes, fails) | `node tools/orch/pathcheck-timed.mjs --json tools/orch/evidence/timing-full-run-N.json` (run 3: after `. ~/.hullbreaker-host.env`, as the merge gate and hook do) | `tools/orch/evidence/timing-full-run-{1,2,3}.json` (+ `.log`) |
| per-call-site evaluation counts (a patched **scratch copy** of `_context.mjs`) | `node tools/orch/callsite-census.mjs --scratch <empty dir> --out tools/orch/evidence/callsite-counts.json --skip render-submission-contract` | `tools/orch/evidence/callsite-counts.json` (c80dad0) |
| every standalone check, timed once | `node tools/orch/standalone-census.mjs --out tools/orch/evidence/standalone-census.json` | `tools/orch/evidence/standalone-census.json` (38d0409) |
| the binding mutation sample | `node tools/orch/mutation-sample.mjs --scratch <empty dir> --out <file>` (sample in `tools/orch/mutants.mjs`; `--out` defaults into the scratch dir; this audit ran it in batches and joined them with `--merge … --out tools/orch/evidence/mutation-results.json`; every row records the tree it ran on) | `tools/orch/evidence/mutation-results.json` (+ `mutation-results-batch{2,4,5}.json`) |
| classification join → JSON, and the site-identity check | `node tools/orch/test-census.mjs --print` / `--check` (exit 1 on any problem) / `--write-lock` (hand classification: `tools/orch/test-audit-spec.mjs`, `tools/orch/standalone-spec.mjs`) | `tools/orch/test-audit.json`, `tools/orch/test-audit-lock.json` |
| what the lock catches: one inserted line in a scratch copy | the command in the header of the output file | `tools/orch/evidence/lock-drift-demo.txt` |
| the hand spot checks (PURE-INVARIANT defaults, and the DELETE bucket) | `node tools/orch/audit-tables.mjs --section spotcheck` | `tools/orch/evidence/spot-checks.json` |
| the tables in this document | `node tools/orch/audit-tables.mjs [--section classes\|examples\|domains\|mutation\|fastgate\|standalone\|cost\|spotcheck]` | stdout |
| reproducibility re-run of six mutants | `node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M01,M02,M07,M10,M20,M21 --out tools/orch/evidence/mutation-recheck.json` | `tools/orch/evidence/mutation-recheck.json` |
| the default URL at desktop and both phone orientations (title overflow, keyboard copy on touch, failsafe hint, double fetches, console warnings, HUD coverage, boot-budget misses) | `node tools/orch/phone-probe.mjs --out tools/orch/evidence/phone-probe.json` | `tools/orch/evidence/phone-probe.json` (38d0409) |
| merge-gate smoke, one attempt per script | the command line in the header of the output file (`tools/serve.mjs` on :8758, `run.mjs --deterministic`, `smoke-verdict.mjs`) | `tools/orch/evidence/smoke-timing.txt` (38d0409) |
| inventory sizes in §1 | `wc -l tools/pathcheck/*.mjs`; `grep -l "readFileSync\|readdirSync" tools/pathcheck/*.mjs \| wc -l`; `find tools -name "*-check.mjs" -not -path "*/node_modules/*"`; `ls tools/playtest/scripts/*.json tools/playtest/scripts/adversarial/*.json \| wc -l`; `ok`/`near` split and source-text domains from `test-audit.json` → `sites[].fn`, `sites[].srcText` | stdout |

Host: 4-core cloud container, no GPU (SwiftShader), shared with three other
lanes running browsers. Recorded 1-minute load averages: **22.7–27.1** in the
committed JSONs that record one (`timing-full-run-{1,2,3}.json`,
`callsite-counts.json`), **31.6** in the first pass's call-site census (in git at
798888d) and **45–60** during the smoke runs (`smoke-timing.txt`); the other runs
did not record it. Every wall-clock number is from that host under that load and will
move on another machine. The red/green outcome of the headless domains and of
every mutant does not depend on load; everything that boots a browser or races
a timeout does (the browser domain, the smoke's navigation timeout, the
standalone checks that timed out), and is called out where it occurs.

## 1. What was audited

| surface | size | run by the merge gate? |
|---|---|---|
| `tools/pathcheck.mjs` + `tools/pathcheck/` | 79 modules (77 domains + `_context.mjs` + `manifest.mjs`), 16,755 lines; **2,050 `ok()`/`near()` call sites** (1,937 `ok`, 113 `near`) that evaluate **3,990 times per run**; 49 of the 79 modules read files from disk; 47 of the 77 domains contain at least one assertion whose condition reads source/file text (388 such call sites). Main added one site after the base (render-submission-contract's skip branch) | yes — twice per merge (worktree, then main post-merge), plus the PostToolUse hook after every `src/` edit (since ea09b88 with the browser probe skipped) |
| standalone checks | 35 `*-check.mjs` files (30 directly in `tools/`, 5 in `tools/perf/`, `tools/playtest/`, `tools/vertical-assault/`), plus `tools/assets/check.mjs`, `tools/gatecheck.mjs`, `tools/movement/selftest.mjs`, `tools/deploy/asset-union-selftest.mjs` — **39 surfaces** | 10 of 39, only because a pathcheck `*-contract.mjs` domain spawns them |
| in-page `?selftest=1` | 48 `check()` call sites (some in loops), `src/main.js:873-1135` | no |
| deploy verifiers | `tools/deploy/verify-bundle.mjs`, `tools/deploy/verify-pages-site.mjs` | no (release-time) |
| merge-gate smoke | `tools/playtest/run.mjs` on `scripts/mid-route.json` + `scripts/transform-slice.json`, `--deterministic`, judged by `tools/orch/smoke-verdict.mjs` | yes |
| playtest capture scripts | 58 `tools/playtest/*.mjs` (3 harness, 3 browser checks, 52 capture/stress/probe tools — per file in `test-audit.json` → `standalone.playtestFiles`) and 60 bot scripts (42 in `tools/playtest/scripts/`, 18 in its `adversarial/`, whose 19th entry is `repeat.mjs`) | 2 of 60 scripts (the smoke) |

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
  deletion: it stays until a behaviour test that catches the same mutant
  replaces it.
- **RETIRED** — guards a superseded design: the dare wager (entries 9/10,
  named in 21), asset independence (16), blanket off-by-default flags (16),
  the keyboard-only device (20 superseded "No touch"), hook v1 (5, released
  for deletion by 25), zip-assembly as the world's reveal (3, its code released
  for deletion by 25).
- **TAUTOLOGY** — cannot fail, or checks data against itself, against a
  checker's own printed count, or against a stale/foreign result file.
- **SLOW-ENV** — needs a real browser or wall-clock timing; its verdict moves
  with host load.

Scope is recorded separately from class: **shipped** (the default URL a player
gets) vs **flag** (an opt-in fixture or prototype: `?slice=traversal`,
`?slice=transform`, `?g2=1`, `?ribrun=1`, `?pace=`, `?hook=1`, `?flow=1`, trial
stages) vs **harness** (self-tests of the playtest instrument).

Class and scope give each site a **disposition**: CORE∩shipped → the fast
CORE gate; PURE-INVARIANT∩shipped → its invariant tier; CORE/PURE-INVARIANT on
a flag or the harness → DEEP; SLOW-ENV → the PLAY gate; PIN/TAUTOLOGY with a
CORE intent → REWRITE-AS-BEHAVIOUR (kept until replaced); other PIN, RETIRED,
TAUTOLOGY → DELETE. Two marks refine it: **SPLIT-ASSERTION** — the assertion
conjoins a property worth keeping with pinned conjuncts, so it stays and only
the pins go; **DELETE-WITH-FEATURE** — it guards hook v1 or the zip corner, so
T-121 deletes it together with that code (entry 25), not T-120's batches.

**Site identity.** A call site is *(domain, label)* — its static message text,
not its line. Lanes edit domains and shift lines, and a line range then
silently reclassifies its neighbours: `tools/orch/evidence/lock-drift-demo.txt`
shows one inserted comment line in `pathcheck-suite-2.mjs` moving 47 sites and
silently turning 8 of them from invariant-tier or rewrite into DELETE. So the
hand classification is label-keyed where it matters (`SITES` in the spec),
every list in `test-audit.json` carries the label, and
`tools/orch/test-audit-lock.json` records each site's label, line, class and
disposition at c80dad0; `test-census.mjs --check` exits 1 on a drifted verdict,
a vanished site or an unclassified one.

## 3. Classification results

### 3.1 pathcheck, by class (`node tools/orch/audit-tables.mjs --section classes`)

| class | call sites | % sites | evaluations/run | % evals | shipped sites | flag-only sites | harness sites |
|---|---:|---:|---:|---:|---:|---:|---:|
| CORE | 251 | 12.2% | 773 | 19.4% | 199 | 52 | 0 |
| PURE-INVARIANT | 1191 | 58.1% | 2412 | 60.5% | 803 | 317 | 71 |
| PIN | 534 | 26.0% | 697 | 17.5% | 428 | 81 | 25 |
| RETIRED | 62 | 3.0% | 62 | 1.6% | 17 | 45 | 0 |
| TAUTOLOGY | 8 | 0.4% | 42 | 1.1% | 8 | 0 | 0 |
| SLOW-ENV | 4 | 0.2% | 4 | 0.1% | 4 | 0 | 0 |
| **total** | **2050** | | **3990** | | 1459 | 495 | 96 |

PIN detail: 308 of 534 PIN sites read source/file text; 175 PIN/TAUTOLOGY sites carry a CORE intent (REWRITE candidates).
Resolution: 180 sites classified by a label-keyed hand entry, 1057 by a hand line range, 813 by their domain's hand default, 0 by the mechanical source-text rule.

| disposition | call sites | evaluations/run | where it ends up |
|---|---:|---:|---|
| CORE-GATE:invariant-tier | 803 | 1926 | fast headless gate (invariant tier) |
| DEEP | 435 | 589 | optional deep suite |
| DELETE | 379 | 569 | deleted (T-120 batches) |
| CORE-GATE | 197 | 663 | fast headless gate |
| REWRITE-AS-BEHAVIOUR | 175 | 182 | kept until a behaviour test replaces it |
| DELETE-WITH-FEATURE | 50 | 50 | deleted with hook v1 / the zip corner (T-121) |
| SPLIT-ASSERTION | 7 | 7 | kept in its tier; only the pinned conjuncts go |
| PLAY-GATE | 4 | 4 | real-browser PLAY gate |

How each class was assigned (counts in the *Resolution* line above): a
label-keyed hand entry wins, then the narrowest hand-written line range, then
the domain's hand-written default, chosen after reading the domain. The
first pass let a mechanical rule ("the condition reads source/file text ⇒
PIN", `tools/orch/lib/features.mjs`) decide 110 sites; the review found 20 of
them were not source-text conditions at all — one of them a static-anatomy
proof — so the review pass hand-classified all 110 and the rule now decides
none. The detector still runs, as evidence: it flags 80 sites that are not
PINs and misses 226 PINs that read no file.

**How wrong is it?** Three samples, all committed:

**Spot check: PURE-INVARIANT by domain default** — first pass, on the classification committed at 798888d; pool 754, seed 7, 40 drawn: 35 right, 0 borderline, 5 wrong.

| site | verdict | why |
|---|---|---|
| `authored-slope-rib-run.mjs:214` | D → PIN | the fixture fields exactly the flanges it was built from: data checked against itself (applied in the review pass) |
| `t-047-light-rig.mjs:134` | D → PIN | asserts the escape-hatch rig keeps its old defect (applied in the review pass) |
| `t-047-light-rig.mjs:139` | D → PIN | asserts the escape-hatch rig keeps its old property (applied in the review pass) |
| `t-052-hull-texture.mjs:97` | D → TAUTOLOGY | re-derives the placement formula it tests (applied in the review pass) |
| `t-051-backdrop.mjs:137` | D → TAUTOLOGY | re-derives the placement formula it tests (applied in the review pass) |

**Spot check: the DELETE bucket** — review pass (2026-10-23), on the c80dad0 classification just before its last two edits (the t-011 [48,57] range, and the four D sites of the first spot check, which joined the bucket afterwards); pool 378, seed 11, 40 drawn: 29 right, 10 borderline, 1 wrong.

| site | verdict | why |
|---|---|---|
| `world-transitions.mjs:274` | B | a timing relation of the transform-slice choreography (arm window outlasts the swing): arguably PURE-INVARIANT, DEEP either way |
| `world-transitions.mjs:289` | B | choreography ordering in the transform slice: arguably PURE-INVARIANT (DEEP) |
| `world-transitions.mjs:365` | B | choreography ordering in the transform slice: arguably PURE-INVARIANT (DEEP) |
| `t-011-juice-feedback-pass.mjs:54` | D | burst-spec validity (count/speed/ms/size > 0): schema integrity, not a constant; the [48,57] range is now PURE-INVARIANT |
| `t-027-bot-harness-deterministic-dispatch.mjs:80` | B | harness determinism (timeline installed before navigation) checked by regex: worth a behavioural replacement inside tools/playtest |
| `t-029-runtime-truth-three-debug.mjs:88` | B | a pure copy function (pluralization) tested with exact strings: arguably PURE-INVARIANT |
| `t-035-value-ladder.mjs:261` | B | a measured look limit at the approved dose (entry 14): arguably PURE-INVARIANT |
| `t-047-light-rig.mjs:63` | B | the flat escape hatch casts nothing at exposure 1: escape-hatch exactness, arguably PURE-INVARIANT |
| `t-044-corner-setpieces.mjs:126` | B | authored arena widths inside the maneuver band: static authored-geometry bounds, arguably PURE-INVARIANT |
| `t-052-hull-texture.mjs:204` | B | every material bucket has a surface entry: referential integrity worth keeping, but read out of source text |
| `t-054-hull-contrast.mjs:72` | B | the tile stays above 80 CSS px: a measured look bound, arguably PURE-INVARIANT |

The reviewer's independent draw (83 sites, `reports/tasks/T-108/review.md`)
agreed with 76 % strictly and 92 % with borderline cases, and found the
first pass's 1-in-8 PURE-INVARIANT estimate held (2 of 20). The defects were
not spread evenly: they sat in the dispositions that delete things, in domain
defaults and in the mechanical rule — which is why the review's targeted probes
found the blockers the random draws did not. Read PURE-INVARIANT as an upper
bound; read the DELETE bucket as one where about a quarter of the lines are
defensible either way (`B`), and where each wrong line found so far guarded a
real property.

### 3.2 Examples (`--section examples`)

| class | example (file:line) | what it asserts |
|---|---|---|
| CORE | `t-009-whole-run-crossable-driven.mjs:111` | T-009: a held-jump policy survives the whole lattice (state … , lives … ) |
| CORE | `pathcheck-suite.mjs:606` | every face-1 gap before the first wave gate is crossable from the deck at SCROLL speed … with one held jump, window >= … — *FAIR-GAP: every face-1 gap crossable at the SCROLL FLOOR, with speed meter + negative control (I-021/I-024)* |
| CORE | `damage-plane-never-leaves-geometry-behind.mjs:80` | a plane-pinned player never ends a frame inside terrain, got … frames |
| CORE | `g1-1-render-only-proved-sim.mjs:138` | every simulated value is identical between ?zip=1 and the default: scroll, … gate state, ritual clock, built columns, … |
| CORE | `future-facet-render-ownership.mjs:37` | pre-turn render ownership exposes zero future rows (got ${futureVisible}) — *static anatomy (entry 3): runs the real routeRenderOwned over every column — zero future-face rows visible before the turn (review finding …* |
| PURE-INVARIANT | `t-011-juice-feedback-pass.mjs:62` | T-011: hit-stop is a dt SCALE in (0,1] — it can only ever slow the … frame, so every tunneling/substep margin asserted … |
| PURE-INVARIANT | `pathcheck-suite-2.mjs:51` | T-032: ONE bad frame is a blip — it never costs a run — *fault-streak policy: one bad frame never costs a run; storms restart bounded times then stop legibly* |
| PURE-INVARIANT | `t-038-seam-pips.mjs:63` | seams: every pip sits inside its own run's [s0,s1) — a pip run can never … advertise a ledge that does not exist ( … … |
| PURE-INVARIANT | `view-scale-experiment.mjs:159` | hound telegraph is at least twice the reaction cost of jumping clear ( … : tell … s vs … s) — *hound tell vs reaction cost, per tune — row one is the shipped normal tune* |
| PIN | `mod-route-visibility.mjs:14` | each clone slot clears stale art before requiring a present, route-owned trail sample — *render ownership by regex (nothing renders on an unbuilt or off-camera facet, entry 3): replace with the PLAY-gate ownership probe (§7.2 …* |
| PIN | `pathcheck-suite.mjs:790` | normal generator fingerprint unchanged, got — *golden generator shape 583/90/79 and fingerprint 10d82694: fails on every intentional level change* |
| PIN | `pathcheck-suite-2.mjs:245` | T-032: a simulation fault is caught and handed to the policy — *frame loop structure (halt check first, rAF before work, try/catch around update and draw) by regex* |
| PIN | `crown-command-architecture.mjs:51` | production is a frozen 31-part modular organ; the seven-part former plinth is capture-only |
| PIN | `boot-registry-contract.mjs:16` | registry manifests retain every declared owner — *exact "13 views, 31 reset owners" — proxy for the retry-replay property: replace (§7.4 #9, falsifier M34) before deleting* |
| RETIRED | `pathcheck-suite-2.mjs:146` | T-032: the panel names BOTH ways back in (a key and a button), got " … " — *panel must name "R" and "button" — the keyboard-only device assumption entry 20 superseded; it pins the touch-device copy defect* |
| RETIRED | `pathcheck-suite.mjs:994` | dare entry margin covers backtrack plus scroll advance and preserves the exit margin — *dare entry margin covers the backtrack (dare wager, entries 9/10/21)* |
| RETIRED | `snap-hook-driven-through-real-sim.mjs:207` | the zip arrives and dangles before it throws (the boards’ dangle) — *hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121* |
| RETIRED | `pursuit-model.mjs:69` | entering the dare pocket drops the edge to pocketSpeed on the same frame — *entering the dare pocket drops the edge to pocketSpeed (dare wager, entries 9/10/21)* |
| TAUTOLOGY | `t-040-rig-sprite.mjs:110` | T-040: gun inner x matches the exported constant — *gun inner/outer x "matches the exported constant" — the value is computed from that constant* |
| TAUTOLOGY | `t-011-juice-feedback-pass.mjs:283` | T-011: sim layer imports no render module: — *sim imports no render module — already enforced by _context.mjs guardLayer (exits before any domain), so this line can never be the one …* |
| TAUTOLOGY | `actor-motion-contract.mjs:16` | atlas geometry, clips, sockets, preload, and death continuity stay registered — *greps "ACTOR MOTION: N/N contracts passed"* |
| SLOW-ENV | `render-submission-contract.mjs:41` | the permanent real-browser performance probe boots the shipped scene — *the probe boots the shipped scene (real browser; host-load dependent) — PLAY gate* |
| SLOW-ENV | `render-submission-contract.mjs:43` | every built transparent DoubleSide material is single-pass or carries a named exception — *frame-budget hygiene (material passes, idle uploads, MSAA) — PLAY gate, gated on a GPU host (§7.2 item 9); no longer stale since e29665b* |

### 3.3 Every domain (`--section domains`)

`ms (run 1)` is from `tools/orch/evidence/timing-full-run-1.json` (38d0409). A
verdict says where a domain *lives*: CORE-GATE, DEEP, SPLIT (its kept lines go
to more than one tier), REWRITE (nothing headless kept; replaced first) or
DELETE (nothing kept: its lines are deleted, replaced first, or go with their
feature). PIN, RETIRED and TAUTOLOGY lines inside a kept domain are still
deleted line by line (§7.5). `test-census.mjs` lists in `problems` any verdict
its own sites contradict — none today.

| # | domain | scope | sites | evals | CORE | P-INV | PIN | RET | TAUT | SLOW | ms (run 1) | verdict |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 0 | `pathcheck-suite` | shipped | 135 | 168 | 21 | 81 | 21 | 12 |  |  | 3990 | SPLIT |
| 1 | `view-scale-experiment` | flag | 135 | 214 | 3 | 123 | 8 | 1 |  |  | 8 | SPLIT |
| 2 | `world-transitions` | flag | 115 | 144 | 4 | 57 | 52 | 2 |  |  | 88 | DEEP |
| 3 | `g2-neck-access-plate-flip-gate` | flag | 111 | 132 | 15 | 81 | 15 |  |  |  | 176 | SPLIT |
| 4 | `pacing-variants` | flag | 25 | 25 | 2 | 18 | 1 | 4 |  |  | 2 | DEEP |
| 5 | `movement-verb-prototypes` | flag | 39 | 39 | 1 | 16 |  | 22 |  |  | 3 | SPLIT |
| 6 | `authored-slope-rib-run` | flag | 32 | 32 |  | 30 | 1 | 1 |  |  | 130 | DEEP |
| 7 | `rib-run-driven-through-real-sim` | flag | 11 | 25 | 11 |  |  |  |  |  | 994 | DEEP |
| 8 | `headroom-over-every-authored-ground-run` | flag | 2 | 2 |  | 2 |  |  |  |  | 1 | DEEP |
| 9 | `pursuit-model` | flag | 5 | 5 |  | 4 |  | 1 |  |  | 1 | DEEP |
| 10 | `hull-fallback-tier-1` | shipped | 4 | 4 |  | 4 |  |  |  |  | 0 | CORE-GATE |
| 11 | `charge-threat-prototype` | shipped | 22 | 22 | 1 | 16 | 4 |  | 1 |  | 1 | SPLIT |
| 12 | `cp4-promotion-full-run-tune` | shipped | 11 | 11 |  | 5 | 6 |  |  |  | 0 | SPLIT |
| 13 | `score-wiring-sim-layer` | flag | 12 | 12 | 11 |  | 1 |  |  |  | 102 | DEEP |
| 14 | `cp4-promotion-wiring-default-run-score` | shipped | 11 | 11 | 10 |  | 1 |  |  |  | 498 | CORE-GATE |
| 15 | `snap-hook-driven-through-real-sim` | flag | 21 | 21 | 6 | 1 |  | 14 |  |  | 857 | SPLIT |
| 16 | `damage-plane-never-leaves-geometry-behind` | shipped | 5 | 5 | 4 | 1 |  |  |  |  | 2 | CORE-GATE |
| 17 | `hull-fallback-cannot-pay-itself` | flag | 9 | 9 | 9 |  |  |  |  |  | 620 | DEEP |
| 18 | `g1-limb-read-tower-bend-cull` | shipped | 35 | 51 | 13 | 21 | 1 |  |  |  | 59 | SPLIT |
| 19 | `bend-cull-driven-through-real-bullet` | shipped | 8 | 8 | 8 |  |  |  |  |  | 335 | CORE-GATE |
| 20 | `g1-1-render-only-proved-sim` | shipped | 7 | 7 | 7 |  |  |  |  |  | 1987 | CORE-GATE |
| 21 | `t-002-ritual-decision-trace-frame` | shipped | 33 | 36 | 12 | 20 | 1 |  |  |  | 713 | SPLIT |
| 22 | `t-003-far-view-legibility-compensation` | shipped | 38 | 115 | 2 | 28 | 8 |  |  |  | 38 | SPLIT |
| 23 | `t-012-audio-layer-static-guards` | shipped | 12 | 38 |  | 2 | 10 |  |  |  | 13 | SPLIT |
| 24 | `t-014-spore-mortar` | flag | 53 | 87 | 1 | 45 | 7 |  |  |  | 3 | SPLIT |
| 25 | `t-011-juice-feedback-pass` | shipped | 71 | 115 | 4 | 46 | 20 |  | 1 |  | 30 | SPLIT |
| 26 | `t-013-game-shell` | shipped | 67 | 229 |  | 42 | 25 |  |  |  | 28 | SPLIT |
| 27 | `t-009-six-face-lattice` | shipped | 29 | 29 | 1 | 20 | 8 |  |  |  | 299 | SPLIT |
| 28 | `t-009-static-anatomy-reveal-default` | shipped | 8 | 8 | 2 | 1 | 1 | 4 |  |  | 526 | SPLIT |
| 29 | `t-009-houndframe-stations-six-face` | shipped | 12 | 12 |  | 9 | 3 |  |  |  | 2 | CORE-GATE |
| 30 | `t-009-non-gating-station-cannot` | shipped | 4 | 4 | 4 |  |  |  |  |  | 375 | CORE-GATE |
| 31 | `t-009-whole-run-crossable-driven` | shipped | 5 | 5 | 5 |  |  |  |  |  | 738 | CORE-GATE |
| 32 | `t-009-pocket-route-works-driven` | shipped | 2 | 2 | 2 |  |  |  |  |  | 265 | CORE-GATE |
| 33 | `t-018-bot-harness-relative-geometry` | harness | 46 | 58 |  | 38 | 8 |  |  |  | 8 | DEEP |
| 34 | `t-027-bot-harness-deterministic-dispatch` | harness | 9 | 9 |  | 7 | 2 |  |  |  | 2 | DEEP |
| 35 | `t-025-harness-may-not-report` | harness | 20 | 20 |  | 15 | 5 |  |  |  | 9 | DEEP |
| 36 | `momentum-earned-pace-escalation` | shipped | 72 | 72 | 20 | 50 | 2 |  |  |  | 1530 | SPLIT |
| 37 | `t-029-runtime-truth-three-debug` | harness | 21 | 27 |  | 11 | 10 |  |  |  | 320 | DEEP |
| 38 | `pathcheck-suite-2` | shipped | 47 | 71 |  | 16 | 30 | 1 |  |  | 13 | SPLIT |
| 39 | `t-041-impact-language` | shipped | 14 | 22 |  | 10 | 4 |  |  |  | 2 | CORE-GATE |
| 40 | `t-043-wasp-aim-lock-squad` | shipped | 18 | 18 | 11 | 7 |  |  |  |  | 795 | CORE-GATE |
| 41 | `t-039-contact-shadows` | shipped | 35 | 304 | 3 | 17 | 15 |  |  |  | 74 | SPLIT |
| 42 | `pathcheck-suite-3` | shipped | 27 | 41 | 2 | 19 | 6 |  |  |  | 66 | SPLIT |
| 43 | `t-035-value-ladder` | shipped | 44 | 44 | 5 | 25 | 14 |  |  |  | 524 | SPLIT |
| 44 | `t-038-seam-pips` | shipped | 27 | 32 | 5 | 15 | 7 |  |  |  | 52 | SPLIT |
| 45 | `t-047-light-rig` | shipped | 56 | 116 | 5 | 35 | 16 |  |  |  | 19 | SPLIT |
| 46 | `t-048-post-pass` | shipped | 34 | 34 | 2 | 17 | 15 |  |  |  | 18 | SPLIT |
| 47 | `t-042-audio-punch` | shipped | 30 | 43 | 1 | 17 | 12 |  |  |  | 1590 | SPLIT |
| 48 | `t-050-shipped-plan-carries-the-scale-pass` | shipped | 12 | 21 |  | 6 | 6 |  |  |  | 53 | SPLIT |
| 49 | `t-040-rig-sprite` | shipped | 44 | 47 | 3 | 24 | 15 |  | 2 |  | 5 | SPLIT |
| 50 | `t-044-corner-setpieces` | shipped | 17 | 17 | 3 | 10 | 4 |  |  |  | 781 | SPLIT |
| 51 | `t-049-hostile-sprites` | shipped | 49 | 353 | 2 | 28 | 19 |  |  |  | 660 | SPLIT |
| 52 | `t-052-hull-texture` | shipped | 33 | 49 |  | 15 | 17 |  | 1 |  | 66 | SPLIT |
| 53 | `t-051-backdrop` | shipped | 33 | 343 | 1 | 19 | 12 |  | 1 |  | 32 | SPLIT |
| 54 | `t-054-hull-contrast` | shipped | 22 | 44 |  | 20 | 2 |  |  |  | 564 | CORE-GATE |
| 55 | `t-057-hull-shimmer` | shipped | 6 | 6 |  |  | 6 |  |  |  | 1 | DELETE |
| 56 | `fold-handoff-player-ownership` | shipped | 21 | 21 |  | 14 | 7 |  |  |  | 5 | SPLIT |
| 57 | `future-facet-render-ownership` | shipped | 17 | 17 | 2 | 5 | 10 |  |  |  | 8 | SPLIT |
| 58 | `mod-route-visibility` | shipped | 3 | 3 |  |  | 3 |  |  |  | 0 | DELETE |
| 59 | `limb-fold-bridge-locality` | shipped | 10 | 22 |  | 6 | 4 |  |  |  | 46 | SPLIT |
| 60 | `catwalk-built-prefix-visibility` | shipped | 10 | 10 |  | 5 | 5 |  |  |  | 65 | SPLIT |
| 61 | `vertical-assault-geometry` | shipped | 32 | 329 | 1 | 23 | 8 |  |  |  | 132 | CORE-GATE |
| 62 | `gate-prelude-runtime` | shipped | 18 | 18 | 13 | 4 | 1 |  |  |  | 1015 | CORE-GATE |
| 63 | `capsule-reliquary-contract` | shipped | 2 | 2 |  |  | 2 |  |  |  | 47 | DELETE |
| 64 | `projectile-presentation-contract` | shipped | 8 | 8 | 2 |  | 6 |  |  |  | 919 | SPLIT |
| 65 | `limb-silhouette-production` | shipped | 19 | 25 | 1 | 2 | 15 |  | 1 |  | 47 | SPLIT |
| 66 | `actor-motion-contract` | shipped | 2 | 2 |  | 1 |  |  | 1 |  | 715 | CORE-GATE |
| 67 | `crown-command-architecture` | shipped | 28 | 28 |  | 10 | 18 |  |  |  | 5 | SPLIT |
| 68 | `enemy-ecology-render-contract` | shipped | 2 | 2 |  |  | 2 |  |  |  | 283 | DELETE |
| 69 | `hostile-presenter-contract` | shipped | 2 | 2 |  |  | 2 |  |  |  | 138 | DELETE |
| 70 | `boot-registry-contract` | shipped | 2 | 2 |  |  | 2 |  |  |  | 439 | DELETE |
| 71 | `adaptive-fidelity-contract` | shipped | 2 | 2 |  | 1 | 1 |  |  |  | 148 | CORE-GATE |
| 72 | `render-submission-contract` | shipped | 6 | 6 |  |  | 2 |  |  | 4 | 300866 | REWRITE |
| 73 | `frame-input-contract` | shipped | 10 | 10 | 6 | 1 | 3 |  |  |  | 27 | SPLIT |
| 74 | `gilded-chassis` | shipped | 22 | 25 | 3 | 13 | 6 |  |  |  | 41 | SPLIT |
| 75 | `power-feedback-contract` | shipped | 17 | 19 | 1 | 7 | 9 |  |  |  | 4 | SPLIT |
| 76 | `depth-layer-contract` | shipped | 12 | 19 |  | 5 | 7 |  |  |  | 7 | SPLIT |

### 3.4 Standalone checks (`--section standalone`; one run each, `tools/orch/evidence/standalone-census.json`, 38d0409)

| check | run by the gate? | class | exit here | ms here | verdict |
|---|---|---|---|---:|---|
| `tools/action-vfx-check.mjs` | no | PIN | 0 | 401 | DELETE |
| `tools/action-vfx-v2-check.mjs` | no | PIN | 0 | 6256 | DELETE |
| `tools/action-vfx-v2-runtime-check.mjs` | no | PIN | 0 | 517 | DELETE |
| `tools/actor-motion-check.mjs` | pathcheck | PURE-INVARIANT | 0 | 2700 | CORE-GATE |
| `tools/adaptive-fidelity-check.mjs` | pathcheck | PURE-INVARIANT | 0 | 115 | CORE-GATE |
| `tools/boot-registry-check.mjs` | pathcheck | PIN | 0 | 133 | REWRITE (replace with the retry-replay test, falsifier M34, then delete — review finding 8) |
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

29 of the 39 are run by nothing automatic. Six of those were **red on the base
tree** and nobody had noticed, because nothing runs them:
`enemy-ecology-runtime-check` (an exact visual-identity table drifted),
`enemy-motion-check` ("wasp frame 0: substantial opaque body"),
`finale-pacing-check` (pins "reviewed neutral forms"), `foreground-pack-check`
(shells out to ImageMagick, absent here), `rig-slender-check` ("body emission
must remain zero outside explicit overdrive action"), and
`tools/playtest/sprite-fallback-check.mjs` (Playwright `TimeoutError` on this
loaded host). Three of those six are marked **TRIAGE**, not DELETE: a red check
may be the one telling the truth, and nobody has diagnosed why
`enemy-ecology-runtime`, `enemy-motion` or `rig-slender` fail — their owners
decide. Three more timed out at 300 s: `tools/assets/check.mjs`,
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
excluded by default (≈5 min per run at the base; beyond booting the scene it
only judges material passes, idle uploads and MSAA); M13 runs it, after only
the three SHARED producers. 42 mutants ran on 38d0409 and 6 (M36–M40, M39b) on
c80dad0; between the two, main changed nothing in `src/` or in any headless
domain, so the rows compare.

Mutant kinds: **property** (break the guarded property the way a real
regression could — red is a *kill*); **evasion** (a property mutant deliberately
placed where a pin's regex does not read — an existence proof that a pin can
miss what it names, never a rate); **refactor** (semantics-preserving rewrite —
red is a *false alarm*); **intended** / **fix** (a change a decision allows, or
the fix for an observed defect — red is an *obstruction*); **blind** (reproduce
an entry-20 or integrator-observed defect no class claims to guard);
**equivalent** (kept as a lesson, excluded from rates — M04's first design
changed nothing in the tested scenario); **robustness** (M27h: an incomplete
edit, to see how the gate fails).

### 4.1 Kill rate per class (`--section mutation`)

| target class | property mutants | gate red (killed) | named assertion red | kill rate | evasion cases (pin bypassed) | of those red | harmless refactors | refactors red (false alarms) | intended changes / fixes | of those red (obstruction) | blind defect repros | of those red |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CORE | 15 | 10 | 8 | 0.67 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| SLOW-ENV | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PURE-INVARIANT | 6 | 6 | 5 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PIN | 3 | 3 | 3 | 1 | 5 | 0 | 4 | 4 | 1 | 1 | 0 | 0 |
| RETIRED | 0 | 0 | 0 | - | 0 | 0 | 0 | 0 | 3 | 2 | 0 | 0 |
| TAUTOLOGY | 2 | 1 | 0 | 0.5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| (none — blind spot) | 0 | 0 | 0 | - | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |

Sample: 48 mutants — 27 property, 5 evasion (an existence proof, never a rate), 5 refactor, 4 intended/fix, 5 blind, 1 equivalent (excluded), 1 robustness (excluded). Rows: the first run, overridden per id by mutation-results-batch2.json, mutation-results-batch4.json, mutation-results-batch5.json.

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
| M20 | PIN | evasion | green | silent |  | ghost-squad clones are drawn 40 tiles ahead, on an unbuilt facet — the property the regex claims to guard |
| M21 | PIN | refactor | **RED** | red | mod-route-visibility | rename the loop local `cm` to `clone` (no behaviour change) |
| M22 | PIN | refactor | **RED** | red | pathcheck-suite-2 | rename the frame loop's catch binding `err` to `e` (no behaviour change) |
| M23 | PIN | evasion | green | silent |  | durability: a fault storm that should RESTART the run halts it instead (the recover branch is dead) — ui/failsafe.js |
| M24 | PIN | refactor | **RED** | red | boot-registry-contract | add one space inside a registry entry (whitespace only) |
| M25 | PIN | refactor | **RED** | red | catwalk-built-prefix-visibility | swap the operands of one catwalk-overlap comparison in sim/player.js (identical semantics) |
| M26 | CORE | refactor | green | - |  | swap two independent statements in the landing branch of sim/player.js (no behaviour change) — driven tests should stay green |
| M33 | PIN | evasion | green | silent |  | the last half tile of every catwalk stops being solid (players drop off early); the regex still matches its prefix |
| M34 | PIN | evasion | green | silent |  | run teardown: the hostile RNG owner stays registered but no longer resets (a retry no longer replays the same run) |
| M35 | PIN | evasion | green | silent |  | durability: a resumed tab advances the whole gap again (catch-up multiplier) while the regexed Math.min(50, t - last) text stays |
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
| M36 | PIN | property | **RED** | red | pathcheck-suite-2 | T-032: the boot watchdog never tells the player a boot that never finished (the slow-boot panel is dead) |
| M37 | PIN | property | **RED** | red | pathcheck-suite-2 | T-032: the failsafe listens in the bubble phase, so a game module that never loaded (its error fires at the <script>, not the page) shows no panel |
| M38 | CORE | property | **RED** | red | future-facet-render-ownership | static anatomy (entry 3): route-bound art on the NEXT face becomes visible before the turn |
| M39 | CORE | property | green | silent |  | ?flow=1: a hit no longer un-earns the momentum chain (the chain survives the damage path) |
| M39b | CORE | property | **RED** | red | snap-hook-driven-through-real-sim | ?flow=1: neither a hit nor a lost life un-earns the momentum chain (both flowBreak calls removed — M39 removed only the hit one, and a lethal hit still breaks the chain through loseLife) |
| M40 | PIN | property | **RED** | red | t-039-contact-shadows | frame budget: contact shadows add a second instanced draw call to the scene |

### 4.3 What the sample says

**CORE assertions mostly bind — where they drive the real loop.** The
driven tests caught every mutant that went through code they actually
execute: the plane shoving RIG through a wall (M02), bullets turning corners
(M03), the gate opening under a live gating hound (M04b), `Math.random()` in
the sim (M05, caught by `g1-1`'s frame-by-frame comparison of two processes),
a wasp diving without its tell (M06), the sim importing the renderer (M08,
the prelude guard), a raw colour literal (M09), the air jump never coming
back (M11), and — added in the review pass — route art on the next face
becoming visible before the turn (M38: red at `future-facet-render-ownership.mjs:37`,
the static-anatomy proof the first pass had filed as a PIN to delete) and a
`?flow=1` chain surviving both the hit and the lost life (M39b: red at the
flow-chain section of `snap-hook-driven-through-real-sim`, which the first pass
had filed as hook v1 and deleted whole). The control refactor inside code those
domains drive (M26) stayed green — no false alarm. **Five CORE claims did not
bind:**
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
  they are also why CORE's evaluation count is inflated — 462 of its 773
  evaluations are four such name-scan loops over every sim/pure file.
- **M12** — `src/main.js` throwing at boot: green across all 76 headless
  domains; nothing headless evaluates `main.js`. In the browser domain alone
  (**M13**) the probe's boot assertion went red — and, at the base, its three
  result assertions went **green**, read from a `result.json` another run wrote
  at 20:23, 2 h 20 min earlier: a game that could not start passed 3 of 4.
  Main fixed that plumbing after the base (e29665b, a private output directory
  per run).
- **M39** — under `?flow=1`, a *non-lethal* hit no longer un-earns the chain:
  green. The flow section only drives a crush and a lethal hit, and a lethal
  hit still breaks the chain through `loseLife`'s own `flowBreak()`. A gap in a
  flag-only experiment, recorded for whoever judges FLOW.

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
cost (M19). Cheap, correct and binding. One caveat the review found: M19's only
killer (`view-scale-experiment.mjs:159`) sat in a domain filed under the
traversal slice, so the first pass's *fast gate* would not have run it. The
hound and polyp rows read the shipped `CONFIG.hound` / `CONFIG.polyp` with the
frozen six-face tune as their first row; the review pass gave them shipped
scope, and §4.4 now shows the fast gate catching M19.

**Pins catch the text they read, and miss the property elsewhere.** Five
mutants were *built* to break a pin's property where its regex does not look
— ghost-squad clones drawn on an unbuilt facet (M20), the failsafe's restart
branch dead (M23), the last half tile of every catwalk non-solid (M33), the
hostile RNG no longer reset between runs (M34), a resumed tab advancing the
whole gap again (M35) — and all five stayed **green**. That is an existence
proof that a pin can miss exactly what its message names, not a kill rate:
the mutants were placed to evade. The other direction holds too: an edit to
the very text a pin reads turns it red — the slow-boot watchdog disabled
(M36), the failsafe listening in the bubble phase (M37), a second contact-shadow
draw call (M40) — and in each of those three cases the only red assertion is a
pin marked for rewrite, so its replacement must catch the same mutant before the
pin goes (§4.4). Four semantics-preserving refactors — renaming a loop local
(M21), renaming a catch binding (M22), one extra space inside a registry entry
(M24), swapping a comparison's operands (M25) — all turned the gate **red**:
false alarms 4 / 4. The operator-requested "longer sides" change (M27, faces 88 → 106 tiles
with `levelLength` 583 → 691 to match): **RED** — 9 assertion(s) in 6 domain(s) (`pathcheck-suite`, `g2-neck-access-plate-flip-gate`, `t-009-whole-run-crossable-driven`, `t-044-corner-setpieces`, `catwalk-built-prefix-visibility`, `vertical-assault-geometry`). Of those nine, two are the
golden pins (583/90/79 shape, fingerprint), three pin coordinates of today's
geometry (`catwalk-built-prefix-visibility`'s face-3 shelf at s = 266), one is
a hidden coupling (`g2-neck…:602` drops a synthetic one-way platform at
x = 430 "past the generator's platform range", which the longer level now
reaches), one is a genuine content signal (`vertical-assault-geometry.mjs:29`:
longer faces need authored routes, not density-repair bars — kept in the
invariant tier since the review pass), and two driven CORE tests stop short of
the outro (scroll 646 of 661) inside their fixed 24,000-frame budget — the
budget or a real stall; whoever lengthens the faces (T-205) must find out
which. Made *incompletely* (faceTiles without `levelLength`, M27h) the change
does not fail the gate at all: **hung** — the gate never finished; killed after 120 s with no domain completed (a red that only a timeout can deliver) — the gap-run scan in
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

### 4.4 Would the proposed fast gate still catch them? (`--section fastgate`)

Every red property or evasion mutant, joined to the dispositions of the
assertions that turned red (`test-audit.json` → `mutation.fastGate`):

| mutant | still caught by the proposed fast gate? | the failing assertions and where the plan puts them |
|---|---|---|
| M02 | yes | `damage-plane-never-leaves-geometry-behind.mjs:80` → CORE-GATE; `damage-plane-never-leaves-geometry-behind.mjs:82` → CORE-GATE |
| M03 | yes | `bend-cull-driven-through-real-bullet.mjs:90` → CORE-GATE; `bend-cull-driven-through-real-bullet.mjs:98` → CORE-GATE; `bend-cull-driven-through-real-bullet.mjs:103` → CORE-GATE; `bend-cull-driven-through-real-bullet.mjs:107` → CORE-GATE; `projectile-presentation-contract.mjs:34` → CORE-GATE; `projectile-presentation-contract.mjs:36` → REWRITE-AS-BEHAVIOUR; `projectile-presentation-contract.mjs:44` → CORE-GATE; … |
| M04b | yes | `t-009-non-gating-station-cannot.mjs:69` → CORE-GATE |
| M05 | yes | `g1-1-render-only-proved-sim.mjs:138` → CORE-GATE |
| M06 | yes | `t-043-wasp-aim-lock-squad.mjs:122` → CORE-GATE; `t-043-wasp-aim-lock-squad.mjs:132` → CORE-GATE |
| M08 | yes | (the prelude layer guard) |
| M09 | yes | `t-038-seam-pips.mjs:137` → CORE-GATE |
| M11 | yes | `rib-run-driven-through-real-sim.mjs:149` → DEEP; `t-009-pocket-route-works-driven.mjs:97` → CORE-GATE |
| M13 | **no** (only-in-play) | `render-submission-contract.mjs:41` → PLAY-GATE |
| M14 | yes | `t-011-juice-feedback-pass.mjs:89` → CORE-GATE:invariant-tier; `t-011-juice-feedback-pass.mjs:113` → CORE-GATE:invariant-tier; `t-011-juice-feedback-pass.mjs:127` → CORE-GATE:invariant-tier |
| M15 | yes | `t-039-contact-shadows.mjs:114` → CORE-GATE:invariant-tier |
| M16 | yes | `t-038-seam-pips.mjs:63` → CORE-GATE:invariant-tier |
| M17 | yes | `pathcheck-suite-2.mjs:51` → CORE-GATE:invariant-tier; `pathcheck-suite-2.mjs:63` → CORE-GATE:invariant-tier; `pathcheck-suite-2.mjs:77` → CORE-GATE:invariant-tier; `pathcheck-suite-2.mjs:100` → CORE-GATE:invariant-tier; `pathcheck-suite-2.mjs:119` → CORE-GATE:invariant-tier |
| M18 | yes | `momentum-earned-pace-escalation.mjs:69` → CORE-GATE:invariant-tier; `momentum-earned-pace-escalation.mjs:97` → CORE-GATE:invariant-tier; `momentum-earned-pace-escalation.mjs:132` → CORE-GATE:invariant-tier; `momentum-earned-pace-escalation.mjs:134` → CORE-GATE:invariant-tier; `momentum-earned-pace-escalation.mjs:228` → CORE-GATE:invariant-tier; `momentum-earned-pace-escalation.mjs:293` → CORE-GATE:invariant-tier; … |
| M19 | yes | `view-scale-experiment.mjs:159` → CORE-GATE:invariant-tier; `view-scale-experiment.mjs:209` → DEEP; `view-scale-experiment.mjs:217` → CORE-GATE:invariant-tier |
| M32 | yes | (the prelude layer guard) |
| M36 | **no** (only-by-a-rewrite) | `pathcheck-suite-2.mjs:195` → REWRITE-AS-BEHAVIOUR |
| M37 | **no** (only-by-a-rewrite) | `pathcheck-suite-2.mjs:191` → REWRITE-AS-BEHAVIOUR |
| M38 | yes | `future-facet-render-ownership.mjs:37` → CORE-GATE; `future-facet-render-ownership.mjs:39` → CORE-GATE:invariant-tier |
| M39b | **no** (only-in-deep) | `snap-hook-driven-through-real-sim.mjs:244` → SPLIT-ASSERTION; `snap-hook-driven-through-real-sim.mjs:257` → SPLIT-ASSERTION |
| M40 | **no** (only-by-a-rewrite) | `t-039-contact-shadows.mjs:162` → REWRITE-AS-BEHAVIOUR |

Rule: a red property/evasion mutant is still caught by the proposed fast gate when one of its failing assertions is disposed CORE-GATE, invariant tier or a shipped SPLIT-ASSERTION, or the prelude layer guard catches it. Red mutants the fast gate would no longer see: M13, M36, M37, M39b, M40.

## 5. Blind spots: the defects the operator and the integrator actually saw

Entry 21 says none of the entry-20 defects was caught by any gate. This
table says which check came closest, whether it *could* have caught the
defect, and why it did not. The `mutant` column is the reproduction in
`tools/orch/mutants.mjs` and what the gate did with it. The integrator's
mobile observations were made on 048716c; none of `index.html`,
`src/ui/shell.js`, `src/ui/hud.js`, `src/ui/failsafe.js`, `src/render/preload.js` changed between it and 38d0409
(`git diff --stat 048716c 38d0409` on those paths is empty, and nothing in
`index.html` or `src/` changed from 38d0409 to main 2fa58bb), and
`tools/orch/phone-probe.mjs` re-measured all four on 38d0409
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

**Every row now has an owner.** Since this table was written the integrator
has queued a lane for each defect, and several of those lanes are writing
exactly the check this table says is missing: T-101 (touch controls: a
scripted multi-touch proof at 844×390 and 390×844), T-102 (turns: a headless
proof driving all five turns under several policies), T-103 and T-109 (guns:
grip within 1 atlas pixel of the hand anchor; muzzle anchor within 1 px), T-105
(the phone shell: text-fit, no keyboard copy on touch, a 10 % landscape HUD
budget, each preload fetched once), T-107 (phone framing) and T-205 (the longer
sides). §7.4 maps each to the tier it belongs in, so T-120 adopts these tests
instead of writing second copies.

## 6. Cost

### 6.1 Instrumented full gate runs (`--section cost`)

| run | tree | when (UTC) | load avg (1/5/15) | probe skipped? | total s | browser domain s | other 76 domains s | passed | failed |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| `tools/orch/evidence/timing-full-run-1.json` | 38d0409 | 2026-10-22T21:25:17.354Z | 23.64 / 20.52 / 20 | no | 325.3 | 300.9 | 24.2 | 3988 | 1 |
| `tools/orch/evidence/timing-full-run-2.json` | 38d0409 | 2026-10-22T22:55:26.190Z | 27.06 / 26.12 / 32.42 | no | 337.6 | 301.5 | 35.8 | 3988 | 1 |
| `tools/orch/evidence/timing-full-run-3.json` | c80dad0 | 2026-10-23T00:34:07.105Z | 22.72 / 26.8 / 33.06 | yes (host env) | 37.5 | 0.0 | 36.6 | 3985 | 0 |

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

**At the base (38d0409, runs 1 and 2): one domain dominated.**
`render-submission-contract` boots a real browser through
`tools/playtest/perf-probe.mjs` and took 300.9 s of the 325.3 s run — it hit
`HB_PROBE_SPAWN_MS` (300 000 ms, the value `tools/orch/cloud-setup.sh` exports
for cloud hosts; the code default of 45 s would cut it off sooner, and it did
not finish in 300 s) and failed, so on this host under that load **the gate was
red for an environmental reason**. The other 76 domains together took 24.2 s,
the prelude (layer guards + importing every domain module) 0.28 s. Run 2, at
the end of the first pass while the M27 re-runs shared the host, repeated the
shape: 337.6 s, the browser domain again at its 300 s timeout (+4/−1 — the same
three passes from the same stale `result.json`), the other 76 domains 35.8 s,
3,988 passed / 1 failed exactly as in run 1. The per-call-site census run at
the base (scratch copy, browser domain skipped, load 31.6) took 47.2 s for the
same 76 domains (`git show 798888d:tools/orch/evidence/callsite-counts.json`);
re-run on c80dad0 for this pass it took 41.2 s at load 25.3.

**On main (run 3, c80dad0, host profile loaded): the browser domain is gone
from this host's gate.** After the base, main made the probe write to a private
directory per run (e29665b), added an explicit, loud skip for GPU-less hosts
that does not count as passes (1a3a400), and put `HB_GATE_SKIP_BROWSER_PROBE=1`
into the profile the merge gate and the per-edit hook source
(`~/.hullbreaker-host.env`, c7363b4; the hook also never boots the probe,
ea09b88). Run 3 is the gate exactly as this host now runs it: **37.5 s total at
load 22.7, 3,985 passed / 0 failed — green**, the browser domain 0 ms (skipped;
its one source pin passes). The costliest domains are the child-process sim
drivers — `pathcheck-suite` (FAIR-GAP probe, 7.8 s), `g1-1-render-only-proved-sim`
(3.2 s), `t-042-audio-punch` (2.9 s), `momentum-earned-pace-escalation` (2.2 s),
`t-002-ritual-decision-trace-frame` (1.9 s) — i.e. the valuable driven CORE tests
are the expensive headless ones, and they are cheap in absolute terms. The
headless part is **load-bound**: 24.2 s at load ~24 (run 1), 37.5 s at ~23
(run 3), 59–76 s at 32–39 and 131 s for `node tools/pathcheck.mjs` at ~60 (the
reviewer's runs, `reports/tasks/T-108/review.md`). Source-text pins cost nothing
to run; their cost is the false alarms in §4. **The price of the skip:** on this
host nothing now checks material passes, idle instance uploads or MSAA at all —
the frame-budget hygiene the probe owned (§7.7, operator question 1).

**The merge gate on this host** (`tools/orch/merge-task.sh`) is the sum of:
pathcheck in the worktree + the smoke (two scripts, up to three attempts each)
+ pathcheck again on main after the merge. At the base that was ≈ 2 × 325 s of
pathcheck (~92 % of it the same browser probe twice) plus ≈ 9 minutes of smoke
(one attempt each, `smoke-timing.txt`: `mid-route.json` **484 s** wall, PASS;
`transform-slice.json` **39 s**, FAIL — `page.goto`'s fixed 30 s navigation
timeout expired under load), about **20 minutes per merge before any retry**. On
main the two pathcheck runs cost ≈ 0.5–2 min each depending on load, and the
transform-slice failure mode is fixed (8fd25fc scales `page.goto` with
`HB_HARNESS_SLOWDOWN` and accepts a sampled victory as terminal) — so a merge
here is now dominated by the smoke, which this audit did not re-time on main
(transform-slice now plays to its end instead of failing at 39 s, so expect
more than the base's 523 s of smoke, not less). The PostToolUse hook runs the same
pathcheck after every `src/` edit with a 120 s watchdog, now with the probe
skipped and `HB_GATE_FAST=1` (45ea217): it fits at load ~23 (37.5 s) and does
not at load ~60 (131 s).

**The standalone checks**, if someone ran all 39 (`standalone-census.json`,
base): 1,049.5 s, of which 902.8 s are three ~300 s timeouts
(`tools/assets/check.mjs`, `tools/gatecheck.mjs`, `tools/movement/selftest.mjs`);
the other 36 take 146.7 s together.

**Proposed cost.** Fast CORE gate: a strict subset (1,002 sites) of today's
headless domains, so at most their 24–76 s here, plus the new behaviour tests
(each a handful of child-process sim runs — today's driven domains cost 1–8 s
apiece); deleting the 379 + 50 sites removes almost no time (pins are cheap).
PLAY gate: the existing smoke plus three viewport boots of the default URL; on
this GPU-less host each boot is ~15–30 s of scene boot before any check (SPRINT
"Environment notes"), so budget ≈ 3–6 min per merge here and far less on a GPU
host.

## 7. Proposal

The operator's own words set the bar: guard **what a player would notice**,
and keep the hard rules that make headless evidence trustworthy (entry 16's
"kept, deliberately" list and entry 21's never-weaken list). Three tiers.
Entry 24 has since made this the work order: T-120 rebuilds the gate from this
section, T-121 cleans everything else.

### 7.1 CORE gate — headless, every change

Runs in one Node process like today (the SHARED/singleton coupling stays
explicit — see §7.6), **without any browser**. Today's size, from
`test-audit.json` → `pathcheck.tiers.fast`: **1,002 of the 2,050 call sites,
2,591 of the 3,990 evaluations**.

| part | what | today's size |
|---|---|---|
| prelude | `guardLayer(pure)` / `guardLayer(sim)` and the unlisted-module guard — **plus** a static ban of `Math.random` and `Date.now` in `src/pure/` and `src/sim/` (CLAUDE.md's hard rule; today only `performance` is banned globally and the rest is seven per-file regexes) | 2 guards |
| CORE ∩ shipped | every call site classed CORE whose subject is the default run: the FAIR-GAP probe, whole-run / pocket-route crossability, damage-plane no-clip, bend cull, render-only-cannot-change-sim, wave-gate softlock guards, wasp aim-lock, fallback mercy, momentum floor, determinism twin runs, frozen movement constants **with** their physical reasoning, FAR camera, static anatomy (now including `future-facet-render-ownership.mjs:37`), palette tokens, "sim cannot tell whether art loaded" — plus 2 shipped SPLIT assertions (the desktop-FAR identity in `pathcheck-suite.mjs:1035`, the handoff frame's zero leaked rows in `future-facet-render-ownership.mjs:89`) | 197 + 2 sites |
| invariant tier | PURE-INVARIANT ∩ shipped: cheap correct properties (hit-stop only slows a frame, contact shadow never over-strength, a seam pip never advertises a missing ledge, one bad frame never costs a run, the shipped hound/polyp tells exceed the reaction cost, aim-assist bounds, the momentum tune's relational validity, the juice schema…). Reported **separately** from CORE: a red here means "a design invariant moved — ask its owner", not "a player will notice" | 803 sites |
| kept until replaced | the 175 REWRITE-AS-BEHAVIOUR pins (§7.5) stay where they are until their replacement is green **and** shown red on the named mutant — among them the 21 T-032 failure-panel wiring checks, the 6 headless frame-budget proxies, the render-ownership regexes, the retry-replay proxy and the count ratchets of CORE checkers | 175 sites |
| new behaviour tests | §7.4 items 3, 4, 7, 8, 9 (and 2's pure half) | to write or adopt |

**Does it still see the bugs?** §4.4 joins every red mutant to the dispositions
of the assertions that caught it: everything the gate catches today is still
caught by this tier, except M13 (browser-only: the PLAY gate), M39b (a
`?flow=1` property: the deep suite) and M36/M37/M40, whose only killers are
pins in the "kept until replaced" row — their replacements must catch them
before those pins go. No red mutant is lost.

**Cost.** A strict subset of today's headless domains: 37.5 s at load ~23
(run 3) to 59–76 s at load 32–39 (the reviewer's runs) on this host, before the
new tests. Not "≈ 30 s": the headless part is load-bound (§6.1).

### 7.2 PLAY gate — real browser, every merge (replaces "smoke" and the browser domain)

One script (proposed `tools/orch/play-gate.mjs`, built on the existing
`tools/playtest/lib/isolated-browser.mjs`, served by `tools/serve.mjs` not
`python3 -m http.server`), three viewports: desktop 1280×800, phone landscape
844×390 and phone portrait 390×844 (`isMobile`, `hasTouch`, DPR 3 — LANE-BRIEF
already names these as the phone checks every lane must do by hand; SPRINT's
environment notes warn DPR 3 trips the freeze watchdog under SwiftShader, so
the gate runs DPR 2 on GPU-less hosts and says so).

1. **Boot the default URL** (`index.html`, plus `?testapi=1` only for the
   harness hooks) to PLAYING — on phones by a *tap*, not a key. Today the
   smoke never boots the default URL (M12: a boot-breaking throw in `main.js`
   is invisible to every headless domain).
2. **The failsafe reaches the player** (T-032; boot and safe degradation are on
   entry 21's never-delete list). Three forced failures — `main.js` throws while
   its module evaluates, the game module 404s, a boot that never finishes —
   must each show `#fail` within `FAILSAFE.bootWatchdogMs`, with a hint
   appropriate to the device and no simulation frames advanced. Falsifiers M12,
   M36 (slow-boot watchdog dead), M37 (bubble-phase listener). This is the
   replacement for the 21 wiring regexes at `pathcheck-suite-2.mjs:126-294`.
3. **No page errors and no console errors or warnings**, and **no URL fetched
   twice** (counts `page.on('request')` per URL — the preload double-fetch).
   Host noise is allow-listed by pattern, not by count: SwiftShader's
   `GL Driver Message … GPU stall` lines appear on this container and mean
   nothing about the game.
4. **Layout bounds**: no visible text in `#shell`, `#overlay`, `#fail` overflows
   its box or the viewport (the "HULLBREAK" clip); HUD panels cover at most an
   agreed share of the viewport and stay out of the play band (T-105 proposes
   10 % of 844×390 and nothing inside the central 60 % × 60 %).
5. **Device-appropriate copy**: on a coarse pointer, no visible text tells the
   player to press a key (title "PRESS ANY KEY", failsafe "Press R"). This is
   the replacement for `pathcheck-suite-2.mjs:146`, which requires the opposite.
6. **Nothing renders on an unbuilt or off-camera facet** (static anatomy,
   entry 3): read the visible route-bound objects (ghost-squad clones, lance
   telegraph, ladders, Crown) from the debug snapshot every N frames through a
   corner and assert each is route-renderable at that frame. Falsifiers M20,
   M38. Replaces the render-ownership regexes (`mod-route-visibility.mjs:14,16`,
   `vertical-assault-geometry.mjs:146`, `crown-command-architecture.mjs:114`).
7. **`?selftest=1` PASS** at all three viewports (it exists and no gate runs it).
8. **Deterministic smoke**: the existing `mid-route.json` and
   `transform-slice.json` **plus** a short default-URL six-face script,
   judged by `tools/orch/smoke-verdict.mjs` (best of three stays, flake
   recorded, as merge-task.sh does now).
9. **Safe asset degradation**: one boot with `assets/generated/**` blocked —
   reaches PLAYING, fallbacks draw, no failsafe panel, and the sim state after
   N frames equals the art-loaded run's (fix and promote
   `tools/playtest/sprite-fallback-check.mjs`; M10 shows today's guard is a
   name list).
10. **Did the shipped look arrive?** Per viewport, how many art surfaces
    reached `ready` at boot versus their fallback, read from the game's own
    diagnostics (`window.__HB_PRELOAD` / `__HB_SPRITES` / `__HB_HULL_TEX` /
    `__HB_BACKDROP`, exactly as `verify-bundle.mjs` reads them) — always
    reported, gated on a GPU host. On this container 38 files missed the boot
    budget (2.5 s desktop, 6.5 s mobile) in 2 of 3 fresh boots
    (`tools/orch/evidence/phone-probe.json`).
11. **Frame budget** (`worstMs` / `over20ms` under the 256-projectile stress,
    entry 18) and the render hygiene `render-submission-contract` owns today
    (material passes, idle uploads, MSAA — 4 SLOW-ENV sites): *gated* on a GPU
    host, *reported* on SwiftShader hosts — on this container a frame-time number
    is a measurement of the other lanes. Until a GPU host gates it, the merge
    host has no frame-budget gate at all, so the six headless proxies (draw-call
    count, per-frame allocation, instancing) stay in the fast gate (§7.7, operator
    question 1).

### 7.3 DEEP suites — optional, nightly or on demand, never merge-blocking

- **Fixtures and prototypes** (`?slice=traversal`, `?slice=transform`, `?g2=1`,
  `?ribrun=1`, `?pace=`, `?flow=1`, hound/polyp/mortar trial stages): 435 call
  sites classed CORE∩flag or PURE-INVARIANT∩flag/harness, plus 5 flag-only
  SPLIT assertions — including the driven rib-run and fallback-exploit proofs
  and the live, unjudged `?flow=1` chain (the damage-plane section of
  `snap-hook-driven-through-real-sim` and the flow tunnelling bounds in
  `movement-verb-prototypes`). They are correct and they guard opt-in builds;
  run them when someone touches those fixtures. M39 shows one gap there: a
  non-lethal hit no longer breaking a flow chain stays green.
- **Harness self-tests** (`t-018`, `t-025`, `t-027`, `t-029`): keep with
  `tools/playtest/`; they protect the instrument, not the game.
- **Mutation sample**: `tools/orch/mutation-sample.mjs` plus
  `tools/gatecheck.mjs`'s three FAIR-GAP controls — rerun after any gate
  change; a mutant that moves from "kill" to anything else in §4.4 is a gate
  regression.
- **Distributions** (entry 19): `tools/pressure-envelope-check.mjs` and the
  six-face policy bot runs, reported as best/worst/spread, never gated.
- **Release gates**: `tools/deploy/verify-bundle.mjs` and `verify-pages-site.mjs`
  before every Pages tag (add a phone viewport and console-warning capture).

### 7.4 Behaviour tests to add (each with its currency and its falsifier)

Entry 10's rule: a box names the currency and the test that would falsify it;
entry 21's: a new test binds only when shown red on the defect. Each row names
the mutant in `tools/orch/mutants.mjs` that must turn it red — and, because
several in-flight lanes are already writing exactly these checks, who is
writing it. T-120 **adopts** a lane's check into the right tier rather than
writing a second copy.

| # | test | currency (what a player notices) | falsified by | tier | being written by |
|---:|---|---|---|---|---|
| 1 | **Phone shell: layout, copy, network** — at 390×844 and 844×390 with touch: no text overflow, no keyboard-only instructions on a coarse pointer, HUD coverage bound, zero console warnings, one fetch per URL | the title reads "HULLBREAKER" not "HULLBREAK"; a phone player is told to tap; the HUD leaves the play field; the boot does not download its art twice | B2, B3, B5, M28 — and the current tree (all four integrator defects are present at 38d0409 and on main, so this test starts red until they are fixed) | PLAY | **T-105** (its accept boxes are this test) |
| 2 | **Gun in hand** — for every RIG frame and aim angle, the gun's grip lands within 1 atlas pixel of that frame's hand anchor, and the drawn muzzle within 1 px of the sim's bullet spawn | the gun sits in RIG's hands (entry 20) | B1, M31 (both survive today) | CORE (+ an anchor check in the art pipeline) | **T-103** (grip ≤ 1 atlas px, proven to bind) and **T-109** (muzzle anchor ≤ 1 px) |
| 3 | **Corner turns across frame rates and input timing** — every corner, held-right+jump policy at dt ∈ {1/120, 1/60, 1/30, 0.05} × N seeded input jitters: the ritual starts only with RIG at the joint, RIG never ends a frame on an unbuilt facet or behind the seal, the camera commits, the next face is reached within T s; the failure *distribution* is reported, the gate is zero failures | "the turns work right all of the time" (entry 20) | B4 (survives today) | CORE | **T-102** (`t-102-corner-turns`: all five turns under several policies; the hook runs a subset under `HB_GATE_FAST=1`) — T-120 adds the dt × jitter axis if its matrix lacks it |
| 4 | **Input forgiveness** — run off a lip with the air jump withheld and press jump k frames late: k ≤ coyote frames jumps, beyond does not; press k frames before landing: k ≤ buffer frames fires on landing | a late or early press is forgiven exactly as tuned | M01 (survives the whole suite today: the assertion named "one coyote window" is satisfied by the air jump) | CORE | nobody yet — T-120 |
| 5 | **Touch input contract** — synthetic touch sequences through the shipped touch scheme reach `src/sim/input.js` as the intended intents (move, fire, jump, air jump), start a run from the title and dismiss the failsafe panel | the phone controls do what they claim (whether they feel good stays the operator's verdict) | any edit that breaks the touch→intent mapping; today **no test references `src/ui/touch-controls.js` at all** | PLAY (+ CORE for the pure stick logic) | **T-101** (scripted multi-touch proof at both orientations; pure stick quantization in `src/pure/` with assertions) |
| 6 | Default-URL boot + safe degradation (§7.2 items 1 and 9) | the game a player opens boots; missing art never changes play | M12, M10 | PLAY | nobody yet — T-120 |
| 7 | Cross-process determinism of the default run with enemies on, plus the static `Math.random`/`Date.now` ban | replays and bot evidence stay honest | M05 (caught today only because the jitter landed inside `g1-1`'s compared window) | CORE | T-120 — or `g1-1`, re-pointed when T-121 removes `?zip=1` (§7.6) |
| 8 | `?flow=1` (and, until T-121 deletes it, `?hook=1`) inert at the `mode.js` level (child process, no query) | an unjudged prototype never arms by default | M07 (survives today: the existing check calls the pure function with its default arguments) | CORE | nobody yet — T-120 |
| 9 | **A retry replays the same run** — reset then N frames equals a fresh boot then N frames (state, hostile RNG, spawns) | "try again" is the same climb; bot evidence across retries is honest | M34 (survives today: the registry pin it would replace counts owners, not resets) | CORE | nobody yet — T-120; replaces `boot-registry-contract` |
| 10 | **The failsafe reaches the player** (§7.2 item 2) | a broken boot tells the player, on any device, instead of a blank page | M12, M36, M37 | PLAY | nobody yet — T-120 (T-105 changes the watchdog and the copy: coordinate) |
| 11 | **Render ownership probe** (§7.2 item 6) | nothing appears on a face the climb has not reached | M20, M38 | PLAY | nobody yet — T-120 (T-102 and T-122 edit ownership code) |

Of the eleven, four are already being written by lanes (1, 2, 3, 5); **the
five T-120 must write first** are 10 (failsafe), 9 (retry replay), 4 (input
forgiveness), 6 (default-URL boot + degradation) and 11 (render ownership) —
each guards a property whose only check today is a pin on the deletion or
rewrite list, or nothing.

### 7.5 Deletion list (with reasons)

Per call site, with its reason, in `tools/orch/test-audit.json` → `sites[]`, and
as compact lists keyed by **(file, label)** — `line` is where the site sits at
c80dad0 only — in `lists.delete`, `lists.deleteWithFeature`,
`lists.rewriteAsBehaviour`, `lists.splitAssertion`, `lists.deleteWholeDomains`,
`lists.deleteStandalone`.

| bucket | call sites | why |
|---|---:|---|
| DELETE — PIN | 359 | regex over source, exact counts and exact constants nobody decided: e.g. `mod-route-visibility.mjs:12` (an import exists), `crown-command-architecture.mjs` (part counts, anchor pixels), `t-057-hull-shimmer.mjs`, `cp4-promotion-full-run-tune.mjs` ("exactly the slice table halved"), corner choreography values at exact milliseconds |
| DELETE — RETIRED | 12 | the dare wager (entries 9/10/21 — `pathcheck-suite.mjs:866-994`, `pursuit-model.mjs:69`, `pacing-variants.mjs:110-199`) and the keyboard-only device (entry 20 — `pathcheck-suite-2.mjs:146`, which T-105 deletes with its copy fix) |
| DELETE — TAUTOLOGY | 8 | values compared to the constants they are computed from (`t-040-rig-sprite.mjs:110-111`), a domain re-checking what the prelude guard already exits on (`t-011-juice-feedback-pass.mjs:283`), placement formulas re-derived (`t-051-backdrop.mjs:137`, `t-052-hull-texture.mjs:97`), a checker's own `N/N` count (`actor-motion-contract.mjs:16`) |
| DELETE-WITH-FEATURE (T-121) | 50 | hook v1 and the zip-assembly corner, released for deletion by entry 25: the hook sections of `snap-hook-driven-through-real-sim` (14) and `movement-verb-prototypes` (22), the brick-zipper timeline in `pathcheck-suite.mjs:173-192` (8), the retained assembly code in `world-transitions.mjs:161,168` (2), the `?zip=1` / `?g1=0` escape hatches in `t-009-static-anatomy-reveal-default` (4). They go with the code, in T-121's commit, not before |
| REWRITE first, then delete | 175 | the property matters but the check reads code: T-032 failure-panel wiring and frame-loop fault handling (`pathcheck-suite-2.mjs:126-294`, 30), asset-failure fallbacks (`t-049-hostile-sprites`, 18; `t-051-backdrop`, 11), RIG sprite wiring (`t-040`, 14), juice wiring (`t-011`, 12), render ownership (`future-facet-render-ownership.mjs:108-131`, `mod-route-visibility.mjs:14,16`, `vertical-assault-geometry.mjs:146`, `crown-command-architecture.mjs:114`), the six frame-budget proxies, the retry-replay proxy (`boot-registry-contract`), count ratchets of CORE checkers, the golden level fingerprint. Each waits for its §7.2 / §7.4 replacement and that replacement's mutant |
| SPLIT — keep the property, drop the pin | 7 | `pathcheck-suite.mjs:1035` (keep desktop-FAR identity; drop the portrait 1.15 / 24-30 / 4-6 % pins after T-107), `future-facet-render-ownership.mjs:89` (keep zero leaked rows; drop the 19-column prefix), and five `?flow=1` lines whose hook conjuncts go with T-121 |
| whole domains | 6 domains (17 sites, counted above) | `t-057-hull-shimmer`, `capsule-reliquary-contract`, `enemy-ecology-render-contract`, `hostile-presenter-contract`; `mod-route-visibility` and `boot-registry-contract` only after their REWRITE lines' replacements (§7.4 #11, #9) land |
| standalone checks | 14 | 13 PIN-dominant checks, plus `foreground-pack-check` (red here only because ImageMagick is absent: port it off `magick` or delete it). `boot-registry-check` is REWRITE (with its domain); three more are red today for a cause nobody has diagnosed (`enemy-ecology-runtime-check`, `enemy-motion-check`, `rig-slender-check`) and are marked TRIAGE, not DELETE: a red check may be the one telling the truth, so its owner decides |

Nothing in the CORE ∩ shipped list is deleted, weakened, or moved out of the
per-change gate. Entry 21's never-weaken list (boot, page errors,
determinism, layer purity, reachability, no softlock, the movement envelope,
the frame budget, safe asset degradation) maps entirely onto §7.1/§7.2 — and
where today's only check of one of them is a pin (the failsafe wiring, the
frame-budget proxies, render ownership), the pin is on the REWRITE list, not
the DELETE list.

### 7.6 Migration plan — after the in-flight lanes merge

"Wave 1" in the task block means **the lanes open when T-108 was dispatched
that add or edit tests**. Each owns domains this plan would otherwise touch:

| lane | domains / sites it edits | what that means for the plan |
|---|---|---|
| T-101 touch controls | new touch-deck contract domain(s); `manifest.mjs` | adopt its multi-touch proof as §7.4 #5 |
| T-102 corner turns | new `t-102-corner-turns` (41-run matrix; `HB_GATE_FAST` subset); `future-facet-render-ownership`; `vertical-assault-geometry`; `manifest.mjs` | adopt as §7.4 #3; its domains' REWRITE and SPLIT lines (`future-facet:89`, `:108-131`, `vertical-assault-geometry:146`) wait for it |
| T-103 guns in hands | `t-040-rig-sprite`, `gilded-chassis`, new `t-103-rig-grip-alignment`; `manifest.mjs` | adopt as §7.4 #2; the 14 `t-040` REWRITE lines and its two TAUTOLOGY lines are T-103's to replace or delete |
| T-105 phone shell | `pathcheck-suite-2` (T-032 panel, copy: `:146` obstructs its fix, `:149`'s phrase list may need its new copy), `t-013-game-shell`, new layout/copy/watchdog checks | T-105 deletes `:146` with its copy fix (entry 21 lets a lane delete what obstructs it); adopt its checks as §7.4 #1; coordinate §7.4 #10 |
| T-107 phone framing | `pathcheck-suite.mjs:1020-1043` (portrait/FAR), view-scale entries | split `:1035` only after T-107's byte-identical FAR projection proof lands |
| T-109 art pipeline | `tools/art/` anchor check | part of §7.4 #2 |
| T-121 cleanup | the 50 DELETE-WITH-FEATURE sites; `g1-1-render-only-proved-sim` (its comparison flag is `?zip=1`); `snap-hook-driven-through-real-sim` section 4 | deletes the 50 with the code; must keep the flow section running when it removes the hook imports; must re-point `g1-1` at a surviving render-only switch (an unknown query is ignored, so it would keep passing as a two-process determinism check — the only killer of M05 — but its label would lie) |
| T-205 longer sides | the golden fingerprint and level shape (`pathcheck-suite.mjs:774-790`), the catwalk coordinates, two driven run budgets, `vertical-assault-geometry.mjs:29` | M27 lists exactly what it will trip; those are T-205's obstructions to handle |

Rules for T-120:

0. **Now (this branch, no conflict surface):** land `tools/orch/` (tools,
   evidence, `test-audit.json`, `test-audit-lock.json`) and this proposal. Zero
   runtime effect.
1. **Lanes delete their own obstructions** (entry 21); T-120's batches take
   only lines no in-flight lane claims, and deletions in a domain a lane is
   editing wait for that lane to merge (the T-120 block in SPRINT says the
   same).
2. **Identity, not line numbers.** Every batch names its sites by
   (file, label) from `test-audit.json`'s lists, never file:line. A clean
   `node tools/orch/test-census.mjs --check` is the precondition of every
   batch: it fails when a lane's edit has shifted a hand range onto other
   sites (`evidence/lock-drift-demo.txt`: one inserted line, 8 silent
   reclassifications), when a classified site vanished, or when a new one
   appeared. After each batch: classify what changed, then `--write-lock`.
3. **Replacement before deletion, proven by a mutant.** Every REWRITE line
   goes only when its replacement is green and is shown red on a property
   mutant in `tools/orch/mutants.mjs` (one per deleted core-intent pin; the
   review pass added M36–M40 for the failsafe, render ownership, flow and
   frame-budget lines). Run the mutation sample before and after each batch:
   no red mutant may become "lost" in §4.4, and every mutant in its
   "only-by-a-rewrite" column must reach "kill" before the pin it depends on
   goes.
4. **Sequencing notes the census cannot express:** `pathcheck-suite.mjs:1030`
   (kept, invariant tier) reads `TF.darePocket.timing.entryEdgeMarginTiles`,
   retired dare fixture data — re-point it before the RETIRED batch removes
   that data; `:1035` splits after T-107; `g1-1` is re-pointed before T-121
   deletes `?zip=1`.
5. **Split the manifest, don't fork the runner**: `manifest.mjs` exports
   `CORE_DOMAINS` and `DEEP_DOMAINS` (order preserved; the three SHARED
   producers `pathcheck-suite`, `view-scale-experiment`, `world-transitions`
   stay first in both — they are also where shipped CORE lines live, so split
   them by moving flag-only blocks into new deep domains rather than the
   reverse). `node tools/pathcheck.mjs` = core; `--deep` = everything. The
   unlisted-module guard stays.
6. **Move the browser out of pathcheck**: `render-submission-contract`'s four
   probe assertions become PLAY-gate steps (§7.2 item 11); merge-task.sh runs
   CORE (worktree) → PLAY (pinned worktree, `tools/serve.mjs`) → CORE
   (post-merge, *not* the full suite twice).
7. **Delete in reviewed batches** — RETIRED, then TAUTOLOGY, then plain PIN,
   then each REWRITE once its replacement is green and proven red — every
   batch listing (file, label) + reason (entry 21 requires the reviewer to check
   each).
8. **Docs** (integrator-owned): CLAUDE.md "Headless gate" / "Browser smoke"
   lines, `tools/pathcheck/README.md`, the ORCHESTRATION merge playbook.

### 7.7 Not decided here (operator / integrator)

- The tier structure itself is a process decision. Entry 24 already orders
  T-120 to rebuild the gate "per T-108"; whether that adopts these three tiers
  as written is the integrator's call, recorded as a `decisions.md` entry.
- **Operator question 1:** is a *report-only* frame budget acceptable on the
  GPU-less merge host? Since 1a3a400 nothing there checks render hygiene; this
  proposal keeps the six headless proxies until a GPU host gates the real
  budget, but they only see draw calls, allocation and instancing in the files
  they read.
- **Operator question 2:** should count ratchets on CORE checkers
  (`projectile-presentation-contract.mjs:36,46`, `adaptive-fidelity-contract.mjs:16`)
  stay as anti-weakening tripwires? They fail when a contract is removed, which
  entry 21 forbids doing quietly; this proposal moves each count into its
  checker rather than deleting it.
- The HUD coverage bound and the touch-copy wording are feel/look calls (T-105
  proposes 10 % of 844×390): the PLAY gate needs a number and a sentence, not a
  verdict.
- Whether flag-only fixtures (traversal slice, transform demo, G2, rib run,
  paces, trial stages, `?flow=1`) are still wanted at all — if not, their deep
  sites go with them.

## 8. Proposed inbox issues

Per LANE-BRIEF, numbered `I-???` for the integrator to assign. Refreshed in the
review pass against main 2fa58bb: two first-pass issues were fixed on main after
the base and are **not** re-filed — the probe certifying another run's
`result.json` (fixed by e29665b, a private output directory per run) and the
browser probe dominating gate time and the hook's 120 s budget (1a3a400 skips it
loudly on GPU-less hosts, c7363b4 puts that skip into the host profile the gate
and the hook source, ea09b88 keeps the hook from ever booting it). The first
issue below is what that fix left behind.

```
## I-??? | harness | S2 | repro: . ~/.hullbreaker-host.env && node tools/orch/pathcheck-timed.mjs --json /tmp/r.json | evidence: tools/orch/evidence/timing-full-run-3.json (render-submission-contract: 0 ms, skipped)
The merge host has no frame-budget gate. Since 1a3a400 + c7363b4 the merge gate
on this GPU-less host skips render-submission-contract's four probe assertions
(boot, material passes, idle instance uploads, MSAA), correctly — SwiftShader
cannot measure render cost — but no GPU host runs the gate either, so render
hygiene is now checked nowhere on the merge path. Entry 21 lists the frame
budget among the properties that must not weaken. The only headless proxies
left are six pins (draw-call count, per-frame allocation, instancing) that the
audit keeps for that reason. Decide where the frame budget is gated
(proposal §7.2 item 11, §7.7 operator question 1).

## I-??? | bug | S3 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M28 --out /tmp/m.json | evidence: tools/orch/evidence/mutation-results.json
tools/pathcheck/pathcheck-suite-2.mjs:146 REQUIRES the failsafe hint to name
"R" and a "button" — the keyboard copy the integrator observed on phones.
Fixing the copy for touch (M28: "Tap the button to play again.") turns the
gate red. T-105 owns that copy: it should delete the assertion with its fix
(entry 20 superseded the keyboard-only device; entry 21 lets a lane delete what
obstructs it) and the PLAY-gate device-copy check replaces it (§7.2 item 5).

## I-??? | bug | S3 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M01 --out /tmp/m.json | evidence: tools/orch/evidence/mutation-results.json
Coyote time has no binding test. Setting coyoteUntil = gameMs while grounded
(src/sim/player.js:429 — no coyote window at all) leaves all 76 headless
domains green; the FAIR-GAP assertion named "a press up to 6 frames late (one
coyote window) still crosses" is satisfied by the AIR JUMP, as its own comment
explains. Add the input-forgiveness test (proposal §7.4 #4).

## I-??? | bug | S3 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M07,M10 --out /tmp/m.json | evidence: tools/orch/evidence/mutation-results.json
Two hard rules are guarded only at the wrong level: (a) arming ?hook=1 by
default in src/mode.js stays green (the "flags off is the shipped game" check
calls the pure resolver with default arguments) — after T-121 deletes hook v1
the same hole remains for ?flow=1; (b) a sim branch on a render-set global
(globalThis.__HB_ART_READY__) stays green (the entry-16 guards are name lists:
sprite|preload|TextureLoader|assets/…). Add the mode-level inertness check and
the behavioural degradation run (§7.4 #6, #8).

## I-??? | bug | S3 | repro: grep -n "banned" tools/pathcheck/_context.mjs | evidence: tools/pathcheck/_context.mjs:74
guardLayer bans `performance` but not `Math.random` or `Date.now` in src/sim
and src/pure; CLAUDE.md states all three as a hard rule. Seven per-file
regexes cover a handful of modules. M05 (Math.random in sim/hostiles.js) was
caught only because g1-1's compared window happened to contain a wasp dive.

## I-??? | harness | S3 | repro: read tools/pathcheck/g1-1-render-only-proved-sim.mjs and snap-hook-driven-through-real-sim.mjs:120-190 | evidence: docs/decisions.md entry 25; tools/orch/test-audit.json lists.deleteWithFeature
Two checks T-121 must not lose while deleting hook v1 and the zip corner
(entry 25). (1) g1-1-render-only-proved-sim compares ?zip=1 with the default
run in two processes; once ?zip=1 is gone the query is ignored and the test
keeps passing as a two-process determinism check — the only check that caught
M05 — under a label that no longer says what it does. Re-point it at a
surviving render-only switch (e.g. ?limbs=legacy) and relabel it; do not
delete it. (2) Section 4 of snap-hook-driven-through-real-sim drives the live
?flow=1 chain into the damage plane (no frame behind the plane, crush resolves
in its own frame, sealed pocket stays terminal, a lethal hit dislodges): keep
that child section when removing the hook imports. The 50 sites that do go
with the features are listed by (file, label) in lists.deleteWithFeature.

## I-??? | harness | S3 | repro: node tools/orch/standalone-census.mjs --out /tmp/s.json | evidence: tools/orch/evidence/standalone-census.json
29 of 39 standalone checks are run by nothing automatic; six were red on the
base tree (enemy-ecology-runtime, enemy-motion, finale-pacing, foreground-pack
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
(The fixed 30 s page.goto timeout that failed transform-slice here was fixed
on main by 8fd25fc.) Fix: proposal §7.2.

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

## I-??? | bug | S4 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M39 --out /tmp/m.json | evidence: tools/orch/evidence/mutation-results.json
Under ?flow=1 (unjudged experiment) a NON-lethal hit no longer breaking the
momentum chain stays green: the flow checks drive only a crush and a lethal
hit, and a lethal hit still breaks the chain through loseLife. Add a
non-lethal-hit case to the flow section, or record the gap with FLOW's
judgement.
```

## 9. Honesty / limitations

- **The classification is a judgement.** 2,050 call sites were classed by
  hand in two sittings: the first pass (1,046 by line ranges, 893 by domain
  defaults, 110 by a mechanical rule) and the review pass, which
  hand-classified the 110, label-keyed 180 sites in all, and fixed what the
  reviewer and two spot checks found (§3.1, §10). The review's random draw
  agreed with 76 % of sites strictly and 92 % leniently; the DELETE-bucket
  spot check found 29 of 40 right, 10 borderline, 1 wrong. Read the deletion
  list as a worklist for a reviewer, not a verdict: entry 21 already requires
  each deletion batch to be checked line by line, and `test-census.mjs`
  re-derives every count from the spec in under a second.
- **The source-text detector is lexical** (`tools/orch/lib/features.mjs`): it
  tracks variables assigned from `readFileSync` and anything derived from
  them by name, so it over-flags reused names (80 flagged sites are not PINs —
  e.g. `future-facet-render-ownership.mjs:37`, a static-anatomy proof whose
  variable happened to share a name) and misses PINs that read no file (226:
  exact counts and constants). That is why it no longer decides anything.
- **Site identity is a label, and labels can collide or change.** A lane that
  rewords an assertion's message changes its identity; `--check` then reports
  the old site gone and a new one unclassified, which is the intended outcome
  (someone must look), not a silent pass. Two sites in one domain with the
  same static message are told apart only by order (`#2`).
- **The mutation sample is small and chosen, not random.** 48 mutants (27
  property, 5 evasion, 5 refactor, 4 intended/fix, 5 blind, 1 equivalent, 1
  robustness), run in batches in three scratch trees and joined with
  `mutation-sample.mjs --merge`: the first run (34 mutants), `-batch2` (6),
  `-batch4` (M27, M27h; an interrupted third batch, the original one-edit M27
  that hung before `--timeout-ms` existed, was replaced by it and not kept) on
  38d0409, and `-batch5` (M36–M40, M39b) on c80dad0. Six were re-run for
  reproducibility into `tools/orch/evidence/mutation-recheck.json`: same
  red/green, same named-assertion hit, same failing domains and counts.
  Mutants were written to break a property the way a plausible regression
  would; the five *evasion* mutants were deliberately placed where a pin's
  regex does not read, so they prove a pin *can* miss its property and say
  nothing about how often. Kill rates are evidence about the *kind* of
  assertion, not a defect-detection probability. Every mutant is re-runnable
  and its anchor is checked before it applies.
- **Subset runs.** Every mutant except M13 ran all 76 headless domains; none
  ran the browser domain except M13, which ran it with only the three SHARED
  producers ahead of it. A mutant that only the browser domain could catch
  would be under-reported — M12/M13 exist to show what that domain does and
  does not see.
- **The fast-gate check is a join, not a run.** §4.4 maps each red mutant's
  FAIL lines to sites by their static message fragments and asks where the
  plan puts those sites; nobody has run the proposed fast gate, because it does
  not exist yet. T-120 should run the mutation sample against it once it does.
- **Timing is from one loaded host.** 1-minute load averages of 22.7–27.1 are
  recorded in the committed JSONs that record one (31.6 in the first pass's
  call-site census, in git at 798888d), 45–60 in `smoke-timing.txt`; the
  standalone census, the mutation runs and the phone probe did not record it.
  At the base the browser domain's 300.9 s was its spawn timeout
  (`HB_PROBE_SPAWN_MS=300000`, set by `tools/orch/cloud-setup.sh` for loaded
  cloud hosts; the code default is 45 s), not its natural runtime, which was
  not measured on an idle host. The headless part ranges from 24 s to 131 s
  with load (§6.1).
- **Not measured:** the end-to-end wall time of `merge-task.sh` (it requires
  the main checkout and gate verdicts — out of this lane's fence); it is
  stated as the sum of its measured parts, and the smoke was not re-timed on
  main. Whether killed hook runs leave orphaned probe browsers was not
  measured.
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

## 10. Addendum — review pass, 2026-10-23

**What changed on main after the base (38d0409 → 2fa58bb), merged into this
branch as c80dad0.** Only one file under `tools/pathcheck/` changed:
`render-submission-contract.mjs` (e29665b: a private `mkdtemp` output directory
per run, so the probe can no longer certify another run's `result.json`;
1a3a400: an explicit skip on GPU-less hosts that is not counted as passes, which
added one call site). c7363b4 put `HB_GATE_SKIP_BROWSER_PROBE=1` and the slow-host
knobs into `~/.hullbreaker-host.env`, which the merge gate and the hook source;
ea09b88 makes the hook never boot the probe; 45ea217 has the hook set
`HB_GATE_FAST=1`; 8fd25fc scales the smoke's `page.goto` timeout with
`HB_HARNESS_SLOWDOWN` and accepts a sampled victory as a terminal smoke state.
Nothing in `index.html` or `src/` changed, so the mutation rows from the base
compare with the ones run on c80dad0. Decisions entries 22–25 landed: 24
orders T-120 to rebuild the gate from this document and T-121 to clean the
rest; 25 releases hook v1 and the zip-assembly corner for deletion.

**The review (`reports/tasks/T-108/review.md`, REQUEST_CHANGES) and what this
pass did about each finding.** Every change is in `tools/orch/` or this
document; `test-audit.json` and `test-audit-lock.json` were regenerated.

| # | finding | what changed | evidence |
|---:|---|---|---|
| 1 | `future-facet-render-ownership.mjs:37` (static anatomy) was PIN/DELETE because the mechanical rule matched a variable name; `:89` shared a conjunct with a pin | `:37` → CORE (fast gate); `:89` → CORE, SPLIT (keep `laterVisible === 0`) | M38 (route art on the next face visible before the turn): **RED** at `:37` |
| 2 | the T-032 failure-panel wiring (`pathcheck-suite-2.mjs:126-294`, 21 sites) was DELETE while the same domain's frame-loop pins were REWRITE | all 21 marked `core` → REWRITE; new PLAY-gate case "the failsafe reaches the player" (§7.2 item 2, §7.4 #10) | M36 (slow-boot watchdog dead) and M37 (bubble-phase listener): **RED**, caught today only by those pins — §4.4 lists them "only by a rewrite" |
| 3 | 7 sites of `snap-hook-driven-through-real-sim` and `movement-verb-prototypes.mjs:86,208` drive the live `?flow=1` chain, not hook v1 | those 9 (and `:212`, the same bound upward) → CORE / PURE-INVARIANT on `flag:flow=1` (DEEP; 5 as SPLIT, their hook conjuncts go with T-121); the 14 + 22 hook-only sites → DELETE-WITH-FEATURE (T-121, entry 25); the domain is no longer a whole-domain delete | M39b (chain survives hit and lost life): **RED** at `:244`, `:257`; M39 (non-lethal hit only): green — a gap, filed (§8) |
| 4 | `render-submission-contract.mjs:24,26,28` (lines at the base) were TAUTOLOGY/DELETE, contradicting §7.2's "moves to the PLAY gate"; on main they are no longer stale | re-ranged on main's lines (`:41`, `:43-47`) → SLOW-ENV / PLAY-GATE; out of `lists.delete`; §8 issue 1 dropped as fixed (e29665b) | census on c80dad0: TAUTOLOGY 16 → 8 (this and finding 11), PLAY-GATE 1 → 4 |
| 5 | M19's only killer (`view-scale-experiment.mjs:159`) was DEEP by flag scope, so the proposed fast gate would miss it | the hound / polyp / aim-assist rows that read shipped config → `scope:shipped` (invariant tier); `test-census.mjs` now joins every red mutant to its killers' dispositions | §4.4: M19 caught by the fast gate; no red mutant lost |
| 6 | the mechanical source-text rule decided 110 sites; 20 were not source-text conditions | all 110 hand-classified (label-keyed `SITES` entries): 21 to PURE-INVARIANT or CORE, 2 to DELETE-WITH-FEATURE, 27 more `core` (rewrite), 60 confirmed PIN; a DELETE-bucket spot check added to §3.1 ("lower bound" wording corrected) | `resolution.autoSrcText` = 0; `evidence/spot-checks.json` |
| 7 | `momentum-earned-pace-escalation.mjs:50-64` (7 relational validity checks) were PIN | → PURE-INVARIANT (invariant tier) | — |
| 8 | `boot-registry-contract` was deleted with nothing replacing "a retry replays the same run" | both sites `core` → REWRITE; `boot-registry-check` → REWRITE; §7.4 #9 (retry replay) added | M34 (hostile RNG not reset): green today — the replacement's falsifier |
| 9 | `pathcheck-suite.mjs:1035` joins desktop-FAR identity (hard rule) to portrait pins; `:1030` reads retired dare data | `:1035` → CORE, SPLIT, after T-107; `:1030` note + §7.6 sequencing rule | — |
| 10 | the only headless frame-budget proxies were on the DELETE list, and the PLAY gate's budget is report-only on this host | six proxies (`t-039:162`, `t-048:225`, `t-047:191`, `limb-silhouette-production:74`, `crown-command-architecture:94,130`) → `core`, kept until a gated frame budget exists; §7.7 operator question 1; §8 issue 1 | M40 (a second contact-shadow draw call): **RED**, only by its proxy |
| 11 | count ratchets are not tautologies: `/N\/N contracts passed/` fails when a contract is removed | → PIN; `core` (move the count into the checker) for the CORE checkers' ratchets and the kept adaptive-fidelity checker; deleted with their checkers otherwise; `actor-motion-contract.mjs:16` (`\d+/\d+`) stays TAUTOLOGY; §7.7 operator question 2 | — |
| 12 | site identity was file:line; no lane table; "wave 1" undefined; the mutation sample had no falsifiers for the new rewrite categories | site identity = (domain, label); `test-audit-lock.json` + `test-census.mjs --check`; lane-to-domain table, rules and sequencing in §7.6; M36–M40, M39b added; §7.4 maps each test to the lane writing it (T-103/T-109 for the gun check) | `evidence/lock-drift-demo.txt`: one inserted line → 8 silent reclassifications caught, exit 1 |
| 13 | stale "open" issues; "0 of 5" presented as a rate; "≈ 30 s" fast gate is load-bound; bot-script count | dated addendum (this section); §8 refreshed; the five PIN mutants relabelled `evasion` (an existence proof); cost restated as 24–76 s with load, run 3 on main added; 60 bot scripts (42 + 18) | `timing-full-run-3.json`; `mutation-results.json` kinds |
| 14 | minor class disagreements; `--out` defaulted to the committed evidence | `authored-slope-rib-run.mjs:126` → PURE-INVARIANT, `:214` → PIN; `g2-neck-access-plate-flip-gate.mjs:71` → PURE-INVARIANT; `t-044-corner-setpieces.mjs:96` → PURE-INVARIANT; `rib-run-driven-through-real-sim.mjs:130,140,144` → CORE (DEEP); `pathcheck-suite-2.mjs:149` kept, flagged to T-105 in §7.6; `mutation-sample.mjs --out` now defaults into the scratch dir and `--merge` requires it | — |

Also applied: the first pass's own PURE-INVARIANT spot check had named five
wrong sites (`authored-slope-rib-run.mjs:214`, `t-047-light-rig.mjs:134,139`,
`t-052-hull-texture.mjs:97`, `t-051-backdrop.mjs:137`) without fixing them;
they are now PIN / TAUTOLOGY. The DELETE-bucket spot check's one wrong site
(`t-011-juice-feedback-pass.mjs:54`, juice schema validity) moved its whole
range `[48,57]` to PURE-INVARIANT. The reviewer's two operator questions are
§7.7's questions 1 and 2.

**Net movement of every call site since the first pass** (`node tools/orch/audit-tables.mjs --section movement`,
against the census committed at 798888d):

| disposition at 798888d → now | call sites |
|---|---:|
| DELETE → DELETE-WITH-FEATURE | 49 |
| DEEP → CORE-GATE:invariant-tier | 49 |
| DELETE → REWRITE-AS-BEHAVIOUR | 36 |
| DELETE → CORE-GATE:invariant-tier | 21 |
| DELETE → DEEP | 18 |
| DELETE → SPLIT-ASSERTION | 7 |
| CORE-GATE:invariant-tier → DELETE | 4 |
| CORE-GATE:invariant-tier → DELETE-WITH-FEATURE | 1 |
| DEEP → DELETE | 1 |
| DELETE → CORE-GATE | 1 |
| (unchanged) | 1857 |
| (not comparable: the site's line moved between the trees) | 6 |

132 sites left the DELETE bucket and 5 entered it; 49 moved from DEEP into the
fast gate's invariant tier (the shipped hound / polyp / aim-assist rows). The
6 "not comparable" sites are render-submission-contract's, whose lines main
moved.
