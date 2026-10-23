PASS

# T-108 playtest gate, second pass: docs + tools-only test-suite audit, after the review fixes

Gate of record: branch `task/T-108` @ `8d80f107aa25957b6eb940f0d9c16c623b849609`
(`8d80f10`, "T-108 review pass: fix the DELETE bucket, key sites by label,
re-measure on main"). Its parent `c80dad0` is a merge of main `2fa58bb` into the
branch. Worktree `/home/user/hullbreaker/.claude/worktrees/T-108`: HEAD
`8d80f10` and `git status --porcelain` empty before, during and after. Run
2026-10-23 00:52-01:15 UTC on a GPU-less 4-core host, 1-minute load average
17-45. `. ~/.hullbreaker-host.env` was loaded in every shell that ran a node tool
(it exports `HB_GATE_SKIP_BROWSER_PROBE=1` and the slow-host knobs); no browser
was launched. This file replaces the first-pass verdict, which covered `798888d`
only and stays in git (`f5b4e08`, `2fa58bb`, `0c13e2f`). The only repo file this
gate wrote is this one. Scratch is session-scoped under
`/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/qa-t108-r2/`:
exports of `8d80f10` (`pin/` pristine, `work/` where the tools ran) and of the
trial-merged tree, about 450 MB each, deleted at the end; the small evidence files
stay in `qa-t108-r2/keep/`. Every tool that writes was run in a scratch export, or
from the worktree root with `--scratch` and `--out` in scratch.

**What this verdict claims.** At `8d80f10`: (1) the lane has no effect on the
shipped game or the gate, byte for byte; (2) `node tools/orch/test-census.mjs
--check` exits 0 and `test-audit.json` regenerates; (3) the rest of the committed
evidence reproduces (audit tables, call-site census, inventory sizes, the
`movement` table, the lock-drift demo); (4) the seven mutants new in the review
pass reproduce their recorded red/green exactly; (5) the review's four blockers
are fixed in the machine-readable data, not only in prose. **What it does not
claim:** anything about fun or feel; that the 2,050-site hand classification is
right (the reviewer's call, which this gate does not re-judge); or anything from
a browser. A green legacy `pathcheck` is not evidence (decisions entry 21);
I use it only as a counter. **The verdict is pinned to `8d80f10`; section 6 is a
material heads-up about merging it into today's main.**

## 1. Zero effect on the game and the gate

1. **Scope of the lane's own diff.** `git diff --name-status main...task/T-108`
   (merge-base `2fa58bb`): **32 files, +80,755 / -0, all `A`**, 1 under
   `docs/proposals/`, 31 under `tools/orch/`; nothing outside those two paths.
   The fix commit alone (`git diff --name-status c80dad0 8d80f10`) touches 17
   files, all under the same two paths.
2. **Tree-object identity** (`git rev-parse 8d80f10:<p>` against `<rev>:<p>`) over
   14 protected paths: `src`, `index.html`, `assets`, `tools/pathcheck`,
   `tools/pathcheck.mjs`, `tools/playtest`, `tools/serve.mjs`,
   `tools/orch/{merge-task.sh,smoke-verdict.mjs,cloud-setup.sh,gate-artifacts.sh}`,
   `.claude`, `docs/decisions.md`, `CLAUDE.md`:

   | `8d80f10` against | same | different |
   | --- | ---: | --- |
   | `c80dad0` (the merge it sits on) | 14 | none |
   | `2fa58bb` (the main it merged) | 14 | none |
   | current `main` `851abc7` | 11 | `tools/pathcheck`, `tools/orch/merge-task.sh`, `docs/decisions.md` |

   Every difference against current main is main's own movement after the merge
   point, not the lane's: `ffd1778` (pathcheck-suite.mjs, g2-neck...mjs, and a
   bound in merge-task.sh), `1fc4196` (merge-task.sh), `9050b5d` (decisions entry 23
   addendum). **`src` (`618be636`), `index.html` (`ee291bbb`) and `assets`
   (`d833284d`) are identical to current main and to the first pass's base
   `38d0409`**: the game's bytes have not changed since this audit began.
3. **Nothing runs the lane's files.** A grep of `.claude/`, `tools/pathcheck/`,
   `tools/pathcheck.mjs`, `tools/playtest/`, `merge-task.sh`, `smoke-verdict.mjs`,
   `cloud-setup.sh`, `gate-artifacts.sh`, `index.html` and `src/` for the new tools
   and `test-audit*` finds nothing. The new `--check` is not wired into any gate
   (T-120 will do that).
4. **Trial merge into current main** (`851abc7`): `git merge-tree --write-tree
   --name-only main task/T-108` exits 0, no conflicts (tree `3eb68a1a`; also clean
   at `a217831`, tree `89a4a5bf`).
5. **The real gate on the trial-merged tree** (full `git archive` of
   `89a4a5bf` = main `a217831` + `8d80f10`, host env loaded so the browser probe is
   skipped loudly): `node tools/pathcheck.mjs` prints `SKIP render-submission-contract:
   4 browser-probe assertions not run ...` then **`pathcheck: 3986 passed, 0
   failed`**, exit 0, 97 s. That equals main's own recorded count after `ffd1778`
   (3,986), so merging adds and removes no assertion. (Main moved to `851abc7`,
   reports plus three lines of `merge-task.sh`, after this run.)

## 2. `test-census.mjs --check` and regeneration

All in a scratch export of `8d80f10` (`work/`), so the worktree's committed
`test-audit.json` is untouched.

- **`node tools/orch/test-census.mjs --check --print`: exit 0** (1.9 s), no
  `PROBLEMS` block, `problems: []`. It reports 77 domains, 2,050 sites, 3,990
  evaluations; CORE 251 / PURE-INVARIANT 1,191 / PIN 534 / RETIRED 62 / TAUTOLOGY 8 /
  SLOW-ENV 4; resolution `site 180 / range 1,057 / autoSrcText 0 / default 813`;
  dispositions 803 invariant tier, 379 DELETE, 50 DELETE-WITH-FEATURE, 197
  CORE-GATE, 175 REWRITE, 7 SPLIT, 435 DEEP, 4 PLAY-GATE; tiers fast 1,002 / deep 440
  / play 4 / replaced 175 / gone 429; lock identity `base c80dad0, 2050 sites,
  moved 0`. Every one of those equals the new doc's executive summary and 7.5
  table (251 CORE = 12 %, 379, 50, 175, 1,002; the 7.5 sub-counts 8/2/22/14/4 for
  the 50 and 30/18/14/12/11 for the largest REWRITE domains also match the JSON).
- **Regeneration** (the same command's output file): **byte-identical to the
  committed `tools/orch/test-audit.json` except two lines**, `"when"` (a
  timestamp) and `"tree"` (`null` in a scratch export that is not a git checkout;
  the committed value is `c80dad0`, the lane's HEAD when it generated the file, one
  commit before `8d80f10`). Sizes 1,945,819 vs 1,945,824 bytes, the 5-byte
  difference being exactly `null` against `"c80dad0"`. `diff` shows those 2 lines
  and nothing else.
- **The lock binds** (negative control; this is `evidence/lock-drift-demo.txt`
  reproduced at the final spec): one inserted comment line at the top of
  `tools/pathcheck/pathcheck-suite-2.mjs` in the scratch copy turns `--check` to
  **exit 1**: 47 sites moved one line, 8 silent reclassifications named as
  `verdict drift` (for example "the panel names BOTH ways back in ... RETIRED/DELETE ->
  PIN/DELETE", "the draw is caught SEPARATELY ... PIN/REWRITE-AS-BEHAVIOUR ->
  PIN/DELETE"), 4 ranges that "cover no call site". Restoring the file returns
  exit 0.

## 3. The rest of the committed evidence

| claim | command | result |
| --- | --- | --- |
| every table in the doc is generated, not typed | `audit-tables.mjs --section {classes,examples,domains,mutation,fastgate,standalone,cost,spotcheck}` in `work/` | **289 of 289 generated lines are in the doc verbatim** (21 + 25 + 79 + 60 + 24 + 41 + 17 + 22). The new `movement` section (run from the worktree root, read-only; it `git show`s `798888d:tools/orch/test-audit.json`) prints 14 lines, all in the doc: 132 sites left the DELETE bucket, 5 entered it, 1,857 unchanged, 6 not comparable |
| the 6 sites that entered the delete side | read against `798888d`'s JSON | the five the first pass's own spot check named as wrong (`authored-slope-rib-run:214`, `t-047-light-rig:134/139`, `t-052-hull-texture:97`, `t-051-backdrop:137`, now PIN or TAUTOLOGY) and `pathcheck-suite:192` ("zipper fully locked", DELETE-WITH-FEATURE under entry 25). None is a hard-rule guard |
| per-call-site evaluation counts | from the worktree: `node tools/orch/callsite-census.mjs --scratch <empty> --out <scratch>/callsite-counts.regen.json --skip render-submission-contract` (47 s) | 76 domains, 3,984 passes, 0 fails, 0 threw, 2,042 call-site keys; **byte-identical to the committed `evidence/callsite-counts.json` after masking `tree`, `when`, `host`, `totalMs`, `prelude`, `env` and `domains[].ms`** (the tool now records every `HB_*` knob in `env`, so that field differs by design); 0 call-site entries differ |
| committed run 3 (`timing-full-run-3.json`) | read | head `c80dad0`, 3,985 passed / 0 failed = 3,984 + the one skip-branch assertion, browser domain 0 ms `+1/-0`, host env recorded, 37.5 s at load 22.7. My 76-domain census re-run took 47 s at load 18-25, same order |
| inventory sizes in doc section 1 | `ls`, `wc`, `grep`, `find` | 79 modules, 16,755 lines, 49 read disk, 77 domains, 1,937 `ok` + 113 `near`, 388 source-text sites in 47 domains, 60 bot scripts (42 + 18). **The first pass's "61" is fixed** |

## 4. The new mutants

`node tools/orch/mutation-sample.mjs --scratch <fresh empty dir> --only M34,M36,M37,M38,M39,M39b,M40 --out <scratch json>`
from the worktree root (the tool exports `HEAD` = `8d80f10` into the scratch dir
and edits only there; `--dry` first: all 7 anchors apply; `--out` now defaults into
the scratch dir). Each run is the 76 headless domains.

| id | kind | recorded | re-run | failing assertion (identical to the recorded `failLines`) |
| --- | --- | --- | --- | --- |
| M34 hostile RNG owner no longer resets | PIN evasion | green | **green**, 0 failures (34 s) | none. Its committed row ran on `38d0409`; same result on `8d80f10` |
| M36 slow-boot watchdog dead | PIN property | RED, target hit | **RED**, 1 failure (40 s) | `pathcheck-suite-2: T-032: a boot that never finishes is told to the player, not left as a void` |
| M37 failsafe listens in the bubble phase | PIN property | RED, target hit | **RED**, 1 failure (40 s) | `pathcheck-suite-2: T-032: it listens in the CAPTURE phase for errors ...` |
| M38 route art on the next face visible before the turn | CORE property | RED, target hit | **RED**, 2 failures (41 s) | `future-facet-render-ownership: pre-turn render ownership exposes zero future rows (got 88)` and `... the exact bend is not a generic future-face exception ...` |
| M39 non-lethal hit stops un-earning the `?flow=1` chain | CORE property | green (a gap, filed S4 in the doc) | **green** (43 s) | none |
| M39b neither hit nor lost life un-earns it | CORE property | RED, target hit | **RED**, 2 failures (63 s) | `snap-hook-driven-through-real-sim: a live chain carried into the plane's wall pocket dies on the crush frame itself ...` and `... a lethal hit mid-chain also un-earns the chain (2 -> 2)` |
| M40 a second contact-shadow draw call | PIN property | RED, target hit | **RED**, 1 failure (86 s) | `t-039-contact-shadows: T-039: exactly one InstancedMesh — the +1 draw call the packet promises` |

Red/green, named-assertion hit, failure count, failing domain **and the failure
text** equal the committed rows in all seven. `fast-gate escapes [M13, M36, M37,
M39b, M40]` is the doc's section 4.4, which says plainly that those five are not
caught by the proposed fast gate as drawn (only in play, only by a rewrite, only in
deep) and that none is "lost" (`mutation.fastGate.lost` is `[]`).

## 5. The review's blockers, checked in the data

Read from the regenerated `test-audit.json` (sites keyed by domain and label):

- **Finding 1** (static anatomy, entry 3): `future-facet-render-ownership` "pre-turn
  render ownership exposes zero future rows" is CORE / CORE-GATE (fast); the
  "handoff frame retains its 19 built arrival columns and leaks zero future rows"
  line is SPLIT-ASSERTION. M38 shows the guard is live (above).
- **Finding 2** (T-032 failure panel): in `pathcheck-suite-2.mjs:126-300`, 30 of 38
  sites are REWRITE-AS-BEHAVIOUR, 7 invariant tier, 1 DELETE (the touch-copy line
  `:146`, which T-105 deletes with its fix); `:165, :170, :176, :191, :195, :197,
  :274, :280` are all `core` / REWRITE. M36 and M37 fail today only at those pins, and
  the doc says so.
- **Finding 3** (`?flow=1`): `snap-hook-driven-through-real-sim` `:243-260` are DEEP
  or SPLIT (not DELETE), `movement-verb-prototypes` `:86`, `:208` are SPLIT; the 50
  hook-only and zip-only sites are DELETE-WITH-FEATURE (T-121).
- **Finding 4** (frame budget): `render-submission-contract` `:41, :43, :45, :47` are
  SLOW-ENV / PLAY-GATE; only the two `--throttle` source-regex duplicates are
  DELETE.
- **Findings 5, 7, 9, 10:** `view-scale-experiment:159, :166, :179` are in the fast
  tier; `momentum-earned-pace-escalation:50-64` are PURE-INVARIANT; `pathcheck-suite:1035`
  is SPLIT; the six frame-budget proxies are REWRITE with M40 as the falsifier.
- **Finding 6:** `resolution.autoSrcText` is 0 (all 110 mechanical decisions are
  hand entries now). **Finding 12:** `test-audit-lock.json` has 2,050 unique
  `domain::label` keys and section 2 shows it binds.
- **The DELETE bucket against entry 21**, with the first pass's scans: the narrow
  keyword set (determinism / softlock / reachability / crossability / frame budget /
  wedge / page error) still finds one harness regex pin (`t-027...:85`); the
  broader one (boot / jump / fallback / layer / apex / context / watchdog, 40 of
  379 rows read) shows nothing new beyond what the reviewer cleared
  (`g2-neck...:667-668` stay DELETE with the shipped apex kept at
  `pathcheck-suite.mjs:227-231` and `g2-neck...:669,673`). I do not claim the bucket
  is clean; that is the reviewer's re-review.

## 6. Heads-up: `--check` is red on today's main until the spec is re-keyed

`8d80f10` passes `--check`. The merge target does not: main moved after the branch's
merge point. `ffd1778` inserted a net five lines into `pathcheck-suite.mjs` (a
finiteness assertion at `:260`, `!(h < -100)` loops), and 1,057 sites are still
resolved by **line range**, which the label key detects but does not absorb.

- On the trial-merged tools tree (main `a217831` + `8d80f10`, scratch),
  `node tools/orch/test-census.mjs --check` exits **1 with 19 problems, all in
  `pathcheck-suite`**: 7 ranges that "cover no call site" (590-593, 694, 763, 765,
  797, 988, 994), 11 `verdict drift`s, 1 `unlocked site`. Some drifts are the
  dangerous kind the lock exists for: "solid rectangle membership is half-open on x
  and y" (a kept invariant) would read RETIRED / DELETE, and "dare entry margin ..."
  (RETIRED / DELETE) would read as a kept invariant.
- **Verified remedy, in scratch:** shift the 16 `pathcheck-suite` ranges whose start
  is at or after line 262 by +5; `--check` then reports exactly one problem, the
  unlocked finiteness assertion at `pathcheck-suite.mjs:260`. Classify it (the
  domain default, PURE-INVARIANT, fits) and `--write-lock`.
- This is the lock doing its job, not a defect of the lane, and the SPRINT's T-120
  block already says to re-record the lock after merges. But it means **the first
  act after merging T-108 is a re-key + `--write-lock` on the merged tree** (by the
  lane before the merge, or as T-120's first batch), and nobody should run a deletion
  batch from `lists.delete`'s `line` fields before that. Converting the 1,057
  range-resolved sites to label entries would remove the failure mode.

## 7. What happened to the first pass's findings

- **The hang (my S2).** Fixed on main by `ffd1778`. Verified closed: with the M27h
  edit (`faceTiles` 88 -> 106) applied to a scratch copy of the merged tree, the
  real gate no longer hangs; it ends in 128 s, exit 1, with 23 `FAIL` lines
  (`groundH spans the level`, `levelLength = intro + faces*faceTiles + outro`,
  `every column defined`, `normal generator shape pinned ... got 663/98/79`, ...)
  and then an uncaught `TypeError` in `catwalk-built-prefix-visibility.mjs:40`
  (`arena` undefined), so there is no tally line. Red and loud, not a stall.
  **One new defect found while checking it** (issue 1 below): the finiteness
  assertion main added for exactly this case cannot see it.
- The `61` bot-script count, the stale "open" issues, the dated addendum and the
  default `--out` of `mutation-sample.mjs`: all fixed in this head (60 scripts;
  doc section 10; `--out` defaults into the scratch dir and `--merge` requires it).
- The g1-1 / `?zip=1` sequencing hazard is now the doc's own section 8 item, with a
  more precise account than mine: once `?zip=1` is ignored the test keeps passing as
  a two-process determinism check under a stale label, so what is lost is the
  render-only-equivalence property, not determinism.
- Still open, unchanged, nits: `test-audit.json` carries a fresh `when` (and `tree`)
  on every regeneration, so "regenerate and diff" always shows two lines; and
  `mutation-sample.mjs` reuses a non-empty `--scratch` tree if it contains
  `tools/pathcheck/manifest.mjs`, so a run killed mid-mutant leaves a mutated baseline.

## 8. Not run, and limits

- **No browser:** `phone-probe.mjs`, the browser domain, the 3 timeout checks and 2
  browser checks of the standalone census, M12/M13, and the smoke set. The lane
  changes no game byte (section 1), so a smoke on this head would only re-measure
  main's bytes; the merge gate runs it anyway. The first pass already reproduced the
  headless standalone exit codes, which this head's evidence leaves untouched.
- **Mutants:** 7 of the 48 re-run now (and 7 others in the first pass). The 2,050-site
  hand classification was not re-derived.
- **Timing** is host-load bound and not reproducible; the doc says so. The ranking and
  the pass counts are.
- Nothing about feel was judged. The doc's section 7.7 questions (frame budget on a
  GPU-less host; count ratchets; HUD coverage bound; touch copy; opt-in fixtures; late
  textures) remain the operator's.

## PROPOSED INBOX ISSUES

(SPRINT schema; I did not edit `SPRINT.md`. The issue is about main's `ffd1778`, not
T-108, and does not block the merge.)

```
## I-??? | bug | S3 | repro: copy src/ and tools/ of main a217831, `sed -i 's/faceTiles: 88,/faceTiles: 106,/' src/config.js`, then `node tools/pathcheck.mjs` (or node -e: import src/sim/level.js, groundH.every(h => Number.isFinite(h))) | evidence: tools/pathcheck/pathcheck-suite.mjs:260-261; QA probe qa-t108-r2/keep/hole-probe.mjs -> {"length":663,"emptySlots_holes":42,"everyIsFinite_main_ffd1778_assertion":true,"everyViaForLoop":false}
The assertion ffd1778 added for a half-made level-length edit,
`ok(gH.every((h) => Number.isFinite(h)), 'every generated ground column is a finite
height (a half-made level-length edit leaves holes)')`, cannot see the case it
names. That edit makes groundH a 663-element array with 42 empty slots (sparse
holes, not undefined values), and Array.prototype.every skips empty slots, so it
returns true; a for loop returns false. In the 128 s gate run on that edit the
assertion is not among the 23 FAIL lines. The hang itself is closed (the loops
now test !(h < -100)) and the edit still fails loudly through other assertions
(groundH spans the level; every column defined), so this is a weak guard, not a
regression. Fix: iterate by index (or Array.from(gH).every(...)), and consider the
same for any other `every`/`some`/`forEach` over a generated array. Also note the
runner then dies on an uncaught TypeError in catwalk-built-prefix-visibility.mjs:40
with no tally line; the per-domain bound in the instrumented runner would make
that a clean red.
```
