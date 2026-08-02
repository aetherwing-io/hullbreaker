/* Fixture, not shipped code. The SECOND independent lane — the one the
   review found losing its asset. Same documented pattern as lane-first.js,
   a different texture, and no knowledge of the other module whatsoever. */

import { awaitPreloads, preloadTexture } from '/src/render/preload.js';

const url = new URL('/assets/generated/sprites/mortar-tripod-b.png', location.href).href;
const entry = preloadTexture(url);
await awaitPreloads();
const settled = await entry;

window.__T049_SECOND = {
  url: settled.url, state: settled.state, ms: settled.ms, error: settled.error,
  hasTexture: !!settled.tex,
};
