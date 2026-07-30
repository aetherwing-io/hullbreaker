# HULLBREAKER concept-art reference pack

These images are aspirational visual references for the target experience in
[`docs/DESIGN.md`](../DESIGN.md) and its [`story spine`](../STORY.md). They are
intended to give designers, implementers, and future agents a shared picture of
the finished game's spatial language, palette, camera, and escalation.

They are **not** exact level blueprints or final asset designs. Preserve the
principles below; do not blindly reproduce incidental platform positions,
enemy anatomy, door engineering, or surface decoration.

## Reference images

### 1. Finished exterior gameplay

![Exterior gameplay concept](01-exterior-gameplay.png)

Shows the target moment-to-moment presentation:

- side-on 2D combat readable inside a fully 3D world;
- small, agile RIG launching between connected routes while firing;
- multiple elevations, vertical surfaces, an overhang, and a visible reward
  pocket instead of rows of disconnected platforms;
- enemies occupying different spatial roles; and
- the deep-teal, rust-orange, acid-green, hot-magenta, and warm-white palette.

### 2. Bulkhead flip

![Bulkhead flip concept](02-bulkhead-flip.png)

Shows the exterior-to-interior transition:

- a massive physical door rotates inward on chunky machinery;
- RIG keeps control and continues firing during the transformation;
- the same 2D combat plane commits to a different rendered surface; and
- the interior introduces shafts, compressed routes, machinery, turrets, and
  hazards while visibly gaining altitude.

### 3. Traversal-lattice layout

![Traversal lattice layout](03-traversal-lattice-layout.png)

Shows the intended level-design grammar rather than a literal shipped stage:

- two primary routes braid, split, and reconnect;
- local choices remain readable even though the whole phase spans many
  elevations;
- a wall-jump ascent, ledge transfers, hook launch, upper shortcut, and lower
  pressure route serve different movement strengths;
- enemies occupy route-specific threat positions; and
- the magenta dare pocket has an identifiable reward, commitment, and retreat
  path under scrolling pressure.

The glowing route traces are explanatory overlays, not proposed in-game UI.

### 4. Six-phase escalation

![Six-phase escalation board](04-six-phase-escalation.png)

Shows the target dramatic ramp from left to right:

1. restrained lower exterior and basic wasp pressure;
2. denser wall-jump scaffolds and ground chargers;
3. compressed interior crossfire;
4. machinery, landing denial, and more vertical traversal;
5. a high exterior kill lattice with mixed threats; and
6. the HULLBREAKER summit, where the world transforms during peak-power combat.

### 5. Start-screen directions

![Start-screen direction board](05-start-screen-directions.png)

Tests three brand promises from left to right:

1. **The Impossible Climb** centers human scale, altitude, and the settlement;
2. **The Ship Wakes** makes transforming architecture the signature hook; and
3. **Scuttle the Crown** promises the maximal summit spectacle.

These are composition studies with deliberate title/menu space, not finished UI
or logo treatments. The middle direction is the most game-specific; the left is
the clearest story pitch; the right is the strongest action-poster pitch.

### 6. Enemy form language

![Enemy form-language sheet](06-enemy-form-language.png)

Compares three enemy families by row:

- Houndframe ground chargers;
- rooted polyp connector turrets; and
- spore mortars for delayed landing denial.

Each row moves left to right from repurposed maintenance hardware, through the
recommended bio-industrial balance, to more uncanny terraforming machinery. The
center column currently gives the strongest shared family: **Brace Hound**,
**Iris Polyp**, and **Seed-Pod Tripod**. This board explores form language; it
does not lock final models.

### 7. Enemy combat readability

![Enemy combat-readability board](07-enemy-combat-readability.png)

Places the recommended enemy forms into four side-on play situations:

- a Brace Hound announcing a committed floor charge;
- an Iris Polyp locking one connector while alternatives remain visible;
- a Seed-Pod Tripod marking the intended landing surface; and
- a non-aggressive carrier luring RIG into a recoverable dare pocket.

The hound mass and mortar denial read strongly. The polyp likely needs a more
side-facing barrel in a model pass, and the carrier should retain its broad,
non-predatory silhouette.

### 8. Transformation sequences

![Transformation sequence board](08-transformation-sequences.png)

Uses locked before/during/after views to test spatial—not merely cosmetic—
change:

- exterior bulkhead flip into interior containment;
- upper-interior breach back to a higher exterior; and
- Crown lockdown, structural rejection, and scuttle.

The diagnostic standard is that RIG stays controllable, moving structure remains
playable, and the committed playfield presents a new route problem. The panels
are sequence targets, not frame-accurate engineering plans.

## Visual invariants

Future concepts and implementation should preserve:

- a side-on gameplay camera with slight 3D perspective depth;
- RIG at roughly seven percent of the screen height;
- strong silhouettes and flat-shaded, chunky industrial geometry;
- three-to-five immediately readable routes even when a phase contains more;
- surfaces that belong to a connected hull rather than arbitrary floating
  platforms;
- color roles: deep teal atmosphere, rust-orange structure, acid-green danger,
  hot-magenta power/reward, and warm-white player fire;
- visible altitude gain across phases; and
- rising spectacle without sacrificing threat, route, or character readability.

## Deliberately unresolved

These images do not lock:

- final character or enemy models;
- exact platform, hook, trap, or pickup locations;
- whether ladders survive into the movement grammar;
- the exact number of routes visible in any encounter;
- final door, hinge, or tower construction;
- HUD composition;
- final lighting, texture density, or post-processing; or
- the implementation sequence described in the design document.

Generation used OpenAI's built-in image-generation tool. The prompt set is
preserved in [`PROMPTS.md`](PROMPTS.md).
