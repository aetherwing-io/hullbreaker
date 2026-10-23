#!/usr/bin/env node
// standalone-census.mjs — T-108 scratch tool: run every standalone check once,
// time it, and record whether it passes on this tree, plus who invokes it.
//
//   node tools/orch/standalone-census.mjs --out tools/orch/evidence/standalone-census.json
//   node tools/orch/standalone-census.mjs --only tools/actor-motion-check.mjs,...
//   node tools/orch/standalone-census.mjs --list     # inventory only, run nothing
//
// "Standalone check" = tools/*-check.mjs plus the check-shaped tools that live in
// subdirectories (tools/perf/render-budget-check.mjs, tools/playtest/*-check.mjs,
// tools/vertical-assault/*.mjs, tools/assets/check.mjs, tools/gatecheck.mjs,
// tools/deploy/verify-*.mjs, tools/movement/selftest.mjs).
//
// Zero effect on the game: each check is spawned read-only from the repo root
// with the GPU-less host knobs exported; their own outputs go wherever each
// check already writes them (some write under /private/tmp — see the JSON).
// Per-check timeout defaults to 300 s (--timeout-ms). A check that needs a
// browser on this loaded host can time out; that is recorded, not hidden.

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const timeout = Number(opt('--timeout-ms')) || 300000;

const candidates = [
  ...readdirSync(join(ROOT, 'tools')).filter((f) => f.endsWith('-check.mjs')).map((f) => 'tools/' + f),
  'tools/perf/render-budget-check.mjs',
  'tools/playtest/sprite-fallback-check.mjs',
  'tools/playtest/preload-concurrency-check.mjs',
  'tools/vertical-assault/runtime-check.mjs',
  'tools/vertical-assault/runtime-sim-check.mjs',
  'tools/assets/check.mjs',
  'tools/gatecheck.mjs',
  'tools/movement/selftest.mjs',
  'tools/deploy/asset-union-selftest.mjs',
].filter((p) => existsSync(join(ROOT, p)));

// who invokes it (pathcheck domains, the merge gate, docs)
const scanFiles = [
  ...readdirSync(join(ROOT, 'tools', 'pathcheck')).map((f) => 'tools/pathcheck/' + f),
  'tools/orch/merge-task.sh', 'tools/gatecheck.mjs', 'index.html', 'src/main.js',
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f),
];
const text = Object.fromEntries(scanFiles.filter((f) => existsSync(join(ROOT, f)))
  .map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
function invokers(rel) {
  const base = rel.split('/').pop();
  const needle = base === 'check.mjs' ? 'assets/check.mjs' : base;
  const by = Object.keys(text).filter((f) => f !== rel && text[f].includes(needle));
  return {
    pathcheck: by.filter((f) => f.startsWith('tools/pathcheck/')),
    mergeGate: by.filter((f) => f.startsWith('tools/orch/')),
    docsOnly: by.filter((f) => f.startsWith('docs/')),
  };
}

function profile(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  return {
    lines: src.split('\n').length,
    readsSource: (src.match(/readFileSync\(|\bsource\(/g) || []).length,
    regexOps: (src.match(/\.test\(|\.match\(|\.includes\(/g) || []).length,
    importsSrc: (src.match(/from '\.\.\/(?:\.\.\/)?src\/|import\([^)]*src\//g) || []).length,
    browser: /playwright|withIsolatedBrowser|chromium\.launch|newPage\(/.test(src),
    header: src.split('\n').filter((l) => l.startsWith('//')).slice(0, 6).map((l) => l.slice(2).trim()).join(' '),
  };
}

const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const env = { ...process.env, HB_PROBE_BOOT_MS: process.env.HB_PROBE_BOOT_MS || '180000',
  HB_PROBE_SPAWN_MS: process.env.HB_PROBE_SPAWN_MS || '300000' };
const rows = [];
for (const rel of candidates) {
  const row = { check: rel, invokedBy: invokers(rel), ...profile(rel) };
  if (!args.includes('--list') && (!only || only.has(rel))) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [join(ROOT, rel)], {
      cwd: ROOT, encoding: 'utf8', timeout, env, maxBuffer: 64 * 1024 * 1024,
      // SIGKILL, not the default SIGTERM: in T-108's first census a timed-out
      // tools/assets/check.mjs survived its SIGTERM and kept a core busy for
      // 34 minutes as an orphan. Grandchildren (browsers) can still outlive it.
      killSignal: 'SIGKILL',
    });
    row.ms = Date.now() - t0;
    row.exit = r.status;
    row.signal = r.signal || null;
    row.timedOut = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM' || r.signal === 'SIGKILL';
    const out = ((r.stdout || '') + '\n' + (r.stderr || '')).trim().split('\n').filter(Boolean);
    row.tail = out.slice(-3).map((l) => l.slice(0, 240));
    row.okLines = (r.stdout || '').split('\n').filter((l) => /^ok\b|^ok \d/.test(l)).length;
    console.error(`[standalone] ${rel} exit=${row.exit} ${row.ms}ms ${row.timedOut ? 'TIMEOUT' : ''}`);
  }
  rows.push(row);
}
const result = { tool: 'tools/orch/standalone-census.mjs', when: new Date().toISOString(), timeoutMs: timeout, checks: rows };
if (opt('--out')) writeFileSync(resolve(opt('--out')), JSON.stringify(result, null, 2) + '\n');
console.log(`standalone-census: ${rows.length} checks, ` +
  `${rows.filter((r) => r.exit === 0).length} exit 0, ${rows.filter((r) => r.exit && r.exit !== 0).length} non-zero, ` +
  `${rows.filter((r) => r.timedOut).length} timed out`);
