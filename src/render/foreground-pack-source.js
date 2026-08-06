/* Dependency-free delivery contract for the reviewed foreground atlas.
 * Keeping this separate lets the boot root register its request before any
 * optional enemy/endgame art owner reaches the shared preload gate. */

export const FOREGROUND_PACK_SOURCE = Object.freeze({
  // The PNG remains the reviewed/source master. Runtime uses the same art in
  // a compact WebP copy so the 2048px atlas can clear an iPhone cold start.
  file: '../../assets/generated/environment/meridian-foreground-pack-v1.webp',
  sourceFile: '../../assets/generated/environment/meridian-foreground-pack-v1.png',
  canvas: Object.freeze([2048, 2048]),
});
