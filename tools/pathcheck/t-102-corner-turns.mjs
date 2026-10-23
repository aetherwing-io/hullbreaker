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
 *   gate        a gate never stays shut once its last gating body is gone
 *               (bound: the same tick), never sits idle at its halt, and never
 *               shows nothing of its encounter for longer than one 900 ms
 *               entrance beat while it is shut (gate legibility)
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
 * guards, and the operator's device), each played only through the corner
 * in FAST_SUBSET's last column. It prints one SKIP line naming what it did not
 * play; skipped runs and corners are NOT counted as passes. The subset is
 * drawn from matrix() itself, so a fast run is its full-matrix twin with the
 * same options, stopped by turn-proof's own stopAfterCorner 3 s of game time
 * after that corner completes (the sim is deterministic: the same ticks up to
 * there) and capped at one minute of game time per corner played, so a wedged
 * gate fails fast. Falsified in fast mode:
 * `node tools/simlab/turnlab-falsify.mjs --fast-domain --only P1,P2,P3`.
 *
 * T-120 fix round 1 (playtest I-A, the per-edit hook at load ~50): the four
 * whole runs were 8.3 of the per-edit tier's ~25 CPU-s; the prefixes cost
 * ~3.9. The corners they leave out are not lost: their twins run whole in the
 * full matrix, which the merge gate runs.                                  */

import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';
import { PORTRAIT_SAFE } from '../simlab/lib/sixface-host.mjs';
import { runMatrix } from '../simlab/turnlab.mjs';

export const title = 'T-102: every corner turn, played headlessly under player policies';

const FAMILIES = Object.freeze({
  envelope: ['teleport', 'popAfterRelocation', 'relocateOutsideOwnedRoute'],
  hinge: ['hingeFallThrough', 'hingeFallDeath', 'capsuleThroughDeck'],
  gate: ['gateShutWithKillConditionMet', 'haltedButIdle', 'gateBlind', 'hudLastButMore'],
  turn: ['approachAtBendNoTurn', 'turnWithoutRigAtBend', 'turnSkippedApproach'],
  facet: ['playerFacetBackwards', 'cameraFacetBackwards', 'rigCulledByFold'],
  ratchet: ['ratchetOutOfEnvelope', 'ratchetBaseMismatch', 'cameraYawJump', 'scrollBackwards'],
  framing: ['rigOffScreen'],
});

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
  return list.map((o) => ({ god: true, reactionMs: 350, ...o }));
}

// HB_GATE_FAST=1: one played run per fixed defect that only a played run can
// catch, plus a plain run on the operator's device. D4 and D5 are guarded by
// static checks, which run in both tiers. Every policy acts at every corner;
// the last column is how many corners the per-edit run plays: at least one
// past the first corner its reverted fix bites at (turnlab-falsify.mjs, T-120
// fix round 1: P1 at corner 1's relocation, tick 1155; P3 at corner 1's
// approach, tick 1334; P2 only at corner 3's gate on 390x844 — two corners
// did not bind it). A prefix plays ~1,350 ticks per corner.
//   [policy, viewport, gunnerMode, corners played]
const FAST_SUBSET = Object.freeze([
  ['die-at-hinge', 'desktop', 'oracle', 2],            // D1: relocations honour the sealed fold
  ['run', 'phonePortrait', 'paced', 3],                // D2: no gate waits on a body off screen
  ['resize-approach-late', 'narrowTall', 'oracle', 2], // D3: the scroll never rewinds
  ['run', 'phoneLandscape', 'oracle', 2],              // 844x390: the plain run on the primary device
]);
const FAST_TICKS_PER_CORNER = 60 * 60;                 // the cap: a minute of game time per corner

export function fastSubset(list = matrix()) {
  const out = [];
  for (const o of list) {
    if (o.query) continue;
    const row = FAST_SUBSET.find(([policy, viewport, gunner]) =>
      o.policy === policy && o.viewport === viewport && (o.gunnerMode || 'oracle') === gunner);
    if (row) out.push({ ...o, stopAfterCorner: row[3],
      maxTicks: Math.min(o.maxTicks || Infinity, row[3] * FAST_TICKS_PER_CORNER) });
  }
  return out;
}

export async function run() {
  await staticChecks();
  const full = matrix();
  if (process.env.HB_GATE_FAST === '1') {
    const fast = fastSubset(full);
    console.log(`SKIP t-102-corner-turns: ${full.length - fast.length} of ${full.length} played turn ` +
      `runs not run, and the ${fast.length} that run stop after corner ` +
      `${[...new Set(fast.map((o) => o.stopAfterCorner))].sort().join(' or ')} of 6 ` +
      `(HB_GATE_FAST=1 — per-edit tier; not counted as passes; unset it for the full matrix)`);
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
    'hostile-rng', 'kill-count', 'shot-count', 'player', 'hook-input', 'hook', 'flow',
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
  // the simulation's real construction schedule at the camera handoff.
  {
    const start = routeSrc.indexOf('function routeRenderable(');
    let depth = 0, end = -1;
    for (let i = routeSrc.indexOf('{', start); i < routeSrc.length; i++) {
      if (routeSrc[i] === '{') depth++;
      else if (routeSrc[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    const build = (deps) => Function(...Object.keys(deps),
      `"use strict"; return (${routeSrc.slice(start, end)});`)(...Object.values(deps));
    const k = 1, cornerS = PATH.CORNER_S[k - 1];
    const T6 = WAVES.cornerEventTotalMs(CONFIG);
    const builtAt = (column, tMs) => {                  // sim/level.js + wavegate.js schedule
      if (column < cornerS) return true;
      const j = column - cornerS;
      if (j < CONFIG.waves.zipCols) return WAVES.zipperOffset(tMs, j, CONFIG).phase === 'locked';
      return tMs >= T6;
    };
    const visibleArriving = (isG1, tMs) => {
      const routeRenderable = build({
        ACTIVE_FIXTURE: null, IS_G1: isG1, CONFIG, BEND_S: PATH.BEND_S,
        routeRenderOwned: PATH.routeRenderOwned, scrollX: PATH.HALT_S[k - 1],
        cameraFacingFacet: () => k, routeColumnBuilt: (s) => builtAt(Math.floor(s), tMs),
      });
      let shown = 0, rows = 0;
      for (let column = 0; column < CONFIG.levelLength; column++) {
        if (PATH.worldFacetAt(column + 0.5, CONFIG, PATH.BEND_S) !== k) continue;
        rows++;
        if (routeRenderable(column + 0.5)) shown++;
      }
      return { shown, rows };
    };
    const g1 = visibleArriving(true, handoffMs), zip = visibleArriving(false, handoffMs);
    ok(start >= 0 && end > start && g1.shown === g1.rows,
      `T-102: the shipped routeRenderable draws the whole arriving facet (${g1.rows} rows) at the ` +
      `${handoffMs} ms handoff under the default reveal, not a construction prefix (drew ${g1.shown})`);
    ok(zip.shown < zip.rows,
      `T-102: ?zip=1 keeps its assembling reveal (${zip.shown} of ${zip.rows} rows at the handoff)`);
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
  results.forEach((r, at) => {
    const vp = `${r.viewport.width}x${r.viewport.height}`;
    const tag = `${r.policy}${r.gunnerMode === 'paced' ? '/paced-gunner' : ''}` +
      `${r.query ? '?' + r.query : ''} @${vp}`;
    const k = list[at].stopAfterCorner;
    if (k) ok(r.finishedCorners === k && r.endState === 'STOPPED',
      `T-102 [${tag}]: its first ${k} turns complete and it plays on 3 s past the last ` +
      `(the per-edit prefix of its full-matrix twin; ${r.finishedCorners}/6, ${r.endState})`);
    else ok(r.finishedCorners === 6 && r.endState === 'VICTORY',
      `T-102 [${tag}]: all five turns and the Crown approach complete and the run reaches VICTORY ` +
      `(${r.finishedCorners}/6, ${r.endState})`);
    for (const [family, kinds] of Object.entries(FAMILIES)) {
      const hits = kinds.map((k) => [k, r.counts[k] || 0]).filter(([, n]) => n > 0);
      const first = hits.length ? r.violations.find((v) => kinds.includes(v.kind)) : null;
      ok(hits.length === 0,
        `T-102 [${tag}]: ${family} contract holds on every tick` +
        (hits.length ? ` — ${hits.map(([k, n]) => `${k}x${n}`).join(', ')}; first ${JSON.stringify(first)}` : ''));
    }
  });
  // the paced gunner really exercised held gates at every viewport it ran at
  // (a per-edit prefix: a held gate at each corner it played)
  const pacedPlanned = list.filter((o) => o.gunnerMode === 'paced').length;
  const paced = results.map((r, at) => [r, list[at]]).filter(([r]) => r.gunnerMode === 'paced');
  const held = (r) => Object.values(r.perCorner).filter((pc) => pc.gateTicks > 0).length;
  if (list.some((o) => o.stopAfterCorner))
    ok(pacedPlanned > 0 && paced.length === pacedPlanned && paced.every(([r, o]) => held(r) >= Math.min(3, o.stopAfterCorner || 6)),
      'T-102: the visible-only gunner fought a held gate at every corner of its per-edit prefix ' +
      `(${paced.map(([r]) => held(r)).join(', ')})`);
  else
    ok(pacedPlanned > 0 && paced.length === pacedPlanned && paced.every(([r]) => held(r) >= 3),
      'T-102: the visible-only gunner fought at least three held gates per viewport');
}
