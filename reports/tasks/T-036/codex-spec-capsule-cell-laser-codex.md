You are drawing a single game asset for HULLBREAKER, a Contra-style 2.5D
run-and-gun. Return **one SVG file and nothing else**.

## What to draw

A weapon-pickup capsule face read as a LIT ALCOVE, not a printed letter box: a hot-magenta glowing field inside a chunky dark frame, a warm-white inner rim light along the top and left inside edges, and one dark ink silhouette of a LANCE/LASER weapon (a single long horizontal barrel with a blunt breech at one end) filling the middle. No rivets, no chamfer bevels, no gradients, no text elements: every mark must be at least 20 of 128 units thick because the whole face is 18 screen pixels tall in the shipped view. Flat shapes only.

Asset id `capsule-cell-laser-codex`, category `glyphs`, canvas 128x128.

## The world it has to belong to

The player, RIG, is a human-scale salvage marine climbing the exterior skin and
interior cavities of the *Meridian* — a continent-sized machine-creature. The
game renders flat-shaded low-poly geometry with heavy fog. Assets must belong to
that world: chunky, high-silhouette, palette-locked industrial anatomy. Armour
plates, ribs, scutes, vents, seams, tendon machinery. Not painterly texture
soup, not glossy sci-fi chrome, not cartoon outlines.

Reference boards are attached: docs/concept-art/01-exterior-gameplay.png, docs/concept-art/07-enemy-combat-readability.png. Match their form language and color
weight, not their subject matter.

## Scale — the constraint that fails most assets

This asset stands 1.045 tiles tall in the world. The shipped default camera (FAR, per docs/decisions.md entry 7) renders RIG — 1.7 tiles — at 3.7% of screen height, so on a 1280x800 screen this asset is about **18.2 pixels tall**, next to a 30px RIG. Judge every decision at that size.

Detail that cannot survive that height is worse than absent: it turns into
mush and costs silhouette contrast. Design the read at the small size first,
then add interior detail that enriches it up close without muddying it. One
dominant shape, one high-contrast interior mark, everything else subordinate.

## Palette — hard constraint, machine-checked

Use only these roles. Shades and tints of a role are fine and encouraged (a lit
facet and a shadow facet of the same material); a hue outside every band is
rejected by `tools/assets/check.mjs` and the asset comes back.

- **rust-orange** (metal, structure, armour)
  anchor `#9b5c31`, legal range: hue 48-78 in CIELCh
- **warm-white** (muzzle light, player fire, gold trim)
  anchor `#ffe79b`, legal range: hue 78-100 in CIELCh
- **hot-magenta** (pickups, power, reward)
  anchor `#ff4fd8`, legal range: hue 325-5 in CIELCh
- **ink** (darkest neutral, glyph strokes, void)
  anchor `#14181e`, legal range: any hue below chroma 12 (a grey/ink tone)

Anchors are one usable color per role, not the only one: any shade or tint that keeps the same hue passes. 5 chromatic roles plus a neutral axis, eight total — DESIGN's whole palette budget.

Roles allowed for this asset: hot-magenta, ink, warm-white, rust-orange.

Flat shading only: every facet is one solid fill. Depth comes from value steps
between facets, never from a gradient.

## Output contract

- Exactly one `<svg>` element, in a single ```svg fenced block, nothing before
  or after it. No commentary, no alternatives.
- `width="128" height="128" viewBox="0 0 128 128"`.
- Colors as `#rrggbb` or `#rrggbbaa` literals only. No CSS named colors, no
  `hsl()`, no `var()` — the palette checker reads literals and treats anything
  it cannot parse as a failure.
- No `<text>` elements: rasterization must not depend on an installed font.
  Draw letterforms as rectangles or paths.
- No gradients, filters, masks, embedded raster images, external references, or
  `<script>`. Self-contained and flat.
- Integer coordinates wherever the shape allows — crisp edges at power-of-two
  raster sizes.
- Include a `<title>` and a short `<desc>` naming the roles used and the read
  the design is going for.
