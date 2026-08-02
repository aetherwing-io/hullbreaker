// smoke-swatch.recipe.js — the fixture that proves the raster path works.
//
// Not an asset: nothing in assets/manifest.json points at it and nothing loads
// it. It exists so `node tools/assets/render.mjs` can be exercised end to end
// (scan -> browser -> canvas -> PNG -> palette read-back -> two-render
// determinism proof) without spending a codex call, and so the recipe contract
// has one worked example checked into the tree.
//
// It is also the shape a generated recipe should have: layers, not shapes.
// Base gradient, fbm grain, a panel gap with its own ambient occlusion, edge
// wear, one accent — every value derived from env, no literal outside the
// palette, no randomness that is not seeded.

export const meta = {
  id: 'smoke-swatch',
  size: { w: 64, h: 64 },
  seed: 20530001,
  roles: ['rust-orange', 'ink', 'hull'],
};

export function render(ctx, env) {
  const { width: W, height: H, PALETTE, mix, shade, hexToRgb, fbm, band, clamp } = env;

  const rust = PALETTE['rust-orange'];
  const lit = shade(rust, 0.28);
  const dark = mix(rust, PALETTE.ink, 0.55);
  const litRgb = hexToRgb(lit), darkRgb = hexToRgb(dark);

  // 1. Painted base: a lit-to-shadow ramp with grain on top of it, per pixel.
  env.field((x, y, u, v) => {
    const grain = fbm(u * 6, v * 6, { octaves: 4, period: 6 });
    const ramp = clamp(0.75 - v * 0.5 + (grain - 0.5) * 0.35, 0, 1);
    return [
      darkRgb.r + (litRgb.r - darkRgb.r) * ramp,
      darkRgb.g + (litRgb.g - darkRgb.g) * ramp,
      darkRgb.b + (litRgb.b - darkRgb.b) * ramp,
      255,
    ];
  });

  // 2. A panel gap, and the occlusion that sells it as a gap rather than a line.
  const gapY = Math.round(H * 0.58);
  env.field((x, y) => {
    const d = Math.abs(y - gapY);
    if (d > 5) return null;
    const ink = hexToRgb(PALETTE.ink);
    const t = d <= 1 ? 1 : 0.55 * (1 - band(1, 5, d));
    return [ink.r, ink.g, ink.b, Math.round(255 * t)];
  }, { blend: 'over' });

  // 3. Edge wear along the lit side of the gap: hull grey where paint is gone.
  const wear = env.stream('wear');
  ctx.fillStyle = shade(PALETTE.hull, 0.1);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(wear() * W);
    const w = 1 + Math.floor(wear() * 3);
    ctx.fillRect(x, gapY - 2 - Math.floor(wear() * 2), w, 1);
  }
}
