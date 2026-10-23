/* ===================== CRISP SPRITE PATH (pure) ===================== */
/* The arithmetic behind decisions.md entry 27's first integrator call: every
   atlas-drawn actor is drawn unlit at full gain, nearest-neighbour, mip-free,
   on the device pixel grid, at a density chosen per device. src/render/
   crisp-sprites.js is the GPU half; everything here is plain numbers so
   tools/pathcheck.mjs can prove it without a browser, and so a falsifier (a
   half-pixel offset, a 2.2x cap, a lit gain) can be shown to turn it red.

   The T-109 A2 spike (reports/tasks/T-109/spike.md on task/T-109) measured
   why this exists: the shipped path drew RIG through a lit, mipmapped,
   tone-mapped material (per-channel gain 0.81/0.76/0.62 against his own
   painting) and resampled him twice (a 1.25x canvas the browser shrank by
   0.8 on desktop; a 2.2x canvas Safari stretched by 1.36 on a DPR-3 iPhone).
   Its column A ("today, crisp") is the target look for today's art: the
   painting composed at several times the device density, area-reduced ONCE,
   alpha cut at 50%, shown 1 texel = 1 device pixel.

   Four pieces, one per stage of that pipeline:
     1. device-grid snapping   - where a sprite's tile lands, in device px;
     2. the tile reduction     - the one area resample, in the encoded space
                                 the spike's tool averaged in;
     3. the drawn-quad audit   - is a quad's left/top edge on the grid, and is
                                 its texel-to-pixel scale an integer?
     4. the exact tone inverse - the value whose ACES-mapped display IS the
                                 texel, so "unlit" survives the composer's
                                 tone map; capped at the bloom threshold so a
                                 sprite never acquires a glow it was not
                                 painted with.
   No THREE, no DOM, no clock: layer purity holds by construction.          */

/* ---------------------------- 0. the flag --------------------------- */

/* ?art= (decisions.md entry 27, integrator call: "the crisp path and the new
   RIG ship ON by default once gated, and ?art=legacy restores today's path
   and atlases for A/B"). Absent or junk is the crisp path; only the exact
   word `legacy` restores the pre-T-123 renderer — lit materials, mipmapped
   textures, the supersampled/capped pixel ratio — byte for byte.
   ?crispscale=half asks the crisp path for the next whole-number step down
   (dpr/2 with a nearest 2x compositor upscale): the A/B that lets the
   operator price full device resolution on his own phone. */
export function resolveArtMode(raw) {
  return raw === 'legacy' ? 'legacy' : 'crisp';
}

export function resolveCrispScale(raw) {
  return raw === 'half' || raw === '2' ? 2 : 1;
}

/* ---------------------------- 1. the grid --------------------------- */

/* Device pixels are addressed from the top-left of the drawing buffer, with
   pixel i covering [i, i+1). A sprite's ANCHOR (its sim point, projected) is
   snapped to the nearest pixel EDGE — the same convention the spike's
   compose step used to paste column A (the sim point at a pixel corner) — so
   the whole figure moves in whole-pixel steps and its silhouette never
   crawls as the actor's sub-pixel position changes. */
export function snapAnchor(px, py, out) {
  const x = Math.round(px), y = Math.round(py);
  out.x = x;
  out.y = y;
  out.dx = x - px;                 // shift applied to the drawn figure, device px
  out.dy = y - py;
  return out;
}

/* The integer device-pixel rectangle a figure occupies once shifted by its
   snap: the bbox [minX, maxX] x [minY, maxY] (device px, top-left origin)
   moved by (dx, dy), grown outward to whole pixels and padded by `margin`.
   Every edge is an integer by construction — that is the whole contract. */
export function crispTileRect(minX, minY, maxX, maxY, dx, dy, margin, out) {
  const m = Math.max(0, Math.floor(margin || 0));
  const x0 = Math.floor(minX + dx) - m;
  const y0 = Math.floor(minY + dy) - m;
  const x1 = Math.ceil(maxX + dx) + m;
  const y1 = Math.ceil(maxY + dy) + m;
  out.x = x0;
  out.y = y0;
  out.w = Math.max(1, x1 - x0);
  out.h = Math.max(1, y1 - y0);
  return out;
}

/* How many device pixels of supersampling the one reduction needs. The tile
   is composed at S x the device density and box-reduced S:1, so S should at
   least cover the art's own minification (texels per device pixel) — the
   spike composed at 8x — and stay bounded so a big actor on a dense screen
   cannot ask for an unbounded render target. */
export const CRISP_SUPERSAMPLE = Object.freeze({ min: 2, max: 8 });

export function crispSupersample(texelsPerTile, devicePxPerTile,
  lo = CRISP_SUPERSAMPLE.min, hi = CRISP_SUPERSAMPLE.max) {
  const t = Number.isFinite(texelsPerTile) && texelsPerTile > 0 ? texelsPerTile : 1;
  const d = Number.isFinite(devicePxPerTile) && devicePxPerTile > 0 ? devicePxPerTile : 1;
  return Math.max(lo, Math.min(hi, Math.ceil(t / d)));
}

/* --------------------------- 2. the reduction ------------------------ */

/* The sRGB transfer pair, local so this module stands alone (identical to
   src/pure/tonemap.js's; pathcheck asserts they agree). */
export function srgbEncode(l) {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}
export function srgbDecode(s) {
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/* One output texel of the reduction, as the GPU computes it: `samples` is a
   flat list of S*S premultiplied LINEAR rgba quadruples (what normal alpha
   blending onto a cleared target leaves behind). Each is un-premultiplied,
   sRGB-encoded and re-premultiplied, the block is box-averaged, and the
   result is cut at 50% coverage — Pillow's RGBa BOX resize plus the alpha
   cut, i.e. exactly how the spike reduced column A. Returns linear rgb and a
   binary alpha. */
export const CRISP_ALPHA_CUT = 0.5;

export function reduceBlock(samples, out) {
  let r = 0, g = 0, b = 0, a = 0;
  const n = Math.floor(samples.length / 4);
  for (let i = 0; i < n; i++) {
    const sa = samples[i * 4 + 3];
    if (!(sa > 0)) continue;
    r += srgbEncode(Math.max(0, samples[i * 4] / sa)) * sa;
    g += srgbEncode(Math.max(0, samples[i * 4 + 1] / sa)) * sa;
    b += srgbEncode(Math.max(0, samples[i * 4 + 2] / sa)) * sa;
    a += sa;
  }
  const coverage = n > 0 ? a / n : 0;
  const keep = coverage >= CRISP_ALPHA_CUT;
  out.r = keep ? srgbDecode(r / a) : 0;
  out.g = keep ? srgbDecode(g / a) : 0;
  out.b = keep ? srgbDecode(b / a) : 0;
  out.a = keep ? 1 : 0;
  out.coverage = coverage;
  return out;
}

/* ------------------------- 3. the quad audit ------------------------- */

/* The acceptance test for one drawn sprite quad: its projected corners
   (device px, top-left origin, TL, TR, BL, BR as x,y pairs) and the size of
   the texel grid it shows. A crisp quad is axis-aligned, its left/top edges
   are integers, and its texel-to-pixel scale is an integer on both axes.
   `eps` is the tolerance a float projection may carry (default 1e-3 px, far
   below the half pixel the falsifier injects). */
export const CRISP_GRID_EPS = 1e-3;

export function quadGridDeviation(c, texW, texH, out, eps = CRISP_GRID_EPS) {
  const tlx = c[0], tly = c[1], trx = c[2], try_ = c[3];
  const blx = c[4], bly = c[5], brx = c[6], bry = c[7];
  const frac = (v) => Math.abs(v - Math.round(v));
  const skew = Math.max(Math.abs(tly - try_), Math.abs(tlx - blx),
    Math.abs(trx - brx), Math.abs(bly - bry));
  const edge = Math.max(frac(tlx), frac(tly));
  const w = trx - tlx, h = bly - tly;
  const sx = texW > 0 ? w / texW : 0;
  const sy = texH > 0 ? h / texH : 0;
  const scaleDev = Math.max(frac(sx), frac(sy));
  out.skewPx = skew;
  out.edgePx = edge;
  out.scaleX = sx;
  out.scaleY = sy;
  out.scaleDev = scaleDev;
  out.axisAligned = skew <= eps;
  out.onGrid = edge <= eps;
  out.integerScale = scaleDev <= eps && Math.round(sx) >= 1 && Math.round(sy) >= 1;
  out.crisp = out.axisAligned && out.onGrid && out.integerScale;
  return out;
}

/* ------------------------ 4. the exact tone inverse ------------------- */

/* three.js 0.170.0's ACESFilmicToneMapping (ShaderChunk
   tonemapping_pars_fragment), matrices written row-major — the same
   transcription src/pure/tonemap.js carries; pathcheck asserts the inverse
   below against THAT module's forward curve, so a drift in either is red. */
export const ACES_INPUT = Object.freeze([
  Object.freeze([0.59719, 0.35458, 0.04823]),
  Object.freeze([0.07600, 0.90834, 0.01566]),
  Object.freeze([0.02840, 0.13383, 0.83777]),
]);
export const ACES_OUTPUT = Object.freeze([
  Object.freeze([1.60475, -0.53108, -0.07367]),
  Object.freeze([-0.10208, 1.10813, -0.00605]),
  Object.freeze([-0.00327, -0.07276, 1.07602]),
]);

function invert3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return Object.freeze([
    Object.freeze([A / det, -(b * i - c * h) / det, (b * f - c * e) / det]),
    Object.freeze([B / det, (a * i - c * g) / det, -(a * f - c * d) / det]),
    Object.freeze([C / det, -(a * h - b * g) / det, (a * e - b * d) / det]),
  ]);
}

/* ACES_OUTPUT^-1 has non-negative entries and unit row sums, so every
   display colour in [0,1]^3 maps into [0,1]^3 — inside the RRT/ODT fit's
   invertible range [fit(0), 1/0.983729). The inverse therefore EXISTS for
   every texel; it may need negative linear light on a saturated colour,
   which a half-float scene target stores and the forward curve undoes. */
export const ACES_INPUT_INVERSE = invert3(ACES_INPUT);
export const ACES_OUTPUT_INVERSE = invert3(ACES_OUTPUT);

// The positive root of fit(v) = w, fit(v) = (v^2 + 0.0245786 v - 0.000090537)
// / (0.983729 v^2 + 0.4329510 v + 0.238081), monotonic on v >= 0.
export function rrtOdtFitInverse(w) {
  const A = 1 - 0.983729 * w;
  const B = 0.0245786 - 0.4329510 * w;
  const C = -(0.000090537 + 0.238081 * w);
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}

const _w = [0, 0, 0], _v = [0, 0, 0];

function mul3(m, v, out) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0][0] * x + m[0][1] * y + m[0][2] * z;
  out[1] = m[1][0] * x + m[1][1] * y + m[1][2] * z;
  out[2] = m[2][0] * x + m[2][1] * y + m[2][2] * z;
  return out;
}

/* The linear scene value whose ACES display (still linear-encoded, i.e.
   before the sRGB transfer) is exactly `target`, at `exposure`. Analytic,
   not bisected: unlike src/pure/tonemap.js's inverseAcesFilmic (which is
   restricted to non-negative inputs for the sky/haze tokens and so lands
   "closest reachable"), this one is exact for every display colour. */
export function inverseAcesExact(target, exposure, out) {
  for (let i = 0; i < 3; i++) _w[i] = Math.min(1, Math.max(0, target[i]));
  mul3(ACES_OUTPUT_INVERSE, _w, _v);
  for (let i = 0; i < 3; i++) _v[i] = rrtOdtFitInverse(Math.min(1, Math.max(0, _v[i])));
  mul3(ACES_INPUT_INVERSE, _v, out);
  const k = 0.6 / (exposure > 0 ? exposure : 1);
  for (let i = 0; i < 3; i++) out[i] *= k;
  return out;
}

/* The bloom ceiling. UnrealBloomPass's high pass (three r170
   LuminosityHighPassShader) lets through any scene pixel whose luminance()
   beats its threshold, and passes its WHOLE colour, so the exact inverse of a
   near-white texel (grey 255 -> 11.4 linear at the shipped exposure) would
   grow a halo the painting never had. A crisp sprite's scene value is
   therefore scaled down, hue kept, to just under the threshold when it would
   cross it: exact for every texel below the line (neutral grey ~228 at
   exposure 1.35 / threshold 0.78), held at the brightest non-blooming value
   above it. luminance() is three's ColorManagement working-space weights —
   Rec.709 for linear sRGB, emitted to 4 decimals — NOT Rec.601: with 0.299 /
   0.587 / 0.114 a saturated green tell glow passed under this ceiling and
   still bloomed (caught by the grid probe on a diving wasp). */
export const BLOOM_LUMA = Object.freeze([0.2126, 0.7152, 0.0722]);
export const CRISP_BLOOM_MARGIN = 0.995;

export function bloomSafeScale(x, threshold, margin = CRISP_BLOOM_MARGIN) {
  const l = BLOOM_LUMA[0] * x[0] + BLOOM_LUMA[1] * x[1] + BLOOM_LUMA[2] * x[2];
  const cap = threshold * margin;
  return l > cap && l > 0 ? cap / l : 1;
}
