#!/usr/bin/env node
// mutation-sample.mjs — T-108's binding sample: break the thing an assertion
// claims to guard, run the gate, record whether it goes red.
//
//   node tools/orch/mutation-sample.mjs --scratch <empty-dir>            # every mutant
//   node tools/orch/mutation-sample.mjs --scratch <dir> --only M01,M02   # a subset
//   node tools/orch/mutation-sample.mjs --list                           # print the sample
//   ... --out tools/orch/evidence/mutation-results.json                  # (default)
//   ... --verbose          # let the runner print each finished domain (a hang
//                          # then records the last domains that completed)
//   ... --timeout-ms N     # per-mutant bound, default 20 min; a mutant that
//                          # exceeds it is killed and recorded `hung: true`
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
// regression could. `refactor` mutants are semantics-preserving rewrites (a
// rename, a reformat) — for those, red is a FALSE ALARM. `fix` mutants apply a
// fix for a real, observed defect — red there means the gate obstructs the fix.
// `blind` mutants reproduce an entry-20 / integrator-observed defect that no
// class claims to guard — red there would mean the gate was not blind after all.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTANTS } from './mutants.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = resolve(opt('--out') || join(HERE, 'evidence', 'mutation-results.json'));
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;

// --merge a.json,b.json: fold rows from other result files (later files win per
// id) into --out, ordered as mutants.mjs lists them. T-108 ran its sample in
// three batches in two scratch trees to save wall time; this is the join.
if (opt('--merge')) {
  const base = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { mutants: [] };
  const rows = new Map(base.mutants.map((m) => [m.id, m]));
  for (const f of opt('--merge').split(',')) {
    for (const m of JSON.parse(readFileSync(resolve(f), 'utf8')).mutants) rows.set(m.id, { ...m, batch: f.split('/').pop() });
  }
  const order = MUTANTS.map((x) => x.id);
  const known = new Set(order);
  for (const id of rows.keys()) if (!known.has(id)) rows.delete(id);   // ids no longer in the sample
  // kinds come from mutants.mjs as it stands (a mutant re-labelled after it ran, e.g. M04 -> equivalent)
  for (const m of MUTANTS) if (rows.has(m.id)) rows.get(m.id).kind = m.kind;
  writeFileSync(OUT, JSON.stringify({
    tool: 'tools/orch/mutation-sample.mjs', when: new Date().toISOString(), base: base.base,
    merged: opt('--merge').split(',').map((f) => f.split('/').pop()),
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
const TREE = join(SCRATCH, 'tree');
if (!existsSync(join(TREE, 'tools', 'pathcheck', 'manifest.mjs'))) {
  mkdirSync(TREE, { recursive: true });
  const tar = execFileSync('git', ['-C', REPO, 'archive', 'HEAD'], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', TREE], { input: tar, maxBuffer: 1 << 30 });
  const nm = join(REPO, 'tools', 'playtest', 'node_modules');
  if (existsSync(nm)) symlinkSync(nm, join(TREE, 'tools', 'playtest', 'node_modules'));
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { mutants: [] };
const results = new Map(prior.mutants.map((m) => [m.id, m]));
const SKIP_DEFAULT = 'render-submission-contract';
const TIMEOUT_MS = Number(opt('--timeout-ms')) || 20 * 60 * 1000;

for (const m of MUTANTS) {
  if (only && !only.has(m.id)) continue;
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
  let row;
  if (args.includes('--dry')) {
    console.error(`[dry] ${m.id} ${applyError ? 'APPLY-ERROR ' + applyError : 'anchors ok'}`);
    continue;
  }
  if (applyError) {
    row = { id: m.id, error: applyError };
  } else {
    for (const e of edits) {
      const path = join(TREE, e.file);
      writeFileSync(path, readFileSync(path, 'utf8').split(e.from).join(e.to));
    }
    const json = join(SCRATCH, `${m.id}.json`);
    const runArgs = [join(HERE, 'pathcheck-timed.mjs'), '--tree', TREE, '--json', json];
    if (!args.includes('--verbose')) runArgs.push('--quiet');
    if (m.domains) runArgs.push('--only', m.domains.join(','));
    else runArgs.push('--skip', SKIP_DEFAULT);
    const t0 = Date.now();
    // A mutant can make a domain loop forever (M27 did: see the doc). Bound it,
    // and record the hang and the last domain the runner reported starting.
    const r = spawnSync(process.execPath, runArgs, {
      encoding: 'utf8', env: process.env, maxBuffer: 64 << 20,
      timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
    });
    const ms = Date.now() - t0;
    let rep = null;
    try { rep = JSON.parse(readFileSync(json, 'utf8')); } catch { /* prelude exit: no JSON */ }
    const failLines = rep ? rep.domains.flatMap((d) => d.failLines.map((l) => `${d.file}: ${l}`)) : [];
    const threw = rep ? rep.domains.filter((d) => d.threw).map((d) => `${d.file}: ${d.threw}`) : [];
    const prelude = !rep ? ((r.stderr || '') + (r.stdout || '')).trim().split('\n').filter((l) => /pathcheck/.test(l)).slice(0, 3) : [];
    const targetHit = m.expect ? failLines.some((l) => l.includes(m.expect)) : null;
    const hung = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGKILL';
    const progress = (r.stderr || '').split('\n').filter((l) => l.startsWith('[timed]'));
    row = {
      id: m.id, targetClass: m.targetClass, kind: m.kind, site: m.site, why: m.why,
      mutation: edits.map((e) => ({ file: e.file, from: e.from.slice(0, 160), to: e.to.slice(0, 160) })),
      domainsRun: m.domains || `all except ${SKIP_DEFAULT}`,
      exit: r.status, red: r.status !== 0, ms, hung,
      lastDomainsReported: hung ? progress.slice(-2) : undefined,
      fails: rep ? rep.fails : null, threwDomains: threw, preludeExit: prelude,
      targetHit, failCount: failLines.length, failLines: failLines.slice(0, 12),
      failingDomains: [...new Set(failLines.map((l) => l.split(':')[0]))],
    };
    // restore and verify
    for (const o of originals) {
      writeFileSync(o.path, o.buf);
      if (sha(readFileSync(o.path)) !== o.hash) { console.error('RESTORE FAILED for ' + o.path); process.exit(3); }
    }
  }
  results.set(m.id, row);
  console.error(`[mutant] ${m.id} ${row.error ? 'APPLY-ERROR ' + row.error : (row.red ? 'RED' : 'green') +
    ' target=' + row.targetHit + ' fails=' + row.failCount + ' ' + row.ms + 'ms'}`);
  const order = MUTANTS.map((x) => x.id);
  writeFileSync(OUT, JSON.stringify({
    tool: 'tools/orch/mutation-sample.mjs', when: new Date().toISOString(),
    base: execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    mutants: [...results.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
  }, null, 2) + '\n');
}
console.log('mutation-sample: results in ' + OUT);
