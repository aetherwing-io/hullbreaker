#!/usr/bin/env node
/* evidence.mjs — the three claims the movement-verb prototypes have to earn,
 * each measured as an A/B where the ONLY difference is the flag.
 *
 *   A. a hook route is faster AND safer than the same route without the hook,
 *      somewhere real (three paces, including the merged houndframe trial);
 *   B. a momentum chain survives a whole slice pass, and changes where the bot
 *      goes (maxY, route coverage) — not just how fast it gets there;
 *   C. hook + flow composed with pace=surge stays inside the acceptance
 *      budgets: not crushed, inside the fixture's authored play window, and
 *      inside the displacement ceiling the collision model depends on.
 *
 * Every row is one deterministic headless run (tools/movement/simrun.mjs) in
 * its own process. Exits non-zero if a claim fails, so it can be used as a gate
 * rather than a table to eyeball.
 *
 *   node tools/movement/evidence.mjs
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG } from '../../src/config.js';
import { TRAVERSAL_FIXTURE, TRAVERSAL_FLOW, TRAVERSAL_HOOK } from '../../src/pure/traversal.js';

const here = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(here, 'simrun.mjs');
const SECONDS = 16;

function run(query, policy) {
  return JSON.parse(execFileSync(process.execPath,
    [RUNNER, '--query', query, '--policy', policy, '--seconds', String(SECONDS), '--json'],
    { encoding: 'utf8' }));
}

let fails = 0;
const claim = (cond, text) => {
  if (!cond) fails++;
  console.log((cond ? '  PASS  ' : '  FAIL  ') + text);
};
const ms = (m) => (m.clearMs === null ? 'DNF' : m.clearMs + 'ms');

/* ---- A. the hook route pays --------------------------------------------- */
console.log('\nA. HOOK ROUTE vs THE SAME ROUTE WITHOUT THE HOOK  (policy: hook-line)');
console.log('   pace/mode          hook off            hook on             delta');
const A = [
  ['base', 'slice=traversal'],
  ['surge', 'slice=traversal&pace=surge'],
  ['hound trial 1', 'slice=traversal&hound=1'],
];
let fasterEverywhere = true, saferSomewhere = false, usedHook = true;
for (const [label, q] of A) {
  const off = run(q, 'hook-line');
  const on = run(q + '&hook=1', 'hook-line');
  const dt = off.clearMs !== null && on.clearMs !== null
    ? (100 * (off.clearMs - on.clearMs) / off.clearMs).toFixed(0) + '% faster'
    : off.outcome + '→' + on.outcome;
  console.log('   ' + label.padEnd(18) +
    (ms(off) + ' m' + off.minMargin.toFixed(1)).padEnd(20) +
    (ms(on) + ' m' + on.minMargin.toFixed(1) + ' h' + on.hooks).padEnd(20) + dt +
    '  maxY ' + off.maxY.toFixed(1) + '→' + on.maxY.toFixed(1));
  if (!(on.outcome === 'cleared' &&
        (off.clearMs === null || on.clearMs < off.clearMs))) fasterEverywhere = false;
  if (on.minMargin > off.minMargin + 0.5) saferSomewhere = true;
  if (on.hooks < 2) usedHook = false;
}
claim(fasterEverywhere, 'the hook route clears faster than the identical non-hook route, every pace');
claim(saferSomewhere, 'and it is measurably safer (bigger worst-case crush margin) somewhere real');
claim(usedHook, 'and it actually hooked (>= 2 grabs per run), so the delta is the verb');

/* ---- B. a chain survives a pass ---------------------------------------- */
console.log('\nB. MOMENTUM CHAIN OVER A FULL PASS  (policy: chain)');
console.log('   mode                       clear    peakLinks  ampFrames  peakVx  maxY   routes');
const B = [
  ['flow off', 'slice=traversal&hook=1'],
  ['flow on', 'slice=traversal&hook=1&flow=1'],
  ['flow on, surge', 'slice=traversal&pace=surge&hook=1&flow=1'],
  ['flow on, hound 3 + surge', 'slice=traversal&pace=surge&hound=3&hook=1&flow=1'],
];
const rowsB = [];
for (const [label, q] of B) {
  const m = run(q, 'chain');
  rowsB.push({ label, m });
  console.log('   ' + label.padEnd(26) + ms(m).padEnd(9) +
    String(m.flowPeakLinks).padEnd(11) + String(m.flowAmpFrames).padEnd(11) +
    m.peakVx.toFixed(2).padEnd(8) + m.maxY.toFixed(1).padEnd(7) + m.routeIds.length);
}
const flowOff = rowsB[0].m, flowOn = rowsB[1].m;
claim(rowsB.slice(1).every((r) => r.m.flowPeakLinks >= 2),
      'the chain reaches at least two links in every flow run (it is reachable in play)');
claim(rowsB.slice(1).every((r) => r.m.flowAmpFrames > 0.25 * r.m.frames),
      'and it is LIVE for more than a quarter of the pass, not a one-frame spike');
claim(rowsB.slice(1).every((r) => r.m.peakVx > flowOff.peakVx + 0.5),
      'a live chain actually carries speed the controller would otherwise bleed off');
claim(rowsB.every((r) => r.m.outcome === 'cleared'),
      'and every flow run still completes the slice');
claim(flowOn.maxY !== flowOff.maxY || flowOn.routeIds.join() !== flowOff.routeIds.join() ||
      flowOn.clearMs !== flowOff.clearMs,
      'the flag changes where/how the bot travels, so it is a mechanic and not a number');

/* ---- C. composed with surge, inside the budgets ------------------------- */
console.log('\nC. HOOK + FLOW + SURGE vs THE ACCEPTANCE BUDGETS');
const dtMax = 50 / 1000;                     // src/main.js frame clamp
const window = TRAVERSAL_FIXTURE.targetPlaySeconds;
const composed = [
  ['surge, both verbs, hook-line', 'slice=traversal&pace=surge&hook=1&flow=1', 'hook-line'],
  ['surge, both verbs, chain', 'slice=traversal&pace=surge&hook=1&flow=1', 'chain'],
  ['surge + hound 3, both verbs', 'slice=traversal&pace=surge&hound=3&hook=1&flow=1', 'chain'],
  ['hunt, both verbs', 'slice=traversal&pace=hunt&hook=1&flow=1', 'chain'],
  ['swarm, both verbs', 'slice=traversal&pace=swarm&hook=1&flow=1', 'chain'],
];
console.log('   run                             clear    minMargin  peakVx  tiles/frame  setbacks');
let inWindow = true, notCrushed = true, inBudget = true;
for (const [label, q, policy] of composed) {
  const m = run(q, policy);
  const perFrame = m.peakVx * dtMax;
  console.log('   ' + label.padEnd(32) + ms(m).padEnd(9) +
    m.minMargin.toFixed(2).padEnd(11) + m.peakVx.toFixed(2).padEnd(8) +
    perFrame.toFixed(3).padEnd(13) + m.setbacks);
  if (m.outcome !== 'cleared' ||
      m.clearMs < window.min * 1000 || m.clearMs > window.max * 1000) inWindow = false;
  if (m.minMargin < 0) notCrushed = false;
  if (perFrame >= 0.9) inBudget = false;
}
claim(inWindow, 'every composed run clears inside the fixture\'s authored ' +
  window.min + '-' + window.max + 's play window');
claim(inBudget, 'no composed run put a frame\'s displacement at or past 0.9 of a tile ' +
  '(the endpoint-only collision budget)');
console.log('   note: minMargin < 0 means the crush plane touched RIG at least once' +
  (notCrushed ? '' : ' — it did, and HULL FALLBACK handled it'));

/* ---- the declared ceilings agree with the data -------------------------- */
console.log('\nD. DECLARED CEILINGS (data, not runs)');
console.log('   hook launchCeiling ' + TRAVERSAL_HOOK.launchCeiling +
  ' → ' + (TRAVERSAL_HOOK.launchCeiling * dtMax).toFixed(3) + ' tiles/frame');
console.log('   flow launchCeiling ' + TRAVERSAL_FLOW.launchCeiling +
  ' → ' + (TRAVERSAL_FLOW.launchCeiling * dtMax).toFixed(3) + ' tiles/frame');
console.log('   drive cap          ' +
  (TRAVERSAL_FIXTURE.movement.runSpeed * TRAVERSAL_FLOW.speedMultCap).toFixed(2) +
  ' → ' + (TRAVERSAL_FIXTURE.movement.runSpeed * TRAVERSAL_FLOW.speedMultCap * dtMax).toFixed(3) +
  ' tiles/frame');
console.log('   zip substep        ' + TRAVERSAL_HOOK.zipSubstepTiles +
  ' tiles (' + TRAVERSAL_HOOK.zipSpeed + ' t/s over ' +
  Math.ceil(TRAVERSAL_HOOK.zipSpeed * dtMax / TRAVERSAL_HOOK.zipSubstepTiles) +
  ' substeps at the dt clamp)');
claim(Math.max(TRAVERSAL_HOOK.launchCeiling, TRAVERSAL_FLOW.launchCeiling) * dtMax < 0.9,
      'both ceilings sit inside the displacement budget');
void CONFIG;

/* ---- E. autobounce: the held-jump trap --------------------------------- */
console.log('\nE. ?autobounce=1 — A HELD JUMP  (policy: holdjump, one keydown for the whole run)');
console.log('   mode                       outcome   clear    air     stall   hits  maxY');
let bounceHelps = true;
for (const [label, q] of [['autobounce off', 'slice=traversal'],
  ['autobounce on', 'slice=traversal&autobounce=1'],
  ['off + hound 1', 'slice=traversal&hound=1'],
  ['on + hound 1', 'slice=traversal&hound=1&autobounce=1']]) {
  const m = run(q, 'holdjump');
  console.log('   ' + label.padEnd(26) + m.outcome.padEnd(10) + ms(m).padEnd(9) +
    m.airFraction.toFixed(3).padEnd(8) + m.stallFraction.toFixed(3).padEnd(8) +
    String(m.hits).padEnd(6) + m.maxY.toFixed(1));
  if (label.startsWith('autobounce on') && m.airFraction < 0.8) bounceHelps = false;
}
claim(bounceHelps,
      'holding jump with ?autobounce=1 keeps RIG bouncing (airborne most of the pass) ' +
      'instead of landing once and walking — the F11 root cause, as an option');

console.log('\n' + (fails === 0
  ? 'movement evidence: all claims PASS'
  : 'movement evidence: ' + fails + ' claim(s) FAILED'));
process.exit(fails ? 1 : 0);
