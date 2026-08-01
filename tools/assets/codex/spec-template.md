<!--
  Spec template for `codex exec`, filled in by tools/assets/gen.mjs.

  Placeholders (all substituted before the spec is sent, and the resolved copy is
  written to tools/assets/runs/spec-<id>.md so every generation has an auditable
  prompt of record):

    {{ID}}            asset id, kebab-case            {{CATEGORY}}   glyphs | textures | sprites | ui | fx | backdrops
    {{BRIEF}}         what to draw, from --brief      {{SIZE}}       square pixel size (power of two)
    {{ROLES}}         allowed role ids, from --roles  {{PALETTE}}    role table, generated from lib/palette.mjs
    {{BOARDS}}        attached reference board files  {{SCALE_NOTE}} the on-screen size this has to survive

  The palette table is generated from lib/palette.mjs rather than written out
  here, so the spec a generator receives and the bands check.mjs enforces cannot
  drift apart. Edit the rules below; never hard-code hex values into them.
-->
You are drawing a single game asset for HULLBREAKER, a Contra-style 2.5D
run-and-gun. Return **one SVG file and nothing else**.

## What to draw

{{BRIEF}}

Asset id `{{ID}}`, category `{{CATEGORY}}`, canvas {{SIZE}}x{{SIZE}}.

## The world it has to belong to

The player, RIG, is a human-scale salvage marine climbing the exterior skin and
interior cavities of the *Meridian* — a continent-sized machine-creature. The
game renders flat-shaded low-poly geometry with heavy fog. Assets must belong to
that world: chunky, high-silhouette, palette-locked industrial anatomy. Armour
plates, ribs, scutes, vents, seams, tendon machinery. Not painterly texture
soup, not glossy sci-fi chrome, not cartoon outlines.

Reference boards are attached: {{BOARDS}}. Match their form language and color
weight, not their subject matter.

## Scale — the constraint that fails most assets

{{SCALE_NOTE}}

Detail that cannot survive that height is worse than absent: it turns into
mush and costs silhouette contrast. Design the read at the small size first,
then add interior detail that enriches it up close without muddying it. One
dominant shape, one high-contrast interior mark, everything else subordinate.

## Palette — hard constraint, machine-checked

Use only these roles. Shades and tints of a role are fine and encouraged (a lit
facet and a shadow facet of the same material); a hue outside every band is
rejected by `tools/assets/check.mjs` and the asset comes back.

{{PALETTE}}

Roles allowed for this asset: {{ROLES}}.

Flat shading only: every facet is one solid fill. Depth comes from value steps
between facets, never from a gradient.

## Output contract

- Exactly one `<svg>` element, in a single ```svg fenced block, nothing before
  or after it. No commentary, no alternatives.
- `width="{{SIZE}}" height="{{SIZE}}" viewBox="0 0 {{SIZE}} {{SIZE}}"`.
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
