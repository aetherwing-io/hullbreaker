# Meridian body-plan track archetypes

Status: **pure feature-ready prototype; not integrated into runtime**.

This proposal separates two ideas that the current six-face route treats as
the same thing:

- a **track segment** is a physical stretch of Meridian anatomy; and
- a **defense phase** is the immune-response escalation beat laid over that
  anatomy.

One defense phase may now occupy several short tail, gill, or joint segments,
or one long rib, wing, limb, or torso span. The six response phases remain
ordered and complete. Player and scroll speed remain exactly `1x`; variety
comes from route proportions, topology, exposure, and socket ecology—not from
secretly accelerating RIG.

The frozen data and validators live in
[`src/pure/track-archetypes.js`](../src/pure/track-archetypes.js). Nothing in
this pass changes `CONFIG`, `path.js`, level generation, cameras, rendering, or
the live game.

## Art-direction source

The grammar follows the current hierarchy in the
[concept-art ruling](concept-art/README.md#current-art-direction-ruling): one
continent-sized machine creature at macro scale, anatomical districts at meso
scale, and colony infrastructure locally. In particular:

- [board 09](concept-art/README.md#9-meridian-creature-directions) supplies
  the Crownback Sky-Ray, Spine-Serpent, and Six-Limbed Ark-Beast body plans;
- [board 13](concept-art/README.md#13-human-scale-monster-climb-grammar)
  keeps ordinary play close to one building-sized patch and treats the shipped
  60-degree ritual as a camera reveal around a static facet; and
- [prompt 14](concept-art/PROMPTS.md#14-vertical-assault-level) requires a
  continuously rising path, compact zero-altitude turns, long altitude-earning
  traversal stretches, and a body that extends beyond the frame.

The CP3 static-anatomy correction is binding. A `facet-ratchet`, `joint-hub`,
`limb-transfer`, or `torso-transfer` describes RIG's path and camera reveal
around anatomy that already exists. It does **not** authorize the body, ribs,
scutes, or limbs to assemble or change pose. Only named functional mechanisms
such as an access plate or vent cover may move.

## Architecture at a glance

| Archetype | Physical segments | Phase distribution 1→6 | Track tiles | Planned macro rise | Segment range | Exterior / interior |
|---|---:|---|---:|---:|---:|---:|
| WORM | 6 | `1 / 1 / 1 / 1 / 1 / 1` | 390 | 0 | 65–65 | 4 / 2 |
| SKY_RAY | 10 | `2 / 2 / 2 / 1 / 2 / 1` | 456 | 74 | 22–90 | 7 / 3 |
| QUADRUPED | 10 | `2 / 2 / 2 / 1 / 2 / 1` | 606 | 100 | 34–86 | 7 / 3 |

`Track tiles` excludes the archetype's intro/outro wrappers. `Planned macro
rise` is data for a future topology integration, not a pace multiplier. WORM
reports zero because current `path.js` maps the macro polyline at height zero
and the existing local generator owns all vertical play; preserving zero is
part of exact backwards compatibility.

The phase-to-segment relationship is intentionally many-to-one:

| Defense phase | WORM | SKY_RAY | QUADRUPED |
|---|---:|---:|---:|
| OBSERVE | 1 regular facet | 2 tail chicanes | 2 forepaw/forelimb spans |
| INTERCEPT | 1 regular facet | 2 lower-gill chicanes | 2 elbow/upper-limb segments |
| CONTAIN | 1 regular facet | 2 gill-processor segments | 2 shoulder/thorax-entry segments |
| QUARANTINE | 1 regular facet | 1 dorsal breach ramp | 1 long thorax transfer |
| STERILIZE | 1 regular facet | 2 long wing/Crownback runs | 2 hip/hindlimb segments |
| SCUTTLE | 1 regular facet | 1 transmitter-crest run | 1 shell-to-Crown run |

## Frozen segment contract

Every segment has exactly these fields:

| Field | Meaning and invariant |
|---|---|
| `id` | Unique stable kebab-case identity; never inferred from array index. |
| `phase` | Integer mapping to `OBSERVE` through `SCUTTLE` (`1..6`). Phases are ordered, contiguous, and may repeat. |
| `bodyZone` | Stable anatomical district name such as `gill-processor`, `forelimb-spar`, or `thorax-transfer`. |
| `lengthTiles` | Positive logical route distance. Array order plus length produces a continuous, gap-free route. |
| `turnDeg` | Signed semantic turn after the segment, limited to ±120 degrees. WORM's 60 means the current two 30-degree bends. |
| `riseTiles` | Non-negative macro altitude earned across the segment. Compact WORM turns still earn zero macro altitude. |
| `surface` | Exactly `exterior` or `interior`. |
| `traversalDensity` | One of `restrained`, `braided`, `dense`, or `assault`. |
| `traversalBands` | Two through five immediate elevation/route bands, matching the readable local-choice target. |
| `revealAhead`, `revealBehind` | Segment-neighborhood radius, each capped at two and forbidden from crossing a defense-phase boundary. Current authored plans use at most one. |
| `transitionKind` | Named anatomical handoff or permitted mechanism; it does not imply body assembly. |
| `socketEcology` | Two or more compatible encounter roles—not concrete spawn orders or enemy counts. |

The plan itself carries stable entry/exit IDs, intro/outro distances, a turn
model, and the shared immutable pace contract:

```js
{ playerSpeedScale: 1, scrollSpeedScale: 1, unit: 'logical-tiles' }
```

Socket ecology is deliberately suggestive rather than prescriptive. For
example, a gill processor can support a rooted interlock, mortar perch, and
rupture chain; a broad wing spar can support aerial nests, arc interception,
and a recoverable carrier dare. The adaptive pressure director still decides
whether a safe live socket should emit anything.

## Archetype identities

### WORM — exact shipped baseline

WORM is the reversible control. It reproduces today's regular Spine-Serpent
cadence: six 88-tile faces, each ending in one semantic 60-degree turn made of
two 30-degree bends separated by a 2-tile chamfer. Each physical face maps to
one defense phase.

The compatibility report proves:

- `24` intro tiles + `6 × 88` face tiles + `31` outro tiles = `583` total;
- corner positions are exactly `112, 200, 288, 376, 464, 552`;
- bend starts are exactly `corner` and `corner + 2`;
- six semantic turns total `360` degrees; and
- all six response phases occur once, in order.

WORM does not claim the existing presentation is the final artistic target.
It gives integration a byte-stable fallback and makes A/B comparison possible
without changing pace, controls, or route duration.

### SKY_RAY — compression below, release above

SKY_RAY begins with six short 22–34-tile segments. Tail-keel switchbacks lead
through lower gill lips and dry atmosphere processors, creating frequent local
chicanes without pretending each bend is a new defense phase. A 44-tile dorsal
breach ramp opens into three long 78–90-tile wing, Crownback, and transmitter
straightaways.

That silhouette produces the intended rhythm: pressured, occluded underside;
functional interior breach; then broad exposed upper surfaces with room to
run, launch, flank, and fight at range. The body is inferred beyond the active
patch instead of rendered as a complete map.

### QUADRUPED — spans, sockets, transfers

QUADRUPED traverses a forepaw and long forelimb, enters an elbow hub, crosses
another limb span, fights through a shoulder socket, passes into the thorax,
crosses a long torso transfer, and exits through hip/hindlimb anatomy toward
the armored shell and Crown.

It includes three long spans of at least 74 tiles, four `joint-hub` handoffs,
and one explicit `torso-transfer`. Joint hubs are compact arena opportunities;
limb and shell spans supply the wide maneuvering room the current single-face
dodge pattern lacks.

## Reveal and route invariants

The future reveal consumer should ask only for the active segment's declared
neighborhood. It must never render the entire archetype up front.

1. Segment order is the route. Derived ranges start at `introTiles`, touch
   exactly (`next.s0 === previous.s1`), and never overlap or leave gaps.
2. Entry and exit IDs must match the first and last segment.
3. All six phases must be covered in order with no skip or regression.
4. Reveal radii are bounded to `0..2`, clipped to route ends, and cannot expose
   a segment belonging to another defense phase.
5. A phase boundary therefore remains self-occluded until the transition
   commits. Lights, capsules, hostiles, particles, and future route art should
   all consume the same neighborhood owner when integration happens.
6. Every plan preserves the `1x` pace contract. Segment data has no speed
   field.

This fixes the design seam behind “I can see lights and capsules around the
next corner” without modifying the current renderer in this lane. The runtime
integration should replace per-system visibility guesses with one projected
segment owner; until that work is explicitly undertaken, these plans remain
inert.

## Focused proof

Run:

```sh
node tools/track-archetypes-check.mjs
```

The check completes without a browser and freezes the following claims:

- all three plans are deeply frozen and deterministic;
- their exact segment schema, counts, phase distributions, surfaces, lengths,
  rises, and route continuity match this document;
- no authored reveal neighborhood crosses a defense phase;
- SKY_RAY owns short lower chicanes and long upper straightaways;
- QUADRUPED owns long limb spans, repeated joint hubs, and a torso transfer;
- deliberate bad-route and bad-reveal fixtures are rejected; and
- WORM exactly matches the live six-face constants in `CONFIG`.

The check prints the compact architecture report and every WORM compatibility
boolean so integration drift is loud rather than visual and subjective.
