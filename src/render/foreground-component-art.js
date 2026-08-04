/* ============ NATIVE-SHAPE FOREGROUND COMPONENT ATLAS OWNER ============ */
/* One reviewed RGBA atlas supplies 32 extracted structural/defense shapes.
 * It settles at the shared preload gate and is never manufactured, retried or
 * loaded per placement. All ambience remains non-emissive; active hazards own
 * separate transient FX. */

import { IS_G1, QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import {
  FOREGROUND_COMPONENT_ATLAS, FOREGROUND_CUTOUT_COMPONENTS,
} from './foreground-component-spec.generated.js';

export const FOREGROUND_COMPONENT_ART_ON = IS_G1 && QUERY.get('world') !== '0' &&
  QUERY.get('components') !== '0';
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const startedAt = clock();
const request = FOREGROUND_COMPONENT_ART_ON ? preloadTexture(
  new URL(FOREGROUND_COMPONENT_ATLAS.file, import.meta.url).href,
  { anisotropy: 8 },
) : null;

await awaitPreloads();

const entry = request ? await request : null;
const image = entry?.tex?.image;
const width = image && (image.naturalWidth || image.videoWidth || image.width);
const height = image && (image.naturalHeight || image.videoHeight || image.height);
const dimensionsReady = width === FOREGROUND_COMPONENT_ATLAS.canvas[0] &&
  height === FOREGROUND_COMPONENT_ATLAS.canvas[1];
const ready = !!entry && entry.state === 'ready' && !!entry.tex && dimensionsReady;
if (entry && !ready) console.warn(
  'HULLBREAKER art: native foreground components unavailable (' +
  (entry.error || (!dimensionsReady ? `dimensions ${width || 0}x${height || 0}` : entry.state)) +
  ') -- ordinary structural geometry remains intact.',
);
if (ready) {
  // Straight-alpha upload plus alpha-to-coverage in the material keeps the
  // reviewed neutral contour through minification. The atlas has an 18px+
  // transparent guard and no green-dominant partial-alpha pixels.
  entry.tex.premultiplyAlpha = false;
  entry.tex.needsUpdate = true;
}

export const FOREGROUND_COMPONENT_ART_SLOT = Object.freeze({
  state: FOREGROUND_COMPONENT_ART_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || `dimensions ${width || 0}x${height || 0}`) : null,
  requests: request ? 1 : 0,
  gpuTextures: ready ? 1 : 0,
  components: FOREGROUND_CUTOUT_COMPONENTS.length,
  emissive: false,
  preloadMs: request ? Math.round((clock() - startedAt) * 10) / 10 : null,
  gateMs: entry?.ms ?? null,
  settledBeforeConsumer: true,
});

export function foregroundComponentArtStats() {
  const { tex: _tex, ...stats } = FOREGROUND_COMPONENT_ART_SLOT;
  return { ...stats, atlas: { ...FOREGROUND_COMPONENT_ATLAS } };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_FOREGROUND_COMPONENT_ART = foregroundComponentArtStats;
