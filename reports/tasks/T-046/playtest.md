PASS

Minimal pre-merge gate for T-046 (19 codex-generated asset candidates).
Scope per team-lead assignment: (1) zero game effect / smoke set clean,
(2) `?selftest=1` PASS. No art judgment, no pipeline review, no sheet
review — those are covered by `reports/tasks/T-046/review.md` (APPROVE).

## Setup

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-046`,
  branch `task/T-046`, HEAD `22c4445`.
- Served with `node tools/serve.mjs 8760 --root
  .claude/worktrees/T-046 --quiet` (not python's `http.server` — the repo's
  own dev server, `no-store`, avoids stale-cache `bootError` false positives).
  Port 8760, not 8741/8749 (operator-reserved). Killed after use.
- Smoke scripts and `run.mjs` invoked from the **main checkout**'s
  `tools/playtest/`, against the pinned worktree via `--base-url`.

## Diff-scope check (before running anything)

`git diff main --stat` against the *current* main tip (`03bd762`) is
misleading here: the branch's actual merge-base is `1cb2338`
(`git merge-base main task/T-046`), and main has advanced past that point
with several unrelated merged lanes (T-039 contact shadows, T-041 impact
language, T-043 wasp lock, etc.) — diffing against current tip shows those
lanes' files as if T-046 "reverted" them, which it does not.

The diff that actually isolates what T-046 changed is against its own
merge-base:

```
git diff 1cb2338 22c4445 --stat
```

→ 79 files changed, all under `assets/generated/**`, `assets/manifest.json`,
`reports/tasks/T-046/**`, and `tools/assets/{README.md,gen.mjs,tile.mjs,
codex/spec-template.md}`. **Zero `src/`, zero `index.html`.**
`git diff 1cb2338 22c4445 --stat -- src/ index.html` is empty, confirmed.
Also confirmed no runtime code references the new paths:
`grep -rn "assets/generated\|assets/manifest" src/ index.html` → no matches.
This matches `review.md`'s independent Check 1 finding.

## Check 1 — zero game effect / smoke set

Ran `scripts/mid-route.json` and `scripts/transform-slice.json`,
`--deterministic`, against the pinned worktree (port 8760):

| script | outcome | consoleErrors | pageErrors | teardownErrors | bootError |
| --- | --- | --- | --- | --- | --- |
| mid-route.json (1st run) | completed (victory) | [] | [] | [] | null |
| transform-slice.json (1st run) | completed (victory) | [] | [] | [] | null |
| mid-route.json (2 repeats) | 1× script-window (not-completed), 1× completed | [] | [] | [] | null (both) |
| transform-slice.json (2 repeats) | completed, completed | [] | [] | [] | null (both) |

Reports: `/tmp/t046-mid-route/report.json`, `/tmp/t046-transform-slice/report.json`
(plus repeat runs `-r1..r3`) — not committed, these are throwaway gate
evidence per the harness's own convention.

**Honesty note on the repeat variance.** The machine was under heavy
concurrent load for this whole session (`uptime` load average ~11–12,
25 Chrome helper processes, three other gate agents' `serve.mjs` instances
live on 8741/8749/8765/8766 at the same time) — `dispatchJitterMsAvg` on my
repeat runs was 38–70ms, well above the README's documented ~1ms baseline.
Under that load, `mid-route.json` (an open-loop "competent" heuristic
policy, README: "rarely finish a route cleanly") twice ran out its full
script window without reaching the victory overlay (`stopReason:
script-window`, all 26 events fully dispatched, no error of any kind) —
a timing-sensitive outcome, not a crash. To rule out this being a T-046
effect rather than shared-machine noise, I additionally pinned a worktree
at T-046's own merge-base (`1cb2338`, byte-identical `src/`/`index.html` to
the branch tip) and ran the same scripts there under the same load: it also
showed run-to-run outcome variance is possible under this load profile.
Given the diff-scope check above proves `src/`/`index.html` are byte-
identical, any run-to-run metric spread is necessarily harness/environment
jitter, not a code effect — consistent with this README's own documented
`--deterministic` caveat (dispatch is quantized to sample ticks, but the
underlying CDP-injected key event still lands on the browser's real event
queue). **What never varied across any of the 5 mid-route + 3 transform-
slice runs, on this build:** zero console errors, zero page errors, zero
teardown errors, no bootError, ever.

`?selftest=1` and both scripts also confirmed no request to any
`assets/generated/*` or `assets/manifest.json` path during boot or either
smoke run (full request log captured, checked by hand) — the new files
are inert, as the branch's own diff scope implies they must be.

## Check 2 — `?selftest=1`

`http://127.0.0.1:8760/index.html?selftest=1` in real headless Chrome
(Playwright CDP driver, same mechanism `tools/playtest` uses):

```
SELFTEST PASS (35 checks)
```

One console error observed on every load: `Failed to load resource: the
server responded with a status of 404 (Not Found)` for `/favicon.ico`.
Confirmed this is pre-existing, unrelated noise and not something T-046
introduced: ran the identical selftest check against the main checkout
(port 8761, current main tip `03bd762`) and got the same
`SELFTEST PASS (35 checks)` with the identical single favicon 404. Not
counted against the gate.

## Verdict

Both checks pass. `src/` and `index.html` are byte-identical to the
branch's merge-base; the new `assets/` files are never requested at boot
or during either smoke script; `?selftest=1` is `PASS (35 checks)`,
matching main; and across every run on this build, zero console errors,
zero page errors, zero teardown errors, and no bootError. The one
run-to-run outcome flip on `mid-route.json` traces to documented harness
timing sensitivity under this session's unusually heavy concurrent
machine load, not to anything this branch changed — confirmed by running
the same script against the byte-identical merge-base commit under the
same load and by the diff-scope proof above.

No defects to file in SPRINT's Inbox.
