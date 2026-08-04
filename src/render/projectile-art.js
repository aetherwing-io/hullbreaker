/* ================= PROJECTILE ART BOOT OWNER ===================== */
/* This tiny module exists to register the projectile chassis atlas before
   render modules with heavier dependency graphs begin evaluating. In
   particular bullets.js depends on fx.js -> post.js; post owns a separate
   top-level boot settlement, so registering from bullets.js itself arrived
   after the shared texture gate had already closed on every normal boot.

   Keep this owner dependency-light and import it from main.js immediately
   after scene.js. It joins the ONE preload budget, awaits that exact gate at
   module scope, then exports a frozen final contract. Consumers never load,
   retry, or swap a texture during play. */

import { QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { spritesEnabled } from './sprite-table.js';

export const PROJECTILE_ART = Object.freeze({
  file: '../../assets/generated/projectiles/projectile-chassis-atlas-v1.png',
  canvas: Object.freeze([1280, 256]),
  cell: Object.freeze([256, 256]),
  order: Object.freeze(['R', 'S', 'L', 'H', 'F']),
});

export const PROJECTILE_ART_ON = spritesEnabled(QUERY.get('sprites'));
const startedAt = globalThis.performance?.now?.() ?? Date.now();
const request = PROJECTILE_ART_ON
  ? preloadTexture(new URL(PROJECTILE_ART.file, import.meta.url).href)
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const settledAt = globalThis.performance?.now?.() ?? Date.now();
const ready = !!entry && entry.state === 'ready' && !!entry.tex;
if (entry && !ready) {
  console.warn('HULLBREAKER art: projectile chassis atlas did not load (' +
    (entry.error || entry.state) + ') -- drawing manufactured geometry fallbacks.');
}

// Immutable final state: by the time any consumer can evaluate this object,
// shared-gate success or complete fallback has already been decided.
export const PROJECTILE_ART_SLOT = Object.freeze({
  state: PROJECTILE_ART_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || entry.state) : null,
  requests: request ? 1 : 0,
  preloadMs: request ? Math.round((settledAt - startedAt) * 10) / 10 : null,
  gateMs: entry ? entry.ms : null,
  residency: ready ? 'gpu' : 'fallback',
  settledBeforeConsumer: true,
});

