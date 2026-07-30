# Meridian monster traversal — greybox map proposal

Status: **planning artifact, not implemented or canon-locked**

Prepared July 29, 2026 from operator art-direction feedback, the current
six-face runtime, and the target grammar in
[`DESIGN.md`](../DESIGN.md).

## Purpose

Model the full climb as a continuous route over and through one continent-sized
robotic creature-ship while preserving the current deterministic 2D simulation.
At normal play scale, RIG sees only a building-sized patch of machinery. The
creature's full anatomy becomes legible through:

- 60-degree turns around faceted limbs and body rings;
- long phases following a ribline, vertebral keel, or armor seam;
- one door-like neck access plate that may carry RIG inward;
- vent-cover breaches that reveal a visibly higher exterior; and
- distant limbs, body curvature, weather, fog, and the settlement below.

The macro rule is:

> The traversal lattice is the creature-ship's engineered anatomy, not
> scaffolding attached to a warehouse.

### Static-anatomy render rule

Per [`decisions.md` entry 3](../decisions.md) and the CP3 ruling in
[`DESIGN.md`](../DESIGN.md), the Meridian's body already exists and remains
monumental and **static** during ordinary transitions. RIG and the camera move.
The next face is revealed through camera orbit, self-occlusion, fog, and
parallax; it is never assembled, slammed, zippered, or articulated into place.

The allowed exceptions are functional mechanisms rather than body construction:

- a door-like neck access plate may hinge and carry RIG;
- a vent cover, iris, shutter, or Crown interlock may open or retract;
- traps and enemies built by the ship may assemble; and
- live damage may destroy or expose existing routes.

This distinction is part of every gate test below. A successful fixture must
read as movement over one immense creature, not as the creature building a
platform under the player.

This proposal does **not** require a new movement simulation. It maps the
existing `s` path onto creature anatomy and adds render-only altitude,
surface identity, and transformation choreography.

## Preserve the existing path budget

Keep the shipped path unchanged:

```text
24-tile intro + 6 × 65-tile phases + 31-tile Crown outro = 445 s-tiles
```

Collision stays local in `(s, y)` with the current practical `y = 0–12` band.
Presentation adds a phase-level altitude base and anatomical surface normal.

| Segment | Global `s` | Halt / pivot | Render altitude | Creature region | Proposed fixture |
| --- | ---: | ---: | ---: | --- | --- |
| Intro | `0–24` | — | `−8 → 0` | Salvage tether to ventral aft stabilizer | — |
| P1 — Ignition | `24–89` | `75 / 89` | `0 → +12` | Lower stabilizer exterior | `monster-g1-limb-turn` |
| P2 — Lift | `89–154` | `140 / 154` | `+12 → +30` | Outer haunch and ascending ribline | `monster-g2-neck-flip` |
| P3 — Crossfire | `154–219` | `205 / 219` | `+30 → +48` | Lower neck / thoracic interior | `monster-g3-neck-turn` |
| P4 — Displacement | `219–284` | `270 / 284` | `+48 → +78` | Upper neck pressure tract and gill manifold | `monster-g4-vent-breach` |
| P5 — Kill Lattice | `284–349` | `335 / 349` | `+78 → +114` | Dorsal neck and Crown roots | `monster-g5-collar-turn` |
| P6 — HULLBREAKER | `349–414` | `400 / 414` | `+114 → +154` | Crownback and transmitter shell | `monster-g6-crown-scuttle` |
| Crown outro | `414–445` | — | `+154` | Breached transmitter / finale | — |

The render-altitude deltas intentionally increase:

```text
+12, +18, +18, +30, +36, +40
```

The vent breach and late Crown transformations therefore provide the strongest
visual proof of ascent.

## Shared 65-tile phase contract

Use local phase coordinate `u = 0–65`:

| Local range | Job |
| --- | --- |
| `u0–11` | Transformed landing and short inhale |
| `u11–27` | Teach or establish the phase topology |
| `u27–42` | Remix plus route wager |
| `u42–51` | Commitment / climax |
| `u51` | Scroll halt |
| `u51–65` | Gate arena and clean transformation apron |
| `u65` | Exact face pivot or committed transition |

At the current `4.3 tiles/s`, the ungated traversal portion is roughly twelve
seconds. Add pressure through enemy composition, route stakes, and the gate
fight rather than lowering scroll speed to manufacture duration.

The current 16:9 camera sees approximately 44 `s`-tiles:

- entry window: local `u−12…31`;
- main-lattice window: local `u12…55`; and
- gate window: local `u39…82`, keeping the pivot onscreen while the next face
  remains void or uncommitted.

Treat 16:9 as the composition master. Use the existing supported widths as QA:
roughly 66 visible tiles ultrawide and 11 portrait.

## Existing gate ritual

Retain the current 1.1-second two-snap event:

```text
70 ms windup
150 ms first 30° snap
420 ms hold
130 ms second 30° snap
130 ms settle
200 ms resume
```

For ordinary anatomical turns, this is a `0° → 30° → 60°` rotation around a
faceted limb or vertebral ring performed by the **camera**, while the body and
collision stay fixed. For the neck flip and vent breach, retain the same timing
budget, but move only the explicitly tagged access plate or vent cover. The
world behind either mechanism is already present.

Every gate fixture declares:

- anatomical body region;
- surface normal before and after;
- render altitude before and after;
- stable entry and exit aprons;
- two or more valid forward connectors after transformation;
- IDs of collision surfaces carried through the one allowed door flip, if any;
- before/during/after connector visibility mappings;
- enemy and reward sockets;
- dare-pocket retreat timing; and
- permitted mechanism motion, clearly distinct from static body anatomy.

## Gate fixtures

### G1 — Limb-Facet Camera Ratchet

**Body:** ventral aft stabilizer, turning from ventro-port to port-facing.

**Screen:** global `s54–96`; halt `75`; pivot `89`.

**Routes:** three immediate.

1. Fast exposed run across overlapping tail/limb scutes.
2. Mid-height plate-lip chain using jumps and forgiving catches.
3. Lower tendon trough with drop-throughs and safer firing angles.

The gate indexes the camera exactly 60 degrees around the polygonal leg. The old
face self-occludes, an adjacent prebuilt armor face emerges from fog, and the
lower limb drops away beneath the frame. No scute, rib, or collision surface
moves. Two wasps contest different jump arcs; a carrier advertises the first
capsule. A cracked joint-cup dare pocket drops from and rejoins the mid route.

**Test:** Does the turn unmistakably read as moving around one leg while RIG
stays controllable and immediately has three routes?

### G2 — Neck Access-Plate Flip

**Body:** outer haunch / ribline into the lower neck interior.

**Screen:** global `s119–161`; halt `140`; pivot `154`.

**Routes:** five immediate.

1. High exposed scute ridge.
2. Twin-rib wall-jump chimney.
3. Broad carried scapular plate.
4. Low joint-collar floor.
5. Short underside hang returning to the chimney.

Reserve one 10–12-tile door-like neck access plate inside the 14-tile apron,
with continuity connectors near local `y ≈ 3, 6, 9`. The first snap exposes its
hinge; the hold rotates and relocks only that plate; the second snap commits the
camera and materials to a dry mechanical neck interior that already existed.
Surrounding ribs, scutes, and the creature's body stay fixed. A Houndframe
pressures the low route while a wasp contests the wall-launch apex.

**Test:** Can the access plate carry RIG inward, become an interior ramp, and
preserve two recognizable exits without implying that the neck assembles?

### G3 — Inner Cervical Camera Turn

**Body:** lower neck interior, port to dorso-port facet.

**Screen:** global `s184–226`; halt `205`; pivot `219`.

**Routes:** four immediate.

1. Narrow upper vertebral rail.
2. Rib-to-rib hanging transfer.
3. Central covered connector.
4. Low sternum channel with an escape shaft.

The camera performs the interior 60-degree turn around a static cervical ring.
An iris shutter may close the central connector, but the vertebral rail, rib
hang, shaft, and routes on the next facet are prebuilt and revealed by the
orbit. Iris Polyps control specific connectors rather than the whole screen.

**Test:** Does the turn recontextualize floor and ceiling without becoming a
square room, and does every turret sightline leave a real movement answer?

### G4 — Dorsal Vent Breach

**Body:** upper-neck pressure tract to dorsal exterior.

**Screen:** global `s249–291`; halt `270`; pivot `284`.

**Routes:** five immediate.

1. High hook arc between tendon anchors.
2. Service-diaphragm shutters.
3. Rib-lip stair with redirectable landings.
4. Lower tension-cable track.
5. Opened vent-louver route.

A vent cover opens and pressure vapor clears the sightline to a pre-existing
dorsal route. The first snap frames the cover opening; the hold reveals sky,
settlement, and the already-authored exterior lattice; the second snap commits
the camera to exterior materials and the `+30` altitude band. No rib or route
telescopes, clamps, or assembles. Mortar landing denial, one Polyp connector,
and one exit wasp pressure different routes.

**Test:** Does the vent opening reveal the settlement far below and make the
render-altitude jump obvious while local collision and body anatomy remain
unchanged?

### G5 — Crown-Collar Camera Ratchet

**Body:** dorsal neck into the Crown roots.

**Screen:** global `s314–356`; halt `335`; pivot `349`.

**Routes:** five immediate, with more elevations implied outside the gate frame.

1. Fast spinal keel.
2. Broken outer-neck carapace.
3. Dense rib-and-fin braid.
4. Ventral tendon route with cover.
5. Transmitter-fin root linking upper and lower branches.

The camera ratchets around a static collar and reveals a prebuilt dorsal face.
Hostile emplacements may unfold from seams and damaged covers may fall away,
but the scutes, fin root, and route-bearing anatomy do not reposition. Hound,
Polyp, mortar, and wasps occupy different route nodes, but no more than three
attack types tell simultaneously. A carrier pulls a modifier into a broken
dorsal spur with a visible hook return.

**Test:** Can the camera turn plus hostile activation feel like escalating
creature defense while RIG, three tells, the dare return, and two forward routes
remain readable?

### G6 — Crown Scuttle Breach

**Body:** Crownback and transmitter housing.

**Screen:** global `s379–421`; halt `400`; pivot `414`; continues through
outro `s445`.

**Routes:** five, continuously changing.

1. Central transmitter spine.
2. Upper armor-petal chain.
3. Interlock-rib braid.
4. Hanging cable-tendon route.
5. Lower sacrificial plate route.

Combat damage splits covers and releases doors, interlocks, and retracting
mechanisms, exposing passages that were already part of the Crown. The
transmitter breach becomes the finale entrance. Structural destruction may
remove a route, but the body never rebuilds or assembles a replacement. Use
staggered threat pairs rather than the entire roster telling at once. An
optional overcharge node sits on a condemned antenna spur whose return remains
available until the spur tears free.

**Test:** Can the Crown unlock, retract, and destroy mechanisms during peak
combat while the transmitter objective and one clean route pocket never
disappear?

## Collision truth versus creature theater

The greybox should distinguish these layers:

### Collision truth

- authored `(s, y)` surfaces and connectors;
- the one allowed carried access-plate ID during the neck flip;
- gate apron and pivot;
- safe landing zones;
- enemy, reward, and trap sockets; and
- pursuing-edge and dare-retreat math.

### Creature theater

- distant static limb and torso silhouettes;
- camera parallax, self-occlusion, and fog reveal;
- non-colliding armor beyond the play plane;
- fog, settlement, weather, and accumulated damage;
- pressure vapor, sparks, and debris; and
- the Crown growing closer in frame as RIG and the camera ascend.

Until P6, the anatomy never moves. Only explicitly tagged doors, vent covers,
shutters, and hostile constructs may animate. In P6, damage and functional
mechanisms may remove or expose routes, but they still may not assemble the
creature's body. Greybox complexity must never hide which surfaces are actually
playable.

## Smallest implementation experiment

Do not build the full monster first.

1. Add a dedicated fixture selector for **G1** using the current 60-degree
   ritual and exactly the existing collision behavior. Replace only the render
   interpretation: tower corner → two-snap camera orbit around a static faceted
   leg. Suppress the body zipper and reveal an already-built next face.
2. If the operator reports that the gate reads as “around a leg,” build **G2**
   with one allowed 10–12-tile moving neck access plate, static surrounding
   anatomy, and three continuity connectors.
3. Build **G4** next as the altitude proof, because it tests the largest new
   presentation claim: open one vent cover and reveal a prebuilt exterior route
   without requiring the Crown finale.

The first comparison should answer one question:

> Can the existing hex-path greybox feel like climbing around a gigantic
> creature limb before any large runtime rewrite?
