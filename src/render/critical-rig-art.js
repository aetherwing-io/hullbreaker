/* =================== FIRST-PAINT RIG ART OWNER ==================== */
/* RIG is always on screen, so its four production atlases join immediately
 * after baseline world art and before optional enemy/endgame lanes. player.js
 * later asks for the same URLs and receives these promises from preload.js. */

import {
  RIG_AIM_ATLAS_PATH,
  RIG_BODY_ATLAS_PATH,
  RIG_CLIMB_ATLAS_PATH,
  RIG_WEAPON_ATLAS_PATH,
} from '../pure/rig.js';
import { preloadTexture } from './preload.js';

const files = Object.freeze([
  RIG_BODY_ATLAS_PATH,
  RIG_AIM_ATLAS_PATH,
  RIG_WEAPON_ATLAS_PATH,
  RIG_CLIMB_ATLAS_PATH,
]);

export const CRITICAL_RIG_REQUESTS = Object.freeze(files.map((file) =>
  preloadTexture(new URL(file, import.meta.url).href)));
