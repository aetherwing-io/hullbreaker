/* ================ ROUTE RENDER OWNERSHIP =================
 * One read-only gate for anything attached to logical route coordinate s.
 * The simulation may preload/generate the whole climb; rendering may expose
 * only the built phase owned by the camera's final facet detent. */

import { CONFIG } from '../config.js';
import { BEND_S, activeWorldFacet, routeRenderOwned, worldFacetAt } from '../pure/path.js';
import { IS_G1 } from '../mode.js';
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
  if (!IS_G1) return true;
  return routeRenderOwned(
    s, routeColumnBuilt(s), scrollX, cameraFacingFacet(), CONFIG, BEND_S,
  );
}

// A cheap cache key for static instance pools. It changes only at an intro /
// camera-facet handoff or whenever the sim commits another construction row.
export function routeVisibilityStamp() {
  if (!IS_G1) return 'fixture';
  return `${currentWorldFacet()}:${levelBuildRevision()}`;
}
