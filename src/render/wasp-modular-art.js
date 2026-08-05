/* One immutable boot decision for the compact modular wasp atlas. */

import { QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { WASP_MODULAR_SPEC } from './wasp-modular-spec.js';

// The old modular sheet remains a useful A/B and a complete fallback, but its
// independently painted pieces collapse into a pale claw at shipped scale.
// The pixel-authored complete-body loop is production; request modular art
// explicitly with ?waspmod=1 when comparing the two systems.
export const WASP_MODULAR_ON = QUERY.get('sprites') !== '0' &&
  QUERY.get('sprites') !== 'off' &&
  (QUERY.get('waspmod') === '1' || QUERY.get('waspmod') === 'on');

const request = WASP_MODULAR_ON
  ? preloadTexture(new URL(WASP_MODULAR_SPEC.runtime.file, import.meta.url).href,
    { anisotropy: 8 })
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const ready = !!entry && entry.state === 'ready' && !!entry.tex;
if (entry && !ready) console.warn('HULLBREAKER art: modular wasp atlas did not load (' +
  (entry.error || entry.state) + ') -- retaining the existing complete-body flight atlas.');

const slot = Object.freeze({
  state: WASP_MODULAR_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || entry.state) : null,
  requests: request ? 1 : 0,
  gateMs: entry?.ms ?? null,
});

export function waspModularTexture() { return slot.tex; }

export function waspModularArtSnapshot() {
  return {
    enabled: WASP_MODULAR_ON,
    state: slot.state,
    error: slot.error,
    requests: slot.requests,
    gateMs: slot.gateMs,
    textureCount: slot.tex ? 1 : 0,
    estimatedGpuBytes: slot.tex ? WASP_MODULAR_SPEC.runtime.estimatedGpuBytes : 0,
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_WASP_MODULAR_ART = waspModularArtSnapshot;
