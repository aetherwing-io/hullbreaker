/* ======================= ACTION VFX V2 SPEC ====================== */
/* Runtime-sized subset of the visually approved v2 atlas manifest.  This is
 * deliberately data, not a renderer switchboard: every record below is a
 * production-reviewed cell, its authored top-left UV rectangle, unwarped
 * aspect, pivot, readable screen envelope, and timing sentence.  The runtime
 * never parses JSON, crops pixels, or discovers a cell while a run is live. */

export const ACTION_VFX_ATLAS = Object.freeze({
  file: '../../assets/generated/vfx/action-vfx-v2/action-vfx-atlas-v2.png',
  canvas: Object.freeze([1024, 1024]),
  layout: Object.freeze([8, 8]),
  estimatedGpuBytes: 4 * 1024 * 1024,
  uvOrigin: 'top-left',
});

function component(id, uv, nativeAspect, pivot, minPx, maxPx,
  durationMs, peakMs, fadeStartMs) {
  return Object.freeze({
    id,
    uv: Object.freeze(uv),
    nativeAspect,
    pivot: Object.freeze(pivot),
    screenExtentPx: Object.freeze({ min: minPx, max: maxPx }),
    timing: Object.freeze({ durationMs, peakMs, fadeStartMs }),
    reviewStatus: 'production',
  });
}

export const ACTION_VFX_COMPONENTS = Object.freeze([
  // R — compact plate pins and displaced seam hardware.
  component('r-seam-punch', [0.128906, 0.011719, 0.245117, 0.113281],
    1.144231, [0.5, 0.5], 12, 48, 170, 48, 105),
  component('r-chip-fan', [0.379883, 0.007813, 0.496094, 0.117188],
    1.0625, [0.5, 0.5], 12, 48, 150, 42, 93),
  component('r-collapsed-seam', [0.253906, 0.143555, 0.371094, 0.230469],
    1.348315, [0.5, 0.5], 12, 48, 260, 73, 161),

  // S — broad stepped rakes and splinter fans.
  component('s-step-shear', [0.253906, 0.262695, 0.370117, 0.361328],
    1.178218, [0.5, 0.5], 12, 48, 180, 50, 112),
  component('s-split-shear', [0.378906, 0.269531, 0.496094, 0.355469],
    1.363636, [0.5, 0.5], 12, 48, 170, 48, 105),
  component('s-armor-fan', [0.010742, 0.378906, 0.113281, 0.496094],
    0.875, [0.5, 0.5], 12, 48, 190, 53, 118),

  // L — deliberately medium-scale, left-pivoted seams.  These never render
  // below 24 px: their thin line language did not survive the 12 px review.
  component('l-plate-pierce', [0.878906, 0.030273, 0.995117, 0.094727],
    1.80303, [0.12, 0.5], 24, 48, 150, 42, 93),
  component('l-heated-incision', [0.754883, 0.166992, 0.870117, 0.207031],
    2.878049, [0.12, 0.5], 24, 48, 180, 50, 112),
  component('l-collapsing-echo', [0.504883, 0.168945, 0.620117, 0.206055],
    3.105263, [0.12, 0.5], 24, 48, 230, 64, 143),

  // H — paired guidance vanes crossing the incoming axis.
  component('h-vane-bracket', [0.503906, 0.28125, 0.618164, 0.342773],
    1.857143, [0.12, 0.5], 12, 48, 130, 36, 81),
  component('h-fin-slice', [0.758789, 0.290039, 0.871094, 0.334961],
    2.5, [0.12, 0.5], 12, 48, 130, 36, 81),
  component('h-opposed-vanes', [0.879883, 0.28418, 0.995117, 0.339844],
    2.070175, [0.12, 0.5], 12, 48, 170, 48, 105),

  // F — thick asymmetric combustion bites, not projectile blobs.
  component('f-serrated-bite', [0.003906, 0.527344, 0.121094, 0.59668],
    1.690141, [0.12, 0.5], 12, 48, 180, 50, 112),
  component('f-plate-incision', [0.378906, 0.522461, 0.496094, 0.601563],
    1.481481, [0.12, 0.5], 12, 48, 190, 53, 118),
  component('f-torn-pressure-ribbon', [0.128906, 0.665039, 0.246094, 0.709961],
    2.608696, [0.12, 0.5], 12, 48, 160, 45, 99),

  // Role-shaped hostile rupture.  No intact enemy is scaled, spun, or faded
  // by this layer; these are small pieces painted at the exact death endpoint.
  component('enemy-rotor-rupture', [0.014648, 0.753906, 0.109375, 0.823242],
    1.366197, [0.5, 0.5], 12, 48, 220, 62, 136),
  component('enemy-scute-rupture', [0.128906, 0.777344, 0.246094, 0.847656],
    1.666667, [0.5, 0.5], 12, 48, 240, 67, 149),
  component('enemy-iris-failure', [0.253906, 0.761719, 0.371094, 0.862305],
    1.165049, [0.5, 0.5], 12, 48, 240, 67, 149),
  component('enemy-breech-fracture', [0.378906, 0.782227, 0.496094, 0.841797],
    1.967213, [0.5, 0.5], 12, 48, 240, 67, 149),
  component('warden-rack-rupture', [0.753906, 0.773438, 0.871094, 0.850586],
    1.518987, [0.5, 0.5], 12, 48, 250, 70, 155),
  component('crown-interlock-failure', [0.883789, 0.753906, 0.991211, 0.871094],
    0.916667, [0.5, 0.5], 12, 48, 280, 78, 174),
  component('crown-housing-shear', [0.753906, 0.878906, 0.870117, 0.996094],
    0.991667, [0.5, 0.5], 12, 48, 300, 84, 186),
]);

// Component indices, kept numeric so event handlers perform no string lookup.
export const ACTION_VFX_WEAPONS = Object.freeze({
  R: Object.freeze([0, 1, 2]),
  S: Object.freeze([3, 4, 5]),
  L: Object.freeze([6, 7, 8]),
  H: Object.freeze([9, 10, 11]),
  F: Object.freeze([12, 13, 14]),
});

export const ACTION_VFX_RUPTURES = Object.freeze({
  wasp: 15,
  hound: 16,
  polyp: 17,
  mortar: 18,
  machine: 17,
  warden: Object.freeze([19, 20, 21]),
});

export const ACTION_VFX_REJECTED = Object.freeze([
  'h-broken-crosscut',
  'h-spent-hardware',
  'f-double-vent-wisp',
  'enemy-rise-vapor',
  'enemy-side-vent',
]);
