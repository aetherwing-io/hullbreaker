# HULLBREAKER — next-session handoff

Prepared July 29, 2026. This document is the starting brief for a new working
session. It summarizes decisions already made, current repository state, and the
smallest next implementation milestone. The deeper design and story documents
remain authoritative where this handoff only summarizes them.

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

Another coding agent may be working in the repository. At the start of every
implementation session, inspect `git status`, `git diff`, and recent commits.
Treat unfamiliar changes as someone else's work. Do not overwrite, revert, or
reformat them; coordinate before touching overlapping runtime areas.

## Repository state at handoff

- Branch: `main`
- HEAD when this handoff was written:
  `6f21c76 Address external review: projectile substeps, input hardening,
  self-test`
- Runtime: one self-contained [`index.html`](../index.html), using Three.js
  through a CDN import map.
- Headless verification: [`tools/pathcheck.mjs`](../tools/pathcheck.mjs).
- There is no package/build pipeline to preserve or extend.
- The simulation is 2D in `(s, y)`; a polyline maps it onto 3D hull surfaces for
  rendering and camera motion.

The worktree is intentionally dirty from the design, lore, and concept-art
pass:

```text
 M README.md
 M docs/DESIGN.md
?? docs/HANDOFF.md
?? docs/STORY.md
?? docs/concept-art/
```

Those files are wanted work. Do not discard them. This documentation pass did
not modify runtime code.

Because the worktree can change after this handoff, verify this snapshot rather
than assuming it is still exact.

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
  **Observe → Intercept → Contain → Quarantine → Sterilize → Scuttle**.
- The **Meridian Crown** is the summit command/transmission complex and final
  transforming environment. There is no literal “Immune Heart” boss in the
  current direction.
- Story delivery cannot stop the action. Use transformations, environmental
  changes, terse ship statuses, and very short radio exchanges.
- Flight is optional and must earn its place later; the story and climax cannot
  depend on it.

## What currently works

The shipped grey-box already provides a solid base:

- fast run, variable jump, one air jump, coyote time, jump buffering, and
  drop-through catwalks;
- forced scrolling with left-edge pressure;
- six exterior tower faces with wave gates;
- a roughly 1.1-second two-snap corner ritual and brick-slam reveal;
- seeded ground chunks and stacked one-way catwalks;
- wasp and carrier drones with mock-3D materialization;
- rifle, spread, laser, homing, and flame weapons;
- RAGE, GHOST SQUAD, ORBITAL LANCE, and CHRONO modifiers; and
- pure generation/choreography code extracted and tested by the headless
  harness.

The main weakness is spatial: despite denser tiers, the field still reads as
ground plus floating platforms. It does not yet make traversal a satisfying
combat language.

## Recommended next-session objective

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

## Implementation landmarks

The relevant code is still compact enough to understand directly:

- `CONFIG` near the top of `index.html` holds all tuning.
- `CHUNK_LIB` and `buildLevel` generate ground and horizontal catwalks inside
  the pure block.
- `groundH` and `platforms` are baked and rendered immediately after the pure
  block.
- `updatePlayer` contains movement, solid collision, one-way landing,
  scrolling-edge pressure, and firing.
- `tools/pathcheck.mjs` extracts the pure block and asserts path, generation,
  spawn, and jump invariants.

Implementation constraints:

- Preserve 2D simulation. New walls, ledges, and routes should remain data in
  `(s, y)` even when rendered on the 3D tower.
- Extend the level representation only as far as the slice requires. A small
  authored traversal-chunk shape with declared connectors is preferable to
  hiding a showcase layout inside more random probabilities.
- Keep new deterministic geometry or reachability logic inside
  `/* @pure-begin */` and `/* @pure-end */` when practical so the harness can
  test it.
- Current jump constants are deliberately frozen and asserted by the harness.
  Do not retune the whole controller merely to make an invalid layout reachable.
  If playtesting proves a retune is necessary, change it intentionally and
  update the physical reasoning and assertions together.
- Preserve clean corner aprons, unbuilt-face collision rules, wave gates,
  scrolling constraints, and seeded reproducibility.
- Avoid a new framework, dependency stack, editor, or generalized entity system
  for this slice.

## Definition of done for the slice

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

- Converting all six phases to the new lattice.
- Ten simultaneous lanes or maximum vertical density.
- Snap hook, player traps, hostile traps, or cliff-shimmy systems.
- Bulkhead flip, interior face, breach return, or rendered altitude system.
- Houndframe, polyp, mortar, or other new enemies.
- Full weapon-order and recovery-floor redesign.
- Story scripting, voice work, the Crown finale, flight, menus, or final art.
- A broad generator rewrite before the authored slice proves its grammar.

Resist combining the traversal and transformation milestones. Each should answer
one hard question clearly.

## What follows if the slice is fun

Continue in the order defined in `DESIGN.md`:

1. Build one bulkhead flip inward and one breach return while keeping the same
   2D controls and making altitude gain unmistakable.
2. Add houndframe, polyp, and mortar one at a time, proving each movement answer
   and then one useful combination.
3. Add baseline hit, hurt, launch, pickup, warning, and transformation feedback.
4. Author the full six-phase escalation.
5. Build the Meridian Crown finale.
6. Decide whether flight strengthens the ending.
7. Finish front-end, accessibility, audio, and polish.

## Open questions are not blockers

`DESIGN.md` and `STORY.md` deliberately preserve unresolved decisions: exact
weapon order, recovery floor, hook input, trap form, flight, the *Meridian*'s
original failure, the ground voice, RIG's exact identity, and Earth's reply.

Do not settle these merely to make the documents look complete. The next slice
can proceed without them. Lock answers only when they improve a playable beat,
visual motif, relationship, or ending.

## End-of-session handoff checklist

Before yielding the next implementation session:

- report what changed and why;
- list every verification command and its result;
- identify any manual feel judgment that still needs the user;
- update design documentation only for decisions actually made;
- preserve unrelated and concurrent work;
- leave the worktree status explicit; and
- name the single best next action rather than offering a vague backlog.
