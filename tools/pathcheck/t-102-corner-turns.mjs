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
 * falsification record in reports/tasks/T-102/build.md.                   */

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

export async function run() {
  await staticChecks();
  await playedChecks();
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
export async function playedChecks(list = matrix()) {
  let results = [];
  try {
    results = await runMatrix(list, Math.max(1, Math.min(3, cpus().length - 1)));
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
    for (const [family, kinds] of Object.entries(FAMILIES)) {
      const hits = kinds.map((k) => [k, r.counts[k] || 0]).filter(([, n]) => n > 0);
      const first = hits.length ? r.violations.find((v) => kinds.includes(v.kind)) : null;
      ok(hits.length === 0,
        `T-102 [${tag}]: ${family} contract holds on every tick` +
        (hits.length ? ` — ${hits.map(([k, n]) => `${k}x${n}`).join(', ')}; first ${JSON.stringify(first)}` : ''));
    }
  }
  // the paced gunner really exercised held gates at every viewport
  const paced = results.filter((r) => r.gunnerMode === 'paced');
  ok(paced.length === 3 && paced.every((r) =>
      Object.values(r.perCorner).filter((pc) => pc.gateTicks > 0).length >= 3),
    'T-102: the visible-only gunner fought at least three held gates per viewport');
}
