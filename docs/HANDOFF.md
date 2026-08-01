# HULLBREAKER — next-session handoff

Prepared July 29, 2026. This document is the starting brief for a new working
session. It summarizes decisions already made, current repository state, and the
smallest next implementation milestone. The deeper design and story documents
remain authoritative where this handoff only summarizes them.

**If you are joining the multi-agent fleet push**, read the root
[`CLAUDE.md`](../CLAUDE.md) and [`SPRINT.md`](../SPRINT.md) first — since the
July 31 delivery mandate ([`decisions.md`](decisions.md) entry 8) they govern
the orchestrated **wave-4** push day-to-day; [`FLEET-PLAN.md`](FLEET-PLAN.md)
remains the mission brief and operator-verdict record that push builds on,
and [`ORCHESTRATION.md`](ORCHESTRATION.md) explains how the scaffold fits
together. This handoff remains the brief for solo sessions and for
background the fleet docs don't repeat. As of this writing, **the fleet has
judged every checkpoint at least once** (CP1 pace, CP2 houndframe, CP2.5 the
houndframe follow-up, CP3 the transformation slice's first pass) and is in
**wave 4**: the delivery push. The headline verdicts — full detail in
[`decisions.md`](decisions.md) entries 2–8 — are:

- **CP1:** no pace crowned; the mission pivoted from tuning pace in
  isolation to building the movement verbs the concept art promises.
- **CP2 / CP2.5 (houndframe):** lands well — "enemies feel like they are
  coming for me" — iterate from `?hound=2.5`; crouch (`?crouch=1`) and
  aim-assist (`?aim=assist`) are undecided A/B prototypes for a real 8-way
  aim gap.
- **CP3 (transformation):** directionally right, but transitions must
  render as RIG ascending around **static** creature anatomy, not
  assembling geometry — a second pass is expected.
- **Movement verdict:** snap hook v1 (`?hook=1`) **rejected** — wrong
  anchors/input, not the wrong verb; FLOW (`?flow=1`) is the live candidate,
  still unjudged.
- **View-scale verdict:** FAR is now the *default* camera (`?view=` opts
  into near/mid); projectiles no longer visibly curve around corners
  (shipped default behavior, no flag).
- **Delivery mandate (July 31, entry 8):** the target is a playable version
  of the full run with AAA-studio-level polish; the loop runs until
  delivered. Merges are **autonomous** behind the agent-review + bot-playtest
  + merge-script gates (`tools/orch/merge-task.sh`); an asset lane is open
  (agents may use the codex CLI for sprites/assets, releasing the
  juice/audio/final-art deferral); the entry-0a hold on six-face integration
  is released. The operator remains the only fun oracle — checkpoint packets
  keep queueing, but work no longer blocks on them.

`SPRINT.md` has the live task queue and the operator checkpoint queue (exact
URLs + questions) for whatever's still open.

## Start here

Read these in order:

1. [`HANDOFF.md`](HANDOFF.md) — current state and immediate objective.
2. [`DESIGN.md`](DESIGN.md) — target experience first, shipped implementation
   record second.
3. [`STORY.md`](STORY.md) — narrative canon, the Meridian Crown, and open lore.
4. [`concept-art/README.md`](concept-art/README.md) — visual and spatial
   references; the images are inspiration, not literal blueprints.
5. [`../README.md`](../README.md) — controls, current build, and verification.

## The brief in one paragraph

*HULLBREAKER* is a fast, jumpy 2.5D run-and-gun about climbing the skin and
interior walls of a continent-sized ship while combat remains mechanically 2D.
Each completed phase makes a chunky 3D transformation, carries RIG visibly
higher, adds a movement or combat demand, and provokes a stronger response from
the ship. The player should go from nimble scavenger to overpowered catastrophe
without losing readable movement or route choice:

> **PUMP → PUMP → PUMP → JUMP → JUMP → JUMP → HULLBREAKER.**

## Working relationship

The user is learning game development. Collaborate at that altitude:

- explain why a structural or tuning choice matters to game feel;
- distinguish observations from design opinions;
- expose important constants and tradeoffs instead of silently burying them;
- prefer a playable comparison over a large speculative rewrite; and
- ask the user to judge feel once a focused slice is ready.

This is **not an OSTK repository**. Do not initialize, boot, or introduce OSTK
files or workflow.

A fleet of agents may be working in the repository at once, each in an
isolated git worktree, with an integrator session merging to `main` one
runtime change at a time via `tools/orch/merge-task.sh` — the only path to
`main` (see the root `CLAUDE.md`'s loop protocol). At the
start of every implementation session, inspect `git status`, `git diff`, and
recent commits regardless. Treat unfamiliar changes as someone else's
already-reviewed work. Do not overwrite, revert, or reformat them; coordinate
through the integrator before touching overlapping runtime areas.

## Repository state at handoff

- Branch: `main`
- HEAD when this handoff was last updated:
  `15de009 SPRINT: T-002/T-005 done; merge-task aborts cleanly on conflict`
- Runtime: [`index.html`](../index.html) is now only a thin shell (CSS, HUD
  markup, the three.js import map, and one module script tag); the game
  itself is 35 ES modules under [`src/`](../src/). See
  [`../README.md`](../README.md)'s Architecture section for the layer
  breakdown (`config.js` → `pure/` → `sim/` → `render/`+`ui/` → `main.js`)
  and `src/sim/bridge.js` for the sim/render boundary.
- Headless verification: [`tools/pathcheck.mjs`](../tools/pathcheck.mjs), now
  importing `src/config.js` and `src/pure/*` directly instead of
  regex-extracting a pure block from a single file — run it for the current
  assertion count rather than trusting a number in prose; it has grown
  substantially past its 178-at-the-split baseline as CP1/CP3 work landed.
- A second, independent verification surface now exists:
  [`tools/playtest/`](../tools/playtest/), a dev-only Playwright bot-player
  harness with its own `package.json` that plays the game in a real browser
  from scripted input and reports pacing/fairness metrics. It has no effect
  on the shipped game. Its route metrics import the game's own
  `TRAVERSAL_FIXTURE` directly from `src/pure/traversal.js` (T-005) rather
  than a hand-copied snapshot.
- A third, headless surface: [`tools/simlab/`](../tools/simlab/) steps the
  real, unmodified sim in Node with synchronous frame-scoped input. Built by
  the T-002 divergence investigation, whose finding
  ([`playtests/2026-07-t2-frame-alignment.md`](playtests/2026-07-t2-frame-alignment.md))
  proved the sim bit-deterministic once input lands on defined frames and
  located the residual bot-run nondeterminism in browser input *delivery* —
  the game-side synchronous input hook (playtest README hook request #5) is
  the endorsed fix, not yet built.
- The wave-4 orchestration scaffold is in place: the root
  [`CLAUDE.md`](../CLAUDE.md) (hard rules + the integrator loop protocol),
  [`SPRINT.md`](../SPRINT.md) (task queue, checkpoint queue, inbox),
  `.claude/agents/` (the agent roster, including the new `asset-artist`),
  the Stop-hook flywheel, and `tools/orch/merge-task.sh` — the only path to
  `main`. See [`ORCHESTRATION.md`](ORCHESTRATION.md).
- Two read-only debug channels exist for tooling: `?testapi=1` (the playtest
  harness's canonical telemetry channel) and `window.HB` (always present, a
  superset for console/harness use) — see README's "Debug handles" section.
- There is still no package/build pipeline for the game itself to preserve or
  extend (`tools/playtest/` has its own, scoped to that directory).
- The simulation is 2D in `(s, y)`; a polyline maps it onto 3D hull surfaces for
  rendering and camera motion. This is unchanged by the module split.

An orchestrated agent fleet is iterating in parallel, isolated worktrees,
with an integrator session merging to `main` autonomously behind the
review/playtest/merge-script gates (`decisions.md` entry 8); the roster
lives in `.claude/agents/` and the live queue in
[`SPRINT.md`](../SPRINT.md). Verify branch/HEAD/worktree state yourself
rather than assuming this snapshot is still exact — it changes quickly
during the delivery push.

## Established creative decisions

- The climb is an upward crescendo, not six repetitions of the same flat field.
- “Many lanes” means a connected **traversal lattice** spanning as many as ten
  possible elevations across a later phase. It does not mean ten evenly spaced
  horizontal platforms.
- Only three-to-five immediate routes should need to be read at once.
- The hull must feel connected: floors, walls, ledges, overhangs, shafts, doors,
  hook points, and reward pockets—not arbitrary floating rectangles.
- Every grab wants to become another launch. Ledge catches and wall interactions
  should preserve speed rather than introduce slow climbing.
- Dead ends are telegraphed **dare pockets** with visible rewards and fair retreat
  timing under the pursuing screen edge.
- Continuous helix rotation was rejected. World turns should be discrete,
  chunky events: hull ratchets, bulkhead flips inward, and breach returns.
- The ship defending itself is the escalation fiction. Its states are
  **Observe → Intercept → Contain → Quarantine → Sterilize → Scuttle** — read
  together, that ladder is the *Meridian*'s immune system escalating against
  a detected infection (see `decisions.md` entry 1).
- The **Meridian** is literally a colossal machine-creature (July 30 canon
  decision — see [`decisions.md`](decisions.md)); its anatomy is the
  traversal lattice. The **Meridian Crown** remains the summit
  command/transmission complex and final transforming environment: not a body
  part, and not a literal creature-boss fought directly.
- Story delivery cannot stop the action. Use transformations, environmental
  changes, terse ship statuses, and very short radio exchanges.
- Flight is optional and must earn its place later; the story and climax cannot
  depend on it.

## What currently works

The shipped grey-box provides a solid base, and the traversal slice work
below has since addressed the "reads as ground plus floating platforms"
weakness that used to be the main gap here:

- fast run, variable jump, one air jump, coyote time, jump buffering, and
  drop-through catwalks;
- forced scrolling with left-edge pressure;
- six exterior tower faces with wave gates;
- a roughly 1.1-second two-snap corner ritual and brick-slam reveal;
- seeded ground chunks and stacked one-way catwalks;
- wasp and carrier drones with mock-3D materialization;
- rifle, spread, laser, homing, and flame weapons;
- RAGE, GHOST SQUAD, ORBITAL LANCE, and CHRONO modifiers;
- pure generation/choreography code extracted and tested by the headless
  harness;
- an opt-in authored traversal lattice (`?slice=traversal`) with six
  connected routes, forgiving ledge catches, wall grab/slide/jump, one
  telegraphed dare pocket, camera-follow, and a fast retry loop — accelerated
  once already (`15f66d2`) after its first playtest;
- three CP1 pacing variants (`?pace=hunt|swarm|surge`, default `base`), a
  two-notch CHARGE/THREAT prototype (`?score=1`), and Hull Fallback tier 1
  (`?fallback`, on by default) inside the traversal slice — all prototypes
  for testing, none of them canon;
- an opt-in transformation slice (`?slice=transform`): bulkhead flip inward,
  breach return, and rendered altitude gain, merged and judged at CP3 —
  directionally right, but the operator asked for a render rework so
  transitions read as ascent around static anatomy, not assembly
  (`decisions.md` entry 3);
- houndframe (`94913ad`), a floor-denial enemy with trial stages, merged and
  judged at CP2 ("those feel much better," iterate from `?hound=2.5`); its
  CP2.5 follow-up — ownership placement, roof contest, commit-coil dodge
  cue, plus two undecided A/B prototypes for a real 8-way-aim gap
  (`?crouch=1`, `?aim=assist`) — merged and was judged strongly positive
  ("enemies feel like they are coming for me"; `decisions.md` entries 4
  and 6);
- movement-verb prototypes: snap hook (`?hook=1`) **judged and rejected**
  (wrong anchors/input, not the wrong verb — stays in the tree inert, no
  further investment), FLOW (`?flow=1`, momentum spine) still unjudged, and
  `?autobounce=1` (held jump re-arms the buffer on landing) as a related
  feel option (`decisions.md` entry 5);
- the view-scale experiment (`?view=near|mid|far`): **FAR is now the
  default** camera depth (RIG ≈ 3.7% of screen height, per concept board
  13), and projectiles no longer visibly curve around hex-corners or
  transform bends — both shipped as default behavior, no flag
  (`decisions.md` entry 7);
- the **static-anatomy corner reveal**, promoted from the opt-in G1
  limb-turn experiment to the six-face run's **default** by T-009: the
  corner ritual rendered as a camera orbit around a static faceted limb
  instead of the brick-slam zipper, with the underlying simulation
  byte-for-byte unchanged (`tools/pathcheck.mjs` proves it by comparing
  traces). `?zip=1` still plays the zipper. It is the render-side answer to
  the CP3 static-anatomy ruling and **has still never been operator-judged**
  — an A/B checkpoint is queued;
- the runtime split into 35 ES modules under `src/` (see README's
  Architecture section), with a `?testapi=1`/`window.HB` telemetry surface
  the split added specifically to support tooling; and
- a bot-player playtest harness (`tools/playtest/`), now with a closed-loop
  bot mode and deterministic input injection (harness v2), that plays
  scripted or reactive input in a real browser and reports pacing/fairness
  metrics.

The operator's verdict on the traversal slice's first pass was **boring — the
spatial grammar is right, the intensity is far off** (see `FLEET-PLAN.md`'s
diagnosis: soft pursuit pressure, uncontested routes, and no stakes
differential between routes). `15f66d2` was the first response to that
verdict, and the `intensity` agent's hunt/swarm/surge variants were the
second — at checkpoint CP1 all three read as "directionally correct" and none
was crowned. The operator pivoted the mission toward building the movement
verbs the concept art promises (`decisions.md` entry 2); every checkpoint has
since been judged at least once (see the intro callout above and
`decisions.md` entries 2–8 for the full verdict set) and the fleet is now in
wave 4, the delivery push.

## Traversal slice

**Status: built, tuned, and judged — the fleet has moved on (waves 3–4).** The
slice was built at `?slice=traversal`, played by the operator, and proved the
spatial grammar while failing the pacing test ("boring"). `15f66d2`
accelerated it once; the `intensity` agent's further hunt/swarm/surge pace
variants (`?pace=hunt|swarm|surge`, default `base` = the `15f66d2` values)
were judged at checkpoint CP1 — all three read as "directionally correct,"
none was crowned, and the operator pivoted the mission toward concept-art-
driven movement verbs instead of further pace tuning (wave 3; see
[`decisions.md`](decisions.md) entry 2). Two prototypes from
`docs/proposals/2026-07-score-and-setback.md` also shipped inside the slice
during the CP1 push: a two-notch CHARGE/THREAT meter (`?score=1`,
`src/pure/score.js` + `src/sim/score.js`) and Hull Fallback tier 1
(`?fallback`, on by default, `src/sim/player.js`) — both are prototypes for
testing, not canon decisions (the proposal doc itself is still just a
proposal).

The original build brief, first-playtest narrative, definition-of-done
checklist, and this milestone's original scope fence are archived at
[`archive/2026-07-traversal-slice-build-history.md`](archive/2026-07-traversal-slice-build-history.md)
— still useful design rationale for anyone touching the slice's shape, no
longer current status.

## Implementation landmarks

The runtime is no longer one file. See [`../README.md`](../README.md)'s
Architecture section for the authoritative layer table; the pointers below
are just where to start reading:

- `src/config.js` holds `CONFIG` — all normal-run tuning.
- `src/pure/generator.js` holds `buildLevel`/`buildTraversalLevel` (ground,
  catwalks, and the traversal fixture's authored geometry) and
  `buildSpawnTable`; `src/pure/traversal.js` holds `TRAVERSAL_FIXTURE` and the
  ledge/wall movement-decision helpers.
- `src/sim/player.js` contains movement, solid collision, one-way landing,
  and scrolling-edge pressure; `src/sim/weapons.js` contains firing.
- `src/sim/bridge.js` is the sim's only outward boundary — where the old
  single file touched a mesh or DOM element mid-simulation, the sim now calls
  a named view hook instead, which is what keeps `src/pure/` and `src/sim/`
  three.js/DOM-free and importable in Node.
- `src/pure/transform.js` + `src/render/transform.js` hold the bulkhead-flip/
  breach-return choreography and its rendering, shipped for CP3 at
  `?slice=transform` (see "What currently works" below).
- `src/sim/hook.js` (snap hook, rejected v1 — inert, kept extractable),
  `src/sim/flow.js` (momentum spine, unjudged), and `src/sim/pace.js` (the
  CP1 pacing variants) are the wave-3 movement-verb modules; `src/render/limb.js`
  is the render-only static-anatomy bake (the default corner reveal since
  T-009), and `src/pure/lattice.js` is the six-face run's route-density,
  pocket and hound-station pass (the pocket's weapon capsule is a free
  pickup — `decisions.md` entry 9).
- `tools/pathcheck.mjs` imports `src/config.js` and `src/pure/*` directly (no
  more regex-extracting a pure block) and asserts path, generation, spawn, and
  jump invariants. The assertion count keeps climbing fast as fleet work
  lands (178 at the module split, hundreds more since) — re-run it rather
  than trusting any number written here.

Implementation constraints:

- Preserve 2D simulation. New walls, ledges, and routes should remain data in
  `(s, y)` even when rendered on the 3D tower.
- Extend the level representation only as far as the slice requires. A small
  authored traversal-chunk shape with declared connectors is preferable to
  hiding a showcase layout inside more random probabilities.
- Keep new deterministic geometry or reachability logic inside `src/pure/`
  (no DOM/three.js references, no cross-layer imports — both statically
  guarded by `tools/pathcheck.mjs`) so the harness can test it.
- Current jump constants are deliberately frozen and asserted by the harness.
  Do not retune the whole controller merely to make an invalid layout reachable.
  If playtesting proves a retune is necessary, change it intentionally and
  update the physical reasoning and assertions together.
- Preserve clean corner aprons, unbuilt-face collision rules, wave gates,
  scrolling constraints, and seeded reproducibility.
- Avoid a new framework, dependency stack, editor, or generalized entity system
  for this slice.

This milestone's original definition-of-done checklist and scope fence are
also preserved verbatim in
[`archive/2026-07-traversal-slice-build-history.md`](archive/2026-07-traversal-slice-build-history.md)
— both are historical (the checklist has been run; the scope fence has been
widened by the fleet, per `FLEET-PLAN.md`) rather than current status.

## What follows the slice

This is now happening in parallel across the fleet rather than as a single
session's next step — the live queue is `SPRINT.md` (wave 4, governed by the
entry-8 delivery mandate); `FLEET-PLAN.md` records the mission and verdicts
behind it (CP2 houndframe, CP3 bulkhead flip + altitude, CP4 scored run +
setback prototype). CP1 concluded without a single winner and pivoted the mission
into **wave 3**: movement-verb prototypes and a view-scale experiment, both
of which now have verdicts (view-scale: FAR default, shipped; movement:
snap hook v1 rejected, FLOW still unjudged), running alongside CP2's
already-positive CP2.5 follow-up and CP3's second pass below — see
[`decisions.md`](decisions.md) entries 2–7 for the full set. The order
below, from `DESIGN.md`'s Development sequence, remains the target
convergence point once the remaining variants are judged:

1. Build one bulkhead flip inward and one breach return while keeping the same
   2D controls and making altitude gain unmistakable. **Merged** (`738a890`,
   `?slice=transform`) and judged at CP3: directionally right, but the
   operator called the transition choreography choppy and ruled that the
   creature's anatomy must read as static and monumental, revealed by camera
   movement rather than assembled — see `decisions.md` entry 3. The limb-turn
   reveal (`e7b2952`, formerly `?g1=1`) is a render-only first answer to that
   rule for the six-face corner ritual specifically; T-009 promoted it to the
   default (with `?zip=1` keeping the zipper playable), but it has still not
   itself been judged. A second CP3 pass applying the rule to the transform
   slice is still expected.
2. Add houndframe, polyp, and mortar one at a time, proving each movement answer
   and then one useful combination. **Houndframe merged and judged at CP2**
   ("those feel much better," iterate from `?hound=2.5`) and its CP2.5
   follow-up (ownership placement, roof contest, crouch/aim-assist
   prototypes, commit coil) merged and judged strongly positive ("enemies
   feel like they are coming for me") — see `decisions.md` entries 4 and 6.
   The Iris Polyp turret v1 ships as the opt-in `?slice=traversal&polyp=1`
   solo teach stage and `?polyp=2` two-enemy combination (beam sightline
   lock on the post-mid lane, iris armour with vent openings, rooted
   placement per entry 6's doctrine), unjudged. The Spore Mortar v1 ships
   the same way — opt-in `?slice=traversal&mortar=1` solo teach and
   `?mortar=2` two-enemy combination (a rooted tripod on post-high
   bombarding the post-mid landing strip: lob → marked zone → readable
   delay → detonation, with the judged hound-rejoin beat patrolling the
   floor below in the combination) — also unjudged.
3. Add baseline hit, hurt, launch, pickup, warning, and transformation feedback.
   (Unlocked — the entry-8 delivery mandate released the juice/audio
   deferral; queued in `SPRINT.md`.)
4. Author the full six-phase escalation. (The entry-0a hold on six-face
   integration is released by entry 8 — integration is queued in
   `SPRINT.md`, with a checkpoint packet to follow rather than blocking on
   one.)
5. Build the Meridian Crown finale.
6. Decide whether flight strengthens the ending.
7. Finish front-end, accessibility, audio, and polish.

Wave 3's movement-verb lane itself: snap hook v1 (`?hook=1`) was built,
judged, and **rejected** — the anchors were too authored and the dedicated
input added confusion, but the tether *concept* wasn't rejected, so a future
marker-less, button-less version remains possible (`decisions.md` entry 5).
FLOW (`?flow=1`, momentum spine) is the movement lane's live, still-unjudged
candidate; `?autobounce=1` is a related held-jump feel option shipped
alongside it.

A parallel track not in `DESIGN.md`'s original sequence: a movement-driven
score/momentum system and six death/setback proposals (replacing lives and
checkpoints) are sketched in
[`docs/proposals/2026-07-score-and-setback.md`](proposals/2026-07-score-and-setback.md),
targeting CP4. Two of its smallest prototypes — the two-notch CHARGE/THREAT
meter and Hull Fallback tier 1 — shipped inside the traversal slice during
the CP1 push (`?score=1`, `?fallback`); see the proposal doc's own status
headers. Nothing there is a decided, canon design yet.

## Open questions are not blockers

`DESIGN.md` and `STORY.md` deliberately preserve unresolved decisions: exact
weapon order, recovery floor, hook input, trap form, flight, the *Meridian*'s
original failure, the ground voice, RIG's exact identity, and Earth's reply.

Do not settle these merely to make the documents look complete. The next slice
can proceed without them. Lock answers only when they improve a playable beat,
visual motif, relationship, or ending.

A first-draft proposal touching the score-attack question and the
recovery-floor/setback question exists at
[`docs/proposals/2026-07-score-and-setback.md`](proposals/2026-07-score-and-setback.md)
— read it before prototyping either, but it is a starting point, not a
resolution.

## End-of-session handoff checklist

Before yielding the next implementation session:

- report what changed and why;
- list every verification command and its result;
- identify any manual feel judgment that still needs the user;
- update design documentation only for decisions actually made;
- preserve unrelated and concurrent work;
- leave the worktree status explicit; and
- name the single best next action rather than offering a vague backlog.
