/* ============== FIRST-RUN GAMEPLAY ART OWNER ==================== */
/* These five atlases were the remaining cold-mobile misses after the world
   and RIG lanes were prioritized. Register their compact runtime copies next,
   before optional environment/endgame owners can consume the shared budget.
   Their eventual consumers ask for the same URLs and reuse these promises. */

import { CAPSULE_ART_ATLAS, CAPSULE_ART_ROOT } from './capsule-art-spec.js';
import { ENEMY_ECOLOGY_ATLAS } from './enemy-ecology-spec.js';
import {
  SPRITE_ACTION_ART, SPRITE_ART, SPRITE_MOTION_ART, SPRITE_ROOT,
} from './sprite-table.js';
import { preloadTexture } from './preload.js';

const files = Object.freeze([
  ENEMY_ECOLOGY_ATLAS.file,
  CAPSULE_ART_ROOT + CAPSULE_ART_ATLAS.file,
  SPRITE_ROOT + SPRITE_ART.warden.b.file,
  SPRITE_ROOT + SPRITE_MOTION_ART.hound.file,
  SPRITE_ROOT + SPRITE_ACTION_ART.mortar.file,
]);

export const CRITICAL_GAMEPLAY_REQUESTS = Object.freeze(files.map((file) =>
  preloadTexture(new URL(file, import.meta.url).href, { anisotropy: 8 })));
