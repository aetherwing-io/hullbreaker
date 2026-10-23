#!/usr/bin/env node
// audit-tables.mjs — T-108: print the markdown tables of
// docs/proposals/2026-10-test-audit.md from tools/orch/test-audit.json (and the
// hand spot checks in tools/orch/evidence/spot-checks.json), so every number in
// the doc is generated rather than transcribed.
//
//   node tools/orch/test-census.mjs && node tools/orch/audit-tables.mjs > /tmp/tables.md
//   node tools/orch/audit-tables.mjs --section classes|examples|domains|mutation|fastgate|standalone|cost|spotcheck
//   node tools/orch/audit-tables.mjs --section movement [--since 798888d]   # dispositions then vs now
//
// Read-only; zero effect on the game or the gate.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const A = JSON.parse(readFileSync(fileURLToPath(new URL('./test-audit.json', import.meta.url)), 'utf8'));
const SPOT_FILE = fileURLToPath(new URL('./evidence/spot-checks.json', import.meta.url));
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
const short = (site) => site.replace('tools/pathcheck/', '');

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
  p(`Resolution: ${P.resolution.site} sites classified by a label-keyed hand entry, ${P.resolution.range} by a hand line range, ${P.resolution.domainDefault} by their domain's hand default, ${P.resolution.autoSrcText} by the mechanical source-text rule.`);
  p();
  p('| disposition | call sites | evaluations/run | where it ends up |');
  p('|---|---:|---:|---|');
  const where = {
    'CORE-GATE': 'fast headless gate', 'CORE-GATE:invariant-tier': 'fast headless gate (invariant tier)',
    'SPLIT-ASSERTION': 'kept in its tier; only the pinned conjuncts go', 'DEEP': 'optional deep suite',
    'PLAY-GATE': 'real-browser PLAY gate', 'REWRITE-AS-BEHAVIOUR': 'kept until a behaviour test replaces it',
    'DELETE': 'deleted (T-120 batches)', 'DELETE-WITH-FEATURE': 'deleted with hook v1 / the zip corner (T-121)',
  };
  for (const [k, v] of Object.entries(P.dispositions).sort((a, b) => b[1] - a[1])) p(`| ${k} | ${v} | ${P.dispositionEvals[k]} | ${where[k] || ''} |`);
  p();
}

if (!section || section === 'examples') {
  p('| class | example (file:line) | what it asserts |');
  p('|---|---|---|');
  const pick = {
    'CORE': ['t-009-whole-run-crossable-driven.mjs:111', 'pathcheck-suite.mjs:606', 'damage-plane-never-leaves-geometry-behind.mjs:80', 'g1-1-render-only-proved-sim.mjs:138', 'future-facet-render-ownership.mjs:37'],
    'PURE-INVARIANT': ['t-011-juice-feedback-pass.mjs:62', 'pathcheck-suite-2.mjs:51', 't-038-seam-pips.mjs:63', 'view-scale-experiment.mjs:159'],
    'PIN': ['mod-route-visibility.mjs:14', 'pathcheck-suite.mjs:790', 'pathcheck-suite-2.mjs:245', 'crown-command-architecture.mjs:51', 'boot-registry-contract.mjs:16'],
    'RETIRED': ['pathcheck-suite-2.mjs:146', 'pathcheck-suite.mjs:994', 'snap-hook-driven-through-real-sim.mjs:207', 'pursuit-model.mjs:69'],
    'TAUTOLOGY': ['t-040-rig-sprite.mjs:110', 't-011-juice-feedback-pass.mjs:283', 'actor-motion-contract.mjs:16'],
    'SLOW-ENV': ['render-submission-contract.mjs:41', 'render-submission-contract.mjs:43'],
  };
  for (const k of CLASSES) for (const id of pick[k]) {
    const s = A.sites.find((x) => x.site === 'tools/pathcheck/' + id);
    if (!s) { p(`| ${k} | ${id} | (not found) |`); continue; }
    p(`| ${k} | \`${id}\` | ${clip(s.message, 120)}${s.note && (s.how === 'range' || s.how === 'site') ? ' — *' + clip(s.note, 140) + '*' : ''} |`);
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
  p('| target class | property mutants | gate red (killed) | named assertion red | kill rate | evasion cases (pin bypassed) | of those red | harmless refactors | refactors red (false alarms) | intended changes / fixes | of those red (obstruction) | blind defect repros | of those red |');
  p('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [k, v] of Object.entries(M.byTargetClass)) {
    p(`| ${k === 'NONE' ? '(none — blind spot)' : k} | ${v.mutants} | ${v.killed} | ${v.targetHit} | ${v.killRate ?? '-'} | ${v.evasion} | ${v.evasionRed} | ${v.refactors} | ${v.refactorRed} | ${v.changes} | ${v.changeRed} | ${v.blind} | ${v.blindRed} |`);
  }
  const k = M.kinds || {};
  p('');
  p(`Sample: ${M.rows.length} mutants — ${k.property || 0} property, ${k.evasion || 0} evasion (an existence proof, never a rate), ${k.refactor || 0} refactor, ${(k.intended || 0) + (k.fix || 0)} intended/fix, ${k.blind || 0} blind, ${k.equivalent || 0} equivalent (excluded), ${k.robustness || 0} robustness (excluded). Rows: ${(M.merged || []).length ? 'the first run, overridden per id by ' + M.merged.join(', ') : 'one run'}.`);
  p();
  p('| id | class | kind | gate | named assertion | failing domains | mutation |');
  p('|---|---|---|---|---|---|---|');
  for (const r of M.rows) {
    p(`| ${r.id} | ${r.targetClass} | ${r.kind} | ${r.hung ? '**HUNG**' : r.red ? '**RED**' : 'green'} | ${r.targetHit === null ? '-' : r.targetHit ? 'red' : 'silent'} | ${(r.failingDomains || []).join(', ') || (r.hung ? '(timeout: no domain finished)' : r.red ? '(prelude/layer guard)' : '')} | ${r.why.replace(/\|/g, '/')} |`);
  }
  p();
}

if (section === 'fastgate' && A.mutation?.fastGate) {
  const F = A.mutation.fastGate;
  p('| mutant | still caught by the proposed fast gate? | the failing assertions and where the plan puts them |');
  p('|---|---|---|');
  for (const r of F.rows) {
    const ks = r.killers.length ? r.killers.map((x) => `\`${short(x.site)}\` → ${x.disposition}`).join('; ') : '(the prelude layer guard)';
    p(`| ${r.id} | ${r.fastGate === 'kill' || r.fastGate === 'prelude' ? 'yes' : '**no** (' + r.fastGate + ')'} | ${clip(ks, 420)} |`);
  }
  p();
  p(`Rule: ${F.rule}. Red mutants the fast gate would no longer see: ${F.escapes.join(', ') || 'none'}.`);
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
  p('| run | tree | when (UTC) | load avg (1/5/15) | probe skipped? | total s | browser domain s | other 76 domains s | passed | failed |');
  p('|---|---|---|---|---|---:|---:|---:|---:|---:|');
  for (const t of A.timing) {
    const skipped = t.env && t.env.HB_GATE_SKIP_BROWSER_PROBE === '1' ? 'yes (host env)' : 'no';
    p(`| \`${t.file}\` | ${t.head || '?'} | ${t.when} | ${t.host.loadavg.join(' / ')} | ${skipped} | ${(t.totalMs / 1000).toFixed(1)} | ${t.browserDomainMs != null ? (t.browserDomainMs / 1000).toFixed(1) : '-'} | ${t.allOtherDomainsMs != null ? (t.allOtherDomainsMs / 1000).toFixed(1) : '-'} | ${t.passes} | ${t.fails} |`);
  }
  p();
  if (A.timing[0]) {
    p('| domain (run 1) | ms | share of run |');
    p('|---|---:|---:|');
    for (const d of A.timing[0].top) p(`| \`${d.domain}\` | ${d.ms} | ${pct(d.ms, A.timing[0].totalMs)} |`);
    p();
  }
}

if (section === 'spotcheck' && existsSync(SPOT_FILE)) {
  const S = JSON.parse(readFileSync(SPOT_FILE, 'utf8'));
  for (const [name, c] of [['PURE-INVARIANT by domain default', S.piDefault], ['the DELETE bucket', S.deleteBucket]]) {
    p(`**Spot check: ${name}** — ${c.pass}; pool ${c.poolSize}, seed ${c.seed}, 40 drawn: ${c.tally.A} right, ${c.tally.B} borderline, ${c.tally.D} wrong.`);
    p();
    const odd = c.sample.filter((x) => x.verdict !== 'A');
    if (odd.length) {
      p('| site | verdict | why |');
      p('|---|---|---|');
      for (const x of odd) p(`| \`${short(x.site)}\` | ${x.verdict}${x.better ? ' → ' + x.better : ''} | ${clip(x.why, 160)} |`);
      p();
    }
  }
}

if (section === 'movement') {
  // how each call site's disposition moved since an earlier committed census
  // (sites are matched by file:line, so a domain whose lines shifted between
  // the two trees shows up as "not comparable" rather than as a move)
  const i = process.argv.indexOf('--since');
  const rev = i > 0 ? process.argv[i + 1] : '798888d';
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const old = JSON.parse(execFileSync('git', ['-C', root, 'show', rev + ':tools/orch/test-audit.json'], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  const byKey = new Map(old.sites.map((s) => [s.site, s]));
  const moves = new Map();
  let same = 0, notComparable = 0;
  for (const s of A.sites) {
    const o = byKey.get(s.site);
    if (!o || (o.message || '').slice(0, 40) !== (s.message || '').slice(0, 40)) { notComparable++; continue; }
    if (o.disposition === s.disposition) { same++; continue; }
    const k = o.disposition + ' → ' + s.disposition;
    moves.set(k, (moves.get(k) || 0) + 1);
  }
  p(`| disposition at ${rev} → now | call sites |`);
  p('|---|---:|');
  for (const [k, v] of [...moves].sort((a, b) => b[1] - a[1])) p(`| ${k} | ${v} |`);
  p(`| (unchanged) | ${same} |`);
  p(`| (not comparable: the site's line moved between the trees) | ${notComparable} |`);
  p();
}

console.log(out.join('\n'));
