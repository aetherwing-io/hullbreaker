<!--
  Spec template for `codex exec`, filled in by tools/assets/gen.mjs.

  Placeholders (all substituted before the spec is sent, and the resolved copy is
  written to tools/assets/runs/spec-<id>.md so every generation has an auditable
  prompt of record):

    {{ID}}            asset id, kebab-case            {{CATEGORY}}   glyphs | textures | sprites | ui | fx | backdrops
    {{BRIEF}}         what to draw, from --brief      {{W}}/{{H}}    canvas pixel size (powers of two)
    {{VBW}}/{{VBH}}   viewBox units — the design grid {{ROLES}}      allowed role ids, from --roles
    {{PALETTE}}       role table, generated from lib/palette.mjs
    {{BOARDS}}        attached reference board files  {{SCALE_NOTE}} the on-screen size this has to survive

  The palette table is generated from lib/palette.mjs rather than written out
  here, so the spec a generator receives and the bands check.mjs enforces cannot
  drift apart. Edit the rules below; never hard-code hex values into them.
-->
You are drawing a single game asset for HULLBREAKER, a Contra-style 2.5D
run-and-gun. Return **one SVG file and nothing else**.

## What to draw

{{BRIEF}}

Asset id `{{ID}}`, category `{{CATEGORY}}`, canvas {{W}}x{{H}} pixels,
`viewBox="0 0 {{VBW}} {{VBH}}"`.

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

Work like someone authoring a small sprite, not like someone shrinking an
illustration:

1. **Silhouette first.** Someone should name the thing from its black outline
   alone. Break the outline deliberately — a spike, a barrel, a raised head —
   so it cannot be confused with a rectangle or a blob.
2. **Three or four value steps, no more.** One dark mass, one mid, one lit
   plane, plus the accent. Adjacent facets need a real value gap; two shades
   that differ slightly average into one flat area at this size.
3. **One accent, small.** The brightest, most saturated color appears in one
   place and reads as the thing's intent (an eye, a lamp, a muzzle, a core).
   Two competing accents halve the read.
4. **Contact and orientation.** It must be obvious which way it faces and where
   it meets the surface it stands on.

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
- `width="{{W}}" height="{{H}}" viewBox="0 0 {{VBW}} {{VBH}}"`.
- Colors as `#rrggbb` or `#rrggbbaa` literals only. No CSS named colors, no
  `hsl()`, no `var()` — the palette checker reads literals and treats anything
  it cannot parse as a failure.
- No `<text>` elements: rasterization must not depend on an installed font.
  Draw letterforms as rectangles or paths.
- No gradients, filters, masks, embedded raster images, external references, or
  `<script>`. Self-contained and flat.
- **Every fill fully opaque** unless the brief explicitly asks for an overlay.
  Never build value steps, fog or depth by stacking semi-transparent copies of a
  shape: the checker judges the pixel that comes out, and a stack of individually
  legal colors composites to a color nobody authored. Measured on a real
  generation: teal at 53% alpha over a neutral grey landed at hue 245 — outside
  every band — and failed the gate. If you want a step toward the fog, write the
  stepped color directly.
- Integer coordinates wherever the shape allows — crisp edges at power-of-two
  raster sizes. Diagonals are fine; they are what keeps a low-poly silhouette
  from reading as a box.
- Transparent background unless the brief says the asset owns its backdrop.
- Include a `<title>` and a short `<desc>` naming the roles used and the read
  the design is going for.
