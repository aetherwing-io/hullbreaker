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
  `node`/`python3 -m http.server`; dev deps live only under `tools/*/`.
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

## Kill switches

- `touch HALT` — flywheel releases and `merge-task.sh` refuses to merge.
- `rm .claude/flywheel.on` — flywheel disarms; session behaves normally.
- Marking tasks `operator`/`blocked` releases the flywheel legitimately when
  everything open is waiting on a human.
