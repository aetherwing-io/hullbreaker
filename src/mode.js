/* ============================= MODE =============================== */
/* Run-mode flags, resolved once from the page URL: which fixture is
   active, which pacing variant it runs, whether its hostiles are enabled,
   and whether the opt-in score/setback prototypes are on. A headless host
   (Node bot harness) can set globalThis.__HB_QUERY__ to a query string
   before importing the game to select the same modes without a browser. */

import { CONFIG } from './config.js';
import { resolveStartDirection } from './pure/shell.js';
import {
  TRAVERSAL_FIXTURE, houndTrialStage, polypTrialStage, resolveTraversalPace,
  traversalEnemyPlan,
} from './pure/traversal.js';
import { mortarComposePlan, mortarTrialStage } from './pure/mortar.js';
import { ribrunFixture } from './pure/ribrun.js';
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
/* ?ribrun=1 — the AUTHORED SLOPE (src/pure/ribrun.js), the movement lane's
   other live candidate next to FLOW (docs/decisions.md entry 5). It swaps
   the fixture's lattice for one long ascending ribline inside the SAME
   bounds, run window, spawn, pursuit and frozen movement tune, so an
   operator A/B against ?flow=1 compares the geometry and nothing else. It
   adds no input and no verb: run, jump and the launch a contact already
   produces are the whole vocabulary. Off by default; absent, ACTIVE_SLICE
   resolves byte-for-byte as before. Not composed with ?hound=/?polyp=/
   ?hook= — those roster and anchor placements are authored against the
   lattice this overlay replaces. */
export const RIBRUN_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('ribrun') === '1';
// ACTIVE_SLICE stays the traversal fixture specifically: it selects that
// slice's movement overrides, pacing variant, dare pocket and traversal verbs.
export const ACTIVE_SLICE = IS_TRAVERSAL_SLICE
  ? resolveTraversalPace(SLICE_PACE,
      RIBRUN_ENABLED ? ribrunFixture(TRAVERSAL_FIXTURE) : TRAVERSAL_FIXTURE,
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
/* ?momentum=1 — EARNED pace escalation (T-022, decisions.md entry 11): the
   pursuing edge's speed rises with how well the run is being played (where
   RIG sits between the damage plane and the right clamp, plus a decaying kill
   streak) instead of holding CONFIG.scrollSpeed. Policy lives in
   CONFIG.momentum, math in src/pure/momentum.js, the live drive in
   src/sim/pace.js.

   Scoped to the SIX-FACE run (ACTIVE_FIXTURE === null) for the same reason
   ?fallback=1 is: the traversal and transformation fixtures already own their
   pursuit models (the `hunt`/`surge` paces in src/pure/traversal.js), and
   entry 11 is about the faces. Off by default, so every shipped URL and every
   fixture URL keeps the constant scroll it has today, byte for byte. */
export const MOMENTUM_ENABLED = ACTIVE_FIXTURE === null && QUERY.get('momentum') === '1';
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
// Opt-in Spore Mortar trial (DESIGN's last enemy role — delayed landing-zone
// denial), same shape as the hound and polyp trials and orthogonal to the
// pace: ?mortar=1 teaches the lob → mark → delay → detonation cycle alone,
// ?mortar=2 adds the hound patrolling the floor the denial pushes you toward.
// Absent — every ordinary URL, including every ?hound=/?polyp= stage — the
// plan is byte-identical to what it fields today.
const MORTAR_PARAM = IS_TRAVERSAL_SLICE ? QUERY.get('mortar') : null;
export const MORTAR_STAGE =
  MORTAR_PARAM === null || MORTAR_PARAM === '0' || MORTAR_PARAM === 'off' ? null
  : MORTAR_PARAM === '2' || MORTAR_PARAM === 'combo' ? 'combo'
  : 'solo';
export const MORTAR_TRIAL_STAGE = mortarTrialStage(MORTAR_STAGE);
// The authored hostile list for one slice attempt — resolved once, read by
// resetGame, the self-test, and the HUD so all three can never disagree.
export const SLICE_ENEMY_PLAN = mortarComposePlan(
  traversalEnemyPlan(ACTIVE_SLICE, HOUND_STAGE, POLYP_STAGE), MORTAR_STAGE);

// ?juice=0 — the kill flag for the baseline feedback pass (T-011): hit-stop,
// screen shake, muzzle flashes, impact/death/hurt/pickup particles, and the
// crush-edge warning all go inert, and the run is byte-identical to the
// pre-juice game (the sim's dt scale is a constant 1, no fx meshes are built,
// and no bridge hook is wrapped). Absent — every ordinary URL — the pass is ON:
// it is baseline feedback for a shipped mechanic, not an unjudged prototype
// (decisions.md entry 8's delivery mandate), and the operator judges its
// INTENSITY, which is what the flag exists to A/B against.
export const JUICE_ENABLED = QUERY.get('juice') !== '0';

/* ------------------------- game shell (T-013) ---------------------- *
 * The front end: title screen, pause/options, death/restart, run stats.
 *   ?shell=0      the pre-shell boot, byte-for-byte — straight into
 *                 PLAYING with no title screen and no shell panels.
 *   ?shell=title  force the title screen even in an automated session
 *                 (the only way to screenshot it through the bot
 *                 harness, which always appends ?testapi=1).
 *   ?title=climb|wake|crown (or 1|2|3) picks the concept-board-05
 *                 start-screen direction; unjudged, so it stays
 *                 swappable — `wake` is the shipped default.
 *
 * HARNESS CONTRACT: an automated session boots straight into the run.
 * `?testapi=1` (every bot playtest) and `?selftest=1` (the browser smoke
 * test) auto-start, so no committed script can have its first input
 * eaten by a title screen. Even without that, the title consumes no
 * gameplay key — src/pure/shell.js's intent table starts the run on the
 * same press that plays it (asserted in tools/pathcheck.mjs).        */
const SHELL_RAW = QUERY.get('shell');
export const SHELL_ENABLED = SHELL_RAW !== '0';
export const SHELL_AUTOSTART = SHELL_ENABLED && SHELL_RAW !== 'title' &&
  (QUERY.has('testapi') || QUERY.has('selftest'));
export const START_DIRECTION_ID = resolveStartDirection(QUERY.get('title'));

// Two independent A/B answers to the operator's 8-way aim gap against low
// targets. Both are opt-in and orthogonal to everything above, so they can be
// judged separately or together: ?crouch=1 lowers the firing line from a
// planted stance, ?aim=assist nudges the shot itself. Absent on every ordinary
// URL, including the six-face run.
export const CROUCH_ENABLED = QUERY.get('crouch') === '1';
export const AIM_ASSIST_ENABLED = QUERY.get('aim') === 'assist';
