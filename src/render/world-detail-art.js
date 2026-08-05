/* =============== MERIDIAN WORLD-DETAIL BOOT OWNER =============== */
/* The eight environment fixtures are one atlas and one boot decision. This
   dependency-light owner registers that atlas before level.js reaches its
   material/preload graph, waits on the shared gate at module scope, and then
   exports an immutable ready/failed/off slot. level.js only consumes this
   final slot: it never fetches, retries, swaps, or allocates texture state
   while the run is moving. */

import { IS_G1, QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';

const cell = (role, index, ink) => Object.freeze({
  role,
  index,
  col: index % 4,
  row: Math.floor(index / 4),
  ink: Object.freeze(ink),
});

// Pixel-exact production contract. `ink` is [x, y, width, height] within the
// cell, with y measured from its top. Runtime maps the WHOLE 512px cell; the
// bounds only normalize authored apparent size/anchors, so no crop can shave
// a mast, cable, vapor nozzle, or anti-aliased edge.
export const WORLD_DETAIL_ART = Object.freeze({
  file: '../../assets/generated/environment/meridian-detail-atlas-v1.png',
  canvas: Object.freeze([2048, 1024]),
  cellSize: 512,
  cells: Object.freeze([
    cell('gill', 0, [44, 73, 423, 365]),
    cell('pipe-spine', 1, [131, 42, 249, 428]),
    cell('gallery', 2, [76, 40, 359, 432]),
    cell('breach', 3, [71, 60, 370, 392]),
    cell('vent-bank', 4, [32, 111, 448, 289]),
    cell('sensor', 5, [92, 66, 328, 380]),
    cell('exhaust', 6, [77, 79, 357, 354]),
    cell('containment', 7, [95, 79, 321, 353]),
  ]),
});

// Structural world detail remains the production default, but the large
// transparent fixture atlas is now an explicit comparison path.  The first
// version scattered three fully-painted cutouts across every face.  Even with
// exact alpha and a contact-shadow duplicate they read as illustrations laid
// on top of the machine, because their own lighting/perspective could never
// share the route kit's real material response.  Production now builds those
// roles from the same recessed plates, braces, conduits and housings as the
// rest of Meridian.  `?fixtureart=1` keeps the source atlas inspectable while
// we retain it as art-direction reference; absence means no 2048x1024 upload.
export const WORLD_DETAIL_ON = IS_G1 && QUERY.get('world') !== '0' &&
  QUERY.get('detail') !== '0';
export const WORLD_DETAIL_ART_ON = WORLD_DETAIL_ON &&
  QUERY.get('fixtureart') === '1';

const startedAt = globalThis.performance?.now?.() ?? Date.now();
const request = WORLD_DETAIL_ART_ON
  ? preloadTexture(new URL(WORLD_DETAIL_ART.file, import.meta.url).href, { anisotropy: 8 })
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const settledAt = globalThis.performance?.now?.() ?? Date.now();
const ready = !!entry && entry.state === 'ready' && !!entry.tex;
if (entry && !ready) {
  console.warn('HULLBREAKER art: Meridian detail atlas did not load (' +
    (entry.error || entry.state) + ') -- drawing bounded fixture primitives.');
}

export const WORLD_DETAIL_ART_SLOT = Object.freeze({
  state: WORLD_DETAIL_ART_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || entry.state) : null,
  requests: request ? 1 : 0,
  preloadMs: request ? Math.round((settledAt - startedAt) * 10) / 10 : null,
  gateMs: entry ? entry.ms : null,
  residency: ready ? 'gpu' : (WORLD_DETAIL_ART_ON ? 'fallback' : 'off'),
  settledBeforeConsumer: true,
});

export function worldDetailArtStats() {
  const { tex: _tex, ...stats } = WORLD_DETAIL_ART_SLOT;
  return { ...stats };
}

if (typeof globalThis !== 'undefined') globalThis.__HB_WORLD_DETAIL_ART = worldDetailArtStats;
