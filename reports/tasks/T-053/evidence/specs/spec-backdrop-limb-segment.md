You are writing a single JavaScript module that PAINTS one game asset for
HULLBREAKER, a Contra-style 2.5D run-and-gun. Return **one fenced ```js block
and nothing else**. The module is run in a headless Chrome against a 2D canvas
and the resulting PNG is the asset.

## What to paint

A distant parallax backdrop plate: one colossal armoured limb of the Meridian crossing the frame diagonally from lower left to upper right, seen through kilometres of teal fog. Banded armour collars every few segments with dark recessed joints between them, cable and tendon bundles slung underneath, a service ladder and a small hatch on the nearest collar as the human-scale mark, and a sparse row of lit windows. ATMOSPHERIC PERSPECTIVE IS THE POINT: the far end of the limb has lost its darks and its saturation and is nearly dissolved into the fog, the near end keeps contrast and a trace of warm rust in its armour, and the transition is continuous and dithered so it does not band. Behind it, open teal haze with the faintest silhouettes of more anatomy, lower contrast still. Painted, not flat: grain and blotch across the plating, streaks running lengthwise along the limb, soft occlusion where every collar meets the barrel and where the cables cross behind it. WHAT TO FIX FROM THE PREVIOUS VERSION: flat teal polygons with hard edges and a white background - it looked like a vector diagram of a limb, not a limb in fog. This plate is drawn at 1024x512 and shown on screen at almost exactly that size, so detail here is real detail the player sees.

Asset id `backdrop-limb-segment`, category `backdrops`, canvas 1024x512 pixels, seed 803450.

## The world it has to belong to

The player, RIG, is a human-scale salvage marine climbing the exterior skin and
interior cavities of the *Meridian* — a continent-sized machine-creature. The
game renders low-poly geometry in heavy teal fog. Assets must belong to that
world: chunky industrial anatomy — armour plates, ribs, scutes, vents, seams,
tendon machinery — worn by weather and work.

Reference boards are attached: docs/concept-art/13-human-scale-monster-climb-grammar.png, docs/concept-art/10-creature-lattice-chaos.png. **Match their surface quality, not
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

This asset occupies 60 x 30 world tiles. The shipped default camera (FAR, per docs/decisions.md entries 7 and 17) renders RIG — 1.7 tiles — at 3.7% of screen height, so on a 1280x800 screen this asset is about **1044.7 x 522.4 pixels**, next to a 30px-tall RIG. That is the only size that matters. Judge every decision there.

The canvas is 1024x512, about 1.0x the pixels this will occupy on screen, so any feature thinner than 2 canvas pixels vanishes when it is drawn.

Design the read at that size first. Value structure — where the darks and lights
sit — is what survives minification; grain and detail enrich it up close and must
never fight it. Three or four value steps carry the shape; noise lives *inside* a
step, not across two.

This asset does NOT tile: it is one plate, seen whole. Its edges may do whatever the
composition needs — vignette into the fog, run off the canvas, or stop at a silhouette.

## Palette — hard constraint, machine-checked

- **deep-teal** (atmosphere, environment, fog)
  anchor `#0e5f6c`, legal range: hue 200-240 in CIELCh
- **rust-orange** (metal, structure, armour)
  anchor `#9b5c31`, legal range: hue 48-78 in CIELCh
- **warm-white** (muzzle light, player fire, gold trim)
  anchor `#ffe79b`, legal range: hue 78-100 in CIELCh
- **ink** (darkest neutral, glyph strokes, void)
  anchor `#14181e`, legal range: any hue below chroma 12 (a grey/ink tone)
- **haze** (mid neutral, fog, receding structure)
  anchor `#46525f`, legal range: any hue below chroma 12 (a grey/ink tone)
- **hull** (light neutral, deck surfaces, RIG)
  anchor `#767c85`, legal range: any hue below chroma 12 (a grey/ink tone)

Anchors are one usable color per role, not the only one: any shade or tint that keeps the same hue passes. 5 chromatic roles plus a neutral axis, eight total — DESIGN's whole palette budget.

Roles allowed for this asset: deep-teal, haze, ink, hull, rust-orange, warm-white.

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
  id: 'backdrop-limb-segment',
  size: { w: 1024, h: 512 },
  seed: 803450,
  roles: ['<the role ids you actually used>'],
};

export function render(ctx, env) {
  // ctx: a CanvasRenderingContext2D, 1024x512, cleared to transparent.
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
