/* ================== CROWN MODULAR ART BOOT OWNER ================== */
/* Register the Crown pack before any render consumer can close the shared
   preload gate. Production is exactly two resident textures: one detailed
   command-organ cutout and one 2x2 modular root/core/antenna atlas. The
   legacy comparison loads only its former panorama. crown.js consumes this
   settled slot and never fetches, retries, derives canvases or swaps art
   after the simulation starts. */

import { ACTIVE_FIXTURE, QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';

export const CROWN_ART = Object.freeze({
  core: '../../assets/generated/environment/crown-command-core-runtime-v2.png',
  kit: '../../assets/generated/environment/crown-command-kit-runtime-v2.png',
  coreMaster: '../../assets/generated/environment/crown-command-core-v4.png',
  kitMaster: '../../assets/generated/environment/crown-command-kit-v1.png',
  legacy: '../../assets/generated/backdrops/backdrop-crown-summit-v2.png',
  kitCanvas: Object.freeze([1024, 1024]),
  kitCell: Object.freeze([512, 512]),
  cells: Object.freeze({
    // anchorPx is measured from each source/cell's top-left and denotes the
    // structural attachment interface, not the visual center of the ink.
    core: Object.freeze({
      source: 'core', rect: Object.freeze([0, 0, 1024, 1024]),
      anchorPx: Object.freeze([512, 990]),
    }),
    rootLeft: Object.freeze({
      source: 'kit', col: 0, row: 1, rect: Object.freeze([0, 512, 512, 512]),
      anchorPx: Object.freeze([473, 126]),
    }),
    rootRight: Object.freeze({
      source: 'kit', col: 1, row: 1, rect: Object.freeze([512, 512, 512, 512]),
      anchorPx: Object.freeze([41, 131]),
    }),
    antenna: Object.freeze({
      source: 'kit', col: 1, row: 0, rect: Object.freeze([512, 0, 512, 512]),
      anchorPx: Object.freeze([256, 488]),
    }),
  }),
  stateLayers: Object.freeze({
    approach: Object.freeze(['core', 'rootLeft', 'rootRight', 'antenna', 'closedIris']),
    occupation: Object.freeze(['warden', 'relay0', 'signal0']),
    exposed: Object.freeze(['relay1', 'signal1', 'openingIris']),
    rupture: Object.freeze(['relay2', 'signal2', 'hingedShoulder']),
    signal: Object.freeze(['openIris', 'carrier', 'shockRings']),
  }),
});

const legacy = QUERY.get('crown') === 'legacy';
const enabled = ACTIVE_FIXTURE === null;
const requests = enabled ? (legacy
  ? { legacy: preloadTexture(new URL(CROWN_ART.legacy, import.meta.url).href, { anisotropy: 4 }) }
  : {
      core: preloadTexture(new URL(CROWN_ART.core, import.meta.url).href, { anisotropy: 8 }),
      kit: preloadTexture(new URL(CROWN_ART.kit, import.meta.url).href, { anisotropy: 8 }),
    }) : {};

await awaitPreloads();

const settled = {};
for (const [name, request] of Object.entries(requests)) settled[name] = await request;
const texture = (name) => settled[name]?.state === 'ready' ? settled[name].tex : null;

export const CROWN_ART_SLOT = Object.freeze({
  state: !enabled ? 'off'
    : Object.values(settled).every((entry) => entry.state === 'ready') ? 'ready' : 'fallback',
  variant: legacy ? 'legacy' : 'production',
  core: texture('core'),
  kit: texture('kit'),
  legacy: texture('legacy'),
  requests: Object.keys(requests).length,
  errors: Object.freeze(Object.fromEntries(
    Object.entries(settled)
      .filter(([, entry]) => entry.state !== 'ready')
      .map(([name, entry]) => [name, entry.error || entry.state]),
  )),
  settledBeforeConsumer: true,
});

export function crownArtSnapshot() {
  const dims = (tex) => tex?.image ? [tex.image.width, tex.image.height] : null;
  return {
    state: CROWN_ART_SLOT.state,
    variant: CROWN_ART_SLOT.variant,
    requests: CROWN_ART_SLOT.requests,
    errors: CROWN_ART_SLOT.errors,
    corePixels: dims(CROWN_ART_SLOT.core),
    kitPixels: dims(CROWN_ART_SLOT.kit),
    legacyPixels: dims(CROWN_ART_SLOT.legacy),
    settledBeforeConsumer: CROWN_ART_SLOT.settledBeforeConsumer,
  };
}

if (typeof globalThis !== 'undefined') globalThis.__HB_CROWN_ART = crownArtSnapshot;
