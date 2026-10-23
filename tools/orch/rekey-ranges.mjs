#!/usr/bin/env node
// rekey-ranges.mjs — T-120: move tools/orch/test-audit-spec.mjs's hand LINE RANGES
// onto the lines their sites sit on now, using tools/orch/test-audit-lock.json as
// the identity map. Run after an edit shifted lines in a domain (a lane's edit, a
// deletion batch), BEFORE re-recording the lock:
//
//   node tools/orch/rekey-ranges.mjs            # dry run: print what would change
//   node tools/orch/rekey-ranges.mjs --write    # rewrite the spec's range lines
//   node tools/orch/test-census.mjs --check     # then review, then --write-lock
//
// For every range [a, b, CLASS, …] in every domain: the LOCKED sites whose old
// line lay in [a, b] (identity = domain + label, test-census.mjs SITE IDENTITY)
// are looked up at their CURRENT lines; the range becomes [min, max] of those.
// A range whose sites are all gone is removed (its line is deleted). A rekeyed
// range that would newly swallow a site that was NOT in it is left alone and
// reported — that one needs a human (a new site appeared inside a range).
//
// Zero effect on the game or the gate: it edits only the audit spec.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callSites } from './lib/callsites.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PC = join(HERE, '..', 'pathcheck');
const SPEC_FILE = join(HERE, 'test-audit-spec.mjs');
const lock = JSON.parse(readFileSync(join(HERE, 'test-audit-lock.json'), 'utf8'));
const SPEC = (await import(pathToFileURL(SPEC_FILE).href + '?t=' + Date.now())).DOMAINS;
const write = process.argv.includes('--write');
// Idempotency: ranges are rekeyed FROM the lock's coordinates, so applying the
// shift twice against one lock would move them twice. The spec carries a stamp
// naming the lock it was last rekeyed against; a second run against that same
// lock refuses. Re-recording the lock (test-census.mjs --write-lock) clears it.
const STAMP_RE = /^\/\/ rekey-ranges: ranges keyed to the lock written (\S+)$/m;
{
  const stamp = readFileSync(SPEC_FILE, 'utf8').match(STAMP_RE);
  if (stamp && stamp[1] === lock.when) {
    console.log(`rekey-ranges: the spec's ranges were already rekeyed against this lock (${lock.when}); ` +
      'run test-census.mjs --check, review, --write-lock, and only then rekey again');
    process.exit(0);
  }
}

// current (label -> line) per domain, labelled exactly as test-census.mjs does
const norm = (s) => String(s || '').replace(/\\([\\'"`])/g, '$1').replace(/\\[nt]/g, ' ').replace(/\s+/g, ' ').trim();
function currentSites(domain) {
  let src;
  try { src = readFileSync(join(PC, domain + '.mjs'), 'utf8'); } catch { return null; }
  const seen = new Map();
  return callSites(src).map((s) => {
    const label0 = norm(s.message).replace(/\$\{[^}]*\}/g, '…').slice(0, 100);
    const n = (seen.get(label0) || 0) + 1; seen.set(label0, n);
    return { label: n > 1 ? label0 + ' #' + n : label0, line: s.line };
  });
}

let text = readFileSync(SPEC_FILE, 'utf8');
const changes = [], removals = [], manual = [];
for (const [domain, spec] of Object.entries(SPEC)) {
  if (!spec.ranges?.length) continue;
  const now = currentSites(domain);
  if (!now) continue;
  const nowLine = new Map(now.map((s) => [s.label, s.line]));
  const locked = lock.sites.filter((s) => s.domain === domain);
  // a domain none of whose locked sites moved or vanished is left byte-identical
  if (locked.every((s) => nowLine.get(s.label) === s.line)) continue;
  const plans = spec.ranges.map(([a, b]) => {
    const inside = locked.filter((s) => s.line >= a && s.line <= b);
    const lines = inside.map((s) => nowLine.get(s.label)).filter((l) => l !== undefined);
    if (!lines.length) return { a, b, remove: true };
    // nothing in this range moved: keep its (possibly loose) ends as written
    if (inside.every((s) => nowLine.get(s.label) === s.line)) return { a, b, na: a, nb: b, intruders: [] };
    const na = Math.min(...lines), nb = Math.max(...lines);
    const keep = new Set(inside.map((s) => s.label));
    const intruders = now.filter((s) => s.line >= na && s.line <= nb && !keep.has(s.label));
    return { a, b, na, nb, intruders };
  });
  // the domain's block in the spec text, and its range lines in order
  const start = text.indexOf(`  '${domain}': {`);
  if (start < 0) continue;
  const end = text.indexOf('\n  },', start);
  const block = text.slice(start, end);
  const lines = block.split('\n');
  let k = 0;
  const out = [];
  for (const line of lines) {
    // a range line: `      [a, b, 'CLASS', …],` (or the one-line `ranges: [[a, b, …]],`)
    const m = line.match(/^(\s*(?:ranges: \[)?)\[(\d+), (\d+), '/);
    if (!m) { out.push(line); continue; }
    if (m[1].includes('ranges: [') && plans.length > 1) { out.push(line); manual.push(`${domain}: one-line ranges array with several ranges`); continue; }
    const p = plans[k++];
    if (!p || +m[2] !== p.a || +m[3] !== p.b) { out.push(line); manual.push(`${domain}: could not align range line ${line.trim().slice(0, 60)}`); continue; }
    if (p.remove) {
      removals.push(`${domain} [${p.a}, ${p.b}] — every site it covered is gone`);
      if (m[1].includes('ranges: [')) out.push(m[1].replace('ranges: [', 'ranges: [],').replace(/\[$/, '').trimEnd() === m[1].trimEnd() ? line : `${m[1].replace(/ranges: \[$/, 'ranges: [],')}`);
      continue;
    }
    if (p.intruders.length) {
      manual.push(`${domain} [${p.a}, ${p.b}] -> [${p.na}, ${p.nb}] would also cover: ${p.intruders.map((s) => s.line + ' "' + s.label.slice(0, 50) + '"').join('; ')}`);
      out.push(line); continue;
    }
    if (p.na !== p.a || p.nb !== p.b) changes.push(`${domain} [${p.a}, ${p.b}] -> [${p.na}, ${p.nb}]`);
    out.push(line.replace(/\[(\d+), (\d+), '/, `[${p.na}, ${p.nb}, '`));   // first [a, b, ' on the line
  }
  text = text.slice(0, start) + out.join('\n') + text.slice(end);
}
console.log(`rekey-ranges: ${changes.length} range(s) moved, ${removals.length} removed, ${manual.length} need a human`);
for (const c of changes) console.log('  moved   ' + c);
for (const r of removals) console.log('  removed ' + r);
for (const m of manual) console.log('  MANUAL  ' + m);
if (write) {
  const stampLine = `// rekey-ranges: ranges keyed to the lock written ${lock.when}`;
  text = STAMP_RE.test(text) ? text.replace(STAMP_RE, stampLine) : text.replace(/^(export const DOMAINS = \{)/m, stampLine + '\n$1');
  writeFileSync(SPEC_FILE, text);
  console.log('rekey-ranges: wrote ' + SPEC_FILE);
}
else console.log('rekey-ranges: dry run (pass --write to apply)');
