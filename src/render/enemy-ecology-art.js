/* ============== ENEMY ECOLOGY ATLAS BOOT OWNER ================== */
/* One request joins the shared preload gate before any consumer can settle
   it. The result is immutable for the run: either the validated 3840x1280
   atlas is resident before first RAF, or ecology rows use the complete legacy
   hostile fallback. No source board or manifest is fetched at runtime. */

import { QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { ENEMY_ECOLOGY_ATLAS } from './enemy-ecology-spec.js';

export const ENEMY_ECOLOGY_ART_ON = QUERY.get('sprites') !== '0' &&
  QUERY.get('sprites') !== 'off' && QUERY.get('enemyecology') !== '0';

const startedAt = globalThis.performance?.now?.() ?? Date.now();
const request = ENEMY_ECOLOGY_ART_ON
  ? preloadTexture(new URL(ENEMY_ECOLOGY_ATLAS.file, import.meta.url).href,
    { anisotropy: 8 })
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const image = entry?.tex?.image;
const width = image?.naturalWidth || image?.videoWidth || image?.width || 0;
const height = image?.naturalHeight || image?.videoHeight || image?.height || 0;
const dimensionsMatch = width === ENEMY_ECOLOGY_ATLAS.canvas[0] &&
  height === ENEMY_ECOLOGY_ATLAS.canvas[1];
const ready = !!entry && entry.state === 'ready' && !!entry.tex && dimensionsMatch;
if (entry && !ready) console.warn('HULLBREAKER art: enemy ecology atlas did not load ' +
  `as ${ENEMY_ECOLOGY_ATLAS.canvas.join('x')} (` +
  (entry.error || `${entry.state}, decoded ${width}x${height}`) +
  ') -- retaining legacy hostile art.');
if (entry?.tex) entry.tex.premultiplyAlpha = false;

const slot = Object.freeze({
  state: ENEMY_ECOLOGY_ART_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || `decoded ${width}x${height}`) : null,
  requests: request ? 1 : 0,
  gateMs: entry?.ms ?? null,
  decoded: Object.freeze([width, height]),
});
const settledAt = globalThis.performance?.now?.() ?? Date.now();

export function enemyEcologyTexture() { return slot.tex; }

export function enemyEcologyArtSnapshot() {
  return {
    enabled: ENEMY_ECOLOGY_ART_ON,
    state: slot.state,
    error: slot.error,
    requests: slot.requests,
    gateMs: slot.gateMs,
    preloadMs: Math.round((settledAt - startedAt) * 10) / 10,
    settledBeforeConsumer: true,
    dimensions: [...slot.decoded],
    textureCount: slot.tex ? 1 : 0,
    estimatedGpuBytes: slot.tex ? ENEMY_ECOLOGY_ATLAS.estimatedGpuBytes : 0,
    emissiveMaps: 0,
    runtimeCrops: 0,
    runtimeCanvases: 0,
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_ENEMY_ECOLOGY_ART = enemyEcologyArtSnapshot;

