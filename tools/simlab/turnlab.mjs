#!/usr/bin/env node
/* turnlab.mjs — headless corner-turn laboratory for the shipped six-face run
 * (SPRINT T-102: "the corner turns work every time").
 *
 * Every scenario runs in a FRESH Node child (the sim owns module singletons
 * and src/mode.js reads its query once), driving the real, unmodified
 * simulation through tools/simlab/lib/sixface-host.mjs with one closed-loop
 * policy from tools/simlab/lib/turn-proof.mjs.
 *
 *   node tools/simlab/turnlab.mjs run --policy run --viewport desktop
 *   node tools/simlab/turnlab.mjs matrix [--policies a,b] [--viewports a,b] [--jobs 2]
 *   node tools/simlab/turnlab.mjs list
 *
 * Options: --query '<url query>' (e.g. 'fallback=0'), --no-god (real damage
 * budget), --reaction <ms> (oracle gunner delay, default 350), --gunner
 * oracle|paced, --pace <ms> (paced gunner: one visible kill per <ms>),
 * --max-ticks <n>, --show <n> (violations printed), --json (raw).
 *
 * Dev-only. Zero effect on the shipped game. Honesty/limitations: README.md. */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proofUrl = pathToFileURL(join(here, 'lib', 'turn-proof.mjs')).href;

// The child exits on its own if its parent dies. The per-edit hook kill -9s a
// pathcheck that outlives its watchdog, and an orphaned run would otherwise
// play on to VICTORY (or its tick cap) with nobody reading the result.
export function runChild(opts) {
  const src = `
    const { runTurnProof, VIEWPORTS } = await import(${JSON.stringify(proofUrl)});
    const o = ${JSON.stringify(opts)};
    if (typeof o.viewport === 'string') o.viewport = VIEWPORTS[o.viewport];
    const parent = process.ppid;
    o.shouldAbort = () => process.ppid !== parent;
    const r = await runTurnProof(o);
    if (r.endState === 'ORPHANED') process.exit(3);
    process.stdout.write(JSON.stringify(r));
  `;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--input-type=module', '-e', src],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`${opts.policy}@${JSON.stringify(opts.viewport)}: ${stderr || err.message}`));
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('bad child output: ' + stdout.slice(0, 400))); }
      });
  });
}

export async function runMatrix(list, jobs = 2) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await runChild(list[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return out;
}

function summarize(r) {
  const corners = Object.entries(r.perCorner).map(([k, pc]) =>
    `${k}:${pc.doneAt !== null ? 'done' : pc.turnAt !== null ? 'turning' : pc.approachAt !== null ? 'approach' : pc.gateAt !== null ? 'gate' : '-'}`).join(' ');
  const counts = Object.entries(r.counts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
  const vp = typeof r.viewport === 'string' ? r.viewport : `${r.viewport.width}x${r.viewport.height}`;
  return `${r.policy.padEnd(20)} ${vp.padEnd(9)} ${r.endState.padEnd(9)} corners ${r.finishedCorners}/6 [${corners}]  violations: ${counts}`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const mode = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'run';
  const opt = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
  };
  const has = (name) => argv.includes('--' + name);
  const base = {
    query: opt('query', ''), god: !has('no-god'),
    reactionMs: +opt('reaction', '350'),
    gunnerMode: opt('gunner', 'oracle'), paceMs: +opt('pace', '1400'),
    ...(opt('max-ticks', '') ? { maxTicks: +opt('max-ticks', '') } : {}),
  };
  const { POLICIES, VIEWPORTS } = await import(proofUrl);
  if (mode === 'list') {
    console.log('policies:', POLICIES.join(', '));
    console.log('viewports:', Object.entries(VIEWPORTS).map(([k, v]) => `${k}=${v.width}x${v.height}`).join(', '));
  } else if (mode === 'run') {
    const r = await runChild({ ...base, policy: opt('policy', 'run'), viewport: opt('viewport', 'desktop') });
    if (has('json')) console.log(JSON.stringify(r, null, 1));
    else {
      console.log(summarize(r));
      for (const v of r.violations.slice(0, +opt('show', '12'))) console.log('  ', JSON.stringify(v));
    }
  } else if (mode === 'poses') {
    const vp = opt('viewport', 'desktop');
    const src = `
      const { collectPoses, VIEWPORTS } = await import(${JSON.stringify(proofUrl)});
      const poses = await collectPoses({ viewport: VIEWPORTS[${JSON.stringify(vp)}] || ${JSON.stringify(vp)},
        query: ${JSON.stringify(base.query)}, labels: ${JSON.stringify(opt('labels', '') ? opt('labels', '').split(',') : null)} || undefined });
      process.stdout.write(JSON.stringify(poses));
    `;
    const out = await new Promise((res, rej) => execFile(process.execPath, ['--input-type=module', '-e', src],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (e, so, se) => e ? rej(new Error(se || e.message)) : res(so)));
    console.log(JSON.stringify({ viewport: vp, query: base.query, poses: JSON.parse(out) }, null, 1));
  } else if (mode === 'matrix') {
    const policies = opt('policies', POLICIES.join(',')).split(',');
    const viewports = opt('viewports', Object.keys(VIEWPORTS).join(',')).split(',');
    const list = [];
    for (const policy of policies) for (const viewport of viewports)
      list.push({ ...base, policy, viewport });
    const results = await runMatrix(list, +opt('jobs', '2'));
    if (has('json')) console.log(JSON.stringify(results, null, 1));
    else for (const r of results) console.log(summarize(r));
  } else {
    console.error('unknown mode ' + mode);
    process.exit(2);
  }
}
