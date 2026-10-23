/* T-102 — the corner turns work every time, proved by PLAYING them.
 *
 * Every assertion in the matrix below is about what a player can do and see,
 * driven through the shipped six-face simulation by tools/simlab/lib/
 * turn-proof.mjs (fresh Node child per run, every default verb on: momentum,
 * CHARGE, HULL FALLBACK, aim assist, hit-stop). Each run plays all five turns
 * and the Crown approach (corner 6) under one closed-loop policy and records
 * per-tick violations of the turn contract:
 *
 *   envelope    |ds|,|dy| per tick within the frozen movement envelope, and a
 *               designed relocation (respawn / HULL FALLBACK) lands RIG inside
 *               the owned route window and never pops afterwards
 *   hinge       RIG never sinks through the joint apron or dies falling there
 *   gate        (held gates — the `?gates=legacy` escape hatch since T-201)
 *               a gate never stays shut once its last gating body is gone
 *               (bound: the same tick), never sits idle at its halt, and never
 *               shows nothing of its encounter for longer than one 900 ms
 *               entrance beat while it is shut (gate legibility)
 *   neverWait   (rolling corners, the default since T-201 — decisions.md entry
 *               23 #2; REPLACES the gate family on those runs) RIG is never
 *               held more than 0.2 s against a closed joint; the halt always
 *               arms; no beat waits beyond its 6 s bound; every staged or
 *               re-entering body condenses inside the projected frame on the
 *               camera's facet (>= 6 tiles inside the damage plane on a
 *               landscape view); every body that followed RIG round a corner
 *               re-enters before the next turn; the HUD line fits ~28
 *               characters and never calls a live encounter broken
 *   turn        approach + RIG at the bend fires the turn on that tick; a turn
 *               never fires with RIG off the bend; all six corners complete
 *   facet       RIG's facet and the camera's facing facet never go backwards
 *               on a forward run; RIG is never culled by the fold
 *   ratchet     yaw lands exactly +60 deg per corner inside its designed
 *               wind-up/overshoot envelope with no step beyond the curve's
 *               own steepest per-tick step; the scroll never runs backwards
 *   framing     RIG never leaves the frame further than the flat-face clamp
 *               already allows
 *
 * Bounds and policies are documented in tools/simlab/TURNLAB.md, with the
 * falsification record in reports/tasks/T-102/build.md.
 *
 * TWO TIERS. The full matrix (41 played runs, minutes on a loaded host) runs
 * by default. HB_GATE_FAST=1 is the per-edit tier: every static guard below,
 * plus the four played runs in FAST_SUBSET (one per fixed defect a played run
 * guards, and the operator's device). It prints one SKIP line naming the
 * played runs it did not run; skipped runs are NOT counted as passes. The
 * subset is drawn from matrix() itself, so a fast run is the same run with the
 * same options as its full-matrix twin. Falsified in fast mode:
 * `node tools/simlab/turnlab-falsify.mjs --fast-domain --only P1,P2,P3`.  */

import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';
import { PORTRAIT_SAFE } from '../simlab/lib/sixface-host.mjs';
import { runMatrix } from '../simlab/turnlab.mjs';

export const title = 'T-102: every corner turn, played headlessly under player policies';

const COMMON_FAMILIES = Object.freeze({
  envelope: ['teleport', 'popAfterRelocation', 'relocateOutsideOwnedRoute'],
  hinge: ['hingeFallThrough', 'hingeFallDeath', 'capsuleThroughDeck'],
  turn: ['approachAtBendNoTurn', 'turnWithoutRigAtBend', 'turnSkippedApproach'],
  facet: ['playerFacetBackwards', 'cameraFacetBackwards', 'rigCulledByFold'],
  ratchet: ['ratchetOutOfEnvelope', 'ratchetBaseMismatch', 'cameraYawJump', 'scrollBackwards'],
  framing: ['rigOffScreen'],
});
// Held gates (?gates=legacy) keep T-102's gate family verbatim. Rolling
// corners (the default) replace it with the never-wait family: the same
// player-facing promise — the climb never stalls on something the player
// cannot see or act on — stated for a corner that does not hold at all.
const GATE_FAMILY = Object.freeze({
  gate: ['gateShutWithKillConditionMet', 'haltedButIdle', 'gateBlind', 'hudLastButMore'],
});
const NEVER_WAIT_FAMILY = Object.freeze({
  neverWait: ['turnWaitedAfterArrival', 'haltedButIdle', 'beatOverBound', 'stagedOutsideView',
    'carriedInvisible', 'carryLost', 'hudTooLong', 'hudBrokenButAlive', 'gateStateInRolling'],
});
export function familiesFor(rolling) {
  return { ...COMMON_FAMILIES, ...(rolling ? NEVER_WAIT_FAMILY : GATE_FAMILY) };
}

const LANDSCAPE_POLICIES = [
  'run', 'jump', 'jump2', 'idle', 'backtrack', 'backtrack-approach',
  'die-at-hinge', 'die-mid-turn', 'die-after-turn', 'hit-mid-turn',
  'pause-mid-turn', 'resize-mid-turn', 'resize-gate', 'drop-at-hinge',
  'pop-weapon-at-hinge',
];

function matrix() {
  const list = [];
  for (const viewport of ['desktop', 'phoneLandscape'])
    for (const policy of LANDSCAPE_POLICIES) list.push({ policy, viewport });
  for (const policy of ['run', 'die-at-hinge', 'resize-approach-late'])
    list.push({ policy, viewport: 'phonePortrait' });
  // the one shipped framing narrow enough to need the cleared-gate approach
  // dolly, widened mid-approach (the scroll must not rewind)
  list.push({ policy: 'resize-approach-late', viewport: 'narrowTall' });
  // momentum off: RIG rides the calibrated right clamp for whole stretches,
  // which is the only way the framing bound is actually exercised
  for (const viewport of ['desktop', 'phoneLandscape'])
    list.push({ policy: 'run', viewport, query: 'momentum=0' });
  // the stock-lives tier (no HULL FALLBACK) dying on the turning joint
  for (const viewport of ['desktop', 'phoneLandscape'])
    list.push({ policy: 'stock-life-at-hinge', viewport, query: 'fallback=0' });
  // gate legibility: a steady gunner that can only shoot what is on screen
  for (const viewport of ['desktop', 'phoneLandscape', 'phonePortrait'])
    list.push({ policy: 'run', viewport, gunnerMode: 'paced', paceMs: 1400, maxTicks: 60 * 900 });
  // T-201: the no-softlock proof — a run that never fires a shot must still
  // take every corner (the turn never waits on a kill)
  for (const viewport of ['desktop', 'phoneLandscape', 'phonePortrait'])
    list.push({ policy: 'run', viewport, gunnerMode: 'none' });
  // T-201: the held-gate escape hatch keeps T-102's gate guards — D2 (no
  // gate waits on a body off screen) with today's scroll, and the held gate
  // under the follow-lead
  for (const viewport of ['desktop', 'phoneLandscape', 'phonePortrait'])
    list.push({ policy: 'run', viewport, gunnerMode: 'paced', paceMs: 1400, maxTicks: 60 * 900,
      query: 'gates=legacy&follow=0' });
  list.push({ policy: 'run', viewport: 'desktop', query: 'gates=legacy' });
  // T-201 R4 A/B (?hinge=flow, off by default): RIG released at the camera
  // hand-off must still satisfy every turn family
  for (const viewport of ['desktop', 'phoneLandscape'])
    list.push({ policy: 'run', viewport, query: 'hinge=flow' });
  return list.map((o) => ({ god: true, reactionMs: 350, ...o }));
}

// HB_GATE_FAST=1: one played run per fixed defect that only a played run can
// catch, plus a plain run on the operator's device. D4 and D5 are guarded by
// static checks, which run in both tiers.
//   [policy, viewport, gunnerMode]
const FAST_SUBSET = Object.freeze([
  ['die-at-hinge', 'desktop', 'oracle'],               // D1: relocations honour the sealed fold
  ['run', 'phonePortrait', 'paced'],                   // D2's successor: never wait, every body in frame
  ['resize-approach-late', 'narrowTall', 'oracle'],    // D3: the scroll never rewinds
  ['run', 'phoneLandscape', 'oracle'],                 // 844x390: the plain run on the primary device
  ['run', 'phoneLandscape', 'none'],                   // T-201: a run that never fires takes every corner
]);

export function fastSubset(list = matrix()) {
  return list.filter((o) => !o.query && FAST_SUBSET.some(([policy, viewport, gunner]) =>
    o.policy === policy && o.viewport === viewport && (o.gunnerMode || 'oracle') === gunner));
}

export async function run() {
  await staticChecks();
  const full = matrix();
  if (process.env.HB_GATE_FAST === '1') {
    const fast = fastSubset(full);
    console.log(`SKIP t-102-corner-turns: ${full.length - fast.length} of ${full.length} played turn ` +
      `runs not run (HB_GATE_FAST=1 — per-edit tier; not counted as passes; unset it for the full matrix)`);
    ok(fast.length === FAST_SUBSET.length,
      `T-102: every fast-tier run is a run of the full matrix (${fast.length} of ${FAST_SUBSET.length} found)`);
    // Four short runs: one child per run (up to one per core) so the tier
    // finishes in about one run's wall time.
    await playedChecks(fast, Math.max(1, Math.min(fast.length, cpus().length)));
    return;
  }
  await playedChecks(full);
}

// Drift guards, the reveal rule and the gate-legibility predicate: fast,
// no child processes (tools/simlab/turnlab-falsify.mjs calls this alone).
export async function staticChecks() {
  /* ---- drift guards: the replica must still be the shipped loop ------- */
  const main = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  const updateBody = (main.match(/function update\(dt\)\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  const SIM_CALLS = ['advanceGameMs', 'stepHitStop', 'updateScroll', 'updateSpawner',
    'updateMeridianDefense', 'updatePlayer', 'updateHostiles', 'updateCapsules',
    'updateMods', 'updateBullets', 'updateScore', 'startFinale', 'updateFinale', 'finaleComplete'];
  const order = [...updateBody.matchAll(/\b([A-Za-z]\w*)\s*\(/g)].map((m) => m[1])
    .filter((name) => SIM_CALLS.includes(name));
  ok(JSON.stringify(order) === JSON.stringify(SIM_CALLS),
    'T-102: src/main.js update() still steps the sim in the order tools/simlab/lib/sixface-host.mjs ' +
    'transcribes (got ' + order.join(' > ') + ')');
  ok(/if \(state !== 'PLAYING'\) return;[\s\S]*updateHostiles/.test(updateBody),
    'T-102: update() still returns between updatePlayer and updateHostiles when RIG\'s frame ended the run');
  const camera = stripComments(readFileSync(join(srcDir, 'render', 'camera.js'), 'utf8'));
  const safe = camera.match(/PORTRAIT_SAFE = Object\.freeze\(\{([\s\S]*?)\}\)/);
  const parsed = safe ? Object.fromEntries([...safe[1].matchAll(/(\w+):\s*([\d.]+)/g)]
    .map((m) => [m[1], +m[2]])) : null;
  ok(parsed && JSON.stringify(parsed) === JSON.stringify({ ...PORTRAIT_SAFE }),
    'T-102: the replica\'s edge calibration uses render/camera.js\'s PORTRAIT_SAFE verbatim');
  const reset = stripComments(readFileSync(join(srcDir, 'boot', 'run-reset.js'), 'utf8'));
  const ids = [...reset.matchAll(/\{\s*id:\s*'([\w-]+)'/g)].map((m) => m[1]);
  ok(JSON.stringify(ids) === JSON.stringify(['slice-retry', 'input-keys', 'hostiles', 'corpses',
    'projectiles', 'projectile-tracers', 'capsules', 'starter-weapon', 'weapon-kills', 'modifiers',
    'carrier-drops', 'scroll', 'pace', 'score', 'spawner', 'meridian-defense', 'finale',
    'hostile-rng', 'kill-count', 'shot-count', 'player', 'flow',
    'corner-events', 'transform', 'hit-stop', 'camera-yaw', 'future-faces', 'juice-presentation',
    'slice-stats']),
    'T-102: the run-reset registry is the one the replica transcribes, row for row');

  /* ---- the static-anatomy reveal: whole facets, never column by column -- */
  // Default (?zip absent) ownership is camera-facet topology alone; the sim's
  // zipper-era construction rows are an input only under ?zip=1.
  const PATH = await import('../../src/pure/path.js');
  const WAVES = await import('../../src/pure/waves.js');
  const { CONFIG } = await import('../../src/config.js');
  let handoffMs = 0;
  while (WAVES.cornerYawDeltaDeg(handoffMs, CONFIG) / (2 * CONFIG.path.turnDeg) < 0.96) handoffMs++;
  for (let k = 1; k <= CONFIG.path.faces; k++) {
    let arriving = 0, shown = 0, leaked = 0;
    for (let column = 0; column < CONFIG.levelLength; column++) {
      const s = column + 0.5;
      const owner = PATH.worldFacetAt(s, CONFIG, PATH.BEND_S);
      const visible = PATH.routeRenderOwned(s, true, PATH.HALT_S[k - 1], k, CONFIG, PATH.BEND_S);
      if (owner === k) { arriving++; if (visible) shown++; } else if (visible) leaked++;
    }
    ok(arriving > 0 && shown === arriving && leaked === 0,
      `T-102: at the ${handoffMs} ms camera handoff of corner ${k} the default reveal shows all ` +
      `${arriving} rows of the arriving facet at once and nothing else (got ${shown}, ${leaked} leaked)`);
    const preBend = PATH.CORNER_S[k - 1] + 0.5;
    ok(PATH.worldFacetAt(preBend, CONFIG, PATH.BEND_S) === k - 1 &&
       PATH.routeRenderOwned(preBend, true, PATH.HALT_S[k - 1], k - 1, CONFIG, PATH.BEND_S),
      `T-102: corner ${k}'s pre-bend column (the deck RIG holds the gate from) is drawn before the turn`);
  }
  const routeSrc = stripComments(readFileSync(join(srcDir, 'render', 'route-visibility.js'), 'utf8'));
  // Behaviour of the SHIPPED function, not its text: evaluate render/
  // route-visibility.js's routeRenderable (three.js-free arithmetic) against
  // the simulation's real construction state at the camera handoff.
  // T-201 (decisions.md entries 21, 25): the sim no longer keeps a zipper
  // build schedule — every six-face column exists from boot (sim/level.js) —
  // so the construction rows are the SIM's own columnBuilt(), read live, and
  // the old "?zip=1 keeps its assembling reveal" pin is replaced: neither
  // reveal flag can draw a construction prefix any more (T-121 deletes the
  // flag's render half; entry 25 released it).
  {
    const LV = await import('../../src/sim/level.js');
    const start = routeSrc.indexOf('function routeRenderable(');
    let depth = 0, end = -1;
    for (let i = routeSrc.indexOf('{', start); i < routeSrc.length; i++) {
      if (routeSrc[i] === '{') depth++;
      else if (routeSrc[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    const build = (deps) => Function(...Object.keys(deps),
      `"use strict"; return (${routeSrc.slice(start, end)});`)(...Object.values(deps));
    const k = 1;
    LV.unbuildFutureFaces();                            // the boot/reset row, as shipped
    const builtNow = (s) => {                           // render/route-visibility.js routeColumnBuilt
      const column = Math.floor(s);
      return column < 0 || column >= LV.LEVEL_LEN || LV.columnBuilt(column);
    };
    const visibleArriving = (isG1) => {
      const routeRenderable = build({
        ACTIVE_FIXTURE: null, IS_G1: isG1, CONFIG, BEND_S: PATH.BEND_S,
        routeRenderOwned: PATH.routeRenderOwned, scrollX: PATH.HALT_S[k - 1],
        cameraFacingFacet: () => k, routeColumnBuilt: builtNow,
      });
      let shown = 0, rows = 0;
      for (let column = 0; column < CONFIG.levelLength; column++) {
        if (PATH.worldFacetAt(column + 0.5, CONFIG, PATH.BEND_S) !== k) continue;
        rows++;
        if (routeRenderable(column + 0.5)) shown++;
      }
      return { shown, rows };
    };
    const g1 = visibleArriving(true), zip = visibleArriving(false);
    ok(start >= 0 && end > start && g1.shown === g1.rows,
      `T-102: the shipped routeRenderable draws the whole arriving facet (${g1.rows} rows) at the ` +
      `${handoffMs} ms handoff under the default reveal, not a construction prefix (drew ${g1.shown})`);
    ok(zip.shown === zip.rows && zip.rows === g1.rows,
      `T-201: with no sim build state, even the retired ?zip=1 branch of routeRenderable draws the ` +
      `whole arriving facet at the handoff (${zip.shown} of ${zip.rows} rows): nothing in the sim ` +
      `assembles the creature's anatomy any more (entries 3, 25)`);
  }
  ok(/IS_G1 \|\| routeColumnBuilt\(s\)/.test(routeSrc) &&
     /if \(IS_G1\) return `\$\{currentWorldFacet\(\)\}`/.test(routeSrc),
    'T-102: render/route-visibility.js reads construction rows only under ?zip=1, and its cache stamp ' +
    'changes only at facet handoffs under the default reveal');

  /* ---- the gate's remaining requirement, as the HUD prints it ---------- */
  const enterMs = CONFIG.wasp.enterMs;
  const row = (gating, present, extra = {}) => ({
    encounterKey: 'gate:9', gating, enterUntil: present ? 0 : 1e9, ...extra });
  const say = (rows) => WAVES.gateRequirementText
    ? WAVES.gateRequirementText(WAVES.gateRequirement(rows, 'gate:9', 1000, enterMs)) : '(missing)';
  ok(say([row(true, true)]) === 'LAST SIGNAL · CLOSING' &&
     say([row(true, true), row(false, true)]) === 'LAST SIGNAL · CLOSING',
    'T-102: the gate HUD says LAST SIGNAL exactly when one more kill opens the gate');
  ok(say([row(true, true), row(true, false)]) === '1 HOSTILE · +1 INBOUND' &&
     say([row(false, true), row(true, false), row(true, false)]) === '1 HOSTILE · +2 INBOUND' &&
     say([row(true, false)]) === '+1 INBOUND' &&
     say([row(true, true), row(true, true)]) === '2 HOSTILES' &&
     say([row(true, true), row(true, false, { gateBreakExit: true })]) === 'LAST SIGNAL · CLOSING',
    'T-102: gating bodies parked behind the current beat are announced, retired rows are not ' +
    `(got "${say([row(true, true), row(true, false)])}")`);
  const hudSrc = stripComments(readFileSync(join(srcDir, 'ui', 'hud.js'), 'utf8'));
  ok(/c\.state === 'gate'[\s\S]{0,200}gateRequirementText\(\s*gateRequirement\(hostiles, c\.encounterKey, gameMs, CONFIG\.wasp\.enterMs\)\)/
       .test(hudSrc),
    'T-102: the held-gate HUD line prints gateRequirementText(gateRequirement(...)) — the proof checks that text');

  /* ---- the gate-legibility rule, as a pure predicate ------------------- */
  const WG = await import('../../src/sim/wavegate.js');
  ok(typeof WG.gateRowOutsideHeldView === 'function' && typeof WG.retireUnseenGateRows === 'function',
    'T-102: the wave gate exposes its held-view legibility rule');
  if (typeof WG.gateRowOutsideHeldView === 'function') {
    const out = (x) => WG.gateRowOutsideHeldView({ x, shotR: 0.9, hitR: 0.6 }, 271.99, 290.98);
    ok(out(265.25) && !out(271.5) && !out(291.6) && out(292.2),
      'T-102: a gate body is outside the held view only when its whole circle is (the 390x844 ' +
      'CONTAIN Iris at x 265.25 vs the [272, 291] strip is; a body still half on screen is not)');
  }

}

// The played matrix: every policy, every corner, fresh child per run.
export async function playedChecks(list = matrix(), jobs = Math.max(1, Math.min(3, cpus().length - 1))) {
  let results = [];
  try {
    results = await runMatrix(list, jobs);
  } catch (error) {
    console.error('pathcheck: T-102 turn matrix child failed: ' + error.message);
  }
  ok(results.length === list.length, `T-102: all ${list.length} played turn runs completed`);
  for (const r of results) {
    const vp = `${r.viewport.width}x${r.viewport.height}`;
    const tag = `${r.policy}${r.gunnerMode === 'paced' ? '/paced-gunner' : ''}` +
      `${r.query ? '?' + r.query : ''} @${vp}`;
    ok(r.finishedCorners === 6 && r.endState === 'VICTORY',
      `T-102 [${tag}]: all five turns and the Crown approach complete and the run reaches VICTORY ` +
      `(${r.finishedCorners}/6, ${r.endState})`);
    for (const [family, kinds] of Object.entries(familiesFor(r.rolling))) {
      const hits = kinds.map((k) => [k, r.counts[k] || 0]).filter(([, n]) => n > 0);
      const first = hits.length ? r.violations.find((v) => kinds.includes(v.kind)) : null;
      ok(hits.length === 0,
        `T-102 [${tag}]: ${family} contract holds on every tick` +
        (hits.length ? ` — ${hits.map(([k, n]) => `${k}x${n}`).join(', ')}; first ${JSON.stringify(first)}` : ''));
    }
  }
  // the paced gunner really exercised what it guards at every viewport it ran
  // at: held gates under the escape hatch; under rolling corners, the side's
  // encounter on the move (it killed encounter bodies on at least 3 sides)
  const pacedPlanned = list.filter((o) => o.gunnerMode === 'paced').length;
  const paced = results.filter((r) => r.gunnerMode === 'paced');
  ok(pacedPlanned > 0 && paced.length === pacedPlanned && paced.every((r) => r.rolling
      ? Object.values(r.perCorner).filter((pc) => pc.encounterKills > 0).length >= 3
      : Object.values(r.perCorner).filter((pc) => pc.gateTicks > 0).length >= 3),
    'T-102: the visible-only gunner fought at least three held gates (escape hatch) or three ' +
    'moving encounters (rolling) per viewport');
  // T-201: the no-fire runs really never fired, and still met encounters
  const silent = results.filter((r) => r.gunnerMode === 'none');
  const silentPlanned = list.filter((o) => o.gunnerMode === 'none').length;
  ok(silent.length === silentPlanned && silent.every((r) => r.rolling && r.shotsFired === 0 &&
      Object.values(r.perCorner).filter((pc) => pc.staged > 0).length >= 5),
    `T-201: every no-fire run fired no shot (${silent.map((r) => r.shotsFired).join('/')}) ` +
    'and still had the encounter staged on at least five sides');
  // T-201 R4 A/B: `?hinge=flow` must really release RIG at the camera hand-off.
  // The turn families above stay green with the release switched off, so bind
  // it here: fewer ticks standing still with a direction held than the
  // default lock on the same viewport (full tier only; the per-edit tier runs
  // no ?query runs and says so in its SKIP line)
  const stalledTicks = (r) => Object.values(r.perCorner).reduce((n, pc) => n + pc.stalledInputTicks, 0);
  for (const flow of results.filter((r) => r.policy === 'run' && r.query === 'hinge=flow')) {
    const vp = `${flow.viewport.width}x${flow.viewport.height}`;
    const base = results.find((r) => r.policy === 'run' && !r.query && r.gunnerMode === flow.gunnerMode &&
      r.viewport.width === flow.viewport.width && r.viewport.height === flow.viewport.height);
    ok(!!base && stalledTicks(base) > 0 && stalledTicks(flow) < stalledTicks(base),
      `T-201: ?hinge=flow lets RIG keep moving after the camera hand-off @${vp} (ticks stalled ` +
      `with a direction held: ${stalledTicks(flow)} vs ${base ? stalledTicks(base) : 'no default run'} by default)`);
  }
}
