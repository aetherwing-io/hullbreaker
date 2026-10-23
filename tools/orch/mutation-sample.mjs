#!/usr/bin/env node
// mutation-sample.mjs — T-108's binding sample: break the thing an assertion
// claims to guard, run the gate, record whether it goes red.
//
//   node tools/orch/mutation-sample.mjs --scratch <empty-dir>            # every mutant
//   node tools/orch/mutation-sample.mjs --scratch <dir> --only M01,M02   # a subset
//   node tools/orch/mutation-sample.mjs --list                           # print the sample
//   ... --out <file>       # default <scratch>/mutation-results.json — the committed
//                          # evidence file is written only when named explicitly
//   ... --verbose          # let the runner print each finished domain (a hang
//                          # then records the last domains that completed)
//   ... --timeout-ms N     # per-mutant bound, default 20 min; a mutant that
//                          # exceeds it is killed and recorded `hung: true`
//   ... --runner gate      # (default since T-120) run the scratch tree's OWN gate,
//                          # `tools/pathcheck.mjs --deep --json`: every headless
//                          # domain, each FAIL attributed to its domain AND tier, so
//                          # one run says both "red at all" and "red in the CORE tier
//                          # the merge gate runs" (redCore)
//   ... --runner timed     # T-108's original runner (tools/orch/pathcheck-timed.mjs)
//   ... --tier T           # with --runner gate: core | deep | all | core+deep (default)
//   ... --full-tree        # archive the whole HEAD (468 MB); by default only the
//                          # paths a headless gate reads: src, index.html, tools, assets
//   ... --jobs N           # N mutants at once, each in its own scratch tree
//   ... --resume           # skip mutants --out already holds for this revision
//   ... --tree-rev <rev>   # sample <rev> instead of HEAD (a pre-batch baseline)
//
// HOW IT STAYS OUT OF THE REAL TREE. It `git archive`s THIS worktree's HEAD
// into <scratch>/tree once, then for each mutant: reads the target file, asserts
// the `from` text occurs exactly `count` times (a mutation that silently stops
// applying is worse than none — same rule as tools/gatecheck.mjs), writes the
// mutated text, runs tools/orch/pathcheck-timed.mjs --tree <scratch>/tree over
// the mutant's domain set, then writes the original bytes back and re-verifies
// them by hash before the next mutant. The worktree is never written.
//
// WHAT "RED" MEANS. The gate is red when the runner exits non-zero: an assertion
// failed, a domain threw, or the prelude layer guard exited before any domain
// ran. `targetHit` additionally records whether the assertion the mutant was
// aimed at is among the failures (matched by its site's message prefix).
//
// DOMAIN SET. Unless a mutant names its own, every domain EXCEPT
// render-submission-contract runs (that one boots a real browser for ~5 min on
// this host and, beyond the boot, only judges material passes / idle uploads /
// MSAA; mutants that target it name it explicitly). Subset runs still prepend the three SHARED
// producers — see tools/orch/pathcheck-timed.mjs.
//
// KINDS. `property` mutants break the guarded property the way a real
// regression could. `evasion` mutants break a pin's property where its regex
// does not read (an existence proof, never a rate). `refactor` mutants are
// semantics-preserving rewrites (a rename, a reformat) — for those, red is a
// FALSE ALARM. `fix` mutants apply a
// fix for a real, observed defect — red there means the gate obstructs the fix.
// `blind` mutants reproduce an entry-20 / integrator-observed defect that no
// class claims to guard — red there would mean the gate was not blind after all.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from './mutants.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..', '..');
// --out defaults INTO the scratch dir (or, for --merge, must be named): a verify
// step run without --out must never rewrite the committed evidence (review
// finding 14).
if (opt('--merge') && !opt('--out')) { console.error('--merge needs an explicit --out'); process.exit(2); }
const OUT = resolve(opt('--out') || join(opt('--scratch') || '.', 'mutation-results.json'));
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;

// --merge a.json,b.json: fold rows from other result files (later files win per
// id) into --out, ordered as mutants.mjs lists them. T-108 ran its sample in
// three batches in two scratch trees to save wall time; this is the join.
if (opt('--merge')) {
  const base = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { mutants: [] };
  // every row remembers the tree it ran on (rows of the base file: the base's own)
  const rows = new Map(base.mutants.map((m) => [m.id, { ...m, tree: m.tree || base.base }]));
  for (const f of opt('--merge').split(',')) {
    const B = JSON.parse(readFileSync(resolve(f), 'utf8'));
    for (const m of B.mutants) rows.set(m.id, { ...m, batch: f.split('/').pop(), tree: B.base });
  }
  const order = MUTANTS.map((x) => x.id);
  const known = new Set(order);
  for (const id of rows.keys()) if (!known.has(id)) rows.delete(id);   // ids no longer in the sample
  // kinds come from mutants.mjs as it stands (a mutant re-labelled after it ran, e.g. M04 -> equivalent)
  for (const m of MUTANTS) if (rows.has(m.id)) rows.get(m.id).kind = m.kind;
  writeFileSync(OUT, JSON.stringify({
    tool: 'tools/orch/mutation-sample.mjs', when: new Date().toISOString(), base: base.base,
    merged: [...new Set([...(base.merged || []), ...opt('--merge').split(',').map((f) => f.split('/').pop())])],
    mutants: [...rows.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
  }, null, 2) + '\n');
  console.log('mutation-sample: merged ' + rows.size + ' rows into ' + OUT);
  process.exit(0);
}

if (args.includes('--list')) {
  for (const m of MUTANTS) console.log(`${m.id} [${m.targetClass}/${m.kind}] ${m.site}\n   ${m.why}`);
  process.exit(0);
}
if (!opt('--scratch')) { console.error('usage: --scratch <empty-dir> [--only ids] [--out file]'); process.exit(2); }
const SCRATCH = resolve(opt('--scratch'));
// --tree-rev <rev>: sample that commit instead of HEAD (e.g. the baseline before a batch)
const REV = opt('--tree-rev') || 'HEAD';
const RUNNER = opt('--runner') || 'gate';
const GATE_TIER = opt('--tier') || 'core+deep';
// --jobs N: N mutants at once, each in its own scratch tree (tree, tree-2, ...)
const JOBS = Math.max(1, Number(opt('--jobs')) || 1);
const treeOf = (j) => join(SCRATCH, j === 0 ? 'tree' : 'tree-' + (j + 1));
for (let j = 0; j < JOBS; j++) {
  const TREE = treeOf(j);
  if (existsSync(join(TREE, 'tools', 'pathcheck', 'manifest.mjs'))) continue;
  mkdirSync(TREE, { recursive: true });
  const paths = args.includes('--full-tree') ? [] : ['src', 'index.html', 'tools', 'assets'];
  const tar = execFileSync('git', ['-C', REPO, 'archive', REV, ...paths], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', TREE], { input: tar, maxBuffer: 1 << 30 });
  const nm = join(REPO, 'tools', 'playtest', 'node_modules');
  if (existsSync(nm)) symlinkSync(nm, join(TREE, 'tools', 'playtest', 'node_modules'));
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { mutants: [] };
const results = new Map(prior.mutants.map((m) => [m.id, m]));
const SKIP_DEFAULT = 'render-submission-contract';
const TIMEOUT_MS = Number(opt('--timeout-ms')) || 20 * 60 * 1000;
const BASE = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', REV], { encoding: 'utf8' }).trim();

function runAsync(argsList, opts) {
  return new Promise((done) => {
    const child = spawn(process.execPath, argsList, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', killed = false;
    child.stdout.on('data', (c) => { stdout += c; if (stdout.length > 4e6) stdout = stdout.slice(-2e6); });
    child.stderr.on('data', (c) => { stderr += c; if (stderr.length > 4e6) stderr = stderr.slice(-2e6); });
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, opts.timeout);
    child.on('close', (status, signal) => { clearTimeout(timer); done({ status, signal, stdout, stderr, killed }); });
  });
}

async function runMutant(m, TREE) {
  const edits = m.edits || [{ file: m.file, from: m.from, to: m.to, count: m.count ?? 1 }];
  const originals = [];
  let applyError = null;
  for (const e of edits) {
    const path = join(TREE, e.file);
    const buf = readFileSync(path);
    const text = buf.toString('utf8');
    const hits = text.split(e.from).length - 1;
    if (hits !== (e.count ?? 1)) { applyError = `${e.file}: expected ${e.count ?? 1} occurrence(s) of the mutation anchor, found ${hits}`; break; }
    originals.push({ path, buf, hash: sha(buf) });
  }
  if (args.includes('--dry')) {
    console.error(`[dry] ${m.id} ${applyError ? 'APPLY-ERROR ' + applyError : 'anchors ok'}`);
    return null;
  }
  if (applyError) return { id: m.id, error: applyError };
  for (const e of edits) {
    const path = join(TREE, e.file);
    writeFileSync(path, readFileSync(path, 'utf8').split(e.from).join(e.to));
  }
  const json = join(SCRATCH, `${m.id}.json`);
  try { rmSync(json, { force: true }); } catch { /* fresh */ }
  let runArgs;
  if (RUNNER === 'timed') {
    runArgs = [join(HERE, 'pathcheck-timed.mjs'), '--tree', TREE, '--json', json];
    if (!args.includes('--verbose')) runArgs.push('--quiet');
    if (m.domains) runArgs.push('--only', m.domains.join(','));
    else runArgs.push('--skip', SKIP_DEFAULT);
  } else {
    // the tree's own gate, exactly as the merge gate runs it (lanes and all)
    runArgs = [join(TREE, 'tools', 'pathcheck.mjs'), '--json', json];
    if (m.domains) runArgs.push('--only', m.domains.join(','));
    else if (GATE_TIER === 'core+deep') runArgs.push('--deep');
    else runArgs.push('--tier', GATE_TIER);
  }
  const t0 = Date.now();
  // A mutant can make a domain loop forever (M27 did: see the doc). Bound it,
  // and record the hang and the last domain the runner reported starting.
  const r = await runAsync(runArgs, {
    env: { ...process.env, HB_GATE_FAST: process.env.HB_GATE_FAST || '' }, cwd: TREE, timeout: TIMEOUT_MS,
  });
  const ms = Date.now() - t0;
  let rep = null;
  try { rep = JSON.parse(readFileSync(json, 'utf8')); } catch { /* prelude exit: no JSON */ }
  // pathcheck-timed rows carry `file`; the gate's rows carry `name` and `tier`
  if (rep) for (const d of rep.domains) { d.file = d.file || d.name; d.tier = d.tier || null; }
  const failLines = rep ? rep.domains.flatMap((d) => d.failLines.map((l) => `${d.file}: ${l}`)) : [];
  const threw = rep ? rep.domains.filter((d) => d.threw).map((d) => `${d.file}: ${d.threw}`) : [];
  const coreRed = rep ? rep.domains.some((d) => d.tier === 'core' && (d.fails > 0 || d.threw)) : r.status !== 0;
  const lanesDied = rep && Array.isArray(rep.lanes) ? rep.lanes.filter((l) => l.died).map((l) => l.died) : [];
  const prelude = !rep ? ((r.stderr || '') + (r.stdout || '')).trim().split('\n').filter((l) => /pathcheck/.test(l)).slice(0, 3) : [];
  const targetHit = m.expect ? failLines.some((l) => l.includes(m.expect)) : null;
  const hung = r.killed;
  const progress = (r.stderr || '').split('\n').filter((l) => l.startsWith('[timed]'));
  const row = {
    id: m.id, targetClass: m.targetClass, kind: m.kind, site: m.site, why: m.why,
    mutation: edits.map((e) => ({ file: e.file, from: e.from.slice(0, 160), to: e.to.slice(0, 160) })),
    domainsRun: m.domains || `all except ${SKIP_DEFAULT}`,
    runner: RUNNER, tier: RUNNER === 'gate' ? (m.domains ? 'only:' + m.domains.join(',') : GATE_TIER) : null,
    exit: r.status, red: r.status !== 0, redCore: RUNNER === 'gate' ? (r.status !== 0 && (coreRed || !rep)) : null,
    lanesDied, ms, hung,
    lastDomainsReported: hung ? progress.slice(-2) : undefined,
    fails: rep ? rep.fails : null, threwDomains: threw, preludeExit: prelude,
    targetHit, failCount: failLines.length, failLines: failLines.slice(0, 12),
    failingDomains: [...new Set(failLines.map((l) => l.split(':')[0]))],
    tree: BASE,
  };
  // restore and verify
  for (const o of originals.reverse()) {
    writeFileSync(o.path, o.buf);
    if (sha(readFileSync(o.path)) !== o.hash) { console.error('RESTORE FAILED for ' + o.path); process.exit(3); }
  }
  return row;
}

// --resume: skip mutants the --out file already holds for this same HEAD
const queue = MUTANTS.filter((m) => (!only || only.has(m.id)) &&
  !(args.includes('--resume') && results.get(m.id)?.tree === BASE && !results.get(m.id)?.error));
const order = MUTANTS.map((x) => x.id);
const write = () => writeFileSync(OUT, JSON.stringify({
  tool: 'tools/orch/mutation-sample.mjs', when: new Date().toISOString(), base: BASE,
  runner: RUNNER, tier: RUNNER === 'gate' ? GATE_TIER : null,
  mutants: [...results.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
}, null, 2) + '\n');
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async (_, j) => {
  const TREE = treeOf(j);
  while (queue.length) {
    const m = queue.shift();
    const row = await runMutant(m, TREE);
    if (!row) continue;
    results.set(m.id, row);
    console.error(`[mutant] ${m.id} ${row.error ? 'APPLY-ERROR ' + row.error : (row.red ? 'RED' : 'green') +
      (row.redCore === null || row.redCore === undefined ? '' : row.redCore ? ' (core tier red)' : row.red ? ' (deep tier only)' : '') +
      ' target=' + row.targetHit + ' fails=' + row.failCount + ' ' + row.ms + 'ms' +
      (row.failingDomains?.length ? ' [' + row.failingDomains.join(', ') + ']' : '') +
      (row.preludeExit?.length ? ' prelude: ' + row.preludeExit[0].slice(0, 120) : '')}`);
    write();
  }
}));
console.log('mutation-sample: results in ' + OUT);
