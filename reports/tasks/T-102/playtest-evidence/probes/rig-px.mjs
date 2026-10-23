// QA scratch tool: replay the T-102 pose collection and project RIG's chest and
// feet to pixel coordinates for each capture milestone. Read-only on the tree.
// usage: node rig-px.mjs <worktree> <desktop|phoneLandscape> > out.json
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const wt = process.argv[2];
const vpName = process.argv[3] || 'desktop';
const proof = await import(pathToFileURL(join(wt, 'tools/simlab/lib/turn-proof.mjs')).href);
const viewport = proof.VIEWPORTS[vpName];
const labels = ['approach', 't350', 't680', 't700', 'after1500'];
const pending = {};
for (let k = 1; k <= 6; k++) pending[k] = labels.slice();
const doneAt = {};
const out = [];
const snap = (H, k, label, tMs) => {
  const { M, player: p } = H;
  const px = (n, w, h) => ({ x: +((n.x + 1) / 2 * w).toFixed(1), y: +((1 - n.y) / 2 * h).toFixed(1), behind: n.behind });
  const w = viewport.width, h = viewport.height;
  const chest = H.camera.project(H.camera.worldOf(p.x, p.y + 0.85, 1.15));
  const feet = H.camera.project(H.camera.worldOf(p.x, p.y, 1.15));
  const head = H.camera.project(H.camera.worldOf(p.x, p.y + 1.7, 1.15));
  out.push({
    k, label, tMs, scrollX: M.T.scrollX, x: p.x, y: p.y, yawDeg: H.camera.yaw() / M.PATH.DEG,
    facet: H.camera.facet(), rigFoldVisible: H.camera.rigFoldVisible(),
    chest: px(chest, w, h), feet: px(feet, w, h), head: px(head, w, h),
    rigHeightPx: +(Math.abs(px(feet, w, h).y - px(head, w, h).y)).toFixed(1),
    rigHeightPct: +(100 * Math.abs(px(feet, w, h).y - px(head, w, h).y) / h).toFixed(2),
    chestNdc: { x: +chest.x.toFixed(3), y: +chest.y.toFixed(3) },
  });
};
await proof.runTurnProof({ policy: 'run', viewport, onTick: (tick, H) => {
  const { M, player: p } = H;
  for (let k = 1; k <= 6; k++) {
    const c = M.WG.cornerEvents[k - 1];
    const want = pending[k];
    if (!want.length) continue;
    const label = want[0];
    if (label === 'approach') {
      if (c.state === 'approach' && p.x >= M.PATH.BEND_S[k - 1] - 0.7) { snap(H, k, label, null); want.shift(); }
      else if (c.state !== 'idle' && c.state !== 'gate' && c.state !== 'approach') want.shift();
      continue;
    }
    if (c.state === 'done' && doneAt[k] === undefined) doneAt[k] = M.T.gameMs;
    if (label.startsWith('t') && c.state === 'turning') {
      const tMs = M.T.gameMs - c.tStart;
      if (tMs >= +label.slice(1)) { snap(H, k, label, tMs); want.shift(); }
    } else if (label.startsWith('t') && c.state === 'done') want.shift();
    else if (label.startsWith('after') && doneAt[k] !== undefined &&
        M.T.gameMs - doneAt[k] >= +label.slice(5)) { snap(H, k, label, null); want.shift(); }
  }
} });
process.stdout.write(JSON.stringify(out));
