/* =================== FIRST-PAINT WORLD ART OWNER =================== */
/* Register the four always-visible world sources before optional ecology,
 * crown, projectile and action atlases can occupy the browser's cold-start
 * connection queue. Their normal owners call preloadTexture with the same
 * URLs later and receive these exact promises; the shared gate still owns
 * settlement, GPU preparation, timeout and permanent fallback decisions. */

import { MERIDIAN_DEPTH_SOURCES } from './backdrop-depth-plan.js';
import { FOREGROUND_PACK_SOURCE } from './foreground-pack-source.js';
import { preloadTexture } from './preload.js';

const sources = Object.freeze([
  Object.freeze({ source: MERIDIAN_DEPTH_SOURCES.far, anisotropy: 6 }),
  Object.freeze({ source: MERIDIAN_DEPTH_SOURCES.mid, anisotropy: 6 }),
  Object.freeze({ source: MERIDIAN_DEPTH_SOURCES.near, anisotropy: 8 }),
  Object.freeze({ source: FOREGROUND_PACK_SOURCE, anisotropy: 8 }),
]);

export const CRITICAL_WORLD_REQUESTS = Object.freeze(sources.map(({ source, anisotropy }) =>
  preloadTexture(new URL(source.file, import.meta.url).href, { anisotropy })));
