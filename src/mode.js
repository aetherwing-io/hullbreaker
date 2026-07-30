/* ============================= MODE =============================== */
/* Run-mode flags, resolved once from the page URL: which fixture is
   active and whether its hostiles are enabled. A headless host (Node bot
   harness) can set globalThis.__HB_QUERY__ to a query string before
   importing the game to select the same modes without a browser. */

import { TRAVERSAL_FIXTURE } from './pure/traversal.js';
import { TRANSFORM_FIXTURE } from './pure/transform.js';

const SEARCH = typeof globalThis.__HB_QUERY__ === 'string'
  ? globalThis.__HB_QUERY__
  : (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');

export const QUERY = new URLSearchParams(SEARCH);
export const IS_TRAVERSAL_SLICE = QUERY.get('slice') === 'traversal';
export const IS_TRANSFORM_SLICE = QUERY.get('slice') === 'transform';
export const SLICE_ENEMIES_ENABLED = QUERY.get('enemies') !== '0';
// ACTIVE_SLICE stays the traversal fixture specifically: it selects that
// slice's movement overrides, dare pocket and traversal verbs. ACTIVE_FIXTURE
// is the mode-agnostic handle — anything true of *any* authored fixture (its
// run window, scroll floor, spawn point, fast retry) reads this one.
export const ACTIVE_SLICE = IS_TRAVERSAL_SLICE ? TRAVERSAL_FIXTURE : null;
export const ACTIVE_FIXTURE = IS_TRANSFORM_SLICE ? TRANSFORM_FIXTURE : ACTIVE_SLICE;
