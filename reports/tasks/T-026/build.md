# T-026 — build report

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-026`, branch
`task/T-026`. Harness-only: **zero shipped-game files changed**
(`git status --porcelain -- src index.html` → 0 lines).

## What changed, and why

### 1. The asset gate's import scan (I-014)

`checkGameIndependence` matched one line-anchored regex, so a specifier pushed
below the `import` keyword was invisible: the gate exited **0** and filed the
hard dependency under "runtime references".

- **New** `tools/assets/lib/imports.mjs` — a statement-level scan. One lexer
  pass produces two offset-preserving masks (comments blanked; comments +
  string/template/regex contents blanked), then each `import`/`export` keyword
  found in real code is followed through the import grammar: only a clause may
  appear (identifiers, `*`, `as`, `,`, `{`, `}`, comments, whitespace), the
  specifier is the first string literal, and — except for a side-effect
  `import 'x'` — the word before it must be `from`. The first character that
  cannot belong to a clause ends the scan.
  That is what keeps the README's counter-example legal: a newline-crossing
  regex runs from an `import` to the next unrelated `'assets/…'` literal, this
  cannot, because the statement ends at its own terminator. `export … from` is
  now caught too — a re-export binds the module exactly as hard.
- `check.mjs` reports the statement's whole line span (so a multi-line import is
  not also listed as a runtime reference — I-002's rule, extended), and the
  runtime-reference listing now reads the comment-masked source. That removed
  two false entries: `src/render/legibility.js:8` and `:11` are prose in a block
  comment, and the repo check previously printed them as runtime asset
  references. The shipped tree now reports "no reference to `assets/` at all",
  which is the truth.

### 2. The fair-gap probe's honesty guard (I-024)

`runSingle > floorSingle` compares takeoff **windows** and cannot see a probe
that keeps the scroll-speed start and loses the screen clamp.

- The probe's `floor`/`run` boolean became a mode (`{speed, clamp}`), so
  "started at scroll speed" and "pinned to the screen clamp" are separable —
  that separation is what the control needs.
- A **speed meter** now runs on every attempt: the max mean ground speed
  (tiles/s) measured from that attempt's own first frame.
  Two nearby quantities were tried and rejected, with reasons in the code:
  `vx` is wrong (the clamp pins `x` without touching `vx`, so a correctly
  pinned RIG still shows 9.4), and per-frame advance is wrong (a sweep position
  several tiles behind the lip starts inside a step, is ejected by the collision
  resolver, drops behind the plane and legitimately accelerates to runSpeed
  catching up — measured 9.4 on a properly clamped floor sweep). The mean from
  the attempt's start has neither problem: RIG starts exactly at the plane and
  the clamp means he can never get ahead of it.
- Three new assertions (pathcheck 1674 → **1677**): the floor column really ran
  at the floor (`floorAdvance ≤ scrollSpeed + 1e-6`, measured **4.3 exactly** on
  all 17 gaps over ~600k frames); the meter is live (the run column reads 9.4,
  between floor and runSpeed — a stuck meter would make the first assertion
  vacuous); and one **in-gate negative control** — a clamp-removed sweep on gap
  29-31 that must read faster and wider than the floor.

### 3. `tools/gatecheck.mjs` — the committed negative controls

Two fixture trees plus three source mutations of `tools/pathcheck.mjs`, each
requiring the **named** assertion in the mutant's failure list, with a clean
baseline required first. The number of textual replacements is asserted, so a
mutation that stops applying fails loudly instead of passing green (verified —
see below). Fixtures: `tools/assets/fixtures/multiline-import` (must fail) and
`…/runtime-reference` (must pass; it *is* the README's counter-example).

Binding without running gatecheck: the 25 import-scan cases run inside
`check.mjs` on **every** invocation (beside the palette ones), and the
clamp-removed control sweep runs inside pathcheck on every invocation.

## Verification — every command and its result

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **1677 passed, 0 failed** (was 1674/0), 3.4 s |
| `node tools/assets/check.mjs` | PASS, exit 0 |
| `node tools/assets/check.mjs --selftest` | PASS — 23 palette + **25 import-scan** cases (12 must-reject, 13 must-allow) |
| `node tools/assets/check.mjs --root tools/assets/fixtures/multiline-import` | **exit 1**, 2 problems, both "static import/re-export of …" |
| `node tools/assets/check.mjs --root tools/assets/fixtures/runtime-reference` | exit 0, 3 runtime references listed |
| `node tools/gatecheck.mjs` | **PASS**, exit 0, 5/5 controls behaved, 12.9 s |
| `node tools/gatecheck.mjs --list` | prints the controls and their rationale |
| `git status --porcelain -- src index.html` | 0 lines — no shipped-game file touched |
| playtest smoke | **not run**: no script is named in T-026's verify line and this worktree has no `tools/playtest/node_modules`. Zero-effect evidence is the empty `src/` diff plus pathcheck's unchanged generator fingerprint `e715cc38`. |

### The negative controls, before and after

**I-014, before:** `git show HEAD:tools/assets/check.mjs` run against the
committed fixture printed
`game references to assets/ (runtime, not imports): 4` — listing
`src/render/glyphs.js:8` and `src/ui/plate.js:6`, the two hard imports — and
`PASS`, **exit 0**.
**After:** exit 1, `2 problems`, both naming the import, `0` runtime references.
The counter-example fixture exits 0 under both.

**I-024, before:** with `if (mode.clamp) E.setEdges(` → `if (false) …`, the
gap-29-31 floor window balloons **0.74 → 4.12** tiles at a mean ground speed of
**9.29** tiles/s, and the pre-existing guard still passes on that gap (4.12 <
the 4.22 run window) — I-024 reproduces exactly.
**After:** that mutation fails `every floor-labelled sweep really ran at the
scroll floor: fastest mean ground speed 9.3321 vs CONFIG.scrollSpeed 4.3`.
With the pin restored: 4.3 exactly, green.

**Mutation-drift control:** a copy of gatecheck with a deliberately stale `from`
string printed `FAIL … mutation did not apply: expected 1 occurrence(s) …,
found 0. re-aim the mutation at the new shape of the code — do not drop the
control`. The controls cannot rot silently into no-ops.

**Regression evidence for the probe refactor:** the probe's JSON output was
dumped from `HEAD`'s pathcheck and from this branch's and compared field by
field — **0 drift** across 17 gaps × the 14 pre-existing fields. The gate
measures exactly what it measured before; only new fields were added.

## Findings I did not expect (stated, not hidden)

1. **The takeoff velocity is not what makes the floor a floor — the clamp is.**
   Forcing the floor sweep to start at `PL.runSpeed` while the clamp holds
   changes **nothing**: all 17 gaps report identical windows, graces and mean
   speeds. So "start the floor sweep at runSpeed" is not a valid negative
   control against the current probe; the shipped control mutates the floor
   column's *mode* instead, which is what T-020's original control did.
2. **The old guard is not quite as blind as I-024 states — but only by
   accident.** A full clamp removal does also trip `runSingle > floorSingle`,
   because face 1's *other* gap, 46-47, saturates (floor window 1.96 → 8.32,
   exactly its own run window). On the gap I-024 named it stays green. A guard
   that catches a defect only when an unrelated second gap happens to saturate
   is not a guard; the new speed assertion fires on the defect itself. Both
   facts are recorded in the code comment beside the assertion.
3. **The import scanner's own first draft had a silent false negative** — it
   lexed the `#!/usr/bin/env node` shebang as code (`/usr/` reads as a regex
   literal), which hid the *first* import of every shebanged file. Caught by
   running the scanner over all 105 `.js`/`.mjs` files in `src/` and `tools/`
   and requiring it to find at least what a naive single-line regex finds: it
   under-counted in 14 files. Fixed, pinned by two selftest cases, and it now
   finds 540 static imports there against the naive regex's 473.

## Open questions for the operator

None of this is a feel question — it is all harness. Two calls are yours or the
integrator's, not mine:

1. `tools/gatecheck.mjs` is not wired into any automatic gate (it costs ~13 s
   because it runs pathcheck three times). Should `tools/orch/merge-task.sh`
   run it, or does it stay a manual check after touching gate logic? I did not
   edit the merge script — out of lane.
2. `CLAUDE.md`'s Commands section lists the gates and does not mention
   `gatecheck.mjs`. I left `CLAUDE.md` untouched deliberately; adding a line is
   the integrator's call.

## Single best next action

Wire `node tools/gatecheck.mjs` into whatever runs *before* a gate's own logic
is edited — or accept that it is manual and say so in `CLAUDE.md`. The controls
only protect the gates if somebody runs them; everything else about this task is
already self-binding (the 25 import cases and the in-probe clamp control run on
every invocation of their gate).
