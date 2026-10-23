#!/usr/bin/env node
/* rig-boxes.mjs — where RIG is on screen in each posed turn frame (SPRINT
 * T-107: "RIG is hard to find on the Crown face at phone size — capture it at
 * your phone framing"), so a crop can be cut around him at true size.
 *
 *   node tools/simlab/framing/rig-boxes.mjs --poses <turnlab poses.json> --viewport 844x390 [--touch]
 *        [--query orbit=joint] [--only approach,after1500] [--corners 6] > boxes.json
 *
 * For each pose (tools/simlab/turnlab.mjs poses), RIG's painted silhouette
 * box — feet to RIG_BODY_VISUAL_H, +-0.65 tiles about his x, at his draw depth
 * — projected through render/camera.js syncCamera() replicated with the lens,
 * lift and orbit of src/pure/framing.js (tools/simlab/framing/veil-need.mjs
 * cameraPose). CSS px of the viewport. The posed capture is the same state
 * (tools/playtest/turn-pose-capture.mjs applies these poses), so the box lands
 * on the photographed RIG. Dev-only; zero effect on the game.              */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const query = opt('query', '');
globalThis.__HB_QUERY__ = query;
const imp = (p) => import('file://' + join(ROOT, p));
const { CONFIG } = await imp('src/config.js');
const FR = await imp('src/pure/framing.js');
const PATH = await imp('src/pure/path.js');
const ASC = await imp('src/pure/ascent.js');
const RIG = await imp('src/pure/rig.js');
await imp('src/mode.js');                         // selects the ascent profile from the query
const VEIL = await imp('tools/simlab/framing/veil-need.mjs');

const [w, h] = opt('viewport', '844x390').split('x').map(Number);
const touch = argv.includes('--touch');
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const corners = opt('corners', '') ? new Set(opt('corners', '').split(',').map(Number)) : null;
const orbit = /(^|&)orbit=joint(&|$)/.test(query) ? 'joint' : 'halt';
const parsed = JSON.parse(readFileSync(resolve(opt('poses', 'poses.json')), 'utf8'));
const lens = VEIL.lensFor(w, h, touch);
const AD = CONFIG.framing.actorDepth, STEP = 2 * CONFIG.path.turnDeg * PATH.DEG * CONFIG.path.turnSign;
const out = [];
for (const p of parsed.poses || parsed) {
  if (only && !only.has(p.label)) continue;
  if (corners && !corners.has(p.k)) continue;
  const yaw = p.cameraYawDeg * PATH.DEG;
  const done = p.corners.filter((c) => c.state === 'done').length;
  const u = (yaw - done * STEP) / STEP;
  const pose = VEIL.cameraPose({ scrollX: p.scrollX, yaw, lens, orbit, k: p.k, u });
  const pts = [];
  for (const dx of [-0.65, 0.65]) for (const dy of [0, RIG.RIG_BODY_VISUAL_H]) {
    const s = p.player.x + dx;
    const q = PATH.polyAt(PATH.SEGS, s, { x: 0, z: 0 });
    const yw = PATH.yawAt(PATH.SEGS, s, CONFIG.path.yawBlendTiles);
    const n = FR.projectNdc(pose.eye, pose.basis, lens.fovDeg, w / h,
      [q.x + Math.sin(yw) * AD, p.player.y + dy + ASC.normalAscentAltAt(s, CONFIG.levelLength), q.z + Math.cos(yw) * AD]);
    pts.push([(n.x + 1) / 2 * w, (1 - n.y) / 2 * h]);
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  out.push({ k: p.k, label: p.label, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => +v.toFixed(1)) });
}
process.stdout.write(JSON.stringify({ tool: 'tools/simlab/framing/rig-boxes.mjs', viewport: [w, h], touch, query, lens, boxes: out }, null, 1));
