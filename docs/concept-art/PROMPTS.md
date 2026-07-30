# Concept-art generation prompts

These are the prompts used with OpenAI's built-in image-generation tool for the
HULLBREAKER reference pack. Later variants should continue to name reference
images by role and restate the side-on readability constraints.

## 1. Finished exterior gameplay

```text
Use case: stylized-concept
Asset type: finished-game exterior gameplay keyframe for HULLBREAKER
Primary request: show a finished 2.5D run-and-gun game moment on the exterior wall of a colossal feral terraforming ship, with a fast salvage marine called RIG climbing through a dense traversal lattice while shooting
Scene/backdrop: immense polygonal tower hull disappearing into deep teal fog, exposed industrial plates and broken scaffolding, visible height and danger below, the next face of the tower hinted around a chunky 60-degree corner
Subject: one small but readable armored marine in a powerful wall-jump launch, firing warm-white projectiles; several interconnected playable routes at different elevations including floors, ledges, vertical walls, a chimney, an overhang, and a risky magenta weapon capsule pocket; acid-green flying wasp and ground charger threats
Style/medium: polished low-poly 3D game concept art that looks like a real gameplay screenshot, flat-shaded chunky geometry, restrained eight-color arcade palette, strong silhouettes, no photorealism
Composition/framing: wide 16:9 side-on gameplay camera with slight 3D perspective depth; the playable movement plane must read clearly from left to right; show three-to-five immediate route choices without visual clutter; RIG occupies about seven percent of image height
Lighting/mood: escalating high-energy action, deep teal atmosphere, rust-orange hull, acid-green enemy glow, hot-magenta pickup, warm-white muzzle light, fog matched to background
Constraints: preserve strict side-view 2D combat readability despite the 3D world; terrain must look traversable rather than like disconnected floating platforms; no HUD, no text, no logo, no watermark
Avoid: third-person over-the-shoulder camera, isometric view, fantasy stone platforms, realistic military colors, excessive tiny detail, unreadable chaos
```

## 2. Bulkhead flip

Reference: `01-exterior-gameplay.png` as style, palette, material, scale, and
camera reference only.

```text
Use case: stylized-concept
Asset type: finished-game bulkhead-flip transition keyframe for HULLBREAKER
Primary request: create a new image showing the signature moment when a massive exterior hull door flips inward and carries the side-on 2D combat plane into the ship interior, preserving the same art direction and gameplay readability as Image 1
Input images: Image 1 is a style, palette, material, character-scale, and side-view gameplay reference only; generate a new scene rather than editing it
Scene/backdrop: left portion is the exposed rust-orange outer hull over deep teal fog; center is a gigantic chunky rectangular bulkhead panel rotating inward on industrial hinges; right portion reveals a cavernous interior wall with shafts, pipes, overhangs, machinery, acid-green hazards, and several connected climb routes
Subject: RIG remains under player control on the rotating panel in a braced running or jumping pose, warm-white weapon fire continuing through the transition; one wasp trails behind outside while a polyp turret silhouette materializes inside
Style/medium: polished low-poly 3D game concept art matching Image 1, flat-shaded chunky industrial geometry, restrained eight-color arcade palette, looks like an actual in-engine gameplay keyframe
Composition/framing: wide 16:9 side-on camera with slight 3D depth; clearly communicate the door rotating approximately 90 degrees inward through perspective and layered geometry; exterior, pivot, and interior must all be understandable in one frame; no split-screen border
Lighting/mood: high-energy mechanical transformation, hot rust exterior light giving way to darker teal interior with magenta navigation lights, warm-white muzzle flashes, sparks at the hinges
Constraints: same small readable RIG silhouette and strict 2D combat plane as Image 1; the transition must feel chunky and physical, not magical; show that the interior route begins higher than the exterior; no HUD, no text, no logo, no watermark
Avoid: cinematic camera that hides traversal, first-person view, photorealism, smooth sci-fi cleanliness, separate unrelated scenes, impossible Escher geometry
```

## 3. Traversal-lattice layout

Reference: `01-exterior-gameplay.png` as style, palette, scale, and material
reference only.

```text
Use case: stylized-concept
Asset type: side-view stage-layout concept board for a HULLBREAKER traversal phase
Primary request: create a new highly readable wide environment-layout image showing how one dense climbing phase is structured as a traversal lattice rather than rows of floating platforms
Input images: Image 1 is a style, palette, scale, and material reference only; generate a new layout-focused scene
Scene/backdrop: simplified rust-orange industrial hull wall over deep teal fog, presented like an orthographic game-level elevation with minimal atmospheric obstruction
Subject: one continuous playable phase running from a low starting area at the far left to a higher bulkhead exit at the far right; include up to ten possible elevations across the whole layout but only three-to-five local route choices at any point; two main forward routes braid and reconnect through a wall-jump chimney, ledge catches, an overhang, a short hanging transfer, a hook-anchor launch gap, and a higher shortcut; include one clearly visible optional dead-end reward pocket with a hot-magenta capsule and enough return path to escape the pursuing left edge; show a few acid-green enemy silhouettes placed to demonstrate aerial pressure, floor charge, connector lock, and landing-zone denial
Style/medium: polished low-poly 3D whitebox/concept-layout render matching Image 1, flatter and more diagrammatic than cinematic, clean chunky geometry, strong route silhouettes
Composition/framing: extra-wide side elevation, entire phase visible at once, routes visually connected to the hull; use subtle warm-white and magenta directional traces or arrow-like lighting to clarify alternate paths without labels; clear empty margins
Lighting/mood: neutral design-review lighting with the established deep teal, rust orange, acid green, hot magenta, and warm white palette
Constraints: no written labels, no numbers, no HUD, no logo, no watermark; no impossible jumps; avoid evenly spaced horizontal rows; every platform or ledge must participate in a coherent route; make the dead-end risk and return path visually understandable
Avoid: map icons, tiny text, top-down view, isometric view, disconnected floating-platform grid, decorative clutter, photorealism
```

## 4. Six-phase escalation

References:

- `01-exterior-gameplay.png` for finished exterior gameplay style, palette,
  character scale, and enemies.
- `02-bulkhead-flip.png` for chunky interior and bulkhead language.

```text
Use case: stylized-concept
Asset type: six-phase visual escalation board for HULLBREAKER
Primary request: create a new cohesive concept-art board with exactly six adjacent vertical panels showing the game escalating from a sparse lower exterior hull to the catastrophic summit
Input images: Image 1 defines the finished exterior gameplay style, palette, character scale, and enemies; Image 2 defines the chunky interior bulkhead language; use both only as visual references
Panel sequence, left to right:
1. lower exterior ignition, three simple routes, RIG with rifle, a few wasps, cool teal fog
2. exterior lift, wall-jump scaffolds and five routes, ground chargers, brighter rust lighting
3. interior crossfire after a bulkhead flip, shafts and overhangs, polyp turret sightlines, magenta machinery
4. displacement machinery, hook-anchor gaps, mortar landing hazards, denser acid-green effects
5. exterior kill lattice much higher above the fog, many braided elevations, dare pocket and mixed enemies, stronger weapon effects
6. HULLBREAKER summit, hull geometry breaking and assembling during active combat, peak-power RIG, readable chaos, warm-white and magenta energy against a damaged tower crown
Style/medium: polished low-poly 3D game environment concept board matching both references, flat-shaded chunky industrial forms, restrained arcade palette
Composition/framing: exactly six equal-width panels in one wide landscape image, separated only by narrow dark gutters; each panel uses the same side-on gameplay camera and comparable scale so escalation is obvious; the ground/fog horizon rises progressively to communicate climbing
Lighting/mood: a continuous crescendo from cool restrained lower-deck lighting to violent luminous summit energy
Constraints: no text, no letters, no numbers, no HUD, no logo, no watermark; maintain strict side-view route readability in every panel; each panel must look like the same game at a later phase
Avoid: six unrelated art styles, comic characters, isometric maps, photorealism, unreadable final-panel clutter, repeated identical platform rows
```

## 5. Start-screen directions

References:

- `01-exterior-gameplay.png` for hull language, scale, and palette.
- `02-bulkhead-flip.png` for transforming architecture.
- `04-six-phase-escalation.png` for the Crown and dramatic ramp.

```text
Use case: stylized-concept
Asset type: three-direction start-screen composition board for the game HULLBREAKER
Primary request: create one cohesive landscape comparison board with exactly three equal vertical panels, each testing a distinctly different start-screen visual direction for the same game; these are composition concepts with generous clean negative space for a future title and menu, but include no actual text or logo
Input images: use the supplied images only as references for HULLBREAKER's chunky industrial hull, tiny player scale, side-on readability, restrained palette, and transformation language; generate new compositions
Panel 1, left — The Impossible Climb: a continent-sized rust-orange ship wall rises almost vertically through deep teal fog; RIG is a tiny but readable salvage marine near the lower edge; a distant functional Meridian Crown glows as a small magenta-white signal point far above; the settlement is barely visible below; open atmosphere beside the hull provides title space; emphasize human scale, altitude, and determination
Panel 2, center — The Ship Wakes: a colossal rectangular bulkhead rotates diagonally through the composition, splitting exposed teal exterior from compressed dark machinery inside; tiny RIG is already moving across the hinge line while the playable surface transforms; reserve a quiet dark region for title/menu; sell the ship itself as a procedural antagonist and a transition that could flow directly into gameplay
Panel 3, right — Scuttle the Crown: a functional bridge-and-transmitter fortress at the summit begins to split under a vertical magenta-white energy surge; rust armor peels outward in controlled shapes, tiny RIG crosses a foreground combat lattice, debris frames rather than obscures the image; reserve the darker lower third for title/menu; promise maximal 1980s action without revealing victory
Style/medium: polished low-poly 3D game key art, flat-shaded chunky polygonal geometry, strong graphic silhouettes, restrained eight-color arcade palette, no photorealism
Composition/framing: exactly three equal vertical panels separated by narrow dark gutters; all three must feel like the same game; title-screen composition rather than a UI mockup
Lighting/mood: deep teal atmosphere, rust-orange ship, acid-green hostile accents, hot magenta only for power/transmission, warm-white human muzzle or work light
Constraints: RIG stays tiny, never a heroic close-up; Meridian remains a ship and functional place, never a face, creature, or literal heart; connected hull surfaces, not floating platforms; no words, letters, numbers, UI, logo, watermark
Avoid: generic space-marine poster, fantasy architecture, glossy clean sci-fi, photorealism, unreadable explosion, title text, monster-shaped Crown
```

## 6. Enemy form language

References:

- `01-exterior-gameplay.png` for palette and gameplay scale.
- `02-bulkhead-flip.png` for chunky hull machinery.

```text
Use case: stylized-concept
Asset type: enemy-form-language comparison sheet for HULLBREAKER
Primary request: create one clean landscape concept sheet containing exactly nine distinct full-body enemy designs arranged as a precise three-row by three-column grid, with no written labels; the sheet compares three canonical gameplay families across a left-to-right spectrum from repurposed maintenance hardware to weaponized industrial hybrid to uncanny terraforming machinery
Input images: use the supplied HULLBREAKER gameplay and bulkhead images only as references for the restrained palette, chunky low-poly material language, side-on scale, and feral terraforming-ship world; generate new enemy designs
Grid structure:
Top row — HOUNDFRAME family, all low grounded wedges about 2.4 times RIG's width and half RIG's height, built for a committed straight floor charge. Left: Twin-Bogie Gantry with two wheel or track modules linked by a sprung spine. Center: recommended Brace Hound with four piston legs, low armored spine, wedge sensor head and front crash guard, rear pressure vents; canine only through posture, never literal anatomy. Right: Rib Crawler with six short articulated legs around a narrow terraforming chassis.
Middle row — POLYP TURRET family, all fixed and visibly rooted to a floor or bulkhead, controlling one connector or sightline. Left: flush Bulkhead Barnacle dome with a shuttered firing slit. Center: recommended Iris Polyp, fixed bulb with four thick armored petals around a bright core and short barrel, petals clearly able to close and peel open. Right: Cable Anemone with three chunky actuator stalks triangulating around a central muzzle.
Bottom row — SPORE MORTAR family, all squat triangular launchers with an unmistakable upward-firing axis for delayed landing-zone denial. Left: ceiling-hardware Quarantine Bell presented on a short test mount, bladder-like pressure vessel and downward support arm. Center: recommended Seed-Pod Tripod with three splayed feet, squat pressure body, upward bowl or tube, swollen seed canister. Right: Crawler Seeder with low maintenance chassis, dorsal lob tube, visible seed rack; show it parked, not attacking.
Column logic: left is clearly repurposed industrial maintenance hardware; center is the strongest readable bio-industrial balance and should feel like the recommended family; right is more uncanny terraforming machinery but still metal, conduit, ceramic, and pressure vessel—not flesh.
Style/medium: professional video-game enemy design sheet, polished low-poly 3D orthographic renders, flat-shaded chunky polygonal forms, bold black silhouettes, no photorealism
Composition/framing: exact 3 by 3 grid on a simple dark deep-teal studio board with subtle thin gutters; each enemy shown at a consistent side-on three-quarter angle, fully visible, feet or mount on one baseline; place one tiny warm-white RIG scale silhouette at the far left of each row, outside the nine cells
Palette/materials: charcoal and rust-orange armor, acid-green optics/pressure/ammunition only, tiny warm-white or amber tell lights, no magenta on enemies because magenta remains reward/power color
Continuity details: repeat ribbed conduits, three-lobed joints, hex fasteners, and green optics across all nine; hostility and armor should rise from top family to bottom family while retaining one procedural ship ecology
Constraints: silhouettes must communicate airborne versus ground versus rooted versus upward-firing roles at thumbnail size; no attack effects, no scenic background, no UI, no text, no letters, no numbers, no logo, no watermark
Avoid: literal animals, fantasy monsters, wet flesh, humanoid robots, glossy clean sci-fi, identical silhouettes, excessive antenna clutter, insect legs on every design, magenta enemy glow
```

## 7. Enemy combat readability

References:

- `01-exterior-gameplay.png` for camera, hull, palette, and RIG scale.
- `06-enemy-form-language.png` for the center-column enemy designs.

```text
Use case: stylized-concept
Asset type: enemy combat-readability vignette board for HULLBREAKER
Primary request: create one cohesive landscape board with exactly four equal gameplay vignettes arranged in a precise two-by-two grid, showing whether the recommended enemy concepts communicate their gameplay roles at sprint speed
Input images: Image 1 defines the finished HULLBREAKER side-on gameplay camera, hull materials, tiny RIG scale, palette, and connected traversal lattice. Image 2 is the enemy concept sheet; use only its CENTER-COLUMN recommended designs exactly: the four-piston Brace Hound in the top center, the four-petal Iris Polyp in the middle center, and the Seed-Pod Tripod in the bottom center. Generate new gameplay scenes rather than editing either reference.
Top-left vignette — Brace Hound floor charge: low four-piston hound has planted its feet, raised its crash-guard head slightly, narrowed its spine, and flared rear pressure vents in a clear pre-charge tell; show a faint warm-amber straight floor-lane cue; RIG is already choosing between jumping above, wall-launching, or dropping behind; one wasp adds aerial pressure without obscuring the hound
Top-right vignette — Iris Polyp connector lock: rooted four-petal turret is fixed into a bulkhead, petals peeled open around its aligned core; a thin warm-amber sightline controls one narrow connector while two alternate connected routes remain visible; RIG uses cover and the open petals expose a destroy window
Bottom-left vignette — Seed-Pod landing denial: tripod pressure body visibly compresses as its canister rises, one bright lob is in flight, and a warm-amber expanding ring is locked to RIG's intended landing surface; an alternate connector remains visibly reachable; the eventual acid-green impact cloud is low and translucent so route geometry stays readable
Bottom-right vignette — risky carrier lure: a broad slow maintenance carrier displays one obvious hot-magenta power capsule beneath it over a dare pocket; the carrier itself has no aggressive nose or stinger; a Brace Hound threatens the floor return while a Seed-Pod marks the obvious landing, making the reward tempting but recoverable through another route
Style/medium: polished low-poly 3D game concept art that resembles an in-engine gameplay screenshot, flat-shaded chunky industrial geometry, restrained eight-color arcade palette, strong silhouettes, no photorealism
Composition/framing: exact 2 by 2 grid with narrow dark gutters; same strict 16:9-style side-on camera inside each panel, slight 3D depth, RIG about seven percent of panel height; three-to-five immediate routes built from connected hull surfaces rather than floating platforms
Lighting/color roles: deep teal environment, rust-orange hull, acid-green enemy optics and damage residue, hot magenta only on the reward capsule, warm-white RIG fire, warm amber telegraphs
Constraints: every essential threat tell must work through silhouette and pose even in grayscale; warning cues reinforce rather than replace posture; no motion blur; keep routes, landing surfaces, and escape choices visible; no text, letters, numbers, arrows, HUD, logo, watermark
Avoid: giant enemies, cinematic closeups, generic glowing danger circles detached from surfaces, thick laser beams covering routes, magenta enemy attacks, wet organic flesh, glossy robots, unreadable particle effects
```

## 8. Transformation sequences

References:

- `01-exterior-gameplay.png` for style, scale, and camera.
- `02-bulkhead-flip.png` for exterior-to-interior machinery.
- `04-six-phase-escalation.png` for phase and Crown escalation.

```text
Use case: stylized-concept
Asset type: diagnostic transformation-sequence board for HULLBREAKER
Primary request: create one highly readable landscape board with exactly nine panels arranged as three horizontal rows and three equal columns; every row uses the same locked side-on gameplay camera and shows BEFORE, TRANSFORMATION ACTIVE, and COMMITTED NEW PLAYFIELD without any written labels
Input images: use the supplied images only as style, palette, character-scale, hull-material, and camera references; generate new scenes
Row 1: exposed lower exterior traversal lattice; then a gigantic hinged bulkhead rotates inward while remaining a playable surface carrying RIG; then a darker higher interior containment lattice with new shafts, overhangs, and connector sightlines
Row 2: compressed upper interior quarantine machinery; then a physical breach tears the wall outward while RIG remains under control and route continuity is visible; then a much higher exterior kill lattice with the distant settlement far below, stronger weather, exposed conduits, and accumulated self-damage
Row 3: functional Meridian Crown bridge-and-transmitter complex in lockdown; then walls rotate, floors retract, and interlocks expose new routes during structural rejection; then scuttle begins as armor and summit machinery tear apart while a readable transmitter objective, safe surfaces, threats, and climbing openings all remain visible
Style/medium: polished low-poly 3D game environment concept board, flat-shaded chunky industrial forms, restrained eight-color arcade palette, slightly diagrammatic rather than cinematic
Composition/framing: exactly 3 by 3 rectangular panels with narrow dark gutters; same strict side-on gameplay view and RIG at roughly seven percent of panel height; connected lattice geometry in every panel; motion implied through pose, hinge arcs, debris direction, and sparks without arrows or text
Lighting/mood: deep teal fog and interiors, rust-orange hull, acid-green defenses, hot-magenta power/transmitter accents, warm-white RIG light; escalation from controlled machinery to self-destructive summit
Constraints: each middle panel must unmistakably show a physical transition and each right panel must reveal a genuinely different spatial problem, not just a reskin; show altitude through fog, shrinking settlement, Crown proximity, weather, and accumulated damage; Meridian is functional infrastructure, never a creature; no words, letters, numbers, arrows, HUD, logo, watermark
Avoid: nine unrelated illustrations, cinematic cameras, floating-platform grids, magical portals, generic reactor boss, literal heart monster, unreadable final chaos, photorealism
```

## Direction correction after operator review

The operator retained the established palette and enemy language but rejected
the rectilinear, industrial-warehouse macro environment. Earlier prompts
incorrectly extended the rule “the Crown is not a creature” to the whole
Meridian. The corrected rule is:

- the whole Meridian may and should read as a colossal engineered creature;
- its close-up surfaces remain functional colony-ship infrastructure; and
- only the Crown is constrained to remain a bridge/transmitter complex rather
  than a separate creature, head, brain, or literal heart.

The prompts below avoid images 1–5 and 8 as broad environment references because
their wall façades, catwalks, ladders, and refinery silhouettes pull generation
back toward the rejected direction.

## 9. Meridian creature directions

No image references.

```text
Use case: stylized-concept
Asset type: three-direction start-screen and macro-silhouette board for HULLBREAKER
Primary request: create one cohesive wide comparison board with exactly three equal vertical panels, each presenting a distinct body plan for the Meridian, a continent-sized floating robotic creature that is also a functional terraforming colony ship. It must read first as one immense articulated beast in the sky, second as a vessel with climbable inhabited machinery. These are start-screen composition studies with clean negative space for a future title, but no actual text or logo.
Panel 1 — Crownback Sky-Ray: a continent-wide manta or whale-like mechanical leviathan seen from below and alongside, broad articulated wing plates and armored gill cavities, a long rising tail and dorsal spine, with the functional Meridian Crown embedded as a bridge-and-transmitter crest along the upper back rather than a head or eye. Its underside eclipses the settlement; enormous overlapping armor scutes and rib spars imply climbable routes.
Panel 2 — Meridian Spine-Serpent: a kilometer-long armored serpentine colony ship coiling upward through storm clouds, built from colossal vertebral districts, overlapping carapace scales, lateral fin bones, rib arches, and actuator tendons. Several coils disappear through deep teal fog to prove altitude. The Crown is a functional antenna-and-command complex mounted at the highest spinal segment, never a face. This direction should best support an upward climb and discrete segment ratchets.
Panel 3 — Six-Limbed Ark-Beast: a vast non-humanoid terraforming animal-machine, part beetle, whale, and crouched siege beast, suspended above the colony with four immense manipulation limbs, two trailing stabilizers, a colony-bearing armored shell, and a functional Crown complex along the forward shoulder ridge. One limb unfolds across the composition. Preserve inhabited ship scale through tiny maintenance lights, bays, and surface districts.
Shared form language: 70 percent functional terraforming vessel and 30 percent animal posture and anatomy; chunky low-poly armored carapace, vertebral drums, rib cages, gill-like atmosphere processors, synthetic tendon cables, hydraulic muscle bundles, huge joint gimbals, dorsal transmitter spines, and repeated three-lobed mechanisms. Mechanical and dry, no wet flesh.
Style/medium: polished flat-shaded low-poly game key art, bold graphic silhouettes, restrained eight-color arcade palette, no photorealism
Composition/framing: exactly three equal tall panels with narrow dark gutters; each creature occupies most of its panel but leaves one calm region for future menu/title; place a tiny human settlement and a nearly microscopic tethered RIG silhouette below or against the hull for continental scale
Lighting/color: deep teal sky and fog, weathered rust-orange armor, acid-green defense lights only in small clusters, hot-magenta transmitter energy at the Crown, warm-white human settlement and work lights
Canon constraints: the entire Meridian may look and move like an engineered creature, but it remains a colony ship and procedural infrastructure; the Crown is a real bridge, terraforming command, defense coordinator, and transmitter—not a separate monster, face, brain, or literal heart
Constraints: macro silhouette must dominate before surface detail; no words, letters, numbers, UI, logo, watermark
Avoid: industrial warehouse, refinery, oil rig, city tower, rectangular wall façade, ordinary spaceship, humanoid Transformer or Gundam, literal eyes, mouth, teeth, claws, wet flesh, fantasy dragon, creature standing behind a separate level, tiny scaffolding dominating the silhouette
```

## 10. Creature-lattice chaos

References:

- `09-meridian-creature-directions.png` for the center creature's climbable
  spine and the left creature's broad scutes and gill cavities.
- `06-enemy-form-language.png` for enemies and color roles.

```text
Use case: stylized-concept
Asset type: finished-game side-on gameplay keyframe for HULLBREAKER
Primary request: show RIG fighting upward through a dense traversal lattice that is literally the articulated anatomy of the Meridian, a continent-sized floating robotic creature-colony ship. It must read first as one colossal body in motion and second as a playable level—never as scaffolding bolted onto a warehouse wall.
Input images: Image 1 is the approved macro body-plan reference. Use the climbable segmented spine of its CENTER creature, combined with the broad overlapping armor plates and gill cavities of its LEFT creature. Do not copy the right creature's compact body. Image 2 is the enemy form and palette reference; use the center-column Brace Hound, Iris Polyp, and Seed-Pod Tripod shapes where called for.
Scene/backdrop: the near flank of the Meridian rises diagonally from lower left to upper right through deep teal storm fog. A curved spinal keel crosses the upper third; enormous rib arches braid through the center; one three-lobed shoulder or hip gimbal anchors the middle; a vast jointed limb descends into fog below; far-side coils, limbs, and the receding torso silhouette prove the playfield belongs to one airborne mechanical leviathan. The distant settlement is barely visible far below and the functional Crown glows higher along the spine.
Traversal lattice: create three locally readable connected routes grown from anatomy. Upper route: fast and exposed across overlapping dorsal carapace scutes. Middle route: technical path weaving through rib arches, short chimneys, plate lips, wall-launch surfaces, and one hanging synthetic-tendon transfer. Lower route: dangerous ventral conduit gutter with cover and a visible escape connector. Routes split, cross, descend, and reconnect; only three-to-five immediate choices compete at once. Place one hot-magenta weapon capsule in a visible dare pocket inside the rotating joint socket, with its entry and retreat route legible.
Transformation and chaos: freeze a high-energy moment where the torso twists around its spine; a huge scapular carapace scute rotates inward around the central gimbal while remaining a playable surface under RIG; adjacent ribs scissor into a new route; farther right a damaged rib bay tears outward, armor petals shear apart, tendon cables stretch, and exposed vertebral machinery becomes the next playable lattice; dorsal scutes lift and close behind RIG; the distant limb changes pose. RIG launches from the moving scute while firing warm-white rounds. One wasp contests the jump arc, one Brace Hound charges a lower rib, one Iris Polyp unfolds from a seam to lock a connector, and a single Seed-Pod lob marks an intended landing.
Chaos hierarchy: the flipping scute is the dominant event, the breach is secondary, enemy threats tertiary, sparks/debris/vapor the lowest layer. Chaos comes from simultaneous geometry, route changes, threats, and body motion—not from explosions obscuring the frame. Keep a clean silhouette pocket around RIG, every required landing visible, and at least two forward choices.
Form language: 70 percent functional terraforming colony ship and 30 percent animal posture; chunky flat-shaded low-poly carapace scutes, vertebral drums, rib arches, armored gills, synthetic tendon bundles, hydraulic limb gimbals, dorsal transmitter spines, three-lobed joints, hex fasteners, tiny inhabited maintenance lights. Interior cavities resemble a dry mechanical thorax, not a factory room.
Composition/framing: wide 16:9 strict side-on gameplay plane with slight perspective depth only to show the far body and limb silhouettes; RIG about five-to-seven percent of frame height; connected surfaces, bold readable shapes
Lighting/color: deep teal atmosphere and body shadows, rust-orange armor, acid-green enemies and hostile residue, hot magenta only for power, warm-white RIG fire and route-edge lights
Constraints: entire creature is the level, not a boss behind the level; Crown stays functional infrastructure rather than a head, face, brain, or heart; no HUD, text, arrows, logo, watermark; no photorealism
Avoid: industrial warehouse, refinery, oil rig, square rooms, dominant ladders, steel trusses, scaffolding, crates, flat pipe-covered walls, ordinary spaceship corridors, disconnected floating platforms, tidy machinery, humanoid mech, literal animal face, eyes, teeth, wet flesh, cinematic camera, motion blur, unreadable particles
```

## 11. Creature flip and breach sequences

References:

- `09-meridian-creature-directions.png` for the creature-ship body plan.
- `06-enemy-form-language.png` for enemies and color roles.

```text
Use case: stylized-concept
Asset type: bulkhead-flip and breach-return transformation board for HULLBREAKER
Primary request: create one landscape diagnostic board with exactly six equal panels arranged as two horizontal rows by three columns. Each row uses a locked side-on gameplay camera and shows BEFORE, ACTIVE TRANSFORMATION, and COMMITTED NEW PLAYFIELD with no written labels. The Meridian is the continent-sized floating robotic creature-colony ship from Image 1; use its center segmented spine combined with its left broad carapace and gill cavities. The traversal lattice must be its anatomy, not warehouse scaffolding.
Input images: Image 1 defines the macro creature-ship body plan and palette. Image 2 defines the center-column enemy family. Use both as references, generating new scenes.
Row 1 — Rib Inversion / bulkhead flip:
Before: RIG traverses an immense curved exterior flank. Three-to-five routes braid across overlapping rust-orange scutes, projecting rib arches, tendon cables, hook nodes, and recessed armored-gill pockets. A gigantic limb and the body's curve remain visible through teal fog.
Active: the Meridian flinches. One articulated rib ring contracts and exactly three connected armor scutes roll inward in sequence around a three-lobed joint. The same surfaces visibly carry RIG, a Brace Hound, and one magenta capsule through the rotation. Floors become sloped walls, overhangs become hanging routes, wasps swarm through sparks and dry pressure vapor, deeper machinery flexes in the opposite direction. Violent but readable.
After: those same three recognizable scutes lock inside a vast rib cavity as a compressed containment lattice of vertebral drums, hydraulic muscle bundles, dry ceramic pressure membranes, and rib tracks. The carried routes visibly reconnect but now create different risks: exterior shortcut becomes underside path, gill pocket becomes Iris Polyp nest, vertical rib becomes the main climb.
Row 2 — Armored Gill Eruption / breach return:
Before: RIG fights through an organ-mechanical pressure chamber made of vertebral rings, ceramic membranes, rib tracks, piston-tendon bundles, and a Seed-Pod mortar. The connected lattice converges toward one sealed armored gill.
Active: the ship violently expels the intrusion. Multiple ribs spread, the dry membrane ruptures, and gill scutes peel outward like armored petals. A connected section of the interior lattice telescopes through the breach with RIG still running and firing on it. The entire distant creature rolls; fog, shattered scutes, stretched cables, wasps, houndframe, pressure discharge, and debris move in distinct directions without hiding the route.
After: the expelled lattice clamps onto a much higher spinal ridge. Three-to-five new routes continue across arched dorsal plates toward the functional Crown. A gigantic limb hangs far below, the settlement is tiny beneath the fog, and completed body segments recede downward, making altitude undeniable.
Continuity landmarks: repeat one fork-shaped armor scute, one hot-magenta capsule, and one warm-white segmented edge light in all three panels of each row. RIG stays under control and roughly seven percent of panel height. Exact surfaces must remain recognizable through each transition.
Style/medium: polished low-poly 3D game environment concept board, flat-shaded chunky geometry, strong silhouettes, restrained eight-color arcade palette, no photorealism
Composition/framing: exact 2 by 3 grid with narrow dark gutters; strict side-on gameplay plane with slight 3D depth; three-to-five locally readable routes per panel
Lighting/color: deep teal fog and cavities, rust-orange carapace, acid-green enemies and defense organs, hot magenta power only, warm-white player fire and route-edge lights
Canon constraints: the whole Meridian has engineered creature anatomy but remains functional colony infrastructure; the Crown remains a bridge/transmitter complex, never a literal head, face, brain, or heart
Avoid: factory, warehouse, refinery, square room, ordinary door, steel gantry, dominant ladders, pipe-grid walls, crates, conventional spaceship corridor, magical portal, humanoid mech, wet flesh, teeth, eyes, disconnected platforms, unrelated panels, explosions substituting for articulation, chaos hiding safe surfaces, text, labels, arrows, HUD, logo, watermark
```

## 12. Kaiju-ship level anthology

References:

- `09-meridian-creature-directions.png` for the three creature silhouettes.
- `10-creature-lattice-chaos.png` for gameplay grammar and intensity.
- `06-enemy-form-language.png` for enemies and color roles.

```text
Use case: stylized-concept
Asset type: three-level kaiju-ship campaign exploration board for HULLBREAKER
Primary request: create one cohesive wide concept board with exactly three equal vertical panels, treating the three colossal robotic creature-ships from Image 1 as three distinct full playable levels that RIG defeats by climbing through and sabotaging their transforming systems. Each panel must show a different side-on traversal grammar built from that creature's anatomy, while all three still feel like one game and one enemy ecology. This is a future-direction experiment, not established story canon.
Input images: Image 1 defines the three macro creature-ship silhouettes, one per panel in the same left-to-right order. Image 2 defines the finished side-on anatomical traversal lattice, density, transformation chaos, tiny RIG scale, and material finish. Image 3 defines the Houndframe, Iris Polyp, and Seed-Pod enemy family and color roles.
Panel 1 — Sky-Ray level: RIG climbs from the shadowed ventral underside through huge gill processors to the dorsal Crownback. Traversal uses broad overlapping wing scutes, rib spars, armored gill petals, wind tunnels, hanging tendon cables, and an underside-to-dorsal bulkhead flip. One wing banks through teal storm fog while playable plates peel and relock. The level identity is exposure, sweeping lateral routes, violent wind, and large armor surfaces folding around RIG.
Panel 2 — Spine-Serpent level: RIG ascends across several kilometer-scale vertebral districts coiling vertically through clouds. Traversal uses rib arches, vertebral rings, lateral fin bones, narrow tendon transfers, rotating joint sockets, and breach returns from the inside of one segment onto a much higher coil. Adjacent segments ratchet and jackknife, crushing old routes and creating new ones. The level identity is relentless upward momentum, discrete body-segment transformations, and visible altitude.
Panel 3 — Six-Limbed Ark-Beast level: RIG transfers from a moving manipulation limb through a shoulder gimbal into the armored colony shell. Traversal uses limb joints, shell ridges, tendon bridges, actuator chimneys, rotating socket dare pockets, and giant plates flexing open into internal mechanical-thorax routes. Far limbs change pose and become temporary connectors. The level identity is moving-body set pieces, limb-to-shell transfers, and a fortress-like interior carried by an unmistakable beast silhouette.
Shared defeat fantasy: no conventional health bars and no creature standing behind a separate arena. RIG fights on and inside each body, breaks exposed interlocks, redirects a functional system, and forces the creature's own defensive transformation to open the next route. Show a clear hot-magenta system objective in each panel, but do not depict gore, death, or a final victory cutscene.
Gameplay readability: strict side-on 2D play plane with slight 3D depth; tiny RIG about five-to-seven percent of panel height; exactly three-to-five immediate connected routes; enemies pressure different route nodes; chaos from moving anatomy, breaches, and route changes while every landing and at least two forward choices remain visible
Style/medium: polished flat-shaded low-poly 3D game concept art, bold silhouettes, restrained eight-color arcade palette, no photorealism
Lighting/color: deep teal atmosphere and cavities, rust-orange carapace, acid-green enemies and hostile residue, hot-magenta objectives and power, warm-white RIG fire and settlement lights
Canon guardrail: every kaiju is also a functional terraforming colony vessel with vast inhabited scale; command/transmitter structures remain infrastructure, never literal heads, brains, faces, or hearts
Composition/framing: exactly three equal tall gameplay panels with narrow dark gutters; each panel shows enough distant body silhouette to prove the level is the creature itself, not a factory built on it
Avoid: industrial warehouse, refinery, conventional spaceship corridor, flat wall, scaffolding-led level, dominant ladders, crates, disconnected platforms, ordinary boss arena, giant health bar, humanoid mech, fantasy dragon, literal eyes, mouth, teeth, wet flesh, chaos obscuring RIG, text, labels, HUD, logo, watermark
```

## 13. Human-scale monster-climb grammar

References:

- `09-meridian-creature-directions.png` for macro anatomy only.
- `10-creature-lattice-chaos.png` for anatomical materials and intensity.
- `11-creature-flip-breach-sequences.png` for transformation logic.

```text
Use case: stylized-concept
Asset type: human-scale side-scroller camera and monster-climb grammar board for HULLBREAKER
Primary request: create one cohesive landscape storyboard with exactly six equal panels arranged as two horizontal rows by three columns. Every panel must look like an actual playable side-scrolling game frame at human scale: RIG is clearly readable at roughly eight-to-ten percent of each panel's height, running, bounding, wall-launching, and firing across a building-sized patch of the Meridian's machinery. The player is climbing ON and THROUGH a continent-sized floating robotic creature-ship, but the normal camera is too close to show the whole creature. Its anatomy is inferred from immense curvature, moving joints, distant limbs, body roll, and the transitions between surfaces.
Input images: Image 1 defines the Meridian's macro mechanical-creature anatomy only; never copy its zoomed-out poster framing. Image 2 defines the dense anatomical traversal material and combat intensity, but bring the camera much closer and make RIG larger and clearer. Image 3 defines rib-inversion and armored-gill breach mechanics; preserve their articulated-body logic while using true side-scroller framing.
Panel sequence, read left to right across the top row and then the bottom:
1. Lower leg exterior — a strict side-on gameplay frame on one building-sized face of a colossal faceted manipulation leg. RIG runs and bounds across connected armor scutes, piston braces, tendon conduits, joint lips, one wall-launch rib, and an underside route. Only three-to-five local choices show. A distant second limb and the leg's huge curvature through teal fog reveal that this is a creature body, not a tower.
2. Sixty-degree leg turn active — after a gate clear, the combat plane snaps around a 60-degree corner of the same polygonal leg. Show the near armor face rotating out while the adjacent face ratchets into view in two chunky stages; exact scutes zipper and slam into playable alignment; RIG keeps full control, jumping and firing during the turn. It is a turn around the circumference of a limb, not a corridor corner or detached platform.
3. New leg face committed — the same side-on camera has settled on the adjacent face, visibly higher and around the limb. Previous surfaces fall behind into fog; new connected plates, tendon trenches, and a joint-socket dare pocket create a different three-route problem. RIG immediately launches onward; no pause.
4. Long ribline ascent — a fast straight gameplay phase climbing along one enormous rib or spinal keel toward the upper torso. The local side-scroller frame shows braided elevations built from rib arches, overlapping scutes, short chimneys, under-rib hangs, and one magenta capsule pocket. The rib rises diagonally and disappears beyond frame; far below, lower limbs and the settlement establish altitude without shrinking RIG.
5. Neck flip inward — at the armored neck or collar, a huge curved collar scute hinges inward approximately 90 degrees and carries RIG through the body wall while they run and fire. Exterior armor becomes an interior ramp; neighboring ribs scissor into wall-jump surfaces; the side-on combat plane stays readable. Reveal a dry mechanical neck cavity of vertebral drums, hydraulic muscle bundles, cable tendons, and pressure organs—not a square room, corridor, or fleshy throat.
6. Upper vent breach outward — far higher inside the neck, an armored atmosphere vent violently peels open. A connected interior play surface telescopes through the breach with RIG still fighting on it and clamps onto the upper exterior near the functional Crown. Teal storm sky bursts into view; a vast shoulder and lower coils recede beneath the fog; the settlement is tiny far below. The new exterior routes are visible before the motion finishes.
Shared gameplay grammar: strict side-on 2D combat plane with slight 3D depth; connected anatomical machinery rather than floating platforms; every landing visible; at least two viable forward routes; RIG silhouette kept in a clean negative-space pocket. Use only a few canonical enemies per panel: wasp contesting an arc, Brace Hound on a lower scute, Iris Polyp rooted in a seam, Seed-Pod mortar marking a landing. Chaos rises across the six panels through simultaneous body motion, route reconfiguration, enemies, projectiles, sparks, vapor, and debris, but safe surfaces and RIG remain legible.
Style/medium: polished flat-shaded low-poly 3D gameplay concept art, chunky graphic geometry, restrained eight-color arcade palette, no photorealism
Lighting/color: deep teal atmosphere and mechanical shadows, rust-orange carapace, acid-green enemies and hostile residue, hot-magenta rewards only, warm-white RIG fire and edge lights
Canon constraints: the entire Meridian is an engineered creature-colony ship; local machinery remains functional infrastructure; the Crown is a bridge/transmitter complex and never a literal head, face, brain, or heart
Composition/framing: exact 2 by 3 grid with narrow dark gutters; every panel is a close playable side-scroller frame, never a macro poster or map
Constraints: no route-overlay lines, arrows, labels, text, numbers, HUD, logo, watermark; preserve the same recognizable RIG scale and side view across all six panels
Avoid: zoomed-out whole-creature composition, infographic, map, industrial warehouse, refinery, tower façade, square rooms, ordinary spaceship corridor, steel scaffolding, dominant ladders, crates, generic catwalk grid, disconnected platforms, humanoid mech, literal eyes, teeth, wet flesh, cinematic camera, motion blur, chaos hiding RIG
```

## CP3 static-anatomy correction

The prompts above are preserved as generation records, but the CP3 playtest
ruling supersedes their literal moving-body choreography. Future generation and
implementation must follow these rules:

- the Meridian's anatomy and route-bearing body surfaces already exist and stay
  monumental and static during ordinary transitions;
- RIG and the camera move around the body, revealing the next face through
  self-occlusion, fog, and parallax;
- only a door-like neck access plate, vent cover, iris, shutter, Crown
  interlock, or other clearly functional mechanism may move;
- live damage may destroy or expose existing routes, and traps or enemies may
  assemble, but the creature's body never assembles; and
- rolling scutes, scissoring ribs, telescoping lattices, ratcheting body
  segments, and limb pose changes in prompts 10–13 are topology/intensity
  references only, not current render canon.

## 14. Vertical assault level

Generation used the built-in image-generation tool in two passes. The first
pass used these project references:

- `04-six-phase-escalation.png` for cumulative miniature phase density, rising
  pressure, and palette only—not its panel divisions or warehouse form;
- `09-meridian-creature-directions.png` for static macro anatomy;
- `13-human-scale-monster-climb-grammar.png` for tiny readable RIG scale and
  side-on connected play surfaces—not its grid; and
- `06-enemy-form-language.png` for compact hostile silhouettes and color roles.

The final refinement used the generated first-pass draft as **Image 1, edit
target**; `09-meridian-creature-directions.png` as **Image 2, macro-anatomy
reference**; `13-human-scale-monster-climb-grammar.png` as **Image 3,
human-scale gameplay reference**; and `06-enemy-form-language.png` as **Image
4, enemy-form reference**. Board 04's escalation influence was already carried
by the edit target and was not reintroduced directly, avoiding renewed panel
and warehouse drift.

Exact final refinement prompt:

```text
Use case: stylized-concept
Asset type: final vertical level-direction concept art for HULLBREAKER greybox planning
Input images: Image 1 is the edit target and must retain its exact tall portrait composition, one uninterrupted bottom-to-top level, continuously rising sawtooth path, tiny readable RIG traversal poses, deep fog, palette, settlement far below, and three-beat Crown climax. Image 2 is the macro static machine-creature anatomy reference: use its broad overlapping scutes, segmented vertebral spine, rib cages, gill cavities, tendon bundles, and joint gimbals. Image 3 is a reference only for human-scale side-on readability and connected playable anatomy. Image 4 supplies the compact hostile silhouettes and their tiny acid-green tells.
Primary request: Refine Image 1 with one targeted change: make the middle and lower macro-form unmistakably the engineered anatomy of ONE colossal static machine creature rather than stacked roads, a tower, or industrial architecture. Preserve the route topology and all major action placement; redesign the boxiest rectangular masses beneath the path as huge curved vertebral drums, interlocking rib arches, broad carapace scutes, armored gill louvers, synthetic tendon belts, deep joint cups, and three-lobed limb gimbals. Every playable lip still grows directly from and remains connected to this anatomy.
Anatomical continuity: The bottom begins on a monumental ankle/leg joint; the central switchbacks wrap around one leg and haunch; the middle right/up run follows a truly enormous ribline; one clearly functional hinged neck access plate opens into a dry mechanical pressure tract whose existing rib ramps climb steeply on foot; one opened vent cover returns the route to an exterior dorsal ridge higher up; fixed collar rings lead into the functional transmitter Crown. The body extends beyond the canvas and stays weighty and motionless.
Invariants: Keep the entire scene borderless and unpanelized. Keep the primary path continuous and always rising: right/up, zero-altitude turn around a fixed facet, left/up, back right/up along ribs, inward through the one access plate, steep pressure-tract climb, out through one vent, around a fixed collar, then Crown. Keep only 2–4 short route braids, all reconnecting. Keep gates as compact switchback turns that grant zero altitude. Keep the three summit action beats clearly separated and ascending: launch burst, enemy/interlock kill impact, immediate relaunch into the breached Crown—visual BAM BAM BAM with no words. Preserve the restrained deep indigo, cyan, amber/rust, coral, warm-white palette and sparse acid-green hostile tells.
Static-anatomy canon: Scutes, ribs, spine, leg, neck, collar, and route-bearing surfaces are already built and never move, rotate, telescope, zipper, assemble, or change pose. Only the single access door and vent cover may be open; traps/enemies may unfold and live Crown damage may break covers.
Style/medium: polished flat-shaded low-poly 3D side-on game-environment diorama, chunky sculptural machine-animal anatomy, slight depth but readable collision-like surfaces, no photorealism.
Avoid: changing the portrait framing or route, adding panels or borders, whole-monster poster, square building blocks, tower façade, roads, warehouse walls, gantries, scaffolding, ladders, crates, pipe grids, flat platform strips, floating platforms, ordinary spaceship rooms, humanoid mech, face, eyes, mouth, teeth, wet flesh, moving body anatomy, text, labels, arrows, route overlays, HUD, logo, watermark.
```
