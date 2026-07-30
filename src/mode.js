/* ============================= MODE =============================== */
/* Run-mode flags, resolved once from the page URL: which fixture is
   active, which pacing variant it runs, whether its hostiles are enabled,
   and whether the opt-in score/setback prototypes are on. A headless host
   (Node bot harness) can set globalThis.__HB_QUERY__ to a query string
   before importing the game to select the same modes without a browser. */

import { CONFIG } from './config.js';
import {
  TRAVERSAL_FIXTURE, houndTrialStage, resolveTraversalPace, traversalEnemyPlan,
} from './pure/traversal.js';
import { TRANSFORM_FIXTURE } from './pure/transform.js';

const SEARCH = typeof globalThis.__HB_QUERY__ === 'string'
  ? globalThis.__HB_QUERY__
  : (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');

export const QUERY = new URLSearchParams(SEARCH);
export const IS_TRAVERSAL_SLICE = QUERY.get('slice') === 'traversal';
export const IS_TRANSFORM_SLICE = QUERY.get('slice') === 'transform';
export const SLICE_ENEMIES_ENABLED = QUERY.get('enemies') !== '0';
// ?pace=hunt|swarm|surge selects a CP1 pacing variant; anything else (including
// no flag) resolves to `base`, which is byte-for-byte the shipped pass.
export const SLICE_PACE = QUERY.get('pace') || 'base';
/* Movement-verb prototypes (fleet wave 3), both default OFF and both scoped to
   the slice, so every shipped URL keeps its exact behavior:
     ?hook=1        arms the snap hook / tether (src/sim/hook.js)
     ?hookinput=    which trigger the hook listens to — `key` (default: the
                    dedicated L / E key) or `auto` (a valid anchor grabs itself
                    while airborne, the way a ledge catch does). An A/B for
                    DESIGN's open "jump vs fire vs dedicated" question.
     ?flow=1        arms the momentum spine (src/sim/flow.js) on ANY pace
     ?autobounce=1  a HELD jump re-arms the jump buffer on every landing. The
                    buffer only ever arms on a keydown with !e.repeat, so today
                    a player who holds jump lands and stays there — the root of
                    adversarial F11 (a held-jump policy parked against a
                    one-tile lip for 9.6 s) and a classic feel option in its own
                    right: with it, holding jump reads as "keep bouncing", which
                    is the same intent the momentum spine rewards.            */
export const HOOK_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('hook') === '1';
export const HOOK_INPUT = QUERY.get('hookinput') === 'auto' ? 'auto' : 'key';
export const FLOW_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('flow') === '1';
export const AUTOBOUNCE_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('autobounce') === '1';
// ACTIVE_SLICE stays the traversal fixture specifically: it selects that
// slice's movement overrides, pacing variant, dare pocket and traversal verbs.
export const ACTIVE_SLICE = IS_TRAVERSAL_SLICE
  ? resolveTraversalPace(SLICE_PACE, TRAVERSAL_FIXTURE,
      { hook: HOOK_ENABLED, flow: FLOW_ENABLED })
  : null;
// ACTIVE_FIXTURE is the mode-agnostic handle — anything true of *any* authored
// fixture (its run window, scroll floor, spawn point, fast retry) reads this
// one, so a second fixture does not have to re-plumb the composition root.
export const ACTIVE_FIXTURE = IS_TRANSFORM_SLICE ? TRANSFORM_FIXTURE : ACTIVE_SLICE;
// ?score=1 arms the CHARGE/THREAT prototype; ?fallback=0 restores the old
// ROUTE LOST retry instead of HULL FALLBACK tier 1.
export const SCORE_ENABLED = QUERY.get('score') === '1';
export const SLICE_FALLBACK_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('fallback') !== '0';
// ?view=near|mid|far selects a camera pull-back multiplier (CONFIG.viewScales).
// Operator verdict July 30 ("far feels right", matching concept board 13's
// 3–5% RIG screen fraction): anything unrecognized — including no flag —
// resolves to `far`. `?view=near` (depthMult 1 exactly) remains reachable and
// byte-identical to the pre-view-scale camera for comparison.
const VIEW_RAW = QUERY.get('view');
export const VIEW_ID = CONFIG.viewScales[VIEW_RAW] ? VIEW_RAW : 'far';

// Opt-in houndframe trial (DESIGN: teach → test → remix), orthogonal to the
// pace: ?hound=1 teaches the charge alone, ?hound=2 adds the wasp that contests
// the jump answering it, ?hound=3 remixes the hounds into whatever the selected
// pace already fields. The pace still owns pursuit, movement, and stakes in
// every case, so a trial stage is always played at the operator's chosen pacing.
// Absent — every ordinary URL — the slice keeps its pace's own composition and
// the six-face run never reads this at all.
const HOUND_PARAM = IS_TRAVERSAL_SLICE ? QUERY.get('hound') : null;
export const HOUND_STAGE =
  HOUND_PARAM === null || HOUND_PARAM === '0' || HOUND_PARAM === 'off' ? null
  : HOUND_PARAM === '3' || HOUND_PARAM === 'mix' ? 'mix'
  : HOUND_PARAM === '2' || HOUND_PARAM === 'combo' ? 'combo'
  : 'solo';
export const HOUND_TRIAL_STAGE = houndTrialStage(HOUND_STAGE);
// The authored hostile list for one slice attempt — resolved once, read by
// resetGame, the self-test, and the HUD so all three can never disagree.
export const SLICE_ENEMY_PLAN = traversalEnemyPlan(ACTIVE_SLICE, HOUND_STAGE);
