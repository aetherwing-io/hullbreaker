#!/usr/bin/env node
/* graph.mjs — the T-121 cleanup inventory: what the shipped game can reach.
 *
 *   node tools/cleanup/graph.mjs                 # human summary
 *   node tools/cleanup/graph.mjs --json out.json # full machine-readable inventory
 *   node tools/cleanup/graph.mjs --dead          # exports nothing in src/ imports
 *
 * Walks src/main.js's static and dynamic import graph (acorn AST, not regex),
 * then for every module and export reports who imports it: reachable src
 * modules, tools (by import statement), or nobody. It also classifies every
 * tracked file under assets/ by who names it (src/index.html, tools, other
 * asset text such as provenance, docs/reports/artifacts, or nothing) — by
 * BASENAME, which is how every src asset table names its files.
 *
 * What it cannot see (read tools/cleanup/README.md): runtime URL fetches are
 * found by name, not executed — boot-probe.mjs's request ledger is the
 * runtime truth; a flag-gated branch inside a reachable module counts as
 * reachable; identifier counts ignore scope, so an export "used internally"
 * may be shadowed (the error is always toward keeping code).
 *
 * Needs acorn + acorn-walk (dev-only): `npm install` in tools/cleanup, or
 * HB_ACORN_DIR=<a node_modules dir that has them>. Zero effect on the game. */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (p) => relative(ROOT, p);

function loadAcorn() {
  const dirs = [process.env.HB_ACORN_DIR, join(ROOT, 'tools/cleanup/node_modules'),
    '/opt/node-tools/node_modules'].filter(Boolean);
  for (const d of dirs) {
    try {
      const req = createRequire(join(d, 'noop.js'));
      return { acorn: req('acorn'), walk: req('acorn-walk') };
    } catch { /* next */ }
  }
  console.error('graph.mjs needs acorn + acorn-walk: cd tools/cleanup && npm install (or set HB_ACORN_DIR)');
  process.exit(2);
}
const { acorn, walk } = loadAcorn();

const argv = process.argv.slice(2);
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;

function listFiles(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, pred, out); else if (pred(p)) out.push(p);
  }
  return out;
}

function ids(pattern, out) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) ids(p.value ?? p.argument, out);
  else if (pattern.type === 'ArrayPattern') for (const e of pattern.elements) ids(e, out);
  else if (pattern.type === 'RestElement') ids(pattern.argument, out);
  else if (pattern.type === 'AssignmentPattern') ids(pattern.left, out);
}

function parseModule(file) {
  const code = readFileSync(file, 'utf8');
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true });
  const imports = [], exports = [], counts = new Map();
  const name = (n) => n.name ?? n.value;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      imports.push({ source: node.source.value, kind: node.specifiers.length ? 'static' : 'side-effect',
        names: node.specifiers.map((s) => s.type === 'ImportSpecifier' ? name(s.imported)
          : s.type === 'ImportDefaultSpecifier' ? 'default' : '*') });
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        imports.push({ source: node.source.value, kind: 'reexport', names: node.specifiers.map((s) => name(s.local)) });
        for (const s of node.specifiers) exports.push({ name: name(s.exported), local: null, line: node.loc.start.line, lines: 1 });
      } else if (node.declaration) {
        const d = node.declaration;
        const span = d.loc.end.line - d.loc.start.line + 1;
        if (d.type === 'VariableDeclaration') {
          for (const dec of d.declarations) {
            const list = []; ids(dec.id, list);
            for (const n of list) exports.push({ name: n, local: n, line: dec.loc.start.line, lines: dec.loc.end.line - dec.loc.start.line + 1 });
          }
        } else exports.push({ name: d.id.name, local: d.id.name, line: d.loc.start.line, lines: span });
      } else {
        for (const s of node.specifiers) exports.push({ name: name(s.exported), local: s.local.name, line: node.loc.start.line, lines: 1 });
      }
    } else if (node.type === 'ExportAllDeclaration') {
      imports.push({ source: node.source.value, kind: 'reexport', names: ['*'] });
    } else if (node.type === 'ExportDefaultDeclaration') {
      exports.push({ name: 'default', local: null, line: node.loc.start.line, lines: 1 });
    }
  }
  const dynamicUnresolved = [];
  walk.full(ast, (n) => {
    if (n.type === 'Identifier') counts.set(n.name, (counts.get(n.name) || 0) + 1);
    if (n.type === 'ImportExpression') {
      if (n.source.type === 'Literal') imports.push({ source: n.source.value, kind: 'dynamic', names: ['*'] });
      else dynamicUnresolved.push(n.loc.start.line);
    }
  });
  return { file, code, imports, exports, counts, dynamicUnresolved, lines: (code.match(/\n/g) || []).length, bytes: Buffer.byteLength(code) };
}

const resolveSpec = (from, spec) => {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;          // bare: three, three/addons/*
  const p = resolve(dirname(from), spec);
  return existsSync(p) ? p : null;
};

const srcFiles = listFiles(join(ROOT, 'src'), (p) => /\.m?js$/.test(p));
const mods = new Map(srcFiles.map((f) => [f, parseModule(f)]));

// reachability from the one module script index.html loads
const entry = join(ROOT, 'src/main.js');
const reach = new Map();
const queue = [[entry, 'static']];
while (queue.length) {
  const [f, how] = queue.shift();
  const prev = reach.get(f);
  if (prev === 'static' || prev === how) continue;
  reach.set(f, how);
  for (const imp of mods.get(f)?.imports || []) {
    const t = resolveSpec(f, imp.source);
    if (t) queue.push([t, how === 'dynamic' || imp.kind === 'dynamic' ? 'dynamic' : 'static']);
  }
}

// who imports what (src), and which tools import src modules
const importedBy = new Map();
for (const [f, m] of mods) for (const imp of m.imports) {
  const t = resolveSpec(f, imp.source);
  if (!t) continue;
  const byName = importedBy.get(t) || new Map();
  importedBy.set(t, byName);
  for (const n of imp.names.length ? imp.names : ['*side-effect*']) {
    const list = byName.get(n) || [];
    list.push({ from: rel(f), reachable: reach.has(f) });
    byName.set(n, list);
  }
}
const toolFiles = listFiles(join(ROOT, 'tools'), (p) => /\.m?js$/.test(p));
const toolUse = new Map();                       // src file -> Map(name -> Set(tool))
const IMPORT_RE = /import\s*(?:\{([^}]*)\}\s*from\s*|\(\s*)?['"`]([^'"`]*\bsrc\/[^'"`]+\.js)['"`]/g;
for (const t of toolFiles) {
  const code = readFileSync(t, 'utf8');
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[2];
    const target = spec.startsWith('.') && existsSync(resolve(dirname(t), spec))
      ? resolve(dirname(t), spec) : join(ROOT, spec.slice(spec.indexOf('src/')));
    const byName = toolUse.get(target) || new Map();
    toolUse.set(target, byName);
    const names = m[1] ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : ['*'];
    for (const n of names) { const s = byName.get(n) || new Set(); s.add(rel(t)); byName.set(n, s); }
  }
}

const modules = [];
for (const [f, m] of mods) {
  const ib = importedBy.get(f) || new Map();
  const tu = toolUse.get(f) || new Map();
  modules.push({
    file: rel(f), lines: m.lines, bytes: m.bytes, reach: reach.get(f) || 'unreachable',
    dynamicUnresolved: m.dynamicUnresolved,
    exports: m.exports.map((e) => {
      const users = (ib.get(e.name) || []).filter((u) => u.reachable).map((u) => u.from);
      const tools = [...new Set([...(tu.get(e.name) || []), ...(tu.get('*') || [])])];
      const internal = e.local ? (m.counts.get(e.local) || 0) - 1 : 0;
      return { name: e.name, line: e.line, lines: e.lines, srcUsers: users, internalRefs: internal, toolUsers: tools,
        status: users.length ? 'used' : internal > 0 ? 'internal-only' : tools.length ? 'tools-only' : 'dead' };
    }),
    toolImporters: [...new Set([...tu.values()].flatMap((s) => [...s]))],
  });
}

// assets: classify by who names each tracked file
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
const isText = (f) => /\.(js|mjs|json|md|html|css|sh|py|txt|yml|svg)$/.test(f);
const groups = { src: (f) => f.startsWith('src/') || f === 'index.html', tools: (f) => f.startsWith('tools/'),
  assetText: (f) => f.startsWith('assets/'), docs: (f) => /^(docs|reports|artifacts|\.claude)\/|^[A-Z]+\.md$/.test(f) };
const corpus = Object.fromEntries(Object.keys(groups).map((g) => [g,
  tracked.filter((f) => groups[g](f) && isText(f)).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')])]));
const PRUNE = /\/(?:review[^/]*|source[^/]*|[^/]*-sources)\//;
const assets = tracked.filter((f) => f.startsWith('assets/')).map((f) => {
  const b = basename(f);
  const hits = Object.fromEntries(Object.entries(corpus).map(([g, files]) =>
    [g, files.filter(([p, t]) => p !== f && t.includes(b)).map(([p]) => p)]));
  const cls = hits.src.length ? 'runtime-named' : hits.tools.length ? 'tools-only'
    : hits.assetText.length ? 'provenance-only' : hits.docs.length ? 'docs-only' : 'unreferenced';
  return { file: f, bytes: statSync(join(ROOT, f)).size, cls, hits,
    bundled: f === 'assets/ui/favicon.svg' || (f.startsWith('assets/generated/') && !PRUNE.test(f.slice('assets/generated'.length))) };
});

const sum = (rows, k = 'bytes') => rows.reduce((a, r) => a + r[k], 0);
const mib = (b) => (b / 1048576).toFixed(2) + ' MiB';
const out = { root: ROOT, modules, assets };
if (jsonOut) { await import('node:fs').then((fs) => fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1))); }

if (argv.includes('--dead')) {
  for (const m of modules) for (const e of m.exports)
    if (e.status !== 'used') console.log(`${e.status.padEnd(13)} ${(m.file + ':' + e.line).padEnd(48)} ${e.name} (${e.lines} lines)${e.toolUsers.length ? ' tools: ' + e.toolUsers.join(' ') : ''}`);
} else {
  const byReach = {};
  for (const m of modules) (byReach[m.reach] ||= []).push(m);
  console.log(`src modules: ${modules.length}, ${sum(modules, 'lines')} lines, ${sum(modules)} bytes`);
  for (const [k, list] of Object.entries(byReach))
    console.log(`  ${k.padEnd(12)} ${String(list.length).padStart(4)} modules ${String(sum(list, 'lines')).padStart(6)} lines` +
      (k === 'static' ? '' : '  ' + list.map((m) => m.file).join(' ')));
  const status = {};
  for (const m of modules) for (const e of m.exports) status[e.status] = (status[e.status] || 0) + 1;
  console.log(`exports: ${Object.entries(status).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const cls = {};
  for (const a of assets) { const c = (cls[a.cls] ||= { n: 0, b: 0, bundledN: 0, bundledB: 0 }); c.n++; c.b += a.bytes; if (a.bundled) { c.bundledN++; c.bundledB += a.bytes; } }
  console.log(`assets: ${assets.length} tracked files, ${mib(sum(assets))}`);
  for (const [k, c] of Object.entries(cls))
    console.log(`  ${k.padEnd(16)} ${String(c.n).padStart(4)} files ${mib(c.b).padStart(11)}   (in deploy bundle: ${c.bundledN} files, ${mib(c.bundledB)})`);
}
