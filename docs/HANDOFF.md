# HULLBREAKER — next-session handoff

Prepared July 29, 2026. This document is the starting brief for a new working
session. It summarizes decisions already made, current repository state, and the
smallest next implementation milestone. The deeper design and story documents
remain authoritative where this handoff only summarizes them.

**If you are joining the multi-agent fleet push**, read
[`FLEET-PLAN.md`](FLEET-PLAN.md) first — it governs that work, assigns lanes,
and defines the operator checkpoints (CP1–CP4) that gate it. This handoff
remains the brief for solo sessions and for background FLEET-PLAN doesn't
repeat. As of this writing: **CP1 concluded** with no single pace crowned
winner (the `intensity` agent's hunt/swarm/surge variants all read as
"directionally correct" versus base), and the operator pivoted the mission —
stop diagnosing "boring," start building the movement verbs the concept art
promises (tether/hook launches, chained launches, human-scale RIG). The fleet
is now in **wave 3**: movement-verb prototypes (snap hook/tether first), a
view-scale experiment, plus continuing CP2 (houndframe) and CP3
(transformation) work. See [`decisions.md`](decisions.md) entry 2 for the
full pivot and `FLEET-PLAN.md` for the live lane assignments.

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

A fleet of roughly ten agents may be working in the repository at once, each
in an isolated git worktree, with an integrator session merging to `main` one
runtime change at a time (see `FLEET-PLAN.md`'s integration protocol). At the
start of every implementation session, inspect `git status`, `git diff`, and
recent commits regardless. Treat unfamiliar changes as someone else's
already-reviewed work. Do not overwrite, revert, or reformat them; coordinate
through the integrator before touching overlapping runtime areas.

## Repository state at handoff

- Branch: `main`
- HEAD when this handoff was last updated:
  `738a890 Merge CP3 transformation slice: bulkhead flip, breach return,
  rendered altitude`
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
  on the shipped game.
- Two read-only debug channels exist for tooling: `?testapi=1` (the playtest
  harness's canonical telemetry channel) and `window.HB` (always present, a
  superset for console/harness use) — see README's "Debug handles" section.
- There is still no package/build pipeline for the game itself to preserve or
  extend (`tools/playtest/` has its own, scoped to that directory).
- The simulation is 2D in `(s, y)`; a polyline maps it onto 3D hull surfaces for
  rendering and camera motion. This is unchanged by the module split.

A roughly ten-agent fleet is currently iterating on mechanics and pacing in
parallel, isolated worktrees, with an integrator session merging to `main`;
see [`FLEET-PLAN.md`](FLEET-PLAN.md) for the roster, lanes, and checkpoint
schedule. Verify branch/HEAD/worktree state yourself rather than assuming
this snapshot is still exact — it changes quickly during the fleet push.

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
  breach return, and rendered altitude gain, merged for checkpoint CP3 (see
  below — the operator has already judged the first pass and asked for a
  render rework, not full approval);
- houndframe (`94913ad`), a floor-denial enemy in the traversal slice with
  trial stages and per-pace fairness assertions, merged for checkpoint CP2
  and awaiting the operator's judgment;
- the runtime split into 35 ES modules under `src/` (see README's
  Architecture section), with a `?testapi=1`/`window.HB` telemetry surface
  the split added specifically to support tooling; and
- a bot-player playtest harness (`tools/playtest/`) that plays scripted input
  in a real browser and reports pacing/fairness metrics.

The operator's verdict on the traversal slice's first pass was **boring — the
spatial grammar is right, the intensity is far off** (see `FLEET-PLAN.md`'s
diagnosis: soft pursuit pressure, uncontested routes, and no stakes
differential between routes). `15f66d2` was the first response to that
verdict, and the `intensity` agent's hunt/swarm/surge variants were the
second — at checkpoint CP1 all three read as "directionally correct" and none
was crowned. Rather than keep tuning pace in isolation, the operator pivoted
the mission toward building the movement verbs the concept art promises (see
`decisions.md` entry 2) — that pivot, not the old "ground plus floating
platforms" framing or a still-pending CP1, is the live state of the gap.

## Traversal slice

**Status: built, tuned, and judged — the fleet has moved on to wave 3.** The
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
session's next step — see `FLEET-PLAN.md`'s wave roster and checkpoints (CP2
houndframe, CP3 bulkhead flip + altitude, CP4 scored run + setback
prototype). CP1 concluded without a single winner and pivoted the mission
into **wave 3**: movement-verb prototypes (snap hook/tether, then
generalizing `surge`'s chained-launch momentum) and a view-scale experiment
(smaller RIG relative to the world), running alongside the continuing CP2
work and CP3's second pass below — see [`decisions.md`](decisions.md)
entries 2 and 3. The order below, from `DESIGN.md`'s Development sequence,
remains the target convergence point once those variants are judged:

1. Build one bulkhead flip inward and one breach return while keeping the same
   2D controls and making altitude gain unmistakable. **Merged** (`738a890`,
   `?slice=transform`) and judged at CP3: directionally right, but the
   operator called the transition choreography choppy and ruled that the
   creature's anatomy must read as static and monumental, revealed by camera
   movement rather than assembled — see `decisions.md` entry 3. A second pass
   applying that rule is expected before CP3 is considered met.
2. Add houndframe, polyp, and mortar one at a time, proving each movement answer
   and then one useful combination. **Houndframe merged** (`94913ad`, floor-
   denial enemy with trial stages and per-pace fairness assertions),
   awaiting the operator's CP2 judgment; polyp and mortar not yet started.
3. Add baseline hit, hurt, launch, pickup, warning, and transformation feedback.
   (Deferred — `FLEET-PLAN.md` keeps juice/audio out of scope for this push.)
4. Author the full six-phase escalation.
5. Build the Meridian Crown finale.
6. Decide whether flight strengthens the ending.
7. Finish front-end, accessibility, audio, and polish.

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
