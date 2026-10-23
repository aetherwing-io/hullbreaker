PASS

# T-108 playtest gate: docs + tools-only test-suite audit

Gate of record: branch `task/T-108` @ `798888d` (one commit on base `38d0409`),
worktree `/home/user/hullbreaker/.claude/worktrees/T-108`. Run 2026-10-22
23:32-00:00 UTC on a GPU-less 4-core host, 1-minute load average 28-62 (other
lanes' SwiftShader browsers). `git status --porcelain` in the worktree was empty
before and after; the only repo file this gate wrote is this one. Scratch lives
under `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/qa-t108/`
(session-scoped): `pristine/` and `work/` are two `git archive HEAD` exports,
`base/` is `git archive 38d0409`, `merged/` is the trial-merge tree. Every tool
was run either from a scratch export or from the worktree root with `--scratch`
and `--out` pointed at that scratch directory, never at the committed evidence.

**What this verdict claims.** (1) The lane does not change the shipped game or
the merge gate: byte-for-byte. (2) The committed evidence reproduces: the static
join, the audit tables, the per-call-site census, the domain list and assertion
total, seven of the 42 mutants (six scored red/green, one hang), and the exit
code of 34 standalone checks. (3) The three requested blind-spot rows (and several more) say what the
code says. **What it does not claim:** anything about fun or feel; that the
proposal's design is right; that the audit's hand classification of 2,049 call
sites is correct (a judgement, which the doc says plainly); or anything from a
browser (none was launched, see section 7). A green legacy `pathcheck` is not
evidence (decisions entry 21); I used it only as a counter whose total the doc
quotes. The verdict is pinned to `798888d`.

Environment note: `source ~/.bashrc` exports none of the `HB_*` knobs in a
non-interactive shell (the file returns early; same as T-104's gate found), so I
exported `HB_PROBE_BOOT_MS=180000 HB_PROBE_SPAWN_MS=300000 HB_HARNESS_SLOWDOWN=40
HB_SMOKE_VIEWPORT=480x300 HB_GATE_SKIP_BROWSER_PROBE=1` explicitly before every
run below. None of them matters to a headless domain; they are there so nothing
could boot a browser.

## 1. Zero effect on the shipped game and the gate

1. `git diff --stat main...HEAD` (merge-base `38d0409`): **26 files, +58,826 / -0,
   all status `A`**, every path under `docs/proposals/` (1 file, 911 lines) or
   `tools/orch/` (25 files: 10 top-level `.mjs` tools and specs, 2 in `lib/`,
   `test-audit.json` at 1.27 MB, 12 in `evidence/`). `git diff --name-only
   main...task/T-108 | grep -v -E '^(docs/proposals/|tools/orch/)'` is empty.
   Nothing under `src/`, `index.html`, `assets/`, `tools/pathcheck*`,
   `tools/playtest/`, `tools/serve.mjs`, `package.json`.
2. **Tree-object identity, base vs HEAD** (`git rev-parse 38d0409:<p>` equals
   `HEAD:<p>`): `src` `618be636`, `index.html` `ee291bbb`, `assets` `d833284d`,
   `tools/pathcheck` `975a9eb7`, `tools/pathcheck.mjs` `9b6efe9c`,
   `tools/playtest` `43f759ef`, `tools/serve.mjs`, `tools/orch/merge-task.sh`,
   `tools/orch/smoke-verdict.mjs`, `docs/decisions.md`, `SPRINT.md`, `CLAUDE.md`:
   all twelve **SAME**. `src`, `index.html` and `assets` are also identical to
   current `main` (`04599c6`, checked at the end of the run).
3. **No inbound references.** Nothing under `tools/pathcheck/`, `tools/pathcheck.mjs`,
   `tools/orch/merge-task.sh` or `.claude/hooks/` globs, reads or imports
   `tools/orch/*` or `docs/proposals/*` (the three `docs/proposals/2026-08-look-direction.md`
   mentions in pathcheck are comments naming a different file). The PostToolUse
   hook fires only on `src/` or `tools/pathcheck.mjs` edits. Secrets/PII scan of
   the 26 files: clean.
4. **Domain list and assertion total unchanged vs the base** (three routes):
   - `tools/pathcheck/manifest.mjs` blob `c8a598ac` is the same at `38d0409` and
     `HEAD`: 77 domains (79 `.mjs` modules = 77 + `_context.mjs` + `manifest.mjs`;
     the directory's 80th entry is `README.md`), 16,734 lines, 49 modules read disk.
   - The lane's instrumented runner against an **export of the base `38d0409`**,
     browser domain skipped: `pathcheck-timed: 3984 passed, 0 failed, 0 domain(s)
     threw, 71.0 s`, 76 domains; the per-domain `(file, passes, fails)` list is
     identical to the run against `HEAD`.
   - The **real runner** `node tools/pathcheck.mjs` on a scratch copy of the base
     with the browser domain's module, import line and `DOMAINS` entry deleted
     (so no browser can start): **`pathcheck: 3984 passed, 0 failed`**, exit 0,
     67.9 s. That ties the lane's counter to the real gate's own tally.
   - Doc total 3,989 = 3,984 + the browser domain's 5 evaluations
     (`render-submission-contract` `+4/-1` in `timing-full-run-1.json`). Cross-check
     independent of this lane: main's own commit `1a3a400` records "3985 passed, 0
     failed" with that domain skipped = 3,984 + its one source-regex assertion.
5. **Trial merge into current main** (`04599c6`, re-run at the end; it was also
   clean at `ea09b88` and `8fd25fc`): `git merge-tree --write-tree --name-only
   main task/T-108` exits 0, no conflicts (tree `eb1adb27`). Main has touched
   `tools/orch/{merge-task.sh,smoke-verdict.mjs,cloud-setup.sh}` and
   `docs/proposals/2026-10-race-to-the-top.md` since the base; T-108 adds none of
   those paths.

## 2. Reproduction of the committed evidence

All counts below are against the committed bytes of `798888d`.

| claim in the doc | command (scratch export unless noted) | result |
| --- | --- | --- |
| `test-audit.json` is the join of spec + static census + evidence | `node tools/orch/test-census.mjs --print` in `work/`, then `cmp` against `pristine/` | **byte-identical except line 4, the `"when"` timestamp** (both 1,270,585 bytes; `diff` shows exactly 2 differing lines). `problems: []`. Prints `domains 77 call sites 2049 evaluations 3989`, CORE 241 / P-INV 1160 / PIN 572 / RET 59 / TAUT 16 / SLOW 1, dispositions 738 / 508 / 196 / 139 / 467 / 1 |
| every table in the doc is generated, not transcribed | `node tools/orch/audit-tables.mjs --section {classes,examples,domains,mutation,standalone,cost}` | **234 of 234 generated lines appear verbatim in the doc** (19 + 25 + 79 + 54 + 41 + 16). The `spotcheck` section (41 lines) is on-demand output, not quoted; the five sites the doc names (`authored-slope-rib-run:214`, `t-047-light-rig:134/139`, `t-052-hull-texture:97`, `t-051-backdrop:137`) are all in that seed-7 sample, which is itself reproducible (two runs `cmp` equal) |
| per-call-site evaluation counts (2,049 sites, 3,989 evals) | from the **worktree**: `node tools/orch/callsite-census.mjs --scratch <empty> --out <scratch>/callsite-counts.regen.json --skip render-submission-contract` (83 s wall, load 39) | 76 domains, 3,984 passes, 0 fails, 2,042 runtime call-site keys. **Byte-identical to the committed `evidence/callsite-counts.json` after masking its six host/time fields** (`tree`, `when`, `host`, `totalMs`, `prelude`, `domains[].ms`): 183,048 bytes, sha256 `511d7a00...` both. Per-domain passes/fails/failLines identical; 0 call-site entries differ. 2,049 static sites = 2,042 evaluated + 5 (browser domain) + 2 error-path sites that never run (`t-049-hostile-sprites.mjs:299`, `t-051-backdrop.mjs:78`, both "could not be decoded/read"), matching the 0-eval rows in the JSON |
| sizes in doc section 1 | `ls`, `grep`, `find` | 1,936 `ok` + 113 `near`; 387 source-text sites in 47 of 77 domains; 35 `*-check.mjs` (30 + 5) + 4 = 39 surfaces; 58 `tools/playtest/*.mjs`; 42 bot scripts under `scripts/`; 48 `check()` sites in `src/main.js:873-1135`; exactly seven per-file `Math.random`/`Date.now` regexes. **One miss: the doc says 61 bot scripts (42 + 19); the tree has 60 (42 + 18), see issue 2** |
| six standalone checks are red "right now" | all 34 headless checks the census lists (not the 3 x 300 s timeouts, not the 2 browser checks), `node <check>` from `work/`, `timeout 180` each, 103 s total | **34 of 34 exit codes equal the committed census** (29 x 0, 5 x 1; 0 mismatches). That is five of the doc's six reds; the sixth, `tools/playtest/sprite-fallback-check.mjs` (Playwright `TimeoutError`), is a browser check and was not re-run. The five reds fail for exactly the stated reasons: `enemy-motion-check` "wasp frame 0: substantial opaque body"; `finale-pacing-check` "the first readable trio preserves its reviewed neutral forms"; `foreground-pack-check` `spawnSync magick ENOENT`; `enemy-ecology-runtime-check` "ordinary Level 1 kinds own deterministic zero-recipe visual identities"; `rig-slender-check` "body emission must remain zero outside explicit overdrive action" (plus "weapon emission must remain zero until firing/overdrive action", which the doc does not quote) |
| mutation evidence is internally consistent | read of `mutation-results.json`, `-batch2`, `-batch4`, `mutation-recheck.json` | 42 rows = 26 property + 5 refactor + 3 intended + 1 fix + 5 blind + 1 equivalent + 1 robustness (the doc's "4 intended/fix"); no apply errors; batch rows are what the merged file carries; the six recheck rows equal the merged rows (red, targetHit, failCount, failingDomains); 26 distinct aimed-at assertion sites among the property mutants, 35 distinct overall (acceptance asks >= 25) |
| timing (cost table) | the 76-domain re-runs above | wall time is not reproducible by nature and the doc says so: **same ranking at the top** (`pathcheck-suite`, `g1-1-render-only-proved-sim`, `t-042-audio-punch`, `momentum-earned-pace-escalation`; 6 of the top 10 shared), but my 76 domains took 67.9-83.1 s wall (15.9-17.3 s user CPU) at load 38-43, against the doc's 24.2 / 35.8 s at load 24-27. The doc's "about 30 s" CORE-gate figure is therefore an extrapolation from a lighter load (the kept subset was never timed), not a measurement at today's load |

## 3. Mutation re-runs (the binding sample)

`node tools/orch/mutation-sample.mjs --scratch <fresh empty dir> --only <ids> --out <scratch json>`,
run from the worktree root (it exports `HEAD` into the scratch dir and edits only
there; the tool hash-verifies each restore, and after the first batch I also
checked that the four files it had touched, `src/sim/player.js`, `src/mode.js`,
`index.html`, `src/pure/rig.js`, hash-equal the pristine export). Each runs the 76
headless domains.

| id | kind | doc says | re-run here | match |
| --- | --- | --- | --- | --- |
| M01 coyote time silently not granted (`src/sim/player.js:429`) | CORE property | green, silent | **green**, 0 failures (78.7 s) | yes |
| M07 `HOOK_ENABLED` arms without `?hook=1` (`src/mode.js`) | CORE property | green, silent | **green**, 0 failures (70.4 s) | yes |
| M28 failsafe hint "Tap the button to play again." (`index.html:872`) | RETIRED fix | RED, `pathcheck-suite-2` | **RED**, 1 failure, target hit: `T-032: the panel names BOTH ways back in (a key and a button), got "Tap the button to play again."` (76.3 s) | yes |
| M31 gun box lifted 0.3 off the hand axis (`src/pure/rig.js`) | TAUTOLOGY property | green, silent | **green**, 0 failures (62.2 s) | yes |
| B1 gun drawn 0.35 above / 0.12 ahead of the socket (`src/render/player.js`) | blind | green | **green**, 0 failures (89.5 s) | yes |
| B4 corner ritual starts 1.5 tiles early (`src/sim/wavegate.js`) | blind | green, silent | **green**, 0 failures (98.1 s). Not an equivalent mutant: `cornerApproachReady('approach', playerX + 1.5, bendS)` is true 1.5 tiles before the joint by `src/pure/waves.js:139` | yes |
| M27h faceTiles 88 -> 106 without `levelLength` | robustness | hung (killed at 120 s) | **hung**: killed at my 70 s bound, no domain completed (a normal first domain takes ~10 s here). Root cause reproduced separately, see issue 1 | yes |

Red/green, named-assertion hit, failing domains and failure counts equal the
committed rows for all six scored mutants (the doc also re-ran M01, M02, M07, M10,
M20 and M21; M01 and M07 overlap, the rest are independent evidence I did not
repeat). Harness soundness: `_context.mjs:58` derives the entry path from its own
`import.meta.url`, so a `--tree` run reads that tree's `src/` (including the
FAIR-GAP child process, which imports `file://` + that `srcDir`); a mutation in
the scratch tree is what the domains see.

## 4. Blind-spot rows spot-checked (read the cited checks)

1. **"`pathcheck-suite-2.mjs:146` requires the 'Press R' failsafe copy": confirmed.**
   `tools/pathcheck/pathcheck-suite-2.mjs:146-148` is
   `ok(/\bR\b/.test(text.hint) && /button/i.test(text.hint), 'T-032: the panel names
   BOTH ways back in (a key and a button), got "' + text.hint + '"')`, and
   `index.html:872` ships `"hint": "Press R, or click the button, to play again."`.
   Any touch-appropriate rewording that drops "R" fails the gate, and I watched it
   do exactly that (M28 above). `src/ui/shell.js:102` hard-codes `PRESS ANY KEY`
   and no assertion reads it.
2. **"No test references `src/ui/touch-controls.js`; no gate sends a touch event":
   confirmed.** `grep -rniE "touch-controls|touchControls"` over the repo (minus
   `node_modules`, `.git`, `assets`, and the audit's own files) hits only `src/`,
   `SPRINT.md` and `index.html`. No file in `tools/` outside `tools/orch/`
   contains `touchstart`, `touchend`, `TouchEvent`, `dispatchTouchEvent`,
   `touchscreen`, `.tap(`, `pointerType`, `PointerEvent` or `pointerdown`. The only
   pre-existing `hasTouch`/`isMobile` user is `tools/playtest/hud-instrument-smoke.mjs`,
   which no gate file mentions, leaves the title with `page.keyboard.press('Enter')`
   (line 54), and asserts HUD-vs-HUD overlap (line 115) and a synthetic safe area
   (116-118), as the doc says. One nuance the doc does not mention: pathcheck
   *reads* `touch-controls.js` once, implicitly, because
   `t-049-hostile-sprites.mjs:~160-170` scans every `src/ui/*.js` for the string
   `TextureLoader`. That checks nothing about touch behaviour, so the claim stands.
3. **"`t-040-rig-sprite.mjs:110-112` compares the gun against the constants it is
   computed from": confirmed.** The test does `const [gLo, gHi] = gunLocalXSpan(GUN_BOX);
   near(gLo, GUN_INNER_X, 1e-9, ...); near(gHi, GUN_OUTER_X, 1e-9, ...)`
   (`t-040-rig-sprite.mjs:109-111`), and `src/pure/rig.js:343-347` defines
   `GUN_INNER_X`/`GUN_OUTER_X` as `const [GUN_INNER_X, GUN_OUTER_X] = gunLocalXSpan();`
   with default argument `GUN_BOX`: the same function of the same input on both
   sides, so it cannot fail. Line 112 then pins the number 0.825. Production does
   not draw `GUN_BOX` at all (`src/render/player.js:443-445`: "GUN_BOX remains the
   pure swept-reach contract"), and the only socket check is a regex of the line
   `gunGroup.position.set(0, player.muzzleY, 0.25)` (`tools/player-presentation-check.mjs:114`,
   matching `src/render/player.js:907`). M31 and B1 both stayed green when re-run.
4. Also checked: **`render-submission-contract` certifies a stale file.** At the base,
   `render-submission-contract.mjs:8` fixes the output directory
   `/private/tmp/hullbreaker-pathcheck-render-submission`, line 19 reads
   `result.json` from it whether or not the probe exited 0, and the assertions at
   lines 24, 26 and 28 read only that file, so they pass on any leftover. Independent
   corroboration: main's `e29665b` (T-104's gate saw "a 20:23 file certifying a
   21:4x run") fixed it with a per-run `mkdtemp`.
   **Coyote (M01):** `pathcheck-suite.mjs:701-705` says in its own comment that
   "coyote time cannot save a flat gap. The air jump is what actually forgives
   it" (the assertion is line 708); M01 re-ran green. **`PRESS ANY KEY`** is
   asserted nowhere under `tools/` (grep, case-insensitive).
   **Determinism ban:** `_context.mjs:74` `banned` lists
   `performance` but not `Math.random`/`Date.now`; seven per-file regexes cover
   some modules; `src/pure` and `src/sim` currently contain neither (one prose
   mention in `contactShadow.js:6`).
5. **Phone-probe numbers** (`evidence/phone-probe.json`, not re-measured, see section 7)
   match the doc cell for cell: `h1` `scrollWidth`/`clientWidth` 795/602 (1280x800),
   524/397 (844x390), 450/343 (390x844); `press any key`/`wasd`/`arrow`/`space`
   on the title at both coarse-pointer viewports; the same four URLs fetched
   twice at every viewport with four "preload ... credentials mode does not match"
   warnings; 38 boot-budget misses at desktop and portrait, 0 at landscape,
   `still loading after 15039ms of the 6500ms boot budget`; HUD coverage 14.0 %
   (844x390) and 16.4 % (390x844). The mechanism is in the source: `src/render/preload.js`
   has the 2,500/6,500 ms budgets and "It is disposed instead, and the owner keeps
   whatever fallback it already chose."
6. Citations: eleven `file:line` references in the doc (`shell.js:102`,
   `player.js:429`, `pathcheck-suite.mjs:774/790/994/1030-1035`, `t-013-game-shell:283`,
   `t-049:126/171`, `pursuit-model:69`, `_context.mjs:74`) land on the text the doc
   says; 78 of 81 backticked file paths exist (two are globs; the third,
   `tools/orch/play-gate.mjs`, is the *proposed* file); `048716c` is an ancestor of
   `38d0409` and `git diff 048716c 38d0409` over the five cited UI paths is empty.

## 5. Findings that do not change the verdict

None of these changes a conclusion of the audit, and none comes from the lane
touching anything it should not. Four are filed below (one S2 in the existing gate,
three S3).

- **S2 hang in the existing gate, reproduced** (issue 1). The lane found it
  (M27h); this gate reproduced it and found the cause.
- **Doc count off by one** (issue 2): 61 bot scripts should be 60.
- **Deletion list vs entry 21's never-weaken list** (issue 3): two groups of
  DELETE-disposition sites that describe "boot / never wedge" and "movement
  envelope" behaviour with no replacement row.
- **Re-run hazards in `tools/orch`** (issue 4).
- Honesty of the headline numbers: "12 % CORE", "0 of 5 PINs killed, 4 of 4 refactors
  false-alarmed", "0 of 5 blind mutants red" are exactly what the committed rows
  say. The doc scopes the sample as "small and chosen, not random", states that
  PURE-INVARIANT is an upper bound (5 of 40 re-judged), and says M12/M13 (CORE
  `main.js`-boot) cannot be caught headlessly by construction, which is why CORE's
  0.67 includes them.
- Not a defect: the dispositions are the lane's judgement, and the DELETE bucket
  is otherwise clean against entry 21. A narrow keyword scan of all 508 DELETE and
  139 REWRITE rows for determinism / softlock / reachability / crossability /
  frame budget / wedge / page error finds one harness regex pin
  (`t-027-bot-harness-deterministic-dispatch.mjs:85`) and nothing else; the two
  groups in issue 3 came from a broader scan (boot / jump / fallback / layer,
  52 DELETE rows read by hand).
- No `tools/orch/README.md` exists (nor did one before this lane). CLAUDE.md's
  tooling definition of done asks for a README with an honesty note; each new tool
  carries its limitations in its header (`pathcheck-timed`, `callsite-census`,
  `phone-probe`, `standalone-census`, `mutation-sample`) and the doc's "How to
  reproduce every number" table is the index. I accepted that for a scratch-tools
  fence; T-120 (which owns the tool set) may want a real README.

### Triage notes (already resolved or overtaken on main since the base; do not file as new)

- Doc section 8 issue 1 (fixed shared `result.json` path): **fixed** by `e29665b`.
- Doc section 8 issue 2 and section 6 ("the hook's 120 s watchdog can no longer be
  met"): **addressed** by `1a3a400` (explicit loud skip,
  `HB_GATE_SKIP_BROWSER_PROBE=1`, skipped assertions not counted as passes),
  `ea09b88` (the per-edit hook sets it) and `45ea217` (the hook also sets
  `HB_GATE_FAST=1`, so long played proofs run a subset). The merge gate still runs
  the probe where no skip is set. I did not evaluate `45ea217`'s subset; it
  post-dates the pinned base and changes nothing this audit measured.
- Doc section 6 ("`run.mjs`'s fixed 30 s navigation timeout"): **fixed** by `8fd25fc`
  (`page.goto` now scales with `HB_HARNESS_SLOWDOWN`).
- **Still open on main:** `tools/orch/merge-task.sh:119` serves the smoke with
  `python3 -m http.server` (doc section 8 "merge-gate smoke" issue).
- Entry 25 (hook v1 and the `?zip=1` corner released for deletion) post-dates the
  audit. Doc 7.4 #8 (`?hook=1`/`?flow=1` inert at the `mode.js` level), mutants M07
  and M30 and the "hook v1" RETIRED bucket are moot for the hook half. **Sequencing
  hazard for T-120/T-121:** `g1-1-render-only-proved-sim.mjs:122` (the CORE
  determinism domain, the only place M05 was caught) runs its baseline trace with
  `?zip=1`; deleting that flag without first landing doc 7.4 #7 (cross-process
  determinism of the default run) would silently remove that coverage.
- `node tools/orch/test-census.mjs` on the trial-merged tree (`merged/`) reports
  `problems` for `render-submission-contract` (ranges 22-22, 24-28, 32-32 cover no
  call site) and totals of 2,050 sites / 3,990 evaluations, because main edited
  that domain after the audit's base. This is the doc's own 7.6 step 1 (re-census
  after wave 1), not a defect of this lane.

## 6. Screenshots, A.5 metrics, feel

This lane produces no screenshots and changes no pixel; the evidence directory
holds JSON, logs and text only, so there was nothing visual to judge against boards
06/10/11/13/14 and no readability or style check applies. The A.5 vocabulary
(idle fraction, `minEdgeMargin`, `protoScore`) does not apply: no bot run of the
game was made or is claimed. No fun or feel was judged. Questions the doc itself
leaves to the operator are passed through unjudged in section 8.

## 7. What I did not run, and why

- **No browser was launched** (assignment: keep browser use minimal). Not re-run:
  `tools/orch/phone-probe.mjs` (three SwiftShader boots), the browser domain
  `render-submission-contract` (300 s spawn timeout at this load, and main has
  since rewritten it), `tools/playtest/{sprite-fallback,preload-concurrency}-check.mjs`,
  the three standalone checks the census records as 300 s timeouts
  (`tools/assets/check.mjs`, `tools/gatecheck.mjs`, `tools/movement/selftest.mjs`),
  `tools/orch/standalone-census.mjs` end to end, and M12/M13 (the browser-domain
  mutants). Their committed results are consistent with the code I read; they are
  not independently reproduced.
- **The smoke set (`mid-route.json`, `transform-slice.json`) was not run.** This
  lane has zero game effect by tree-object identity (section 1), so a smoke run on
  this worktree would only re-measure the bytes main already ships, at 400+ s per
  script of a software-GL browser on a host at load 28-62. The merge gate runs it
  anyway (`merge-task.sh` step 6). Main's `8fd25fc` has since fixed the
  `page.goto` 30 s timeout that failed the lane's own `transform-slice` attempt
  under load (`tools/orch/evidence/smoke-timing.txt`), plus a separate
  smoke-verdict bug on victory. If a smoke is wanted on this worktree
  regardless: `node /home/user/hullbreaker/tools/serve.mjs 87NN --root <worktree> --quiet`, then from
  `/home/user/hullbreaker/tools/playtest` `node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:87NN`.
- The other 35 of 42 mutants and the 2,049-site hand classification were not
  re-derived. The classification is a judgement the doc flags as such; the
  per-site JSON exists so a reviewer can disagree line by line (section 5 notes
  the lines I would disagree with).

## 8. Questions for the operator (passed through from the doc, not judged here)

For the integrator to route to the checkpoint queue; none has a playable URL
because this lane changes nothing a player sees.

1. Phone HUD coverage: what largest share of the viewport may the HUD panels cover?
   (Measured on today's build, 38d0409: 14.0 % at 844x390, 16.4 % at 390x844, 8.7 %
   at 1280x800; the RIG panel alone spans 36 % of the width and 30 % of the height
   at the top left of the landscape phone.) The proposed PLAY gate needs a number.
2. Touch copy: what should the title prompt and the failsafe hint say on a touch
   device in place of "PRESS ANY KEY" and "Press R, or click the button, to play
   again."? The PLAY gate needs a sentence.
3. Are the opt-in fixtures (`?slice=traversal`, `?slice=transform`, `?g2=1`,
   `?ribrun=1`, `?pace=`, trial stages: 467 deep-suite sites) still wanted at all?
   If not, those sites and the smoke scripts that boot them go with them.
4. When an art file misses the boot budget on a slow device (38 files in 2 of 3
   cold boots on this CPU-starved container), should the late texture swap in
   instead of being discarded for the whole run? That trades entry 16's
   "degrade safely" against what the player actually sees.

## PROPOSED INBOX ISSUES

(SPRINT schema; I did not edit `SPRINT.md`. Issue types follow the schema's
`bug|feel|fairness|art|docs`. None blocks merging T-108.)

```
## I-??? | bug | S2 | repro: node tools/orch/mutation-sample.mjs --scratch <empty dir> --only M27h --timeout-ms 70000 --verbose --out <file.json>  @ 798888d (no browser needed; ~90 s) | evidence: tools/orch/evidence/mutation-results.json (M27h, hung: true); QA re-run row {hung:true, ms:70162, lastDomainsReported:[]}
The headless gate hangs instead of failing when the level length is edited
half-way. Setting CONFIG.path.faceTiles 88 -> 106 without CONFIG.levelLength
(583) makes src/sim/level.js's groundH 663 entries long with 42 undefined holes
from index 583. The gap enumeration in tools/pathcheck/pathcheck-suite.mjs
(gapRuns, lines 349-358, and the identical loop inside gapProbeChild, lines
379-386) does `if (cols[i] > -100) { i++; continue; }` then
`while (cols[i] < -100) i++`: undefined satisfies neither, i never advances, and
`out.push(...)` runs every pass, so the process spins and grows until something
outside kills it. The only bound is the PostToolUse hook's 120 s watchdog, and
that one prints "Not treating this as a pathcheck failure" and exits 0
(.claude/hooks/check-changed.sh), so the per-edit check lets the hanging edit
through; merge-task.sh runs `node tools/pathcheck.mjs` with no bound at all.
Reproduced in a scratch copy without the gate: with that one-token edit, an
iteration-capped copy of the loop hits the cap at i = 583; on the unmutated tree
it returns 18 runs. The side-length lanes (T-205 "six 176-tile sides", any "longer
sides" work, which is exactly entry 20's complaint) edit these two numbers by
hand. Fix direction: before scanning, assert groundH.length === CONFIG.levelLength
and every column is finite, so the edit fails loudly; and give each domain a
wall-clock bound so any future hang is a red, not a stall. T-120 owns pathcheck.

## I-??? | docs | S3 | repro: ls tools/playtest/scripts/*.json tools/playtest/scripts/adversarial/*.json | wc -l  @ 798888d (prints 60) | evidence: docs/proposals/2026-10-test-audit.md:55, tools/orch/standalone-spec.mjs:88 (so also test-audit.json -> standalone)
The audit says "61 bot scripts (42 in tools/playtest/scripts/, 19 in its
adversarial/)" and "merge-smoke (2 of 61)". The tree has 60 JSON scripts (42 + 18);
the 19th file in adversarial/ is repeat.mjs, a runner, not a script. The doc's own
reproduction command (section "How to reproduce every number", last row) prints 60.
No conclusion depends on it. Fix: 60 / 18 / "2 of 60" in the doc and in
standalone-spec.mjs, then re-run node tools/orch/test-census.mjs.

## I-??? | docs | S3 | repro: read docs/proposals/2026-10-test-audit.md 7.5 against tools/orch/test-audit.json (sites with disposition DELETE) in tools/pathcheck/pathcheck-suite-2.mjs and g2-neck-access-plate-flip-gate.mjs  @ 798888d | evidence: pathcheck-suite-2.mjs:195,197,274; g2-neck-access-plate-flip-gate.mjs:667-668
Entry 21 says assertions that guard boot, the movement envelope and safe
degradation stay and are never weakened. The deletion list sends two groups of
sites to DELETE (not REWRITE-AS-BEHAVIOUR) with no replacement row in 7.2/7.4.
(a) pathcheck-suite-2.mjs, T-032 failsafe block: 19 PIN sites (165-223 and
272-294, mostly regexes over index.html's inline handler and src/main.js) are
DELETE while only 231-269 are REWRITE. Most are pure wiring pins (and M23/M35 show
such pins do not bind), but :195 asserts that a boot that never finishes raises
the "slow" panel and :274 that a lost WebGL context fails legibly: player-visible
"never wedge" behaviour. The PLAY gate's `?selftest=1` row paints the panel
(`src/main.js:1113-1119`, `failsafeSelfCheck()`) but forces neither a slow boot nor a
context loss. (b) g2-neck-access-plate-flip-gate.mjs:667-668 drive the real player loop to
the discrete single-jump apex at 60 Hz and 30 Hz (2.61 / 2.49, +-0.02) and are
classed PIN. They are the recorded physical reasoning of the frozen jump
(CLAUDE.md: constants "frozen and asserted ... update the physical reasoning and
the pathcheck assertions together"); the constants themselves are asserted
separately (pathcheck-suite.mjs:227-231), but an integrator or dt change that
moves the apex without touching a constant is caught only here, and the kept
lines 669-673 bound the apex from below only. Suggest the T-120 reviewer re-label
these REWRITE-AS-BEHAVIOUR (or CORE) and add the matching behaviour row before
migration step 5, so the "rewrite first, then delete" rule holds for them.

## I-??? | bug | S3 | repro: read tools/orch/mutation-sample.mjs:51,84,164 and tools/orch/test-census.mjs:213; node tools/orch/test-census.mjs twice and diff tools/orch/test-audit.json  @ 798888d | evidence: tools/orch/test-audit.json:4
Three re-run hazards in tools T-120 will use after every deletion batch. (1)
test-census.mjs rewrites tools/orch/test-audit.json with a fresh "when" every run;
that is the only differing line in 1,270,585 bytes, so "re-run and git diff"
never reads clean, and the runtime evidence JSONs carry six host/time fields
(tree, when, host, totalMs, prelude, domains[].ms) that must be masked before they
compare byte-equal (they do, after masking). A `--check` mode that masks them
would make "does the evidence reproduce" one command. (2) mutation-sample.mjs
defaults --out to the committed tools/orch/evidence/mutation-results.json, so the
doc's own reproduction row for the binding sample (`... --scratch <empty dir>`)
overwrites that evidence in place and writes base=<current HEAD>, dropping the
`merged` key. (3) it reuses a non-empty --scratch tree whenever
tools/pathcheck/manifest.mjs exists there (line 84), so a run killed between
applying and restoring a mutant leaves a mutated baseline for the next run (a
re-applied mutant would fail its anchor-count check loudly; a leftover edit in
another file would not). (2) and (3) are from reading the code, not exercised.
Fix: default --out into --scratch, refuse a non-empty --scratch without --reuse,
and drop or mask `when` in test-audit.json.
```
