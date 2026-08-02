# HULLBREAKER — agent-team orchestration playbook

How the wave-4 orchestration scaffold fits together, and the kickoff prompt
for the integrator session. Subordinate to `CLAUDE.md` (rules + loop
protocol), `FLEET-PLAN.md` (mission + verdict history), and `decisions.md`
(operator law). Prepared 2026-07-31.

## The pieces

| Piece | Where | Role |
| --- | --- | --- |
| Task queue | `SPRINT.md` | Prioritized tasks + Inbox + operator checkpoint queue |
| Agent roster | `.claude/agents/` | gameplay-engineer, lattice-designer, playtester, adversarial, reviewer |
| Flywheel | `.claude/hooks/sprint-flywheel.sh` (Stop hook) | Blocks the integrator from idling while SPRINT has todo/doing/review tasks. **Opt-in**: armed only while `.claude/flywheel.on` exists; `touch HALT` is the kill switch |
| Fast check | `.claude/hooks/check-changed.sh` (PostToolUse, async) | Runs `tools/pathcheck.mjs` after any `src/` edit, in the checkout that owns the file |
| Merge gate | `tools/orch/merge-task.sh` | The only path to `main`: reviewer APPROVE + playtester PASS + pathcheck (worktree) + deterministic smoke vs the pinned worktree + post-merge pathcheck (auto-revert on failure) + STATUS line |
| Gate artifacts | `reports/tasks/<id>/{review.md,playtest.md}` | First line `APPROVE`/`REQUEST_CHANGES`, `PASS`/`FAIL` |
| Playtest harness | `tools/playtest/` (pre-existing) | Bot-player evidence; smoke = `mid-route.json` + `transform-slice.json`, `--deterministic` |
| Headless gate | `tools/pathcheck.mjs` (pre-existing) | 600+ assertions + static layer-purity guards |

## Mapping from the generic scaffold (why some pieces are absent)

This repo predates and outclasses parts of the drop-in scaffold this was
adapted from:

- **No pnpm/TypeScript/build step** — a documented invariant. All commands are
  `node` (including the dev server, `node tools/serve.mjs`); dev deps live only
  under `tools/*/`.
- **No `levels/*.level.json`** — level design is authored fixture + generator
  data in `src/pure/` (hence `lattice-designer`, not `level-designer`).
- **Asset pipeline / `asset-artist`** — deferred at first scaffold, then
  opened by `decisions.md` entry 8: agents may use the **codex CLI**
  (`codex exec`, vector/procedural-first) for sprites/assets. Staging in
  `assets/generated/` + `assets/manifest.json`; `assets/approved/` is
  operator-promoted; the game must always boot with assets missing.
  `docs/concept-art/` remains reference ground truth, never staging.
- **Playtest harness contract** — already exists (`?testapi=1` / `window.HB`
  + `tools/playtest/`), richer than the scaffold's sketch (closed-loop
  policies, deterministic injection, pinned-worktree capture). Nothing to
  build; agents read its README and its honesty section.
- **Sim/render separation + seeded RNG** — enforced by module boundaries and
  pathcheck's static guards, not by convention.

## Operator checkpoints vs machine gates

Machine gates (review/playtest/pathcheck/smoke) decide whether work is
*sound*. Only the operator decides whether it is *fun*. Tasks whose
acceptance is a feel question end in status `operator` with an entry in
SPRINT's checkpoint queue — exact URL, what changed, 3–5 questions drawn
from DESIGN's playtest list. The loop never idles waiting for a verdict.

## Merge authority

Merges are **autonomous** (`decisions.md` entry 8): the integrator runs
`merge-task.sh` without per-merge operator confirmation. The authority is
the gate stack — reviewer APPROVE, playtester PASS, pathcheck in the
worktree, deterministic smoke against the pinned worktree, post-merge
pathcheck with auto-revert. If a gate proves porous, fix the gate, don't
reinstate ceremony. Feel remains operator-only via the checkpoint queue.

## Models

Build lanes (gameplay-engineer, lattice-designer, adversarial, asset-artist)
run Opus; gate lanes (reviewer, playtester) run Sonnet — per
`.claude/agents/*` frontmatter, matching FLEET-PLAN's wave-2 precedent. The
flywheel hook is a shell script: zero model cost.

## Concurrency and hygiene

- Cap: 3 build worktrees in flight (`git worktree add .claude/worktrees/<id>
  -b task/<id>`), disjoint lanes only.
- Smoke stays under ~60s total; screenshots at checkpoints, not per-frame.
- Batch playtest runs go against a pinned worktree (`--base-url`), never the
  live main checkout — merges landing mid-batch invalidate captures.
- Prune worktrees after merge (`merge-task.sh` prints the command).
- Stale pre-existing worktrees from earlier waves (e.g. under
  `/private/tmp/hullbreaker-*`) are the operator's to remove, not agents'.

## Kickoff prompt (paste into the integrator session)

```
You are the integrator/producer for HULLBREAKER. Read CLAUDE.md fully, then
SPRINT.md, then docs/decisions.md entries 2-7 (the live operator verdicts).
docs/FLEET-PLAN.md is the mission background.

Arm the flywheel: touch .claude/flywheel.on

Run CLAUDE.md's loop protocol continuously: pull up to 3 independent todo
tasks, one worktree per task (git worktree add .claude/worktrees/<id> -b
task/<id>), dispatch the matching .claude/agents/ subagent in the background
with the task block verbatim and the worktree path, and monitor. On
completion gate it: reviewer then playtester write
reports/tasks/<id>/{review.md,playtest.md}; both green ->
tools/orch/merge-task.sh <id>, mark done, prune the worktree, pull the next
task. Triage the SPRINT Inbox into prioritized tasks each cycle. Merges are
autonomous (decisions.md entry 8); the gate stack is the authority.

The mission is SPRINT.md's Delivery target: a playable, polished full run.
Refine as necessary and loop until delivered.

Interrupt me only for: feel checkpoints (post URL + questions to the
checkpoint queue and keep working), pillar conflicts, destructive
operations, or a task that has failed twice. Otherwise keep working until
SPRINT.md has no open tasks or HALT exists.

Start with a triage pass: sanity-check the sprint ordering against
decisions.md, flag anything under-specified as one question batch for me,
then dispatch the first wave.
```

## Merge playbook (hard-won — every item here cost a real cycle)

Read this before resolving any conflict. Each entry is a mistake that was
actually made in the 2026-08-01 delivery push, not a hypothetical.

**Order of operations.** Commit gate artifacts (`reports/tasks/**`) and any
concurrent SPRINT Inbox writes BEFORE running the gate — it refuses on a dirty
tree. Gate agents file issues into `SPRINT.md` while you are merging, so expect
to commit-and-retry once.

**Conflicts: compose both sides, then check which side is stale.** Almost every
conflict this push was two lanes appending different truths to the same place.
Keep both. But one side is often *out of date* — e.g. two README items each
described a different half as "still open" when both halves had landed. Read
what each side claims, not just where it sits.

**`tools/pathcheck.mjs` — never hand-balance braces.** Its assertions embed
regex literals containing `\{` and `\}`, which defeats brace counting, and its
section banners contain runs of `=` that a naive `^=======$`-less regex will
match as a conflict separator. Both bit. The reliable resolution is structural:
take main's file whole and splice the lane's self-contained section into it
(`git show main:tools/pathcheck.mjs` vs `git show HEAD:tools/pathcheck.mjs`),
lifting from its banner comment to its closing brace and carrying any imports
that section needs. Verify by parse, not by counting.

**Verify ES modules as ES modules.** `node --check file.js` parses as CommonJS
and will happily pass a broken ES module — a missing `}` in `src/main.js`
survived it and only the browser caught it. Always:
`node --input-type=module --check < file`.

**Prove the server pin with curl before believing a smoke failure.** A server
started from the wrong directory produces exactly the symptom of a boot break
("did not reach a rendered HUD frame"). Fetch a file that exists ONLY in the
tree under test and confirm 200 — then a 404/no-boot means something real.

**Stale server processes squat gate ports** after a worktree is pruned
and cause phantom boot failures on a random port draw. `ps aux | grep -E
'[h]ttp.server|[s]erve.mjs'`, kill the orphans — but never `:8741`, which is
the operator's own dev server from `CLAUDE.md`.

**A blank `#232830` page with ONE console SyntaxError naming a missing export
is a CACHE artifact, not a broken module.** ES-module loading is
all-or-nothing: one failed import kills the whole graph, so the symptom of a
stale cached module is a blank page, not a partial one. On 2026-08-02 Chrome
had heuristically cached a pre-T-022 `src/sim/pace.js` (1275 bytes, no
`momentumScrollSpeed` export) and ran it against post-T-022 `src/sim/level.js`,
which imports that symbol — on a tree where pathcheck was 1674/0 and the
selftest 29/29 after a hard reload. **First diagnostic, before editing
anything:** in the page's console compare
`fetch(url).then(r => r.text()).then(t => t.length)` against
`fetch(url, {cache: 'reload'}).then(r => r.text()).then(t => t.length)` for the
module the error names. Different byte counts = the cache, and the tree is
innocent; identical = a real break, go read the module. (In the incident: 1275
vs 5727.) `python3 -m http.server` sends no `Cache-Control` at all, which is
what allows this; the fix is to serve with `node tools/serve.mjs` (T-024,
`no-store` on every response, no validators, conditional requests ignored), and
to pin gate worktrees with `node <main-checkout>/tools/serve.mjs <port> --root
<worktree>` — the main checkout's copy, so worktrees branched before T-024
work too. `tools/orch/merge-task.sh` still pins with `python3 -m http.server`
for exactly that back-compatibility reason; its Playwright runs get a fresh
cold profile every time, so it is not exposed.

**The palette collision class.** Any lane that forked before
`src/render/palette.js` landed may read `CONFIG.palette` or carry raw hex in a
tokenized render file; pathcheck now rejects both. Repoint to `PAL`, use
`PAL.glowOff`/`PAL.hitFlash` for the identity literals, and give any new sim
`ENEMY` kind a body token in BOTH tables (classic = CONFIG passthrough,
concept = its own value in the right hue family). EXTEND the guard lists to
cover new tokens; never relax them. If a lane's own assertion required the old
read, UPDATE it with the reasoning inline — same invariant, the table moved.

**Do not inherit measured numbers.** A speed figure taken from one lane's
report was applied to a location where its precondition did not hold, and it
propagated into two task briefs and a decision before a gate re-measured it in
a browser and disproved it. Any claim about physics must state the conditions
it holds under and be measured on the tree under test.

**A lane's own fix cycle is not a stall.** Fix agents read for 20+ minutes
before writing. Do not infer death from quiet; infer it from the whole fleet
going silent (see the monitor below).

**Before re-dispatching a lane, PROVE the previous dispatch is dead.** A
retarget mid-flight is normal (operator verdicts land during builds), but a
`TaskStop` that returns "No task found" means you used the wrong id, NOT that
the lane is stopped — and re-dispatching on that assumption puts two writers in
one worktree, which will corrupt the branch. Find the live one before
launching: list the workflow's agents and read what each is
(`head -c 3000 agent-*.jsonl | grep -o "BUILD agent for sprint task T-0.."`),
and remember a workflow may carry SEVERAL lanes — stopping it to kill one lane
also kills the others' in-flight fix cycles, so weigh that before you do.
Signals that a lane is genuinely finished: its build result is in
`journal.jsonl`, and a build that returned `blocked` closes its lane (the
pipeline spawns no review or playtest behind it). This happened on 2026-08-01
with T-021 and was caught only because the second builder noticed a commit it
had not authored and messaged the integrator.

**A probe that releases the jump key measures a game nobody plays.**
`CONFIG.jumpCutMult` is 0.45 and `src/sim/player.js` applies it on release, so
a sweep that lets go mid-flight tops out ~0.7 tiles below what a held jump
actually reaches. That single bug produced a confident, well-evidenced,
WRONG conclusion about a mechanic's reachability on 2026-08-01 — it was
retracted only because its author re-checked. Any probe, pathcheck child, or
bot policy asserting what a player can reach must hold the jump through the
whole flight, and should say in its output that it did.

**Resuming an agent by `SendMessage` can REVIVE a workflow lane you thought
was closed.** A build that returns `blocked` normally ends its lane — but if
you resume that build agent to relay findings, its new result feeds the
pipeline, which advances to review and can spawn a fix agent. On 2026-08-01
that put a second writer into a worktree an hour after its lane was believed
dead, twice. Before relaying anything into a workflow agent, decide whether
you want the LANE to continue; if you only want the information to reach a
person or a different lane, put it in the next dispatch's `buildExtra` or in
the repo instead. If you do resume one, re-check for live agents afterwards
rather than assuming the lane stayed closed — and note that `TaskStop` does
not take effect mid-tool-call, so confirm death by watching the transcript go
cold AND the worktree stop changing, not by the tool's success message.

## Watching the fleet (what the integrator's monitor should fire on)

Only two states need the integrator, and a monitor that fires on more than
these trains you to ignore it:

- **MERGEABLE** — review APPROVE *and* playtest PASS, and BOTH verdict files
  newer than the branch head. Freshness matters: verdict files persist across
  fix cycles and budget restarts, so a stale PASS would otherwise merge
  unjudged commits (`merge-task.sh` now refuses these itself).
- **FLEET IDLE** — no workflow agent transcript written for 10+ minutes while
  task branches are still open. That is what budget exhaustion and mass agent
  death actually look like; a single quiet lane is not.

Routine `REQUEST_CHANGES`/`FAIL` should NOT wake the integrator: the pipeline
runs its own fix cycle. Only once that cycle is spent does a rejection need an
integrator-dispatched re-gate scoped strictly to the findings.

## Kill switches

- `touch HALT` — flywheel releases and `merge-task.sh` refuses to merge.
- `rm .claude/flywheel.on` — flywheel disarms; session behaves normally.
- Marking tasks `operator`/`blocked` releases the flywheel legitimately when
  everything open is waiting on a human.
