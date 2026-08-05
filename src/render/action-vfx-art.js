/* ==================== ACTION VFX V2 BOOT OWNER =================== */
/* Register the one approved 1024px atlas with the shared boot gate.  The
 * runtime receives one immutable ready/failed/off decision and therefore
 * cannot fetch, decode, retry, clone, or upload texture state during play. */

import { JUICE_ENABLED, QUERY } from '../mode.js';
import { ACTION_VFX_ATLAS, ACTION_VFX_COMPONENTS } from './action-vfx-spec.js';
import { awaitPreloads, preloadTexture } from './preload.js';

export const ACTION_VFX_ART_ON = JUICE_ENABLED && QUERY.get('actionvfx') !== '0';

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const startedAt = clock();
const request = ACTION_VFX_ART_ON
  ? preloadTexture(new URL(ACTION_VFX_ATLAS.file, import.meta.url).href,
      { anisotropy: 6 })
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const image = entry?.tex?.image;
const width = image && (image.naturalWidth || image.videoWidth || image.width);
const height = image && (image.naturalHeight || image.videoHeight || image.height);
const dimensionsReady = width === ACTION_VFX_ATLAS.canvas[0] &&
  height === ACTION_VFX_ATLAS.canvas[1];
const ready = !!entry && entry.state === 'ready' && !!entry.tex && dimensionsReady;

if (entry && !ready) console.warn(
  'HULLBREAKER art: action VFX v2 atlas unavailable (' +
  (entry.error || (!dimensionsReady ? `dimensions ${width || 0}x${height || 0}` : entry.state)) +
  ') -- action paint remains dormant.',
);

if (ready) {
  entry.tex.premultiplyAlpha = false;
  entry.tex.needsUpdate = true;
}

export const ACTION_VFX_ART_SLOT = Object.freeze({
  state: ACTION_VFX_ART_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready
    ? (entry.error || `dimensions ${width || 0}x${height || 0}`) : null,
  requests: request ? 1 : 0,
  gpuTextures: ready ? 1 : 0,
  estimatedGpuBytes: ready ? ACTION_VFX_ATLAS.estimatedGpuBytes : 0,
  atlas: Object.freeze([...ACTION_VFX_ATLAS.canvas]),
  components: ACTION_VFX_COMPONENTS.length,
  preloadMs: request ? Math.round((clock() - startedAt) * 10) / 10 : null,
  gateMs: entry?.ms ?? null,
  settledBeforeConsumer: true,
});

export function actionVfxArtStats() {
  const { tex: _tex, ...stats } = ACTION_VFX_ART_SLOT;
  return { ...stats };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_ACTION_VFX_ART = actionVfxArtStats;
