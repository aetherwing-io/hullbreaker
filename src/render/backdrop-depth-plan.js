/* ============== FACET-OWNED MERIDIAN DEPTH COMPOSITION ===============
 * Pure presentation data for the four fixed backdrop draws each route facet
 * owns.  Nothing here names a gameplay surface, pickup, light, enemy or spawn
 * point: these are pieces of the same colossal body RIG is already standing
 * on, seen at three real depths with sparse condensation between them.
 *
 * The runtime consumes direct resident images and atlas UVs.  There is no
 * canvas compositor, cover crop, per-frame placement, random source or late
 * asset swap in this plan.  A browser gate can therefore re-derive the exact
 * pool and triangle ceilings without loading Three.js. */

import { CONFIG } from '../config.js';

export const MERIDIAN_DEPTH_SOURCES = Object.freeze({
  far: Object.freeze({
    id: 'meridian-anatomy',
    file: '../../assets/generated/backdrops/backdrop-meridian-anatomy-v1.png',
    canvas: Object.freeze([1672, 941]),
    alpha: false,
  }),
  mid: Object.freeze({
    id: 'meridian-coils',
    file: '../../assets/generated/backdrops/backdrop-meridian-coils-v3.png',
    canvas: Object.freeze([1983, 793]),
    alpha: true,
  }),
  near: Object.freeze({
    id: 'meridian-components',
    file: '../../assets/generated/environment/meridian-component-atlas-v1.png',
    canvas: Object.freeze([2048, 1024]),
    alpha: true,
  }),
});

export const MERIDIAN_DEPTH_LAYERS = Object.freeze([
  Object.freeze({
    id: 'far', role: 'far-meridian-mass', depth: -20.0,
    // Broad enough to stay beyond the frustum while a facet is oblique.  The
    // old 138-tile shell exposed its feathered rectangular edge during the
    // fold, which read as a teal screen-space fog card even though the mesh
    // itself was in world space.  More depth and curvature separate this
    // colossal body from the mid coil while the wider span keeps the source
    // boundary outside both shipped aspects.
    width: 200, curve: 9.0, opacity: 0.98, facingExponent: 1.9,
    // A narrow frustum sees a smaller luminance range from the same shell, so
    // retain more of the authored far plate instead of letting the portrait
    // view collapse into a uniformly dark corridor.
    portraitGain: 1.16, renderOrder: -62, source: 'far',
  }),
  Object.freeze({
    id: 'mid', role: 'mid-structural-anatomy', depth: -8.4,
    width: 118, curve: 2.7, opacity: 0.78, facingExponent: 24.0,
    portraitGain: 0.86, renderOrder: -56, source: 'mid',
  }),
  Object.freeze({
    id: 'condensation', role: 'world-condensation',
    depthRange: Object.freeze([-17.2, -5.2]), opacity: 0.012,
    facingExponent: 4.0, portraitGain: 0.64, renderOrder: -50,
    ribbonsPerFacet: 5,
  }),
  Object.freeze({
    id: 'near', role: 'near-armor-fragments', depth: -3.8,
    // Near cutouts exist for settled-frame edge depth, not for the fold. At
    // the 30-degree detent even a reviewed shoulder silhouette projected like
    // a pale duplicate actor behind the corner. A steep facing response parks
    // these pieces during rotation and returns them only when attached to a
    // square-on facet edge.
    opacity: 0.40, facingExponent: 80.0, portraitGain: 0.68,
    renderOrder: -44, source: 'near', fragmentsPerFacet: 4,
  }),
]);

export const MERIDIAN_DEPTH_COMPONENT_IDS = Object.freeze([
  'keel-fin', 'armor-shoulder',
]);

const FAR_OFFSETS = Object.freeze([-6, 5, -3, 7, -5, 4, 0]);
const MID_OFFSETS = Object.freeze([7, -8, 4, -6, 8, -4, 2]);
const BASE_FRAGMENTS = Object.freeze([
  // The crescent keel-fin silhouette looked uncannily like a second tiny RIG
  // when a fold projected it upright at the far glass.  Broad shoulder scutes
  // keep the near tier mechanical and deliberately crop at the frame fringe:
  // they are attached armour intruding from off-screen, never freestanding
  // figures or readable future props in the action band.
  Object.freeze({ id: 'armor-shoulder', x: -54, y: -31, h: 11.2, angle: -0.18, z: -0.32 }),
  Object.freeze({ id: 'armor-shoulder', x: -28, y: 42, h: 7.0, angle: 0.12, z: 0.08 }),
  Object.freeze({ id: 'armor-shoulder', x: 31, y: 43, h: 7.4, angle: -0.10, z: -0.18 }),
  Object.freeze({ id: 'armor-shoulder', x: 55, y: -31, h: 11.6, angle: 0.18, z: -0.48 }),
]);

function hashUnit(seed) {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

export function meridianDepthFacePlan(face) {
  const index = Math.max(0, Math.min(CONFIG.path.faces, (face | 0) - 1));
  const stage = Math.min(2, Math.floor(index / 2));
  const mirror = (face & 1) === 0;
  const fragments = BASE_FRAGMENTS.map((entry, ordinal) => Object.freeze({
    ...entry,
    x: entry.x + (hashUnit(face * 101 + ordinal * 17) - 0.5) * 4.5,
    y: entry.y + (hashUnit(face * 149 + ordinal * 31) - 0.5) * 3.5,
    angle: (mirror ? -entry.angle : entry.angle) +
      (hashUnit(face * 211 + ordinal * 47) - 0.5) * 0.10,
    mirrorX: mirror !== (ordinal % 2 === 0),
  }));
  return Object.freeze({
    face,
    stage,
    farOffset: FAR_OFFSETS[index],
    midOffset: MID_OFFSETS[index],
    mirrorFar: mirror,
    mirrorMid: !mirror,
    fragments: Object.freeze(fragments),
  });
}

export function meridianCondensationPlan(face) {
  const rows = [];
  const layer = MERIDIAN_DEPTH_LAYERS.find((entry) => entry.id === 'condensation');
  const [farDepth, nearDepth] = layer.depthRange;
  for (let i = 0; i < layer.ribbonsPerFacet; i++) {
    const a = hashUnit(face * 379 + i * 61);
    const b = hashUnit(face * 487 + i * 79);
    const c = hashUnit(face * 593 + i * 97);
    rows.push(Object.freeze({
      x: -42 + a * 84,
      y: -12 + b * 49,
      z: farDepth + c * (nearDepth - farDepth),
      width: 14 + hashUnit(face * 683 + i * 107) * 16,
      height: 0.7 + hashUnit(face * 761 + i * 127) * 1.1,
      rake: -0.16 + hashUnit(face * 829 + i * 139) * 0.32,
      twist: -0.75 + hashUnit(face * 911 + i * 151) * 1.5,
    }));
  }
  return Object.freeze(rows);
}

const FACE_COUNT = CONFIG.path.faces + 1;
const PLANE_TRIANGLES = 20 * 2 * 2;
const NEAR_TRIANGLES = BASE_FRAGMENTS.length * 2;
const CONDENSATION_TRIANGLES = 5 * 16;
export const MERIDIAN_DEPTH_BUDGET = Object.freeze({
  facets: FACE_COUNT,
  meshesPerFacet: 4,
  totalMeshes: FACE_COUNT * 4,
  maxActiveFacets: 2,
  settledDrawCalls: 4,
  turnDrawCalls: 8,
  trianglesPerFacet: PLANE_TRIANGLES * 2 + NEAR_TRIANGLES + CONDENSATION_TRIANGLES,
  turnTriangles: (PLANE_TRIANGLES * 2 + NEAR_TRIANGLES + CONDENSATION_TRIANGLES) * 2,
  sourceTextures: 3,
  runtimeCanvases: 0,
  runtimeCrops: 0,
  futureGameplaySemantics: 0,
  playerPlaneDepth: 0,
});
