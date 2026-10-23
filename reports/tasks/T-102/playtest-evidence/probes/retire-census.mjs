// QA scratch probe: during HELD gates (state 'gate'), which encounter rows get
// gateBreakExit set while a gating body is still alive (i.e. before the gate's
// own normal break) - that is D2's retireUnseenGateRows firing.
// usage: node retire-census.mjs <tree> <viewport> [paceMs]
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const [tree, vpName, pace] = process.argv.slice(2);
const proof = await import(pathToFileURL(join(tree, 'tools/simlab/lib/turn-proof.mjs')).href);
const viewport = proof.VIEWPORTS[vpName];
const seen = new Map();   // id -> info
const perGate = {};
const res = await proof.runTurnProof({
  policy: 'run', viewport, gunnerMode: 'paced', paceMs: +(pace || 1400), maxTicks: 60 * 900,
  onTick: (tick, H) => {
    const { M } = H;
    const c = M.WG.activeCorner();
    if (!c || c.state !== 'gate') return;
    const rows = M.HO.hostiles.filter((e) => e.encounterKey === c.encounterKey);
    const gatingAlive = rows.some((e) => e.gating && !e.gateBreakExit);
    perGate[c.k] = perGate[c.k] || { gateTicks: 0, maxRows: 0, kinds: {} };
    perGate[c.k].gateTicks++;
    perGate[c.k].maxRows = Math.max(perGate[c.k].maxRows, rows.length);
    for (const e of rows) {
      perGate[c.k].kinds[e.kind] = (perGate[c.k].kinds[e.kind] || 0) + 0;   // ensure key
      if (e.gateBreakExit && gatingAlive) {
        const id = `${c.k}:${e.id ?? e.uid ?? rows.indexOf(e)}:${e.kind}`;
        if (!seen.has(id)) seen.set(id, { corner: c.k, kind: e.kind, x: +e.x.toFixed(2), gating: !!e.gating, tick,
          strip: [+M.E.sLeftEdge().toFixed(2), +M.E.sRightEdge().toFixed(2)] });
      }
    }
  },
});
console.log(JSON.stringify({ tree: tree.split('/').slice(-1)[0], viewport: vpName, endState: res.endState,
  corners: res.finishedCorners, retiredWhileGatingAlive: [...seen.values()], perGate }, null, 0));
