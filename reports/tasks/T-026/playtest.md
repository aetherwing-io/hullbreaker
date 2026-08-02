PASS

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-026`, branch
`task/T-026`, one commit `13aef89` on merge-base `da9b597`. Harness-only task
(fixes two static gates, I-014 and I-024). Reviewer APPROVE already on file at
`reports/tasks/T-026/review.md`; this is the independent playtest attack on the
new assertions, not a re-read of the builder's or reviewer's claims.

## 1. Is `tools/gatecheck.mjs` wired into anything automatic?

No. Grepped `tools/orch/merge-task.sh`, every `package.json`, `tools/pathcheck.mjs`,
and `.github/workflows` (none exists) for `gatecheck` — the only hits are inside
`tools/gatecheck.mjs` itself and comments in `pathcheck.mjs`/`check.mjs` pointing
at it. **It only runs when a human remembers to.** That is a limitation, not a
failure: the task's actual acceptance ("committed as a test so the next editor
cannot silently un-bind them") is satisfied by two things that DO run on every
invocation of their own gate — `check.mjs`'s 25-case `IMPORT_SELFTEST` and
`pathcheck.mjs`'s in-probe clamp-removed control (§4 below) — and the build
report already raises "should `merge-task.sh` run gatecheck.mjs?" as an open
operator/integrator question rather than hiding the gap. Ran it directly to
confirm it does what it says:

```
node tools/gatecheck.mjs
  ok   baseline tools/pathcheck.mjs (exit 0)
  ok   baseline tools/assets/check.mjs (exit 0)
  ok   assets-multiline-import — exit 1, 2 static import(s) rejected, 2 error(s), 0 runtime reference(s)
  ok   assets-runtime-reference — exit 0, 0 static imports, 3 runtime reference(s) listed
  ok   fairgap-clamp-removed — 2 site(s) mutated, exit 1, 3 assertion(s) failed, 1 of them the expected one
  ok   fairgap-floor-column-at-run-speed — 1 site(s) mutated, exit 1, 3 assertion(s) failed, 1 of them the expected one
  ok   fairgap-meter-stuck — 1 site(s) mutated, exit 1, 1 assertion(s) failed, 1 of them the expected one
5 controls, every one of them red where it must be, green where it must be.
PASS
```
It cleans up its own scratch mutant (`tools/.gatecheck-mutant.mjs` did not exist
after the run) and costs ~13s, matching the build report.

## 2. Adversarial import-scan fixtures (mine, not the builder's 25)

Wrote 16 of my own cases directly against `tools/assets/lib/imports.mjs`
(script kept at
`/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/qa-t026/adv-test.mjs`),
covering every shape the assignment named plus a few more:

| case | result |
| --- | --- |
| specifier on 3rd line (`from` and specifier co-located, keyword 2 lines up) | caught |
| 4 blank-line-interleaved split across 7 lines | caught |
| `import\n{\nx\n}\nfrom\n'../assets/y.png'`, no trailing `;` | caught |
| side-effect `import '../assets/z.png'` | caught |
| dynamic `import('../assets/dyn.png')` | correctly legal |
| dynamic import split across lines | correctly legal |
| `export {x} from '../assets/w.png'` | caught |
| multi-line re-export | caught |
| template-literal specifier `` import x from `../assets/${n}.png` `` | not caught — **but this is not valid JS** (an ES import specifier must be a string literal; a template-literal specifier is a `SyntaxError`), so it is not a real hole, just an untested no-op case |
| comments between `import` and clause, and between clause and `from` on separate lines | caught |
| `export default function Foo() {}` immediately followed by a real import on the next line | caught correctly (1 hit, right kind, right line) |
| `import` as a property name / member assignment used as a decoy before a real import | caught, decoy ignored |
| a fake `"import ... from '.../fake.png'"` string sitting several lines above a real import | only the real one flagged, at its own line |
| import-attributes syntax `import data from '../assets/data.json' with { type: 'json' }` | caught |
| `export * as ns from '../assets/ns.png'` | caught |

0 of 16 gave a wrong answer. I also independently reproduced the reviewer's
already-filed **I-034** (misattribution, not a detection hole): `export default
class Foo {}` immediately followed by a real import merges into one hit
reported as `kind:"export"` at line 1 instead of `kind:"import"` at line 2 —
confirmed byte-for-byte, and confirmed (per the reviewer's note) that a
non-asset import inserted between the class and the real one does not swallow
the real one either — it still shows up as its own, correctly-kinded, correctly-
lined hit. I-034 is already in the Inbox; not refiling.

No new detection hole found. The one gap I found (template-literal specifiers)
is not a real gap because the input isn't legal JS to begin with.

## 3. False positives

```
node tools/assets/check.mjs --root tools/assets/fixtures/runtime-reference   → PASS, exit 0, 3 runtime refs, 0 static imports
node tools/assets/check.mjs (real repo tree, this worktree)                  → PASS, exit 0, "src/ contains no reference to assets/ at all"
node tools/assets/check.mjs --selftest                                        → PASS, 23 palette + 25 import-scan cases
```
No false positives.

## 4. Fair-gap negative control, reproduced against the real clamp

Edited `src/sim/player.js:470` myself (`if (player.x + player.hw > re) player.x
= re - player.hw;` → `if (false) player.x = re - player.hw;`), leaving the
scroll-speed start untouched — this is the real shipped clamp, not the probe's
synthetic one.

- Before restoring (clamp dead): `node tools/pathcheck.mjs` → **1671 passed, 6
  failed**, including, verbatim: `every floor-labelled sweep really ran at the
  scroll floor: fastest mean ground speed 9.3321 vs CONFIG.scrollSpeed 4.3
  tiles/s ... FAILS at 29-31 (9.285), 46-47 (9.329), ...` plus the negative-
  control assertion (`mean ground speed 9.29 tiles/s and a 4.12-tile takeoff
  window`) and the pre-existing window-comparison assertion (worst window
  4.22). Matches the build/review reports' numbers.
- Restored the one line: `node tools/pathcheck.mjs` → **1677 passed, 0
  failed**, exactly back to baseline.
- Baseline delta confirmed independently by checking out `tools/pathcheck.mjs`
  at `da9b597` in place and running it (**1674/0**), then restoring `13aef89`'s
  copy (**1677/0**) — exactly +3 assertions, and `git diff da9b597 13aef89 --
  tools/pathcheck.mjs | grep '^-.*ok('` returns nothing, so no existing
  assertion was weakened or deleted.

Worktree left exactly as found: `git status --short` shows only the reviewer's
pre-existing untracked `reports/tasks/T-026/review.md`; `git diff HEAD` is
empty; no stash left behind (a `git stash -u` used mid-check to snapshot state
was popped back immediately after).

## 5. Zero effect on the shipped game

`git diff da9b597 13aef89 --stat -- src index.html` → empty, no output at all.

Served the pinned worktree standalone (`node
/Users/scottmeyer/projects/hullbreaker/tools/serve.mjs 8750 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-026 --quiet`, port
8750 — not 8741/8742) and ran the smoke set from the main checkout's harness
against it, deterministic:

```
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --base-url http://127.0.0.1:8750 --deterministic
  → outcome: completed (fidelity: testapi), 0 falls, 0 errors, no bootError
node run.mjs scripts/transform-slice.json --base-url http://127.0.0.1:8750 --deterministic
  → outcome: completed (fidelity: testapi), 0 falls, 0 errors, no bootError
```
Both reports' `errors: []`, `bootError: undefined`, 0 console errors. Port 8750
killed afterward; confirmed no longer listening.

## Verdict

Every claim in the build report and review's APPROVE checks out against my own
independent reproduction: the gates genuinely fail on the exact defects they
were built for (verified with my own line-edit to `src/sim/player.js`, not the
probe's internal control), my own adversarial fixtures found no new detection
hole, no false positive was introduced, `tools/gatecheck.mjs` is real and does
what it says but is honestly disclosed as manual/unwired rather than hidden as
automatic, and the shipped game is byte-for-byte untouched. No new Inbox issues
filed — the one defect I could independently reproduce (I-034, the export/import
misattribution) is already filed by the reviewer and I have nothing to add to
it.

**PASS.**
