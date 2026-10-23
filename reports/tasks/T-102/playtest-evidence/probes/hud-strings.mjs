// QA scratch probe: the exact gate-line strings the shipped HUD would print during a played run.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const [tree, vpName, gunner, pace] = process.argv.slice(2);
const proof = await import(pathToFileURL(join(tree, 'tools/simlab/lib/turn-proof.mjs')).href);
const seen = new Map();
let nGate = 0;
const res = await proof.runTurnProof({ policy: 'run', viewport: proof.VIEWPORTS[vpName], gunnerMode: gunner, paceMs: +pace, maxTicks: 60 * 900,
  onTick: (tick, H) => {
    const { M } = H; const c = M.WG.activeCorner();
    if (!c || c.state !== 'gate') return;
    nGate++;
    const need = M.WAVES.gateRequirement(M.HO.hostiles, c.encounterKey, M.T.gameMs, H.CONFIG.wasp.enterMs);
    const txt = `WAVE ${c.k}/${H.CONFIG.path.faces} · ${c.phase} · ` + M.WAVES.gateRequirementText(need);
    const e = seen.get(txt) || { txt, len: txt.length, ticks: 0, firstTick: tick };
    e.ticks++; seen.set(txt, e);
  } });
const rows = [...seen.values()].sort((a, b) => b.len - a.len);
console.log(JSON.stringify({ viewport: vpName, gunner, pace: +pace, endState: res.endState, gateTicks: nGate, distinct: rows.length,
  longest: rows.slice(0, 6), all: rows.map((r) => `${r.len}|${r.ticks}|${r.txt}`) }));
