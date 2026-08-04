export const PRIMITIVE_PRESENTER = Object.freeze({
  id: 'primitive',
  matches: () => true,
  spawn: (api, context) => api.spawnStandard(context),
  syncPose: () => {},
  ownsSilhouette: () => false,
  usesLegacyPose: () => true,
  syncMaterial: (api, v, frame) => api.syncPaintedMaterial(v, frame),
  syncTransform: (api, v, e, frame) => api.syncPrimitiveTransform(v, e, frame),
  prepareRemoval: () => [],
});
