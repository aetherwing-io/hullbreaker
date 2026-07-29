# HULLBREAKER — design record

## Concept

The *Meridian* is a continent-sized terraforming colony ship gone feral. RIG,
a salvage marine, fights from the stern to the bridge to fire humanity's last
transmission home. Tone: 80s action-movie excess. Palette (≤8 colors): deep
teal environment, rust-orange metal, acid-green enemy glow, hot magenta
pickups, warm white muzzle light. Flat-shaded low-poly, fog matched to
background. (Grey-box currently uses a neutral placeholder palette.)

## Core architectural decision

The simulation is strictly 2D in `(s, y)` — distance-along-level and height.
Rendering maps that ribbon into 3D through a static polyline. This means every
gameplay system (collision, physics, aiming, spawning, gates) is ordinary
2D run-and-gun code, while the world can bend around geometry freely.

## The tower (corner waves)

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
- **Brick-slam zipper**: faces beyond the current corner are unbuilt — void.
  During the ritual the next face's tile columns drop into place with a
  heavy ease, staggered near-to-far from the corner, locking before the
  scroll resumes. Unbuilt terrain is inert: no bullet or enemy collision.
- Tiles keep sharp per-face orientation (chunky bricks). Only the camera
  path is chamfered (±3 tiles) around corners; entity yaw blends over
  ±1.5 tiles so characters visibly turn corners.
- Frustum edges are constant s-offsets calibrated at boot/resize from flat
  camera geometry — no per-frame unprojection, gameplay is deterministic
  and aspect-ratio safe.

## Mock-3D enemy presence

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

## Movement feel (tuned via playtests)

Double jump (one air jump, slightly weaker than ground jump), coyote 100ms,
buffer 120ms, variable height via release-cut, drop-through catwalks. Up to
four vertical levels: ground (h 2–4), a near-continuous mid lane (+2.35),
high-lane stretches (+3), and occasional third-tier lanes (cap y=12);
single jump clears +2, double clears +3. Current speeds: scroll 4.3, run 9.4.
All constants in `CONFIG`; jump/tier/gap relationships are asserted by
`tools/pathcheck.mjs` so retunes can't silently break traversal.

## Weapons (shipped)

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

## Build order (remaining)

1. **Enemy roster**: polyp turret, houndframe charger, spore mortar
   (carrier shipped early with the weapons pass — add each as an ENEMY
   table row + a movement branch in updateHostiles).
2. **Boss**: THE IMMUNE HEART — three phases, hit-stop transitions.
3. **Flight interlude**: ~60s vertical shooter up the spine shaft.
4. **Juice**: trauma shake, hit-stop, muzzle lights, particles, tracers,
   squash-and-stretch, UI tweens.
5. **Menus/states**: title over live level, pause, death/victory stats.
6. **Audio**: WebAudio-synthesized SFX + generative bass loop.

Acceptance: 60fps with 200+ bullets, no console errors, start → boss →
flight → victory in ~4–5 minutes.

## Reskin lever

Mechanics are setting-agnostic; swap palette + nouns only. Candidates:
neon-mythology (gold/violet), dieselpunk trench (brass/abyss-blue), kaiju
coast (concrete/warning-yellow).
