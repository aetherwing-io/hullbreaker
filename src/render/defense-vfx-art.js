/* ================ MERIDIAN DEFENSE VFX BOOT OWNER ================ */
/* The approved 64-component response pack is one immutable 1024x512 atlas.
 * Register it before the shared preload gate closes, then publish one final
 * ready/failed/off decision. The runtime renderer never fetches, retries,
 * crops, clones, or swaps texture state while the climb is moving. */

import { IS_G1, QUERY } from '../mode.js';
import { DEFENSE_VFX_PACK } from './defense-vfx-pack.js';
import { awaitPreloads, preloadTexture } from './preload.js';

export const DEFENSE_VFX_ART_ON = IS_G1 && QUERY.get('world') !== '0' &&
  QUERY.get('defensevfx') !== '0';

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const startedAt = clock();
const request = DEFENSE_VFX_ART_ON
  ? preloadTexture(new URL(DEFENSE_VFX_PACK.runtime.file, import.meta.url).href,
      { anisotropy: 6 })
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const image = entry?.tex?.image;
const width = image && (image.naturalWidth || image.videoWidth || image.width);
const height = image && (image.naturalHeight || image.videoHeight || image.height);
const dimensionsReady = width === DEFENSE_VFX_PACK.runtime.canvas[0] &&
  height === DEFENSE_VFX_PACK.runtime.canvas[1];
const ready = !!entry && entry.state === 'ready' && !!entry.tex && dimensionsReady;
if (entry && !ready) console.warn(
  'HULLBREAKER art: Meridian defense VFX atlas unavailable (' +
  (entry.error || (!dimensionsReady ? `dimensions ${width || 0}x${height || 0}` : entry.state)) +
  ') -- native shutters remain active; generated pressure/debris punctuation is omitted.',
);
if (ready) {
  entry.tex.premultiplyAlpha = false;
  entry.tex.needsUpdate = true;
}

export const DEFENSE_VFX_ART_SLOT = Object.freeze({
  state: DEFENSE_VFX_ART_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || `dimensions ${width || 0}x${height || 0}`) : null,
  requests: request ? 1 : 0,
  gpuTextures: ready ? 1 : 0,
  estimatedGpuBytes: ready ? DEFENSE_VFX_PACK.runtime.estimatedGpuBytes : 0,
  components: DEFENSE_VFX_PACK.components.length,
  preloadMs: request ? Math.round((clock() - startedAt) * 10) / 10 : null,
  gateMs: entry?.ms ?? null,
  settledBeforeConsumer: true,
});

export function defenseVfxArtStats() {
  const { tex: _tex, ...stats } = DEFENSE_VFX_ART_SLOT;
  return { ...stats };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_DEFENSE_VFX_ART = defenseVfxArtStats;
