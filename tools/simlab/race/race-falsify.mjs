#!/usr/bin/env node
/* race-falsify.mjs — prove every T-201 race-pass assertion BINDS.
 *
 *   node tools/simlab/race/race-falsify.mjs [--only F1,F3] [--tier fast|full] [--keep]
 *
 * A green gate is not evidence that a gate works (docs/LANE-BRIEF.md). For
 * each behaviour tools/pathcheck/t-201-race-pass.mjs guards, this copies the
 * tree's src/ and tools/{simlab,pathcheck}/ to a scratch directory, breaks
 * exactly one thing there, runs the whole T-201 domain (the per-edit tier,
 * HB_GATE_FAST=1, unless the row needs a full-tier run), and reports whether
 * a FAIL line matching the row's expectation appeared. The unbroken copy runs
 * first and must be green, or the table is not evidence. The worktree is
 * never touched: every mutation is applied to the copy and reverted before
 * the next row. Dev-only; zero effect on the shipped game.                */

import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const work = opt('work', '') || mkdtempSync(join(tmpdir(), 't201-falsify-'));
const keep = argv.includes('--keep');
const forceTier = opt('tier', '');

// [id, what it breaks, file, find, replace, tier, expected FAIL regex]
const ROWS = [
  ['F1', 'the follow-lead floor is never applied', 'src/sim/scroll.js',
    "if (!c || c.state !== 'gate') next = Math.max(next, followFloor);", '',
    'fast', /SIGHT/],
  ['F2', 'the corner blend is gone (the racer reaches the joint short of the halt)', 'src/pure/momentum.js',
    'return haltS - (1 + cfg.cornerBlendRate) * (jointFront - rigFront);', 'return -Infinity;',
    'fast', /WAIT|NEVER-WAIT|corner blend/],
  ['F3', 'a rolling corner holds like a gate while its gating bodies live', 'src/sim/wavegate.js',
    "  if (GATES_ROLLING) {\n    // The turn never waits",
    "  if (GATES_ROLLING && !hostiles.some((e) => e.encounterKey === c.encounterKey && e.gating && !e.gateBreakExit)) {\n    // The turn never waits",
    'fast', /NO SOFTLOCK|NEVER-WAIT/],
  ['F4', 'survivors vanish at the turn instead of following', 'src/sim/wavegate.js',
    '    const rank = lastCorner ? Infinity : rollingCarryRank(e, c.encounterKey);',
    '    const rank = Infinity;',
    'fast', /PRESSURE/],
  ['F5', 'followers never re-enter on the arriving facet', 'src/sim/wavegate.js',
    'export function updatePursuers(rigX, planeTilesPerSec = 0) {\n  if (!GATES_ROLLING) return;',
    'export function updatePursuers(rigX, planeTilesPerSec = 0) {\n  return;',
    'fast', /PRESSURE|CARRY/],
  ['F6', 'bodies are staged at their sockets whatever the view', 'src/sim/wavegate.js',
    'const advance = Math.max(0, planeTilesPerSec || 0) * (maxDelayMs + CONFIG.wasp.enterMs) / 1000;\n  return rollingStageBand(sLeftEdge(), sRightEdge(), pivotS, advance, ROLLING_GATES, out);',
    'out.lo = -1e9; out.hi = 1e9; return out;',
    'fast', /VISIBLE/],
  ['F7', 'the beat bound is the old 300 s lock', 'src/pure/waves.js',
    'beatBoundMs: 6000,', 'beatBoundMs: 300000,',
    'fast', /waits exactly its 6000 ms bound/],
  ['F7b', 'the beat bound is the old 300 s lock (played: a slow player)', 'src/pure/waves.js',
    'beatBoundMs: 6000,', 'beatBoundMs: 300000,',
    'full', /\[carried s\d [^\]]+\] BEATS/],
  ['F8', 'the encounter line outgrows its slot', 'src/pure/waves.js',
    '`${n(s.following)} FOLLOWING → ${s.nextPhase}`', '`${n(s.following)} SURVIVORS FOLLOWING → ${s.nextPhase}`',
    'fast', /fits the ~28-character HUD slot/],
  ['F9', 'the follow term binds on every frame (the floor promise is broken)', 'src/sim/scroll.js',
    "  return Math.min(floor, activeScrollEnd());\n}",
    "  return Math.min(Math.max(floor, scrollX + 0.01), activeScrollEnd());\n}",
    'fast', /FLOOR/],
  ['F10', 'the bank is not re-expressed (riding the lead line never banks fully)', 'src/pure/momentum.js',
    '  if (Number.isFinite(leadDaylight) && daylight >= leadDaylight - FOLLOW_BANK_EPS_TILES) return 1;\n', '',
    'fast', /riding the lead line banks fully/],
  ['F11', '?follow=0 is inert', 'src/mode.js',
    "  !(FOLLOW_RAW === '0' || FOLLOW_RAW === 'off');", '  true;',
    'full', /hatch-follow|FLOOR/],
  ['F12', '?gates=legacy is inert', 'src/mode.js',
    "export const GATES_LEGACY = ACTIVE_FIXTURE === null && QUERY.get('gates') === 'legacy';",
    'export const GATES_LEGACY = false;',
    'full', /hatch-legacy/],
  ['F13', 'the sim hand-off drifts from the camera\'s', 'src/pure/waves.js',
    'export const FOLD_HANDOFF_PROGRESS = 0.96;', 'export const FOLD_HANDOFF_PROGRESS = 0.9;',
    'fast', /camera's own fold hand-off/],
  ['F14', 'the zipper is back: the sim settles columns again', 'src/sim/level.js',
    "export function levelBuildRevision() { return buildRevision; }",
    "export function levelBuildRevision() { return buildRevision; }\nexport function settleColumn(s) { built[s] = 1; buildRevision++; }",
    'fast', /keeps no zipper/],
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

async function domainRun(tier) {
  const domain = pathToFileURL(join(work, 'tools', 'pathcheck', 't-201-race-pass.mjs')).href;
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
  const env = tier === 'fast' ? { HB_GATE_FAST: '1' } : { HB_GATE_FAST: '' };
  const { err, stdout, stderr } = await runChild(['--input-type=module', '-e', src], env);
  if (err && !stdout) return { error: (stderr || err.message).split('\n').slice(0, 3).join(' ') };
  return JSON.parse(stdout);
}

copyTree();
console.log(`work copy: ${work}`);
const tiers = new Set(ROWS.filter(([id]) => !only || only.has(id)).map((r) => forceTier || r[5]));
let baselineGreen = true;
for (const tier of tiers) {
  const b = await domainRun(tier);
  const green = !b.error && b.fails === 0;
  baselineGreen = baselineGreen && green;
  console.log(`baseline (unbroken copy, ${tier} tier): ` + (b.error ? 'ERROR ' + b.error
    : `${b.passes} passed, ${b.fails} failed, ${b.wallS} s`) + (green ? '' : ' — NOT GREEN'));
  if (!green) for (const e of (b.errs || []).slice(0, 5)) console.log('   ', e.slice(0, 200));
}
console.log('| row | what is broken | file | tier | went red? | evidence |');
console.log('| --- | --- | --- | --- | --- | --- |');
const pristine = new Map();
const results = [];
for (const [id, what, file, find, replace, rowTier, expect] of ROWS) {
  if (only && !only.has(id)) continue;
  const tier = forceTier || rowTier;
  const path = join(work, file);
  if (!pristine.has(file)) pristine.set(file, readFileSync(path, 'utf8'));
  const text = pristine.get(file);
  if (!text.includes(find)) {
    console.log(`| ${id} | ${what} | ${file} | ${tier} | MUTATION NOT APPLIED | target text not found |`);
    results.push({ id, applied: false });
    continue;
  }
  writeFileSync(path, text.replace(find, replace));
  const r = await domainRun(tier);
  writeFileSync(path, text);                       // restore before the next row
  const fails = r.error ? [] : (r.errs || []).filter((e) => e.startsWith('FAIL') || e.startsWith('THREW'));
  const hit = fails.find((e) => expect.test(e)) || null;
  const red = !!hit;
  results.push({ id, applied: true, red });
  const evidence = r.error ? 'ERROR ' + r.error
    : `${hit ? hit.slice(0, 260) : 'no FAIL matching ' + expect} (${r.passes} passed, ${r.fails} failed, ${r.wallS} s)`;
  console.log(`| ${id} | ${what} | ${file} | ${tier} | ${red ? 'YES' : 'NO'} | ${evidence.replace(/\|/g, '/')} |`);
}
const bad = results.filter((r) => !r.applied || !r.red);
console.log(bad.length ? `\n${bad.length} row(s) did not bind: ${bad.map((r) => r.id).join(', ')}`
  : '\nevery guard went red when its behaviour was broken');
if (!baselineGreen) console.log('a baseline was not green: the table above is not evidence');
if (!keep) rmSync(work, { recursive: true, force: true });
process.exit(bad.length || !baselineGreen ? 1 : 0);
