#!/usr/bin/env node
/* render-only.mjs — prove a flag changes the PICTURE and nothing the player
 * plays (SPRINT T-107 / T-204).
 *
 *   node tools/simlab/framing/render-only.mjs [--flags rise=steep,orbit=joint,veil=legacy]
 *        [--viewports desktop-16x10,phone-landscape] [--seeds 2] [--max-game-ms 240000]
 *        [--falsify momentum=0] [--jobs 2] [--json out.json]
 *
 * For every (policy, seed, viewport) it runs the race lab's replica of the
 * shipped run (tools/simlab/race/run-child.mjs: the real src/ simulation, one
 * fresh Node process per run, fixed 1/60 s step, seeded bot policy or the
 * oracle instrument) once with no query and once per flag, and compares a
 * SIMULATION fingerprint: the whole run summary, every per-face row, every
 * histogram, the landed-surface set and a 100 ms trace of RIG / scroll / hp /
 * lives / kills / clamp distance — with the two things that are presentation
 * by definition removed: the rendered ALT readout (pure/ascent.js, the very
 * thing ?rise= changes: faces[].altMax/altEntry/altExit and the trace's ALT
 * column) and the query label itself.
 *
 * Why not the lab's own fingerprint: run-child.mjs hashes faces[].altMax — the
 * HUD ALT the climb profile changes on purpose — so a literal "lab fingerprints
 * byte-identical" box can never hold for ?rise=. Both are reported: the lab
 * fingerprint, and the sim fingerprint that must not move.
 *
 * The falsifier: --falsify <query> (default momentum=0, a sim flag) must make
 * every compared run DIFFER, or the comparison is not binding.
 * Exit 0 only if every flag run matches its control and every falsifier run
 * differs. Dev-only; zero effect on the game.                              */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const CHILD = join(ROOT, 'tools', 'simlab', 'race', 'run-child.mjs');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const FLAGS = opt('flags', 'rise=steep,orbit=joint,veil=legacy').split(',').filter(Boolean);
const VIEWPORTS = opt('viewports', 'desktop-16x10,phone-landscape').split(',');
const SEEDS = +opt('seeds', '2');
const MAX_GAME_MS = +opt('max-game-ms', '240000');
const FALSIFY = opt('falsify', 'momentum=0');
const JOBS = +opt('jobs', '2');
const OUT = opt('json', null);

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Everything the simulation produced, minus the rendered ALT and the label.
export function simFingerprint(out) {
  const summary = { ...out.summary };
  delete summary.query; delete summary.wallMs;
  const faces = (out.faces || []).map((f) => {
    const g = { ...f };
    delete g.altMax; delete g.altEntry; delete g.altExit;
    return g;
  });
  const trace = (out.trace || []).map((row) => row.filter((_, i) => i !== 9));
  return fnv(JSON.stringify([summary, faces, out.hist || null, out.landed || null, trace]));
}

function runOne(spec) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [CHILD, JSON.stringify(spec)], { cwd: ROOT });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) return rej(new Error(`run-child failed (${code}): ${stderr.slice(0, 400)}`));
      try { res(JSON.parse(stdout)); } catch (e) { rej(new Error('bad JSON from run-child: ' + e.message)); }
    });
  });
}

async function pool(items, jobs, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const bases = [];
for (const viewport of VIEWPORTS) {
  for (let seed = 1; seed <= SEEDS; seed++)
    for (const policy of ['rush', 'climber', 'carried']) bases.push({ policy, seed, viewport });
  bases.push({ policy: 'rush', seed: 1, viewport, instrument: 'oracle', oracleLatencyMs: 0 });
}
const queries = ['', ...FLAGS, FALSIFY];
const specs = [];
for (const b of bases) for (const query of queries)
  specs.push({ ...b, query, maxGameMs: MAX_GAME_MS, traceEveryMs: 100 });

const t0 = Date.now();
const runs = await pool(specs, JOBS, async (spec) => {
  const out = await runOne(spec);
  // ALT per face (T-204's currency): gain from entry to exit, and per second
  const altRows = (out.faces || []).map((f) => ({
    face: f.face, altGain: (f.altExit !== null && f.altEntry !== null) ? +(f.altExit - f.altEntry).toFixed(3) : null,
    seconds: f.ms ? +(Object.values(f.ms).reduce((a, b) => a + b, 0) / 1000).toFixed(3) : null,
  }));
  return { spec, outcome: out.summary.outcome, gameMs: out.summary.gameMs,
    labFingerprint: out.fingerprint, simFingerprint: simFingerprint(out), altRows };
});
const key = (s) => [s.instrument ? 'oracle@' + s.oracleLatencyMs : s.policy, s.seed, s.viewport].join('|');
const byKey = new Map();
for (const r of runs) {
  const k = key(r.spec);
  if (!byKey.has(k)) byKey.set(k, {});
  byKey.get(k)[r.spec.query] = r;
}
let pass = true;
const rows = [];
for (const [k, group] of byKey) {
  const control = group[''];
  for (const q of FLAGS) {
    const r = group[q];
    const sim = r.simFingerprint === control.simFingerprint;
    if (!sim) pass = false;
    rows.push({ run: k, query: q, simIdentical: sim, labIdentical: r.labFingerprint === control.labFingerprint,
      control: control.simFingerprint, flagged: r.simFingerprint, outcome: r.outcome });
  }
  const f = group[FALSIFY];
  const differs = f.simFingerprint !== control.simFingerprint;
  if (!differs) pass = false;
  rows.push({ run: k, query: FALSIFY + ' (falsifier)', simIdentical: !differs, labIdentical: f.labFingerprint === control.labFingerprint,
    control: control.simFingerprint, flagged: f.simFingerprint, outcome: f.outcome });
}
for (const r of rows)
  console.log(`${r.run.padEnd(34)} ${r.query.padEnd(26)} sim ${r.simIdentical ? 'IDENTICAL' : 'differs  '} ` +
    `(lab fingerprint ${r.labIdentical ? 'identical' : 'differs'}) ${r.control} ${r.flagged} ${r.outcome}`);
const doc = { tool: 'tools/simlab/framing/render-only.mjs', flags: FLAGS, falsifier: FALSIFY, viewports: VIEWPORTS,
  seeds: SEEDS, maxGameMs: MAX_GAME_MS, wallMs: Date.now() - t0, pass, rows,
  alt: runs.map((r) => ({ run: key(r.spec), query: r.spec.query, outcome: r.outcome, gameMs: r.gameMs, faces: r.altRows })) };
if (OUT) writeFileSync(resolve(OUT), JSON.stringify(doc, null, 1));
console.log(pass
  ? `render-only: every flag run reproduces its control's simulation (${rows.length} comparisons); the falsifier moved every run`
  : 'render-only: FAILED — see rows');
process.exit(pass ? 0 : 1);
