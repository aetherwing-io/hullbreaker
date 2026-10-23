#!/usr/bin/env node
// pathcheck.mjs — HULLBREAKER's headless gate. Run from the repo root:
//
//   node tools/pathcheck.mjs              the CORE tier: the per-edit hook and the merge gate
//   node tools/pathcheck.mjs --deep       CORE + DEEP: every headless domain (flag fixtures,
//                                         harness self-tests) — on demand, never merge-blocking
//   node tools/pathcheck.mjs --tier T     core | deep | play | all   (all = the pre-T-120 suite)
//   node tools/pathcheck.mjs --only a,b   just these domains (the SHARED producers still run first)
//   node tools/pathcheck.mjs --serial     one process, manifest order, no parallel lanes
//   node tools/pathcheck.mjs --json F     write per-domain passes / fails / ms / FAIL lines to F
//   node tools/pathcheck.mjs --list       print every domain's tier and lane, run nothing
//   node tools/pathcheck.mjs --check-lanes  prove each INDEPENDENT domain gives the same counts alone
//   node tools/pathcheck.mjs --help         this usage
//
//   HB_GATE_FAST=1    long played proofs run their per-edit subset (the PostToolUse hook sets it;
//                     tools/orch/merge-task.sh unsets it)
//   HB_GATE_LANES=N   parallel lane processes for INDEPENDENT domains (default 3, or 0 = one
//                     process when the 1-min load is past 12 per core: lanes only add CPU there)
//
// The assertions live in tools/pathcheck/ — one module per domain, in the order
// tools/pathcheck/manifest.mjs lists. tools/pathcheck/_tiers.mjs says which of
// them are DEEP-only or PLAY-only (everything else is CORE) and which CORE
// domains are independent enough to run in a parallel lane (T-120, from T-108's
// audit, docs/proposals/2026-10-test-audit.md §7). The layer guards and the
// ok()/near() helpers live in tools/pathcheck/_context.mjs, evaluated before any
// domain.
//
// CONTRACT (tools/orch/merge-task.sh, tools/gatecheck.mjs and every gate agent
// read it): the LAST line is `pathcheck: N passed, M failed`, and the exit code
// is non-zero on any failed assertion, any domain that threw, any lane that
// died, or a refusal (unlisted module, stale tier map).

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);
if (flag('--help') || flag('-h')) {
  // the usage is this file's header comment, up to the CONTRACT paragraph
  const head = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  console.log(head.slice(1, head.findIndex((l) => l.startsWith('// The assertions live'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

const MODULE_DIR = new URL('./pathcheck/', import.meta.url);
const PRODUCERS = ['pathcheck-suite', 'view-scale-experiment', 'world-transitions'];

// ---- the manifest, by name ----------------------------------------------------
// A domain module that exists but is NOT listed in the manifest would run
// nothing while the gate still printed green — the silent-drop the T-037 split
// exists to prevent. So the runner refuses to run rather than under-report.
const manifestSrc = readFileSync(fileURLToPath(new URL('manifest.mjs', MODULE_DIR)), 'utf8');
const importOf = new Map([...manifestSrc.matchAll(/import \* as (d\d+) from '\.\/([\w.-]+)\.mjs'/g)]
  .map((m) => [m[1], m[2]]));
const ORDER = [...manifestSrc.slice(manifestSrc.indexOf('export const DOMAINS'))
  .matchAll(/^\s*(d\d+),/gm)].map((m) => importOf.get(m[1]));
{
  const listed = new Set([...importOf.values()].map((f) => f + '.mjs'));
  const unlisted = readdirSync(fileURLToPath(MODULE_DIR))
    .filter((f) => f.endsWith('.mjs') && f !== 'manifest.mjs' && !f.startsWith('_') && !listed.has(f));
  if (unlisted.length) {
    console.error('pathcheck: ' + unlisted.length + ' domain module(s) present but not listed in ' +
      'manifest.mjs: ' + unlisted.join(', ') + '\n' +
      'Their assertions would not run and this gate would still print green. ' +
      'Add them to the manifest in the position they must run.');
    process.exit(1);
  }
}

const TIERS = await import(new URL('_tiers.mjs', MODULE_DIR).href);
{
  const known = new Set(ORDER);
  const stale = [...TIERS.DEEP_ONLY, ...TIERS.PLAY_ONLY, ...TIERS.INDEPENDENT].filter((n) => !known.has(n));
  if (stale.length) {
    console.error('pathcheck: tools/pathcheck/_tiers.mjs names ' + stale.length + ' domain(s) the ' +
      'manifest does not list: ' + stale.join(', ') + ' — fix the tier map (a stale entry re-tiers nothing).');
    process.exit(1);
  }
  const both = TIERS.DEEP_ONLY.filter((n) => TIERS.PLAY_ONLY.includes(n));
  if (both.length) { console.error('pathcheck: domains in both DEEP_ONLY and PLAY_ONLY: ' + both.join(', ')); process.exit(1); }
}
const tierOf = (name) => (TIERS.PLAY_ONLY.includes(name) ? 'play'
  : TIERS.DEEP_ONLY.includes(name) ? 'deep' : 'core');

const TIER = flag('--deep') ? 'core+deep' : (opt('--tier') || 'core');
const TIER_SET = {
  core: ['core'], deep: ['deep'], play: ['play'], 'core+deep': ['core', 'deep'], all: ['core', 'deep', 'play'],
}[TIER];
if (!TIER_SET) { console.error('pathcheck: unknown --tier ' + TIER + ' (core | deep | play | all)'); process.exit(2); }
const ONLY = opt('--only') ? new Set(opt('--only').split(',').map((s) => s.trim()).filter(Boolean)) : null;
if (ONLY) {
  const unknown = [...ONLY].filter((n) => !ORDER.includes(n));
  if (unknown.length) { console.error('pathcheck: --only names unknown domain(s): ' + unknown.join(', ')); process.exit(2); }
}

// which domains this invocation runs, in manifest order; producers always first
const selected = ORDER.filter((n) => (ONLY ? ONLY.has(n) : TIER_SET.includes(tierOf(n))));
const runList = ORDER.filter((n) => selected.includes(n) ||
  (PRODUCERS.includes(n) && selected.some((s) => !PRODUCERS.includes(s) && !TIERS.INDEPENDENT.includes(s))));

if (flag('--list')) {
  for (const n of ORDER) {
    const t = tierOf(n);
    console.log(`${String(ORDER.indexOf(n)).padStart(2)} ${t.padEnd(4)} ${TIERS.INDEPENDENT.includes(n) ? 'lane ' : 'chain'} ${n}`);
  }
  const c = (t) => ORDER.filter((n) => tierOf(n) === t).length;
  console.log(`core ${c('core')} (independent ${TIERS.INDEPENDENT.length}), deep ${c('deep')}, play ${c('play')}`);
  process.exit(0);
}

// ---- running domains in THIS process ---------------------------------------------
// FAIL lines are attributed to the domain that printed them (console.error is
// wrapped, never silenced), so --json and the lane summaries can say which
// domain failed what.
async function runHere(names) {
  const ctx = await import(new URL('_context.mjs', MODULE_DIR).href);       // layer guards run here
  const manifest = await import(new URL('manifest.mjs', MODULE_DIR).href);
  if (manifest.DOMAINS.length !== ORDER.length) {
    console.error('pathcheck: parsed ' + ORDER.length + ' manifest entries but DOMAINS has ' +
      manifest.DOMAINS.length + ' — refusing to guess which module is which');
    process.exit(1);
  }
  let current = '(prelude)';
  const failLines = new Map();
  const realError = console.error.bind(console);
  console.error = (...parts) => {
    const line = parts.map(String).join(' ');
    if (line.startsWith('FAIL ')) {
      if (!failLines.has(current)) failLines.set(current, []);
      failLines.get(current).push(line.slice(5));
    }
    realError(...parts);
  };
  const SHARED = {};
  const rows = [];
  let threwCount = 0;
  for (const name of names) {
    const i = ORDER.indexOf(name);
    current = name;
    const before = ctx.counts();
    const t0 = performance.now();
    let threw = null;
    try { await manifest.DOMAINS[i].run(SHARED); }
    catch (err) {
      threw = String(err && err.stack || err).split('\n').slice(0, 4).join(' | ');
      threwCount++;
      realError('FAIL ' + name + ' threw: ' + threw);
    }
    const after = ctx.counts();
    rows.push({ name, tier: tierOf(name), ms: Math.round(performance.now() - t0),
      passes: after.passes - before.passes, fails: after.fails - before.fails, threw,
      failLines: failLines.get(name) || [] });
  }
  console.error = realError;
  const { passes, fails } = ctx.counts();
  return { passes, fails: fails + threwCount, rows };
}

// ---- lane mode (a child of the main runner) ---------------------------------------
if (opt('--lane') !== undefined) {
  // A lane must never outlive the runner that started it. The merge gate and
  // the per-edit hook bound pathcheck with `kill -9`, which nobody can trap, and
  // a domain can block this thread for minutes (execFileSync) or forever (a
  // hung loop). So a watchdog THREAD checks the parent once a second and kills
  // this whole process — from a worker, so a blocked main thread cannot stop it
  // — the moment the runner is gone (the hook's 2026-08-02 incident: two
  // orphaned gates pinned a core each for 24h48m).
  const { Worker } = await import('node:worker_threads');
  const watchdog = new Worker(`
    const { workerData } = require('node:worker_threads');
    setInterval(() => { if (process.ppid !== workerData.parent) process.kill(workerData.self, 'SIGKILL'); }, 1000);
  `, { eval: true, workerData: { parent: process.ppid, self: process.pid } });
  watchdog.unref();
  const names = opt('--lane').split(',').filter(Boolean);
  const r = await runHere(names);
  process.stdout.write('\n@@pathcheck-lane ' + JSON.stringify(r) + '\n');
  process.exit(0);
}

// spawn one lane; resolves with its summary (or a synthetic failure if it died)
const LIVE = new Set();
let killedBy = null;              // a run ended by a signal keeps its marker (reported by the next run)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    killedBy = sig;
    console.error(`pathcheck: stopped by ${sig} before it finished — this run checked nothing conclusively`);
    for (const c of LIVE) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
    process.exit(128 + 2);
  });
}
function spawnLane(names, index) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--lane', names.join(',')],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HB_PATHCHECK_LANE: '1' } });
    LIVE.add(child);
    child.on('exit', () => LIVE.delete(child));
    let summary = null, outBuf = '', errBuf = '', tail = [];
    const relay = (buf, chunk, write) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.startsWith('@@pathcheck-lane ')) { try { summary = JSON.parse(line.slice(17)); } catch { /* reported below */ } }
        else if (line.length) { write(line); tail.push(line); if (tail.length > 20) tail.shift(); }
      }
      return buf;
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { outBuf = relay(outBuf, c, (l) => console.log(l)); });
    child.stderr.on('data', (c) => { errBuf = relay(errBuf, c, (l) => console.error(l)); });
    child.on('close', (code, signal) => {
      const ms = Math.round(performance.now() - t0);
      if (summary && code === 0) { resolve({ ...summary, lane: index, ms, names }); return; }
      const why = `lane ${index} (${names.join(', ')}) died: exit ${code}${signal ? ' signal ' + signal : ''}` +
        (tail.length ? ' — last output: ' + tail.slice(-3).join(' | ') : '');
      console.error('FAIL pathcheck ' + why);
      resolve({ passes: summary?.passes || 0, fails: (summary?.fails || 0) + 1, rows: summary?.rows || [],
        lane: index, ms, names, died: why });
    });
  });
}

// longest-processing-time-first split of the lane domains into k lanes
function splitLanes(names, k) {
  const cost = (n) => TIERS.COST_MS[n] ?? 500;
  const lanes = Array.from({ length: k }, () => ({ load: 0, names: [] }));
  for (const n of [...names].sort((a, b) => cost(b) - cost(a))) {
    const l = lanes.reduce((m, x) => (x.load < m.load ? x : m), lanes[0]);
    l.names.push(n); l.load += cost(n);
  }
  return lanes.filter((l) => l.names.length)
    .map((l) => l.names.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
}

// ---- --check-lanes: each INDEPENDENT domain alone vs in the serial chain -----------
if (flag('--check-lanes')) {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/pathcheck-check-lanes-');
  const serial = await new Promise((resolve) => {
    // the reference is the whole suite (--tier all), so an INDEPENDENT domain of
    // any tier (the PLAY probe domain is one) has a serial row to compare with
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--serial', '--tier', 'all',
      '--json', dir + '/serial.json'], { stdio: ['ignore', 'ignore', 'ignore'], env: process.env });
    child.on('close', () => {
      try { resolve(JSON.parse(readFileSync(dir + '/serial.json', 'utf8'))); } catch { resolve(null); }
      rmSync(dir, { recursive: true, force: true });
    });
  });
  if (!serial) { console.error('pathcheck --check-lanes: the serial reference run produced no JSON'); process.exit(1); }
  const ref = new Map(serial.domains.map((d) => [d.name, d]));
  let bad = 0;
  for (const n of TIERS.INDEPENDENT) {
    const alone = await spawnLane([n], 0);
    const row = alone.rows.find((r) => r.name === n) || {};
    const r = ref.get(n) || {};
    const same = row.passes === r.passes && row.fails === r.fails && !row.threw && !alone.died;
    if (!same) bad++;
    console.log(`${same ? 'same' : 'DIFF'} ${n}: alone +${row.passes}/-${row.fails}${row.threw ? ' threw' : ''} ` +
      `serial +${r.passes}/-${r.fails}`);
  }
  console.log('pathcheck --check-lanes: ' + (TIERS.INDEPENDENT.length - bad) + ' same, ' + bad + ' different');
  process.exit(bad ? 1 : 0);
}

// ---- the run ------------------------------------------------------------------------
const t0 = performance.now();
// A run that never finished is said out loud by the runs after it in the same
// tree: the per-edit hook kills pathcheck at its watchdog and tells only its own
// stderr, which the agent never sees (it exits 0), so a killed per-edit gate
// otherwise reads like no news (playtest I-A). Each run leaves a marker naming
// its pid while it runs and removes it at its end. A dead run's marker is
// reported by EVERY later run, at the start and again just above the tally line
// (where the hook's `tail -40` and merge-task.sh's log put it in front of a
// reader), until a full CORE run (HB_GATE_FAST unset, no --only: the merge gate,
// or by hand) finishes here, re-checking everything the killed run did not.
// Markers older than three days are dropped silently. Limitation: a dead run
// whose pid was reused by an unrelated live process reads as still running.
let sayStale = () => {};
{
  const { createHash } = await import('node:crypto');
  const { existsSync, readdirSync: ls, rmSync, writeFileSync: put } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const tag = 'hullbreaker-pathcheck-' + createHash('sha1').update(fileURLToPath(MODULE_DIR)).digest('hex').slice(0, 12) + '-';
  const dir = tmpdir();
  const FAST = process.env.HB_GATE_FAST === '1';
  const stale = [];
  for (const f of ls(dir).filter((x) => x.startsWith(tag) && x.endsWith('.running'))) {
    let m = null; try { m = JSON.parse(readFileSync(dir + '/' + f, 'utf8')); } catch { /* unreadable: treat as stale */ }
    let alive = false; try { if (m && m.pid) { process.kill(m.pid, 0); alive = true; } } catch { /* gone */ }
    if (alive) continue;
    if (m && Date.now() - Date.parse(m.started) > 3 * 864e5) { try { rmSync(dir + '/' + f, { force: true }); } catch { /* raced */ } continue; }
    stale.push({ file: dir + '/' + f, ...(m || {}) });
  }
  const clears = !FAST && !ONLY && ['core', 'core+deep', 'all'].includes(TIER);
  sayStale = () => {
    if (!stale.length) return;
    console.log(`pathcheck: WARNING — ${stale.length} earlier run(s) in this tree never finished (` +
      stale.map((m) => `pid ${m.pid ?? '?'}, started ${m.started ?? '?'}, tier ${m.tier ?? '?'}${m.fast ? ', HB_GATE_FAST=1' : ''}`).join('; ') +
      '): killed — the per-edit hook\'s watchdog? — so what they were checking was NOT checked by them' +
      (clears ? '; this full run re-checks the tree and clears the report' : '; reported until a full CORE run (HB_GATE_FAST unset) finishes here'));
  };
  sayStale();
  const mine = dir + '/' + tag + process.pid + '.running';
  try { put(mine, JSON.stringify({ pid: process.pid, started: new Date().toISOString(), tier: TIER, fast: FAST })); } catch { /* best effort */ }
  process.on('exit', (code) => {
    if (killedBy) return;
    try { if (existsSync(mine)) rmSync(mine, { force: true }); } catch { /* best effort */ }
    // a full run that reached its tally re-checked what the killed runs missed
    if (clears && typeof code === 'number' && code <= 1) for (const m of stale) { try { rmSync(m.file, { force: true }); } catch { /* raced */ } }
  });
}
// The layer guards first, in this process, before any lane exists: a guard
// exit must not leave lanes running behind it.
await import(new URL('_context.mjs', MODULE_DIR).href);
// Lanes buy wall time only while the host has CPU to spare. Measured on the
// 4-core cloud host (T-120): 3 lanes ran the per-edit tier in 38.0 s against
// 62.1 s serial at load ~35, but at load 60-85 the serial run was no slower
// (151-215 s against 195-200 s) and the lanes only added 2-4 CPU-s of
// duplicated module loading. So, unless HB_GATE_LANES says otherwise, a host
// loaded past LANE_LOAD_PER_CORE per core runs the domains in one process.
const LANE_LOAD_PER_CORE = 12;
const loadPerCore = loadavg()[0] / cpus().length;
const LANES = flag('--serial') ? 0
  : process.env.HB_GATE_LANES !== undefined ? Math.max(0, Number(process.env.HB_GATE_LANES) || 0)
  : loadPerCore >= LANE_LOAD_PER_CORE ? 0 : 3;
const autoSerial = !flag('--serial') && process.env.HB_GATE_LANES === undefined && LANES === 0;
const laneNames = LANES ? runList.filter((n) => TIERS.INDEPENDENT.includes(n)) : [];
const chainNames = runList.filter((n) => !laneNames.includes(n));
const lanePlan = laneNames.length ? splitLanes(laneNames, Math.min(LANES, laneNames.length)) : [];
const lanePromises = lanePlan.map((names, i) => spawnLane(names, i + 1));
const chain = await runHere(chainNames);
const lanes = await Promise.all(lanePromises);

const allRows = [...chain.rows, ...lanes.flatMap((l) => l.rows || [])]
  .sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
const passes = chain.passes + lanes.reduce((n, l) => n + l.passes, 0);
const fails = chain.fails + lanes.reduce((n, l) => n + l.fails, 0);
const totalMs = Math.round(performance.now() - t0);

if (opt('--json')) {
  writeFileSync(opt('--json'), JSON.stringify({
    tool: 'tools/pathcheck.mjs', tier: TIER, only: ONLY ? [...ONLY] : null, when: new Date().toISOString(),
    host: { cpus: cpus().length, loadavg: loadavg().map((x) => +x.toFixed(2)) },
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^HB_/.test(k)).sort()),
    totalMs, passes, fails,
    lanes: [{ lane: 0, names: chainNames, ms: totalMs }, ...lanes.map((l) => ({ lane: l.lane, names: l.names, ms: l.ms, died: l.died || null }))],
    domains: allRows,
  }, null, 1) + '\n');
}

// Which kind of check failed: a CORE property ("a player will notice") or an
// invariant-tier one ("a design invariant moved — ask its owner"), from the
// audit's lock (tools/orch/test-audit-lock.json); reported, never re-judged.
if (fails) {
  try {
    const lock = JSON.parse(readFileSync(new URL('./orch/test-audit-lock.json', import.meta.url), 'utf8'));
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const frags = (label) => label.replace(/ #\d+$/, '').split('…').map((f) => f.trim()).filter((f) => f.length >= 4);
    const kinds = {};
    for (const r of allRows) for (const line of r.failLines) {
      const msg = norm(line);
      const site = lock.sites.find((s) => s.domain === r.name && (() => {
        let at = 0; const fr = frags(s.label); if (!fr.length) return false;
        for (const f of fr) { const i = msg.indexOf(f, at); if (i < 0) return false; at = i + f.length; }
        return true;
      })());
      const k = !site ? 'unclassified (new since the audit)'
        : site.disposition === 'CORE-GATE' ? 'core'
        : site.disposition === 'CORE-GATE:invariant-tier' ? 'invariant (ask its owner)'
        : site.disposition.toLowerCase();
      kinds[k] = (kinds[k] || 0) + 1;
    }
    const s = Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ');
    if (s) console.log('pathcheck: failed assertions by audit disposition — ' + s);
  } catch { /* the lock is optional for this report */ }
}

const notRun = ORDER.filter((n) => !runList.includes(n));
const deepNotRun = notRun.filter((n) => tierOf(n) === 'deep').length;
const playNotRun = notRun.filter((n) => tierOf(n) === 'play').length;
console.log(`pathcheck tier ${TIER}: ${runList.length} domains in ${(totalMs / 1000).toFixed(1)} s ` +
  `(${chainNames.length} in the main process${lanePlan.length ? ', ' + lanes.map((l) => `lane ${l.lane} ${l.names.length} in ${(l.ms / 1000).toFixed(1)} s`).join(', ') : ''}` +
  `${autoSerial ? `; no lanes: load ${loadavg()[0].toFixed(0)} on ${cpus().length} cores, where lanes only add CPU` : ''})` +
  (ONLY ? '; --only subset'
    : (deepNotRun ? `; ${deepNotRun} deep-only domain(s) not run (--deep runs them)` : '') +
      (playNotRun ? `; ${playNotRun} browser domain(s) not run (tools/orch/play-gate.mjs runs them)` : '')));
sayStale();
// The tally and exit are the contract tools/orch/merge-task.sh, tools/gatecheck.mjs
// and every gate agent read: this line comes last.
console.log('pathcheck: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
