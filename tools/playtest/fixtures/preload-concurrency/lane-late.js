/* Fixture, not shipped code. THE CASE NO BEHAVIOURAL CONDITION COVERED —
   found by the reviewer, who patched a scratch copy to let a post-close
   registration fall through to the normal load path (reintroducing the
   mid-run-upload defect the whole gate exists to prevent) and watched
   pathcheck AND every condition in preload-concurrency-check.mjs stay green.
   The only guard on the refusal path was a source-literal `state: 'refused'`
   match, which is an assertion about how the code LOOKS.

   This module asks for an asset only AFTER `awaitPreloads()` has already
   resolved — i.e. strictly after the gate closed, which is the one thing
   `preloadTexture()` must refuse. It deliberately requests a REAL file that
   nothing else in the fixture set uses (hound-brace-a, the variant this lane
   does not ship), so that if the refusal ever broke, the request would
   genuinely load and the check would see a texture appear. */

import { awaitPreloads, preloadTexture } from '/src/render/preload.js';

await awaitPreloads();                   // the gate is now shut

const late = await preloadTexture(
  new URL('/assets/generated/sprites/hound-brace-a.png', location.href).href);

window.__T049_LATE = {
  url: late.url, state: late.state, ms: late.ms, error: late.error,
  hasTexture: !!late.tex,
};
