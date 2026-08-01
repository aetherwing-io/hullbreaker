/* ============================= MODE =============================== */
/* Run-mode flags, resolved once from the page URL: which fixture is
   active, which pacing variant it runs, whether its hostiles are enabled,
   and whether the opt-in score/setback prototypes are on. A headless host
   (Node bot harness) can set globalThis.__HB_QUERY__ to a query string
   before importing the game to select the same modes without a browser. */

import { CONFIG } from './config.js';
import {
  TRAVERSAL_FIXTURE, houndTrialStage, polypTrialStage, resolveTraversalPace,
  traversalEnemyPlan,
} from './pure/traversal.js';
import { TRANSFORM_FIXTURE, selectTransformFixture } from './pure/transform.js';

const SEARCH = typeof globalThis.__HB_QUERY__ === 'string'
  ? globalThis.__HB_QUERY__
  : (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');

export const QUERY = new URLSearchParams(SEARCH);
export const IS_TRAVERSAL_SLICE = QUERY.get('slice') === 'traversal';
// ?g2=1 — the G2 neck access-plate flip gate fixture (docs/proposals/
// 2026-07-meridian-monster-greybox-map.md §G2, "smallest implementation
// experiment" step 2). It runs on the transform-slice machinery with the
// `monster-g2-neck-flip` fixture selected instead of the v1 demo, so
// ?g2=1 alone (or ?slice=transform&g2=1) arms it and every other URL —
// including plain ?slice=transform — keeps the shipped v1 fixture
// byte-identical. Off by default.
export const IS_G2 = QUERY.get('g2') === '1';
export const IS_TRANSFORM_SLICE = QUERY.get('slice') === 'transform' || IS_G2;
// Fixture selection happens HERE, before any module body reads the live
// transform bindings (everything that consumes them imports this module
// first): pure/transform.js exports stay a pure function of this one call.
selectTransformFixture(IS_G2 ? 'monster-g2-neck-flip' : 'transform-v1');
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
// ?g1=1 — the G1 limb-turn experiment (docs/proposals/
// 2026-07-meridian-monster-greybox-map.md, "smallest implementation
// experiment"): the SIX-FACE run, unchanged in every simulated respect, with
// the corner ritual re-read as a camera orbit around a static faceted leg.
// Render-only: it selects the limb bake (src/render/limb.js), its atmosphere,
// and the suppression of the brick-slam zipper's *visuals*. The fixtures own
// their own transitions, so the flag is a normal-run flag only.
export const IS_G1 = ACTIVE_FIXTURE === null && QUERY.get('g1') === '1';
// ?score=1 arms the CHARGE/THREAT prototype; ?fallback=0 restores the old
// ROUTE LOST retry instead of HULL FALLBACK tier 1.
export const SCORE_ENABLED = QUERY.get('score') === '1';
export const SLICE_FALLBACK_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('fallback') !== '0';
// CP4 promotion (T-016): ?fallback=1 arms HULL FALLBACK tier 1 in the DEFAULT
// six-face run too — opt-in and off by default there, unlike the slice's
// on-by-default arming above. Past its streak ceiling the stock lives path is
// the next consequence tier (src/sim/player.js loseLife).
export const RUN_FALLBACK_ENABLED = ACTIVE_FIXTURE === null && QUERY.get('fallback') === '1';
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
  : HOUND_PARAM === 'aim' ? 'aim'
  : HOUND_PARAM === '3' || HOUND_PARAM === 'mix' ? 'mix'
  // ?hound=2.5 — the CP2 iteration point: stage 2's squeeze plus one more
  // route contested. Stage 2 itself stays byte-identical for comparison.
  : HOUND_PARAM === '2.5' || HOUND_PARAM === 'squeeze+' ? 'squeezePlus'
  : HOUND_PARAM === '2' || HOUND_PARAM === 'combo' ? 'combo'
  : 'solo';
export const HOUND_TRIAL_STAGE = houndTrialStage(HOUND_STAGE);
// Opt-in Iris Polyp trial (DESIGN's next teach-then-combine enemy), same shape
// as the hound trial and orthogonal to the pace: ?polyp=1 teaches the beam
// alone, ?polyp=2 adds the hound pricing the drop reroute below the lane.
// Absent — every ordinary URL, including every ?hound= stage — the plan is
// byte-identical to what it fields today.
const POLYP_PARAM = IS_TRAVERSAL_SLICE ? QUERY.get('polyp') : null;
export const POLYP_STAGE =
  POLYP_PARAM === null || POLYP_PARAM === '0' || POLYP_PARAM === 'off' ? null
  : POLYP_PARAM === '2' || POLYP_PARAM === 'combo' ? 'combo'
  : 'solo';
export const POLYP_TRIAL_STAGE = polypTrialStage(POLYP_STAGE);
// The authored hostile list for one slice attempt — resolved once, read by
// resetGame, the self-test, and the HUD so all three can never disagree.
export const SLICE_ENEMY_PLAN = traversalEnemyPlan(ACTIVE_SLICE, HOUND_STAGE, POLYP_STAGE);

// Two independent A/B answers to the operator's 8-way aim gap against low
// targets. Both are opt-in and orthogonal to everything above, so they can be
// judged separately or together: ?crouch=1 lowers the firing line from a
// planted stance, ?aim=assist nudges the shot itself. Absent on every ordinary
// URL, including the six-face run.
export const CROUCH_ENABLED = QUERY.get('crouch') === '1';
export const AIM_ASSIST_ENABLED = QUERY.get('aim') === 'assist';
