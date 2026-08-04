# Hullbreaker action VFX v2 — ImageGen prompts

Generated with OpenAI's built-in image-generation tool on 2026-08-04. All
four boards use the default built-in chroma-key workflow. No CLI/API fallback
or native-transparency model was used.

The four original ImageGen outputs are preserved as the `*-chroma.png` files
under `source-boards/`; the `*-alpha.png` siblings were produced with the
installed `remove_chroma_key.py` helper. The final atlas is rebuilt from the
alpha boards by `tools/assets/build-action-vfx-v2.mjs`.

## Board A — rifle / scatter

```text
Use case: stylized-concept
Asset type: production game VFX source board, 4 by 4 sprite-cell candidate sheet
Primary request: Create EXACTLY sixteen isolated, manufactured action-effect sprites arranged in an EXACT 4 columns by 4 rows grid, row-major, for the industrial sci-fi game HULLBREAKER. This is BOARD A, the physical RIFLE and SCATTER weapon effect vocabulary.
Scene/backdrop: perfectly flat uniform solid #00ff00 chroma-key background across the entire square canvas. No grid lines. No panels. No separators. No background texture.
Style/medium: crisp hand-painted game VFX cutouts with chunky flat-shaded mechanical detail, production-quality, strong graphic silhouettes that survive at 12 to 48 pixels. Industrial machine fragments, never magic or biology.
Color palette: only restrained charcoal iron, oxidized copper, warm ivory metal, and neutral grayscale highlights. Absolutely no green, cyan, magenta, purple, blue, red, or yellow in any effect. Runtime tint will supply color later.
Composition/framing: Each of the sixteen equal invisible cells contains ONE effect centered independently with generous empty green guard space on all four sides. Nothing crosses a cell boundary. Most effects point to the RIGHT along a clear travel axis; radial impacts must be broken and asymmetric, never circular. Every sprite occupies roughly 55 to 72 percent of its own cell width and no more than 55 percent of its cell height.
Cell map, left-to-right then top-to-bottom:
Row 1 — rifle metal pin/chip: (1) slender right-facing driven rivet pin with two tiny trailing chips; (2) a sheared metal pin striking a plate seam, broken asymmetric impact; (3) one right-traveling machined needle fragment with a torn tail; (4) a compact right-biased ejector-chip fan made from three unequal metal chips.
Row 2 — rifle impact/recovery: (5) two offset right-facing slivers with a small warm-ivory contact nick; (6) narrow rightward bore-spall streak with one copper chip; (7) collapsed impact seam, two separated bent slivers and dust flecks; (8) spent pin and three dead charcoal chips with no glow.
Row 3 — scatter flechette rake: (9) three parallel right-facing narrow flechette slashes, unequal length; (10) five splayed right-facing razor splinters from a compact origin; (11) stepped rake of four metal needles crossing a diagonal armor seam; (12) two outer flechettes shearing away from a dense central strike.
Row 4 — scatter armor splinters/recovery: (13) directional fan of five unequal armor splinters; (14) three torn plate shards flying right with sparse ivory contact sparks; (15) receding rake afterimage made of thin broken metal traces, no haze; (16) spent scatter debris, separated charcoal and copper slivers, no glow.
Lighting/mood: controlled hard warm-white edge accents only, no bloom, no ambient aura, no soft smoke.
Constraints: exactly 16 effects; exact 4x4 layout; one effect per cell; large clean gutters; each effect fully contained; clear right-facing or broken-radial direction; manufactured mechanical shapes; no text, numbers, letters, logos, watermarks, UI frames, floor, cast shadows, reflections, or contact shadows. Background must be one exact uniform #00ff00 with no gradients, halos, light spill, shadows, texture, noise, vignetting, or variation. Do not use #00ff00 anywhere in the effects.
Avoid: creatures, insects, eyes, mouths, wings, claws, bones, teeth, blobs, smoke clouds, fireballs, perfect circles, rings, starbursts, symmetric snowflakes, magical runes, lightning branches, glossy 3D product renders, oversized projectiles, clutter, overlapping cells.
```

## Board B — laser / homing

```text
Use case: stylized-concept
Asset type: production game VFX source board, 4 by 4 sprite-cell candidate sheet
Primary request: Create EXACTLY sixteen isolated, manufactured action-effect sprites arranged in an EXACT 4 columns by 4 rows grid, row-major, for the industrial sci-fi game HULLBREAKER. This is BOARD B, the LASER and HOMING weapon effect vocabulary.
Scene/backdrop: perfectly flat uniform solid #00ff00 chroma-key background across the entire square canvas. No grid lines, panels, separators, background objects, or texture.
Style/medium: crisp hand-painted game VFX cutouts with graphic flat-shaded mechanical linework. These are narrow energy seams constrained by machine hardware, not fantasy magic. Strong silhouettes and clear negative space at 12 to 48 pixels.
Color palette: restrained charcoal iron, oxidized copper, warm ivory, pale neutral grayscale energy only. Absolutely no green, cyan, magenta, purple, blue, red, or yellow; runtime tint supplies weapon color.
Composition/framing: Each invisible equal cell contains ONE independent effect, centered with generous green guards on every side. Nothing crosses cell boundaries. Travel points RIGHT. All laser sprites are extremely long and narrow, never a broad beam. Homing sprites are broken vane-shears or offset cross-cuts, never wings, insects, stars, or perfect X symbols. Effects occupy 58 to 75 percent of cell width and at most 45 percent cell height.
Cell map, left-to-right then top-to-bottom:
Row 1 — laser narrow through-line: (1) hairline right-facing energy seam passing through two separated armor flakes; (2) a single ivory through-line with one copper seam clamp near its origin; (3) double-offset narrow line that converges into one right-facing needle; (4) machine-cut line piercing a charcoal plate shard and continuing right.
Row 2 — laser collapsing afterimage: (5) long seam with three short displaced echoes collapsing toward its axis; (6) broken afterimage made from four diminishing right-facing line segments; (7) thin heated incision with separated curled metal edges, no smoke; (8) spent seam, two faint narrow ivory traces and dead chips, no glow.
Row 3 — homing guidance-vane shear: (9) one right-facing central dart trace bracketed by two swept mechanical vane slivers; (10) asymmetric three-vane shear tilted upward around an empty center; (11) compact guidance-fin slice with one leading needle and two trailing plate slivers; (12) opposing offset vanes snapping past each other along a rightward axis.
Row 4 — homing cross-cut/recovery: (13) broken diagonal cross-cut made from four unequal disconnected slashes, strongly right-biased; (14) guidance correction kink: one narrow travel line with two sharply angled vane scars; (15) collapsing vane afterimage, three separated thin slivers receding left; (16) spent guidance hardware, two bent fins and a severed pin, no glow.
Lighting/mood: sparse controlled warm-ivory action highlight, no bloom, no ambient aura, no smoke cloud.
Constraints: exact 16 effects, exact 4x4 layout, one effect per cell, large clean gutters, fully contained, manufactured mechanical shapes, no text/numbers/letters/logos/watermark/UI/floor/cast shadow/reflection/contact shadow. Background must be exact uniform #00ff00 with no gradient, halo, spill, shadow, texture, noise, vignette, or variation. Do not use green in effects.
Avoid: thick laser bars, neon tubes, blobs, balls, smoke, fireballs, creatures, insects, eyes, wings, feathers, claws, mouths, tentacles, perfect circles, rings, starbursts, symmetric X icons, snowflakes, magical runes, branching lightning, glossy product renders, clutter, overlapping cells.
```

## Board C — combustion / enemy rupture

```text
Use case: stylized-concept
Asset type: production game VFX source board, 4 by 4 sprite-cell candidate sheet
Primary request: Create EXACTLY sixteen isolated industrial action-effect sprites arranged in an EXACT 4 columns by 4 rows grid, row-major, for HULLBREAKER. This is BOARD C: COMBUSTION weapon impacts plus mechanical ENEMY rupture and aftermath.
Scene/backdrop: perfectly flat uniform solid #00ff00 chroma-key background across the whole square canvas. No grid lines, panels, separators, scene, floor, or texture.
Style/medium: crisp hand-painted game VFX cutouts, flat-shaded bio-industrial machine language, high-end production sprites with bold asymmetry. Effects must read at 12 to 48 pixels. Physical pressure, fragments, cinders, snapped mechanisms—not generic explosions.
Color palette: only charcoal iron, oxidized copper, warm ivory, pale gray vapor, and neutral grayscale. No green, cyan, magenta, purple, blue, red, or saturated yellow; runtime tint provides active color.
Composition/framing: One independent centered effect per invisible equal cell with generous empty green guard on all sides; nothing crosses a cell boundary. Directional effects point RIGHT. Ruptures are broken and asymmetrical with an obvious shear origin, never round. Occupancy about 55 to 72 percent cell width and at most 58 percent cell height.
Cell map, left-to-right then top-to-bottom:
Row 1 — combustion bite: (1) compact right-facing serrated pressure bite with a tiny ivory hot seam and three copper teeth; (2) low ground-skimming tongue shaped like a torn wedge with hard leading edge; (3) short asymmetric muzzle-pressure burst with separated cinder chips, no fireball; (4) a bite-shaped plate incision ejecting two rightward shards.
Row 2 — combustion cinders and sparse pressure recovery: (5) six separated directional cinders thinning to the right; (6) one narrow torn pressure ribbon with three holes and ragged end; (7) two offset pale-gray vent wisps traveling right with visible empty space, no cloud; (8) spent charcoal cinders and one bent copper scale, no glow.
Row 3 — mechanical enemy rupture/debris: (9) snapped wasp rotor-vane fragments flying apart from a tiny off-center shear; (10) broken hound armor scute plus one severed tendon strip, right-biased; (11) turret iris jaw failure: three unequal mechanical petals kicked away from a dark empty seam; (12) mortar breech fracture ejecting one bracket, two teeth, and sparse grit.
Row 4 — enemy aftermath vapor and terminal debris: (13) narrow rising pressure vapor split into three separated pale-gray ribbons, lots of negative space; (14) sideways vent cough: one thin irregular gray ribbon with copper flakes, no round smoke; (15) dead machine debris trail of unequal brackets, wires, and ceramic chips, no glow; (16) terminal split-core remnants: two asymmetric torn machine halves separated by an empty diagonal seam.
Lighting/mood: action light exists only as a tiny warm-ivory incision or edge nick; no overall glow, bloom, aura, or luminous cloud.
Constraints: exactly 16 effects; exact 4x4 layout; one per cell; large clean gutters; fully contained; physical manufactured machine effects; no text/numbers/letters/logos/watermark/UI/floor/cast shadows/reflections/contact shadows. Background must be exact uniform #00ff00 with no gradient, halo, light spill, shadow, texture, noise, vignette, or variation. Do not use #00ff00 in effects.
Avoid: generic explosion balls, mushroom clouds, smoke blobs, cotton clouds, fireballs, perfect circles, rings, starbursts, symmetric blasts, creatures, faces, eyes, mouths, insects, intact wings, claws, bones, magical runes, liquid splashes, glossy 3D objects, clutter, overlapping cells.
```

## Board D — Meridian / Warden / Crown

```text
Use case: stylized-concept
Asset type: production game VFX source board, 4 by 4 sprite-cell candidate sheet
Primary request: Create EXACTLY sixteen isolated industrial action-effect sprites arranged in an EXACT 4 columns by 4 rows grid, row-major, for HULLBREAKER. This is BOARD D: MERIDIAN immune-response activation plus WARDEN and CROWN finale packet/rupture/uplink effects.
Scene/backdrop: perfectly flat uniform solid #00ff00 chroma-key background over the entire square canvas. No grid lines, panels, separators, background scene, floor, or texture.
Style/medium: crisp hand-painted game VFX cutouts with chunky flat-shaded terraforming-machine hardware. Production-quality, bold asymmetrical shapes readable at 12 to 48 pixels. The continent-sized ship reacts through clamps, shutters, vents, armored seams, bus bars, and signal hardware—not magic.
Color palette: only charcoal iron, oxidized copper, warm ivory, pale neutral gray. No green, cyan, magenta, purple, blue, red, or saturated yellow; runtime tint provides phase identity.
Composition/framing: One independent centered effect per invisible equal cell with generous green guards on all sides. Nothing crosses a cell boundary. Directional effects travel RIGHT; response effects may open from a broken asymmetric center. Occupancy about 55 to 74 percent of each cell width and at most 60 percent height. No complete circular contours.
Cell map, left-to-right then top-to-bottom:
Row 1 — Meridian activation clamp: (1) opposed blocky clamp jaws snapping inward around an EMPTY diagonal seam, not touching; (2) two unequal locking rails converging rightward with a sheared pin between them; (3) a hard-edged shutter strike: three offset armor bars biting across a seam; (4) clamp recoil: two jaw plates kicked apart with sparse metal chips.
Row 2 — vent and armor response: (5) asymmetric pressure vent burst through three separated slats, one pale-gray directional ribbon only; (6) four armor shutters peeling open from an EMPTY jagged seam; (7) emergency seal sweep: one broad broken plate edge advancing right with two bus-bar streaks; (8) spent vent response: bent louvers, dead ceramic chips, no glow or cloud.
Row 3 — Warden/Crown packet and rupture: (9) compact right-traveling command packet represented by three offset ivory bus-bar dashes inside broken copper brackets, never a circle; (10) packet arrival: narrow line striking an asymmetric forked terminal and splitting into two traces; (11) Warden rack rupture: snapped cannon brace, one tooth, two bus-bar fragments kicked sideways; (12) Crown interlock failure: three heavy unequal latch plates separating from a black zigzag seam.
Row 4 — uplink and HULLBREAKER terminal action: (13) vertical uplink needle made from three discontinuous ivory segments and two small copper antenna brackets, narrow and tall; (14) diagonal carrier release: one long ivory signal seam escaping through two torn shutter plates; (15) transmitter housing shear: two large asymmetric armored halves pulled apart around a narrow empty diagonal; (16) final uplink afterimage: sparse rising three-step signal dashes with tiny dead metal fragments, no aura.
Lighting/mood: tiny warm-ivory action seams only; dormant hardware remains matte. No bloom, no ambient glow, no broad luminous fog.
Constraints: exactly 16 effects; exact 4x4 layout; one effect per cell; large clean gutters; fully contained; manufactured mechanical response; no text, numbers, letters, logos, watermark, UI, floor, cast shadows, reflections, contact shadows. Background exact uniform #00ff00 with no gradient, halo, spill, shadow, texture, noise, vignette, or variation. Do not use #00ff00 in effects.
Avoid: perfect circles, rings, target reticles, symmetric crosses, starbursts, glowing orbs, magic sigils, electricity webs, smoke puffs, explosion balls, blobs, creatures, eyes, mouths, wings, claws, tentacles, intact machines, glossy product render, clutter, overlapping cells.
```

## Review ruling

The first four-board pass was compositionally consistent, so no regeneration
was required. The contact sheet and 24/48px proofs were approved as a cohesive
mechanical vocabulary. The manifest rejects five individual cells rather than
silently promoting everything ImageGen produced: the two homing cells that
collapse to a symmetric cross or disconnected props, and the three obvious
smoke-wisp cells. Fine streaks remain production candidates only at 24–48px;
the manifest publishes a separate 12px-safe set for small punctuation.
