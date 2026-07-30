# HULLBREAKER — next-session handoff

Prepared July 29, 2026. This document is the starting brief for a new working
session. It summarizes decisions already made, current repository state, and the
smallest next implementation milestone. The deeper design and story documents
remain authoritative where this handoff only summarizes them.

**If you are joining the multi-agent fleet push**, read
[`FLEET-PLAN.md`](FLEET-PLAN.md) first — it governs that work, assigns lanes,
and defines the operator checkpoints (CP1–CP4) that gate it. This handoff
remains the brief for solo sessions and for background FLEET-PLAN doesn't
repeat. As of this writing the fleet's live milestone is **CP1**: judging the
accelerated traversal-slice pacing pass (`15f66d2`) plus the `intensity`
agent's further variants against the operator's "boring" verdict on the first
pass.

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
  `5e9dbc8 Merge module split: index.html -> 35 ES modules (splitter)`
- Runtime: [`index.html`](../index.html) is now only a thin shell (CSS, HUD
  markup, the three.js import map, and one module script tag); the game
  itself is 35 ES modules under [`src/`](../src/). See
  [`../README.md`](../README.md)'s Architecture section for the layer
  breakdown (`config.js` → `pure/` → `sim/` → `render/`+`ui/` → `main.js`)
  and `src/sim/bridge.js` for the sim/render boundary.
- Headless verification: [`tools/pathcheck.mjs`](../tools/pathcheck.mjs), now
  importing `src/config.js` and `src/pure/*` directly (178 assertions)
  instead of regex-extracting a pure block from a single file.
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
- the runtime split into 35 ES modules under `src/` (see README's
  Architecture section), with a `?testapi=1`/`window.HB` telemetry surface
  the split added specifically to support tooling; and
- a bot-player playtest harness (`tools/playtest/`) that plays scripted input
  in a real browser and reports pacing/fairness metrics.

The operator's verdict on the traversal slice's first pass was **boring — the
spatial grammar is right, the intensity is far off** (see `FLEET-PLAN.md`'s
diagnosis: soft pursuit pressure, uncontested routes, and no stakes
differential between routes). `15f66d2` is the first response to that
verdict; the fleet's `intensity` agent is producing further variants for the
operator's CP1 judgment. Treat FLEET-PLAN's diagnosis, not the old "ground
plus floating platforms" framing, as the live description of the gap.

## Traversal slice: built, and now the fleet's pacing target

**Status: this objective is complete.** The slice described below was built,
played by the operator, and — per the verdict recorded in `FLEET-PLAN.md` —
proved the spatial grammar and failed the pacing test ("boring"). `15f66d2`
accelerated it once already; the fleet's live question (checkpoint CP1) is
whether that acceleration, plus the `intensity` agent's further variants,
fixes the verdict. The subsections below are kept as the design rationale for
the slice's shape — still worth reading before touching it — not as a to-do
list. For the current milestone and how to help, read `FLEET-PLAN.md`.

### Prove one traversal vertical slice

Build one short, deterministic section—roughly 30–45 seconds of play—that proves
the new movement and route grammar before changing the whole game.

Prefer an opt-in entry point such as `?slice=traversal` so the fixture is fast to
replay and the normal six-face run remains unchanged until the idea is proven.
A fixed early face is acceptable if a separate entry point would add more
machinery than value. Do not rewrite all six faces or generalize a large
procedural system first.

The slice should contain:

1. **A connected five-to-six-route lattice.** Across the whole section, use
   floors, vertical walls, staggered ledges, an overhang or short chimney, and
   route reconnections. Show only about three immediate choices at once.
2. **Forgiving ledge catch.** A near miss catches automatically. Jump should
   immediately mantle or launch; down should release. It must not become a slow
   hanging mode.
3. **Wall grab, slide, and jump.** Contact should create a brief controllable
   slide and a strong launch opportunity. Avoid stamina, repeated slow climbing,
   or a state that makes stopping safer than moving.
4. **One dare pocket.** Put a clearly visible magenta reward in an optional
   dead end. Show the commitment and retreat route before entry, and leave
   enough scroll margin for a player who acts promptly.
5. **Existing combat pressure.** First tune the route once with enemies disabled
   so collision and movement weaknesses are obvious. Then add one or two wasps
   and the current weapons to make route and launch timing matter. Do not add a
   new enemy to rescue a weak layout.
6. **A clean rejoin.** Alternate routes should return to a common forward path
   so the existing scroll and corner flow can continue.
7. **A fast repeat loop.** If the slice has its own entry point, make retry take
   roughly one second. Lightweight counters for attempts, falls, route choice,
   air-jump use, and closest approach to the damage edge are useful if they do
   not distract from the movement work.

A representative micro-sequence:

1. RIG sees upper, middle, and lower approaches.
2. A wasp contests the obvious jump arc.
3. A wall launch exposes a safer or faster alternate route.
4. The reward pocket tempts RIG below or behind the forward line.
5. The pursuing edge turns the pickup into a readable time wager.
6. The routes reconnect and immediately feed the next launch or existing gate.

The point is not to demonstrate every planned verb. The point is to discover
whether moving through a connected hull while shooting is fun enough to build
the rest of the game around.

## First traversal-slice playtest

The first pass answered the spatial question but failed the pacing question:

- The player voluntarily chose the upper route first and the H dare pocket on
  replay. No route or character-readability failure was reported.
- Ledge and wall contacts worked, but felt somewhat sluggish or sticky.
- The 29-second pass felt slow, jumps felt weak, and the player repeatedly
  reached an invisible forward clamp before the next route choice.
- The pocket compounded the problem: its dead-end wall could create an
  uncommunicated wall state while the slow camera made six tiles feel long.

This supersedes the original 30–45-second timing guess for this fixture. The
active tuning experiment is a short, high-action pass: preserve normal-mode
physics, give the slice stronger and crisper jumps, make held jump launch on
contact, shorten grab dwell, prevent adhesion to the pocket dead end, and make
the camera follow forward motion instead of pinning RIG. Do not scale the
content count until the user approves that revised feel.

The operator has not yet judged this accelerated pass — that is the fleet's
checkpoint CP1 (`FLEET-PLAN.md`).

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
- `tools/pathcheck.mjs` imports `src/config.js` and `src/pure/*` directly (no
  more regex-extracting a pure block) and asserts path, generation, spawn, and
  jump invariants — 178 assertions as of this writing.

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

## Definition of done for the slice

This checklist was already run once for the slice's initial build. The fleet
reapplies the same play-acceptance criteria — and the operator's five
questions below — when judging the accelerated pass at checkpoint CP1.

### Play

- Players voluntarily change route or elevation while firing.
- A player can chain run → jump → ledge catch or wall contact → immediate launch
  without a dead stop.
- At most three-to-five route choices compete for attention at one time.
- Most moments retain at least two viable forward routes.
- Every required landing is visible before takeoff. Missing an ambitious upper
  route should cost time or position but fall back to a valid lower route when
  the topology allows it.
- The dare pocket reads as a conscious risk before commitment and can be escaped
  with a reasonable safety margin.
- Faster or more demanding routes provide a perceptible reward such as extra
  scroll margin, a cleaner firing angle, or the visible capsule.
- A missed catch or route choice produces a recoverable scramble, not an
  unexplained death or unavoidable crush.
- Threats, character silhouette, reward, and safe surfaces remain readable.
- The existing corner/gate cadence still works around the new section.

### Verification

- Extend the headless harness to cover any new pure layout data, required
  movement verbs, mandatory connector reachability, and dare-pocket retreat
  timing.
- Run:

  ```sh
  node tools/pathcheck.mjs
  ```

- Serve the game and verify:

  ```sh
  python3 -m http.server 8741
  ```

  Then play both `index.html` and `index.html?selftest=1`.

- Manually try the slice at more than one viewport width. Confirm that scrolling
  pressure and route visibility do not create an aspect-ratio-specific trap.
- Check the browser console and self-test result.
- Repeat each mandatory route enough to expose intermittent collision or camera
  failures; a 20-run soak through the short fixture is a useful target.
- Give the user a playable build and ask:
  1. Which route did you choose, and why?
  2. Did either grab feel like a pause rather than a launch?
  3. Was the dare-pocket risk readable before entering?
  4. Where did you stop moving or lose the character?
  5. Do you want to replay the slice?

Passing tests is necessary but not sufficient. Do not expand the content count
until the user says the movement slice feels good.

## Deliberately out of scope for this milestone

This was the original single-slice milestone's scope fence. Several of these
items are now being prototyped in parallel by the fleet (marked below) — that
is FLEET-PLAN's decision to widen scope for the coordinated push, not a
reversal of the reasoning that kept them out of one session's slice.

- Converting all six phases to the new lattice.
- Ten simultaneous lanes or maximum vertical density.
- Snap hook, player traps, hostile traps, or cliff-shimmy systems.
- Bulkhead flip, interior face, breach return, or rendered altitude system.
  (Now in progress — fleet `transformation` agent, targeting CP3.)
- Houndframe, polyp, mortar, or other new enemies. (Houndframe now in
  progress — fleet `combat` agent, targeting CP2; polyp and mortar remain
  out of scope.)
- Full weapon-order and recovery-floor redesign. (A first-draft recovery-floor
  proposal now exists — see below — but nothing is implemented or decided.)
- Story scripting, voice work, the Crown finale, flight, menus, or final art.
- A broad generator rewrite before the authored slice proves its grammar.

Resist combining the traversal and transformation milestones. Each should answer
one hard question clearly.

## What follows the slice

This is now happening in parallel across the fleet rather than as a single
session's next step — see `FLEET-PLAN.md`'s wave 2 roster and checkpoints
(CP2 houndframe, CP3 bulkhead flip + altitude, CP4 scored run + setback
prototype). The order below, from `DESIGN.md`'s Development sequence, remains
the target convergence point once those variants are judged:

1. Build one bulkhead flip inward and one breach return while keeping the same
   2D controls and making altitude gain unmistakable. (In progress — fleet
   `transformation` agent, isolated worktree, targeting CP3.)
2. Add houndframe, polyp, and mortar one at a time, proving each movement answer
   and then one useful combination. (Houndframe in progress — fleet `combat`
   agent, targeting CP2; polyp and mortar not yet started.)
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
targeting CP4. Nothing there is decided or implemented yet.

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
