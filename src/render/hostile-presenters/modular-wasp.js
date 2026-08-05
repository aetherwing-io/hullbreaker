import { gameMs } from '../../sim/time.js';
import { selectWaspBodyState, WASP_BODY } from '../wasp-modular-select.js';

const TURN_HOLD_MS = 120;

function syncModularWaspPose(api, v, e) {
  const bundle = v.waspModular;
  if (!bundle) return;
  let dx = e.x - v.waspLastX;
  let dy = e.y - v.waspLastY;
  if (Math.abs(dx) > 0.75 || Math.abs(dy) > 0.75) { dx = 0; dy = 0; }
  const face = Math.sign(api.spriteFaceX(e, `waspmod:${v.waspBodyState}`)) || 1;
  if (face !== v.waspLastFace) v.waspTurnUntil = gameMs + TURN_HOLD_MS;
  v.waspMotion.turning = gameMs < v.waspTurnUntil;
  v.waspMotion.dx = dx;
  v.waspMotion.dy = dy;
  const frame = selectWaspBodyState(e, gameMs, v.waspMotion);
  v.waspLastX = e.x;
  v.waspLastY = e.y;
  v.waspLastFace = face;
  v.actionActive = false;
  v.motionSource = 'wasp-modular';
  v.motionFrame = frame;
  v.actorMotionFrame = null;
  if (frame === v.waspBodyState && v.poseKey === `waspmod:${frame}`) return;
  v.waspBodyState = frame;
  v.poseKey = `waspmod:${frame}`;
  v.mesh.geometry = bundle.body[frame].geo;
  v.mat.map = bundle.tex;
  v.mat.emissiveMap = bundle.tex;
}

function prepareModularWaspRemoval(api, v, e, fade) {
  if (fade) {
    v.waspBodyState = WASP_BODY.DEATH_CRACK;
    v.motionSource = 'wasp-modular';
    v.motionFrame = WASP_BODY.DEATH_CRACK;
    v.poseKey = `waspmod:${WASP_BODY.DEATH_CRACK}`;
    v.mesh.geometry = v.waspModular.body[WASP_BODY.DEATH_CRACK].geo;
    v.mat.map = v.waspModular.tex;
    v.mat.emissiveMap = v.waspModular.tex;
  }
  const wingSystem = api.detachModularWaspWing(v, fade);
  return wingSystem ? [wingSystem] : [];
}

export const MODULAR_WASP_PRESENTER = Object.freeze({
  id: 'modular-wasp',
  matches: (assets) => !!assets.modularBundle,
  spawn: (api, context) => api.spawnStandard(context),
  syncPose: syncModularWaspPose,
  ownsSilhouette: (api, v) => api.currentMotionFrame(v) >= 0,
  usesLegacyPose: () => true,
  syncMaterial: (api, v, frame) => api.syncPaintedMaterial(v, frame),
  syncTransform: (api, v, e, frame) => api.syncPaintedTransform(v, e, frame),
  prepareRemoval: prepareModularWaspRemoval,
});
