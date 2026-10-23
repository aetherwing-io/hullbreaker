#!/usr/bin/env node
/* route-ahead.mjs — how much route a player sees ahead of RIG, per framing,
 * on the same seeds (SPRINT T-107: "measured route-ahead in phone landscape is
 * no worse than FAR's on the same seed").
 *
 *   node tools/simlab/framing/route-ahead.mjs [--root <tree>] [--viewports a,b]
 *        [--seeds 4] [--max-game-ms 300000] [--jobs 2] [--json out.json]
 *
 * Runs the race lab's replica (<root>/tools/simlab/race/run-child.mjs — the
 * TREE's OWN copy, so --root <an export of main> measures main) for
 * rush/climber/fighter/carried x seeds plus the oracle@0 racer, and pools the
 * lab's per-frame histograms:
 *   lookahead  = EDGE_R - RIG's front: route ahead to the sim's right clamp
 *   routeAhead = the same, capped at the next joint (the route that exists)
 *   visible    = lookahead + (visible route edge - EDGE_R): since T-107
 *                EDGE_R is the actor-plane clamp, a little inside the frame's
 *                visible route edge (edges.mjs routeRight); before T-107 the
 *                two were the same line, so the offset is 0 on such a tree.
 * Integer-tile bins (the lab floors each frame's value); p10/median/p90 of
 * every frame of every run in the group. Without T-201's follow-lead the
 * scroll pins a racer at the clamp, so a racer's look-ahead is mostly the
 * clamp margin whatever the frame — the follow-lead (T-201) owns look-ahead.
 * Dev-only; zero effect on the game.                                      */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', join(here, '..', '..', '..')));
const VPS = opt('viewports', 'desktop-16x10,phone-landscape').split(',');
const SEEDS = +opt('seeds', '4');
const MAX = +opt('max-game-ms', '300000');
const JOBS = +opt('jobs', '2');
const { VIEWPORTS, viewportEdges } = await import('file://' + join(ROOT, 'tools', 'simlab', 'race', 'edges.mjs'));

function child(spec) {
  return new Promise((res, rej) => {
    const c = spawn(process.execPath, [join(ROOT, 'tools', 'simlab', 'race', 'run-child.mjs'), JSON.stringify(spec)], { cwd: ROOT });
    let s = '', e = '';
    c.stdout.on('data', (d) => { s += d; });
    c.stderr.on('data', (d) => { e += d; });
    c.on('close', (code) => code === 0 ? res(JSON.parse(s)) : rej(new Error(e.slice(0, 300))));
  });
}
const specs = [];
for (const viewport of VPS) {
  for (const policy of ['rush', 'climber', 'fighter', 'carried'])
    for (let seed = 1; seed <= SEEDS; seed++) specs.push({ group: policy, policy, seed, viewport, maxGameMs: MAX });
  for (let seed = 1; seed <= 2; seed++)
    specs.push({ group: 'oracle@0', policy: 'rush', seed, viewport, instrument: 'oracle', oracleLatencyMs: 0, maxGameMs: MAX });
}
const out = new Array(specs.length);
let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (next < specs.length) { const i = next++; const { group, ...spec } = specs[i]; out[i] = { group, spec, run: await child(spec) }; }
}));
const pct = (bins, q) => {
  const total = bins.reduce((a, [, n]) => a + n, 0);
  let acc = 0;
  for (const [b, n] of bins) { acc += n; if (acc >= q * total) return b; }
  return null;
};
const pool = (list, key) => {
  const m = new Map();
  for (const r of list) for (const [b, n] of r.run.hist[key]) m.set(b, (m.get(b) || 0) + n);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};
const rows = [];
for (const viewport of VPS) {
  const v = VIEWPORTS[viewport];
  const e = viewportEdges(v.width, v.height, undefined, v.rigFraction);
  const offset = e.routeRight !== undefined ? e.routeRight - e.right : 0;
  for (const group of ['rush', 'climber', 'fighter', 'carried', 'oracle@0']) {
    const list = out.filter((r) => r.spec.viewport === viewport && r.group === group);
    const la = pool(list, 'lookahead'), ra = pool(list, 'routeAhead');
    rows.push({ viewport, group, runs: list.length, visibleOffset: +offset.toFixed(2),
      lookahead: [pct(la, 0.1), pct(la, 0.5), pct(la, 0.9)],
      routeAhead: [pct(ra, 0.1), pct(ra, 0.5), pct(ra, 0.9)],
      visible: [pct(la, 0.1), pct(la, 0.5), pct(la, 0.9)].map((x) => x === null ? null : +(x + offset).toFixed(1)),
      outcomes: list.map((r) => r.run.summary.outcome) });
  }
}
for (const r of rows)
  console.log(`${r.viewport.padEnd(22)} ${r.group.padEnd(9)} n=${r.runs}  lookahead p10/med/p90 ${r.lookahead.join('/')}  ` +
    `routeAhead ${r.routeAhead.join('/')}  visible ${r.visible.join('/')} (offset ${r.visibleOffset})`);
const json = opt('json', null);
if (json) writeFileSync(resolve(json), JSON.stringify({ tool: 'tools/simlab/framing/route-ahead.mjs', root: ROOT, seeds: SEEDS, maxGameMs: MAX, rows }, null, 1));
