import { CONFIG } from '../../config.js';
import { gameMs } from '../../sim/time.js';
import { selectActorMotion, selectActorMotionClip } from '../actor-motion.js';

function syncActorPose(api, v, e) {
  if (!v.sprite) return;
  const deployingWarden = e.kind === 'warden' && !!v.actorMotionBundle &&
    gameMs < e.enterUntil;
  const deploymentProgress = deployingWarden
    ? 1 - Math.max(0, Math.min(1,
      (e.enterUntil - gameMs) / CONFIG.wasp.enterMs)) : 0;
  const authored = deployingWarden
    ? selectActorMotionClip(v.actorMotionBundle, 'deployment', deploymentProgress)
    : selectActorMotion(v.actorMotionBundle, e, gameMs);
  if (!authored) { api.syncSpritePose(v, e); return; }

  const key = `actor:${authored.frame.index}`;
  v.actionActive = false;
  v.motionSource = 'actor';
  v.motionFrame = authored.frame.index;
  v.actorMotionFrame = authored.frame;
  v.actorMotionClip = authored.clip;
  v.actorMotionMarker = authored.marker;
  v.actorMotionEvent = authored.event;
  v.actorMotionProgress = authored.progress;
  if (key === v.poseKey) return;
  v.poseKey = key;
  v.mesh.geometry = authored.frame.geo;
  v.mat.map = v.actorMotionBundle.tex;
  v.mat.emissiveMap = v.actorMotionBundle.tex;
}

function prepareActorRemoval(api, v, e, fade) {
  if (!fade || e.kind !== 'warden' || !v.actorMotionBundle) return [];
  const terminal = selectActorMotionClip(v.actorMotionBundle, 'terminalRupture', 1);
  if (terminal) {
    v.motionSource = 'actor';
    v.motionFrame = terminal.frame.index;
    v.actorMotionFrame = terminal.frame;
    v.actorMotionClip = terminal.clip;
    v.actorMotionMarker = terminal.marker;
    v.actorMotionEvent = terminal.event;
    v.actorMotionProgress = terminal.progress;
    v.poseKey = `actor:${terminal.frame.index}`;
    v.mesh.geometry = terminal.frame.geo;
    v.mat.map = v.actorMotionBundle.tex;
    v.mat.emissiveMap = v.actorMotionBundle.tex;
    v.mat.emissiveIntensity = 0;
  }
  return [];
}

export const ACTOR_PRESENTER = Object.freeze({
  id: 'actor',
  matches: (assets) => !!assets.actorBundle,
  spawn: (api, context) => api.spawnStandard(context),
  syncPose: syncActorPose,
  ownsSilhouette: (api, v) => v.motionSource === 'actor' &&
    api.currentMotionFrame(v) >= 0,
  usesLegacyPose: () => true,
  syncMaterial: (api, v, frame) => api.syncPaintedMaterial(v, frame),
  syncTransform: (api, v, e, frame) => api.syncPaintedTransform(v, e, frame),
  prepareRemoval: prepareActorRemoval,
});
