APPROVE

Re-review of T-108 at 8d80f10 (on c80dad0, a clean merge of main 2fa58bb), judged with `git diff main...HEAD` against current main a217831. Scope is still clean: 32 files added, all under `docs/proposals/` or `tools/orch/`, nothing modified, nothing under `src/`, `tools/pathcheck/`, `index.html`, `.claude/` or any `package.json`, no OSTK text, no secrets. All four blockers are resolved in `test-audit.json`; a fresh random sample weighted to the DELETE buckets found 0 disagreements in 42 sites; `test-census.mjs --check` is clean on the lane tree and the JSON regenerates byte-identical; the migration plan is label-keyed and has the lane-to-domain table. The findings below are follow-ups for the integrator, T-120 and T-121, none of them blocks this merge.

Prior review (798888d, REQUEST_CHANGES): 14 findings, four of them blockers (hard-rule or live-behaviour guards in `lists.delete`: the static-anatomy proof `future-facet-render-ownership.mjs:37`, the T-032 failure-panel wiring `pathcheck-suite-2.mjs:126-294`, the live `?flow=1` / damage-plane lines labelled hook v1, the frame-budget probe sites in `render-submission-contract.mjs`). The lane's §10 table answers each; I checked every row against the JSON, not against the table.

## Findings (all non-blocking), most severe first

1. tools/pathcheck/snap-hook-driven-through-real-sim.mjs:199 — FIX, before T-121 deletes the hook sections. `ok(!!sim, …)` is classed DELETE-WITH-FEATURE ("deleted together with the feature by T-121"), but lines 191-200 are `try { sim = JSON.parse(execFileSync(…)) } catch …; ok(!!sim); if (sim) { … }`: it is the only guard that the child ran, and the 7 live `?flow=1` crush/setback sites (`:243-260`, DEEP or SPLIT) sit inside `if (sim)`. When T-121 removes the hook imports from the child and `:199` goes with the feature, a child that throws leaves the flow section silently skipped and the gate green. The domain note and §7.6 say "keep the flow section running" but not "and its liveness assertion". Fix: mark `:199` SPLIT (keep, reword to the flow child) in `tools/orch/test-audit-spec.mjs`, and add the liveness assertion to the T-121 row of §7.6 and to T-121's brief (T-121 is already `doing`).

2. tools/orch/test-census.mjs `--check` against current main — NOTE for the integrator (pre-merge, or T-120's step 0). Main moved after the branch's merge point: ffd1778 added one call site and shifted `tools/pathcheck/pathcheck-suite.mjs` by 5 lines after :260. In a scratch copy of main a217831 plus this branch's 32 files, `--check` exits 1 with 19 problems: 7 hand ranges that now cover no site (pathcheck-suite 590-593, 694, 763, 765, 797, 988, 994), 1 unlocked site (`every generated ground column is a finite height …`, :260, the guard main added for M27h) and 11 verdict drifts, among them `solid rectangle membership is half-open on x and y` PURE-INVARIANT to RETIRED/DELETE, `the first gap is still columns 29-31` PIN/DELETE to CORE-GATE, `dare dead-end rejects hidden wall adhesion` RETIRED/DELETE to invariant tier. That is the detector doing its job on a real edit, and it confirms why the lock exists. Nothing runs `--check` automatically, so `merge-task.sh` and the gate are unaffected (the real gate is green on that tree, below). But the committed counts (2,050 sites) and `file:line` are for c80dad0, so T-120's first step must be: repair the ranges, classify the new site, `--write-lock`. If the integrator wants it on the branch instead, an integrator-only commit with `--accept-stale-verdicts` (merge-task.sh documents it) avoids another review cycle.

3. docs/proposals/2026-10-test-audit.md:938-947 (§7.6 lane table) — NOTE. It predates 9050b5d, which folded T-201, T-202 and T-203 into one "race pass" lane that also does "the sim-side zipper removal (entry 25 / I-105)" (SPRINT T-201). Add that row. It rewrites the wave gate (entry 23 #2, the turn never waits), so the CORE-GATE wave-gate lines (`t-009-non-gating-station-cannot.mjs:63-71`, `gate-prelude-runtime.mjs`, `momentum-earned-pace-escalation.mjs:485`) are its obstructions to rewrite, not T-120's to protect. And the table gives the zipper to T-121 while SPRINT gives the sim side to the race lane: say who removes `zipperOffset`. Kept fast-gate tests model the default corner with it (`future-facet-render-ownership.mjs:64`, `catwalk-built-prefix-visibility.mjs:52`) and must be re-modelled in the same change; the DELETE-WITH-FEATURE notes on `pathcheck-suite.mjs:173-192` should say so.

4. tools/orch/test-audit-spec.mjs:1073,1367-1427,1506-1582 (the `note` strings in the JSON) — NOTE, stale cross-references. §7.2 was renumbered when items 2 and 6 were added: `:1073` sends the frame-budget hygiene to "§7.2 item 9" (it is item 11; 9 is safe asset degradation), the 21 T-032 notes say "item 3" (the failsafe case is item 2), the render-ownership notes say "item 4" (it is item 6). The doc's example row at :227 repeats the first. These notes are what T-120 reads per site.

5. tools/pathcheck/t-018-bot-harness-relative-geometry.mjs:116-121 and :142,:144; tools/pathcheck/t-027-bot-harness-deterministic-dispatch.mjs:80,85 — NOTE. `:116-121` are now PURE-INVARIANT (DEEP) but the condition is a regex over harness source, a PIN by the doc's own rubric; harmless in DEEP. `:142,:144` (the bot's terrain probe reads the same `groundH` the player collides against) and `t-027:80,85` (deterministic dispatch) stay DELETE; the lane's own DELETE-bucket spot check calls `t-027:80` "worth a behavioural replacement inside tools/playtest". Carry both into T-120's harness-self-test list so the instrument's honesty is not lost silently. Unchanged since the first review; not a hard-rule guard.

Operator questions: none new. §7.7's two are answered by the integrator in the T-120 block (frame budget report-only on this host; count ratchets on CORE checkers stay as tripwires inside the checker).

## Check 1: the four blockers in test-audit.json (all resolved)

| blocker | now | verified |
|---|---|---|
| `future-facet-render-ownership.mjs:37` static anatomy | CORE / CORE-GATE (fast); `:89` CORE / SPLIT-ASSERTION (keep `laterVisible === 0`); `:87` stays DELETE (the 690/1100 ms pin) | JSON; M38 re-run RED at `:37` and `:39` |
| `pathcheck-suite-2.mjs:126-294` T-032 wiring | all 21 sites PIN + `core` / REWRITE-AS-BEHAVIOUR (30 with the frame-loop pins); only `:146` (touch copy) is DELETE; new §7.2 item 2 and §7.4 #10 name the replacement and M12/M36/M37 | JSON; M36 re-run RED at `:195` |
| `snap-hook-driven…:243-260` and `movement-verb-prototypes.mjs:86,208,212` | flow sites CORE / PURE-INVARIANT on `flag:flow=1`: DEEP, or SPLIT-ASSERTION where a hook conjunct goes with T-121; the 14 + 22 hook-only sites are DELETE-WITH-FEATURE (entry 25); domain verdict SPLIT, not in `deleteWholeDomains` | JSON; M39b re-run RED at `:244` and `:257`; no flow-related site is left in DELETE (scan of all 379 statements) |
| `render-submission-contract.mjs` frame-budget sites | re-ranged on main's lines (`:41,:43,:45,:47`), SLOW-ENV / PLAY-GATE; only the two probe-flag source pins (`:21`, `:53`) remain DELETE; §7.2 item 11 and operator question 1 | JSON; census on c80dad0: TAUTOLOGY 16 to 8, PLAY-GATE 1 to 4 |

Findings 5-14 of the first review are in the JSON too: all 110 mechanically classified sites hand-classified (`resolution.autoSrcText` = 0; of my 20 false positives, 19 are out of DELETE and `crown-command-architecture.mjs:53` is a genuine exact-count PIN); `momentum-earned-pace-escalation.mjs:50-64` PURE-INVARIANT; `boot-registry-contract` both sites REWRITE with §7.4 #9; `pathcheck-suite.mjs:1035` SPLIT after T-107; the six frame-budget proxies and the CORE checkers' count ratchets REWRITE; `view-scale-experiment` hound / polyp / aim-assist rows `scope:shipped` (§4.4: M19 caught by the fast gate, 49 sites DEEP to invariant tier); the minor class fixes; `--out` defaults into the scratch dir. The movement table (49 DELETE to DELETE-WITH-FEATURE, 49 DEEP to invariant tier, 36 DELETE to REWRITE, 21 DELETE to invariant tier, 18 DELETE to DEEP, 7 to SPLIT, 5 into DELETE, 1,857 unchanged) matches my own join of the two JSONs.

## Check 2: fresh random sample (mulberry32 seed 9001, 42 sites, each opened at file:line)

Weighted to the buckets that delete things: 16 DELETE (5 hand-keyed, 6 range, 3 default, 2 TAUTOLOGY), 8 DELETE-WITH-FEATURE, 5 REWRITE (3 of them moved out of DELETE), 3 SPLIT, 10 moved into or kept in the fast gate or DEEP. A agree, B borderline (defensible, same disposition), D disagree.

| bucket | n | A | B | D |
|---|---:|---:|---:|---:|
| DELETE (PIN, TAUTOLOGY) | 16 | 14 | 2 | 0 |
| DELETE-WITH-FEATURE | 8 | 8 | 0 | 0 |
| REWRITE-AS-BEHAVIOUR | 5 | 5 | 0 | 0 |
| SPLIT-ASSERTION | 3 | 3 | 0 | 0 |
| kept: fast gate, invariant tier, DEEP (incl. 8 reclassified in this pass) | 10 | 9 | 1 | 0 |
| all | 42 | 39 | 3 | 0 |

| class | n | A | B | D | strict | lenient |
|---|---:|---:|---:|---:|---:|---:|
| CORE | 5 | 5 | 0 | 0 | 100 % | 100 % |
| PURE-INVARIANT | 8 | 7 | 1 | 0 | 88 % | 100 % |
| PIN | 19 | 17 | 2 | 0 | 89 % | 100 % |
| RETIRED (all in DELETE-WITH-FEATURE) | 8 | 8 | 0 | 0 | 100 % | 100 % |
| TAUTOLOGY | 2 | 2 | 0 | 0 | 100 % | 100 % |
| all | 42 | 39 | 3 | 0 | 93 % | 100 % |

First review for comparison: 83 sites, 76 % strict, 92 % lenient, 7 D. With 0 D in 42 the true disagreement rate is bounded below about 7 % (rule of three), against 8 % before; small sample, so the targeted hunts below carry the weight. Borderline: `t-013-game-shell.mjs:44` (a data-schema check filed PIN), `t-029-runtime-truth-three-debug.mjs:88` (a local lambda tested against itself, so TAUTOLOGY-ish; DELETE either way), `t-018-bot-harness-relative-geometry.mjs:116` (finding 5). Spot-verified specifics: `t-052-hull-texture.mjs:97` really is a tautology (`worldPerTileCopy` = d / (rep x copies) with `rep` = d / (tile x copies)); `t-040-rig-sprite.mjs:110` likewise (`rig.js:346`); the shipped-scope claims for the polyp (default lattice from face 3, `lattice.js:624`) and aim assist (`mode.js:229`) hold.

Targeted hunts over the new DELETE (379) and DELETE-WITH-FEATURE (50) sets, repeating the first review's methods (I also read the whole DELETE list and the whole DELETE-WITH-FEATURE list, by domain):
- keyword scan of the 379 DELETE statements for boot, determinism, layer, softlock, envelope, frame and fallback subjects: 106 hits before, 58 now; every remaining hit read, none is a hard-rule guard (exact corner-ritual curves, dare-wager data, exact counts, regexes over render source).
- scan of DELETE and DELETE-WITH-FEATURE for deleted liveness guards (`ok(!!x)`, exit-status asserts) in domains that keep other sites: one that matters, finding 1.
- the 19 earlier false positives and the decision-backed lines (`t-035` dose is pinned by the kept `:67`; `momentum…:286`'s "no elapsed or face input" is covered by the driven WIRING proofs) checked.
- 50 DELETE-WITH-FEATURE sites: all are hook v1 (36) or the zip corner (14), as entry 25 releases; none touches flow, the shipped corner's solid / build state, or an asset path.

## Check 3: `node tools/orch/test-census.mjs --check`

Run in a scratch copy of 8d80f10 (the command writes `test-audit.json`, so not in the worktree): exit 0, `problems: []`, identity `base c80dad0, 2050 sites, moved 0`, and the regenerated JSON is byte-identical to the committed one apart from `when` and `tree`. The lock has 2,050 unique keys, all present in the JSON. Every table the doc prints (`classes`, `examples`, `domains`, `mutation`, `fastgate`, `standalone`, `cost`, `spotcheck`, `movement`) appears verbatim in the proposal. The drift behaviour is demonstrated on a real edit, not only the lane's synthetic one: finding 2.

## Check 4: migration plan (§7.6)

Present and sound: "wave 1" is defined and mapped lane by lane (T-101, T-102, T-103, T-105, T-107, T-109, T-121, T-205); rule 2 keys every batch by (file, label) with a clean `--check` as the precondition and `--write-lock` after each batch; rule 3 requires a replacement green and a property mutant red before any REWRITE pin goes, and M36-M40 / M39b were added for the failsafe, render ownership, flow and frame-budget lines; rule 1 lets lanes delete their own obstructions (entry 21) and T-120 take only unclaimed lines; the §7.4 table says who is writing each of the 11 tests (four adopted from T-101, T-102, T-103/T-109, T-105). Gaps are findings 1-3.

## What I re-ran (host profile loaded, `. ~/.hullbreaker-host.env`; nothing written in the worktree or main)

- `git diff --name-status main...HEAD`: 32 files, all added, all inside the fences.
- Census `--check --print` on 8d80f10 (scratch): clean. On main a217831 + the lane's files (scratch): exit 1, 19 problems (finding 2).
- Mutants M36, M38, M39b via `mutation-sample.mjs --scratch … --only … --out <outside the repo>`: all RED at the assertions the doc names (M36: `a boot that never finishes is told to the player`; M38: `pre-turn render ownership exposes zero future rows (got 88)` and `the exact bend is not a generic future-face exception`; M39b: `a live chain carried into the plane's wall pocket dies on the crush frame itself` and `a lethal hit mid-chain also un-earns the chain`). Their anchors are valid and runnable (`index.html:986`, `:965`; `src/pure/path.js:120`; `src/render/contact.js` has `geo`, `mat`, `POOL_MAX` in scope for M40). 96-119 s each at load 38-42.
- Real gate, `node tools/pathcheck.mjs` on main a217831 + the lane's 32 files (scratch): 3986 passed, 0 failed, exit 0, 113 s at load about 45, browser probe skipped by the host profile.
- Sampling scripts and ledger: `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/rr-pick.mjs` and `rr-sample.json`.
