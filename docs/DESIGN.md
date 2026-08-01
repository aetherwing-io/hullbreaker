# HULLBREAKER — design spine and implementation record

## Concept

The *Meridian* is a continent-sized terraforming colony ship gone feral —
and, per the operator's canon decision (see [`decisions.md`](decisions.md)
entry 1), literally a colossal machine-creature: a ship-beast whose
sterilization response is its own immune system exterminating an infection.
RIG, a salvage marine, fights from the stern-side lower hull to the Meridian
Crown at the summit to stop that response and fire humanity's last
transmission home. Tone: 80s action-movie excess. Palette (≤8 colors): deep
teal environment, rust-orange metal, acid-green enemy glow, hot magenta
pickups, warm white muzzle light. Flat-shaded low-poly, fog matched to
background. (Shipped: `src/render/palette.js` centralizes the tokens and
applies this palette as the render default — teal atmosphere/backdrop, rust
body and route surfaces per boards 01/10/13, acid-green hostile ecology on
every enemy mesh including the Iris Polyp, warm-amber tells; `?palette=classic`
restores the neutral grey-box baseline for comparison and stays byte-faithful
to `CONFIG.palette`. Every render module except the judged-rejected
`?hook=1` prototype reads its colors from the palette tokens.)

Visual direction, stage-layout references, and their source prompts live in the
[`docs/concept-art` reference pack](concept-art/README.md).
Narrative canon, the ship's six defensive states, and unresolved story questions
live in the [`story spine`](STORY.md).

## Player promise

**HULLBREAKER is a four-to-five-minute upward action crescendo.** RIG begins
nimble but lightly armed on the exposed skin of the *Meridian*. Every completed
combat phase transforms the world, carries the climb visibly higher, introduces
one new demand, and gives the player a new source of power. By the summit the
player is chaining jumps across a dense lattice of routes, improvising through
mixed enemy formations, and firing an increasingly excessive arsenal while the
ship comes apart around them.

The north-star cadence is:

> **PUMP → PUMP → PUMP → JUMP → JUMP → JUMP → HULLBREAKER.**

A **phase** is one combat-traversal segment ending in a world transformation.
A **face** is the physical exterior or interior surface that hosts it —
fictionally, a ribline, scute run, or cavity wall of the Meridian's anatomy
(see [`STORY.md`](STORY.md), concept-art boards 09–12). Most phases occupy
one face, but the distinction lets later encounters cross a door or
reconfigure a surface without changing the underlying 2D simulation. Boss
phases are named separately.

## Design pillars

1. **Momentum is sacred.** The player should be running, launching, shooting,
   pursuing power, making a route choice, or watching the world transform.
   Interactions that stop movement need a payoff large enough to justify the
   interruption.
2. **Combat happens through movement.** Enemy pressure should demand jumps,
   drops, wall launches, reroutes, and target-priority decisions. Traversal is
   not downtime between fights; it is how the player fights.
3. **Pressure and power rise together.** New enemy combinations arrive beside
   louder weapons, modifiers, and more expressive movement. Escalation should
   feel empowering and dangerous, not merely punitive.
4. **Every break changes the game.** A hull ratchet, bulkhead flip, or breach
   must reveal a new spatial problem and communicate real upward progress, not
   replay the same transition over a cosmetically different platform field.
5. **Chaos stays readable.** The summit may look overwhelming, but threats,
   safe routes, damage, pickups, and exits remain legible. The player should be
   able to explain why they were hit and what they could have done differently.

## The action ramp

### Moment-to-moment loop

Every five-to-ten seconds the player should:

1. read the enemy formation and route topology;
2. choose an elevation, connector, or risky pocket;
3. launch through the route while attacking a priority target;
4. react to a denied landing, moving threat, or power-capsule opportunity; and
5. convert the resulting position immediately into the next launch.

Holding fire while moving right is not enough. A successful encounter makes the
player deliberately change route, timing, or target priority.

### Phase rhythm

Each phase follows **teach → test → remix → break**:

- introduce at most one major new movement or enemy concept under low pressure;
- test it clearly enough that the player learns its counterplay;
- combine it with previously learned threats;
- peak at a gate, kill, escape, or traversal commitment; then
- use the world transformation as a short inhale and the next phase's downbeat.

The transformations provide contrast, not a loss of momentum. They should
generally remain in the current 0.8–1.2 second range, preserve player control,
preview the next topology, and accumulate presentation layers as the climb
intensifies.

### Target six-phase beat sheet

This is the target dramatic structure, not a lock on exact tuning or drop order:

| Phase | Traversal growth | Combat and power interaction | Break |
| --- | --- | --- | --- |
| **1 — Ignition** | Three-to-four readable routes; jumping and forgiving ledge catches | Wasps establish firing while moving; rifle fundamentals and the first weapon capsule | Exterior hull ratchet |
| **2 — Lift** | Wall grabs, slides, and launches braid five-to-six local routes | Houndframes make the floor temporary; spread rewards close-range aerial commitment | Bulkhead flip inward |
| **3 — Crossfire** | Interior shafts, overhangs, and short hanging routes compress the lattice | Polyp turrets control connectors; laser rewards aligning targets through corridors | Interior wall flip |
| **4 — Displacement** | Hook anchors are prototyped among six-to-eight routes and moving hazards | Spore mortars deny intended landings; homing lets traversal take priority over aim | Breach outward, visibly higher |
| **5 — Kill Lattice** | Optional dead-end wagers, shared traps, and as many as ten total elevations | Mixed enemy roles turn route choice into strategy; flame controls lower surfaces; first major modifier spike | Violent summit ratchet |
| **6 — HULLBREAKER** | Surfaces assemble, collapse, and transform during play; every learned verb returns | The full roster attacks in readable combinations while the player reaches peak power | Summit breach into the finale |

Weapon order should ultimately be authored around the lesson of each phase.
Seeded shuffling is useful for reproducibility, but it must not prevent the
campaign ramp from teaching a weapon in the encounter that makes its purpose
clear. Randomized order can become a replay variant after the authored sequence
is proven fun.

## Traversal lattice

The target field is not ten evenly spaced floating platforms. It is a connected
**traversal lattice** with up to ten possible elevations across a phase, of
which roughly three-to-five immediate routes are readable at any moment. Routes
split, cross, climb, descend, terminate, and rejoin through:

- conventional floors and one-way platforms;
- vertical walls and short chimneys;
- ledges, cliff edges, and brief hanging routes;
- overhangs and undersides;
- hook anchors and launch points;
- trapped or temporarily unsafe connectors;
- optional reward pockets and telegraphed dead ends; and
- doors between exterior and interior surfaces.

A **lane** means a local route through the lattice, not a screen-wide horizontal
strip. Vertical density is valuable only when routes create different risks,
enemy matchups, rewards, and escape options.

### Movement grammar

The shipped run, variable jump, double jump, and drop-through form the base.
Target additions should preserve speed:

- **Ledge catch:** a forgiving automatic catch after a near miss. Jump converts
  it immediately into a mantle or launch; down releases.
- **Wall grab / slide / jump:** a brief grip or controlled slide followed by a
  forceful launch. Avoid slow stamina climbing.
- **Cliff hang:** a momentary dodge, aiming position, or route transfer—not a
  long shimmy sequence.
- **Snap hook (later candidate):** a context-sensitive launch toward clearly
  marked anchors with minimal aiming interruption. **v1 rejected** — built
  and judged as the wave-3 lead prototype (`decisions.md` entry 2), then
  rejected in that shape: authored anchor markers plus a dedicated trigger
  read as "too on the nose" and "an extra button press and confusion" (see
  `decisions.md` entry 5). The verb itself is not banned; a future tether
  must be marker-less and button-less, emerging from world/context rather
  than authored points the player services. The movement lane's live
  candidate is now FLOW (momentum spine, `?flow=1`), still unjudged.
- **Traps (later candidate):** thrown, dropped, or triggered while moving.
  Avoid a separate construction mode; hostile and player-owned traps should
  share readable rules when possible.

The governing rule is: **every grab wants to become another launch.**

### Route-choice and pursuit contract

The scrolling damage edge turns topology into a clock. It should create
decisions, not procedural gotchas:

- most moments offer at least two viable forward routes;
- optional pockets advertise their reward and retreat path before commitment;
- a dead-end round trip plus safety margin fits inside the available crush time;
- enemies and traps cannot arbitrarily seal the only exit;
- mandatory routes never require an unintroduced movement verb;
- landing zones are not invalidated before the player can react; and
- visual and audio warnings intensify as the damage edge approaches.

Dead ends are **dare pockets**: “Do I have time to grab that capsule?” A random
mandatory dead end that becomes lethal only after entry is a generation error.

## World-transformation grammar

World transformations are spatial punctuation and proof of ascent. They all keep
gameplay in local `(s, y)` while changing the rendered surface, topology, enemy
ecology, palette, and atmosphere. Per the operator's creature-canon decision
([`decisions.md`](decisions.md) entry 1), the names below gain a fiction
layer only — the underlying corner/gate/flip/breach mechanics, tuning, and
code names are unchanged, and the old tower terms stay in parentheses because
the implementation record and code still use them:

- **Hull ratchet — turning around a limb** (implementation record: "corner
  ritual"): the exterior turns around a polygonal corner, new hull columns
  (armor plates) slam into place, and the next face (ribline) begins at a
  higher visual band.
- **Bulkhead flip — through the neck:** a door or wall panel opens inward; the
  combat plane rotates through it and commits to an interior wall (an internal
  cavity) without changing the core controls.
- **Breach return — emerging from a vent:** an interior panel blows outward
  and reveals that RIG has emerged much higher on another exposed face
  (ribline).
- **HULLBREAKER event:** summit geometry transforms during active combat
  rather than waiting for a clean transition, proving mastery of the
  established rules. The Crown remains a command/defense/transmitter complex,
  not a body part or a creature fought directly — see `STORY.md`'s finale
  section.

**Render rule, per the CP3 verdict** (`decisions.md` entry 3): the anatomy
above is monumental and *static* during a transition. RIG and the camera are
what move; the next stretch of world already exists and is *revealed* — by
the camera rotating around a limb plus natural self-occlusion and fog —
never assembled, slammed, or articulated into place. Two-snap chunkiness
lives in the camera's ratchet curve, not in geometry arriving. This refines
how the beats above render; it does not change what they are or when they
fire, and the sim-side inert-until-crossed gating is unaffected.

Exterior phases favor exposure, long jumps, gaps, flying threats, and broad
sightlines. Interior phases favor walls, ceilings, shafts, traps, machinery,
turrets, and compressed routes.

The climb must be perceptible even though simulation remains 2D:

- the rendered world and camera gain a phase-level altitude offset;
- completed hull falls into fog beneath the player;
- materials, structural damage, alarms, weather, and background silhouettes
  change by altitude;
- music and mechanical ambience gain layers at each break; and
- later transformations become more violent without becoming longer.

## Combat grammar

### Enemy roles

Enemies earn their place by changing traversal decisions:

| Enemy | Spatial job | Movement counterplay | Useful combinations |
| --- | --- | --- | --- |
| **Wasp drone** | Contests open crossings and predictable jump arcs | Alter launch timing, change elevation, or kill it before the apex | Hound forces the jump that the wasp contests |
| **Carrier drone** | Lures the player toward a risky route with visible power | Decide whether the chase fits the scroll and current threat state | Any denial enemy can turn the pickup into a wager |
| **Houndframe** | Makes a floor route temporarily unsafe with a committed charge | Jump, wall-launch, drop behind it, or trap its path | Wasp pressures the air; flame can control its lane |
| **Polyp turret** | Locks a connector or sightline and creates target priority | Reroute, use cover, or destroy it during an opening | Mortar can pressure the alternate route |
| **Spore mortar** | Denies intended landing zones after a readable delay | Redirect in the air or choose a different connector | Hound punishes a panicked return to the floor |

Difficulty should rise primarily through compositions, timing, and topology—not
larger health pools. Every attack needs a recognizable tell, reaction window,
and movement answer before it joins a mixed formation.

### Weapon roles in the lattice

- **Rifle:** reliable baseline, precise mechanism or trap triggering, and a
  weapon that never makes a route impossible.
- **Spread:** close junctions, aerial commitment, and enemies arriving from
  multiple nearby angles.
- **Laser:** corridor alignment, stacked targets, and long sightlines.
- **Homing:** preserves offense while wall-jumping, hooking, or reacting to
  denied landings.
- **Flame:** controls connected lower surfaces, hound routes, and choke points
  while the player moves elsewhere.

Player power should rise at the same macro scale as threat pressure. The
weapon-pop mechanic creates an excellent local panic, but a missed late-game
recatch must not erase the entire run's crescendo. Before phase-five tuning,
choose a recovery floor: an upgraded fallback rifle, a rapid recovery carrier,
retained weapon unlocks, or another solution that makes setbacks sharp but
brief. A first-draft proposal for this floor — tying it to a phase-scoped
floor on a movement-momentum meter — is sketched in
[`docs/proposals/2026-07-score-and-setback.md`](proposals/2026-07-score-and-setback.md);
it is a starting point for prototyping, not a decision.

## Level-construction contract

The generator should become an **assembler of authored traversal chunks**, not
the sole author of fun. Each chunk declares:

- entry and exit connectors and their elevations;
- available and required movement verbs;
- forward, alternate, and retreat routes;
- enemy, trap, reward, and hook sockets;
- safe landing and materialization zones;
- optional dead ends and their measured retreat time; and
- the phase and transition types it supports.

Generation tests should eventually prove:

- every mandatory route is reachable with already taught verbs;
- most combat slices expose at least two viable forward routes;
- optional dead ends remain escapable at the current scroll speed;
- the only exit cannot be occupied by an unavoidable trap or spawn;
- landing zones preserve the minimum telegraph and reaction window; and
- corner, door, and breach aprons remain valid for their transformations.

Authored phase sequences provide escalation and teaching. Seeded variation
inside those sequences provides replay texture.

## Finale structure

THE MERIDIAN CROWN is the summit bridge, command network, defense coordinator,
and long-range transmitter. It is not a body part, a detached creature-boss,
or a literal heart fought directly — the ship-creature's body is the world RIG
has been climbing the whole run, not a health bar waiting at the summit. The
whole ship is the antagonist, and the Crown is the final environment and
system through which it acts.

The finale is a three-beat movement final exam:

1. **Lockdown:** break exposed interlocks while route locks, aerial pressure,
   and landing denial recombine the climb's lessons.
2. **Structural rejection:** the Crown rotates walls, retracts floors, vents
   chambers, and rebuilds the route around RIG; arena damage creates traversal
   openings rather than only reducing a health bar.
3. **Scuttle:** the *Meridian* tears apart its own summit and transmitter
   housing rather than let RIG through. RIG converts the collapse into the final
   climb and commandeers the transmitter.

The leading HULLBREAKER payoff is to divert the ship's sterilization charge
through the breached transmitter, turning the energy intended to erase the
colony into the signal that lets it be heard. The exact mechanism remains open
until prototyped, but victory must preserve access to the transmitter.

The flight segment remains conditional. It must either become the final
acceleration into the HULLBREAKER moment or a short, nearly victorious escape
coda after it. A mechanically unrelated mode that resets intensity after the
summit would flatten the ending and should be cut or moved.

## Open design decisions

Resolve these through small prototypes and playtests rather than assumption:

- Is the primary finished experience an authored cinematic ascent, an arcade
  score attack, or an authored first run with a score/replay mode afterward?
- How much rendered altitude does each phase gain, and which camera/background
  cues make that gain unmistakable without shrinking the player? Partially
  answered: the operator ruled the pulled-back FAR camera (RIG ≈ 3.7% of
  screen height) the default over the original near view (`decisions.md`
  entry 7); the tradeoff — smaller RIG reads as more world per screen but
  costs tell/glyph readability at distance — is accepted for now, with a
  follow-up art/readability pass on tells and glyphs still open.
- What is the authored campaign weapon order, and what recovery floor prevents
  late damage from permanently deflating the power ramp?
- Does the snap hook reuse jump, aim/fire, or a dedicated input, and can a new
  player understand valid anchors without stopping to aim? Narrowed, not
  answered: v1 (authored anchors, dedicated input) is rejected (`decisions.md`
  entry 5); the question still applies to whatever marker-less, button-less
  shape comes next.
- Is 8-way aim sufficient against low targets, or does the game need a crouch
  (lowered firing line/hitbox), light aim-assist, or neither? Raised by the
  CP2 verdict (`decisions.md` entry 4); both are shipped as A/B flags
  (`?crouch=1`, `?aim=assist`), neither chosen.
- Are traps a carried resource, a weapon behavior, or fixed world mechanisms
  that either side can trigger?
- Does the pursuing edge maintain constant speed through dare pockets, or can
  authored pockets briefly alter pressure without teaching the player to wait?
- Does flight strengthen the final crescendo enough to justify a second
  movement model?

A fleet proposal exploring the first question (a movement-driven CHARGE/THREAT
score system for the ascent × score-attack mashup) and the recovery-floor
question above, plus six alternatives to lives-and-checkpoints for the death/
setback question, is sketched in
[`docs/proposals/2026-07-score-and-setback.md`](proposals/2026-07-score-and-setback.md).
Treat it as material for prototyping and playtesting, not as an answer to any
of the questions above.

---

## Current implementation record

The sections below describe the shipped grey-box and its technical decisions.
They are evidence and constraints, not substitutes for the target experience
above.

### Core architectural decision

The simulation is strictly 2D in `(s, y)` — distance-along-level and height.
Rendering maps that ribbon into 3D through a static polyline. This means every
gameplay system (collision, physics, aiming, spawning, gates) is ordinary
2D run-and-gun code, while the world can bend around geometry freely.

### The tower (corner waves)

Evolved across three iterations: flat strip → continuous helix (rejected:
user wanted staged progression, not continuous rotation) → **polygonal
tower with corner events** (shipped):

- Hexagonal tower exterior: 6 faces × 65 tiles, corners turn 60° left
  (counterclockwise circuit keeps the camera outside the tower).
- Each face is a **wave** with authored escalating enemy composition.
- **Wave gate**: scroll halts at `corner − haltOffset` until every wasp is
  dead and the face's spawn entries are exhausted. Gated wasps get a faster
  patrol and hotter dive settings so the arena fight stays honest. Strays
  are culled on every edge so gates cannot deadlock.
- **Corner ritual** (the killing shot is the stinger): wind-up beat → 30°
  yaw snap (easeOutBack, slight overshoot) → ratchet hold → second 30° snap
  → settle → scroll eases back in. ~1.1s total; the player keeps full
  control throughout.
- **Static-anatomy reveal (default)**: faces beyond the current corner are
  unbuilt in the SIM — inert, no bullet or enemy collision — but the world
  the player sees was baked once at boot and never moves. A corner is the
  camera swinging 60° around a joint of a static faceted limb
  (`src/pure/limb.js` + `src/render/limb.js`) while the next facet comes out
  from behind the joint's mass and the fog. This is the CP3 ruling
  (`decisions.md` entry 3) as shipped behaviour since T-009; it was the
  opt-in `?g1=1` experiment before that.
- **Brick-slam zipper (retired from the world, still playable at `?zip=1`)**:
  the previous reveal — the next face's tile columns dropping into place with
  a heavy ease, staggered near-to-far from the corner, locking before the
  scroll resumes. Per entry 3's addendum the technique is not deleted: it is
  retired from anatomy/world reveals and kept whole, installed and reachable
  so it can be repurposed for things the ship *builds* (traps, emplacements,
  later enemies).
- Tiles keep sharp per-face orientation (chunky bricks). Only the camera
  path is chamfered (±3 tiles) around corners; entity yaw blends over
  ±1.5 tiles so characters visibly turn corners.
- Frustum edges are constant s-offsets calibrated at boot/resize from flat
  camera geometry — no per-frame unprojection; gameplay boundaries remain
  reproducible and aspect-ratio safe.

### The lattice (route density, dare pockets, hound stations)

Shipped by T-009 in `src/pure/lattice.js`, on top of the seeded chunk stream:

- **Route density**: every face-interior window (12 columns of lookahead,
  the deck counting as one route) offers 3–5 readable routes. The pass
  patches thin windows at whichever tier is missing and thins busy ones, then
  re-prunes, looping to a fixpoint; it consumes no rng, so the chunk stream
  is unchanged. Measured before → after: 149/246 windows inside [3, 5] →
  246/246; face 2's average went 2.17 → 3.5.
- **Dare pockets**, one per face: a long approach, a two-column chasm, a
  landing a tile lower, a mid lane, and a SHELF mounted on the landing that
  reaches back out over the chasm with a weapon capsule over its tip. The
  shelf points backward on purpose — no free drop off the tip, no forward
  continuation — so the reward costs a climb *and* a measured retreat against
  the scroll (0.66s of climb + 0.43s of retreat = 4.65 tiles of edge advance,
  asserted to leave ≥6 tiles of daylight; 9.35 as shipped).
  The capsule hangs 1.75 over the shelf deck, which is what makes any of that
  true: at the original 0.7 the mandatory crossing jump collected it in
  flight (I-019 — head reach 4.42 over the deck against a bob floor at 4.90,
  inside the 0.95 pickup radius), so the wager existed only on paper. It is
  now 1.53 clear of every deck-line arc — asserted over every launch column,
  speed and hold length, and behaviourally through the shipped sim — while a
  player standing on the tip still collects it by walking. What the geometry
  cannot buy back: the air jump reaches 5.07, so a deliberate double jump at
  the lip can still touch the capsule mid-flight; closing that needs the
  shelf ~1.6 tiles higher than the frozen tier ladder allows.
  The chasm is two columns because RIG is clamped to the right of the screen:
  a player holding right crosses ground at *scroll* speed, and a held jump
  from the clamp travels ~3.0 tiles.
- **Houndframe stations** (faces 2+, `decisions.md` entry 6): one per face, a
  3-column patrol on that face's pocket landing, with the pocket's own mid
  lane overhead as the answer. Ambient stations are non-gating — a ground
  unit bounded by terrain cannot fly to a corner arena, so it must not be
  able to hold a wave gate shut from half a face away.

### Mock-3D enemy presence

Enemies use the depth axis (face normal) as theater while the sim stays 2D:

- **Materialize**: spawn 12 units deep in the fog, condense to the combat
  plane over 900ms (fade + scale-in). No hitbox, no contact damage, no
  dives until fully solid — translucent means "not in play yet".
- Gate waves materialize *inside* the frozen arena view, staggered 220ms
  per enemy, right-to-left. Ambient spawns trigger just inside the right
  edge so the entrance is visible.
- **Alive**: ±0.4 depth breathing.
- **Death**: white flash pop, then a display-only corpse tumbles, swells,
  and recedes 7 deep while fading over 500ms. Kills are counted the frame
  they land, so wave-clear → ritual chains immediately; the dissolve
  overlaps the snap.

### Movement feel (tuned via playtests)

Double jump (one air jump, slightly weaker than ground jump), coyote 100ms,
buffer 120ms, variable height via release-cut, drop-through catwalks. Up to
four vertical levels: ground (h 2–4), a near-continuous mid lane (+2.35),
high-lane stretches (+3), and occasional third-tier lanes (cap y=12);
single jump clears +2, double clears +3. Current speeds: scroll 4.3, run 9.4.
All normal-run constants remain in `CONFIG`; jump/tier/gap relationships are
asserted by `tools/pathcheck.mjs` so retunes can't silently break traversal.

The opt-in traversal slice deliberately keeps those normal-run constants
unchanged while testing a more forceful controller. Its first playtest proved
that players saw and selected distinct routes—including the H dare pocket—but
rejected a 29-second camera-limited pass as slow. The current experiment lets
the camera follow forward motion, strengthens jumping, gives contact launches
fixed short arcs, and caps neutral ledge/wall adhesion at 240/300ms. This is
playtest tuning, not yet a global controller decision.

### Weapons (shipped)

Letter capsules drift from destroyed carrier drones (one carrier per face,
mid-face, deterministic). Drop order: the four letters seeded-shuffled,
then rare gold modifier capsules. R rifle / S spread (5-way) / L laser
(piercing, stretched bolt) / H homing (2 seeking darts) / F flame (lobbed,
then crawls the deck hugging terrain, dies at gaps). One instanced pool;
per-type color/scale/behavior. On taking a hit the capsule pops out toward
the threat — recatch within 2.2s or you're back on the rifle. Death resets
to rifle and clears modifiers.

Modifiers (timed, stackable): RAGE 10s 2× fire rate + red tint · GHOST
SQUAD 12s, two spectral clones replay your shots at 0.5s/1.0s delay ·
ORBITAL LANCE 1s telegraph beam then a screen-clearing strike (killed
carriers still drop!) · CHRONO 4s, world at 0.35× while the player and
their bullets run full speed (world timers stay realtime — known, small
simplification).

### Game shell (shipped, T-013)

The front end from development-sequence item 8, minus onboarding and
accessibility: a start screen, a pause/options panel, the death/restart
flow, and an end-of-run stats screen. It is ui-layer only — the run
lifecycle stays in `src/main.js`, the state screens stay in
`src/ui/overlay.js` (whose outcome titles and body lines are unchanged, so
the bot harness classifies runs exactly as before), and the stats screen
formats counters the game already keeps rather than adding sim state.

The start screen is a **composition study of concept board 05**, built from
flat-shaded CSS boxes and gradients with no image assets. Board 05's three
brand-promise directions are all implemented and swappable at runtime
(`1`/`2`/`3`, or `?title=climb|wake|crown`); the middle one ("The Ship
Wakes") ships as the default because the concept-art pack calls it the most
game-specific, **not because a direction has been judged** — that verdict is
queued for the operator. The compositions obey the same invariants the game
does: RIG at 3–5% of frame height (board 13), DESIGN's ≤8 colour roles, and
the static-anatomy rule (nothing on the screen assembles; only light,
vapour and haze move).

Those invariants are checked at two levels, because a green headless gate
is not proof that a screen looks right. `tools/pathcheck.mjs` asserts the
composition **data** in `src/pure/shell.js` (the declared figure height,
the role table, the resolved custom-property set); the **rendered** result
needs a layout engine, so `?selftest=1` measures the laid-out title itself
on all three directions — the figure's own rotation and its box against
board 13's 3–5% band, plus the fact that no element leans on an inherited
custom property. The first pass shipped a figure whose declared 3.8%
rendered at 3.45% and 74° (an inherited `--rot` re-rotating RIG on top of
the plate it stands on) with the data gate green, which is why the second
level exists.

`?shell=0` restores the pre-shell boot exactly. The harness contract is
two-layered: `?testapi=1` and `?selftest=1` auto-start past the title, and
the shell's key-intent table never consumes a `KEYMAP` key — leaving the
title happens on the same press that plays the game, so no committed bot
script can lose its first input (both halves asserted in pathcheck).
### Feedback pass (juice)

Dev-sequence item 4's visual half (T-011), on by default, `?juice=0` for a
byte-identical pre-juice build. Every intensity lives in one place —
`CONFIG.juice` — and the math is `src/pure/juice.js`, so the whole pass is
retuned or read without touching a renderer.

- **Hit-stop is simulation, not decoration.** A kill freezes the world for
  42ms and taking damage for 90ms (stacking capped at 120ms), applied as a
  dt SCALE of 0.08 on *every* entity update — scroll, RIG, hostiles,
  capsules and projectiles together. A partial freeze would desync the
  substep integration projectiles collide in, and freezing the player but
  not the pursuing plane would be a shove. Timers stay on real `gameMs`
  (the CHRONO convention), so a freeze removes exactly `ms × (1 - scale)`
  of simulated time at any frame rate. It is decided in `src/sim/time.js`
  and only *announced* to the renderer through the `view.juice.hitStop`
  bridge hook.
- **Shake is trauma-squared and bounded in world tiles** (0.15 tiles, 0.55°
  at full trauma, draining in half a second), applied after the camera pose
  as a local translate + roll. The edge calibration that feeds the sim's
  damage plane is computed from the *unshaken* probe pose, so an effect can
  never move a hitbox. Events: kill, hurt, both ritual yaw detents, a face
  reveal / band commit, plus a low sustained rumble while a ritual holds
  the scroll.
- **Particles and flashes** are two fixed instanced pools (224 sparks, 20
  flashes) in `src/render/fx.js`, additive, allocation-free, and frozen
  along with the world during hit-stop. Muzzle flash fires once per volley;
  impacts key off an hp drop (so a polyp's armour ping correctly produces
  no debris); deaths key off the corpse-fade removal; pickups mirror the
  sim's own catch predicate.
- **The crush plane now warns before it kills**: an amber band standing on
  the pursuing edge, intensity eased so the last tile carries the warning
  and the pulse accelerating as the margin closes — the same warning
  grammar as the hound tell and the polyp iris.
- **Budget, measured rather than assumed**: `tools/playtest/juice-stress.mjs`
  saturates the 256-slot projectile pool and the 224-spark pool (60 shots plus
  a death burst injected per frame through the game's own spawn paths) and
  reads the in-game frame sampler. On the dev machine, 256 live projectiles +
  224 sparks + 16 flashes held **120fps / 8.33ms avg / 9.4ms worst / 0 frames
  over 20ms**, indistinguishable from the same route with no load and from the
  same load under `?juice=0`. Numbers, method and honesty notes (rAF is
  vsync-locked, so `worstMs`/`over20ms` are the load-bearing fields) live in
  `artifacts/t011-juice/07-stress-perf.json`.
- Colors are palette *roles* (`muzzle`, `enemyGlow`, `capsule`, …) resolved
  from `CONFIG.palette` through one table in `src/render/fx.js` — the same
  values the bullets, hostiles and capsules already draw with, so an effect
  can never disagree with the thing it is feedback for. The juice modules
  carry no color literals of their own, and that table is the single swap
  point when a dedicated render-palette module lands.

## Development sequence

Build narrow playable slices and prove the new grammar before producing the
entire climb:

1. **Traversal vertical slice:** replace one representative platform field with
   a five-to-six-route lattice; add ledge catch, wall grab/slide/jump, one
   telegraphed dare pocket, and pursuit-aware reachability tests. **Built** as
   the opt-in `?slice=traversal` fixture and accelerated once already
   (`15f66d2`) after its first playtest proved the spatial grammar and failed
   the pacing test. Checkpoint CP1 has since concluded: the accelerated pass
   plus the `intensity` agent's further pace variants all read as
   "directionally correct," no single one was crowned, and the operator
   pivoted the mission toward concept-art-driven movement verbs (wave 3) —
   see [`decisions.md`](decisions.md) entry 2.
2. **Transformation slice:** preserve the shipped hull ratchet, add one
   bulkhead flip and breach return, and make the resulting altitude gain
   unmistakable without changing 2D collision. **Merged** (`738a890`,
   `?slice=transform`) and judged at checkpoint CP3: directionally right, but
   the transition choreography itself was called choppy — see the render
   rule added to "World-transformation grammar" above and `decisions.md`
   entry 3. The second pass applying that rule is implemented (T-001: the
   access plate relocks flush on the ratchet hold and persists, the vent
   cover blows open to a caught stop with a vapor burst that clears before
   the camera commits — no debris, nothing vanishing — and the slice's fog
   now rides the camera pull-back so the prebuilt interior reads at the
   far default; evidence in `artifacts/cp3-transform-v3/`). CP3's
   re-judgment of that pass is still pending.
3. **Combat grammar:** add houndframe, polyp, and mortar one at a time. Prove
   each enemy's tell, movement answer, weapon interaction, and two-enemy
   combination before adding the next. **Houndframe merged and judged**
   (`94913ad`; CP2 verdict "those feel much better," iterate from hound 2.5
   — `decisions.md` entry 4); the CP2.5 follow-up (ownership placement, roof
   contest, crouch/aim-assist prototypes, commit coil) also merged and was
   judged strongly positive ("enemies feel like they are coming for me" —
   entry 6). **Iris Polyp v1 built, unjudged**: an opt-in trial in the
   traversal slice (`?polyp=1` solo teach, `?polyp=2` the one two-enemy
   combination — polyp locking the post-mid lane while the judged
   hound-rejoin beat prices the drop reroute beneath it). It is a rooted
   emplacement with a side-facing beam (boards 06/07): closed→tell→fire→vent,
   armoured except during fire/vent so openings — not hit points — are how
   it dies, the beam band locks exactly one lane on the standing firing
   line, and sightlines never cross facet bends (entry 7's rule). Fairness
   (tell vs the slowest escape, per pace tune) and placement (rooted mount,
   owned connector coverage, clear reroutes above and below) are asserted
   in `tools/pathcheck.mjs`; bot evidence in `reports/tasks/T-004/`.
   **Spore Mortar v1 built, unjudged**: the last role in the enemy table,
   an opt-in trial in the traversal slice (`?mortar=1` solo teach,
   `?mortar=2` the one two-enemy combination — DESIGN's own combine
   column, the mortar denying the post-mid landing strip while the judged
   hound-rejoin beat patrols the floor the panicked answer runs to). It is
   a rooted Seed-Pod Tripod on the post-high catwalk (boards 06/07):
   aim→lob→fuse→burst→cool, where the pod's whole flight plus its fuse is
   the warning, the marked patch is three tiles of an eight-tile catwalk
   (so landing long, or taking the tier above or below, are all live
   answers), and the denial itself lasts a fifth of a second — shorter
   than a jump stays above it. Fairness (warning vs the slowest answer,
   per pace tune) and placement (mount, marked surface, owned landing,
   intact reroutes, arc clearance) are asserted in `tools/pathcheck.mjs`;
   bot evidence in `reports/tasks/T-014/`.
4. **Baseline feedback now:** add essential hit, hurt, launch, pickup, warning,
   and transformation sounds plus restrained hit-stop, shake, flashes, and
   particles. Full polish can wait; readable timing cannot. **Both halves
   built, unjudged**: the WebAudio synth layer merged (T-012, `?audio=0`
   mutes), and the visual pass shipped with it (T-011, `?juice=0` disables) —
   hit-stop, trauma shake, muzzle flash, impact/death/hurt/pickup particles,
   and the crush-plane warning. See "Feedback pass (juice)" in the
   implementation record below. Its INTENSITY is an operator feel question,
   not a machine one.
5. **Six-phase ramp:** author the beat sheet, traversal chunks, enemy
   compositions, weapon sequence, presentation layers, and recovery floor.
6. **Finale:** build THE MERIDIAN CROWN as the movement final exam only after
   the phase-four/five mixed-combat slice is already fun.
7. **Flight decision:** prototype the smallest possible coda and keep it only
   if it raises or releases the summit peak without feeling like a new,
   disconnected game.
8. **Front-end and final polish:** title, onboarding, pause/options, run stats,
   accessibility controls, generative music, and the remaining juice pass.

Do not scale immediately to ten elevations, every movement verb, and all enemy
types. The first milestone is one short lattice that makes players voluntarily
change routes while shooting and ask to play it again.

## Acceptance and playtesting

### Fun acceptance

Before boss or flight production:

- players make a deliberate route or target-priority choice every few seconds;
- later phases provoke frequent launches, drops, or wall interactions without
  making the character hard to read;
- each phase feels more intense than the last while preserving a short,
  satisfying inhale at its break;
- players can explain what hit them and name a plausible counter;
- required movement verbs are learned before mixed pressure demands them;
- most combat slices retain at least two viable forward routes;
- dead-end pickups feel like conscious wagers rather than generator tricks;
- no single weapon dominates every topology and enemy composition;
- losing a weapon creates a memorable recovery scramble, not a prolonged
  collapse of the power curve; and
- ratchets, flips, and breaches make players report that they are visibly
  climbing, not circling a flat strip.

Useful playtest questions:

1. Where did you stop moving or become bored?
2. Which route choice felt intentional rather than forced?
3. What hit or killed you, and what could you have done differently?
4. Which weapon did you hope to keep, and what situation made it shine?
5. Did a dead-end reward tempt you? Was its risk readable before commitment?
6. Which transformation made the climb feel higher or more dangerous?
7. When did the game first feel like it had reached “HULLBREAKER” intensity?

### Technical acceptance

- 60fps target with 200+ projectiles and the target traversal density;
- no console or self-test errors;
- generation, spawning, retreat-time, and traversal invariants pass headlessly;
- no unavoidable route closure across supported aspect ratios; and
- start → summit → finale → victory completes in roughly four-to-five minutes,
  unless playtesting demonstrates that the intended crescendo needs a different
  duration.

## Reskin lever

Mechanics are setting-agnostic; swap palette + nouns only. Candidates:
neon-mythology (gold/violet), dieselpunk trench (brass/abyss-blue), kaiju
coast (concrete/warning-yellow).
