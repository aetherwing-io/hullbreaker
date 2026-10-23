/* ====================== RENDER BUDGET (pure) ====================== */
/* Drawing-buffer policy without Three.js, the DOM, or browser globals. The
   renderer wrapper in src/render/scene.js supplies the live viewport; this
   module exists so the hard ceiling can be proved deterministically instead
   of inferred from a screenshot or a particular GPU. */

export const RENDER_COMPACT_THRESHOLD = 600;
export const RENDER_PIXEL_BUDGET = Object.freeze({
  compact: 2_000_000,
  desktop: 6_600_000,
});

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function renderPixelBudget(width, height) {
  const w = positiveFinite(width);
  const h = positiveFinite(height);
  return Math.min(w, h) < RENDER_COMPACT_THRESHOLD
    ? RENDER_PIXEL_BUDGET.compact
    : RENDER_PIXEL_BUDGET.desktop;
}

export function resolveRenderPixelRatio(dpr, width, height, budgeted = true) {
  const w = positiveFinite(width);
  const h = positiveFinite(height);
  const scale = positiveFinite(dpr);
  const compact = Math.min(w, h) < RENDER_COMPACT_THRESHOLD;
  const supersample = compact ? 1.10 : 1.25;
  const cap = compact ? 2.20 : 2.25;
  const base = Math.min(Math.max(1, scale), 2);
  const target = Math.min(Math.max(1, scale) * supersample, cap);
  const budgetRatio = Math.sqrt(renderPixelBudget(w, h) / (w * h));

  // The A/B escape hatch preserves the exact former ordering: native DPR sat
  // outside the budget clamp and could therefore exceed the stated ceiling.
  if (!budgeted) return Math.max(base, Math.min(target, budgetRatio));

  // Production is a real hard cap. On ordinary desktop/portrait viewports the
  // authored supersample target wins unchanged. Only a backing store whose
  // area would exceed the budget steps down, including below 1x on an
  // exceptionally large CSS display when that is the only honest ceiling.
  return Math.min(target, budgetRatio);
}

/* ================= T-123: THE CRISP PATH'S DEVICE GRID =================
   decisions.md entry 27 (integrator call): sprites land on the device pixel
   grid. resolveRenderPixelRatio above never could: it SUPERSAMPLES (1.25x on
   desktop, 1.1x on compact) and CAPS (2.2x compact), so the backing store is
   almost never css x devicePixelRatio and the browser resamples the whole
   canvas — measured by the T-109 spike as a 1600x900 canvas shrunk by 0.8 on
   a 1280x720 desktop, and a 2.2x canvas stretched by 1.36 on a DPR-3 iPhone.
   Every sprite texel was smeared over 1.25 or 1.36 device pixels.

   The crisp policy draws at the DEVICE ratio itself, so the backing store is
   exactly css x dpr and the compositor scale is 1. When that backing store
   would exceed its pixel budget, it steps down by a whole number k (dpr/2,
   dpr/3, ...) so the compositor upscale is exactly k; src/render/scene.js
   marks the canvas `image-rendering: pixelated`, which makes that upscale
   nearest-neighbour, and every sprite texel then covers a k x k block of
   device pixels — still on the device grid, never a fractional smear.

   COST (fill, drawing-buffer pixels; frame cost is measured and reported in
   reports/tasks/T-123/build.md, not inferred here):
     1280x720 @1    today 1.25x = 1.44M   crisp 1.0x = 0.92M  (0.64x)
     1440x900 @2    today 2.25x = 6.56M   crisp 2.0x = 5.18M  (0.79x)
      844x390 @2    today 2.20x = 1.59M   crisp 2.0x = 1.32M  (0.83x)
      844x390 @3    today 2.20x = 1.59M   crisp 3.0x = 2.96M  (1.86x)
   The budgets below are therefore raised from the legacy ones just far
   enough for full device resolution on a DPR-3 phone in either orientation
   (932x430 @3 = 3.61M) and on a 200% 1080p desktop (1920x1080 @2 = 8.29M).
   Past them the integer step-down applies. The DPR-3 phone is the one
   device this policy makes MORE expensive; it is the operator's device class
   (entry 20) and this host has no GPU to measure it on, so the packet asks
   the operator to compare it against ?crispscale=half (k = 2) on the phone. */

export const CRISP_RENDER_PIXEL_BUDGET = Object.freeze({
  compact: 3_700_000,
  desktop: 8_300_000,
});
export const CRISP_MAX_UPSCALE = 8;

export function crispPixelBudget(width, height) {
  const w = positiveFinite(width);
  const h = positiveFinite(height);
  return Math.min(w, h) < RENDER_COMPACT_THRESHOLD
    ? CRISP_RENDER_PIXEL_BUDGET.compact
    : CRISP_RENDER_PIXEL_BUDGET.desktop;
}

/* -> { ratio, upscale, pixels, budget }. `ratio` is the renderer pixel ratio
   (backing px per css px); `upscale` is the whole number the compositor then
   scales the canvas by to reach device pixels (1 = no resample at all).
   `minUpscale` (>= 1) lets a caller ask for a coarser step on purpose — the
   ?crispscale=half A/B and the opt-in adaptive ladder — without leaving the
   integer grid. */
export function resolveCrispPixelRatio(dpr, width, height, minUpscale = 1, out = {}) {
  const w = positiveFinite(width);
  const h = positiveFinite(height);
  const d = positiveFinite(dpr);
  const budget = crispPixelBudget(w, h);
  let k = Math.max(1, Math.min(CRISP_MAX_UPSCALE, Math.floor(positiveFinite(minUpscale))));
  while (k < CRISP_MAX_UPSCALE && w * h * (d / k) * (d / k) > budget) k++;
  out.ratio = d / k;
  out.upscale = k;
  out.pixels = w * h * out.ratio * out.ratio;
  out.budget = budget;
  return out;
}

/* What the browser will do with a canvas: three.js sizes the backing store
   as floor(css x ratio) (WebGLRenderer.setSize), and the compositor maps that
   onto css x dpr device pixels. A scale of exactly 1 is "no resample"; an
   integer scale under `image-rendering: pixelated` is a lossless pixel
   replication; anything else is a filter smearing every texel. */
export function canvasCompositorScale(cssWidth, cssHeight, ratio, dpr, out = {}) {
  const cw = positiveFinite(cssWidth), ch = positiveFinite(cssHeight);
  out.backingWidth = Math.floor(cw * ratio);
  out.backingHeight = Math.floor(ch * ratio);
  out.deviceWidth = cw * positiveFinite(dpr);
  out.deviceHeight = ch * positiveFinite(dpr);
  out.scaleX = out.deviceWidth / Math.max(1, out.backingWidth);
  out.scaleY = out.deviceHeight / Math.max(1, out.backingHeight);
  const frac = (v) => Math.abs(v - Math.round(v));
  out.noResample = Math.abs(out.scaleX - 1) < 1e-9 && Math.abs(out.scaleY - 1) < 1e-9;
  out.integerUpscale = frac(out.scaleX) < 1e-9 && frac(out.scaleY) < 1e-9 &&
    Math.round(out.scaleX) >= 1 && Math.round(out.scaleX) === Math.round(out.scaleY);
  return out;
}
