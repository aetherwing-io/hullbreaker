#!/usr/bin/env node
/* corner-approach.mjs — the last seconds of every corner approach, played
 * (T-107 for I-122: "flat clear-colour edge strips for the last ~2.5 s of each
 * approach under the follow-lead"; and the right clamp near corners).
 *
 *   node tools/simlab/framing/corner-approach.mjs --viewport desktop|phoneLandscapeTouch|... \
 *        [--query 'momentum=0'] [--offsets 2500,1500,500] [--policy run] \
 *        [--poses-out poses.json] [--json stats.json] [--root <tree>]
 *
 * Plays the shipped six-face run headlessly (tools/simlab/lib/turn-proof.mjs:
 * the real sim modules, T-201's follow-lead and rolling corners included, the
 * T-102 camera replica with this tree's lens) and
 *
 *   poses  — for every corner, the exact state `offsets` ms BEFORE its turn
 *            starts (label `pre<ms>`; scroll, RIG, corner states, camera yaw),
 *            in the format tools/playtest/turn-pose-capture.mjs applies, so
 *            the frames the follow-lead actually shows on the approach can be
 *            photographed and measured (tools/simlab/framing/void_columns.py);
 *   clamp  — from 40 tiles before each bend, through the approach and the
 *            turn, to 4 s after the turn completes: RIG's
 *            rightmost DRAWN point projected through the replica camera: his
 *            x plus the silhouette ceiling (CONFIG.framing.actorHalfExtent,
 *            times render/player.js's portrait gain) at deck, chest and head
 *            height, on the plane he is drawn on. Max NDC per corner, and the
 *            share of those ticks past the frame edge (NDC > 1); and the same
 *            over every tick of the run (`whole`).
 *
 * Honest limits: the replica camera, not the page (the posed captures are
 * the page); one deterministic run per viewport and query; the silhouette
 * ceiling is the widest any frame may draw, not the frame shown that tick.
 * Dev-only; zero effect on the game.                                       */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
// --root <tree>: play THAT tree's sim and camera replica (e.g. an export of
// main, for the before frames). Its config must carry CONFIG.framing or the
// silhouette falls back to pure/rig.js's documented overrun ceiling.
const ROOT = resolve(opt('root', join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')));
const vpName = opt('viewport', 'desktop');
const query = opt('query', '');
const policy = opt('policy', 'run');
const offsets = opt('offsets', '2500,1500,500').split(',').map(Number).sort((a, b) => b - a);
const imp = (p) => import('file://' + join(ROOT, p));
const { runTurnProof, VIEWPORTS } = await imp('tools/simlab/lib/turn-proof.mjs');
const { CONFIG } = await imp('src/config.js');
const { portraitActorVisualGain } = await imp('src/pure/traversal.js');
const RIG = await imp('src/pure/rig.js');
const viewport = VIEWPORTS[vpName];
if (!viewport) throw new Error(`unknown viewport preset ${vpName}: ${Object.keys(VIEWPORTS).join(', ')}`);

const gain = portraitActorVisualGain(viewport.width / viewport.height);
const halfExtent = CONFIG.framing ? CONFIG.framing.actorHalfExtent : RIG.RIG_SPRITE_MAX_OVERRUN * RIG.BODY_HALF_WIDTH;
const actorDepth = CONFIG.framing ? CONFIG.framing.actorDepth : 1.15;
const reach = Math.max(halfExtent * gain, RIG.RIG_GUN_MUZZLE_X);
const heights = [0.1, 0.85 * gain, RIG.RIG_BODY_VISUAL_H * gain];
const keep = Math.ceil((offsets[0] + 600) / (1000 / 60));      // ring of recent ticks

const ring = [];
const poses = [];
const whole = { ticks: 0, past: 0, maxNdc: -Infinity, at: null };   // every tick of the run
const seen = {};
const clamp = {};
for (let k = 1; k <= 6; k++) clamp[k] = { ticks: 0, past: 0, maxNdc: -Infinity, at: null, turnAtMs: null, doneAtMs: null };

const r = await runTurnProof({ viewport, query, policy, god: true, reactionMs: 350, onTick: (tick, H) => {
  const { M, player: p } = H;
  const t = M.T.gameMs;
  ring.push({
    scrollX: M.T.scrollX, gameMs: t,
    player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, facing: p.facing },
    corners: M.WG.cornerEvents.map((c) => ({ k: c.k, state: c.state, sealed: c.sealed })),
    cameraYawDeg: H.camera.yaw() / M.PATH.DEG, cameraFacet: H.camera.facet(),
  });
  if (ring.length > keep) ring.shift();
  for (let k = 1; k <= 6; k++) {
    const c = M.WG.cornerEvents[k - 1];
    const cs = clamp[k];
    if (c.state === 'turning' && cs.turnAtMs === null) cs.turnAtMs = c.tStart;
    if (c.state === 'done' && cs.doneAtMs === null) cs.doneAtMs = t;
    if (c.state === 'turning' && !seen[k]) {
      seen[k] = true;
      for (const off of offsets) {
        let best = null;
        for (const s of ring) if (s.gameMs <= c.tStart - off) best = s;
        if (best) poses.push({ k, label: `pre${off}`, tMs: null, ...best });
      }
    }
  }
  // RIG's rightmost drawn point this tick
  let mAll = -Infinity;
  for (const dy of heights) {
    const n = H.camera.project(H.camera.worldOf(p.x + reach, p.y + dy, actorDepth));
    if (!n.behind) mAll = Math.max(mAll, n.x);
  }
  whole.ticks++;
  if (mAll > 1) whole.past++;
  if (mAll > whole.maxNdc) { whole.maxNdc = mAll; whole.at = { gameMs: Math.round(t), x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }
  // the clamp near corners: the active corner's window
  const active = M.WG.cornerEvents.find((c) => c.state !== 'done' && c.state !== 'idle') ||
    M.WG.cornerEvents.find((c) => c.state === 'idle');
  for (let k = 1; k <= 6; k++) {
    const cs = clamp[k];
    const c = M.WG.cornerEvents[k - 1];
    const near = (c.state === 'idle' && active === c && M.PATH.BEND_S[k - 1] - p.x < 40) ||
      c.state === 'approach' || c.state === 'turning' ||
      (cs.doneAtMs !== null && t - cs.doneAtMs <= 4000);
    if (!near) continue;
    let m = -Infinity;
    for (const dy of heights) {
      const n = H.camera.project(H.camera.worldOf(p.x + reach, p.y + dy, actorDepth));
      if (!n.behind) m = Math.max(m, n.x);
    }
    cs.ticks++;
    if (m > 1) cs.past++;
    if (m > cs.maxNdc) { cs.maxNdc = m; cs.at = { gameMs: Math.round(t), state: c.state, x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }
  }
} });

const out = { tool: 'tools/simlab/framing/corner-approach.mjs', root: ROOT, viewport: vpName, size: [viewport.width, viewport.height],
  touch: !!viewport.touch, query, policy, offsets, endState: r.endState, finishedCorners: r.finishedCorners,
  silhouette: { reachTiles: reach, gain, heights }, whole, clamp, poses: poses.length };
if (opt('poses-out', null)) writeFileSync(resolve(opt('poses-out', null)), JSON.stringify({ viewport: vpName, query, poses }, null, 1));
if (opt('json', null)) writeFileSync(resolve(opt('json', null)), JSON.stringify(out, null, 1));
const rows = Object.entries(clamp).map(([k, c]) => `c${k}: max NDC ${c.maxNdc.toFixed(3)} (${c.at ? c.at.state : '-'}), past the edge ${c.past}/${c.ticks} ticks`);
console.log(`${vpName}${query ? ' ?' + query : ''}: ${r.endState} ${r.finishedCorners}/6, ${poses.length} poses; ` +
  `whole run: max NDC ${whole.maxNdc.toFixed(3)}, past the edge ${whole.past}/${whole.ticks} ticks\n  ` + rows.join('\n  '));
