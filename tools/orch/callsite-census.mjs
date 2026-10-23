#!/usr/bin/env node
// callsite-census.mjs — T-108 scratch tool: how many times does each ok()/near()
// CALL SITE evaluate in one gate run? (pathcheck's ~1,900 call sites expand to
// ~4,000 evaluations because many sit inside loops.)
//
//   node tools/orch/callsite-census.mjs --scratch <empty-dir> --out <file.json> [--skip a,b]
//
// What it does, so it cannot touch the real gate:
//   1. `git archive HEAD` of THIS worktree into <scratch>/tree (a throwaway copy);
//   2. patches ONLY the copy's tools/pathcheck/_context.mjs so ok() records the
//      file:line of the first caller frame outside _context.mjs (near() is
//      attributed to near()'s caller), and exports callsiteCounts();
//   3. runs tools/orch/pathcheck-timed.mjs --tree <scratch>/tree, which picks
//      callsiteCounts() up when the context module exports it.
// The worktree's own tools/pathcheck/ is never written.
//
// Limitations: V8 reports the line of the call expression; for a call whose
// callee and '(' sit on the line the static census (lib/callsites.mjs) found,
// the keys agree. test-census.mjs reports any runtime key with no static twin.
// --skip exists because render-submission-contract boots a real browser (5 call
// sites, each evaluated once by construction).

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(join(here, '..', '..'));
const scratch = resolve(opt('--scratch') || '');
const out = resolve(opt('--out') || 'callsite-counts.json');
if (!opt('--scratch')) { console.error('usage: --scratch <empty-dir> --out <file.json> [--skip a,b]'); process.exit(2); }

const tree = join(scratch, 'tree');
mkdirSync(tree, { recursive: true });
const tar = execFileSync('git', ['-C', repo, 'archive', 'HEAD'], { maxBuffer: 1 << 30 });
execFileSync('tar', ['-x', '-C', tree], { input: tar, maxBuffer: 1 << 30 });
const nm = join(repo, 'tools', 'playtest', 'node_modules');
if (existsSync(nm) && !existsSync(join(tree, 'tools', 'playtest', 'node_modules'))) {
  symlinkSync(nm, join(tree, 'tools', 'playtest', 'node_modules'));
}

const ctxFile = join(tree, 'tools', 'pathcheck', '_context.mjs');
let ctx = readFileSync(ctxFile, 'utf8');
const anchor = 'function ok(cond, msg) {\n';
if (ctx.split(anchor).length !== 2) {
  console.error('callsite-census: ok() definition not found exactly once in the copy — refusing to guess');
  process.exit(1);
}
const recorder = `const __HB_SITES = new Map();
function __hbCaller() {
  const lines = String(new Error().stack).split('\\n').slice(1);
  for (const l of lines) {
    if (l.includes('_context.mjs')) continue;
    const m = /pathcheck\\/([\\w.-]+\\.mjs):(\\d+):\\d+/.exec(l);
    return m ? m[1] + ':' + m[2] : l.trim();
  }
  return '?';
}
export function callsiteCounts() { return Object.fromEntries(__HB_SITES); }
`;
ctx = ctx.replace(anchor, recorder + anchor +
  '  { const k = __hbCaller(); const e = __HB_SITES.get(k) || { pass: 0, fail: 0 }; if (cond) e.pass++; else e.fail++; __HB_SITES.set(k, e); }\n');
writeFileSync(ctxFile, ctx);

const runArgs = [join(here, 'pathcheck-timed.mjs'), '--tree', tree, '--json', out, '--quiet'];
if (opt('--skip')) runArgs.push('--skip', opt('--skip'));
const r = spawnSync(process.execPath, runArgs, { stdio: 'inherit', env: process.env });
console.log('callsite-census: runner exit ' + r.status + ', counts in ' + out);
process.exit(0);
