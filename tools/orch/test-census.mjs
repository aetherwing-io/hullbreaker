#!/usr/bin/env node
// test-census.mjs — T-108: build tools/orch/test-audit.json, the machine-readable
// copy of docs/proposals/2026-10-test-audit.md.
//
//   node tools/orch/test-census.mjs                 # writes tools/orch/test-audit.json
//   node tools/orch/test-census.mjs --print         # + a summary on stdout
//   node tools/orch/test-census.mjs --check         # exit 1 when `problems` is not empty
//   node tools/orch/test-census.mjs --write-lock    # re-record tools/orch/test-audit-lock.json
//
// Inputs (all committed under tools/orch/):
//   test-audit-spec.mjs                 the HAND classification (rubric in its header)
//   test-audit-lock.json                every site's identity and verdict at the last
//                                       reviewed classification (see SITE IDENTITY)
//   lib/callsites.mjs, lib/features.mjs the mechanical call-site census
//   evidence/callsite-counts.json       per-call-site evaluation counts from one gate
//                                       run (tools/orch/callsite-census.mjs)
//   evidence/timing-full-run-*.json     instrumented full runs (tools/orch/pathcheck-timed.mjs)
//   evidence/standalone-census.json     every standalone check run once
//   standalone-spec.mjs                 hand classification of standalone checks,
//                                       selftest, deploy verifier, capture scripts
//   evidence/mutation-results.json      the binding mutation sample (mutation-sample.mjs)
//
// CLASS RESOLUTION for one call site, first match wins:
//   1. a label-keyed hand entry (SITES in the spec)           how = 'site'
//   2. the NARROWEST hand line range containing its start line how = 'range'
//   3. its condition reads file text -> PIN (mechanical)       how = 'auto-srcText'
//   4. the domain's hand default                              how = 'default'
// Every mechanical decision is counted in `resolution`; T-108's review pass
// left none (all 110 that the rule once decided are hand entries now).
//
// SITE IDENTITY. A site is (domain, label): its static message text with
// interpolations shown as …, whitespace collapsed, first 100 characters, plus
// #n when a domain repeats a label. file:line is only where it sits today —
// lanes editing a domain shift lines, and a line range would then silently
// reclassify its neighbours. So every list in test-audit.json carries the label,
// and test-audit-lock.json records each site's label, line, class and
// disposition at the last reviewed base. A census that finds a site whose
// verdict changed while its label did not (a range drifted, or the spec was
// edited), a locked site that is gone, or a site the lock has never seen,
// reports it in `problems`; `--check` turns any problem into exit 1. A clean
// `--check` is the precondition of every deletion batch (proposal §7.6); after a
// deliberate reclassification, review the diff and re-record with --write-lock.
//
// Zero effect on the game or the gate: reads files, writes JSON.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callSites } from './lib/callsites.mjs';
import { fileTextVars, features } from './lib/features.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PC = join(ROOT, 'tools', 'pathcheck');
const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const SPEC_MOD = await import(pathToFileURL(join(HERE, 'test-audit-spec.mjs')).href);
const SPEC = SPEC_MOD.DOMAINS;
const SITE_ENTRIES = SPEC_MOD.SITES || [];
const STANDALONE_SPEC = existsSync(join(HERE, 'standalone-spec.mjs'))
  ? (await import(pathToFileURL(join(HERE, 'standalone-spec.mjs')).href)) : null;
const LOCK_FILE = join(HERE, 'test-audit-lock.json');
const lock = readJSON(LOCK_FILE);

const CLASSES = ['CORE', 'PURE-INVARIANT', 'PIN', 'RETIRED', 'TAUTOLOGY', 'SLOW-ENV'];
const counts = readJSON(join(HERE, 'evidence', 'callsite-counts.json'))?.callsites || {};
const timingRuns = readdirSync(join(HERE, 'evidence')).filter((f) => /^timing-full-run-\d+\.json$/.test(f)).sort()
  .map((f) => ({ file: 'tools/orch/evidence/' + f, ...readJSON(join(HERE, 'evidence', f)) }));
const standalone = readJSON(join(HERE, 'evidence', 'standalone-census.json'));
const mutations = readJSON(join(HERE, 'evidence', 'mutation-results.json'));
// labels come from source literals: undo their escapes so they compare with
// the evaluated FAIL text, then collapse whitespace
const norm = (s) => String(s || '').replace(/\\([\\'"`])/g, '$1').replace(/\\[nt]/g, ' ').replace(/\s+/g, ' ').trim();
let head = null;
try { head = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git tree */ }

// manifest order
const manifestSrc = readFileSync(join(PC, 'manifest.mjs'), 'utf8');
const importOf = new Map([...manifestSrc.matchAll(/import \* as (d\d+) from '\.\/([\w.-]+)\.mjs'/g)].map((m) => [m[1], m[2]]));
const order = [...manifestSrc.slice(manifestSrc.indexOf('DOMAINS')).matchAll(/^\s*(d\d+),/gm)].map((m) => importOf.get(m[1]));

const problems = [];
const sites = [];
const domains = [];
const siteEntryHits = new Map(SITE_ENTRIES.map((e, i) => [i, 0]));
for (const [index, file] of order.entries()) {
  const spec = SPEC[file];
  if (!spec) { problems.push('no spec for domain ' + file); continue; }
  const src = readFileSync(join(PC, file + '.mjs'), 'utf8');
  const ctx = fileTextVars(src);
  const found = callSites(src);
  const entries = SITE_ENTRIES.map((e, i) => ({ ...e, i })).filter((e) => e.domain === file);
  const seenLabel = new Map();
  const rows = [];
  for (const s of found) {
    const ft = features(s, ctx);
    // template-literal interpolations read as … too, like concatenated ones
    const label0 = norm(s.message).replace(/\$\{[^}]*\}/g, '…').slice(0, 100);
    const n = (seenLabel.get(label0) || 0) + 1;
    seenLabel.set(label0, n);
    const label = n > 1 ? label0 + ' #' + n : label0;
    const byLabel = entries.filter((e) => norm(label).startsWith(norm(e.label)) && (e.nth == null || e.nth === n));
    const covering = (spec.ranges || []).filter(([a, b]) => s.line >= a && s.line <= b)
      .sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
    let cls, note, how, marks = [];
    if (byLabel.length) {
      const e = byLabel[0];
      for (const x of byLabel) siteEntryHits.set(x.i, siteEntryHits.get(x.i) + 1);
      if (byLabel.length > 1) problems.push(`${file}:${s.line} matched ${byLabel.length} label entries`);
      ({ cls, note } = e); marks = e.marks || []; how = 'site';
    } else if (covering.length) { [, , cls, note, marks = []] = covering[0]; how = 'range'; }
    else if (ft.srcText) { cls = 'PIN'; note = 'condition reads source/file text'; how = 'auto-srcText'; }
    else { cls = spec.default; note = spec.note ? '(domain default)' : ''; how = 'default'; }
    if (!CLASSES.includes(cls)) problems.push(`${file}:${s.line} unknown class ${cls}`);
    const c = counts[file + '.mjs:' + s.line];
    const evals = c ? c.pass + c.fail : (file === 'render-submission-contract' ? 1 : 0);
    const row = {
      site: `tools/pathcheck/${file}.mjs:${s.line}`, line: s.line, label, fn: s.fn, cls, how, marks,
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
for (const [i, hits] of siteEntryHits) {
  if (hits !== 1) problems.push(`SITES entry ${SITE_ENTRIES[i].domain} "${SITE_ENTRIES[i].label.slice(0, 60)}" matched ${hits} call sites (want 1)`);
}

// totals
const total = Object.fromEntries(CLASSES.map((k) => [k, { sites: 0, evals: 0 }]));
for (const s of sites) { total[s.cls].sites++; total[s.cls].evals += s.evals; }
const shipped = (s) => /^shipped/.test(s.scope);
const coreShipped = sites.filter((s) => s.cls === 'CORE' && shipped(s));
const resolution = {
  site: sites.filter((s) => s.how === 'site').length,
  range: sites.filter((s) => s.how === 'range').length,
  autoSrcText: sites.filter((s) => s.how === 'auto-srcText').length,
  domainDefault: sites.filter((s) => s.how === 'default').length,
  srcTextButNotPin: sites.filter((s) => s.srcText && s.cls !== 'PIN').length,
  pinButNotSrcText: sites.filter((s) => !s.srcText && s.cls === 'PIN').length,
};

// keep / split / rewrite / delete (assertion level)
const disposition = (s) => {
  if (s.marks.includes('with:T-121')) return 'DELETE-WITH-FEATURE';   // entry 25: goes with the code (T-121)
  if (s.cls === 'SLOW-ENV') return 'PLAY-GATE';
  if (s.marks.includes('split')) return 'SPLIT-ASSERTION';              // keep the property, drop its pinned conjuncts
  if ((s.cls === 'PIN' || s.cls === 'TAUTOLOGY') && s.core) return 'REWRITE-AS-BEHAVIOUR';
  if (s.cls === 'PIN' || s.cls === 'TAUTOLOGY' || s.cls === 'RETIRED') return 'DELETE';
  if (s.cls === 'CORE') return shipped(s) ? 'CORE-GATE' : 'DEEP';
  return shipped(s) ? 'CORE-GATE:invariant-tier' : 'DEEP';               // PURE-INVARIANT
};
// where the check lives once the plan has run: the fast headless gate, the deep
// suites, the PLAY gate, replaced by a behaviour test, or gone.
const tierOf = (s) => {
  switch (s.disposition) {
    case 'CORE-GATE': case 'CORE-GATE:invariant-tier': return 'fast';
    case 'SPLIT-ASSERTION': return shipped(s) ? 'fast' : 'deep';
    case 'DEEP': return 'deep';
    case 'PLAY-GATE': return 'play';
    case 'REWRITE-AS-BEHAVIOUR': return 'replaced';
    default: return 'gone';
  }
};
const dispositions = {};
for (const s of sites) { s.disposition = disposition(s); s.tier = tierOf(s); dispositions[s.disposition] = (dispositions[s.disposition] || 0) + 1; }
const dispositionEvals = {};
for (const s of sites) dispositionEvals[s.disposition] = (dispositionEvals[s.disposition] || 0) + s.evals;

// A domain verdict says where the domain LIVES; it must not contradict the
// per-site dispositions (PIN/RETIRED/TAUTOLOGY lines inside a kept domain are
// still deleted site by site). DELETE = nothing kept (lines are deleted,
// replaced first, or go with their feature); CORE-GATE = nothing deep;
// DEEP = nothing in the fast gate; REWRITE = nothing kept headless; SPLIT = anything.
for (const d of domains) {
  const ts = sites.filter((s) => s.domain === d.domain).map((s) => s.tier);
  const bad = d.verdict === 'DELETE' ? ts.filter((x) => x === 'fast' || x === 'deep' || x === 'play')
    : d.verdict === 'CORE-GATE' ? ts.filter((x) => x === 'deep')
    : d.verdict === 'DEEP' ? ts.filter((x) => x === 'fast')
    : d.verdict === 'REWRITE' ? ts.filter((x) => x === 'fast' || x === 'deep')
    : [];
  if (bad.length) problems.push(`${d.domain}: verdict ${d.verdict} but ${bad.length} site(s) kept in tier ${[...new Set(bad)].join('/')}`);
}

// SITE IDENTITY: compare against the lock (see header)
const keyOf = (s) => s.domain + '::' + s.label;
let lockReport = null;
if (lock && !process.argv.includes('--write-lock')) {
  const locked = new Map(lock.sites.map((x) => [x.key, x]));
  const now = new Map(sites.map((s) => [keyOf(s), s]));
  let moved = 0;
  for (const [k, s] of now) {
    const l = locked.get(k);
    if (!l) { problems.push(`unlocked site (new, or its label changed): ${s.site} "${s.label.slice(0, 70)}" — classify it, then --write-lock`); continue; }
    if (l.line !== s.line) moved++;
    if (l.cls !== s.cls || l.disposition !== s.disposition) {
      problems.push(`verdict drift: ${s.domain} "${s.label.slice(0, 60)}" line ${l.line}->${s.line}: ${l.cls}/${l.disposition} -> ${s.cls}/${s.disposition} (a range drifted or the spec changed; review, then --write-lock)`);
    }
  }
  for (const [k, l] of locked) if (!now.has(k)) problems.push(`locked site gone: ${l.domain}:${l.line} "${l.label.slice(0, 70)}"`);
  lockReport = { lock: 'tools/orch/test-audit-lock.json', base: lock.base, sites: lock.sites.length, moved };
}
if (process.argv.includes('--write-lock')) {
  writeFileSync(LOCK_FILE, JSON.stringify({
    tool: 'tools/orch/test-census.mjs --write-lock', base: head, when: new Date().toISOString(),
    note: 'identity of every pathcheck call site at the last reviewed classification; see test-census.mjs header',
    sites: sites.map((s) => ({ key: keyOf(s), domain: s.domain, line: s.line, label: s.label, cls: s.cls, disposition: s.disposition })),
  }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  lockReport = { lock: 'tools/orch/test-audit-lock.json', base: head, sites: sites.length, moved: 0, rewritten: true };
}

// mutation kill rates by class, and what the PROPOSED fast gate would still see
let mutationSummary = null;
if (mutations?.mutants?.length) {
  // property -> kill rate; evasion -> a property mutant built to sit outside the
  // pin's regex (an existence proof, not a rate); refactor -> false alarms;
  // intended/fix -> obstruction; blind -> did any gate see an entry-20 defect;
  // equivalent / robustness -> excluded from rates.
  const by = {};
  const ran = mutations.mutants.filter((m) => !m.error);
  for (const m of ran) {
    const k = m.targetClass;
    by[k] = by[k] || { mutants: 0, killed: 0, targetHit: 0, survived: 0, evasion: 0, evasionRed: 0,
      refactors: 0, refactorRed: 0, changes: 0, changeRed: 0, blind: 0, blindRed: 0, equivalent: 0 };
    const b = by[k];
    if (m.kind === 'property') { b.mutants++; if (m.red) b.killed++; else b.survived++; if (m.targetHit) b.targetHit++; }
    else if (m.kind === 'evasion') { b.evasion++; if (m.red) b.evasionRed++; }
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
  // A FAIL line is "<domain>: <evaluated message>". It belongs to the site in
  // that domain whose static fragments (split at …) all occur in it, in order.
  const fragsOf = (label) => label.replace(/ #\d+$/, '').split('…').map((f) => f.trim()).filter((f) => f.length >= 4);
  const matchesSite = (msg, s) => {
    const fr = fragsOf(s.label);
    if (!fr.length) return false;
    let at = 0;
    for (const f of fr) { const i = msg.indexOf(f, at); if (i < 0) return false; at = i + f.length; }
    return true;
  };
  const killersOf = (m) => {
    const ks = [];
    for (const line of m.failLines || []) {
      const cut = line.indexOf(': ');
      const dom = line.slice(0, cut), msg = norm(line.slice(cut + 2));
      const cand = sites.filter((s) => s.domain === dom && matchesSite(msg, s));
      for (const s of cand) if (!ks.includes(s)) ks.push(s);
    }
    return ks;
  };
  const fastRows = [];
  for (const m of ran) {
    if (!m.red || m.hung || !['property', 'evasion'].includes(m.kind)) continue;
    const ks = killersOf(m);
    const prelude = (m.failLines || []).length === 0;      // the layer guard exits before any domain
    const tiers = new Set(ks.map((s) => s.tier));
    const verdict = prelude ? 'prelude'
      : tiers.has('fast') ? 'kill'
      : tiers.has('replaced') ? 'only-by-a-rewrite'   // the replacement must catch it before the pin goes
      : tiers.has('play') ? 'only-in-play'
      : tiers.has('deep') ? 'only-in-deep'               // a flag-only property: the deep suite keeps it
      : 'escape';                                         // every killer is deleted: nothing would see it
    fastRows.push({ id: m.id, targetClass: m.targetClass, fastGate: verdict,
      unmatchedFailLines: prelude ? 0 : (m.failLines || []).filter((l) => {
        const cut = l.indexOf(': '); return !sites.some((s) => s.domain === l.slice(0, cut) && matchesSite(norm(l.slice(cut + 2)), s));
      }).length,
      killers: ks.map((s) => ({ site: s.site, label: s.label.slice(0, 90), disposition: s.disposition, tier: s.tier })) });
  }
  mutationSummary = { tool: mutations.tool, when: mutations.when, base: mutations.base, merged: mutations.merged || null,
    byTargetClass: by, kinds, applyErrors: mutations.mutants.filter((m) => m.error).map((m) => m.id),
    fastGate: {
      rule: 'a red property/evasion mutant is still caught by the proposed fast gate when one of its failing assertions is disposed CORE-GATE, invariant tier or a shipped SPLIT-ASSERTION, or the prelude layer guard catches it',
      rows: fastRows,
      escapes: fastRows.filter((r) => r.fastGate !== 'kill' && r.fastGate !== 'prelude').map((r) => r.id),
      lost: fastRows.filter((r) => r.fastGate === 'escape').map((r) => r.id),   // seen by nothing once the plan has run
    },
    rows: ran.map((m) => ({ id: m.id, targetClass: m.targetClass, kind: m.kind, red: m.red, hung: !!m.hung,
      targetHit: m.targetHit, failCount: m.failCount, failingDomains: m.failingDomains, site: m.site, why: m.why })) };
}

const timing = timingRuns.map((r) => ({
  file: r.file, when: r.when, host: r.host, totalMs: r.totalMs, passes: r.passes, fails: r.fails,
  env: r.env || null, head: r.head || null,
  browserDomainMs: r.domains?.find((d) => d.file === 'render-submission-contract')?.ms ?? null,
  allOtherDomainsMs: r.domains?.filter((d) => d.file !== 'render-submission-contract').reduce((n, d) => n + d.ms, 0) ?? null,
  top: [...(r.domains || [])].sort((a, b) => b.ms - a.ms).slice(0, 10).map((d) => ({ domain: d.file, ms: d.ms })),
}));

const keyed = (x) => ({ file: x.site.replace(/:\d+$/, ''), label: x.label, line: x.line, cls: x.cls, note: x.note });
const out = {
  tool: 'tools/orch/test-census.mjs', task: 'T-108', when: new Date().toISOString(), tree: head,
  rubric: 'tools/orch/test-audit-spec.mjs (header); docs/proposals/2026-10-test-audit.md § Classes',
  pathcheck: {
    domains: domains.length, callSites: sites.length, evaluations: sites.reduce((n, s) => n + s.evals, 0),
    byClass: total, coreShippedSites: coreShipped.length,
    coreShippedEvals: coreShipped.reduce((n, s) => n + s.evals, 0),
    resolution, dispositions, dispositionEvals,
    tiers: Object.fromEntries(['fast', 'deep', 'play', 'replaced', 'gone'].map((t) => [t, sites.filter((s) => s.tier === t).length])),
    identity: lockReport,
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
  // the keep / move / split / rewrite / delete lists, keyed by (file, label) —
  // `line` is where the site sits on `tree` only; reasons are per site below
  lists: {
    coreGate: sites.filter((x) => x.disposition === 'CORE-GATE').map(keyed),
    invariantTier: sites.filter((x) => x.disposition === 'CORE-GATE:invariant-tier').map(keyed),
    splitAssertion: sites.filter((x) => x.disposition === 'SPLIT-ASSERTION').map(keyed),
    deep: sites.filter((x) => x.disposition === 'DEEP').map(keyed),
    playGate: sites.filter((x) => x.disposition === 'PLAY-GATE').map(keyed),
    rewriteAsBehaviour: sites.filter((x) => x.disposition === 'REWRITE-AS-BEHAVIOUR').map(keyed),
    delete: sites.filter((x) => x.disposition === 'DELETE').map(keyed),
    deleteWithFeature: sites.filter((x) => x.disposition === 'DELETE-WITH-FEATURE').map(keyed),
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
  console.log('tiers', out.pathcheck.tiers, 'identity', lockReport);
  if (mutationSummary) {
    console.log('mutation', JSON.stringify(mutationSummary.byTargetClass));
    console.log('fast-gate escapes', mutationSummary.fastGate.escapes);
  }
}
if (problems.length) console.log('PROBLEMS (' + problems.length + ')\n  ' + problems.slice(0, 60).join('\n  '));
if (process.argv.includes('--check') && problems.length) process.exit(1);
