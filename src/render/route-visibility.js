/* ================ ROUTE RENDER OWNERSHIP =================
 * One read-only gate for anything attached to logical route coordinate s.
 * The simulation may preload/generate the whole climb; rendering may expose
 * only the facet owned by the camera's final facet detent. */

import { CONFIG } from '../config.js';
import { BEND_S, activeWorldFacet, routeRenderOwned, worldFacetAt } from '../pure/path.js';
import { ACTIVE_FIXTURE } from '../mode.js';
import { scrollX } from '../sim/time.js';
import { cameraFacingFacet } from './camera.js';

export function currentWorldFacet() {
  return activeWorldFacet(scrollX, cameraFacingFacet(), CONFIG);
}

export function routeWorldFacet(s) {
  return worldFacetAt(s, CONFIG, BEND_S);
}

export function routeRenderable(s) {
  // Corner presentation is render-only; authored fixtures opt out because
  // their geometry owns another path.
  if (ACTIVE_FIXTURE !== null) return true;
  // T-102: under the static-anatomy reveal (decisions.md entry 3) the
  // arriving face was baked at boot and is REVEALED by camera ownership alone.
  // Gating it on the simulation's construction rows — which then still
  // settled on the retired zipper's schedule — made the arriving catwalks,
  // ladders and hull assemble column by column after the camera handoff, and
  // hid the pre-bend column RIG fights from. The ?zip=1 brick reveal, the one
  // reader of those rows, was deleted under decisions.md entry 25 (T-127), so
  // no code path here can hide an arriving column.
  return routeRenderOwned(s, true, scrollX, cameraFacingFacet(), CONFIG, BEND_S);
}

// A cheap cache key for static instance pools. It changes only at an intro /
// camera-facet handoff.
export function routeVisibilityStamp() {
  if (ACTIVE_FIXTURE !== null) return 'fixture';
  return `${currentWorldFacet()}`;
}
