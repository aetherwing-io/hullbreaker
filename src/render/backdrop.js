/* ================= FACET-OWNED MERIDIAN BACKDROP ================== */
/* Production backdrop owner.  Three existing environment images enter the
   shared preload gate once and are then mapped directly by atmosphere.js:
   an opaque far-body painting, a transparent mid-body coil painting and the
   reviewed native-shape component atlas.  The legacy illustrated plates are
   retained in BACKDROP_TUNE only as historical data; their ladders, lamps,
   skyline and route-like silhouettes no longer draw behind gameplay.

   This module deliberately contains no canvas or crop path.  Direct source
   residency removes nine derived storm textures, the procedural depth matte
   and their first-frame upload burden while keeping graceful source-by-source
   failure: missing art drops only its corresponding depth draw, never play. */

import { BACKDROP_TUNE } from '../config.js';
import { IS_TRANSFORM_SLICE, QUERY } from '../mode.js';
import { resolveBackdropOn } from './backdrop-table.js';
import {
  MERIDIAN_DEPTH_COMPONENT_IDS,
  MERIDIAN_DEPTH_SOURCES,
} from './backdrop-depth-plan.js';
import { FOREGROUND_CUTOUT_COMPONENTS } from './foreground-component-spec.generated.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { scene } from './scene.js';
import {
  atmosphereFacetVisibilitySnapshot,
  buildMeridianAtmosphere,
  updateAtmosphereFacetVisibility,
} from './atmosphere.js';

export const BACKDROP_ON = resolveBackdropOn(QUERY.get('backdrop'), IS_TRANSFORM_SLICE);

const retiredPlates = BACKDROP_TUNE.placements.map((placement) => ({
  placement,
  state: 'retired',
  error: null,
  replaced: true,
  replacement: 'facet-anatomy-volume',
}));
const farBody = { state: BACKDROP_ON ? 'pending' : 'off', tex: null, error: null };
const midBody = { state: BACKDROP_ON ? 'pending' : 'off', tex: null, error: null };
const fragmentBody = { state: BACKDROP_ON ? 'pending' : 'off', tex: null, error: null };
let atmosphere = {
  built: 0,
  triangles: 0,
  composition: BACKDROP_ON ? 'pending' : 'off',
  directResidentTextures: 0,
  runtimeCanvases: 0,
  runtimeCrops: 0,
};

function registerSource(slot, source, options = {}) {
  if (!BACKDROP_ON) return null;
  const url = new URL(source.file, import.meta.url).href;
  return preloadTexture(url, options).then((entry) => {
    if (entry.state === 'ready') {
      slot.tex = entry.tex;
      slot.state = 'ready';
      return entry;
    }
    slot.state = 'failed';
    slot.error = entry.error || entry.state;
    console.warn(`HULLBREAKER art: ${source.id} backdrop source unavailable (` +
      `${slot.error}) -- that depth band stays empty; play continues.`);
    return entry;
  });
}

try {
  registerSource(farBody, MERIDIAN_DEPTH_SOURCES.far, { anisotropy: 6 });
  registerSource(midBody, MERIDIAN_DEPTH_SOURCES.mid, { anisotropy: 6 });
  registerSource(fragmentBody, MERIDIAN_DEPTH_SOURCES.near, { anisotropy: 8 });

  // The single shared gate uploads the three source textures before frame
  // one.  atmosphere.js creates only small BufferGeometry after this point;
  // no derived image or deferred texture can appear during play.
  await awaitPreloads();

  if (BACKDROP_ON) {
    const allowed = new Set(MERIDIAN_DEPTH_COMPONENT_IDS);
    const fragmentComponents = FOREGROUND_CUTOUT_COMPONENTS.filter((entry) =>
      allowed.has(entry.id));
    atmosphere = buildMeridianAtmosphere(scene, {
      farTexture: farBody.tex,
      midTexture: midBody.tex,
      fragmentTexture: fragmentBody.tex,
      fragmentComponents,
    });
  }
} catch (error) {
  console.warn('HULLBREAKER art: facet depth composition failed (' +
    `${(error && error.message) || error}) -- the ordinary world remains playable.`);
}

export function updateBackdropFacetVisibility() {
  return updateAtmosphereFacetVisibility();
}

// Seed face one before the first animation frame. main.js refreshes this
// immediately after every subsequent camera pose, including a run reset.
updateBackdropFacetVisibility();

export function backdropSnapshot() {
  const facetVisibility = atmosphereFacetVisibilitySnapshot();
  return {
    on: BACKDROP_ON,
    // `built` used to mean legacy illustrated plate meshes. Keep that field
    // honest at zero and expose the replacement pool explicitly.
    built: 0,
    legacyPlateMeshes: 0,
    depthMeshesBuilt: atmosphere.built || 0,
    depthMattesBuilt: 0,
    depthMatteResidency: {
      requested: 0, warmed: 0, ms: 0,
      retired: 'runtime-canvas-matte',
    },
    depthComposition: {
      mode: atmosphere.composition,
      directResidentTextures: atmosphere.directResidentTextures || 0,
      runtimeCanvases: 0,
      runtimeCrops: 0,
    },
    facetVisibility: {
      totalFacets: facetVisibility.totalFacets,
      visibleFacets: facetVisibility.visibleFacets,
      totalMeshes: facetVisibility.totalMeshes,
      visibleMeshes: facetVisibility.visibleMeshes,
      atmosphere: facetVisibility,
    },
    atmosphere,
    // Backward-compatible source names plus clearer depth-role aliases.
    macroBody: { state: midBody.state, error: midBody.error },
    anatomyBody: { state: farBody.state, error: farBody.error },
    fragmentBody: { state: fragmentBody.state, error: fragmentBody.error },
    sources: {
      far: { state: farBody.state, error: farBody.error },
      mid: { state: midBody.state, error: midBody.error },
      near: { state: fragmentBody.state, error: fragmentBody.error },
    },
    plates: retiredPlates.map((slot) => ({
      face: slot.placement.face,
      plate: slot.placement.plate,
      tier: slot.placement.tier,
      state: slot.state,
      error: slot.error,
      replaced: slot.replaced,
      replacement: slot.replacement,
    })),
  };
}

if (typeof window !== 'undefined') window.__HB_BACKDROP = backdropSnapshot;
