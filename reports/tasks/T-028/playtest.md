PASS

# T-028 — playtest gate (docs-only: Delivery target rewrite + evidence-citation fixes)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-028`,
branch `task/T-028` @ `e55b8e7` (merge-base `da9b597`). `git diff da9b597
e55b8e7 -- src/` is empty — no runtime file touched, confirmed independently.
Gate is about evidence integrity, not gameplay, per the assignment.

## 1. Pinned server

`node /Users/scottmeyer/projects/hullbreaker/tools/serve.mjs 8790 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-028 --quiet`
(main's copy, since `tools/serve.mjs` predates this branch). Port 8790 chosen
to leave 8741/8742 (operator) undisturbed; killed after this gate (confirmed
down via `lsof`).

## 2. Every cited artifact path resolves — independently re-checked, not just re-trusting the reviewer

Read directly, not just `ls`'d:
- `tools/playtest/reports/cp4/{scored-run-nojump,ceiling-score-only,fallback-only}/summary.md`
- `reports/tasks/{T-015,T-016,T-022}/{playtest,review}.md`
- `docs/playtests/2026-08-victory-box.md`, `tools/playtest/reports/t019/all-runs.md`
- `docs/decisions.md` entries 9–13 (full text, all five)
- `src/config.js`'s `momentum` block

All resolve and contain what is cited.

## 3. Quoted numbers vs. their cited sources — spot-checked directly against the artifact files, not the review's word

| Claim | Source checked | Result |
| --- | --- | --- |
| CP4 row 3: 3 setbacks, 1 life at 16.0s (x 41.662→44.685), 22.0s/30.9s idle (0.712), protoScore −16.5 | `scored-run-nojump/summary.md` | exact match |
| CP4 row 3's setback timestamps/final-x, attributed to T-016's re-run: 3.2/22.4/27.1s, life 15.9s, x 59.649, stallMs 21888 of playMs 30883 | `reports/tasks/T-016/playtest.md:151-154` | exact match, verbatim |
| CP4 row 4: 3 lives spent at 3.2/6.6/9.8s, each at x 31.649, window 31.2s | `ceiling-score-only/summary.md` | exact match |
| CP4 row 4 dropped claim (GAME_OVER/"SIGNAL LOST" not in artifact, `outcome.result` reads `not-completed`) | same file | confirmed — `Result: not-completed` |
| CP4 row 5: 1 life at 16.0s (x 41.649→44.652), 21.9s/31.0s idle, proxy protoScore −15.4 | `fallback-only/summary.md` | exact match |
| Delivery box 3: glyph 9.6px beside 29.6px RIG at FAR | `reports/tasks/T-015/playtest.md:30,68` | exact match |
| Delivery box 7: 49 runs, gate1 cleared 45/49, gate2 cleared once in 41, that run scroll 165 at 64.4s, nothing reached gate3 | `docs/playtests/2026-08-victory-box.md` §1 (lines 9-12, 50-54, 107) | exact match, verbatim |
| Box 10 / momentum-strong.json: strong 60.8%/80.2% above floor, peaks ×1.265/×1.280, maxScroll 118.4/140.0; weak 0.7%/11.6%, peaks ×1.008/×1.025, maxScroll 75.0 | `reports/tasks/T-022/playtest.md` §4 table | exact match |
| momentum-weak.json: `aboveX1.12 = 0` in both flag-on runs; flag on/off identical (maxX 59.6, maxScroll 75.0, 3 lives, all four runs) | `reports/tasks/T-022/playtest.md` §2 table | exact match |
| momentum-weak.json's `hitDrive 0.35`, `hitMercyMs 1500`, `bankLo 0.55`, `wCombat 0.3` "checkable in src/config.js's momentum block" | `src/config.js:83-105` | all present, exact values |
| FLEET-PLAN.md's Aug-1 rider list (entries 0a, 2, 4, 6 reached via `IS_TRAVERSAL_SLICE`-gated URLs) | `docs/decisions.md` entries 9-13 (full read) | headline claims for each entry accurate, no rewording of a verdict found |
| Box 8's "blocked, not dropped" T-021 status | `SPRINT.md:570` (`## T-021 | feature | blocked | P1`) | confirmed |

I found no quoted number in this diff that could not be located in its cited
source. Two independent re-derivations (the T-016 setback/idle figures, the
T-022 momentum percentages) matched their citations to the decimal.

## 4. The three edited scripts parse and run

`python3 -c json.load` on all three — clean. Then, against the pinned
worktree (`--base-url http://127.0.0.1:8790`, `--deterministic`):

- `momentum-weak.json` (`--max-runtime-ms 62000`): loads, runs the full 61s
  policy (5 tap-fires / 3 rules), `outcome.result: not-completed` (expected —
  no `--stop-on-game-over`), no `errors`, no `bootError`, GAME_OVER inside the
  trace at x 59.649 / scrollX 75 / kills 3 — consistent with the structural
  claim the edited description makes (weak run dies near x 59.6, scroll 75).
- `momentum-strong.json` (`--max-runtime-ms 62000`, run for parity): 634
  PLAYING samples, peak `pursuitSpeed` 5.504 t/s (×1.28) — matches
  `strong-2`'s cited ×1.280 almost exactly; no errors, no bootError; final
  scrollX 140. Screenshot (`SIGNAL LOST`, 140m/12 kills/286 shots) looked at
  directly — clean render, no glitches, no assembling anatomy, HUD legible.
- `six-face-full-run.json`: only its `description` field changed (a citation
  fix); not run end-to-end (150s+ window, out of scope for a docs-citation
  check) but JSON parses clean and the edit is a pure string substitution
  with no structural change to the script.

## 5. Smoke suite against the pinned worktree

- `mid-route.json` — `completed`, testapi fidelity, exit clean.
- `transform-slice.json` — `completed`, testapi fidelity, exit clean.

`node tools/pathcheck.mjs` in the worktree: **1674 passed, 0 failed**,
matching build.md's own table.

## 6. No feeling stated as a machine gate

Read all 13 rewritten Delivery boxes in `SPRINT.md`. Each names a currency and
a falsifying test. The two feeling-statements the old target carried
("restrained per DESIGN" — box 4; "FAR-readable tells and glyphs" — box 3)
are explicitly called out as **not a box** in their respective sections and
confirmed present in the new "**DELIVERY-TARGET FEEL QUESTIONS (T-028)**"
packet at the head of the Operator checkpoint queue, with exact URLs
(`index.html` vs `index.html?juice=0`) and both original feelings restated as
questions (1 and 2 in that packet). Box 9 honestly states its own assertion
**does not exist yet** rather than asserting a feeling in its place. Box 8
defers the shape of the split-decision box to the still-`blocked` T-021 rather
than pre-deciding a feel question. No gate in the rewritten target states a
feeling.

## Minor note, not a new defect

`SPRINT.md:1253`'s I-007 entry still carries one pre-existing line
("Reproduced independently: `tools/playtest/runs/gate2-T-016-baseline-
wtharness/`") citing a gitignored path. Confirmed via `git diff da9b597
e55b8e7 -- SPRINT.md` that this line is unchanged context, not something
T-028 added or restated — the reviewer flagged the same thing as
out-of-scope/informational. Agreeing with that read: it doesn't misstate a
number (it's a "reproduced independently" pointer, not a quoted figure), so
I'm not filing it as a fresh Inbox issue; flagging here only so it isn't
mistaken for something this gate missed.

## Verdict

PASS. Docs-only lane confirmed (`git diff -- src/` empty). Every artifact
path I checked resolves; every number I spot-checked (including the two the
team lead specifically called out — T-022 momentum figures and the 49-run
victory-box corpus) matches its cited source exactly. The three edited
harness scripts parse and run cleanly against a pinned copy of this worktree.
The smoke suite completes. No feeling is stated as a delivery gate; both moved
feelings landed in the operator checkpoint queue with exact URLs and
questions. No defects filed — none found.
