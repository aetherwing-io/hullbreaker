#!/usr/bin/env node
/* zoom-pump.mjs — the post-turn zoom pump, measured (SPRINT T-107; T-102 R3,
 * I-103): RIG's on-screen height at each corner's ritual end (`done`), 1.5 s
 * later, and settled (8 s later, the flat-face value), for the shipped
 * halt-point orbit and for ?orbit=joint.
 *
 *   node tools/simlab/framing/zoom-pump.mjs [--viewports desktop,phoneLandscapeTouch] [--json out.json]
 *
 * Each (viewport, orbit) is one fresh Node process playing the shipped run
 * through tools/simlab/lib/turn-proof.mjs (policy `run`, oracle gunner, the
 * real simulation) with the camera replica of tools/simlab/lib/sixface-host.mjs
 * — which since T-107 takes its lens, lift and orbit from src/pure/framing.js,
 * the module render/camera.js calls. RIG's height is his 1.7-tile body at the
 * actor depth projected through that camera, in CSS px of the viewport — the
 * same currency as T-102's R3 row (1280x720: 39.0 / 32.3 / 27.4 px).
 *
 * Honest limits: a replica projection, not pixels (the posed captures in the
 * T-107 report are the visual check); RIG moves during the 8 s, so `settled`
 * includes his position in the frame (the share varies ~+-4% across it).
 * Dev-only; zero effect on the game.                                      */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proofUrl = new URL('../lib/turn-proof.mjs', import.meta.url).href;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

if (argv[0] === '--child') {
  const o = JSON.parse(argv[1]);
  const { runTurnProof, VIEWPORTS } = await import(proofUrl);
  const vp = VIEWPORTS[o.viewport];
  const marks = {};
  const doneAt = {};
  await runTurnProof({ policy: 'run', viewport: vp, query: o.query, god: true, reactionMs: 350,
    onTick: (tick, H) => {
      const { M, player: p } = H;
      const px = () => {
        const a = H.camera.project(H.camera.worldOf(p.x, p.y, 1.15));
        const b = H.camera.project(H.camera.worldOf(p.x, p.y + 1.7, 1.15));
        return (b.y - a.y) / 2 * vp.height;
      };
      for (let k = 1; k <= 6; k++) {
        const c = M.WG.cornerEvents[k - 1];
        if (c.state === 'done' && doneAt[k] === undefined) { doneAt[k] = M.T.gameMs; marks[k] = { done: px() }; }
        if (doneAt[k] === undefined) continue;
        const dt = M.T.gameMs - doneAt[k];
        const m = marks[k];
        if (m.after1500 === undefined && dt >= 1500) m.after1500 = px();
        if (m.settled === undefined && dt >= 8000) m.settled = px();
        if (dt <= 8000) m.max = Math.max(m.max || 0, px());
      }
    } });
  process.stdout.write(JSON.stringify(marks));
  process.exit(0);
}

const VPS = opt('viewports', 'desktop,phoneLandscapeTouch').split(',');
const runs = [];
for (const viewport of VPS) for (const orbit of ['halt', 'joint'])
  runs.push({ viewport, orbit, query: orbit === 'joint' ? 'orbit=joint' : '' });
const results = [];
for (const r of runs) {
  const out = await new Promise((res, rej) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', JSON.stringify(r)]);
    let s = '', e = '';
    child.stdout.on('data', (d) => { s += d; });
    child.stderr.on('data', (d) => { e += d; });
    child.on('close', (code) => code === 0 ? res(JSON.parse(s)) : rej(new Error(e.slice(0, 400))));
  });
  results.push({ ...r, corners: out });
  const row = Object.entries(out).map(([k, m]) =>
    `c${k} ${m.done.toFixed(1)}/${(m.after1500 ?? NaN).toFixed(1)}/${(m.settled ?? NaN).toFixed(1)} (max ${m.max.toFixed(1)})`).join('  ');
  console.log(`${r.viewport.padEnd(20)} ${r.orbit.padEnd(5)} RIG px done/+1.5s/settled: ${row}`);
}
const json = opt('json', null);
if (json) writeFileSync(resolve(json), JSON.stringify({ tool: 'tools/simlab/framing/zoom-pump.mjs', results }, null, 1));
