/* =================== FIRST-PAINT RIG ART OWNER ==================== */
/* RIG is always on screen, so its four production atlases join immediately
 * after baseline world art and before optional enemy/endgame lanes. player.js
 * later asks for the same URLs and receives these promises from preload.js.
 * T-123: on the crisp sprite path (the default; ?art=legacy restores the
 * mipmapped setup) they are prepared nearest and mip-free — the path
 * resamples them exactly once itself (src/render/preload.js actorAtlasOptions). */

import {
  RIG_AIM_ATLAS_PATH,
  RIG_BODY_ATLAS_PATH,
  RIG_CLIMB_ATLAS_PATH,
  RIG_WEAPON_ATLAS_PATH,
} from '../pure/rig.js';
import { actorAtlasOptions, preloadTexture } from './preload.js';

const files = Object.freeze([
  RIG_BODY_ATLAS_PATH,
  RIG_AIM_ATLAS_PATH,
  RIG_WEAPON_ATLAS_PATH,
  RIG_CLIMB_ATLAS_PATH,
]);

export const RIG_ART_PRELOAD_OPTIONS = Object.freeze(actorAtlasOptions());

export const CRITICAL_RIG_REQUESTS = Object.freeze(files.map((file) =>
  preloadTexture(new URL(file, import.meta.url).href, RIG_ART_PRELOAD_OPTIONS)));
