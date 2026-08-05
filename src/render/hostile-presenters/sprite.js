function syncSpritePose(api, v, e) {
  if (!v.sprite) return;
  const motionFrame = api.locomotionFrame(v, e);
  const houndAtlas = e.kind === 'hound' && !!v.motionTex &&
    (v.motionGeos?.length || 0) >= 8;
  const action = (!houndAtlas || e.kind !== 'hound') && api.actionPoseActive(e) &&
    !!v.actionTex && !!v.actionGeo;
  let key = 'base', geo = v.baseGeo, tex = v.baseTex;
  v.motionSource = '';
  v.actorMotionFrame = null;
  if (action) {
    key = 'action'; geo = v.actionGeo; tex = v.actionTex;
  } else if (motionFrame >= 0 && v.motionTex) {
    key = `motion:${motionFrame}`;
    geo = v.motionGeos[motionFrame];
    tex = v.motionTex;
    v.motionSource = 'locomotion';
  }
  v.actionActive = action;
  v.motionFrame = action ? -1 : motionFrame;
  if (key === v.poseKey) return;
  v.poseKey = key;
  v.mesh.geometry = geo;
  v.mat.map = tex;
  v.mat.emissiveMap = tex;
}

export const SPRITE_PRESENTER = Object.freeze({
  id: 'sprite',
  matches: (assets) => !!assets.spriteGeo,
  spawn: (api, context) => api.spawnStandard(context),
  syncPose: syncSpritePose,
  ownsSilhouette: (api, v, e) => e.kind === 'hound' &&
    (v.motionGeos?.length || 0) >= 8 && api.currentMotionFrame(v) >= 0,
  usesLegacyPose: () => true,
  syncMaterial: (api, v, frame) => api.syncPaintedMaterial(v, frame),
  syncTransform: (api, v, e, frame) => api.syncPaintedTransform(v, e, frame),
  prepareRemoval: () => [],
});
