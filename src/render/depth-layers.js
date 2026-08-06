/* ================= OPAQUE SURFACE DEPTH CONTRACT =================
 * Depth-tested geometry has two legitimate ways to sit on another surface:
 *
 *   1. PHYSICAL layers move geometry by a tiny, named world-space distance.
 *      Use these when overlapping pieces are allowed to have real separation.
 *   2. RASTER layers use polygonOffset when the geometry must remain flush
 *      with gameplay truth (for example route armour on the collision face).
 *
 * `renderOrder` is deliberately absent. It only orders submissions; it does
 * not resolve two opaque fragments that write the same depth. Transparent VFX
 * keep their local compositing order, while every opaque coplanar exception
 * belongs here instead of growing another anonymous 0.008 or 0.02 fix.
 *
 * Positive physical offsets mean "prouder / nearer" in the caller's surface
 * normal. The shared 0.002-world-unit quantum is the smallest separation the
 * FAR camera's existing component-plane audit found stable after MSAA. */

export const DEPTH_QUANTUM = 0.002;

function physical(baseUnits, strideUnits = 0, slots = 1) {
  return Object.freeze({ baseUnits, strideUnits, slots });
}

export const PHYSICAL_DEPTH_LAYER = Object.freeze({
  // Adjacent under-deck castings intentionally overlap to seal grazing-angle
  // cracks. Three shallow lanes make their winner deterministic without
  // moving enough geometry to change the silhouette.
  LIMB_HULL_CASTING: physical(0, 4, 3),

  // A painted atlas plane sits just beyond its physical equipment backplate.
  FOREGROUND_PACK_INLAY: physical(4),

  // Projected alpha footprints need a real lift because polygon offset is not
  // consistently useful on a horizontal plane seen at every route pitch.
  CONTACT_SHADOW: physical(10),

  // The hinged wing painting sits behind the body card at their shared root.
  WASP_WING: physical(-8),
});

// Native cutout parts are frequently composed over one another. Each role
// owns seven deterministic placement sublayers, and the next role begins one
// full quantum beyond that range. Unlike the former overlapping bias ranges,
// category order is now a real contract rather than a comment.
export const COMPONENT_DEPTH_LAYER = Object.freeze({
  'trim-cap': physical(4, 1, 7),
  'beam-brace': physical(12, 1, 7),
  'ladder-rail': physical(20, 1, 7),
  'pipe-conduit': physical(28, 1, 7),
  'service-organ': physical(36, 1, 7),
  'defense-state': physical(44, 1, 7),
  'scuttle-damage': physical(52, 1, 7),
  'near-silhouette': physical(60, 1, 7),
  near: physical(60, 1, 7),
  default: physical(4, 1, 7),
});

export const RASTER_DEPTH_LAYER = Object.freeze({
  // Negative values pull the fragment toward the camera in WebGL's polygon
  // offset convention. This layer is intentionally shallow: it only breaks a
  // tie with the collision face and must not overtake unrelated geometry.
  FLUSH_ROUTE_ARMOUR: Object.freeze({ factor: -1, units: -1 }),
});

export function depthLayerSlot(seed, slots) {
  const count = Math.max(1, Math.trunc(slots) || 1);
  const value = Math.trunc(seed) || 0;
  return ((value % count) + count) % count;
}

export function physicalDepthOffset(layer, slot = 0) {
  const lane = depthLayerSlot(slot, layer.slots);
  return (layer.baseUnits + lane * layer.strideUnits) * DEPTH_QUANTUM;
}

export function componentDepthOffset(category, depthBand, slot = 0) {
  const layer = COMPONENT_DEPTH_LAYER[category] ||
    COMPONENT_DEPTH_LAYER[depthBand === 'near' ? 'near' : 'default'];
  return physicalDepthOffset(layer, slot);
}

export function applyRasterDepthLayer(material, layer) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = layer.factor;
  material.polygonOffsetUnits = layer.units;
  material.userData = { ...material.userData, rasterDepthLayer: layer };
  return material;
}
