import { gameMs } from '../../sim/time.js';
import {
  freezeEnemyEcologyBreakup, syncEnemyEcologyVisual,
} from '../enemy-ecology.js';

export const ECOLOGY_PRESENTER = Object.freeze({
  id: 'ecology',
  matches: (assets) => !!assets.ecology,
  spawn: (api, context) => api.spawnEcology(context),
  syncPose: (api, v, e) => syncEnemyEcologyVisual(v, e, gameMs),
  ownsSilhouette: () => true,
  usesLegacyPose: () => false,
  syncMaterial: (api, v, frame) => api.syncEcologyMaterial(v, frame),
  syncTransform: (api, v, e, frame) => api.syncEcologyTransform(v, e, frame),
  prepareRemoval: (api, v, e, fade) => {
    if (fade) freezeEnemyEcologyBreakup(v);
    return [];
  },
});
