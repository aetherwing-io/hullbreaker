# HULLBREAKER — fleet plan (multi-agent mechanics push)

Prepared July 29, 2026 by the integration session, from an operator interview.
This is the working brief for a roughly ten-agent fleet continuing mechanics
and playtesting work. It is subordinate to [`DESIGN.md`](DESIGN.md) (target
experience) and [`STORY.md`](STORY.md) (canon). [`HANDOFF.md`](HANDOFF.md)
remains the brief for solo sessions; this plan governs the fleet push only.

## Mission

The traversal slice proved the spatial grammar and failed the pacing test.
The operator's verdict on the first playable: **boring — the shape is right,
the intensity is far off.** The fleet exists to close that gap:

1. Make the core traversal-combat loop intense enough that the operator
   voluntarily replays it.
2. Prove the next grammar pieces: houndframe floor pressure, and the bulkhead
   flip / breach return with unmistakable altitude gain.
3. Define the game's score and setback identity (see decisions below).
4. Build the machinery that lets agents iterate and *measure* pace: the module
   split and a bot-player playtest harness.

## Operator decisions on record (July 29 interview)

- **Feel verdict:** first slice pass was boring. Machine checks passing is not
  the gate; the operator's replay desire is.
- **No six-face integration yet.** Iterate in fixtures until the operator
  approves the feel. Integrating a boring grammar multiplies it by six.
- **Genre target:** a mashup between authored cinematic ascent and arcade
  score attack — potentially a defining hybrid. A movement-driven score/
  momentum system is the leading concrete expression of this.
- **Death/setback: unresolved, and stock answers are unwanted.** The operator
  explicitly does not want retreads of lives/checkpoints. Seed directions:
  phase fallback (losing sends you down the tower, not to a menu), the
  *Meridian* dynamically repairing or blocking routes as the setback, other
  dynamic world-driven consequences. The fleet proposes; the operator picks.
- **Excitement priority:** bulkhead flip / breach return with visible
  altitude.
- **Juice and audio: deferred** until mechanics are locked. Caveat on record:
  some perceived intensity *is* feedback, so before condemning a mechanic as
  unfun, re-ask the question once baseline feedback exists.
- **Keep three.js.** The sim is renderer-thin pure 2D; the renderer is not
  the bottleneck and instancing covers the projected load.
- **Begin splitting `index.html` into ES modules.** Parallel agent work on
  one 2,550-line file is not viable.
- Roughly ten agents; the operator is the only fun oracle and reviews at the
  checkpoints below.

## Current state (HEAD `15f66d2`)

- Traversal slice at `index.html?slice=traversal` (add `&enemies=0` to tune
  movement without wasps): authored fixture, six named routes, ledge catch,
  wall grab/slide/jump, chimney, dare pocket with measured retreat timing,
  fast retry, slice stats.
- `15f66d2` already responded to the boring verdict: camera follows forward
  motion instead of pinning RIG, stronger/crisper jumps, launch-on-contact,
  grab dwell capped at 240/300ms, minimum scroll 2.6, target pass time cut to
  4–12s. **The operator has not yet judged this accelerated pass** — that is
  checkpoint CP1.
- `tools/pathcheck.mjs`: 178 assertions, green. It regex-extracts the pure
  block; the module split replaces that with real imports.
- No bot-player exists yet. The route-graph checks are analytical only.

## Diagnosis of "boring" (for all agents)

1. **Pursuit clock too soft** — with weak scroll pressure there are no timed
   decisions, just optional geometry.
2. **Uncontested routes** — two wasps across the whole slice; route choice
   only matters when routes carry different threats.
3. **Verbs paused the player** — long grab dwell contradicted "every grab
   wants to become another launch." (Partially addressed in `15f66d2`.)
4. **No stakes differential** — besides the dare pocket, no route is faster,
   safer, or better armed than another.

Intensity comes from pressure, contested space, and route stakes — not from
content volume, and (for now, per operator) not from juice.

## Fleet roster and waves

Integrator (main session): merges, gates, dispatch, operator communication.

### Wave 1 — dispatched immediately

| Agent | Model | Lane |
| --- | --- | --- |
| `splitter` | Opus | Zero-behavior-change split of `index.html` into ES modules; port pathcheck from regex extraction to imports; expose `window.HB` debug handle for the harness. Works in an isolated worktree. |
| `score-designer` | Opus | Proposal doc: movement-driven score/momentum system for the ascent×score-attack mashup, plus 4–6 novel death/setback proposals per the operator's seed directions. New files under `docs/proposals/` only. |
| `harness-engineer` | Sonnet | Bot-player playtest harness under `tools/playtest/` (dev-only deps allowed there): scripted input runs in a real browser, metrics report (idle time, route coverage, closest crush approach, input density), example scripts. New files only. |

### Wave 2 — after the split integrates

| Agent | Model | Lane |
| --- | --- | --- |
| `intensity` | Opus | Continue the pacing overhaul from `15f66d2`: pressure, route stakes, enemy density; ship 2–3 sharply different variants behind query params for CP1. |
| `combat` | Opus | Houndframe alone → houndframe+wasp combination in the slice, per DESIGN's teach-then-combine rule. |
| `transformation` | Opus | Bulkhead flip inward + breach return + rendered altitude gain, as its own fixture/slice. |
| `adversarial` | Opus | Break fun and fairness: degenerate strategies (hold-right-and-ignore-the-lattice), softlocks, unfair crushes, dare-pocket cheese. Findings filed as reproducible bot scripts. |
| `physics-reviewer` | Sonnet | Collision edges, determinism, tunneling, aspect-ratio traps; owns pathcheck growth. |
| `code-reviewer` | Sonnet | Reviews every integration for conventions, perf (instancing, per-frame allocations), and readability. |
| `docs` | Sonnet | Keeps DESIGN/HANDOFF/README truthful as decisions land; maintains the decision and checkpoint log. |

## Integration protocol

- Builders work in **isolated git worktrees**. Only the integrator merges to
  `main`, one runtime change at a time.
- Merge gates: `node tools/pathcheck.mjs` green; browser self-test
  (`?selftest=1`) green; code review for runtime changes; docs updated when
  behavior or entry points change.
- Lanes are disjoint. Do not edit files outside your assignment; request
  integration through the integrator for cross-lane needs.
- Tuning constants stay in config modules. New deterministic layout or
  choreography logic goes in `src/pure/` with harness assertions.
- Seeded determinism and the strict 2D `(s, y)` simulation are non-negotiable.
- **This is not an OSTK repository.** Do not initialize, boot, or introduce
  OSTK files or workflow.
- No new runtime dependencies. Dev-only dependencies are allowed under
  `tools/` with their own `package.json`.

## Operator checkpoints (the only points that block on the operator)

- **CP1 — pace.** Play the accelerated slice and the intensity variants;
  pick or direct a blend. Also confirms the module split changed nothing.
- **CP2 — houndframe** in the slice: does floor pressure make the verbs
  matter?
- **CP3 — bulkhead flip + altitude:** does the climb feel real?
- **CP4 — scored run + setback prototype:** does the mashup identity land?

At each checkpoint the integrator posts the exact URLs to play and three-to-
five questions drawn from DESIGN's playtest list.

## Out of scope for this push

Juice/audio, six-face lattice integration, snap hook, traps, the Crown
finale, flight, menus, final art, and any canon-locking of open story
questions.

## Agent reporting format

Every completion report includes: what changed and why; every verification
command and its result; open feel questions for the operator; exact worktree
path and branch; and the single best next action.
