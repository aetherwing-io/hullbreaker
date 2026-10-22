#!/usr/bin/env node
// test-census.mjs — T-108: build tools/orch/test-audit.json, the machine-readable
// copy of docs/proposals/2026-10-test-audit.md.
//
//   node tools/orch/test-census.mjs                 # writes tools/orch/test-audit.json
//   node tools/orch/test-census.mjs --print         # + a summary on stdout
//
// Inputs (all committed under tools/orch/):
//   test-audit-spec.mjs                 the HAND classification (rubric in its header)
//   lib/callsites.mjs, lib/features.mjs the mechanical call-site census
//   evidence/callsite-counts.json       per-call-site evaluation counts from one gate
//                                       run (tools/orch/callsite-census.mjs)
//   evidence/timing-full-run-*.json     instrumented full runs (tools/orch/pathcheck-timed.mjs)
//   evidence/standalone-census.json     every standalone check run once
//   standalone-spec.mjs                 hand classification of standalone checks,
//                                       selftest, deploy verifier, capture scripts
//   evidence/mutation-results.json      the binding mutation sample (mutation-sample.mjs)
//
// Class resolution for one call site: the NARROWEST spec range containing its
// start line wins; with no range, a site whose condition reads file text is PIN
// (auto, reported as such); otherwise the domain default. Every auto decision is
// counted in `resolution` so the hand/auto split is visible.
//
// Zero effect on the game or the gate: reads files, writes one JSON.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callSites } from './lib/callsites.mjs';
import { fileTextVars, features } from './lib/features.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PC = join(ROOT, 'tools', 'pathcheck');
const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const { DOMAINS: SPEC } = await import(pathToFileURL(join(HERE, 'test-audit-spec.mjs')).href);
const STANDALONE_SPEC = existsSync(join(HERE, 'standalone-spec.mjs'))
  ? (await import(pathToFileURL(join(HERE, 'standalone-spec.mjs')).href)) : null;

const CLASSES = ['CORE', 'PURE-INVARIANT', 'PIN', 'RETIRED', 'TAUTOLOGY', 'SLOW-ENV'];
const counts = readJSON(join(HERE, 'evidence', 'callsite-counts.json'))?.callsites || {};
const timingRuns = readdirSync(join(HERE, 'evidence')).filter((f) => /^timing-full-run-\d+\.json$/.test(f)).sort()
  .map((f) => ({ file: 'tools/orch/evidence/' + f, ...readJSON(join(HERE, 'evidence', f)) }));
const standalone = readJSON(join(HERE, 'evidence', 'standalone-census.json'));
const mutations = readJSON(join(HERE, 'evidence', 'mutation-results.json'));

// manifest order
const manifestSrc = readFileSync(join(PC, 'manifest.mjs'), 'utf8');
const importOf = new Map([...manifestSrc.matchAll(/import \* as (d\d+) from '\.\/([\w.-]+)\.mjs'/g)].map((m) => [m[1], m[2]]));
const order = [...manifestSrc.slice(manifestSrc.indexOf('DOMAINS')).matchAll(/^\s*(d\d+),/gm)].map((m) => importOf.get(m[1]));

const problems = [];
const sites = [];
const domains = [];
for (const [index, file] of order.entries()) {
  const spec = SPEC[file];
  if (!spec) { problems.push('no spec for domain ' + file); continue; }
  const src = readFileSync(join(PC, file + '.mjs'), 'utf8');
  const ctx = fileTextVars(src);
  const found = callSites(src);
  const rows = [];
  for (const s of found) {
    const ft = features(s, ctx);
    const covering = (spec.ranges || []).filter(([a, b]) => s.line >= a && s.line <= b)
      .sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
    let cls, note, how, marks = [];
    if (covering.length) { [, , cls, note, marks = []] = covering[0]; how = 'range'; }
    else if (ft.srcText) { cls = 'PIN'; note = 'condition reads source/file text'; how = 'auto-srcText'; }
    else { cls = spec.default; note = spec.note ? '(domain default)' : ''; how = 'default'; }
    if (!CLASSES.includes(cls)) problems.push(`${file}:${s.line} unknown class ${cls}`);
    const c = counts[file + '.mjs:' + s.line];
    const evals = c ? c.pass + c.fail : (file === 'render-submission-contract' ? 1 : 0);
    const row = {
      site: `tools/pathcheck/${file}.mjs:${s.line}`, fn: s.fn, cls, how, marks,
      core: marks.includes('core'), srcText: ft.srcText, evals,
      message: (s.message || '').slice(0, 220), note,
    };
    rows.push(row);
    const scopeMark = marks.find((m) => m.startsWith('scope:'));
    sites.push({ domain: file, scope: scopeMark ? scopeMark.slice(6) : spec.scope, ...row });
  }
  // a hand range that covers no call site is a mis-typed line number — say so
  for (const [a, b, cls] of spec.ranges || []) {
    if (!found.some((s) => s.line >= a && s.line <= b)) problems.push(`${file}: range ${a}-${b} (${cls}) covers no call site`);
  }
  const byClass = Object.fromEntries(CLASSES.map((k) => [k, { sites: 0, evals: 0 }]));
  for (const r of rows) { byClass[r.cls].sites++; byClass[r.cls].evals += r.evals; }
  const t = timingRuns.map((run) => run.domains?.find((d) => d.file === file)?.ms ?? null);
  domains.push({
    index, domain: file, file: `tools/pathcheck/${file}.mjs`, lines: src.split('\n').length,
    scope: spec.scope, mechanism: spec.mechanism, verdict: spec.verdict, note: spec.note,
    sites: rows.length, evals: rows.reduce((n, r) => n + r.evals, 0),
    srcTextSites: rows.filter((r) => r.srcText).length,
    byClass, wallMs: t,
  });
}
for (const k of Object.keys(SPEC)) if (!order.includes(k)) problems.push('spec names a domain not in the manifest: ' + k);

// totals
const total = Object.fromEntries(CLASSES.map((k) => [k, { sites: 0, evals: 0 }]));
for (const s of sites) { total[s.cls].sites++; total[s.cls].evals += s.evals; }
const shipped = (s) => /^shipped/.test(s.scope);
const coreShipped = sites.filter((s) => s.cls === 'CORE' && shipped(s));
const resolution = {
  range: sites.filter((s) => s.how === 'range').length,
  autoSrcText: sites.filter((s) => s.how === 'auto-srcText').length,
  domainDefault: sites.filter((s) => s.how === 'default').length,
  srcTextButNotPin: sites.filter((s) => s.srcText && s.cls !== 'PIN').length,
  pinButNotSrcText: sites.filter((s) => !s.srcText && s.cls === 'PIN').length,
};

// keep / rewrite / delete lists (assertion level)
const disposition = (s) => {
  if (s.cls === 'SLOW-ENV') return 'PLAY-GATE';
  if ((s.cls === 'PIN' || s.cls === 'TAUTOLOGY') && s.core) return 'REWRITE-AS-BEHAVIOUR';
  if (s.cls === 'PIN' || s.cls === 'TAUTOLOGY' || s.cls === 'RETIRED') return 'DELETE';
  if (s.cls === 'CORE') return shipped(s) ? 'CORE-GATE' : 'DEEP';
  return shipped(s) ? 'CORE-GATE:invariant-tier' : 'DEEP';   // PURE-INVARIANT
};
const dispositions = {};
for (const s of sites) { s.disposition = disposition(s); dispositions[s.disposition] = (dispositions[s.disposition] || 0) + 1; }
const dispositionEvals = {};
for (const s of sites) dispositionEvals[s.disposition] = (dispositionEvals[s.disposition] || 0) + s.evals;

// A domain verdict says where the domain LIVES; it must not contradict the
// per-site dispositions (PIN/RETIRED/TAUTOLOGY lines inside a kept domain are
// still deleted site by site). DELETE = nothing kept; CORE-GATE = nothing
// deep; DEEP = nothing in the CORE gate; SPLIT = anything.
const KEPT_CORE = new Set(['CORE-GATE', 'CORE-GATE:invariant-tier']);
for (const d of domains) {
  const ds = sites.filter((s) => s.domain === d.domain).map((s) => s.disposition);
  const bad = d.verdict === 'DELETE' ? ds.filter((x) => x !== 'DELETE' && x !== 'REWRITE-AS-BEHAVIOUR')
    : d.verdict === 'CORE-GATE' ? ds.filter((x) => x === 'DEEP')
    : d.verdict === 'DEEP' ? ds.filter((x) => KEPT_CORE.has(x))
    : [];
  if (bad.length) problems.push(`${d.domain}: verdict ${d.verdict} but ${bad.length} site(s) disposed ${[...new Set(bad)].join('/')}`);
}

// mutation kill rates by class
let mutationSummary = null;
if (mutations?.mutants?.length) {
  // property mutants -> kill rate; refactor -> false alarms; intended/fix ->
  // obstruction; blind -> did any gate see an entry-20 defect; equivalent -> excluded.
  const by = {};
  const ran = mutations.mutants.filter((m) => !m.error);
  for (const m of ran) {
    const k = m.targetClass;
    by[k] = by[k] || { mutants: 0, killed: 0, targetHit: 0, survived: 0, refactors: 0, refactorRed: 0,
      changes: 0, changeRed: 0, blind: 0, blindRed: 0, equivalent: 0 };
    const b = by[k];
    if (m.kind === 'property') { b.mutants++; if (m.red) b.killed++; else b.survived++; if (m.targetHit) b.targetHit++; }
    else if (m.kind === 'refactor') { b.refactors++; if (m.red) b.refactorRed++; }
    else if (m.kind === 'intended' || m.kind === 'fix') { b.changes++; if (m.red) b.changeRed++; }
    else if (m.kind === 'blind') { b.blind++; if (m.red) b.blindRed++; }
    else if (m.kind === 'equivalent') b.equivalent++;
  }
  for (const v of Object.values(by)) {
    v.killRate = v.mutants ? +(v.killed / v.mutants).toFixed(2) : null;
    v.targetHitRate = v.mutants ? +(v.targetHit / v.mutants).toFixed(2) : null;
  }
  const kinds = {};
  for (const m of ran) kinds[m.kind] = (kinds[m.kind] || 0) + 1;
  mutationSummary = { tool: mutations.tool, when: mutations.when, base: mutations.base, merged: mutations.merged || null,
    byTargetClass: by, kinds, applyErrors: mutations.mutants.filter((m) => m.error).map((m) => m.id),
    rows: ran.map((m) => ({ id: m.id, targetClass: m.targetClass, kind: m.kind, red: m.red, hung: !!m.hung,
      targetHit: m.targetHit, failCount: m.failCount, failingDomains: m.failingDomains, site: m.site, why: m.why })) };
}

const timing = timingRuns.map((r) => ({
  file: r.file, when: r.when, host: r.host, totalMs: r.totalMs, passes: r.passes, fails: r.fails,
  browserDomainMs: r.domains?.find((d) => d.file === 'render-submission-contract')?.ms ?? null,
  allOtherDomainsMs: r.domains?.filter((d) => d.file !== 'render-submission-contract').reduce((n, d) => n + d.ms, 0) ?? null,
  top: [...(r.domains || [])].sort((a, b) => b.ms - a.ms).slice(0, 10).map((d) => ({ domain: d.file, ms: d.ms })),
}));

const out = {
  tool: 'tools/orch/test-census.mjs', task: 'T-108', when: new Date().toISOString(),
  rubric: 'tools/orch/test-audit-spec.mjs (header); docs/proposals/2026-10-test-audit.md § Classes',
  pathcheck: {
    domains: domains.length, callSites: sites.length, evaluations: sites.reduce((n, s) => n + s.evals, 0),
    byClass: total, coreShippedSites: coreShipped.length,
    coreShippedEvals: coreShipped.reduce((n, s) => n + s.evals, 0),
    resolution, dispositions, dispositionEvals,
    prelude: {
      layerGuards: 'tools/pathcheck/_context.mjs guardLayer(pure) + guardLayer(sim): process.exit(1) on a banned identifier or an upward import — CORE (layer purity), not ok() call sites',
      manifestGuard: 'tools/pathcheck.mjs refuses to run with an unlisted domain module — CORE for the gate itself',
    },
  },
  domains, timing, standalone: STANDALONE_SPEC ? {
    census: standalone ? 'tools/orch/evidence/standalone-census.json' : null,
    checks: STANDALONE_SPEC.STANDALONE.map((c) => ({ ...c, run: standalone?.checks?.find((r) => r.check === c.check) ? (({ ms, exit, timedOut, tail }) => ({ ms, exit, timedOut, tail }))(standalone.checks.find((r) => r.check === c.check)) : null })),
    other: STANDALONE_SPEC.OTHER,
    playtestFiles: readdirSync(join(ROOT, 'tools', 'playtest')).filter((f) => f.endsWith('.mjs')).sort().map((f) => ({
      file: 'tools/playtest/' + f,
      ...(STANDALONE_SPEC.PLAYTEST_FILES?.[f] || { cls: 'SLOW-ENV', what: 'capture/evidence tool for operator judgement' }),
    })),
  } : null,
  mutation: mutationSummary,
  // the keep / move / rewrite / delete lists, compact (reasons are per site below)
  lists: {
    coreGate: sites.filter((x) => x.disposition === 'CORE-GATE').map((x) => x.site),
    invariantTier: sites.filter((x) => x.disposition === 'CORE-GATE:invariant-tier').map((x) => x.site),
    deep: sites.filter((x) => x.disposition === 'DEEP').map((x) => x.site),
    playGate: sites.filter((x) => x.disposition === 'PLAY-GATE').map((x) => x.site),
    rewriteAsBehaviour: sites.filter((x) => x.disposition === 'REWRITE-AS-BEHAVIOUR').map((x) => ({ site: x.site, cls: x.cls, note: x.note })),
    delete: sites.filter((x) => x.disposition === 'DELETE').map((x) => ({ site: x.site, cls: x.cls, note: x.note })),
    deleteWholeDomains: domains.filter((d) => d.verdict === 'DELETE').map((d) => d.file),
    deleteStandalone: STANDALONE_SPEC ? STANDALONE_SPEC.STANDALONE.filter((c) => /^DELETE/.test(c.verdict)).map((c) => ({ check: c.check, why: c.what, verdict: c.verdict })) : [],
  },
  problems,
  sites,
};
writeFileSync(join(HERE, 'test-audit.json'), JSON.stringify(out, null, 1) + '\n');
if (process.argv.includes('--print')) {
  console.log('domains', domains.length, 'call sites', sites.length, 'evaluations', out.pathcheck.evaluations);
  for (const k of CLASSES) console.log('  ' + k.padEnd(15), String(total[k].sites).padStart(5), 'sites', String(total[k].evals).padStart(6), 'evals');
  console.log('CORE∩shipped', coreShipped.length, 'sites', out.pathcheck.coreShippedEvals, 'evals');
  console.log('resolution', resolution);
  console.log('dispositions (sites)', dispositions);
  console.log('dispositions (evals)', dispositionEvals);
  if (mutationSummary) console.log('mutation', JSON.stringify(mutationSummary.byTargetClass));
  if (problems.length) console.log('PROBLEMS', problems);
}
