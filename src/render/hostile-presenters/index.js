import { ACTOR_PRESENTER } from './actor.js';
import { ECOLOGY_PRESENTER } from './ecology.js';
import { MODULAR_WASP_PRESENTER } from './modular-wasp.js';
import { PRIMITIVE_PRESENTER } from './primitive.js';
import { SPRITE_PRESENTER } from './sprite.js';
import { makeHostilePresenterRegistry } from './registry.js';

// Priority is explicit data.  The last row is the total fallback; validation
// in registry.js rejects malformed or duplicate entries at module boot.
export const HOSTILE_PRESENTERS = makeHostilePresenterRegistry([
  ECOLOGY_PRESENTER,
  MODULAR_WASP_PRESENTER,
  ACTOR_PRESENTER,
  SPRITE_PRESENTER,
  PRIMITIVE_PRESENTER,
]);
