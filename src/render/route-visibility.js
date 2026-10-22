/* ================ ROUTE RENDER OWNERSHIP =================
 * One read-only gate for anything attached to logical route coordinate s.
 * The simulation may preload/generate the whole climb; rendering may expose
 * only the built phase owned by the camera's final facet detent. */

import { CONFIG } from '../config.js';
import { BEND_S, activeWorldFacet, routeRenderOwned, worldFacetAt } from '../pure/path.js';
import { ACTIVE_FIXTURE, IS_G1 } from '../mode.js';
import { LEVEL_LEN, columnBuilt, levelBuildRevision } from '../sim/level.js';
import { scrollX } from '../sim/time.js';
import { cameraFacingFacet } from './camera.js';

export function routeColumnBuilt(s) {
  const column = Math.floor(s);
  return column < 0 || column >= LEVEL_LEN || columnBuilt(column);
}

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
  // T-102: under the default static-anatomy reveal (decisions.md entry 3) the
  // arriving face was baked at boot and is REVEALED by camera ownership alone.
  // Gating it on the simulation's construction rows — which still settle on
  // the retired zipper's schedule (one column per 16 ms from 380 to 860 ms,
  // the far set at 1100 ms) — made the arriving catwalks, ladders and hull
  // assemble column by column after the camera handoff, and hid the pre-bend
  // column RIG fights from. Only the retired ?zip=1 brick reveal, which does
  // assemble, still reads the construction rows.
  return routeRenderOwned(
    s, IS_G1 || routeColumnBuilt(s), scrollX, cameraFacingFacet(), CONFIG, BEND_S,
  );
}

// A cheap cache key for static instance pools. It changes only at an intro /
// camera-facet handoff, or (?zip=1 only) whenever the sim commits another
// construction row.
export function routeVisibilityStamp() {
  if (ACTIVE_FIXTURE !== null) return 'fixture';
  if (IS_G1) return `${currentWorldFacet()}`;
  return `${currentWorldFacet()}:${levelBuildRevision()}`;
}
