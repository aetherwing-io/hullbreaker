PASS

Gate: T-037 (pathcheck split into per-domain modules). Worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-037`, branch
`task/T-037`, commit `3957de7`, merge-base `7c700ca`. This lane touches the
gate itself, not the game — the risk judged here is that the split gate
stops catching things while still printing green, not that the shipped game
regressed.

Server: `node tools/serve.mjs 8791 --root .claude/worktrees/T-037 --quiet`
(port 8791, outside the operator's reserved 8741–8747 and outside every
other lane's port I could see listening at start). Killed at the end of the
session. For the wall-clock comparison I additionally pinned the merge-base
commit in a disposable worktree (`/tmp/hb-t037-mono`, `git worktree add
--detach 7c700ca`), removed with `git worktree remove --force` when done —
confirmed absent from `git worktree list` afterward.

## 1. The gate still gates — proven by breaking the GAME, not the gate

Two real defects, in two domains **not** already exercised by the builder's
or reviewer's own negative controls (both of which used `jumpVel`,
`turnDeg`, `hitstop`, `momentum` banding, `document`/`window` purity), so
this is independent coverage rather than a re-run of their evidence:

- **Frozen movement constant moved**: `src/config.js` `gravity: -36 → -35`
  (same frozen block as `jumpVel`, but the other half of it — apex depends
  on gravity too, and nobody had touched this one yet). Result:
  `pathcheck: 1809 passed, 3 failed`, exit 1, first failing line
  `FAIL jump tune frozen`, plus the two apex-figure assertions that derive
  from it (`got 2.683…, want 2.61` / `got 2.567…, want 2.49`) — caught by
  `tools/pathcheck/pathcheck-suite.mjs`. Restored; `git diff --stat` empty,
  gate back to 1812/0/exit 0.
- **Raw hex literal in a tokenized render file**: added
  `const _QA_PROBE_LEAK = 0xff00ff;` to `src/render/fx.js` (one of the
  files T-010's palette-centralization rule covers). Result:
  `pathcheck: 1810 passed, 2 failed`, exit 1, naming both
  `FAIL palette: no raw color literals — 0xRRGGBB or CSS #hex/rgb() — in
  tokenized render files … (found: fx.js:0xff00ff)` (caught by
  `tools/pathcheck/t-002-ritual-decision-trace-frame.mjs`) and a second,
  independent guard in `t-011-juice-feedback-pass.mjs` that also scans for
  literals — a real defense-in-depth result, not a duplicate. Restored;
  `git diff --stat` empty again.

Both controls named the right subject on the first try, in modules the
builder never exercised. `git status --short` after each restore showed
only the reviewer's pre-existing, untracked `review.md` — nothing of mine
left behind.

## 2. The manifest cross-check works

Deleted **`d36`** (`momentum-earned-pace-escalation.mjs`, a different domain
than the builder's own `d25`/`t-011` demonstration) — both its import line
and its `DOMAINS` array entry — from `tools/pathcheck/manifest.mjs`. Result:

```
pathcheck: 1 domain module(s) present but not listed in manifest.mjs: momentum-earned-pace-escalation.mjs
Their assertions would not run and this gate would still print green. Add them to the manifest in the position they must run.
```

Exit 1, named the exact unlisted file. Restored from a pre-edit backup
(`diff` against the backup showed no difference — byte-identical restore);
gate back to 1812/0/exit 0.

## 3. Consumers still work

- **`tools/orch/merge-task.sh`**: read its pathcheck usage directly — lines
  96 and 143 both run bare `node tools/pathcheck.mjs` and gate purely on the
  process exit code (`|| fail …`, `if ! node tools/pathcheck.mjs`); neither
  parses "N passed, M failed" text, matching the build report's claim. I did
  not run the actual merge script (it performs a real `git merge` into
  `main`, out of scope for a gate check and risky against concurrent lanes)
  but exercised the exact command on both lines directly in the worktree:
  green (exit 0, 1812/0) at baseline, and red (exit 1) under each of the
  three defects above — the contract the script depends on is intact both
  ways.
- **`node tools/gatecheck.mjs`**: ran it fresh in the worktree —
  `5 controls, every one of them red where it must be, green where it must
  be. PASS`, exit 0. No leftover `tools/.gatecheck-mutant*` directory after
  the run, `git status --short` still clean.

## 4. Zero effect on the shipped game

- `git diff main...HEAD -- src index.html assets` (three-dot, against
  merge-base `7c700ca`): empty.
- `git diff main...HEAD --stat`: 55 files changed, all under
  `tools/pathcheck*`, `tools/gatecheck.mjs`, and `reports/tasks/T-037/`.
- Smoke suite against the pinned server (`--base-url http://127.0.0.1:8791
  --deterministic`): `scripts/mid-route.json` → `outcome: completed`
  (fidelity testapi, 0 deaths); `scripts/transform-slice.json` →
  `outcome: completed` (fidelity testapi, 0 deaths). Both reports:
  `bootError: null`, `consoleErrors: []`, `pageErrors: []`.
- `index.html?selftest=1` against the pinned server, headless Chrome via
  Playwright: title `SELFTEST PASS (35 checks)`. One console 404 observed
  (`favicon.ico`) — a browser auto-request, not a game asset; reproduces
  identically on a plain `curl` of the same path, so it's pre-existing and
  unrelated to this change, not a regression.

## 5. Wall-clock cost

Five runs each, same machine, back to back:

| build | runtimes (s) | mean |
| --- | --- | --- |
| split (this worktree) | 3.95, 3.84, 3.75, 3.79, 3.74 | 3.81 |
| monolith (`main` @ merge-base `7c700ca`, scratch worktree) | 3.97, 4.03, 4.07, 3.84, 4.35 | 4.05 |

The split is not slower — if anything marginally faster here (~6%), within
the noise the builder also reported (their own three-run pairs were
3.34–3.99 s split vs 3.72–3.74 s monolith). Either way, nothing here says
the fast per-change gate got materially more expensive.

## What I relied on rather than re-derived

The label-set diff (1812/1812 identical) and the re-runnability claim
against grown in-flight monoliths (`task/T-035`, `task/T-021`) were each
independently reproduced by the reviewer (`review.md`), including a fresh
`git archive` of `task/T-035` at its current, moved-on state. I did not
re-run those myself a third time — the review's reproduction used a method
(archive a live branch into a scratch dir) I have no reason to doubt and
no more session budget usefully spent re-confirming a number two other
agents already got the same way. Everything in sections 1–5 above is my
own, independent execution.

## Judgment

All five checks the dispatch asked for come back clean, and the two checks
that matter most for this task's actual risk — the gate still catching real
game defects, and the manifest hole staying closed — were proven against
domains and files neither the builder nor the reviewer had already touched,
so this is genuinely new coverage rather than a re-confirmation of their
same evidence. No feel questions: this change alters no game behavior, no
constant, and no pixel.

## PROPOSED INBOX ISSUES

No new issues from this pass. The one gap I'd have flagged —
`.claude/hooks/check-changed.sh` not matching `tools/pathcheck/*.mjs` — is
already disclosed in `build.md` §7 with a proposed I-??? entry; filing a
second one here would just be a duplicate.

## Evidence paths

- `/tmp/t037-defect1.txt`, `/tmp/t037-restore1.txt` — gravity-constant control
- `/tmp/t037-defect2.txt`, `/tmp/t037-restore2.txt` — hex-literal control
- `/tmp/t037-manifest-hole.txt`, `/tmp/t037-manifest-restore.txt` — manifest guard
- `/tmp/t037-smoke-midroute/report.json`, `/tmp/t037-smoke-transform/report.json`
- `/tmp/t037-time-split-{1..5}.txt`, `/tmp/t037-time-mono-{1..5}.txt` — timing runs
- `/tmp/t037-serve.log` — pinned server log (port 8791)

These are session-scratch, not committed evidence — copy into
`reports/tasks/T-037/` before the worktree is pruned if this needs to
persist past the session.
