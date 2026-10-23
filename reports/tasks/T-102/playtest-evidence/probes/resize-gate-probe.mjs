// QA scratch probe: during a HELD gate on a WIDE view, narrow the viewport
// (window drag / phone rotate) and see whether view-bound gate holders that
// were fully inside the strip get retired (gateBreakExit) - i.e. a gate skip.
// usage: node resize-gate-probe.mjs <tree> <startViewport> <narrowW> <narrowH> <corner> <waitGateTicks>
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [tree, vpName, nw, nh, cornerK, waitTicks] = process.argv.slice(2);
const proof = await import(pathToFileURL(join(tree, 'tools/simlab/lib/turn-proof.mjs')).href);
const viewport = proof.VIEWPORTS[vpName];
const K = +cornerK;
let gateTicks = 0, resized = false, snapTick = -1, before = null, after = null, later = null;
const snap = (H) => {
  const { M } = H;
  const c = M.WG.activeCorner();
  const left = M.E.sLeftEdge(), right = M.E.sRightEdge();
  return {
    strip: [+left.toFixed(2), +right.toFixed(2)],
    rows: M.HO.hostiles.filter((e) => c && e.encounterKey === c.encounterKey).map((e) => ({
      kind: e.kind, x: +e.x.toFixed(2), r: +Math.max(e.shotR || 0, e.hitR || 0).toFixed(2),
      gating: !!e.gating, exit: !!e.gateBreakExit, mat: M.T.gameMs >= e.enterUntil,
      insideStrip: !(e.x + Math.max(e.shotR || 0, e.hitR || 0) < left || e.x - Math.max(e.shotR || 0, e.hitR || 0) > right),
    })),
    state: c && c.state,
  };
};
const res = await proof.runTurnProof({
  policy: 'run', viewport, gunnerMode: 'paced', paceMs: 1400, maxTicks: 60 * 420,
  onTick: (tick, H) => {
    const { M } = H;
    const c = M.WG.activeCorner();
    if (c && c.k === K && c.state === 'gate') {
      gateTicks++;
      if (!resized && gateTicks === +waitTicks) {
        before = snap(H);
        H.setViewport(+nw, +nh);
        resized = true; snapTick = tick;
      }
      if (resized && tick === snapTick + 2) after = snap(H);
      if (resized && tick === snapTick + 30) later = snap(H);
    }
  },
});
console.log(JSON.stringify({ tree: tree.split('/').slice(-1)[0], start: vpName, narrowTo: `${nw}x${nh}`, corner: K, gateTicksBeforeResize: +waitTicks,
  endState: res.endState, before, after, later }, null, 1));
