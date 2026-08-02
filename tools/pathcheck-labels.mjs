#!/usr/bin/env node
// pathcheck-labels.mjs — capture the ORDERED assertion list a pathcheck run
// produces, so two trees can be proved to assert exactly the same things.
//
//   node tools/pathcheck-labels.mjs --rev main            --out /tmp/main.labels
//   node tools/pathcheck-labels.mjs --tree /path/to/tree  --out /tmp/branch.labels
//
// Why it exists (T-037): `tools/pathcheck.mjs` was split from one 9,230-line
// file into per-domain modules. A refactor of the gate that silently drops an
// assertion is invisible — the gate still prints green — so the split has to be
// proved by comparing the assertion sets, not by comparing totals.
//
// How it works, and why it is fair to both sides:
//   1. The tree under test is materialised into a scratch directory (from git
//      for --rev, by copy for --tree). Nothing in the real tree is modified.
//   2. In the scratch copy, the ONE file that defines `function ok(cond, msg)`
//      is instrumented — every call appends `PASS|FAIL <tab> message` to a log.
//      The instrumentation is the same textual patch on both sides, so it
//      cannot flatter either.
//   3. `node tools/pathcheck.mjs` runs in the scratch copy; its stdout+stderr
//      and the ordered label log are written out.
//
// The label log is stronger than a count: it carries every assertion's message
// (including the ones built from computed values, e.g. "got 4.3"), its PASS or
// FAIL status, and its ORDER. Two runs whose logs are identical asserted the
// same things about the same numbers in the same sequence.
//
// Some assertion messages embed the absolute path of the file they are about
// (the layer guards do), which would otherwise differ between two captures for
// no reason but the scratch directory's name. Both artifacts are normalised:
// the scratch root — and its /private-prefixed realpath — become `<TREE>`.
//
// Honesty / limitations:
//   * It records `ok()` calls. `near()` funnels into `ok()`, so it is covered;
//     a future helper that counts a pass WITHOUT calling `ok()` would not be.
//     The final "N passed, M failed" line is captured in the stdout artifact,
//     so a divergence of that kind still shows up there.
//   * `console.log` notes ("reported, not asserted") are not labels; they are
//     compared through the stdout artifact instead.
//   * --tree copies the working tree minus .git and node_modules, so it sees
//     uncommitted edits. --rev sees only committed, tracked files.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function parseArgs(argv) {
  const out = { rev: null, tree: null, out: null, stdout: null, keep: false, repo: repoRoot };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rev') out.rev = argv[++i];
    else if (a === '--tree') out.tree = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--stdout') out.stdout = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--keep') out.keep = true;
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else { console.error('pathcheck-labels: unknown argument ' + a); usage(); process.exit(2); }
  }
  return out;
}

function usage() {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
}

/** Files that may hold the harness's `ok()` definition, monolith or split. */
function candidateFiles(root) {
  const list = [];
  const tools = join(root, 'tools');
  if (existsSync(join(tools, 'pathcheck.mjs'))) list.push(join(tools, 'pathcheck.mjs'));
  for (const dir of ['checks', 'pathcheck']) {
    const d = join(tools, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) {
      if (f.endsWith('.mjs') || f.endsWith('.js')) list.push(join(d, f));
    }
  }
  return list;
}

const OK_SIGNATURE = /function ok\(cond, msg\) \{/;

const PREAMBLE = `
/* pathcheck-labels.mjs instrumentation (scratch copy only) */
globalThis.__hbLabels = globalThis.__hbLabels || [];
globalThis.__hbLabel = (cond, msg) => { globalThis.__hbLabels.push((cond ? 'PASS' : 'FAIL') + '\\t' + String(msg)); };
if (!globalThis.__hbLabelExitHooked) {
  globalThis.__hbLabelExitHooked = true;
  process.on('exit', () => {
    const dest = process.env.HB_LABELS_OUT;
    if (!dest) return;
    require$fsWriteFileSync(dest, globalThis.__hbLabels.join('\\n') + '\\n');
  });
}
`;

function instrument(root) {
  const hits = [];
  for (const file of candidateFiles(root)) {
    const src = readFileSync(file, 'utf8');
    if (!OK_SIGNATURE.test(src)) continue;
    hits.push(file);
    const patchedOk = src.replace(OK_SIGNATURE,
      'function ok(cond, msg) { globalThis.__hbLabel(cond, msg);');
    // The preamble goes after any shebang so node still accepts the file.
    const lines = patchedOk.split('\n');
    const at = lines[0].startsWith('#!') ? 1 : 0;
    const preamble = "import { writeFileSync as require$fsWriteFileSync } from 'node:fs';" + PREAMBLE;
    lines.splice(at, 0, preamble);
    writeFileSync(file, lines.join('\n'));
  }
  return hits;
}

function materialise(opts, dest) {
  if (opts.rev) {
    const tar = join(dest, '.tree.tar');
    execFileSync('git', ['-C', opts.repo, 'archive', '--format=tar', '-o', tar, opts.rev], { stdio: 'inherit' });
    execFileSync('tar', ['-xf', tar, '-C', dest]);
    rmSync(tar);
    return `git rev ${opts.rev} of ${opts.repo}`;
  }
  const src = resolve(opts.tree);
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      const rel = p.slice(src.length);
      return !/(^|\/)(\.git|node_modules)(\/|$)/.test(rel);
    },
  });
  return `working tree ${src}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.rev && !opts.tree) { console.error('pathcheck-labels: need --rev or --tree'); usage(); process.exit(2); }
  if (opts.rev && opts.tree) { console.error('pathcheck-labels: --rev and --tree are exclusive'); process.exit(2); }
  if (!opts.out) { console.error('pathcheck-labels: need --out <file>'); process.exit(2); }

  const scratch = mkdtempSync(join(tmpdir(), 'hb-labels-'));
  try {
    const originDesc = materialise(opts, scratch);
    const patched = instrument(scratch);
    if (patched.length !== 1) {
      console.error(`pathcheck-labels: expected exactly one file defining ok(cond, msg), found ${patched.length}` +
        (patched.length ? ': ' + patched.map((p) => p.slice(scratch.length + 1)).join(', ') : '') +
        '\nre-aim the instrumentation at the new shape of the harness — do not skip the capture');
      process.exit(1);
    }
    const labelsPath = join(scratch, '.labels.txt');
    let stdout = '', stderr = '', code = 0;
    try {
      stdout = execFileSync(process.execPath, ['tools/pathcheck.mjs'], {
        cwd: scratch, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, HB_LABELS_OUT: labelsPath },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      if (err.status === undefined) throw err;
      code = err.status; stdout = err.stdout || ''; stderr = err.stderr || '';
    }
    if (!existsSync(labelsPath)) {
      console.error('pathcheck-labels: the instrumented run produced no label log — it probably crashed');
      console.error(stderr.split('\n').slice(-20).join('\n'));
      process.exit(1);
    }
    // Normalise the scratch root out of both artifacts, or every capture would
    // differ from every other by the mkdtemp suffix alone.
    const roots = [...new Set([scratch, realpathSync(scratch)])].sort((a, b) => b.length - a.length);
    const normalise = (text) => roots.reduce((acc, r) => acc.split(r).join('<TREE>'), text);

    const labels = normalise(readFileSync(labelsPath, 'utf8'));
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(resolve(opts.out), labels);
    if (opts.stdout) {
      mkdirSync(dirname(resolve(opts.stdout)), { recursive: true });
      writeFileSync(resolve(opts.stdout), normalise(stdout + stderr));
    }
    const lines = labels.split('\n').filter(Boolean);
    const failed = lines.filter((l) => l.startsWith('FAIL')).length;
    console.log(`pathcheck-labels: ${originDesc}`);
    console.log(`  instrumented: ${patched[0].slice(scratch.length + 1)}`);
    console.log(`  exit ${code}; ${lines.length} assertions (${lines.length - failed} pass, ${failed} fail)`);
    console.log(`  tally line:   ${(stdout.trim().split('\n').filter((l) => /passed, \d+ failed/.test(l))[0] || '(none)')}`);
    console.log(`  labels -> ${resolve(opts.out)}` + (opts.stdout ? `\n  stdout -> ${resolve(opts.stdout)}` : ''));
    if (opts.keep) console.log(`  scratch kept at ${scratch}`);
  } finally {
    if (!opts.keep) rmSync(scratch, { recursive: true, force: true });
  }
}

main();
