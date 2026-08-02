# T-037 — build report: pathcheck split into per-domain modules

**Worktree:** `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-037`
**Branch:** `task/T-037` (contains a merge of `main` @ `7c700ca`; verified against
`main` @ `a7fcc42`, whose only change since is `docs/decisions.md`)

---

## 1. LABEL-SET DIFF — the number the reviewer checks first

```
$ diff reports/tasks/T-037/labels-main.txt reports/tasks/T-037/labels-split.txt
(no output)
IDENTICAL, 1812 labels
```

**1812 assertions before, 1812 after. Zero label added, zero dropped, zero
reordered, zero flipped.** The captured artifact is the ORDERED list of every
`ok()` call's `PASS|FAIL` status and its full message text — including messages
built from computed values (`…got 4.3`), so a changed *number* would show as a
changed label.

The full run output is byte-identical too:

```
$ diff reports/tasks/T-037/stdout-main.txt reports/tasks/T-037/stdout-split.txt
(no output)
IDENTICAL
```

That covers the "reported, not asserted" notes, which are `console.log` and not
labels: the pocket-capsule note prints identically, in the same position.

Artifacts committed:

| file | what |
| --- | --- |
| `reports/tasks/T-037/labels-main.txt` | 1812 labels captured from `main`'s monolith |
| `reports/tasks/T-037/labels-split.txt` | 1812 labels captured from this tree |
| `reports/tasks/T-037/stdout-main.txt` / `stdout-split.txt` | full stdout+stderr of both runs |
| `reports/tasks/T-037/evidence-negative-controls.txt` | the four break/restore controls |
| `reports/tasks/T-037/evidence-nodetest-isolation.txt` | why this is not a `node:test` suite |
| `reports/tasks/T-037/evidence-reapply-inflight-lanes.txt` | the script re-applied to two in-flight lanes |
| `reports/tasks/T-037/evidence-two-lane-merge.txt` | two lanes merging, before vs after |

**How the capture is fair to both sides.** `tools/pathcheck-labels.mjs`
materialises a tree into a scratch dir (from git for `--rev`, by copy for
`--tree`), applies the SAME textual instrumentation to whichever single file
defines `function ok(cond, msg)`, and runs `node tools/pathcheck.mjs` there. It
refuses to capture if it finds zero or two such definitions rather than
reporting half a run. Absolute paths (the layer guards put them in their
messages) are normalised to `<TREE>`, or every capture would differ from every
other by the mkdtemp suffix. Nothing in the real tree is modified.

The baseline was captured **before** any file was touched, and committed in the
first commit on this branch (`60a7574`).

---

## 2. What changed

| file | role |
| --- | --- |
| `tools/pathcheck.mjs` | 9,505-line monolith → **51-line runner** |
| `tools/pathcheck/manifest.mjs` | explicit ordered domain list (92 lines) |
| `tools/pathcheck/_context.mjs` | the prelude: layer guards, `ok`/`near`/`fingerprint`, counters (135 lines) |
| `tools/pathcheck/*.mjs` | **39 domain modules**, assertions moved verbatim |
| `tools/pathcheck/README.md` | how to add assertions; order rules; honesty notes |
| `tools/pathcheck-split.mjs` | the re-runnable migration script |
| `tools/pathcheck-labels.mjs` | the label capture used for the proof above |
| `tools/gatecheck.mjs` | its three pathcheck mutants re-aimed at the module tree |

Domain sizes run 52 → 1,040 lines; the largest are `view-scale-experiment`
(1040), `pathcheck-suite` (963, the un-bannered head of the old file) and
`g2-neck-access-plate-flip-gate` (677).

**No file under `src/` changed** (`git diff main...HEAD -- src index.html
assets` is empty), so the shipped game is untouched by construction.

### The lane-collision result, measured rather than argued

`evidence-two-lane-merge.txt` — two lanes, real commits, real `git merge`, in a
throwaway clone:

| base | what each lane did | result |
| --- | --- | --- |
| `main` (monolith) | both appended a section | **CONFLICT** in `tools/pathcheck.mjs` |
| `task/T-037` (split) | both added a NEW domain | **CONFLICT**, 1 line, in `manifest.mjs` |
| `task/T-037` (split) | each extended a DIFFERENT existing domain | **clean**, gate green at 1814 |

So the honest claim is not "conflicts are gone": adding a brand-new domain still
appends one line to a shared manifest. What is gone is the 9,500-line conflict
and, more importantly, its failure mode — see next.

### The manifest hole, found and closed

A dropped manifest entry would be the old silent-drop bug in miniature.
Measured on this tree by deleting one domain's two manifest lines:

```
without the completeness guard:  pathcheck: 1705 passed, 0 failed   exit 0
```

**107 assertions gone, gate still green.** The runner now cross-checks
`manifest.mjs` against the directory before running anything:

```
with the guard:  pathcheck: 1 domain module(s) present but not listed in manifest.mjs:
                 t-011-juice-feedback-pass.mjs
                 Their assertions would not run and this gate would still print green.
                 exit 1
```

Resolve a manifest conflict by keeping both sides' lines; if you drop one, the
gate tells you instead of lying.

---

## 3. `node:test` evaluation (per the mid-task amendment)

**Recommendation: do not use `node:test` here. Hand-rolled ordered manifest, in
one process.** The reasoning is a measurement, not a preference.

### The disqualifying finding: per-file isolation changes gate RESULTS

`node --test` isolates by file — each test file is its own process. pathcheck's
sections mutate the sim's module-level singletons and *leave them set*; later
sections in other domains depend on that state without re-establishing it. This
is not hypothetical. Statement-level analysis found four top-level statements
that step the sim, of which two inherit `setEdges`/player state from an earlier,
unrelated statement.

Proof (`evidence-nodetest-isolation.txt`): inject ONLY the fresh-process value
of `src/sim/edges.js`'s `EDGE_L`/`EDGE_R` (`0, 0`, what a new process gets)
before the jump-apex block, and

```
< PASS  discrete single-jump apex at 60Hz matches the documented figure [got 2.6066…, want 2.61]
> FAIL  discrete single-jump apex at 60Hz matches the documented figure [got 0.2233…, want 2.61]
```

— **four assertions flip PASS→FAIL**, because the jump-apex block silently
relies on `setSimEdges(-1000, 1000)` from a block ~50 lines above it. Under
`node:test` those two blocks would be different files, i.e. different processes.
A refactor that changes which assertions pass is exactly what this task forbids.

Fixing it would mean giving every domain a self-sufficient setup — a real change
to what the gate measures, and one that cannot be done mechanically or proved by
a label diff.

### The other four checks the amendment asked for

1. **Shared expensive setup / wall clock.** Measured, `--test` glob form, 16
   cores: 29 trivial files that each import the src graph and rebuild the levels
   cost **0.65 s parallel / 3.76 s serial** in pure overhead, before any real
   assertion runs (the same 29 rebuilds in one process: 0.33 s). Today's whole
   gate is 3.7 s. So the parallel case is roughly a wash and the serial case
   doubles it — this was **not** the deciding factor, and I would not have
   rejected `node:test` on time alone. The split as shipped: 3.3–4.0 s vs the
   monolith's 3.72–3.74 s (three runs each; noise-level).
2. **Output and exit-code contract.** Preserved exactly — the runner carries the
   monolith's own final two statements verbatim, and stdout is byte-identical.
   Under `node:test` it would not be: the count is of `ok()` calls, and many are
   emitted inside loops with computed messages (`'anchor x at segment ' + i`),
   so "1812 passed" has no `node:test` equivalent without rewriting the
   assertions themselves. Consumers enumerated: `tools/orch/merge-task.sh`
   (exit code, lines 96 and 143), `tools/gatecheck.mjs` (exit code + `FAIL `
   line parsing + textual mutation), `.claude/hooks/check-changed.sh` (exit
   code), and every gate agent that quotes "N passed, M failed".
3. **"Reported, not asserted" notes.** Survive — they are `console.log` and the
   stdout diff is empty.
4. **Node floor.** `node --version` here is v25.8.1; `node:test` is stable and
   available. Not a blocker, just not the right tool.

`node:test` would genuinely buy directory discovery, per-test timing and TAP.
The first is what this task actually wants, and it is available without adopting
the runner — at the cost of the isolation that breaks results. So: explicit
manifest, one process, plus the completeness guard so an unlisted file is loud.

---

## 4. Negative controls (`evidence-negative-controls.txt`)

Four assertions from **four different modules**, each broken at its subject (not
at the assertion), in a throwaway mirror of the worktree — nothing in the
worktree was edited, so there is nothing to restore, and `git status --short` is
clean.

| control | broke | domain that guards it | result |
| --- | --- | --- | --- |
| frozen jump constants | `src/config.js` `jumpVel: 14 → 13.5` | `pathcheck/pathcheck-suite.mjs` | exit 1, `1807 passed, 5 failed`, first line `FAIL jump tune frozen` |
| hit-stop policy | `src/pure/juice.js` `return J.killMs → J.hurtMs` | `pathcheck/t-011-juice-feedback-pass.mjs` | exit 1, `1810 passed, 2 failed`, `FAIL T-011: freeze duration comes from CONFIG, per event kind` |
| momentum tier banding | `src/pure/momentum.js` `d >= t → d > t` | `pathcheck/momentum-earned-pace-escalation.mjs` | exit 1, `1811 passed, 1 failed`, `FAIL READOUT: the tier banding covers empty to full` |
| pure-layer purity | added `typeof document` to `src/pure/rng.js` | `pathcheck/_context.mjs` (prelude guard) | exit 1, aborts before the tally: `pathcheck: forbidden pure reference in …/src/pure/rng.js: document` |

A fifth control covers the new hole this refactor could have opened (dropped
manifest line → exit 1, quoted in §2).

And `tools/gatecheck.mjs`, the project's own negative-control tool, is green on
the split tree — its three pathcheck mutants still find their targets and still
make the named assertion fail:

```
$ node tools/gatecheck.mjs
5 controls, every one of them red where it must be, green where it must be.
PASS
```

---

## 5. Re-runnability (the sequencing requirement)

The migration is a script, and it was exercised on trees that are **not** the
one it was written against:

- **`main` moved mid-task** (T-032 landed: 9,230 → 9,505 lines). I merged `main`
  into the branch, hit the exact conflict this task exists to kill
  (`CONFLICT (content) in tools/pathcheck.mjs`), and resolved it by the recipe in
  `tools/pathcheck/README.md`: take main's file whole, re-run the script. Result:
  39 domains, 1812 assertions, labels identical. That is the flow the integrator
  will use for `task/T-035` and `task/T-021`.
- **In-flight lanes** (`evidence-reapply-inflight-lanes.txt`): the script was run
  against each lane's own grown monolith, and each lane's label set was compared
  to its own split:

  | lane | monolith | domains after split | labels |
  | --- | --- | --- | --- |
  | `task/T-035` | 9,214 lines | 37 | **1742 → 1742, identical** |
  | `task/T-021` | 9,984 lines | 38 | **1887 → 1887, identical** |

  (`task/T-032` no longer exists as a branch — it merged during this task.)
- `node tools/pathcheck-split.mjs --check --source-rev main` proves the committed
  tree is byte-for-byte what the script emits: *"every emitted file matches the
  tree, byte for byte"*. Hand-written files in the module tree (the README) are
  preserved and are not treated as drift.

**Suggested merge order:** land T-037 last among the pathcheck-touching lanes,
or land it first and re-run the script on each subsequent lane's monolith. Either
works; the second is one command per lane.

### How the split preserves order, and where the coupling really is

Analysis of the monolith before splitting (tokenizer-based; naive brace counting
is a documented trap here because assertions embed regexes containing braces):

- 275 top-level statements, **35 top-level bindings**, **zero forward
  references** — nothing uses a binding declared later, so straight-line order is
  the whole contract.
- Those 35 bindings are the genuine cross-domain coupling: levels and fixtures
  (`LVL`, `TL`, `TF`, `B`, `gH`), route indexes (`connectorById`, `routeById`),
  and CONFIG aliases (`PL`, `CC`, `GG`, `SP`). The script computes, per domain,
  what it consumes and what later domains read, and emits an explicit
  `const { … } = SHARED;` / `Object.assign(SHARED, { … })` pair. It **fails
  loudly** if it ever meets a mutable binding assigned across domains, or a
  forward reference.
- Genuinely independent domains (no `needs`, no `provides`): `pursuit-model`,
  `cp4-promotion-*`, `score-wiring-*`, `t-003-far-view-legibility`,
  `t-011-juice`, `t-012-audio`, `t-013-game-shell`, `t-018/t-025/t-027` bot-harness,
  `momentum`, `t-029-runtime-truth` and the g1/bend-cull group. Coupled:
  `pathcheck-suite` → `view-scale-experiment` → `world-transitions` →
  `g2-neck-access-plate-flip-gate`, plus `t-014-spore-mortar` and the three
  `t-009-*` lattice domains, which read fixtures the head domain builds.
- Beyond those, the **imported sim singletons** couple domains invisibly (§3).
  `SHARED` makes the data coupling visible; the singleton coupling is preserved
  by running in one process, which is why the manifest is ordered by hand.

---

## 6. Verification commands and results

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | `pathcheck: 1812 passed, 0 failed`, exit 0 |
| `diff …/labels-main.txt …/labels-split.txt` | no output — **1812 identical labels** |
| `diff …/stdout-main.txt …/stdout-split.txt` | no output — identical |
| `node tools/pathcheck-split.mjs --check --source-rev main` | `every emitted file matches the tree, byte for byte` |
| `node tools/gatecheck.mjs` | `5 controls, every one of them red where it must be… PASS` |
| 4 negative controls + manifest control | all red, exits 1; details in §4 |
| `node --input-type=module --check < f` for all 45 gate files | all parse as ES modules |
| `tools/playtest/run.mjs scripts/mid-route.json --deterministic` | `outcome: completed`, deaths 0 |
| `tools/playtest/run.mjs scripts/transform-slice.json --deterministic` | `outcome: completed`, deaths 0 |
| `git diff main...HEAD -- src index.html assets` | empty — the shipped game is untouched |
| `git status --short` | clean |

Playtests ran from the main checkout against `node tools/serve.mjs 8763 --root
<this worktree>` (ports 8741/8742 untouched; server killed afterwards). The pin
was proved before trusting the runs: `GET /tools/pathcheck-split.mjs` → 200, a
file that exists only in this worktree.

Timing, three runs each: split **3.34 / 3.84 / 3.99 s**; monolith from `main` in
a scratch copy **3.72 / 3.73 / 3.74 s**.

---

## 7. Things the operator/integrator should know

**One file outside my stated surface was edited: `tools/gatecheck.mjs`.** It
does not merely shell pathcheck, it *mutates its bytes* and asserts the
replacement count, so the split broke it by construction (0 occurrences found →
loud FAIL). Its own header says the fix is to re-aim the mutation, never to drop
it, so I re-aimed it: it now hunts the mutation across the runner plus every
module, mirrors the whole gate to `tools/.gatecheck-mutant{.mjs,/}` at the same
directory depth so relative imports resolve, and fails loudly if the mirror
cannot be repointed. No other in-flight lane touches that file (checked all five
task branches), so the conflict risk is nil. If you would rather I had reported
instead of edited, revert that hunk and gatecheck goes red until someone does the
same edit.

**One consumer I did NOT touch, and should be updated by whoever owns it:**
`.claude/hooks/check-changed.sh` matches `*/tools/pathcheck.mjs` exactly, so
edits to `tools/pathcheck/*.mjs` no longer trigger the automatic gate run. The
one-line fix is to change that pattern to `*/tools/pathcheck.mjs|*/tools/pathcheck/*.mjs`.
Nothing is broken today — the hook still fires on `src/` edits, which is its main
job — but a lane editing only a domain module loses the fast feedback.

**Docs I could not update (fenced):** `CLAUDE.md` and the top-level `README.md`
both describe `tools/pathcheck.mjs` as the place assertions live. `CLAUDE.md`'s
"Headless gate" bullet and DoD wording still read correctly (the command is
unchanged) but would be clearer pointing at `tools/pathcheck/README.md`.
`docs/ORCHESTRATION.md`'s merge-playbook entry "never hand-balance braces … take
main's file whole and splice the lane's section" is now obsolete advice for this
file: the resolution is "take main's monolith and re-run the script", or after
this lands, "keep both manifest lines".

**No feel questions.** This task changes no game behavior, no constant and no
pixel; there is nothing here for the operator to judge. The only judgement call I
would flag is *taste*, not feel: whether 39 domains is the right granularity.
`pathcheck-suite.mjs` (963 lines) and `view-scale-experiment.mjs` (1040 lines)
are still large enough that two lanes editing the same one could collide. They
can be split further by adding `/* ===== banner ===== */` lines to a monolith
before re-running, or by hand afterwards — I left them whole because splitting
them is a judgement about domain naming, not a mechanical operation, and this
change was already large.

## PROPOSED INBOX ISSUES

```
## I-??? | docs | S3 | repro: grep -n "tools/pathcheck.mjs" .claude/hooks/check-changed.sh | evidence: reports/tasks/T-037/build.md §7
The PostToolUse fast-gate hook matches `*/tools/pathcheck.mjs` literally, so after T-037
an agent editing only `tools/pathcheck/<domain>.mjs` gets no automatic pathcheck run and
loses the blocking feedback the hook exists to provide. One-line fix: add
`|*/tools/pathcheck/*.mjs` to the case pattern. Not urgent — `src/` edits, the hook's main
trigger, still fire — but it quietly weakens the loop for exactly the lanes this refactor
is meant to help.
```
