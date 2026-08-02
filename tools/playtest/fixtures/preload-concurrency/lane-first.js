/* Fixture, not shipped code. A lane that adopts the boot gate EXACTLY as
   src/render/preload.js documents it: register at module scope, then await
   the gate at module scope. `lane-second.js` is its independent sibling.
   tools/playtest/preload-concurrency-check.mjs loads both and checks that
   BOTH assets end up resident — the property the first version of the gate
   claimed and did not have. */

import { awaitPreloads, preloadTexture } from '/src/render/preload.js';

const url = new URL('/assets/generated/sprites/hound-brace-b.png', location.href).href;
const entry = preloadTexture(url);
await awaitPreloads();
const settled = await entry;

window.__T049_FIRST = {
  url: settled.url, state: settled.state, ms: settled.ms, error: settled.error,
  hasTexture: !!settled.tex,
};
