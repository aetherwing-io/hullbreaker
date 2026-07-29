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
