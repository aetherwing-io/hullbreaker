/* =============== ACTOR MOTION ATLAS BOOT OWNER ================== */
/* Registers both production sheets before the shared preload gate can close.
   Consumers receive one immutable ready/fallback decision before first RAF. */

import { QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import {
  ACTOR_MOTION_ATLASES, ACTOR_MOTION_KINDS, ACTOR_MOTION_SPEC,
} from './actor-motion-spec.js';

export const ACTOR_MOTION_ON = QUERY.get('sprites') !== '0' &&
  QUERY.get('sprites') !== 'off' && QUERY.get('actormotion') !== '0';

const startedAt = globalThis.performance?.now?.() ?? Date.now();
const atlasRequests = new Map();
for (const [id, art] of Object.entries(ACTOR_MOTION_ATLASES)) {
  atlasRequests.set(id, ACTOR_MOTION_ON
    ? preloadTexture(new URL(art.file, import.meta.url).href, { anisotropy: 8 })
    : null);
}

await awaitPreloads();

const atlasSlots = new Map();
for (const [id, request] of atlasRequests) {
  const entry = request ? await request : null;
  const ready = !!entry && entry.state === 'ready' && !!entry.tex;
  if (entry && !ready) console.warn('HULLBREAKER art: actor motion atlas ' + id +
    ' did not load (' + (entry.error || entry.state) + ') -- retaining base/primitive actors.');
  atlasSlots.set(id, Object.freeze({
    id,
    state: ACTOR_MOTION_ON ? (ready ? 'ready' : 'failed') : 'off',
    tex: ready ? entry.tex : null,
    error: entry && !ready ? (entry.error || entry.state) : null,
    requests: request ? 1 : 0,
    gateMs: entry?.ms ?? null,
  }));
}
const settledAt = globalThis.performance?.now?.() ?? Date.now();

export function actorMotionTexture(kind) {
  const spec = ACTOR_MOTION_SPEC[kind];
  const slot = spec ? atlasSlots.get(spec.atlas) : null;
  return slot?.state === 'ready' ? slot.tex : null;
}

export function actorMotionArtSnapshot() {
  const atlases = {};
  for (const [id, slot] of atlasSlots) {
    const { tex: _tex, ...readable } = slot;
    atlases[id] = { ...readable };
  }
  return {
    enabled: ACTOR_MOTION_ON,
    preloadMs: Math.round((settledAt - startedAt) * 10) / 10,
    settledBeforeConsumer: true,
    requests: [...atlasSlots.values()].reduce((sum, slot) => sum + slot.requests, 0),
    kinds: [...ACTOR_MOTION_KINDS],
    atlases,
  };
}

if (typeof globalThis !== 'undefined') globalThis.__HB_ACTOR_MOTION_ART = actorMotionArtSnapshot;

