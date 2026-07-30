/* ============================= MODE =============================== */
/* Run-mode flags, resolved once from the page URL: which fixture is
   active and whether its hostiles are enabled. A headless host (Node bot
   harness) can set globalThis.__HB_QUERY__ to a query string before
   importing the game to select the same modes without a browser. */

import {
  TRAVERSAL_FIXTURE, houndTrialStage, traversalEnemyPlan,
} from './pure/traversal.js';

const SEARCH = typeof globalThis.__HB_QUERY__ === 'string'
  ? globalThis.__HB_QUERY__
  : (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');

export const QUERY = new URLSearchParams(SEARCH);
export const IS_TRAVERSAL_SLICE = QUERY.get('slice') === 'traversal';
export const SLICE_ENEMIES_ENABLED = QUERY.get('enemies') !== '0';
export const ACTIVE_SLICE = IS_TRAVERSAL_SLICE ? TRAVERSAL_FIXTURE : null;

// Opt-in houndframe trial (DESIGN: teach, then test): ?hound=1|solo proves the
// charge alone, ?hound=2|combo adds the wasp that contests the jump answering
// it. Absent — every ordinary URL — the slice keeps its own composition and
// the six-face run never reads this at all.
const HOUND_PARAM = IS_TRAVERSAL_SLICE ? QUERY.get('hound') : null;
export const HOUND_STAGE =
  HOUND_PARAM === null || HOUND_PARAM === '0' || HOUND_PARAM === 'off' ? null
  : HOUND_PARAM === '2' || HOUND_PARAM === 'combo' ? 'combo'
  : 'solo';
export const HOUND_TRIAL_STAGE = houndTrialStage(HOUND_STAGE);
// The authored hostile list for one slice attempt — resolved once, read by
// resetGame, the self-test, and the HUD so all three can never disagree.
export const SLICE_ENEMY_PLAN = traversalEnemyPlan(ACTIVE_SLICE, HOUND_STAGE);
