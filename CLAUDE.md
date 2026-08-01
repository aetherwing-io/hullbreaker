# HULLBREAKER

Contra-style 2.5D run-and-gun: RIG, a human-scale salvage marine, climbs the
exterior skin and interior cavities of the *Meridian* — a continent-sized
machine-creature — while the simulation stays strictly 2D in `(s, y)` and a
polyline maps it onto 3D anatomy for rendering only.

Design pillars (full text in `docs/DESIGN.md`):
**1. Momentum is sacred. 2. Combat happens through movement. 3. Pressure and
power rise together. 4. Every break changes the game. 5. Chaos stays readable.**
Every change must serve a pillar. If a task conflicts with one, stop and
escalate to the operator instead of resolving it yourself.

## Source of truth (read order for a new agent)

1. `docs/HANDOFF.md` — current state + working relationship.
2. `docs/DESIGN.md` — target experience first, implementation record second.
3. `docs/FLEET-PLAN.md` — fleet doctrine and recorded operator verdicts.
4. `docs/decisions.md` — the operator decision log. **Verdicts are law.**
   Never re-litigate an entry; propose a new decision instead.
5. `docs/concept-art/README.md` + boards — visual ground truth. Boards
   10/11/13/14 lead environment form and camera, board 06 leads enemy form.
   Compare against these and the "Visual invariants" list, not your taste.
6. `docs/STORY.md` — narrative canon.
7. `SPRINT.md` — the live task queue (schema at the bottom of that file).

## Commands

- Serve: `python3 -m http.server 8741` → `http://127.0.0.1:8741/index.html`
  (no build step; three.js comes from the CDN import map).
- Headless gate: `node tools/pathcheck.mjs` — 600+ assertions plus static
  layer-purity guards. Must exit 0. This is the fast per-change check.
- Browser smoke: open `index.html?selftest=1` (SELFTEST PASS/FAIL in title).
- Bot playtest: `cd tools/playtest && node run.mjs scripts/<s>.json
  --deterministic` (see `tools/playtest/README.md`; `npm install` once, in
  that directory only). Use `--base-url` against a pinned worktree for
  anything longer than one run.
- Merge gate: `tools/orch/merge-task.sh <task-id>` — **the only path to
  `main`**. Run it from the main checkout only.

## Hard rules

- **Layer purity:** `src/pure/` and `src/sim/` never reference THREE,
  `document`, or `window`, and never import upward — statically guarded by
  pathcheck. Sim↔render crossings go through `src/sim/bridge.js` hooks.
- **Determinism:** randomness only via seeded `src/pure/rng.js`. No
  `Math.random`, `Date.now`, or `performance.now` in `src/pure/` or
  `src/sim/`. The simulation stays 2D `(s, y)`; collision, physics, aiming,
  and spawning never leave it.
- **No build step, no runtime dependencies.** Dev-only deps are allowed under
  `tools/*/` with their own `package.json`, never for the game itself.
- **Jump/movement constants in `CONFIG` are frozen and asserted.** A retune
  must be intentional: update the physical reasoning and the pathcheck
  assertions together, never silently.
- **Prototypes ship behind query flags, off by default.** `?hook=1` is
  judged-and-rejected: keep it inert, invest nothing further in it.
- **Static-anatomy render rule** (`decisions.md` entry 3): the creature's
  anatomy is monumental and static during turns/transitions — RIG and the
  camera move; the next stretch pre-exists and is *revealed*, never
  assembled. Only doors, access plates, vent covers, shutters, traps, and
  Crown mechanisms may move. Zip-assembly choreography is reserved for
  things the ship *builds* (traps, emplacements, later enemies).
- **Never commit or push to `main` directly.** Builders work in isolated git
  worktrees on `task/<id>` branches; only the integrator merges, one runtime
  change at a time, via `tools/orch/merge-task.sh`.
- **Lane discipline:** work only inside your assigned worktree and task
  scope. Treat unfamiliar concurrent changes as someone else's reviewed
  work; coordinate through the integrator instead of touching them.
- **Machine gates never judge fun.** Bots and metrics are evidence; the
  operator is the only fun oracle. Anything needing a feel verdict goes to
  SPRINT's "Operator checkpoint queue" with an exact URL and 3–5 questions.
- **This is not an OSTK repository.** Do not initialize, boot, or introduce
  OSTK files or workflow.

## Definitions of done

- **Mechanic/feature:** pathcheck green *including new assertions for any new
  pure logic*; the smoke playtest scripts still complete; unjudged behavior
  is behind a query flag; the report lists open feel questions for the
  operator and never self-declares the work "fun".
- **Lattice/fixture change:** reachability, retreat-timing, and route
  invariants asserted in pathcheck; a named playtest script exercises the
  change; screenshots judged against boards 13/14 and the concept-art
  visual invariants (readable silhouettes, connected-hull surfaces, RIG at
  3–5% of screen height).
- **Harness/tooling:** zero effect on the shipped game; the tool's own README
  updated, including an honesty/limitations note for anything approximate.
- **Docs:** record only decisions actually made; keep HANDOFF/README/DESIGN
  truthful when behavior or entry points change.

## Loop protocol (integrator session)

1. Read `SPRINT.md`. Pick up to 3 independent `todo` tasks (lowest ID first
   unless priority says otherwise).
2. Per task: create a worktree (`git worktree add .claude/worktrees/<id> -b
   task/<id>`, or dispatch the Agent tool with worktree isolation), send the
   matching subagent the task block **verbatim** plus the worktree path, in
   the background. Mark the task `doing`.
3. On completion: run `reviewer` on the diff, then `playtester` on that
   worktree. Verdicts land in `reports/tasks/<id>/review.md` (first line
   `APPROVE` or `REQUEST_CHANGES`) and `reports/tasks/<id>/playtest.md`
   (first line `PASS` or `FAIL`).
4. Both green → `tools/orch/merge-task.sh <id>` → mark `done` (the script
   appends the STATUS line), prune the worktree.
5. Playtester/adversarial findings go to SPRINT's Inbox as issues; triage
   them into prioritized tasks each cycle.
6. Tasks whose acceptance needs a feel verdict: set status `operator`, add a
   checkpoint-queue entry (URL + questions), and keep pulling other work —
   never idle waiting on the operator.
7. Escalate to the operator **only** for: feel checkpoints, pillar
   conflicts, destructive operations, or a task that has failed twice (mark
   it `blocked` with a note).

The Stop-hook flywheel re-prompts this session while `.claude/flywheel.on`
exists and SPRINT has `todo`/`doing`/`review` tasks. Kill switches:
`touch HALT` at repo root, or `rm .claude/flywheel.on`.
