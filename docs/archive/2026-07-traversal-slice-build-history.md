# Archived: traversal-slice build history

Moved from `docs/HANDOFF.md` on 2026-07-30 as part of the operator's "archive
out-of-date docs" policy. This is the original build brief, first-playtest
narrative, definition-of-done checklist, and milestone scope fence for the
traversal slice, written while it was being built and tuned. The slice has
since been built, played, accelerated (`15f66d2`), judged at checkpoint CP1
(no single pace winner; see [`../decisions.md`](../decisions.md) entry 2),
and the fleet has moved on to wave 3. Everything below is preserved verbatim
as design rationale and history — it is not current status. For current
status, see `docs/HANDOFF.md`, `docs/decisions.md`, and `docs/FLEET-PLAN.md`.

---

## Prove one traversal vertical slice

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
