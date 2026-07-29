# Proposal — movement score, and what happens when you fail

**Status: proposal only. Nothing here is canon.** Prepared July 29, 2026 by the
`score-designer` agent for the fleet push described in
[`FLEET-PLAN.md`](../FLEET-PLAN.md). Every number is a starting point for
playtesting, not a decision. No runtime code was written and no existing file
was modified.

Audience note: this document explains *why* each mechanism should change how the
game feels, and separates what is observably true of the current build from what
is design opinion. Where there is a choice, there is a recommendation — not a
menu.

Two parts:

- **Part A** — a movement-driven score/momentum system for the
  "authored cinematic ascent × arcade score attack" mashup.
- **Part B** — six setback proposals to replace lives-and-checkpoints, per the
  operator's direction that stock answers are unwanted.

The two parts are designed to interlock: Part A produces the currency that
Part B spends, and Part B's answer to the "recovery floor" problem
([`DESIGN.md`](../DESIGN.md), "Combat grammar") comes out of Part A's meter.

---

# Part A — the score system

## A.0 What the mashup actually has to express

The genre target is unusual, so it is worth stating what would count as failure:

- A **pure arcade score** (a number that ticks up in a corner) would sit on top
  of the ascent without touching it. A player who ignores the number plays a
  slightly worse version of the same game, and the "mashup" is a HUD element.
- A **pure cinematic ascent** (no score at all) is what exists today. It is
  already carrying the climb, and the first playtest verdict was *boring* —
  partly a pacing problem, but also because nothing in the game currently
  notices *how* you moved. Play well and play sloppily and the game responds
  identically.

The mashup lands when **the score is the ship's opinion of you**. The *Meridian*
already classifies RIG on a six-step ladder — Observe → Intercept → Contain →
Quarantine → Sterilize → Scuttle ([`STORY.md`](../STORY.md)) — and the story
promise is literally *"the higher RIG climbs, the more the Meridian recognizes
the threat."* That ladder is a grade ladder. It is already authored, already
diegetic, and already tied to escalation.

So the proposal is two named systems, not one:

| System | Kind | What it is | Where the player sees it |
| --- | --- | --- | --- |
| **CHARGE** | Simulation state | A short-horizon momentum meter that makes your weapon hotter while you keep moving and fighting in the air | Three notch glyphs welded to the weapon readout |
| **THREAT** | Display state | The run's accumulating score; its grades are the ship's own classification states | One number, plus a ship line at each classification change |

CHARGE is the mechanic that changes play second to second. THREAT is the arcade
layer that makes a run comparable to the last one. Keeping them separate matters
because CHARGE affects weapons (so it must be deterministic and inside the
simulation, and asserted by the harness) while THREAT affects nothing (so it can
be display-only and cheap).

## A.1 The event set

These are the observable events the score consumes. The naming here is
deliberately shared with the playtest harness — see the instrumentation
appendix (A.5).

| Event | Fires when | Why it belongs |
| --- | --- | --- |
| `airborne_kill` | A hostile dies while `player.grounded === false` | The single most direct expression of "combat happens through movement." One rule, no explanation needed, and the player discovers it by accident within ten seconds. |
| `launch_kill` | A hostile dies within 600 ms of a ledge launch, wall jump, or air jump | Pays for the *specific verbs* the game is trying to teach. Stacks with `airborne_kill`, so the best kill in the game is "wall-kick off a shaft and shoot the wasp on the way out." |
| `link` | A traversal contact converts to a launch that changes elevation by ≥ 2 tiles or crosses a gap | Enforces the design rule "every grab wants to become another launch" *as scoring*, and — critically — only counts when the grab went somewhere. Hanging pays nothing. |
| `reclaim` | Edge margin drops below 2.0 tiles, then returns above 8.0 tiles within 2.5 s | The crush edge becomes an opportunity instead of only a punishment. Rewards diving back for something and rocketing out — not sitting near the edge. |
| `wager` | The dare-pocket reward is collected *and* the player exits the pocket bounds with margin above the fail threshold | Pays for the completed wager, never the pickup alone. A grab you don't escape with scores nothing. |
| `recatch` | A `mode: 'pop'` capsule (the weapon knocked out of you) is recaught before it expires | Turns the existing panic beat into the highest-value routine event in the game. Directly softens the recovery-floor problem. |
| `stall_tick` | Each 100 ms while grounded, `abs(vx) < 2.0`, and not in a traversal state | The only negative signal. It never subtracts from THREAT; it drains CHARGE. |
| `phase_break` | A ratchet/flip/breach completes | Banking beat: the transformation becomes the scorecard (see A.3). |

Justification for the shape of this set: five of the seven events are things the
current build *already does* and does not notice. Nothing here requires a new
verb, a new enemy, or a new input. The set is small enough that a first-time
player can infer all of it without text: *shoot things while off the ground,
keep launching, don't stand still.*

**Candidates deliberately rejected:**

- **Raw airtime / hang time.** Degenerate — jumping in place on flat ground
  would score. `link` captures the intent (airtime that *went somewhere*).
- **Near-miss proximity to the crush edge, scored continuously.** This teaches
  the player to loiter at the left edge, which is slower than running and
  directly contradicts the pursuit design. `reclaim` keeps the thrill of the
  edge and requires you to leave it.
- **Kill combos / hit counters.** Standard, and it would reward standing in a
  good firing position — the exact behavior the pillars forbid.
- **Route variety as a live multiplier.** Real design value, but as a *live*
  signal it is unreadable ("why did my number move?"). Kept as a per-phase
  banking bonus at the break instead, where it can be named in one line.
- **Accuracy / shots-fired efficiency.** `shotsFired` exists, but rewarding
  trigger discipline in a game whose thesis is escalating excess is fighting
  the tone.

## A.2 Three aggregation architectures

### Architecture 1 — decaying style multiplier (the arcade default)

A multiplier (×1 … ×9) rises with events and decays on a timer; standing still
resets it. Score = Σ (event value × multiplier). A letter grade at the end.

- **Teaches a first-timer:** poorly. The multiplier is a number in a corner; the
  player learns it only if they read it, and it changes nothing they can feel.
- **Rewards mastery:** yes, well — this is proven technology (skateboarding and
  character-action games run on it).
- **Cost:** lowest of the three. A counter, a timer, a HUD string.
- **Risk:** it is *inert*. The game plays identically for a player who ignores
  it, which means the mashup exists only in the HUD. It is also the most
  familiar possible answer, and the operator's stated ambition is a defining
  hybrid rather than a competent recombination.

### Architecture 2 — momentum meter that gates weapon power (recommended)

One meter fills from the same events and drains while you are stopped. It has
three notches, and each notch makes your *current* weapon hotter. Score becomes
a derived statistic; the primary feedback is that your gun gets louder while you
move well.

- **Teaches a first-timer:** very well, and without text. Three separate signals
  land in the first thirty seconds: the weapon readout changes, the shots
  visibly change, and the ship announces a new classification. The player forms
  the correct belief — *moving aggressively makes me stronger* — by feeling it.
- **Rewards mastery:** the expert goal is legible and hard: never cool down.
  Holding the top notch across an entire face requires route planning, because
  the floor drains you and the air does not.
- **Cost:** moderate. The meter is simulation state (it changes weapons), so it
  needs deterministic stepping and harness assertions. Per-weapon "hot" traits
  are content.
- **Risk:** a **death spiral** — the player who is struggling is exactly the
  player who is stopped, cooling, and therefore weaker. This has to be fixed
  structurally, not tuned around (see the phase floor in A.3). Secondary risk:
  meter-nagging, where the player feels managed by an accountant.

This architecture is the only one of the three that satisfies **design pillar 3**
("pressure and power rise together") with the score system itself rather than
with drops.

### Architecture 3 — phase grades at the break (the authored-ascent answer)

No live meter, no live multiplier. Each phase is graded at its transformation:
the ratchet/flip/breach *is* the scorecard, stamped with one line ("FACE 2 —
CLEAN LIFT · 3 ROUTES · 2 AIRBORNE KILLS"). The run total is the sum of stamps.

- **Teaches a first-timer:** badly, through no fault of the idea — the feedback
  arrives up to 45 seconds after the behavior it is grading. By then the player
  cannot attribute it.
- **Rewards mastery:** yes, and it fits the cinematic half of the mashup
  beautifully: play is uncluttered, and the punctuation the game already has
  becomes the scoring beat.
- **Cost:** low.
- **Risk:** nothing to chase in the moment. It cannot fix "boring," because
  boring is a second-to-second problem.

### Comparison

| | 1 — Style multiplier | 2 — Meter gates power | 3 — Phase grades |
| --- | --- | --- | --- |
| Changes moment-to-moment play | No | Yes | No |
| Teaches the intended playstyle without text | No | Yes | No |
| Readable for a player ignoring score | Neutral | Yes (power is felt) | Yes |
| Serves pillar 3 (power rises with pressure) | No | Yes | Partly |
| Mastery ceiling | High | High | Medium |
| HUD footprint | 1 element | 1 element | 0 during play |
| Implementation cost | Low | Medium | Low |
| Death-spiral risk | None | **Real — must be designed out** | None |
| Feels like a recombination of known games | Strongly | Less so | Less so |

### Recommendation

**Build Architecture 2 as the spine and use Architecture 3 as its reporting
layer. Do not build Architecture 1 as the primary.**

Concretely: CHARGE is the meter (Architecture 2). THREAT accumulates and is
*banked and named* at each phase break (Architecture 3). The only thing borrowed
from Architecture 1 is that the notch level acts as a multiplier on THREAT gains
— one line of arithmetic, not a second system.

The reason to combine rather than pick: the mashup is not "a score attack with a
story." It is a game where **the arcade layer and the narrative escalation are
the same variable.** The meter makes movement pay in power (the ascent half);
the classification ladder makes the run comparable and nameable (the score-attack
half); the transformations are where the two meet.

## A.3 The recommended design in detail

### CHARGE — the meter

Range 0–100. Notches at **34 (WARM)**, **72 (HOT)**, **100 (BREAKING)**.

Gains (applied on the event, then clamped):

| Event | CHARGE |
| --- | --- |
| `airborne_kill` | +14 |
| `launch_kill` | +10 (stacks: an airborne launch kill is +24) |
| `link` | +6 |
| `reclaim` | +18 |
| `wager` | +25 |
| `recatch` | +20 |
| ground kill | +3 |

Drain:

| Condition | CHARGE per second |
| --- | --- |
| Airborne, in a traversal state, or within 600 ms of a launch | 0 |
| Grounded and running (`abs(vx) ≥ 2`) | −7 |
| Grounded and effectively stopped (`stall_tick`) | −22 |

The asymmetry is the whole design: **the floor cools you and the air does not.**
That is a single rule a player can discover, and it makes the houndframe (the
wave-2 enemy whose job is making floors temporary) an *ally of the score system*
rather than an unrelated threat. It also means the flat-ground-hold-right
strategy the adversarial agent is chartered to break has a built-in cost.

Notch effects — recommended shape, with a deliberate bias toward
movement-shaped power rather than raw damage:

| Notch | Name | Effect |
| --- | --- | --- |
| 1 | WARM | Fire rate × 0.85. |
| 2 | HOT | The current weapon gains its authored hot trait (R: +1 damage · S: 7-way · L: wider bolt, +1 damage · H: 3 darts · F: longer crawl). Per-weapon, so it also serves the "no weapon dominates every topology" acceptance test. |
| 3 | BREAKING | **Launches become weapons.** A ledge launch or wall kick emits a short kinetic shock that kills a wasp on contact. |

The notch-3 effect is the one to prototype first even though it is the last to
fill, because it is the moment a new player understands the game's thesis: at
peak momentum, *moving is shooting*. It is also the cleanest possible expression
of "HULLBREAKER" as a verb.

**The phase floor — the anti-death-spiral rule.** Each phase declares a
`chargeFloor` (suggested: 0, 0, 20, 34, 34, 52 for phases 1–6). CHARGE never
drains below the current phase's floor. From phase 3 onward the player is
therefore never colder than WARM, no matter how badly the last ten seconds went.

This rule is doing double duty: it is also the answer to DESIGN's open
**recovery floor** question. The thing that guarantees late-game power is not
"keep your weapon" or "spawn a rescue carrier" — it is that *the phase you have
reached is itself a power floor*. Progress is the floor. A player who has earned
their way to phase 5 cannot be reduced to phase-1 offense by one mistake, and no
new content is needed to guarantee it.

### THREAT — the score

**THREAT only ever goes up.** Nothing subtracts from it, ever. What failure
costs you is CHARGE (and therefore multiplier, and therefore rate) plus time —
never a visible negative number. This keeps the arcade layer encouraging while
the meter carries the punishment, and it avoids the demoralizing "−500" feel in
a game about refusing to be erased.

`THREAT += base × notchMult`, where `notchMult` = 1.0 / 1.4 / 1.9 / 2.6 for
notches 0–3.

| Event | Base |
| --- | --- |
| `airborne_kill` | 100 |
| `launch_kill` | 60 (stacks) |
| `link` | 25 |
| `reclaim` | 150 |
| `wager` | 250 |
| `recatch` | 200 |
| ground kill | 25 |
| `phase_break` | 500 + 100 × distinct routes used in that phase |

Classification thresholds — **guesses, to be calibrated from bot runs**, sized
for a four-to-five-minute run:

| THREAT | Classification |
| --- | --- |
| 0 | OBSERVE |
| 2,000 | INTERCEPT |
| 5,000 | CONTAIN |
| 9,000 | QUARANTINE |
| 14,000 | STERILIZE |
| 20,000 | SCUTTLE |

Two consequences worth taking seriously:

1. **The run's ending line is a classification, not a rank.** "MERIDIAN
   CLASSIFICATION: CONTAIN" says more than "Rank B" and costs no extra content.
2. **Classification can drive the ship's actual response.** This is the
   strongest version of the idea — score attack where the score is the
   difficulty — and it is also the most dangerous, because it is a positive
   feedback loop. **Recommended clamp: the live classification may never exceed
   the authored phase state by more than one step.** Play brilliantly and the
   ship treats you like the next phase; it cannot skip three. Pair it with the
   rule that the ship's harder behaviors are also its more generous ones
   (carriers and capsules come from escalated states), so provoking the ship is
   a real wager rather than pure self-punishment.

### The wave-gate problem (an observation, not an opinion)

The shipped corner gate *deliberately stops the scroll* until the face is clear.
A score system built on "never stop moving" collides with it head-on if momentum
is measured as forward progress.

This is why the drain condition above is written against `abs(vx)` and grounded
state rather than against `scrollX` progress. In the frozen gate arena, forward
distance is unavailable to everyone, but *stillness* is still a choice — and the
gate wasps already get hotter dive settings and 5.0 cruise speed, so the arena
is exactly where airborne kills and wall kicks should pay. Under this design the
gate reads as a **charge-building room**, which is a better justification for its
existence than "the scroll waits here."

### HUD footprint

No new DOM elements. Three edits to strings that already render:

```text
hudTL:  RIG ▰▰▰  ·  [S] SPREAD ▮▮▯          (notch glyphs welded to the weapon)
hudTR:  THREAT 4820                          (replaces the live kill count)
hudTC:  THREAT REVISED: CONTAIN              (ship voice, ~900ms, reuses the
                                              existing CLEAR message slot)
```

Rationale: attaching the notches to the weapon readout rather than giving them
their own bar means the player reads "how hot is my gun," which is the correct
mental model, in a place their eye already goes. The kill count moves to the end
overlay, where it was always more interesting. The classification line is the
only new *text*, and it is story delivery that costs nothing — exactly the
"terse ship statuses" delivery contract in STORY.md.

Optional and cheap: at BREAKING, tint the hudTL line. Anything more (a bar, a
gauge, particles) belongs to the deferred juice pass, not here.

### Anti-degenerate rules

Stated explicitly so the adversarial agent has something to break:

- Kills score once. `pierce` weapons and GHOST SQUAD clones must not multiply
  event counts beyond one event per death.
- ORBITAL LANCE clears the screen; those kills should score as **ground kills**
  regardless of player state, or the correct strategy becomes "collect OL, then
  jump."
- `link` requires ≥ 2 tiles of elevation change or a crossed gap. Wall-kicking
  the same wall twice in a shaft is legitimate (it gains height); kicking a wall
  while standing next to the floor is not.
- CHRONO (world at 0.35×) must not inflate CHARGE: drain and 600 ms launch
  windows should run on real `gameMs`, consistent with how the existing mod
  timers already work.
- `reclaim` requires the margin threshold to be crossed *downward first*. It
  must not fire from the natural start-of-face position.

## A.4 Smallest playable prototype

Build this in the traversal slice, behind `?score=1`, and change nothing else.
Target: under a day of work, and a real answer to one question.

**Cut everything except:**

1. CHARGE with two notches instead of three — WARM at 40 (fire rate ×0.85) and
   BREAKING at 100 (launch shock). Skip per-weapon hot traits entirely; they are
   content, not hypothesis.
2. Four events: `airborne_kill`, `launch_kill`, `link`, `stall_tick`. All four
   have existing call sites — the kill path in `hitHostile`, the launch branches
   in `updatePlayer` that already set `traversalControlUntil`, the air-jump
   counter that already increments `sliceStats.airJumps`, and the grounded check.
3. `wager` and `reclaim` if they are free: the pocket bounds
   (`ACTIVE_SLICE.darePocket.bounds`) and `sliceStats.minEdgeMargin` already
   exist, so both are a few lines.
4. HUD: notch glyphs appended to the weapon readout, `THREAT n` in the top
   right. No classification line in the slice — one 4–12 second pass cannot
   cross a ladder.
5. The existing TRAVERSAL CLEAR overlay gains two lines: THREAT and
   "hot for X of Y seconds."

**Scale the constants for the fixture.** The slice pass is 4–12 seconds, not 45.
Use a ~6-second meter horizon for the prototype (roughly: double the gains
above, or halve the notch thresholds) and do not carry those numbers to the full
game.

**Run it as an A/B.** `?slice=traversal&score=0` versus `&score=1`, same seed,
same fixture. That comparison is the point: the operator can feel whether the
meter changes their route choices, which no amount of solo tuning can tell you.

**The one question to ask after:** *did you change your route to keep the meter
hot, or did you play the same way and watch a number?* If the answer is the
second one, Architecture 2 has failed its own thesis and the honest response is
to drop CHARGE and take Architecture 3 (phase grades) as a cheap arcade skin
instead. Also worth asking, given the caveat on record in FLEET-PLAN: some of
what makes a meter feel good *is* feedback, so a lukewarm verdict here should be
re-asked once the baseline juice pass exists.

## A.5 Instrumentation appendix

The playtest harness records overlapping metrics. This section defines a shared
vocabulary so bot runs can report proto-scores before the score system exists,
and identical scores afterward.

### Event stream

Every event is a plain object. `t` is `gameMs`. No event carries floats derived
from rendering.

```js
{ t, type, x, y, notch }                    // common envelope

// type-specific fields
airborne_kill : { kind, weapon, vy }        // kind = hostile kind
launch_kill   : { kind, weapon, launch }    // launch = 'ledge' | 'wall' | 'air'
link          : { from, to, dy, verb }      // from/to = connector ids when known
reclaim       : { lowMargin, ms }
wager         : { letter, exitMargin }
recatch       : { letter, msLeft }
stall_tick    : { ms }                      // emitted per 100ms of stall
phase_break   : { phase, routes, threat }
setback       : { kind, phase, y0, y1 }     // see Part B
run_start     : { seed, slice, mode }
run_end       : { reason, threat, classification, ms }
```

Recommended surface, alongside the `window.HB` debug handle the splitter is
adding and the existing `?testapi` snapshot:

```js
HB.score.events            // ring buffer, cap 256, oldest dropped
HB.score.snapshot()        // → see below
HB.score.reset()           // called by resetGame; harness may assert it
```

```js
HB.score.snapshot() → {
  charge, notch, chargeFloor,
  threat, classification,
  counts: { airborne_kill, launch_kill, link, reclaim, wager, recatch },
  airMs, groundMs, stallMs, launchCount,
  minEdgeMargin, routeIds: [...], setbacks,
}
```

### Mapping to the metrics the harness already wants

| Harness metric | Score-system source | Note |
| --- | --- | --- |
| Idle time | `stallMs` | Same definition both sides: grounded, `abs(vx) < 2`, no traversal state. One threshold, one owner. |
| Route coverage | `routeIds` | Connector ids from the fixture's `connectors` array; a route counts as used when ≥ 3 of its connectors are visited in order. |
| Closest crush approach | `minEdgeMargin` | Already computed per frame in `updatePlayer`; the score system should read it rather than recompute. |
| Input density | Harness-side | Not a score input. Deliberately: rewarding input density would reward mashing. |
| Proto-score (before CHARGE exists) | Derived | `protoScore = 100·airborneKills + 25·links + 12·(airMs/1000) − 8·(stallMs/1000)`. Publish this formula in the harness so pre- and post-implementation runs are comparable in shape, not just in trend. |

### Determinism and layering rules

Three constraints that matter more than the tuning:

1. **CHARGE is simulation state; THREAT is display state.** CHARGE changes
   weapon behavior, so it must be a deterministic function of the event stream
   with no rng and no frame-rate dependence, and it belongs in a pure module
   (`src/pure/…` post-split) with `pathcheck` assertions: notch thresholds are
   monotonic, drain cannot cross the phase floor, and a fixed event script
   produces a fixed notch timeline. THREAT can live anywhere.
2. **Scoring must never feed back into physics.** Notch effects touch fire rate,
   projectile counts, and the launch shock — never `runSpeed`, `jumpVel`, or
   gravity. Movement constants are frozen and asserted; a score system that
   quietly retunes them would break the traversal contracts and make every
   playtest incomparable.
3. **Events are emitted at existing decision sites, not polled.** A polled score
   would drift with frame rate and be impossible for the harness to reproduce.

---

# Part B — death and setback

## B.0 What a setback has to do here

Shipped behavior today: three lives; a hit pops your weapon capsule out with a
2.2 s recatch window; death resets to rifle and clears modifiers; the traversal
slice replaces all of that with a 650 ms retry.

The trap DESIGN.md names is real: in a four-minute crescendo, a missed late
recatch can erase the run's entire power curve, and a lives-based death sends
the player *backward* through content they have already beaten — the two
cheapest ways to make an ascent feel like a treadmill.

Five criteria for judging the proposals below:

1. **Does it read as the ship responding?** The *Meridian* is the antagonist and
   it does not hate RIG. Its setbacks should look procedural: repair, seal,
   reclassify, reclaim, purge.
2. **Does it protect the crescendo?** Intensity should never step *down*.
3. **Does it avoid the recovery floor trap?** Sharp and brief, not deflating.
4. **Does it keep the player moving?** A setback that stops play to show a menu
   violates pillar 1 before it does anything else.
5. **Can the player explain it afterward?** Pillar 5 applies to failure most of
   all.

## B.1 HULL FALLBACK — you lose altitude, not the run

**Fiction fit.** The ship does not kill an anomaly on the hull; it *dislodges*
it. A hull ratchet reverses, a plate vents, a service band retracts, and RIG is
peeled off the line they were holding and catches the structure below. In
Intercept and Contain states this reads as the ship shrugging RIG off its good
routes; in Quarantine and beyond it becomes deliberate ejection.

**What happens.** On HP zero, RIG is not removed from play. Control is retained
throughout. Two graduated variants:

- **Tier 1 — vertical fallback (recommended default).** RIG is thrown off the
  current elevation band and lands on the nearest valid *lower* route, keeping
  their forward position `s`. Cost: elevation, CHARGE (down to the phase floor),
  and roughly two seconds. The lower routes are the more dangerous ones — closer
  to houndframe pressure, worse firing angles, less scroll margin. HP refills.
- **Tier 2 — band fallback (second failure in a phase).** RIG falls a
  substantial visible distance down the tower: the camera drops with real
  rendered altitude loss, the scroll edge is briefly suspended (the ship "loses
  track" — a Quarantine-flavored line), and RIG must re-climb a short vertical
  recovery shaft under pressure from below.

**Why the refought ground is not boring.** Because Tier 1 doesn't refight
anything — you keep your forward progress and inherit a worse route. And Tier 2
deliberately does not replay the segment you fell from; it drops you into a
**recovery shaft with inverted grammar**: for six to ten seconds the pressure
comes from *below* instead of behind, and the verbs are wall kicks and chimney
climbs rather than running right. Failure produces a mode you cannot get any
other way. Short, different, and legible.

Best detail in this proposal: **the popped weapon capsule falls with you.** The
existing pop mechanic already spawns a capsule with gravity; during a fallback it
tumbles alongside RIG. Catching your own gun on the way down is the recovery
beat, and it is spectacular for free.

**Score interaction.** A fallback drops CHARGE to the phase floor and pays
nothing. But a mid-fall `recatch` is worth 200 THREAT and +20 CHARGE, and
re-crossing the elevation you were thrown from fires a `reclaim`. A skilled
player converts a death into a highlight — the Vanquish/NieR trick that keeps
failure from feeling like a stop.

**Failure modes, and the playtest that reveals them.**

- *Fall loops* — fall, fail the re-climb, fall again. The recovery shaft must be
  strictly easier to survive than the phase above it, and there must be a
  ceiling on consecutive fallbacks before the next consequence tier applies. A
  bot script that suicides at three heights and measures time-to-recover finds
  this immediately.
- *Toothlessness* — if Tier 1 costs nothing the player learns to ignore damage.
  Watch for players who stop avoiding wasps. The tell in bot data: hit rate
  climbing while completion time stays flat.
- *Fallback as a shortcut* — if a lower route is ever faster, dying becomes
  strategy. This is the adversarial agent's job to test explicitly.

**Smallest prototype.** In the traversal slice, replace the ROUTE LOST overlay
and 650 ms reset with Tier 1: keep `player.x`, drop RIG to the lowest valid
surface below (the `y: 1` trench at columns 47–57 is ideal), refill HP, grant
i-frames, and let play continue. That is a small change to `loseLife` and it
directly tests the core question: *is losing height a real punishment?*

## B.2 THE MERIDIAN REPAIRS — the world hardens instead of the player restarting

**Fiction fit.** The most on-canon proposal of the set. The ship is a
maintenance system; its natural response to an intruder exploiting service
routes is to *repair the ship* — weld the seam, re-armor the face, re-seal the
breach RIG opened, extend a bulkhead across the good line. This is Intercept
("routes seal") escalating into Contain, verbatim from STORY.md.

**What happens.** Each face declares two to four `sealable` connectors in its
fixture data. On a setback, the ship seals the highest-value one — the route RIG
was using, or the fastest remaining line — and it stays sealed for the rest of
the run. Plating slams in with the same brick-slam vocabulary the corner ritual
already uses, on-screen and ahead of the player, with one ship line: "SERVICE
ROUTE 4 SEALED." No restart, no lost progress, no lost power. You lose
*options*.

**The safety contract — non-negotiable.** DESIGN forbids arbitrary route
closure, so sealing needs hard rules, and pleasantly they are all
harness-assertable:

- sealing never reduces the forward routes at any point below **two**;
- sealing happens only during a transformation or gate — never under the
  player's feet mid-traversal;
- a sealed connector is never on a *mandatory* path;
- the seal is always visible before it matters.

**Why it protects the crescendo.** Power and altitude are untouched; the
difficulty rises. This is the purest expression of "the world gets harder
instead of the player restarting," and it makes the ship feel like it is
learning.

**Score interaction.** Elegantly, none needed. Sealed routes shrink the route
variety bonus and make CHARGE harder to sustain, so the punishment is emergent.
The score system never has to subtract anything.

**Failure modes, and the playtest that reveals them.**

- *Death spiral* — each failure makes the next likelier. Mitigation: cap seals
  per run (three feels right), and never seal on the first setback of phase 1.
- *Invisibility* — the player fails later and blames the game rather than the
  seal. The playtest question is diagnostic: "what changed after you went down?"
  If they can't name it, the presentation failed, not the mechanic.
- *Fun-removal* — the ship might seal the route the player enjoys most, which
  reads as the game confiscating its own best content. Watch for players who
  stop exploring after the first seal.

**Smallest prototype.** Slice flag `?seal=1`: on the first setback, remove the
`mid-entry` platform and slam plating into its footprint while play continues.
One platform, one animation, and the operator finds out in one session whether
"the ship took my favorite line" reads as thrilling or as cheating.

## B.3 RECLASSIFICATION — the ship demotes you, and being ignored is worse

**Fiction fit.** The ship's escalation ladder is a *classification*, and
classifications can move both ways. Fail badly and the *Meridian* stops treating
RIG as an intrusion and reclassifies them as contamination. That is not
flattering — it is the ship deciding you are a cleanup task.

**What happens.** No lives, no altitude loss. A setback drops your live
classification (Part A) by one step, and the classification determines *which
systems handle you*:

- **High classification (Intercept and above):** purpose-built defenders. Wasps,
  houndframes, carriers. Dangerous, reactive, and *generous* — this is where
  capsules and modifiers come from.
- **Demoted (Observe / contamination):** the ship sends no defenders. It runs
  **sanitation**: sweep beams, vent gas, purge walls, sections sealing on a
  schedule. Environmental, indifferent, and it drops nothing.

Your weapons still work — there is just less worth shooting, which means no
capsules, no modifiers, no CHARGE from kills, and a hostile *environment* rather
than a hostile *opponent*. To restore your classification you have to make
yourself worth defending against: airborne kills and aggressive movement
re-provoke the ship within roughly fifteen seconds of committed play.

**Why it protects the crescendo.** The penalty is not a weaker player; it is a
*changed opponent that pays worse*. The crescendo is defined by the ship's
response, and the player can re-earn it inside the same run — a heroic recovery
arc that fits a four-minute structure.

**Score interaction.** Total. This proposal *is* the score system's response
curve, which is both its strength and the argument for folding it in rather than
building it separately (see B.8).

**Failure modes, and the playtest that reveals them.**

- *The boring-mode trap* — the worst possible outcome for this game is a
  punishment state that is quiet and empty. Sanitation must be fast and
  frightening, not sparse. If a playtester describes the demoted state as
  "waiting," cut it.
- *Illegibility* — "why did all the enemies leave?" needs answering in one line
  and one visual.
- *Double authoring* — two behavior sets per phase is real content cost.

**Smallest prototype.** Slice flag `?purge=1`: on setback, despawn the wasps,
raise the scroll speed 25%, and sweep a purge band along the trench that forces
the upper routes; restore normal on the next kill — except there is nothing to
kill, which is exactly the feeling under test. Cheap, and it answers the only
question that matters here: is being ignored by the ship *tense* or *dull*?

## B.4 THE RECLAIMER — the ship salvages you back

**Fiction fit.** RIG is a salvage marine, and the ship is a salvage operation
with better funding. When RIG is hit, a maintenance reclaimer arrives and takes
the dropped hardware *up the tower* to be inventoried. It is not malice; it is
housekeeping. And the ship *uses what it collects*.

**What happens.** On a damaging hit, the weapon capsule pops as it does today —
but instead of expiring in place after 2.2 s, a reclaimer drone grabs it and
carries it **forward and up along RIG's own route**. The recovery is a chase, not
a scramble: kill the drone or catch the capsule and you keep the weapon plus a
CHARGE burst. Fail, and the drone delivers your gun to the ship, which installs
it — the weapon reappears later in the run as a defender shooting *your* laser at
you. Killing that defender returns the weapon.

**Why it protects the crescendo.** The setback creates immediate directed
motion. Failure to recover doesn't subtract content; it *adds* an encounter with
a memorable identity ("that turret has my laser"). Nothing about it is quiet, and
nothing about it stops the player.

**Score interaction.** The chase is the highest-density scoring window in the
game — airborne kills, launch kills, and a `recatch` all live inside four
seconds. Recovering a weapon from the ship later should fire a large `reclaim`.

**Failure modes, and the playtest that reveals them.**

- *Fighting the scroll* — the drone must flee forward-and-up, never backward
  into the crush edge, or the chase becomes suicide. This is the single most
  important tuning constraint.
- *Chore feeling* — if the chase is mandatory to stay competitive, it becomes a
  fetch quest every ten seconds. It has to be optional and worth it.
- *Rote paths* — one flee path per phase becomes memorized. Needs a small
  authored set per face.

**Smallest prototype.** Very cheap: capsules already support modes. Add
`mode: 'carried'` — on a hit in the slice, the popped capsule rises along the
chimney at moderate speed for three seconds. Recatch grants the weapon plus a
visible CHARGE burst. Tests both the chase feel and the flee-direction
constraint in one sitting.

## B.5 STRESS WOUND — failure breaks the ship, and the ship spits you out somewhere

**Fiction fit.** Escalating toward Scuttle, the *Meridian* is already willing to
damage itself. When RIG takes lethal damage on a surface, the surface fails: RIG
goes *through* it into the structure, and the ship must handle a hull wound with
an intruder inside it. Failure produces a small involuntary HULLBREAKER event.

**What happens.** On HP zero, RIG punches through the floor into a short interior
"wound" corridor — five to eight seconds of compressed interior grammar (walls,
shafts, machinery, no long sightlines) — and is ejected back onto an exterior
face at an elevation RIG did not choose, possibly lower than where they fell in.
The wound seals behind them and remains as a scar on that route.

**Why it protects the crescendo.** The setback is a *transformation*, which is
the one thing this game already knows how to make exciting. Failure produces
spectacle and novelty rather than repetition — the most literal fusion of
"authored cinematic ascent" with "arcade consequence" in this document. It also
reuses the bulkhead-flip and breach-return machinery the transformation agent is
building, so its marginal cost drops sharply after CP3.

**Score interaction.** No THREAT from the wound itself (nothing to fight);
CHARGE holds at the phase floor. Exiting the wound fires `phase_break`-style
banking so the run's crescendo has punctuation even in failure.

**Failure modes, and the playtest that reveals them.**

- *Loss of agency* — being teleported violates "the player can explain what
  happened." The wound must be short and its exit legible.
- *Dying as a shortcut* — if the wound ever exits higher or faster than climbing
  would have, the optimal strategy is suicide. The adversarial agent should test
  this explicitly and early.
- *Authoring cost* — the highest in this document; needs interior wound content
  per phase.

**Smallest prototype.** Not now. This one depends on the transformation slice;
prototype it after CP3, and only if the flip/breach work has made interior
fixtures cheap.

## B.6 SCUTTLE CLOCK — the only life is the colony's

**Fiction fit.** RIG's body is not the stake; the settlement is. The ship is
committing power to a sterilization it has already authorized, and every
interruption RIG causes also *hurries it along*. The clock is the *Meridian*'s
commitment, visible on the distant Crown.

**What happens.** Lives are removed entirely. One run-level resource: the purge
timer, shown as an aligning band on the Crown and as the settlement's state far
below. Every setback advances the purge (suggested: −12 s) and pushes the ship's
escalation state one notch immediately — the enemies get harder, sooner. The run
ends when RIG reaches the transmitter *or* when the purge completes — and the
purge completing is an **ending**, not a game over: a bleaker one, with the
transmission going out over a dead colony.

**Why it protects the crescendo.** Better than any other proposal here.
Intensity is monotonic by construction: nothing ever steps down, and each
failure makes the remaining run louder and shorter. It also gives the arcade
half something rare — multiple end states derived from one number — while
staying entirely inside the authored story.

**Score interaction.** THREAT and the clock are the two run-level numbers, and
they pull in opposite directions: aggressive play scores and provokes, provoking
costs time. That tension is the score-attack game.

**Failure modes, and the playtest that reveals them.**

- *Weightlessness* — a timer with no felt presence makes setbacks feel free. The
  clock has to be *seen* (Crown bands, ship lines, the settlement below), not
  read as a number.
- *Spiral* — the struggling player accelerates their own worst ending.
- *Tight arithmetic* — a four-to-five-minute run has little slack; the numbers
  will need real calibration, and the bot harness is the right tool for it.

**Smallest prototype.** Slice flag `?clock=90`: replace the attempt counter with
a 90-second run clock; each retry costs 12 s; render it as a shrinking band on
the horizon rather than a digit. Cheap, and it answers whether the operator feels
the cost of failure without being told about it.

## B.7 Comparison

| Proposal | Reads as the ship | Protects crescendo | Keeps player moving | Recovery-floor safe | Authoring cost | Prototype cost | Novelty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **B.1 Hull Fallback** | Strong | Strong | Yes — never leaves play | Yes (phase floor + falling capsule) | Low–Medium | **Very low** | Medium–High |
| **B.2 Meridian Repairs** | **Strongest** | Strong | Yes | Yes (nothing is taken) | Medium–High | Low | High |
| **B.3 Reclassification** | Strong | Medium — risks a quiet state | Yes | Yes | High (two behavior sets) | Low | **Highest** |
| **B.4 Reclaimer** | Strong | Strong | Yes — creates a chase | Yes (weapon recoverable twice) | Low–Medium | **Very low** | High |
| **B.5 Stress Wound** | Strong | Strong | Partly — agency dips | Yes | **Highest** | High (needs CP3) | High |
| **B.6 Scuttle Clock** | Strong | **Strongest** | Yes | Yes | Low | **Very low** | Medium–High |

## B.8 Recommendation

**Top two: B.1 Hull Fallback and B.6 Scuttle Clock.**

They answer different questions and compose into one system rather than
competing. B.1 answers *what happens the instant you fail* — you are dislodged
down the hull, you keep playing, you chase your own gun through the fall. B.6
answers *what failing costs across the run* — the colony's remaining time, and a
ship that escalates a step early. Neither one ever shows a menu, takes a life,
or replays beaten content, and together they make a run that can be failed
repeatedly without ever getting quieter.

Reasoning for that pairing over the alternatives:

- B.1 is the cheapest thing in this document that fixes a problem the operator
  can already feel: the slice's ROUTE LOST overlay is the most momentum-hostile
  moment in the current build, and replacing it with a fall costs almost nothing.
- B.6 is the only proposal that makes failure *structurally* unable to reduce
  intensity, and it converts the stakes from RIG's body (which no one believes is
  at risk in an 80s action movie) to the settlement (which is the actual story).
- B.4 (Reclaimer) is the most delightful single idea here, and I recommend
  building it — but as a **hit** mechanic layered onto the existing capsule pop,
  not as the death mechanic. It complements B.1 rather than replacing it, and the
  falling-capsule detail in B.1 is already halfway to it.
- B.2 (Repairs) is the operator's own seed direction and is the most on-canon
  proposal in the document. It is not in the top two only because it needs faces
  with multiple sealable routes to be honest, and today's fixture has one
  authored lattice. It should be the **phase-break escalation tier** once the
  six-face lattice exists: fail during a phase, and the ship welds something at
  the break.
- B.3 (Reclassification) should not be built as a separate feature. It is
  already what Part A's classification ladder does if the ship's behavior reads
  from it. Folding it into the score system rather than shipping a seventh system
  is the decisive resolution.
- B.5 (Stress Wound) is the best long-term idea and the wrong short-term one.
  Revisit after CP3.

The resulting ladder, stated as one sentence the operator can hold in their
head: **a hit sends a reclaimer after your gun; a death throws you down the
hull; a death costs the colony twelve seconds and provokes the ship early; and a
phase you failed gets a route welded shut at its break.** No lives, no
checkpoints, nothing that stops play.

---

## Open questions for the operator

Short list, and none of them blocks the prototypes above:

1. Should CHARGE be visible at all in the first prototype, or should the
   operator play a build where the gun gets hotter with no HUD signal? The
   second is a stronger test of whether the *feel* carries the mechanic.
2. Is the classification ladder allowed to drive real difficulty (a scored run
   that gets harder because you are good), or should it stay a naming layer over
   the authored phases for now? The clamp in A.3 makes it safe, but it is a
   design commitment.
3. For B.1, does losing altitude read as a punishment to you, or does it need to
   also cost forward progress? This is exactly the sort of thing that cannot be
   reasoned about and has to be felt.
4. Does the bleak ending in B.6 (transmission over a dead colony) belong in this
   game, or does the ending need to stay singular?
