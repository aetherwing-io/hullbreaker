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
