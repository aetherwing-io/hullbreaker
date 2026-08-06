/* Node-safe delivery contract for the production reliquary atlas. The PNG is
   the editable/measured master; the pixel-identical-alpha WebP is the smaller
   runtime copy requested on cold mobile loads. */

export const CAPSULE_ART_ROOT = '../../assets/generated/capsules/';
export const CAPSULE_ART_ATLAS = Object.freeze({
  file: 'capsule-pickups-atlas-v1.webp',
  sourceFile: 'capsule-pickups-atlas-v1.png',
  canvas: Object.freeze([2048, 640]),
});
