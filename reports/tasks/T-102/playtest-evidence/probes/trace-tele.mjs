// QA scratch tool: trace RIG state over a tick window for one turnlab policy.
// usage: node trace-tele.mjs <tree> <policy> <viewport> <query> <fromTick> <toTick>
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [tree, policy, vpName, query, from, to] = process.argv.slice(2);
const proof = await import(pathToFileURL(join(tree, 'tools/simlab/lib/turn-proof.mjs')).href);
const viewport = proof.VIEWPORTS[vpName];
const rows = [];
let last = null;
const res = await proof.runTurnProof({ policy, viewport, query, onTick: (tick, H) => {
  const { M, player: p } = H;
  if (tick >= +from && tick <= +to) {
    rows.push({
      tick, gm: +M.T.gameMs.toFixed(0), x: +p.x.toFixed(3), y: +p.y.toFixed(3), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
      gr: p.grounded ? 1 : 0, hp: p.hp, lives: p.lives, trav: p.traversalState, st: M.ST.state,
      scroll: +M.T.scrollX.toFixed(2), corner: M.WG.cornerEvents.map((c) => c.state[0]).join(''),
    });
  }
} });
console.log('endState', res.endState, 'ticks', res.ticks, 'violations', JSON.stringify(res.counts || res.violationCounts || {}));
const step = Math.max(1, Math.floor(rows.length / 60));
for (let i = 0; i < rows.length; i += step) console.log(JSON.stringify(rows[i]));
