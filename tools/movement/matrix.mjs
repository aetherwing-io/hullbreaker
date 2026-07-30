#!/usr/bin/env node
/* matrix.mjs — run a grid of headless simrun configurations in child processes
 * and print one table. Each configuration needs its own process because
 * src/mode.js resolves the URL flags at import time (exactly as the browser
 * does), so flags cannot be changed inside one process.
 *
 *   node tools/movement/matrix.mjs                 # the default flags-off grid
 *   node tools/movement/matrix.mjs --grid evidence # the hook/flow evidence grid
 *   node tools/movement/matrix.mjs --fingerprints  # id + fingerprint only
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(here, 'simrun.mjs');

const GRIDS = {
  // Flags-off equivalence: every shipped mode, three policies. Any change to
  // these fingerprints after a flag lands is a regression, not a feature.
  baseline: {
    queries: [
      'slice=traversal',
      'slice=traversal&pace=hunt',
      'slice=traversal&pace=swarm',
      'slice=traversal&pace=surge',
      'slice=traversal&pace=surge&score=1',
      'slice=traversal&enemies=0',
      'slice=traversal&pace=surge&fallback=0',
      'slice=traversal&hound=1',
      'slice=traversal&hound=2',
      'slice=traversal&pace=surge&hound=3',
    ],
    policies: ['dash', 'roof', 'idle'],
    seconds: 16,
  },
  // The two new verbs, on and off, against the paces the operator plays.
  evidence: {
    queries: [
      'slice=traversal',
      'slice=traversal&hook=1',
      'slice=traversal&flow=1',
      'slice=traversal&hook=1&flow=1',
      'slice=traversal&pace=surge',
      'slice=traversal&pace=surge&hook=1',
      'slice=traversal&pace=surge&flow=1',
      'slice=traversal&pace=surge&hook=1&flow=1',
      'slice=traversal&hook=1&hookinput=auto',
      // the verbs against the merged houndframe trial: floor denial is the
      // thing a hook route is supposed to answer
      'slice=traversal&hound=1',
      'slice=traversal&hound=1&hook=1&flow=1',
      'slice=traversal&pace=surge&hound=3',
      'slice=traversal&pace=surge&hound=3&hook=1&flow=1',
    ],
    policies: ['dash', 'roof', 'hook-line', 'chain'],
    seconds: 16,
  },
};

const args = process.argv.slice(2);
let gridName = 'baseline', fingerprintsOnly = false, seconds = null, src = null,
  against = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--grid') gridName = args[++i];
  else if (args[i] === '--fingerprints') fingerprintsOnly = true;
  else if (args[i] === '--seconds') seconds = Number(args[++i]);
  else if (args[i] === '--src') src = args[++i];
  // --against <pristine src dir>: run the grid twice, once against this tree
  // and once against that one, and diff the fingerprints. The equivalence
  // proof: same bot, same fixture, two code trees.
  else if (args[i] === '--against') against = args[++i];
}
const grid = GRIDS[gridName];
if (!grid) throw new Error('unknown grid ' + gridName);

function runGrid(srcDir) {
  const out = [];
  for (const query of grid.queries) {
    for (const policy of grid.policies) {
      const argv = [RUNNER, '--query', query, '--policy', policy,
        '--seconds', String(seconds || grid.seconds), '--json'];
      if (srcDir) argv.push('--src', srcDir);
      out.push({ query, policy, m: JSON.parse(execFileSync(process.execPath, argv, { encoding: 'utf8' })) });
    }
  }
  return out;
}

const rows = runGrid(src);

if (against) {
  const other = runGrid(against);
  let diffs = 0;
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i], b = other[i];
    if (a.m.fingerprint !== b.m.fingerprint) {
      diffs++;
      console.log('DIFF  ' + a.query + '  ' + a.policy +
        '  this=' + a.m.fingerprint + '  other=' + b.m.fingerprint +
        '  (' + a.m.outcome + '/' + a.m.clearMs + ' vs ' +
        b.m.outcome + '/' + b.m.clearMs + ')');
    }
  }
  console.log(diffs === 0
    ? 'EQUIVALENT: ' + rows.length + ' runs, identical fingerprints vs ' + against
    : diffs + ' of ' + rows.length + ' runs diverged');
  process.exit(diffs === 0 ? 0 : 1);
}

if (fingerprintsOnly) {
  for (const r of rows) console.log(r.m.fingerprint + '  ' + r.query + '  ' + r.policy);
} else {
  const head = ['query', 'policy', 'outcome', 'clearMs', 'minMargin', 'maxY',
    'air', 'stall', 'hooks', 'links', 'flowMult', 'peakVx', 'routes', 'fp'];
  const table = rows.map((r) => [
    r.query.replace('slice=traversal', 's'), r.policy, r.m.outcome,
    r.m.clearMs === null ? '—' : String(r.m.clearMs), String(r.m.minMargin),
    String(r.m.maxY), String(r.m.airFraction), String(r.m.stallFraction),
    String(r.m.hooks), String(r.m.links || 0), String(r.m.flowPeakMult),
    String(r.m.peakVx), String(r.m.routeIds.length), r.m.fingerprint,
  ]);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of table) console.log(line(row));
}
