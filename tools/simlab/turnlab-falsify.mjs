#!/usr/bin/env node
/* turnlab-falsify.mjs — prove every T-102 turn assertion BINDS.
 *
 *   node tools/simlab/turnlab-falsify.mjs [--only P1,M3] [--work <dir>] [--keep]
 *   node tools/simlab/turnlab-falsify.mjs --fast-domain --only P1,P2,P3
 *
 * --fast-domain swaps every row's guard for the whole pathcheck domain
 * (tools/pathcheck/t-102-corner-turns.mjs run()) in its per-edit tier,
 * HB_GATE_FAST=1. A row goes red only on a FAIL line that names the row's own
 * violation kind (or, for static rows, its own label). Before the rows, the
 * same fast domain runs once on the unbroken copy and must be green.
 *
 * A green gate is not evidence that a gate works (docs/LANE-BRIEF.md). For
 * each assertion family of tools/pathcheck/t-102-corner-turns.mjs this copies
 * the tree's src/ and tools/{simlab,pathcheck}/ to a scratch directory, breaks
 * exactly one thing there, runs the one check that guards it, and reports
 * whether the guard went red. Rows P* revert one T-102 fix (the pre-fix
 * code, one defect at a time); rows M* break behaviour the pre-fix code
 * already had right, so those guards are shown to bind too. The worktree is
 * never touched: every mutation is applied to the copy and the copy is
 * restored from the pristine tree before the next row.
 * Dev-only; zero effect on the shipped game.                               */

import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VIEWPORTS } from './lib/turn-proof.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const work = opt('work', '') || mkdtempSync(join(tmpdir(), 't102-falsify-'));
const keep = argv.includes('--keep');
const fastDomain = argv.includes('--fast-domain');

// One break per row: [id, what it breaks, file, find, replace, check].
// check = { policy, viewport, query?, gunnerMode?, paceMs?, maxTicks?, expect: [kinds] }
//       | { static: true, expectFail: /label regex/ }
const ROWS = [
  ['P1', 'pre-fix: relocations ignore the corner route window', 'src/sim/player.js',
    'function clampToOwnedRoute(x) {', 'function clampToOwnedRoute(x) { return x;',
    { policy: 'die-at-hinge', viewport: 'desktop', expect: ['relocateOutsideOwnedRoute', 'popAfterRelocation', 'playerFacetBackwards'] }],
  ['P1b', 'pre-fix: a stock-life respawn after a turn lands behind the seal', 'src/sim/player.js',
    'function clampToOwnedRoute(x) {', 'function clampToOwnedRoute(x) { return x;',
    { policy: 'die-after-turn', viewport: 'phoneLandscape', expect: ['rigCulledByFold', 'popAfterRelocation'] }],
  // T-201: held gates are the ?gates=legacy escape hatch; their rows run there.
  ['P2', 'pre-fix: a gate waits on view-bound bodies it cannot show (escape hatch)', 'src/sim/scroll.js',
    "if (c && c.state === 'gate') retireUnseenGateRows(c);", '',
    { policy: 'run', viewport: 'phonePortrait', gunnerMode: 'paced', paceMs: 1400, maxTicks: 60 * 240,
      query: 'gates=legacy&follow=0', expect: ['gateBlind'], expectNotVictory: true }],
  ['P3', 'pre-fix: the approach dolly can rewind the scroll on a resize', 'src/sim/scroll.js',
    'let next = Math.max(scrollX, Math.min(nextScroll, target));', 'let next = Math.min(nextScroll, target);',
    { policy: 'resize-approach-late', viewport: 'narrowTall', expect: ['scrollBackwards'] }],
  // T-201 replaces P4 (the default reveal reading the zipper's construction
  // rows): the sim no longer keeps those rows, so that render path cannot draw
  // a prefix. What now guards the same property is the sim marking nothing.
  ['Z1', 'the sim marks the six-face run\'s future faces unbuilt again (zipper state back)', 'src/sim/level.js',
    '  if (IS_TRAVERSAL_SLICE) {\n    let changed = false;', '  {\n    let changed = false;',
    { static: true, expectFail: /draws the whole arriving facet|retired \?zip=1 branch/ }],
  ['P5', 'pre-fix: the gate HUD calls one visible body the last', 'src/pure/waves.js',
    "  if (need.gatingLeft === 1 && need.gatingPresent === 1) return 'LAST SIGNAL · CLOSING';",
    "  if (need.present === 1) return 'LAST SIGNAL · CLOSING';",
    { policy: 'run', viewport: 'desktop', gunnerMode: 'paced', paceMs: 1400, maxTicks: 60 * 900,
      query: 'gates=legacy&follow=0', expect: ['hudLastButMore'] }],
  ['P5b', 'pre-fix: hud.js prints the current beat count, not the requirement', 'src/ui/hud.js',
    "    tc = `WAVE ${c.k}/${CONFIG.path.faces} · ${c.phase} · ` + gateRequirementText(\n      gateRequirement(hostiles, c.encounterKey, gameMs, CONFIG.wasp.enterMs));",
    "    const threats = gateRequirement(hostiles, c.encounterKey, gameMs, CONFIG.wasp.enterMs).present;\n    tc = `WAVE ${c.k}/${CONFIG.path.faces} · ${c.phase} · ` +\n      (threats === 1 ? 'LAST SIGNAL · CLOSING' : `${threats} HOSTILES`);",
    { static: true, expectFail: /held-gate HUD line prints gateRequirementText/ }],
  ['M1', 'a completed corner seals two tiles ahead of the joint', 'src/pure/waves.js',
    "sealLeft: state === 'turning' || state === 'done'\n      ? bendS - playerHalfWidth",
    "sealLeft: state === 'turning' || state === 'done'\n      ? bendS + (state === 'done' ? 2 : 0) - playerHalfWidth",
    { policy: 'run', viewport: 'desktop', expect: ['teleport'] }],
  ['M2', 'the joint apron loses its deck', 'src/sim/level.js',
    'export function isSolid(i, j) {', 'export function isSolid(i, j) {\n  if ((i === 112 || i === 113) && j < 6) return false;',
    { policy: 'run', viewport: 'desktop', expect: ['hingeFallThrough', 'hingeFallDeath'] }],
  ['M3', 'the last gating kill no longer opens the gate', 'src/sim/wavegate.js',
    "for (const e of gateRows(c)) e.gateBreakExit = true;\n    c.state = 'approach';",
    'for (const e of gateRows(c)) e.gateBreakExit = true;',
    { policy: 'run', viewport: 'desktop', maxTicks: 60 * 60, query: 'gates=legacy&follow=0',
      expect: ['gateShutWithKillConditionMet'] }],
  ['M4', 'reaching the halt no longer arms the gate', 'src/sim/scroll.js',
    "if (c && c.state === 'idle' && scrollX >= HALT_S[c.k - 1] - 1e-6) armGate(c);", '',
    { policy: 'run', viewport: 'desktop', maxTicks: 60 * 40, expect: ['haltedButIdle'] }],
  ['M5', 'arriving at the bend no longer fires the turn', 'src/pure/waves.js',
    "return state === 'approach' && playerX >= bendS - 1e-6;", "return state === 'approach' && playerX >= bendS + 0.5;",
    { policy: 'run', viewport: 'desktop', maxTicks: 60 * 40, expect: ['approachAtBendNoTurn'] }],
  ['M6', 'the turn fires a tile before the bend', 'src/pure/waves.js',
    "return state === 'approach' && playerX >= bendS - 1e-6;", "return state === 'approach' && playerX >= bendS - 1.0;",
    { policy: 'run', viewport: 'desktop', expect: ['turnWithoutRigAtBend', 'teleport'] }],
  ['M7', 'the ratchet settles 6 degrees short of the detent', 'src/pure/waves.js',
    "  return snap * 2;\n}\n\n// scroll velocity", "  return snap * 2 - 6;\n}\n\n// scroll velocity",
    { policy: 'run', viewport: 'desktop', expect: ['cameraFacetBackwards'] }],
  ['M8', 'the snap overshoot triples', 'src/config.js',
    'backS: 1.1,                // easeOutBack overshoot (~5%, one settle, no wobble)', 'backS: 3.0,',
    { policy: 'run', viewport: 'desktop', expect: ['ratchetOutOfEnvelope'] }],
  ['M9', 'a corner completion is reported twice', 'src/sim/wavegate.js',
    'view.corner.finished(c);', 'view.corner.finished(c); view.corner.finished(c);',
    { policy: 'run', viewport: 'desktop', expect: ['ratchetBaseMismatch'] }],
  ['M10', 'the second snap jumps instead of easing', 'src/pure/waves.js',
    'if (tMs < T.t4) { const u = (tMs - T.t3) / W.snap2Ms; return snap + snap * easeOutBack(u, W.backS); }',
    'if (tMs < T.t4) return snap * 2;',
    { policy: 'run', viewport: 'desktop', expect: ['cameraYawJump'] }],
  // T-201: under the follow-lead (default) the plane follows RIG, so a racer
  // never reaches the right clamp and loosening it changes nothing a run can
  // see; the clamp is exercised where it still binds, on ?follow=0.
  ['M11', 'the screen clamp lets RIG run three tiles off-frame', 'src/config.js',
    'edges: { margin: 0.4, killY: -7 },', 'edges: { margin: -3, killY: -7 },',
    { policy: 'run', viewport: 'desktop', query: 'momentum=0&follow=0', expect: ['rigOffScreen'] }],
  ['M12', 'a popped weapon settles half a tile into the deck', 'src/sim/capsules.js',
    '{ c.y = g + 0.3; c.vy = 0; c.vx *= 0.8; }', '{ c.y = g - 0.5; c.vy = 0; c.vx *= 0.8; }',
    { policy: 'pop-weapon-at-hinge', viewport: 'desktop', expect: ['capsuleThroughDeck'] }],
  ['M13', 'a cleared prelude skips the joint approach', 'src/sim/wavegate.js',
    "  retireGateDenials(c);\n  c.state = 'approach';\n  c.tStart = 0;",
    "  retireGateDenials(c);\n  c.state = 'turning';\n  c.tStart = gameMs;\n  c.sealed = true;",
    { policy: 'run', viewport: 'desktop', query: 'gates=legacy&follow=0', expect: ['turnSkippedApproach'] }],
  ['M14', 'a completed corner stops sealing the fold', 'src/pure/waves.js',
    "sealLeft: state === 'turning' || state === 'done'", "sealLeft: state === 'turning'",
    { policy: 'backtrack', viewport: 'desktop', expect: ['playerFacetBackwards', 'rigCulledByFold'] }],
  ['M15', 'main.js steps capsules after bullets (replica drift)', 'src/main.js',
    '  updateCapsules(dt * wScale);\n  updateMods();\n  updateBullets(dt * hScale);',
    '  updateMods();\n  updateBullets(dt * hScale);\n  updateCapsules(dt * wScale);',
    { static: true, expectFail: /update\(\) still steps the sim in the order/ }],
  ['M16', 'camera.js portrait framing drifts from the replica', 'src/render/camera.js',
    'lookDropTiles: 1.55,', 'lookDropTiles: 1.6,',
    { static: true, expectFail: /PORTRAIT_SAFE verbatim/ }],
  ['M17', 'a reset row the replica does not know', 'src/boot/run-reset.js',
    "  { id: 'slice-stats', reset: resetSliceStats },", "  { id: 'slice-stats', reset: resetSliceStats },\n  { id: 'extra-row', reset: () => {} },",
    { static: true, expectFail: /run-reset registry is the one the replica transcribes/ }],
  ['M18', 'held-view test uses centres instead of whole circles', 'src/sim/wavegate.js',
    'return e.x + r < left || e.x - r > right;', 'return e.x < left || e.x > right;',
    { static: true, expectFail: /outside the held view only when its whole circle is/ }],
  // T-201: the never-wait family that replaces the gate family on rolling runs
  ['N1', 'a rolling corner holds while its gating bodies live', 'src/sim/wavegate.js',
    "  if (GATES_ROLLING) {\n    // The turn never waits",
    "  if (GATES_ROLLING && !hostiles.some((e) => e.encounterKey === c.encounterKey && e.gating && !e.gateBreakExit)) {\n    // The turn never waits",
    { policy: 'run', viewport: 'desktop', gunnerMode: 'none', maxTicks: 60 * 90,
      expect: ['turnWaitedAfterArrival'] }],
  ['N8', 'a rolling corner falls back into the held-gate state', 'src/sim/wavegate.js',
    "  if (GATES_ROLLING) {\n    // The turn never waits",
    "  if (GATES_ROLLING && !hostiles.some((e) => e.encounterKey === c.encounterKey && e.gating && !e.gateBreakExit)) {\n    // The turn never waits",
    { policy: 'run', viewport: 'desktop', gunnerMode: 'none', maxTicks: 60 * 90,
      expect: ['gateStateInRolling'] }],
  ['N2', 'encounter bodies are staged at their sockets whatever the view', 'src/sim/wavegate.js',
    'const advance = Math.max(0, planeTilesPerSec || 0) * (maxDelayMs + CONFIG.wasp.enterMs) / 1000;\n  return rollingStageBand(sLeftEdge(), sRightEdge(), pivotS, advance, ROLLING_GATES, out);',
    'out.lo = -1e9; out.hi = 1e9; return out;',
    { policy: 'run', viewport: 'phonePortrait', gunnerMode: 'paced', paceMs: 1400, expect: ['stagedOutsideView'] }],
  ['N3', 'followers re-enter past the right edge', 'src/sim/wavegate.js',
    'const x0 = lo + (hi - lo) * ((j % R.carryMax) + 0.5) / R.carryMax;',
    'const x0 = sRightEdge() + 6;',
    { policy: 'run', viewport: 'desktop', gunnerMode: 'none', expect: ['carriedInvisible'] }],
  ['N4', 'followers never come back on the arriving facet', 'src/sim/wavegate.js',
    'export function updatePursuers(rigX, planeTilesPerSec = 0) {\n  if (!GATES_ROLLING) return;',
    'export function updatePursuers(rigX, planeTilesPerSec = 0) {\n  return;',
    { policy: 'run', viewport: 'desktop', gunnerMode: 'none', expect: ['carryLost'] }],
  ['N5', 'the encounter line calls a live encounter broken', 'src/pure/waves.js',
    '  if (live > 0) {\n    return `${s.phase} · ${live} HOSTILE',
    '  if (live > 99) {\n    return `${s.phase} · ${live} HOSTILE',
    { policy: 'run', viewport: 'desktop', gunnerMode: 'paced', paceMs: 1400, expect: ['hudBrokenButAlive'] }],
  ['N6', 'the encounter line outgrows its slot', 'src/pure/waves.js',
    '`${n(s.following)} FOLLOWING → ${s.nextPhase}`', '`${n(s.following)} SURVIVORS FOLLOWING → ${s.nextPhase}`',
    { policy: 'run', viewport: 'desktop', gunnerMode: 'none', expect: ['hudTooLong'] }],
  ['N7', 'the beat bound is the old 300 s lock', 'src/pure/waves.js',
    'beatBoundMs: 6000,', 'beatBoundMs: 300000,',
    { policy: 'run', viewport: 'phonePortrait', gunnerMode: 'paced', paceMs: 1400, expect: ['beatOverBound'] }],
];

function copyTree() {
  for (const rel of ['src', join('tools', 'simlab'), join('tools', 'pathcheck')])
    cpSync(join(root, rel), join(work, rel), { recursive: true });
}

function runChild(args, env = {}) {
  return new Promise((resolve) => execFile(process.execPath, args,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: work, env: { ...process.env, ...env } },
    (err, stdout, stderr) => resolve({ err, stdout, stderr })));
}

// The whole T-102 pathcheck domain, per-edit tier, in the scratch copy: its
// FAIL lines, its SKIP line, its pass/fail counts and its wall time.
async function fastDomainRun() {
  const domain = pathToFileURL(join(work, 'tools', 'pathcheck', 't-102-corner-turns.mjs')).href;
  const ctx = pathToFileURL(join(work, 'tools', 'pathcheck', '_context.mjs')).href;
  const src = `
    const { counts } = await import(${JSON.stringify(ctx)});
    const errs = [], logs = [];
    const oe = console.error, ol = console.log;
    console.error = (...a) => { errs.push(a.join(' ')); };
    console.log = (...a) => { logs.push(a.join(' ')); };
    const t0 = Date.now();
    try { await (await import(${JSON.stringify(domain)})).run(); }
    catch (e) { errs.push('THREW ' + e.message); }
    const wallS = (Date.now() - t0) / 1000;
    console.error = oe; console.log = ol;
    process.stdout.write(JSON.stringify({ ...counts(), errs, logs, wallS }));`;
  const { err, stdout, stderr } = await runChild(['--input-type=module', '-e', src], { HB_GATE_FAST: '1' });
  if (err && !stdout) return { error: (stderr || err.message).split('\n').slice(0, 3).join(' ') };
  return JSON.parse(stdout);
}

// Every FAIL line naming this row's violation; the one from the row's own
// guard run (its policy/viewport tag, as the domain prints it) is preferred.
function fastDomainHits(r, check) {
  const all = (r.errs || []).filter((e) => e.startsWith('FAIL') && (check.static
    ? check.expectFail.test(e)
    : check.expect.some((k) => e.includes(k)) ||
      (check.expectNotVictory && /Crown approach complete/.test(e))));
  let own = null;
  if (!check.static) {
    const vp = VIEWPORTS[check.viewport];
    const tag = `[${check.policy}${check.gunnerMode === 'paced' ? '/paced-gunner' : ''}` +
      `${check.query ? '?' + check.query : ''} @${vp.width}x${vp.height}]`;
    own = all.find((e) => e.includes(tag)) || null;
  }
  return { hit: own || all[0] || null, own: !!own, all };
}

async function played(check) {
  const lab = join(work, 'tools', 'simlab', 'lib', 'turn-proof.mjs');
  const src = `
    const { runTurnProof, VIEWPORTS } = await import(${JSON.stringify(pathToFileURL(lab).href)});
    const o = ${JSON.stringify(check)};
    o.viewport = VIEWPORTS[o.viewport];
    const r = await runTurnProof({ god: true, reactionMs: 350, ...o });
    process.stdout.write(JSON.stringify({ endState: r.endState, finishedCorners: r.finishedCorners,
      counts: r.counts, first: r.violations[0] || null }));`;
  const { err, stdout, stderr } = await runChild(['--input-type=module', '-e', src]);
  if (err) return { error: (stderr || err.message).split('\n').slice(0, 3).join(' ') };
  return JSON.parse(stdout);
}

async function staticRun() {
  const domain = pathToFileURL(join(work, 'tools', 'pathcheck', 't-102-corner-turns.mjs')).href;
  const ctx = pathToFileURL(join(work, 'tools', 'pathcheck', '_context.mjs')).href;
  const src = `
    const { counts } = await import(${JSON.stringify(ctx)});
    const errs = [];
    const orig = console.error; console.error = (m) => { errs.push(String(m)); };
    try { await (await import(${JSON.stringify(domain)})).staticChecks(); }
    catch (e) { errs.push('THREW ' + e.message); }
    console.error = orig;
    process.stdout.write(JSON.stringify({ ...counts(), errs }));`;
  const { err, stdout, stderr } = await runChild(['--input-type=module', '-e', src]);
  if (err && !stdout) return { error: (stderr || err.message).split('\n').slice(0, 3).join(' ') };
  return JSON.parse(stdout);
}

copyTree();
const pristine = new Map();
const results = [];
console.log(`work copy: ${work}`);
let baselineGreen = true;
if (fastDomain) {
  // Baseline: the unbroken copy must be green in the same fast tier, or a red
  // row below would prove nothing.
  const b = await fastDomainRun();
  baselineGreen = !b.error && b.fails === 0 && (b.logs || []).some((l) => l.startsWith('SKIP t-102'));
  console.log(`fast-domain baseline (unbroken copy, HB_GATE_FAST=1): ` + (b.error ? 'ERROR ' + b.error
    : `${b.passes} passed, ${b.fails} failed, ${b.wallS} s; ${(b.logs || []).find((l) => l.startsWith('SKIP')) || 'no SKIP line'}`) +
    (baselineGreen ? '' : ' — NOT GREEN: rows below cannot be trusted'));
}
console.log('| row | what is broken | file | guard | went red? | evidence |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const [id, what, file, find, replace, check] of ROWS) {
  if (only && !only.has(id)) continue;
  const path = join(work, file);
  if (!pristine.has(file)) pristine.set(file, readFileSync(path, 'utf8'));
  const text = pristine.get(file);
  if (!text.includes(find)) {
    console.log(`| ${id} | ${what} | ${file} | — | MUTATION NOT APPLIED | target text not found |`);
    results.push({ id, applied: false });
    continue;
  }
  writeFileSync(path, text.replace(find, replace));
  let red = false, evidence = '';
  if (fastDomain) {
    const r = await fastDomainRun();
    const h = r.error ? { hit: null, own: false, all: [] } : fastDomainHits(r, check);
    red = !!h.hit;
    const others = h.all.filter((e) => e !== h.hit).map((e) => (e.match(/\[[^\]]+\]/) || ['?'])[0]);
    evidence = r.error ? 'ERROR ' + r.error
      : `${h.hit ? h.hit.slice(0, 220) : 'no FAIL naming this row\'s violation'}` +
        (others.length ? `; also ${others.join(', ')}` : '') +
        ` (${r.passes} passed, ${r.fails} failed, ${r.wallS} s)`;
  } else if (check.static) {
    const r = await staticRun();
    const hit = (r.errs || []).find((e) => check.expectFail.test(e));
    red = !!hit;
    evidence = r.error ? 'ERROR ' + r.error : hit ? hit.slice(0, 160) : `no matching FAIL (${r.fails} fails)`;
  } else {
    const r = await played(check);
    if (r.error) evidence = 'ERROR ' + r.error;
    else {
      const hits = check.expect.filter((k) => (r.counts[k] || 0) > 0);
      red = hits.length > 0 || (check.expectNotVictory && r.endState !== 'VICTORY');
      evidence = (hits.length ? hits.map((k) => `${k}x${r.counts[k]}`).join(', ') : 'no expected violation') +
        `; end ${r.endState} ${r.finishedCorners}/6`;
    }
  }
  writeFileSync(path, text);                       // restore before the next row
  results.push({ id, applied: true, red });
  const guard = fastDomain ? 'T-102 domain, HB_GATE_FAST=1'
    : check.static ? 'static' : `${check.policy}@${check.viewport}`;
  console.log(`| ${id} | ${what} | ${file} | ${guard} | ${red ? 'YES' : 'NO'} | ${evidence.replace(/\|/g, '/')} |`);
}
const bad = results.filter((r) => !r.applied || !r.red);
console.log(bad.length ? `\n${bad.length} row(s) did not bind: ${bad.map((r) => r.id).join(', ')}` : '\nevery guard went red when its behaviour was broken');
if (!baselineGreen) console.log('fast-domain baseline was not green: the table above is not evidence');
if (!keep) rmSync(work, { recursive: true, force: true });
process.exit(bad.length || !baselineGreen ? 1 : 0);
