# Level 1 timestep reachability — T-060

Date: 2026-08-04
Runtime change: none

## Finding

The measured apex difference does **not** close Level 1 at the 60 Hz target.
The same terrain-only closed-loop policy clears all 17 ground-gap runs at both
8.333 ms (120 Hz) and 16.667 ms (60 Hz), with all three lives and no falls.

At 33.333 ms (30 Hz), the route does close for this policy. RIG passes 10 of
17 ground-gap runs, then plants at `(330.649, 8.5)` with zero velocity while
the pursuing scroll stops at the next gate (`335` of `415`). This is a real
reachability difference, not just a lower apex. It does not demonstrate that
no human can recover at 30 Hz; it demonstrates that a line which is stable at
120/60 Hz is no longer stable at 30 Hz.

The policy used committed lip jumps, air jumps when a falling approach still
needed height, and wall launches when contact occurred. It does not claim to
be expert play or a combat proof: hostiles are removed immediately so gates
open, and pocket reward collection is reported rather than optimized. The
17-gap count is derived from every contiguous empty run in the shipped
`groundH`; both successful rates passed all 17. Authored pocket capsules were
live through the real pickup path (4 collected at 120 Hz, 3 at 60 Hz, 1 before
the 30 Hz stall).

## Reproduce

```sh
node tools/movement/timestep-reachability.mjs
node tools/pathcheck.mjs
```

The sweep deliberately exits non-zero while the 30 Hz closure exists. Its
JSON includes final pose, gaps passed, falls, movement-verb counts, and the
three fixed steps.

## Options considered

1. **Fixed-step accumulator plus render interpolation.** This gives every sim
   system one integration rate and is the cleanest long-term model. It also
   changes the ownership of the frame loop, input dispatch relative to ticks,
   hit-stop scheduling, and every trace fingerprint. `?fixeddt` would need a
   new definition (fixed simulation ticks per rendered frame), and existing
   deterministic/pathcheck baselines would need deliberate migration.

2. **Substep only the player integrator.** Splitting a 33 ms player update into
   two 16.5 ms steps is smaller, but player collision, coyote time, ledge/wall
   launch, damage-plane fallback and jump-buffer consumption would run at a
   different cadence from hostiles and scroll. It would change the meaning of
   the frozen jump constants and still require new reachability and combat
   gates.

3. **Accept and document the current 60 Hz floor.** The shipped target is 60
   fps, and no target closes between the developer's 120 Hz display and that
   target. The 30 Hz closure should remain visible as a failing investigation
   rather than being hidden by an apex-only assertion.

## Recommendation

Accept and document for this pass; make 30 Hz recovery its own gameplay task
if target-laptop measurement shows sustained 30 Hz operation. That task should
prefer a whole-sim fixed-step accumulator over player-only substepping, then
retune/gate movement intentionally. The performance work in T-058/T-059/T-061
reduces the chance of reaching the 30 Hz failure regime without silently
changing movement today.
