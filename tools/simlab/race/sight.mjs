#!/usr/bin/env node
/* sight.mjs — on the frames where a racer sees nothing ahead, WHY?
 *
 *   node tools/simlab/race/sight.mjs --preset racer
 *   node tools/simlab/race/sight.mjs '{"policy":"rush","seed":1,"viewport":"desktop-16x10","instrument":"oracle","oracleLatencyMs":0}'
 *
 * Table M7 in docs/proposals/2026-10-race-to-the-top.md reports the
 * distribution of ROUTE ahead of RIG (front to the right screen edge, clipped
 * at the active corner's bend). Nearly half of a racer's moving frames show
 * under 3 tiles, and the distribution alone cannot say which of three
 * different things is happening. This splits the climb frames (the corner is
 * `idle`: no gate, no joint ritual) on sides 1..faces into:
 *
 *   - `at the closed joint`  RIG's front is within 2.5 tiles of the bend: the
 *                            joint is shut until the scroll reaches HALT_S, so
 *                            route ahead is zero BY CONSTRUCTION (proposal
 *                            §4.2's "arm on arrival");
 *   - `pinned at the clamp`  RIG's front is at the right screen edge: route
 *                            ahead is the 0.4-tile edge margin — the racer is
 *                            running blind into the frame boundary (§4.2's
 *                            lead term);
 *   - `free`                 everything else: the quantiles here are what the
 *                            player actually gets to read while climbing.
 *
 * One fresh child process per run (run-child.mjs), like lab.mjs: the sim
 * modules are singletons and a second in-process run is not a fresh run.
 * Zero effect on the shipped game. Honesty notes: tools/simlab/README.md. */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, viewportEdges } from './edges.mjs';

const CHILD = join(dirname(fileURLToPath(import.meta.url)), 'run-child.mjs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
globalThis.__HB_QUERY__ = '';
const { CONFIG } = await import('file://' + join(ROOT, 'src', 'config.js'));
const { BEND_S } = await import('file://' + join(ROOT, 'src', 'pure', 'path.js'));

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const EVERY_MS = Number(opt('every-ms', '100'));
const JOINT_TILES = Number(opt('joint-tiles', '2.5'));
const PRESETS = {
  // the three runs the proposal's §2.7 quotes
  racer: [
    { policy: 'rush', seed: 1, viewport: 'desktop-16x10', instrument: 'oracle', oracleLatencyMs: 0 },
    { policy: 'rush', seed: 1, viewport: 'phone-landscape-6pct', instrument: 'oracle', oracleLatencyMs: 0 },
    { policy: 'rush', seed: 1, viewport: 'desktop-16x10' },
  ],
};

function runChild(cfg) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [CHILD, JSON.stringify(cfg)]);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error('run-child failed: ' + err));
      try { res(JSON.parse(out)); } catch (e) { rej(new Error('bad child JSON: ' + e.message)); }
    });
  });
}

const quantile = (values, p) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
};

const json = argv.find((a) => a.trim().startsWith('{'));
const preset = opt('preset', null);
const configs = json ? [JSON.parse(json)] : PRESETS[preset || 'racer'];
if (!configs) throw new Error(`sight.mjs: unknown preset ${preset} (have ${Object.keys(PRESETS).join(', ')})`);

for (const cfg of configs) {
  const vp = VIEWPORTS[cfg.viewport] || VIEWPORTS['desktop-16x10'];
  const edges = viewportEdges(vp.width, vp.height, CONFIG, vp.rigFraction);
  const run = await runChild({ maxGameMs: 600000, ...cfg, traceEveryMs: EVERY_MS });
  let climb = 0, atJoint = 0, atClamp = 0;
  const free = [];
  for (const [, x, , scrollX, seg, face] of run.trace) {
    if (seg !== 'moving' || face > CONFIG.path.faces) continue;   // climb frames on a real side
    const bend = BEND_S[face - 1], front = x + 0.35, rightEdge = scrollX + edges.right;
    climb++;
    if (front >= bend - JOINT_TILES) { atJoint++; continue; }
    if (front >= rightEdge - 0.6) { atClamp++; continue; }
    free.push(Math.min(rightEdge, bend) - front);
  }
  const id = `${cfg.instrument ? 'oracle@' + cfg.oracleLatencyMs : cfg.policy}|${cfg.viewport}|${cfg.seed}`;
  const pc = (n) => `${Math.round((100 * n) / climb)}%`;
  console.log(`${id.padEnd(40)} fp ${run.fingerprint}  climb frames ${String(climb).padStart(4)}  ` +
    `at the closed joint ${pc(atJoint).padStart(4)}  pinned at the clamp ${pc(atClamp).padStart(4)}  ` +
    `free ${pc(free.length).padStart(4)} (route ahead p10/median/p90 ` +
    `${[0.1, 0.5, 0.9].map((p) => quantile(free, p).toFixed(0)).join(' / ')} tiles)`);
}
