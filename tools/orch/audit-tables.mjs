#!/usr/bin/env node
// audit-tables.mjs — T-108: print the markdown tables of
// docs/proposals/2026-10-test-audit.md from tools/orch/test-audit.json, so every
// number in the doc is generated rather than transcribed.
//
//   node tools/orch/test-census.mjs && node tools/orch/audit-tables.mjs > /tmp/tables.md
//   node tools/orch/audit-tables.mjs --section classes|domains|mutation|standalone|cost|examples|spotcheck
//
// Read-only; zero effect on the game or the gate.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const A = JSON.parse(readFileSync(fileURLToPath(new URL('./test-audit.json', import.meta.url)), 'utf8'));
const section = (() => { const i = process.argv.indexOf('--section'); return i > 0 ? process.argv[i + 1] : null; })();
const CLASSES = ['CORE', 'PURE-INVARIANT', 'PIN', 'RETIRED', 'TAUTOLOGY', 'SLOW-ENV'];
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + '%' : '-');
const out = [];
const p = (s = '') => out.push(s);
// one table cell: no pipes, no source escapes, cut at a word boundary with an ellipsis
const clip = (s, n) => {
  const t = String(s).replace(/\\(['"`])/g, '$1').replace(/\|/g, '/');
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 20)).trimEnd() + ' …';
};
const scopeOf = (s) => (/^shipped/.test(s) ? 'shipped' : /^harness/.test(s) ? 'harness' : 'flag');

if (!section || section === 'classes') {
  const P = A.pathcheck;
  p('| class | call sites | % sites | evaluations/run | % evals | shipped sites | flag-only sites | harness sites |');
  p('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const k of CLASSES) {
    const s = A.sites.filter((x) => x.cls === k);
    const c = (sc) => s.filter((x) => scopeOf(x.scope) === sc).length;
    p(`| ${k} | ${P.byClass[k].sites} | ${pct(P.byClass[k].sites, P.callSites)} | ${P.byClass[k].evals} | ${pct(P.byClass[k].evals, P.evaluations)} | ${c('shipped')} | ${c('flag')} | ${c('harness')} |`);
  }
  p(`| **total** | **${P.callSites}** | | **${P.evaluations}** | | ${A.sites.filter((x) => scopeOf(x.scope) === 'shipped').length} | ${A.sites.filter((x) => scopeOf(x.scope) === 'flag').length} | ${A.sites.filter((x) => scopeOf(x.scope) === 'harness').length} |`);
  p();
  const srcPin = A.sites.filter((x) => x.cls === 'PIN' && x.srcText).length;
  p(`PIN detail: ${srcPin} of ${P.byClass.PIN.sites} PIN sites read source/file text; ${A.sites.filter((x) => x.core).length} PIN/TAUTOLOGY sites carry a CORE intent (REWRITE candidates).`);
  p(`Resolution: ${P.resolution.range} sites classified by a hand range, ${P.resolution.domainDefault} by their domain's hand default, ${P.resolution.autoSrcText} by the source-text rule (PIN).`);
  p();
  p('| disposition | call sites | evaluations/run |');
  p('|---|---:|---:|');
  for (const [k, v] of Object.entries(P.dispositions).sort((a, b) => b[1] - a[1])) p(`| ${k} | ${v} | ${P.dispositionEvals[k]} |`);
  p();
}

if (!section || section === 'examples') {
  p('| class | example (file:line) | what it asserts |');
  p('|---|---|---|');
  const pick = {
    'CORE': ['t-009-whole-run-crossable-driven.mjs:111', 'pathcheck-suite.mjs:606', 'damage-plane-never-leaves-geometry-behind.mjs:80', 'g1-1-render-only-proved-sim.mjs:138', 't-002-ritual-decision-trace-frame.mjs:308'],
    'PURE-INVARIANT': ['t-011-juice-feedback-pass.mjs:62', 'pathcheck-suite-2.mjs:51', 't-038-seam-pips.mjs:63', 'view-scale-experiment.mjs:159'],
    'PIN': ['mod-route-visibility.mjs:14', 'pathcheck-suite.mjs:790', 'pathcheck-suite-2.mjs:245', 'crown-command-architecture.mjs:51', 'boot-registry-contract.mjs:16'],
    'RETIRED': ['pathcheck-suite-2.mjs:146', 'pathcheck-suite.mjs:994', 'snap-hook-driven-through-real-sim.mjs:207', 'pursuit-model.mjs:69'],
    'TAUTOLOGY': ['render-submission-contract.mjs:24', 't-040-rig-sprite.mjs:110', 't-011-juice-feedback-pass.mjs:283', 'capsule-reliquary-contract.mjs:21'],
    'SLOW-ENV': ['render-submission-contract.mjs:22'],
  };
  for (const k of CLASSES) for (const id of pick[k]) {
    const s = A.sites.find((x) => x.site === 'tools/pathcheck/' + id);
    if (!s) { p(`| ${k} | ${id} | (not found) |`); continue; }
    p(`| ${k} | \`${id}\` | ${clip(s.message, 120)}${s.note && s.how === 'range' ? ' — *' + clip(s.note, 140) + '*' : ''} |`);
  }
  p();
}

if (!section || section === 'domains') {
  p('| # | domain | scope | sites | evals | CORE | P-INV | PIN | RET | TAUT | SLOW | ms (run 1) | verdict |');
  p('|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const d of A.domains) {
    const b = d.byClass;
    p(`| ${d.index} | \`${d.domain}\` | ${scopeOf(d.scope)} | ${d.sites} | ${d.evals} | ${b.CORE.sites || ''} | ${b['PURE-INVARIANT'].sites || ''} | ${b.PIN.sites || ''} | ${b.RETIRED.sites || ''} | ${b.TAUTOLOGY.sites || ''} | ${b['SLOW-ENV'].sites || ''} | ${d.wallMs[0] ?? ''} | ${d.verdict} |`);
  }
  p();
}

if ((!section || section === 'mutation') && A.mutation) {
  const M = A.mutation;
  p('| target class | property mutants | gate red (killed) | named assertion red | kill rate | harmless refactors | refactors red (false alarms) | intended changes / fixes | of those red (obstruction) | blind defect repros | of those red |');
  p('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(M.byTargetClass)) {
    p(`| ${k === 'NONE' ? '(none — blind spot)' : k} | ${v.mutants} | ${v.killed} | ${v.targetHit} | ${v.killRate ?? '-'} | ${v.refactors} | ${v.refactorRed} | ${v.changes} | ${v.changeRed} | ${v.blind} | ${v.blindRed} |`);
  }
  const k = M.kinds || {};
  p('');
  p(`Sample: ${M.rows.length} mutants — ${k.property || 0} property, ${k.refactor || 0} refactor, ${(k.intended || 0) + (k.fix || 0)} intended/fix, ${k.blind || 0} blind, ${k.equivalent || 0} equivalent (excluded), ${k.robustness || 0} robustness (excluded). Rows: ${(A.mutation.merged || []).length ? 'the first run, overridden per id by ' + A.mutation.merged.join(', ') : 'one run'}.`);
  p();
  p('| id | class | kind | gate | named assertion | failing domains | mutation |');
  p('|---|---|---|---|---|---|---|');
  for (const r of M.rows) {
    p(`| ${r.id} | ${r.targetClass} | ${r.kind} | ${r.hung ? '**HUNG**' : r.red ? '**RED**' : 'green'} | ${r.targetHit === null ? '-' : r.targetHit ? 'red' : 'silent'} | ${(r.failingDomains || []).join(', ') || (r.hung ? '(timeout: no domain finished)' : r.red ? '(prelude/layer guard)' : '')} | ${r.why.replace(/\|/g, '/')} |`);
  }
  p();
}

if ((!section || section === 'standalone') && A.standalone) {
  p('| check | run by the gate? | class | exit here | ms here | verdict |');
  p('|---|---|---|---|---:|---|');
  for (const c of A.standalone.checks) {
    const r = c.run || {};
    const exit = r.timedOut ? 'TIMEOUT' : r.exit === 0 ? '0' : r.exit == null ? '-' : '**' + r.exit + '**';
    p(`| \`${c.check}\` | ${c.gated || 'no'} | ${c.cls} | ${exit} | ${r.ms ?? ''} | ${c.verdict} |`);
  }
  p();
}

if (!section || section === 'cost') {
  p('| run | when (UTC) | load avg (1/5/15) | total s | browser domain s | other 76 domains s | passed | failed |');
  p('|---|---|---|---:|---:|---:|---:|---:|');
  for (const t of A.timing) {
    p(`| \`${t.file}\` | ${t.when} | ${t.host.loadavg.join(' / ')} | ${(t.totalMs / 1000).toFixed(1)} | ${t.browserDomainMs != null ? (t.browserDomainMs / 1000).toFixed(1) : '-'} | ${t.allOtherDomainsMs != null ? (t.allOtherDomainsMs / 1000).toFixed(1) : '-'} | ${t.passes} | ${t.fails} |`);
  }
  p();
  if (A.timing[0]) {
    p('| domain (run 1) | ms | share of run |');
    p('|---|---:|---:|');
    for (const d of A.timing[0].top) p(`| \`${d.domain}\` | ${d.ms} | ${pct(d.ms, A.timing[0].totalMs)} |`);
    p();
  }
}

if (section === 'spotcheck') {
  // A reproducible random sample (LCG, seed 7) of PURE-INVARIANT sites that got
  // their class from the DOMAIN DEFAULT rather than a hand range — the place a
  // classification error would hide. Judged by hand in the doc.
  const pool = A.sites.filter((s) => s.cls === 'PURE-INVARIANT' && s.how === 'default');
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = new Set();
  while (pick.size < Math.min(40, pool.length)) pick.add(Math.floor(rnd() * pool.length));
  p(`spot-check pool: ${pool.length} default-classified PURE-INVARIANT sites; sample of ${pick.size}`);
  for (const i of [...pick].sort((x, y) => x - y)) p(`- \`${pool[i].site.replace('tools/pathcheck/', '')}\` ${pool[i].message.slice(0, 120)}`);
}

console.log(out.join('\n'));
