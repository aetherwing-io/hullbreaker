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
