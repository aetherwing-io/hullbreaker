// procgen.mjs — the toolkit a raster RECIPE is handed, and the reason recipes
// can be short.
//
// A recipe is a self-contained ES module that paints one asset into a 2D canvas
// (see tools/assets/render.mjs). It imports nothing: everything it needs arrives
// in the `env` object this file builds. That is deliberate three ways —
//
//   1. DETERMINISM. Every random number in an asset comes from `env.rng` /
//      `env.noise` / `env.fbm`, all seeded from `meta.seed`. A recipe that
//      reached for Math.random would make its own PNG unreproducible, so the
//      renderer removes Math.random from the page entirely and the recipe scan
//      rejects it statically. Same seed + same recipe = same bytes, and
//      render.mjs proves it on every run by rendering twice.
//   2. SEAMS. Tileable value noise is fiddly and easy to get subtly wrong; a
//      generator asked to write its own gets it wrong in a way that only shows
//      up as a seam in a 4x4 repeat. `noise`/`fbm` here are periodic on an
//      integer lattice, so sampling at (x/width*P, y/height*P) with whole P
//      wraps exactly at the canvas edge.
//   3. ZERO COUPLING. The recipe has no import specifier in it, so an asset
//      file never pins a path inside tools/. Move this file and no asset breaks.
//
// Browser- and Node-safe: no imports beyond the palette table (itself
// dependency-free), no DOM access except through the ctx it is given.

import { ROLES } from './palette.mjs';

/* ------------------------------------------------------------------ *
 * Scalars
 * ------------------------------------------------------------------ */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
/** 0 below `a`, 1 above `b`, smooth between — the ramp every mask here uses. */
export const band = (a, b, t) => smoothstep(clamp((t - a) / (b - a || 1e-6), 0, 1));

/* ------------------------------------------------------------------ *
 * Seeded randomness
 * ------------------------------------------------------------------ */

/** mulberry32 — 32-bit state, uniform enough for texture work, one line to audit. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string — turns a layer name into an independent stream. */
export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Hash of an integer lattice cell -> [0,1). The value-noise kernel. */
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Periodic value noise in [0,1].
 * `period` is the integer lattice period: sample at (x/width*P, y/height*P) and
 * the field is seamless across the canvas edge. Non-integer periods still work,
 * they just do not wrap.
 */
export function valueNoise(x, y, { period = 64, seed = 0 } = {}) {
  const p = Math.max(1, Math.round(period));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smoothstep(x - x0), fy = smoothstep(y - y0);
  const wrap = (v) => ((v % p) + p) % p;
  const xa = wrap(x0), xb = wrap(x0 + 1), ya = wrap(y0), yb = wrap(y0 + 1);
  const n00 = hash2(xa, ya, seed), n10 = hash2(xb, ya, seed);
  const n01 = hash2(xa, yb, seed), n11 = hash2(xb, yb, seed);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

/**
 * Fractal sum of `valueNoise`, normalised to [0,1].
 * Doubling frequency doubles the lattice period with it, so an fbm sampled the
 * seamless way stays seamless at every octave.
 */
export function fbm(x, y, { octaves = 4, gain = 0.5, lacunarity = 2, period = 64, seed = 0 } = {}) {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, { period: period * freq, seed: seed + o * 1013 });
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / (norm || 1);
}

/** fbm folded around 0.5 — the "scratched metal / erosion" variant. */
export function ridge(x, y, opts = {}) {
  return 1 - Math.abs(fbm(x, y, opts) * 2 - 1);
}

/* ------------------------------------------------------------------ *
 * Color — sRGB only, because that is the space the canvas composites in
 * and the space check.mjs reads back out of the PNG.
 * ------------------------------------------------------------------ */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Straight sRGB interpolation between two colors — what a canvas blend does. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b), k = clamp(t, 0, 1);
  return rgbToHex({ r: lerp(A.r, B.r, k), g: lerp(A.g, B.g, k), b: lerp(A.b, B.b, k) });
}

/**
 * Lighten (k>0) or darken (k<0) while holding hue: a shade/tint of one role,
 * which the palette rule explicitly allows. Toward white or toward black in
 * sRGB, so the hue angle barely moves and the role never changes.
 */
export function shade(hex, k) {
  const c = hexToRgb(hex);
  const t = clamp(Math.abs(k), 0, 1);
  const target = k >= 0 ? 255 : 0;
  return rgbToHex({ r: lerp(c.r, target, t), g: lerp(c.g, target, t), b: lerp(c.b, target, t) });
}

/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)', for ctx.fillStyle. */
export function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${clamp(alpha, 0, 1)})`;
}

/** Role anchors keyed by role id — the same table check.mjs enforces. */
export const PALETTE = Object.fromEntries(ROLES.map((r) => [r.id, r.anchor]));

/* ------------------------------------------------------------------ *
 * The env handed to render()
 * ------------------------------------------------------------------ */

/**
 * Per-pixel painting. `fn(x, y, u, v)` returns [r,g,b] or [r,g,b,a] (0-255);
 * returning null leaves that pixel untouched. u,v are 0..1 across the canvas.
 *
 * `blend: 'over'` composites the returned color over what is already on the
 * canvas (source-over, straight alpha) instead of replacing it, so a recipe can
 * lay a painted haze over hard-edged geometry it drew with path calls.
 */
function makeField(ctx, width, height) {
  return function field(fn, { blend = 'replace' } = {}) {
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;
    for (let y = 0; y < height; y++) {
      const u0 = y / height;
      for (let x = 0; x < width; x++) {
        const out = fn(x, y, x / width, u0);
        if (!out) continue;
        const i = (y * width + x) * 4;
        const a = out.length > 3 ? clamp(out[3], 0, 255) : 255;
        if (blend === 'over' && a < 255) {
          const sa = a / 255, da = d[i + 3] / 255;
          const oa = sa + da * (1 - sa);
          if (oa <= 0) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
          for (let c = 0; c < 3; c++) {
            d[i + c] = Math.round((out[c] * sa + d[i + c] * da * (1 - sa)) / oa);
          }
          d[i + 3] = Math.round(oa * 255);
        } else {
          d[i] = Math.round(clamp(out[0], 0, 255));
          d[i + 1] = Math.round(clamp(out[1], 0, 255));
          d[i + 2] = Math.round(clamp(out[2], 0, 255));
          d[i + 3] = Math.round(a);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  };
}

/**
 * Alpha-only pass: multiply every pixel's alpha by `fn(x, y, u, v)` (0..1).
 *
 * This exists because of a real defect. The first painted backdrops came back
 * as fully opaque rectangles with the fog baked in, where the plates they
 * replaced were 40-60% transparent cutouts — which broke the lane layering them
 * for parallax, since an opaque plate occludes every tier behind it. The cause
 * was not the route: it was that alpha had to be threaded by hand through every
 * layer of a 900-line recipe, and a generator does that inconsistently.
 *
 * With this, a recipe paints its subject normally and then states its silhouette
 * and its dissolve in one place:
 *
 *     env.mask((x, y, u, v) => env.band(0.85, 0.6, u));   // fade out to the right
 *
 * Returning 0 makes a pixel fully transparent; the RGB is left alone, so a
 * later pass can still read it. Note that a canvas quantizes low alpha (see
 * ALPHA_HUE_FLOOR in palette.mjs) — a dissolve wants a dither term of a level or
 * two so it does not band, not smaller alpha steps.
 */
function makeMask(ctx, width, height) {
  return function mask(fn) {
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;
    for (let y = 0; y < height; y++) {
      const v = y / height;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4 + 3;
        if (d[i] === 0) continue;
        const k = fn(x, y, x / width, v);
        if (k === null || k === undefined) continue;
        d[i] = Math.round(clamp(d[i] * clamp(k, 0, 1), 0, 255));
      }
    }
    ctx.putImageData(img, 0, 0);
  };
}

/**
 * Build the object a recipe's `render(ctx, env)` receives.
 * Everything on it is deterministic given `seed`.
 */
export function createEnv({ ctx, width, height, seed = 1 }) {
  const streams = new Map();
  const env = {
    width,
    height,
    seed,
    /** The default stream. Order-dependent: two recipes that call it a different number of times diverge, by design. */
    rng: mulberry32(seed),
    /** An independent named stream, so adding a layer cannot reshuffle the layers before it. */
    stream(name) {
      if (!streams.has(name)) streams.set(name, mulberry32((seed ^ hashString(String(name))) >>> 0));
      return streams.get(name);
    },
    noise: (x, y, opts) => valueNoise(x, y, { seed, ...opts }),
    fbm: (x, y, opts) => fbm(x, y, { seed, ...opts }),
    ridge: (x, y, opts) => ridge(x, y, { seed, ...opts }),
    field: makeField(ctx, width, height),
    mask: makeMask(ctx, width, height),
    clamp, lerp, smoothstep, band,
    mix, shade, rgba, hexToRgb, rgbToHex,
    PALETTE,
  };
  return env;
}
