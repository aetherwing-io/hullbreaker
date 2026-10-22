#!/usr/bin/env node
// pathcheck-timed.mjs — T-108 scratch tool: an INSTRUMENTED copy of the
// pathcheck runner. It does what tools/pathcheck.mjs does (layer guards via
// _context.mjs, then every manifest domain in order, one process, one SHARED
// object) and additionally records, per domain: wall time, assertions passed,
// assertions failed, and the FAIL lines that domain printed.
//
//   node tools/orch/pathcheck-timed.mjs                       # whole gate, this tree
//   node tools/orch/pathcheck-timed.mjs --json out.json       # + machine-readable result
//   node tools/orch/pathcheck-timed.mjs --tree <dir>          # run another tree's gate
//   node tools/orch/pathcheck-timed.mjs --only a,b            # subset (file basenames, no .mjs)
//   node tools/orch/pathcheck-timed.mjs --skip render-submission-contract
//
// Subset runs: domains still run in manifest order, and the three SHARED
// producers (pathcheck-suite, view-scale-experiment, world-transitions) are
// always prepended because later domains destructure values from them. Module
// singletons (e.g. setSimEdges) can still differ from a full run — a subset
// result is evidence about the selected domains only, and the T-108 mutation
// sample says which domains it ran for each mutant.
//
// Zero effect on the game or the real gate: it imports the gate's own modules
// read-only and writes only the --json file you name. It never edits
// tools/pathcheck/ or tools/pathcheck.mjs.
//
// Honesty / limitations:
//   * Wall time on a loaded host is noisy (load average was ~18-20 on 4 cores
//     while T-108 ran); a domain that spawns a browser or a child process is
//     dominated by that child, so treat per-domain ms as an order of magnitude.
//   * "assertions" = ok()/near() evaluations counted by _context.mjs's own
//     counters, diffed before/after each domain; a domain that throws is
//     recorded as `threw` (the real runner would crash at that point).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const here = fileURLToPath(new URL('.', import.meta.url));
const tree = resolve(opt('--tree') || join(here, '..', '..'));
const jsonOut = opt('--json');
const only = opt('--only') ? new Set(opt('--only').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const skip = opt('--skip') ? new Set(opt('--skip').split(',').map((s) => s.trim()).filter(Boolean)) : new Set();
const quiet = args.includes('--quiet');
const PRODUCERS = ['pathcheck-suite', 'view-scale-experiment', 'world-transitions'];

const modDir = join(tree, 'tools', 'pathcheck');
const manifestSrc = readFileSync(join(modDir, 'manifest.mjs'), 'utf8');
const importOf = new Map([...manifestSrc.matchAll(/import \* as (d\d+) from '\.\/([\w.-]+)\.mjs'/g)]
  .map((m) => [m[1], m[2]]));
const order = [...manifestSrc.slice(manifestSrc.indexOf('DOMAINS')).matchAll(/^\s*(d\d+),/gm)].map((m) => m[1]);
const files = order.map((id) => importOf.get(id));

// Same refusal the real runner makes: a present-but-unlisted module.
const listed = new Set(files.map((f) => f + '.mjs'));
const unlisted = readdirSync(modDir).filter((f) => f.endsWith('.mjs') && f !== 'manifest.mjs' &&
  !f.startsWith('_') && !listed.has(f));
if (unlisted.length) {
  console.error('pathcheck-timed: unlisted domain module(s): ' + unlisted.join(', '));
  process.exit(1);
}

// Capture FAIL lines per domain without changing what the domains print.
let current = '(prelude)';
const failLines = new Map();
const realError = console.error.bind(console);
console.error = (...parts) => {
  const line = parts.map(String).join(' ');
  if (line.startsWith('FAIL ')) {
    if (!failLines.has(current)) failLines.set(current, []);
    failLines.get(current).push(line.slice(5));
  }
  if (!quiet || line.startsWith('FAIL ')) realError(...parts);
};

const t0 = performance.now();
const ctx = await import(pathToFileURL(join(modDir, '_context.mjs')).href);     // runs the layer guards
const tCtx = performance.now();
const manifest = await import(pathToFileURL(join(modDir, 'manifest.mjs')).href); // imports every domain
const tMan = performance.now();
if (manifest.DOMAINS.length !== files.length) {
  console.error('pathcheck-timed: parsed ' + files.length + ' manifest entries but DOMAINS has ' +
    manifest.DOMAINS.length + ' — refusing to mis-attribute timings');
  process.exit(1);
}

const selected = (f) => !skip.has(f) && (!only || only.has(f) || PRODUCERS.includes(f));
const SHARED = {};
const rows = [];
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if (!selected(file)) continue;
  current = file;
  const before = ctx.counts();
  const start = performance.now();
  let threw = null;
  try { await manifest.DOMAINS[i].run(SHARED); }
  catch (err) { threw = String(err && err.stack || err).split('\n').slice(0, 3).join(' | '); }
  const ms = performance.now() - start;
  const after = ctx.counts();
  rows.push({
    index: i, file, title: manifest.DOMAINS[i].title || '', ms: Math.round(ms),
    passes: after.passes - before.passes, fails: after.fails - before.fails,
    threw, failLines: failLines.get(file) || [],
  });
  if (!quiet) realError(`[timed] ${String(i).padStart(2)} ${file} ${Math.round(ms)}ms ` +
    `+${after.passes - before.passes}/-${after.fails - before.fails}${threw ? ' THREW' : ''}`);
}
const total = performance.now() - t0;
const { passes, fails } = ctx.counts();

let head = null;
try { head = execFileSync('git', ['-C', tree, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
catch { /* scratch trees are not repositories */ }

const result = {
  tool: 'tools/orch/pathcheck-timed.mjs',
  tree, head, when: new Date().toISOString(),
  host: { cpus: cpus().length, loadavg: loadavg().map((x) => +x.toFixed(2)) },
  env: { HB_PROBE_BOOT_MS: process.env.HB_PROBE_BOOT_MS || null, HB_PROBE_SPAWN_MS: process.env.HB_PROBE_SPAWN_MS || null },
  subset: only ? [...only] : null, skipped: [...skip],
  prelude: { contextMs: Math.round(tCtx - t0), manifestImportMs: Math.round(tMan - tCtx) },
  totalMs: Math.round(total), passes, fails,
  threwCount: rows.filter((r) => r.threw).length,
  domains: rows,
  // present only when run by tools/orch/callsite-census.mjs against a patched copy
  callsites: typeof ctx.callsiteCounts === 'function' ? ctx.callsiteCounts() : undefined,
};
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + '\n');
console.log('pathcheck-timed: ' + passes + ' passed, ' + fails + ' failed, ' +
  result.threwCount + ' domain(s) threw, ' + (total / 1000).toFixed(1) + ' s');
process.exit(fails || result.threwCount ? 1 : 0);
