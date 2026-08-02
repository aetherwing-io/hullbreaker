<!--
  Spec template for `codex exec` in RASTER mode, filled in by tools/assets/gen.mjs
  (`--mode raster`). The vector template next to this one asks for an <svg>; this
  one asks for a PROGRAM that paints.

  Why: codex is a coding agent — images in, code out. Asked for an SVG it hand-
  places rectangles, and the result is flat clip-art next to painted concept
  boards. Asked for a canvas renderer it can reach for value noise, fbm,
  directional grunge, wear masks, gap occlusion and dithered haze, which is what
  the boards are actually made of — while the source stays text that diffs, the
  output stays deterministic and palette-checkable, and the repo gains no
  dependency.

  Placeholders (substituted before the spec is sent; the resolved copy is written
  to tools/assets/runs/spec-<id>.md as the prompt of record):

    {{ID}}          asset id, kebab-case        {{CATEGORY}}  glyphs | textures | sprites | ui | fx | backdrops
    {{BRIEF}}       what to paint, from --brief {{W}}/{{H}}   canvas pixel size (powers of two)
    {{SEED}}        meta.seed, from --seed      {{ROLES}}     allowed role ids, from --roles
    {{PALETTE}}     role table, generated from lib/palette.mjs
    {{BOARDS}}      attached reference boards   {{SCALE_NOTE}} the on-screen size this has to survive
    {{TILING}}      the seamless-repeat clause, or a note that this asset does not tile

  The palette table is generated from lib/palette.mjs so the spec and the gate
  cannot drift apart. Never hard-code hex values into the rules below.
-->
You are writing a single JavaScript module that PAINTS one game asset for
HULLBREAKER, a Contra-style 2.5D run-and-gun. Return **one fenced ```js block
and nothing else**. The module is run in a headless Chrome against a 2D canvas
and the resulting PNG is the asset.

## What to paint

{{BRIEF}}

Asset id `{{ID}}`, category `{{CATEGORY}}`, canvas {{W}}x{{H}} pixels, seed {{SEED}}.

## The world it has to belong to

The player, RIG, is a human-scale salvage marine climbing the exterior skin and
interior cavities of the *Meridian* — a continent-sized machine-creature. The
game renders low-poly geometry in heavy teal fog. Assets must belong to that
world: chunky industrial anatomy — armour plates, ribs, scutes, vents, seams,
tendon machinery — worn by weather and work.

Reference boards are attached: {{BOARDS}}. **Match their surface quality, not
just their subject.** Look at what the paint is actually doing on those plates:

- the metal is never one flat fill — there is grain, blotch and streak inside
  every panel, and the variation runs *along* the plate, not as random static;
- panel edges carry a lit chamfer on one side and a dark occlusion line on the
  other, and the gap between two plates is darker than either plate;
- wear collects where a shape changes direction: corners, bolt heads, the lip of
  a hatch, the leading edge of a rib;
- distance eats contrast and saturation — anything far away drifts toward the
  teal fog and loses its darks first;
- light comes from one direction and everything obeys it.

Flat clip-art is the failure mode to avoid: hard-edged rectangles of pure fill
with nothing happening inside them. That is what the previous generation of this
asset looked like and it is why this spec exists.

## Scale — the constraint that fails most assets

{{SCALE_NOTE}}

Design the read at that size first. Value structure — where the darks and lights
sit — is what survives minification; grain and detail enrich it up close and must
never fight it. Three or four value steps carry the shape; noise lives *inside* a
step, not across two.

{{TILING}}

## Palette — hard constraint, machine-checked

{{PALETTE}}

Roles allowed for this asset: {{ROLES}}.

The gate (`tools/assets/check.mjs`) reads the rendered pixels and asks where each
one came from:

- a hue inside a role band, or a color with chroma below the neutral floor —
  **legal**, and that should be nearly every pixel;
- a hue between two bands that lies on the straight sRGB line between two colors
  this image actually uses in quantity — **legal**: interpolating between two
  palette tokens is a blend, not a new color;
- anything else — **the asset comes back**. A third hue fails even at a fraction
  of a percent of the image.

What that means in practice: shade and tint freely *within* a role (a lit facet
and a shadow facet of the same metal is exactly what you want), and when you need
to move between two roles, take the fog route — desaturate toward the neutral
axis and come back up, the way distance actually works — rather than sliding
saturated rust straight into saturated teal through the greens in between.
`env.mix(a, b, t)` blends in sRGB; `env.shade(hex, k)` lightens (k>0) or darkens
(k<0) while holding hue.

## The module contract

```js
export const meta = {
  id: '{{ID}}',
  size: { w: {{W}}, h: {{H}} },
  seed: {{SEED}},
  roles: ['<the role ids you actually used>'],
};

export function render(ctx, env) {
  // ctx: a CanvasRenderingContext2D, {{W}}x{{H}}, cleared to transparent.
  // env: the toolkit below. Paint the asset. Return nothing.
}
```

Hard requirements, all machine-checked before the module is ever run:

- **No `import` statements.** The module is self-contained; everything you need
  is on `env`.
- **No `Math.random`, no `Date`, no `performance.now`, no `fetch`, no
  `document`/`window`, no external images.** `Math.random` is deleted from the
  page — calling it throws. Randomness comes from `env.rng()` /
  `env.stream(name)` / `env.noise()` / `env.fbm()`, all seeded from `meta.seed`.
  The renderer runs your module **twice** and requires byte-identical PNGs.
- Plain ES2022. No TypeScript, no JSX, no comments claiming to be code.
- Write it to run in well under a second: a per-pixel pass over the canvas with
  four or five octaves of noise is fine; a hundred is not.

## The toolkit on `env`

```
env.width, env.height, env.seed          canvas size and seed

env.rng()                                seeded float in [0,1)
env.stream(name)                         an independent seeded rng, so adding a
                                         layer does not reshuffle earlier ones

env.noise(x, y, {period, seed})          periodic value noise -> [0,1]
env.fbm(x, y, {octaves, gain, lacunarity, period, seed})   fractal sum -> [0,1]
env.ridge(x, y, opts)                    folded fbm — erosion, scratches, cracks

env.field(fn, {blend})                   per-pixel painting. fn(x, y, u, v) returns
                                         [r,g,b] or [r,g,b,a] (0-255), or null to
                                         leave the pixel alone. u,v are 0..1.
                                         blend: 'replace' (default) or 'over'
                                         (composite over what is already there).

env.mix(hexA, hexB, t)  -> hex           sRGB interpolation
env.shade(hex, k)       -> hex           k>0 toward white, k<0 toward black; hue held
env.rgba(hex, alpha)    -> 'rgba(...)'   for ctx.fillStyle / strokeStyle
env.hexToRgb(hex) -> {r,g,b,a}           env.rgbToHex({r,g,b}) -> '#rrggbb'
env.PALETTE['rust-orange'] etc.          the role anchors, by id
env.clamp(v,lo,hi)  env.lerp(a,b,t)  env.smoothstep(t)  env.band(a,b,t)
```

`ctx` is an ordinary 2D context: `fillRect`, paths, `clip`, `globalAlpha`,
`createLinearGradient`, `globalCompositeOperation` all work. Use `env.field` for
anything that varies per pixel (base surfaces, grain, haze, gradients with noise
in them) and `ctx` for hard-edged structure (plates, bolts, ribs, hatches).

## How to build it — layers, not shapes

A painted surface is a stack. Work in this order and the result stops looking
like clip-art:

1. **Base field.** `env.field` across the whole canvas: the role's mid tone,
   modulated by a low-frequency fbm so no two square inches are the same value,
   plus the large-scale lighting ramp (one light direction).
2. **Structure.** The plates, ribs, seams, hatches, louvres — drawn with `ctx`
   paths so their silhouette is crisp. Give every edge its pair: a lit chamfer on
   the light side, a dark line on the other.
3. **Occlusion.** Darken *into* every gap and under every overhang with a soft
   falloff (a few pixels of `env.field(..., {blend:'over'})` with an ink alpha
   ramp). This is the single biggest difference between a painted plate and a
   filled rectangle.
4. **Wear.** Chips, scratches, streaks and rust bleeds where a shape changes
   direction, driven by noise so they cluster instead of sprinkling evenly. Keep
   them subordinate: they modulate a value step, they never introduce a new one.
5. **Accent.** One small area of the brightest, most saturated color, reading as
   the thing's intent — a lamp, a warning strip, a core, a muzzle.
6. **Atmosphere.** If the asset is distant, a final `blend:'over'` pass pulling
   the whole thing toward the fog with distance, strongest at the far end.
   Dither the fade slightly (a per-pixel noise term of a value or two) so it does
   not band.

## Output contract

- Exactly one fenced ```js block, nothing before or after it. No commentary, no
  alternatives, no second version.
- The module must export `meta` and `render` exactly as specified above.
- `meta.roles` lists the role ids you actually used.
- Every color literal is `#rrggbb` from a role, or derived from `env.PALETTE`
  with `env.mix` / `env.shade`. No CSS named colors, no `hsl()`.
- The canvas starts fully transparent. Paint every pixel you want opaque; leave
  the rest alone if the asset is a cutout rather than a full plate.
