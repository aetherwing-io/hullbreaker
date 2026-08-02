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

**Two lanes can CREATE the same new file independently — check before merging,
not during.** T-040 and T-049 each added `src/render/preload.js` from a
merge-base where it did not exist (`git cat-file -e <merge-base>:<path>` says
so in one command). Composing two independent 171- and 338-line
implementations of a shared boot gate at conflict-resolution time is how a
cycle dies. Resolve it as an *ordering* question instead, and answer it by
asking **what each lane's assertions are actually about**:

    git merge-base task/A task/B                      # does the file exist there?
    grep -n '^export' <each worktree>/<path>          # same API surface?
    grep -rn '<path>' <lane>/tools/pathcheck/<lane>.mjs   # what does it assert?

For preload.js the answer was clean: every T-040 assertion was about the
*consumer* (`player.js` imports `preloadTexture`/`awaitPreloads` from
`./preload.js`), none about the gate's internals, and both versions export the
same four names. So T-049's later, fixed 338-line gate satisfies T-040
wholesale — merge T-049 first, then T-040 keeps its own `player.js` and takes
the already-landed gate untouched. **No hand-composition, no cycle.** Had
T-040's assertions pinned the gate's internals, the answer would have been the
opposite and worth knowing before the merge, not during.

**Merging main into a lane imports main's committed gate artifacts — and they
can masquerade as fresh verdicts.** On 2026-08-02 the integrator merged main
into `task/T-051` to pick up T-053's assets, then read
`reports/tasks/T-051/review.md` in that worktree and nearly acted on a
REQUEST_CHANGES that was judging the *pre-merge* tree. The artifact had come in
with the merge; git set its mtime at checkout, seconds before the merge commit.

The usual freshness test — verdict mtime newer than branch HEAD — **cannot see
this**, because a merge writes the file and then commits. Two tells that caught
it, and either alone is enough:

  - **Read the numbers, not the verdict.** The review cited `depth: -13` (the
    lane had moved to -16/-21/-26), `0.48% partial alpha` (the landed plates
    are 13.75%+), and pathcheck `2748 -> 3024` (the tree was at 3148). A verdict
    that describes a tree you do not recognise is not about your tree.
  - **Compare the artifact against DISPATCH time, not HEAD time.** A verdict you
    asked for cannot predate the request. `stat -f %m <verdict>` against the
    moment you spawned the gate agent is the test that actually holds.

This is the same class as "gate artifacts go stale the moment the branch moves"
— check the tree, not the verdict — but it fails in the opposite direction: the
artifact looks *newer* than it is rather than older.

**Never prune a worktree without checking whether something is reading it.**
On 2026-08-02 the integrator ran `git worktree remove <wt> --force` as routine
post-merge cleanup and destroyed a 16-round measurement another lane was
running against that tree; it died at n=7 with "no such file or directory."
`--force` is precisely the flag that converts git's refusal into a deletion.
Before any remove:

    find .claude/worktrees/<id> -type f -newermt '-10 minutes' \
      -not -path '*/.git/*' | head

If that prints anything, wait or ask. Drop `--force` unless it comes back
empty — the refusal it suppresses is the whole safety mechanism.

**And run long measurements against a scratch COPY, not a live worktree.**
`git archive <ref> | tar -x -C <scratchdir>` is what T-049's own I-039 control
trees used, which is why that lane could tell a real result from a tree
changing underneath it. A measurement reading a tree another agent can edit or
delete is not measuring what it thinks it is. Related: hash the file under
test before each run in a repeated experiment — T-049 caught a phantom FAIL
that way, when a hash moved between runs with no edit of its own.

**Standing rule: when two lanes both need a shared piece of infrastructure,
branch the consumers off the PRODUCER's branch, not off main.** T-051 and
T-052 were branched off `task/T-049` for exactly this reason and cost nothing.
The merge order then falls out of the branch graph instead of being
reconstructed from memory under conflict pressure.

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

**The SILENT half of that same class: a stale page that boots fine.** The entry
above is about a stale module that BLANKS the page. The worse case is a stale
module that runs: on 2026-08-02 a page executing a pre-T-045 `src/pure/limb.js`
booted, played, and rendered a complete frame with T-045's entire scale pass
missing, and the session that found it filed an S1 code defect (I-037) against a
tree where `node tools/pathcheck.mjs` was 2404/0 and the feature was demonstrably
live. Two mechanisms produce it and they are indistinguishable from a console:
the browser is running cached bytes, OR the server is rooted on another tree
(this repo leaves pinned worktrees under `/private/tmp/hb-pin-*`; one of them is
`cd37b91`, before the scale pass existed). **First move when a shipped feature
"renders nothing", before reading any source:**

```sh
node tools/playtest/verify-served.mjs <origin> [--tree <worktree>] [--profile <dir>]
```

It asks the running page for `window.HB.g1.pieces` — the length of the limb bake
plan it actually baked — compares it against the plan the tree bakes from the
real generated level, and separates the two mechanisms by byte count, naming the
commit the served copy matches. Note what the T-050 measurements settled: a
plain fresh navigation does NOT clear a poisoned entry (the document itself came
from cache too, so **nothing shipped inside the page can detect this**), and
switching that origin to `no-store` `tools/serve.mjs` afterwards does not
dislodge an entry an earlier python session already stored. Only a hard reload
or a cold profile does.

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

## Operating tempo (2026-08-02 — pace without losing the gates)

The operator's note: *"iterate on the /loop and improve the pace, without
sacrificing the final quality."* Measured drags from the 2026-08-02 session,
and what replaced them. None of these weaken a gate; they remove integrator
overhead and mis-sized ceremony.

**1. Dispatch briefs are now short.** `docs/LANE-BRIEF.md` carries every
standing rule — fences, ports, hard rules, evidence standard, three-dot diff,
issue filing. Dispatch prompts carry only the task block plus what is genuinely
task-specific. Eight consecutive hand-written briefs restated the same fences
and one of them still got a fact wrong (it claimed a branch had edited
`SPRINT.md` when the hunks were branch drift), which cost a reviewer round-trip.

**2. Review and playtest run CONCURRENTLY, not sequentially.** The protocol's
"then" was read as an ordering requirement; the judgments are independent. The
occasional wasted playtest on a `REQUEST_CHANGES` costs far less than serializing
every task. Exception: re-gating after a fix cycle stays sequential, because the
playtest must judge the fixed code.

**3. Gate depth is sized to risk, not applied uniformly.**
  - *Runtime / look / lattice* — full gates. Review + full playtest with
    browser evidence. Nothing here changes.
  - *Harness / tooling* — review + playtest, but the playtest targets the
    tool's own claims and the smoke suite, not gameplay feel.
  - *Docs-only* — review + a LIGHT gate: pathcheck green, any edited live
    script still parses and runs, cited numbers resolve to artifacts. No
    browser work, no screenshots — they prove nothing about prose. Use
    `merge-task.sh --skip-smoke`, which exists for exactly this and had never
    been used.

**4. Model tiering.** Builders default to Sonnet; gates (reviewer, playtester)
stay on the strongest model. Keep a strong model on the BUILDER when the
acceptance test is subtle — e.g. T-035's "this assertion must be
arithmetically impossible on current main," where a weaker model tends to
produce a plausible-but-hollow gate. Building to a written spec is mechanical;
adversarial verification is not.

**5. Gate agents compute their own pathcheck base.** Worktrees drift as lanes
merge, so the correct base differed across concurrent lanes (1674 / 1691 /
1704 / 1724 in one afternoon). Telling an agent the expected number invites it
to inherit a wrong one. Have it run pathcheck at `git merge-base main HEAD`
instead.

**6. Issue numbers are assigned by the integrator, never by agents.** Three
agents were told "start at I-036" and two collided. Agents now propose issues
as `I-???` under a `## PROPOSED INBOX ISSUES` heading; the integrator numbers
them on triage.

**7. Queue selection is the biggest lever, and it is not a mechanical one.**
The 2026-08-02 batch merged six tasks of harness/docs debt — all correct, all
invisible to the player — while the stated goal was getting a playable build to
a 9-year-old. Throughput was never the problem; direction was. Before filling a
queue, ask what the *operator* would see change.

**Still serialized, by hard rule:** merges. One runtime change at a time,
through `tools/orch/merge-task.sh`, from the main checkout. That is the real
ceiling on lane count, and it is deliberate.

**Gate artifacts go stale the moment the branch moves — check the tree, not the
verdict.** On 2026-08-02 the integrator's own readiness loop reported `T-044`
READY because `review.md`/`playtest.md` on `main` both read green. They had been
copied there *before* an integrator merge brought the branch onto the pathcheck
module tree, and the branch was actually **red (2497 passed, 2 failed)** — a
cross-lane collision (`T-039` had hard-coded a platform count that `T-044`'s
terrain legitimately changed) plus one of the lane's own assertions failing
against current `main`.

`tools/orch/merge-task.sh` catches this: it requires both verdicts to be NEWER
than the branch head, which is exactly why that rule exists. Ad-hoc readiness
polling does not. So:

  * treat a green verdict pair as **necessary, not sufficient**;
  * before merging, run `node tools/pathcheck.mjs` **in the worktree** and read
    the count yourself;
  * after any integrator merge or migration commit on a lane, its prior
    verdicts are void — re-gate rather than reusing them.

The general shape, which has now bitten three times in one session (a stale
cached module, a stale pinned worktree, a stale verdict): **an artifact that was
true when it was written is not evidence about the tree in front of you.**
